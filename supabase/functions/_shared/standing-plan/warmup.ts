// ============================================================================
// THE WARM-UP — pp.139–140, and the warm-up SETS from StrongLifts (round 4, 2026-09-18, Michael approved).
//
// ⛔ THE BOOK'S SENTENCES STAY (`warmUpLineFor`, p139–140), printed in the logger above the session's first
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
// Michael, 2026-09-18: the step is the largest the pages allow, so the fewest warm-up sets.
export const WARMUP_MAX_JUMP = { lb: 45, kg: 20 } as const;
// FIELD — StrongLifts (above): "add 25-45lb/10-20kg per set until you reach your work weight" — the smallest jump,
// onto the work weight included. A rung closer than this to the work weight is left out (a 95 lb squat:
// 45 × 5, 45 × 5, then work — Michael's example, 2026-09-18).
export const WARMUP_MIN_JUMP = { lb: 25, kg: 10 } as const;
/**
 * The bar the empty-bar sets use, in the athlete's unit: 45 lb, or 20 kg on a metric account (the bar table's
 * `standard` and `standard_kg`, sourced there — Strong, IWF).
 */
export const WARMUP_BAR = { lb: BAR_TYPES.standard.load, kg: BAR_TYPES.standard_kg.load } as const;
// OURS — `WARMUP_FLOOR_START` 65 lb / 30 kg for deadlift and row: StrongLifts gives "start with 65-135lb" (30–60 kg);
// Michael, 2026-09-18: the lowest weight in that range the athlete's plates allow. The logger's plate table
// (StrengthLogger `PLATES_BY_UNIT`) holds 10 lb and 5 kg plates, so the bar plus one of each a side — 65 lb / 30 kg —
// is the lowest. The pick inside the published range is ours. Ledger row in STATE-SOURCES.
export const WARMUP_FLOOR_START = { lb: 65, kg: 30 } as const;
// OURS — `WARMUP_FLOOR_START_SETS` one set at the floor start on deadlift and row: StrongLifts' "two sets … with the
// empty bar" names the empty bar, and the floor start is not one. Ledger row in STATE-SOURCES.
export const WARMUP_FLOOR_START_SETS = 1;

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
 * Empty-bar lifts: 2 × 5 at the bar. Deadlift and row: 1 × 5 at 65 lb / 30 kg. Then 5-rep sets, each 45 lb / 20 kg
 * above the last (the largest jump StrongLifts allows, so the fewest sets), kept only while the work weight is still at
 * least 25 lb / 10 kg above it (StrongLifts' smallest jump). No warm-up set at or above the work weight; nothing when
 * the work weight is at or under the start.
 * ⚠️ The jump onto the work weight can therefore be up to 45 + 24 lb (20 + 9.x kg): StrongLifts' own example
 * (45 → 95) jumps 50 lb, and Michael's 95 lb squat (45, 45, then work) needs it.
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
  const rungs: number[] = [];
  for (let w = start + WARMUP_MAX_JUMP[u]; work - w >= WARMUP_MIN_JUMP[u] - 1e-9; w += WARMUP_MAX_JUMP[u]) rungs.push(w);
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
 * The warm-up line, one owner — since 2026-09-19 a rewording of each page that Michael approved word for word; the
 * pages' own words are quoted below (pass 6, read off p139.jpg and p140.jpg), SPLIT BY EACH
 * PAGE'S OWN SCOPE (Michael, 2026-09-18):
 *   p139 Rule 1, every lifting day: "A good warm-up is meant to prepare your body to do work, not be a stimulus."
 *   p140 Rule 2a, skill work only: "With skill development work, every warm-up set should have equal focus and quality
 *        to the work sets." and the pull-quote "The first set of your skill work should also be the last set of your
 *        warm-up." — printed only on a session whose first lift is SKILL.
 * ⚠️ p139-140 give no percentages, loads or rep counts for a warm-up ("working up in weight", "gradually heavier
 * squats until the work set"). The warm-up SETS are StrongLifts' (`warmupSetsFor`, above), not the book's.
 */
export const WARM_UP_P139 = 'A good warm-up readies the body for work; it should not be a stimulus.'; // p139, reworded
export const WARM_UP_P140_SKILL = 'In skill development work, each warm-up set needs the same attention and quality as the work sets. ' // p140, reworded
  + 'Your last warm-up set should also serve as your first set of skill work.'; // p140, reworded

/**
 * The session's warm-up line (materialize-plan stamps it as `computed.warm_up_line`; the logger prints it above the
 * first ME / DE / SKILL row). Null on a session with no ME / DE / SKILL row. `rows` in session order.
 */
export function warmUpLineFor(rows: Array<{ slot_intent?: unknown } | null | undefined>): string | null {
  const intentOf = (r: { slot_intent?: unknown } | null | undefined) => String(r?.slot_intent ?? '').toUpperCase();
  if (!rows.some((r) => ['ME', 'DE', 'SKILL'].includes(intentOf(r)))) return null;
  return intentOf(rows[0]) === 'SKILL' ? `${WARM_UP_P139} ${WARM_UP_P140_SKILL}` : WARM_UP_P139;
}
