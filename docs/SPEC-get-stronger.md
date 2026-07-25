# SPEC — Strength Focus (Barbell, 4-day) · V1

**Status:** build contract. **Dies on ship** — fold into `D-323` and delete (CLAUDE.md spec lifecycle).

**Rewritten 2026-07-25.** The previous version described a block-periodised protocol (Issurin arc, derived
entry percentages, rep ranges, a separate retest week). **That is superseded.** V1 is Wendler's 5/3/1 in
its endurance-athlete configuration. The reason for the switch is in `BUILD-ORDER-strength-spine.md`;
the short version is that assembling a protocol from five sources produced ~8 invented numbers, and
Wendler already published one for this athlete with zero.

**Companions:** `ARCH-strength-spine.md` (where code lives) · `BUILD-ORDER-strength-spine.md` (sequence,
open questions) · `D-323` (scope decisions) · `OPEN-QUESTIONS.md` Q-202 (the work ledger).

---

## 0. Scope

**In:** an athlete with an aerobic base who already lifts, months out from any race, wants to get
measurably stronger over 8 weeks while holding their endurance.

**Out:** the total beginner (own protocol later) · dumbbell-only (own plan later) · 3-day (own plan
later). See `BUILD-ORDER-strength-spine.md`.

**Entry gate: no 1RM, no entry.** All **four** lifts required — squat, bench, deadlift, overhead press.
The current check tests bench and squat only; missing deadlift or press leaves two of four days with no
weight. The message names the missing lift and sends them to the Baselines test (Lower = squat +
deadlift, Upper = bench + press, Full Body = all four). **No in-plan week-1 baseline test.**

---

## 1. The protocol

**12 weeks = three 4-week cycles — leader, leader, anchor.** The default. 16 = four (2:2). 8 = two (1:1),
off-ratio, ships later as the short option. **Reasoning at the end of this section — read it before
changing the length.**

*(The week tables below show ONE leader cycle and ONE anchor cycle. At 12 weeks the leader runs twice —
weeks 1–4 and 5–8, at an incremented working number the second time — then the anchor is weeks 9–12.)*

### Working number
**80–85% of the true 1RM, per lift, rounded down to 5 lb.** Every percentage below is a percentage *of
this*, not of the real max. Stored at plan creation; climbs on its own schedule; never re-derived from
`performance_numbers`.

### ⛔ LEADER then ANCHOR — the two cycles are NOT the same

**Corrected 2026-07-25.** An earlier version ran the standard 5/3/1 rep scheme with all-out top sets at
the **lowered** 80–85% working number. **That combination is not Wendler's.** His lower working number is
prescribed *together with* programmed fives and **no all-out set** — dropping the AMRAP is half of what
makes it lower-fatigue. Taking the lighter weights and keeping the most fatiguing element is an accidental
hybrid: less stimulus, same cost.

His own structure already resolves it. **Leaders build, anchors express.**

#### Cycle 1 — LEADER (weeks 1–4). Programmed fives, no all-out set.

| week | set 1 | set 2 | set 3 |
|---|---|---|---|
| 1 | 65% × 5 | 75% × 5 | 85% × 5 |
| 2 | 70% × 5 | 80% × 5 | 90% × 5 |
| 3 | 75% × 5 | 85% × 5 | **95% × 5** |
| 4 — deload | 40% × 5 | 50% × 5 | 60% × 5 |

Same percentages as standard 5/3/1; **every set is five reps, including the top set.** Week 3's top set is
the hardest work of the cycle and it is still a controlled five.

#### Cycle 2 — ANCHOR (weeks 5–8). The all-out set returns.

| week | set 1 | set 2 | set 3 |
|---|---|---|---|
| 5 | 65% × 5 | 75% × 5 | **85% × 5+** |
| 6 | 70% × 3 | 80% × 3 | **90% × 3+** |
| 7 | 75% × 5 | 85% × 3 | **95% × 1+** |
| 8 — deload | 40% × 5 | 50% × 5 | 60% × 5 |

