/**
 * EDGE FUNCTION: compute-snapshot
 *
 * Deterministic Layer — Phase 2.
 *
 * Aggregates workout_facts + exercise_log into one athlete_snapshot row
 * for a given week. Reads the current week + last 4 weeks to compute
 * trends and ACWR.
 *
 * Input:  { user_id: string, week_start?: string }
 *   - week_start: Monday date (YYYY-MM-DD). Defaults to current week.
 *
 * Output: { success, week_start, snapshot }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  formatLocalDate,
  mondayOfCalendarYmd,
  mondayOfToday,
  parseLocalDate,
} from "../_shared/parse-local-date.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addCalendarDays(iso: string, delta: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pctChange(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactRow {
  date: string;
  discipline: string;
  workload: number | null;
  duration_minutes: number | null;
  session_rpe: number | null;
  readiness: Record<string, any> | null;
  plan_id: string | null;
  planned_workout_id: string | null;
  run_facts: Record<string, any> | null;
  strength_facts: Record<string, any> | null;
  ride_facts: Record<string, any> | null;
  adherence: Record<string, any> | null;
}

interface ExerciseRow {
  date: string;
  canonical_name: string;
  best_weight: number;
  best_reps: number;
  estimated_1rm: number;
  total_volume: number;
}

// ---------------------------------------------------------------------------
// Core aggregation
// ---------------------------------------------------------------------------

export function aggregateWeek(facts: FactRow[]) {
  let workloadTotal = 0;
  const workloadByDisc: Record<string, number> = {};
  const rpes: number[] = [];
  const readinessEnergy: number[] = [];
  const readinessSoreness: number[] = [];
  const readinessSleep: number[] = [];
  let sessionCount = 0;
  let plannedCount = 0;

  // Run signals
  const easyPaces: number[] = [];
  let longestRunDur = 0;
  const intervalHits: number[] = [];
  const intervalTotals: number[] = [];
  const runEfficiencies: number[] = [];

  // Ride signals
  const ridePowers: number[] = [];
  const rideEFs: number[] = [];
  let longestRideDur = 0;
  // Interval adherence accumulators — Tier 2 item 4 of running→cycling delta map.
  // Mirrors `intervalHits` / `intervalTotals` at lines 90-91. Aggregated to a single
  // weekly percentage in the return below, same shape as `runIntervalAdherence`.
  const rideIntervalHits: number[] = [];
  const rideIntervalTotals: number[] = [];

  // Strength
  let strengthVolume = 0;

  // Intensity distribution (HR zone time)
  const zoneSeconds: Record<string, number> = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  for (const f of facts) {
    sessionCount++;
    workloadTotal += f.workload ?? 0;
    workloadByDisc[f.discipline] = (workloadByDisc[f.discipline] ?? 0) + (f.workload ?? 0);
    if (f.session_rpe != null) rpes.push(f.session_rpe);
    if (f.readiness) {
      if (typeof f.readiness.energy === "number") readinessEnergy.push(f.readiness.energy);
      if (typeof f.readiness.soreness === "number") readinessSoreness.push(f.readiness.soreness);
      if (typeof f.readiness.sleep === "number") readinessSleep.push(f.readiness.sleep);
    }
    if (f.planned_workout_id) plannedCount++;

    // Run
    if (f.discipline === "run" && f.run_facts) {
      const rf = f.run_facts;
      if (typeof rf.pace_at_easy_hr === "number") easyPaces.push(rf.pace_at_easy_hr);
      if (typeof rf.efficiency_index === "number") runEfficiencies.push(rf.efficiency_index);
      const dur = f.duration_minutes ?? 0;
      if (dur > longestRunDur) longestRunDur = dur;
      if (typeof rf.intervals_hit === "number" && typeof rf.intervals_total === "number") {
        intervalHits.push(rf.intervals_hit);
        intervalTotals.push(rf.intervals_total);
      }
      if (rf.time_in_zone) {
        for (const [k, v] of Object.entries(rf.time_in_zone)) {
          if (typeof v === "number") zoneSeconds[k] = (zoneSeconds[k] ?? 0) + v;
        }
      }
    }

    // Ride
    if ((f.discipline === "ride" || f.discipline === "bike") && f.ride_facts) {
      if (typeof f.ride_facts.avg_power === "number" && f.ride_facts.avg_power > 0) {
        ridePowers.push(f.ride_facts.avg_power);
      }
      if (typeof f.ride_facts.efficiency_factor === "number" && f.ride_facts.efficiency_factor > 0) {
        rideEFs.push(f.ride_facts.efficiency_factor);
      }
      // Longest-ride duration tracking — Tier 2 item 3 of running→cycling delta map.
      // Mirrors `longestRunDur` for `runLongRunDuration`; same Math.max-of-duration_minutes
      // pattern. Used by downstream consumers (planning-context, end-plan-core,
      // build-coaching-context) symmetrically with run_long_run_duration.
      const dur = f.duration_minutes ?? 0;
      if (dur > longestRideDur) longestRideDur = dur;
      // Interval adherence — Tier 2 item 4 of running→cycling delta map. Mirrors the
      // run block at lines ~123-126. Source field shape is identical
      // (`intervals_hit` / `intervals_total` on the per-workout facts row, set by
      // `compute-facts/buildRideFacts` from `w.computed.intervals` adherence_pct).
      if (typeof f.ride_facts.intervals_hit === "number" && typeof f.ride_facts.intervals_total === "number") {
        rideIntervalHits.push(f.ride_facts.intervals_hit);
        rideIntervalTotals.push(f.ride_facts.intervals_total);
      }
      if (f.ride_facts.time_in_zone) {
        for (const [k, v] of Object.entries(f.ride_facts.time_in_zone)) {
          if (typeof v === "number") zoneSeconds[k] = (zoneSeconds[k] ?? 0) + v;
        }
      }
    }

    // Strength
    if (f.discipline === "strength" && f.strength_facts) {
      strengthVolume += f.strength_facts.total_volume_lbs ?? 0;
    }
  }

  const totalIntervalHits = intervalHits.reduce((a, b) => a + b, 0);
  const totalIntervalTargets = intervalTotals.reduce((a, b) => a + b, 0);
  const totalRideIntervalHits = rideIntervalHits.reduce((a, b) => a + b, 0);
  const totalRideIntervalTargets = rideIntervalTotals.reduce((a, b) => a + b, 0);

  // Intensity distribution: Z1-2 (easy/aerobic) vs Z3+ (tempo/threshold/VO2)
  const totalZoneSec = Object.values(zoneSeconds).reduce((a, b) => a + b, 0);
  const easyZoneSec = (zoneSeconds.z1 ?? 0) + (zoneSeconds.z2 ?? 0);
  const hardZoneSec = totalZoneSec - easyZoneSec;
  const intensityDistribution = totalZoneSec > 0 ? {
    zone1_2_minutes: Math.round(easyZoneSec / 60),
    zone3_plus_minutes: Math.round(hardZoneSec / 60),
    zone1_2_pct: Math.round((easyZoneSec / totalZoneSec) * 100),
    zone_seconds: zoneSeconds,
  } : null;

  return {
    workloadTotal,
    workloadByDisc,
    sessionCount,
    plannedCount,
    avgRPE: avg(rpes),
    avgReadiness: (readinessEnergy.length > 0 || readinessSoreness.length > 0 || readinessSleep.length > 0)
      ? {
        energy: avg(readinessEnergy),
        soreness: avg(readinessSoreness),
        sleep: avg(readinessSleep),
      }
      : null,
    runEasyPaceAtHR: avg(easyPaces),
    runLongRunDuration: longestRunDur > 0 ? longestRunDur : null,
    runIntervalAdherence: totalIntervalTargets > 0
      ? Math.round((totalIntervalHits / totalIntervalTargets) * 100)
      : null,
    runEfficiency: avg(runEfficiencies),
    rideAvgPower: avg(ridePowers),
    rideEF: avg(rideEFs),
    rideLongRideDuration: longestRideDur > 0 ? longestRideDur : null,
    rideIntervalAdherence: totalRideIntervalTargets > 0
      ? Math.round((totalRideIntervalHits / totalRideIntervalTargets) * 100)
      : null,
    strengthVolume: strengthVolume > 0 ? strengthVolume : null,
    intensityDistribution,
  };
}

function buildTopLifts(
  currentWeekExercises: ExerciseRow[],
  allExercises: ExerciseRow[],
  targetWeek: string,
): Record<string, any> {
  const bigFour = ["squat", "bench_press", "deadlift", "overhead_press"];
  const topLifts: Record<string, any> = {};

  for (const lift of bigFour) {
    // Best 1RM this week
    const thisWeek = currentWeekExercises
      .filter((e) => e.canonical_name === lift && e.estimated_1rm > 0);
    if (thisWeek.length === 0) continue;

    const best = thisWeek.reduce((a, b) => a.estimated_1rm > b.estimated_1rm ? a : b);

    // 4-week-ago baseline: best 1RM from weeks before the current week
    const older = allExercises
      .filter((e) => e.canonical_name === lift && e.date < targetWeek && e.estimated_1rm > 0);
    const baseline4w = older.length > 0
      ? older.reduce((a, b) => a.estimated_1rm > b.estimated_1rm ? a : b).estimated_1rm
      : null;

    topLifts[lift] = {
      est_1rm: best.estimated_1rm,
      best_weight: best.best_weight,
      best_reps: best.best_reps,
      trend: pctChange(best.estimated_1rm, baseline4w) != null
        ? `${pctChange(best.estimated_1rm, baseline4w)! >= 0 ? "+" : ""}${pctChange(best.estimated_1rm, baseline4w)}%`
        : null,
    };
  }

  return Object.keys(topLifts).length > 0 ? topLifts : {};
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const userId: string = body.user_id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const targetWeek = body.week_start ?? mondayOfToday();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -----------------------------------------------------------------------
    // 1. Fetch 5 weeks of workout_facts (target week + 4 prior)
    // -----------------------------------------------------------------------
    const fiveWeeksAgo = parseLocalDate(targetWeek);
    fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 28);
    const rangeStart = formatLocalDate(fiveWeeksAgo);

    const sundayOfTarget = parseLocalDate(targetWeek);
    sundayOfTarget.setDate(sundayOfTarget.getDate() + 6);
    const rangeEnd = formatLocalDate(sundayOfTarget);

    const { data: allFacts, error: fErr } = await supabase
      .from("workout_facts")
      .select(
        "date, discipline, workload, duration_minutes, session_rpe, readiness, " +
        "plan_id, planned_workout_id, run_facts, strength_facts, ride_facts, adherence",
      )
      .eq("user_id", userId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date");

    if (fErr) throw fErr;
    const facts = (allFacts ?? []) as FactRow[];

    // -----------------------------------------------------------------------
    // 2. Fetch exercise_log for same period
    // -----------------------------------------------------------------------
    const { data: allExercises, error: eErr } = await supabase
      .from("exercise_log")
      .select("date, canonical_name, best_weight, best_reps, estimated_1rm, total_volume")
      .eq("user_id", userId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date");

    if (eErr) throw eErr;
    const exercises = (allExercises ?? []) as ExerciseRow[];

    // -----------------------------------------------------------------------
    // 3. Split facts into target week vs prior 4 weeks
    // -----------------------------------------------------------------------
    const targetFacts = facts.filter((f) => f.date >= targetWeek && f.date <= rangeEnd);
    const priorFacts = facts.filter((f) => f.date < targetWeek);

    // Split prior into individual weeks for chronic load
    const priorWeeks: FactRow[][] = [[], [], [], []];
    for (const f of priorFacts) {
      const wk = mondayOfCalendarYmd(String(f.date).slice(0, 10));
      const weeksBack = Math.floor(
        (parseLocalDate(targetWeek).getTime() - parseLocalDate(wk).getTime()) / (7 * 24 * 60 * 60 * 1000),
      );
      if (weeksBack >= 1 && weeksBack <= 4) {
        priorWeeks[weeksBack - 1].push(f);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Aggregate current week
    // -----------------------------------------------------------------------
    const current = aggregateWeek(targetFacts);

    // -----------------------------------------------------------------------
    // 5. Compute chronic load (4-week rolling avg) and ACWR
    // -----------------------------------------------------------------------
    const priorWorkloads = priorWeeks.map((wk) =>
      wk.reduce((sum, f) => sum + (f.workload ?? 0), 0)
    );
    const chronicLoad = avg(priorWorkloads);
    const acwr = chronicLoad && chronicLoad > 0
      ? Math.round((current.workloadTotal / chronicLoad) * 100) / 100
      : null;

    // -----------------------------------------------------------------------
    // 6. Compute trends vs 4-week avg
    // -----------------------------------------------------------------------
    const priorAggs = priorWeeks.map((wk) => aggregateWeek(wk));

    // RPE trend
    const priorRPEs = priorAggs.map((a) => a.avgRPE).filter((v): v is number => v != null);
    const chronicRPE = avg(priorRPEs);
    const rpeTrend = pctChange(current.avgRPE, chronicRPE);

    // Run easy pace-at-HR trend (lower = faster = better, so negative trend = improving).
    // D-043: variable renamed runEasyHRTrend → runEasyPaceAtHrTrend to match what
    // the value actually represents (pace-at-easy-HR delta vs chronic, NOT an
    // HR-over-time delta). DB column athlete_snapshot.run_easy_hr_trend KEPT
    // for back-compat (renaming requires a schema migration coordinated with
    // coach/index.ts:2628 and longitudinal-signals.ts:81 — deferred to a
    // separate ticket).
    const priorEasyPaces = priorAggs.map((a) => a.runEasyPaceAtHR).filter((v): v is number => v != null);
    const chronicEasyPace = avg(priorEasyPaces);
    const runEasyPaceAtHrTrend = pctChange(current.runEasyPaceAtHR, chronicEasyPace);

    // Strength volume trend
    const priorStrVols = priorAggs.map((a) => a.strengthVolume).filter((v): v is number => v != null);
    const chronicStrVol = avg(priorStrVols);
    const strengthVolumeTrend = pctChange(current.strengthVolume, chronicStrVol);

    // Ride efficiency trend
    const priorRideEFs = priorAggs.map((a) => a.rideEF).filter((v): v is number => v != null);
    const chronicRideEF = avg(priorRideEFs);

    // -----------------------------------------------------------------------
    // 7. Compute top lifts
    // -----------------------------------------------------------------------
    const currentWeekExercises = exercises.filter((e) => e.date >= targetWeek && e.date <= rangeEnd);
    const topLifts = buildTopLifts(currentWeekExercises, exercises, targetWeek);

    // -----------------------------------------------------------------------
    // 8. Interference detection (engine vs chassis)
    // -----------------------------------------------------------------------
    // Aerobic direction: runEasyPaceAtHrTrend < 0 means faster at same HR = improving
    // Strength direction: compare current top lifts vs prior top lifts
    const priorExercises = exercises.filter((e) => e.date < targetWeek);
    const priorWeekMonday = addCalendarDays(targetWeek, -7);
    const priorTopLifts = buildTopLifts(
      priorExercises.filter((e) => {
        const wk = mondayOfCalendarYmd(String(e.date).slice(0, 10));
        return wk === priorWeekMonday;
      }),
      priorExercises,
      priorWeekMonday,
    );

    let aerobicDirection: 'improving' | 'stable' | 'declining' | null = null;
    if (runEasyPaceAtHrTrend != null) {
      aerobicDirection = runEasyPaceAtHrTrend < -2 ? 'improving' : runEasyPaceAtHrTrend > 2 ? 'declining' : 'stable';
    } else {
      // Fallback: use run efficiency trend or run workload trajectory
      const priorRunEfs = priorAggs.map((a) => a.runEfficiency).filter((v): v is number => v != null);
      const chronicRunEf = avg(priorRunEfs);
      if (current.runEfficiency != null && chronicRunEf != null && chronicRunEf > 0) {
        const efDelta = ((current.runEfficiency - chronicRunEf) / chronicRunEf) * 100;
        aerobicDirection = efDelta > 3 ? 'improving' : efDelta < -3 ? 'declining' : 'stable';
      } else {
        // Last resort: compare current vs chronic run workload — increasing load = building
        const currentRunLoad = current.workloadByDisc['run'] ?? 0;
        const priorRunLoads = priorAggs.map((a) => a.workloadByDisc['run'] ?? 0);
        const chronicRunLoad = avg(priorRunLoads.filter(v => v > 0));
        if (currentRunLoad > 0 && chronicRunLoad != null && chronicRunLoad > 0) {
          const loadDelta = ((currentRunLoad - chronicRunLoad) / chronicRunLoad) * 100;
          aerobicDirection = loadDelta > 10 ? 'improving' : loadDelta < -15 ? 'declining' : 'stable';
        }
      }
    }

    let structuralDirection: 'improving' | 'stable' | 'declining' | null = null;
    const currentAvg1RM = (() => {
      const vals = Object.values(topLifts).map((l: any) => l.est_1rm).filter((v: any) => typeof v === 'number' && v > 0);
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
    })();
    const priorAvg1RM = (() => {
      const vals = Object.values(priorTopLifts).map((l: any) => l.est_1rm).filter((v: any) => typeof v === 'number' && v > 0);
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
    })();
    if (currentAvg1RM != null && priorAvg1RM != null && priorAvg1RM > 0) {
      const liftDelta = ((currentAvg1RM - priorAvg1RM) / priorAvg1RM) * 100;
      structuralDirection = liftDelta > 2 ? 'improving' : liftDelta < -2 ? 'declining' : 'stable';
    } else if (strengthVolumeTrend != null) {
      structuralDirection = strengthVolumeTrend > 5 ? 'improving' : strengthVolumeTrend < -5 ? 'declining' : 'stable';
    }

    // Interference: one system improving while the other declines
    let interferenceScore: Record<string, any> | null = null;
    if (aerobicDirection && structuralDirection) {
      const dominated =
        (aerobicDirection === 'improving' && structuralDirection === 'declining') ? 'endurance_dominating'
        : (structuralDirection === 'improving' && aerobicDirection === 'declining') ? 'strength_dominating'
        : null;

      interferenceScore = {
        aerobic: aerobicDirection,
        structural: structuralDirection,
        status: dominated ? 'interference_detected' : 'balanced',
        dominated_by: dominated ?? null,
        detail: dominated === 'endurance_dominating'
          ? 'Aerobic fitness is improving but strength is declining. Current training volume may be favoring endurance at the cost of strength.'
          : dominated === 'strength_dominating'
          ? 'Strength is improving but aerobic fitness is declining. Heavy lifting may be limiting endurance adaptation.'
          : aerobicDirection === 'improving' && structuralDirection === 'improving'
          ? 'Both systems improving. Training balance is working.'
          : null,
      };
    }

    // -----------------------------------------------------------------------
    // 9. Plan context
    // -----------------------------------------------------------------------
    const planIds = [...new Set(targetFacts.map((f) => f.plan_id).filter(Boolean))];
    let planId: string | null = planIds[0] ?? null;
    let planWeekNumber: number | null = null;
    let planPhase: string | null = null;

    if (planId) {
      // Try to get plan week from planned_workouts
      const plannedWorkoutIds = targetFacts
        .map((f) => f.planned_workout_id)
        .filter(Boolean) as string[];
      if (plannedWorkoutIds.length > 0) {
        const { data: pws } = await supabase
          .from("planned_workouts")
          .select("week_number")
          .in("id", plannedWorkoutIds)
          .limit(1);
        if (pws && pws[0]) {
          planWeekNumber = pws[0].week_number;
        }
      }
    }

    // Count planned sessions for adherence
    let sessionCountPlanned: number | null = null;
    if (planId) {
      const mondayDate = targetWeek;
      const sundayDate = rangeEnd;
      const { count } = await supabase
        .from("planned_workouts")
        .select("id", { count: "exact", head: true })
        .eq("training_plan_id", planId)
        .gte("date", mondayDate)
        .lte("date", sundayDate);
      sessionCountPlanned = count;
    }

    const adherencePct = sessionCountPlanned && sessionCountPlanned > 0
      ? Math.round((current.sessionCount / sessionCountPlanned) * 100)
      : null;

    // -----------------------------------------------------------------------
    // 9. Build and UPSERT snapshot
    // -----------------------------------------------------------------------
    const round = (v: number | null, decimals = 1): number | null =>
      v != null ? Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals) : null;

    const snapshot = {
      user_id: userId,
      week_start: targetWeek,

      workload_total: Math.round(current.workloadTotal),
      workload_by_discipline: current.workloadByDisc,
      acwr,
      session_count: current.sessionCount,
      session_count_planned: sessionCountPlanned,
      adherence_pct: adherencePct,

      run_easy_pace_at_hr: round(current.runEasyPaceAtHR),
      // DB column name kept (schema migration deferred per D-043 comment at runEasyPaceAtHrTrend declaration).
      run_easy_hr_trend: runEasyPaceAtHrTrend,
      run_long_run_duration: current.runLongRunDuration,
      run_interval_adherence: current.runIntervalAdherence,

      strength_volume_total: current.strengthVolume,
      strength_volume_trend: strengthVolumeTrend,
      strength_top_lifts: Object.keys(topLifts).length > 0 ? topLifts : null,

      ride_avg_power: round(current.rideAvgPower),
      ride_efficiency_factor: round(current.rideEF, 2),
      ride_long_ride_duration: current.rideLongRideDuration,
      ride_interval_adherence: current.rideIntervalAdherence,

      avg_session_rpe: round(current.avgRPE),
      avg_readiness: current.avgReadiness,
      rpe_trend: rpeTrend,

      plan_id: planId,
      plan_week_number: planWeekNumber,
      plan_phase: planPhase,

      interference: interferenceScore,
      intensity_distribution: current.intensityDistribution,

      computed_at: new Date().toISOString(),
    };

    const { error: uErr } = await supabase
      .from("athlete_snapshot")
      .upsert(snapshot, { onConflict: "user_id,week_start" });

    if (uErr) throw uErr;

    // Cycling CTL/ATL/TSB (design Build Order #9). Sourced from
    // workout_analysis.fitness_v1 (#7) — the most recent ride on/before the
    // week end carries current fitness/fatigue/form (CTL/ATL/TSB are
    // point-in-time cumulative values). Written via a SEPARATE guarded update,
    // NOT folded into the main snapshot upsert above, so a missing column
    // (migration applied manually via SQL editor — migration-tracking
    // divergence) cannot break the snapshot. Fully non-fatal.
    try {
      const { data: fitRows } = await supabase
        .from("workouts")
        .select("workout_analysis, date")
        .eq("user_id", userId)
        .in("type", ["ride", "cycling", "bike"])
        .eq("workout_status", "completed")
        .lte("date", rangeEnd)
        .order("date", { ascending: false })
        .limit(20);
      let ctl: number | null = null;
      let atl: number | null = null;
      let tsb: number | null = null;
      for (const r of (Array.isArray(fitRows) ? fitRows : [])) {
        const f = (r as any)?.workout_analysis?.fitness_v1;
        const c = Number(f?.ctl);
        const a = Number(f?.atl);
        if (f && Number.isFinite(c) && Number.isFinite(a)) {
          ctl = Math.round(c);
          atl = Math.round(a);
          const tb = Number(f?.tsb);
          tsb = Number.isFinite(tb) ? Math.round(tb) : Math.round(c - a);
          break; // newest ride with fitness_v1 = current point-in-time fitness
        }
      }
      if (ctl != null && atl != null) {
        const { error: fErr } = await supabase
          .from("athlete_snapshot")
          .update({ ctl, atl, tsb })
          .eq("user_id", userId)
          .eq("week_start", targetWeek);
        if (fErr) throw fErr;
      }
    } catch (e: any) {
      console.warn(
        "[compute-snapshot] CTL/ATL/TSB update skipped (non-fatal — columns may be unmigrated):",
        e?.message ?? e,
      );
    }

    return new Response(
      JSON.stringify({ success: true, week_start: targetWeek, snapshot }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
