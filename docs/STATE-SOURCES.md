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
| Which sessions are on the drift line: steady only — a run is OFF the line only if it was an interval session (>2 planned steps, or the grader's `interval` verdict). The analyser's mixed-effort stamp is a hedge, never a filter | `compute-snapshot driftReadForPoint` | FIELD — Friel: Pa:Hr applies to steady aerobic efforts; TrainingPeaks prints it per workout with no verdict. D-372 item 3 (restored 2026-09-04 after a0ca339a re-added the stamp as a filter and blanked the run line) |
| Drift per session = first half vs second half, warm-up skipped, 5% line | `analyze-running-workout/lib/heart-rate/efficiency.ts`, `ride-physiology.ts` | FIELD — Friel; TrainingPeaks Pa:Hr / Pw:Hr; the 5% line is Friel and Viada p107 (a plan rule — reports and flags only, never a filter: D-372) |
| Drift is a trend, one dot per session | `StrengthReadCards.tsx`, `TrendSparkline.tsx` | FIELD — TrainingPeaks dashboard trend; intervals.icu per-activity points |
| 12-week trend window | `TrendSparkline.tsx` | FIELD — TrainingPeaks 90-day default |
| Headline = the value of a straight line fitted through the last 12 weeks (start → today), never one session | `sport-summary.ts fitTrend`, `StrengthReadCards.tsx`, `StatePerformanceSection.tsx` | FIELD — TrainingPeaks EF/Pa:Hr per workout; the fitted trendline is WKO5's chart trendline (least squares). Replaced the single-session headline 2026-09-04 (which had itself replaced the 28-day Garmin average) |
| One colour on the line, a dot per session | `TrendSparkline.tsx` | FIELD — TrainingPeaks / intervals.icu |
| Fitted trendline through the dots + "start → end" caption | `sport-summary.ts fitTrend`, `TrendSparkline.tsx` | FIELD — WKO5 chart trendline (least squares); TrainingPeaks' dashboard is bare dots, WKO5 adds the fitted line |
| Ride counts for the efficiency trend when it has ≥ 10 min in the aerobic band — any type, any intensity | `bike-fitness.ts MIN_EFFICIENCY_IN_BAND_S` | FIELD — Garmin: the fitness estimate updates from any ride with ≥10 min at aerobic intensity. (The type gate and the 90%-FTP "hard ride" exclusion were removed 2026-09-04.) ⚠️ The one Garmin rule left on the screen: it picks which rides are steady, it does not compute the number |
| Easy / hard pace rows = median of the group's last five runs' recorded pace and HR | `run.ts recentGroupPaceHr` | Recorded values. The warm-up stand-in (a hard run's warm-up joining the easy pool, `warmup_easy`) was **OURS** and was removed 2026-09-04 evening from `compute-snapshot` (both the spine and `runEffHistory`) |
| e1RM = average of Epley and Brzycki, nearest 5 lb | `estimate-1rm.ts estimate1RMRounded` | FIELD — Viada Module 3 / p215: average two or three formulas for a range; a true single returns as-is |
| Lift chart shows up to 52 weeks | `assemble.ts STATE_TREND_WINDOWS` | FIELD — Hevy / Fitbod ranges |
| Trend arrow ↑ → ↓ and the verdict words (up / down / needs data / holding) | — | **OFF EVERY ATHLETE SURFACE (2026-09-04 evening).** Garmin's three states (28 days vs the 28 before) over TrainingPeaks' EF — two products on one number. `state-trend/classify.ts` still computes the 28/28 verdict; State's dot blocks print label + dot + count, the session screen's "discipline trend" chip is removed, and the coach makes no direction claim (`fitness_direction` null). Data, not copy |
| FTP over time on the bike row: one dot per stored FTP reading in the 12-week window, the fitted trendline through them, caption "FTP over N weeks: X → Y" | `compute-snapshot` (`bikeFitness.ftpHistory` from `fitness_baselines`), `StatePerformanceSection.tsx BikeFitnessRow`, `TrendSparkline.tsx` | FIELD — TrainingPeaks threshold history ("track previous thresholds": FTP plotted as it changes); WKO5 sFTP history chart; the fitted line is WKO5's chart trendline (least squares, the same `fitTrend` as efficiency and drift). **Replaced the dot 2026-09-04** — "position in your own 12-week min/max" (`position-in-range.ts`, OURS) is off the bike row; the function still serves the run-decoupling and strength ranges, neither on screen. Fewer than two readings → the number alone, no line |
| 56-day window, every discipline | `thresholds.ts TREND_WINDOW_DAYS` | FIELD — Garmin, two 4-week halves |
| "provisional" tag: 3–4 sessions in the window, or all inside 21 days | `bike-fitness.ts isProvisionalTrend` | **OURS** — no longer rendered on State (2026-09-04 evening); still on the payload |
| Race-projection gate: ≥ 8 observed runs | `assemble.ts projectionMinRuns`, `compute-snapshot` | **OURS** — a count with no outside source; gates a projected race time, not an arrow (was the run direction floor) |

| Heat note on the run and ride cards, shown when a session in the window was ≥ 72°F | `StrengthReadCards.tsx` | FIELD — 72°F / 22°C is Garmin's heat-correction cut-off; TrainingPeaks applies no correction; Friel: compare like with like. The sentence is fixed text, not generated. |

| Which session a run was (easy / long / interval) | `compute-facts classifyRunIntent` | The plan's own tag on the planned session, stamped onto the workout (`workout_metadata.plan_tags`) so it survives a plan rebuild; no plan word → grouped as easy, no inference. Michael, 2026-09-02/04. |

| Easy/hard row pace | `compute-snapshot`, `state-trend/run.ts` | FIELD — grade-adjusted pace (TrainingPeaks NGP) when the run has elevation; raw recorded pace otherwise (TrainingPeaks' own fallback), flagged "flat pace, no elevation". |
| Which runs are graded interval vs easy | `compute-facts classifyRunIntent` reads `workout_analysis.classified_type` | FIELD — the analyser's auto-detection from interval structure + name (Garmin/Strava/TrainingPeaks all auto-detect); heart rate ≥90% LTHR is the secondary rung when no plan/detection — 90% is Friel's Z2/Z3 run-zone boundary (Z2 85-89, Z3 90-94), the same zone table workload.ts reads, FIELD not ours. |

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

## Wizard · "Know your numbers?" (D-467)

| Number | Where | Source |
|---|---|---|
| Working number from a number on file = 1RM × 0.96 | `working-number.ts workingNumberFromFile` | FIELD — Viada p215, the same fraction the test read uses |
| Week-one retest placement: run test on day 3, FTP test on day 5 of the block | `src/lib/baseline-tests.ts RETEST_OFFSET_DAYS` | **OURS** — the book says only "no hard training 48 hours prior" (p210, p212); the day inside week one is this app's choice |
