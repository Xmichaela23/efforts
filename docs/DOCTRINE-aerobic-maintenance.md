# Aerobic Maintenance Doctrine — Strength-Led Block

**Scope:** governs aerobic prescription during a strength-led emphasis block.
**Status:** doctrine. Precedes and constrains the cost ledger. Not a ledger amendment.
**Author:** Michael, 2026-07-26. **Companion:** `DOCTRINE-aerobic-maintenance-run-only.md` (no-bike case).

> ## ⛔ TRACE NOTES — added 2026-07-26 when this was filed. Michael's text is unchanged; these boxes are what checking it against the codebase and the citation register turned up.
>
> **Read these four before building anything from this document.**
>
> 1. **§5 / §11 — the Wilson 2012 modality claim is CONTESTED in this repo's own register.** Softened in
>    place below. **The direction survives; the certainty does not.**
> 2. **§7 strides — ALREADY BUILT. Do not rebuild.** `generate-combined-plan/session-factory.ts:359`.
> 3. **§5.2 cadence — the only genuinely new engine requirement in this document, and it is load-bearing.**
>    No cadence field exists on any quality token.
> 4. **§9 — UNRESOLVED against `D-325` §7.** Flagged, not silently adopted and not dropped.
>
> **And §3's governing conclusion is already shipped** — `strength-primary-plan.ts:292` already states that
> cutting intensity is what loses the aerobic base so volume is what gives, and it is already in
> athlete-facing copy at `NonRaceBuilder.tsx:817`. This document is the doctrine behind a rule the engine
> is already applying.

---

## 1. The claim

A strength-led block preserves **VO2max**. It does not preserve race pace.

Stated plainly so it is never overstated in product copy:

> You keep the engine. You rebuild the race pace.

What is preserved: maximal aerobic capacity, aerobic base, structural resilience, neuromuscular turnover.
What is not preserved: threshold expressed as a fraction of VO2max, race-specific economy, sustained-pace durability.

Both halves must appear together anywhere this is surfaced.

> ## ⛔ TWO PRODUCT PRINCIPLES, DECIDED 2026-07-26. They govern how everything in this document is SAID.
>
> ### 1. "Errs safe" is the north star — AND WE SAY SO OUT LOUD
>
> **Michael: *"errs safe is the north star — we communicate that."***
>
> Several rules in this doctrine rest on **contested or inferred** evidence: the modality preference
> (Wilson vs Schumann vs Sabag), the cadence conclusion, uphill-as-strength-compatible. **In every one of
> them the app takes the conservative side.**
>
> ⛔ **That is not a weakness to hide behind hedged copy — it is the stated posture, and it belongs in the
> athlete's view.** *"Where the evidence splits, we take the cautious side"* is a claim the app can make
> honestly and almost no training app can. **A rule that errs safe and says so is stronger than a rule that
> overclaims and gets found out.**
>
> ⚠️ **What this rules OUT:** stating a contested finding as settled to sound authoritative. **What it rules
> IN:** keeping a conservative rule even after its evidence weakens — which is exactly what was done with
> Wilson 2012 and with cadence.
>
> ### 2. The block is a DEPOSIT, not a debt — and this is under-used
>
> **The best-supported claim in the entire domain is one the app barely makes: heavy strength training
> IMPROVES endurance performance.** Cycling TTE and time-trial performance improve via efficiency and
> anaerobic power **with no VO2max change**; run and bike performance improve after prolonged submaximal
> work. **17 studies, 262 participants** — Llanos-Lagos, Ramirez-Campillo & Sáez de Villarreal 2026, *Eur J Appl Physiol* 126(1):193-222 (DOI 10.1007/s00421-025-05883-2). ⚠️ **CYCLISTS ONLY, and the authors rate the certainty of evidence LOW.**
>
> ⛔ **This is better evidence than ANYTHING the app currently says about interference — and the app leads
> with interference.** The block is currently sold **defensively** (*here is what you will not lose*) when
> the literature supports selling it as a **gain** (*here is what this buys you*).
>
> **§1's "you keep the engine, rebuild the race pace" is honest and stays.** ⛔ **But it is not the whole
> claim, and on the evidence it is not even the strongest one. Stress the deposit.**

> ⚠️ **`SCIENCE-upkeep-maintenance.md` already carries a sharper version of this split and it should be ONE
> model, not two.** It frames it as **central vs peripheral**: central (heart, stroke volume, blood volume,
> VO2max) is *systemic* and **transfers across aerobic modalities**; peripheral (sport-specific economy,
> recruitment pattern, bone loading, tendon stiffness) is *local* and **does not transfer at all**. That is
> the mechanism underneath "keep the engine, rebuild the race pace" — and it is what makes the modality
> substitution in §5 legitimate in the first place. **Reconcile the two documents before either goes
> user-facing.**

---

## 2. Why VO2max is the correct target

Three reasons, in order of strength.

1. **It is the ceiling.** Threshold is expressed as a fraction of VO2max. Let the ceiling fall and threshold has less room to reoccupy when volume returns, even if threshold work rebuilds quickly.
2. **It is the quality the evidence actually measures.** Hickson's maintenance experiments measured VO2max directly. Defending it is defending a claim with data behind it rather than an extrapolation.
3. **It is the cheapest quality to defend against a strength block.** VO2 adaptation is intensity-driven, so it survives short sessions. Delivered on the bike it carries zero eccentric cost. The system most worth holding is also the one that costs the barbell least. The physiology cooperates; this is not a compromise.

---

