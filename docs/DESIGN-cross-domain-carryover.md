# Design — Cross-domain carryover (the first reasoning axis across the spine)

**Status:** design — detection logic + exact strings for review BEFORE any code (same gate as Q-111). Conforms to D-233 (voice standard) and the grounding rules (6/7/8/9/10). No code until ratified.

## 0. Where this fits — the self-aware app

**Parent artifact: `docs/SELF-AWARENESS-MAP.md`** — this is the detailed design for **Axis 1 (discipline ↔ discipline)**. The spine (`state_trends_v1` / `athlete_snapshot`) is the connective tissue; the guardrails stopped every surface from contradicting it. This is the first surface that **actively reasons across it**: a card citing *another discipline's* recent load ("your legs may still be carrying Monday's lift"). It's one axis of a self-aware app — the discipline↔discipline one, the hybrid app's signature — and it plugs into the same substrate every future axis (trajectory, plan-position, declared-state) will. We design it first because it's the hardest: the risk is entirely **attribution**, not plumbing.

The reasoning already exists and is grounded — `crossDomainPairs` (coach `:2347`) pairs a strength session with the next endurance session ≤2d out and measures execution vs baseline; `loaded-legs.ts` narrates it. But it lives **only in the coach/State screen**. This build packages it as a per-session detector and threads it into the per-workout cards (the `novel-movements` one-detection-two-surfaces pattern), so the Thursday ride *card* reasons from Monday too.

---

## 1. THE EVIDENCE GATE (the whole risk)

**The failure we are designing against:** a card confidently blaming Monday's lift for a Thursday ride that was actually slow because of hills, heat, or bad sleep. Carryover is claimable **only when it is a real, evidenced signal** — never "a lift happened to precede a ride." This is the Q-111 §9 confound discipline applied across disciplines.

**Carryover is claimable only when ALL FOUR hold. Any failure → say nothing.**

**Gate 1 — Antecedent load exists (the "Monday lift").**
A cross-domain session in the carryover window (§2) before the target, with *meaningful, relevant* load: lower-body/full strength before a run/ride; upper/full strength before a swim (§3). Trivial load (a light mobility session) doesn't qualify. Data: recent-training-log read (available — same shape as novel-movements' 56d query) + `strengthFocusFromWorkout` + workload.

**Gate 2 — Elevation is real (the target session WAS harder than usual).**
The target session's effort signal is elevated vs the athlete's **own baseline for that discipline** (from the spine / discipline history) by a **meaningful margin, not noise**. The signal, in priority order of what's available:
- **RPE** (if the athlete logged it): session RPE ≥ baseline + ~1.0 (matches the glass-box RPE "a bit harder" threshold). Athlete-declared → strongest (D-231 typed-beats-learned).
- **HR-at-pace / HR-at-power drift** (endurance): elevated vs the discipline's efficiency baseline (the same signal `state_trends_v1` efficiency uses).
- **Execution vs baseline** (`crossDomainPairs` already computes `next_endurance_execution` vs `baseline_execution`).
No signal available, or elevation within noise → **Gate 2 fails → say nothing.** ("The lift happened but the ride wasn't actually hard" is not carryover.)

**Gate 3 — Not better explained by the session's own conditions (confound exclusion).**
The elevation must not be cleanly attributable to the target session's OWN conditions. The analyzers already compute these — reuse them:
- **Terrain** — significant positive grade (the run/ride's grade-adjusted vs raw pace gap the card already surfaces). If terrain explains the slower pace, terrain wins.
- **Heat** — elevated temp (the card already has °F). If it was hot, heat explains HR/effort.
- **Harder prescription** — a genuinely harder planned session (intervals vs easy). If prescribed hard, "hard" isn't carryover.
If any condition **materially explains** the elevation → carryover is not the cleanest attribution → **don't claim it** (the card's existing terrain/heat call already tells the honest story).