**`+` = as many clean reps as you can.**

**Between cycles:** working number +5 lb upper (bench, press), +10 lb lower (squat, deadlift). So the
anchor runs at a higher number than the leader.

### Where the measurement lives

**Three measured sets — weeks 5, 6 and 7.** Week 7 is the best of them: highest percentage, so the
cleanest estimated max. **Combined with the entry baseline that gated the plan, the block is measured at
both ends.** There is still no separate retest week, so the frozen-retest-weight problem stays deleted.

**Weeks 1–4 are unmeasured by design.** That is what a leader cycle is. Do not add an all-out set to it
"so there's data" — that reinstates exactly the hybrid this section corrects.

### ⛔ 12 WEEKS IS THE DEFAULT. 8 is the short, off-ratio option.

**Decided 2026-07-25.**

Wendler's leader:anchor ratios are **2:1, 3:2, 2:2.** At four weeks a cycle:

| length | cycles | split | his ratio? |
|---|---|---|---|
| **12 weeks** | 3 | **2 leaders + 1 anchor** | **yes — exactly 2:1** |
| 16 weeks | 4 | 2 + 2 | yes |
| 8 weeks | 2 | 1 + 1 | **no — not a ratio he lists** |

**So 12 weeks:** leader (1–4) · leader (5–8) · **anchor (9–12)**, with the all-out sets in weeks 9, 10, 11
and week 12 the deload. Eight weeks of protected sub-maximal building, three weeks of measurement.

**The whole case for 12 is the ratio.** It is the only length that runs his structure as designed. That is
sufficient, and it is the only argument that survived scrutiny.

#### ⚠️ Arguments for 12 that DO NOT hold — do not reinstate

- **"8 weeks makes them test too often."** **False on arithmetic.** 8 at 1:1 gives all-out sets in weeks
  5/6/7. 12 at 2:1 gives them in 9/10/11. **Three either way.** What differs is build time before them,
  not test frequency.
- **"Endurance athletes need long runways of sub-maximal work."** **No source.** Over 6–12 weeks there is
  no clear difference in strength development, and both 8- and 12-week blocks are effective. A reason
  invented to fit a conclusion.
- **"No new block-length logic needed."** True and irrelevant — the app takes any duration and defaults
  to 12. Equally true of 8.

#### The tension with Friel — recorded, not hidden

**Friel caps Maximum Strength at 6–8 weeks. We run 12.** That is a real divergence from a framework this
spec otherwise adopts, and the honest answer to a coach who spots it is:

> Friel caps it at 8 because his plan is anchored to a race — the remaining weeks are needed for Build
> and Peak. **This block has no race**, so that clock is not running. We extend to 12 to preserve
> Wendler's 2:1 accumulation-to-realisation ratio. Rønnestad's concurrent protocols ran ~11 weeks, so 12
> sits at the top of a studied range rather than outside one.

**Two honesty notes on that answer:**
1. **"Friel's cap is calendar, not physiology" is OUR inference.** He does not state a reason. It is a
   reasonable read of a race-anchored plan; it is not his words.
2. **The Rønnestad defence is slightly stretched.** His ~11 weeks were heavy lifting *alongside normal
   endurance*, to improve endurance performance — his athletes were **not** cutting volume to two-thirds.
   It supports "11 weeks of concurrent heavy lifting is fine," which is the part we need. It does not
   support "11 weeks of strength-biased training."

**This is the Off-Season / Strength-Bias Block.** Positioning it that way is what makes the 12 defensible:
no race, no clock, so the strength programme runs by the book.

**8 weeks ships later as the short, off-ratio option** — for someone with a season closer than they'd
like. Labelled as such, never as the standard.

### The week

| day | lift |
|---|---|
| Mon | Bench |
| Tue | Squat |
| Thu | Overhead Press |
| Fri | Deadlift |

Wed / Sat endurance · Sun off. **Six training days, one full rest day.**

### The session

