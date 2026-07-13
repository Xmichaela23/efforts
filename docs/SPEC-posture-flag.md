# SPEC — The posture flag: hold up what the athlete SAID next to what they DID

**Status:** SPEC (2026-07-13). Not built. **This is the product one** — the thing no competitor can do.
**Voice:** `PRODUCT-POSITIONING-v2-DRAFT.md` — **read it first.** This is a *trade made visible*, **not a compliance cop.** Build it in the wrong voice and it becomes a nag, which is the opposite of the point.
**Laws:** 1 (one source), 2 (measured ≠ inferred), 4 (surfaces render, never re-decide).

---

## 0. The one-line version

> **You said maintain running. You've run once in three weeks.**

No score. No composite. No physiology claim. **The athlete's own words, next to their own calendar.**

---

## 1. Why this is the wedge

Traced 2026-07-13. Every hybrid app competes on **plan generation** (Edge, HYBRID, OnlyGains, Victus, TrainHeroic — interference, sequencing, recovery windows). **Nobody competes on interpretation.**

- **Garmin** tells a lifting, swimming athlete running in summer heat that he is **"Unproductive."** It cannot see the lifting, cannot see the swimming, reads the heat as lost fitness — and **it never asked what he wanted.** Structural, not a bug.
- **TrainingPeaks** grades *workout-by-workout* compliance (green/yellow/red, ±20%). It will tell you that you skipped Tuesday. It will **not** tell you that you have quietly stopped running as a discipline.
- **Garmin's Training Load Focus** *does* say *"Low aerobic shortage — try adding more low aerobic activities."* **One line. Actionable. Exactly the right register.** But the target is **Garmin's**, not yours.

