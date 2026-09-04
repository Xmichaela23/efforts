# STATE-SOURCES — every number on the State screen, and where it comes from

**Rule (2026-09-04, Michael):** no number, threshold, window or formula reaches the State screen
without a source beside it in the code — or an explicit `OURS` marker with the reason and a row here.
Say "ours" the first time it comes up. A number borrowed from one context (a plan rule, a reporting
threshold) is not licensed as a filter in another.

Legend: **FIELD** = an outside source the code cites · **OURS** = no outside source; the reason is
stated and it is a decision Michael can reverse.

## Trends section

| Number | Where | Source |
|---|---|---|
| Efficiency factor, ride = normalized power ÷ avg HR | `compute-facts` | FIELD — TrainingPeaks EF |
| Efficiency factor, run = grade-adjusted pace ÷ avg HR | `compute-facts` | FIELD — TrainingPeaks EF on NGP |
| Grade-adjusted pace | `_shared/gap.ts` | FIELD — TrainingPeaks NGP |
| Drift per session = first half vs second half, warm-up skipped, 5% line | `analyze-running-workout/lib/heart-rate/efficiency.ts`, `ride-physiology.ts` | FIELD — Friel; TrainingPeaks Pa:Hr / Pw:Hr; the 5% line is Friel and Viada p107 (a plan rule — reports and flags only, never a filter: D-372) |
| Drift is a trend, one dot per session | `StrengthReadCards.tsx`, `TrendSparkline.tsx` | FIELD — TrainingPeaks dashboard trend; intervals.icu per-activity points |
| 12-week trend window | `TrendSparkline.tsx` | FIELD — TrainingPeaks 90-day default |
| Headline = average of the last 28 days | `sport-summary.ts recentAverage`, `StrengthReadCards.tsx`, `StatePerformanceSection.tsx` | FIELD — Garmin: the number shown is the current 4-week estimate, the same half the trend arrow reads |
| One colour on the line, a dot per session | `TrendSparkline.tsx` | FIELD — TrainingPeaks / intervals.icu |
| Hard ride left out of the aerobic trend when best-20-min ≥ 90% FTP | `bike-fitness.ts THRESHOLD_FTP_FRACTION` | FIELD — Coggan zone 4 floor |
| Ride needs ≥ 10 min in the aerobic band to count for efficiency | `bike-fitness.ts MIN_EFFICIENCY_IN_BAND_S` | FIELD — Garmin: VO2 max updates only from a ride with ≥ 10 min at ≥ 70% max HR |
| e1RM = w × 36 ÷ (37 − reps) | `compute-facts`, `estimate-1rm.ts` | FIELD — Brzycki |
| Lift chart shows up to 52 weeks | `assemble.ts STATE_TREND_WINDOWS` | FIELD — Hevy / Fitbod ranges |
| Trend arrow ↑ → ↓: the average of the last 28 days against the average of the 28 days before; higher ↑, lower ↓; the same digits at the metric's displayed precision (efficiency 3 decimals, drift 0.1%, pace to the second, watts and e1RM whole) →; blank only when one half has no session | `state-trend/classify.ts`, `thresholds.ts TREND_HALF_DAYS`, each caller's `precision` | FIELD — Garmin VO2 max / Training Status: the last 4 weeks against the 4 before, recomputed on every activity; VO2 max is shown as a whole number and the arrow reads → (maintaining) when the shown number has not moved. No percent band, no noise gate, no freshness decay, no cadence floor (all four were ours — Q-052 — deleted 2026-09-04) |
| The run row's arrow reads the aerobic spine — the same points the headline averages; the heat-adjusted fit (D-346) is a receipt, not the verdict | `assemble.ts runEffSeries` | FIELD — Garmin, as above (ruling 2026-09-04) |
| 56-day window, every discipline | `thresholds.ts TREND_WINDOW_DAYS` | FIELD — Garmin, two 4-week halves |
| "provisional" tag: 3–4 sessions in the window, or all inside 21 days | `bike-fitness.ts isProvisionalTrend` | **OURS** — not in the 2026-09-04 sweep; flagged, untouched |
| Race-projection gate: ≥ 8 observed runs | `assemble.ts projectionMinRuns`, `compute-snapshot` | **OURS** — a count with no outside source; gates a projected race time, not an arrow (was the run direction floor) |

## FTP

| Number | Where | Source |
|---|---|---|
| Power-curve read: critical-power fit over 2–20 min, ≥ 3 durations, W′ 5–40 kJ, r² ≥ 0.9, FTP = 0.97 × CP | `src/lib/bike-ftp-estimator.ts` | FIELD — Hill 1993, Jones 2010, Vanhatalo 2011; TrainerRoad / intervals.icu practice |
| Power only — no heart-rate read, no steady-minutes rule | `bike-ftp-estimator.ts compoundFtp` | FIELD — TrainerRoad AI FTP Detection and intervals.icu eFTP are power-only (Michael, 2026-09-04: "just do what intervals.icu and TrainerRoad do"). A heart-rate read with a 15-minute floor (OURS) was built and removed the same night. |
| Hard ceiling = best 20-min actually pedalled, 18 months | learner STEP 5 | **OURS** — the one number that does not extrapolate; 18 months = the run threshold's own window |
| Rate limit ± 5% per learn | `bike-ftp-estimator.ts rateLimitFtp` | **OURS** — no athlete's zones move in one step |
| Proposed, then accepted; auto is the default | resolver, checkpoint, Baselines | FIELD — TrainerRoad (validated on 22,000 athletes; default auto with accept) |
| Fallback when both reads abstain: 95% × best 20-min | learner STEP 4 | FIELD — Coggan 20-min test |

## Load (top of State)

| Number | Where | Source |
|---|---|---|
| Fitness 42-day / fatigue 7-day / form | `ride-physiology.ts` | FIELD — Banister; TrainingPeaks PMC |
| ACWR | `workload.ts`, reconciler | FIELD — Gabbett; the verdict bands are the reconciler's (see DECISIONS-LOG) |

## Not yet swept
Easy/hard pace rows, BODY effort and soreness, the week-execution bars. Add rows when touched.
