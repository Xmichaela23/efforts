/**
 * EDGE FUNCTION: compute-facts
 *
 * Deterministic Layer — Phase 1.
 *
 * Runs on every workout ingest (after calculate-workload).
 * Reads the workout row + planned workout + baselines, then writes:
 *   - workout_facts  (one row per workout)
 *   - exercise_log   (one row per exercise, strength workouts only)
 *
 * No AI, no narratives, no sensor time-series. Pure math.
 *
 * Input:  { workout_id: string }
 * Output: { success: boolean, workout_id, discipline, facts_written, exercises_written }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  calculateStrengthWorkload,
  calculateMobilityWorkload,
  calculatePilatesYogaWorkload,
  calculateTRIMPWorkload,
  calculateDurationWorkload,
  getStepsIntensity,
  getDefaultIntensityForType,
  mapRPEToIntensity,
  type TRIMPInput,
} from "../_shared/workload.ts";
import { canonicalize, muscleGroup, bigFourLift } from "../_shared/canonicalize.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
  user_id: string;
  type: string;
  date: string;
  duration: number | null;
  moving_time: number | null;
  distance: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_pace: number | null;
  avg_power: number | null;
  max_power: number | null;
  normalized_power: number | null;
  avg_cadence: number | null;
  elevation_gain: number | null;
  strength_exercises: any[] | null;
  mobility_exercises: any[] | null;
  workout_metadata: Record<string, any> | null;
  computed: Record<string, any> | null;
  planned_id: string | null;
  workout_status: string | null;
  workload_actual: number | null;
  sensor_data: Record<string, any> | null;
}

interface PlannedRow {
  id: string;
  training_plan_id: string | null;
  week_number: number | null;
  type: string;
  intervals: any[] | null;
  strength_exercises: any[] | null;
  steps_preset: any[] | null;
  workload_planned: number | null;
}

interface Baselines {
  performance_numbers: Record<string, any> | null;
  learned_fitness: Record<string, any> | null;
  age: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function durationMinutes(w: WorkoutRow): number {
  return (w.moving_time ?? w.duration ?? 0);
}

function distanceMeters(w: WorkoutRow): number {
  if (typeof w.distance === "number" && w.distance > 0) {
    return w.distance < 1000 ? w.distance * 1000 : w.distance;
  }
  const compDist = w.computed?.overall?.distance_m;
  if (typeof compDist === "number" && compDist > 0) return compDist;
  return 0;
}

/**
 * Brzycki formula with RIR offset.
 * effectiveReps = logged_reps + logged_rir treats "leftover capacity" as
 * completed work, giving a stable 1RM estimate without requiring a failure set.
 * Brzycki is more accurate than Epley at the low rep ranges (2-5) used in
 * neural_speed and performance protocols.
 */
function brzycki1RM(weight: number, reps: number, rir: number): number {
  if (weight <= 0) return 0;
  const effectiveReps = Math.max(1, reps + Math.round(rir));
  if (effectiveReps === 1) return Math.round(weight / 5) * 5 || weight;
  // Brzycki: weight × (36 / (37 - effectiveReps))
  // Cap at effectiveReps = 30 to avoid division-by-zero / nonsense at high reps
  const capped = Math.min(effectiveReps, 30);
  const raw = weight * (36 / (37 - capped));
  return Math.round(raw / 5) * 5; // round to nearest 5 lbs
}

// Seven anchor lifts tracked for 1RM progression.
// Expanded from the original Big Four to cover all three strength protocols.
const STRENGTH_ANCHORS = [
  "squat",
  "bench_press",
  "deadlift",
  "trap_bar_deadlift",
  "overhead_press",
  "hip_thrust",
  "barbell_row",
] as const;
type StrengthAnchor = typeof STRENGTH_ANCHORS[number];

type LearnedMetric = {
  value: number;
  confidence: "low" | "medium" | "high";
  source: string;
  sample_count: number;
};

function confidenceFromSamples(n: number): "low" | "medium" | "high" {
  if (n >= 6) return "high";
  if (n >= 3) return "medium";
  return "low";
}

