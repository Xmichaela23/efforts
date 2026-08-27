# HANDOFF — the rep progression, the endurance screen, and what the book actually says

**2026-08-26, end of a long session.** Written for a fresh session. Michael has been building this
plan for a year and is exhausted by it; read this before asking him anything.

## STATE — three ways

| | |
|---|---|
| **pushed** | YES, through `9faeb9a2` |
| **deployed** | YES — client via Netlify, edge functions where needed, all content-verified |
| **verified on a device** | ⛔ **NO. Nothing from today has been seen on a phone.** |

---

# ⛔ THE ONE THING TO READ IF YOU READ NOTHING ELSE

**p119 answers the product question and says the opposite of what the app assumes.**

> *"If you are peaking your strength and want to put running on the back burner, you should NOT
> simply 'run base miles' or 'sprint once a week' to maintain your running. You may reduce your
> running to a minimum effective dose, but it's crucial to continue to train running economy (often
> via speed work), maintain your threshold performance (through some near-threshold work), and base
> (via easy miles) in your running program. The volume can be dramatically reduced, but no quality
> should be allowed to deteriorate completely."*

Michael's stated goal for the customer is *"keep their top end, not sacrifice their miles."*
**Viada grants the top end and refuses the miles.** The volume is exactly what he cuts — and p134
says which miles: the easy ones, which he calls junk volume.

⛔ **The Endurance focus screen currently asks "how many hours do you hold?" and builds to that
number.** If p119 is right, the screen is asking the wrong question. It should be establishing that
three qualities stay present — speed, near-threshold, easy — at a reduced volume.

**That is unresolved and it is Michael's call.** Do not build either way without him.

---

# 1. WHAT SHIPPED TODAY, so it is not re-litigated

## The lifting progression — reps carry it, not plates

**The problem:** Viada's rate anchor is 1% every three weeks applied to the calculated 1RM (p247).
A percentage cannot be expressed on a bar below roughly 250 lb with 5 lb rounding. On a 170 bench
the prescribed heavy set is 145 and moves once in twelve weeks. One rep is worth about 3% — finer
than a 5 lb jump on a light bar, which is nearly 6%.

**What it does now:** the rep stepper is unbounded in both directions. Finish the range (or beat it)
two sessions running at the same weight → the bar takes one increment and the reps restart at the
bottom. A 0-rep set, or three straight declining sessions, undoes the last increment. `scheduledRise`
still runs underneath as the floor.

⛔ **THE 10% BACK-OFF DOES NOT SHIP AND MAY NOT COME BACK.** A rep drop inside the band is not a
stall — 4 then 3 then 3 at the same weight is normal in a week with five endurance sessions. And the
percentage back-off is a Wendler necessity: his training max climbs whether or not you keep up, so
you can get ahead of yourself. Here the bar only moves when earned, so nobody can outrun it. What
ships instead is an undo — return to the weight you were holding. Tests assert the absence.

