/**
 * ⛔ THE PLATES FOR EVERY SET OF ONE EXERCISE, PICKED TOGETHER (2026-09-18, punch list "SMART PLATE MATH IN THE
 * LOGGER"). The popover used to work each set from scratch, greedy from the biggest plate, so a ramp of
 * 135 → 185 → 225 told the athlete to load 45+25 and then 45+45: strip the 25, put on a 45.
 *
 * This reads the sets in the order the athlete does them and carries the plates from one set to the next. A bar
 * is loaded from the inside out, one side a stack: a plate comes off only after every plate outside it. Each
 * set's load is the one with the fewest plate changes (off plus on) from the set before it; on a tie, the one
 * with the fewest plates on the bar. The first set starts from an empty bar.
 *
 * Presentation only: the weight is the athlete's box, the bar and the rack are the logger's. No new number.
 */

export type RackPlate = { weight: number; count: number };

export type PlatePlanStep = {
  /** Plates on one side for this set, in the order they sit on the bar, inside first. */
  plates: number[];
  /** False when the rack cannot make the weight exactly; `plates` is then the closest load under it. */
  possible: boolean;
};

/** `bar` is the bar's key: two bars of the same load are still two bars. */
export type PlatePlanSet = { weight: number; barLoad: number; bar: string } | null;

/* guard: device — hundredths, so 2.5 lb and 1.25 kg plates add up without float drift */
const cents = (x: number) => Math.round(x * 100);

/** Every way to make `amount` (cents) from what is left in the rack, each heaviest first. Heaviest-first order. */
function additions(amount: number, rack: RackPlate[], left: number[]): number[][] {
  const out: number[][] = [];
  const walk = (i: number, rem: number, acc: number[]) => {
    if (rem === 0) { out.push(acc.slice()); return; }
    if (i >= rack.length) return;
    const w = cents(rack[i].weight);
    const most = Math.min(left[i], Math.floor(rem / w));
    for (let n = most; n >= 0; n--) {
      for (let k = 0; k < n; k++) acc.push(rack[i].weight);
      walk(i + 1, rem - n * w, acc);
      acc.length -= n;
    }
  };
  walk(0, amount, []);
  return out;
}

/** The greedy load from scratch (what the popover did before) — the fallback when a weight cannot be made. */
function greedySum(perSide: number, rack: RackPlate[]): number {
  let rem = cents(perSide);
  for (const p of rack) {
    const w = cents(p.weight);
    rem -= Math.min(p.count, Math.floor(rem / w)) * w;
  }
  return cents(perSide) - rem;
}

/** The load for one set: fewest changes from `from`, then fewest plates. Null when the rack cannot make `target`. */
function nextLoad(from: number[], target: number, rack: RackPlate[]): number[] | null {
  let best: { seq: number[]; changes: number } | null = null;
  for (let k = 0; k <= from.length; k++) {
    const base = from.slice(0, from.length - k);
    const delta = target - base.reduce((a, w) => a + cents(w), 0);
    if (delta < 0) continue;
    const left = rack.map((p) => p.count - base.filter((w) => w === p.weight).length);
    for (const add of additions(delta, rack, left)) {
      const seq = base.concat(add);
      const changes = k + add.length;
      if (!best || changes < best.changes || (changes === best.changes && seq.length < best.seq.length)) {
        best = { seq, changes };
      }
    }
  }
  return best ? best.seq : null;
}

/**
 * `sets` in the order they are done; null (or a weight of 0) is a set with nothing to load and is passed over.
 * A set whose bar differs from the previous loaded set's starts a new bar from empty.
 */
export function platePlanForSets(sets: PlatePlanSet[], rack: RackPlate[]): Array<PlatePlanStep | null> {
  const out: Array<PlatePlanStep | null> = sets.map(() => null);
  let run: number[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const targets = run.map((i) => {
      const s = sets[i]!;
      /* guard: device — plates for the weight in the athlete's box on the bar they picked */
      return Math.max(0, cents((s.weight - s.barLoad) / 2));
    });
    let onBar: number[] = [];
    run.forEach((setIdx, j) => {
      const exact = nextLoad(onBar, targets[j], rack);
      onBar = exact ?? nextLoad(onBar, greedySum(targets[j] / 100, rack), rack) ?? [];
      out[setIdx] = { plates: onBar, possible: exact !== null };
    });
    run = [];
  };
  sets.forEach((s, i) => {
    if (!s || !(s.weight > 0)) return;
    const last = run.length ? sets[run[run.length - 1]]! : null;
    if (last && last.bar !== s.bar) flush();
    run.push(i);
  });
  flush();
  return out;
}
