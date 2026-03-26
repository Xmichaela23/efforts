/**
 * Readiness → LOAD CONTEXT string + client-safe summary for session_detail_v1 / LLM.
 * Does not import DB; operates on ReadinessSnapshotV1 only.
 */

import { adjustedThreshold, PHASE_MULTIPLIERS, thresholdForTarget } from "../readiness-thresholds.ts";
import type {
  MuscularResidualEntry,
  NarrativeCapsV1,
  ReadinessSnapshotV1,
} from "../readiness-types.ts";
import type { MuscularSummaryEntryV1, SessionDetailReadinessV1 } from "./types.ts";

function capitalize(s: string): string {
  const t = String(s || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function phaseMultiplier(blockPhase: string, weekIntent: string): number {
  const p = blockPhase.toLowerCase();
  if (weekIntent === "recovery") return PHASE_MULTIPLIERS.recovery;
  if (p.includes("taper")) return PHASE_MULTIPLIERS.taper;
  if (p.includes("race")) return PHASE_MULTIPLIERS.race_week;
  if (p.includes("peak")) return PHASE_MULTIPLIERS.peak;
  if (p.includes("base")) return PHASE_MULTIPLIERS.base;
  return PHASE_MULTIPLIERS.build;
}

function muscularStatusLabel(
  target: string,
  residual: number,
  planContext: ReadinessSnapshotV1["plan_context"],
): "fresh" | "manageable" | "compromised" {
  const base = thresholdForTarget(target);
  const mult = planContext
    ? phaseMultiplier(planContext.block_phase, planContext.week_intent)
    : 1;
  const th = adjustedThreshold(target, mult);
  const ratio = residual / Math.max(th, 1);
  if (ratio < 0.4) return "fresh";
  if (ratio < 0.85) return "manageable";
  return "compromised";
}

function aerobicTrendLabel(trend: number | null | undefined): string {
  if (trend == null || !Number.isFinite(trend)) return "stable";
  if (trend > 5) return `+${Math.round(trend)}% (building as expected)`;
  if (trend < -5) return `${Math.round(trend)}% (declining)`;
  return "stable";
}

function humanizeRecommendation(r: string): string {
  const map: Record<string, string> = {
    proceed_as_planned: "proceed as planned",
    reduce_intensity: "reduce intensity",
    swap_session: "swap session",
    rest: "rest",
  };
  return map[r] ?? r.replace(/_/g, " ");
}

function shortWorkoutRef(src: {
  workout_date: string | null;
  workout_type: string | null;
  workout_name: string | null;
}): string {
  const d = src.workout_date && src.workout_date.length >= 10 ? src.workout_date.slice(5, 10) : null;
  const nm = (src.workout_name || src.workout_type || "session").trim();
  return d ? `${d} ${nm}` : nm;
}

/** Short user-facing LOAD summary for Analysis Details (1-2 lines, no raw model dump). */
export function buildLoadDisplaySummaryFromReadiness(readiness: ReadinessSnapshotV1): string {
  if (readiness.degraded && readiness.degraded_reason === "no_load_data") {
    return "Load context unavailable.";
  }

  const parts: string[] = [];
  const pc = readiness.plan_context;
  if (pc) {
    const phase = `${capitalize(pc.block_phase)} week`;
    const race = pc.weeks_to_a_race != null ? `${pc.weeks_to_a_race} weeks to race` : null;
    const intent = pc.week_intent ? `${pc.week_intent} intent` : null;
    parts.push([phase, intent, race].filter(Boolean).join(", "));
  }

  const topMuscles = Object.entries(readiness.muscular || {})
    .filter(([, v]) => (v?.residual_stress ?? 0) > 50)
    .sort((a, b) => (b[1]?.residual_stress ?? 0) - (a[1]?.residual_stress ?? 0))
    .slice(0, 3)
    .map(([target, data]) => {
      const status = muscularStatusLabel(target, data.residual_stress, pc);
      const lead = Array.isArray(data.top_sources) && data.top_sources[0] ? shortWorkoutRef(data.top_sources[0]) : "recent sessions";
      return `${target.replace(/_/g, " ")} ${status} (${lead})`;
    });
  if (topMuscles.length > 0) {
    parts.push(topMuscles.join(" · "));
  } else {
    parts.push("all muscle groups fresh");
  }

  const aero = readiness.energy_systems?.aerobic;
  if (aero) {
    const t = (aero as { trend_7d_pct?: number | null; trend_7d?: number | null }).trend_7d_pct
      ?? (aero as { trend_7d?: number | null }).trend_7d
      ?? null;
    const aeroShort = t == null || !Number.isFinite(t)
      ? "aerobic stable"
      : (t > 5 ? "aerobic building" : t < -5 ? "aerobic declining" : "aerobic stable");
    parts.push(aeroShort);
  }

  return parts.join(" · ");
}

function compactWorkoutLabel(src: {
  workout_date: string | null;
  workout_type: string | null;
  workout_name: string | null;
  share_pct: number;
}): string {
  const dt = src.workout_date;
  const d = dt && dt.length >= 10 ? dt.slice(5, 10) : null;
  const tp = src.workout_type ? src.workout_type.replace(/_/g, " ") : "session";
  const nm = src.workout_name?.trim() || tp;
  return `${d ? `${d} ` : ""}${nm} (${Math.max(1, Math.round(src.share_pct))}%)`;
}

/** Full LOAD CONTEXT block for LLM user message / analysis Load row. */
export function buildLoadContextFromReadiness(readiness: ReadinessSnapshotV1): string {
  if (readiness.degraded && readiness.degraded_reason === "no_load_data") {
    return "LOAD CONTEXT\nNo load data available — training load assessment unavailable.";
  }

  const pc = readiness.plan_context;
  const noPlan = !pc;
  const lines: string[] = noPlan
    ? ["LOAD CONTEXT (no active plan — muscle data only)"]
    : ["LOAD CONTEXT"];

  lines.push("Muscular state uses model residuals; source sessions below explain where most load came from.");

  if (pc) {
    const weekLabel = pc.weeks_to_a_race != null ? `${pc.weeks_to_a_race} weeks to race` : "";
    const phaseCap = capitalize(pc.block_phase);
    lines.push(
      `Week: ${phaseCap} week, ${pc.week_intent} intent${weekLabel ? `, ${weekLabel}` : ""}`.trim(),
    );
    lines.push(`Phase: ${pc.block_phase}`);
  }

  const nsr = readiness.next_session_readiness;
  if (nsr) {
    lines.push("");
    const name = nsr.session_name?.trim() || "Next planned session";
    lines.push(`Next session: ${name}`);
    if (nsr.ready) {
      lines.push("  Ready: yes");
      const freshDemands = Object.entries(nsr.demands_met || {})
        .filter(([, v]) => v?.status === "fresh")
        .map(([k]) => k.replace(/_/g, " "));
      if (freshDemands.length > 0) {
        lines.push(`  All demands fresh (${freshDemands.join(", ")})`);
      }
    } else {
      lines.push(`  Ready: no — ${humanizeRecommendation(String(nsr.recommendation))}`);
      if (nsr.limiting_factor) {
        const lf = nsr.limiting_factor.replace(/_/g, " ");
        const st = nsr.demands_met?.[nsr.limiting_factor]?.status;
        lines.push(`  Limiting factor: ${lf}${st ? ` (${st})` : ""}`);
      }
    }
  }

  lines.push("");
  lines.push("Muscular state (significant residual only):");
  const muscularEntries = Object.entries(readiness.muscular || {})
    .filter(([, v]) => (v?.residual_stress ?? 0) > 50)
    .sort((a, b) => (b[1]?.residual_stress ?? 0) - (a[1]?.residual_stress ?? 0));

  if (muscularEntries.length === 0) {
    lines.push("  All muscle groups fresh");
  } else {
    for (const [target, data] of muscularEntries) {
      const displayTarget = target.replace(/_/g, " ");
      const label = muscularStatusLabel(target, data.residual_stress, pc);
      const srcs = Array.isArray(data.top_sources) ? data.top_sources : [];
      const srcText = srcs.length > 0
        ? srcs.slice(0, 2).map(compactWorkoutLabel).join(" + ")
        : "recent sessions";
      lines.push(`  ${displayTarget}: ${label} — mainly from ${srcText}`);
    }
  }

  lines.push("");
  lines.push("Energy systems:");
  const es = readiness.energy_systems;
  if (es) {
    const aeroTrendRaw = (es.aerobic as { trend_7d_pct?: number | null; trend_7d?: number | null })
      .trend_7d_pct ?? (es.aerobic as { trend_7d?: number | null }).trend_7d;
    const aeroTrend = aerobicTrendLabel(aeroTrendRaw ?? null);
    lines.push(`  aerobic: ${Math.round(es.aerobic.residual_stress)} residual, 7d trend ${aeroTrend}`);
    lines.push(
      `  glycolytic: ${es.glycolytic.residual_stress > 5 ? `${Math.round(es.glycolytic.residual_stress)} residual` : "minimal"}`,
    );
    lines.push(
      `  neuromuscular: ${es.neuromuscular.residual_stress > 1 ? `${Math.round(es.neuromuscular.residual_stress)} residual` : "minimal"}`,
    );
  }

  const wls = readiness.week_load_status;
  if (wls && Object.keys(wls.planned_volume_by_type || {}).length > 0) {
    lines.push("");
    const volParts: string[] = [];
    for (const type of Object.keys(wls.planned_volume_by_type || {})) {
      const planned = wls.planned_volume_by_type[type] || 0;
      const completed = wls.completed_volume_by_type?.[type] || 0;
      const unit = type === "strength" ? "sessions" : "min";
      volParts.push(`${type} ${completed}/${planned} ${unit}`);
    }
    lines.push(`Week volume: ${volParts.join(", ")}`);
    lines.push(`Systemic trend: ${wls.systemic_fatigue_trend}`);
  }

  const risks = readiness.protected_session_risks;
  if (risks && risks.length > 0) {
    lines.push("");
    lines.push("Protected sessions this week:");
    for (const risk of risks) {
      const nm = risk.session_name?.trim() || "Session";
      const threat = risk.threat_source ? ` (${risk.threat_source})` : "";
      lines.push(`  ${nm} — risk: ${risk.risk_level}${threat}`);
    }
  }

  const concern = readiness.block_alignment?.concern;
  if (concern) {
    lines.push("");
    lines.push(`⚠ ${concern}`);
  }

  return lines.join("\n");
}

/** Appended to coaching system prompt when narrative_caps is present. */
export function buildNarrativeCapsAppend(caps: NarrativeCapsV1 | null | undefined): string {
  if (!caps) return "";

  let out = "\n\nNARRATIVE CONSTRAINTS (do not violate):\n";

  if (caps.frame) {
    out += `Framing: ${caps.frame}. `;
    if (caps.frame === "recovery_week") {
      out += "Use recovery-oriented language. Emphasize rest and adaptation, not performance.\n";
    } else if (caps.frame === "tapering") {
      out += "Use confidence-building language. The goal is feeling ready, not getting fitter.\n";
    } else if (caps.frame === "building") {
      out += "Normal training language. Load is expected and productive.\n";
    }
  }

  if (caps.forbidden && caps.forbidden.length > 0) {
    out += `FORBIDDEN phrases (never use): ${caps.forbidden.map((f) => `"${f}"`).join(", ")}\n`;
  }

  if (caps.admissible && caps.admissible.length > 0) {
    out += `ALLOWED observations: ${caps.admissible.join("; ")}\n`;
  }

  if (caps.can_say_fresh_for_next) {
    out += "You MAY say the athlete is ready for their next session.\n";
  } else {
    out += "Do NOT say the athlete is fully ready or well rested.\n";
  }

  return out;
}

export function summarizeMuscularForClient(
  muscular: Record<string, MuscularResidualEntry>,
  planContext: ReadinessSnapshotV1["plan_context"],
): MuscularSummaryEntryV1[] {
  const out: MuscularSummaryEntryV1[] = [];
  for (const [target, data] of Object.entries(muscular || {})) {
    if ((data?.residual_stress ?? 0) <= 0) continue;
    out.push({
      target: target.replace(/_/g, " "),
      status: muscularStatusLabel(target, data.residual_stress, planContext),
      residual_stress: Math.round(data.residual_stress),
      top_sources: Array.isArray(data.top_sources)
        ? data.top_sources.slice(0, 3).map((s) => ({
            workout_id: String(s.workout_id || ""),
            workout_date: s.workout_date ?? null,
            workout_type: s.workout_type ?? null,
            workout_name: s.workout_name ?? null,
            share_pct: Math.max(1, Math.round(Number(s.share_pct || 0))),
          }))
        : [],
    });
  }
  out.sort((a, b) => b.residual_stress - a.residual_stress);
  return out;
}

/** Client payload: no raw muscular map; summary + plan fields only. */
export function packageSessionDetailReadiness(
  readiness: ReadinessSnapshotV1,
): SessionDetailReadinessV1 | null {
  if (readiness.degraded && readiness.degraded_reason === "no_load_data") return null;

  return {
    degraded: readiness.degraded,
    degraded_reason: readiness.degraded_reason ?? null,
    degraded_missing: readiness.degraded_missing ?? null,
    next_session_readiness: readiness.next_session_readiness ?? null,
    muscular_summary: summarizeMuscularForClient(readiness.muscular || {}, readiness.plan_context ?? null),
    plan_context: readiness.plan_context ?? null,
    week_load_status: readiness.week_load_status ?? null,
    narrative_caps: readiness.narrative_caps ?? null,
    protected_session_risks: readiness.protected_session_risks ?? null,
    block_alignment: readiness.block_alignment ?? null,
  };
}