⛔ **NO EARNED JUMP ON TOP OF A SCHEDULED ONE** (Michael's ruling). The earned streak belongs to a
weight and resets when `scheduledRise` moves the bar underneath. Pinned by its own test with a
"do not fix this" note — a future session will misread it as a broken streak counter.

⚠️ **RIR IS NOT PART OF THE MECHANISM.** A rep count is completed work; a reserve estimate is a guess
about a rep that was not performed, and it is least reliable in newer athletes. The logger's RIR
prompt stays as data; the progression does not read it.

⚠️ **AND IT MAY BE HIS, NOT OURS.** `DOUBLE_PROGRESSION_IS_OURS` labels this mechanism ours because
p247's *"circle of reps"* is undefined. **p123 defines the "circle of MAXES"** — rotate through rep
ranges, and when the athlete repeatedly succeeds, raise the theoretical 1RM and write the next cycle
from it. That is what shipped. Different words, 124 pages apart. **Relabelling OURS→HIS is Michael's
call and has not been made.**

## The Endurance focus screen

- Renamed from "Your endurance week", carries the eye mark, part of the Focus theme.
- Michael's own intro copy, verbatim, as a structure list plus two consequence lines. ⛔ The
  consequence lines stay at the TOP — he ruled out moving them onto the hard-session card: *"they
  already went into the restaurant so they will feel they should order something."*
- Picker reordered: Long session, Recovery session, Add a hard session. The two that block Continue
  come first.
- Hour dials are visible on arrival. They used to be four taps deep behind answering two other rows.
- ⛔ **A run-only athlete was being handed two hard sessions they never chose.** Fixed — the
  auto-assign fills only the required slots. This hit the core customer hardest.
- The tiered lifting-rate line is DELETED. Three tiers off the count of hard runs, the last two the
  same number said twice, hours never moved it, and its best state was the zero-touch default — the
  screen rewarded the empty week. The p247 split line ("the running lands on the legs…") survives in
  the volume note.
- ⛔ **The long session is MANDATORY** (Michael's ruling). The frame owns four endurance slots and
  the long one is his; declining it departs from the frame.

## Clubs are hidden, not deleted
One boolean gates the control, the minutes input and both copy references. The D-452 engine — club
is a pin, a club can BE the long ride — is untouched and tested. His word was "for now".

## The accessory screen is now "Build focus"
"Accessory" is HIS term for a non-competition movement in the same gross pattern (§E1b), not for
muscle work. All seven picks claim HYP cells, so "Build" is literal. Rows sort by his day numbers
(1, 1, 2, 4, 4, 5, 5, core last), not weekdays. The dial pills are hidden. The two leg rows are
"Leg accessory", not "Single-leg" — that label was a Wendler import and misnamed a cell whose own
p220 list holds a Zercher squat and a calf raise.

---

# 2. WHAT THE BOOK ACTUALLY SAYS — the findings that change things

⚠️ All page-verified today. Recorded in `docs/SOURCE-viada-hybrid-athlete.md` §B4b (read directly)
and §B4c (relayed by a session that died before transcribing — **verify before coding**).

| finding | page | why it matters |
|---|---|---|
| Cut the volume, keep all three qualities | p119 | see above — the whole endurance question |
| Intensity does NOT drop in a strength block | p118 | same intensity, less volume |
| "Progressing in one parameter while others deteriorate is sport switching, not hybrid" | p118 | worth knowing before calling this block hybrid |
| The cut comes out of the EASY miles — "junk volume" | p134 | tells you WHICH hours to remove |
| **18–20 mi/wk running + 2h cycling "will almost certainly aid your running"** | p137 | a prescription for this exact customer |
| **A hard ride replacing a hard run is sanctioned when running volume is capped** | p138 | turns the bike graft from inference into a named case |
| **A lifting day's cost is a SET COUNT.** 6–8 work sets → next day intact. 14+ → 24h badly, 72h still | p86 | the second quantified interference cost, and the first in the lifting→endurance direction |
| Feel is the trigger BOTH ways — taxed, cut all buckets equally; ready, add one or two back | p149 | corrects the earlier reading that his guidance is purely objective |
| The six-week adjustment signal: lower HR at completion, lower reported RPE, shorter self-chosen rests | p123 | ⚠️ it moves the athlete's TARGET, never their volume |
| p265: leaves recovery on the table — add work piece by piece if a few weeks pass with no notable fatigue **while still progressing** | p265 | doubly conditional |
| 10%/week bucket change, ideally ≤5% | p148 | now verified, was hearsay |
| Cross-train the EASY volume, never the quality work | pp.135–138 | a hard ride for a hard run is against this — unless the athlete rides as a sport |

## ⛔ The app's long-run number is wrong
The screen computes "the long run to about 2h30 at most". **p247 says 90 to 100 minutes for this
program.** The engine's figure is the top of his level-2 mixed-terrain hike range, which p247
overrides for Strength + 5K. `slotSpans` has NOT been touched — it is a separate ruling.

## ⛔ No program in the book is both strength-leading and run+ride
- **Strength + 5K** — strength-leading, powerlifting-compatible, real primaries. **Every one of its
  four endurance sessions is a RUN.** The bike is entirely ours.
- **Strength + Sprint Tri** (p268/269) — both sports AND real primaries, but he states outright that
  large strength improvements are unlikely; sprint tri performance is the goal.
- **The All Rounder** (p274/275) — run and bike natively, but **not one primary lift appears.** This
  is why Michael tried it and rejected it.
- **Cycling: Crit** — strength is DE secondary movements only.

⛔ **That gap is why the app grafts a bike onto Strength + 5K. It is a deliberate answer to a hole he
left, not a shortcut.** It currently reads in the code like a substitution feature.

---

# 3. THE CUSTOMER — Michael's words

> *"the 30 to 45 year old new athlete- not really hybrid but they are athletic and I want a real
> strength program that allows them to keep their top end not sacrifice their miles but open to
> anything and everything right now with viada as our north star"*

⚠️ **The age band is a general aim, not a filter — he is 57 and is himself in the segment.** What
defines the customer is the shape: athletic amateur, neither competitive nor novice; runs and rides
seriously year-round; wants real barbell progress; will not give up top-end fitness or volume;
mostly does not race — maybe a marathon, a trail race, at the outside a 70.3; did not read Viada and
does not call themselves a hybrid athlete.

⛔ **And p119 says he cannot have all of it.** That conversation has not happened yet.

---

# 4. WHAT IS OPEN

1. ⛔ **The p119 problem.** Does the endurance screen keep asking for hours, or does it change shape?
2. **The customer research never ran.** Two sessions were launched and both died. Nobody has real
   numbers on what run-riders actually hold weekly.
3. **~35 of the 62 photographed pages are still unread** (pp.69–151 shoot).
4. **The long-run figure** — 2h30 in the engine vs 90–100 min on p247.
5. **"Circle of maxes"** — relabel the progression HIS, or leave it OURS?
6. **The single-sport copy problem, now live.** A run-only athlete reads *"Rides are easier on your
   legs than runs"* on a screen that never offers them a ride. This screen has never varied copy by
   sport. Two small fixes exist; neither is built.
7. **The volume-section copy.** Michael's draft ("Keep your running and ride volume / anything over
   the hard limits will default to easy sessions / Hard run cap: … ride cap: …") was never shipped.
   ⚠️ `keep` fails the voice gate as a banned imperative, and a single cap per sport drops the long
   session. The intent was that the athlete understand the RANGE the sessions run, so they can size
   their hours against it.
8. **"Per-discipline focus" / "Strength work"** — theme-rename candidates, unruled.
9. ⛔ **THE DEVICE CHECK.** Nothing from today has been seen on a phone. First things to look at:
   typing 0 on a heavy set saves and shows as 0; the pull-up row has a reps box at all (it had none);
   the heavy set opens on last week's number rather than at 5.

---

# 5. HOW TO WORK WITH HIM

- **Plain words.** No code identifiers, no invented terms, no jargon. Describe what he would SEE.
- **The finding first**, then stop. No preamble, no process narration, no closing offer.
- ⛔ **Play back what you think he means in one line and WAIT.** He thinks out loud; converting a
  half-formed thought into a work order costs him hours. Today's single biggest failure.
- ⛔ **Relay his rulings verbatim.** Every gloss or inferred detail added to his words has been wrong.
- ⛔ **Read the book before answering a book question.** Reporting an engine-computed number when he
  asked what Viada says wasted an hour.
- **He holds several interacting concepts at once and expects the same.** Answering one piece in
  isolation is worse than not answering — his words: *"everything has a domino effect."*
- **No past ruling of his, and none of the app's invented rules, constrain a new finding.**
  *"Just don't use my words against me."* The strength-forward 12-week block is the one fixed thing.

---
---

# ADDENDUM — 2026-08-26, evening session. THE p119 QUESTION IS CLOSED.

**Written after reading twenty more pages off the images: 88, 89, 108, 109, 118, 119, 120, 121, 122,
123, 132, 133, 134, 136, 137, 138, 146, 147, 148, 149, 150, 151.** Everything below is page-verified
or code-traced in this session. ⛔ The section above was written before these pages were read; where
the two disagree, this one is later.

---

## ⛔ §A. THE p119 PROBLEM IS RESOLVED, AND THE SCREEN WAS NOT ASKING THE WRONG QUESTION

The section above says the hours question may be wrong and that it is Michael's call. **It is
answered, and the answer is that the question is right and the DEFAULT is wrong.**

**p149 carries the exception the earlier reading missed:**

> *"If you aren't nearly at your level of maximum tolerable volume, you may find that you tolerate a
> general hybrid program just fine and can jump right into a different type of program with minimal
> stress. This overall load analysis is still a worthy exercise, however, because it can highlight
> potential risks in the transition and help identify the specific culprit if you find yourself being
> overtaxed in the first few weeks or months of a new program."*

⛔ **So p119's volume cut is for an athlete AT their tolerable ceiling.** The customer — two to three
hours running, five riding — is nowhere near one. **Their hours stay.** The cut is not owed.

⛔ **AND ASKING WHAT THEY CURRENTLY HOLD IS HIS OWN METHOD**, pp.146–148: audit the existing week's
buckets, then move each by under 10%. p149: *"you do not just 'start' a hybrid program; you 'evolve'
the program into a hybrid one."* The screen's *"Pick the hours you currently hold comfortably"* is
that instruction.

⛔ **WHAT IS ACTUALLY WRONG IS THE DEFAULT.** Leave the screen untouched and the week is one long
easy session plus one recovery session — which is *"run base miles"*, the phrase p119 uses when
saying not to do it. Both quality sessions sit behind an opt-in that defaults to none.

**And the machinery is already right underneath:** the hour dials only stretch the base families
(`run_vt1`, `run_lsd`, `ride_endurance`). Quality stays locked at the frame's level. So an extra hour
can only ever become easy work — which is p134's rule already built.

---

## ⛔ §B. RULINGS MADE THIS SESSION — do not re-litigate

| ruling | his words / basis |
|---|---|
| **Both quality sessions stop being optional** | *"lets not make them optional that was not understanding things on my part"* — plural. All four slots become the frame's. |
| **Long session → 90–100 minutes** | *"His page says ninety to a hundred minutes use that."* Replaces the 2h30 ceiling, which was OURS. |
| **Plyo rotation reordered to his ramp** | *"lets do that."* See §D4. |
| **The plyo day STAYS for a non-runner** | p88's benefits are running economy, chronic-injury reduction AND balance *"which can help even loaded movements and carries."* Not runner-only. This unblocks §E piece 4. |
| **`DOUBLE_PROGRESSION_IS_OURS` → HIS** | p123 read directly, see §C1. |
| **Build focus keeps its name** | The word is accurate; the imbalance is the problem. See piece 7. |

---

## ⛔ §C. FINDINGS THAT CHANGE A LABEL OR A NUMBER

### C1. ⛔⛔ THE REP PROGRESSION IS HIS. p123, read off the image, top of page, verbatim:

> *"they do give a solid starting point for performance. As the weeks progress, athletes may rotate
> through the **'circle of maxes,'** varying repetition ranges and using their expected performance
> on each as a baseline. **If an athlete repeatedly succeeds at these lifts or outperforms, the coach
> may, after a period of time, raise their theoretical 1-rep max and base the next few training
> microcycles/training weeks on this new max.**"*

Rotate rep ranges → repeatedly succeed or beat them → raise the theoretical max → rebuild the next
weeks from it. **That is what shipped.** Open item 5 of the section above is closed: relabel
`DOUBLE_PROGRESSION_IS_OURS` as HIS, cite p123.

### C2. ⛔ THERE IS NO SPEED WORK ANYWHERE IN THE FRAME, and the earlier reading of the fix was wrong.

The frame's four slots are `run_mlss` (threshold), `run_near_threshold`, `run_vt1` (easy) and
`run_lsd` (long). **None is economy/speed work.** p119 lists economy FIRST of the three qualities.

⚠️ **A CORRECTION MADE IN-SESSION, RECORDED SO IT IS NOT REPEATED.** It was first stated that the
long run's fast variant already exists and merely defaults off. **It does not.** `run_lsd`'s three
archetypes are `long_with_inserts` (inserts at 0.95–1.15 of threshold), `fartlek` (0.85) and
`race_pace_finish`. **All three are threshold-or-below. None is speed.** `run_sprint_power`
(`workFloorPct` 1.3) is fully built with three archetypes — `short_max` is 25–50 m × 4–8, which is
strides in all but name — and **the frame never reaches for it.**

⛔ **p109 IS THE PAGE THAT MAKES THIS SOLVABLE IN FOUR SLOTS:**

> *"Even for speed development, athletes can improve turnover/running economy with as few as a
> handful of strides before, during, or after other running sessions, so **there's no need for a
> speed session to be a lengthy stand-alone!**"*

Same page: *"All minutes count. If your schedule dictates that you can get in only two or three runs
a week, **many of them can be multipurpose sessions**, with extended warm-ups and cooldowns adding
extra low-intensity minutes in the same session as speed or subthreshold intervals."*

⛔ **THE REAL GAP: every session in the library is a WHOLE session.** There is no shape for hanging a
short piece of fast work onto an otherwise easy one. That is what piece 2 has to build — not a
default flip.

### C3. The long-run conflict is settled — 90–100 min (p247), not 2h30. `LADDER_CEILING_MIN.run_lsd`
is `150`; his figure is 90–100. `slotSpans` and the ladder ceiling both move.

### C4. ⛔ PROVENANCE — Part G item 6 IS LARGELY CLOSED by this session's reading.

Read off the page today and **no longer one generation removed**: the five accounting buckets
(pp.146–147, with both worked examples), the 10%/week change rule (p148, *"though ideally 5 percent
is as high as I will usually go"*), back off all buckets equally (p149), the weekly floor and
*"all minutes count"* (p109), the 2h VT1 ceiling and 6–8h between two-a-days (p108), the one-third
maintenance figure (p151). **These may now be coded as constants.** Part G item 6 should be updated.

### C5. p151 answers the race question and nothing needs building for it.

*"PROGRESSING TO A LONGER EVENT"* — for a marathon or a 70.3 you do not switch plans. Over **8 to 12
weeks** mileage rises and the strength volume is traded *gradually* down toward the one-third
maintenance floor, **while skill work is preserved**: *"What's most critical, of course, is that you
maintain skill work… practicing sport skill (especially dynamic effort/speed work in compound lifts)
… Keeping percentages low, velocity high, and rest periods sufficient tremendously helpful. This can
allow you to continue to engage in very productive strength sessions deep into higher-mileage
weeks."* He adds that dropping strength all the way to maintenance is *"unnecessary because the
running will be increasing gradually, and there will be recovery left on the table."*

p121 backs it: *"Two hybrid athletes' running programs may look remarkably similar, even if one is
training for a 10K and the other for a 50K… these programs only starting to diverge as needed."*
⛔ **One base block serves the marathon, the half and the 70.3. That is a confirmation of what is
built, not a change.**

### C6. p137/p138 — the bike graft is sanctioned, and its terms are now exact.

p137: at an 18–20 mi/wk running ceiling, *"adding two hours of cycling or Arc Trainer/elliptical per
week will almost certainly aid your running."* Same page states the law: *"when in doubt, use
cross-training for easy work, not threshold or sprint work."* Proficiency first — a **4–5 week crash
course** in a new modality, **2–3 week high-intensity refresher** if familiar but undertrained.

p138 grants the exception the app relies on: *"Consider adding some work at higher intensity with
similar modalities if you're really pushing the limits of your tolerable volume and you can't
otherwise figure out how to break through to the next level."* ⛔ **This is why `SLOT_OPTIONS` puts
Ride first on the hard slots. It is his, not ours.**

---

## ⛔ §D. THE WORK ORDER — pieces 1, 2, 3 and 8. None depends on §E's open call.

### D1. Piece 1 — BOTH QUALITY SESSIONS JOIN THE FRAME

`standing-plan-week-copy.ts` · `EnduranceWeekCard.tsx` · `NonRaceBuilder.tsx`

- `REQUIRED_SLOT_KEYS` becomes all four. `REQUIRED_SLOT_DISPLAY_ORDER` gains them; its test asserts
  the two are permutations of each other, so both move together.
- The "+ Add a hard session" block and `MAX_HARD_SESSIONS` opt-in path are **deleted**, not hidden.
  `restoreOnDismiss`, the X control on hard rows, and `hardSessionCount`'s opt-in readers go with it.
- ⛔ **THE "DO NOT FIX THIS" NOTE AT `REQUIRED_SLOT_KEYS` MUST BE REWRITTEN, NOT TRIPPED OVER.** It
  currently says a future session should not add a dismiss control to the required rows *to match the
  others*. Once all four are required there are no others. Rewrite the note to say the frame owns all
  four (p246) and none is dismissible. Do not delete the warning wholesale.
- `allSlotsChosen` / `unansweredSlots` / `unansweredLine` all key off `REQUIRED_SLOT_KEYS` and follow
  automatically — **check the blocked sentence still reads correctly with four names in it.**
- ⚠️ `syncHardDays` and the `hardDays` array in `NonRaceBuilder` assume a slot can be cleared to
  `null`. With no dismiss control, `onSlotChange(key, null)` should become unreachable rather than
  left as dead code.

### D2. Piece 2 — SPEED. The hard one; read C2 first.

⛔ **Do NOT implement this as "flip the long run's default archetype."** No existing archetype is
speed work. Two candidate shapes, and the choice is an engineering call:

- **(a) An add-on on an existing session** — a short block of `run_sprint_power`'s `short_max`
  (25–50 m × 4–8) appended to the easy or long run. Matches p109 exactly. Needs a shape the library
  does not have: every session is currently whole.
- **(b) A fifth slot.** Cleanest in the model, but the frame owns four and p246 prints four.

⚠️ (a) is the book's own answer. (b) contradicts the frame. Recommend (a).

### D3. Piece 3 — VOLUME COPY. **Smaller than the earlier list said — read §A.**

- Delete `ENDURANCE_WEEK_INTRO_CONSEQUENCE[2]`, *"Easy sessions are the default pick hard session
  below to add"*. It is against p134 (*if there is room, add quality, not a recovery run*) and it
  describes a default that no longer exists after D1.
- ⛔ **DO NOT add a line saying the block will spend fewer of their hours.** An earlier draft of this
  work order said to. §A shows it is wrong for this customer, and `fixedHoursLine` already states the
  true thing — what is fixed, and that the rest is easy.
- ⚠️ `ENDURANCE_WEEK_INTRO` is pinned verbatim by a test in `wizard-focus-theme.test.ts`. The
  deletion lands there too.

### D4. Piece 8 — PLYO ORDER (new, ruled this session)

`_shared/standing-plan/plyo.ts`

p89, *"Building to Plyos"*, read off the image:

> *"for many athletes, more advanced movements like bounding and lateral hopping may be challenging.
> As such, **I typically introduce an athlete to plyometrics via a combination of foot-speed drills
> and static plyometrics.**"* … *"**With these skills mastered** (which can be taught relatively
> easily), you can proceed to more conventional dynamic plyometrics, **such as skipping, bounding,
> and hops/jumps.**"*

p88 adds: these are movements many trainees *"haven't performed since they played on organized sport
teams in their teens, if ever… plyometrics should be incorporated gradually."*

⛔ **`drillForWeek` walks each family in PAGE ORDER, which is not easiest-first.** Week 1 currently
serves `A-Skip` (bounding) and `Single-Leg Hops` (ground contact) — **both are in his after-mastery
group.** Reorder the rotation so the early weeks are footspeed and in-place work and bounding/hops
arrive later.

⚠️ **The drill NAMES and the family membership are his and do not move** — only the order within the
walk. Keep `PLYO_FAMILY_MIX_IS_OURS`; add a note that the ORDER is now his (p89) where it was ours.
⚠️ Every emitted name must still resolve in `src/lib/exercise-config.ts` (D-322).

---

## §E. THE REST OF THE LIST

**Piece 4 — kill the second endurance policy. UNBLOCKED** (the plyo question is answered, §B).
Everyone on the strength path gets the four-slot week; Get Stronger's private endurance handling
goes. ⚠️ Its own composer is currently pinned **byte-identical** by `standing-plan.test.ts` — that
pin is the thing this piece breaks, deliberately. The exposed case is the athlete who rides and never
runs: `resolveFrame` refuses them today (`enduranceSport === 'bike'` → `null`). They would take four
slots all on the bike. ⛔ Nothing from the old policy is carried across — the assistance tier band
keys on **total endurance hours**, which is the one number pp.146–148 deliberately refuse.

**Piece 5 — ASK WHICH SPORT LEADS. STILL MICHAEL'S CALL, NOT A PIECE YET.**
Today it is inferred: `create-goal-and-materialize-plan:2564` reads
`gsPosture?.run === 'maintain' ? 'run' : … 'bike'`. ⛔ **Run wins whenever it is kept at all**, so an
athlete riding five hours and running two is read as a runner and handed a runner's frame. The fork:
honouring a "bike leads" answer properly needs a cycling frame (**Cycling: Base, p278/p280, not
built**); the cheap version asks and uses the answer only for slot mix and hours split.

**Piece 6 — the downward adjustment.** `adapt-plan` declares `endurance_deload` as a type **and never
emits it** — no push site exists. Every live suggestion moves a target or a layout (lift weight,
training max, easy pace, FTP, relayout); **none takes work away**, and `isAcwrFatiguedSignal` only
sets `allowLoadIncrease = false`. p149 is the missing behaviour: cut every bucket equally when taxed,
add one or two back when ready. It also pays off the screen's existing *"give it a month before
re-dialing"* promise, for which no control exists.

**Piece 7 — SHOW THE TEN PRESCRIBED SLOTS.** The frame decides 10 of 17 lifting slots (4 ME, 6 DE)
and the athlete never sees them anywhere in the wizard. `confirm`'s subtitle already claims
*"Strength leads; your endurance holds"* with nothing behind it, and the week is fully computed by
then — the collision check on that same screen reads it. ⚠️ This is why "Build focus" reads as the
whole plan: all seven athlete picks are HYP cells, so the only screen they touch is the growth work.

---

## §F. LOGGED, NO ACTION

- **The two `pull_upper` slots carry no weight, deliberately.** `LIFT_FOR_PATTERN` maps `pull_upper`
  to `bench`, so seeding it would produce *"pull up @ 205 lb"* — the first defect the composer's smoke
  run found. 8 of the 10 prescribed slots carry a number; the two pulls do not.
- **The deleted `lifting` step's note says every block is three days; this frame is four.** Written
  for the Get Stronger path, so probably fine. Worth a glance.
- **`p215.jpg` is still not in `book-sources/`** (Part G item 7). The working number — 96% of a fresh
  prediction — cannot be re-verified in this corpus and every prescribed weight rests on it.

---

# §G. HOW VIADA DISTRIBUTES ANY NUMBER OF HOURS

**Written 2026-08-27, overnight, on Michael's instruction: *"you need to figure out how viada would
handle any number of hour combinations for people."*** Every page below was read off the images in
this session or the one before it. ⛔ Read §G1 first — it governs everything after it.

---

## ⛔⛔ G1. HE REFUSES TO GIVE A RATIO. p91, read directly, verbatim:

> *"There is considerable debate in the field regarding the exact distribution of training intensity.
> The old 'polarized training' concept, in which elite athletes were observed to conduct **80 to 88
> percent** of their training in the low-intensity region (sub zone 2, or under your
> ventilatory/aerobic threshold) and the remainder in the higher-intensity range … sounded wonderfully
> straightforward. But as with most rules of thumb, it allowed further pedantic zealotry laced with
> utter confusion to flourish."*

He then lists the ways "20 percent" is ambiguous — session count, aggregate duration, time-at-intensity
within a session, heart rate versus prescribed intensity — and answers:

> *"The correct answer, of course, is 'yes.' In other words, successful programs have used every one
> of those criteria and done just fine. … debate began to ensue between periodized programs (80/20),
> 'pyramidal' programs (70/20/10, for example), and other layouts. **My perspective is that the ideal
> program can be any of these layouts, as long as the athlete/coach knows their athlete (and the
> definitions).**"*

⛔ **THEREFORE: ANY PERCENTAGE SPLIT THIS APP USES IS OURS.** Do not code 80/20, do not code
70/20/10, and above all do not cite him for either. He names both and declines to choose.

---

## G2. WHAT HE GIVES INSTEAD IS A FLOOR, EXPRESSED IN SESSIONS — p109

- **at least one speed session** — and it need not be standalone: *"there's no need for a speed
  session to be a lengthy stand-alone"*, a handful of strides before/during/after another run does it.
- **at least one subthreshold session**
- **the remainder at VT1 or below**
- *"All minutes count."* Two or three runs a week can be **multipurpose** sessions, with extended
  warm-ups and cooldowns adding the low-intensity minutes inside the same session as the intervals.

⚠️ **A FLOOR IS NOT A RATIO.** It says what must be PRESENT, never in what proportion.

---

## ⛔ G3. AND A UNIT — AND IT IS NOT HOURS PER SPORT. p146.

p146 opens by naming the exact problem: systems exist for tracking volume *within* one modality and
*"there are few practical ways to track total load across different stimuli."* The five buckets are
his answer, tracked weekly **across all modalities**:

1. **sub-VT1 minutes** — total minutes above zone 1 and below VT1
2. **near-threshold minutes** — between VT1 and just over VT2 (zone 3 crossing into zone 4)
3. **over-threshold minutes** — notably over threshold, zone 4/5, through to vVO2max
4. **high-intensity work sets** — *"if muscular fatigue/failure causes the set to end, it's a
   high-intensity work set"*; strength work sets go in the same bucket
5. **effective hypertrophy reps per muscle group**

His two worked examples (pp.147–148) show how far apart two real athletes sit:

| | elite marathoner | strongman |
|---|---|---|
| sub-VT1 | 550 min | 100 min |
| near-threshold | 110 min | 4 min |
| over-threshold | 40 min | 5 min |
| work sets | 15 | 25 |
| hyp reps/muscle | 10–15 lower | 30–35 upper, 35–40 lower |

⛔⛔ **SO THE TWO HOUR DIALS ARE OUR SHAPE, NOT HIS.** A run+ride athlete's dose in his terms is the
**sum across sports**; which sport carries which minutes is a PLACEMENT question, not a dosing one.
That is also why p109 says all minutes count whatever the modality.

⚠️ **THE APP COMPUTES BUCKETS 4 AND 5 AND NONE OF 1–3.** `ledgerFor` / `accessory-dosing` covers the
strength side (and correctly includes strength work sets, per p147). **Nothing anywhere computes
endurance minutes by intensity.** See §G8 — this is the load-bearing consequence.

---

## ⛔ G4. QUALITY IS BOUNDED; EASY IS THE ELASTIC PART. p93, read directly:

> *"Lower-intensity sessions are the bread and butter of most training programs. … Lower-intensity
> training is also significantly easier to recover from; the demands and costs are relatively low, so
> **this training can be prescribed liberally throughout a training program. In fact, the tolerable
> dose is often so high that many athletes can engage in nearly the maximum effective dose every day
> and still recover adequately.**"*

p106 agrees from the adaptation side: *"almost any dosage of low-intensity work can help stimulate
these adaptations — and there is a fairly large ceiling on this trigger, especially on a per-week
basis, but it's pretty clear that **consistent exposure** to some amount of exercise is what matters."*

**So the easy sessions are where a week's surplus is meant to land.** The quality sessions carry
narrow bands and hard per-session limits; easy work does not.

---

## G5. THE FILL ORDER, as it falls out of his pages

Given a weekly budget, in this order:

1. **Every required session at its band minimum.** That is the floor and it is not negotiable — the
   floor is the FRAME (four sessions, p246), not a number.
2. **Surplus grows the sessions that already exist**, quality inside its own band and base inside
   its level.
3. **Then base sessions climb LEVELS** — for VT1, p235: *"the level refers almost strictly to
   duration."* Quality levels stay where p246 put them.
4. **Then extra DAYS** — the two lifting days the frame leaves clear, then the rest day last.
   ⚠️ **GROW BEFORE ADDING.** p134's junk-volume warning is aimed at *bolting on a recovery run*
   (*"rather than adding on a random hypertrophy set of arm work or a 'recovery run'"*), not at
   lengthening a session the program already contains. p246 gives the week one rest day; spending it
   costs something the frame chose, so the week should say so when it goes.
5. **Ceilings that stop the climb:** 2h of VT1 in one session (p108) · terminate at **5%** cardiac
   drift for a hybrid athlete doing numerous weekly sessions (p107) · VT1 bouts no shorter than
   10–15 min (p108) · the long session at 90–100 min for THIS program (p247).

⚠️ **WHETHER STEP 2 SHOULD FILL QUALITY *BEFORE* BASE IS OURS, AND THE CURRENT ANSWER IS DEFENSIBLE.**
The engine scales everything proportionally. Reading p134 as "max the quality first" would build a
four-hour week as 95 min of threshold against a 25-min easy run, which p93 contradicts directly.
**Proportional is the right reading. Do not "fix" this toward quality-first.**

---

## G6. BELOW THE FLOOR — DROP THE LEVEL, NEVER THE BAND

p247: *"Mileage will be dictated by experience level, with more proficient runners looking at runs up
to 90 to 100 minutes here … and **less experienced runners opting for shorter fartlek variations**."*
p246's taper column runs every endurance session at **level 1** — his own smaller version of the same
four sessions. p275 forbids stretching a session past its band, and the same logic binds the bottom.

**Absolute floor:** one-third of productive volume, at least once a week, holds an adaptation (p151).

✅ Built 2026-08-27 — `lowVolumeRunLevels` / `LOW_VOLUME_TIER_GATE_IS_OURS`.

---

## G7. THE RATE OF CHANGE BOUNDS ALL OF IT

p148: change **each** bucket by *"less than 10 percent per week, though ideally 5 percent is as high
as I will usually go."* p149: *"Too rapid increases in any category is the greatest source of program
failure that I observe in hybrid programs."* And the exception that decides whether a cut is owed at
all: *"If you aren't nearly at your level of maximum tolerable volume, you may find that you tolerate
a general hybrid program just fine and can jump right into a different type of program."*

---

## ⛔⛔ G8. WHAT THIS MEANS FOR THE APP — the one real conclusion

**The fill order is already right.** §G5 describes what the ladder does today.

**The UNIT is wrong, and it is the thing that blocks the rest.** We balance hours-per-sport; he
balances minutes-per-intensity summed across every modality. Because **nothing computes buckets 1–3**:

- Nothing can check the 10%-per-week limit on the endurance side. p149 calls breaking it the single
  biggest cause of these programs failing, and we have no way to see it.
- **PIECE 6 HAS NOTHING TO MEASURE.** "Cut every bucket by the same amount when the athlete is taxed"
  is not implementable without the buckets. The suggestion type `endurance_deload` is declared in
  `adapt-plan` and never emitted; this is why.
- A mixed athlete's real dose is invisible. Two hour dials cannot tell you whether a week is 78% easy
  or 50% easy, and those are different programs.

⛔ **SO THE NEXT PIECE OF INFRASTRUCTURE IS THE ENDURANCE LEDGER: buckets 1–3, computed off the built
week, summed across run and ride.** Every session the composer emits already knows its family and its
minutes, so this is arithmetic over data that exists — not a new question for the athlete. It is the
prerequisite for piece 6 and for any honest answer to "is this week too much."

⚠️ Do NOT surface the three numbers to the athlete as a control. He tracks them; the athlete does not
type them. The dials stay.

---

## §G9. LOGGED OVERNIGHT — the next piece, and one open question

### ⛔ NEXT PIECE: THE ENDURANCE LEDGER (buckets 1–3). Not started; Michael to schedule.

§G8's conclusion, restated here so it is not lost in a long section. Buckets 1–3 — sub-VT1,
near-threshold and over-threshold MINUTES — computed off the built week and summed across run and
ride. Every session the composer emits already carries its family and its minutes, so this is
arithmetic over data that exists; no new athlete question and no new control. It is the prerequisite
for p148's 10%-per-week check and for piece 6, whose `endurance_deload` type has no emit site
because there is nothing to measure.

### ⚠️ OPEN QUESTION FOR MICHAEL: the easy run and the long run are ten minutes apart.

`LADDER_CEILING_MIN.run_vt1` is **90** and `run_lsd` is now **100**. At a six-hour running ask the
week builds a 90-minute "easy run" and a 100-minute "long run", which read as two long runs.

Both numbers are defensible and neither is ours to move alone: **90 is his** — Michael, 2026-08-26,
*"easy run 25-30 → 45-60 → 80-90 min (cap 90)"*, and p235's VT1 level 3 is 80–90 — and **100 is the
book's**, p247, adopted the same evening. Nothing is broken; the two simply met after the long run
came down from 150. Flagged rather than changed.

### ✅ ANSWERED: the free-day fill that "never fired".

It was a measurement bug, now fixed. `easyFillHours` read the top of the whole base ladder (an easy
run at 1h30) while the placement builds the fill at level 1 (30 minutes), so the gap-to-sessions
arithmetic divided by a figure three times too large and bought nothing. A six-hour all-run ask built
5h35 and called the week full; it now builds 6h03 across the two clear lifting days and the rest day,
in that order. ⚠️ One consequence is flagged in that commit: a one-hour ask with a single hard run on
the LOW-VOLUME tier now adds one easy run (1h08 against 1h) where Michael's stated worst case was
"the cap on the hard session". His case on the standard column is unchanged.

---

## ⛔⛔ §G10. PIECE 5 IS DEAD — the run-forward / ride-forward toggle. Do not propose it again.

**Ruled 2026-08-27.** Michael, in conversation: *"no toggle... they tell you, 5 hours of bike 2
quality, you know where those three go."* The engineering trace below is why he is right, recorded
so this does not come back in a month wearing a different name.

The toggle was specified to do two things. **Both are already the athlete's own answer**, and each
became so in a change made this week:

1. **"Which sport gets the hard sessions."** Since all four slots joined the frame, every row on the
   endurance screen carries its own Run/Ride chip and starts unanswered. A mixed athlete answers all
   four. `endurance_slots` forwards those answers verbatim
   (`create-goal-and-materialize-plan:2989` → `generate-strength-plan:411` → `SportMix.slots`), and
   `assignSports` places them. There is nothing left for a lead to decide.
2. **"How the typed hours split."** There is no single pool to split. The screen collects two
   independent dials — weekly running and weekly riding — and `sizeFor` solves each sport's slots
   against its own number.

**And the inference it was meant to replace no longer decides anything.** `gsSport`
(`create-goal-and-materialize-plan:2564`) reads run-first, so a five-hour rider who also runs two is
read as a runner. That value now feeds exactly two things: `resolveFrame`, which since piece 4
returns `strength_5k` for run and bike alike, and the `endurance_sport` column stored on the plan
row. Its readers were checked — `analyze-strength-workout` recomputes its own from logged workouts
and does not read the plan's. So the inferred lead changes nothing in the built week.

⚠️ **THE ONE REAL THING INSIDE IT, AND IT IS OPTICS.** `SLOT_OPTIONS` draws Ride first on both hard
slots for everyone, cited to p280. A rider-forward athlete might want Run first. Rows start neutral
by Michael's own ruling, so that is CHIP ORDER, not a default answer — a copy call, his, and not a
control.

---

# §H. THE CUE PAGES — pp.82, 83, 117, 125, read 2026-08-27

**Read on Michael's instruction, for week/session notes and cues.** He asked whether the book gives
an *"if you feel this, do this"*. It does, and these four pages carry most of it. All read off the
images this session.

## ⛔ H1. p117 — THE FRAME FOR A SESSION NOTE

> *"The objective of any training session is to trigger the appropriate training stimulus in the
> context of your greater objectives and the program structure as a whole. **This means that not
> every session has to do all things** — even a single-sport objective (run a fast 5K) has multiple
> components … all of which may require different sessions to target."*

> *"…you can build a training week that lets you hit *some* component of your sport every day
> **without hammering yourself into the ground by doing the same thing over and over again**."*

And on rest periods: *"Longer rest periods tend to mean higher work interval quality… shorter rest
periods … tax the cardiorespiratory system and can cause greater muscle fatigue. They serve different
purposes… **there is no single 'optimal' ratio or intensity for any purpose, just ones that work in
context.**"*

⛔ **THIS IS THE SHAPE OF A SESSION NOTE: name the ONE job this session has.** It is also a standing
refusal of any copy that implies a session should feel maximal.

## ⛔⛔ H2. p82–83 — WHERE A SET ENDS, AND WHY SORENESS IS NOT THE POINT

p82, the two caveats on training to failure:

> *"**We're talking about muscular failure, not task failure.** Task failure may simply represent the
> inability to complete future reps without form breakdown — think excessive back rounding in a
> squat, ending the set before your quads fail, or what I call **single muscle failure (SMF)**, where
> a single muscle group fails before the others involved in the movement… **SMF and task failure are
> more likely to occur in compound movements**."*

p83:

> *"**Failure is often highly stressful to the body/target muscles.** A single set to failure … may
> degrade your ability to perform future productive work in a session… There's also quite a recovery
> cost. Failure may cause some trauma to the muscles, and **muscular damage, contrary to early belief,
> is neither necessary for nor conducive to muscular growth. In fact, it can cause recovery to take
> longer and diminish your capacity to train hard in the near term.**"*

⛔ **THAT IS THE ANSWER TO MICHAEL'S SORENESS QUESTION, stated directly.** Damage is a cost, never a
signal, and its price is paid in the NEXT sessions — which for this athlete are runs and rides.

**Effective reps, and the range it implies:**
- *"the last 5 (or so) repetitions before failure are effective for muscle growth"*
- *"any repetition range **under 5** is typically **poor for hypertrophy**"*
- *"any repetition range **over 12** or so just seems silly. When you'd have to do 10 reps just to get
  to the first effective one, other forms of fatigue begin to affect the movement."*
- ⚠️ So the growth window is **5–12**, and B2's *"8–10 preferred"* sits inside it. Consistent.

⛔ **AND A NAMED PRESCRIPTION FOR HYBRID ATHLETES THAT WE DO NOT IMPLEMENT:**
> *"Within this general framework, **hybrid athletes may benefit significantly from cluster sets, myo
> reps, and other rest-pause variants of training.** … These techniques typically involve performing
> an initial fatiguing set close to failure and then rapidly performing a number of additional
> repetitions at either lower weight with equal repetitions or equal weight with lower repetitions,
> **all leaving several reps in reserve to rapidly accrue more effective reps in minimal time**."*

He says these are *"explained and incorporated into the programs in Part 2."* ⚠️ Not in `strength_5k`
(p246) as transcribed. **Logged as a finding, not a build.**

## ⛔ H3. p125 — THE ENDURANCE ATHLETE'S PAIN TOLERANCE WORKS AGAINST THEM UNDER A BAR

> *"A higher pain tolerance may be an excellent adaptation for endurance athletes because the ability
> to manage increasingly uncomfortable sensations during various endurance-dependent events may be
> directly related to their overall performance in their sport. **For strength athletes, however, it
> may be less clear; a higher tolerance may be of negligible benefit or even counterproductive to
> longer-term health.**"*

⛔ **THIS IS THE CUSTOMER EXACTLY** — a runner/rider who has spent years training themselves to push
through discomfort, now handed a barbell where that trained instinct is the wrong one. It is the
strongest argument on the page for stating reps-in-reserve as a rule rather than a suggestion, and
for H2's *stop at form breakdown, not at muscular failure*.

⚠️ **AND A CAUTION ON OUR OWN NUMBERS, same page:** *"many of the performance norms and
characteristics discussed in this book, including **rep max calculators, threshold estimates**, and so
forth, **may need to be taken with a few more grains of salt than usual**"* for hybrid athletes.
Our working number is a rep-max calculation and our easy/threshold paces are estimates. He is not
saying they are wrong; he is saying the error bars are wider for this athlete than for a specialist.

## H4. WHAT A WEEK/SESSION NOTE CAN NOW SAY, ALL PAGE-BACKED

| cue | page |
|---|---|
| This session has ONE job; it does not have to do everything | p117 |
| End the set when form goes, not when the muscle quits — and in a compound lift form goes first | p82 |
| Soreness is a cost, not a sign. Damage is neither necessary nor conducive, and it is paid for in the next days' sessions | p83 |
| Reps under 5 do little for growth; over 12 is wasted | p83 |
| Your tolerance for discomfort is a running adaptation, and it is the wrong instinct under a bar | p125 |
| Stop plyos when the movement stops being crisp | p227 (shipped) |
| Terminate a session at 5% cardiac drift when training this often | p107 |
| Feeling taxed: cut every part equally. Feeling ready: add one or two back | p149 |
| The legs feel the run for the first weeks; it is priced in and lifts by about week ten | p247 (shipped) |
| Six to eight hours between two sessions in a day; four to six if the morning one is short and easy | p108 |
| Six to eight work sets leaves tomorrow's run intact; fourteen or more costs up to three days | p86 |

⚠️ **VOICE:** every one of these is a conditional consequence or a fact, which is what `COPY-VOICE.md`
asks for. **None is an imperative and none should be written as one.**
