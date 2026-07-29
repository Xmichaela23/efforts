# Strength Focus

**A twelve-week barbell block for endurance athletes who want to get measurably stronger without losing the engine they already have.**

Built on Jim Wendler's 5/3/1, adapted for athletes carrying a concurrent aerobic load. Every claim in this document carries a source, and each source is marked as measured, reasoned, or a product decision.

**How it works, in three lines:**

1. The athlete names their immovable days — long run, long ride, one hard session. A solver places the lifting around them.
2. Four main lifts on four-week waves, percentages of a training max. One hard aerobic session a week, held at full length.
3. Anything the schedule cost the athlete is stated in plain language, not absorbed silently.

---

## What this block does not claim

Leading with the limits, because they define the product more than the promises do.

- **It does not build aerobic fitness.** One hard session a week is a maintenance dose. It holds. It does not improve.
- **It does not build explosive speed.** That is the one quality concurrent training measurably costs.
- **It does not preserve race-pace threshold work** or sustained-pace durability at race-relevant volume.
- **It does not promise a number we cannot source.** Where a threshold is ours rather than the literature's, the code says so and this document says so.

The gain shows up as strength on the bar, and — in cyclists — as endurance performance through improved efficiency rather than a higher aerobic ceiling. See the deposit row in the evidence table for what that rests on and what it does not cover.

---

## The position

- **Strength is the constant; the endurance goal rotates.** A generalist runs a trail race, then a half, then a 70.3. The events change. The lifting does not.
- **The athlete's numbers are honoured, never capped.** We state the maintenance dose and what exceeding it costs. The number they type is the number we build.
- **Where evidence splits, we take the conservative side and say so.**

---

## How a plan gets built

**1 — The athlete states their absolutes.**
Long run day, long ride day, one hard aerobic day. Any day of the week, each optional. These are often things other people own — a club night, a group ride — so the engine treats them as immovable rather than as preferences.

**2 — The lifting is solved around them.**
A solver enumerates every legal placement of the lifting days against those anchors, scores them, and takes the best. It never moves an anchor, never drops a session, and never quietly returns fewer sessions than were asked for. If no legal week exists it refuses, names the anchors that bound it, and says what would free them.

**3 — One law governs placement.**
A single same-day compatibility matrix and one adjacency table decide what may share a day and how many hours any pair needs between them. Both the race-plan optimiser and this block read the same table, so a physiological rule cannot mean two different things in two parts of the app.

**4 — The endurance volume is distributed.**
The hard session is paid first at full length, because intensity is the protected variable. What remains is easy volume, and it flexes.

**5 — Anything the week cost the athlete is stated.**
A clearance met at its minimum with nothing spare, two sessions sharing a day, a requested ride day the week had no room for — each is reported rather than absorbed.

---

## The programming

### Relationship to 5/3/1

The block is derived from Jim Wendler's 5/3/1. The following are Wendler's, not ours:

- Four main lifts on percentages of a **training max** rather than a true max
- **Four-week waves**, with a deload as the fourth week
- **Leader / leader / anchor** cycle sequencing across a twelve-week block
- The **AMRAP top set** as the mechanism that reads whether the working number has been earned. The prescription at 95% is `1 or more reps` — verified against the second edition, where it appears as `95%x1+` throughout
- **An estimated max from a rep-max set.** Wendler carries his own, which he calls the rep-max calculator: `Weight × Reps × 0.0333 + Weight`. He also states its limits himself — *"not necessarily an accurate predictor of your 1RM, but it affords you a good general way to gauge your progress"*
- **Reset on a stall**, where a stall is failing to hit the prescribed sets and reps. His reset takes a fresh rep max, estimates from it, and uses 90% of that as the new training max

What we changed, and why:

| Change | Reason |
|---|---|
| Twelve weeks fixed, not open-ended | It is the shortest length that runs the leader/leader/anchor ratio as designed |
| Assistance prescribed as movement + rep total, no load, no set count | Tying assistance to a percentage forces progression on a secondary movement and spends the fatigue budget the endurance training needs |
| Three-day option with the two upper lifts paired | Endurance athletes frequently cannot give four days to the bar |
| Week 3 always runs on four days regardless of setting | Protects the measurement — see below |
| Lifting days placed by solver against endurance anchors | 5/3/1 does not address concurrent aerobic load |
| **Brzycki instead of Wendler's own formula** | His `Weight × Reps × 0.0333 + Weight` is the Epley equation — 0.0333 is 1/30. Epley tends to overestimate and Brzycki to underestimate. For a number that sets an athlete's next working load without a coach watching, we take the conservative direction. **This is a deviation from the source programme and is stated as one** |
| **A trust ceiling on the estimate at eight reps** | Wendler gauges progress by eye and by feel; an app has neither. He says himself the formula is not necessarily accurate, so we bound where we act on it |

