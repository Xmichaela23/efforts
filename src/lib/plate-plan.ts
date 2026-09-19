/**
 * ⛔ THE PLATES FOR EVERY SET OF ONE EXERCISE (Michael, 2026-09-18 — replaces the fewest-changes carry-over of the
 * same morning, which told a 225 set to keep a 25 inside and add 10s outside it).
 *
 * Each set gets the fewest plates per side the rack can make it with, biggest innermost. The one carry-over: when
 * the next set is exactly the plates already on plus one more plate on the outside, those stay and it goes on
 * (25, then 25 + 10). A side always runs biggest inside to smallest outside — a plate is never inside a bigger one.
 *
 * Presentation only: the weight is the athlete's box, the bar and the rack are the logger's. No new number.
 */

export type RackPlate = { weight: number; count: number };

export type PlatePlanStep = {
  /** Plates on one side for this set, in the order they sit on the bar, inside first (biggest first). */
  plates: number[];
  /** False when the rack cannot make the weight exactly; `plates` is then the closest load under it. */
  possible: boolean;
};

/** `bar` is the bar's key: two bars of the same load are still two bars. */
export type PlatePlanSet = { weight: number; barLoad: number; bar: string } | null;

/* guard: device — hundredths, so 2.5 lb and 1.25 kg plates add up without float drift */
const cents = (x: number) => Math.round(x * 100);

/**
 * The fewest plates that make `amount` (cents), biggest first; on a tie, the one with the bigger plates inside.
 * Null when the rack cannot make it. `rack` is heaviest first.
 */
function fewestPlates(amount: number, rack: RackPlate[]): number[] | null {
  let best: number[] | null = null;
  const walk = (i: number, rem: number, acc: number[]) => {
    if (best && acc.length >= best.length && rem > 0) return;
    if (rem === 0) {
      if (!best || acc.length < best.length) best = acc.slice();
      return;
    }
    if (i >= rack.length) return;
    const w = cents(rack[i].weight);
    // Most of this plate first, so the first answer found at each length has the bigger plates inside.
    for (let n = Math.min(rack[i].count, Math.floor(rem / w)); n >= 0; n--) {
      for (let k = 0; k < n; k++) acc.push(rack[i].weight);
      walk(i + 1, rem - n * w, acc);
      acc.length -= n;
    }
  };
  walk(0, amount, []);
  return best;
}

/** The heaviest load under `amount` (cents) the rack can make — the fallback when a weight cannot be made. */
function closestUnder(amount: number, rack: RackPlate[]): number[] {
  const step = Math.min(...rack.map((p) => cents(p.weight)));
  for (let a = amount - (amount % step); a > 0; a -= step) {
    const p = fewestPlates(a, rack);
    if (p) return p;
  }
  return [];
}

/** One set's plates, from the plates on the bar before it. */
function loadFor(onBar: number[], target: number, rack: RackPlate[]): PlatePlanStep {
  // The carry-over: the plates already on plus exactly one more, no bigger than the outermost, from what is left.
  const onSum = onBar.reduce((a, w) => a + cents(w), 0);
  const extra = target - onSum;
  if (onBar.length > 0 && extra > 0) {
    const plate = rack.find((p) => cents(p.weight) === extra);
    if (plate && extra <= cents(onBar[onBar.length - 1])
      && onBar.filter((w) => w === plate.weight).length < plate.count) {
      return { plates: onBar.concat(plate.weight), possible: true };
    }
  }
  const exact = fewestPlates(target, rack);
  return exact ? { plates: exact, possible: true } : { plates: closestUnder(target, rack), possible: false };
}

/**
 * `sets` in the order they are done; null (or a weight of 0) is a set with nothing to load and is passed over.
 * A set whose bar differs from the previous loaded set's starts a new bar from empty.
 */
export function platePlanForSets(sets: PlatePlanSet[], rack: RackPlate[]): Array<PlatePlanStep | null> {
  const sorted = rack.slice().sort((a, b) => b.weight - a.weight);
  const out: Array<PlatePlanStep | null> = sets.map(() => null);
  let onBar: number[] = [];
  let lastBar: string | null = null;
  sets.forEach((s, i) => {
    if (!s || !(s.weight > 0)) return;
    if (lastBar !== null && lastBar !== s.bar) onBar = [];
    lastBar = s.bar;
    /* guard: device — plates for the weight in the athlete's box on the bar they picked */
    const target = Math.max(0, cents((s.weight - s.barLoad) / 2));
    const step = loadFor(onBar, target, sorted);
    out[i] = step;
    onBar = step.plates;
  });
  return out;
}

/**
 * One side's plates as words: a repeated plate as a count, joined with "+", then "per side" — "45 + 2 × 10 per
 * side". An empty bar is "bar only".
 */
export function platesPerSideText(plates: number[]): string {
  if (plates.length === 0) return 'bar only';
  const parts: string[] = [];
  for (let i = 0; i < plates.length;) {
    let n = 1;
    while (plates[i + n] === plates[i]) n++;
    parts.push(n > 1 ? `${n} × ${plates[i]}` : `${plates[i]}`);
    i += n;
  }
  return `${parts.join(' + ')} per side`;
}
