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

| One chart template: label · big number · qualifier · chart · "over N weeks: start → end" · coverage · key | `TrendSparkline.tsx` | Layout is the app's (2026-09-05, Michael: "burying the lead"). Numbers unchanged; the fitted line is WKO5's. |
| Athlete-set row order (reorder, up/down arrows) | `StatePerformanceSection.tsx`, `user_baselines.ui_prefs.state_row_order` | FIELD — Garmin Connect reorderable cards; TrainingPeaks reorderable dashboard charts. Default = goal-led order. |
| Deload week = the TAPER/DELOAD column, deployed by the athlete from Adjust | `rematerialize-standing-block` (`taper_weeks`), `compose.ts composeBlock` | FIELD — Viada p274 (the column), p120 (never scheduled: overreach-to-deload rejected), p247 (switch to it two weeks out from a race or meet) |
| Adjust tab edits (lifts → `locked_baselines`; FTP → `performance_numbers.ftp` + `ftp_source`; threshold pace → `threshold_pace_min_per_mi` + source; threshold HR → `configured_hr_zones.manual_run_lthr` + `lthr_source`) | `StateAdjustLens.tsx` via `AppContext.saveUserBaselines` | The same save Training Baselines uses; no second write path. |
| Post-ride / post-run popup: a new measured FTP or threshold pace shows with accept | `PostWorkoutFeedback.tsx` | FIELD — TrainerRoad and Garmin surface a detected FTP as a card with accept. The learner runs when the popup opens so the number is fresh. |

## FTP

