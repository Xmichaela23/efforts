// =============================================================================
// assign-days-solver — the run week's day placement, taken by `_shared/week-solver.ts`
// =============================================================================
//
// ⛔ THIS IS THE §7 COLLAPSE FOR THE RUN GENERATORS, and `assign-days.ts` predicted it in its own
// header: *"`_shared/week-solver.ts` is built and has already taken the strength path … It has not
// taken the run generators, and taking them is the §7 collapse, not this change. … When the solver
// takes these callers, this goes with them."* This is that.
//
// ⚠️ `assign-days.ts` IS DELIBERATELY STILL HERE AND STILL WORKS. Nothing imports it from the
// generator path any more, but it is the reference implementation this was diffed against and the
// thing to fall back to if a device test says the new shape is wrong. Retiring it is its own slice.
//
// ── WHAT MOVED AND WHAT DID NOT ──────────────────────────────────────────────────────────────────
//
// MOVED: which weekday each run lands on.
// NOT MOVED: anything about the training itself — weekly mileage, the long-run arc, the taper, the
// marathon prerequisite, and the race-week day assignment (`sustainable.generateRaceWeekSessions`
// hands sessions in ALREADY CARRYING A DAY, and those are treated as immovable here exactly as they
// were before). The race-day fix in `95f38bf3` lives in that path and this file must not touch it.
//
// ── PRIORITY-FIRST, AND FOR THE RUN PLAN THE RUNS ARE THE PRIORITY ──────────────────────────────
//
// ⚠️ THAT ORDERING IS ALREADY THE ARCHITECTURE, not something this file had to impose. Strength
// never reaches this function: `generate-run-plan/index.ts` runs the generator (which places runs)
// and only then calls `overlayStrengthLegacy`, which fits lifts around the finished run week via
// `simplePlacementPolicy`. So runs genuinely get first pick of the week and the lifts take what is
// left — which is the design decision for run plans, and it needs no `lifts` argument here at all.
// ⛔ Get Stronger is the mirror image (lift-priority, no flexible runs) and is NOT touched by this
// file — it calls `solve()` directly from `strength-primary-plan.ts` and passes no `flexible`.

import type { Session } from '../types.ts';
import {
  type Anchor,
  type FlexibleSession,
  solve,
  SOLVER_DAYS,
  type SolverDay,
} from '../../_shared/week-solver.ts';
import { type PlacementPins, toWeekDay, WEEK_ORDER, type WeekDay } from './assign-days.ts';
import {
  SAME_DAY_COMPATIBLE,
  type MatrixSessionKind,
} from '../../_shared/schedule-session-constraints.ts';

/** Solver days are lowercase; the run plan's `Session.day` is Title case. One conversion, at the edge. */
const toSolverDay = (d: WeekDay): SolverDay => d.toLowerCase() as SolverDay;
const toWeekDayName = (d: SolverDay): WeekDay =>
  (d.charAt(0).toUpperCase() + d.slice(1)) as WeekDay;

const HARD_TAGS = ['hard_run', 'intervals', 'tempo', 'threshold'];
const isHard = (s: Session): boolean => s.tags.some((t) => HARD_TAGS.includes(t));
const isLongRun = (s: Session): boolean => s.tags.includes('long_run');

/**
 * ⛔ THE DAY BEFORE THE LONG RUN, AND IT IS AN OWNED PREFERENCE — NOT THE LAW.
 *
 * `assign-days.dayBeforeLongRun` holds it as a rest day, and its comment carries the reason the
 * original hardcoded Saturday gave: *"prep for Sunday long run"* — fresh legs for the week's key
 * session. That is a real methodology rule with a named owner, so it survives the move.
 *
 * ⚠️ BUT IT IS SCORED, NEVER A WALL — same as it was. `assign-days` released this day the moment the
 * week needed it (`needsEveryDay`), and a hard filter here would refuse six-run weeks that the old
 * code placed fine. It is handed to the solver as a discouraged day, ranked below spread.
 *
 * ⚠️ AND IT PULLS AGAINST THE LAW'S OWN RULE, WHICH IS WHY BOTH ARE PASSED. The shared rule list
 * says *"After long_run → next day: prefer easy_swim or rest — not easy_run"* — that is the day
 * AFTER. This file's inherited rule protects the day BEFORE. They are different days and both are
 * legitimate; the solver is given both and spread decides when it cannot honour the pair.
 */
function dayBeforeLongRun(longRun: WeekDay): WeekDay {
  const i = WEEK_ORDER.indexOf(longRun);
  return WEEK_ORDER[(i + WEEK_ORDER.length - 1) % WEEK_ORDER.length];
}

