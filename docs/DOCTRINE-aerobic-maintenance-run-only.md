# Aerobic Maintenance Doctrine — Run-Only Athlete, Strength-Led Block

**Scope:** governs aerobic prescription during a strength-led block for an athlete with no bike.
**Status:** doctrine. Companion to `DOCTRINE-aerobic-maintenance.md`. Sections 1–4 of that document apply unchanged and are not restated.
**Author:** Michael, 2026-07-26.

> ## ⛔ TRACE NOTES — added 2026-07-26 when this was filed. Michael's text is unchanged; these boxes are what checking it against the codebase turned up.
>
> **This document has TWO unbuildable requirements, and they are not the same kind of problem.**
>
> 1. **§2 grade — no field exists.** ⚠️ **Identical hole to the parent's §5.2 cadence. ONE fix serves both.**
> 2. **§3 short intervals — the token GRAMMAR cannot express them.** `run_vo2_*` is minutes-only. A
>    40sec/20sec set is **not currently sayable**, not merely unprescribed.
> 3. **§2.2 pace anchors — the engine does the opposite of what this section requires TODAY.**
>    `materialize-plan` paces every VO2 run off 5K pace. This section says do not.
>
> **§6 strides is already built** — see the parent doctrine §7 box. `session-factory.ts:359`.
>
> ⛔ **Item 3 is the one to notice.** It is not a missing feature — it is the engine actively emitting
> something this doctrine calls a false-precision failure. **It will keep doing it until told otherwise.**

---

## 1. The problem this document exists to solve

The parent doctrine resolves the strength-block conflict by putting intensity on the bike, where it costs the barbell nothing. **That resolution is unavailable to a run-only athlete.**

The constraint is unavoidable:

- VO2max is preserved by **intensity**, not volume (Hickson).
- Run intensity carries high **eccentric** mechanical cost.
- Eccentric mechanical cost is precisely what competes with strength adaptation.

The runner cannot buy VO2max defence for free. **The cost gets paid, and this document decides where from.**

This must be stated in the doc and in the product. A run-only strength block is a worse block than a bike-equipped one. Not unworkable — worse. Pretending otherwise is the dishonest version.

> ⚠️ **The premise inherits the parent's contested citation.** *"Bike costs the barbell nothing"* rests on
> Wilson 2012's modality separation, which **Schumann 2022 did not reproduce** — see
> `DOCTRINE-aerobic-maintenance.md` §5. **The asymmetry is still the right bet** (the eccentric mechanism is
> credible and the rule errs safe), **but "a run-only block is worse" is a directional claim, not a
> measured one.** ⛔ It is honest to say the run athlete pays more. It is not honest to imply the size of
> the gap is known.

---

## 2. Lever one — gradient

**Uphill running is concentrically biased. Downhill running is eccentrically biased. Level running sits between.**

