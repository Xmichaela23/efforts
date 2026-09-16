# STAGE 5 REPORT — every number sourced (2026-09-16)

Workorder: `docs/WORKORDER-app-one-truth-2026-09-15.md` §4 Stage 5. Unattended run.

**State: committed on `stage/one-truth-drift`, not pushed, not deployed.** Every change is a code comment or a
ledger row. No function needs a deploy: a comment changes nothing a deployed function does. Nothing to
recalculate. Nothing to check on a phone.

**What was done:** every numeric constant, threshold, window and cut-off in the load-bearing scope
(DESIGN-one-truth-guard §2.1: `_shared`, the four analyzers, `materialize-plan`, the composer and endurance
library, `src/lib/resolve-*.ts`) now carries a page, a named outside source, or an `OURS — <reason>` marker
beside it, and every OURS marker has a row in `docs/STATE-SOURCES.md` (new section at the bottom, one table per
group). Eleven ledger rows were rewritten to say what the code does. The race plan path and the season wizard
were skipped (§3a, parked).

## 1. Counts per group

"Cited" = a page or outside-source comment added or restated within 5 lines of the number. "OURS" = new
markers. "Rows" = new ledger rows (a row may cover a tight group of numbers). All nine commits were checked:
every added line in `supabase/` and `src/` is a comment; no line was removed.

| Group (commit) | Cited | OURS | Ledger rows added | Ledger rows corrected |
|---|---|---|---|---|
| Ledger corrections (`23e7c71c`) | 0 | 1 | 1 | 8 |
| `materialize-plan` (`588c9c06`) | 21 | 51 | 28 | 0 |
| `_shared` session-detail · swim · garmin · plan-tokens · session-swap + `src/lib` resolvers (`7a0e2fd4`) | 26 | 71 | 35 | 0 |
| `_shared` top-level, narrative-core, coaching, strava, intervals, calendar-sync (`e606b6df`) | 7 | 95 | 57 | 0 |
| `_shared/standing-plan` + `_shared/endurance-library` — the composer (`7bb86bcb`) | 61 | 106 | 71 | 0 |
| `_shared` strength, strength-grid, accessory-dosing, response-model, block-analysis, week-model, athlete-snapshot, week placement (`43655bfc`) | 17 | 118 | 122 | 0 |
| The four analyzers (`52978ea8`) | 5 | 198 | 56 | 0 |
| `_shared` load, pace, drift, state-trend, fact-packet, session-boom, insights, cycling-v1, endurance (`543794a5`) | 55 | 219 | 79 | 3 |
| Six markers moved inside the guard's window (`dd87577a`) | 2 | 4 | 0 | 0 |
| **Total** | **194** | **863** | **449** | **11** |

Code comments: 202 files, 1,045 lines added. Ledger: +504 / −11 lines.

## 2. Guard rule (b) and rule (e) dry runs, before and after

The guard is not built, so the design's rules were run as a scratch script (not committed), calibrated
against the design doc's own tree `9b1c9171`: it reproduces the design's OURS-without-a-row count exactly
(58 in 20 files) and comes within 3 of its bare-constant count (194 vs 191 at ±5, 218 vs 215 at ±3, 168 vs
166 at ±10). The design measured ±5 lines either side; §2.2's text says 5 above and 2 below — both are shown.
Rule 5's design count (127) could not be reproduced (the doc does not give the string filter); two readings
are shown: **narrow** = sentence-like strings, one per line, ids and log text excluded (106 at `9b1c9171`,
closest to the design); **wide** = every string literal or template with a digit or an interpolation.

| Rule | Before (`b4c3beae`) | After (`dd87577a`) |
|---|---|---|
| (b) bare module-level constants, ±5 either side | 197 in 94 files | **31 in 11 files — all on the parked race path** |
| (b) bare module-level constants, 5 above / 2 below | 209 in 98 files | **31 in 11 files — all parked** |
| (b) OURS marker with no ledger row | 58 in 20 files | **0** (1,030 OURS lines, all with a row) |
| (e) composer display strings, narrow | 106 in 16 files | **0** |
| (e) composer display strings, wide | 260 in 20 files | 125 in 18 files — string ids (`'core_2'`, `'ar_arms_push_1'`), lookup keys (`${day}:${i}`), golden-file formatting; none prints a number to an athlete |

