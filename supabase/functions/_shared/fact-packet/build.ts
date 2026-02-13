import type { FactPacketV1, FlagV1, HrZone, WeatherV1, WorkoutSegmentV1 } from './types.ts';
import {
  classifyTerrain,
  coerceNumber,
  calculateCardiacDecouplingPct,
  calculateOverallHrDriftBpm,
  calculatePaceFadePct,
  deriveDewPointF,
  getHeatStressLevel,
  isoDateAddDays,
  isoWeekStartMonday,
  mapHrToZone,
  paceStringToSecondsPerMi,
  secondsToPaceString,
} from './utils.ts';
import { getNotableAchievements, getPaceTrend, getSimilarWorkoutComparisons, getTrainingLoadContext } from './queries.ts';
import { assessStimulus } from './stimulus.ts';
import { identifyPerformanceLimiter } from './limiter.ts';
import { generateFlagsV1 } from './flags.ts';

type SupabaseLike = any;

function parseJson(val: any): any {
  if (val == null) return null;
  try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return val; }
}

function extractSensorSamples(sensor_data: any): any[] {
  const s = parseJson(sensor_data);
  if (Array.isArray(s?.samples)) return s.samples;
  if (Array.isArray(s)) return s;
  return [];
}

function deriveAvgMaxHrFromSensor(sensor_data: any): { avg: number | null; max: number | null } {
  const samples = extractSensorSamples(sensor_data);
  let sum = 0;
  let n = 0;
  let mx = -Infinity;
  for (const s of samples) {
    const hr = coerceNumber(s?.heartRate ?? s?.heart_rate ?? s?.hr ?? s?.bpm);
    if (hr == null || !(hr > 0)) continue;
    sum += hr;
    n += 1;
    if (hr > mx) mx = hr;
  }
  return {
    avg: n ? Math.round(sum / n) : null,
    max: Number.isFinite(mx) ? Math.round(mx) : null,
  };
}

function normalizePaceRange(range: any): { fast: number; slow: number } | null {
  // Accept string ranges like "10:55-11:21/mi"
  try {
    if (typeof range === 'string') {
      const s = range.trim();
      const m = s.match(/(\d+\s*:\s*\d{1,2})\s*[–-]\s*(\d+\s*:\s*\d{1,2})/);
      if (m) {
        const a = paceStringToSecondsPerMi(m[1]);
        const b = paceStringToSecondsPerMi(m[2]);
        if (a != null && b != null) {
          return { fast: Math.min(a, b), slow: Math.max(a, b) };
        }
      }
    }
  } catch {}
  const coercePace = (v: any): number | null => {
    const n = coerceNumber(v);
    if (n != null && n > 0) return n;
    // Accept strings like "10:55/mi" or "10:55"
    const parsed = paceStringToSecondsPerMi(v);
    return parsed != null && parsed > 0 ? parsed : null;
  };
  const lo = coercePace(range?.lower ?? range?.min ?? range?.fast ?? range?.from);
  const hi = coercePace(range?.upper ?? range?.max ?? range?.slow ?? range?.to);
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null) {
    return { fast: Math.min(lo, hi), slow: Math.max(lo, hi) };
  }
  const v = (lo ?? hi) as number;
  return { fast: v, slow: v };
}

function computeTargetAndDeviation(actual: number | null, paceRange: any): { target: number | null; deviation: number | null } {
  if (actual == null || !(actual > 0)) return { target: null, deviation: null };
  const r = normalizePaceRange(paceRange);
  if (!r) return { target: null, deviation: null };
  const { fast, slow } = r;
  const target = (fast + slow) / 2;
  // deviation vs nearest bound (range): if within range → 0
  const deviation =
    actual < fast ? (actual - fast) :
    actual > slow ? (actual - slow) :
    0;
  return { target, deviation };
}