1. **10–15 jumps or medicine-ball throws.**
2. **The main lift** — three sets, last one all-out.
3. **25 reps each: push · pull · single-leg or core.**

**There is no row and no chin in the four main lifts — the pull category is where pulling comes from.**
These three categories are also the slots the Adjust-tab add-ons fill (glute → single-leg/core; Hyrox →
carries and sleds; pull-up focus → pull). Spending up toward 50 reps is a cost the app states.

### ⛔ The 95% rule — Wendler's own validity check, and it replaces the adherence threshold

**"You should always be able to hit at least five reps at 95% of your working number. If you can't, the
number is too high — reset it."** His reasoning: on your worst day you can still complete the minimum.

**That check is already sitting inside the block.** Week 3 of every cycle is the 95% set.

| week | what it is | what it tells you |
|---|---|---|
| **3** (leader) | 95% × 5 | pass/fail — did they get the five? |
| **7** (leader) | 95% × 5 | same, at the incremented number |
| **11** (anchor) | 95% × as many as you can | pass/fail **with a number** |

**Weeks 3 and 7 are stall triggers. Week 11 is the transition gate** (below).

> **⛔ THIS DELETES THE ADHERENCE THRESHOLD — the last absent number in this spec.** An 85%-attendance gate
> was proposed 2026-07-25 and **rejected as invented**. It is also *worse*: an athlete can attend every
> session and still be carrying a working number that is too heavy. Attendance cannot detect that. **The
> rep count can.** Do not reintroduce an attendance percentage.
>
> A **75% endurance-completion** figure was proposed alongside it and is also **scrapped**. It was
> described as never gating anything — and a metric that triggers no state change is not a threshold.
> Store what they did and show it.

### Stall
Fail to complete the prescribed reps on the top set twice running on the same lift → drop that lift's
working number **10%** and continue.

**Note the trigger differs by cycle.** In a **leader** the top set is a fixed five, so a stall is failing
to get five. In the **anchor** the top set is open, so a stall is failing to reach the *prescribed* number
(5, 3, or 1) — **not** failing to beat a previous best. Fewer bonus reps than last time is information,
not a stall. *An endurance athlete who ran hard yesterday can hit the required reps and get zero bonus
reps; flagging that as a stall and resetting their weights breaks trust for exactly the athlete this is
built for.*

**Reset and stall are the same mechanism.** Failing the 95% check *is* failing the prescribed reps, and
both resolve to −10%.

---

## 1b. The transition — a chain of blocks, not a new plan

**Michael, 2026-07-25:** *"once a plan is ingested the user never has to leave the State screen — they
roll into desired outcomes and training blocks indefinitely."*

Goals is the front door, used once. **Week 12, the Focus tab asks what's next.** Three deterministic steps:

1. **Ask the emphasis** for the next block.
2. **Evaluate week 11** against the 95% rule:

| week 11 result | what happens to the working number |
|---|---|
| **5+ reps** | validated → **advance** (+5 upper / +10 lower) |
| **fewer than 5** | it outpaced them → **reset** (−10%) |
| **session skipped** | no evidence to advance on → **hold** |

3. **Generate the next block** with the carried-forward numbers; retire the previous.

> **Do not recompute the working number from the AMRAP estimate.** A big week-11 set is tempting to
> convert into a new max and a new number — Wendler deliberately does not. The increment stays +5/+10 and
> the reps are *feedback*, not a new input. Conservative by design; the buffer is the point.

### Schema — no new tables

**A block IS a `plans` row.** The timeline is the chain of them. Do not build a Timeline/Blocks structure
— `materialize-plan`, `get-week`, the coach and the whole spine read `plans`, and replacing it is a
refactor with no payoff.

Already present: `plan_mode: 'rolling'` is **already stamped** on these plans, and
`retireCompetingActivePlans()` already handles succession. `config` is free-form JSONB.

**The one addition:** a link from each block to the one before it, so the chain is walkable and the
working numbers have a provenance. Everything else exists.

**This is what the block-scoped-emphasis decision was for** (`ARCH-strength-spine.md` §3.4). Emphasis
lives on the block; the chain is the living program.

