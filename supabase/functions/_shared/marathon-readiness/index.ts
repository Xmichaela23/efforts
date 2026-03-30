/**
 * =============================================================================
 * RACE READINESS — Plan-Aware
 * =============================================================================
 *
 * Checklist-based assessment for race readiness.
 * Uses 6–8 week lookback against workout_facts.
 *
 * When a plan exists, thresholds come from the plan's actual prescribed
 * long runs and weekly mileage — not hardcoded generic marathon numbers.
 * Falls back to distance-based defaults when no plan is available.
 */

const LONG_RUN_MIN_MINUTES = 90;
const SIX_WEEKS_DAYS = 42;
const FOUR_WEEKS_DAYS = 28;
const M_PER_MI = 1609.34;

// Fallback thresholds by race distance when no plan exists
const DISTANCE_DEFAULTS: Record<string, { longRunMi: number; mpw: number }> = {
  marathon:       { longRunMi: 18, mpw: 35 },
  half_marathon:  { longRunMi: 12, mpw: 25 },
  '50k':          { longRunMi: 22, mpw: 40 },
  '50_miler':     { longRunMi: 30, mpw: 45 },
  '100k':         { longRunMi: 30, mpw: 50 },
  '100_miler':    { longRunMi: 30, mpw: 55 },
};

export interface MarathonReadinessItem {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  value?: string | number;
}

export interface MarathonReadinessResult {
  applicable: boolean;
  items: MarathonReadinessItem[];
  summary: 'on_track' | 'needs_work' | 'insufficient_data';
  summary_line?: string;
  context_note?: string;
}

export interface PlanContext {
  /** Longest single run prescribed in the plan (miles) */
  peakLongRunMi: number | null;
  /** Peak weekly mileage prescribed (excluding race week) */
  peakWeekMi: number | null;
  /** Average weekly mileage prescribed (excluding race week) */
  avgWeekMi: number | null;
  /** Race distance label (marathon, half_marathon, etc.) */
  raceDistance: string | null;
  /** Weeks until race day */
  weeksOut: number | null;
  /** Current phase (base, build, peak, taper, recovery) */
  phase: string | null;
  /** Whether a long run is still scheduled before taper */
  longRunStillScheduled: boolean;
  /** Miles of the next scheduled long run */
  nextLongRunMi: number | null;
  /** Date of the next scheduled long run */
  nextLongRunDate: string | null;
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
  supabase: { from: (t: string) => any },
  planCtx?: PlanContext | null,
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

  // --- Resolve thresholds ---
  const distKey = (planCtx?.raceDistance || 'marathon').toLowerCase().replace(/\s+/g, '_');
  const defaults = DISTANCE_DEFAULTS[distKey] ?? DISTANCE_DEFAULTS.marathon;

  const longRunTargetMi = planCtx?.peakLongRunMi ?? defaults.longRunMi;
  const mpwTarget = planCtx?.peakWeekMi ?? planCtx?.avgWeekMi ?? defaults.mpw;
  const longRunTargetM = longRunTargetMi * M_PER_MI;

  const phase = planCtx?.phase?.toLowerCase() ?? null;
  const weeksOut = planCtx?.weeksOut ?? null;
  const isTaper = phase === 'taper' || (weeksOut != null && weeksOut <= 2);
  const isPeak = phase === 'peak' || (weeksOut != null && weeksOut > 2 && weeksOut <= 4);
  const hasPlan = planCtx != null && (planCtx.peakLongRunMi != null || planCtx.peakWeekMi != null);

  // 1. Long run check
  let longestRunM = 0;
  for (const r of rows) {
    if (r.date < sixWeeksAgoIso) continue;
    const distM = r.run_facts?.distance_m ?? 0;
    if (distM > longestRunM) longestRunM = distM;
  }
  const longestRunMi = longestRunM / M_PER_MI;

  // Pass if within 85% of the plan's peak long run (or if a longer run is still scheduled)
  const longRunThreshold = longRunTargetMi * 0.85;
  const longRunPass = longestRunMi >= longRunThreshold || (planCtx?.longRunStillScheduled === true);

  const longRunDetail = (() => {
    if (longestRunMi >= longRunTargetMi) {
      return `Your longest run in the last 6 weeks is ${longestRunMi.toFixed(1)} mi — you've covered race-relevant distance.`;
    }
    if (planCtx?.longRunStillScheduled && planCtx.nextLongRunMi && planCtx.nextLongRunDate) {
      return `Longest run so far: ${longestRunMi.toFixed(1)} mi. Your plan has a ${planCtx.nextLongRunMi.toFixed(0)}-miler on ${planCtx.nextLongRunDate} — that's your peak long run.`;
    }
    if (isTaper) {
      return `Longest run: ${longestRunMi.toFixed(1)} mi. You're in taper — this is your base going into race day.`;
    }
    if (hasPlan) {
      return `Longest run so far: ${longestRunMi.toFixed(1)} mi — plan targets ${longRunTargetMi.toFixed(0)} mi peak.`;
    }
    return `Longest run so far: ${longestRunMi.toFixed(1)} mi — aim for at least ${longRunTargetMi.toFixed(0)} mi before taper.`;
  })();

  // 2. Weekly volume check
  let totalRunM4w = 0;
  for (const r of rows) {
    if (r.date < fourWeeksAgoIso) continue;
    totalRunM4w += r.run_facts?.distance_m ?? 0;
  }
  const avgMpw = totalRunM4w > 0 ? (totalRunM4w / M_PER_MI) / 4 : 0;

  // During taper, compare against a lower bar (60% of peak is typical taper volume)
  const volumeTarget = isTaper ? mpwTarget * 0.6 : mpwTarget * 0.75;
  const volumePass = avgMpw >= volumeTarget;

