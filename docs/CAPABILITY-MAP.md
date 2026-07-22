# CAPABILITY MAP — "does X exist, and where?"

**Rebuilt from code 2026-07-13** (4 parallel readers, every row verified by code-read — not by trusting comments or the previous map). The previous version asserted a deleted code path was live, cited a decision number that was never written, was 16 coach versions stale, and omitted ~13 shipped subsystems. Treat this rebuild as the baseline; append to it, and **when you ship something that changes a row, change the row.**

**Purpose:** the lookup that stops us re-inventing shipped infrastructure. Before proposing to build ANYTHING, find the capability here, then grep its entry point and read it (`CLAUDE.md` top banner: **trace-before-build**). This app is BUILT — the job is wiring/continuity, not features.

**How to use:** Ctrl-F the capability. `BUILT` → don't rebuild, wire into it. `PARTIAL`/`SEAM`/`STUB` → that's the real edge. `DEAD` → it exists and nothing calls it; decide whether to mount it or delete it, but don't write a second one. Entry points are `file:approx-line` — **lines drift, grep the symbol.**

> **⛔ WHEN YOU ADD A ROW, SAY WHAT IT DOES FOR AN ATHLETE — not just where the code lives.**
> The 2026-07-13 audit found three fully-built, fully-tested engines that had **never run once**, and the owner could not remember what any of them were *for*, because every doc described them structurally (*"the rule set ships at `week-optimizer.ts:412`"*) and never in a sentence a runner would understand. **A capability nobody can describe is a capability nobody will wire up.** One plain sentence, then the file path.

### The three that are BUILT, TESTED, and have NEVER EXECUTED (2026-07-13)

| what it does for an athlete | where | why it never runs |
|---|---|---|
| **"Put my lifting on the same day as a hard leg session, so my other days stay free."** The strength-integration fork: dense days vs light days. | engine `_shared/week-optimizer.ts:412-417` · spec `docs/CONSOLIDATED-MODE.md` | **No wizard writes `integration_mode`** → `create-goal…:1895` hardcodes `'separated'` for everyone |
| **Stops the wizard accepting an IMPOSSIBLE week.** "4 days, 10 hours, hard, lots of strength" → it does the arithmetic and warns or refuses, showing the math. | `src/lib/day-count-gate.ts:237` · spec `docs/DAY-COUNT-GATES.md` | **Zero importers.** Nothing in the app calls it. ⚠️ Ships *after* consolidated mode — its matrix keys on `integration_mode`. |
| **"Am I getting faster on this stretch?"** Your own personal segments — the chunks of road you actually repeat. *(Deliberately replaces the per-route approach, which flip-flopped on real data.)* | `detect-cores` → `match-cores` → `compute-core-verdict` · spec `docs/DESIGN-segments.md` | **`detect-cores` has ZERO callers.** No cron, no button, no script → `route_cores` is always empty → all three stages produce nothing. |

**Status legend:**
`BUILT` works end to end · `PARTIAL` works but fragile/incomplete (the note says how) · `SEAM` documented extension point, not built · `STUB` placeholder / invented numbers · `DEAD` exists, zero callers OR output never rendered.

---

## ⚠️ READ FIRST — the "I almost rebuilt this" list

**This section is the whole point of the doc.** Every item is something that exists, is hard to find, and has been (or nearly been) rebuilt.

