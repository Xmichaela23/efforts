# UI-MAP — Non-race builder surfaces (read-only audit)

Audit date: 2026-06-28. Scope: map the two non-race builder UIs, their reachability, and their
submit paths; then a merge analysis. **No code was changed.** All citations are `file:line` against
the working tree at audit time.

There are two distinct non-race intake surfaces in the tree:

1. **`NonRaceBuilder`** — the older goal-first wizard ("Cuts A–G"). Live route, complete submit path,
   but **no UI entry point**.
2. **`non-race/non-race-intake-steps.tsx`** (`TimeAllocationStep` + `PlacementStep`) — a newer, richer
   time-budget / placement intake backed by `src/lib/non-race-intake.ts`. **Imported nowhere; purely
   presentational components with no host wizard.**

---

## UI 1 — `NonRaceBuilder` (older, "Cuts A–G")

File: `src/components/NonRaceBuilder.tsx` (default export, `NonRaceBuilder.tsx:134`).
Page wrapper: `src/pages/NonRaceBuilderPage.tsx` (`:18` renders `<NonRaceBuilder />`).

### 1.1 What it collects

State shape: `NonRaceBuilder.tsx:79-91`. Steps: `goal → posture → commitment → length → schedule →
confirm` (`getSteps`, `NonRaceBuilder.tsx:95-97`).

