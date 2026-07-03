# AUDIT — The State screen (StateTab), 2026-07-02

Full audit of the bottom-nav **State** tab. Commissioned because "State has been multiple things and a WIP" and it was caught misrepresenting strength (showing "Bench 125 → 115 lbs · back off" while the athlete's true bench baseline is 150). Code-derived from a 4-way parallel trace (client render · server provenance · correctness · history). Anchors are `file:line`.

---

## TL;DR

**The State screen has no single source of truth.** One screen is fed by **three uncoordinated engines** over **three different strength substrates**, and the athlete's *authoritative* baseline (`performance_numbers`, bench 150) drives **none** of the visible strength verdicts. That's the root cause of the bench bug and of the contradictory rows — not a one-off, a structural gap.

It got here by **accretion**: a multi-tab "Context" screen (2025-10) collapsed to a single `StateTab` (2026-03-31, orphaning two tabs without deleting them), then had a race-projection instrument, a v2 trend section, a spine, and verdict-divergence bolted on top in sequence — each layer landing on the last, spec headers never flipped to "built," and the old tabs left mounted-nowhere. One of those orphans (`BlockSummaryTab`) is still cited by a *live* spec (D-212) as the only home of the goal-predictor signal.

**The single highest-value fix** is to give the strength lane **one substrate, reconciled with `performance_numbers`** — that collapses findings H1, H2, H3, L1, L2 at once. The rest are honesty guards and a race-section contradiction.

---

## 1. What State IS today (render + data map)

The bottom-nav "State" → `AppLayout.tsx:19` → `ContextTabs.tsx` → renders **only** `StateTab.tsx`. StateTab pulls from **three engines**:

- **Coach** (`useCoachWeekContext` → `coach` edge, `CoachWeekContextV1`): the weekly verdict, headline, LOAD/ACWR, BODY, and the **STRENGTH per-lift row**.
- **Client re-computation** (`useStateTrends` → raw tables, `assembleStateTrends`): the **PERFORMANCE per-discipline trends** (bike/run/swim/strength). Reads **live tables and bypasses the spine cache**.
- **The Arc** (`get-arc-context`): the READINESS row + the SIGNAL nudge (Q-049 soreness/sleep).

Section → source (condensed; full map in the trace):

| Section | Reads | Engine |
|---|---|---|
| `WK1 · FATIGUED` header | `wsv.trends.{readiness_label,readiness_state}` | coach |
| "Room to build, fatigued" | client `buildLoadHeadline(acwr, readiness, fitness_direction)` (`load-headline.ts`) | coach data, client-composed |
| LOAD bar + "build more" + 7-day | `wsv.load.*` (ACWR bands) | coach |
| BODY "feels 1.2 harder" / "strain across disciplines" | `rm.visible_signals` + `load.cross_training_signal` | coach `response_model` (untyped `any`) |
| READINESS row | `arc.readiness.latest.{energy,soreness,sleep}` (14d) | Arc |
| PERFORMANCE "Building — bike up" + per-discipline | `useStateTrends()` → `assembleStateTrends` | **client re-compute (live tables)** |
| SIGNAL nudge | `arc.longitudinal_signals` (soreness/sleep, 6-checkin) | Arc |
| STRENGTH "Bench 125 → 115" | `rm.strength.per_lift[]` | coach `response_model` |
| RACE row + projection | `data.race_readiness` / `race_finish_projection_v1` (~4 fallback lanes) | coach |
| NEXT | `week.key_sessions_remaining` | coach |
| "GET STRONGER" footer | `wsv.plan.plan_name`, CSS-uppercased (not a CTA) | coach |

**The `response_model` is a second, parallel coach substructure** consumed side-by-side with the typed `weekly_state_v1`, read via `any` — a typing gap.

---

## 2. What State has BEEN (the accretion)

| Phase | When | What State was | Commit |
|---|---|---|---|
| 0 | 2025-10 → 2026-03 | Multi-tab **"Context"** (Daily / Week / Block / Summary) | `51a2b4d3` … |
| **1** | **2026-03-31** | **Collapsed to single `StateTab`** — `CoachWeekTab` + `BlockSummaryTab` **orphaned, not deleted** | **`96db8469`** |
| 2 | 2026-04 | Race-projection + course-strategy instrument | `87ac2468`, `fdf600de`, … |
| 3 | 2026-06-13 | STATE **v2 per-discipline trends** (`StatePerformanceSection`) | `2907cfdf` (D-148) |
| 4 | 2026-06 | **Spine** (state_trends_v1) + glance headline + **verdict divergence** | D-150/151, D-212 |

Two drift bombs:
- **`CoachWeekTab` kept getting edits for 3 months *after* it was orphaned** (`fa4e1813` etc.) — maintenance spent on UI nothing renders.
- **`BlockSummaryTab` is the *only* reader of `block_verdict`/goal-predictor** (`SPEC-fitness-verdict-reconciliation.md:41`, D-212) — a live spec points at an unmounted component as that signal's sole home.

**Spec status (headers are stale):** `SPEC-state-screen-v2-performance.md` says "not built" but **is built** (D-148). `SPEC-athlete-state-spine.md` is authoritative + largely built (D-149/150/151); Phase-3 autoregulation open. `SPEC-state-headline.md` — glance headline built, the authored phrase-bank voice work not. `SPEC-fitness-verdict-reconciliation.md` (D-212) — Piece 1 shipping, Piece 4 (third brain) filed-not-built. Q-049 partially built (2026-07-02).

---

## 3. The core architectural problem

**Three strength substrates, none reconciled, baseline drives none:**
- `performance_numbers.bench = 150` — the athlete's authoritative typed 1RM (Q-097). **Read by no visible strength verdict.**
- `learned_fitness.strength_1rms` (≈125) — computed from *logged* sets → drives the coach STRENGTH row.
- raw `exercise_log.estimated_1rm` / logged sets → drives the client PERFORMANCE strength card.

The reconcile layer (`_shared/state-trend/reconcile.ts`) only ever *suggests* updating the typed baseline from the learned aggregate — it does not feed the display. So the just-set 150 is **structurally invisible**, and the two strength pipelines contradict each other on screen.

**Three engines that disagree by construction:** coach reads the *cached* snapshot; `useStateTrends` reads *live tables* (bypassing the cache — a violation of the spine principle "spine is truth, D-149"). Any workout logged since the last `compute-snapshot` makes the two sections disagree.

**One signal counted thrice:** an elevated `avg_session_rpe_7d` delta surfaces as the BODY "feels 1.2 harder" line, the "strain across disciplines" label, AND the "FATIGUED" tag — three UI elements, one number.

---

## 4. Correctness catalog — the "score that lies" findings

### HIGH
- **H1 — "Bench 125 → 115 · back off" is baseline-blind and RIR-only.** The verdict fires `back off weight` when logged `rir − target_rir ≤ −1` (`weekly.ts:160-165`); `suggested_weight = best_weight × 0.9` = `125 × 0.9 → 115` (`weekly.ts:168-184`). `best_weight` is the max *logged* set (125×4), not the 150 baseline. **You trained hard on submax weight → it tells you to deload a weight already ~17% under your true 1RM.** Fix: gate the suggestion against `performance_numbers`/`strength_1rms`; never suggest a regressive working weight.
- **H2 — the strong test raises nothing.** `best_weight`/RIR scan only completed `strength_exercises` sets (`coach/index.ts:2236-2260`); an unbuilt 0-rep/test-tagged session (Q-097 piece 2) never becomes a strength workout, so 140×3 never enters. And `previous_e1rm` is **hardcoded `null`** (`:2288`) → the e1rm-trend arm is dead → RIR is the *sole* driver. **Inverse risk:** if a test set logs `rir:0`, it drags the RIR avg to ~0 → falsely triggers "back off." Fix: route tagged tests to *capacity*, exclude `rir=0`/test sets from the fatigue read, populate `previous_e1rm`.
- **H3 — two contradictory strength rows.** "STRENGTH · needs data · 2 unplanned" (client, `exercise_log` trend fell to `needs_data`; "2 unplanned" = completed 2 / planned 0) sits beside a confident "back off 125→115" (coach). Two engines, one lift, opposite messages. The Performance card is self-labeled **"NOT YET SHIPPED — under review"** (`StatePerformanceSection.tsx:5`) yet rendered unconditionally. Fix: one strength substrate; don't show "needs data" and a confident weight verdict together.
- **H4 — RACE "Marathon — 0w out" + "add a race target" contradiction.** `weeks_out` defaults to `0` when null (`StateTab.tsx:274`) → renders "0w out" (reads as race week); the section renders on `has_active_plan` alone (`:1557-1563`) even with no target/projection → "add a race target." Fix: render "—" when `weeks_out` null; don't render the race header on `has_active_plan` alone.

### MEDIUM
- **M1 — swim rest "+33.9%" shown with NO provisional tag** though `swimRestProvisional` is computed and cached (`assemble.ts:118,149`). `RestTag` never renders it. A 33.9% swing is a small-denominator artifact on ~3 overlapping-endpoint points. Fix: pass the flag into `RestTag`.
- **M2 — provisional swim "−12.8%"** — tag *is* shown honestly (good), but a precise scary red % on ~3 points. Fix: qualitative "early signal" when `n<4`.
- **M3 — FATIGUED / "strain across disciplines" over-alarm.** `fatigued` can fire on a *single* concerning signal (`bodySignalsConcerning = signals_concerning > 0`, `:2762`); "strain across disciplines" needs only `stressSignals ≥ 2`, and a low-RIR strength session contributes to *both* it and H1. One hard/unplanned session can push readiness→fatigued AND strain. There are guards (plan-transition, taper) so it's not unguarded. Fix: require ≥2 distinct-axis signals; exclude unplanned/test strength from the RIR-strain signal.
- **M4 — "feels 1.2 harder" source not located in deterministic code `(unverified)`.** Likely LLM `week_narrative` or an RPE ratio. The coach prompt *forbids* unsupported "felt" language (`coach/index.ts:4488`), so a numeric "feels 1.2 harder" in narrative would violate that guard. **Check:** grep `coach_cache`/`week_narrative` for "harder."

### LOW
- **L1 — magic `× 1.1`** in the strength progress-bar denominator (`StateTab.tsx:1502`) systematically understates progress. Dormant (branch never taken).
- **L2 — `lt.peak1RM` referenced but never provided** by the server per-lift object → `e1rmPct` always null → **the strength progress bar is dead code** and never renders.
- **L3 — bike "est (FTP)"** basis label is handled *honestly* (estimated shown as estimated) — noted as the right pattern the strength lane should copy (the strength lane discloses nothing about its substrate).

---

## 5. The orphaned tabs — resolve, don't just delete

- **`CoachWeekTab.tsx`** — the old interactive Week tab (week nav, link-extras via `auto-attach-planned`, in-place athlete-context editing, plan-adaptation + baseline-drift accept/dismiss). StateTab renders the same coach payload **read-only**, so those interactions were **lost** — and the coach hook **still merges `plan_adaptation_suggestions`/`baseline_drift_suggestions`** (`useCoachWeekContext.ts:536-587`) that StateTab never renders (dead server work). **Safe to delete** once you decide those interactions aren't coming back — or fold link-extras / adapt-plan accept-dismiss into StateTab.
- **`BlockSummaryTab.tsx`** — the old Block tab (block adaptation, goal-prediction, multi-week rings). **⚠ Do NOT delete blindly:** per D-212 it is the *only* surface that reads `block_verdict` (the goal-predictor "third brain"). **Extract that signal into StateTab first** (or confirm the RACE block's `goal_prediction.block_verdict` at `StateTab.tsx:1572` already covers it), then delete.

---

## 6. Recommendation — what State should converge to

The north star already exists in the repo: **"the spine is the truth, the Arc is the voice" (D-149) + "one engine, two shapes" (D-213).** State has drifted from it. Converge:

1. **One strength substrate, baseline-aware.** Make the strength lane read the spine (`state_trends_v1`) reconciled with `performance_numbers` (the typed 1RM). A verdict may never suggest a working weight that implies an e1RM *below* the stated baseline. Kill the coach's baseline-blind `suggested_weight`, or make it baseline-gated. **One** strength verdict on screen. (Collapses H1, H2, H3, L1, L2.)
2. **Read the cached spine, not live tables.** Point `StatePerformanceSection` at the same cached `state_trends_v1` the coach + session-detail read — stop the client re-computation that bypasses the cache and disagrees by construction. Un-hide it only once it's trusted (it's still self-labeled "not yet shipped").
3. **Count each signal once.** One RPE delta → one BODY line. Don't echo it as strain + fatigued too.
4. **Honesty guards for thin data.** Provisional/`n<4` trends → qualitative direction, not a precise red %. Surface every provisional flag that's already computed (M1).
5. **Race section discipline.** Don't render on `has_active_plan` alone; never default `weeks_out` to 0.
6. **Resolve the orphans** (§5): extract `block_verdict` before deleting `BlockSummaryTab`; delete or fold `CoachWeekTab` + its dead merged suggestions.

**Framing:** State's job is one honest sentence — *"here's where you are, and is it working."* Today it's three engines each answering that differently. The fix isn't more layers; it's **collapsing to the spine** and making the authoritative baseline the strength anchor.

---

## 7. Prioritized fix list

| # | Fix | Severity | Effort | Kind |
|---|---|---|---|---|
| 1 | **Strength lane → one substrate, baseline-aware** (H1/H2/H3/L1/L2) | HIGH | large | structural |
| 2 | RACE "0w out" + "add target" contradiction (H4) | HIGH | small | quick win |
| 3 | Swim rest "+33.9%" → render the provisional tag (M1) | MED | small | quick win |
| 4 | Point PERFORMANCE at the cached spine, not live tables | MED | med | structural |
| 5 | FATIGUED/strain over-alarm → multi-axis gate; exclude test/unplanned strength (M3) | MED | med | correctness |
| 6 | Provisional trends → qualitative when `n<4` (M2) | MED | small | correctness |
| 7 | Trace + ground/remove "feels 1.2 harder" (M4) | MED | small | verify |
| 8 | Remove `×1.1` + phantom `peak1RM` (L1/L2) | LOW | tiny | cleanup |
| 9 | Resolve orphan tabs — extract `block_verdict`, then delete/fold (§5) | — | med | cleanup |

**Quick wins to bank first:** #2, #3, #8 (small, unambiguous, no design call). **The one that matters:** #1 — it's the same "score that lies" family as the whole Q-097 arc, one screen over, and it's the reason State can't be trusted on strength today.
