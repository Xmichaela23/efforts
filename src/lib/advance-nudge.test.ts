/**
 * ⛔ THE GATE — A ROW THE ENGINE DECIDES FOR DOES NOT GET A NUDGE (Michael, 2026-08-26).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/advance-nudge.test.ts
 *
 * ⚠️ THIS FILE EXISTS TO STOP A RE-LITIGATION. The nudge was asked for on 2026-08-25 and narrowed on
 * 2026-08-26; a future session will find a heavy row that hit the band top twice, see no "Add weight"
 * line, and read it as a broken nudge. It is not broken — the bar has already moved.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { advanceNudgeFor, engineOwnsProgression } from './advance-nudge.ts';

const TOPPED = [{ reps: 5, rir: 2 }, { reps: 5, rir: 2 }];
const ROW = { targetReps: '1-5', loadPrescribed: false as const, prior: TOPPED };

Deno.test('⛔⛔ THE HEAVY SLOT GETS NO NUDGE — the engine already decided', () => {
  /**
   * ⛔ TWO REASONS, AND THE SECOND IS THE GENERAL RULE.
   *   1. `standing-plan/progression.ts` moves the bar off these same logged sessions, so the line was
   *      a SECOND OWNER of one decision — and they disagree: this fires on ONE session at the band
   *      top, the engine waits for two.
   *   2. The field DOES, it does not ASK. StrongLifts, the 5/3/1 apps and the autoregulated ones all
   *      put the new weight on the next session and print a short reason. "Add weight" is
   *      asking-shaped, and the engine has already decided.
   */
  assertEquals(advanceNudgeFor({ ...ROW, slotIntent: 'ME' }), null);
  // ⚠️ AND ON A LEGACY ROW TOO. `slot_intent` is only data since 2026-08-26; a block built last week
  // carries the slot notation in `notes`, and a rule that read only the new field would keep nudging
  // every one of them.
  assertEquals(advanceNudgeFor({ ...ROW, notes: '1 x ME: max effort upper' }), null);
});

Deno.test('⛔ AND THE SPEED SLOT STILL GETS NONE — for a different reason, kept', () => {
  // Speed work advances on BAR SPEED, which its own cue states. Reaching the top of a 2-4 band says
  // nothing about whether the bar moved fast.
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '2-4', prior: [{ reps: 4, rir: 3 }], slotIntent: 'DE' }), null);
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '2-4', prior: [{ reps: 4, rir: 3 }], notes: '4 x DE: speed bench' }), null);
});

Deno.test('⛔⛔ AND IT IS NOT DEAD — every row the engine does NOT own still gets it', () => {
  /**
   * ⚠️ THE HALF THAT MATTERS MOST. Narrowing a line is one edit away from deleting it, and on a row
   * nobody is tracking the ask IS the point: nothing else notices the athlete has outgrown the weight.
   * If this assertion ever goes, the 2026-08-25 feature is gone and only this test would say so.
   */
  const line = advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [{ reps: 12, rir: 2 }, { reps: 12, rir: 2 }] });
  assert(line, 'the nudge was narrowed out of existence');
  assert(line!.includes('Add weight'));
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [{ reps: 12, rir: 2 }], slotIntent: 'HYP' })
    ?.includes('Add weight'), true);
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '3-5', prior: [{ reps: 5, rir: 3 }], slotIntent: 'SKILL' })
    ?.includes('Add weight'), true);
});

Deno.test('⛔ THE OWNERSHIP TEST, DIRECTLY', () => {
  assertEquals(engineOwnsProgression({ slotIntent: 'ME' }), true);
  assertEquals(engineOwnsProgression({ slotIntent: 'DE' }), true);
  assertEquals(engineOwnsProgression({ slotIntent: 'HYP' }), false);
  assertEquals(engineOwnsProgression({ slotIntent: 'SKILL' }), false);
  assertEquals(engineOwnsProgression({}), false, 'an unmarked row lost its nudge');
  // ⚠️ WORD-BOUNDED. "ME" inside a word is not a slot tag — a note about a MOVEMENT must not silence
  // the row.
  assertEquals(engineOwnsProgression({ notes: 'keep the movement clean' }), false);
  assertEquals(engineOwnsProgression({ notes: 'SOME weight' }), false);
});

