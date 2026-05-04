/**
 * Longitudinal signals — multi-week pattern detection for the weekly coach.
 *
 * Queries workout_facts + planned_workouts over a configurable window and
 * produces structured signals the weekly LLM can reference.
 */

export type LongitudinalSignal = {
  id: string;
  category: 'is_it_working' | 'adherence' | 'pattern';
  severity: 'info' | 'warning' | 'concern';
  headline: string;
  detail: string;
  evidence: string;
};

export type LongitudinalSignals = {
  generated_at: string;
  window_weeks: number;
  signals: LongitudinalSignal[];
};

type WorkoutFactRow = {
  date: string;
  discipline: string;
  duration_minutes: number | null;
  workload: number | null;
  session_rpe: number | null;
  run_facts: any;
  strength_facts: any;
  ride_facts: any;
  plan_id: string | null;
  planned_workout_id: string | null;
};

type PlannedRow = {
  id: string;
  date: string;
  type: string;
  name: string | null;
  workout_status: string | null;
  completed_workout_id: string | null;
};

export async function computeLongitudinalSignals(
  supabase: any,
  userId: string,
  asOfDate: string,
  windowWeeks: number = 6,
): Promise<LongitudinalSignals> {
  const signals: LongitudinalSignal[] = [];
  const cutoff = new Date(asOfDate);
  cutoff.setDate(cutoff.getDate() - windowWeeks * 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const [factsRes, plannedRes] = await Promise.all([
    supabase
      .from('workout_facts')
      .select('date, discipline, duration_minutes, workload, session_rpe, run_facts, strength_facts, ride_facts, plan_id, planned_workout_id')
      .eq('user_id', userId)
      .gte('date', cutoffIso)
      .lte('date', asOfDate)
      .order('date', { ascending: true }),
    supabase
      .from('planned_workouts')
      .select('id, date, type, name, workout_status, completed_workout_id')
      .eq('user_id', userId)
      .gte('date', cutoffIso)
      .lte('date', asOfDate)
      .order('date', { ascending: true }),
  ]);

  const facts: WorkoutFactRow[] = Array.isArray(factsRes?.data) ? factsRes.data : [];
  const planned: PlannedRow[] = Array.isArray(plannedRes?.data) ? plannedRes.data : [];

  if (facts.length < 3) {
    return { generated_at: new Date().toISOString(), window_weeks: windowWeeks, signals };
  }

  detectEasyHrTrend(facts, signals);
  detectThresholdPacePlateau(facts, signals);
  detectE1rmTrends(facts, signals);
  detectSessionSkipPatterns(planned, facts, asOfDate, signals);
  detectStrengthVolumeTrend(facts, signals);
  detectEasyPaceDrift(facts, signals);

  signals.sort((a, b) => {
    const sev = { concern: 0, warning: 1, info: 2 };
    return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
  });

  return {
    generated_at: new Date().toISOString(),
    window_weeks: windowWeeks,
    signals: signals.slice(0, 5),
  };
}

function detectEasyHrTrend(facts: WorkoutFactRow[], out: LongitudinalSignal[]): void {
  const easyRuns = facts.filter((f) => {
    if (f.discipline !== 'run') return false;
    const rf = f.run_facts;
    if (!rf?.hr_avg || !rf?.distance_m) return false;
    const paceKm = rf.pace_avg_s_per_km;
    return paceKm == null || paceKm > 330;
  });
  if (easyRuns.length < 4) return;

  const mid = Math.ceil(easyRuns.length / 2);
  const firstHalf = easyRuns.slice(0, mid).map((f) => f.run_facts.hr_avg);
  const secondHalf = easyRuns.slice(mid).map((f) => f.run_facts.hr_avg);
  const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
  const delta = Math.round(avgSecond - avgFirst);

  if (delta >= 5) {
    out.push({
      id: 'easy_hr_trending_up',
      category: 'is_it_working',
      severity: 'warning',
      headline: `Easy run HR trending up ${delta} bpm`,
      detail: `Average easy-run HR has risen from ~${Math.round(avgFirst)} to ~${Math.round(avgSecond)} bpm over ${easyRuns.length} runs. This can indicate accumulated fatigue or insufficient recovery.`,
      evidence: `${easyRuns.length} easy runs, first-half avg ${Math.round(avgFirst)} bpm, second-half avg ${Math.round(avgSecond)} bpm`,
    });
  } else if (delta <= -5) {
    out.push({
      id: 'easy_hr_improving',
      category: 'is_it_working',
      severity: 'info',
      headline: `Easy run HR improving by ${Math.abs(delta)} bpm`,
      detail: `Average easy-run HR has dropped from ~${Math.round(avgFirst)} to ~${Math.round(avgSecond)} bpm — aerobic fitness is building.`,
      evidence: `${easyRuns.length} easy runs, first-half avg ${Math.round(avgFirst)} bpm, second-half avg ${Math.round(avgSecond)} bpm`,
    });
  }
}

function detectThresholdPacePlateau(facts: WorkoutFactRow[], out: LongitudinalSignal[]): void {
  const keyRuns = facts.filter((f) => {
    if (f.discipline !== 'run') return false;
    const rf = f.run_facts;
    if (!rf?.pace_avg_s_per_km || !rf?.hr_avg) return false;
    return rf.pace_avg_s_per_km < 330 && rf.hr_avg > 150;
  });
  if (keyRuns.length < 4) return;

  const paces = keyRuns.map((f) => f.run_facts.pace_avg_s_per_km);
  const mid = Math.ceil(paces.length / 2);
  const avgFirst = paces.slice(0, mid).reduce((a: number, b: number) => a + b, 0) / mid;
  const avgSecond = paces.slice(mid).reduce((a: number, b: number) => a + b, 0) / (paces.length - mid);
  const deltaSec = Math.round(avgSecond - avgFirst);

  if (Math.abs(deltaSec) <= 3 && keyRuns.length >= 6) {
    const paceStr = fmtPacePerMi(avgSecond * 1.60934);
    out.push({
      id: 'threshold_pace_plateau',
      category: 'is_it_working',
      severity: 'warning',
      headline: `Key workout pace flat at ~${paceStr} for ${keyRuns.length} sessions`,
      detail: `Your harder-effort run pace hasn't changed meaningfully over ${keyRuns.length} sessions. If the plan is progressive, this could signal a stimulus plateau.`,
      evidence: `${keyRuns.length} key runs, avg pace delta ${deltaSec}s/km`,
    });
  } else if (deltaSec < -5) {
    const improvement = Math.abs(deltaSec);
    out.push({
      id: 'threshold_pace_improving',
      category: 'is_it_working',
      severity: 'info',
      headline: `Key workout pace improving ~${improvement}s/km`,
      detail: `Your harder-effort run pace has gotten faster over recent sessions — the training stimulus is producing adaptation.`,
      evidence: `${keyRuns.length} key runs, ${improvement}s/km improvement trend`,
    });
  }
}

function detectE1rmTrends(facts: WorkoutFactRow[], out: LongitudinalSignal[]): void {
  const strengthSessions = facts.filter((f) => f.discipline === 'strength' && f.strength_facts?.exercises);
  if (strengthSessions.length < 3) return;

  const liftHistory = new Map<string, Array<{ date: string; e1rm: number }>>();
  for (const s of strengthSessions) {
    const exArr = Array.isArray(s.strength_facts.exercises) ? s.strength_facts.exercises : [];
    for (const ex of exArr) {
      if (!ex.name || !ex.estimated_1rm || ex.estimated_1rm <= 0) continue;
      const key = String(ex.canonical || ex.name).toLowerCase();
      if (!liftHistory.has(key)) liftHistory.set(key, []);
      liftHistory.get(key)!.push({ date: s.date, e1rm: ex.estimated_1rm });
    }
  }

  const flatLifts: string[] = [];
  const improvingLifts: string[] = [];

  for (const [name, history] of liftHistory) {
    if (history.length < 3) continue;
    const sorted = history.sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.ceil(sorted.length / 2);
    const avgFirst = sorted.slice(0, mid).reduce((a, b) => a + b.e1rm, 0) / mid;
    const avgSecond = sorted.slice(mid).reduce((a, b) => a + b.e1rm, 0) / (sorted.length - mid);
    const pctChange = ((avgSecond - avgFirst) / avgFirst) * 100;

    if (Math.abs(pctChange) < 2 && sorted.length >= 4) {
      flatLifts.push(name);
    } else if (pctChange >= 5) {
      improvingLifts.push(name);
    }
  }

  if (flatLifts.length >= 2) {
    const names = flatLifts.slice(0, 3).join(', ');
    out.push({
      id: 'e1rm_plateau',
      category: 'is_it_working',
      severity: 'warning',
      headline: `Estimated 1RM flat on ${flatLifts.length} lifts`,
      detail: `${names} — estimated max hasn't moved. If the plan is progressive, the stimulus may need adjustment (load, volume, or variation).`,
      evidence: `${flatLifts.length} lifts with <2% e1RM change over ${strengthSessions.length} sessions`,
    });
  }

  if (improvingLifts.length >= 2) {
    const names = improvingLifts.slice(0, 3).join(', ');
    out.push({
      id: 'e1rm_improving',
      category: 'is_it_working',
      severity: 'info',
      headline: `Getting stronger on ${improvingLifts.length} lifts`,
      detail: `${names} — estimated max is trending up. Strength stimulus is producing adaptation.`,
      evidence: `${improvingLifts.length} lifts with >=5% e1RM improvement`,
    });
  }
}

/** Calendar days from scheduled plan date to as-of (YYYY-MM-DD), noon-normalized. */
function calendarDaysFromPlanToAsOf(planDate: string, asOfDate: string): number {
  const t0 = new Date(`${planDate}T12:00:00`).getTime();
  const t1 = new Date(`${asOfDate}T12:00:00`).getTime();
  return Math.round((t1 - t0) / 86400000);
}

/**
 * Past adherence: explicit skips vs missed (incomplete, no link, after grace).
 * Do not count incomplete sessions as "missed" until MISSED_GRACE calendar days after scheduled date —
 * allows late logging and device sync.
 */
function detectSessionSkipPatterns(planned: PlannedRow[], facts: WorkoutFactRow[], asOfDate: string, out: LongitudinalSignal[]): void {
  if (planned.length < 5) return;

  const MISSED_GRACE_CALENDAR_DAYS = 2;

  // Build set of planned IDs that have a matching workout_facts row (completed but not linked)
  const completedByFact = new Set<string>();
  for (const f of facts) {
    if (f.planned_workout_id) completedByFact.add(f.planned_workout_id);
  }

  const byDiscipline = new Map<string, { total: number; confirmedSkips: number; missed: number }>();
  for (const p of planned) {
    // Only count strictly past dates — today's workouts may not be done yet
    if (p.date >= asOfDate) continue;

    const type = normDiscipline(p.type);
    if (!byDiscipline.has(type)) byDiscipline.set(type, { total: 0, confirmedSkips: 0, missed: 0 });
    const entry = byDiscipline.get(type)!;

    const status = String(p.workout_status || '').toLowerCase();
    const linkedOrFactMatched = !!p.completed_workout_id || completedByFact.has(p.id);
    if (status === 'completed' || linkedOrFactMatched) {
      entry.total++;
      continue;
    }

    if (status === 'skipped') {
      entry.total++;
      entry.confirmedSkips++;
      continue;
    }

    // planned / in_progress / unknown — not completed; wait grace before "missed"
    if (calendarDaysFromPlanToAsOf(p.date, asOfDate) < MISSED_GRACE_CALENDAR_DAYS) {
      continue;
    }

    entry.total++;
    entry.missed++;
  }

  for (const [type, { total, confirmedSkips, missed }] of byDiscipline) {
    if (total < 3) continue;
    const adherenceGaps = confirmedSkips + missed;
    const gapRate = adherenceGaps / total;
    if (gapRate >= 0.4 && adherenceGaps >= 3) {
      const skipPart =
        confirmedSkips > 0 ? `${confirmedSkips} confirmed skip${confirmedSkips === 1 ? '' : 's'}` : '';
      const missPart = missed > 0 ? `${missed} missed (not completed after sync grace)` : '';
      const breakdown = [missPart, skipPart].filter(Boolean).join('; ');
      out.push({
        id: `skip_pattern_${type}`,
        category: 'adherence',
        severity: gapRate >= 0.6 ? 'concern' : 'warning',
        headline: `${type} session consistency trending low`,
        detail: `Completed ${total - adherenceGaps} of ${total} planned ${type} sessions over the last few weeks (${breakdown}). ${type === 'swim' ? 'Aerobic base balance' : type === 'strength' ? 'Strength maintenance' : 'Training progression'} benefits from regularity.`,
        evidence: `${adherenceGaps}/${total} ${type} gaps (${missed} post-grace missed, ${confirmedSkips} skipped)`,
      });
    }
  }
}

function detectStrengthVolumeTrend(facts: WorkoutFactRow[], out: LongitudinalSignal[]): void {
  const strengthSessions = facts.filter((f) => f.discipline === 'strength' && f.strength_facts?.total_volume_lbs > 0);
  if (strengthSessions.length < 4) return;

  const weekVolumes = new Map<string, number>();
  for (const s of strengthSessions) {
    const weekKey = getWeekKey(s.date);
    weekVolumes.set(weekKey, (weekVolumes.get(weekKey) ?? 0) + (s.strength_facts.total_volume_lbs || 0));
  }

  const weeks = Array.from(weekVolumes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (weeks.length < 3) return;

  let declining = 0;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i][1] < weeks[i - 1][1] * 0.9) declining++;
  }

  if (declining >= Math.ceil(weeks.length * 0.6) && weeks.length >= 3) {
    const firstVol = Math.round(weeks[0][1]);
    const lastVol = Math.round(weeks[weeks.length - 1][1]);
    const dropPct = Math.round(((firstVol - lastVol) / firstVol) * 100);
    out.push({
      id: 'strength_volume_declining',
      category: 'adherence',
      severity: dropPct >= 30 ? 'concern' : 'warning',
      headline: `Strength volume down ${dropPct}% over ${weeks.length} weeks`,
      detail: `Weekly strength volume has been declining (${firstVol.toLocaleString()} lbs → ${lastVol.toLocaleString()} lbs). Is this intentional (taper, deload) or are you cutting sets short?`,
      evidence: `${weeks.length} weeks tracked, ${declining} weeks with >10% drop from prior`,
    });
  }
}

