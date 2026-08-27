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
