// =============================================================================
// move-check — what the book says about moving one session to another day
// =============================================================================
//
// ⛔ THE BOOK'S CHECKS ONLY (2026-09-21, docs/WORKORDER-lost-day-2026-09-21.md "Move check rebuilt on the
// book"). The Jan 2026 check it replaces (ranked options, workload caps, recovery-hour messages) had no page
// behind it and is gone. Three checks, each with its page, and the days that trigger none of them.
//
// ⛔ ONE PIECE, TWO USERS. `validate-reschedule` asks it about one drag; the lost-day step asks it about
// every day it considers. Both read the same notes, so the drag and the lost day cannot disagree.
//
// ⚠️ PURE: the caller reads the rows, the athlete's days off and the athlete's today. Nothing here reads a
// database or a clock.
// =============================================================================

import { movedOrigin } from '../moved-from.ts';
import { conflictsOfTyped, typedRowsOf } from '../standing-plan/week-conflicts.ts';

export type MoveRow = {
  id: string;
  date: string;
  type?: string | null;
  name?: string | null;
  workout_status?: string | null;
  training_plan_id?: string | null;
  /** The composer's tags — `plyo` marks the warm-up block (p274 prints it as that day's warm-up). */
  tags?: unknown;
  /** Minutes. The lost day uses it to let the longest easy session pick first (p109, "all minutes count"). */
  duration?: number | null;
};

export type MoveNote = {
  /** `week_rule` = a warning the builder writes for the same week (`week-conflicts.ts`), new with this move. */
  rule: 'two_sessions' | 'lift_gap' | 'day_off' | 'week_rule';
  /** The book page the note comes from; null for the day-off refusal (the athlete's own answer) and for a week rule, whose page is in `week-conflicts.ts`. */
  page: 'p108' | 'p80' | null;
  text: string;
};

