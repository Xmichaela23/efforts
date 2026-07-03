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
- **Status: BUILDING (ratified 2026-07-03, thresholds approved).** Reasoning exists coach-side (`crossDomainPairs` coach `:2347`, `loaded-legs.ts`) and reaches State's LEGS LOADED — being packaged as a shared per-session detector + threaded into the per-workout cards. Detailed design: **`docs/DESIGN-cross-domain-carryover.md`**. → "live" once it ships and passes Michael's eyeball.
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
