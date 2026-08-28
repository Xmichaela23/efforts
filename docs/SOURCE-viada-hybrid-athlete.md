# SOURCE — Viada, *The Hybrid Athlete*

**What this is.** The captured prescriptions from Alex Viada's *The Hybrid Athlete*, transcribed from
the book, page-cited. It exists so a build session can specify a plan **without the book in the
room** and without re-photographing it.

**What this is NOT.** Not a spec (nothing here is a build contract), not a decision (those go to
`DECISIONS-LOG`), not a plan. It is a **source extract** — the same role the page citations inside
`shared/strength-system/loading/wendler-531.ts` play for Wendler.

## The rules for using this file

1. **Every number here is Viada's.** Do not add one that is not. If we pick a number he did not
   give, it is a product decision and it goes in a `D-NNN` labelled as ours — never silently into
   this file.
2. **When a number moves into code, cite the page in the code header** (the `wendler-531.ts`
   pattern) and leave this file as the record. Do not maintain a second copy of the same constant in
   two places — the code wins once it exists.
3. ⚠️ **Transcribed from photographs on 2026-08-21. PROVENANCE IS NOT UNIFORM — read §Provenance
   below before trusting any section.**
4. **Convention for future books:** one file per source, `SOURCE-<author>-<book>.md`, sectioned by
   chapter. Michael's standing instruction (2026-08-21) is that future plans are pulled from this
   book rather than invented.

## ⛔ Provenance — which parts were read off the page, and which were not

**Audited 2026-08-21, the same day it was written, in answer to "is it all correct?"**

| Part | Source | Trust |
|---|---|---|
| **A — strength grid** (pp.218–227) | transcribed with the page images open | ✅ high |
| **D — endurance library** (pp.229–241) | transcribed with the page images open | ✅ high, but long and dense — **spot-check a session before coding it as a constant** |
| **E — All Rounder week + notes** (pp.274–275) | transcribed with the page images open; the week table re-verified against `p274.jpg` | ✅ high |
| **B — Ch.4 dosing** (pp.69–125) | ⚠️ earlier-session notes, **part-corrected against the 2026-08-26 re-shoot and the 2026-08-27 second pass** | ⚠️ **MIXED.** Twenty-two pages now read off the photographs — **B4b** (eleven, the endurance-side pages) and **B4d** (eleven, the strength half, pp.71–90). ⛔ **B4d falsified a shipped constant.** Everything named in neither is still one generation removed. |
| **C — week assembly** (pp.128–151) | ⚠️ same — earlier-session notes | ⚠️ one generation removed, **and incomplete: six items are recorded under a heading that says nine.** |

## ⛔ THE PAGE IMAGES — the ground truth

**`/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`**

151 photographs, downscaled, **named by printed page number** (`p231.jpg`). **Local only — not in
git, by decision (2026-08-21): 61MB of binaries that never compress.** Its `INDEX.md` lists every
page, its contents, the full program roster with page pointers, and which page numbers were read off
the page versus inferred from an unbroken shot sequence.

⛔ **When any claim in this file matters, OPEN THE PAGE.** Nothing here is a substitute for the
image, and the one time a section of this file was trusted over the image it was wrong in both
directions — see the changelog.

**Coverage:** pp.69–151 (Ch.4 programming + Ch.5 hybrid training) · pp.218–241 (Ch.9 movement key) ·
**pp.244–284 (Ch.10, all eighteen programs)**.

⛔ **Chapters 4, 5, 9 and 10 are COMPLETELY captured. Nothing in this file is waiting on a page.**
*(pp.228, 257, 267 and 273 are full-page photographs with no content.)*

## Cross-refs

- `shared/strength-system/loading/wendler-531.ts` — the Wendler loading module (its own citations)
- `docs/SPEC-get-stronger.md` — the Strong Focus contract
- `shared/strength-system/protocols/intent-taxonomy.ts` — our existing intent vocabulary
- `docs/TARGET-ARCHITECTURE.md` — where a Viada-shaped plan has to land

---

# PART A — STRENGTH

## A1. The four intents (p218 "Repetition/Set Guidelines", p219 "Abbreviations")

> Sets should always remain on the lower end when starting a program, increasing only if the athlete
> is progressing well and seems to have recovery to spare. (p218)

| Intent | Reps | Load | RIR | Sets |
|---|---|---|---|---|
| **ME** — maximum effort | 1–5 | 90–100% | **no RIR target** | 1–3 |
| **DE** — dynamic effort | 2–4 | 70–80% | 3–4 | 4–6 |
| **SKILL** | 3–5 | 75–85% | 3–4 | 3–5 |
| **HYP** — hypertrophy | 6–12 | — | 0–2 | 3–4 |

**What each intent MEANS (p219):**

- **ME** — improve the ability to move maximal or near-maximal weight. An intentionally heavy set
  focused on peak force per rep. Bar speed still matters but is secondary to moving the weight well.
  ⛔ **Each set is stopped short of failure** — technical/form breakdown here is counterproductive.
- **DE** — bar speed and quality of movement. Velocity and a consistent bar path are the objectives;
  treat every rep as though the bar were loaded to a maximum. Fatigue is discouraged.
- **SKILL** — purely patterning and movement practice. Weight heavy enough to be a challenge, but
  form and consistency take priority over velocity.
- **HYP** — standard bodybuilding-style work. Maximum motor-unit recruitment is the goal; steady
  tempo, controlled yet powerful. **Fatigue is not the enemy** — reps inevitably slow as fast-twitch
  fibres tire and fatigue-resistant fibres engage heavily, and that is desirable (Ch.4), because some
  fatigue of all motor units is practically necessary to reach maximum tension in all of them.
- **DE vs SKILL (p218)** — skill work is focused on *movement perfection*; DE aims for good form but
  with **bar speed as the primary objective**. Despite lower load and reps, the DE emphasis on peak
  output makes it more challenging than comparable skill work.

**RIR, defined (p219).** 2 RIR = terminate the set with two reps in reserve. One more rep would make
it 1 RIR; two more, 0 RIR. ⛔ **0 RIR is NOT failure** — the final rep still completes, though very
slowly.

## A2. Exercise categories (p218–p223, p226)

Five categories. A session slot is specified as **intent × category × movement pattern**
(e.g. "1 × ME: secondary push").

### PRIMARY (p218–219)
Compound movements, barbell or bar, cardinal plane of movement (vertical/horizontal), or
contest-/assessment-specific movement with or without minor modifications to setup.

| Pattern | Movements |
|---|---|
| Primary push upper | bench press · military press · push press |
| Primary pull | pull-up · barbell row |
| Primary hinge | deadlift · paused deadlift · sumo deadlift · trap bar deadlift |
| Primary push lower | back squat · front squat · box squats |

### SECONDARY (p220)
Compound noncontested movements, dumbbell variants — variable form and plane of movement.

| Pattern | Movements |
|---|---|
| Secondary push upper | Larsen press · incline bench press · close-grip bench press · JM press · seated DB press · Arnold press |
| Secondary pull upper | Kroc row · T-bar row · Meadows row · gorilla row · DB pullovers |
| Secondary hinge lower | Romanian deadlift · stiff-legged deadlift · bench reverse hyper · good morning · KB swing · sandbag throw |
| Secondary press lower | split squat · Zercher squat · freestanding barbell calf raises · forward or reverse lunge |

### BRACED (p221–222)
More externally braced movements.

| Pattern | Movements |
|---|---|
| Braced push upper | Smith machine press · machine chest press · dip machine/pressdown |
| Braced pull upper | chest-supported row (high or low) · lat pulldowns (single or double, any grip) · cable upright row |
| Braced push lower | hack squat · leg press · lever squat |
| Braced hinge lower | reverse hyperextension (machine) · GHD back extension · ground-based deadlift machine · machine back extension |

### FOCUSED (p222–223)
Single-joint emphasis (chest / deltoid / lat / hamstring / quad / calf / biceps / triceps).

| Pattern | Movements |
|---|---|
| Focused push/arms | triceps pushdowns · Tate press · behind-the-neck DB triceps extensions · skull crushers · pec deck · lateral raises |
| Focused pull/arms | preacher curls · spider curls · rear delt machine · drag curls · pullover machine |
| Focused push lower/quads | leg extensions · hip adduction machine · weighted knee raises (hip flexors) · seated calf raises |
| Focused hinge lower/hamstrings | machine/Smith machine hip thrust · hamstring curls (seated or prone) · cable or machine kickbacks |

**CORE (p223):** hanging leg raises · crunches · V-ups · dynamic plank variants · ab wheel rollouts

### ⛔ "ASYMMETRICAL" IS A MODIFIER, NOT A CATEGORY — settled 2026-08-21

**There is no asymmetrical category anywhere in the movement key.** The five categories above are
the complete list. This was checked page by page after Michael pointed out that the word does not
appear as a heading; an earlier note in this file wrongly predicted a missing "asymmetrical
category" on pp.224–225, and those pages turned out to be the Olympic lifts (A3).

**Asymmetrical is a way of PERFORMING a movement drawn from an existing category** — a braced push
done one limb at a time is a *braced asymmetrical*; a split squat is a *secondary asymmetrical*.
The category lists already contain the unilateral options, so no separate list is needed.

**The book's only guidance on it, p275 strength notes, verified against the image:**

> *"You can rotate the braced asymmetrical movements with secondary asymmetrical, but if you want to
> incorporate more asymmetrical movements, I encourage you to select those for the secondary
> movement that begins each day. You might not consider split squats or similar for ME lifting, but
> there is certainly no rule that says you can't. This can be an extremely challenging and productive
> way to train!"*

**Two things that sentence settles:**
1. **The asymmetrical slots are interchangeable between the braced and secondary categories** — that
   rotation is the athlete's option, not a prescription.
2. **`Braced push (asymmetrical)` in the All Rounder is LOWER-body**, not upper. He names split
   squats as the example in the same breath, split squat is listed under *secondary press lower*
   (p220), and both occurrences sit on lower-body days. Braced push lower is hack squat / leg press /
   lever squat (p221), so the slot is one of those performed single-leg. ⚠️ **Strongly supported, but
   the book never writes "braced push lower (asymmetrical)" in full — it stays an inference.**

### CARRY / DRAG / PICK (p226)
Movements where the weight is transported from one place to another. A **"pick"** is picking the
implement up and putting it down without forward movement. Several also qualify as hinge/pull/press
during the pick phase — most notably farmer's/frame carries and tire flips.

| Group | Movements |
|---|---|
| Axial loading / carry variants | farmer's carry · yoke walk · frame carry · sandbag carry · Zercher carry · duck walk |
| Push/pull variants | sled push · sled pull · truck push · plate push · sandbag drag |
| Dynamic movement variants | tire flip · Fingal's Fingers |

**Intent applied to carries (p226) — different from the barbell table:**
- **ME** — near maximal weight, the initial pick is a challenge, several steps of movement, RPE 9/10
- **DE** — light weight, emphasis is speed and turnover; fatigue accumulation from rapid "reps" is expected
- **SKILL** — medium weight, emphasis is speed and quality, **no fatigue accumulation**, ample rest
- **HYP** — medium weight, steady velocity, **fatigue accumulation is the target stimulus**

## A3. Olympic lifts — a SEPARATE intent vocabulary (pp.224–225, designation "OLY")

⛔ **THIS IS A THIRD SET OF INTENT NAMES AND IT IS NOT THE ONE IN A1.** The barbell table uses
ME/DE/SKILL/HYP; carries reuse those four names with different meanings (A2); **Olympic lifts use
HEAVY / REP / SKILL / GROOVE.** Only SKILL appears in more than one vocabulary, and even there the
rep structure differs — general-strength SKILL is 3–5 reps, OLY SKILL is **singles**.
**Never resolve an intent name without knowing which family the movement belongs to.**

| Intent | Load | Structure |
|---|---|---|
| **HEAVY** | **90%+** | singles |
| **REP** | 80–90% | steady repetitions until form is compromised |
| **SKILL** | 75–85% | **singles**, until the form target is reached |
| **GROOVE** | 70–80% | quality singles through triples, **nonfatiguing, stopping well shy of breakdown** |

**The three OLY movement categories:**

| Category | Definition | Movements |
|---|---|---|
| **PRIMARY** | any full lift performed to competition standard | full clean · jerk (split or push) · full clean and jerk · full snatch |
| **PARTIAL VARIANT** ("VARIANT") | any component or partial-range-of-motion variant of a competition lift | clean from low/high hang · clean low pulls · hang snatch · split jerk / push jerk off blocks · clean / snatch from blocks |
| **MODIFIED VARIANT** ("MOD") | any lift performed with altered movement patterns, or patterns not seen in a competition lift | tall jerk · push jerk *(competition legal, but rarely performed)* · clean high pulls · drop snatch · snatch balance · power variants of the competition lifts |

**What each OLY intent MEANS (p225, "Additional Abbreviations"):**

- **HEAVY** — sets intended to challenge with high-percentage weight. They require being mentally and
  physically prepared to perform a high-skill movement at high output. ⛔ **If you are mis-grooving
  early in a session, heavy sets should typically be AVOIDED and skill or groove work done instead,
  because poor practice with heavy loads is disproportionately counterproductive.**
- **REP** — more *"clustered singles"*: practising solid, challenging weight multiple times with less
  setup time than singles normally involve. **Exposes balance and bar-path problems quickly because
  mistakes compound across the set.** Performed properly, these sets are the foundation of specific
  strength in many of these lifts.
- **GROOVE** — same loading as skill work, different objective. **Skill work is *building* toward
  proper form; groove work is done when already warmed up and moving well** — it is *"quality
  practice."* ⛔ **The prescribed repair path: if you are moving poorly on heavy or rep work, drop to
  SKILL sets until form is right, then lower the weight slightly for GROOVE work until fatigue.**