1. **A run easy-pace resolver.** `src/lib/resolve-current-run-pace.ts:146` is THE one (client + edge import it). A **second function with the same name** exists at `generate-combined-plan/science.ts:110` — different function, currently starved. Don't write a third; don't "fix" the second by deleting it. *(A session rebuilt this once. See CLAUDE.md.)*
2. **"Is this HR easy?"** → `_shared/easy-hr.ts:112` (`resolveRunEasyHrBand`). Already consolidated out of **five** disagreeing copies. Do not add a sixth.
3. **"What day does session X go on?"** → `_shared/week-optimizer.ts:1075` (`deriveOptimalWeek`) is the sole authority; the same-day matrix is `_shared/schedule-session-constraints.ts:148`. `generate-run-plan` and `generate-triathlon-plan` **not** routing through it makes the optimizer look absent. It exists; they're unwired.
4. **A run plan generator.** There are **five DEAD generator classes** in `generate-run-plan/generators/`, and `simple-completion.ts:89` exports a class named `SustainableGenerator` — **identical in name to the live one** in `sustainable.ts:92`. Editing the wrong file is a silent no-op. Only `sustainable` and `performance-build` are switched on (`generate-run-plan/index.ts:232`).
5. **A weekly training-context engine.** `generate-training-context/` (3.4k lines) is a **DEAD twin** of the live `coach` → `weekly_state_v1` path. It looks canonical and ships nothing.
6. **A "coach week" screen.** `CoachWeekTab.tsx` (1145 lines) and `BlockSummaryTab.tsx` (1185 lines) are fully built, fully typed, and **unmounted**. The data is already on the wire. Mount them or delete them — don't build a third.
7. **A daily readiness check-in screen.** `readiness_checkins` is a real table with three server readers, and its **only writer lives inside the strength logger** (`StrengthLogger.tsx:3278`). An endurance-only athlete can never check in. Most likely thing in the app to get rebuilt from scratch.
8. **The segment / "core" engine.** Three stages exist and are spine-wired (`detect-cores` → `match-cores` → `compute-core-verdict`), but **stage 1 has no caller** — no cron, no button, no script. So `route_cores` is always empty and the whole thing produces nothing. It looks unbuilt. It is **unstarted**.
9. **The ingest fan-out.** `analyze-workout/` is an **empty directory** with the most guessable name in the repo. The real orchestrator is `ingest-activity/index.ts:1345-1712`. Any new downstream step must register in **three** hand-maintained routing tables: `ingest-activity`, `recompute-workout:27`, `bulk-reanalyze-workouts:36`.
10. **A shared CORS helper.** There is no `_shared/cors.ts`. All 87 functions hand-roll it. Genuinely missing — but creating it means reconciling 87 copies, at least three of which differ.
11. **A "verify the caller" helper.** `_shared/require-user.ts` exists and is good. Adoption is **9 of 87**. `_shared/bearer-auth.ts` is a **second, unverified** implementation (decodes the JWT without checking the signature). Don't write a third — adopt the first, delete the second.
12. **Strava token refresh.** `strava-refresh/` is a complete, **DEAD** standalone function with the obvious name. The live logic is `_shared/strava-access-token.ts`. Someone told "add token refresh" will find the corpse first.
13. **A plan "baker".** `src/services/plans/tools/plan_bake_and_compute.ts:948` (`augmentPlan`) exists, works offline (`npm run bake`), and is **commented out in the app** (`PlanSelect.tsx:910-930`, "BAKER IS CRASHING SUPABASE"). Disabled, not missing.
14. **A plan-token expander.** TWO exist: the live one inline in `materialize-plan/index.ts:1123+`, and `_shared/token-parser.ts` (which serves the **analysis** path, not plans). CLAUDE.md points at the wrong one.
15. **Race finish projection.** `_shared/race-projections.ts` (17 importers) is the answer. Six other modules orbit it (`riegel.ts`, `goal-finish-from-workouts.ts`, `resolve-server-predicted-finish.ts`, `resolve-goal-target-time.ts`, and two `race-finish-seconds.ts`).
16. **Backfills.** Six DEAD backfill functions already exist plus two empty dirs. Check the DEAD list before writing a seventh.

---

## Cross-cutting risks (read before touching a fact)

- **The plan pin only half-exists.** `_shared/athlete-snapshot.ts:158` (`buildAthleteSnapshot`) freezes targets at generation — but **5 of its 8 categories are hardcoded `null`** (`:178-182`): swim, equipment, intent, capacity, bio. Those re-resolve **live** on every materialize, so a mid-plan baseline edit silently moves them. Its only reader is `materialize-plan:2745`. And **`generate-strength-plan` never calls it** → Get Stronger / Hyrox plans have **no pin at all**.
- **Two ingest paths never reach the spine.** `ingest-phone-workout` and `save-imported-workout` fire only `compute-workout-summary` → no `workout_facts`, no `session_load`, invisible to snapshot/arc/coach. `ManualSwimEntry.tsx:70` works around it by calling `recompute-workout`; the other two don't.
- **`workouts.workload_actual` (the ACWR substrate) is written by ONE job** (`calculate-workload`) called from **two places**. Anything ingested another way contributes **zero to ACWR** while still counting toward `workload_total` — the same snapshot row can contradict itself.
- **A race in the fan-out.** `compute-facts` is awaited (`ingest-activity:1582`) but reads `workouts.computed`, written by two **fire-and-forget** calls (`:1508`, `:1521`). When it loses, `time_in_zone`, `intervals_hit/total`, `hr_drift_pct` and `execution_score` are silently absent.
- **The client is a second State engine.** `useStateTrends.ts:54-233` re-runs the server's `assembleStateTrends` in-browser (9 direct queries, hand-copied row filters, browser clock) whenever the server display contract is absent.
- **Three Friel zone tables disagree.** See the FACTS table below — this is the sharpest live fracture in the app.

---

## FACTS — who owns each number

