// ============================================================================
// THE WARM-UP — pp.139–140, and the warm-up SETS from StrongLifts (round 4, 2026-09-18, Michael approved).
//
// ⛔ THE BOOK'S SENTENCE STAYS (`WARM_UP_LINE`, p139–140), printed in the logger above the session's first
// ME / DE / SKILL row. p139–140 give no loads, percentages or rep counts for a warm-up.
//
// ⛔⛔ THE WARM-UP SETS COME FROM STRONGLIFTS' PUBLISHED WARM-UP, NOT FROM THE BOOK. The round-1 ramp (empty bar × 5,
// then 55 / 75 / 90% × 5 / 3 / 2, every number ours) came off on 2026-09-18 (de27b04bd). What comes back is a field
// source, read 2026-09-18:
//   FIELD — StrongLifts 5×5, "Workout Program" (https://stronglifts.com/stronglifts-5x5/workout-program/):
//     "Start with two sets of five reps with the empty bar. Then do several heavier warm up sets of five reps until
//     you reach your work weight." "There's no rest between warmup sets – the weight is light." "On the Squat, Bench
//     and OHPress, start with the empty bar. On Deadlifts and Barbell Rows, start with 65-135lb so the weight can
//     rest on the floor. Then add 25-45lb/10-20kg per set until you reach your work weight."
//   FIELD — StrongLifts support, "Warmup" (https://support.stronglifts.com/article/87-warmup): "5x45, 5x45, 5x95,
//     5x135, 5x185lb and then 5x5 225lb"; the calculator prevents "jumps in weight larger than 45lb on the warmup
//     sets".
// The sets are tagged `warmup: true` and count as nothing — `sets` on the row still reports the work sets, and every
// reader that counts (the earned-set ladder, the rep-band readers, the load ledger) skips the tag.
// Ledger: docs/STATE-SOURCES.md, rows "Warm-up sets (StrongLifts)" and the OURS picks beside them.
// ⚠️ THE REST TIMER IS NOT DECIDED HERE.
// ============================================================================

import { BAR_TYPES, KG_PER_LB } from '../../../../src/lib/bar-types.ts';

/** One warm-up set. `weight` is POUNDS, like every stored weight; `warmup` keeps it out of every count. */
export type WarmupSet = { weight: number; reps: number; warmup: true };

// FIELD — StrongLifts (above): "sets of five reps", "two sets of five reps with the empty bar".
export const WARMUP_REPS = 5;
export const WARMUP_EMPTY_BAR_SETS = 2;
// FIELD — StrongLifts (above): "add 25-45lb/10-20kg per set"; the calculator allows no jump "larger than 45lb".
export const WARMUP_MAX_JUMP = { lb: 45, kg: 20 } as const;
/**
 * The bar the empty-bar sets use, in the athlete's unit: 45 lb, or 20 kg on a metric account (the bar table's
 * `standard` and `standard_kg`, sourced there — Strong, IWF).
 */
export const WARMUP_BAR = { lb: BAR_TYPES.standard.load, kg: BAR_TYPES.standard_kg.load } as const;
// OURS — `WARMUP_FLOOR_START` 135 lb / 60 kg for deadlift and row: StrongLifts gives "65-135lb so the weight can rest on
// the floor"; with full-size plates (45 lb / 20 kg, the app knows no bumper plates) the bar sits on the floor only at
// bar + two plates, 135 lb / 60 kg — the smallest reading of the range those plates allow. Ledger row in STATE-SOURCES.
export const WARMUP_FLOOR_START = { lb: 135, kg: 60 } as const;
// OURS — `WARMUP_FLOOR_START_SETS` one set at the floor start on deadlift and row: StrongLifts' "two sets … with the
// empty bar" names the empty bar, and the floor start is not one. Ledger row in STATE-SOURCES.
export const WARMUP_FLOOR_START_SETS = 1;
// OURS — `WARMUP_ROUND` warm-up weights land on 5 lb / 2.5 kg (the smallest pair of 2.5 lb / 1.25 kg plates); the fewest
// sets that keep every jump within the maximum, evenly stepped. Ledger row in STATE-SOURCES.
export const WARMUP_ROUND = { lb: 5, kg: 2.5 } as const;