> ## ⛔ EVIDENCE SWEEP — 2026-07-26. Two rules LOOSEN. The patterns hold. And one citation in shipped code does not say what it is cited for.
>
> **Michael's sweep, applied. Nothing below changes a placement; it changes WHY, how hard the penalties
> should bite, and one number.**
>
> ### 1. ⛔ `6h ≈ 24h` IS WRONG ON THE AEROBIC AXIS. 6h is a FALLBACK, not a target.
>
> Robineau 2016 — **VO2peak change was higher in the 24h arm than in both 0h and 6h.** The authors call 0h,
> **and to a lesser extent twice-daily 6h**, not optimal for neuromuscular *and aerobic* improvement.
>
> ⚠️ **`place-week.ts:64-82` states the opposite in a boxed comment:** *"Six hours and twenty-four hours
> performed the same as each other."* **That is true for the strength outcome and false for the aerobic
> one.** The 6h floor stays — it is what makes a stacked day survivable — but **24h is the target and 6h is
> the fallback, and the code says they are equivalent.**
>
> ⛔ **`MIN_STACK_GAP_H = 6` does not change.** The comment above it does.
>
> ### 2. THE INTERFERENCE ARGUMENT IS SMALLER THAN THIS DOCTRINE ASSUMED — so the separation rules now rest on SESSION QUALITY
>
> Schumann 2022: **concurrent training does not compromise hypertrophy or maximal strength.** Explosive
> strength may be attenuated, **especially same-session, and independent of aerobic modality.**
>
> ⛔ **5/3/1 is maximal-strength work.** So the thing this doctrine protects is **not** being blunted in the
> way the separation rules imply.
>
> **The rules survive on a different argument: separate the sessions so the athlete performs WELL IN EACH** —
> a hard ride 24h after a heavy squat is a worse ride, and that is reason enough. **Same placement, weaker
> claim.**
>
> ⚠️ **This should change how hard the D-325 penalties bite.** They were sized against adaptation blunting.
> **Session quality is a real cost but a smaller one, and the penalty magnitudes were never re-derived after
> the reason changed.**
>
> ### 3. ⛔ THE PETRÉ 2021 CITATION DOES NOT SUPPORT THE RULE IT IS ATTACHED TO — and it is in SHIPPED CODE
>
> **Petré et al. 2021 is a strength-development meta-analysis by training status. It contains nothing on
> clearance windows.** It is currently cited for exactly that, in five places:
>
> | where | what it is cited for | athlete-facing? |
> |---|---|---|
> | `_shared/schedule-session-constraints.ts:28` | the 24h/48h gaps — **the single law** | no (comment) |
> | `_shared/week-optimizer.ts:484` | ≥24h leg-quality separation | no (comment) |
> | `_shared/week-optimizer.ts:486` | ⛔ *"the AMPK/mTOR interference"* — **a claim D-324 already STRUCK** | no (comment) |
> | `_shared/week-optimizer.ts:657` | ≥24h separation, in narration | ⚠️ **YES** |
> | `shared/strength-system/strength-primary-plan.ts:460` | ⚠️ *"back-to-back is fine"* on a lift + easy-run day | ⚠️ **YES** |
>
> ⛔ **`week-optimizer.anchor-contract.test.ts:679` PINS the citation strings**, so correcting them fails
> that test until it is updated. **That is the guardrail working, not a problem.**
>
> ⚠️ **The rules themselves are unaffected** — 24h/48h is carried by Robineau 2016 and Schumann 2022's
> same-session finding. **Only the attribution is wrong.** ⛔ **Do not weaken a placement because its
> citation was bad; replace the citation.**
>
> ⚠️ **And `strength-primary-plan.ts:460` has a second problem beyond the citation:** it tells the athlete
> back-to-back is fine, which is the **0h arm — the worst one in Robineau.** It is a lift plus an *easy*
> run rather than two hard sessions, so it is probably still right; **it is no longer SOURCED.**
>
> ### 4. THE BLOCK IS LONGER-LIVED THAN §3 AND §10 SAY — Spiering corrects upward
>
> **Endurance maintained 15 weeks on 2 sessions/week; strength up to 32 weeks on 1 session of 1 set.**
> ⛔ **This document's "4–8 weeks" was wrong and understated.** A 12-week block sits comfortably inside the
> evidence, not at its edge. **Corrected in §3 and §10 below.**
>
> ### 5. ⛔ THE MODALITY SPLIT — THREE META-ANALYSES, THREE ANSWERS, AND ONE POINTS DIRECTLY AT US
>
> **Verified against the primary abstract 2026-07-26. This is the most serious open item in the doctrine.**
>
> | meta-analysis | finding |
> |---|---|
> | **Wilson 2012** | Running interferes with strength and hypertrophy; **cycling does not.** *(what this doctrine was built on)* |
> | **Schumann 2022** *(43 studies, largest, best controlled)* | **No modality moderation at all** — results independent of aerobic mode, frequency, training status, age |
> | ⛔ **Sabag 2018** *(J Sports Sci, HIIT + RT)* | **The reverse.** Concurrent HIIT+RT lowered **lower-body strength** (ES −0.248, **p = 0.049**). By modality: **cycling ES −0.377 (p = 0.074); running ES −0.176 (p = 0.261).** ⛔ **The authors conclude that RUNNING-based HIIT with longer inter-modal rest may better preserve lower-body strength than cycling-based approaches.** |
>
> ⛔ **Sabag is on point and against us.** It is HIIT specifically, lower-body strength specifically — which
> is exactly bike VO2 inside a 5/3/1 squat-and-deadlift block. **It recommends the opposite of what this
> doctrine prescribes.**
>
> ⚠️ **Read the statistics honestly before over-reacting.** **Neither modality subgroup reached
> significance on its own** (0.074 and 0.261), the subgroups are underpowered, and comparing two subgroup
> p-values is not a test of the difference between them. **This weakens "cycling is worse"; it does not
> rescue "cycling is free."**
>
> ### ⛔ SO THE JUSTIFICATION FOR "THE BIKE WINS" HAS TO CHANGE. The decision survives; the reason does not.
>
> **Modality does not reliably predict ADAPTATION interference. Three metas, three answers, and Schumann's
> null is the best-powered estimate.** ⛔ **Stop claiming the bike protects strength adaptation.**
>
> **What actually survives, and it is stronger than what it replaces:**
>
> 1. **Cycling does not DAMAGE TISSUE.** Concentric-dominant, no impact transient, no eccentric loading.
>    ⛔ **Nobody contests this — it is biomechanics, not adaptation, and it is measured.**
> 2. **This doctrine's own EIMD receipt:** damage peaks 24–48h and produces the largest deficits in
>    **strength, speed and agility at 48h.** Running generates that; cycling largely does not.
> 3. **Session quality** — the same argument the D-325 penalty table now rests on.
>
> ✅ **This is the identical move made twice already today: keep the rule, replace the contested reason with
> the measured one.** *"Hard riding costs your legs less than hard running does"* — the D-327 intake copy —
> **is a TISSUE claim and is still true. It never said cycling protects adaptation. It was already written
> correctly.**
>
> ### ⚠️ AND THIS PROMOTES CADENCE FROM DETAIL TO MITIGATION
>
> **Reasoned, not tested, and flagged as such — but it is coherent and it matters.** If cycling HIIT does
> attenuate lower-body strength, **the most plausible mechanism is high force per pedal stroke — low-cadence,
> quad-dominant, torque work**, which is precisely what §5.2 prohibits.
>
> ⛔ **Then the ≥90 rpm constraint is not a nice-to-have. It is the thing that makes the bike-wins choice
> defensible against Sabag** — and it is currently **unbuilt and unenforceable**, because no token carries
> a cadence. **That moves §5.2 up the build order.**
>
> ### 6. ✅ THE STRONGEST CLAIM IN THE DOMAIN IS THE ONE THE PRODUCT SHOULD LEAD WITH
>
> **A strength block is a deposit, not a debt.** Heavy strength training improves cycling TTE and time-trial
> performance via efficiency and anaerobic power **with no VO2max change**, and improves both run and bike
> performance after prolonged submaximal work. **17 studies, 262 participants** — Llanos-Lagos, Ramirez-Campillo & Sáez de Villarreal 2026, *Eur J Appl Physiol* 126(1):193-222 (DOI 10.1007/s00421-025-05883-2). ⚠️ **CYCLISTS ONLY, and the authors rate the certainty of evidence LOW.**
>
> ⛔ **This is better supported than anything the app currently says about interference. Lead with it.**
>
> ### 7. THE UNSOURCED LIST, SEARCHED 2026-07-26 — four now have receipts, one came back AGAINST us, one has nothing to find
>
> | claim | verdict | what backs it |
> |---|---|---|
> | **Uphill reduces mechanical load at equal metabolic cost** | ✅ **SOURCED — STRONG** | Gottschall & Kram 2005: uphill **normal impact force peaks are smaller, and at +9° they are ABSENT**, while parallel propulsive peaks rise ~75%. A 2024 slope study states it directly — runners **decrease loading and peak vertical GRF while achieving the same metabolic stimulus as level running.** ⚠️ **But lower-limb muscle ACTIVATION is significantly higher uphill.** Impact down, muscular demand up. **Not free — cheaper on the axis we care about.** |
> | **Grade 4–8% specifically** | ⚠️ **STILL CONVENTION** | The direction is sourced; the band is not. Tested gradients cluster higher (+9° ≈ 15%). **4–8% remains a product decision.** |
> | **Strides ~10 sec** | ✅ **SOURCED — the mechanism is exactly the argument** | The ATP-PCr (alactic) system powers maximal effort **up to 8–10 sec** and depletes there; efforts under ~20 sec produce little lactate, hence little fatigue. ⛔ **And the conventions are separate, which is precisely Michael's correction: strides 15–20 sec, SHORT HILL SPRINTS 8–10 sec.** The 10 is the hill-sprint number and it is the right one. |
> | **⚠️ NEW — recovery between reps must be PASSIVE** | ✅ **SOURCED, and the doctrine does not say it** | Active recovery **delays PCr resynthesis and pushes the work into the glycolytic zone** — which converts strides into a session, the one thing §7 requires they never become. **"Full recovery" is not specific enough. Say passive.** |
> | **Eccentric damage peaks 24–48h** | ✅ **SOURCED — and it lands on 48** | EIMD markers peak **24–48h**; DOMS peaks 24–72h; **the largest deficits in strength, speed and agility are at 48 HOURS**; recovery days 5–7. ⛔ **This is the first real receipt under the 48h clearance**, which until now rested on a miscitation. |
> | **⛔ Cadence ≥90 rpm** | ⛔ **CONTESTED — and part of it points the WRONG WAY** | ✅ The **force** half holds: low cadence means dominant pushing forces and higher force per stroke. ⛔ **But the fatigue half is contradicted — cycling at 60 rpm induces LESS neuromuscular fatigue than 90 or 120 rpm, and high-cadence high-intensity work impaired MORE neuromuscular function than low-cadence.** See the box below. |
> | **Coffey & Hawley 2017** | ⛔ **REAL PAPER, WRONG ATTACHMENT — same fault as Petré 2021** | *Concurrent exercise training: do opposites distract?* (J Physiol 595:2883-2896) is a genuine and relevant interference-mechanism review. **It is cited in `schedule-session-constraints.ts:28` and `week-optimizer.ts:484` for the 24h/48h spacing rules, and it contains nothing on session spacing, recovery windows or hours between sessions.** |
> | **Every ceiling in D-325** | ⚠️ **NOTHING TO FIND, and that is expected** | D-325 §2 already states they are calibrated empirically against known-good weeks rather than derived. **Confirmed: there is no literature under them.** Acceptable *only* while they stay calibrated-not-derived — which is exactly why **Q-205** (two of three sets never summed) matters. |
>
> ### ⛔ THE CADENCE FINDING IS THE SERIOUS ONE — it undercuts the assumption `mech 0` rests on
>
> §5.2 argues: high cadence → low force per stroke → cardiovascular load without muscular tension →
> does not compete with the bar. **The first link is sourced. The last is now contested.**
>
> **What the literature actually says:** low cadence produces higher pedal force (**supports us**), *and*
> **60 rpm induces less neuromuscular fatigue than 90 or 120 rpm** (**against us**), *and* high-cadence
> high-intensity cycling impaired neuromuscular function **more** than low-cadence (**against us**).
>
> ⚠️ **These may not be in conflict — they are different axes.** Force per stroke is the proxy for *tension
> competing with a squat*; the fatigue findings are largely central and coordinative, which is a different
> question from *will this cost me on the bar in 48 hours*. **But the doctrine asserts the conclusion, not
> the mechanism, and the conclusion is what is contested.**
>
> ⛔ **Do not delete the cadence prescription — 95–105 rpm is standard practice for VO2 intervals and errs
> safe on the axis we care about. Do stop asserting it protects the legs as though it were established.**
> **This is Michael's call, and it is the same call as Wilson 2012: keep the rule, downgrade the claim.**

