// ============================================================================
// A DAY THE ATHLETE CANNOT TRAIN IS A PIN, AND THE SOLVER JUGGLES BEFORE IT WARNS.
//
// Michael's ruling, 2026-08-25, on the device finding *"Fri marked can't-train → hard run still
// placed on Fri, a lifting day still on Fri"*:
//
//   1. **Endurance never lands on an unavailable day.** It is movable by definition — `compose.ts`
//      steps it off, the same freedom `endurancePins` already gives it.
//   2. **The lifting frame has seven rotations, and the chooser tries them.** `chooseDayMap` scores
//      the rotations to land the frame's empty day on the blocked one. Lifting sits on a day off
//      ONLY when no rotation honours every pin at once.
//   3. **And then it says why** — naming the pins that collided, not asserting the order is the
//      reason. The old line ("the lifting order is fixed, so it stays") was true about the order and
//      false as an explanation, because nothing had tried the other six rotations.
//
// ⛔⛔ AND THE SAME AFTERNOON, PART TWO — SUPERSEDING THE MORNING ON ONE POINT:
//
//   4. **A blocked day always wins.** *"If a day is both tapped for a session and marked can't-train,
//      the session is rescheduled off it — the engine re-solves that session as unpinned, and the
//      note says what moved and why."* The morning ruling kept the tapped session there and called
//      it the athlete's contradiction; it does not any more. A pin still outranks the ROTATION for
//      which free day it gets, which is why the pinned slots relocate in a pre-pass.
//   5. **And the rearranged week still builds.** If it is not sound training the tiered notes carry
//      it — clearances, thin recovery, an overloaded day. Warn, never block.
//
// ⚠️ THE BUG-CASE FIXTURE STAYS PERMANENTLY (`the 2026-08-25 device case`). It is the exact shape
// off the screenshot — Saturday long ride, Friday blocked — and it is the regression this file
// exists to hold down.
//
// Run: deno test --no-check --allow-read supabase/functions/_shared/standing-plan/
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildStandingPlanRow,
  chooseDayMap,
  composeBlock,
  defaultCompetitionLifts,
  frameFixedDaysFor,
  weekdayForFrameDay,
  type PlanSession,
} from './index.ts';

const BASELINES = {
  learned_fitness: {
    run_threshold_pace_sec_per_km: { value: 261, confidence: 'high', sample_count: 10 },
    run_easy_pace_sec_per_km: { value: 340, confidence: 'high', sample_count: 20 },
  },
  performance_numbers: {},
};
const COMPOSE = {
  frame: 'strength_5k' as const,
  competitionLifts: defaultCompetitionLifts(),
  seed1RMs: { bench: 200, squat: 265, deadlift: 340, overheadPress: 125 },
  baselines: BASELINES,
  equipment: ['Commercial gym'],
  roundTo: 5,
};

/** Every weekday that carries any session in the composed week. */
const daysWith = (sessions: PlanSession[], pred: (s: PlanSession) => boolean): string[] =>
  [...new Set(sessions.filter(pred).map((s) => s.day))];

const isEndurance = (s: PlanSession) => s.type === 'run' || s.type === 'ride' || s.type === 'swim';

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 — THE ROTATION HONOURS THE DAY OFF
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('a blocked day is cleared of lifting by rotating the frame, with nothing to report', () => {
  /**
   * ⛔ THE FRAME HAS ONE GENUINELY EMPTY DAY (day 7) plus a plyo-only day 3 and an endurance-only
   * day 6 — so with nothing else pinned there is always a rotation that keeps all four lifting days
   * off any single blocked weekday. Before this pass the chooser never looked.
   */
  const map = chooseDayMap('strength_5k', { unavailableDays: ['friday'] });
  assert(map.honoured.unavailableDays, 'the rotation did not clear the day the athlete blocked');
  assertEquals(map.compromises.length, 0, 'a day off that WAS honoured still reported a cost');

  const lifting = frameFixedDaysFor('strength_5k').lifting
    .map((d) => weekdayForFrameDay(d, map.offset));
  assert(!lifting.includes('Friday'), `a lifting day still landed on Friday: ${lifting.join(', ')}`);

  // ⛔ AND THROUGH THE ROW BUILDER, not only the chooser — the wire is the part that breaks.
  const row = buildStandingPlanRow({
    compose: { ...COMPOSE, unavailableDays: ['friday'] },
    weeks: 2,
    taperWeeks: [],
    dayMap: map,
  });
  const wk = row.sessions_by_week['2'] ?? [];
  assert(wk.length > 0, 'the block built no week 2 at all');
  assertEquals(
    daysWith(wk, (s) => s.type === 'strength').includes('Friday'),
    false,
    'the built block put a lifting session on the day the athlete blocked',
  );
});

