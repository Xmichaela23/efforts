// =============================================================================
// BLOCK ADAPTATION (SERVER-SIDE AGGREGATION + CACHE)
// =============================================================================
//
// - Aggregates workouts.computed.adaptation for a 4-week block
// - Caches results in block_adaptation_cache (TTL via expires_at)
//
// This is the "smart server" layer. Frontend remains dumb.
// =============================================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ConfidenceLabel = 'high' | 'medium' | 'low';
export type BlockFocus = 'base' | 'marathon_prep' | 'hybrid' | 'recovery' | 'unknown';

export type BlockAdaptation = {
  overview: {
    focus: BlockFocus;
    adaptation_score: number; // 0..100 (higher is better)
    signal_quality: ConfidenceLabel;
    drivers: string[];
  };
  aerobic_efficiency: {
    weekly_trend: Array<{
      week: number;
      avg_pace: number;
      avg_hr: number;
      avg_efficiency: number;
      sample_count: number;
    }>;
    improvement_pct: number | null;
    confidence: ConfidenceLabel;
    sample_count: number;
    excluded_reasons?: Record<string, number>;
  };
  long_run_endurance?: {
    weekly_trend: Array<{
      week: number;
      avg_pace: number;
      avg_hr: number;
      avg_duration_min: number;
      avg_efficiency: number;
      sample_count: number;
    }>;
    improvement_pct: number | null;
    confidence: ConfidenceLabel;
    sample_count: number;
    excluded_reasons?: Record<string, number>;
  };
  strength_progression: {
    by_exercise: Record<
      string,
      Array<{
        week: number;
        weight: number;
        avg_rir: number | null;
        estimated_1rm: number;
        sample_count: number;
      }>
    >;
    overall_gain_pct: number | null;
  };
  baseline_recommendations: Array<{
    type: string;
    current_value: number;
    recommended_value: number;
    confidence: number;
    evidence: string;
    impact: string;
  }>;
};