---

## 3. Evidence base

**Hickson, three experiments.** Same 10-week base build, then 15 weeks with one variable reduced.

| Variable cut | Manipulation | VO2max outcome |
|---|---|---|
| Frequency | 6 d/wk → 4 or 2 | Held at trained levels, both arms, 15 weeks |
| Duration | 40 min → 26 or 13 | Held in both arms |
| Intensity | −⅓ or −⅔ work rate | **Not held.** Declined at −⅓, declined further at −⅔ |

Hickson & Rosenkoetter 1981 (frequency); Hickson et al. 1982 (duration); Hickson et al. 1985 (intensity).

**Governing conclusion:** intensity is the protective variable. Frequency and duration are the expendable ones.

**Spiering et al. 2021 (review):** ⛔ **corrected 2026-07-26 — this said "4–8 weeks" and understated it.**
**Endurance maintained 15 weeks on 2 sessions per week; strength maintained up to 32 weeks on 1 session of
1 set** — provided intensity stays high. ✅ **A 12-week block sits comfortably inside the evidence base
rather than at its edge.**

> ⛔ **"HICKSON" IS AMBIGUOUS IN THIS REPO AND THE TWO MEANINGS ARE NEARLY OPPOSITE. Disambiguate on sight.**
>
> - **Hickson 1980** — the *interference* paper. This is what the CODE cites:
>   `schedule-session-constraints.ts:27`, `week-optimizer.ts:483/657/684`, `science.ts:5`,
>   `generate-combined-plan/index.ts:5`. ⚠️ The register notes its dramatic result came from **~11
>   sessions/week in untrained subjects**, and that every better-controlled meta since has narrowed it.
> - **Hickson 1981 / 1982 / 1985** — the *maintenance* trilogy. This is what THIS document cites, and it is
>   a different question with a different answer.
>
> **A bare "Hickson" in a code comment or a doc is unresolvable today.** This is the first thing a
> bibliography fixes.

---

## 4. Stated precondition — easy volume is assumed, not optional

**This doctrine assumes the athlete continues easy aerobic volume throughout the block.** Every conclusion below is conditional on it.

Intensity and volume defend different things. They are not substitutes.

| Quality | Defended by | Evidence |
|---|---|---|
| VO2max | Intensity | Held under frequency and duration cuts; lost under intensity cuts |
| Long-duration endurance | Volume | Hickson 1982: dropped ~10% in the 13-min arm, held in the 26-min arm |
| Capillarization, mitochondrial density | Volume | Standard base-training literature |
| Tendon and structural load tolerance | Volume | Detraining literature; structural stiffness decays on withdrawal |
| Fat oxidation at submaximal intensity | Volume | Base-training literature |

Note that Hickson's reduced arms **still trained**, at intensity, 2–4 days per week. None of these findings describe an athlete who stopped.

**Consequence:** a strength block with quality sessions but no easy volume does not satisfy this doctrine. It preserves the ceiling and loses the floor. Quality endurance is a privilege of an existing aerobic base, not a method of building or holding one.

---

## 5. Modality doctrine

**Bike carries the intensity. Run carries the volume.**

| | Mechanical cost to strength | Role in block |
|---|---|---|
| Bike intensity | ~0 | Primary VO2max defence |
| Run intensity | High (eccentric) | Minimised; strides only |
| Easy run volume | Low | Base maintenance, structural load |
| Easy bike volume | ~0 | Base maintenance, no structural load |

Cycling does not meaningfully attenuate strength or hypertrophy adaptation; running does (Wilson et al. 2012, modality separation). Encoded as zero rather than a small number, deliberately.

