# SPEC ADDITION — Adherence↔Performance Bridge (STATE-level nudge)

**Add to:** SPEC-state-screen-v2-performance.md
**Status:** Open spec · after current limb wiring · on-ramp to Step 5 (plan adjustment)
**Relates to:** STATE v2 (co-equal performance + adherence axes) · the spine (verdict source) · session-context (adherence facts) · Step 5 plan adjustment (gated)

---

## The design principle (the why this lives where it does)

**A single session is noise; the pattern is signal.** A user already has a felt sense of why a given session was a lemon — bad sleep, new terrain, rough week, hot day. They don't need the app to ask, and they must NOT be alarmed about one off session. Where the user genuinely *can't* see clearly — and where the app is additive — is the **aggregate**: "is this a pattern or just a bad week?" That requires holding 8 weeks in your head; STATE can, the user can't. That's the app's real value-add.

So placement falls out of that:

- **Session level: quiet and factual. No nudge, no why-prompt, no alarm.** Lemon sessions are anomalies the user already understands. Asking "why was this slow?" on every off session is redundant (they know) and anxiety-inducing (implies every bad day is a problem). The session records what happened; the narrative may *describe* it honestly, but never alarms or asks. Let lemon sessions be lemon sessions.
- **STATE level: the only place that surfaces the pattern, asks, and offers to adjust.** Because the aggregate is the non-obvious, useful, stable thing.

## What STATE surfaces (the bridge)

STATE already holds both axes (performance verdict + adherence). The bridge connects them: when performance is sliding AND adherence is sustained-low over the trend window, surface the link.

The honesty line — observe, don't diagnose:
- **DO surface the correlation:** "Run's sliding, and you've missed 3 of the last 8 planned runs — adherence may be a factor." ✓ data-supported.
- **DON'T assert sole causation:** "Your run is declining *because* you skipped runs." ✗ dropped runs are *a* plausible cause, not the only one (illness, heat, cross-discipline fatigue, base-phase variation). Cause needs info the app doesn't have.

## The flow (why-before-adjust — the sequencing is the honesty)

1. **Surface the link** (observation, aggregate, data-supported).
2. **Ask why** — "intentional? injury? life got busy?" This gets the information the app *cannot infer*. The why gates everything downstream.
3. **Offer to adjust — conditioned on the answer:**
   - busy/life → maybe ease volume, or hold + nudge back on track
   - **injury → adjust DOWN (reduce load), never "catch up." Hard guardrail.**
   - intentional (recovery/strategic) → no adjustment; the app was wrong to assume failure
   - don't know → just surface, don't adjust off nothing

Asking why before offering to adjust isn't politeness — it's the app refusing to change the plan off an assumed cause. Same principle as the spine: don't act on what you can't support.

## Pattern-gated — inherits the spine's restraint

The nudge only fires when the pattern is REAL — sliding verdict that clears the spine's staleness/min-session gates AND sustained (not a two-week dip that's actually a deload). It must NOT react to:
- a single lemon session (that's the session layer's job to stay quiet about)
- a short dip inside normal variation
- a deliberate deload/taper (adherence "drops" by design)

Silence on noise is what makes the signal credible — the same honest-blank-over-confounded discipline. A nudge that cries wolf on every bad week trains the user to ignore it and adds anxiety to training. A nudge that stays quiet until the pattern is real is trustworthy *because* it's rare.

## Continuity (reads one source)

Session writes the adherence fact (planned vs. actual — already captured). The spine/snapshot aggregates it. STATE reads the aggregate verdict + adherence from the same cache that feeds everything else — no re-derivation. Session supplies facts; STATE does the asking; one source underneath.

## Why it's the on-ramp to Step 5

This is the honest precursor to plan adjustment: before the app *adjusts* for dropped runs, it first *notices*, *surfaces*, and *asks why* — with the human at the gate. The adjust-offer is where this bridges into Step 5 (gated autoregulation). Build the surface+ask first; the adjust-action stays behind Step 5's explicit sign-off.

## Sign-offs when built

- Adherence-low threshold (what % missed, over what window, counts as "sustained low")?
- Deload/taper detection — don't nudge when low adherence is by design (planned recovery).
- The injury-path guardrail — confirm adjust-down-never-up is enforced, not just intended.
- Surface UX — how the nudge appears on STATE without nagging (dismissible, infrequent).
