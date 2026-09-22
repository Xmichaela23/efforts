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

  /** Where every row sits as the placement runs, and which rows come off this week. */
  const at = new Map<string, string>(args.rows.map((r) => [r.id, iso(r.date)]));
  const dropped = new Set<string>();
  const current = (): MoveRow[] => args.rows.map((r) => ({
    ...r, date: at.get(r.id) ?? iso(r.date), ...(dropped.has(r.id) ? { workout_status: 'skipped' } : {}),
  }));
  const countOn = (d: string, except: string) => sessionsOn(current(), d, except);

  // 2. The athlete's drags, first and as given.
  const moves = args.moves ?? {};
  for (const r of args.rows) {
    const to = moves[r.id];
    if (to && isPlanned(r) && inWeek(iso(r.date))) at.set(r.id, iso(to));
  }

  // 4a. A warm-up's session: the lost day's session that was planned on the warm-up's own day (a session moved in
  // from another day is not the one it warms up), else the day's first other planned session.
  const lostDay = args.rows.filter((r) => iso(r.date) === lost && isPlanned(r));
  const partnerOf = (w: MoveRow): MoveRow | null =>
    lostDay.find((r) => !isPlyo(r) && planDateOf(r) === planDateOf(w)) ?? lostDay.find((r) => !isPlyo(r)) ?? null;
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
  /** A lift's widest p80 gap around the lost day — the lift most at risk of passing nine days picks first. */
  const liftGapAtLost = (r: MoveRow) => {
    const g = liftGaps(r, lost, current());
    return Math.max(g.before ?? 0, g.after ?? 0);
  };

  const downs = downDates(args.rows);
  const open = (d: string) => d !== lost && d >= today && !isOff(d) && !downs.has(d);
  const byNearness = (a: string, b: string) => Math.abs(daysBetween(lost, a)) - Math.abs(daysBetween(lost, b)) || a.localeCompare(b);

  // 3. The lost day's planned sessions not already dragged, in picking order.
  const tier = (r: MoveRow) => (isRealLift(r) ? 0 : isFloor(r) ? 1 : 2);
  const toPlace = args.rows
    .filter((r) => iso(r.date) === lost && isPlanned(r) && !moves[r.id] && !rideAlong(r))
    .map((r, i) => ({ r, i, t: tier(r), gap: isRealLift(r) ? liftGapAtLost(r) : 0, min: Number(r.duration ?? 0) || 0 }))
    .sort((a, b) => a.t - b.t
      || (a.t === 0 ? b.gap - a.gap : 0)
      || (a.t === 2 ? b.min - a.min : 0)
      || a.i - b.i)
    .map((x) => x.r);

  for (const s of toPlace) {
    // 4. The first day that fits (`daysThatFit` owns the two-session cap, the p80 gap and closed "Down" days).
    let to: string | undefined = daysThatFit({ session: s, fromDate: lost, toDate: lost, rows: current(), daysOff: args.daysOff, today, max: 7 })[0];
    // 5. The closest open day with room left.
    if (!to) to = week.filter(open).filter((d) => countOn(d, s.id) < MAX_SESSIONS_A_DAY).sort(byNearness)[0];
    // 6. No room left: it comes off. Nothing already on another day moves or comes off for it.
    if (!to) { dropped.add(s.id); continue; }
    at.set(s.id, to);
  }
  // 4a. The warm-up follows its session, wherever that went — and comes off with it.
  for (const r of lostDay) {
    if (!rideAlong(r) || moves[r.id]) continue;
    const partner = partnerOf(r)!;
    if (dropped.has(partner.id)) dropped.add(r.id);
    else at.set(r.id, at.get(partner.id) ?? lost);
  }

  // The notes, read against the finished week so a later placement's session counts for an earlier one.
  const final = current();
  const sessions: LostDaySession[] = args.rows
    .filter((r) => inWeek(iso(r.date)) && status(r) !== 'skipped')
    .map((r) => {
      const from = iso(r.date), to = at.get(r.id) ?? from;
      // A warm-up carries no note of its own (`checkMove` does not count it); its session's note covers the day.
      const off = dropped.has(r.id);
      const notes = off || to === from ? [] : checkMove({ session: r, toDate: to, rows: final, daysOff: args.daysOff }).notes.map((n) => n.text);
      return { id: r.id, name: r.name ?? null, type: r.type ?? null, from, to: off ? from : to, movable: isPlanned(r), dropped: off, notes };
    })
    .sort((a, b) => a.to.localeCompare(b.to));
  return { lostDate: lost, week, sessions };
}
