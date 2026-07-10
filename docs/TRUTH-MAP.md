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

**The clean part:** the Arc **reads** the spine (`arc-context.ts:1146-1153`, "no computation, no write") — it does not mint a competing per-discipline verdict. Fitness direction, load, and RPE are each single-source. So the *core* of the app tells one story.

---

## 2. Which screen reads which layer (pointers; detail in SCREEN-CONNECTIVITY)

| Screen | Component | Reads |
|---|---|---|
| **State** | `context/StateTab.tsx` | Coach payload (`weekly_state_v1`) for LOAD/BODY/headline/b2/per-lift **+ the spine recomputed LIVE** (`useStateTrends` → `assembleStateTrends`) for the Performance-section trends **+ Arc** for readiness/longitudinal |
| **Baselines** | `TrainingBaselines.tsx` | `user_baselines` raw (the only screen that does) + Arc for suggestions |
| **Workout · Performance tab** | `UnifiedWorkoutView`→`MobileSummary` | `session_detail_v1` (from `workout-detail`), which reads the spine **cached** |
| **Workout · Details tab** | `CompletedTab` / `StrengthCompletedView` | same `session_detail_v1` contract, read-only |

---

## 3. Per-fact authority table (the anti-drift tool)

For any fact, this says who owns it and whether the screens agree. **Before building anything about a fact, read its row.**

