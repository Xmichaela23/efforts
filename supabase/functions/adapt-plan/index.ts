// =============================================================================
// ADAPT-PLAN EDGE FUNCTION
// =============================================================================
// Reads response model signals (1RM trends, RIR, pace/efficiency) and generates
// plan adaptation suggestions. Handles both:
//   - Strength: weight auto-progression via plan_adjustments
//   - Endurance: pace/power target updates via user_baselines
//
// Input: { user_id, action?: 'suggest' | 'accept' | 'dismiss', suggestion_id? }
// Output: { suggestions: [...], applied: [...] }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
};

type AdaptationSuggestion = {
  id: string;
  type: 'strength_progression' | 'strength_deload' | 'endurance_pace_update' | 'endurance_deload';
  title: string;
  description: string;
  exercise?: string;
  current_value: number;
  suggested_value: number;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { user_id, action = 'suggest', suggestion_id } = payload;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const today = new Date().toISOString().slice(0, 10);
    const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);

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

    // 1. Get active plan
    const { data: plans } = await supabase
      .from('plans')
      .select('id,name,config')
      .eq('user_id', user_id)
      .eq('status', 'active')
      .limit(1);
    const activePlan = plans?.[0] || null;

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
    // STRENGTH PROGRESSION SUGGESTIONS
    // =========================================================================
    const liftGroups = groupByLift(exerciseLogs || []);

    for (const [liftName, sessions] of Object.entries(liftGroups)) {
      if (sessions.length < 3) continue; // MIN_SAMPLES_FOR_SIGNAL

      const recent = sessions.slice(-2);
      const earlier = sessions.slice(0, Math.max(1, sessions.length - 2));

      const recentAvg1rm = avg(recent.map((s) => s.estimated_1rm));
      const earlierAvg1rm = avg(earlier.map((s) => s.estimated_1rm));
      const recentAvgRir = avg(recent.map((s) => s.avg_rir).filter((r) => r != null) as number[]);

      if (recentAvg1rm == null || earlierAvg1rm == null || earlierAvg1rm <= 0) continue;

      const gainPct = ((recentAvg1rm - earlierAvg1rm) / earlierAvg1rm) * 100;

      // Check if we already have an active adjustment for this lift
      const alreadyAdjusted = (existingAdj || []).some(
        (a) => a.exercise_name.toLowerCase() === liftName.toLowerCase() && a.status === 'active',
      );
      if (alreadyAdjusted) continue;

      // Progression: 1RM up 5%+ AND RIR >= 2 (not grinding)
      if (gainPct >= 5 && (recentAvgRir == null || recentAvgRir >= 2)) {
        const baseline1rm = Number(perf[liftName] || perf[liftName.replace(/ /g, '')] || earlierAvg1rm);
        const currentWorkingWeight = roundTo5(baseline1rm * 0.75);
        const suggestedWeight = roundTo5(recentAvg1rm * 0.75);

        if (suggestedWeight > currentWorkingWeight) {
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
            reason: `1RM ${earlierAvg1rm.toFixed(0)} → ${recentAvg1rm.toFixed(0)} (+${gainPct.toFixed(0)}%)${recentAvgRir != null ? `, avg RIR ${recentAvgRir.toFixed(1)}` : ''}`,
          });
        }
      }

      // Deload: RIR trending below 1 (grinding)
      if (recentAvgRir != null && recentAvgRir < 1 && sessions.length >= 3) {
        const earlierRir = avg(earlier.map((s) => s.avg_rir).filter((r) => r != null) as number[]);
        if (earlierRir != null && earlierRir >= 2) {
          const baseline1rm = Number(perf[liftName] || earlierAvg1rm);
          const currentWorkingWeight = roundTo5(baseline1rm * 0.75);
          const suggestedWeight = roundTo5(currentWorkingWeight * 0.9);

          suggestions.push({
            id: `str_deload_${liftName.replace(/\s/g, '_').toLowerCase()}`,
            type: 'strength_deload',
            title: `Reduce ${liftName} weight`,
            description: `Your RIR has dropped significantly. A small deload will help you recover.`,
            exercise: liftName,
            current_value: currentWorkingWeight,
            suggested_value: suggestedWeight,
            unit: isMetric ? 'kg' : 'lbs',
            confidence: 'medium',
            reason: `Avg RIR dropped from ${earlierRir.toFixed(1)} to ${recentAvgRir.toFixed(1)}`,
          });
        }
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

    // FTP update
    if (learnedFtp?.value && learnedFtp?.confidence) {
      const confNum = learnedFtp.confidence === 'high' ? 0.9 : learnedFtp.confidence === 'medium' ? 0.65 : 0.4;
      const manualFtp = Number(perf.ftp);
      const learnedVal = Number(learnedFtp.value);
      if (confNum >= 0.65 && Number.isFinite(manualFtp) && manualFtp > 0 && Number.isFinite(learnedVal)) {
        const deltaPct = Math.abs(learnedVal - manualFtp) / manualFtp;
        if (deltaPct >= 0.05) {
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

    return new Response(JSON.stringify({ suggestions, plan_id: activePlan?.id || null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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

async function acceptSuggestion(
  supabase: any,
  userId: string,
  suggestionId: string,
  today: string,
): Promise<{ applied: boolean; type: string; detail: string }> {
  // Suggestion IDs encode the type: str_prog_<lift>, str_deload_<lift>, end_easy_pace, end_ftp
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
// Rules:
// - Strength weights auto-progress when: 1RM up 5%+ AND avg RIR >= 2 for 3+ sessions
// - Strength weights deload when: avg RIR < 1 for 3+ consecutive sessions
// - Endurance targets update when: learned value differs 7%+ with high confidence
// - Recovery insertion when: response model says "overreaching" with high confidence
// =============================================================================

async function autoAdapt(
  supabase: any,
  userId: string,
  today: string,
  fourWeeksAgo: string,
): Promise<{ adaptations: Array<{ type: string; detail: string; applied: boolean }> }> {
  const adaptations: Array<{ type: string; detail: string; applied: boolean }> = [];

  // 1. Get data
  const [{ data: ub }, { data: exerciseLogs }, { data: existingAdj }, { data: plans }] = await Promise.all([
    supabase.from('user_baselines').select('performance_numbers,learned_fitness,units').eq('user_id', userId).maybeSingle(),
    supabase.from('exercise_log').select('exercise_name,canonical_name,estimated_1rm,avg_rir,workout_date,sets_count')
      .eq('user_id', userId).gte('workout_date', fourWeeksAgo).lte('workout_date', today).order('workout_date', { ascending: true }),
    supabase.from('plan_adjustments').select('exercise_name,applies_from,status')
      .eq('user_id', userId).eq('status', 'active'),
    supabase.from('plans').select('id').eq('user_id', userId).eq('status', 'active').limit(1),
  ]);

  const perf = parseJson(ub?.performance_numbers) || {};
  const learned = parseJson(ub?.learned_fitness) || {};
  const isMetric = String(ub?.units || 'imperial').toLowerCase() === 'metric';
  const planId = plans?.[0]?.id || null;

  // 2. Strength auto-progression
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

    // Auto-progress: consistent improvement + adequate recovery
    if (gainPct >= 5 && recentRirs.length >= 2 && (recentAvgRir == null || recentAvgRir >= 2)) {
      const factor = recentAvg1rm / earlierAvg1rm;

      await supabase.from('plan_adjustments').update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId).ilike('exercise_name', liftName).eq('status', 'active');

      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: liftName,
        adjustment_factor: Math.round(factor * 1000) / 1000,
        applies_from: today,
        reason: `Auto-progression: 1RM +${gainPct.toFixed(0)}% with RIR ≥ 2`,
        status: 'active',
      });

      adaptations.push({
        type: 'strength_progression',
        detail: `${liftName}: weight increased ${gainPct.toFixed(0)}% (1RM ${earlierAvg1rm.toFixed(0)} → ${recentAvg1rm.toFixed(0)})`,
        applied: true,
      });
    }

    // Auto-deload: grinding with low RIR
    if (recentRirs.length >= 3 && recentAvgRir != null && recentAvgRir < 1) {
      await supabase.from('plan_adjustments').update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', userId).ilike('exercise_name', liftName).eq('status', 'active');

      await supabase.from('plan_adjustments').insert({
        user_id: userId,
        plan_id: planId,
        exercise_name: liftName,
        adjustment_factor: 0.9,
        applies_from: today,
        reason: `Auto-deload: avg RIR ${recentAvgRir.toFixed(1)} across 3 sessions`,
        status: 'active',
      });

      adaptations.push({
        type: 'strength_deload',
        detail: `${liftName}: weight reduced 10% (avg RIR ${recentAvgRir.toFixed(1)})`,
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

  return { adaptations };
}
