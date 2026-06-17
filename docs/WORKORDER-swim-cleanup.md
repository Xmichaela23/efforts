# WORK ORDER — Swim Cleanup (integrity + rest-fraction features)

**Status:** SPECCED, NOT BUILT. **Do not start until the narrative-core consolidation has landed.** This is the remaining swim work after the D-159→D-184 arc. Items are dependency-ordered — Q-061 first (it's an integrity correctness requirement AND it gates D-181).

**Relates to:** SPEC-honest-swim-inference.md (the boundaries), SPEC-universal-narrative-inference.md (swim addendum). D-176/D-180/D-181 are filed-designed in DECISIONS-LOG; Q-061 in OPEN-QUESTIONS.

---

## ORDER OF WORK (dependency-driven)

### 1. Q-061 — Equipment/drill pace-contamination exclusion (INTEGRITY — do first)

The swim pace trend rides `compute-facts pace_per_100m`, which is the full blended pace including non-unaided-swimming sets. Per the boundaries doc (Tier 4), **raw pace trend is NOT a fitness claim until contaminated sets are flagged/excluded — it's a current silent lie.**

Contamination is **bidirectional** (not fins-only):
- Fins / pull buoy / paddles → pace reads artificially FAST (optimistic contamination)
- Kickboard / kick sets / drills → pace reads artificially SLOW (pessimistic contamination)
- Snorkel → ~neutral

The equipment data is captured per step (D-162, `swim_steps_equipment_confirmed`) and currently has zero readers in the trend path. Build:
- Flag/down-weight non-unaided-swimming sets in the pace substrate that feeds the trend (session-level confirmation is enough to flag; surgical per-step removal needs per-length data, which is a later ceiling).
- Both directions — a "faster" trend that's just more fin days AND a "slower" trend that's just more kick days are both lies.
- **Also completes the D-183 follow-up:** the shipped narrative flags only the fins/optimistic direction in prose; add the kick/drill pessimistic-direction flag. (NOTE: if the narrative-core swim migration already completed this kick/drill flag through the shared core, confirm and don't duplicate.)

**Why first:** it's a correctness requirement (the trend is dishonest until done) AND D-181's growth reward depends on a clean, fin-flagged pace substrate (otherwise the reward fires on contaminated pace).

### 2. D-176 — Rest-fraction as a card metric + trend

Rest fraction = non-moving / elapsed, via `resolveSwimScalars` (the single source from D-182). Surface it as a card metric (session readout) + a rest-fraction trend. Today it's narrative-only (D-179 put it in the lead); this makes it a first-class surfaced metric.

### 3. D-180 — Swim rest-fraction norm model

Compare each swim's rest fraction to an expected band keyed primarily on **session intention** (the plan has it), light proficiency modifier, very-light age modifier. Research-grounded bands (tune-later, sign-off-gated): technique/drill ~30–45%, endurance/aerobic ~10–20%, threshold ~20–35%, sprint ~30–50%, long-continuous ~0–10%. Read logic: in-band = unremarkable; below = quietly positive; above = noted gently, NEVER diagnosed (the can't-separate-rest/gear/wall/fatigue boundary). The honest successor to the killed "structured set format" hallucination. (Full design in DECISIONS-LOG D-180.)

### 4. D-181 — Swim growth-reward convergence detector (DEPENDS ON Q-061)

Recognition-only, never penalty. Fires a warm growth sentiment ONLY on convergence across comparable swims: rest fraction shrinking + pace held/improved + RPE held/lower (RPE required if present; else lean on rest-down + pace-held). The adult-onset "more swimming, less wall-hanging, felt easier" signal — valuable because there are no per-length splits. Conservative gates (N comparable sessions, sustained direction, classifyTrend-style; rare = trusted). Warm/earned tone; credits observation, never mechanism. **Hard dependency on Q-061** — must not fire on fin-inflated (or kick-deflated) pace. (Full design in DECISIONS-LOG D-181.)

---

## GUARDRAILS

- Every value single-sourced (`resolveSwimScalars` / the trend spine) — don't introduce new client recompute (continuity invariant, D-185/D-186).
- Honesty boundaries per SPEC-honest-swim-inference.md — observe don't diagnose, anchor to athlete, honest blanks.
- Verify each on real swim data before claiming done; deploys flagged; log per-item.
- Do NOT start until narrative-core has landed.
