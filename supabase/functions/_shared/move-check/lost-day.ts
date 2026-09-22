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
//   0. A LOST DAY ONLY COSTS ITS OWN SESSIONS (PM review, 2026-09-22). Sessions already on other days are never
//      bumped or dropped; the lost day's sessions compete only for the room left (the two-session cap, OURS).
//   3. Who picks first (OURS, docs/STATE-SOURCES.md "Move check"): lifts, the one whose p80 gap is widest first;
//      then the week's speed and subthreshold sessions (the p109 floor); then easy sessions, longest first — p109
//      "all minutes count", so the shortest is the one that comes off.
//   4. Each goes to its first day that fits (`daysThatFit`: not a day off, no third session — OURS — and no lift gap
//      past nine days, p80). The p108 note is shown with the move and does not stop it.
//   4a. A plyo warm-up goes with the session it warms up — the lost day's first other session — and is never
//      placed on its own (p274 prints it as that day's warm-up).
//   5. If no day fits, it goes to the closest open day with fewer than two sessions (a lift's p80 gap may then pass
//      nine days — the note says so). OURS — "closest" = fewest days from the lost day, ties to the earlier date.
//   6. If no open day has room left, that session COMES OFF (rather than making a third on a day). Nothing spills
//      into next week. Its warm-up comes off with it.
//   A "Down" day (its sessions all moved off it earlier) is closed, like a day off (`downDates`).
// =============================================================================

import { planDateOf } from '../moved-from.ts';
import { checkMove, daysBetween, daysThatFit, downDates, isPlyo, liftGaps, MAX_SESSIONS_A_DAY, sessionsOn, weekdayName, type MoveRow } from './index.ts';

