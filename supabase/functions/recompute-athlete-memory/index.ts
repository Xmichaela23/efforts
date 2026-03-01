import { createClient } from 'jsr:@supabase/supabase-js@2';

type Confidence = number;

interface RecomputeRequest {
  user_id: string;
  period_end?: string;        // defaults to current week Sunday
  period_weeks?: number;      // defaults to 4
  history_weeks?: number;     // defaults to 24
  entry_type?: 'automated' | 'user_corrected' | 'coach_override';
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_PERIOD_WEEKS = 4;
const DEFAULT_HISTORY_WEEKS = 24;
const ENGINE_VERSION = 'memory-v1';
const SCHEMA_VERSION = 'v1';

const INJURY_KEYWORDS: Array<{ pattern: RegExp; flag: string }> = [
  { pattern: /\bachilles|heel\b/i, flag: 'achilles_tendon' },
  { pattern: /\bit[\s_-]?band|iliotibial\b/i, flag: 'it_band' },
  { pattern: /\bplantar\b/i, flag: 'plantar_fascia' },
  { pattern: /\bshin\b/i, flag: 'shin_splints' },
  { pattern: /\bcalf\b/i, flag: 'calf' },
  { pattern: /\bhamstring\b/i, flag: 'hamstring' },
  { pattern: /\bquad\b/i, flag: 'quad' },
  { pattern: /\bknee\b/i, flag: 'knee' },
  { pattern: /\bhip\b/i, flag: 'hip' },
  { pattern: /\blower\s*back|lumbar|back pain\b/i, flag: 'lower_back' },
];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sundayOf(date: Date): Date {
  const m = mondayOf(date);
  const s = new Date(m);
  s.setDate(m.getDate() + 6);
  return s;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function confidenceFromSamples(count: number, low: number, high: number): Confidence {
  if (count <= 0) return 0;
  if (count >= high) return 1;
  if (count <= low) return 0.35;
  const t = (count - low) / (high - low);
  return clamp(0.35 + t * 0.65, 0.35, 1);
}

function extractInjuryFlagsFromBlob(input: unknown): string[] {
  const text = typeof input === 'string' ? input : JSON.stringify(input || {});
  const found = new Set<string>();
  for (const { pattern, flag } of INJURY_KEYWORDS) {
    if (pattern.test(text)) found.add(flag);
  }
  return Array.from(found);
}

function normalizeDiscipline(typeRaw: unknown): 'run' | 'bike' | 'swim' | 'strength' | 'mobility' | 'other' {
  const t = String(typeRaw || '').toLowerCase();
  if (t.includes('run')) return 'run';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return 'bike';
  if (t.includes('swim')) return 'swim';
  if (t.includes('strength') || t.includes('weight')) return 'strength';
  if (t.includes('mobility') || t === 'pt') return 'mobility';
  return 'other';
}

function marathonMinWeeksFromHistory(
  avgRunMinutes: number,
  maxLongRunMinutes: number,
  avgAdherencePct: number,
): { base: number; beginner: number; intermediate: number; advanced: number } {
  let base = 12;
  if (avgRunMinutes >= 360 && maxLongRunMinutes >= 120 && avgAdherencePct >= 65) base = 6;
  else if (avgRunMinutes >= 300 && maxLongRunMinutes >= 100 && avgAdherencePct >= 60) base = 7;
  else if (avgRunMinutes >= 220 && maxLongRunMinutes >= 80) base = 8;
  else if (avgRunMinutes >= 160 && maxLongRunMinutes >= 60) base = 10;
  else base = 12;

  return {
    base,
    beginner: Math.max(base, 12),
    intermediate: Math.max(base, 6),
    advanced: Math.max(base, 5),
  };
}

type RuleHealth = {
  confidence: number;
  sufficiency: number;
  confidenceThreshold: number;
  sufficiencyThreshold: number;
};

type NamespaceResult = {
  name: 'run' | 'bike' | 'strength';
  rules: RuleHealth[];
};

function isNamespaceUsable(ns: NamespaceResult): boolean {
  return ns.rules.some((r) =>
    Number.isFinite(r.confidence) &&
    Number.isFinite(r.sufficiency) &&
    r.confidence >= r.confidenceThreshold &&
    r.sufficiency >= r.sufficiencyThreshold,
  );
}

function insufficientCrossRule(
  rule: string,
  dependencies: Record<string, boolean>,
): { value: null; status: 'insufficient_data'; dependencies: Record<string, boolean> } {
  return {
    value: null,
    status: 'insufficient_data',
    dependencies,
  };
}

function computeCrossRules(
  runRules: NamespaceResult,
  bikeRules: NamespaceResult,
  strengthRules: NamespaceResult,
  crossInterferenceRiskRaw: number | null,
  concurrentLoadRampRiskRaw: number | null,
  taperSensitivityRaw: number | null,
) {
  const hasRunSignal = isNamespaceUsable(runRules);
  const hasBikeSignal = isNamespaceUsable(bikeRules);
  const hasStrengthSignal = isNamespaceUsable(strengthRules);
  const hasEnduranceSignal = hasRunSignal || hasBikeSignal;

  const interference = hasEnduranceSignal && hasStrengthSignal
    ? { value: crossInterferenceRiskRaw, status: 'ok' as const, dependencies: { hasEnduranceSignal, hasStrengthSignal } }
    : insufficientCrossRule('interference_risk', { hasEnduranceSignal, hasStrengthSignal });

  const ramp = hasEnduranceSignal && hasStrengthSignal
    ? { value: concurrentLoadRampRiskRaw, status: 'ok' as const, dependencies: { hasEnduranceSignal, hasStrengthSignal } }
    : insufficientCrossRule('concurrent_load_ramp_risk', { hasEnduranceSignal, hasStrengthSignal });

  // Run-primary: bike can help but does not gate.
  const taper = hasRunSignal
    ? { value: taperSensitivityRaw, status: 'ok' as const, dependencies: { hasRunSignal, hasStrengthSignal } }
    : insufficientCrossRule('taper_sensitivity', { hasRunSignal, hasStrengthSignal });

  return {
    interference_risk: interference,
    concurrent_load_ramp_risk: ramp,
    taper_sensitivity: taper,
    namespace_dependencies: {
      hasRunSignal,
      hasBikeSignal,
      hasStrengthSignal,
      hasEnduranceSignal,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as RecomputeRequest;
    const userId = body?.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'user_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const periodWeeks = Number.isFinite(body?.period_weeks) ? Math.max(1, Math.floor(body.period_weeks!)) : DEFAULT_PERIOD_WEEKS;
    const historyWeeks = Number.isFinite(body?.history_weeks) ? Math.max(periodWeeks, Math.floor(body.history_weeks!)) : DEFAULT_HISTORY_WEEKS;
    const entryType = body?.entry_type || 'automated';

    const periodEndDate = body?.period_end ? sundayOf(new Date(body.period_end)) : sundayOf(new Date());
    const periodStartDate = addDays(periodEndDate, -(periodWeeks * 7) + 1);
    const previousPeriodEndDate = addDays(periodStartDate, -1);
    const previousPeriodStartDate = addDays(previousPeriodEndDate, -(periodWeeks * 7) + 1);
    const historyStartDate = addDays(periodEndDate, -(historyWeeks * 7) + 1);

    const periodEnd = toISODate(periodEndDate);
    const periodStart = toISODate(periodStartDate);
    const previousPeriodStart = toISODate(previousPeriodStartDate);
    const previousPeriodEnd = toISODate(previousPeriodEndDate);
    const historyStart = toISODate(historyStartDate);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const [{ data: snapshots }, { data: facts }, { data: workouts }, { data: baselines }, { data: existingMemory }] = await Promise.all([
      supabase
        .from('athlete_snapshot')
        .select('week_start, workload_total, workload_by_discipline, adherence_pct, run_long_run_duration, avg_readiness, run_easy_pace_at_hr')
        .eq('user_id', userId)
        .gte('week_start', historyStart)
        .lte('week_start', periodEnd)
        .order('week_start', { ascending: true }),
      supabase
        .from('workout_facts')
        .select('date, discipline, duration_minutes, workload, session_rpe, readiness, run_facts, strength_facts, ride_facts, swim_facts')
        .eq('user_id', userId)
        .gte('date', historyStart)
        .lte('date', periodEnd)
        .order('date', { ascending: true }),
      supabase
        .from('workouts')
        .select('date, type, moving_time, duration, avg_heart_rate, intensity_factor, workload_actual, workout_metadata, computed')
        .eq('user_id', userId)
        .eq('workout_status', 'completed')
        .gte('date', historyStart)
        .lte('date', periodEnd)
        .order('date', { ascending: true }),
      supabase
        .from('user_baselines')
        .select('effort_score, current_volume, learned_fitness')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('athlete_memory')
        .select('id, derived_rules, rule_confidence, data_sufficiency, peak_vo2_recorded, max_weekly_volume_minutes, injury_flags, efficiency_delta, confidence_score')
        .eq('user_id', userId)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle(),
    ]);

    const snapshotRows = snapshots || [];
    const factRows = facts || [];
    const workoutRows = workouts || [];

    // Weekly minutes by discipline from completed workouts, grouped by Monday anchor.
    const weeklyByDiscipline = {
      run: new Map<string, number>(),
      bike: new Map<string, number>(),
      swim: new Map<string, number>(),
      strength: new Map<string, number>(),
    };
    const strengthSetsByWeek = new Map<string, number>();
    const strengthRirSamples: number[] = [];
    const rideIfSamples: number[] = [];
    const swimPaceSamples: number[] = [];
    for (const w of workoutRows) {
      const disc = normalizeDiscipline(w.type);
      const mins = Number(w.moving_time ?? w.duration ?? 0);
      if (!Number.isFinite(mins) || mins <= 0) continue;
      const wk = toISODate(mondayOf(new Date(w.date)));
      if (disc === 'run') weeklyByDiscipline.run.set(wk, (weeklyByDiscipline.run.get(wk) || 0) + mins);
      if (disc === 'bike') weeklyByDiscipline.bike.set(wk, (weeklyByDiscipline.bike.get(wk) || 0) + mins);
      if (disc === 'swim') weeklyByDiscipline.swim.set(wk, (weeklyByDiscipline.swim.get(wk) || 0) + mins);
      if (disc === 'strength') weeklyByDiscipline.strength.set(wk, (weeklyByDiscipline.strength.get(wk) || 0) + mins);

      const ifVal = Number(w.intensity_factor ?? NaN);
      if (disc === 'bike' && Number.isFinite(ifVal) && ifVal > 0) rideIfSamples.push(ifVal);

      const computedBlob = w.computed as any;
      const maybeSwimPace = Number(computedBlob?.overall?.avg_pace_s_per_100m ?? computedBlob?.analysis?.swim?.pace_s_per_100m ?? NaN);
      if (disc === 'swim' && Number.isFinite(maybeSwimPace) && maybeSwimPace > 0) swimPaceSamples.push(maybeSwimPace);
    }

    for (const f of factRows) {
      const wk = toISODate(mondayOf(new Date(f.date)));
      const sf = (f as any).strength_facts as any;
      const totalSets = Number(sf?.total_sets ?? NaN);
      if (Number.isFinite(totalSets) && totalSets > 0) {
        strengthSetsByWeek.set(wk, (strengthSetsByWeek.get(wk) || 0) + totalSets);
      }
      const rir = Number(sf?.avg_rir ?? NaN);
      if (Number.isFinite(rir) && rir >= 0) strengthRirSamples.push(rir);

      const rideFacts = (f as any).ride_facts as any;
      const ifRide = Number(rideFacts?.intensity_factor ?? NaN);
      if (Number.isFinite(ifRide) && ifRide > 0) rideIfSamples.push(ifRide);

      const swimFacts = (f as any).swim_facts as any;
      const swimPace = Number(swimFacts?.pace_avg_s_per_100m ?? NaN);
      if (Number.isFinite(swimPace) && swimPace > 0) swimPaceSamples.push(swimPace);
    }

    const weeklyRunMinuteValues = Array.from(weeklyByDiscipline.run.values());
    const weeklyBikeMinuteValues = Array.from(weeklyByDiscipline.bike.values());
    const weeklySwimMinuteValues = Array.from(weeklyByDiscipline.swim.values());
    const weeklyStrengthMinuteValues = Array.from(weeklyByDiscipline.strength.values());
    const weeklyStrengthSetsValues = Array.from(strengthSetsByWeek.values());

    const maxWeeklyVolumeMinutes = weeklyRunMinuteValues.length ? Math.round(Math.max(...weeklyRunMinuteValues)) : null;
    const runVolumeCeilingMin = percentile(weeklyRunMinuteValues, 90);
    const bikeVolumeCeilingMin = percentile(weeklyBikeMinuteValues, 90);
    const swimVolumeCeilingMin = percentile(weeklySwimMinuteValues, 90);
    const strengthVolumeCeilingMin = percentile(weeklyStrengthMinuteValues, 90);
    const strengthVolumeCeilingSets = percentile(weeklyStrengthSetsValues, 90);
    const avgWeeklyRunMinutes = avg(weeklyRunMinuteValues) ?? 0;
    const avgWeeklyBikeMinutes = avg(weeklyBikeMinuteValues) ?? 0;
    const avgWeeklySwimMinutes = avg(weeklySwimMinuteValues) ?? 0;

    // Long-run and adherence history from snapshots.
    const longRunMinutes = snapshotRows
      .map((s) => Number(s.run_long_run_duration ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const maxLongRunMinutes = longRunMinutes.length ? Math.max(...longRunMinutes) : 0;
    const adherencePct = snapshotRows
      .map((s) => Number(s.adherence_pct ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgAdherencePct = avg(adherencePct) ?? 70;

    // Peak "VO2-like" signal: effort score from baselines (deterministic field available today).
    const peakVo2Recorded = (() => {
      const es = Number((baselines as any)?.effort_score ?? NaN);
      return Number.isFinite(es) && es > 0 ? es : null;
    })();

    // Efficiency metrics from workout_facts.run_facts.pace_at_easy_hr
    const currentPaces: number[] = [];
    const previousPaces: number[] = [];
    const allPaces: number[] = [];
    for (const f of factRows) {
      if (String(f.discipline || '').toLowerCase() !== 'run') continue;
      const pace = Number((f.run_facts as any)?.pace_at_easy_hr ?? NaN); // s/km
      if (!Number.isFinite(pace) || pace <= 0) continue;
      allPaces.push(pace);
      if (f.date >= periodStart && f.date <= periodEnd) currentPaces.push(pace);
      if (f.date >= previousPeriodStart && f.date <= previousPeriodEnd) previousPaces.push(pace);
    }
    const currentPace = avg(currentPaces);
    const previousPace = avg(previousPaces);
    const efficiencyDelta = (currentPace != null && previousPace != null && previousPace > 0)
      ? Math.round((((previousPace - currentPace) / previousPace) * 100) * 10) / 10
      : null;
    const efficiencyPeakPace = allPaces.length ? Math.round((Math.min(...allPaces) / 60) * 100) / 100 : null; // min/km

    // Aerobic floor HR from runs where easy-pace proxy exists.
    const easyHrSamples: number[] = [];
    for (const f of factRows) {
      if (String(f.discipline || '').toLowerCase() !== 'run') continue;
      const hasEasyPace = Number.isFinite(Number((f.run_facts as any)?.pace_at_easy_hr ?? NaN));
      if (!hasEasyPace) continue;
      const hr = Number((f.run_facts as any)?.hr_avg ?? NaN);
      if (Number.isFinite(hr) && hr > 0) easyHrSamples.push(hr);
    }
    const aerobicFloorHr = (() => {
      const med = median(easyHrSamples);
      if (med != null) return Math.round(med);
      const learned = Number((baselines as any)?.learned_fitness?.run_easy_hr?.value ?? NaN);
      return Number.isFinite(learned) && learned > 0 ? Math.round(learned) : null;
    })();

    // Taper sensitivity from snapshot week-over-week drop >= 20% in total workload
    const taperDeltas: number[] = [];
    for (let i = 1; i < snapshotRows.length; i++) {
      const prevLoad = Number(snapshotRows[i - 1].workload_total ?? 0);
      const curLoad = Number(snapshotRows[i].workload_total ?? 0);
      if (!Number.isFinite(prevLoad) || !Number.isFinite(curLoad) || prevLoad <= 0) continue;
      const dropPct = ((prevLoad - curLoad) / prevLoad) * 100;
      if (dropPct < 20) continue;
      const prevEnergy = Number(snapshotRows[i - 1]?.avg_readiness?.energy ?? NaN);
      const curEnergy = Number(snapshotRows[i]?.avg_readiness?.energy ?? NaN);
      if (!Number.isFinite(prevEnergy) || !Number.isFinite(curEnergy)) continue;
      const deltaEnergy = curEnergy - prevEnergy; // positive = feeling better
      taperDeltas.push(clamp(deltaEnergy / 2.0, 0, 1)); // +2 energy ≈ 1.0 sensitivity
    }
    const taperSensitivity = taperDeltas.length ? Math.round((avg(taperDeltas)! * 100)) / 100 : null;

    // Bike and swim adaptation proxies from snapshots/facts.
    const rideEfficiencyValues = snapshotRows
      .map((s) => Number(s.ride_efficiency_factor ?? NaN))
      .filter((v) => Number.isFinite(v) && v > 0);
    const rideCurrentEff = avg(
      snapshotRows
        .filter((s) => s.week_start >= periodStart && s.week_start <= periodEnd)
        .map((s) => Number(s.ride_efficiency_factor ?? NaN))
        .filter((v) => Number.isFinite(v) && v > 0),
    );
    const ridePrevEff = avg(
      snapshotRows
        .filter((s) => s.week_start >= previousPeriodStart && s.week_start <= previousPeriodEnd)
        .map((s) => Number(s.ride_efficiency_factor ?? NaN))
        .filter((v) => Number.isFinite(v) && v > 0),
    );
    const bikeEfficiencyDelta = (rideCurrentEff != null && ridePrevEff != null && ridePrevEff > 0)
      ? Math.round((((rideCurrentEff - ridePrevEff) / ridePrevEff) * 100) * 10) / 10
      : null;
    const bikeDurabilityScore = rideIfSamples.length ? Math.round((avg(rideIfSamples)! * 100)) / 100 : null;
    const swimEfficiencyPeakPace = swimPaceSamples.length ? Math.round((Math.min(...swimPaceSamples) / 60) * 100) / 100 : null; // min/100m

    // Strength tolerance/recovery proxies from RIR.
    const strengthIntensityTolerance = strengthRirSamples.length ? Math.round((avg(strengthRirSamples)! * 100)) / 100 : null;
    const strengthRecoveryHalfLifeDays = strengthIntensityTolerance == null
      ? null
      : strengthIntensityTolerance >= 2
        ? 1
        : strengthIntensityTolerance >= 1
          ? 2
          : 3;

    // Injury hotspots from deterministic text scan.
    const injurySet = new Set<string>();
    for (const w of workoutRows) {
      const flags = extractInjuryFlagsFromBlob({ workout_metadata: w.workout_metadata, computed: w.computed });
      for (const f of flags) injurySet.add(f);
    }
    for (const f of factRows) {
      const flags = extractInjuryFlagsFromBlob({ run_facts: f.run_facts, readiness: f.readiness });
      for (const flag of flags) injurySet.add(flag);
    }
    const injuryHotspots = Array.from(injurySet);

    // Cross-discipline interference: high when strength is high and run load is high in same week.
    const sharedWeeks = new Set<string>([
      ...Array.from(weeklyByDiscipline.run.keys()),
      ...Array.from(weeklyByDiscipline.strength.keys()),
    ]);
    const crossWeeklyScores: number[] = [];
    for (const wk of sharedWeeks) {
      const runMin = weeklyByDiscipline.run.get(wk) || 0;
      const strengthMin = weeklyByDiscipline.strength.get(wk) || 0;
      if (runMin <= 0 && strengthMin <= 0) continue;
      const score = clamp((runMin / 360) * 0.6 + (strengthMin / 180) * 0.4, 0, 1);
      crossWeeklyScores.push(score);
    }
    const crossInterferenceRiskRaw = crossWeeklyScores.length
      ? Math.round((avg(crossWeeklyScores)! * 100)) / 100
      : null;

    // Concurrent load ramp risk from week-over-week workload jumps.
    const weeklyLoads = snapshotRows
      .map((s) => Number(s.workload_total ?? NaN))
      .filter((v) => Number.isFinite(v) && v > 0);
    const weeklyRampJumps: number[] = [];
    for (let i = 1; i < weeklyLoads.length; i++) {
      const prev = weeklyLoads[i - 1];
      const cur = weeklyLoads[i];
      weeklyRampJumps.push((cur - prev) / prev);
    }
    const concurrentRampRiskRaw = weeklyRampJumps.length
      ? Math.round((clamp(Math.max(...weeklyRampJumps), -1, 1) * 100)) / 100
      : null;

    // Marathon readiness rule (deterministic).
    const marathonMin = marathonMinWeeksFromHistory(avgWeeklyRunMinutes, maxLongRunMinutes, avgAdherencePct);

    const dataSufficiency = {
      aerobic_floor_hr_runs: easyHrSamples.length,
      volume_ceiling_weeks: weeklyRunMinuteValues.length,
      efficiency_peak_pace_runs: allPaces.length,
      injury_hotspots_samples: workoutRows.length + factRows.length,
      taper_sensitivity_cycles: taperDeltas.length,
      snapshots_weeks: snapshotRows.length,
      bike_weeks: weeklyBikeMinuteValues.length,
      swim_weeks: weeklySwimMinuteValues.length,
      strength_weeks: weeklyStrengthMinuteValues.length,
      strength_sets_weeks: weeklyStrengthSetsValues.length,
      bike_if_samples: rideIfSamples.length,
      swim_pace_samples: swimPaceSamples.length,
      strength_rir_samples: strengthRirSamples.length,
      cross_overlap_weeks: crossWeeklyScores.length,
      weekly_ramp_samples: weeklyRampJumps.length,
    };

    const ruleConfidence = {
      aerobic_floor_hr: confidenceFromSamples(easyHrSamples.length, 3, 10),
      volume_ceiling_min: confidenceFromSamples(weeklyRunMinuteValues.length, 4, 12),
      efficiency_peak_pace: confidenceFromSamples(allPaces.length, 4, 15),
      injury_hotspots: confidenceFromSamples(workoutRows.length + factRows.length, 8, 30),
      taper_sensitivity: confidenceFromSamples(taperDeltas.length, 1, 4),
      marathon_min_weeks_recommended: confidenceFromSamples(snapshotRows.length + weeklyRunMinuteValues.length, 8, 20),
      bike_volume_ceiling_min: confidenceFromSamples(weeklyBikeMinuteValues.length, 3, 10),
      bike_durability_score: confidenceFromSamples(rideIfSamples.length, 3, 12),
      swim_volume_ceiling_min: confidenceFromSamples(weeklySwimMinuteValues.length, 3, 10),
      swim_efficiency_peak_pace: confidenceFromSamples(swimPaceSamples.length, 3, 12),
      strength_volume_ceiling_sets: confidenceFromSamples(weeklyStrengthSetsValues.length, 3, 10),
      strength_intensity_tolerance: confidenceFromSamples(strengthRirSamples.length, 4, 14),
      cross_interference_risk: confidenceFromSamples(crossWeeklyScores.length, 3, 10),
      cross_concurrent_load_ramp_risk: confidenceFromSamples(weeklyRampJumps.length, 3, 10),
      cross_taper_sensitivity: confidenceFromSamples(taperDeltas.length, 2, 8),
    };

    const runNamespace: NamespaceResult = {
      name: 'run',
      rules: [
        { confidence: ruleConfidence.aerobic_floor_hr, sufficiency: easyHrSamples.length, confidenceThreshold: 0.45, sufficiencyThreshold: 3 },
        { confidence: ruleConfidence.efficiency_peak_pace, sufficiency: allPaces.length, confidenceThreshold: 0.45, sufficiencyThreshold: 4 },
        { confidence: ruleConfidence.marathon_min_weeks_recommended, sufficiency: snapshotRows.length, confidenceThreshold: 0.35, sufficiencyThreshold: 4 },
      ],
    };
    const bikeNamespace: NamespaceResult = {
      name: 'bike',
      rules: [
        { confidence: ruleConfidence.bike_volume_ceiling_min, sufficiency: weeklyBikeMinuteValues.length, confidenceThreshold: 0.5, sufficiencyThreshold: 3 },
        { confidence: ruleConfidence.bike_durability_score, sufficiency: rideIfSamples.length, confidenceThreshold: 0.5, sufficiencyThreshold: 3 },
      ],
    };
    const strengthNamespace: NamespaceResult = {
      name: 'strength',
      rules: [
        { confidence: ruleConfidence.strength_volume_ceiling_sets, sufficiency: weeklyStrengthSetsValues.length, confidenceThreshold: 0.5, sufficiencyThreshold: 3 },
        { confidence: ruleConfidence.strength_intensity_tolerance, sufficiency: strengthRirSamples.length, confidenceThreshold: 0.5, sufficiencyThreshold: 4 },
      ],
    };
    const crossRules = computeCrossRules(
      runNamespace,
      bikeNamespace,
      strengthNamespace,
      crossInterferenceRiskRaw,
      concurrentRampRiskRaw,
      taperSensitivity,
    );

    if (crossRules.interference_risk.status !== 'ok') {
      ruleConfidence.cross_interference_risk = 0;
    }
    if (crossRules.concurrent_load_ramp_risk.status !== 'ok') {
      ruleConfidence.cross_concurrent_load_ramp_risk = 0;
    }
    if (crossRules.taper_sensitivity.status !== 'ok') {
      ruleConfidence.cross_taper_sensitivity = 0;
    }

    const confidenceScore = Math.round(
      (
        (ruleConfidence.aerobic_floor_hr * 0.20) +
        (ruleConfidence.volume_ceiling_min * 0.20) +
        (ruleConfidence.efficiency_peak_pace * 0.20) +
        (ruleConfidence.taper_sensitivity * 0.15) +
        (ruleConfidence.marathon_min_weeks_recommended * 0.15) +
        (ruleConfidence.bike_durability_score * 0.10)
      ) * 100
    ) / 100;

    const derivedRules = {
      run: {
        aerobic_floor_hr: aerobicFloorHr,
        volume_ceiling_min: runVolumeCeilingMin != null ? Math.round(runVolumeCeilingMin) : null,
        efficiency_peak_pace: efficiencyPeakPace, // min/km
        long_run_max_min: maxLongRunMinutes || null,
        marathon_min_weeks_recommended: marathonMin.base,
        marathon_min_weeks_by_fitness: {
          beginner: marathonMin.beginner,
          intermediate: marathonMin.intermediate,
          advanced: marathonMin.advanced,
        },
      },
      bike: {
        volume_ceiling_min: bikeVolumeCeilingMin != null ? Math.round(bikeVolumeCeilingMin) : null,
        aerobic_durability_score: bikeDurabilityScore,
        efficiency_delta_pct: bikeEfficiencyDelta,
        avg_weekly_minutes: Math.round(avgWeeklyBikeMinutes),
      },
      swim: {
        volume_ceiling_min: swimVolumeCeilingMin != null ? Math.round(swimVolumeCeilingMin) : null,
        efficiency_peak_pace: swimEfficiencyPeakPace, // min/100m
        avg_weekly_minutes: Math.round(avgWeeklySwimMinutes),
      },
      strength: {
        volume_ceiling_min: strengthVolumeCeilingMin != null ? Math.round(strengthVolumeCeilingMin) : null,
        volume_ceiling_sets: strengthVolumeCeilingSets != null ? Math.round(strengthVolumeCeilingSets) : null,
        intensity_tolerance: strengthIntensityTolerance,
        recovery_half_life_days: strengthRecoveryHalfLifeDays,
        injury_hotspots: injuryHotspots,
      },
      cross: {
        interference_risk: crossRules.interference_risk.value,
        concurrent_load_ramp_risk: crossRules.concurrent_load_ramp_risk.value,
        taper_sensitivity: crossRules.taper_sensitivity.value,
        dependency_status: {
          interference_risk: crossRules.interference_risk.dependencies,
          concurrent_load_ramp_risk: crossRules.concurrent_load_ramp_risk.dependencies,
          taper_sensitivity: crossRules.taper_sensitivity.dependencies,
          namespace: crossRules.namespace_dependencies,
        },
      },
      aerobic_floor_hr: aerobicFloorHr,
      volume_ceiling_min: runVolumeCeilingMin != null ? Math.round(runVolumeCeilingMin) : null,
      efficiency_peak_pace: efficiencyPeakPace, // min/km
      injury_hotspots: injuryHotspots,
      taper_sensitivity: crossRules.taper_sensitivity.value,
      marathon_min_weeks_recommended: marathonMin.base,
      marathon_min_weeks_by_fitness: {
        beginner: marathonMin.beginner,
        intermediate: marathonMin.intermediate,
        advanced: marathonMin.advanced,
      },
    };

    const dataSources = [
      'athlete_snapshot',
      'workout_facts',
      'workouts',
      ...(baselines ? ['user_baselines'] : []),
    ];

    const upsertPayload = {
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      peak_vo2_recorded: peakVo2Recorded,
      max_weekly_volume_minutes: maxWeeklyVolumeMinutes,
      injury_flags: injuryHotspots,
      efficiency_delta: efficiencyDelta,
      derived_rules: derivedRules,
      rule_confidence: ruleConfidence,
      data_sufficiency: dataSufficiency,
      data_sources: dataSources,
      entry_type: entryType,
      schema_version: SCHEMA_VERSION,
      engine_version: ENGINE_VERSION,
      confidence_score: confidenceScore,
      computed_at: new Date().toISOString(),
    };

    const { data: memoryRow, error: upsertErr } = await supabase
      .from('athlete_memory')
      .upsert(upsertPayload, { onConflict: 'user_id,period_start,period_end' })
      .select('id')
      .single();
    if (upsertErr) throw upsertErr;

    const eventPayload = {
      athlete_memory_id: memoryRow?.id || existingMemory?.id || null,
      user_id: userId,
      event_type: existingMemory ? 'recompute' : 'backfill',
      reason: 'deterministic_longitudinal_memory_bake',
      actor_type: 'system',
      previous_values: existingMemory
        ? {
            peak_vo2_recorded: existingMemory.peak_vo2_recorded,
            max_weekly_volume_minutes: existingMemory.max_weekly_volume_minutes,
            injury_flags: existingMemory.injury_flags,
            efficiency_delta: existingMemory.efficiency_delta,
            confidence_score: existingMemory.confidence_score,
            derived_rules: existingMemory.derived_rules,
            rule_confidence: existingMemory.rule_confidence,
            data_sufficiency: existingMemory.data_sufficiency,
          }
        : {},
      new_values: {
        peak_vo2_recorded: upsertPayload.peak_vo2_recorded,
        max_weekly_volume_minutes: upsertPayload.max_weekly_volume_minutes,
        injury_flags: upsertPayload.injury_flags,
        efficiency_delta: upsertPayload.efficiency_delta,
        confidence_score: upsertPayload.confidence_score,
        derived_rules: upsertPayload.derived_rules,
        rule_confidence: upsertPayload.rule_confidence,
        data_sufficiency: upsertPayload.data_sufficiency,
      },
      run_metadata: {
        period_start: periodStart,
        period_end: periodEnd,
        history_start: historyStart,
        period_weeks: periodWeeks,
        history_weeks: historyWeeks,
      },
      engine_version: ENGINE_VERSION,
      schema_version: SCHEMA_VERSION,
    };
    await supabase.from('athlete_memory_events').insert(eventPayload);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        period_start: periodStart,
        period_end: periodEnd,
        confidence_score: confidenceScore,
        derived_rules: derivedRules,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