export type MoveCheck = {
  /** True only for a day off — the one move that is refused. */
  refused: boolean;
  notes: MoveNote[];
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const iso = (d: unknown) => String(d ?? '').slice(0, 10);
const dayMs = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
/** Whole days from `a` to `b` (b − a). */
export const daysBetween = (a: string, b: string): number => Math.round((dayMs(iso(b)) - dayMs(iso(a))) / 86_400_000);
const addDays = (d: string, n: number): string => new Date(dayMs(iso(d)) + n * 86_400_000).toISOString().slice(0, 10);
export const weekdayName = (d: string): string => WEEKDAYS[new Date(dayMs(iso(d))).getUTCDay()];
/** Monday of the week holding `d`. */
const mondayOf = (d: string): string => addDays(d, -((new Date(dayMs(iso(d))).getUTCDay() + 6) % 7));

const isSkipped = (r: MoveRow) => String(r.workout_status ?? '').toLowerCase() === 'skipped';
const isLift = (r: MoveRow) => String(r.type ?? '').toLowerCase() === 'strength';
/**
 * ⛔ THE PLYO WARM-UP IS NOT A SESSION OF ITS OWN (2026-09-21, Michael). p274 prints it as the day's warm-up: it moves
 * with the session it warms up and does not count toward the three-session limit. Read by its tag, never its name.
 */
export const isPlyo = (r: MoveRow): boolean =>
  Array.isArray(r.tags) && (r.tags as unknown[]).some((t) => String(t).toLowerCase() === 'plyo');

/**
 * ⛔ A "DOWN" DAY IS CLOSED (2026-09-22, Michael): a day with nothing left on it whose sessions were moved off it (rows
 * still carry it as their original day, `moved_from:`) or came off it (skipped). Like a day off, it is never a destination: not for
 * "Days that fit" and not for a later lost day. Read off the rows' tags, the same reading get-week's "Down" line makes.
 */
/** `lost_day:<date>` — the mark a lost day leaves on the sessions it moved or took off (`lost-day.ts`). */
const lostMark = (r: MoveRow): boolean =>
  Array.isArray(r.tags) && (r.tags as unknown[]).some((t) => String(t).startsWith('lost_day:'));

export function downDates(rows: MoveRow[]): Set<string> {
  const origins = new Set<string>();
  for (const r of rows) {
    const o = movedOrigin(r);
    if (o && o !== iso(r.date)) origins.add(o);
    // ⚠️ AND A DAY WHOSE SESSIONS CAME OFF (2026-09-22): a lost day's session with no room left is skipped, not moved,
    // so a day lost that way carries no `moved_from:` — its `lost_day:` mark is what shows it. A day the athlete skipped
    // themselves carries no mark and stays open.
    if (isSkipped(r) && lostMark(r)) origins.add(iso(r.date));
  }
  for (const r of rows) if (!isSkipped(r) && origins.has(iso(r.date))) origins.delete(iso(r.date));
  return origins;
}

// OURS — no three-session days; owned by `week-conflicts.ts` so the builder's note and this limit are one number.
export { MAX_SESSIONS_A_DAY } from '../standing-plan/week-conflicts.ts';
import { MAX_SESSIONS_A_DAY } from '../standing-plan/week-conflicts.ts';
/** Sessions on `date` other than `exceptId` — skipped rows and plyo warm-ups do not count. */
export const sessionsOn = (rows: MoveRow[], date: string, exceptId: string): number =>
  rows.filter((r) => r.id !== exceptId && iso(r.date) === iso(date) && !isSkipped(r) && !isPlyo(r)).length;

/**
 * The lift a session trains, as the plan names it — `Lower body: Hinge` → `Hinge`. ⚠️ THE PATTERN, NOT THE
 * MOVEMENT: the plan rotates the ME movement week to week (p274 "rotate with primary push"), so matching on the
 * movement would read a two-week gap every time. The session name carries the pattern the plan repeats.
 */
export function liftLabel(r: MoveRow): string {
  const name = String(r.name ?? '').trim();
  const i = name.lastIndexOf(': ');
  return i >= 0 ? name.slice(i + 2).trim() : name;
}

/** Days from the session before, and to the session after, the same lift if it sat on `date`. Null = none found. */
export function liftGaps(session: MoveRow, date: string, rows: MoveRow[]): { before: number | null; after: number | null } {
  const same = rows.filter((r) => r.id !== session.id && isLift(r) && !isSkipped(r)
    && String(r.name ?? '') === String(session.name ?? '')
    && (session.training_plan_id == null || r.training_plan_id === session.training_plan_id));
  let before: number | null = null, after: number | null = null;
  for (const r of same) {
    const g = daysBetween(date, r.date);
    if (g > 0 && (after == null || g < after)) after = g;
    if (g < 0 && (before == null || -g < before)) before = -g;
  }
  return { before, after };
}

// Viada p80: "at least one session every eight to nine days to get any consistent improvement in a specific
// skill movement." The note fires past nine.
const LIFT_GAP_MAX_DAYS = 9;
// Viada p80: "ideally trained at least twice per week, or once every three to four days."
const LIFT_GAP_IDEAL: [number, number] = [3, 4];

/**
 * The notes a move to `toDate` earns. `rows` = the athlete's other sessions around that date (a few weeks either
 * side is enough for the lift gap); the moved session itself may be in it and is ignored.
 */
export function checkMove(args: { session: MoveRow; toDate: string; rows: MoveRow[]; daysOff: string[] }): MoveCheck {
  const to = iso(args.toDate);
  const day = weekdayName(to);
  // ⛔ A DAY OFF IS THE ONLY REFUSAL — the athlete's own answer, not the book's (the no-hard-gates rule).
  if (args.daysOff.map((d) => String(d).trim().toLowerCase()).includes(day.toLowerCase())) {
    return { refused: true, notes: [{ rule: 'day_off', page: null, text: `${day} is a day off.` }] };
  }
  const notes: MoveNote[] = [];
  // Viada p108: 6–8 h between two-a-days, 4–6 h when the first is an easy session under an hour, a full meal between.
  // ⛔ ONLY WHEN A LIFT IS ONE OF THE TWO (2026-09-21): p108 is about the gap before the resistance session. A run and
  // a ride on one day get no note, and such a day still fits.
  // ⚠️ A plyo warm-up is not a session and not a lift here — it rides with its day's session (see `isPlyo`).
  const realLift = (r: MoveRow) => isLift(r) && !isPlyo(r);
  const others = args.rows.filter((r) => r.id !== args.session.id && iso(r.date) === to && !isSkipped(r) && !isPlyo(r));
  // ⛔ THE WEEK'S OWN RULES FIRST, so a same-day heavy-legs line (which states the order itself) is not doubled by this one.
  const weekNotes = weekRuleNotes(args.session, to, args.rows);
  if (!isPlyo(args.session) && others.length > 0 && (realLift(args.session) || others.some(realLift))
    && !weekNotes.some((t) => t.startsWith(`${day}: `) && /heavy legs\./.test(t) && /6 to 8 hours after/.test(t))) {
    // Viada p108 / p145 rule 6: the lift in the first session, 6-8 h before the next. Michael approved the words 2026-09-23.
    const other = realLift(args.session) ? others.find((r) => !isLift(r)) : args.session;
    const word = other ? (String(other.type ?? '').toLowerCase() === 'ride' ? 'ride' : String(other.type ?? '').toLowerCase() === 'swim' ? 'swim' : 'run') : null;
    notes.push({ rule: 'two_sessions', page: 'p108',
      text: word
        ? `Two sessions on ${day}. Lift first, ${word} 6 to 8 hours after.`
        : `Two sessions on ${day}. Leave 6 to 8 hours between them.` });
  }
  // Viada p80: at least one session every 8 to 9 days per movement. Only past nine; the 3–4 day ideal gets no note.
  if (realLift(args.session)) {
    const { before, after } = liftGaps(args.session, to, args.rows);
    const n = Math.max(before ?? 0, after ?? 0);
    if (n > LIFT_GAP_MAX_DAYS) {
      notes.push({ rule: 'lift_gap', page: 'p80',
        text: `${liftLabel(args.session)}: ${n} days until the next one. Consistent improvement needs one every 8 to 9 days.` });
    }
  }
  // ⛔ THE BUILDER'S WEEK RULES, ON THE WEEK THIS MOVE MAKES (2026-09-22, one source of logic). The same
  // sentences the plan's own week shows ("Thursday: heavy legs after hard run…"), and only the ones this move
  // adds: a clash the week already had is not the move's.
  // ⚠️ The two-sessions note above already covers a second session on the day; the builder's same-day lines
  // say something different (what tired legs do), so both can show.
  for (const text of weekNotes) {
    notes.push({ rule: 'week_rule', page: null, text });
  }
  return { refused: false, notes };
}

/** The builder's warnings for the Monday–Sunday week holding `to`, after the move and not before it. */
export function weekRuleNotes(session: MoveRow, to: string, rows: MoveRow[]): string[] {
  const monday = mondayOf(to);
  const sunday = addDays(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  const live = rows.filter((r) => r.id !== session.id && !isSkipped(r) && inWeek(iso(r.date)));
  const typed = (xs: MoveRow[]) => typedRowsOf(xs.map((r) => ({ ...r, day: weekdayName(iso(r.date)) })));
  const before = live.concat(inWeek(iso(session.date)) && !isSkipped(session) ? [session] : []);
  const after = live.concat([{ ...session, date: to }]);
  const had = new Set(conflictsOfTyped(typed(before), null).map((c) => c.text));
  return conflictsOfTyped(typed(after), null).map((c) => c.text).filter((t) => !had.has(t));
}

/**
 * How far a gap sits outside p80's 3–4 days; 0 inside it or when there is no neighbouring session.
 * ⛔ ONE READER OF p80 FOR THE WHOLE APP: the calendar move, the lost day and the week the builder arranges
 * (`standing-plan/week-arrangement.ts`) all score a lift's spacing through this.
 */
export const offIdeal = (g: number | null): number =>
  g == null ? 0 : g < LIFT_GAP_IDEAL[0] ? LIFT_GAP_IDEAL[0] - g : g > LIFT_GAP_IDEAL[1] ? g - LIFT_GAP_IDEAL[1] : 0;

/**
 * "Days that fit": up to `max` other days of the session's week — not before today, not a day off, not the day it
 * is on or the day asked for, not a day that would hold a third session (OURS), and not a day that puts a lift's gap
 * past nine days (p80).
 * ⛔ THE p108 NOTE DOES NOT DISQUALIFY A DAY (2026-09-21, Michael). It is a note about spacing the two sessions, shown
 * with the move — not a reason the day does not fit.
 *
 * ORDER. First, the day that adds the fewest of the builder's week warnings (the same order the builder arranges a
 * week in). Then lifts: the day that keeps the lift's gaps closest to 3–4 days (Viada p80). Runs and rides: the day
 * nearest the one the session is on.
 * OURS — nearest-day order for runs and rides: the book gives no order for moving endurance; nearest keeps the week's shape. docs/STATE-SOURCES.md
 * Ties go to the earlier date, so two reads of one week give one answer.
 */
export function daysThatFit(args: {
  session: MoveRow; fromDate: string; toDate: string; rows: MoveRow[]; daysOff: string[]; today: string; max?: number;
}): string[] {
  const from = iso(args.fromDate), to = iso(args.toDate), today = iso(args.today);
  const monday = mondayOf(from);
  const cands: Array<{ date: string; cost: number; near: number; clashes: number }> = [];
  const down = downDates(args.rows);
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (d === from || d === to || d < today || down.has(d)) continue;
    const c = checkMove({ session: args.session, toDate: d, rows: args.rows, daysOff: args.daysOff });
    if (c.refused || c.notes.some((n) => n.rule === 'lift_gap')) continue;
    if (!isPlyo(args.session) && sessionsOn(args.rows, d, args.session.id) >= MAX_SESSIONS_A_DAY) continue;
    const near = Math.abs(daysBetween(from, d));
    const cost = isLift(args.session) && !isPlyo(args.session)
      ? (() => { const g = liftGaps(args.session, d, args.rows); return offIdeal(g.before) + offIdeal(g.after); })()
      : near;
    // ⛔ THE SAME ORDER THE BUILDER ARRANGES A WEEK IN (`week-arrangement.ts`): the fewest new week warnings first.
    const clashes = c.notes.filter((n) => n.rule === 'week_rule').length;
    cands.push({ date: d, cost, near, clashes });
  }
  cands.sort((a, b) => a.clashes - b.clashes || a.cost - b.cost || a.near - b.near || a.date.localeCompare(b.date));
  // OURS — at most three days: Michael's spec (2026-09-21), docs/STATE-SOURCES.md "Move check".
  return cands.slice(0, args.max ?? 3).map((c) => c.date);
}
