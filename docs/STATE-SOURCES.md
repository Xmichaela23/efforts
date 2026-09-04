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
| **Headline = median of the last 5 steady sessions** | `sport-summary.ts recentMedian` | **OURS** — a headline needs one number; nobody in the field prints one (they plot every session). Median so one bad day cannot own it. Display choice. |
| **"Recent 6 weeks in colour"** | `StrengthReadCards.tsx RECENT_WINDOW_MS` | **OURS** — display choice, half the window. |
| Hard ride left out of the aerobic trend when best-20-min ≥ 90% FTP | `bike-fitness.ts THRESHOLD_FTP_FRACTION` | FIELD — Coggan zone 4 floor |
| **Ride needs ≥ 10 min in the aerobic band to count for efficiency** | `bike-fitness.ts MIN_EFFICIENCY_IN_BAND_S` | **OURS** — a floor for a per-ride HR-at-power read to mean anything. |
| e1RM = w × 36 ÷ (37 − reps) | `compute-facts`, `estimate-1rm.ts` | FIELD — Brzycki |
| Lift chart shows up to 52 weeks | `assemble.ts STATE_TREND_WINDOWS` | FIELD — Hevy / Fitbod ranges |
| **Trend verdict cut-offs (improving/sliding): ±2% run & bike, +2.5/−2 strength, ±1.5 swim; 6-week run/strength, 8-week bike/swim windows** | `state-trend/thresholds.ts UNIVERSAL` | **OURS** — from the June 2026 audit (Q-052), no outside source. Drives the arrows. |
| **Freshness (how long a trend stays current): 7–35 days scaled to the athlete's own cadence** | `state-trend/thresholds.ts BASE_FRESH / REF_SPW` | **OURS** — Q-052, calibrated on the development cohort. |
| Signal-vs-noise: a direction must clear 1 SD of its own scatter | `bike-fitness.ts`, `run.ts`, `strength.ts` | FIELD-adjacent — 20-min power CV ≈ 2.9% (IJSPP 2019); 1.0 SD is the bar all three disciplines share |

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
