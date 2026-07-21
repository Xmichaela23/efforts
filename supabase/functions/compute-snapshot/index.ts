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
import {
  assembleStateTrends,
  toStateTrendsV1,
  buildStrengthBaselines,
  deriveProvisionalBaselines,
  reconcileBaseline,
  disciplineOf,
  todayISO,
  isoMinus,
  STATE_TREND_WINDOWS,
  sanitizePosture,
  declaredSessionsPerWeek,
  type StateTrendsV1,
  type PerDisciplinePosture,
} from "../_shared/state-trend/index.ts";
import { computeAcwr, type LoadRow } from "../_shared/acwr.ts";
import { resolvePlanPhase } from "../_shared/plan-phase.ts";
import { localDateInTz } from "../_shared/local-date.ts";
import { deriveSnapshotWatermark } from "./watermark.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addCalendarDays(iso: string, delta: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

// F3 version guard — the freshness token's SINGLE definition lives in ./watermark.ts, imported
// above. The COMPARISON lives only in the DB trigger trg_guard_snapshot_watermark. See
// docs/AUDIT-fanout-ordering-2026-07-17.md.

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
    // 2b. Fetch completed workouts for the same window — the CANONICAL load
    //     source for ACWR (D-236). `workouts.workload_actual` is authoritative;
    //     workout_facts.workload is only a deferential mirror of it
    //     (compute-facts returns workload_actual verbatim when present). Reading
    //     it here makes the PERSISTED acwr identical to what coach computes live
    //     off the same column (persisted == live).
    // -----------------------------------------------------------------------
    const { data: allWorkoutRows, error: wlErr } = await supabase
      .from("workouts")
      .select("date, type, name, workload_actual, workout_status")
      .eq("user_id", userId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("date");
    if (wlErr) throw wlErr;
    const acwrLoadRows: LoadRow[] = (allWorkoutRows ?? [])
      .filter((r: any) => String(r?.workout_status ?? "").toLowerCase() === "completed")
      .map((r: any) => ({
        date: String(r.date),
        workload: r.workload_actual,
        type: r.type,
        name: r.name,
      }));

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
    // 5. ACWR — coupled-rolling model via the shared authority (D-236).
    //
    // Retired: the calendar-DECOUPLED Formula A (weekTotal / mean of the 4
    // prior weeks, chronic EXCLUDING the current week). It disagreed with every
    // other surface. The shared helper is coupled-rolling (chronic CONTAINS
    // acute), same source/window/floor as coach → persisted == live.
    //
    // "As of" day: today for the in-progress current week; the target week's
    // Sunday (rangeEnd) for a completed/backfilled week — whichever is earlier.
    //
    // "Today" is the ATHLETE-LOCAL date, matching coach's asOfDate convention
    // (coach/index.ts:1171) so persisted == live at all hours — server UTC would
    // roll to tomorrow during the athlete's evening and window a day off coach.
    // Timezone from the request if provided, else America/Los_Angeles (a
    // headless/ingest recompute has no client tz; the server clock is UTC).
    // -----------------------------------------------------------------------
    const userTz = body.timezone ? String(body.timezone) : 'America/Los_Angeles';
    const nowYmd = localDateInTz(new Date(), userTz);
    const acwrAsOf = nowYmd < rangeEnd ? nowYmd : rangeEnd;
    const acwrResult = computeAcwr(acwrLoadRows, { asOfDate: acwrAsOf });
    const acwr = acwrResult.ratio;

    // One-time before/after readout for the acceptance eyeball (D-236): the
    // retired decoupled value alongside the new coupled one, on real data.
    const priorWorkloads = priorWeeks.map((wk) =>
      wk.reduce((sum, f) => sum + (f.workload ?? 0), 0)
    );
    const legacyChronicLoad = avg(priorWorkloads);
    const acwrDecoupledLegacy = legacyChronicLoad && legacyChronicLoad > 0
      ? Math.round((current.workloadTotal / legacyChronicLoad) * 100) / 100
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
    // HR-over-time delta). D-060 (2026-05-25): DB column also renamed —
    // `athlete_snapshot.run_easy_hr_trend` → `run_easy_pace_at_hr_trend` via
    // migration `20260525_rename_run_easy_hr_trend.sql`. Coordinated update
    // across compute-snapshot, coach, analyze-running-workout,
    // longitudinal-signals, useAthleteSnapshot.
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
    }
    // Q-177 (2026-07-13): the `else if (strengthVolumeTrend != null)` fallback was REMOVED.
    //
    // `strengthVolumeTrend` (:445) compares a CUMULATIVE SUM of the CURRENT (partial) week against the
    // average of COMPLETE prior weeks — so it is systematically negative early in the week (~-75% on a
    // Monday with 1 of 4 sessions in). This fallback turned that artifact into a VERDICT: on a Monday,
    // an athlete with no top-lift e1RM history was declared 'declining', which then fed
    // `interferenceScore` below and let the app assert "endurance is dominating your strength" — off
    // nothing but the day of the week. It was dodged on the primary account only because he HAS e1RM
    // data, which wins the branch above.
    //
    // No inference without evidence (Law 2): with no e1RM history, structuralDirection stays NULL and
    // interference simply is not computed. An honest silence beats a confident artifact.
    //
    // The correct strength-direction read is the SPINE (`state_trends_v1.strength`, which uses
    // PER-WORKOUT volume over 6 weeks with ±8% bands and is immune to the partial-week problem).

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
      // D-261 / Q-138: populate plan_phase from the single resolver (was a dead
      // null stub — declared, persisted, never assigned). Phase NAME goes in the
      // column; coach maps its own week_intent off the same resolver.
      if (planWeekNumber != null) {
        const { data: planRow } = await supabase.from("plans").select("config").eq("id", planId).maybeSingle();
        planPhase = resolvePlanPhase(planRow?.config ?? null, planWeekNumber);
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

    // -----------------------------------------------------------------------
    // 8b. Readiness rollup (D-141). avg_readiness is now a DERIVED weekly view
    //     over the readiness_checkins source-of-truth table (D-140), computed
    //     over the target week [targetWeek, rangeEnd]. Falls back to the
    //     facts-based average (current.avgReadiness) when the table is missing
    //     (pre-migration), errors, or has no rows for the week — so this deploys
    //     safely BEFORE the migration/backfill land, and behavior is identical
    //     until then. The output SHAPE is unchanged ({energy,soreness,sleep}),
    //     so the two consumers in recompute-athlete-memory (taperSensitivity via
    //     avg_readiness.energy, and injury flags via per-workout facts — which
    //     never read this field) keep working unchanged.
    let avgReadinessForWeek = current.avgReadiness;
    try {
      const { data: rcRows, error: rcErr } = await supabase
        .from("readiness_checkins")
        .select("energy, soreness, sleep")
        .eq("user_id", userId)
        .gte("date", targetWeek)
        .lte("date", rangeEnd);
      if (!rcErr && rcRows && rcRows.length > 0) {
        const rcEnergy: number[] = [];
        const rcSoreness: number[] = [];
        const rcSleep: number[] = [];
        for (const r of rcRows as Array<Record<string, unknown>>) {
          if (typeof r.energy === "number") rcEnergy.push(r.energy);
          if (typeof r.soreness === "number") rcSoreness.push(r.soreness);
          if (typeof r.sleep === "number") rcSleep.push(r.sleep);
        }
        if (rcEnergy.length > 0 || rcSoreness.length > 0 || rcSleep.length > 0) {
          avgReadinessForWeek = {
            energy: avg(rcEnergy),
            soreness: avg(rcSoreness),
            sleep: avg(rcSleep),
          };
        }
      }
    } catch (_e) {
      // Table absent (pre-migration) or transient error — keep the facts-based
      // fallback so the snapshot never fails on the readiness rollup.
    }

    // -----------------------------------------------------------------------
    // Spine (Step 4a) — cache the per-discipline state-trend verdict so coach +
    // session-detail read ONE source instead of each re-deriving fitness. Runs the
    // SAME assembler (assembleStateTrends) the client STATE screen runs, with the
    // SAME fetch windows (STATE_TREND_WINDOWS) — identical model + identical rows →
    // identical output (the cached==live single-source proof). Only for the CURRENT
    // week (the verdict is "as of now"; historical snapshots leave it null, unread).
    // Non-fatal: a failure here must never break the snapshot write.
    // -----------------------------------------------------------------------
    let stateTrendsV1: StateTrendsV1 | null = null;
    if (targetWeek === mondayOfToday()) {
      try {
        const asOf = todayISO();
        const adhStart = isoMinus(STATE_TREND_WINDOWS.adherenceDays - 1);

        const [exR, bikeR, runR, swimR, plannedR, doneR, cadenceR, runFactsR, strengthVolR] = await Promise.all([
          supabase.from("exercise_log").select("date,canonical_name,exercise_name,estimated_1rm")
            .eq("user_id", userId).gte("date", isoMinus(STATE_TREND_WINDOWS.liftWeeks * 7)).order("date"),
          supabase.from("workouts").select("date,workout_analysis,workout_metadata")
            .eq("user_id", userId).in("type", ["ride", "bike"]).not("workout_analysis", "is", null)
            .order("date", { ascending: false }).limit(STATE_TREND_WINDOWS.bikeLimit),
          // RUN durability substrate — seeded from the SPINE (workouts.workout_analysis), NOT
          // route_progress_metrics. A treadmill / no-GPS run writes no route row but has a perfectly
          // good decoupling number in workout_analysis.heart_rate_summary; driving the read off the
          // routes table made those runs INVISIBLE to durability (STATE-SOURCE-MAP #3/#4 — "a courtesy
          // feature may never gate a fitness verdict"; found live by scripts/state-data-check.mjs,
          // 2026-07-21). 90d cadence window; classifyTrend windows the trend to runDays internally.
          supabase.from("workouts").select("id,date,workout_analysis")
            .eq("user_id", userId).in("type", ["run", "running"]).eq("workout_status", "completed")
            .not("workout_analysis", "is", null)
            .gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)).order("date"),
          supabase.from("workout_facts").select("date,swim_facts")
            .eq("user_id", userId).eq("discipline", "swim").gte("date", isoMinus(STATE_TREND_WINDOWS.swimDays)).order("date"),
          supabase.from("planned_workouts").select("type,date").eq("user_id", userId).gte("date", adhStart).lte("date", asOf),
          supabase.from("workouts").select("type,date,workout_status").eq("user_id", userId).gte("date", adhStart).lte("date", asOf),
          supabase.from("workouts").select("type,date,workout_status").eq("user_id", userId)
            .eq("workout_status", "completed").gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)),
          // Q-110: run pace-at-HR efficiency (run_facts) — joined by date onto the run series below.
          supabase.from("workout_facts").select("date,run_facts").eq("user_id", userId)
            .eq("discipline", "run").gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)),
          // STRENGTH volume trend — per-workout total_volume_lbs over the lift window.
          supabase.from("workout_facts").select("date,strength_facts").eq("user_id", userId)
            .eq("discipline", "strength").gte("date", isoMinus(STATE_TREND_WINDOWS.liftWeeks * 7)),
        ]);

        const cadenceCounts: Record<string, number> = {};
        for (const w of (cadenceR.data ?? []) as any[]) { const k = disciplineOf(w.type); if (k) cadenceCounts[k] = (cadenceCounts[k] || 0) + 1; }

        const bikeRows = (bikeR.data ?? []).map((r: any) => ({
          date: r.date,
          classified_type: r.workout_analysis?.classified_type ?? null,
          w20: r.workout_analysis?.bike_fitness_v1?.w20 ?? null,
          hr_at_band: r.workout_analysis?.bike_fitness_v1?.hr_at_band ?? null,
          in_band_s: r.workout_analysis?.bike_fitness_v1?.in_band_s ?? null, // aerobic-band dwell → efficiency substrate gate
          band_hi: r.workout_analysis?.bike_fitness_v1?.band_hi ?? null, // aerobic band ceiling (75% FTP) → efficiency intensity gate
          band_source: r.workout_analysis?.bike_fitness_v1?.band_source ?? null,
          hr_corrupt: !!r.workout_metadata?.hr_corrupt,
        }));

        // Runs now come straight from the spine (workout_analysis is on each row). effort_adjusted_pace
        // is the ONE column route_progress_metrics owns — joined by workout_id when a route row exists,
        // null otherwise (treadmill). No rendered verdict reads it (audit), so its absence never drops
        // a run from the durability read — that was the whole bug.
        const runRows = (runR.data ?? []) as any[];
        const runWids = [...new Set(runRows.map((r) => r.id).filter(Boolean))];
        const routePaceByWid = new Map<string, number>();
        if (runWids.length) {
          const { data: rpm } = await supabase.from("route_progress_metrics")
            .select("workout_id,effort_adjusted_pace_sec_per_km").in("workout_id", runWids);
          for (const r of (rpm ?? []) as any[]) {
            if (r.effort_adjusted_pace_sec_per_km != null) routePaceByWid.set(r.workout_id, r.effort_adjusted_pace_sec_per_km);
          }
        }
        const runEffIndexByDate = new Map<string, number>();
        for (const f of (runFactsR.data ?? []) as any[]) {
          const v = f.run_facts?.efficiency_index;
          if (typeof v === "number") runEffIndexByDate.set(f.date, v);
        }
        const runJoined = runRows.map((r) => {
          const hrs = r.workout_analysis?.heart_rate_summary ?? null;
          return {
            metric_date: r.date,
            effort_adjusted_pace_sec_per_km: routePaceByWid.get(r.id) ?? null,
            efficiency_index: runEffIndexByDate.get(r.date) ?? null,
            decoupling_pct: hrs?.decouplingPct ?? null,
            decoupling_basis: hrs?.decouplingBasis ?? null,
            decoupling_mixed_effort: hrs?.decouplingMixedEffort ?? null, // confidence hedge — NOT a filter
            decoupling_confounded: hrs?.decouplingConfounded ?? null, // heat/RPE-confounded → excluded from the durability substrate
            workout_type: hrs?.workoutType ?? null,
            duration_minutes: hrs?.durationMinutes ?? null,
            classified_type: r.workout_analysis?.classified_type ?? null,
          };
        });

        // Q-061 / D-193: the swim pace trend must reflect UNAIDED swimming only. Exclude sessions
        // flagged equipment/drill-contaminated by compute-facts (fins/buoy/paddles → faster; kick/drill
        // → slower; either way not a clean fitness number). Snorkel is neutral and not flagged.
        // Exclusion (not down-weight): classifyTrend has no weighting hook, and "unaided only" is the
        // honest substrate. Trade-off (intended): an equipment-heavy athlete may now fall below the
        // min-session gate → needs_data, which is the honest read rather than a contaminated trend.
        const swimRowsAll = (swimR.data ?? []) as any[];
        const swimRows = swimRowsAll
          .filter((r) => r.swim_facts?.pace_equipment_contaminated !== true && r.swim_facts?.swam_as_planned !== false)
          .map((r) => ({
            date: r.date,
            pace_per_100m: Number(r.swim_facts?.pace_per_100m),
            rest_fraction: r.swim_facts?.rest_fraction ?? null, // D-194 rest-fraction trend
            distance_m: Number(r.swim_facts?.distance_m),       // D-194 comparable-session key
          }));
        const swimContaminatedDropped = swimRowsAll.length - swimRows.length;
        if (swimContaminatedDropped > 0) {
          console.log(`[compute-snapshot] Q-061: excluded ${swimContaminatedDropped}/${swimRowsAll.length} equipment-contaminated swim(s) from trend substrate`);
        }

        const plannedBy: Record<string, number> = {};
        const doneBy: Record<string, number> = {};
        for (const p of (plannedR.data ?? []) as any[]) { const k = disciplineOf(p.type); if (k) plannedBy[k] = (plannedBy[k] || 0) + 1; }
        for (const w of (doneR.data ?? []) as any[]) {
          if (String(w.workout_status || "").toLowerCase() !== "completed") continue;
          const k = disciplineOf(w.type); if (k) doneBy[k] = (doneBy[k] || 0) + 1;
        }

        const exerciseRows = (exR.data ?? []).map((e: any) => ({
          date: e.date, canonical_name: e.canonical_name, exercise_name: e.exercise_name, estimated_1rm: e.estimated_1rm,
        }));

        const strengthVolumeRows = (strengthVolR.data ?? []).map((f: any) => ({ date: f.date, total_volume_lbs: f.strength_facts?.total_volume_lbs ?? null }));

        // Q-179 — READ THE ATHLETE'S DECLARED INTENT. It has been sitting on the goal since plan
        // build (D-210) and NOTHING at runtime has ever read it: `per_discipline_posture` appeared
        // zero times in the spine and zero times in the coach. That is why State told an athlete who
        // declared run='maintain' — and was lifting instead, exactly as planned — that his "aerobic
        // base needs work". Every number was right. Nobody asked what he was trying to do.
        // Null-safe by design: no declared posture → readPosture() returns 'unknown' → today's
        // behaviour, byte for byte.
        let posture: PerDisciplinePosture | null = null;
        let declaredSpw: Partial<Record<string, number>> | null = null;
        try {
          const { data: activeGoal } = await supabase
            .from("goals").select("training_prefs")
            .eq("user_id", userId).eq("status", "active")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const tp = (activeGoal as any)?.training_prefs ?? null;
          posture = sanitizePosture(tp?.per_discipline_posture);
          declaredSpw = declaredSessionsPerWeek(tp);
          if (posture) console.log("[compute-snapshot] Q-179 posture:", JSON.stringify(posture), "declared/wk:", JSON.stringify(declaredSpw));
        } catch (e: any) {
          console.log("[compute-snapshot] posture read failed (non-fatal):", e?.message || e);
        }

        // State v3: baseline 1RMs so the strength dot reads current e1RM ÷ baseline (not a 12wk range
        // that pegs right in a build). Typed first, learned fills gaps. Non-fatal → hedged fallback.
        let strengthBaselines: Record<string, number> | null = null;
        let ub: any = null;
        try {
          const r = await supabase.from("user_baselines").select("performance_numbers, learned_fitness").eq("user_id", userId).maybeSingle();
          ub = r.data;
          strengthBaselines = buildStrengthBaselines(ub?.performance_numbers, ub?.learned_fitness?.strength_1rms);
        } catch { /* non-fatal */ }

        // ── AUTO-DERIVED FITNESS BASELINES (run/bike/swim) → fitness_baselines (idempotent) ──────────
        // Derive over the 24wk "established level" horizon — a SEPARATE, wider read than the 90d trend
        // fetch (the band must stay 12wk, so the derivation can't reuse runJoined). Reconcile against the
        // active records via the tested reconcileBaseline (confirmed never auto-touched; provisional
        // superseded ONLY when the pick changes — no supersede churn), then hand the ACTIVE anchors to
        // the assembly. Non-fatal: any failure here must never break the snapshot.
        let fitnessBaselines: Record<string, any> | null = null;
        let runAnchorDescent: any = null; // carried to state_trends_v1 for the composer's descent accent (no schema change)
        try {
          // ⟳ ROLLING ANCHOR (2026-07-17): the derivation shares the band's RECENT window (cadenceDays,
          // ~12wk) — NOT the retired 24wk horizon. The crown descends as recent runs age out and climbs as
          // they build; each move a supersede with lineage. One window per axis (anchor ≈ band frame).
          const derivStart = isoMinus(STATE_TREND_WINDOWS.cadenceDays);
          const { data: drpm } = await supabase.from("route_progress_metrics")
            .select("metric_date,workout_id").eq("user_id", userId).gte("metric_date", derivStart);
          const dWids = [...new Set(((drpm ?? []) as any[]).map((r) => r.workout_id).filter(Boolean))];
          const dHrs = new Map<string, any>();
          if (dWids.length) {
            const { data: dw } = await supabase.from("workouts").select("id,workout_analysis").in("id", dWids);
            for (const w of (dw ?? []) as any[]) dHrs.set(w.id, w.workout_analysis?.heart_rate_summary ?? null);
          }
          const runDerivRows = ((drpm ?? []) as any[]).map((r) => {
            const hrs = dHrs.get(r.workout_id) || null;
            return {
              workout_id: r.workout_id, date: r.metric_date,
              decoupling_pct: hrs?.decouplingPct ?? null, decoupling_basis: hrs?.decouplingBasis ?? null,
              workout_type: hrs?.workoutType ?? null, duration_minutes: hrs?.durationMinutes ?? null,
            };
          });
          const ftp = ub?.learned_fitness?.ride_ftp_estimated ?? null;
          // as-of date of the FTP estimate = when the learned profile was last computed (ride_ftp_estimated
          // itself carries no date; learned_fitness.last_updated is its stamp). Drives the bike anchor label.
          const bikeFtpEstimate = ftp && Number(ftp.value) > 0
            ? { value: Number(ftp.value), confidence: ftp.confidence ?? null, asOf: (ub?.learned_fitness?.last_updated ?? "").slice(0, 10) || null }
            : null;
          // Swim hard-effort gathering (RPE + id) is a small follow-up; with none, swim → calibration (item f, honest).
          const swimEfforts: any[] = [];

          const derived = deriveProvisionalBaselines(
            { runDecouplingRows: runDerivRows, bikeFtpEstimate, swimEfforts },
            { asOf, windowDays: STATE_TREND_WINDOWS.cadenceDays }, // ⟳ rolling: band's recent window, not 24wk
          );

          const { data: activeRows } = await supabase.from("fitness_baselines")
            .select("id,discipline,metric,value,lower_is_better,source_label,source_date,source_event_id,status")
            .eq("user_id", userId).is("superseded_at", null);
          const activeByDisc = new Map<string, any>();
          for (const r of (activeRows ?? []) as any[]) activeByDisc.set(r.discipline, r);

          const nowIso = new Date().toISOString();
          const finalActive: Record<string, any> = {};
          const toActive = (o: any, status: string) => ({ value: o.value, metric: o.metric, lowerIsBetter: o.lowerIsBetter, sourceLabel: o.sourceLabel, sourceDate: o.sourceDate, sourceEventId: o.sourceEventId, status });
          const insertRow = (disc: string, cand: any) => supabase.from("fitness_baselines").insert({
            user_id: userId, discipline: disc, metric: cand.metric, value: cand.value, lower_is_better: cand.lowerIsBetter,
            source_event_id: cand.sourceEventId, source_date: cand.sourceDate || null, source_label: cand.sourceLabel,
            confidence: cand.confidence ?? null, status: "provisional",
          }).select("id").single();

          for (const disc of ["run", "bike", "swim"] as const) {
            const active = activeByDisc.get(disc) || null;
            const cand = (derived as any)[disc];
            const activeReduced = active ? { status: active.status, sourceEventId: active.source_event_id ?? null, value: Number(active.value) } : null;
            const action = reconcileBaseline(activeReduced, cand);
            if (action.kind === "insert") {
              await insertRow(disc, cand);
              finalActive[disc] = toActive(cand, "provisional");
            } else if (action.kind === "supersede") {
              // DESCENT-BY-AGING (run): the accent's trigger. A supersede where the NEW crown is worse than
              // the old AND the old source aged OUT of the window (not a better-run climb, not a data fix).
              // The spine carries the cause so the composer never infers it. (decoupling lower-is-better →
              // a higher new value = worse.)
              if (disc === "run" && active?.source_date) {
                const worse = Number(cand.value) > Number(active.value);
                const oldAgedOut = !runDerivRows.some((r: any) => r.workout_id === active.source_event_id);
                if (worse && oldAgedOut) {
                  runAnchorDescent = { agedOutMonth: new Date(active.source_date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) };
                }
              }
              // retire old FIRST (the partial unique index allows only one active), then insert new, then link lineage
              await supabase.from("fitness_baselines").update({ superseded_at: nowIso }).eq("id", active.id);
              const { data: ins } = await insertRow(disc, cand);
              if (ins?.id) await supabase.from("fitness_baselines").update({ superseded_by: ins.id }).eq("id", active.id);
              finalActive[disc] = toActive(cand, "provisional");
            } else if (action.kind === "retire") {
              await supabase.from("fitness_baselines").update({ superseded_at: nowIso }).eq("id", active.id);
              // no active anymore → calibration (nothing added to finalActive)
            } else if (active) {
              // noop → the ANCHOR (value/source event) is unchanged. But a PROVISIONAL anchor's cosmetic
              // metadata (label/date) can still freshen — e.g. the bike FTP estimate keeps the same value but
              // gains its as-of date. Refresh IN PLACE (not a supersede — the anchor didn't move). Confirmed
              // records are never auto-touched.
              const labelChanged = active.status === "provisional" && cand &&
                (active.source_label !== cand.sourceLabel || String(active.source_date ?? "") !== String(cand.sourceDate ?? ""));
              if (labelChanged) {
                await supabase.from("fitness_baselines").update({ source_label: cand.sourceLabel, source_date: cand.sourceDate || null }).eq("id", active.id);
                finalActive[disc] = toActive(cand, active.status);
              } else {
                finalActive[disc] = { value: Number(active.value), metric: active.metric, lowerIsBetter: !!active.lower_is_better, sourceLabel: active.source_label, sourceDate: active.source_date, sourceEventId: active.source_event_id, status: active.status };
              }
            }
          }
          fitnessBaselines = Object.keys(finalActive).length ? finalActive : null;
        } catch (e: any) {
          console.log("[compute-snapshot] fitness baseline derive/persist failed (non-fatal):", e?.message || e);
        }

        const result = assembleStateTrends({ asOf, exerciseRows, bikeRows, runJoined, swimRows, strengthVolumeRows, plannedBy, doneBy, cadenceCounts, posture, declaredSessionsPerWeek: declaredSpw, strengthBaselines, fitnessBaselines });
        stateTrendsV1 = toStateTrendsV1(result, asOf);
        // Carry the descent cause on the payload (JSONB, no schema change) so the coach's composer receives
        // it as a candidate rather than inferring it (contract §3a/§4).
        if (runAnchorDescent && stateTrendsV1) (stateTrendsV1 as any).run_anchor_descent = runAnchorDescent;
      } catch (e: any) {
        console.log("⚠️ state_trends_v1 (spine) failed (non-fatal):", e?.message || e);
        stateTrendsV1 = null;
      }
    }

    const snapshot = {
      user_id: userId,
      week_start: targetWeek,

      state_trends_v1: stateTrendsV1,

      workload_total: Math.round(current.workloadTotal),
      workload_by_discipline: current.workloadByDisc,
      acwr,
      session_count: current.sessionCount,
      session_count_planned: sessionCountPlanned,
      adherence_pct: adherencePct,

      // Q-169 — D-239's null-write is RETIRED, because the null it was defending against is FIXED.
      //
      // D-239 hard-nulled these because they were "fed by the null `pace_at_easy_hr` (dead read-path)"
      // — and it was RIGHT to: persisting a garbage aerobic-efficiency value into the Arc would have
      // been worse. But it treated the SYMPTOM. The root cause was one dead field lookup in
      // `compute-facts:1039` (`learned_fitness.running.threshold_hr` — a nested path that has never
      // existed), which meant `pace_at_easy_hr` was never written on ANY run: 0 of 147, while
      // `efficiency_index` — the very next block, same sensor samples — computed fine on 146.
      //
      // With the lookup fixed and the easy-HR band threshold-anchored (`_shared/easy-hr.ts`),
      // `pace_at_easy_hr` is real. Persisting it un-starves the OBSERVED side of the D-033 pace
      // reconciler (`generate-combined-plan/science.ts:110`) — the machine that notices an athlete has
      // detrained, with its streak gates and its ACWR gate so a fatigued week is not mistaken for
      // fitness decline. That engine has never once run. This is what feeds it.
      //
      // The RUN aerobic READ on State remains `state_trends_v1.run.decoupling` (unchanged — D-239's
      // other half stands). This field feeds the PLAN reconciler, not the State card.
      run_easy_pace_at_hr: current.runEasyPaceAtHR,
      run_easy_pace_at_hr_trend: runEasyPaceAtHrTrend,
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
      avg_readiness: avgReadinessForWeek,
      rpe_trend: rpeTrend,

      plan_id: planId,
      plan_week_number: planWeekNumber,
      plan_phase: planPhase,

      interference: interferenceScore,
      intensity_distribution: current.intensityDistribution,

      computed_at: new Date().toISOString(),
      // F3 version guard: the freshness token this write carries. The DB trigger
      // trg_guard_snapshot_watermark refuses to overwrite a row assembled from newer
      // inputs. Value derived in ONE place (deriveSnapshotWatermark); the comparison
      // lives ONLY in the trigger. See docs/AUDIT-fanout-ordering-2026-07-17.md.
      input_watermark: deriveSnapshotWatermark(body),
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

    // Fire-and-forget: refresh the segment VERDICT for this user.
    // ── SEGMENT INVARIANT: the verdict is BORN HERE, co-located with State's efficiency verdict
    //    (Law 5). Riding compute-snapshot also advances the 6-month recency window even with no new
    //    runs — a staleness case leaf-enumeration misses. Guarded/fire-and-forget: a failure leaves a
    //    stale verdict, never breaks compute-snapshot (identical posture to the compute-facts invokes).
    try {
      const verdictUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/compute-core-verdict`;
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(verdictUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${svcKey}`,
          "apikey": svcKey,
        },
        // dry_run threads to the leaf: a dry-run trigger keeps compute-core-verdict write-free
        // (it returns would_persist, writes nothing) so core_verdicts stays empty during verification.
        body: JSON.stringify({ user_id: userId, dry_run: body?.dry_run === true }),
      }).catch(() => {});
    } catch {}

    return new Response(
      JSON.stringify({
        success: true,
        week_start: targetWeek,
        snapshot,
        // D-236 acceptance readout: old (decoupled Formula A) vs new (coupled
        // helper) ACWR for this week, side by side, on real data.
        acwr_convergence: {
          as_of: acwrAsOf,
          new_coupled: acwr,
          old_decoupled: acwrDecoupledLegacy,
          thin_base: acwrResult.thinBase,
          acute_load: Math.round(acwrResult.acuteLoad),
          chronic_load: Math.round(acwrResult.chronicLoad),
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
