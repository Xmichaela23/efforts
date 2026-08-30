# DESIGN — Standard Focus, built on the All Rounder

**Written 2026-08-30 from a working conversation with Michael. Everything here is either sourced to a
page or marked OURS. Nothing is built yet except where noted.**

---

## 1. THE SHAPE

Three things the athlete sees:

- **Standard Focus** — the All Rounder (p274-275). The year-round program. Integrates strength with
  your endurance sports and looks for progress in both. This is where an athlete sits.
- **Run Focus** — houses the run programs, with a leaning: strength-leading (Strength + 5K, p246) or
  endurance-leading (Strength + Half-Marathon, p250).
- **Bike Focus** — the same for cycling: Cycling Base (p278) strength-leading, Fondo/Crit
  (p279/p281) endurance-leading.

You sit in Standard Focus and leave temporarily when pointing at an event. That is his own structure:
*"For a specific race, switch to a pivot program about a month out"* (p275), and programs name their
own successors — there is a graph of transitions in the book, not a list.

⚠️ This is the four-frame dial from `DECISIONS-2026-08-22-standing-plan-pivot.md` §1, with the All
Rounder restored on top. One frame of the four is built today.

**Naming:** "Focus" is the branded term. Standard Focus is the default because it focuses on
everything. The current plan's athlete-facing name becomes **5K + Strength** and sits INSIDE Run
Focus rather than beside it — its internal frame id is already `strength_5k`, so the name finally
matches the thing. The display name is one string in `src/lib/non-race-goal-seeds.ts:55`; the id
`get_stronger` does not move.

---

## 2. WHY THE ALL ROUNDER, AND WHY THE 2026-08-22 REJECTION NO LONGER HOLDS

**It is the run+ride program that already exists.** Its week mixes both sports natively — MLSS+ run,
Cyc AnA, NT run, Cyc endurance, LSD — so there is nothing to translate. Five endurance sessions
against Strength + 5K's four; it is NOT the lower-volume option.

**The current frame's cycling is entirely invented.** `RIDE_EQUIVALENT` converts run families to ride
families. p275 permits the modality swap and gives no session-by-session mapping, so that table is
ours. On 2026-08-30 it was measured collapsing BOTH run quality slots onto one ride family, costing
every bike-leaning athlete their speed session for a whole block. Adopting the All Rounder deletes
that table rather than porting it.

**The 2026-08-22 rejection** was: no primary lifts anywhere, so every weight rides the ratio table
outside its stated range. That was a mechanical consequence of taking his no-primaries choice
literally. Michael has ruled that compounds go in, and p275 permits it outright — *"primary lifts CAN
be substituted in, you're encouraged to keep your options open."* A primary in the ME slot that opens
each day gives every day a tested lift to derive from, and the objection dissolves.

⛔ **NOT a replacement.** Two frames on a dial. Strength + 5K stays, **frozen as a design** — stop
shaping new work around its quirks — but **still guarded by its tests**, because both frames share the
composer, the materializer and the progression. The empty-strength-block defect of 2026-08-29 came
from exactly that kind of unguarded seam.

---

## 3. HOW TO READ VIADA — THE RULE THAT UNLOCKED THIS

**He writes for a lifter moving INTO endurance. Our athlete is an endurance athlete moving INTO
lifting.** So separate advice aimed at his READER from advice about the BODY. Reader-specific advice
inverts; physiological advice does not.

Worked example, p275: he programs secondary lifts and no primaries for two reasons — (1) variety of
implements and planes keeps progress coming, (2) it *"breaks the attachment to the big three."*
Reason 2 is about his reader. Ours has no such attachment. Reason 1 survives, so: compounds where
they earn it, not every slot on a barbell.

---

## 4. BRACED WORK STAYS

**Braced is a mechanical property, not a machine** — the torso is supported externally so load goes
through the working limb without stabilisers being the limit. His lists (p221-222) name machines
because he is writing in 2024, not because the pattern requires one.

