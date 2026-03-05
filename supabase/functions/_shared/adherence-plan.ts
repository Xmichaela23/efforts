export interface PlannedSessionLike {
  id?: string | number | null;
  date?: string | null;
  type?: string | null;
  workload_planned?: number | null;
}

export interface CompletedSessionLike {
  date?: string | null;
  type?: string | null;
  workout_status?: string | null;
  workload_actual?: number | null;
  planned_id?: string | number | null;
}

export interface WtdLoadSummary {
  planned_wtd_load: number;
  planned_week_total_load: number;
  planned_remaining_load: number;
  actual_wtd_load: number;
  wtd_completion_ratio: number | null;
}

export interface PlanProgressSummary {
  week_start: string;
  week_end: string;
  focus_date: string;
  planned_week_total: number;
  planned_to_date_total: number;
  planned_sessions_week: number;
  planned_sessions_to_date: number;
  completed_to_date_total: number;
  completed_sessions_to_date: number;
  matched_planned_sessions_to_date: number;
  match_confidence: number;
  status: 'on_track' | 'behind' | 'ahead' | 'unknown';
  percent_of_planned_to_date: number | null;
}

function safeNum(n: any): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function isCompleted(status: any): boolean {
  return String(status || '').toLowerCase() === 'completed';
}

export function normalizeSportDiscipline(type: string): string {
  const t = String(type || '').toLowerCase();
  if (t.includes('swim')) return 'swim';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) return 'bike';
  if (t.includes('run') || t.includes('jog')) return 'run';
  if (t.includes('walk') || t.includes('hike')) return 'run';
  if (t.includes('strength') || t.includes('weight')) return 'strength';
  if (t.includes('mobility') || t.includes('pilates') || t.includes('yoga') || t.includes('stretch') || t === 'pt') return 'mobility';
  return 'other';
}

export function computeWtdLoadSummary(
  plannedWeek: PlannedSessionLike[],
  completedRows: CompletedSessionLike[],
  asOfDateISO: string,
): WtdLoadSummary {
  const plannedWeekArr = Array.isArray(plannedWeek) ? plannedWeek : [];
  const completedArr = Array.isArray(completedRows) ? completedRows : [];

  const planned_wtd_load = plannedWeekArr
    .filter((r) => String(r?.date || '') <= asOfDateISO)
    .reduce((sum, r) => sum + safeNum(r?.workload_planned), 0);

  const planned_week_total_load = plannedWeekArr
    .reduce((sum, r) => sum + safeNum(r?.workload_planned), 0);

  const planned_remaining_load = plannedWeekArr
    .filter((r) => String(r?.date || '') >= asOfDateISO && !isCompleted((r as any)?.workout_status))
    .reduce((sum, r) => sum + safeNum(r?.workload_planned), 0);

  const actual_wtd_load = completedArr
    .filter((r) => isCompleted(r?.workout_status))
    .reduce((sum, r) => sum + safeNum(r?.workload_actual), 0);

  const wtd_completion_ratio = planned_wtd_load > 0
    ? Math.max(0, Math.min(1, actual_wtd_load / planned_wtd_load))
    : null;

  return {
    planned_wtd_load,
    planned_week_total_load,
    planned_remaining_load,
    actual_wtd_load,
    wtd_completion_ratio,
  };
}

export function computePlanProgressSummary(args: {
  plannedWeek: PlannedSessionLike[];
  completed: CompletedSessionLike[];
  weekStartISO: string;
  weekEndISO: string;
  focusDateISO: string;
}): PlanProgressSummary {
  const plannedWeekAll = Array.isArray(args.plannedWeek) ? args.plannedWeek : [];
  const completedAll = Array.isArray(args.completed) ? args.completed : [];
  const { weekStartISO, weekEndISO, focusDateISO } = args;

  const plannedToDate = plannedWeekAll.filter((p) => String(p?.date || '') <= focusDateISO);
  const plannedWeekTotal = plannedWeekAll.reduce((sum, p) => sum + safeNum(p?.workload_planned), 0);
  const plannedToDateTotal = plannedToDate.reduce((sum, p) => sum + safeNum(p?.workload_planned), 0);

  const weekCompletedToDate = completedAll.filter((w) =>
    String(w?.date || '') >= weekStartISO &&
    String(w?.date || '') <= focusDateISO &&
    isCompleted(w?.workout_status),
  );
  const completedToDateTotal = weekCompletedToDate.reduce((sum, w) => sum + safeNum(w?.workload_actual), 0);

  const completedByPlannedId = new Set<string>(
    weekCompletedToDate
      .map((w) => (w?.planned_id != null ? String(w.planned_id) : ''))
      .filter(Boolean),
  );

  const completedByDateDiscipline = new Map<string, number>();
  for (const w of weekCompletedToDate) {
    const key = `${String(w?.date || '')}::${normalizeSportDiscipline(String(w?.type || ''))}`;
    completedByDateDiscipline.set(key, (completedByDateDiscipline.get(key) || 0) + 1);
  }

  let matchedPlanned = 0;
  for (const p of plannedToDate) {
    const pid = String(p?.id || '');
    if (pid && completedByPlannedId.has(pid)) {
      matchedPlanned += 1;
      continue;
    }
    const key = `${String(p?.date || '')}::${normalizeSportDiscipline(String(p?.type || ''))}`;
    if ((completedByDateDiscipline.get(key) || 0) > 0) {
      matchedPlanned += 1;
    }
  }

  const plannedSessionsToDate = plannedToDate.length;
  const matchConfidence = plannedSessionsToDate > 0 ? matchedPlanned / plannedSessionsToDate : 0;

  let status: PlanProgressSummary['status'] = 'unknown';
  let pct: number | null = null;
  if (plannedToDateTotal > 0 && plannedSessionsToDate > 0) {
    const ratio = completedToDateTotal / plannedToDateTotal;
    pct = Math.round(ratio * 100);
    if (matchConfidence >= 0.5) {
      if (ratio < 0.85) status = 'behind';
      else if (ratio > 1.15) status = 'ahead';
      else status = 'on_track';
    }
  }

  return {
    week_start: weekStartISO,
    week_end: weekEndISO,
    focus_date: focusDateISO,
    planned_week_total: Math.round(plannedWeekTotal),
    planned_to_date_total: Math.round(plannedToDateTotal),
    planned_sessions_week: plannedWeekAll.length,
    planned_sessions_to_date: plannedSessionsToDate,
    completed_to_date_total: Math.round(completedToDateTotal),
    completed_sessions_to_date: weekCompletedToDate.length,
    matched_planned_sessions_to_date: matchedPlanned,
    match_confidence: Math.round(matchConfidence * 100) / 100,
    status,
    percent_of_planned_to_date: pct,
  };
}
