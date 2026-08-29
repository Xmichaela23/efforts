# WORKORDER — VIADA OWNS THE ENGINE
**Written 2026-08-29. Read the ⛔ FINDING first; it changes the premise every earlier plan was written on.**

---

## ⛔⛔ THE FINDING — pp.110–112 ARE THE PROGRESSION CHAPTER, AND THEY WERE UNREAD

`SOURCE-viada-hybrid-athlete.md` Part G records ~40 unread frames and warns, in its own words, that
**"an unread frame is not a gap in the book."** That warning was earned today. Three hours were spent
reasoning about what Viada "leaves silent" on strength progression. **He does not leave it silent.
pp.110–112 is a chapter titled "PROGRESSION AND PROGRESSIVE OVERLOAD"**, and it answers every
question that had been filed as absent.

⚠️ Photographs: `~/Downloads/Endurance period/IMG_3678.JPG` (p110), `IMG_3679.JPG` (p111),
`IMG_3680.JPG` (p112). Read off the images 2026-08-29. **Transcribe these into the SOURCE file as a
first act — they are not in it yet.**

### p112 — THE LOADING SCHEME, VERBATIM

> *"For many of my athletes, I rotate the reps and weight around a given max (that is, with a
> predicted max of X pounds, you can hit a certain number of reps at 75 percent and a certain number
> at 85 percent, so I may cycle between 75 percent, 80 percent, and 85 percent week to week in load,
> adjusting reps to keep the overall stimulus similar) before adjusting the overall max up a pound or
> two. **This is further outlined in the circle of reps coverage in Part 2.** Similar principles are
> used in the threshold adjustment method, also in Part 2."*

⛔ **"THE CIRCLE OF REPS" IS REAL AND IS NOT "THE CIRCLE OF MAXES".** E1c (p247) flagged the phrase as
undefined and appearing nowhere; `progression.ts` ships `DOUBLE_PROGRESSION_IS_OURS` on that basis.
p112 names it and points at **Part 2**, which is uncaptured. ⚠️ Find it before writing the mechanism.

### p112 — THE PROGRESSION RULE, VERBATIM

> *"A given training load (intensity/volume/frequency) can be maintained for several weeks at a time
> with minor adjustments from session to session that assume the same level of peak performance
> across slightly different set durations and intensities. **If you're meeting or exceeding
> expectations at this load, as indicated by lower RPE than intended, or consistently superior
> performance at the target RPE, you can increase the load incrementally** to be exposed to a new
> cycle at this higher load. You can follow this process indefinitely and **decrease load if you fail
> to achieve targets at any point.**"*

### p111 — THE PACING, AND WHY A WEEKLY RATCHET IS WRONG

- *"The same stimulus is often sufficient to drive adaptations for weeks (or even months)."*
- *"Eventually, of course, the stimulus must increase. If you're gaining 'only' 5 to 10 percent more
  strength on a single lift over the course of several months… then your capabilities may increase —
  for example, by a half kilo or so week to week."*
- *"You can decrease the stimulus somewhat from one week to the next and still progress as long as
  the lower stimulus is enough to overload the system to a certain extent."*
- ⛔ *"Progressive overload doesn't mean that sessions need to gradually get harder"* — and the
  *"be a little better every week"* urge is named as **a trap**.

---

## WHAT THIS MAKES OF THE CURRENT ENGINE

| | |
|---|---|
| **Viada's, today** | the week (p246), session order, the four intents and their rep/RIR/% bands, exercise categories, accessory dosing, interference rules, the lower-body haircut |
| **Wendler's, today** | the BLOCK: leader/anchor cycles, deloads at 4 and 8, TM test at 12, the 65/75/85 → 70/80/90 → 75/85/95 wave, AMRAP at ≥95%, training max at 85–90%, fixed 5/10 lb increments, reset-on-stall |

⛔ **HIS WEEK ON SOMEONE ELSE'S BLOCK.** Michael, 2026-08-29: *"this is not viada programming at all,
we are just using his exercises and reps."* Correct.
⚠️ **AND VIADA NAMES THIS EXACT FAILURE:** hybrid programs fail when people run *"a complete
powerlifting program and a complete marathon plan simultaneously — that's not hybrid training, it's
two programs stapled together"*, and he holds that the components must not be designed as separate
entities (JTS interview; BarBend interview). A 5/3/1 block under his week is that description.
⚠️ **A 5/3/1 PURIST WOULD ALSO REJECT IT** — the template is meant to be run as written, exercises
unchanged inside a cycle, and this app swaps accessories by feel and reorders sessions around runs.

---

# THE BUILD

## STAGE 0 — TRANSCRIBE, DO NOT DESIGN
1. pp.110–112 into `SOURCE-viada-hybrid-athlete.md` as a new Part (progression), at read-off-the-page
   provenance. Close Part G's implication that strength progression is uncaptured.
2. ⛔ **FIND PART 2's "CIRCLE OF REPS" AND "THRESHOLD ADJUSTMENT METHOD".** p112 points at both.
   Neither is in the corpus. **No progression code may be written until they are read** — this
   workorder exists because a chapter was assumed absent once already today.
3. Read the strength notes on the sixteen untranscribed Ch.10 programs (pp.244–284, images captured).
   If any names a week-to-week loading scheme, it outranks inference.