**Note the trigger differs by cycle.** In the **leader** the top set is a fixed five, so a stall is
failing to get five. In the **anchor** the top set is open, so a stall is failing to reach the *prescribed*
number (5, 3, or 1) — not failing to beat a previous best. Getting fewer bonus reps than last time is
information, not a stall.

---

## 2. Endurance

| | |
|---|---|
| **Volume** | ~two-thirds of normal |
| **Sessions** | 2–3 on off days, easy |
| **Hard session** | one per week max, **off by default**, replaces an easy session, never adds |
| **Hard session placement** | on a **lower-body day, after lifting** (Tue or Fri) — consolidates leg stress so Wed/Sat/Sun stay genuinely easy. **This is a deliberate override of `SCHEDULING-RULES.md` §4.4 — see below.** |
| **Hard session discipline** | bike if they have one; run = strides only; **never swim** |
| **Easy runs** | may stack onto the upper-body days (Mon/Thu), lift first |
| **Separation** | ≥6h between lifting and hard conditioning |
| **Held / dropped** | held through the deload week, dropped in the final week |

**By discipline.** Runner: tightest leash, running is the thing that competes. Cyclist: loosest, close to
normal volume. **Triathlete: the constraint is the TOTAL, not any one sport,** because interference tracks
total work.

**Swim — keep it simple (Michael, 2026-07-25). Days + rough length, booked, easy, no special gating.**
Refinement moves to add-ons later.

> ⚠️ **Corrected:** the source protocol doc says *"upper-body lifting and hard swimming compete."*
> **Not supported.** Swimming is the least damaging modality — no impact, no eccentric loading, which is
> the mechanism behind running's interference. Direct trials of concurrent resistance + swimming show
> **bench press 1RM improving** alongside swim performance. That line reads as reasoning-from-mechanism
> (both use the arms) rather than evidence. *Caveat: those studies are swimmers who added lifting, not
> lifters who swim.* The only real constraint is the usual one — don't run them back to back.
>
> **So swim is excluded from the quality session for a PRODUCT reason, not a science one:** we do not
> program the swim at all, so we cannot prescribe a hard one. Do not restate the interference claim.

**Mix and match.** Disciplines prefill from the athlete's profile and are **toggled on/off for this block** —
what you do is not what you want for these 8 weeks. Units: run in **miles + days**, bike in **hours + days**,
swim in **days + rough length** (booked, not coached).

> **The one genuinely useful nudge:** a runner with a bike can hold the same aerobic volume for less
> strength cost by shifting some of it to the bike. Show the cost next to the dial. **Not a gate** — no
> greying out, no deciding for them.

### ⛔ Scheduling: this protocol OVERRIDES `SCHEDULING-RULES.md` §4.4. Do not "fix" it.

**§4.4 says** heavy lower-body strength must precede a quality bike by **≥48h**, cited to Doma & Deakin
2013 and de Souza 2007 — cycling threshold power is impaired at 24h post heavy squats and recovers by 48h.

**This protocol stacks the quality session ONTO the lower-body day, after lifting** (Wendler). Michael,
2026-07-25.

**Why it is not a violation — §4.4 is scoped, not wrong.** §4.4 assumes the quality session is the
*point*, so degrading it wastes the stimulus. **In a strength block it is maintenance, not development** —
the job is to stop the top end sliding, and a somewhat blunted hard session still delivers the intensity
that does that. The price buys two things §4.4 does not weigh: the next lifting session is protected, and
**Wed/Sat/Sun become genuinely easy** instead of a week of undifferentiated medium.

So §4.4 applies when quality is the goal (Speed Focus, race build) and does not when quality is upkeep.
**Record it as an override with a reason, not a silent divergence** — otherwise a later session reads §4.4,
sees a conflict, and "corrects" this.

**⛔ THE STACKING RULE IS CONDITIONAL — Robineau 2016 tested exactly this.**

