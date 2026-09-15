# TRUTH-MAP — who owns each fact, how the spine + Arc connect, where the picture fractures

**What this is.** The third companion to the screen docs, and the one that was missing. `SCREEN-INVENTORY.md` says *what each screen is*; `SCREEN-CONNECTIVITY.md` says *what each screen is wired to*. **This doc says, for each FACT the app shows, which layer OWNS it and whether every screen that shows it AGREES** — plus the verified fractures where they don't. It exists so a future session (or Claude) never has to re-trace the app to know where truth lives, and never drifts building a thing the app already does.

**Method.** Code-derived + adversarially verified 2026-07-09/10 (three read-only traces). Where a claim is load-bearing it carries a `file:line`. Update this the same session any authority or fracture changes.

**Root-cause note (why this doc exists):** on 2026-07-09 a session built a whole endurance-interpretation "engine" for a read the app already had (spine decoupling + the carryover RPE gauge), aimed at a screen it never pinned down, while the real fractures (strength self-contradiction, Baselines FTP) sat untouched. That is exactly what this map prevents.

---

## 1. The four truth layers (what each OWNS)

The app is **one shell** switched by state flags, not routes (`SCREEN-INVENTORY.md`). Underneath, truth lives in four layers. Each owns different facts; they are meant to be **layered, not parallel**.

| Layer | What it is | Owns | Written by | Key file |
|---|---|---|---|---|
| **user_baselines** | Your reference anchors | FTP, LTHR/max-HR, threshold + easy pace, swim CSS, 1RMs | you (Baselines screen) + `learn-fitness-profile` | `user_baselines.{performance_numbers, learned_fitness, configured_hr_zones}` |
| **THE SPINE** | Per-discipline fitness **verdicts** (trend/direction, not absolute numbers) | run durability + efficiency, bike power + efficiency, swim pace + rest, strength volume + e1RM, and the one rolled-up fitness direction | `compute-snapshot` (current week only) via `assembleStateTrends` | `athlete_snapshot.state_trends_v1` · `_shared/state-trend/assemble.ts` |
| **THE ARC** | The assembler that gathers everything AROUND the spine | goals, plan position, baselines, memory, projections, cycling CTL/ATL/TSB — and a **read-only pass-through of the spine** | `getArcContext` (reads, never writes the spine) | `_shared/arc-context.ts` |
| **THE COACH PAYLOAD** | The State screen's data bundle | LOAD/ACWR + reconciled verdict, BODY/RPE, the week headline, the b2 execution rows, per-lift verdicts | `coach` (reads spine cached + snapshot + response_model) | `weekly_state_v1` · `coach/index.ts` |

**The clean part:** the Arc **reads** the spine (`arc-context.ts:1185-1197`, "no computation, no write") ⟨A31⟩ — it does not mint a competing per-discipline verdict. Fitness direction, load, and RPE are each single-source. So the *core* of the app tells one story.

---

## 2. Which screen reads which layer (pointers; detail in SCREEN-CONNECTIVITY)

| Screen | Component | Reads |
|---|---|---|
| **State** | `context/StateTab.tsx` | Coach payload (`weekly_state_v1`) for LOAD/BODY/headline/b2/per-lift **+ the spine as assembled on the SERVER** (`useStateTrends` renders `weekly_state_v1.trends.display` verbatim — zero client math, no fallback assembly) for the Performance-section trends ⟨A31⟩ **+ Arc** for readiness/longitudinal |
| **Baselines** | `TrainingBaselines.tsx` | `user_baselines` raw (the only screen that does) + Arc for suggestions |
| **Workout · Performance tab** | `UnifiedWorkoutView`→`MobileSummary` | `session_detail_v1` (from `workout-detail`), which reads the spine **cached** |
| **Workout · Details tab** | `CompletedTab` / `StrengthCompletedView` | same `session_detail_v1` contract, read-only |

---

## 3. Per-fact authority table (the anti-drift tool)

For any fact, this says who owns it and whether the screens agree. **Before building anything about a fact, read its row.**

