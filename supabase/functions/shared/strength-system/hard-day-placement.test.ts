// THE ENGINE PROPOSES THE HARD DAYS; THE ATHLETE MOVES THEM (§1i placement model, slice 8).
//
// ⛔ WHAT CHANGED. A hard day used to REQUIRE a day — `if (!day) continue` — so an unplaced one was
// silently dropped. That is what forced the screen to make the athlete assemble a hard session from
// parts (sport, then day, then ownership) and produce a "has a discipline but no day" error under
// the Continue button. **Ours to write → ours to place:** a prescribed hard day with no day is now
// the normal case, and the engine places it.
//
// ⛔ AND IT IS THE SAME SOLVE, NOT A SECOND SCORER. The proposal is a FLEXIBLE session in the solve
// that already places the bar — same clearances, same matrix, same law. Two placement authorities
// is the doubled disease this codebase keeps deleting, and the handoff forbids it by name.
//
// ⚠️ IT PRE-WIRES §6 AT NO COST: when the stacking law ships, "where the solver prefers" moves to the
// heavy leg days on its own and an athlete who never touches the defaults gets the better week with
// NO screen change. If these tests start asserting specific weekdays, that property is lost — they
// assert PROPERTIES of the placement, never the calendar answer.
//
// Run: ~/.deno/bin/deno test --allow-all --no-check supabase/functions/shared/strength-system/hard-day-placement.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { composeStrengthPrimaryPlan } from './strength-primary-plan.ts';

const MAXES = { bench: 155, squat: 205, deadlift: 245, overheadPress: 105 };
const NUMBERS = { fiveKPaceSecPerMi: 435, thresholdPaceSecPerMi: 455, ftpWatts: 240 };
const RUN = {
  enduranceSport: 'run', enduranceFrequency: 4, targetWeeklyMiles: 25,
  easyPaceMinPerMile: 9, longRunDay: 'sunday',
};

const build = (cfg: Record<string, unknown>): any =>
  composeStrengthPrimaryPlan({ durationWeeks: 12, oneRepMaxes: MAXES, ...NUMBERS, ...cfg } as never);
const week2 = (p: any): any[] => (p.sessions_by_week['2'] ?? []) as any[];
const hardOf = (p: any) => week2(p).filter((s) => /Hill|Threshold|Intervals|Club/i.test(String(s.name)));
const isLower = (s: any) => s.type === 'strength' && /Back Squat|Deadlift/.test(String(s.name));

// ── THE PROPOSAL HAPPENS AT ALL ──────────────────────────────────────────────────────────────────

Deno.test('⛔ A HARD DAY WITH NO DAY IS PLACED, NOT DROPPED', () => {
  const p = build({ ...RUN, hardDays: [{ discipline: 'run' }] });
  const hard = hardOf(p);
  assertEquals(hard.length, 1, 'the unplaced hard day was dropped, as it was before slice 8');
  assert(!!hard[0].day, 'it was built with no day');
});

Deno.test('two unplaced hard days are both placed, on different days', () => {
  const p = build({ ...RUN, hardDays: [{ discipline: 'run' }, { discipline: 'run' }] });
  const hard = hardOf(p);
  assertEquals(hard.length, 2);
  assertEquals(new Set(hard.map((s) => String(s.day))).size, 2, 'both landed on the same day');
});

Deno.test('⛔ §7 STILL DECIDES WHAT EACH ONE IS — one VO2, one threshold, never two VO2', () => {
  // The role is settled from ownership and ORDER, before anything is placed. Deriving it from the
  // placed day instead made both proposed days fall through to the VO2 default — caught here.
  const p = build({ ...RUN, hardDays: [{ discipline: 'run' }, { discipline: 'run' }] });
  const names = hardOf(p).map((s) => String(s.name));
  assertEquals(names.filter((n) => /Threshold/.test(n)).length, 1, `no threshold session: ${names.join(', ')}`);
  assertEquals(names.filter((n) => /Hill|Intervals/.test(n)).length, 1, `two VO2 sessions: ${names.join(', ')}`);
});

// ── PROPOSED AND PINNED MIX ──────────────────────────────────────────────────────────────────────

Deno.test('⛔ A DAY THE ATHLETE MOVED IS HONOURED, AND THE OTHER IS PLACED AROUND IT', () => {
  const p = build({ ...RUN, hardDays: [{ discipline: 'run', day: 'wednesday' }, { discipline: 'run' }] });
  const hard = hardOf(p);
  assertEquals(hard.length, 2);
  assert(hard.some((s) => String(s.day) === 'Wednesday'), 'the athlete\'s day was moved');
  assert(hard.some((s) => String(s.day) !== 'Wednesday'), 'the proposal landed on the pinned day');
});

Deno.test('a club day keeps its athlete-given day, and the app\'s day is placed around it', () => {
  const p = build({
    ...RUN,
    hardDays: [{ discipline: 'run' }, { discipline: 'run', day: 'thursday', ownership: 'club' }],
  });
  const hard = hardOf(p);
  assertEquals(hard.length, 2);
  const club = hard.find((s) => /Club/.test(String(s.name)))!;
  assertEquals(String(club.day), 'Thursday', 'the club night was moved — only the athlete knows when it meets');
});

