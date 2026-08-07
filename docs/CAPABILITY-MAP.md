# CAPABILITY MAP — "does X exist, and where?"

**Rebuilt from code 2026-07-13** (4 parallel readers, every row verified by code-read — not by trusting comments or the previous map). The previous version asserted a deleted code path was live, cited a decision number that was never written, was 16 coach versions stale, and omitted ~13 shipped subsystems. Treat this rebuild as the baseline; append to it, and **when you ship something that changes a row, change the row.**

**Purpose:** the lookup that stops us re-inventing shipped infrastructure. Before proposing to build ANYTHING, find the capability here, then grep its entry point and read it (`CLAUDE.md` top banner: **trace-before-build**). This app is BUILT — the job is wiring/continuity, not features.

**How to use:** Ctrl-F the capability. `BUILT` → don't rebuild, wire into it. `PARTIAL`/`SEAM`/`STUB` → that's the real edge. `DEAD` → it exists and nothing calls it; decide whether to mount it or delete it, but don't write a second one. Entry points are `file:approx-line` — **lines drift, grep the symbol.**

> **⛔ WHEN YOU ADD A ROW, SAY WHAT IT DOES FOR AN ATHLETE — not just where the code lives.**
> The 2026-07-13 audit found three fully-built, fully-tested engines that had **never run once**, and the owner could not remember what any of them were *for*, because every doc described them structurally (*"the rule set ships at `week-optimizer.ts:412`"*) and never in a sentence a runner would understand. **A capability nobody can describe is a capability nobody will wire up.** One plain sentence, then the file path.

### The FIVE that were BUILT, TESTED, and had NEVER EXECUTED (2026-07-13; +2 found 2026-07-25) — ⚠️ TWO HAVE SINCE BEEN WIRED (`place-week`, the 95% verdict gate); read the corrected rows below before citing this list ⟨A31⟩

| what it does for an athlete | where | why it never runs |
|---|---|---|
| **"Put my lifting on the same day as a hard leg session, so my other days stay free."** The strength-integration fork: dense days vs light days. | engine `_shared/week-optimizer.ts:412-417` · spec `docs/CONSOLIDATED-MODE.md` | **No wizard writes `integration_mode`** → `create-goal…:1921` reads the pref and therefore defaults every athlete to `'separated'` ⟨A31⟩ |
| **Stops the wizard accepting an IMPOSSIBLE week.** "4 days, 10 hours, hard, lots of strength" → it does the arithmetic and warns or refuses, showing the math. | `src/lib/day-count-gate.ts:237` · spec `docs/DAY-COUNT-GATES.md` | **Zero importers.** Nothing in the app calls it. ⚠️ Ships *after* consolidated mode — its matrix keys on `integration_mode`. |
| **"Am I getting faster on this stretch?"** Your own personal segments — the chunks of road you actually repeat. *(Deliberately replaces the per-route approach, which flip-flopped on real data.)* | `detect-cores` → `match-cores` → `compute-core-verdict` · spec `docs/DESIGN-segments.md` | **`detect-cores` has ZERO callers.** No cron, no button, no script → `route_cores` is always empty → all three stages produce nothing. |
| **"Place my lifting around my long run, my club night and my rest days."** Takes endurance pins + day/kind/label/`canSplitDay`, returns placed lifts, rest days and named compromises. Heavy legs first, 48h clear of long days, 24h of quality, stacking only where the athlete SAID they can split (Robineau 2016). | `shared/strength-system/place-week.ts` (**12 tests**) | **WIRED.** `strength-primary-plan.ts:62` imports `placeLiftingWeek` and calls it at `:908` as the fallback when `week-solver`'s `solve()` returns `unsolvable`; the solver owns the normal path (`:887`/`:896`). The hardcoded Mon/Tue/Thu/Fri grid is gone. ⟨A31⟩ ⚠️ Its rules are re-expressed as **D-325 §5's directional penalty pairs** (amended 2026-07-26); the capability is unchanged — ~~and still unreachable~~ **and now reachable, on the unsolvable-fallback branch only** ⟨A31⟩. ⛔ **It does NOT have hard walls and it already never returns empty** — it emits `compromises[]` (type `:151`, pushed `:299`/`:311`/`:359`/`:406`, returned `:414`) ⟨A31⟩. D-325's original "walls" rationale is **RETRACTED**; keep the `compromises[]` contract. It shares its clearance law with the optimizer (`:25`), so §0.6's "three placement authorities" reads better as **two placers on one law, plus a grid that reads none.** |
| **"Only raise my working weight when I've earned it."** Wendler's 95% validity check — ~~five reps~~ **one rep or more** at 95% of the working number, or it drops 10%. ⚠️ `VALIDITY_CHECK_MIN_REPS` is **1**, not 5 (`wendler-531.ts:368` — the prescribed `95% × 1+`, p23) ⟨A31⟩. Week 3 of every cycle already IS the 95% set, so the gate has a home. | `shared/strength-system/loading/wendler-531.ts:454` (`verdictFrom95Set`) · `:467` (`applyVerdict`) ⟨A31⟩ | **WIRED.** `verdictFrom95Set` → `loading/cycle-verdicts.ts:116` → `workingNumberForCycles` (`wendler-531.ts:519`) → `strength-primary-plan.ts:1275` + `rematerialize-strength-block/index.ts:167` (client taps at `StrengthLogger.tsx:4022`/`:6053`). `workingNumberForCycle` (`:210`) still steps by cycle index, but only on the FORECAST path, where `unknownMeans: 'advance'` deliberately preserves old behaviour for weeks that have not happened. ⟨A31⟩ |

### Added 2026-08-01 — things that exist and will be looked for

| what it does for an athlete | where | status |
|---|---|---|
| **"Am I sorer than usual — for me?"** Soreness against the athlete's OWN baseline (Z-score + a 4-of-6 persistence count), not a population number. | `_shared/cross-domain-carryover.ts` `resolveCurrentSoreness` (9 tests) — sibling of `resolveCarriedInSoreness`, which answers the different question *"what did I carry INTO this session"* | **BUILT + LIVE** on the BODY row (D-354). ⚠️ Silent until 5 entries, by design. |
| **"A rollup row must not sound more alarmed than its evidence."** | `_shared/state-trend/severity.ts` `capRollupTone` (5 tests) | **BUILT, ZERO CALLERS** — its only consumer was the BODY heart-rate row, deleted the same day (D-353 → D-354). ⛔ **Not dead code.** A rule waiting for the next rollup. Gaps: Q-236, Q-237. |
| **"Ease or push my running/riding volume."** | ⛔ **DOES NOT EXIST.** `adapt-plan` has `strength_progression`, `strength_deload`, `strength_relayout`, `endurance_pace_update`, `rematerialize` — paces yes, volume no. `StateAdjustLens.tsx` names it and says "coming next". | **NOT BUILT.** The soreness persistence line already points at this door. ⚠️ Would be the 5th plan-mutation path; Q-225 held the line at 4 — route through `rematerialize`. |

**Status legend:**
`BUILT` works end to end · `PARTIAL` works but fragile/incomplete (the note says how) · `SEAM` documented extension point, not built · `STUB` placeholder / invented numbers · `DEAD` exists, zero callers OR output never rendered.

---

## ⚠️ READ FIRST — the "I almost rebuilt this" list

**This section is the whole point of the doc.** Every item is something that exists, is hard to find, and has been (or nearly been) rebuilt.

