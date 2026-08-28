# HANDOFF — 2026-08-27. Build the experience control. Everything for it is settled.

**Written for a fresh session at the end of a long day.** The previous handoff
(`HANDOFF-endurance-and-progression-2026-08-26.md`) is now a RESEARCH document — §A–§I hold the book
findings and they are still authoritative. **This file is the state and the open work.** Read this
first; go to that one when you need a page cited.

---

## STATE — three ways

| | |
|---|---|
| **pushed + deployed** | through `192694b6`. Client live on `efforts.work` (confirmed off the served bundle, not assumed). Edge functions `generate-strength-plan`, `create-goal-and-materialize-plan`, `rematerialize-standing-block`. |
| **all pushed + deployed** | through `f8cb7637`, 2026-08-27 evening. 390 engine tests green. Includes the hours-rung fix, the fixed-dose fix and the repeat-count fix. |
| **verified on a device** | Michael built plans through the live wizard repeatedly today and read the exports. **The wizard and the composer ARE device-exercised.** What has never been checked: the strides reaching an actual Garmin workout. |

---

# ✅ BUILT, PUSHED AND DEPLOYED — 2026-08-27 evening. See `DEPLOY-OWED.md` for versions and what is owed.
#
# ⛔ THIS FILE IS NOW HISTORY. Read it for the RULINGS and the reasoning; read `DEPLOY-OWED.md` for
# state. Where the two differ, that one is later.
#
# ⚠️ FIVE RULINGS ARRIVED AFTER THIS FILE WAS WRITTEN AND OVERRIDE PARTS OF §2 BELOW:
#
# 1. ⛔ THE CHIP'S NUMBER IS THE HARD SESSION ONLY. §2's draft copy said "hard runs and your long
#    run"; making the number cover the long session too let the long run swallow it (Michael's own
#    config read 90/100, which is the Saturday long run, while the hard run it was setting was ~45).
#    The long run still MOVES with the tier — p247 ties it to experience level — it is simply not
#    what the chip claims.
# 2. ⛔ THE LABELS ARE "Less experienced" / "More experienced". "Newer" reads as novice and this
#    product's athletes are not novices. p247's own contrast: *"more proficient runners"* against
#    *"less experienced runners"*.
# 3. ⛔ THE HARD RIDE CLAMPS TO LEVEL 2, wherever the level came from. A ride on the day-3 slot was
#    inheriting NT's level 3; p278's Cycling Base tops out at level 1-2 anywhere in the book.
# 4. ⛔ ONE HARD RUN + ONE HARD RIDE NORMALISES: ride on his day 1, run on his day 3, whichever slot
#    the athlete answered. p278 places the sweet spot on day 1; p246 places NT level 3 on day 3.
#    Each sport lands on the day its own page prescribes.
# 5. ⛔ THE HARD ROWS OFFER THE SPORT TOGGLE ONLY. The archetype picker came off: an archetype the
#    athlete chose can cease to exist when the tier changes the level, and the chip's duration is
#    computed before any such pick. The week-to-week rotation still varies the session.
#
# ⛔ AND THE MEASURED NUMBERS IN §2b's TABLE ARE SUPERSEDED. Those were probe figures at `size: 0.5`.
# The shipped chips, computed from the athlete's own slots and baselines, read on Michael's config:
# **running 45 / 66 · riding 68 / 75.**
#
# ⚠️ THE RIDE LADDER IS 7 MINUTES AND THAT IS DELIBERATE, not a weak ladder to be widened. p278 day 1
# is the only cell in the corpus prescribing a SPAN — `Cyc sweet spot (level 1-2)` — and the two
# chips ARE that span spelled out. A 1.5x run-to-ride ratio, a 75-minute cap and a top-of-band build
# were each floated on 2026-08-27 and each withdrawn. Do not reopen it.

---

# 1. ✅ FIXED — the bug that was blocking it (`67cda50f`, deployed)

**The session builder generates sessions Viada does not prescribe.** Found while measuring durations
for a new screen; reported to the terminal session, not yet fixed.

What it did, measured at the time, `run_near_threshold` level 3 at `size: 0.5`:

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

**Why it mattered:** the tier screen prints the longest hard session each tier gives, straight out of
these bands. ✅ The count now comes from the family's own work band divided by the repeat length, so a
longer repeat yields fewer of them — the shape of his table. The marathon case builds 3 × 15 exactly.

---

# ⛔ 2. THE SCREEN MICHAEL DESIGNED TODAY — BUILD THIS. Numbers are measured and in this file.

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

# ⛔⛔ 2b. MICHAEL'S LAST RULING OF THE DAY — HISTORY IS OUT OF THE LEVEL DECISION

*"I dont want that."* Said on being told the level is currently decided from his last 28 days of
logged runs and rides.

⛔ **THE EXPERIENCE CHIPS BECOME THE SOLE INPUT TO THE HARD-SESSION LEVEL.** `lowVolumeSports` /
`demonstratedRunVolume` stop deciding it. No fallback, no "history corrects it later" — the athlete
answers and that is the level.

