# PACE-AT-HR TREND SPEC

**Status:** spec only. Filed against Q-025. **Not implemented**. Do not ship without an explicit go-ahead.

**Filed:** 2026-05-25
**Owner:** server: `_shared/fact-packet/queries.ts`; client: `src/components/SessionNarrative.tsx`
**Cross-ref:** OPEN-QUESTIONS Q-025 (the misleading-direction-label bug); D-041 (the 60-day race-boundary filter this builds on); D-042 / D-047 (HR-aware signals already shipped on the narrative side).

## 0. Problem we're solving

The TREND row on a run session's INSIGHTS card draws a sparkline of recent same-type runs and tags a direction (improving / stable / declining) by slope of pace_sec_per_mi over time. For easy runs, the pool already passes a ±15% pace filter (`pool_intensity_filter`, D-038), and points dated before a recent goal race are excluded when `days_since_last_goal_race < 60` (D-041 Fix D). Outside that 60-day window, pre-race-taper points (peak fitness) can still appear in the pool. The narrative side already suppresses the misinterpretation via `pool_pace_context` / POOL INTENSITY CONTEXT prompt rule, but the sparkline label remains red because raw-pace slope is mathematically honest while contextually misleading: "32s/mi slower" against a marathon-taper-week point isn't a fitness regression, it's the athlete coming back from peak.

**Fix shape:** derive TREND direction from **pace-at-HR** (pace normalized by heart rate) rather than raw pace. A faster pace at the same HR = aerobic efficiency improving. Pace-at-HR is robust to fitness-state context: a marathon-taper-week point and a re-entry-week point will differ in pace AND HR, but their *ratio* will diverge less because both pace and HR move together.

This document specifies the server field, the client render change, and the direction-label logic.

---

## 1. Server-side — `pace_at_hr` on trend points

### 1.1 Source data already in place

`trend_points` in `VsSimilarV1` already include `avg_hr` per point (`fact-packet/queries.ts:548-560`):

```ts
trend_points: Array<{
  date: string;
  pace_sec_per_mi: number;
  avg_hr: number | null;
  pace_basis: 'gap' | 'raw';
}>;
```

`avg_hr` resolution now uses the symmetric `getOverallAvgHr` fallback chain (D-047) so the pool-row HR availability matches the current workout's HR availability.

### 1.2 New field

Add **`pace_at_hr: number | null`** to each trend point. Computed at the same site that builds the point.

**Formula (LOCK candidate — review before implementation):**

```
pace_at_hr = pace_sec_per_mi * 100 / avg_hr   // when both pace_sec_per_mi and avg_hr are present and avg_hr > 0
            else null
```

This yields **seconds-per-mile per 100 bpm** — a normalized "pace per heartbeat" with a stable scale. Example: 480 sec/mi (8:00/mi) at 150 bpm → pace_at_hr = 480 * 100 / 150 = **320**. Lower is better (faster pace per heartbeat = more efficient aerobic output).

**Why pace * 100 / hr (not pace / hr):** raw pace/hr lands in fractions (3.2 vs 4.8) that are ugly to chart and tooltip. Multiply by 100 to land in the 200-500 range — same order of magnitude as raw pace, easier to render with the same axis tooling. Open to alternate scaling (e.g. `pace * 150 / hr` to center the scale on the typical aerobic-HR range), but the formula must be locked before client implementation so the slope math is stable.

**Edge cases:**
- `avg_hr == null` → `pace_at_hr: null`. Point still emitted (the date + raw pace remain useful for the sparkline as a fallback).
- `avg_hr <= 0` → treated as null (`getOverallAvgHr` already filters non-positive).
- `pace_basis` does NOT affect `pace_at_hr` — GAP or raw pace, the HR-normalized ratio works the same way. The basis flag stays for the raw `pace_sec_per_mi` field only.

### 1.3 New direction signal

Add a parallel direction calculation to `TrendV1`. Current shape:

```ts
direction: 'improving' | 'declining' | 'stable' | 'insufficient_data';
magnitude: number | null;   // sec/mi per week (raw-pace slope)
```

Add:

```ts
direction_pace_at_hr: 'improving' | 'declining' | 'stable' | 'insufficient_data' | null;
magnitude_pace_at_hr: number | null;   // (sec/mi per 100bpm) per week
```

Direction thresholds — same shape as the existing slope test (`getPaceTrend` at `queries.ts:670`), tuned for the new scale:

```ts
if (slope < -15) 'improving';      // faster per bpm
else if (slope > +15) 'declining'; // slower per bpm
else 'stable';
```

The **±15** cutoff is **provisional**, raised from an initial ±2 proposal after single-user calibration (2026-05-25 pull, n=66 qualifying points / 16 rolling windows). Findings:
- Slope volatility on `pace_at_hr_raw` at the 5-8 point rolling window scale is wide — observed sd ≈ 17.4 sec/mi-per-100bpm per week on a single athlete with steady training.
- ±2 yielded only ~6% stable across the simulation, nowhere near the 60% target. ±15 lands closer to one sd, which puts roughly two-thirds of windows in the stable band for steady-state training — the right shape for a "no fitness movement" signal.
- Heavy-tailed slope distribution (driven by occasional cool-day / fast-day outliers) makes any fixed numeric cutoff fragile across athletes with different volatility profiles.

**Long-term preferred approach (recommended for multi-user implementation):** switch from a fixed numeric cutoff to a **percentile-based classifier**:

```
sort slopes from all this athlete's recent trend windows
  → bottom third (most negative)           → 'improving'
  → top third (most positive)              → 'declining'
  → middle third                           → 'stable'
```

Percentile cutoffs auto-adapt to athlete-specific volatility and don't require unit-aware tuning across athletes with very different training consistency or HR responsiveness. The math is the same population shape goal (~33/33/33 split) the ±15 fixed cutoff is *trying* to approximate, but does it correctly per-athlete instead of relying on cross-athlete-stable units.

**Multi-user calibration still needed** before the cutoff is locked. Single-user data (one athlete, one season) under-samples cross-athlete variance. When the multi-user pull happens, use that data to either (a) confirm ±15 holds across the population, or (b) switch to the percentile classifier.

**Emission rule:** the new direction fires only when **≥ 6 of the trend points have non-null `pace_at_hr`** (raised from 5 after the calibration showed the slope estimate is noisy at the floor — sd≈17 across 16 windows of 5-8 points means 5-point windows are barely above the noise threshold). When fewer than 6 points qualify, `direction_pace_at_hr: 'insufficient_data'` and the client falls back to the raw-pace direction.

**GAP-basis preference rule (calibration-driven):** trend points carry a `pace_basis: 'gap' | 'raw'` flag (§1.2). The single-user pull showed the GAP-basis subset has materially better-behaved distribution shape than raw-pace points (symmetric, sd ≈ 30 vs 44 on the value distribution; no left-tail outliers from cool-day / fast-day runs). **When ≥60% of the post-filter trend points carry `pace_basis === 'gap'`, compute the slope on the GAP-basis pace** (`pace_sec_per_mi` is already GAP when basis is GAP — no extra field needed). When GAP coverage is below 60%, fall back to mixed/raw-basis slope and report the looser stable band. The `pace_basis` value on each point already lets the client know which basis fed the computation; surface it in the tooltip when the GAP-preferred path fires.

### 1.4 Back-compat

Existing consumers reading `trend.direction` / `trend.magnitude` keep working unchanged. The new fields are additive; clients that don't know about them ignore them.

---

## 2. Client sparkline render

### 2.1 Type update

`SessionNarrative.tsx:3-9` `TrendPoint`:

```ts
type TrendPoint = {
  date: string;
  value: number;                  // sec/mi (raw pace) — keep for fallback
  value_pace_at_hr: number | null; // NEW
  avg_hr: number | null;
  is_current: boolean;
  label: string;
};

type TrendData = {
  metric_label: string;
  unit: string;
  points: TrendPoint[];
  direction: 'improving' | 'declining' | 'stable';
  direction_pace_at_hr: 'improving' | 'declining' | 'stable' | 'insufficient_data' | null; // NEW
  summary: string;
  lower_is_better?: boolean;
  ride_type?: string | null;
};
```

