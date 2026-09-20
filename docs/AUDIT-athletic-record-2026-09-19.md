# Athletic Record — audit and proposal (2026-09-19)

Read-only audit. Nothing built. Code as of `84f05533e`. Answers the QUEUED 2026-09-18 item on
`POLISH-PUNCH-LIST.md`. Field facts are from official Strava and Garmin help pages (URLs in §4);
anything those pages do not state is marked **unverified**.

## 1. What the screen shows today, and where each number comes from

| Row on screen | Where it comes from | Server or phone | Problem |
|---|---|---|---|
| Race results list | `goals` table, completed events | **phone** reads the table (`AthleticRecordPage.tsx:125-135`) | not server-sent |
| "Add race" with no plan | typed by the athlete | **phone** writes the goal row itself, sport always "run" (`:195-213`) | bypasses `complete-race` |
| 5K | the typed 5K **pace** string (`record.ts:109`) | server | a pace under a column of finish times; a saved 5K race never shows (`record.ts:79` keeps 10K/half/marathon only) |
| 10K / Half / Marathon | fastest saved race finish per distance (`record.ts:72-86`) | server | races only; a fast 10K inside a training run never counts |
| FTP (best) | highest FTP on the dated FTP history (`record.ts:88-96`) | server | fine |
| Longest ride (elapsed) | longest ride by **time** (`record.ts:98-104`) | server | Strava and Garmin measure longest ride by **distance** |
| Swim 100yd pace | the typed swim pace | server | no swim records at all |
| Deadlift / Squat / Bench / OHP | the current working 1RM (locked → learned → typed) | server | this is the plan's number, not the heaviest thing lifted |
| "Logged suggests … Update" | learned number vs typed | server | fine |
| Milestones | placeholder sentence | — | shows nothing |
| Totals (this year, all time) | — | — | **not on the screen** |

## 2. What the synced data already holds (per workout, on the server)

- **Rides:** best power for 12 durations, 5 s to 60 min, with heart rate during each window, on every ride with a
  power meter (`compute-workout-analysis/index.ts:116`, list `src/lib/bike-ftp-estimator.ts:52`). Distance and
  elevation gain on every ride. A history backfill already exists (`backfill-power-curves`).
- **Runs, as run:** fastest 1 mile, 5K and 10K per run, elapsed time, not grade-adjusted
  (`compute-workout-analysis/index.ts:160`). ⚠️ The saved **time** is for a stretch anywhere between 98% and 102% of the
  distance, not exactly the distance; the saved pace is exact. A record screen would need time = pace × distance.
- **Runs, grade-adjusted:** fastest 400 m to 5 km on moving time, grade-adjusted (`src/lib/run-critical-speed.ts:208`).
  Built for the threshold suggestion. **Not usable for records** — Strava and Garmin use elapsed time on the ground as run.
- **Strava's own numbers:** every Strava-synced run carries Strava's best efforts with elapsed time, moving time and
  Strava's rank (`ingest-activity/index.ts:428-485`, `workouts.achievements`). Garmin sends no equivalent, so this
  cannot be the one source for everyone. It is useful as a test check.
- **Swims:** pool length (metres) and, from Garmin, each length (`ingest-activity:1021-1052`). A 25-yard pool is
  recognised by its 22.86 m length. Whether Strava pool swims arrive with lengths: **unverified**.
