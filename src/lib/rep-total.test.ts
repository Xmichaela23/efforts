/**
 * The assistance rep total — parser + countdown. [2026-08-11]
 *
 * Run from repo root:  deno test src/lib/rep-total.test.ts --no-check
 *
 * These pin the two rules the logger depends on and that are easy to "simplify" wrongly later:
 *   1. `hasRepTotal` (is this assistance?) and `parseRepTotal` (what do I count down from?) are
 *      DIFFERENT questions. Merging them either mis-classifies a malformed prescription or prints
 *      NaN at the athlete.
 *   2. Only COMPLETED sets count. A typed-but-unticked set is not banked work — same rule the save
 *      path and the missed-Done prompt already apply.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  completedReps,
  hasRepTotal,
  parseRepTotal,
  repsRemaining,
  repTotalLine,
} from './rep-total.ts';

// ── §1 the assistance signal ──────────────────────────────────────────────

Deno.test('hasRepTotal — the assistance prescriptions', () => {
  for (const s of ['50 total', '25 total', '100 TOTAL', 'Total 50', '50 total reps']) {
    assert(hasRepTotal(s), `${s} is a rep total`);
  }
});

Deno.test('hasRepTotal — a MAIN lift prescription is never a total', () => {
  for (const s of ['5', '8', '4-6', '5+', 'AMRAP', '', null, undefined, 8]) {
    assert(!hasRepTotal(s), `${JSON.stringify(s)} must not read as assistance`);
  }
});

// ── §2 the countdown number ───────────────────────────────────────────────

Deno.test('parseRepTotal — pulls the number out of the prescription', () => {
  assertEquals(parseRepTotal('50 total'), 50);
  assertEquals(parseRepTotal('25 total'), 25);
  assertEquals(parseRepTotal('Total 100'), 100);
});

Deno.test('parseRepTotal — null on anything that cannot be counted down', () => {
  // A malformed total: assistance, but there is no number to show.
  assertEquals(parseRepTotal('total'), null);
  assertEquals(parseRepTotal('0 total'), null);
  // Not assistance at all.
  assertEquals(parseRepTotal('8'), null);
  assertEquals(parseRepTotal('4-6'), null);
  assertEquals(parseRepTotal('5+'), null);
  assertEquals(parseRepTotal(undefined), null);
});

Deno.test('the two questions are DELIBERATELY not the same — "total" is assistance with no number', () => {
  assert(hasRepTotal('total'), 'still an assistance row — isAssistanceRow must keep routing it');
  assertEquals(parseRepTotal('total'), null, 'but no countdown, rather than NaN of NaN');
});

// ── §3 only completed sets count ──────────────────────────────────────────

Deno.test('completedReps — sums ticked sets only', () => {
  const sets = [
    { reps: 15, completed: true },
    { reps: 15, completed: true },
    { reps: 12, completed: false }, // typed, not ticked — not banked
  ];
  assertEquals(completedReps(sets), 30);
});

Deno.test('completedReps — a typed but unticked set does NOT tick the total down', () => {
  assertEquals(completedReps([{ reps: 20, completed: false }]), 0);
});

Deno.test('completedReps — blanks, zeros and missing reps contribute nothing', () => {
  assertEquals(completedReps([
    { completed: true },
    { reps: 0, completed: true },
    { reps: null, completed: true },
  ]), 0);
  assertEquals(completedReps(undefined), 0);
  assertEquals(completedReps([]), 0);
});

// ── §4 remaining + the line ───────────────────────────────────────────────

Deno.test('repsRemaining — counts down as sets are ticked', () => {
  const sets = [{ reps: 15, completed: true }, { reps: 3, completed: false }];
  assertEquals(repsRemaining(50, sets), 35);
});

Deno.test('repsRemaining — overshooting lands on 0, never negative', () => {
  assertEquals(repsRemaining(50, [{ reps: 60, completed: true }]), 0);
});

Deno.test('repsRemaining — nothing logged yet means the whole total is owed', () => {
  assertEquals(repsRemaining(50, []), 50);
});

Deno.test('repTotalLine — states the fact, both sides of done', () => {
  assertEquals(repTotalLine(50, 32), '32 of 50 reps left');
  assertEquals(repTotalLine(50, 0), '50 reps done');
  assertEquals(repTotalLine(25, 25), '25 of 25 reps left');
});

Deno.test('repTotalLine — no imperative, no praise (the logger copy rule)', () => {
  for (const line of [repTotalLine(50, 32), repTotalLine(50, 0)]) {
    const s = line.toLowerCase();
    for (const banned of ['go', 'push', 'crush', 'nice', 'great', 'keep going', '!']) {
      assert(!s.includes(banned), `"${line}" must not contain "${banned}"`);
    }
  }
});

// ── §5 the walkthrough the workorder describes ────────────────────────────

Deno.test('a real 50-total accessory, chunk by chunk', () => {
  const total = parseRepTotal('50 total')!;
  assertEquals(total, 50);
  const sets: Array<{ reps?: number; completed?: boolean }> = [];
  assertEquals(repTotalLine(total, repsRemaining(total, sets)), '50 of 50 reps left');
  sets.push({ reps: 15, completed: true });
  assertEquals(repTotalLine(total, repsRemaining(total, sets)), '35 of 50 reps left');
  sets.push({ reps: 15, completed: true });
  assertEquals(repTotalLine(total, repsRemaining(total, sets)), '20 of 50 reps left');
  sets.push({ reps: 12, completed: true });
  assertEquals(repTotalLine(total, repsRemaining(total, sets)), '8 of 50 reps left');
  sets.push({ reps: 8, completed: true });
  assertEquals(repTotalLine(total, repsRemaining(total, sets)), '50 reps done');
});