### 2.2 Render switch — when to plot pace-at-HR vs raw pace

```ts
const usePaceAtHr =
  trend.direction_pace_at_hr != null &&
  trend.direction_pace_at_hr !== 'insufficient_data' &&
  trend.points.filter(p => p.value_pace_at_hr != null).length >= 6;

const plotValue = (p: TrendPoint) => usePaceAtHr ? p.value_pace_at_hr! : p.value;
const directionForLabel = usePaceAtHr ? trend.direction_pace_at_hr! : trend.direction;
const metricLabel = usePaceAtHr ? `${trend.metric_label} at heart rate` : trend.metric_label;
const unitLabel = usePaceAtHr ? 'sec/mi per 100 bpm' : trend.unit;
```

Three flow cases:

| State | Sparkline plots | Direction label source | Footnote |
|---|---|---|---|
| ≥ 6 points with `value_pace_at_hr` AND server direction non-null | `value_pace_at_hr` | `direction_pace_at_hr` | "pace at heart rate" |
| < 6 qualifying points OR server direction null | `value` (raw pace) | `direction` (current) | (no footnote, current behavior) |
| All points missing HR | `value` (raw pace) | `direction` | (no footnote, current behavior) |

### 2.3 Tooltip change

Per-point tooltip shows both:
- **When pace-at-HR is the active axis:** `"Mar 12 · 8:00/mi at 145 bpm · pace/HR 331"` (pace + bpm + raw pace/HR number, no division shown)
- **When raw pace is the active axis (fallback):** unchanged from today

### 2.4 Legend / metric_label

The TREND row header switches from "Pace trend" to "Pace at heart rate" when `usePaceAtHr`. Athlete-friendly wording — never use "pace per heartbeat" or numerical formulas in copy. The footnote chip (one-line, small text below the sparkline) reads: "Normalized for heart rate so taper-week comparisons aren't misleading."

---

## 3. Direction label logic

### 3.1 lower_is_better is already true for pace trends

`trend.lower_is_better` is already wired (`SessionNarrative.tsx:17`). For pace-at-HR, lower IS better (faster pace per heartbeat = better aerobic efficiency). No change to the flag — same semantics flow through.

### 3.2 Direction → color mapping (unchanged)

The arrow icon and color rendering (`TREND_TONE_COLORS` and friends) read off `direction`. Updating that pipeline to read `directionForLabel` (computed in §2.2) gives correct colors for pace-at-HR labels with no additional change.

### 3.3 Direction copy

When pace-at-HR is active, the trend summary line in the prompt (`getPaceTrend` output that the LLM consumes via the prompt rule) should mention "pace-at-HR" so the LLM picks the right framing:

| `direction_pace_at_hr` | Trend summary copy |
|---|---|
| `improving` | "Pace-at-HR has been improving over the last 8 same-type runs — same effort is producing faster pace, a real aerobic-efficiency signal." |
| `stable` | "Pace-at-HR has held steady over the last 8 same-type runs — aerobic efficiency at this effort isn't moving in either direction." |
| `declining` | "Pace-at-HR has been declining over the last 8 same-type runs — same effort is producing slower pace; check fatigue, sleep, or training load (not a fitness alarm on its own)." |

The narrative prompt rule that consumes this will need a small update to acknowledge the new framing — likely a single sentence in AEROBIC EFFICIENCY TREND (D-042) or its own POOL INTENSITY CONTEXT side rule.

---

## 4. Implementation gates (open before ship)

Before any code lands, lock these:

