# AUDIT — where the phone decides instead of printing (2026-09-10)

**The rule.** Smart server, dumb client: the server decides, the phone prints (`docs/TARGET-ARCHITECTURE.md` principle 2, `docs/CONSTITUTION.md` Law 4). This audit lists every place under `src/` where phone code makes a training decision itself. That covers a verdict, a sentence or cue picked by rule, which options to offer, gating or filtering sessions, weekly totals, a derived training number, or a copy of something an edge function already computes.

**No code was changed.** This file is the only change in the commit.

## Counts

| Severity | What it means | Findings |
|---|---|---|
| HIGH | A number or verdict reaches the athlete that could contradict the server, or has no source | 97 |
| MEDIUM | Words, options or filters decided on the phone that a second screen or a watch face would have to copy; or the phone running the server's own code at render | 96 |
| LOW | Dead code, admin-only screens, cosmetic labels | 51 |
| **Total** | | **244** |

| Area | HIGH | MEDIUM | LOW |
|---|---|---|---|
| Today, Week and the planned session | 23 | 21 | 9 |
| Session details (Performance, charts, import) | 19 | 11 | 12 |
| Strength logger and strength screens | 20 | 21 | 9 |
| State, Profile and baselines | 17 | 21 | 10 |
| Plans and goals | 8 | 8 | 3 |
| Plan builder and setup wizard | 10 | 14 | 8 |

## How this was done, and how far to trust it

1. The seven files named for today were read by the lead session in full and checked against the server code: `today-lines.ts`, `SessionDeck.tsx`, `session-discipline-swap.ts`, `session-boom.ts` with `useSessionBoom.ts`, `useGarminDataPresence.ts`, `provider-attribution.ts` and `WorkoutCalendar.tsx`.
2. The other 350 non-test files under `src/` were split into 11 slices, and each slice was read in full by a separate reader session. Every "the server has it" claim below names the server function. It is labelled **traced** when the server code was opened, and **grep only** when a search found it.
3. Every "the server does not have it" claim names the search that came back empty. A claim without a named search is not in this file.
4. Where two readers disagreed, the lead read the code:
   - The Garmin and Strava baseline previews cannot be reached: the Data Import tab button is commented out at `TrainingBaselines.tsx:1659-1681`.
   - No edge function imports `session-discipline-swap.ts`. The server files that name it (`get-week/planned-exists-key.ts:19`, `_shared/indoor-session.ts:20`, `activate-plan/preserve-athlete-edits.ts:41`) only mention it in comments.
5. Nothing here was run on a device. Where a finding says the phone "can disagree", the code allows it. None of them was observed on a screen.
6. **Shared code.** Supabase bundles some `src/lib` files into edge functions. The phone also imports server modules through `@shared/`. When the phone calls that same code at render time, the finding says "same code as the server". Those findings rank MEDIUM, not HIGH. The app bundle on Netlify and the edge deploy can still run different versions, and a watch face would have to bundle the code too.

## Corrections to what the architecture docs say

- **`useStateTrends` is no longer a violation.** It prints the server's display contract as it arrives (`useStateTrends.ts:75-94`). The only thing it still works out is which sports count as active (M-S07).
- **`LoadBar` is a violation, and a wider one than written.** It sums seven-day load per sport, works out share and dominant sport, and runs the form-zone word itself (H-T21).
- **`useCoachWeekContext` has no divergence calculation.** Lines 72-85 only copy a type. The hook merges adapt-plan suggestions, and nothing renders the merged field (L-S01).
- **CLAUDE.md says `pairing-timing.ts` runs the week-model on the phone. It does not.** It is an altered copy of `generate-combined-plan/week-builder.ts` `decideOrdering`, and it disagrees with it (H-T18). `suggest-hard-days.ts` does run the week-model solver. Standing Plan weeks are placed on the server by a different function, `chooseDayMap` (`generate-strength-plan/index.ts:571`).
- **Several `src/lib` files look shared but run on the phone only.** Their only server importers are test files: `standing-plan-week-copy`, `standing-plan-week-bounds`, `hard-slot-choices`, `standing-plan-copy`, `hard-day-menus`, `strength-calibration-copy` and `StrengthLogger.tsx`. The header of `strength-calibration-copy.ts` claims edge importers; a search for them returns none.

## What a watch face would need today

- **Runs and rides: nothing reaches the watch.** In `src/services/watchConnectivity.ts`, `sendWorkoutToWatch` (87-102) and `clearWatchWorkout` (107-119) have no callers, and the payload builder was deleted (121-135). A run or ride watch face would have to copy every live-recording decision in H-D16, H-D17, M-D08 and M-D09, because none of them is stored on the planned row.
- **Swims: the step list goes unchanged.** `src/services/workoutkit.ts` sends the server's `computed.steps` as they are (100-103, 124). The phone decides the pool unit and the pool length (H-D20).
- **The phone recording flow is broken twice, so its findings reach no athlete today.**
  - `EnvironmentSelector.tsx` uses `isRun` at 65, 74, 97 and 108 but never declares it (props at 18-22). That throws on the first screen. Traced, not run.
  - `useWorkoutExecution.ts:118-119, 171-181` reads `duration_s` and `distance_m`, but materialize-plan writes `seconds` and `distanceMeters` (`materialize-plan/index.ts:3654, 3677, 3744`). Steps would never end on their own.

---

## HIGH — 97

### Today, Week and the planned session (23)

- **H-T01** `src/lib/planned-session/duration.ts:184-221` (called by `PlannedSessionHeader.tsx:77-113`, `PlannedWorkoutSummary.tsx:157-163, 259-262, 313-317`, `utils/resolveMovingSeconds.ts:25`, `session-discipline-swap.ts:431`, `TodaysEffort.tsx:615`, `AllPlansInterface.tsx:529, 740, 1293, 1608`)
  - **Decides:** how long a planned session is: "63:00" on Today, the drawer, the planned screen and the week bar, and whether the swap button shows.
  - **Server:** `_shared/planned-duration.ts:42-57` reads in a different order. It takes the step sum first, then the computed total, then the stored column (traced). `auto-attach-planned`, `analyze-cycling-workout` and `session-detail/build.ts` use it, so the Performance duration chip grades against a different number from the one Today prints.
  - **Phone only:** reading minutes out of the description text, and pricing distance steps at their pace.
  - **Also:** `StructuredPlannedView.tsx:148, 236-238, 891-893` prints a step-sum "Total duration" under a header that uses the stored total only (`utils/resolvePlannedDuration.ts:14`), so two durations can sit on one screen.
  - **Move:** get-week and `session_detail_v1` carry one `planned_duration_seconds` from the server file. Decide there, once, whether the stored total or the step sum leads. The phone prints it. **M**
- **H-T02** `src/lib/strength-session-minutes.ts:42-170` via `PlannedSessionHeader.tsx:109`
  - **Decides:** a lift session's header shows "30–40 min", estimated at 2-4 seconds per rep plus rest, in place of the length the plan stored.
  - **Server:** composes 45, 20 or 55 minutes (`compose.ts:1958, 2036, 2957`, traced). Searching for `strengthSessionMinutes|SEC_PER_REP` over `supabase/functions` finds nothing. The per-rep figures are marked ours with no `STATE-SOURCES` row.
  - **Move:** compose stamps `duration_range` on the row. **M**
- **H-T03** `src/components/WorkoutCalendar.tsx:1087-1119, 1142, 1376-1405`
  - **Decides:** the Week bar's "Done" and "Planned" minutes, distance and lift counts, summed on the phone. A finished session adds its **actual** moving time to "Planned": its linked planned row is hidden at 828-829 and the completed row counts in both totals at 1102-1109. So "Planned" changes as the athlete trains.
  - **Server:** `get-week` `weekly_stats` (1617-1627) sends workload, session counts and completed distances. It sends no minutes and no lift counts.
  - **Move:** `weekly_stats` adds planned and done minutes (server duration ladder), planned and done metres, and lifts planned and done. **M**
- **H-T04** `src/components/SessionDeck.tsx:292-312`, `WorkoutCalendar.tsx:1159-1175`
  - **Decides:** lifted volume ("3,725 lb") on Today's done card and the Week row, as reps × weight with 0-weight sets skipped.
  - **Server:** `session_detail_v1.strength_volume.completed_total_lb` (`session-detail/build.ts:2377-2486`, traced) counts the bar when the weight box is blank, bodyweight movements and bands. The done card and the Performance table can print different pounds for the same session.
  - **Move:** print `completed_total_lb`, which is already on the row the card holds. get-week passes it for the Week row. **S**
- **H-T05** `src/components/TodaysEffort.tsx:1659-1689`
  - **Decides:** the header week line sums the week's lifted weight the same private way, beside the server's miles.
  - **Server:** `compute-facts/strength-facts-lib.ts:180-185` prices each set with `strengthSetVolume`, and `compute-snapshot/index.ts:314` sums the week (traced). get-week sends no volume.
  - **Move:** get-week adds the week's strength volume from `workout_facts`. **M**
- **H-T06** `src/components/SessionDeck.tsx:58-66`
  - **Decides:** when a strength row has no `weight_display`, the weight corner prints the raw `weight` with "kg" for a metric athlete, with no conversion.
  - **Server:** `weight_display` is always in pounds (`exercise-config.ts:3805-3819` via `materialize-plan/index.ts:2641`, traced).
  - **Move:** materialize always stamps `weight_display` in the athlete's unit, and the phone prints only that. **S**
- **H-T07** `src/components/TodaysEffort.tsx:2670-2684`
  - **Decides:** "Hot today. Go by conversation; heart rate reads high in the heat." shows at 75°F or warmer.
  - **Server:** its heat model starts at 60°F (`_shared/heat-adjust.ts:32`, traced). Searching for "Hot today|heart rate reads high" finds nothing on the server. Between 60 and 74°F the analysis adjusts for heat and the drawer says nothing. The 75 has no source.
  - **Move:** get-week or get-weather sends a heat note computed against heat-adjust's threshold. **S**
- **H-T08** `src/components/TodaysEffort.tsx:2581-2605`, `PlannedWorkoutSummary.tsx:655-713`
  - **Decides:** any text containing "strides" gets a tooltip, "approx. 100m … Reach 95% of max speed", written twice on the phone.
  - **Server:** searching for "What are Strides|95% of max" finds nothing. No source.
  - **Move:** remove it, or the server attaches a sourced line to the step. **S**
- **H-T09** `src/components/TodaysEffort.tsx:588-667`
  - **Decides:** "Mark as Complete" inserts a completed workout. Its duration, moving time and elapsed time come from the phone's duration reader, or 30 minutes when none is found.
  - **Server:** no manual-completion path; searching for "completedmanually" finds only writers of `false`. The 30 has no source.
  - **Move:** an endpoint takes the planned id and creates the row with the server duration. **M**
- **H-T10** `src/components/UnifiedWorkoutView.tsx:168-185`
  - **Decides:** a row marked completed but with no distance, moving time, analysis or logged set is shown as planned.
  - **Server:** `get-week/index.ts:882-888` derives status with a different rule (traced). `AppLayout.tsx:871-916` also refreshes the row straight from the tables, bypassing get-week.
  - **Move:** get-week and workout-detail send one `is_executed`. **M**
- **H-T11** `src/components/AppLayout.tsx:536-621, 641-701`
  - **Decides:** when the after-workout rating popup appears. Opening a workout: no rating, not dismissed, dated within 7 days. A live update: no date limit.
  - **Server:** `check-feedback-needed/index.ts:44-58` uses 36 hours, run/ride/swim only (traced). Its comment says the 7-day window asked about old rides after a history import.
  - **Move:** both phone paths call `check-feedback-needed` with the workout id. **S**
- **H-T12** `src/components/AppLayout.tsx:316-414, 1375-1421, 1460-1516`
  - **Decides:** a mobility session's sets, reps and weight in the logger, parsed from text ("2x8", "20 lb"). The calendar path leaves reps blank; the add-menu paths default to 8 reps, and one forces 1 set.
  - **Server:** materialize-plan has no structured mobility sets (grep only). No source for 8.
  - **Move:** the plan writer stores structured mobility sets; AppLayout passes the row through. **M**
- **H-T13** `src/components/UnifiedWorkoutView.tsx:73-111, 399-402`
  - **Decides:** when the live session detail has no race readiness block, the phone fills it from an older copy stored in `workout_analysis`. That can show a race verdict the server has since dropped.
  - **Server:** workout-detail builds `session_detail_v1` (grep only).
  - **Move:** remove the merge. **S**
- **H-T14** `src/lib/session-boom.ts:116-436`, `src/hooks/useSessionBoom.ts:44-136`
  - **Decides:** the line of good news on a done session: which of six sentences, and every number in it:
    - best 20-minute, 5-minute, 1-minute or 5-second power "since January"
    - longest ride or run
    - heart rate "N bpm lower at easy power than your last eight rides"
    - easy pace "N s/mi faster at the same heart rate than your last eight runs"
    - drift under 5% N sessions in a row (the minimum of 2 is ours)
    - "gets a second heavy set next time", replaying `meSetsFromHistory` on the phone, the only caller of that function anywhere
  - **Also:** the hook reads up to 200 workouts and 1,000 `exercise_log` rows directly. The block start is never sent (`useSessionBoom.ts:116-120`), so every window is "this year". A rider with more than 200 rides in the year can be told a best that is not one.
  - **Server:** has every input (power curve, `bike_fitness_v1.hr_at_band`, `fact_packet_v1.vs_similar.trend_points`, decoupling). It computes no line: searching for "sessionBoomLine|boom" over `supabase/functions` finds nothing.
  - **Move:** compute the line at ingest into `session_detail_v1.boom` with its numbers and basis. The phone prints it. **L**
