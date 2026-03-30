// =============================================================================
// ADAPTATION — Multi-week lookback: is the athlete absorbing the training?
// =============================================================================
// Compares equivalent sessions across 3-4 weeks to detect HR-at-pace trends
// (endurance), weight-at-RIR trends (strength), and cross-domain interference.
// Requires plan-relative data (Tasks 1-4) to be meaningful.
// =============================================================================

export type AdaptationTrend = 'absorbing' | 'stagnant' | 'overreaching' | 'insufficient_data';

export type AdaptationSignal = {
  modality: 'endurance' | 'strength' | 'cross_domain';
  trend: AdaptationTrend;
  evidence: string;
  weeks_compared: number;
};

export type AdaptationInput = {
  date: string;
  type: string;
  name: string;
  avg_hr: number | null;
  pace_sec_per_unit: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  exercises: Array<{
    name: string;
    best_weight: number;
    avg_rir: number | null;
    unit: string;
  }> | null;
};

type WeekBucket = {
  weekStart: string;
  sessions: AdaptationInput[];
};

function weekOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

function bucketByWeek(sessions: AdaptationInput[]): WeekBucket[] {
  const map = new Map<string, AdaptationInput[]>();
  for (const s of sessions) {
    const w = weekOf(s.date);
    if (!map.has(w)) map.set(w, []);
    map.get(w)!.push(s);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, sessions]) => ({ weekStart, sessions }));
}

function normType(t: string): string {
  const s = t.toLowerCase().trim();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training' || s === 'weights') return 'strength';
  return s || 'other';
}

function assessEnduranceAdaptation(weeks: WeekBucket[]): AdaptationSignal {
  const sig: AdaptationSignal = {
    modality: 'endurance',
    trend: 'insufficient_data',
    evidence: '',
    weeks_compared: 0,
  };

  // Collect easy/steady runs with HR data across weeks
  const weeklyAvgHr: Array<{ week: string; avgHr: number; count: number }> = [];

  for (const bucket of weeks) {
    const easyRuns = bucket.sessions.filter(s => {
      if (normType(s.type) !== 'run') return false;
      if (s.avg_hr == null) return false;
      const nameL = s.name.toLowerCase();
      return nameL.includes('easy') || nameL.includes('recovery')
        || (s.pace_sec_per_unit != null && s.rpe != null && s.rpe <= 5);
    });

    if (easyRuns.length === 0) continue;
    const avg = easyRuns.reduce((s, r) => s + r.avg_hr!, 0) / easyRuns.length;
    weeklyAvgHr.push({ week: bucket.weekStart, avgHr: avg, count: easyRuns.length });
  }

  if (weeklyAvgHr.length < 2) {
    sig.evidence = weeklyAvgHr.length === 0
      ? 'No easy runs with HR data across the lookback window.'
      : 'Only 1 week of easy-run HR data — need at least 2.';
    return sig;
  }

  sig.weeks_compared = weeklyAvgHr.length;

  // Linear trend: negative slope = HR dropping at same effort = absorbing
  const first = weeklyAvgHr.slice(0, Math.ceil(weeklyAvgHr.length / 2));
  const second = weeklyAvgHr.slice(Math.ceil(weeklyAvgHr.length / 2));
  const avgFirst = first.reduce((s, w) => s + w.avgHr, 0) / first.length;
  const avgSecond = second.reduce((s, w) => s + w.avgHr, 0) / second.length;
  const hrDelta = avgSecond - avgFirst;

  if (hrDelta < -2) {
    sig.trend = 'absorbing';
    sig.evidence = `Easy-run HR trending down: ${Math.round(avgFirst)} → ${Math.round(avgSecond)} bpm over ${sig.weeks_compared} weeks.`;
  } else if (hrDelta > 3) {
    sig.trend = 'overreaching';
    sig.evidence = `Easy-run HR trending up: ${Math.round(avgFirst)} → ${Math.round(avgSecond)} bpm over ${sig.weeks_compared} weeks — possible accumulated fatigue.`;
  } else {
    sig.trend = 'stagnant';
    sig.evidence = `Easy-run HR stable around ${Math.round((avgFirst + avgSecond) / 2)} bpm over ${sig.weeks_compared} weeks.`;
  }

  return sig;
}

