# Q-111 — Plan/history-aware, session-attributed verdicts (design proposal)

**Status:** design — strings + detection logic for review BEFORE any code (per the standing gate). Conforms to the Efforts voice standard (D-233): load-not-state language, cite the athlete's own logged data, name the fact, no redundancy, conditional physiology never prescription. Every verdict is a validated descendant of the spine (Q-112 core).

This is one round covering every logged input. Each section: **problem → deterministic inputs → detection → strings → fixtures**. No code until ratified.

---

## 0. The organizing principle

All of this is one idea: **a verdict must know (a) what the plan is trying to do, (b) what the athlete has actually done, and (c) which specific evidence produced the number — before it chooses a tone or a claim.** Today the readiness/execution/strength verdicts fire on a single signal with no plan/history/attribution context. This round gives them that context, deterministically, and makes the session INSIGHTS and the State screen descend from the *same* facts (one detection, two surfaces).

---

## 1. Plan/history-aware verdict tone

**Problem.** A strength decline during/after an endurance-dominant block, when an active rebuild plan exists, reads as alarm ("back off") instead of expected-and-addressed.

**Deterministic inputs (all present):** `planConfig` (plan name, `phase_by_week`, `week_intent_by_week`, `planStarted`, `planWeek1StartIso`); logged training history (an endurance-dominant block = ≥N weeks where endurance load ≫ strength load, from `workout_facts`/`session_load`); the Race record (a completed marathon in the last ~8–12 wk).

**Detection.**
- `enduranceBlockRecentlyEnded` = a completed endurance goal (Race record) within ~8 wk **OR** a trailing block where endurance load share ≥ ~70%.
- `activeRebuild` = `planStarted` (or starts ≤7d) AND the plan is strength-primary ("Get Stronger" / strength_protocol present).
- If a strength decline verdict fires AND (`enduranceBlockRecentlyEnded` AND `activeRebuild`) → **expected-and-addressed** tone. Else → the existing verdict (alarm reserved for **unaddressed** declines).

**Strings.**
- Expected-and-addressed: `Bench down ~10% over the marathon block — expected. Rebuild started, Week N of 12.`
- Unaddressed decline (no rebuild plan): the current back-off verdict stands.

**Fixtures.** decline + endurance-block + active-rebuild → expected string · decline + no rebuild → alarm unchanged · no decline → unchanged.

---

## 2. Novelty in the fact-packet (one detection, two surfaces)

**Problem (from the Monday INSIGHTS eyeball).** The per-workout narrator attributed an RPE-9-vs-RIR-2/3 gap to generic *"accumulated fatigue plausibly drove perceived effort higher."* The real evidence: **first Bulgarian split squats and reverse lunges in months — ~180 reps of novel single-leg eccentric volume.** The narrator didn't have the novelty fact.

**Deterministic inputs.** `exercise_log` history over ~6–8 wk (needs the history read — the coach has 28d today; this round adds the longer read, which also unblocks the State-screen novel case deferred earlier). Per movement: present-in-session vs absent-from-history.

**Detection (the shared fact).** Compute `novel_movements` = movements in the session absent from the trailing ~6–8 wk history, with rep/volume context (e.g. `[{name:'Bulgarian split squat', reps:52, pattern:'single-leg eccentric'}, {name:'reverse lunge', reps:78}]`). **This one fact is carried in the fact-packet AND consumed by the State-screen loaded-legs detection — one detection, two surfaces** (the cross-layer requirement). The `loaded-legs.ts` module already accepts `isNovel`/`movement`; this supplies them.

**Strings.**
- Session INSIGHTS (hedge discipline unchanged — "consistent with", "likely"): `The RPE 9 against RIR 2–3 is consistent with the novel single-leg eccentric volume — first Bulgarian split squats and reverse lunges in months (~180 reps) — more than accumulated fatigue.`
- State screen (already designed): `Why: Monday's lower-body work — first Bulgarian split squats in months, RPE 9 — efforts since feeling harder (5.3 vs 4.4) · load balanced, nothing systemic`

