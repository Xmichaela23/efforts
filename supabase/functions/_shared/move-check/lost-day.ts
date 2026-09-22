// =============================================================================
// lost-day — "Can't train this day": where that day's sessions go
// =============================================================================
//
// ⛔ BUILT ON THE MOVE CHECK (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md Stages 1–4). Every session planned on
// the lost day goes to its first "Days that fit" day (`daysThatFit`), so a drag in the calendar and a lost day read
// the same three notes and cannot disagree. Nothing here reads a database or a clock, and nothing is written.
//
// THE RULES, IN ORDER:
//   1. The lost day is closed for this week. Days before today and days off are never destinations (`daysThatFit`).
//   2. A session the athlete dragged stays where they put it.
//   3. Lifts are placed first — the p80 gap is theirs — then the rest, in the order the day listed them.
//   4. Each goes to its first day that fits, skipping a day that already holds two sessions.
//      OURS — no three-session days: the book is silent; the smallest choice. docs/STATE-SOURCES.md "Move check".
//   5. If no day fits, it goes to the closest open day (still never a third session where a day with fewer exists),
//      and carries the move check's notes for that day. Nothing is dropped.
//      OURS — "closest" = fewest days from the lost day, ties to the earlier date; next week only when no day this
//      week is open. docs/STATE-SOURCES.md "Move check".
// =============================================================================

import { checkMove, daysBetween, daysThatFit, weekdayName, type MoveRow } from './index.ts';

export type LostDaySession = {
  id: string;
  name: string | null;
  type: string | null;
  /** The day it is on now. */
  from: string;
  /** The day it goes to. Equal to `from` for a session that does not move. */
  to: string;
  /** False for a done session: it is shown, never moved. */
  movable: boolean;
  /** The move check's own words for `to`; empty when it does not move or nothing applies. */
  notes: string[];
};

export type LostDayPlan = {
  lostDate: string;
  /** Monday … Sunday of the lost day's week. */
  week: string[];
  /** Every session of the week, in date order. */
  sessions: LostDaySession[];
};

const iso = (d: unknown) => String(d ?? '').slice(0, 10);
const addDays = (d: string, n: number): string => {
  const t = new Date(`${iso(d)}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const mondayOf = (d: string): string => addDays(d, -((new Date(`${iso(d)}T12:00:00Z`).getUTCDay() + 6) % 7));
const status = (r: MoveRow) => String(r.workout_status ?? 'planned').toLowerCase();
const isPlanned = (r: MoveRow) => status(r) === 'planned';
const isLift = (r: MoveRow) => String(r.type ?? '').toLowerCase() === 'strength';

// OURS — no three-session days (rule 4 above).
const MAX_SESSIONS_A_DAY = 2;

export function placeLostDay(args: {
  lostDate: string;
  /** The athlete's rows around the week — three weeks either side covers the p80 gap. */
  rows: MoveRow[];
  daysOff: string[];
  today: string;
  /** The athlete's own drags on this screen: session id → day. */
  moves?: Record<string, string>;
}): LostDayPlan {
  const lost = iso(args.lostDate);
  const today = iso(args.today);
  const monday = mondayOf(lost);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = (d: string) => d >= week[0] && d <= week[6];
  const offDays = args.daysOff.map((d) => String(d).trim().toLowerCase());
  const isOff = (d: string) => offDays.includes(weekdayName(d).toLowerCase());

  /** Where every row sits as the placement runs. */
  const at = new Map<string, string>(args.rows.map((r) => [r.id, iso(r.date)]));
  const current = (): MoveRow[] => args.rows.map((r) => ({ ...r, date: at.get(r.id) ?? iso(r.date) }));
  const countOn = (d: string, except: string) =>
    args.rows.filter((r) => r.id !== except && status(r) !== 'skipped' && at.get(r.id) === d).length;

  // 2. The athlete's drags, first and as given.
  const moves = args.moves ?? {};
  for (const r of args.rows) {
    const to = moves[r.id];
    if (to && isPlanned(r) && inWeek(iso(r.date))) at.set(r.id, iso(to));
  }

  // 3. The lost day's planned sessions not already dragged: lifts first, then in the day's own order.
  const toPlace = args.rows
    .filter((r) => iso(r.date) === lost && isPlanned(r) && !moves[r.id])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(isLift(b.r)) - Number(isLift(a.r)) || a.i - b.i)
    .map((x) => x.r);

  for (const s of toPlace) {
    const rows = current();
    // 4. The first day that fits and would not become a third session.
    const fits = daysThatFit({ session: s, fromDate: lost, toDate: lost, rows, daysOff: args.daysOff, today, max: 7 })
      .filter((d) => countOn(d, s.id) < MAX_SESSIONS_A_DAY);
    let to = fits[0];
    if (!to) {
      // 5. The closest open day: this week first, then the next; fewer than two sessions first.
      const open = (d: string) => d !== lost && d >= today && !isOff(d);
      const pool = week.filter(open);
      const next = pool.length > 0 ? pool : Array.from({ length: 7 }, (_, i) => addDays(week[6], i + 1)).filter(open);
      next.sort((a, b) =>
        Number(countOn(a, s.id) >= MAX_SESSIONS_A_DAY) - Number(countOn(b, s.id) >= MAX_SESSIONS_A_DAY)
        || Math.abs(daysBetween(lost, a)) - Math.abs(daysBetween(lost, b))
        || a.localeCompare(b));
      to = next[0] ?? lost;
    }
    at.set(s.id, to);
  }

  // The notes, read against the finished week so a later placement's session counts for an earlier one.
  const final = current();
  const sessions: LostDaySession[] = args.rows
    .filter((r) => inWeek(iso(r.date)) && status(r) !== 'skipped')
    .map((r) => {
      const from = iso(r.date), to = at.get(r.id) ?? from;
      const notes = to === from ? [] : checkMove({ session: r, toDate: to, rows: final, daysOff: args.daysOff }).notes.map((n) => n.text);
      return { id: r.id, name: r.name ?? null, type: r.type ?? null, from, to, movable: isPlanned(r), notes };
    })
    .sort((a, b) => a.to.localeCompare(b.to));
  return { lostDate: lost, week, sessions };
}