Deno.test('the pre-existing gates are unchanged', () => {
  // A priced row never had one — the plan states its weight.
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '8-12', loadPrescribed: true, prior: [{ reps: 12, rir: 2 }] }), null);
  // A fixed rep count is not a band.
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '5', prior: [{ reps: 5, rir: 2 }] }), null);
  // No history is no claim.
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [] }), null);
  // Short of the top is no claim.
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [{ reps: 11, rir: 2 }] }), null);
  // ⛔ A GROUND-OUT TOP IS NOT "ROOM TO SPARE".
  assertEquals(advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [{ reps: 12, rir: 0 }] }), null);
  // ⚠️ AND THE LINE NEVER CLAIMS A RESERVE THE ATHLETE DID NOT REPORT.
  assertEquals(
    advanceNudgeFor({ ...ROW, targetReps: '8-12', prior: [{ reps: 12 }] }),
    'Last time: 12 — top of the band. If it felt easy, add weight.',
  );
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ A BODYWEIGHT ROW IS NOT ASKED FOR WEIGHT (2026-08-28)
//
// Michael's device: the ab wheel rollout card read "Last time: 10 · 10 · 10 — top of the band with
// room to spare. Add weight." on a row that correctly has no weight box, no plate chip and no bar
// picker. ⚠️ IT IS A CONSEQUENCE OF A FIX: until 2026-08-27 the logger's private regex called an ab
// wheel rollout "not bodyweight", so the row was drawn a bar and the ask was merely wrong rather
// than impossible. 55 movements gained a correct answer in that change and every one can reach here.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const TOPPED_OUT = [{ reps: 10, rir: 2 }, { reps: 10, rir: 2 }, { reps: 10, rir: 2 }];
const BAND = { targetReps: '8-10', loadPrescribed: false as const, prior: TOPPED_OUT };

Deno.test('⛔ THE ROW ON THE SCREENSHOT — an ab wheel rollout is not told to add weight', () => {
  const line = advanceNudgeFor({ ...BAND, movement: 'Ab Wheel Rollout' });
  assertEquals(line, 'Last time: 10 · 10 · 10 — top of the band with room to spare.');
  // ⛔ THE FACT SURVIVES. Suppressing the whole line was the other option and it loses something
  // real: the athlete finished the top of the band three sessions running.
  assert(line!.includes('10 · 10 · 10'), 'the observation was thrown away with the instruction');
});

Deno.test('⛔ NO IMPERATIVE REACHES ANY BODYWEIGHT ROW — the class, not the one instance', () => {
  // ⚠️ B3's measured list is the blast radius. These are spread across it: a core rollout, a
  // lower-body pattern, a hang, a squat and a hinge.
  for (const name of ['Ab Wheel Rollout', 'Pistol Squat', 'Hanging Leg Raise', 'Air Squat', 'Glute Bridge', 'Sit Up']) {
    for (const prior of [TOPPED_OUT, [{ reps: 10 }, { reps: 10 }, { reps: 10 }]]) {
      const line = advanceNudgeFor({ ...BAND, prior, movement: name });
      assert(line, `${name}: the observation was suppressed along with the ask`);
      assertEquals(/add weight|go heavier|add a little/i.test(line!), false,
        `${name} is asked for weight it has no box for: "${line}"`);
    }
  }
});

Deno.test('⛔ A LOADED ROW IS COMPLETELY UNCHANGED — the ask is the whole point there', () => {
  // Dumbbell bench press was on the same screen and it is FINE: that row has a weight box.
  assertEquals(advanceNudgeFor({ ...BAND, movement: 'Dumbbell Bench Press' }),
    'Last time: 10 · 10 · 10 — top of the band with room to spare. Add weight.');
  assertEquals(advanceNudgeFor({ ...BAND, prior: [{ reps: 10 }, { reps: 10 }, { reps: 10 }], movement: 'Dumbbell Bench Press' }),
    'Last time: 10 · 10 · 10 — top of the band. If it felt easy, add weight.');
  // ⛔ AND THE TWO GOT SWAPPED ONCE BEFORE: cable woodchopper answered "bodyweight" to the old regex
  // because "woodcHOPper" contains the `hop` stem. It is loaded and it keeps the ask.
  assertEquals(/add weight/i.test(advanceNudgeFor({ ...BAND, movement: 'Cable Woodchopper' }) ?? ''), true,
    'the woodchopper collision came back');
});

Deno.test('⚠️ AN ABSENT MOVEMENT BEHAVES EXACTLY AS BEFORE', () => {
  // Every caller that does not name the movement keeps the loaded wording — the parameter is
  // additive, so no existing surface changed by being left alone.
  for (const movement of [undefined, null, '']) {
    assertEquals(advanceNudgeFor({ ...BAND, movement }),
      'Last time: 10 · 10 · 10 — top of the band with room to spare. Add weight.');
  }
});

Deno.test('⛔ THE LOGGER NAMES THE MOVEMENT — a gate that is never asked is not a gate', async () => {
  const src = await Deno.readTextFile(new URL('../components/StrengthLogger.tsx', import.meta.url));
  const call = src.match(/advanceNudgeFor\(\{[\s\S]*?\}\)/);
  assert(call, 'the advance-nudge call site moved or was rewritten');
  assert(/movement:/.test(call![0]), 'the logger stopped naming the movement — the ask can return');
});