function deriveWeather(workout: any): WeatherV1 | null {
  const avgTempC = coerceNumber(workout?.avg_temperature);
  const weatherData = parseJson(workout?.weather_data) || null;
  const tempF = avgTempC != null ? Math.round(avgTempC * 9 / 5 + 32) : coerceNumber(weatherData?.temperature ?? weatherData?.temp ?? weatherData?.temperature_f);
  const humidity = coerceNumber(weatherData?.humidity ?? weatherData?.relative_humidity);
  const wind = coerceNumber(weatherData?.windSpeed ?? weatherData?.wind_speed);
  const condition = typeof weatherData?.condition === 'string' ? weatherData.condition : (typeof weatherData?.weather_description === 'string' ? weatherData.weather_description : null);

  if (tempF == null || humidity == null) {
    if (workout?.id && (avgTempC != null || weatherData != null)) {
      console.log(`[fact-packet] weather null for workout ${workout.id}: tempF=${tempF}, humidity=${humidity}, avg_temperature=${avgTempC}, weather_data keys=${weatherData ? Object.keys(weatherData).join(',') : 'none'}`);
    }
    return null;
  }
  const dew = deriveDewPointF(tempF, humidity);
  return {
    temperature_f: tempF,
    humidity_pct: Math.round(humidity),
    dew_point_f: dew,
    heat_stress_level: getHeatStressLevel(dew),
    wind_mph: wind != null ? Math.round(wind) : null,
    conditions: condition,
    source: avgTempC != null ? 'device' : 'openmeteo',
  };
}

function buildZonesFromLearnedFitness(learnedFitness: any): HrZone[] | null {
  try {
    const thr = coerceNumber(learnedFitness?.run_threshold_hr?.value ?? learnedFitness?.runThresholdHr?.value);
    if (thr == null || !(thr > 0)) return null;
    // Conservative 5-zone model anchored to threshold HR.
    // Not perfect, but deterministic and user-specific.
    const z1Max = Math.round(thr * 0.75);
    const z2Max = Math.round(thr * 0.85);
    const z3Max = Math.round(thr * 0.92);
    const z4Max = Math.round(thr * 0.98);
    return [
      { label: 'Z1', minBpm: 0, maxBpm: z1Max },
      { label: 'Z2', minBpm: z1Max + 1, maxBpm: z2Max },
      { label: 'Z3', minBpm: z2Max + 1, maxBpm: z3Max },
      { label: 'Z4', minBpm: z3Max + 1, maxBpm: z4Max },
      { label: 'Z5', minBpm: z4Max + 1, maxBpm: 999 },
    ];
  } catch {
    return null;
  }
}

function deriveWorkoutTypeKey(workout: any): string {
  const wa = workout?.workout_analysis;
  const wt = String(wa?.granular_analysis?.heart_rate_analysis?.workout_type || wa?.granular_analysis?.heart_rate_analysis?.workoutType || '').trim();
  if (wt) return wt;
  const t = String(workout?.type || '').toLowerCase();
  if (t.includes('run') || t.includes('walk')) return 'run';
  return t || 'unknown';
}

