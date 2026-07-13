# Efforts — Product Positioning (v2 DRAFT)

**Draft:** 2026-07-13. **Supersedes:** `PRODUCT-POSITIONING.md` v1.1 (2026-05-27) — *if approved.*
**Author:** Michael Angel (solo founder). Drafted from his own words, 2026-07-13.

> **v1 was written on the wrong axis.** It pitched *programming* — when to lift, how hard, what to lift — which is the axis **every** hybrid app competes on (Edge, HYBRID, OnlyGains, Victus, TrainHeroic). It also used the word "hybrid athlete," which is the thing we're actually rejecting. This draft re-aims it. **Nothing about the engine changes. The claim does.**

---

## 1. The word we don't use

**"Hybrid athlete" is a costume.**

It sells a fixed identity: be everything, all the time, forever — and feel like you failed when you're not. It's a culture with an aesthetic, and the aesthetic is the product.

**You're not a hybrid athlete. You're a generalist.**

You run. You ride. You swim, sometimes. You lift. You probably race. **You're an athlete.** That's the whole description, and it doesn't need a brand.

And crucially: **you don't do all of it, equally, all the time.** Nobody does. You get into lifting for a few months. You get a race on the calendar and running takes over. Winter comes and you ride inside. Your focus *moves* — and that's not a discipline problem, that's just being a person who trains for years instead of weeks.

---

## 2. What Efforts is actually for

**Efforts lets you move around the spectrum without losing what you built.**

Shift toward strength for a block. Let the running idle. Come back to it. Take a race goal, then put it down. The app follows you across, keeps the total load coherent, and — this is the part nobody else does — **tells you the truth about what the move cost.**

Not so it can stop you. **So the move stays a choice instead of a slow accident.**

You should be allowed to be into strength this quarter. You just shouldn't wake up in October surprised that your legs are gone.

**Training stays interesting because you're allowed to move. It stays honest because the app tells you what moving costs.**

---

## 3. The differentiator — and it is NOT programming

**v1 claimed the programming.** That claim is now crowded and, on its own, not defensible:

| | what they sell |
|---|---|
| **Edge** | built for hybrid from day one; sequences strength/run so they don't compete |
| **HYBRID** (trainhybrid.app) | AI-native; strength + endurance + nutrition as one system |
| **OnlyGains.ai** | auto-cuts running volume when you log heavy deadlifts |
| **Victus** | a 6-axis "Hybrid Score" |
| **TrainHeroic** | coach-facing; deeper on strength than TrainingPeaks |

*(Caveat, on the record: much of the "best hybrid app" comparison content is published by **Edge's own site**. Treat their rankings as marketing.)*

**Every one of them competes on plan generation.** Interference, sequencing, recovery windows, volume distribution. *"We'll build you a plan where lifting and running don't cannibalise each other."*

Efforts does that too, and does it well (`SCIENCE-concurrent-training-interference.md`, the same-day matrix, `week-optimizer`). **But it is not the wedge.**

### The wedge is INTERPRETATION.

**Nobody tells you the truth about what you actually did.**

- **Garmin** tells a lifting, swimming athlete running in summer heat that he is **"Unproductive."** It cannot see the lifting, cannot see the swimming, and reads the heat as lost fitness. It is judging the whole athlete on the one axis it can see — and it never asked what you wanted.
- **WHOOP** is honest about what it doesn't know, but *"an hour of intense weight lifting barely registers."*
- **TrainingPeaks** declines to judge at all, and hands it to a coach.
- **Victus** gives you six numbers and makes *you* do the synthesis.

**Efforts asks you what you want, watches what you do, and holds the two up next to each other.**

That's it. That's the product.

---

## 4. What that looks like

You told it: *"Keep my running ticking over — 15 miles a week — while I focus on strength."*

Twelve weeks later, most apps say nothing, or say something wrong. Efforts says:

> **You're 11 miles under your run target. Your aerobic engine is holding — that's the riding and swimming. But running is specific: if you want to keep the running, you have to run it.**

**Read what that does.**

- It **names the trade** rather than scoring you.
- It gives the generalist **permission** — *engine's fine, carry on, nothing is broken.*
- It gives the runner the **warning** — *your running is quietly going.*
- **The athlete decides which half they care about.** The app doesn't guess, doesn't nag, doesn't gamify.
- And it refuses the false comfort: **your aerobic fitness being fine is not evidence your running is fine.** Those are different adaptations. One survives cross-training. The other doesn't.

No score. No streak. No composite number to decode. **Your words, next to your calendar.**

---

## 5. Why only Efforts can say it

Three things have to be true at once, and only one app has all three:

1. **It asked what you wanted.** Per-discipline intent (`develop` / `maintain` / `out`) and a typed target. Garmin never asks. Strava never asks.
2. **It can see everything you did.** Strength is core, not a bolt-on. Swims count. Rides count.
3. **It won't lie to make you feel good.** Every number carries its provenance, its confidence, and its age. When it doesn't know, it says so instead of inventing something. *(See `CONSTITUTION.md` — this is Law 2 and Law 3, and it is enforced in code.)*

**Garmin cannot fix (1) or (2).** It's a model limitation, not a bug. It will never see your lifting.

---

## 6. Who it's for

**The generalist.** Trains most weeks, for years, across several things. Probably races — but doesn't need to. Wants to be strong *and* fit *and* durable, and knows those pull against each other.

**They shift focus, on purpose, and want the app to come with them** — not punish them for it, and not quietly let them lose something they meant to keep.

**They don't want a coach and they don't want a cheerleader.** They want a straight answer.

---

## 7. What we are NOT

- **Not a scoring app.** No composite number, no "fitness score," no streaks. A single number that collapses strength and endurance into one verdict is exactly how Garmin gets it wrong.
- **Not a compliance cop.** Missing your run target is not a failure. It's a trade. We show you the trade.
- **Not an identity.** We're not selling you on being A Hybrid Athlete. You're a person who trains.
- **Not for beginners, not for pros.** Unchanged from v1, and still true.

---

## 8. The one-line version

> **Everyone can build you a hybrid plan. Nobody will tell you when you've stopped following your own.**

---

## ⚠ OPEN — Michael's call

- **The engine claims in v1 §"What Efforts Does" are still true** and are worth keeping; this draft deliberately demotes them from *the* pitch to *table stakes*. Confirm that's the intent.
- **"Generalist" as the noun** — is it the word? It's honest and unbranded, which is the point, but it's also flat. (That may be a feature.)
- Swim is still tri-only, not standalone (unchanged).
