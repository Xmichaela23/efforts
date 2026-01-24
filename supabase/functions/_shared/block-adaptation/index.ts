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

export type BlockAdaptation = {
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
  supabase: SupabaseClient
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

      return {
        aerobic_efficiency: {
          weekly_trend: Array.isArray(weeklyTrend) ? weeklyTrend : [],
          improvement_pct: cached.aerobic_efficiency_improvement_pct != null ? Number(cached.aerobic_efficiency_improvement_pct) : null,
          confidence: confidenceLabelFromWeeklyCounts(
            (Array.isArray(weeklyTrend) ? weeklyTrend : []).map((w: any) => Number(w?.sample_count || 0))
          ),
          sample_count: (Array.isArray(weeklyTrend) ? weeklyTrend : []).reduce((s: number, w: any) => s + Number(w?.sample_count || 0), 0),
        },
        strength_progression: {
          by_exercise: strengthTrend?.by_exercise && typeof strengthTrend.by_exercise === 'object' ? strengthTrend.by_exercise : {},
          overall_gain_pct: cached.strength_overall_gain_pct != null ? Number(cached.strength_overall_gain_pct) : null,
        },
        baseline_recommendations: Array.isArray(baselineRecos) ? baselineRecos : [],
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
    aerobic_efficiency: {
      weekly_trend: weeklyTrend,
      improvement_pct: improvementPct,
      confidence: aeroConfidence,
      sample_count: weeklyTrend.reduce((s, w) => s + w.sample_count, 0),
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
        strength_progression_trend: { by_exercise: result.strength_progression.by_exercise },
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