**Gate 2+3 as ONE rigorous procedure — "confound-adjusted residual" (removes the judgment call).**
Do NOT ask "is it elevated?" and then, separately, "does terrain explain it?" — that arbitration ("materially explains") is a fuzzy seam. Instead, a strict sequence:
1. **Adjust the effort signal for the session's OWN conditions first.** The analyzers already produce these: grade-adjusted pace (the run/ride's terrain correction the card already shows), a heat correction on HR-at-pace, and the prescribed-difficulty frame. Compute the effort signal *net of* terrain + heat + prescription.
2. **Test the RESIDUAL against baseline.** Carryover is claimable only if, *after* removing the session's own conditions, the effort is STILL elevated vs the athlete's own discipline baseline by the threshold below.
3. **If the adjusted signal sits at baseline, the conditions fully explained it → silence.** No arbitration, no "which is bigger" — the confound is subtracted, and only genuine residual elevation survives.

This makes Gate 3 mechanical: terrain/heat/prescription don't "compete" with carryover — they're *removed first*, and carryover must clear the bar on what's left. It's the §9 confound discipline as arithmetic, not judgment.

**Thresholds (proposed — the numbers to ratify):**
- **RPE** (declared, strongest): residual RPE ≥ baseline + **1.0** (the glass-box "a bit harder" bucket).
- **HR-at-pace / HR-at-power** (endurance): residual drift ≥ **the discipline's own efficiency-trend noise band** (reuse the `state_trends_v1` efficiency gate's sensitivity — don't invent a new one).
- **Execution**: residual `next_endurance_execution` below `baseline_execution` by ≥ the margin `crossDomainPairs` already uses (reconcile to its existing constant, don't add a second).
- **Baseline source**: the athlete's own per-discipline baseline from the spine/history — the SAME baseline the discipline's trend uses (one baseline, not a carryover-specific one). Single source, per the whole architecture.

**Gate 4 — Concentration, not systemic (Q-111 §9, cross-discipline).**
If effort is elevated in the leg-driven session but ALSO elevated across non-leg-dependent efforts (a systemic picture — sleep/illness/overreach), it's not *specifically* the leg carryover → route to systemic / say nothing, not "Monday's legs." (Only fires when a non-leg baseline is available; else fall back — the §9 graceful degradation.)

**Data-availability honesty:** for each gate, if the data isn't there (no logged RPE and no HR-at-pace baseline, no terrain/temp), the gate **cannot be cleanly satisfied → the honest default is silence, not speculation.** A card that can't prove carryover says nothing about it.

**Fixtures (the gate is the artifact that must be bulletproof):**
- lift + genuinely elevated RPE + flat/cool/easy conditions → **claim** (the true positive)
- lift + raw pace elevated but **grade-adjusted pace AT baseline** → **silent** (terrain subtracted, no residual — Gate 3 procedure)
- **DISCRIMINATOR:** lift + hilly day AND **grade-adjusted pace STILL elevated** → **claim** (residual survives the confound subtraction — carryover isn't suppressed just because it was hilly)
- lift + raw HR elevated but **heat-adjusted HR at baseline** → **silent** (heat subtracted)
- lift + **RPE at baseline** → **silent** (no elevation, Gate 2)
- lift + elevation **everywhere incl. swim** → **silent/systemic** (Gate 4)
- **no lift** in window → **silent** (Gate 1)
- lift + elevation + **no baseline/RPE/adjustment available** → **silent** (data-availability default)

---

## 2. Carryover window (reconcile — mostly settled)

`crossDomainPairs` uses ≤2d, `loaded-legs` ≤4d. Physiology (DOMS + neuromuscular): peaks 24–48h, repeated-bout tail to ~72h, largely gone by 96h. **Settle on ≤3 days (72h)**, superseding both, with claim strength decaying — strong ≤2d, weaker at 3d, none >3d. One grounded window for both the detector and the narration. (Novelty amplifies it — a *novel* lower-body movement, per Q-111 §2, carries longer/harder; the detector can weight novel antecedents, but the window stays ≤3d.)

---

## 3. Directionality & pairs (reconcile — mostly settled)

- **lower / full strength → run, ride** (leg-driven) — the proven, high-signal case (`crossDomainPairs` today).
- **upper / full strength → swim** (and upper-driven efforts) — Q-111 §6 generalization; same detector, `strengthFocus==='upper'`.
- **full-body → both.**
- **DEFER: endurance → strength.** A hard ride before a lift does cause fatigue, but strength here is RIR-regulated (the athlete auto-adjusts load), so the signal is weak and self-correcting. Out of scope for v1; revisit if a real signal appears. Keeping v1 to strength→endurance + upper→swim keeps the attribution tractable.

---

## 4. Honesty framing (reconcile — settled by D-233 / loaded-legs)

Reuse the `loaded-legs` voice, unchanged:
- **Possibility, never cause:** "may still be carrying," never "is why."
- **Load language, not state:** "Monday's lower-body work," never "your legs are shot" (unless the athlete *declared* soreness → then it's their truth, D-231).
- **Cite the evidence:** name the antecedent (day + focus) AND the elevation (RPE vs usual) — both are logged facts.
- **One clause, hedged, no prescription.**

---

## 5. The per-session detector (shape, not code)

A pure, fixturable module — `cross-domain-carryover.ts` — mirroring `novel-movements.ts` (one detection, two surfaces: the card AND State's LEGS LOADED read the same result, so they never diverge).

```
detectCrossDomainCarryover({
  target: { date, discipline, sessionRpe, hrAtPaceDelta, execution, grade, tempF, prescribedHard },
  baseline: { rpe, hrAtPace, execution },        // athlete's own, per discipline (spine/history)
  recentSessions: [{ date, type, strengthFocus, workload, isNovel }],  // ≤3d window
  nonLegBaselineElevated?: boolean,               // Gate 4 (optional)
}) : {
  antecedent: { date, dayName, focus, isNovel } | null,
  claimable: boolean,          // ALL four gates pass
  suppressedBy: 'no_antecedent'|'no_elevation'|'terrain'|'heat'|'prescribed'|'systemic'|'no_data' | null,
} | null
```

`claimable:false` with a `suppressedBy` reason (logged, like the narrative-guard rejections — so we can see how often each confound fires and tune). The card + State both consume this; the narrator only speaks when `claimable`.

---

## 6. Exact card strings

**Claimable (endurance card, carryover confirmed):**
`Your legs may still be carrying Monday's lower-body session — this ride's effort ran a bit above your usual (RPE 7 vs ~5.5).`

**Claimable (novel antecedent — stronger, per §2):**
`Monday's session had your first heavy single-leg work in a while, and this run's effort sat above your usual — the legs may still be paying it off.`

**Claimable (swim, upper carryover — §3):**
`Tuesday's pressing work may be in your arms here — the pull felt a touch harder than your usual.`

**Not claimable → SAY NOTHING about carryover.** The card's existing honest read stands:
- terrain/heat suppressed → the card's existing "the rolling grade assisted your pace / warm day" line is the true story.
- no elevation → the card says the session was normal; no carryover clause.
- no data → silence.

State screen: LEGS LOADED already renders when claimable (same fact) — unchanged, now sharing the detector.

---

## 7. Build order (once ratified)
1. `cross-domain-carryover.ts` — the detector + the four-gate logic. Fixtures FIRST (§1's seven cases are the acceptance set).
2. Thread the recent-training-log read + baseline into the endurance analyzers (run/ride), then swim — same wiring as novel-movements + spine verdicts.
3. Narrate via the shared clause; State's LEGS LOADED reads the same detector (retire the coach-local duplication into the shared module).
4. Fixtures per surface; Michael's eyeball is acceptance; silence-on-uncertain is the default everywhere.

**The one line that governs the whole build:** when the gate is not cleanly satisfied, the card says nothing. A missing carryover note is honest; a fabricated one blames Monday for the weather.
