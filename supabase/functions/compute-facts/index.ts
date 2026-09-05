/**
 * EDGE FUNCTION: compute-facts
 *
 * Deterministic Layer — Phase 1.
 *
 * Runs on every workout ingest (after calculate-workload).
 * Reads the workout row + planned workout + baselines, then writes:
 *   - workout_facts  (one row per workout)
 *   - exercise_log   (one row per exercise, strength workouts only; includes exercise_id when matched)
 *   - session_load   (load ledger rows; delete+rewrite per workout; failures are non-fatal)
 *
 * No AI, no narratives, no sensor time-series. Pure math.
 *
 * Input:  { workout_id: string }
 * Output: { success: boolean, workout_id, discipline, facts_written, exercises_written }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { extractWarmupEasy } from "../_shared/run-warmup-easy.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  calculateStrengthWorkload,
  strengthSetVolume,
  resolveBodyweightLb,
  calculateMobilityWorkload,
  calculatePilatesYogaWorkload,
  inferIntensityFromPerformance,
  resolveCardioIntensity,
  calculateDurationWorkload,
  getStepsIntensity,
  getDefaultIntensityForType,
  mapRPEToIntensity,
} from "../_shared/workload.ts";
import { assessHrPlausibility, resolveMaxHrCeiling } from "../_shared/hr-plausibility.ts";
// ⛔ ONE FORMULA FOR THE WHOLE APP (D-339). The client's baseline test imports this same module, so
// the number that SETS the working weights and the number that JUDGES the work now agree.
import { estimate1RMRounded, effectiveRepsForReserve } from "../../../src/lib/estimate-1rm.ts";
import { canonicalize, muscleGroup, bigFourLift } from "../_shared/canonicalize.ts";
// [Step 5] One shared gate for band-as-assistance; see src/lib/band-assistance.ts.
import { isBandAssistedMovement } from "../../../src/lib/band-assistance.ts";
// ⛔ The OTHER half of the band question — does a band here ADD load rather than cancel it. Asked of
// the shared TYPE axis so it also answers for `clamshell` / `lateral band walk` (no "band" in name).
import { typeForExercise } from "../../../src/lib/exercise-role.ts";
// THE SAME top-set rule the logger stamps the difficulty tap with — heaviest set, ties to the last.
// Imported, not re-derived: if the two ever disagree the word lands on a different set than the one
// the athlete answered about. (`strength-focus-copy.ts` documents that both runtimes import it.)
import { topSetIndex, type SetDifficulty } from "../../../src/lib/strength-focus-copy.ts";
// ⛔ THE STRENGTH FACT BUILDER LIVES BESIDE THIS FILE, NOT IN IT (2026-08-28) — `serve()` below runs
// at import, so nothing here could ever be driven by a test. Moved verbatim so it can be; see
// `strength-facts-lib.ts`. Same pattern as `recompute-workout/orchestrator-lib.ts`.
import { buildStrengthFacts, aggregateLearnedStrengthMaxes, type ExerciseFact, type LearnedStrengthRow } from "./strength-facts-lib.ts";
import {
  buildRegistryLookup,
  resolveExerciseId,
  type ExerciseRegistryRow,
} from "../_shared/exercise-registry-lookup.ts";
import { rewriteSessionLoad, type ExerciseLogRowForLoad } from "../_shared/session-load.ts";
import { resolveRunScalars } from "../_shared/run/run-scalars.ts";
import { detectSwimEquipment } from "../_shared/swim/swim-equipment.ts";
import { resolveSwimScalars } from "../_shared/swim/swim-scalars.ts";
import { resolveRouteCluster } from "../_shared/route-intelligence.ts";
import { dewPointF } from "../_shared/heat-adjust.ts";
import { resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { resolveCurrentFtp } from "../../../src/lib/resolve-current-ftp.ts";
// Q-169: the ONE definition of "is this heartbeat easy" (threshold-anchored, %max-bootstrapped).
import { resolveRunEasyHrBand, isEasyHr, runEasyPaceEligible } from "../_shared/easy-hr.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkoutRow {
  workout_analysis?: Record<string, any> | null;
  id: string;
  user_id: string;
  type: string;
  date: string;
  timestamp: string | null;
  duration: number | null;
  moving_time: number | null;
  elapsed_time: number | null;
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
  gps_track: any[] | null;
  start_position_lat: number | null;
  start_position_long: number | null;
  weather_data: Record<string, any> | null;
}

interface PlannedRow {
  id: string;
  training_plan_id: string | null;
  week_number: number | null;
  type: string;
  name?: string | null;
  description?: string | null;
  tags?: string[] | null;
  intervals: any[] | null;
  strength_exercises: any[] | null;
  steps_preset: any[] | null;
  workload_planned: number | null;
  computed?: any | null;
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


function isRunDiscipline(type: string | null | undefined): boolean {
  const t = String(type ?? "").toLowerCase();
  return t === "run" || t === "running" || t === "walk" || t.includes("run");
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const aa = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function parseJsonSafe(v: any): any {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

type RouteFeatures = {
  distance_m: number;
  elevation_gain_m: number;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  shape_hint: string;
};

function deriveRouteFeatures(w: WorkoutRow): RouteFeatures {
  const distance_m = Math.round(distanceMeters(w));
  const elevation_gain_m = Math.round(toNum(w.elevation_gain) ?? 0);
  let start_lat = toNum(w.start_position_lat);
  let start_lng = toNum(w.start_position_long);
  let end_lat: number | null = null;
  let end_lng: number | null = null;

  const trackRaw = parseJsonSafe(w.gps_track) ?? [];
  const track = Array.isArray(trackRaw) ? trackRaw : [];
  if (track.length > 0) {
    const first = track[0] || {};
    const last = track[track.length - 1] || {};
    const fLat = toNum(first.lat ?? first.latitude);
    const fLng = toNum(first.lng ?? first.lon ?? first.longitude);
    const lLat = toNum(last.lat ?? last.latitude);
    const lLng = toNum(last.lng ?? last.lon ?? last.longitude);
    if (start_lat == null && fLat != null) start_lat = fLat;
    if (start_lng == null && fLng != null) start_lng = fLng;
    end_lat = lLat;
    end_lng = lLng;
  }

  const shapeHint = (() => {
    if (!track.length) return "";
    const sampleIdx = [0, Math.floor(track.length / 4), Math.floor(track.length / 2), Math.floor((3 * track.length) / 4), track.length - 1];
    const pts: string[] = [];
    for (const i of sampleIdx) {
      const p = track[Math.max(0, Math.min(track.length - 1, i))] || {};
      const lat = toNum(p.lat ?? p.latitude);
      const lng = toNum(p.lng ?? p.lon ?? p.longitude);
      if (lat == null || lng == null) continue;
      pts.push(`${lat.toFixed(3)},${lng.toFixed(3)}`);
    }
    return pts.join("|");
  })();

  return { distance_m, elevation_gain_m, start_lat, start_lng, end_lat, end_lng, shape_hint: shapeHint };
}

function buildRouteFingerprint(f: RouteFeatures): string {
  const distBucket = Math.round(f.distance_m / 200); // 200m bucket
  const elevBucket = Math.round((f.elevation_gain_m || 0) / 10); // 10m bucket
  const sLat = f.start_lat != null ? f.start_lat.toFixed(3) : "na";
  const sLng = f.start_lng != null ? f.start_lng.toFixed(3) : "na";
  const eLat = f.end_lat != null ? f.end_lat.toFixed(3) : "na";
  const eLng = f.end_lng != null ? f.end_lng.toFixed(3) : "na";
  const shape = f.shape_hint ? `|${f.shape_hint}` : "";
  return `d${distBucket}-e${elevBucket}-s${sLat},${sLng}-x${eLat},${eLng}${shape}`;
}

type GpsPoint = {
  lat: number;
  lng: number;
  elevation_m: number | null;
};

type TerrainSegment = {
  segment_type: "flat" | "rolling" | "climb";
  distance_m: number;
  elev_gain_m: number;
  avg_grade_pct: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  start_idx: number;
  end_idx: number;
};

function buildGpsPoints(w: WorkoutRow): GpsPoint[] {
  const raw = parseJsonSafe(w.gps_track);
  const arr = (() => {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray((raw as any).points)) return (raw as any).points;
    if (raw && Array.isArray((raw as any).track)) return (raw as any).track;
    if (raw && Array.isArray((raw as any).samples)) return (raw as any).samples;
    return [];
  })();
  const out: GpsPoint[] = [];
  for (const p of arr) {
    const lat = toNum(
      p?.lat ??
      p?.latitude ??
      p?.position?.lat ??
      p?.coords?.latitude ??
      (Array.isArray(p?.position) ? p.position[0] : null) ??
      (Array.isArray(p) ? p[0] : null)
    );
    const lng = toNum(
      p?.lng ??
      p?.lon ??
      p?.longitude ??
      p?.position?.lng ??
      p?.position?.lon ??
      p?.coords?.longitude ??
      (Array.isArray(p?.position) ? p.position[1] : null) ??
      (Array.isArray(p) ? p[1] : null)
    );
    if (lat == null || lng == null) continue;
    const elevation = toNum(
      p?.elevation ??
      p?.ele ??
      p?.altitude ??
      p?.position?.ele ??
      p?.coords?.altitude
    );
    out.push({ lat, lng, elevation_m: elevation });
  }
  if (out.length > 0) return out;

  // Fallback: derive points from sensor_data samples when gps_track has wrapper/empty payload.
  const sensor = parseJsonSafe(w.sensor_data);
  const samples = Array.isArray(sensor?.samples) ? sensor.samples : (Array.isArray(sensor) ? sensor : []);
  for (const s of samples) {
    const lat = toNum(
      s?.lat ??
      s?.latitude ??
      s?.position?.lat ??
      s?.coords?.latitude
    );
    const lng = toNum(
      s?.lng ??
      s?.lon ??
      s?.longitude ??
      s?.position?.lng ??
      s?.position?.lon ??
      s?.coords?.longitude
    );
    if (lat == null || lng == null) continue;
    const elevation = toNum(s?.elevation ?? s?.ele ?? s?.altitude ?? s?.coords?.altitude);
    out.push({ lat, lng, elevation_m: elevation });
  }
  return out;
}

function classifyTerrainProfile(elevGainM: number, distanceM: number): { terrain_class: "flat" | "rolling" | "hilly" | "mountainous"; elev_gain_per_km: number; confidence: number } {
  const gainPerKm = distanceM > 0 ? (elevGainM / (distanceM / 1000)) : 0;
  if (gainPerKm < 15) return { terrain_class: "flat", elev_gain_per_km: Number(gainPerKm.toFixed(3)), confidence: 0.9 };
  if (gainPerKm < 40) return { terrain_class: "rolling", elev_gain_per_km: Number(gainPerKm.toFixed(3)), confidence: 0.85 };
  if (gainPerKm < 70) return { terrain_class: "hilly", elev_gain_per_km: Number(gainPerKm.toFixed(3)), confidence: 0.85 };
  return { terrain_class: "mountainous", elev_gain_per_km: Number(gainPerKm.toFixed(3)), confidence: 0.8 };
}

function extractTerrainSegments(points: GpsPoint[]): TerrainSegment[] {
  if (points.length < 8) return [];
  const cumDist: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    const dKm = haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    cumDist[i] = cumDist[i - 1] + (dKm * 1000);
  }

  const out: TerrainSegment[] = [];
  let start = 0;
  const targetMinM = 360;
  const targetMaxM = 700;
  while (start < points.length - 3 && out.length < 16) {
    let end = start + 1;
    while (end < points.length && (cumDist[end] - cumDist[start]) < targetMinM) end++;
    if (end >= points.length) break;
    while (end + 1 < points.length && (cumDist[end + 1] - cumDist[start]) <= targetMaxM) end++;

    const distance_m = cumDist[end] - cumDist[start];
    if (distance_m < 220) {
      start = end;
      continue;
    }

    let elev_gain_m = 0;
    for (let i = start + 1; i <= end; i++) {
      const a = points[i - 1].elevation_m;
      const b = points[i].elevation_m;
      if (a == null || b == null) continue;
      const delta = b - a;
      if (delta > 0) elev_gain_m += delta;
    }
    elev_gain_m = Math.max(0, Math.round(elev_gain_m));
    const avg_grade_pct = distance_m > 0 ? Number(((elev_gain_m / distance_m) * 100).toFixed(3)) : 0;

    const segment_type: "flat" | "rolling" | "climb" =
      avg_grade_pct >= 2.0 ? "climb" :
      avg_grade_pct >= 0.6 ? "rolling" :
      "flat";

    out.push({
      segment_type,
      distance_m: Math.round(distance_m),
      elev_gain_m,
      avg_grade_pct,
      start_lat: points[start].lat,
      start_lng: points[start].lng,
      end_lat: points[end].lat,
      end_lng: points[end].lng,
      start_idx: start,
      end_idx: end,
    });
    start = end;
  }

  return out;
}

function segmentFingerprint(s: TerrainSegment): string {
  return [
    s.segment_type,
    `d${Math.round(s.distance_m / 20)}`,
    `g${Math.round(s.elev_gain_m / 2)}`,
    `p${Math.round(s.avg_grade_pct * 10)}`,
    `s${s.start_lat.toFixed(4)},${s.start_lng.toFixed(4)}`,
    `e${s.end_lat.toFixed(4)},${s.end_lng.toFixed(4)}`,
  ].join("|");
}

async function writeWorkoutSegmentMatch(
  supabase: ReturnType<typeof createClient>,
  w: WorkoutRow,
  segmentId: string,
  matchConfidence: number,
): Promise<boolean> {
  // Upsert: minimal columns the schema actually has
  let errA: any = null;
  try {
    const { error } = await supabase
      .from("workout_segment_match")
      .upsert({
        user_id: w.user_id,
        workout_id: w.id,
        segment_id: segmentId,
        match_confidence: matchConfidence,
      }, { onConflict: "workout_id,segment_id", ignoreDuplicates: true });
    if (!error) return true;
    errA = error;
  } catch (e) { errA = e; }

  // Insert fallback — treat duplicate as success
  let errB: any = null;
  try {
    const { error } = await supabase
      .from("workout_segment_match")
      .insert({
        user_id: w.user_id,
        workout_id: w.id,
        segment_id: segmentId,
        match_confidence: matchConfidence,
      });
    if (!error || String(error.code) === '23505') return true;
    errB = error;
  } catch (e) { errB = e; }

  console.error("[compute-facts] workout_segment_match write failed:", {
    segment_id: segmentId,
    errA: errA?.message ?? errA,
    errB: errB?.message ?? errB,
  });
  return false;
}

async function writeSegmentProgressMetric(
  supabase: ReturnType<typeof createClient>,
  w: WorkoutRow,
  payload: Record<string, any>,
): Promise<void> {
  // D-059 / Q-022 — column-name + error-surfacing fix (2026-05-25).
  // Pre-fix: payload used `grade_adjusted_pace_sec_per_km`, `avg_pace_sec_per_km`,
  // and `metric_date` — the real `segment_progress_metrics` columns are
  // `grade_adjusted_pace_s_per_km`, `avg_pace_s_per_km`, and no metric_date
  // column exists. PostgREST returned 42703 column-does-not-exist and the
  // three-variant try/catch swallowed it silently — table hadn't been
  // written to since ~2026-03-01. Columns are now corrected at the caller
  // (line ~656); this helper just inserts what it's given and now LOGS
  // errors instead of eating them.
  // Variant A: upsert with composite key.
  try {
    const { error: errA } = await supabase
      .from("segment_progress_metrics")
      .upsert(payload, { onConflict: "segment_id,workout_id" });
    if (!errA) return;
    console.warn("[compute-facts] segment_progress_metrics upsert (Variant A) failed", {
      message: errA.message,
      code: (errA as any).code,
      details: (errA as any).details,
      workout_id: w.id,
      segment_id: payload.segment_id,
    });
  } catch (e) {
    console.warn("[compute-facts] segment_progress_metrics upsert (Variant A) threw", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
  // Variant B: insert (older schema without unique key).
  try {
    const { error: errB } = await supabase
      .from("segment_progress_metrics")
      .insert(payload);
    if (!errB) return;
    console.warn("[compute-facts] segment_progress_metrics insert (Variant B) failed", {
      message: errB.message,
      code: (errB as any).code,
    });
  } catch (e) {
    console.warn("[compute-facts] segment_progress_metrics insert (Variant B) threw", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
  // Variant C — minimal shape using the canonical column names from the
  // live schema. No metric_date (column doesn't exist on this table; the
  // sibling route_progress_metrics DOES have one, hence the historical
  // confusion). Uses `_s_per_km` suffix, not `_sec_per_km`.
  const minimal = {
    workout_id: w.id,
    segment_id: payload.segment_id,
    avg_pace_s_per_km: payload.avg_pace_s_per_km ?? null,
    confidence_score: payload.confidence_score ?? null,
  };
  const { error: errC } = await supabase.from("segment_progress_metrics").insert(minimal);
  if (errC) {
    console.warn("[compute-facts] segment_progress_metrics insert (Variant C minimal) failed", {
      message: errC.message,
      code: (errC as any).code,
    });
  }
}

async function upsertTerrainIntelligence(
  supabase: ReturnType<typeof createClient>,
  w: WorkoutRow,
  runFacts: Record<string, any> | null,
): Promise<{ extracted: number; matched: number; created_segments: number; failed_segment_inserts: number; failed_match_writes: number; last_error: string | null }> {
  if (!isRunDiscipline(w.type)) return { extracted: 0, matched: 0, created_segments: 0, failed_segment_inserts: 0, failed_match_writes: 0, last_error: null };
  if (String(w.workout_status || "").toLowerCase() !== "completed") return { extracted: 0, matched: 0, created_segments: 0, failed_segment_inserts: 0, failed_match_writes: 0, last_error: null };

  const points = buildGpsPoints(w);
  if (points.length < 8) return { extracted: 0, matched: 0, created_segments: 0, failed_segment_inserts: 0, failed_match_writes: 0, last_error: null };

  const distM = distanceMeters(w);
  const elevGainM = Number(toNum(w.elevation_gain) ?? toNum(runFacts?.elevation_gain_m) ?? 0);
  const profile = classifyTerrainProfile(Math.max(0, elevGainM), Math.max(1, distM));
  try {
    await supabase
      .from("workout_terrain_profile")
      .upsert({
        user_id: w.user_id,
        workout_id: w.id,
        terrain_class: profile.terrain_class,
        elev_gain_per_km: profile.elev_gain_per_km,
        classification_confidence: profile.confidence,
      }, { onConflict: "workout_id" });
  } catch {
    // Fallback for schema variants
    await supabase
      .from("workout_terrain_profile")
      .upsert({
        workout_id: w.id,
        terrain_class: profile.terrain_class,
        elev_gain_per_km: profile.elev_gain_per_km,
        classification_confidence: profile.confidence,
      }, { onConflict: "workout_id" });
  }

  const extracted = extractTerrainSegments(points);
  if (!extracted.length) return { extracted: 0, matched: 0, created_segments: 0, failed_segment_inserts: 0, failed_match_writes: 0, last_error: null };

  const touchedSegmentIds = new Set<string>();
  let createdSegments = 0;
  let failedSegmentInserts = 0;
  let failedMatchWrites = 0;
  let lastError: string | null = null;
  const metricDate = String(w.date || "").slice(0, 10);
  const avgPaceSecPerKm = toNum(runFacts?.pace_avg_s_per_km);
  const avgHr = toNum(runFacts?.hr_avg);
  const avgPower = toNum(w.avg_power);
  const avgCadence = toNum(w.avg_cadence);

  for (const seg of extracted) {
    const corridorKm = 0.07; // 70m corridor tolerance
    let candidates: any[] = [];
    try {
      const { data } = await supabase
        .from("terrain_segments")
        .select("id,distance_m,elev_gain_m,avg_grade_pct,start_lat,start_lng,end_lat,end_lng,sample_count")
        .eq("user_id", w.user_id)
        .gte("distance_m", Math.max(120, seg.distance_m * 0.65))
        .lte("distance_m", seg.distance_m * 1.35)
        .limit(60);
      candidates = Array.isArray(data) ? data : [];
    } catch {
      const { data } = await supabase
        .from("terrain_segments")
        .select("id,distance_m,elev_gain_m,avg_grade_pct,sample_count")
        .limit(60);
      candidates = Array.isArray(data) ? data : [];
    }

    const scored = candidates.map((c: any) => {
      const cStartLat = toNum(c.start_lat);
      const cStartLng = toNum(c.start_lng);
      const cEndLat = toNum(c.end_lat);
      const cEndLng = toNum(c.end_lng);
      const hasGeo = cStartLat != null && cStartLng != null && cEndLat != null && cEndLng != null;

      const dist = toNum(c.distance_m) ?? seg.distance_m;
      const grade = toNum(c.avg_grade_pct) ?? seg.avg_grade_pct;
      const distScore = Math.max(0, 1 - Math.abs(seg.distance_m - dist) / Math.max(120, seg.distance_m * 0.25));
      const gradeScore = Math.max(0, 1 - Math.abs(seg.avg_grade_pct - grade) / 1.8);
      if (!hasGeo) {
        // Schema variant without geo columns: score by distance/grade only.
        return { c, score: (0.75 * distScore) + (0.25 * gradeScore) };
      }
      const startKm = haversineKm(seg.start_lat, seg.start_lng, cStartLat!, cStartLng!);
      const endKm = haversineKm(seg.end_lat, seg.end_lng, cEndLat!, cEndLng!);
      const revStartKm = haversineKm(seg.start_lat, seg.start_lng, cEndLat!, cEndLng!);
      const revEndKm = haversineKm(seg.end_lat, seg.end_lng, cStartLat!, cStartLng!);
      const direct = startKm <= corridorKm && endKm <= corridorKm;
      const reverse = revStartKm <= corridorKm && revEndKm <= corridorKm;
      if (!direct && !reverse) return { c, score: -1 };
      const corridorScore = direct
        ? Math.max(0, 1 - ((startKm + endKm) / (2 * corridorKm)))
        : Math.max(0, 1 - ((revStartKm + revEndKm) / (2 * corridorKm)));
      return { c, score: (0.5 * corridorScore) + (0.3 * distScore) + (0.2 * gradeScore) };
    }).filter((x: any) => x.score >= 0).sort((a: any, b: any) => b.score - a.score);

    let segmentId: string | null = null;
    let matchConfidence = 0.0;
    if (scored.length && scored[0].score >= 0.58) {
      segmentId = String(scored[0].c.id);
      matchConfidence = Number(scored[0].score.toFixed(4));
    } else {
      const fp = segmentFingerprint(seg);
      try {
        const basePayloadMinimal = {
          user_id: w.user_id,
          distance_m: seg.distance_m,
          elev_gain_m: seg.elev_gain_m,
          avg_grade_pct: seg.avg_grade_pct,
          sample_count: 0,
        } as Record<string, any>;
        const geoPayload = {
          start_lat: seg.start_lat,
          start_lng: seg.start_lng,
          end_lat: seg.end_lat,
          end_lng: seg.end_lng,
        };

        let createdId: string | null = null;

        // Upsert with fingerprint — if segment already exists, returns existing ID
        try {
          const { data, error } = await supabase
            .from("terrain_segments")
            .upsert({
              ...basePayloadMinimal,
              ...geoPayload,
              fingerprint: fp,
              polyline_hash: fp,
            }, { onConflict: "user_id,fingerprint" })
            .select("id")
            .single();
          if (error) throw error;
          if (data?.id) createdId = String(data.id);
        } catch (eA) {
          // Fallback: upsert without polyline_hash for schemas that only have fingerprint
          try {
            const { data, error } = await supabase
              .from("terrain_segments")
              .upsert({
                ...basePayloadMinimal,
                ...geoPayload,
                fingerprint: fp,
              }, { onConflict: "user_id,fingerprint" })
              .select("id")
              .single();
            if (error) throw error;
            if (data?.id) createdId = String(data.id);
          } catch (eB) {
            failedSegmentInserts += 1;
            lastError = (eB as any)?.message ?? String(eB);
            console.error("[compute-facts] terrain segment upsert failed:", {
              workout_id: w.id,
              segment_type: seg.segment_type,
              distance_m: seg.distance_m,
              elev_gain_m: seg.elev_gain_m,
              err_a: (eA as any)?.message ?? String(eA),
              err_b: (eB as any)?.message ?? String(eB),
            });
          }
        }

        if (createdId) {
          segmentId = createdId;
          matchConfidence = 1.0;
          createdSegments += 1;
        } else {
          failedSegmentInserts += 1;
        }
      } catch (insertErr) {
        failedSegmentInserts += 1;
        lastError = (insertErr as any)?.message ?? String(insertErr);
        console.error("[compute-facts] unexpected terrain segment insert wrapper error:", insertErr);
      }
    }

    if (!segmentId) continue;
    touchedSegmentIds.add(segmentId);

    const matchWritten = await writeWorkoutSegmentMatch(supabase, w, segmentId, matchConfidence);
    if (!matchWritten) {
      failedMatchWrites += 1;
      console.error("[compute-facts] failed writing workout_segment_match", { workout_id: w.id, segment_id: segmentId });
      continue;
    }

    const segDistM = Math.max(1, seg.distance_m);
    const estMovingTimeS = Math.max(1, Math.round((durationMinutes(w) * 60) * (segDistM / Math.max(1, distM))));
    const segPaceSecPerKm = avgPaceSecPerKm != null ? Number((avgPaceSecPerKm * (1 + (seg.avg_grade_pct / 100) * 0.12)).toFixed(1)) : null;
    const gradeAdjusted = segPaceSecPerKm != null ? Number((segPaceSecPerKm * (1 - Math.min(0.2, seg.avg_grade_pct / 1000))).toFixed(1)) : null;
    const vam = seg.elev_gain_m > 0 ? Math.round((seg.elev_gain_m / Math.max(1, estMovingTimeS)) * 3600) : null;
    const effortScore = (() => {
      // estimate-ok: segment effort-score heuristic (0–100 display sort key), not a load/verdict
      const hrScore = avgHr != null ? Math.min(100, Math.max(0, (avgHr - 90) * 0.9)) : 45;
      const gradeScore = Math.min(30, seg.avg_grade_pct * 8);
      return Math.round(Math.min(100, hrScore + gradeScore));
    })();

    // D-059 / Q-022 — column names corrected to match the live schema:
    //   `_s_per_km` suffix (not `_sec_per_km`); `metric_date` column does
    //   not exist on segment_progress_metrics (sibling route_progress_metrics
    //   has it — easy to confuse). Errors now surface via console.warn in
    //   the helper instead of being eaten by try/catch.
    await writeSegmentProgressMetric(supabase, w, {
      user_id: w.user_id,
      segment_id: segmentId,
      workout_id: w.id,
      segment_type: seg.segment_type,
      moving_time_s: estMovingTimeS,
      distance_m: segDistM,
      elev_gain_m: seg.elev_gain_m,
      avg_grade_pct: seg.avg_grade_pct,
      avg_hr_bpm: avgHr,
      avg_power_w: avgPower,
      avg_cadence_spm: avgCadence,
      avg_pace_s_per_km: segPaceSecPerKm,
      grade_adjusted_pace_s_per_km: gradeAdjusted,
      vam_m_per_h: vam,
      hr_drift_pct: toNum(runFacts?.hr_drift_pct),
      effort_score: effortScore,
      confidence_score: matchConfidence,
    });
  }

  if (touchedSegmentIds.size > 0) {
    const ids = Array.from(touchedSegmentIds);
    const map = new Map<string, number>();
    let counted = false;
    try {
      const { data: counts } = await supabase
        .from("workout_segment_match")
        .select("segment_id")
        .in("segment_id", ids);
      for (const row of (counts ?? [])) {
        const sid = String((row as any).segment_id || "");
        if (!sid) continue;
        map.set(sid, (map.get(sid) ?? 0) + 1);
      }
      counted = true;
    } catch {}
    if (!counted) {
      const { data: counts2 } = await supabase
        .from("workout_segment_match")
        .select("terrain_segment_id")
        .in("terrain_segment_id", ids);
      for (const row of (counts2 ?? [])) {
        const sid = String((row as any).terrain_segment_id || "");
        if (!sid) continue;
        map.set(sid, (map.get(sid) ?? 0) + 1);
      }
    }
    for (const sid of ids) {
      await supabase
        .from("terrain_segments")
        .update({ sample_count: map.get(sid) ?? 0 })
        .eq("id", sid);
    }
  }

  return {
    extracted: extracted.length,
    matched: touchedSegmentIds.size,
    created_segments: createdSegments,
    failed_segment_inserts: failedSegmentInserts,
    failed_match_writes: failedMatchWrites,
    last_error: lastError,
  };
}

async function upsertRouteIntelligence(
  supabase: ReturnType<typeof createClient>,
  w: WorkoutRow,
  runFacts: Record<string, any> | null,
): Promise<void> {
  // Route IDENTITY now covers runs AND rides (Michael) — "same route Nx" works for both. The run-only
  // efficiency metrics (route_progress_metrics) below stay gated to runs via `isRun`.
  const isRun = isRunDiscipline(w.type);
  const rideType = String(w.type || "").toLowerCase();
  if (!isRun && !(rideType === "ride" || rideType === "bike" || rideType === "cycling" || rideType === "virtualride")) return;
  if (String(w.workout_status || "").toLowerCase() !== "completed") return;

  // Route identity + idempotent count via the ONE shared implementation (also used by backfill-routes).
  const resolved = await resolveRouteCluster(supabase, w as any);
  if (!resolved) return;
  const { cluster, matchConfidence, fingerprint, features } = resolved;

  // Run-only efficiency metrics (route_progress_metrics). Rides get cluster identity above but not this
  // (ride "efficiency" is power-based — a separate follow-on).
  if (isRun) {
  const metricDate = String(w.date || "").slice(0, 10);
  // Q-054 Fix 2 — plausibility clamp at the WRITE site (mirrors the spine read-guard, 150–750
  // s/km). A garbage provider pace (path A: overall.avg_pace_s_per_mi × 0.621) or any OOB value
  // never persists → the read-side guards become a backstop, not load-bearing. Out-of-band → null.
  const plausiblePace = (v: number | null): number | null =>
    v != null && v >= 150 && v <= 750 ? v : null;
  const paceSecPerKm = plausiblePace(toNum(runFacts?.pace_avg_s_per_km));
  // Q-054 Fix 1 — avgHr ≤ 0 is missing, not a real 0 (the GAP=0 collapse). HR absent →
  // effort_adjusted is null (raw pace stands), NEVER 0.
  const avgHrRaw = toNum(runFacts?.hr_avg);
  const avgHr = avgHrRaw != null && avgHrRaw > 0 ? avgHrRaw : null;
  // D-237: no fabricated threshold HR. Absent → effort-adjustment is skipped below (raw pace
  // stands via the refHr > 0 guard), never HR-normalized against a guessed threshold.
  const refHr = toNum((w.workout_metadata as any)?.readiness?.threshold_hr);
  const effortAdjusted = plausiblePace(
    paceSecPerKm != null && avgHr != null && refHr > 0
      ? Math.round((paceSecPerKm * (avgHr / refHr)) * 10) / 10
      : null,
  );
  const consistency = (() => {
    const drift = toNum(runFacts?.hr_drift_pct);
    if (drift == null) return null;
    return Math.max(0, Math.min(100, Math.round(100 - Math.abs(drift) * 8)));
  })();

  // Conditions for the heat de-confound (Familiar Routes, docs/DESIGN-familiar-routes.md §4).
  // Read temp/humidity off the workout's weather_data; derive dew point (the heat-stress variable)
  // at write time so downstream never re-derives it. Absent/unknown → null, never a fabricated 0.
  const wd = (w.weather_data ?? {}) as Record<string, any>;
  const tempF = toNum(wd.temperature);
  const humidityPct = toNum(wd.humidity);
  const dewF = dewPointF(tempF, humidityPct);

  const { data: prevRows } = await supabase
    .from("route_progress_metrics")
    .select("effort_adjusted_pace_sec_per_km")
    .eq("user_id", w.user_id)
    .eq("route_cluster_id", cluster.id)
    .lt("metric_date", metricDate)
    .order("metric_date", { ascending: false })
    .limit(8);
  const prevVals = (Array.isArray(prevRows) ? prevRows : [])
    .map((r: any) => toNum(r.effort_adjusted_pace_sec_per_km))
    .filter((n: number | null): n is number => n != null);
  const baseline = prevVals.length ? (prevVals.reduce((a, b) => a + b, 0) / prevVals.length) : null;
  const improvement = (baseline != null && effortAdjusted != null && baseline > 0)
    ? Number((((baseline - effortAdjusted) / baseline) * 100).toFixed(3))
    : null;

  await supabase
    .from("route_progress_metrics")
    .upsert({
      user_id: w.user_id,
      route_cluster_id: cluster.id,
      workout_id: w.id,
      metric_date: metricDate,
      // ⛔ THE SAME LABEL, WRITTEN WHERE THE DECOUPLING READ ACTUALLY LOOKS (2026-07-30).
      //
      // `classifyRunIntent` fixed the EFFICIENCY series by writing `run_facts.workout_type`. The
      // heart-rate response row reads a different substrate — `route_progress_metrics.workout_intent`
      // — and this line sourced it from `computed.analysis.heart_rate.workout_type`, which is null on
      // every run. So the efficiency chart came back to life and the heart-rate row stayed frozen on
      // a July 14 reading, which is exactly what Michael saw ten minutes after the first fix shipped.
      //
      // ⚠️ ONE CLASSIFIER, TWO SUBSTRATES. Do not add a second rule here — if the intent needs to
      // change, change `classifyRunIntent` and both follow.
      workout_intent:
        (w.computed as any)?.analysis?.heart_rate?.workout_type
        ?? (runFacts as any)?.workout_type
        ?? null,
      moving_time_s: Math.max(0, Math.round(durationMinutes(w) * 60)),
      elapsed_time_s: Math.max(0, Math.round(durationMinutes(w) * 60)),
      distance_m: features.distance_m,
      elevation_gain_m: features.elevation_gain_m,
      avg_hr_bpm: avgHr,
      avg_pace_sec_per_km: paceSecPerKm,
      effort_adjusted_pace_sec_per_km: effortAdjusted,
      decoupling_pct: toNum(runFacts?.hr_drift_pct),
      temp_f: tempF,
      humidity_pct: humidityPct,
      dew_point_f: dewF,
      consistency_score: consistency,
      improvement_score: improvement,
      confidence_score: Number(matchConfidence.toFixed(4)),
      metadata: {
        fingerprint,
      },
    }, { onConflict: "workout_id" }); // one row per WORKOUT (not per cluster) — a re-clustered run UPDATES its
    // single row instead of inserting a twin. Matches the fitness-baselines duplicate fix (2026-07-17): the
    // schema now has UNIQUE(workout_id), so this conflict target is honored and re-analysis can't double-write.
  }
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
      .select("canonical_name, estimated_1rm, best_reps, date, avg_rir")
      .eq("user_id", userId)
      .gte("date", fromDate)
      .in("canonical_name", STRENGTH_ANCHORS);

    if (!rows?.length) return;

    // ⛔ TRUSTED REPS ONLY + D-118 RIR preference — the pure `aggregateLearnedStrengthMaxes`
    // (strength-facts-lib.ts) owns this so a test pins it to real sets. The trusted-reps gate is why
    // his learned deadlift is 185 (the 105×35 conditioning set can no longer store a fake 225); the
    // RIR preference-with-fallback (prefer avg_rir ≤4 / no RIR, fall back to ≥5 flagged low-conf) is
    // unchanged. See the function for the full reasoning.
    const agg = aggregateLearnedStrengthMaxes(rows as LearnedStrengthRow[], STRENGTH_ANCHORS);

    const strength_1rms: Record<string, LearnedMetric & { last_logged: string }> = {};
    for (const lift of STRENGTH_ANCHORS) {
      const a = agg[lift];
      if (!a) continue;
      strength_1rms[lift] = {
        value: a.value,
        // Only-RIR≥5 fallback estimates are flagged low-confidence (D-118).
        confidence: a.usedFallback ? "low" : confidenceFromSamples(a.sample_count),
        source: "exercise_log",
        sample_count: a.sample_count,
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

/**
 * ⛔ WHAT A RUN WAS FOR — the plan first, the data second, silence third.
 *
 * The words are the vocabulary `state-trend/run.ts` already filters on (`DECOUPLING_NONSTEADY`), so
 * this writes into an existing contract rather than inventing a taxonomy beside it.
 *
 * ⚠️ ORDER MATTERS. A hill session run slowly still IS a hill session; the plan knows that and the
 * data does not. Only when there is no plan link do we read structure off the file.
 * ⚠️ AND `null` IS A REAL ANSWER. An unattached, unstructured run stays excluded from the steady read
 * rather than being guessed into it — the same failure direction the gate already chose.
 */