The 31 left (parked, not touched): `race-projections.ts` 9 · `goal-predictor/index.ts` 5 ·
`marathon-readiness/index.ts` 4 · `course-segmentation.ts` 3 · `race-feedback.ts` 3 ·
`course-strategy-helpers.ts` 2 · `course-strategy-build.ts` 1 · `race-debrief.ts` 1 · `riegel.ts` 1 ·
`race-readiness/index.ts` 1 · `session-detail/race-readiness.ts` 1.

Tests: the whole deno suite run on a clean copy of `b4c3beae` and of `dd87577a` fails the same named tests
(47–48 failures, the same list both times; 5,445–5,448 passing). No test broke. A run on the live working tree
failed 87 because another terminal was mid-edit on `src/lib/bar-types.ts` and `_shared/strength/session-volume.ts`
(uncommitted, not this session's) — that run is not evidence either way.

## 3. Ledger rows corrected to match the code (no code changed)

1. **Lift chart window** — said "up to 52 weeks"; the chart is cut at 84 days (`assemble.ts CHART_WINDOW_DAYS`,
   the lift series filters on `_chartStart`); 52 weeks is the fetch for the all-time best.
2. **BODY row** — said "REMOVED from State"; it was restored the same day and renders (`StateTab.tsx`).
3. **Adjust writes** — omitted the ride threshold heart-rate write (`manual_ride_lthr`); now names both, through `save-baselines`.
4. **Week-one retest** — quoted "no hard training 48 hours prior" from p210/p212; the code says it was never on
   the page and SOURCE-viada has no "48 hours".
5. **Feedback popup** — said "run or ride"; swims get it too (D-162).
6. **Two sessions, six to eight hours** — cited p108 and named `TodaysEffort.tsx`; the code is
   `src/lib/today-lines.ts` and cites p145 rule 6 (both pages print 6–8 h).
7. **"Logged suggests"** — omitted the medium/high confidence gate, and applied the 42-day freshness to swim
   (a swim aggregate carries no date, so no freshness gate).
8. **Mobility sets** — said the parser moved; a dead copy still stands in `TodaysEffort.tsx formatRichWorkoutDisplay` (no caller).
9. **Grade-adjusted pace** — cited TrainingPeaks NGP; the code implements and cites Minetti et al. 2002.
10. **Heat note ≥ 72°F** — named the phone file; the test runs in `_shared/state-trend/trend-fit.ts` since 2026-09-15.
11. **Ride halves 10% rule** — described `_shared/ride-halves-steady.ts`, deleted 2026-09-12 (c5037daf); marked deleted.

Also from §4 Stage 5's own list: **rep limit 10 vs comment** — the function returns 10 for every lift, the
comment above it still says "deadlift 5, else 8". A line was added in `src/lib/estimate-1rm.ts` saying the
sentence is stale, plus an OURS row for the ten. Stage 1's "nearest 5 lb vs floor" item was already fixed by
Stage 3 (`5e2c6416`); the ledger and code agree.

**Not corrected, parked:** the course bike-grade row (+10 / −6 s/mi, applied to run courses too) is race path (§3a).

## 4. Code ≠ source — recorded, NOT fixed

1. `_shared/standing-plan/progression.ts:45-48,72-80` · Viada p247 · the lower-body cut starts at 3.5% and
   gives back 2 points every three weeks, so it is gone by **week 7**; `LOWER_HAIRCUT_PHASE_OUT_WEEKS = 9` is
   read by no formula (a test pins it) · SOURCE-viada:1289-1292: *"a 3 to 4 percent reduction … gradually
   phased out in eight to ten weeks (that is, increasing lower body estimated 1RM by about 2 percent every
   three weeks for the first nine weeks)"*. The rate matches the page; the end week does not (the page's own
   arithmetic, 3 × 2% = 6%, is more than the 3–4% it removes).
