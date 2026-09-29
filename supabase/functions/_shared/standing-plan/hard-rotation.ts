// ============================================================================
// THE HARD ROTATION, HELD — which printed shape each hard slot builds each week.
//
// ⛔⛔ THE TWO RULES IT SERVES, BOTH READ OFF THE PAGE IMAGES (2026-09-29):
//   · p112 — *"Rotations in sets and reps, interval intensity and duration, and so forth may all take
//     place … but the overall volume and intensity can remain fairly similar"*, and *"A given training
//     load (intensity/volume/frequency) can be maintained for several weeks at a time with minor
//     adjustments from session to session … simply applied across slightly different set durations
//     and intensities."* So the hard slots rotate through the page's shapes, and the load holds.
//   · p148 — the weekly buckets: *"aiming to change each of these by less than 10 percent per week,
//     though ideally 5 percent is as high as I will usually go."* The buckets are p146's (sub-VT1,
//     near-threshold, over-threshold minutes, work sets, effective reps).
//
// ⛔ WHAT WAS WRONG. The composer walked each slot's shapes by week number, each slot on its own. The
// shapes differ in length, so the week's hard minutes swung 20-45% week to week on every plan, and two
// slots of one family could land the same long shape in the same week (Ride + Strength's two sweet
// spot rides built Tempo Blocks together every third week).
//
// ⛔ WHAT THIS DOES. It chooses ONE cycle of weeks for all the hard slots together: each row names the
// shape every rotating hard slot builds that week, and week N builds row (N − 1) mod L. The cycle is
// the one whose week-to-week steps break the 10% line the fewest times — the week's hard minutes first,
// then p146's three minute buckets (sub-VT1, near-threshold, over-threshold) — and then move the least.
// Constraints, never traded away:
//   · every printed shape of every slot is in the cycle (the rotation stays whole — p229's "try each
//     type of workout");
//   · a slot with more than one shape changes shape every week (the rotation still rotates);
//   · two slots of one family never build the same shape in one week, wherever the shapes allow it
//     (Michael, 2026-08-26: "the two hard-session cards must not build the same shape twice").
// ⚠️ WHERE NO ORDER CAN HOLD 10%, the fewest breaks is the answer and nothing else moves: the page's
// own shapes differ by more than that, and the rotation is the page's too.
//
// ⚠️ PURE AND DETERMINISTIC — the same slots give the same cycle on every call, so every week of a
// block, a restate from any week, and the preview all read one answer. Memoized on its inputs.
// ⚠️ THE CALLER DECIDES WHAT ROTATES. A slot the athlete picked, the frame pinned, or a substitution
// fixed is not handed in as rotating; it is part of `base`.
// ============================================================================

import { WEEK_CHANGE_FLAG_PCT } from '../accessory-dosing/dose.ts';

/** One session's share of the four numbers the cycle holds (for the base: the rest of the week's). */
export type HoldVector = { minutes: number; sub: number; near: number; over: number };
export type HoldCandidate = { id: string } & HoldVector;
/** One rotating hard slot: its printed shapes in the page's order, and the sport it is built in. */
export type HoldSlot = { key: string; family: string; sport?: string; candidates: HoldCandidate[] };
/**
 * ⛔ WHERE THE ATHLETE ASKED FOR HOURS OF A SPORT, the solve sizes that sport's easy sessions around its hard ones
 * (`volume-bounds.ts sizeFor`), so a cycle that holds the week's hard minutes by trading them between sports would
 * swing that sport's long session. Each asked sport's hard minutes are then held too, like the week's. The value is
 * that sport's hard minutes in the slots that do not rotate. ⚠️ ONLY WHETHER an ask exists steers the cycle, never
 * its size: a bigger ask must never build a different, shorter week (`volume-bounds.test.ts` THE HOURS SWEEP).
 * Absent: no ask, and the easy sessions do not move with the hard ones.
 */
export type HoldPerSport = Partial<Record<string, number>>;
export type HoldPlan = {
  /** `cycle[row][i]` is the shape slot `keys[i]` builds on that row. */
  cycle: string[][];
  keys: string[];
  /** Week-to-week breaks of the 10% line per trip round the cycle, summed over the four numbers. */
  breaks: number;
};

const METRICS = ['minutes', 'sub', 'near', 'over'] as const;

/**
 * ⚠️ OURS — THE LONGEST CYCLE TRIED: 11 rows, so every row lands in a standard week of a twelve-week block
 * (week 1 is the test week). A longer cycle would leave a shape unbuilt in that block.
 */
const MAX_ROWS = 11;
/** ⚠️ OURS — cycles tried past the shortest one that can hold every shape (more rows, more room to hold). */
const EXTRA_ROWS = 5;
/** ⚠️ OURS — the search's width: the cheapest paths carried forward each week, so a wide week builds in bounded time. */
const BEAM = 200;
/**
 * ⚠️ OURS — THE WEIGHTS THAT MAKE THE COST'S ORDER STRICT (see `trans`): one hard-minutes break outweighs every
 * bucket break a cycle of at most `MAX_ROWS` steps can hold, and one bucket break outweighs the smoothing term.
 */
