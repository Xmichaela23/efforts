# AUDIT — Strength Frequency / Concurrent Matrix (the Q-088 prerequisite)

**Date:** 2026-06-29
**Why this exists:** Q-088 (raise the strength frequency cap from 2–3 to 4+, build a true upper/lower split) is filed as "touches every strength cell — needs the concurrent-matrix audit first to map the whole picture before deciding the frequency architecture." That audit was referenced (`OPEN-QUESTIONS.md:1154`, `ISLAND-PROPOSAL.md:179`) but never written. This is it.
**Method:** three independent read-only code traces against `/Users/michaelambp/efforts`, cross-checked. No code changed. Load-bearing findings (the `strFreqForPhase` ceiling, the protocol-builder structural cap) were each confirmed by two independent traces and spot-verified by hand. Line numbers are as of this date — re-verify before editing; the engine drifts.
**Scope note:** this maps the *current* state and the *blast radius* of raising the cap. It is a scoping sheet, not an implementation spec. The 4-day-split design decisions it surfaces are listed in §6 for a human call.

---

## 0. The headline — three traps that make this "not a one-line change"

1. **The cap is not in one place. It is layered five-deep, and the deepest layer is the real one.** Frequency flows: producers (wizards/seeds) → `training_prefs.strength_frequency` → reconciler/optimizer (combined) or request params (run/tri) → `ProtocolContext.strengthFrequency` → **each protocol's `createWeekSessions`, which builds a fixed number of session objects.** You can widen every type and clamp above and still get no 4th session, because the protocol builders themselves only ever construct 2–3 sessions. **The protocol session-builders are the true structural cap** (§3, Tier 1.3) — that is the load-bearing work; everything else is types and `Math.min` guards layered on top.

2. **The combined path has TWO independent frequency numbers, and the visible cap is the one the docs don't mention.** A naive fix that widens the reconciler/optimizer cap does *nothing*, because `week-builder.ts` re-derives its own per-week count via `strFreqForPhase` (`:112-132`) — which **returns max 2 for every phase** — then `slotsPlanned = slotsOrdered.slice(0, strFreq)` (`:1867`) slices the reserved slots back down. Even if the optimizer reserved 3 days, the week-builder emits ≤2. (Verified by hand: `strFreqForPhase` returns `base→2, build→1|2, race_specific→1|2, rebuild→2, default→1`.)

3. **The freq-3 degradation is non-uniform — each protocol fails a different way.** There is no single "freq-3 behaviour" to extend. At freq 3 today: `upper_aesthetics` and `durability` emit "another lower" (L/U/L, not a real split); `five_by_five` and `triathlon_performance` hard-cap at 2 and silently drop the third slot; `performance_neural` ignores frequency entirely (always 1 lower + 2 upper); `minimum_dose` exact-matches `=== 2 / === 3` so a `4` falls through to a single full-body session. A 4-day split has to be designed per protocol, not bolted on once.

**Net:** Q-088 is a real cut across ~5 tiers and ~7 protocol builders, with two count mechanisms in the combined path that must rise together. The architecturally clean target (§5) is to collapse the scattered cap into **one owned frequency policy** (the "SPA" consolidation the Q-088 fold-in proposes), so the next frequency change is one edit, not this.

---

## 1. The matrix — what each protocol emits by frequency

Protocol modules live in `supabase/functions/shared/strength-system/protocols/`. ID→module routing in `selector.ts:8-14,53-57`.

Loading week, non-recovery, non-taper (base/build phase):

