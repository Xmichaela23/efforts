# The Self-Awareness Map

**What this is.** The authoritative definition of "self-aware app" for Efforts — deliberately finite. A self-aware app is **a bounded, gated set of reasoning axes on one shared substrate**, not a vibe and not an open-ended aspiration. This doc is the parent map; each axis has (or will have) its own detailed design doc that descends from here. **Keep it current as axes land** — update an axis's status the same session it changes.

Read order: this map → the axis's design doc → the code. Cross-refs: `DECISIONS-LOG.md` (D-231/232/233), `OPEN-QUESTIONS.md` (Q-111/112/113/114), `docs/DESIGN-cross-domain-carryover.md`.

---

## The substrate + nervous system (BUILT — the four layers everything plugs into)

These are done. Every reasoning axis reads/writes through them; no axis re-implements them.

| Layer | What it is | Where |
|---|---|---|
| **1. Spine** | The single shared truth — per-discipline deterministic verdicts + evidence. The connective tissue itself. | `athlete_snapshot.state_trends_v1`, `_shared/state-trend/`, `compute-snapshot/`, `compute-facts/` |
| **2. Core** | The one reasoning + validation engine every narrative surface runs through (scaffold + validator suite, adapter-driven). | `_shared/narrative-core/` |
| **3. Grounding gates** | Honesty enforcement: rules 1–5 (per-session reasoning), 6/7 (no spine contradiction / no receipt recap), 8 (no plan → no target), 9 (name the movements), 10 (no invented phase); + arc source-gates (stale race/phase/`hasActiveTemporalPlan`, `planHasEnded`) — "relevance earned by live data, else null." | `narrative-core/validate.ts`, `arc-context.ts`, `arc-narrative-ai-appendix.ts`, `plan-week.ts` |
| **4. One-fact-two-surfaces** | Shared detection feeding multiple surfaces so they can't diverge — one detection, N surfaces. The pattern every axis uses to reach both a card and State. | `_shared/novel-movements.ts`, `narrative-core/spineVerdictFor` + `applyGroundingContext` |