const MINUTES_BREAK = 100_000;
const BUCKET_BREAK = 1_000;

/** The change from one week's number to the next, as a fraction of the first. */
function relChange(a: number, b: number): number {
  if (a <= 0) return b <= 0 ? 0 : Infinity;
  return Math.abs(b - a) / a;
}

/** ⛔ p148's line, read from the app's one constant for it (`WEEK_CHANGE_FLAG_PCT`): over 10% is a break. */
const breaksLine = (rel: number) => rel * 100 > WEEK_CHANGE_FLAG_PCT;

const cache = new Map<string, HoldPlan>();

export function holdRotation(
  slots: HoldSlot[], base: HoldVector, held: Record<string, string[]> = {}, perSport: HoldPerSport = {},
): HoldPlan {
  const memoKey = JSON.stringify([slots, base, held, perSport]);
  const hit = cache.get(memoKey);
  if (hit) return hit;
  const plan = search(slots, base, held, perSport);
  if (cache.size > 512) cache.clear();
  cache.set(memoKey, plan);
  return plan;
}

function search(slots: HoldSlot[], base: HoldVector, held: Record<string, string[]>, perSport: HoldPerSport): HoldPlan {
  const keys = slots.map((s) => s.key);
  const m = slots.length;
  if (m === 0 || slots.some((s) => s.candidates.length === 0)) {
    return { cycle: [slots.map((s) => s.candidates[0]?.id ?? '')], keys, breaks: 0 };
  }
  const k = slots.map((s) => s.candidates.length);
  const idOf = (i: number, c: number) => slots[i].candidates[c].id;

  // ── the rows a week may build ───────────────────────────────────────────────────────────────
  const all: number[][] = [];
  const walk = (i: number, acc: number[]) => {
    if (i === m) { all.push(acc.slice()); return; }
    for (let c = 0; c < k[i]; c++) { acc.push(c); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  const distinct = (row: number[], withHeld: boolean) => {
    const seen = new Map<string, Set<string>>();
    for (let i = 0; i < m; i++) {
      const fam = slots[i].family;
      const set = seen.get(fam) ?? new Set<string>(withHeld ? (held[fam] ?? []) : []);
      const id = idOf(i, row[i]);
      if (set.has(id)) return false;
      set.add(id);
      seen.set(fam, set);
    }
    return true;
  };
  // ⚠️ THE NO-TWIN RULE APPLIES ONLY AS FAR AS THE SHAPES ALLOW IT: every shape of every slot must still
  // be buildable in some row, or the rule is relaxed (first the fixed slots' shapes, then entirely). A row
  // the relaxation lets in still costs a bucket break per twin, so it is built as seldom as the cycle allows.
  const covers = (rs: number[][]) => slots.every((s, i) => s.candidates.every((_, c) => rs.some((r) => r[i] === c)));
  let rows = all.filter((r) => distinct(r, true));
  if (!covers(rows)) rows = all.filter((r) => distinct(r, false));
  if (!covers(rows)) rows = all;
  const twins = rows.map((r) => (distinct(r, true) ? 0 : 1));

  // ⛔ Each asked sport's own hard minutes — see `HoldPerSport`. Held like the week's.
  const asked = Object.entries(perSport).filter(([, t]) => Number.isFinite(Number(t))) as Array<[string, number]>;
  const sportKeys = asked.map(([sport]) => `hard:${sport}`);
  const vec = rows.map((r) => {
    const v: Record<string, number> = { ...base };
    r.forEach((c, i) => { for (const q of METRICS) v[q] += slots[i].candidates[c][q]; });
    for (const [sport, fixed] of asked) {
      v[`hard:${sport}`] = fixed + r.reduce((a, c, i) => a + (slots[i].sport === sport ? slots[i].candidates[c].minutes : 0), 0);
    }
    return v;
  });
  const heldKeys = [...METRICS, ...sportKeys];
  /**
   * ⛔ THE COST OF ONE WEEK-TO-WEEK STEP, in the order the line is held:
   *   1. a break of the 10% line in the week's HARD MINUTES — the session lengths themselves, which the
   *      week's total follows — and, under an hours ask, in that sport's own hard minutes;
   *   2. a break in one of p146's minute buckets (sub-VT1, near-threshold, over-threshold);
   *   3. how far the four numbers move at all (squared changes) — p148's "ideally 5 percent".
   * ⚠️ OURS — THE ORDER. The page states one line for every bucket; the minutes come first because a
   * bucket of a dozen minutes breaks 10% on a single shape swap that no order can avoid, and trading the
   * session lengths for it would move the week's total, which the rotation is meant to hold.
   * Null where a rotating slot would not change (the rotation still rotates).
   */
  const trans: Array<Array<{ cost: number; breaks: number } | null>> = rows.map((a, ai) => rows.map((bRow, bi) => {
    for (let i = 0; i < m; i++) if (k[i] > 1 && a[i] === bRow[i]) return null;
    let cost = twins[bi] * BUCKET_BREAK, breaks = 0;
    for (const q of heldKeys) {
      const rel = relChange(vec[ai][q], vec[bi][q]);
      if (breaksLine(rel)) { breaks += 1; cost += q === 'minutes' || q.startsWith('hard:') ? MINUTES_BREAK : BUCKET_BREAK; }
      cost += Number.isFinite(rel) ? rel * rel : 4;
    }
    return { cost, breaks };
  }));
  const order = rows.map((_, ai) => rows.map((__, bi) => bi)
    .filter((bi) => trans[ai][bi] != null)
    .sort((x, y) => (trans[ai][x]!.cost - trans[ai][y]!.cost) || (x - y)));

  // ── the cycle ───────────────────────────────────────────────────────────────────────────────
  // ⚠️ Row 0 starts on the first rotating slot's first printed shape — any cycle can be turned to start there.
  const first = k.findIndex((kk) => kk > 1);
  const starts = rows.map((_, i) => i).filter((i) => first < 0 || rows[i][first] === 0);
  const lMin = Math.max(1, ...k);
  const lMax = Math.min(MAX_ROWS, lMin + EXTRA_ROWS);
  const pageOrder = (): HoldPlan => ({
    cycle: Array.from({ length: lMin }, (_, w) => slots.map((_, i) => idOf(i, w % k[i]))), keys, breaks: -1,
  });
  if (lMin === 1) return { cycle: [slots.map((_, i) => idOf(i, 0))], keys, breaks: 0 };

  // Which shapes a set of rows has built, one bit per (slot, shape).
  const offset: number[] = [];
  let bits = 0;
  for (const kk of k) { offset.push(bits); bits += kk; }
  // ⚠️ More shapes than a bit mask holds cannot be searched this way; the page's own order builds instead.
  if (bits > 30) return pageOrder();
  const full = k.map((kk, i) => ((1 << kk) - 1) << offset[i]);
  const rowBits = rows.map((r) => r.reduce((b, c, i) => b | (1 << (offset[i] + c)), 0));
  const popcount = (x: number) => { let c = 0; while (x) { x &= x - 1; c += 1; } return c; };
  const missing = (mask: number) => full.reduce((mx, f) => Math.max(mx, popcount(f & ~mask)), 0);

  /**
   * ⛔ THE SEARCH — for each cycle length and each first row, the cheapest paths are carried week by week, one per
   * (row, shapes-built-so-far), and only the `BEAM` cheapest go forward. A path that can no longer build every shape
   * in the weeks left is dropped. The cycle closes back onto its first row.
   * ⚠️ Judged per step, so cycles of different lengths are compared on the same weeks.
   */
  type State = { row: number; mask: number; cost: number; breaks: number; path: number[] };
  let best: { rows: number[]; rate: number; breaks: number } | null = null;
  const EPS = 1e-9;
  for (let L = lMin; L <= lMax; L++) {
    for (const r0 of starts) {
      let layer: State[] = [{ row: r0, mask: rowBits[r0], cost: 0, breaks: 0, path: [r0] }];
      for (let pos = 1; pos < L && layer.length > 0; pos++) {
        const next = new Map<number, State>();
        for (const st of layer) {
          for (const nx of order[st.row]) {
            const t = trans[st.row][nx]!;
            const cost = st.cost + t.cost;
            // The steps are sorted by cost, so once one cannot beat the best, none after it can.
            if (best != null && cost / L >= best.rate - EPS) break;
            const mask = st.mask | rowBits[nx];
            if (missing(mask) > L - pos - 1) continue;
            const key = nx * 2 ** bits + mask;
            const prev = next.get(key);
            if (!prev || cost < prev.cost - EPS) {
              next.set(key, { row: nx, mask, cost, breaks: st.breaks + t.breaks, path: [...st.path, nx] });
            }
          }
        }
        layer = [...next.values()].sort((a, b) => a.cost - b.cost).slice(0, BEAM);
      }
      for (const st of layer) {
        const close = trans[st.row][r0];
        if (!close || st.path.length !== L || missing(st.mask) > 0) continue;
        const rate = (st.cost + close.cost) / L;
        if (best == null || rate < best.rate - EPS) best = { rows: st.path, rate, breaks: st.breaks + close.breaks };
      }
    }
  }
  // ⚠️ NO CYCLE CAN HOLD EVERY RULE (every shape, every slot changing weekly): the page's own order, every slot walked
  // by week together, which is what the composer did before this existed. A week always builds.
  if (!best) return pageOrder();
  const found = best as { rows: number[]; rate: number; breaks: number };
  return { cycle: found.rows.map((ri) => rows[ri].map((c, i) => idOf(i, c))), keys, breaks: found.breaks };
}

/** The row week `week` builds — week 1 is row 0, and the cycle repeats. */
export function heldRowFor(plan: HoldPlan, week: number): Record<string, string> {
  const row = plan.cycle[(Math.max(1, week) - 1) % plan.cycle.length];
  const out: Record<string, string> = {};
  plan.keys.forEach((key, i) => { if (row[i]) out[key] = row[i]; });
  return out;
}
