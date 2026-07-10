# RESEARCH — how the field interprets a training session (precedent survey)

**Date:** 2026-07-09. **Method:** deep-research harness — 6 search angles, 25 primary sources fetched, 117 claims extracted, top 25 adversarially verified (3-vote), 25/25 auto-confirmed — **amended to 24/25 on human review (Michael, 2026-07-09); see Corrections below.** **Why it exists:** before building Efforts' per-session endurance interpretation (Load-System Item 3 / the "RESPONSE"), confirm we adopt precedent instead of inventing a scheme. See `docs/DESIGN-endurance-per-session-response.md` for what we do with it.

## Corrections (human review, 2026-07-09)
1. **ACWR band conflation (was the one real error).** Decision 5 originally attributed "0.8–1.3 sweet spot / 1.3–1.5 alert / >1.5 overreaching" to **Polar**. Wrong — that fused Polar's *product* thresholds with **Gabbett's *research* thresholds**. The two are distinct (both corrected inline below):
   - **Polar product status bands (Strain/Tolerance ratio):** Detraining <0.8 · Maintaining 0.8–1.0 · Productive 1.0–1.3 · **Overreaching >1.3**. (Polar calls >1.3 overreaching outright — there is no "1.3–1.5 alert" tier in the product.)
   - **Sports-science thresholds (Blanch & Gabbett 2016):** sweet spot ~0.8–1.3; injury likelihood ~doubles above ~1.5. Polar's separate injury/illness-risk feature draws on this but its limits are *not* identical to the status bands.
   - **For Efforts:** do NOT copy "1.3–1.5 = alert" believing it's Polar's. Efforts already has its own ACWR classifier (`_shared/acwr-state.ts`); the precedent to adopt is "ratio-based, pattern not single-session," not a specific vendor band set.
2. **"Polar requires ≥3 sessions in 28 days" — unverified figure.** Corrected to: Polar needs *weeks* of history before Strain/Tolerance are reliable (showing only an estimate before that). The exact "3 in 28" number is not confirmed in public docs — not load-bearing, don't cite it as fact.

