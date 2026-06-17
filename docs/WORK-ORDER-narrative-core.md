# WORK ORDER — Shared Narrative-Reasoning Core (cross-discipline consolidation)

**Status:** IN PROGRESS (2026-06-16). Core built; the **FOUR SESSION-SCOPED LEGS ARE DONE** — RUN (D-187), RIDE (D-188, no-regression), STRENGTH (D-189, e1RM wired + fabrication vector closed), SWIM (D-190, reference preserved + Q-061 kick/drill narrative flag completed). **ONLY COACH (leg 5, week/state-scoped) REMAINS** — filed below, not started. (Also still open, separate: Q-061 trend-substrate exclusion → held swim-cleanup work order.)

**Purpose:** This is the executable plan for consolidating all four discipline narratives (run / ride / swim / strength) onto ONE shared reasoning core. It is **self-contained** — a fresh session must be able to execute Phase 3 from this doc alone (same discipline as the feature-audit work order). Do not rely on conversation memory.

**This is continuity leg #3 — REASONING**, after numbers (D-185 run resolver) and display (D-186 Details consolidation). Same invariant: single-source the **logic**, the way D-185/D-186 single-sourced the **numbers**.

**Standard (read these first, every time):**
- `docs/SPEC-universal-narrative-inference.md` — the 7 universal rules + per-discipline addenda (THE standard the core enforces).
- `docs/SPEC-honest-swim-inference.md` — the swim addendum + reference implementation (full swim detail).

---

## THE PROBLEM (why this refactor)

The four narratives are **four divergent paths** — four prompt locations, four structures, four *different subsets* of validators. Fixing swim over five iterations never fixed run, because nothing is shared. Current state (Phase 1 map, vetted):

| | Fact packet built | Prompt built | Structure | Validators it has |
|---|---|---|---|---|
| **RUN** | `_shared/fact-packet/build.ts` (`buildWorkoutFactPacketV1`) | `_shared/fact-packet/ai-summary.ts` (`COACHING_SYSTEM_PROMPT` + sectional `buildUserMessage`); called from `analyze-running-workout/index.ts:2172` | multi-section, 1 call, 2-attempt | `noNewNumbers`, `validateTerrainExplainsDrift`, feeling-contradiction, adaptive-length |
| **RIDE** | `_shared/cycling-v1/build.ts` | `_shared/cycling-v1/ai-summary.ts` (`generateCyclingAISummaryV1`) | single paragraph 3–4 sent, 1 call, 2-attempt | `noNewNumbers`, `validateClaimsGrounded`, `summaryHasJargon`, `ledeOpensWithArcFrame` ← **strongest set** |
| **STRENGTH** | inline `analyze-strength-workout/index.ts` (`strength_fact_packet_v1`) | inline same file | single paragraph 3–4 sent, 1 call | weakest — number discipline via prompt only |
| **SWIM** | inline `analyze-swim-workout/index.ts` | inline same file (D-183) | single paragraph plain prose, 1 call | inline rules; zone-anchored-HR helper ← **cleanest honesty rules** |

### 7-rule compliance scorecard (vetted Phase 1)
| Rule | RUN | RIDE | STRENGTH | SWIM (ref) |
|---|---|---|---|---|
| 1 Reason across signals | ⚠️ prose-only, silos slip | ✅ mostly | ❌ S2 "pick one" *enforces* silo | ✅ work:rest+RPE+HR lead (D-179) |
| 2 No cross-section contradiction | ❌ **no consistency check** | ✅ structural (1 para) | ✅ structural | ✅ structural |
| 3 Anchor to athlete | ✅ HR→zones; ⚠️ effort words unmapped | ✅ power-truth/WperKg/HR-secondary | ⚠️ RIR-anchored; names e1RM it lacks | ✅ zone-anchored avg HR (D-183) |
| 4 Observe not diagnose | ⚠️ co-cause (heat+terrain) not forbidden | ✅ banned | ❌ "lower energy may have impacted" | ✅ never diagnoses rest cause |
| 5 Avg/peak, trend/session | ✅ trend-first + adaptive | ✅ `validateClaimsGrounded` | ⚠️ single-session progress risk | ✅ avg-not-peak, trend-gated |
| 6 No fabricated mech/numbers | ✅ `noNewNumbers` 2-attempt | ✅ + jargon ban | ❌ **e1RM fabrication vector** | ✅ equipment direction-only |
| 7 No card-restate, honest blanks | ✅ core test | ✅ brevity + CLAIM GUARD | ✅ HARD CUTS + 240-tok | ✅ no recitation |