Zero hours between lifting and cardio produced **lower strength gains**. Six hours and twenty-four hours
were **equivalent to each other**. So:

| the athlete can… | do this |
|---|---|
| split the day (lift AM, hard session PM, **≥6h apart**) | **stack on the lower-body day** — one 48h clock, four genuinely easy days |
| not split the day | **put it on a different day.** 24h is just as good as 6h in the data |
| — | **never back-to-back.** That is the one condition shown to hurt strength. |

**"Stack it on the leg day, after lifting" is wrong without the gap** — same-day *back-to-back* is
precisely the worst arm of the only study that tested the question. Most people cannot split a weekday.
**Ask whether they can, then place accordingly.**

**And be honest about what stacking buys:** it is **not physiologically superior**. Six hours and
twenty-four hours performed the same. The case for stacking is the **single 48-hour clock** (heavy squats
peak soreness at 24–48h, so a hard session the next day is a compromised one — Doma, 3–5% economy loss)
and **four genuinely easy days** instead of a week of undifferentiated medium. Scheduling and recovery
quality, not a better adaptation.

> ### ⛔ STRUCK — a stacking rationale circulated 2026-07-25 that does not hold. Do not reinstate.
> Real author names attached to claims they do not make — the third instance of this pattern in one day.
> - **"Rønnestad 2016"** — that study clusters *high-intensity endurance sessions across days* (5/1/3/1/1
>   per week, skiers and cyclists, endurance only). Nothing about same-day strength + endurance.
> - **"Hickson 1980"** — the study that *established* interference. It never tested scheduling.
> - **"Fyfe on compressed windows"** — not found. Fyfe's finding is that intensity does not mediate
>   interference; total work does.
> - **"Piggybacks a pre-activated nervous system"** — post-activation potentiation works over *minutes*,
>   for explosive output. Not hours, not intervals.
> - **"Cleaner mTOR/AMPK demarcation"** — **argues the opposite.** Coffey & Hawley (already cited in
>   `SCHEDULING-RULES.md` §4.2) found signalling interference is acute and resolved well within 24h, so
>   alternating days already separates it. Same-day is when the signals *overlap*.
> - **"Residual fatigue concentration" / "intra-day recovery consolidation"** — neither is established
>   language.

**Unchanged and still enforced:** §4.2 (heavy legs → long run, ≥24h before / ≥48h after) · §4.3 (same for
long ride) · §3.3 (long run and long ride on different days) · §3.4 / §4.1 (no two consecutive hard days,
hard-easy alternation).

> ⚠️ **Get Stronger currently bypasses the optimiser entirely** — `strength-primary-plan.ts` carries a
> hardcoded `GRID` (strength Mon/Tue/Thu/Fri, endurance Wed/Sat) and never calls `week-optimizer.ts`.
> The athlete-anchored endurance card (they pick long day and quality day; lifting fills around them) is
> **`SCHEDULING-RULES.md` §1's stated philosophy** and the optimiser already enforces the gaps with
> citations. **This is not a new build — it is routing Get Stronger through the scheduler it ignores.**

---

## 3. ⛔ THE CITATION REGISTER

**Rule (Michael, 2026-07-25): if a call cites a source, it must follow that source.** A prescription that
contradicts its own citation is worse than an unsourced one.

### T1 — sourced to a peer-reviewed study