### Structure

**Twelve weeks, three four-week cycles**, run leader / leader / anchor.

**Four main lifts** — back squat, bench press, deadlift, overhead press.

**Week 3 is the measurement.** The top set is an all-out set at 95%, converted to an estimated max via Brzycki. Three things follow from the estimation literature and are built into the engine:

- **95% is chosen to keep the rep count low**, where the equations are most accurate. It is not an arbitrary intensity.
- **A set above eight reps still advances the bar, and the estimate is marked untrusted.** Beating the prescription means the training max was too conservative, so withholding the advance would penalise the athlete for it. What is not trusted is the estimated max computed off that set, which sits above the range where the equation holds. The next standardised read supersedes it rather than compounding on it. **Eight is ours** — the literature gives a degradation zone, not a line.
- **A missed prescription cuts the working number 10%.** That trigger is Wendler's.

**How a first block differs from a rebuild, stated plainly.** A twelve-week block is authored before a single set is performed, so no logged evidence can exist for it. The first block therefore carries a *projected* progression. The week-3 sets are what a rebuild reads to correct it: from that point the bar climbs on evidence rather than on the calendar. We say this rather than describe the loop as though it closed inside a first block.

Week 4 is a deload — volume cut, intensity held.

**Four lifting days, or three.**

- At four, each lift has its own day. Every lift is trained first and every top set is a clean read.
- At three, the two upper lifts share a day — the pair with least to give up — while the heavy lower lifts keep their own days. The heavier of the two goes first, and the session says so.
- **Week 3 always runs on four days**, at either setting, so no measurement is taken under accumulated fatigue and every cycle's reading is comparable to the last.

**The endurance underneath.** Everything conversational except the one hard day. Above 25 miles a week the engine names which day is long and stops sizing it — the athlete distributes their own miles. Below that it shapes the week, because a less experienced runner given four equal runs has been given a worse answer.

---

## The evidence