| fact | resolver | routed? | live fracture |
|---|---|---|---|
| **HR zones (Friel)** | `src/lib/friel-zones.ts:36` (Z2 = 85–89% LTHR → **128–134** @ LTHR 151) | ❌ **NO** | 🟡 **LATENT — corrected 2026-07-13 by looking at the app.** The live account is **CORRECT**: stored bins are Z2 128-135 / Z3 135-143 (half-open) = the canon. The analyzer's **Priority 1 is `configured_hr_zones`** — deliberately, *"so debrief zone references match exactly what every other surface shows"* — and those are Friel 0.89. **D-286 fixed three copies; D-296 (2026-07-18) fixed two more** — the FIT-import 0.90 seam (`save-imported-workout`) and the `analyze-running-workout:1030/:1934` non-Friel fallback, both now → canonical `friel-zones.ts`. **Remaining:** the dead `_shared/endurance/hr-zones.ts:18` 0.90 copy (used only by `generate-run-plan/generators/sustainable.ts`; delete after a live/dead check). |
| **LTHR** | ✅ `src/lib/resolve-current-lthr.ts` (D-296, 2026-07-18) | learned-first, `sample_count:0` gated, athlete `lthr_source` override wins | 🟢 **SINGLE-SOURCE.** 4 sites routed: `easy-hr.ts`, `compute-workout-analysis` (zone bins, run), `coach`, `calculate-workload`. Never 220-age. `SPEC-lthr-one-anchor.md` folded → D-296 and deleted. |
| **threshold_pace** | ✅ `resolveCurrentRunThresholdPace` (`src/lib/resolve-current-run-pace.ts`, D-300, 2026-07-18) | coach + race-projections + snapshot spine (`extractRun`/`resolveLiveRun`) + infer-training-fitness | 🟢 **SINGLE-SOURCE.** 3 units normalized to sec/mi (+ sec/km carried); learned-first, Q-174 choice honored. Left deliberately (not fractures): arc `buildRunPaceForCoach` (Law-3 provenance view), create-goal gates, generate-run-plan VDOT (circular), race-readiness (race target), course-* display (learned-first + fiveK). |
| **max HR** | ✅ `src/lib/resolve-current-max-hr.ts` (D-299, 2026-07-18); `resolveMaxHrCeiling` stays a separate plausibility ceiling | compute-workout-analysis · analyze-running zones · compute-adaptation-metrics · generate-run-plan · client TrainingBaselines | 🟢 **SINGLE-SOURCE (fallback yardstick).** One divisor (`PEAK_TO_MAX` 0.95), one formula (Tanaka / Gulati female; Fox 220−age retired). Age tier is opt-in + `is_estimate`. Cycling per-interval zones left as display. |
| **FTP** | ✅ `src/lib/resolve-current-ftp.ts:62` | ✅ **all stragglers routed (2026-07-18)** | 🟢 **SINGLE-SOURCE.** `athlete-snapshot/identity.ts` (the LLM prompt — coach no longer voices a different FTP), `get-week` (week watts), `course-strategy` (bike leg), `PlanSelect`, and `normalizer.ts` plan-watts (`learned_fitness` threaded through the `Baselines` type + all 5 callers). All read `resolveCurrentFtp` (learned-first). |
| **run easy pace** | ✅ `src/lib/resolve-current-run-pace.ts:146` | server ✅ universal (D-287) | 🟡 client stragglers: `AllPlansInterface.tsx:664/791`, `StructuredPlannedView.tsx:352`, `PlanWizard.tsx:470`, `ArcSetupWizard.tsx:1693` |
| **1RM anchor** | ✅ `_shared/state-trend/capacity-resolver.ts:125` | ✅ | 🟢 **the model to copy.** Explicitly refuses raw `exercise_log.estimated_1rm` as truth. |
| **e1RM series (trend)** | `exercise_log.estimated_1rm` ← `compute-facts:124` | 3 readers, 2 estimators | 🟡 `state-trend/strength.ts:79`, `adapt-plan:1138`, `analyze-strength-workout:814` |
| **ACWR ratio** | ✅ `_shared/acwr.ts:155` | ✅ all 4 | 🟢 clean |
| **ACWR band/status** | ✅ `_shared/acwr-state.ts:31` (plan-aware) | **6 bypass it** | 🔴 `response-model/weekly.ts:313` is **plan-blind** and ships in the same payload. Taper week @ 1.15: canon says `elevated` (cap 1.1), copy says `optimal` (cap 1.3). |
| **fitness direction** | ✅ `_shared/state-trend/assemble.ts:335` (`rollupFitness`) | ✅ | 🟢 clean. 2026-07-17: gains a `withheld` verdict below 8 qualifying runs (D-294) — direction is not asserted at low volume. |
| **fitness ANCHOR (band dot)** | ✅ `_shared/state-trend/baseline-derive.ts` → `fitness_baselines` table (D-294) | server ✅ + client `useStateTrends`→`StatePerformanceSection.tsx` | 🟢 auto-derived, rolling (shares the band's ~12wk window), crown-from-N. Run/bike anchored; swim `facts_only` until first RPE≥7 swim (Q-188). |
| **RPE / effort perception** | `_shared/response-model/body-response.ts:369` | — | 🔴 **`makeTrend` splits THIS WEEK's sessions in half BY ORDER.** Hard Monday + easy Friday = "improving"; swap the days = "declining". It is the **necessary** leg for the safety floor (`load-status-reconcile.ts:83-95`, D-266). Q-167. |
| **swim CSS** | ❌ none | — | ⚫ **ORPHANED.** Written by two engines (`learn-fitness-profile:355`, `compute-workout-analysis:772`), read by **nothing**. `planning-context.ts:238` `SWIM_CSS_LIVE = false`. 2026-07-17: swim is now DELIBERATELY grade-less on State (`facts_only`, D-293) — pace is fins/equipment-contaminated, so anchorless-for-grading is by design, not a fracture. A provisional swim anchor wakes on the first RPE≥7 swim (Q-188). |

---

## INVENTED NUMBERS (still live, mostly undisclosed)

Law 2 says measured ≠ inferred. These are inferred and presented as measured.

| number | file:line | athlete told? |
|---|---|---|
| squat / bench / deadlift 1RM = **135 lb** | `materialize-plan/index.ts:2699 / 2704 / 2714` | **NO** — console log only |
| overhead press 1RM = **95 lb** | `materialize-plan/index.ts:2719` | **NO** |
| hip thrust = `max(75, deadlift × 0.55)` | `materialize-plan/index.ts:2726` | **NO** (and derived from a possibly-invented 135) |
| swim pace = **1:30/100** | `materialize-plan/index.ts:2352` | **NO** — drives every swim `duration_s` |
| easy run pace = **10:00/mi** | `shared/strength-system/strength-primary-plan.ts:370` | ✅ **YES** — `volume_notes` at `:427`, rendered `GoalsScreen.tsx:1633`. **The only disclosed one.** |
| heat coefficient `DEFAULT_HEAT_K = 0.005` | `_shared/heat-adjust.ts:43` | self-declared "UNVALIDATED POPULATION PLACEHOLDER" |
| marathon pace = easy − 30 · threshold = 5K + 20 | `materialize-plan/index.ts:555 / 561` | NO |

**Net:** a brand-new athlete's first strength session is prescribed as a % of an invented 135 lb, and their first swim at an invented 1:30/100, with nothing on screen saying so. The run-pace lies were cleaned up by D-285 (`token-parser.ts:94`, `end-plan-core.ts:75`, `planning-context.ts:381` all now return null instead of guessing). Strength and swim were not.

---

## INGEST → PROCESSING → ANALYSIS

| capability | entry point | status | note |
|---|---|---|---|
| Garmin/Strava ingest + the full fan-out (THE orchestrator) | `ingest-activity/index.ts:1345-1712` | BUILT | the only path that runs the complete pipeline |
| Phone-recorded workout ingest | `ingest-phone-workout/index.ts:292` | PARTIAL | fires **only** compute-workout-summary → no facts, no spine |
| FIT-file import | `save-imported-workout/index.ts:195` | PARTIAL | same; client adds attach+workload, still **no compute-facts** |
| Garmin swim length/lap reconstruction | `swim-activity-details/index.ts:315` | PARTIAL | Garmin-only (hard 400 otherwise) |
| Executed intervals + overall pace/HR/power | `compute-workout-summary/index.ts` | BUILT | writes `workouts.computed.overall/intervals` |
| Zones, GAP series, power curve, best efforts, NP | `compute-workout-analysis/index.ts` | BUILT | ⚠️ **does NOT write `workout_analysis`** despite the name (`:2044` says so) |
| Deterministic per-workout facts | `compute-facts/index.ts:1650` | BUILT | the deterministic layer; also writes `exercise_log`, `session_load`; then calls `match-cores` + `compute-snapshot` |
| Per-session workload score | `calculate-workload/index.ts`; formulas `_shared/workload.ts:324` | BUILT | writes `workload_actual` — the ACWR substrate |
| Run / ride / swim / strength analysis | `analyze-{running,cycling,swim,strength}-workout/index.ts` | BUILT | ⚠️ the function is `analyze-swim-workout`, NOT `analyze-swimming-workout` |
| Aerobic decoupling (HR drift), runs | `compute-facts/index.ts:1022` | BUILT | first vs second half, ≥20 samples |
| Pace at easy HR | `compute-facts/index.ts:1069` + `_shared/easy-hr.ts:112` | PARTIAL | **starved** when both `learned_fitness.run_threshold_hr` and `run_max_hr_observed` are null |
| The one definition of "easy HR" | `_shared/easy-hr.ts:112` | BUILT | consolidated from 5 copies. **Do not add a sixth.** |
| Corrupt-HR / strap-artefact detection | `_shared/hr-plausibility.ts:145` | BUILT | |
| Grade-adjusted pace | `_shared/gap.ts:36` | BUILT | |
| Heat-adjusted route/efficiency trend | `_shared/heat-adjust.ts:372` | STUB (coefficient) | + `temp_f` is null on first ingest (weather is fetched by the analyzer, which runs *after* compute-facts) → those runs are dropped from the regression |
| Weather for a workout | `get-weather/index.ts:179` | PARTIAL | runs only; ordering bug above |
| Recompute one workout (the compensating path) | `recompute-workout/index.ts` | BUILT | analysis → facts → analyze. Use this, not bulk-reanalyze, for a correct single backfill |
| Bulk re-analyze | `bulk-reanalyze-workouts/index.ts:36` | BUILT | ⚠️ **only re-runs the analyzer** — facts + snapshot go stale |

**Segments / "cores":** `detect-cores` **DEAD (zero callers)** → `match-cores` PARTIAL (wired at `compute-facts:1827`, starved) → `compute-core-verdict` PARTIAL (wired at `compute-snapshot:873`, starved). **Built, spine-wired, produces nothing, because stage 1 is never invoked.**

---

## PLANS · GOALS · CALENDAR

| capability | entry point | status | note |
|---|---|---|---|
| **THE wrapper** — create a goal, build + activate a plan | `create-goal-and-materialize-plan/index.ts:2077`, routing `:2320` | BUILT | every plan path goes through here except `PlanWizard` |
| Season / combined (multi-sport) | `generate-combined-plan/index.ts:60` | BUILT | the most active engine; the only one wired to `week-optimizer` |
| Run race plan | `generate-run-plan/index.ts:232` | BUILT | only `sustainable` + `performance_build` are switched on |
| Run non-race (capacity, retest head) | `create-goal…:2458` | BUILT | |
| **Get Stronger (strength-primary)** | `generate-strength-plan/index.ts:25` → `shared/strength-system/strength-primary-plan.ts` | PARTIAL | ⚠️ **only fires for `commercial_gym`** (`create-goal…:2390`). Bodyweight athletes **silently** get the run-durability plan instead, with no message. Also: **no plan pin.** |
| **Hyrox accessory bias** | UI `NonRaceBuilder.tsx:395`; engine `strength-primary-plan.ts:193/402/485` | **BUILT — SHIPPED** | sled push / farmers carry / sandbag lunge / sled pull + a fatigued-legs combo after the long run. Rides the Get Stronger path (so inherits the commercial-gym gate). *(The old map had no row. Q-100 still says "not built" — it is stale; Q-103 superseded it.)* |
| Triathlon / 70.3 — via combined | `combine:true` → `generate-combined-plan` | BUILT | the intended tri path. ⚠️ **the swim leg is not anchored to the athlete's swimming** — the generator is handed `swim_pace_per_100_sec` and never reads it |
| Triathlon — standalone legacy | `generate-triathlon-plan/index.ts` | PARTIAL | **bypasses `week-optimizer`** — its day placement can disagree with combined |
| Season gate | `non-race-routing.ts:162` | BUILT | **needs ≥2 event goals**; a single-race athlete who ticks "combine" gets the goal rolled back and `combined_plan_unavailable` |
| Library plans | `src/services/LibraryPlans.ts:17` → `PlanSelect.tsx:1119` → `activate-plan` | PARTIAL | the **baker is disabled** (`PlanSelect.tsx:910`) |
| Materialize (tokens → steps, durations, weights) | `materialize-plan/index.ts:2536` | BUILT | has its **own inline token expander** at `:1123` — NOT `_shared/token-parser.ts` |
| Activate a plan (write rows to the calendar) | `activate-plan/index.ts` | BUILT | |
| **The calendar read (the ONLY path)** | `get-week/index.ts:33` | BUILT | client must never query `planned_workouts`+`workouts` for the calendar |
| The plan PIN (freeze targets at build) | `_shared/athlete-snapshot.ts:158` | PARTIAL | see cross-cutting risks — 5 of 8 categories null, one reader, absent on strength plans |
| Week optimizer (sole day-placement authority) | `_shared/week-optimizer.ts:1075` | BUILT | only `generate-combined-plan` routes through it |
| Same-day compatibility matrix | `_shared/schedule-session-constraints.ts:148` | BUILT | |
| Pause / resume / end / delete plan | `pause-plan` · `resume-plan` · `end-plan` → `_shared/end-plan-core.ts:8` · `delete-plan` | BUILT | pause and end **delete all future planned rows** |
| Drag-reschedule | `validate-reschedule/` + `WorkoutCalendar.tsx:397` | PARTIAL | athlete IS asked — but confirm also **silently deletes same-type conflicting planned rows** (`:431`), which the popup never mentions |
| Auto-attach a completed workout to its planned row | `auto-attach-planned/index.ts` | BUILT | |
| Sweep a week (materialize missing + attach) | `sweep-week/index.ts:22` | BUILT | fires on calendar load |
| Extract races from free text | `extract-races/index.ts` | BUILT | Claude + web search |

### What can CHANGE a plan after it's built — and is the athlete asked?

| change | trigger | asked? |
|---|---|---|
| **Strength weight auto-progression / deload** | `adapt-plan` action=`auto`, fire-and-forget from **every workout ingest** + cron (`adapt-plan:1161/1188`) → `materialize-plan:1232` rewrites future rows | **NO — silent.** Only trace is `plan_adjustments.reason`. ⚠️ It also **skips the Arc fatigue/taper/adherence gate** that the *suggest* path applies (`buildAdaptSuggestionGates:484` is only called in the suggest branch) — so a bump too risky to **suggest** still gets **written**. |
| Strength week relayout | `adapt-plan:750` on plan-JSON fingerprint change | NO on auto; YES on suggest→accept |
| Manual 1RM override | `StrengthAdjustmentModal.tsx:82` → `materialize-plan` | **YES** — athlete initiates. Mounted at `StateTab.tsx:1370`. |
| Drag-reschedule | `WorkoutCalendar.tsx:397` | PARTLY (see above) |
| Sweep | on week load | NO (idempotent) |
| Pause / End | athlete or `GoalsScreen.tsx:911/971` (auto) | YES / **NO on the auto path** |

> **The consent path exists and is well-built — and it is half-unreachable.** `adapt-plan` `suggest`→`accept` includes *"you got fitter, update your easy pace / FTP?"* (`:349-422`, applied `:935-990`). Its **only** Accept button lives in `CoachWeekTab.tsx:914`, which is **unmounted**. Meanwhile `useCoachWeekContext.ts:570` invokes `adapt-plan` on every State mount, merges the suggestions into the payload by hand, and **drops them on the floor.**

---

## STATE · COACH · ARC · LEARNING

**Only ONE mounted surface consumes the coach: `AppLayout → ContextTabs → StateTab`.**

| capability | entry point | status | note |
|---|---|---|---|
| Weekly snapshot (`athlete_snapshot`) | `compute-snapshot/index.ts` | BUILT | ⚠️ `state_trends_v1` is written **only for the current week** (`:641`); historical rows get null |
| The spine (`state_trends_v1` — per-discipline verdicts) | `_shared/state-trend/assemble.ts:104` | BUILT | server AND client both call it — two execution sites, one code path |
| Weekly coach payload (`weekly_state_v1`) | `coach/index.ts:5051` | BUILT | `COACH_PAYLOAD_VERSION = 95` (`:129`) — **bump it when the payload shape changes or stale caches pass the gate** |
| Week narrative (LLM prose) | `coach/index.ts:4838` (`runGuardedNarrative`) | BUILT | rendered via `wsv.coach.narrative` (`StateTab.tsx:1272/1456`). The **top-level** `week_narrative` key is a dead duplicate. |
| Readiness chip + why + suggestion | `coach` → `weekly_state_v1.trends.readiness_*` | BUILT | |
| Race readiness / finish projection / block verdict | `_shared/race-readiness/` · `_shared/race-projections.ts` · `_shared/goal-predictor/` | BUILT | rendered on StateTab |
| **Goal-FREE race projections (5k/10k/half/marathon) on State RUN row** | `projectStandardRaces` (`_shared/race-readiness/index.ts`, D-309, 2026-07-22) | BUILT | reuses the VDOT engine with no goal; distance-unlocked on long-run distance; computed in `compute-snapshot` → `display.runFitness.projections` |
| **12-week efficiency chart (sparkline, State RUN row)** | `run.efficiency.series` (`assemble.ts`, D-311, 2026-07-22) → `EfficiencySparkline` (`StatePerformanceSection.tsx`) | BUILT | same points as the verdict, 84d window, recent-6 flagged; charts OUTPUT not LOAD; fills-as-you-build. Strength e1RM chart deferred on Q-197 (squat canonical split) |
| Off-plan adherence banner | `_shared/off-plan-banner.ts:37` | PARTIAL | ⚠️ returns *"On plan — strength on track"* to a Get-Stronger athlete with **zero runs** (`:66-71`); `computePrimaryAdherence` counts the primary discipline only. The honest sentence exists 3 lines above (`:28`) and is suppressed for exactly the athletes who need it. See `docs/SPEC-posture-flag.md`. |
| Learn fitness profile (FTP/pace/HR from history) | `learn-fitness-profile/index.ts` | BUILT | ⚠️ on `ingest-activity` it runs for **Garmin only** and is milestone-gated (`:1685-1705`) — a HealthKit athlete never learns from ingest |
| Athlete memory | `recompute-athlete-memory/index.ts` | BUILT | |
| The Arc bundle | `_shared/arc-context.ts` (1350 lines) | BUILT | 15+ importers, the widest-read module |
| `session_detail_v1` — the display contract | builder `_shared/session-detail/build.ts` · server `workout-detail/index.ts` · client `useWorkoutDetail.ts:109` | BUILT | 🟢 **the healthiest contract in the app** — one builder, one fetch, many dumb renderers |
| Readiness check-in (energy/soreness/sleep) | writer `StrengthLogger.tsx:3278` | PARTIAL | ⚠️ **the only write path**, and it's inside the strength logger. Endurance-only athletes can never check in. 3 server readers, 1 starved producer. |
| RPE capture | `PostWorkoutFeedback.tsx:322`, `CompletedTab.tsx:288`, `StrengthLogger.tsx:3118` | BUILT | nag: `check-feedback-needed` |

### The LLM — where it enters and what it can do

Gateway: `_shared/llm.ts:47` (`callLLM` — Anthropic, never throws, returns `null` on failure).

Entries: `coach:3783` (coaching prose) · `coach:4822` (**bypasses `callLLM`** — raw fetch, hardcoded model) · `coach:5004` (marathon readiness — DEAD path) · `_shared/session-detail/race-readiness-llm.ts:709` · `course-strategy/index.ts:559` · `arc-setup-chat` (DEAD).

**It can change: prose. That is all.** Every verdict, number, band, zone, projection and baseline is deterministic *before* the LLM is called and passed in as facts. `_shared/narrative-core/validate.ts` enforces it — on contradiction the prose is **dropped**, not the numbers. 🟢 **This is a genuine strength. Keep it.**

### DEAD — computed, shipped, and no mounted surface renders it

`plan_adaptation_suggestions` (`coach:3329`) · **`reaction`** — the training-reaction axis, the centrepiece of `CANON-arc-inference-model.md` (`coach:1711`; ⚠️ *the field is dead but the object is load-bearing internally — do not delete it*) · `training_state` (`:2683`) · `baseline_drift_suggestions` (`:1851`) · `marathon_readiness` (`:4849`, includes a second LLM call) · `interference` (`:3458`) · `next_action` (`:5499`) · `evidence` (`:5017`) · goal-predictor's `race_day_forecast` / `durability_risk` / `goal_profile` · `generate-overall-context` (the whole 550-line function) · `synthesizeHeadline` (`_shared/state-trend/headline.ts` — runs on **every** snapshot and **every** State render, and both throw it away).

Also dead: the LLM's `headline` and `next_session_guidance` — **parsed, typed, and discarded.** You pay for them.

---

## INTEGRATIONS · AUTH · ADMIN

**Strava tokens live in `device_connections`. Garmin tokens live in `user_connections`.** They do not share a schema, and Garmin leaks across both (`garmin-webhook-activities:51` falls back to `device_connections`).

| capability | entry point | status | note |
|---|---|---|---|
| Strava OAuth exchange | `strava-token-exchange/index.ts:33` | PARTIAL | `userId` from **body**, no JWT verification |
| Strava push webhook | `strava-webhook/index.ts:19` | BUILT | `verify_jwt=false` (correct); fans out to `ingest-activity` |
| Strava webhook subscribe/unsubscribe | `strava-webhook-manager/index.ts:16` | PARTIAL | no auth; client calls it with the **anon key** as bearer, so the request carries no identity **by construction** |
| Strava history import | `import-strava-history/index.ts:653` | PARTIAL | tokens supplied by the client |
| **Strava token refresh (standalone)** | `strava-refresh/index.ts:17` | 🔴 **DEAD + DEPLOYED + UNAUTHENTICATED** | takes `userId` from the body, **no auth check**, and **returns the access token** (`:93`). The anon key that reaches it is public. **Delete it.** Live refresh is `_shared/strava-access-token.ts`. |
| Garmin OAuth PKCE | `bright-service/index.ts:46` | BUILT | 🟢 the **only** integration fn that properly verifies the JWT |
| Garmin push webhook | `garmin-webhook-activities/index.ts:41` | BUILT | |
| Garmin read proxy | `swift-task/index.ts:58` | PARTIAL | OAuth token in a **query string**; allowlisted paths only |
| Push a workout TO Garmin | `send-workout-to-garmin/index.ts:71` | PARTIAL | the app's **only** outbound integration |
| Disconnect a provider | `disconnect-connection/index.ts:28` | BUILT | ✅ uses `requireUser` |
| **`disconect-connection` (misspelled)** | *no source in repo* — called at `Connections.tsx:495` | 🔴 **SEAM** | a real **deployed** function with **no source**, kept as a permanent fallback branch. Unknown behaviour. |
| Gear CRUD + mileage | `Gear.tsx:102`; mileage by **DB trigger** (`20260108_fix_gear_distance_trigger.sql`) | BUILT | no edge function |
| Admin console (backfills) | `WorkloadAdmin.tsx:17` | PARTIAL | 🔴 gate is **client-side only** — the 8 edge functions it invokes have **no server-side admin check** |

### Security posture (the B1 item)

- **9 of 87** functions import `_shared/require-user.ts`. **77 of 87** instantiate a service-role (RLS-bypassing) client.
- **Three competing auth idioms:** `requireUser` (verified) · inline `auth.getUser(jwt)` (verified) · **`_shared/bearer-auth.ts:17` (UNVERIFIED — decodes the JWT with `atob`, never checks the signature, trusts an attacker-supplied `sub`).**
- **No `_shared/cors.ts`** — all 87 hand-roll it.
- Sensitive functions taking identity from the **body** rather than a verified JWT: `strava-refresh`, `strava-token-exchange`, `strava-webhook-manager`, `import-strava-history`, `send-workout-to-garmin`, `import-garmin-history`, `swift-task`.
- No true secrets in the client. The anon key + project ref are hardcoded in **5 files** outside the shared client (`GarminPreview`, `GarminDataService`, `Connections`, `TrainingBaselines`) — rotating the key would silently break those five.

---

## THE DEAD LIST — zero callers

**100 directories under `supabase/functions/` · 11 empty · 87 real functions · 24 dead.**

**Empty directories (11)** — they have no files at all, and some have the most guessable names in the repo:
`analyze-workout` · `analyze-workout-ai` · `analyze-weekly-ai` · `activity-details` · `batch-recalculate-workloads` · `garmin-webhook-activity-details` · `Garmin-Workout-Export` · `generate-daily-context` · `run-migration` · `sweep-attach-history` · `test-db-connection`

**Dead functions (zero callers):**
`analyze-user-profile` · `arc-setup-chat` · `backfill-facts` · `backfill-planned-workload` · `backfill-routes` · `backfill-week-summaries` · `detect-cores` *(⚠️ this one starves the whole segment engine)* · `enrich-history` · `generate-plan` *(a validator that generates nothing)* · `generate-training-context` *(3.4k lines, dead twin of `coach`)* · `import-connect-history` · `process-workouts-batch` · `readiness` *(HTTP wrapper; everyone imports `buildReadiness` directly)* · `reingest-activity` · `restore-gps-track` · `save-location` *(yet `require-user.ts:12` cites it as "the proven pattern")* · `strava-refresh` *(see security note)* · `weekly-workload` *(the `weekly_workload` table is written and read only by itself — real weekly load is `session_load` + ACWR)*

**NOT dead despite zero in-repo callers** (external entry points — don't delete): `strava-webhook` (Strava push) · `garmin-webhook-activities` (Garmin push) · `notify-admin-signup` (Supabase Dashboard DB webhook, invisible to grep).

Also: `supabase/functions/garmin-webhook-activities-working.ts` — a stray 390-byte file at the functions root. Not a function, not imported.

**Dead client components:** `CoachWeekTab` · `BlockSummaryTab` · `non-race/non-race-intake-steps.tsx` (no importer at all) · `WorkoutSummary` → `WorkoutDetail` → `StrengthSummaryView` / `WorkoutMetrics` (transitively dead) · `WorkoutExecutionView` · `GarminAutoSync` · `WorkoutSummaryView` · `CleanElevationChart` · the five dropdown components · `plan_bake_and_compute.augmentPlan` (offline only).

---

## The 5 living docs

| Doc | What it is | Trust |
|---|---|---|
| `ENGINE-STATE.md` | current state: Solid / Known-broken / Questioned | ✅ **the most trustworthy** — the only doc that retracts its own claims in place |
| `DECISIONS-LOG.md` | WHY things are the way they are (D-NNN) | ⚠️ trust the entry you're reading; **do not** trust that an older one is still live |
| `OPEN-QUESTIONS.md` | noticed + left on purpose, or deferred (Q-NNN) | ⚠️ several stale — a Q is a **LEAD, not a verified bug report** |
| `POLISH-PUNCH-LIST.md` | the work queue | ⚠️ header lags |
| `CAPABILITY-MAP.md` (this) | does X exist + where | rebuilt 2026-07-13 |

Plus: **`START-HERE.md`** (the one-page onboarding — read it first) and **`LIFECYCLE.md`** (the loop: baselines → plan → pins → performance → state → learned → next plan).

> **The rot pattern, named:** these docs have excellent **forward pointers** and **no back-pointers**. D-283 knows it killed D-275; D-275 has never heard of D-283. The fix that closes a Q never returns to close the Q. **When you supersede an older entry, go back and annotate the older entry** — that one habit is what keeps all five honest.