- **H-T15** `src/lib/session-discipline-swap.ts:476-963`, `src/lib/swap-write.ts:40-229`, `src/lib/swap-library-session.ts:45-155`
  - **Decides:** the swap sheet: which swaps exist and what they write.
    - The gates: posture, easy/hard/long band, FTP, the one-way hard swap, the ground-impact rule, the hike.
    - It writes session names and descriptions (375-400).
    - It picks the replacement session by querying the athlete's earliest un-swapped row of the target family, falling back to a library session at level 2 with no source (`swap-library-session.ts:72`).
    - "Back to the plan" reads `plans.sessions_by_week` with a type normaliser copied by hand from get-week (`swap-write.ts:34-52`).
    - It writes `planned_workouts` directly.
  - **Also:** "Rest of plan" rewrites later rows from the phone (`TodaysEffort.tsx:759-801`). The three screens offer different lists: Today's card icon, the drawer, and the planned screen with its own header text (`TodaysEffort.tsx:2245-2270, 2734-2763`; `UnifiedWorkoutView.tsx:577-596, 1498-1516`). `UnifiedWorkoutView.tsx:1471-1478` ignores a failed restore.
  - **Server:** no edge function offers or applies a swap. Searching for `getDisciplineSwaps|sessionSwapExtras|resolveSwapWrite` finds nothing, and no function directory is named for swaps. get-week depends on the tag the phone writes (`get-week/index.ts:168`).
  - **Move:** an adapt-plan action returns the options for a row id, and a second action applies the chosen option (all scopes) and materializes. Every screen prints the list and posts the choice. **XL**
- **H-T16** `src/lib/pairing-timing.ts:22-224`, `src/lib/use-strength-ordering-preference.ts:43-127` (callers `TodaysEffort.tsx:1051-1086`, `WorkoutCalendar.tsx:1028-1032, 1439-1443`, `AllPlansInterface.tsx:1743, 2395`)
  - **Decides:** which of two same-day sessions is listed first. A quality run or ride with a lower-body lift always shows the lift first, and "lower body" is decided by a name regex when the tag is missing. The preference hook reads the goals table, and the ordering function ignores the value.
  - **Server:** `generate-combined-plan/week-builder.ts:2308-2323` `decideOrdering` puts endurance first by default (traced). No order reaches the phone: searching get-week for "timing|pairing" finds nothing.
  - **Can disagree:** on a combined plan with the default preference, the server says run first and the phone shows the lift first.
  - **Move:** get-week sends a `day_order` per item; the phone sorts by it. **M**
- **H-T17** `src/components/PlannedWorkoutSummary.tsx:451-462, 428-435`
  - **Decides:** when a step has a pace but no range, the phone builds one: ±4% on quality steps, ±6% on easy.
  - **Server:** `materialize-plan/index.ts:3757-3772` uses ±2% on work steps (traced).
  - **Move:** delete the fallback and print the server range, or the single target. **S**
- **H-T18** `src/components/PlannedWorkoutSummary.tsx:201-209, 301-306`, `src/services/plans/normalizer.ts:871-1114`
  - **Decides:** the planned subtitle for rows with a workout structure comes from the phone normalizer, ahead of the server's `friendly_summary`. It includes:
    - easy and 5K paces from **today's** baselines
    - watts as a percent of FTP, with warm-ups at 60-65%
    - strength weight as the raw 1RM × %, rounded to 5 lb
    - ±4%/±6% pace ranges
  - **Server:** materialize-plan builds `computed.steps` from the structure (3391-3400) with ±2%. get-week sends `friendly_summary` (`get-week/index.ts:791`). Traced.
  - **Move:** materialize always writes `friendly_summary`; the phone prints it. **M**
- **H-T19** `src/components/StructuredPlannedView.tsx:432-444, 467-575`
  - **Decides:** for rows with no computed steps, the phone expands the old structure itself: `user.*` paces from baselines, easy pace on warm-ups and rests, strength load as 1RM × % rounded to 5 lb with a 5 lb floor, and swim yards summed.
  - **Server:** materialize-plan writes `computed.steps` with targets (3752-3782, traced).
  - **Move:** delete the fallback; the empty state waits for the server. **S**
- **H-T20** `src/utils/swimPlanTokens.ts:49-261` (Calendar 248, Today 2383, `PlannedWorkoutSummary.tsx:84-106, 193-199`, `StructuredPlannedView.tsx:788-792`, `AllPlansInterface.tsx:424`)
  - **Decides:** the swim distance chip, from yards parsed out of plan tokens, else a number in the name, else the step metres summed. The file's own comment (125-127) records token and step sums disagreeing.
  - **Server:** no stored planned swim total; searching for `total_yards|swim_yards|sumSwimYards` finds only generator inputs.
  - **Move:** materialize stamps the total distance and unit. **M**
- **H-T21** `src/components/LoadBar.tsx:128, 158-197, 225-276`
  - **Decides:** the load bar on Home and State. It sums seven-day load per sport from the daily breakdown, rounds the shares to 100%, picks the dominant sport and prints "N pts · last 7 days". It also runs the form-zone word itself and hard-codes the zone table's ranges.
  - **Server:** `coach/index.ts:4518-4529` sends `load.by_discipline[].actual_load` from the rolling seven days and `load.label` (4508). Traced.
  - **Move:** coach adds `share_pct`, `dominant` and `total_7d` plus the zone rows; the bar prints them. **S**
- **H-T22** `src/components/RescheduleValidationPopup.tsx:363-380`
  - **Decides:** the advice line under each reschedule warning is written by the phone, ignoring the server's `reason.data.suggestion`.
    - It says "reduce daily workload below 120" where the server cap in peak weeks is 140 (`validate-reschedule/index.ts:903`).
    - Its long-run-plus-strength line never fires, because the server sends a different code (830).
  - **Move:** print `reason.data.suggestion`. **S**
- **H-T23** `src/lib/week-budget.ts:176-230` (`NonRaceBuilder.tsx:6538, 6633`)
  - **Decides:** "Your long run carries ~X mi, the other N runs carry ~Y mi", with a 55% share that has no source.
  - **Server:** `strength-primary-plan.ts:1319` distributes miles differently (grep only). The file itself says "the plan is the authority".
  - **Move:** the preview returns week-one session distances. **S**

### Session details (19)

- **H-D01** `src/components/EffortsViewerMapbox.tsx:476-510, 1445-1447, 2479-2502`
  - **Decides:** the splits table under the chart: time, pace or speed, heart rate and grade per mile or km.
  - **Server:** `compute-workout-analysis/index.ts:1431-1476, 1510` writes `computed.analysis.events.splits.{km,mi}`, and `session-detail/build.ts:984-992` turns the mile splits into `splits_mi` (traced).
  - **Can disagree:** the phone starts at 0 m, works from a copy thinned to about 2,000 points with its own elevation smoothing, and averages clamped grades.
  - **Move:** print the server splits. **M**
- **H-D02** `src/components/EffortsViewerMapbox.tsx:556-620, 641-656, 750-842, 1087-1154, 2040-2185`
  - **Decides:** every chart line and the scrub readouts, rebuilt from raw samples:
    - grade window clamped to ±30% and trimmed at the 2nd/98th percentile
    - VAM per point
    - pace from two 30-sample averages, ignoring the server pace series on purpose (comment at 1112)
    - heart rate trimmed at 5-95%
    - cadence gaps filled with 80
    - GPS cut-offs of 18 m/s, 7.5 m/s and grade 0.45, all with no source
  - **Server:** `compute-workout-analysis/index.ts:1486-1507` writes smoothed pace, speed, elevation and `grade_percent`; the phone never reads the grade. No per-sample VAM series.
  - **Move:** the server writes display-ready series with its smoothing cited; the phone plots them. **L**
- **H-D03** `src/components/EffortsViewerMapbox.tsx:993-997, 1022-1081, 2237-2259`
  - **Decides:** the "+gain / −loss" readout. It is a running total counting changes of 1.5 m or more over 20 m (no source). It jumps to the device total near the finish, and the phone sum stands in as the total when the device sent none.
  - **Server:** has only the gain and loss columns, no cumulative series (traced).
  - **Move:** the server adds cumulative gain and loss series. **M**
- **H-D04** `src/components/EffortsViewerMapbox.tsx:1536-1582, 2038-2065, 2173-2177`
  - **Decides:** the "(avg)" pills pick a source through a fallback ladder. The pace unit is guessed (a comment says "others might be sec/km"). VAM reads a column only file imports write, so Garmin and Strava rides show "—".
  - **Server:** `session_detail_v1.completed_totals.avg_pace_s_per_mi` (`workout-detail/index.ts:933-944`) and `computed.overall.avg_vam` (`compute-workout-summary/index.ts:1473-1481`). Traced.
  - **Move:** print those. **S**
- **H-D05** `src/components/FitFileImporter.tsx:114-131, 180-353` (reachable from the import menu, `AppLayout.tsx:1090, 1585`)
  - **Decides:** the phone turns a .fit file into the stored workout.
    - Sport defaults to ride.
    - Elevation gain is multiplied by 1,000 but loss is not, so loss is stored 1,000× too small.
    - Intensity factor is stored as 50 where the server stores 0.50 (`compute-workout-analysis/index.ts:1396, 1539`).
    - No samples are sent, so the server can never compute any of it.
  - **Server:** no FIT parser; searching for `fit-file-parser|FitParser|parseFit` finds nothing. `save-imported-workout` stores what it is sent.
  - **Move:** upload the raw file to an edge function that parses it and runs recompute-workout. **L**
- **H-D06** `src/components/AppLayout.tsx:1101-1161`
  - **Decides:** after a file import, the phone calls auto-attach-planned and then calculate-workload with a `workout_data` object it built itself.
  - **Server:** `save-imported-workout/index.ts:204-208` already runs recompute-workout, and calculate-workload uses the caller's data whenever it is sent (183-206). Traced.
  - **Move:** delete both phone calls. **S**
- **H-D07** `src/components/CompletedTab.tsx:1458-1465, 1715-1722`
  - **Decides:** the Details "Workload" tile prints the planned workload under the same label when the actual is missing.
  - **Server:** `session_detail_v1.load.workload` (grep only).
  - **Move:** print that only, and nothing when it is null. **S**
- **H-D08** `src/components/CompletedTab.tsx:1320-1330`
  - **Decides:** any pool from 20 to 26 m is labelled in yards, so a 25 m pool shows "27 yd". It ignores the stored `pool_unit` (written at `PostWorkoutFeedback.tsx:405-408`).
  - **Move:** workout-detail sends the pool display string. **S**
- **H-D09** `src/components/AdherenceChips.tsx:164-176`
  - **Decides:** the Drift chip subtitle ("1.0 over the 5% line") uses the shared `DRIFT_LIMITS.hybridPct`.
  - **Server:** `session-detail/build.ts:2012-2014` writes the Heart rate row's sentence from a separate literal 5, with different words (traced). Two constants feed two sentences on one tab.
  - **Move:** build.ts emits one drift display line that both use. **S**
- **H-D10** `src/utils/resolveMovingSeconds.ts:27-160` (completed branch; Calendar, SessionDeck 315-328, TodaysEffort, session-boom, share-session-text), `src/utils/workoutDataDerivation.ts:1-41` (`useWorkoutData.ts:73-75`, `CompletedTab.tsx:1258`)
  - **Decides:** a finished session's moving time. The two helpers check sources in opposite orders, and the first can fall back to distance ÷ speed or minutes × 60. The file's own comment says the calendar and the details screen show different times for a Strava row. Today's done card takes the phone value first and the server's `completed_totals` only as a fallback.
  - **Server:** `computed.overall.duration_s_moving` (`compute-workout-summary/index.ts:776, 805`); get-week fills it when absent (833-840). Grep only.
  - **Move:** get-week and workout-detail stamp one moving-seconds value, including the race rule. Both helpers return it. **M**
- **H-D11** `src/components/EnduranceIntervalTable.tsx:303-319`
  - **Decides:** each interval shows green, blue or red using phone tolerances: watts ×0.97/×1.05, pace ±5 s.
  - **Server:** sends the planned ranges (`session-detail/types.ts:737-740`) but no per-interval in/above/below. The header score uses the server's own tolerances.
  - **Move:** build.ts stamps `executed.band` per interval. **S**
- **H-D12** `src/components/EnduranceIntervalTable.tsx:326-402`
  - **Decides:** the goal-race view recomputes each interval's % as target ÷ actual, capped at 100.
    - Colour bands: 90-110 and 80-120.
    - Projection offsets: −0.5 s and +60 s.
    - Pacing tooltips from variability cut-offs 3, 7 and 10 ("Excellent pacing").
  - **Server:** the goal paces come from `analyze-running-workout/index.ts:3096-3110`, and its `pace_adherence_pct` is a different formula on the same row.
  - **Move:** the server sends goal %, projection % and a status word per interval. **M**
- **H-D13** `src/components/EnduranceIntervalTable.tsx:531-532, 565, 600-611`
  - **Decides:** swim distance % and duration % of plan, green at 100% or more, with the same 20-26 m yard guess.
  - **Server:** has the totals (`build.ts:719, 1338-1395`) and no percentages.
  - **Move:** add the percentages, status and pool unit to `completed_totals`. **S**
- **H-D14** `src/utils/strengthFormatter.ts:27-104, 159-196` (StructuredPlannedView, StrengthLogger, PlannedWorkoutSummary)
  - **Decides:** the sentence on each strength row:
    - four sentences chosen by `load_basis`
    - "leaves 1-2 in reserve" when `target_rir` is missing
    - "last time N", "(was X lb)" and "[Setup Required]"
  - **Server:** writes its own "…with 2 in reserve" inside `weight_display` (`materialize-plan/index.ts:1130-1131`, traced). One session can show "2 in reserve" and "1-2 in reserve".
  - **Move:** materialize writes one display note per strength row. **M**
- **H-D15** `src/components/workout-execution/WorkoutExecutionContainer.tsx:445-487, 549-556`, `PostRunSummary.tsx:73-80, 135-163`
  - **Decides:** after a phone-recorded run, each rep is green or amber by averaging per-sample GPS paces. "Execution: N%" is the share of reps in range, coloured at 80 and 60 (no source).
  - **Server:** `computed.overall.execution_score` (grep only) is what VIEW DETAILS on the same screen shows. Unreachable today (see the watch section).
  - **Move:** print the server score after save. **S**
