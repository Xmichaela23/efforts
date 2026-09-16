# Stage 7 session 2 — the final pass (2026-09-16)

WORKORDER-app-one-truth §4 Stage 7. Report only: no code changed, nothing pushed, nothing deployed.

**What was run.** Three throwaway accounts, created and deleted by script (`scripts/_burner-stage7-final-*.ts`, gitignored):
Garmin shape imperial, Strava shape imperial, Strava shape metric. Each had a Run + Ride + Strength plan (All Rounder frame,
started 2026-08-10, today in week 6 of 12) and six weeks of history: long runs with a set in them, an easy run with strides,
an interval run, a 5K run, steady rides, anaerobic rides, sweet-spot rides, two pool swims, one unattached Zwift ride,
four lifting days a week with the prescribed sets logged, three lifts with a typed weight (week 6 Monday), a band set and a
bodyweight set on every upper day, one logged test session (squat and deadlift), an accepted FTP and an accepted run
threshold, typed threshold / max / resting heart rates. Every screen's read function was then called as the athlete with
the phone's own request body (get-week for all seven weeks, workout-detail both scopes for every session, coach,
get-arc-context, save-baselines readout, plan-overview list and detail, rematerialize-standing-block and -strength-block,
endurance-checkpoint, athletic-record, gear-list, strength-test-session, resolve-exercise-weight, validate-reschedule,
swap-session, check-feedback-needed, share-strength-to-strava, export-data with the zip unpacked).

**How "shown" and "server value" were worked out.** "Value shown" is the response field put through the phone's own
formatter where the screen still formats it (copied from the file named in the table: `formatDistance`, `formatPace`,
`formatDuration`, `fmtDur`, `fmtTime`, the checkpoint sheet's `fmt`, TrendSparkline's range label). "Server value" is the
one source for that fact: the device's summary for distance, times, heart rate and power (rule 7); the accepted value
for threshold and FTP; the typed value for heart rates; the lift resolver's readout for lifts; stored pounds through
`liftInAthletesUnit` for sets; the plan's start date for the week. Formatted with `_shared/display-format.ts`.

**Fixture notes (so nobody reads these as app findings).**
- Strava shape = `ingest-activity` called with the payload `import-strava-history` sends (Strava API activity + streams +
  laps). `import-strava-history` itself was not run: it needs a real Strava token.
- Garmin shape = a `garmin_activities` row (the webhook's table) + `ingest-activity` with the webhook's payload.
- Every device summary was sent slightly different from its samples on purpose (distance +0.4%, heart rate +1, moving
  time −20 s, Strava normalized power = 1.05 × average), so a screen printing the sample number shows up.
- The plan builder put one run (the long run) and four rides in the week; the other runs were logged unplanned.
- Run threshold: the app's learner abstains below 24 runs in 16 weeks (its own fit, run locally on the Garmin account:
  "9 runs in the last 16 weeks; the method needs 24"). A measured 262 s/km was placed where the learner writes it and
  accepted through `save-baselines {accept}` — the call the Adjust button makes. FTP was learned from the rides
  (164 W Strava, 165 W Garmin) and accepted the same way; the re-price ran to finished before the probe.
- Heart rates were first typed without the `lthr_source` flag the Baselines screen sends; the Adjust row then showed the
  learned number. Retyped with the screen's exact body, the row shows the typed 168. Not a break; the table uses the
  retyped state.

---

## 1. Breaks

678 rows over three accounts; 156 rows where the value shown differs from the server's value, in 9 breaks.

### B1 — distance, pace and "(total)" read the samples, not the device's total (94 rows, all accounts)
Today card, Week row, Performance Distance, Details Distance tile, the map's "(total)" line, Performance and Details
pace, Today's weekly ride total, and Details HR-zones "Duration" all print a number built from the samples. The device's
own total differs, so rule 7 breaks on every run and ride with samples.
- Garmin long run: device 16,235 m → **10.1 mi**; every screen prints **10.0 mi**; pace **8:57/mi** where the device's
  numbers give **8:53/mi**. Strava metric steady ride: device **36.1 km**, screens **36.0 km**. Today's weekly ride total
  **43.3 km** vs **43.5 km**. HR zones "Duration" 1 s under the device's elapsed time (1:29:59 vs 1:30:00) on 18 sessions.
- The popup reads the device's `workouts.distance`, so on one session the two disagree on screen: Strava metric
  Anaerobic Ride — popup **21.7 km**, Today card **21.6 km**.
- Where: `compute-workout-analysis/index.ts:1755-1756` (samples first, the device's `distance` only when the samples
  carry none); read by `get-week/week-totals.ts:99,120`, `_shared/session-detail/build.ts:810`, `workout-detail`'s
  display metrics. Already on the punch list (QUEUED, filed 2026-09-16, line cited there as ~1907).

### B2 — a swim's distance prints in miles or kilometres on Today, the Week row and Details (9 rows, all accounts)
1,800 m pool swim: Performance **1969 yd** / **1800 m**; Today card, Week row and Details **1.1 mi** / **1.8 km**.
- Where: `get-week/week-totals.ts:121` (`fmt.distance(distM)`, no swim flag); `workout-detail/index.ts:2084,2235`
  (`distanceDetail`, no swim branch).

### B3 — Details "Norm Power" prints the app's own normalized power, not the device's (6 rows, Strava accounts)
Device 146 W → Details **139 W** (steady ride); 123 W → **146 W** (anaerobic); 173 W → **165 W** (Zwift).
- Where: `workout-detail/index.ts:2042-2043` reads `computed.analysis.power.normalized_power`, written from the samples
  only at `compute-workout-analysis/index.ts:1220-1225`. The Garmin fixture sent no normalized power (not exercised there).

### B4 — State LOAD ⓘ "Today: F − A = form" prints yesterday's numbers beside the bar's today (8 rows, all accounts)
Strava imperial: bar **fitness 63 · fatigue 100 · form −52**; ⓘ **"Today: 64 − 117 = −53"**. Garmin: bar 48 / 83 / −48, ⓘ
"49 − 97 = −48".
- Where: `_shared/fitness-fatigue.ts:131` builds `key_line` from `ctlPrior` / `atlPrior` (entering today); the bar prints
  `fitness` / `fatigue` (end of today) and `form` = r1(prior difference). `LoadBar.tsx:149` prints it under "Today". The
  comment at `fitness-fatigue.ts:129-130` says the operands are "the fitness and fatigue the bar prints"; they are not.

### B5 — metric account: lift numbers in pounds, labelled kg, "lbs" or nothing (13 rows, metric only)
| screen | shown | server |
|---|---|---|
| My Record, four lifts | 290 lbs · 340 lbs · 210 lbs · 135 lbs | 132 kg · 154 kg · 95 kg · 61 kg (Adjust prints these) |
| Plan builder · Know your numbers | Squat 290 · Deadlift 340 · Bench 210 · OHP 135 (no unit) | 132 · 154 · 95 · 61 |
| Performance · test result | → e1RM 290 lb | 132 kg (the logger's "Saved:" card prints 132 kg) |
| Performance · "Volume (lbs)" tile | 14,075 | 6,384 kg (the Week row prints 6,384 kg) |
| State · strength row, collapsed | 280 | 127 (the open tile prints 127 kg) |
| State · e1RM chart range | 280–290 kg | 127–132 kg |
| Logger · band box | 35 (titled "Band (lb)") | 16 kg (Performance prints the band as 16 kg) |
- Where: `AthleticRecordPage.tsx:556` ("lbs" on a pound value from `athletic-record`); `KnowYourNumbersStep.tsx:181` on
  `get-arc-context/intake-readout.ts:121-130` (pounds); `StrengthTestResult.tsx:30` ("lb" literal);
  `StrengthPerformanceSummary.tsx:226` ("Volume (lbs)" on `strength_totals.volume_lb`); `src/lib/sport-summary.ts:92`
  (`Math.round(latestE1rm)`, pounds, no unit); `StatePerformanceSection.tsx:677-678` (unit from `readout.unit`, series in
  pounds per `_shared/state-trend/assemble.ts:1362`); the band box is the item Stage 4 session 4 left on purpose.

### B6 — metric account: paces printed per mile (4 rows, metric only)
- Performance "Grade-adjusted pace" row **8:50/mi** where Details prints **5:29/km** (3 runs). Where:
  `_shared/session-detail/build.ts:1104` (`/mi` literal; it also rounds the seconds on their own, so it can print ":60").
- Checkpoint sheet threshold "on plan" **7:02/mi** where Adjust prints **4:22/km**. Where:
  `EnduranceCheckpointSheet.tsx:16`. The sheet was not due on these accounts (week 7); the value is the field it prints.

### B7 — the export's profile.json is not the numbers the app uses (16 rows)
| field | export | app |
|---|---|---|
| `numbers.ftp` (all) | 210 W (typed) | 164 / 165 W accepted (Adjust, State, the priced rides) |
| `numbers.threshold_pace_min_per_mi` (all) | absent | 7:02/mi · 4:22/km accepted |
| `numbers.threshold_hr` (all) | absent | 168 bpm typed |
| `numbers.resting_hr` (all) | absent | 52 bpm typed |
| `numbers.squat` / `deadlift` / `bench` / `overhead_press` (metric) | 290 · 340 · 205 · 135 beside `weight_unit: "kg"` | 132 · 154 · 95 · 61 kg (bench: the typed 205 lb, not the resolved 210 lb) |
- Where: `export-data/index.ts:292-302` reads raw `performance_numbers` keys. The typed heart rates are saved to
  `configured_hr_zones` (`save-baselines/derive.ts:277-298`), and accepted numbers live in `learned_fitness`.

### B8 — "Share to Strava" answers 500 "user is not defined" (3 rows, all accounts)
Both the button and the automatic post fail before anything is posted.
- Where: `share-strength-to-strava/index.ts:82` reads `user.id`; the handler's variable is `userId` (`:38`). Came in with
  cbbbd212 (2026-09-15, Stage 3 session 4).

### B9 — planned length: "110:00" on Today's card and the Planned header, "1:50:15" on Performance (3 rows)
The long run's 6,615 s prints as **110:00** (whole minutes written as M:00), the Week row **1h 50m**, Performance
**1:50:15** and "of 110 min".
- Where: `_shared/planned-duration-label.ts:52`.

---

## 2. Counts per screen

| screen | rows | breaks |
|---|---|---|
| Today (done card, planned card) | 69 | 17 |
| Today header | 15 | 3 |
| Week (day row) | 51 | 13 |
| Week bar | 6 | 0 |
| Performance (endurance, strength, share) | 123 | 27 |
| Details (tiles, map) | 237 | 60 |
| Post-workout popup | 3 | 0 |
| State (header, LOAD, strength, bike, swim) | 45 | 10 |
| Adjust / Baselines (incl. deload) | 33 | 0 |
| Checkpoint (week, sheet) | 6 | 1 |
| Plans list / Goals · Plan detail | 12 | 0 |
| Planned rides / Planned tab text | 6 | 0 |
| Logger (boxes, test sheet, Saved card) | 15 | 1 |
| My Record | 12 | 4 |
| Plan builder · Know your numbers | 15 | 4 |
| Export (profile.json, sets.csv, workouts.csv) | 30 | 16 |
| **total** | **678** | **156** |

---

## 3. Tests

Full suite = every `*.test.ts(x)` under `supabase/` and `src/` (556 files), `deno test -A --no-check`, one file at a time.

| tree | failing | passing |
|---|---|---|
| HEAD 8697c5ca | 48 | 5467 |
| bc6d7b98^ (72304b0e) | 47 | 5462 |
| 0c7639fe (the last commit before Stage 7 session 1) | 47 | 5456 |

- ⚠️ bc6d7b98^ is itself a Stage 7 session 1 commit (72304b0e); 0c7639fe is the tree before the session. Both were run.
- **Fails on HEAD, passes on bc6d7b98^ (1):** `_shared/run-threshold-test.test.ts` "the TEST RESULT obeys the invariant —
  faster than easy, or refused". The test reads the source of `compute-workout-analysis` (`:21`, `:46`); bc6d7b98 moved
  the time-trial maths into `learn-fitness-profile`, where the check stands at `learn-fitness-profile/index.ts:281-285`
  (read). A stale test; the behaviour moved, it was not lost. The other four tests in that file failed before Stage 7.
- **Passes on HEAD, fails on bc6d7b98^:** none. **bc6d7b98^ vs 0c7639fe:** no difference.
- Four `materialize-plan` test files failed in a first parallel run because each imports `index.ts`, which starts a
  server (`:3989`) on one port. Run one at a time on all three trees they give the same result.
- **The three left failing without a note** fail on all three trees, so they were not introduced by Stage 7:
  - `anchor-resolver-lint.test.ts` "no NEW surface reads an anchor past its resolver" and "the ledger is a DEBT LEDGER".
    The ledger lists `AthleticRecordPage.tsx` (swim CSS) and `TrainingBaselines.tsx` (threshold pace), which no longer
    read those columns, and does not list `_shared/baseline-suggestions.ts` and `save-baselines/zones.ts`, which now do.
    Failing since 8e17c1e6 (2026-09-10, the swim CSS read moved to the server); the threshold-pace pair joined at
    d3f7f3a4 (2026-09-15, Stage 4 session 1). Checked by running the test at 8e17c1e6^, 8e17c1e6, d3f7f3a4^ and d3f7f3a4.
  - `save-baselines/zones.test.ts:32` "nothing on file: nothing to print" expects three keys; `zonesForBaselinesRow` has
    also returned a `readout` block since d3f7f3a4. A stale test.

## 4. The popup's distance line after a Strava history import

- **Reproduced; the distance line is there, and it is not a break of its own.** After six weeks written through the
  Strava import's payload, `check-feedback-needed {}` raised the popup for yesterday's Anaerobic Ride with
  **13.5 mi** (imperial) and **21.7 km** (metric) — the device's distance. On the metric account Today's card prints
  **21.6 km** for the same ride (B1).
- The popup with **no** distance line is the `.fit` upload path: `AppLayout.tsx:996-1007` (`handleWorkoutsImported`, fed
  by `FitFileImporter`) sets the popup without asking the server. That path is parked (§3).
- ⚠️ **Found on the way: a history import does not stop the popup.** On both Strava accounts 37 of 37 imported runs, rides
  and swims had no dismissal. The dismissal and its comment ("A row created by a history pull never asks for post-workout feedback")
  sit in `import-strava-history/index.ts:612-615`, inside `convertStravaToWorkout` (`:275`), which nothing calls
  (searched the file for `convertStravaToWorkout(`: the definition only). Rows are written by `ingest-activity`'s
  `mapStravaToWorkout` (`ingest-activity/index.ts:213`), which sets no `feedback_dismissed_at` (searched: none). The
  36-hour window in `check-feedback-needed` limits it to the newest session.

## 5. Build and guard

`npm run build` passes. Guard: rules 1, 2, 2-ledger, 3, 4 and 5 are FAIL with 0 hits (parked: rule 1 14, rule 2 31,
rule 3 8, rule 4 2). ⚠️ **Rule 0 (the D-237 estimate-fallback check) is still WARN**, 4 hits + 3 known Q-120 — so "every
guard rule on FAIL" is true of rules 1–5, not rule 0. `vite build` completes.

## 6. B1 matrix (security, `scripts/b1-matrix-2026-09-06.mjs`, deployed functions)

18 functions: backfill-facts, backfill-routes, compute-snapshot, generate-combined-plan, learn-fitness-profile,
planning-context, process-workouts-batch, recompute-athlete-memory, adapt-plan, coach, compute-core-verdict, delete-goal,
detect-cores, match-cores, readiness, recompute-workout, save-imported-workout, import-strava-history. (The 2026-09-06
list minus `arc-setup-chat`, which no longer exists, and the two backfills deleted in Stage 7 session 1; plus
`import-strava-history`, converted 2026-09-16.)
- A's token + B's id: 16 answered 200 with A's own data, `recompute-workout` 404, `import-strava-history` 500 (the dummy
  token; it marked A's own Strava connection, B's stayed `ok`). No response carried B's id.