⛔ **OLYMPIC LIFTING IS OUT OF SCOPE FOR EFFORTS — ruled by Michael, 2026-08-21.** This section is
recorded for completeness only. **Do not build this vocabulary and do not propose Olympic
programming.** Two programs use it and both are therefore out of scope: **Weightlifting and Running**
(p282) and **The Speed Solution** pivot's triple-extension day (p276) — the only program that mixes
OLY into an otherwise ordinary week. The All Rounder does not use it at all.
*(This does not touch plyometrics or the ME/DE/SKILL/HYP barbell work, which stay in scope.)*

## A4. Plyometrics (p227)

⛔ **All drills are done SEPARATELY. More than three or four plyometric movements on a given day is
likely a waste of time.** Each drill is performed multiple times with ample rest and full focus on
technique and balance and consistent quality. Each drill is done **until the movement is optimized
for the day and the athlete develops confidence in it — then they move on.** Fatigue, poor form and
imprecise movements are absolute no-nos.

| Bucket | Benefit | Drills |
|---|---|---|
| Bounding and skipping / dynamic movement | running gait and speed | A/B skips · distance bounding · prime times (stiff-legged run) |
| Control and ground-contact-time reduction | general speed and explosiveness | single-leg hops · rebound jumps · skater hops · lunge hops · pogo hops |
| Footspeed and movement drills | general foot/leg control (**not** true agility) | ladder drills (footspeed and mobility, not true plyometrics) · Ickey Shuffle · hopscotch |

---

# PART B — DOSING AND ACCOUNTING (Chapter 4, pp.69–125)

## B1. Strength dose

- Each **movement pattern** ideally trained **2×/week**; floor is **once per 8–9 days**.
- Per movement pattern per week: **4–6 reps above 90%** plus **15–20 velocity reps at 70–85%**.
- When adding volume, **3:1 speed-to-heavy**.

## B2. Hypertrophy dose

- **1–2 reps in reserve — never to failure.**
- **~4 effective reps per set.**
- **8–12 sets per muscle per week** is solid; **18–20 borders overreaching**.
- Therefore **32–48 effective reps per muscle per week** recommended; **70–80 is the maximum**.
- **8–10 reps** is the preferred range. Very high reps induce equal fatigue with no extra growth.
- **Isolation/machine work for hypertrophy**; compounds reserved for strength work.
- **6–8 work-set sessions recover in ~24–48h; 14+ sets can cost up to 72h** — the case for
  high-frequency / lower-volume sessions.

## B3. Endurance dose

- **VT1 bouts: minimum ~10–15 min each.** Rarely more than **2h of VT1 in one session**.
- ⛔ **CARDIAC DRIFT IS A SESSION-TERMINATION RULE, NOT A MONITORING NUMBER (p107, read directly
  2026-08-21).** *"I use cardiac drift as a general guideline when assessing the maximum recommended
  dose of easy/VT1 work in a given session, with the overall recommendation being that **a session is
  terminated when cardiac drift reaches 10 percent** (either a given pace/output at a given heart
  rate is 10 percent slower, or the heart rate goes up by 10 percent at a given pace/output). **For
  hybrid athletes engaged in numerous weekly sessions, OR if a session will be followed by a 'key'
  session … within 24 hours, the number is 5 percent.**"*
  ⚠️ **The 5% applies to our whole audience on both counts, not only before a key session** — an
  earlier note in this file had the "key session within 24h" half and missed the "hybrid athletes
  engaged in numerous weekly sessions" half.
  A **"key" session** is defined on the page as *"one targeting a system or adaptation that you're
  hoping to improve in the current training cycle."*
- **6–8h between two-a-days** (4–6h if the morning is a sub-hour VT1 session).
- Weekly floor: **one speed session, one subthreshold session, remainder at VT1 or below.**
  **All minutes count**, whatever the modality.
- **Threshold session shape:** 4:1 work-to-rest; rest between 30s and 2 min even for 8–15-min
  intervals; intervals over 15 min become tempo/single efforts. Hybrid threshold sits a few points
  below running-program norms — *"worked but not shattered."*
- **Subthreshold repeats** at 90–94% with full rest. Max tolerable subthreshold dose ~30–40 min for
  beginners, **~120 min elite ceiling**.

## B4. Zones (six-zone table)

Zone 2 tops out at **VT1** (talk test). Zone 3 = subthreshold, up to **VT2**. Zone 4 = VT2 to
vVO2max. Zone 5 anaerobic, zone 6 sprint — ⛔ **zones 5 and 6 are governed by resistance-training
principles, not endurance ones.** **CP** = the practical 30–45-minute pace; a useful above-VT2 target.

## B5. The five accounting buckets, and the change rule

Track weekly, across **all** modalities:

1. sub-VT1 minutes
2. near-threshold minutes
3. over-threshold minutes
4. high-intensity work sets
5. effective hypertrophy reps per muscle group

⛔ **Change any bucket by less than 10% per week — ideally ≤5%.** When overreaching, back off **all**
buckets equally. Intensity may rise inside a flat split.

## B6. Maintenance

- **~1/3 of productive volume, at least 1×/week, holds an adaptation.**
- As event volume climbs, taper the non-event buckets — but **keep the low-percentage high-velocity
  skill work**.

## ⛔ B4b. THE RE-SHOOT — pp.69–131, read off the photographs 2026-08-26

**Michael re-shot the chapter** (`~/Downloads/Endurance period/`, IMG_3637–3698, 62 frames, one page
each: image number − 3568 = page). ⚠️ **THE SHOOT OVERRUNS PART B.** It runs pp.69–131, so it covers
Ch.4 (Part B) *and* the opening of Ch.5 — pp.128–131, which is **PART C's** territory. The folder is
named for endurance; the pages are the whole programming chapter.

⚠️ **THIS SECTION RECORDS ONLY THE PAGES THIS PASS READ — 69, 70, 92, 98, 103, 107, 116, 120, 122,
123, 131.** ✅ **A SECOND PASS ON 2026-08-27 READ ELEVEN MORE — pp.72, 76, 77, 78, 80, 84, 85, 87, 88,
89, 90 — and they are in §B4d, not here.** ⛔ **That pass falsified a shipped constant**: p78 has a
section titled "Rest Periods", and we shipped code asserting the book gave none. **Part B's
provenance downgrade in Part G item 6 still stands for every number named in neither section.**

### ⛔⛔ "THE CIRCLE OF MAXES" — p123. GAP G-8 IS ANSWERED, AND IT CHANGES A LABEL WE SHIPPED.

`E1c` records p247's *"progress here should be through the circle of reps"* with the warning that the
phrase **is not defined on that page and appears nowhere else in the corpus**, and
`progression.ts`'s `DOUBLE_PROGRESSION_IS_OURS` ships our mechanism labelled OURS on exactly that
basis. **p123 defines the mechanism.** He calls it the circle of MAXES:

> *"As the weeks progress, athletes may rotate through the "circle of maxes," varying repetition
> ranges and using their expected performance on each as a baseline. If an athlete repeatedly
> succeeds at these lifts or outperforms, the coach may, after a period of time, raise their
> theoretical 1-rep max and base the next few training microcycles/training weeks on this new max."*

⛔ **THAT IS THE MECHANISM WE BUILT** — repeated success at a prescribed rep target raises the number
the next block is prescribed from. ⚠️ It is not proof the two phrases are the same ("reps" vs
"maxes", 124 pages apart) and the labelling call is Michael's, not this file's. **Reported, not
relabelled.**

### ⛔⛔ HOW AN ATHLETE KNOWS TO ADD OR CUT — p123, and the answer is NOT purely objective

The question this re-shoot was taken to answer. He gives the endurance case directly:

> *"Similar calculations may be done for endurance-focused workouts… If the athlete is completing
> these sessions and exceeding performance expectations (**lower heart rate at completion, lower
> reported RPE, reducing rest periods** on variable-rest workouts such as self-led fartleks, and so
> on) **after six weeks** of training and rotating in numerous intervals and percentages that
> represent similar "sufficient but not excessive" stimuli, the coach may lower (speed up) the
> threshold pace by several seconds per kilometer and base the new training cycle on this updated
> figure."*

⛔ **THREE SIGNALS, AND ONE OF THEM IS FEEL.** Lower heart rate is objective; **lower reported RPE is
subjective**; reducing rest on self-led work is behavioural. So the earlier reading — *"his adjustment
guidance is entirely objective"* — is **CORRECTED**: reported RPE is one of the three indicators he
names, and it sits beside the objective ones rather than under them.

⚠️ **AND THE CADENCE IS SIX WEEKS**, not a month. ⚠️ **AND HE ADJUSTS THE TARGET, NOT THE VOLUME** —
every signal above moves the *threshold pace* the next cycle is written from. **Nothing on these
pages says an athlete should add or cut weekly HOURS by feel.**

⚠️ **THE ONE PLACE FEEL IS AN IN-SESSION INSTRUCTION** is p98, on subthreshold rest: repeats
*"separated by full rest or walk periods that allow you to complete subsequent sets while feeling
relatively **'fresh.'**"*

⛔ **AND ONE LINE SITS AGAINST "START ON THE LOWER END"** (p122). He argues for starting AT trainable
potential:

> *"I strongly advocate for steady progression that starts at trainable potential (as opposed to
> **starting well below potential** and then progressing to overreaching — a tactic that provides more
> rewarding-feeling progress but little other advantage)."*

⚠️ **HE IS TALKING ABOUT THE TRAINING MAX AND WORKOUT TARGETS, NOT WEEKLY ENDURANCE HOURS.** It is a
tension, not a contradiction, and it is Michael's to weigh — but a screen that says "start low"
should know he has a sentence arguing the opposite about a neighbouring quantity.

### ⛔ CONFIRMED OFF THE PAGE

- **Cardiac drift 10% / 5% — CONFIRMED, p107**, and it is a session-TERMINATION rule:
  > *"a session is terminated when cardiac drift reaches 10 percent… For hybrid athletes engaged in
  > numerous weekly sessions, or if a session will be followed by a "key" session (one targeting a
  > system or adaptation that you're hoping to improve in the current training cycle) **within 24
  > hours, the number is 5 percent**."*
- **Subthreshold 90–94% — CONFIRMED, p98:** *"repeats in the 90 to 94 percent of threshold range,
  lasting for a kilometer or so."*
- **Overreach-to-deload rejected — CONFIRMED, p120**, already marked read-directly.
- **Six-zone table — CONFIRMED, p92**, Table 4.1, with the full per-zone bounds and durations.

### ⚠️ CORRECTIONS AND REFINEMENTS

- ⚠️ **VT1 BOUT LENGTH IS A FLOOR, NOT A PRESCRIPTION (p107).** B3 records *"VT1 bouts 10–15 min"*.
  The page says the opposite shape: *"At lower intensities, single bouts of much less than 10 to 15
  minutes are, therefore, unlikely to be worthwhile."* **10–15 minutes is the MINIMUM below which a
  bout stops being worth doing** — not a prescribed bout length.
- ⚠️ **SUBTHRESHOLD REST IS "FULL REST OR WALK", NOT 4:1 (p98).** B-notes record threshold work at
  *"4:1 work-to-rest"*. p98 prescribes *"more complete rest periods than you may be accustomed to…
  full rest or walk periods"* — considerably MORE rest than 4:1. ⛔ Either the 4:1 belongs to a
  different intensity or the note is wrong; **the page for 4:1 has not been found yet**, so this is
  flagged rather than overwritten.
- ⚠️ **THE DOSING VARIABLE IS TIME-AT-INTENSITY (p98):** *"the total duration of time spent near
  threshold is the relevant variable at play here, and being in an extremely high fatigue state
  during this period is not necessary for adaptation."*

### ⛔ HE USES THE PHRASE "TRAINING MAX" HIMSELF — p122

> *"the testing I recommend is an assessment of "typical day potential"… utilizing a **"training
> max"** or relative percentage of "perfect race performance" is preferable to utilizing "perfectly
> peaked" performances when structuring workouts."*

⛔ **THIS DOES NOT SOFTEN PART H'S RULE.** Viada's training max is a typical-day potential; Wendler's
is 85% of a true 1RM. They remain two quantities wearing one English word, and no function may accept
both. What changes is only that **the phrase is his, not our paraphrase.**

⚠️ **AND p122 GIVES BRZYCKI ALONE, WITH THE FORMULA:** *"1 rep max = weight / (1.0278 − 0.0278 ×
reps)"*, worked as 200 kg daily max → 178 kg 5RM → ~150 kg 10RM. Part H (p215) records the working max
as **Epley and Brzycki AVERAGED**. Two different passages, two different jobs — p122 is illustrating
workout targets, p215 is deriving a working number — but **anyone coding either should read both.**

⛔ **AND HE RULES OUT 0 RIR FOR STRENGTH WORK (p122):** *"training to 0 reps in reserve is
inadvisable (and performing multiple sets that each represent one's daily maximum potential is nearly
impossible)"* — the example leaves *"about 2 reps in reserve."*

### ⚠️ NOT YET FOUND ON A PAGE

The five accounting buckets, the 10%-per-week change rule, the "back off all buckets equally"
instruction, the weekly floor (one speed / one subthreshold / remainder VT1), the 6–8h two-a-day
spacing, the 4–6h post-VT1 spacing, the ~1/3 maintenance figure, and the 2h VT1 session ceiling.
**All still carry Part B's one-generation-removed provenance.** They are in neither the eleven pages
this pass read nor the eleven §B4d read on 2026-08-27; they are likely in the ~40 frames still
unread, which are almost all pp.91–131, the endurance half.

## ⛔ B4d. THE RE-SHOOT, SECOND PASS — pp.71–90, read off the photographs 2026-08-27

