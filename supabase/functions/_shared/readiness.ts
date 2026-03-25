/**
 * buildReadiness — core readiness_v1 computation (read-only).
 * Call from readiness edge function or import from session_detail / coach.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  deriveDemands,
  isKeySession,
  ledgerTargetsForDemand,
  planEmitsPrimaryDemands,
  type PlannedWorkoutLite,
} from "./demand-mapping.ts";
import { adjustedThreshold, PHASE_MULTIPLIERS, thresholdForTarget } from "./readiness-thresholds.ts";
import type {
  BlockAlignmentV1,
  DemandReadinessEntry,
  DemandStatusLevel,
  EnergyResidualEntry,
  MuscularResidualEntry,
  NarrativeCapsV1,
  NextSessionReadinessV1,
  PlanContextV1,
  ProtectedSessionRiskV1,
  ReadinessSnapshotV1,
  WeekLoadStatusV1,
} from "./readiness-types.ts";

const MS_H = 60 * 60 * 1000;

export type SessionLoadRow = {
  workout_id: string;
  completed_at: string;
  load_domain: string;
  load_target: string;
  magnitude: number;
  intensity_context: string | null;
  decay_hours: number;
  source: string | null;
};

export function residualStress(row: SessionLoadRow, asOf: Date): number {
  const hoursElapsed = (asOf.getTime() - new Date(row.completed_at).getTime()) / MS_H;
  const dh = Math.max(1, row.decay_hours || 48);
  return row.magnitude * Math.exp((-3.0 * hoursElapsed) / dh);
}

function mondayUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function addDaysUTC(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function dateStrUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weeksUntil(race: Date, asOf: Date): number | null {
  if (Number.isNaN(race.getTime())) return null;
  const ms = race.getTime() - asOf.getTime();
  if (ms < 0) return null;
  return Math.floor(ms / (7 * 24 * 3600 * 1000));
}

function deriveWeekIntentFromPhase(blockPhase: string): "recovery" | "load" | "test" {
  const p = blockPhase.toLowerCase();
  if (p.includes("recovery") || p.includes("deload")) return "recovery";
  if (p.includes("taper")) return "recovery";
  if (p.includes("test") || p.includes("time_trial") || p.includes("time trial")) return "test";
  return "load";
}

function resolvePhaseMultiplier(ctx: PlanContextV1): number {
  const p = ctx.block_phase.toLowerCase();
  if (ctx.week_intent === "recovery") return PHASE_MULTIPLIERS.recovery;
  if (p.includes("taper")) return PHASE_MULTIPLIERS.taper;
  if (p.includes("race")) return PHASE_MULTIPLIERS.race_week;
  if (p.includes("peak")) return PHASE_MULTIPLIERS.peak;
  if (p.includes("base")) return PHASE_MULTIPLIERS.base;
  return PHASE_MULTIPLIERS.build;
}

function demandStatus(residual: number, threshold: number): DemandStatusLevel {
  const ratio = residual / Math.max(threshold, 1);
  if (ratio < 0.4) return "fresh";
  if (ratio < 0.85) return "manageable";
  return "compromised";
}

function deriveRecommendation(statuses: DemandStatusLevel[]): string {
  const dominated = statuses.filter((s) => s === "compromised");
  if (dominated.length === 0) return "proceed_as_planned";
  if (dominated.length <= 2) return "reduce_intensity";
  if (dominated.length <= 4) return "swap_session";
  return "rest";
}

function residualForTargets(
  targets: string[],
  muscularMap: Map<string, number>,
  energyMaps: { aerobic: number; glycolytic: number; neuromuscular: number },
): number {
  let s = 0;
  for (const t of targets) {
    if (["aerobic", "glycolytic", "neuromuscular"].includes(t)) {
      if (t === "aerobic") s += energyMaps.aerobic;
      else if (t === "glycolytic") s += energyMaps.glycolytic;
      else s += energyMaps.neuromuscular;
    } else {
      s += muscularMap.get(t) ?? 0;
    }
  }
  return s;
}

function sumAerobicMagnitude(rows: SessionLoadRow[], start: Date, end: Date): number {
  const targets = new Set(["aerobic_base", "vo2max", "lactate_threshold"]);
  let s = 0;
  for (const r of rows) {
    const t = new Date(r.completed_at);
    if (t >= start && t < end && targets.has(r.load_target)) {
      s += Number(r.magnitude) || 0;
    }
  }
  return s;
}

function totalSystemicResidual(allRows: SessionLoadRow[], asOf: Date): number {
  return allRows.reduce((acc, r) => acc + residualStress(r, asOf), 0);
}

type ActivePlan =
  | { source: "plans"; row: Record<string, unknown> }
  | { source: "training_plans"; row: Record<string, unknown> };

async function fetchActivePlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivePlan | null> {
  const { data: p1 } = await supabase
    .from("plans")
    .select("id, plan_type, duration_weeks, current_week, config, name, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (p1) return { source: "plans", row: p1 as Record<string, unknown> };

  const { data: p2 } = await supabase
    .from("training_plans")
    .select("id, plan_type, name, plan_data, start_date, end_date, is_active, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (p2) return { source: "training_plans", row: p2 as Record<string, unknown> };
  return null;
}

function buildPlanContext(ap: ActivePlan, asOf: Date): PlanContextV1 {
  if (ap.source === "plans") {
    const p = ap.row;
    const config = (p.config as Record<string, unknown>) ?? {};
    const cw = Number(p.current_week) || 1;
    let block_phase = "build";
    const phases = config.phases as Record<string, { weeks?: number[] }> | undefined;
    if (phases && typeof phases === "object") {
      for (const [k, v] of Object.entries(phases)) {
        if (v?.weeks && Array.isArray(v.weeks) && v.weeks.includes(cw)) {
          block_phase = k;
          break;
        }
      }
    }
    const week_intent = deriveWeekIntentFromPhase(block_phase);
    const raceRaw = config.race_date ?? config.raceDate;
    let weeks_to_a_race: number | null = null;
    if (raceRaw && typeof raceRaw === "string") {
      weeks_to_a_race = weeksUntil(new Date(raceRaw), asOf);
    }
    return {
      plan_type: String(p.plan_type ?? "custom"),
      block_phase,
      week_intent,
      weeks_to_a_race,
      plan_source: "plans",
    };
  }

  const p = ap.row;
  const pd = (p.plan_data as Record<string, unknown>) ?? {};
  const block_phase = String(pd.current_phase ?? pd.phase ?? "build");
  const week_intent = deriveWeekIntentFromPhase(block_phase);
  let weeks_to_a_race: number | null = null;
  const rd = pd.race_date ?? pd.raceDate;
  if (rd && typeof rd === "string") weeks_to_a_race = weeksUntil(new Date(rd), asOf);

  return {
    plan_type: String(p.plan_type ?? "custom"),
    block_phase,
    week_intent,
    weeks_to_a_race,
    plan_source: "training_plans",
  };
}

function targetDisplayName(t: string): string {
  return t.replace(/_/g, " ");
}

export async function buildReadiness(
  supabase: SupabaseClient,
  userId: string,
  asOf: Date,
): Promise<ReadinessSnapshotV1> {
  const computed_at = asOf.toISOString();
  const asOfIso = computed_at;
  const h96 = new Date(asOf.getTime() - 96 * MS_H);
  const d14 = new Date(asOf.getTime() - 14 * 24 * MS_H);

  const { data: sl96raw, error: e96 } = await supabase
    .from("session_load")
    .select("workout_id, completed_at, load_domain, load_target, magnitude, intensity_context, decay_hours, source")
    .eq("user_id", userId)
    .gt("completed_at", h96.toISOString())
    .order("completed_at", { ascending: false });

  if (e96) console.error("[readiness] session_load 96h:", e96.message);

  const { data: sl14raw, error: e14 } = await supabase
    .from("session_load")
    .select("workout_id, completed_at, load_domain, load_target, magnitude, intensity_context, decay_hours, source")
    .eq("user_id", userId)
    .gt("completed_at", d14.toISOString());

  if (e14) console.error("[readiness] session_load 14d:", e14.message);

  const rows96 = (sl96raw ?? []) as SessionLoadRow[];
  const rows14 = (sl14raw ?? []) as SessionLoadRow[];

  const degraded_missing: string[] = [];
  let degraded_reason: string | undefined;

  if (rows96.length === 0) {
    degraded_missing.push("session_load_96h");
    degraded_reason = "no_load_data";
  }

  const muscular: Record<string, MuscularResidualEntry> = {};
  const muscularIntensityLast = new Map<string, string | null>();

  const byMuscTarget = new Map<string, number>();
  let aerobicR = 0,
    glycolyticR = 0,
    neuroR = 0;
  let aLast: string | null = null,
    gLast: string | null = null,
    nLast: string | null = null;

  for (const r of rows96) {
    const res = residualStress(r, asOf);
    const dom = (r.load_domain ?? "").toLowerCase();
    const tgt = r.load_target ?? "";
    if (dom === "muscular") {
      byMuscTarget.set(tgt, (byMuscTarget.get(tgt) ?? 0) + res);
      const prev = muscular[tgt]?.last_loaded_at;
      const cur = r.completed_at;
      if (!prev || cur > prev) muscularIntensityLast.set(tgt, r.intensity_context);
    } else if (dom === "aerobic") {
      aerobicR += res;
      if (!aLast || r.completed_at > aLast) aLast = r.completed_at;
    } else if (dom === "glycolytic") {
      glycolyticR += res;
      if (!gLast || r.completed_at > gLast) gLast = r.completed_at;
    } else if (dom === "neuromuscular") {
      neuroR += res;
      if (!nLast || r.completed_at > nLast) nLast = r.completed_at;
    }
  }

  for (const [tgt, residual_stress] of byMuscTarget) {
    const rowsForTarget = rows96.filter((x) => x.load_domain === "muscular" && x.load_target === tgt);
    let last_loaded_at: string | null = null;
    for (const x of rowsForTarget) {
      if (!last_loaded_at || x.completed_at > last_loaded_at) last_loaded_at = x.completed_at;
    }
    const hours_since = last_loaded_at != null
      ? (asOf.getTime() - new Date(last_loaded_at).getTime()) / MS_H
      : null;
    muscular[tgt] = {
      residual_stress: Math.round(residual_stress * 10) / 10,
      last_loaded_at,
      intensity_context: muscularIntensityLast.get(tgt) ?? null,
      hours_since: hours_since != null ? Math.round(hours_since * 10) / 10 : null,
    };
  }

  const d7 = new Date(asOf.getTime() - 7 * 24 * MS_H);
  const aRecent = sumAerobicMagnitude(rows14, d7, asOf);
  const aPrev = sumAerobicMagnitude(rows14, new Date(d7.getTime() - 7 * 24 * MS_H), d7);
  let trend_7d_pct: number | null = null;
  if (aPrev > 0) trend_7d_pct = Math.round(((aRecent - aPrev) / aPrev) * 1000) / 10;
  else if (aRecent > 0) trend_7d_pct = 100;

  const energy_systems = {
    aerobic: {
      residual_stress: Math.round(aerobicR * 10) / 10,
      last_loaded_at: aLast,
      trend_7d: trend_7d_pct,
    } as EnergyResidualEntry,
    glycolytic: {
      residual_stress: Math.round(glycolyticR * 10) / 10,
      last_loaded_at: gLast,
      trend_7d: null,
    } as EnergyResidualEntry,
    neuromuscular: {
      residual_stress: Math.round(neuroR * 10) / 10,
      last_loaded_at: nLast,
      trend_7d: null,
    } as EnergyResidualEntry,
  };

  const energyMaps = {
    aerobic: aerobicR,
    glycolytic: glycolyticR,
    neuromuscular: neuroR,
  };

  const activePlan = await fetchActivePlan(supabase, userId);
  let plan_context: PlanContextV1 | null = null;
  let next_session_readiness: NextSessionReadinessV1 | null = null;
  let protected_session_risks: ProtectedSessionRiskV1[] = [];
  let week_load_status: WeekLoadStatusV1 | null = null;
  let block_alignment: BlockAlignmentV1 | null = null;
  let narrative_caps: NarrativeCapsV1 | null = null;

  let demands_inferred = false;

  if (!activePlan) {
    degraded_missing.push("active_plan");
    if (!degraded_reason) degraded_reason = "no_plan_context";
  } else {
    plan_context = buildPlanContext(activePlan, asOf);
    const planId = String(activePlan.row.id);

    const mon = mondayUTC(asOf);
    const weekStart = dateStrUTC(mon);
    const weekEnd = addDaysUTC(weekStart, 6);
    const todayStr = dateStrUTC(asOf);

    const { data: pwsRaw } = await supabase
      .from("planned_workouts")
      .select("id, name, type, date, metadata, computed, duration, completed_workout_id, workout_status, training_plan_id")
      .eq("user_id", userId)
      .eq("training_plan_id", planId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date", { ascending: true });

    const plannedWeek = (pwsRaw ?? []) as PlannedWorkoutLite & {
      date: string;
      duration?: number | null;
      completed_workout_id?: string | null;
      workout_status?: string | null;
      training_plan_id?: string;
    }[];

    const { data: woRaw } = await supabase
      .from("workouts")
      .select("id, type, duration, date, moving_time")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd);

    const workoutsWeek = woRaw ?? [];

    for (const pw of plannedWeek) {
      if (!planEmitsPrimaryDemands(pw)) {
        demands_inferred = true;
        break;
      }
    }
    if (demands_inferred) {
      degraded_missing.push("primary_demands", "protected_sessions", "intent");
      if (!degraded_reason) degraded_reason = "demands_inferred";
    }

    const phaseMult = plan_context ? resolvePhaseMultiplier(plan_context) : 1;

    const pending = plannedWeek.filter((pw) => {
      if (pw.completed_workout_id) return false;
      const st = (pw.workout_status ?? "planned").toLowerCase();
      if (st === "completed" || st === "skipped") return false;
      return pw.date >= todayStr;
    });
    const nextPw = pending[0] ?? null;

    if (nextPw) {
      const demands = deriveDemands(nextPw);
      const demands_met: Record<string, DemandReadinessEntry> = {};
      const statuses: DemandStatusLevel[] = [];

      for (const d of demands) {
        const ledgers = ledgerTargetsForDemand(d);
        const residual = residualForTargets(ledgers, byMuscTarget, energyMaps);
        const th = adjustedThreshold(
          ["aerobic", "glycolytic", "neuromuscular"].includes(d) ? d : d,
          phaseMult,
        );
        const st = demandStatus(residual, th);
        statuses.push(st);
        demands_met[d] = {
          target: d,
          residual_stress: Math.round(residual * 10) / 10,
          threshold: Math.round(th * 10) / 10,
          status: st,
        };
      }

      const rank: Record<DemandStatusLevel, number> = { fresh: 0, manageable: 1, compromised: 2 };
      let limiting_factor: string | null = null;
      let best = -1;
      for (const d of demands) {
        const e = demands_met[d]!;
        const r = rank[e.status];
        if (r > best) {
          best = r;
          limiting_factor = d;
        }
      }
      if (best < rank.manageable) limiting_factor = null;

      const rec = deriveRecommendation(statuses) as NextSessionReadinessV1["recommendation"];
      const ready = !statuses.some((s) => s === "compromised");

      next_session_readiness = {
        planned_workout_id: nextPw.id,
        session_name: nextPw.name,
        ready,
        demands_met,
        limiting_factor,
        recommendation: rec,
      };
    }

    const keySessions = plannedWeek.filter((pw) => isKeySession(pw) && pw.date >= todayStr);
    for (const ks of keySessions) {
      const sessionEnd = new Date(`${ks.date}T23:59:59.000Z`);
      const demands = deriveDemands(ks);
      let worstRatio = 0;
      let threat: ProtectedSessionRiskV1["threat_source"] = null;
      let worstDemandLedgers: string[] = [];

      for (const d of demands) {
        const th = adjustedThreshold(d, phaseMult);
        const ledgers = ledgerTargetsForDemand(d);
        let proj = 0;
        for (const row of rows14) {
          if (!ledgers.includes(row.load_target)) continue;
          const hoursElapsed = (sessionEnd.getTime() - new Date(row.completed_at).getTime()) / MS_H;
          const dh = Math.max(1, row.decay_hours || 48);
          proj += row.magnitude * Math.exp((-3.0 * hoursElapsed) / dh);
        }
        const ratio = proj / Math.max(th, 1);
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstDemandLedgers = [...ledgers];
        }
      }

      if (worstRatio > 0.4) {
        const contributors = rows14
          .filter((r) => worstDemandLedgers.includes(r.load_target))
          .sort((a, b) => residualStress(b, asOf) - residualStress(a, asOf));
        const top = contributors[0];
        if (top?.source === "strength_logged") threat = "recent_strength_session";
        else if (top?.load_domain === "aerobic") threat = "accumulated_run_volume";
        else if (top?.load_domain === "muscular") threat = "yesterday_leg_strength";
        else threat = "consecutive_hard_days";

        let risk_level: ProtectedSessionRiskV1["risk_level"] = "high";
        if (worstRatio < 0.5) risk_level = "low";
        else if (worstRatio < 0.75) risk_level = "moderate";

        protected_session_risks.push({
          planned_workout_id: ks.id,
          session_name: ks.name,
          scheduled_date: ks.date,
          reason: "key_session_projection",
          risk_level,
          threat_source: threat,
          mitigation: null,
        });
      }
    }

    const planned_volume_by_type: Record<string, number> = {};
    for (const pw of plannedWeek) {
      const t = (pw.type ?? "other").toLowerCase();
      const dur = Number(pw.duration) || 0;
      if (t === "strength") {
        planned_volume_by_type[t] = (planned_volume_by_type[t] ?? 0) + 1;
      } else {
        planned_volume_by_type[t] = (planned_volume_by_type[t] ?? 0) + dur;
      }
    }

    const completed_volume_by_type: Record<string, number> = {};
    for (const w of workoutsWeek) {
      const t = (w.type ?? "other").toLowerCase();
      const dur = Number(w.moving_time ?? w.duration) || 0;
      const minutes = dur > 1000 ? dur / 60 : dur;
      if (t === "strength") {
        completed_volume_by_type[t] = (completed_volume_by_type[t] ?? 0) + 1;
      } else {
        completed_volume_by_type[t] = (completed_volume_by_type[t] ?? 0) + minutes;
      }
    }

    const remaining_volume_by_type: Record<string, number> = {};
    const types = new Set([...Object.keys(planned_volume_by_type), ...Object.keys(completed_volume_by_type)]);
    for (const t of types) {
      remaining_volume_by_type[t] = Math.max(
        0,
        (planned_volume_by_type[t] ?? 0) - (completed_volume_by_type[t] ?? 0),
      );
    }

    const dow = asOf.getUTCDay();
    const dayIndex = dow === 0 ? 7 : dow;
    const expectedFrac = Math.min(1, dayIndex / 7);
    let plannedTotal = 0,
      completedTotal = 0;
    for (const t of Object.keys(planned_volume_by_type)) {
      plannedTotal += planned_volume_by_type[t] ?? 0;
      completedTotal += completed_volume_by_type[t] ?? 0;
    }
    const on_track = plannedTotal <= 0 ? true : completedTotal >= plannedTotal * expectedFrac * 0.7;

    const sysNow = totalSystemicResidual(rows14, asOf);
    const sys24 = totalSystemicResidual(rows14, new Date(asOf.getTime() - 24 * MS_H));
    const sys48 = totalSystemicResidual(rows14, new Date(asOf.getTime() - 48 * MS_H));
    let systemic_fatigue_trend: WeekLoadStatusV1["systemic_fatigue_trend"] = "stable";
    if (sysNow > sys24 * 1.1 && sys24 > sys48 * 1.1) systemic_fatigue_trend = "accumulating";
    else if (sysNow < sys24 * 0.9 && sys24 < sys48 * 0.9) systemic_fatigue_trend = "recovering";

    week_load_status = {
      planned_volume_by_type,
      completed_volume_by_type,
      remaining_volume_by_type,
      on_track,
      systemic_fatigue_trend,
    };

    const hardThisWeek = rows14.some((r) => {
      const d = r.completed_at.slice(0, 10);
      return d >= weekStart && d <= weekEnd &&
        (r.intensity_context === "hard" || r.intensity_context === "max_effort");
    });

    let intent_match = true;
    let concern: string | null = null;
    if (plan_context.week_intent === "recovery" && hardThisWeek) {
      intent_match = false;
      concern = "recovery week but completed hard session(s)";
    } else if (
      plan_context.week_intent === "load" && dayIndex >= 5 && plannedTotal > 0 &&
      completedTotal < plannedTotal * 0.5
    ) {
      intent_match = false;
      concern = "build week but volume significantly below target";
    } else if (
      plan_context.week_intent === "recovery" && systemic_fatigue_trend === "accumulating"
    ) {
      intent_match = false;
      concern = "taper/recovery week but fatigue is accumulating instead of dissipating";
    }

    block_alignment = {
      phase: plan_context.block_phase,
      intent_match,
      concern,
    };

    const muscularTargets = Object.keys(muscular);
    const anyHighResidual = muscularTargets.some((k) =>
      muscular[k]!.residual_stress > 0.5 * thresholdForTarget(k)
    );

    const can_say_protected_at_risk = protected_session_risks.some((r) =>
      r.risk_level === "moderate" || r.risk_level === "high"
    );

    const admissible: string[] = [];
    for (const k of muscularTargets) {
      const m = muscular[k]!;
      const th = thresholdForTarget(k);
      if (m.residual_stress < 0.4 * th) {
        admissible.push(`${targetDisplayName(k)} is fresh`);
      }
    }
    if (next_session_readiness?.ready) {
      admissible.push(`ready for ${next_session_readiness.session_name ?? "next session"}`);
    }

    const forbidden: string[] = [];
    if (anyHighResidual) {
      forbidden.push("fully recovered");
      forbidden.push("well rested");
    }
    if (next_session_readiness && !next_session_readiness.ready) {
      forbidden.push(`ready for ${next_session_readiness.session_name ?? "next session"}`);
    }
    if (systemic_fatigue_trend === "accumulating") {
      forbidden.push("fresh");
    }

    let frame: NarrativeCapsV1["frame"] = "neutral";
    if (plan_context.week_intent === "recovery") frame = "recovery_week";
    else if (plan_context.block_phase.toLowerCase().includes("taper")) frame = "tapering";
    else if (plan_context.block_phase.toLowerCase().includes("peak")) frame = "peaking";
    else if (plan_context.weeks_to_a_race != null && plan_context.weeks_to_a_race <= 1) {
      frame = "race_ready";
    } else frame = "building";

    narrative_caps = {
      can_say_fresh_for_next: next_session_readiness?.ready ?? false,
      can_say_protected_at_risk,
      recovery_week_language: plan_context.week_intent === "recovery",
      admissible,
      forbidden,
      frame,
    };
  }

  const degraded = degraded_missing.length > 0;

  if (!activePlan) {
    const mon = mondayUTC(asOf);
    const weekStart = dateStrUTC(mon);
    const weekEnd = addDaysUTC(weekStart, 6);
    const { data: woOnly } = await supabase
      .from("workouts")
      .select("id, type, duration, date, moving_time")
      .eq("user_id", userId)
      .gte("date", weekStart)
      .lte("date", weekEnd);

    const completed_volume_by_type: Record<string, number> = {};
    for (const w of woOnly ?? []) {
      const t = (w.type ?? "other").toLowerCase();
      const dur = Number((w as { moving_time?: number; duration?: number }).moving_time ??
        (w as { duration?: number }).duration) || 0;
      const minutes = dur > 1000 ? dur / 60 : dur;
      if (t === "strength") {
        completed_volume_by_type[t] = (completed_volume_by_type[t] ?? 0) + 1;
      } else {
        completed_volume_by_type[t] = (completed_volume_by_type[t] ?? 0) + minutes;
      }
    }

    const sysNow = totalSystemicResidual(rows14, asOf);
    const sys24 = totalSystemicResidual(rows14, new Date(asOf.getTime() - 24 * MS_H));
    const sys48 = totalSystemicResidual(rows14, new Date(asOf.getTime() - 48 * MS_H));
    let systemic_fatigue_trend: WeekLoadStatusV1["systemic_fatigue_trend"] = "stable";
    if (sysNow > sys24 * 1.1 && sys24 > sys48 * 1.1) systemic_fatigue_trend = "accumulating";
    else if (sysNow < sys24 * 0.9 && sys24 < sys48 * 0.9) systemic_fatigue_trend = "recovering";

    const wlNoPlan: WeekLoadStatusV1 = {
      planned_volume_by_type: {},
      completed_volume_by_type,
      remaining_volume_by_type: { ...completed_volume_by_type },
      on_track: true,
      systemic_fatigue_trend,
    };

    return {
      computed_at: asOfIso,
      user_id: userId,
      degraded,
      degraded_reason,
      degraded_missing: degraded_missing.length ? degraded_missing : undefined,
      muscular,
      energy_systems,
      plan_context: null,
      next_session_readiness: null,
      protected_session_risks: undefined,
      week_load_status: wlNoPlan,
      block_alignment: null,
      narrative_caps: null,
    };
  }

  return {
    computed_at: asOfIso,
    user_id: userId,
    degraded,
    degraded_reason,
    degraded_missing: degraded_missing.length ? degraded_missing : undefined,
    muscular,
    energy_systems,
    plan_context,
    next_session_readiness,
    protected_session_risks: protected_session_risks.length ? protected_session_risks : undefined,
    week_load_status: week_load_status ?? undefined,
    block_alignment: block_alignment ?? undefined,
    narrative_caps: narrative_caps ?? undefined,
  };
}