- **Lifts:** best trusted estimated 1RM per lift, all time, already computed (`_shared/state-trend/assemble.ts:425`).
  Heaviest weight per lift (Garmin's rule): not grepped for as a stored value; likely derivable from `exercise_log` (inferring).
- **Totals:** distance (km), moving and elapsed time, elevation gain (m) and type on every workout. Enough for
  counts and totals by any period. No totals are computed anywhere today (grepped `ytd|year to date|all.time|lifetime`
  over the athletic-record code; none).

### History depth — this limits every "all time" number

- Strava connect imports the last **90 days** (`StravaCallback.tsx:55-86`); Connections offers 7/30/60 days or a custom range.
- Garmin asks for **90 days**, capped at **180** (`import-garmin-history/index.ts:107,138`).
- So "all time" today means "since the import". A full-history Strava import is possible (custom range) but costs two
  Strava requests per activity (detail + streams, `import-strava-history:301,326`). Garmin cannot go past 180 days here.

### Double counting

Runs and rides that arrive from both Garmin and Strava are dropped on the Strava side when Garmin is the preferred source
(`strava-webhook/index.ts:195-220`); swims are merged (`ingest-activity:1362`). Totals would inherit that rule.

## 3. Proposed screen

Same three units rule as the rest of the app: miles and feet for imperial, km and metres for metric. Swims in the
pool's own unit.

**A. Totals** — a Run / Ride / Swim switch. Three columns, the periods Strava states on its profile (numbers below
show the layout only, they are not anyone's data):

| | Last 4 weeks (per week) | This year | All time |
|---|---|---|---|
| Activities | 4 | 142 | 611 |
| Distance | 22.4 mi | 1,106 mi | 4,380 mi |
| Time | 3h 20m | 164h | 652h |
| Elevation | 910 ft | 41,200 ft | 160,000 ft |

"All time" reads "Since Jun 2026" until a full history is imported. Field list (count, distance, time, elevation) is
Garmin's Progress Summary plus count; Strava's own field labels are **unverified**.

**B. Running — Best efforts.** Strava's 14 distances: 400m, 1/2 mile, 1K, 1 mile, 2 miles, 5K, 10K, 15K, 10 miles,
20K, Half Marathon, 30K, Marathon, 50K. Elapsed time. Top 3 per distance, each with date and the run's name; tap opens
the run. Plus **Longest run** (distance), Garmin's "farthest distance run". Distances not yet run print "—".

**C. Race results** — as today, chip time, but sent by the server and saved through `complete-race` in all cases.

**D. Cycling.**
- Best power: 5s, 15s, 30s, 1m, 2m, 3m, 5m, 8m, 10m, 15m, 20m, 30m, 45m, 1h, 2h (Strava's list; we compute 12 of these
  today — 15s, 30s, 15m and 2h are missing).
- Fastest distances, Strava's full list: 5 mi, 10K, 10 mi, 20K, 30K, 40K, 50K, 80K, 50 mi, 90K, 100K, 100 mi, 180K.
- Longest ride (distance), Biggest climb (most elevation in one ride), FTP best with its date.

**E. Swimming** (Garmin's list; neither Strava page lists swim records):
- Metres: 100, 400, 750, 1000, 1500. Yards: 100, 500, 1000, 1650. Longest swim.
- Yards and metres kept apart. Only continuous swimming, whole pool lengths, pool swims only (Garmin's rules).

**F. Strength** — see §9; the strength apps, not Garmin, set the standard here.

**G. Milestones** — the placeholder comes off until there is something real to show.

## 4. Field rules the build must copy (sources)

- Strava running best efforts: the 14 distances, **elapsed time**, top 3 all time plus top 10 per year, labelled "PR"
  then second and third, bad GPS makes a stretch ineligible, the athlete can edit or remove a time.
  support.strava.com/en-us/articles/15401661-best-efforts-running
- Strava cycling: power durations and distance list above; longest ride, biggest climb; virtual rides count for power
  only. support.strava.com/en-us/articles/15401645-best-efforts-cycling (the power-curve page lists a shorter set:
  15401647 — the two pages disagree).
- Strava profile periods: last four weeks (averages), this year, all time.
  support.strava.com/en-us/articles/15402175-your-strava-profile-page
- Garmin personal records: fastest 1 mi or 1K, 5K, 10K, half, marathon, farthest run; fastest 40K, farthest ride, most
  elevation, best 20-min power; heaviest weight per lift; elapsed time, fastest stretch anywhere, laps ignored.
  support.garmin.com/en-US/?faq=GePPQ3FJYO0A8TAHLeC7CA
- Garmin swim records: list above, yards and metres separate, continuous, whole lengths, pool only.
  support.garmin.com/en-US/?faq=O8rHgFa3iB2HpErPIxL4v5
- **Unverified:** whether Strava leaves out treadmill or manual runs; Strava's exact profile field labels; any Strava
  swim records.

## 5. How it would sit on the server (for the build, not now)

- **One place computes an effort:** the per-workout analysis step (where the power curve is already made) writes each
  run's 14 distance times, each ride's power and distance bests, each pool swim's continuous bests. One method for
  Garmin and Strava, following the rules in §4.
- **One place ranks them:** a records table per athlete (sport, distance or duration, rank 1–3, time or watts,
  workout, date), rewritten when a workout is added, edited or deleted.
- **One place adds totals:** by period, from the same workout rows, same double-count rule as §2.
- **Every screen reads from there:** My Record, a session's "2nd fastest 5K" line, and the threshold learners stay on
  their own grade-adjusted data. The phone prints; it never ranks or sums.
- **History:** the existing backfill (`backfill-power-curves`) widened to the new fields.

## 6. Numbers with no field source (would be OURS)

- The GPS-glitch cut-off (Strava says bad GPS disqualifies, not how bad). Today's run code uses "faster than 3:00/mi".
- Swims: what counts as "continuous" (Garmin says without rest; the rest threshold is not stated).
- Imperial athletes' swim **totals** in yards.

## 7. Settled by Michael, 2026-09-19

1. **We do our own calculations.** One method for every record, over the workout rows, whatever sent them — a Garmin
   watch, Strava, a Zwift or Wahoo ride through Intervals.icu, a phone recording. A provider's own record
   numbers (Strava's best efforts) are never printed; they stay a test check. Two athletes with the same ride get the
   same record.
2. **Cycling uses Strava's full distance list** (5 mi, 10K, 10 mi, 20K, 30K, 40K, 50K, 80K, 50 mi, 90K, 100K, 100 mi,
   180K). Garmin has only 40K.
3. **Strava depth is a risk, not a dependency.** Strava's API terms and approval are slow and may never be granted in
   full, so nothing on this screen may require Strava. Every record and total must be complete for a Garmin-only
   athlete, and for an athlete whose rides arrive from a trainer app.

### Where the rides come from (corrected 2026-09-19 — the earlier line in this doc was wrong)

Intervals.icu is connected and live: sign-in shipped and was verified on the Mac 2026-09-13, and it is there for
**Zwift and Wahoo only** — rides out to them, finished rides back. Garmin does not pass Zwift rides to other apps
(settled in `docs/WORKORDER-intervals-oauth-2026-09-13.md` §3 item 5, with sources), and Intervals.icu is not a Strava
route (its API returns empty stubs for Strava-origin activities).

⚠️ **The return leg is not built, and it is NOT a blocker — corrected again 2026-09-19.** A Zwift ride reaches the app
today **through Strava** (Zwift → Strava → `strava-webhook`); Michael's 15 Sep Anaerobic Ride is in the app that way.
Nothing writes a workout from Intervals.icu: the only Intervals function that reads activities is
`intervals-activity-probe`, which is read-only and writes nothing (grepped `supabase/functions` for
`source: 'intervals`, an Intervals activity webhook, and any caller of `save-imported-workout` inside the
`intervals-*` functions — none). So Zwift rides are already in totals and can already set records.

The return leg (`ENGINE-STATE.md` Intervals.icu banner, job 3 — activity webhook → `/activity/{id}/fit-file` → the
existing `import-fit-file` / `save-imported-workout`, with the same date-and-type check `strava-webhook` uses) is the
**replacement route for the day Strava is capped or refused**. It is its own job, not a prerequisite for this screen.

### What a record needs from a workout

An effort record (fastest 5K, best 20-minute power, fastest 400 yd) needs the per-second data. That arrives with Garmin
activities, Strava activities (streams are fetched on import and on the webhook) and phone recordings. A workout typed
in by hand, or imported with no per-second data, can still count toward **totals** and toward longest run / ride / swim,
but it cannot set an effort record. The screen should not explain this; it simply never prints a record it cannot measure.

## 8. Also settled 2026-09-19

- **Strava stays offered, unchanged**, so the plumbing is in place if the API is approved (and it is how Zwift rides
  arrive today). Nothing on this screen may
  depend on it. "All time" is labelled from the first synced date until the history is deeper.
- **Strength:** the Strong and Hevy model, no medals and no flag on the set — §9.

## 9. Strength — what the lifting apps actually do (researched 2026-09-19, sources below)

**Hevy** keeps, per exercise: Heaviest Weight, Best 1RM, Best Set Volume, Best Session Volume; plus a **set-records
table** at the bottom of each exercise — the heaviest weight for each rep count, which deliberately does *not* trigger a
medal. Bodyweight movements swap to Best set / Most session reps. A medal appears on the set and in the saved workout.
Free shows 3 months of exercise history; full history is $2.99/mo.
help.hevyapp.com/hc/en-us/articles/38279531346455 · hevyapp.com/features/exercise-performance

**Strong** has a Records tab per exercise: all-time bests, the best performance at **each rep count**, and a predicted
column beside it; a real set that beats the prediction replaces it. It stops at **12 reps**, because beyond that the
estimate inflates. Formula named: **Brzycki**.
help.strongapp.io/article/216-exercise-records-screen · /article/133-1rm · /article/237-about-exercise-detail

**Fitbod** records: Estimated Strength, Volume, Reps, Weight, Exercise Time, Total Time, Distance, Total Distance,
Split. Bodyweight movements estimate max reps and ignore added weight. Its estimate decays when a lift is not trained.
help.fitbod.me/hc/en-us/articles/12732749777047 · fitbod.me/blog/estimated-strength

**Boostcamp:** max weight per rep range, max volume per session, max reps at a given weight, lifetime bests, and an
estimated-1RM curve from top sets; flagged with confetti and a badge. boostcamp.app/workout-tracker

**JEFIT:** automatic 1RM per exercise, notification on every record. Record names and rep cap unverified
(their support site was unreachable). jefit.com/blog/upcoming-enhancements-revamped-workout-tab-and-improved-exercise-screens

**Garmin** is the outlier: heaviest weight only, and only for 12 named barbell and dumbbell lifts.
support.garmin.com/en-US/?faq=GePPQ3FJYO0A8TAHLeC7CA

**The common standard:** every one of them keeps records for **every exercise logged**, not a fixed lift list; the four
that repeat everywhere are heaviest weight, estimated 1RM, best set volume, and a reps record; the estimate comes from
ordinary logged sets; a record is both flagged on the set in-session and collected on a per-exercise records screen;
bodyweight movements swap weight for reps. Records themselves are free in Hevy, Strong and Boostcamp — the paywall sits
on long history.

### Proposed for Efforts

Per exercise, every exercise logged (not a fixed four): **heaviest weight** with its date, **best estimated 1RM**, and
the **heaviest weight at each rep count** as a small table, the way Strong and Hevy print it. Bodyweight movements show
most reps in a set. The four working numbers and their "Logged suggests" lines stay where they are.

Two things we already have that fit exactly:
- the estimate is the **Epley/Brzycki average** at the book's coefficient, trusted to **10 reps** on every lift
  (`src/lib/estimate-1rm.ts:108-111,191`) — so the rep ceiling the apps hedge about is already drawn, and sourced.
- the **rep record** is already written and sourced to the book's own p10 line about beating rep records
  (`isRepRecord`, `src/lib/estimate-1rm.ts:233`), and best trusted e1RM per lift all-time is already computed
  (`_shared/state-trend/assemble.ts:425`). Heaviest weight per set exists per session (`best_weight`,
  `compute-facts/strength-facts-lib.ts:60,246`); the all-time pick over it does not exist yet.

**Settled by Michael 2026-09-19:** follow the Strong and Hevy model, and **no medals, no confetti, no PR flag on the
set** — for now. The records live on this screen as plain rows. The strength display frame here is form, bar speed and
slow gain under endurance stress; flat is normal and must not read as a failure. Garmin's 12-lift list is not the model
— its strength records are thin because Garmin is an endurance company.

## 10. Build order — one stage per terminal session (settled with Michael 2026-09-19)

⛔ **Read before starting any stage:** `docs/DESIGN-best-efforts.md` (2026-07-07, still spec) already owns the
*fitness trend* version of best efforts — grade-adjusted pace, a verdict per distance, a chart. **This audit owns the
record version** — the clock time as run. They are the same measurement asked two different questions, and if two
finders get built the app will hold two answers for one 5K.

**The rule for both, and it is the whole point of the stage order below:** one finder per workout, storing on each
window BOTH the as-run elapsed time (what a record is) AND the grade-adjusted pace with heart rate (what a trend is).
My Record reads the first. The trend work, the threshold learner and the done-session line read the second. One
computation, one store, two fields, no second vocabulary.

### Stage 1 — every workout's own efforts, in one place
In `compute-workout-analysis`, beside the power curve that is already there:
- **Runs:** the 14 Strava distances (400m, 1/2 mile, 1K, 1 mile, 2 miles, 5K, 10K, 15K, 10 miles, 20K, half marathon,
  30K, marathon, 50K). Fix the ±2% window edge — the stored time must be the time for the distance, not for a stretch
  up to 2% longer (§2). Each window carries: as-run elapsed time, grade-adjusted pace, average heart rate.
- **Rides:** the four missing power durations — **15s, 30s, 15min, 2h** — added to `POWER_CURVE_DURATIONS`, which takes
  the curve to Strava's 15. Plus the fastest ride distances (Strava's 5 mi to 180K list).
- **Pool swims:** the continuous bests off the lengths — 100/400/750/1000/1500 m and 100/500/1000/1650 yd, yards and
  metres kept apart, whole lengths only (Garmin's rules, §4).
- **Backfill** over existing history, widening `backfill-power-curves`.
- Deploy every function that imports what changed (the `_shared` trap).

### Stage 2 — the records and totals themselves, on the server, one source
- One store of records per athlete (sport, distance or duration, rank 1–3, the number, the workout, the date), written
  from the stage-1 fields, rewritten when a workout arrives, is edited or is deleted.
- Totals by period (last 4 weeks, this year, all time) off the same workout rows, with the existing double-count rule
  (§2). "All time" says "since <first synced date>" until the history is deeper.
- **Sourcing, the same standard as today:** every number carries a field source in the code or an `OURS` marker with a
  row in `docs/STATE-SOURCES.md` (the three known OURS items are in §6). `npm run lint:truth` stays green.
- **Every surface reads this store, none recomputes:** My Record, the done-session line (`_shared/session-boom/line.ts`
  — its run lines 1 and 2 are waiting on exactly this), the session detail pages, State and Performance. The phone
  prints; it never ranks or sums.
- Verify by recompute, three times back to back, on a throwaway account with real synced history — not fixtures alone.

### Stage 3 — the screen
The layout in §3 and §9. Every line of copy goes to Michael in his words before it ships.

### Separate job, not in this order — the Intervals.icu return leg
Finished Zwift and Wahoo rides back in through Intervals.icu, as above. Zwift rides arrive via Strava today, so this
buys independence from Strava rather than any missing data. Do it whenever the Strava cap starts to bite.