function assessStrengthAdaptation(weeks: WeekBucket[]): AdaptationSignal {
  const sig: AdaptationSignal = {
    modality: 'strength',
    trend: 'insufficient_data',
    evidence: '',
    weeks_compared: 0,
  };

  // Track per-exercise weight-at-RIR across weeks
  const exerciseWeekly = new Map<string, Array<{ week: string; weight: number; rir: number }>>();

  for (const bucket of weeks) {
    for (const s of bucket.sessions) {
      if (normType(s.type) !== 'strength' || !s.exercises) continue;
      for (const ex of s.exercises) {
        if (ex.best_weight <= 0 || ex.avg_rir == null) continue;
        const key = ex.name.toLowerCase().trim();
        if (!exerciseWeekly.has(key)) exerciseWeekly.set(key, []);
        exerciseWeekly.get(key)!.push({
          week: bucket.weekStart,
          weight: ex.best_weight,
          rir: ex.avg_rir,
        });
      }
    }
  }

  // Find exercises with data across multiple weeks
  const trends: Array<{ exercise: string; direction: 'up' | 'down' | 'flat'; detail: string }> = [];

  for (const [name, entries] of exerciseWeekly) {
    const uniqueWeeks = new Set(entries.map(e => e.week));
    if (uniqueWeeks.size < 2) continue;

    const sorted = entries.sort((a, b) => a.week.localeCompare(b.week));
    const firstHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
    const secondHalf = sorted.slice(Math.ceil(sorted.length / 2));

    const avgWeightFirst = firstHalf.reduce((s, e) => s + e.weight, 0) / firstHalf.length;
    const avgWeightSecond = secondHalf.reduce((s, e) => s + e.weight, 0) / secondHalf.length;
    const avgRirFirst = firstHalf.reduce((s, e) => s + e.rir, 0) / firstHalf.length;
    const avgRirSecond = secondHalf.reduce((s, e) => s + e.rir, 0) / secondHalf.length;

    const weightPct = avgWeightFirst > 0 ? ((avgWeightSecond - avgWeightFirst) / avgWeightFirst) * 100 : 0;
    const rirDelta = avgRirSecond - avgRirFirst;

    // More weight at same/higher RIR = progressing
    // Same weight at higher RIR = getting easier = absorbing
    // Same weight at lower RIR = getting harder = possible overreach
    if (weightPct > 3 && rirDelta >= -0.5) {
      trends.push({ exercise: name, direction: 'up', detail: `+${weightPct.toFixed(0)}% weight, similar RIR` });
    } else if (Math.abs(weightPct) <= 3 && rirDelta > 0.5) {
      trends.push({ exercise: name, direction: 'up', detail: `same weight, RIR up ${rirDelta.toFixed(1)} (getting easier)` });
    } else if (Math.abs(weightPct) <= 3 && rirDelta < -0.5) {
      trends.push({ exercise: name, direction: 'down', detail: `same weight, RIR down ${Math.abs(rirDelta).toFixed(1)} (getting harder)` });
    } else {
      trends.push({ exercise: name, direction: 'flat', detail: `stable` });
    }
  }

  if (trends.length === 0) {
    sig.evidence = 'Not enough multi-week strength data to assess adaptation.';
    return sig;
  }

  sig.weeks_compared = weeks.length;
  const up = trends.filter(t => t.direction === 'up').length;
  const down = trends.filter(t => t.direction === 'down').length;

  if (up > down && up >= 2) {
    sig.trend = 'absorbing';
    const examples = trends.filter(t => t.direction === 'up').slice(0, 2).map(t => `${t.exercise}: ${t.detail}`);
    sig.evidence = `Strength progressing across ${trends.length} tracked exercises. ${examples.join('; ')}.`;
  } else if (down > up && down >= 2) {
    sig.trend = 'overreaching';
    const examples = trends.filter(t => t.direction === 'down').slice(0, 2).map(t => `${t.exercise}: ${t.detail}`);
    sig.evidence = `Strength regressing in ${down} of ${trends.length} exercises. ${examples.join('; ')}.`;
  } else {
    sig.trend = 'stagnant';
    sig.evidence = `Strength roughly flat across ${trends.length} tracked exercises over ${sig.weeks_compared} weeks.`;
  }

  return sig;
}