  const volumeDetail = (() => {
    if (avgMpw <= 0) return 'No run volume logged in the last 4 weeks.';
    if (isTaper) {
      if (volumePass) return `Averaging ${avgMpw.toFixed(1)} miles/week during taper — on track.`;
      return `Averaging ${avgMpw.toFixed(1)} miles/week — taper volume is lower than expected. Stay consistent with easy runs.`;
    }
    if (volumePass) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week${hasPlan ? ` — on track for your plan (targets ~${Math.round(mpwTarget)} mpw peak)` : ' — solid volume'}.`;
    }
    const pct = Math.round((avgMpw / mpwTarget) * 100);
    if (hasPlan) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week (${pct}% of plan's ~${Math.round(mpwTarget)} mpw target).`;
    }
    const safeToAdd = acwr != null && acwr < 0.8;
    const overloaded = acwr != null && acwr > 1.5;
    if (safeToAdd) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week — building toward ${Math.round(mpwTarget)}. Load is low, safe to add volume.`;
    }
    if (overloaded) {
      return `Averaging ${avgMpw.toFixed(1)} miles/week — need ${Math.round(mpwTarget)}, but ease back this week before adding more.`;
    }
    return `Averaging ${avgMpw.toFixed(1)} miles/week — building toward ${Math.round(mpwTarget)}.`;
  })();

  // 3. Quality work check (long run or quality effort in last 4 weeks)
  let hasLongOrMpace = false;
  for (const r of rows) {
    if (r.date < fourWeeksAgoIso) continue;
    const dur = r.duration_minutes ?? 0;
    const distM = r.run_facts?.distance_m ?? 0;
    if (dur >= LONG_RUN_MIN_MINUTES || distM >= longRunTargetM * 0.7) {
      hasLongOrMpace = true;
      break;
    }
  }
  const mpacePass = hasLongOrMpace;

  // 4. ACWR
  const acwrPass = acwr != null && acwr >= 0.8 && acwr <= 1.5;
  const acwrElevated = acwr != null && acwr > 1.5 && acwr <= 1.7;
  const acwrHighRisk = acwr != null && acwr > 1.7;

  const durabilityLabel: 'low' | 'medium' | 'high' | null =
    acwrHighRisk ? 'high' : acwrElevated ? 'medium' : acwr != null && acwr >= 0.8 && acwr <= 1.5 ? 'low' : null;
  const durabilityPass = durabilityLabel === 'low' || durabilityLabel === null;

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
      detail: longRunDetail,
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

  const summary_line = buildSummaryLine(summary, items, avgMpw, mpwTarget, longRunTargetMi, acwr, planCtx);

  return {
    applicable: true,
    items,
    summary,
    summary_line,
  };
}

function buildSummaryLine(
  summary: string,
  items: MarathonReadinessItem[],
  avgMpw: number,
  mpwTarget: number,
  longRunTargetMi: number,
  acwr: number | null,
  planCtx?: PlanContext | null,
): string {
  if (summary === 'on_track') {
    return 'Training base looks solid — stay consistent and trust the taper.';
  }
  if (summary === 'insufficient_data') {
    return 'Log more runs to get a reliable readiness picture.';
  }

  const failingIds = items.filter((i) => !i.pass).map((i) => i.id);
  const parts: string[] = [];
  const isTaper = planCtx?.phase?.toLowerCase() === 'taper' || (planCtx?.weeksOut != null && planCtx.weeksOut <= 2);

  if (isTaper) {
    if (failingIds.includes('volume')) {
      parts.push(`Keep easy runs consistent through taper — don't let volume drop too far.`);
    }
    if (failingIds.includes('long_run') && !planCtx?.longRunStillScheduled) {
      parts.push(`Your longest run was shorter than ideal, but taper is the priority now. Race-day adrenaline will help.`);
    }
    return parts.length > 0 ? parts.join(' ') : 'Stay consistent through taper — you\'re close.';
  }

  if (planCtx?.longRunStillScheduled && planCtx.nextLongRunMi && planCtx.nextLongRunDate) {
    if (failingIds.includes('volume') && failingIds.includes('long_run')) {
      parts.push(
        `Your ${planCtx.nextLongRunMi.toFixed(0)}-miler on ${planCtx.nextLongRunDate} is the key session. Hit that and stay consistent on easy runs.`,
      );
    } else if (failingIds.includes('long_run')) {
      parts.push(
        `${planCtx.nextLongRunMi.toFixed(0)}-miler on ${planCtx.nextLongRunDate} will close the long run gap.`,
      );
    }
  } else {
    if (failingIds.includes('volume') && failingIds.includes('long_run')) {
      const safeToAdd = acwr != null && acwr < 0.8;
      parts.push(
        `Two priorities before taper: push your long run past ${Math.round(longRunTargetMi)} miles, and build weekly mileage toward ${Math.round(mpwTarget)}.` +
        (safeToAdd ? ' Your load is low, so adding volume now is safe.' : ''),
      );
    } else if (failingIds.includes('volume')) {
      parts.push(
        `Weekly mileage is the main gap — averaging ${avgMpw.toFixed(1)} mi/wk, plan targets ~${Math.round(mpwTarget)}.`,
      );
    } else if (failingIds.includes('long_run')) {
      parts.push(`Get at least one ${Math.round(longRunTargetMi)}-mile run in before taper.`);
    }
  }

  if (failingIds.includes('mpace') && !failingIds.includes('long_run')) {
    parts.push(`Add a long run or marathon-pace effort this week to keep the legs sharp.`);
  }
  if (failingIds.includes('durability')) {
    parts.push(`Ease back on volume this week — load is elevated heading into race day.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Keep building consistently — you\'re making progress.';
}