1. **Formula:** `pace * 100 / avg_hr` — **resolved 2026-05-25 single-user calibration** (n=66 qualifying points). Values land in 360–570 range for a steady-state athlete, mean 476, sd 44. Workable charting scale. Multi-user pull may surface athletes with materially different ranges; revisit if so.
2. **Slope cutoffs:** **±15 (sec/mi per 100bpm)/week — provisional** (raised from ±2 after single-user calibration showed slope sd ≈ 17.4 on rolling 5-8 point windows; ±2 yielded only ~6% stable, ±15 lands near one sd and produces a ~60% stable band). **Multi-user calibration still required before lock.** **Long-term preferred approach:** percentile-based classifier (bottom-third improving / top-third declining / middle stable) per §1.3 — auto-adapts to athlete-specific volatility instead of relying on cross-athlete-stable units. When the multi-user pull happens, use that data to either confirm ±15 holds across the population or switch to the percentile classifier.
3. **Minimum point count:** **6** (raised from 5 after the calibration showed slope estimates are noisy at the 5-point floor — sd ≈ 17 across 16 windows of 5-8 points means a 5-point window is barely above the noise threshold for the proposed ±15 cutoff). Mirrors raised threshold on both server (`insufficient_data` when `< 6`) and client (`usePaceAtHr` requires ≥ 6).
4. **GAP-basis preference rule:** **resolved 2026-05-25 single-user calibration** — GAP-basis subset shows materially better distribution shape (symmetric, no left-tail outliers from cool-day / fast-day raw-pace runs). **When ≥60% of post-filter trend points carry `pace_basis === 'gap'`, compute slope on GAP-basis points only**; otherwise fall back to the mixed/raw-basis slope. Per §1.3 the `pace_basis` flag already exists on each point — no new field needed.
5. **Pool intersection with `pool_intensity_filter`:** trend pool already passes the ±15% filter post-D-038. Pace-at-HR direction should be computed on the post-filter pool. Verify: when D-041 race-boundary filter shrinks the pool, the pace-at-HR direction should ALSO be marked `insufficient_data` if `< 6` remain, not silently fall back to the wider unfiltered pool.
6. **Pin tests required:** (a) pace-at-HR formula stability across the typical (pace, hr) range; (b) direction crossover at the ±15 cutoff (and at the percentile boundaries if that classifier ships); (c) insufficient-data when ≥ 6 points have null avg_hr; (d) `pool_intensity_filter` interaction (filter reduces pool below 6 → server emits `insufficient_data`); (e) client falls back to raw-pace direction when server reports null/insufficient; (f) GAP-basis preference: when ≥60% of points are GAP-basis, the slope is computed on GAP-basis points only; below 60%, mixed-basis slope is used.

---

## 5. Out of scope for this spec

- Cycling parity (cycling already smooths terrain via NP — pace-at-HR analog would be NP-at-HR, but the existing cycling TREND is power-based and doesn't have this issue).
- Backfill of stored fact packets — display-layer reads `trend_points` on each session view; stale rows naturally drain on next session view. No DB migration needed.
- LLM prompt rule rewrite — likely a single-paragraph addendum to AEROBIC EFFICIENCY TREND (D-042); scope when implementation lands.

---

## 6. Cross-references

- Q-025 (OPEN-QUESTIONS.md:301) — the bug this closes.
- D-038 (DECISIONS-LOG.md) — `pool_intensity_filter` ±15% (precedent that pool filtering is a real lever).
- D-041 Fix D (DECISIONS-LOG.md) — race-boundary filter (the 60d window outside of which Q-025 still misfires).
- D-042 (DECISIONS-LOG.md) — AEROBIC EFFICIENCY TREND prompt rule (the narrative-side analog of this work).
- D-047 (DECISIONS-LOG.md) — symmetric `getOverallAvgHr` resolution (prerequisite — avg_hr availability has to be consistent between current workout and pool rows or pace-at-HR computation drops points it shouldn't).
- `_shared/fact-packet/queries.ts:670` `getPaceTrend` — current direction logic.
- `_shared/fact-packet/queries.ts:548-560` `trend_points` emission.
- `src/components/SessionNarrative.tsx:3-19` — client TREND types.