## STAGE 1 — THE SCORE ✅ SHIPPED TODAY
Viada p215: Epley and Brzycki **averaged**; `viadaWorkingMax` (96%) exported beside it.
⚠️ Stored estimates on old sessions are still Epley-only until re-computed.

## STAGE 2 — THE WORKING NUMBER
Replace Wendler's training max (85–90% of a true max) with Viada's: **96% of a freshly predicted max**
from the p215 pretest. ⛔ **THE TWO MUST NEVER CONVERT INTO EACH OTHER** (Part H). 16 code files read
`training_max`; every prescribed weight comes off it.

## STAGE 3 — THE LOADING CYCLE
Replace the leader/anchor wave with the p112 rotation: **75 / 80 / 85 percent of the predicted max,
week to week, reps adjusted to hold the stimulus.**
⚠️ Deloads: p120 rejects overreach-to-deload for hybrid athletes; p111 permits a lower week that still
overloads. The 4/8 deloads are Wendler's shape and need re-deriving, not deleting by reflex.

## STAGE 4 — PROGRESSION ON EFFORT, NOT ON A CALENDAR
- Raise the max **a pound or two** when the athlete meets targets at **lower RIR than prescribed**, or
  performs consistently above expectation **at** the target RIR.
- Lower it when targets are missed.
- ⛔ **THE MAX IS A LEDGER, NOT A PLATE.** It moves by 1–2 lb unrounded; only the PRESCRIPTION rounds to
  loadable weight (the app already rounds to 5 lb with a bar floor). The bar therefore steps 5 lb when
  accumulated drift crosses a boundary — arithmetic, never a scheduled jump. Michael raised the plate
  granularity and this is the answer to it.
- ⚠️ **ME HAS NO RIR TARGET** (p218). The heavy slot's evidence stays the all-out set — Wendler's
  instrument serving Viada's rule (p123's circle of maxes), and it survives the rebuild.

## STAGE 5 — RETIRE THE WENDLER SURFACE
221 files mention Wendler or 5/3/1. Do this LAST and by grep, not by memory.

---

# OPEN QUESTIONS

- **Q-A. Where is Part 2's "circle of reps"?** p112 says the rotation is outlined there. Blocking for
  stage 3–4.
- **Q-B. What is the "threshold adjustment method"?** Same sentence, same Part 2. It is presumably the
  endurance twin and may settle the six-week cadence question too.
- **Q-C. Deload shape.** p111 allows a reduced week; p120 rejects overreach-to-deload. Nothing read
  states a cadence. The "every 4–6 weeks" figure is from an interview, not a page.
- **Q-D. Block length.** 12 weeks is the app's default, not his.
- **Q-E. Does the rotation apply per lift or per block?** p112 says "week to week in load" for an
  athlete; whether four lifts rotate in phase is not stated.
- **Q-F. Old estimates.** Every stored `estimated_1rm` predates stage 1 and is Epley-only. Re-compute
  or leave forward-only — Michael's call, unasked.
- **Q-H. THE REP CEILING IS PER-LIFT AND IT IS NOT HIS.** `trustedMaxReps` caps the deadlift at 5 reps
  and every other lift at 8, cited to **LeSuer et al. 1997** — a Wendler-era reference carried in
  `wendler-531.ts`. **Viada's p215 gives ONE protocol for the working max with no per-lift variation**,
  and his answer to formula divergence is the average, not a cap. ⚠️ THIS IS WHY THE DEADLIFT CARD
  BEHAVES DIFFERENTLY FROM THE OTHER THREE: Michael's 135 × 10 estimates to 180 and is refused, while
  the same reps on a bench would be accepted. The formula is uniform across the four lifts as of stage
  1; the CEILING is not. ⛔ Decide it against a page, not against the old citation.
- **Q-G. Rep-total sessions poison the estimate table.** 105 × 35 is stored as an estimated max of 225,
  110 × 25 as 200. The trusted-rep ceiling keeps them off lines and records, but they are in the data.

---

# ALSO SHIPPED TODAY (not part of this arc, listed so the next chat is not surprised)

**28 commits, all pushed and deployed.** `origin/main` at `1a11016f`.

- **Strength card** stopped counting warm-ups against the athlete; unweighted sets price at the bar the
  athlete picked (Strong/Hevy default 45), not at body weight; auto-regulated rows are scored at what
  the athlete last lifted; the accessory box opens on their own last weight rather than a ratio off the
  parent lift's max.
- **113 sessions and 129 planned rows re-priced** (`backfill-strength-load`, live run).
- **Run**: grade-adjusted pace now renders — whole-run row and per-segment, with Strava's pace/GAP
  column swap. Two invented governors struck (a 5s/mi difference threshold, a 20-sample floor) and the
  "faded / sped up / consistent" verdict words deleted — no app publishes a rule for them.
- **State screen**: load and ACWR first, trends second (TrainingPeaks/Whoop order); the week's lifting
  joined the week; lift charts render off logged sets rather than the block; efficiency renamed
  **efficiency factor** with TrainingPeaks' own definition and a line telling the reader not to read one
  session; Viada's two lifting doses (sets and effective reps per muscle, heavy and speed reps per
  pattern) built and drawn.
- ⚠️ **STILL OWED ON THE SCREEN:** every sport appears twice — the efficiency cards up top and the
  per-discipline rows below. That is a deletion pass, agreed and not done.
- ⚠️ **VERIFIED: NOTHING.** No human has watched these render except through screenshots mid-session.