Everything else (sRPE correlation ranges, Foster validation, TSB thresholds, decoupling steady-only caveat, plan-independence, dilute-don't-exclude, abstain-on-cold-start) stands as verified.

**Bottom line:** the field already does what our Constitution says — separate honest readings, no fused grand number, rolling-window smoothing, honest abstention on thin data, pattern-based escalation. Two of our four open design questions turned out to be things **nobody builds**.

---

## The five decisions and what the field does

### 1. Combining objective (body) + subjective (effort) per session — DON'T FUSE
**Precedent: keep them SEPARATE.** Polar Training Load Pro is the clearest exemplar — it computes **three parallel per-session loads** and never fuses them: Cardio Load (TRIMP from HR, objective/internal), Muscle Load (avg power × duration, objective/external), Perceived Load (sRPE = RPE × duration, subjective). They're shown as separate numbers; the user reconciles.
- **The fitness/overreaching STATUS is driven by the objective (HR) signal alone.** RPE/muscle load are per-session displays that do **not** feed the verdict.
- WHOOP is the opposite pole (Recovery is objective-only; subjective inputs quarantined for correlation, never scored). **No major platform fuses one objective+subjective quality number.**
- **When the two disagree, no app arbitrates algorithmically** — the disagreement is surfaced to the user. (Open question: whether intervals.icu/Xert are exceptions — corpus didn't confirm.)
- **Science:** sRPE (Foster, RPE×duration) is validated and correlates strongly with HR-based load (Banister TRIMP r=0.52–0.99; Edwards TRIMP r=0.56–0.97, r=0.83–0.87 in HIFT). But they **diverge systematically** (athletes rate hard sessions harder, easy easier; a rowing camp saw sRPE rise while HR-zone distribution didn't). The literature recommends **pairing, not substituting** — exactly the separate-lines model. [Haddad 2017 Front Neurosci 11:612; PMC6162408; Saw 2016 BJSM]

### 2. Scoring unplanned / unstructured sessions — PLAN-INDEPENDENT BY DESIGN
The dominant load models — **TRIMP, sRPE, decoupling** — need only the session's own HR / power / RPE + duration. **No target required.** Polar Cardio Load computes "for all sports from which heart rate data is available"; TrainingPeaks decoupling reads aerobic quality from the session's own first-half-vs-second-half. **"No plan" does not leave a session uninterpreted** — the plan, if any, only sets a comparison context. [Polar TLP; TrainingPeaks decoupling]

### 3. Confounded / outlier bad sessions — NEITHER EXCLUDE NOR DISCOUNT; DILUTE VIA ROLLING WINDOWS
**No mainstream platform does per-session outlier detection or exclusion.** They dilute structurally:
- Polar: Strain = 7-day rolling avg of daily Cardio Load; Tolerance = 28-day rolling avg (Gabbett). Cardio load "accounts for daily variations" (hydration, fatigue, mood, environment) — no exclusion logic.
- TrainingPeaks: CTL = 42-day EWMA of TSS, ATL = 7-day EWMA. **One session weighs ~2.4% on fitness vs ~13.3% on fatigue** — so a hard/tired day flexes the short window but barely moves the long one. **The smoothing IS the anti-false-decline mechanism.** [Polar TLP; TrainingPeaks ATL/CTL/TSB]

### 4. Cold start / thin data — ABSTAIN, don't fabricate
Honest precedent is **withhold or provisionalize**:
- Garmin/Firstbeat: **"No Status"** until ≥1 activity/week with VO2max (~1–2 weeks); <3 activities in the window → No Status or hold last reading.
- Polar: needs **weeks of training history** before Strain/Tolerance are reliable (shows only an estimate before that); below the WHO activity floor it shows "Productive" and withholds injury risk. *(The exact "≥3 sessions in 28 days" figure I cited earlier is unverified — don't treat it as load-bearing.)*
- WHOOP: builds a personal baseline before judging HRV/RHR. [Garmin FR955/255 manuals; Polar TLP; WHOOP]

### 5. Single session vs pattern / escalation — ROLLING RATIO CROSSING A THRESHOLD, never one off-day
- **Polar product status bands** (Strain/Tolerance): Detraining <0.8 · Maintaining 0.8–1.0 · Productive 1.0–1.3 · **Overreaching >1.3**; >2 while loads rise → rest message. (Corrected — see Corrections; do not read a "1.3–1.5 alert" tier into Polar.)
- **Sports-science thresholds** (Blanch & Gabbett 2016), which Polar's design draws on but does not copy verbatim: sweet spot ~**0.8–1.3**; injury likelihood ~**doubles above ~1.5**. ACWR is contested (caveat 2).
- TrainingPeaks: TSB (=CTL−ATL) +15..+25 peak; −10..−30 productive; **beyond −30 = overreaching, needs rest.**
- Garmin: fuses VO2max + acute load + HRV "over an extended time period"; separates **Overreaching** (load spiked, counterproductive, acceptable <10–14 days) from **Unproductive** (load fine but fitness dropping).
- **None escalate on a single session.** [all vendor docs above]

---

## Caveats (from the verification pass)
1. Vendor labels ("Overreaching", "Unproductive", "restoring") are **product terms, not clinical classifications**.
2. **ACWR is scientifically contested** (Impellizzeri/Lolli: mathematical coupling of acute/chronic terms). Thresholds are conventions, not laws — matches our own load-system posture (D-260 literature note).
3. Decoupling / TSB cutoffs (5%/10%, −30) are heuristics; **decoupling is only valid on steady efforts >~20 min** — do not compute it on intervals.
4. Corpus leaned on Polar / TrainingPeaks / Garmin / WHOOP + sRPE literature; thinner primary detail on intervals.icu, Xert, Runalyze, Stryd, Coros, Oura, HRV4Training (sufficient for the five decisions, not full breadth).

## Primary sources
- Polar Training Load Pro whitepaper + support docs
- TrainingPeaks: ATL/CTL/TSB guide; Aerobic Decoupling (Pa:Hr / Pw:Hr) + EF
- Garmin Forerunner 955/255 manuals (Training Status labels + "No Status")
- WHOOP Recovery methodology
- Haddad 2017 (Front Neurosci 11:612); Saw 2016 (BJSM); PMC6162408 (sRPE vs TRIMP); Blanch & Gabbett 2016 (ACWR)
- intervals.icu decoupling; Strava Engineering (HR effort)

## How it maps to Efforts (the payoff)
- **Validates the Constitution:** separate witnesses + no single grand number = Polar's model, industry-standard. We are not the outlier.
- **Kills two "decisions":** don't fuse feel+body (show two lines); don't build per-session outlier exclusion (rolling windows already do it).
- **Confirms two existing behaviors:** honest abstention on thin data, and ACWR-band pattern escalation — both already in Efforts.
