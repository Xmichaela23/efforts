/**
 * session_load rows for compute-facts (strength + endurance).
 * Caller wraps in try/catch — failures must not fail the pipeline.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ExerciseRegistryRow } from "./exercise-registry-lookup.ts";

export type WorkoutLike = {
  id: string;
  user_id: string;
  date: string;
  timestamp: string | null;
  type: string;
};

/** Shape for strength session_load (mirrors exercise_log fields we need). */
export type ExerciseLogRowForLoad = {
  exercise_id: string | null;
  canonical_name: string;
  total_volume: number | null;
  avg_rir: number | null;
  sets_completed: number | null;
  best_weight: number | null;
  best_reps: number | null;
};

type SessionLoadInsert = {
  workout_id: string;
  user_id: string;
  completed_at: string;
  load_domain: string;
  load_target: string;
  magnitude: number;
  intensity_context: string | null;
  decay_hours: number;
  source: string;
  source_detail: Record<string, unknown> | null;
};

function completedAtIso(w: WorkoutLike): string {
  if (w.timestamp && String(w.timestamp).trim()) {
    const d = new Date(w.timestamp);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return `${w.date}T12:00:00.000Z`;
}

function rirToIntensityContext(avgRir: number | null): string {
  if (avgRir == null) return "moderate";
  if (avgRir >= 4) return "recovery";
  if (avgRir >= 2) return "moderate";
  if (avgRir >= 1) return "hard";
  return "max_effort";
}

function effortFraction(avgRir: number | null): number {
  if (avgRir == null) return 0.7;
  return Math.max(0, Math.min(1, (10 - avgRir) / 10));
}

function roundMag(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Dominant HR zone bucket → endurance intensity_modifier + context */
function enduranceIntensityFromZones(timeInZone: Record<string, number> | null | undefined): {
  modifier: number;
  context: string;
  z4z5Minutes: number;
  totalZoneMinutes: number;
} {
  if (!timeInZone || typeof timeInZone !== "object") {
    return { modifier: 0.8, context: "moderate", z4z5Minutes: 0, totalZoneMinutes: 0 };
  }
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
  for (const [k, v] of Object.entries(timeInZone)) {
    const sec = Number(v) || 0;
    const min = sec / 60;
    const z = k.replace(/^z/i, "");
    if (z === "1") z1 += min;
    else if (z === "2") z2 += min;
    else if (z === "3") z3 += min;
    else if (z === "4") z4 += min;
    else if (z === "5") z5 += min;
  }
  const total = z1 + z2 + z3 + z4 + z5;
  const z4z5 = z4 + z5;
  if (total <= 0) return { modifier: 0.8, context: "moderate", z4z5Minutes: 0, totalZoneMinutes: 0 };
  const pHard = (z4 + z5) / total;
  const pEasy = (z1 + z2) / total;
  if (pHard >= 0.2) return { modifier: 1.2, context: "hard", z4z5Minutes: z4z5, totalZoneMinutes: total };
  if (pEasy >= 0.55) return { modifier: 0.5, context: "recovery", z4z5Minutes: z4z5, totalZoneMinutes: total };
  return { modifier: 0.8, context: "moderate", z4z5Minutes: z4z5, totalZoneMinutes: total };
}

function buildStrengthSessionLoad(
  w: WorkoutLike,
  rows: ExerciseLogRowForLoad[],
  byId: Map<string, ExerciseRegistryRow>,
): SessionLoadInsert[] {
  const out: SessionLoadInsert[] = [];
  const completed_at = completedAtIso(w);

  for (const row of rows) {
    if (!row.exercise_id) continue;
    const vol = row.total_volume;
    if (vol == null || vol <= 0) continue;

    const ex = byId.get(row.exercise_id);
    if (!ex?.muscle_attribution?.primary) continue;

    const loadRatio = Number(ex.load_ratio);
    const lr = Number.isFinite(loadRatio) && loadRatio > 0 ? loadRatio : 1;
    const eff = effortFraction(row.avg_rir);
    const volumeLoad = vol * eff * lr;
    const decay = Number(ex.recovery_hours_typical);
    const decayHours = Number.isFinite(decay) && decay > 0 ? Math.round(decay) : 48;
    const intensity = rirToIntensityContext(row.avg_rir);
    const detail = { exercise_id: row.exercise_id, exercise_slug: ex.slug };

    const primary = ex.muscle_attribution.primary;
    for (const [muscle, weight] of Object.entries(primary)) {
      const wgt = Number(weight);
      if (!Number.isFinite(wgt) || wgt <= 0) continue;
      out.push({
        workout_id: w.id,
        user_id: w.user_id,
        completed_at,
        load_domain: "muscular",
        load_target: muscle,
        magnitude: roundMag(volumeLoad * wgt),
        intensity_context: intensity,
        decay_hours: decayHours,
        source: "strength_logged",
        source_detail: detail,
      });
    }

    const secondary = ex.muscle_attribution.secondary;
    if (secondary && typeof secondary === "object") {
      for (const [muscle, weight] of Object.entries(secondary)) {
        const wgt = Number(weight);
        if (!Number.isFinite(wgt) || wgt <= 0) continue;
        out.push({
          workout_id: w.id,
          user_id: w.user_id,
          completed_at,
          load_domain: "muscular",
          load_target: muscle,
          magnitude: roundMag(volumeLoad * wgt),
          intensity_context: intensity,
          decay_hours: decayHours,
          source: "strength_logged",
          source_detail: detail,
        });
      }
    }

    const rir = row.avg_rir;
    const sets = row.sets_completed ?? 0;
    const bw = row.best_weight ?? 0;
    if (rir != null && rir <= 1 && sets > 0 && bw > 0) {
      const volNum = vol;
      const repsPerSet = volNum / sets / bw;
      if (Number.isFinite(repsPerSet) && repsPerSet > 0 && repsPerSet <= 5) {
        const nm = sets * (1 / (rir + 1));
        out.push({
          workout_id: w.id,
          user_id: w.user_id,
          completed_at,
          load_domain: "neuromuscular",
          load_target: "cns",
          magnitude: roundMag(nm),
          intensity_context: rirToIntensityContext(rir),
          decay_hours: 24,
          source: "strength_logged",
          source_detail: detail,
        });
      }
    }
  }

  return out;
}

function normalizeDiscipline(type: string): string {
  const t = (type ?? "").toLowerCase();
  if (t === "strength") return "strength";
  if (t === "ride" || t === "bike" || t === "cycling") return "ride";
  if (t === "swim" || t === "swimming") return "swim";
  if (t === "run" || t === "running" || t === "walk") return "run";
  return t;
}

function buildEnduranceSessionLoad(
  w: WorkoutLike,
  discipline: string,
  durationMinutes: number,
  workload: number | null,
  runFacts: Record<string, unknown> | null,
  rideFacts: Record<string, unknown> | null,
  swimFacts: Record<string, unknown> | null,
  hasStructuredIntervals: boolean,
): SessionLoadInsert[] {
  const out: SessionLoadInsert[] = [];
  if (durationMinutes <= 0) return out;

  const completed_at = completedAtIso(w);
  const facts = discipline === "run"
    ? runFacts
    : discipline === "ride"
    ? rideFacts
    : swimFacts;

  const timeInZone = facts?.time_in_zone as Record<string, number> | undefined;
  const { modifier, context, z4z5Minutes, totalZoneMinutes } = enduranceIntensityFromZones(
    timeInZone ?? null,
  );

  let aerobicMag: number;
  if (workload != null && Number.isFinite(workload) && workload > 0) {
    aerobicMag = workload;
  } else {
    aerobicMag = durationMinutes * modifier;
  }

  out.push({
    workout_id: w.id,
    user_id: w.user_id,
    completed_at,
    load_domain: "aerobic",
    load_target: "aerobic_base",
    magnitude: roundMag(aerobicMag),
    intensity_context: context,
    decay_hours: 36,
    source: "gps_derived",
    source_detail: { discipline },
  });

  if (discipline === "swim") {
    // Muscular leg cost skipped for swim
  } else if (discipline === "run" || discipline === "ride") {
    const impact = discipline === "run" ? 1.0 : 0.4;
    const legDecay = discipline === "run" ? 48 : 36;

    const quadMag = durationMinutes * impact * modifier;
    out.push({
      workout_id: w.id,
      user_id: w.user_id,
      completed_at,
      load_domain: "muscular",
      load_target: "quadriceps",
      magnitude: roundMag(quadMag),
      intensity_context: context,
      decay_hours: legDecay,
      source: "gps_derived",
      source_detail: { discipline },
    });
    out.push({
      workout_id: w.id,
      user_id: w.user_id,
      completed_at,
      load_domain: "muscular",
      load_target: "hamstrings",
      magnitude: roundMag(quadMag * 0.8),
      intensity_context: context,
      decay_hours: legDecay,
      source: "gps_derived",
      source_detail: { discipline },
    });

    if (discipline === "run") {
      out.push({
        workout_id: w.id,
        user_id: w.user_id,
        completed_at,
        load_domain: "muscular",
        load_target: "calves",
        magnitude: roundMag(durationMinutes * 0.7 * modifier),
        intensity_context: context,
        decay_hours: 36,
        source: "gps_derived",
        source_detail: { discipline },
      });
    }
  }

  const zoneGlycolytic =
    totalZoneMinutes > 0 && z4z5Minutes > 0 && (z4z5Minutes / totalZoneMinutes) >= 0.15;
  const glycolyticEligible = zoneGlycolytic || hasStructuredIntervals;
  if (glycolyticEligible) {
    let threshMin = 0;
    if (z4z5Minutes > 0) threshMin = z4z5Minutes;
    else if (hasStructuredIntervals) threshMin = durationMinutes * 0.25;
    if (threshMin > 0) {
      out.push({
        workout_id: w.id,
        user_id: w.user_id,
        completed_at,
        load_domain: "glycolytic",
        load_target: "glycolytic",
        magnitude: roundMag(threshMin * 2.0),
        intensity_context: context === "hard" ? "hard" : "moderate",
        decay_hours: 24,
        source: "gps_derived",
        source_detail: { discipline },
      });
    }
  }

  return out;
}

const ALLOWED_SESSION_LOAD = new Set(["strength", "run", "ride", "swim"]);

/**
 * Delete all session_load for workout, then insert new rows (idempotent).
 */
export async function rewriteSessionLoad(
  supabase: SupabaseClient,
  w: WorkoutLike,
  opts: {
    discipline: string;
    durationMinutes: number;
    workload: number | null;
    runFacts: Record<string, unknown> | null;
    rideFacts: Record<string, unknown> | null;
    swimFacts: Record<string, unknown> | null;
    strengthRows: ExerciseLogRowForLoad[];
    registryById: Map<string, ExerciseRegistryRow>;
    hasStructuredIntervals: boolean;
  },
): Promise<{ inserted: number }> {
  const { error: delErr } = await supabase.from("session_load").delete().eq("workout_id", w.id);
  if (delErr) throw new Error(`session_load delete: ${delErr.message}`);

  const d = normalizeDiscipline(opts.discipline);
  if (!ALLOWED_SESSION_LOAD.has(d)) {
    return { inserted: 0 };
  }

  const inserts: SessionLoadInsert[] = [];

  if (d === "strength" && opts.strengthRows.length > 0) {
    inserts.push(...buildStrengthSessionLoad(w, opts.strengthRows, opts.registryById));
  } else if (d === "run" || d === "ride" || d === "swim") {
    inserts.push(
      ...buildEnduranceSessionLoad(
        w,
        d,
        opts.durationMinutes,
        opts.workload,
        opts.runFacts,
        opts.rideFacts,
        opts.swimFacts,
        opts.hasStructuredIntervals,
      ),
    );
  }

  if (inserts.length === 0) return { inserted: 0 };

  const { error: insErr } = await supabase.from("session_load").insert(inserts);
  if (insErr) throw new Error(`session_load insert: ${insErr.message}`);

  return { inserted: inserts.length };
}