**Fixtures.** novel movement present → `novel_movements` fact populated + attribution string · movement in history → no novelty claim (generic honest) · both surfaces read the same fact (assert identical `novel_movements` drives INSIGHTS + LEGS LOADED).

---

## 3. Execution scoring honesty

**Problem (same screen).** `EXECUTION 40% · Needs adjustment` on a **fully unplanned** session — there's no plan to grade against, yet it scores you 40% (a score-that-lies; Q-107 residue folds here).

**Deterministic inputs.** Per-set `planned` vs `completed` (already on screen — Back Squat had planned sets; Bulgarians/lunges/thrusters had none); `planned_id`/link status.

**Detection + behavior.**
- **Fully unplanned** (no planned sets) → **no score.** Label: `Unplanned session — nothing to grade against.` (or omit the EXECUTION block entirely).
- **Fully planned** → unchanged.
- **Mixed** (some exercises planned, some not) → score **only the planned portion, denominator stated**: `Execution 90% (planned portion — Back Squat only; 3 lifts were unplanned).` — or defer with the gate in place.

**Fixtures.** fully planned → unchanged score · fully unplanned → gated (no number, honest label) · mixed → scoped score with denominator stated.

---

## 4. H3 — two contradicting STRENGTH rows

**Problem.** The State screen shows a spine strength row (`state_trends_v1` = "needs data · N unplanned") **and** a coach per-lift row ("Working ~125 vs 150…") — opposite confidence, same screen.

**Design.** One source. The per-lift verdict (coach) and the discipline trend (spine) answer different questions (per-lift capacity/action vs discipline-level trend), so **compose, don't duplicate**: the discipline row states the trend honestly (`needs data — 2 unplanned sessions`), and the per-lift detail lives **under** it (not as a competing top-line). No two verdicts claiming different confidence at the same altitude. If the spine says needs-data, the per-lift row is framed as "from your logged sets" (provisional), not an authoritative verdict.

**Fixtures.** needs-data spine + confident per-lift → composed (trend row honest, per-lift nested as provisional) · both confident → agree · assert no two top-line verdicts disagree.

---

## 5. Mixed-clocks headline

**Problem.** The headline concatenates a **this-week** verdict (RPE/FATIGUED) with **6-week** trend verdicts (fitness climbing) as one undifferentiated sentence.

**Design.** Every verdict **declares its time-scope.** The headline separates the clocks: this-week readiness on one clock, multi-week fitness on another — never fused into one claim. E.g. `This week: legs loaded. Over 6 weeks: fitness climbing.` (exact copy TBD in review). The loaded-legs Why already scopes ("efforts SINCE Monday"); the fitness trend already has "over 6wk" in the receipt — the headline must inherit both scopes, not drop them.

**Fixtures.** this-week + 6-week verdicts → two scoped clauses, never one fused sentence · single-clock case → unchanged.

---

## 6. Upper-body attribution generalization

**Problem.** A heavy upper-body session (bench/press) loading arms/shoulders → swim/upper efforts feel harder currently falls to `EFFORT UP` (only legs are modeled).

**Design.** Generalize `loaded-legs.ts` → `loaded-muscle.ts` with a **body region** (`lower`|`upper`|`full`). Detection mirrors legs: recent upper session (`strengthFocus==='upper'` or 'full') + high RPE + subsequent **swim/upper** effort elevation → `UPPER LOADED`. Label + Why parameterized by region ("Monday's upper-body work → swims feeling harder"). Legs stay the common case; upper is the same shape.

**Fixtures.** upper session + swim effort up → UPPER LOADED · lower → LEGS LOADED · full-body loading both → region by which endurance efforts rose (see §9).

---

## 7. Threshold tuning

**Problems.** (a) The loaded-legs Why hardcodes "feeling harder" and trusts the caller's `rpe.trend==='declining'` gate without re-checking magnitude — a mild Δ (~0.3) can overstate. (b) The novelty window (~6–8 wk) and the "persist-until-RPE-renormalizes" question.