**Same shoot as B4b** (`~/Downloads/Endurance period/`, IMG_3637–3698 — ⚠️ **these frames are in
Downloads, not `book-sources/`**). This pass read the strength half of Ch.4, which B4b had left
unread: **pp.72, 76, 77, 78, 80, 84, 85, 87, 88, 89, 90.**

⚠️ **PROVENANCE — the same as B4b, one notch better on page numbers.** Read off the photographs,
not the printed book; but **every page number below was read off the printed page itself**, not
computed from the filename. That matters because B4c records the `IMG − 3568 = page` formula drifting
past p109. It holds across this range, and the pages confirm it.

⛔ **THIS PASS FALSIFIED SOMETHING WE SHIPPED.** See the first entry.

### ⛔⛔ p78 — "REST PERIODS". THE SECTION WE SHIPPED A CONSTANT SAYING DID NOT EXIST.

`strength-grid/intents.ts` shipped `REST_BETWEEN_SETS_NOT_STATED` — *"The source gives no rest
interval for these sets"* — and gap #10 of the twelve said the same. **p78 carries a section titled
"Rest Periods".** Both are corrected as of 2026-08-27.

> *"For strength training, you're primarily concerned with the ability to generate productive force
> in a given movement pattern. Fatigue is the enemy; as the muscles begin to become fatigued, the
> fast-twitch muscle fibers (larger motor units) begin to contribute less to the movement."*

> *"Therefore, if you're interested in maximizing strength, you should focus on movement quality and
> generally avoid excessive fatigue. **Rest periods between sets should be sufficient to allow nearly
> full recovery (though not so long as to allow you to cool down), and sets should stop well before
> failure, with several reps in reserve.**"*

> *"Developing the ability to "grind" under heavy weights may be an asset, but it should represent a
> small portion of training. Overall, true strength sessions should have very little accumulating
> fatigue. **In other words, hit the next set when you know you can complete it without getting
> crushed.**"*

⛔ **IT IS A RULE, NOT A NUMBER. HE GIVES NO MINUTES, HERE OR ANYWHERE.** Any clock a surface shows
is OURS and must be labelled OURS. What this page supplies is the condition the clock is standing in
for — a readiness test, not a duration.

### ⛔⛔ p84 — AND HYPERTROPHY GETS THE OPPOSITE RULE

> *"Strength and power training typically dictate that this point of reduced capacity represents the
> end of a productive session, but **in hypertrophy training, this may well be a crucial part of the
> training session itself!**"*

⛔ **THE TWO PAGES DISAGREE ON PURPOSE.** p78's avoid-fatigue rule is a *strength* rule. A surface
that stamps it on a HYP slot is quoting him against himself. This is the same inversion already
recorded in the p226 carry table, where SKILL's fatigue is `avoid` and HYP's is `target`.

### ⛔⛔ p80 — "HOW MUCH STRENGTH WORK DO YOU NEED?" A FULLY QUANTIFIED DOSE WE DID NOT HAVE

- **Minimal effective dose:** *"at least one session every eight to nine days to get any consistent
  improvement in a specific skill movement."*
- **The ME/DE weekly rotation, as a principle** — and until 2026-08-27 our code cited only p247's
  program-specific instance:
  > *"I recommend that every strength movement be ideally trained at least twice per week, or once
  > every three to four days, with at least one day focused on heavy/near-maximum lifting (lower
  > repetitions over 90 percent) and one day focused on velocity."*
- **Session volume:** *"Total volume per session may not be tremendously high."*
- ⚠️ **THE WEEKLY CAP, WHICH WE DO NOT ENFORCE:**
  > *"For a given movement pattern, 4 to 6 repetitions over 90 percent and 15 to 20 velocity-focused
  > repetitions per week (between 70 percent and 85 percent) may be sufficient for consistent
  > progress at most levels, with more advanced athletes benefiting from more."*
- **If more is tolerated:** *"I recommend adding speed/proficiency/skill work sets in a 3:1 ratio to
  heavier sets (of 1 to 3 repetitions) with over 90 percent effort."*

⚠️ **OPEN AGAINST OUR ME RAMP.** The ME slot ramps 1→3 sets at a 1–5 rep band, so a fully ramped week
can exceed 4–6 reps over 90 percent for one pattern. **Raised, not resolved — the band is unchanged
and nothing here may be used to change it without a ruling.**

### ⛔ p72 — TRAINING TO FAILURE, AND WHERE ME/DE COMES FROM

> *"Training to failure is neither required nor terribly productive if the goal is increasing
> strength."*

- Training for strength *"focuses on quality of movement and expression of maximum force/velocity."*
- *"There's considerable overlap between rate of force production and the force curve, but these two
  things are not the same."*
- **The vocabulary is Westside's, and he says so:** *"Westside-style conjugate training was an early
  influence on me, and many principles taken from this system proved instrumental in early hybrid
  programming."* Its dual emphasis: (a) velocity / rate of force production, and (b) *"engaging in a
  variety of movements **related** to the primary lifts."*

### ⛔ p76 — THE PULL-QUOTE, HIS EMPHASIS

> *"When you perform a strength movement, generally speaking, **every rep either improves movement
> quality or degrades it!**"*

⚠️ Set as a display pull-quote on the page, not body text. ⛔ **It carries no percentage and no
load**, which makes it the one strength cue in this corpus that stays true on a bodyweight row.

### ⛔ p77 — "DYNAMIC EFFORT AND MAXIMUM EFFORT": GO IN FRESH

> *"The primary takeaways are that in hybrid programs aimed at strength, ensuring that you are
> minimally fatigued prior to and during strength movement practice can be crucial because high
> fatigue can impair proper motor unit recruitment. In fact, it can lead you to learn improper
> coordination patterns and expressions of force output. To put it another way, if you're tired, you
> move slowly, lift slowly, and may not engage the very motor units you're supposedly learning to
> recruit and coordinate. This is not always a detriment, but you should nevertheless ensure that you
> perform a certain portion of your strength training at a high level of specific readiness!"*

### ⛔ p78 — HIS ME AND DE DEFINITIONS, WHICH ARE NOT p219'S

⚠️ **A SECOND DEFINITION OF THE SAME TWO WORDS.** Part A1 carries p219's abbreviations table. p78
defines them by *purpose*, and the purposes are what a cue should be built from:

- **Dynamic effort** — *"allows for higher volumes of coordination development work without the same
  orthopedic and psychological stress of heavy weights."*
- **Maximum effort** — *"often involves rotating lifts that may train certain sport-related patterns
  of motor unit recruitment without necessarily stressing all the muscle groups involved in a major
  lift (for example, wide-stance good mornings as opposed to squats — training similar hip hinge with
  less quadriceps fatigue)."*

### ⛔ p85 — THE CYCLIST WHO ALSO WANTS MUSCLE. OUR CUSTOMER, NAMED.

> *"If you're cycling as well as training for muscle gain, you may find that training your legs with
> high intensity and volume in the weight room twice per week leaves you few days when you can do
> productive bike work. Consequently, the hypertrophy work must be far more conservative."*

> *"…many hybrid "hypertrophy" programs focus on more single-joint movements for hypertrophy, and
> train compound movements in almost exclusively strength-based rep ranges."*

⚠️ Same page, on volume: *"Few athletes can perform multiple consecutive sets to true failure with a
given muscle group, so many studies that cite high numbers of failure sets per week can likely be
discarded as being of questionable veracity."*

### ⛔ pp.87–88 — PLYOMETRICS ARE NOT OPTIONAL

> *"In my opinion, plyometrics are an absolute game changer in hybrid programs. **They must be
> included in hybrid programs**"* — because they play a vital role in movement efficiency/economy;
aid injury reduction (balance and control reduce chronic and acute improper loading); benefit agility
and general physical preparedness; **have a relatively low recovery cost**; and can be incorporated
into training sessions easily.

**Placement (p88):** *"they can be their own training session, used as a warm-up before sprint work
or speed work, or done before high-skill resistance training sessions."* And: *"finding ways to work
various plyometric and agility drills into as many sessions as possible, allowing for a high
aggregate training volume to be done with minimal interference with the rest of the program."*

Also p88: *"Plyometric drills are also useful in that they can play a strong role as both a
preparatory and a stimulatory movement."* And plyos *"can help even loaded movements and carries"*
return large benefits for *"a relatively insignificant time commitment."*

### ⛔ p89 — "BUILDING TO PLYOS": A PROGRESSION LADDER WE DO NOT IMPLEMENT

> *"Plyometrics can range from simple to highly complex. A simple jump is a plyometric movement that
> most people should be capable of performing, but for many athletes, more advanced movements like
> bounding and lateral hopping may be challenging. As such, **I typically introduce an athlete to
> plyometrics via a combination of foot-speed drills and static plyometrics.**"*

The ladder, in his order:

1. **Foot-speed drills** — agility ladders, *"stepping through rapidly in given patterns"*. ⚠️ They do
   not build agility; they build familiarity with the body's position in space. *"Rapid precise foot
   movement and placement are precursors to proper jumping and bounding."*
2. **Static plyometrics** — single-legged hopping in place, side to side over a line, box in-outs.
   ⚠️ **These differ from foot-speed drills in that the centre of gravity moves up and down rapidly**,
   whereas foot-speed drills involve slow movement/migration of the centre of gravity.
3. **Balance** — *static* (hold a position against perturbation) and *dynamic* (control the centre of
   gravity in a precise direction, with full control over continued movement and redirection: *"can
   you jump from point to point without needing to stop and balance or reorient?"*). ⚠️ He is explicit
   that **static balance is not necessarily a precursor to dynamic balance** — standing on one leg all
   day *"won't necessarily improve your ability to jump from one foot to the other."*
4. **Conventional dynamic plyometrics** — *"With these skills mastered (which can be taught relatively
   easily), you can proceed to more conventional dynamic plyometrics, such as skipping, bounding, and
   hops/jumps."*

⚠️ Part A2's plyometrics entry (p227) is the movement list. **This is the sequencing rule for it**,
and nothing in our code does it today.

### ⛔ p90 — WHERE THE STRENGTH HALF ENDS

p90 opens **"ENDURANCE TRAINING PRINCIPLES"**. Everything from there to the end of the shoot (p131)
is the endurance half; B4c already relays the load-bearing pages inside it.

## B7. Progression, testing, periodization

- Progressive overload is a **principle, not a ratchet**; load increases are RPE-gated.
- **PAP protocol:** 70–90% loads at 2–3 RIR; starting template ~80% × 3×6 then **6–8 min rest**.
- **Hybrid periodization's four cores:** submaximal always · full-spectrum maintenance · rotate
  structure at the same stimulus · overreach-to-deload breaks down in hybrid training.

### ⛔ WHY OVERREACH-TO-DELOAD IS REJECTED (p120, read directly 2026-08-21)

**The reason is a timeframe mismatch between disciplines, not a preference.** Quoting the mechanism:
a strength athlete who pushes into functional overreaching can deload for a week and get a delayed
peak — *but only if they actually recover*. If they keep running through that deload week they never
get the full rebound, and *"may, in fact, be unable to pull themselves out of their overreached state
unless they dramatically reduce their running volume at the same time."* Cutting the running is
itself a cost, because **running does not share resistance training's overreach-to-rebound curve** —
running tapers can pay off over more than a week.

> ⛔ His conclusion, verbatim in substance: *"this 'overreach to deload' will always be suboptimal for
> at least one discipline, and it may result in slower progress at best and overtraining/stagnation
> at worst."*

**And he rejects heavy monitoring in the same breath.** The preceding bullet — *variation in workout
structure with the same target stimulus* — is recommended partly because rotating rep ranges,
interval durations and rest periods *"highlights areas of relative weakness **without requiring
excessive testing/analysis on an ongoing basis**."*

⛔ **SO THE MODEL IS NEITHER VIBE NOR SURVEILLANCE: the standard week is built to be sustainable
indefinitely, so no hole gets dug and no rescue is needed.** That is why his programs say they can be
run indefinitely and why the taper/deload column is a *tool you deploy* (race approaching, break
needed), not a scheduled recovery from accumulated damage.

⚠️ **DESIGN CONSEQUENCE FOR EFFORTS.** The five buckets and the <10%/week change rule are therefore
**preventive guardrails, not a deload detector**. Using them primarily to decide "you need a light
week now" inverts his model. Their job is to stop the week from ever climbing fast enough to require
one.
- **Testing:** the training max is "typical-day potential"; Brzycki for estimation; progress without
  retesting; tests exist for troubleshooting.

---

# PART C — WEEK ASSEMBLY (the hybrid programming chapter, pp.128–151)

## C1. Groundwork

- **Step 0 / consolidate stressors** — decided per session by asking *what does this session
  require*, **not** by sorting strength against endurance.
- **Keystone sessions get the most-recovered slot.**
- Rest days and 7-day microcycles are **optional constructs**; 2–3 week cycles are fine.
- **Trim the fat** before adding anything.
- ⛔ **Evolve the current program into hybrid by auditing its existing buckets — never cold-start.**

## C2. The session-order rules (pp.139–145) — ✅ **COMPLETE, read from the images 2026-08-21**

⛔ **THE SINGLE MOST IMPORTANT FACT ABOUT THESE RULES: THEY GOVERN ORDER *WITHIN* A SESSION, NOT
WHICH SESSIONS MAY SIT ON ADJACENT DAYS.** Every "must not follow" constraint in the chapter is about
sequencing exercises inside one session. **Nothing in pp.130–131 or pp.139–145 forbids two session
types from being adjacent in the week.** That was checked deliberately; it is absent, not missed.

1. **Just enough warm-up.** A warm-up prepares the body to work, it is not itself a stimulus.
   **RAMP** — Raise (heart rate above resting; "even a 3- to 5-minute VT1-intensity ride on the air
   bike will suffice"), Activate, Mobilize (mobility through mild progressive loading of the patterns
   about to be used, not passive range of motion), Potentiate (leads directly into the first work).