> ## ⛔ THE MODALITY CLAIM IS CONTESTED. The architecture survives; the certainty does not.
>
> `SCIENCE-concurrent-training-interference.md`, **2026-07-19 addendum**: Wilson 2012 found the modality
> split, but **Schumann et al. 2022 (*Sports Med*, 43 studies — larger and better-controlled) found NO
> modality moderation** at all. Results independent of aerobic mode, frequency, training status and age.
>
> **The register's verdict is a standing instruction:** *"Treat as a plausible mechanism with split
> meta-analytic support, not a settled rule… do not cite it as established, and do not build a NEW claim on
> it."*
>
> **What this changes here:**
> - The **direction** stands — the eccentric-damage mechanism is credible and the rule errs safe.
> - *"Encoded as zero rather than a small number, deliberately"* **is exactly the new claim the register
>   forbids.** In `D-325 §5` the reverse-order discount was consequently priced at **+1, not 0**. The cost
>   table's existing `bike mech 0` is pre-existing and untouched — but **it is now the load-bearing
>   assumption of two doctrines, and it is resting on split evidence.**
> - ⚠️ **The expensive direction is UNAFFECTED** — cycling power impaired 24–48h post-heavy-lower is
>   Robineau 2016 / Petré 2021, which the register marks **§4 CONFIRMED and sharpened.** The asymmetry in
>   §8 is safe.
>
> **There is a better claim available and the register names it.** Strength training *improves* running
> economy and cycling efficiency with VO2max unchanged — the best-supported material in the domain — and
> the honest frame for a hybrid app is **credit, not hazard** (D-306). **Lean the product voice on that,
> not on modality separation.**

### 5.0 ⛔ ONE SESSION A WEEK IS A MAINTENANCE DOSE, NOT A GAINS DOSE — and the product must never say otherwise (sourced 2026-07-26)

**Michael asked: are there any gains? The honest answer on the aerobic side is NO, and that is exactly what
this doctrine claims.**

- **One HIIT session per week is BELOW the improvement threshold for trained athletes.** Multiple studies
  show no meaningful VO2max enhancement at once- or twice-weekly interval training. **2–3 sessions per week
  is the effective range for gains**, with little added benefit past two for many people.
- ✅ **But roughly one session every 1–2 weeks is sufficient to PRESERVE existing fitness** — which is the
  whole claim of §1, and it now has a number under it.

⛔ **So the block does not build the engine. It holds it. Any copy promising aerobic improvement during a
strength-led block is unsupported** — and the athlete will not feel it, which is the worse half.

### ✅ WHERE THE GAINS ACTUALLY ARE — and this is the deposit claim, not a consolation prize

1. **The bar.** It is a strength block. That is the gain, and it is the point.
2. **Economy and efficiency, which show up as ENDURANCE PERFORMANCE with VO2max unchanged.** Heavy strength
   training improves cycling TTE and time-trial performance, and improves run and bike performance after
   prolonged submaximal work — VO2max flat throughout. **17 studies, 262 participants** — Llanos-Lagos, Ramirez-Campillo & Sáez de Villarreal 2026, *Eur J Appl Physiol* 126(1):193-222 (DOI 10.1007/s00421-025-05883-2). ⚠️ **CYCLISTS ONLY, and the authors rate the certainty of evidence LOW.**

⛔ **That is the honest product sentence, and it is well evidenced: the engine holds, the bar goes up, and
the endurance performance gain arrives through efficiency rather than through VO2max.** ⚠️ **"No VO2max
change" is not a caveat to bury — it is the mechanism.**

### 5.0.1 WENDLER'S OWN POSITION — he requires conditioning, and it does NOT conflict with one hard session

**Michael: *"Wendler says we need them."* He does. Checked, and the apparent conflict dissolves.**

| Wendler | this doctrine | reconciled? |
|---|---|---|
| **2–4 conditioning sessions per week, mandatory, on off-days** | **4 endurance sessions** — long run + 2 easy runs + 1 quality | ✅ **Yes.** Wendler counts **easy work as conditioning** — weighted-vest walks, moderate stationary bike, sled. **Only one of ours is hard; his are not all hard either.** The counts already match |
| *"Hard/easy — follow hard lifting days with easy conditioning, and vice versa"* | separation by clearance law, quality furthest from lower-body days | ✅ **Same rule, his words** |
| ⛔ *"Jim likes hill sprints, just **never the day before lower body training**"* | run quality is expensive in BOTH orders; maximum separation | ✅ **CORROBORATION FROM THE PROTOCOL'S AUTHOR, and it is DIRECTIONAL** — a specific before-lower-body rule, which is the same shape as D-325's ordered pairs |
| ⚠️ **Hill sprints are NOT recommended in *Building the Monolith* — "too taxing alongside this training volume"** | hills are the DEFAULT run quality | ⚠️ **A real boundary condition** — see below |

⛔ **THE CAUTION, AND IT SHOULD NOT BE BURIED.** Wendler pulls hill sprints specifically when strength
volume is very high. **Monolith is a high-volume SIZE program, not standard 5/3/1**, so it is not this
block — **but it establishes that the protocol's own author treats hill work as something that comes out
when the bar gets heavy enough.** ✅ **This is the same yield order §4 of the run-only companion already
specifies; it is not a contradiction. It is confirmation that the yield exists and that someone who knows
the program reaches for it.**

### 5.0.2 ⛔ WHAT THIS BLOCK ACTUALLY TAKES FROM 5/3/1, AND WHAT IT THROWS AWAY

**Michael, 2026-07-26: *"we aren't building [the engine], and he's not wrong — but we are hijacking his
strength gains and stripping the size work. And if you want the size, you aren't going to be punching in
the hard days."***

**That is the design premise stated plainly, and it should be written where a builder will find it.**

| 5/3/1 component | this block | why |
|---|---|---|
| **The main lifts — the progression** | ✅ **KEPT WHOLE.** Four days, top sets, the working number climbing | This is the gain. It is what the athlete came for |
| **Assistance / accessory volume — the size work** | ⛔ **STRIPPED to three slots with bodyweight defaults** | It is the cheapest thing to remove and contributes least to the main lifts |
| **The freed budget** | → **endurance maintenance** | The engine holds because the size work paid for it |

⛔ **THE TRADE IS ZERO-SUM AND THE ATHLETE MUST BE TOLD: the size work and the hard conditioning day are
bidding for the same recovery. You do not get both.** ⚠️ *"If you want the size, you aren't punching in
the hard days."*

✅ **AND WENDLER'S OWN CATALOGUE BRACKETS THIS EXACTLY — it is the strongest support in this section:**

- **Standard 5/3/1** — moderate assistance, **conditioning mandatory, hill sprints endorsed.**
- **Building the Monolith** — high assistance volume for SIZE, and **hill sprints removed as too taxing.**

⛔ **Same author, same main lifts, and the hard conditioning comes out precisely when the size volume goes
in.** **This block is the first one deliberately.** An athlete who wants the second one is not
under-served — **they are asking for a different block, and the app should say so rather than trying to
give them both.**

### ⚠️ ONE PRECISION THAT CHANGES WHAT THE APP MAY PROMISE — say STRENGTH, not POWER

**"Power" in gym vernacular means strength. In this literature it does not, and the difference is the
single surviving interference effect.**

- ✅ **Maximal strength and hypertrophy: NOT compromised by concurrent training** (Schumann 2022 — SMD
  −0.06 and −0.01, both null). ⛔ **5/3/1's top sets are maximal-strength work. That is why this block
  works at all.**
- ⛔ **Explosive strength / rate of force development: ATTENUATED** (SMD −0.28, p=0.007). **It is the ONLY
  effect that survived the best-controlled review.**

