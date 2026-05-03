import type { DriftExplanation, FactPacketV1, FlagV1, HrZone, WeatherV1, WorkoutSegmentV1 } from './types.ts';
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
import { getComparableTypeKeys, getNotableAchievements, getPaceTrend, getSimilarWorkoutComparisons, getTrainingLoadContext, inferWorkoutTypeKey } from './queries.ts';
import { assessStimulus } from './stimulus.ts';
import { identifyPerformanceLimiter } from './limiter.ts';
import { generateFlagsV1 } from './flags.ts';
import {
  resolveMovingDurationMinutes,
  resolveOverallDistanceMi,
  resolveOverallPaceSecPerMi,
} from './pace-resolution.ts';

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

function derivePlannedDistanceMi(plannedWorkout: any): number | null {
  try {
    if (!plannedWorkout) return null;
    const comp = parseJson(plannedWorkout?.computed) || {};

    // Prefer explicit distances from computed steps.
    const steps = Array.isArray(comp?.steps) ? comp.steps : [];
    if (steps.length) {
      let meters = 0;
      for (const st of steps) {
        const dm = coerceNumber(st?.distanceMeters ?? st?.distance_m ?? st?.m ?? st?.meters);
        if (dm != null && dm > 0) meters += dm;
      }
      if (meters > 0) return meters / 1609.34;
    }

    // Fallback: derive from planned duration + target pace midpoint when available.
    const plannedDurS =
      coerceNumber(plannedWorkout?.total_duration_seconds) ??
      coerceNumber(comp?.total_duration_seconds) ??
      coerceNumber(comp?.totalDurationSeconds) ??
      null;
    if (plannedDurS == null || !(plannedDurS > 0)) return null;

    const pr =
      plannedWorkout?.pace_range ??
      plannedWorkout?.paceRange ??
      comp?.pace_range ??
      comp?.paceRange ??
      null;
    const r = normalizePaceRange(pr);
    if (!r) return null;
    const target = (r.fast + r.slow) / 2;
    if (!(target > 0)) return null;

    const miles = plannedDurS / target;
    return miles > 0 ? miles : null;
  } catch {
    return null;
  }
}

