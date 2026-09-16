# DESIGN — the one-truth guard (Stage 6 of the one-truth workorder)

**Status:** APPROVED (Michael, 2026-09-15). Build to this. The one open ruling — §1.3, a unit
conversion on the phone — was settled the same day: **it fails.** Nothing has been built yet; the
counts below are a dry run against the tree at `9b1c9171` and nothing in `src/` or
`supabase/functions/` was changed to produce them.

**What it is:** five build-time rules that make the seven rules of
`docs/WORKORDER-app-one-truth-2026-09-15.md` §1 enforced rather than asserted. It is the same move
D-237 made for silent estimates (`docs/DESIGN-D237-lint-guard.md`), widened from "a fallback must
declare itself" to "a number must have one owner, one source, and one writer."

**Read with:** WORKORDER §1 (the seven rules), §3a (scope ruling and the parked race path), §4
Stage 6 · `docs/TRUTH-MAP.md` §7.8 (the flag inventory) and §8.0 (the 42 rank-A items) ·
`docs/DESIGN-D237-lint-guard.md` §2 (the honest reach-and-blind-spots section, which applies here
unchanged) · `scripts/check-estimate-provenance.mjs` (the lint that exists today).

**One sentence:** the build fails when a screen computes a number, when a load-bearing constant has
no source, when two server steps write one derived field, when a provider summary field is rebuilt
behind a fallback chain, or when the composer prints a number the book does not.

---

## 0. Where it lives — one tool, not five

**Decision: extend `scripts/check-estimate-provenance.mjs` into a rule-pack runner. Do not write a
new tool.**

The reason is not code reuse — it is that a second tool means a second config file, a second
allowlist, a second CI job and a second place to forget a park. The existing script already owns the
four things every one of these rules needs: a TS-compiler-API AST walk, a curated file list in
`scripts/estimate-provenance.config.json`, the declared/annotated/known-exception pass machinery,
and a CI workflow (`.github/workflows/provenance.yml`) that is already wired.

What changes:

| Today | After |
|---|---|
| one rule (the D-237 numeric-fallback tripwire), per-file | that rule becomes **Rule 0**, unchanged |
| config lists `files` | config gains a `scopes` block (§1.2, §2.1) and a `parked` block (§7) |
| one pass over a curated list | a whole-tree pass is added for Rule 3, which must aggregate across every edge function |
| one exit code | per-rule `warn` / `fail` severity, so rules switch on one at a time (§9) |
| `npm run lint:provenance` | keep it (CI already calls it); add `npm run lint:truth` as the alias Stage 6 onward uses |

**The one genuinely new walk** is Rule 1: it walks JSX in `src/components`, which the current script
never opens. That is a new rule module inside the same script, not a new script.

**Rule 3 is the only rule that cannot be per-file.** It builds a map of `table.column` → writing
step across all of `supabase/functions`, then reports collisions. It runs as a second phase after
the per-file phase. That is why one tool matters: a per-file tool could not express Rule 3 at all.

---

## 1. Rule 1 — a component may render a server field; it may not work one out

### 1.1 The definition, made decidable

The rule applies to an expression that **reaches the screen**: an expression inside a
`JsxExpression` in a file under `src/components`, following a local `const` one level (up to three)
when JSX names an identifier rather than the expression itself.

Such an expression **COMPUTES** (fails) when it contains any of these four shapes:

| shape | what it is | test |
|---|---|---|
| **arithmetic on a fetched value** | `+ - * / %` where at least one operand is a property or element access off fetched data | binary arithmetic node, one operand a `PropertyAccess` / `ElementAccess` / optional-chained call |
| **a threshold** | a numeric literal comparison that picks which number is printed | a `ConditionalExpression` whose condition compares against a non-zero numeric literal **and both branches carry a number** |
| **a fallback chain** | three or more rungs of `??` / `\|\|` for one value | a top-of-chain `??`/`\|\|` with ≥ 3 rungs, no rung a comparison, no rung a string literal, at least one rung a data field |
| **a unit pick** | the phone converting the value into the athlete's unit | either operand of arithmetic is a conversion constant: `1609`, `1609.34`, `1.609344`, `0.453592`, `2.2046`, `1.09361`, `0.9144`, `2.237`, `0.3048`, `3.28084`, `25.4` |

It is **plain formatting** (passes) when it is only:

| shape | test |
|---|---|
| **m:ss / h:mm:ss** | `÷` or `%` by a literal in `{60, 3600, 1000, 86400, 86400000, 24, 7}` with nothing else in the expression |
| **`toFixed` / `padStart` / `String()`** | the decimal places or the zero-pad are formatting, not a rule |
| **a unit label from a flag** | a string chosen off a boolean (`imperial ? 'mi' : 'km'`) where **the number is not touched** |
| **a colour, word, icon or visibility picked off a server value** | both branches are non-numeric |
| **a count of rendered list rows** | `.length` arithmetic |
| **chart, canvas and gesture geometry** | the expression names `clientX/clientY`, `innerWidth/innerHeight`, `timeStamp`, `getBoundingClientRect`, `scrollTop/scrollLeft`, a `width/height/padding/margin`, a chart domain or scale — these are pixels, not athlete numbers |
| **a loop index or a sort comparator** | an operand named `i j k n idx index len count page step row col`, or the node sits inside `.sort/.map/.filter/.reduce/.slice/.findIndex` |
| **date arithmetic** | the expression names `getTime()`, `Date.now()`, `toISOString`, `getFullYear`, `setDate`, `getDate`, or a `T00:00:00` literal |

### 1.2 Five real examples of each, from `TRUTH-MAP.md` §8.1

**COMPUTES — the rule must fail these:**

1. `src/components/LoadBar.tsx:91,130-131` — the form key rounds each operand on its own, so
   "Today: 47 − 63 = −15" prints beside a subtraction that reads −16. §8.0 #31, rank A.
2. `src/utils/workoutFormatting.ts:23-24` — `floor(min)` then `round(sec)` prints "7:60/mi"; three
   screens call it (`PostWorkoutFeedback.tsx:113`, `lib/share-session-text.ts:51`,
   `TodaysEffort.tsx:598`). §8.0 #2, rank A. **A rounding rule inside a formatter is arithmetic,
   not formatting** — this is the line the m:ss allowance must not cover.
3. `src/components/WorkoutCalendar.tsx:1065-1071,1333` — the Week bar's "Done 3h 12m · 24 mi" picks
   the unit and converts on the phone. §8.1 §7.1 #40, rank B.
4. `src/components/PlannedWorkoutSummary.tsx:339-364,456-462` — the step line's cut-offs (metric
   ≥ 1000 m → km 1 dp; imperial < 0.1 mi → yd, < 1 mi → 2 dp, else 1 dp; < 200 m → "Nm"). A
   threshold **and** a unit pick in one expression. §8.1 §7.1 #31, rank B.
5. `src/components/context/StatePerformanceSection.tsx:1026-1034` — FTP resolved on the phone when
   the server anchor is absent: a fallback chain, not formatting. §8.1 §6 State #12a, rank B.

**PLAIN FORMATTING — the rule must pass these (all five were STRUCK in Stage 1 for exactly this
reason, so the rule is calibrated against verdicts that already exist):**

1. `src/components/SessionNarrative.tsx:352-363` — the Details header does m → mi and m:ss of the
   server's own `completed_totals.duration_s`; the temperature string is composed server-side
   (`session-detail/build.ts:165-181`). §8.1 §6 Perf #9, STRUCK.

   > ⚠️ **The m → mi half of this one is a unit pick under §1.1 and FAILS** (§1.3, settled). The
   > m:ss and the server-composed temperature string are what pass here.
2. `src/components/AdherenceChips.tsx:271` with `SessionNarrative.tsx:357-361` — "30 of 48 min" is
   `Math.round(done/60)` and m:ss of the same stored seconds; no arithmetic changes the seconds.
   §8.1 §6 Perf #4a, STRUCK.
3. `src/components/TodayWeather.tsx:86-88` — wind is hidden at 0; `lib/sessionWeather.ts:105`
   already rounded it. A visibility gate, no value changed. §8.1 §7.1 #5, STRUCK.
4. `src/lib/context-utils.ts:95-101` — the zone word picks a colour. Word → colour. §8.1 §7.1 #8,
   STRUCK.
5. `src/components/context/state-primitives.tsx:160,170-178` — the planned/done bar width is
   `count ÷ max(planned, done, 1)` and "so far" is a label off `partialWeek`; the counts are the
   server's (`coach/index.ts:4241-4245`). Bar geometry, not a printed number. §8.1 §6 State #3,
   STRUCK.