**The live run bug (the first migration's success criterion):** the run user message is sectional (WORKOUT / HR / TERRAIN / WEATHER as separate lines), rule-1 is *prose* ("connect data across domains" in `ai-summary.ts`), and there is **no cross-section consistency validator** → an "easy/controlled" lead can coexist with an "elevated drift" body (rule 2), and heat+terrain+drift get reported as three facts without being reasoned together (rule 1). `validateTerrainExplainsDrift` only covers the clean `pace_driven`/`terrain_driven` enum cases, not co-occurrence.

---

## THE DESIGN — shared core, parameterized by adapters (NO monolith, NO `if discipline ==`)

Single-source the **logic** (rules + validators); leave **assembly** per-discipline. You cannot weaken a rule for one discipline without weakening the shared function all four call.

### Module: `_shared/narrative-core/`
```
narrative-core/
  types.ts        — DisciplineAdapter interface, SignalFlag, AnchorSet
  scaffold.ts     — buildReasoningScaffold(adapter) → the shared 7-rule prompt block
  validate.ts     — validateNarrative(summary, packet, adapter) → {ok, failures[], retryNote}
  index.ts        — barrel
  adapters/
    swim.ts  run.ts  ride.ts  strength.ts   — each ~40–60 lines, discipline-true
```

### The adapter interface (what each discipline supplies — `{signals, anchors, addendum}` + the rule-driving metadata)
```ts
interface DisciplineAdapter {
  discipline: 'run' | 'ride' | 'swim' | 'strength';
  // Rule 1 — signals that MUST be reasoned together IN THE LEAD (swim's D-179 win, generalized):
  leadSignals: string[];        // swim ['work:rest','RPE','HR'] · run ['pace','grade','heat','HR-drift']
                                 // ride ['power/intensity','HR-response'] · strength ['RIR','load','e1RM-trend']
  // Rule 3 — which effort claims have an anchor THIS session (else anchorlessEffort rejects absolute effort):
  anchors(packet): AnchorSet;   // {hr:'zones'|null, pace:'threshold'|null, power:'ftp'|null, strength:'e1rm-history'|null}
  // Rule 2 — signals the packet flags atypical/elevated, so the lead must RECONCILE them:
  atypicalSignals(packet): SignalFlag[];  // run: hr_drift>typical, decoupling high · ride: HR-vs-pool elevated
  // Rule 4 — causes the packet has DETERMINISTICALLY established (allowlist for causal language):
  establishedCauses(packet): string[];    // run: drift_explanation==='terrain_driven' → ['terrain'] · else []
  addendum: string;             // discipline honest-reads + traps, lifted from the SPEC addenda
}
```

### Half 1 — the shared SCAFFOLD (`buildReasoningScaffold(adapter)`) — STRUCTURAL, reason-right-up-front
Returns the **same 7-rule reasoning block** for every discipline, with three adapter-driven inserts. (Swim's rule-1 win was scaffold, NOT a validator — making the model reason right in the first place. Validators alone = catch-after, which is insufficient.)
- **Rule 1 insert:** "Your opening sentence must reason across {leadSignals} together, in relationship — never as a list." (Run: `pace+grade+heat+drift` → the silos fix.)
- **Rule 2 insert:** "These signals are atypical this session: {atypicalSignals}. The lead must reconcile them — it cannot call the session uniformly easy while a body section reports them."
- **Rule 4 insert:** "You may attribute cause ONLY to: {establishedCauses}. All other contributors (heat, terrain, fatigue) are named as plausible, never as proven sole cause."
- Rules 3/5/6/7 + the `addendum` appended verbatim from the SPEC.
Each analyzer **injects this block into its EXISTING prompt** (run into its sectional system prompt; ride into its paragraph prompt) — assembly unchanged, rules single-sourced.

### Half 2 — the shared VALIDATOR SUITE (`validateNarrative`) — the backstop
One function, run by ALL four (today each has only a subset). Lexical-deterministic, packet/adapter-aware (consistent with the existing `validateClaimsGrounded`/`validateTerrainExplainsDrift` precedent). Failures → retry note → 2nd attempt (existing 2-attempt pattern).

| Validator | Rule | Check | Generalizes from |
|---|---|---|---|
| `noNewNumbers` | 6 | numerals not in packet → reject | run + ride |
| `noContradiction` | 2 | lead uses uniformly-easy lexicon **AND** `atypicalSignals` non-empty **AND** no reconciling clause → reject ("reconcile lead with {signal}") | **NEW — the missing piece** |
| `groundedDirection` | 5 | trend/direction words without a trend field in packet → reject | ride `validateClaimsGrounded` |
| `anchorlessEffort` | 3 | effort claim on a signal whose `anchors()` is null → reject | swim neutral-floor + run zones |
| `noCauseDiagnosis` | 4 | causal connective (caused/because of/due to/drove) + a non-`establishedCauses` factor → reject/downgrade | run `validateTerrainExplainsDrift` |

**Primary enforcement is the scaffold; validators are the backstop.** Reason-right-first, catch-after — both halves required.

### Integration shape (per analyzer, unchanged location)
```
build packet (unchanged) → prompt = existingAssembly + buildReasoningScaffold(adapter)
   → generate → validateNarrative(out, packet, adapter) → [retry on fail] → ship
```

---

## SWIM = the proven reference (validate the core HERE before run touches it)

Swim already passes all 7 (it's the reference implementation). Its adapter:
```ts
swim: {
  leadSignals: ['work:rest','RPE','HR'],                 // D-179 — already its lead
  anchors: p => ({ hr: p.hrZones ? 'zones' : null }),    // D-183 zone-anchor + neutral floor
  atypicalSignals: p => [/* RPE×HR incoherence when present */],
  establishedCauses: () => [],                           // swim never diagnoses rest cause
  addendum: SWIM_ADDENDUM,                               // equipment DIRECTION (fins/buoy/paddles↑, kick/drill↓, snorkel~neutral)
}
```
**Acceptance gate:** running the core scaffold + validators against swim must **reproduce its current compliant output (no regression).** If the core can't reproduce the working case, the core is wrong — fix the core, not swim. This proves the rules before run migrates.

---

## MIGRATION ORDER (one discipline at a time, each verified on real data, deploys flagged, D-entry per discipline)

### 1. RUN (first — it's actively contradicting itself)
- **BEFORE migrating: capture the live contradiction sample.** Recompute a real hilly/hot run and record a live "easy lead vs elevated drift" (rule 2) / siloed terrain·heat·drift (rule 1) narrative. This is the before/after proof and makes the success criterion concrete.
- Keep the sectional prompt + packet. Inject `buildReasoningScaffold(runAdapter)` with `leadSignals=['pace','grade','heat','HR-drift']` (fixes silos). Add the two validators run lacks: `noContradiction` + `anchorlessEffort`. `establishedCauses` = `drift_explanation` when it's a clean single cause, else `[]`.
- **SUCCESS CRITERION:** re-run the captured workout → that exact contradiction is GONE; terrain+heat+drift reasoned together in the lead. No regression on rules 5/6/7 (already strong).
- Deploys: `analyze-running-workout` (+ `_shared/fact-packet/*` if touched). Log D-entry.

### 2. RIDE (the no-regression case — strongest existing validators, DON'T break them)
- Mostly behavior-neutral: replace its bespoke validators with the shared suite (they're near-supersets — `validateClaimsGrounded`→`groundedDirection`, `summaryHasJargon` stays ride-addendum, `noNewNumbers` shared). Inject the scaffold with `leadSignals=['power/intensity','HR-response']`, `addendum`=ride (power is truth, HR secondary).
- **SUCCESS CRITERION:** recompute several real rides → output byte-similar / no regression; the power-truth hierarchy + HR-secondary + structured-mode behavior (D-092/D-093) preserved. This proves the core doesn't damage the best case.
- Deploys: `analyze-cycling-workout`. Log D-entry.

### 3. STRENGTH (DATA PREREQUISITE — wire canonical e1RM FIRST)
- **PREREQUISITE (before/as part of migration):** `strength_fact_packet_v1` does NOT carry e1RM — it reads raw `workout.strength_exercises`, not the canonical `exercise_log.estimated_1rm` (`brzycki1RM → exercise_log`, already a clean single-source). Today it can *fabricate* e1RM (rule-6 vector) and can't express its e1RM-trend addendum. **Wire canonical `exercise_log.estimated_1rm` into the packet first.** (Shared-source note: the future strength Performance screen reads the SAME canonical source — this wiring de-risks that later build; Performance screen is a separate future workstream.)
- Then migrate: inject scaffold with `leadSignals=['RIR','load','e1RM-trend']`, `establishedCauses: []` (kills "lower energy may have impacted" causal framing), `anchors`= e1rm-history + RIR-target. Addendum = strength (NO pace/HR-as-effort; e1RM trend per exercise; RIR proximity-to-failure).
- **SUCCESS CRITERION:** recompute real strength sessions → no fabricated e1RM; e1RM-trend addendum expressible from canonical data; no causal framing; no endurance-framing import. Log D-entry (data fix may be its own sub-entry).
- Deploys: `analyze-strength-workout` (+ `compute-facts`/packet plumbing if touched).

### 4. SWIM (last — the reference; complete the Q-061 flag on the way through)
- Replace swim's inline prompt with `buildReasoningScaffold(swimAdapter)` + the shared validators. Behavior must match the current compliant swim (it's the reference).
- **COMPLETE Q-061's pessimistic-direction half:** the shipped D-183 narrative flags only the **fins/optimistic** direction ("reads faster"). Add the **kick/drill pessimistic-direction** flag ("this session included kick/drill sets, so the blended pace reads slower than your swimming pace") into the swim adapter's equipment-direction logic — landed THROUGH the shared core, not as an isolated swim patch. (See `SPEC-honest-swim-inference.md` Tier 2 + the widened Q-061.)
- **SUCCESS CRITERION:** swim output unchanged for the fins case; kick/drill sessions now get the pessimistic-direction flag; all via the shared core. Log D-entry. Update Q-061 (pessimistic half DONE; trend-substrate exclusion still open).
- Deploys: `analyze-swim-workout`.

### 5. COACH (week/state-scoped) — bring under the 7 universal rules, AFTER the four session-scoped legs
- **DISTINCT SHAPE — not a per-workout narrative.** The coach (`supabase/functions/coach/`, displayed on the State screen as `wsv.coach?.narrative`, behind "open for more") is a **fifth LLM narrative path** that reasons over the athlete's **week / state**, not a single workout. Its NUMBERS are already single-sourced (`fitness_direction = rollupFitnessDirection(state_trends_v1)` — the spine, `coach:2705`); its **PROSE is its own LLM path with its own prompt** (`COACH_PAYLOAD_VERSION`), NOT through the shared core. (State's own numbers + deterministic `synthesizeHeadline` are already covered by the spine — nothing to migrate there; it's only the coach PROSE.)
- **Needs a coach adapter built from the SPINE + WEEK context, not a fact packet:** `leadSignals` / `atypicalSignals` / `establishedCauses` derive from `state_trends_v1` + the week (per-discipline verdicts, load/ACWR, adherence, planned key sessions) — there is no single-workout fact packet here. The adapter is the only coach-aware code; the same shared scaffold + validators apply.
- **⚠ RULES 4 AND 5 ARE THE HIGHEST-RISK for the coach** — a week-level coach is exactly where over-claiming creeps in: single-session / short-window **fitness verdicts** (rule 5) and **diagnosing cause** of a week's pattern (rule 4). The `hasFitnessTrend` flag (D-188) matters most here — a coach fitness-direction claim must trace to the spine verdict, never a short/sparse window; and the coach must observe week patterns ("you've autoregulated 3 of 5 hard sessions") without diagnosing them ("you're overtrained").
- **Folds in its accumulated rules:** the coach has grown its own rule-set that OVERLAPS the universal set without sharing it — **D-154** (deterministic load headline; observation-never-prescription), **D-155** (describe-vs-change the plan; lexical "add" ban). The migration folds these into the shared core (they become the coach addendum + the shared rules), ending the per-path-in-a-vacuum pattern at the coach too.
- **SUCCESS CRITERION:** coach prose passes the shared validators; fitness-direction claims trace to the spine (`hasFitnessTrend`); no week-level cause-diagnosis; D-154/D-155 behavior preserved (no regression — same no-regression discipline as ride). Log a D-entry. Deploys: `coach`.
- **Sequenced LAST** — after run (D-187, done) / ride (D-188, done) / strength / swim. Do NOT start until the four session legs land.

---

## HARD GUARDRAILS (do not violate)

1. **Option 1, NOT Option 2 — do NOT unify prompt-assembly.** Ride and swim work today; forcing all four onto one prompt-assembly path risks regressing the two best cases for cosmetic "one file" unification. Run stays sectional, ride/strength/swim paragraph — that is NOT the problem; the missing shared validators/scaffold is. (Prompt-assembly unification, if it ever earns its keep, is a much later phase — not this one.)
2. **BOTH scaffold AND validators — not validators-only.** Swim's rule-1 win was STRUCTURAL construction (the cross-signal lead, D-179), i.e. the scaffold makes the model reason right up front. Validators catch violations after the fact; catch-after alone is insufficient. The core needs both halves.
3. **Single-source the LOGIC, not the file.** The win is NOT one monolith with four `if discipline ==` branches (four functions in a trench coat — still editable per-discipline in isolation). One shared scaffold + one shared validator suite, parameterized by thin adapters, that cannot be edited for one discipline without affecting the standard for all.
4. **Don't touch what's clean.** The D-185/D-186 number resolvers, the ride/swim working prose, packet *locations* — unchanged. The core changes *which rules + validators run*, not *how each prompt reads*.
5. **Verify each migration on REAL data, no regression, before the next.** One discipline at a time. Run's captured contradiction is the canonical before/after.

---

## CROSS-REFS
- `docs/SPEC-universal-narrative-inference.md` (the 7 rules + addenda — the standard)
- `docs/SPEC-honest-swim-inference.md` (swim addendum / reference implementation; Tier 2 equipment-direction + widened Q-061 = the kick/drill flag)
- `docs/AUDIT-continuity-2026-06-16.md` + D-185 (run resolver) + D-186 (Details consolidation) — legs #1/#2 of the continuity invariant; this is leg #3 (reasoning)
- Q-061 (equipment/drill exclusion, both directions) — its narrative pessimistic-half is completed in the swim migration; its trend-substrate exclusion remains separate/open
- ENGINE-STATE "Continuity / single-source invariant" Solid entry (records this work order + the strength e1RM shared-source note)