| call | source |
|---|---|
| Running interferes with strength; cycling does not | Wilson 2012 — meta-analysis, 21 studies, 422 comparisons |
| Interference tracks **modality, frequency and duration** — not intensity | Wilson 2012 (moderators) |
| Endurance **intensity does not mediate** interference; total work does | Fyfe 2016 — HIT vs work-matched MICT, 8 wk, n=23 |
| **No** interference for max strength or muscle size; only explosive attenuated | Schumann 2022 — 43 studies, hypertrophy SMD −0.01, p=0.92 |
| Heavy loads build strength specifically; hypertrophy is load-flexible | Schoenfeld 2017 — 21 studies |
| Training closer to failure does **not** improve strength (band: 3–5 RIR) | Refalo/Robinson 2024 — meta-regression, 67 strength studies |
| Cut duration to ⅓ or ⅔ → VO2max holds 15 weeks; cut **intensity** → lost | Hickson 1981/82/85 |
| Reduced frequency (2 or 4 d/wk from a 6-day base) maintains VO2max | Hickson 1981 |
| 0h between lifting and cardio impairs strength; **6h and 24h do not** | Robineau 2016 — n=58, 7 wk |
| Strength work improves economy; mechanism neural/structural, not size | Rønnestad & Mujika 2014 |
| 8–12 week window for these protocols | Rønnestad & Mujika 2014 |
| 1–4 strength sessions/week is inside the studied range for runners | Llanos-Lagos 2024 |
| Frequency has no significant effect when volume-equated | Schoenfeld/Grgic/Krieger 2019 — 25 studies |
| Intensity preserves endurance adaptation; volume can be cut | Mujika & Padilla 2000 |
| Deload cuts volume 41–60%, holds intensity | Bosquet 2007 · Wang 2023 |
| Protein 1.6–2.0 g/kg/day | Morton 2018 (49 studies, n=1863) · ISSN 2017 position stand |
| Keep volume low to avoid unwanted mass; heavy lifting alone blunts rate of force development, add plyometrics | Van Hooren 2024 — *review, not a trial* |

### T2 — named method, established practice, untested on this population

| call | lineage |
|---|---|
| **The entire cycle** — 65/75/85, 70/80/90, 75/85/95, deload 40/50/60, +5/+10 per cycle | Wendler 5/3/1. **Strong** — identical across many independent sources that cross-check each other. |
| Working number at 90% of true max (the standard) | Wendler. **Strong** — same. |
| 10–15 jumps or throws before every session | Wendler, **quoted directly** in a thread he posts in. **Strong.** |
| Assistance: 25–50 reps each of push / pull / single-leg-core | Wendler. **Strong** — multiple consistent sources. |
| Leader / Anchor periodisation (not used in V1) | Wendler 5/3/1 Forever. **Strong.** |
| **Working number at 80–85%** | **UPGRADED 2026-07-25 — was marked thin, now better attributed.** It is Wendler's own **general** guidance, not a running-specific workaround: manipulate the working number by current goals and recovery, lower it when recovery or technique is uncertain, and he has gone lower still for athletes he coaches. **⚠️ But it is prescribed TOGETHER WITH programmed fives and no all-out set.** Pairing the lower number with AMRAP top sets is not his — see §1, which resolves it via Leader/Anchor. |
| ⚠️ **Hard conditioning on the lower-body days** | **THIN — a gym website's paraphrase.** |
| ⚠️ **2–3 conditioning sessions per week on off days** | **THIN — same gym website.** |

> ### ⚠️ NONE OF THE WENDLER MATERIAL IS FROM HIS BOOKS
>
> `5/3/1 Forever` and `Beyond 5/3/1` were not read. Everything above is secondary — guides, forum
> summaries, coaching sites.
>
> **For the core cycle that barely matters** — it is documented so widely and so consistently that the
> sources cross-check each other. **For the three ⚠️ endurance-athlete lines it matters more**, because
> that is exactly where one site's paraphrase can drift.
>
> **And be specific about the risk:** two of those three come from the *same page* that produced
> *"5/3/1 combines with running better because the main work is submaximal"* — a claim struck from this
> spec as **not Wendler's and unfalsifiable**. One claim from that page was thrown out and two were kept.
>
> **Neither is load-bearing, so V1 can build on them:** 80–85% is conservative in the safe direction
> either way, and the conditioning placement now stands on this spec's own scoped-override reasoning
> (§2) rather than on Wendler's authority. **But do not promote them to "Wendler says" until someone
> reads the book.**
| AMRAP top set → estimated max; formula accuracy | Wendler · LeSuer 1997 |
| Stall → drop 5–10% after missing twice | Starting Strength / Texas Method |
| Phase sequence: Anatomical Adaptation → **Maximum Strength** → Conversion to Power → Maintenance | Bompa · Friel |
| Maximum Strength sits in the Base period, 6–8 weeks | Friel |
| Maintenance between blocks: ~2 strength sessions/week, 6–8 weeks | between-block convention |
| RIR ↔ %1RM ↔ reps mapping (used for grading, **not** for loading in V1) | Tuchscherer / Helms chart · Zourdos 2016 |

