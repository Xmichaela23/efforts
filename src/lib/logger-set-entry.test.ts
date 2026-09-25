/**
 * ⛔ THE SET ROW'S ENTRY RULES — Next's walk and the check's fill, one fixture per row shape and per empty box
 * (2026-09-24, docs/WORKORDER-logger-set-entry-2026-09-24.md §1 and §2).
 *
 *   ~/.deno/bin/deno test --no-check --sloppy-imports src/lib/logger-set-entry.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkFillFor, keypadChainAfter, type CheckFillInput, type SetBoxes } from './logger-set-entry.ts';

// ── §1: the chain Next walks ────────────────────────────────────────────────────────────────────────────

const standing: SetBoxes = { load: 'weight', reps: true, rir: true };        // a standing-plan HYP / DE / SKILL row
const heavy: SetBoxes = { load: 'weight', reps: true, rir: false };          // rir_tracked === false, or ME with no column
const bodyweight: SetBoxes = { load: null, reps: true, rir: true };          // push-up, plank-free bodyweight row
const perSide: SetBoxes = { load: 'weight', reps: true, rir: true };         // a unilateral row: same boxes, reps per side
const assist: SetBoxes = { load: 'assist', reps: true, rir: true };          // pull-up: band help left, added weight right
const band: SetBoxes = { load: 'band', reps: true, rir: true };              // a band movement
const test: SetBoxes = { load: 'weight', reps: true, rir: false };           // baseline test / week-12 retest (no RIR column)
const plyo: SetBoxes = { load: null, reps: true, rir: false };               // efforts, no load, no RIR
const hold: SetBoxes = { load: null, reps: false, rir: false };              // a plank: the reps cell is a clock

Deno.test('weight → Next → reps → Next → RIR → Save on a standing row', () => {
  assertEquals(keypadChainAfter(standing, 'weight'), ['reps', 'rir']);
  assertEquals(keypadChainAfter(standing, 'reps'), ['rir']);
  assertEquals(keypadChainAfter(standing, 'rir'), []);
});

Deno.test('a row with no RIR column: weight → Next → reps → Save', () => {
  assertEquals(keypadChainAfter(heavy, 'weight'), ['reps']);
  assertEquals(keypadChainAfter(heavy, 'reps'), []);
  assertEquals(keypadChainAfter(test, 'weight'), ['reps']);
  assertEquals(keypadChainAfter(test, 'reps'), []);
});

Deno.test('a bodyweight row has no weight box: reps → Next → RIR → Save', () => {
  assertEquals(keypadChainAfter(bodyweight, 'reps'), ['rir']);
  assertEquals(keypadChainAfter(bodyweight, 'rir'), []);
});

Deno.test('a per-side row walks the same boxes', () => {
  assertEquals(keypadChainAfter(perSide, 'weight'), ['reps', 'rir']);
});

Deno.test('the assist pair: Next from either half goes to reps, never to the other half', () => {
  assertEquals(keypadChainAfter(assist, 'band'), ['reps', 'rir']);
  assertEquals(keypadChainAfter(assist, 'weight'), ['reps', 'rir']);
});

Deno.test('a band row: band load → Next → reps → Next → RIR', () => {
  assertEquals(keypadChainAfter(band, 'band'), ['reps', 'rir']);
});

Deno.test('a plyo drill: efforts → Save', () => {
  assertEquals(keypadChainAfter(plyo, 'reps'), []);
});

Deno.test('a hold has no keypad box after the load', () => {
  assertEquals(keypadChainAfter(hold, 'weight'), []);
});

// ── §2: what the check does with an empty box ───────────────────────────────────────────────────────────

const base: CheckFillInput = {
  boxes: standing,
  weightEmpty: false,
  weightGhost: null,
  repsBlank: false,
  repsPlaceholder: null,
  isTest: false,
  isWarmup: false,
  isDuration: false,
};

Deno.test('both boxes filled: nothing written, nothing blocked', () => {
  assertEquals(checkFillFor(base), { fill: {}, block: null });
});

Deno.test('empty weight under a grey suggestion: the suggestion is written', () => {
  assertEquals(checkFillFor({ ...base, weightEmpty: true, weightGhost: 40 }), { fill: { weight: 40 }, block: null });
});

Deno.test('empty weight with nothing shown: completes as before, no weight written', () => {
  assertEquals(checkFillFor({ ...base, weightEmpty: true, weightGhost: null }), { fill: {}, block: null });
});

Deno.test('a grey suggestion is never written over a typed weight', () => {
  assertEquals(checkFillFor({ ...base, weightEmpty: false, weightGhost: 40 }), { fill: {}, block: null });
});

Deno.test('the suggestion is only the plain weight cell\'s: the assist pair and a band box never fill', () => {
  assertEquals(checkFillFor({ ...base, boxes: assist, weightEmpty: true, weightGhost: 40 }), { fill: {}, block: null });
  assertEquals(checkFillFor({ ...base, boxes: band, weightEmpty: true, weightGhost: 40 }), { fill: {}, block: null });
});

Deno.test('empty reps under a number: the number is written', () => {
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: '8' }), { fill: { reps: 8 }, block: null });
});

Deno.test('empty reps under a band placeholder blocks and opens the reps keypad', () => {
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: '6-12' }), { fill: {}, block: 'reps' });
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: '2-4' }), { fill: {}, block: 'reps' });
});

Deno.test('empty reps under a rep total or with nothing shown blocks', () => {
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: '25 total' }), { fill: {}, block: 'reps' });
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: null }), { fill: {}, block: 'reps' });
});

Deno.test('a measurement set never fills reps: AMRAP, rep-max, baseline test, retest all block', () => {
  assertEquals(checkFillFor({ ...base, boxes: test, repsBlank: true, repsPlaceholder: '8', isTest: true }), { fill: {}, block: 'reps' });
});

Deno.test('a weight fill and a reps block can both happen on one check', () => {
  assertEquals(
    checkFillFor({ ...base, weightEmpty: true, weightGhost: 40, repsBlank: true, repsPlaceholder: '6-12' }),
    { fill: { weight: 40 }, block: 'reps' },
  );
});

Deno.test('a warm-up set and a hold are exempt from the reps check, as before', () => {
  assertEquals(checkFillFor({ ...base, repsBlank: true, repsPlaceholder: null, isWarmup: true }), { fill: {}, block: null });
  assertEquals(checkFillFor({ ...base, boxes: hold, repsBlank: true, repsPlaceholder: null, isDuration: true }), { fill: {}, block: null });
});

Deno.test('a typed zero on the heavy slot is not blank and is not filled', () => {
  // `repsBlank` is false for a typed zero (`repsAreBlank`), so the check leaves it alone.
  assertEquals(checkFillFor({ ...base, repsBlank: false, repsPlaceholder: '5' }), { fill: {}, block: null });
});
