// ============================================================================
// THE WIZARD'S OWN SOLVE, AGAINST A DAY THE ATHLETE CANNOT TRAIN.
//
// ⛔⛔ THE BUG THIS HOLDS DOWN, AND IT READS AS THE ENGINE IGNORING A DAY OFF (device, 2026-08-25):
// *"Fri marked can't-train → hard run still 'Fri — placed'."*
//
// The mechanism was a loop, and neither half is visible from the screen:
//   1. The wizard PRE-FILLS an untouched hard slot with the engine's own suggestion, writing it into
//      `state.hardDays[i].day`.
//   2. `buildWizardWeek` read every named day back as a PIN — correct for a day the athlete tapped,
//      and wrong for the engine's own proposal.
//   3. `resolve` never moves a pinned unit. So marking that day unavailable could not dislodge it:
//      the solve kept returning Friday, and the pre-fill had nothing better to write.
//
// ⛔⛔ AND THE SAME AFTERNOON MICHAEL SUPERSEDED THE FIX'S SCOPE:
// *"A blocked day always wins. If a day is both tapped for a session and marked can't-train, the
// session is rescheduled off it — the engine re-solves that session as unpinned, and the note says
// what moved and why."* Plus: *"If the arrangement that results isn't sound training, it still
// builds — the existing tiered notes carry the warning."*
//
// So ownership no longer decides who survives a blocked day — nobody does. **`resolve` owns
// releasing the pin, and it owns it alone**: `buildWizardWeek` hands over every named day, including
// one on a blocked day, or `resolveAroundPins` cannot see that anything was released and the move
// goes unreported. `HardSlot.pinned` / `WeekInput.longRunPinned` survive with a narrower job: they
// tell `solveWizardWeek` whether a FILLED field still needs a replacement offered for it.
//
// Run: deno test --no-check --allow-read src/lib/unavailable-days-solve.test.ts
// ⚠️ Needs the repo-root `deno.json` import map for `@shared` — see the note in that file.
// ============================================================================

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWizardWeek, relocationPhrase, solveWizardWeek } from './suggest-hard-days.ts';
import { resolveAroundPins } from '@shared/week-model/resolve.ts';

const RUNNER = {
  runDays: 4,
  rideDays: 2,
  longRunDay: '' as string,
};

Deno.test('the engine never proposes a hard day the athlete said they cannot train', () => {
  for (const blocked of
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
    const out = solveWizardWeek({
      ...RUNNER,
      hardDays: [{ discipline: 'run' }, { discipline: 'bike' }],
      unavailableDays: [blocked],
    });
    for (const d of out.hardDays) {
      assert(d !== blocked, `the solve proposed the blocked ${blocked} for a hard session`);
    }
    assert(out.longRun !== blocked, `the solve proposed the blocked ${blocked} for the long run`);
  }
});

Deno.test('⛔ THE DEVICE CASE: an engine-placed day is released when the athlete blocks it', () => {
  /**
   * ⛔ THE EXACT SEQUENCE OFF THE SCREENSHOT. Round one is the athlete arriving at the step with
   * nothing answered; the wizard writes what comes back into `hardDays[0].day`. Round two is them
   * tapping Friday on the "days you can't train" row — with the day the engine wrote still sitting
   * in state, exactly as the component holds it.
   */
  const first = solveWizardWeek({ ...RUNNER, hardDays: [{ discipline: 'run' }] });
  const engineDay = first.hardDays[0]!;
  assert(engineDay, 'the solve offered no hard day at all — the fixture cannot run');

  const second = solveWizardWeek({
    ...RUNNER,
    // ⚠️ `pinned: false` IS THE WHOLE POINT. This is the wizard saying "this day is mine, not
    // theirs" — the component derives it from `touchedUnits`, which is the only thing that knows.
    hardDays: [{ discipline: 'run', day: engineDay, pinned: false }],
    unavailableDays: [engineDay],
  });
  assert(
    second.hardDays[0] !== engineDay,
    `the engine's own day survived being blocked: ${engineDay}`,
  );
  assert(second.hardDays[0], 'releasing the day left the slot with no answer at all');
});

Deno.test('an engine-placed LONG day is released the same way, and re-proposed', () => {
  const first = solveWizardWeek({ ...RUNNER, hardDays: [{ discipline: 'run' }] });
  const engineLong = first.longRun!;
  assert(engineLong, 'the solve offered no long day — the fixture cannot run');

  const second = solveWizardWeek({
    ...RUNNER,
    longRunDay: engineLong,
    longRunPinned: false,
    hardDays: [{ discipline: 'run' }],
    unavailableDays: [engineLong],
  });
  /**
   * ⚠️ IT MUST RETURN A DAY, NOT NULL. This read `input.longRunDay ? null : …` — "they answered, say
   * nothing" — and the pre-fill writes the ENGINE's answer into that same field, so once it was
   * filled there was no further opinion available and the screen was stuck with the blocked day.
   */
  assert(second.longRun, 'no replacement long day was proposed, so the screen has nothing to write');
  assert(second.longRun !== engineLong, 'the long day stayed on the day the athlete blocked');
});