⛔ **HIS OWN CASE, AND IT IS THE WHOLE ARGUMENT:** *"im coming off a marathon a few months ago I was
training less, this is the wrong thing."* A 28-day window measures the last month, not training age.
Post-race, injured, off-season, on holiday, or simply not syncing a watch all read as beginner.
p247's word is *"experience level"*, never recent mileage.

⚠️ **NOT IN SCOPE UNLESS HE SAYS SO:** the separate advanced tier that adds extra EASY sessions above
25 demonstrated miles a week (`advancedTierSessions`). It adds volume, not hard-session length. It
has the same 28-day flaw and he was told it exists; he left it standing.

⚠️ **WHAT THIS DELETES ALONG WITH IT:** §3's no-history-reads-as-low problem and the never-ramps
problem both disappear, because neither the gate nor the ramp exists any more. §3 below is retained
as the REASON the control exists, not as open work.
---

# ⛔ 2c. SECOND RULING — FILL EVERYTHING AFTER THE TEST, NOT AFTER THE LIVE WEEK

*"its a dumb rule should just fill everything after test."* Said after hitting it on his own block.

**What he hit.** Block started Monday 24 August. He tested Monday (upper) and Tuesday (lower).
Thursday's DE: Upper — same week, after both tests — still read *"No weight is prescribed"*, while
week 2's identical session carried 105 lb across four sets. Confirmed in his export: week 1's DE
sessions have no loads, week 2 onward do.

**The rule today.** `rematerialize-standing-block/index.ts:290` passes
`afterWeek: Math.max(TEST_WEEK_INDEX, currentWeek)`, commented *"HISTORY AND THE LIVE WEEK STAND."*

⛔ **IT IS SELF-DEFEATING AS WRITTEN.** The test sits INSIDE the live week, so protecting the live
week protects exactly the sessions the test just enabled. ⚠️ And it is NOT the dev button — the same
guard runs on a real save. Michael asked; a genuine test would have done the same thing.

⛔ **THE RULING: the cut is the TEST, not the week.**
⚠️ **KEEP THE OTHER HALF.** *"History stands"* is the real constraint — never rewrite a session
already logged. So: after the test, minus anything completed. A per-session guard, not a per-week one.
⚠️ **IT IS A DAY-LEVEL CUT AND THE FUNCTION WORKS IN WEEKS.** `restateFromTest`'s `afterWeek` is a
week index. Do NOT fake it by decrementing the week number — that would expose the test sessions
themselves.

⚠️ **AND ONE STALE LINE GOES WITH IT.** The logger prints *"No weight is prescribed — find the load
where the target reps leave a rep or two in reserve"* on sessions that DO prescribe one. Michael has
a screenshot of that note sitting under four sets at 105 lb. Whatever gates it must read whether the
row actually carries a load.



## ⛔ THE MEASURED NUMBERS — re-measured after the repeat-count fix, off built sessions

Maximum session length per level, warm-up and cooldown included, at `size: 0.5`:

| family | L1 | L2 | L3 |
|---|---|---|---|
| `run_near_threshold` (hard slot 2) | **46m** | 56m | **71m** |
| `run_mlss` (hard slot 1) | **44m** | **49m** | 54m |
| `ride_sweet_spot` | **68m** | **75m** | 83m |

**Bold = the two levels Strength + 5K actually uses for that slot** (standard week and taper week),
which are the two tiers. The chips for Michael's own config — ride on hard 1, run on hard 2:

```
Running experience
Sets the length of your hard runs.
[ Newer · up to 46 min ]  [ Experienced · up to 71 min ]

Riding experience
Sets the length of your hard rides.
[ Newer · up to 68 min ]  [ Experienced · up to 75 min ]
```

⚠️ **THE RIDE LADDER IS WEAK — 68 against 75.** Both levels' longest shape is his 20-minute-block
session, which barely changes between them. Michael was told and kept the control: it is still the
athlete's answer, and it stops the bike being the one sport they have no say over.
⚠️ **SWAP THE SPORTS BETWEEN SLOTS AND THE NUMBERS CHANGE** — a run on Monday is 44 against 49, a
ride on Wednesday is 68 against 83. The screen computes them from the slot answers four rows above.
⚠️ **CONFIRMED IN A PROBE, NOT IN A BUILT PLAN.** Michael had not rebuilt after the deploy when the
session ended.


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

1. ⛔⛔ **BUILD THE EXPERIENCE CONTROL** (§2 + §2b) and **§2c's rematerialize cut**. Both ruled today.
   The experience control: Two chips per sport, history out of the level.
   This is the next piece of work and everything for it is settled — design, copy, tiers, numbers.
2. ✅ **§1's builder bug is FIXED** (`67cda50f`) and the numbers below are re-measured against it.
3. ✅ **The tier gate problems in §3 are moot** once §2b lands — no gate, no ramp needed.
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