> ## ⛔ THE EVIDENCE UNDER THIS SECTION WAS REPLACED 2026-07-26. The conclusion did not change; the sourcing did, and the new sourcing is much better.
>
> **Michael: *"Hills were right — but my original sources didn't show it, and the ones that do are better than
> anything I'd cited."***
>
> **The old citations were the WRONG COMPARISON.** Maeo 2017 and the IJSPT paper both compare uphill to
> **downhill**. That is not the question. The question is **uphill vs LEVEL at matched intensity**, and it
> was never sourced. ⚠️ *"Concentrically biased"* is a background characterisation sentence in a paper about
> downhill damage — **framing, not a finding.**
>
> ### The paper that actually answers it
>
> **Eleven collegiate distance runners at 0%, 4% and 8% treadmill incline, run at ISO-EFFICIENT SPEEDS** —
> speed/incline combinations matched for metabolic intensity. **All variables of interest were significantly
> reduced as incline increased (0% > 4% > 8%).** Controlling speed to hold metabolic output lets a runner
> **decrease loading rate and peak vertical GRF while achieving the same metabolic stimulus as level
> running.** *(J Biomech 2020, iso-efficiency protocol.)*
>
> ⛔ **Matched metabolic cost, lower mechanical load, at EXACTLY the grades prescribed. So the 4–8% band is
> NOT convention — it is the TESTED RANGE.** Corrected in §10.
>
> ### Two supporting findings, both measured
>
> - **Gottschall & Kram 2005** — uphill impact force peaks are smaller than level; at +9° they are **absent**.
>   ⚠️ **The nuance worth carrying: neither uphill nor downhill affected normal ACTIVE force peaks.** So what
>   disappears is the **impact transient**, not the muscular force. **The damage mechanism goes; the work
>   does not.**
> - **Sports Med Open 2024** — knee extensor **isometric torque is PRESERVED after maximal level and uphill
>   running, and reduced after downhill.** ⛔ **This is the closest thing to a direct test of strength
>   compatibility that exists, and it points our way:** maximal uphill effort does not cost knee extensor
>   force — the tissue a squat depends on.
>
> ✅ **AND THIS IS INDEPENDENT OF THE CONTESTED MODALITY CLAIM.** Wilson-vs-Schumann is about whether
> **running in general** interferes. This is about whether **uphill loads less than level at the same
> effort** — mechanics, measured either way. **It does not inherit that argument's weakness.**
>
> ### ⛔ WHY HILLS OVER FLAT SPEED — three reasons, in order of strength
>
> 1. **Lower mechanical cost at the same aerobic stimulus.** At matched metabolic intensity, loading rate
>    and peak vertical GRF both drop across 0% → 4% → 8%. **You buy the same engine work for less tissue
>    load.** ⛔ **In a block where the mechanical budget is the binding constraint, that is the whole
>    argument.**
> 2. **The impact transient is what does the damage, and it is gone.** Muscular work is unchanged. **You
>    keep the effort and lose the collision.**
> 3. **It does not cost knee extensor force.** Torque preserved after maximal uphill, reduced after downhill.
>
> ### ⚠️ WHAT YOU GIVE UP, AND IT IS REAL
>
> **Flat speed is race-specific.** Turnover, stride mechanics and economy at race pace are all **flat-ground
> qualities, and hills do not defend them.** Uphill running has **higher step frequency and shorter stride**
> than level — **different mechanics, not merely easier ones.**
>
> ⛔ **Which is exactly why strides stayed mandatory (§6).** They are the flat-speed component, and they cost
> nothing because the volume is trivial. **Hills for the engine, strides for the legs. Neither substitutes
> for the other.**

Uphill and downhill running are characterised in the literature as concentrically and eccentrically biased respectively (Maeo et al. 2017; Vernillo et al.). Downhill running is the established laboratory model for inducing exercise-induced muscle damage; uphill is not.

**Therefore: run intensity in a strength block is prescribed uphill.**

- Grade **4–8%**, outdoor hill or treadmill incline
- Cardiovascular stimulus fully intact at target intensity
- Eccentric load substantially reduced versus level running at the same effort
- Ground contact forces lower; impact transients lower

This is the run's approximation of the bike's mech-0 property. **It is an approximation, not an equivalent.** Uphill running is still weight-bearing, still involves ground contact, still costs more mechanically than pedalling. Reduced, not eliminated.

> ## ⛔ GRADE HAS NOWHERE TO LIVE. Traced 2026-07-26.
>
> **No token, session or step in the engine carries a grade or incline value.** The only `incline` matches
> anywhere in `materialize-plan` are **barbell incline bench** (`:844`, `:931`) — a different word doing a
> different job.
>
> ⚠️ **This is the SAME hole as the parent doctrine's §5.2 cadence, and one fix serves both:** a
> **modality-constraint field on quality tokens** — cadence for the bike, grade for the run — carried
> through expansion and out to the watch.
>
> **Why it is load-bearing rather than cosmetic, in both documents:** the cost row is not "run VO2", it is
> "run VO2 **at 4–8%**", exactly as the bike row is "bike VO2 **at ≥90 rpm**". **A token that cannot carry
> the constraint has an unverifiable cost.** The athlete runs it flat, the ledger prices it as though they
> did not, and the cost model is quietly wrong in the expensive direction.
>
> ⚠️ **And it must survive to the device.** `send-workout-to-garmin` is built and wired — a grade the app
> states but the watch never shows is a doctrine the athlete never receives.

### 2.0 ⛔ HILL OR FLAT IS THE ATHLETE'S CHOICE — hill is the default, and the app says why (DECIDED 2026-07-26)

**Michael: *"we don't need to ask, but hills are still superior for the bar."***

**Both are offered. Neither is gated. Hill is the recommendation and the default.**

### ⛔ DO NOT ADD AN INTAKE QUESTION FOR THIS