| Field | What the user picks | Cite |
|---|---|---|
| `goal` | One of 6 non-race goal IDs: `build_endurance`, `build_speed`, `get_stronger`, `build_muscle`, `maintain`, `starting_over` | step UI `NonRaceBuilder.tsx:195-219`; options `GOAL_ORDER` `:43-45` |
| `discipline` | Sub-choice (swim/bike/run) shown only when the goal needs one (`GOALS_NEEDING_DISCIPLINE` = build_endurance / build_speed / starting_over) | `:208-217`, `:179-181`; list `non-race-goal-seeds.ts:33` |
| `posture` | Per-discipline `develop` / `maintain` / `out` for each of the athlete's real disciplines (swim/bike/run/strength). Seeded from the goal, user-editable. Two-discipline "develop" ceiling enforced in the UI (`canSetDevelop`, `TWO_BUILD_CEILING`) | step `:221-279`; ceiling note `:272-276` |
| `strengthProtocol` | Strength developer pick, shown only when `strength = develop` (options from `strengthDevelopersFor(equipmentTier)`) | `:253-268` |
| `commitment` | Sustainability tier (`COMMITMENT_TIERS`), maps to `≈ N h/wk` via `hoursForTier` | `:281-302` |
| `targetWeeks` | Block length slider, `floorForGoal(goal)`–52 weeks (floor is the goal's science minimum) | `:304-323` |
| `daysPerWeek` | 4 / 5 / 6 / 7 | `:332-342` |
| `longRunDay` | Day picker, shown if run posture present | `:343-348` |
| `longRideDay` | Day picker, shown if bike posture present | `:349-354` |
| `anchorDiscipline` + `anchorDay` | Optional "keep one fixed hard session" (a club run/ride) — run or bike + a day | `:355-384` |
| confirm | Review screen; "Build plan" button | `:389-421` |

Seeding context comes from the Arc: real disciplines from declared baselines
(`athleteDisciplinesFromBaselines`, `:140-143`) and an equipment tier derived from Arc strength chips
(`equipmentTierFromArc`, `:69-77`). Picking a goal re-seeds posture + default strength protocol +
raises `targetWeeks` to the goal floor (`reseed`, `:158-167`).

### 1.2 Where it's imported

- `src/pages/NonRaceBuilderPage.tsx:3` imports the component.
- `src/App.tsx:23` imports the page.
- No other importers. (grep `NonRaceBuilder` across `src/` returns only these + the definition.)

### 1.3 Route

`src/App.tsx:57` — `<Route path="/goals/build" element={<NonRaceBuilderPage />} />`. The page redirects
to `/` if there's no stored user id (`NonRaceBuilderPage.tsx:12-16`).

### 1.4 Reachability from GoalsScreen

**No link found.** `src/components/GoalsScreen.tsx` never references `/goals/build`, `NonRaceBuilder`,
or any non-race builder string (grep returns nothing). The only `navigate(...)` targets in GoalsScreen
are `/arc-setup` (`:2235`), `/plans/generate` (`:2313`), `/plans/catalog` (`:2314`), and `/connections`
(`:2340`). The repo-wide grep for `goals/build` returns only the route definition in `App.tsx:57` — no
navigator anywhere.

The "Add Goal" sheet (`GoalsScreen.tsx:2298-2311`) offers three options — `event`, `capacity`
("Improve a metric — get faster, stronger, or build endurance"), `maintenance` — and each opens an
**inline form** (`setShowEventForm` / `setShowCapacityForm` / `setShowMaintenanceForm`,
`:2303-2304`), **not** the NonRaceBuilder. So the conceptual "non-race / capacity" goal the builder was
designed for is today served by GoalsScreen's own inline capacity/maintenance forms, and `/goals/build`
is reachable only by typing the URL.

This matches the builder's own header comment, which says the GoalsScreen entry button "lands … in a
later cut" (`NonRaceBuilderPage.tsx:6-8`) — i.e. the entry point was never wired.

### 1.5 What it does on submit

`handleConfirm` (`NonRaceBuilder.tsx:188`) calls `complete(assemblePayload(state, equipmentTier))`.

`assemblePayload` (`:101-132`) builds an `ArcSetupPayload` with one goal:
- `goal_type` ← `derivePlanShape(...).goal_type` (`capacity` if any discipline develops, else
  `maintenance`)
- `sport` ← `derivePlanShape(...).sport` (from posture: all-3 endurance → `triathlon`, else
  run>bike>swim precedence)
- `target_date: null`, `target_weeks: state.targetWeeks`, `priority: 'A'`, `distance: null`
- `training_prefs`: `training_intent: 'completion'`, `fitness: 'intermediate'`, `days_per_week`,
  `strength_frequency: 2`, `weekly_hours_available: hoursForTier(commitment)`,
  **`per_discipline_posture: state.posture`**, `preferred_days: buildPreferredDays(...)`, and
  `strength_protocol` when present.

`complete` is `useArcSetupComplete().complete` (`src/hooks/useArcSetupComplete.ts`). It:
1. `persistArcSetup(payload)` → inserts the goal(s) (`useArcSetupComplete.ts:114`).
2. `buildCompleteContext(...)` (`:120`).
3. Invokes **`create-goal-and-materialize-plan`** with `mode: 'build_existing'`, `existing_goal_id`,
   `combine`, optional `replace_plan_id` / `goal` / `plan_start_date` (`:155-162`).
4. Navigates to `/goals` with `seasonPlanJustBuilt` state on success (`:204-214`).

So the builder shares the **same Arc setup completion + `create-goal-and-materialize-plan` pipeline**
the season wizard uses.

### 1.6 Does it feed the run non-race retest path?

**Yes — it feeds the same `create-goal-and-materialize-plan` path with `goal_type: capacity`,
`sport: run`** for a runner building endurance/speed, not an older/different path.

Trace: `derivePlanShape` (`non-race-goal-seeds.ts:137-150`) returns `goal_type: 'capacity'` when any
posture is `develop`, and `sport` from `sportFromPosture` (`:99`) which yields `'run'` when run is the
only present endurance discipline. `assemblePayload` puts those onto the goal
(`NonRaceBuilder.tsx:111-113`), and `useArcSetupComplete.complete` ships it to
`create-goal-and-materialize-plan` (`useArcSetupComplete.ts:155-162`). That is the run-capacity
non-race goal contract — the retest path — not a bespoke/legacy generator call.

OPEN THREAD (T-1): I confirmed the *client* payload shape and call site, but did not trace inside
`create-goal-and-materialize-plan` to confirm how `goal_type: capacity` + `sport: run` +
`per_discipline_posture` are consumed end-to-end into the retest plan (server-side). The claim "feeds
the run non-race retest path" is verified at the call boundary; the server consumption of
`per_discipline_posture` / `strength_protocol` was not re-verified in this pass.

---

## UI 2 — `non-race/non-race-intake-steps.tsx` (newer time-budget / placement intake)

File: `src/components/non-race/non-race-intake-steps.tsx`. Exports two `StepLayout` steps:
`TimeAllocationStep` (`:37`) and `PlacementStep` (`:156`). Logic backend: `src/lib/non-race-intake.ts`.

It is the **only** file in `src/components/non-race/` (`ls` confirms a single file).

### 2.1 What it collects

**Layer 1 — `TimeAllocationStep`** (`AllocationValue = { budgetHrs, program, runLeanPct }`, `:35`):

| Field | What the user picks | Cite |
|---|---|---|
| `budgetHrs` | Weekly time budget slider, 4–20 h, step 0.5 — the hard cap for the whole week | `:64-68` |
| `program` | Strength program: `five_by_five` / `durability` / `hypertrophy` / `minimum_dose` (each with a fixed hour cost reserved off the top) | options `:21-26`, picker `:77-96` |
| `runLeanPct` | Single fader leaning the remaining endurance time between run (100%) and ride (0%); hidden when `showRideLean=false` for single-discipline goals | `:109-124`, prop `:45-46` |

Derived live by `allocateTime(budgetHrs, program, runLeanPct)` (`:48`): strength reserved off the top,
remainder = endurance, leaned run/ride, with a **warning** when endurance drops below
`MIN_ENDURANCE_HRS` (2h) — `non-race-intake.ts:47-69`. Continue is gated on `a.warning === null`
(`:55`).

**Layer 2 — `PlacementStep`** (`PlacementValue = { activeDays: boolean[], longDay: number }`, `:145`):

| Field | What the user picks | Cite |
|---|---|---|
| `activeDays` | 7-day toggle grid — which days the athlete can train | `:183-197` |
| `longDay` | Long-session day select (Sat / Sun / Fri / Wed offered) | `:201-212`; choices `LONG_DAY_CHOICES` `:154` |

Derived live by `placeWeek(activeDays, longDay)` (`:164`): the engine assigns ONE quality-endurance day
and ONE heavy-strength day under the interference rules (heavy never the day before a quality run, never
before/on the long day; quality not adjacent to long), surfacing a forced-compromise `interference`
flag when availability is too tight — `non-race-intake.ts:101-138`. The placed week is rendered as a
read-back list (`:214-235`).

### 2.2 Where it's imported

**Imported NOWHERE.** grep for `TimeAllocationStep`, `PlacementStep`, `non-race-intake-steps`,
`AllocationValue`, `PlacementValue` across `src/` returns **only** the definitions inside
`non-race-intake-steps.tsx` itself. No host wizard, no page, no route consumes these components.

The logic module `src/lib/non-race-intake.ts` is imported only by:
- `non-race-intake-steps.tsx:7-15` (the unmounted UI), and
- `src/lib/non-race-intake.test.ts` (Deno tests).

`allocateTime` / `placeWeek` appear nowhere else in `src/` (grep confirms).

### 2.3 Route

**None.** No route renders these steps; no page imports them.

### 2.4 Reachability from GoalsScreen

**No link found.** GoalsScreen has zero references to the intake steps, `TimeAllocation`, `Placement`,
or `non-race-intake`. There is no path from the goals UI (or anywhere else) to mount them.

### 2.5 What it does on submit

**Nothing.** The components expose `onContinue` callbacks (`:44`, `:162`) but no caller wires them, and
they never call `complete`, `create-goal-and-materialize-plan`, or any persistence. `allocateTime` /
`placeWeek` outputs are computed and rendered for display only.

**The new intake's logic (`non-race-intake.ts` `allocateTime` / `placeWeek`) is currently connected to
NO plan-generation payload.** It is purely presentational / test-covered right now. Nothing maps
`budgetHrs`, `program`, `runLeanPct`, `activeDays`, or `longDay` into any goal `training_prefs` or
edge-function call.

---

## Merge analysis

### 3.1 Field-by-field side-by-side

| Concern | `NonRaceBuilder` (UI 1) | Intake steps (UI 2) |
|---|---|---|
| Goal type (6 named goals) | ✅ `goal` picker | ❌ (assumes goal chosen upstream) |
| Discipline sub-choice | ✅ when goal needs it | ❌ |
| Per-discipline posture (develop/maintain/out) | ✅ full matrix + 2-develop ceiling | ❌ (no posture; implied by run-lean only) |
| Strength program / protocol | ✅ developer pick (equipment-aware) when strength develops | ✅ 4 programs (5×5 / durability / hypertrophy / minimum_dose) with hour cost |
| Time commitment | ✅ qualitative tier → `≈ h/wk` | ✅ explicit `budgetHrs` slider (hard cap) |
| Strength time reserved off budget | ❌ (fixed `strength_frequency: 2`) | ✅ `STRENGTH_PROGRAM_HRS` reserved off the top, with overcommit warning |
| Run/ride time split | ❌ | ✅ `runLeanPct` fader → run/ride hours |
| Block length (weeks) | ✅ slider, goal-floored | ❌ |
| Days per week | ✅ 4–7 count | ✅ explicit 7-day availability grid (per-day) |
| Long day(s) | ✅ long-run + long-ride day pickers | ✅ single `longDay` select |
| Fixed/anchor hard session | ✅ optional anchor discipline + day | ❌ |
| Heavy-strength placement vs interference | ❌ (defers to server optimizer) | ✅ client-side `placeWeek` with interference flagging + read-back |
| Submits / persists | ✅ `create-goal-and-materialize-plan` | ❌ nothing |
| Reachable in app | ❌ route only, no link | ❌ not even routed |

### 3.2 What each has that the other lacks

**UI 1 (NonRaceBuilder) uniquely has:** the *goal taxonomy* (6 goals), the *per-discipline posture
matrix* with the two-develop interference ceiling, *block length in weeks*, the *anchor/fixed-session*
concept, equipment-aware strength-developer selection, and — critically — a **working submit** to the
real plan pipeline.

**UI 2 (intake steps) uniquely has:** an explicit *time budget* (hours, hard cap) with *strength
reserved off the top* and an *overcommit warning*; a *run/ride lean fader*; a *full 7-day availability
grid* (vs a count); and a *client-side placement preview* (`placeWeek`) that shows the interference-safe
heavy/quality/long week before the plan is built. Its rules are unit-tested (`non-race-intake.test.ts`).

The overlap is real but partial: both collect a strength program and some notion of time + long day, but
UI 1 expresses time qualitatively (`commitment` tier → hours) while UI 2 expresses it quantitatively
(budget slider + reserved strength + run/ride lean), and UI 1 expresses availability as a count while
UI 2 expresses it as a per-day grid.

### 3.3 Proposed union flow (high level)

To land on ONE flow, the natural union keeps UI 1 as the spine (because it owns the goal taxonomy,
posture, and the only working submit) and grafts in UI 2's quantitative time + placement steps:

1. **Goal** — from UI 1 (`goal` picker + discipline sub-choice). *(UI 1)*
2. **Posture** — from UI 1 (per-discipline develop/maintain/out, 2-develop ceiling, strength developer).
   *(UI 1)*
3. **Time allocation** — replace UI 1's `commitment` tier step with UI 2's `TimeAllocationStep`
   (budget hard cap → strength reserved off the top → run/ride lean). The strength program here should
   be **driven by** the posture step's strength decision rather than re-asked. *(UI 2)*
4. **Length** — from UI 1 (`targetWeeks`, goal-floored). *(UI 1)*
5. **Placement** — replace UI 1's days/long-day/anchor step with UI 2's `PlacementStep` (7-day grid +
   long day + interference-safe preview). The anchor/fixed-session concept from UI 1 would need to be
   folded in here or dropped. *(UI 2, + UI 1 anchor TBD)*
6. **Confirm + submit** — UI 1's confirm screen and its `assemblePayload` → `create-goal-and-
   materialize-plan` path. *(UI 1)*

**Biggest integration question (T-2):** the two UIs disagree on the *contract for time and placement*.
UI 1 ships `weekly_hours_available` (a single number from a tier) + `strength_frequency: 2` +
`preferred_days` (derived from long/anchor days) into `training_prefs`, and lets the server optimizer
place the week. UI 2 produces a *richer object* — `budgetHrs`, reserved `strengthHrs`, `runHrs`/`rideHrs`
split, and a fully *placed* week (`days[]`, `qualityDay`, `heavyDay`, `interference`) — that has **no
home in the goal/plan contract today**. Merging means deciding:
- Does the server accept UI 2's run/ride hour split and per-day placement as authoritative, or does it
  remain a *preview* while the server optimizer still owns placement (per CLAUDE.md, "the optimizer is
  the sole authority" for day assignment)?
- The strength hour costs in `STRENGTH_PROGRAM_HRS` are explicitly flagged **PROVISIONAL / not
  science-final** (`non-race-intake.ts:13-23`), pending a coaching sign-off — so wiring them into a real
  payload is gated on that decision.

That tension — UI 2's client-side placement vs. the server week-optimizer's "sole authority" — is the
load-bearing question to resolve before either UI becomes the single flow.

### 3.4 Is UI 2's logic connected to plan generation?

**No.** `allocateTime` / `placeWeek` (`non-race-intake.ts`) are consumed only by the unmounted
`non-race-intake-steps.tsx` and the Deno test file. They feed **no** `training_prefs`, **no**
`create-goal-and-materialize-plan` call, and **no** other edge function. As of this audit they are
**purely presentational + unit-tested**, not part of any live payload.

---

## Open threads

- **T-1** — "NonRaceBuilder feeds the run non-race retest path" is verified at the client call boundary
  (`goal_type: capacity`, `sport: run`, `per_discipline_posture` → `create-goal-and-materialize-plan`).
  Server-side consumption of `per_discipline_posture` / `strength_protocol` into the retest plan was not
  re-traced in this pass.
- **T-2** — Merging the two UIs requires resolving where placement authority lives: UI 2 computes a
  placed week client-side, but CLAUDE.md states `_shared/week-optimizer.ts` is the sole authority for
  day assignment. The intake's `STRENGTH_PROGRAM_HRS` are also flagged provisional pending coaching
  sign-off, so its time numbers can't be wired into a real payload yet.
- **T-3** — Neither non-race surface is reachable from the running app: `/goals/build` has a route but
  no navigator, and the intake steps have neither route nor importer. Whether the intended single flow
  should hang off GoalsScreen's "Improve a metric" (capacity) inline form — which currently does *not*
  open the builder — is unresolved.