| Fact | Authority (single source of truth) | Read by | Coherent? |
|---|---|---|---|
| **Fitness direction** (improving/holding/sliding) | SPINE → `rollupFitnessDirection` (`assemble.ts:277`) | State (live), coach (cached), workout-detail (cached), analyzers (via Arc) | ✅ one authority; only **freshness** differs (live vs cached) |
| **Load / ACWR / "balanced"** | one algorithm `_shared/acwr.ts:computeAcwr` (D-236); reconciled verdict = `load-status-reconcile.ts` (D-260) | State (from coach) | ✅ single-algorithm (dual-computed: snapshot persists, coach recomputes; equivalence-tested) |
| **RPE / "how it feels"** | one object `response-model/weekly.ts` `endurance.rpe` | State header, BODY row, readiness — all deref the same object | ✅ cannot diverge within a payload |
| **Run durability** (decoupling, Friel band) | SPINE `state_trends_v1.run.decoupling` | State (live), Performance tab (cached, but not currently rendered) | ✅ one authority (freshness only) |
| **1RM anchor** (per-lift) | `resolveStrengthCapacity` — **typed wins** (D-231) | coach, materialize, per-lift verdict | ✅ **the model the others should copy** |
| **FTP** | *supposed* to be `resolveCurrentFtp` (learned-first) | see fracture #2 | 🔴 **FRACTURE** — three different answers |
| **Strength trend** (volume / e1RM) | — | see fracture #1 | 🔴 **FRACTURE** — three engines on one screen |
| **Per-session execution** (exec % / analysis) | `session_detail_v1.execution` (`build.ts:782`) | Workout Performance/Details tabs | ✅ single-source (workout-only) |
| **Bike "how's the bike"** | split: spine `bike.power` trend vs Arc `cycling_fitness` {ctl,atl,tsb} | State / narrative | ⚠️ two adjacent reads, unreconciled (fracture #7) |

---

## 4. The verified fractures (recorded so they're never rediscovered)

**Per-discipline cohesion verdict (traced + verified 2026-07-10):**
- **RUN — CLEAN.** One rendered authority (spine `run.decoupling`); the old duplicate was retired (D-239). This is the model the others should copy.
- **STRENGTH — CONTRADICTING (worst).** Three visible engines; the e1RM fact is computed from two different data trails (fracture #1).
- **BIKE — MIXED.** Fitness *direction* is clean — one rendered authority; the CTL/ATL/TSB "form" second engine (Arc `cycling_fitness`) is **internal-only, never rendered** (and there's even a *third* CTL/ATL/TSB in `analyze-cycling-workout.fitness_v1`, prose-only). But (a) **efficiency has two visible engines** on State — spine 56-day HR-at-power vs coach 7-day HR-drift — only saved from a naked clash by the scope labels ("last 7 days" vs "trends over recent weeks"); and (b) the **FTP fracture is visible across two client screens** (fracture #2, now with detail below).
- **SWIM — BROKEN, not contradicting.** No two-engines-one-fact clash (rendered pace reads are single-sourced, D-182). The problems are: a single **provisional/`needs_data`** engine, **no swim-native display template** (falls through the endurance/run layout — Q-038 Layer 2, still open; the June duration-unit "2263% adherence" bug is FIXED), and the **CSS anchor is orphaned** — shown on Baselines but read by *nothing* in the swim session verdict, and even its plan-gen use is staged off (`planning-context.ts:237 SWIM_CSS_LIVE = false`). More disconnected than FTP.


**🔴 #1 — Strength contradicts itself on the State screen (LIVE, worst).** Three engines, three windows, one screen:
- b2 7-day execution row ← coach `weekly_state_v1.strength_session_types_7d` (`StateTab.tsx:1152`)
- volume / e1RM trend ← **client-live** `assembleStateTrends.strengthFitness` from `workout_facts.strength_facts` + `exercise_log.estimated_1rm` (`StatePerformanceSection.tsx:326`)
- per-lift verdict ← coach `response_model.strength.per_lift` (`StateTab.tsx:1133`)

Nothing forces them to agree → "e1RM improving" can sit above a lift verdict that says decline. **Fix = converge on one strength authority** (the D-231 `resolveStrengthCapacity` pattern is the template).

**🔴 #2 — FTP: same anchor, three answers, TWO on visible client screens (LIVE).**
- **Baselines** screen shows **manual-first** (`TrainingBaselines.tsx:1269`)
- **Athletic Record** screen shows **learned-first** via `resolveCurrentFtp` (`AthleticRecordPage.tsx:141`, `resolve-current-ftp.ts:71`) → **two client screens can display different FTP numbers for the same athlete**
- `analyze-cycling-workout` reads `performance_numbers.ftp` **only, ignoring learned** (`index.ts:1551`) → it also **sets the power band the spine efficiency trend is built from** (`resolveZoneBand`, `:2517`), so if learned FTP moved but the typed value is stale, the rendered efficiency trend is anchored to an FTP **neither screen may be showing**; and a learned-only rider gets **no power verdict** on rides.

**Fix = route every FTP read through `resolveCurrentFtp`** (Baselines UI, Athletic Record, and the cycling analyzer all bypass it — 1RMs already do this right via `resolveStrengthCapacity`).

**⚠️ #3 — Metric easy-pace unit mislabel (latent).** Baselines hardcodes `/mi` (`TrainingBaselines.tsx:1233`); AppContext stores `/km` for metric users (`AppContext.tsx:359`). Masked today only because the run analyzer is suffix-blind.

**⚠️ #4 — Live-vs-cached freshness fork (latent).** State recomputes trends live; the Performance tab reads the cached `state_trends_v1`. Same code path → agree only when the cache is fresh. Currently latent because the Performance-tab trend line isn't rendered (`MobileSummary.tsx:163`).

**⚠️ #5–7 — drift risks (not visible contradictions):** client re-implements `FitnessVerdictDivergence` (D-212 mirror, `useCoachWeekContext.ts:70`); `arc-context.ts:351` copies race-readiness projection bands; spine bike-trend vs Arc `cycling_fitness` unreconciled.

---

## 5. "Where does X belong" (so nobody drifts again)

- **A single session's quality / execution** → `session_detail_v1` (`build.ts`), rendered on the **workout Performance tab**. Planned = execution %, unplanned = analysis. This is the per-session home.
- **A multi-week trend / fitness direction** → the **spine** (`assembleStateTrends`); every surface reads it, don't compute a parallel one.
- **A reference anchor** (FTP, threshold, 1RM, CSS) → `user_baselines`, read through its resolver (`resolveCurrentFtp`, `resolveStrengthCapacity`) — never read the raw column past the resolver.
- **A weekly verdict for the State screen** → the **coach** payload (`weekly_state_v1`); the client renders it, never re-derives it (Law 4).
- **The endurance per-session read on RPE + decoupling already exists** — spine `run.decoupling` + the carryover RPE-vs-typical gauge (`cross-domain-carryover.ts`). Extend those, don't rebuild them.

## Cross-refs
- `SCREEN-INVENTORY.md` (what each screen is) · `SCREEN-CONNECTIVITY.md` (wiring) · `APP-FLOW.md` (data movement + Arc)
- `SELF-AWARENESS-MAP.md` (the reasoning axes on the spine) · `CONSTITUTION.md` (Law 1 one-source, Law 4 render-don't-decide)
- `CANON-arc-inference-model.md` (per-session inference model)
