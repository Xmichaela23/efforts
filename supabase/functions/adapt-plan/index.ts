// =============================================================================
// ADAPT-PLAN EDGE FUNCTION
// =============================================================================
// Reads response model signals (1RM trends, RIR, pace/efficiency) and generates
// plan adaptation suggestions. Handles both:
//   - Strength: weight auto-progression via plan_adjustments
//   - Endurance: pace/power target updates via user_baselines
//
// Input: { user_id, action?: 'suggest' | 'accept' | 'dismiss' | 'auto' | 'auto_batch', suggestion_id?, cron_secret? }
// Output (suggest): { suggestions, plan_id, strength_relayout? } — strength_relayout matches auto-adapt merge when fingerprint differs.
// Output (auto): { action: 'auto', adaptations, relayout_applied, relayout_week, previous_sig, new_sig, sessions_replaced }
// accept: suggestion_id `strength_relayout` runs the same persist path as auto-adapt.
// auto_batch: cron-only; body.cron_secret must equal env ADAPT_PLAN_CRON_SECRET. Runs auto-adapt per distinct active-plan user (cap ADAPT_PLAN_BATCH_MAX_USERS, default 250).
// auto is also invoked fire-and-forget from ingest-activity after each successful upsert (disable via ADAPT_PLAN_AUTO_ON_INGEST=false on ingest).
//
// Ingest-triggered auto is safe by design (not accidental): logging a workout does not mutate
// plans.sessions_by_week / run shape, so primaryScheduleSignature is unchanged → fingerprint matches
// stored strength_primary_sig_by_week → persistStrengthRelayoutIfNeeded is a no-op. Relayout only
// runs when plan JSON for the current week actually differs from the stored fingerprint (editor,
// reschedule, generator, first-time sig seed, etc.).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Phase, PhaseStructure } from '../generate-run-plan/types.ts';
import {
  buildStrengthSessionsForPlanWeek,
  extractPrimaryScheduleForWeekSessions,
  primaryScheduleSignature,
} from '../generate-run-plan/strength-overlay.ts';
import {
  getLatestAthleteMemory,
  resolveMemoryContextForPlanning,
  type PlanningMemoryContext,
} from '../_shared/athlete-memory.ts';
import {
  resolveProfile,
  resolvePhaseRule,
  getTargetRir,
  isLowerBodyLift,
  type StrengthProtocolProfile,
  type PhaseRule,
} from '../_shared/strength-profiles.ts';
import { getArcContext, type ArcContext } from '../_shared/arc-context.ts';
import { isAcwrFatiguedSignal, type AcwrWeekIntent } from '../_shared/acwr-state.ts';
import type { ArcPlanPhaseBucket } from '../_shared/arc-narrative-state.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
};

type AdaptationSuggestion = {
  id: string;
  type:
    | 'strength_progression'
    | 'strength_deload'
    | 'endurance_pace_update'
    | 'endurance_deload'
    | 'strength_relayout';
  title: string;
  description: string;
  exercise?: string;
  current_value?: number;
  suggested_value?: number;
  unit: string;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
};

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function parseJson<T = any>(val: any): T | null {
  if (val == null) return null;
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val as T);
  } catch {
    return val as T;
  }
}