⛔ **So the app may promise STRENGTH and must not promise POWER.** An athlete chasing explosive
qualities — jumping, sprinting, Olympic derivatives — **is in the one category concurrent training
measurably harms**, and this block is the wrong block for them. **Say it rather than let them find out.**

### 5.0.3 THE COPY — approved 2026-07-26. This is the trade said out loud, at the point it is made.

**⛔ The choice already exists structurally and says nothing today.** The intake lets an athlete decline a
hard day simply by not picking one — **so the state is reachable and unremarked.** This is the copy for it.

**At the hard-day pick:**

> **One hard day**
> The engine holds and the bar keeps climbing. Accessory work stays light — that's what pays for it.
>
> **No hard day**
> The volume goes to size instead. The aerobic base drifts over twelve weeks and comes back when the
> running does.
> **Want full bro? Skip the hard sessions.**

⚠️ *"comes back when the running does"* is **lifted verbatim from the existing volume screen** so the two
read as one system. **Do not reword it in one place only.**

**Near the goal card — eight words, and it is the one promise the research forbids:**

> This block builds strength, not explosive speed.

**At the run-quality pick** *(run-only athletes — see the run companion §2.0)*:

> **Hill repeats** — Same effort, less load on the legs, so more of the week is left for the bar. Hills
> don't hold your flat race pace; the strides on your easy runs do that.
>
> **Flat repeats** — Holds sustained race pace, which hills don't. Costs more in the legs, and on this
> block the lifting is what pays for it.

### ⚠️ *"Want full bro? Skip the hard sessions."* — A DELIBERATE `COPY-VOICE` RULE 10 BEND. Michael's call, made knowingly.

⛔ **Do not "clean this up" into house voice. It was chosen over an in-voice alternative that was offered
and declined** (*"Chasing size? Skipping the hard day puts that volume into the lifts."*).

**Why it is defensible:** rule 10 bans idiom because idiom is usually **empty filler** — sentences that
cost nothing and say nothing. **This one names a real, zero-sum trade in five words**, and it lands as an
aside on a choice the athlete has already made rather than as the app being clever at them. **Metaphor
doing work, not decoration** — the same test the Mulholland dialog was argued under.

⚠️ **Placement is load-bearing: it is the SECOND line under "No hard day", never its own moment.** As a
dialog or a standalone prompt it becomes the app talking down to the athlete. As a closing aside it is a
wink at a decision already taken.

⛔ **Noted for the record: this is the second rule-10 bend in one day. The first — the Mulholland
dialog — was deleted by Michael the same morning as "a late night fun thing, not necessary."** Both calls
were his and both were deliberate. **If this one is ever cut, cut it for the same reason and say so here.**

### 5.1 Bike VO2 over bike sweet spot

In a time-constrained strength block, **bike VO2 defends fitness more efficiently than bike sweet spot.**

- VO2 adaptation is intensity-driven. ~20 min of work at 115–120% FTP is a complete stimulus.
- Sweet spot adaptation is volume-driven — mitochondrial density, lactate clearance, capillarization. It tracks accumulated time at intensity. A truncated sweet spot session is a truncated stimulus, not trimmed fat.

Shortening both symmetrically undercuts the bike side disproportionately. The correct short-block move is to **switch the bike from sweet spot to VO2**, not to shorten sweet spot.

> ⚠️ **Sweet spot is documented at 88–94% FTP (`session-factory.ts:615`) and the VO2 band at 110–120% FTP
> (`materialize-plan/index.ts:1660`).** This section's 115–120% sits inside the existing band — **no engine
> change needed for the intensity itself.** The switch logic is what does not exist.

### 5.2 Cadence constraint — required

> ## ⛔ REVISED 2026-07-26 — PRESCRIBE THE CUE, NOT THE NUMBER. Michael: *"instead of assigning a cadence number we suggest a fast easy spin?"*
>
> **The prescription is "a fast, easy spin — spin it, don't grind it."** The numbers below are retained as
> the *engineering* range and the analysis threshold; **they are not what the athlete is told.**
>
> **Three reasons, and the third is the one that decides it:**
>
> 1. ⛔ **There is no source for 90.** It was on the unsourced list and it stayed there — the force-per-stroke
>    mechanism is supported, the specific threshold is invented. **`SCIENCE-concurrent-training-interference.md`
>    already rules on this class of number: *"any numeric threshold the app states would be invented… say it
>    as a tendency, never with a number."*** A cue claims exactly the precision the evidence has.
> 2. **This is D-326's argument, applied to the bike.** That entry replaced a numeric RIR prompt with three
>    words because *"a lifter mid-set does not reliably separate an 8 from an 8.5"*, and because the
>    precision was unusable. **Same shape: the athlete cannot act on 90 vs 88, and the app cannot defend the
>    difference.**
> 3. ⛔ **MOST RIDERS CANNOT MEASURE IT.** Cadence needs a sensor. Outdoors, without one, **"≥90 rpm" is a
>    number the athlete cannot follow and will ignore** — and an instruction that is routinely ignored
>    trains them to ignore the rest. **"Fast, easy spin" works on any bike, indoors or out, sensor or none.**
>
> ⚠️ **The number does NOT disappear — it moves to the analysis side.** When cadence data exists, it can
> confirm what was actually done (D-325 §9 recost). ✅ **Words on the way out, number on the way back in if
> the data is there** — the app's existing measured-vs-inferred pattern, not a new one.
>
> ⛔ **AND THE DOCTRINE'S OWN ONE-LINER IS ALREADY THE RIGHT COPY:** *tire the aerobic system, not the legs.*

**Engineering range (not athlete-facing): ≥90 rpm, preferred 95–105.**

Same wattage, two different sessions:

- **High cadence (95–105 rpm):** low force per stroke, high stroke count. Cardiovascular load, minimal muscular tension. Intended.
- **Low cadence (60–70 rpm) at identical power:** high force per stroke. Torque work, quad-dominant, competes directly with the bar.

The mech-0 assumption the entire model rests on is a **cadence-conditional** assumption. Grinding a big gear at 118% FTP breaks it. The cost table row is not "bike VO2" — it is "bike VO2 at ≥90 rpm."

Doctrine in one line: **tire the aerobic system, not the legs.**

> ## ⛔ THIS IS THE ONLY GENUINELY NEW ENGINE REQUIREMENT IN THIS DOCUMENT, AND IT IS UNBUILT.
>
> **No cadence field exists on any quality token.** Traced 2026-07-26: `materialize-plan` and
> `session-factory` carry no `cadence` / `rpm` on any bike quality row.
>
> ## ⛔ AND THE ONE CADENCE THE APP DOES PRESCRIBE IS THE OPPOSITE OF THIS. Re-read 2026-07-26 in light of the cue.
>
> **`session-factory.ts:576`, the Z2 endurance ride: *"Aerobic endurance ride at Z2. Maintain 60–70 rpm
> cadence. Nutrition practice: eat every 40–45 minutes. No surges."***
>
> ⛔ **60–70 rpm is torque work.** It is the low-cadence, high-force-per-stroke pattern this section names
> as the failure mode — **prescribed by name, on the easy ride, in the athlete's own session text.** It is
> the literal opposite of *"a fast, easy spin."*
>
> ⚠️ **It matters less than it looks: forces are far lower at Z2 than at 118% FTP, and there is a real
> tradition of deliberate low-cadence torque work in cycling.** So this is **not** presented as a bug. **But
> it is a direct contradiction in athlete-facing copy** — one screen says grind, the doctrine says spin —
> and on a **strength block** the grinding version is quad-dominant work stacked on top of squats and
> deadlifts, which is the one context where it is clearly wrong.
>
> ⛔ **Decide it before either ships:** either the Z2 line is scoped so it does not apply during a
> strength-led block, or it changes. **Do not ship both sentences.**
>
> **Why this is not a detail:** `mech 0` for bike is the assumption the whole ledger rests on, and this
> section says that assumption is **conditional on a number the app cannot currently express, let alone
> enforce.** A token that cannot carry `≥90 rpm` is a token whose cost row is unverifiable.
>
> ⚠️ **The run companion has the identical hole** — grade has no field either. **One fix serves both: a
> modality-constraint field on quality tokens.** See `DOCTRINE-aerobic-maintenance-run-only.md` §2.