2. `_shared/endurance-library/source-rules.ts:837` (`short_above`, level 1) · Viada pp233-234 · code: 1 min @
   105% / **1 min** @ 90%, commented as read off the photos 2026-09-11 · SOURCE-viada:870: 1 min @ 105% /
   **1:30** @ 90%. The corpus and the code's photo reading disagree; one of them is wrong.
3. `_shared/accessory-dosing/performed-ledger.ts:105` (also :22, :102, :142, :184) · cites **p084** · the
   strength dose (4–6 reps over 90%, 15–20 velocity reps at 70–85%) · SOURCE-viada:507/518 prints it on **p80**;
   p84 in the corpus is the hypertrophy rest rule. Numbers match, page does not.
4. `_shared/standing-plan/compose.ts:4168-4169` · pp.69-125, pp139-145 · the copy says "four to six when the
   first is under an hour" · SOURCE-viada:722-723 (p145 rule 6): 4–6 h *if the morning session is a VT1
   session lasting under an hour*. The copy drops the VT1 condition.
5. `_shared/standing-plan/frames.ts:1343` (`RIDE_LEVEL_CEILING_CITE`, no caller found) · p278 · string says
   level 2 is used "on one session" · SOURCE-viada:1358, 1363: p278 prints level 2 on two (day 1 sweet spot
   level 1-2, day 6 endurance level 2). The comment above the constant already says two.
6. `_shared/standing-plan/frames.ts` Strength + 5K day 1 standard (~:462) · p246 · the page prints
   `1 × HYP: Accessory: focused pull, focused push` as one row (SOURCE-viada:1220); the code builds two slots on
   day 1 standard and on Cycling: Base day 1, but one slot (pull only) for the same printed text on day 4
   standard, taper day 1 and taper day 4. An inconsistency between cells, not a confirmed error.
