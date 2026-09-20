# WORKORDER — Stage 1: every workout measures its own best efforts (2026-09-19)

One terminal, one stage. Read `docs/AUDIT-athletic-record-2026-09-19.md` first — it holds the field sources, the
screen this feeds, and the decisions already settled. **This stage adds no screen and changes no screen.**

⛔ **Read before writing anything:** `docs/DESIGN-best-efforts.md` (2026-07-07, still spec) owns the *fitness trend*
version of this measurement — grade-adjusted, verdict per distance. This stage is the *record* version — the clock
time as run. **They are one finder answering two questions.** Build one finder that stores both numbers per effort. A
second finder is how the app ends up with two answers for one 5K.

## What exists today (traced 2026-09-19, verify before trusting)

- `calculateBestRunEfforts` — `supabase/functions/compute-workout-analysis/index.ts:160`. Fastest 1 mile / 5K / 10K per
  run, elapsed seconds, raw (not grade-adjusted). Stored at `:1975` as `computed.best_efforts`.
  ⚠️ **The bug to fix:** it accepts any window between 98% and 102% of the target distance (`:184`) and stores that
  window's raw time. A "5K" may be 4,900 m or 5,100 m. The pace it stores is exact; the time is not.
- `buildRunDistanceBests` / `buildRunPaceCurve` / `buildRunHrCurve` — `src/lib/run-critical-speed.ts:208,283`, called
  from `compute-workout-analysis:1958-1965`. Grade-adjusted metres on moving seconds, 400 m–5 km. Feeds the run
  threshold suggestion. **Do not repurpose these for records and do not change what they feed.**
- `calculatePowerCurve` — `compute-workout-analysis/index.ts:116`, durations from `POWER_CURVE_DURATIONS`
  (`src/lib/bike-ftp-estimator.ts:52`, twelve: 5s, 1, 2, 3, 5, 8, 10, 12, 20, 30, 45, 60 min). Heart rate during each
  best window rides along as `power_curve._hr`.
- Swim lengths: `swim_data.lengths`, each `{ distance_m, duration_s, … }` (read at
  `compute-workout-summary/index.ts:769-770`); pool length via `resolvePoolLength` (user correction, activity value,
  plan value). Garmin sends real lengths; whether Strava pool swims carry them is **unverified — check a real row before
  writing the swim rules.**
- Backfill pattern: `supabase/functions/backfill-power-curves/index.ts` — recomputes analysis for rows missing the
  fields. Widen this; do not write a second backfill.
- Column list for workout reads: `supabase/functions/_shared/workout-list-select.ts:28-30` already names
  `power_curve`, `best_efforts`, `pace_curve`. New fields go here or the readers get nothing.

## The work

### 1. Runs — the 14 record distances
Strava's list (source: support.strava.com/en-us/articles/15401661-best-efforts-running):
400 m, 1/2 mile, 1 km, 1 mile, 2 miles, 5K, 10K, 15K, 10 miles, 20K, half marathon, 30K, marathon, 50K.

- **Elapsed time**, the fastest stretch anywhere in the run, laps ignored (Strava's rule and Garmin's).
- **The stored time must be the time for the distance.** Interpolate between samples at the exact distance instead of
  accepting a window up to 2% long. Pin this with a fixture that has a sample straddling the boundary.
- Each effort stores, in one object: elapsed seconds · the grade-adjusted pace for the same window · average heart rate ·
  net elevation over the window. The record screen reads the first; the trend work and the threshold learner read the
  rest.
- Keep `computed.best_efforts` working for whatever reads it today until Stage 2 lands, or state in the handoff what
  broke.

### 2. Rides — four more durations, plus distances
- Add **15s, 30s, 15min, 2h** to `POWER_CURVE_DURATIONS`, taking the curve to Strava's fifteen (5s, 15s, 30s, 1, 2, 3,
  5, 8, 10, 15, 20, 30, 45 min, 1h, 2h). Source: support.strava.com/en-us/articles/15401645-best-efforts-cycling.
  ⛔ **15 min lands inside the FTP fit's window** (`CP_FIT_MIN_S`/`CP_FIT_MAX_S` = 120–1200 s,
  `src/lib/bike-ftp-estimator.ts:80-81`; `bestPerDuration` at `:189` feeds every label in the list to the fit). Adding it
  silently adds a point to every athlete's critical-power fit and can move their learned FTP. **Do not let that happen
  in this stage:** give the fit its own explicit duration list, unchanged from today's twelve, and let the curve grow
  beside it. Say so in the handoff.
- Fastest ride distances, Strava's list: 5 mi, 10K, 10 mi, 20K, 30K, 40K, 50K, 80K, 50 mi, 90K, 100K, 100 mi, 180K.
  Same interpolation rule as runs.
- A ride with no power still gets distances; a trainer ride with no GPS still gets power.

### 3. Pool swims
Garmin's list (source: support.garmin.com/en-US/?faq=O8rHgFa3iB2HpErPIxL4v5):
metres 100, 400, 750, 1000, 1500 · yards 100, 500, 1000, 1650.

Garmin's rules, and they are the spec here: **continuous swimming only** (no rest inside the effort), the distance must
be a whole number of pool lengths, **pool swims only** (no open water), and **yards and metres are separate records** —
one swim never counts toward both. A 25-yard pool arrives as 22.86 m.

⚠️ First job in this part: open a real swim row and write down what the lengths actually carry (rest lengths? timestamps?
stroke?). The continuous rule cannot be written from this document. What counts as "rest" is not in Garmin's page — if a
threshold is needed it is **OURS**, with a row in `docs/STATE-SOURCES.md`.

### 4. Backfill
Widen `backfill-power-curves` to recompute the new fields over existing history, newest first, resumable. A row that
already has the new fields is skipped.

### 5. Deploy
`_shared` and `src/lib` are bundled per function at deploy time. `POWER_CURVE_DURATIONS` and `run-critical-speed.ts`
have many importers: `grep -rln "bike-ftp-estimator" supabase/functions --include=index.ts` (and the same for
`run-critical-speed`) and deploy every one of them, not only the function you edited.

## Rules that bind this stage

- Every number has a field source cited in the code, or an explicit `OURS` marker plus a row in
  `docs/STATE-SOURCES.md`. `npm run lint:truth` stays green (it runs inside `npm run build`).
- The existing OURS numbers this stage inherits: the "faster than 3:00/mi" sanity cut in the run finder
  (`compute-workout-analysis:196`), and anything new the swim rest rule needs.
- Nothing computed on the phone. This stage writes server fields only.
- Commit the exact files, never `git commit -a` — other terminals share the tree.
- Commit, push and deploy wait for Michael's word.

## How it is verified — fixtures are necessary, not sufficient

1. Deterministic fixtures for the interpolation, the ±2% fix, and the swim length rules.
2. A throwaway account with real synced history. Recompute **three times back to back** and confirm every number is
   identical each time.
3. Cross-check the runs against Strava's own stored best efforts (`workouts.achievements.best_efforts` on Strava-synced
   runs, `ingest-activity/index.ts:474-485`). They should agree within a second or two. **A disagreement is a finding to
   report, not a number to tune toward** — ours is the one that ships.
4. Confirm no athlete's learned FTP moved: same critical-power inputs before and after.

## Handoff must state

What is PUSHED, what is DEPLOYED (with the importer list), and what is VERIFIED. Which fields now exist on a workout and
what reads them. Whether the swim rules could be written from real data or are still guesses. Anything left for Stage 2.