function assessCrossDomainAdaptation(
  endurance: AdaptationSignal,
  strength: AdaptationSignal,
  weeks: WeekBucket[],
): AdaptationSignal {
  const sig: AdaptationSignal = {
    modality: 'cross_domain',
    trend: 'insufficient_data',
    evidence: '',
    weeks_compared: Math.max(endurance.weeks_compared, strength.weeks_compared),
  };

  if (endurance.trend === 'insufficient_data' || strength.trend === 'insufficient_data') {
    sig.evidence = 'Need both endurance and strength data to assess cross-domain effects.';
    return sig;
  }

  // Endurance HR rising + strength volume increasing = possible interference
  if (endurance.trend === 'overreaching' && (strength.trend === 'absorbing' || strength.trend === 'stagnant')) {
    sig.trend = 'overreaching';
    sig.evidence = `Endurance HR rising while strength is ${strength.trend} — possible interference from strength volume on running recovery.`;
  } else if (endurance.trend === 'absorbing' && strength.trend === 'absorbing') {
    sig.trend = 'absorbing';
    sig.evidence = 'Both endurance and strength trending positively — handling the combined load well.';
  } else if (endurance.trend === 'overreaching' && strength.trend === 'overreaching') {
    sig.trend = 'overreaching';
    sig.evidence = 'Both endurance and strength showing signs of accumulated fatigue.';
  } else {
    sig.trend = 'stagnant';
    sig.evidence = `Mixed signals: endurance ${endurance.trend}, strength ${strength.trend}.`;
  }

  return sig;
}

/**
 * Assess multi-week adaptation from historical workout data.
 * Input: 3-4 weeks of completed workouts (the normWorkouts array the coach already loads).
 */
export function assessAdaptation(sessions: AdaptationInput[]): AdaptationSignal[] {
  const weeks = bucketByWeek(sessions);
  if (weeks.length < 2) {
    return [{
      modality: 'endurance',
      trend: 'insufficient_data',
      evidence: `Only ${weeks.length} week(s) of data — need at least 2 for adaptation assessment.`,
      weeks_compared: weeks.length,
    }];
  }

  const endurance = assessEnduranceAdaptation(weeks);
  const strength = assessStrengthAdaptation(weeks);
  const crossDomain = assessCrossDomainAdaptation(endurance, strength, weeks);

  const signals: AdaptationSignal[] = [];
  if (endurance.trend !== 'insufficient_data') signals.push(endurance);
  if (strength.trend !== 'insufficient_data') signals.push(strength);
  if (crossDomain.trend !== 'insufficient_data') signals.push(crossDomain);

  if (signals.length === 0) {
    signals.push({
      modality: 'endurance',
      trend: 'insufficient_data',
      evidence: 'Not enough comparable sessions across weeks to assess adaptation.',
      weeks_compared: weeks.length,
    });
  }

  return signals;
}

export function adaptationSignalsToPrompt(signals: AdaptationSignal[]): string | null {
  const meaningful = signals.filter(s => s.trend !== 'insufficient_data');
  if (meaningful.length === 0) return null;

  const lines = ['=== ADAPTATION TRAJECTORY (multi-week lookback) ==='];
  for (const s of meaningful) {
    const label = s.trend === 'absorbing' ? 'ABSORBING'
      : s.trend === 'overreaching' ? 'WATCH — possible overreach'
      : 'FLAT';
    lines.push(`${s.modality}: ${label} (${s.weeks_compared} weeks compared)`);
    lines.push(`  ${s.evidence}`);
  }
  lines.push('Use this to inform your narrative — is the athlete handling the current training block?');
  return lines.join('\n');
}
