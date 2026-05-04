/**
 * Longitudinal signals — multi-week pattern detection for the weekly coach.
 *
 * Queries workout_facts, planned_workouts, athlete_snapshot over a window and
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
  strength_exercises: any;
};

type AthleteSnapshotRow = {
  week_start: string;
  run_easy_hr_trend: number | null;
  strength_volume_trend: number | null;
  ride_efficiency_factor: number | null;
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

  const [factsRes, plannedRes, snapshotRes] = await Promise.all([
    supabase
      .from('workout_facts')
      .select('date, discipline, duration_minutes, workload, session_rpe, run_facts, strength_facts, ride_facts, plan_id, planned_workout_id')
      .eq('user_id', userId)
      .gte('date', cutoffIso)
      .lte('date', asOfDate)
      .order('date', { ascending: true }),
    supabase
      .from('planned_workouts')
      .select('id, date, type, name, workout_status, completed_workout_id, strength_exercises')
      .eq('user_id', userId)
      .gte('date', cutoffIso)
      .lte('date', asOfDate)
      .order('date', { ascending: true }),
    supabase
      .from('athlete_snapshot')
      .select('week_start, run_easy_hr_trend, strength_volume_trend, ride_efficiency_factor')
      .eq('user_id', userId)
      .gte('week_start', cutoffIso)
      .lte('week_start', asOfDate)
      .order('week_start', { ascending: false })
      .limit(2),
  ]);

  const facts: WorkoutFactRow[] = Array.isArray(factsRes?.data) ? factsRes.data : [];
  const planned: PlannedRow[] = Array.isArray(plannedRes?.data) ? plannedRes.data : [];
  const snapRows: AthleteSnapshotRow[] = Array.isArray(snapshotRes?.data) ? snapshotRes.data : [];
  const latestSnapshot = snapRows[0] ?? null;
  const priorSnapshot = snapRows[1] ?? null;

  detectSnapshotChronicSignals(latestSnapshot, priorSnapshot, signals);

  if (facts.length >= 3) {
    detectThresholdPacePlateau(facts, signals);
    detectE1rmTrends(facts, signals);
    detectEasyPaceDrift(facts, signals);
    detectRidePhysiologyTrends(facts, planned, signals);
  }

  detectSessionSkipPatterns(planned, facts, asOfDate, signals);

  const plannedById = new Map(planned.map((p) => [p.id, p]));
  if (facts.length >= 3) {
    detectStrengthRirGap(facts, plannedById, signals);
  }

  signals.sort((a, b) => {
    const sev = { concern: 0, warning: 1, info: 2 };
    return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2);
  });

  return {
    generated_at: new Date().toISOString(),
    window_weeks: windowWeeks,
    signals,
  };
}

/**
 * Chronic direction from compute-snapshot: run_easy_hr_trend / strength_volume_trend
 * are pct-change vs trailing chronic; ride week-over-week uses two snapshot rows
 * (ride_efficiency_factor has no dedicated trend column on snapshot).
 */