Deno.test('every single blocked weekday is reachable by some rotation when nothing else is pinned', () => {
  // ⚠️ ALL SEVEN, not the one that happened to work. A chooser that only cleared Sunday would pass a
  // single-day test and be useless to an athlete whose day off is a Tuesday.
  for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    const map = chooseDayMap('strength_5k', { unavailableDays: [day] });
    assert(map.honoured.unavailableDays, `no rotation cleared ${day} of lifting`);
    assertEquals(map.compromises.length, 0, `${day}: an honoured day off reported a cost`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 — ENDURANCE NEVER LANDS ON A BLOCKED DAY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('no endurance session lands on a day the athlete cannot train', () => {
  /**
   * ⛔ THE ROTATION IS FORCED WRONG ON PURPOSE. `dayOffset: 0` is the Monday-start week, which puts
   * the frame's long day (day 6) on Saturday and its endurance-only days across the week — and
   * Wednesday then carries frame day 3's near-threshold run. The endurance has to step off it by
   * itself; that is the half of the fix the rotation cannot do.
   */
  const wk = composeBlock({
    ...COMPOSE,
    dayOffset: 0,
    unavailableDays: ['wednesday'],
    weeks: 2,
    taperWeeks: [],
  })[1];
  const on = daysWith(wk.sessions, isEndurance);
  assertEquals(
    on.includes('Wednesday'),
    false,
    `endurance landed on the blocked day: ${wk.sessions.filter(isEndurance).map((s) => `${s.day} ${s.name}`).join(' · ')}`,
  );
  // ⚠️ AND IT MOVED RATHER THAN VANISHED. A session quietly dropped would pass the assertion above.
  const base = composeBlock({ ...COMPOSE, dayOffset: 0, weeks: 2, taperWeeks: [] })[1];
  assertEquals(
    wk.sessions.filter(isEndurance).length,
    base.sessions.filter(isEndurance).length,
    'an endurance session was dropped instead of moved off the blocked day',
  );
});

Deno.test('two blocked days spread the displaced sessions rather than piling them on one day', () => {
  /**
   * ⚠️ THE FAILURE THE RELOCATOR EXISTS FOR. Relocating each session in isolation put two of them on
   * the same free day — a legal week, but not the week the frame describes.
   *
   * ⛔ THIS IS NOT IN TENSION WITH THE STACKING RULING (Michael, 2026-08-25 evening), and the title
   * was reworded because it read as if it were. Stacking is about WHICH day a displaced session
   * takes — one already training, ahead of one that is clear. It is not a licence to pile every
   * displaced session onto the same day while other training days sit beside it.
   */
  const wk = composeBlock({
    ...COMPOSE,
    dayOffset: 0,
    unavailableDays: ['wednesday', 'thursday'],
    weeks: 2,
    taperWeeks: [],
  })[1];
  const endurance = wk.sessions.filter(isEndurance);
  for (const s of endurance) {
    assert(
      s.day !== 'Wednesday' && s.day !== 'Thursday',
      `${s.name} stayed on the blocked ${s.day}`,
    );
  }
  const perDay = new Map<string, number>();
  for (const s of endurance) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
  const base = composeBlock({ ...COMPOSE, dayOffset: 0, weeks: 2, taperWeeks: [] })[1];
  const baseMax = Math.max(
    ...[...base.sessions.filter(isEndurance).reduce((m, s) => {
      m.set(s.day, (m.get(s.day) ?? 0) + 1);
      return m;
    }, new Map<string, number>()).values()],
  );
  assert(
    Math.max(...perDay.values()) <= Math.max(baseMax, 2),
    `the displaced sessions stacked: ${[...perDay].map(([d, n]) => `${d}×${n}`).join(', ')}`,
  );
});

Deno.test('⛔⛔ A BLOCKED DAY BEATS A TAPPED DAY — the pinned session is moved, and the note says so', () => {
  /**
   * ⛔ MICHAEL, 2026-08-25 (afternoon), SUPERSEDING THE MORNING RULING THIS TEST USED TO ASSERT:
   * *"A blocked day always wins. If a day is both tapped for a session and marked can't-train, the
   * session is rescheduled off it — the engine re-solves that session as unpinned, and the note says
   * what moved and why."*
   *
   * The old assertion was the opposite: the long session STAYED on the tapped-and-blocked Friday and
   * the contradiction was left to the athlete.
   */
  const wk = composeBlock({
    ...COMPOSE,
    dayOffset: 0,
    endurancePins: { long: 'Friday' as const },
    unavailableDays: ['friday'],
    weeks: 2,
    taperWeeks: [],
  })[1];
  const long = wk.sessions.find((s) => isEndurance(s) && /long/i.test(s.name));
  assert(long, 'the week has no long session at all');
  assert(long!.day !== 'Friday', 'the tapped session stayed on the day the athlete blocked');

  // ⛔ AND IT IS NOT SILENT. The sentence names the day off, the session and where it went.
  const note = wk.notes.find((n) => /Friday is a day off/.test(n.text));
  assert(note, `no note about the move: ${wk.notes.map((n) => n.text).join(' | ')}`);
  assert(
    new RegExp(`the long session moved to ${long!.day}\\.`).test(note!.text),
    `the note does not name what moved and where: ${note!.text}`,
  );
});

Deno.test('a tapped day the athlete did NOT block is as absolute as it ever was', () => {
  // ⚠️ THE REGRESSION GUARD. Releasing a pin is keyed on the blocked day and nothing else.
  const wk = composeBlock({
    ...COMPOSE,
    dayOffset: 0,
    endurancePins: { long: 'Friday' as const },
    unavailableDays: ['tuesday'],
    weeks: 2,
    taperWeeks: [],
  })[1];
  const long = wk.sessions.find((s) => isEndurance(s) && /long/i.test(s.name));
  assertEquals(long!.day, 'Friday', 'an unblocked pin moved');
  assertEquals(
    wk.notes.filter((n) => /is a day off/.test(n.text)).length,
    0,
    'a week where nothing moved still announced a move',
  );
});

Deno.test('the athlete\'s own day gets the nearest free day, not whatever the rotation left', () => {
  /**
   * ⛔ A PIN STILL OUTRANKS THE ROTATION FOR *WHICH* FREE DAY IT GETS. Run in frame order alone, a
   * rotated session can take the day next to the athlete's blocked one and push theirs further out.
   * The pinned slots go through the relocator in a pre-pass for exactly this.
   */
  const wk = composeBlock({
    ...COMPOSE,
    dayOffset: 0,
    endurancePins: { long: 'Wednesday' as const },
    unavailableDays: ['wednesday'],
    weeks: 2,
    taperWeeks: [],
  })[1];
  const long = wk.sessions.find((s) => isEndurance(s) && /long/i.test(s.name))!;
  // ⚠️ NEAREST, FORWARD FIRST — Thursday is one day out and unblocked, so nothing may outbid it.
  assertEquals(long.day, 'Thursday', 'the athlete\'s own session did not get the nearest free day');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 — THE GENUINELY UNSOLVABLE CASE STILL BUILDS, AND SAYS WHY
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ the 2026-08-25 device case: the Friday off wins, and the long ride still gets Saturday', () => {
  /**
   * ⛔ THE SCREENSHOT, AS A FIXTURE — AND ITS ANSWER CHANGED THE SAME EVENING. Michael:
   * *"blocked days stay untouchable."*
   *
   * The morning version of this test asserted the opposite: a long ride pinned to Saturday forces
   * the rotation to offset 0, at offset 0 frame day 5 (DE: Lower) lands on Friday, and the lifting
   * day the athlete saw was called unavoidable. It was only unavoidable while the ROTATION was the
   * thing serving the long pin — and it is not. `compose.ts` `endurancePins` puts the long session
   * on Saturday whichever way the frame is turned, so giving the rotation up costs the pin nothing
   * and buys the day off.
   *
   * ⚠️ SO BOTH ANSWERS ARE HONOURED AND THERE IS NOTHING TO REPORT. A note about a competing pin
   * would now be describing a fight that does not happen.
   */
  const map = chooseDayMap('strength_5k', {
    longRideDay: 'Saturday',
    longSlotSport: 'ride',
    unavailableDays: ['friday'],
  });
  assert(map.honoured.unavailableDays, 'a lifting day still landed on the blocked Friday');
  assertEquals(
    map.compromises.length,
    0,
    `a week that honoured everything still reported a cost: ${map.compromises.map((c) => c.text).join(' | ')}`,
  );

  const row = buildStandingPlanRow({
    compose: { ...COMPOSE, unavailableDays: ['friday'], endurancePins: { long: 'Saturday' as const } },
    weeks: 2,
    taperWeeks: [],
    dayMap: map,
  });
  const wk = row.sessions_by_week['2'] ?? [];
  assert(wk.length > 0, 'the week refused to build');
  // ⛔ FRIDAY IS EMPTY — not "clear of lifting", empty. Nothing at all lands on a day off.
  assertEquals(
    wk.filter((s) => s.day === 'Friday').length,
    0,
    `Friday carried sessions: ${wk.filter((s) => s.day === 'Friday').map((x) => x.name).join(', ')}`,
  );
  // ⛔ AND THE ATHLETE'S SATURDAY SURVIVED IT — the pin was not traded away, only the rotation was.
  const long = wk.find((s) => isEndurance(s) && /long/i.test(s.name));
  assert(long, 'the week has no long session at all');
  assertEquals(long!.day, 'Saturday', 'the long ride lost its day to the rotation change');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 — STACKING IS THE RELEASE VALVE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('⛔⛔ THE THREE-CLUB WEEK (Michael\'s device test, 2026-08-25 evening)', () => {
  /**
   * ⛔ THE TIGHTEST WEEK THE BUILDER CAN BE ASKED FOR, AND THE ONE THAT NAMED THE RULING. Three club
   * sessions the world has already fixed — a Saturday long ride, a Tuesday hard ride, a Thursday
   * hard run — plus a Friday the athlete cannot train. Four lifting days have to fit around all of
   * it. Michael: *"stacking is the release valve — lifts may share a day with club or other
   * endurance sessions to make the schedule work."*
   *
   * The three things this asserts are exactly the three he named: **all three clubs honoured**,
   * **Friday empty**, **lifts stacked onto club days as needed**.
   */
  const CLUBS = {
    longRideDay: 'Saturday',
    longSlotSport: 'ride' as const,
    hardDays: ['Tuesday', 'Thursday'],
    unavailableDays: ['friday'],
  };
  const map = chooseDayMap('strength_5k', CLUBS);
  const row = buildStandingPlanRow({
    compose: {
      ...COMPOSE,
      unavailableDays: ['friday'],
      endurancePins: { long: 'Saturday' as const, hard: ['Tuesday' as const, 'Thursday' as const] },
    },
    weeks: 2,
    taperWeeks: [],
    dayMap: map,
  });
  const wk = row.sessions_by_week['2'] ?? [];
  assert(wk.length > 0, 'the tightest week refused to build');

  // 1 ── ALL THREE CLUBS ON THEIR OWN DAYS. The world set these; nothing may move them.
  const long = wk.find((s) => isEndurance(s) && /long/i.test(s.name));
  assert(long, 'the week has no long session');
  assertEquals(long!.day, 'Saturday', 'the club long ride lost its day');
  const hard = wk.filter((s) => isEndurance(s) && /interval|threshold|hill|vo2|repeat|hard|mlss|nt/i.test(s.name));
  const hardDays = [...new Set(hard.map((s) => s.day))];
  assert(hardDays.includes('Tuesday'), `no hard session on the Tuesday club day: ${hardDays.join(', ')}`);
  assert(hardDays.includes('Thursday'), `no hard session on the Thursday club day: ${hardDays.join(', ')}`);

  // 2 ── FRIDAY IS EMPTY. Not "clear of lifting" — empty. A blocked day is untouchable.
  assertEquals(
    wk.filter((s) => s.day === 'Friday').length,
    0,
    `Friday carried sessions: ${wk.filter((s) => s.day === 'Friday').map((x) => x.name).join(', ')}`,
  );
  assert(map.honoured.unavailableDays, 'the rotation put lifting on the blocked Friday');
  assertEquals(map.compromises.length, 0, `the week reported a cost it did not pay: ${
    map.compromises.map((c) => c.text).join(' | ')}`);

  /**
   * 3 ── THE LIFTS STACK ONTO A CLUB DAY. This is the release valve doing its job: without it the
   * four lifting days spread across the week's clear days and there is no day off left.
   *
   * ⚠️ THE PLYO BLOCK IS EXCLUDED, and that is not pedantry — it shares `type: 'strength'` with the
   * barbell days, so counting it would let this pass on a week where a drill block happened to sit
   * beside a club run and no actual lifting stacked at all.
   */
  const liftDays = new Set(
    wk.filter((s) => s.type === 'strength' && !(s.tags ?? []).includes('plyo')).map((s) => s.day),
  );
  const clubDays = ['Saturday', 'Tuesday', 'Thursday'];
  const stackedOnto = clubDays.filter((d) => liftDays.has(d));
  assert(
    stackedOnto.length > 0,
    `no lifting day shares a day with a club session: lifts on ${[...liftDays].join(', ')}`,
  );

  // ⛔ AND THE WEEK STILL HAS A DAY OFF BEYOND THE BLOCKED ONE — the whole point of stacking.
  const active = new Set(wk.map((s) => s.day));
  assert(active.size <= 6, `every day carries a session: ${[...active].join(', ')}`);
});

Deno.test('⛔ the ROTATION stacks too — a lift is turned onto the athlete\'s own pinned day', () => {
  /**
   * ⛔ THE OTHER HALF OF THE RULING: *"When relocating a session **or choosing the rotation**, prefer
   * landing on a day that already has training."* It is the last tie-break in `chooseDayMap`, so it
   * only speaks when the blocked days, the long pin and the hard pins have all tied — which is
   * exactly the "release valve on a tight week" shape Michael described.
   *
   * ⚠️ THIS SHAPE WAS FOUND BY SEARCH, NOT GUESSED, and that matters: the tie-break shipped with no
   * fixture reaching it at all (mutation testing showed deleting it broke nothing), because in every
   * week written by hand a higher term had already decided. A hard session pinned to WEDNESDAY is
   * one of the cases where it decides:
   *
   *   · offset 0 — the frame's plyo-only day 3 lands on Wednesday. The pin is honoured and the
   *     athlete's day carries a drill block and their hard session. No lifting stacks.
   *   · offset 2 — the frame's day 1 (ME: Upper) lands on Wednesday instead. The pin is honoured
   *     just the same, and a LIFTING day now shares the day the athlete had already given up.
   *
   * Both score identically on every term above; offset 0 wins ties by being first. The stacking
   * term is the only thing that picks the second, and the second is the one that leaves a clear day
   * elsewhere in the week.
   */
  const map = chooseDayMap('strength_5k', { hardDays: ['Wednesday'] });
  assertEquals(map.honoured.hardDays, 1, 'the hard pin was not honoured at all');

  const liftsOnWed = frameFixedDaysFor('strength_5k').lifting
    .filter((d) => weekdayForFrameDay(d, map.offset) === 'Wednesday');
  assert(
    liftsOnWed.length > 0,
    `no lifting day was turned onto the pinned Wednesday (offset ${map.offset}) — the rotation `
    + 'spread across clear days instead',
  );
});

Deno.test('⛔ a relocated session takes a training day even when a CLEAR day is nearer', () => {
  /**
   * ⛔ THE RELOCATOR'S HALF OF THE RULING, ON THE ONE SHAPE THAT CAN TELL THE TWO RULES APART.
   * *"Prefer landing on a day that already has training over eating the rest day."*
   *
   * ⚠️ AND THE FIRST VERSION OF THIS TEST COULD NOT TELL THEM APART — it blocked Wednesday, whose
   * two neighbours are both lifting days, so "nearest" and "nearest that is training" were the same
   * answer and the assertion passed with the preference deleted. Found by mutation testing; the
   * lesson is that a fixture for a PREFERENCE has to be built on a case where the alternatives
   * actually differ.
   *
   * ⛔ SATURDAY IS THAT SHAPE. At offset zero Saturday carries the frame's long day, its nearest
   * neighbour forward is SUNDAY — the frame's rest day, clear — and its nearest neighbour back is
   * FRIDAY, which is DE: Lower. The old rule walked forward first and ate the rest day. The ruling
   * says take Friday and stack.
   */
  const wk = composeBlock({
    ...COMPOSE, dayOffset: 0, unavailableDays: ['saturday'], weeks: 2, taperWeeks: [],
  })[1];
  const long = wk.sessions.find((s) => isEndurance(s) && /long/i.test(s.name));
  assert(long, 'the week has no long session at all');
  assertEquals(
    long!.day,
    'Friday',
    `the displaced long session went to ${long!.day} — Sunday means it ate the rest day`,
  );
  // ⛔ AND THE REST DAY SURVIVED, which is the whole reason the preference exists.
  assertEquals(
    wk.sessions.filter((s) => s.day === 'Sunday').length,
    0,
    'the rest day was spent even though a training day was available',
  );
});

Deno.test('four days off cannot all be clear of four lifting days, and the note says so plainly', () => {
  // ⛔ THE ARITHMETIC CASE — no competing pin, just more blocked days than the week has room for.
  const blocked = ['monday', 'tuesday', 'wednesday', 'thursday'];
  const map = chooseDayMap('strength_5k', { unavailableDays: blocked });
  assertEquals(map.honoured.unavailableDays, false);

  const note = map.compromises.find((c) => /carr(?:ies|y) lifting day|carries a lifting day/.test(c.text));
  assert(note, `no note fired: ${map.compromises.map((c) => c.text).join(' | ')}`);
  // ⚠️ THE COUNT NOW CARRIES THE DRILL DAY TOO (2026-08-25, after the fuzz sweep). The plyo day is
  // frame-fixed and can land on a day off just as a lifting day can; the sentence used to leave it
  // out of the arithmetic it was quoting.
  assert(
    /4 lifting days and a drill day in a fixed order/i.test(note!.text),
    `the note does not state the count it turns on: ${note!.text}`,
  );
  // ⚠️ NO COMPETING PIN TO NAME, so it must not invent one.
  assert(!/pinned to/i.test(note!.text), `the note named a pin that does not exist: ${note!.text}`);

  const row = buildStandingPlanRow({
    compose: { ...COMPOSE, unavailableDays: blocked },
    weeks: 2,
    taperWeeks: [],
    dayMap: map,
  });
  assert((row.sessions_by_week['2'] ?? []).length > 0, 'the block refused to build');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 — ABSENT IS THE OLD WEEK, BYTE FOR BYTE
// ════════════════════════════════════════════════════════════════════════════════════════════════

Deno.test('no blocked days is the week this engine built before the field existed', () => {
  const shapeOf = (sessions: PlanSession[]) =>
    sessions.map((s) => `${s.day}|${s.type}|${s.name}`).sort().join('\n');
  const before = composeBlock({ ...COMPOSE, dayOffset: 2, weeks: 3, taperWeeks: [] });
  for (const empty of [undefined, [] as string[]]) {
    const after = composeBlock({
      ...COMPOSE, dayOffset: 2, unavailableDays: empty, weeks: 3, taperWeeks: [],
    });
    for (let i = 0; i < before.length; i++) {
      assertEquals(
        shapeOf(after[i].sessions),
        shapeOf(before[i].sessions),
        `week ${i + 1} changed with unavailableDays = ${JSON.stringify(empty)}`,
      );
    }
  }
  // ⚠️ AND THE ROTATION IS UNCHANGED TOO — the new score term must be inert on an empty set.
  assertEquals(chooseDayMap('strength_5k', { longRunDay: 'Sunday' }).offset,
    chooseDayMap('strength_5k', { longRunDay: 'Sunday', unavailableDays: [] }).offset);
});

Deno.test('the block row carries the blocked days, so a restate re-composes the same week', () => {
  /**
   * ⛔ THE RESTATE CONTRACT. `restateFromTest` matches a composed session to a calendar row on week +
   * WEEKDAY + movement. A re-composition that did not know which days were blocked would put the
   * endurance back on its frame day, match nothing, and report the whole block as unmatched — the
   * silent no-op `rematerialize-standing-block` warns about for `day_offset` and `sport_mix`.
   */
  const row = buildStandingPlanRow({
    compose: { ...COMPOSE, unavailableDays: ['friday', 'sunday'] },
    weeks: 2,
    taperWeeks: [],
  });
  assertEquals(row.config.unavailable_days, ['friday', 'sunday']);

  const plain = buildStandingPlanRow({ compose: COMPOSE, weeks: 2, taperWeeks: [] });
  assertEquals(plain.config.unavailable_days, [], 'a block with no days off stored something');
});
