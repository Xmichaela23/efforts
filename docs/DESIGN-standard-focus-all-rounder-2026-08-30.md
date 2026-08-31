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

⚠️ **SUPERSEDED BY §12 (2026-08-31).** This was the estimate BEFORE the build. It is kept because
its blast-radius call was right — the run-family readers were the real work. Read §12 for state.

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

---

## 12. WHAT SHIPPED — the build arc, 2026-08-30 → 2026-08-31

⚠️ **THE ARC IS 44 COMMITS, `fcad98a3..35a1eafb`, AND IT IS WRITTEN DOWN IN THREE PLACES.** Read
them in this order or you will think half of it never happened:

| Commits | When | Where it is documented |
|---|---|---|
| `fcad98a3..dd3bbb27` | 08-30 14:37 → 20:16 | **`docs/HANDOFF-standard-focus-2026-08-30.md`** — the frame itself, Train-screen selection, the wizard, the endurance-week screen, the ride-counted-as-run defect, the blank-screen bug, the floor |
| `cb92b7ac..1d56dc15` | 08-30 20:59 → 22:04 | **§12z below** — was written down NOWHERE until 08-31; the gap between the handoff and this section |
| `ca8d46fa..35a1eafb` | 08-30 22:44 → 08-31 14:25 | **§12a–§12h below** |

### 12z. THE GAP — four commits that had no home

- **The endurance week screen draws the WHOLE week for Standard Focus**, and the tier question asks
  what it actually moves (`cb92b7ac`).
- The long-ride question stopped rendering nothing under its own heading (`0bff638a`).
- ⛔ **Standard Focus asks a LENGTH PER SESSION, not weekly hours** (`20d76531`). This is the source
  of §12c's *"a frame with no weekly-hours ask never buys a session that has one"* — the two frames
  ask different questions, and code that assumes the weekly-hours ask will silently misbuild.
- The wizard skips the sport-scope screen for Standard Focus and holds BOTH sports (`1d56dc15`).

---

**The section below covers the last 30, `ca8d46fa..35a1eafb`.** Standard Focus is built, pushed and deployed. Michael has
generated real plans from it and read the exports; most of the arc below is defects HE found doing
that, not defects found in fixtures.

### 12a. The frame is real, and D-457 is the law that keeps it real

`frame-resolver.ts` no longer returns `strength_5k` unconditionally. Every call site that reads a
frame's constants now takes the frame explicitly.

⛔ **THE RECURRING DEFECT, and it recurred roughly EIGHT times in this arc: one frame's constants
indexed by the other frame's rows.** `PICK_KEYS_BY_FRAME` splits p246's nine pick keys
(`VIADA_PICK_KEYS`) from p274's nine (`ALL_ROUNDER_PICK_KEYS`); every new reader must go through it.
Symptom when it happens: the page offers the wrong cell's movements, or a stored pick silently
evaporates. It does NOT error. Test: `pick-wire-frame.test.ts`.

### 12b. The accessory pickers — p274's own cells

- Standard Focus has its own pickers over p274's actual cells, not p246's.
- **The muscle the page names is the law at every kit level** — the fence between "his movements" and
  "our substitutes" came down; his rank first everywhere, ours are marked `substituted`.
- p223's hip-thrust exception is admitted into the hamstring cell (`alsoAdmits`).
- Bodyweight is dropped from a volume cell **only for an athlete who owns something to load with**
  (`requiresLoad` + `ownsLoadingImplement`, decided per pick, never globally).
- Free-weight implement variants collapse; machine and Smith never do.
- Kit nobody owns is not offered. Duplicates under another name are not offered.
- Two rows sharing a day no longer default to the same movement (`takenByDay`).
- Display renaming is kit-aware and **display-only** — `bandRouteName` → `executionName` →
  `movementLabel`. ⛔ The canonical `name` never moves, because logged-vs-planned matching keys on it.

**The ordering rule is now sourced, not judged:** `docs/REFERENCE-exercise-substitution.md` (new).
§5 of that file is what `rank()` implements — the source's own printed movements first, then
like-for-like by how many of §1e's tests hold for THIS athlete's kit. Modality is explicitly NOT a
ranking axis; the free-weight-vs-machine meta-analysis rules that out.

### 12c. The endurance side

- Every session carries the source's own name for it and its band (`ENDURANCE_CLASS` → `intensity:`
  and `band:` tags).
- Five blended archetypes un-mashed; one archetype had been standing for two different prescriptions
  and the token took the top of both.
- The MLSS descending ladder builds the source's own rungs per level (`ladderByLevel`).
- Rep counts are the source's own per level (`repsByLevel`), and progressive laydown is real.
- ⛔ **A time-prescribed step now reaches the athlete as TIME** (`distanceDerived`). It was exporting
  as distance — the export contradicted the prescription.
