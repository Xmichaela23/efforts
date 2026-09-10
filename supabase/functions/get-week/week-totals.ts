/**
 * ═══ THE WEEK BAR'S TWO TOTALS, COUNTED ON THE SERVER (2026-09-10, audit H-T03) ══════════════════
 *
 * ⛔ THE PHONE SUMMED THESE OFF THE ROWS ON SCREEN, AND "PLANNED" MOVED AS THE ATHLETE TRAINED. The
 * Week tab hid a finished session's planned row and counted the completed row in BOTH totals, so a
 * 60-minute planned run finished in 72 added 72 to "Planned". A plan does not grow because it was
 * done.
 *
 * ⚠️ WHAT EACH TOTAL IS NOW:
 *   · planned minutes / metres — every session the plan holds this week, at its PLANNED length
 *     (`planned_duration_seconds`, the one ladder) and its planned distance where the prescription
 *     states one (the distance steps), whether done yet or not.
 *   · done minutes / metres — every executed session (`is_executed`), at its moving time and its
 *     recorded distance, planned or not.
 *   · lifts — counted, not timed: planned lifts, and executed ones.
 * ⚠️ PER SESSION, MINUTES ARE ROUNDED BEFORE THEY ARE ADDED, as the bar did.
 */

// deno-lint-ignore no-explicit-any
type Item = Record<string, any>;

export type WeekBarTotals = {
  planned_minutes: number;
  done_minutes: number;
  planned_meters: number;
  done_meters: number;
  lifts_planned: number;
  lifts_done: number;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function weekBarTotals(items: ReadonlyArray<Item> | null | undefined): WeekBarTotals {
  const out: WeekBarTotals = { planned_minutes: 0, done_minutes: 0, planned_meters: 0, done_meters: 0, lifts_planned: 0, lifts_done: 0 };
  for (const it of items ?? []) {
    const type = String(it?.type ?? '').toLowerCase();
    const planned = it?.planned && typeof it.planned === 'object' ? it.planned : null;
    const done = it?.is_executed === true;
    if (type === 'strength') {
      if (planned) out.lifts_planned += 1;
      if (done) out.lifts_done += 1;
      continue;
    }
    if (planned) {
      out.planned_minutes += Math.round(num(planned.planned_duration_seconds) / 60);
      const steps = Array.isArray(planned.steps) ? planned.steps : [];
      out.planned_meters += steps.reduce((s: number, st: Item) => s + num(st?.distanceMeters), 0);
    }
    if (done) {
      out.done_minutes += Math.round(num(it?.moving_seconds) / 60);
      out.done_meters += num(it?.executed?.overall?.distance_m);
    }
  }
  out.planned_meters = Math.round(out.planned_meters);
  out.done_meters = Math.round(out.done_meters);
  return out;
}