- **H-D16** `src/hooks/workout-execution/useWorkoutExecution.ts:57-88, 451-465`, `WorkoutExecutionContainer.tsx:260-278`, `ExecutionScreen.tsx:66-96`, `useVoiceAnnouncements.ts:219-230`
  - **Decides:** the live cue, "in zone", "pick it up" or "ease off", plus a buzz. "Way off" means 10% outside the pace range or 10 bpm outside the heart-rate range, with a 30 s gap between warnings.
  - **Server:** stamps the ranges (±2%/±6%, `materialize-plan/index.ts:3762-3772`; `hr_range` 663, 3803). The post-run analyzer calls more than 7% "too slow" (`interpretation.ts:740-750`). The live cue and the verdict after the run use different limits. Unreachable today.
  - **Move:** the server stamps the outer band and the words on every step. **M**
- **H-D17** `src/hooks/workout-execution/useWorkoutExecution.ts:93-185`, `ExecutionScreen.tsx:159-166`
  - **Decides:** indoors, a distance rep ends when elapsed time × the middle of the pace range reaches the distance.
  - **Server:** already stores each distance step's `seconds` (`materialize-plan/index.ts:3677, 3695-3714`, traced).
  - **Move:** read the stored seconds. Unreachable today. **S**
- **H-D18** `src/services/workoutkit.ts:95-126`, `src/utils/formGogglesSwimScript.ts:42-53`
  - **Decides:** the swim sent to the watch. An empty pool unit becomes metres and a missing pool length becomes 22.86 or 25 m, while the goggles script prints yards for the same row.
  - **Server:** `pool_unit` and `pool_length_m` are on the row when set (get-week 472).
  - **Move:** materialize always stamps both; both exports read them with no fallback. **S**
- **H-D19** `src/hooks/useWorkoutData.ts:72-146`
  - **Decides:** when `display_metrics` is missing, the phone works out speed, pace, max pace and swim pace per 100, and prefers its own swim pace over the stored one.
  - **Server:** `workout-detail/index.ts:1788` `display_metrics` (grep only).
  - **Move:** every caller passes the server `display_metrics`; delete the math. **S**

### Strength logger and strength screens (20)

- **H-S01** `src/components/StrengthLogger.tsx:1185-1289, 2871-2884, 4113-4138`
  - **Decides:** the "Baseline Test" and "Retest" sessions open with weights and cues the phone invents:
    - top set at 88% of the typed max, warm-ups at about 50% and 70%
    - bar 45 (0 for overhead press), deadlift starting at 95, extra warm-ups "+25 lb"
    - cues "aim ~3–6 · stop at RPE 9" and "Add 25–50 lb"
  - **Server:** the ramp is 55/75/90 (`_shared/standing-plan/warmup.ts:76`), with `PRETEST_STEPS` in `working-number.ts:121` (traced). Searching for `0.88` for strength finds nothing.
  - **Move:** the server builds test sessions as `set_plan` rows; the phone prints them. **M**
- **H-S02** `src/components/StrengthLogger.tsx:1329-1399, 4439-4470`
  - **Decides:** on a test with no max on file, sets 2 and 3 fill at A×1.10 and A×1.15 from the unrounded typed weight. The note and hints are phone-written.
  - **Server:** `working-number.ts:121-132` rounds A first (243), so A=137 gives 160 on the phone and 155 on the server (traced).
  - **Move:** the row carries the steps and the rounding rule. **S**
- **H-S03** `src/components/StrengthLogger.tsx:2243-2384, 5487-5515`
  - **Decides:** on old rows without computed steps, weight = typed 1RM × a percent parsed from the description, rounded to 5 lb. An unrecognised lift maps to squat, and a "Choose one:" menu is built from "OR" text.
  - **Server:** `materialize-plan/index.ts:858-870` (traced).
  - **Move:** delete; materialize old rows first. **S**
- **H-S04** `src/components/StrengthLogger.tsx:2492, 2574`
  - **Decides:** every weight the server sends is re-rounded to 5 lb with a 5 lb floor before the athlete sees it.
  - **Server:** its rounding knows metric (2.5 kg, `materialize-plan/index.ts:858`, traced).
  - **Move:** print the server weight unchanged. **S**
- **H-S05** `src/components/StrengthLogger.tsx:2686-2819, 6404-6438`, `src/lib/exercise-config.ts:3793-3800` (`normalizeLiftKey`)
  - **Decides:** the logger reads the last 10 workouts and 400 `exercise_log` rows and fills last time's weight and the "Previous" column, matching names its own way. "Barbell Back Squat" does not find a logged "Back Squat".
  - **Server:** `_shared/last-weight-by-movement.ts:19-36` and `workout-detail/index.ts:1067` `previous_strength_by_exercise`, both keyed on `canonical_name` (traced).
  - **Move:** the logger's session payload carries previous sets per exercise from the server. **M**
- **H-S06** `src/lib/canonicalize.ts:6-34` (`StrengthCompareTable.tsx:70, 266`, `StrengthPerformanceSummary.tsx:339, 354`, `StrengthSummaryView.tsx:39`)
  - **Decides:** the phone's own exercise-name key, used to pair planned and done rows.
  - **Server:** `_shared/canonicalize.ts:145` is a 353-line function. Both were run on 17 names and 11 gave different keys: Chin-Up, Dips, Push-Up, Lat Pull Down, Dumbbell Rows, Barbell Back Squat and others.
  - **Can disagree:** "Previous" stays blank for Chin-Up, Dips and Push-Up, and a "Barbell Back Squat" plan can show as missed while the server counts it done.
  - **Move:** import `@shared/canonicalize` (as `StrengthLoggedSets.tsx:9` already does) and delete the copy. **S**
- **H-S07** `src/lib/strength-rest-timer.ts:37-206` (`StrengthLogger.tsx:565, 3077-4348`)
  - **Decides:** how long every rest countdown runs (90 s default; a 150/120/90/75/60 ladder by name), when rest starts, and when it is skipped.
  - **Server:** has no rest minutes; searching for `rest_seconds|restSeconds|REST_BY_SLOT` finds no strength hit. The file marks its minutes as ours (127). A plyo regex rests "Explosive Step Up" 150 s as a jump while the logger draws it a dumbbell box.
  - **Move:** compose stamps `rest_seconds` on each set. **M**
- **H-S08** `src/components/StrengthLogger.tsx:1160-1169, 4167-4237`
  - **Decides:** which set becomes the athlete's saved max (rep-max set, AMRAP set, or a working set at RIR 2-3), and which lift key a name maps to.
  - **Server:** `save-baseline-test` only fixes key spellings and checks no set (traced). `analyze-strength-workout/index.ts:762-771` keeps a second key map. "Pull-ups" gets no key on the phone and `pullupMaxReps` on the server.
  - **Move:** send all test sets; save-baseline-test picks the set and the key. **M**
- **H-S09** `src/components/StrengthLogger.tsx:729-750, 6370-6376, 6749-6757`, `src/lib/estimate-1rm.ts:84`
  - **Decides:** "PR — new best — est. 1RM X lb" when an AMRAP's estimate beats the stored max. There is no rep ceiling, so 105 × 35 earns the badge. The max to beat is found by substring, so a front squat is compared with the back squat.
  - **Server:** flags `is_rep_record` and `estimate_trusted` with a 10-rep ceiling (`_shared/strength/all-out-set.ts:147, 156`, traced).
  - **Move:** the row carries the record to beat from the server, or the badge comes off. **M**
- **H-S10** `src/components/StrengthSummaryView.tsx:43-56, 108-110` (rendered through `WorkoutDetail.tsx:228`)
  - **Decides:** "(PR)" when the newest best weight equals the 12-week max, and "N% of max".
  - **Server:** the rep-record rule is different; searching for `percent_of_max` finds nothing.
  - **Move:** print the server flag and drop the percent. **S**
- **H-S11** `src/components/StrengthCompareTable.tsx:381-382, 507-519, 608-625`
  - **Decides:** average RIR "x.x / target", the amber warning, and advice such as "Going too hard — reduce weight". It uses its own rule when the server verdict is null, includes auto-filled RIR, and never reads the server average.
  - **Server:** `strength_rir_summary` with `avg_rir` and `rir_verdict` (`session-detail/build.ts:1237-1246`, traced).
  - **Move:** print those and a server sentence. **S**
- **H-S12** `src/components/StrengthCompareTable.tsx:266-322, 385, 555-568`, `StrengthPerformanceSummary.tsx:335-377`
  - **Decides:** pairs planned and logged rows (including swaps), labels rows "not logged" or "not in the plan", and prints "Completed X of Y exercises" with its own fuzzy matching.
  - **Server:** `_shared/strength/match-exercises.ts:244`. `analyze-strength-workout/index.ts:1291-1292` has the counts, but they are not on `session_detail`.
  - **Move:** session_detail returns one row per planned slot with its status, plus the filled/planned count. **L**
- **H-S13** `src/components/StrengthCompareTable.tsx:375, 443-445, 857-891`
  - **Decides:** "N of 25 reps", the "Planned 3×6-12 · by feel" header, and a volume delta coloured green or red by its sign. Typed but unticked sets are counted, while the logger's countdown counts ticked sets only.
  - **Server:** `strength_volume` and `strength_volume_deviation` (build.ts:1235, traced).
  - **Move:** session_detail sends reps done and target per slot plus a deviation direction. **M**
- **H-S14** `src/components/StrengthPerformanceSummary.tsx:158-168, 408-417`
  - **Decides:** the Total Sets and Total Reps tiles count any set with reps, ticked or not. Planned "4-6" prints as the midpoint "5" (no source).
  - **Server:** `compute-facts/strength-facts-lib.ts:134-260` counts completed sets (grep only).
  - **Move:** put the facts' totals on session_detail and pass the band as text. **S**
- **H-S15** `src/components/StrengthCompletedView.tsx:81-85, 202-223, 264-265, 365-376, 478-493`
  - **Decides:** "X lbs total", per-exercise volume and the Sets/Reps/Volume tiles, as reps × weight only when weight is above 0. Chin-ups and banded sets count as 0 while Performance prints the server total.
  - **Server:** `strength_volume` is already passed into this component (line 21).
  - **Move:** print `completed_total_lb` and each exercise's `volume_lb`. **S**
- **H-S16** `src/components/StrengthPlansView.tsx:105-109`
  - **Decides:** prints the fixed text "Current Plan: Strength Foundation - Wk 3 · Progressive Overload" when the strength discipline is picked (`AppLayout.tsx:1536-1540, 1656`).
  - **Move:** print the real plan and week from the server, or delete the screen. **S**
- **H-S17** `src/components/StrengthLogger.tsx:6678-6679`
  - **Decides:** an AMRAP with no target reads "AMRAP · 5 minimum". No source for 5.
  - **Move:** print nothing when the row has no target. **S**
- **H-S18** `src/lib/fold-lift-slots.ts:94-243` (`StatePerformanceSection.tsx:523, 1101`)
  - **Decides:** folds trap bar into deadlift and re-runs the heaviest-set-per-week rule. That changes the deadlift's e1RM, best, session count, as-of date and PR tag.
  - **Server:** `_shared/state-trend/assemble.ts` runs the weekly rule on unfolded lifts; the per-slot merge was filed but not built. Coach and Performance read the unfolded numbers.
  - **Move:** fold per slot inside `assemble.ts` and delete the phone fold. Redeploy every importer. **M**
- **H-S19** `src/lib/sport-summary.ts:81-105` (`StatePerformanceSection.tsx:1114-1121`)
  - **Decides:** "+5 since the block opened" per lift, measured from the lowest week point with plan week 1 or less as the opening week.
  - **Server:** searching for `blockStart|since_block` in state-trend finds nothing. No source.
  - **Move:** each lift row carries its delta since the block started. **S**
- **H-S20** `src/components/context/StrengthLoggedSets.tsx:69-81`, `StateTab.tsx:719-736`, `src/hooks/useExerciseLog.ts:55-114`, `src/lib/estimate-1rm.ts:187-217`
  - **Decides:** from the phone's own `exercise_log` query: which accessories are listed (2+ sessions, up to 8), each one's "best set", and which main-lift row gets the "best" tag from the last 5 sessions.
  - **Can disagree:** the card above prints the server's all-time best under the same word.
  - **Move:** compute-snapshot sends the logged-sets block with the best flags. **M**

### State, Profile and baselines (17)

- **H-B01** `src/contexts/AppContext.tsx:332-389`, `src/lib/run-pace-calibration.ts:101-175`, `src/lib/effort-score.ts`, `GoalsScreen.tsx:1150-1168, 2099-2118`
  - **Decides:** saving a 5K makes the phone compute the effort score and five training paces and write them to `user_baselines`. The Goals "derived training zones" card prints Tempo as a threshold derived from the 5K, which the server resolver no longer does (`resolve-current-run-pace.ts:322-326`). When calibration returns null, it falls back to fixed paces `{585, 537, 491, 449, 422}` s/mi (no source).
  - **Server:** its own copy is `generate-run-plan/effort-score.ts` (the VDOT tables match; the marathon fallback differs, traced). 17 server files read `effort_paces`.
  - **Move:** the 5K save goes through an edge function using the server copy; delete the phone math and the fallback. **M**
- **H-B02** `src/components/TrainingBaselines.tsx:936, 987-1036`
  - **Decides:** on any save touching heart rate, the phone builds Friel or Karvonen zones (resting heart rate defaults to 60) and writes `configured_hr_zones` for run, ride and default.
  - **Server:** `compute-workout-analysis/index.ts:1656-1681` uses those arrays first to bin every workout's heart rate, ahead of its own threshold path (traced). `_shared/endurance/hr-zones.ts` has the formula, but nothing on the server writes the column. The zones stay frozen until someone saves on this screen.
  - **Move:** a server function writes the zones from the resolvers; the phone sends only manual overrides. **M**