2. **2a — Skill work first.** Work where proficiency directly affects performance is done fresh and
   takes priority over everything else in the session. *"The first set of your skill work should also
   be the last set of your warm-up."* ⚠️ **This holds even when the skill movement is not the
   traditional main lift of the day** — freshness need sets the order, not exercise category.
3. **2b — Layer skill work for post-activation potentiation.** Skills using similar muscle groups but
   **dramatically different specific patterns and loads** can be supersetted so both benefit.
   ⛔ Named violation: high-bar back squat supersetted with front squat — *"two similar skill
   movements with similar intensities, so they'll work at cross-purposes."*
4. **3a — Skill-adjacent work second.** Everything that directly serves the target skill (heavy good
   mornings, banded squats, box squats, contrast supersets) comes before anything else. Work that is
   drastically different in focus, **or similar in pattern but different in intent**, must not follow
   skill work — **unless all the day's sport-skill work is finished.** That is the stated exception.
5. **3b — Never perform a sport skill with non-sport intent.** High-rep squats to failure straight
   after heavy squats trains reduced velocity and a lower force peak — it trains the skill wrong.
   To add light volume use more low-fatigue high-intent sets: *"3 sets of 10 on squats to near
   failure would be a far worse idea than 6 sets of 3 or 4 repetitions at 80 percent, each set done
   at peak velocity."* *"Perfect practice makes perfect… if you're performing the movement poorly,
   STOP."*
6. **4 — Core work before isolation work, after the main work.** Order is **main → core → isolation**.
   Isolation work is rarely degraded by a tired core; core work carries the higher skill component.
   Core is not necessarily crunches — dynamic throws, rotational med-ball, landmine work all count.
7. **5 — Work that benefits from pre-fatigue goes last.** Almost always VT1-intensity endurance.
   *"You could cut your VT1 run volume by a third or so after a hard leg workout and get the same
   overall adaptations."*
8. **6 — You can train more than once per day.** Not a hard rule. **Skill movements are best in the
   first session**, being freshest. Allow **at least 6–8 hours** before the resistance session; **if
   the morning session is a VT1 session lasting under an hour, 4–6 hours may be sufficient**, with
   one full meal in between.
9. **7 — A rest day is not always needed.** An easier activity can be more rejuvenating than sitting
   at home. **Consolidation of stressors determines whether a rest day is actually needed** — a run
   of keystone workouts may require a full rest day before the cycle starts.
10. **8 — Every week does not have to be the same.** A neat seven-day microcycle is an artificial
    constraint. **Good hybrid programs may need two to three weeks to hit every necessary workout
    type.** If a nonnegotiable would suffer, *"strongly consider a two-week microcycle"* — drop it to
    a maintenance stimulus one week, bring it to the front the next.
11. **9 — A single session can bounce all over the place.** ⛔ *"There's no rule against squats, then
    outdoor sprints, then high-rep leg extensions, then an easy bike, all in one session, if that's
    how the pieces fit best."* Defy convention.

### ⛔ CONSOLIDATING STRESSORS — AND THE MISREADING HE CORRECTS (p130)

**It does NOT mean "clump the intense work together and the volume work together."** He names that
as a misreading of the first edition; the old volume-vs-intensity weekly graph is *"still
conditionally relevant, if now considered incomplete."*

**What it actually means:** examine each session for what it *requires*, and arrange the week so
nothing that needs to recover fails to — so no session, especially a critical one, becomes *"a
heavily fatigued write-off."* Two driving questions:
1. **What systems are required for peak performance here** — never the genre label "strength" or
   "endurance." His own example: *"a lower-body, mentally challenging, high-skill session requiring
   high motivation… can incorporate both higher-intensity squats and speed work on the track
   provided that fatigue is minimized."*
2. **What kind of fatigue would prevent me achieving the stimulus here?** About what the session
   *requires*, not what it *fatigues*. A program can violate the expected weekly flow entirely and
   still satisfy consolidation, as long as each session's objective stays completable.

### ⛔ KEYSTONE SESSIONS — NOT "THE IMPORTANT ONES" (p131)

> *"Keystone sessions are not 'the critical sessions.'"* If a session isn't important it shouldn't be
> in the program at all. **"Keystone sessions are the ones that require you to be in the most
> recovered state to perform"** — *"the sessions that are most likely to be counterproductive if
> you're fatigued."* Also called **the nonnegotiables**.

**The placement law:** a keystone must be preceded by whatever recovery state it specifically
requires — **fresh in the relevant systems, not fresh overall.** Understanding which systems a
keystone actually taxes, and therefore what to avoid beforehand, is *"the make-or-break of hybrid
programs."*

✅ **Superseded 2026-08-21 — the full set is above, read from `p139.jpg`–`p145.jpg`.** The earlier
six-of-nine reconstruction is gone. Rule numbers here ARE the book's and may now be cited.

## C3. Cross-training policy (pp.135–138)

- **Proficiency first** — 4–5 week crash course for a new modality, 2–3 week refresher.
- **Cross-train the easy volume, never the quality work.**
- Variety when injured.
- Similar-modality threshold work **only when volume-capped**.

---

# PART D — THE ENDURANCE SESSION LIBRARY (Chapter 9, "Movement Key", pp.229–241)

⚠️ **Percentage basis.** Running (p229, stated): percentages are **percent of threshold
speed/pace/output, with 100% = threshold/VT2**. Other paces are given as discrete pace regions
(e.g. "greater than vVO2 pace").
⛔ **Cycling: the book's cycling opener (p236) states NO equivalent convention.** Our reading — that
cycling percentages are **percent of threshold power** — is an **INFERENCE**, supported by the
running convention in the same notation, by the anaerobic page calling the quantity *power*, and by
internal consistency (sweet spot 80–95% "as close to threshold without exceeding it", VO2 110–120%,
endurance "below 75%"). **It is not a captured statement. Label it as inferred wherever it is used.**

## D1. RUNNING

### Sprint / Power (p229–231)
Paces based on **performance and RPE**, not specific pacing — faster than vVO2, but speed depends on
*"tolerable output for the day"* unless noted. **"All-out" = best possible speed for the day.** Work
intervals may be done on hills with pace adjusted to hold target intensity. Flying starts may include
a brief jog; pace should be roughly LT pace when the interval starts.

- **Warm-up:** 5-min easy jog · 3 sets of 20m walking lunges · 2 × 30-second rounds of butt kicks ·
  3 rounds of (10s seated arm-pump drill, 10s standing arm-pump drill, 10s "high elbows")
- **Cooldown:** 5-min easy jog or cross-training/bike

**Level 1**
- 3 rounds of 4×50m @ >vVO2 from dead stop, 1-min walk between sets, 1-min rest between rounds
- 2 rounds of 4×200m @ >vVO2 with flying start, 2-min recovery between sets, 3-min rest between rounds
- 2 rounds of 3×300m @ 130–140% from dead stop, full recovery between sets, full recovery + stretch/mobility between rounds
- 2 rounds of 3×150m as 50m @ >vVO2 / 50m all-out / 50m @ >vVO2 from flying start, full recovery between sets, full recovery + stretch/mobility between rounds
- 8 × 25/25, four-point or prone start, 25 all-out acceleration, 25 @ >vVO2 stride down, full recovery between sets

**Level 2**
- 2 rounds of 4×50m @ >vVO2 from dead stop, 1-min walk between sets, 1-min rest between rounds
- 2 rounds of 2×75m @ >vVO2 from dead stop, 2-min walk between sets, 1-min rest between rounds
- 2 rounds of 2×200m @ >vVO2 with flying start, 2-min recovery between sets, 3-min rest between rounds
- 1 round of 4×50m with flying start @ max pace, full recovery
- 2 rounds of 2×200m @ 140%+ from dead stop, full recovery between sets, full recovery + stretch/mobility between rounds
- 2 rounds of 2×400m @ 130–140% from dead stop, full recovery between sets, full recovery + stretch/mobility between rounds
- 2 rounds of 4×150m as 50m @ >vVO2 / 50m all-out / 50m @ >vVO2 from flying start, full recovery between sets, full recovery + stretch/mobility between rounds
- 6 × 25/25, four-point or prone start, 25m all-out acceleration, 25m @ >vVO2 stride down, full recovery between sets
- 4 × 25/25, crouching or two-point start, 25m all-out acceleration, 25 @ >vVO2 stride down, hard stop (drop to cover) or run out, full recovery between sets

**Level 3**
- 4×25m @ all-out from dead stop with 25m run out, full recovery between sets
- 2 rounds of 5×50m @ >vVO2 from dead stop, 1-min walk between sets, 1-min rest between rounds
- 3×100m @ >vVO2 from dead stop, 2-min walk between sets, 1-min rest between rounds
- 2 rounds of 2×200m @ >vVO2 with flying start, 2-min recovery between sets, 3-min rest between rounds
- 2 rounds of 3×50m with flying start @ max pace, 2-min rest between rounds
- 2 rounds of 2×200m @ 140%+ from dead stop, full recovery between sets, full recovery + stretch/mobility between rounds
- 2 rounds of 2×400m @ 130–140% from dead stop, full recovery between sets, full recovery + stretch/mobility between rounds
- 1 round of 2×200m @ max pace from flying start, full recovery between sets
- 2 rounds of 3×150m as 50m @ >vVO2 / 50m all-out / 50m @ >vVO2 from flying start, full recovery between sets, full recovery + stretch/mobility between rounds
- 1 round of 2×200m as 50m fly-in @ >vVO2 / 100m all-out / 50m run out @ >vVO2
- 6 × 25/25, 4-point/block or prone start, 25m all-out acceleration, 25m @ >vVO2 stride down, full recovery between sets
- 2 rounds of 3 × 25/25, 3-point or plank start, 25m all-out acceleration, 25m @ >vVO2 stride down, hard stop (drop to cover) or run out, full recovery between sets

### Maximal Lactate Steady State — MLSS (p231–232)
Emphasises time spent in **zone 4**; the objective is accruing maximum time with equalised fatigue.
Work intervals may be run on hills with pace adjusted to hold target intensity.

- **Warm-up:** 10-min easy jog · 3 sets of 20m walking lunges · 2 sets of 10 per side Cossack squats
- **Cooldown:** 8-min easy jog

**Level 1**
- 6 rounds of: 15s @ 130% / 45s @ 105% / 1 min @ VT1
- 3 sets of 4 rounds of: 40s @ 130% / 20s @ 50%; 2-min walk/recovery between sets
- The descending ladder: 3 min @ 120% / 2 min @ 60% / 2 min @ 120% / 1:20 @ 60% / 1 min @ 120% / 40s @ 60% / 45s @ 120% / 30s @ 60% / 30s @ 120% / 20s @ 60% *(the page gives no round count at level 1 — level 2 says "1 round of", level 3 says "3 full rounds of")*
- 2 sets of 3 rounds of: 45s @ 125% / 45s @ 115% / 30s @ 100% / 1:30 @ VT1; 2-min recovery walk/jog between sets

**Level 2**
- 2 sets of 4 rounds of: 15s @ 130% / 45s @ 105% / 1 min @ VT1; 2-min recovery walk/jog between sets
- 5 sets of 4 rounds of: 40s @ 130% / 20s @ 50%; 2-min walk/recovery jog between sets
- 1 round of the descending ladder above (3 min @ 120% … 20s @ 60%), then 2-min walk/recovery jog followed by a second round starting from the 2 min @ 120% interval
- 2 sets of 4 rounds of: 45s @ 125% / 45s @ 115% / 30s @ 100% / 1:30 @ VT1; 2-min recovery walk/jog between sets
- 2 sets of 3 rounds of: 10s @ 100% / 10s all-out / 50s @ 115% / 1 min @ 95% / 1 min @ 90% / 2 min @ VT1

**Level 3**
- 3 sets of 4 rounds of: 15s @ 130% / 45s @ 105% / 1 min @ VT1; 2-min recovery walk/jog between sets
- 2 larger sets of 4 sets of 4 rounds of: 40s @ 130% / 20s @ 50%; 2-min walk/recovery jog between small sets, 4-min full recovery between larger sets
- 3 full rounds of the descending ladder (3 min @ 120% … 20s @ 60%), 1:30–2 min walk/recovery jog between rounds
- 3 sets of 4 rounds of: 45s @ 125% / 1 min @ 115% / 1 min @ 100% / 1:30 @ VT1; 2-min recovery walk/jog between sets
- 3 sets of 4 rounds of: 10s @ 100% / 10s all-out / 50s @ 115% / 1 min @ 95% / 1 min @ 90% / 1 min @ VT1; 1:30 walk or recovery jog between sets

### Near-Threshold — NT (p233–234)
Maximise time near threshold — either shorter above-threshold intervals or longer below-threshold
ones — while controlling fatigue.

- **Warm-up:** 10-min easy jog · 3 sets of 20m walking lunges · 2 sets of 10 (per side) Cossack squats
- **Cooldown:** 8-min easy jog

**Level 1**
- 4 × 1200m @ 90% with rest equal to 50% of the run
- 2 × 1600m @ 90% with 3-min rest, then 3 × 400m @ 92–95% with 2-min rest
- 1 × 800m @ 95% with 3-min rest, 2 × 400m @ 95% with 1:30 rest, 4 × 200m @ 95% with 1-min rest
- 2 sets of 4 rounds of: 1 min @ 105% / 1:30 @ 90%; 3-min recovery walk/jog between sets
- 5 rounds of: 20s @ 140% / 4:40 @ 92% / 1-min easy jog
- 4 rounds of: 2 min @ 95% / 15s @ 115% / 1:15 @ 95% / 2 min @ 90% / 1:30–2 min VT1 recovery
- 5 rounds of: 3:30 @ 90% / 1 min @ VT1
- 3 rounds of: 6 min @ 88% / 1 min @ VT1
- **Race-specific NT** (3–5 min recovery walk/jog between sets): 5K = 2 × 5-min repeats @ 105% · 10K = 2 × 8-min repeats @ 100% · half-marathon = 2 × 12-min repeats @ 95% · marathon = 2 × 15-min repeats @ 92%

