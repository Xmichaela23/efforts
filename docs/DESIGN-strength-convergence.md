# DESIGN — Strength convergence (fracture #1): one direction, one substrate, subordinate prescription

**What this is.** The design ruling for TRUTH-MAP fracture #1 (strength contradicts itself on the State screen). It settles the one decision that had to be locked before any code: **where "is e1RM improving" is computed, and how it relates to the per-session "add weight / back off" prescription.** Ratified as **D-270**. Annexes **Q-107 H2/H3** and advances **Q-106 step 5**.

**Status:** design ratified 2026-07-10 (Michael). Build sequenced below; behavior-unchanged spine persistence is the first, contained step (Law 6).

---

## 1. The question

The State screen shows three strength engines that can contradict (TRUTH-MAP fracture #1):
1. b2 7-day execution row (coach `strength_session_types_7d`)
2. volume / e1RM **trend** (client-live `assembleStateTrends.strengthFitness`, from `exercise_log.estimated_1rm`)
3. per-lift **verdict** (coach `response_model.strength.per_lift`)

The fork to settle: **is "is e1RM improving" (a multi-week direction) the same fact as "add weight / back off" (a per-session prescription), or two facts?**

## 2. What the code actually does (audit 2026-07-10, verified by trace)

- **The spine already computes a real per-lift direction** — `computeStrengthState` (`_shared/state-trend/strength.ts:79-113`) classifies each lift's `estimated_1rm` series (`classifyTrend`) into improving / holding / sliding. **Then it throws the per-lift list away:** `rollUp` collapses it to a single aggregate before caching, so `state_trends_v1.strength.e1rm` (`assemble.ts:249-253`) holds only one rolled-up verdict — no per-lift breakdown.
- **The coach per-lift `e1rm_trend` is a dead field.** `previous_e1rm` is hardcoded `null` (`coach/index.ts:2194`), so the delta is always null and `e1rm_trend` is always `'stable'` (`response-model/weekly.ts:208-230`). The visible per-lift verdict is **RIR-driven** (`computeLiftVerdict`), with the typed 1RM (`resolveStrengthCapacity`) used only to soften alarm tone. This is the exact defect filed as **Q-107 H2**.
- **Two data trails for the same lift.** The trend row reads `exercise_log.estimated_1rm`; the coach per-lift reads `learned_fitness.strength_1rms`. Same session, two different numbers, nothing forces agreement.
- **`resolveStrengthCapacity` owns the anchor value only** (`capacity-resolver.ts`), typed-frozen (D-231). It has no direction field — it **cannot** be the authority for "is improving."

**Consequence:** the handoff's original recommendation (compute direction in the coach per-lift model) was based on a false premise — that model computes no direction at all. Putting it there would mean *building new direction math in the coach* — a fresh off-spine authority, the Law-5 debt CANON §12 warns against.

## 3. The decision

**Two facts, one substrate, and the prescription is subordinate to and framed by the direction.**

| Fact | What it is | Authority (single source) | Tense |
|---|---|---|---|
| **Strength direction** ("is e1RM improving") | multi-week fitness trend, per lift | **the SPINE** (`computeStrengthState`, persisted per-lift) | backward-looking outcome |
| **Load prescription** ("add weight / back off") | per-session autoregulated dose | **the COACH** (`computeLiftVerdict`, RIR-driven) — *reads* the spine direction to frame itself | forward-looking action |

Both derive from the **same estimated-1RM series** (`exercise_log`). Neither mints its own parallel number. The prescription never renders as a verdict that competes with the direction — it renders *in the direction's light* ("getting stronger — ease off today to keep it that way").

### Why two facts, not one (external research, 2026-07-10)

The autoregulation literature and every serious strength app model these as **distinct concepts with a fixed relationship** — and none show them as competing verdicts:

- **Separate by design.** Strong / Hevy show estimated-1RM as a *trend chart* (outcome); working-weight recommendation is a *separate* feature (Hevy Trainer) or manual (Strong). Different tense, different surface.
- **One control loop, multi-level.** JuggernautAI: per-session RPE feedback simultaneously updates the trend inference ("crushed it at RPE 7 → getting stronger than expected → push") and sets the next prescription. Autoregulation runs at session / week / cycle levels off the *same* feedback — the performance is the shared **input**, direction and prescription are two **outputs**.
- **Short-term divergence is the point.** RTS/Tuchscherer: on a bad day you back off mid-good-cycle to *protect* the trajectory. "Getting stronger overall" + "ease off today" is coherent, not a contradiction. Autoregulation's whole job is adjusting the short-term dose to keep the long-term trend up.

So the TRUTH-MAP contradiction isn't inherent — it's a **presentation + data-trail** problem: (a) the two facts were stacked as equal verdicts, and (b) they read different tables so they can disagree about the same session. Both are fixed below.

### The Efforts-honest upgrade

JuggernautAI will spike "getting stronger than expected" off a *single* lucky RPE reading. Efforts' CANON (confidence stamped on every inference, baseline-maturity gating) does this **more honestly**: the spine's confidence-stamped multi-week direction frames the prescription, so one good session can't mint a false "you're getting stronger." Direction leads; prescription serves it; confidence travels (CANON §3, Law 3).

## 4. The build (makes strength look like run)

Almost no new math — the direction already exists on the spine; we stop discarding it and rewire reads.

1. **Spine — persist the per-lift breakdown.** Stop `rollUp` from discarding the `LiftVerdict[]` `computeStrengthState` already produces. Add `state_trends_v1.strength.per_lift[]` (per lift: `canonical`, `direction`, `pctChange`, `estimated_1rm`, `sampleCount`, `provisional`). Additive → existing consumers unchanged (Law 6 behavior-unchanged; golden fixture on the existing aggregate). **First step — contained, low-risk.**
2. **Coach — read the spine direction; kill the dead field.** Repoint `response-model/weekly.ts` per-lift to read `state_trends_v1.strength.per_lift[].direction` instead of the always-`stable` `e1rm_trend`. Remove the hardcoded-`null` `previous_e1rm` path (closes **Q-107 H2**). The RIR verdict stays the coach's, but is now *framed by* the spine direction, not a blind parallel.
3. **Client — render, don't compute.** The State trend row reads the persisted per-lift + aggregate from `state_trends_v1` instead of recomputing live in the browser. This is the **S2** move (retire `useStateTrends`), done for strength; it also collapses **Q-107 H3** (the two STRENGTH rows become one direction + a subordinate prescription).

### Verification (Law 6)
- Golden fixture proving the existing aggregate `strength.e1rm` is byte-identical after step 1 (pure additive).
- Fixture proving the coach per-lift direction now equals the spine per-lift direction for the same input (kills the two-data-trail divergence).
- Deno fixtures, not prod. Coach payload change → bump `COACH_PAYLOAD_VERSION`.
- The render/tone (subordinate framing prose) touches the LLM appendix → **≥3 back-to-back clean recomputes**, never one.

## 5. What this does NOT do (scope fence)

- **Not the tone/history layer.** "Bench down ~10% over the marathon block — expected, rebuild Week 1" is **Q-111** (§1 descoped). This design gives Q-111 the substrate it needs (one direction fact, framed prescription) but does not build the plan/history-aware tone.
- **Not the whole coach-onto-spine migration.** This is Q-106 **step 5** (strength verdict / top-lifts onto the spine) only. Readiness/ACWR/RPE (steps 2/6, Q-109/Q-110) are out of scope.
- **Not living baselines.** `resolveStrengthCapacity` stays typed-frozen (D-231) — the anchor is still the anchor. Making the learned value *lead* (TARGET-ARCHITECTURE "living baselines") is a separate, deliberate resolver change, not this.

## Cross-refs
- **Annexes:** Q-107 H2 (dead `previous_e1rm`), Q-107 H3 (two STRENGTH rows).
- **Advances:** Q-106 step 5 (strength verdict onto spine); S2 (retire `useStateTrends`, FOUNDATION-READINESS Track 1) for the strength slice.
- **Serves:** TARGET-ARCHITECTURE ("make X look like run"), CONSTITUTION Law 1/4/5, CANON §3/§12.
- **Depends on / respects:** D-231 (typed-anchor resolver, unchanged), D-236 (ACWR authority pattern — the template this copies), D-239 (run = the model), D-270 (this ruling).
- **Code:** `_shared/state-trend/strength.ts`, `assemble.ts` (spine), `_shared/response-model/weekly.ts`, `coach/index.ts:2170-2205` (coach), `src/hooks/useStateTrends.ts`, `StatePerformanceSection.tsx`, `StateTab.tsx` (client).

## Changelog
- **2026-07-10** — Created + ratified (D-270). Fork settled: two facts (direction = spine, prescription = coach), one substrate (`exercise_log.estimated_1rm`), prescription subordinate to and framed by direction. Backed by autoregulation research (RTS/Tuchscherer, JuggernautAI multi-level autoreg, RP, Zourdos/Helms RIR-RPE) + the 2026-07-10 code trace. Build sequenced; spine per-lift persistence is the contained first step.