- **H-B03** `src/components/TrainingBaselines.tsx:815-829, 1274-1313`
  - **Decides:** Profile's threshold heart rate: the resolver's value, else max × 0.88, else age estimate × 0.88. Max heart rate: typed, else the raw learned value without the sample check, else age. The zone table is built from those.
  - **Server:** `resolve-current-lthr.ts:39, 54, 149, 215` says it never estimates, and that 88% of max never anchors (traced). The screen prints numbers the engine refuses to use. The 0.88 has no source.
  - **Move:** the baselines read returns threshold, max, zones and the source line per sport. **M**
- **H-B04** `src/components/WelcomePage.tsx:296-304, 457-463`, `src/lib/friel-zones.ts:36, 40`
  - **Decides:** the sign-up screen's easy heart-rate range is 0.85 to 0.89 × threshold.
  - **Server:** `resolveRunEasyHrBand` in `_shared/easy-hr.ts:113-133` uses 0.70 to 0.89 (traced). A run at 75-84% of threshold is below the Welcome range but counts as easy on the server.
  - **Move:** the server returns the easy band; Welcome prints it. **S**
- **H-B05** `src/components/TrainingBaselines.tsx:890-900, 1377, 1394-1406`
  - **Decides:** power zones from FTP: 7 zones, Z6 121-150%, Z7 above 150%.
  - **Server:** has two other tables. `analyze-cycling-workout/index.ts:443-450` uses 6 zones with Z6 120-200%. `compute-workout-analysis/index.ts:1752-1760` is open-ended above 150% (traced). Profile and the two analyzers print three tables.
  - **Move:** one server table returned with the FTP. **S**
- **H-B06** `src/lib/swimPaceZones.ts:34-45` (`TrainingBaselines.tsx:1414-1437`)
  - **Decides:** five swim pace zones at +12/+8/+3/−2 seconds per 100 from threshold. No server copy (searched `swimPaceZones|deriveSwimPaceBands|per_100` offsets). The only citation is a docs file.
  - **Move:** return the bands with the baselines read. **S**
- **H-B07** `src/lib/sport-summary.ts:113-126` (`StatePerformanceSection.tsx:1150-1164, 1199-1225`, `StrengthReadCards.tsx:197-205`, `TrendSparkline.tsx:88-123`)
  - **Decides:** the chart headline numbers, "aerobic efficiency 1.498 · 12-week trend · from 1.650", from a straight-line fit on the phone, with "too few for a trend" below 3 points.
  - **Server:** has no fit (searched `fitTrend|trendline|linearFit`). Its direction verdict is the last 28 days' average against the 28 before (`state-trend/classify.ts:6-7, 83`, traced). The fitted line can fall while the verdict says improving.
  - **Move:** assemble.ts sends the fit's start, end, weeks and count. **M**
- **H-B08** `src/components/context/StateTab.tsx:672-675`, `TodaysEffort.tsx:1623-1648`
  - **Decides:** "Form −32 — high risk (TrainingPeaks)" and the zone word beside form, both run through the shared `formZone` on the phone.
  - **Server:** `coach/index.ts:4508` sends `load.label`, and `2889-2893` builds the same sentence with recovery wording on recovery and taper weeks (traced). The phone ignores the week's intent.
  - **Move:** print the coach's headline and label. **S**
- **H-B09** `src/contexts/AppContext.tsx:573-625` (Goals "Week N" at `GoalsScreen.tsx:1650, 1870, 2300`), `src/components/AllPlansInterface.tsx:534-583, 975-981, 1931, 2165-2171, 2271`
  - **Decides:** the current plan week, "Week N of M" and the progress %. AppContext does not move the start date back to its Monday. AllPlansInterface prefers the week-1 row date over the configured start.
  - **Server:** `get-week/index.ts:183-199, 1360-1378` moves the start to Monday and prefers the configured start. `resume-plan` rewrites that start (traced). A plan that starts mid-week or was resumed shows a different week on Goals than on Today.
  - **Move:** the plans read carries `current_week_index` from `resolvePlanWeekIndex`. **S**
- **H-B10** `src/components/context/StateTab.tsx:239-348, 442-466`
  - **Decides:** after race day, the phone finds that day's run (the longest), shows "Your finish (from log)", days since, and the gap to the model.
  - **Server:** `complete-race` uses the same finish helper but may pick a different workout. Coach's `last_completed_race` exists only after a result is recorded.
  - **Move:** coach sends the unofficial finish using complete-race's pick. **M**
- **H-B11** `src/components/AthleticRecordPage.tsx:324-329, 347-350, 575-576`
  - **Decides:** "Personal records": the marathon is the first goal matching /marathon|26\.2|42/ in a newest-first list, so it is the most recent race, not the fastest, and a half marathon also matches. "FTP (best)" prints the current FTP.
  - **Server:** has no record payload (searched `marathon_pr|personal_record|longest_ride`).
  - **Move:** a server record payload with the best finish per distance and the best FTP with its date. **M**
- **H-B12** `src/components/AthleticRecordPage.tsx:383-420, 599-626`
  - **Decides:** "Logged suggests N (+x%) Update" for four lifts and swim ignores locks. Update writes `performance_numbers` directly, so a locked lift prompts here but not on Profile.
  - **Server:** same code as the server for lifts (`resolveStrengthCapacity`), which respects locks.
  - **Move:** coach or arc sends per-lift suggestions; both screens accept through one endpoint. **M**
- **H-B13** `src/lib/run-pace-calibration.ts:48-57` (`NonRaceBuilder.tsx:2459-2495`)
  - **Decides:** whether the race intake stops the athlete to calibrate pace before Build. The phone's check needs a plain number, but learned paces are stored as `{value, confidence}`, so a learned pace never counts.
  - **Server:** `create-goal-and-materialize-plan/index.ts:295-303, 3910-3921` reads `.value` at medium or high confidence (traced). An athlete whose only pace is learned is asked to calibrate when the server would build.
  - **Move:** the builder's baselines read returns `has_pace_benchmark`. **S**
- **H-B14** `src/lib/resolve-current-5k-pace.ts:217-249` via `NonRaceBuilder.tsx:2115-2121`
  - **Decides:** the hard run day is offered when a 5K is on file.
  - **Server:** materialize-plan prices hard runs from threshold pace (`materialize-plan/index.ts:3959`, traced), and the 5K no longer derives threshold. An athlete with only a 5K is offered a hard run that builds with no pace target.
  - **Move:** the server returns which hard days it can price. **M**
- **H-B15** `src/lib/race-finish-seconds.ts:19-33` with `GoalsScreen.tsx:863-944, 1021-1092, 1570-1629`, `AthleticRecordPage.tsx:194-247`
  - **Decides:** a race goal's result. The phone takes the longest elapsed time among run, ride or swim workouts on race day and writes the goal's status, `current_value` and `race_result` directly.
  - **Server:** `complete-race/index.ts:154` picks the best matching run and needs a plan id. `_shared/auto-complete-goals-from-workouts.ts:21-90` writes `target_time`, never `current_value`. The phone's finish formula is a copy of `_shared/race-finish-seconds.ts` (identical today). For ride and swim goals the phone is the only writer.
  - **Move:** complete-race accepts a goal id for all sports and writes `current_value`; the phone calls it. **M**
- **H-B16** `src/components/GoalsScreen.tsx:946-1019, 1046-1067`
  - **Decides:** plans get ended automatically when the Goals screen opens. A plan is matched to a finished goal by goal id, `goals_served`, or **a name substring**, and each match gets `end-plan`. A name substring can end an unrelated plan.
  - **Server:** complete-race ends only its own linked plan; there is no name matching (traced).
  - **Move:** the server ends linked plans when a goal completes; delete the phone sweep. **M**
- **H-B17** `src/components/GoalsScreen.tsx:598-692, 2624-2750`
  - **Decides:** pre-picks the training level (vDOT ≥45/≥33, or ≥30/≥12 mi a week), the goal type and the strength track (any estimated 1RM over 100, or lifting in 2 of the last 4 weeks), with "From your fitness score (N vDOT)". None of the cut-offs has a source.
  - **Server:** `_shared/infer-training-fitness.ts:92` `inferTrainingFitnessLevel` returns immediately when the form sends a level, so the phone's pick replaces the server's inference (traced).
  - **Move:** send no level; get-arc-context returns the suggestion and its reason. **M**

### Plans and goals (8)

- **H-P01** `src/components/AllPlansInterface.tsx:1406-1458`
  - **Decides:** Resume from the plan detail view shifts the start date by the raw days paused and writes the plan row directly.
  - **Server:** `resume-plan/index.ts:95-135` aligns to Monday, clears the pause marker and keeps a resume history. The Past Plans Resume button uses it (2574). The two Resume buttons give different dates to every session.
  - **Move:** the detail Resume calls `resume-plan`. **S**
- **H-P02** `src/components/AllPlansInterface.tsx:969, 1590-1619, 1933-1959, 2150-2161`
  - **Decides:** the plan's "total" hours, "avg/wk" and "workouts". They are summed over only the weeks opened on this visit, then divided by the full plan length, so the numbers change as the athlete taps weeks.
  - **Server:** has no plan total (searched `estimated_hours|total_miles`).
  - **Move:** a server plan summary. **M**
- **H-P03** `src/components/AllPlansInterface.tsx:2299-2359`, `GoalsScreen.tsx:152-167, 1448, 1517-1538`
  - **Decides:** the phase label. AllPlansInterface guesses Taper, Deload or Peak by regex on the week's text, else Build, then sums miles and time per guessed phase. The Goals strength card prints the raw phase name and its own progress %.
  - **Server:** `_shared/plan-phase.ts:57, 159` and get-week's phase word (1294-1326) include base, recovery and test.
  - **Move:** the week payload carries the phase word and phase totals. **M**
- **H-P04** `src/components/AllPlansInterface.tsx:668-715, 760, 797-841, 902-920`
  - **Decides:** plan-list session text when a row has no rendered description. `{5k_pace}` comes from the shared resolver. `{easy_pace}` comes from the raw typed value, which is no longer saved, so older rows show a stale pace. It also does pace arithmetic, adds ±4%/±6% ranges and estimates minutes by regex.
  - **Server:** materialize-plan writes `rendered_description` and `computed`.
  - **Move:** print only server text; for a week not yet built, call get-week. **M**
- **H-P05** `src/components/WeekGrid.tsx:55-60, 82-118, 220-277`
  - **Decides:** on the "Sample week" preview, the phone counts training, rest and lift days, sums "about Xh a week", and writes two sentences:
    - "This week is arranged to balance the stressors — lifting on …", treating a session as hard when its name starts with "Hard" and as long at 75 minutes or more
    - "Press days sit together on purpose", from a name regex
  - **Server:** searching for these sentences finds nothing; the server sends only `placement_compromises`.
  - **Move:** the preview returns a week summary and notes. **M**
- **H-P06** `src/components/RunStrengthWeekCard.tsx:90, 118-122`, `src/lib/run-strength-week.ts:21-68`, `NonRaceBuilder.tsx:3818-3834`
  - **Decides:** "Easy run · 30 min", long-run chips up to 90 with 75 pre-selected, and writes 30 and the default into the payload. 90 and 75 have no page and no ours marker. The card's own comment says the engine says 59 minutes where built plans read 25.
  - **Server:** has none of the three numbers (searched `EASY_RUN_FIXED|LONG_RUN_CHIP`).
  - **Move:** put them on the frame in `_shared/standing-plan/frames.ts`. **S**
- **H-P07** `src/lib/run-volume-tables.ts:406-435, 463, 480, 588-592, 631-670, 717-735`, `NonRaceBuilder.tsx:624-630, 2439-2446, 3323-3374, 4593-4598, 4697, 4777-4822, 7675, 7840`
  - **Decides:** the race intake's numbers:
    - "About N weeks of training", with the phone capping at 20
    - the weekly-mileage floor, "The plan will open near N"
    - "You have entered X miles a week. This tier assumes about Y."
    - "longest run reaches about N", and whether the half marathon is offered
  - **Server:** the long-run tables are shared, but no server code calls these functions. The 0.7 start clamp is a hand copy of `generate-run-plan/base-generator.ts:216`. The server's week count and fatigue guards differ (`create-goal-and-materialize-plan/index.ts:270, 3634, 3895-3911`). The 25% trigger and the 0.35/0.30 long-run share have no source.
  - **Move:** the preview returns weeks, week-one volume, peak long run and the advisory lines. **M**
- **H-P08** `src/lib/session-frequency-defaults.ts:259-394` via `ArcSetupWizard.tsx:638-673, 1821-1870, 1889`
  - **Decides:** the hours cards' "X swims · Y bikes · Z runs", and a frequency object sent in the payload. The card leaves out the limiter sport and swim intent, and clamps 4 days to 5 while the payload passes 4.
  - **Server:** same code (`generate-combined-plan/reconcile-athlete-state-week-optimizer.ts:103-128`), but the limiter-sport shift runs only there. The payload copy is never read.
  - **Move:** the server returns per-tier counts for the athlete's answers; drop the payload field. **M**

### Plan builder and setup wizard (10)

- **H-W01** `src/components/NonRaceBuilder.tsx:1578-1579, 2903-2907, 3090-3103, 6887-6891`, `src/lib/non-race-goal-seeds.ts:194, 204`
  - **Decides:** when the athlete never taps the long day, the build gets Sunday (long run) or Saturday (long ride), while the chip above shows the phone solver's suggested day labelled "— yours".
  - **Server:** `create-goal-and-materialize-plan/index.ts:2797` forwards the day as a pin (traced).
  - **Move:** drop the Sunday/Saturday fallback; the chip prints the preview's day. **S**
- **H-W02** `src/components/wizard/KnowYourNumbersStep.tsx:59-76, 122-146, 170-177`
  - **Decides:** which lift numbers the Strength row prints, their source, and whether "Use current" or "Retest" is the default. The phone order is locked, then typed, then learned.
  - **Server:** `_shared/state-trend/capacity-resolver.ts:155-176` orders locked, then trusted learned (3+ samples, fresh), then typed (traced). The row can show the typed number while the block prices off the learned one.
  - **Move:** use the shared resolver's output. **S**
