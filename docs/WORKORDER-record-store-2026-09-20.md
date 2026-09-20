# WORKORDER — Stage 2: the records and totals store (2026-09-20)

One terminal, one stage. Stage 1 is on `main` at `b54ed7042`, deployed, and backfilled over the whole history
(529 runs and rides, none below `ANALYSIS_VERSION` v0.3.0). Read `docs/AUDIT-athletic-record-2026-09-19.md` (§7–§10)
and `docs/WORKORDER-record-efforts-2026-09-19.md` first. **This stage adds no screen.** Stage 3 is the screen.

## What stage 1 left you

Every run carries `computed.run_records`, every outdoor ride `computed.ride_records`. Each entry is
`{ elapsed_s, gap_s_per_mi?, avg_hr, net_elev_m }` keyed by the distance labels in `src/lib/best-efforts.ts`
(`RUN_RECORD_DISTANCES`, `RIDE_RECORD_DISTANCES`). Rides also carry `computed.power_curve` at sixteen durations
(`POWER_CURVE_DURATIONS`); the FTP fit reads the separate frozen `CP_FIT_DURATIONS` and must keep doing so.

## ✅ Job zero — WITHDRAWN 2026-09-20. There are no duplicate rows. Totals are not blocked.

> **This section claimed the same ride was stored twice and that totals would come out double. That was
> wrong, and it was wrong because the query behind it was not scoped to one athlete.**
>
> Read at 2026-09-20 with `select=*` on the two rows: they differ in `user_id`. There are **two accounts**
> with the same Garmin history — `45d122e7…` (463 workouts) and `1a1f04d1…` (445 workouts, last activity
> 2026-09-05). Scoped to one athlete, 2026-09-05 has exactly **two** rides, one per Garmin activity id.
>
> The partial unique index is still partial (`20250906120000_workouts_activity_unique_indexes.sql:19-20`,
> `WHERE garmin_activity_id IS NOT NULL`) and the three id-less insert paths the trace below names are still
> real — but no row pair in this data demonstrates a duplicate, so none of it is evidence of a bug today.
> **Anything below this line is the withdrawn claim and its trace, kept so the next session does not
> re-derive it.** Totals may be built.

### (withdrawn) the original claim

Verified 2026-09-19 by direct query. On 2026-09-05 the `workouts` table holds **four** ride rows: two pairs, each pair
identical in date, name, distance and moving time. In each pair one row has a `garmin_activity_id` and its twin has
`garmin_activity_id = null`, both with `source = 'garmin'`. The pattern repeats across most ride dates in the list
(2026-08-13, 08-16, 08-21, 08-22, 08-26, 09-01, 09-03, 09-05 all show doubled rows).

**Any total built over these rows is roughly double the truth.** Before writing a single total:
1. Count how many rows are in this shape, over what date range, and for which sports.
2. Find where the twin is written — trace `ingest-activity`'s upsert keys and the Garmin webhook path, and check
   whether the unique constraint that is supposed to de-duplicate a re-import (`ingest-activity/index.ts:1276`
   comment) covers a row whose `garmin_activity_id` is null.
3. Report what you find **before** fixing anything. A delete over production rows needs Michael's explicit word, and
   this is his own data.
4. Only then decide whether the store de-duplicates on read or the rows get repaired.

⚠️ The record numbers are unaffected — a duplicate cannot beat its twin, they are the same effort. Totals and counts
are the casualty.

## The work

### 1. One store of records per athlete
- Per athlete, per sport, per distance or duration: the **top three**, each with the number, the workout it came from,
  and its date (Strava keeps the top three all time — support.strava.com/en-us/articles/15401661-best-efforts-running).
- Runs: the elapsed time at each of the fourteen distances, plus longest run by distance.
- Rides: best power at each stored duration, fastest time at each of the thirteen distances, longest ride **by
  distance**, biggest climb (most elevation gain in one ride), and the existing FTP best (`athletic-record/record.ts`
  already picks it off the dated FTP trail — reuse, do not re-derive).
- Written on the spine, from the per-workout fields, never recomputed on a screen.

### 2. Rewritten when the data changes
A workout arriving, being edited, being deleted or being recomputed changes the standings. Register wherever the other
downstream steps register — see the three routing tables `CLAUDE.md` names (`ingest-activity` fan-out,
`recompute-workout/orchestrator-lib.ts`, `bulk-reanalyze-workouts`) — or the store goes stale the first time a
workout is deleted.

### 3. Totals by period
Activities, distance, time and elevation gain, per sport, for **last 4 weeks** (as a weekly average), **this year**, and
**all time** — the three periods Strava's profile states
(support.strava.com/en-us/articles/15402175-your-strava-profile-page). "All time" is labelled from the athlete's first
synced date until a deeper history exists (Strava's connect import is 90 days, Garmin's is capped at 180).
No de-duplication is needed: job zero was withdrawn (see above).