### 5.3 What bike intensity does not cost, and what it does

- **No eccentric component** → no muscle damage, no DOMS, no repair cost competing with strength adaptation.
- **Glycogen depletion is real.** A hard VO2 session leaves the athlete underfuelled for a lower-body lift placed too close. This is a fuelling and spacing problem, not an interference one, and should not be priced as interference.

---

## 6. Dose

> ## ⛔ DECIDED 2026-07-26 — ONE HARD AEROBIC SESSION. NEVER TWO. This supersedes the split-budget table below.
>
> **Michael:** *"You can't have both. One engine session, and if you have a bike it's the bike."*
>
> | What the athlete has | Their hard session |
> |---|---|
> | Bike only | Bike intervals |
> | Run only | Hill repeats |
> | **Both** | **Bike intervals** |
>
> **"Both" does not mean two. It means a choice, and the bike wins** — hard cycling does not beat up the
> legs, hard running does. **So the running stays easy and the bike does the hard work.**
>
> ⚠️ **This is why the running cyclist "gets nothing added."** He already has the better option. Adding hill
> repeats on top would be a **second hard session competing with the lifting** — which is the thing this
> doctrine exists to prevent.
>
> ### ⛔ WHAT THIS DOES TO THE LEDGER — and the precision here matters (Michael, 2026-07-26)
>
> **The two-quality case is not a state the LEDGER closed. It is a state the DOCTRINE closed.** So the
> ceilings are now **unreachable by construction** in a strength-led block, not merely unreached in practice.
>
> ⛔ **That is a bigger deal than it sounds. Every ceiling in the system was calibrated to bind at exactly
> one margin, and that margin no longer exists on this block.** Consequence, stated plainly:
>
> > **`strength_led` 14 / 8 / 9 does NOTHING at `on_target`. No verdict, no placement change, no refusal.**
>
> Stock 12/4/7 plus any single quality lands inside it every time — bike VO2 → 12/7/9, sweet spot →
> 12/6/8, threshold run → 14/6/8. **The ceiling is inert.**
>
> **What survives is `elevated` and `high`, where the STOCK WEEK ITSELF breaches** (at `high`, ceilings drop
> to 10/4/5 against a stock week of 12/4/7). ✅ **And that was always the more honest job for it: the
> ledger's remaining function on a strength block is to notice that the BASE is too much — not that the
> extras are.**
>
> ⚠️ **THE CLEANUP THAT MATTERS IS THE UNREACHABLE STATES, NOT THE STALE EXAMPLES.** *"A rule describing a
> state nobody can reach is the thing that gets tuned by someone in six months who assumes it fires."*
> **Marked at `D-325` §2, §7 and §8** — those clauses stay live for `balanced` and `endurance_led`, where
> two qualities is still a real configuration, and are flagged unreachable for `strength_led`.
>
> **The table below is retained as the working-time reference it always was. The configuration column is
> dead; the durations are not.**

Weekly intensity is a single budget. **It is not split across modalities — it is spent on one session.**

