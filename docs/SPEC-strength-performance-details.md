# SPEC — Strength Performance & Details Screens

**Status:** SPECCED — ready once RIR provenance (D-204) deploys + this spec is committed.
**Depends on:** SPEC-strength-intent.md (intent modes), D-189 (e1RM in packet), D-204 (RIR provenance — score + recalibration read provenance-confirmed signal only)
**Related:** SPEC-rest-timer-surface.md (separate concern — logger UX)
**Affects:** strength Performance tab, strength Details tab, strength analyzer (execution score + recalibration)

---

## The frame

Efforts is endurance-first, but strength is a co-equal discipline — not a side note. The reverse-hybrid athlete (lifts consistently, runs/rides a few times a week) is a first-class user. The strength screens must feel native to a lifter while doing the one thing no strength app can: connecting the lift to the rest of the training load.

Strength is also the one discipline where the athlete already knows how they did — they felt RIR 0 in their body. So these screens don't teach the lift back to them. They (1) score the execution, (2) explain what the athlete can't feel, and (3) give them lines to pull on the plan.

---

## Acceptance bar — the three principles (definition of done for the whole strength-screens thread)

These are pass/fail criteria, not aspirations. A deliverable that violates one is not done.

1. **Single source of truth.** NOT satisfied by the re-materialization resolver design alone — only when the two load-compute copies (`materialize-plan/calculateWeightFromConfig` + `shared/strength-system/protocols/triathlon_performance.ts`) collapse into one and generators emit `percent_1rm` + anchor instead of absolute lb. Until then any resolver is a fourth copy, not a consolidation. (Q-073.)
2. **Continuity infrastructure.** The recalibration / re-materialization resolver honors **D-021** (frozen plans, no silent rewrite) and **D-197** (derive-at-read-when-absent); the **pin policy** is how it stays frozen-plan-safe. This extends the continuity infra — it does not bolt a parallel mechanism alongside it.
3. **Honest analysis.** Execution score + recalibration read **provenance-confirmed** signal only (D-204). Auto-filled RIR is "no effort signal," never "on target"; null e1RM says nothing rather than fabricating (D-189). This falls under the narrative-core validator discipline (`noNewNumbers`, `noContradiction`).

---

## Tab split — three jobs, two surfaces

Mirror the endurance pattern exactly so the app stays coherent across disciplines.

### Performance = decide

Execution score + synopsis + where the plan gets adjusted.

- Execution score — how well you executed this session (see below)
- Synopsis — 1–2 sentence cross-discipline narrative (see narrative rule)
- Adjust lines — recalibration prompts; the pull-points (see recalibration model)
- NEXT preview + Adjust CTA

### Details = verify

The receipts. What happened, exactly.

- Set-by-set tables: Set / Weight / Reps / RIR + e1RM column (e1RM data already wired, D-189)
- Compare-to-Plan: Previous · Planned · Completed with deltas
- Volume totals
- PR badges on record sets
- No score, no narrative — pure record

**The test:** "How am I trending / should I adjust?" → Performance. "What exactly did I lift on set 3?" → Details. Today both tabs answer both, which is why they read as near-identical. Fix that.

---

## Execution score

User-selected format: label + 0–100 score with letter band.

```
Upper Hypertrophy · Mon Jun 15
   ┌──────────────────────────┐
   │   maintaining · holding   │   ← intent-aware verdict label
   │          B+  ·  87         │   ← letter + number
   └──────────────────────────┘
```

**CRITICAL: the score measures execution against INTENT, not progression.**

This is the load-bearing rule. A 0–100 score implies an absolute standard — but success is relative to intent (per SPEC-strength-intent.md). Doing maintenance correctly must score as high as PRing in a performance block. Otherwise the score becomes the exact penalty-for-maintaining trap we're building Efforts to avoid.

The score answers: "Did you execute the session this was meant to be?" — never "Did you get stronger?"

### Score components (intent-weighted)

| Component | What it measures | Notes |
|---|---|---|
| Load adherence | Completed weight vs planned | Hitting plan = full marks |
| RIR adherence | Did effort land in the target band? | Penalize BOTH directions — too hard and too easy. **Reads provenance-confirmed RIR only (D-204).** |
| Volume completion | Planned sets/reps actually done | Missed sets dock the score |

### How intent reshapes the score