1. **A run easy-pace resolver.** `src/lib/resolve-current-run-pace.ts:164` (`resolveCurrentRunEasyPace`; threshold twin at `:274`) is THE one (client + edge import it). ⟨A31⟩ A **second function with the same name** exists at `generate-combined-plan/science.ts:110` — different function, currently starved. Don't write a third; don't "fix" the second by deleting it. *(A session rebuilt this once. See CLAUDE.md.)*
2. **"Is this HR easy?"** → `_shared/easy-hr.ts:112` (`resolveRunEasyHrBand`). Already consolidated out of **five** disagreeing copies. Do not add a sixth.
3. **"What day does session X go on?"** → `_shared/week-optimizer.ts:1103` (`deriveOptimalWeek`) is the sole authority; the same-day matrix is `_shared/schedule-session-constraints.ts:337` (`ROWS` → `SAME_DAY_COMPATIBLE:362`) — note `:131` `ADJACENCY_HOURS_ROWS` is a different table (required gap hours). ⟨A31⟩ `generate-run-plan` and `generate-triathlon-plan` **not** routing through it makes the optimizer look absent. It exists; they're unwired.
4. **A run plan generator.** There are **five DEAD generator classes** in `generate-run-plan/generators/`, and `simple-completion.ts:89` exports a class named `SustainableGenerator` — **identical in name to the live one** in `sustainable.ts:92`. Editing the wrong file is a silent no-op. Only `sustainable` and `performance-build` are switched on (`generate-run-plan/index.ts:232`).
5. **A weekly training-context engine.** `generate-training-context/` (3.4k lines) is a **DEAD twin** of the live `coach` → `weekly_state_v1` path. It looks canonical and ships nothing.
6. **A "coach week" screen.** `CoachWeekTab.tsx` (1145 lines) is fully built, fully typed, and **unmounted**. The data is already on the wire. Mount it or delete it — don't build a third. ⚠️ **`BlockSummaryTab.tsx` WAS the other half of this and is DELETED (2026-08-01, D-350)** — unmounted since 2026-03-31, and the documented blocker (D-212: sole reader of `block_verdict`) had expired, since `StateTab.tsx:1805` reads it on a live surface. `CoachWeekTab` is the only one of the pair left; the same question stands for it.
7. **A daily readiness check-in screen.** `readiness_checkins` is a real table with three server readers, and its **only writer lives inside the strength logger** (`StrengthLogger.tsx:3278`). An endurance-only athlete can never check in. Most likely thing in the app to get rebuilt from scratch.
8. **The segment / "core" engine.** Three stages exist and are spine-wired (`detect-cores` → `match-cores` → `compute-core-verdict`), but **stage 1 has no caller** — no cron, no button, no script. So `route_cores` is always empty and the whole thing produces nothing. It looks unbuilt. It is **unstarted**.
9. **The ingest fan-out.** `analyze-workout/` no longer exists (all 11 empty stub dirs were deleted). `ingest-activity/index.ts:1499` fires ONE orchestrator, `recompute-workout`, which owns the ordered chain. Any new downstream step must register in `recompute-workout` (see `orchestrator-lib.ts`) and `bulk-reanalyze-workouts:36`. ⟨A31⟩
10. **A shared CORS helper.** There is no `_shared/cors.ts`. All 91 functions hand-roll it. ⟨A31⟩ Genuinely missing — but creating it means reconciling 87 copies, at least three of which differ.
11. **A "verify the caller" helper.** `_shared/require-user.ts` exists and is good. Adoption is **13 of 91**. ⟨A31⟩ `_shared/bearer-auth.ts` is a **second, unverified** implementation (decodes the JWT without checking the signature). Don't write a third — adopt the first, delete the second.
12. **Strava token refresh.** `strava-refresh/` is a complete, **DEAD** standalone function with the obvious name. The live logic is `_shared/strava-access-token.ts`. Someone told "add token refresh" will find the corpse first.
13. **A plan "baker".** `src/services/plans/tools/plan_bake_and_compute.ts:948` (`augmentPlan`) exists, works offline (`npm run bake`), and is **commented out in the app** (`PlanSelect.tsx:910-930`, "BAKER IS CRASHING SUPABASE"). Disabled, not missing.
14. **A plan-token expander.** TWO exist: the live one inline in `materialize-plan/index.ts:1840` (`expandTokensForRow`; `expandRunToken:1279`, `expandBikeToken:1676`) ⟨A31⟩, and `_shared/token-parser.ts` (which serves the **analysis** path, not plans). CLAUDE.md points at the wrong one.
15. **A marathon race-entry screen.** `GoalsScreen.tsx:2433` (`renderEventForm`) already takes name, date, distance, fitness, strength protocol + frequency and plan start date, and builds a plan. Marathon is in `DISTANCE_OPTIONS:115`. Do not build a second race form — the missing pieces are `extract-races` wiring and the hold cards, not the screen. ⟨2026-08-03⟩
16. **5s PRO / a low-fatigue 5/3/1 variant.** It is the `leader` cycle and it already ships: `wendler-531.ts:52` `setsForWeek('leader', …)` returns 5/5/5 with **no AMRAP**, and the training max is already **85%** of 1RM (`:88`). What does NOT exist is an all-leader block — `leaderCount:291` always leaves the last cycle an anchor. ⟨2026-08-03⟩
17. **An accessory "light vs loaded" dose axis.** `src/lib/strength-intensity-tier.ts` (`intensityTierForExercise`, D-376) already classifies every movement light / loaded / power. Do not add a second field for "is this a heavy accessory". ⟨2026-08-03⟩
18. **Race finish projection.** `_shared/race-projections.ts` (17 importers) is the answer. Six other modules orbit it (`riegel.ts`, `goal-finish-from-workouts.ts`, `resolve-server-predicted-finish.ts`, `resolve-goal-target-time.ts`, and two `race-finish-seconds.ts`).
19. **Backfills.** Six DEAD backfill functions already exist plus two empty dirs. Check the DEAD list before writing a seventh.

---

## Cross-cutting risks (read before touching a fact)