### 4. One source, and everything reads it
`athletic-record` serves the screen from this store. The run lines of the done-session good-news line
(`_shared/session-boom/line.ts`, its run lines 1 and 2 are unbuilt and were waiting on exactly this) read it too.
State and Performance keep their own verdicts; they do not mint a second best-effort number.

### 5. Sourcing
Every number carries a field source in the code or an `OURS` marker with a row in `docs/STATE-SOURCES.md` — the new
rows live under "Best efforts and records". `npm run lint:truth` stays green.

## Verification

1. Deterministic fixtures for the ranking, the tie-break and the period boundaries.
2. On a throwaway account with real synced history: build the store, then **rebuild it three times back to back** and
   confirm every row is identical.
3. Cross-check a handful of run records against Strava's own stored numbers
   (`workouts.achievements.best_efforts`, Strava-sourced runs only). A disagreement is a finding to report, not a
   number to tune toward.
4. Totals: add the same period by hand off the raw rows and confirm the store agrees. Scope every query to ONE
   `user_id` — the mistake job zero made was reading two accounts' rows as one athlete's.

## Handoff must state

PUSHED / DEPLOYED (with the importer list) / VERIFIED, separately. Which fields the store holds. What stage 3 can rely on.

---

## Job zero — findings (2026-09-20, traced from code; the rows themselves not read)

⚠️ **Evidence label:** everything below is a CODE TRACE with `file:line`. I have not queried the
workouts table — that needs Michael's go-ahead, and he was asleep when this was written. So the
structural cause is settled and **the writer is not**. The one query that settles it is at the bottom.

### Why nothing stops a second row — settled

The unique index that is supposed to de-duplicate a Garmin re-import is **partial**:

```sql
-- supabase/migrations/20250906120000_workouts_activity_unique_indexes.sql:19-20
CREATE UNIQUE INDEX ... ON public.workouts(user_id, garmin_activity_id)
  WHERE garmin_activity_id IS NOT NULL;
```

A row whose `garmin_activity_id` is null is **not covered by the index at all**. The upsert at
`ingest-activity/index.ts:1380` names `onConflict: 'user_id,garmin_activity_id'`, which can only
match a row the index covers. So the answer to the work order's question is: **no, the constraint
does not cover a null-id row, and nothing else does either.** Any path that inserts a workout
without a provider id can insert an unlimited number of copies.

### Three paths insert a workout with no provider id and no de-duplication check

| Path | Line | What it writes | Why it is a candidate |
|---|---|---|---|
| `save-imported-workout` | `index.ts:159` | bare `.insert([toSave])`, no conflict target, no existing-row lookup; `mapImportToDb` sets **no `source` column at all** | A .fit file imported for a ride that also syncs from Garmin lands twice. The `source` the row ends up with is the column default, which no migration in this repo defines |
| `mark-planned-complete` | `index.ts:69-83` | `.insert({...})`, no lookup; no `source`, no provider id, `completedmanually: true`, and `duration`/`moving_time`/`elapsed_time` all set to the **planned minutes** | Tapping a planned ride complete, then the real ride syncing, is two rows |
| `ingest-phone-workout` | `index.ts:238` | `.insert(workoutData)` | Same shape |

⚠️ **The reported twins do not cleanly fit any of the three, and that is the open question.** The
pair is described as identical in distance (4.728 km, 25.884 km) and moving time (18, 87).
`mark-planned-complete` writes **no distance**, so an exact distance match rules it out unless the
row was enriched later. The `18`/`87` values look like **minutes**, which is the shape
`mark-planned-complete` writes and NOT the seconds every provider path writes — so the two halves of
the description point at different writers. One of the two readings is wrong, and the rows say which.

### Two secondary bugs found on the way — both real, neither the cause

1. ⛔ **The Strava-side guard breaks once duplication exists, and makes it worse.**
   `strava-webhook/index.ts:210-217` decides whether to skip a Strava activity by looking for a
   Garmin row on the same date and type — with `.maybeSingle()`. **`maybeSingle()` errors when more
   than one row matches.** On that error `garminWorkout` is null, the skip does not fire, and Strava
   ingests a third row. So a date that is already doubled loses its protection against doubling
   again. It should be `.limit(1).maybeSingle()` or a count.

2. **An ordering hazard in the same guard.** If Strava's webhook lands before the Garmin activity
   has arrived, the guard finds no Garmin row and ingests from Strava; Garmin then inserts its own.
   Two rows, and the second is `source = 'strava'` — so this produces a *mixed-source* pair, not the
   same-source pair reported. Worth fixing, not the reported case.

### What settles it — one read-only query, waiting on Michael

```sql
select id, source, garmin_activity_id, strava_activity_id, healthkit_id,
       planned_id, completedmanually, workout_status,
       distance, moving_time, elapsed_time, created_at, updated_at
from workouts
where user_id = '<michael>' and type = 'ride' and date = '2026-09-05'
order by created_at;
```

`created_at` orders the writers, and `planned_id` / `completedmanually` / `strava_activity_id`
identify which of the three paths wrote the twin. **Nothing should be deleted before that is read**,
and a delete over these rows needs Michael's explicit word regardless — it is his own data.

