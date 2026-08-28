# WORKORDER — the experience control. 2026-08-27, approved by Michael in chat.

**Read `HANDOFF-2026-08-27-endurance-screen-and-tiers.md` first** — §2, §2b and §4 are the design and
the rulings. This file is the build, and it carries the decisions made after that handoff was
written. Where the two differ, this one is later.

⛔ **Everything below is settled. Nothing here needs a design decision except §7, which is one
question for Michael and is not blocking — build to the recommendation and flag it.**

---

## 1. WHAT IT IS

Two chips per sport on the Endurance focus step, under that sport's hours and days rows.

```
Running experience
Sets how long your hard runs and your long run are.
[ Newer · up to 46 min · needs 2h/wk ]   [ Experienced · up to 71 min · needs 3h/wk ]

Riding experience
Sets how long your hard rides and your long ride are.
[ Newer · up to 68 min · needs Xh/wk ]   [ Experienced · up to 75 min · needs Xh/wk ]
```

⚠️ **THE NUMBERS ON THE CHIPS ARE COMPUTED, NEVER TYPED.** Both come from
`weekBounds` / `sessionDurationBandSeconds` against the athlete's own slot assignment and baselines.
The figures printed above are Michael's own config at the time of measuring and are here to show the
shape, not to be pasted in. A run on Monday is a different session from a run on Wednesday and the
numbers differ — the slot answers sit four rows above on the same screen.

---

## 2. THE ENGINE CHANGE — history stops deciding the level

⛔ **`lowVolumeSports` / `demonstratedWeeklyMinutes` stop being the input to the tier.** The athlete's
chip answer is the sole input. No fallback, no "history corrects it later".

**Michael's reason, and it is the whole argument** (2026-08-27): *"im coming off a marathon a few
months ago I was training less, this is the wrong thing."* A 28-day window measures the last month,
not training age. p247's word is **"experience level"**, never recent mileage — and the book gives no
mileage qualifier anywhere. Every number in the current gate is ours.

**The mapping is already written and does not change:**

| chip | what it applies |
|---|---|
| **Newer** | `LOW_VOLUME_TIER_LEVELS` for that sport — level 1 on `run_mlss`, `run_near_threshold`, `run_lsd` / `ride_sweet_spot`, `ride_endurance` |
| **Experienced** | nothing. The frame's own printed levels, p246 as transcribed. |

✅ **So this is a swap of the gate's INPUT, not a new level system.** `lowVolumeLevels` keeps its job;
what feeds it changes from a measurement to an answer.

⚠️ **`frames.ts:352`'s existing note stays true and must not be deleted** — dropping the ride
families' level is ours, because p246 has no cycling counterpart and no ride taper column exists.

### 2a. Which sessions actually move, and the copy has to match

- **Run:** the two hard runs and the long run. The easy run (`run_vt1`) is not in the tier map and
  does not move. ✅ This is book-backed — p247: *"Mileage will be dictated by experience level, with
  more proficient runners looking at runs up to 90 to 100 minutes here… and less experienced runners
  opting for shorter fartlek variations."* The long run moving with experience is HIS sentence.
- **Ride:** the hard rides, and the easy and long rides too, because `ride_endurance` is one family
  covering both. ⚠️ **Nothing in the book backs the ride side** — see the `frames.ts` note. It stays
  as it is; Michael was told and left it standing.

⛔ **THEREFORE THE SUBTITLE IS "hard runs and your long run", NOT "hard runs".** The handoff's draft
copy said hard runs only and that would be a false claim about what the control does.

### 2b. Where the answer has to travel

`levelOverrides` already exists on the compose args and is already the winning input at
`compose.ts:1652`. **It is populated by nothing today.** The answer needs a path:

1. the wizard's own state on the Endurance focus step,
2. persisted on the plan row (there is no column for it — `plan-row.ts` carries
   `demonstrated_weekly_miles` and nothing for this),
3. through `generate-strength-plan` into `compose`,
4. and through `rematerialize-standing-block`, which rebuilds later weeks and reads the stored row.

⛔ **STEP 4 IS NOT OPTIONAL.** A plan that rematerialises without the answer silently reverts to the
frame's levels mid-block.

⚠️ **DO NOT WRITE THE TIER INTO `levelOverrides` AS A SHORTCUT.** `compose.ts:1622` keeps that field
meaning *"the level the athlete chose"* deliberately, and this answer IS the athlete's choice — so it
belongs there, but the low-volume tier must not be folded in behind it.

---

## 3. THE MINIMUM HOURS, AND THE GATE

Each chip prints the weekly hours that tier needs for that sport. **It is the sport's own floor with
every session at its shortest** — a true "below this it does not fit", not a recommendation.
`weekBounds` already returns `runHours.min` / `rideHours.min`; compute it twice, once with the tier
applied and once without.

