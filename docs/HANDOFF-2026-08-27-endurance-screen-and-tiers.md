# HANDOFF — 2026-08-27. The endurance screen, the tier control, and one blocking bug.

**Written for a fresh session at the end of a long day.** The previous handoff
(`HANDOFF-endurance-and-progression-2026-08-26.md`) is now a RESEARCH document — §A–§I hold the book
findings and they are still authoritative. **This file is the state and the open work.** Read this
first; go to that one when you need a page cited.

---

## STATE — three ways

| | |
|---|---|
| **pushed + deployed** | through `192694b6`. Client live on `efforts.work` (confirmed off the served bundle, not assumed). Edge functions `generate-strength-plan`, `create-goal-and-materialize-plan`, `rematerialize-standing-block`. |
| **committed, NOT pushed** | `9ba51cf6` and `1d873131` — the hours-rung fix and the fixed-dose fix. Tests green. |
| **verified on a device** | Michael built plans through the live wizard repeatedly today and read the exports. **The wizard and the composer ARE device-exercised.** What has never been checked: the strides reaching an actual Garmin workout. |

---

# ⛔ 1. THE ONE THING BLOCKING EVERYTHING ELSE

**The session builder generates sessions Viada does not prescribe.** Found while measuring durations
for a new screen; reported to the terminal session, not yet fixed.

Measured, `run_near_threshold` level 3 at `size: 0.5`:

    race_repeats     builds  4 × 900s (15 min)   → 90m total
    below_threshold  builds  7 × 510s (8:30)     → 85m total

p234 level 3, race-specific NT sessions, all four he prints:

    5K:            4 × 5-minute repeats @ 105%
    10K:           4 × 8-minute repeats @ 100%
    Half-marathon: 3 × 12-minute repeats @ 95%
    Marathon:      3 × 15-minute repeats @ 92%

⛔ **Fifteen-minute repeats come as THREE.** Four repeats only ever appear at five or eight minutes.
The build pairs the marathon's interval length with the 5K's rep count. Same on the other archetype:
p234 gives *"4 rounds of 8:30 @ 85% + 1 minute @ VT1"*; the build does seven rounds.

⚠️ **LIKELY CAUSE, unconfirmed:** `repBand` and `repsBand` are independent ranges, so `size` walks
both toward their tops at once. His options are PAIRS — a rep count belongs to an interval length.
⚠️ **Also unconfirmed:** whether the between-rep recoveries are in the clock. A probe printed the
work step and nothing else inside the block; they may live on `restBetween`.

**Why it blocks:** the tier screen below prints the longest hard session each tier gives. Those
numbers come straight out of these bands.

---

# 2. THE SCREEN MICHAEL DESIGNED TODAY — settled, waiting only on §1's numbers

Two chips per sport, under that sport's hours and days on the Endurance focus step.

```
Running experience
Sets the length of your hard runs.
[ Newer · up to XX min ]  [ Experienced · up to XX min ]

Riding experience
Sets the length of your hard rides.
[ Newer · up to XX min ]  [ Experienced · up to XX min ]
```

⛔ **TWO TIERS, NOT THREE, AND THE RULING IS HIS:** *"if its not associated with 5k plus stregnth
than no."* Strength + 5K uses exactly two levels per hard session — the standard week and the taper
week. Near-threshold: level 3 standard, level 1 taper. Above-threshold: level 2 standard, level 1
taper. **Level 3 never appears on the Monday session in this program, so there is no third rung.**

⛔ **CHIPS, NOT A DROPDOWN.** With two options a dropdown costs two taps and hides half the choice.
The Run/Ride pair inside each slot row is the same control; this matches it.
⛔ **THE DURATION SITS ON THE CHIP.** A separate table below makes the athlete look up their own
answer. Michael rejected that arrangement explicitly.
⛔ **SHOW THE MAXIMUM, NOT A RANGE OR A TYPICAL** (his call). Ranges overlap between tiers because
the session shape rotates weekly; maxima ladder cleanly.
⚠️ **THE NUMBERS DEPEND ON WHICH HARD SLOT THAT SPORT FILLS.** A run on Monday is `run_mlss`; a run
on Wednesday is `run_near_threshold`. Different sessions, different durations. The screen has the
slot answers four rows above.

⚠️ **THE RIDE TIERS CANNOT BE SOURCED TO THE PROGRAM.** Every endurance session in Strength + 5K is
a RUN. Ride tiers use his printed cycling levels (p238-239), which is the same graft the bike has
always been. Label it ours.

⛔⛔ **AND BE STRAIGHT ABOUT WHAT THE NUMBER CLAIMS** (Michael, before the chips were approved). The
repeat-count fix removes combinations outside anything he PAIRS. It does **not** make every built
session a line from the book — the library models a family as a SHAPE inside his bands, and its own
type says so. Five rounds of 8:30 sits inside his level-3 work band and is printed nowhere on p234.

**So the honest split, and copy must stay on the right side of it:**
· **HIS** — the levels, the work bands, the session shapes, the warm-up and cooldown, the durations
  those produce.
· **OURS** — the exact repeat-by-interval combination inside them.

A chip reading *"up to 46 min"* is a claim about what the tier gives, and it is true. A screen that
said *"your session from p234"* would not be. Never name him for a specific workout.


---

# ⛔ 3. WHAT THE TIER CONTROL REPLACES — and why it exists

Today the level is inferred from logged history alone, and **`lowVolumeSports` treats no history as
low volume** (`volume-bounds.ts`: `if (!Number.isFinite(minutes) || minutes <= 0) { out.push(sport) }`).

