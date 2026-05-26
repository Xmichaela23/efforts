// @ts-nocheck
// Edge Function: generate-combined-plan
//
// Multi-sport combined plan engine. Implements the training science spec
// (Friel, 80/20 triathlon, Seiler polarized model, Hickson interference theory).
//
// Single entry point for generating a unified plan that integrates training
// for two or more concurrent events — one TSS budget, globally enforced
// hard/easy, proper brick placement, and multi-event taper protocols.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombinedPlanRequest, GoalInput, AthleteState, AthleteMemory } from './types.ts';
import { buildPhaseTimeline, applyLoadingPattern, blockForWeek, loadingPatternForIntent } from './phase-structure.ts';
import { buildWeek, buildAssessmentWeekSessions } from './week-builder.ts';
import { harvestSwimDrillTokensFromWeek } from './drill-token-harvest.ts';
import { validatePlan, failedChecks, findMissingRaceDaySessions } from './validator.ts';
import { classifyCombinedPlanError } from './classify-error.ts';
import { scaledWeeklyTSS, resolveRunEasyPace } from './science.ts';
import { parseLocalDate } from '../_shared/parse-local-date.ts';
import { resolveWeekConflicts, type WeekConflictContext } from '../_shared/week-conflict-resolver.ts';
import { reconcileAthleteStateWithWeekOptimizer } from './reconcile-athlete-state-week-optimizer.ts';
import { promote703SwimIntentForCutoffRisk } from './swim-tri-safety.ts';
import {
  buildQualityRunWeekBuilderFallbackTradeOff,
  filterAthleteFacingTradeOffs,
  hasAthletePinsFromPrefs,
  humanizeScheduleTradeOffLine,
  plannedSessionLooksLikeStructuredQualityRun,
  sessionsByWeekHasStructuredQualityRun,
} from '../_shared/plan-generation-trade-offs.ts';
import {
  validateTrainingFloors,
  tightenPhaseBlocksForFloorRebuild,
  evaluateLongDayVolumeFloors,
  enforceLongDayFloors,
  LONG_RUN_TSS_SHARE_MAX,
  LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE,
  LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK,
  WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX,
  WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI,
} from './validate-training-floors.ts';
import { invalidateUserTrainingCache } from '../_shared/invalidate-user-training-cache.ts';
import { buildAthleteSnapshot } from '../_shared/athlete-snapshot.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Entry point ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body: CombinedPlanRequest = await req.json();
    const { user_id, goals, athlete_state, athlete_memory, start_date, generation_trade_offs, arc } = body;
    const preview = body.preview === true;
    // D-048 — copy into a local array so we can safely merge phase-structure
    // trade-offs without mutating the caller's input array.
    const persistedTradeOffs = Array.isArray(generation_trade_offs) ? [...generation_trade_offs] : [];

    console.log('[generate-combined-plan] ===== HANDLER ENTRY =====', {
      preview,
      goal_count: goals.length,
      swim_intent: athlete_state?.swim_intent ?? null,
    });

    // ── Input validation ────────────────────────────────────────────────────
    if (!user_id)                         return json({ error: 'user_id required' }, 400);
    if (!Array.isArray(goals) || goals.length < 1) return json({ error: 'At least one goal required' }, 400);
    if (!athlete_state?.current_ctl)      return json({ error: 'athlete_state.current_ctl required' }, 400);
    if (!athlete_state?.weekly_hours_available) return json({ error: 'weekly_hours_available required' }, 400);

    // D-061 / Item 1 — derive loading pattern from training_intent (overrides
    // athlete's pinned `loading_pattern` when intent is set):
    //   performance → athlete's pattern (default '3:1')
    //   completion  → '2:1' (every 3rd week)
    //   first_race  → '1:1' (every 2nd week)
    //   comeback    → '1:1'
    const loadingPattern = loadingPatternForIntent(
      athlete_state.training_intent,
      athlete_state.loading_pattern,
    );
    const startDate = start_date ? parseLocalDate(String(start_date).slice(0, 10)) : new Date();

    const state: AthleteState = {
      ...athlete_state,
      rest_days: athlete_state.rest_days ?? [],
    };

    // ── D-033 / Phase 1 (2026-05-22) — run easy pace feedback loop ──────────
    // Reconcile baseline `state.learned_fitness.run_easy_pace_sec_per_km` against
    // `arc.run_observed_fitness` (Arc-channel curated subset). The reconciler
    // applies the LOCKED anti-volatility shape (4-week trailing window, ±4%
    // divergence band, 2× asymmetric ratchet, ACWR ≤ 1.3 gate on worsening).
    // When the resolved source != 'baseline', we mutate `state.learned_fitness`
    // in-place so every downstream consumer (week-builder, validator, future
    // phases) reads the reconciled value. Pure no-op when both inputs absent —
    // see `docs/PHASE-1-RUN-PACE-SPEC.md` and `science.ts:resolveRunEasyPace`.
    try {
      const lfRec = (state.learned_fitness ?? null) as
        | (Record<string, unknown> & { run_easy_pace_sec_per_km?: { value?: number; confidence?: string; sample_count?: number } })
        | null;
      const baseline = lfRec?.run_easy_pace_sec_per_km ?? null;
      const observed = arc?.run_observed_fitness ?? null;
      const resolved = resolveRunEasyPace(baseline, observed);
      if (resolved && resolved.source !== 'baseline') {
        // Mutate in-place; downstream code (and the state703Cutoff/scheduleState
        // shallow spreads below) share this object reference.
        const nextLf: Record<string, unknown> = { ...(lfRec ?? {}) };
        const prev = (nextLf.run_easy_pace_sec_per_km ?? {}) as Record<string, unknown>;
        nextLf.run_easy_pace_sec_per_km = {
          ...prev,
          value: resolved.paceSecPerKm,
          // Provenance for debug / future audit trails. Does not displace existing
          // `confidence` / `sample_count` — observed signal does not retroactively
          // boost baseline confidence; the reconciler decides displacement.
          phase1_source: resolved.source,
          phase1_reasoning: resolved.reasoning,
        };
        state.learned_fitness = nextLf;
        console.log('[generate-combined-plan] D-033 run-pace reconciler engaged:', {
          source: resolved.source,
          paceSecPerKm: resolved.paceSecPerKm,
          baseline_value: baseline?.value ?? null,
          observed_median: observed?.median_easy_pace_sec_per_km ?? null,
          observed_weeks: observed?.weekly_easy_paces_sec_per_km?.length ?? 0,
        });
      } else if (resolved) {
        console.log('[generate-combined-plan] D-033 run-pace reconciler held baseline:', {
          source: resolved.source,
          paceSecPerKm: resolved.paceSecPerKm,
        });
      }
    } catch (e) {
      // Reconciler is best-effort: any unexpected failure must NOT block plan
      // generation. Log + fall through with the original baseline value.
      console.warn('[generate-combined-plan] D-033 run-pace reconciler exception:', e);
    }

    // History-aware long-day floors: read the longest run / ride from the last 30 days so the
    // physiological floor enforcement (`enforceLongDayFloors`) can scale up to match the athlete's
    // recent volume — `effectiveFloor = max(specFloor, recent × 0.5)`. New users / no-history
    // → 0, spec floor wins. Failure to read (no service role, network) → 0; soft fallback so
    // plan generation never blocks on telemetry.
    {
      const sbUrl = Deno.env.get('SUPABASE_URL');
      const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      let recentRunMi = 0;
      let recentRideHr = 0;
      if (sbUrl && sbKey) {
        try {
          const sb = createClient(sbUrl, sbKey);
          const cutoffISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
          const { data, error } = await sb
            .from('workouts')
            .select('type,distance,duration,date')
            .eq('user_id', user_id)
            .in('type', ['run', 'ride'])
            .gte('date', cutoffISO);
          if (error) {
            console.warn('[generate-combined-plan] recent_longest read failed:', error.message);
          } else if (Array.isArray(data)) {
            for (const w of data) {
              const t = String(w?.type ?? '').toLowerCase();
              if (t === 'run') {
                const mi = Number(w?.distance);
                if (Number.isFinite(mi) && mi > recentRunMi) recentRunMi = mi;
              } else if (t === 'ride') {
                const min = Number(w?.duration);
                if (Number.isFinite(min) && min > 0) {
                  const hr = min / 60;
                  if (hr > recentRideHr) recentRideHr = hr;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[generate-combined-plan] recent_longest exception:', e);
        }
      }
      state.recent_longest_run_mi = recentRunMi;
      state.recent_longest_ride_hr = recentRideHr;
      console.log('[generate-combined-plan] history-aware floor inputs:', {
        recent_longest_run_mi: recentRunMi,
        recent_longest_ride_hr: recentRideHr,
      });
    }

    const state703Cutoff = promote703SwimIntentForCutoffRisk(goals, state);

    console.log('[generate-combined-plan] athleteState before reconcile:', {
      bike_quality_day: state703Cutoff.bike_quality_day,
      bike_quality_label: state703Cutoff.bike_quality_label,
      run_quality_day: state703Cutoff.run_quality_day,
      run_easy_day: state703Cutoff.run_easy_day,
      bike_easy_day: state703Cutoff.bike_easy_day,
      long_run_day: state703Cutoff.long_run_day,
      long_ride_day: state703Cutoff.long_ride_day,
    });

    // Used downstream for floor caps, quality_run rescue, and ramp-cap reporting.
    const hasTriGoal = goals.some((g) =>
      ['triathlon', 'tri'].includes(String(g.sport ?? '').toLowerCase()),
    );

    // Task 7 (consolidation): scheduling is the optimizer's responsibility for ALL combined-plan
    // entrypoints. The reconciler internally short-circuits (returns state unchanged) for AthleteStates
    // that cannot be optimized — e.g. when long_run_day is missing — so it is safe to call unconditionally.
    const scheduleState: AthleteState = reconcileAthleteStateWithWeekOptimizer(state703Cutoff);

    // ── Build phase timeline ────────────────────────────────────────────────
    const { blocks: builtBlocks, totalWeeks, raceAnchors, phaseStructureTradeOffs } = buildPhaseTimeline(goals, startDate, scheduleState);
    // D-048 POLISH §1 — surface base-phase / rebuild silent-skip trade-offs.
    if (Array.isArray(phaseStructureTradeOffs) && phaseStructureTradeOffs.length > 0) {
      for (const t of phaseStructureTradeOffs) persistedTradeOffs.push(t);
    }
    let blocks = builtBlocks;
    blocks = applyLoadingPattern(blocks, loadingPattern);

    if (totalWeeks < 2) {
      return json({ error: 'Not enough time before earliest event to build a meaningful plan' }, 400);
    }

    if (totalWeeks >= 1) {
      console.log('[generate-combined-plan] athleteState before buildWeek:', {
        bike_quality_day: scheduleState.bike_quality_day,
        bike_easy_day: scheduleState.bike_easy_day,
        bike_quality_label: scheduleState.bike_quality_label,
        run_quality_day: scheduleState.run_quality_day,
        run_easy_day: scheduleState.run_easy_day,
        long_ride_day: scheduleState.long_ride_day,
        long_run_day: scheduleState.long_run_day,
        swim_easy_day: scheduleState.swim_easy_day,
        swim_quality_day: scheduleState.swim_quality_day,
        swim_third_day: scheduleState.swim_third_day,
        strength_preferred_days: scheduleState.strength_preferred_days,
        strength_sessions_cap: scheduleState.strength_sessions_cap,
        strength_intent: scheduleState.strength_intent,
        strength_optimizer_slots: scheduleState.strength_optimizer_slots,
        enforce_optimizer_anchor_days: scheduleState.enforce_optimizer_anchor_days,
        swim_intent: scheduleState.swim_intent,
        swim_load_source: scheduleState.swim_load_source,
        training_intent: scheduleState.training_intent,
        transition_mode: scheduleState.transition_mode,
        tri_approach: scheduleState.tri_approach,
        run_quality_placement: scheduleState.run_quality_placement,
        bike_quality_placement: scheduleState.bike_quality_placement,
      });
    }

    // ── Generate each week ─────────────────────────────────────────────────
    type GeneratedWeekFromBuilder = ReturnType<typeof buildWeek>;

    const generateAllWeeks = (
      blocksArg: typeof blocks,
      rebuild: false | 'normal' | 'deep' = false,
    ): GeneratedWeekFromBuilder[] => {
      const out: GeneratedWeekFromBuilder[] = [];
      let prevWeightedTSS = state.current_ctl * 7;
      // D-044 item 6 / Q-015 — drill repeat-pick memory across weeks. Rolling
      // 1-week window: the Set passed in for each week contains drill tokens
      // chosen in the immediately-prior week's swim sessions. After buildWeek
      // returns, we extract drill tokens from the week's swim PlannedSession
      // steps_preset (any token matching swim_drills* or swim_drill_*) and
      // replace the set for the next iteration. Picker excludes these
      // tokens by name-suffix key before salt-rotation; falls back to
      // unfiltered when filter empties the pool.
      let prevWeekDrillTokens: Set<string> = new Set();
      for (let w = 1; w <= totalWeeks; w++) {
        const block = blockForWeek(blocksArg, w);
        const week = buildWeek(w, block, prevWeightedTSS, goals, scheduleState, athlete_memory, {
          totalWeeks,
          raceAnchors,
          phaseBlocks: blocksArg,
          // D-032 (Phase 0, 2026-05-22) — Arc channel. Engine is behavior-neutral
          // with respect to this field; Phase 1-4 consumers destructure as they
          // need fields. Undefined when caller omits `arc` from the request body.
          arc,
          // D-044 item 6 / Q-015 — see prevWeekDrillTokens declaration above.
          prevWeekDrillTokens,
          ...(rebuild === 'deep'
            ? { physiologicalFloorRebuild: true, physiologicalFloorRebuildDeep: true }
            : rebuild === 'normal'
              ? { physiologicalFloorRebuild: true }
              : {}),
        });
        out.push(week);
        prevWeightedTSS = week.total_weighted_tss;
        // D-045 (2026-05-25) — harvest extracted to `drill-token-harvest.ts`.
        // Prior inline walk read `week.days[].sessions[]`; `buildWeek` returns
        // flat `week.sessions[]` (see `computeWeekMetrics` at week-builder.ts:593)
        // so the Set stayed empty and the picker filter never fired.
        // Closes Q-015 regression.
        prevWeekDrillTokens = harvestSwimDrillTokensFromWeek(week);
      }
      return out;
    };

    let generatedWeeks = generateAllWeeks(blocks);
    let physiologicalFloorRebuiltOnce = false;
    const floorOpts = {
      hasTri: hasTriGoal,
      // D-068: surface primary distance to the WoW ramp validator so full-IM
      // plans use the wider 25% ceiling rather than the 20% 70.3 default.
      primaryDistance: String((goals.find((g) => g.priority === 'A') ?? goals[0])?.distance ?? ''),
    };
    // Long-day anchors are hard floors — re-enforce them after each compression pass so the
    // 0.87× tightening shrinks quality / easy / swim but never compresses long_ride / long_run
    // below their physiological minimums (`longRideFloorHours` / `longRunFloorMiles`).
    // The effective floor is history-aware: `max(specFloor, recent_longest × 0.5)` so athletes
    // who already log longer sessions don't get capped to the generic spec floor.
    // D-027: pass phaseBlocks so the validator's effective long-run floor is
    // within-phase-aware (follows the lerp's ramp instead of peak-of-phase).
    // `blocks` is mutated by the rebuild loop below (tightenPhaseBlocksForFloorRebuild
    // returns a new array); reconstruct the opts object inside the loop if needed.
    // For the initial pass and the steady-state case, the current `blocks` reference
    // is correct.
    const longDayFloorOpts = {
      hasTri: hasTriGoal,
      primaryDistance: (goals.find((g) => g.priority === 'A') ?? goals[0]).distance,
      raceWeekNums: raceAnchors.map((a) => a.planWeek),
      recentLongestRunMi: state.recent_longest_run_mi ?? 0,
      recentLongestRideHr: state.recent_longest_ride_hr ?? 0,
      phaseBlocks: blocks,
    };
    // Run enforcement unconditionally before validation — long-day floors are guaranteed hard
    // contracts (rebuild floor must hit 2.5h for 70.3 regardless of whether other validators
    // happen to flag a violation). Previously enforcement only ran inside the rebuild loop,
    // which meant a rebuild long_ride that the validator silently accepted (warnings, not
    // failures) was left under-floor. This single unconditional pass closes that gap.
    enforceLongDayFloors(generatedWeeks, longDayFloorOpts);
    let floors = validateTrainingFloors(generatedWeeks, floorOpts);
    const MAX_PHYSIOLOGICAL_FLOOR_PASSES = 12;
    let floorPass = 0;
    while (!floors.ok && floorPass < MAX_PHYSIOLOGICAL_FLOOR_PASSES) {
      blocks = tightenPhaseBlocksForFloorRebuild(blocks);
      physiologicalFloorRebuiltOnce = true;
      floorPass += 1;
      generatedWeeks = generateAllWeeks(blocks, 'normal');
      // D-027: refresh phaseBlocks reference after the rebuild reassignment.
      longDayFloorOpts.phaseBlocks = blocks;
      enforceLongDayFloors(generatedWeeks, longDayFloorOpts);
      floors = validateTrainingFloors(generatedWeeks, floorOpts);
    }
    if (!floors.ok) {
      physiologicalFloorRebuiltOnce = true;
      generatedWeeks = generateAllWeeks(blocks, 'deep');
      longDayFloorOpts.phaseBlocks = blocks;
      enforceLongDayFloors(generatedWeeks, longDayFloorOpts);
      floors = validateTrainingFloors(generatedWeeks, floorOpts);
      floorPass += 1;
    }
    if (!floors.ok) {
      const v0 = floors.violations[0];
      const hint =
        v0?.code === 'LONG_RUN_TSS_SHARE'
          ? ' Try lowering performance intent, weekly hours, or run quality folded into the long run.'
          : v0?.code === 'WEEK_OVER_WEEK_TSS_RAMP'
            ? ' Try a gentler loading pattern or shorter mesocycle.'
            : '';
      try {
        const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await invalidateUserTrainingCache(sb, user_id, 'generate-combined-plan:physiological_floors');
      } catch (e) {
        console.warn('[generate-combined-plan] cache bust after floor failure:', e);
      }
      return json(
        {
          success: false,
          error: `Training load limits could not be met: ${v0?.message ?? 'constraints violated after rebuild.'}${hint}`,
          physiological_floor_violations: floors.violations,
          physiological_floor_rebuilt_once: physiologicalFloorRebuiltOnce,
          physiological_floor_passes_attempted: floorPass,
        },
        400,
      );
    }

    // ── Long-day volume floors (soft) ──────────────────────────────────────
    // Surfaces under-volume long_ride / long_run weeks as athlete-facing trade-offs. Distinct
    // from the hard floor-rebuild loop above (which addresses *over-concentration*). Skips
    // recovery, taper, and race weeks — those phases intentionally suppress long-day volume.
    // Uses the same history-aware effective floor as the hard enforcer so warnings and
    // enforcement stay in lockstep.
    {
      const primaryGoalForFloors = goals.find((g) => g.priority === 'A') ?? goals[0];
      const longDayWarnings = evaluateLongDayVolumeFloors(generatedWeeks, {
        hasTri: hasTriGoal,
        primaryDistance: primaryGoalForFloors.distance,
        raceWeekNums: raceAnchors.map((a) => a.planWeek),
        recentLongestRunMi: state.recent_longest_run_mi ?? 0,
        recentLongestRideHr: state.recent_longest_ride_hr ?? 0,
        // D-027: within-phase-aware soft validator floor; matches the hard enforcer.
        phaseBlocks: blocks,
      });
      if (longDayWarnings.length > 0) {
        console.warn(
          '[combined-plan] LONG_DAY_VOLUME_FLOOR soft trade-offs:',
          longDayWarnings.map((w) => ({
            week: w.weekNum,
            discipline: w.discipline,
            observed: w.metrics.observed,
            floor: w.metrics.floor,
            unit: w.metrics.unit,
            phase: w.metrics.phase,
          })),
        );
        const byWeek = new Map<number, string[]>();
        for (const wn of longDayWarnings) {
          const list = byWeek.get(wn.weekNum) ?? [];
          list.push(wn.message);
          byWeek.set(wn.weekNum, list);
        }
        for (const gw of generatedWeeks) {
          const msgs = byWeek.get(gw.weekNum);
          if (!msgs || msgs.length === 0) continue;
          gw.week_trade_offs = [...(gw.week_trade_offs ?? []), ...msgs];
        }
      }
    }

    // ── §8.4 hard guarantee: race-day session must always materialize ───────
    // Internal engine invariant (RACE-WEEK-PROTOCOL §8.4): every RaceAnchor's
    // plan week must contain exactly one type:'race' session on its dayName for
    // that goal. A breach means the engine produced a plan with a missing or
    // duplicate race day — abort rather than ship it silently. Distinct from
    // (and stricter than) the soft validatePlan flow below.
    const raceDayViolations = findMissingRaceDaySessions(generatedWeeks, raceAnchors);
    if (raceDayViolations.length > 0) {
      console.error('[combined-plan] §8.4 race-day invariant violated:', raceDayViolations);
      return json(
        {
          success: false,
          error: `[race-week §8.4] race-day session invariant violated: ${raceDayViolations.join('; ')}`,
          race_day_violations: raceDayViolations,
        },
        500,
      );
    }

    // ── Validate ───────────────────────────────────────────────────────────
    const validation = validatePlan(
      generatedWeeks, blocks,
      state.current_ctl,
      state.weekly_hours_available,
      loadingPattern,
      hasTriGoal,
      scheduleState.transition_mode,
    );
    const failures = failedChecks(validation);
    if (failures.length > 0) {
      console.warn('[combined-plan] Validation failures:', failures);
      // Soft validation — log failures but proceed (hard fails handled by type system)
      // Future: return 400 for critical failures once the engine is battle-tested
    }

    // ── Build sessions_by_week (sessions format used by activate-plan) ─────
    const sessions_by_week: Record<string, any[]> = {};

    const serializeSession = (s: any) => ({
      day: s.day,
      type: s.type,
      discipline: s.type,
      name: s.name,
      description: s.description,
      duration: s.duration,
      steps_preset: s.steps_preset,
      tags: s.tags,
      ...(typeof s.route_url === 'string' && s.route_url.trim()
        ? { route_url: s.route_url.trim() }
        : {}),
      ...(typeof (s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot === 'object' &&
        (s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot !== null &&
        !Array.isArray((s as { group_ride_route_snapshot?: unknown }).group_ride_route_snapshot)
        ? {
          group_ride_route_snapshot: (s as { group_ride_route_snapshot: Record<string, unknown> })
            .group_ride_route_snapshot,
        }
        : {}),
      intensity_class: s.intensity_class,
      tss: s.tss,
      weighted_tss: s.weighted_tss,
      zone_targets: s.zone_targets,
      serves_goal: s.serves_goal,
      ...(typeof s.session_kind === 'string' && s.session_kind ? { session_kind: s.session_kind } : {}),
      ...(Array.isArray(s.strength_exercises) && s.strength_exercises.length > 0
        ? { strength_exercises: s.strength_exercises }
        : {}),
    });

    // When assessment_first: shift all training weeks +1, prepend assessment as week 1.
    const includeAssessmentWeek = scheduleState.assessment_week_preference === 'assessment_first';
    const weekOffset = includeAssessmentWeek ? 1 : 0;

    // Optimizer micro-grid can report "quality_run not placed" while week-builder still lands
    // structured quality from Arc defaults + anchor bumps. Surface what actually shipped.
    if (hasTriGoal && scheduleState.run_quality_day == null) {
      for (const gw of generatedWeeks) {
        const qrSession = gw.sessions.find((s) =>
          plannedSessionLooksLikeStructuredQualityRun(s as unknown as Record<string, unknown>),
        );
        if (!qrSession) continue;
        const dayPretty = String(qrSession.day ?? '').trim() || 'mid-week';
        const note = buildQualityRunWeekBuilderFallbackTradeOff(dayPretty, {
          bike_quality_day: scheduleState.bike_quality_day,
          long_ride_day: scheduleState.long_ride_day,
          long_run_day: scheduleState.long_run_day,
          swim_quality_day: scheduleState.swim_quality_day,
        });
        gw.week_trade_offs = [...(gw.week_trade_offs ?? []), note];
        break;
      }
    }

    for (const w of generatedWeeks) {
      sessions_by_week[String(w.weekNum + weekOffset)] = w.sessions.map(serializeSession);
    }

    if (includeAssessmentWeek) {
      const assessmentDisciplines: ('swim' | 'bike' | 'run')[] = hasTriGoal
        ? ['swim', 'bike', 'run']
        : ['run']; // marathon, HM, 5K, 10K — run baseline only
      sessions_by_week['1'] = buildAssessmentWeekSessions(assessmentDisciplines).map(serializeSession);
    }

    const persistedTradeOffsEffective = sessionsByWeekHasStructuredQualityRun(sessions_by_week)
      ? persistedTradeOffs.filter((t) => t.message_template_id !== 'quality_run_unplaced')
      : persistedTradeOffs;

    // Total duration including any prepended assessment week
    const effectiveTotalWeeks = totalWeeks + weekOffset;

    // ── Build plan_contract_v1 ─────────────────────────────────────────────
    const primaryGoal = goals.find(g => g.priority === 'A') ?? goals[0];
    const allGoalNames = goals.map(g => g.event_name).join(' + ');
    // D-074: canonical plan anchor date — fall back to today when the request
    // didn't pass `start_date`. activate-plan reads
    // `plan.config.user_selected_start_date` as the planned_workouts date
    // anchor, so this MUST flow into plan_config AND the top-level
    // plans.start_date column (the latter was being dropped pre-fix, leaving
    // plans.start_date NULL while the per-session dates rendered fine).
    const planStartDate: string = start_date
      ? String(start_date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const plan_contract_v1 = {
      plan_type: 'multi_sport',
      discipline: 'multi',
      approach: 'combined_80_20',
      tri_approach: scheduleState.tri_approach ?? null,  // 'base_first' | 'race_peak' — read by coach narrative
      transition_mode: scheduleState.transition_mode ?? null,
      structural_load_hint: scheduleState.structural_load_hint ?? null,
      swim_volume_multiplier: scheduleState.swim_volume_multiplier ?? null,
      swim_intent: scheduleState.swim_intent ?? null,
      swim_load_source: scheduleState.swim_load_source ?? null,
      swim_cutoff_pressure_v1: scheduleState.swim_cutoff_pressure_v1 ?? null,
      long_run_day: scheduleState.long_run_day ?? null,
      long_ride_day: scheduleState.long_ride_day ?? null,
      swim_easy_day: scheduleState.swim_easy_day ?? null,
      swim_quality_day: scheduleState.swim_quality_day ?? null,
      swim_third_day: scheduleState.swim_third_day ?? null,
      run_quality_day: scheduleState.run_quality_day ?? null,
      run_easy_day: scheduleState.run_easy_day ?? null,
      bike_quality_day: scheduleState.bike_quality_day ?? null,
      bike_easy_day: scheduleState.bike_easy_day ?? null,
      run_quality_placement: scheduleState.run_quality_placement ?? null,
      bike_quality_placement: scheduleState.bike_quality_placement ?? null,
      strength_protocol: scheduleState.strength_protocol ?? null,
      strength_intent: scheduleState.strength_intent ?? null,
      training_intent: scheduleState.training_intent ?? null,
      strength_preferred_days: scheduleState.strength_preferred_days ?? null,
      strength_sessions_cap: scheduleState.strength_sessions_cap ?? null,
      rest_days: scheduleState.rest_days ?? [],
      race_anchors: Array.isArray(raceAnchors) && raceAnchors.length > 0 ? raceAnchors : null,
      goals_served: goals.map(g => g.id),
      goal_names: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
      sport: 'multi_sport',
      start_date: planStartDate,
      duration_weeks: effectiveTotalWeeks,
      loading_pattern: loadingPattern,
      weekly_tss_target: Math.round(
        // Q-005 / D-021: mirror week-builder's endurance-hours-based budget so the
        // persisted plan_contract_v1.weekly_tss_target matches the actual per-week
        // budget. Without this the contract value over-reports for hybrid athletes.
        scaledWeeklyTSS(
          'build',
          state.current_ctl,
          scheduleState.session_frequency_defaults?.endurance_hours ?? state.weekly_hours_available,
          1.0,
        )
      ),
      phases: blocks
        .filter((b, i, arr) => i === 0 || b.phase !== arr[i - 1].phase || b.primaryGoalId !== arr[i - 1].primaryGoalId)
        .map(b => ({
          name: b.phase,
          start_week: b.startWeek,
          primary_goal_id: b.primaryGoalId,
          tss_multiplier: b.tssMultiplier,
          sport_distribution: b.sportDistribution,
        })),
      tss_science: {
        run_impact_multiplier: 1.3,
        bike_impact_multiplier: 1.0,
        swim_impact_multiplier: 0.8,
        strength_budget_fraction: 0.5,
        intensity_model: '80_20_polarized',
      },
      validation,
      validation_failures: failures,
      physiological_floors: {
        long_run_tss_share_max_single_sport: LONG_RUN_TSS_SHARE_MAX,
        tri_long_run_share_of_run_discipline_max: LONG_RUN_TSS_SHARE_MAX_RUN_DISCIPLINE,
        tri_long_run_share_of_total_week_fallback_max: LONG_RUN_TSS_SHARE_MAX_TRI_TOTAL_WEEK,
        week_over_week_raw_tss_ramp_max: hasTriGoal
          ? WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX_TRI
          : WEEK_OVER_WEEK_RAW_TSS_RAMP_MAX,
        rebuilt_once: physiologicalFloorRebuiltOnce,
        rebuild_passes: floorPass,
        passed: true,
      },
      week_start_dow: 'Monday',
      week_trade_offs: (() => {
        // D-072: thread per-week trade-offs through the same filter as the
        // generation_trade_offs aggregator. Pre-fix the per-week list bypassed
        // `filterAthleteFacingTradeOffs` and surfaced internal optimizer
        // telemetry ("Strength: default Monday upper moved...", "Weekly load
        // balance: moved ..." etc.) plus anchor-reference messages on plans
        // where the athlete pinned nothing. `hasAthletePinsFromPrefs(state)`
        // gates the anchor-reference filter the same way the aggregator does.
        const hasPins = hasAthletePinsFromPrefs(state as unknown as Record<string, unknown>);
        const entries = generatedWeeks
          .filter((w) => Array.isArray(w.week_trade_offs) && w.week_trade_offs.length > 0)
          .map((w) => {
            const humanized = (w.week_trade_offs as string[]).map((t) => humanizeScheduleTradeOffLine(t));
            const filtered = filterAthleteFacingTradeOffs(humanized, { hasAthletePins: hasPins });
            return [String(w.weekNum), filtered] as [string, string[]];
          })
          .filter(([, msgs]) => msgs.length > 0);
        return Object.fromEntries(entries);
      })(),
      conflict_events: Object.fromEntries(
        generatedWeeks
          .filter((w) => Array.isArray(w.conflict_events) && w.conflict_events!.length > 0)
          .map((w) => [String(w.weekNum), w.conflict_events!]),
      ),
    };

    const planName = effectiveTotalWeeks <= 10
      ? `${allGoalNames} — ${effectiveTotalWeeks}-Week Combined Plan`
      : `${allGoalNames} — Multi-Sport Plan`;

    const peakWeek = generatedWeeks.reduce((best, w) =>
      w.total_raw_tss > (best?.total_raw_tss ?? 0) ? w : best
    , generatedWeeks[0]);

    const avgTSS = Math.round(generatedWeeks.reduce((s, w) => s + w.total_raw_tss, 0) / effectiveTotalWeeks);

    const planUnits = state.plan_units === 'metric' ? 'metric' : 'imperial';
    const plan_config = {
      ...plan_contract_v1,
      sport: 'multi_sport',
      race_date: primaryGoal.event_date,
      race_name: primaryGoal.event_name,
      units: planUnits,
      swim_unit: 'yd',
      user_selected_start_date: planStartDate,
      // Canonical athlete-input snapshot. Pinned at generation time; consumers
      // (materialize-plan, coach, adapt-plan) read from this rather than re-querying
      // user_baselines live. Initial v1 populates strength 1RMs only; FTP / swim CSS /
      // run threshold / equipment / intent / capacity / bio land in follow-up commits.
      athlete_snapshot: buildAthleteSnapshot({
        athleteState: state as unknown as Record<string, unknown>,
        goals: goals as unknown as Array<Record<string, unknown>>,
        source: 'request',
      }),
    };

    const previewSummary = {
      name: planName,
      total_weeks: effectiveTotalWeeks,
      peak_weekly_tss: peakWeek.total_raw_tss,
      avg_weekly_tss: avgTSS,
      loading_pattern: loadingPattern,
      goals: goals.map(g => ({ id: g.id, name: g.event_name, date: g.event_date, priority: g.priority })),
      phase_summary: plan_contract_v1.phases,
    };

    if (preview) {
      // Run the resolver server-side so the client gets labelled options ready for the UI.
      const conflict_resolutions: Record<string, unknown[]> = {};
      for (const w of generatedWeeks) {
        const events = w.conflict_events ?? [];
        if (events.length === 0) continue;
        const ctx: WeekConflictContext = {
          isRecovery: w.isRecovery,
          isTaper: (w.phase as string) === 'taper',
          isRaceWeek: raceAnchors.some((a) => a.planWeek === w.weekNum),
          weeksToRace: (() => {
            const deltas = raceAnchors.map((a) => a.planWeek - w.weekNum).filter((d) => d >= 0);
            return deltas.length === 0 ? 999 : Math.min(...deltas);
          })(),
        };
        conflict_resolutions[String(w.weekNum)] = resolveWeekConflicts(events, ctx);
      }

      return json({
        success: true,
        preview_mode: true,
        plan_id: null,
        total_weeks: effectiveTotalWeeks,
        validation,
        validation_failures: failures,
        sessions_by_week,
        week_trade_offs: plan_contract_v1.week_trade_offs as Record<string, string[]>,
        plan_contract_v1,
        plan_config,
        conflict_resolutions,
        preview: previewSummary,
        generation_trade_offs: persistedTradeOffsEffective,
      });
    }

    // ── Write plan to DB ───────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .insert({
        user_id,
        name: planName,
        description: buildDescription(goals, effectiveTotalWeeks, loadingPattern, validation, peakWeek.total_raw_tss, avgTSS),
        plan_type: 'generated',
        status: 'active',
        // D-074 attempted to add a top-level `start_date` column to this
        // INSERT, but the `plans` table has no such column (original schema
        // at `20250701120006_create_plans_table.sql`; no later ALTER adds
        // it). PGRST204 on PATCH confirmed. The canonical anchor lives at
        // `plan_config.user_selected_start_date` (consumed by activate-plan
        // at `activate-plan/index.ts:379`). Holding the field name local
        // (`planStartDate`) so it stays single-source-of-truth across
        // plan_contract_v1.start_date and plan_config.user_selected_start_date.
        duration_weeks: effectiveTotalWeeks,
        sessions_by_week,
        config: plan_config,
      })
      .select('id')
      .single();

    if (planErr || !plan?.id) {
      console.error('[combined-plan] DB write failed:', planErr);
      return json({ success: false, error: planErr?.message ?? 'Plan insert failed' }, 500);
    }

    return json({
      success: true,
      plan_id: plan.id,
      total_weeks: effectiveTotalWeeks,
      validation,
      validation_failures: failures,
      preview: previewSummary,
      sessions_by_week,
      week_trade_offs: plan_contract_v1.week_trade_offs as Record<string, string[]>,
      generation_trade_offs: persistedTradeOffsEffective,
    });

  } catch (e) {
    console.error('[combined-plan] Unhandled error:', e);
    // Issue 2: race-week §8.x hard-fails are athlete-actionable, not internal
    // bugs — classify with a stable code + 422 (stays !resp.ok so the wrapper
    // propagates it). e.message drops the leaked "Error: " prefix.
    const c = classifyCombinedPlanError(e);
    return json({ success: false, error: c.error, error_code: c.error_code }, c.status);
  }
});

// ── Plan description prose ─────────────────────────────────────────────────────

function buildDescription(
  goals: GoalInput[],
  totalWeeks: number,
  pattern: string,
  v: any,
  peakTSS: number,
  avgTSS: number,
): string {
  const aGoals = goals.filter(g => g.priority === 'A').map(g => `${g.event_name} (${g.distance})`);
  const bGoals = goals.filter(g => g.priority === 'B').map(g => g.event_name);

  let desc = `${totalWeeks}-week integrated multi-sport plan targeting ${aGoals.join(' and ')}.`;
  if (bGoals.length > 0) desc += ` Also includes ${bGoals.join(', ')} as B-race(s).`;

  desc += ` Built on 80/20 polarized intensity distribution, TSS-budgeted across all sports with a 1.3× run impact adjustment for weight-bearing load.`;
  desc += ` Loading follows a ${pattern} pattern (${pattern === '3:1' ? '3 build weeks then 1 recovery' : '2 build weeks then 1 recovery'}).`;
  desc += ` Peak week: ~${peakTSS} TSS. Average: ~${avgTSS} TSS/week.`;

  if (!v.no_consecutive_hard_days)    desc += ' ⚠️ Hard/easy rule violations detected — review schedule.';
  if (!v.maintenance_floors_met)      desc += ' ⚠️ Some sport maintenance floors not met.';
  if (!v.tapers_present)              desc += ' ⚠️ No taper detected — review phase structure.';

  return desc;
}
