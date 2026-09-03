/**
 * planned-vs-done totals for the week — ONE computation, read by every LoadBar caller.
 *
 * ⛔ Home (WorkoutCalendar) and State (StateTab) both draw the LoadBar. State passed
 * `hasActivePlan · plannedThisWeek · doneThisWeek` and Home passed nothing, so the two screens
 * could print different load words for the SAME week (2026-09-03). Both now read this.
 * Source: `weekly_state_v1.week_execution_v1.counts`, summed across disciplines — the same
 * planned-vs-done source the execution bar reads. No second notion of "missed".
 */
export function weekExecTotals(wsv: unknown): { planned: number; done: number } {
  const counts = ((wsv as { week_execution_v1?: { counts?: Array<{ planned?: number; done?: number }> } } | null | undefined)?.week_execution_v1?.counts ?? []);
  return {
    planned: counts.reduce((s, c) => s + (Number(c?.planned) || 0), 0),
    done: counts.reduce((s, c) => s + (Number(c?.done) || 0), 0),
  };
}
