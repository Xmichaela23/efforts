/**
 * ⛔⛔ THE DEADLIFT SLOT IS COUNTED ONCE (FIXLIST 2b-server, ruled by Michael 2026-09-01).
 *
 *   deno test --allow-read supabase/functions/_shared/state-trend/e1rm-band-slot-aggregation.test.ts --no-check
 *
 * ⛔ THE ACCEPTANCE TEST IS THE MEASUREMENT THAT WAS ALREADY IN THE CODE. The comment above
 * `PRIMARY_LIFTS` recorded it: a synthetic athlete of identical strength read **0.750** on
 * squat + deadlift and **0.833** once a trap bar was logged — eight points, because a variant was
 * logged rather than because anything got stronger. These fixtures pin BOTH directions: the
 * two-lift athlete is unchanged, and the three-canonical athlete now reads the same 0.750.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeE1rmBand, type LiftSeries } from './strength.ts';

const series = (canonical: string, pts: Array<[string, number]>): LiftSeries => ({
  canonical,
  displayName: canonical,
  points: pts.map(([date, value]) => ({ date, value })),
});

/** Identical strength: every lift sitting at 75% of its own baseline. */
const BASELINES = { squat: 400, deadlift: 400, trap_bar_deadlift: 400, bench_press: 200, overhead_press: 100 };

Deno.test('⛔ THE BASELINE CASE IS UNCHANGED — squat + deadlift at 75% still reads 0.750', () => {
  const band = computeE1rmBand(
    [series('squat', [['2026-08-01', 300]]), series('deadlift', [['2026-08-01', 300]])],
    BASELINES,
  );
  assertEquals(band?.positionPct, 0.75);
});

Deno.test('⛔⛔ THE FAULT IS GONE — adding a trap bar no longer moves the dot to 0.833', () => {
  const band = computeE1rmBand(
    [
      series('squat', [['2026-08-01', 300]]),
      series('deadlift', [['2026-08-01', 300]]),
      series('trap_bar_deadlift', [['2026-08-08', 300]]),
    ],
    BASELINES,
  );
  assertEquals(band?.positionPct, 0.75, 'the hinge slot must count once, not twice');
});

Deno.test('⛔ AND THE OLD BEHAVIOUR IS PINNED AS WRONG — three canonicals must not average as three', () => {
  // Had the slot been counted twice, (0.75 + 0.75 + 1.0) / 3 = 0.833. Assert we are NOT there.
  const band = computeE1rmBand(
    [
      series('squat', [['2026-08-01', 300]]),
      series('deadlift', [['2026-08-01', 300]]),
      series('trap_bar_deadlift', [['2026-08-08', 400]]),
    ],
    BASELINES,
  );
  assert(band != null);
  assert(Math.abs(band.positionPct - 0.833) > 0.01, `still double-counting: ${band.positionPct}`);
});

Deno.test('⛔ THE SLOT TAKES ITS MOST RECENT READING — the later trap-bar pull is the hinge', () => {
  const band = computeE1rmBand(
    [
      series('squat', [['2026-08-01', 400]]),                 // 1.00
      series('deadlift', [['2026-08-01', 400]]),              // 1.00, older
      series('trap_bar_deadlift', [['2026-08-20', 200]]),     // 0.50, newer → owns the slot
    ],
    BASELINES,
  );
  // (1.00 + 0.50) / 2 = 0.75 — the hinge reads the current pull, not the stale conventional one.
  assertEquals(band?.positionPct, 0.75);
});

Deno.test('⚠️ A TRAP-BAR-ONLY ATHLETE IS UNAFFECTED — one hinge, counted once', () => {
  const band = computeE1rmBand(
    [series('squat', [['2026-08-01', 300]]), series('trap_bar_deadlift', [['2026-08-01', 300]])],
    BASELINES,
  );
  assertEquals(band?.positionPct, 0.75);
});

Deno.test('⚠️ EVERY OTHER SLOT IS UNTOUCHED — four distinct lifts still average as four', () => {
  const band = computeE1rmBand(
    [
      series('squat', [['2026-08-01', 400]]),           // 1.00
      series('deadlift', [['2026-08-01', 200]]),        // 0.50
      series('bench_press', [['2026-08-01', 200]]),     // 1.00
      series('overhead_press', [['2026-08-01', 50]]),   // 0.50
    ],
    BASELINES,
  );
  assertEquals(band?.positionPct, 0.75);
});

Deno.test('⚠️ THE NO-BASELINE FALLBACK AGGREGATES BY SLOT TOO — not just the preferred branch', () => {
  const withTrap = computeE1rmBand([
    series('squat', [['2026-07-01', 200], ['2026-08-01', 300]]),
    series('deadlift', [['2026-07-01', 200], ['2026-08-01', 300]]),
    series('trap_bar_deadlift', [['2026-07-01', 200], ['2026-08-08', 100]]),
  ], null);
  const withoutTrap = computeE1rmBand([
    series('squat', [['2026-07-01', 200], ['2026-08-01', 300]]),
    series('deadlift', [['2026-07-01', 200], ['2026-08-01', 300]]),
  ], null);
  assert(withTrap != null && withoutTrap != null);
  // The trap bar owns the hinge slot (newer), so the two differ — but the hinge contributes ONE
  // position, never two. Three canonicals must not produce a three-way average.
  assertEquals(Math.round(withTrap.positionPct * 1000) / 1000, 0.5, 'squat 1.0 + hinge 0.0, over TWO slots');
  assertEquals(withoutTrap.positionPct, 1);
});