### ⚠️ Secondary sources — cited by a blog or coaching site, NOT verified at origin

**Do not present these as T1 until someone reads the primary.**

- **"At least one rest day per week"** — attributed to ACSM and ECSS via a fitness site. The primary was
  not read.
- **"One hard session per week maintains most VO2max gains"** — practitioner consensus; Hickson's
  frequency arm is adjacent but not the same claim.
- **Weekly training hours by level** (6–8 / 8–10 / 10–12 for Olympic distance) — coaching-business blog.
- **4–6 weeks to rebuild race fitness** after an easy-only block — coaching blog, used to widen the
  season gate.

### T3 — ours. No source. Say so.

- **Round DOWN, never to nearest.** Reasoned (overshoot writes an unfinishable set; the rep count absorbs
  an undershoot), not sourced.
- **Which lift lands on which day.** Convention.
- **8 weeks as the default length.** Sits inside Friel's 6–8 for Maximum Strength and equals two Wendler
  cycles, so it is *constrained* — but the pick is ours.
- **Swim as scheduling courtesy.** Product decision.
- **Assistance at 25 (the bottom of Wendler's range).** The range is his; taking the floor is our reading
  of Van Hooren.
- ~~**The adherence threshold**~~ — **CLOSED 2026-07-25. It does not need to exist.** Wendler's own 95%
  validity check (§1) gates block-to-block progression on *performance* rather than attendance, and it is
  already sitting in week 3 of every cycle. An 85%-attendance rule was proposed and rejected as invented
  **and as worse** — attendance cannot detect a working number that is too heavy; the rep count can. A 75%
  endurance figure was scrapped for gating nothing.

### ⛔ Struck — claims previously carried that do not survive

- **"Concurrent training suppresses hypertrophy."** Contradicted by Schumann 2022, which the old spec
  cited *against itself* in its own Limits section. The "you won't accidentally get bigger" line now
  rests on energy balance alone.
- **"Interference scales with intensity."** Wilson's moderators were modality, frequency and duration.
  Fyfe tested intensity directly and found no mediation.
- **"Early gains are neural, not size."** Direction right, absolutism wrong — hypertrophy is measurable
  from ~3 weeks and the crossover is ~6–8, which lands mid-block.
- **Prilepin's table.** Cited as the loading tradition and never followed — the old accumulate phase ran
  up to 40 reps against his ceiling of 24. Not applicable to V1 (Wendler owns the loading) and the claim
  should not be reinstated.
- **"5/3/1 combines with running better than a peaking block because the work is submaximal."** Came
  from a gym's website, **not Wendler**, and nobody has run that comparison. Fluent prose, not a receipt.
- **The 24h lifting/endurance separation** as a hard rule. Robineau's floor is **6h**; 24h was a
  recommendation before *important* sessions. The tighter number was mine and it distorted the 3-day
  scheduling argument.

---

## 4. Copy

Voice: `COPY-VOICE.md` — the quant who trains, not the coach who encourages.

**Say once, flat, in the plan description:** the weights come off 85% of your max, and that buffer is what
makes the last set of every week worth measuring. **Once.** Not repeated, not apologised for, no
"don't worry, it gets harder." Week one *is* easy — that is conservative loading, not an on-ramp, and the
plan never says it is easing you in.

**No expected-gain number.** "Modest" only. **No recovery timeframe.** **"Base stays" never extends to
threshold or race pace.**

**The card must say who it's for.** The app cannot tell a beginner from an experienced lifter, and the
scope cut governs what we build, not who gets in.