7. `analyze-running-workout/index.ts:1049` · cites the Friel %LTHR model (`friel-zones.ts`) · the fallback
   zone table puts the zone 4 top at LTHR × 1.05 · `src/lib/friel-zones.ts:26-32` (TrainingPeaks' Friel guide):
   Z4 95–99%, Z5 100%+; that file calls 1.05 pre-existing, not Friel's.
8. `analyze-running-workout/index.ts:1046` · same citation · zone 1 top = round(LTHR × 0.85) ·
   `friel-zones.ts:89`: Z1 max = round(LTHR × 0.85) − 1. One beat off the canonical table.
9. `_shared/cycling-v1/ride-physiology.ts:96-97` · TrainingPeaks PMC, 42/7 days · steps fitness by
   1 − e^(−1/42) · the repo's own record of TrainingPeaks' step (`fitness-fatigue.ts:12`) is ÷ 42. Checked
   against the repo's quote only; TrainingPeaks' page was not read.
10. Mile constants: `athlete-snapshot/daily-ledger.ts:44,61` divides by 1609.34 and
    `block-adaptation/index.ts:527` multiplies by 1.60934; the definition is 1609.344 m / 1.609344 km.

Page not in the corpus, so no mismatch claimed: `endurance-library/source-rules.ts:94-96`
`THRESHOLD_WORK_TO_REST` 4:1 (SOURCE-viada:423-427: "the page for 4:1 has not been found yet");
`_shared/endurance/pace-zones.ts` "Daniels VDOT" tables (no Daniels table anywhere in docs; marked OURS).

## 5. Could not classify (file:line)

- `_shared/week-optimizer.ts:1685-1951` — the 3-then-2 day spacing ladder (`findUpperWithSpacing`,
  `findStrengthPair`, `tryFindLower`) and its strings at :600-601. Could not tell whether a page or only
  `SCHEDULING-RULES.md` sets them. No marker.
- `_shared/schedule-session-constraints.ts:590-620` — `SEQUENTIAL_RULES_TEXT` / `STRENGTH_FREQUENCY_RULES_TEXT`
  (48 hours, 3 days, 2 days). No caller identified; they read as old prompt text. No marker.
- `_shared/plan-generation-trade-offs.ts:256` — copy with week numbers, not a threshold. No marker.
- `_shared/state-trend/week-accent.ts:27-32`, `fact-packet/flags.ts`, `cycling-v1/flags.ts` — priority ranks
  (sort order, not a measurement cut). No marker.
- `_shared/state-trend/state-screen-print.ts:80-260` — numbers in a debug printer (fixtures). No marker.

## 6. Noticed, not changed

- **Two rep ceilings for one idea:** `_shared/strength/trusted-reps.ts` holds 8 (deadlift 5) for the all-out
  read, `src/lib/estimate-1rm.ts trustedMaxReps` returns 10 for everything else. Each file's comment agrees with
  its own code; both now have ledger rows. `state-trend/assemble.ts:395` still says "deadlift 5, else 8".
- **Stale code comments on the lift chart:** `state-trend/assemble.ts:112-128` and `compute-snapshot/index.ts:867-871`
  say 52 weeks is how much the chart can draw; the chart is cut at 84 days (`assemble.ts:1357-1368`).
  `trend-fit.ts`'s heat comment points at "STATE-SOURCES row 35", now a different row.
- **75°F on Details:** `session-detail/build.ts` still uses an unsourced 75°F for the "heat drove it" wording
  (now marked OURS). The 60°F / 72°F rows cover other lines.
- **"Garmin-style"** execution tolerances in `analyze-cycling-workout` and `garmin-execution.ts` were marked
  OURS: no Garmin document for them is in the repo, and D-368 says none of the reference apps publishes one
  execution score. The guard's vendor-word match would otherwise pass them on the word "Garmin".
- **Materialize pace tolerance ±2% / ±6%** names Garmin and TrainingPeaks in its comment but no document; an
  OURS marker was added beside it.
- **CSS swim test** in `materialize-plan` uses 400 m / 3 min / 200 m; `docs/SWIM-PROTOCOL.md` §5.8 writes 500 / 4 / 300. Marked OURS.

## 7. Decisions made during the run

- **Race path parked = file list, not only the guard's seed list.** Skipped: the guard's §7 globs plus
  `race-projections.ts`, `goal-predictor/`, `marathon-readiness/`, `riegel.ts`, `course-*`, `race-debrief.ts`,
  `race-feedback.ts` and the goal/race helpers (19 more, none with a bare constant). `pace-benchmark.ts` stays
  in scope (the standing-plan intake imports it).
- **Unit definitions** (1609.344, 0.9144, 0.45359237, 3.28084) are cited `FIELD — definition`.
- **Version counters** (`COACH_PAYLOAD_VERSION`, two cache versions) are marked OURS with a row so the guard
  passes; they are not training numbers.
- **Plumbing skipped:** query limits, retry/backoff in transport code, crypto sizes, HTTP codes, string caps,
  golden-file widths.
- **Ledger layout:** new rows sit in one new section, "Stage 5 — load-bearing constants sourced", one table per
  group, each row naming the file and the backticked symbol so the guard's lookup finds it.

## 8. Outside the load-bearing scope, not swept

TRUTH-MAP §7.8's "No source" list also names numbers in files the guard does not treat as load-bearing
(§2.1): `validate-reschedule` (IF table, ±3-day window, suggestion scoring), `exercise-config.ts` legacy ratio
table, `resolve-exercise-weight` (0.70, 0.3–0.95, 20 sessions), `save-baseline-test/pick.ts` RIR 2–3 gate,
`generate-run-plan` tables and VDOT (`effort-score.ts`), `learn-fitness-profile` fill-ins and filters,
`course-detail` stale hash, `share-strength-to-strava` 1800 s, and the phone-side numbers in `src/components`
(Rule 1's job, Stage 4). They are unchanged and still unsourced.
