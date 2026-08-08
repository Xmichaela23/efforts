# AUDIT — plan-generator survivor census (2026-08-07)

**Read-only census.** Nothing was edited, quarantined, or deleted. The point is to stop sessions
fixing dead code: every plan-generation path below is marked **LIVE** or **RUIN** with the
`file:line` that proves it.

**Method.** Start at the real entry point (`create-goal-and-materialize-plan/index.ts`), list every
generator it invokes and the exact condition that reaches it, then grep every caller of each
generator across `supabase/functions/` **and** `src/`. A generator with no live caller is a ruin.
Then one level down: which sub-generators / builder classes are actually instantiated.

**Verification note.** Every seed fact handed to this audit was re-checked against the code. Three
were wrong or incomplete; they are corrected inline and listed in §6.

---

## 1. Entry points

There are **two** live front doors into plan generation, not one.

| # | Entry | File:line | What it builds |
|---|---|---|---|
| 1 | `create-goal-and-materialize-plan` (edge) | `supabase/functions/create-goal-and-materialize-plan/index.ts:2115` (`Deno.serve`) | goal + plan, linked, activated, caches busted. The main door. |
| 2 | **`PlanWizard` (client, direct)** | `src/components/PlanWizard.tsx:858` → `supabase.functions.invoke('generate-run-plan')` | a run plan with **no goal row and no `activate-plan` call**. Route `src/App.tsx:55` (`/plans/generate`), reachable from three places in the UI. |

Entry 2 was not in the seed facts. It is genuinely reachable:

- `src/components/PlansMenu.tsx:121` — `navigate('/plans/generate')`
- `src/components/PlansDropdown.tsx:76` — `navigate('/plans/generate')`
- `src/components/GoalsScreen.tsx:2502` — "Build a custom plan"

It sends the same two approaches as create-goal (`PlanWizard.tsx:342` `sustainable`,
`:349`/`:354` `performance_build`), so it does not reach any extra generator — but it is a second
writer of `plans` rows that bypasses the goal lifecycle entirely. Flagged, not scoped here.

---

## 2. Edge generators — the verdict table

| Generator | Verdict | Entry condition | Caller (file:line) |
|---|---|---|---|
| **`generate-run-plan`** | 🟢 **LIVE** — two callers | (a) **non-race, run-shaped**: `goal_type` capacity/maintenance AND `sport === 'run'` AND not Get-Strong | `create-goal…/index.ts:2801` (gate at `:2394` → `:2724`) |
| | | (b) **race run**: `sport === 'run'`, `combine === false`, falls through tri + non-race | `create-goal…/index.ts:3786` |
| | | (c) **client direct**: `/plans/generate` wizard | `src/components/PlanWizard.tsx:858` |
| **`generate-combined-plan`** | 🟢 **LIVE** | any path that calls `buildCombinedPlan` — non-race tri-shaped (`:2826`), tri with `combine` (`:2913`), run with `combine` (`:3530`). `combine` is set at `:2218` and forced true for every non-race goal. | `create-goal…/index.ts:1756` (inside `buildCombinedPlan`, defined `:1187`) |
| **`generate-triathlon-plan`** | 🟢 **LIVE** (legacy, but reachable) | `sport === 'triathlon'` AND **`combine === false`** — i.e. a **single** tri event goal. `combine = eventGoals.length >= 2` (`src/lib/arc-setup-persistence.ts:465`), so one 70.3 on the books routes here, not to combined. | `create-goal…/index.ts:3108` |
| **`generate-strength-plan`** | 🟢 **LIVE** | non-race goal AND `per_discipline_posture.strength === 'develop'` AND **no** endurance discipline set to `develop` (Get Stronger / D-323) | `create-goal…/index.ts:2660` (gate `:2443`) |
| **`generate-plan`** | ⛔ **RUIN** | none | **Zero callers.** Repo-wide grep outside its own directory returns only stale comments (`_shared/week-optimizer.ts:131`, docs). 71 lines, dated 2024, `serve()` from `deno.land/std@0.168.0` — it validates five input fields and returns `success: true`. It generates nothing. |

### Not plan builders (noted and skipped, as instructed)