Deno.test('⛔⛔ A BLOCKED DAY BEATS A DAY THE ATHLETE TAPPED, and the move is reported', () => {
  /**
   * ⛔ MICHAEL, 2026-08-25 (afternoon), SUPERSEDING THE MORNING RULING THIS TEST USED TO ASSERT:
   * *"A blocked day always wins. If a day is both tapped for a session and marked can't-train, the
   * session is rescheduled off it — the engine re-solves that session as unpinned, and the note says
   * what moved and why."*
   *
   * The old assertion was the opposite — the tapped Friday was KEPT and called the athlete's own
   * contradiction to resolve.
   */
  const out = solveWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', pinned: true }],
    unavailableDays: ['friday'],
  });
  assert(out.hardDays[0], 'the slot was left with no day at all');
  assert(out.hardDays[0] !== 'friday', 'the engine kept a session on the day the athlete blocked');

  // ⛔ AND THE SCREEN IS GIVEN BOTH ENDS OF THE SENTENCE, not just "something moved".
  assertEquals(out.relocations.length, 1, 'the move was made silently');
  assertEquals(out.relocations[0].from, 4, 'Friday');
  assertEquals(out.relocations[0].sessionId, 'h0');
  assertEquals(relocationPhrase(out.relocations[0].session), 'the hard run');
});

Deno.test('the hard RIDE is called a ride in the sentence, never "bike"', () => {
  // ⚠️ THE WIZARD'S DISCIPLINE KEY IS `bike` AND EVERY ATHLETE-FACING STRING SAYS RIDE. A raw label
  // in the note would put the engine's vocabulary in front of the athlete.
  const out = solveWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'bike', day: 'friday', pinned: true }],
    unavailableDays: ['friday'],
  });
  assertEquals(out.relocations.length, 1);
  assertEquals(relocationPhrase(out.relocations[0].session), 'the hard ride');
});

Deno.test('a tapped day the athlete did NOT block is untouched, and reports no move', () => {
  // ⚠️ THE REGRESSION GUARD. Releasing a pin is keyed on the blocked day and nothing else.
  const out = solveWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', pinned: true }],
    unavailableDays: ['tuesday'],
  });
  // ⚠️ THE SOLVE ECHOES A NON-CLUB SLOT'S PLACEMENT BACK, AND FOR A HELD PIN THAT IS THE DAY THEY
  // TAPPED — the screen writes the same value it already had, so nothing moves under them.
  assertEquals(out.hardDays[0], 'friday', 'the pinned day was not echoed back');
  assertEquals(out.relocations.length, 0, 'a week where nothing moved reported a move');
  const units = buildWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', pinned: true }],
    unavailableDays: ['tuesday'],
  });
  assertEquals(units.find((u) => u.sessions.some((s) => s.id === 'h0'))?.pinnedDay, 4);
});

Deno.test('a club session is not exempt — a day off means the club is missed, not rescheduled onto', () => {
  /**
   * ⚠️ THE RULING IS UNIFORM AND THIS IS THE CASE THAT TESTS IT. A club day is fixed by the world,
   * but a week the athlete cannot train on that day is a week they miss the club — so the session
   * moves rather than the plan booking them onto a day they already said is gone.
   */
  const units = buildWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', ownership: 'club' }],
    unavailableDays: ['friday'],
  });
  const club = units.find((u) => u.sessions.some((s) => s.id === 'h0'));
  assert(club, 'the club slot vanished from the week');
  // ⚠️ THE UNIT STILL CARRIES THE PIN — releasing it is `resolve`'s job and nobody else's, or the
  // engine cannot see that anything was released and the move goes unreported.
  assertEquals(club!.pinnedDay, 4, 'the athlete\'s answer was dropped before the engine saw it');

  const out = solveWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', ownership: 'club' }],
    unavailableDays: ['friday'],
  });
  assert(out.hardDays[0] && out.hardDays[0] !== 'friday', 'the club day was not replaced');
});

Deno.test('an unblocked club day is still the world\'s, and gets no suggestion', () => {
  const out = solveWizardWeek({
    ...RUNNER,
    hardDays: [{ discipline: 'run', day: 'friday', ownership: 'club' }],
    unavailableDays: ['tuesday'],
  });
  assertEquals(out.hardDays[0], null, 'the engine offered a day for an appointment it cannot know');
});

