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
import { stateTrendGate } from "./state-trend-gate.ts";
// ⛔ ONE NAME RESOLVER, NOT A SECOND ONE. The expected curve is keyed by the same canonical name the
// e1RM series is keyed by, or the two would sit on one chart under different keys.
import { canonicalize } from "../_shared/canonicalize.ts";

/** One day on, as an ISO date. ⚠️ Noon local so a DST boundary cannot roll the answer a day. */
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
// The block's own rate — 1% every three weeks (Viada p247). The curve states the plan's shape and it
// must be the rate the plan was BUILT on, never a second opinion.
import { RATE_ANCHOR } from "../_shared/standing-plan/frames.ts";
// ⛔ THE ONE DEFINITION OF A TEST WEEK — the composer's own function, the same constant it tags the
// test session with. Imported HERE rather than in `state-trend/assemble.ts` on purpose: assemble is
// bundled into 27 edge functions, so importing `working-number.ts` there would widen ITS closure
// from 3 to 27 and tax every future edit to the pretest arithmetic. This file already holds
// `weekByDate` and already imports `standing-plan/`, so resolving here costs one function.
import { isTestWeek } from "../_shared/standing-plan/working-number.ts";
import { resolveAcwrAsOf } from "./acwr-as-of.ts";
import { fetchAthleteTimezone, resolveAthleteTimezone } from "../_shared/athlete-timezone.ts";
import {
  assembleStateTrends,
  toStateTrendsV1,
  buildStrengthBaselines,
  buildAllTimeBestByLift,
  runSessionGroup,
  type EnduranceSpineSeries,
  type SpineSessionPoint,
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
  type PullupProgress,
  type NamedSessionSeries,
  type NamedSessionPoint,
  type ReferenceSeries,
} from "../_shared/state-trend/index.ts";
// Slice 6 — the pull-up progression's clean/assisted split. ⛔ Read from the RAW logged sets; the
// `exercise_log` aggregate has no `resistance_level` and cannot answer this.
import { countPullupWork, SESSION_STANDARD_MINUTES, SESSION_STANDARD_REPS } from '../../../src/lib/pullup-progression.ts';
import { computeAcwr, type LoadRow } from "../_shared/acwr.ts";
// Slice 2 (2026-08-12): the strength progress direction reads the PROTOCOL'S declared gauge. The
// protocol id comes from the one resolver (block-identity), the gauge from the one profile table,
// and the all-out sets from the one capture (`_shared/strength/all-out-set.ts`) — no new answers.
import { resolveProtocolId } from "../_shared/block-identity.ts";
import { resolveProfile, protocolEffortRead, type EffortReadMode } from "../_shared/strength-profiles.ts";
import { allOutSeriesByLift, REP_RECORD_WINDOW_SESSIONS } from "../_shared/strength/all-out-set.ts";
import { resolvePlanPhase } from "../_shared/plan-phase.ts";
// D-338: the date → plan-week resolver, so a phase can be resolved for any dated point in the
// series. Same module the coach uses; honours the plan's own week_start rather than assuming Monday.
import { resolvePlanWeekIndex, resolveWeekStartDowFromPlanConfig } from "../_shared/plan-week.ts";
import { computeEfficiencyIndex } from "../_shared/efficiency-index.ts"; // ONE efficiency formula (grade-adjusted feed)
import { projectStandardRaces } from "../_shared/race-readiness/index.ts"; // goal-free VDOT 5k/10k/half/marathon
import { deriveSnapshotWatermark } from "./watermark.ts";
// ⛔ THE ANCHOR RULE (TRUTH-MAP §5): a reference anchor is read through its resolver, never off the
// raw column. The spine had its own private chain for threshold pace — see the block below.
import { resolveCurrentRunThresholdPace } from "../../../src/lib/resolve-current-run-pace.ts";

/**
 * ONE drift read for every State point (2026-09-03) — the same precedence session-detail uses for the
 * Performance screen: the analyser's pace-to-heart-rate decoupling when it computed one, else
 * `hr_drift_v1` (heart rate second half vs first, by time, after the warm-up), else the facts' whole-session
 * drift on a steady day. Never withheld; an interval day is labelled whole-session instead of hidden.
 * ⚠️ `Number(null)` is 0 — the checks are on typeof, never on Number.isFinite alone.
 */