### 1.3 SETTLED — a unit conversion on the phone fails the rule

**Ruling (Michael, 2026-09-15): a conversion on the phone is a unit pick, and it fails.**

Stage 1 had struck **`src/components/context/StateAdjustLens.tsx:160`** ("easy/hard pace sec/km →
/mi", §8.1 §6 State #11b) as **"unit formatting only", rank D**. That strike does not carry here:
the phone multiplies the server's seconds-per-km by 1.609344 and prints per mile, which is §1.1's
unit pick. The same applies to §1.2's formatting example 1 (`SessionNarrative.tsx` m → mi).

The evidence behind the ruling: a conversion or a label chosen on the phone is where "/100yd on a
metric plan" (§8.0 #11), "kg label on a pound value" (§8.0 #7), the checkpoint sheet's fixed "/mi"
(§8.0 #8) and the wizard's km field sent as 19 miles (§8.0 #10) all came from — **four of the twelve
rank-A metric-account errors.**

**What it means for the build:** Stage 4 moves the conversion to the server, which sends the number
already in the athlete's unit plus its label; the phone prints both and multiplies nothing. Rank D
meant "cosmetic today", not "allowed to stay" — so the 36 unit-pick hits in §1.4 stay in Rule 1's
count and are not re-classified as formatting.

### 1.4 First dry run — Rule 1, against the tree at `9b1c9171`

157 files under `src/components`, walking only expressions that reach JSX:

| category | hits | files |
|---|---|---|
| arithmetic on a fetched value | **69** | 30 |
| unit pick | **36** | 13 |
| threshold picking a printed number | **5** | 4 |
| fallback chain, 3+ rungs | **44** | 15 |
| **total** | **154** | **43 distinct** |

Heaviest files: `EffortsButton.tsx` 12 · `EffortsViewerMapbox.tsx` 9 · `CompletedTab.tsx` 4 ·
`CourseStrategyModal.tsx` 4 · `NonRaceBuilder.tsx` 3 · `StrengthLogger.tsx` 3 ·
`workout-execution/ExecutionScreen.tsx` 3.

**How that 154 was reached, so the number can be re-derived:** the raw arithmetic count before the
allowlists is 622. Excluding string concatenation, `.length`, date arithmetic, sort/map comparators,
loop indices and time division takes it to 99; excluding chart, canvas and gesture geometry takes it
to **69**. The threshold count falls from 153 to **5** once both branches are required to carry a
number. The fallback count falls from 213 to **44** once boolean chains and string rungs are
dropped. **Every one of those exclusions is in §1.1 — the allowlist is the rule, not a fudge.**

For contrast, the flat file-wide greps (no JSX requirement, no allowlists) give 435 `Math.round/
floor/ceil` lines, 1,116 numeric comparisons and 442 fallback chains. That is the number a naive
guard would report, and it is why §1.1 is written the way it is.

---

## 2. Rule 2 — every constant in a load-bearing module has a source

### 2.1 "Load-bearing", defined as a file set

| scope | path | non-test files |
|---|---|---|
| shared engine | `supabase/functions/_shared/**/*.ts` | 337 |
| the four analyzers | `supabase/functions/analyze-{running,cycling,strength,swim}-workout/**/*.ts` | 25 |
| materialize | `supabase/functions/materialize-plan/index.ts` | 1 |
| the standing-plan composer | `supabase/functions/_shared/standing-plan/**/*.ts` (27 files, already inside `_shared`) | — |
| the client resolvers | `src/lib/resolve-*.ts` | 5 |
| | **total** | **368** |

`*.test.ts` is excluded throughout: a fixture's magic numbers are the fixture.

Not load-bearing, deliberately: the plan generators outside `materialize-plan`, `scripts/`, and
every `src/components` file (those are Rule 1's problem).

### 2.2 What is checked

A **module-level numeric constant**: `const NAME = <number>;` or `export const NAME = <number>;` at
any position in a load-bearing file, with or without a type annotation.

It **passes** when, within **five lines above through two lines below** the declaration, there is
either a citation (§2.3) or an `OURS` marker. It **fails** otherwise.

**Second half of the rule:** a constant that passes on an `OURS` marker **also** needs a row in
`docs/STATE-SOURCES.md`. The lookup is: the file's basename, or a symbol named in backticks on the
`OURS` line, appears in the ledger. No row → fail with a different message ("OURS with no ledger
row"), because the fix is a ledger row, not a code comment.

### 2.3 The citation grammar — the forms already in the code

The lint accepts these and nothing else. Each is already in use; the count is repo-wide hits.

| form | example in the tree | hits |
|---|---|---|
| a bare page | `p218`, `p086`, `p107` | p246 ×212, p274 ×209, p247 ×191, p218 ×112 |
| a page range | `pp274-275`, `pp231-232` (hyphen or en dash) | `endurance-library/source-rules.ts:731` |
| the author with a page | `Viada p227`, `Viada pp274-275` | Viada ×972 |
| `FIELD —` (the ledger's own legend word) | `FIELD — TrainingPeaks EF on NGP` | 15 in `_shared` + `src/lib` |
| a vendor name | TrainingPeaks 219 · Garmin 912 · Strava 702 · intervals.icu 88 · TrainerRoad 25 · COROS 12 · Runna 10 · WKO5 | — |
| an author or formula name | Friel 155 · Daniels 59 · Brzycki 39 · Epley 35 · Coggan 28 · Karvonen 21 · Tanaka 19 · Gulati 9 · Foster 7 · Smyth & Muniz-Pumares | — |
| the corpus path | `docs/SOURCE-viada-hybrid-athlete.md` / `SOURCE-viada` | 39 |
| a ledger pointer | `STATE-SOURCES:151`, "ledger row 15" | — |
| the ours marker | `// OURS — <reason>` and the `/** OURS — … */` doc-comment form | 161 in the load-bearing set |

**A `D-NNN` reference on its own does not satisfy the rule.** A decision entry is where the choice
was recorded, not where the number came from. It counts only when the same number also has a
`STATE-SOURCES.md` row — which is the OURS path anyway.

The D-237 `/* estimate-ok: <reason>, disclosed@<file> */` annotation stays and still passes Rule 0.
It does **not** satisfy Rule 2: "this fallback is disclosed downstream" is a different claim from
"this number came from somewhere".

### 2.4 First dry run — Rule 2

368 load-bearing files, 270 module-level numeric constants:

| window | cited | OURS-marked | **BARE (fails)** | bare files |
|---|---|---|---|---|
| ±3 lines | 23 | 32 | **215** | 103 |
| **±5 lines (recommended)** | 37 | 42 | **191** | 90 |
| ±10 lines | 55 | 49 | **166** | 77 |

**Recommend ±5.** Going to ±10 only buys 25 constants and starts crediting a constant with the
citation of the one above it — the exact "loosely-paired provenance" false pass D-237 §2 warned
about.

**OURS-without-a-ledger-row:** 161 `OURS` lines across the load-bearing set; **103** have a ledger
row by the §2.2 lookup; **58 do not**, across 20 files. Those 58 are the second half of the rule's
first dry run.

So Rule 2's opening count is **191 + 58 = 249**, and Stage 5 is the stage that clears it.

---

## 3. Rule 3 — one derived field, one writer

### 3.1 The check

Whole-tree pass over `supabase/functions` (non-test). For every
`.from('<table>').update|upsert|insert({ ... })`, collect the object literal's top-level keys —
**resolving a same-file `const X = { ... }` when the argument is an identifier**, because that is
how `compute-facts` writes `workout_facts` (`index.ts:1713-1715`, via `factsRow`). A first cut
without that resolution misses the facts table entirely.

Tables watched: `workouts`, `workout_facts`, `athlete_snapshot`, `session_load`, `exercise_log`,
`workout_metadata`, `planned_workouts`, `user_baselines`.

A **step** is the edge-function directory (`supabase/functions/<step>/…`) — the deployable unit, so
two writes inside one function are one writer and two functions are two.

Second pass, for JSONB sub-keys: an assignment `computed.<key> = …` or `<x>Facts.<key> = …`.

**Fails** when one `table.column` (or `computed.<key>`) has **two or more writing steps** and the
column carries a derived number rather than plumbing.

### 3.2 Derived vs plumbing — the split that keeps this rule usable

47 columns currently have two or more writing steps. **30 are plumbing** — status, identity,
timestamps, foreign keys, ingest raw — and are allowlisted by a `plumbingColumns` list in the
config: `analysis_status`, `analysis_error`, `analyzed_at`, `summary_status`,
`summary_updated_at`, `metrics_status`, `metrics_updated_at`, `workout_status`, `updated_at`,
`created_at`, `user_id`, `planned_id`, `completed_workout_id`, `training_plan_id`, `gear_id`,
`name`, `type`, `source`, `date`, `week_number`, `day_number`, `gps_track`.

**17 carry a derived number and are the rule's fail list:**

| column | writing steps |
|---|---|
| `user_baselines.learned_fitness` | `_shared/race-feedback` · compute-facts · compute-workout-analysis · endurance-checkpoint · learn-fitness-profile · save-baselines **(6)** |
| `user_baselines.performance_numbers` | adapt-plan · compute-workout-analysis · endurance-checkpoint · save-baseline-test · save-baselines **(5)** |
| `workouts.workout_analysis` | the four analyzers **(4)** |
| `planned_workouts.strength_exercises` | create-goal-and-materialize-plan · rematerialize-standing-block · rematerialize-strength-block **(3)** |
| `planned_workouts.workload_planned` | backfill-planned-workload · backfill-strength-load · rematerialize-standing-block **(3)** |
| `workouts.duration` / `moving_time` / `elapsed_time` | ingest-phone-workout · mark-planned-complete · strava-webhook **(3 each)** |
| `workouts.distance` / `avg_heart_rate` / `max_heart_rate` / `avg_speed` | ingest-phone-workout · strava-webhook **(2 each)** |
| `workouts.computed` | analyze-cycling-workout · analyze-running-workout **(2)** |
| `workouts.weather_data` | analyze-running-workout · get-weather **(2)** |
| `workouts.workout_metadata` | compute-facts · detach-planned **(2)** |
| `planned_workouts.computed` | materialize-plan · rematerialize-standing-block **(2)** |
| `planned_workouts.duration` | materialize-plan · rematerialize-standing-block **(2)** |
| `user_baselines.configured_hr_zones` | save-imported-workout · strava-token-exchange **(2)** |

**Three of these are the same fracture Stage 3 has already been closing.** `learned_fitness` at six
writers is the one §8.1 named when the checkpoint was found writing it directly rather than through
`save-baselines`; `performance_numbers` at five is where the tested-max disagreement lived
(§8.0 #17–#20).

**`workouts.workout_analysis` with four writers is not a fracture** — one analyzer per discipline,
and a workout has one discipline. It is allowlisted as a **partitioned column**: the config carries
a `partitionedColumns` list naming the column and the reason, and the report prints it as
PARTITIONED rather than a failure. The same applies to `workouts.computed` (run and ride write
disjoint shapes) — but that one is **not** allowlisted until Stage 3 confirms the shapes really are
disjoint, because it is exactly the column the TRUTH-MAP §6 fractures live inside.

**JSONB sub-keys: 21 keys seen, 0 with two or more writers.** Clean today. The pass stays so it
cannot rot.

### 3.3 First dry run — Rule 3

**47** columns with 2+ writing steps · **30** plumbing (allowlisted) · **17** derived ·
**1** partitioned (`workout_analysis`) · **16 fail** · **0** JSONB sub-key collisions.

---

## 4. Rule 4 — WORKORDER §1 rule 7: the device's number wins

### 4.1 The check

The workorder says: "A fallback chain longer than 'sent → computed' is a flag."

Made decidable. A chain is any `??`/`\|\|` expression, taken at the top of the chain. A **rung** is
one operand, unwrapped through parentheses, `as`, `!`, and a single-argument coercion call
(`Number`, `positive`, `coerceNumber`, `fin`, `toNum`, `asNumber`, `finite`). Each rung is:

- **SENT** — a plain property or element read (`w.avg_heart_rate`, `overall?.distance_m`). Several
  SENT rungs in a row are **alias rungs** for one value under different provider spellings
  (`distance_m` / `distance_meters` / `distanceMeters`) and collapse to one.
- **COMPUTED** — a call, arithmetic, or a nested ternary.
- **LITERAL** — a numeric literal.

The chain must also name a **provider summary field**: `avg_heart_rate`, `average_heartrate`,
`max_heart_rate`, `normalized_power`, `weighted_average_watts`, `avg_power`, `average_watts`,
`avg_speed`, `average_speed`, `moving_time`, `moving_seconds`, `elapsed_time`,
`total_timer_time`, `elevation_gain`, `total_elevation_gain`, `number_of_active_lengths`,
`avg_cadence`, `average_cadence`, `distance_m`, `calories`.

**Fails when** the chain has **two or more COMPUTED/LITERAL rungs**, or **a COMPUTED/LITERAL rung
that is not last**. Both shapes mean the app works the number out more than once, or works it out
before it has finished asking whether the device sent one.

**Boolean chains are excluded** — a `\|\|` inside an `if`, a ternary condition, a `!`, or an `&&`,
and any chain with a rung that is a comparison, a `typeof`, or `includes/startsWith/test/some/
every/has`. Those are guards, not values.

### 4.2 First dry run — Rule 4

Over `supabase/functions` + `src`:

- provider-field **value** chains with 2+ rungs: **555**
- **FAIL: 42** — 32 server, 10 client, across 31 files.

Worked examples of the fail:

- `supabase/functions/import-fit-file/parse.ts:191` — five computed rungs for elevation gain
  (`pos(s.total_ascent) ?? pos(s.elevation_gain) ?? pos(s.ascent) ?? pos(s.total_elevation_gain) …`).
- `supabase/functions/analyze-running-workout/index.ts:1327,1416,3541` and
  `lib/adherence/granular-pace.ts:622` — the same four-copy ladder
  `computed.overall.duration_s_moving || (moving_time ? moving_time × 60 : …)`: a sent rung, then a
  computed one, then another.
- `supabase/functions/_shared/moving-seconds.ts:110` — `sent > computed > computed`.
- `supabase/functions/calculate-workload/index.ts:123` and `_shared/readiness.ts:585,726` —
  `Number(w.moving_time ?? w.duration) || 0`: a computed rung then a literal.
- `src/components/AssociatePlannedDialog.tsx:163` — duration rebuilt on the phone from
  `moving_time || total_timer_time || 0` divided by 60, then `|| 0` again.

**Known over-reach in this first count:** about five of the 42 are the *string* `distance` on a goal
row (`goal.distance`, `primary?.distance?.trim() || '70.3'`), not a provider number. The field list
in §4.1 should be narrowed to the numeric spellings only (`distance_m`, `distance_meters`, and
`workouts.distance` where the row is a workout), which takes the opening count to about **37**.
I have not re-run it narrowed; **42 is the measured number and ~37 is an estimate, labelled as one.**

---

## 5. Rule 5 — the composer prints no number the book does not

### 5.1 The check

Scope: `supabase/functions/_shared/standing-plan/**/*.ts`, non-test — 27 files, the composer that
§3a calls the north star.

A **number-bearing display string** is a template literal containing a digit or an interpolation, or
a string literal of more than two characters containing a digit. It **passes** with a citation or an
`OURS` marker within ±5 lines, by the same grammar as Rule 2 (§2.3). It **fails** otherwise.

This is Rule 2 pointed at strings instead of constants, and it exists separately because the
composer is where "the builder never adds a row the page does not print" is enforced — a bare number
in composer copy is a different defect from a bare constant in a formula, and it needs its own
message and its own switch-on date.

### 5.2 First dry run — Rule 5

372 number-bearing display strings · **236 cited** · **9 OURS-marked** · **127 bare (fail)**,
across 17 files.

| file | bare |
|---|---|
| `frames.ts` | 47 |
| `session-vocabulary.ts` | 20 |
| `accessory-picks.ts` | 10 |
| `compose.ts` | 8 |
| `demonstrated-history.ts` | 6 |
| `golden-block.ts` | 5 |
| `plan-row.ts` | 5 |
| `day-map.ts` · `setup-copy.ts` · `week-conflicts.ts` | 4 each |
| `restate.ts` · `test-skip.ts` | 3 each |
| the remaining 4 files | 1–2 each |

`frames.ts` at 47 is a third of the total and is the file to open first — the frames are where a
plan's shape is stated, so a bare number there is a rule the book may not have printed.

---

## 6. What the guard cannot do — stated so a green check does not overclaim

`DESIGN-D237-lint-guard.md` §2 applies unchanged and is not repeated. Added for these five rules:

- **Rule 1 does not follow a value across files.** A number computed in `src/lib` or a hook and
  handed to a component renders clean. Rule 1's scope is `src/components` because that is where
  Stage 0 and Stage 1 found the 123 PHONE flags; `src/lib` and `src/hooks` are a later widening,
  and until then the rule's honest claim is "no *new* maths in a screen file", not "no maths on the
  phone".
- **Rule 2 sees only module-level `const NAME = <number>`.** A literal inline in an expression, a
  number in an object literal or a lookup table, and a value computed from two constants are all
  invisible. The 270 constants it does see are a floor, not the population.
- **Rule 3 sees only an object literal (or a same-file `const` holding one) passed to
  update/upsert/insert.** A spread, a builder function, a `.rpc()` and a migration are invisible.
- **Rule 4 keys on the shape of the chain, not on whether the device actually sent the field.** It
  cannot tell a legitimate two-provider read (Garmin spells it one way, Strava another) from a
  rebuild — that is what the alias-rung collapse in §4.1 approximates, and it will be wrong at the
  edges in both directions.
- **None of them can see the database.** A number already stored wrong stays wrong; that is Stage 7
  and the recalculations, not this.

---

## 7. The allowlist mechanism, and the parked race path

Three mechanisms, kept distinct so the report can tell them apart. All three live in
`scripts/estimate-provenance.config.json`.

**1. `parked` — the race path and the season wizard (WORKORDER §3a).**

A list of path globs with a reason and the §3a reference. A hit inside a parked path is printed in
its own **PARKED** block, counted, and **never fails the build**. No ticket is required: the park is
the ticket. Removing a glob is how the race path reopens — one edit, and every rule starts failing
on it at once.

Seed list, all verified present in the tree:

```
src/components/ArcSetupWizard.tsx
src/components/NonRaceBuilder.tsx          (race-step rows only — see the note below)
src/components/CourseStrategyModal.tsx
src/components/GoalsScreen.tsx
src/components/AthleticRecordPage.tsx
src/components/context/StateRaceBlock.tsx
supabase/functions/course-detail/**
supabase/functions/course-strategy/**
supabase/functions/create-goal-and-materialize-plan/**
supabase/functions/_shared/race-readiness/**
supabase/functions/_shared/session-detail/race-readiness.ts
supabase/functions/_shared/recompute-goal-race-projections.ts
supabase/functions/_shared/weeks-until-race.ts
```

Covering §8.0 items 28, 33, 34, 37, 38, 39, 40 and the Stage 2 race-projection question.

⚠️ **`NonRaceBuilder.tsx` is the one file that is half parked.** It holds the parked race step
(§8.0 #39, `:1365`) *and* the live standing-plan level step (§8.0 #10, `:4388,3763,4469-4471`,
which is rank A and in scope). A whole-file park would hide a live error. So the `parked` entry for
this one file is **line-ranged**, not whole-file, and the config carries the reason on the entry.
If a line range proves too brittle to maintain, the alternative is a
`/* parked: race step, WORKORDER §3a */` comment on the block — the same annotation shape D-237
already uses. **Recommend the comment; the line numbers will drift within a week.**

**2. `plumbingColumns` / `partitionedColumns` — Rule 3 only.** §3.2. Two flat lists with a reason
per entry. Printed as ALLOWED, with a count, so the split stays visible rather than becoming a place
to hide a fracture.

**3. `knownExceptions` — acknowledged open bugs.** The existing D-237 mechanism, unchanged: file +
matched text + a **required** ticket, printed loudly as KNOWN-UNRESOLVED, not a failure. This is how
a rule can be switched to `fail` while its remaining backlog is still open — the backlog is listed
by name every run, which is the opposite of hiding it.

**And the per-rule declaration escapes**, per rule:

- Rule 1: `/* server-field: <field> */` on the line — "this expression restates a value the server
  already settled". Greppable, auditable, and a lie is visible in one grep against the server's
  field list.
- Rule 2 and Rule 5: the citation or the `// OURS —` marker **is** the escape. There is no third
  way, deliberately.
- Rule 3: `partitionedColumns` only.
- Rule 4: `/* provider-first: <field> */` where the chain is genuinely sent → computed and the
  shape only looks longer because of alias spellings.

---

## 8. What a failure looks like

```
✗ src/components/WorkoutCalendar.tsx:1333
    const miles = totalMeters / 1609.34;
    ↳ [rule 1 · unit pick] a component works out a number instead of rendering a server field.
      The server sends the value in the athlete's unit plus its label (WORKORDER §1 rule 2).
      Fix: read the server field, or /* server-field: <name> */ if this restates one.

✗ supabase/functions/_shared/standing-plan/frames.ts:412
    `${sets} × ${reps} at RPE ${rpe}`
    ↳ [rule 5] the composer prints a number with no page and no OURS marker.
      Fix: cite the page (p218), or mark // OURS — <reason> and add a row to docs/STATE-SOURCES.md.

⚠ 13 PARKED (race path / season wizard, WORKORDER §3a — not failures)
⚠ 3 KNOWN-UNRESOLVED (Q-120 ×3)
✓ 30 plumbing columns allowed · 1 partitioned column allowed
```

---

## 9. The order to switch each rule from warn to fail

Every rule lands as `warn` the day it is built — it prints, it counts, it does not block. Each one
switches to `fail` when the stage that clears its backlog reports done, and not before. Switching a
rule to `fail` with a live backlog means the next terminal's first act is to add an exception, which
is how D-237's `knownExceptions` list was almost abused into a band-aid.

| # | rule | switches to `fail` when | opening count | why this position |
|---|---|---|---|---|
| **1** | **Rule 3** (one writer) | **Stage 3 closes.** Its remaining items are Stage 3's own list. | 16 | Smallest backlog, hardest defect. `learned_fitness` at six writers and `performance_numbers` at five are the two Stage 3 has already been unpicking, so it fails almost clean the day Stage 3 reports. Nothing downstream can be trusted while two steps write one field, so this gate goes up first. |
| **2** | **Rule 4** (the device's number wins) | **Stage 3 closes**, one week behind Rule 3. | 42 (≈37 after narrowing §4.1) | Rule 7 already landed on ride power in Stage 3 session 1 (`7c49f21c`), so the pattern is proven and the fix shape is known. It follows Rule 3 rather than sharing its date because 42 hits across 31 files is a week of work, not a day, and four of them are one repeated ladder in `analyze-running-workout`. |
| **3** | **Rule 5** (the composer) | **Stage 5 clears the standing-plan files** — which can be done ahead of the rest of Stage 5. | 127 in 17 files | The composer is §3a's north star; it should be sourced before the screens are. 127 is tractable, `frames.ts` is a third of it, and the work is citation not refactor. Ahead of Rule 2 because a bare number in plan copy is worse than a bare constant in a formula. |
| **4** | **Rule 2** (every constant sourced) | **Stage 5 reports done.** | 249 (191 bare + 58 OURS-without-a-row) | This is Stage 5 restated as a build gate; it cannot precede it. The 58 missing ledger rows can be cleared first and that half switched to `fail` early, if a half-switch is wanted. |
| **5** | **Rule 1** (screens render, never compute) | **Stage 4 reports done, then Stage 7's device pass confirms no screen went blank.** | 154 across 43 files | Last, and by a distance. It is the largest backlog, the one that needs server work before a client edit is even possible (the server has to start sending the number in the athlete's unit, per the §1.3 ruling), and the only one where a wrong fix blanks a screen rather than printing a wrong number. |

**Between now and each switch**, the CI job runs every rule at `warn` on push and PR. The run
prints per-rule counts, so the backlog is a number that moves rather than a claim. Making any rule
genuinely blocking on `main` needs the branch-protection required-status-check Michael owns —
unchanged from D-237 §5b.

---

## 10. Explicitly not in this design

- Finding every existing violation and fixing it: that is Stages 3, 4 and 5.
- Repairing stored numbers: Stage 7 and the recalculations.
- Any runtime change. The guard ships zero runtime code.
- `src/lib` and `src/hooks` under Rule 1 (§6). A later widening, on its own decision.
- The race path and the season wizard (§7, WORKORDER §3a). Parked, listed, silent.

---

## Cross-refs

`docs/WORKORDER-app-one-truth-2026-09-15.md` §1, §3a, §4 Stage 6, §8 row 6 ·
`docs/DESIGN-D237-lint-guard.md` (Rule 0, and §2's reach/blind-spot section) ·
`docs/TRUTH-MAP.md` §7.8, §8.0, §8.1 · `docs/STATE-SOURCES.md` ·
`scripts/check-estimate-provenance.mjs`, `scripts/estimate-provenance.config.json`,
`.github/workflows/provenance.yml`.