function detectEasyPaceDrift(facts: WorkoutFactRow[], out: LongitudinalSignal[]): void {
  const easyRuns = facts.filter((f) => {
    if (f.discipline !== 'run') return false;
    const rf = f.run_facts;
    if (!rf?.pace_avg_s_per_km) return false;
    return rf.pace_avg_s_per_km > 330;
  });
  if (easyRuns.length < 5) return;

  const mid = Math.ceil(easyRuns.length / 2);
  const paces = easyRuns.map((f) => f.run_facts.pace_avg_s_per_km);
  const avgFirst = paces.slice(0, mid).reduce((a: number, b: number) => a + b, 0) / mid;
  const avgSecond = paces.slice(mid).reduce((a: number, b: number) => a + b, 0) / (paces.length - mid);
  const deltaSecKm = Math.round(avgFirst - avgSecond);

  if (deltaSecKm >= 8) {
    const deltaPerMi = Math.round(deltaSecKm * 1.60934);
    out.push({
      id: 'easy_pace_creeping_faster',
      category: 'adherence',
      severity: deltaPerMi >= 20 ? 'warning' : 'info',
      headline: `Easy runs trending ${deltaPerMi}s/mi faster`,
      detail: `Your easy-run pace has been getting faster over ${easyRuns.length} sessions. If prescription hasn't changed, you may be running easy days too hard — accumulated fatigue risk.`,
      evidence: `${easyRuns.length} easy runs, ~${deltaPerMi}s/mi faster in recent half`,
    });
  }
}