**Design.**
- **Magnitude re-check:** the Why asserts "feeling harder" only when |Δ| ≥ the RPE glass-box threshold (≥0.5, matching the "a bit harder" bucket); below that → "about as hard as usual" / no loaded claim (routes to EFFORT UP or nothing).
- **Novelty window:** ~6–8 wk absence = "in months"; ≤6 wk = weaker/"first this block" or omit.
- **Persistence:** LEGS LOADED persists while the endurance RPEs remain elevated vs baseline (not a fixed N-day window) — it clears when RPE renormalizes. Detection re-evaluates each coach run.

**Fixtures.** Δ 0.3 → no "harder" claim · Δ 0.6 → "a bit harder" · movement absent 7wk → "in months" · absent 4wk → weaker/omit · RPE renormalized → LEGS LOADED clears.

---

## 8. Strain double-count

**Problem.** `stressSignals` (`coach:5056`) counts `bodyConcerned` (`signals_concerning>0`) alongside the specific signals — but `bodyConcerned` overlaps them, so ONE declining signal hits `≥2` and fires "strain across disciplines."

**Design.** "Across disciplines" requires **≥2 genuinely independent** signals. Fix the gate: count DISTINCT specific signals (`rpeRising`/`driftWorsening`/`strengthFading`/`rirDropping`), exclude `bodyConcerned` from the tally. (The display was already made honest in the 2026-07-03 work; this fixes the detection.)

**Fixtures.** RPE only → NOT "across disciplines" (single signal) · RPE + drift → "across disciplines" (two independent) · bodyConcerned no longer inflates the count.

---

## 9. Leg-dependency discrimination

**Problem.** LEGS LOADED attributes elevated endurance RPE to the leg session — but if RPE is elevated **everywhere** (all disciplines, including non-leg-dependent), that's systemic, not leg-specific.

**Design.** LEGS LOADED requires the elevated RPEs to be **concentrated in leg-dependent sessions** (runs, rides — leg-driven) vs a non-leg baseline where available. If elevation is uniform across leg-dependent AND non-leg-dependent efforts → route to systemic (`FATIGUED` if ≥2 signals) or `EFFORT UP`, not LEGS LOADED. (This also sharpens the confound acknowledgment: uniform elevation suggests a systemic confound — sleep/illness — not the lift.)

**Fixtures.** RPE up in runs/rides only → LEGS LOADED · RPE up uniformly incl. non-leg efforts → systemic/EFFORT UP, not LEGS LOADED.

---

## 10. Q-112 continuity fold (INSIGHTS grounding) + residue

- **INSIGHTS rules 6/7 (Q-112):** the per-workout fact-packet adapter populates `disciplineVerdicts` from `state_trends_v1` (the same spine read this round adds for novelty), so the INSIGHTS narrative can't contradict the spine or recap a receipt. Same plumbing as §2 — one spine-into-fact-packet wire, both payoffs.
- **Validator dedup (Q-112 table):** fold fact-packet's `NoNewNumbers`/filler/length/`NoRpeWithoutReport`/`NoAthleteContradiction` into the core; retire the cycling numeric dup + the `_unused_` dead; register discipline extensions (zone-time, pace-delta, terrain-drift, jargon, Arc-lede); conditional-retire `NoHrWithoutData` vs core R3 (shared fixture set).
- **Q-107 residue:** execution-on-unplanned (§3) is the main one; any other score-lies get their own pass after this round.

---

## Build order (once ratified)

1. The ~6–8 wk history read + `novel_movements` fact (§2) — unblocks §6-cross-layer, §7-novelty, and the deferred State novel case.
2. `disciplineVerdicts` into the fact-packet adapters (§10) — INSIGHTS grounding + the spine read is shared with #1.
3. `loaded-legs` → `loaded-muscle` + leg-dependency + magnitude re-check + strain gate (§6/7/8/9).
4. Plan/history tone (§1) + H3 composition (§4) + mixed-clocks (§5).
5. Execution-scoring gate (§3).
6. Validator dedup/folds (§10).

Each step: fixtures first, voice-standard conformance, deploy, Michael's eyeball is acceptance, fix forward.
