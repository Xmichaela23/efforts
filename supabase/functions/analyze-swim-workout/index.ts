import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isPlanTransitionWindowByWeekIndex } from '../_shared/plan-week.ts';
import { resolvePoolLength } from '../_shared/swim/resolve-pool-length.ts';
import { detectSwimEquipment } from '../_shared/swim/swim-equipment.ts';
import { swimPacePer100Seconds } from '../_shared/swim/swim-pace.ts';
import { resolveSwimScalars } from '../_shared/swim/swim-scalars.ts';
import { restBandRead } from '../_shared/swim/rest-norm.ts';
// Shared narrative-reasoning core (D-190 — swim leg, the reference). Swim's inline honesty rules were
// the source of the 7 universal rules; this brings its prompt onto the shared scaffold + validators like
// the other three. See docs/WORK-ORDER-narrative-core.md.
import { buildReasoningScaffold, validateNarrative, swimAdapter, applyGroundingContext, spineVerdictFor } from '../_shared/narrative-core/index.ts';
import { detectCrossDomainCarryover, buildCarryoverClause, classifyStrengthFocus, CARRYOVER_WINDOW_DAYS } from '../_shared/cross-domain-carryover.ts';

// =============================================================================
// ANALYZE-SWIM-WORKOUT - SWIMMING ANALYSIS EDGE FUNCTION
// =============================================================================
// 
// FUNCTION NAME: analyze-swim-workout
// PURPOSE: Comprehensive analysis for swimming workouts
// 
// WHAT IT DOES:
// - Analyzes swim workouts with prescribed pace/distance targets
// - Compares executed vs planned workout targets
// - Provides interval-by-interval execution breakdown
// - Analyzes stroke efficiency (SWOLF, stroke rate)
// - Handles pool vs open water differences
// - Generates plan-aware insights using GPT-4
// 
// SUPPORTED WORKOUT TYPES:
// - swim
// 
// DATA SOURCES:
// - workouts.swim_data (pool length, strokes, SWOLF)
// - workouts.intervals (swim intervals)
// - workouts.computed (processed intervals, overall metrics)
// - planned_workouts.intervals (prescribed pace/distance ranges)
// 
// ANALYSIS OUTPUT:
// - adherence_percentage: % of time/distance spent in prescribed ranges
// - interval_breakdown: per-interval execution quality
// - stroke_analysis: SWOLF, stroke rate, efficiency
// - performance_assessment: descriptive text based on metrics
// 
// INPUT: { workout_id: string }
// OUTPUT: { success: boolean, analysis: SwimWorkoutAnalysis }
// =============================================================================

// CORS helper function
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400'
  };
}

// Parse progression history from description or structured tags
function parseProgressionHistory(description: string, tags?: string[]): string[] | null {
  // First try structured tag if available (for future-proofing)
  if (tags && Array.isArray(tags)) {
    const progressionTag = tags.find((t: string) => t.startsWith('progression:') || t.startsWith('volume_progression:'));
    if (progressionTag) {
      const progression = progressionTag.split(':')[1];
      // Format depends on tag type - could be "400yd_800yd_1200yd" or similar
      return progression.split('_').map(p => p.trim());
    }
  }
  
  // Fallback to description parsing (e.g., "400yd → 800yd → 1200yd")
  if (description) {
    const match = description.match(/(\d+[a-z]+.*?→.*?\d+[a-z]+)/i);
    if (match) {
      return match[0].split('→').map(p => p.trim());
    }
  }
  
  return null;
}

