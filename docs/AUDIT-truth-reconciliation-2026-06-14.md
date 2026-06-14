# AUDIT — Truth Reconciliation (Phase 1 of the Athlete-State Spine)

**Date:** 2026-06-14 · **Status:** findings + signed-off reconciliation rules · **read-only audit, nothing built**
**Gates:** Phase 3 of `SPEC-athlete-state-spine.md` (close-loop-to-adjustment). The spine cannot be trusted to *drive* until these numbers reconcile — *audit before trust, trust before adjustment.*
**Method:** code trace (storage + plan/adjustment reads) + live data pull for user `45d122e7`. No fixes.

---

## Per-discipline truth table (real values)

| Discipline | Typed baseline | Learned aggregate | Latest computed | **Plan builder reads** | My Record shows | Verdict |
|---|---|---|---|---|---|---|
| **FTP** | 176 | 176 (high, n=11) | 20-min bests | `resolveCurrentFtp` → **176** | 176 | ✅ **single-sourced** (204 = external Garmin, not in Efforts) |
| **Deadlift** | 150 | **none** | **175** (2026-02-26) | merge `manual>computed` → **150** | 150 | ❌ computed 175 ≫ typed 150 |
| **Squat** | 110 | 105 (low, n=2) | 100 (2026-04-02) | typed **110** | 110 | ❌ three values 100/105/110 |
| **Bench** | 160 | 165 (med, n=4) | 130 (2026-05-18) | typed **160** | 160 | ❌ recent e1RM 130 ≪ typed 160 |
| **OHP** | 110 | 105 (low, n=1) | 105 (2026-03-30) | typed **110** | 110 | ❌ thin data, minor gap |
| **Swim /100** | 2:30/yd | **EMPTY** | ~2:52/yd (188 s/100m) | learned-empty → typed **2:30** | 2:30/yd | ❌ swims slower than baseline; learned never populated |

Source paths: typed = `user_baselines.performance_numbers`; learned = `user_baselines.learned_fitness`; computed-per-session = `exercise_log.estimated_1rm` / `workout_facts.pace_per_100m`. Plan reads via `resolveCurrentFtp` (FTP), `athlete-snapshot.resolveLivePerformanceNumbers` merge (strength, **manual wins**), `planning-context.swimSecPer100YdFromArcSwimInputs` (swim, learned≥3 > manual).

---

## FTP — premise corrected: NO internal split (SIGNED OFF: single-sourced)

Every Efforts source reads **176**: typed `performance_numbers.ftp`, `learned_fitness.ride_ftp_estimated` (high, 11 efforts), `resolveCurrentFtp()`, the **active IRONMAN 70.3 plan pinned at 176**, and My Record. The string "204" appears **nowhere** in `user_baselines`. **Efforts is internally consistent.**

The **204 is the external Garmin native auto-FTP, never ingested** — the ~28W gap is Q-037 (Strava power-stream smoothing vs native .fit). So this is a **cross-app data-source gap, not an internal spine inconsistency, and not a best-vs-current mislabel.** FTP is the one discipline already single-sourced.

- **SIGN-OFF (Michael):** accept FTP single-sourced at 176, no internal reconciliation.
- **⚠ FLAGGED:** the active plan is **pinned 28W under Garmin's number**. Whether to ingest Garmin native FTP is a **separate decision → Q-053** (xref Q-037). Michael decides.

---

## Strength — the real reconciliation problem (+ live plan miscalibration)

The plan reads **typed baselines** (merge is `manual > computed`), and they diverge from computed e1RM **in both directions**, off **sparse + stale** computed data (single sessions, Feb–May):

### ⚠ LIVE PLAN MISCALIBRATION (the real-world cost of the broken loop — the argument for Phase 3)
- **Deadlift:** demonstrated e1RM **175** (Feb 26) but baseline **150** → the plan prescribes deadlift **~25 lb UNDER** what the athlete has shown.
- **Bench:** baseline **160** but recent e1RM **130** (May 18) → the plan prescribes bench **~30 lb OVER** current capacity.
- This is happening **right now** on the active plan. The athlete is being under-loaded on one main lift and over-loaded on another because the plan reads a typed baseline that the computed performance contradicts in opposite directions — and nothing reconciles them. **This is the concrete case for closing the loop (Phase 3).**

Computed e1RMs are also **sparse/stale** (deadlift = one Feb session; bench = one May session) — so the computed side is **not trustworthy enough to auto-overwrite**. Hence the gated suggest-with-confirm rule below.

---

## Swim — typed too fast + a pipeline gap

Baseline **2:30/100yd**; actual recent swims compute to **~2:52–3:11/100yd** (188–209 s/100m) — the athlete swims **slower** than the baseline the plan prescribes from. And `learned_fitness.swim_pace_per_100m` is **EMPTY** despite 5+ swims with computed `pace_per_100m` in `workout_facts` — **`learn-fitness-profile` is not aggregating swim pace into the field the plan reads** → plan falls back to the too-fast 2:30. **Pipeline gap → Q-051** (tied to Q-038).

---

## Cross-cutting: the loop is closed for FTP, broken for strength + swim

- **Plan builder reads:** FTP `resolveCurrentFtp` (learned≥med > manual); **strength merge (manual > computed)**; swim (learned≥3 > manual).
- **Adjustment (`adapt-plan`):** reads computed (`exercise_log.estimated_1rm`, learned) to *suggest* — but **only FTP writes back** to `performance_numbers`; **strength → `plan_adjustments` (ephemeral); swim → no writeback.** So computed fitness never updates the strength/swim baselines that seed future plans. **That's the "loop broken in the middle."**

---

## SIGNED-OFF reconciliation rules (gate Phase 3)

1. **FTP:** single-sourced (176); no internal reconciliation. Garmin-ingestion = separate decision (Q-053).
2. **Strength & swim — hybrid suggest-with-confirm, gated on computed confidence + freshness.** Never suggest a baseline update off a single stale session. Only surface *"your logged X suggests Y vs your baseline Z — update?"* when computed has **≥N recent sessions at ≥medium confidence**. Surfaces the conflict; **never auto-applies**; athlete confirms before any baseline/PR change.
3. **Swim learned-aggregate pipeline gap** must be fixed before swim reconciliation can compare like-for-like → Q-051.

---

## USER-AGNOSTIC mandate — make these scale, not constants (→ Q-052)

The spine's *logic* is universal; these thresholds were reasoned partly from one athlete's data and **must scale per-athlete**:
- **`CHRONIC_LOAD_FLOOR = 500`** (D-146) → scale to the athlete's **own chronic base**, not a fixed 500 (a low-volume athlete's normal base can sit under 500 → false "thin base / spike").
- **HR reference band `[130,150]W`** (bike-fitness) → **per-rider** (% of FTP / the athlete's Z2 power); **no hardcoded watts**.
- **Freshness windows (14/21/14/10d) + min-session gates (4/3/4/3)** → scale to each athlete's **per-discipline session frequency** (low-volume athletes would read perpetual stale/needs_data).

**Correctly universal (keep as constants):** trend **% thresholds** (±2.5/±2/±1.5 — a percent is scale-free) and **plausibility bands** (swim 40–240 s/100m, run GAP 150–750 s/km — physiological).

---

## Tickets opened
- **Q-051** — swim learned-aggregate pipeline gap (`learn-fitness-profile` not populating `swim_pace_per_100m`), xref Q-038.
- **Q-052** — user-agnostic threshold scaling (chronic-load floor, HR reference band, freshness/session-gates).
- **Q-053** — decision: ingest Garmin native FTP (plan pinned 28W under), xref Q-037.
