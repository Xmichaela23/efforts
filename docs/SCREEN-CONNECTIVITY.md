# Efforts — Screen Data-Connectivity Map

Companion to `SCREEN-INVENTORY.md` (which says *what each screen is*). This says **what each screen is wired to** — the data it reads, the data it writes, the edge function behind it, and whether it rides the smart-server path or touches tables directly. Code-derived 2026-07-02; update when wiring changes.

**Legend, per screen:** **reads ←** source · **writes →** target · **edge:** invoked function(s) · **dep:** the load-bearing server contract · **notes.** `file:line` anchors are under `src/`.

---

## Load-bearing invariants (read this first)

These are the patterns almost every screen inherits. If a screen seems to "just have data," it's one of these:

1. **Calendar reads are smart-server only.** `get-week` is the sole calendar path — invoked in `AppContext.tsx:307` (week warm), `AppLayout.tsx` open-detail probes, `usePlannedWorkouts.ts:39`. Home/calendar screens (`TodaysEffort`, `WorkoutCalendar`) consume **AppContext-derived arrays**, never re-merge `planned_workouts`+`workouts` themselves.
2. **Workout detail is the `session_detail_v1` contract.** One producer: the `workout-detail` edge fn (`_shared/session-detail/build.ts`). Consumed by `UnifiedWorkoutView` (`useWorkoutDetail`, two scopes), `MobileSummary`, `StrengthCompletedView`, `StrengthPerformanceSummary` — all **read-only via props**. Client never re-derives adherence/execution.
3. **Write-then-recompute (the ingest chain).** Loggers/manual-entry write `workouts` through `useAppContext.addWorkout/updateWorkout` → `useWorkouts.ts:12` fires `recompute-workout` for completed rows → `analyze-{sport}-workout` (writes `workout_analysis`) → `workout-detail` rebuilds `session_detail_v1`. **No logging UI invokes analyze/detail directly.**
4. **The Arc.** `get-arc-context` edge (via `lib/fetch-arc-context.ts:17`) → `ArcContext`. Consumed by `TodaysEffort` (home headline), `StateTab`, `TrainingBaselines`, `ArcSetupWizard`, `NonRaceBuilder`. `GoalsScreen` reads the Arc's *substrate* (`athlete_snapshot`/`athlete_memory`) instead of the Arc itself.
5. **Plan builds funnel through one wrapper.** Every Goals/Arc/NonRace build calls **`create-goal-and-materialize-plan`**, which routes to the right generator (see the builder→generator table in §4). The **only** exception is `PlanWizard`, which calls `generate-run-plan` directly.

---

## §0 Shell

- **`AppLayout.tsx`** — reads ← `get-week` (open-detail probes `:1243/1262/1328/1347`) + `useAppContext().workouts`; direct `workouts`/`planned_workouts` for per-row status. writes → edge `save-imported-workout` (`:1008`, FIT sink), `auto-attach-planned` (`:1017`), `calculate-workload` (`:1030`), `check-feedback-needed` (`:466`, drives the post-workout popup), `dismiss-feedback` (`:1888`). dep: `get-week` + AppContext. **notes:** imports `usePlannedWorkouts` (`:34`) but it's **dead for the calendar** — passes `plannedWorkouts={[]}` (`:1750`); planned data now rides `get-week`/AppContext (doc drift worth noting).
- **Bottom-nav / `LogFAB.tsx`** — pure UI, no reads/writes. Connectivity lives entirely in the screens they launch.

## §1 Auth / Onboarding

- **`AuthWrapper.tsx`** — reads ← `users.approved` (`:45`, approval gate) + `auth.onAuthStateChange`. writes → `auth.signOut` (`:151`). dep: Supabase Auth + `users` RLS. No edge fns.
- **`LoginForm.tsx`** — `auth.signInWithPassword` (`:30`). **`RegisterForm.tsx`** — `auth.signUp` (`:43`). No tables/edge fns.
- **`OnboardingProfilePage.tsx`** — reads ← `user_baselines` (`:32`); writes → `user_baselines.athlete_identity` (`:53`). Direct table, no edge fn.