- **H-W03** `src/components/NonRaceBuilder.tsx:3673-3681, 4122`, `src/lib/baseline-tests.ts:27-100` (also `TrainingBaselines.tsx:342, 362`, `StateAdjustLens.tsx:233`)
  - **Decides:** the phone builds FTP and threshold test sessions and inserts them into `planned_workouts`: name, description with the 88% and ×0.95 rules, steps, and 45/60/40-minute lengths with no source. After a build they are dated start + 4 and start + 2 days and labelled week 1. The offset is added to the raw picked date, not the Monday the server snaps to, so a Sunday start + 4 lands in week 2 labelled week 1.
  - **Server:** nothing builds these rows (searched `run_tt_12min|RETEST_OFFSET|baseline_numbers`).
  - **Move:** create-goal builds week-one tests inside the plan's own week 1, and an edge function builds a standalone test. **M**
- **H-W04** `src/lib/suggest-hard-days.ts:161-555`, `NonRaceBuilder.tsx:2651-2656, 2830-2917, 3105-3118, 7160-7204`
  - **Decides:** pre-fills hard and long days with the phone's week-model solve, using its own session list (3 lifts at 60 minutes, hard 45, long 90). Until the preview returns (or when it fails) it shows "Balanced week — spacing and recovery rules all met" or "High fatigue risk: N collisions".
  - **Server:** Standing Plan weeks are placed by `chooseDayMap` (`generate-strength-plan/index.ts:571`), a different function. `NonRaceBuilder.tsx:2908-2912` records the phone saying "balanced" over a week the server built with two hard runs on one day.
  - **Move:** show no verdict until the preview; take suggested days from the preview. **M**
- **H-W05** `src/lib/standing-plan-week-bounds.ts:76-752`, `EnduranceWeekCard.tsx:213-220, 260-289, 307-309, 404-470, 1070-1113`
  - **Decides:** the endurance intake:
    - minute choices per row, the fixed minutes or "length varies"
    - dropping a picked length when the sport changes, and whether an hours dial exists
    - the experience chip numbers ("two hard sessions · 66 min max · needs 5h/wk")
    - the slot answers sent to the server
    - when a row is left empty, restoring the frame's full option list, which can offer a sport the engine's floor withheld (414-417)
  - **Server:** has the pieces as shared code, but this file assembles them privately; only a server test imports it. The file records four past mismatches: 89 vs 69 min, 3h46 vs 4h15, 10.3 mi against a 6-9 cap, and blank chips.
  - **Move:** the preview returns per-row options, fixed minutes and chip numbers. **L**
- **H-W06** `src/components/NonRaceBuilder.tsx:3270-3287, 5245`
  - **Decides:** the race week card says "two hard days back to back … 48 to 72 … It is kept as you set it" and "The plan will keep the long run there and place its hard session elsewhere". That predicts race-path placement the server never confirms.
  - **Move:** the race preview returns the conflict note. **S**
- **H-W07** `src/components/NonRaceBuilder.tsx:1048-1060, 2264-2266, 5011, 5306-5312`, `ArcSetupWizard.tsx:1934-1986, 2108-2140`
  - **Decides:** the equipment tier. It sets the default strength protocol and options, "Your equipment on file is bodyweight and bands …", the season wizard's required "Equipment doesn't support performance protocol" checkbox, and "No 1RM data on file".
  - **Server:** `_shared/strength-equipment-tier.ts:61-91, 247-264` counts two compound 1RMs as full barbell (the phone ignores 1RMs). It needs barbell plus plates, a rack or a commercial gym, where the phone accepts any chip containing "bar" or "rack" (traced).
  - **Move:** get-arc-context returns the tier and the gate verdict. **S**
- **H-W08** `src/lib/enrichArcGoalTrainingPrefs.ts:6-92` (`arc-setup-persistence.ts:313`)
  - **Decides:** before the goal is inserted, the phone fills fitness level, goal type, training intent, strength frequency 2, equipment defaults, limiter sport and tri approach.
  - **Server:** `create-goal-and-materialize-plan/index.ts:753-833` fills only blanks, so the phone's values win. The limiter rules differ: the server says bike when no FTP resolves but learned fitness exists; the phone says run (traced).
  - **Move:** delete the phone enrichment. **S**
- **H-W09** `src/components/NonRaceBuilder.tsx:1503-1506, 1543-1550, 2049-2051`
  - **Decides:** on the race path the phone computes weekly hours from miles × easy pace (10:00/mi fallback) × 1.2. That is then overwritten by 6 hours, stored on the goal, and printed in the plan export as "6 h/wk", a number the athlete never gave.
  - **Move:** stop sending it on the race path. **S**
- **H-W10** `src/components/NonRaceBuilder.tsx:3690-3705, 3849-3855, 6139-6141`, `ArcSetupWizard.tsx:66-213, 612-620, 1206-1216, 1762-1771, 2312-2415, 2495-2497, 2686-2708`
  - **Decides:** four history-based lines, each from phone counts:
    - "Your history supports a N-session endurance week", from workouts already loaded counted back from today; the server counts 35 days from the block start (`generate-strength-plan/index.ts:365-392`, traced)
    - the setup wizard's run/ride/swim counts, "marathon-like" runs (38 km or more, or a name match) and advice sentences from cut-offs 10/6/3/1 runs and 25/21 km, none sourced
    - its confirm screen's conflict rows and "No conflicts detected. Planner will optimize spacing."
    - "N weeks to race", rounded where the server rounds up
  - **Move:** the preview and get-arc-context return these counts and lines. **M**

---

## MEDIUM — 96

### Today, Week and the planned session (21)

- **M-T01** `src/lib/today-lines.ts:108-143`, `SessionDeck.tsx:96-113`
  - **Decides:** the spacing line and which half of the day gives way ("Lift first, make the ride easier" or "Run first, skip the skill work"), from the ride's `band:` tag and the lift's slot intents.
  - **Server:** writes "Six to eight hours between them" only for two hard endurance sessions (`_shared/standing-plan/week-conflicts.ts:525-548`). Compose already shortens the easy run on a heavy leg day (507). Searching for "Six to eight hours apart|Lift first, make the" finds nothing.
  - **Move:** compose stamps a day note per date. **M**
- **M-T02** `src/lib/today-lines.ts:147-223`, `StrengthLogger.tsx:90-91, 589-594, 2060-2085, 6134-6199, 6331-6344`, `src/lib/exercise-config.ts:3380`, `src/lib/strength-focus-copy.ts:410, 495, 564-581`
  - **Decides:** the lift cue per slot intent, and "Bar slows" against "Move slows" from the exercise's display format. The same cue table is written again in StrengthLogger, together with the bar-speed line (deadlift name regex), the HYP line and the per-set cues.
  - **Server:** stamps `slot_intent` (`compose.ts:1655, 1824`) but no cue. Searching for the cue strings finds only a comment (`compose.ts:2950`).
  - **Move:** compose stamps the cue and kind label on each row. **M**
- **M-T03** `src/lib/today-lines.ts:236-276`
  - **Decides:** the endurance family line by `family:` tag.
  - **Server:** searching for "without falling apart|Talk test twice" finds nothing.
  - **Move:** the endurance library stamps the line on the row. **S**
- **M-T04** `src/components/SessionDeck.tsx:415-465` (`TodaysEffort.tsx:2182`), `WorkoutCalendar.tsx:1445, 1531-1581`
  - **Decides:** "planned on a past day = missed" (red on Week), card or pill, by the device's local date.
  - **Server:** get-week has no missed state (searched "missed"); `_shared/athlete-timezone.ts` exists.
  - **Move:** get-week stamps a display state per item in the athlete's timezone. **S**
- **M-T05** `src/components/WorkoutCalendar.tsx:754-962`
  - **Decides:** merges planned and completed rows, hides planned rows linked to a completed one, filters future rows by status against the device date, and de-dupes by id. CLAUDE.md says the phone never merges the two tables for the calendar.
  - **Move:** get-week returns one line per calendar entry. **M**
- **M-T06** `src/lib/session-discipline-swap.ts:315-350`, `WorkoutCalendar.tsx:224-242`
  - **Decides:** easy/hard/long banding, falling back to a name regex and a hand tag list with a default of easy.
  - **Server:** only composed rows carry `band:`; week-conflicts classifies load separately. Rows from other generators get banded by regex.
  - **Move:** every generator stamps an intensity band. **M**
- **M-T07** `src/lib/session-discipline-swap.ts:289-301` (`StructuredPlannedView.tsx:61-63, 882`, `PlannedWorkoutSummary.tsx:323-350`)
  - **Decides:** "Hard ride, no target" and "Swapped from your planned run. Same time, same effort."
  - **Move:** get-week sends the swap block. **S**
- **M-T08** `src/lib/provider-attribution.ts:34-131`
  - **Decides:** whether a row is Garmin data: 8 device family names, id prefixes, two row shapes. It builds "Garmin Edge 540 via Strava", which the brand guidelines require on every surface.
  - **Server:** ingest stores `device_info` (`ingest-activity/index.ts:553, 1201`) but writes no attribution text.
  - **Move:** ingest stamps the attribution on the workout. **M**
- **M-T09** `src/hooks/useGarminDataPresence.ts:24-49`
  - **Decides:** whether the Garmin derived-data footer shows, from two direct table reads and a scan of loaded rows.
  - **Move:** the server returns one boolean. **S**
- **M-T10** `src/lib/associate-candidates.ts:82-155`, `AssociatePlannedDialog.tsx:22, 56-126, 247-283`
  - **Decides:** a completed activity "missed" a planned session (no sport check), "Didn't match your planned run — link it?", and the link candidates (±7 days, nearest first).
  - **Server:** `auto-attach-planned/index.ts:411-470` matches the same sport, same day ±1, with duration gates (traced).
  - **Move:** get-week sets the owed planned id; auto-attach returns candidates. **M**
- **M-T11** `src/lib/derive-workout-title.ts:89-219`, `UnifiedWorkoutView.tsx:647-846`, `TodaysEffort.tsx:1416-1453`
  - **Decides:** session titles by pattern ("Run — Tempo", "Long Run", "Treadmill"), with two different phone helpers on two screens.
  - **Server:** searching for `display_title|deriveWorkoutTitle` finds nothing.
  - **Move:** get-week and workout-detail send a display title. **M**
- **M-T12** `src/lib/build-arc-line.ts:20-82`, `TodaysEffort.tsx:281-298, 2131-2141`
  - **Decides:** "Build · Race in 6 weeks" (weeks from the device date) and the empty-day words "Rest", "No effort logged" or "No effort scheduled".
  - **Move:** get-arc-context returns the line. **S**
- **M-T13** `src/lib/analysis-state.ts:25-116`
  - **Decides:** "Analysis did not finish." after 10 minutes by the phone clock (ours).
  - **Move:** get-week computes the analysis state on server time. **S**
- **M-T14** `src/components/StructuredPlannedView.tsx:339-356`, `PlannedWorkoutSummary.tsx:466-485`
  - **Decides:** "heart rate first, pace as reference" and its words, in two private copies.
  - **Server:** its own talk-test sentence differs (`_shared/endurance-library/source-rules.ts:1317-1320`).
  - **Move:** materialize writes the cue text per step. **S**
- **M-T15** `src/components/PlannedWorkoutSummary.tsx:486-583`
  - **Decides:** groups work and rest steps into "N × work (pace) rest" lines, detects strides by label, shows short steps in metres.
  - **Move:** materialize writes display lines. **M**
- **M-T16** `src/components/EnduranceIntervalTable.tsx:154-179`
  - **Decides:** hides stride rows on easy sessions by a length rule.
  - **Move:** the server marks rows collapsed. **S**
- **M-T17** `src/components/RescheduleValidationPopup.tsx:169-213, 255-261, 359, 400-403, 450`
  - **Decides:** the headline words by severity, recovery and taper sentences that include emoji, "No issues detected", target dates from offsets, and hiding Confirm.
  - **Move:** the server returns headline, context line, `can_confirm` and target dates. **S**
- **M-T18** `src/components/UnifiedWorkoutView.tsx:1868-1933`
  - **Decides:** applies a reschedule option on the phone. "Skip" here **deletes** the planned row, while Today's skip (`TodaysEffort.tsx:833-862`) keeps it marked skipped.
  - **Move:** validate-reschedule applies the option, and skip writes the status. **M**
- **M-T19** `src/components/StructuredPlannedView.tsx:69-76, 284-298, 852-855, 897-904`
  - **Decides:** the snorkel note, "Unstructured session — ride with the group", and hiding board and buoy on drills.
  - **Move:** materialize writes session notes. **S**
- **M-T20** `src/components/planned/SkipSessionReasonPanel.tsx:78-89`, `src/lib/skip-session-reasons.ts`
  - **Decides:** the 8 skip reasons.
  - **Server:** the coach reads the codes (`coach/index.ts:524`). A code change on the phone silently changes what the coach reads.
  - **Move:** move the list to `_shared`. **S**
- **M-T21** `src/lib/standing-plan-week-copy.ts:686-795`
  - **Decides:** removes the Ride chip from the last run in the week and prints "This is the last run in the week…" (ours).
  - **Server:** has no ground-impact rule (searched `impactFloor|ground_impact`).
  - **Move:** the preview carries whether the floor holds. **S**

### Session details (11)

- **M-D01** `src/components/SessionNarrative.tsx:262-269, 453-483`
  - **Decides:** hides server rows (Cardiac Drift, Aerobic Efficiency, Interval Summary) whenever the unrendered summary bullets exist, renames Conditions to Terrain by pattern, and caps and orders the list.
  - **Move:** build.ts emits one ordered row list. **S**
- **M-D02** `src/components/AdherenceChips.tsx:139-153, 237-246, 264-269, 286-293, 322-330`
  - **Decides:** the "· measured" / "· est." suffix, the "usual lo–hi" subtitle, a duration % fallback, hiding all chips at zero, and the open-water "Xs/100yd faster/slower".
  - **Move:** the execution block sends value, label and subtitle per chip. **M**
