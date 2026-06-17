# WORK ORDER — Deviation-Reason Capture (cross-discipline)

**Status:** SPECCED, NOT BUILT. **Do not start until the narrative-core consolidation has landed** (it feeds the narrative; building it against the four pre-consolidation paths means wiring it four times then redoing it). Sequenced AFTER the narrative-core + after the integrity fast-follows (Q-061, run-GAP persistence) — correctness before new features.

**Depends on:** narrative-core (the stated reason is consumed by the shared reasoning core). 
**Relates to:** SPEC-universal-narrative-inference.md (rule 4 — observe-don't-diagnose; this feature is how the app gets the *cause* honestly: the athlete declares it, the app never infers it).

---

## The problem

When a planned session is executed differently than prescribed (planned VO2 intervals → ridden as Zone 2 social spin), the app currently sees only "didn't hit prescribed intensity" → reads as a MISS / adherence ding. But the data CANNOT distinguish a failed workout from a smart autoregulation call from a deliberate social ride — they produce identical sensor data. Per the honesty line (rule 4), the app must not GUESS the cause. The fix: let the athlete *declare* the reason. The app provides the input; the human supplies the why.

## The design (low-friction, default-yes, data-triggered)

**The app stays silent when execution matches the plan.** No prompt. Most sessions go to plan; the app should not interrogate the common case. (Same anti-over-prompting discipline as not nagging — friction only when warranted.)

**Only when the data shows a meaningful planned-vs-executed divergence** (the app already computes adherence — it knows when executed ≠ prescribed), surface ONE low-friction check:

> "Did you follow the planned workout?" — default-assumes YES, one tap.

- **Yes (default):** nothing changes. Logged as planned.
- **No → reason dropdown appears:** athlete picks why:
  - Autoregulated (felt tired / managed load)
  - Rode/ran social or group
  - Free session by choice
  - Weather
  - Cut short
  - Felt good — pushed harder
  - (wording tunable; the set should cover the honest common reasons)

The data triggers the ask; the rider supplies the why. Never asked about a session they clearly nailed.

## How the stated reason factors in

1. **Adherence respects the choice.** A consciously-abandoned plan is NOT a failure — it's a different session the athlete chose. Stop dinging deliberate deviation. (e.g. "planned intervals, chose social → logged as easy aerobic, no adherence penalty.")
2. **Narrative reasons from STATED intent, not prescribed.** The shared narrative core reads the declared reason and frames against it ("you set out for intervals, chose a social ride — solid aerobic time"). This is why it depends on the core.
3. **Surfaces patterns, never diagnoses them.** Repeated "autoregulated" or "free ride" is a real signal — but the app OBSERVES it ("you've autoregulated 3 of your last 5 hard sessions"), it does NOT diagnose ("you're overtrained"). Rule 4 holds even on the aggregate.

## Honesty boundary (critical)

The value is the athlete DECLARING the reason — never the app INFERRING it. The app offers the input and believes the answer; it never claims to know why a session deviated. "Did you follow it?" with a default-yes is the app asking, not assuming a miss. This keeps the whole feature on the right side of observe-don't-diagnose.

## Scope notes

- **Cross-discipline, build once.** Runs, rides, swims — any planned session can deviate for the same human reasons. Build it as one shared deviation-reason layer (like RPE/feel), not per-discipline.
- **Reads existing adherence.** The divergence trigger uses the adherence the app already computes — no new detection logic, just "if executed materially ≠ planned, ask."
- **Stored as a session-level field** the narrative adapter and adherence both read (single-source the stated reason).

## Build sequence (when unfenced)

1. The divergence trigger (reuse existing adherence; define "material" divergence threshold).
2. The "did you follow it?" check (default-yes) + reason dropdown.
3. Store the stated reason (session-level, single-sourced).
4. Adherence reads it (respect the choice).
5. The narrative adapter reads it (reason from stated intent) — via the shared core.
6. Pattern surfacing (observe-only, no diagnosis) — optional later layer.

**Do not build until narrative-core has landed and the integrity fast-follows (Q-061, run-GAP) are done.**