// Parse phase info from tags
function parsePhaseFromTags(tags: string[]): { phase: string | null, week: string | null, totalWeeks: string | null } {
  if (!tags || !Array.isArray(tags)) return { phase: null, week: null, totalWeeks: null };
  
  const phaseTag = tags.find((t: string) => t.startsWith('phase:'));
  const phase = phaseTag ? phaseTag.split(':')[1].replace(/_/g, ' ') : null;
  
  const weekTag = tags.find((t: string) => t.startsWith('week:'));
  let week: string | null = null;
  let totalWeeks: string | null = null;
  if (weekTag) {
    const parts = weekTag.split(':')[1].split('_of_');
    week = parts[0];
    totalWeeks = parts[1];
  }
  
  return { phase, week, totalWeeks };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests FIRST
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  let workout_id: string | undefined;
  let supabase: any = null;

  try {
    const body = await req.json();
    workout_id = body.workout_id;

    if (!workout_id) {
      return new Response(JSON.stringify({ error: 'workout_id is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    supabase = createClient(supabaseUrl, supabaseKey);

    // D-103: in-handler user-JWT auth gate REMOVED (same root cause as
    // strength — every internal invoker passes service role, which has no
    // user.id, so the gate returned 401 silently and swim narratives
    // failed to generate on the recompute-workout / ingest-activity path).
    // Mirror cycling + run analyzers: trust service-role caller, read
    // workout.user_id from the row. Cross-check at the prior line 194 is
    // also removed; authorization is enforced upstream by recompute-workout
    // (user JWT validated + workout user-id verified before invoke) and by
    // ingest-activity (webhook-trusted service-role context).

    // Set analysis status to 'analyzing'
    await supabase
      .from('workouts')
      .update({
        analysis_status: 'analyzing',
        analysis_error: null
      })
      .eq('id', workout_id);

    // Get workout with swim-specific fields
    const { data: workout, error: workoutError } = await supabase
      .from('workouts')
      .select(`
        id,
        type,
        date,
        duration,
        distance,
        moving_time,
        elapsed_time,
        avg_heart_rate,
        max_heart_rate,
        avg_speed,
        max_speed,
        rpe,
        feeling,
        swim_data,
        intervals,
        computed,
        planned_id,
        user_id,
        pool_length,
        pool_length_m,
        plan_pool_length_m,
        user_corrected_pool_length_m,
        pool_unit,
        environment,
        workout_metadata
      `)
      .eq('id', workout_id)
      .single();

    if (workoutError || !workout) {
      throw new Error(`Workout not found: ${workoutError?.message || 'No workout found'}`);
    }

    // D-103: per-user cross-check removed alongside the JWT gate above.
    // Authorization enforced upstream (recompute-workout user-id check,
    // ingest-activity webhook-trusted). Matches cycling/run pattern.

    // Check if it's a swim workout
    if (workout.type !== 'swim') {
      return new Response(JSON.stringify({
        error: 'This function only handles swim workouts',
        workout_type: workout.type
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders()
        }
      });
    }

    // D-199 (Layer A): swim HR is NOT anchored to any run-derived threshold. The D-183 fetch here used
    // configured_hr_zones / learned run_threshold_hr (a run/max-derived set) — directionally WRONG for
    // swim, which runs ~10–15 bpm below run HR for the same effort (SPEC-honest-swim-inference: horizontal
    // position, water cooling, smaller muscle mass). Borrowing the run anchor over-reads every swim as
    // easier than it was. Until a swim-specific intensity model exists (CSS, Layer C), swim HR stays
    // UNANCHORED and the narrative is told to stay neutral on HR. The fetch is removed (it only fed the
    // now-deleted run-anchor zone builder).

    // Get planned workout if available
    let plannedWorkout: any = null;
    let planContext: any = null;

    if (workout.planned_id) {
      const { data: planned, error: plannedError } = await supabase
        .from('planned_workouts')
        .select('id, intervals, steps_preset, computed, total_duration_seconds, description, tags, training_plan_id, pool_length_m, pool_unit, swim_unit, user_id')
        .eq('id', workout.planned_id)
        .eq('user_id', workout.user_id) // Authorization: verify planned workout belongs to user
        .single();

      if (!plannedError && planned) {
        // Verify planned workout belongs to user (authorization check)
        if (planned.user_id && planned.user_id !== workout.user_id) {
          console.warn('⚠️ Planned workout does not belong to user - skipping plan context');
        } else {
          plannedWorkout = planned;
          
          // Extract plan-aware context
          if (planned.training_plan_id) {
            try {
              const weekTag = planned.tags?.find((t: string) => t.startsWith('week:'));
              const weekNumber = weekTag ? parseInt(weekTag.split(':')[1].split('_of_')[0]) : 1;
              
            // NOTE: planned_workouts.training_plan_id references the 'plans' table, not 'training_plans'
            let trainingPlan = null;
            const { data: planData, error: planError } = await supabase
              .from('plans')
              .select('*')
              .eq('id', planned.training_plan_id)
              .eq('user_id', workout.user_id) // Authorization: verify plan belongs to user
              .single();
            
            if (!planError && planData) {
              trainingPlan = planData;
            } else if (planError) {
              // Fallback: try 'training_plans' table (legacy)
              console.log('⚠️ Plan not found in plans table, trying training_plans...');
              const { data: legacyPlanData } = await supabase
                .from('training_plans')
                .select('*')
                .eq('id', planned.training_plan_id)
                .eq('user_id', workout.user_id)
                .single();
              
              if (legacyPlanData) {
                trainingPlan = legacyPlanData;
              }
            }
              
              if (trainingPlan) {
                // Double-check user ownership (defense in depth)
                if (trainingPlan.user_id === workout.user_id) {
                  const { phase, week, totalWeeks } = parsePhaseFromTags(planned.tags || []);
                  const weeklySummary = trainingPlan.config?.weekly_summaries?.[weekNumber] || 
                                        trainingPlan.weekly_summaries?.[weekNumber] || null;
                  const progressionHistory = parseProgressionHistory(planned.description || '', planned.tags || []);
                  
                  planContext = {
                    plan_name: trainingPlan.name || 'Training Plan',
                    week: weekNumber,
                    total_weeks: trainingPlan.duration_weeks || 0,
                    phase: phase || 'unknown',
                    weekly_summary: weeklySummary,
                    progression_history: progressionHistory,
                    session_description: planned.description || '',
                    session_tags: planned.tags || [],
                    plan_description: trainingPlan.description || ''
                  };
                } else {
                  console.warn('⚠️ Training plan does not belong to user - skipping plan context');
                }
              }
            } catch (error) {
              console.log('⚠️ Failed to extract plan context:', error);
            }
          }
        }
      }
    }

    // Parse swim data
    const swimData = workout.swim_data || {};
    const intervals = workout.intervals || [];
    const computed = workout.computed || {};
    
    // Calculate basic metrics
    // D-182: swim scalars (moving/elapsed seconds, distance, avg HR) from the RAW workouts columns via
    // the ONE shared resolver — the SAME source the Performance card (build.ts) now reads, so card and
    // narrative can never diverge on pace/HR again. computed.overall is NOT authoritative for swims.
    const swimScalars = resolveSwimScalars(workout);
    const totalDistanceMeters = swimScalars.distanceMeters ?? 0;
    // D-167: pool length via the ONE resolver (user_corrected → device → planned → default) — the
    // analyzer was defaulting to 25 (m/yd) and ignoring the athlete's post-swim correction (D-164).
    const poolLength = resolvePoolLength({
      user_corrected_pool_length_m: (workout as any).user_corrected_pool_length_m,
      pool_length: (workout as any).pool_length ?? (workout as any).pool_length_m,
      plan_pool_length_m: (workout as any).plan_pool_length_m,
    }).length_m;
    // Display/pace unit = the plan's swim unit (matches the Performance tab, build.ts plannedTotals.swim_unit),
    // defaulting to yd; pool PHYSICAL length is separate (above) and may be metres in a yard-plan pool.
    const poolUnit: 'yd' | 'm' = ((plannedWorkout as any)?.swim_unit || workout.pool_unit || 'yd') === 'm' ? 'm' : 'yd';

    const isPool = workout.environment !== 'open_water';

    // D-167/D-182: pace via the SHARED helper, fed by the SHARED raw-column scalar, so the narrative
    // pace == the Performance-tab pace. Was computing per-100m and mislabeling as /100yd ("2:11" vs the
    // true "2:00"); D-182 further pins moving-seconds to the raw column (not computed.overall).
    const _movingSeconds = swimScalars.movingSeconds;
    const avgPacePer100 = swimPacePer100Seconds(_movingSeconds, totalDistanceMeters, poolUnit) ?? 0;

    // Physical pool length display (separate from the pace unit): 25/50 yd pools read in yd, 25/50 m in m.
    const poolDisplay = (() => {
      const Lm = Number(poolLength);
      if (!(Lm > 0)) return null;
      const isYdPool = (Lm >= 22 && Lm <= 24) || (Lm >= 44 && Lm <= 47); // 25yd ≈ 22.86m, 50yd ≈ 45.72m
      return isYdPool ? `${Math.round(Lm / 0.9144)} yd` : `${Math.round(Lm)} m`;
    })();

    // Analyze intervals if available
    const intervalAnalysis = intervals.map((interval: any, idx: number) => {
      const plannedInterval = plannedWorkout?.intervals?.[idx] || plannedWorkout?.computed?.steps?.[idx];
      
      return {
        interval_number: idx + 1,
        distance: interval.distance || 0,
        duration: interval.duration || 0,
        pace_per_100: interval.pace_per_100 || 0,
        stroke_type: interval.stroke_type || swimData.strokeType || 'Freestyle',
        planned_distance: plannedInterval?.distance || null,
        planned_pace: plannedInterval?.pace_per_100 || null,
        adherence: plannedInterval ? 
          (interval.pace_per_100 && plannedInterval.pace_per_100 ? 
            Math.max(0, 100 - Math.abs((interval.pace_per_100 - plannedInterval.pace_per_100) / plannedInterval.pace_per_100 * 100)) : 
            100) : 
          null
      };
    });

    // Calculate overall adherence
    // D-035: When no per-interval adherence is computable (no linked plan, or
    // planned intervals lack pace_per_100 targets), return null — not 100.
    // The prior 100 default lied about every unlinked swim being a perfect
    // execution. Adherence requires a prescription to measure against.
    const intervalsWithAdherence = intervalAnalysis.filter((i: any) => i.adherence !== null);
    const overallAdherence: number | null = intervalsWithAdherence.length > 0 ?
      intervalsWithAdherence.reduce((sum: number, i: any) => sum + i.adherence, 0) / intervalsWithAdherence.length :
      null;

    // D-035: Compute a real duration_adherence for linked swims. The prior
    // hardcoded `100` was a TODO for linked swims AND a fake-perfect-score for
    // unlinked. Both modes are now honest: linked → ratio-based score;
    // unlinked → null.
    // D-163: planned swim duration is TOTAL session time (warmup + sets + REST + cooldown), so compare
    // it to the athlete's ELAPSED pool time — NOT moving time, which excludes rest. The old moving-vs-
    // total comparison understated adherence badly (24 min moving / 31 min planned = 77%, when the
    // athlete was in the pool the full ~35 min). Reported as a RAW completion ratio (matches the
    // distance chip: >100% = did more than planned), uncapped for display; the execution-score blend
    // clamps it to 100 below so a long session can't inflate the quality score.
    // Elapsed pool time in seconds (handles the integer-minute storage convention). Drives the duration
    // adherence AND is surfaced on `performance` so the swim block shows TOTAL time, not moving time.
    const _swimElapsedSec: number | null = (() => {
      const raw = Number(workout.elapsed_time ?? workout.moving_time ?? 0);
      return raw > 0 ? (raw < 1000 ? raw * 60 : raw) : null;
    })();
    const _swimDurationAdherence: number | null = (() => {
      if (!plannedWorkout) return null;
      const plannedSec = Number(
        plannedWorkout?.total_duration_seconds ??
        plannedWorkout?.computed?.total_duration_seconds ?? 0
      );
      if (!(plannedSec > 0 && _swimElapsedSec != null && _swimElapsedSec > 0)) return null;
      return Math.round((_swimElapsedSec / plannedSec) * 100);
    })();

    // SWIM = FACTS ONLY, NO INTERPRETATION (2026-07-19, D-304 principle). Watch/goggle swim data is too
    // unreliable to interpret honestly (equipment, lap detection, set type), so we show the numbers and
    // say nothing — the athlete who cares uses their own system. The LLM narrative is DISABLED; the
    // deterministic facts fallback below (distance / pace / intervals) is the read. Dead block → sweep.
    let narrativeInsights: string[] = [];
    // Gate on an env var that is never set → the LLM block never runs (swim = facts only). Kept as a
    // runtime gate rather than `if (false)` so TS control-flow/definite-assignment is unchanged.
    if (Deno.env.get('SWIM_INSIGHTS_LLM') === '1' && Deno.env.get('ANTHROPIC_API_KEY')) {
      try {
        // D-168: swim has no power/GPS/per-length data, so build the read around what it DOES have —
        // HR, the work:rest split (moving vs elapsed), and the felt/RPE signal (swim's best subjective
        // input, the equivalent of the ride's power data). Observe the rest pattern; never diagnose why.
        const _elapsedSeconds = swimScalars.elapsedSeconds;
        const movingMin = _movingSeconds ? Math.round(_movingSeconds / 60) : null;
        const elapsedMin = _elapsedSeconds ? Math.round(_elapsedSeconds / 60) : null;
        const restMin = (movingMin != null && elapsedMin != null && elapsedMin > movingMin) ? (elapsedMin - movingMin) : null;
        // D-195 (D-180): rest-fraction NORM read — gives the work:rest read meaning vs the session's
        // expected band. Single-sourced from swimScalars (same scalar as pace/HR). Intent derived from
        // the planned tags (session_type/hardness are null for swims). SILENT when intent doesn't map
        // or there's no rest fraction. Observe the band position — NEVER diagnose the cause (backstopped
        // by the D-192 REST_CAUSE post-check).
        const _restFraction = (_movingSeconds != null && _elapsedSeconds != null && _elapsedSeconds > _movingSeconds && _movingSeconds > 0)
          ? (_elapsedSeconds - _movingSeconds) / _elapsedSeconds
          : null;
        const _restBand = restBandRead(_restFraction, plannedWorkout?.tags);
        const restBandNote = (() => {
          if (!_restBand) return null;
          const pct = Math.round(_restBand.restFraction * 100);
          const lo = Math.round(_restBand.band[0] * 100), hi = Math.round(_restBand.band[1] * 100);
          const LABEL: Record<string, string> = { technique: 'technique/drill', speed: 'speed/sprint', threshold: 'threshold', endurance: 'endurance/aerobic', long_continuous: 'long continuous' };
          const label = LABEL[_restBand.intent] ?? _restBand.intent;
          if (_restBand.position === 'in_band') return `Rest fraction (~${pct}%) is WITHIN the typical ${lo}–${hi}% band for a ${label} swim — unremarkable; do not single it out.`;
          if (_restBand.position === 'below_band') return `Rest fraction (~${pct}%) is BELOW the typical ${lo}–${hi}% band for a ${label} swim — you MAY note this quietly and positively (less rest than typical for this kind of session). Do NOT diagnose why.`;
          return `Rest fraction (~${pct}%) is ABOVE the typical ${lo}–${hi}% band for a ${label} swim — you MAY note it gently, as an OBSERVATION ONLY. NEVER state or imply a cause (not fatigue, effort, prescribed rest, equipment, or wall time — one rest number cannot separate these).`;
        })();
        const rpeVal = Number.isFinite(Number(workout.rpe)) && Number(workout.rpe) > 0 ? Number(workout.rpe) : null;
        const feelLabel = (typeof workout.feeling === 'string' && workout.feeling.trim()) ? workout.feeling.trim() : null;

        // D-183 bug 1: anchor HR to the athlete's zones and read effort from the AVERAGE, not the peak.
        // Build the zone bands the same way the run analyzer does (configured_hr_zones → Friel %LTHR
        // from learned threshold), then classify the AVG HR. hrZoneCtx is null when no threshold is on
        // file → the prompt is told to stay neutral (never call HR "elevated" without zones to judge by).
        // D-199 (Layer A): no valid swim HR anchor exists today, so hrBands is null → hrZoneCtx is null →
        // the prompt stays neutral on HR (never "easy"/"elevated"). This replaces the D-183 run-anchored
        // builder (run_threshold_hr × Friel %LTHR), which mis-read swim effort. HR is soft context only;
        // the swim verdict comes from pace (vs CSS once Layer C lands), never HR. Keeping this null also
        // keeps the narrative consistent with the swim baseline UI, which shows no run-derived HR zones.
        const hrBands: { z1Max: number; z2Max: number; z3Max: number; z4Max: number; thr: number } | null = null;
        const hrZoneCtx = (() => {
          const h = Number(swimScalars.avgHr);
          if (!hrBands || !(h > 0)) return null;
          let zone: number, label: string;
          if (h <= hrBands.z1Max) { zone = 1; label = 'recovery'; }
          else if (h <= hrBands.z2Max) { zone = 2; label = 'easy aerobic'; }
          else if (h <= hrBands.z3Max) { zone = 3; label = 'moderate aerobic'; }
          else if (h <= hrBands.z4Max) { zone = 4; label = 'threshold'; }
          else { zone = 5; label = 'above threshold'; }
          return { zone, label, threshold: hrBands.thr, easy: zone <= 2 };
        })();

        // D-183 + D-190 (Q-061 narrative half, BOTH directions): detect equipment from the D-162 capture
        // (swim_steps_equipment_confirmed / swim_equipment_unplanned) and classify its DIRECTIONAL effect on
        // pace — never quantified. fins/buoy/paddles speed pace UP (optimistic); kickboard/kick/drill slow it
        // DOWN (pessimistic); snorkel ~neutral. D-183 flagged only the fins/optimistic half; D-190 adds the
        // kick/drill pessimistic half. (Trend-substrate exclusion stays in the held swim-cleanup work order.)
        // Single-sourced via the shared detectSwimEquipment (was an inline mirror of the exact same
        // regexes + metadata keys, kept in manual sync — collapsed per the swim audit). Behavior-identical;
        // output shape preserved for the prompt fields below. names = actual gear (narrative names ONLY
        // these, D-192); optimistic/pessimistic are INTERNAL direction flags, never recited as gear.
        const _swimEquip = detectSwimEquipment((workout as any).workout_metadata);
        const equipmentDir = {
          names: _swimEquip.names,
          optimistic: _swimEquip.direction === 'optimistic' || _swimEquip.direction === 'mixed', // reads FASTER (INTERNAL)
          pessimistic: _swimEquip.direction === 'pessimistic' || _swimEquip.direction === 'mixed', // reads SLOWER (INTERNAL)
        };

        const workoutContext = {
          type: workout.type,
          duration: workout.duration || 0,
          // D-167 cont.: feed distance in the DISPLAY unit (yards here) so the narrative matches the UI
          // (1203 yd / 2:00 per 100yd / 22 lengths) instead of leaking "1100 metres" + a metres pace.
          distance: poolUnit === 'yd' ? Math.round(totalDistanceMeters / 0.9144) : Math.round(totalDistanceMeters),
          distance_unit: poolUnit === 'yd' ? 'yards' : 'meters',
          avg_pace_per_100: avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A',
          pool_length: poolLength,
          pool_unit: poolUnit,
          environment: isPool ? 'pool' : 'open water',
          avg_heart_rate: swimScalars.avgHr,
          max_heart_rate: workout.max_heart_rate || null,
          // D-183: zone-anchored read of the AVERAGE HR (null when no threshold on file → stay neutral)
          avg_hr_zone: hrZoneCtx ? `Zone ${hrZoneCtx.zone}` : null,
          avg_hr_label: hrZoneCtx ? hrZoneCtx.label : null,
          hr_threshold: hrZoneCtx ? hrZoneCtx.threshold : null,
          hr_is_easy: hrZoneCtx ? hrZoneCtx.easy : null,
          equip_optimistic: equipmentDir.optimistic, // INTERNAL: fins/buoy/paddles → pace reads faster
          equip_pessimistic: equipmentDir.pessimistic, // INTERNAL: kick/drill → pace reads slower
          equip_names: equipmentDir.names, // D-192: the ACTUAL equipment used — name ONLY these in prose
          stroke_type: swimData.strokeType || 'Freestyle',
          intervals_completed: intervals.length,
          overall_adherence: overallAdherence != null ? Math.round(overallAdherence) : null,
          moving_min: movingMin,
          elapsed_min: elapsedMin,
          rest_min: restMin,
          rest_band_note: restBandNote, // D-195: rest-fraction norm read (null = silent)
          rpe: rpeVal,
          feeling: feelLabel,
        };

        let prompt = `You are analyzing a swimming workout. Generate 3-4 concise, data-driven observations based on the metrics below.

CRITICAL RULES:
- SECOND PERSON — address the swimmer directly as "you" ("You covered…", "Your heart rate…"), matching the coaching voice the run and ride analyses use. NEVER "the swimmer" or third person.
- PLAIN PROSE ONLY — no Markdown. No "#" headers, no "**bold**", no numbered section titles, no labels. Each observation is one or two complete sentences. Separate observations with a blank line.
- INTERPRET, DON'T LIST — reason from the RELATIONSHIP between the signals (RPE, heart rate, pace, work:rest), not a recital of each number. Swim has no power or GPS, so these are what you have; read how they fit together and what that says about the session.
- RPE + HR COHERENCE: read effort from the AVERAGE heart rate and the heart-rate ZONE given below, NEVER from the peak/max — a brief peak is a momentary high, not the session's effort, so do not build the read on it. When the average sits in an easy zone (recovery / easy aerobic), a low RPE alongside it is COHERENT — a genuinely easy aerobic swim — say exactly that; do NOT manufacture "working harder than perceived", "more taxing than the numbers imply", or any RPE-vs-HR tension out of the peak or the absolute bpm. Only read the swim as HARDER than the numbers suggest when the AVERAGE HR is genuinely elevated (moderate-aerobic zone or above) against a low RPE, OR a high RPE sits at a modest pace; the read may slide DOWNWARD when the signals genuinely point to a grind, but never force tension the average does not support. If NO heart-rate zone is given below (no athlete threshold on file), do NOT characterize HR as elevated or easy — report the average plainly and reason from RPE, pace and work:rest instead.
- EQUIPMENT — name ONLY the exact equipment listed in the "Equipment used" line below (those are the actual confirmed items for THIS swim). NEVER name gear that isn't on that line — do not list fins/buoy/paddles as a set or guess what "kind" of equipment was used; if the line says "fins, snorkel" you say fins and snorkel, nothing else. Flag the pace DIRECTION the line gives (faster / slower / both ways) in one plain clause, but NEVER quantify it (no per-set splits, no "X seconds faster/slower", no unaided-pace estimate). If no equipment line is given, do not mention equipment at all.
- WORK:REST is a FIRST-CLASS signal, NOT an afterthought — whenever the work-vs-rest line is given below, the proportion of the session spent actively swimming versus resting MUST be read as part of the interpretation, on equal footing with RPE/HR/pace. Weave it into the FIRST/opening observation (the lead that reasons about the session's overall character), not only a trailing bullet — the lead should reason from RPE + HR + pace + work:rest TOGETHER. A high rest fraction (lots of elapsed over moving) means more of the session was spent recovering — read it against the session's intent when known (more recovery on a technique/drill swim is unremarkable; the same on a sustained aerobic set suggests effort was being managed). Characterize the pattern's MEANING; still do NOT assert the specific cause (don't claim the sets were hard or the rest was deliberate — interpret the relationship, never diagnose the why).
- UNIT CONSISTENCY: every distance and pace is in ${poolUnit === 'yd' ? 'YARDS' : 'METRES'}. Use that unit only. Do NOT convert to or mention the other unit anywhere — no "X ${poolUnit === 'yd' ? 'metres' : 'yards'}", no "≈ Y per 100 ${poolUnit === 'yd' ? 'm' : 'yd'}" translations. (The pool's physical length is given in its own build unit below — state it as-is; do NOT convert distances or paces to match it.)
- NO INVENTED MATH: state only the metrics listed below. Do NOT compute or estimate derived values that are not given — no number of lengths, no stroke counts, no calories, no per-minute rates. Mixing the pool unit with the distance unit to "estimate lengths" is wrong and forbidden.
- Write like "a chart in words" - factual observations only
- NO motivational language ("great job", "keep it up")
- NO subjective judgments ("slow", "bad", "should have")
- NO generic advice ("swim more", "push harder")
- Focus on WHAT HAPPENED, not what should happen
- Use specific numbers and time references
- Describe patterns visible in the data
${planContext ? `
- CRITICAL: Reference plan context when available - explain WHY workout was programmed, whether performance matches plan expectations, and what's coming next week
- Contextualize adherence relative to phase goals (e.g., Foundation Build vs Peak Strength)
` : ''}

Workout Profile:
- Type: ${workoutContext.type}
- Duration: ${workoutContext.duration} minutes
- Distance: ${workoutContext.distance.toFixed(0)} ${workoutContext.distance_unit}
- Avg Pace: ${workoutContext.avg_pace_per_100} per 100${poolUnit}
- Pool Length: ${poolDisplay ?? 'unknown'}
- Environment: ${workoutContext.environment}
- Stroke Type: ${workoutContext.stroke_type}
${workoutContext.avg_heart_rate ? `- Avg HR: ${workoutContext.avg_heart_rate} bpm${workoutContext.avg_hr_zone ? ` — ${workoutContext.avg_hr_zone} (${workoutContext.avg_hr_label})${workoutContext.hr_threshold ? `, against your threshold HR ~${workoutContext.hr_threshold} bpm` : ''}` : ''}${workoutContext.max_heart_rate ? ` · brief peak ${workoutContext.max_heart_rate} bpm (a momentary high, NOT the session's effort)` : ''}` : ''}
${(workoutContext.equip_names && workoutContext.equip_names.length > 0)
  ? `- Equipment used (name ONLY these, exactly — no other gear): ${workoutContext.equip_names.join(', ')}. Pace-direction: ${(workoutContext.equip_optimistic && workoutContext.equip_pessimistic) ? 'this mixes fast-assist AND slow gear, so the average pace above is pulled BOTH ways and is NOT a clean fitness-comparable number' : workoutContext.equip_optimistic ? 'reads FASTER than your unaided swimming' : workoutContext.equip_pessimistic ? 'reads SLOWER than your actual swimming pace' : 'roughly neutral'} (flag the direction; do NOT quantify).`
  : ''}
${workoutContext.rest_min != null ? `- Work vs rest: ${workoutContext.moving_min} min of moving (work) across a ${workoutContext.elapsed_min} min session (~${workoutContext.rest_min} min rest)` : ''}
${workoutContext.rest_band_note ? `- Rest norm (D-195): ${workoutContext.rest_band_note}` : ''}
${workoutContext.rpe != null ? `- Perceived effort (RPE): ${workoutContext.rpe}/10` : ''}
${workoutContext.feeling ? `- Felt: ${workoutContext.feeling}` : ''}
${intervals.length > 0 ? `- Intervals Completed: ${workoutContext.intervals_completed}` : ''}
${plannedWorkout && workoutContext.overall_adherence != null ? `- Overall Adherence: ${workoutContext.overall_adherence}%` : ''}
`;

        if (planContext) {
          prompt += `

═══════════════════════════════════════════════════════════════
📋 PLAN CONTEXT
═══════════════════════════════════════════════════════════════

Plan: ${planContext.plan_name}
Week: ${planContext.week} of ${planContext.total_weeks}
Phase: ${planContext.phase}
${planContext.weekly_summary?.focus ? `
WEEK ${planContext.week} FOCUS:
"${planContext.weekly_summary.focus}"
` : ''}
${planContext.weekly_summary?.key_workouts && planContext.weekly_summary.key_workouts.length > 0 ? `
KEY WORKOUTS THIS WEEK:${planContext.weekly_summary.key_workouts.map((w: string) => `\n• ${w}`).join('')}
` : ''}
${planContext.weekly_summary?.notes ? `
WEEK NOTES:
${planContext.weekly_summary.notes}
` : ''}
${planContext.progression_history ? `
PROGRESSION HISTORY:
${planContext.progression_history.join(' → ')}
` : ''}
`;
        }

        if (intervals.length > 0 && intervalAnalysis.length > 0) {
          prompt += `

INTERVAL BREAKDOWN:
${intervalAnalysis.slice(0, 10).map((i: any) => 
  `- Interval ${i.interval_number}: ${i.distance}${poolUnit} @ ${i.pace_per_100 > 0 ? formatPace(i.pace_per_100) : 'N/A'} per 100${poolUnit}${i.adherence !== null ? ` (${Math.round(i.adherence)}% adherence)` : ''}`
).join('\n')}
`;
        }

        prompt += `

Write 3-4 plain-prose observations addressed to the swimmer as "you" (one or two sentences each). No headers, no bold, no numbered titles — just sentences. The FIRST observation is the lead read of the session's overall character and MUST integrate every signal you have — RPE, heart rate, pace, AND the work:rest split (when given) — into one honest verdict; do not save work:rest for last. Read how RPE, heart rate, pace, and work:rest fit TOGETHER — if they say it was a grind or a harder day than the pace alone implies, say so honestly; do not force positivity:`;

        const { callLLM } = await import('../_shared/llm.ts');
        // D-190: append the shared reasoning-core scaffold (swim addendum carries the bidirectional
        // equipment-direction rule) + run the shared validators with a retry. Swim is the reference — the
        // validators must PASS its compliant output (acceptance gate, now AS the live path); the loop is a
        // backstop, the scaffold/inline-rules are the primary driver. Assembly NOT unified (guardrail #1).
        const ncCtx = swimAdapter.buildContext(workoutContext);
        // rules 6/7: swim spine verdict from state_trends_v1 (swim has no getArcContext, so a minimal
        // latest-snapshot read — the single source, same as the other disciplines).
        let swim_spine_verdict: any = null;
        try {
          const { data: snap } = await supabase.from('athlete_snapshot')
            .select('state_trends_v1').eq('user_id', workout.user_id)
            .order('week_start', { ascending: false }).limit(1).maybeSingle();
          swim_spine_verdict = spineVerdictFor((snap as any)?.state_trends_v1, 'swim');
        } catch { swim_spine_verdict = null; }
        // App-wide grounding (shared helper): rule 8 (unplanned ⇒ no pace-target/adherence claim), rule 10
        // (swim has no arc phase source, so any phase label is invented → rejected), rules 6/7 (spine).
        applyGroundingContext(ncCtx, { isUnplanned: !plannedWorkout, planPhaseNormalized: null, spineVerdict: swim_spine_verdict });
        const swimSystem = 'You are a swimming coach giving an athlete feedback on their swim. Write in the second person (address them as "you"), in plain prose sentences only — never Markdown, headers, bold, or numbered section titles.'
          + buildReasoningScaffold(swimAdapter, workoutContext);
        const callSwim = (userMsg: string) => callLLM({ system: swimSystem, user: userMsg, maxTokens: 500, temperature: 0.3 });
        // D-192: swim-specific post-checks wrapping the shared validators (like the coach add-ban — these
        // are swim-only concerns, not universal). (1) EQUIPMENT-SUBSET (Bug 1, rule 6): any equipment word
        // named in the prose must be in the actual confirmed list — never name gear that wasn't used (the
        // narrative recited the fins/buoy/paddles CATEGORY list as fact). (2) REST-CAUSE (Bug 2, rule 4 /
        // swim hard-boundary #1): never assert WHAT the rest was (technique/mixed/fatigue/structure) — state
        // the fraction + whether typical for a KNOWN intent, never diagnose the why.
        const EQUIP_VOCAB = ['fins', 'fin', 'buoy', 'pull buoy', 'paddle', 'paddles', 'kickboard', 'kick board', 'kick', 'snorkel', 'drill', 'drills', 'board'];
        const REST_CAUSE = /\b(technique|drill|mixed.?intent|recovery)\s+(session|structure|format|work|set)\b|\bstructured set format\b|\bconsistent with a (technique|drill|mixed|recovery)|\brather than (a sign of |)?(fatigue|effort|load)\b|\b(fatigue|effort)\s+management\b|\bmanaging (fatigue|effort)\b|\bdeliberate rest\b/i;
        const swimPostChecks = (text: string): string[] => {
          const fails: string[] = [];
          const actuals = (workoutContext.equip_names || []).map((s) => s.toLowerCase());
          const lc = (text || '').toLowerCase();
          for (const w of EQUIP_VOCAB) {
            if (lc.includes(w) && !actuals.some((a) => a.includes(w.replace(/s$/, '')) || w.includes(a.replace(/s$/, '')))) {
              fails.push(`Named equipment "${w}" that was NOT used this swim. Name ONLY the actual equipment: ${actuals.length ? actuals.join(', ') : '(none — do not mention equipment)'}.`);
              break;
            }
          }
          if (REST_CAUSE.test(text)) fails.push(`Diagnosed WHY the rest happened (technique/mixed/fatigue/structure). State the rest fraction and, only against a KNOWN planned intent, whether it's typical — never assert what the rest WAS.`);
          return fails;
        };
        let swContent = await callSwim(prompt);
        if (swContent) {
          const nc = validateNarrative(swContent, ncCtx);
          const post = swimPostChecks(swContent);
          if (!nc.ok || post.length) {
            console.warn('[analyze-swim] narrative rejected:', JSON.stringify([...nc.failures.map((f) => f.code), ...post.map(() => 'swim_post')]));
            const allFails = [...nc.failures.map((f) => f.why), ...post];
            const s2 = await callSwim(prompt + '\n\nYour previous draft violated these rules:\n' + allFails.map((f) => '- ' + f).join('\n') + '\nRewrite the observations fixing these.');
            if (s2) swContent = s2; // retry-then-soft-accept (never regress to no narrative)
          }
        }

        if (swContent) {
          // Prose-first prompt is the primary defense; this is a backstop that strips any stray Markdown
          // (leading #, **bold**) and drops header-only / label-only lines so the narrative never leads
          // with "# Swim Workout Analysis" or a bare "1. Pace consistency" bold header (D-167).
          const stripMd = (s: string) => s
            .replace(/^\s*#{1,6}\s*/, '')        // leading "# "
            .replace(/^\s*[-*•]\s+/, '')          // bullet marker
            .replace(/^\s*\d+[.)]\s*/, '')        // "1." / "1)"
            .replace(/\*\*/g, '')                  // bold markers
            .replace(/^\*\*?|\*\*?$/g, '')
            .trim();
          const isHeaderOnly = (s: string) =>
            s.length < 18 ||                        // too short to be a real observation
            !/[a-z]/.test(s) ||                     // no lowercase → likely a TITLE
            (!/[.!?]$/.test(s) && s.split(/\s+/).length <= 6); // short, no terminal punctuation
          narrativeInsights = swContent.split('\n')
            .map(stripMd)
            .filter((line: string) => line.length > 0 && !isHeaderOnly(line))
            .slice(0, 4);

          if (narrativeInsights.length === 0) {
            narrativeInsights = [stripMd(swContent).substring(0, 200)];
          }

          // Axis 1 — cross-domain carryover (SWIM card). Directionality: UPPER/full lift → swim. Swim's
          // objective effort signal is the WEAKEST of the three (in-water HR unreliable; comparable swims
          // sparse), so this is gated TIGHTLY to avoid fabrication: pace-per-100 slower than the athlete's
          // recent SAME-STROKE baseline (≥3 comparables) by a meaningful margin, declared-easy vetoes.
          // Rarely fires — which is the honest outcome until a reliable swim-efficiency signal exists.
          try {
            const uid2 = (workout as any)?.user_id;
            const wDate2 = String((workout as any)?.date || '').slice(0, 10);
            const stroke = String((swimData as any)?.strokeType || 'Freestyle');
            if (uid2 && /^\d{4}-\d{2}-\d{2}$/.test(wDate2) && Number(avgPacePer100) > 0) {
              const winS = new Date(new Date(wDate2 + 'T12:00:00Z').getTime() - CARRYOVER_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
              const { data: recStr2 } = await supabase.from('workouts')
                .select('date, strength_exercises, workload_actual')
                .eq('user_id', uid2).eq('type', 'strength').eq('workout_status', 'completed')
                .gte('date', winS).lt('date', wDate2);
              const recentSessions2 = ((recStr2 ?? []) as any[]).map((w) => {
                const exRaw = w?.strength_exercises;
                const ex = Array.isArray(exRaw) ? exRaw : (typeof exRaw === 'string' ? (JSON.parse(exRaw || '[]')) : []);
                const names = (Array.isArray(ex) ? ex : []).map((e: any) => String(e?.name || ''));
                return { date: String(w?.date || ''), type: 'strength', strengthFocus: classifyStrengthFocus(names), workload: Number(w?.workload_actual || 0), isNovel: false };
              });
              // baseline: recent SAME-STROKE swims' avg pace_per_100 (≥3), else no_data → silent
              const { data: recSwims } = await supabase.from('workouts')
                .select('computed, swim_data').eq('user_id', uid2).eq('type', 'swim').eq('workout_status', 'completed')
                .gte('date', new Date(new Date(wDate2 + 'T12:00:00Z').getTime() - 60 * 86400000).toISOString().slice(0, 10)).lt('date', wDate2);
              const paces = ((recSwims ?? []) as any[])
                .filter((w) => String(w?.swim_data?.strokeType || 'Freestyle') === stroke)
                .map((w) => Number(w?.computed?.overall?.avg_pace_per_100_s ?? w?.swim_data?.avg_pace_per_100))
                .filter((n) => Number.isFinite(n) && n > 20);
              const baseP = paces.length >= 3 ? paces.reduce((a, b) => a + b, 0) / paces.length : null;
              const slower = baseP != null ? (Number(avgPacePer100) - baseP) : null; // + sec/100 = slower = arm deficit
              const rpe2 = Number((workout as any)?.rpe);
              const carryS = detectCrossDomainCarryover({
                targetDate: wDate2, targetDiscipline: 'swim',
                effortSignal: baseP != null ? 'hr_at_pace' : null,
                rawElevation: slower, adjustedElevation: slower, threshold: 4, // ≥4 s/100 slower = meaningful
                confounds: { grade: false, heat: false, prescribedHard: false },
                recentSessions: recentSessions2, nonLegElevated: null,
                declaredEasy: Number.isFinite(rpe2) && rpe2 > 0 && rpe2 <= 4,
              });
              // Research (2026-07-03): legs are only ~10-15% of swim propulsion, so leg-DOMS barely moves
              // swim pace — a pace change is more likely stroke/conditions/arms than sore quads. So for
              // swim specifically, pace ALONE cannot fire a leg-carryover claim; it requires a declared
              // leg-feel confirmer (Axis 4), which isn't wired for swim yet → swim leg-carryover stays
              // silent. The physiologically stronger swim story is UPPER-body (heavy press → swim, §6) — the
              // priority axis for swim, sequenced ahead of this weak leg axis. Detector still runs (for the
              // suppressedBy log + future declared/upper wiring); the clause is gated off pace-alone.
              const swimDeclaredLegFeel = false; // Axis 4 declared arm/leg-feel for swim — not wired yet
              const clauseS = swimDeclaredLegFeel ? buildCarryoverClause(carryS, 'swim') : null;
              if (clauseS) narrativeInsights = [...narrativeInsights, clauseS].slice(0, 5);
              console.log(`[analyze-swim] carryover ${carryS?.claimable ? `pace-claimable(gated, no declared) ` : `silent (${carryS?.suppressedBy})`}[pace ${avgPacePer100}/${baseP} stroke=${stroke}]`);
            }
          } catch (carryErr) {
            console.warn('[analyze-swim] carryover skipped:', carryErr);
          }
        }
      } catch (error) {
        console.error('⚠️ AI insight generation failed:', error);
        narrativeInsights = [];
      }
    }

    // Helper function to format pace
    function formatPace(seconds: number): string {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    // Build analysis result
    // D-035: Adherence fields are null when there's nothing to measure against
    // (unlinked) or per-interval data is absent. Linked swims get a real
    // duration_adherence (no more hardcoded 100); execution_adherence blends
    // pace + duration when both are available, mirrors run analyzer.
    const _swimExecAdherence: number | null = (() => {
      if (overallAdherence == null && _swimDurationAdherence == null) return null;
      const pace = overallAdherence ?? null;
      // Clamp to 100 for the QUALITY blend (D-163): duration_adherence is now a raw completion ratio
      // that can exceed 100 (a longer-than-planned swim), but "did more time" must not push the
      // execution quality score above a clean session's.
      const dur = _swimDurationAdherence != null ? Math.min(100, _swimDurationAdherence) : null;
      if (pace != null && dur != null) {
        return Math.round((pace * 0.5) + (dur * 0.5));
      }
      // Only one component → use it as the execution score rather than halving.
      if (pace != null) return Math.round(pace);
      if (dur != null) return Math.round(dur);
      return null;
    })();
    const analysis = {
      status: 'success',
      performance: {
        overall_adherence: overallAdherence != null ? Math.round(overallAdherence) : null,
        pace_adherence: overallAdherence != null ? Math.round(overallAdherence) : null,
        duration_adherence: _swimDurationAdherence,
        execution_adherence: _swimExecAdherence,
        // D-163: total pool time (seconds) so session-detail shows elapsed, not moving (pace stays on moving).
        session_elapsed_s: _swimElapsedSec,
      },
      detailed_analysis: {
        workout_summary: {
          total_distance: totalDistanceMeters,
          total_distance_unit: 'meters',
          total_duration: workout.duration || 0,
          average_pace_per_100: avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A',
          pool_length: poolLength,
          pool_unit: poolUnit,
          environment: isPool ? 'pool' : 'open water',
          stroke_type: swimData.strokeType || 'Freestyle',
          intervals_completed: intervals.length
        },
        interval_breakdown: intervalAnalysis,
        stroke_analysis: {
          stroke_type: swimData.strokeType || 'Freestyle',
          equipment_used: swimData.equipmentUsed || [],
          swolf: swimData.swolf || null,
          stroke_rate: swimData.strokeRate || null
        }
      },
      // SWIM = FACTS ONLY (no LLM). Deterministic facts, NOT interpretation. The distance/duration bullet
      // is dropped — it restated the top card in METERS while a yard pool shows "yd" (a visible mismatch).
      // Pace + interval count are unit-correct (poolUnit) and don't fight the card.
      insights: narrativeInsights.length > 0 ? narrativeInsights : [
        `Average pace ${avgPacePer100 > 0 ? formatPace(avgPacePer100) : 'N/A'} per 100${poolUnit}.`,
        intervals.length > 0 ? `${intervals.length} interval${intervals.length === 1 ? '' : 's'}.` : 'Continuous swim.',
      ]
    };

    // Save analysis to database
    const isTransitionWindow = isPlanTransitionWindowByWeekIndex(
      typeof planContext?.week === 'number' ? planContext.week : Number(planContext?.week ?? null),
    );

    const sessionStateV1 = {
      version: 1,
      owner: 'analysis',
      generated_at: new Date().toISOString(),
      workout_id: workout_id,
      discipline: 'swim',
      glance: {
        status_label: typeof analysis?.performance?.execution_adherence === 'number'
          ? (analysis.performance.execution_adherence >= 85 ? 'Strong execution' : analysis.performance.execution_adherence >= 70 ? 'Solid execution' : 'Needs adjustment')
          : null,
        execution_score: typeof analysis?.performance?.execution_adherence === 'number' ? analysis.performance.execution_adherence : null,
      },
      narrative: {
        text: Array.isArray(analysis?.insights) && analysis.insights.length > 0 ? String(analysis.insights[0] || '') : null,
        source: Array.isArray(analysis?.insights) && analysis.insights.length > 0 ? 'analysis' : 'none',
      },
      summary: {
        title: 'Insights',
        bullets: Array.isArray(analysis?.insights) ? analysis.insights.slice(0, 4).map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      },
      details: {
        workout_summary: analysis?.detailed_analysis?.workout_summary || null,
      },
      guards: {
        is_transition_window: isTransitionWindow,
        suppress_deviation_language: isTransitionWindow,
      },
    };

    const updatePayload = {
      workout_analysis: {
        performance: analysis.performance,
        detailed_analysis: analysis.detailed_analysis,
        session_state_v1: sessionStateV1,
      },
      analysis_status: 'complete',
      analyzed_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('workouts')
      .update(updatePayload)
      .eq('id', workout_id);

    if (updateError) {
      console.error('❌ Failed to save analysis to database:', updateError);
    } else {
      console.log('✅ Swim analysis saved successfully');
    }

    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });

  } catch (error) {
    console.error('❌ Error in swim workout analysis:', error);

    // Set analysis status to 'failed'
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    if (workout_id && supabase) {
      try {
        await supabase
          .from('workouts')
          .update({
            analysis_status: 'failed',
            analysis_error: errorMessage
          })
          .eq('id', workout_id);
      } catch (statusError) {
        console.error('❌ Failed to set error status:', statusError);
      }
    }

    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: errorMessage
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders()
      }
    });
  }
});