/** Default 250; set ADAPT_PLAN_BATCH_MAX_USERS to raise without deploy. Capped at 5000. */
function parseBatchMaxUsers(): number {
  const raw = Deno.env.get('ADAPT_PLAN_BATCH_MAX_USERS');
  const n = raw != null && raw !== '' ? parseInt(raw, 10) : 250;
  if (!Number.isFinite(n) || n < 1) return 250;
  return Math.min(n, 5000);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { user_id, action = 'suggest', suggestion_id, cron_secret } = payload;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().slice(0, 10);
    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

    // =========================================================================
    // AUTO-ADAPT BATCH (cron): all users with an active plan — ambient relayout + adjustments
    // =========================================================================
    if (action === 'auto_batch') {
      const expected = Deno.env.get('ADAPT_PLAN_CRON_SECRET');
      if (!expected || cron_secret !== expected) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const batchResult = await autoAdaptAllActiveUsers(supabase, today, fourWeeksAgo, parseBatchMaxUsers());
      return new Response(JSON.stringify(batchResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // AUTO-ADAPT: Apply safe adaptations automatically (Phase 2)
    // =========================================================================
    if (action === 'auto') {
      const result = await autoAdapt(supabase, user_id, today, fourWeeksAgo);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // ACCEPT / DISMISS actions
    // =========================================================================
    if (action === 'accept' && suggestion_id) {
      const result = await acceptSuggestion(supabase, user_id, suggestion_id, today);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'dismiss' && suggestion_id) {
      return new Response(JSON.stringify({ dismissed: suggestion_id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // SUGGEST: Generate adaptation suggestions
    // =========================================================================

    const focusDateISO = today;
    let arc: ArcContext | null = null;
    try {
      arc = await getArcContext(supabase, user_id, focusDateISO);
    } catch (e) {
      console.warn('[adapt-plan] Arc context load failed (non-fatal):', e);
    }
    const suggestionGates = buildAdaptSuggestionGates(arc);

    // 1. Get active plan (full row for strength relayout preview — matches auto-adapt payload)
    const { data: plans } = await supabase
      .from('plans')
      .select('id,name,config,sessions_by_week,duration_weeks,current_week')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .limit(1);
    const activePlan = plans?.[0] || null;

    const memoryForRelayout = activePlan
      ? await loadPlanningMemoryForRelayout(supabase, user_id)
      : undefined;

    const relayoutAnalysis = activePlan
      ? analyzeStrengthRelayoutForCurrentWeek(activePlan as StrengthRelayoutPlanRow)
      : { ok: false };

    let strength_relayout: {
      week_key: string;
      schedule_signature: string;
      previous_signature: string | null | undefined;
      merged_week_sessions: any[];
      applies_same_as_auto_adapt: true;
    } | null = null;

    if (
      relayoutAnalysis.ok &&
      relayoutAnalysis.prev != null &&
      relayoutAnalysis.sig !== relayoutAnalysis.prev
    ) {
      const { merged } = buildStrengthRelayoutSessions(relayoutAnalysis, memoryForRelayout);
      strength_relayout = {
        week_key: relayoutAnalysis.weekKey,
        schedule_signature: relayoutAnalysis.sig,
        previous_signature: relayoutAnalysis.prev,
        merged_week_sessions: merged,
        applies_same_as_auto_adapt: true,
      };
    }

    // 2. Get user baselines
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('performance_numbers,learned_fitness,units')
      .eq('user_id', user_id)
      .maybeSingle();

    const perf = parseJson(ub?.performance_numbers) || {};
    const learned = parseJson(ub?.learned_fitness) || {};
    const isMetric = String(ub?.units || 'imperial').toLowerCase() === 'metric';

    // 3. Get exercise_log for strength trends (last 4 weeks)
    const { data: exerciseLogs } = await supabase
      .from('exercise_log')
      .select('exercise_name,canonical_name,estimated_1rm,avg_rir,workout_date,sets_count')
      .eq('user_id', user_id)
      .gte('workout_date', fourWeeksAgo)
      .lte('workout_date', today)
      .order('workout_date', { ascending: true });

    // 4. Get existing active adjustments to avoid duplicates
    const { data: existingAdj } = await supabase
      .from('plan_adjustments')
      .select('exercise_name,applies_from,status')
      .eq('user_id', user_id)
      .eq('status', 'active');

    const suggestions: AdaptationSuggestion[] = [];

    // =========================================================================
    // STRENGTH PROGRESSION SUGGESTIONS (protocol-aware, phase-gated)
    // =========================================================================
    const planCfg = activePlan?.config || {};
    const profile = resolveProfile(planCfg.strength_protocol);
    const currentWeek = Number(activePlan?.current_week) || 1;
    const phaseTag = Array.isArray(planCfg.plan_contract_v1?.phase_by_week)
      ? planCfg.plan_contract_v1.phase_by_week[currentWeek - 1]
      : null;
    const phase = resolvePhaseRule(phaseTag);

    const liftGroups = groupByLift(exerciseLogs || []);

    for (const [liftName, sessions] of Object.entries(liftGroups)) {
      if (sessions.length < 3) continue;

      const recent = sessions.slice(-3);
      const earlier = sessions.slice(0, Math.max(1, sessions.length - 3));

      const recentAvg1rm = avg(recent.map((s) => s.estimated_1rm));
      const earlierAvg1rm = avg(earlier.map((s) => s.estimated_1rm));
      const recentRirs = recent.map((s) => s.avg_rir).filter((r) => r != null) as number[];
      const recentAvgRir = avg(recentRirs);

      if (recentAvg1rm == null || earlierAvg1rm == null || earlierAvg1rm <= 0) continue;

      const gainPct = ((recentAvg1rm - earlierAvg1rm) / earlierAvg1rm) * 100;

      const alreadyAdjusted = (existingAdj || []).some(
        (a) => a.exercise_name.toLowerCase() === liftName.toLowerCase() && a.status === 'active',
      );
      if (alreadyAdjusted) continue;

      const targetRir = getTargetRir(profile, liftName);
      const deviation = recentAvgRir != null ? recentAvgRir - targetRir : null;

      // Progression: e1RM up by protocol threshold AND deviation shows headroom
      if (
        phase.allowProgress &&
        gainPct >= profile.progression.minGainPct * 100 &&
        (deviation == null || deviation >= profile.progression.minDeviation)
      ) {
        const baseline1rm = Number(perf[liftName] || perf[liftName.replace(/ /g, '')] || earlierAvg1rm);
        const currentWorkingWeight = roundTo5(baseline1rm * 0.75);
        const suggestedWeight = roundTo5(recentAvg1rm * 0.75);

        if (suggestedWeight > currentWorkingWeight && suggestionGates.allowLoadIncrease) {
          suggestions.push({
            id: `str_prog_${liftName.replace(/\s/g, '_').toLowerCase()}`,
            type: 'strength_progression',
            title: `Increase ${liftName} weight`,
            description: `Your estimated 1RM has increased ${gainPct.toFixed(0)}%. Working weight can go up.`,
            exercise: liftName,
            current_value: currentWorkingWeight,
            suggested_value: suggestedWeight,
            unit: isMetric ? 'kg' : 'lbs',
            confidence: gainPct >= 8 ? 'high' : 'medium',
            reason: `1RM ${earlierAvg1rm.toFixed(0)} → ${recentAvg1rm.toFixed(0)} (+${gainPct.toFixed(0)}%)${deviation != null ? `, RIR deviation ${deviation > 0 ? '+' : ''}${deviation.toFixed(1)} vs target ${targetRir}` : ''}`,
          });
        }
      }

      // Deload: deviation below threshold (adjusted by phase sensitivity)
      const deloadThreshold = profile.deload.maxDeviation * phase.deloadSensitivity;
      if (
        deviation != null &&
        deviation <= deloadThreshold &&
        recentRirs.length >= profile.deload.minSessions
      ) {
        const baseline1rm = Number(perf[liftName] || earlierAvg1rm);
        const currentWorkingWeight = roundTo5(baseline1rm * 0.75);
        const suggestedWeight = roundTo5(currentWorkingWeight * 0.9);

        if (!suggestionGates.allowBackingOff) continue;

        suggestions.push({
          id: `str_deload_${liftName.replace(/\s/g, '_').toLowerCase()}`,
          type: 'strength_deload',
          title: `Reduce ${liftName} weight`,
          description: `Your RIR is consistently below target. A small deload will help you recover.`,
          exercise: liftName,
          current_value: currentWorkingWeight,
          suggested_value: suggestedWeight,
          unit: isMetric ? 'kg' : 'lbs',
          confidence: 'medium',
          reason: `RIR deviation ${deviation.toFixed(1)} vs target ${targetRir} (threshold ${deloadThreshold.toFixed(1)})`,
        });
      }
    }

    // =========================================================================
    // ENDURANCE PACE/POWER SUGGESTIONS
    // =========================================================================
    const learnedEasyPace = learned?.run_easy_pace_sec_per_km;
    const learnedFtp = learned?.ride_ftp_estimated;

    // Easy pace update: if learned pace differs from manual by 5%+
    if (learnedEasyPace?.value && learnedEasyPace?.confidence) {
      const confNum = learnedEasyPace.confidence === 'high' ? 0.9 : learnedEasyPace.confidence === 'medium' ? 0.65 : 0.4;
      if (confNum >= 0.65) {
        const learnedSecPerKm = Number(learnedEasyPace.value);
        const manualEasyMmSs = perf.easyPace;
        if (manualEasyMmSs) {
          const manualParts = String(manualEasyMmSs).split(':');
          if (manualParts.length === 2) {
            const manualSecPerMi = Number(manualParts[0]) * 60 + Number(manualParts[1]);
            const learnedSecPerMi = Math.round(learnedSecPerKm * 1.60934);
            const deltaPct = Math.abs(learnedSecPerMi - manualSecPerMi) / manualSecPerMi;

            if (deltaPct >= 0.05) {
              const fmtPace = (secs: number) => {
                const m = Math.floor(secs / 60);
                const s = Math.round(secs % 60);
                return `${m}:${String(s).padStart(2, '0')}`;
              };

              const paceHarder = learnedSecPerMi < manualSecPerMi;
              const blocked =
                (paceHarder && !suggestionGates.allowLoadIncrease) ||
                (!paceHarder && !suggestionGates.allowBackingOff);
              if (!blocked) {
                suggestions.push({
                  id: 'end_easy_pace',
                  type: 'endurance_pace_update',
                  title: 'Update easy run pace',
                  description: `Your actual easy pace has ${learnedSecPerMi < manualSecPerMi ? 'improved' : 'slowed'}. Updating will better calibrate your workouts.`,
                  current_value: manualSecPerMi,
                  suggested_value: learnedSecPerMi,
                  unit: '/mi',
                  confidence: confNum >= 0.9 ? 'high' : 'medium',
                  reason: `Learned ${fmtPace(learnedSecPerMi)}/mi from recent runs vs manual ${fmtPace(manualSecPerMi)}/mi`,
                });
              }
            }
          }
        }
      }
    }

    // FTP update
    if (learnedFtp?.value && learnedFtp?.confidence) {
      const confNum = learnedFtp.confidence === 'high' ? 0.9 : learnedFtp.confidence === 'medium' ? 0.65 : 0.4;
      const manualFtp = Number(perf.ftp);
      const learnedVal = Number(learnedFtp.value);
      if (confNum >= 0.65 && Number.isFinite(manualFtp) && manualFtp > 0 && Number.isFinite(learnedVal)) {
        const deltaPct = Math.abs(learnedVal - manualFtp) / manualFtp;
        if (deltaPct >= 0.05) {
          const ftpHarder = learnedVal > manualFtp;
          const blocked =
            (ftpHarder && !suggestionGates.allowLoadIncrease) ||
            (!ftpHarder && !suggestionGates.allowBackingOff);
          if (!blocked) {
            suggestions.push({
              id: 'end_ftp',
              type: 'endurance_pace_update',
              title: 'Update cycling FTP',
              description: `Your estimated FTP has ${learnedVal > manualFtp ? 'increased' : 'decreased'}. Power targets will be more accurate.`,
              current_value: Math.round(manualFtp),
              suggested_value: Math.round(learnedVal),
              unit: 'W',
              confidence: confNum >= 0.9 ? 'high' : 'medium',
              reason: `Learned ${Math.round(learnedVal)}W from recent rides vs manual ${Math.round(manualFtp)}W`,
            });
          }
        }
      }
    }

    if (strength_relayout) {
      suggestions.push({
        id: 'strength_relayout',
        type: 'strength_relayout',
        title: 'Update strength to match this week',
        description:
          'Your run pattern changed (for example taper or recovery). Strength is replanned so it sits on easier days relative to your long run and quality work. Tap Got it to save — same logic as background auto-adapt.',
        unit: 'plan',
        confidence: 'high',
        reason: `Week ${strength_relayout.week_key}: schedule fingerprint changed vs stored baseline.`,
      });
    }

    return new Response(
      JSON.stringify({
        suggestions,
        plan_id: activePlan?.id || null,
        strength_relayout,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (e: any) {
    console.error('[adapt-plan] error:', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// =============================================================================
// Helpers
// =============================================================================

/** Map Arc plan phase → ACWR week-intent (build/peak/taper share methodology thresholds). */
function mapPlanPhaseToAcwrWeekIntent(phase: ArcPlanPhaseBucket | null | undefined): AcwrWeekIntent {
  switch (phase) {
    case 'build':
      return 'build';
    case 'taper':
      return 'taper';
    case 'recovery':
      return 'recovery';
    case 'peak':
      return 'peak';
    case 'base':
      return 'baseline';
    default:
      return 'unknown';
  }
}

/**
 * Arc-grounded gates for suggest (non-destructive). When `arc` is null, both flags stay permissive.
 * Uses `latest_snapshot` (acwr, adherence) and `arc_narrative_context` (phase/mode).
 */
function buildAdaptSuggestionGates(arc: ArcContext | null): {
  allowLoadIncrease: boolean;
  allowBackingOff: boolean;
} {
  if (!arc) {
    return { allowLoadIncrease: true, allowBackingOff: true };
  }

  const snap = arc.latest_snapshot as Record<string, unknown> | null | undefined;
  const nc = arc.arc_narrative_context;

  const acwrNum = snap && snap.acwr != null ? Number(snap.acwr) : NaN;
  const acwr = Number.isFinite(acwrNum) ? acwrNum : null;

  const weekIntent = mapPlanPhaseToAcwrWeekIntent(nc?.plan_phase_normalized);

  const narrativeBlocksIncrease =
    !!nc &&
    (nc.plan_phase_normalized === 'taper' ||
      nc.plan_phase_normalized === 'recovery' ||
      nc.mode === 'taper_read' ||
      nc.mode === 'recovery_read');

  const acwrFatigued = isAcwrFatiguedSignal(acwr, false, weekIntent);

  const adherenceRaw = snap && snap.adherence_pct != null ? Number(snap.adherence_pct) : NaN;
  const completingWell = !Number.isFinite(adherenceRaw) || adherenceRaw >= 0.8;

  let allowLoadIncrease = true;
  if (narrativeBlocksIncrease) allowLoadIncrease = false;
  else if (acwrFatigued) allowLoadIncrease = false;
  else if (!completingWell) allowLoadIncrease = false;

  const inBuildPhase =
    !!nc &&
    (nc.plan_phase_normalized === 'build' ||
      nc.plan_phase_normalized === 'base' ||
      nc.mode === 'build_read');

  let allowBackingOff = true;
  if (inBuildPhase && !acwrFatigued) allowBackingOff = false;

  return { allowLoadIncrease, allowBackingOff };
}

function groupByLift(logs: any[]): Record<string, Array<{ estimated_1rm: number; avg_rir: number | null; workout_date: string }>> {
  const groups: Record<string, Array<{ estimated_1rm: number; avg_rir: number | null; workout_date: string }>> = {};
  for (const log of logs) {
    const name = String(log.canonical_name || log.exercise_name || '').trim();
    if (!name) continue;
    const e1rm = Number(log.estimated_1rm);
    if (!Number.isFinite(e1rm) || e1rm <= 0) continue;
    if (!groups[name]) groups[name] = [];
    groups[name].push({
      estimated_1rm: e1rm,
      avg_rir: log.avg_rir != null ? Number(log.avg_rir) : null,
      workout_date: String(log.workout_date || ''),
    });
  }
  return groups;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Minimal phase structure for a single week (overlay / relayout). */
function minimalPhaseStructureForWeek(
  weekNum: number,
  phaseByWeek: string[] | undefined,
): PhaseStructure {
  const tag = phaseByWeek?.[weekNum - 1] ?? 'build';
  const recovery = tag === 'recovery';
  const name =
    tag === 'taper' ? 'Taper' :
    tag === 'recovery' ? 'Recovery' :
    tag === 'base' ? 'Base' : 'Build';
  const phase: Phase = {
    name,
    start_week: weekNum,
    end_week: weekNum,
    weeks_in_phase: 1,
    focus: '',
    quality_density: 'low',
    volume_multiplier: name === 'Taper' ? 0.6 : 1,
  };
  return {
    phases: [phase],
    recovery_weeks: recovery ? [weekNum] : [],
  };
}

/**
 * Single-week phase stub can mis-read `phase_by_week` near the race. If relayout fires in the
 * last two plan weeks, force a taper-shaped phase so strength volume/frequency still steps down.
 */
function phaseStructureForRelayoutWeek(
  weekNum: number,
  totalWeeks: number,
  phaseByWeek: string[] | undefined,
): PhaseStructure {
  const inLateRaceWindow = totalWeeks >= 2 && weekNum >= totalWeeks - 1;
  if (inLateRaceWindow) {
    return {
      phases: [
        {
          name: 'Taper',
          start_week: weekNum,
          end_week: weekNum,
          weeks_in_phase: 1,
          focus: '',
          quality_density: 'low',
          volume_multiplier: 0.6,
        },
      ],
      recovery_weeks: [],
    };
  }
  return minimalPhaseStructureForWeek(weekNum, phaseByWeek);
}

type StrengthRelayoutPlanRow = {
  id: string;
  config: Record<string, any> | null;
  sessions_by_week: Record<string, any[]> | null;
  duration_weeks?: number | null;
  current_week?: number | null;
};

type StrengthRelayoutAnalysis =
  | { ok: false }
  | {
      ok: true;
      planId: string;
      weekNum: number;
      weekKey: string;
      sig: string;
      prev: string | null | undefined;
      endurance: any[];
      sbw: Record<string, any[]>;
      cfg: Record<string, any>;
      strengthFreq: 2 | 3;
      totalWeeks: number;
      contract: any;
    };

/** Shared fingerprint + eligibility logic for auto-adapt, suggest preview, and accept. */
function analyzeStrengthRelayoutForCurrentWeek(planRow: StrengthRelayoutPlanRow): StrengthRelayoutAnalysis {
  const cfg = planRow.config || {};
  const strengthFreq = Number(cfg.strength_frequency ?? 0);
  if (strengthFreq !== 2 && strengthFreq !== 3) return { ok: false };

  const contract = cfg.plan_contract_v1;
  if (contract?.strength != null && contract.strength.enabled === false) {
    return { ok: false };
  }

  const weekNum = Number(planRow.current_week) || 1;
  const weekKey = String(weekNum);
  const sbw = { ...(planRow.sessions_by_week || {}) };
  const weekSessions = sbw[weekKey] || [];
  const endurance = weekSessions.filter((s: any) => s?.type !== 'strength');
  if (endurance.length === 0) return { ok: false };

  const sched = extractPrimaryScheduleForWeekSessions(endurance);
  const sig = primaryScheduleSignature(sched);
  const prev = cfg.strength_primary_sig_by_week?.[weekKey];

  const totalWeeks =
    Number(planRow.duration_weeks) ||
    Math.max(1, ...Object.keys(sbw).map(k => parseInt(k, 10)).filter(n => Number.isFinite(n)));

  return {
    ok: true,
    planId: planRow.id,
    weekNum,
    weekKey,
    sig,
    prev,
    endurance,
    sbw,
    cfg,
    strengthFreq: strengthFreq as 2 | 3,
    totalWeeks,
    contract,
  };
}

function buildStrengthRelayoutSessions(
  a: Extract<StrengthRelayoutAnalysis, { ok: true }>,
  memoryContext?: PlanningMemoryContext,
): { merged: any[]; newStrength: any[] } {
  const approach = String(a.cfg.approach || 'sustainable');
  const methodology =
    approach === 'performance_build' ? 'jack_daniels_performance' : 'hal_higdon_complete';

  const phaseStructure = phaseStructureForRelayoutWeek(
    a.weekNum,
    a.totalWeeks,
    a.contract?.phase_by_week,
  );
  const tier = a.cfg.strength_tier === 'strength_power' ? 'barbell' : 'bodyweight';

  const newStrength = buildStrengthSessionsForPlanWeek({
    weekNumber: a.weekNum,
    totalWeeks: a.totalWeeks,
    enduranceSessions: a.endurance,
    phaseStructure,
    frequency: a.strengthFreq,
    tier,
    protocolId: a.cfg.strength_protocol ?? undefined,
    methodology,
    noDoubles: Boolean(a.cfg.no_doubles),
    isMetric: String(a.cfg.units || '').toLowerCase() === 'metric',
    memoryContext,
  });

  return { merged: [...a.endurance, ...newStrength], newStrength };
}

async function loadPlanningMemoryForRelayout(
  supabase: any,
  userId: string,
): Promise<PlanningMemoryContext | undefined> {
  try {
    const row = await getLatestAthleteMemory(supabase, userId);
    return resolveMemoryContextForPlanning(row);
  } catch (e) {
    console.warn('[adapt-plan] athlete_memory load for relayout (non-fatal):', e);
    return undefined;
  }
}

/**
 * When the current week's run shape (long/quality/easy) changes vs last adapt,
 * re-place strength sessions for that week only.
 *
 * Loads `athlete_memory` when possible so injury_hotspots, taper_sensitivity, interference_risk,
 * and 1RM resolution match generate-run-plan — relayout is schedule-triggered today, but hotspots
 * still affect durability vs neural placement when the week is rebuilt.
 */
type StrengthRelayoutPersistResult = {
  applied: boolean;
  detail?: string;
  relayout_week: number | null;
  previous_sig: string | null;
  new_sig: string | null;
  sessions_replaced: number | null;
};

function emptyStrengthRelayoutTelemetry(): Omit<StrengthRelayoutPersistResult, 'applied' | 'detail'> {
  return {
    relayout_week: null,
    previous_sig: null,
    new_sig: null,
    sessions_replaced: null,
  };
}

async function persistStrengthRelayoutIfNeeded(
  supabase: any,
  analysis: StrengthRelayoutAnalysis,
  memoryContext?: PlanningMemoryContext,
): Promise<StrengthRelayoutPersistResult> {
  const empty = (): StrengthRelayoutPersistResult => ({
    applied: false,
    ...emptyStrengthRelayoutTelemetry(),
  });

  if (!analysis.ok) return empty();

  const a = analysis;

  if (a.prev != null && a.sig === a.prev) return empty();

  if (a.prev == null) {
    const nextConfig = {
      ...a.cfg,
      strength_primary_sig_by_week: {
        ...(a.cfg.strength_primary_sig_by_week || {}),
        [a.weekKey]: a.sig,
      },
    };
    await supabase
      .from('plans')
      .update({ config: nextConfig, updated_at: new Date().toISOString() })
      .eq('id', a.planId);
    return empty();
  }

  const { merged, newStrength } = buildStrengthRelayoutSessions(a, memoryContext);
  const relayoutAt = new Date().toISOString();
  const nextConfig = {
    ...a.cfg,
    strength_primary_sig_by_week: {
      ...(a.cfg.strength_primary_sig_by_week || {}),
      [a.weekKey]: a.sig,
    },
    last_relayout_at: relayoutAt,
    last_relayout_week: a.weekNum,
  };

  const { error } = await supabase
    .from('plans')
    .update({
      sessions_by_week: { ...a.sbw, [a.weekKey]: merged },
      config: nextConfig,
      updated_at: relayoutAt,
    })
    .eq('id', a.planId);

  if (error) {
    console.error('[adapt-plan] strength relayout failed:', error);
    return empty();
  }

  return {
    applied: true,
    detail: `Strength placement updated for week ${a.weekKey} (run schedule shape changed).`,
    relayout_week: a.weekNum,
    previous_sig: a.prev,
    new_sig: a.sig,
    sessions_replaced: newStrength.length,
  };
}

async function maybeRelayoutStrengthForCurrentWeek(
  supabase: any,
  planRow: StrengthRelayoutPlanRow,
  memoryContext?: PlanningMemoryContext,
): Promise<StrengthRelayoutPersistResult> {
  const analysis = analyzeStrengthRelayoutForCurrentWeek(planRow);
  return persistStrengthRelayoutIfNeeded(supabase, analysis, memoryContext);
}

async function acceptSuggestion(
  supabase: any,
  userId: string,
  suggestionId: string,
  today: string,
): Promise<{ applied: boolean; type: string; detail: string }> {
  // Suggestion IDs encode the type: str_prog_<lift>, str_deload_<lift>, end_easy_pace, end_ftp, strength_relayout
  if (suggestionId === 'strength_relayout') {
    const { data: plans } = await supabase
      .from('plans')
      .select('id, config, sessions_by_week, duration_weeks, current_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);
    const planRow = plans?.[0] as StrengthRelayoutPlanRow | undefined;
    if (!planRow) {
      return { applied: false, type: 'strength_relayout', detail: 'No active plan' };
    }
    const memoryCtx = await loadPlanningMemoryForRelayout(supabase, userId);
    const analysis = analyzeStrengthRelayoutForCurrentWeek(planRow);
    const r = await persistStrengthRelayoutIfNeeded(supabase, analysis, memoryCtx);
    if (r.applied) {
      try {
        await supabase.functions.invoke('materialize-plan', {
          body: { training_plan_id: planRow.id },
        });
      } catch (e) {
        console.error('[adapt-plan] materialize after strength_relayout:', e);
      }
    }
    return {
      applied: r.applied,
      type: 'strength_relayout',
      detail:
        r.detail ||
        (r.applied ? 'Strength placement updated' : 'No relayout needed (schedule already matches).'),
    };
  }

  if (suggestionId.startsWith('str_prog_') || suggestionId.startsWith('str_deload_')) {
    const liftKey = suggestionId.replace(/^str_(prog|deload)_/, '');
    const liftName = liftKey.replace(/_/g, ' ');
    const isDeload = suggestionId.startsWith('str_deload_');

    // Get the learned 1RM for this lift
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('learned_fitness,performance_numbers,units')
      .eq('user_id', userId)
      .maybeSingle();

    const learned = parseJson(ub?.learned_fitness) || {};
    const perf = parseJson(ub?.performance_numbers) || {};
    const s1rms = learned?.strength_1rms || {};
    const isMetric = String(ub?.units || 'imperial').toLowerCase() === 'metric';

    // Find matching 1RM data
    const liftData = Object.entries(s1rms).find(
      ([k]) => k.toLowerCase().replace(/_/g, ' ') === liftName.toLowerCase(),
    );

    let factor: number;
    if (isDeload) {
      factor = 0.9;
    } else {
      const learned1rm = liftData ? Number((liftData[1] as any)?.value) : null;
      const baseline1rm = Number(perf[liftKey] || perf[liftName.replace(/ /g, '')] || 0);
      if (learned1rm && baseline1rm && baseline1rm > 0) {
        factor = learned1rm / baseline1rm;
      } else {
        factor = 1.05;
      }
    }

    // Get active plan
    const { data: plans } = await supabase
      .from('plans')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);
    const planId = plans?.[0]?.id || null;

    // Expire old adjustments for this exercise
    await supabase
      .from('plan_adjustments')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .ilike('exercise_name', liftName)
      .eq('status', 'active');

    // Insert new adjustment
    await supabase.from('plan_adjustments').insert({
      user_id: userId,
      plan_id: planId,
      exercise_name: liftName,
      adjustment_factor: Math.round(factor * 1000) / 1000,
      applies_from: today,
      reason: isDeload ? 'Auto-deload: RIR dropped below safe threshold' : 'Auto-progression: 1RM increased',
      status: 'active',
    });

    return {
      applied: true,
      type: isDeload ? 'strength_deload' : 'strength_progression',
      detail: `${liftName} weight ${isDeload ? 'reduced' : 'increased'} by ${Math.round((factor - 1) * 100)}%`,
    };
  }

  if (suggestionId === 'end_easy_pace') {
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('performance_numbers,learned_fitness')
      .eq('user_id', userId)
      .maybeSingle();

    const perf = parseJson(ub?.performance_numbers) || {};
    const learned = parseJson(ub?.learned_fitness) || {};
    const learnedVal = Number(learned?.run_easy_pace_sec_per_km?.value);

    if (Number.isFinite(learnedVal) && learnedVal > 0) {
      const learnedSecPerMi = Math.round(learnedVal * 1.60934);
      const m = Math.floor(learnedSecPerMi / 60);
      const s = Math.round(learnedSecPerMi % 60);
      const newPace = `${m}:${String(s).padStart(2, '0')}`;

      await supabase
        .from('user_baselines')
        .update({
          performance_numbers: { ...perf, easyPace: newPace },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return { applied: true, type: 'endurance_pace_update', detail: `Easy pace updated to ${newPace}/mi` };
    }

    return { applied: false, type: 'endurance_pace_update', detail: 'No learned pace available' };
  }

  if (suggestionId === 'end_ftp') {
    const { data: ub } = await supabase
      .from('user_baselines')
      .select('performance_numbers,learned_fitness')
      .eq('user_id', userId)
      .maybeSingle();

    const perf = parseJson(ub?.performance_numbers) || {};
    const learned = parseJson(ub?.learned_fitness) || {};
    const learnedVal = Number(learned?.ride_ftp_estimated?.value);

    if (Number.isFinite(learnedVal) && learnedVal > 0) {
      await supabase
        .from('user_baselines')
        .update({
          performance_numbers: { ...perf, ftp: Math.round(learnedVal) },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      return { applied: true, type: 'endurance_pace_update', detail: `FTP updated to ${Math.round(learnedVal)}W` };
    }

    return { applied: false, type: 'endurance_pace_update', detail: 'No learned FTP available' };
  }

  return { applied: false, type: 'unknown', detail: `Unknown suggestion: ${suggestionId}` };
}

// =============================================================================
// AUTO-ADAPT: Phase 2 automatic adaptations within guardrails
// =============================================================================
// Rules (protocol-aware, phase-gated):
// - Strength progression: e1RM gain >= protocol.minGainPct AND RIR deviation
//   (actual - target) >= protocol.minDeviation AND phase.allowProgress
// - Strength deload: RIR deviation <= protocol.maxDeviation * phase.deloadSensitivity
//   for protocol.minSessions consecutive sessions
// - Endurance targets update when: learned value differs 7%+ with high confidence
// - Recovery insertion when: response model says "overreaching" with high confidence
// =============================================================================

async function autoAdaptAllActiveUsers(
  supabase: any,
  today: string,
  fourWeeksAgo: string,
  maxUsers: number,
): Promise<{
  users_scanned: number;
  total_distinct_users: number;
  batch_truncated: boolean;
  users_with_applied_adaptation: number;
  errors: string[];
}> {
  const { data: rows, error } = await supabase
    .from('plans')
    .select('user_id')
    .eq('status', 'active');
  if (error) {
    return {
      users_scanned: 0,
      total_distinct_users: 0,
      batch_truncated: false,
      users_with_applied_adaptation: 0,
      errors: [error.message],
    };
  }
  const distinct = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id).filter(Boolean))];
  const batchTruncated = distinct.length > maxUsers;
  if (batchTruncated) {
    console.warn(
      `[adapt-plan] auto_batch: ${distinct.length} distinct users with active plans; processing only first ${maxUsers}. Set ADAPT_PLAN_BATCH_MAX_USERS or run additional batches.`,
    );
  }
  const ids = distinct.slice(0, maxUsers);
  let usersWithApplied = 0;
  const errors: string[] = [];
  for (const uid of ids) {
    try {
      const r = await autoAdapt(supabase, uid, today, fourWeeksAgo);
      if (r.adaptations.some(a => a.applied)) usersWithApplied++;
    } catch (e) {
      errors.push(`${uid}: ${String((e as Error)?.message || e)}`);
    }
  }
  return {
    users_scanned: ids.length,
    total_distinct_users: distinct.length,
    batch_truncated: batchTruncated,
    users_with_applied_adaptation: usersWithApplied,
    errors,
  };
}

async function autoAdapt(
  supabase: any,
  userId: string,
  today: string,
  fourWeeksAgo: string,
): Promise<{
  action: 'auto';
  adaptations: Array<{ type: string; detail: string; applied: boolean }>;
  relayout_applied: boolean;
  relayout_week: number | null;
  previous_sig: string | null;
  new_sig: string | null;
  sessions_replaced: number | null;
}> {
  const adaptations: Array<{ type: string; detail: string; applied: boolean }> = [];
  let relayoutTelemetry: StrengthRelayoutPersistResult = {
    applied: false,
    ...emptyStrengthRelayoutTelemetry(),
  };

  // 1. Get data
  const [{ data: ub }, { data: exerciseLogs }, { data: existingAdj }, { data: plans }] = await Promise.all([
    supabase.from('user_baselines').select('performance_numbers,learned_fitness,units').eq('user_id', userId).maybeSingle(),
    supabase.from('exercise_log').select('exercise_name,canonical_name,estimated_1rm,avg_rir,workout_date,sets_count')
      .eq('user_id', userId).gte('workout_date', fourWeeksAgo).lte('workout_date', today).order('workout_date', { ascending: true }),
    supabase.from('plan_adjustments').select('exercise_name,applies_from,status')
      .eq('user_id', userId).eq('status', 'active'),
    supabase
      .from('plans')
      .select('id, config, sessions_by_week, duration_weeks, current_week')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1),
  ]);

  const perf = parseJson(ub?.performance_numbers) || {};
  const learned = parseJson(ub?.learned_fitness) || {};
  const isMetric = String(ub?.units || 'imperial').toLowerCase() === 'metric';
  const planRow = plans?.[0] || null;
  const planId = planRow?.id || null;

  if (planRow) {
    const memoryCtx = await loadPlanningMemoryForRelayout(supabase, userId);
    relayoutTelemetry = await maybeRelayoutStrengthForCurrentWeek(supabase, planRow, memoryCtx);
    if (relayoutTelemetry.applied && relayoutTelemetry.detail) {
      adaptations.push({
        type: 'strength_relayout',
        detail: relayoutTelemetry.detail,
        applied: true,
      });
    }
  }

  // 2. Strength auto-progression (protocol-aware, phase-gated)
  const autoCfg = planRow?.config || {};
  const autoProfile = resolveProfile(autoCfg.strength_protocol);
  const autoWeek = Number(planRow?.current_week) || 1;
  const autoPhaseTag = Array.isArray(autoCfg.plan_contract_v1?.phase_by_week)
    ? autoCfg.plan_contract_v1.phase_by_week[autoWeek - 1]
    : null;
  const autoPhase = resolvePhaseRule(autoPhaseTag);

  const liftGroups = groupByLift(exerciseLogs || []);

  for (const [liftName, sessions] of Object.entries(liftGroups)) {
    if (sessions.length < 3) continue;

    const alreadyAdjusted = (existingAdj || []).some(
      (a: any) => a.exercise_name.toLowerCase() === liftName.toLowerCase() && a.status === 'active',
    );
    if (alreadyAdjusted) continue;

    const recent = sessions.slice(-3);
    const earlier = sessions.slice(0, Math.max(1, sessions.length - 3));

    const recentAvg1rm = avg(recent.map((s) => s.estimated_1rm));
    const earlierAvg1rm = avg(earlier.map((s) => s.estimated_1rm));
    const recentRirs = recent.map((s) => s.avg_rir).filter((r) => r != null) as number[];
    const recentAvgRir = avg(recentRirs);

    if (recentAvg1rm == null || earlierAvg1rm == null || earlierAvg1rm <= 0) continue;
    const gainPct = ((recentAvg1rm - earlierAvg1rm) / earlierAvg1rm) * 100;

    const targetRir = getTargetRir(autoProfile, liftName);
    const deviation = recentAvgRir != null ? recentAvgRir - targetRir : null;

    // Auto-progress: e1RM gain meets protocol threshold + RIR shows headroom + phase allows
    if (
      autoPhase.allowProgress &&
      gainPct >= autoProfile.progression.minGainPct * 100 &&
      recentRirs.length >= 2 &&
      (deviation == null || deviation >= autoProfile.progression.minDeviation)
    ) {
      const factor = recentAvg1rm / earlierAvg1rm;

      await supabase.from('plan_adjustments').update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId).ilike('exercise_name', liftName).eq('status', 'active');

      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: liftName,
        adjustment_factor: Math.round(factor * 1000) / 1000,
        applies_from: today,
        reason: `Auto-progression: 1RM +${gainPct.toFixed(0)}%, RIR deviation ${deviation != null ? (deviation > 0 ? '+' : '') + deviation.toFixed(1) : 'n/a'} vs target ${targetRir}`,
        status: 'active',
      });

      adaptations.push({
        type: 'strength_progression',
        detail: `${liftName}: weight increased ${gainPct.toFixed(0)}% (1RM ${earlierAvg1rm.toFixed(0)} → ${recentAvg1rm.toFixed(0)})`,
        applied: true,
      });
    }

    // Auto-deload: deviation below threshold (adjusted by phase sensitivity)
    const autoDeloadThreshold = autoProfile.deload.maxDeviation * autoPhase.deloadSensitivity;
    if (
      deviation != null &&
      deviation <= autoDeloadThreshold &&
      recentRirs.length >= autoProfile.deload.minSessions
    ) {
      await supabase.from('plan_adjustments').update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId).ilike('exercise_name', liftName).eq('status', 'active');

      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: liftName,
        adjustment_factor: 0.9,
        applies_from: today,
        reason: `Auto-deload: RIR deviation ${deviation.toFixed(1)} vs target ${targetRir} (threshold ${autoDeloadThreshold.toFixed(1)})`,
        status: 'active',
      });

      adaptations.push({
        type: 'strength_deload',
        detail: `${liftName}: weight reduced 10% (RIR ${recentAvgRir?.toFixed(1)} vs target ${targetRir})`,
        applied: true,
      });
    }
  }

  // 3. Endurance auto-updates (only with high confidence)
  const learnedEasyPace = learned?.run_easy_pace_sec_per_km;
  if (learnedEasyPace?.confidence === 'high' && learnedEasyPace?.value) {
    const learnedSecPerKm = Number(learnedEasyPace.value);
    const learnedSecPerMi = Math.round(learnedSecPerKm * 1.60934);
    const manualEasyMmSs = perf.easyPace;
    if (manualEasyMmSs) {
      const parts = String(manualEasyMmSs).split(':');
      if (parts.length === 2) {
        const manualSecPerMi = Number(parts[0]) * 60 + Number(parts[1]);
        const deltaPct = Math.abs(learnedSecPerMi - manualSecPerMi) / manualSecPerMi;
        if (deltaPct >= 0.07) {
          const m = Math.floor(learnedSecPerMi / 60);
          const s = Math.round(learnedSecPerMi % 60);
          const newPace = `${m}:${String(s).padStart(2, '0')}`;

          await supabase.from('user_baselines').update({
            performance_numbers: { ...perf, easyPace: newPace },
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);

          adaptations.push({
            type: 'endurance_pace_update',
            detail: `Easy pace auto-updated to ${newPace}/mi (high confidence)`,
            applied: true,
          });
        }
      }
    }
  }

  const learnedFtp = learned?.ride_ftp_estimated;
  if (learnedFtp?.confidence === 'high' && learnedFtp?.value) {
    const manualFtp = Number(perf.ftp);
    const learnedVal = Number(learnedFtp.value);
    if (Number.isFinite(manualFtp) && manualFtp > 0 && Number.isFinite(learnedVal)) {
      const deltaPct = Math.abs(learnedVal - manualFtp) / manualFtp;
      if (deltaPct >= 0.07) {
        await supabase.from('user_baselines').update({
          performance_numbers: { ...perf, ftp: Math.round(learnedVal) },
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);

        adaptations.push({
          type: 'endurance_ftp_update',
          detail: `FTP auto-updated to ${Math.round(learnedVal)}W (high confidence)`,
          applied: true,
        });
      }
    }
  }

  // 4. Re-materialize affected workouts if any adaptations were applied
  if (adaptations.some((a) => a.applied) && planId) {
    try {
      await supabase.functions.invoke('materialize-plan', {
        body: { training_plan_id: planId },
      });
      adaptations.push({ type: 'rematerialize', detail: 'Future workouts updated with new targets', applied: true });
    } catch (e) {
      console.error('[adapt-plan] rematerialize failed:', e);
    }
  }

  const out = {
    action: 'auto' as const,
    adaptations,
    relayout_applied: relayoutTelemetry.applied,
    relayout_week: relayoutTelemetry.relayout_week,
    previous_sig: relayoutTelemetry.previous_sig,
    new_sig: relayoutTelemetry.new_sig,
    sessions_replaced: relayoutTelemetry.sessions_replaced,
  };

  console.log(
    JSON.stringify({
      tag: 'adapt_plan_auto',
      user_id: userId,
      relayout_applied: out.relayout_applied,
      relayout_week: out.relayout_week,
      previous_sig: out.previous_sig,
      new_sig: out.new_sig,
      sessions_replaced: out.sessions_replaced,
      adaptations_applied: adaptations.filter((a) => a.applied).length,
    }),
  );

  return out;
}