## §2 Home & Workout Detail

- **`TodaysEffort.tsx`** — reads ← `useAppContext().workouts` (45-day window) + **ArcContext** (`get-arc-context`, home headline); direct `planned_workouts`/`workouts` for today's rows. writes → `send-workout-to-garmin` (`:341`); patches `planned_workouts`. dep: `get-arc-context` + AppContext ("Trust get-week completely," `:723`).
- **`WorkoutCalendar.tsx`** — reads ← **props** (AppContext-derived); never queries the two tables for the grid. writes → `validate-reschedule` (`:397/470`, drag gate), `sweep-week` (`:591`), + `usePlannedWorkouts` mutations. dep: `validate-reschedule`.
- **`UnifiedWorkoutView.tsx`** — reads ← **`session_detail_v1`** via `useWorkoutDetail` (scopes `workout` + `session_detail`, hook `:109/212`); direct `workouts`/`planned_workouts` for link state. writes → `ensure-planned-ready` (`:278`), `materialize-plan` (`:336`), `detach-planned` (`:802`), `validate-reschedule`. dep: `workout-detail`. **notes:** orchestrates the 3 tabs; passes the contract down to MobileSummary.
- **`StructuredPlannedView.tsx`** (Planned) — reads ← planned props; direct `planned_workouts` (`:670`). writes → `send-workout-to-garmin` (`:634`). dep: `send-workout-to-garmin`.
- **`MobileSummary.tsx`** (Performance, endurance) — reads ← **`session_detail_v1` prop**, renders verbatim ("all data comes from sd," `:200`). writes → `recompute-workout` (`:98`) + dispatches `workout-detail:invalidate`. dep: `workout-detail`/`session_detail_v1`. **Pure contract consumer, no table access.**
- **`CompletedTab.tsx`** (Details, endurance) — reads ← `useWorkouts()` + direct `workouts`/`planned_workouts`/`gear`; uses `session_detail_v1.completed_totals` as GAP source (`:1175`). writes → `recompute-workout` (`:412`). dep: `recompute-workout` + useWorkouts. Hosts the map.
- **`EffortsViewerMapbox.tsx`** — reads ← **props only** (route simplification moved server-side into `workout-detail`). writes → none. Pure MapLibre renderer.
- **`AssociatePlannedDialog.tsx`** — reads ← `planned_workouts` (7-day window) + `workouts`. writes → `auto-attach-planned` (`:187`).
- **`PostWorkoutFeedback.tsx`** — reads ← `workouts`/`planned_workouts`/`gear`. writes → `workouts` (RPE/feeling/gear). Triggered by AppLayout's `check-feedback-needed`; allowed direct-query surface.
- **`ManualSwimEntry.tsx`** — writes → `workouts.insert` (`:62`) → `recompute-workout` (`:70`). dep: `recompute-workout`.
- **`WorkoutBuilder.tsx`** — no direct invoke/from; all through `usePlannedWorkouts` (`planned_workouts` + `calculate-workload`). dep: `usePlannedWorkouts`.
- **`FitFileImporter.tsx`** — reads ← client-side FIT parse (CDN `fit-file-parser`). writes → none directly; emits via `onWorkoutsImported` → AppLayout's `save-imported-workout` sink.
- **Live execution (`workout-execution/`)** — `EnvironmentSelector`/`PreRunScreen`/`ExecutionScreen`/`PostRunSummary` are **presentational** (device sensors via hooks, no Supabase). The only networked node is **`WorkoutExecutionContainer.tsx`**: writes → `ingest-phone-workout` (`:315`, the phone-side ingest entry) + direct `workouts.delete` on discard. dep: `ingest-phone-workout`.

## §3 Plans

