# Efforts — Screen / View Inventory

Generated 2026-07-02 (code-derived map, so Michael never has to screen-grab to show what exists). Update when screens are added/removed.

> **Architecture note.** Efforts is a single-page app with only a thin router (`src/App.tsx`). Almost everything the user sees lives **inside one shell** (`src/components/AppLayout.tsx`) and is switched by boolean state flags (`showAllPlans`, `showStrengthLogger`, `showGoals`, …), not by URLs. The bottom-nav "tabs" and the workout-detail "tabs" are two different tab systems. Deep-link routes (`/goals`, `/profile/athletic-record`) just flip the matching flag inside the shell.

---

## 0. The App Shell & its two tab systems

### Bottom navigation (`AppLayout.tsx`, tabbar ~line 1768)
`activeBottomNav` is typed `'home' | 'plans' | 'insights'`, but **only `'home'` and `'insights'` are ever set** — `'plans'` is a dead type value. The tabbar renders **four** slots:

| Slot | Sets | Renders | File |
|---|---|---|---|
| **Home** | `activeBottomNav='home'` | `TodaysEffort` (today's cards) + `WorkoutCalendar` (week grid) | AppLayout ~1691 |
| **State** | `activeBottomNav='insights'` | `ContextTabs` → `StateTab` (coaching intelligence) | AppLayout ~1754 |
| **Goals** | `showGoals=true` | `GoalsScreen` | AppLayout ~1569 |
| **+ (LogFAB)** | — | popover menu to log/build efforts | `LogFAB.tsx` |

There is **no "Plans" bottom-nav button** — Plans is reached via the `+` FAB, via Goals → "View all plans", or via the calendar.

### Workout-detail inner tabs (`UnifiedWorkoutView.tsx`, `<Tabs>` ~line 975)
Opening a workout shows up to 3 tabs (`activeTab`, seeded by AppLayout's `initialTab`):

| Tab | Label | Shown when | Renders |
|---|---|---|---|
| `planned` | **Planned** | planned, or completed+linked | `StructuredPlannedView` (strength shows an "open logger" button) |
| `summary` | **Performance** | completed | `MobileSummary` (endurance) / inline `StrengthLogger` + strength summary |
| `completed` | **Details** | completed **endurance** only | `CompletedTab` (charts/zones) or `StrengthCompletedView` |

D-207: the strength family folds **Details into Performance** — strength never rests on a `completed` tab.

---

## 1. Auth / Onboarding

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Auth gate** | app entry (`/` → `Index` → `AuthWrapper`) | login/register · "pending approval" · "can't verify" retry · else `AppLayout` | `AuthWrapper.tsx` |
| **Login** | signed out | Email/password sign-in | `LoginForm.tsx` |
| **Register** | "Create one" from login | Account creation + beta notice | `RegisterForm.tsx` |
| **Auth backdrop** | wraps auth screens | Full-screen gradient/grid chrome | `AuthScreenLayout.tsx` |
| **Onboarding Profile** | `/onboarding/profile` | Initial athlete-identity + disciplines | `pages/OnboardingProfilePage.tsx` |
| **Privacy Policy** | `/privacy` | Static policy | `pages/Privacy.tsx` |
| **404** | `*` | Not found | `pages/NotFound.tsx` |

---

## 2. Home & Workout Detail

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Home dashboard** | Home tab (default) | Hosts Today's Effort + week calendar | `AppLayout.tsx` (home branch) |
| **Today's Effort** | Home | Expandable planned/completed cards; Watch/Garmin send; launches execution | `TodaysEffort.tsx` |
| **Workout Calendar** | Home | Week grid, load bar, reschedule popup | `WorkoutCalendar.tsx` |
| **Unified Workout View** | tap any workout | Orchestrates Planned/Performance/Details tabs | `UnifiedWorkoutView.tsx` |
| **Structured Planned View** | Planned tab | Planned detail: swim FORM script, Watch/Garmin export, mobility | `StructuredPlannedView.tsx` |
| **Mobile Summary** | Performance tab (endurance) | Planned-vs-completed body (SessionNarrative, swim enrichment) | `MobileSummary.tsx` |
| **Completed Tab** | Details tab (endurance) | Elevation, HR/power zones, metric sliders | `CompletedTab.tsx` |
| **Efforts Viewer (Map)** | inside Completed Tab | MapLibre mini-map + charts + weather | `EffortsViewerMapbox.tsx` |
| **Associate Planned Dialog** | Details tab, unlinked completed | Link a completed activity to a planned session (7-day window) | `AssociatePlannedDialog.tsx` |
| **Post-Workout Feedback** | auto-popup after completed run/ride/swim | Gear/RPE/feeling (pool for swims) | `PostWorkoutFeedback.tsx` |
| **Manual Swim Entry** | LogFAB → Log Swim | Simple completed-swim form | `ManualSwimEntry.tsx` |
| **Workout Builder** | LogFAB / calendar add | Plan a custom run/ride/swim/strength/mobility | `WorkoutBuilder.tsx` |
| **FIT File Importer** | header menu → Import | Import from `.fit` | `FitFileImporter.tsx` |

### Live Workout Execution (via "Start Workout" in Today's Effort) — `workout-execution/`
Environment select (`EnvironmentSelector`) → pre-run sensors (`PreRunScreen`) → live (`ExecutionScreen`) → post-run save/discard (`PostRunSummary`); orchestrated by `WorkoutExecutionContainer`; skip nudge `planned/SkipSessionReasonPanel`.

---

## 3. Plans

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **All Plans Interface** | LogFAB / Goals → plans | Manage all planned workouts, session detail, editing | `AllPlansInterface.tsx` |
| **Plan Builder** | calendar "Build me a plan" | JSON import + catalog container | `PlanBuilder.tsx` |
| **Plan JSON Import** | Plan Builder / admin | Paste/upload/URL plan JSON, macro-expand + validate | `PlanJSONImport.tsx` |
| **Plan Catalog** | Plan Builder / catalog page | Library plans by discipline | `PlanCatalog.tsx` |
| **Plan Wizard** | `/plans/generate` | Multi-step race-plan wizard | `PlanWizard.tsx` |
| **Plans Build (page)** | `/plans/build` | Pick a plan type | `pages/PlansBuild.tsx` |
| **Plans Catalog (page)** | `/plans/catalog` | Catalog + admin button | `pages/PlansCatalog.tsx` |
| **Plan Select (page)** | `/plans/select` | Preview library plan, week count/start | `pages/PlanSelect.tsx` |
| **PT / Mobility Builder** | `/plans/pt` | Build PT/mobility plans | `pages/PTPlanBuilderPage.tsx` |

---

## 4. Goals & Plan Building

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Goals Screen** | Goals nav / `/goals` | Manage race + non-race goals; conflict notices; course upload | `GoalsScreen.tsx` |
| **Non-Race Builder** | Goals → build (`/goals/build`) | Goal-first non-race plan builder (Get Stronger lives here) | `NonRaceBuilder.tsx` |
| **Arc Setup Wizard** | `/arc-setup` | Multi-step season setup (races, intent, anchors, budget, strength) | `ArcSetupWizard.tsx` |
| **Course Strategy Modal** | Goals / State strategy dialogs | Elevation profile + pacing zones | `CourseStrategyModal.tsx` |
| **Wizard StepLayout** | shared chrome | Progress/back/continue for Arc + Non-Race | `wizard/StepLayout.tsx` |
| Interval builders | inside Workout Builder | Per-discipline editors | `Run/Ride/SwimIntervalBuilder.tsx`, `StrengthExerciseBuilder.tsx` |

---

## 5. Strength

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Strength Logger** | LogFAB; Planned tab "open logger"; auto-reopen on resume (D-109) | Log strength/mobility sets (Sheet); also "mobility mode" | `StrengthLogger.tsx` |
| **Core Timer** | inside Logger (Core Work) | 5-min countdown + core-set logging | `CoreTimer.tsx` |
| **Strength Completed View** | Details/Performance (completed strength) | Completed vs plan | `StrengthCompletedView.tsx` |
| **Strength Compare Table** | inside completed/summary | Planned-vs-completed exercise table | `StrengthCompareTable.tsx` |
| **Strength Performance Summary** | inside MobileSummary | Planned-vs-completed summary | `StrengthPerformanceSummary.tsx` |
| **Strength Plans View** | calendar → strength discipline | Enter/manage 1RM values | `StrengthPlansView.tsx` |
| **Strength Adjustment Modal** | from strength views | Adjust weight/reps from RIR | `StrengthAdjustmentModal.tsx` |
| **Pilates/Yoga Logger** | LogFAB → pilates/yoga | Log pilates/yoga | `PilatesYogaLogger.tsx` |

---

## 6. Baselines / Profile / State

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Training Baselines** | header menu; `/baselines`; `onOpenBaselineTest` | Edit details + baselines (age, paces, FTP, lifts) | `TrainingBaselines.tsx` |
| **Athletic Record** | header menu; `/profile/athletic-record` | Race records, baseline suggestions, goal creation | `AthleticRecordPage.tsx` |
| **Gear** | header menu → Gear | Manage shoes/bikes | `Gear.tsx` |
| **State (Context) tab** | State bottom-nav | Coaching intelligence wrapper | `ContextTabs.tsx` → `context/StateTab.tsx` |
| — Block Summary | inside State | Block progression, trend cards | `context/BlockSummaryTab.tsx` |
| — Coach Week | inside State | Adherence matrix, readiness, projections | `context/CoachWeekTab.tsx` |

---

## 7. Connections / Integrations

| Screen | How you reach it | What it does | File |
|---|---|---|---|
| **Connections** | header menu; `/connections` | OAuth dashboard (Strava/Garmin/Apple Health), webhooks, sync | `Connections.tsx` |
| **Strava Callback** | `/strava/callback` | Exchange Strava OAuth code | `StravaCallback.tsx` |
| **Garmin Callback** | `/auth/garmin/callback` | Handle Garmin OAuth code | `GarminCallback.tsx` |
| **Strava Preview** | during Strava connect | Analyze activities, pick baseline | `StravaPreview.tsx` |
| **Garmin Preview** | during Garmin connect | Backfill/history import | `GarminPreview.tsx` |
| **Swim Source Matrix** | in Connections | Per-source swim override | `SwimSourceMatrix.tsx` |

---

## 8. Admin / Dev-only

| Screen | How | What | File | Flag |
|---|---|---|---|---|
| **Plans Admin Import** | `/plans/admin` | Import/manage library plans + workload tools | `pages/PlansAdminImport.tsx` | admin-guarded |
| **Workload Admin** | inside Plans Admin | Workload calc, backfills, reanalysis (dry-run) | `WorkloadAdmin.tsx` | admin-only |

---

## 9. Orphaned / dead-chain (imported but never rendered) — cleanup candidates

- **`WorkoutSummary.tsx` → `WorkoutDetail.tsx` → `StrengthSummaryView.tsx`** — a genuinely dead trio (superseded by the Unified view / `StrengthCompletedView`).
- **`WorkoutExecutionView.tsx`** — orphaned; live execution uses `workout-execution/ExecutionScreen.tsx`.
- **`NewEffortDropdown`, `LogEffortDropdown`, `AllEffortsDropdown`, `PlansMenu`, `PlansDropdown`** — imported in `AppLayout` but never rendered (legacy web dropdowns; tabbar uses `LogFAB`).
- `activeBottomNav` union includes `'plans'` but nothing sets it — dead type value.
- Strength Logger can **auto-reopen** on cold-start/resume (D-109) if an unfinished same-day draft exists — a "screen" that opens without a tap.