function classifyRunIntent(w: WorkoutRow, planned?: PlannedRow | null, thresholdHrBpm?: number | null, avgHrBpm?: number | null): string | null {
  // `quality` / `hard` added 2026-09-02: the race generators name the session "Quality Run" and the
  // standing plan names it "Hard Run" (session-vocabulary.ts) — neither was in this list.
  const NONSTEADY = /interval|repeat|hill|tempo|threshold|vo2|speed|track|fartlek|stride|race|surge|quality|hard/i;
  const STEADY = /easy|long|lsd|recovery|base|aerobic|steady|shakeout|conversational/i;
  /**
   * ⛔ THE LONG RUN IS ITS OWN WORD NOW (2026-08-28, work order item 2).
   *
   * It used to collapse into `easy`, which was harmless while the efficiency read applied a
   * 70-minute ceiling — the long run never reached the metric to be mis-grouped. **The ceiling is
   * gone** (Michael: *"it shouldn't cap at 70, that's crucial for marathon trainers"*), so the long
   * run now trends beside 27-minute easy runs unless it is separable. `runSessionGroup` in
   * `state-trend/run.ts` reads this word to compare long runs to other long runs.
   *
   * ⛔ NAME-DERIVED, NEVER DURATION-DERIVED, and the app already had this pattern: `isLongRunLike`
   * (`session-detail/race-readiness-llm.ts`) reads the planned name for the same fact. A minutes
   * threshold is precisely what item 2 deleted; re-adding one as a grouping key smuggles it back.
   * ⚠️ SO IT IS FORWARD-ONLY. Rows written before today say `easy` on long runs and will group as
   * easy until re-computed. That is a thinner long-run pool at first, never a wrong one.
   */
  const LONG = /long|lsd|marathon\s*prep|endurance\s*run/i;
  const steadyWord = (text: string): string => (LONG.test(text) ? 'long' : 'easy');

  // 0. THE PLAN'S OWN TAG (2026-09-02). A standing-plan session carries `family:run_<family>` in
  //    `tags` (`session-vocabulary.ts`), which is the plan naming the session type outright — no
  //    word-matching needed. Read it first. Families are the book's (endurance-library/types.ts):
  //    sprint_power / mlss / near_threshold = hard; lsd = long; vt1 = easy.
  const tagList = Array.isArray(planned?.tags) ? planned!.tags!.map((t) => String(t).toLowerCase()) : [];
  const familyTag = tagList.find((t) => t.startsWith('family:run_'));
  if (familyTag) {
    const fam = familyTag.slice('family:'.length);
    if (fam === 'run_sprint_power' || fam === 'run_mlss' || fam === 'run_near_threshold') return 'interval';
    if (fam === 'run_lsd') return 'long';
    if (fam === 'run_vt1') return 'easy';
  }

  // 1. THE PLAN'S WORDS (race plans and older rows without a family tag).
  const planText = [
    planned?.name,
    Array.isArray(planned?.tags) ? planned!.tags!.join(' ') : null,
    planned?.description,
  ].filter(Boolean).join(' ');
  if (planText) {
    if (NONSTEADY.test(planText)) return 'interval';
    if (STEADY.test(planText)) return steadyWord(planText);
  }

  // 2. THE GRADER — for a run with NO plan word (2026-09-04, Michael: "can't we grade it? it should be obvious
  //    what it is"). Garmin grades every activity from the recording; so do we, from two sourced reads:
  //    the analyser's interval detection, and Friel's heart-rate zones of threshold HR — zone 3 and above
  //    (≥ 90% LTHR) is a hard session, zones 1–2 are easy. This replaces the 2026-09-02 "no plan word → easy"
  //    default, which filed unlinked hard runs (Aug 28: 16 × 0.1 mi at 144 bpm on a 152 LTHR) as easy and
  //    dragged the easy row to 12:44/mi. No name-matching on the athlete's own titles.
  // 2026-09-04: read the LIVE detector — `workout_analysis.classified_type`, the one the analyser writes on
  // every run (intervals / hill_repeats / tempo / steady_state / easy) from interval structure + name.
  // It was reading `computed.analysis.heart_rate.workout_type`, an older sibling path never written, so
  // the interval rung never fired and only the heart-rate test below did any work. Same auto-detection
  // every commercial app runs (Garmin / Strava / TrainingPeaks find repeated efforts); we already compute it.
  const detected = String((w as any)?.workout_analysis?.classified_type ?? (w.computed as any)?.analysis?.heart_rate?.workout_type ?? '').toLowerCase();
  if (detected === 'intervals' || detected === 'hill_repeats' || detected === 'tempo' || detected === 'threshold' || detected === 'vo2' || detected === 'speed') return 'interval';
  // the resolved average (the same number the facts row prints); the column is null on some imports
  const avgHr = toNum(avgHrBpm) ?? toNum(w.avg_heart_rate);
  if (avgHr != null && thresholdHrBpm != null && thresholdHrBpm > 0) {
    // 90% LTHR is FRIEL'S run-zone boundary, not a number of ours: his run zones put Z2 (aerobic/easy)
    // at 85-89% LTHR and Z3 (tempo/threshold) at 90-94% — the same zone table `workload.ts` reads for
    // the HR TSS estimate. At/above Z3 = a hard effort, below = easy. Source: Friel run heart-rate zones.
    return avgHr / thresholdHrBpm >= 0.90 ? 'interval' : 'easy';
  }
  // No plan word, no interval detection, no heart rate against a threshold: nothing to grade with → null,
  // and `runSessionGroup` files it as easy (unchanged).
  return null;
}