- **`AllPlansInterface.tsx`** — reads ← `plans` (`:556`), `planned_workouts`, `goals`. writes → `planned_workouts` directly (tag/day edits). dep: direct Postgres CRUD; materialization delegated to embedded `UnifiedWorkoutView`. **Viewer/editor, not a builder** — no generator/Arc/get-week.
- **`PlanBuilder.tsx`** — pure shell (composes JSON import + catalog). No data.
- **`PlanJSONImport.tsx`** — library-plan services (`@/services/LibraryPlans`), no edge/tables. Admin authoring of **baked library** plans (separate from athlete generation).
- **`PlanCatalog.tsx`** — `listLibraryPlans` / `deleteLibraryPlan`. Library catalog UI.
- **`PlanWizard.tsx`** — reads ← `user_baselines`, `plans` (`sessions_by_week` preview). writes → `plans` (server-side). edge: `planning-context` (`:829`) → **`generate-run-plan`** (`:858`, DIRECT) → `activate-plan` (`:917`). **The only builder that bypasses the wrapper.** Uses `planning-context`, not the Arc.
- **`pages/PlansBuild.tsx` / `PlansCatalog.tsx`** — nav shells, no data.
- **`pages/PlanSelect.tsx`** — reads ← `user_baselines`; writes → `plans.insert` (library-derived) → `activate-plan` (`:1136`). Library selection/activation; no generator.
- **`pages/PTPlanBuilderPage.tsx`** — reads ← `get-week` (via `usePlannedWorkouts`); writes → `planned_workouts.insert` + `calculate-workload`. Manual PT builder; no generator/Arc.

## §4 Goals & Plan Building

- **`GoalsScreen.tsx`** — reads ← `user_baselines`, `athlete_snapshot`, `athlete_memory`, `race_courses`, `workouts`. writes → `user_baselines` upsert, `goals` update. edge: **`create-goal-and-materialize-plan`** at 4 sites (`:1174/1233/1272/1388`), `course-strategy`, `complete-race`, `end-plan`. **Central hub for build/link/season/complete/end.** Reads the Arc's substrate, not `get-arc-context`.
- **`NonRaceBuilder.tsx`** (Get Stronger) — no direct from/invoke; assembles `ArcSetupPayload` → `useArcSetupComplete` → **`create-goal-and-materialize-plan`**. Reads Arc via `useArcSetupContext` (`get-arc-context`) for seed defaults.
- **`ArcSetupWizard.tsx`** — reads ← `user_baselines`, `workouts`, Arc at mount (passed to steps as props — "steps never call getArcContext directly"). edge: `extract-races` (NL→structured, not a generator) → on finish `useArcSetupComplete` → **`create-goal-and-materialize-plan`** (may route through `useConflictResolutionLoop` for season).
- **`CourseStrategyModal.tsx`** — edge: `course-detail` (load) + `course-strategy` (regenerate). No generator/Arc/get-week.
- **`wizard/StepLayout.tsx`** + **interval builders** (`Run/Ride/Swim IntervalBuilder`, `StrengthExerciseBuilder`) — **pure controlled components**, `{data, onChange}` only. No connectivity; parent persists.

### Builder path → generator (the routing table)

| Builder path | Edge entry | Ultimate generator |
|---|---|---|
| `PlanWizard` | `generate-run-plan` (direct) + `activate-plan` | generate-run-plan |
| `GoalsScreen` — single race, run | wrapper | generate-run-plan |
| `GoalsScreen` — race, triathlon | wrapper | generate-triathlon-plan |
| `GoalsScreen` — "season" (`combine:true`) | wrapper | generate-combined-plan |
| `NonRaceBuilder` — "Get Stronger" | wrapper (via useArcSetupComplete) | **generate-strength-plan** |
| `NonRaceBuilder` — run non-race | wrapper | generate-run-plan (retest) |
| `ArcSetupWizard` — season | wrapper (via conflict loop) | generate-combined-plan |
| `PlanSelect` (library) | `activate-plan` | — (no generator) |
| `PTPlanBuilderPage` (manual) | `planned_workouts` insert + `calculate-workload` | — |

Wrapper routing is in `create-goal-and-materialize-plan/index.ts` (season→combined `:1719`, Get Stronger→strength `:2424`, run non-race→run `:2527`, tri→tri `:2835`, default→run `:3246`).