**Level 2**
- 6 × 1200m @ 90% with rest equal to 50% of the run
- 3 × 1600m @ 90% with 3-min rest, then 4 × 400m @ 92–95% with 2-min rest
- 2 × 800m @ 95% with 3-min rest, 3 × 400m @ 95% with 1:30 rest, 4 × 200m @ 95% with 1-min rest
- 3 sets of 4 rounds of: 1 min @ 105% / 1:30 @ 90%; 3-min recovery walk/jog between sets
- 6 rounds of: 20s @ 140% / 4:40 @ 92% / 1-min easy jog
- 2 sets of 4 rounds of: 2 min @ 95% / 15s @ 115% / 1:15 @ 95% / 2 min @ 90% / 1:30–2 min VT1 recovery; additional 5-min VT1 jog between sets
- 6 rounds of: 4 min @ 90% / 1 min @ VT1
- 5 rounds of: 6 min @ 88% / 1 min @ VT1
- **Race-specific NT:** 5K = 4 × 4-min @ 105% · 10K = 3 × 6–8-min @ 100% · half = 3 × 10-min @ 95% · marathon = 2 × 20-min @ 92%

**Level 3**
- 10 × 1200m @ 90% with rest equal to 50% of the run
- 3 × 1600m @ 90% with 3-min rest, then 6 × 400m @ 92–95% with 2-min rest
- 1 × 1000m @ 95% (3-min rest), 1 × 800m @ 95% (3-min rest), 4 × 400m @ 95% (1:30 rest), 4 × 200m @ 95% (1-min rest)
- 4 sets of 4 rounds of: 1 min @ 105% / 1:30 @ 90%; 3-min recovery walk/jog between sets
- 2 sets of 4 rounds of: 20s @ 140% / 4:40 @ 92% / 1-min easy jog; 5-min VT1 jog between sets
- 3 sets of 4 rounds of: 2 min @ 95% / 15s @ 115% / 1:15 @ 95% / 2 min @ 90% / 1:30–2 min VT1 recovery; additional 5-min VT1 jog between sets
- 8 rounds of: 5 min @ 90% / 1:30 @ VT1
- 6 rounds of: 6 min @ 88% / 1 min @ VT1
- 4 rounds of: 8:30 @ 85% / 1 min @ VT1
- **Race-specific NT:** 5K = 4 × 5-min @ 105% · 10K = 4 × 8-min @ 100% · half = 3 × 12-min @ 95% · marathon = 3 × 15-min @ 92%

### VT1 (p235)
Any workout at or below VT1. **The level refers almost strictly to duration.** The precise percentage
of threshold may vary with fatigue, hydration and environment. Practise the **talk test at least
twice per run** if unsure — once after 5 minutes and once after 20.

| Level | Duration |
|---|---|
| 1 | 25–30 min |
| 2 | 45–60 min |
| 3 | 80–90 min |

### Long Slow Distance — LSD (p235)
Any workout intended to maximise training time; may combine zones but is primarily below VT1.
Differs from VT1 in that it can be longer and more race-specific, and intensity may be lower past
60 minutes. **Unlike VT1 sessions, LSD may include rest periods or pauses in the hike/jog with little
negative impact.**

**Level 1**
- 45-min VT1 run with 2 sets added at any point; the sets are 2 rounds of 30s @ 100% / 30s @ 90%
- 30 min @ VT1 with a 5-min race-pace finish
- 1–1.5h mixed-terrain hike / VT1 jog

**Level 2**
- 1-hour VT1 run with 2 sets added at any point; the sets are 2 rounds of 1:30 @ 115% / 30s @ VT1
- 60 min @ VT1 with a single 5-min @ 95% interval in the middle, 10-min race-pace finish
- 1.5–2.5h mixed-terrain hike / VT1 jog
- 1.5h VT1 fartlek targeting 6 × 3 min @ 85% during the session

**Level 3**
- 1.5h VT1 run with 3 sets added at any point; sets are either 3 rounds of 1 min @ 115% / 30s @ VT1, **or** 2 rounds of 4 min @ 95% / 1 min @ VT1
- 90–120 min @ VT1 with a single 10-min @ 95% interval in the middle, 15-min race-pace finish
- 3h+ mixed-terrain hike / VT1 jog (up to 5 hours for ultrarunners)
- 2–2.5h VT1 fartlek targeting 6 × 4 min @ 85% during the session

## D2. CYCLING

⚠️ Percentage basis is **inferred** — see the note at the top of Part D.

### Sprints (p236)
- **Warm-up:** 10-min easy spin · 4 cadence-only 15-second sprints to build leg speed and focus on
  timing and technique, with 3-min rest between

**Level 1**
- 3 max-effort 2–3-min sprints, trying to beat the last effort; 5–6 min recovery between
- Standing start: shift into a gear 2–4 heavier than cruising speed and slow to a track stand (or as slow as comfortable); from the standing start accelerate as fast as possible up to speed before settling into an easy pace; 6–10 min easy spin recovery between reps — **6 rounds**
- 8 rounds of flying 30-second surges to max effort, 2–3 min recovery between

**Level 2**
- 5 max-effort 2–3-min sprints, trying to beat the last effort; 5–6 min recovery between
- Standing start as above (gear 2–4 heavier), 6–10 min easy spin between reps — **8 rounds**
- 2 sets of 5 rounds of flying 30-second surges to max effort, 2–3 min recovery between

**Level 3**
- 6 max-effort 2–3-min sprints, trying to beat the last effort; 5–6 min recovery between
- Standing start as above, 6–10 min easy spin between reps — **10 rounds**
- 4 rounds of flying 15-second surges to max effort, 2-min recovery between
- 2 sets of 6 rounds of flying 30-second surges to max effort, 2–3 min recovery between

### Anaerobic — AnA (p237)
Aim is **anaerobic repeatability**. ⚠️ **Best done by feel with a power FLOOR rather than a specific
power target** — the numbers are guidelines.

- **Warm-up:** 10–15 min easy spin

**Level 1**
- 6–10 × 45s @ 110–115%+ with 4–6 min recovery between sets. *Each set should start at 110% and progress to 125–130% by the end.*
- 5 rounds of: 30s @ 120% / 2:30 @ 90% / 30s @ 120% / 4-min easy spin
- 10 rounds of: 1 min @ 110% / 1 min @ 50%
- 4 rounds of: 30s @ 100% / 30s @ 110% / 1 min-plus to fade at 130% (when power drops) / 5-min spin recovery

**Level 2**
- 6–10 × 1 min @ 110–115%+ with 4–6 min recovery between sets. *Start at 110%, progress to 125–130% by the end.*
- 6 rounds of: 30s @ 120% / 4 min @ 90% / 30s @ 120% / 4-min easy spin
- 2 sets of 7 rounds of: 1 min @ 110% / 1 min @ 50%; 5-min spin between sets
- 5 rounds of: 30s @ 100% / 1 min @ 110% / 1 min-plus to fade at 130% / 5-min spin recovery
- 30s @ 120% / 30s rest, repeat until unable to hold 120% for the duration; rest 5 min; repeat

**Level 3**
- 6–10 × 1:30 @ 110–115%+ with 4–6 min recovery between sets. *Start at 110%, progress to 125–130% by the end.*
- 2 sets of 4 rounds of: 30s @ 120% / 5:30 @ 90% / 30s @ 120% / 4-min easy spin; 5-min additional spin recovery between sets
- 2 sets of 8 rounds of: 1 min @ 120% / 1 min @ 50%; 5-min spin between sets
- 6 rounds of: 1 min @ 100% / 1:30 @ 110% / 1 min-plus to fade at 130% / 5-min spin recovery
- 30s @ 120% / 30s rest until unable to hold 120% for the duration; rest 5 min; repeat for a total of 3 sets

### VO2 (p238)
Push maximum aerobic intake; more metabolically taxing than the anaerobic work. Where the anaerobic
sessions focused on *"more power is generally better,"* **these should be more carefully controlled.**

- **Warm-up:** 15-min easy spin · 5 min @ 95% · 5-min easy spin

**Level 1**
- 5 rounds of 3 min @ 110–120%, 5-min rest
- 2 sets of 6 rounds of 1:30 @ 115% / 1:30 easy spin; 5-min recovery between sets
- 4 sets of 5 rounds of 30s @ 125% / 30s @ 85%; 5-min rest between sets

**Level 2**
- 5 rounds of 4 min @ 110–120%, 5-min rest
- 2 sets of 8 rounds of 1:30 @ 115% / 1:30 easy spin; 5-min recovery between sets
- 4 sets of 8 rounds of 30s @ 125% / 30s @ 85%; 5-min rest between sets

**Level 3**
- 5 rounds of 5 min @ 110–120%, 5-min rest
- 2 sets of 10 rounds of 1:30 @ 115% / 1:30 easy spin; 5-min recovery between sets
- 4 sets of 8 rounds of 40s @ 125% / 20s @ 85%; 5-min rest between sets

### Sweet Spot (p238–239)
As close to threshold as possible without exceeding it — plenty of time in the zone with far less
fatigue than riding at or above it.

- **Warm-up:** 10–15 min easy spin

**Level 1**
- 3 sets of 6 min @ 90% with 10s @ 105% every minute on the minute; 3-min easy spin
- 6 rounds of 4 min @ 95%, 2-min easy spin
- 3 rounds of 8 min @ 90%, 4-min easy spin
- 3 rounds of 15 min @ 80%, 5-min easy spin

**Level 2**
- **4 sets of 6 min @ 90% with 10s @ 105% every minute on the minute; 3-min easy spin**
  *(was obscured in the first two photographs; resolved from a third, `p239.jpg`, 2026-08-21)*
- 8 rounds of 4 min @ 95%, 2-min easy spin
- 4 rounds of 8 min @ 90%, 4-min easy spin
- 3 rounds of 20 min @ 80%, 5-min easy spin

**Level 3**
- 4 sets of 8 min @ 90% with 10s @ 105% every minute on the minute; 3-min easy spin
- 8 rounds of 2 min @ 95% / 2 min @ 100%, 2-min easy spin
- 4 rounds of 10 min @ 90%, 4-min easy spin
- 3 rounds of 20 min @ 80% with 10s all-out sprint every 4 minutes, 5-min easy spin

### Endurance (p239)
Either straight endurance or with some speed/threshold work. Each level is intended to be roughly
comparable in overall fatigue — **use judgment and do the more intense workouts sparingly unless an
event is coming.** He encourages using these for **form-focused training**: several minutes of every
long ride on pedal stroke and position.

**Level 1**
- 60–100-min easy ride below 75%
- 20-min easy spin · 4 rounds of (2 min @ 80% / 3 min @ 70%) · 45 min @ VT1 with a 10-second all-out sprint every 9 minutes

**Level 2**
- 2.5–3.5-hour easy ride below 75%
- 20-min easy spin · 2 sets of 4 rounds of (2 min @ 80% / 3 min @ 70%) with 5-min easy spin between sets · 60 min @ VT1 with a 10-second all-out sprint every 8 minutes

**Level 3**
- 3.5–5-hour easy ride below 75%
- 20-min easy spin · 3 sets of 4 rounds of (2 min @ 80% / 3 min @ 70%) with 5-min easy spin between sets · 90 min @ VT1 with a 10-second all-out sprint every 9 minutes

## D3. SWIM (p240–241)

**The emphasis is duration.** Level 1 swims are simpler, non-fatiguing workouts; **level 3 swims are
1.5-hour sessions involving significant fatigue.** Three examples per level: one endurance, one
speed, one open water. **Distances and interval lengths can be modified tremendously.**

