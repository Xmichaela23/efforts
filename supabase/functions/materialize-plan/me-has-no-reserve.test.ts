/**
 * ⛔⛔ p218 GIVES **ME** NO RESERVE TARGET, AND THE APP INVENTED ONE (2026-08-28).
 *
 *   ~/.deno/bin/deno test -A --no-check supabase/functions/materialize-plan/me-has-no-reserve.test.ts
 *
 * ⚠️ WHAT MICHAEL SAW: the ME pull-up card's cue read *"1-5 reps, stopped short of failure"* —
 * correct — and the row directly under it read **"target 1-5 · 2 in reserve"**, in accent. Two halves
 * of one card disagreeing.
 *
 * ⛔ THE COMPOSER WAS NOT AT FAULT. `compose.ts` `targetRirForIntent` returns null for ME precisely
 * because p218 says *"no RIR target"* in as many words. This file then DERIVED one off the RPE chart,
 * because `protocolUsesRir` is a PROTOCOL-wide flag and the fact is PER-SLOT. `compose.ts:684-687`
 * had recorded it as a gap "for the slice that touches the RIR seam". This is that slice.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { stampsTargetRir } from './index.ts';

Deno.test('⛔ AN ME ROW GETS NO DERIVED TARGET — the whole defect, in one line', () => {
  assertEquals(stampsTargetRir(true, 'ME'), false);
});

Deno.test('the other three intents are UNCHANGED — p218 gives each of them a reserve', () => {
  // ⚠️ DE and SKILL 3-4, HYP 0-2. Suppressing those would be inventing a second gap where the source
  // states a number, which is the same class of error pointing the other way.
  for (const intent of ['DE', 'SKILL', 'HYP']) {
    assertEquals(stampsTargetRir(true, intent), true, `${intent} lost its reserve target`);
  }
});

Deno.test('⛔ A ROW WITH NO SLOT INTENT IS UNTOUCHED — every non-standing plan behaves as before', () => {
  // the previous program, freestyle, every legacy row: absent, null, empty and unknown all keep the old answer.
  for (const v of [undefined, null, '', 'nonsense', 0, {}]) {
    assertEquals(stampsTargetRir(true, v), true, `an intent-less row changed behaviour: ${String(v)}`);
  }
});

Deno.test('the PROTOCOL gate still outranks everything — a protocol that tracks no RIR stamps none', () => {
  // ⛔ TWO DIFFERENT QUESTIONS, AND THE PROTOCOL ONE IS FIRST. the previous program fixes the weight and the reps at
  // plan creation, so a reserve target there is a second instruction that can contradict the
  // prescription — true regardless of what slot the row is.
  for (const intent of [undefined, 'ME', 'DE', 'SKILL', 'HYP']) {
    assertEquals(stampsTargetRir(false, intent), false, `${String(intent)} stamped under a non-RIR protocol`);
  }
});

Deno.test('⚠️ CASE IS NOT A LOOPHOLE', () => {
  // The composer writes 'ME'; a hand-edited or legacy row may not.
  for (const v of ['me', 'Me', ' ME ']) {
    assertEquals(stampsTargetRir(true, v.trim()), false, `"${v}" slipped past the gate`);
  }
});

Deno.test('⛔ THE LOGGER NO LONGER INVENTS A 3 WHEN THE ROW STATES NOTHING', async () => {
  /**
   * ⛔⛔ THIS IS THE COMPANION CHANGE, AND WITHOUT IT THE FIX ABOVE IS WORSE THAN THE BUG.
   * `StrengthLogger`'s Done handler read `rirLoggedSeed(exercise.target_rir) ?? 3`. With the target
   * suppressed, tapping Done would write *"three reps left in the tank"* on a set at 90-100% that the
   * athlete never said — and `rir_autofilled` keeps that out of e1RM and adherence but NOT off the
   * screen. The precedent is six lines above it: a `rir_tracked === false` row (D-324) already
   * completes with no reserve at all.
   *
   * ⚠️ A UNIT TEST CANNOT RENDER THE COMPONENT, so this asserts the source. It is the same shape the
   * rest-timer and plain-intent fixtures use for the same reason.
   */
  const src = await Deno.readTextFile(
    new URL('../../../src/components/StrengthLogger.tsx', import.meta.url).pathname);
  assertEquals(/rirLoggedSeed\(exercise\.target_rir\)\s*\?\?\s*3/.test(src), false,
    'the fabricated-3 fallback came back');
  assert(/const suggestedRir = rirLoggedSeed\(exercise\.target_rir\);/.test(src),
    'the Done handler stopped reading the row target');
  assert(/if \(suggestedRir == null\)/.test(src),
    'the no-target branch is gone — a target-less row will log a reserve nobody stated');
});