## §5 Strength

- **`StrengthLogger.tsx`** — reads ← `user_baselines.performance_numbers` (`:886/1818`), `workouts` (history), `planned_workouts`. writes → `workouts` via `addWorkout`/`updateWorkout` (embeds `workout_metadata`); **`readiness_checkins`** upsert (dual-write, `:3277`); **`user_baselines.performance_numbers`** via `saveBaselineResults` (`:945`, the Q-097/Q-102 1RM baseline path). edge: `calculate-workload`, `auto-attach-planned`; heavy pipeline **indirect** via write→`recompute-workout`→`analyze-strength-workout`→`workout-detail`. dep: AppContext.addWorkout + recompute chain.
- **`CoreTimer.tsx`** — pure UI/timer, no Supabase.
- **`StrengthCompletedView.tsx`** / **`StrengthPerformanceSummary.tsx`** — reads ← **`session_detail_v1` prop** (execution score, deviation flags — server-computed). writes → none. Pure presenters; `onRecompute` delegates upward.
- **`StrengthCompareTable.tsx`** — reads ← `workouts`/`planned_workouts` directly. Planned-vs-actual table.
- **`StrengthPlansView.tsx`** — local 1RM entry UI; parent persists.
- **`StrengthAdjustmentModal.tsx`** — reads/writes ← `plan_adjustments`; edge: `materialize-plan` (`:105`). Log adjustment → re-materialize.
- **`PilatesYogaLogger.tsx`** — same write pattern as StrengthLogger minus baseline/readiness (`workouts` + `calculate-workload` + `auto-attach-planned`).

## §6 Baselines / Profile / State

- **`TrainingBaselines.tsx`** — reads ← `user_baselines`, `planned_workouts`, Arc (`get-arc-context`, for suggestions). writes → `user_baselines`. edge: `learn-fitness-profile` (`:413`). Renders `StravaPreview`/`GarminPreview`.
- **`AthleticRecordPage.tsx`** — reads ← `goals`, `user_baselines.{performance_numbers,learned_fitness}`, `workouts`. writes → `goals.insert`. edge: `complete-race`.
- **`Gear.tsx`** — `gear` table CRUD only. Self-contained.
- **`ContextTabs.tsx`** — reads ← `useCoachWeekContext()` → **`coach`** edge; renders **only `StateTab`**.
- **`context/StateTab.tsx`** — reads ← **`CoachWeekContextV1`** (via prop from `coach`; carries embedded `athlete_snapshot` from compute-snapshot, `response_model`, race readiness); **ArcContext** (`get-arc-context`) for `longitudinal_signals` + `readiness` (`:673`); direct `goals`/`race_courses`/`workouts`/`plans`. writes → `goals`. dep: `coach` + `get-arc-context`. **This is where the readiness check-in surfaces** (via ArcContext longitudinal-signals — Q-049).
- **`context/BlockSummaryTab.tsx`** — reads ← `generate-overall-context` edge, `exercise_log`, `athlete_snapshot`. **⚠ NO IMPORTER in `src` — self-contained but currently UNMOUNTED** (not wired by ContextTabs).
- **`context/CoachWeekTab.tsx`** — reads ← `coach` edge, `plans`, `planned_workouts`, `user_baselines`. writes → `plans.athlete_context_by_week`, `user_baselines`. edge: `adapt-plan` (`:914`), `auto-attach-planned`. **⚠ NO IMPORTER in `src` — UNMOUNTED** (only `StateTab` is live).

## §7 Connections / Integrations

