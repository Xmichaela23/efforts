# SPEC — Nothing on the State screen is invented

**Status:** specified, not built. One terminal session.
**Date:** 2026-09-04 · Michael: *"not a single thing on this page should be invented"*
**Rule:** CLAUDE.md rule 5; ledger `docs/STATE-SOURCES.md`. Every number below is a copy of a named
product's rule or is deleted. No new constants. No "ours".

---

## What changes, item by item

| Today (OURS) | Becomes | Copied from |
|---|---|---|
| Trend arrow fires when recent vs early change ≥ ±2% (run/bike), +2.5/−2 (strength), ±1.5 (swim) | Average of the **last 28 days** vs average of the **28 days before**. Higher → ↑, lower → ↓, equal (at the metric's displayed precision) → no arrow. No percent band. | Garmin VO2 max / Training Status trend: recent 4 weeks against before, updated every activity |
| 6-week run/strength, 8-week bike/swim trend windows | 56 days for every discipline (two 28-day halves) | Garmin, as above |
| Signal-vs-noise gate (1 SD of scatter), endpoint smoothing (2 points), "recently flat" | Deleted. The two 28-day averages are the whole test. | — |
| Freshness: 7–35 days scaled to cadence | Deleted. The arrow is recomputed on every session and shows whenever both halves have at least one session. | Garmin recomputes per activity; TrainingPeaks / intervals.icu have no freshness rule |
| minSessions 3–5 scaled to cadence | At least one session in each 28-day half, else no arrow. Nothing to average is the only floor. | — |
| Headline = median of the last 5 sessions | **Average of the last 28 days** — the same number the arrow's recent half uses, so the number and its arrow are one read | Garmin: the value shown is the current 4-week estimate |
| "Recent 6 weeks in colour" on the line | One colour. The chart shows 12 weeks (TrainingPeaks 90 days), a dot per session. | TrainingPeaks / intervals.icu |
| Ride counts for efficiency after ≥10 min in the aerobic band | Keep 10 min — **cite Garmin**: VO2 max updates only from a ride with ≥10 min at ≥70% max HR. Not ours; it was uncited. | Garmin VO2 max requirement |
| Hard ride (best-20 ≥ 90% FTP) left out of the aerobic trend | Keep — Coggan zone 4 floor. Already cited. | Coggan |

Arrows render on the CLOSED rows (efficiency, easy/hard pace, FTP, e1RM) — the `arrow` slot already
exists on `SportRow`; today it is empty because the ±2% band rarely clears. With the Garmin rule it
fills whenever the halves differ.

## Where

- `_shared/state-trend/classify.ts` — replace the body: split by DATE (28/28), average each half,
  compare. Keep the `TrendResult` shape (verdict, pctChange, earlyAvg, recentAvg, window, points,
  sampleCount, newestAgeDays, stale=false, minSessions=1) so every consumer still reads it.
- `_shared/state-trend/thresholds.ts` — windowDays 56 all; improvePct/slidePct/freshness/minSessions
  machinery removed; `resolveThresholds` returns the one shape. Delete `BASE_FRESH`, `REF_SPW`.
- Callers passing `noiseGuardStdev` / `directionFloor` / `endpointWindow` (bike.ts, bike-fitness.ts,
  run.ts, strength.ts, swim.ts): drop the opts. `directionFloor`'s `withheld` verdict goes with it.
- Client: `sport-summary.ts recentMedian` → a 28-day average helper; `StrengthReadCards.tsx` and
  `StatePerformanceSection.tsx` headline call sites; `TrendSparkline.tsx` single colour, label
  "last 12 weeks".
- `compute-snapshot` bumps `COACH_PAYLOAD_VERSION`; client gate bumps with it.
- Tests: `classify-boundary`, `classify-noise-guard`, `classify-recently-flat`, `bike-noise-guard`,
  `run-cadence-population`, `strength-fitness` — rewrite to the 28/28 rule; delete the ones that
  test deleted machinery. `sport-summary.test.ts` for the headline.
- `docs/STATE-SOURCES.md`: every OURS row in the trends section becomes FIELD or is removed.

## Blast radius

Every discipline's trend verdict changes shape → the coach's copy that reads `improving/holding/
sliding` (state-trend `display`, coach narrative facts) keeps working (same verdict words), but
`withheld` disappears and `recentlyFlat` disappears; grep both and remove their branches.

## Acceptance

1. Unit tests for the 28/28 rule: up, down, equal-at-precision, one half empty → no arrow.
2. Reference athlete after deploy: screenshot the closed STRENGTH / RUN / BIKE rows with arrows, and
   the open cards with single-colour lines. Every headline equals the mean of that series' last 28
   days, recomputed by hand from the stored points (the same check done on 2026-09-04 for medians).
3. `docs/STATE-SOURCES.md` has zero OURS rows in the trends section.