**Drills to learn:** basic catch-up, distance-per-stroke (DPS), fist drills, kick drills,
zipper/fingertip drag. *(A full drill catalogue is out of the book's scope.)*

⚠️ For open-water sessions he **strongly recommends a watch with an audible timer.**

**Level 1**
- *Endurance:* 200m as 25m easy / 25m drill choice · 3 × 50m as 25m easy / 25m sprint with 10-second rest · 2 × 600m @ easy-to-moderate (race pace) with 2-min rest
- *Speed:* 100m kick drill · 100m with pull buoy · 2 sets of 6 × 100m as 25 easy / 25 moderate / 25 hard / 25 all-out with 15-second rest; 1-min rest between sets
- *Open water:* out and across — 3 sets of (30-second swim out, then 4 rounds of: 30-second swim parallel to shore sighting every 10 seconds, 30-second swim parallel back to start sighting every 10 seconds), return to shore, 2-min rest

**Level 2**
- *Endurance:* 100m kick · 200m as 25m easy / 25m drill choice · 4 × 50m as 25m easy / 25m sprint with 10-second rest · 3 × 600m or 2 × 1000m @ easy-to-moderate (race pace) with 2-min rest
- *Speed:* 100m kick drill · 100m with pull buoy · 6 × 50m sprint with 15-second rest · 2 sets of 5 × 100m as 25 easy / 25 moderate / 25 hard / 25 all-out sprint with 15-second rest, 1-min rest between sets · 1 set of 4 × 200m as 100m easy / 50m hard / 50m all-out sprint with 1-min rest
- *Open water:* out and across — 4 sets of (30-second swim out, then 3 sets of: 45-second swim parallel to shore sighting every 9 seconds, 45-second swim parallel back to start sighting every 9 seconds), return to shore, 2-min rest

**Level 3**
- *Endurance:* 100m kick · 100m DPS or glide drill · 200m as 25m easy / 25m drill choice · 8 × 25m sprint with 5-second rest · 3 × 1200m or 2 × 1600m @ easy-to-moderate (race pace) with 3-min rest
- *Speed:* 100m kick drill · 100m with pull buoy · 8 × 50m sprint with 15-second rest · 2 sets of 4 × 150m as 50m easy / 50m hard / 50m sprint with 30-second rest, 1-min rest between sets · 1 set of 4 × 200m as 100m easy / 50m hard / 50m all-out with 1-min rest
- *Open water:* straight distance, 20 minutes out and 20 minutes back. ⛔ **Belt with rope tether, bright/contrast buoy, water/fluid supply and emergency whistle are MANDATED.** Practise sighting and orientation with shore/surroundings. The objective is acclimating to extended periods in deep water and should be approached with all relevant caution — **experienced swimmers in locations with visible lifeguards or a dedicated boat/kayak escort only.**

---

# PART E0 — THE PROGRAM ROSTER (Chapter 10, pp.244–284)

**Eighteen programs, every one captured as images.** All share one shape: a **weekly table** with
STANDARD and TAPER/DELOAD columns, seven days, a strength column and an endurance column — followed
by a **notes page** (prose, then Strength Notes and Running/Conditioning/Cycling Notes).

⛔ **Two are transcribed below — the All Rounder (Part E) and Strength + 5K (Part E1).** The other
sixteen stay as images deliberately: transcribing eighteen dense tables invites exactly the errors
this file's changelog records. **Transcribe one when it is being built, from the page.**
⚠️ Strength + 5K was transcribed 2026-08-23 because stage 4 builds it; its notes page had never been
read and carried four things nothing else here records — see Part E1.

| Program | Table | Notes | For whom |
|---|---|---|---|
| Hypertrophy + 5K | p244 | p245 | *"hybrid training at its most basic"* — ⭐ **the book's own recommended first program** |
| ⭐ **Strength + 5K** | p246 | p247 | **the strength-leading runner frame** — powerlifting-compatible; bench 2×/wk, squat and deadlift 1× each. **Transcribed in Part E1.** |
| Strength + Speed | p248 | p249 | team-sport / field athletes; barbell-heavy, sprint-biased |
| Strength + Half-Marathon | p250 | p251 | assumes 5K/10K progress already; also usable for marathon |
| Hypertrophy + Half-Marathon | p252 | p253 | size / body composition while training half or full marathon |
| Strength + Ultramarathon | p254 | pp.255–256 | reduced strength component — *"running strength"*, not competitive strength |
| The Runner: Pivot | p258 | p259 | pure running performance 5K–half; lifting entirely supportive |
| Strongman + Endurance | p260 | p261 | strongman whose work capacity is the weakness |
| Strongman + Speed | p262 | p263 | strongman wanting speed and capacity as an *"ace in the hole"* |
| Selection | p264 | pp.265–266 | military selection / rucking; carries, picks, heavy and light rucks |
| Strength + Sprint Tri | p268 | p269 | |
| Strength + Ironman Tri | p270 | pp.271–272 | |
| ⭐ **The All Rounder** | p274 | p275 | **the year-round home base** — transcribed below |
| The Speed Solution: Pivot | p276 | p277 | obligate pivot, 4–6 weeks; slow runner → explosive |
| Cycling: Base | p278 | p280 | cycling proficiency — **run this 4 weeks before the other two** |
| Cycling: Fondo/MTB/Gravel | p279 | p280 | steady output, longer mixed-terrain racing |
| Cycling: Crit/CX/XCO | p281 | p280 | punchier racing; strength is **DE secondary movements only** |
| Weightlifting and Running | p282 | pp.283–284 | Olympic lifting — the **only** program using the OLY vocabulary (Part A3) |

**Three structural facts worth holding before any of this is modelled:**

1. **"Pivot" is a first-class concept, not a label.** Some programs are *obligate* pivots — not for
   consistent use, run for a defined block then leave (The Speed Solution: 4–6 weeks, and highly
   experienced runners may *regress* aerobically if they stay longer). Others *can* be run
   indefinitely. The notes pages say which, per program.
2. **Programs name their own successors.** Crit tells you to switch to Cycling + Base for 4–6 weeks
   then run Base's taper variant before a powerlifting meet; the All Rounder tells you to switch to
   The Runner about a month out from a race. **There is a graph of transitions here, not a list.**
3. **The endurance column is written in the Part D vocabulary** — `MLSS+ (level 2)`, `NT (level 1)`,
   `Cyc AnA (level 1)`, `LSD (level 3)`, `VT1 (level 1)`, `Sprint/power (level 2)`. Every token
   resolves against the session library. **That is the seam the app would generate through.**

---

# PART E — THE ALL ROUNDER (Chapter 10, pp.274–275)

> **The weekly table is `p274.jpg`, transcribed below and verified against the image 2026-08-21.**
> An earlier note in this file claimed it had never been captured; that note was itself wrong and is
> retracted — see the changelog.

## E1. The week (p274) — verified against the image

**Two columns: STANDARD and TAPER/DELOAD.** Seven days.

| Day | STANDARD strength | STANDARD endurance | TAPER/DELOAD strength | TAPER/DELOAD endurance |
|---|---|---|---|---|
| **1** | **Upper body: Push** — 1 × ME: secondary push · 1 × DE: secondary push · 1 × HYP: braced push · 2 × HYP: focused push/pull (arms) superset · 1 × HYP: focused push | MLSS+ (level 2) | **Upper body: Push** — 1 × SKILL: secondary push · 1 × HYP: braced push · 2 × HYP: focused push/pull (arms) superset · 1 × HYP: focused push | MLSS+ (level 1) |
| **2** | **Lower body: Hinge** — 1 × ME: secondary hinge · 2 × HYP: braced hinge / braced lower push superset · 1 × HYP: focused hamstring · 1 × DE: braced push (asymmetrical) | Cyc AnA (level 1) | **Lower body: Hinge** — 1 × DE: secondary hinge · 1 × HYP: focused hamstring · 1 × DE: braced push (asymmetrical) | *(none)* |
| **3** | Plyo warm-up | NT (level 2) | Plyo warm-up | VT1 (level 1) |
| **4** | **Upper body: Pull** — 1 × ME: secondary pull · 1 × DE: secondary pull · 1 × HYP: braced pull · 2 × HYP: focused push/pull (arms) superset · 1 × HYP: focused pull | Cyc endurance (level 1) | **Upper body: Pull** — 1 × SKILL: secondary pull · 1 × HYP: braced pull · 2 × HYP: focused push/pull (arms) superset · 1 × HYP: focused pull | Cyc endurance (level 1) |
| **5** | **Lower body: Push** — 1 × ME: secondary push · 2 × HYP: braced hinge / braced lower push superset · 1 × HYP: focused quadriceps · 1 × SKILL: braced push (asymmetrical) | *(none)* | **Lower body: Push** — 1 × DE: secondary push · 1 × HYP: focused quadriceps · 1 × SKILL: braced push (asymmetrical) | *(none)* |
| **6** | — | LSD (level 2) | — | LSD (level 1) **or** Cyc endurance (level 1) |
| **7** | **REST** | | **REST** | |

**What the table settles:**

- **Four strength days** (1, 2, 4, 5) organised by movement pattern, a **plyo-only day 3**, an
  endurance-only day 6, and one full rest day. Confirmed.
- ⛔ **Every strength slot uses a SECONDARY, BRACED or FOCUSED movement. Not one primary lift
  appears in the program as written** — which is exactly what the p275 note says it is doing, and
  why the note has to add that primaries *may* be substituted in.
- **The ME slot is always the movement that opens the day**, and it is always a *secondary* lift.
- **Taper/deload is a substitution, not just a volume cut**: every ME becomes SKILL (upper) or DE
  (lower), the braced/superset volume comes off the lower days, the endurance level drops from 2 to
  1, day 3 drops from NT to VT1, and days 2 and 5 lose their endurance entirely.
- **Five endurance sessions a week in standard**: MLSS+ (2), Cyc AnA (1), NT (2), Cyc endurance (1),
  LSD (2). Three in taper.
- **"Braced push (asymmetrical)" appears three times and is now resolved** — see the asymmetrical
  note in Part A2. It is a braced LOWER push (hack squat / leg press / lever squat) performed
  single-leg, and the athlete may rotate it with a secondary asymmetrical such as a split squat.

⚠️ **Frequency, corrected.** It was said in chat that this program hits each pattern ~2×/week and so
satisfies Ch.4's ideal. **The table only partly supports that.** Lower patterns do recur — hinge on
days 2 and 5, lower push on days 2 and 5 — and the arms superset appears on both days 1 and 4. But
**upper push appears as a day only on day 1, and upper pull only on day 4.** Do not repeat the
2×/week claim as though the program guaranteed it.

**Viada's own description.** *"If you're looking for a place to start, and you want to try this whole
'hybrid thing' without needing to be dedicated to a lift-and-5K-type program, this is the one."*
For the **intermediate-to-advanced hybrid athlete** who wants progress across the board in maximum
strength, size/body composition, health and endurance performance. Usable as an **"all-year"
program** for an athlete interested in multiple sports — road running, trail running, triathlon,
hybrid racing, powerlifting, combat sports.

**Modality substitution.** Cycling work may be done on **any modality with a power meter that is
relatively non-impact** — rower, ski erg, air bike — and the athlete may rotate among devices as long
as they know their threshold in each. Running work may be done on an elliptical or arc trainer,
**though he recommends impact with the ground on at least one day.**

**Long slow run.** The weekend LSR can be a hike, a long ride, a team sport day, or whatever else is
of interest. Plenty of additional easy work can be added if needed.

**Adjustment over time.** Once acclimated, *"few changes are needed as the months progress beyond
adjustment of 1RM and threshold as you improve."*
⛔ **This is the living-baselines architecture stated by the author: the program stays, the anchors move.**

## Strength notes (p275)
- **The emphasis on secondary lifts over primary lifts is deliberate** — the primary lifts are not
  the only way to build limit strength. Using a variety of implements (even a switch to a specialty
  bar) and planes of movement keeps progress coming and **breaks the attachment to the "big three."**
  ⚠️ **Primary lifts CAN be substituted in** — *"you're encouraged to keep your options open."*
- Braced asymmetrical movements may be rotated with secondary asymmetrical ones. To incorporate more
  asymmetrical work, select those for **the secondary movement that begins each day.** Split squats
  and similar for ME lifting are unconventional but permitted, and can be extremely productive.
- **The midweek plyo warm-up may be anywhere from one to three plyometric skills**, left open-ended
  because variety and week-to-week modification are encouraged.

## Conditioning notes (p275)
- **Hard work should be hard; easy work should be easy.** For maximum sustainable progress, resist
  the urge to add difficulty or length to the endurance work. **Adjusting intensity and estimated
  threshold figures is always better than extending distance or increasing level for this program.**
- **For a specific race, switch to a pivot program about a month out** — The Runner, for example.
  Running inside the All Rounder is sufficient for progress, but a pivot program returns the best
  results, and **pretesting before a race program ensures it reflects current potential.**

---

# PART E1 — STRENGTH + 5K (Chapter 10, pp.246–247)

**Transcribed 2026-08-23 from `p246.jpg` and `p247.jpg`, both read directly.** This is the frame the
Standing Plan's *strength-leading, runner* dial position builds
(`DECISIONS-2026-08-22-standing-plan-pivot.md` §1). ⚠️ **p247 had never been read before this
session** — the pivot doc flagged it UNREAD and it turned out to carry four things nothing else in
this corpus records.

## E1a. The week (p246) — verified against the image

| Day | STANDARD strength | STANDARD endurance | TAPER/DELOAD strength | TAPER/DELOAD endurance |
|---|---|---|---|---|
| **1** | **ME: Upper** — 1 × ME: Primary push · 1 × ME: Accessory: primary pull · 1 × DE: Accessory: secondary push · 1 × HYP: Accessory: focused pull, focused push | 1 × MLSS+ (level 2) | **ME: Upper** — 1 × ME: Primary push · 1 × DE: Accessory: primary pull · 1 × HYP: Accessory: focused pull, focused push | 1 × MLSS+ (level 1) |
| **2** | **ME: Lower** — 1 × ME: Primary hinge lower *(rotate with primary push)* · 1 × ME: Accessory: primary push lower *(rotate with primary hinge)* · 1 × DE: Accessory: secondary hinge lower · 1 × HYP: Accessory: accessory lower | *(none)* | **ME: Lower** — 1 × ME: Primary hinge lower *(rotate)* · 1 × DE: Accessory: primary push lower · 1 × HYP: Accessory: accessory lower | *(none)* |
| **3** | Plyo warm-up | NT (level 3) | Plyo warm-up | NT (race tempo) (level 1) |
| **4** | **DE: Upper** — 1 × DE: Primary push · 1 × DE: Accessory: primary pull · 1 × HYP: Accessory: secondary push · 1 × HYP: Accessory: focused pull, focused push | VT1 (level 1) | **DE: Upper** — 1 × DE: Primary push · 1 × DE: Accessory: primary pull · 1 × HYP: Accessory: focused pull, focused push | *(none)* |
| **5** | **DE: Lower** — 1 × DE: Primary push lower *(rotate with primary hinge)* · 1 × DE: Accessory: primary hinge lower *(rotate with primary push lower)* · 1 × HYP: Accessory: secondary push lower · 1 × HYP: Accessory: focused push lower | *(none)* | **DE: Lower** — 1 × DE: Primary push lower *(rotate)* · 1 × DE: Accessory: primary hinge lower · 1 × HYP: Accessory: accessory lower | *(none)* |
| **6** | — | LSD (level 2) | — | VT1 (level 1) |
| **7** | **REST** | | **REST** | |

**What the table settles:**

- **Four lifting days** (1, 2, 4, 5), a **plyo-only day 3**, an endurance-only day 6, one full rest
  day. Two ME days and two DE days. Confirms the pivot's §1 reading.
- **Four endurance sessions in standard** — MLSS+ (2), NT (3), VT1 (1), LSD (2). **Three in taper** —
  MLSS+ (1), NT at race tempo (1), VT1 (1). ⚠️ The taper LOSES the LSD and gains a VT1 on day 6.
- ⛔ **Every day opens on a PRIMARY movement.** p247 says so in terms: *"All first lifts of the day
  should be a competition movement."*
- **Taper is a substitution, not only a volume cut:** day 1's second ME becomes DE, day 2's second ME
  becomes DE, the endurance levels drop to 1, and day 4 loses its endurance entirely.

## E1b. ⛔ "ACCESSORY:" IS A ROLE PREFIX, NOT A CATEGORY — and nothing else in this corpus records it

p247, read directly:

> *"The 'accessory' notation refers to movements that specifically focus on **noncompetition lifts
> with similar gross movement patterns** — for example, paused deadlifts, box squats, Larsen presses."*

**So a slot reading `1 × ME: Accessory: primary pull` is not asking for Part A2's PRIMARY category by
a different name.** It is asking for a movement in that gross pattern which is *not the athlete's
competition lift*. His three examples split across two of his own categories — paused deadlift and
box squat are in the PRIMARY list (p219), Larsen press is in the SECONDARY list (p220) — which is the
proof that the prefix is a ROLE and the word after it is the pattern/category.

⛔ **A composer that reads `Accessory: primary pull` as "the primary pull category" will put the
competition lift in a slot that exists precisely to avoid it.**

⚠️ **`1 × HYP: Accessory: accessory lower` (days 2 and 5) is genuinely ambiguous.** *"Accessory
lower"* is not a category anywhere in pp.218–223. The only defensible reading is *a lower-body
movement that is not a competition lift*, category unspecified. **Recorded as ambiguous rather than
resolved.**

## E1c. Strength notes (p247)

- ⛔ **THE BIG THREE, AND THE FREQUENCIES:** *"The lifting days here should focus on the big three if
  powerlifting is the goal: **training bench twice a week and the squat and deadlift each once a
  week**."*
- ⛔ **THE ME LIFT ROTATES WEEKLY — HE STATES THE CADENCE:** *"Note that the ME lift will rotate week
  to week, with **one week consisting of ME squat and DE deadlift, and the next week the reverse**."*
  This is what the table's *"(rotate with primary push)"* / *"(rotate with primary hinge)"* means:
  day 2 and day 5 swap which of squat/deadlift carries ME and which carries DE, every week.
  ⛔ **`DECISIONS-2026-08-22-standing-plan-pivot.md` §8 lists "rotation cadence for the ME lift pair"
  as a gap to fill from field practice. It is not a gap. He wrote it.**
- **All first lifts of the day should be a competition movement.**
- ⛔ **PROGRESSION — his own rate anchor for THIS program:** *"Progress here should be through the
  circle of reps, with slow gradual increases in the calculated 1RM taking place **every 3 to 4
  weeks (assume 1 percent every 3 weeks as a starting point)**."*
  ⚠️ **"The circle of reps" is not defined on this page** and appears nowhere else in this corpus.
  Do not assume it means double progression without finding his definition.
- **Primary movements rotate SPARINGLY** (main text): higher background fatigue than an obligate
  lifting program means slower skill acquisition, and *"spreading yourself too thin across multiple
  movements may return inferior results."*

## E1d. Running notes (p247)

- ⛔ **A 3–4% LOWER-BODY HAIRCUT, WITH A STATED PHASE-OUT, AND NOTHING ELSE IN THIS CORPUS HAS IT:**
  > *"Monday's run is fairly challenging, given that there is an ME lower session the next day. For
  > the first few weeks, you may notice that the ME lower session is slightly hindered by lingering
  > fatigue. As such, **a 3 to 4 percent reduction in working 1RM should be assumed here.** As long as
  > progression is maintained week to week and month to month, this reduction can be **gradually
  > phased out in eight to ten weeks** (that is, **increasing lower body estimated 1RM by about 2
  > percent every three weeks for the first nine weeks**)."*

  ⚠️ **This is a FRAME-SPECIFIC haircut caused by the running schedule, not a second statement of the
  working-max derivation.** It applies to the lower body only, it is caused by Monday's run landing
  before Tuesday's ME lower, and it phases out. The working max (p215) is a general derivation with
  no phase-out. **They are different layers and compose — but see Part G, because p215 is not
  photographed and that 96% figure is unverified in this corpus.**
- **Wednesday's NT is the hardest session of the week:** *"I recommend NT workouts with **5- to
  8-minute work intervals**. If within six weeks of a race, **increase the pace here to race pace,
  but extend recovery periods by 25 percent**."* (This is what the taper column's *"NT (race
  tempo)"* means.)
- **Saturday's LSD ideally mixed terrain.** *"Mileage will be dictated by experience level, with more
  proficient runners looking at runs up to **90 to 100 minutes** here with an emphasis on **LT
  intervals**, and less experienced runners opting for **shorter fartlek variations**."*
- ⚠️ **AND ONE LINE THAT SITS AGAINST A PIVOT RULING** (main text): *"More advanced runners may see a
  benefit to additional running volume, and I recommend **adding one or two VT1 sessions** initially
  to test recovery."*
  ⛔ `DECISIONS-2026-08-22-standing-plan-pivot.md` §2 says **"Convert, never add. The program owns
  session count."** This is the author offering an optional volume addition for an advanced tier.
  **Raised, not reconciled — see the stage 4 notes.**

## E1e. Race and meet handling (p247, main text)

- ⛔ **Two weeks out from a powerlifting meet OR a 5K, switch to the deload version.**
- **Powerlifting meet:** practise openers (a single rep at your 3RM) **7 to 8 days before the meet**,
  in a single session. In the week before the meet, Monday and Wednesday running can be maintained,
  though *"larger athletes who experience more wear and tear from running may want to convert the
  Wednesday session into a cross-training VT1 session."*
- **5K race:** *"eliminate the DE lifting sessions on race week and focus on race pace repeats on
  your tempo days both taper weeks."*

## E1f. Who it is for (p247, main text)

*"Similar in design to the Hypertrophy + 5K program and should be accessible and useful for athletes
of most skill levels. The lifting component is perfectly acceptable for competitive powerlifters,
while the running program can be of use for even advanced intermediate runners."* Strength here
**assumes task-specific strength** — powerlifting or specific barbell strength is the goal, and there
are several specific movements the athlete wants to improve.

---

# PART H — THE WORKING NUMBER AND THE PRETEST (p215)

⚠️ **READ 2026-08-22 OFF THE PAGE; THE IMAGE IS PENDING IN `book-sources/`.** Every figure below was
verified against that photograph in the planning chat. Until `p215.jpg` lands this is the one part of
the corpus that cannot be re-checked against an image in the folder — see Part G item 7.

## H1. The pretest protocol

Warm up to roughly **75% of the predicted max**, then:

| step | load | reps |
|---|---|---|
| 1 | ~75% of predicted max | 6 |
| 2 | +10% | 5 |
| 3 | +5% more | max reps |

⛔ **"PREDICTED MAX" IS THE NUMBER ALREADY ON FILE.** The athlete's stored 1RM is what sets the
warm-up weights — it is the SEED for the test, never the answer to it.

## H2. The working max

- The final set's load and reps go through **BOTH Epley and Brzycki, and the two are AVERAGED** —
  ⛔ **because the formulas diverge as the rep count changes**, so neither alone is trustworthy across
  the range this protocol produces.
- **The working max is roughly 96% of that predicted true 1RM.**

⛔ **THIS IS NOT WENDLER'S TRAINING MAX AND THE TWO MUST NEVER CONVERT INTO EACH OTHER.** Wendler's
is 85% of a true 1RM and has three live readers in this app (`plans.config.training_max`). Viada's is
96% of a freshly tested predicted max. Same English word, two different numbers, two different
programs. **No function may accept both.**

## H3. Where it composes, and where it does not

⛔ **p247's 3-4% lower-body reduction (Part E1d) is a SEPARATE LAYER and composes with this one — it
never multiplies into the derivation.** The working max is how a number is derived from a test. The
haircut is a temporary, lower-body-only, frame-specific allowance for Monday's run landing before
Tuesday's ME lower, and it phases out over eight to ten weeks. Folding the haircut into the 96%
would make it permanent and would make the phase-out unexpressible.

---

# PART F — WENDLER × VIADA (how the two sources combine)

**They sit at different layers.** Wendler is a **progression rule for a lift**; Viada is a **session
architecture** — which slots exist and what each is for. Viada leaves the ME slot's progression open
and explicitly permits primary lifts in it.

**Where they agree** (so the graft is honest): submaximal always · never to failure · no maxing out ·
progress without retesting on fixed increments · explosive work has its own place (Wendler's
jumps/throws ≈ Viada's DE and plyo) · scheduled light weeks · rotate arrangement, keep principle.

**Where they differ:**

| | Wendler | Viada (All Rounder, p274 — verified) |
|---|---|---|
| Week organised by | **the lift** (squat/bench/deadlift/press day) | **the movement pattern** — days are upper push, lower hinge, upper pull, lower push |
| What fills the slots | the primary barbell lifts ARE the program | **secondary, braced and focused movements only** — no primary lift appears as written |
| Frequency per pattern | ~1×/week on a 4-day template | lower patterns recur across days 2 and 5; **upper push and upper pull appear once each.** Ch.4's 2×/week ideal is **not** uniformly met |
| Session contents | one main lift + supplemental + assistance | **four to five slots per day across ME/DE/SKILL/HYP** |
| Light week | same wave off the same training max, one prescribed single | **substitution**: every ME becomes SKILL or DE, volume comes off, endurance drops a level and two days lose it |
| Conditioning | tolerated | **five endurance sessions a week are part of the program** |

⛔ **THE REAL TENSION — the ME slot, and it is now a THREE-part mismatch, not one.**

1. **Load.** Viada's ME asks for **90–100% of 1RM**. Wendler's heaviest set is 95% of a training max
   that is itself 85% of the true max — **about 81% of the real number**.
2. **Stopping rule.** Viada says **stop the ME set short of failure**. Wendler's final set is taken
   to a hard stop.
3. **Movement.** ⛔ **Verified on p274: every ME slot in the All Rounder is a SECONDARY lift** — the
   program as written contains no primary at all. Wendler's whole system is built on the primaries.

So Wendler-in-the-ME-slot substitutes maximal **effort** at a submaximal load for Viada's maximal
**load**, inverts the stop-short rule on that set, **and puts a primary where the program puts a
secondary.** All three are defensible; none of them is the same prescription.

**Recommendation (NOT YET RULED ON by Michael, 2026-08-21):** run Wendler in the ME slot and record
all three as **stated deviations** rather than pretending the systems align. The book's own latitude
covers the third — p275 says explicitly that primary lifts can be substituted in and the athlete is
encouraged to keep their options open — but that is permission for a substitution, not a claim that
they are equivalent.

## Where this lands in our code (trace done 2026-08-21)
- `shared/strength-system/loading/wendler-531.ts` — **pure, no knowledge of weeks or days.** It gains
  a second consumer; it is not replaced.
- `shared/strength-system/protocols/intent-taxonomy.ts` — already states *"protocols output intents,
  placement policies assign intents to days"*, which is Viada's table restated. Its vocabulary is
  **region × quality**; Viada's is **pattern × intent × category**. This is a **new accessor over
  existing vocabulary**, not a new strength system (a `MovementPattern` vocabulary already exists).
- The per-intent RIR values map onto the **already-built, already-deployed stamped-RIR machinery**
  (one stamped target that the logger, analyzer and State verdict all read).

---

# PART G — KNOWN GAPS IN THIS CAPTURE

1. ✅ **CLOSED — the "missing asymmetrical category" was never missing.** There is no such category;
   asymmetrical is a modifier on a movement from an existing category. See Part A2. pp.224–225 were
   shot on 2026-08-21 and contain the **Olympic lift options** instead (Part A3).
2. ⚠️ **The cycling percentage basis is inferred, not captured** (see Part D header). The running
   convention is stated on p229; the cycling opener on p236 states no counterpart. **This is now the
   only unresolved question in Parts A–D, and it is an inference we are choosing to rely on.**
3. **Level assignment is settled for THIS program and unknown in general.** p274 assigns a level to
   every endurance slot itself (standard vs taper), so the All Rounder needs no separate rule. **How
   an athlete would pick levels for a program that does not name them is still uncaptured.**
5. **The session-order rules are INCOMPLETE.** Six items are recorded under a heading that says
   nine, they came from earlier-session notes rather than pages in hand, and the numbering may not
   map 1:1 (some rules are split a/b across pages). ⛔ **Re-shoot pp.139–145. Do not cite "rule N".**
6. ⚠️ **PART B — THE RE-SHOOT EXISTS AND IS PART-READ (updated 2026-08-27). STILL OPEN, BUT THE
   STRENGTH HALF IS DONE.**
   The pages are photographed: `~/Downloads/Endurance period/`, IMG_3637–3698, 62 frames covering
   **pp.69–131** (image number − 3568 = page, ⚠️ and B4c reports the formula drifting past p109).
   ⚠️ The shoot OVERRUNS Part B — pp.128–131 are Ch.5 and belong to **Part C**, whose provenance is
   downgraded for the same reason.
   ✅ **TWENTY-TWO PAGES NOW READ OFF THE PHOTOGRAPHS.**
   - **B4b (2026-08-26)** — 69, 70, 92, 98, 103, 107, 116, 120, 122, 123, 131: four confirmations,
     three corrections, and the answer to the adjust-by-feel question.
   - **B4d (2026-08-27)** — 72, 76, 77, 78, 80, 84, 85, 87, 88, 89, 90: **pp.71–90, the strength half
     of Ch.4.** ⛔ **This pass FALSIFIED A SHIPPED CONSTANT** — `REST_BETWEEN_SETS_NOT_STATED` said the
     book gave no rest guidance; **p78 has a section titled "Rest Periods"**, and gap #10 of the twelve
     was never a gap. It also supplies p80's quantified strength dose, p84's opposite fatigue rule for
     hypertrophy, and p89's plyometric progression ladder — none of which we had.
   ⛔ **~40 FRAMES REMAIN UNREAD — ALMOST ALL pp.91–131, THE ENDURANCE HALF** (p90 opens "Endurance
   Training Principles"). B4c relays several of those at weaker provenance.
   ⛔ **EVERY NUMBER NAMED IN NEITHER B4b NOR B4d STILL CARRIES THE OLD PROVENANCE.** Specifically
   still one generation removed: the five accounting buckets, the 10%-per-week change rule, "back off
   all buckets equally", the weekly floor, both two-a-day spacings, the ~1/3 maintenance figure and
   the 2h VT1 ceiling. **Do not code any of those as constants yet.**
   ⚠️ **THE LESSON, NOT JUST THE COUNT:** an unread frame is not a gap in the book. Before any
   constant asserts *"the source does not say"*, the pages it would be on must have been read.
5. ✅ **CLOSED — all eighteen Ch.10 programs are captured as images** (pp.244–284, see Part E0).
   Sixteen are untranscribed **by choice**, not by gap.
7. ⚠️ **p215 IS READ AND VERIFIED; ITS IMAGE IS PENDING IN THE FOLDER** (raised and closed
   2026-08-23). The page was photographed 2026-08-22 and read in the planning chat; the file has not
   yet landed in `book-sources/`, so this corpus cannot re-verify it until it does. **The numbers are
   in Part H and are built against.** ⚠️ Gap closes when `p215.jpg` lands.
8. ⚠️ **"The circle of reps" is used and never defined** (p247, Part E1c). He prescribes progression
   "through the circle of reps" for Strength + 5K and the term appears nowhere else in this capture.
   Do not assume it means double progression without finding his definition.

---

## Changelog
- **2026-08-21** — Created. Captured Ch.4 dosing (pp.69–125), the hybrid programming chapter
  (pp.128–151), the complete Movement Key (pp.218–241) and the All Rounder (pp.274–275), from
  photographs taken the same day. Gaps recorded in Part G.
- **2026-08-21, same day** — **Audited in answer to "is it all correct?"**
  Four corrections: (1) the All Rounder's weekly table was believed never captured and its chat
  description was called a hallucination; (2) the Sweet Spot level 2 opening
  interval was **obscured in the photograph and a number had been invented** — replaced with an
  explicit unknown; (3) a round count was added to the MLSS level 1 ladder that **the page does not
  give** — removed; (4) the session-order rules are **six of nine, from earlier-session notes**, and
  the heading claimed nine — corrected, and a Provenance table added at the top so no section's
  trust level has to be guessed. The endurance library, the strength grid and the All Rounder prose
  were checked line by line against the images and stand as written.
- **2026-08-21, later the same day — ⛔ CORRECTION #1 OF THAT AUDIT WAS ITSELF WRONG, AND THIS IS THE
  ENTRY TO READ.** All 107 photographs were collected, downscaled, catalogued and renamed by page
  number into the local folder named above. **`p274.jpg` is the All Rounder's weekly table — it HAD
  been photographed all along.** The chat description that the audit retracted as a hallucination
  was **accurate**: four movement-pattern days, `1 × ME: secondary push`-style slots, and the five
  endurance tokens all match the page exactly. The image had simply aged out of the session's
  context, and its absence was mistaken for its never having existed.
  **The lesson, which is why this file now opens with a pointer to the images:** a claim's
  provenance cannot be reconstructed from memory of a conversation. Either the page is on disk and
  gets opened, or the claim is unsourced — and *"I never saw this"* is as unreliable as *"I did."*
  The table is now transcribed in Part E, verified against the image. It also carries material never
  described in chat: **the TAPER/DELOAD column**, the fact that **no primary lift appears anywhere in
  the program**, and that upper push and upper pull each appear only once a week — which corrects an
  earlier claim that the program meets Ch.4's 2×/week ideal, and adds a third mismatch to the
  Wendler ME-slot analysis in Part F.
- **2026-08-21, third pass** — pp.224–225 shot. They are **not** the predicted asymmetrical category
  but the **General Olympic Lift Options (OLY)** — a third intent vocabulary (HEAVY / REP / SKILL /
  GROOVE) over three movement categories (Primary / Partial Variant / Modified Variant), now Part A3.
  ⛔ **And the "missing asymmetrical category" was closed, not found: Michael pointed out the word
  never appears as a heading, and a page-by-page check confirms it.** Asymmetrical is a *modifier*
  on a movement from an existing category, which is why no list exists; p275's rotation sentence is
  the only guidance and it also settles that the All Rounder's asymmetrical slot is lower-body.
  **Two of this file's three "shoot these pages" predictions were wrong about what was missing.**
  Treat a gap claim here as a lead, never as a finding.
- **2026-08-21, fourth pass — CAPTURE COMPLETE for chapters 4, 5 and 9.** A third, legible shot of
  p239 resolved the last obscured number: **Sweet Spot level 2 is 4 sets of 6 min @ 90%**. Every
  other value on that page was re-checked against the new image and stands. p228 confirmed by
  Michael as a full-page photograph with no content. The only page-level gap left in the whole file
  is Ch.10's other programs, which nothing currently needs.
- **2026-08-21, fifth pass — CHAPTER 10 CAPTURED IN FULL.** 42 more pages shot, catalogued and named:
  **pp.244–284, all eighteen programs**, each a weekly table plus a notes page. Roster added as Part
  E0 with page pointers. **Seventeen tables are deliberately NOT transcribed** — the images are the
  record and a table gets transcribed when it is being built. Three structural findings recorded:
  pivot-versus-indefinite is a per-program property stated in the notes; programs name their own
  successor programs, so the set is a transition graph rather than a list; and every endurance cell
  is written in the Part D session vocabulary, which is the seam a generator would work through.
  **The corpus is now 151 images and nothing in this file is waiting on a page.**
- **2026-08-27 — ⛔ THE STRENGTH HALF OF THE RE-SHOOT READ, AND A SHIPPED CONSTANT FALSIFIED.**
  pp.72, 76, 77, 78, 80, 84, 85, 87, 88, 89, 90 read off the photographs and recorded as **B4d**.
  **`strength-grid/intents.ts` shipped `REST_BETWEEN_SETS_NOT_STATED`, asserting the book gives no
  rest interval. p78 has a section titled "Rest Periods."** The constant is replaced with his rule
  (nearly full recovery, not so long you cool down, next set when you know you can complete it
  without getting crushed), p84's opposite hypertrophy rule is carried separately, and gap #10 of the
  twelve is closed in `WORKORDER-the-standing-plan-2026-08-22.md`.
  ⚠️ **The rule carries no minutes — any clock stays labelled ours.** Also new and unimplemented:
  p80's quantified weekly strength dose (which is also the source for the ME/DE rotation our code
  cited only p247 for), p89's plyometric progression ladder, and p72's Westside provenance for the
  ME/DE vocabulary. ⛔ **Root cause: the assertion was written about pages nobody had read.**

---

## ⚠️ B4c. RELAYED FINDINGS — pp.108–151, read off photographs 2026-08-26 by a session that died before transcribing

⛔ **PROVENANCE WARNING, READ FIRST.** Every quote below was read off a page image by a research
session that reported it in chat and then terminated before writing it into this file. The quotes
are recorded here verbatim as relayed, but **this section is one step weaker than B4b** — nobody has
re-verified these against the images since. ⚠️ **Verify each page before any number here becomes a
code constant.** They are recorded rather than lost.

⚠️ **AND THE FILENAME FORMULA DRIFTS.** The relaying session found that `IMG_number − 3568 = page`
breaks past p109 — IMG_3696 prints page 129, not 128, so the shoot gains a frame somewhere. **Do not
cite a page from a Downloads filename alone.** Page-numbered images are at
`~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`.

### ⛔⛔ p119 — THE PAGE THE WHOLE ENDURANCE QUESTION TURNS ON

Under "Full-spectrum performance in the 'maintained' athletic parameters":

> *"If you are peaking your strength and want to put running on the back burner, you should NOT
> simply 'run base miles' or 'sprint once a week' to maintain your running. You may reduce your
> running to a minimum effective dose, but it's crucial to continue to train running economy (often
> via speed work), maintain your threshold performance (through some near-threshold work), and base
> (via easy miles) in your running program. The volume can be dramatically reduced, but no quality
> should be allowed to deteriorate completely."*

⛔ **THIS IS HIS ANSWER TO "KEEP MY TOP END, KEEP MY MILES." He grants the top end and refuses the
miles.** All THREE qualities must remain present — speed, near-threshold, easy — which is a floor of
three distinct endurance flavours, not two.

### ⛔ p118 — THE INTENSITY DOES NOT DROP

> *"The adaptive pressure on your body to rapidly drop 'gains' in one area due to higher demands in
> another may require you to train these lower-priority systems or disciplines with just as much
> intensity as during your concurrent progress phases if you want to minimize losses (just with more
> careful attention paid to limiting fatigue)."*

Same page: *"Progressing in a single parameter while stagnating or deteriorating in others is
technically not hybrid. It's sport switching."*

### ⛔ p134 — WHICH MILES GET CUT

> *"A running program that's intended to build peak running performance may have a certain ideal
> dose of mileage that maximizes adaptations, and a hybrid athlete may not be able to manage this
> and might need to ruthlessly chop miles here and there."*

Hybrid athletes end up doing proportionately more near-threshold running, compound lift variations
and plyometrics than they expected — in contrast to athletes who gravitate to accumulating
lower-intensity miles, *"junk volume — sessions that would seem to be lower in fatigue but end up
being equally low stimulus."* ⛔ **The cut comes out of the EASY miles.**

### ⛔ p149 — FEEL IS THE TRIGGER, BOTH DIRECTIONS

> *"If an athlete begins to show signs of overreaching… I recommend that you reduce a program by
> equal amounts in ALL these buckets if you're feeling taxed, and then you can progress incrementally
> in one or two buckets at a time (where indicated) if you're feeling ready to push again."*

⚠️ **THIS CORRECTS B4b**, which states "Nothing on these pages says an athlete should add or cut
weekly HOURS by feel." p149 says exactly that. p108 adds: *"Do as much as you feel you can for your
goals, but any exercise is better than none."*

### ⛔ p137 — A QUANTIFIED PRESCRIPTION FOR THE RUN+RIDE CUSTOMER

> *"If you're a hybrid runner and have determined that 18 to 20 miles per week running at various
> intensities represents your current upper bound, adding two hours of cycling or Arc Trainer/
> elliptical per week will almost certainly aid your running, as long as you properly maintain
> recovery."*

Same page carries the cross-training law verbatim: *"when in doubt, use cross-training for easy
work, not threshold or sprint work."*

### ⛔ p138 — THE EXCEPTION THAT SANCTIONS A HARD RIDE

> *"Consider adding some work at higher intensity with similar modalities IF you're really pushing
> the limits of your tolerable volume and you can't otherwise figure out how to break through to the
> next level."*

⛔ So a hard RIDE in place of a hard run is permitted **precisely when running volume is capped** —
which is this app's customer. This is the page that turns the bike graft from an inference into a
sanctioned case.

### ⛔ p86 — THE SECOND QUANTIFIED INTERFERENCE COST, LIFTING → ENDURANCE

> *"A highly taxing, 14+ work set session may diminish performance in other modalities significantly
> for twenty-four hours and still notably for up to seventy-two hours. A less taxing 6 to 8 work set
> session may result in only marginal performance deficits for twenty-four hours, with few issues
> noted forty-eight hours after the session."*

⛔ **The cost of a lifting day is a SET COUNT, not a percentage.** 6–8 work sets keeps the next day's
run intact; 14+ does not.

### CONFIRMED OFF THE PAGE — all previously one generation removed

| claim | page |
|---|---|
| The five accounting buckets, defined individually, two worked weekly examples | pp.146–147 |
| 10%/week change rule — *"aiming to change each of these by less than 10 percent per week, though ideally 5 percent is as high as I will usually go"* | p148 |
| Back off all buckets equally when overreaching | p149 |
| Weekly floor: one speed, one subthreshold, remainder VT1 or below · "All minutes count" | p109 |
| 2h VT1 session ceiling + 6–8h between two-a-days | p108 |
| One-third of productive volume, at least 1×/week, holds an adaptation | p151 |
| Strength dose: 4–6 reps over 90% + 15–20 velocity reps at 70–85%, 2×/week ideal, floor once per 8–9 days, 3:1 speed-to-heavy when adding | p80 |
| Hypertrophy dose: 8–12 sets/muscle/week, 18–20 borders overreaching, 32–48 effective reps, 70–80 max, 8–10 reps preferred, 1–2 RIR | p86 |

### ⛔ p99 CLOSES B4b's OPEN CONFLICT

4:1 work-to-rest, rest never under 30s or over 2 min, 8–15 min intervals capped at 2 min rest, over
15 min becomes a single-effort tempo. ⚠️ **This resolves the apparent contradiction with p98:** 4:1
is THRESHOLD work; the "full rest or walk periods" instruction is SUBTHRESHOLD 90–94% repeats. Two
different intensities, no contradiction. B4b's note that "the page carrying 4:1 has not been found"
is now closed.

### STILL UNREAD

⚠️ Roughly 35 frames of the pp.69–151 shoot were still unread when the session ended. Nothing found
so far contradicts the corpus's existing "no program is both strength-leading and run+ride" finding,
the 2h30-vs-p247 long-run conflict, or the shipped lifting progression.
