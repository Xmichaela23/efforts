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

  // Volume detail: fold ACWR context in so both signals read as one coherent message.
  // When volume is low AND load is low, tell the athlete they have room to build — not two
  // separate failing items that look contradictory.
  const volumeDetail = (() => {
    if (avgMpw <= 0) return 'No run volume logged in the last 4 weeks.';
    if (volumePass) return `Averaging ${avgMpw.toFixed(1)} miles/week — enough volume to support the race.`;
    const gap = (MIN_MPW_TARGET - avgMpw).toFixed(0);
    const safeToAdd = acwr != null && acwr < 0.8;
    const overloaded = acwr != null && acwr > 1.5;
    if (safeToAdd) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week — need to build toward ${MIN_MPW_TARGET}. Your current load is low, so adding ~${gap} miles/week is safe.`;
    }
    if (overloaded) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week — need to build toward ${MIN_MPW_TARGET}, but ease back this week before adding more volume.`;
    }
    return `Averaging ${avgMpw.toFixed(1)} miles/week — building toward ${MIN_MPW_TARGET}.`;
  })();

  // Injury risk: only surface when load is actually elevated. At low volume, it's noise.
  const injuryRiskVisible = durabilityLabel === 'high' || durabilityLabel === 'medium';
  const injuryRiskDetail = durabilityLabel === 'high'
    ? 'Load is high — legs may accumulate fatigue late in the race. Protect recovery before taper.'
    : durabilityLabel === 'medium'
      ? 'Load is a bit elevated — add a recovery day before race week.'
      : 'Load is sustainable — injury risk looks low.';

  const items: MarathonReadinessItem[] = [
    {
      id: 'long_run',
      label: 'Long run distance',
      pass: longRunPass,
      detail: longRunPass
        ? `Your longest run in the last 6 weeks is ${longestRunMi.toFixed(1)} mi — you've covered race-relevant distance.`
        : longestRunMi > 0
          ? `Longest run so far: ${longestRunMi.toFixed(1)} mi — you need at least one 18-miler before taper.`
          : 'No long runs logged in the last 6 weeks.',
      value: longestRunMi > 0 ? `${longestRunMi.toFixed(1)} mi` : undefined,
    },
    {
      id: 'volume',
      label: 'Weekly mileage',
      pass: volumePass,
      detail: volumeDetail,
      value: avgMpw > 0 ? `${avgMpw.toFixed(1)} mi/wk` : undefined,
    },
    {
      id: 'mpace',
      label: 'Race-pace quality work',
      pass: mpacePass,
      detail: mpacePass
        ? 'You have a long run or quality effort in the last 4 weeks — good.'
        : 'No runs over 90 minutes in the last 4 weeks — a long run soon would help.',
    },
    // Only show injury risk when load is actually elevated — at low volume it's redundant noise
    ...(injuryRiskVisible ? [{
      id: 'durability',
      label: 'Injury risk',
      pass: durabilityPass,
      detail: injuryRiskDetail,
      value: durabilityLabel ?? '—',
    }] : []),
  ];

  const passCount = items.filter((i) => i.pass).length;
  const totalItems = items.length;
  let summary: MarathonReadinessResult['summary'] = 'insufficient_data';
  if (passCount === totalItems) summary = 'on_track';
  else if (passCount >= 1 || rows.length > 0) summary = 'needs_work';

  // Specific, actionable summary line — one sentence the athlete can act on today
  const summary_line = (() => {
    if (summary === 'on_track') {
      return 'Training base looks solid — stay consistent and trust the taper.';
    }
    if (summary === 'insufficient_data') {
      return 'Log more runs to get a reliable readiness picture.';
    }
    const failingIds = items.filter((i) => !i.pass).map((i) => i.id);
    const parts: string[] = [];
    if (failingIds.includes('volume') && failingIds.includes('long_run')) {
      const safeToAdd = acwr != null && acwr < 0.8;
      parts.push(
        `Two priorities before taper: push your long run past 18 miles, and build weekly mileage toward 40.` +
        (safeToAdd ? ' Your load is low, so adding volume now is safe.' : '')
      );
    } else if (failingIds.includes('volume')) {
      const safeToAdd = acwr != null && acwr < 0.8;
      parts.push(
        `Weekly mileage is the main gap — averaging ${avgMpw.toFixed(1)} mi/wk, need to build toward ${MIN_MPW_TARGET}.` +
        (safeToAdd ? ' Your load is low enough to add safely.' : '')
      );
    } else if (failingIds.includes('long_run')) {
      parts.push(`Get at least one 18-mile run in before taper — that's the key missing piece.`);
    }
    if (failingIds.includes('mpace') && !failingIds.includes('long_run')) {
      parts.push(`Add a long run or marathon-pace effort this week to keep the legs sharp.`);
    }
    if (failingIds.includes('durability')) {
      parts.push(`Ease back on volume this week — load is elevated heading into race day.`);
    }
    return parts.length > 0 ? parts.join(' ') : 'Keep building consistently — you\'re making progress.';
  })();

  return {
    applicable: true,
    items,
    summary,
    summary_line,
  };
}