function buildRunFacts(w: WorkoutRow, baselines: Baselines | null, planned?: PlannedRow | null): Record<string, any> {
  const dist = distanceMeters(w);
  const dur = durationMinutes(w);
  const overall = w.computed?.overall ?? {};
  const analysis = w.computed?.analysis ?? {};

  // D-185: pace + HR via the ONE run resolver (resolveRunScalars) so facts == card == narrative. The
  // resolver delegates to the same guarded/reconciled primitives the narrative fact-packet uses
  // (resolveOverallPaceSecPerMi + getOverallAvgHr — the latter is the Q-054/D-112 zero-not-null guard:
  // a 0 HR is MISSING, never propagated so it can't collapse downstream GAP/effort-adjusted to 0).
  const runScalars = resolveRunScalars(w);
  const paceAvg = runScalars.paceSecPerKm;

  const facts: Record<string, any> = {
    distance_m: Math.round(dist),
    pace_avg_s_per_km: paceAvg,
    hr_avg: runScalars.avgHr,
    elevation_gain_m: w.elevation_gain ?? null,
  };

  const hrZoneData = analysis.zones?.hr;
  if (hrZoneData?.bins && Array.isArray(hrZoneData.bins)) {
    const timeInZone: Record<string, number> = {};
    for (const b of hrZoneData.bins) {
      timeInZone[`z${(b.i ?? 0) + 1}`] = Math.round(b.t_s ?? 0);
    }
    facts.time_in_zone = timeInZone;
  } else if (Array.isArray(hrZoneData)) {
    const timeInZone: Record<string, number> = {};
    for (const z of hrZoneData) {
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

  // ── Pace at easy HR (aerobic efficiency proxy) — Q-169 ────────────────────────────────────────
  // THE DEAD LOOKUP THIS FIXES. This block used to read `learned_fitness.running.threshold_hr` — a
  // NESTED path that has never existed (`learned_fitness` has no `running` object; threshold HR lives
  // at TOP-LEVEL `run_threshold_hr.value`). Its fallback, `performance_numbers.threshold_heart_rate`,
  // is also absent. So `thresholdHR` was `undefined`, this block NEVER EXECUTED, and `pace_at_easy_hr`
  // was null on 147 of 147 runs — while `efficiency_index` (the very next block, same sensor samples)
  // computed fine on 146. That null starved compute-snapshot -> athlete_snapshot.run_easy_pace_at_hr
  // (which D-239 then correctly hard-nulled to stop persisting garbage) -> the D-033 pace reconciler's
  // OBSERVED side, which is the machine that notices an athlete has detrained. One wrong field path.
  //
  // The gate is now the ONE shared easy-HR band (`_shared/easy-hr.ts`) — threshold-anchored (Friel Z2,
  // <=89% LTHR), %max-bootstrapped when no threshold exists, and honestly null when neither is known.
  // The old sample gate was `thresholdHR * 0.78` (= 118 bpm for a 151 LTHR) — so even with the path
  // fixed it would have captured only WARM-UP samples and reported a misleadingly slow pace. Replacing
  // no-data with wrong-data is worse than the bug; the threshold moved with the anchor.
  //
  // Q-171 — THE RUN-LEVEL GATE. The block above used to qualify only SAMPLES, on EVERY run, behind a
  // 10-SAMPLE floor. So an interval/tempo session's warm-up (in-band HR, slow) and the HR-lag opening of
  // each hard rep (HR not caught up, pace already fast) both wrote a "pace at easy HR" for a HARD
  // workout — and that number feeds the D-033 reconciler that sets the plan's easy pace. The run now
  // qualifies the WHOLE RUN with the SAME predicate the baseline learner uses, so the reconciler's two
  // sides finally measure one population (`_shared/easy-hr.ts` -> `runEasyPaceEligible`).
  const easyBand = resolveRunEasyHrBand(
    baselines?.learned_fitness,
    baselines?.performance_numbers?.threshold_heart_rate,
  );
  const samples: any[] = Array.isArray(w.sensor_data?.samples) ? w.sensor_data.samples : [];
  if (easyBand.ceiling != null && samples.length > 0) {
    const easySamples = samples.filter((s: any) => {
      const hr = s.heartRate ?? s.heart_rate;
      return isEasyHr(hr, easyBand) === true && (s.speedMetersPerSecond ?? 0) > 0.5;
    });
    // Dwell in SECONDS, with the sample cadence derived from THIS run — Garmin smart-recording is not
    // 1 Hz, so a raw sample count would mean different amounts of time on different files.
    const sampleIntervalS = dur > 0 ? (dur * 60) / samples.length : 1;
    const inBandSeconds = easySamples.length * sampleIntervalS;

    // hr_avg is the D-185 resolved scalar (null when HR is corrupt) — never the raw column.
    if (runEasyPaceEligible(facts.hr_avg, dur, inBandSeconds, easyBand)) {
      const avgSpeed = easySamples.reduce((sum: number, s: any) => sum + (s.speedMetersPerSecond ?? 0), 0) / easySamples.length;
      if (avgSpeed > 0) {
        facts.pace_at_easy_hr = Math.round(1000 / avgSpeed);
        // Law 3: the anchor's confidence travels with the number, so a %max-bootstrapped read is never
        // mistaken for a threshold-anchored one downstream.
        facts.pace_at_easy_hr_anchor = easyBand.anchor;
        facts.pace_at_easy_hr_confidence = easyBand.confidence;
      }
    }
  }

  // Efficiency index: pace/HR ratio (lower pace number = faster, higher ratio = better)
  //
  // ⛔ WHAT WAS THIS RUN FOR? Read from the PLAN it is attached to (2026-07-30).
  //
  // `state-trend/run.ts` restricts the efficiency and decoupling reads to STEADY aerobic efforts —
  // correctly, and it is the field standard: TrainingPeaks requires a sustained steady effort over
  // 20 minutes, fully aerobic, low variability, or the number is not valid. But its gate is
  // `isSteadyAerobic(workout_type)`, and `workout_type` was NEVER WRITTEN. `String(null)` is empty,
  // the gate returns false, and EVERY run was excluded. Michael's heart-rate row sat on a July 14
  // reading, in red, for sixteen days — a built, cited, tested reader with no input at all.
  //
  // ⛔ THE PLAN IS THE SOURCE, NOT THE DATE. Intervals.icu does exactly this: *"When an activity is
  // paired with a planned workout, any tags from the workout are added to the activity."* Keying off
  // the LINK rather than the calendar is what makes it survive an athlete moving a session, or a
  // plan being rebuilt around them — both of which happened to Michael today.
  //
  // ⚠️ UNATTACHED RUNS FALL BACK TO THE DATA, and to `null` when even that cannot tell. Null keeps
  // today's behaviour exactly: excluded from the steady read rather than guessed into it.
  if (facts.pace_avg_s_per_km && facts.hr_avg && facts.hr_avg > 0) {
    facts.efficiency_index = Math.round((1000 / facts.pace_avg_s_per_km) / facts.hr_avg * 10000) / 100;
  }

  facts.workout_type = classifyRunIntent(w, planned, resolveCurrentLthr({ learned_fitness: baselines?.learned_fitness, performance_numbers: baselines?.performance_numbers } as any)?.bpm ?? null, runScalars.avgHr ?? null);

  // OURS (2026-09-03): the easy read from a hard run's WARM-UP, for a block with no easy runs (All
  // Rounder). Window = the plan's first step when it is a warm-up of >= 6 min; the first 3 min are
  // dropped for heart-rate lag; cool-downs are never used. `_shared/run-warmup-easy.ts` has the why.
  try {
    const st0: any = Array.isArray(planned?.computed?.steps) ? planned!.computed.steps[0] : null;
    const kind0 = String(st0?.kind ?? st0?.intensity ?? '').toLowerCase();
    const warmS = Number(st0?.seconds ?? st0?.duration_s);
    if (st0 && /warm/.test(kind0) && Number.isFinite(warmS) && warmS >= 360 && samples.length > 0) {
      const we = extractWarmupEasy(samples, warmS, dur > 0 ? dur * 60 : 0);
      if (we) facts.warmup_easy = we;
    }
  } catch { /* a missing warm-up read is a null, never a failed fact row */ }

  // Interval adherence from computed.intervals
  if (w.computed?.intervals && Array.isArray(w.computed.intervals)) {
    const workIntervals = w.computed.intervals.filter(
      (i: any) => i.planned_label && !/(warm|cool|rest|recovery)/i.test(i.planned_label)
    );
    if (workIntervals.length > 0) {
      // D-237: an interval with NO measured adherence is UNKNOWN, not a hit. Count only
      // measured intervals in BOTH numerator and denominator — an unmeasured interval must
      // never silently count as 100% and inflate execution.
      const measured = workIntervals.filter((i: any) => (i.adherence_pct ?? i.pace_adherence_pct) != null);
      const hit = measured.filter((i: any) => {
        const adh = i.adherence_pct ?? i.pace_adherence_pct;
        return adh >= 85 && adh <= 115;
      }).length;
      facts.intervals_hit = hit;
      facts.intervals_total = measured.length;
    }
  }

  return facts;
}

function buildRideFacts(w: WorkoutRow, baselines: Baselines | null): Record<string, any> {
  const dist = distanceMeters(w);
  const dur = durationMinutes(w);
  const overall = w.computed?.overall ?? {};
  const analysis = w.computed?.analysis ?? {};
  // Permissive: any non-null FTP is better than skipping IF computation entirely.
  // Prior code: `perf.ftp ?? learned.cycling.ftp` (right-hand was a dead path — never written).
  const { value: ftp } = resolveCurrentFtp(baselines);

  const facts: Record<string, any> = {
    distance_m: Math.round(dist),
    duration_minutes: Math.round(dur),
    // T2 — avg_power/avg_hr ≤ 0 is MISSING, not a real 0 (the zero-not-null class, cf. Q-054 run
    // fix + D-112/D-115). `??` would pass a literal 0 from a power-less/HR-less ride straight
    // through. Pick the first POSITIVE source; null falls back cleanly downstream.
    avg_power: [w.avg_power, overall.avg_power_w].map((x) => toNum(x)).find((v) => v != null && v > 0) ?? null,
    normalized_power: w.normalized_power ?? analysis.power?.normalized_power ?? null,
    avg_hr: [w.avg_heart_rate, overall.avg_hr].map((x) => toNum(x)).find((v) => v != null && v > 0) ?? null,
  };

  if (ftp && facts.normalized_power) {
    facts.intensity_factor = Math.round((facts.normalized_power / ftp) * 100) / 100;
  }

  if (facts.normalized_power && facts.avg_hr && facts.avg_hr > 0) {
    facts.efficiency_factor = Math.round((facts.normalized_power / facts.avg_hr) * 100) / 100;
  }

  const rideHrZoneData = analysis.zones?.hr;
  if (rideHrZoneData?.bins && Array.isArray(rideHrZoneData.bins)) {
    const timeInZone: Record<string, number> = {};
    for (const b of rideHrZoneData.bins) {
      timeInZone[`z${(b.i ?? 0) + 1}`] = Math.round(b.t_s ?? 0);
    }
    facts.time_in_zone = timeInZone;
  } else if (Array.isArray(rideHrZoneData)) {
    const timeInZone: Record<string, number> = {};
    for (const z of rideHrZoneData) {
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

  // Interval adherence from computed.intervals — Tier 2 item 4 of running→cycling delta
  // map. Mirrors the running implementation at line ~1094-1106 above. Same hit-window
  // [85, 115] adherence rule. Cycling intervals carry `power_adherence_pct` (analog to
  // running's `pace_adherence_pct`); both are stored on `w.computed.intervals[]` by
  // compute-workout-summary + compute-workout-analysis. Non-work intervals (warm/cool/
  // rest/recovery) are excluded from the count, same as running.
  if (w.computed?.intervals && Array.isArray(w.computed.intervals)) {
    const workIntervals = w.computed.intervals.filter(
      (i: any) => i.planned_label && !/(warm|cool|rest|recovery)/i.test(i.planned_label)
    );
    if (workIntervals.length > 0) {
      // D-237: unmeasured interval = UNKNOWN, not a hit. Measured-only, both sides (same as run).
      const measured = workIntervals.filter((i: any) => (i.adherence_pct ?? i.power_adherence_pct) != null);
      const hit = measured.filter((i: any) => {
        const adh = i.adherence_pct ?? i.power_adherence_pct;
        return adh >= 85 && adh <= 115;
      }).length;
      facts.intervals_hit = hit;
      facts.intervals_total = measured.length;
    }
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

  // Scalar-derived pace (moving_time + distance, both Strava-authoritative) is the trusted source.
  // The sample-derived analysis.swim pace overrode it with a ~39%-inflated value (same root as the
  // duration bug — Q-038: sample-derived swim values are unreliable). Use the analysis pace ONLY as
  // a fallback when the scalar can't be computed, never as an override.
  if (dur > 0 && dist > 0) {
    facts.pace_per_100m = Math.round((dur * 60 * 100) / dist);
  } else if (analysis.swim?.avg_pace_per_100m) {
    facts.pace_per_100m = Math.round(analysis.swim.avg_pace_per_100m);
  }

  // Q-061 / D-193: flag equipment/drill contamination of the pace SUBSTRATE. fins/buoy/paddles read
  // faster, kick/drill read slower — either way pace_per_100m is not a clean unaided-fitness number.
  // We KEEP pace_per_100m as-is (the Details display + narrative honestly flag it per D-190/D-192);
  // the swim TREND excludes these rows downstream (compute-snapshot swimRows). Snorkel is neutral.
  // Session-level only — no per-length data for surgical extraction.
  const equip = detectSwimEquipment(w.workout_metadata);
  facts.pace_equipment_contaminated = equip.contaminated;
  facts.pace_equipment_direction = equip.direction; // 'optimistic' | 'pessimistic' | 'mixed' | null
  // D-201 popup clean flag: the athlete's one-tap "Swam as planned" / "Normal swim". Explicit false =
  // they flagged it deviated/drills → excluded from the swim TREND (alongside equipment contamination).
  // undefined/true = clean (so historical swims with no flag stay included). Unifies the "clean" definition.
  facts.swam_as_planned = (w.workout_metadata as any)?.swam_as_planned !== false;

  // D-194: rest fraction (work:rest) for the rest-fraction trend — the portion of the pool session
  // spent recovering = (elapsed − moving) / elapsed. Single-sourced via resolveSwimScalars (the SAME
  // scalar layer as pace/HR, D-182) — moving/elapsed are never recomputed inline. Null when elapsed
  // isn't a clean superset of moving (some sources carry only one). distance_m (above) is the
  // comparable-session key the trend filters on. Observe the fraction; never diagnose the cause.
  const scalars = resolveSwimScalars(w);
  const mv = scalars.movingSeconds, el = scalars.elapsedSeconds;
  facts.rest_fraction = (mv != null && el != null && el > mv && mv > 0)
    ? Math.round(((el - mv) / el) * 1000) / 1000
    : null;

  return facts;
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
      // D-237: average only intervals with a measured adherence; an unknown is not "100%".
      const measured = workIntervals.filter((i: any) => (i.adherence_pct ?? i.pace_adherence_pct) != null);
      if (measured.length > 0) {
        const avgAdh = measured.reduce((sum: number, i: any) =>
          sum + (i.adherence_pct ?? i.pace_adherence_pct), 0) / measured.length;
        result.interval_adherence_pct = Math.round(avgAdh);
      }
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

function computeWorkload(w: WorkoutRow, baselines: Baselines | null, hrCorrupt = false, bodyweightLb: number | null = null): number {
  // When HR is rejected as corrupt (D-237), do NOT reuse a workload_actual that was computed
  // from that bad HR (calculate-workload's TRIMP) — recompute on the estimate path instead.
  if (!hrCorrupt && w.workload_actual && w.workload_actual > 0) return w.workload_actual;

  const dur = durationMinutes(w);
  const type = w.type ?? "run";
  const meta = w.workout_metadata ?? {};
  const sessionRPE = meta.session_rpe;

  if (type === "strength") {
    // Friel's TSS estimate (TrainingPeaks): minutes ÷ 60 × RPE × 10 — the rating, else RPE = 10 − logged RIR (2026-09-04).
    return calculateStrengthWorkload(dur, w.strength_exercises ?? [], sessionRPE);
  }
  if (type === "mobility") {
    return calculateMobilityWorkload(w.mobility_exercises ?? []);
  }
  if (type === "pilates_yoga") {
    return calculatePilatesYogaWorkload(dur, sessionRPE);
  }

  // Cardio: THE ONE RULE — _shared/workload.ts resolveCardioIntensity (measured beats self-reported). This is
  // the fallback path; the canonical load is calculate-workload's workload_actual, preferred above. A
  // corrupt heart rate is passed as null so it cannot feed intensity; the order itself is not touched here.
  const isCardio = type === "run" || type === "ride" || type === "bike" || type === "swim";
  if (isCardio && dur > 0) {
    const lf: any = baselines?.learned_fitness ?? {};
    const thresholdHr = (type === "run" ? lf?.running?.threshold_hr : lf?.cycling?.threshold_hr)
      ?? baselines?.performance_numbers?.threshold_heart_rate ?? null;
    const ftp = resolveCurrentFtp(baselines)?.value ?? null;
    const distM = (() => { const d = Number(w.distance); return d > 0 ? (d < 1000 ? d * 1000 : d) : 0; })();
    const paceSecPerKm = dur > 0 && distM > 0 ? (dur * 60) / (distM / 1000) : null;
    const gapMi = Number((w as any)?.computed?.overall?.avg_gap_s_per_mi);
    const cssRaw: any = lf?.swim_css_sec_per_100m;
    const css = Number(typeof cssRaw === 'object' && cssRaw ? cssRaw.value : cssRaw);
    const { intensity } = resolveCardioIntensity({
      type,
      avgHr: hrCorrupt ? null : w.avg_heart_rate,
      thresholdHr,
      avgPower: w.avg_power,
      normalizedPower: w.normalized_power ?? (w as any)?.computed?.analysis?.power?.normalized_power ?? null,
      ftp,
      ngpSecPerKm: Number.isFinite(gapMi) && gapMi > 0 ? gapMi / 1.609344 : paceSecPerKm,
      thresholdPaceSecPerKm: resolveCurrentRunThresholdPace(baselines as any)?.sec_per_km ?? null,
      swimPaceSecPer100m: dur > 0 && distM > 0 ? (dur * 60) / (distM / 100) : null,
      cssSecPer100m: Number.isFinite(css) && css > 0 ? css : null,
      avgPace: w.avg_pace,
      rpe: sessionRPE ?? (w as any)?.rpe ?? null,
    });
    return calculateDurationWorkload(dur, intensity);
  }

  // Non-cardio estimate path: sRPE if a logged RPE exists, else the flat default.
  if (typeof sessionRPE === "number" && sessionRPE >= 1 && sessionRPE <= 10) {
    return calculateDurationWorkload(dur, mapRPEToIntensity(sessionRPE));
  }
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
    const { workout_id, dry_run: reqDryRun, skip_snapshot: reqSkipSnapshot } = await req.json();
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
        "id, user_id, type, date, timestamp, duration, moving_time, elapsed_time, distance, " +
        "avg_heart_rate, max_heart_rate, avg_pace, avg_power, max_power, normalized_power, " +
        "avg_cadence, elevation_gain, strength_exercises, mobility_exercises, " +
        "workout_metadata, computed, workout_analysis, planned_id, workout_status, workload_actual, sensor_data, gps_track, start_position_lat, start_position_long, weather_data",
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
      // `weight` + `units` ride along for D1: a calisthenic set is priced at the athlete's own body
      // weight, and `units` is the only thing that says whether that number is pounds or kilograms.
      .select("performance_numbers, learned_fitness, age, weight, units")
      .eq("user_id", w.user_id)
      .maybeSingle();
    const baselines = (baselinesRow as Baselines | null) ?? null;
    // Null when never recorded — bodyweight sets then score exactly as they do today (D1).
    const bodyweightLb = resolveBodyweightLb(baselinesRow as any);

    // -----------------------------------------------------------------------
    // 3. Read planned workout (if linked)
    // -----------------------------------------------------------------------
    let planned: PlannedRow | null = null;
    if (w.planned_id) {
      const { data: pw } = await supabase
        .from("planned_workouts")
        .select("id, training_plan_id, week_number, type, name, description, tags, intervals, strength_exercises, steps_preset, workload_planned, computed")
        .eq("id", w.planned_id)
        .maybeSingle();
      planned = (pw as PlannedRow | null) ?? null;
    }
    // ⛔ THE PLAN'S WORD LIVES ON THE WORKOUT, NOT ONLY ON THE PLANNED ROW (2026-09-04, Michael: "every part of
    // this screen should be reacting to a plan"). A replaced or deleted plan takes its planned rows with it, and
    // a session the athlete was prescribed is left as an anonymous recording — the Aug 28 interval run read as
    // "steady" with no plan to say otherwise. So: when the planned row is in hand, its identity is stamped onto
    // the workout (`workout_metadata.plan_tags`), and when it is gone, the stamp stands in for it here.
    const stampedPlan: PlannedRow | null = (() => {
      const pt = (w.workout_metadata as any)?.plan_tags;
      if (!pt || typeof pt !== 'object') return null;
      return { id: String(pt.planned_id ?? ''), training_plan_id: pt.training_plan_id ?? null, week_number: pt.week_number ?? null,
        type: pt.type ?? null, name: pt.name ?? null, description: pt.description ?? null, tags: Array.isArray(pt.tags) ? pt.tags : [],
        intervals: null, strength_exercises: null, steps_preset: Array.isArray(pt.steps_preset) ? pt.steps_preset : null, workload_planned: null, computed: null } as unknown as PlannedRow;
    })();
    if (!planned && stampedPlan) planned = stampedPlan;
    if (planned && w.planned_id && String((planned as any).id) === String(w.planned_id)) {
      try {
        const stamp = {
          planned_id: String(w.planned_id), training_plan_id: (planned as any).training_plan_id ?? null, week_number: (planned as any).week_number ?? null,
          type: (planned as any).type ?? null, name: (planned as any).name ?? null, description: (planned as any).description ?? null,
          tags: Array.isArray((planned as any).tags) ? (planned as any).tags : [], steps_preset: Array.isArray((planned as any).steps_preset) ? (planned as any).steps_preset : null,
          stamped_at: new Date().toISOString(),
        };
        const prev = (w.workout_metadata as any)?.plan_tags;
        if (JSON.stringify({ ...prev, stamped_at: null }) !== JSON.stringify({ ...stamp, stamped_at: null })) {
          await supabase.from("workouts").update({ workout_metadata: { ...(w.workout_metadata ?? {}), plan_tags: stamp } }).eq("id", w.id);
          w.workout_metadata = { ...(w.workout_metadata ?? {}), plan_tags: stamp };
        }
      } catch { /* the stamp is a copy; facts proceed on the live planned row */ }
    }

    // -----------------------------------------------------------------------
    // 4. Determine discipline
    // -----------------------------------------------------------------------
    const discipline = (w.type ?? "run").toLowerCase();

    // -----------------------------------------------------------------------
    // 5. HR plausibility (D-237): reject present-but-corrupt HR (flaky strap /
    //    optical cadence-lock) so it never feeds TRIMP or the load substrate.
    //    Scalar ceiling from the athlete's OWN robust observed max (Tanaka fallback
    //    when thin); cadence-lock (HR×cadence correlation) + slew from the sample
    //    series. A trip → estimate path + hr_rejected_corrupt, raw HR preserved.
    // -----------------------------------------------------------------------
    const isCardio = discipline === "run" || discipline === "ride" || discipline === "bike" || discipline === "swim";
    let hrVerdict: { corrupt: boolean; reasons: string[]; correlation: number | null } = { corrupt: false, reasons: [], correlation: null };
    let hrCeilingUsed: number | null = null;
    if (isCardio && (w.avg_heart_rate || w.max_heart_rate)) {
      const { data: hrMaxRows } = await supabase
        .from("workouts").select("max_heart_rate")
        .eq("user_id", w.user_id).gt("max_heart_rate", 100);
      const observedMaxima = (hrMaxRows ?? []).map((r: any) => Number(r.max_heart_rate)).filter((v: number) => Number.isFinite(v));
      const ceiling = resolveMaxHrCeiling({ observedMaxima, age: baselines?.age ?? null });
      hrCeilingUsed = ceiling.ceiling;
      const sd: any = parseJsonSafe(w.sensor_data);
      const samples: any[] = Array.isArray(sd?.samples) ? sd.samples : Array.isArray(sd) ? sd : [];
      const hrSeries = samples.map((s: any) => s?.heart_rate).filter((v: any) => typeof v === "number");
      const cadenceSeries = samples.map((s: any) => s?.cadence).filter((v: any) => typeof v === "number");
      hrVerdict = assessHrPlausibility({ maxHr: w.max_heart_rate ?? null, ceiling: ceiling.ceiling, hrSeries, cadenceSeries });
    }
    const hrCorrupt = hrVerdict.corrupt;

    // -----------------------------------------------------------------------
    // 6. Compute universal metrics
    // -----------------------------------------------------------------------
    const workload = computeWorkload(w, baselines, hrCorrupt, bodyweightLb);
    const sessionRPE = w.workout_metadata?.session_rpe ?? null;
    const readiness = w.workout_metadata?.readiness ?? null;

    // When HR was rejected, correct the ACWR substrate (workouts.workload_actual) + declare the
    // method, so both the trend layer (workout_facts.workload below) and ACWR stop eating the bad
    // TRIMP. Non-destructive: raw avg/max HR are left untouched. Logs WHICH mechanism caught it.
    if (hrCorrupt) {
      console.log(`[compute-facts] HR rejected corrupt for ${w.id} (${discipline}): reasons=[${hrVerdict.reasons.join(",")}] r=${hrVerdict.correlation} ceiling=${hrCeilingUsed} → hr_rejected_corrupt, workload ${workload}`);
      try {
        await supabase.from("workouts").update({
          workload_actual: workload,
          workout_metadata: {
            ...(w.workout_metadata ?? {}),
            workload_method: "hr_rejected_corrupt",
            workload_estimated: true,
            hr_corrupt: { reasons: hrVerdict.reasons, correlation: hrVerdict.correlation, ceiling: hrCeilingUsed },
          },
        }).eq("id", w.id);
      } catch (e) {
        console.warn(`[compute-facts] hr_rejected_corrupt write-back failed for ${w.id}:`, (e as any)?.message ?? e);
      }
    }

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
        runFacts = buildRunFacts(w, baselines, planned);
        break;
      case "ride":
      case "bike":
        rideFacts = buildRideFacts(w, baselines);
        break;
      case "swim":
        swimFacts = buildSwimFacts(w);
        break;
      case "strength": {
        const result = buildStrengthFacts(w, planned, bodyweightLb);
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
    // 8.5 Route intelligence (run routes / regular places)
    // -----------------------------------------------------------------------
    let terrainDebug: Record<string, any> | null = null;
    if (discipline === "run" || discipline === "running" || discipline === "walk") {
      try {
        await upsertRouteIntelligence(supabase, w, runFacts);
      } catch (routeErr) {
        console.error("[compute-facts] route intelligence upsert failed:", routeErr);
      }
      try {
        const terrainResult = await upsertTerrainIntelligence(supabase, w, runFacts);
        terrainDebug = terrainResult;
        console.warn(`[compute-facts] terrain: gps_pts=${buildGpsPoints(w).length} extracted=${terrainResult.extracted} matched=${terrainResult.matched} created=${terrainResult.created_segments} failed_inserts=${terrainResult.failed_segment_inserts} last_error=${terrainResult.last_error}`);
        if (runFacts) {
          runFacts.terrain_context = {
            extracted_segments_count: terrainResult.extracted,
            matched_segments_count: terrainResult.matched,
            created_segments_count: terrainResult.created_segments,
            failed_segment_inserts: terrainResult.failed_segment_inserts,
            failed_match_writes: terrainResult.failed_match_writes,
            last_error: terrainResult.last_error,
            gps_points_count: buildGpsPoints(w).length,
          };
          await supabase
            .from("workout_facts")
            .update({ run_facts: runFacts, computed_at: new Date().toISOString() })
            .eq("workout_id", w.id);
        }
      } catch (terrainErr) {
        console.error("[compute-facts] terrain intelligence upsert failed:", terrainErr);
      }
    }

    // -----------------------------------------------------------------------
    // 9. Write exercise_log (strength only, DELETE + INSERT) + resolve exercise_id
    // -----------------------------------------------------------------------
    let exercisesWritten = 0;
    const registryById = new Map<string, ExerciseRegistryRow>();
    let strengthSessionRows: ExerciseLogRowForLoad[] = [];

    if (exerciseRows.length > 0) {
      await supabase.from("exercise_log").delete().eq("workout_id", w.id);

      const { data: regData, error: regErr } = await supabase
        .from("exercises")
        .select(
          "id, slug, aliases, muscle_attribution, load_ratio, recovery_hours_typical, mechanical_stress, cns_demand",
        )
        .eq("is_active", true);

      let lookup = null as ReturnType<typeof buildRegistryLookup> | null;
      if (regErr) {
        console.error("[compute-facts] exercises registry fetch failed:", regErr.message);
      } else {
        const built = buildRegistryLookup((regData ?? []) as ExerciseRegistryRow[]);
        lookup = built;
        for (const [k, v] of built.byId) registryById.set(k, v);
      }

      const elRows = exerciseRows.map((e) => {
        let exercise_id: string | null = null;
        if (lookup) {
          const hit = resolveExerciseId(e.canonical, lookup);
          exercise_id = hit?.id ?? null;
          if (!hit) {
            console.warn(`[compute-facts] No registry match for canonical_name=${e.canonical}`);
          }
        }
        return {
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
          exercise_id,
          /**
           * ⛔⛔ THE FIELD THE e1RM SERIES NEEDS — and the reason this migration exists. Until now
           * `state-trend/assemble.ts` gated the series on rep ceiling (D-417) and deload phase
           * (D-338) and nothing else, so a set that was LIGHT ON PURPOSE minted a max exactly like
           * a heavy one. On a Viada block that is the same lift twenty percent apart in one week.
           * ⚠️ NULL WRITES AS NULL, deliberately. A reader that cannot tell "no intent recorded"
           * from "not a heavy set" would have to guess, and the whole point of this column is that
           * nothing has to guess.
           */
          slot_intent: e.slot_intent,
        };
      });

      const { error: elErr } = await supabase.from("exercise_log").insert(elRows);
      if (elErr) {
        return new Response(
          JSON.stringify({ error: `exercise_log write failed: ${elErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      exercisesWritten = elRows.length;

      strengthSessionRows = elRows.map((r) => ({
        exercise_id: r.exercise_id,
        canonical_name: r.canonical_name,
        total_volume: r.total_volume,
        avg_rir: r.avg_rir,
        sets_completed: r.sets_completed,
        best_weight: r.best_weight,
        best_reps: r.best_reps,
      }));

      // Update learned_fitness.strength_1rms from exercise_log (fire-and-forget)
      updateLearnedStrengthFromExerciseLog(supabase, w.user_id).catch((e) => {
        console.error("[compute-facts] Learned strength update failed:", e?.message ?? e);
      });
    }

    // -----------------------------------------------------------------------
    // 10. session_load (idempotent; failures are non-fatal)
    // -----------------------------------------------------------------------
    let sessionLoadInserted = 0;
    try {
      const intervalsRaw = w.computed?.intervals;
      const hasStructuredIntervals = Array.isArray(intervalsRaw) &&
        intervalsRaw.some((i: any) =>
          i?.planned_label && !/(warm|cool|rest|recovery)/i.test(String(i.planned_label))
        );

      const { inserted } = await rewriteSessionLoad(supabase, w, {
        discipline,
        durationMinutes: durationMinutes(w),
        workload: workload ?? null,
        runFacts,
        rideFacts,
        swimFacts,
        strengthRows: strengthSessionRows,
        registryById,
        hasStructuredIntervals,
      });
      sessionLoadInserted = inserted;
    } catch (slErr: any) {
      console.error("[compute-facts] session_load failed:", slErr?.message ?? slErr);
    }

    // Chain-completeness signal for the client's "analysis pending" gate. metrics_status is
    // initialized to 'pending' at ingest and, before this, nothing ever flipped it — a dead column.
    // compute-facts finishing is the honest "the numbers exist now" moment (facts/session_load are
    // written above), so it owns the flip. dry_run must not touch it. See docs/AUDIT-fanout-ordering-2026-07-17.md.
    if (reqDryRun !== true) {
      try {
        await supabase.from("workouts").update({
          metrics_status: "complete",
          metrics_updated_at: new Date().toISOString(),
        }).eq("id", w.id);
      } catch (statusErr) {
        console.warn("[compute-facts] metrics_status flip failed (non-fatal):", statusErr);
      }
    }

    // Fire-and-forget: refresh segment core EFFORTS for this run.
    // ── SEGMENT INVARIANT: efforts refresh rides HERE — every reprocess path funnels through this
    //    chokepoint (compute-facts), so a new reprocess path inherits it for free; do NOT scatter it
    //    to leaf callers. Run workouts only (rides/swims have no run cores). The VERDICT then refreshes
    //    on compute-snapshot's tail. Guarded/fire-and-forget: a failure leaves stale efforts, never
    //    breaks compute-facts (identical posture to the compute-snapshot invoke below).
    if (isRunDiscipline(w.type)) {
      try {
        const matchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/match-cores`;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        fetch(matchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${svcKey}`,
            "apikey": svcKey,
          },
          // dry_run threads through: a dry-run trigger keeps match-cores write-free (leaf honors it).
          body: JSON.stringify({ user_id: w.user_id, workout_id: w.id, dry_run: reqDryRun === true }),
        }).catch(() => {});
      } catch {}
    }

    // Fire-and-forget: recompute weekly snapshot for this user.
    // skip_snapshot: when an orchestrator (recompute-workout) owns the fan-out ordering, it
    // runs analyze-{sport} FIRST and then fires compute-snapshot itself with a fresh
    // source_watermark. Firing here too would trigger a ONE-BEHIND snapshot (analyze hasn't
    // run yet) that races the orchestrator's fresh one — the F3 clobber. The DB watermark guard
    // is the structural backstop; this flag avoids the wasted duplicate compute entirely.
    if (reqSkipSnapshot === true) {
      // Orchestrated path owns the snapshot. Do nothing here.
    } else try {
      const snapshotUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/compute-snapshot`;
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(snapshotUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${svcKey}`,
          "apikey": svcKey,
        },
        // dry_run threads through to compute-snapshot → compute-core-verdict, keeping the VERDICT
        // write-free on a dry-run trigger (else a dry compute-facts would trigger a REAL verdict write).
        body: JSON.stringify({ user_id: w.user_id, dry_run: reqDryRun === true }),
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
        session_load_rows: sessionLoadInserted,
        terrain_debug: terrainDebug,
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