function parseJson<T = any>(val: any): T | null {
  if (val == null) return null;
  try {
    return typeof val === 'string' ? JSON.parse(val) : (val as T);
  } catch {
    return val as T;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function pctToSignal(pctChange: number | null | undefined, capPct = 6): number {
  if (pctChange == null || !Number.isFinite(pctChange)) return 0;
  return clamp(pctChange / capPct, -1, 1);
}

function deriveFocusFromCounts(counts: { aero: number; strength: number; long: number }): BlockFocus {
  // If strength has meaningful samples, call it hybrid unless marathon signals dominate.
  const hasStrength = counts.strength >= 6; // ~1-2 lifts/week for 4 weeks
  const hasLong = counts.long >= 2;
  if (hasStrength && hasLong) return 'hybrid';
  if (hasStrength) return 'hybrid';
  return 'unknown';
}

function focusWeights(focus: BlockFocus): { aerobic: number; strength: number; longRun: number } {
  switch (focus) {
    case 'base':
      return { aerobic: 0.85, strength: 0.15, longRun: 0.0 };
    case 'marathon_prep':
      // Marathon prep: durability matters most; strength should not penalize (only reward).
      return { aerobic: 0.4, strength: 0.1, longRun: 0.5 };
    case 'hybrid':
      // Hybrid/concurrent: prioritize aerobic efficiency while keeping strength as a gatekeeper.
      return { aerobic: 0.65, strength: 0.3, longRun: 0.05 };
    case 'recovery':
      return { aerobic: 0.6, strength: 0.4, longRun: 0.0 };
    default:
      return { aerobic: 0.65, strength: 0.25, longRun: 0.1 };
  }
}

function computeStrengthSampleCount(byExercise: BlockAdaptation['strength_progression']['by_exercise']): number {
  try {
    let total = 0;
    for (const series of Object.values(byExercise || {})) {
      if (!Array.isArray(series)) continue;
      total += series.reduce((s: number, w: any) => s + Number(w?.sample_count || 0), 0);
    }
    return total;
  } catch {
    return 0;
  }
}

function computeSignalQualityFromSamples(totalSamples: number): ConfidenceLabel {
  if (totalSamples >= 16) return 'high';
  if (totalSamples >= 8) return 'medium';
  return 'low';
}

function computeOverview(
  adaptation: Omit<BlockAdaptation, 'overview'>,
  focusOverride?: BlockFocus
): BlockAdaptation['overview'] {
  const aeroPct = adaptation.aerobic_efficiency?.improvement_pct ?? null;
  const strengthPct = adaptation.strength_progression?.overall_gain_pct ?? null;
  const longPct = adaptation.long_run_endurance?.improvement_pct ?? null;

  const aeroSamples = Number(adaptation.aerobic_efficiency?.sample_count || 0);
  const strengthSamples = computeStrengthSampleCount(adaptation.strength_progression?.by_exercise || {});
  const longSamples = Number(adaptation.long_run_endurance?.sample_count || 0);

  const totalSamples = aeroSamples + strengthSamples + longSamples;
  const signal_quality = computeSignalQualityFromSamples(totalSamples);

  const focus =
    focusOverride ||
    deriveFocusFromCounts({ aero: aeroSamples, strength: strengthSamples, long: longSamples });

  const w = focusWeights(focus);

  // Aerobic + strength are real % signals.
  const aeroSignal = pctToSignal(aeroPct);
  let strengthSignal = pctToSignal(strengthPct);

  // Long-run: if we can compute a change, use it; otherwise use coverage as a weak proxy.
  const longSignal =
    longPct != null
      ? pctToSignal(longPct)
      : clamp(longSamples / 4, 0, 1) * 2 - 1; // [-1,+1], centered at ~1/wk

  // ---------------------------------------------------------------------------
  // Guardrails by focus
  // ---------------------------------------------------------------------------

  // Marathon prep: allow strength drops (no penalty). Only reward positive strength trends.
  if (focus === 'marathon_prep') {
    strengthSignal = Math.max(0, strengthSignal);
  }

  // Base: keep it simple (mostly aerobic).

  // Hybrid: "don’t rob Peter to pay Paul"
  // - If strength drops more than ~2%, heavily dampen the overall score (coefficient).
  // - If strength is stable/positive AND aerobic improves, apply a small "holy grail" bonus.
  const strengthDropPct = strengthPct != null && Number.isFinite(strengthPct) ? strengthPct : null;
  const isStrengthBadInHybrid = focus === 'hybrid' && strengthDropPct != null && strengthDropPct < -2;
  const isHolyGrailHybrid = focus === 'hybrid' && (strengthDropPct == null || strengthDropPct >= -2) && aeroPct != null && aeroPct > 0;

  // First compute a raw lane blend.
  let raw = w.aerobic * aeroSignal + w.strength * strengthSignal + w.longRun * longSignal;

  // Hybrid coefficient: strength loss dampens, but doesn't invert the signal.
  // Example behaviors:
  // - -3% => ~0.75 coefficient
  // - -6% => ~0.50 coefficient
  // - -10% => ~0.20 coefficient (floor)
  let coeff = 1;
  if (isStrengthBadInHybrid && strengthDropPct != null) {
    coeff = clamp(1 + strengthDropPct / 12, 0.2, 1); // strengthDropPct is negative
  }

  // Hybrid bonus: reward concurrent improvement (small multiplier, capped).
  if (isHolyGrailHybrid) {
    raw = clamp(raw * 1.12, -1, 1);
  }

  const adaptation_score = Math.round(50 + 50 * clamp(raw * coeff, -1, 1));

  const drivers: string[] = [];
  if (aeroPct != null) drivers.push(`Aerobic ${aeroPct > 0 ? '+' : ''}${aeroPct.toFixed(2)}%`);
  if (strengthPct != null) drivers.push(`Strength ${strengthPct > 0 ? '+' : ''}${strengthPct.toFixed(2)}%`);
  if (longPct != null) drivers.push(`Long run ${longPct > 0 ? '+' : ''}${longPct.toFixed(2)}%`);
  else if (longSamples > 0) drivers.push(`Long runs ${longSamples} sample${longSamples === 1 ? '' : 's'}`);

  if (!drivers.length) drivers.push('Need more data');

  return { focus, adaptation_score, signal_quality, drivers };
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(`${aISO}T00:00:00Z`).getTime();
  const b = new Date(`${bISO}T00:00:00Z`).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function weekOfBlock(dateISO: string, blockStartISO: string): number {
  const d = daysBetween(blockStartISO, dateISO);
  return clamp(Math.floor(d / 7) + 1, 1, 4);
}

function confidenceLabelFromWeeklyCounts(counts: number[]): ConfidenceLabel {
  const min = counts.length ? Math.min(...counts) : 0;
  if (min >= 3) return 'high';
  if (min >= 2) return 'medium';
  return 'low';
}

function parseMmSsPerMiToSeconds(val: any): number | null {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const mm = Number(m[1]);
  const ss = Number(m[2]);
  if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss < 0 || ss >= 60) return null;
  return mm * 60 + ss;
}

function confidenceToNumber(conf: any): number {
  if (conf == null) return 0;
  if (typeof conf === 'number') return clamp(conf, 0, 1);
  if (conf === 'high') return 0.9;
  if (conf === 'medium') return 0.65;
  if (conf === 'low') return 0.4;
  return 0;
}

function normalizeLiftName(nameRaw: any): 'Squat' | 'Bench Press' | 'Deadlift' | 'Overhead Press' | null {
  const n = String(nameRaw || '').toLowerCase();
  if (!n) return null;
  if (/\bdeadlift\b/.test(n)) return 'Deadlift';
  if (/\bbench\b/.test(n)) return 'Bench Press';
  if (/\boverhead\b|\bohp\b|\bmilitary\b|\bshoulder press\b/.test(n)) return 'Overhead Press';
  if (/\bsquat\b/.test(n)) return 'Squat';
  return null;
}

export async function getBlockAdaptation(
  userId: string,
  blockStartDateISO: string,
  blockEndDateISO: string,
  supabase: SupabaseClient,
  opts?: { focus?: BlockFocus }
): Promise<BlockAdaptation> {
  const nowIso = new Date().toISOString();

  // 1) Cache hit
  try {
    const { data: cached, error } = await supabase
      .from('block_adaptation_cache')
      .select(
        'aerobic_efficiency_trend,aerobic_efficiency_improvement_pct,strength_progression_trend,strength_overall_gain_pct,baseline_recommendations,expires_at'
      )
      .eq('user_id', userId)
      .eq('block_start_date', blockStartDateISO)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (!error && cached) {
      const weeklyTrend = (parseJson<any>(cached.aerobic_efficiency_trend) || []) as any[];
      const strengthTrend = (parseJson<any>(cached.strength_progression_trend) || {}) as any;
      const baselineRecos = (parseJson<any>(cached.baseline_recommendations) || []) as any[];
      const cachedExclusions =
        strengthTrend?.aerobic_exclusions && typeof strengthTrend.aerobic_exclusions === 'object'
          ? strengthTrend.aerobic_exclusions
          : undefined;
      const cachedLongRunTrend =
        strengthTrend?.long_run_trend && Array.isArray(strengthTrend.long_run_trend)
          ? strengthTrend.long_run_trend
          : undefined;
      const cachedLongRunExclusions =
        strengthTrend?.long_run_exclusions && typeof strengthTrend.long_run_exclusions === 'object'
          ? strengthTrend.long_run_exclusions
          : undefined;

      const aerobic_efficiency = {
        weekly_trend: Array.isArray(weeklyTrend) ? weeklyTrend : [],
        improvement_pct: cached.aerobic_efficiency_improvement_pct != null ? Number(cached.aerobic_efficiency_improvement_pct) : null,
        confidence: confidenceLabelFromWeeklyCounts(
          (Array.isArray(weeklyTrend) ? weeklyTrend : []).map((w: any) => Number(w?.sample_count || 0))
        ),
        sample_count: (Array.isArray(weeklyTrend) ? weeklyTrend : []).reduce((s: number, w: any) => s + Number(w?.sample_count || 0), 0),
        excluded_reasons: cachedExclusions,
      };

      const long_run_endurance = cachedLongRunTrend
        ? (() => {
            const trend = cachedLongRunTrend.map((w: any) => ({
              ...w,
              avg_efficiency:
                Number(w?.sample_count || 0) > 0 && Number(w?.avg_pace) > 0 && Number(w?.avg_hr) > 0
                  ? Number((Number(w.avg_pace) / Number(w.avg_hr)).toFixed(6))
                  : 0,
            }));

            const w1 = trend?.[0]?.sample_count ? Number(trend[0].avg_efficiency) : null;
            const w4 = trend?.[3]?.sample_count ? Number(trend[3].avg_efficiency) : null;
            const improvement_pct =
              w1 != null && w4 != null && w1 !== 0 ? Number((((w1 - w4) / w1) * 100).toFixed(2)) : null;

            const counts = Array.isArray(trend) ? trend.map((x: any) => Number(x?.sample_count || 0)) : [];
            return {
              weekly_trend: trend,
              improvement_pct,
              confidence: confidenceLabelFromWeeklyCounts(counts),
              sample_count: trend.reduce((s: number, w: any) => s + Number(w?.sample_count || 0), 0),
              excluded_reasons: cachedLongRunExclusions,
            };
          })()
        : undefined;

      const strength_progression = {
        by_exercise: strengthTrend?.by_exercise && typeof strengthTrend.by_exercise === 'object' ? strengthTrend.by_exercise : {},
        overall_gain_pct: cached.strength_overall_gain_pct != null ? Number(cached.strength_overall_gain_pct) : null,
      };

      const baseline_recommendations = Array.isArray(baselineRecos) ? baselineRecos : [];

      const overview = computeOverview(
        { aerobic_efficiency, long_run_endurance, strength_progression, baseline_recommendations },
        opts?.focus
      );

      return {
        overview,
        aerobic_efficiency: {
          ...aerobic_efficiency,
        },
        long_run_endurance,
        strength_progression,
        baseline_recommendations,
      };
    }
  } catch (e) {
    console.error('[block-adaptation] cache read failed:', e);
  }

  // 2) Compute fresh
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('date,computed,type')
    .eq('user_id', userId)
    .eq('workout_status', 'completed')
    .gte('date', blockStartDateISO)
    .lte('date', blockEndDateISO);
  if (wErr) throw wErr;

  const parsed = (workouts || []).map((w: any) => ({
    date: String(w?.date || ''),
    type: String(w?.type || ''),
    computed: parseJson<any>(w?.computed) || {},
  }));

  // Aerobic efficiency trend
  const aeroBuckets: Array<{ pace: number; hr: number; eff: number }>[] = [[], [], [], []];
  const aeroExcluded: Record<string, number> = {};
  // Long run lane
  const longBuckets: Array<{ pace: number | null; hr: number | null; dur: number | null }>[] = [[], [], [], []];
  const longExcluded: Record<string, number> = {};

  // Strength progression buckets: exercise -> week -> entries
  const strengthBuckets: Record<string, Array<{ weight: number; rir: number | null; est1rm: number }>[] > = {};

  for (const w of parsed) {
    const week = weekOfBlock(w.date, blockStartDateISO);
    const adaptation = w.computed?.adaptation;
    if (!adaptation) continue;

    if (adaptation.workout_type === 'easy_z2') {
      const pace = Number(adaptation.avg_pace_at_z2);
      const hr = Number(adaptation.avg_hr_in_z2);
      const eff = Number(adaptation.aerobic_efficiency);
      if (Number.isFinite(pace) && Number.isFinite(hr) && Number.isFinite(eff)) {
        aeroBuckets[week - 1].push({ pace, hr, eff });
      }
    } else if (adaptation.workout_type === 'non_comparable') {
      const reason = String(adaptation.excluded_reason || 'non_comparable');
      aeroExcluded[reason] = (aeroExcluded[reason] || 0) + 1;
    } else if (adaptation.workout_type === 'long_run') {
      const pace = adaptation.avg_pace != null ? Number(adaptation.avg_pace) : null;
      const hr = adaptation.avg_hr != null ? Number(adaptation.avg_hr) : null;
      const dur = adaptation.duration_min != null ? Number(adaptation.duration_min) : null;
      longBuckets[week - 1].push({ pace: Number.isFinite(pace as any) ? (pace as number) : null, hr: Number.isFinite(hr as any) ? (hr as number) : null, dur: Number.isFinite(dur as any) ? (dur as number) : null });
      if (adaptation.excluded_reason) {
        const reason = String(adaptation.excluded_reason);
        longExcluded[reason] = (longExcluded[reason] || 0) + 1;
      }
    }

    const se = Array.isArray(adaptation.strength_exercises) ? adaptation.strength_exercises : [];
    if (se.length) {
      for (const ex of se) {
        const lift = normalizeLiftName(ex?.exercise);
        if (!lift) continue;
        if (!strengthBuckets[lift]) strengthBuckets[lift] = [[], [], [], []];
        const weight = Number(ex?.weight);
        const rir = ex?.avg_rir != null ? Number(ex.avg_rir) : null;
        const est1rm = Number(ex?.estimated_1rm);
        if (Number.isFinite(weight) && weight > 0 && Number.isFinite(est1rm) && est1rm > 0) {
          strengthBuckets[lift][week - 1].push({ weight, rir: Number.isFinite(rir) ? rir : null, est1rm });
        }
      }
    }
  }

  const weeklyTrend = [1, 2, 3, 4].map((week) => {
    const items = aeroBuckets[week - 1];
    const sample_count = items.length;
    const avg_pace = sample_count ? Math.round(items.reduce((s, it) => s + it.pace, 0) / sample_count) : 0;
    const avg_hr = sample_count ? Math.round(items.reduce((s, it) => s + it.hr, 0) / sample_count) : 0;
    const avg_efficiency = sample_count ? Number((items.reduce((s, it) => s + it.eff, 0) / sample_count).toFixed(6)) : 0;
    return { week, avg_pace, avg_hr, avg_efficiency, sample_count };
  });

  const week1Eff = weeklyTrend[0].sample_count ? weeklyTrend[0].avg_efficiency : null;
  const week4Eff = weeklyTrend[3].sample_count ? weeklyTrend[3].avg_efficiency : null;
  const improvementPct =
    week1Eff != null && week4Eff != null && week1Eff !== 0
      ? Number((((week1Eff - week4Eff) / week1Eff) * 100).toFixed(2)) // lower pace/hr ratio is better; decreasing is improvement
      : null;

  const aeroCounts = weeklyTrend.map((w) => w.sample_count);
  const aeroConfidence = confidenceLabelFromWeeklyCounts(aeroCounts);

  const longRunTrend = [1, 2, 3, 4].map((week) => {
    const items = longBuckets[week - 1];
    const sample_count = items.length;
    const paceItems = items.map((i) => i.pace).filter((v) => v != null) as number[];
    const hrItems = items.map((i) => i.hr).filter((v) => v != null) as number[];
    const durItems = items.map((i) => i.dur).filter((v) => v != null) as number[];
    const avg_pace = paceItems.length ? Math.round(paceItems.reduce((s, v) => s + v, 0) / paceItems.length) : 0;
    const avg_hr = hrItems.length ? Math.round(hrItems.reduce((s, v) => s + v, 0) / hrItems.length) : 0;
    const avg_duration_min = durItems.length ? Math.round(durItems.reduce((s, v) => s + v, 0) / durItems.length) : 0;
    const avg_efficiency = sample_count && avg_pace > 0 && avg_hr > 0 ? Number((avg_pace / avg_hr).toFixed(6)) : 0;
    return { week, avg_pace, avg_hr, avg_duration_min, avg_efficiency, sample_count };
  });

  const longW1Eff = longRunTrend[0].sample_count ? longRunTrend[0].avg_efficiency : null;
  const longW4Eff = longRunTrend[3].sample_count ? longRunTrend[3].avg_efficiency : null;
  const longImprovementPct =
    longW1Eff != null && longW4Eff != null && longW1Eff !== 0
      ? Number((((longW1Eff - longW4Eff) / longW1Eff) * 100).toFixed(2))
      : null;
  const longCounts = longRunTrend.map((w) => w.sample_count);
  const longConfidence = confidenceLabelFromWeeklyCounts(longCounts);

  // Strength progression trend
  const byExercise: BlockAdaptation['strength_progression']['by_exercise'] = {};
  const gains: number[] = [];

  for (const [lift, weeks] of Object.entries(strengthBuckets)) {
    const series = [1, 2, 3, 4].map((week) => {
      const items = weeks[week - 1] || [];
      const sample_count = items.length;
      const weight = sample_count ? Number((items.reduce((s, it) => s + it.weight, 0) / sample_count).toFixed(2)) : 0;
      const est1 = sample_count ? Math.round(items.reduce((s, it) => s + it.est1rm, 0) / sample_count) : 0;
      const validRirs = items.map((it) => it.rir).filter((v) => v != null && Number.isFinite(v)) as number[];
      const avg_rir = validRirs.length ? Number((validRirs.reduce((s, v) => s + v, 0) / validRirs.length).toFixed(1)) : null;
      return { week, weight, avg_rir, estimated_1rm: est1, sample_count };
    });
    byExercise[lift] = series;

    const w1 = series[0].sample_count ? series[0].estimated_1rm : null;
    const w4 = series[3].sample_count ? series[3].estimated_1rm : null;
    if (w1 != null && w4 != null && w1 > 0) gains.push(((w4 - w1) / w1) * 100);
  }

  const overallGainPct = gains.length ? Number((gains.reduce((s, g) => s + g, 0) / gains.length).toFixed(2)) : null;

  // Baseline recommendations (conservative: only metrics we can compare reliably)
  const baselineRecos: BlockAdaptation['baseline_recommendations'] = [];
  try {
    const { data: baseline } = await supabase
      .from('user_baselines')
      .select('performance_numbers,learned_fitness')
      .eq('user_id', userId)
      .maybeSingle();

    const perf = parseJson<any>(baseline?.performance_numbers) || {};
    const learned = parseJson<any>(baseline?.learned_fitness) || {};

    // Run easy pace: learned sec/km vs manual mm:ss/mi
    const learnedEasyPace = learned?.run_easy_pace_sec_per_km;
    const learnedEasyConf = confidenceToNumber(learnedEasyPace?.confidence);
    const manualEasy = parseMmSsPerMiToSeconds(perf?.easyPace);
    const learnedEasySecPerKm = Number(learnedEasyPace?.value);
    if (manualEasy != null && Number.isFinite(learnedEasySecPerKm) && learnedEasyConf >= 0.7) {
      const learnedSecPerMi = learnedEasySecPerKm * 1.60934;
      const deltaPct = Math.abs(learnedSecPerMi - manualEasy) / manualEasy;
      if (deltaPct >= 0.05) {
        baselineRecos.push({
          type: 'run_easy_pace',
          current_value: manualEasy,
          recommended_value: Math.round(learnedSecPerMi),
          confidence: learnedEasyConf,
          evidence: `Learned from recent easy runs (confidence ${(learnedEasyConf * 100).toFixed(0)}%).`,
          impact: 'Improves pace targets and workload estimates for easy runs.',
        });
      }
    }

    // Ride FTP: learned vs manual ftp
    const learnedFtp = learned?.ride_ftp_estimated;
    const learnedFtpConf = confidenceToNumber(learnedFtp?.confidence);
    const manualFtp = Number(perf?.ftp);
    const learnedFtpVal = Number(learnedFtp?.value);
    if (Number.isFinite(manualFtp) && manualFtp > 0 && Number.isFinite(learnedFtpVal) && learnedFtpVal > 0 && learnedFtpConf >= 0.7) {
      const deltaPct = Math.abs(learnedFtpVal - manualFtp) / manualFtp;
      if (deltaPct >= 0.05) {
        baselineRecos.push({
          type: 'ride_ftp',
          current_value: Math.round(manualFtp),
          recommended_value: Math.round(learnedFtpVal),
          confidence: learnedFtpConf,
          evidence: `Estimated from recent rides (confidence ${(learnedFtpConf * 100).toFixed(0)}%).`,
          impact: 'Improves cycling workload and intensity calculations.',
        });
      }
    }
  } catch (e) {
    console.error('[block-adaptation] baseline recommendations failed:', e);
  }

  // Keep max 2 recos (highest confidence first, then biggest delta)
  baselineRecos.sort((a, b) => (b.confidence - a.confidence) || (Math.abs(b.recommended_value - b.current_value) - Math.abs(a.recommended_value - a.current_value)));
  const baselineRecosTop = baselineRecos.slice(0, 2);

  const result: BlockAdaptation = {
    overview: computeOverview(
      {
        aerobic_efficiency: {
          weekly_trend: weeklyTrend,
          improvement_pct: improvementPct,
          confidence: aeroConfidence,
          sample_count: weeklyTrend.reduce((s, w) => s + w.sample_count, 0),
          excluded_reasons: aeroExcluded,
        },
        long_run_endurance: {
          weekly_trend: longRunTrend,
          improvement_pct: longImprovementPct,
          confidence: longConfidence,
          sample_count: longRunTrend.reduce((s, w) => s + w.sample_count, 0),
          excluded_reasons: longExcluded,
        },
        strength_progression: {
          by_exercise: byExercise,
          overall_gain_pct: overallGainPct,
        },
        baseline_recommendations: baselineRecosTop,
      },
      opts?.focus
    ),
    aerobic_efficiency: {
      weekly_trend: weeklyTrend,
      improvement_pct: improvementPct,
      confidence: aeroConfidence,
      sample_count: weeklyTrend.reduce((s, w) => s + w.sample_count, 0),
      excluded_reasons: aeroExcluded,
    },
    long_run_endurance: {
      weekly_trend: longRunTrend,
      improvement_pct: longImprovementPct,
      confidence: longConfidence,
      sample_count: longRunTrend.reduce((s, w) => s + w.sample_count, 0),
      excluded_reasons: longExcluded,
    },
    strength_progression: {
      by_exercise: byExercise,
      overall_gain_pct: overallGainPct,
    },
    baseline_recommendations: baselineRecosTop,
  };

  // 3) Store in cache (upsert)
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('block_adaptation_cache').upsert(
      {
        user_id: userId,
        block_start_date: blockStartDateISO,
        block_end_date: blockEndDateISO,
        aerobic_efficiency_trend: result.aerobic_efficiency.weekly_trend,
        aerobic_efficiency_improvement_pct: result.aerobic_efficiency.improvement_pct,
        strength_progression_trend: {
          by_exercise: result.strength_progression.by_exercise,
          aerobic_exclusions: result.aerobic_efficiency.excluded_reasons || {},
          long_run_trend: result.long_run_endurance?.weekly_trend || [],
          long_run_exclusions: result.long_run_endurance?.excluded_reasons || {},
        },
        strength_overall_gain_pct: result.strength_progression.overall_gain_pct,
        baseline_recommendations: result.baseline_recommendations,
        computed_at: nowIso,
        expires_at: expiresAt,
      },
      { onConflict: 'user_id,block_start_date' }
    );
    if (error) console.error('[block-adaptation] cache upsert failed:', error);
  } catch (e) {
    console.error('[block-adaptation] cache write failed:', e);
  }

  return result;
}