| Claim the block makes | Basis | Status |
|---|---|---|
| Intensity is what protects aerobic fitness; frequency and duration are expendable | Hickson & Rosenkoetter 1981 (frequency 6→2 d/wk), Hickson et al. 1982 (duration 40→13 min), Hickson et al. 1985 (intensity −⅓, −⅔). VO2max held for 15 weeks in the first two, lost in the third | Measured |
| One hard session a week holds; it does not build | Interval-dose literature — one session/wk is below the improvement threshold for trained athletes; 2–3/wk is the range where gains occur | Measured |
| Maintenance volume is roughly two-thirds of the athlete's own normal | Hickson's duration arms (two-thirds and one-third both held VO2max); Spiering et al. 2021 — endurance held 15 weeks on 2 sessions/wk, strength up to 32 weeks on one set | Measured |
| Volume defends durability over long efforts, so cutting it costs some | Hickson 1982 duration arm: ~10% drop in the shortest condition | Measured |
| Heavy lower-body work impairs cycling power for 24–48 h | Robineau et al. 2016 (n=58, 7 weeks); eccentric-damage markers peak 24–48 h, largest performance deficits at 48 h | Measured |
| A stacked day needs a gap, and resistance goes first | Robineau 2016: half-squat 1RM +16.8% at 0 h between sessions vs +31.2% at 6 h and +25.9% at 24 h. Eddens et al. 2018: resistance-first, +6.91% lower-body dynamic strength | Measured |
| A lift trained second in a session gives up load and reps | Exercise-order effects: the movement performed first adapts most | Measured |
| **The three-day option costs the second upper lift some weekly volume, and we accept that cost** | Grgic et al. volume-equated meta-analysis finds 1 d/wk and 3+ d/wk produce similar strength gains **when volume is equated** — which the three-day setting does not fully achieve, by the exercise-order row above. We choose the three-day option for schedule feasibility, place the lower lifts on their own days to protect them, and state the tradeoff rather than claim it away | **Reasoned — literature bounds it, does not license it** |
| Strength tests are comparable only when the protocol is standardised, fatigue included | Grgic et al. 2020, *Sports Medicine – Open* 6(1):31, systematic review of 1RM reliability — good to excellent test–retest reliability (ICC ≥ 0.90) conditional on standardisation; fatigue status is a named standardisation variable | Measured — **applies to a tested 1RM, not to an estimate** |
| Estimated 1RM from a rep-max set is accurate enough to program from, provided the rep count stays low | LeSuer et al. 1997, *JSCR* 11(4):211–213 — 7 equations across bench, squat and deadlift; correlations uniformly high (r > 0.95), absolute error varying by lift, and Brzycki accuracy improving markedly when restricted to sets of ≤10 reps. Reynolds et al. 2006 — 5RM gave the best prediction (R² = 0.993 bench, 0.974 leg press), degrading substantially at higher rep ranges. Mayhew et al. 2008 (n=103, pre and post a 12-week programme) — equations more accurate below 10 repetitions to failure | Measured |
| **Our week-3 AMRAP sits inside that accurate range** | The set is run at 95% of the training max, which returns low single-digit reps for a correctly set TM. Week 3 is additionally forced onto four lifting days so the read is never taken under accumulated fatigue | Measured components, **reasoned join** |
| Brzycki is our conversion, chosen for which way it errs rather than for being most accurate | ⚠️ **The literature is split and we do not claim otherwise.** LeSuer 1997 and Mayhew 2008 support Brzycki improving markedly at ≤10 reps, which is why the 95% set exists. But at the 2–5 rep range some work places Epley and Wathen closer to a tested 1RM. What is consistent is direction: **Brzycki tends to underestimate, Epley to overestimate.** Wendler's own formula is Epley. We take the conservative side because no coach is watching the number we produce | **Product decision on which way to be wrong** — not an accuracy claim, and a stated deviation from 5/3/1 |
| The estimate is directional, not absolute — including in the source programme | Wendler, 2nd edition, on his own rep-max calculator: *"This formula is not necessarily an accurate predictor of your 1RM, but it affords you a good general way to gauge your progress."* The programme this block derives from does not treat the estimate as a measurement either | **Primary source** |
| Deadlift estimates are not just noisier, they are biased low — so deadlift earns a tighter trust ceiling than the other three | LeSuer et al. 1997 (*JSCR* 11(4):211–213) — across bench, squat and deadlift, correlations between predicted and actual 1RM were uniformly high (r > 0.95), and **every equation tested significantly underestimated the deadlift.** This compounds with Brzycki's own downward bias, in the same direction. The engine trusts a deadlift estimate to five reps rather than eight; five is where Reynolds et al. 2006 found prediction strongest. **Both numbers are ours** | Measured bias, **thresholds are product decisions** |
| A set above eight reps advances the bar and marks the estimate untrusted | Two findings pointing opposite ways, kept separate. Physiologically the athlete has beaten the prescription and the training max was too conservative — that is Wendler's own read, so the bar climbs. Measurement-wise the e1RM off that set is above the range the equations hold in, so it is flagged and the next standardised read supersedes it instead of compounding. **The eight-rep line is ours**; the literature gives a degradation zone, not a boundary | Measured components, **reasoned join — threshold is a product decision** |
| A first block's progression is projected, not earned | A twelve-week block is authored before any set is performed, so no logged evidence exists for it. Week-3 sets are read on rebuild, which is where the bar starts climbing on evidence rather than on the calendar. Stated rather than implied | **Stated limitation of the current implementation** |
| **The block is a deposit, not a debt: heavy strength training improves cycling performance, and it does so without touching VO2max** | Llanos-Lagos, Ramirez-Campillo & Sáez de Villarreal 2026, *Eur J Appl Physiol* 126(1):193–222 (DOI 10.1007/s00421-025-05883-2) — systematic review with meta-analysis, **17 studies, 262 participants** (60 female), interventions 5–25 weeks at 1–3 sessions per week. Cycling performance ES = 0.463 (p = 0.016); cycling efficiency ES = 0.353 (p = 0.012); anaerobic power ES = 0.560 (p = 0.024); **VO2max no significant effect (p ≥ 0.263)**. The improvement is attributed to efficiency and anaerobic power rather than to aerobic capacity. ⚠️ **The authors rate the certainty of evidence LOW**, and the review is **cyclists only** — it does not carry the equivalent claim for running | Measured — **low certainty by the authors' own rating, and cycling-specific** |
| Long run ≤ 25–30% of weekly mileage | Daniels; the same basis underlies the Hansons long-run guidance. A 2:30–3:00 time limit sits alongside it | Measured |
| Uphill intervals hold the aerobic stimulus at lower impact load | Gottschall & Kram 2005 and later slope work — reduced peak vertical ground reaction force at matched metabolic cost. Muscle activation is higher uphill, so it is cheaper on impact, not free | Measured direction, reasoned application |
| Cycling costs the bar less than running does | Wilson et al. 2012 found the modality split. **Schumann et al. 2022 (43 studies) found no modality moderation at all.** We keep the rule because it errs safe, and we build no new claims on it | **Contested — stated as such** |
| Testing on a fourth day inside a three-day week | Ours. The components are measured; the join is a scheduling choice made to protect a measurement, not a claim about the body | Product decision |
| The volume above which an athlete distributes their own miles | Ours, 25 mi/wk. No literature exists on when a runner can self-regulate | Product decision |
| Block length, lift-to-day convention, assistance rep totals | Ours, and marked as such in code | Product decision |