| Function | Verdict | Note |
|---|---|---|
| `generate-overall-context` | ⛔ **RUIN (client-orphaned)** | LLM context, not a plan builder. Its only invoke is `src/hooks/useOverallContext.ts:80`, and **that hook has zero importers** — `useOverallContext` appears in exactly one file, the one that defines it. Nothing mounts it. |
| `generate-training-context` | ⛔ **RUIN** | LLM context, 3,423 lines. Self-declared orphan in its own header (`generate-training-context/index.ts:1-14`, "verified by trace 2026-07-09, Q-149"). The live weekly-context path is `coach` → `weekly_state_v1`. |

---

## 3. One level down — inside each LIVE generator

### 3.1 `generate-run-plan` — 2 of 8 generator classes are switched on

Selection is a `switch (request.approach)` at `generate-run-plan/index.ts:280`. There are exactly
two cases and the `default` returns a 400 (`:305`).

| File | Class | Verdict | Evidence |
|---|---|---|---|
| `generators/sustainable.ts:38` | `SustainableGenerator` | 🟢 **LIVE** | instantiated `index.ts:282` (`case 'sustainable'`) |
| `generators/performance-build.ts:75` | `PerformanceBuildGenerator` | 🟢 **LIVE** | instantiated `index.ts:300` (`case 'performance_build'`) |
| `generators/base-generator.ts:20` | `BaseGenerator` (abstract) | 🟢 **LIVE** | superclass of both live generators; owns `assignDaysToSessions` (`:710`) and the phase structure |
| `generators/assign-days.ts:102` | `assignDays` (fn) | 🟢 **LIVE** | imported by `base-generator.ts:14` — this is the D-2026-08-05 pin-reading placement |
| `generators/balanced-build.ts:66` | **`PerformanceBuildGenerator`** | ⛔ **RUIN + TRAP** | zero importers repo-wide; **same class name as the live one** |
| `generators/simple-completion.ts:89` | **`SustainableGenerator`** | ⛔ **RUIN + TRAP** | zero importers repo-wide; **same class name as the live one** |
| `generators/cumulative-load.ts:13` | `CumulativeLoadGenerator` | ⛔ **RUIN** | zero importers |
| `generators/hybrid-athlete.ts:12` | `HybridAthleteGenerator` | ⛔ **RUIN** | zero importers |
| `generators/time-efficient.ts:12` | `TimeEfficientGenerator` | ⛔ **RUIN** | zero importers |
| `generators/volume-progression.ts:13` | `VolumeProgressionGenerator` | ⛔ **RUIN** | zero importers |

Corroborating signal: all six ruins carry an mtime of **Mar 2**; all four survivors are **Aug 6**.

**Approaches declared vs implemented:** `APPROACH_CONSTRAINTS` (`generate-run-plan/types.ts:387`)
declares exactly `sustainable` and `performance_build`. No orphaned approach string — the six dead
classes are unreachable by name, not by a dead switch case.

**Strength overlay:** `overlayStrengthLegacy` (`strength-overlay.ts:715`) is the live path, called
at `index.ts:345`. `overlayStrength` (`strength-overlay.ts:245`) is **imported at `index.ts:24` and
never called there** — it is reached only from inside `overlayStrengthLegacy:731`. Live function,
dead import. Cosmetic, but it makes the import line read as if two overlays are in play.

### 3.2 `generate-combined-plan` — no ruins inside it

Every non-test module in `generate-combined-plan/` has at least one non-test importer. The pipeline
from `index.ts:60`:

`phase-structure.ts` → `week-builder.ts` (`buildWeek`) → `session-factory.ts` → `validator.ts` /
`validate-training-floors.ts` → `drill-token-harvest.ts` → `classify-error.ts`, with
`science.ts`, `swim-protocol-v21.ts`, `swim-protocol-volumes.ts`, `swim-tri-safety.ts` and
`reconcile-athlete-state-week-optimizer.ts` alongside. This is the only generator wired to
`_shared/week-optimizer.ts`.

### 3.3 `generate-triathlon-plan` — one class, two approaches

| File | Verdict | Evidence |
|---|---|---|
| `generators/tri-generator.ts:187` `TriathlonGenerator` | 🟢 **LIVE** | instantiated `generate-triathlon-plan/index.ts:18` (import) |
| `validation.ts`, `types.ts` | 🟢 LIVE | imported by `index.ts:15/:17` |