| Protocol (id) | freq 1 | freq 2 | freq 3 | Structural cap / degrade |
|---|---|---|---|---|
| **five_by_five** (`five-by-five.ts`) | 1: Workout A *or* B (week parity) | 2: A + B | **2: A + B (3rd slot dropped)** | Hard cap at 2, explicit (`:91-92`). Both full-body. |
| **upper_aesthetics** (`upper-priority-hybrid.ts`) | 2: Lower-Maint(Mon) + Upper-Strength(Wed); freq floored `max(2,raw)` (`:82`) | 2: same | **3: + Lower-Durability(Fri) — "another lower", NOT a split** (`:93-95`) | Only ONE upper builder. 3rd = a 2nd lower. |
| **durability** (`foundation-durability.ts`) | 2: Lower-A + Upper-Posture; `max(2,raw)` (`:64`) | 2: same | **3: + Lower-B — another lower** (`:73-75`) | One upper builder; lower has A/B. |
| **neural_speed** (`performance-neural.ts`) | **3** (ignores freq): 1 Lower + Upper-Strength + Upper-Maintenance | **3** identical | **3** identical | **Ignores `strengthFrequency` entirely** (`:56,91-101`). "Optional for 3x" comment (`:512`) is stale. |
| **minimum_dose** (`minimum-dose.ts`) *(deferred — not in runtime set, `selector.ts:38-45,71`)* | 1: FullBody | 2: FullBody + Upper-Maint | 3: FullBody + Upper-Maint + Lower-Maint | Exact-match `===2 / ===3` (`:66,68`). A `4` → falls through to **1 session**. |
| **triathlon** (`triathlon.ts`, support, full-body) | 1 | 2 | early-base 3, else 2 (`min(freq,2/3)`) | All full-body, no split by design (`:22,48`). |
| **triathlon_performance** (`triathlon_performance.ts`) | 1: Lower only | 2: Lower + Upper | **2 (3rd dropped)** | Binary `freq>=2` split, caps at 2 (`:106,189-213`). Cleanest real upper/lower. |