The two "Hickson" bodies of work are kept apart deliberately: **1980** is the interference paper; **1981/1982/1985** are the maintenance experiments. They ask different questions and give nearly opposite answers.

---

## Open, and not papered over

- **Our reset percentage is more conservative than the source programme's, twice over.** Our training max starts at 85% of 1RM rather than 90 — a deliberate buffer for concurrent athletes — and a stall then cuts a further 10%, landing near 72% of 1RM. Wendler's stall re-estimates from a fresh rep max and takes 90% of that. The buffer already bought the safety once and the reset charges for it again. Not changed, because it moves prescribed weight; recorded as a known divergence.
- **The eight-rep trust ceiling is ours.** A product decision, not attributed to any estimation paper. The literature gives a degradation zone, not a boundary.
- **Which equation to use is a product decision, not a settled finding.** See the Brzycki row: the accuracy comparison is contested and we hold Brzycki for the direction of its error.
- **A first block's progression is projected.** The evidence-driven advance runs from the first rebuild onward.
- **The deposit claim covers cyclists, not runners.** The meta-analysis behind it is cycling-specific and the authors rate its certainty low. Anywhere this product states the deposit for a runner, it is generalising past the source. A running equivalent has not been located.
- **A better method exists and we cannot use it yet.** Load–velocity approaches predict 1RM more accurately than rep-based equations for both deadlift and back squat, but they require bar-velocity data no consumer wearable currently gives us. Named here so the limitation is a known one rather than an omission.
- **Our reset is not mechanically his.** Wendler's stall reset re-estimates from a fresh rep max and takes 90% of that. Ours cuts the existing working number by 10%. Both step back roughly the same distance, but his re-anchors on a new performance and ours does not. Whether that difference matters over a twelve-week block has not been tested.

---

## The science register

Sources are held per claim in the codebase and in a project science register that records when a citation is confirmed, contested, or struck. Three entries relevant to this protocol:

| Claim | Outcome |
|---|---|
| *"You should always be able to hit five reps at 95% of the working number"* — attributed to Wendler, and the reset threshold the engine ran on | **Struck, and re-confirmed against the primary source.** The second edition text was searched directly: the phrase "always be able" does not occur, and no five-rep rule at 95% appears anywhere. Every prescription in the book reads `95% x 1 or more reps`. Our threshold is one rep, which is the prescription. A five-rep rule may exist in *5/3/1 Forever* — until someone reads that edition it cannot be attributed |
| *"5/3/1 has no estimated max of its own"* — written into this document's own draft | **Struck before publication.** It is wrong. Wendler carries a rep-max calculator, `Weight × Reps × 0.0333 + Weight`, and uses it in three places: comparing rep maxes, resetting after a stall, and setting a training max for band or chain work. The formula is Epley. What changed is our framing: our use of Brzycki is now stated as a deliberate deviation rather than as filling a gap he left |
| Petré 2021 cited for a session-clearance rule | **Struck and re-attributed.** It is a strength-development meta-analysis by training status and says nothing about session spacing. Replaced with Robineau 2016 and Schumann 2022 |
| Coffey & Hawley 2017 cited for 24 h / 48 h spacing | **Struck.** A genuine and relevant interference-mechanism review that contains nothing on session spacing or recovery windows |

In all three the rule survived and the attribution did not. The register exists so that the second case is visible rather than quietly inherited.

---

*Authorship and review: [to complete]*
*Version / date: [to complete]*