Consequences, all confirmed:
- A brand-new account gets beginner-sized sessions regardless of what the athlete actually does.
- **It never ramps.** The level is decided at build and never recomputed. Log four weeks of real
  running and you stay where you started for the remaining eight.
- ⚠️ It contradicts its own sibling: `demonstratedRunVolume` returns `null` rather than zero
  precisely so nothing reads a blank as a measurement. The advanced tier treats null as "no bonus",
  which is safe. This treats null as "low", which is a claim.

⚠️ **THERE IS NO EXPERIENCE QUESTION ANYWHERE IN THIS FLOW.** The `fitness` field exists but is
hardcoded to `'intermediate'` on the strength path (`NonRaceBuilder.tsx:1434`) and the Standing Plan
does not read it. The word in Michael's export was never his answer.

**The intended rule once the control ships:** logged history when it exists, the athlete's answer
when it does not, and history corrects it as it accrues. Evidence beats a claim; a claim beats
nothing. Today we use nothing and call it beginner.

---

# 4. RULED TODAY — do not re-litigate

| ruling | source |
|---|---|
| **Two tiers, not three** | Michael: only what Strength + 5K itself uses |
| **Show the maximum duration** | Michael, over a typical or a range |
| **Chips, not dropdowns; duration on the chip** | Michael |
| **Experience is asked per sport** — one for running, one for riding | Michael |
| **It does not touch the lifting** | traced: the tier only sizes endurance sessions |
| **Quality is a fixed dose, not the leftover** | `1d873131` — see §5 |
| **More hours does NOT lengthen a hard session** | the LEVEL is the difficulty dial (p246); hours move the base families (p93) |

⚠️ **A CORRECTION MADE IN-SESSION, RECORDED SO IT IS NOT REPEATED.** I told Michael more hours would
push the hard session up its band. That is wrong and the opposite shipped. p246 assigns the level and
p93 puts surplus on easy work.

---

# 5. WHAT SHIPPED TODAY

| commit | what Michael would see |
|---|---|
| `ca255cb2` | plyometrics start with the easiest drills and build up (p89's ramp) |
| `1432e5d7` | the rep progression is credited to Viada — p123's "circle of maxes" |
| `6d946083` | the long session caps at 90-100 min (p247), and the cap now actually binds |
| `3fdfa9c5` | both quality sessions are part of the plan; no more skipping them |
| `15e8cac8` | a low-volume athlete is not handed more running than they do |
| `f5c7b59b` | strides on the easy run — the frame's only speed work — as real interval steps |
| `8adb4422` | the extra-hours fill measures the appended dose, not the whole ladder |
| `a6e644a8` | a ride-only athlete can use the plan at all |
| `38eaaf91` | the low-volume gate is derived rather than picked, and reaches the bike |
| `fa0b32bb` | the lifting cues land where the athlete lives, not in the wizard |
| `e50da020` | "Recovery session" → "Easy session" |
| `bb4275c1` `11758613` | the endurance ledger — his three intensity buckets, placed per step off the pages |
| `a442f070` | blocked line reads top-down; the dead "slowdown" claim is cut |
| `20b25e76` `563b66af` | a compound in a top set gets a number, off the app's own ratio table |
| `df70eecb` | the run-days answer reaches the engine |
| `17c6298e` | a derived lift carries a whole step instead of losing it to rounding |
| `192694b6` | one name for the near-threshold session across wizard and plan |
| `9ba51cf6` ⚠️ unpushed | the hours ask lands on the nearer rung |
| `1d873131` ⚠️ unpushed | a quality session is a fixed dose, not the leftover |

---

# 6. STILL OPEN

1. ⛔ **§1's builder bug.** Blocks the screen.
2. **The tier control itself** (§2), once §1 gives real numbers.
3. **The tier gate** (§3) — no history reads as low, and it never ramps.
4. **The endurance ledger has no surface.** Built and computing; State has no home for five numbers
   (`ReadoutTiles` caps at three) and nothing renders it.
5. **The tamp-down control.** `adapt-plan` declares `endurance_deload` and never emits it. Transport
   for suggestions exists; **display and accept do not** — no component renders
   `plan_adaptation_suggestions` and no `action: 'accept'` call exists under `src/`.
6. **Nothing the athlete reports changes a plan.** Soreness, RPE, feeling, skip reason all produce
   copy and stop. `readiness_checkins` is read by three server modules and written by nothing —
   energy and sleep are never asked anywhere.
7. **The strides have never been seen on a watch.** The test asserts they expand to intervals; nobody
   has sent one to Garmin.
8. **Cluster sets / rest-pause** — p83 names them for hybrid athletes specifically. Not built.
9. **`p215.jpg` is still missing** from `book-sources/`. The working number — 96% of a fresh
   prediction — cannot be re-verified, and every prescribed weight rests on it.

---

# 7. HOW TO WORK WITH HIM — carried forward, all still true

- **Plain words.** No file names, no function names, no invented terms. Describe what he would SEE.
  He built the app and does not read code. This was the single most common correction today.
- **The finding first, then stop.** No preamble, no process narration, no closing offer.
- ⛔ **Verify before asserting.** Every claim that mattered today was settled by opening the page or
  running a probe. Two of my own confident statements were wrong and he caught both.
- ⛔ **Read the page, not the doc.** The images are at
  `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/` — local only, deliberately not in git.
  A terminal session looked in the repo, found nothing, and coded a ledger one generation removed.
- **He designs the screens.** Today's control is his: two chips, per sport, duration on the chip,
  maximum not typical. Offer the constraint, not the design.
- **Push and deploy are gated on him.** A relayed approval is not approval — the terminal session
  correctly refused one today.