- A frame with no weekly-hours ask never buys a session that has one.

### 12d. The test week is a test

- Warm-up ramp before the test lifts, sourced from the book.
- The plan's test week is recognised BY THE LOGGER as a test (`1rm_test` tag, `readTestWeek`).
- It saves to baselines with consent (`save-baseline-test` → `performance_numbers`).
- ⛔ **The logger seeds from the SCORED set, not the opening build.** The first cut of the tag opened
  Michael's bench test at 115 instead of 130. He caught it before lifting. `test-week-logger.test.ts`.

### 12e. Dosing and placement

`fillMuscleFloor` now places by rule: never lower-body the day before a heavy lower day, then region
match, then lightest. ⚠️ The first attempt did nothing because the function rebuilt sessions as
`{label, sets}` and dropped the fields it was meant to read. `floor-placement.test.ts`.

Glute work no longer lands before the max test. ⛔ **This finding was withdrawn once as harness error
and was REAL** — the re-check landed on a week where it does not fire. Michael's export was right.

### 12f. The endurance week card

- **A row with one sport is a fact, not a question.** Day 2 (hard ride) and day 4 (easy ride) render
  as inert labels — no chevron, no button — and are still coloured, because the colour is the sport.
- Every hard session on both sports offers workout-style choices. Gated to Standard Focus while the
  5K freeze held; ungated when it lifted.
- An unpicked hard row reads **"Engine's pick"** in muted type; the sport colour arrives on the
  session name only when the athlete chooses. Colour means *you chose this*.
- The chips read as chips, and picking one closes the row.
- Every session says which page it came from (per-session citations).

### 12g. Progression — the thing that was already built

⛔ **A claim of "11 flat weeks, no progression" was made in this arc and was WRONG.** `me-history.ts`
earns ME sets and bar increments from LOGGED HISTORY. Composed fixtures have no history, so they look
flat and are not. An adapt-plan change started on that false premise was reverted.

The rule Michael stated, and it is what the code does: when the earned increment is smaller than the
plates the athlete owns, the extra goes into REPS; where real weight can be added, weight is added.

### 12h. Verification method

Robot test accounts (authorised 2026-08-30) — service-role admin API, seeded baselines, real plan
generation through `create-goal-and-materialize-plan`. Michael is never the QA loop. Fixtures are
necessary, not sufficient; a rendered-page pass and a live chain pass are different evidence classes
and this arc kept them labelled.

**Suites at close:** 2465/2465 `_shared`; 894 client with 6 pre-existing failures; tsc 315; eslint at
baseline.

**Deployed 2026-08-31 21:30**, versions read back from `supabase functions list`:
`coach` **500** · `generate-strength-plan` **199** · `materialize-plan` **333** ·
`rematerialize-standing-block` **74**.
⚠️ Three of those bundle `_shared/standing-plan/accessory-picks.ts` and carry no edits of their own.
Touch that file, deploy the closure — `coach`, `generate-strength-plan`,
`rematerialize-standing-block`. (`create-goal-and-materialize-plan` does NOT bundle it.)

---

## 13. OPEN — needs Michael's ruling, not more code

Superseding §11. These are decisions, not bugs; nothing below blocks him training.

1. **The backup-row rule.** Backups only fire into an EMPTY row. So the leg-curl route does not fix
   his hinge day — his hip thrust occupies the row, and the backup never gets a chance. Either
   backups may displace a pick, or the row admits two, or this stays as-is and the hinge day is his
   to manage. ⛔ Undecided; this is the one with the most reach.
2. **Knee extension has no non-machine movement in the catalogue.** Either add a banded one, or add
   an isolation flag so the cell can rank compounds in. `REFERENCE-exercise-substitution.md` §2b is
   explicit that the field publishes no ranking here — this is ours to decide.
3. **"Rear delt machine" reads badly in a built plan row.** Fixing it needs a display field.
   ⛔ Renaming `name` breaks logged-vs-planned matching (§12b).
4. **The long day (day 6, LSD) — freeform between run and ride.** Currently one choice locked for the
   whole block. pp.135–138 license this specifically: *cross-train the easy volume, never the quality
   work*, and p235's LSD list already admits a mixed-terrain hike. Two options: alternate by week
   (the engine already rotates shapes week to week, and the week stays countable), or leave it open
   and decide on the day (honest, but weekly totals and load maths go soft). **Recommendation:
   alternate.**
