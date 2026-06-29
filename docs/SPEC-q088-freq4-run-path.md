# SPEC — Q-088 freq-4 on the run path (U/L/U/L strength-focus mode)

**Status:** build spec. Decisions fixed in **D-220**; mapped against `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md`. Composition grounded in `SCIENCE-5x5-linear-progression.md`. **No builder code written yet** — this is the cut sheet.
**Cut:** the **run path (`generate-run-plan`) only**. Unlock strength frequency 4 as a true **U/L/U/L** week, gated by endurance posture, content supplied by two lanes of one module.
**Engine-first:** prove the engine with an **injected** `strength_frequency: 4` (test + preview probe, no DB write), exactly as E3b was proven. The intake fader that *supplies* 4 is wired later (same stance as D-219 / Q-091 deferral #1).

---

## 1. Scope & non-goals

**In scope (this cut):**
- One new protocol **module** with a **lane param (`build` | `power`)** that emits a 4-session **U/L/U/L** week.
- The freq-4 **plumbing on the run path**: type widening + a **4-slot placement template** (load-bearing — §6.2).
- The **mode gate**: endurance posture → allowed strength-frequency ceiling (§5).

**Non-goals (explicitly deferred — do NOT build here):**
- **Optimizer 4th-day placer.** The combined engine's `week-optimizer.ts` gets no `placeFourthStrength`; combined/tri stay ≤3 (audit Tier 2.7).
- **Tri raise-to-3.** Tri stays capped at 2 (its interference budget is a separate science call).
- **UI producer.** No fader/UI to *select* freq 4. Engine-first: injected frequency proves it; the fader lands later.

**Hard guard (non-negotiable): byte-identical at freq ≤ 3.** See §7. The cut may not alter any plan a current athlete receives.

---

## 2. Architecture — ONE module, lane param

A single module realizes the U/L/U/L **container** (structure only — D-220); the **lane** supplies content. NOT two sibling protocols.

```
makeStrengthFocusSplit(lane: 'build' | 'power'): StrengthProtocol
```

- File: `supabase/functions/shared/strength-system/protocols/strength-focus-split.ts`
- Registered in `selector.ts` under two ids that share the one implementation via the factory arg:
  - `strength_focus_build` → `makeStrengthFocusSplit('build')`
  - `strength_focus_power` → `makeStrengthFocusSplit('power')`
- `createWeekSessions(ctx)` emits **4 distinct `IntentSession`s** in **U/L/U/L** order when `strengthFrequency === 4`; at ≤3 it is **never selected** (the gate can't route here below 4 — §5), so it has no ≤3 behavior to preserve.

**The shared U/L/U/L container** owns ordering (Upper, Lower, Upper, Lower), day-spacing intent (non-consecutive where possible), the block-linear load curve (`loadForWeek` 70→85%, deload 45% — lifted from `five_by_five`), and the deload/taper collapse. The lane only fills the four session bodies.

**Lane content sources:**
- **`build`** — **5×5-DERIVED** upper/lower split (§4.1). New session bodies, built from the 5×5 compound vocabulary. *Not `five_by_five` itself* — that protocol is full-body A/B 2× by definition and is untouched.
- **`power`** — composed by **reusing `performance_neural`'s existing session builders** (`createUpperStrengthSession`, `createUpperMaintenanceSession`, `createLowerNeuralSession`/`createBaseHypertrophyLower`/`createLowerMaintenanceSession`), **rebalanced** from today's upper-tilted 1L+2U to an even **2L/2U** (§4.2). Dependency: those builders must be **exported** from `performance-neural.ts` (today they're module-private). `performance_neural` itself is unchanged.

**Lane selection is NOT the gate's job.** Which lane an athlete gets follows from the strength goal/protocol seed (get-stronger/build → `build`; power/speed/RFD → `power`), resolved where `strength_protocol` is already chosen (`SPEC-per-discipline-periodization.md §13.1`). The gate (§5) only decides *how many* days. Keep "how many" (gate) and "what content" (lane) separate.

---

## 3. Naming discipline
The build lane is **5×5-DERIVED**, never labelled "5×5". 5×5 *is* full-body 2× (`SCIENCE-5x5-linear-progression.md §1`); a 4-day upper/lower split is a different structure that borrows 5×5's compound vocabulary and load model. Session names/tags use `strength_focus_split` / `derived:5x5`, not `five_by_five`.

---

## 4. Composition tables

### 4.1 `build` lane — 5×5-DERIVED U/L/U/L  *(CONVENTION)*

> **CONVENTION, not literature.** `SCIENCE-5x5-linear-progression.md` prescribes 5×5 as **full-body, 2×/week, A/B** (§1) — it does **not** specify a 4-day upper/lower split. This table **redistributes the doc's compound vocabulary and load model across 4 days** for the strength-focus (parked-endurance) mode. Every parameter below is sourced from the doc; the *split arrangement itself* is the convention. The athlete's retest is the truth signal (§4/§5.5), not this layout.

| Day | Focus | Movements (sets×reps) | Sourced from SCIENCE-5x5 |
|---|---|---|---|
| 1 | **Upper** | Bench Press 5×5 · Barbell Row 5×5 | §1 compounds (bench, row); 5×5 §1 |
| 2 | **Lower** | Back Squat 5×5 · Romanian Deadlift 3×5 | §1 (squat); posterior-chain hinge |
| 3 | **Upper** | Overhead Press 5×5 · Pull-Up 3×5 | §1 (overhead press); vertical pull |
| 4 | **Lower** | Back Squat 3×5 · Deadlift 1×5 | §1 (squat; **deadlift reduced volume 1×5**) |

- **Load:** every working set rides the **block-linear 70→85% 1RM** curve, `~1.25%/week` increment (`§2`), anchored to the athlete's 1RM (measured → observed → cold-start seed → RPE; `§5.5`). Reuse `five_by_five`'s `loadForWeek`.
- **Deload:** recovery/taper weeks → **~45%** (`§3`).
- **Deadlift** stays **1×5 reduced volume** (`§1` — disproportionate systemic cost).
- **Squat twice/week** is faithful (5×5 squats every session, `§1`); Day 4 squat is the lighter exposure.
- **Vocabulary check — all names resolve in `exercise-role.ts` today** (`bench press`, `barbell row`, `back squat`, `romanian deadlift`, `overhead press`, `pull up`, `deadlift`, all `primary`). **No role-table edit required.** (Front Squat was considered and dropped precisely because it is the one name not in the table — avoiding it keeps this cut zero-touch on D-208.)

### 4.2 `power` lane — `performance_neural`-DERIVED U/L/U/L, rebalanced to 2L/2U

Reuse the existing builders; the only change is **distribution**: today base = `BaseHypertrophyLower` + `UpperStrength` + `UpperMaintenance` (1L+2U). Rebalanced:

| Day | Focus | Reused builder |
|---|---|---|
| 1 | **Upper** | `createUpperStrengthSession` |
| 2 | **Lower** | `createLowerNeuralSession` (build phase) / `createBaseHypertrophyLower` (base) |
| 3 | **Upper** | `createUpperMaintenanceSession` |
| 4 | **Lower** | `createLowerMaintenanceSession` |

No new exercises; no change to `performance_neural`'s own output. Load/phase logic stays inside the reused builders.

---

## 5. The mode-gate logic (the owned frequency policy)

D-220 makes the cap **one owned property**, not a literal threaded everywhere. The gate maps endurance posture → the strength-frequency ceiling, then clamps the requested frequency:

```
// supabase/functions/shared/strength-system/frequency-policy.ts  (new, single owner)
//
// D-220: interference budget scales with endurance recovery load (Rønnestad —
// develop blocks pair with ~20-30% reduced endurance volume). Freq-4 is a
// strength-focus MODE, unlocked only when endurance is not in a develop block.

type EndurancePosture = 'develop' | 'maintain' | 'parked' | 'none';

function strengthFrequencyCeiling(p: EndurancePosture): 0|1|2|3|4 {
  switch (p) {
    case 'develop':            return 3;   // concurrent ceiling (tri handled elsewhere = 2)
    case 'maintain':
    case 'parked':
    case 'none':               return 4;   // strength-focus mode unlocked
    default:                   return 3;   // unknown posture → safe = concurrent ceiling
  }
}

function effectiveStrengthFrequency(requested: number, p: EndurancePosture): number {
  return Math.min(requested, strengthFrequencyCeiling(p));
}
```

**Wiring (run path):** read the endurance (run-discipline) posture from `per_discipline_posture`; compute `effectiveStrengthFrequency(request.strength_frequency, posture)` **once**, before the value reaches `overlayStrength`. That clamped number is what flows through `strength-overlay.ts` → `computeStrengthForPlanWeek` → placement.

**Why it's provably a no-op at ≤3:** for `develop`, `min(req, 3) = req` for every `req ≤ 3`; for `maintain`/`parked`/`none`, `min(req, 4) = req` for every `req ≤ 3`. So the gate changes nothing for any existing (≤3) request, regardless of posture. It only ever *permits* a 4 to survive — and only under non-develop endurance. (Hard-guard math, §7.)

---

## 6. Build list — ORDERED (content first; placement is load-bearing)

### 6.1 Content (the long pole) — do first
1. **`strength-focus-split.ts`** — `makeStrengthFocusSplit(lane)`, the U/L/U/L container + the `build` lane bodies (§4.1). Register both ids in `selector.ts`.
2. **Export `performance_neural`'s session builders**, then wire the `power` lane (§4.2).

### 6.2 ⚠ Placement — the 4-slot template (LOAD-BEARING, easy to miss)
3. **Add a `>= 4` strategy in `placement/strategy.ts`** that yields **four** weekday slots. **Without this, the 4th session falls to the `simple.ts:286-311` remainder loop and doubles onto an existing day — you get a broken 3-days-with-a-double, not U/L/U/L.** This is the single most overlookable failure in the cut. The template must place 4 distinct days with sane spacing around the run days.

### 6.3 Freq plumbing (run path only)
4. Widen the types so `4` survives instead of being a type lie:
   - `protocols/types.ts:88` (`strengthFrequency`), `placement/types.ts:22` + `placement/simple.ts:137` (cast).
   - `generate-run-plan/strength-overlay.ts:124,632,665,705`; `generate-run-plan/index.ts:289`; `generate-run-plan/types.ts:28,145`.

### 6.4 The gate
5. **`frequency-policy.ts`** (§5) + its single wire-in on the run path before `overlayStrength`.

### 6.5 Tests (§7)
6. Guard suite: freq-4 emits 4 distinct U/L/U/L sessions on 4 distinct days, both lanes; the gate caps `develop`→3 and permits `parked`→4; **byte-identical at ≤3**.

---

## 7. Hard guards & test plan

**The guard: byte-identical at freq ≤ 3.** It is *structurally* true and must be *test*-true:
- The new module activates **only at freq 4** (the gate cannot route below 4); existing protocols are untouched.
- `performance_neural` is unchanged (the power lane *imports* its builders).
- Type widening `2|3 → 2|3|4` is additive.
- The new `>= 4` strategy branch leaves the `≤3` strategies untouched.
- The gate is a no-op for every `req ≤ 3` (§5 math).

**Tests (mirror the E3b / Q-089 guard pattern, `deno test`):**
1. **Regression:** a sweep of existing run plans at freq 0/2/3 → output byte-identical to HEAD (the load-bearing test).
2. **Emission:** freq-4 `build` and `power` each return exactly 4 `IntentSession`s, ordered U/L/U/L, distinct bodies.
3. **Placement:** the 4 sessions land on 4 distinct weekdays (no doubling, no remainder-loop fallback).
4. **Gate:** `develop` posture clamps a requested 4 → 3; `maintain`/`parked` permits 4; unknown → 3.
5. **Proof-of-pipe:** preview probe through the live Deno runtime with injected `strength_frequency: 4` + parked endurance posture → a legal U/L/U/L run week, no DB write (the E3b method).

---

## 8. Suggested order of attack (de-risked)
**Power lane first as the pipe-prover** — it needs no new vocabulary and reuses existing builders, so it isolates and proves the plumbing (§6.2–6.4: placement template + types + gate) end-to-end before the `build` lane takes on net-new content. Then build the `build` lane against a proven pipe. (Refines D-220's "build first" note now that the code's been read — flagged for confirmation.)

---

## 9. Open sub-decisions (confirm before/inside the build)
- **Lane selection source:** confirm `get-stronger`/`build` → `build` lane and `power`/`speed` → `power` lane, resolved at the `strength_protocol` seed (§13.1). (Default assumed above.)
- **Power-first vs build-first** (§8) — recommend power-first; D-220 said build-first.
- **Day-spacing intent** for the 4-slot template around run days — needs a concrete weekday pattern (e.g. which two of the four are the "upper" days relative to long run / quality run days).

---

*Cross-ref: D-220, `AUDIT-strength-frequency-concurrent-matrix-2026-06-29.md`, `SCIENCE-5x5-linear-progression.md`, `SCIENCE-concurrent-training-interference.md`, `SPEC-per-discipline-periodization.md §13.1`, D-219 (E3b budget — the soft funding link), `ROADMAP-strength-engine.md` Phase 2.*
