# The Efforts Constitution — the finite system

**What this is.** The small, finite set of laws that make Efforts *a system* rather than a pile of features that each work. Not new invention — a **consolidation** of invariants already earned across `CANON-arc-inference-model.md`, `SELF-AWARENESS-MAP.md`, `SPEC-universal-narrative-inference.md`, and the `DECISIONS-LOG.md`, pulled into one authoritative page so there is a single yardstick.

**Why it exists.** Efforts' product *is* coherent reasoning about an athlete — so the system and the value are the same object. A reasoning app that contradicts itself across screens has no product. These laws are what "coherent" means, made checkable.

**Scope — deliberately not totalitarian.** These laws govern the **reasoning / verdict layer**: anything the app *claims* about the athlete (fitness, capacity, fatigue, readiness, load, adherence) and the narrative that renders it. They do **not** govern raw data plumbing — rendering a stored value, a `get-week` calendar read, a direct table read that re-derives no verdict is fine (CLAUDE.md already treats "smart server" as a *calendar* invariant, not a universal rule). Even a strong central government doesn't run every farm.

**Meta-rules.**
- **Finite.** This list is short on purpose. A law joins only with a stated violation-tell (below), never as a vibe.
- **New code obeys; old code migrates.** Declaring a law freezes new debt for free. Existing violations are paid down by annexation — one at a time, each behind Law 6 — never by a rewrite.
- **The working app is the asset.** The system is extracted on top of the running app, never by rebuilding it.

---

## The six laws

Each law states the rule, what it means concretely, and **the tell** — how an audit knows it's violated (this is what makes the constitution a yardstick, not a mood).

### Law 1 — One source of truth per claim (one government)
Every claim about the athlete is computed in exactly one place — the spine — and every surface reads it.
- **Tell:** two surfaces show a different value or verdict for the same claim; a surface re-derives a verdict instead of reading it; the same truth is forked (e.g. capacity prescribed-150 vs judged-125).
- **Roots:** CANON §12, SELF-AWARENESS-MAP Layer 4, D-185/D-186.

### Law 2 — Measured and inferred never wear the same clothes
A computed fact is stated flat. An inference is labeled as inference and carries its `basis`. The app never fills a gap with a confident number.
- **Tell:** a modeled / defaulted / estimated value presented as if measured (the Firstbeat default-laundering failure); a causal claim with no basis; a fabricated fallback reaching a user-facing verdict.
- **Roots:** CANON §0, D-242, D-237.

### Law 3 — Confidence travels with every inference, all the way to the surface
`magnitude` never travels without `confidence` + `basis`. The narrative register is bounded by the confidence; a cold baseline surfaces the observational read, never a confident number.
- **Tell:** a number shown without its confidence (the Whoop confidence-stripping failure); prose asserting above its computed confidence; a named cause on a cold baseline.
- **Roots:** CANON §3/§11, D-231.

### Law 4 — Surfaces render; they never re-decide
The claim, cause, magnitude, and confidence are computed upstream and handed to the surface as data. The card, State, coach, and LLM prose choose wording and emphasis only — zero verdict latitude, and the lead is governed.
- **Tell:** prose asserting a cause/magnitude/order not in the struct (Q-128 "clean execution"; the Q-129 "leads with Typical" ordering lie); a screen computing its own verdict.
- **Roots:** CANON §11 render contract, `execution-honesty.ts`, `SPEC-universal-narrative-inference.md`.

### Law 5 — New reasoning is born on the spine
No new feature mints a local authority. A new verdict is a spine citizen from day one; every arm subscribes.
- **Tell:** a new claim computed inside an analyzer, the coach, or a screen instead of the spine — i.e. a fresh breakaway state added to the Q-106/107/108 debt.
- **Roots:** CANON §12; the coach-partial-on-spine + forked-capacity debt as the cautionary tale.

### Law 6 — Every load-bearing change ships behind a behavior-unchanged proof
A migration or verdict change is safe only with a fixture proving the output didn't move — a byte-identical golden where possible. Stochastic (LLM) generators require ≥3 back-to-back clean recomputes, never one.
- **Tell:** a spine / verdict / migration change with no fixture; "it passes" claimed from a single run of an LLM path.
- **Roots:** the fixture discipline, D-243/D-244 goldens, the ≥3-recompute standing rule.

---

## How it's enforced (so it's law, not aspiration)
1. **Visible every session** — a pointer to this doc lives in CLAUDE.md's context-priming, so new work can't quietly break a law.
2. **Measured, not assumed** — the authority audit (next artifact) scores the codebase against these six tells and ranks violations by trust-risk. That ranking picks what gets annexed first.
3. **Paid down by annexation** — each fork closes under Law 6, one at a time. The map, not preference, sets the order.

## What this is not
- Not a rewrite plan. Not a mandate to centralize data plumbing. Not a finished state — it's the yardstick that makes the unfinished state *measurable*.

## Changelog
- **2026-07-05** — Created. Six laws consolidated from CANON / SELF-AWARENESS-MAP / SPEC-universal-narrative-inference / DECISIONS-LOG, each with a violation-tell so the authority audit can score against it. Scope explicitly bounded to the reasoning/verdict layer.
