# The logger arc, and the corpus correction under it — 2026-08-27 → 28

**Commits `6b100cc7` → `7f8ba187`. Pushed. Edge functions deployed 2026-08-28 12:41:58 UTC:
`materialize-plan` **307**, `generate-strength-plan` **174**, `rematerialize-standing-block` **50**.
Client on Netlify. Michael has device-verified the whole arc, last confirmation: *"cards are all
good."***

⚠️ **THIS IS ONE DOCUMENT INSTEAD OF FOURTEEN `D-NNN` ENTRIES, DELIBERATELY.** Michael is running low
doc overhead for UI iteration. The rulings below are the ones with teeth; everything else is in the
code comments where the code is, which is where it survives.

---

## ⛔ THE ONE THAT MATTERS: WE SHIPPED A CONSTANT ASSERTING THE BOOK SAID NOTHING, ABOUT PAGES NOBODY HAD READ

`strength-grid/intents.ts` shipped `REST_BETWEEN_SETS_NOT_STATED` — *"The source gives no rest
interval for these sets"* — and gap #10 of the twelve said the same. **p78 has a section titled "Rest
Periods."** It was in the unread half of the pp.69–131 re-shoot.

His rule, now in the app: rest to nearly full recovery but not so long you cool down; take the next
set when you know you can finish it without getting crushed; a strength session should carry very
little accumulating fatigue. **p84 says the opposite for hypertrophy** — the drop-off in capacity is
part of the stimulus there — and the two are now separate constants so one cannot land on the other's
rows. ⛔ **He gives no minutes anywhere**, so every duration we show stays labelled ours.

⛔ **THE LESSON, WHICH IS BIGGER THAN THE BUG: an unread frame is not a gap in the book.** Before any
constant asserts *"the source does not say"*, the pages it would be on must have been read. Recorded
in Part G item 6 of `SOURCE-viada-hybrid-athlete.md`.

**Also out of pp.71–90** (§B4d of that file): p80 quantifies the strength dose and is the source for
the ME/DE weekly rotation we had only ever cited p247 for; p72 names Westside as where the ME/DE
vocabulary comes from; p89 carries a plyometric progression ladder we do not implement; p85 describes
this app's customer by name. One miscitation fixed: the 4-to-6 heavy-rep figure was cited to p84 in
`progression.ts`; **it is p80**.

---

## What shipped

1. **The logger's number cells are hittable** — 21px → 44px. ⚠️ Not cosmetic: the bar ladder raises
   weight off *logged reps*, so a rep cell that is hard to hit correctly is bad input to a
   progression that cannot tell the difference. A hit-area trick was not available — rows sat ~22px
   apart, so 44px of slop past the visible bounds would have stolen the neighbouring set's taps. The
   rest pill also stopped swallowing taps: it is `sticky` over the list with no tap action of its own.
2. **The Previous column stopped truncating** — by dropping the reserve tail, not widening. Tapping
   it never copied the reserve, so the clipped part was the one part that did nothing.
3. **The bodyweight gate went to the shared type table.** An ab wheel rollout was drawn a weight box,
   plates and a 45 lb bar. **55 movements gained a correct answer**; 3 spellings went the other way
   (cable wood**chop**per matched the `hop` stem meant for plyometrics); `weighted sit up` was filed
   as bodyweight in *two* tables and is corrected in both.
4. **Rest is keyed to slot intent** on standing-plan rows — heavy 180s, speed 120s, muscle-building
   90s, with p78's rule beside the countdown. A max-effort pull-up used to rest 90s while a
   max-effort bench rested 180s. ⚠️ **Standing-plan rows only**; 5/3/1 and freestyle keep today's
   numbers, and that 150/120/90/75/60 ladder is now **labelled ours** — an audit found only the 180s
   case and the main-vs-accessory split ever had a stated basis.
5. **Day names read Heavy / Speed on every surface**, through one shared helper. The mapping had
   existed since 2026-08-25 as two private lines used by one screen.
6. **Per-intent session lines**, replacing one identical line on all four lifting days — it asked for
   1–2 reps in reserve on a day whose rows prescribed 3–4.
7. **ME rows carry no reserve target** (p218 gives none), and a target-less ME row no longer completes
   with a fabricated 3.
8. **The accessory reserve leak is closed** — floor and dial rows carry p86's dose instead of falling
   through to a generic chart. Two accessories on one day were giving different numbers.