⛔ **THE TOP TIER GREYS OUT when the athlete's hours for that sport are below its minimum.** The
greyed chip keeps its "needs Xh/wk" readable — a dead chip with no reason sends people back up the
screen guessing.

⛔ **THE LOWER TIER NEVER GATES** (Michael: *"lower never gates just top"*). It is the plan's own
floor. If their hours do not reach even that, the problem is the hours ask and it is flagged there —
not by leaving both chips dead.

⛔ **DROPPING HOURS AFTER PICKING FALLS THEM BACK, VISIBLY.** Hours sit above the chips, so an athlete
can pick Experienced and then lower hours. That must move the selection to Newer where they can see
it happen — never build a week that silently does not fit.

### 3a. The collision this closes, worked

Experienced on both sports, 4 hours a week asked. The standard week is four endurance sessions:
hard ride up to 75 min, hard run up to 71, easy run 25–30, long run from 68 up to the 90–100 cap.
That is about four hours before the long run goes anywhere near its top. Today the two hard sessions
are a fixed dose and do not shrink, so the easy running is squeezed out, the engine marks the week
`over_cap` (`volume-bounds.ts:468`) — and **the athlete is never told**. Newer on the same week is
about 2h50 and fits with room.

---

## 4. WHAT THE SCREEN MUST NOT DO

- ⛔ **No dropdown.** Two options behind a dropdown costs two taps and hides half the choice
  (Michael). The Run/Ride pair inside each slot row is the same control; this matches it.
- ⛔ **No table below the chips.** The duration sits ON the chip. A lookup table makes the athlete
  find their own answer — rejected explicitly.
- ⛔ **The maximum, not a range and not a typical** (Michael). Ranges overlap between tiers because
  the session shape rotates weekly; maxima ladder cleanly.
- ⛔ **Three tiers is wrong.** Strength + 5K uses exactly two levels per hard session — the standard
  week and the taper week. Level 3 never appears on the Monday session, so there is no third rung.
- ⛔ **Chips only render for sports the athlete keeps.** `allowedSports` already does this on this
  screen; follow it rather than adding a second rule.

---

## 5. WHAT THE COPY MAY AND MAY NOT CLAIM

⛔ **Never name the author against a specific workout.** The honest split, and it is already recorded:

- **HIS** — the levels, the work bands, the session shapes, the warm-up and cooldown, and the
  durations those produce.
- **OURS** — the exact repeat-by-interval combination inside them, and the whole ride graft.

*"up to 46 min"* is a claim about what the tier gives and it is true. *"your session from p234"*
would not be.

---

## 6. WHAT THIS DOES NOT TOUCH

- **The lifting.** Traced: the tier only sizes endurance sessions.
- **`advancedTierSessions`** — the separate tier that adds one or two EASY sessions above 25
  demonstrated miles a week. It adds volume, not hard-session length, and Michael left it standing
  after being told it exists and has the same 28-day flaw. ⚠️ **Out of scope unless he says so.**
- **`demonstratedWeeklyMinutes` itself.** It still feeds the hours preview and the advanced tier.
  Only its role as the LEVEL gate is removed.

---

## 7. ⚠️ THE ONE OPEN QUESTION — not blocking, build to the recommendation

**Is the chip required, or does it arrive preselected?**

- **Recommended: required, and Continue is gated on it**, exactly as all four slots already are.
  A preselected "Newer" silently hands beginner-sized sessions to everyone who does not notice the
  control — which is the precise defect this control exists to remove.
- A preselected "Experienced" has the opposite failure and is worse: it overreaches by default.

Build it required. Flag it to Michael on delivery.

---

## 8. WHAT REMAINS UNGUARDED AFTER THIS SHIPS — say so, do not fix it here

The chip is a one-time answer with nothing behind it. Nothing an athlete reports — soreness, effort,
feeling, skip reason — changes a plan today; `adapt-plan` declares `endurance_deload` and never emits
it; no component renders a suggestion and no accept call exists. **So an athlete who overclaims is
not caught.** The book's own hedge is the tell — the one place he offers more volume he says to add
it *"initially to test recovery."*

⚠️ p246's taper weeks already drop both quality sessions to level 1 regardless of the tier, so an
overreaching athlete does get a lighter fortnight. That is a floor, not a correction.

---

## 9. HOW TO WORK WITH HIM — carried forward

- **Plain words.** No file names, no function names, no invented terms. Describe what he would SEE.
- **The finding first, then stop.** No preamble, no process narration, no closing offer.
- ⛔ **Verify before asserting.** Open the page or run the probe. The book images are at
  `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`, local only and deliberately not in git.
- ⛔ **Push and deploy are gated on him, and a relayed approval is not approval.**