export async function buildWorkoutFactPacketV1(args: {
  supabase: SupabaseLike;
  workout: any;
  plannedWorkout: any | null;
  planContext: { planName?: string | null; phaseName?: string | null; weekIndex?: number | null; weekIntent?: string | null; isRecoveryWeek?: boolean | null } | null;
  workoutIntent: string | null;
  learnedFitness: any | null; // from user_baselines.learned_fitness
}): Promise<{ factPacket: FactPacketV1; flags: FlagV1[] }> {
  const { supabase, workout, plannedWorkout, planContext, workoutIntent, learnedFitness } = args;

  const computed = parseJson(workout?.computed) || {};
  const overall = computed?.overall || {};
  const overallDistMi = (() => {
    const m =
      coerceNumber(overall?.distance_m) ??
      coerceNumber(overall?.distance_meters) ??
      coerceNumber(overall?.distanceMeters);
    if (m != null && m > 0) return m / 1609.34;
    const kmOverall = coerceNumber(overall?.distance_km ?? overall?.distanceKm);
    if (kmOverall != null && kmOverall > 0) return kmOverall * 0.621371;
    const km = coerceNumber(workout?.distance);
    return km != null && km > 0 ? km * 0.621371 : 0;
  })();

  const overallDurMin = (() => {
    const s = coerceNumber(overall?.duration_s_moving ?? overall?.duration_s_elapsed);
    if (s != null && s > 0) return s / 60;
    const mv = coerceNumber(workout?.moving_time);
    if (mv != null && mv > 0) return mv;
    const d = coerceNumber(workout?.duration);
    return d != null && d > 0 ? d : 0;
  })();

  const overallPace = coerceNumber(overall?.avg_pace_s_per_mi);

  const hrFromComputedAvg = coerceNumber(overall?.avg_hr);
  const hrFromComputedMax = coerceNumber(overall?.max_hr);
  const hrSensor = deriveAvgMaxHrFromSensor(workout?.sensor_data);
  const avgHr = hrFromComputedAvg != null ? Math.round(hrFromComputedAvg) : hrSensor.avg;
  const maxHr = hrFromComputedMax != null ? Math.round(hrFromComputedMax) : hrSensor.max;

  const elevationGainFt = (() => {
    let m = coerceNumber(
      workout?.elevation_gain ??
      workout?.metrics?.elevation_gain ??
      workout?.total_elevation_gain ??
      overall?.elevation_gain_m ??
      overall?.elevation_gain ??
      overall?.total_elevation_gain_m
    );
    if (m == null && overallDistMi > 0) {
      const breakdown = workout?.workout_analysis?.detailed_analysis?.interval_breakdown;
      const intervals = Array.isArray(breakdown?.intervals) ? breakdown.intervals : [];
      const sum = intervals.reduce((acc: number, inv: any) => acc + (coerceNumber(inv?.elevation_gain_m) ?? 0), 0);
      if (sum > 0) {
        // Note: interval_breakdown elevation is GPS-estimated and may overcount vs barometric total.
        // Only use it as a last resort when workout-level elevation is missing.
        m = sum;
        if (workout?.id) console.log(`[fact-packet] elevation fallback from interval_breakdown: ${sum}m for workout ${workout.id}`);
      }
    }
    if (m == null) return null;
    return Math.round(m * 3.28084);
  })();

  const terrain_type = classifyTerrain(elevationGainFt, overallDistMi);
  if (workout?.id && overallDistMi > 0.2 && elevationGainFt == null) {
    console.log(`[fact-packet] terrain: elevation_gain missing for workout ${workout.id}, workout.elevation_gain=${workout?.elevation_gain}, workout.metrics.elevation_gain=${workout?.metrics?.elevation_gain}, overall.elevation_gain_m=${overall?.elevation_gain_m}`);
  }
  const weather = deriveWeather(workout);

  const zones = buildZonesFromLearnedFitness(learnedFitness) || null;

  const segments: WorkoutSegmentV1[] = (() => {
    const ints: any[] = Array.isArray(computed?.intervals) ? computed.intervals : [];
    return ints
      .filter((it) => it && it.executed)
      .map((it, idx) => {
        const name = String(it.label || it.name || it.role || it.kind || `Segment ${idx + 1}`);
        const exec = it.executed || {};
        const pace = coerceNumber(exec.avg_pace_s_per_mi ?? exec.avgPaceSPerMi ?? exec.avg_pace_sec_per_mi);
        const durS = coerceNumber(exec.duration_s ?? exec.durationS);
        const distM = coerceNumber(exec.distance_m ?? exec.distanceM);
        const distMi = distM != null && distM > 0 ? distM / 1609.34 : 0;
        const avg_hr = coerceNumber(exec.avg_hr ?? exec.avgHr);
        const max_hr = coerceNumber(exec.max_hr ?? exec.maxHr);

        // planned target from interval pace range (or fallback to target_pace field)
        const pr = it.pace_range || it.paceRange || it.target_pace || it.targetPace || it.planned?.pace_range || it.planned?.target_pace || null;
        const { target, deviation } = computeTargetAndDeviation(pace, pr);

        return {
          name,
          distance_mi: Math.round(distMi * 100) / 100,
          pace_sec_per_mi: pace != null ? Math.round(pace) : 0,
          target_pace_sec_per_mi: target != null ? Math.round(target) : null,
          pace_deviation_sec: deviation != null ? Math.round(deviation) : null,
          avg_hr: avg_hr != null ? Math.round(avg_hr) : null,
          max_hr: max_hr != null ? Math.round(max_hr) : null,
          hr_zone: mapHrToZone(avg_hr, zones),
          duration_s: durS != null ? Math.round(durS) : null,
        };
      });
  })();

  const workout_type = (() => {
    const plannedType = plannedWorkout?.workout_type || plannedWorkout?.type || null;
    const analyzerType = deriveWorkoutTypeKey(workout);
    // Prefer plan type when linked; fallback to analyzer.
    return String(plannedType || workoutIntent || analyzerType || 'unknown');
  })();

  const factsPlan = (() => {
    if (!plannedWorkout && !planContext) return null;
    return {
      name: String(planContext?.planName || plannedWorkout?.plan_name || plannedWorkout?.planName || 'Plan'),
      week_number: (typeof planContext?.weekIndex === 'number') ? (Number(planContext.weekIndex) + 1) : (coerceNumber(plannedWorkout?.week_number) ?? null),
      phase: (planContext?.phaseName ? String(planContext.phaseName) : (plannedWorkout?.phase ? String(plannedWorkout.phase) : null)),
      workout_purpose: (plannedWorkout?.focus ? String(plannedWorkout.focus) : (plannedWorkout?.description ? String(plannedWorkout.description) : null)),
      days_until_race: null,
      week_intent: planContext?.weekIntent ? String(planContext.weekIntent) : null,
      is_recovery_week: typeof planContext?.isRecoveryWeek === 'boolean' ? planContext.isRecoveryWeek : null,
    };
  })();

  // Historical queries: use classified workout_type (from plan) for comparisons so recovery/easy match past runs.
  // When plan is recovery week but analyzer labeled "intervals" (e.g. strides), compare to easy/recovery runs.
  const workoutTypeKey = deriveWorkoutTypeKey(workout);
  let comparisonTypeKey = (workout_type !== 'unknown' ? workout_type : workoutTypeKey) || workoutTypeKey;
  const weekIntent = planContext?.weekIntent ?? null;
  const isRecoveryWeek = planContext?.isRecoveryWeek === true;
  if ((weekIntent === 'recovery' || isRecoveryWeek) && (comparisonTypeKey === 'intervals' || comparisonTypeKey === 'interval_run')) {
    comparisonTypeKey = 'recovery';
  }
  const hrDriftCurrent = coerceNumber(workout?.workout_analysis?.granular_analysis?.heart_rate_analysis?.hr_drift_bpm) ?? null;

  const [vsSimilar, trend, achievements, trainingLoad] = await Promise.all([
    getSimilarWorkoutComparisons(supabase, {
      userId: String(workout.user_id),
      currentWorkoutId: String(workout.id),
      workoutTypeKey: comparisonTypeKey,
      durationMin: overallDurMin || 0,
      currentAvgPaceSecPerMi: overallPace != null ? overallPace : null,
      currentAvgHr: avgHr,
      currentHrDriftBpm: hrDriftCurrent,
    }),
    getPaceTrend(supabase, { userId: String(workout.user_id), workoutTypeKey, count: 8 }),
    getNotableAchievements(supabase, { userId: String(workout.user_id), currentWorkoutId: String(workout.id), workoutTypeKey, lookbackDays: 28 }),
    workout?.date ? getTrainingLoadContext(supabase, { userId: String(workout.user_id), workoutDateIso: String(workout.date) }) : Promise.resolve(null),
  ]);

  const hr_drift_bpm = (() => {
    // Prefer analyzer drift (steady-state), else segment drift.
    const d = coerceNumber(hrDriftCurrent);
    if (d != null) return Math.round(d);
    // Segment drift (last - first)
    const first = segments.find((s) => s.avg_hr != null);
    const last = [...segments].reverse().find((s) => s.avg_hr != null);
    if (!first || !last) return null;
    return Math.round((coerceNumber(last.avg_hr) || 0) - (coerceNumber(first.avg_hr) || 0));
  })();

  const hr_drift_typical = coerceNumber((vsSimilar as any)?.avg_hr_drift) ?? null;
  const dec = calculateCardiacDecouplingPct(segments);
  const fade = calculatePaceFadePct(segments);
  const driftSeg = calculateOverallHrDriftBpm(segments);

  const pacing_pattern = (() => {
    try {
      const splits = workout?.workout_analysis?.detailed_analysis?.mile_by_mile_terrain?.splits;
      if (!Array.isArray(splits) || splits.length < 2) return { speedups_note: null };
      const overallPace = overallPace != null ? overallPace : null;
      if (overallPace == null) return { speedups_note: null };

      const downhill = splits
        .map((s: any) => ({
          mile: coerceNumber(s?.mile),
          pace: coerceNumber(s?.pace_s_per_mi),
          grade: coerceNumber(s?.grade_percent),
          type: String(s?.terrain_type || '').toLowerCase(),
        }))
        .filter((s: any) => s.mile != null && s.pace != null)
        .filter((s: any) => s.type === 'downhill' || (s.grade != null && s.grade <= -0.5));

      const notable = downhill
        .filter((s: any) => (s.pace as number) <= (overallPace - 5)) // at least 5s/mi faster than overall
        .sort((a: any, b: any) => (a.pace as number) - (b.pace as number))
        .slice(0, 2);

      if (!notable.length) return { speedups_note: null };

      const parts = notable.map((s: any) => {
        const paceStr = secondsToPaceString(s.pace as number) || '';
        const gradeStr = s.grade != null ? `${Math.round((s.grade as number) * 10) / 10}%` : null;
        return `M${Math.round(s.mile as number)} ${paceStr}${gradeStr ? ` (${gradeStr} grade)` : ''}`;
      });

      return {
        speedups_note: `Faster splits lined up with downhill miles (${parts.join(', ')}) — speed is likely terrain-driven rather than effort-driven.`,
      };
    } catch {
      return { speedups_note: null };
    }
  })();

  const stimulus = assessStimulus(
    String(workoutIntent || workout_type || workoutTypeKey || 'unknown'),
    segments,
    zones,
    {
      planned_duration_min: coerceNumber(plannedWorkout?.duration) ?? coerceNumber(plannedWorkout?.planned_duration_min) ?? null,
      interval_count: coerceNumber((plannedWorkout as any)?.interval_count) ?? null,
    }
  );

  const limiter = identifyPerformanceLimiter({
    segments,
    avg_hr: avgHr,
    elevation_gain_ft: elevationGainFt,
    total_distance_mi: overallDistMi,
    terrain_type,
    weather,
    hr_drift_bpm: hr_drift_bpm ?? driftSeg,
    hr_drift_typical,
    pace_fade_pct: fade,
    training_load: trainingLoad,
    vs_similar: { hr_delta_bpm: (vsSimilar as any)?.hr_delta_bpm ?? null },
    trend,
    workout_intent: String(workoutIntent || '').toLowerCase() || null,
    week_intent: factsPlan?.week_intent ? String(factsPlan.week_intent).toLowerCase() : null,
  });

  const inputs_present: string[] = [];
  if (workout?.sensor_data) inputs_present.push('sensor_data');
  if (workout?.computed) inputs_present.push('computed');
  if (plannedWorkout) inputs_present.push('planned_workout');
  if (weather) inputs_present.push('weather');
  if (zones) inputs_present.push('hr_zones');
  if (trainingLoad) inputs_present.push('training_load');

  const factPacket: FactPacketV1 = {
    version: 1,
    generated_at: new Date().toISOString(),
    inputs_present,
    facts: {
      workout_type,
      total_distance_mi: Math.round(overallDistMi * 100) / 100,
      total_duration_min: Math.round(overallDurMin * 10) / 10,
      avg_pace_sec_per_mi: overallPace != null ? Math.round(overallPace) : null,
      avg_hr: avgHr,
      max_hr: maxHr,
      elevation_gain_ft: elevationGainFt,
      terrain_type,
      segments,
      weather,
      plan: factsPlan,
    },
    derived: {
      hr_drift_bpm: hr_drift_bpm ?? driftSeg,
      hr_drift_typical,
      cardiac_decoupling_pct: dec,
      pace_fade_pct: fade,
      pacing_pattern,
      training_load: trainingLoad,
      comparisons: {
        vs_similar: {
          sample_size: vsSimilar.sample_size,
          pace_delta_sec: vsSimilar.pace_delta_sec,
          hr_delta_bpm: vsSimilar.hr_delta_bpm,
          drift_delta_bpm: vsSimilar.drift_delta_bpm,
          assessment: vsSimilar.assessment,
        },
        trend,
        achievements,
      },
      stimulus,
      primary_limiter: limiter.primary,
      contributing_limiters: limiter.contributors,
    },
  };

  const flags = generateFlagsV1(factPacket);
  return { factPacket, flags };
}

