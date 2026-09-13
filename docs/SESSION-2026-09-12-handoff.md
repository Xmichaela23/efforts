# Session 2026-09-12 — one truth for drift, the plan line, and the indoor name

Engineer session. Branch `stage/one-truth-drift`, rebased onto `a99f7b25` and pushed to `main` as
`1123a9fc`. **Seven commits pushed; nothing deployed** — see "Deploy list" at the end.

---

## What the audit found

Three facts were being worked out in more than one place, and the copies disagreed.

**Drift had five answers to "was this session steady enough to read".**
`drift-pct.ts isIntervalSession` was the rule; `session-boom/line.ts` called it and passed nothing,
so only the planned step count could answer; `compute-snapshot driftReadForPoint` kept its own test,
its own precedence and a fourth fallback (`workout_facts.drift`) no other screen could reach, and its
second call site (`:1676`) passed no interval flag at all; `endurance-checkpoint` read
`run_facts.hr_drift_pct` raw and printed it under the word "decoupling".

The visible contradiction: a ride could never be called an interval session in `compute-snapshot`
(its graded arm was runs-only and it had no pace-swing arm), so an unplanned interval ride was
plotted as a dot on a chart captioned "one steady ride" while Performance showed it no drift at all.

**The plan line had four composers in three grammars.** `workout-detail`'s inline copy; `build.ts
buildWeekLabel` off the fact packet, whose qualifier was `weekIntent` — initialised to `'build'`
before any evidence and printed as though the plan had said it; `StatePerformanceSection
blockContextLine` on the phone with no plan name; and `get-week/week-label.ts` plus a `· Week {n}`
concatenated on the phone.

**The session name had six ladders**, three of them asking the indoor question their own way, and
none of them ever calling a *ride* indoors — every one gated its indoor test on run or walk.

---

## What shipped

### 1. `BLOCK_CARD_VERSION` 3 → 4
`block.line` was added in `59e05054` without the bump the file's own rule requires, so the cache fast
path served every stored session untouched: the lift header printed nothing and the run/ride tiles
fell back to `week_label`'s different grammar. Deployed-but-unreachable. A stored session now
refreshes once on open.

### 2. One steadiness ladder — `_shared/session-detail/session-steadiness.ts`
The order is Michael's, 2026-09-12. The first rung that can answer wins; a rung with nothing to read
is skipped rather than guessed at.

1. **The plan's own session type**, when linked. Reads `ENDURANCE_CLASS` — the library already sorts
   all ten endurance families by where they sit against threshold, with a page cited per family — so
   band `vt1_or_easier` reads and the other three do not. A race plan's rows carry no family tag, so
   its own words answer instead.
2. **Planned steps > 2.** ⚠️ Only ever says "not steady" — see the defects below.
3. **The athlete's own tag.** A slot. Null on every session; nothing writes it yet.
4. **Strava's `workout_type`.** Only "workout" (3, 12) decides. Race falls through; the race path is
   decided elsewhere and a race is not a drift question.
5. **The device's lap intensity markings.** ⚠️ Inert and unconfirmed — see "Unverified".
6. **The per-mile pace swing, 75 s.** ⚠️ OURS, with a ledger row in `docs/STATE-SOURCES.md`. Last on
   purpose: the only rung that reads the shape of the data rather than a statement about the session.
7. **The analyser's detected rows** — retained, not specified. Kept at the bottom because deleting it
   would flip an unplanned interval session whose pace swing sits under 75 s back to a drift read.

`resolveSessionDrift` takes the ladder's **materials, never a verdict**, so no caller can answer the
question for itself. `compute-snapshot`'s own test and its `f.drift` fallback are deleted and both its
call sites pass the same inputs.

**The boom line cannot pass rung 7**, and this is stated at the call site: the rendered interval rows
are built *downstream* of it by the session-detail builder, and reading a stored copy is the cache
trap that function was rewritten to escape. Rungs 1, 2, 4, 5 and 6 all answer before it. Its priors
skip rungs 5 and 7 as well, to keep a year of sessions narrow in the SELECT.

### 3. A long session always gets a drift reading — `vt1-window-drift.ts`
p107 makes drift the dose guide for *"easy/VT1 work in a given session"* and p235's LSD is *"primarily
below VT1"*. When the session carries the book's sets, the reading is taken over the VT1 portions
only; a plain long session has nothing to remove and keeps its whole-session read.

**Which rows are the sets** is decided against the session's own easiest work step, on the band's
upper value, so a "below 75%" band starting at zero watts and a VT1 step resolved to a single pace
compare on the same footing. A set's recovery goes with it, and every recovery and pause row stays
out (heart rate falls through a pause, which would read as improving efficiency).

⛔ **Two tests were tried and rejected, both traced before being dropped.** The step's own kind does
not say — `buildContinuousWithInserts` gives the VT1 body and the inserted set the same role, both
`'work'` (`generate.ts:622`, `:646`); only the recovery carries a role of its own. The label does say
('Easy' / 'Steady' / 'Easy spin' against the archetype's name) and is not safe to read —
`source-rules.ts` warns those are display names, the same double-naming trap `Cut-downs` had, and
they were renamed once already while the ids stayed put. **p107's bout length was used as a set
detector for one commit and overruled the same day**: the page's figure says whether a VT1 bout is
worth doing, and a number borrowed from one context is not licensed as a filter in another. It would
also have thrown a genuinely easy eight-minute segment out of the reading. `VT1_MIN_BOUT_S` is now
the "not enough easy running to read" floor and nothing else.

**Resolution limit, stated:** a VT1 block recorded as a single row cannot be halved — one row is one
average. That session falls back to the whole-session read rather than inventing a comparison. Reading
the samples instead (option B) is what fixes it, and was not built.

### 4. One plan line — `_shared/plan-line.ts`
`workout-detail` stamps `block.line`, `coach` stamps it on the State card, `get-week` stamps
`weekPosition`. The screens print. `buildWeekLabel` is deleted; `plan_context.week_label` now carries
the goal-race line only, which is not a plan line (it names the race just finished and has no week in
it). The `AdherenceChips` fallback is removed: a session with no block shows no line rather than a
line in a grammar no other screen would print. Today's date is the only thing a phone still adds.

### 5. One session name — `src/lib/session-display-name.ts`
Over `_shared/indoor-session.ts`, which has been the one indoor answer since 2026-09-09. The words are
unchanged; what changes is that every screen says the same one. New behaviour: an indoor ride is
"Indoor Ride" (or "Zwift"), and the `venue:` tag names the machine so a run moved to a treadmill says
"Treadmill" rather than "Indoor Run". `CompletedTab` keeps its data-availability checks — whether a
row has a series and a track to draw is a different question from whether it happened indoors.

### 6. The checkpoint sheet's decoupling clause is dropped
It read hard sessions only (`HARD_FAMILIES`), which is exactly the work p107's rule does not govern.
Wiring it to the shared ladder would have blanked the clause on nearly every session, leaving a
sentence that loses a number some weeks and not others. Copy approved.

---

## ⛔ The three defects the fixtures did not catch

Every unit test was green while all three were live. They were found by driving the real functions
against the live database with a throwaway account.

1. **Rung 2 declared every unplanned session steady.** `plannedStepsSteady` returned `steps <= 2` as a
   positive verdict, but the rule is "more than two planned steps = intervals" and is silent about a
   low count. An unlinked session carries `total_steps: 1` as noise from a fact packet built with no
   plan to read, so rung 2 answered first and rungs 4, 5 and 6 never ran — and an unplanned interval
   ride that Strava itself labelled a workout came back with a drift number. It now answers "not
   steady" or nothing, like rung 7. **Only rungs 1 and 3 may assert steady.**
2. **An easy ride's planned watts band was thrown away.** `build.ts` required the lower bound above
   zero, and the library writes an easy ride as `{lo: 0, hi: 0.75 × FTP}` — p239's own "below 75%"
   shape (`generate.ts:156`). So every VT1 row on an endurance ride arrived with no planned band and
   the window could not tell those rows from the sets. Only the upper bound has to be positive now.
   No words change: `powerBand` keeps its own `lower_w > 0` test and nothing renders the watts as text.
3. **State did not apply the VT1 window.** The window read the *rendered* interval rows, which only
   the session-detail builder produces, so State fell back to the whole-file number: the same long run
   printed **4.8% on Performance and 12.9% on State's chart**. `vt1WindowDrift` reads the analyser's
   breakdown directly now (`rowsFromAnalysis`), which both callers already hold.

---

## The verify run

Throwaway account, never Michael's. One plan (Standard Focus, 12 weeks), eight completed sessions, the
four changed functions driven **locally under Deno against the live database** — `supabase functions
serve` needs Docker and Docker was not running; running each function directly needs neither, and the
repo has used a local-function-against-live-DB check before. Three fresh seeds, all green, account
deleted after each.

| Session | Expected | Performance | State |
|---|---|---|---|
| Steady ride | read | 4.2% | 4.2% |
| Unplanned interval ride | none | none | none |
| Planned interval run | none | none | none |
| Graded interval run, no plan link | none | none | none |
| Planned LSD with sets | read | **4.8%** (was 12.9) | **4.8%** |
| Plain LSD | read | 4.4% | 4.4% |
| Planned long ride with sets | read | **5.0%** (was 7.1) | **5.0%** |
| Plain long ride | read | 3.9% | 3.9% |

Plan line: `"Standard Focus · week 2 of 12"` on Performance and State, `"week 2 of 12"` on Today. Two
older sessions read "week 1 of 12" because they genuinely fell in week 1.

⚠️ **Two things the first run got wrong and that are worth remembering.** A missing `workout_facts`
row means a session never reaches State at all — eight sessions showed no points, which looks like
agreement and is silence. And `get-week` resolves `currentWeek` from the range it is asked for, so a
window reaching back into week 1 correctly answers "week 1"; the check had to ask for today. The first
version of the assertion let a null Today position pass, which read as green and verified nothing.

---

## Deploy list (transitive import graph, not grep)

```
workout-detail  compute-snapshot  compute-session-boom  analyze-running-workout
coach  get-week  endurance-checkpoint  ingest-phone-workout  detach-planned
```

The first eight are every function that transitively imports a changed `_shared` file, plus the
functions whose own `index.ts` changed. `detach-planned` is the deploy owed from the 2026-09-11/12
session. Then Michael rebuilds in Xcode.

**After the deploy**, a stored session picks up the new drift number and the plan line on first open
(`BLOCK_CARD_VERSION` is 4). No snapshot backfill is needed — `compute-snapshot` recomputes the spine
from the workout rows each run, so State corrects itself on the next snapshot.

---

## Unverified

- Everything, on a real device. Nothing since 2026-09-09 has been seen on a phone.
- The eight-session run used **seeded analysis payloads**. It exercised the real functions against the
  live database, but no real recording has been through the new drift path.
- **Rung 5 is inert and unconfirmed.** `ingest-activity` stores the provider's lap objects verbatim, so
  a marking that arrived is already on the row and no importer change is needed to read it — but every
  existing consumer normalises laps down to start, end, time and distance. Strava's lap objects carry
  no intensity field at all, and whether Garmin's Activity API passes the FIT file's
  ACTIVE/REST/WARMUP/COOLDOWN through is not settled by anything in this repo. Both spellings are read
  and an absent one skips the rung, so it does nothing until a recording actually carries one.
- The long run's **fade** switch (`compute-snapshot`, the `decoupling_mixed_effort` note) is untouched
  and now back-annotated: it governs the fade read, not the drift read.