- A's token, no id: 17 × 200, `import-strava-history` 500 (same reason).
- Anon key + B's id: 401 on all 18.
- B's rows unchanged across 44 tables; B's goal still there.
- Service key + B's id: reached B on 10 (a write on B's rows or B's id in the reply); the other 8 ran dry or returned
  nothing that names B.
- Internal chain: `save-imported-workout` (A's token) → `recompute-workout` (service key) 200, every step ok.
- Both matrix accounts deleted, zero rows left.

## 7. Not exercised

- `import-strava-history` itself, the Strava webhook, Strava connect (need Strava).
- Gear (no gear on these accounts), the readiness check-in, weather lines.
- The checkpoint sheet as a sheet (not due until week 7); its fields were read directly.
- The ride FTP proposal on the popup and Know your numbers' FTP — both worked out on the phone from a table read
  (`PostWorkoutFeedback.tsx:135-138`, `KnowYourNumbersStep.tsx:130`); no proposal was pending after the accept.
- The Planned tab's own step lines (`StructuredPlannedView.tsx` builds them on the phone from `computed.steps`); the
  server's `step_lines` were present on the rows.
- The plan builder's intake numbers (hours, lengths, experience chips) and the reschedule and swap sheets (both called,
  200, not tabulated).
- Race path and season wizard (parked, §3a).
- ⚠️ Seen, not traced: each re-price job finished at **30 of 33** rows (`endurance-checkpoint` counts only rows whose
  `materialize-plan` call returned no error), so three upcoming sessions per account kept their old numbers.

## 8. State

- Code: unchanged. Pushed: nothing. Deployed: nothing. Phone-checked: nothing.
- Committed: this file and the WORKORDER §8 row 7 update.
- Throwaway accounts: all deleted (three pass accounts, one earlier Garmin account rebuilt mid-session, two matrix
  accounts); their three export zips removed from storage; zero rows left.

---

## 9. The table

One row per number per screen. A bold line names the fact; every screen that prints it follows. Sessions: the latest of
each kind. "same" is **no** when the value shown differs from the server value.

