/**
 * ACCESSORY_SET_CUE — the assistance-work cue (2026-08-01).
 *
 * Run from repo root:  deno test src/lib/strength-accessory-copy.test.ts --no-check
 *
 * ⛔ WHY THIS FILE EXISTS SEPARATELY FROM `bar-speed-copy.test.ts`.
 *
 * That file bans four words on the bar-speed lines — `until`, `as many`, `failure`, `fails` —
 * because on a PRESCRIBED set they mean rep-chasing: go until something breaks down. This line
 * contains two of them, deliberately, in the opposite sense:
 *
 *   · "as many" governs SETS, not reps. Splitting a rep total across sets is the opposite of
 *     grinding it out in one.
 *   · "failure" appears as a STOP RULE — "never to failure" — which is the thing the ban protects.
 *
 * So the two rules are not in tension; they are about different objects. **If someone later widens
 * the bar-speed lint to cover every exported copy constant, this test is the record of why that
 * would be wrong.** Pin the intent, not the absence of a substring.
 *
 * Basis: Wendler, 5/3/1 2nd ed. — assistance is performed across as many sets as needed and
 * explicitly not to failure (p.24, p.102); doing too much assistance is the most common mistake
 * lifters make with the programme.
 */
import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ACCESSORY_SET_CUE, BAR_SPEED_COPY } from './strength-focus-copy.ts';

Deno.test('accessory cue — states BOTH halves of the instruction: split the sets, stop short', () => {
  // Half 1: the rep total is not one set.
  assertStringIncludes(ACCESSORY_SET_CUE.toLowerCase(), 'sets');
  // Half 2: the explicit stop rule. This is the clause that makes the word "failure" correct here.
  assertStringIncludes(ACCESSORY_SET_CUE.toLowerCase(), 'never to failure');
});

Deno.test('accessory cue — it is a STOP rule, never an instruction to reach failure', () => {
  const s = ACCESSORY_SET_CUE.toLowerCase();
  // The failure mode this guards: a future edit drops "never" and the line inverts into the exact
  // advice Wendler names as the most common mistake with the programme.
  assert(!/\b(to|until)\s+failure\b/.test(s.replace(/never to failure/g, '')),
    `"failure" may appear only inside the "never to failure" stop rule: ${ACCESSORY_SET_CUE}`);
});

Deno.test('accessory cue — no imperative to add load, and no rep-count promise', () => {
  const s = ACCESSORY_SET_CUE.toLowerCase();
  for (const banned of ['heavier', 'add weight', 'push hard', 'max']) {
    assert(!s.includes(banned), `accessory cue must not contain "${banned}": ${ACCESSORY_SET_CUE}`);
  }
});

Deno.test('accessory cue — it is NOT one of the bar-speed lines (different object, different rules)', () => {
  const barSpeedLines = Object.values(BAR_SPEED_COPY);
  assert(!barSpeedLines.includes(ACCESSORY_SET_CUE),
    'the accessory cue must stay out of BAR_SPEED_COPY — it would fail that table\'s vocabulary lint');
});

Deno.test('deload line — states the fact before the instruction, and concedes nothing', () => {
  // Rewritten 2026-08-01 from "Nothing to prove. Move it fast anyway." The concession was the part
  // an athlete read, and it framed a prescribed light day as a write-off.
  const s = BAR_SPEED_COPY.deload.toLowerCase();
  assertStringIncludes(s, 'on purpose');
  for (const conceding of ['nothing to prove', 'anyway']) {
    assert(!s.includes(conceding), `deload line must not concede: ${BAR_SPEED_COPY.deload}`);
  }
});