**No "do you have a hill?" step.** An athlete without one picks flat, and that is the whole mechanism. ⚠️
**Asking would buy nothing and cost a screen** — the same reasoning as the *"Not sure"* answer on weekly
volume: *"making someone compute a historical baseline before a screen unlocks is a data-entry exam, not an
intake."* **Availability reveals itself in the choice.**

### Why hill is the default — and the frame is the BAR, not the run

⛔ **The comparison is not "which is the better running session." It is "which leaves more for the
lifting."** On this block the mechanical budget is the binding constraint, so:

| | what it buys | what it costs |
|---|---|---|
| **Hill repeats** *(default)* | The same aerobic work at **measurably lower loading rate and peak vertical GRF** (iso-efficiency, 0/4/8%). **Knee extensor torque is preserved after maximal uphill.** The impact transient is gone; muscular work is not. | **Sustained flat-pace practice.** Hills do not defend race pace or race economy. |
| **Flat repeats** | **Sustained work at race pace** — durability at speed, held for minutes. | **More tissue load, on the block where tissue load is the constraint.** ⛔ **The lifting is what pays for it.** |

### ⚠️ THE OBVIOUS ARGUMENT FOR FLAT IS ALREADY SPENT — do not re-make it

**"Flat keeps your turnover and mechanics" is mostly answered by §6.** Strides are mandatory, twice
weekly, flat, and cost nothing. ⛔ **So flat intervals must NOT be sold on turnover.** What they uniquely
buy is **sustained** race-pace work — minutes, not seconds — which strides genuinely do not cover.

### This is a TRADE, not a gate — and that is the difference from D-327

⛔ **D-327 greys the second hard day because two hard days is simply the wrong answer.** ✅ **Here both
answers are legitimate** — they buy different things — **so the app states the trade and the athlete
owns it.** *(D-325 §7: "a cap that refuses is a cap; a number that states the cost is a trade.")*

### Copy shape — fact, then the consequence, no imperative

> **Hill repeats** — the same effort at lower load on the legs, so more of the week is left for the bar.
> Hills do not hold your flat race pace; the strides on your easy runs do that.
>
> **Flat repeats** — holds sustained race pace, which hills do not. Costs more in the legs, and on this
> block the lifting is what pays for it.

⚠️ **Both entries name what is given up.** ⛔ Neither uses an imperative, and neither says "recommended" —
**the default position carries that, not the words.**

### 2.1 Prohibited during a strength block

- **Downhill intervals.** Eccentrically biased, causes measurable muscle damage, impairs running economy for days. Directly antagonistic to the block's purpose.
- **Long flat intervals at VO2 intensity.** Highest total ground contacts at highest force. The most expensive way to buy the stimulus.

> ⚠️ **"Long flat intervals at VO2 intensity" is EXACTLY what the engine emits today.** The one VO2 run
> format in the vocabulary is `run_vo2_5x3min_z5` — **5 × 3 min, flat, pace-anchored**
> (`materialize-plan/index.ts:1467`). ⛔ **The prohibited session is the only one currently buildable.**
> Until §3 lands, a run-only strength block prescribing VO2 work prescribes the thing this section bans.

### 2.2 Engineering implication — pace anchors do not transfer

**Uphill intervals cannot be prescribed from 5K pace.** The pace–effort relationship changes with grade and the app's velocity anchor is invalid on a hill.

Prescribe by **duration at effort**, with grade specified. Optionally gate by HR if a reliable max is available. Do not emit a pace target for an uphill interval — that is a false-precision failure of the same kind as a modelled baseline rendered as an exact number.

> ## ⛔ THE ENGINE DOES THE OPPOSITE OF THIS TODAY, AND IT WILL KEEP DOING IT SILENTLY.
>
> `materialize-plan` expands `run_vo2_*` **off live baselines at 5K pace − 12 s/mi** (`:1467`), and
> `cruise_*_threshold` at **5K pace + 20 s/mi** (`:1487`). **Every run quality session the app can currently
> produce carries a pace target.**
>
> **So this section is not "add a feature" — it is "stop emitting a number that is wrong on a hill."** The
> expander has no way to know the session is uphill, because §2 has no field to tell it.
>
> ✅ **The right pattern is already in this codebase and should be reused, not reinvented.** Learned-vs-entered
> baselines render differently, and confidence travels with the inference to the surface
> (`AthleticRecordPage.tsx` `SuggestionLine`; Constitution Laws 2 and 3; the same argument as `D-326`
> layer 3). **A pace on an uphill rep is a measured-looking number with nothing behind it — the exact
> failure those laws name.**