**Efforts is the only app that asked.** `per_discipline_posture` (`develop` / `maintain` / `out`) plus a typed target (Get Stronger's weekly maintenance miles). **Steal Garmin's line; fix the yardstick.**

---

## 2. THE BUG THIS FIXES — the app currently says the opposite

**`_shared/off-plan-banner.ts:66-71`.** For a **strength-primary** athlete (Get Stronger) who has done their lifts and **ZERO runs**, the app returns:

> **`'On plan — strength on track; endurance via cross-training.'`**

`computePrimaryAdherence` (`_shared/load-status-reconcile.ts:155-176`) **counts strength sessions only.** It hard-returns `null` for anything that is not the primary discipline — **it has no notion of the maintained discipline at all.**

**This is not a missing feature. It is an active false reassurance.**

And the honest sentence **already exists, three lines above it**, for non-strength-primary athletes:

> `off-plan-banner.ts:28` — **`'Running behind plan — total load carried via easy cross-training.'`**

It is (a) hardcoded to run rather than reading posture, and (b) **suppressed for exactly the athletes who need it.**

---

## 3. What already exists (do NOT rebuild)

| piece | where | status |
|---|---|---|
| Declared per-discipline intent | `goals.training_prefs.per_discipline_posture`; seeded `src/lib/non-race-goal-seeds.ts:198-244`; edited `NonRaceBuilder.tsx:267-325` | **BUILT — but WRITE-ONLY.** Read once at plan-build; **ZERO runtime surfaces read it.** |
| Typed maintenance target | Get Stronger's weekly miles → `strength-primary-plan.ts:369-374` | BUILT |
| Per-discipline planned-vs-done **session counts** | `_shared/state-trend/adherence.ts:49` `computeAdherenceState`; fed by `compute-snapshot:735-740` (`plannedBy`/`doneBy`) → `assemble.ts:237` | **BUILT** — but a *fallback-only* axis (`discipline.ts:44-68` renders it **only when the performance verdict is absent**), so a run with a trend verdict **hides** its own "0/2 planned". |
| The honest sentence | `off-plan-banner.ts:28` | BUILT, and suppressed for strength-primary |
| Per-discipline weekly load | `athlete_snapshot.workload_by_discipline` (`compute-snapshot:763`) | BUILT |
| Plan-primary resolution | `coach/index.ts:2492` `resolvePlanPrimary` | BUILT |

**Every part exists. They have never been introduced to each other.** This is a wiring job.

---

## 4. The design — TWO TIERS, and they are different kinds of claim

### Tier 1 — BEHAVIOURAL. A fact. Always available.
> *You said maintain running (15 mi/wk). You've been doing 4.*

No interpretation, no physiology. **The athlete's declared target next to their actual sessions.** Cheap, honest, unarguable.

**Generic across disciplines and focuses.** The rule is:
> **For any discipline declared `maintain` — are you maintaining it?**

A bike-focused athlete who declared maintain-running gets the same flag. A marathon block with maintain-strength gets it pointed at strength. **It reads `per_discipline_posture` and does not care what the focus is.** No strength special case; delete the `off-plan-banner` strength branch's exception.

### Tier 2 — CONSEQUENCE. Must be EARNED by evidence.

**⚠ THE HONEST TRAP, and the reason this tier is subtle:**

**When the athlete stops running, the app goes BLIND to their running.** It cannot measure the decay of something they are not doing. And worse — **`rollupHrResponse` (`assemble.ts:390-413`) is *designed* to hold out a thin/stale verdict**, so a run verdict that goes provisional is **dropped from the solid set and the composite is decided by the BIKE alone** → the BODY row reads **"holding."**

**So the app will assert the false comfort by construction.** *"Your aerobic fitness is fine"* — technically true, practically misleading.

**Therefore Tier 2 is NOT "you are losing fitness."** That is an invention and Law 2 forbids it. It is:

> *We haven't had a clean read on your running in 5 weeks. Your aerobic engine is holding — that's the riding and swimming. But running is specific, and we can't see it any more.*

**Both halves are true at once, and the app must say both:**
- it gives the **generalist permission** — *engine's fine, carry on, nothing is broken*
- it gives the **runner the warning** — *your running is quietly going*
- **the athlete decides which half they care about.** The app does not guess, does not scold, does not gamify.

### The science this rests on — AND THE GAP
The **engine** carries over (central: cardiac output, VO2max, plasma volume — riding and swimming genuinely hold these). The **legs** do not (running economy, tendon/bone stiffness, eccentric tolerance, neuromuscular patterning — **specific**, and they decay whether or not the engine is fine).

**⚠ THE APP HAS NO MODEL OF THIS AND NO DOC FOR IT.** Its *only* stated maintenance theory is `SPEC-getstronger-contract-row.md:49` — *"aerobic detrains slower than strength → low volume holds it"* [Mujika & Padilla 2000] — which is **discipline-BLIND.** It is true of the engine and false of the legs. **That claim is the assumption this spec qualifies, and a `SCIENCE-run-specificity.md` is owed** (running economy / impact loading / eccentric tolerance do not transfer from cycling). Do not ship Tier 2's prose without it.

---

## 5. The build

1. **Make posture READABLE at runtime.** It lives on `goals.training_prefs` and nothing but the plan builder reads it. Thread it into the coach's context (and/or `athlete_snapshot`) so surfaces can ask *"what did they say they wanted?"*
2. **A posture-vs-behaviour comparator.** `computeAdherenceState` (`adherence.ts:49`) already has per-discipline planned/done counts. Join them: `posture[d] === 'maintain'` × actual sessions/volume vs the declared target.
3. **Kill the strength-primary exception** in `off-plan-banner.ts:66-71`. It stops being a special case and asks the same question as everyone else. **`computePrimaryAdherence` must gain a notion of the maintained discipline** (it currently hard-returns `null` for non-primary).
4. **One line on State.** Not a card, not a score. Per `PRODUCT-POSITIONING-v2-DRAFT` and Michael's brief: *simple, honest, quick read.*
5. **Un-hide the adherence axis** (`discipline.ts:44-68`) — a "0/2 planned" must not be suppressed just because a performance verdict exists. They answer different questions.

---

## 6. ⚠ What NOT to build

- **NOT a composite score.** Victus's 6-axis "Hybrid Score" was explicitly rejected — *"too confusing, I want State to be simple, honest and a quick read."* A single number collapsing strength and endurance is exactly how Garmin gets it wrong.
- **NOT a compliance cop.** Missing your run target is **not a failure — it is a trade.** The app exists to let athletes move around the spectrum. **Its job is not to stop you moving; it is to make sure you know you moved.**
- **NOT "you are losing fitness."** We cannot measure what we stopped observing. Say what we can no longer see, not what we imagine happened.
- **NOT strength-specific.** Every plan has a focus. The rule is generic over `per_discipline_posture`.