/**
 * Deadlift and row start off the floor (StrongLifts: "On Deadlifts and Barbell Rows"). OURS — the name test: any
 * deadlift except the Romanian and stiff-legged ones (started from the top), and any row except the upright row;
 * every other barbell lift starts at the empty bar, as StrongLifts' squat, bench and overhead press do.
 */
export function warmupStartsOnFloor(name: string): boolean {
  const n = String(name ?? '').toLowerCase();
  if (/deadlift/.test(n)) return !/romanian|\brdl\b|stiff/.test(n);
  return /\brows?\b/.test(n) && !/upright/.test(n);
}

/**
 * ⛔ THE WARM-UP SETS FOR ONE BARBELL LIFT — one owner; `materialize-plan carrySetPlan` calls it on every standing
 * plan barbell row with a work weight. The caller decides "barbell"; this decides the sets.
 *
 * @param name         the lift, for the start (empty bar, or the floor start on deadlift and row).
 * @param workWeightLb the first work set's weight, in pounds as stored.
 * @param metric       a metric account: the 20 kg bar, the kg jumps and the kg rounding, stored back as pounds.
 *
 * Empty-bar lifts: 2 × 5 at the bar. Deadlift and row: 1 × 5 at 135 lb / 60 kg. Then 5-rep sets, evenly stepped,
 * no jump over 45 lb / 20 kg (the last jump, onto the work weight, included), and no warm-up set at or above the
 * work weight. Nothing when the work weight is at or under the start.
 */
export function warmupSetsFor(name: string, workWeightLb: number | null | undefined, metric = false): WarmupSet[] {
  const lb = Number(workWeightLb);
  if (!Number.isFinite(lb) || lb <= 0) return [];
  const u = metric ? 'kg' : 'lb';
  const work = metric ? lb * KG_PER_LB : lb;
  const floor = warmupStartsOnFloor(name);
  const start = floor ? WARMUP_FLOOR_START[u] : WARMUP_BAR[u];
  // ⛔ No warm-up set at or above the work weight.
  if (!(work > start + 1e-9)) return [];
  const step = WARMUP_ROUND[u];
  const maxJump = WARMUP_MAX_JUMP[u];
  const snap = (x: number) => Math.round(x / step) * step;
  const gap = work - start;
  let rungs: number[] = [];
  // The fewest jumps that keep every jump within the maximum once the weights land on plates.
  for (let jumps = Math.max(1, Math.ceil(gap / maxJump - 1e-9)); jumps <= 60; jumps++) {
    const mids: number[] = [];
    for (let k = 1; k < jumps; k++) mids.push(snap(start + (k * gap) / jumps));
    const ladder = [start, ...mids, work];
    const ok = ladder.every((w, i) => i === 0 || (w > ladder[i - 1] + 1e-9 && w - ladder[i - 1] <= maxJump + 1e-9));
    if (ok) { rungs = mids; break; }
  }
  const toLb = (x: number) => (metric ? x / KG_PER_LB : x);
  const startSets = floor ? WARMUP_FLOOR_START_SETS : WARMUP_EMPTY_BAR_SETS;
  return [
    ...Array.from({ length: startSets }, () => ({ weight: toLb(start), reps: WARMUP_REPS, warmup: true as const })),
    ...rungs.map((w) => ({ weight: toLb(w), reps: WARMUP_REPS, warmup: true as const })),
  ];
}

// OURS — `DEFAULT_BAR_LB` 45 lb standard bar assumed when the caller passes none; p140's empty bar gives no weight.
export const DEFAULT_BAR_LB = 45;

/**
 * The warm-up line, one owner — the pages' own words, cut (pass 6, read off p139.jpg and p140.jpg):
 *   p139 Rule 1: "A good warm-up is meant to prepare your body to do work, not be a stimulus."
 *   p140 Rule 2a: "With skill development work, every warm-up set should have equal focus and quality to the
 *        work sets." and the pull-quote "The first set of your skill work should also be the last set of your
 *        warm-up."
 * ⚠️ p139-140 give no percentages, loads or rep counts for a warm-up ("working up in weight", "gradually heavier
 * squats until the work set"). The warm-up SETS are StrongLifts' (`warmupSetsFor`, above), not the book's.
 */
export const WARM_UP_LINE = 'A good warm-up is meant to prepare your body to do work, not be a stimulus. '
  + 'With skill development work, every warm-up set should have equal focus and quality to the work sets. '
  + 'The first set of your skill work should also be the last set of your warm-up.';
