/**
 * ═══ WHICH SESSION IS LISTED FIRST ON A DAY, DECIDED HERE (2026-09-10, audit H-T16) ═══════════════
 *
 * ⛔ THE PHONE DECIDED THIS (`src/lib/pairing-timing.ts`, deleted) and the plan builder decided it
 * again another way (`generate-combined-plan/week-builder.ts decideOrdering`, which still writes the
 * AM/PM word onto a combined plan's rows at activation). On a combined plan with the default
 * preference the server said run first and the phone showed the lift first. get-week now stamps
 * `day_order` on every item and plan-overview on every planned row; the screens sort by it and hold
 * no rule of their own.
 *
 * THE RULE:
 *   0. THE PLYO WARM-UP GOES FIRST (2026-09-19): p246, p274 and p278 name the session a warm-up ("Plyo warm-up"), and
 *      p275 calls it "the midweek plyo warm-up", so it is listed before the run, ride or lift it warms up for.
 *   1. THE BOOK'S ORDER, AND ONLY WHERE THE PAGE STATES ONE (2026-09-19): the plan's lift goes before its ride or run
 *      exactly when Today prints the order sentence — `liftGoesFirst` in `standing-plan/spacing-line.ts`, one rule for
 *      the sentence and the order (Viada p143 rules 5 and 6, p77). It replaced the phone's rule moved here on
 *      2026-09-10 (a lower-body lift before any partner but a long ride), which put the lift first on days the page
 *      is silent about and read the lift's region off its name.
 *   2. Else a stored AM/PM on the row (`workout_metadata.timing`, activate-plan on a combined plan).
 *   3. Else discipline: swim, bike, run, strength, then the rest. OURS — a stable tie-break with no
 *      outside source (docs/STATE-SOURCES.md).
 *   4. Else the name.
 *
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "day-order" supabase/functions --include=index.ts
 */

import { isPlyoWarmUp as plyoTagged, liftGoesFirst } from './standing-plan/spacing-line.ts';

export type DayOrderRow = {
  type?: string | null;
  discipline?: string | null;
  name?: string | null;
  tags?: unknown;
  timing?: unknown;
  workout_metadata?: unknown;
  /** What rule 1 reads (`SpacingRow`): the plan the row belongs to, the lift's rows, the session's minutes. */
  training_plan_id?: string | null;
  strength_exercises?: unknown;
  duration?: number | null;
  total_duration_seconds?: number | null;
};

/** Rule 1: the lift first and its ride or run second where the page states the order; every other row stays untimed. */
export function dayTimings<T>(rows: readonly T[], read: (r: T) => DayOrderRow): Map<T, 'AM' | 'PM'> {
  const out = new Map<T, 'AM' | 'PM'>();
  const read_ = rows.map(read);
  const pair = liftGoesFirst(read_);
  if (!pair) return out;
  out.set(rows[read_.indexOf(pair.lift)], 'AM');
  out.set(rows[read_.indexOf(pair.endurance)], 'PM');
  return out;
}

/** Rule 0: the plan's plyo session (`compose.ts` tags it `plyo`), which the book names a warm-up. */
function isPlyoWarmUp(r: DayOrderRow): boolean {
  return plyoTagged(r as never);
}

function storedTiming(r: DayOrderRow): 'AM' | 'PM' | null {
  const meta = r.workout_metadata && typeof r.workout_metadata === 'object' ? (r.workout_metadata as { timing?: unknown }).timing : null;
  const t = r.timing ?? meta;
  return t === 'AM' || t === 'PM' ? t : null;
}

export function disciplineRank(r: DayOrderRow): number {
  const t = String(r.type ?? r.discipline ?? '').toLowerCase();
  const n = String(r.name ?? '').toLowerCase();
  if (t === 'swim' || /\bswim\b/.test(n)) return 0;
  if (t === 'bike' || t === 'ride' || /\bbrick\b.*\b(bike|ride)\b/.test(n) || /\b(bike|ride)\b.*\bbrick\b/.test(n)) return 1;
  if (t === 'run' || /\bbrick\b.*\brun\b/.test(n) || /\brun\b.*\bbrick\b/.test(n)) return 2;
  if (t === 'strength') return 3;
  return 4;
}

/** One day's rows in the order they are listed. Stable: ties keep the input order. */
export function orderDay<T>(rows: readonly T[], read: (r: T) => DayOrderRow): T[] {
  if (!Array.isArray(rows) || rows.length <= 1) return Array.isArray(rows) ? rows.slice() : [];
  const timings = dayTimings(rows, read);
  const timingRank = (r: T): number => {
    const t = timings.get(r) ?? storedTiming(read(r));
    if (t === 'AM') return 0;
    if (t === 'PM') return 2;
    return 1;
  };
  const warmUpRank = (r: T): number => (isPlyoWarmUp(read(r)) ? 0 : 1);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const w = warmUpRank(a.r) - warmUpRank(b.r);
      if (w !== 0) return w;
      const t = timingRank(a.r) - timingRank(b.r);
      if (t !== 0) return t;
      const d = disciplineRank(read(a.r)) - disciplineRank(read(b.r));
      if (d !== 0) return d;
      const n = String(read(a.r).name || '').localeCompare(String(read(b.r).name || ''));
      if (n !== 0) return n;
      return a.i - b.i;
    })
    .map((x) => x.r);
}

/**
 * `day_order` for every row, 1-based within its day. `keyOf` names the day (a date, or a plan
 * week + day number); rows with no day get no order.
 */
export function dayOrderFor<T>(rows: readonly T[], keyOf: (r: T) => string | null, read: (r: T) => DayOrderRow): Map<T, number> {
  const byDay = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const list = byDay.get(k);
    if (list) list.push(r); else byDay.set(k, [r]);
  }
  const out = new Map<T, number>();
  for (const list of byDay.values()) {
    orderDay(list, read).forEach((r, i) => out.set(r, i + 1));
  }
  return out;
}