### Raw material for a 4-day (L/U/L/U) split
- **Real upper/lower split already present (best base):** `triathlon_performance` (per-phase Lower/Upper builders, `:189-212`); `performance_neural` (two upper builders + three lower builders already in hand, `:75-99` — closest to L/U/L/U components, just doesn't gate on freq).
- **Has an upper but only one (needs a 2nd upper):** `upper_aesthetics`, `durability`.
- **A/B index but FULL-BODY (needs new split session defs):** `five_by_five`, `triathlon`. `minimum_dose` has maintenance add-ons but no split structure.

---

## 2. The frequency data-flow — two paths, compared

### Path A — combined engine (run / tri / **non-race builder all route here**)
Frequency is born **twice** and the two numbers are independent:

- **A-1 Slot count (reserves days):** `reconcile-…-week-optimizer.ts:57-63` `inferStrengthFrequency` (`Math.min(3,prefLen)` at `:60`) → `:165` `strengthFreq = max(inferred, freq.strength_per_week)` → optimizer `preferences.strength_frequency` (`:185`) → `_shared/week-optimizer.ts:1358` placement, gated `>=1`(`:1501`)/`>=2`(`:1502`)/3rd-day via `placeThirdStrengthIfNeeded` (`:1465-1499`, early-returns if `<3`). **No fourth-day branch.** Slots → `strength_optimizer_slots` with `session_index = upper ? 1 : 0` (`:255`; type `0|1` only, `types.ts:289`).
- **A-2 Per-week emission count (re-derived, independent):** `week-builder.ts:1806` `strFreqForPhase(...)` → **max 2 any phase** (`:112-132`) → `strength_sessions_cap` clamp `Math.min(3,…)` (`:1834`) → **`slotsPlanned = slotsOrdered.slice(0, strFreq)` (`:1867`) is where the count is actually decided** → per slot calls `triathlonStrength`/`runStrength` with `{ sessionIndex: slot.session_index }` (`:1873/:1897`). Both factory fns are now `sessionIndex`-correct post-Q-089 (`session-factory.ts:2490-2491/2586-2587`). `strengthFrequency: 2` is **hardcoded** in both factory ProtocolContexts (`:2466/:2579`) — a *content menu* knob, not a count knob.
- **A-3 Legacy fallback** (`week-builder.ts:1911-2055`, reconciler bailed): exactly 2 hardcoded slots, no 3rd/4th.

### Path B — legacy run engine (`generate-run-plan`)
One number, straight through; only the taper overrides it.
`request.strength_frequency` (`index.ts:289`, cast `as 2|3`) → `overlayStrengthLegacy` → `overlayStrength` (`:246`) → `computeStrengthForPlanWeek` (`:549`): sets `context.strengthFrequency = args.frequency` (`:606`) → `protocol.createWeekSessions` (`:616`). **The `placementFrequency` ternary (`:631-633`):** taper arm = `effectiveFrequency` (`getTaperStrengthParams` only ever returns 1 or 2, `:150-186`); non-taper arm = raw `args.frequency`. → `simple.ts:137` placement (`|| 2`, cast `0|1|2|3`) → strategy `slotsByDay`. Surplus sessions hit the "graceful fallback" remainder loop (`:286-311`) which **doubles onto an existing day, never adds a 4th day.** (`simple.ts` is Path-B-only; tri never touches it.)

### Where the paths diverge (matters because Q-088 must change both, or consciously not)
| | Path A (combined) | Path B (run) |
|---|---|---|
| Where count is really decided | `strFreqForPhase` + `slice(0,strFreq)` (`week-builder:1867`) — phase-derived, **≤2** | `frequency` request value + strategy slots |
| Who decides days | `week-optimizer` placement → optimizer slots | `simple.ts` strategy `slotsByDay` |
| Taper cap | folded into `strFreqForPhase` | dedicated `getTaperStrengthParams` (1–2) |
| Content "freq" knob | hardcoded `2` in factory (`:2466/:2579`) | real `frequency` into context (`:606`) |

**The trap restated:** a change made only in the reconciler/optimizer is silently overridden per-week in Path A by `strFreqForPhase`.

---

## 3. The cap inventory → deduplicated edit list (by blast radius)

### TIER 1 — SHARED chassis (affects combined run/tri AND standalone run/tri). Required for any path to exceed 3.
1. `shared/strength-system/protocols/types.ts:88` — `strengthFrequency: 2 | 3` → widen.
2. `shared/strength-system/placement/types.ts:22` + `placement/simple.ts:137` — `0|1|2|3` type + cast → widen.
3. **Each protocol `createWeekSessions` session-building branch — add the 4th-session branch.** `foundation-durability.ts:64-76`, `upper-priority-hybrid.ts:82-96`, `performance-neural.ts:55-101`, `minimum-dose.ts:66-71`, `five-by-five.ts:92`, `triathlon.ts:75,92`, `triathlon_performance.ts:106,126`. **← the load-bearing work; without it freq=4 yields no 4th session regardless of clamps.**
4. `shared/strength-system/placement/strategy.ts` — add `>=4` slot branches in each `getXStrategy` (`:69,113,154,175,197,265`).
5. `_shared/tri-optimizer-prefs.ts:6,11` — `OptimizerFrequency` type + `clampFreq`'s `Math.min(3,…)`.
6. `src/lib/session-frequency-defaults.ts:97,239,241,362-377` — let `strengthCountFromIntent` / §7 return 3–4.

### TIER 2 — COMBINED path only
7. `_shared/week-optimizer.ts:159` (type) + `:1465-1499` — add a **`placeFourthStrength`** routine (none exists; `placeThirdStrengthIfNeeded` is terminal) with its day-spacing logic.
8. `reconcile-…-week-optimizer.ts:57,60,165` — widen type + `Math.min(3,…)`.
9. `generate-combined-plan/week-builder.ts:121-131` (`strFreqForPhase` ceilings — **the real per-week cap**), `:1834` (`Math.min(3)`), `:1989+` (legacy fallback builds only 2 slots).
10. `generate-combined-plan/session-factory.ts:2466,2579` — thread `strengthFrequency` from `athleteState` instead of hardcoded `2`.

### TIER 3 — RUN-standalone path only
11. `generate-run-plan/types.ts:28,145`; `strength-overlay.ts:124,632,665,705`; `generate-run-plan/index.ts:289`.

### TIER 4 — TRI-standalone path (currently capped at **2**, not even 3)
12. `generate-triathlon-plan/types.ts:61`; `tri-generator.ts:1126`; `validation.ts:43` (rejects ≥3); `create-goal-and-materialize-plan/index.ts:2632` (`Math.min(2,…)`, "cap UI value of 3 to 2"). **Raising tri to 3 is itself a change before 4 is reachable.**

### TIER 5 — PRODUCERS / UI (no new freq reaches the engine without these)
13. `src/components/PlanWizard.tsx:176,2215-2238` (offers only 0/2/3 — add 4); `ArcSetupWizard.tsx:576,750` (caps at 2); `NonRaceBuilder.tsx:119,130` (hardcodes 2); `arc-setup-chat/index.ts:131,133`; `create-goal-and-materialize-plan/index.ts:696,3093`; `src/lib/{parse-arc-setup.ts:15, arc-setup-persistence.ts:91,129, enrichArcGoalTrainingPrefs.ts:61}`.

### Display-only consumers (won't cap, but will show wrong copy at 4)
`AllPlansInterface.tsx:1677`, `PlanWizard.tsx:2409/2429/2486/2529/2541`, `create-goal-and-materialize-plan/index.ts:3108` (`>=2` hint).

---

## 4. Two facts a fix must not get wrong
- **The hardcoded `strengthFrequency: 2` in the factory (`session-factory.ts:2466/:2579`) is a content-menu knob, not a count knob.** In the combined path the calendar count = how many times week-builder *calls* the factory (driven by `strFreq` + slot count); the factory's own `2` only bounds the per-call protocol menu. **Both must rise** for a 4th session to land.
- **Taper deliberately narrows** (`strength-overlay.ts:132` `effectiveFrequency: 0|1|2`). Leave it unless a 4× taper is explicitly intended.

---

## 5. Architectural recommendation — consolidate, don't thread

The audit validates the Q-088 fold-in proposal: **today the frequency cap is a `2|3` literal scattered across ~5 tiers plus an inline per-phase clamp; the fix should make it ONE owned property** — a single frequency policy the chassis owns and every consumer queries — so raising 2→3→4 is one edit, not the Tier-1-through-5 sweep above. This is D-213's "extend, don't fork" applied to strength. Concretely that means: the per-week count decision (today split between `strFreqForPhase` and `slice(0,strFreq)` in Path A, and `args.frequency`+strategy slots in Path B) collapses into one policy object that owns (a) the cap, (b) the per-phase ceiling, (c) the taper step-down, and (d) the day-placement count. The protocol builders (Tier 1.3) still each need their 4th-session content — consolidation removes the *plumbing* tax, not the per-protocol design work.

### Suggested sequencing (smallest correct increments)
1. **Pick the split target first** (§6) — the 4-day shape and which protocols get it — before any code. The split design drives the builder work, which is the long pole.
2. **Tier 1.3 on the chosen protocols** — add the 4th-session builders (start with `performance_neural` / `triathlon_performance`, which already have the components).
3. **One path end-to-end before the other.** Recommend Path B (run, `generate-run-plan`) first: it is the simpler single-number flow and is the standalone case Q-088 is named for. Prove freq-4 materializes one legal 4-day week there.
4. **Then Path A (combined):** the two-number reconciliation (`strFreqForPhase` ceiling + a `placeFourthStrength` optimizer routine) — the harder half.
5. **Consolidate to the owned frequency policy** as/after the second path lands (you are rebuilding the guts anyway — the roadmap's "best done alongside, not before").
6. **Tri (Tier 4)** is a separate sub-decision: it caps at 2 today by deliberate interference budget — raising it is a science call, not just a clamp (`SCIENCE-concurrent-training-interference.md`).

---

## 6. Open decisions — RESOLVED by D-220 (2026-06-29)
- **4-day split shape →** **U/L/U/L, structure only** (not a hypertrophy-split philosophy).
- **Which protocols get a 4-day variant →** **two developer lanes only:** *build* (`five_by_five` lineage — net-new split content; 5×5 itself stays full-body A/B 2×) and *power* (`performance_neural` lineage — reuse its upper/lower builders, **rebalanced** from today's upper-tilted 1L+2U to an even 2L/2U). Aesthetic/isolation EXCLUDED as a 4-day developer (`upper_aesthetics` stays a supplementary overlay).
- **Concurrent vs standalone →** **neither — it's an endurance-POSTURE gate / strength-focus MODE:** endurance `develop` → ≤3 (tri 2); endurance `maintenance`/`parked` → may reach 4. Funded by E3b hours-budget reallocation (soft sequencing link, not a hard block — see D-220).
- **Optimizer 4th-day placer →** **deferred.** Run-path (`generate-run-plan`) first; combined/tri stay ≤3 this cut (Tier 2.7 out of scope).

---

*Companion to: Q-088 (`OPEN-QUESTIONS.md`), `ROADMAP-strength-engine.md` Phase 2, `SPEC-non-race-goal-plan-contract.md` (Q-088 is its hard dependency), `SPEC-per-discipline-periodization.md §13.1`. Supersedes the "concurrent-matrix audit (in progress)" placeholder referenced in `OPEN-QUESTIONS.md:1154` and `ISLAND-PROPOSAL.md:179`.*
