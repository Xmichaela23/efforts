// POSITION-IN-RANGE — the band scalar for the State v3 fitness dot (SPEC-state-fitness-band §2a).
//
// A discipline's LEAD metric is placed as a DOT on a track: left = the worst it's been, right = the
// best, over a rolling window. `positionPct` is where the current value sits, ORIENTED so 1 = best
// regardless of whether the metric is higher- or lower-is-better (efficiency rises, decoupling falls).
//
// ⚠ IT IS A RELATIVE FRAME. As an athlete detrains, the low edge drops with them, so the dot can hold
// position while absolute fitness falls. The label ("vs your 12-week range") must carry this on screen —
// the dot answers "where am I in my recent range," never "how fit am I absolutely."
//
// Below the confidence floor the dot renders GREY and unlabeled (a positioned dot on thin data is a lie
// with a coordinate) — `confident: false` drives that. No "% of range" number ever reaches the UI: the
// dot's POSITION is honest (visual, approximate); a percent would relocate false precision onto it.

export interface RangePosition {
  low: number;                 // worst value seen in the window (raw, un-oriented)
  high: number;                // best value seen in the window (raw, un-oriented)
  current: number;             // most-recent value
  positionPct: number;         // 0 = worst end of the range, 1 = best end (oriented by direction)
  confident: boolean;          // ≥ floor samples AND a real spread → colour the dot; else grey/unlabeled
}

export function positionInRange(
  series: Array<{ date?: string; value: number }>,
  opts: { higherIsBetter: boolean; minSamples?: number },
): RangePosition | null {
  const vals = (Array.isArray(series) ? series : []).map((p) => Number(p?.value)).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const current = vals[vals.length - 1];
  const spread = max - min;
  // Orient so positionPct === 1 is always "best". higher-is-better: near max → best. lower-is-better:
  // near min → best. A flat range (no spread yet) sits at the middle — honest "no range to place in".
  const rawFromLow = spread > 0 ? (current - min) / spread : 0.5;
  const positionPct = opts.higherIsBetter ? rawFromLow : 1 - rawFromLow;
  const floor = opts.minSamples ?? 4;
  const confident = vals.length >= floor && spread > 0;
  return {
    low: min,
    high: max,
    current,
    positionPct: Math.max(0, Math.min(1, positionPct)),
    confident,
  };
}