`base_first` vs `race_peak` are **branches inside the one class** (`tri-generator.ts:406`, `:772`,
`:871`, `:956`, `:1017`), not separate builders. Nothing orphaned here.

### 3.4 `generate-strength-plan` — one composer

`generate-strength-plan/index.ts` imports exactly three things (`:13-15`):

| Module | Verdict |
|---|---|
| `shared/strength-system/strength-primary-plan.ts` (`composeStrengthPrimaryPlan`) | 🟢 **LIVE** — the whole Get Stronger composer |
| `shared/strength-system/barbell-maxes.ts` | 🟢 LIVE — shared with the create-goal entry gate (`create-goal…:2474`) |
| `src/lib/resolve-current-run-pace.ts` | 🟢 LIVE |

One level below `strength-primary-plan.ts`: `place-week.ts` (`:63`), `loading/wendler-531.ts`
(`:53`), `_shared/schedule-session-constraints.ts`, `_shared/week-optimizer.ts` — all live.
`loading/cycle-verdicts.ts` is live via `create-goal…:2560` and `rematerialize-strength-block`.

**Protocol registry** (`shared/strength-system/protocols/selector.ts:277-293`) — all nine protocol
IDs resolve to a real module, all nine modules are reachable through the selector:
`upper_aesthetics`, `durability`, `neural_speed`, `minimum_dose`, `triathlon`,
`triathlon_performance`, `five_by_five`, `strength_focus_build`, `strength_focus_power`.
`protocols/db-prescription.ts` has no direct importer from a generator but is pulled in by
`protocols/triathlon_performance.ts` — **live**.

Note: `strength-arc.ts` is consumed only by `generate-run-plan/strength-overlay.ts`, i.e. the
**run** path, not the Get Stronger path. Live, but not where the name suggests.

`placement/simple.ts` (`simplePlacementPolicy`) is live for run-only plans via
`generate-run-plan/strength-overlay.ts:631` only — its own header (`:1-15`) says so, and the tri
paths do not reach it.

---

## 3.5 THE TWO `SustainableGenerator` FILES — exact paths

There are exactly two files in the repo exporting a class named `SustainableGenerator`. Both live
under `generate-run-plan/generators/`. One builds every completion run plan in the app; the other
has not been imported by anything since March.

### 🟢 LIVE — this is the one to edit

```
supabase/functions/generate-run-plan/generators/sustainable.ts
```

- Class declared at **`sustainable.ts:38`** — `export class SustainableGenerator extends BaseGenerator`
- Imported at **`generate-run-plan/index.ts:22`**
- Instantiated at **`generate-run-plan/index.ts:282`** (`case 'sustainable'` of the switch at `:280`)
- **841 lines**, mtime **Aug 6**
- Also imported by seven live test files in `generate-run-plan/` (`race-week.test.ts:16`,
  `pace-ladder.test.ts:103`, `e3a-zones.test.ts:5`, `e3b-budget.test.ts:6`,
  `race-anchored-long-run.test.ts:12`, `retest-tail.test.ts:4`, `retest-behavior.test.ts:4`)

### ⛔ RUIN — do not edit; edits here ship nothing

```
supabase/functions/generate-run-plan/generators/simple-completion.ts
```

- Class declared at **`simple-completion.ts:89`** — same name, `SustainableGenerator`
- **Zero importers.** Repo-wide grep for `generators/simple-completion` returns exactly one hit and
  it is a comment (`src/lib/run-volume-tables.ts:27`)
- **457 lines**, mtime **Mar 2**
- All twelve of its methods also exist on the live class (§4, Trap 1)

### ⚠️ The 1,249-line ruin is a *different* file, and a different class

The 1,249-line corpse is **not** a `SustainableGenerator` — it is the
`PerformanceBuildGenerator` twin:

```
supabase/functions/generate-run-plan/generators/balanced-build.ts     ← 1,249 lines, RUIN
supabase/functions/generate-run-plan/generators/performance-build.ts  ← 2,337 lines, LIVE
```