---

## 3. Lever two — interval structure

**Short work bouts accumulate time near VO2max at lower total mechanical volume than long bouts.**

- **30/30 or 40/20** — VO2 stays elevated through the short recovery, so time-at-target accumulates across the set rather than only within each rep. Less total distance covered at speed for the same physiological dose.
- **60/60** — middle ground, more tolerable to execute, slightly higher mechanical volume.
- **3–5 min repeats** — the classic structure, and the most mechanically expensive. Reserve for endurance-led blocks.

**In a strength block, short-format uphill work is the default.** Longer repeats are an endurance-led tool.

> ## ⛔ THE TOKEN GRAMMAR CANNOT SAY THIS. It is not a missing session — it is a missing UNIT.
>
> The VO2 run token is matched by **`/^run_vo2_(\d+)x(\d+)min_z5$/`** (`materialize-plan/index.ts:1468`).
> **Minutes only.** There is no seconds form, so **`40 sec / 20 sec` and `30/30` are not expressible** —
> the string cannot be written, let alone expanded.
>
> **What this needs:** a seconds-capable work/recovery form (`run_vo2_10x40s20s_z5` or equivalent), with
> **recovery as a first-class part of the token** rather than the fixed 90 s float the current row assumes.
> ⛔ **The short-interval doctrine depends entirely on the recovery being short** — that is the whole
> mechanism by which VO2 stays elevated across the set. **A seconds token that inherits a 90 s float
> implements the opposite of this section.**
>
> ⚠️ **`3–5 min repeats` — the format this section reserves for endurance-led blocks — is the ONLY one that
> exists.** The engine can currently express exactly the structure this doctrine says not to use here.

---

## 4. Lever three — what yields

Uphill short intervals reduce the mechanical cost. They do not remove it. The remainder is paid from the strength side, in this order:

1. **Assistance and accessory volume.** Cheapest to remove, contributes least to the main lifts, established elsewhere in the system as the first thing to cut. Hyrox layer trims here.
2. **Easy run volume, partially.** Reduced, never removed — §4 of the parent doctrine makes easy volume a precondition, not a variable.
3. **Training max advances to hold rather than climb.** The block becomes strength-*maintaining* rather than strength-*building*.

**Item 3 is the honest bottom line.** A run-only athlete who insists on defending VO2max in a strength block should expect the block to hold strength rather than build it, or to build it more slowly than the bike-equipped version.

The athlete chooses which. The app states the trade. It does not choose silently.

> ## ⛔ ITEM 3 COLLIDES WITH THE ADVANCE PATH — and with the one strength gate that is already unwired.
>
> **"Training max advances to hold rather than climb" has no mechanism.** `workingNumberForCycle:112`
> advances the working number by **cycle index, unconditionally** — there is no hold state, and nothing
> reads anything to decide. **`D-326` layer 2 is the entry that names this**, and its fix
> (`verdictFrom95Set`, `wendler-531.ts:160-200`) is **written, correct and called by nothing.**
>
> ⚠️ **These two want the same wire and must not build two.** D-326 wants the number to advance only when
> **earned**; this section wants it to hold when the athlete is **paying the aerobic cost elsewhere**. Both
> are "the advance is conditional." **One conditional advance path, two inputs.**
>
> ✅ **Item 1 is already shipped and selectable** — the accessory-bias layer trims here, exactly as stated.
> ⚠️ **Item 2 is `§9` of the parent doctrine and is UNRESOLVED** against `D-325 §7`'s *never silently
> remove or shrink a session*. **"Reduced, never removed" does not by itself say WHO reduces it.** Same open
> decision, and this document inherits it.

---

## 5. Dose

Weekly intensity remains a single budget. Run-only means it is not split.

| Configuration | Session | Structure | Grade |
|---|---|---|---|
| Run-only, VO2 defence | 1× per week | 10–12 × 40 sec hard / 20 sec easy | 5–8% |
| Alternative structure | 1× per week | 8–10 × 60 sec hard / 60 sec easy | 4–6% |
| Threshold option | 1× per week | 2 × 8 min sustained | 3–4% |

Working time ~12–16 min. Session length ~35–40 min including warm-up and cool-down.