- **`Connections.tsx`** (the most connective screen) — reads ← `users.preferences`, `device_connections` (Strava tokens), `user_connections` (Garmin). writes → `users.preferences`, `device_connections.webhook_active` (the sync on/off switch), `user_connections.delete`. edge: `strava-webhook-manager` (webhook lifecycle), `disconnect-connection` (**+ misspelled `disconect-connection` fallback — a real typo'd deployed fn, hygiene flag**), `import-strava-history`, `bright-service` (Garmin PKCE token exchange). **OAuth:** Strava full-page redirect → `/strava/callback`; Garmin PKCE popup → `/auth/garmin/callback` → `postMessage` bridge. **notes:** Strava tokens in `device_connections`, Garmin tokens in `user_connections` — two tables per provider.
- **`StravaCallback.tsx`** (`/strava/callback`) — edge: `strava-token-exchange` (persists tokens to `device_connections`); writes localStorage flag; `refreshGroupRideRouteSnapshotsForUser` → home. Full-page.
- **`GarminCallback.tsx`** (`/auth/garmin/callback`) — pure relay: `postMessage` code back to `Connections`; token exchange happens there via `bright-service`, not here. No Supabase import.
- **`StravaPreview.tsx`** (in TrainingBaselines) — reads ← **Strava REST API directly** (`StravaDataService`, no edge fn). Baseline-suggestion preview.
- **`GarminPreview.tsx`** (in TrainingBaselines) — reads ← `user_connections`, `garmin_activities` (90-day). writes → `user_connections.connection_data`. edge: `swift-task` (Garmin API proxy — backfill + user-id), `import-garmin-history`. **notes:** self-instantiates its own `createClient` with a hardcoded anon key (hygiene flag — not the shared `@/lib/supabase`).
- **`SwimSourceMatrix.tsx`** (in Connections) — pure presentational (D-172/D-173 capability badges). No connectivity.

## §8 Admin / Dev

- **`pages/PlansAdminImport.tsx`** — `useAppAdmin` gate; shell composing `PlanJSONImport` + `WorkloadAdmin`. Downstream persistence: `PlanJSONImport` → `publishLibraryPlan` → `library_plans.insert`.
- **`WorkloadAdmin.tsx`** — reads ← `plans`, `workouts`. edge (all `dry_run`-gated, **default dry_run=true, safe-by-default**): `backfill-power-curves`, `backfill-adaptation-metrics`, `bulk-reanalyze-workouts` (primary batch tool + paginated "run all"), `reassociate-workouts`, `recompute-workout`, and the manual `compute-workout-analysis`→`compute-facts`→`analyze-running-workout` chain (mirrors the ingest orchestrator). Live runs require explicitly unchecking dry-run.

## §9 Orphaned / dead-chain (confirmed unrendered — cleanup candidates)

- **`WorkoutSummary` → `WorkoutDetail` → `StrengthSummaryView`** — dead trio (imported, never rendered; superseded by `UnifiedWorkoutView` + `useWorkoutDetail`).
- **`WorkoutExecutionView.tsx`** — imported (TodaysEffort `:18`), never rendered; live execution is `workout-execution/ExecutionScreen`.
- **Dropdowns** (`NewEffortDropdown`, `LogEffortDropdown`, `AllEffortsDropdown`, `PlansMenu`, `PlansDropdown`) — imported in AppLayout, never rendered (tabbar uses `LogFAB`).
- **`activeBottomNav` `'plans'`** — union member never assigned (dead type value).
- **⚠ NEW (found in this trace): `context/BlockSummaryTab.tsx` + `context/CoachWeekTab.tsx`** — self-contained (own hooks) but **no importer in `src`**; only `StateTab` is live via `ContextTabs`. The inventory §6 lists them as "inside State," but they're currently unmounted. Either wire them or move them here.

---

## Data-hygiene flags surfaced during the trace (not blocking, worth a pass)

1. **`disconect-connection`** — Connections calls a misspelled edge fn as a fallback; implies a typo'd deployed function name.
2. **`GarminPreview` hardcodes anon key + project URL** in its own `createClient` instead of the shared `@/lib/supabase` client.
3. **`AppLayout` imports `usePlannedWorkouts`** but it's dead for the calendar (rides `get-week`/AppContext; passes `plannedWorkouts={[]}`).
4. **`BlockSummaryTab` / `CoachWeekTab` unmounted** (see §9) — real code, no render site.