function detectSnapshotChronicSignals(
  latest: AthleteSnapshotRow | null,
  prior: AthleteSnapshotRow | null,
  out: LongitudinalSignal[],
): void {
  if (!latest) return;

  const tRun = latest.run_easy_hr_trend;
  if (tRun != null && !Number.isNaN(tRun)) {
    if (tRun > 2) {
      out.push({
        id: 'snapshot_run_easy_pace_trend',
        category: 'is_it_working',
        severity: 'warning',
        headline: `Easy aerobic efficiency slipping (pace-at-HR ${tRun > 0 ? '+' : ''}${Math.round(tRun * 10) / 10}% vs chronic)`,
        detail:
          `Athlete snapshot shows easy-run pace at target HR trending slower versus your recent baseline. Often fatigue, lost fitness, or easy days drifting harder.`,
        evidence: `athlete_snapshot week ${latest.week_start} run_easy_hr_trend=${tRun}`,
      });
    } else if (tRun < -2) {
      out.push({
        id: 'snapshot_run_easy_pace_improving',
        category: 'is_it_working',
        severity: 'info',
        headline: `Easy aerobic efficiency improving (${Math.round(tRun * 10) / 10}% vs chronic)`,
        detail: `Athlete snapshot shows you're moving faster at easy HR versus recent baseline — a good endurance adaptation signal.`,
        evidence: `athlete_snapshot week ${latest.week_start} run_easy_hr_trend=${tRun}`,
      });
    }
  }

  const tStr = latest.strength_volume_trend;
  if (tStr != null && !Number.isNaN(tStr)) {
    if (tStr < -12) {
      out.push({
        id: 'snapshot_strength_volume_down',
        category: 'adherence',
        severity: tStr < -22 ? 'concern' : 'warning',
        headline: `Strength volume well below recent baseline (${Math.round(tStr * 10) / 10}% vs chronic)`,
        detail: `Athlete snapshot shows weekly strength volume down versus your trailing average. Confirm if intentional (deload, travel) or consistency slipped.`,
        evidence: `athlete_snapshot week ${latest.week_start} strength_volume_trend=${tStr}`,
      });
    } else if (tStr > 8) {
      out.push({
        id: 'snapshot_strength_volume_up',
        category: 'is_it_working',
        severity: 'info',
        headline: `Strength volume above recent baseline (+${Math.round(tStr * 10) / 10}% vs chronic)`,
        detail: `Athlete snapshot shows more strength work than your recent rolling average — okay if recovery supports it.`,
        evidence: `athlete_snapshot week ${latest.week_start} strength_volume_trend=${tStr}`,
      });
    }
  }

  const curEf = latest.ride_efficiency_factor;
  const prevEf = prior?.ride_efficiency_factor;
  if (
    typeof curEf === 'number' && !Number.isNaN(curEf) &&
    typeof prevEf === 'number' && !Number.isNaN(prevEf) &&
    prevEf > 0
  ) {
    const pct = ((curEf - prevEf) / prevEf) * 100;
    if (pct <= -5) {
      out.push({
        id: 'snapshot_ride_efficiency_wow_down',
        category: 'is_it_working',
        severity: pct <= -10 ? 'warning' : 'info',
        headline: `Cycling efficiency (NP/HR) down week-over-week in snapshot`,
        detail: `Athlete snapshot: ride efficiency factor ${prevEf.toFixed(2)} → ${curEf.toFixed(2)} (${Math.round(pct * 10) / 10}%). Weekly cycling efficiency slipped versus the prior snapshot week. Pair with readiness and easy-day execution — not necessarily a single bad ride.`,
        evidence: `athlete_snapshot ${prior!.week_start} EF ${prevEf} → ${latest.week_start} ${curEf}`,
      });
    }
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

function isEasyRideSession(f: WorkoutFactRow, plannedById: Map<string, PlannedRow>): boolean {
  if (f.discipline !== 'ride') return false;
  const rf = f.ride_facts;
  if (!rf) return false;
  if (typeof rf.intensity_factor === 'number' && !Number.isNaN(rf.intensity_factor) && rf.intensity_factor <= 0.68) {
    return true;
  }
  if (f.planned_workout_id) {
    const p = plannedById.get(f.planned_workout_id);
    if (p) {
      const blob = `${p.name || ''} ${p.type || ''}`.toLowerCase();
      if (/\b(easy|recovery|z2|zone\s*2|endurance|aerobic|base)\b/.test(blob)) return true;
    }
  }
  return false;
}

function detectRidePhysiologyTrends(
  facts: WorkoutFactRow[],
  planned: PlannedRow[],
  out: LongitudinalSignal[],
): void {
  const plannedById = new Map(planned.map((p) => [p.id, p]));

  const ridesChrono = facts.filter((f) => f.discipline === 'ride' && f.ride_facts);
  if (ridesChrono.length < 2) return;

  const withDrift = ridesChrono.filter((f) => typeof f.ride_facts?.hr_drift_pct === 'number' && !Number.isNaN(f.ride_facts.hr_drift_pct));
  if (withDrift.length >= 4) {
    const mid = Math.ceil(withDrift.length / 2);
    const first = withDrift.slice(0, mid).map((f) => f.ride_facts.hr_drift_pct as number);
    const second = withDrift.slice(mid).map((f) => f.ride_facts.hr_drift_pct as number);
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
    const delta = Math.round((avgSecond - avgFirst) * 10) / 10;
    if (delta >= 3) {
      out.push({
        id: 'ride_hr_drift_trending_up',
        category: 'is_it_working',
        severity: delta >= 6 ? 'warning' : 'info',
        headline: `Bike HR drift trending higher across rides (+${delta}% pts late vs early window)`,
        detail:
          `Average within-ride HR drift % (late vs early in each session) is higher in more recent rides than earlier in the window. Often heat, fatigue, or easy pace/power creeping up — worth watching recovery and easy-day discipline.`,
        evidence: `${withDrift.length} rides with hr_drift_pct, early-window avg ${avgFirst} vs recent ${avgSecond}`,
      });
    }
  }

  const withEf = ridesChrono.filter((f) =>
    typeof f.ride_facts?.efficiency_factor === 'number' && !Number.isNaN(f.ride_facts.efficiency_factor) && f.ride_facts.efficiency_factor > 0
  );
  if (withEf.length >= 4) {
    const mid = Math.ceil(withEf.length / 2);
    const first = withEf.slice(0, mid).map((f) => f.ride_facts.efficiency_factor as number);
    const second = withEf.slice(mid).map((f) => f.ride_facts.efficiency_factor as number);
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
    const pct = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
    if (pct <= -5) {
      out.push({
        id: 'ride_efficiency_factor_trending_down',
        category: 'is_it_working',
        severity: pct <= -9 ? 'warning' : 'info',
        headline: `Cycling efficiency (NP vs HR) trending down (~${Math.round(Math.abs(pct) * 10) / 10}% vs early window)`,
        detail:
          `Power relative to average HR has slipped in recent rides versus earlier ones. Can reflect fatigue, detraining, or more variable pacing — contextualize with sleep and load.`,
        evidence: `${withEf.length} rides, efficiency_factor early ${avgFirst.toFixed(2)} vs recent ${avgSecond.toFixed(2)}`,
      });
    }
  }

  const easyRides = ridesChrono.filter((f) => isEasyRideSession(f, plannedById));
  const easyWithIf = easyRides.filter((f) =>
    typeof f.ride_facts?.intensity_factor === 'number' && !Number.isNaN(f.ride_facts.intensity_factor)
  );
  if (easyWithIf.length >= 5) {
    const mid = Math.ceil(easyWithIf.length / 2);
    const first = easyWithIf.slice(0, mid).map((f) => f.ride_facts.intensity_factor as number);
    const second = easyWithIf.slice(mid).map((f) => f.ride_facts.intensity_factor as number);
    const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
    const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
    const deltaIf = Math.round((avgSecond - avgFirst) * 100) / 100;
    if (deltaIf >= 0.08) {
      out.push({
        id: 'ride_easy_intensity_factor_up',
        category: 'adherence',
        severity: deltaIf >= 0.14 ? 'warning' : 'info',
        headline: `Easy rides — intensity factor creeping up (IF +${deltaIf.toFixed(2)})`,
        detail:
          `On sessions flagged as easy (low IF and/or easy/recovery plan copy), normalized power vs FTP has drifted higher in recent rides. Easy days may be drifting toward moderate — watch fatigue.`,
        evidence: `${easyWithIf.length} easy rides, IF ~${avgFirst.toFixed(2)} → ~${avgSecond.toFixed(2)}`,
      });
    }
  }
}

function parseStrengthExercisesArray(raw: unknown): any[] {
  if (raw == null) return [];
  let v: any = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v;
}

function prescribedRirFromExercise(ex: any): number | null {
  if (typeof ex?.target_rir === 'number' && !Number.isNaN(ex.target_rir)) return ex.target_rir;
  if (typeof ex?.rir === 'number' && !Number.isNaN(ex.rir)) return ex.rir;
  return null;
}

function normLiftKey(s: string): string {
  return String(s || '').trim().toLowerCase().replace(/_/g, ' ');
}

function buildPrescribedRirByName(strengthExercises: any): Map<string, number> {
  const m = new Map<string, number>();
  for (const ex of parseStrengthExercisesArray(strengthExercises)) {
    const name = normLiftKey(String(ex?.name || ''));
    if (!name) continue;
    const r = prescribedRirFromExercise(ex);
    if (r != null) m.set(name, r);
  }
  return m;
}

function detectStrengthRirGap(
  facts: WorkoutFactRow[],
  plannedById: Map<string, PlannedRow>,
  out: LongitudinalSignal[],
): void {
  let below = 0;
  let above = 0;
  let compared = 0;
  const belowLifts: string[] = [];
  const aboveLifts: string[] = [];

  for (const f of facts) {
    if (f.discipline !== 'strength' || !f.planned_workout_id || !f.strength_facts?.exercises) continue;
    const pw = plannedById.get(f.planned_workout_id);
    if (!pw) continue;
    const rx = buildPrescribedRirByName(pw.strength_exercises);
    if (rx.size === 0) continue;

    const exArr = Array.isArray(f.strength_facts.exercises) ? f.strength_facts.exercises : [];
    for (const ex of exArr) {
      const canonK = normLiftKey(String(ex.canonical || ''));
      const nameK = normLiftKey(String(ex.name || ''));
      const prescribed = (canonK ? rx.get(canonK) : undefined) ?? (nameK ? rx.get(nameK) : undefined);
      if (prescribed == null) continue;
      const ar = ex.avg_rir;
      if (typeof ar !== 'number' || Number.isNaN(ar)) continue;
      compared++;
      if (ar < prescribed - 0.9) {
        below++;
        if (belowLifts.length < 4) belowLifts.push(String(ex.name || ex.canonical || canonK || nameK));
      } else if (ar > prescribed + 1.4) {
        above++;
        if (aboveLifts.length < 4) aboveLifts.push(String(ex.name || ex.canonical || canonK || nameK));
      }
    }
  }

  if (compared >= 2 && below >= 2) {
    out.push({
      id: 'strength_rir_below_prescription',
      category: 'is_it_working',
      severity: 'warning',
      headline: `Strength: avg RIR below prescribed on multiple lifts`,
      detail:
        `Logged reps-in-reserve are lower than plan targets for several exercises — you're training closer to failure than prescribed. Watch joint stress and recovery; consider dialing load or volume if fatigue stacks.`,
      evidence: `${below}/${compared} lift-comparisons low vs prescribed (${belowLifts.join(', ')})`,
    });
  }
  if (compared >= 3 && above >= 3) {
    out.push({
      id: 'strength_rir_above_prescription',
      category: 'is_it_working',
      severity: 'info',
      headline: `Strength: leaving more in the tank than prescribed`,
      detail:
        `Avg RIR is higher than targets on multiple lifts — you may be undershooting intensity if the goal was near-prescription effort.`,
      evidence: `${above}/${compared} lift-comparisons high vs prescribed (${aboveLifts.join(', ')})`,
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

function fmtPacePerMi(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function severityRank(s: LongitudinalSignal['severity']): number {
  const sev: Record<string, number> = { concern: 0, warning: 1, info: 2 };
  return sev[s] ?? 2;
}

function sortSignalsBySeverity(sigs: LongitudinalSignal[]): LongitudinalSignal[] {
  return [...sigs].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

/** Heuristic for coach ordering / filtering — no change to detection. */
export function isSwimRelatedLongitudinalSignal(s: LongitudinalSignal): boolean {
  const blob = `${s.id} ${s.headline} ${s.detail} ${s.evidence}`.toLowerCase();
  return (
    /\bswim\b/.test(blob) ||
    /\bpool\b/.test(blob) ||
    /\bcss\b/.test(blob) ||
    /\bopen water\b/.test(blob) ||
    /\b100\s*(m|yd)\b/.test(blob)
  );
}

export type LongitudinalCoachSwimIntent = 'focus' | 'race';

/**
 * Format multi-week pattern signals for the weekly coach LLM.
 * When `swimIntent` is set (tri goal context), adjusts ordering and which swim lines appear.
 */
export function longitudinalSignalsToPrompt(
  signals: LongitudinalSignals,
  opts?: { swimIntent?: LongitudinalCoachSwimIntent | null },
): string {
  if (!signals.signals.length) return '';

  const swimIntent = opts?.swimIntent;

  let ordered: LongitudinalSignal[];
  if (swimIntent === 'race') {
    ordered = signals.signals.filter((s) => !isSwimRelatedLongitudinalSignal(s) || s.severity === 'concern');
  } else if (swimIntent === 'focus') {
    const swim = signals.signals.filter(isSwimRelatedLongitudinalSignal);
    const rest = signals.signals.filter((s) => !isSwimRelatedLongitudinalSignal(s));
    ordered = [...sortSignalsBySeverity(swim), ...sortSignalsBySeverity(rest)];
  } else {
    ordered = [...signals.signals];
  }

  if (!ordered.length) return '';

  const lines = [
    `=== LONGITUDINAL PATTERNS (${signals.window_weeks}-week window) ===`,
  ];

  if (swimIntent === 'focus') {
    lines.push(
      'SWIM_POSTURE (swim_intent focus): Swim is a primary training vector this block — treat it alongside bike power trends and run aerobic efficiency. Name swim explicitly when it matters this week (pace feel, drill quality, steady aerobic execution, threshold/CSS work when session lines support it). Any swim-related pattern listed below comes before other disciplines by design; still prioritize a non-swim [CONCERN] in the headline if it is clearly more urgent.',
    );
  } else if (swimIntent === 'race') {
    lines.push(
      'SWIM_POSTURE (swim_intent race): Swim sessions are in to keep feel and sharpness; foreground bike power trends and run aerobic efficiency in synthesis. Only emphasize swim-related items below when they are tagged [CONCERN].',
    );
  }

  for (const s of ordered) {
    const tag = s.severity === 'concern' ? '[CONCERN]' : s.severity === 'warning' ? '[WATCH]' : '[NOTE]';
    lines.push(`${tag} ${s.headline}`);
    lines.push(`  ${s.detail}`);
  }

  lines.push('=== END LONGITUDINAL PATTERNS ===');
  lines.push('');
  lines.push('When referencing these patterns, pick at most 1-2 that are most actionable this week. Speak plainly — "your easy pace has been creeping faster" not "longitudinal signal detected." Do NOT quote raw counts like "X of Y sessions" — describe the trend qualitatively ("you\'ve been skipping runs more often" or "consistency has dropped").');

  return lines.join('\n');
}
