# SPEC ADDITION — STATE Headline (deterministic, progressive disclosure)

**Add to:** SPEC-state-screen-v2-performance.md (extends the existing two-part headline concept)
**Status:** Open spec · after current limb wiring
**Decision:** deterministic phrase-bank, NOT LLM/hybrid — for now (door left open, see below)

---

## The form (progressive disclosure)

A short, glanceable **2-3 sentence headline** that synthesizes the macro training picture, **expandable** into full per-discipline detail on demand. Glance = "how's my training going" answered in a sentence; expand = the depth for those who want it. This extends STATE v2's existing two-part headline ("Building — strength up, run sliding") into a fuller synthesized summary with expand.

## The integrity line (what the headline must never become)

The failure mode for a glanceable training summary is vague encouragement ("Great work — keep it up!") that sounds good and says nothing — slop, and the opposite of this app. The Efforts headline is the **spine's** headline — synthesized from the verdicts, grounded, honest, refusing to flatter.

- ❌ vague-encouragement: "Great work this week — your fitness is trending up!"
- ✅ spine-grounded: "Bike's climbing, run's slipped a step, and you've missed over half your planned sessions — the run dip is probably more adherence than fitness."

Same *form*, opposite *integrity*. Ours says something true and specific because it's built from the spine, not a sentiment generator.

## Generation: deterministic phrase bank (the decision, and why)

**Decision: option 1 — deterministic, hand-authored phrase bank, no LLM at generation time.**

Why not hybrid/LLM: the headline is the most *visible* surface — first thing the user reads. An LLM polishing for fluency tends to (a) round off the honesty into reassurance, (b) add connective tissue that asserts what the spine didn't license, (c) vary the *meaning* run to run, undermining the one-stable-truth property. The claim-grounding validator catches explicit false claims but not tone-drift/soft-implication. And a hybrid constrained tightly enough to trust (skeleton + paraphrase-only + validator + our register) collapses toward deterministic dullness anyway — you take the integrity risk and complexity for little fluency gain. So: keep the most visible surface clean and reliable, consistent with the rest of the bake.

Repetition is the accepted cost (a fixed bank repeats). It's *cosmetic* and controlled; slop/tone-drift would be an *integrity* cost only mostly controllable. We choose the fence over the leash — same choice as everywhere else in the app.

## How deterministic stays warm, not clinical

Clinical comes from lazy slot-filling, not from determinism. Three techniques keep it human:

1. **Curated phrase bank, authored — never generated.** Hand-write the warm phrasings per verdict-pattern; the system *selects*, never *generates*. "Bike's coming along" not "bike is improving 4.9%." Warmth is authored once by a human; selection is deterministic and safe — no model can free-style into "you're crushing it, champion."
2. **Synthesize the *shape*, not the rows.** Name the pattern ("you're building — one discipline climbing, one dipped, sessions sparse") rather than enumerating disciplines. Reads like a person noticing a shape; is actually a branch on (some improving + some sliding + low adherence).
3. **Honesty as understanding, not encouragement.** Bake the honest context into the phrase ("run's slipped, though the missed sessions probably matter more here") — warm because it *gets it*, not because it cheerleads. A coach who understands, not one who pumps you up.

## The authoring task (where the app's voice lives)

The phrase bank IS the app's personality — and that's a feature: the tone is *yours*, consistent, immune to generic LLM-pleasantness. Author ~15-25 phrasings covering the verdict-pattern combinations, in Efforts' register (dry, warm, honest training-partner):
- all-improving · all-sliding · mixed (some up/some down) · sparse-data/needs-data-heavy · building-phase · taper/deload · adherence-low-while-performance-holding · etc.
- **2-3 authored variants per pattern** so selection rotates — kills the repetition itch without an LLM.

## Integrity constraint (same as the narrative)

Every sentence in the headline traces to a spine verdict (+ adherence from the cache). It's a *synthesis of grounded truth*, not generated sentiment. The headline can't say what the spine doesn't support. Reads the same cache as everything else — no re-derivation. This is the natural surface for the adherence↔performance bridge (the macro nudge lives in the headline + expand).

## Door left open (not closed forever)

If, once the deterministic version is live and trusted, repetition proves a real product itch *and* the rest of the cake is proven stable, a **constrained hybrid** could be revisited: LLM restricted to paraphrasing the deterministic skeleton, in our register, run through the claim-grounding validator, no new claims. That's a "thesaurus over authored phrasings," not "LLM writes the headline." Deferred deliberately — clean and reliable first; fluency later only if earned and only behind the validator.

## Sign-offs when built

- The phrase bank itself (authoring the voice — the real work; needs the human register).
- Pattern taxonomy — the exact verdict+adherence combinations that map to phrasings.
- Variant count per pattern (2-3) and the rotation/selection rule.
- Expand content — what the detail view shows (per-discipline trends + adherence + why-ask).
- Confirm: every phrasing traces to a spine state; nothing asserts beyond the verdict.
