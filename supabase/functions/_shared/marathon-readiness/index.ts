/**
 * =============================================================================
 * MARATHON READINESS — Phase 3.5
 * =============================================================================
 *
 * Checklist-based assessment for marathon readiness.
 * Uses 6–8 week lookback against workout_facts.
 * No suggestion flow — assessment only.
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
  /** Specific, actionable one-liner shown below the checklist */
  summary_line?: string;
  context_note?: string;
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

  // 3. Long run or marathon-pace proxy (run ≥ 90 min) in last 4 weeks
  let hasLongOrMpace = false;
  for (const r of rows) {
    if (r.date < fourWeeksAgoIso) continue;
    const dur = r.duration_minutes ?? 0;
    const distM = r.run_facts?.distance_m ?? 0;
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

  // 5. Durability — ACWR proxy (no block data available in coach context)
  const durabilityLabel: 'low' | 'medium' | 'high' | null =
    acwrHighRisk ? 'high' : acwrElevated ? 'medium' : acwr != null && acwr >= 0.8 && acwr <= 1.5 ? 'low' : null;
  const durabilityPass = durabilityLabel === 'low' || durabilityLabel === null;

  const items: MarathonReadinessItem[] = [
    {
      id: 'long_run',
      label: 'Long run distance',
      pass: longRunPass,
      detail: longRunPass
        ? `Your longest run in the last 6 weeks is ${longestRunMi.toFixed(1)} mi — you've covered race-relevant distance.`
        : longestRunMi > 0
          ? `Longest run: ${longestRunMi.toFixed(1)} mi — you need at least one 18-miler before taper.`
          : 'No long runs logged in the last 6 weeks.',
      value: longestRunMi > 0 ? `${longestRunMi.toFixed(1)} mi` : undefined,
    },
    {
      id: 'volume',
      label: 'Weekly mileage',
      pass: volumePass,
      detail: avgMpw > 0
        ? volumePass
          ? `Averaging ${avgMpw.toFixed(1)} miles/week — enough volume to support the race.`
          : `Averaging ${avgMpw.toFixed(1)} miles/week over the last 4 weeks — building toward ${MIN_MPW_TARGET}.`
        : 'No run volume logged in the last 4 weeks.',
      value: avgMpw > 0 ? `${avgMpw.toFixed(1)} mi/wk` : undefined,
    },
    {
      id: 'mpace',
      label: 'Race-pace quality work',
      pass: mpacePass,
      detail: mpacePass
        ? 'You have a long run or hard effort in the last 4 weeks.'
        : 'No runs over 90 minutes in the last 4 weeks — a long run soon would help.',
    },
    {
      id: 'acwr',
      label: 'Training load balance',
      pass: acwrPass,
      detail: acwr != null
        ? acwr < 0.8
          ? `Load is below target (${acwr.toFixed(2)}) — you have room to build volume safely.`
          : acwr > 1.5
            ? `Load is elevated (${acwr.toFixed(2)}) — back off slightly to avoid injury risk before race day.`
            : `Load is balanced at ${acwr.toFixed(2)} — in the optimal range.`
        : 'Not enough data to assess training load.',
      value: acwr != null ? acwr.toFixed(2) : undefined,
    },
    {
      id: 'durability',
      label: 'Injury risk',
      pass: durabilityPass,
      detail: durabilityLabel === 'high'
        ? 'Load is high enough that legs may accumulate fatigue late in the race.'
        : durabilityLabel === 'medium'
          ? 'Load is elevated — build in a recovery day before race week.'
          : durabilityLabel === 'low'
            ? 'Load is sustainable — injury risk looks low.'
            : 'Load is too low to assess injury risk meaningfully.',
      value: durabilityLabel ?? '—',
    },
  ];

  const passCount = items.filter((i) => i.pass).length;
  let summary: MarathonReadinessResult['summary'] = 'insufficient_data';
  if (passCount >= 4) summary = 'on_track';
  else if (passCount >= 1 || rows.length > 0) summary = 'needs_work';

  // Build a specific, actionable summary line
  const summary_line = (() => {
    if (summary === 'on_track') {
      return 'Training base looks solid — stay consistent and trust the taper.';
    }
    if (summary === 'insufficient_data') {
      return 'Log more runs to get a reliable readiness picture.';
    }
    // needs_work — identify the most impactful gap
    const failingIds = items.filter((i) => !i.pass).map((i) => i.id);
    const parts: string[] = [];
    if (failingIds.includes('volume')) {
      const gap = (MIN_MPW_TARGET - avgMpw).toFixed(0);
      parts.push(`Weekly mileage is the main gap — averaging ${avgMpw.toFixed(1)} mi/wk, need to build toward ${MIN_MPW_TARGET}.`);
    }
    if (failingIds.includes('long_run')) {
      parts.push(`Get a run of at least 18 miles in before taper.`);
    }
    if (failingIds.includes('mpace')) {
      parts.push(`Add a long run or marathon-pace effort this week.`);
    }
    if (failingIds.includes('acwr') && acwr != null && acwr < 0.8) {
      parts.push(`Your load is low — you have room to add volume without injury risk.`);
    }
    if (failingIds.includes('acwr') && acwr != null && acwr > 1.5) {
      parts.push(`Ease back on volume this week — load is elevated.`);
    }
    return parts.length > 0 ? parts.join(' ') : 'Address the flagged items above before taper week.';
  })();

  return {
    applicable: true,
    items,
    summary,
    summary_line,
  };
}