9. **A bodyweight row is no longer told to "Add weight."** A consequence of (3): removing the weight
   box left the nudge asking for something the row cannot accept.

---

## ⛔ THE RULINGS

### VERBATIM IS OFF — the claim is his, the words are ours, the citation lives in the code

Michael's own call, raised by him. Two reasons, both worth keeping:

1. **His prose in a product intended to sell is REPRODUCTION, not citation.** Quoting him in the
   corpus file is reference. Shipping his sentences as app copy is a different act.
2. **His sentences are written for a book.** *"Fatigue is discouraged"* is flat and academic under a
   bar.

The rule is the one `SET_END_CUE` already followed: it is Michael's own sentence traced to p82/p83,
nobody would mistake it for a quote, and it reads like a person talking. ⚠️ **Do not "improve" any
session line back toward the source wording.** The pull toward the page is real and it is the wrong
direction.

⛔ **AND A FIXTURE THAT *ENFORCED* VERBATIM WAS DELETED IN THE SAME CHANGE.** An hour earlier, under
the old policy, a gate asserted that every clause of the speed line appeared inside p219's
transcribed objective. That gate would have failed the next *correct* rewording. **A test written to
enforce a policy outlives the policy silently** — it is the shape of thing to look for whenever a
ruling changes.

### The stop rule lives on the exercise card, not the session line

Said twice on one screen — `SET_END_CUE` at the top of the day and *"stop short of failure"* on every
heavy card. His ruling: the card owns it, because a stop rule is about the set in front of you.
⛔ **Consequence he accepted: a heavy day's session line now carries only the accessory line.**
`SET_END_CUE` was **moved, not dropped** — the constant is untouched and its comment still forbids
rewording.
⚠️ The speed day is unchanged and must not be symmetry-fixed: `SPEED_SET_END_CUE` is not a stop rule,
it states what the day trains, and it has no per-card counterpart at all.

### Deleting a cue is not a one-line change

`StrengthLogger` renders `standingCue ?? titleCue`. A row returning `null` does not render nothing —
it **falls through to Wendler's bar-speed line** on anything sitting on `MAIN_531_LIFTS`, and
close-grip bench press is a secondary push in this frame. Removing the DE cue naively would have put
*"Every rep explosive and controlled."* on a Viada block: the exact defect that cue was written to
beat. The DE row is suppressed **explicitly**.

### Two unsourced clauses stay, and why

Michael asked whether the heavy card's line was Viada's. **Half of it is not.**

- *"If you get more than N, log it."* — **ours.** It stays because after the RIR change the heavy
  rows carry no reserve, so the **logged rep count is the only signal that slot produces**, and the
  bar ladder reads exactly it.
- *"Assistance if you need it, added weight if you don't."* — **ours.** It is the only thing on screen
  explaining the Assist/+ column running in both directions.

⚠️ **THE TEST FOR WHETHER AN UNSOURCED CLAUSE MAY SHIP: a training claim needs a page; an instruction
about how to use this screen does not.** Both of these are about the app.

### ✅ SETTLED — not a race plan, so no deload

Raised as a gap and **killed by Michael**. p246's taper column is a tool you deploy two weeks out from
a meet or a 5K; the standard week is built to run indefinitely. **`taperWeeks: []` is the right answer
for this athlete.** Do not re-raise it.

---

## Open — recorded, not to be fixed here

- **The Wendler fallback still fires** on a HYP or SKILL row that sits on `MAIN_531_LIFTS`
  (`standingCue ?? titleCue`). Suppressed for DE only.
- **p80 caps heavy work at 4–6 reps over 90% per pattern per week**; the ME set ramp can reach 3 sets
  across a 1–5 band, i.e. up to 15. Each pattern carries an ME slot every week, so three sets is
  reachable from week 5. ⛔ **Raised, band unchanged, no ruling.** His own *"more advanced athletes
  benefiting from more"* is the clause that would settle it.
- **p89's plyometric progression ladder is not implemented** (foot-speed drills → static plyos →
  balance → conventional jumps/bounding).
- **p77 is sourced and unplaced** — speed work needs specific readiness *going in*. It is about what
  precedes the session, not what happens inside it.
- **~40 frames of the pp.90–130 shoot are unread.** They are the endurance half; p90 opens *"Endurance
  Training Principles."*