### What this blocks, and what it does not

- **Blocked:** §3 totals. Activities, distance, time and elevation over these rows are roughly double.
- **Not blocked:** §1 the records store. A duplicate cannot beat its twin — same effort, same numbers
  — so rankings are unaffected. This is also the work order's own reading.

### Update — the `-detail` suffix is the strongest lead (2026-09-20, after the rows were quoted)

The four rows quoted for 2026-09-05 show the id-bearing twins carrying `24251795071-detail` and
`24252324750-detail`. That suffix is Garmin's, and the repo already knows about it:

```ts
// supabase/functions/garmin-webhook-activities/index.ts:147-151
// Normalize Garmin summaryId: range details often append "-detail"; summary endpoints expect the base id
function normalizeSummaryId(rawId) { return String(rawId).replace(/-detail$/i, ''); }
```

⛔ **One Garmin ride reaches us through two webhooks with two different ids.** The activities
(summary) webhook carries `summaryId` = `24251795071` (`:266`); the activity-details webhook carries
`summaryId` = `24251795071-detail`, and that is the branch that builds the `ingest-activity` payload
(`:661`, `garmin_activity_id: String(activity.summaryId ?? activity.activityId ?? '')`). The
normalizer at `:148` exists precisely because the two disagree — **but it is only applied when
fetching a summary (`:195`), never before the id is written to `workouts`.**

Two different non-null ids do not collide on a unique index. So even with both ids present this
doubles, and the partial-index finding above is the second half of the same story rather than the
whole of it.

⚠️ **This does not yet explain the NULL.** Two of the four rows have `garmin_activity_id = null`, and
no path I have read writes null — `ingest-activity:987` writes `String(… || '')`, which is the empty
string. And the empty string matters: it is NOT NULL, so the partial index *does* cover it, and two
`''` rows on one date would have collided into one. Two separate null rows means something really is
writing null. I have not found that writer.

**Two candidate fixes, for when the rows are read and the writer is named:**
1. Normalize the id before it is written — apply `normalizeSummaryId` in the `:661` payload — so the
   detail webhook and the summary webhook land on the same key and the upsert collapses them.
2. Widen the unique index to cover a null id (a unique index on `(user_id, date, type, distance)` for
   provider-less rows, or `NULLS NOT DISTINCT` on the existing one).

Neither should be applied before the rows are read. Fix 1 changes what future ingests key on and
would orphan the existing `-detail` rows; fix 2 would fail outright while the duplicates are still
in the table.

⚠️ **Not rides only.** The Strava cross-check run for stage 1 found every Strava-sourced RUN doubled
as well, so the count in step 1 must cover every sport, not just rides.

---

## Stage 2 — what shipped, and what stage 3 must not trip over (2026-09-20)

**Michael's ruling: NO stored records table.** `athletic-record` works the standings and the totals
out from the workout rows on every read, and §1's "one store … written on the spine" is superseded.
He was given the trade — a saved list has to be rewritten on every arrival, edit, delete and
recompute, and that is the one way it drifts out of step with the workouts under it — and chose the
fresh read. **§2 (rewritten when the data changes) therefore stays withdrawn: there is nothing to
rewrite.** `rank.ts` and `totals.ts` are pure, so a table can be dropped in later without either of
them changing, if a read ever gets slow.

### Two things stage 3 has to handle on the screen

1. ⚠️ **Two different marathon numbers, both correct.** The standings read **4:41:27** (the fastest
   26.2 miles anywhere inside the run) and the race card reads **4:43:48** (the chip time, gun to
   line). Neither is wrong and neither should be "fixed" — Strava prints both the same way. The
   screen must not place them so they read as a contradiction, and it must not silently show one.
   The same gap will appear at every distance he has raced.

2. ⚠️ **Equal efforts on one day both rank, by design.** The 400 m podium currently reads
   `1:42 (2025-09-01)` twice. The rule that used to collapse those was removed when job zero was
   withdrawn, because with no duplicates in the data it could only hide a real second effort. **That
   pair is not yet explained** — two entries means two workout ROWS, so it is either a genuine double
   day or one run stored twice in his own account. The scratchpad script now prints both workout ids
   and compares name, distance and duration, and scans the whole history for rows sharing date, type,
   name and distance. Settle it before stage 3 prints the podium.

   ⚠️ If it IS one run stored twice, the structural finding below is the cause and the fix belongs at
   the write, not in the ranker: the unique index is partial (`WHERE garmin_activity_id IS NOT NULL`)
   and `save-imported-workout:159`, `mark-planned-complete:69-83` and `ingest-phone-workout:238`
   insert with no de-duplication check.

### Deploy

`athletic-record`, and nothing else — it is the only importer of `_shared/athletic-record/rank.ts`
and `_shared/athletic-record/totals.ts` (traced 2026-09-20). ⚠️ `get-week` still holds stage 1's
undeployed `workout-list-select` change; leave it held until stage 3 needs those keys, since its
bundle would also carry another terminal's unapproved `spacing-line.ts`.