Deno.test('⛔ A CLUB DAY WITH NO DAY IS DROPPED — the app does not invent an appointment', () => {
  const p = build({ ...RUN, hardDays: [{ discipline: 'run', ownership: 'club' }] });
  assertEquals(hardOf(p).length, 0, 'the engine placed a club session the athlete never scheduled');
});

// ── ABSENT IS NOT MALFORMED ──────────────────────────────────────────────────────────────────────

Deno.test('⛔ A MALFORMED DAY STILL DROPS THE ENTRY — it is not read as "you choose"', () => {
  // An athlete's mistyped Tuesday silently becoming a Thursday session is the absorption failure
  // this file has fixed twice. Absent means propose; present-but-unusable means drop.
  const p = build({ ...RUN, hardDays: [{ day: 'notaday', discipline: 'run' }] });
  assertEquals(hardOf(p).length, 0);
});

// ── THE PLACEMENT IS LEGAL, AND IT IS THE SOLVER'S ───────────────────────────────────────────────

Deno.test('⛔ A PROPOSED HARD DAY OBEYS THE SAME LAW AS A PINNED ONE', () => {
  // No heavy lower lift on a hard day — the clearance rules are the whole reason the placement runs
  // through the solver rather than through a rule of thumb on the screen.
  for (const hardDays of [
    [{ discipline: 'run' }],
    [{ discipline: 'run' }, { discipline: 'run' }],
    [{ discipline: 'run' }, { discipline: 'bike' }],
  ]) {
    const p = build({ ...RUN, bike: { hours: 4, days: 2, longRideDay: 'saturday' }, hardDays });
    const hardDayNames = new Set(hardOf(p).map((s) => String(s.day)));
    for (const s of week2(p).filter(isLower)) {
      assert(!hardDayNames.has(String(s.day)),
        `${s.name} landed on a proposed hard day (${s.day})`);
    }
    // ⛔ AND THE REST DAY SURVIVES. MAX_ACTIVE_DAYS = 6, proposals included.
    const active = new Set(week2(p).map((s) => String(s.day))).size;
    assert(active <= 6, `${active} active days — the proposal spent the rest day`);
  }
});

Deno.test('the proposal never lands on an anchor the athlete pinned', () => {
  const p = build({ ...RUN, longRunDay: 'sunday', bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ discipline: 'run' }] });
  const day = String(hardOf(p)[0].day);
  assert(day !== 'Sunday', 'the hard run landed on the long run');
  assert(day !== 'Saturday', 'the hard run landed on the long ride');
});

// ── IT COMPOSES WITH §7's GATE ───────────────────────────────────────────────────────────────────

Deno.test('⛔ A SPORT WITH NO NUMBER OFFERS NO PROPOSAL AT ALL', () => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ discipline: 'run' }, { discipline: 'bike' }],
  } as never) as any;
  assertEquals(hardOf(p).length, 0, 'a hard day was proposed for a sport with no number');
  const notes = (p.placement_compromises ?? []).filter((c: any) => /left out/.test(c.text));
  assertEquals(notes.length, 2, 'the gated proposals did not name themselves');
});

Deno.test('the gate is per discipline for proposals too', () => {
  const p = composeStrengthPrimaryPlan({
    durationWeeks: 12, oneRepMaxes: MAXES, ...RUN, fiveKPaceSecPerMi: 435,
    bike: { hours: 4, days: 2, longRideDay: 'saturday' },
    hardDays: [{ discipline: 'run' }, { discipline: 'bike' }],
  } as never) as any;
  const hard = hardOf(p);
  assertEquals(hard.length, 1, 'the ungated run proposal did not survive');
  assertEquals(hard[0].type, 'run');
});

// ── THE VOLUME STILL DOES NOT GROW ───────────────────────────────────────────────────────────────

Deno.test('⛔ A PROPOSED HARD DAY IS INSIDE THE TYPED VOLUME, LIKE A PINNED ONE', () => {
  // The frequency and mileage budgets subtract a hard day by COUNT, which is known before placement.
  // If that ever moved to depend on the placed day, this is what would catch it.
  const asked = 25 * 9;
  for (const hardDays of [[{ discipline: 'run' }], [{ discipline: 'run' }, { discipline: 'run' }]]) {
    const built = week2(build({ ...RUN, hardDays }))
      .filter((s) => s.type === 'run').reduce((n, s) => n + s.duration, 0);
    assert(Math.abs(built - asked) <= 8,
      `${hardDays.length} proposed: asked ${asked} min, built ${built}`);
  }
});

Deno.test('none is still none — the engine proposes nothing it was not asked for', () => {
  const p = build({ ...RUN });
  assertEquals(hardOf(p).length, 0, 'a hard day appeared for an athlete who asked for none');
});