/** Update learned_fitness.strength_1rms from exercise_log (last 12 weeks). */
async function updateLearnedStrengthFromExerciseLog(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<void> {
  try {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    const fromDate = twelveWeeksAgo.toISOString().slice(0, 10);

    const { data: rows } = await supabase
      .from("exercise_log")
      .select("canonical_name, estimated_1rm, date")
      .eq("user_id", userId)
      .gte("date", fromDate)
      .in("canonical_name", STRENGTH_ANCHORS);

    if (!rows?.length) return;

    const agg: Record<string, { max1rm: number; count: number; last_logged: string }> = {};
    for (const r of rows) {
      const c = r.canonical_name as StrengthAnchor;
      if (!(STRENGTH_ANCHORS as readonly string[]).includes(c)) continue;
      const val = Number(r.estimated_1rm);
      if (!Number.isFinite(val) || val <= 0) continue;
      const cur = agg[c];
      if (!cur) {
        agg[c] = { max1rm: val, count: 1, last_logged: r.date };
      } else {
        agg[c].max1rm = Math.max(agg[c].max1rm, val);
        agg[c].count += 1;
        // Track most recent date
        if (r.date > agg[c].last_logged) agg[c].last_logged = r.date;
      }
    }

    const strength_1rms: Record<string, LearnedMetric & { last_logged: string }> = {};
    for (const lift of STRENGTH_ANCHORS) {
      const a = agg[lift];
      if (!a) continue;
      strength_1rms[lift] = {
        value: Math.round(a.max1rm),
        confidence: confidenceFromSamples(a.count),
        source: "exercise_log",
        sample_count: a.count,
        last_logged: a.last_logged,
      };
    }
    if (Object.keys(strength_1rms).length === 0) return;

    const { data: ub } = await supabase
      .from("user_baselines")
      .select("id, learned_fitness")
      .eq("user_id", userId)
      .maybeSingle();

    const existing = (ub?.learned_fitness as Record<string, unknown> | null) ?? {};
    const merged = {
      ...existing,
      strength_1rms,
    };

    if (ub?.id) {
      await supabase
        .from("user_baselines")
        .update({ learned_fitness: merged, updated_at: new Date().toISOString() })
        .eq("id", ub.id);
    } else {
      await supabase.from("user_baselines").insert({
        user_id: userId,
        learned_fitness: merged,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error("[compute-facts] updateLearnedStrengthFromExerciseLog:", e);
  }
}

// ---------------------------------------------------------------------------
// Discipline-specific fact builders
// ---------------------------------------------------------------------------

function buildRunFacts(w: WorkoutRow, baselines: Baselines | null): Record<string, any> {
  const dist = distanceMeters(w);
  const dur = durationMinutes(w);
  const overall = w.computed?.overall ?? {};
  const analysis = w.computed?.analysis ?? {};

  const paceAvg = overall.avg_pace_s_per_mi
    ? Math.round(overall.avg_pace_s_per_mi * 0.621371)
    : dur > 0 && dist > 0
      ? Math.round((dur * 60) / (dist / 1000))
      : null;

  const facts: Record<string, any> = {
    distance_m: Math.round(dist),
    pace_avg_s_per_km: paceAvg,
    hr_avg: w.avg_heart_rate ?? overall.avg_hr ?? null,
    elevation_gain_m: w.elevation_gain ?? null,
  };

  if (Array.isArray(analysis.zones?.hr)) {
    const timeInZone: Record<string, number> = {};
    for (const z of analysis.zones.hr) {
      timeInZone[`z${z.zone}`] = Math.round(z.seconds ?? 0);
    }
    facts.time_in_zone = timeInZone;
  }

  // HR drift: compare first-half avg HR vs second-half avg HR from sensor data
  if (w.sensor_data?.samples && Array.isArray(w.sensor_data.samples)) {
    const hrSamples = w.sensor_data.samples
      .map((s: any) => s.heartRate ?? s.heart_rate)
      .filter((hr: any) => typeof hr === "number" && hr > 0);
    if (hrSamples.length >= 20) {
      const mid = Math.floor(hrSamples.length / 2);
      const firstHalf = hrSamples.slice(0, mid);
      const secondHalf = hrSamples.slice(mid);
      const avg1 = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
      const avg2 = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
      if (avg1 > 0) {
        facts.hr_drift_pct = Math.round(((avg2 - avg1) / avg1) * 1000) / 10;
      }
    }
  }

  // Pace at easy HR (aerobic efficiency proxy)
  const thresholdHR = baselines?.learned_fitness?.running?.threshold_hr
    ?? baselines?.performance_numbers?.threshold_heart_rate;
  if (thresholdHR && w.sensor_data?.samples) {
    const easyMax = Math.round(thresholdHR * 0.78);
    const easySamples = w.sensor_data.samples.filter(
      (s: any) => (s.heartRate ?? s.heart_rate) > 0 && (s.heartRate ?? s.heart_rate) <= easyMax
        && (s.speedMetersPerSecond ?? 0) > 0.5
    );
    if (easySamples.length >= 10) {
      const avgSpeed = easySamples.reduce((sum: number, s: any) => sum + (s.speedMetersPerSecond ?? 0), 0) / easySamples.length;
      if (avgSpeed > 0) {
        facts.pace_at_easy_hr = Math.round(1000 / avgSpeed);
      }
    }
  }

  // Efficiency index: pace/HR ratio (lower pace number = faster, higher ratio = better)
  if (facts.pace_avg_s_per_km && facts.hr_avg && facts.hr_avg > 0) {
    facts.efficiency_index = Math.round((1000 / facts.pace_avg_s_per_km) / facts.hr_avg * 10000) / 100;
  }

  // Interval adherence from computed.intervals
  if (w.computed?.intervals && Array.isArray(w.computed.intervals)) {
    const workIntervals = w.computed.intervals.filter(
      (i: any) => i.planned_label && !/(warm|cool|rest|recovery)/i.test(i.planned_label)
    );
    if (workIntervals.length > 0) {
      const hit = workIntervals.filter((i: any) => {
        const adh = i.adherence_pct ?? i.pace_adherence_pct ?? 100;
        return adh >= 85 && adh <= 115;
      }).length;
      facts.intervals_hit = hit;
      facts.intervals_total = workIntervals.length;
    }
  }

  return facts;
}

function buildRideFacts(w: WorkoutRow, baselines: Baselines | null): Record<string, any> {
  const dist = distanceMeters(w);
  const dur = durationMinutes(w);
  const overall = w.computed?.overall ?? {};
  const analysis = w.computed?.analysis ?? {};
  const ftp = baselines?.performance_numbers?.ftp ?? baselines?.learned_fitness?.cycling?.ftp;

  const facts: Record<string, any> = {
    distance_m: Math.round(dist),
    duration_minutes: Math.round(dur),
    avg_power: w.avg_power ?? overall.avg_power_w ?? null,
    normalized_power: w.normalized_power ?? analysis.power?.normalized_power ?? null,
    avg_hr: w.avg_heart_rate ?? overall.avg_hr ?? null,
  };

  if (ftp && facts.normalized_power) {
    facts.intensity_factor = Math.round((facts.normalized_power / ftp) * 100) / 100;
  }

  if (facts.normalized_power && facts.avg_hr && facts.avg_hr > 0) {
    facts.efficiency_factor = Math.round((facts.normalized_power / facts.avg_hr) * 100) / 100;
  }

  if (Array.isArray(analysis.zones?.hr)) {
    const timeInZone: Record<string, number> = {};
    for (const z of analysis.zones.hr) {
      timeInZone[`z${z.zone}`] = Math.round(z.seconds ?? 0);
    }
    facts.time_in_zone = timeInZone;
  }

  // HR drift
  if (w.sensor_data?.samples && Array.isArray(w.sensor_data.samples)) {
    const hrSamples = w.sensor_data.samples
      .map((s: any) => s.heartRate ?? s.heart_rate)
      .filter((hr: any) => typeof hr === "number" && hr > 0);
    if (hrSamples.length >= 20) {
      const mid = Math.floor(hrSamples.length / 2);
      const avg1 = hrSamples.slice(0, mid).reduce((a: number, b: number) => a + b, 0) / mid;
      const avg2 = hrSamples.slice(mid).reduce((a: number, b: number) => a + b, 0) / (hrSamples.length - mid);
      if (avg1 > 0) {
        facts.hr_drift_pct = Math.round(((avg2 - avg1) / avg1) * 1000) / 10;
      }
    }
  }

  // Power curve from existing analysis
  if (analysis.power_curve || w.computed?.power_curve) {
    facts.power_curve = analysis.power_curve ?? w.computed?.power_curve;
  }

  return facts;
}

function buildSwimFacts(w: WorkoutRow): Record<string, any> {
  const dist = distanceMeters(w);
  const dur = durationMinutes(w);
  const analysis = w.computed?.analysis ?? {};

  const facts: Record<string, any> = {
    distance_m: Math.round(dist),
  };

  if (dur > 0 && dist > 0) {
    facts.pace_per_100m = Math.round((dur * 60 * 100) / dist);
  }

  if (analysis.swim?.avg_pace_per_100m) {
    facts.pace_per_100m = Math.round(analysis.swim.avg_pace_per_100m);
  }

  return facts;
}

interface ExerciseFact {
  name: string;
  canonical: string;
  sets_completed: number;
  best_weight: number;
  best_reps: number;
  avg_rir: number | null;
  volume: number;
  estimated_1rm: number;
  muscle_group: string;
  planned_sets?: number;
  planned_reps?: number;
  planned_weight?: string;
}

function buildStrengthFacts(w: WorkoutRow, planned: PlannedRow | null): {
  strength_facts: Record<string, any>;
  exercises: ExerciseFact[];
} {
  const exArr: any[] = w.strength_exercises ?? [];
  if (exArr.length === 0) return { strength_facts: {}, exercises: [] };

  let totalVolume = 0;
  let totalSets = 0;
  let totalReps = 0;
  const muscleVolume: Record<string, number> = {};
  const exercises: ExerciseFact[] = [];

  const plannedExMap = new Map<string, any>();
  if (planned?.strength_exercises) {
    for (const pe of planned.strength_exercises) {
      plannedExMap.set((pe.name ?? "").toLowerCase(), pe);
    }
  }

  for (const ex of exArr) {
    const rawName: string = ex.name ?? "unknown";
    const canon = canonicalize(rawName);
    const mg = muscleGroup(canon);
    const completedSets = Array.isArray(ex.sets)
      ? ex.sets.filter((s: any) => s.completed !== false)
      : (Array.isArray(ex.completed_sets) ? ex.completed_sets.filter((s: any) => s.completed !== false) : []);

    let exVolume = 0;
    let bestWeight = 0;
    let bestReps = 0;
    const rirValues: number[] = [];

    for (const s of completedSets) {
      const w = Number(s.weight) || 0;
      const r = Number(s.reps) || 0;
      exVolume += w * r;
      if (w > bestWeight) { bestWeight = w; bestReps = r; }
      if (w === bestWeight && r > bestReps) { bestReps = r; }
      if (typeof s.rir === "number" && s.rir >= 0) rirValues.push(s.rir);
    }

    const avgRir = rirValues.length > 0
      ? Math.round((rirValues.reduce((a, b) => a + b, 0) / rirValues.length) * 10) / 10
      : null;

    const est1rm = bestWeight > 0 && bestReps > 0
      ? brzycki1RM(bestWeight, bestReps, avgRir ?? 0)
      : 0;

    const plannedEx = plannedExMap.get(rawName.toLowerCase());

    totalVolume += exVolume;
    totalSets += completedSets.length;
    for (const s of completedSets) totalReps += Number(s.reps) || 0;
    muscleVolume[mg] = (muscleVolume[mg] ?? 0) + exVolume;

    exercises.push({
      name: rawName,
      canonical: canon,
      sets_completed: completedSets.length,
      best_weight: bestWeight,
      best_reps: bestReps,
      avg_rir: avgRir,
      volume: exVolume,
      estimated_1rm: est1rm,
      muscle_group: mg,
      ...(plannedEx ? {
        planned_sets: plannedEx.sets,
        planned_reps: typeof plannedEx.reps === "number" ? plannedEx.reps : parseInt(plannedEx.reps) || undefined,
        planned_weight: plannedEx.weight,
      } : {}),
    });
  }

  const dur = durationMinutes(w);
  const density = dur > 0 ? Math.round(totalVolume / dur) : 0;

  return {
    strength_facts: {
      total_volume_lbs: totalVolume,
      total_sets: totalSets,
      total_reps: totalReps,
      exercises: exercises.map(e => ({
        name: e.name,
        canonical: e.canonical,
        sets_completed: e.sets_completed,
        best_weight: e.best_weight,
        best_reps: e.best_reps,
        avg_rir: e.avg_rir,
        volume: e.volume,
        estimated_1rm: e.estimated_1rm,
        ...(e.planned_sets ? { planned_sets: e.planned_sets } : {}),
        ...(e.planned_reps ? { planned_reps: e.planned_reps } : {}),
        ...(e.planned_weight ? { planned_weight: e.planned_weight } : {}),
      })),
      muscle_groups: muscleVolume,
      density_lbs_per_min: density,
    },
    exercises,
  };
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

function computeAdherence(w: WorkoutRow, planned: PlannedRow | null): Record<string, any> | null {
  if (!planned) return null;

  const result: Record<string, any> = {};

  // Duration adherence
  const actualDur = durationMinutes(w);
  const plannedDur = planned.workload_planned ? undefined : undefined;

  // Workload adherence
  if (w.workload_actual && planned.workload_planned && planned.workload_planned > 0) {
    result.workload_pct = Math.round((w.workload_actual / planned.workload_planned) * 100);
  }

  // Execution score from compute-workout-summary
  if (w.computed?.overall?.execution_score != null) {
    result.execution_score = w.computed.overall.execution_score;
  }

  // Interval adherence (from computed.intervals)
  if (w.computed?.intervals && Array.isArray(w.computed.intervals)) {
    const workIntervals = w.computed.intervals.filter(
      (i: any) => i.planned_label && !/(warm|cool|rest|recovery)/i.test(i.planned_label)
    );
    if (workIntervals.length > 0) {
      const avgAdh = workIntervals.reduce((sum: number, i: any) => {
        return sum + (i.adherence_pct ?? i.pace_adherence_pct ?? 100);
      }, 0) / workIntervals.length;
      result.interval_adherence_pct = Math.round(avgAdh);
    }
  }

  // Athlete-provided: weight deviation intentional (strength)
  const meta = w.workout_metadata ?? {};
  if (typeof meta.weight_deviation_intentional === "boolean") {
    result.weight_deviation_intentional = meta.weight_deviation_intentional;
  }
  if (typeof meta.weight_deviation_note === "string" && meta.weight_deviation_note.trim()) {
    result.weight_deviation_note = meta.weight_deviation_note.trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Workload computation (uses shared formulas)
// ---------------------------------------------------------------------------

function computeWorkload(w: WorkoutRow, baselines: Baselines | null): number {
  if (w.workload_actual && w.workload_actual > 0) return w.workload_actual;

  const dur = durationMinutes(w);
  const type = w.type ?? "run";
  const meta = w.workout_metadata ?? {};
  const sessionRPE = meta.session_rpe;

  if (type === "strength") {
    return calculateStrengthWorkload(w.strength_exercises ?? [], sessionRPE);
  }
  if (type === "mobility") {
    return calculateMobilityWorkload(w.mobility_exercises ?? []);
  }
  if (type === "pilates_yoga") {
    return calculatePilatesYogaWorkload(dur, sessionRPE);
  }

  // Cardio: try TRIMP first
  if (w.avg_heart_rate && w.max_heart_rate && dur > 0) {
    const restHR = baselines?.performance_numbers?.resting_heart_rate
      ?? baselines?.learned_fitness?.[type]?.resting_hr ?? 60;
    const trimp = calculateTRIMPWorkload({
      avgHR: w.avg_heart_rate,
      maxHR: w.max_heart_rate,
      restingHR: restHR,
      durationMinutes: dur,
    });
    if (trimp !== null) return trimp;
  }

  // Fallback: duration-based
  const intensity = getDefaultIntensityForType(type);
  return calculateDurationWorkload(dur, intensity);
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
    const { workout_id } = await req.json();
    if (!workout_id) {
      return new Response(JSON.stringify({ error: "workout_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -----------------------------------------------------------------------
    // 1. Read workout
    // -----------------------------------------------------------------------
    const { data: workout, error: wErr } = await supabase
      .from("workouts")
      .select(
        "id, user_id, type, date, duration, moving_time, distance, " +
        "avg_heart_rate, max_heart_rate, avg_pace, avg_power, max_power, normalized_power, " +
        "avg_cadence, elevation_gain, strength_exercises, mobility_exercises, " +
        "workout_metadata, computed, planned_id, workout_status, workload_actual, sensor_data",
      )
      .eq("id", workout_id)
      .maybeSingle();

    if (wErr || !workout) {
      return new Response(
        JSON.stringify({ error: wErr?.message ?? "Workout not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const w = workout as WorkoutRow;

    // -----------------------------------------------------------------------
    // 2. Read baselines
    // -----------------------------------------------------------------------
    const { data: baselinesRow } = await supabase
      .from("user_baselines")
      .select("performance_numbers, learned_fitness, age")
      .eq("user_id", w.user_id)
      .maybeSingle();
    const baselines = (baselinesRow as Baselines | null) ?? null;

    // -----------------------------------------------------------------------
    // 3. Read planned workout (if linked)
    // -----------------------------------------------------------------------
    let planned: PlannedRow | null = null;
    if (w.planned_id) {
      const { data: pw } = await supabase
        .from("planned_workouts")
        .select("id, training_plan_id, week_number, type, intervals, strength_exercises, steps_preset, workload_planned")
        .eq("id", w.planned_id)
        .maybeSingle();
      planned = (pw as PlannedRow | null) ?? null;
    }

    // -----------------------------------------------------------------------
    // 4. Determine discipline
    // -----------------------------------------------------------------------
    const discipline = (w.type ?? "run").toLowerCase();

    // -----------------------------------------------------------------------
    // 5. Compute universal metrics
    // -----------------------------------------------------------------------
    const workload = computeWorkload(w, baselines);
    const sessionRPE = w.workout_metadata?.session_rpe ?? null;
    const readiness = w.workout_metadata?.readiness ?? null;

    // -----------------------------------------------------------------------
    // 6. Compute discipline-specific facts
    // -----------------------------------------------------------------------
    let runFacts: Record<string, any> | null = null;
    let strengthFacts: Record<string, any> | null = null;
    let rideFacts: Record<string, any> | null = null;
    let swimFacts: Record<string, any> | null = null;
    let exerciseRows: ExerciseFact[] = [];

    switch (discipline) {
      case "run":
        runFacts = buildRunFacts(w, baselines);
        break;
      case "ride":
      case "bike":
        rideFacts = buildRideFacts(w, baselines);
        break;
      case "swim":
        swimFacts = buildSwimFacts(w);
        break;
      case "strength": {
        const result = buildStrengthFacts(w, planned);
        strengthFacts = result.strength_facts;
        exerciseRows = result.exercises;
        break;
      }
      default:
        break;
    }

    // -----------------------------------------------------------------------
    // 7. Compute adherence
    // -----------------------------------------------------------------------
    const adherence = computeAdherence(w, planned);

    // -----------------------------------------------------------------------
    // 8. Write workout_facts (UPSERT)
    // -----------------------------------------------------------------------
    const factsRow = {
      workout_id: w.id,
      user_id: w.user_id,
      date: w.date,
      discipline,
      duration_minutes: durationMinutes(w),
      workload,
      session_rpe: sessionRPE,
      readiness,
      plan_id: planned?.training_plan_id ?? null,
      planned_workout_id: w.planned_id,
      adherence,
      run_facts: runFacts,
      strength_facts: strengthFacts,
      ride_facts: rideFacts,
      swim_facts: swimFacts,
      computed_at: new Date().toISOString(),
      version: 1,
    };

    const { error: fErr } = await supabase
      .from("workout_facts")
      .upsert(factsRow, { onConflict: "workout_id" });

    if (fErr) {
      return new Response(
        JSON.stringify({ error: `workout_facts write failed: ${fErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // -----------------------------------------------------------------------
    // 9. Write exercise_log (strength only, DELETE + INSERT)
    // -----------------------------------------------------------------------
    let exercisesWritten = 0;
    if (exerciseRows.length > 0) {
      await supabase.from("exercise_log").delete().eq("workout_id", w.id);

      const elRows = exerciseRows.map((e) => ({
        workout_id: w.id,
        user_id: w.user_id,
        date: w.date,
        exercise_name: e.name,
        canonical_name: e.canonical,
        discipline: "strength",
        sets_completed: e.sets_completed,
        best_weight: e.best_weight,
        best_reps: e.best_reps,
        total_volume: e.volume,
        avg_rir: e.avg_rir,
        estimated_1rm: e.estimated_1rm,
      }));

      const { error: elErr } = await supabase.from("exercise_log").insert(elRows);
      if (elErr) {
        return new Response(
          JSON.stringify({ error: `exercise_log write failed: ${elErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      exercisesWritten = elRows.length;

      // Update learned_fitness.strength_1rms from exercise_log (fire-and-forget)
      updateLearnedStrengthFromExerciseLog(supabase, w.user_id).catch((e) => {
        console.error("[compute-facts] Learned strength update failed:", e?.message ?? e);
      });
    }

    // Fire-and-forget: recompute weekly snapshot for this user
    try {
      const snapshotUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/compute-snapshot`;
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(snapshotUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${svcKey}`,
          "apikey": svcKey,
        },
        body: JSON.stringify({ user_id: w.user_id }),
      }).catch(() => {});
    } catch {}

    return new Response(
      JSON.stringify({
        success: true,
        workout_id: w.id,
        discipline,
        workload,
        facts_written: true,
        exercises_written: exercisesWritten,
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