The pre-machine forms exist and in several cases are the original: the hack squat is Hackenschmidt's
barbell lift from around 1900; chest-supported rows are dumbbells on an incline bench; dips need
parallel bars; back extensions were done over a box long before the Roman chair. The reverse hyper is
genuinely modern (Louie Simmons, 1970s) and has a flat-bench form.

✅ **MEASURED 2026-08-30: the movement catalogue already resolves all 18 All Rounder slots, zero
gaps.** Braced push 3 options, braced hinge 8, braced pull 10, and `SlotRequest.asymmetrical` already
exists and resolves all three asymmetrical slots. Nothing to add. The equipment-substitution layer
handles the home-gym case as it does today.

⚠️ An earlier claim in this conversation that four lower braced slots were "stranded" with no
free-weight equivalent was **wrong** and is retracted.

---

## 5. SUPERSETS — HIS RULE, OUR CLOCK

He gives a rule and a named violation, not a recipe.

> Skills using similar muscle groups but **dramatically different specific patterns and loads** can be
> supersetted so both benefit. Named violation: high-bar back squat with front squat — *"two similar
> skill movements with similar intensities, so they'll work at cross-purposes."* (Part C, rule 2b)

That rule explains his own pairings: push with pull on the arms days is maximally different; braced
hinge with braced lower push is the same region, opposite patterns.

**All four superset slots are HYP, and that is not incidental.** p78 says fatigue is the enemy for
strength; p84 says for hypertrophy accumulating fatigue *"may well be a crucial part of the training
session itself."* The two pages disagree on purpose. So supersets belong on the HYP slots and nowhere
else in this program.

**Rest is a rule, not a number** (p78): rest until you know you can complete the next set without
getting crushed, but not so long that you cool down. He gives no minutes anywhere. **Any clock a
screen shows is OURS and must say so.**

**Build order (OURS):** start with the superset as a DISPLAY fact — two rows marked as a pair. Only
make it structural if rest, dosing or the ledger genuinely need it. Nothing in the app pairs
exercises today; this is the only new strength concept the frame requires.

---

## 6. THE HYPERTROPHY DIAL — HIS RANGE, OUR LABELS

His dose (B2): **8-12 sets per muscle per week is solid; 18-20 borders overreaching.** In effective
reps, 32-48 recommended, 70-80 maximum. So the low end and the high end are both his; moving between
them is the dial.

Two positions under Standard Focus:

| Label (OURS) | Dose (HIS) | For |
|---|---|---|
| **Support** | 8-12 sets/muscle/week | enough muscle to serve the riding and running |
| **Build** | toward 18-20 | actively adding size |

⛔ **THE DIAL IS UPPER-BODY ONLY FOR ANYONE WITH ENDURANCE HOURS.** p85 names our customer directly:
*"If you're cycling as well as training for muscle gain, you may find that training your legs…
interferes with productive bike work. Consequently, the hypertrophy work must be far more
conservative."* Legs stay conservative regardless of the setting, and the screen must say so — a
Build athlete who is riding four hours a week must not be left wondering why their legs did not
change.

⚠️ **Labels avoid promising an outcome.** "Toned" implies a look you cannot program for; "bigger" is a
claim. Michael's own third case — *"I'm at the size I like, I want to get stronger and look more
chiselled"* — is NOT a dial position: the strength half is the program's default ME/DE work, and the
leanness half is a kitchen outcome the app must not pretend to deliver.

⚠️ **Isolation and machine work carries hypertrophy; compounds are reserved for strength work** (B2).
This is why the primaries belong in the ME slot opening each day and not spread through the HYP
slots.

**The extreme case has its own frame** — Hypertrophy + 5K (p244), which he calls the book's own
recommended first program. Someone whose goal is mostly size goes there rather than pushing the All
Rounder past its range.

---

## 7. THREE LIFTING DAYS — SANCTIONED, WITH A STATED COST

Not everyone wants four gym days.

**Rule 8:** a neat seven-day microcycle is an artificial constraint; good hybrid programs may need two
to three weeks to hit every workout type. If a nonnegotiable would suffer, *"strongly consider a
two-week microcycle"* — maintenance dose one week, front of the queue the next.