- **The plan pin only half-exists.** `_shared/athlete-snapshot.ts:158` (`buildAthleteSnapshot`) freezes targets at generation — but **5 of its 8 categories are hardcoded `null`** (`:178-182`): swim, equipment, intent, capacity, bio. Those re-resolve **live** on every materialize, so a mid-plan baseline edit silently moves them. Its only reader is `materialize-plan:3246` (`readAthleteSnapshotOrLive`). ⟨A31⟩ And **`generate-strength-plan` never calls it** → Get Stronger / Hyrox plans have **no pin at all**.
- **Both former bypass paths now reach the spine (fixed 2026-07-17).** `ingest-phone-workout:297` and `save-imported-workout:206` both fire `recompute-workout`, the single ordered orchestrator (auto-attach → summary → analysis → workload → facts → analyze → snapshot). `ManualSwimEntry.tsx:70` does the same. No known ingest path skips `compute-facts` today. ⟨A31⟩
- **`workouts.workload_actual` (the ACWR substrate) is written by ONE job** (`calculate-workload`) called from **two places**. Anything ingested another way contributes **zero to ACWR** while still counting toward `workload_total` — the same snapshot row can contradict itself.
- **The fan-out race was FIXED 2026-07-17.** `ingest-activity:1499` now fires ONE ordered orchestrator (`recompute-workout`), which awaits summary/analysis before facts. See the block comment at `ingest-activity:1485-1496` and `docs/AUDIT-fanout-ordering-2026-07-17.md`. ⟨A31⟩
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
| **run easy pace** | ✅ `src/lib/resolve-current-run-pace.ts:164` (`resolveCurrentRunEasyPace`) | ⟨A31⟩ server ✅ universal (D-287) | 🟡 client stragglers: `AllPlansInterface.tsx:664/791`, `StructuredPlannedView.tsx:352`, `PlanWizard.tsx:470`, `ArcSetupWizard.tsx:1693` |
| **1RM anchor** | ✅ `_shared/state-trend/capacity-resolver.ts:125` | ✅ | 🟢 **the model to copy.** Explicitly refuses raw `exercise_log.estimated_1rm` as truth. |
| **e1RM series (trend)** | `exercise_log.estimated_1rm` ← `compute-facts:124` | 3 readers, 2 estimators | 🟡 `state-trend/strength.ts:79`, `adapt-plan:1138`, `analyze-strength-workout:814`. 2026-07-23: names canonicalized/merged (D-312); big-4 e1RM 12-week **sparkline** on State (D-313). |
| **State output charts (12wk sparkline)** | run efficiency / strength e1RM / bike power series in `athlete_snapshot.state_trends_v1.display` ← `assemble.ts` | client `TrendSparkline` in `StatePerformanceSection.tsx` | 🟢 run+strength device-seen (D-311/313); **bike power fixture-only** (needs power-bin rides). Efficiency chart for endurance riders = Q-200. |
| **ACWR ratio** | ✅ `_shared/acwr.ts:155` | ✅ all 4 | 🟢 clean |
| **ACWR band/status** | ✅ `_shared/acwr-state.ts:31` (plan-aware) | **6 bypass it** | 🔴 `response-model/weekly.ts:313` is **plan-blind** and ships in the same payload. Taper week @ 1.15: canon says `elevated` (cap 1.1), copy says `optimal` (cap 1.3). |
| **fitness direction** | ✅ `_shared/state-trend/assemble.ts:750` (`rollupFitness`; `rollupFitnessDirection:785`) | ⟨A31⟩ ✅ | 🟢 clean. 2026-07-17: gains a `withheld` verdict below 8 qualifying runs (D-294) — direction is not asserted at low volume. |
| **fitness ANCHOR (band dot)** | ✅ `_shared/state-trend/baseline-derive.ts` → `fitness_baselines` table (D-294) | server ✅ + client `useStateTrends`→`StatePerformanceSection.tsx` | 🟢 auto-derived, rolling (shares the band's ~12wk window), crown-from-N. Run/bike anchored; swim `facts_only` until first RPE≥7 swim (Q-188). |
| **RPE / effort perception** | `_shared/athlete-snapshot/body-response.ts:323` (`makeTrend`; RPE call site `:399`) ⟨A31⟩ | — | 🔴 **`makeTrend` splits THIS WEEK's sessions in half BY ORDER.** Hard Monday + easy Friday = "improving"; swap the days = "declining". It is the **necessary** leg for the safety floor (`load-status-reconcile.ts:83-95`, D-266). Q-167. |
| **swim CSS** | ❌ none | — | ⚫ **ORPHANED.** Written by two engines (`learn-fitness-profile:355`, `compute-workout-analysis:772`), read by **nothing**. `planning-context.ts:238` `SWIM_CSS_LIVE = false`. 2026-07-17: swim is now DELIBERATELY grade-less on State (`facts_only`, D-293) — pace is fins/equipment-contaminated, so anchorless-for-grading is by design, not a fracture. A provisional swim anchor wakes on the first RPE≥7 swim (Q-188). |

---

## INVENTED NUMBERS (still live, mostly undisclosed)

Law 2 says measured ≠ inferred. These are inferred and presented as measured.

| number | file:line | athlete told? |
|---|---|---|
| squat / bench / deadlift 1RM = **135 lb** | `materialize-plan/index.ts:3200 / 3205 / 3215` | ⟨A31⟩ **NO** — console log only |
| overhead press 1RM = **95 lb** | `materialize-plan/index.ts:3219` | ⟨A31⟩ **NO** |
| hip thrust = `max(75, deadlift × 0.55)` | `materialize-plan/index.ts:3225` | ⟨A31⟩ **NO** (and derived from a possibly-invented 135) |
| swim pace = **1:30/100** | `materialize-plan/index.ts:2834` (used `:2863`) | ⟨A31⟩ **NO** — drives every swim `duration_s` |
| easy run pace = **10:00/mi** | `shared/strength-system/strength-primary-plan.ts:1185` (`FALLBACK_EASY_MIN_PER_MILE`, imported `:30`) | ✅ **YES** — `volume_notes` emitted at `:1709`, rendered `GoalsScreen.tsx:1644`. **The only disclosed one.** | ⟨A31⟩
| heat coefficient `DEFAULT_HEAT_K = 0.005` | `_shared/heat-adjust.ts:43` | self-declared "UNVALIDATED POPULATION PLACEHOLDER" |
| marathon pace = easy − 30 · threshold = 5K + 20 | `materialize-plan/index.ts:682 / 685` | ⟨A31⟩ NO |

**Net:** a brand-new athlete's first strength session is prescribed as a % of an invented 135 lb, and their first swim at an invented 1:30/100, with nothing on screen saying so. The run-pace lies were cleaned up by D-285 (`token-parser.ts:94`, `end-plan-core.ts:75`, `planning-context.ts:381` all now return null instead of guessing). Strength and swim were not.

---

## INGEST → PROCESSING → ANALYSIS

| capability | entry point | status | note |
|---|---|---|---|
| Garmin/Strava ingest → the ordered orchestrator | `ingest-activity/index.ts:1499` → `recompute-workout` | BUILT | ingest delegates the whole chain to `recompute-workout` (2026-07-17) | ⟨A31⟩
| Phone-recorded workout ingest | `ingest-phone-workout/index.ts:297` | BUILT | routes through `recompute-workout` (the ordered orchestrator) since 2026-07-17 — reaches `compute-facts` and the spine | ⟨A31⟩
| FIT-file import | `save-imported-workout/index.ts:206` | BUILT | routes through `recompute-workout` since 2026-07-17 — reaches `compute-facts` and the spine | ⟨A31⟩
| Garmin swim length/lap reconstruction | `swim-activity-details/index.ts:315` | PARTIAL | Garmin-only (hard 400 otherwise) |
| Lap-button (`OPEN`) workout step → Garmin | `send-workout-to-garmin/index.ts` (both step builders) + `materialize-plan` `_rlap_` hill token | BUILT 2026-08-06, **NOT device-verified — [Q-261]** | ⛔ a step with **no** time and no distance. Three places used to drop it; one coerced it to a **1-second** rest. [D-390] |
| Hard aerobic session, strength-primary block | `strength-primary-plan.ts` `hardRunSession` / `hillSession` / `flatSession` (+ `bikeQualitySession`); terrain menu `NonRaceBuilder.tsx` (Hard day = Run) | **BUILT — four run options + bike inferred [D-391]** | Run menu: 3-min hill (default) · treadmill · short hill `10×1 min` · flat (full VO2, no leg discount, separated from heavy legs by a **scored preference** in `week-solver.ts`). Bike = `4×4` Helgerud, inferred from `hard_day.discipline`. **[Q-260] CLOSED.** Cards device-verified; flat placement fixture-verified only |
| Executed intervals + overall pace/HR/power | `compute-workout-summary/index.ts` | BUILT | writes `workouts.computed.overall/intervals` |
| Zones, GAP series, power curve, best efforts, NP | `compute-workout-analysis/index.ts` | BUILT | ⚠️ **does NOT write `workout_analysis`** despite the name (`:2068` says so) ⟨A31⟩ |
| Deterministic per-workout facts | `compute-facts/index.ts:1650` | BUILT | the deterministic layer; also writes `exercise_log`, `session_load`; then calls `match-cores` + `compute-snapshot` |
| Per-session workload score | `calculate-workload/index.ts`; formulas `_shared/workload.ts` | BUILT | writes `workload_actual` — the ACWR substrate. **D-348 (2026-08-01): bodyweight counts as load** via `strengthSetVolume`, the ONE set rule shared with the PLANNED score and `compute-facts`' `total_volume_lbs`. Re-price history with `backfill-strength-load` (chunked; loop on `next_offset`) — scores are STORED, so a formula change without it spikes ACWR |
| Run / ride / swim / strength analysis | `analyze-{running,cycling,swim,strength}-workout/index.ts` | BUILT | ⚠️ the function is `analyze-swim-workout`, NOT `analyze-swimming-workout` |
| Aerobic decoupling (HR drift), runs | `compute-facts/index.ts:1022` | BUILT | first vs second half, ≥20 samples |
| Pace at easy HR | `compute-facts/index.ts:1069` + `_shared/easy-hr.ts:112` | PARTIAL | **starved** when both `learned_fitness.run_threshold_hr` and `run_max_hr_observed` are null |
| The one definition of "easy HR" | `_shared/easy-hr.ts:112` | BUILT | consolidated from 5 copies. **Do not add a sixth.** |
| Corrupt-HR / strap-artefact detection | `_shared/hr-plausibility.ts:145` | BUILT | |
| Grade-adjusted pace | `_shared/gap.ts:36` | BUILT | |
| Heat-adjusted route/efficiency trend | `_shared/heat-adjust.ts:372` | ✅ **BUILT + WORKS — not a stub** (measured 2026-07-31) | The regression LEARNS the coefficient per route and returns `still_learning` when the CI straddles zero — `DEFAULT_HEAT_K` is only the data-poor fallback. Run on real history it answered on all 5 clusters. ⛔ **Wired to the per-workout screen + `core-verdict` ONLY; State does not call it.** ⚠️ Starved: `temp_f` null on **49 of 164** rows (the documented race — `compute-facts` writes the route row before the analyzer fetches weather), `effort_adjusted_pace_sec_per_km` on **8 of 164** |
| Weather for a workout | `get-weather/index.ts:179` | PARTIAL | runs only; ordering bug above |
| Recompute one workout (the compensating path) | `recompute-workout/index.ts` | BUILT | analysis → facts → analyze. Use this, not bulk-reanalyze, for a correct single backfill |
| Bulk re-analyze | `bulk-reanalyze-workouts/index.ts:36` | BUILT | ⚠️ **only re-runs the analyzer** — facts + snapshot go stale |

**Segments / "cores":** `detect-cores` **DEAD (zero callers)** → `match-cores` PARTIAL (wired at `compute-facts:1827`, starved) → `compute-core-verdict` PARTIAL (wired at `compute-snapshot:873`, starved). **Built, spine-wired, produces nothing, because stage 1 is never invoked.**

---

## PLANS · GOALS · CALENDAR

| capability | entry point | status | note |
|---|---|---|---|
| **THE wrapper** — create a goal, build + activate a plan | `create-goal-and-materialize-plan/index.ts:2105` (`Deno.serve`) | BUILT | ⟨A31⟩ every plan path goes through here except `PlanWizard` |
| Season / combined (multi-sport) | `generate-combined-plan/index.ts:60` | BUILT | the most active engine; the only one wired to `week-optimizer` |
| Run race plan | `generate-run-plan/index.ts:47` (`Deno.serve`); approach switch `:232` | BUILT | only `sustainable` + `performance_build` are switched on. ⛔ **This — not `generate-combined-plan` — is what a SINGLE marathon goal actually builds** (`create-goal…:3489`). Its own phase structure (`generators/base-generator.ts:274`), own recovery weeks (`:411`, −30% volume `:640`), and it does NOT route through `week-optimizer` (audited 2026-08-03) | ⛔ **REBUILT 2026-08-06 — the marathon block is now a PRESCRIPTION with a computed prerequisite; read `ENGINE-STATE.md` → "HOW A MARATHON BLOCK IS BUILT, END TO END" before touching any number in it.** Long-run arc `src/lib/run-volume-tables.ts` (`buildLongRunArc`, `marathonPrerequisiteFor`, `longRunPeakWeek`) — shared with the intake, so both quote one arc. [D-392]…[D-398]
| `generate-plan` (the 4th generator) | `generate-plan/index.ts` | ⛔ **DEAD** | validation-only; generates nothing. Listed here so it stops being mistaken for a generator |
| Run non-race (capacity, retest head) | `create-goal…:2458` | BUILT | |
| **Get Stronger (strength-primary)** | `generate-strength-plan/index.ts:25` → `shared/strength-system/strength-primary-plan.ts` | PARTIAL | ⚠️ **No equipment gate — deliberately removed 2026-07-25** (`create-goal…:2440-2452`, "Do not reinstate an equipment gate"). Entry is gated on having all FOUR main-lift 1RMs, with a message. Still true: **no plan pin** (`generate-strength-plan` never calls `buildAthleteSnapshot`). ⟨A31⟩ |
| **The WEEK SOLVER** — which day each lift goes on | `_shared/week-solver.ts` (`solve()`); spec `docs/SPEC-week-solver.md` | **BUILT — SHIPPED** | Exhaustive recursion over 7 days per lift, pruned by hard law, scored lexicographically. **Four fates incl. REFUSAL — it never silently drops a session (§5.2b).** ⛔ Its `notes[]` are athlete-facing copy printed VERBATIM downstream; at-the-floor notes group on (anchor, distance, side) — D-331 |
| **The WEEK PREVIEW component** | `src/components/WeekGrid.tsx` | **BUILT — SHIPPED** | ⛔ **DO NOT BUILD A SECOND ONE.** Standalone on purpose: it renders the intake preview today and is meant to render RESCHEDULING on the State screen, so the athlete learns one picture. **It places nothing** — it prints what the solver returned. If it ever needs to work out where a lift goes, add an input to the solver |
| **The FOCUS FRONT DOOR** ✅ 08-05 | `GoalsScreen.tsx` bottom actions (Train/Race/Build) → `NonRaceBuilder` `entry` prop → `goal` / `train` / `tier` steps | **BUILT 2026-08-05 — pushed + client-deployed, NOT device-verified** | D-382/383/384. ⛔ `GOAL_ORDER` is a GOAL list; the entry cards are `ENTRY_ORDER` — feeding an entry id to `seedFromGoal` (`:816`) breaks the step count. ⛔ `GoalsScreen.tsx` is NOT deleted: it still owns `renderEventForm` (:2433), the only door to the ride/swim/tri/du race form. Run/Ride/Athletic/Build are `disabled` placeholders |
| **Strength intent tiers** (Strong/Heavy/Definition) | `NonRaceBuilder` `tier` step (`TIER_COPY`) | **UI ONLY — Strong is a PASS-THROUGH** | D-383. Strong = today's block, sends **no field**. Heavy + Definition dark until `SPEC-assistance-fix` §0–§7 lands. ⛔ The payload name is **not** `strength_tier` — that key already means the EQUIPMENT tier (`generate-strength-plan/index.ts`) |
| **The SCHEDULER screen** (intake) | `NonRaceBuilder.tsx` — `volume` + `schedule` steps | **BUILT — SHIPPED** | D-330. Replaced separate `run` / `bike` / `hardday` cards. The week draws live under the controls (debounced 400 ms) and the confirm step auto-builds it on arrival. ⚠️ Seeds `longRunDay: 'sunday'` / `longRideDay: 'thursday'` — the Thursday is unapproved, see POLISH-PUNCH-LIST |
| **Assistance slots** — the three accessory movements | `src/lib/assistance-menu.ts` (`resolveAssistance`, `ASSISTANCE_MENU`) | **BUILT — PUSHED, NOT DEPLOYED** | ⛔ **ONE SOURCE** — the intake dropdown and the composer both read it. Day-dependent (D-328): a pick that collides with the day's main lift is substituted; a pick on the wrong side of the plane is rebalanced (chins on bench day, rows on press day). **Never priced — the engine prescribes no weight for assistance, ever** |
| **Exercise SWAP sheet** (in the logger) | `StrengthLogger.tsx:4440`; `src/lib/exercise-alternatives.ts` (`getInSlotAlternatives`) | **BUILT — SHIPPED** | D-289 + D-290. On **every** exercise row incl. accessories. Filters on `pattern` + equipment, **not `primaryRef`** (a loading reference — filtering on it offered a bench press as a substitute for a row). `swapRestOfPlan` persists past today |
| **Hyrox accessory bias** | render `GoalsScreen.tsx:1660-1665` (gated on `config.accessory_bias === 'hyrox'`); equipment fallbacks `materialize-plan/index.ts:1169-1176` | **REMOVED FROM THE BUILD FLOW (D-323)** | `HYROX_ROTATION` no longer exists in `strength-primary-plan.ts`; `generate-strength-plan/index.ts:30` says `accessory_bias` is "no longer read"; `create-goal…:2577` says the add-ons are OUT of this flow and re-home to the Adjust tab. Nothing writes `accessory_bias` today, so the GoalsScreen card can never fire. | ⟨A31⟩
| Triathlon / 70.3 — via combined | `combine:true` → `generate-combined-plan` | BUILT | the intended tri path. ⚠️ **the swim leg is not anchored to the athlete's swimming** — the generator is handed `swim_pace_per_100_sec` and never reads it |
| Triathlon — standalone legacy | `generate-triathlon-plan/index.ts` | PARTIAL | **bypasses `week-optimizer`** — its day placement can disagree with combined |
| Season gate | `non-race-routing.ts:162` | BUILT | **needs ≥2 event goals**; a single-race athlete who ticks "combine" gets the goal rolled back and `combined_plan_unavailable` |
| Library plans | `src/services/LibraryPlans.ts:17` → `PlanSelect.tsx:1119` → `activate-plan` | PARTIAL | the **baker is disabled** (`PlanSelect.tsx:910`) |
| Materialize (tokens → steps, durations, weights) | `materialize-plan/index.ts:3018` (`Deno.serve`) | BUILT | has its **own inline token expander** at `:1840` (`expandTokensForRow`) — NOT `_shared/token-parser.ts` | ⟨A31⟩
| Activate a plan (write rows to the calendar) | `activate-plan/index.ts` | BUILT | |
| **The calendar read (the ONLY path)** | `get-week/index.ts:33` | BUILT | client must never query `planned_workouts`+`workouts` for the calendar |
| The plan PIN (freeze targets at build) | `_shared/athlete-snapshot.ts:158` | PARTIAL | see cross-cutting risks — 5 of 8 categories null, one reader, absent on strength plans |
| Week optimizer (sole day-placement authority) | `_shared/week-optimizer.ts:1103` (`deriveOptimalWeek`) | BUILT | only `generate-combined-plan` routes through it | ⟨A31⟩
| Same-day compatibility matrix | `_shared/schedule-session-constraints.ts:337` (`ROWS` → `SAME_DAY_COMPATIBLE:362`) | BUILT | `:131` `ADJACENCY_HOURS_ROWS` is a separate gap-hours table — do not confuse them | ⟨A31⟩
| Pause / resume / end / delete plan | `pause-plan` · `resume-plan` · `end-plan` → `_shared/end-plan-core.ts:8` · `delete-plan` | BUILT | pause and end **delete all future planned rows** |
| Drag-reschedule | `validate-reschedule/` + `WorkoutCalendar.tsx:397` | PARTIAL | athlete IS asked — but confirm also **silently deletes same-type conflicting planned rows** (`:431`), which the popup never mentions |
| Auto-attach a completed workout to its planned row | `auto-attach-planned/index.ts` | BUILT | |
| Sweep a week (materialize missing + attach) | `sweep-week/index.ts:22` | BUILT | fires on calendar load |
| Extract races from free text | `extract-races/index.ts:14` | BUILT | Claude + web search; returns MULTIPLE races sorted with A/B priority; `marathon` is in its distance enum. ⚠️ **Only caller is `ArcSetupWizard.tsx:836`** (+ `:1099` prior-finish). The call is a plain `functions.invoke` — the picker UI is inline in the wizard, not a component |

### RACE / MARATHON ENTRY — audited 2026-08-03, **materially changed 2026-08-04/05**

⛔ **READ [`STATE-race-builder-2026-08-05.md`](STATE-race-builder-2026-08-05.md) BEFORE USING THE TABLE
BELOW.** Twelve changes shipped after this table was written, and three of its rows are now wrong in
the direction that causes rebuilds — the capability exists and is now *fed*, where the table says
bypassed or unread. Corrected rows are marked ✅ 08-05 inline. The state doc also carries what is
still open, including the intake's shape and the owed solver collapse.

| capability | entry point | status | note |
|---|---|---|---|
| **Day placement reads the athlete's pins** ✅ 08-05 | `generate-run-plan/generators/assign-days.ts` ← `base-generator.assignDaysToSessions` (six generators) | **BUILT 2026-08-05** | ⛔ Was a hardcoded grid (long run Sunday, quality Tue/Thu, Saturday shut) that no input could change, so `preferred_days.long_run` / `.quality_run` were collected and never read. Rest day is now DERIVED as the day before the long run — its old comment shows Saturday always meant that. ⚠️ **Narrow stopgap, not the solver** (`SPEC-week-solver` §7 still owed) |
| **Training intent reaches the approach** ✅ 08-05 | `NonRaceBuilder` payload `training_intent` → `create-goal…:2366` | **FIXED 2026-08-05** | ⛔ `training_intent` was a hardcoded `'completion'` and is read FIRST, returning before `goal_type` — so **every race built `sustainable`**, no tempo or intervals, whatever the athlete picked |
| **Strength on a race build** ✅ 08-05 | `NonRaceBuilder` "Your week" → `strength_protocol` / `strength_intent` | **BUILT 2026-08-05** | Three options; heavy = `neural_speed` (Rønnestad, 85–90% 1RM, freq stays 2). ⚠️ Server honours a protocol only at `strength_tier === 'strength_power'` (barbell on file) — the downgrade is now stated, not silent |
| Static week floors | `create-goal…:226` `MIN_WEEKS` (marathon 14/10/8 by fitness); tri twin `:219` `TRI_MIN_WEEKS` | ~~PARTIAL — bypassed~~ **LIVE 2026-08-04** | ⚠️ The refusal was re-enabled — see `non-race-routing.ts` `resolveMarathonFloorWeeks` / `marathonTimelineRefusal`. It is the ONE hard wall on this path |

| capability | entry point | status | note |
|---|---|---|---|
| **Race goal entry in the Goals flow** | `GoalsScreen.tsx:2433` (`renderEventForm`) → `handleSaveEvent:1335` | **BUILT** | ⛔ **A marathon goal + plan can be created TODAY from Goals.** Marathon is in `DISTANCE_OPTIONS:115`. What it does NOT have: `extract-races` (the race is typed by hand), the hold cards, and it routes to `generate-run-plan` |
| Static week floors | `create-goal…:226` `MIN_WEEKS` (marathon 14/10/8 by fitness); tri twin `:219` `TRI_MIN_WEEKS` | **PARTIAL — bypassed** | `floorWeeks` is computed at `:3137` and only used as the fallback inside the DISABLED branch |
| `fitness` (drives every floor) | server `create-goal…:2364`; seeded client-side `GoalsScreen.tsx:540` (vDOT ≥45/≥33, else weekly miles ≥30/≥12, else `'intermediate'`), override at `:2533` | PARTIAL | data-seeded when baselines exist, **self-claimed otherwise, always overridable** |
| **Adaptive marathon decision** | `_shared/athlete-memory.ts:351` `resolveAdaptiveMarathonDecisionFromMemory` ← called `create-goal…:3221` | BUILT | `readiness_state` from `modeFromWeeksOut:343` (≤2 race_support, ≤6 bridge_peak, ≤10 compressed_build, else full_build); `recommended_mode:401`; `risk_tier:425`; `minimum_feasible_weeks:394` |
| ⛔ **No-history claimed-advanced hole** | fallbacks `athlete-memory.ts:381` — advanced **3**, intermediate 4, beginner 6 weeks | ⛔ **GAP** | With no `athlete_memory`, a self-claimed "advanced" athlete gets `minimum_feasible_weeks: 3`. `MIN_WEEKS.marathon.advanced = 8` never applies |
| ⛔ **The "race too close" refusal is dead code** | `create-goal…:3276` | ⛔ **GAP** | Gated on `!ADAPTIVE_MARATHON_DECISIONS_ENABLED`, and the flag **defaults ON** (`:232`). Nothing refuses a too-close marathon today |
| `race_support` / `bridge_peak` build lengths | `create-goal…:3285-3293` | BUILT | race_support caps the plan at 2 weeks, bridge_peak at 6, else `max(floor, min(weeksOut, 20))`. Legacy race-week variant at `:3258` |
| Taper width | `generate-combined-plan/science.ts:903` `taperWeeks` (distance × priority) | BUILT | |
| Deload / loading pattern | `phase-structure.ts:587` `applyLoadingPattern` (3:1 / 2:1 / 1:1), chosen `:630` | BUILT | |
| Phase timeline (combined) | `phase-structure.ts:84` `buildPhaseTimeline`; single race `:337` | BUILT | |
| **5/3/1 on a RACE plan** | routing gate `create-goal…:2432` | ⛔ **GAP — UNREACHABLE** | The gate needs strength `develop` AND **no endurance developing**, so a race goal can never reach `wendler-531.ts`. Race strength comes from `session-factory.ts:2577` `runStrength` / `:2393` `triathlonStrength` off the 8-protocol registry (`protocols/selector.ts:18`) — Wendler is not in it |
| Race-plan strength frequency | `week-builder.ts:110` `strFreqForPhase` | BUILT | base 2 / build 1 (2 if performance) / taper **1** — i.e. lifting continues into race week per `STRENGTH-PROTOCOL.md §3.7` "Taper Priming" |
| Race-plan protocol selection | `create-goal…:765` from `strength_focus` (power → `neural_speed`, else `durability`); athlete pick `GoalsScreen.tsx:1370` | BUILT | |
| **Hold-card DOSE fields never reach a race generator** | written `NonRaceBuilder.tsx:405/409/412`; read only by `generate-strength-plan` | ⛔ **GAP** | `target_weekly_ride_hours`, `ride_days`, `swim_days`, `target_weekly_miles`, `run_days`, `assistance_picks`, `lifting_days` — all strength-path only |
| Hold-card POSTURE field DOES reach combined | `per_discipline_posture` → `phase-structure.ts:353`, `week-builder.ts:2239`, `validator.ts:325`; zero-sum redistribution `science.ts:795` (D-210) | BUILT | ⚠️ `generate-run-plan` only reads a derived `endurance_posture` to cap strength frequency (`types.ts:31`) |
| ⛔ **The frequency matrix is triathlon-only** | `src/lib/session-frequency-defaults.ts:262` (`sport` defaults `'triathlon'`); `running`/`cycling`/`hybrid` **throw** at `:266` | ⛔ **GAP** | No caller passes `sport` — `ArcSetupWizard.tsx:657`, `:2022`, `reconcile-athlete-state-week-optimizer.ts:128`. A run-only goal is issued swim/bike counts, taken as a floor at `reconcile…:167`, placed, then dropped at `week-builder.ts:2239` |
| Season gate (≥2 event goals) | `arc-setup-persistence.ts:465` (`combine = eventGoals.length >= 2`); server force at `create-goal…:2208` | BUILT | ⚠️ **one marathon → `combine:false` → `generate-run-plan`.** Non-race goals are force-combined, so the Focus flow already uses the combined engine and a single race does not |


### What can CHANGE a plan after it's built — and is the athlete asked?

| change | trigger | asked? |
|---|---|---|
| **Strength weight auto-progression / deload** | ⛔ **DELETED 2026-07-23 (D-315).** The silent auto-write on every ingest is gone (consent-first, extends D-285). Weights now change ONLY on the athlete's tap: State adjust modal, `adapt-plan` accept, or a swap/add. The `suggest` path still computes the progression signal (now phase-aware, matching the stamped target); the State strength row surfaces it; the athlete applies it. | **YES — always asked now.** |
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
| Weekly snapshot (`athlete_snapshot`) | `compute-snapshot/index.ts` | BUILT | ⚠️ `state_trends_v1` is written at `compute-snapshot/index.ts:1103` (guard `:1094`) — re-verify the "current week only" claim before relying on it ⟨A31⟩ |
| The spine (`state_trends_v1` — per-discipline verdicts) | `_shared/state-trend/assemble.ts:248` (`assembleStateTrends`) | ⟨A31⟩ BUILT | server AND client both call it — two execution sites, one code path |
| Weekly coach payload (`weekly_state_v1`) | `coach/index.ts:5490` (returned `:5958`) | BUILT | `COACH_PAYLOAD_VERSION = 155` (`:137`) — **bump it when the payload shape changes or stale caches pass the gate** | ⟨A31⟩
| Week narrative (LLM prose) | `coach/index.ts:5122` (`runGuardedNarrative`, imported `:66`) | ⟨A31⟩ BUILT | rendered via `wsv.coach.narrative` (`StateTab.tsx:1272/1456`). The **top-level** `week_narrative` key is a dead duplicate. |
| Readiness chip + why + suggestion | `coach` → `weekly_state_v1.trends.readiness_*` | BUILT | |
| Race readiness / finish projection / block verdict | `_shared/race-readiness/` · `_shared/race-projections.ts` · `_shared/goal-predictor/` | BUILT | rendered on StateTab |
| **Goal-FREE race projections (5k/10k/half/marathon) on State RUN row** | `projectStandardRaces` (`_shared/race-readiness/index.ts`, D-309, 2026-07-22) | BUILT | reuses the VDOT engine with no goal; distance-unlocked on long-run distance; computed in `compute-snapshot` → `display.runFitness.projections` |
| **12-week efficiency chart (sparkline, State RUN row)** | `run.efficiency.series` (`assemble.ts`, D-311, 2026-07-22) → `EfficiencySparkline` (`StatePerformanceSection.tsx`) | BUILT | same points as the verdict, 84d window, recent-6 flagged; charts OUTPUT not LOAD; fills-as-you-build. Strength e1RM chart deferred on Q-197 (squat canonical split) |
| Off-plan adherence banner | `_shared/off-plan-banner.ts:37` | PARTIAL | ⚠️ returns *"On plan — strength on track"* to a Get-Stronger athlete with **zero runs** (`:66-71`); `computePrimaryAdherence` counts the primary discipline only. The honest sentence exists 3 lines above (`:28`) and is suppressed for exactly the athletes who need it. See `docs/SPEC-posture-flag.md`. |
| Learn fitness profile (FTP/pace/HR from history) | `learn-fitness-profile/index.ts` | BUILT | ⚠️ on `ingest-activity` it runs for **Garmin only** and is milestone-gated (`:1562-1567`) ⟨A31⟩ — a HealthKit athlete never learns from ingest |
| Athlete memory | `recompute-athlete-memory/index.ts` | BUILT | |
| The Arc bundle | `_shared/arc-context.ts` (1350 lines) | BUILT | 15+ importers, the widest-read module |
| `session_detail_v1` — the display contract | builder `_shared/session-detail/build.ts` · server `workout-detail/index.ts` · client `useWorkoutDetail.ts:109` | BUILT | 🟢 **the healthiest contract in the app** — one builder, one fetch, many dumb renderers |
| Readiness check-in (energy/soreness/sleep) | writer `StrengthLogger.tsx:3278` | PARTIAL | ⚠️ **the only write path**, and it's inside the strength logger. Endurance-only athletes can never check in. 3 server readers, 1 starved producer. |
| RPE capture | `PostWorkoutFeedback.tsx:322`, `CompletedTab.tsx:288`, `StrengthLogger.tsx:3118` | BUILT | nag: `check-feedback-needed` |

### The LLM — where it enters and what it can do

Gateway: `_shared/llm.ts:47` (`callLLM` — Anthropic, never throws, returns `null` on failure).

Entries: `coach:3901` (`generateCoaching`, coaching prose) · `coach:5102` (**bypasses `callLLM`** — raw `fetch('https://api.anthropic.com/v1/messages')`) · `coach:5131` (marathon readiness — DEAD path) ⟨A31⟩ · `_shared/session-detail/race-readiness-llm.ts:709` · `course-strategy/index.ts:559` · `arc-setup-chat` (DEAD).

**It can change: prose. That is all.** Every verdict, number, band, zone, projection and baseline is deterministic *before* the LLM is called and passed in as facts. `_shared/narrative-core/validate.ts` enforces it — on contradiction the prose is **dropped**, not the numbers. 🟢 **This is a genuine strength. Keep it.**

### DEAD — computed, shipped, and no mounted surface renders it

`plan_adaptation_suggestions` (`coach:3424`) · **`reaction`** — the training-reaction axis, the centrepiece of `CANON-arc-inference-model.md` (`coach:1753`; ⚠️ *the field is dead but the object is load-bearing internally — do not delete it*) · `training_state` (`:2778`) · `baseline_drift_suggestions` (`:1893`) · `marathon_readiness` (`:5131`, includes a second LLM call) · `interference` (`:3418`) · `next_action` (`:5950`) · `evidence` (`:5299`) ⟨A31⟩ · goal-predictor's `race_day_forecast` / `durability_risk` / `goal_profile` · `generate-overall-context` (the whole 550-line function) · `synthesizeHeadline` (`_shared/state-trend/headline.ts` — runs on **every** snapshot and **every** State render, and both throw it away).

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

- **13 of 91** functions import `_shared/require-user.ts`. **82 of 91** instantiate a service-role (RLS-bypassing) client. ⟨A31⟩
- **Three competing auth idioms:** `requireUser` (verified) · inline `auth.getUser(jwt)` (verified) · **`_shared/bearer-auth.ts:17` (UNVERIFIED — decodes the JWT with `atob`, never checks the signature, trusts an attacker-supplied `sub`).**
- **No `_shared/cors.ts`** — all 87 hand-roll it.
- Sensitive functions taking identity from the **body** rather than a verified JWT: `strava-refresh`, `strava-token-exchange`, `strava-webhook-manager`, `import-strava-history`, `send-workout-to-garmin`, `import-garmin-history`, `swift-task`.
- No true secrets in the client. The anon key + project ref are hardcoded in **5 files** outside the shared client (`GarminPreview`, `GarminDataService`, `Connections`, `TrainingBaselines`) — rotating the key would silently break those five.

---

## THE DEAD LIST — zero callers

**93 directories under `supabase/functions/` · 0 empty (the 11 empty stubs were deleted) · 91 with an `index.ts` · ~18 dead.** ⟨A31⟩

**Empty directories: NONE.** All eleven stubs (`analyze-workout`, `analyze-workout-ai`, `analyze-weekly-ai`, `activity-details`, `batch-recalculate-workloads`, `garmin-webhook-activity-details`, `Garmin-Workout-Export`, `generate-daily-context`, `run-migration`, `sweep-attach-history`, `test-db-connection`) have been deleted. `find supabase/functions -maxdepth 1 -type d -empty` returns none. ⟨A31⟩

**Dead functions (zero callers):**
`analyze-user-profile` · `arc-setup-chat` · `backfill-facts` · `backfill-planned-workload` · `backfill-routes` · `backfill-week-summaries` · `detect-cores` *(⚠️ this one starves the whole segment engine)* · `enrich-history` · `generate-plan` *(a validator that generates nothing)* · `generate-training-context` *(3.4k lines, dead twin of `coach`)* · `import-connect-history` · `process-workouts-batch` · `readiness` *(HTTP wrapper; everyone imports `buildReadiness` directly)* · `reingest-activity` · `restore-gps-track` · `save-location` *(yet `require-user.ts:12` cites it as "the proven pattern")* · `strava-refresh` *(see security note)* · `weekly-workload` *(the `weekly_workload` table is written and read only by itself — real weekly load is `session_load` + ACWR)*

**NOT dead despite zero in-repo callers** (external entry points — don't delete): `strava-webhook` (Strava push) · `garmin-webhook-activities` (Garmin push) · `notify-admin-signup` (Supabase Dashboard DB webhook, invisible to grep).

Also: `supabase/functions/garmin-webhook-activities-working.ts` — a stray 390-byte file at the functions root. Not a function, not imported.

**Dead client components:** `CoachWeekTab` · ~~`BlockSummaryTab`~~ (**deleted 2026-08-01, D-350**) · `non-race/non-race-intake-steps.tsx` (no importer at all) · `WorkoutSummary` → `WorkoutDetail` → `StrengthSummaryView` / `WorkoutMetrics` (transitively dead) · `WorkoutExecutionView` · `GarminAutoSync` · `WorkoutSummaryView` · `CleanElevationChart` · the five dropdown components · `plan_bake_and_compute.augmentPlan` (offline only).

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

| **Lifting-day count (3 or 4)** | `strength-primary-plan.ts` `liftingDays` · card at `NonRaceBuilder.tsx` step `lifting` | ✅ BUILT 2026-07-29, pushed not deployed. 4 default, 3 pairs the upper lifts, **week 3 always four days**. ⛔ Solver UNCHANGED — it gets one paired upper slot; do NOT relax `week-solver.ts:527`. D-332 |
| **Run-volume self-regulation** | `strength-primary-plan.ts` `SELF_REGULATED_MILES` | ✅ BUILT 2026-07-29. At/above 25 mi/wk the easy split is EVEN and the athlete places their own miles. Below, `distributeRunMiles` weights it. NOT a cap. D-333 |
| **Estimate trust ceiling** | `loading/wendler-531.ts` `trustedMaxRepsFor` / `advance_untrusted` | ✅ BUILT 2026-07-29. Above 8 reps (5 for deadlift) the bar STILL advances and the e1RM is marked. ⛔ `advance_untrusted` is NOT a member of `advance` — a `=== 'advance'` check misses it. D-335 |
| **Partner-facing protocol doc** | `docs/PROTOCOL-strength-focus-overview.md` | ✅ WRITTEN 2026-07-29. Two pages, every evidence row traced to a primary source. ⛔ If a claim in it stops matching code, the DOC is wrong. Keep the "Open, and not papered over" section |
| **The 5/3/1 primary source** | `/Users/michaelambp/Downloads/531_2nd_Edition_Hard_Copy.pdf` (Michael's machine, NOT in the repo) | ⚠️ Verified against 2026-07-29. ⛔ No copy is in the repo, so any claim of "the book was searched" is UNREPRODUCIBLE without asking Michael for the file. Two attributions were wrong before this was available |
| **Strength gain signal (the READ path)** | `_shared/state-trend/strength.ts` ← `exercise_log.estimated_1rm` ← `compute-facts:35` `estimate1RMRounded` (`src/lib/estimate-1rm.ts`, Wendler/Epley — D-339 retired Brzycki) ⟨A31⟩ | ⚠️ **PARTIAL and mapped in Q-227.** ONE input: Brzycki over the session top set. Cannot tell a week-3 AMRAP from an ordinary top set; the RIR confidence gate is STARVED (logger stopped asking); the difficulty tap writes and nothing reads; `advance_untrusted` has no reader. ⛔ Read Q-227 before touching State/Performance strength |
| **Per-set difficulty ("how hard did it feel")** | `StrengthLogger.tsx` → `strength_exercises` JSON | ⚠️ **SUPERSEDED — see the two rows below.** `strength_facts` DOES carry a `difficulty` field (`compute-facts/index.ts:1359`, written `:1438`/`:1462`/`:1492`) and `StrengthCompareTable.tsx:397/:458-460` renders it. The CAPTURE was removed 2026-07-30 (D-344); the field and historical data stay. ⟨A31⟩ |
| **e1RM provenance render** | — | ⛔ **NOT BUILT** (D-326 layer 3). "earned at week 3, unmeasured since" — `StatePerformanceSection.tsx` renders a bare number |
| **Ceiling-note dedup** | `strength-primary-plan.ts` `kind: 'ceiling'` → `strength-focus-copy.ts` | ✅ FIXED 2026-07-29. ⛔ Filter on the KIND, never on the text — a prose filter is how it double-printed in a shipped block |
| **The three words (how a set felt)** | `StrengthLogger` → `strength_exercises[].sets[].difficulty` → `compute-facts` → `workout_facts.strength_facts[].difficulty` | ⛔ **CAPTURE REMOVED 2026-07-30 (D-344), one day after D-338 shipped it** — `StrengthLogger.tsx:5556-5561`. The write path (`compute-facts` → `strength_facts[].difficulty`) and the historical render (`StrengthCompareTable.tsx:397`) remain; nothing new is logged. See the row below. ⟨A31⟩ |
| **The all-out set (the measurement)** | `set_plan[].amrap` → logger (blank reps + "all out") → `strength_facts.amrap_reps` / `.measured` | ✅ CAPTURED 2026-07-30 (D-338). ✅ **ACTED ON (D-341).** `strength_facts.amrap_reps` → `loading/cycle-verdicts.ts:116` → `verdictFrom95Set` → `workingNumberForCycles` (`wendler-531.ts:519`) → `strength-primary-plan.ts:1275` / `rematerialize-strength-block/index.ts:167`, proposed to the athlete from the logger (`StrengthLogger.tsx:4022`/`:6053`). ⟨A31⟩ |
| **Deload exclusion on the strength trends** | `compute-snapshot` resolves phase per DATE (`plan-phase.ts`) → `meta.phase` on the points → `deload.ts` | ✅ FIXED 2026-07-30 (D-338). ⛔ Was DEAD since the series was written — points carried no meta at all, so `exclude: isDeloadWeek` never fired once. Pinned in `strength-deload-exclusion.test.ts` |
| **Strength execution score** | — | ⛔ **DELETED 2026-07-30 for strength** (D-338). No strength app grades a session against its program; it produced 117% on an unattached session, gave 20 free points for a RIR term the protocol never asks, and narrated a plan the athlete was not on. Endurance keeps adherence. Replaced by a recomputed "Completed N of M" |
| **Strength auto-attach** | `auto-attach-planned` → `strengthSessionsShareTheWork` (`_shared/strength/match-exercises.ts`) | ✅ GATED 2026-07-30. Was date+type ALONE. Now requires a shared main lift; a declared swap fills the slot; fails OPEN when either side has no exercise list (Garmin imports). Will not steal a live claim |
| **Which protocol a plan is on** | `config.strength_protocol` (run/tri) **OR** `config.source === 'strength_primary'` | ✅ **CLOSED (D-340 / Q-230 Part A).** One resolver — `_shared/block-identity.ts:227` reads `config.strength_protocol`, `:235` falls back to `config.source === 'strength_primary'`. `coach/index.ts:58` imports it and ships it as `plan.block` (`:5893`). The WRITE side was fixed too: `generate-strength-plan/index.ts:233` now stamps `strength_protocol: 'strength_primary'`; `source` stays as the fallback for pre-existing blocks. ⟨A31⟩ |
| **Does State know the GOAL type?** | — | ✅ **SHIPPED (D-340 / Q-230 Part B).** `_shared/block-identity.ts:245` reads the goal row's `goal_type`; the coach payload carries `plan.block.goal_kind` + `goal_focus` (`coach/index.ts:5897-5898`). ⟨A31⟩ |
| **Block identity card** | `_shared/block-identity.ts` → `coach` payload `plan.block` + `session_detail_v1.block` | ✅ SHIPPED 2026-07-30 (D-340). Which protocol / goal / week / cycle / deload / measurement week / how effort is read. ⛔ Read-only — nothing that reads it may move a session or change a weight. **D-347 (2026-08-01): the State fitness rows + strength Performance now READ it**, and it carries `phaseWord` — the plain word a screen may print ('Leader'/'Anchor' are internal, never render `phase`) |
| **The app's ONE 1RM formula** | `src/lib/estimate-1rm.ts` (Wendler's own, = Epley) | ✅ SHIPPED 2026-07-30 (D-339). Imported by `compute-facts` AND the client. There were THREE before. ⛔ Do not add a fourth; no rep cap — reliability is carried as provenance |
| **All-out reps move the weight** | `rematerialize-strength-block` → planned rows | ✅ SHIPPED 2026-07-30 (D-341). PROPOSES; `apply: true` is the athlete's tap. Only weeks that have not started. Sheet lives in the logger at save |
| **Tested 1RM write** | `save-baseline-test` | ✅ SERVER 2026-07-30 (D-342). Two-phase — nothing written while any lift needs the Keep/Update call. Was on the phone |
| **Added / swapped exercise weight** | `resolve-exercise-weight` | ✅ SERVER 2026-07-30 (D-342). Returns WHICH branch answered (own max / last logged / baseline proxy / the 0.70 default) |
| **Swap options** | `src/lib/exercise-alternatives.ts` + `assistancePeersFor` in `assistance-menu.ts` | ✅ FIXED 2026-07-30 (D-343). Assistance rows get the PLAN's slot shortlist and respect the day's main lift; accessories never offer main lifts |
| **RUN fitness verdict** | `compute-snapshot` `runEffHistory` → `routeTrend` (`_shared/heat-adjust.ts`) → overrides `runFitness.efficiency` | ✅ **SHIPPED + DEPLOYED 2026-07-31 (D-346).** Speed-at-heart-rate across EVERY run, grade-adjusted, heat coefficient FITTED PER ATHLETE by joint regression and removed; CI-gated so it withholds rather than asserts. Replaces decoupling as the lead. ⚠️ The override must land on `efficiency` — `StatePerformanceSection` renders that, not the card verdict |
| **What heat costs this athlete** | same regression's `heatCoefPctPerF` → rendered on the RUN row | ✅ **SHIPPED 2026-07-31.** "Heat costs you about 20s a mile per 10°F warmer, measured on your own runs." Rounded/hedged, gated to a negative coefficient inside the published band. ⛔ Nobody else states the size — Garmin corrects silently, TrainingPeaks says "consider temperature" |
| **Run durability (decoupling)** | `state_trends_v1.run.decoupling` | 🔴 **SILENCED 2026-07-31, not fixed.** Its gate reads a field that says `steady_state` on all 25 runs, so hill sessions count. ⛔ The obvious fix fails a pinned regression — **[Q-232], a decision not a patch** |
| **Projected race times** | `projectStandardRaces` → `runFitness.projections` | ⚠️ **GATED 2026-07-31.** Hidden below 8 threshold readings (`runDirectionMinRuns`, the app's own bar). Printed finish times to the second off 3 samples. A TYPED target never qualifies |
| **A run's intent (steady vs hard)** | ⛔ **FOUR FIELDS, AND THE READER USES A FIFTH.** The gate reads `workout_analysis.heart_rate_summary.workoutType`. Also written: `classified_type`, `run_facts.workout_type`, `route_progress_metrics.workout_intent` | ⛔ **THIS ROW WAS WRONG THE DAY IT WAS WRITTEN — corrected 2026-07-31 ([D-346]).** D-345 wrote `run_facts.workout_type`, which **no gate reads**, and the claim "was never written, so every run was excluded" was false: the field the gate actually reads was populated all along, with `steady_state`, **on all 25 runs** — so nothing was ever excluded and hill sessions counted as steady. Three sessions in three days each wrote the intent to a different unread field |
| **Per-set difficulty ("the three words")** | — | ⛔ **REMOVED 2026-07-30** (D-344). The rep COUNT is the verdict; nothing ever read the word. Session RPE STAYS — `calculate-workload` reads it |
| **Strength session narrative** | — | ⛔ **DELETED for strength 2026-07-30**. Made three protocol-blind claims on a correctly-executed session. Run/ride/swim keep theirs |