**One quality session, not two.** The parent doctrine's two-session configuration assumed one of them was mechanically free. Neither is here.

### ⛔ THE MIX — THREE HILL SESSIONS TO ONE FLAT, PER FOUR-WEEK CYCLE (decided 2026-07-26)

**Michael: *"no rotations — hill × 3, 1 flat, or flat speed."***

⚠️ **NOT a rotation, and the wording matters.** A rotation implies two sessions alternating as equals.
**They are not equals.** ⛔ **Hills are THE session.** The single flat week is there to stop one quality
disappearing over twelve weeks — **a fixed ratio inside the cycle, not a schedule of two things taking
turns.**

| | per 4-week cycle | over a 12-week block |
|---|---|---|
| **Hill repeats** | **3** | 9 |
| **Flat** — sustained race pace or flat speed | **1** | 3 |

**Why one flat at all, when hills are better for the bar:** hills do not hold sustained flat race pace,
and **strides do not either** — they are ten-second efforts defending turnover, a different quality (§6).
⛔ **Without the flat week, sustained flat capability does not degrade — it is never trained at all.**
Three sessions across a block is enough that it does not vanish, and too few to compete with the bar.

**The flat session may be run as sustained threshold or as flat speed at race pace.** ⚠️ **Not as flat VO2
intervals** — §2.1 prohibits those, and they remain the most expensive way to buy the stimulus.

> ⚠️ **PLACEMENT ASSUMPTION, flagged because it was reasoned and not stated by Michael: the flat week lands
> on the 5/3/1 DELOAD week.** The bar is light that week, so **the more expensive running session falls
> where the mechanical budget is actually free.** ✅ **It also gives the deload week a job on the endurance
> side, which `ARCH-strength-spine.md` §0.2 records as an OPEN problem** — 5/3/1 deloads on its own clock
> while endurance rows are emitted identically every week, deload or not. **This is one rule that makes the
> two clocks agree.**
>
> ⛔ **Counter-argument, unresolved:** it puts the hardest-on-tissue run of the cycle on the recovery week,
> so the athlete may never get a genuinely easy week in twelve. **Total systemic load stays roughly constant
> and only shifts source, which is defensible — but it is a choice, not an accident.** If the flat week
> should sit elsewhere in the cycle it is a one-line change.

### ⛔ THE NO-HILL ATHLETE CANNOT RUN THIS MIX — and that is where §1's "worse block" becomes concrete

**An athlete with no hill and no treadmill does flat every week. There is nothing to mix.** ⚠️ **They are
not choosing flat over hills — they are carrying the block's full mechanical cost with none of the
discount**, and the app should never imply that was a preference.

⛔ **This is exactly where §4's yield order is spent, in order: accessory volume → easy run volume,
partially → the training max holds rather than climbs.** **The no-hill athlete reaches item 3 soonest.**
§1 says a run-only block is worse than a bike-equipped one; **a no-hill run-only block is worse again, and
this names what it costs and where it comes out of.**

> ✅ **CONFIRMED BY DECISION, 2026-07-26 — and it is now universal, not a run-only concession.** *"You can't
> have both. One engine session, and if you have a bike it's the bike."* **Every configuration gets exactly
> one hard aerobic session.** The run-only athlete's is hill repeats; **this document is that session's
> protocol.** The parent doctrine's two-session table is superseded — see its §6.
>
> ⚠️ **Which makes this the ONLY configuration where the hard session carries mechanical cost.** Bike-only
> and both-modality athletes ride. **The run-only athlete is the entire reason §2, §3 and §4 exist**, and
> the only one for whom the yield order in §4 is ever reached.

> ⚠️ **These are three NEW cost rows and none has been summed.** `D-325 §1` prices `Run VO2` at **3/3/3**
> and `Run threshold` at **2/2/1**, both at flat, spec'd durations. **An uphill short-format session is a
> different session** — that is the entire argument of §2 and §3 — **so it cannot inherit the flat row's
> cost.** ⛔ D-325's *"rows are valid only at their spec'd duration"* makes this mandatory: **sum them
> against a real week before trusting any of them**, the way `strength_led`'s mech ceiling had to move
> 12 → 14 the moment it was actually checked.
>
> ✅ **"One quality session, not two" is consistent with the ledger as it stands** — a run-only athlete on
> `strength_led` has no zero-mech modality, so the second quality was already unaffordable on mech. **The
> arithmetic and the doctrine agree here without changing anything.**