**p80 frequencies:** every strength movement ideally trained at least twice a week, or once every
three to four days, with at least one heavy. Floor: **at least one session every eight to nine days**
to get any consistent improvement in a movement.

So four pattern days rotating across two weeks lands each pattern roughly every four to five days —
above his floor, below his ideal. That is the honest trade and it is one he sanctions rather than one
we invent. State the cost; do not hide it.

⚠️ The "nine days" is his minimum-effective-dose figure, not a cycle length.

---

## 8. THE ENDURANCE CEILING — HIS, AND TIGHTER THAN WHAT WE SHIP

p275 conditioning notes: hard work hard, easy work easy, and **resist the urge to add difficulty or
length to the endurance work. Adjusting intensity and estimated threshold figures is always better
than extending distance or increasing level for this program.**

So the quality sessions are pinned at their assigned levels — MLSS+ 2, Cyc AnA 1, NT 2, Cyc endurance
1, LSD 2 — and progression comes from the threshold moving underneath them, not from adding. p275
again: *"few changes are needed as the months progress beyond adjustment of 1RM and threshold as you
improve."* That is the living-baselines architecture stated by the author.

**Extra hours are EASY hours.** The weekend long session can be a hike, a long ride, a team sport;
*"plenty of additional easy work can be added if needed."* Plus p109's weekly floor: one speed
session, one subthreshold session, remainder at VT1 or below, and all minutes count whatever the
modality.

⚠️ **This is tighter than what the app does today**, where asking for more hours can add quality.
Under this frame, more hours means more easy work.

---

## 9. SCOPE OF THE BUILD — measured 2026-08-30

| Piece | Size | Notes |
|---|---|---|
| Movement catalogue | **none** | 18/18 slots resolve today |
| Asymmetrical slots | **none** | `SlotRequest.asymmetrical` already exists |
| `FrameId` + `frame-resolver` | mechanical | single-value union; `frame-resolver.ts:75` returns `strength_5k` unconditionally — that is the dial |
| Frame definition | contained | the p274 week is fully transcribed, both columns |
| Supersets | one new concept | display-first (§5) |
| **Endurance slot detection** | **the real work** | see below |
| `RATE_ANCHOR` for this frame | OURS | p275 gives no rate; reusing p247's number would itself be an unlabelled inference |

⛔ **THE PART WITH BLAST RADIUS.** The All Rounder prescribes cycling NATIVELY. Every existing frame
slot is a `run_*` family that gets converted afterwards, and three readers key on run families only:
`HARDNESS`, `isLongSlot` (`family === 'run_lsd'`), and `anchorRoleOf`. So his cycling sessions would
arrive invisible — not counted as hard, not counted as long, no anchor placement, no interference
handling against the leg days, nothing for the experience chips to size. **This is the same class as
the `HARD_FAMILIES` defect fixed on 2026-08-30, where the hardest session in a rider's week did not
count as hard, and it fails silently rather than erroring.**

Day map, working-number, progression, materializer and the session library read the frame through
`FRAMES[args.frame]` and are genuinely agnostic. ⚠️ Several COMMENTS reason about `strength_5k`'s
specific cells — those need re-reading per frame rather than trusting.

---

## 10. WHAT IS OURS IN ALL OF THIS

Label these in code wherever they land, the way `sport-slots.ts` already labels its mapping table:

- the dial's structure and the "Focus" naming
- **Support** / **Build** as labels for his 8-12 and 18-20 bands
- the superset clock (he gives a readiness rule, no minutes)
- the three-day two-week rotation's specific arrangement
- the progression rate for this frame
- treating the superset as display-only to start

---

## 11. OPEN

- Michael intends to train on this program. He can follow p274 from the page while the app catches up
  — the app must not be the blocker on his training.
- Where a "holding"/deload frame sits (his taper column is the mechanism, per the 2026-08-22 dial).
- Whether Run Focus and Bike Focus expose both leanings at launch or only the built one.
