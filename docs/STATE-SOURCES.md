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
| Headline = the LAST steady session's EF / drift, with its date | `sport-summary.ts latestPoint`, `StrengthReadCards.tsx`, `StatePerformanceSection.tsx` | FIELD — TrainingPeaks: EF and Pa:Hr are per-workout numbers in the workout summary; the dashboard trends them. (2026-09-04 evening, one reference per metric: replaces the 28-day average, which was Garmin's window under a TrainingPeaks formula) |
| One colour on the line, a dot per session | `TrendSparkline.tsx` | FIELD — TrainingPeaks / intervals.icu |
| Ride counts for the efficiency trend when it has ≥ 10 min in the aerobic band — any type, any intensity | `bike-fitness.ts MIN_EFFICIENCY_IN_BAND_S` | FIELD — Garmin: the fitness estimate updates from any ride with ≥10 min at aerobic intensity. (The type gate and the 90%-FTP "hard ride" exclusion were removed 2026-09-04.) ⚠️ The one Garmin rule left on the screen: it picks which rides are steady, it does not compute the number |
| Easy / hard pace rows = median of the group's last five runs' recorded pace and HR | `run.ts recentGroupPaceHr` | Recorded values. The warm-up stand-in (a hard run's warm-up joining the easy pool, `warmup_easy`) was **OURS** and was removed 2026-09-04 evening from `compute-snapshot` (both the spine and `runEffHistory`) |
| e1RM = w × 36 ÷ (37 − reps) | `compute-facts`, `estimate-1rm.ts` | FIELD — Brzycki |
| Lift chart shows up to 52 weeks | `assemble.ts STATE_TREND_WINDOWS` | FIELD — Hevy / Fitbod ranges |
| Trend arrow ↑ → ↓ and the verdict words (up / down / needs data / holding) | — | **OFF EVERY ATHLETE SURFACE (2026-09-04 evening).** Garmin's three states (28 days vs the 28 before) over TrainingPeaks' EF — two products on one number. `state-trend/classify.ts` still computes the 28/28 verdict; State's dot blocks print label + dot + count, the session screen's "discipline trend" chip is removed, and the coach makes no direction claim (`fitness_direction` null). Data, not copy |
| The dot: position in the 12-week range (`FitnessDotBlock`) | `state-trend/position-in-range.ts` | **OURS** — pre-existing; not a two-product mix, left on the screen and named here |
| 56-day window, every discipline | `thresholds.ts TREND_WINDOW_DAYS` | FIELD — Garmin, two 4-week halves |
| "provisional" tag: 3–4 sessions in the window, or all inside 21 days | `bike-fitness.ts isProvisionalTrend` | **OURS** — no longer rendered on State (2026-09-04 evening); still on the payload |
| Race-projection gate: ≥ 8 observed runs | `assemble.ts projectionMinRuns`, `compute-snapshot` | **OURS** — a count with no outside source; gates a projected race time, not an arrow (was the run direction floor) |

## FTP

| Number | Where | Source |
|---|---|---|
| Power-curve read: critical-power fit over 2–20 min, ≥ 3 durations, W′ 5–40 kJ, r² ≥ 0.9, FTP = 0.97 × CP | `src/lib/bike-ftp-estimator.ts` | FIELD — Hill 1993, Jones 2010, Vanhatalo 2011; TrainerRoad / intervals.icu practice |
| Power only — no heart-rate read, no steady-minutes rule | `bike-ftp-estimator.ts compoundFtp` | FIELD — TrainerRoad AI FTP Detection and intervals.icu eFTP are power-only (Michael, 2026-09-04: "just do what intervals.icu and TrainerRoad do"). A heart-rate read with a 15-minute floor (OURS) was built and removed the same night. |
| Hard ceiling = best 20-min actually pedalled, 18 months | — | **DELETED 2026-09-04 evening** (was OURS) — `compoundFtp` takes the fit alone |
| Rate limit ± 5% per learn | — | **DELETED 2026-09-04 evening** (was OURS) — `rateLimitFtp` is gone |
| ⚠️ intervals.icu's eFTP model | `bike-ftp-estimator.ts fitCriticalPower` | UNVERIFIED — intervals.icu and TrainerRoad pages are blocked from the build container; the 2-parameter CP fit on 2–20 min and 0.97 × CP are cited to Hill / Jones / Vanhatalo and Morgan 2019, not to intervals.icu's page. Q-298 |
| Proposed, then accepted; auto is the default | resolver, checkpoint, Baselines | FIELD — TrainerRoad (validated on 22,000 athletes; default auto with accept) |
| Fallback when both reads abstain: 95% × best 20-min | learner STEP 4 | FIELD — Coggan 20-min test |

## Load (top of State)

| Number | Where | Source |
|---|---|---|
| Fitness (CTL, 42-day EWMA) · fatigue (ATL, 7-day) · form (yesterday's CTL − ATL), over the athlete's whole history | `_shared/fitness-fatigue.ts computeFitnessFatigue`, coach `load.fitness_fatigue`, `LoadBar.tsx` | FIELD — TrainingPeaks Performance Management Chart, exactly (2026-09-04 evening: THE load read on State; the coach's fetch widened from 84 days to all history) |
| Form zone word: transitional > +25, fresh +5..+25, grey zone −10..+5, optimal −30..−10, high risk < −30; a value on the line takes the zone below | `fitness-fatigue.ts formZone` | FIELD — Friel "Managing Training Using TSB", as the TrainingPeaks PMC legend reproduces it. The on-the-line rule is a reading of a printed range, stated in the code |
| ACWR and the reconciled load word ("balanced") | `_shared/acwr.ts`, `load-status-reconcile.ts`, coach payload | **OFF EVERY ATHLETE SURFACE (2026-09-04 evening)** — Gabbett's ratio and the app's reconciler are neither product's rule. The coach's week verdict, title, kicker, label, receipts and narrative facts read Form (TSB) instead; ACWR is withdrawn as an input to the readiness word, the marathon read, the week accent and the LLM context. `load.acwr` stays on the payload as data nothing prints |
| Strength workload = minutes ÷ 60 × RPE × 10; RPE = session rating, else 10 − avg logged RIR; nothing → 0 | `workload.ts calculateStrengthWorkload`, `strengthSessionRpe`, planned mirror `calculatePlannedStrengthWorkload` | FIELD — Friel "Estimating Training Stress Score" (TrainingPeaks); RIR → RPE Zourdos 2016. Replaces tonnage ÷ 10,000 × intensity² (OURS) 2026-09-04 evening. ⚠️ Stored strength points are on the old scale until `backfill-strength-load` runs. ⚠️ No hrTSS for a strength session with heart rate: the app holds no strength threshold heart rate; the rating rung applies |
| Rating fallback for cardio: TSS per hour = rating × 10 | `workload.ts mapRPEToIntensity` | FIELD — Friel's table (RPE 1 → 10/hr … 10 → 100/hr) |

## BODY
Effort and soreness rows: **REMOVED from State 2026-09-04 evening** (Foster + our 7-vs-28 comparison; Hooper + our z-score — neither product's rule). Server computation untouched, coach still reads it.

## Not yet swept
The week-execution bars (a count). Add rows when touched.