| account | screen | label | value shown | server field it reads | server value (source) | same |
|---|---|---|---|---|---|---|
| | **long run with a set (2026-09-12) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 10.0 mi | get-week items[].done_headline | 10.1 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Week · day row | distance | 10.0 mi | get-week items[].done_distance | 10.1 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Performance | Distance | 10.0 mi | session_detail_v1.completed_totals.distance_display | 10.1 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details | Distance tile | 10.0 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 10.1 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details · map | "(total)" distance | 10.0 mi | display_metrics.series_display.distance[last] | 10.1 mi (workouts.distance (the device total)) | **no** |
| | **long run with a set (2026-09-12) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 1:29:40 | get-week items[].done_headline | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 1h 30m | get-week items[].moving_seconds (phone fmtDur) | 1h 30m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 1:29:40 | completed_totals.duration_display | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 90 | completed_totals.duration_minutes | 90 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 1:29:40 | display_metrics.duration_s (phone formatDuration) | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **long run with a set (2026-09-12) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 1:30:00 | display_metrics.elapsed_s (phone formatDuration) | 1:30:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **long run with a set (2026-09-12) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 145 | completed_totals.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 145 | display_metrics.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| | **long run with a set (2026-09-12) · avg pace** | | | | | |
| Garmin imperial | Performance | Pace (overall row, map pill) | 8:57/mi | completed_totals.avg_pace_display | 8:53/mi (moving seconds ÷ device distance) | **no** |
| Garmin imperial | Details | Avg Pace tile | 8:57/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 8:53/mi (moving seconds ÷ device distance) | **no** |
| | **long run with a set (2026-09-12) · grade-adjusted pace** | | | | | |
| Garmin imperial | Details | Grade-Adj Pace tile | 8:52/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 8:52/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Garmin imperial | Performance | Grade-adjusted pace row | 8:52/mi | analysis_details.rows[Grade-adjusted pace] | 8:52/mi (display_metrics.gap_pace_display) | yes |
| | **long run with a set (2026-09-12) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | 394 ft | display_metrics.elevation_display | 394 ft (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 394 ft | display_metrics.series_display.gain[last] | 394 ft (workouts.elevation_gain (device)) | yes |
| | **long run with a set (2026-09-12) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 74 | items[].workout_analysis.session_detail_v1.load.workload | 74 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 74 | session_detail_v1.load.workload | 74 (workouts.workload_actual) | yes |
| | **long run with a set (2026-09-12) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 1:29:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:30:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **run with strides (2026-09-11) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 4.8 mi | get-week items[].done_headline | 4.8 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Week · day row | distance | 4.8 mi | get-week items[].done_distance | 4.8 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Performance | Distance | 4.8 mi | session_detail_v1.completed_totals.distance_display | 4.8 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details | Distance tile | 4.8 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 4.8 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details · map | "(total)" distance | 4.8 mi | display_metrics.series_display.distance[last] | 4.8 mi (workouts.distance (the device total)) | yes |
| | **run with strides (2026-09-11) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 43:40 | get-week items[].done_headline | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 44m | get-week items[].moving_seconds (phone fmtDur) | 44m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 43:40 | completed_totals.duration_display | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 44 | completed_totals.duration_minutes | 44 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 43:40 | display_metrics.duration_s (phone formatDuration) | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **run with strides (2026-09-11) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 44:00 | display_metrics.elapsed_s (phone formatDuration) | 44:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **run with strides (2026-09-11) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 141 | completed_totals.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 141 | display_metrics.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| | **run with strides (2026-09-11) · avg pace** | | | | | |
| Garmin imperial | Performance | Pace (overall row, map pill) | 9:11/mi | completed_totals.avg_pace_display | 9:04/mi (moving seconds ÷ device distance) | **no** |
| Garmin imperial | Details | Avg Pace tile | 9:11/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 9:04/mi (moving seconds ÷ device distance) | **no** |
| | **run with strides (2026-09-11) · grade-adjusted pace** | | | | | |
| Garmin imperial | Details | Grade-Adj Pace tile | 9:06/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 9:06/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Garmin imperial | Performance | Grade-adjusted pace row | 9:06/mi | analysis_details.rows[Grade-adjusted pace] | 9:06/mi (display_metrics.gap_pace_display) | yes |
| | **run with strides (2026-09-11) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | 190 ft | display_metrics.elevation_display | 190 ft (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 190 ft | display_metrics.series_display.gain[last] | 190 ft (workouts.elevation_gain (device)) | yes |
| | **run with strides (2026-09-11) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 29 | items[].workout_analysis.session_detail_v1.load.workload | 29 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 29 | session_detail_v1.load.workload | 29 (workouts.workload_actual) | yes |
| | **run with strides (2026-09-11) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 43:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 44:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **interval run (2026-09-08) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 6.5 mi | get-week items[].done_headline | 6.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Week · day row | distance | 6.5 mi | get-week items[].done_distance | 6.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Performance | Distance | 6.5 mi | session_detail_v1.completed_totals.distance_display | 6.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details | Distance tile | 6.5 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 6.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details · map | "(total)" distance | 6.5 mi | display_metrics.series_display.distance[last] | 6.5 mi (workouts.distance (the device total)) | yes |
| | **interval run (2026-09-08) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 51:40 | get-week items[].done_headline | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 52m | get-week items[].moving_seconds (phone fmtDur) | 52m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 51:40 | completed_totals.duration_display | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 52 | completed_totals.duration_minutes | 52 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 51:40 | display_metrics.duration_s (phone formatDuration) | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **interval run (2026-09-08) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 52:00 | display_metrics.elapsed_s (phone formatDuration) | 52:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **interval run (2026-09-08) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 152 | completed_totals.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 152 | display_metrics.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| | **interval run (2026-09-08) · avg pace** | | | | | |
| Garmin imperial | Performance | Pace (overall row, map pill) | 8:01/mi | completed_totals.avg_pace_display | 7:56/mi (moving seconds ÷ device distance) | **no** |
| Garmin imperial | Details | Avg Pace tile | 8:01/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 7:56/mi (moving seconds ÷ device distance) | **no** |
| | **interval run (2026-09-08) · grade-adjusted pace** | | | | | |
| Garmin imperial | Details | Grade-Adj Pace tile | 7:53/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 7:53/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Garmin imperial | Performance | Grade-adjusted pace row | 7:53/mi | analysis_details.rows[Grade-adjusted pace] | 7:53/mi (display_metrics.gap_pace_display) | yes |
| | **interval run (2026-09-08) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | 246 ft | display_metrics.elevation_display | 246 ft (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 246 ft | display_metrics.series_display.gain[last] | 246 ft (workouts.elevation_gain (device)) | yes |
| | **interval run (2026-09-08) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 51 | items[].workout_analysis.session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 51 | session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| | **interval run (2026-09-08) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 51:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 52:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **steady ride (2026-09-10) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 22.4 mi | get-week items[].done_headline | 22.5 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Week · day row | distance | 22.4 mi | get-week items[].done_distance | 22.5 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Performance | Distance | 22.4 mi | session_detail_v1.completed_totals.distance_display | 22.5 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details | Distance tile | 22.4 mi | display_metrics.distance_tile_display | 22.5 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details · map | "(total)" distance | 22.4 mi | display_metrics.series_display.distance[last] | 22.5 mi (workouts.distance (the device total)) | **no** |
| | **steady ride (2026-09-10) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 1:14:40 | get-week items[].done_headline | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 1h 15m | get-week items[].moving_seconds (phone fmtDur) | 1h 15m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 1:14:40 | completed_totals.duration_display | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 75 | completed_totals.duration_minutes | 75 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 1:14:40 | display_metrics.duration_s (phone formatDuration) | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **steady ride (2026-09-10) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 1:15:00 | display_metrics.elapsed_s (phone formatDuration) | 1:15:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **steady ride (2026-09-10) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 129 | completed_totals.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 129 | display_metrics.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| | **steady ride (2026-09-10) · avg speed** | | | | | |
| Garmin imperial | Details | Avg Speed tile | 18.0 mph | display_metrics.avg_speed_display | 18.0 mph (device distance ÷ moving seconds) | yes |
| Garmin imperial | Details · map | Speed pill (avg) | 18.0 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 18.0 mph (device distance ÷ moving seconds) | yes |
| | **steady ride (2026-09-10) · avg power** | | | | | |
| Garmin imperial | Details | Avg Power tile | 139 W | display_metrics.avg_power | 139 W (workouts.avg_power (device)) | yes |
| | **steady ride (2026-09-10) · normalized power** | | | | | |
| Garmin imperial | Details | Norm Power tile | (absent) | display_metrics.normalized_power | (absent) (workouts.normalized_power (device)) | yes |
| | **steady ride (2026-09-10) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | 249 ft | display_metrics.elevation_display | 249 ft (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 249 ft | display_metrics.series_display.gain[last] | 249 ft (workouts.elevation_gain (device)) | yes |
| | **steady ride (2026-09-10) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 87 | items[].workout_analysis.session_detail_v1.load.workload | 87 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 87 | session_detail_v1.load.workload | 87 (workouts.workload_actual) | yes |
| | **steady ride (2026-09-10) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 1:14:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:15:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **anaerobic ride (2026-09-15) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 13.5 mi | get-week items[].done_headline | 13.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Week · day row | distance | 13.5 mi | get-week items[].done_distance | 13.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Performance | Distance | 13.5 mi | session_detail_v1.completed_totals.distance_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details | Distance tile | 13.5 mi | display_metrics.distance_tile_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Details · map | "(total)" distance | 13.4 mi | display_metrics.series_display.distance[last] | 13.5 mi (workouts.distance (the device total)) | **no** |
| | **anaerobic ride (2026-09-15) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 51:25 | get-week items[].done_headline | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 51m | get-week items[].moving_seconds (phone fmtDur) | 51m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 51:25 | completed_totals.duration_display | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 51 | completed_totals.duration_minutes | 51 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 51:25 | display_metrics.duration_s (phone formatDuration) | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **anaerobic ride (2026-09-15) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 51:45 | display_metrics.elapsed_s (phone formatDuration) | 51:45 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **anaerobic ride (2026-09-15) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 130 | completed_totals.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 130 | display_metrics.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| | **anaerobic ride (2026-09-15) · avg speed** | | | | | |
| Garmin imperial | Details | Avg Speed tile | 15.8 mph | display_metrics.avg_speed_display | 15.8 mph (device distance ÷ moving seconds) | yes |
| Garmin imperial | Details · map | Speed pill (avg) | 15.8 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 15.8 mph (device distance ÷ moving seconds) | yes |
| | **anaerobic ride (2026-09-15) · avg power** | | | | | |
| Garmin imperial | Details | Avg Power tile | 117 W | display_metrics.avg_power | 117 W (workouts.avg_power (device)) | yes |
| | **anaerobic ride (2026-09-15) · normalized power** | | | | | |
| Garmin imperial | Details | Norm Power tile | (absent) | display_metrics.normalized_power | (absent) (workouts.normalized_power (device)) | yes |
| | **anaerobic ride (2026-09-15) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | 246 ft | display_metrics.elevation_display | 246 ft (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 246 ft | display_metrics.series_display.gain[last] | 246 ft (workouts.elevation_gain (device)) | yes |
| | **anaerobic ride (2026-09-15) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 43 | items[].workout_analysis.session_detail_v1.load.workload | 43 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 43 | session_detail_v1.load.workload | 43 (workouts.workload_actual) | yes |
| | **anaerobic ride (2026-09-15) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 51:44 | display_metrics.zones.hr.bins[].t_s summed on the phone | 51:45 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **pool swim (2026-09-09) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 1.1 mi | get-week items[].done_headline | 1969 yd (workouts.distance (the device total)) | **no** |
| Garmin imperial | Week · day row | distance | 1.1 mi | get-week items[].done_distance | 1969 yd (workouts.distance (the device total)) | **no** |
| Garmin imperial | Performance | Distance | 1969 yd | session_detail_v1.completed_totals.distance_display | 1969 yd (workouts.distance (the device total)) | yes |
| Garmin imperial | Details | Distance tile | 1.1 mi | display_metrics.distance_display | 1969 yd (workouts.distance (the device total)) | **no** |
| | **pool swim (2026-09-09) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 35:00 | get-week items[].done_headline | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 35m | get-week items[].moving_seconds (phone fmtDur) | 35m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 35:00 | display_metrics.duration_s (phone formatDuration) | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **pool swim (2026-09-09) · elapsed time** | | | | | |
| Garmin imperial | Performance | Duration (swim card) | 39:00 | completed_totals.duration_s (phone fmtTimeLocal) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| Garmin imperial | Details | Duration tile | 39:00 | display_metrics.elapsed_s (phone formatDuration) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **pool swim (2026-09-09) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 131 | completed_totals.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 131 | display_metrics.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| | **pool swim (2026-09-09) · pace per 100** | | | | | |
| Garmin imperial | Performance | Pace | 1:47 /100yd | completed_totals.swim_pace_display | 1:47 /100yd (display_metrics.swim_pace_display (server)) | yes |
| Garmin imperial | Details | Avg Pace /100yd | 1:47 /100yd | display_metrics.avg_swim_pace_per_100yd (phone formatSwimPace) | 1:47 /100yd (display_metrics.swim_pace_display (server)) | yes |
| | **pool swim (2026-09-09) · lengths** | | | | | |
| Garmin imperial | Details | Lengths | 72 | workout.number_of_active_lengths | 72 (workouts.number_of_active_lengths) | yes |
| | **pool swim (2026-09-09) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | (absent) | items[].workout_analysis.session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | (absent) | session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · distance** | | | | | |
| Garmin imperial | Today · done card | headline distance | 20.1 mi | get-week items[].done_headline | 20.2 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Week · day row | distance | 20.1 mi | get-week items[].done_distance | 20.2 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Performance | Distance | 20.1 mi | session_detail_v1.completed_totals.distance_display | 20.2 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details | Distance tile | 20.1 mi | display_metrics.distance_tile_display | 20.2 mi (workouts.distance (the device total)) | **no** |
| Garmin imperial | Details · map | "(total)" distance | 20.1 mi | display_metrics.series_display.distance[last] | 20.2 mi (workouts.distance (the device total)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · moving time** | | | | | |
| Garmin imperial | Today · done card | headline time | 59:40 | get-week items[].done_headline | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Week · day row | time | 1h 00m | get-week items[].moving_seconds (phone fmtDur) | 1h 00m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration | 59:40 | completed_totals.duration_display | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Performance | Duration chip minutes | 60 | completed_totals.duration_minutes | 60 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Garmin imperial | Details | Moving Time tile | 59:40 | display_metrics.duration_s (phone formatDuration) | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · elapsed time** | | | | | |
| Garmin imperial | Details | Duration tile | 1:00:00 | display_metrics.elapsed_s (phone formatDuration) | 1:00:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg heart rate** | | | | | |
| Garmin imperial | Performance | BPM (overall row) | 139 | completed_totals.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| Garmin imperial | Details | Avg HR tile | 139 | display_metrics.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg speed** | | | | | |
| Garmin imperial | Details | Avg Speed tile | 20.3 mph | display_metrics.avg_speed_display | 20.3 mph (device distance ÷ moving seconds) | yes |
| Garmin imperial | Details · map | Speed pill (avg) | 20.3 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 20.3 mph (device distance ÷ moving seconds) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg power** | | | | | |
| Garmin imperial | Details | Avg Power tile | 165 W | display_metrics.avg_power | 165 W (workouts.avg_power (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · normalized power** | | | | | |
| Garmin imperial | Details | Norm Power tile | (absent) | display_metrics.normalized_power | (absent) (workouts.normalized_power (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · elevation gain** | | | | | |
| Garmin imperial | Details | Elevation tile | N/A | display_metrics.elevation_display | N/A (workouts.elevation_gain (device)) | yes |
| Garmin imperial | Details · map | "+gain (total)" | 0 ft | display_metrics.series_display.gain[last] | 0 ft (workouts.elevation_gain (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · workload** | | | | | |
| Garmin imperial | Today · done card | Workload chip | 98 | items[].workout_analysis.session_detail_v1.load.workload | 98 (workouts.workload_actual) | yes |
| Garmin imperial | Details | Workload tile | 98 | session_detail_v1.load.workload | 98 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · time in zones** | | | | | |
| Garmin imperial | Details | HR zones "Duration" | 59:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:00:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · plan link** | | | | | |
| Garmin imperial | Week · day row | attached to a planned session | none | get-week items[].planned_id | none (workouts.planned_id) | yes |
| | **popup (Anaerobic Ride 2026-09-15) · distance** | | | | | |
| Garmin imperial | Post-workout popup | distance under the title | 13.5 mi | check-feedback-needed workout.distance_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Garmin imperial | Today · done card | headline distance | 13.5 mi | get-week items[].done_headline | 13.5 mi (the popup, same session) | yes |
| | **planned long run · length** | | | | | |
| Garmin imperial | Today · planned card / Planned tab header | length | 110:00 | get-week planned_workout.planned_duration_label | 1:50:15 (planned_workouts.total_duration_seconds) | **no** |
| Garmin imperial | Week · day row (planned) | length | 1h 50m | planned_duration_seconds (phone fmtDur) | 1h 50m (planned_workouts.total_duration_seconds) | yes |
| Garmin imperial | Performance | planned duration (Duration chip "of M min") | 110 | session_detail_v1.planned_totals.duration_s (phone ÷60) | 110 (planned_workouts.total_duration_seconds) | yes |
| | **plan · current week** | | | | | |
| Garmin imperial | Today header | "week N of M" | week 6 of 12 | get-week training_plan_context.weekPosition | week 6 of 12 (plan start date → today) | yes |
| Garmin imperial | State header | "WK n" | week 6 of 12 | coach weekly_state_v1.week.index | week 6 of 12 (plan start date → today) | yes |
| Garmin imperial | State · strength row | block line | Run + Ride + Strength · week 6 of 12 | coach plan.block.line | Run + Ride + Strength · week 6 of 12 (plan start date → today) | yes |
| Garmin imperial | Plans list / Goals | "Wk N" | week 6 | plan-overview plans[].current_week_index | week 6 (plan start date → today) | yes |
| Garmin imperial | Plan detail | "Week N of M" | week 6 of 12 | plan-overview {plan_id} overview.current_week_index / total_weeks | week 6 of 12 (plan start date → today) | yes |
| Garmin imperial | Adjust · deload | "Make week N a deload week" | week 7 | rematerialize-standing-block next_week | week 7 (next week = current week + 1) | yes |
| Garmin imperial | Checkpoint (State) | current week | week 6 | endurance-checkpoint current_week | week 6 (plan start date → today) | yes |
| | **plan · sessions** | | | | | |
| Garmin imperial | Plan detail header | "N workouts" | 120 | plan-overview overview.totals.sessions | 120 (planned_workouts rows in the plan) | yes |
| | **plan · total minutes** | | | | | |
| Garmin imperial | Plan detail header | "Xh Y total" | 7229 | plan-overview overview.totals.minutes | 7229 (Σ each planned row's whole minutes (the rows' own rounding)) | yes |
| | **week · planned minutes** | | | | | |
| Garmin imperial | Week bar | "Planned Xh YYm" | 6h 06m | get-week weekly_stats.planned_minutes (phone fmtDur) | 6h 06m (Σ this week's planned endurance rows, each rounded to minutes (lifts count as sessions)) | yes |
| | **load · fitness today** | | | | | |
| Garmin imperial | State · LOAD / Today header | fitness | 48 | fitness_fatigue.display.fitness.value | 48 (fitness_fatigue.fitness (today)) | yes |
| Garmin imperial | State · LOAD ⓘ | "Today: F − A = form" — F | 49 | fitness_fatigue.key_line.fitness (entering today) | 48 (fitness_fatigue.fitness (today)) | **no** |
| | **load · fatigue today** | | | | | |
| Garmin imperial | State · LOAD | fatigue | 83 | fitness_fatigue.display.fatigue.value | 83 (fitness_fatigue.fatigue (today)) | yes |
| Garmin imperial | State · LOAD ⓘ | "Today: F − A = form" — A | 97 | fitness_fatigue.key_line.fatigue (entering today) | 83 (fitness_fatigue.fatigue (today)) | **no** |
| | **load · form today** | | | | | |
| Garmin imperial | State · LOAD | form | −48 | fitness_fatigue.display.form.value | −48 (fitness_fatigue.form) | yes |
| Garmin imperial | State · LOAD ⓘ | form | −48 | fitness_fatigue.key_line.form | −48 (fitness_fatigue.form) | yes |
| Garmin imperial | State header | form headline | −48 | weekly_state_v1.load.form_headline | −48 (fitness_fatigue.form) | yes |
| Garmin imperial | Today header | "form −N" | −48 | fitness_fatigue.form (phone Math.round) | −48 (fitness_fatigue.form) | yes |
| | **week · run distance** | | | | | |
| Garmin imperial | Today header | "run N mi" | (none) | get-week weekly_stats.distances.run_meters (phone ÷1609.34) | (none) (Σ workouts.distance, runs this week) | yes |
| | **week · ride distance** | | | | | |
| Garmin imperial | Today header | "ride N mi" | 26.9 mi | get-week weekly_stats.distances.cycling_meters (phone ÷1609.34) | 27.0 mi (Σ workouts.distance, rides this week) | **no** |
| | **week · done distance** | | | | | |
| Garmin imperial | Week bar | "Done … · N mi" | 27 mi | get-week weekly_stats.done_distance_display | 27 mi (Σ workouts.distance, run + ride + swim this week) | yes |
| | **week · weight moved** | | | | | |
| Garmin imperial | Today header | "N lb" (orange dot) | 21,905 lb | get-week weekly_stats.strength_volume_lb (phone ×0.453592) | 21,905 lb (Σ items[].strength_volume_lb, this week's lifts (the Week rows)) | yes |
| | **typed lift (2026-09-14) · Bench Press set 5 weight** | | | | | |
| Garmin imperial | Logger (box, as typed) | weight box | 180 lb | the athlete's typed number (saved as pounds) | 180 lb (workouts.strength_exercises[].sets[].weight → liftInAthletesUnit) | yes |
| Garmin imperial | Performance · compare table | completed set | 180 lb | session_detail_v1.strength_slots[].completed_sets[].weight_display | 180 lb (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| Garmin imperial | Export · sets.csv | Weight | 180 lb | export-data sets.csv Weight | 180 lb (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · Bench Press top set** | | | | | |
| Garmin imperial | State · logged sets | set line | 180 lb × 5 | coach weekly_state_v1.strength_logged_sets | 180 lb × 5 (workouts.strength_exercises → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · weight moved** | | | | | |
| Garmin imperial | Performance | "Volume (lbs)" tile | 10,875 lb | session_detail_v1.strength_totals.volume_lb (label "lbs" hard-coded) | 10,875 lb (strength_totals.volume_lb (pounds) in the athlete unit) | yes |
| Garmin imperial | Week · day row | volume | 10,875 lb | get-week items[].done_volume | 10,875 lb (strength_totals.volume_lb (pounds) in the athlete unit) | yes |
| | **typed lift (2026-09-14) · Band Pull Apart band** | | | | | |
| Garmin imperial | Logger (Band box) | band box | 35 lb | sets[].resistance_level (box titled "Band (lb)" on every account) | 35 lb (the band's 35 lb in the athlete unit (Performance prints it so)) | yes |
| | **typed lift (2026-09-14) · Band Pull Apart set 1** | | | | | |
| Garmin imperial | Performance · compare table | completed set | 15 reps · 35 lb | strength_slots[].completed_sets[0] | 15 reps · 35 lb (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **typed lift (2026-09-14) · Pull Up set 1** | | | | | |
| Garmin imperial | Performance · compare table | completed set | 8 reps | strength_slots[].completed_sets[0] | 8 reps (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **next Back Squat (2026-09-18) · top set weight** | | | | | |
| Garmin imperial | Logger (box, prescribed) | weight box | 245 | planned step set_plan[last].weight_in_unit | 245 (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **next Back Squat (2026-09-18) · weight** | | | | | |
| Garmin imperial | Planned tab / Today card | weight text | 245 lb | planned strength_exercises[].weight_display | 245 lb (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **lift on file · squat** | | | | | |
| Garmin imperial | Adjust / Baselines | lift row | 290 lb | save-baselines readout.strength.lifts[].row.value | 290 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | My Record | lift + "lbs" | 290 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 290 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Plan builder · Know your numbers | lift (no unit printed) | 290 | get-arc-context arc.builder.lifts[].value | 290 (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Export · profile.json | numbers.squat | 290 | export-data profile.json numbers | 290 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · deadlift** | | | | | |
| Garmin imperial | Adjust / Baselines | lift row | 340 lb | save-baselines readout.strength.lifts[].row.value | 340 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | My Record | lift + "lbs" | 340 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 340 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Plan builder · Know your numbers | lift (no unit printed) | 340 | get-arc-context arc.builder.lifts[].value | 340 (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Export · profile.json | numbers.deadlift | 340 | export-data profile.json numbers | 340 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · bench** | | | | | |
| Garmin imperial | Adjust / Baselines | lift row | 205 lb | save-baselines readout.strength.lifts[].row.value | 205 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | My Record | lift + "lbs" | 205 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 205 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Plan builder · Know your numbers | lift (no unit printed) | 205 | get-arc-context arc.builder.lifts[].value | 205 (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Export · profile.json | numbers.bench | 205 | export-data profile.json numbers | 205 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · overheadPress** | | | | | |
| Garmin imperial | Adjust / Baselines | lift row | 135 lb | save-baselines readout.strength.lifts[].row.value | 135 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | My Record | lift + "lbs" | 135 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 135 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Plan builder · Know your numbers | lift (no unit printed) | 135 | get-arc-context arc.builder.lifts[].value | 135 (the lift resolver (readout raw, athlete unit)) | yes |
| Garmin imperial | Export · profile.json | numbers.overhead_press | 135 | export-data profile.json numbers | 135 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **tested max · squat** | | | | | |
| Garmin imperial | Logger · test result card | "Saved: N" | 290 lb | save-baseline-test computed[].estimated1RM_in_unit | 290 lb (performance_numbers.squat after the test (pounds) → athlete unit) | yes |
| Garmin imperial | Performance · test result | "→ e1RM N lb" | 290 lb | session_detail_v1.test_result.lifts[].e1rm (StrengthTestResult.tsx:30 prints "lb") | 290 lb (performance_numbers.squat after the test (pounds) → athlete unit) | yes |
| Garmin imperial | Logger · test sheet | notes "on file: N" | 290 lb | strength-test-session exercises[].notes | 290 lb (performance_numbers.squat (pounds) → athlete unit) | yes |
| | **run threshold pace** | | | | | |
| Garmin imperial | Adjust / Baselines | Threshold pace | 7:02/mi | save-baselines readout.run.threshold.value | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes |
| Garmin imperial | Plan builder · Know your numbers | run threshold | 7:02/mi | get-arc-context arc.builder.run_threshold_display | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes |
| Garmin imperial | Export · profile.json | numbers.threshold_pace_min_per_mi | (absent) | export-data profile.json (reads performance_numbers) | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | **no** |
| Garmin imperial | Checkpoint sheet (when due) | threshold "on plan" | 7:02/mi | planned_workouts.computed.anchors.threshold_sec_per_mi (phone "/mi") | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes — the sheet is not due on these accounts (week 7); value read from the field it prints |
| | **easy pace range** | | | | | |
| Garmin imperial | Adjust / Baselines | Easy pace | 8:01–9:04/mi | save-baselines readout.run.easy.value | 8:01–9:04/mi (accepted threshold × 1.14 – × 1.29) | yes |
| | **FTP in use** | | | | | |
| Garmin imperial | Adjust / Baselines | FTP | 165 W | save-baselines readout.bike.ftp.value | 165 W (learned_fitness.ride_ftp_accepted) | yes |
| Garmin imperial | State · bike row | FTP | 165 W | coach weekly_state_v1.trends.applied_ftp | 165 W (learned_fitness.ride_ftp_accepted) | yes |
| Garmin imperial | Planned rides (priced from) | ftp anchor | 165 W | planned_workouts.computed.anchors.ftp_w (next ride) | 165 W (learned_fitness.ride_ftp_accepted) | yes — after the accept and the re-price |
| Garmin imperial | Export · profile.json | numbers.ftp | 210 W | export-data profile.json (reads performance_numbers.ftp) | 165 W (learned_fitness.ride_ftp_accepted) | **no** |
| | **threshold heart rate (run)** | | | | | |
| Garmin imperial | Adjust / Baselines | Threshold heart rate | 168 bpm | save-baselines readout.run.lthr.value | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | yes |
| Garmin imperial | Export · profile.json | numbers.threshold_hr | (absent) | export-data profile.json (reads performance_numbers.threshold_heart_rate) | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | **no** |
| | **max heart rate (run)** | | | | | |
| Garmin imperial | Adjust / Baselines | Max heart rate | 186 bpm | save-baselines readout.run.max_hr.value | 186 bpm (configured_hr_zones.manual_run_max_hr (typed)) | yes |
| | **resting heart rate** | | | | | |
| Garmin imperial | Adjust / Baselines | Resting heart rate | 52 bpm | save-baselines readout.run.resting_hr.value | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | yes |
| Garmin imperial | Export · profile.json | numbers.resting_hr | (absent) | export-data profile.json (reads performance_numbers.restingHeartRate) | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | **no** |
| | **State · squat e1RM** | | | | | |
| Garmin imperial | State · strength tile | e1RM | 280 lb | strengthFitness.perLift[].readout.e1rm | 280 lb (perLift latest e1RM (pounds) → athlete unit) | yes |
| Garmin imperial | State · strength row (collapsed) | value (no unit) | 280 | strengthFitness.perLift[].latestE1rm (phone Math.round) | 280 (perLift latest e1RM (pounds) → athlete unit) | yes |
| Garmin imperial | State · strength chart | range label | 280–290 lb | perLift[].seriesFit.low/high + readout.unit | 280–290 lb (seriesFit (pounds) → athlete unit) | yes |
| | **swims in window** | | | | | |
| Garmin imperial | State · swim row | "N swims" | 2 | strengthFitness… swimVolume.swims | 2 (workouts, type swim, last 8 weeks) | yes |
| | **long run (2026-09-12) · distance** | | | | | |
| Garmin imperial | Export · workouts.csv | distance_mi | 10.09 | export-data workouts.csv | 10.09 (workouts.distance (the device total)) | yes |
| | **share to Strava** | | | | | |
| Garmin imperial | Performance · "Share to Strava" | reply | 500 {"error":"user is not defined"} | share-strength-to-strava | a post, or a "not connected" answer (share-strength-to-strava/index.ts) | **no** |
| | **long run with a set (2026-09-12) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 10.0 mi | get-week items[].done_headline | 10.1 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Week · day row | distance | 10.0 mi | get-week items[].done_distance | 10.1 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Performance | Distance | 10.0 mi | session_detail_v1.completed_totals.distance_display | 10.1 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details | Distance tile | 10.0 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 10.1 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details · map | "(total)" distance | 10.0 mi | display_metrics.series_display.distance[last] | 10.1 mi (workouts.distance (the device total)) | **no** |
| | **long run with a set (2026-09-12) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 1:29:40 | get-week items[].done_headline | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 1h 30m | get-week items[].moving_seconds (phone fmtDur) | 1h 30m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 1:29:40 | completed_totals.duration_display | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 90 | completed_totals.duration_minutes | 90 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 1:29:40 | display_metrics.duration_s (phone formatDuration) | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **long run with a set (2026-09-12) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 1:30:00 | display_metrics.elapsed_s (phone formatDuration) | 1:30:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **long run with a set (2026-09-12) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 145 | completed_totals.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 145 | display_metrics.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| | **long run with a set (2026-09-12) · avg pace** | | | | | |
| Strava imperial | Performance | Pace (overall row, map pill) | 8:56/mi | completed_totals.avg_pace_display | 8:53/mi (moving seconds ÷ device distance) | **no** |
| Strava imperial | Details | Avg Pace tile | 8:56/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 8:53/mi (moving seconds ÷ device distance) | **no** |
| | **long run with a set (2026-09-12) · grade-adjusted pace** | | | | | |
| Strava imperial | Details | Grade-Adj Pace tile | 8:50/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 8:50/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava imperial | Performance | Grade-adjusted pace row | 8:50/mi | analysis_details.rows[Grade-adjusted pace] | 8:50/mi (display_metrics.gap_pace_display) | yes |
| | **long run with a set (2026-09-12) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | 394 ft | display_metrics.elevation_display | 394 ft (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 394 ft | display_metrics.series_display.gain[last] | 394 ft (workouts.elevation_gain (device)) | yes |
| | **long run with a set (2026-09-12) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 105 | items[].workout_analysis.session_detail_v1.load.workload | 105 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 105 | session_detail_v1.load.workload | 105 (workouts.workload_actual) | yes |
| | **long run with a set (2026-09-12) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 1:29:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:30:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **run with strides (2026-09-11) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 4.8 mi | get-week items[].done_headline | 4.8 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Week · day row | distance | 4.8 mi | get-week items[].done_distance | 4.8 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Performance | Distance | 4.8 mi | session_detail_v1.completed_totals.distance_display | 4.8 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details | Distance tile | 4.8 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 4.8 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details · map | "(total)" distance | 4.8 mi | display_metrics.series_display.distance[last] | 4.8 mi (workouts.distance (the device total)) | yes |
| | **run with strides (2026-09-11) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 43:40 | get-week items[].done_headline | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 44m | get-week items[].moving_seconds (phone fmtDur) | 44m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 43:40 | completed_totals.duration_display | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 44 | completed_totals.duration_minutes | 44 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 43:40 | display_metrics.duration_s (phone formatDuration) | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **run with strides (2026-09-11) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 44:00 | display_metrics.elapsed_s (phone formatDuration) | 44:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **run with strides (2026-09-11) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 141 | completed_totals.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 141 | display_metrics.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| | **run with strides (2026-09-11) · avg pace** | | | | | |
| Strava imperial | Performance | Pace (overall row, map pill) | 9:07/mi | completed_totals.avg_pace_display | 9:04/mi (moving seconds ÷ device distance) | **no** |
| Strava imperial | Details | Avg Pace tile | 9:07/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 9:04/mi (moving seconds ÷ device distance) | **no** |
| | **run with strides (2026-09-11) · grade-adjusted pace** | | | | | |
| Strava imperial | Details | Grade-Adj Pace tile | 9:02/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 9:02/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava imperial | Performance | Grade-adjusted pace row | 9:02/mi | analysis_details.rows[Grade-adjusted pace] | 9:02/mi (display_metrics.gap_pace_display) | yes |
| | **run with strides (2026-09-11) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | 190 ft | display_metrics.elevation_display | 190 ft (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 190 ft | display_metrics.series_display.gain[last] | 190 ft (workouts.elevation_gain (device)) | yes |
| | **run with strides (2026-09-11) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 51 | items[].workout_analysis.session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 51 | session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| | **run with strides (2026-09-11) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 43:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 44:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **interval run (2026-09-08) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 6.5 mi | get-week items[].done_headline | 6.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Week · day row | distance | 6.5 mi | get-week items[].done_distance | 6.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Performance | Distance | 6.5 mi | session_detail_v1.completed_totals.distance_display | 6.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details | Distance tile | 6.5 mi | display_metrics.distance_km (phone formatDistance, ×0.621371) | 6.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details · map | "(total)" distance | 6.5 mi | display_metrics.series_display.distance[last] | 6.5 mi (workouts.distance (the device total)) | yes |
| | **interval run (2026-09-08) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 51:40 | get-week items[].done_headline | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 52m | get-week items[].moving_seconds (phone fmtDur) | 52m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 51:40 | completed_totals.duration_display | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 52 | completed_totals.duration_minutes | 52 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 51:40 | display_metrics.duration_s (phone formatDuration) | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **interval run (2026-09-08) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 52:00 | display_metrics.elapsed_s (phone formatDuration) | 52:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **interval run (2026-09-08) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 152 | completed_totals.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 152 | display_metrics.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| | **interval run (2026-09-08) · avg pace** | | | | | |
| Strava imperial | Performance | Pace (overall row, map pill) | 7:58/mi | completed_totals.avg_pace_display | 7:56/mi (moving seconds ÷ device distance) | **no** |
| Strava imperial | Details | Avg Pace tile | 7:58/mi | display_metrics.avg_pace_s_per_km (phone formatPace) | 7:56/mi (moving seconds ÷ device distance) | **no** |
| | **interval run (2026-09-08) · grade-adjusted pace** | | | | | |
| Strava imperial | Details | Grade-Adj Pace tile | 7:51/mi | display_metrics.gap_pace_s_per_km (phone formatPace) | 7:51/mi (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava imperial | Performance | Grade-adjusted pace row | 7:51/mi | analysis_details.rows[Grade-adjusted pace] | 7:51/mi (display_metrics.gap_pace_display) | yes |
| | **interval run (2026-09-08) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | 246 ft | display_metrics.elevation_display | 246 ft (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 246 ft | display_metrics.series_display.gain[last] | 246 ft (workouts.elevation_gain (device)) | yes |
| | **interval run (2026-09-08) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 52 | items[].workout_analysis.session_detail_v1.load.workload | 52 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 52 | session_detail_v1.load.workload | 52 (workouts.workload_actual) | yes |
| | **interval run (2026-09-08) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 51:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 52:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **steady ride (2026-09-10) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 22.4 mi | get-week items[].done_headline | 22.5 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Week · day row | distance | 22.4 mi | get-week items[].done_distance | 22.5 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Performance | Distance | 22.4 mi | session_detail_v1.completed_totals.distance_display | 22.5 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details | Distance tile | 22.4 mi | display_metrics.distance_tile_display | 22.5 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details · map | "(total)" distance | 22.4 mi | display_metrics.series_display.distance[last] | 22.5 mi (workouts.distance (the device total)) | **no** |
| | **steady ride (2026-09-10) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 1:14:40 | get-week items[].done_headline | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 1h 15m | get-week items[].moving_seconds (phone fmtDur) | 1h 15m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 1:14:40 | completed_totals.duration_display | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 75 | completed_totals.duration_minutes | 75 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 1:14:40 | display_metrics.duration_s (phone formatDuration) | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **steady ride (2026-09-10) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 1:15:00 | display_metrics.elapsed_s (phone formatDuration) | 1:15:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **steady ride (2026-09-10) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 129 | completed_totals.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 129 | display_metrics.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| | **steady ride (2026-09-10) · avg speed** | | | | | |
| Strava imperial | Details | Avg Speed tile | 18.0 mph | display_metrics.avg_speed_display | 18.0 mph (device distance ÷ moving seconds) | yes |
| Strava imperial | Details · map | Speed pill (avg) | 18.0 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 18.0 mph (device distance ÷ moving seconds) | yes |
| | **steady ride (2026-09-10) · avg power** | | | | | |
| Strava imperial | Details | Avg Power tile | 139 W | display_metrics.avg_power | 139 W (workouts.avg_power (device)) | yes |
| | **steady ride (2026-09-10) · normalized power** | | | | | |
| Strava imperial | Details | Norm Power tile | 139 W | display_metrics.normalized_power | 146 W (workouts.normalized_power (device)) | **no** |
| | **steady ride (2026-09-10) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | 249 ft | display_metrics.elevation_display | 249 ft (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 249 ft | display_metrics.series_display.gain[last] | 249 ft (workouts.elevation_gain (device)) | yes |
| | **steady ride (2026-09-10) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 99 | items[].workout_analysis.session_detail_v1.load.workload | 99 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 99 | session_detail_v1.load.workload | 99 (workouts.workload_actual) | yes |
| | **steady ride (2026-09-10) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 1:14:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:15:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **anaerobic ride (2026-09-15) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 13.5 mi | get-week items[].done_headline | 13.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Week · day row | distance | 13.5 mi | get-week items[].done_distance | 13.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Performance | Distance | 13.5 mi | session_detail_v1.completed_totals.distance_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details | Distance tile | 13.5 mi | display_metrics.distance_tile_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Details · map | "(total)" distance | 13.4 mi | display_metrics.series_display.distance[last] | 13.5 mi (workouts.distance (the device total)) | **no** |
| | **anaerobic ride (2026-09-15) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 51:25 | get-week items[].done_headline | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 51m | get-week items[].moving_seconds (phone fmtDur) | 51m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 51:25 | completed_totals.duration_display | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 51 | completed_totals.duration_minutes | 51 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 51:25 | display_metrics.duration_s (phone formatDuration) | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **anaerobic ride (2026-09-15) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 51:45 | display_metrics.elapsed_s (phone formatDuration) | 51:45 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **anaerobic ride (2026-09-15) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 130 | completed_totals.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 130 | display_metrics.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| | **anaerobic ride (2026-09-15) · avg speed** | | | | | |
| Strava imperial | Details | Avg Speed tile | 15.8 mph | display_metrics.avg_speed_display | 15.8 mph (device distance ÷ moving seconds) | yes |
| Strava imperial | Details · map | Speed pill (avg) | 15.8 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 15.8 mph (device distance ÷ moving seconds) | yes |
| | **anaerobic ride (2026-09-15) · avg power** | | | | | |
| Strava imperial | Details | Avg Power tile | 117 W | display_metrics.avg_power | 117 W (workouts.avg_power (device)) | yes |
| | **anaerobic ride (2026-09-15) · normalized power** | | | | | |
| Strava imperial | Details | Norm Power tile | 146 W | display_metrics.normalized_power | 123 W (workouts.normalized_power (device)) | **no** |
| | **anaerobic ride (2026-09-15) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | 246 ft | display_metrics.elevation_display | 246 ft (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 246 ft | display_metrics.series_display.gain[last] | 246 ft (workouts.elevation_gain (device)) | yes |
| | **anaerobic ride (2026-09-15) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 48 | items[].workout_analysis.session_detail_v1.load.workload | 48 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 48 | session_detail_v1.load.workload | 48 (workouts.workload_actual) | yes |
| | **anaerobic ride (2026-09-15) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 51:44 | display_metrics.zones.hr.bins[].t_s summed on the phone | 51:45 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **pool swim (2026-09-09) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 1.1 mi | get-week items[].done_headline | 1969 yd (workouts.distance (the device total)) | **no** |
| Strava imperial | Week · day row | distance | 1.1 mi | get-week items[].done_distance | 1969 yd (workouts.distance (the device total)) | **no** |
| Strava imperial | Performance | Distance | 1969 yd | session_detail_v1.completed_totals.distance_display | 1969 yd (workouts.distance (the device total)) | yes |
| Strava imperial | Details | Distance tile | 1.1 mi | display_metrics.distance_display | 1969 yd (workouts.distance (the device total)) | **no** |
| | **pool swim (2026-09-09) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 35:00 | get-week items[].done_headline | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 35m | get-week items[].moving_seconds (phone fmtDur) | 35m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 35:00 | display_metrics.duration_s (phone formatDuration) | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **pool swim (2026-09-09) · elapsed time** | | | | | |
| Strava imperial | Performance | Duration (swim card) | 39:00 | completed_totals.duration_s (phone fmtTimeLocal) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| Strava imperial | Details | Duration tile | 39:00 | display_metrics.elapsed_s (phone formatDuration) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **pool swim (2026-09-09) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 131 | completed_totals.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 131 | display_metrics.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| | **pool swim (2026-09-09) · pace per 100** | | | | | |
| Strava imperial | Performance | Pace | 1:47 /100yd | completed_totals.swim_pace_display | 1:47 /100yd (display_metrics.swim_pace_display (server)) | yes |
| Strava imperial | Details | Avg Pace /100yd | 1:47 /100yd | display_metrics.avg_swim_pace_per_100yd (phone formatSwimPace) | 1:47 /100yd (display_metrics.swim_pace_display (server)) | yes |
| | **pool swim (2026-09-09) · lengths** | | | | | |
| Strava imperial | Details | Lengths | (absent) | workout.number_of_active_lengths | (absent) (workouts.number_of_active_lengths) | yes |
| | **pool swim (2026-09-09) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | (absent) | items[].workout_analysis.session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | (absent) | session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · distance** | | | | | |
| Strava imperial | Today · done card | headline distance | 20.1 mi | get-week items[].done_headline | 20.2 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Week · day row | distance | 20.1 mi | get-week items[].done_distance | 20.2 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Performance | Distance | 20.1 mi | session_detail_v1.completed_totals.distance_display | 20.2 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details | Distance tile | 20.1 mi | display_metrics.distance_tile_display | 20.2 mi (workouts.distance (the device total)) | **no** |
| Strava imperial | Details · map | "(total)" distance | 20.1 mi | display_metrics.series_display.distance[last] | 20.2 mi (workouts.distance (the device total)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · moving time** | | | | | |
| Strava imperial | Today · done card | headline time | 59:40 | get-week items[].done_headline | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Week · day row | time | 1h 00m | get-week items[].moving_seconds (phone fmtDur) | 1h 00m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration | 59:40 | completed_totals.duration_display | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Performance | Duration chip minutes | 60 | completed_totals.duration_minutes | 60 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava imperial | Details | Moving Time tile | 59:40 | display_metrics.duration_s (phone formatDuration) | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · elapsed time** | | | | | |
| Strava imperial | Details | Duration tile | 1:00:00 | display_metrics.elapsed_s (phone formatDuration) | 1:00:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg heart rate** | | | | | |
| Strava imperial | Performance | BPM (overall row) | 139 | completed_totals.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| Strava imperial | Details | Avg HR tile | 139 | display_metrics.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg speed** | | | | | |
| Strava imperial | Details | Avg Speed tile | 20.3 mph | display_metrics.avg_speed_display | 20.3 mph (device distance ÷ moving seconds) | yes |
| Strava imperial | Details · map | Speed pill (avg) | 20.3 mph | display_metrics.avg_speed_mps (phone formatSpeed) | 20.3 mph (device distance ÷ moving seconds) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg power** | | | | | |
| Strava imperial | Details | Avg Power tile | 165 W | display_metrics.avg_power | 165 W (workouts.avg_power (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · normalized power** | | | | | |
| Strava imperial | Details | Norm Power tile | 165 W | display_metrics.normalized_power | 173 W (workouts.normalized_power (device)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · elevation gain** | | | | | |
| Strava imperial | Details | Elevation tile | N/A | display_metrics.elevation_display | N/A (workouts.elevation_gain (device)) | yes |
| Strava imperial | Details · map | "+gain (total)" | 0 ft | display_metrics.series_display.gain[last] | 0 ft (workouts.elevation_gain (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · workload** | | | | | |
| Strava imperial | Today · done card | Workload chip | 111 | items[].workout_analysis.session_detail_v1.load.workload | 111 (workouts.workload_actual) | yes |
| Strava imperial | Details | Workload tile | 111 | session_detail_v1.load.workload | 111 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · time in zones** | | | | | |
| Strava imperial | Details | HR zones "Duration" | 59:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:00:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · plan link** | | | | | |
| Strava imperial | Week · day row | attached to a planned session | none | get-week items[].planned_id | none (workouts.planned_id) | yes |
| | **popup (Anaerobic Ride 2026-09-15) · distance** | | | | | |
| Strava imperial | Post-workout popup | distance under the title | 13.5 mi | check-feedback-needed workout.distance_display | 13.5 mi (workouts.distance (the device total)) | yes |
| Strava imperial | Today · done card | headline distance | 13.5 mi | get-week items[].done_headline | 13.5 mi (the popup, same session) | yes |
| | **planned long run · length** | | | | | |
| Strava imperial | Today · planned card / Planned tab header | length | 110:00 | get-week planned_workout.planned_duration_label | 1:50:15 (planned_workouts.total_duration_seconds) | **no** |
| Strava imperial | Week · day row (planned) | length | 1h 50m | planned_duration_seconds (phone fmtDur) | 1h 50m (planned_workouts.total_duration_seconds) | yes |
| Strava imperial | Performance | planned duration (Duration chip "of M min") | 110 | session_detail_v1.planned_totals.duration_s (phone ÷60) | 110 (planned_workouts.total_duration_seconds) | yes |
| | **plan · current week** | | | | | |
| Strava imperial | Today header | "week N of M" | week 6 of 12 | get-week training_plan_context.weekPosition | week 6 of 12 (plan start date → today) | yes |
| Strava imperial | State header | "WK n" | week 6 of 12 | coach weekly_state_v1.week.index | week 6 of 12 (plan start date → today) | yes |
| Strava imperial | State · strength row | block line | Run + Ride + Strength · week 6 of 12 | coach plan.block.line | Run + Ride + Strength · week 6 of 12 (plan start date → today) | yes |
| Strava imperial | Plans list / Goals | "Wk N" | week 6 | plan-overview plans[].current_week_index | week 6 (plan start date → today) | yes |
| Strava imperial | Plan detail | "Week N of M" | week 6 of 12 | plan-overview {plan_id} overview.current_week_index / total_weeks | week 6 of 12 (plan start date → today) | yes |
| Strava imperial | Adjust · deload | "Make week N a deload week" | week 7 | rematerialize-standing-block next_week | week 7 (next week = current week + 1) | yes |
| Strava imperial | Checkpoint (State) | current week | week 6 | endurance-checkpoint current_week | week 6 (plan start date → today) | yes |
| | **plan · sessions** | | | | | |
| Strava imperial | Plan detail header | "N workouts" | 120 | plan-overview overview.totals.sessions | 120 (planned_workouts rows in the plan) | yes |
| | **plan · total minutes** | | | | | |
| Strava imperial | Plan detail header | "Xh Y total" | 7229 | plan-overview overview.totals.minutes | 7229 (Σ each planned row's whole minutes (the rows' own rounding)) | yes |
| | **week · planned minutes** | | | | | |
| Strava imperial | Week bar | "Planned Xh YYm" | 6h 06m | get-week weekly_stats.planned_minutes (phone fmtDur) | 6h 06m (Σ this week's planned endurance rows, each rounded to minutes (lifts count as sessions)) | yes |
| | **load · fitness today** | | | | | |
| Strava imperial | State · LOAD / Today header | fitness | 63 | fitness_fatigue.display.fitness.value | 63 (fitness_fatigue.fitness (today)) | yes |
| Strava imperial | State · LOAD ⓘ | "Today: F − A = form" — F | 64 | fitness_fatigue.key_line.fitness (entering today) | 63 (fitness_fatigue.fitness (today)) | **no** |
| | **load · fatigue today** | | | | | |
| Strava imperial | State · LOAD | fatigue | 100 | fitness_fatigue.display.fatigue.value | 100 (fitness_fatigue.fatigue (today)) | yes |
| Strava imperial | State · LOAD ⓘ | "Today: F − A = form" — A | 117 | fitness_fatigue.key_line.fatigue (entering today) | 100 (fitness_fatigue.fatigue (today)) | **no** |
| | **load · form today** | | | | | |
| Strava imperial | State · LOAD | form | −52 | fitness_fatigue.display.form.value | −52 (fitness_fatigue.form) | yes |
| Strava imperial | State · LOAD ⓘ | form | −53 | fitness_fatigue.key_line.form | −52 (fitness_fatigue.form) | **no** |
| Strava imperial | State header | form headline | −52 | weekly_state_v1.load.form_headline | −52 (fitness_fatigue.form) | yes |
| Strava imperial | Today header | "form −N" | −52 | fitness_fatigue.form (phone Math.round) | −52 (fitness_fatigue.form) | yes |
| | **week · run distance** | | | | | |
| Strava imperial | Today header | "run N mi" | (none) | get-week weekly_stats.distances.run_meters (phone ÷1609.34) | (none) (Σ workouts.distance, runs this week) | yes |
| | **week · ride distance** | | | | | |
| Strava imperial | Today header | "ride N mi" | 26.9 mi | get-week weekly_stats.distances.cycling_meters (phone ÷1609.34) | 27.0 mi (Σ workouts.distance, rides this week) | **no** |
| | **week · done distance** | | | | | |
| Strava imperial | Week bar | "Done … · N mi" | 27 mi | get-week weekly_stats.done_distance_display | 27 mi (Σ workouts.distance, run + ride + swim this week) | yes |
| | **week · weight moved** | | | | | |
| Strava imperial | Today header | "N lb" (orange dot) | 21,905 lb | get-week weekly_stats.strength_volume_lb (phone ×0.453592) | 21,905 lb (Σ items[].strength_volume_lb, this week's lifts (the Week rows)) | yes |
| | **typed lift (2026-09-14) · Bench Press set 5 weight** | | | | | |
| Strava imperial | Logger (box, as typed) | weight box | 180 lb | the athlete's typed number (saved as pounds) | 180 lb (workouts.strength_exercises[].sets[].weight → liftInAthletesUnit) | yes |
| Strava imperial | Performance · compare table | completed set | 180 lb | session_detail_v1.strength_slots[].completed_sets[].weight_display | 180 lb (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| Strava imperial | Export · sets.csv | Weight | 180 lb | export-data sets.csv Weight | 180 lb (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · Bench Press top set** | | | | | |
| Strava imperial | State · logged sets | set line | 180 lb × 5 | coach weekly_state_v1.strength_logged_sets | 180 lb × 5 (workouts.strength_exercises → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · weight moved** | | | | | |
| Strava imperial | Performance | "Volume (lbs)" tile | 10,875 lb | session_detail_v1.strength_totals.volume_lb (label "lbs" hard-coded) | 10,875 lb (strength_totals.volume_lb (pounds) in the athlete unit) | yes |
| Strava imperial | Week · day row | volume | 10,875 lb | get-week items[].done_volume | 10,875 lb (strength_totals.volume_lb (pounds) in the athlete unit) | yes |
| | **typed lift (2026-09-14) · Band Pull Apart band** | | | | | |
| Strava imperial | Logger (Band box) | band box | 35 lb | sets[].resistance_level (box titled "Band (lb)" on every account) | 35 lb (the band's 35 lb in the athlete unit (Performance prints it so)) | yes |
| | **typed lift (2026-09-14) · Band Pull Apart set 1** | | | | | |
| Strava imperial | Performance · compare table | completed set | 15 reps · 35 lb | strength_slots[].completed_sets[0] | 15 reps · 35 lb (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **typed lift (2026-09-14) · Pull Up set 1** | | | | | |
| Strava imperial | Performance · compare table | completed set | 8 reps | strength_slots[].completed_sets[0] | 8 reps (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **next Back Squat (2026-09-18) · top set weight** | | | | | |
| Strava imperial | Logger (box, prescribed) | weight box | 245 | planned step set_plan[last].weight_in_unit | 245 (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **next Back Squat (2026-09-18) · weight** | | | | | |
| Strava imperial | Planned tab / Today card | weight text | 245 lb | planned strength_exercises[].weight_display | 245 lb (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **lift on file · squat** | | | | | |
| Strava imperial | Adjust / Baselines | lift row | 290 lb | save-baselines readout.strength.lifts[].row.value | 290 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | My Record | lift + "lbs" | 290 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 290 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Plan builder · Know your numbers | lift (no unit printed) | 290 | get-arc-context arc.builder.lifts[].value | 290 (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Export · profile.json | numbers.squat | 290 | export-data profile.json numbers | 290 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · deadlift** | | | | | |
| Strava imperial | Adjust / Baselines | lift row | 340 lb | save-baselines readout.strength.lifts[].row.value | 340 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | My Record | lift + "lbs" | 340 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 340 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Plan builder · Know your numbers | lift (no unit printed) | 340 | get-arc-context arc.builder.lifts[].value | 340 (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Export · profile.json | numbers.deadlift | 340 | export-data profile.json numbers | 340 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · bench** | | | | | |
| Strava imperial | Adjust / Baselines | lift row | 205 lb | save-baselines readout.strength.lifts[].row.value | 205 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | My Record | lift + "lbs" | 205 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 205 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Plan builder · Know your numbers | lift (no unit printed) | 205 | get-arc-context arc.builder.lifts[].value | 205 (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Export · profile.json | numbers.bench | 205 | export-data profile.json numbers | 205 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **lift on file · overheadPress** | | | | | |
| Strava imperial | Adjust / Baselines | lift row | 135 lb | save-baselines readout.strength.lifts[].row.value | 135 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | My Record | lift + "lbs" | 135 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 135 lb (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Plan builder · Know your numbers | lift (no unit printed) | 135 | get-arc-context arc.builder.lifts[].value | 135 (the lift resolver (readout raw, athlete unit)) | yes |
| Strava imperial | Export · profile.json | numbers.overhead_press | 135 | export-data profile.json numbers | 135 (the lift resolver (readout raw, athlete unit)) | yes — profile.json weight_unit = lb |
| | **tested max · squat** | | | | | |
| Strava imperial | Logger · test result card | "Saved: N" | 290 lb | save-baseline-test computed[].estimated1RM_in_unit | 290 lb (performance_numbers.squat after the test (pounds) → athlete unit) | yes |
| Strava imperial | Performance · test result | "→ e1RM N lb" | 290 lb | session_detail_v1.test_result.lifts[].e1rm (StrengthTestResult.tsx:30 prints "lb") | 290 lb (performance_numbers.squat after the test (pounds) → athlete unit) | yes |
| Strava imperial | Logger · test sheet | notes "on file: N" | 290 lb | strength-test-session exercises[].notes | 290 lb (performance_numbers.squat (pounds) → athlete unit) | yes |
| | **run threshold pace** | | | | | |
| Strava imperial | Adjust / Baselines | Threshold pace | 7:02/mi | save-baselines readout.run.threshold.value | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes |
| Strava imperial | Plan builder · Know your numbers | run threshold | 7:02/mi | get-arc-context arc.builder.run_threshold_display | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes |
| Strava imperial | Export · profile.json | numbers.threshold_pace_min_per_mi | (absent) | export-data profile.json (reads performance_numbers) | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | **no** |
| Strava imperial | Checkpoint sheet (when due) | threshold "on plan" | 7:02/mi | planned_workouts.computed.anchors.threshold_sec_per_mi (phone "/mi") | 7:02/mi (learned_fitness.run_threshold_pace_accepted) | yes — the sheet is not due on these accounts (week 7); value read from the field it prints |
| | **easy pace range** | | | | | |
| Strava imperial | Adjust / Baselines | Easy pace | 8:01–9:04/mi | save-baselines readout.run.easy.value | 8:01–9:04/mi (accepted threshold × 1.14 – × 1.29) | yes |
| | **FTP in use** | | | | | |
| Strava imperial | Adjust / Baselines | FTP | 164 W | save-baselines readout.bike.ftp.value | 164 W (learned_fitness.ride_ftp_accepted) | yes |
| Strava imperial | State · bike row | FTP | 164 W | coach weekly_state_v1.trends.applied_ftp | 164 W (learned_fitness.ride_ftp_accepted) | yes |
| Strava imperial | Planned rides (priced from) | ftp anchor | 164 W | planned_workouts.computed.anchors.ftp_w (next ride) | 164 W (learned_fitness.ride_ftp_accepted) | yes — after the accept and the re-price |
| Strava imperial | Export · profile.json | numbers.ftp | 210 W | export-data profile.json (reads performance_numbers.ftp) | 164 W (learned_fitness.ride_ftp_accepted) | **no** |
| | **threshold heart rate (run)** | | | | | |
| Strava imperial | Adjust / Baselines | Threshold heart rate | 168 bpm | save-baselines readout.run.lthr.value | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | yes |
| Strava imperial | Export · profile.json | numbers.threshold_hr | (absent) | export-data profile.json (reads performance_numbers.threshold_heart_rate) | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | **no** |
| | **max heart rate (run)** | | | | | |
| Strava imperial | Adjust / Baselines | Max heart rate | 186 bpm | save-baselines readout.run.max_hr.value | 186 bpm (configured_hr_zones.manual_run_max_hr (typed)) | yes |
| | **resting heart rate** | | | | | |
| Strava imperial | Adjust / Baselines | Resting heart rate | 52 bpm | save-baselines readout.run.resting_hr.value | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | yes |
| Strava imperial | Export · profile.json | numbers.resting_hr | (absent) | export-data profile.json (reads performance_numbers.restingHeartRate) | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | **no** |
| | **State · squat e1RM** | | | | | |
| Strava imperial | State · strength tile | e1RM | 280 lb | strengthFitness.perLift[].readout.e1rm | 280 lb (perLift latest e1RM (pounds) → athlete unit) | yes |
| Strava imperial | State · strength row (collapsed) | value (no unit) | 280 | strengthFitness.perLift[].latestE1rm (phone Math.round) | 280 (perLift latest e1RM (pounds) → athlete unit) | yes |
| Strava imperial | State · strength chart | range label | 280–290 lb | perLift[].seriesFit.low/high + readout.unit | 280–290 lb (seriesFit (pounds) → athlete unit) | yes |
| | **swims in window** | | | | | |
| Strava imperial | State · swim row | "N swims" | 2 | strengthFitness… swimVolume.swims | 2 (workouts, type swim, last 8 weeks) | yes |
| | **long run (2026-09-12) · distance** | | | | | |
| Strava imperial | Export · workouts.csv | distance_mi | 10.09 | export-data workouts.csv | 10.09 (workouts.distance (the device total)) | yes |
| | **share to Strava** | | | | | |
| Strava imperial | Performance · "Share to Strava" | reply | 500 {"error":"user is not defined"} | share-strength-to-strava | a post, or a "not connected" answer (share-strength-to-strava/index.ts) | **no** |
| | **long run with a set (2026-09-12) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 16.2 km | get-week items[].done_headline | 16.2 km (workouts.distance (the device total)) | yes |
| Strava metric | Week · day row | distance | 16.2 km | get-week items[].done_distance | 16.2 km (workouts.distance (the device total)) | yes |
| Strava metric | Performance | Distance | 16.2 km | session_detail_v1.completed_totals.distance_display | 16.2 km (workouts.distance (the device total)) | yes |
| Strava metric | Details | Distance tile | 16.2 km | display_metrics.distance_km (phone formatDistance, ×0.621371) | 16.2 km (workouts.distance (the device total)) | yes |
| Strava metric | Details · map | "(total)" distance | 16.17 km | display_metrics.series_display.distance[last] | 16.24 km (workouts.distance (the device total)) | **no** |
| | **long run with a set (2026-09-12) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 1:29:40 | get-week items[].done_headline | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 1h 30m | get-week items[].moving_seconds (phone fmtDur) | 1h 30m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 1:29:40 | completed_totals.duration_display | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 90 | completed_totals.duration_minutes | 90 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 1:29:40 | display_metrics.duration_s (phone formatDuration) | 1:29:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **long run with a set (2026-09-12) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 1:30:00 | display_metrics.elapsed_s (phone formatDuration) | 1:30:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **long run with a set (2026-09-12) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 145 | completed_totals.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 145 | display_metrics.avg_hr | 145 (workouts.avg_heart_rate (device)) | yes |
| | **long run with a set (2026-09-12) · avg pace** | | | | | |
| Strava metric | Performance | Pace (overall row, map pill) | 5:33/km | completed_totals.avg_pace_display | 5:31/km (moving seconds ÷ device distance) | **no** |
| Strava metric | Details | Avg Pace tile | 5:33/km | display_metrics.avg_pace_s_per_km (phone formatPace) | 5:31/km (moving seconds ÷ device distance) | **no** |
| | **long run with a set (2026-09-12) · grade-adjusted pace** | | | | | |
| Strava metric | Details | Grade-Adj Pace tile | 5:29/km | display_metrics.gap_pace_s_per_km (phone formatPace) | 5:29/km (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava metric | Performance | Grade-adjusted pace row | 8:50/mi | analysis_details.rows[Grade-adjusted pace] | 5:29/km (display_metrics.gap_pace_display) | **no** |
| | **long run with a set (2026-09-12) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | 120 m | display_metrics.elevation_display | 120 m (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 120 m | display_metrics.series_display.gain[last] | 120 m (workouts.elevation_gain (device)) | yes |
| | **long run with a set (2026-09-12) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 105 | items[].workout_analysis.session_detail_v1.load.workload | 105 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 105 | session_detail_v1.load.workload | 105 (workouts.workload_actual) | yes |
| | **long run with a set (2026-09-12) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 1:29:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:30:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **run with strides (2026-09-11) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 7.7 km | get-week items[].done_headline | 7.7 km (workouts.distance (the device total)) | yes |
| Strava metric | Week · day row | distance | 7.7 km | get-week items[].done_distance | 7.7 km (workouts.distance (the device total)) | yes |
| Strava metric | Performance | Distance | 7.7 km | session_detail_v1.completed_totals.distance_display | 7.7 km (workouts.distance (the device total)) | yes |
| Strava metric | Details | Distance tile | 7.7 km | display_metrics.distance_km (phone formatDistance, ×0.621371) | 7.7 km (workouts.distance (the device total)) | yes |
| Strava metric | Details · map | "(total)" distance | 7.71 km | display_metrics.series_display.distance[last] | 7.74 km (workouts.distance (the device total)) | **no** |
| | **run with strides (2026-09-11) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 43:40 | get-week items[].done_headline | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 44m | get-week items[].moving_seconds (phone fmtDur) | 44m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 43:40 | completed_totals.duration_display | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 44 | completed_totals.duration_minutes | 44 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 43:40 | display_metrics.duration_s (phone formatDuration) | 43:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **run with strides (2026-09-11) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 44:00 | display_metrics.elapsed_s (phone formatDuration) | 44:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **run with strides (2026-09-11) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 141 | completed_totals.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 141 | display_metrics.avg_hr | 141 (workouts.avg_heart_rate (device)) | yes |
| | **run with strides (2026-09-11) · avg pace** | | | | | |
| Strava metric | Performance | Pace (overall row, map pill) | 5:40/km | completed_totals.avg_pace_display | 5:38/km (moving seconds ÷ device distance) | **no** |
| Strava metric | Details | Avg Pace tile | 5:40/km | display_metrics.avg_pace_s_per_km (phone formatPace) | 5:38/km (moving seconds ÷ device distance) | **no** |
| | **run with strides (2026-09-11) · grade-adjusted pace** | | | | | |
| Strava metric | Details | Grade-Adj Pace tile | 5:37/km | display_metrics.gap_pace_s_per_km (phone formatPace) | 5:37/km (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava metric | Performance | Grade-adjusted pace row | 9:02/mi | analysis_details.rows[Grade-adjusted pace] | 5:37/km (display_metrics.gap_pace_display) | **no** |
| | **run with strides (2026-09-11) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | 58 m | display_metrics.elevation_display | 58 m (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 58 m | display_metrics.series_display.gain[last] | 58 m (workouts.elevation_gain (device)) | yes |
| | **run with strides (2026-09-11) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 51 | items[].workout_analysis.session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 51 | session_detail_v1.load.workload | 51 (workouts.workload_actual) | yes |
| | **run with strides (2026-09-11) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 43:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 44:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **interval run (2026-09-08) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 10.4 km | get-week items[].done_headline | 10.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Week · day row | distance | 10.4 km | get-week items[].done_distance | 10.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Performance | Distance | 10.4 km | session_detail_v1.completed_totals.distance_display | 10.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details | Distance tile | 10.4 km | display_metrics.distance_km (phone formatDistance, ×0.621371) | 10.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details · map | "(total)" distance | 10.44 km | display_metrics.series_display.distance[last] | 10.49 km (workouts.distance (the device total)) | **no** |
| | **interval run (2026-09-08) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 51:40 | get-week items[].done_headline | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 52m | get-week items[].moving_seconds (phone fmtDur) | 52m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 51:40 | completed_totals.duration_display | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 52 | completed_totals.duration_minutes | 52 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 51:40 | display_metrics.duration_s (phone formatDuration) | 51:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **interval run (2026-09-08) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 52:00 | display_metrics.elapsed_s (phone formatDuration) | 52:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **interval run (2026-09-08) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 152 | completed_totals.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 152 | display_metrics.avg_hr | 152 (workouts.avg_heart_rate (device)) | yes |
| | **interval run (2026-09-08) · avg pace** | | | | | |
| Strava metric | Performance | Pace (overall row, map pill) | 4:57/km | completed_totals.avg_pace_display | 4:56/km (moving seconds ÷ device distance) | **no** |
| Strava metric | Details | Avg Pace tile | 4:57/km | display_metrics.avg_pace_s_per_km (phone formatPace) | 4:56/km (moving seconds ÷ device distance) | **no** |
| | **interval run (2026-09-08) · grade-adjusted pace** | | | | | |
| Strava metric | Details | Grade-Adj Pace tile | 4:53/km | display_metrics.gap_pace_s_per_km (phone formatPace) | 4:53/km (display_metrics.gap_pace_display (server string, unread)) | yes |
| Strava metric | Performance | Grade-adjusted pace row | 7:51/mi | analysis_details.rows[Grade-adjusted pace] | 4:53/km (display_metrics.gap_pace_display) | **no** |
| | **interval run (2026-09-08) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | 75 m | display_metrics.elevation_display | 75 m (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 75 m | display_metrics.series_display.gain[last] | 75 m (workouts.elevation_gain (device)) | yes |
| | **interval run (2026-09-08) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 52 | items[].workout_analysis.session_detail_v1.load.workload | 52 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 52 | session_detail_v1.load.workload | 52 (workouts.workload_actual) | yes |
| | **interval run (2026-09-08) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 51:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 52:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **steady ride (2026-09-10) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 36.0 km | get-week items[].done_headline | 36.1 km (workouts.distance (the device total)) | **no** |
| Strava metric | Week · day row | distance | 36.0 km | get-week items[].done_distance | 36.1 km (workouts.distance (the device total)) | **no** |
| Strava metric | Performance | Distance | 36.0 km | session_detail_v1.completed_totals.distance_display | 36.1 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details | Distance tile | 36.0 km | display_metrics.distance_tile_display | 36.1 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details · map | "(total)" distance | 35.99 km | display_metrics.series_display.distance[last] | 36.14 km (workouts.distance (the device total)) | **no** |
| | **steady ride (2026-09-10) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 1:14:40 | get-week items[].done_headline | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 1h 15m | get-week items[].moving_seconds (phone fmtDur) | 1h 15m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 1:14:40 | completed_totals.duration_display | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 75 | completed_totals.duration_minutes | 75 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 1:14:40 | display_metrics.duration_s (phone formatDuration) | 1:14:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **steady ride (2026-09-10) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 1:15:00 | display_metrics.elapsed_s (phone formatDuration) | 1:15:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **steady ride (2026-09-10) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 129 | completed_totals.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 129 | display_metrics.avg_hr | 129 (workouts.avg_heart_rate (device)) | yes |
| | **steady ride (2026-09-10) · avg speed** | | | | | |
| Strava metric | Details | Avg Speed tile | 29.0 km/h | display_metrics.avg_speed_display | 29.0 km/h (device distance ÷ moving seconds) | yes |
| Strava metric | Details · map | Speed pill (avg) | 29.0 km/h | display_metrics.avg_speed_mps (phone formatSpeed) | 29.0 km/h (device distance ÷ moving seconds) | yes |
| | **steady ride (2026-09-10) · avg power** | | | | | |
| Strava metric | Details | Avg Power tile | 139 W | display_metrics.avg_power | 139 W (workouts.avg_power (device)) | yes |
| | **steady ride (2026-09-10) · normalized power** | | | | | |
| Strava metric | Details | Norm Power tile | 139 W | display_metrics.normalized_power | 146 W (workouts.normalized_power (device)) | **no** |
| | **steady ride (2026-09-10) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | 76 m | display_metrics.elevation_display | 76 m (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 76 m | display_metrics.series_display.gain[last] | 76 m (workouts.elevation_gain (device)) | yes |
| | **steady ride (2026-09-10) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 99 | items[].workout_analysis.session_detail_v1.load.workload | 99 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 99 | session_detail_v1.load.workload | 99 (workouts.workload_actual) | yes |
| | **steady ride (2026-09-10) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 1:14:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:15:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **anaerobic ride (2026-09-15) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 21.6 km | get-week items[].done_headline | 21.7 km (workouts.distance (the device total)) | **no** |
| Strava metric | Week · day row | distance | 21.6 km | get-week items[].done_distance | 21.7 km (workouts.distance (the device total)) | **no** |
| Strava metric | Performance | Distance | 21.6 km | session_detail_v1.completed_totals.distance_display | 21.7 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details | Distance tile | 21.6 km | display_metrics.distance_tile_display | 21.7 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details · map | "(total)" distance | 21.65 km | display_metrics.series_display.distance[last] | 21.74 km (workouts.distance (the device total)) | **no** |
| | **anaerobic ride (2026-09-15) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 51:25 | get-week items[].done_headline | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 51m | get-week items[].moving_seconds (phone fmtDur) | 51m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 51:25 | completed_totals.duration_display | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 51 | completed_totals.duration_minutes | 51 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 51:25 | display_metrics.duration_s (phone formatDuration) | 51:25 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **anaerobic ride (2026-09-15) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 51:45 | display_metrics.elapsed_s (phone formatDuration) | 51:45 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **anaerobic ride (2026-09-15) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 130 | completed_totals.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 130 | display_metrics.avg_hr | 130 (workouts.avg_heart_rate (device)) | yes |
| | **anaerobic ride (2026-09-15) · avg speed** | | | | | |
| Strava metric | Details | Avg Speed tile | 25.4 km/h | display_metrics.avg_speed_display | 25.4 km/h (device distance ÷ moving seconds) | yes |
| Strava metric | Details · map | Speed pill (avg) | 25.4 km/h | display_metrics.avg_speed_mps (phone formatSpeed) | 25.4 km/h (device distance ÷ moving seconds) | yes |
| | **anaerobic ride (2026-09-15) · avg power** | | | | | |
| Strava metric | Details | Avg Power tile | 117 W | display_metrics.avg_power | 117 W (workouts.avg_power (device)) | yes |
| | **anaerobic ride (2026-09-15) · normalized power** | | | | | |
| Strava metric | Details | Norm Power tile | 146 W | display_metrics.normalized_power | 123 W (workouts.normalized_power (device)) | **no** |
| | **anaerobic ride (2026-09-15) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | 75 m | display_metrics.elevation_display | 75 m (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 75 m | display_metrics.series_display.gain[last] | 75 m (workouts.elevation_gain (device)) | yes |
| | **anaerobic ride (2026-09-15) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 48 | items[].workout_analysis.session_detail_v1.load.workload | 48 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 48 | session_detail_v1.load.workload | 48 (workouts.workload_actual) | yes |
| | **anaerobic ride (2026-09-15) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 51:44 | display_metrics.zones.hr.bins[].t_s summed on the phone | 51:45 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **pool swim (2026-09-09) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 1.8 km | get-week items[].done_headline | 1800 m (workouts.distance (the device total)) | **no** |
| Strava metric | Week · day row | distance | 1.8 km | get-week items[].done_distance | 1800 m (workouts.distance (the device total)) | **no** |
| Strava metric | Performance | Distance | 1800 m | session_detail_v1.completed_totals.distance_display | 1800 m (workouts.distance (the device total)) | yes |
| Strava metric | Details | Distance tile | 1.8 km | display_metrics.distance_display | 1800 m (workouts.distance (the device total)) | **no** |
| | **pool swim (2026-09-09) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 35:00 | get-week items[].done_headline | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 35m | get-week items[].moving_seconds (phone fmtDur) | 35m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 35:00 | display_metrics.duration_s (phone formatDuration) | 35:00 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **pool swim (2026-09-09) · elapsed time** | | | | | |
| Strava metric | Performance | Duration (swim card) | 39:00 | completed_totals.duration_s (phone fmtTimeLocal) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| Strava metric | Details | Duration tile | 39:00 | display_metrics.elapsed_s (phone formatDuration) | 39:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **pool swim (2026-09-09) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 131 | completed_totals.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 131 | display_metrics.avg_hr | 131 (workouts.avg_heart_rate (device)) | yes |
| | **pool swim (2026-09-09) · pace per 100** | | | | | |
| Strava metric | Performance | Pace | 1:57 /100m | completed_totals.swim_pace_display | 1:57 /100m (display_metrics.swim_pace_display (server)) | yes |
| Strava metric | Details | Avg Pace /100m | 1:57 /100m | display_metrics.avg_swim_pace_per_100m (phone formatSwimPace) | 1:57 /100m (display_metrics.swim_pace_display (server)) | yes |
| | **pool swim (2026-09-09) · lengths** | | | | | |
| Strava metric | Details | Lengths | (absent) | workout.number_of_active_lengths | (absent) (workouts.number_of_active_lengths) | yes |
| | **pool swim (2026-09-09) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | (absent) | items[].workout_analysis.session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | (absent) | session_detail_v1.load.workload | 0 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · distance** | | | | | |
| Strava metric | Today · done card | headline distance | 32.4 km | get-week items[].done_headline | 32.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Week · day row | distance | 32.4 km | get-week items[].done_distance | 32.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Performance | Distance | 32.4 km | session_detail_v1.completed_totals.distance_display | 32.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details | Distance tile | 32.4 km | display_metrics.distance_tile_display | 32.5 km (workouts.distance (the device total)) | **no** |
| Strava metric | Details · map | "(total)" distance | 32.39 km | display_metrics.series_display.distance[last] | 32.53 km (workouts.distance (the device total)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · moving time** | | | | | |
| Strava metric | Today · done card | headline time | 59:40 | get-week items[].done_headline | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Week · day row | time | 1h 00m | get-week items[].moving_seconds (phone fmtDur) | 1h 00m (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration | 59:40 | completed_totals.duration_display | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Performance | Duration chip minutes | 60 | completed_totals.duration_minutes | 60 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| Strava metric | Details | Moving Time tile | 59:40 | display_metrics.duration_s (phone formatDuration) | 59:40 (device moving seconds (Garmin summary / Strava moving_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · elapsed time** | | | | | |
| Strava metric | Details | Duration tile | 1:00:00 | display_metrics.elapsed_s (phone formatDuration) | 1:00:00 (device elapsed seconds (Garmin summary / Strava elapsed_time)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg heart rate** | | | | | |
| Strava metric | Performance | BPM (overall row) | 139 | completed_totals.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| Strava metric | Details | Avg HR tile | 139 | display_metrics.avg_hr | 139 (workouts.avg_heart_rate (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg speed** | | | | | |
| Strava metric | Details | Avg Speed tile | 32.7 km/h | display_metrics.avg_speed_display | 32.7 km/h (device distance ÷ moving seconds) | yes |
| Strava metric | Details · map | Speed pill (avg) | 32.7 km/h | display_metrics.avg_speed_mps (phone formatSpeed) | 32.7 km/h (device distance ÷ moving seconds) | yes |
| | **Zwift ride (unattached) (2026-09-13) · avg power** | | | | | |
| Strava metric | Details | Avg Power tile | 165 W | display_metrics.avg_power | 165 W (workouts.avg_power (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · normalized power** | | | | | |
| Strava metric | Details | Norm Power tile | 165 W | display_metrics.normalized_power | 173 W (workouts.normalized_power (device)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · elevation gain** | | | | | |
| Strava metric | Details | Elevation tile | N/A | display_metrics.elevation_display | N/A (workouts.elevation_gain (device)) | yes |
| Strava metric | Details · map | "+gain (total)" | 0 m | display_metrics.series_display.gain[last] | 0 m (workouts.elevation_gain (device)) | yes |
| | **Zwift ride (unattached) (2026-09-13) · workload** | | | | | |
| Strava metric | Today · done card | Workload chip | 111 | items[].workout_analysis.session_detail_v1.load.workload | 111 (workouts.workload_actual) | yes |
| Strava metric | Details | Workload tile | 111 | session_detail_v1.load.workload | 111 (workouts.workload_actual) | yes |
| | **Zwift ride (unattached) (2026-09-13) · time in zones** | | | | | |
| Strava metric | Details | HR zones "Duration" | 59:59 | display_metrics.zones.hr.bins[].t_s summed on the phone | 1:00:00 (device elapsed seconds (the Duration tile's fact)) | **no** |
| | **Zwift ride (unattached) (2026-09-13) · plan link** | | | | | |
| Strava metric | Week · day row | attached to a planned session | none | get-week items[].planned_id | none (workouts.planned_id) | yes |
| | **popup (Anaerobic Ride 2026-09-15) · distance** | | | | | |
| Strava metric | Post-workout popup | distance under the title | 21.7 km | check-feedback-needed workout.distance_display | 21.7 km (workouts.distance (the device total)) | yes |
| Strava metric | Today · done card | headline distance | 21.6 km | get-week items[].done_headline | 21.7 km (the popup, same session) | **no** |
| | **planned long run · length** | | | | | |
| Strava metric | Today · planned card / Planned tab header | length | 110:00 | get-week planned_workout.planned_duration_label | 1:50:15 (planned_workouts.total_duration_seconds) | **no** |
| Strava metric | Week · day row (planned) | length | 1h 50m | planned_duration_seconds (phone fmtDur) | 1h 50m (planned_workouts.total_duration_seconds) | yes |
| Strava metric | Performance | planned duration (Duration chip "of M min") | 110 | session_detail_v1.planned_totals.duration_s (phone ÷60) | 110 (planned_workouts.total_duration_seconds) | yes |
| | **plan · current week** | | | | | |
| Strava metric | Today header | "week N of M" | week 6 of 12 | get-week training_plan_context.weekPosition | week 6 of 12 (plan start date → today) | yes |
| Strava metric | State header | "WK n" | week 6 of 12 | coach weekly_state_v1.week.index | week 6 of 12 (plan start date → today) | yes |
| Strava metric | State · strength row | block line | Run + Ride + Strength · week 6 of 12 | coach plan.block.line | Run + Ride + Strength · week 6 of 12 (plan start date → today) | yes |
| Strava metric | Plans list / Goals | "Wk N" | week 6 | plan-overview plans[].current_week_index | week 6 (plan start date → today) | yes |
| Strava metric | Plan detail | "Week N of M" | week 6 of 12 | plan-overview {plan_id} overview.current_week_index / total_weeks | week 6 of 12 (plan start date → today) | yes |
| Strava metric | Adjust · deload | "Make week N a deload week" | week 7 | rematerialize-standing-block next_week | week 7 (next week = current week + 1) | yes |
| Strava metric | Checkpoint (State) | current week | week 6 | endurance-checkpoint current_week | week 6 (plan start date → today) | yes |
| | **plan · sessions** | | | | | |
| Strava metric | Plan detail header | "N workouts" | 120 | plan-overview overview.totals.sessions | 120 (planned_workouts rows in the plan) | yes |
| | **plan · total minutes** | | | | | |
| Strava metric | Plan detail header | "Xh Y total" | 7229 | plan-overview overview.totals.minutes | 7229 (Σ each planned row's whole minutes (the rows' own rounding)) | yes |
| | **week · planned minutes** | | | | | |
| Strava metric | Week bar | "Planned Xh YYm" | 6h 06m | get-week weekly_stats.planned_minutes (phone fmtDur) | 6h 06m (Σ this week's planned endurance rows, each rounded to minutes (lifts count as sessions)) | yes |
| | **load · fitness today** | | | | | |
| Strava metric | State · LOAD / Today header | fitness | 63 | fitness_fatigue.display.fitness.value | 63 (fitness_fatigue.fitness (today)) | yes |
| Strava metric | State · LOAD ⓘ | "Today: F − A = form" — F | 64 | fitness_fatigue.key_line.fitness (entering today) | 63 (fitness_fatigue.fitness (today)) | **no** |
| | **load · fatigue today** | | | | | |
| Strava metric | State · LOAD | fatigue | 100 | fitness_fatigue.display.fatigue.value | 100 (fitness_fatigue.fatigue (today)) | yes |
| Strava metric | State · LOAD ⓘ | "Today: F − A = form" — A | 117 | fitness_fatigue.key_line.fatigue (entering today) | 100 (fitness_fatigue.fatigue (today)) | **no** |
| | **load · form today** | | | | | |
| Strava metric | State · LOAD | form | −52 | fitness_fatigue.display.form.value | −52 (fitness_fatigue.form) | yes |
| Strava metric | State · LOAD ⓘ | form | −53 | fitness_fatigue.key_line.form | −52 (fitness_fatigue.form) | **no** |
| Strava metric | State header | form headline | −52 | weekly_state_v1.load.form_headline | −52 (fitness_fatigue.form) | yes |
| Strava metric | Today header | "form −N" | −52 | fitness_fatigue.form (phone Math.round) | −52 (fitness_fatigue.form) | yes |
| | **week · run distance** | | | | | |
| Strava metric | Today header | "run N mi" | (none) | get-week weekly_stats.distances.run_meters (phone ÷1609.34) | (none) (Σ workouts.distance, runs this week) | yes |
| | **week · ride distance** | | | | | |
| Strava metric | Today header | "ride N mi" | 43.3 km | get-week weekly_stats.distances.cycling_meters (phone ÷1609.34) | 43.5 km (Σ workouts.distance, rides this week) | **no** |
| | **week · done distance** | | | | | |
| Strava metric | Week bar | "Done … · N mi" | 43 km | get-week weekly_stats.done_distance_display | 43 km (Σ workouts.distance, run + ride + swim this week) | yes |
| | **week · weight moved** | | | | | |
| Strava metric | Today header | "N lb" (orange dot) | 13,132 kg | get-week weekly_stats.strength_volume_lb (phone ×0.453592) | 13,132 kg (Σ items[].strength_volume_lb, this week's lifts (the Week rows)) | yes |
| | **typed lift (2026-09-14) · Bench Press set 5 weight** | | | | | |
| Strava metric | Logger (box, as typed) | weight box | 82.5 kg | the athlete's typed number (saved as pounds) | 82.5 kg (workouts.strength_exercises[].sets[].weight → liftInAthletesUnit) | yes |
| Strava metric | Performance · compare table | completed set | 82.5 kg | session_detail_v1.strength_slots[].completed_sets[].weight_display | 82.5 kg (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| Strava metric | Export · sets.csv | Weight | 82.5 kg | export-data sets.csv Weight | 82.5 kg (workouts.strength_exercises (pounds) → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · Bench Press top set** | | | | | |
| Strava metric | State · logged sets | set line | 82.5 kg × 5 | coach weekly_state_v1.strength_logged_sets | 82.5 kg × 5 (workouts.strength_exercises → liftInAthletesUnit) | yes |
| | **typed lift (2026-09-14) · weight moved** | | | | | |
| Strava metric | Performance | "Volume (lbs)" tile | 14,075 lb | session_detail_v1.strength_totals.volume_lb (label "lbs" hard-coded) | 6,384 kg (strength_totals.volume_lb (pounds) in the athlete unit) | **no** |
| Strava metric | Week · day row | volume | 6,384 kg | get-week items[].done_volume | 6,384 kg (strength_totals.volume_lb (pounds) in the athlete unit) | yes |
| | **typed lift (2026-09-14) · Band Pull Apart band** | | | | | |
| Strava metric | Logger (Band box) | band box | 35 lb | sets[].resistance_level (box titled "Band (lb)" on every account) | 16 kg (the band's 35 lb in the athlete unit (Performance prints it so)) | **no** |
| | **typed lift (2026-09-14) · Band Pull Apart set 1** | | | | | |
| Strava metric | Performance · compare table | completed set | 15 reps · 16 kg | strength_slots[].completed_sets[0] | 15 reps · 16 kg (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **typed lift (2026-09-14) · Pull Up set 1** | | | | | |
| Strava metric | Performance · compare table | completed set | 8 reps | strength_slots[].completed_sets[0] | 8 reps (workouts.strength_exercises (band 35 lb, bodyweight)) | yes |
| | **next Back Squat (2026-09-18) · top set weight** | | | | | |
| Strava metric | Logger (box, prescribed) | weight box | 111.25 | planned step set_plan[last].weight_in_unit | 111.25 (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **next Back Squat (2026-09-18) · weight** | | | | | |
| Strava metric | Planned tab / Today card | weight text | 111.25 kg | planned strength_exercises[].weight_display | 111.25 kg (planned_workouts.strength_exercises weight (pounds) → liftInAthletesUnit) | yes |
| | **lift on file · squat** | | | | | |
| Strava metric | Adjust / Baselines | lift row | 132 kg | save-baselines readout.strength.lifts[].row.value | 132 kg (the lift resolver (readout raw, athlete unit)) | yes |
| Strava metric | My Record | lift + "lbs" | 290 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 132 kg (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Plan builder · Know your numbers | lift (no unit printed) | 290 | get-arc-context arc.builder.lifts[].value | 132 (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Export · profile.json | numbers.squat | 290 | export-data profile.json numbers | 132 (the lift resolver (readout raw, athlete unit)) | **no** — profile.json weight_unit = kg |
| | **lift on file · deadlift** | | | | | |
| Strava metric | Adjust / Baselines | lift row | 154 kg | save-baselines readout.strength.lifts[].row.value | 154 kg (the lift resolver (readout raw, athlete unit)) | yes |
| Strava metric | My Record | lift + "lbs" | 340 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 154 kg (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Plan builder · Know your numbers | lift (no unit printed) | 340 | get-arc-context arc.builder.lifts[].value | 154 (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Export · profile.json | numbers.deadlift | 340 | export-data profile.json numbers | 154 (the lift resolver (readout raw, athlete unit)) | **no** — profile.json weight_unit = kg |
| | **lift on file · bench** | | | | | |
| Strava metric | Adjust / Baselines | lift row | 95 kg | save-baselines readout.strength.lifts[].row.value | 95 kg (the lift resolver (readout raw, athlete unit)) | yes |
| Strava metric | My Record | lift + "lbs" | 210 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 95 kg (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Plan builder · Know your numbers | lift (no unit printed) | 210 | get-arc-context arc.builder.lifts[].value | 95 (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Export · profile.json | numbers.bench | 205 | export-data profile.json numbers | 95 (the lift resolver (readout raw, athlete unit)) | **no** — profile.json weight_unit = kg |
| | **lift on file · overheadPress** | | | | | |
| Strava metric | Adjust / Baselines | lift row | 61 kg | save-baselines readout.strength.lifts[].row.value | 61 kg (the lift resolver (readout raw, athlete unit)) | yes |
| Strava metric | My Record | lift + "lbs" | 135 lbs | athletic-record record.lifts[].value (label "lbs" hard-coded) | 61 kg (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Plan builder · Know your numbers | lift (no unit printed) | 135 | get-arc-context arc.builder.lifts[].value | 61 (the lift resolver (readout raw, athlete unit)) | **no** |
| Strava metric | Export · profile.json | numbers.overhead_press | 135 | export-data profile.json numbers | 61 (the lift resolver (readout raw, athlete unit)) | **no** — profile.json weight_unit = kg |
| | **tested max · squat** | | | | | |
| Strava metric | Logger · test result card | "Saved: N" | 132 kg | save-baseline-test computed[].estimated1RM_in_unit | 132 kg (performance_numbers.squat after the test (pounds) → athlete unit) | yes |
| Strava metric | Performance · test result | "→ e1RM N lb" | 290 lb | session_detail_v1.test_result.lifts[].e1rm (StrengthTestResult.tsx:30 prints "lb") | 132 kg (performance_numbers.squat after the test (pounds) → athlete unit) | **no** |
| Strava metric | Logger · test sheet | notes "on file: N" | 132 kg | strength-test-session exercises[].notes | 132 kg (performance_numbers.squat (pounds) → athlete unit) | yes |
| | **run threshold pace** | | | | | |
| Strava metric | Adjust / Baselines | Threshold pace | 4:22/km | save-baselines readout.run.threshold.value | 4:22/km (learned_fitness.run_threshold_pace_accepted) | yes |
| Strava metric | Plan builder · Know your numbers | run threshold | 4:22/km | get-arc-context arc.builder.run_threshold_display | 4:22/km (learned_fitness.run_threshold_pace_accepted) | yes |
| Strava metric | Export · profile.json | numbers.threshold_pace_min_per_mi | (absent) | export-data profile.json (reads performance_numbers) | 4:22/km (learned_fitness.run_threshold_pace_accepted) | **no** |
| Strava metric | Checkpoint sheet (when due) | threshold "on plan" | 7:02/mi | planned_workouts.computed.anchors.threshold_sec_per_mi (phone "/mi") | 4:22/km (learned_fitness.run_threshold_pace_accepted) | **no** — the sheet is not due on these accounts (week 7); value read from the field it prints |
| | **easy pace range** | | | | | |
| Strava metric | Adjust / Baselines | Easy pace | 4:59–5:38/km | save-baselines readout.run.easy.value | 4:59–5:38/km (accepted threshold × 1.14 – × 1.29) | yes |
| | **FTP in use** | | | | | |
| Strava metric | Adjust / Baselines | FTP | 164 W | save-baselines readout.bike.ftp.value | 164 W (learned_fitness.ride_ftp_accepted) | yes |
| Strava metric | State · bike row | FTP | 164 W | coach weekly_state_v1.trends.applied_ftp | 164 W (learned_fitness.ride_ftp_accepted) | yes |
| Strava metric | Planned rides (priced from) | ftp anchor | 164 W | planned_workouts.computed.anchors.ftp_w (next ride) | 164 W (learned_fitness.ride_ftp_accepted) | yes — after the accept and the re-price |
| Strava metric | Export · profile.json | numbers.ftp | 210 W | export-data profile.json (reads performance_numbers.ftp) | 164 W (learned_fitness.ride_ftp_accepted) | **no** |
| | **threshold heart rate (run)** | | | | | |
| Strava metric | Adjust / Baselines | Threshold heart rate | 168 bpm | save-baselines readout.run.lthr.value | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | yes |
| Strava metric | Export · profile.json | numbers.threshold_hr | (absent) | export-data profile.json (reads performance_numbers.threshold_heart_rate) | 168 bpm (configured_hr_zones.manual_run_lthr (typed)) | **no** |
| | **max heart rate (run)** | | | | | |
| Strava metric | Adjust / Baselines | Max heart rate | 186 bpm | save-baselines readout.run.max_hr.value | 186 bpm (configured_hr_zones.manual_run_max_hr (typed)) | yes |
| | **resting heart rate** | | | | | |
| Strava metric | Adjust / Baselines | Resting heart rate | 52 bpm | save-baselines readout.run.resting_hr.value | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | yes |
| Strava metric | Export · profile.json | numbers.resting_hr | (absent) | export-data profile.json (reads performance_numbers.restingHeartRate) | 52 bpm (configured_hr_zones.resting_heart_rate (typed)) | **no** |
| | **State · squat e1RM** | | | | | |
| Strava metric | State · strength tile | e1RM | 127 kg | strengthFitness.perLift[].readout.e1rm | 127 kg (perLift latest e1RM (pounds) → athlete unit) | yes |
| Strava metric | State · strength row (collapsed) | value (no unit) | 280 | strengthFitness.perLift[].latestE1rm (phone Math.round) | 127 (perLift latest e1RM (pounds) → athlete unit) | **no** |
| Strava metric | State · strength chart | range label | 280–290 kg | perLift[].seriesFit.low/high + readout.unit | 127–132 kg (seriesFit (pounds) → athlete unit) | **no** |
| | **swims in window** | | | | | |
| Strava metric | State · swim row | "N swims" | 2 | strengthFitness… swimVolume.swims | 2 (workouts, type swim, last 8 weeks) | yes |
| | **long run (2026-09-12) · distance** | | | | | |
| Strava metric | Export · workouts.csv | distance_km | 16.24 | export-data workouts.csv | 16.24 (workouts.distance (the device total)) | yes |
| | **share to Strava** | | | | | |
| Strava metric | Performance · "Share to Strava" | reply | 500 {"error":"user is not defined"} | share-strength-to-strava | a post, or a "not connected" answer (share-strength-to-strava/index.ts) | **no** |