| Number | Where | Source |
|---|---|---|
| Power-curve read: critical-power fit over 2–20 min, ≥ 3 durations, W′ 5–40 kJ, r² ≥ 0.9, FTP = 0.97 × CP | `src/lib/bike-ftp-estimator.ts` | FIELD — Hill 1993, Jones 2010, Vanhatalo 2011; TrainerRoad / intervals.icu practice |
| Power only — no heart-rate read, no steady-minutes rule | `bike-ftp-estimator.ts compoundFtp` | FIELD — TrainerRoad AI FTP Detection and intervals.icu eFTP are power-only (Michael, 2026-09-04: "just do what intervals.icu and TrainerRoad do"). A heart-rate read with a 15-minute floor (OURS) was built and removed the same night. |
| Hard ceiling = best 20-min actually pedalled, 18 months | — | **DELETED 2026-09-04 evening** (was OURS) — `compoundFtp` takes the fit alone |
| Rate limit ± 5% per learn | — | **DELETED 2026-09-04 evening** (was OURS) — `rateLimitFtp` is gone |
| ⚠️ intervals.icu's eFTP model | `bike-ftp-estimator.ts fitCriticalPower` | UNVERIFIED — intervals.icu and TrainerRoad pages are blocked from the build container; the 2-parameter CP fit on 2–20 min and 0.97 × CP are cited to Hill / Jones / Vanhatalo and Morgan 2019, not to intervals.icu's page. Q-298 |
| 5-minute all-out FTP test | `_shared/baseline-test-rows.ts ftp5MinTestRow` | FIELD — Viada, course Module 3: the 5-minute test is more repeatable (no pacing strategy). The module's ~80%-of-5-min extrapolation is NOT a second FTP formula here: the effort lands as the 5-min point on the power-duration curve and the one FTP rule (the CP fit) reads it. |
| Run threshold pace: proposed, then accepted | `resolve-current-run-pace.ts` (accepted tier, `pendingRunThresholdProposal`, `acceptLearnedRunThreshold`); the learner seeds/keeps `run_threshold_pace_accepted`; accept on Adjust, the post-run popup, the checkpoint | FIELD — the same proposed-then-accepted door as FTP (TrainerRoad; Garmin's detected-threshold prompt). A learned value never re-prices the plan on its own. 2026-09-05. |
| Proposed, then accepted; auto is the default | resolver, checkpoint, Baselines | FIELD — TrainerRoad (validated on 22,000 athletes; default auto with accept) |
| Fallback when both reads abstain: 95% × best 20-min | learner STEP 4 | FIELD — Coggan 20-min test |

## Load (top of State)

| Number | Where | Source |
|---|---|---|
| Fitness (CTL, 42-day EWMA) · fatigue (ATL, 7-day) · form (yesterday's CTL − ATL), over the athlete's whole history | `_shared/fitness-fatigue.ts computeFitnessFatigue`, coach `load.fitness_fatigue`, `LoadBar.tsx` | FIELD — TrainingPeaks Performance Management Chart, exactly (2026-09-04 evening: THE load read on State; the coach's fetch widened from 84 days to all history) |
| The week's change beside fitness / fatigue / form (+3, −2) and the one-line key under the LOAD row | `LoadBar.tsx`, coach `load.fitness_fatigue.week_ago` | FIELD — intervals.icu's fitness tile prints the 7-day delta; the key is TrainingPeaks' own definitions (Fitness = 42-day, Fatigue = 7-day, Form = Fitness − Fatigue). 2026-09-05, Michael: "hard with no context". |
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
| A lifting session's header length: 2 to 4 seconds a rep under the bar, plus the logger's rest clock per set, rounded to five-minute steps | `_shared/strength-session-minutes.ts SEC_PER_REP_LOW/HIGH` (sent as get-week `planned_duration_label`) | **OURS** — the source gives no tempo or time-under-tension figure; 2 s is a brisk controlled rep, 4 s the slow end field guidance gives for hypertrophy work. The rest seconds under it are `_shared/strength/rest-seconds.ts` `REST_MINUTES_ARE_OURS` (stamped on each row as `rest_seconds`) |
| Week-one retest placement: run test on day 3, FTP test on day 5 of the block (inserted by the server with the plan, labelled with the plan week the day falls in: `create-goal-and-materialize-plan/week-one-tests.ts`) | `_shared/baseline-test-rows.ts RETEST_OFFSET_DAYS` | **OURS** — the book says only "no hard training 48 hours prior" (p210, p212); the day inside week one is this app's choice |
| Run MLSS level-2 round: 45 s @ 125% / 45 s @ 115% / 30 s @ 100% / 1:30 @ VT1; 2 sets of 4; 2 min between sets | `endurance-library/source-rules.ts long_surge_float` (`hold` step) + `generate.ts mkRepeat` | FIELD — Viada p232, step for step. Before 2026-09-05 the float was sampled from a 45–60 s range the page does not give and the 30 s at threshold was missing (both were OURS, now removed) |
| MLSS row text: time above threshold, fatigue spread evenly, hills allowed if the effort is held; no effort number | `standing-plan/session-vocabulary.ts describeSession` | FIELD — Viada p231 in substance, not copied. The old line described threshold pace and the "Effort 8–10 of 10" was OURS (2026-09-02); both removed 2026-09-05. The near-threshold "Effort 5–6" remains OURS |
| Easy pace on Adjust and the reference pace on easy steps = median of the athlete's last five easy runs (`learned_fitness.run_easy_pace_sec_per_km`, five on file); threshold × 1.19 only until there are five | `learn-fitness-profile` easy block · `src/lib/resolve-current-run-pace.ts resolveCurrentRunEasyPace` | FIELD — Garmin/TrainingPeaks/80-20 prescribe easy by heart rate and show pace as a readout; the readout is the athlete's own runs. The 1.19 fallback sits at Daniels' fast edge (1.21–1.30) and Friel's zone-2 top (1.14). No accept step: easy prescribes nothing. State's easy row is its own last-five median over the classified easy group; the two can differ by seconds when the groups pick different runs |
| Easy-step heart-rate range on the calendar = Friel Z2 off threshold HR, 85%–89% (129–135 at 152) | `_shared/endurance/hr-zones.ts frielZones` → `src/lib/friel-zones.ts frielRunZones` | FIELD — Friel; one table for Profile, learner, grader and calendar (2026-09-06; the calendar copy topped Z2 at 90% and is gone) |

## Race plan · course strategy and the long-run readiness block (2026-09-07, no-AI work order)

| Number | Where | Source |
|---|---|---|
| Per-group race pace = flat race pace × Minetti metabolic cost of the group's average grade, flat pace solved so the distance-weighted paces sum to the anchor finish | `_shared/course-strategy-build.ts runGradeTimeFactor` via `_shared/gap.ts` | FIELD — Minetti et al. 2002, J Appl Physiol 93:1039 (the GAP model already on the run readouts) |
| Bike-leg grade cost: +10 s/mi per % up (cap 60), −6 s/mi per % down (cap −20) | `course-strategy-build.ts bikeGradeTimeFactor`, `course-detail` terrain-adjusted finish | **OURS** — the linear heuristic the terrain-adjusted finish already used; cycling plan is a future build |
| Pace band ±2.5% around the group pace | `course-strategy-build.ts PACE_BAND_FRACTION` | **OURS** — wide enough to read as a range on a watch, narrow enough that the band mid-points still add up to the finish |
| Race heart-rate band: marathon Z3, half Z4, ≤10K top zone, from the athlete's configured zones | `course-strategy-build.ts raceHrBand` | FIELD — Friel run zones by %LTHR (Total Heart Rate Training) |
| Race heart-rate band with no zones on file: %maxHR marathon 80–88, half 85–92, 10K 88–94, 5K 92–97 | `course-strategy-build.ts raceHrBand` | **OURS** — common %maxHR ranges; replaced by the athlete's zones as soon as they exist |
| Fuel note: 30–60 g carbohydrate/h for 1–2.5 h efforts, 60–90 g/h beyond, first at ~45 min | `course-strategy-build.ts fuelNoteFor` | FIELD — Jeukendrup 2014, Sports Med 44:S25; ACSM/AND/DC 2016 position stand |
| Display groups: 7 for ≥20 mi, 6 for ≥12, 5 for ≥8, 4 for ≥5, else 3; late race = last 30% of distance | `course-strategy-build.ts targetGroupCount` | **OURS** — the group counts the old prompt asked for, kept so the course screen reads the same |
| "First 2–3 miles 15–20 s/mi slower than goal pace" when the session has no pace or heart-rate anchor | `session-detail/race-readiness.ts raceReadinessDeterministicFallback` | **OURS** — the pre-existing fallback line; common coaching guidance, no single citation |
| Ride heart-rate readings (Pw:Hr decoupling, cardiac drift) are withheld when the two halves' pedalling power differ by more than 10% | `_shared/ride-halves-steady.ts` | **OURS** — TrainingPeaks/Friel: Pw:Hr is for steady aerobic rides, no numeric cut published; the structural twin is D-372 (>2 planned steps). Negative decoupling ≤ −5% now reads "rose", not "held steady" |
| Job retry schedule: 1 / 5 / 25 minutes after the 1st / 2nd / 3rd failed attempt; 3 attempts, then failed | `_shared/jobs.ts DEFAULT_BACKOFF_MINUTES`, `DEFAULT_MAX_ATTEMPTS` | **OURS** — a ×5 exponential backoff, the shape most queue defaults use; three tries covers a gateway blip and a one-off compute death |
| Alarm emails: at most one per kind per 15 minutes (the rest only in `alarms`) | `_shared/alarm.ts ALARM_EMAIL_WINDOW_MS` | **OURS** — a dead analyser fails every ride; one message says so |
| An `analyzing` / `pending` analysis older than 10 minutes reads as "did not finish" | `src/lib/analysis-state.ts STALLED_AFTER_MS` | **OURS** — four times the edge runtime's 150 s wall-clock cap (Supabase docs), so a chain still inside its limit is never called stalled |
| run-jobs stops claiming after 40 s; one job may take at most 90 s | `run-jobs/index.ts CLAIM_BUDGET_MS`, `JOB_TIMEOUT_MS` | **OURS** — keeps a tick inside the gateway limit; the next minute takes the rest |
| Rest after a warm-up set = 60 s (the work's rest is 90–180 s by intent) | `_shared/strength/rest-seconds.ts WARMUP_REST_SEC` (stamped as `warmup_rest_seconds`), `StrengthLogger.tsx autoStartRestForSet` | OURS — a warm-up is not the work; Strong/Hevy run warm-up sets on a short timer | 2026-09-07 |
| Post-workout feedback asks only about a run or ride dated today or yesterday (36 h) | `check-feedback-needed/index.ts` | OURS — the 7-day window surfaced rows a history pull had just created for old dates | 2026-09-07 |
| Two sessions on one date: "Six to eight hours apart" | `TodaysEffort.tsx` under the day's sessions | Viada p108 (6–8 h between two-a-days; the 4–6 h short-easy-morning case not shown) | 2026-09-08 |
| Braced hinge (p274 days 2, 5) admits the reverse hyper family by name; home default Weighted Reverse Hyper | `standing-plan/frames.ts alsoAdmits` on both slots | Viada p221 (braced hinge lower: reverse hyperextension first) | 2026-09-08 |
| Exercise how-to lines (back extension, leg curl, chest-supported row, reverse hyper, calf raise) | `strength-grid/grid.ts EXECUTION_HOW_TO` | OURS — Michael's words, from Strong/Hevy exercise cards and field sources; not the book | 2026-09-08 |
| DE cue "move the bar fast" on barbell rows, "move fast" on the rest | `StrengthLogger.tsx intentLine` | Viada p218 (DE = submaximal load, maximal speed); the wording split is OURS | 2026-09-08 |
| Rebuild replaces an accessory movement whose cell answer changed; never deletes, never a done session | `standing-plan/restate.ts` | OURS — rebuild rule, 2026-09-08 | 2026-09-08 |
| The plan adds no row the page does not print: muscle floor and core-pick placement OFF | `standing-plan/compose.ts ATHLETE_ADDITIONS_ON` | Michael 2026-09-08: no rules of ours, only the book's; anything more is added in the logger on the day | 2026-09-08 |
| HYP row cue: "8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes." No add-weight trigger | `strength-focus-copy.ts STANDING_ACCESSORY_SET_CUE`, `advance-nudge.ts` | Viada p86 (1–2 RIR, 8–10 preferred), p218 (reps slow), p111 (overload is not more weight each session). The top-of-band add-weight trigger was OURS and is removed. Words Michael's, 2026-09-09 | 2026-09-09 |
| Power zones on Profile and the ride analysis: seven levels, Z2 from 56% of FTP | `_shared/endurance/display-zones.ts`, sent by `save-baselines` | FIELD — Allen & Coggan power training levels (TrainingPeaks "Power Training Levels") | 2026-09-10 |
| Swim pace bands at +12 / +8 / +3 / −2 s per 100 from threshold | `_shared/endurance/display-zones.ts`, sent by `save-baselines` | **OURS** — no outside source; `docs/SWIM-PROTOCOL.md` §7.3 cites nothing and gives different offsets (Recovery +15 or slower, Endurance +8 to +15) | 2026-09-10 |
| Workout chart smoothing: pace 60 s (min 10 m), heart rate 15 s, cadence 30 s, power 30 s, VAM 60 s, grade over 100 m (min 20 m); climb counted in 1.5 m steps over 20 m, scaled to end on the recorded gain | `compute-workout-analysis/display-series.ts` | **OURS** — display smoothing with no outside source (the pace, grade and climb figures moved unchanged from the phone chart) | 2026-09-10 |
| A chart's fitted trend needs 3 points or more ("too few" below) | `_shared/state-trend/trend-fit.ts TREND_FIT_MIN_POINTS` | **OURS** — moved unchanged from the phone | 2026-09-10 |
| Logged sets on State: last 8 weeks, a lift listed from 2 sessions, 5 recent sets; 5 main lifts and 8 others shown | `_shared/state-trend/logged-sets.ts`, `coach/strength-logged-sets.ts` | **OURS** — moved unchanged from the phone | 2026-09-10 |
| Folding a lift variant into its slot allows 0.5 lb when matching the latest reading | `_shared/state-trend/fold-lift-slots.ts` | **OURS** — moved unchanged from the phone | 2026-09-10 |
| Interval colour on the Performance tab: pace within 5 s of the range reads in; watts against the planned range | `_shared/session-detail/interval-compare.ts` (`intervals[].executed.band`) | **OURS** — the 5 s is the running analyzer's "within GPS noise" allowance, uncited there too | 2026-09-10 |
| Goal-race interval view: 90–110% on, 80–120% near, capped at 100; projection 0.5 s/mi ahead, 60 s/mi behind; pacing variability cut-offs 3 / 7 / 10 | `_shared/session-detail/interval-compare.ts` | **OURS** — moved unchanged from the phone | 2026-09-10 |
| Finish after race day: shown from the day after race day; the label reads "N days after race" up to 7 days, then "after your race" | `coach/post-race-unofficial.ts` (`post_race_unofficial`) | **OURS** — moved unchanged from State | 2026-09-10 |
| My Record's "Logged suggests" line for a lift or swim pace: at least 3 logged sessions in the last 42 days, and 5% or more away from the number the app runs on | `_shared/baseline-suggestions.ts` (rules from `reconcile.ts`) | **OURS** — no outside source; the code calls it approved, with no ledger row until now | 2026-09-10 |
| My Record bests: equal finish times keep the earlier race; equal FTPs keep the first date | `athletic-record/record.ts` | **OURS** — a tie-break, no source needed beyond saying so | 2026-09-10 |