---

## 6. Neuromuscular — unchanged and cheaper

**6 × 10 sec** strides *(or short hills)* at the end of **two** easy runs per week. Flat, not downhill. Full recovery.

> ⛔ **DECIDED 2026-07-26 — universal across all three configurations, and the dose is SIX REPS OF TEN
> SECONDS** *(this section originally said 20 sec; build the ten)*. **It does not count as a session** — no
> cost row, no ceiling contribution, no penalty adjacency.
>
> ⚠️ **Michael's caveat, and it is a decision not an oversight:** the run-only athlete doing hill repeats is
> **already getting some fast-leg work, so his strides matter slightly less here than in the other two
> configurations.** ⛔ **Kept anyway.** Uniform is simpler and costs nothing. **Do not remove strides from
> the run-only configuration as an optimisation.**

Volume is small enough that the eccentric cost is negligible. This element is unchanged from the parent doctrine and remains non-optional — uphill intervals defend VO2max but do not defend flat-ground turnover or economy.

> ✅ **BUILT — `session-factory.ts:359`, token `strides_NxYs`, EASY intensity, walk recovery, "Stride" label
> preserved to Garmin.** See the parent doctrine §7 box. ⛔ **Do not author a stride session.** The only
> unbuilt part is attaching it 2×/week to a `strength_primary` block — and here, **specifying flat.**

---

## 7. Ordering

Directional interference applies with one difference from the bike case.

- **Run intensity interferes bidirectionally.** Unlike cycling, it is expensive in both orders — before or after a lower-body lift.
- **Maximum separation is the only lever.** Uphill intervals and lower-body strength should be the furthest-apart pair in the week.
- Existing clearance law: run quality ≥24h from lower body. **For a run-only strength block, treat 48h as the target** and let the penalty function state the compromise when the week cannot deliver it.

> ⚠️ **The bidirectional half is already encoded** — `D-325 §5` prices `run VO2` at **+6 in BOTH orders**,
> which is this section exactly.
>
> ⛔ **The 48h target is NOT, and it is a change to the LAW, not to this doctrine.** The ≥24h clearance for
> leg-dominant quality lives in **`_shared/schedule-session-constraints.ts`** — which `D-325 §5` just named
> **the single law**, and which **the race-side optimizer also reads.** Raising 24 → 48 for run-only
> strength blocks therefore has to be a **conditional clause inside the law**, never a second number kept
> beside it. ⚠️ **Editing the law affects race plans.** That is the whole reason it was made the single
> source — and the reason this cannot be done quietly in the strength path.
>
> ✅ **"Let the penalty function state the compromise" is exactly right and needs no new machinery** —
> `place-week.ts` already emits `compromises[]` in plain words and never returns empty (`:123-127`, `:329`).
> **That contract is what D-325 §6 was corrected to preserve.**

---

## 8. What this configuration preserves and what it does not

**Preserves:** VO2max, aerobic base, structural load tolerance, flat-ground turnover via strides.

**Does not preserve:** threshold at race-relevant volume, sustained-pace durability, race economy.

**Costs relative to the bike-equipped version:** either slower training-max progression, or reduced assistance volume, or both.

Product framing, same construction as the parent doctrine:

> You keep the engine. You rebuild the race pace. Without a bike, the engine costs you some of the bar.

> ⚠️ **Copy check against `COPY-VOICE.md` before this ships.** *"Costs you some of the bar"* is figurative,
> and rule 10 bans idiom and metaphor outright. **The construction is right** — fact first, conditional
> consequence, no imperative — **and "the bar" is house vocabulary rather than an idiom**, so this is likely
> fine. Flagged because the same call was made on the Mulholland line and Michael wanted the rule visible
> when he bent it, not after.

---

## 9. Limitations — stated, not defended