| Athlete has | The hard session | Duration |
|---|---|---|
| Bike only | Bike intervals — sweet spot | 90 min (full volume stimulus intact) |
| Bike only, time-constrained | Bike VO2 *(see §5.1 — switch, don't shorten)* | 30 min |
| Run only | Hill repeats *(see the run-only companion)* | ~35–40 min |
| **Both** | **Bike intervals. The run stays easy.** | as above |

Working time, which is the unit that matters:

| Session | Work time | Structure |
|---|---|---|
| Threshold run 45 | ~22 min | 3 × 8 min |
| Threshold run 30 | ~15 min | 2 × 7 min |
| Sweet spot 90 | ~45 min | 3 × 15 min |
| Sweet spot 60 | ~30 min | 2 × 15 min |
| Bike VO2 30 | ~16–20 min | 4–5 × 4 min @ 115–120% FTP · **3 min active recovery** · **≥90 rpm** |

> ## ✅ THE 4 × 4 IS THE BEST-VALIDATED VO2max PROTOCOL THERE IS — sourced 2026-07-26
>
> **Helgerud et al. 2007** — **4 × 4 min at 90–95% HRmax with 3 min ACTIVE recovery at 60–70% HRmax**,
> ~38 min total including warm-up and cool-down. **~7% VO2max improvement in 8 weeks in 40 trained men**,
> superior to moderate continuous training and to lactate-threshold work. **The 4-minute bout is long
> enough to hold the heart near maximum stroke volume**, which is the mechanism.
>
> ⛔ **This doctrine's 4–5 × 4 min IS the Helgerud protocol. It stops being a product decision and becomes
> the most replicated interval prescription in endurance science.** Provenance corrected.
>
> ### ⚠️ Two corrections the source forces
>
> 1. **Recovery is 3 minutes and it is ACTIVE** (60–70% HRmax). The dose table never specified recovery.
>    ⛔ **Note the deliberate contrast with strides (§7), where recovery must be PASSIVE** — different
>    energy system, opposite requirement. **Do not unify them.**
> 2. ⚠️ **115–120% FTP is at the hard end for a FOUR-MINUTE rep.** Helgerud anchors to **90–95% HRmax**, not
>    to FTP. `materialize-plan:1660` already expands `bike_vo2_*` at **110–120% FTP**, and for 4 × 4 the
>    **lower half of that band is the realistic one** — 120% for four minutes, repeated five times, is
>    closer to a 2–3 minute effort and most athletes will not complete the set. **Prescribe 105–115% for
>    4-minute reps, or anchor to HR as Helgerud does.**

Session length is warm-up plus work plus cool-down. A 45 → 30 min cut removes roughly one third of *working* time — the same proportion Hickson removed from duration without cost. It is not a one-third intensity cut, which is the manipulation that failed.

**Duration tiers are separate rows in the cost table, each with its own cost.** Duration does not float within a row.

> ⚠️ **`D-325 §1` currently has ONE row each for `Bike VO2`, `Bike sweet spot` and `Run threshold`, spec'd
> at a single duration** (threshold run 45 min, sweet-spot ride 90 min). **This section requires additional
> rows** — threshold 30, sweet spot 60, bike VO2 25 and 30 — **each with its own cost, and none of them
> exist yet.** ⛔ D-325's *"rows are valid only at their spec'd duration; duration must not float"* is the
> rule that makes this mandatory rather than optional. **The cost of each new row has to be summed, not
> assumed.**

---

## 7. Neuromuscular addendum — required, non-optional

Twelve weeks without fast running costs running economy and turnover **even with VO2max fully intact**. Neither bike work nor threshold running defends it.

> ## ⛔ DECIDED 2026-07-26 — UNIVERSAL. Every athlete, all three configurations. This is the one thing that does not vary.
>
> **Prescription: short hills or strides at the end of two easy runs. Six reps, ten seconds. Full recovery.**
>
> ⛔ **TEN SECONDS, AND THE NUMBER IS THE WHOLE POINT — DO NOT ROUND IT UP.** *(Written here first as 20 sec
> and corrected by Michael, with the reason:)*
>
> - **10 sec is the NEUROMUSCULAR version** — near-max turnover, **alactic**, finished **before fatigue can
>   change the mechanics.**
> - **20 sec drifts into something else.** Still fast, but the athlete **slows across the rep**, and the last
>   few seconds are **teaching the legs a stride pattern under fatigue. Which is the opposite of the point.**
>
> ⚠️ **The 20 came from citing the wrong convention.** Conventional practice for **strides** is 20 sec;
> conventional practice for **hill sprints** is **8–10.** This prescription is the second thing wearing the
> first thing's name. **Provenance corrected accordingly.**
>
> **Michael:** *"It's the one thing that's universal… it doesn't count as a session."*
>
> **Why universal, and this is the whole argument:** **neither bike intervals nor hill repeats keep the legs
> fast on flat ground.** That is a **separate quality**, and it **decays quietly over twelve weeks while
> everything else looks fine** — VO2max intact, the gauge green, turnover gone. **Strides are the only thing
> that defends it, and they cost nothing.**
>
> ⛔ **It does NOT count as a session and must never be priced as one.** No cost row, no ceiling
> contribution, no penalty adjacency. **The moment it costs something, it becomes the thing the athlete
> drops** — and it is the cheapest item in the doctrine.
>
> *(One caveat Michael named and then set aside: the run-only athlete doing hill repeats is already getting
> some fast-leg work, so **his strides matter slightly less.** Kept uniform anyway — simpler, and there is
> no cost to it. ⛔ **Do not "optimise" this by removing strides from the run-only configuration.** That is
> the decision, not an oversight.)*
>
> ### ⚠️ THE EXPOSURE THIS CREATES — recorded as a known limit, NOT to be solved with a mechanism
>
> **No cost row means ingest cannot recost it either.** `D-325 §9` recomputes a session's vector from what
> was **executed** — but strides have no row to recompute into. **Six hill sprints logged as part of a run
> appear as easy volume, and that is correct.**
>
> ⛔ **The failure case: an athlete does twelve of them at twenty seconds and the ledger sees nothing.** That
> is real hard work, invisible to the model, and it fails in the same direction as every other gap in §9 —
> **silently, always by under-costing.**
>
> ✅ **Accepted. Low stakes at this dose, and a line in the doc is the right response — not a mechanism.**
> Pricing strides to close this would cost the thing the exemption exists to protect: **the moment strides
> cost something, they become the first thing an athlete drops.**

Negligible mechanical cost, negligible time. This is the only element in the block that keeps the legs remembering how to move fast, and it is the cheapest item in the doctrine.

> ## ✅ ALREADY BUILT — THIS IS A WIRING JOB, NOT A BUILD. Do not author a stride session.
>
> `generate-combined-plan/session-factory.ts:359` — **RUN-PROTOCOL §5.8**, a first-class stride block
> appended to an easy run. Token **`strides_NxYs`**, resolved into work + walk-recovery steps.
> **Intensity stays EASY on purpose** — *"strides are accelerations, not speedwork"* — which is precisely
> the property this section needs.
>
> ⚠️ It also survives the trip to the watch: `send-workout-to-garmin/index.ts:722` **preserves the
> "Stride" label** so it does not render as a generic interval, and `:1051` maps stride intensity to
> `ACTIVE`, not high-intensity.
>
> **The unbuilt part is only the strength-block prescription** — 2×/week, attached to the easy runs of a
> `strength_primary` block. The session itself exists and works.

---

## 8. Ordering

Interference is **directional**. Both existing tables encoded it as symmetric adjacency; that is the error.

- **Bike quality after lower-body strength:** expensive. Cycling power is impaired 24–48h post-heavy-lower (Robineau 2016, Petré 2021). The ride is compromised.
- **Lower-body strength after bike quality:** cheap. Cycling does not attenuate strength adaptation.
- **Run VO2:** expensive in both orders. Interferes bidirectionally.

**Practical placement:** bike quality precedes the lower-body lift in the week, never follows it closely.

> ✅ **THIS IS BUILT AS DOCTRINE ALREADY — `D-325 §5`, rewritten 2026-07-26 to ordered pairs.** The penalty
> table there is the encoding of this section: `lower → bike VO2` **+4**, `lower → bike sweet spot` **+3**,
> the reverse order **+1** *(not 0 — see the §5 warning box)*, `run VO2` **+6 in both directions**.
> ⛔ **`_shared/schedule-session-constraints.ts` remains the single law; the penalty table is a rendering of
> it, never a second ranking.**

---

## 9. Design inversion this doctrine forces

Quality endurance has been treated as an optional addition the weekly budget permits when there is room. **That is backwards.**

For a block intending to preserve aerobic fitness, quality is the load-bearing element and easy volume is the negotiable margin. Intensity is the variable that cannot be cut without loss.

**Required change:** ceilings must be arranged so that easy volume is what yields when a week is full — not the quality session. Current ceilings do the opposite. This is a design error, not a calibration error.

> ## ⛔ UNRESOLVED AGAINST `D-325 §7`. Recorded open, deliberately — NOT adopted, NOT dropped.
>
> **The two cannot both hold as written:**
> - **This section** says easy volume is the negotiable margin and must be what yields when the week is full.
> - **`D-325 §7`** says ⛔ *"never silently remove or shrink a session to fit. The athlete added it; the app
>   says what it costs."*
>
> **If easy volume yields, something drops the easy run — and §7 forbids the app doing it silently.** So it
> is one of two things, and it is Michael's call:
>
> 1. **The athlete is asked**, and the app states the trade rather than making it. *(Consistent with §7,
>    with D-315 consent-first, and with the "states cost, never refuses" posture. Costs a decision point in
>    the flow.)*
> 2. **§7 gets an explicit exception for easy volume** — the one session class the app may reduce on its
>    own, because this doctrine designates it the margin. *(Cheaper in the flow. Needs writing into §7 as a
>    named exception, or it reads as the app quietly shrinking work the athlete asked for — the exact
>    failure §7 exists to prevent.)*
>
> ⚠️ **Do not resolve this by re-tuning the ceilings.** The `strength_led` cardio ceiling of 8 is a
> **dose cap**, deliberately (`D-325 §2`) — moving it to make quality fit would silently convert a product
> boundary into a physiology claim, which is the specific confusion that section was written to prevent.
>
> ⛔ **This changes what the ledger DOES, not what its numbers are. It is a bigger change than a
> coefficient, and nothing here is built yet — so it is cheap to decide now and expensive to discover
> later.**

---

## 10. Limitations — stated, not defended

1. **Population.** Hickson's subjects were recreationally active, not deeply trained. Highly trained athletes lose fitness faster on withdrawal but also hold better at a given maintenance dose. Direction holds; magnitude is uncertain.
2. **Duration.** ⛔ **Corrected 2026-07-26 and it LOOSENED.** The evidence base covers **15 weeks of endurance maintenance on 2 sessions/week and up to 32 weeks of strength maintenance (Spiering)**, plus 15 weeks in Hickson's recreationally trained population. **A 12-week block is comfortably inside it — the earlier "4–8 weeks" was wrong.** The population still does not match. **The mid-block aerobic check is now a smaller argument than it was**, but still worth having, structurally parallel to the week-3 95% gate on the bar.
3. **Outcome measured.** VO2max. Threshold and running economy were not tested and do not behave identically. Section 1's second half exists because of this.
4. **Sex.** Reference thresholds and lactate clearance differ; population-averaged values may misestimate individual thresholds. Not addressed here.

> ⚠️ **On limitation 2 — the parallel is to something that does not run.** The week-3 95% gate exists in
> code (`wendler-531.ts:160-200`, `verdictFrom95Set`) and has **ZERO CALLERS**; `workingNumberForCycle:112`
> advances by cycle index unconditionally. **See `D-326` layer 2.** A mid-block aerobic check modelled on it
> would be modelled on a gate that has never fired.

---

## 11. Provenance

| Element | Basis |
|---|---|
| Intensity is protective; frequency and duration expendable | Literature — Hickson 1981/1982/1985 |
| Volume defends long-duration endurance | Literature — Hickson 1982, duration arm |
| Maintenance **15 wks endurance (2 sessions/wk); 32 wks strength (1 session, 1 set)** | Literature — Spiering et al. 2021 *(corrected 2026-07-26 — was stated as 4–8 weeks)* |
| ⛔ ~~Bike does not attenuate strength; run does~~ **RETIRED AS A JUSTIFICATION 2026-07-26** | **Three metas, three answers.** Wilson 2012 found it; **Schumann 2022 (largest) found NO modality moderation; Sabag 2018 found the REVERSE and explicitly recommends running-based HIIT over cycling for preserving lower-body strength** (cycling ES −0.377 p=0.074; running ES −0.176 p=0.261 — neither subgroup significant). ⛔ **The bike-wins decision now rests on TISSUE DAMAGE, not adaptation interference.** See §5 |
| **Cycling does not damage tissue (no impact transient, no eccentric loading)** | ✅ **Uncontested biomechanics** — this is what actually carries "the bike wins", together with the EIMD timing row below |
| **Bike VO2 = 4 × 4 min, 3 min ACTIVE recovery** | ✅ **Literature — Helgerud et al. 2007.** ~7% VO2max in 8 weeks, 40 trained men, superior to continuous and to threshold work. **The most replicated interval prescription in the field.** ⚠️ Anchored to **90–95% HRmax**, not to %FTP — see §6 |
| Separate the sessions rather than stacking | Literature — Schumann 2022 *(explosive strength attenuated **especially same-session**)* · Robineau 2016 *(0h worst, 6h suboptimal)*. ⚠️ **Moderate, and explosive-strength specific — 5/3/1 is maximal-strength work.** The rule now rests on **session quality**, not adaptation blunting |
| **24h target, 6h fallback** *(not 6h ≈ 24h)* | Literature — Robineau 2016, **VO2peak higher at 24h than at 0h or 6h.** ⚠️ Moderate: n=58 amateur rugby, 7 weeks. ⛔ **`place-week.ts:64-82` still states 6h and 24h as equivalent** |
| Ride before lift, not after | ⛔ **WEAK, AND THE CODEBASE'S CITATION IS WRONG.** *"Cycling power impaired 24–48h post-heavy-lower"* was attributed to **Petré 2021, which is a strength-development meta by training status and says nothing about clearance windows.** The surviving support is soreness from strength training impairing endurance performance up to 72h. **See the §3 sweep box — the miscitation is in five places, two of them athlete-facing** |
| **Strength block is a deposit, not a debt** | ⚠️ **SOURCED 2026-07-29, AND THE GRADE CAME DOWN.** This read *"Literature, STRONG"* for a number with no paper under it — the count was right and the citation was missing, which is the same fault as a wrong attribution. It is Llanos-Lagos, Ramirez-Campillo & Sáez de Villarreal 2026, *Eur J Appl Physiol* 126(1):193-222 (17 studies, 262 participants, 60 female; 5-25 weeks at 1-3 sessions/wk). Cycling performance ES 0.463 (p=0.016), efficiency ES 0.353 (p=0.012), anaerobic power ES 0.560 (p=0.024), **VO2max no effect (p>=0.263)**. ⛔ **NOT "STRONG": the authors rate certainty LOW.** ⛔ **AND IT IS CYCLING ONLY** — the *"improves run and bike performance"* half of the old wording is not in this review and has no located source. Still the best-evidenced claim here, and it must be stated for cyclists rather than for every athlete |
| Cadence ≥90 rpm requirement | ⛔ **CONTESTED, searched 2026-07-26.** Force-per-stroke half is supported; **the "easier on the legs" conclusion is contradicted — 60 rpm induces LESS neuromuscular fatigue than 90/120 rpm.** Keep the rule (standard practice, errs safe); **do not assert it protects the legs.** See §3 sweep |
| Uphill reduces load at equal metabolic cost | ✅ **Literature — Gottschall & Kram 2005** (impact peaks smaller uphill, **absent at +9°**) + 2024 slope study (**same metabolic stimulus, lower peak vertical GRF**). ⚠️ Muscle activation is *higher* uphill |
| **Strides ~10 sec, passive recovery** | ✅ **Literature — ATP-PCr powers max effort 8–10 sec**; under ~20 sec produces little lactate. ⛔ **Recovery must be PASSIVE — active recovery delays PCr resynthesis and shifts the work glycolytic**, which turns strides into a session |
| **48h clearance for long / leg-dominant work** | ✅ **Literature — EIMD peaks 24–48h; largest strength, speed and agility deficits at 48h**; recovery days 5–7. **The first real receipt under this rule** |
| VO2 over sweet spot in short blocks | Reasoned from intensity- vs volume-driven adaptation |
| Specific dose table durations | **Product decision.** Derived from working-time arithmetic, not measured |
| Strides / short hills **6 × 10 sec**, 2×/week, universal | Conventional practice for **hill sprints (8–10 sec)** — ⚠️ **not** the 20 sec convention for *strides*, which is a different prescription wearing a similar name. **10 sec is chosen for the alactic, pre-fatigue property**, not inherited from a source. Dose not otherwise sourced |
| "Keep the engine, rebuild the race pace" | Product voice |

---

## 12. Bibliography note

**This document and its run companion are the first two that carry a full provenance table separating
literature from reasoning from product decision. That separation is the thing worth keeping.**

The substrate for an app-level bibliography already exists and is scattered:

- **11 `SCIENCE-*.md` docs**, several already separating peer-reviewed principle from program convention
  (`SCIENCE-5x5-linear-progression.md`, `SCIENCE-minimum-dose-maintenance.md`,
  `SCIENCE-neural-speed-running-economy.md` all state this explicitly).
- **`SCIENCE-upkeep-maintenance.md` already runs numbered receipts `[1]`–`[6]`** — the closest thing to a
  citation format the repo has, and it was written to seed *"the future glass-box science section (full
  transparency — every claim carries a receipt)."*
- **The citation register** — `SCIENCE-concurrent-training-interference.md`'s 2026-07-19 addendum, which is
  where claims get **struck, contested or confirmed**. It caught the Wilson 2012 overreach in this document.
- ⚠️ **Citations are already load-bearing in TESTS.** `week-optimizer.anchor-contract.test.ts:678/754`
  asserts specific citation strings appear in engine output. **Changing a citation can fail the build**,
  which is a stronger guarantee than most of these docs have.

**First job for any bibliography, before formatting anything:** disambiguate **Hickson 1980 (interference)**
from **Hickson 1981/1982/1985 (maintenance)**. See the §3 box. The code cites the former, this doctrine
cites the latter, and nothing currently distinguishes them.