| Fact | Authority (single source of truth) | Read by | Coherent? |
|---|---|---|---|
| **Fitness direction** (improving/holding/sliding) | SPINE → `rollupFitnessDirection` (`assemble.ts:785`) ⟨A31⟩ | State (cached), coach (cached), workout-detail (cached), analyzers (via Arc) | ✅ one authority, one cache — the client stopped recomputing (`useStateTrends.ts:95-96`) | ⟨A31⟩
| **Load / ACWR / "balanced"** | one algorithm `_shared/acwr.ts:computeAcwr` (D-236); reconciled verdict = `load-status-reconcile.ts` (D-260) | State (from coach) | ✅ single-algorithm (dual-computed: snapshot persists, coach recomputes; equivalence-tested) |
| **RPE / "how it feels"** | one object `response-model/weekly.ts` `endurance.rpe` | State header, BODY row, readiness — all deref the same object | ✅ cannot diverge within a payload |
| **Run durability** (decoupling, Friel band) | SPINE `state_trends_v1.run.decoupling` | State (live), Performance tab (cached, but not currently rendered) | 🔴 **FRACTURED — corrected 2026-07-31 ([D-346]).** One authority, fed by a gate that discriminates nothing: `isSteadyAerobic(workout_type)` reads `heart_rate_summary.workoutType`, which is `steady_state` on **all 25** of this athlete's runs (an 11-minute jog and a hill session included). Hill drills reached the trend at 24.9% and State reported declining fitness. ⛔ **The "heat seam CLOSED (D-275)" claim below was FALSE for 18 days** — D-275 was reversed by D-283 and there is no heat filter. |
| **1RM anchor** (per-lift) | `resolveStrengthCapacity` — **typed wins** (D-231) | coach, materialize, per-lift verdict | ✅ **the model the others should copy** |
| **FTP** | `resolveCurrentFtp` (learned-first, ≥medium conf) | Baselines, Athletic Record, cycling analyzer — ALL through the resolver now | ✅ **CLOSED 2026-07-10/11** (was fracture #2 — see below) |
| **Strength trend** (volume / e1RM) | — | see fracture #1 | 🔴 **FRACTURE** — three engines on one screen |
| **Session drift** (is it steady, and what is the number) | `_shared/session-detail/session-steadiness.ts` decides steady; `drift-pct.ts resolveSessionDrift` gives the number; `vt1-window-drift.ts` windows a long session with sets | Performance tiles, Today's good-news line, State's drift chart, the fact-packet flags — all by import | ✅ **CLOSED 2026-09-12.** Was five answers: the boom line called the shared rule with no materials, `compute-snapshot` kept its own steady test plus a fourth fallback (`workout_facts.drift`) no other screen could reach, its second call site passed no interval flag, and `endurance-checkpoint` read `run_facts.hr_drift_pct` raw and printed it as "decoupling". Verified on a throwaway account, eight sessions, three seeds: Performance and State agree number for number. |
| **The plan line** ("Standard Focus · week 2 of 12") | `_shared/plan-line.ts` — one composer; `workout-detail` stamps `block.line`, `coach` stamps it on the State card, `get-week` stamps `weekPosition` | Performance lift header + run/ride tiles + swim card, State strength row, Today's date header | ✅ **CLOSED 2026-09-12.** Was four composers in three grammars, including a `Build` phase word defaulted before any evidence. The screens print; only Today adds the date, which it owns. |
| **Is this session indoors, and what is it called** | `_shared/indoor-session.ts` (the predicate, since 2026-09-09) + `src/lib/session-display-name.ts` (the words, 2026-09-12) | Today's cards, Performance header, the map placeholder, the imported-row name, CompletedTab's placeholder gate | ✅ **CLOSED 2026-09-12.** Was six naming ladders and three separate indoor tests; none of them ever called a RIDE indoors, so a trainer ride said "Ride" on every screen. |
| **Per-session execution** (exec % / analysis) | `session_detail_v1.execution` (`build.ts:837`) ⟨A31⟩ | Workout Performance/Details tabs | ✅ single-source (workout-only) |
| **Bike "how's the bike"** | split: spine `bike.power` trend vs Arc `cycling_fitness` {ctl,atl,tsb} | State / narrative | ⚠️ two adjacent reads, unreconciled (fracture #7) |

---

**✅/⚠️ #8 — HEART-RATE ANCHORS AND ZONES: PER SPORT (2026-08-20). Read the wording, it is deliberate.**

- **Threshold HR — CLOSED.** `resolveCurrentLthr` now takes a `sport` option (the pattern
  `resolve-current-max-hr` already set). The bike previously had **no owner** and three private chains
  (`compute-workout-analysis`, `calculate-workload`, `_shared/ride-easy-hr.ts`), none with the D-284
  sample-count gate. All three route through the resolver.
- **HR ZONES — CLOSED, and this was the bigger one.** One `zones` array, built from
  `runLTHR || rideLTHR` (run PREFERRED), was **priority 1 in `compute-workout-analysis:1580` for every
  discipline**, above every resolver. Rides were binned against RUNNING zones — cycling HR sits 5-10
  bpm under running at the same effort, so each ride landed a zone easy and the time-in-zone the 80/20
  read rests on was wrong for the bike. `TrainingBaselines` now writes `zones_run` / `zones_ride`; the
  shared `zones` stays as the fallback because **Strava genuinely has one set per athlete**.
- ⚠️ **`configured_hr_zones.threshold_heart_rate` — CLOSED FOR READERS, OPEN AS A DATA MODEL.**
  Nothing bike-related reads it. But `TrainingBaselines.tsx` **still writes it** — now only when one
  sport has an anchor, so it cannot be the wrong sport's, yet the field is still there and still filled
  from the run number in the single-sport case. ⛔ **Do not shorten this row to "closed."** The next
  session reads "closed" and stops looking. The real fix is the WRITER emitting per-sport fields only,
  not a guard on a reader.
- **The bike's threshold was a formula, and now is not.** Verified on the real account: 20 rides,
  high-confidence max HR, **zero** threshold candidates, and `90% of observed max (estimated)`
  published at `sample_count: 0`. The filter required a WHOLE RIDE to average 85-95% of max — real
  riding never does. `power_curve` now carries the HR *during* each best window, so the bike's
  threshold and its FTP describe one effort. ⚠️ No backfill; needs new rides.

**✅ #9 — ANCHOR READS ARE ENFORCED, NOT JUST DOCUMENTED (2026-08-20).** §5's rule ("read through its
resolver — never the raw column") had nothing behind it, so every new surface grew its own chain.
`_shared/anchor-resolver-lint.test.ts` froze 49 raw readers and the ledger MAY ONLY SHRINK; it is at
**32 — 26 legitimate, 6 swim (unowned by design)**. The spine, the Arc's coach text, race readiness,
the marathon builder and the goal builder were all routed. ⛔ The spine (`compute-snapshot`) had read
the learned threshold with **no confidence check at all** and fell back to a `performance_numbers`
spelling nothing writes; an unrelated 8-run floor is the only reason a contaminated 2-run read never
printed a race time on State.

---

## 4. The verified fractures (recorded so they're never rediscovered)

**Per-discipline cohesion verdict (traced + verified 2026-07-10):**
- ⛔ **RUN — NOT CLEAN. CORRECTED 2026-07-31, and this line is why the row was rebuilt fifteen times.**
  > **What this entry used to say:** *"RUN — CLEAN. One rendered authority; the model the others should copy. Heat seam closed by D-275 — heat-confounded runs are excluded from the substrate."*
  >
  > **Both halves were false.** (a) D-275 was **reversed by D-283**; there is no heat filter in the code, and this line kept presenting the dead decision as live. (b) The single authority is real but its **gate is a constant** — `isSteadyAerobic(workout_type)` reads a field that says `steady_state` on every run ever logged, so nothing is excluded and a hill session in 30°C heat lands on the durability trend as a clean steady measurement.
  >
  > ⛔ **THE COST OF THIS ONE LINE.** Fifteen decision entries touch this row (D-036 … D-345). A fresh session opens TRUTH-MAP, reads "RUN — CLEAN, the model the others should copy", concludes the symptom in front of it must come from somewhere new, and builds something new. Three separate sessions in three days wrote a run's intent into three different fields, none of which the gate reads. **A doc that says "clean" about a broken thing does not merely fail to help — it actively routes every future session away from the fault.**
- **RUN — the real state (2026-07-31).** One authority, starved gate, and a substrate that is under-filled: on 164 `route_progress_metrics` rows, `temp_f` is present on 115, `decoupling_pct` on 83, and `effort_adjusted_pace_sec_per_km` — the one column that table owns — on **8**. The heat-de-confounded same-route engine (`_shared/heat-adjust.ts`) is complete, tested, and wired to BOTH surfaces: the per-workout screen (`routeHeadline` via `session-detail/build.ts:17`) and the spine (`routeTrend` via `state-trend/assemble.ts:24`, called at `:345`), which is what the State run efficiency row renders. ⟨A31⟩
- **STRENGTH — CONTRADICTING (worst).** Three visible engines; the e1RM fact is computed from two different data trails (fracture #1).
- **BIKE — MIXED.** Fitness *direction* is clean — one rendered authority; the CTL/ATL/TSB "form" second engine (Arc `cycling_fitness`) is **internal-only, never rendered** (and there's even a *third* CTL/ATL/TSB in `analyze-cycling-workout.fitness_v1`, prose-only). But **efficiency has two visible engines** on State — spine 56-day HR-at-power vs coach 7-day HR-drift — only saved from a naked clash by the scope labels ("last 7 days" vs "trends over recent weeks"). (The **FTP fracture #2 is now CLOSED** — all reads route through `resolveCurrentFtp`, fixed 2026-07-10/11; see below.)
- **SWIM — BROKEN, not contradicting.** No two-engines-one-fact clash (rendered pace reads are single-sourced, D-182). The problems are: a single **provisional/`needs_data`** engine, **no swim-native display template** (falls through the endurance/run layout — Q-038 Layer 2, still open; the June duration-unit "2263% adherence" bug is FIXED), and the **CSS anchor is orphaned** — shown on Baselines but read by *nothing* in the swim session verdict, and even its plan-gen use is staged off (`planning-context.ts:238 SWIM_CSS_LIVE = false` ⟨A31⟩). More disconnected than FTP.


**🔴 #1 — Strength contradicts itself on the State screen (LIVE, worst).** Three engines, three windows, one screen:
- b2 7-day execution row ← coach `weekly_state_v1.strength_session_types_7d` (`useCoachWeekContext.ts:266`) ⟨A31⟩
- volume / e1RM trend ← **server-assembled** `state_trends_v1.display.strengthFitness` from `workout_facts.strength_facts` + `exercise_log.estimated_1rm`, rendered verbatim (`StatePerformanceSection.tsx:851`) ⟨A31⟩
- per-lift verdict ← coach `response_model.strength.per_lift` (`StateTab.tsx:1225`) ⟨A31⟩

Nothing forces them to agree → "e1RM improving" can sit above a lift verdict that says decline. **Fix = converge on one strength authority** (the D-231 `resolveStrengthCapacity` pattern is the template).

**✅ #2 — FTP: CLOSED 2026-07-10/11 (was: same anchor, three answers).** All FTP reads now route through the single `resolveCurrentFtp` resolver (learned-first at ≥medium confidence, else manual, else learned-low fallback). Fixed in a prior session (commits `d278cadd` cycling analyzer · `eae2d9aa` Baselines · `00dbc9f2` Plans-tab watts; Athletic Record already used it). Verified by code trace 2026-07-11 (reconciling prior-session work — this map was written before the fix and lagged). The former fracture:
- ~~Baselines showed manual-first~~ → now `resolveCurrentFtp` (`eae2d9aa`).
- Athletic Record showed learned-first via `resolveCurrentFtp` (was already correct).
- ~~`analyze-cycling-workout` read `performance_numbers.ftp` only, ignoring learned~~ → now routes through the resolver (`d278cadd`), so the power band the spine efficiency trend is built from matches what the screens show, and a learned-only rider gets a real band (no more null → no verdict).

**Still open (bike, separate):** efficiency has two *visible* engines on State (spine 56-day HR-at-power vs coach 7-day HR-drift) — contained by scope labels, lower priority. CTL/ATL/TSB triplication is latent (internal-only, never rendered). 1RMs use the same resolver pattern via `resolveStrengthCapacity`.

**⚠️ #3 — Metric easy-pace unit mislabel (latent).** Baselines hardcodes `/mi` (`TrainingBaselines.tsx:1314`; the formatters at `:510` and `:518` hardcode it too) ⟨A31⟩; AppContext stores `/km` for metric users (`AppContext.tsx:359`). Masked today only because the run analyzer is suffix-blind.

**✅ #4 — Live-vs-cached freshness fork: CLOSED.** There is no live client recompute any more — `useStateTrends` is a pure renderer of the server-assembled `state_trends_v1` (`useStateTrends.ts:1-6, 95-96`), so State and the Performance tab read the same cached contract by construction. The Performance-tab trend line is also not rendered (`MobileSummary.tsx:163`). ⟨A31⟩

**⚠️ #5–7 — drift risks (not visible contradictions):** client re-implements `FitnessVerdictDivergence` (D-212 mirror, `useCoachWeekContext.ts:70`); `arc-context.ts:369-392` (`projectionDirectionFromDelta`) copies race-readiness projection bands ⟨A31⟩; spine bike-trend vs Arc `cycling_fitness` unreconciled.

---

## 5. "Where does X belong" (so nobody drifts again)

- **A single session's quality / execution** → `session_detail_v1` (`build.ts`), rendered on the **workout Performance tab**. Planned = execution %, unplanned = analysis. This is the per-session home.
- **A multi-week trend / fitness direction** → the **spine** (`assembleStateTrends`); every surface reads it, don't compute a parallel one.
- **A reference anchor** (FTP, threshold, 1RM, CSS) → `user_baselines`, read through its resolver (`resolveCurrentFtp`, `resolveStrengthCapacity`) — never read the raw column past the resolver.
- **A weekly verdict for the State screen** → the **coach** payload (`weekly_state_v1`); the client renders it, never re-derives it (Law 4).
- **The endurance per-session read on RPE + decoupling already exists** — spine `run.decoupling` + the carryover RPE-vs-typical gauge (`cross-domain-carryover.ts`). Extend those, don't rebuild them.

## 6. Every number on Performance, Details and State (audit 2026-09-15)

> **Read-only audit, code as of commit `5137b3ee`+.** Traced from the rendered JSX back to the computing line by three read-only passes (Performance, Details, State); nothing was changed. `sf/` = `supabase/functions/`, `c/` = `src/components/`. **Source** = the field/book citation in the code or `STATE-SOURCES.md`; `OURS` = marked ours; `NONE` = searched (comments beside the constant + STATE-SOURCES) and found neither. **Flags:** `PHONE` = the phone changes the value (not plain formatting) · `TWO` = computed in two or more places that can disagree · `NO-SRC` = a threshold/constant/formula with no citation and no OURS marker. "(inferred)" = not followed end to end. Line numbers drift; re-grep before relying on one.

| Screen label | Shown on | Data source | Formula | Source | Computed in | Flags |
|---|---|---|---|---|---|---|
| **Performance — top tiles** | | | | | | |
| Plan line "Plan · week 2 of 12" | Perf, State, strength header, swim card, Today | `block.line` | plan name · week i of n | n/a | `sf/_shared/plan-line.ts`; `sf/workout-detail/index.ts:1277` | — |
| Workload "86" | Perf, Details, Today | `workouts.workload_actual` | power hours×IF²×100; run rTSS (NGP); swim sTSS IF³; HR Friel zones; else RPE×10/h | Friel "Estimating TSS", TrainingPeaks rTSS/sTSS; HR zone split OURS | `sf/_shared/workload.ts:172,620-704` (calculate-workload) | TWO: Today prints planned when actual missing (`c/TodaysEffort.tsx:1247`) |
| "usual 40–66" | Perf, Today | `load.typical_low/high` | 25th–75th percentile, same type, 90 d, ≥5 sessions | NONE | `sf/workout-detail/index.ts:967-997` | NO-SRC |
| Execution "88%" | Perf, Today | `execution.execution_score` | run 50 pace/50 duration; easy 50 intensity/50 duration; laps unmatched = duration; ride 70 power/30 duration; swim 50 pace/50 min(100,duration); server re-averages when 0 | NONE | analyzers (`analyze-running-workout:1514,1827,2028`; cycling `:1654`; swim `:408`); `build.ts:423-448` | TWO (summary step writes a different drift-based `overall.execution_score`, `compute-workout-summary:463`); NO-SRC |
| Duration "30 of 48 min" | Perf, calendar, Today, plan context | `completed_totals.duration_s` / `planned_totals.duration_s` | moving seconds ladder vs planned-length ladder; minutes rounded on phone | stop line 40:00/mi OURS; order of sources n/a | `sf/_shared/moving-seconds.ts`; `build.ts:750,802,1422` | PHONE (rounds; header line floors the same seconds, `c/SessionNarrative.tsx:357`); TWO (Execution duration half uses `overall.duration_s_moving` vs `total_duration_seconds`, `granular-pace.ts:488`) |
| Duration fallback "76%" | Perf | `execution.duration_adherence` | run tiered at 0.9/1.1; ride linear; swim raw ratio (can pass 100) | NONE | `granular-pace.ts:492-503`; cycling `:871`; swim `:411` | TWO (three formulas); NO-SRC |
| Drift "4.2%" | Perf, State drift chart, Today good-news line | `classification.decoupling.pct` | steady only; easy-portion window → run pace:HR → ride power:HR → HR halves | Friel; TrainingPeaks Pa:Hr/Pw:Hr; Viada p107; steadiness order + 75 s OURS | `build.ts:874-919`; `_shared/session-detail/drift-pct.ts`; `vt1-window-drift.ts`; `efficiency.ts:60-135`; `ride-physiology.ts:140` | TWO (Today's line skips the easy-portion window, `session-boom/line.ts:45`; drift arithmetic in 3 files) |
| Drift subtitle "1.2 over the 5% line" | Perf | `decoupling.line` | pct − 5 | Viada p107 | `build.ts:2520-2534` | TWO (5% defined in 4 files; at exactly 5.0 subtitle says not over, `driftReachesLine` says reached) |
| Open-water pace "92%" / "5s/100yd faster" | Perf | `execution.pace_adherence`; planned − done per 100 | swim adherence; subtraction on phone | NONE | `analyze-swim-workout:426`; `c/AdherenceChips.tsx:346` | PHONE; NO-SRC |
| **Performance — reading rows** | | | | | | |
| Header "6.2 mi · 52:10 · 74 → 78°F" | Perf | `completed_totals`, `weather.display` | m→mi; minutes floored; temp fallback on phone | n/a | `build.ts:165-181` | PHONE |
| Grade-adjusted pace "9:41/mi · raw 10:02" | Perf, Details | `avg_gap_s_per_mi`, `avg_pace_s_per_mi` | Minetti on moving seconds, 100 m grade window | TrainingPeaks NGP; Minetti 2002; Smyth & Muniz-Pumares 2020 | `sf/_shared/run-pace.ts`; `build.ts:987` | TWO (Details tile reads `computed.overall`, Perf reads `resolveRunGap` order, `run-scalars.ts:72-79`) |
| Pacing "Negative split — 12s/mi" | Perf | mile splits | half vs half; even within 15 s | NONE for 15 s | `sf/_shared/insights/run-insights.ts:81-103` | NO-SRC |
| Pacing (intervals) "6:43–11:11/mi"; ride "210W → 205W" | Perf | work reps; `derived.power_halves` | min–max; first→last; pedalling mean per half | 25 W floor NONE | `build.ts:1561-1611,1737` | NO-SRC (25 W) |
| Heart rate row "Held steady / over the 5% line / +8 bpm, typical +5" | Perf | decoupling; fact packet drift bpm | bands 5%, 10%; 3 bpm, 5 bpm, ±3 of typical; heat 75°F; terrain 3 bpm | 5% Viada p107; rest NONE (STATE-SOURCES 134 retired 75°F) | `build.ts:2002-2135` | NO-SRC |
| Efficiency (ride) "1.42" | Perf | `analysis.efficiency.efficiency_factor` | NP (or pedalling power) ÷ pedalling HR, 3 dp | Friel / TrainingPeaks EF | `ride-physiology.ts:131-137` | TWO (State EF = NP ÷ avg HR, 2 dp, `compute-facts:1263`) |
| Conditions "Hilly (640 ft) · 62% humidity" | Perf | fact packet | show at 15 m ride / 50 ft run / 50% humidity | NONE | `build.ts:1955-1978,2138-2167` | NO-SRC |
| vs similar "NP 141W vs 132W"; Limiter "(72%)" | Perf | `vs_similar_v1`; `primary_limiter.confidence` | NP − delta; ×100 | NONE | `build.ts:1510-1550,1708` | NO-SRC |
| Power (ride) "212 W against 200–220, 3 of 5 inside"; Intensity "IF 0.80" | Perf | intervals; fact packet | inside range, no allowance; NP/FTP | Coggan / TrainingPeaks | `analyze-cycling-workout:258-291` | — |
| Older run insights ("CV 7%", "HR dropped 22 bpm") | Perf | `adherence_summary.technical_insights` | bands 3/10 bpm, 5/8%, CV 5/10, drop 30/20/15/10 | NONE | `analyze-running-workout:4252-4336` | NO-SRC |
| Effort "RPE 6, hard" | Perf | `workouts.rpe` | CR-10 word | Foster session-RPE CR-10 | `sf/_shared/effort-words.ts`; `workout-detail:302` | TWO (Details reads `workout_metadata.session_rpe` first; save writes `rpe`, `c/CompletedTab.tsx:1495`) |
| Next "Tue Lower body: Hinge" | Perf | `next_session` | same-day other sport → next future → 14-day look-ahead | 14 d NONE | `workout-detail:735-800` | NO-SRC |
| Route trend "8 of 12 runs · 6 months · +2.1%", chart | Perf | `verdict`, `chart_points` | same-effort pace = pace×HR/mean HR; 183 d; months, units, trend line on phone | NONE | `workout-detail:912-951` | PHONE (`c/RouteDoorway.tsx:43-62,167`); NO-SRC |
| **Performance — interval table** | | | | | | |
| Pace / GAP cell | Perf | `actual_pace_sec_per_mi` / `actual_gap_sec_per_mi` | analyzer; single row = session totals; no GAP under 400 m | OURS (400 m) | `build.ts:518-577,840` | PHONE (row with no GAP shows raw pace, `c/EnduranceIntervalTable.tsx:314`, against STATE-SOURCES 151) |
| Row colour | Perf | `executed.band` | work rep inside its range, no allowance | Viada p231–235 | `_shared/session-detail/interval-compare.ts` | — |
| Watts / Dist / Time / BPM | Perf | `executed.*` | rounding | n/a | analyzers | PHONE (strides hidden by 900 s / 120 s, `EnduranceIntervalTable.tsx:171`) NO-SRC |
| Goal-race row "96%", pacing mark | Perf | `race_compare`, `pacing.variability` | 100×target/actual; bands 90–110, 80–120; CV 3/7/10 | OURS | `interval-compare.ts` | — |
| Goal / Projected / Actual race time | Perf | `race.*` | actual = `overall.duration_s_elapsed` | NONE | `analyze-running-workout:3114-3145` | TWO (moving-seconds race rule reads `metrics` elapsed, `moving-seconds.ts:75`) |
| **Performance — swim card** | | | | | | |
| Distance / Duration / Work · Rest / Pace per 100 / Avg HR | Perf, Details | `completed_totals`, `swim_pace_per_100_s` | moving ÷ distance in plan unit (default yd); elapsed pool time | n/a | `build.ts:752-802`; `_shared/swim/swim-pace.ts` | PHONE (yards when athlete imperial OR plan yd — metric plan + imperial athlete mislabels, inferred); TWO (Details picks unit from athlete setting) |
| Pool "25 yd"; Lengths; plan % pills | Perf, Details | `pool_display`; `workouts.number_of_active_lengths`; `swim_*_pct_of_plan` | resolved length; count; done/planned | 0.9144 m definition; 25 default OURS | `_shared/swim/pool-label.ts`; `swim-plan-share.ts` | PHONE (lengths read from the row) |
| **Performance — strength** | | | | | | |
| "Completed 4 of 5"; Total sets / reps; "46 of 50 reps" | Perf | `strength_counts/totals`, `reps_line` | counts, sums | n/a | `_shared/session-detail/strength-slots.ts` | — |
| All-out "225 × 7", "Rep PR", "Estimated max 255" | Perf, State | `strength_all_out` | last all-out in 40 sessions; Epley+Brzycki mean, nearest 5 lb | Viada p215; 40 sessions OURS (no ledger row) | `_shared/strength/all-out-set.ts:28-149` | TWO (test result adds average RIR to reps, `strength-facts-lib.ts:206`) |
| RIR chip "3.5 / 2 RIR" | Perf | `avg_rir`, `rir_concern` | average; colour ±1.0, last-set rule | NONE | `analyze-strength-workout:560-598` | TWO (number = average, colour = last set); NO-SRC |
| Volume "2,430 → 2,015 lb" | Perf | `volume_lb` | weight×reps; (bw+added)×reps chin-up/dip | Hevy / Strong | `build.ts:2420-2517`; `workload.ts:409` | PHONE (set weight rounded to whole lb, `StrengthCompareTable.tsx:291`) |
| Strength duration "52 min" | Perf | `workouts.duration` | read from row on phone | n/a | — | PHONE |
| Test "e1RM 210", "updated / kept" | Perf | `test_result` | stored log; updated when ≥ stored; 2.5 lb flat band | Viada p215; rule NONE | `analyze-strength-workout:703-813` | NO-SRC |
| **Details — tiles (run, ride, swim)** | | | | | | |
| Distance | Details, Perf, Today | `display_metrics.distance_km` | computed distance, else column | n/a | `compute-workout-analysis:1898`; `workout-detail:1913` | TWO (swim: Details phone reads `computed.overall.distance_m`, Perf reads raw column) |
| Duration (elapsed) | Details, Perf swim | `display_metrics.elapsed_s` | clock seconds, else sample span | n/a | `compute-workout-analysis:1915,1949`; `workout-detail:1920` | PHONE (swaps to moving when elapsed missing; fallback max(elapsed, moving)); TWO (Strava elapsed stored in whole minutes can read shorter than moving, inferred) |
| Moving Time | Details, Perf, calendar, Today | `moving_seconds` | 9-step ladder | order n/a; under-1000-is-minutes convention unmarked | `sf/_shared/moving-seconds.ts:55-149` | PHONE (fallback passes minute columns as seconds, `CompletedTab.tsx:1194`, inferred); NO-SRC (1000 convention) |
| Avg Pace | Details, Perf | `display_metrics.avg_pace_s_per_km` ← `computed.overall` | moving s ÷ distance | n/a | `compute-workout-analysis:1955` and `compute-workout-summary:993,1482,2365` | TWO (two writers race; Perf pill reads `resolveRunScalars`); PHONE (`formatPace` can print "x:60", `workoutFormatting.ts:23`) |
| Max Pace / Max Speed | Details | `analysis.bests` | fastest sample; pace kept 90–3600 s/km, >1200 ÷10; speed 0.5–25 m/s (fallback 30) | NONE | `compute-workout-analysis:1468-1545`; `workout-detail:1931-1940` | TWO (25 vs 30); NO-SRC (possible "2:30/km" max pace from a stop, inferred) |
| Avg / Max HR | Details, Perf, Today | `workouts.avg_heart_rate` / `max_heart_rate` | provider | n/a | ingest-activity | TWO (Perf pill and Today read sample-mean `overall.avg_hr` first) |
| Elevation / Calories / Cadence / Max cadence | Details, Today | provider columns | provider | n/a | ingest-activity | TWO (Today reads `overall.elevation_gain_m` first) |
| Avg / Max Power | Details | provider columns | provider | n/a | ingest-activity | — |
| Norm Power | Details | `analysis.power.normalized_power` | 30 s rolling, 4th power | Coggan / TrainingPeaks | `sf/_shared/ride-power.ts:65-80` | TWO (a separate `normalized_power` column is read elsewhere, not traced) |
| Avg power (pedaling) / Time pedaling | Details, Perf pacing | `analysis.power` | seconds above 25 W; gaps over 300 s skipped | NONE | `ride-power.ts:84-104` | NO-SRC |
| VAM (avg) | Details | `computed.overall.avg_vam` | gain ÷ moving hours | NONE | `compute-workout-summary:917` | — |
| Swim lengths / stroke rate | Details | row; sensor mean | count; phone averages samples when missing | n/a | — | PHONE |
| Gear distance | Details | `gear.total_distance` | DB trigger; ÷1609.34 | n/a | migration trigger | — |
| **Details — chart, map, splits, zones** | | | | | | |
| Scrub values (pace, speed, HR, grade, cadence, power, VAM) | Details | `display_series` | windows 60 s, 15 s, 100 m, 30 s, 30 s, 60 s; speed EMA 0.18; elevation EMA 0.25 | windows OURS; EMAs NONE | `display-series.ts:205-219`; `compute-workout-analysis:26,1475` | NO-SRC (EMAs, `MIN_DD 2.5 m`) |
| Map overlay pace, "at X mi • m:ss", "(total)" time, Alt | Details | `display_series` | run pace rebuilt from speed; last sample | n/a | — | PHONE (run speed series is empty, so overlay pace prints "--", inferred); TWO ("total" time is neither moving nor elapsed tile) |
| +gain / −loss | Details | `elevation_gain_cum_m` | 1.5 m steps over 20 m, scaled to recorded total | OURS | `display-series.ts:152-184` | — |
| Axis ticks | Details | plotted series | winsorize 5/95, 10/90, 2/98; padding; floors | NONE | `c/EffortsViewerMapbox.tsx:746-954` | PHONE; NO-SRC (display only) |
| Splits # / Time / Pace / BPM / Grade | Details, Perf mile splits | `analysis.events.splits` | runs moving seconds per split; HR unweighted mean; grade end−start ÷ distance; ride speed 3600 ÷ pace on phone | moving rule OURS; rest NONE | `compute-workout-analysis:1417-1465` | PHONE (ride speed); NO-SRC |
| HR zones (range, time, %) | Details | `analysis.zones.hr.bins` | configured zones → LTHR ×0.85/Z3/×0.95/×1.05/×1.15 → %HRmax 0.60–1.01 (fallback 180); top cap max(prev+20, 220) | Friel for LTHR Z2 only | `compute-workout-analysis:1650-1757` | PHONE (% on phone); NO-SRC (×1.05, ×1.15, %HRmax set, 180, 220, peak-to-max 0.95) |
| Power zones Z1–Z6+ | Details, Profile | `analysis.zones.power.bins` | FTP ×0.55/0.75/0.90/1.05/1.20/1.50 | Coggan levels | `display-zones.ts:25-30` | PHONE (% on phone) |
| Weather start→end, peak, feels-like | Details | `workouts.weather_data` | rise, peak > max+0.5, feels-like ≥2° | NONE | get-weather; `c/WeatherDisplay.tsx:14-50` | PHONE; NO-SRC |
| Segments "N PRs", time, rank | Details | `achievements.segment_efforts` | count pr_rank=1; rank shown ≤10 | Strava data; 10 NONE | — | PHONE; NO-SRC |
| **State — load, week, body** | | | | | | |
| WK N / "Week N of M" | State | `weekly_state_v1.week` | plan position | n/a | `coach/index.ts:895,4389-4436` | — |
| fitness / fatigue / form | State, Today | `load.fitness_fatigue` | 42 d / 7 d EWMA of workload; form = yesterday CTL − ATL | TrainingPeaks PMC | `sf/_shared/fitness-fatigue.ts:76-121` | TWO (form rounded separately on State and Today); PHONE (weekly change and "6 wk / 7 d" on phone, `c/context/LoadBar.tsx:130-184`) |
| Form zone word / table | State, Today | `load.label`, `form_zones` | >25 / >5 / >−10 / ≥−30 | Friel TSB | `fitness-fatigue.ts:132`; `coach/load-composition.ts:70` | — |
| Readiness "why" line | State | `trends.readiness_why` | reasons + load clause; ACWR ≥1.2 | NONE | `coach/index.ts:4614-4638` | TWO (ACWR still printable though ledger says off every surface); NO-SRC |
| Planned / done counts, bars, "so far" | State | `week_execution_v1.counts` | whole week vs to-date | n/a | `coach/index.ts:4227-4247` | PHONE (bar scale, "so far", `state-primitives.tsx:158-178`) |
| Load shares "strength 45%", "N pts · 7 d" | State | `load.composition_7d`, `total_7d` | share of 7-day workload, rounded to 100 | Friel TSS; rounding NONE | `coach/load-composition.ts:28-62` | NO-SRC |
| Accent sentence ("RIR 1.5 vs 2.5", "X of Y-mile upkeep") | State | `week_execution_v1.accent` | RIR ≥2 lifts, 1 below; upkeep <85% for ≥2 wk | NONE | `_shared/state-trend/week-accent.ts:118-306` | NO-SRC |
| BODY effort / soreness / soreness flag | State | `response_model.visible_signals` | 7 d vs 28 d; steps 0.5/1.0; +1 SD +1; 4 of 6 | ledger says REMOVED from State 2026-09-04 — still renders | `coach/index.ts:2538-2636`; `cross-domain-carryover.ts:287-343` | TWO (ledger vs code); NO-SRC |
| READINESS energy / soreness / sleep, arrows, "Nd ago" | State | `arc.readiness` (14 d) | newest vs oldest, ≥3 | NONE | `arc-context.ts:952,1166` | PHONE (`StateReadinessRow.tsx:17-27`); NO-SRC |
| NEXT sessions | State | `week.key_sessions_remaining` | server includes today; phone drops today, keeps 3 | n/a | `coach/index.ts:1005-1018` | PHONE; TWO |
| Swim nudge "About N weeks" | State | phone table queries | 4 wk / 4 swims / 10 d / 70 d; 7-day snooze | D-200; numbers NONE | `src/lib/swimBaselineNudge.ts:26-58` | PHONE; NO-SRC |
| **State — endurance** | | | | | | |
| Run aerobic efficiency + "N-week trend" | State | `enduranceSpineTrends[run]` | least-squares line of per-run EF; ≤12 wk; <3 points too few | WKO5; TrainingPeaks EF; 3 points OURS | `_shared/state-trend/trend-fit.ts`; `compute-facts:1198` | PHONE ("building" <11 wk, week span, `TrendSparkline.tsx:82-84`); NO-SRC (<11). Unverified whether run EF pace is grade-adjusted |
| Easy / hard pace and bpm | State, Adjust | `runFitness.efficiency.groups` | median of last 5 | ledger cell "Recorded values" only | `_shared/state-trend/run.ts:148-163` | TWO (Adjust easy pace = `learned_fitness`, else threshold × 1.19); PHONE (sec/km→/mi); NO-SRC (last 5) |
| FTP "N W" + note | State, Adjust, Baselines | `fitnessAnchors.bike` else phone resolver | round | FTP ledger rows | `compute-snapshot:1940`; phone `resolveCurrentFtp` | PHONE (fallback); TWO (snapshot reads `fitness_baselines`, resolver lets manual FTP win, inferred) |
| Ride efficiency factor | State | `enduranceSpineTrends[ride]` | NP ÷ avg HR, rides ≥10 min aerobic | TrainingPeaks EF; Garmin 10 min | `compute-facts:1263` | TWO (Perf EF differs, above) |
| Swims "N · last N wk" | State | `swimVolume` | count over 56 d | NONE | `state-trend/assemble.ts:149-185` | PHONE; NO-SRC |
| FTP history, best 20-min power, "N rides in 8 weeks", receipt | State | `ftpHistory`, `power.series` | 90 d; best 20 min; larger of two counts | TrainingPeaks; WKO5; Garmin 56 d | `compute-snapshot:1646,2127`; `bike-fitness.ts` | PHONE ("8 weeks" typed in, range, count pick); TWO (FTP line from 2 readings on phone, fit needs 3); NO-SRC ("limited data" <5 / >21 d) |
| Drift chart "X% → Y%", "5% line", hot-day note | State, Details drift | `driftTrend` | steady sessions; halves | TrainingPeaks Pa:Hr; Friel; Viada p107; 72°F Garmin | `trend-fit.ts:77`; `drift-pct.ts` | PHONE (72°F check, range) |
| Checkpoint sheet (week N, live threshold, big move) | State | `endurance-checkpoint` | server delta; half vs half | OURS in code, no ledger row | `_shared/standing-plan/endurance-checkpoint.ts:18-87` | NO-SRC (ledger row missing) |
| **State — strength** | | | | | | |
| Lift e1RM, "best N", "PR", "+N since block" | State | `strengthFitness.perLift` | latest trusted e1RM; best; PR ≥3 readings, 0.5 lb slack; since lowest block week | Viada p215; rest NONE | `state-trend/assemble.ts:410-502,1376-1405` | PHONE ("best" shown > latest+0.5); TWO (rep ceiling comment 5/8 vs code 10); NO-SRC |
| 12-week e1RM chart | State | `perLift.series` | 84-day window | ledger says 52 weeks | `assemble.ts:1328-1352` | TWO (ledger vs code) |
| Status "climbing / holding / reset, training max N" | State, Perf, Logger | `rematerialize-strength-block` | +5/+10 per cycle, −10% on second miss | archived program pages only | `rematerialize-strength-block/index.ts:6-247` | PHONE (cycle + word, `useStrengthCalibration.ts:100`); TWO (one lift: Adjust capacity, e1RM tile, training max); NO-SRC |
| Pull-ups (best set, "50 in 10 min") | State | `strengthFitness.pullups` | last 40 sessions; standard constants | OURS (40, no ledger row); standard archived program only | `compute-snapshot:1859-1882`; `src/lib/pullup-progression.ts:46` | NO-SRC |
| Logged sets, "your best sets" | State | `strength_logged_sets` | 8 wk / 2 sessions / 5 sets | OURS (ledger) | `coach/strength-logged-sets.ts`; `state-trend/logged-sets.ts` | TWO ("main lift" rule also in `StateTab.tsx:479`) |
| Week card sets, below floor, outside plan, "+18%" | State | `viadaWeek` | ≤8 recovers, ≥14 costly; floor 3 sets; effective reps sets×4; list above 10% | Viada p086, p218; floor OURS no row; 10% "§B5" only | `_shared/accessory-dosing/dose.ts`, `ledger.ts` | NO-SRC (10%, floor row) |
| **State — Adjust tab** | | | | | | |
| Lift numbers, FTP, threshold pace/HR, easy pace "from runs/threshold", zone 2 bpm, deloads, retest dates | Adjust, Baselines | resolvers on the phone | capacity / FTP / pace / LTHR resolvers; easy = threshold×1.19; Z2 85–89% LTHR; retest 3 d / 2 d out | Daniels/Friel; Viada p274/p120/p247; retest NONE | `src/lib/*resolver*`; `c/context/StateAdjustLens.tsx:118-230` | PHONE (all); TWO (see lift/FTP/easy rows); NO-SRC (retest days). Metric account: lift values labelled kg but hold lb (`:123,295`) |
| **State — race** | | | | | | |
| "Nw out", distance, goal clock | State | `race_readiness.goal`, plans, goals | round(days/7); fallback chains | n/a | `_shared/goal-context.ts:88` | PHONE (pick + fallbacks, `race-header.ts`, `StateRaceBlock.tsx:85-105`) |
| Projected, delta, assessment, race pace, VDOT, pace zones | State, course detail, course strategy | `race_readiness` | threshold → VDOT table → ÷ durability × confidence; bands −5/3/8% | NONE | `_shared/race-readiness/index.ts:193-359`; `effort-score.ts` | TWO (bands copied in `arc-context.ts:446`; projection also from `race_finish_projection_v1` and a stored copy); NO-SRC |
| Durability / Confidence adj % | State | `durability_factor`, `confidence_adjustment_pct` | drift steps, clamp 0.92–1.03; ×1.03 / ×1.01; phone (1−f)×100 shown below 0.97 | NONE | `race-readiness/index.ts:211-246` | PHONE; NO-SRC |
| Readiness signals, key run | State | `training_signals`, `primary_race_readiness` | tone cuts 0.8/0.5, −1/+3 bpm, ±0.4 RPE; ≥12 mi within 21 wk | NONE | `coach/index.ts:224-282,718-796` | NO-SRC |
| "Goal trajectory N%" | State | `goal_prediction.block_verdict` | 50 + 2a + 1.5l − 15, cap 75; phone colours 70/40 | NONE | `_shared/goal-predictor/index.ts:302-309` | PHONE; NO-SRC |
| "Completed", "± vs goal / model / projection", unofficial finish | State, My Record, Goals | goals table (phone query), `last_completed_race`, `post_race_unofficial` | subtraction; days since race | OURS (unofficial) | `coach/post-race-unofficial.ts`; `coach/index.ts:3240-3282` | PHONE (goals query, deltas, local date); TWO ("model projected" = live vs stored projection; delta function twice) |

### Flags, grouped (the reading order for fixing)

**Computed in two places that already disagree or can:** execution score (analyzers vs a drift score of the same name in the summary step); avg pace and moving/distance totals (two server writers race); avg HR and GAP (Details tile vs Performance pill on the same run); ride efficiency factor (Performance vs State); drift (Today skips the easy-portion window; 5% line in four files with a boundary disagreement); easy pace (State row vs Adjust); FTP (snapshot vs resolver); one lift's three numbers (Adjust capacity, e1RM tile, training max); race projection (three producers, bands copied); form rounding (State vs Today); max speed cut (25 vs 30 m/s); RPE (saved to one field, read from another); swim distance and swim pace unit (Details vs Performance); ledger vs code (BODY rows still render; lift chart window 84 d vs 52 wk; rep ceiling 5/8 vs 10).

**Computed on the phone:** every Adjust tab value; State weekly change, bars, readiness arrows, NEXT filter, swim nudge, chart "building" and ranges, race deltas and fallbacks, goal colours; Details zone %, weather, split speed, map overlay pace, axis ticks, fallback derivation when `display_metrics` is missing; Performance duration minutes (rounds vs header floors), swim pace difference, GAP cell fallback to raw pace, route trend line, strides filter, strength duration/lengths from the row.

**No source and no OURS marker:** execution weights and duration tiers; workload "usual" range; heart rate row bands (10%, 3/5 bpm, 75°F); conditions cut-offs; even-pacing 15 s; 25 W pedalling floor; display EMAs 0.18/0.25; max pace/speed filters; HR zone fallbacks (×1.05/×1.15, %HRmax, 180, 220, 0.95); split grade/HR method; State accent thresholds, share rounding, readiness windows, swim nudge numbers, "limited data", "building" <11 wk, strength PR/best slack, week-card 10%, calibration steps (archived program only); race model (VDOT tables, durability, confidence, assessment bands, signal cuts, goal probability formula); next-session 14 days; retest days; test "updated" rule. OURS in code but no ledger row: checkpoint rules, all-out/pull-up 40 sessions, muscle floor 3 sets.


## Cross-refs
- `SCREEN-INVENTORY.md` (what each screen is) · `SCREEN-CONNECTIVITY.md` (wiring) · `APP-FLOW.md` (data movement + Arc)
- `SELF-AWARENESS-MAP.md` (the reasoning axes on the spine) · `CONSTITUTION.md` (Law 1 one-source, Law 4 render-don't-decide)
- `CANON-arc-inference-model.md` (per-session inference model)