**Principle:** the spine is the nervous system; the guardrails are reflexes (don't lie). The axes below are cognition (actively reason from the whole substrate). An axis is "self-aware" when a surface *reasons from* another part of the substrate, not merely fails to contradict it.

---

## The five reasoning axes (the punch list)

Each axis = a surface reasoning from a specific part of the substrate, with a specific honesty gate. Status: **built** / **partial** / **designed** / **next**.

### Axis 1 — discipline ↔ discipline (cross-domain carryover)
*A card reasons from another discipline's recent load: "Monday's lift is why Thursday's ride felt hard."* The hybrid app's signature axis.
- **Status: BUILT + WIRING-VERIFIED; only a real-data live positive remains to close.** The shared detector (`cross-domain-carryover.ts`) is deployed on all three per-workout cards with three signal paths, all gated: (1) **objective** — run cadence-primary (heat-immune) + decoupling supporting; bike power-at-HR decoupling; swim tightly-gated pace-vs-same-stroke (silence-default, courtesy-tier). (2) **RPE-vs-output two-way gauge** (D-233-adjacent) — perceived effort vs the athlete's own baseline for comparable intensity; below → suppress, above → trigger; baseline-quality gated. (3) **declared soreness** (Q-049, Hooper 1–7 per D-234/D-235) — the strongest leg-feel trigger, Z-score vs own baseline, with a **before-session provenance guard** (`resolveCarriedInSoreness`: only soreness carried IN counts; a session's own post-log can't self-trigger) and a **declared-vs-inferred split** (only a logged slider earns "you reported sore legs"; inferred paths stay LOAD language). Proven silent-correct on the June 14 run + yesterday's ride; **live pipeline proven end-to-end by the synthetic-user acceptance run** (`cross-domain-carryover.synthetic.test.ts`). Detailed design: **`docs/DESIGN-cross-domain-carryover.md`**.
  - **loaded-legs: RESOLVED to COEXIST** (Michael's ruling). Cards use the per-session detector; State keeps its weekly-aggregate LEGS LOADED. Kept "one fact" by hardening the shared primitive — the coach's `strengthFocusFromWorkout` now derives from the same `classifyStrengthFocus` the cards use (coach v60), so they can't diverge on the movement/attribution.
  - **What's left to close (NOT code — data-gated):** a live carryover *positive* on Michael's real data. Nothing has fired live yet because both declared baselines are empty (0 comparable RPE rides, no soreness history until the popup lands) and no objectively-fatigued session has occurred. Needs weeks of soreness logging (≥5 to seed the baseline) OR a genuinely fatigued session, then Michael's eyeball.
- **Honesty gate:** the evidence gate — antecedent load exists AND target effort genuinely elevated vs the athlete's own baseline AND not better explained by terrain/heat/prescription AND not systemic (§9 cross-discipline). Any failure or missing data → **say nothing**.

### Axis 2 — session ↔ trajectory
*A session reasons from the multi-week trend, not just adjacent sessions: "this fits your improving arc" / "third slow one in two weeks."*
- **Status: partial.** Cards can't contradict the trajectory and can describe the spine verdict (rules 6/7, spine verdicts threaded into all disciplines). But *active* trajectory reasoning (a session interpreting itself against the trend) is thin. Mixed-clocks scope-labeling (Q-111 §5) is still owed.
- **Honesty gate:** rules 6/7 (no contradiction / no recap) + rule 5 (direction/fitness claims must trace to a trend) + mixed-clocks (every verdict declares its time-scope; never fuse a this-week and a 6-week clock).

### Axis 3 — session ↔ plan-position
*A session reasons from where it sits in the plan: "bench down ~10% over the marathon block — expected; rebuild is Week 2."*
- **Status: partial (grounding built, tone designed).** The grounding holds — no false "week N" (`planHasStarted`/`planActiveNow`), no invented phase (rule 10 + `activePlanCoversFocus`), no target without a plan (rule 8). The *active* reasoning — plan/history-aware tone (expected-and-addressed vs alarm) — is **designed, not built** (Q-111 §1).
- **Honesty gate:** rule 8 (no plan → no target/adherence), rule 10 (no invented phase), `planActiveNow` (started AND not ended); every phase/week claim grounded in the current plan window.

### Axis 4 — inferred ↔ declared
*Reason from what the athlete SAID (soreness, RPE, feeling) over what's inferred — typed beats learned.*
- **Status: partial (soreness + RPE built).** Q-049 soreness reaches the coach (LEGS SORE only when declared); RPE glass-box + D-231 typed-beats-learned. Other declared inputs (free-text feeling/notes) are not yet reasoned from.
- **Honesty gate:** D-231 (typed wins when fresher than learned; never silently override); load-not-state language unless the athlete declared the state (say "legs loaded" not "legs sore" unless they reported soreness).

### Axis 5 — load ↔ readiness ↔ plan
*Load + readiness feed plan adaptation — the state changes the plan, and the change is explained.*
- **Status: partial (mechanism built, narration thin).** `adapt-plan` auto-progression, readiness gates, `block_adaptation_cache` — the plan adapts from state. The *narration* of the adaptation (why the plan changed, grounded) runs through the core but is under-developed.
- **Honesty gate:** the adaptation traces to real load/readiness data; any narrative explaining it passes the core (rules 6/7/8/10). No adaptation asserted that the data doesn't support.

---

## How to read the punch list

- **built** = the surface actively reasons from that substrate slice, gated, in production.
- **partial** = grounding/mechanism exists; active reasoning is incomplete (named gap).
- **designed** = a ratified design doc exists; no code yet.
- **next** = the immediately queued build.

"Self-aware app" is done when all five axes are **built** and gated. That's the finish line — a finite set, on one substrate, each honest by construction. New axes get added here only with a design doc and a stated honesty gate; nothing joins the map as a vibe.

---

## Changelog (axis status transitions)
- **2026-07-03** — Map created. Nervous-system layers 1–4 marked built (spine + grounding convergence completed this session). Axis 1 marked designed→next (`DESIGN-cross-domain-carryover.md`). Axes 2–5 marked partial with named gaps.
- **2026-07-03** — Axis 1 ratified (thresholds approved; novelty weights confidence not duration) → status **building**; detector fixtures-first.
- **2026-07-03** — Axis 1 LIVE on run/bike/swim cards (detector + discipline-correct signals); loaded-legs migration BLOCKED on a granularity premise (week-aggregate vs per-session) — surfaced to Michael. Cross-surface eyeball pending.
- **2026-07-03** — Axis 1 declared axis extended: RPE-vs-output two-way gauge + declared soreness (Q-049) as first-class triggers with a before-session provenance guard (D-234/D-235). Soreness standardized to Hooper 1–7 (energy too; sleep stays hours). **NEEDS VERIFICATION (⚠️ not closed):** gated on (1) the atomic ship — apply migration `20260703120000` + merge branch `soreness-hooper-client`; then (2) a morning-ride acceptance run — log soreness post-ride, confirm the *next* session fires "you reported sore legs…" and a clean session stays silent. **No live carryover positive has fired yet** — every real recompute so far is correctly silent (0 RPE baseline, no soreness data). The bar to "Axis 1 closed" is now: atomic ship → morning-ride verify → first live positive.
- **2026-07-03** — Coexist HARDENED: coach strengthFocusFromWorkout migrated onto shared classifyStrengthFocus (one fact; coach v60). VERIFIED swim first-class in load/readiness: full-weight in workloadTotal + general ACWR; contributes to the strain RPE signal via avg_session_rpe_7d (all-discipline); correctly absent from the HR-drift strain signal (in-water HR unreliable — honest, not a discount). Swim first-class-in-readiness status CLOSED. Cross-surface eyeball (yesterday's ride recompute) is the last gate before Axis 1 fully closes.
- **2026-07-03** — Axis 1 detector + narration + focus classifier built (19 fixtures). RUN CARD wired (first surface, greenfield): RPE signal, confound → suppress, ≤3d antecedent, shared clause appended. Deployed, awaiting Michael's eyeball on a real run (carryover-flagged vs hilly-silent) before → live. Bike/swim next, then loaded-legs migration.
- **2026-07-03** — SYNTHETIC-USER acceptance run PASSED (`cross-domain-carryover.synthetic.test.ts`): the LIVE pipeline (analyzer extraction → resolveCarriedInSoreness provenance guard → detector → clause) proven end-to-end to emit "You reported sore legs after Monday's lower-body session — keeping this ride easy was the right call…" for a sore-lift→easy-ride athlete, silent for a normal-soreness one, and un-self-triggerable. **Axis 1 build + wiring now VERIFIED; only a live positive on Michael's REAL data (data-gated, needs weeks of logging or a genuinely fatigued session) remains to close.**
- **2026-07-03 (session close)** — Docs reconciled for handoff. Axis 1: BUILT + wiring-verified (synthetic acceptance run), coexist ruled, only a real-data live positive pending (data-gated). Atomic ship done (migration applied + client deployed). **NEXT reasoning work for a fresh session: Q-111** (Axis 3 plan-history-aware tone — designed not built; + Axis 2 mixed-clocks §5) **and Step 6** (ACWR single-authority + `buildBodyResponse` **reclassified as fact layer** — NOT retired into narrative-core; the trace showed it's a deterministic fact producer, narrative-core is prose-only. See D-236, task #6). Read this map → `DESIGN-cross-domain-carryover.md` → `DECISIONS-LOG.md` D-234/D-235/D-236.
- **2026-07-03** — Step 6 Part B LANDED: `_shared/acwr.ts` single ACWR authority (5 design points, `acwr-state.ts` sole classifier). Canonical load source ruled = `workouts.workload_actual` (deferential-mirror argument). Formula A (calendar-decoupled) RETIRED — compute-snapshot now coupled-rolling, persisted == live; ramps/post-taper read lower (acceptance readout `acwr_convergence` pending Michael's eyeball). Repointed: coach D/E onto weight hook (byte-identical, fixtures), fact-packet B (status reconciled 1.15→1.3, divergence (v)); coach C left as reference, generate-training-context G a deliberate variable-window keep (iv). 20 fixtures green. **Part A CLOSED** (option 3): full physical relocation DECLINED per no-churn; fatigue weights extracted to `_shared/fatigue-weights.ts`, golden-fixture safety net on every body-response string. reclassification lives in docs, not a file move.
- **2026-07-03 — STEP 6 COMPLETE.** Part C shipped: `crossTrainingStressReceipt` suppresses the glance-tier "Cross-training" row when RPE is the sole distinct signal (was double-counted via bodyConcerned) — "How hard it feels" keeps the delta, LEGS LOADED "why" keeps its receipt (D-232, glance-tier dedup only). All three parts (B ACWR single-authority, A fact-layer reclassification + fatigue-weights extraction, C RPE dedup) shipped + deployed; ACWR acceptance-verified on real data (1.10 coupled). 44 fixtures green. Only Q-116 (EWMA option) remains, deferred. See D-236.