/**
 * Place a week's run sessions onto days via the shared solver.
 *
 * Signature-compatible with `assignDays` so the swap at `base-generator.assignDaysToSessions` is one
 * line, and so the two can be run side by side on the same input (see `assign-days-parity.test.ts`).
 *
 * ⛔ NO SESSION IS EVER DROPPED. That guarantee is older than the solver and outranks it: if the
 * solver refuses (an over-constrained week), this falls back to placing the remaining sessions on
 * whatever days are open rather than returning fewer sessions than it was handed. A refusal is the
 * right answer for an athlete-facing intake; it is the wrong answer for a week that is already
 * generated and must be rendered.
 */
export function assignDaysViaSolver(sessions: Session[], pins?: PlacementPins | null): Session[] {
  const longRunDay = toWeekDay(pins?.long_run) ?? 'Sunday';
  const pinnedQuality = toWeekDay(pins?.quality_run);
  const pinnedEasy = toWeekDay(pins?.easy_run);
  const trainingDays = Array.isArray(pins?.training_days) && pins!.training_days!.length > 0
    ? new Set(pins!.training_days!.map(toWeekDay).filter((d): d is WeekDay => !!d))
    : null;

  /**
   * ⛔ THE PIN OUTRANKS A HARDCODED DAY, AND WITHOUT THIS IT DID NOT (2026-08-08).
   *
   * §0a #1: a user-pinned anchor is immovable and outranks everything below it. A day written by a
   * session FACTORY is not a pin — it is the engine's own default wearing the same clothes, and pass
   * 1 below cannot tell them apart: both arrive as `s.day`.
   *
   * ⚠️ THIS WAS LATENT UNTIL THE LONG RUN STARTED HONOURING ITS PIN. While `createSimpleLongRun`
   * nailed Sunday, nothing else could want that day. The moment the athlete's answer reached the
   * long run, an athlete who runs long on the day a factory had already claimed got BOTH sessions
   * stacked on it — and `long_run × quality_run` is a **0** in the same-day matrix, so the adapter
   * was emitting a week the law forbids. It did it silently, because forcing the long run onto its
   * day happens after the solver has returned and nothing re-checks it.
   *
   * ⛔ THE COLLIDER IS RELEASED, NOT THE PIN — and it is released rather than dropped: it re-enters
   * as a flexible session and the solver finds it a legal day. Sessions the law allows to share the
   * day are left exactly where they are, so this fires only on a real conflict.
   *
   * ⚠️ RACE WEEK IS UNTOUCHED AND MUST STAY SO. Both generators return `generateRaceWeekSessions`
   * directly (`sustainable:186`, `performance-build:161`) without passing through this function, so
   * nothing here can move a shakeout or a race day. The `race_day` guard is belt-and-braces for any
   * future caller that does route a race week through the placer.
   */
  const flexibleLongRun = sessions.find((s) => isLongRun(s) && !s.day);
  if (flexibleLongRun) {
    for (const s of sessions) {
      if (!s.day || s === flexibleLongRun) continue;
      if (s.tags.includes('race_day')) continue;
      if (toWeekDay(s.day) !== longRunDay) continue;
      const kind: MatrixSessionKind = isHard(s) ? 'quality_run' : 'easy_run';
      if (SAME_DAY_COMPATIBLE['long_run']?.[kind] === true) continue;
      s.day = '';   // back into the pool; the solver will seat it legally
    }
  }

  // ── Pass 1: sessions that already carry a day keep it. Race week lives here. ──────────────────
  const out: Session[] = [];
  const usedDays = new Set<string>();
  for (const s of sessions) {
    if (s.day) {
      usedDays.add(s.day);
      out.push(s);
    }
  }
  const remaining = sessions.filter((s) => !out.includes(s));
  if (remaining.length === 0) return out;

  const longRuns = remaining.filter(isLongRun);
  const hardRuns = remaining.filter((s) => !isLongRun(s) && isHard(s));
  const easyRuns = remaining.filter((s) => !isLongRun(s) && !isHard(s));

  // ── Anchors: the immovable facts of the week ─────────────────────────────────────────────────
  // The athlete's long-run pin, their club night when they named one, and any day already spent by
  // a session that arrived with one. §0a #1: a pin is a hard constraint, not a scoring input.
  const anchors: Anchor[] = [];
  const claimed = new Set<WeekDay>();
  const claim = (d: WeekDay) => { claimed.add(d); };

  // ⛔ AN ALREADY-PLACED SESSION KEEPS ITS OWN KIND. Anchoring everything as `easy_run` would tell
  // the law this week has no long run — and `easy_run × easy_run` is ✓ same-day, so it would also
  // stop protecting the long-run day from an easy run landing on top of it.
  for (const s of sessions) {
    if (!s.day) continue;
    const wd = toWeekDay(s.day);
    if (!wd || claimed.has(wd)) continue;
    anchors.push({
      day: toSolverDay(wd),
      kind: isLongRun(s) ? 'long_run' : isHard(s) ? 'quality_run' : 'easy_run',
      label: isLongRun(s) ? 'your long run' : isHard(s) ? 'your hard run' : 'a session already scheduled',
    });
    claim(wd);
  }
  if (longRuns.length > 0 && !claimed.has(longRunDay)) {
    anchors.push({ day: toSolverDay(longRunDay), kind: 'long_run', label: 'your long run' });
    claim(longRunDay);
  }
  if (hardRuns.length > 0 && pinnedQuality && !claimed.has(pinnedQuality)) {
    anchors.push({ day: toSolverDay(pinnedQuality), kind: 'quality_run', label: 'your hard run' });
    claim(pinnedQuality);
  }

  // ── Flexible: everything the athlete did not pin ─────────────────────────────────────────────
  // ⛔ ORDER IS PRIORITY. The solver places one kind group at a time in insertion order, so the hard
  // run picks its day before the easy runs fill in around it — the run week's own priority ladder,
  // and the same shape `assign-days` had (quality placed before easy).
  const flexible: FlexibleSession[] = [];
  const unpinnedHard = pinnedQuality ? hardRuns.slice(1) : hardRuns;
  for (let i = 0; i < unpinnedHard.length; i++) {
    flexible.push({ name: `hard:${i}`, kind: 'quality_run' });
  }
  for (let i = 0; i < easyRuns.length; i++) {
    flexible.push({ name: `easy:${i}`, kind: 'easy_run' });
  }

  /**
   * ⛔ THE LONG RUN MAY ALREADY HAVE ITS DAY, AND READING IT OFF `remaining` MISSES IT.
   *
   * ⚠️ Caught by `base-week-spread.test.ts`, and it silently disabled the rest-day rule on the
   * commonest week in the app. `sustainable.generateWeekSessions` hands the long run — and the
   * fartlek, whose day `createOptionalSpeedwork` fixes — in ALREADY CARRYING a day, so pass 1
   * claims both and `remaining` holds only the plain easy runs. Deriving "is there a long run this
   * week" from `remaining` therefore answered NO on every ordinary build week, and the day-before
   * rest day quietly stopped being protected. The question is about the WEEK, so it is asked of
   * every session in it.
   */
  const weekHasLongRun = sessions.some(isLongRun);
  const preAssignedLongRun = sessions.find((s) => isLongRun(s) && s.day);
  const effectiveLongRunDay = preAssignedLongRun
    ? (toWeekDay(preAssignedLongRun.day) ?? longRunDay)
    : longRunDay;

  const discouraged: SolverDay[] = [];
  const before = dayBeforeLongRun(effectiveLongRunDay);
  if (weekHasLongRun && !claimed.has(before)) discouraged.push(toSolverDay(before));
  // The athlete's declared non-training days are a preference too — `assign-days` spent one rather
  // than lose a session, and so does this.
  if (trainingDays) {
    for (const d of WEEK_ORDER) {
      if (!trainingDays.has(d) && !claimed.has(d)) discouraged.push(toSolverDay(d));
    }
  }

  const result = solve({
    anchors,
    lifts: [],
    flexible,
    ...(flexible.length > 0
      ? {
          flexibleAvoid: {
            days: discouraged,
            owner: 'generate-run-plan (run-week day grid)',
            reason: 'the day before the long run is held for rest, and the athlete\'s non-training days are theirs',
          },
          // The athlete's stated easy day leads when they gave one.
          ...(pinnedEasy && !claimed.has(pinnedEasy)
            ? { flexiblePreferred: { 'easy:0': toSolverDay(pinnedEasy) } }
            : {}),
        }
      : {}),
  });

  // ── Write the solved days back onto the sessions ─────────────────────────────────────────────
  const take = (s: Session, d: WeekDay) => { s.day = d; usedDays.add(d); out.push(s); };

  for (const s of longRuns) take(s, longRunDay);
  if (pinnedQuality && hardRuns.length > 0) take(hardRuns[0], pinnedQuality);

  if (result.status !== 'unsolvable') {
    const byName = new Map(result.week.flexible.map((f) => [f.name, toWeekDayName(f.day)]));
    unpinnedHard.forEach((s, i) => {
      const d = byName.get(`hard:${i}`);
      if (d) take(s, d);
    });
    easyRuns.forEach((s, i) => {
      const d = byName.get(`easy:${i}`);
      if (d) take(s, d);
    });
  }

  // ── The no-drop guarantee, independent of the solver ─────────────────────────────────────────
  // Anything the solver refused or could not seat still gets a day. `assign-days` spent the rest day
  // rather than lose a session and that promise is unchanged.
  const placed = new Set(out);
  const leftovers = remaining.filter((s) => !placed.has(s));
  for (const s of leftovers) {
    const open = WEEK_ORDER.find((d) => !usedDays.has(d));
    if (open) take(s, open);
    else out.push(s);
  }

  return out;
}