function driftReadForPoint(hrs: any, wa: any, factDrift: number | null | undefined, steady: boolean): { driftPct: number | null; driftBasis: 'gap' | 'raw' | 'hr' | null; driftWholeSession: boolean; fadeWithheld: boolean } {
  // "whole session" the same way session-detail decides it: an interval session (more than two planned steps)
  // or the analyser's mixed-effort flag.
  const steps = Number(wa?.fact_packet_v1?.derived?.interval_execution?.total_steps);
  if (Number.isFinite(steps) && steps > 2) steady = false;
  const dec = typeof hrs?.decouplingPct === 'number' && Number.isFinite(hrs.decouplingPct) ? hrs.decouplingPct : null;
  const v1 = typeof wa?.hr_drift_v1?.pct === 'number' && Number.isFinite(wa.hr_drift_v1.pct) ? wa.hr_drift_v1.pct : null;
  if (dec != null) return { driftPct: Math.round(dec * 10) / 10, driftBasis: hrs?.decouplingBasis === 'raw' ? 'raw' : 'gap', driftWholeSession: !steady, fadeWithheld: false };
  if (v1 != null) return { driftPct: Math.round(v1 * 10) / 10, driftBasis: 'hr', driftWholeSession: !steady, fadeWithheld: false };
  if (steady && typeof factDrift === 'number' && Number.isFinite(factDrift)) return { driftPct: factDrift, driftBasis: 'hr', driftWholeSession: false, fadeWithheld: false };
  return { driftPct: null, driftBasis: null, driftWholeSession: !steady, fadeWithheld: !steady };
}

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
    // 2c. The athlete's TIMEZONE, from the athlete. [Q-252 Stage 2]
    //     Was `body.timezone ? ... : 'America/Los_Angeles'` — and no server caller has ever passed
    //     `timezone`, so every athlete's ACWR day was resolved in one developer's home zone. The
    //     stored value is what the client reported on its last authenticated load; UTC until then.
    //     Never throws — a timezone lookup must not be able to fail a snapshot write.
    // -----------------------------------------------------------------------
    const storedTimezone = await fetchAthleteTimezone(supabase, userId);
    const userTz = resolveAthleteTimezone({ bodyTimezone: body.timezone, storedTimezone });

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
    // ⛔ [Q-252 Stage 2] THE ZONE IS THE ATHLETE'S, NOT A HARDCODE. This line used to end in
    // `: 'America/Los_Angeles'`, and no server caller ever passed `body.timezone` — so every
    // athlete's ACWR day was computed in Pacific. Resolved in §2c above from the stored zone;
    // UTC (a neutral, not a home) until the client reports one. Do not put a region back here.
    // -----------------------------------------------------------------------
    const acwrAsOf = resolveAcwrAsOf({ now: new Date(), timezone: userTz, rangeEnd });
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
    // The typical week per sport — mean of the prior weeks that had any of it (2026-09-02). Read by the
    // payload's `workload_by_discipline_typical` and by the State display contract's `loadByDiscipline`.
    const workloadByDiscTypical: Record<string, number> = (() => {
      const out: Record<string, number> = {};
      const keys = new Set<string>();
      for (const a of priorAggs) for (const k of Object.keys(a.workloadByDisc ?? {})) keys.add(k);
      for (const k of keys) {
        const vals = priorAggs.map((a) => Number(a.workloadByDisc?.[k] ?? 0)).filter((v) => v > 0);
        if (vals.length > 0) out[k] = Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
      }
      return out;
    })();

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
    // [Q-252, fixed 2026-08-10] THE GATE IS TIMEZONE-FREE NOW — DO NOT PUT A CLOCK BACK IN IT.
    // This used to read `if (targetWeek === mondayOfToday())`, which blanked the entire State
    // performance section every Sunday from 17:00 Pacific: edge functions run in UTC, so once UTC
    // ticked into Monday the athlete's own current week failed the equality, the block was skipped,
    // `state_trends_v1` was written null, and run/ride/swim/strength all vanished. Nothing threw and
    // nothing logged — the "(non-fatal)" catch below is a RED HERRING, the code never ran at all
    // (an hour was lost to that catch on 2026-08-02). The build is now-anchored (`todayISO()` /
    // `isoMinus(...)` below), so the calendar week was never what it was reading.
    // The rule and its reasoning live in `./state-trend-gate.ts`: live callers pass no `week_start`
    // and always build; only an explicit PAST `week_start` (recompute-workout) skips.
    const trendGate = stateTrendGate({ bodyWeekStart: body.week_start, targetWeek, mondayNow: mondayOfToday() });
    if (!trendGate.build) {
      // Q-252 step 3: a skipped build must never be silent again.
      console.log(`[compute-snapshot] ${trendGate.skipReason}`);
    } else {
      try {
        const asOf = todayISO();
        const adhStart = isoMinus(STATE_TREND_WINDOWS.adherenceDays - 1);

        /**
         * ⛔⛔ THE BLOCK'S LENGTH IS READ FIRST, BECAUSE IT SIZES THE FETCH BELOW (ruled 2026-08-28).
         *
         * The derived heavy gate's reference max is windowed to the athlete's block (Viada Part H,
         * p215 — the pretest sets the max at block start and the block is written from it). ⛔ A
         * WINDOW CANNOT REACH PAST THE ROWS WE FETCHED: `liftWeeks` is 12, so a 16-week block would
         * have silently got a 12-week window and the ruling would be quietly false for exactly the
         * athletes it names. **The fetch takes the LONGER of the two.**
         * ⚠️ ITS OWN SMALL QUERY, DELIBERATELY. The plan row is already read further down for phases
         * and week indices, but that happens AFTER this batch — and reordering that block to save one
         * cheap lookup would move code that resolves the week map every screen depends on.
         * ⚠️ Non-fatal: no plan, no row, or a failed read → null → the default window. Never a throw.
         */
        let planDurationWeeks: number | null = null;
        try {
          const { data: durRow } = await supabase
            .from("plans").select("duration_weeks")
            .eq("user_id", userId).eq("status", "active")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const n = Number((durRow as any)?.duration_weeks);
          if (Number.isFinite(n) && n > 0) planDurationWeeks = n;
        } catch (e: any) {
          console.log("[compute-snapshot] block length lookup failed (non-fatal):", e?.message || e);
        }
        // ⛔ THE CHART'S HISTORY, NOT THE REFERENCE WINDOW (2026-08-29). `liftWeeks` (12) governs how
        // far back a max stays current; it was also, silently, the only history the line could draw —
        // so a line just rebuilt to show every week's heaviest set still stopped twelve weeks back.
        // `buildBestByLiftSince` re-applies the block window to these same rows, so widening the
        // fetch cannot age a max in.
        const liftFetchWeeks = Math.max(
          STATE_TREND_WINDOWS.liftHistoryWeeks,
          STATE_TREND_WINDOWS.liftWeeks,
          planDurationWeeks ?? 0,
        );

        const [exR, bikeR, runR, swimR, plannedR, doneR, cadenceR, runFactsR, strengthVolR] = await Promise.all([
          // ⛔ `slot_intent` IS SELECTED OR THE HEAVY-ONLY GATE CANNOT FIRE (2026-08-28). The exact trap
          // D-417 hit on the record: the rule lived in the shared reader and the query did not fetch
          // the column it needed, so the gate structurally could not apply and rotted silently.
          // ⛔ `best_weight` IS SELECTED FOR THE DERIVED HEAVY GATE (item 4, Q-297). Without it
          // `setMintsAMax`'s second door reads `undefined` on every row and can never fire — the
          // same starvation `slot_intent` suffered at three separate points before it reached a screen.
          supabase.from("exercise_log").select("date,canonical_name,exercise_name,estimated_1rm,best_reps,best_weight,slot_intent")
            // ⚠️ `liftFetchWeeks`, NOT `liftWeeks` — the reference-max window is the block's length and
            // cannot reach past the rows fetched here. See the block above.
            .eq("user_id", userId).gte("date", isoMinus(liftFetchWeeks * 7)).order("date"),
          supabase.from("workouts").select("date,workout_analysis,workout_metadata")
            .eq("user_id", userId).in("type", ["ride", "bike"]).not("workout_analysis", "is", null)
            .order("date", { ascending: false }).limit(STATE_TREND_WINDOWS.bikeLimit),
          // RUN durability substrate — seeded from the SPINE (workouts.workout_analysis), NOT
          // route_progress_metrics. A treadmill / no-GPS run writes no route row but has a perfectly
          // good decoupling number in workout_analysis.heart_rate_summary; driving the read off the
          // routes table made those runs INVISIBLE to durability (STATE-SOURCE-MAP #3/#4 — "a courtesy
          // feature may never gate a fitness verdict"; found live by scripts/state-data-check.mjs,
          // 2026-07-21). 90d cadence window; classifyTrend windows the trend to runDays internally.
          supabase.from("workouts").select("id,date,workout_analysis,computed,weather_data")
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

        // Q-255: the bike load floor's inputs. Current CTL/TSB = the newest ride's point-in-time
        // fitness_v1 (same source the athlete_snapshot.ctl column update below uses); prior CTL for
        // the trend = a snapshot row ~3-6 weeks back (columns may be unmigrated → non-fatal null).
        let bikeLoad: { ctl: number; tsb: number; ctlPrior: number | null; daysBetween: number | null } | null = null;
        try {
          const newestFit = (bikeR.data ?? [])
            .map((r: any) => ({ date: String(r.date), f: r.workout_analysis?.fitness_v1 }))
            .find((x: any) => x.f && Number.isFinite(Number(x.f.ctl)) && Number.isFinite(Number(x.f.atl)));
          if (newestFit) {
            const c = Number(newestFit.f.ctl);
            const a = Number(newestFit.f.atl);
            const tRaw = Number(newestFit.f.tsb);
            let ctlPrior: number | null = null;
            let daysBetween: number | null = null;
            const { data: priorRows } = await supabase
              .from("athlete_snapshot").select("week_start, ctl")
              .eq("user_id", userId)
              .lt("week_start", isoMinus(21)).gte("week_start", isoMinus(42))
              .not("ctl", "is", null)
              .order("week_start", { ascending: false }).limit(1);
            const prior = (priorRows ?? [])[0] as any;
            if (prior && Number.isFinite(Number(prior.ctl))) {
              ctlPrior = Number(prior.ctl);
              daysBetween = Math.round(
                (new Date(newestFit.date + "T00:00:00Z").getTime() - new Date(String(prior.week_start) + "T00:00:00Z").getTime()) / 86400000,
              );
            }
            const newestAgeDays = Math.max(0, Math.round(
              (new Date(asOf + "T00:00:00Z").getTime() - new Date(newestFit.date + "T00:00:00Z").getTime()) / 86400000,
            ));
            // The floor's chart: point-in-time CTL stamped on each analyzed ride, ascending.
            const ctlSeries = (bikeR.data ?? [])
              .map((r: any) => ({ date: String(r.date), v: Number(r.workout_analysis?.fitness_v1?.ctl) }))
              .filter((x: any) => Number.isFinite(x.v))
              .map((x: any) => ({ date: x.date, value: x.v }));
            bikeLoad = { ctl: c, tsb: Number.isFinite(tRaw) ? tRaw : c - a, ctlPrior, daysBetween, newestRideAgeDays: newestAgeDays, series: ctlSeries };
          }
        } catch { bikeLoad = null; }

        // Runs now come straight from the spine (workout_analysis is on each row). effort_adjusted_pace
        // is the ONE column route_progress_metrics owns — joined by workout_id when a route row exists,
        // null otherwise (treadmill). No rendered verdict reads it (audit), so its absence never drops
        // a run from the durability read — that was the whole bug.
        const runRows = (runR.data ?? []) as any[];
        const runWids = [...new Set(runRows.map((r) => r.id).filter(Boolean))];
        const routePaceByWid = new Map<string, number>();
        // ⛔ THE RUN VERDICT: EVERY RUN, GRADE-ADJUSTED, HEAT LEARNED (D-346, 2026-07-31).
        //
        // Michael, after two passes at this: *"i just want to have what trainingpeaks or strava has but
        // with maybe a little more detail."* This is exactly that. TrainingPeaks' Efficiency Factor is
        // normalized GRADED pace over heart rate across steady runs — terrain is normalised by the grade
        // adjustment, not by matching routes. The "little more detail" is the heat coefficient, fitted
        // from the athlete's own hot-vs-cool runs by `routeTrend`'s joint regression.
        //
        // ⛔ SAME-ROUTE WAS TRIED FIRST AND IS TOO THIN. On his history it gave 21 runs and a confidence
        // interval of −13.7%…+5.3% — permanently "still learning". The grade-adjusted pool gives 127 runs
        // and an interval that clears zero. **Holding terrain constant by matching routes throws away
        // five sixths of the evidence to avoid trusting an adjustment the app already computes.**
        //
        // ⚠️ THE FITTED COEFFICIENT AGREES WITH THE LITERATURE, which is the reason to trust it: the
        // regression learns −0.22 to −0.34% per °F across his windows, and published work puts the
        // performance cost near −0.22%/°F. Data and science landed on the same number independently.
        const runEffHistory: Array<Record<string, unknown>> = [];
        const runEffIndexByDate = new Map<string, number>();
        const runHrByDate = new Map<string, number>(); // for the GRADE-ADJUSTED efficiency (GAP-pace ÷ HR)
        /**
         * ⛔⛔ WHAT KIND OF SESSION IT WAS — THE RICH ANSWER, WHICH NOTHING WAS READING (2026-08-28).
         *
         * There are TWO `workout_type` fields on a run and this file was joining the poor one.
         *  - `workout_analysis.heart_rate_summary.workoutType` — the analyser's. `mapClassifiedTypeToHrWorkoutType`
         *    collapses EVERYTHING to three words: `intervals`, `hill_repeats`, `steady_state`. A tempo, a
         *    threshold run, a race and a two-hour long run all read `steady_state`.
         *  - `run_facts.workout_type` — `classifyRunIntent`'s, written since 2026-07-30 off the PLAN the
         *    run is attached to, and now separating `long` as its own word.
         *
         * ⛔ THE SECOND ONE HAS NEVER REACHED A READER. It was written to fix the steady gate and the
         * join was never moved, so every consumer of `workout_type` here has been reading the
         * three-word field — which is why the code comments around this row say it "reads
         * `steady_state` on every run ever logged". **The classifier was not missing. It was starved.**
         *
         * ⚠️ FALLS BACK, NEVER BLANKS: no `run_facts` word → the analyser's, exactly as before.
         */
        // ⛔ THE PLAN'S WORD OR NOTHING (2026-09-02, Michael: "just let the plan tag it, don't do any more
        // math than necessary"). The analyser's HR-derived `steady_state | intervals | hill_repeats`
        // fallback is gone from every grouping site below; an untagged run groups as easy, no inference.
        const runTypeByDate = new Map<string, string>();
        // OURS (2026-09-03): easy read taken from a HARD run's warm-up (`run_facts.warmup_easy`), so a
        // block with no easy runs still feeds the easy pool. See `_shared/run-warmup-easy.ts`.
        const runWarmupByDate = new Map<string, { pace_s_per_km: number; hr_avg: number; seconds: number }>();
        for (const f of (runFactsR.data ?? []) as any[]) {
          const we = f.run_facts?.warmup_easy;
          if (we && Number(we.pace_s_per_km) > 0 && Number(we.hr_avg) > 0) runWarmupByDate.set(f.date, we);
          const v = f.run_facts?.efficiency_index;
          if (typeof v === "number") runEffIndexByDate.set(f.date, v);
          const h = f.run_facts?.hr_avg;
          if (typeof h === "number" && h > 0) runHrByDate.set(f.date, h);
          const t = f.run_facts?.workout_type;
          if (typeof t === "string" && t.trim().length > 0) runTypeByDate.set(f.date, t.trim().toLowerCase());
        }
        const MI_PER_KM = 1 / 1.60934;
        const runJoined = runRows.map((r) => {
          const hrs = r.workout_analysis?.heart_rate_summary ?? null;
          // GRADE-ADJUSTED efficiency (2026-07-21): the stored GAP pace fed into the ONE efficiency
          // formula (computeEfficiencyIndex) with the run's HR — terrain-honest "faster at the same
          // heart rate". FIX (2026-07-22, from reading Michael's DB): the GAP lives at
          // computed.overall.gap_pace_s_per_mi (Minetti, now one-source), NOT
          // workout_analysis.overall.avg_gap_s_per_mi (which is empty — the per-sample analysis GAP isn't
          // persisted there; a separate follow-up). Falls to null → raw efficiency_index for flat/no-GAP.
          // 2026-09-03: the analyser's grade-adjusted pace first (`avg_gap_s_per_mi`, the number Performance and
          // Details show); the summary's own pass (`gap_pace_s_per_mi`) only when the analyser has not run.
          const gapPaceSecPerMi = Number(r.computed?.overall?.avg_gap_s_per_mi ?? r.computed?.overall?.gap_pace_s_per_mi);
          const gapPaceSecPerKm = Number.isFinite(gapPaceSecPerMi) && gapPaceSecPerMi > 0 ? gapPaceSecPerMi * MI_PER_KM : null;
          const gapEfficiencyIndex = computeEfficiencyIndex(gapPaceSecPerKm, runHrByDate.get(r.date) ?? null);
          // The efficiency-trend row: GRADE-ADJUSTED pace ÷ HR, with the day's temperature carried so the
          // regression can fit the heat term and the chart can caption the conditions.
          {
            const hrForTrend = runHrByDate.get(r.date) ?? null;
            const tF = Number((r as any)?.weather_data?.temperature);
            if (gapPaceSecPerKm != null && gapPaceSecPerKm > 0 && Number(hrForTrend) > 0) {
              runEffHistory.push({
                date: r.date,
                pace_s_per_km: gapPaceSecPerKm,
                hr: Number(hrForTrend),
                temp_f: Number.isFinite(tF) ? tF : null,
                /**
                 * ⛔ `intent` STAYS NULL ON PURPOSE, AND `workout_type` IS THE NEW FIELD BESIDE IT.
                 * `routeTrend`'s `isComparableIntent` is a BLOCKLIST that DELETES intervals, tempo
                 * and races. Filling `intent` would switch exclusion back on under another name —
                 * the exact thing work-order item 2 exists to reverse. The session type rides here
                 * instead, and `assemble.ts` uses it to PARTITION the pool into groups.
                 */
                intent: null,
                workout_type: runTypeByDate.get(r.date) ?? null,
              });
            }
            // The warm-up of a run that is NOT easy joins the easy pool as its own point (OURS, 2026-09-03).
            const we = runWarmupByDate.get(r.date);
            const wordForDay = String(runTypeByDate.get(r.date) ?? '').toLowerCase();
            const isEasyDay = wordForDay === '' || wordForDay === 'easy' || wordForDay === 'recovery';
            if (we && !isEasyDay) {
              runEffHistory.push({
                date: r.date,
                pace_s_per_km: Number(we.pace_s_per_km),
                hr: Number(we.hr_avg),
                temp_f: Number.isFinite(tF) ? tF : null,
                intent: null,
                workout_type: 'easy',
                source: 'warmup',
              });
            }
          }
          return {
            metric_date: r.date,
            effort_adjusted_pace_sec_per_km: routePaceByWid.get(r.id) ?? null,
            efficiency_index: runEffIndexByDate.get(r.date) ?? null,
            gap_efficiency_index: gapEfficiencyIndex, // grade-adjusted; the run row's new lead
            hr_avg: runHrByDate.get(r.date) ?? null,
            decoupling_pct: hrs?.decouplingPct ?? null,
            decoupling_basis: hrs?.decouplingBasis ?? null,
            decoupling_mixed_effort: hrs?.decouplingMixedEffort ?? null, // confidence hedge — NOT a filter
            decoupling_confounded: hrs?.decouplingConfounded ?? null, // heat/RPE-confounded → excluded from the durability substrate
            // ⛔ THE PLAN'S OWN WORD FIRST (2026-08-28) — see `runTypeByDate` above. The analyser's
            // three-word field is the fallback, so nothing that read this before reads less now.
            workout_type: runTypeByDate.get(r.date) ?? null,
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
          reps: e.best_reps, // D-417: trust gate — a high-rep set can't mint the e1RM series (records/trend/sparkline)
          // ⛔ AND THE WEIGHT RIDES ALONG (item 4). This map is the narrow point: selecting the column
          // above and dropping it here leaves the derived door reading `undefined` and silently shut.
          best_weight: e.best_weight,
          // ⛔ AND THE INTENT RIDES ALONG OR THE HEAVY-ONLY GATE IS DEAD (2026-08-28). This map is the
          // narrow point: selecting the column above and dropping it here would leave
          // `intentCanMintAMax` reading undefined on every row and failing open on all of them — a
          // gate that exists, is tested, and never once fires. Same starvation the field itself had.
          slot_intent: e.slot_intent,
        }));

        // REAL PR frame (2026-07-21) — the best estimated 1RM across ALL logged history per lift, NOT
        // the 6wk window. A PR must be a genuine new all-time high (a new 1RM), not "best of 6 weeks".
        //
        // ⛔ `best_reps` IS IN THIS SELECT BECAUSE THE RECORD IS TRUST-GATED (D-417, applied 2026-08-12).
        // It was not, and the reduce lived inline here — so the record could not apply the ceiling the
        // SERIES twenty lines above already applies, and the screen showed a deadlift "best" of 225 lb
        // (a 105 × 35 set) above its own 120-150 trusted range. The reduce now lives next to the series
        // builder (`buildAllTimeBestByLift`, state-trend/assemble.ts) so the two reads of this table
        // share one visible gate instead of drifting apart again.
        let allTimeBestByLift: Record<string, { best: number; count: number }> = {};
        try {
          const { data: allHist } = await supabase.from("exercise_log")
            // ⚠️ `slot_intent` IS SELECTED AND THE RECORD NO LONGER READS IT (ungated 2026-08-28 —
            // the line and the record are different claims; see `buildAllTimeBestByLift`). Kept in
            // the select so this query and the series query stay one shape, and so re-reading it is
            // a one-line change rather than a re-traced column. `best_reps` IS load-bearing: the rep
            // ceiling (D-417) is the gate the two readers really do share.
            .select("canonical_name,estimated_1rm,best_reps,slot_intent")
            .eq("user_id", userId).not("estimated_1rm", "is", null);
          allTimeBestByLift = buildAllTimeBestByLift((allHist ?? []) as any[]);
        } catch (e: any) { console.warn('[compute-snapshot] all-time-best e1RM query failed (non-fatal):', e?.message ?? e); }

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
        let pullupFocusOn = false;
        try {
          const { data: activeGoal } = await supabase
            .from("goals").select("training_prefs")
            .eq("user_id", userId).eq("status", "active")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const tp = (activeGoal as any)?.training_prefs ?? null;
          posture = sanitizePosture(tp?.per_discipline_posture);
          declaredSpw = declaredSessionsPerWeek(tp);
          // ⛔ THE PULL-UP PROGRESSION IS OPT-IN, so the row is gated on the athlete's own goal, not
          // on whether they happen to have logged a chin. Same read, one field over.
          pullupFocusOn = (tp?.assistance_picks as { performance_focus?: unknown } | null)
            ?.performance_focus === 'pullups';
          if (posture) console.log("[compute-snapshot] Q-179 posture:", JSON.stringify(posture), "declared/wk:", JSON.stringify(declaredSpw));
        } catch (e: any) {
          console.log("[compute-snapshot] posture read failed (non-fatal):", e?.message || e);
        }

        // ── D-338: WHAT THE PLAN WAS ASKING FOR ON EACH OF THOSE DAYS ───────────────────────────
        //
        // ⛔ THE TREND HAS NEVER KNOWN THIS, AND IT IS WHY IT LIES AFTER A DELOAD. `state-trend/
        // strength.ts` passes `exclude: isDeloadWeek` into the classifier, `deload.ts` reads
        // `point.meta.name` — and the points are built `{date, value}` with no meta at all. So the
        // exclusion has been a no-op since the series was written.
        //
        // On the previous program that is not cosmetic. Week 4 is 40/50/60% of the working number, so its estimate
        // lands ~30% below its neighbours; it drags the recent end of the window and the row reads
        // "slipping" on a week the athlete followed exactly.
        //
        // ⚠️ RESOLVED HERE, ONCE, off the SINGLE plan-phase resolver (`plan-phase.ts`, D-261) — not
        // by a second phase notion and not from the planned row's tags, which only exist when the
        // session happens to be attached. A phase is a property of the DATE and the plan, so an
        // unattached session on a deload week is still a deload week.
        let phaseByDate: Record<string, string> | null = null;
        /**
         * ⛔⛔ WHICH BLOCK WEEK EACH DATED POINT FELL IN — resolved HERE, off the one resolver, and
         * sent to the client on the point. A card labelling its axis "week 6" must not derive that
         * from dates plus a block start: that is the surface re-deciding a fact the spine owns, and
         * it drifts the first time a block is deleted and rebuilt.
         *
         * ⚠️ BOUNDED BY HAND, BECAUSE `resolvePlanWeekIndex` CLAMPS. It pins any date before the
         * start to week 1 and any date after the end to the last week — so a session from a
         * PREVIOUS block would come back labelled "week 1" of this one, which is the exact lie a
         * rebuilt block would tell on the athlete's first day. Anything outside the window is
         * omitted, and a point with no week is drawn without one.
         */
        let weekByDate: Record<string, number> | null = null;
        let testWeekDates: string[] | null = null;
        // ⛔ THE PLAN'S WEEK START-DAY — the same resolver the coach cuts the planned-vs-actual bar
        // on. Handed to the assembler so the weekly lifting card is cut on the SAME week as that bar
        // (2026-09-01, Michael: "is this a rolling week?"). The resolver's own default when no plan.
        let weekStartDow: ReturnType<typeof resolveWeekStartDowFromPlanConfig> = resolveWeekStartDowFromPlanConfig(null);
        /** ⛔ The block's expected curve per lift — see the build below. Null when the block has no
         *  working numbers yet (before the test is read), which draws the readings alone. */
        let expectedByCanonical: Record<string, Array<{ date: string; value: number }>> | null = null;
        let measuredDates: string[] = [];
        // Slice 2: what the block says it READS. 'amrap' (the previous program) puts waved main lifts on the
        // all-out-set gauge; anything else keeps the e1RM read, byte for byte.
        let strengthEffortRead: EffortReadMode | null = null;
        /** ⛔ `plans.duration_weeks` — the derived heavy gate's recency window. Null → the assembly
         *  falls back to `STATE_TREND_WINDOWS.defaultBlockWeeks`, never to a number chosen here. */
        let blockDurationWeeks: number | null = planDurationWeeks;
        try {
          const { data: activePlanRow } = await supabase
            .from("plans").select("config,duration_weeks")
            .eq("user_id", userId).eq("status", "active")
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const cfg = (activePlanRow as any)?.config ?? null;
          if (cfg) {
            weekStartDow = resolveWeekStartDowFromPlanConfig(cfg);
            const protocolId = resolveProtocolId(cfg);
            strengthEffortRead = protocolId ? protocolEffortRead(resolveProfile(protocolId)) : null;
            const dur = Number((activePlanRow as any)?.duration_weeks) || null;
            // ⛔ THE BLOCK'S LENGTH IS ALSO THE "KNOWN MAX" WINDOW (ruled 2026-08-28, item 4). Viada
            // Part H p215: the pretest sets the max at block start and the block is written from it,
            // so a max is a fact with a lifespan and the lifespan is the block. Carried to the
            // assembly rather than re-derived there — the plan row is read here and nowhere else.
            if (dur && dur > 0) blockDurationWeeks = dur;
            const dates = new Set<string>([
              ...exerciseRows.map((r: any) => String(r.date)),
              ...strengthVolumeRows.map((r: any) => String(r.date)),
              // ⚠️ RUN DATES JOIN THE SAME MAP, not a second one — the named-session card needs a
              // block week on each run, and it is the same question against the same window with
              // the same bounding. A second resolver is how two surfaces come to disagree about
              // which week a Wednesday was.
              ...runRows.map((r: any) => String(r.date)),
            ].filter(Boolean));
            const map: Record<string, string> = {};
            const weeks: Record<string, number> = {};
            // The block's own window. `dur` may be absent on an older row; without it there is no
            // end to bound against and every week goes unlabelled rather than mislabelled.
            const blockStart = String(cfg?.user_selected_start_date || cfg?.start_date || '').slice(0, 10);
            const blockEndExclusive = (() => {
              if (!blockStart || !dur) return null;
              const d0 = new Date(`${blockStart}T12:00:00`);
              if (Number.isNaN(d0.getTime())) return null;
              d0.setDate(d0.getDate() + dur * 7);
              return d0.toISOString().slice(0, 10);
            })();
            for (const d of dates) {
              const wk = resolvePlanWeekIndex(cfg, d, dur);
              const ph = wk != null ? resolvePlanPhase(cfg, wk) : null;
              if (ph) map[d] = String(ph).toLowerCase();
              // ⚠️ INSIDE THE BLOCK ONLY — see `weekByDate` above for why the clamp cannot be trusted.
              if (wk != null && blockStart && blockEndExclusive && d >= blockStart && d < blockEndExclusive) {
                weeks[d] = wk;
              }
            }
            if (Object.keys(map).length) phaseByDate = map;
            if (Object.keys(weeks).length) weekByDate = weeks;
            /**
             * ⛔ WHICH DATES THE PLAN CALLS A TEST — resolved once, here, and handed to the spine.
             * The heavy band opens at 90% and the p215 pretest tops out at 86.25%, so a test week's
             * heavy count is structurally zero and the band must not print for it. The spine is TOLD;
             * it does not work it out. See `ViadaWeekPerformed.patternBandApplies`.
             * ⚠️ `isTestWeek` is the only definition — no week number is compared to a literal here
             * or anywhere downstream.
             */
            const testDates = Object.entries(weeks)
              .filter(([, w]) => Number.isFinite(Number(w)) && isTestWeek(Number(w)))
              .map(([d]) => d);
            if (testDates.length) testWeekDates = testDates;

            /**
             * ⛔⛔ THE EXPECTED CURVE — the faint line behind the lift's own readings.
             *
             * ⛔ IT ANCHORS ON THE BLOCK'S OPENING WORKING NUMBER, not on the first heavy reading
             * (ruled 2026-08-28). Week 1 is the two tests, so a curve anchored on a logged set could
             * not be drawn until the block's second week — the curve would be missing exactly when
             * the card has least else to show. The working number is stored at build and is
             * available from day one.
             *
             * ⛔ THE RATE IS THE PLAN'S OWN, read off `RATE_ANCHOR` — 1% every three weeks (p247),
             * the same constant the block's working numbers were composed from. A second copy of
             * that number here is how the curve and the plan come to disagree.
             *
             * ⚠️ IT STAYS BLOCK-SCOPED WHILE THE READINGS DO NOT. The line is the athlete's heavy
             * sets across blocks — those do not stop being theirs because a plan was rebuilt — but
             * "where the programme says you should be" is a claim only the current programme can
             * make, and it starts where that programme starts. Two clocks on one chart, deliberately.
             */
            try {
              const sp = (cfg as any)?.standing_plan;
              const wn = sp?.working_numbers;
              const names = sp?.test_lift_names;
              const rate = RATE_ANCHOR[(sp?.frame as keyof typeof RATE_ANCHOR)]?.perWeek;
              if (wn && names && blockStart && Number.isFinite(rate)) {
                const out: Record<string, Array<{ date: string; value: number }>> = {};
                const weeksN = Math.max(1, Number(dur) || 12);
                for (const [lift, w] of Object.entries(wn as Record<string, any>)) {
                  const start = Number(w?.workingNumber);
                  const name = String(names?.[lift] ?? "").trim();
                  if (!Number.isFinite(start) || start <= 0 || !name) continue;
                  const key = canonicalize(name);
                  const pts: Array<{ date: string; value: number }> = [];
                  for (let i = 0; i < weeksN; i++) {
                    const d = new Date(`${blockStart}T12:00:00`);
                    d.setDate(d.getDate() + i * 7);
                    pts.push({
                      date: d.toISOString().slice(0, 10),
                      value: Math.round(start * (1 + (rate as number) * i) * 10) / 10,
                    });
                  }
                  if (pts.length > 1) out[key] = pts;
                }
                if (Object.keys(out).length > 0) expectedByCanonical = out;
              }
            } catch (e: any) {
              // Non-fatal: no curve → the card draws the readings alone, which is still the read.
              console.log("[compute-snapshot] expected curve build failed (non-fatal):", e?.message || e);
            }
          }
        } catch (e: any) {
          // Non-fatal: no phase → exactly today's behaviour (nothing excluded), never a crash.
          console.log("[compute-snapshot] D-338 phase resolve failed (non-fatal):", e?.message || e);
        }
        /**
         * ⛔⛔ ONE NAMED SESSION, WEEK BY WEEK — the same workout repeated, and its heart rate.
         *
         * A standing block prescribes the identical near-threshold run every week by design (p120 —
         * the standard week is built to be run indefinitely). Measured on a composed twelve-week
         * block: Wednesday, 66 minutes, `family:run_near_threshold`, all twelve weeks including the
         * test week. **The workout does not change, so any change in the line is the athlete** —
         * which is exactly what the existing run row cannot say, because it trends efficiency across
         * ALL steady runs, where route, weather and distance move at once. Both rows stay.
         *
         * ⛔⛔ A RUN THAT WAS NEVER ATTACHED TO ITS PLANNED ROW CANNOT APPEAR HERE, AND THAT IS
         * CORRECT. The family lives on `planned_workouts.tags`; a logged run reaches it only through
         * `workouts.planned_id`, the link `auto-attach-planned` makes at ingest. If a week is missing
         * from this card, **the fault is in the linker, not in this join** — look there.
         * ⚠️ DO NOT ADD A FALLBACK THAT GUESSES FROM DAY-OF-WEEK AND DURATION. A Wednesday run of
         * about the right length is not evidence that it WAS the prescribed session, and this app
         * records what it is told rather than inferring (ruled 2026-08-28).
         *
         * ⚠️ THE SAME SHAPE AS THE STRENGTH JOIN BELOW (`allOutByLift`): ids off the workouts, one
         * query for the planned rows, a map. Not a new mechanism.
         *
         * ⛔⛔ BLOCK-SCOPED ON PURPOSE, AND IT IS NOT THE SAME QUESTION AS THE STRENGTH LINE. That
         * line went ROLLING across blocks on 2026-08-28, because a lifted weight and a rep count are
         * a fact about a set — true forever, independent of any plan, and they do not stop being the
         * athlete's because the app rebuilt their programme.
         *
         * ⛔ A POINT ON THIS CARD IS NOT THAT SHAPE. Its entire claim is *"the same prescribed
         * session, repeated, so any change in the line is you"* — and that holds only WITHIN a
         * block. Across blocks it does not: a different hours answer or experience tier resolves
         * this family at a different level and a different duration, so a rolling version would put
         * two different workouts on one line and read the difference as fitness. **That is the exact
         * failure this card exists to avoid**, arrived at from the other direction.
         *
         * ⚠️ SO DO NOT "FIX" THIS TO MATCH THE STRENGTH LINE. The asymmetry is the reasoning, not an
         * oversight: a set is a measurement, a session is a prescription, and only one of them
         * survives its plan.
         */
        /**
         * ⛔⛔ THE ENDURANCE FACTS, RESOLVED ONCE AND WITHOUT A PLAN (2026-08-28, work order item 3).
         *
         * These two maps used to live INSIDE the `weekByDate` branch below, which made a block week
         * map a precondition for reading a heart rate. They are hoisted because the SPINE needs them
         * and the spine is athlete-scoped: **a run is yours whether a plan exists or not** (Michael's
         * ruling, Q-294). The plan-linked overlay reads the same two maps, so there is one query and
         * one definition rather than a second copy that could drift.
         */
        const endFactByDate = new Map<string, { efficiency: number | null; drift: number | null; hr: number | null; elevM: number | null }>();
        const keyDates = new Set<string>();
        try {
          const { data: factRows } = await supabase
            .from("workout_facts").select("date,discipline,run_facts,ride_facts")
            .eq("user_id", userId).in("discipline", ["run", "ride"])
            .gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)).lte("date", asOf);
          for (const f of (Array.isArray(factRows) ? factRows : []) as any[]) {
            const rf = f?.run_facts, bf = f?.ride_facts;
            const src = rf ?? bf;
            if (!src) continue;
            /**
             * ⛔ THE FACTS ARE READ AS STORED, NEVER RE-DERIVED. `run_facts.efficiency_index` is
             * metres per second per beat; `ride_facts.efficiency_factor` is normalised power over
             * average heart rate — TrainingPeaks' EF exactly, already published by the analyser. A
             * second derivation here would fork the definition from the one every other surface uses.
             */
            const eff = Number(rf?.efficiency_index ?? bf?.efficiency_factor);
            const drift = Number(src?.hr_drift_pct);
            const hr = Number(rf?.hr_avg ?? bf?.avg_hr);
            endFactByDate.set(String(f.date).slice(0, 10), {
              efficiency: Number.isFinite(eff) && eff > 0 ? eff : null,
              // ⚠️ Drift may legitimately be NEGATIVE (HR fell across the session), so the guard is
              // finiteness alone. A `> 0` test here would silently drop the best sessions.
              drift: Number.isFinite(drift) ? drift : null,
              hr: Number.isFinite(hr) && hr > 0 ? hr : null,
              // the climb, as a fact beside the drift (Michael 2026-09-02: hills and heat matter; the athlete deciphers)
              elevM: (() => { const e = Number(rf?.elevation_gain_m ?? bf?.elevation_gain_m); return Number.isFinite(e) && e > 0 ? Math.round(e) : null; })(),
            });
          }
          /**
           * ⛔ WHICH DAYS CARRY A KEY SESSION — p107's tighter 5% line applies when one falls within
           * 24 hours. Read off the PLAN, never guessed from the weekday: the frame's rotation decides
           * which days are hard, and it moves with the athlete's pins.
           * ⚠️ AN ATHLETE WITH NO PLAN SIMPLY HAS AN EMPTY SET, so every session takes p107's standard
           * 10% line. That is the correct read, not a missing one — with nothing prescribed inside 24
           * hours there is no key session for the tighter line to protect.
           */
          const { data: keyRows } = await supabase
            .from("planned_workouts").select("date,tags")
            .eq("user_id", userId).gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)).lte("date", addDaysIso(asOf, 1));
          for (const p2 of (Array.isArray(keyRows) ? keyRows : []) as any[]) {
            const tags = (Array.isArray(p2?.tags) ? p2.tags : []).map((t: any) => String(t).toLowerCase());
            /**
             * ⛔ A KEY SESSION IS ONE OF THE BLOCK'S QUALITY SLOTS OR A BARBELL DAY, AND THAT IS THE
             * PAGE'S OWN DEFINITION RATHER THAN ours. p107: *"one targeting a system or adaptation
             * that you're hoping to improve in the current training cycle."*
             * ⚠️ DO NOT NARROW THIS BACK TO ENDURANCE. In a strength-led block a barbell day is
             * squarely what that sentence describes — it is the adaptation the cycle exists for.
             * An easy run the next morning is not, which is the whole reason the 5% line is
             * tighter than the 10% one.
             */
            const isKey = tags.some((t: string) => /family:(run_near_threshold|run_sprint|ride_sweet_spot|ride_vo2|ride_anaerobic)/.test(t))
              || tags.includes('strength');
            if (isKey) keyDates.add(String(p2.date).slice(0, 10));
          }
        } catch (e: any) {
          console.log("[compute-snapshot] endurance facts load failed (non-fatal):", e?.message || e);
        }

        /**
         * ⛔⛔ THE SPINE — EVERY RUN AND EVERY RIDE, NO PLAN REQUIRED (work order item 3, Q-294).
         *
         * ⛔ WHAT WAS WRONG. A run reached the endurance read only if it carried a `planned_id`, whose
         * planned row carried `family:run_near_threshold`, on a date inside the current block's week
         * map. **Three plan preconditions on a measurement that has none.** Every one of the five
         * TrainingPeaks numbers is plan-agnostic; only the IDENTIFICATION was plan-locked. Michael's
         * ruling: *a lift is prescribed so the plan is the right frame; a run is yours whether a plan
         * exists or not.*
         *
         * ⛔ SO THIS IS THE PRIMARY READ AND THE NAMED-SESSION CARD BELOW IS THE OVERLAY. The build
         * had it inverted — Viada's same-session-versus-itself test shipped as the headline, and the
         * TrainingPeaks spine it should sit on was filtered down to nothing.
         *
         * ⛔ NO WEEK AXIS, BY CONSTRUCTION. Block weeks are the overlay's frame. Dates are the
         * spine's, which is why a rebuilt block cannot empty it.
         * ⛔ AND NO GUESSING. There is deliberately no day-of-week + duration fallback inferring which
         * prescribed session a run "was" (ruled 2026-08-28). The overlay stays honest by staying
         * linked; the spine does not need to guess because it does not care.
         *
         * ⚠️ GROUPED BY SESSION TYPE, using `runSessionGroup` — the SAME predicate the efficiency
         * trend groups on (item 2). Not a second rule. Rides carry one group: the bike has no
         * equivalent session-type classifier, and inventing one here would be exactly the second
         * vocabulary this codebase keeps growing.
         */
        let enduranceSpine: EnduranceSpineSeries[] = [];
        try {
          const { data: spineRows } = await supabase
            .from("workouts").select("date,type,workout_analysis,weather_data")
            .eq("user_id", userId).in("type", ["run", "running", "ride", "bike", "cycling"])
            .eq("workout_status", "completed")
            .gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)).lte("date", asOf);
          const bySport = new Map<string, Map<string, SpineSessionPoint[]>>();
          // 2026-09-03 (Michael: "easy runs should start reacting to the warm-ups, right?"): the warm-up read
          // off a hard run (`run_facts.warmup_easy`, D-463) becomes an EASY point in this series too, so the
          // easy-runs block (efficiency factor, count, trend) keeps moving in a block with no easy runs.
          // Marked `fromWarmup` so the card can say so.
          const warmByDate = new Map<string, { pace_s_per_km: number; hr_avg: number; seconds: number }>();
          for (const f of (runFactsR.data ?? []) as any[]) {
            const we = f?.run_facts?.warmup_easy;
            if (we && Number(we.pace_s_per_km) > 0 && Number(we.hr_avg) > 0) warmByDate.set(String(f.date).slice(0, 10), we);
          }
          for (const r of (Array.isArray(spineRows) ? spineRows : []) as any[]) {
            const t = String(r?.type || "").toLowerCase();
            const sport = t.includes("run") ? "run" : "ride";
            const date = String(r?.date || "").slice(0, 10);
            if (date.length !== 10) continue;
            const f = endFactByDate.get(date);
            // ⚠️ A POINT NEEDS SOMETHING TO PLOT. No heart rate and no efficiency is a session we
            // measured nothing on; inventing a zero would draw a crash.
            if (!f || (f.hr == null && f.efficiency == null)) continue;
            const hrs = r?.workout_analysis?.heart_rate_summary ?? null;
            const group = sport === "run"
              ? runSessionGroup(runTypeByDate.get(date) ?? null) // plan tag or easy — no analyser guess (2026-09-02)
              : "all";
            /**
             * ⛔⛔ THE FADE NUMBER IS WITHHELD WHEN THE SESSION WAS NOT STEADY — RULED 2026-08-28.
             * **Decided on WHAT THE SESSION ACTUALLY WAS, not on its duration and not on its plan.**
             *
             * Fade (decoupling) is a within-session durability read and it requires a steady effort.
             * Viada's long run deliberately is NOT one — p235: *"may include rest periods or pauses…
             * with little negative impact"*; p246: *"90 to 100 minutes… with an emphasis on LT
             * intervals"*, shorter fartlek variations for the less experienced, race-pace finishes and
             * surges at every level, *"intensity may be lower past 60 minutes"*. **A fade read on that
             * session would report a durability failure every week on an athlete following the book
             * exactly** — the pace changes by prescription and the ratio falls apart by design.
             *
             * ⚠️ THE FLAG ALREADY EXISTED AND THIS IS NOT A SECOND STEADINESS TEST. D-283 correctly
             * made `decoupling_mixed_effort` a HEDGE rather than an exclusion for the general
             * durability row. **Here it is the SWITCH.** Not a contradiction: D-283 says do not delete
             * a steady run for being LOW-CONFIDENCE; this says do not print a fade number for a
             * session that WAS NOT STEADY.
             * ⛔ IT WITHHOLDS THE FIGURE ONLY. The session still carries its efficiency and still
             * feeds the trend — never dropped.
             * ⚠️ CONSEQUENCE, STATED AND CORRECT: a marathon-plan long run is usually genuinely steady
             * and gets a fade number; a Viada standing-block long run usually is not and does not.
             * Same athlete, same distance, different number. **That is the design — the surface must
             * say so rather than letting it read as missing data.**
             */
            const steady = hrs?.decouplingMixedEffort !== true;
            bySport.set(sport, bySport.get(sport) ?? new Map());
            const groups = bySport.get(sport)!;
            groups.set(group, groups.get(group) ?? []);
            groups.get(group)!.push({
              date,
              hrAvg: f.hr != null ? Math.round(f.hr) : null,
              durationMin: Number.isFinite(Number(hrs?.durationMinutes)) ? Math.round(Number(hrs.durationMinutes)) : null,
              efficiency: f.efficiency,
              // ⛔ The switch above. Null here means "this session was not steady enough to fade-read",
              // which is a different fact from "we did not measure it" — `fadeWithheld` says which.
              // 2026-09-03: ONE drift read with the Performance screen (session-detail): the pace-to-heart-rate
              // decoupling when the analyser computed it, else `hr_drift_v1` (heart rate second half vs first,
              // by time, after the warm-up — `_shared/hr-drift-halves.ts`). Never withheld; an interval day is
              // labelled whole-session on the card instead of hidden. `f.drift` is the last resort.
              ...driftReadForPoint(hrs, r?.workout_analysis, f.drift, steady),
              keySessionWithin24h: keyDates.has(addDaysIso(date, 1)),
              // conditions, shown never corrected: the day's temperature and the climb
              tempF: (() => { const t = Number(r?.weather_data?.temperature); return Number.isFinite(t) ? Math.round(t) : null; })(),
              elevationGainM: f.elevM ?? null,
            });
            if (sport === "run" && group !== "easy") {
              const we = warmByDate.get(date);
              const ef = we ? computeEfficiencyIndex(Number(we.pace_s_per_km), Number(we.hr_avg)) : null;
              if (we && ef != null) {
                groups.set("easy", groups.get("easy") ?? []);
                groups.get("easy")!.push({
                  date,
                  hrAvg: Math.round(Number(we.hr_avg)),
                  durationMin: Math.max(1, Math.round(Number(we.seconds) / 60)),
                  efficiency: ef,
                  driftPct: null, driftBasis: null, driftWholeSession: false, fadeWithheld: false,
                  keySessionWithin24h: keyDates.has(addDaysIso(date, 1)),
                  tempF: (() => { const t = Number(r?.weather_data?.temperature); return Number.isFinite(t) ? Math.round(t) : null; })(),
                  elevationGainM: null,
                  fromWarmup: true,
                });
              }
            }
          }
          for (const [sport, groups] of bySport) {
            for (const [group, points] of groups) {
              points.sort((a, b) => a.date.localeCompare(b.date));
              if (points.length === 0) continue;
              enduranceSpine.push({ sport, group, points });
            }
          }
        } catch (e: any) {
          console.log("[compute-snapshot] endurance spine failed (non-fatal):", e?.message || e);
        }

        let namedSessions: NamedSessionSeries[] = [];
        try {
          // Only worth asking when the block gave us a week map — without it there is no axis.
          if (weekByDate && Object.keys(weekByDate).length > 0) {
            /**
             * ⛔ ONE FAMILY PER SPORT, NAMED HERE AND NOWHERE ELSE. The run's repeated quality
             * session and the ride's. Gated on the FAMILY TAG rather than the session's name: the
             * name is copy and can be rewritten, the tag is the composer's own identifier for which
             * cell of the book authored the session.
             */
            const FAMILIES: Array<{ sport: string; family: string; types: string[]; fallbackLabel: string }> = [
              { sport: 'run', family: 'family:run_near_threshold', types: ['run', 'running'], fallbackLabel: 'Near-threshold run' },
              { sport: 'ride', family: 'family:ride_sweet_spot', types: ['ride', 'bike', 'cycling'], fallbackLabel: 'Hard ride' },
            ];

            /**
             * ⛔ THE FACTS ARE READ AS STORED, NEVER RE-DERIVED. `run_facts.efficiency_index` is
             * metres per second per beat; `ride_facts.efficiency_factor` is normalised power over
             * average heart rate — TrainingPeaks' EF exactly, already published by the analyser. A
             * second derivation here would fork the definition from the one every other surface uses.
             */

            /**
             * ⛔ WHICH DAYS CARRY A KEY SESSION — p107's tighter 5% line applies when one falls
             * within 24 hours. Read off the PLAN, never guessed from the weekday: the frame's
             * rotation decides which days are hard, and it moves with the athlete's pins.
             */
            for (const fam of FAMILIES) {
              const { data: linkRows } = await supabase
                .from("workouts").select("date,planned_id,workout_analysis")
                .eq("user_id", userId).in("type", fam.types).eq("workout_status", "completed")
                .gte("date", isoMinus(STATE_TREND_WINDOWS.cadenceDays)).lte("date", asOf);
              const linked = (Array.isArray(linkRows) ? linkRows : [])
                .filter((r: any) => typeof r?.planned_id === "string" && r.planned_id.length > 0);
              const plannedIds = Array.from(new Set(linked.map((r: any) => String(r.planned_id))));
              if (plannedIds.length === 0) continue;
              const { data: plannedRows2 } = await supabase
                .from("planned_workouts").select("id,name,tags,duration").in("id", plannedIds);
              const byId = new Map<string, { label: string; durationMin: number | null }>();
              for (const p2 of (Array.isArray(plannedRows2) ? plannedRows2 : []) as any[]) {
                const tags = (Array.isArray(p2?.tags) ? p2.tags : []).map((t: any) => String(t).toLowerCase());
                if (!tags.includes(fam.family)) continue;
                const dur = Number(p2?.duration);
                byId.set(String(p2.id), {
                  label: String(p2?.name || fam.fallbackLabel),
                  durationMin: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
                });
              }
              const points: NamedSessionPoint[] = [];
              let label = fam.fallbackLabel;
              for (const r of linked) {
                const hit = byId.get(String(r.planned_id));
                if (!hit) continue;
                const date = String(r.date).slice(0, 10);
                const week = weekByDate[date];
                // ⚠️ Outside the block → no week → not emitted. Same rule as the lift line: a session
                // from a previous block is not week 1 of this one.
                if (!Number.isFinite(week)) continue;
                const f = endFactByDate.get(date);
                const hr = f?.hr ?? null;
                // ⚠️ A POINT NEEDS SOMETHING TO PLOT. No heart rate and no efficiency is a session we
                // measured nothing on; inventing a zero would draw a crash.
                if (hr == null && f?.efficiency == null) continue;
                label = hit.label;
                points.push({
                  week,
                  date,
                  hrAvg: hr != null ? Math.round(hr) : 0,
                  durationMin: hit.durationMin,
                  efficiency: f?.efficiency ?? null,
                  // 2026-09-03: the same drift read as every other State point and the Performance screen.
                  ...driftReadForPoint((r as any)?.workout_analysis?.heart_rate_summary ?? null, (r as any)?.workout_analysis, f?.drift ?? null, (r as any)?.workout_analysis?.heart_rate_summary?.decouplingMixedEffort !== true),
                  keySessionWithin24h: keyDates.has(addDaysIso(date, 1)),
                });
              }
              points.sort((a, b) => a.week - b.week || a.date.localeCompare(b.date));
              if (points.length === 0) continue;

              /**
               * ⛔ THE REFERENCE NUMBER, AND ONLY WHERE THE APP KEPT ONE. `fitness_baselines`
               * supersedes rather than overwrites, so bike FTP accumulates a dated trail by
               * construction — six readings over six weeks on this athlete, 176 → 153 → 168.
               * ⚠️ THE RUN HAS NO EQUIVALENT AND GETS NO ROW. Its threshold pace is a single value in
               * `user_baselines.learned_fitness`, overwritten on every re-learn; the previous number
               * is gone. The card says so rather than drawing a line from one point. Storing it as a
               * superseding baseline is the right fix and is deliberately NOT smuggled in here — it
               * changes what `learn-fitness-profile` writes, which reaches every surface reading a pace.
               */
              let reference: ReferenceSeries | null = null;
              if (fam.sport === 'ride') {
                try {
                  const { data: base } = await supabase
                    .from("fitness_baselines").select("value,source_date,created_at,status")
                    .eq("user_id", userId).eq("discipline", "bike").eq("metric", "ftp")
                    .order("source_date", { ascending: true });
                  const pts = (Array.isArray(base) ? base : [])
                    .map((b: any) => ({
                      date: String(b?.source_date || b?.created_at || "").slice(0, 10),
                      value: Number(b?.value),
                      status: String(b?.status || "provisional"),
                    }))
                    .filter((b) => b.date.length === 10 && Number.isFinite(b.value) && b.value > 0);
                  // ⚠️ TWO POINTS IS NOT A LINE. One reading is the current number, which the card
                  // already has elsewhere; the row earns its place only once it can show movement.
                  if (pts.length >= 2) reference = { metric: 'ftp', unit: 'W', points: pts };
                } catch (e: any) {
                  console.log("[compute-snapshot] ftp baseline series failed (non-fatal):", e?.message || e);
                }
              }
              namedSessions.push({ family: fam.family.replace('family:', ''), sport: fam.sport, label, points, reference });
            }
          }
        } catch (e: any) {
          // Non-fatal: no series → the cards do not render → exactly today's screen.
          console.log("[compute-snapshot] named session join failed (non-fatal):", e?.message || e);
        }

        // ⛔ WHICH DAYS MEASURED SOMETHING. Written by compute-facts onto `strength_facts.measured`
        // when an all-out set was actually performed. This is the distinction Q-227 called the
        // blocker under everything else: without it the series cannot tell a test from a Tuesday.
        try {
          measuredDates = (strengthVolR.data ?? [])
            .filter((f: any) => f?.strength_facts?.measured === true)
            .map((f: any) => String(f.date));
        } catch { measuredDates = []; }

        // ── Slice 2: EVERY all-out set per lift — the previous program progress gauge (the previous program) ──────────
        //
        // ⛔ SAME QUERY SHAPE THE COACH ALREADY RUNS (`coach/index.ts:~2415`), and the SAME builder,
        // so State's spine and the Performance screen cannot disagree about whether a set was a rep
        // record. `strength_facts.amrap_reps` (D-338) records the REPS but not the all-out set's own
        // WEIGHT — `best_weight` is the heaviest set of the session, which is a different set the
        // moment a heavy single follows the AMRAP (`all-out-set.ts` documents that trap). The rep
        // record is "reps AT a weight", so the weight has to be exact, and only the logged set is.
        let allOutByLift: Record<string, Array<{ date: string; weight: number; reps: number; estimated_1rm: number }>> | null = null;
        let pullupProgress: PullupProgress | null = null;
        /**
         * ⛔ THE SAME RAW SESSIONS, HANDED ON FOR VIADA'S TWO LIFTING DOSES (2026-08-29).
         *
         * ⚠️ `exercise_log` CANNOT ANSWER THEM — it stores `best_weight` / `best_reps` per exercise
         * per session, and his counts need every set (4-6 reps above 90%, 15-20 velocity reps at
         * 70-85%, sets per muscle). Same reason `pullupProgress` is computed from these rows.
         * ⚠️ NO NEW QUERY: this is the rep-record window's fetch, already running.
         */
        let loggedSessions: Array<{ date: string; label?: string | null; exercises: Array<Record<string, unknown>> }> | null = null;
        try {
          const { data: strengthRows } = await supabase
            .from("workouts")
            // ⚠️ `name` joined the select for the per-session line's label — a date is a poor label
            //    for "ME: Upper cost you 11 work sets".
            .select("date,name,planned_id,strength_exercises")
            .eq("user_id", userId)
            .in("type", ["strength", "weight_training", "weights", "mobility"])
            .lte("date", asOf)
            .order("date", { ascending: false })
            .limit(REP_RECORD_WINDOW_SESSIONS);
          const rows = Array.isArray(strengthRows) ? strengthRows : [];
          if (rows.length > 0) {
            // The planned rows behind those sessions — `set_plan[].amrap` is the fallback when the
            // logged set carries no flag (a session logged from a stale bundle or edited by hand).
            const plannedIds = Array.from(new Set(
              rows.map((r: any) => r?.planned_id).filter((v: unknown): v is string => typeof v === "string" && v.length > 0),
            ));
            const plannedById = new Map<string, any[]>();
            if (plannedIds.length > 0) {
              const { data: plannedRows } = await supabase
                .from("planned_workouts").select("id,strength_exercises").in("id", plannedIds);
              for (const p of (Array.isArray(plannedRows) ? plannedRows : [])) {
                const ex = (p as any)?.strength_exercises;
                if (Array.isArray(ex)) plannedById.set(String((p as any).id), ex);
              }
            }
            // ⚠️ OLDEST FIRST — the rep-record history is built as it walks; reversed input judges
            // every set against the future.
            const sessions = rows
              .slice()
              .sort((a: any, b: any) => String(a?.date || "").localeCompare(String(b?.date || "")))
              .map((r: any) => {
                const raw = r?.strength_exercises;
                const exercises = Array.isArray(raw)
                  ? raw
                  : (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : []);
                const pid = typeof r?.planned_id === "string" ? r.planned_id : null;
                return {
                  date: String(r?.date || "").slice(0, 10),
                  name: typeof r?.name === "string" ? r.name : null,
                  exercises,
                  plannedExercises: pid ? (plannedById.get(pid) ?? null) : null,
                };
              })
              .filter((s: any) => s.date.length === 10);
            const built = allOutSeriesByLift(sessions);
            allOutByLift = Object.keys(built).length ? built : null;
            // ⛔ CARRIED, NOT RE-FETCHED — `assembleStateTrends` windows them to the last seven days
            // and prices them against `refMaxByCanonical`, which only it holds.
            loggedSessions = sessions.map((sess: any) => ({
              date: sess.date,
              label: sess.name ?? null,
              exercises: Array.isArray(sess.exercises) ? sess.exercises : [],
            }));

            // ── THE PULL-UP PROGRESSION'S COUNTS ────────────────────────────────────────────────
            //
            // ⛔ COMPUTED FROM THE RAW LOGGED SETS, AND IT HAS TO BE. `exercise_log` — what the
            // strength row otherwise reads — stores `best_reps` / `best_weight` / `total_volume` and
            // NO `resistance_level`. The aggregate has already discarded whether a band was on the
            // bar, so a pull-up count taken from it cannot tell a clean rep from an assisted one.
            // These `sessions` are the raw `workouts.strength_exercises` rows, fetched just above
            // for the rep-record window, and they still carry the field. No new query, no new column.
            //
            // ⚠️ THE WINDOW IS THE REP-RECORD WINDOW (`REP_RECORD_WINDOW_SESSIONS`), reused rather
            // than invented — one window for "recent lifting", not two that drift apart.
            if (pullupFocusOn) {
              let cleanReps = 0;
              let assistedReps = 0;
              let cleanMax = 0;
              let sessionsWithChins = 0;
              for (const sess of sessions) {
                const c = countPullupWork((sess as any).exercises);
                if (c.clean === 0 && c.assisted === 0) continue;
                sessionsWithChins += 1;
                cleanReps += c.clean;
                assistedReps += c.assisted;
                if (c.bestCleanSet > cleanMax) cleanMax = c.bestCleanSet;
              }
              pullupProgress = {
                // ⚠️ null, NOT 0, when nothing clean was logged. 0 would read as a measured zero —
                // "we tested you and you cannot do one" — when the truth is that no clean set exists
                // in the window. An unmeasured thing is absent, never a number.
                cleanMaxReps: cleanMax > 0 ? cleanMax : null,
                cleanReps,
                assistedReps,
                standardReps: SESSION_STANDARD_REPS,
                standardMinutes: SESSION_STANDARD_MINUTES,
                sessions: sessionsWithChins,
              };
              console.log(`[compute-snapshot] pull-up progression: clean max ${cleanMax || 'none'}, ` +
                `${cleanReps} clean / ${assistedReps} assisted over ${sessionsWithChins} session(s)`);
            }
            console.log(`[compute-snapshot] slice2 all-out sets: ${Object.keys(built).length} lift(s), effortRead=${strengthEffortRead ?? "null"}`);
          }
        } catch (e: any) {
          // Non-fatal: no all-out series → waved main lifts read needs_data rather than a false
          // decline, and every other lift is unchanged.
          console.log("[compute-snapshot] slice2 all-out read failed (non-fatal):", e?.message || e);
        }

        // State v3: baseline 1RMs so the strength dot reads current e1RM ÷ baseline (not a 12wk range
        // that pegs right in a build). Typed first, learned fills gaps. Non-fatal → hedged fallback.
        let strengthBaselines: Record<string, number> | null = null;
        let ub: any = null;
        try {
          // `effort_paces` added 2026-08-19: it is the wizard/VDOT tier of the pace resolvers, and without
          // it the resolver answers with one of its three inputs missing. Same row, no extra query.
          const r = await supabase.from("user_baselines").select("performance_numbers, learned_fitness, effort_paces, locked_baselines").eq("user_id", userId).maybeSingle();
          ub = r.data;
          // A LOCKED value is the athlete's asserted number and outranks the typed seed here too (2026-09-02).
          strengthBaselines = buildStrengthBaselines(ub?.performance_numbers, ub?.learned_fitness?.strength_1rms, ub?.locked_baselines);
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

        const result = assembleStateTrends({ asOf, exerciseRows, bikeRows, bikeLoad, runJoined, runEffHistory, swimRows, strengthVolumeRows, plannedBy, doneBy, cadenceCounts, posture, declaredSessionsPerWeek: declaredSpw, strengthBaselines, fitnessBaselines, allTimeBestByLift, phaseByDate, weekByDate, testWeekDates, expectedByCanonical, namedSessions, enduranceSpine, blockDurationWeeks, measuredDates, allOutByLift, strengthEffortRead, pullupProgress, loggedSessions, weekStartDow });
        // VDOT race projections (goal-free) — computed HERE, not in the shared assembler, because they need
        // learned_fitness + the VDOT engine and we keep that OFF the client-math fallback path (dumb client).
        // Threshold pace: learned first, then performance_numbers. Long-run distance is estimated inside
        // projectStandardRaces from the longest recent run's DURATION. Attached to runFitness (by reference,
        // so toStateTrendsV1's display.runFitness carries it). Non-fatal — never breaks the snapshot.
        try {
          /**
           * ⛔ THE SPINE HAD ITS OWN THRESHOLD-PACE CHAIN, AND IT CHECKED NOTHING (fixed 2026-08-19).
           *
           * It read `learned_fitness.run_threshold_pace_sec_per_km` straight — **with no confidence
           * gate at all** — then fell back to `performance_numbers.threshold_pace`, a spelling
           * **nothing in this codebase writes** (verified by grep: the only hits are a local variable
           * in the learner and the unrelated `swim_threshold_pace`). So the fallback was dead and the
           * primary was unguarded. `resolveCurrentRunThresholdPace` refuses a low-confidence read;
           * this took it.
           *
           * ⚠️ WHAT SAVED IT WAS A DIFFERENT GUARD, WHICH IS NOT THE SAME AS BEING SAFE. The 8-run
           * floor on `projRobust` below withheld the projection when a contaminated 2-run threshold
           * was on file. Right outcome, wrong reason — a bad read from 8+ runs would have printed a
           * race time to the second on the State screen.
           *
           * ⚠️ WHAT CHANGES, HONESTLY: very little today, because that 8-run floor dominates. What
           * the spine GAINS is the athlete's explicit choice (Q-174), the three real typed spellings,
           * and a confidence bar it never had. What it must NOT gain is the right to project a race
           * time off an inference — so only `learned` counts as `observed` below, exactly as
           * `race-projections.ts` and `infer-training-fitness.ts` already gate it.
           */
          const thrResolved = resolveCurrentRunThresholdPace({
            learned_fitness: ub?.learned_fitness ?? null,
            performance_numbers: ub?.performance_numbers ?? null,
            effort_paces: ub?.effort_paces ?? null,
          } as never);
          let projTp: number | null = null;
          let projSrc: 'observed' | 'plan_targets' = 'plan_targets';
          // ⚠️ THE BASIS TRAVELS WITH THE NUMBER (D-346, 2026-07-31). These render as "5K 29:54" — to
          // the second — off a threshold pace that can rest on three runs. The times are internally
          // consistent (5K projects faster than threshold, as it should) but the PRECISION overstates
          // the input, and it was the last thing on the run row with no receipt beside it.
          let projSamples: number | null = null;
          if (thrResolved.sec_per_mi != null) {
            projTp = thrResolved.sec_per_mi;   // resolver is sec/MILE already — the *1.60934 is gone with the raw read
            // MEASURED only earns `observed`. A typed value, the wizard's 5K-derived pace and the
            // easy-pace derivation are all real answers for PRESCRIBING, and none of them is a
            // measurement to predict a race finish from.
            if (thrResolved.source === 'learned') {
              projSrc = 'observed';
              projSamples = thrResolved.sample_count ?? null;
            }
          }
          const longestDur = runJoined.reduce((m, r) => Math.max(m, Number(r.duration_minutes) || 0), 0);
          const proj = projectStandardRaces({
            thresholdPaceSecPerMi: projTp,
            longestRunDurationMin: longestDur > 0 ? longestDur : null,
            learnedFitness: ub?.learned_fitness ?? null,
            dataSource: projSrc,
            easyRunDecouplingPct: null,
          });
          // ⛔ NOT SHOWN UNLESS IT IS ROBUST (Michael, 2026-07-31: *"it should be built on more, its not
          // a necessary featre unless it robust"*).
          //
          // These print a finish time to the SECOND. His threshold pace was learned from THREE runs and
          // stamped `confidence: high` — a race prediction to the second off three samples is exactly
          // the false precision this row has spent the day removing everywhere else.
          //
          // ⚠️ THE FLOOR IS THE APP'S OWN, NOT A NEW NUMBER. `runDirectionMinRuns` (8) is already what
          // State requires before it will assert a run direction, and `MIN_REGRESSION_N` (8) is what the
          // heat fit requires before it will claim a coefficient. Picking a different bar here would be
          // hand-picking; 8 is the bar this app already set for "enough to say something out loud".
          //
          // ⚠️ AND A TYPED TARGET NEVER QUALIFIES. `plan_targets` is a goal the athlete entered, not a
          // measurement — projecting race times off an aspiration and printing them to the second is a
          // fabricated number wearing a measured one's clothes.
          const projRobust = projSrc === 'observed'
            && Number.isFinite(Number(projSamples)) && Number(projSamples) >= STATE_TREND_WINDOWS.runDirectionMinRuns;
          if (proj && result?.runFitness && projRobust) {
            (result.runFitness as any).projections = proj.projections;
            // The receipt: what the estimate rests on. `observed` = a measured threshold pace from N
            // runs; `plan_targets` = the athlete's typed number, which is a goal, not a measurement.
            (result.runFitness as any).projectionBasis = { source: projSrc, samples: projSamples };
          }
        } catch (e: any) { console.log("⚠️ race projections (non-fatal):", e?.message || e); }
        stateTrendsV1 = toStateTrendsV1(result, asOf);
        // This week's points per sport vs the athlete's typical week — onto the display contract, the
        // only object that reaches the State screen (the coach carries state_trends_v1.display verbatim).
        if (stateTrendsV1?.display) {
          const lbd: Record<string, { week: number | null; typical: number | null; weeks: number[] }> = {};
          const allKeys = new Set([...Object.keys(current.workloadByDisc ?? {}), ...Object.keys(workloadByDiscTypical)]);
          for (const a of priorAggs) for (const k of Object.keys(a.workloadByDisc ?? {})) allKeys.add(k);
          for (const k of allKeys) {
            const wk = Number(current.workloadByDisc?.[k]);
            // the last five weeks, oldest → this week, for the bars (priorAggs[i] = i+1 weeks back)
            const weeks = [...priorAggs].reverse().map((a) => Math.round(Number(a.workloadByDisc?.[k] ?? 0)) || 0);
            weeks.push(Number.isFinite(wk) && wk > 0 ? Math.round(wk) : 0);
            lbd[k] = { week: Number.isFinite(wk) && wk > 0 ? Math.round(wk) : null, typical: workloadByDiscTypical[k] ?? null, weeks };
          }
          stateTrendsV1.display.loadByDiscipline = lbd;
        }
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
      // ⛔ NO `workload_by_discipline_typical` COLUMN. It was written here on 2026-09-02 and the column
      // does not exist on `athlete_snapshot`, so every snapshot upsert returned 500 until the write was
      // pulled the same evening. The typical-per-sport map rides INSIDE `state_trends_v1.display.loadByDiscipline`
      // (typed on StateDisplayV1), which is what the State card reads. Add the column by hand first if it
      // is ever wanted as its own field.
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