function deriveWeather(workout: any): WeatherV1 | null {
  const avgTempC = coerceNumber(workout?.avg_temperature);
  const weatherData = parseJson(workout?.weather_data) || null;
  const apiTempF = coerceNumber(weatherData?.temperature ?? weatherData?.temp ?? weatherData?.temperature_f);
  const deviceTempF = avgTempC != null && avgTempC !== 0 ? Math.round(avgTempC * 9 / 5 + 32) : null;
  const tempF = deviceTempF ?? apiTempF ?? (avgTempC === 0 ? 32 : null);
  const source: 'device' | 'openmeteo' = deviceTempF != null ? 'device' : 'openmeteo';
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
  const ts = coerceNumber(weatherData?.temperature_start_f);
  const te = coerceNumber(weatherData?.temperature_end_f);
  const tp = coerceNumber(weatherData?.temperature_peak_f);
  const ta = coerceNumber(weatherData?.temperature_avg_f ?? weatherData?.temperature);
  const rangeKnown = ts != null && te != null && tp != null;
  return {
    temperature_f: ta != null ? Math.round(ta) : tempF,
    temp_start_f: rangeKnown ? Math.round(ts!) : deviceTempF != null ? tempF : null,
    temp_end_f: rangeKnown ? Math.round(te!) : deviceTempF != null ? tempF : null,
    temp_peak_f: rangeKnown ? Math.round(tp!) : deviceTempF != null ? tempF : null,
    temp_avg_f: ta != null ? Math.round(ta) : null,
    humidity_pct: Math.round(humidity),
    dew_point_f: dew,
    heat_stress_level: getHeatStressLevel(dew),
    wind_mph: wind != null ? Math.round(wind) : null,
    conditions: condition,
    source,
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

/**
 * Extract a finer workout-intent key from planned_workouts tags / steps_preset.
 * planned_workouts.type is always the coarse discipline ('run'), so we look at
 * tags (['hard_run','threshold']) and steps_preset (['cruise_3x1mi_threshold_r60s'])
 * to distinguish quality sessions from easy runs for comparison cohort selection.
 */
function derivePlannedIntentKey(plannedWorkout: any): string | null {
  if (!plannedWorkout) return null;
  const tags: string[] = Array.isArray(plannedWorkout.tags) ? plannedWorkout.tags : [];
  const stepsPreset: string[] = Array.isArray(plannedWorkout.steps_preset) ? plannedWorkout.steps_preset : [];

  const hasTag = (t: string) => tags.includes(t);

  if (hasTag('intervals') || hasTag('vo2max') || hasTag('speed')) return 'intervals';
  if (hasTag('threshold') || hasTag('tempo')) return 'threshold';
  if (hasTag('long_run')) return 'long_run';
  if (hasTag('easy') || hasTag('recovery')) return 'easy';

  if (stepsPreset.some(s => s.startsWith('cruise_') || s.startsWith('interval_'))) return 'intervals';
  if (stepsPreset.some(s => s.startsWith('tempo_'))) return 'threshold';

  return null;
}

function deriveWorkoutTypeKey(workout: any): string {
  const wa = workout?.workout_analysis;
  const wt = String(
    wa?.classified_type ||
    wa?.granular_analysis?.heart_rate_analysis?.workout_type ||
    wa?.granular_analysis?.heart_rate_analysis?.workoutType ||
    ''
  ).trim();
  if (wt) return wt;
  const t = String(workout?.type || '').toLowerCase();
  if (t.includes('run') || t.includes('walk')) return 'run';
  return t || 'unknown';
}

export async function buildWorkoutFactPacketV1(args: {
  supabase: SupabaseLike;
  workout: any;
  plannedWorkout: any | null;
  planContext: {
    planName?: string | null;
    phaseName?: string | null;
    weekIndex?: number | null;
    weekIntent?: string | null;
    isRecoveryWeek?: boolean | null;
    weekFocusLabel?: string | null;
    daysUntilRace?: number | null;
  } | null;
  workoutIntent: string | null;
  classifiedTypeOverride?: string | null;
  learnedFitness: any | null; // from user_baselines.learned_fitness
}): Promise<{ factPacket: FactPacketV1; flags: FlagV1[] }> {
  const { supabase, workout, plannedWorkout, planContext, workoutIntent, classifiedTypeOverride, learnedFitness } = args;

  const computed = parseJson(workout?.computed) || {};
  const overall = computed?.overall || {};
  const overallDistMi = resolveOverallDistanceMi(workout);
  const overallDurMin = resolveMovingDurationMinutes(workout) ?? 0;
  const overallPace = resolveOverallPaceSecPerMi(workout);

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
    const plannedIntent = derivePlannedIntentKey(plannedWorkout);
    const plannedType = plannedIntent || plannedWorkout?.type || null;
    const analyzerType = deriveWorkoutTypeKey(workout);
    return String(plannedType || classifiedTypeOverride || workoutIntent || analyzerType || 'unknown');
  })();

  const factsPlan = (() => {
    if (!plannedWorkout && !planContext) return null;
    return {
      name: String(planContext?.planName || plannedWorkout?.plan_name || plannedWorkout?.planName || 'Plan'),
      week_number: (typeof planContext?.weekIndex === 'number') ? Number(planContext.weekIndex) : (coerceNumber(plannedWorkout?.week_number) ?? null),
      phase: (planContext?.phaseName ? String(planContext.phaseName) : (plannedWorkout?.phase ? String(plannedWorkout.phase) : null)),
      week_focus_label: (planContext as any)?.weekFocusLabel ? String((planContext as any).weekFocusLabel) : null,
      workout_purpose: (plannedWorkout?.focus ? String(plannedWorkout.focus) : (plannedWorkout?.description ? String(plannedWorkout.description) : null)),
      days_until_race: (typeof planContext?.daysUntilRace === 'number' && planContext.daysUntilRace > 0)
        ? Math.round(planContext.daysUntilRace)
        : null,
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
  const hrAnalysis = workout?.workout_analysis?.granular_analysis?.heart_rate_analysis;
  const hrDriftCurrent = coerceNumber(hrAnalysis?.hr_drift_bpm) ?? null;
  const terrainContributionBpm = coerceNumber(hrAnalysis?.terrain_contribution_bpm) ?? null;

  const [vsSimilar, trend, achievements, trainingLoad] = await Promise.all([
    getSimilarWorkoutComparisons(supabase, {
      userId: String(workout.user_id),
      currentWorkoutId: String(workout.id),
      workoutTypeKey: comparisonTypeKey,
      durationMin: overallDurMin || 0,
      currentAvgPaceSecPerMi: overallPace != null ? overallPace : null,
      currentAvgHr: avgHr,
      currentHrDriftBpm: hrDriftCurrent,
      currentTerrainClass: terrain_type !== 'flat' ? terrain_type : null,
    }),
    getPaceTrend(supabase, { userId: String(workout.user_id), workoutTypeKey: comparisonTypeKey, count: 8 }),
    getNotableAchievements(supabase, { userId: String(workout.user_id), currentWorkoutId: String(workout.id), workoutTypeKey, lookbackDays: 28 }),
    workout?.date ? getTrainingLoadContext(supabase, { userId: String(workout.user_id), workoutDateIso: String(workout.date) }) : Promise.resolve(null),
  ]);

  const hr_drift_bpm = (() => {
    const d = coerceNumber(hrDriftCurrent);
    if (d != null) return Math.round(d);
    const first = segments.find((s) => s.avg_hr != null);
    const last = [...segments].reverse().find((s) => s.avg_hr != null);
    if (!first || !last) return null;
    return Math.round((coerceNumber(last.avg_hr) || 0) - (coerceNumber(first.avg_hr) || 0));
  })();

  // hrDriftCurrent is already terrain-adjusted; reconstruct raw for transparency.
  const raw_hr_drift_bpm = (() => {
    if (hrDriftCurrent == null) return null;
    if (terrainContributionBpm != null && Math.abs(terrainContributionBpm) >= 3) {
      return Math.round(hrDriftCurrent + terrainContributionBpm);
    }
    return null; // no meaningful adjustment was applied
  })();

  const hr_drift_typical = coerceNumber((vsSimilar as any)?.avg_hr_drift) ?? null;
  const dec = calculateCardiacDecouplingPct(segments);
  const fade = calculatePaceFadePct(segments);
  const driftSeg = calculateOverallHrDriftBpm(segments);

  const { pace_normalized_drift_bpm, drift_explanation } = (() => {
    const effectiveDrift = hr_drift_bpm ?? driftSeg;
    if (effectiveDrift == null) {
      return { pace_normalized_drift_bpm: null, drift_explanation: null };
    }

    type PaceHrPoint = { pace: number; hr: number; dist: number };
    let points: PaceHrPoint[] = [];

    if (segments.length >= 4) {
      points = segments
        .filter((s) => coerceNumber(s.pace_sec_per_mi) != null && coerceNumber(s.avg_hr) != null)
        .filter((s) => {
          const p = coerceNumber(s.pace_sec_per_mi)!;
          return p > 120 && p < 2400;
        })
        .map((s) => ({
          pace: coerceNumber(s.pace_sec_per_mi)!,
          hr: coerceNumber(s.avg_hr)!,
          dist: coerceNumber(s.distance_mi) || 1,
        }));
    }

    if (points.length < 4) {
      const splits = workout?.workout_analysis?.detailed_analysis?.mile_by_mile_terrain?.splits;
      if (Array.isArray(splits) && splits.length >= 4) {
        points = splits
          .map((sp: any) => ({
            pace: coerceNumber(sp?.pace_s_per_mi) ?? 0,
            hr: coerceNumber(sp?.avg_hr_bpm ?? sp?.avg_hr) ?? 0,
            dist: 1,
          }))
          .filter((p) => p.pace > 120 && p.pace < 2400 && p.hr > 40 && p.hr < 250);
      }
    }

    if (points.length < 4) {
      return { pace_normalized_drift_bpm: null, drift_explanation: null };
    }

    const mid = Math.ceil(points.length / 2);
    const firstHalf = points.slice(0, mid);
    const secondHalf = points.slice(mid);

    const wavg = (arr: PaceHrPoint[], fn: (p: PaceHrPoint) => number) => {
      let sumW = 0, sumV = 0;
      for (const p of arr) {
        sumW += p.dist;
        sumV += fn(p) * p.dist;
      }
      return sumW > 0 ? sumV / sumW : 0;
    };

    const earlyHr = wavg(firstHalf, (p) => p.hr);
    const lateHr = wavg(secondHalf, (p) => p.hr);
    const earlyPace = wavg(firstHalf, (p) => p.pace);
    const latePace = wavg(secondHalf, (p) => p.pace);

    const paceDiff = latePace - earlyPace;
    const rawDrift = lateHr - earlyHr;

    // Linear regression: HR = a + slope * pace across all points.
    const allPaces = points.map((p) => p.pace);
    const allHrs = points.map((p) => p.hr);
    const n = allPaces.length;
    const meanP = allPaces.reduce((a, b) => a + b, 0) / n;
    const meanH = allHrs.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const dp = allPaces[i] - meanP;
      num += dp * (allHrs[i] - meanH);
      den += dp * dp;
    }
    const slope = den > 0 ? num / den : 0;

    const expectedHrChange = slope * paceDiff;
    const paceNorm = Math.round(rawDrift - expectedHrChange);

    const significantPaceChange = Math.abs(paceDiff) >= 30;
    const terrainContrib = coerceNumber(terrainContributionBpm) ?? 0;
    const absRaw = Math.abs(rawDrift);
    // Only positive terrain contribution (late portion was hillier) explains drift.
    // Negative contribution (late was easier/downhill) means terrain dampened the
    // drift — it does NOT explain the HR increase.
    const terrainExplainsPct = (terrainContrib > 0 && absRaw > 0)
      ? terrainContrib / absRaw
      : 0;

    let explanation: DriftExplanation;
    if (Math.abs(paceNorm) < 3 && significantPaceChange && absRaw >= 5) {
      explanation = 'pace_driven';
    } else if (terrainExplainsPct >= 0.4 && Math.abs(paceNorm) < 5) {
      explanation = 'terrain_driven';
    } else if (Math.abs(paceNorm) >= 5) {
      explanation = 'cardiac_drift';
    } else {
      explanation = 'mixed';
    }

    return {
      pace_normalized_drift_bpm: paceNorm,
      drift_explanation: explanation,
    };
  })();

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
        speedups_note: `Faster splits lined up with downhill miles (${parts.join(', ')}) — speed is consistent with terrain effects rather than added effort.`,
      };
    } catch {
      return { speedups_note: null };
    }
  })();

  const terrain_context = await (async () => {
    try {
      const workoutId = String(workout?.id || '').trim();
      const userId = String(workout?.user_id || '').trim();
      if (!workoutId || !userId) return null;

      const [{ data: profileData }, { data: matchData }] = await Promise.all([
        supabase
          .from('workout_terrain_profile')
          .select('terrain_class')
          .eq('workout_id', workoutId)
          .maybeSingle(),
        supabase
          .from('workout_segment_match')
          .select('segment_id')
          .eq('workout_id', workoutId)
          .limit(200),
      ]);

      const segmentIds = Array.from(
        new Set(
          (Array.isArray(matchData) ? matchData : [])
            .map((m: any) => String(m?.segment_id || '').trim())
            .filter(Boolean)
        )
      );

      if (segmentIds.length === 0) {
        return {
          terrain_class: typeof profileData?.terrain_class === 'string' ? profileData.terrain_class : (terrain_type || null),
          segment_matches: 0,
          segment_insight_eligible: false,
          segment_trend_eligible: false,
          segment_comparisons: [],
          route_runs: null,
        };
      }

      const [{ data: segData }, { data: progressData }, { data: routeMatchRow }] = await Promise.all([
        supabase
          .from('terrain_segments')
          .select('id, sample_count, distance_m, elev_gain_m, avg_grade_pct, metadata')
          .in('id', segmentIds),
        supabase
          .from('segment_progress_metrics')
          .select('segment_id, workout_id, avg_pace_s_per_km, avg_hr_bpm, grade_adjusted_pace_s_per_km, duration_s, effort_started_at')
          .eq('user_id', userId)
          .in('segment_id', segmentIds)
          .order('effort_started_at', { ascending: false })
          .limit(500),
        supabase
          .from('workout_route_match')
          .select('route_cluster_id')
          .eq('workout_id', workoutId)
          .maybeSingle(),
      ]);

      const segmentRows = Array.isArray(segData) ? segData : [];
      const progressRows = Array.isArray(progressData) ? progressData : [];
      const segMap = new Map(segmentRows.map((s: any) => [String(s.id), s]));

      const insightEligibleCount = segmentRows.filter((s: any) => Number(s?.sample_count || 0) >= 3).length;
      const trendEligibleCount = segmentRows.filter((s: any) => Number(s?.sample_count || 0) >= 6).length;

      const comparisons: any[] = [];
      const grouped = new Map<string, any[]>();
      for (const row of progressRows) {
        const sid = String(row.segment_id);
        if (!grouped.has(sid)) grouped.set(sid, []);
        grouped.get(sid)!.push(row);
      }

      for (const [segId, efforts] of grouped) {
        const seg = segMap.get(segId);
        if (!seg || efforts.length < 2) continue;
        const thisEffort = efforts.find((e: any) => String(e.workout_id) === workoutId);
        const pastEfforts = efforts.filter((e: any) => String(e.workout_id) !== workoutId);
        if (!thisEffort || pastEfforts.length === 0) continue;

        const avgPastPace = pastEfforts.reduce((s: number, e: any) => s + Number(e.avg_pace_s_per_km || 0), 0) / pastEfforts.length;
        const avgPastHr = pastEfforts.reduce((s: number, e: any) => s + Number(e.avg_hr_bpm || 0), 0) / pastEfforts.length;
        const avgPastGap = pastEfforts.reduce((s: number, e: any) => s + Number(e.grade_adjusted_pace_s_per_km || 0), 0) / pastEfforts.length;

        const todayPace = Number(thisEffort.avg_pace_s_per_km || 0);
        const todayHr = Number(thisEffort.avg_hr_bpm || 0);
        const todayGap = Number(thisEffort.grade_adjusted_pace_s_per_km || 0);

        if (!(todayPace > 0) || !(avgPastPace > 0)) continue;

        const segType = seg.metadata?.segment_type || (Number(seg.avg_grade_pct) >= 2 ? 'climb' : 'rolling');
        const paceDeltaS = Math.round(todayPace - avgPastPace);
        const hrDelta = (todayHr > 0 && avgPastHr > 0) ? Math.round(todayHr - avgPastHr) : null;
        const pacePerMiToday = Math.round(todayPace * 1.60934);
        const pacePerMiAvg = Math.round(avgPastPace * 1.60934);

        comparisons.push({
          segment_type: segType,
          distance_m: Math.round(Number(seg.distance_m || 0)),
          avg_grade_pct: Number(Number(seg.avg_grade_pct || 0).toFixed(1)),
          times_seen: Number(seg.sample_count || 0),
          today_pace_s_per_mi: pacePerMiToday,
          avg_pace_s_per_mi: pacePerMiAvg,
          pace_delta_s: paceDeltaS > 0 ? `+${paceDeltaS}s/km slower` : `${Math.abs(paceDeltaS)}s/km faster`,
          today_hr: todayHr > 0 ? Math.round(todayHr) : null,
          avg_hr: avgPastHr > 0 ? Math.round(avgPastHr) : null,
          hr_delta: hrDelta != null ? (hrDelta > 0 ? `+${hrDelta} bpm` : `${hrDelta} bpm`) : null,
        });
      }

      comparisons.sort((a, b) => (b.times_seen - a.times_seen) || (Math.abs(Number(b.pace_delta_s?.replace(/[^\d.-]/g, '') || 0)) - Math.abs(Number(a.pace_delta_s?.replace(/[^\d.-]/g, '') || 0))));

      const matchedClusterId: string | null = (routeMatchRow as any)?.route_cluster_id
        ? String((routeMatchRow as any).route_cluster_id)
        : null;

      let routeRuns: { name: string; times_run: number; first_seen: string; last_seen: string; history: Array<{ date: string; pace_s_per_km: number | null; hr: number | null; is_current: boolean }> } | null = null;
      if (matchedClusterId) {
        const [{ data: clusterRow }, { data: histRows }] = await Promise.all([
          supabase
            .from('route_clusters')
            .select('id, name, sample_count, first_seen_at, last_seen_at')
            .eq('id', matchedClusterId)
            .maybeSingle(),
          supabase
            .from('route_progress_metrics')
            .select('metric_date, avg_pace_sec_per_km, avg_hr_bpm, workout_id')
            .eq('user_id', userId)
            .eq('route_cluster_id', matchedClusterId)
            .order('metric_date', { ascending: true })
            .limit(10),
        ]);
        if (clusterRow && Number((clusterRow as any).sample_count || 0) >= 2) {
          let history = Array.isArray(histRows)
            ? histRows.map((r: any) => ({
                date: String(r.metric_date || '').slice(0, 10),
                pace_s_per_km: r.avg_pace_sec_per_km != null ? Number(r.avg_pace_sec_per_km) : null,
                hr: r.avg_hr_bpm != null ? Number(r.avg_hr_bpm) : null,
                is_current: String(r.workout_id) === workoutId,
                _workout_id: String(r.workout_id || ''),
              }))
            : [];

          // Filter route history to same-intent workouts so the sparkline
          // doesn't mix easy runs with threshold/interval sessions.
          const comparableKeys = getComparableTypeKeys(comparisonTypeKey);
          if (comparableKeys.length > 0 && history.length > 0) {
            const otherIds = history
              .filter(h => !h.is_current && h._workout_id)
              .map(h => h._workout_id);
            if (otherIds.length > 0) {
              try {
                const { data: typeRows } = await supabase
                  .from('workouts')
                  .select('id, type, workout_analysis')
                  .in('id', otherIds);
                if (Array.isArray(typeRows)) {
                  const sameIntent = new Set<string>();
                  for (const r of typeRows) {
                    const inferred = inferWorkoutTypeKey(r);
                    if (inferred != null && comparableKeys.includes(inferred)) {
                      sameIntent.add(String(r.id));
                    }
                  }
                  history = history.filter(h => h.is_current || sameIntent.has(h._workout_id));
                }
              } catch (e) {
                console.warn('[fact-packet] route history type filter failed (non-fatal):', e);
              }
            }
          }

          // Strip internal _workout_id before exposing
          const cleanHistory = history.map(({ _workout_id, ...rest }) => rest);

          routeRuns = {
            name: String((clusterRow as any).name || 'Regular route'),
            times_run: Number((clusterRow as any).sample_count),
            first_seen: String((clusterRow as any).first_seen_at || '').slice(0, 10),
            last_seen: String((clusterRow as any).last_seen_at || '').slice(0, 10),
            history: cleanHistory,
          };
        }
      }

      return {
        terrain_class: typeof profileData?.terrain_class === 'string' ? profileData.terrain_class : (terrain_type || null),
        segment_matches: segmentIds.length,
        segment_insight_eligible: insightEligibleCount > 0,
        segment_trend_eligible: trendEligibleCount > 0,
        segment_comparisons: comparisons.slice(0, 5),
        route_runs: routeRuns,
      };
    } catch (e) {
      console.warn('[fact-packet] terrain_context derivation failed (non-fatal):', e);
      return null;
    }
  })();

  const plannedDistMi = plannedWorkout ? derivePlannedDistanceMi(plannedWorkout) : null;
  const execution = (() => {
    const planned = plannedDistMi != null && plannedDistMi > 0 ? plannedDistMi : null;
    const actual = overallDistMi != null && overallDistMi > 0 ? overallDistMi : null;
    const deviationPct =
      planned != null && actual != null
        ? Math.round(((actual - planned) / planned) * 100)
        : null;
    const intentional = deviationPct != null ? Math.abs(deviationPct) >= 30 : false;
    const assessed_against: 'plan' | 'actual' = intentional ? 'actual' : 'plan';
    const note =
      intentional && planned != null && actual != null
        ? `Plan modified: ${Math.round(actual * 10) / 10} mi vs ${Math.round(planned * 10) / 10} mi`
        : null;
    return {
      distance_deviation_pct: deviationPct,
      intentional_deviation: intentional,
      assessed_against,
      note,
    };
  })();

  const stimulus = assessStimulus(
    // Plan/type should drive stimulus criteria; do not let raw workoutIntent strings (e.g. "long")
    // override normalized types like "long_run".
    String(workout_type || workoutIntent || workoutTypeKey || 'unknown'),
    segments,
    zones,
    {
      planned_duration_min:
        execution.assessed_against === 'actual'
          ? (overallDurMin != null ? Math.round(overallDurMin) : null)
          : (coerceNumber(plannedWorkout?.duration) ?? coerceNumber(plannedWorkout?.planned_duration_min) ?? null),
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
    pace_normalized_drift_bpm,
    drift_explanation,
    pace_fade_pct: fade,
    training_load: trainingLoad,
    vs_similar: { hr_delta_bpm: (vsSimilar as any)?.hr_delta_bpm ?? null },
    trend,
    workout_intent: String(workoutIntent || '').toLowerCase() || null,
    week_intent: factsPlan?.week_intent ? String(factsPlan.week_intent).toLowerCase() : null,
  });

  const athleteReported = (() => {
    const rpe = coerceNumber(workout?.rpe);
    const feeling = typeof workout?.feeling === 'string' ? workout.feeling.trim().toLowerCase() : null;
    const validFeelings = ['great', 'good', 'ok', 'tired', 'exhausted'];
    if (rpe == null && !feeling) return null;
    return {
      rpe: (rpe != null && rpe >= 1 && rpe <= 10) ? rpe : null,
      feeling: (feeling && validFeelings.includes(feeling)) ? feeling as any : null,
    };
  })();

  const inputs_present: string[] = [];
  if (workout?.sensor_data) inputs_present.push('sensor_data');
  if (workout?.computed) inputs_present.push('computed');
  if (plannedWorkout) inputs_present.push('planned_workout');
  if (weather) inputs_present.push('weather');
  if (zones) inputs_present.push('hr_zones');
  if (trainingLoad) inputs_present.push('training_load');
  if (athleteReported) inputs_present.push('athlete_reported');

  const factPacket: FactPacketV1 = {
    version: 1,
    generated_at: new Date().toISOString(),
    inputs_present,
    facts: {
      workout_date: workout?.date ?? null,
      workout_type,
      total_distance_mi: Math.round(overallDistMi * 100) / 100,
      total_duration_min: Math.round(overallDurMin * 10) / 10,
      avg_pace_sec_per_mi: overallPace != null ? Math.round(overallPace) : null,
      avg_gap_sec_per_mi: coerceNumber(overall?.avg_gap_s_per_mi) ?? null,
      gap_adjusted: !!overall?.has_gap,
      avg_hr: avgHr,
      max_hr: maxHr,
      elevation_gain_ft: elevationGainFt,
      terrain_type,
      segments,
      weather,
      plan: factsPlan,
      athlete_reported: athleteReported,
    },
    derived: {
      execution,
      hr_drift_bpm: hr_drift_bpm ?? driftSeg,
      raw_hr_drift_bpm,
      terrain_contribution_bpm: terrainContributionBpm != null ? Math.round(terrainContributionBpm) : null,
      pace_normalized_drift_bpm,
      drift_explanation,
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
          trend_points: (() => {
            const pts = Array.isArray((vsSimilar as any).trend_points) ? (vsSimilar as any).trend_points : [];
            const curDate = workout?.date ?? null;
            const curPace = overallPace != null ? Math.round(overallPace) : null;
            const curHr = avgHr;
            if (curDate && curPace != null && curHr != null) {
              pts.push({ date: String(curDate), pace_sec_per_mi: curPace, avg_hr: curHr, is_current: true });
            }
            return pts;
          })(),
        },
        trend,
        achievements,
      },
      stimulus,
      primary_limiter: limiter.primary,
      contributing_limiters: limiter.contributors,
      terrain_context,
    },
  };

  const flags = generateFlagsV1(factPacket);
  return { factPacket, flags };
}