- **M-D03** `src/components/MobileSummary.tsx:332-389`
  - **Decides:** the bike "Heart rate at easy power" block reads `workout_analysis` directly and writes "est (FTP)", "measured in your X–Y W range" and "Lower over time means fitter".
  - **Move:** `session_detail_v1` carries the value and its line. **S**
- **M-D04** `src/components/WeatherDisplay.tsx:14-50`
  - **Decides:** the temperature sentence, with peak shown above +0.5° and "feels like" at 2° or more.
  - **Server:** `build.ts:175-190` words it differently on Performance.
  - **Move:** workout-detail sends the lines. **S**
- **M-D05** `src/components/EffortsViewerMapbox.tsx:679-692, 926-935, 1625-1636, 1794-1807, 2435-2443`, `src/utils/workoutNames.ts:34-65, 82-236`
  - **Decides:** indoor or outdoor is shared code, but the placeholder labels ("Zwift", "Virtual Ride — Virtual world map not available") and completed titles are phone copies. Garmin's `indoor_cycling` is not matched, so a Garmin trainer ride reads "Virtual Ride".
  - **Move:** `session_detail_v1` carries a venue label; ingest writes the display name. **M**
- **M-D06** `src/components/EffortsViewerMapbox.tsx:1637-1662, 1714-1789, 2007-2011`
  - **Decides:** the "N PRs" count and list (Strava `pr_rank` 1, rank shown at 10 or better).
  - **Server:** ingest already filters `pr_rank` 1 (`ingest-activity/index.ts:435`).
  - **Move:** the server sends the count and list. **S**
- **M-D07** `src/components/PostWorkoutFeedback.tsx:111-177, 639-665`, `TrainingBaselines.tsx:214-240, 1331-1357, 1371-1390, 1442-1455, 1483-1497`, `StateAdjustLens.tsx:106-171, 447-454`
  - **Decides:** three screens offer "use X" for a measured FTP or threshold pace and write `learned_fitness` directly on accept. The two accepts clear the manual flag by two different rules: FTP deletes the key, threshold sets it to "learned". The proposal logic is the same code as the server.
  - **Server:** `endurance-checkpoint/index.ts:25-26, 140, 209, 227` has the same accept.
  - **Move:** all three call endurance-checkpoint. **M**
- **M-D08** `src/components/workout-execution/ExecutionScreen.tsx:248-261`, `PreRunScreen.tsx:77-89`
  - **Decides:** "Target: x/mi" is the middle of the range, and treadmill mph is converted from that middle.
  - **Move:** print `paceTarget`. **S**
- **M-D09** `src/hooks/workout-execution/useWorkoutExecution.ts:190-213`, `ExecutionScreen.tsx:55-189, 245-268`, `useVoiceAnnouncements.ts:30-37, 178-246`, `PreRunScreen.tsx:298-316, 357-361`
  - **Decides:** every word on the recording screen and in the voice ("INTERVAL 3", "Hard", "Halfway", "200 meters to go"), which number is the big one, and emoji glyphs.
  - **Move:** the server writes the label, cue word and interval number per step. **M**
- **M-D10** `src/utils/formGogglesSwimScript.ts:84-236`
  - **Decides:** the FORM goggles script text, guessing effort from label words when intensity is missing.
  - **Move:** the server builds the script. **M**
- **M-D11** `src/services/ExerciseLibrary.ts:351-411` (`CoreTimer.tsx:16, 133-150`)
  - **Decides:** the core exercise list and prefills ("20", "60s"), with no source.
  - **Move:** serve from the server vocabulary, or drop the defaults. **S**

### Strength logger and strength screens (21)

- **M-S01** `src/lib/advance-nudge.ts:39-133` (`StrengthLogger.tsx:6207-6217`)
  - **Decides:** "Last time: 10 · 10 · 10 — top of the band with room to spare."
  - **Server:** searching for `advance-nudge` finds nothing.
  - **Move:** materialize writes the line on accessory rows. **M**
- **M-S02** `src/lib/exercise-alternatives.ts:78-417`, `src/lib/strength-intensity-tier.ts:52-103`, `StrengthLogger.tsx:101-110, 5794-5833, 5930-5931`
  - **Decides:** the swap list for rows without server `swap_options`. It has its own equipment test (kettlebell counts as dumbbells), curated families, a 0.20 tier cut and a private plyo ladder rule.
  - **Server:** stamps `swap_options` on frame accessory rows only (`compose.ts:2291-2298`).
  - **Move:** stamp `swap_options` on every strength row. **M**
- **M-S03** `src/components/StrengthLogger.tsx:613-694`
  - **Decides:** swap and add-to-plan write `plan_adjustments` directly, reverting earlier rows and setting 3 sets × 10 reps (a copy of `materialize-plan/index.ts:186-195`).
  - **Move:** one edge action owns the revert and the dose. **M**
- **M-S04** `src/components/StrengthLogger.tsx:4568-4580, 7017-7019`, `src/lib/logged-rep-entry.ts:40-66`, `src/lib/rir-format.ts:29-32`
  - **Decides:** the RIR auto-saved on Done (1.5 rounds to 2), where a typed 0 is allowed, and that blank sets cannot be ticked.
  - **Move:** the row carries `rir_seed` and `rep_floor`. **S**
- **M-S05** `src/components/StrengthLogger.tsx:1246, 2082, 5246-5253`
  - **Decides:** the Deload pill and cue from /deload/i in the session name.
  - **Server:** `is_deload_week` (`workout-detail/index.ts:1143`) is not on the logger payload.
  - **Move:** stamp `is_deload` on the row. **S**
- **M-S06** `src/components/StrengthLogger.tsx:2655-2660, 3016-3027, 3389, 3499, 5347-5355`
  - **Decides:** which planned session loads (two mobility regexes that differ) and the "Pick planned" list read straight from the table.
  - **Move:** get-week sends a logger mode; the list reads get-week. **S**
- **M-S07** `src/components/StrengthLogger.tsx:1056-1098, 5748-5750, 6039-6064, 6507, 7077, 7108`, `src/lib/strength-logging-mode.ts:47-215`
  - **Decides:** which columns show (weight, assist, "Lb/hand", "Band lb", RIR), plus timer or plate calculator. Shared code at render. It defaults to barbell for 42 bodyweight and 8 hold names, and a private carry/sled regex has no server equivalent.
  - **Move:** materialize stamps `logged_as` and equipment on each row. **M**
- **M-S08** `src/components/StrengthLogger.tsx:481-557, 6840-6863`
  - **Decides:** plates per side from a fixed inventory, and "Can't make exactly X".
  - **Move:** a shared pure file a watch can bundle. **S**
- **M-S09** `src/components/StrengthLogger.tsx:1102-1124, 5615-5618`, `CoreTimer.tsx:32, 145-151, 192`
  - **Decides:** a name containing "core work" becomes a timer, with duration parsed from name or notes and a 300 s default. The server writes the duration in `reps` ("5 min"), which is never read.
  - **Move:** the row carries `duration_seconds`. **S**
- **M-S10** `src/components/StrengthCompareTable.tsx:353-354, 474-480, 494-497`
  - **Decides:** a private bodyweight regex hides weight, a local copy of `topSetIndex`, and the intent label lookup.
  - **Move:** import the shared classifier or read row flags. **S**
- **M-S11** `src/components/StrengthPerformanceSummary.tsx:36-102, 191-192, 548-555`
  - **Decides:** marks rows "by feel" with shared code at render, and turns the all-out reason codes (`_shared/strength/all-out-set.ts:174`) into sentences.
  - **Move:** session_detail sends the flag and the sentence. **S**
- **M-S12** `src/components/StrengthCompletedView.tsx:433-437`, `PilatesYogaLogger.tsx:19-26, 59, 178-193`
  - **Decides:** RPE words, teacher-rating words and a 60-minute default. The logger saves on a reps-left scale, so the words differ between screens.
  - **Server:** `intensity_level` (`analyze-strength-workout/index.ts:1322-1326`).
  - **Move:** print `intensity_level`. **S**
- **M-S13** `src/components/HardSlotChoices.tsx:88-103, 143`, `src/lib/hard-slot-choices.ts:118-143, 235-318`
  - **Decides:** the hard-slot variant menu, "Engine's pick", which shapes are greyed as taken, and variant descriptions (phone only).
  - **Move:** the preview returns variants with label, body and taken. **S**
- **M-S14** `src/components/StrengthLogger.tsx:2126-2220, 3929-3938`, `StrengthExerciseBuilder.tsx:31-94`, `StrengthPlansView.tsx:27-31`
  - **Decides:** three different exercise picker lists, and a 5×5 default with % of a typed 1RM.
  - **Move:** one catalog export. **S**
- **M-S15** `src/lib/assistance-slot.ts:42-54`, `src/lib/rep-total.ts:23-28`, `StrengthLogger.tsx:2041-2043, 5821`
  - **Decides:** "is this row assistance" has three answers. A row with 3 sets and "6 total" is assistance in the logger but not on Performance or the server.
  - **Move:** materialize stamps `is_assistance`. **S**
- **M-S16** `src/lib/band-assistance.ts:57-71`, `src/lib/pullup-progression.ts:308-385`
  - **Decides:** whether the "Assist (lb)" box is offered, and whether a pull-up test result is sent. `save-baseline-test/index.ts:85` keeps a second guard that skips the movement check.
  - **Move:** stamp `assist_capable`; keep one guard on the server. **S**
- **M-S17** `src/lib/exercise-role.ts:166-221, 739-759` (`StateTab.tsx:575-597`, `StrengthLogger.tsx:2043, 2064, 5518`)
  - **Decides:** which lifts appear in State's per-lift section (up to 5) and on Adjust, the bar-speed cue, and freestyle assistance. Shared code at render.
  - **Move:** assemble.ts stamps `coached` and `is_main_lift`. **S**
- **M-S18** `src/lib/strength-calibration-copy.ts:73-156` (`StrengthLogger.tsx:7373`, `StrengthCalibrationNotice.tsx:47`, `StatePerformanceSection.tsx:617`)
  - **Decides:** the reset or bump sentence and the pound change. Its citations are page numbers from the retired strength program, not the current book. No edge function imports it, despite its header.
  - **Move:** `shared/strength-system/loading/calibration.ts` stamps the line. **S**
- **M-S19** `src/hooks/useStrengthCalibration.ts:103-117`
  - **Decides:** "climbing / holding / reset, training max N lb" by running the shared `liftStatus` on the phone.
  - **Move:** rematerialize-strength-block returns the status. **S**
- **M-S20** `src/lib/assistance-catalog.ts:287-736`, `src/lib/assistance-menu.ts:194-226, 394`, `src/lib/pullup-progression.ts:218-296`, `NonRaceBuilder.tsx:2332-2421, 3410-3449, 5530-5614, 5736-5767, 5859-5881, 5951, 6010-6012`
  - **Decides:** the builder's accessory dropdowns, default picks, soreness warning, rep band preview and chin-up dose. Shared code, but the rep band's inputs are rebuilt on the phone from a copied formula (comment at 3410).
  - **Move:** a server preview returns options, defaults, band and dose. **L**
- **M-S21** `src/lib/lifting-commitment.ts:25-75` (`NonRaceBuilder.tsx:4944`, `RunStrengthWeekCard.tsx:86-88`)
  - **Decides:** "Four lifting days a week. Three runs fit around them."
  - **Move:** the frame summary carries the line. **S**

### State, Profile and baselines (21)

- **M-B01** `src/lib/resolve-current-ftp.ts:120-225`, `src/hooks/useResolvedFtp.ts:39-46`, `ArcSetupWizard.tsx:1301-1311, 2400-2409`, `KnowYourNumbersStep.tsx:127`, `StatePerformanceSection.tsx:1034-1045, 1211-1214`
  - **Decides:** the FTP and its source word on Profile, Adjust, Welcome, the wizard, the State bike row fallback and plan-list watts; the "use N W" offer; and whether the hard-ride swap is offered. Same code as the server (19 edge importers).
  - **Move:** the baselines read returns the FTP with value, source, label and proposal. **L**
- **M-B02** `src/lib/resolve-current-run-pace.ts:164-509`, `TrainingBaselines.tsx:1332-1338`, `ArcSetupWizard.tsx:1483-1539`
  - **Decides:** threshold and easy pace shown, and the offer. Same code as the server. Profile writes its own source labels ("typed, until your runs measure"); the server's are "You entered this." and "Measured from your runs."
  - **Move:** the server returns the label. **L**
- **M-B03** `src/components/TrainingBaselines.tsx:1039-1067`
  - **Decides:** which saves update the plan: 8 listed fields call endurance-checkpoint, and max heart rate, resting heart rate, swim and unlocked lifts call nothing. Five phone files call endurance-checkpoint, each with its own list.
  - **Move:** one server baseline save decides and returns "N sessions updated". **M**
- **M-B04** `src/lib/goal-target-time.ts:5-17`, `GoalsScreen.tsx:806-821, 1451-1461, 1775-1843`
  - **Decides:** "Add terrain course" against "No race target found". Coach race readiness is used only when the goal name matches.
  - **Server:** `_shared/resolve-goal-target-time.ts:15-52` scans the five newest plans; the phone reads one.
  - **Move:** the payload stamps the pace target per goal. **S**
- **M-B05** `src/lib/plan-tokens/swim-drill-tokens.ts:834-894` (`PlannedWorkoutSummary.tsx:605`, `AllPlansInterface.tsx:1812`)
  - **Decides:** the pool gear list. It can show "Optional: Snorkel" to an athlete who has none.
  - **Server:** `buildSwimGearLine` (970-1041) filters to owned gear and adds "Recommended".
  - **Move:** materialize stamps the gear line. **S**
- **M-B06** `src/lib/week-exec-totals.ts:10-16`, `StateWeekExecution.tsx:23-30`, `state-primitives.tsx:152-164`
  - **Decides:** planned and done session totals feeding LoadBar, "partial week", and the "so far / actual" words.
  - **Move:** `week_execution_v1` carries the totals. **S**
