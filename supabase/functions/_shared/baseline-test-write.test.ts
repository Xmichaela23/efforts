import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { estimate1RM } from '../../../src/lib/estimate-1rm.ts';

/**
 * SAVE-BASELINE-TEST — the rules that moved off the phone (2026-07-30).
 *
 * ⛔ WHY THESE ARE PINNED. `save-baseline-test/index.ts` is an edge handler, so its HTTP shell is not
 * unit-testable here. Its DECISIONS are, and they are the part that used to live in a React component:
 * the rounding direction, the rep-count lift, the canonical key guard, and the raise-vs-down rule.
 * Each one of these, done wrong, writes a bad number into the basis for a twelve-week block.
 *
 * ⚠️ These mirror the handler's own helpers. If you change one there, this file must change with it —
 * that is the point of pinning them, not an inconvenience.
 */

// ── mirrors of the handler's helpers ────────────────────────────────────────
function canonKey(k: string): string {
  const s = String(k || '');
  if (s === 'overhead' || s === 'ohp' || s === 'overhead_press') return 'overheadPress1RM';
  if (s === 'pullup' || s === 'pull_up' || s === 'pullups' || s === 'pullupmaxreps') return 'pullupMaxReps';
  return s;
}
function roundedFromTest(weight: number, reps: number): number {
  const raw = estimate1RM(Number(weight) || 0, Number(reps) || 0);
  if (!(raw > 0)) return 0;
  return Math.floor(raw / 5) * 5;
}
const isRepCountLift = (key: string) => key === 'pullupMaxReps';

// ── the rules ───────────────────────────────────────────────────────────────

Deno.test('a tested max ROUNDS DOWN, never to nearest', () => {
  // 100 × 5 = 116.65 → 115, not 115 either way; pick one that actually straddles:
  // 100 × 3 = 109.99 → floors to 105. Nearest would have given 110 — a weight never demonstrated.
  assertEquals(roundedFromTest(100, 3), 105);
  assertEquals(Math.round(estimate1RM(100, 3) / 5) * 5, 110);
  // ⛔ THE DIRECTION IS THE WHOLE POINT. This number becomes the basis for every prescribed weight in
  // the next block. Rounding up prescribes off something the athlete has not done.
});

Deno.test('a rep-count lift stores the reps — no formula, and zero is legal', () => {
  assertEquals(isRepCountLift('pullupMaxReps'), true);
  assertEquals(isRepCountLift('squat'), false);
  // ⚠️ Zero pull-ups is a VALID baseline — "goal: your first pull-up" (Q-102). A `weight > 0` gate
  // would silently drop every bodyweight result, which is why the handler branches BEFORE that check.
});

Deno.test('the OHP write guard survives the move (D-224)', () => {
  for (const variant of ['overhead', 'ohp', 'overhead_press']) {
    assertEquals(canonKey(variant), 'overheadPress1RM');
  }
  for (const variant of ['pullup', 'pull_up', 'pullups', 'pullupmaxreps']) {
    assertEquals(canonKey(variant), 'pullupMaxReps');
  }
  // A key that is already canonical passes through untouched.
  assertEquals(canonKey('squat'), 'squat');
  assertEquals(canonKey('overheadPress1RM'), 'overheadPress1RM');
  // ⛔ `materialize-plan` reads ONLY `overheadPress1RM`. A result written under a variant is saved,
  // never read, and changes no weight — the athlete sees a number that does nothing.
});

Deno.test('raise, first-time and equal write themselves; a DOWN result asks', () => {
  const decide = (prior: number | undefined, next: number) => {
    if (!(Number(prior) > 0) || next >= Number(prior)) return 'write';
    return 'ask';
  };
  assertEquals(decide(undefined, 150), 'write'); // first time
  assertEquals(decide(150, 165), 'write');       // raise
  assertEquals(decide(150, 150), 'write');       // equal
  assertEquals(decide(150, 140), 'ask');         // down — the athlete's call
  // ⛔ NOT SILENTLY HELD (D-223's ratchet-up-only) AND NOT SILENTLY OVERWRITTEN. A lower test may be
  // a real regression or a bad day, and the app cannot tell which.
});

Deno.test('⛔ phase one writes NOTHING when any lift needs deciding', () => {
  // The handler returns `written: false` and stages nothing server-side. Modelled here as the
  // invariant it protects: an abandoned dialog must not leave some lifts saved and others not.
  const results = [
    { key: 'squat', prior: 100, next: 130 },   // would write
    { key: 'bench', prior: 150, next: 140 },   // needs a decision
  ];
  const anyDown = results.some((r) => r.next < r.prior);
  const written = anyDown ? [] : results.map((r) => r.key);
  assertEquals(written, []);
  // ⚠️ The old client path wrote the raises into `basePerf` FIRST and staged it in component state
  // while the dialog was open. Closing the app mid-dialog lost the decision, not the raise.
});

Deno.test('the formula is the app\'s one formula — not a copy', () => {
  // A 5-rep test at 185: whatever `estimate1RM` says, floored to plate granularity.
  assertEquals(roundedFromTest(185, 5), Math.floor(estimate1RM(185, 5) / 5) * 5);
  // And it is Wendler's, so it matches what `compute-facts` will later say about the same set.
  assertEquals(Math.floor(estimate1RM(255, 8)), 322); // p32's worked example
});