- Ruin: `balanced-build.ts:66` declares `export class PerformanceBuildGenerator`. Zero importers. mtime Mar 2.
- Live: `performance-build.ts:75` declares the same class name. Imported `index.ts:23`, instantiated `index.ts:300`. mtime Aug 6.

So there are **two separate collisions**, one per approach — not one collision with a big file:

| Approach | LIVE file | RUIN file (same class name) |
|---|---|---|
| `sustainable` | `generators/sustainable.ts:38` (841 ln) | `generators/simple-completion.ts:89` (457 ln) |
| `performance_build` | `generators/performance-build.ts:75` (2,337 ln) | `generators/balanced-build.ts:66` (1,249 ln) |

---

## 3.6 TRAPS / DO-NOT-EDIT — every ruin path in the census

Copy-paste list. Nothing here is imported by anything that runs. **None of it was deleted.**

**Dead generator classes (all under `supabase/functions/generate-run-plan/generators/`):**

```
supabase/functions/generate-run-plan/generators/simple-completion.ts    ⛔ class SustainableGenerator      (:89)  — COLLIDES with live sustainable.ts:38
supabase/functions/generate-run-plan/generators/balanced-build.ts       ⛔ class PerformanceBuildGenerator (:66)  — COLLIDES with live performance-build.ts:75
supabase/functions/generate-run-plan/generators/cumulative-load.ts      ⛔ class CumulativeLoadGenerator    (:13)
supabase/functions/generate-run-plan/generators/hybrid-athlete.ts       ⛔ class HybridAthleteGenerator     (:12)
supabase/functions/generate-run-plan/generators/time-efficient.ts       ⛔ class TimeEfficientGenerator     (:12)
supabase/functions/generate-run-plan/generators/volume-progression.ts   ⛔ class VolumeProgressionGenerator (:13)
```

**Dead edge functions:**

```
supabase/functions/generate-plan/index.ts                 ⛔ 71-line validator, zero callers, named like THE generator
supabase/functions/generate-training-context/index.ts     ⛔ 3,423 lines, self-declared orphan (:1-14)
```

**Live-but-not-what-the-name-suggests (edit with care, do not assume):**

```
supabase/functions/generate-overall-context/              ⚠️ LIVE function, but its only invoke is src/hooks/useOverallContext.ts:80 and that hook has ZERO importers — it never fires
supabase/functions/generate-combined-plan/science.ts:110  ⚠️ a SECOND resolveRunEasyPace; the live one is src/lib/resolve-current-run-pace.ts:164
supabase/functions/generate-run-plan/index.ts:24          ⚠️ imports overlayStrength but never calls it — only overlayStrengthLegacy (:345) is called
```

**DO NOT touch these four — they look like infrastructure but they ARE the run engine:**

```
supabase/functions/generate-run-plan/generators/sustainable.ts        🟢 LIVE
supabase/functions/generate-run-plan/generators/performance-build.ts  🟢 LIVE
supabase/functions/generate-run-plan/generators/base-generator.ts     🟢 LIVE — superclass of both
supabase/functions/generate-run-plan/generators/assign-days.ts        🟢 LIVE — day placement, imported base-generator.ts:14
```

---

## 3.7 THE LIVE MARATHON PATH, END TO END

The trace for a **marathon race goal, completion intent** (`training_prefs.goal_type` resolving to
`complete` → `approach: 'sustainable'`). Every hop verified against the code.

### Step 1 — routing (`create-goal-and-materialize-plan/index.ts`)