- **M-B07** `src/lib/swimBaselineNudge.ts:26-58`, `src/hooks/useSwimBaselineNudge.ts:18-41`
  - **Decides:** the swim retest prompt: 4 or more weeks, 4 or more clean swims, one within 10 days (no source), from direct table reads.
  - **Move:** compute-snapshot stamps the prompt. **S**
- **M-B08** `src/lib/nudge-policy.ts:20-96`, `StateTab.tsx:107-119`, `StatePerformanceSection.tsx:762-766`
  - **Decides:** which signal becomes the State headline (5-id allow-list), and whether the fixed reps-in-reserve sentence shows.
  - **Move:** the signals payload adds the headline. **S**
- **M-B09** `src/hooks/useStateTrends.ts:54-73`, `StatePerformanceSection.tsx:1248-1353, 1503-1507`
  - **Decides:** which sport rows are dimmed as resting (no session in 28 days, from a phone query), the row order, and full versus fallback rows.
  - **Move:** assemble.ts sends the order and a resting flag. **S**
- **M-B10** `src/components/context/StateTab.tsx:629-633`
  - **Decides:** the NEXT row drops today and shows at most 3.
  - **Move:** coach adds next sessions. **S**
- **M-B11** `src/components/context/StateTab.tsx:124-198, 385-455`, `StateRaceBlock.tsx:89-103, 193-210, 410-438, 488-496`, `StateLastRaceCard.tsx:38-60`, `state-primitives.tsx:71-74, 233-247`, `src/lib/race-header.ts:19-36`
  - **Decides:** which goal the race block shows (a chain of fallbacks, then a name match), hiding it 7 days after, weeks out, trajectory colours at 70%/40%, durability shown under 0.97, and green or amber against goal.
  - **Move:** coach sends a race display block. **M**
- **M-B12** `src/components/context/StrengthReadCards.tsx:154-156, 167-169, 180-184, 239-243`
  - **Decides:** which sessions count in the drift chart, "N rides … not in the trend", and a heat line at 72°F (no source).
  - **Move:** points carry the flag; the series carries the count and heat note. **S**
- **M-B13** `src/components/context/StatePerformanceSection.tsx:963-964, 985`
  - **Decides:** "limited data" when there are fewer than 5 samples and the newest is over 21 days old (no source).
  - **Move:** classify.ts sends the flag. **S**
- **M-B14** `src/hooks/useConflictResolutionLoop.ts:147-150, 187-214`
  - **Decides:** shows only the first two-option conflict, stops after 3 rounds, and writes the assistant sentence.
  - **Move:** the preview returns the next conflict. **S**
- **M-B15** `src/hooks/useWorkouts.ts:1612-1690`
  - **Decides:** deleting a workout resets its planned session and moves it back to its original date, matching by date and type when unlinked.
  - **Server:** `detach-planned/index.ts:110-124` resets status but not the date.
  - **Move:** one server action. **S**
- **M-B16** `src/components/GoalsScreen.tsx:1654-1684`
  - **Decides:** the plan card sentence by `volume_state` ("More running settles your gain low…") and the Hyrox paragraph. The state comes from the server; the words do not.
  - **Move:** the generator writes the copy. **S**
- **M-B17** `src/lib/tri-combined-strength-nudge.ts:10-82`, `GoalsScreen.tsx:728-737, 2152-2171`
  - **Decides:** "Plan strength may be out of date", from a protocol id list copied by hand from `protocols/selector.ts:106`.
  - **Move:** the plans payload returns the reason. **S**
- **M-B18** `src/components/AthleticRecordPage.tsx:143-154, 578-590`
  - **Decides:** "Longest ride (elapsed)" by downloading every ride.
  - **Move:** include it in the record payload. **S**
- **M-B19** `src/components/Gear.tsx:458-463, 657`
  - **Decides:** "High mileage" at 400 miles for shoes and 5,000 for bikes, with no source and no ours marker.
  - **Move:** the gear row carries a server flag. **S**
- **M-B20** `src/components/RouteDoorway.tsx:53-72, 95-117, 168, 192`
  - **Decides:** a plain least-squares trend line, where the server guards the slope against old points (`_shared/core-verdict.ts:16-19`), and pill words ("Getting faster") that differ from the server's route badges ("Improving").
  - **Move:** the segment verdict carries the line and badge. **S**
- **M-B21** `src/lib/trend-receipt.ts:57-110`
  - **Decides:** the trend arrows and rule text ("needs one in each 4-week half").
  - **Move:** state_trends sends the receipt line. **S**

### Plans and goals (8)

- **M-P01** `src/components/AllPlansInterface.tsx:2522-2599`
  - **Decides:** "Continue from Week N" falls back to the calendar week, where resume-plan uses the last completed week.
  - **Move:** offer it only from the stored completed count. **S**
- **M-P02** `src/components/GoalsScreen.tsx:1170-1178, 1352-1366, 1688-1726, 1969-2061`, `src/lib/plan-goal-conflict.ts:4-49`
  - **Decides:** which active plan conflicts with a new goal, and the options (Link, End & Build, Keep both, Replace). The id goes to the server as `replace_plan_id`, and the server ends it.
  - **Move:** a server preflight. **M**
- **M-P03** `src/components/GoalsScreen.tsx:775-795, 1231-1241, 2753-2830`
  - **Decides:** the primary race (A, then B, then C, then date), and hides the A/B/C choice past 16 weeks with "No priority decision needed".
  - **Server:** `create-goal-and-materialize-plan/index.ts:1207-1228` does not rank B over C, and `phase-structure.ts:70` rounds differently.
  - **Move:** a preflight returns the schedule kind and primary goal. **M**
- **M-P04** `src/lib/arc-setup-persistence.ts:66-76, 127-251, 414-474`
  - **Decides:** focus to protocol, fitness "intermediate" default, primary goal, combining at two races, and which active plan to replace, whose future sessions the server deletes.
  - **Move:** send the goals; the server decides. **M**
- **M-P05** `src/lib/group-ride-route-snapshot.ts:21-44`
  - **Decides:** the climb notice tier in the wizard. It is a copy of `_shared/group-ride-route-snapshot.ts:27-42`, and says "keep shapes in sync manually".
  - **Move:** import the shared file. **S**
- **M-P06** `src/lib/schedule-gate.ts:51-165`
  - **Decides:** blocks Continue with "Runs a week has no number yet."
  - **Server:** silently defaults to 2 (`create-goal-and-materialize-plan/index.ts:2768-2779`).
  - **Move:** the preview returns what is missing. **M**
- **M-P07** `src/lib/state-coverage.ts:12-14`
  - **Decides:** hides the muscle coverage line unless a plan is active, while the server still sends the list.
  - **Move:** the server sends an empty list. **S**
- **M-P08** `src/lib/standing-plan-week-copy.ts:90-114, 445-456, 744-750, 1010-1093, 1266-1295, 1543-1635`
  - **Decides:** sport chips and order per row, fixed rows, when Continue unlocks, "sits the day before heavy legs", when "More experienced" is greyed, and the running-cost sentence. That sentence counts only the first two hard rows and compares against a different frame's layout, so on the All Rounder a run on the third hard row gets no sentence. Whether it renders there was not checked.
  - **Move:** the preview returns per-row options and notes. **M**

### Plan builder and setup wizard (14)

- **M-W01** `src/components/NonRaceBuilder.tsx:2987-3027`
  - **Decides:** hides server notes starting "The hard session is on" (latent today) and composes a club shortfall note (control hidden).
  - **Move:** print `placement_compromises` as sent. **S**
- **M-W02** `src/components/NonRaceBuilder.tsx:3139-3248, 3967-4022, 6925-6930`
  - **Decides:** "Hard run — sustained threshold" or "top-end" before the preview, from a private copy of `assignHardRoles` (`strength-primary-plan.ts:1944-2063`).
  - **Move:** the preview returns the role. **S**
- **M-W03** `src/components/ArcSetupWizard.tsx:522-609, 641-643, 670, 689-696`
  - **Decides:** picks swim days, Monday and Thursday strength, weekend long days, strength frequency, a 9-hour fallback and ordering. The server treats these as the athlete's pins.
  - **Move:** send only answered anchors. **S**
- **M-W04** `src/components/NonRaceBuilder.tsx:1379-1973` (plan-shape lines)
  - **Decides:** sport, goal type, protocol, lifting days 4/2/0 from posture, and run and ride day counts. Shared seeds.
  - **Move:** send raw answers. **M**
- **M-W05** `src/components/NonRaceBuilder.tsx:2215-2321`, `src/lib/wizard-steps.ts:118-359`, `ArcSetupWizard.tsx:2586-2621`
  - **Decides:** which questions are asked, and writes the frame's posture.
  - **Move:** the server returns the step list. **M**
- **M-W06** `src/components/NonRaceBuilder.tsx:3629-3930, 6192-6402`
  - **Decides:** allowed sports per row, the hard pair swap, the experience answer written as "experienced" when unasked (or "newer" when hours are low), 30/75-minute seeds and hard-row options. The server trusts these.
  - **Move:** the server applies defaults when a field is absent. **L**
- **M-W07** `src/components/EnduranceWeekCard.tsx:90, 435, 468-469`
  - **Decides:** the 1-7 days list, which rows open, and when "length varies" prints; rules in the component only.
  - **Move:** shared `slotOptionsNow` and `slotFixedMinutes`. **S**
- **M-W08** `src/lib/week-rules-copy.ts` (rendered at `NonRaceBuilder.tsx:7226`)
  - **Decides:** the placement rules list printed on the builder, which is phone text restating the server's placement law.
  - **Move:** the server returns the rules text. **S**
- **M-W09** `src/components/WelcomePage.tsx:296-304, 457-463`
  - **Decides:** threshold pace and FTP on sign-up, through shared resolvers at render.
  - **Move:** the baselines read returns them. **S**
- **M-W10** `src/lib/anchor-days.ts`
  - **Decides:** locks a day chip another anchor already holds.
  - **Move:** the preview marks taken days. **S**
- **M-W11** `src/lib/week-budget.ts:106-152`
  - **Decides:** the letters under the day chips, from the athlete's pins.
  - **Move:** the preview returns day letters. **S**
- **M-W12** `src/components/NonRaceBuilder.tsx:2547-2552`
  - **Decides:** the race week card's day letters (LR, C, E).
  - **Move:** the preview returns them. **S**
- **M-W13** `src/lib/standing-plan-copy.ts:64-70`
  - **Decides:** "(about 96% of the tested max)", a phone literal beside a server number.
  - **Move:** the server sends the line. **S**
- **M-W14** `src/lib/swap-copy.ts:80-105`
  - **Decides:** the swap sheet sentence by option kind and venue.
  - **Move:** the swap options action returns the line (H-T15). **S**

---

## LOW — 51

### Today, Week and the planned session (9)

- **L-T01** `WorkoutCalendar.tsx:157-362, 849-931, 942, 953` — abbreviation codes (RN-VO2, BK-EZ) are built by regex and no longer printed, but are still used as a de-dupe key. Delete. **S**
- **L-T02** `WorkoutCalendar.tsx:985-1020` — `unmatchedIds` and `swappableIds` are computed on every render (running the swap gate on every row and fetching posture and FTP) and never read. Delete. **S**
- **L-T03** `WorkoutCalendar.tsx:1521-1526` — "Rest" is printed when a day has no rows and any plan exists, inferred from absence. get-week stamps rest days. **S**
- **L-T04** `TodaysEffort.tsx:526-585, 2393-2490` — the fallback row's pace and "unlinked" tag cannot be reached for completed rows. Delete. **S**
- **L-T05** `TodaysEffort.tsx:85-158, 1112-1521` — dead code including a second volume sum, a planned-workload fallback and steps × 0.78 m distance. Delete. **S**
- **L-T06** `WorkoutBuilder.tsx:176-399`, `Run/RideIntervalBuilder.tsx:186-197` — an athlete-built session's total time is saved as `duration`; swim totals are always 0. The server sums intervals the same way. **S**
- **L-T07** `src/lib/utils.ts:169-180` — a test day is classified by name for display. **S**
- **L-T08** `src/lib/discipline.ts` — phone copies of the server's type normalisers. **S**
- **L-T09** `src/lib/tri-preferred-days-sanity.ts`, `tri-goal-helpers.ts`, `training-intent.ts` — save-path copies; the server re-runs the day sanity (`create-goal-and-materialize-plan/index.ts:988`). **S**

### Session details (12)

- **L-D01** `CleanElevationChart.tsx:106-411` — a distance, pace and VAM calculation; imported and never rendered. Delete. **S**
- **L-D02** `WorkoutExecutionView.tsx:22, 62-64`, `services/plans/templates/workoutDisplayTemplates.ts:66-847` — never rendered; holds 1RM × % weights. Delete. **S**
- **L-D03** `WorkoutSummary.tsx:147-187`, `WorkoutDetail.tsx`, `WorkoutMetrics.tsx`, `WorkoutSummaryView.tsx` — never rendered; prints invented interval numbers. Delete. **S**
- **L-D04** `HRZoneChart.tsx:99-156, 180-203`, `PowerZoneChart.tsx:45-53` — max heart rate from age formulas in a branch that never runs, and a zone-name table. Delete the branch. **S**
- **L-D05** `GarminPreview.tsx`, `StravaPreview.tsx`, `services/GarminDataService.ts:271-873`, `services/StravaDataService.ts:236-683` — FTP from whole-ride averages, "5K time" from a long run, training-status cut-offs; unreachable (tab button commented out). Delete. **S**
- **L-D06** `WorkloadAdmin.tsx:344-376, 423-469`, `services/workloadService.ts:124-172` — admin-only workload sums and a series check. Use `weekly-workload` and a server filter. **S**
- **L-D07** `CompletedTab.tsx` — dead metric helpers (VAM loop 1917-1947, swolf, splits); functions 684-851 sit inside `formatAvgSpeed` because of a missing closing brace. Delete. **S**
- **L-D08** `CompletedTab.tsx:148-155, 874-884, 1284`, `MobileSummary.tsx:421-431` — "fins used" tag and stroke rate averaged from samples; the server has `swim_pace_equipment_note`. **S**
- **L-D09** `PostWorkoutFeedback.tsx:274-316, 396-436`, `ManualSwimEntry.tsx:40-61` — lengths = round(distance ÷ pool), and 25 yd = 22.86 m. The server may compute distance back from the rounded count (inferred). **S**
- **L-D10** `workout-execution/WorkoutExecutionContainer.tsx:119-126`, `PreRunScreen.tsx:70-72` — total run distance summed from steps. **S**
- **L-D11** `services/plans/normalizer.ts:93-867` `normalizePlannedSession`, `utils/performance-format.ts:6-260`, `services/ExerciseLibrary.ts:29-341, 414-714`, `services/watchConnectivity.ts:87-119` — no callers. Delete. **S**
- **L-D12** `MobileSummary.tsx:23-55`, `AdherenceChips.tsx:118-143, 371` — computed, never rendered. Delete. **S**