- **PERFORMANCE:** hitting planned load at target RIR = high. Going to RIR 0 against planned RIR 3 caps the score — unsustainable effort isn't rewarded as "trying hard," it's flagged as miscalibrated.
- **MAINTENANCE:** hitting planned load at target RIR = high (A-range). Exceeding load is NOT rewarded (that's drifting out of maintenance). Flat e1RM does NOT lower the score.
- **SUPPORT:** completing the session at prescribed load = high. RIR undershoot is the only thing that docks it.

### Demotivation guard

A letter grade can feel punishing. Two rules:

- A correctly-executed maintenance session = A/B range, never a "C for not progressing." If the math produces a low grade for a well-executed maintenance session, the math is wrong.
- The grade is paired with the verdict label so it's never a bare letter — "maintaining · holding · B+" reads as success; a naked "B+" could read as mediocre.

---

## Recalibration model — the "lines to pull"

The baseline (e1RM) is a moving target. Athletes overestimate it, or miss weeks and it drops. The app already captures every input needed to detect drift — weight, reps, AND **provenance-confirmed** RIR (D-204) on every logged set — and can recompute e1RM from actual performance. It just needs to close the loop.

**Core rule: COMPUTE automatically, APPLY only on confirm.**

Nothing about the baseline or plan ever mutates silently. "Auto" describes the computation, never the application. Every recalibration is a suggestion the athlete confirms or dismisses.

```
   ┌────────────────────────────────────────┐
   │  Bench e1RM looks high                   │
   │  Last 2 sessions came in at RIR 0 vs a   │
   │  planned RIR 3. Plan assumes 150 lb —     │
   │  your lifts imply ~140 lb.                │
   │                                          │
   │  [ Lower to 140 ]  [ Keep 150 ]  [ Edit ]│
   └────────────────────────────────────────┘
```

The athlete sees the evidence (their own sets), the math (implied vs assumed e1RM), and decides. Dismiss is always valid.

### Smart scope defaults — follow the signal, not a fixed setting

| Signal | Default scope | Framing |
|---|---|---|
| One session off | This session only | "Rough day — drop today's load?" |
| Sustained drift (2–3 sessions, same direction) | Going forward | "This isn't a bad day — the baseline moved." |
| Return after a gap (missed weeks) | Going forward, stepped down | "You've been off 3 weeks — let's not grind the old number." |

The toggle is always present; the athlete always confirms. The app picks the sensible default, never the binding one.

### Detrain detection

When an athlete returns after missed weeks (common in a peak endurance block), the first session at the old prescription overshoots — RIR undershoot is the flag. Catch it, offer a stepped-down baseline. Don't let them grind a number that's no longer real.

### Score → adjust coupling

The execution score and the adjust lines are one system, not two sections. The flagged exercise IS the tappable adjust point. Top to bottom: score → reason → pull the line.

```
Bench Press        going too hard · RIR 0 vs 3
  → e1RM looks high. [ Lower to 140 ] [ Keep ] [ Edit ]
```

### Re-materialization — the open architectural question (Q-073)

A single-session weight nudge is cheap: it changes one logged value, nothing downstream cares. But the deeper adjustments — "going forward" recalibration and baseline changes — raise a question filed as **Q-073**: when a baseline moves, do future planned sessions need to be re-materialized off the new number?

The plan generates planned weights/reps/RIR from the baseline (e1RM). So if the athlete accepts "lower bench to 140," every already-materialized future bench session in the plan was built on the old 150.

**Recorded answer (Q-073):** NOT "lazy vs eager" — the insight is a **pin-policy parameter**. One shared lazy/on-read resolver where the caller declares the baseline source: recalibration → follow-current; season planning → can pin (block-start snapshot); goals materializer → per intent. Lineage: **D-021** (frozen plans, no silent rewrite) + **D-197** (swim `equipment_detail` derive-at-read — the existing lazy precedent for the analogous problem). (Do NOT cite D-185–D-192 — that is narrative continuity, the wrong lineage.)

**Prerequisite (the real blocker):** the two load-compute copies (`calculateWeightFromConfig` + `triathlon_performance.ts`, bridged by a pass-through) must collapse into one, and generators must emit `percent_1rm` + anchor instead of absolute lb. The resolver only pays off after that. Garmin export + non-`get-week` readers must also reach the resolver. What's confirmed today:

- Planned strength loads are computed **eagerly at generation+materialize time** into `planned_workouts.computed.steps` and frozen; `get-week` reads them as-is, never recomputes on read.
- A baseline change mid-block does NOT touch already-materialized sessions unless `materialize-plan` is re-invoked (only `adapt-plan` auto + the manual-override modal do today).
- Manual per-session overrides live in `plan_adjustments` and are re-applied on every materialize — `adjustment_factor`/`weight_offset` track a baseline change; `absolute_weight` pins by design.

Until Q-073 is settled, **ship the single-session adjust** (safe, no downstream effects) and treat baseline/"going forward" recalibration as **compute-and-confirm only** — store the intent to recalibrate, defer the re-materialization mechanics. Don't silently mutate future planned loads.

---

## Narrative rule — cross-discipline whisper only

Strength gets far less LLM copy than endurance, for a specific reason: the lifter felt the session. Recapping it adds nothing.

**The copy only earns its place by saying what the lifter CANNOT feel — never by recapping the lift.**

What they can't feel (valid narrative):

- Cross-discipline cause: "You've ridden 180 mi this week — this isn't a regression, it's fatigue."
- Recalibration logic: "Two sessions at RIR 0 means the baseline moved, not that you had one bad day."
- Race-timeline framing: "62 days out, holding strength is the right call."

What they CAN feel (kill it):

- "Bench drifted harder than prescribed" — they know, they were there.
- "You hit all sets at target" — they know.

Rules:

- Performance tab: 1–2 sentences max. Every sentence cross-disciplinary. This is the thing no strength app can write — it's the moat.
- Details tab: no narrative at all.
- e1RM never fabricated — comes from `exercise_log.estimated_1rm`; if null, say nothing (D-189). Same honesty bar applies to RIR-derived claims: auto-filled RIR is not a signal (D-204).

---

## What stays from today

- Compare-to-Plan view (Previous/Planned/Completed) — unchanged, lives on Details
- RIR "going too hard" flagging — now becomes the trigger for the adjust line (reads provenance-confirmed RIR, D-204)
- Arc temporal context in narrative — always present
- Auto-start rest timer (D-139 + rest-timer-surface spec) — separate concern

---

## Open questions

**Intent mode visibility — RESOLVED (design):** intent mode stays invisible. No strength app surfaces a per-session mode label; the best one (Fitbod) deliberately hides its readiness model behind plain-language outcomes. The verdict label ("maintaining · holding") IS the user-facing signal — the athlete infers the mode from the language. Do NOT show a "mode: maintenance" badge. (Was internal placeholder "Q-069"; collides with live Q-069, and it is resolved — recorded here as a settled decision, no live number needed.)

**Q-075 — Intent correctness.** Arc infers intent; should the athlete be able to correct it? Recommendation: yes, but as a quiet correction (not a prominent toggle) — Arc reads "maintenance" from race timeline, athlete can flip if they disagree. Never locked, never silent. Lower priority than the score + recalibration build. (Filed in OPEN-QUESTIONS as Q-075.)

**Q-074 — Letter band thresholds** (A = 90+, B = 80–89, etc.) — tune on real sessions once the score math exists. Verify a well-executed maintenance session lands A/B before shipping. (Filed in OPEN-QUESTIONS as Q-074.)

**Q-073 — re-materialization model** (architectural, blocks "going forward" recalibration): one lazy resolver with an explicit pin policy. See the Re-materialization section above. Single-session adjust ships independently of this; baseline/"going forward" recalibration is compute-and-confirm only until Q-073 is resolved. (Filed in OPEN-QUESTIONS as Q-073.)

---

## Implementation checklist

**Provenance prerequisite (D-204) — DONE, held for deploy:** `rir_autofilled` flag landed; readers (`compute-facts`, `analyze-strength-workout`) exclude auto-filled RIR. Deploy after on-device eyeball; the score + recalibration below are gated behind it.

Analyzer (server-side, first):

- [ ] Execution score function — intent-weighted, components: load / RIR / volume adherence (RIR component reads provenance-confirmed only)
- [ ] Verify maintenance-done-right scores A/B (demotivation guard)
- [ ] e1RM recalibration: compute implied e1RM from logged sets vs plan assumption
- [ ] Drift classification: one-off / sustained / post-gap → scope default
- [ ] Detrain detection on return-after-gap

Performance tab:

- [ ] Execution score block (verdict label + letter + number)
- [ ] 1–2 sentence cross-discipline synopsis (narrative rule enforced)
- [ ] Adjust lines coupled to flagged exercises (score → reason → pull)
- [ ] Recalibration prompt: evidence + math + confirm/dismiss, scope toggle
- [ ] Strip recap-style narrative

Details tab:

- [ ] Add e1RM column to set tables
- [ ] PR badges on record sets
- [ ] Keep Compare-to-Plan, volume totals
- [ ] Remove all narrative/score from this tab

Gating:

- [ ] Confirm: no baseline/plan mutation without explicit user confirm (the core rule)

Build order: **provenance (deploy after eyeball, D-204) → execution score → recalibration.** The re-materialization resolver / SSoT collapse (Q-073) is its own track, gated behind the two-copy merge.