export type LostDaySession = {
  id: string;
  /** True when it comes off this week (rule 6): shown under the week, skipped on Save — recorded, not deleted. */
  dropped: boolean;
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
  /** The lost day this session belongs to (its `lost_day:` mark on Save); null for a session no lost day touches. */
  lost_day: string | null;
  /** True when an earlier lost day took it off (it is skipped now) — Save puts it back on the plan if it is placed. */
  was_dropped: boolean;
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


/**
 * ⛔ THE LOST-DAY MARK (PM review, 2026-09-22). Every session a lost day moved or took off carries `lost_day:<that day>`,
 * written on Save beside the app's own skip. It is how a lost day is told apart from a day the athlete skipped
 * themselves (which stays open), and how a later lost day in the same week finds the sessions to plan again.
 */
export const LOST_DAY_PREFIX = 'lost_day:';
export function lostDayOf(r: MoveRow): string | null {
  for (const t of Array.isArray(r.tags) ? (r.tags as unknown[]) : []) {
    const v = String(t);
    if (v.startsWith(LOST_DAY_PREFIX) && /^\d{4}-\d{2}-\d{2}$/.test(v.slice(LOST_DAY_PREFIX.length))) return v.slice(LOST_DAY_PREFIX.length);
  }
  return null;
}

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

  /**
   * ⛔ EVERY LOST DAY OF THE WEEK IS PLANNED TOGETHER (PM review, 2026-09-22). The pool is this day's planned sessions
   * plus every session an earlier lost day this week moved or took off (its `lost_day:` mark) — those are placed again
   * from scratch, against the room left. A session never on a lost day is not in the pool and never moves.
   */
  const lostDays = new Set<string>([lost]);
  for (const r of args.rows) { const d = lostDayOf(r); if (d && inWeek(d)) lostDays.add(d); }
  const lostOf = new Map<string, string>();
  for (const r of args.rows) {
    const earlier = lostDayOf(r);
    if (earlier && inWeek(earlier) && status(r) !== 'completed') lostOf.set(r.id, earlier);
    else if (iso(r.date) === lost && isPlanned(r)) lostOf.set(r.id, lost);
  }
  const pool = args.rows.filter((r) => lostOf.has(r.id));

  /** Where every row sits as the placement runs; pool rows start unplaced (counted nowhere). */
  const at = new Map<string, string>(args.rows.map((r) => [r.id, iso(r.date)]));
  const pending = new Set<string>(pool.map((r) => r.id));
  const dropped = new Set<string>();
  const current = (): MoveRow[] => args.rows.map((r) => ({
    ...r,
    date: at.get(r.id) ?? iso(r.date),
    ...(pending.has(r.id) || dropped.has(r.id) ? { workout_status: 'skipped' } : lostOf.has(r.id) ? { workout_status: 'planned' } : {}),
  }));
  const countOn = (d: string, except: string) => sessionsOn(current(), d, except);

  // 2. The athlete's drags, first and as given.
  const moves = args.moves ?? {};
  for (const r of args.rows) {
    const to = moves[r.id];
    if (!to || !inWeek(iso(r.date))) continue;
    if (!(isPlanned(r) || lostOf.has(r.id))) continue;
    at.set(r.id, iso(to));
    pending.delete(r.id);
  }

  // 4a. A warm-up's session: the pool session planned on the warm-up's own day, else the first on that lost day.
  const partnerOf = (w: MoveRow): MoveRow | null =>
    pool.find((r) => !isPlyo(r) && planDateOf(r) === planDateOf(w))
    ?? pool.find((r) => !isPlyo(r) && lostOf.get(r.id) === lostOf.get(w.id)) ?? null;
  const rideAlong = (r: MoveRow) => isPlyo(r) && partnerOf(r) != null;

  // The p109 buckets, read off the composer's `band:` tag (endurance-library/classification.ts).
  const bandOf = (r: MoveRow): string | null => {
    for (const t of Array.isArray(r.tags) ? (r.tags as unknown[]) : []) {
      const v = String(t);
      if (v.startsWith('band:')) return v.slice(5);
    }
    return null;
  };
  const isRealLift = (r: MoveRow) => isLift(r) && !isPlyo(r);
  const isFloor = (r: MoveRow) => { const b = bandOf(r); return !isLift(r) && (b === 'above' || b === 'near' || b === 'below'); };
  /** A lift's widest p80 gap around its own day — the lift most at risk of passing nine days picks first. */
  const liftGapAt = (r: MoveRow) => {
    const g = liftGaps(r, planDateOf(r), current());
    return Math.max(g.before ?? 0, g.after ?? 0);
  };

  const downs = downDates(args.rows);
  const open = (d: string) => !lostDays.has(d) && d >= today && !isOff(d) && !downs.has(d);
  const byNearness = (from: string) => (a: string, b: string) =>
    Math.abs(daysBetween(from, a)) - Math.abs(daysBetween(from, b)) || a.localeCompare(b);

  // 3. The pool, in picking order: lifts (widest gap first), then speed/subthreshold, then easy longest first.
  const tier = (r: MoveRow) => (isRealLift(r) ? 0 : isFloor(r) ? 1 : 2);
  const toPlace = pool
    .filter((r) => pending.has(r.id) && !rideAlong(r))
    .map((r, i) => ({ r, i, t: tier(r), gap: isRealLift(r) ? liftGapAt(r) : 0, min: Number(r.duration ?? 0) || 0, day: planDateOf(r) }))
    .sort((a, b) => a.t - b.t
      || (a.t === 0 ? b.gap - a.gap : 0)
      || (a.t === 2 ? b.min - a.min : 0)
      || a.day.localeCompare(b.day)
      || a.i - b.i)
    .map((x) => x.r);

  for (const s of toPlace) {
    const home = lostOf.get(s.id)!;
    // 4. The first day that fits (`daysThatFit`: the two-session cap, the p80 gap, closed days), then closest with room.
    let to: string | undefined = daysThatFit({ session: { ...s, date: home }, fromDate: home, toDate: home, rows: current(), daysOff: args.daysOff, today, max: 7 })
      .filter((d) => !lostDays.has(d))[0];
    if (!to) to = week.filter(open).filter((d) => countOn(d, s.id) < MAX_SESSIONS_A_DAY).sort(byNearness(home))[0];
    pending.delete(s.id);
    // 6. No room left: it comes off. Nothing that was never on a lost day moves or comes off for it.
    if (!to) { dropped.add(s.id); continue; }
    at.set(s.id, to);
  }
  // 4a. The warm-up follows its session, wherever that went — and comes off with it.
  for (const r of pool) {
    if (!rideAlong(r) || moves[r.id]) continue;
    const partner = partnerOf(r)!;
    pending.delete(r.id);
    if (dropped.has(partner.id)) dropped.add(r.id);
    else at.set(r.id, at.get(partner.id) ?? lostOf.get(r.id)!);
  }

  // The notes, read against the finished week so a later placement's session counts for an earlier one.
  const final = current();
  const sessions: LostDaySession[] = args.rows
    .filter((r) => inWeek(iso(r.date)) && (status(r) !== 'skipped' || lostOf.has(r.id)))
    .map((r) => {
      const from = iso(r.date);
      const off = dropped.has(r.id);
      const to = off ? from : at.get(r.id) ?? from;
      const wasOff = status(r) === 'skipped';
      const notes = off || (to === from && !wasOff) ? [] : checkMove({ session: r, toDate: to, rows: final, daysOff: args.daysOff }).notes.map((n) => n.text);
      return {
        id: r.id, name: r.name ?? null, type: r.type ?? null, from, to, movable: isPlanned(r) || lostOf.has(r.id),
        dropped: off, notes, lost_day: lostOf.get(r.id) ?? null, was_dropped: wasOff,
      };
    })
    .sort((a, b) => a.to.localeCompare(b.to));
  return { lostDate: lost, week, sessions };
}