### Strength logger and strength screens (9)

- **L-S01** `StrengthLogger.tsx:282-298, 1127, 1830-1953, 3760-3870, 3960-3963, 4933, 5376-5420` — dead helpers and a warm-up catalog under `{false && …}`. Delete. **S**
- **L-S02** `StrengthAdjustmentModal.tsx` — no importers. Delete. **S**
- **L-S03** `StrengthLogger.tsx:4962-4976, 7219-7231` — which sets count as "numbers but not done"; matches `_shared/workload.ts:198`. No move. **S**
- **L-S04** `src/lib/normalize-strength-set.ts:105-109` — hides untouched prefilled sets; shared code. No move. **S**
- **L-S05** `src/lib/strength-row-text.ts` `composePerLiftRowText`, `src/lib/strength-read.ts` — no screen caller. Delete. **S**
- **L-S06** `src/lib/maintenance-volume-band.ts:74-122` — "Above / Below / About the ~N mi that holds your usual X" with a ±25% tolerance (ours). Its callers sit in NonRaceBuilder's unreachable run step. Delete with that step. **S**
- **L-S07** `src/lib/hard-day-menus.ts:188-334` — imported and never called. Delete. **S**
- **L-S08** `src/lib/rep-total.ts:49-76` — the live "32 of 50 reps left" counts unsaved sets the server cannot see. Leave. **S**
- **L-S09** `src/lib/tracked-max-lifts.ts:52` — chart-or-not check from a list shared with `assemble.ts`. Print the chart when a series is present. **S**

### State, Profile and baselines (10)

- **L-B01** `useCoachWeekContext.ts:640-708` — merges adapt-plan suggestions nothing renders. Delete. **S**
- **L-B02** `AppContext.tsx:908-981` `repairPlan` — no callers. Delete. **S**
- **L-B03** `useWorkouts.ts:268-628, 1709-1756` — a provider fallback, and a hard-coded date rewrite for the workout named "Strength - 8/9/2025". Delete. **S**
- **L-B04** `StatePerformanceSection.tsx:230, 254-256, 278` — old-cache fallback lead and a ride count taken as the larger of two server counts. **S**
- **L-B05** `StateTab.tsx:681-689` — fallback empty-state copy for old cache rows. **S**
- **L-B06** `EnduranceCheckpointSheet.tsx:20-34` — evidence sentence built on the phone. **S**
- **L-B07** `StateReadinessRow.tsx:22-27` — up/down arrows on the check-in row, which is due to come off State. **S**
- **L-B08** `StateTrendsBlock.tsx`, `LoadWeeksCard.tsx` — not imported. Delete. **S**
- **L-B09** `src/lib/swim-source-tier.ts` — no importers. Delete. **S**
- **L-B10** `src/lib/run-threshold-from-easy.ts:100-178` — three unused functions; the file pulls `generate-combined-plan/science.ts` into the phone bundle. Delete. **S**

### Plans and goals (3)

- **L-P01** `GoalsScreen.tsx:245-252, 1889-1942` — durability intent forces endurance-first ordering; the "What's next" button is picked by rule. **S**
- **L-P02** `AllPlansInterface.tsx:302-532, 990-1201, 1460-1530, 2177-2261` — optional-session rules and canned "reduced intensity by about 15%" replies; no callers. Delete. **S**
- **L-P03** `AllPlansInterface.tsx:1628-1904`, `src/lib/format-wizard-prefs-export.ts:60-202, 313-318` — the Markdown export's order and brick merging (button hidden at phone width). Use export-data. **S**

### Plan builder and setup wizard (8)

- **L-W01** `NonRaceBuilder.tsx:2115-2121, 4209-4220` — hard-day seed gate, inert on the strength path. **S**
- **L-W02** `NonRaceBuilder.tsx:3423-3451, 4048-4095, 4947-5088, 5247-5259, 5645-6054, 6437-6768, 7313-7655, 7849-7853` — unreachable steps (the goal list offers only strength and marathon). Delete. **S**
- **L-W03** `src/lib/parse-arc-setup.ts`, `arc-setup-system-prompt.ts`, `useArcSetupContext.ts:32-35`, `arc-setup-persistence.ts:100-108` — chat-era helpers with no callers. Delete. **S**
- **L-W04** `src/lib/load-read.ts`, `src/lib/load-headline.ts` — no phone callers. Delete. **S**
- **L-W05** `src/lib/context-utils.ts:731-771` — consecutive-hard-days and imbalance checks, no callers. Delete. **S**
- **L-W06** `src/lib/week-rules-copy.ts` club shortfall warning — cannot fire while the club control is hidden. **S**
- **L-W07** `src/lib/dial-copy.ts:174-222` — chip line whose control is hidden. **S**
- **L-W08** `src/lib/use-strength-ordering-preference.ts` — reads a goals value nothing uses (see H-T16). Delete with that move. **S**

---

## Found while reading, outside this rule

1. Phone recording crashes on its first screen, and steps would never advance. See "What a watch face would need today".
2. On the race intent screen, picking "A time" with no pace on file cannot continue. The inputs behind "Two numbers below" are never drawn, and the saved flag is never set (`NonRaceBuilder.tsx:2491-2494, 3312-3313, 4898-4903`). Traced by the reader, not run.

---

## WORK ORDER — move the highest-risk decisions to the server

**Order.** Stage 1 first: the phone writes its decision into the database, and server code then computes from it, so the error spreads past the screen. Stage 2: the same session shows two different numbers on two screens. Stage 3: numbers with no source on athlete screens. Stage 4: plan changes the phone decides alone.

**Every item:**
- Carries a fixture proving the output did not move where it should not (Law 6).
- Redeploys every function that imports a changed `_shared` file (CLAUDE.md, the `_shared` deploy trap).
- Ships the phone change only after the server field is deployed.

**Estimates:** S under 2 hours, M half a day, L 1-2 days, XL more than 2 days.

### Stage 1 — the phone writes a decision the server then uses

1. **Heart-rate zones.** A server function writes `configured_hr_zones` from the resolvers. Profile sends only manual overrides and prints server zones, threshold and max (H-B02, H-B03). **M + M**
2. **5K save and effort paces** go through an edge function using `generate-run-plan/effort-score.ts`. Delete the phone effort-score math and the fallback paces (H-B01). **M**
3. **Goal results and plan ending.** complete-race accepts a goal id for every sport and writes `current_value`. The server ends linked plans when a goal completes. Delete GoalsScreen's name-matching sweep and direct writes (H-B15, H-B16). **M + M**
4. **Resume.** The detail Resume button calls `resume-plan` (H-P01). **S**
5. **Goal prefs.** Delete the phone enrichment before insert, stop sending invented weekly hours, and stop pre-picking the fitness level (H-W08, H-W09, H-B17). **S + S + M**
6. **Imports.** Delete the phone's extra auto-attach and workload calls after a file import (H-D06). **S**
7. **Mark as Complete** goes through an endpoint using the server duration (H-T09). **M**
8. **Saved max.** save-baseline-test picks the scored set and the lift key from all test sets (H-S08). **M**
9. **Week-one tests.** create-goal builds them inside the plan's week 1, and an edge function builds a standalone test (H-W03). **M**

### Stage 2 — one session, two numbers on two screens

10. **Planned session length.** get-week and `session_detail_v1` carry `planned_duration_seconds` from `_shared/planned-duration.ts`. Settle there whether the stored total or the step sum leads, and delete the phone ladder. Lift sessions get a `duration_range` from compose (H-T01, H-T02). **M + M**
11. **Finished session moving time.** One value stamped by get-week and workout-detail; both phone helpers return it (H-D10). **M**
12. **Strength volume.** The done card, Week row and Details print `strength_volume.completed_total_lb`, and get-week adds the per-item and weekly totals (H-T04, H-T05, H-S15). **S + M**
13. **Exercise names.** Import `@shared/canonicalize` and delete the copy. The logger's Previous column reads the server map (H-S06, H-S05). **S + M**
14. **Strength Performance tab** reads session_detail:
    - RIR summary and sentence (H-S11) **S**
    - slot pairing and completed count from match-exercises (H-S12) **L**
    - reps and deviation per slot (H-S13) **M**
    - set and rep totals (H-S14) **S**
15. **Plan week and phase.**
    - `current_week_index` from `resolvePlanWeekIndex` on the plans read (H-B09) **S**
    - phase word and phase totals on the week payload (H-P03) **M**
    - plan totals from the server (H-P02) **M**
16. **Zones and bands shown.**
    - one server power-zone table (H-B05) **S**
    - the easy heart-rate band from `resolveRunEasyHrBand` (H-B04) **S**
17. **State.**
    - form headline and label from coach (H-B08) **S**
    - fold lift slots inside `assemble.ts` (H-S18) **M**
    - trend fit sent by assemble.ts (H-B07) **M**
    - logged-sets best flags from compute-snapshot (H-S20) **M**
    - LoadBar prints coach shares and zone rows (H-T21) **S**
18. **Workout detail charts.**
    - average pills from `completed_totals` and `computed.overall` (H-D04) **S**
    - server splits (H-D01) **M**
    - gain and loss series (H-D03) **M**
    - display series (H-D02) **L**
19. **Today and Week.**
    - week bar totals in `weekly_stats` (H-T03) **M**
    - one `is_executed` (H-T10) **M**
    - Details workload tile prints the server load (H-D07) **S**
    - the feedback popup calls check-feedback-needed (H-T11) **S**
    - one drift line (H-D09) **S**
    - remove the race readiness merge (H-T13) **S**
20. **Builder numbers that already disagree with the build.**
    - drop the Sunday/Saturday long-day fallback (H-W01) **S**
    - lift numbers from the shared resolver (H-W02) **S**
    - equipment tier from get-arc-context (H-W07) **S**
    - pace benchmark from the server (H-B13) **S**
    - hard days the server can price (H-B14) **M**
    - no week verdict before the preview (H-W04) **M**
    - per-tier session counts from the server (H-P08) **M**

### Stage 3 — numbers with no source

21. **Strength logger.**
    - print server weights unchanged (H-S04) **S**
    - test sessions as server `set_plan` rows (H-S01, H-S02) **M + S**
    - `rest_seconds` from compose (H-S07) **M**
    - PR badge from the server flag, or remove it (H-S09, H-S10) **M + S**
    - delete the old-row % parser and the "5 minimum" fallback (H-S03, H-S17) **S + S**
    - since-block delta on each lift row (H-S19) **S**
22. **Planned-session fallbacks.**
    - delete the ±4% range, the StructuredPlannedView expansion and the strides tooltip (H-T17, H-T19, H-T08) **S + S + S**
    - always print `friendly_summary` (H-T18) **M**
    - reschedule advice from `data.suggestion` (H-T22) **S**
    - interval band per interval (H-D11) **S**
    - goal-race % per interval (H-D12) **M**
    - swim distance total on the row (H-T20) **M**
23. **Today words that carry a number.**
    - heat note against heat-adjust's threshold (H-T07) **S**
    - weight corner prints only `weight_display` in the athlete's unit (H-T06) **S**
    - mobility sets stored structured (H-T12) **M**
    - the strength row note written by materialize (H-D14) **M**
24. **Swim.** Pool unit and length always stamped; pool label and swim percentages from the server (H-D18, H-D08, H-D13, H-B06). **S + S + S + S**
25. **Profile and record.**
    - server record payload (H-B11) **M**
    - lift suggestions that respect locks (H-B12) **M**
    - unofficial race finish from coach (H-B10) **M**
26. **Builder numbers.**
    - race block numbers from the preview (H-P07) **M**
    - week-one session distances from the preview (H-T23) **S**
    - run and strength lengths on the frame (H-P06) **S**
    - sample-week summary and notes from the preview (H-P05) **M**
    - history counts and confirm-screen conflicts (H-W10) **M**
    - race week conflict note (H-W06) **S**
    - endurance intake bounds from the preview (H-W05) **L**
27. **The good-news line** computed at ingest into `session_detail_v1` (H-T14). **L**

### Stage 4 — plan changes the phone decides alone

28. **Swaps.** One adapt-plan action returns a row's options with their words and warnings, and one applies the choice (just today, or rest of plan) and materializes. Delete the phone gates, `swap-write.ts` and the three different menus (H-T15, M-T07, M-W14). **XL**
29. **Day order.** get-week sends `day_order`, and every screen sorts by it (H-T16). **M**
30. **FIT import.** Upload the raw file to an edge function that parses it and runs recompute-workout (H-D05). **L**
31. **Phone recording**, after the crash and field-name fixes, which are outside this audit:
    - the server stamps outer bands and cue words per step (H-D16) **M**
    - read stored step seconds (H-D17) **S**
    - print the server execution score (H-D15) **S**

**Total, by the estimates above:** 44 S, 43 M, 5 L, 1 XL. At 2 hours, half a day, 1.5 days and 3 days each, that is about 43 working days.

The MEDIUM and LOW findings are not in this work order. Most MEDIUM moves are one field on a payload that an item above already opens. The LOW ones are deletions.