1. **The gradient substitution is still an inference — but the ground under it changed on 2026-07-26.** No study has compared uphill versus level intervals *for strength-training interference specifically*, so the final step remains reasoned. ⛔ **But it is now downstream of THREE MEASURED findings** — matched-metabolic-cost load reduction at 4% and 8%, the impact transient disappearing while active force is unchanged, and knee extensor torque preserved after maximal uphill — **rather than downstream of a characterisation sentence in a paper about downhill damage.** *(The original basis, Maeo 2017 / IJSPT, compared uphill to DOWNHILL, which is not the question this document asks.)*
2. ⛔ **Grade 4–8% is the TESTED RANGE, corrected 2026-07-26** — it was logged as conventional practice and it is not. The iso-efficiency protocol ran 0%, 4% and 8%.
3. **Short-interval efficiency** is well supported for accumulating time at VO2max; its mechanical-volume advantage in a concurrent context is reasoned.
4. Parent doctrine limitations §10 apply in full — population, block duration, outcome measured, sex.

> ⚠️ **Limitation 1 is the load-bearing one and it should stay this visible.** The entire run-only
> resolution rests on an **untested inference** — and it sits downstream of the parent's **contested**
> modality claim. **Two soft joints in series.** ⛔ That is an argument for stating the doctrine plainly and
> pricing it conservatively; it is not an argument against the doctrine, which remains the best available
> answer for an athlete with no bike.

---

## 10. Provenance

| Element | Basis |
|---|---|
| **Uphill lowers loading rate and peak vertical GRF at MATCHED metabolic cost, at 4% and 8%** | ✅ **MEASURED — J Biomech 2020, iso-efficiency protocol**, 11 collegiate distance runners at 0/4/8%. **The core claim of this document, tested at the grades it prescribes** |
| **Grade 4–8%** | ✅ **THE TESTED RANGE, not convention** *(corrected 2026-07-26 — previously logged as conventional practice)* |
| **Uphill removes the impact transient; ACTIVE force unchanged** | ✅ **MEASURED — Gottschall & Kram 2005.** Impact peaks smaller than level, absent at +9°; **normal active force peaks unaffected by grade.** The damage mechanism goes, the work stays |
| **Knee extensor torque preserved after maximal uphill, reduced after downhill** | ✅ **MEASURED — Sports Med Open 2024.** The closest direct test of strength compatibility that exists |
| Uphill concentrically biased, downhill eccentrically biased | ⚠️ **Literature — Maeo et al. 2017, Vernillo et al. — but this was the WRONG COMPARISON** (uphill vs downhill, not vs level) and it is no longer what the section rests on. **Background characterisation, not a finding** |
| Downhill running as EIMD model; impairs economy for days | Literature — well established |
| **Hills do NOT defend flat speed** — different mechanics, higher step frequency, shorter stride | Literature — uphill gait mechanics. ⛔ **This is why strides are mandatory and not optional** |
| Intensity preserves VO2max | Literature — Hickson 1981/1982/1985 *(the MAINTENANCE trilogy — not Hickson 1980, which is the interference paper the code cites; see parent §3)* |
| Short intervals accumulate time at VO2max efficiently | Literature — interval-format research |
| Uphill intervals as strength-compatible run intensity | **Reasoned inference.** Not directly tested |
| Grade 4–8% | Conventional practice |
| One quality session rather than two | **Product decision**, derived from the absence of a mech-free modality |
| Ordering target 48h rather than 24h | **Product decision**, conservative extension of existing law |
| Yield order: assistance → easy volume → TM hold | **Product decision** |

---

## 11. Build summary — what this document actually asks for

Nothing here is built. In dependency order:

1. **⛔ Modality-constraint field on quality tokens** — grade for the run, cadence for the bike. **One field, both doctrines.** Must survive expansion and reach Garmin.
2. **⛔ Seconds-capable VO2 token with first-class recovery** — `run_vo2_*` is minutes-only today, so §3's default format cannot be written. **Short recovery is the mechanism, not a detail.**
3. **⛔ Suppress the pace anchor when grade is present** — `materialize-plan:1467` paces every VO2 run off 5K pace. Reuse the learned-vs-entered rendering pattern; do not invent a second vocabulary.
4. **Sum the new cost rows** — uphill short-format VO2, uphill threshold. **Do not inherit the flat rows.**
5. **48h conditional inside `schedule-session-constraints.ts`** — a clause in the single law, never a second number beside it. ⚠️ **Touches race plans.**
6. **Strides 2×/week, flat, attached to a `strength_primary` block** — the session exists; only the prescription is missing.
7. **Conditional TM advance** — ⚠️ **one wire, shared with `D-326` layer 2.** Do not build two.

⚠️ **Items 1–3 are the ones without which this doctrine cannot be prescribed at all.** Items 4–7 tune it.