5. **Day 4's easy ride cannot become an easy run**, and that is an APP gap, not the book's rule. The
   engine converts run→ride only; there is no reverse mapping. Same pp.135–138 license as item 4.
   ⚠️ Day 2 is different and should stay fixed — it is the anaerobic quality session, and it is on
   the bike deliberately so hard work does not tax the legs before the leg days.
6. **THE WEEK SWAP — Michael's stated next want, and it is bigger than items 4 and 5.**
   ⛔ **DO NOT START BUILDING THIS. It is a larger conversation and he has not had it yet**
   (his words, 2026-08-31, away from his computer).

   What he described, recorded verbatim in intent so the next session does not shrink it:

   - **Like-for-like swaps that COMPENSATE, not just substitute.** If he would rather ride Monday's
     hard session than run it, he rides it — **and the engine swaps whatever sat on Wednesday** so
     the week still balances. The swap is a trade across the week, not an edit to one day.
   - **The athlete gives their long-run time**, and the long session is built to it.
   - **Swap weeks**, and swap sessions whenever they are so inclined.

   ⚠️ **This is why items 4 and 5 should NOT be built in isolation.** Both are single-day swaps, and
   both are special cases of this. Band-aiding either one first builds the wrong seam and this
   file's §12a trap (D-457) is exactly where a naive swap will fail — the FRAME owns which day is
   which sport, so a swap is a frame-level operation, not a row-level one.

   Open questions the conversation has to answer, listed so it starts from something:
   - What has to be conserved by a compensating swap — hard-session count, weekly hours, the
     run/ride split, the leg-day spacing, or all four?
   - Does the swap persist for the block, or is it per-week?
   - Does a swapped week re-materialise, and what happens to sessions already logged?
   - Does the athlete's long-run time override the frame's own duration, or clamp it?

⚠️ Also still open from §11 and unchanged: where a holding/deload frame sits (the taper column is the
mechanism), and whether Run Focus and Bike Focus expose both leanings at launch.

---

## 14. WHAT MICHAEL IS WATCHING FOR — he starts running the programme 2026-08-31

He is the athlete, not the QA loop. This section exists so that when he says *"this looks wrong"*,
the next session knows instantly whether it is a known gap or a new defect. **Everything in §14a is
believed fixed and has NOT been seen by a human on a device. Everything in §14b is a KNOWN gap — if
he reports one of these, it is not a regression, it is item N of §13.**

### 14a. Fixed in this arc, first real look is his

| What he would see | Where it broke | Fixed by |
|---|---|---|
| A test lift opens at the wrong weight | opened bench at 115, not 130 | `ab5854ec` — seeds from the scored set |
| No warm-up ramp before a test lift | ramp absent entirely | `94dc2722` |
| Test week does not offer to save baselines | not recognised as a test | `94dc2722` |
| An interval prescribed in minutes shows as a distance | export sent distance | `ce39c5b3` |
| The descending ladder's rungs are wrong | invented rungs | `f617752d` |
| Two rows on one day default to the same movement | no per-day distinctness | `35a1eafb` |
| A bodyweight movement offered in a volume cell he can load | no `ownsLoadingImplement` gate | `32316ed9` |
| Glute work the day before the max test | placement ignored the test day | `e32dca14` |
| Day 2 / day 4 look tappable but do nothing | rendered as questions | `c02216b7` |
| A hard row does not offer workout styles | picker deleted 08-27 | `7455d3ba` |
| Picking a workout does not close the row | no `onPicked` | `9c700847` |
| Week 2+ looks identical to week 1 | ⚠️ NOT A DEFECT — see §12g | — |

⚠️ **The last row is the one most likely to be misread as a bug.** Progression is earned from LOGGED
history (`me-history.ts`). Until he has logged sets, the weeks legitimately look flat. Do not "fix"
this. When the earned increment is smaller than the plates he owns, it lands in REPS, not weight.

### 14b. KNOWN GAPS — if he reports these, they are already on §13, do not treat as new

1. **His hinge day still has no hamstring curl** if he has picked a hip thrust into that row.
   Backups only fire into an EMPTY row, so the curl route never gets a chance. §13 item 1. ⛔ This
   is the one he is most likely to hit, because it is his own stored pick that causes it.
2. **"Rear delt machine"** reads badly in a plan row. §13 item 3.
3. **Knee extension offers machines only** at a home kit. §13 item 2.
4. **Day 4's easy ride cannot be run instead.** §13 item 5.
5. **The long day is one choice for the whole block**, not alternating. §13 item 4.

### 14c. What would make a report actionable

The export or the screenshot, and **which week** — a defect found on his week 3 and re-checked on a
fresh week 1 is how a real finding got withdrawn as harness error in this arc (§12e). His artefact is
the evidence.