Deno.test('⛔ the rearranged week still builds when it is not sound training', () => {
  /**
   * ⛔ PART 2 OF THE RULING: *"If the arrangement that results isn't sound training, it still builds
   * — the existing tiered notes carry the warning."* So the week comes back either way and the cost
   * arrives through the health collisions, never as a refusal or an empty answer.
   */
  const out = solveWizardWeek({
    runDays: 4,
    rideDays: 2,
    longRunDay: 'friday',
    hardDays: [{ discipline: 'run', day: 'friday', pinned: true }],
    // ⚠️ FIVE DAYS OFF — the re-solve has two days for the whole week and cannot help but crowd it.
    unavailableDays: ['friday', 'monday', 'tuesday', 'wednesday', 'sunday'],
  });
  assert(out.hardDays[0] !== 'friday', 'the tapped session survived on a blocked day');
  assert(out.longRun !== 'friday', 'the long run survived on a blocked day');
  assert(out.health.collisions.length > 0, 'a crowded week reported no cost at all');
});

Deno.test('⛔⛔ THE THREE-CLUB WEEK — the client model stacks rather than spending the day off', () => {
  /**
   * ⛔ MICHAEL'S DEVICE TEST, 2026-08-25 evening: Saturday club long ride, Tuesday club hard ride,
   * Thursday club hard run, Friday blocked. *"Stacking is the release valve — lifts may share a day
   * with club or other endurance sessions to make the schedule work."*
   *
   * ⚠️ THIS ASSERTS BEHAVIOUR THE MODEL ALREADY HAD RATHER THAN BEHAVIOUR THIS PASS ADDED, and that
   * is exactly why it is worth pinning: the ruling now DEPENDS on the resolver stacking, and nothing
   * was making it. The `-500`-per-missing-recovery-day term dominates every shape term, so spending
   * the last clear day always scores worse than doubling up — but that is an ordering between two
   * weights, and a future tuning pass could reverse it silently. It cannot now.
   */
  const input = {
    runDays: 4,
    rideDays: 3,
    longRideDay: 'saturday',
    hardDays: [
      { discipline: 'bike' as const, day: 'tuesday', ownership: 'club' as const },
      { discipline: 'run' as const, day: 'thursday', ownership: 'club' as const },
    ],
    unavailableDays: ['friday'],
  };
  const w = resolveAroundPins(buildWizardWeek(input), { minRestDays: 1, unavailableDays: [4] });

  // 1 ── FRIDAY IS EMPTY. A blocked day is untouchable.
  for (const p of w.placements) {
    assert(p.day !== 4, `${p.unit.label} landed on the blocked Friday`);
  }
  // 2 ── ALL THREE CLUB DAYS KEPT. The world set them; nothing may move them.
  const dayOfLabel = (needle: string): number | null =>
    w.placements.find((p) => p.unit.label.toLowerCase().includes(needle))?.day ?? null;
  assertEquals(dayOfLabel('long ride'), 5, 'the club long ride lost Saturday');
  assertEquals(dayOfLabel('hard bike'), 1, 'the club hard ride lost Tuesday');
  assertEquals(dayOfLabel('hard run'), 3, 'the club hard run lost Thursday');
  assertEquals(w.relocations.length, 0, 'a week where nothing was blocked out reported a move');

  // 3 ── AND A LIFT SHARES A DAY WITH A CLUB SESSION — the release valve.
  const stacked = w.placements.filter((p) =>
    p.unit.sessions.length > 1 && [1, 3, 5].includes(p.day));
  assert(
    stacked.length > 0,
    `no lift shares a day with a club session: ${w.placements
      .map((p) => `${p.day}:${p.unit.label}`).join(' | ')}`,
  );

  // ⛔ THE DAY OFF SURVIVED IT. Stacking exists to buy exactly this.
  assert(w.restDays.length > 0, 'the week has no clear day left at all');
  assertEquals(w.violations.filter((v) => v.tier === 'breach').length, 0,
    `a week the engine calls clean reported a breach: ${JSON.stringify(w.violations)}`);
});

Deno.test('no blocked days is the solve this file ran before the field existed', () => {
  const input = { ...RUNNER, hardDays: [{ discipline: 'run' as const }, { discipline: 'bike' as const }] };
  const bare = solveWizardWeek(input);
  for (const empty of [undefined, [] as string[]]) {
    assertEquals(
      JSON.stringify(solveWizardWeek({ ...input, unavailableDays: empty })),
      JSON.stringify(bare),
      `passing unavailableDays = ${JSON.stringify(empty)} changed the week`,
    );
  }
});
