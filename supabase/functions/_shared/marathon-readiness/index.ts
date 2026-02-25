/**
 * =============================================================================
 * MARATHON READINESS — Phase 3.5
 * =============================================================================
 *
 * Checklist-based assessment for marathon readiness.
 * Uses 6–8 week lookback against workout_facts.
 * No suggestion flow — assessment only.
 *
 * Checklist:
 * - Long run ≥ 18 mi in last 6 weeks
 * - Weekly volume trending ≥ 40 mpw (avg over last 4 weeks)
 * - Long run or M-pace work in last 4 weeks (proxy: run ≥ 90 min)
 * - ACWR in safe range (0.8–1.5 optimal, 1.5–1.7 elevated, >1.7 high risk)
 * - Durability risk (when block data available)
 */

const MILES_18_M = 18 * 1609.34;
const MIN_MPW_TARGET = 40;
const LONG_RUN_MIN_MINUTES = 90;
const SIX_WEEKS_DAYS = 42;
const FOUR_WEEKS_DAYS = 28;

export interface MarathonReadinessItem {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** Optional raw value for display */
  value?: string | number;
}

export interface MarathonReadinessResult {
  applicable: boolean;
  items: MarathonReadinessItem[];
  /** Summary: all pass, some pass, or none */
  summary: 'on_track' | 'needs_work' | 'insufficient_data';
}

interface WorkoutFactRow {
  date: string;
  discipline: string;
  duration_minutes: number | null;
  run_facts: Record<string, any> | null;
}

export async function computeMarathonReadiness(
  userId: string,
  focusDateIso: string,
  acwr: number | null,
  supabase: { from: (t: string) => any }
): Promise<MarathonReadinessResult | null> {
  const focusDate = new Date(focusDateIso + 'T12:00:00');
  const sixWeeksAgo = new Date(focusDate);
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - SIX_WEEKS_DAYS);
  const sixWeeksAgoIso = sixWeeksAgo.toISOString().slice(0, 10);
  const fourWeeksAgo = new Date(focusDate);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - FOUR_WEEKS_DAYS);
  const fourWeeksAgoIso = fourWeeksAgo.toISOString().slice(0, 10);

  const { data: facts, error } = await supabase
    .from('workout_facts')
    .select('date, discipline, duration_minutes, run_facts')
    .eq('user_id', userId)
    .eq('discipline', 'run')
    .gte('date', sixWeeksAgoIso)
    .lte('date', focusDateIso)
    .order('date', { ascending: false });

  if (error || !Array.isArray(facts) || facts.length === 0) {
    return null;
  }

  const rows = facts as WorkoutFactRow[];

  // 1. Long run ≥ 18 mi in last 6 weeks
  let longestRunM = 0;
  for (const r of rows) {
    if (r.date < sixWeeksAgoIso) continue;
    const distM = r.run_facts?.distance_m ?? 0;
    if (distM > longestRunM) longestRunM = distM;
  }
  const longestRunMi = longestRunM / 1609.34;
  const longRunPass = longestRunMi >= 18;

  // 2. Weekly volume ≥ 40 mpw (avg over last 4 weeks)
  let totalRunM4w = 0;
  for (const r of rows) {
    if (r.date < fourWeeksAgoIso) continue;
    totalRunM4w += r.run_facts?.distance_m ?? 0;
  }
  const avgMpw = totalRunM4w > 0 ? (totalRunM4w / 1609.34) / 4 : 0;
  const volumePass = avgMpw >= MIN_MPW_TARGET;

  // 3. Long run or M-pace proxy (run ≥ 90 min) in last 4 weeks
  let hasLongOrMpace = false;
  for (const r of rows) {
    if (r.date < fourWeeksAgoIso) continue;
    const dur = r.duration_minutes ?? 0;
    const distM = r.run_facts?.distance_m ?? 0;
    // Long run: ≥ 90 min or ≥ 18 mi
    if (dur >= LONG_RUN_MIN_MINUTES || distM >= MILES_18_M) {
      hasLongOrMpace = true;
      break;
    }
  }
  const mpacePass = hasLongOrMpace;

  // 4. ACWR in safe range
  const acwrPass = acwr != null && acwr >= 0.8 && acwr <= 1.5;
  const acwrElevated = acwr != null && acwr > 1.5 && acwr <= 1.7;
  const acwrHighRisk = acwr != null && acwr > 1.7;

  // 5. Durability risk — from goal predictor when block data available.
  // Coach doesn't have block data; use ACWR as proxy: high ACWR = elevated durability concern.
  const durabilityLabel: 'low' | 'medium' | 'high' | null =
    acwrHighRisk ? 'high' : acwrElevated ? 'medium' : acwr != null && acwr >= 0.8 && acwr <= 1.5 ? 'low' : null;
  const durabilityPass = durabilityLabel === 'low' || durabilityLabel === null;

  const items: MarathonReadinessItem[] = [
    {
      id: 'long_run',
      label: 'Long run ≥ 18 mi in last 6 weeks',
      pass: longRunPass,
      detail: longRunPass
        ? `Longest: ${longestRunMi.toFixed(1)} mi`
        : longestRunMi > 0
          ? `Longest: ${longestRunMi.toFixed(1)} mi (need 18)`
          : 'No long runs logged',
      value: longestRunMi > 0 ? `${longestRunMi.toFixed(1)} mi` : undefined,
    },
    {
      id: 'volume',
      label: `Weekly volume trending ≥ ${MIN_MPW_TARGET} mpw`,
      pass: volumePass,
      detail: avgMpw > 0 ? `Avg: ${avgMpw.toFixed(1)} mpw (last 4 weeks)` : 'No run volume in last 4 weeks',
      value: avgMpw > 0 ? `${avgMpw.toFixed(1)} mpw` : undefined,
    },
    {
      id: 'mpace',
      label: 'Long run or M-pace work in last 4 weeks',
      pass: mpacePass,
      detail: mpacePass ? 'Yes' : 'No runs ≥ 90 min',
    },
    {
      id: 'acwr',
      label: 'ACWR in safe range',
      pass: acwrPass,
      detail: acwr != null
        ? acwr < 0.8
          ? `ACWR ${acwr.toFixed(2)} — low (undertraining; target 0.8–1.5)`
          : acwr > 1.5
            ? `ACWR ${acwr.toFixed(2)} — high (ramping too fast; target 0.8–1.5)`
            : `ACWR ${acwr.toFixed(2)} (0.8–1.5 optimal)`
        : 'No ACWR data',
      value: acwr != null ? acwr.toFixed(2) : undefined,
    },
    {
      id: 'durability',
      label: 'Durability risk',
      pass: durabilityPass,
      detail: durabilityLabel != null
        ? durabilityLabel === 'low'
          ? 'Low — load is sustainable'
          : durabilityLabel === 'high'
            ? 'High — legs may fade late in race'
            : 'Medium — watch recovery'
        : '— (no block data)',
      value: durabilityLabel ?? '—',
    },
  ];

  const passCount = items.filter((i) => i.pass).length;
  let summary: MarathonReadinessResult['summary'] = 'insufficient_data';
  if (passCount >= 4) summary = 'on_track';
  else if (passCount >= 1 || rows.length > 0) summary = 'needs_work';

  return {
    applicable: true,
    items,
    summary,
  };
}