| # | What | File:line |
|---|---|---|
| 1 | HTTP entry | `create-goal…/index.ts:2115` (`Deno.serve`) |
| 2 | `combine` resolved (false for a single race goal — `eventGoals.length >= 2` is the gate, `src/lib/arc-setup-persistence.ts:465`) | `create-goal…:2218` |
| 3 | Non-race short-circuit **not** taken (`resolvedIsNonRace === false`) | `create-goal…:2394` |
| 4 | Tri path **not** taken (`sport === 'run'`) | `create-goal…:2854` |
| 5 | Combined path **not** taken (`combine === false`) | `create-goal…:3530` |
| 6 | **`approach` chosen** — `goalType === 'complete'` → `'sustainable'`; otherwise `'performance_build'` | `create-goal…:3596-3598` |
| 7 | `days_per_week` band resolved (`${n-1}-${n}`, athlete's number is the MAX) | `create-goal…:3628` |
| 8 | request body assembled | `create-goal…:3636` (`generateBody`) |
| 9 | **invoke `generate-run-plan`** | `create-goal…:3786` |
| 10 | link plan → goal, `activate-plan`, retire competitors, bust caches | `create-goal…:3824` onward |

### Step 2 — generator selection (`generate-run-plan/index.ts`)

| # | What | File:line |
|---|---|---|
| 11 | HTTP entry | `generate-run-plan/index.ts:51` |
| 12 | `validateRequest` | `generate-run-plan/validation.ts` (imported `:21`) |
| 13 | `generatorParams` built (incl. `preferred_days` passthrough) | `generate-run-plan/index.ts:265-275` |
| 14 | **`switch (request.approach)`** | `generate-run-plan/index.ts:280` |
| 15 | **`new SustainableGenerator(generatorParams)`** | `generate-run-plan/index.ts:282` → **`generators/sustainable.ts:38`** |
| 16 | `generator.generatePlan()` | `index.ts:283` → `sustainable.ts:39` |
| 17 | `generator['determinePhaseStructure']()` | `index.ts:284` → `base-generator.ts:288` |
| 18 | strength overlay (only if `strength_frequency > 0`) | `index.ts:345` `overlayStrengthLegacy` → `strength-overlay.ts:715` |
| 19 | `addTimingLogic` | `index.ts:375` → `timing-logic.ts` |
| 20 | `validatePlanSchema` / `validateTokens` / `detectScheduleConflicts` | `index.ts:379` / `:393` / `:399` |
| 21 | preview short-circuit — **returns `plan_id: null`, writes nothing** | `index.ts:448-450` |
| 22 | persist | `index.ts:456` `.from('plans').insert(...)` |

### Step 3 — which file builds the week: `generators/sustainable.ts`

Per week, `1 … duration_weeks` (loop at `sustainable.ts:58`):

| # | Method | File:line | What it does |
|---|---|---|---|
| 23 | `determinePhaseStructure()` | `base-generator.ts:288` | phases + `recovery_weeks` |
| 24 | peak-week de-deload | `sustainable.ts:51-56` | strikes the peak long-run week out of `recovery_weeks` |
| 25 | `getCurrentPhase()` / `isRecoveryWeek()` | `base-generator.ts:465` / `:478` | |
| 26 | **`generateWeekSessions()`** | **`sustainable.ts:137`** | the week builder |
| 27 | `getRunningDaysForWeek()` | `base-generator.ts:687` | week-specific day count (band MAX on build weeks, MIN on cutbacks) |
| 28 | `calculateWeeklyMileage()` | `sustainable.ts:421` | weekly target (legacy tables — the budgeted branch `budgetWeeklyMiles():829` is non-race only) |
| 29 | `getLongRunMiles()` | `sustainable.ts:557` | this week's long run, off the arc |
| 30 | `resolveLongRunArc()` | `sustainable.ts:528` → `buildLongRunArc` **`src/lib/run-volume-tables.ts:286`** | the prescriptive arc; peak week from `longRunPeakWeek` (`run-volume-tables.ts:219`) |
| 31 | `marathonPrerequisite()` | `sustainable.ts:511` → `marathonPrerequisiteFor` **`run-volume-tables.ts:530`** | the assumed base, stated on the plan by `generatePlanDescription():110` |
| 32 | `checkWeekRaceProximity()` | `sustainable.ts:225` | per-day proximity; any day ≤7 out flips the week to race-week |
| 33 | `createSimpleLongRun()` | `sustainable.ts:626` | |
| 34 | `createOptionalSpeedwork()` | `sustainable.ts:646` | week ≥3 and ≥4 running days, not recovery, not a rested terminal |
| 35 | `fillWithSimpleEasyRuns()` | `sustainable.ts:715` | easy ∈ [3,5] mi on ≤3 slots |
| 36 | `generateWeeklySummary()` | `base-generator.ts:850` | |

### Step 4 — where the race day is placed

Two different placement mechanisms, and the race week deliberately uses neither of the normal one:

| # | What | File:line |
|---|---|---|
| 37 | **Normal weeks** — `assignDaysToSessions()` | `sustainable.ts:218` → `base-generator.ts:710` → **`generators/assign-days.ts:102`** (`assignDays`) |
| 38 | pins read: `preferred_days.long_run` (default Sunday) / `.quality_run` | `assign-days.ts:103-104` |
| 39 | rest day **derived** as the day before the long run | `assign-days.ts:136` (`dayBeforeLongRun`, `:77`) |
| 40 | **Race week** — `generateRaceWeekSessions()` | **`sustainable.ts:251`**, entered from `sustainable.ts:165` when `checkWeekRaceProximity().hasRaceWeekSessions` |
| 41 | proximity bands that define race week (`race` ≤0d, `shakeout` ≤1d, `easy_short` ≤4d, `easy_medium` ≤7d, `reduced_quality` ≤14d) | `base-generator.ts:88-96` |
| 42 | **RACE DAY created** — `createCompletionRaceDay(day)` | **`sustainable.ts:398`**, pushed at **`sustainable.ts:286`** on the day whose proximity is `'race'` |
| 43 | race-day token is the **distance** (`long_run_miles(miles)`), duration derived from `enduranceEasyPaceMinPerMile()` — not the tier constant | `sustainable.ts:389-396` |
| 44 | anchors claim slots first (shakeout `:289`, Sunday long run `:293`), filler takes what's left in day order `:313` | `sustainable.ts:279-360` |
| 45 | race week **bypasses `assignDaysToSessions`** — it is already day-assigned; it just sorts Monday-first | `sustainable.ts:363-365` |

**Race day on the completion path is `createCompletionRaceDay` (`sustainable.ts:398`) and nothing
else.** `performance-build.ts:833` has its own `createRaceDaySession` for the time-goal path — a
different method, different file, different copy (M-pace targeted). The ruins
`simple-completion.ts` and `balanced-build.ts` each carry their own `generateRaceWeekSessions`
(`:229` / `:249`) that no marathon ever reaches.

---

## 4. Wasteland traps — name collisions between live and dead files

These are the ones that will silently waste a session. Editing the corpse compiles, passes nothing,
and changes no athlete's plan.

### Trap 1 — `SustainableGenerator` exists twice

| | File:line | Status |
|---|---|---|
| LIVE | `generate-run-plan/generators/sustainable.ts:38` | instantiated at `index.ts:282` |
| RUIN | `generate-run-plan/generators/simple-completion.ts:89` | zero importers |

**All twelve** methods on the dead class also exist on the live one:
`generatePlan`, `generatePlanName`, `generatePlanDescription`, `generateWeekSessions`,
`checkWeekRaceProximity`, `generateRaceWeekSessions`, `calculateWeeklyMileage`, `getLongRunMiles`,
`createSimpleLongRun`, `createOptionalSpeedwork`, `createSimpleEasyRun`, `fillWithSimpleEasyRuns`.
A grep for any of those names returns the corpse first (alphabetically `simple-completion` precedes
`sustainable` in most listings).

### Trap 2 — `PerformanceBuildGenerator` exists twice (NOT in the seed facts)

| | File:line | Status |
|---|---|---|
| LIVE | `generate-run-plan/generators/performance-build.ts:75` | instantiated at `index.ts:300` |
| RUIN | `generate-run-plan/generators/balanced-build.ts:66` | zero importers |

Shared method names include `generatePlan`, `generateWeekSessions`, `checkWeekRaceProximity`,
`generateRaceWeekSessions`, `isShortPlan`, `calculateStartingLongRun`, `createBaseIntervalSession`,
`createBaseCruiseSession`, `getDaysPerWeekMultiplier`, `calculateWeeklyMileage`, `getLongRunMiles`,
`calculateStateAwareLongRun`, `getBaseLongRunDistance`, `getMileageIncrease`, `getTaperWeeks`.

This trap is worse than Trap 1 because `balanced-build.ts` is 1,249 lines of plausible marathon
periodization — it reads like the real thing.

### Trap 3 — `assignDaysToSessions` resolves in six files

`base-generator.ts:710` defines it; six subclasses call `this.assignDaysToSessions(...)` —
`sustainable.ts:218` and `performance-build.ts:200` (live) plus `balanced-build.ts:216`,
`cumulative-load.ts:116`, `simple-completion.ts:196`, `volume-progression.ts:128` (ruins).
`hybrid-athlete.ts:266` defines its own `assignDaysToSessionsWithStrength`. A grep-and-edit sweep
over "day placement" hits four corpses out of seven hits.

### Trap 4 — `generate-plan` is named like the generator and is a validator

71 lines, no generation, zero callers. The most guessable directory name in `supabase/functions/`.

### Trap 5 — two functions named `resolveRunEasyPace`

Already on record (`CAPABILITY-MAP.md:39`): the live one is
`src/lib/resolve-current-run-pace.ts:164` (`resolveCurrentRunEasyPace`); the starved twin is
`generate-combined-plan/science.ts:110`. Repeated here because it sits inside a LIVE generator, so
"it's in the live file" is not sufficient evidence that a function is the one in use.

### Trap 6 — `generate-training-context` reads like the live coach path

3,423 lines, self-declared orphan. The live path is `coach` → `weekly_state_v1`.

---

## 5. What is NOT a generator (boundary, so the census is closed)

`materialize-plan`, `adapt-plan`, `activate-plan`, `rematerialize-strength-block`, `end-plan`,
`pause-plan`, `resume-plan`, `ensure-planned-ready` all mutate or expand an existing plan. They
were not classified here. `planning-context` builds the request body shape and generates nothing.

---

## 6. Seed facts — corrections

| Seed claim | Verdict |
|---|---|
| create-goal invokes run / combined / tri / strength | ✅ **confirmed**, all four, line numbers in §2 |
| `generate-plan` is not invoked by create-goal; confirm nothing else calls it | ✅ **confirmed dead** — zero callers repo-wide |
| Only `SustainableGenerator` + `PerformanceBuildGenerator` are instantiated (index.ts ~282/300) | ✅ **confirmed**, exactly those lines |
| "the other 8 files in `generators/` appear dead" | ❌ **wrong — 6, not 8.** `base-generator.ts` (superclass of both survivors) and `assign-days.ts` (the pin-reading placement, imported at `base-generator.ts:14`) are **LIVE**. Deleting either kills every run plan in the app. |
| `simple-completion.ts` is a ruin and a trap sharing method names with `sustainable.ts` | ✅ **confirmed**, and it is worse than described: the **class name** collides too, not just methods |
| (not in seeds) | ➕ **`balanced-build.ts` is a second class-name collision** — `PerformanceBuildGenerator` |
| (not in seeds) | ➕ **`PlanWizard.tsx:858` is a second live caller of `generate-run-plan`** that bypasses create-goal, writes a plan with no goal, and never calls `activate-plan` |
| (not in seeds) | ➕ `generate-overall-context` is invoked only by a hook (`useOverallContext`) that **nothing imports** |
| "the 1,249-line ruin is a `SustainableGenerator`" (asked 2026-08-07) | ❌ **two different files.** The 1,249-line ruin is `balanced-build.ts` and its class is **`PerformanceBuildGenerator`**. The `SustainableGenerator` ruin is `simple-completion.ts` — **457 lines**. Both collisions are laid out with full paths in §3.5. |

---

## 7. Quarantine candidates (NOT actioned — separate gated decision)

Listed for whoever takes that decision; **nothing was deleted or moved**.

1. `generate-run-plan/generators/balanced-build.ts` — 1,249 lines, class-name collision
2. `generate-run-plan/generators/simple-completion.ts` — 457 lines, class-name collision
3. `generate-run-plan/generators/cumulative-load.ts`
4. `generate-run-plan/generators/hybrid-athlete.ts`
5. `generate-run-plan/generators/time-efficient.ts`
6. `generate-run-plan/generators/volume-progression.ts`
7. `generate-plan/` — whole directory, 71 lines
8. `generate-training-context/` — 3,423 lines (already flagged in POLISH-PUNCH-LIST)

The two collisions (1, 2) are the highest-value removals: they are the only ruins that can be
edited by mistake while believing the edit shipped.