function normDiscipline(t: string): string {
  const s = String(t || '').toLowerCase();
  if (s.startsWith('run') || s === 'running') return 'run';
  if (s.startsWith('ride') || s.startsWith('cycling') || s.startsWith('bike')) return 'ride';
  if (s.startsWith('swim')) return 'swim';
  if (s.startsWith('strength') || s === 'weight_training') return 'strength';
  return s || 'other';
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function fmtPacePerMi(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

/** Format signals as a text block for the weekly coach LLM prompt. */
export function longitudinalSignalsToPrompt(signals: LongitudinalSignals): string {
  if (!signals.signals.length) return '';

  const lines = [
    `=== LONGITUDINAL PATTERNS (${signals.window_weeks}-week window) ===`,
  ];

  for (const s of signals.signals) {
    const tag = s.severity === 'concern' ? '[CONCERN]' : s.severity === 'warning' ? '[WATCH]' : '[NOTE]';
    lines.push(`${tag} ${s.headline}`);
    lines.push(`  ${s.detail}`);
  }

  lines.push('=== END LONGITUDINAL PATTERNS ===');
  lines.push('');
  lines.push('When referencing these patterns, pick at most 1-2 that are most actionable this week. Speak plainly — "your easy pace has been creeping faster" not "longitudinal signal detected." Do NOT quote raw counts like "X of Y sessions" — describe the trend qualitatively ("you\'ve been skipping runs more often" or "consistency has dropped").');

  return lines.join('\n');
}
