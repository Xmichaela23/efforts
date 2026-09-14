# Work order — Ride + Strength on p278 (2026-09-13)

> **STATUS 2026-09-13: §1, §3 and §4 BUILT; the card is live.** Setup path, copy and Michael's answers:
> `COPY-ride-strength-setup-2026-09-13.md`. Eight throwaway builds through the live server (4 and 5 rides,
> with and without FTP, lifts on file and tested in week one) matched p278 in all 12 weeks; accounts
> deleted. §3b is not built (ruled). §0.5's dumbbell-fill idea is not decided and not built.
> Later the same night: Build focus screen with Hinge variation (`06a66725`), step order and sample-week fix
> (`6670a2dd`), wording and default picks served by the server (`628392fa`). **Not phone-checked** (see the
> AWAITING MICHAEL 2026-09-13 block in POLISH-PUNCH-LIST.md).

The Ride Focus card **Ride + Strength** is a dimmed placeholder today (`NonRaceBuilder.tsx`,
`ride_strength`, `goal: null`). It goes live built on **p278** (Viada's cycling Base week, notes
p280), not p279. p279 stays unbuilt; its card name when it ships is proposed as "Long Ride +
Strength" (not decided). ⛔ Never use the word "Fondo" anywhere.

Who it is for: the general, fairly serious rider (Griffith, a club ride, no all-day Sunday), 3-5
hours of riding a week, 3 lifting days. p280: Base is the program for less experienced riders;
p137 names the rider who knows the sport but is currently undertrained in it (coming back).

## 0. Open — Michael answers before §4 ships

1. ✅ **Card copy APPROVED 2026-09-13 (Michael "yes"):**
   label `Ride + Strength` · blurb `For newer riders and riders coming back. Cycling and strength
   progress together. Four or five rides, three lifting days.` The current blurb ("Twelve weeks…")
   comes off either way.
2. ✅ **DECIDED 2026-09-13 (Michael): the Day 2 easy ride comes out of the 4-ride week.** The p278
   deload column keeps easy rides on Day 2 and Day 6 (Day 7 is full rest).
   ✅ **Copy approved (Michael):** ride names `VO2 Ride` and `Sprint Ride`; sprint effort `2 min all out`.
3. ✅ **DECIDED 2026-09-13 (Michael): twelve weeks.** Athletes who want a harder plan switch to another plan. (Superseded analysis follows.) **Length.** p280 gives "at least 4 weeks" and no end; lifts move every 3-4 weeks (p245, p247,
   p251); p123 says retesting is rarely needed. The book supports no fixed end. Today's builder
   makes twelve-week blocks. §2 traces what "no fixed end" costs before anyone picks.
4. **The lifting question's wording** (§3b). Nothing is shipped without his exact words.
5. **65 lb minimum — OPEN.** Decided: the check covers only lifts the week loads (first ⛔ below).
   Today's behaviour stays for a loaded lift under 65 lb; not a blocker, do not raise it again.
   (Field check: untrained recreational women
   averaged a 73 lb bench and 87 lb squat, about a third under 65 on bench — PMC9180020. Those
   athletes are refused, on deload weeks too.)
   ⛔ **But the check must only ask about lifts the plan loads** (Michael, same day: "you're using
   what the app tests against what the plan requires and creating an unnecessary gate"). Today
   `liftsBelowEntryMinimum` in `generate-strength-plan` (~274-287) checks all four barbell lifts on
   file, and `missingBarbellLifts` sends every missing one to a week-one test, whatever the frame
   prints. p278 names no overhead press (its push rows are categories; bench fills them). On this
   frame, the 65 lb check and the week-one test cover only the barbell lifts the built week
   actually loads. The frame declares them; the check reads the declaration, never the frame's
   identity. All Rounder and Run + Strength behaviour unchanged.
   ⚠️ **NOT DECIDED — written in error as a ruling; Michael was thinking out loud. Do not build.**
   Idea only: "accommodate everyone." A
   barbell lift the week loads that sits under 65 lb is filled with a SECONDARY movement from the
   same pattern instead (p220: the dumbbell category, e.g. seated DB press / Arnold press for a push,
   Kroc row for a pull, split squat / lunge for lower push, RDL for hinge). Basis: the All Rounder
   builds its lifting on secondary movements (p274) and p275 treats primary and secondary as
   interchangeable. The row keeps its intent, reps and sets; the load comes from the existing
   by-feel path (p218 reps in reserve), as the DE row already does (WORKORDER-de-row-by-feel).
   §2 reports how the All Rounder picks its secondary movements before this is written.

## 1. Transcribe first (docs only)

- Add a new Part to `docs/SOURCE-viada-hybrid-athlete.md` for p278 (Standard + Deload columns) and
  the p280 notes, read off `/Users/michaelambp/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/p278.jpg`
  and `p280.jpg`.
- ⚠️ **Days 5, 6 and 7 sit at an angle in the photo.** Read: Standard Day 5 = easy ride L1 + sprint
  L1, Day 6 empty, Day 7 = endurance L2 (lifting REST). Deload: sprint L1 and endurance L1 on the
  last two riding days. Confirm each cell off the image before the frame is written.
  > ⛔ **CORRECTED 2026-09-13 (§1 done, SOURCE Part E2).** Measured off the row shading in `p278.jpg`:
  > the level 2 endurance ride (Standard) and level 1 endurance ride (Deload) are on **Day 6**, and
  > **Day 7 is full rest** in both columns. Day 5 reads as above. p279, p281 and p281's "Saturday long
  > ride" note agree. So §0.2's deload easy rides are Day 2 and **Day 6**. p281 also prints Base's ride
  > progression (endurance rides step up in duration by 1-month cycles; the long ride every 1-2 weeks),
  > which §3 does not cover yet.
- The `RIDE_LEVEL_CEILING` comment in `frames.ts` (~line 1075) lists p278's rides without Day 2's
  and Day 5's endurance rides. Fix the comment when the Part lands.

## 2. Trace before building (report back, no code)

- How `strength_5k` (Run + Strength) is wired end to end: frame in
  `supabase/functions/_shared/standing-plan/frames.ts`, `FOCUS_FRAME`/`PROGRAM_COPY` in
  `src/components/NonRaceBuilder.tsx`, step list in `src/lib/wizard-steps.ts`,
  `generate-strength-plan`, `fenceMixToFrame`. The new frame copies that shape; screens ask the
  frame's declarations, never its identity.
- Ride slots: `native-ride-slots`, `sport-slots.ts`, the endurance library ride families
  (`ride_sweet_spot`, `ride_endurance`, `ride_vo2`, `ride_sprint`), and whether every one builds at
  level 1 with FTP watts.
- Length: what the All Rounder does at the end of a block, and what a program with no fixed end
  would need (checks every 3-4 weeks). Report the cost; do not build it.
- For §3b, confirm each piece in code and report: the composer accepts deload weeks anywhere,
  including week 1 and several in a row (`compose.ts` ~4063-4071); `generate-strength-plan` sends
  none (~952-954); `rematerialize-standing-block` never rebuilds week 1 or a started week (~282);
  Adjust offers next week only (`StateAdjustLens.tsx`); heavy sets earned from 1 up to 3; the
  two-weeks-short deload check in `me-history.ts` (~195-255) has no caller outside its test.
- Whether a single week can take one column's lifting and the other column's rides (today a
  deload week changes both sides).

## 3. The week (engine)

New frame, rides only (no run slots, swim off).

**Lifting — p278 Standard column, as printed.** Day 1 heavy upper, Day 2 heavy lower, Day 4
full-body speed day, plyo warm-up on Day 3. Every row the page prints, nothing added (no floor
rows, no accessory not on the page). Sets at the low end of p218's ranges when the block starts.
Weights from the existing week-1 test; move only when earned (existing).

**Rides — p278 Deload column, all level 1.** Sweet spot L1 · endurance L1 · VO2 L1 · sprint L1 ·
endurance L1 (5 rides). Watts from the saved FTP.
- Basis for Standard lifting with Deload riding in one week: p251 prints a week that takes one
  column's lifting and the other column's endurance.
- **4 rides (athlete's pick in the wizard):** one easy ride removed. p119 (no kind of session
  disappears), p109 (at least one speed and one sub-threshold session), p134 (easy volume is cut
  before quality). Which ride: §0.2.
- Rides say nothing about terrain (p229 principle: hold the target).
- ✅ **DECIDED 2026-09-13 (Michael):** the standing-start sprint workout (p236 level 1) is NOT built;
  the Sprint Ride rotates the other two level-1 options. Filed on POLISH-PUNCH-LIST.md.
- ✅ **DECIDED 2026-09-13 (Michael: "yeah we can say if easy rides are kept conversational use your
  own judgement to go longer"):** the plan does NOT lengthen rides week to week (p281's growth is
  not built). Easy rides print their level 1 length; the athlete may ride them longer on their own
  judgement when the ride stays conversational. Basis: p137 and p275 (extra easy work allowed while
  recovery holds), p211 talk test for VT1 (doc-only), p107 drift stop. Copy on the easy ride, APPROVED by Michael 2026-09-13: `If easy rides are kept conversational, use your own
  judgement to go longer.`

**Deload week** (existing Adjust toggle, next week only): p278 Deload column for both sides.
No scheduled deload (every deload cadence in the book is tied to an event or fatigue; p120).

**Progression** — existing mechanisms only: lifts move when earned; FTP estimate offered at the
week-6 check / popup / Adjust and applies only when the athlete accepts.

## 3b. New to lifting

> ✅ **DECIDED 2026-09-13 (Michael "ok"): the deload-column start below is NOT built.** p278's deload
> column keeps every heavy row, so it is not a lighter start. The book's start for a new lifter
> (p218 low end of every set range, heavy sets at 1; p129; p122 week-1 test of current ability;
> p148) is the normal p278 week, which §3 already builds for everyone. The text below is kept for
> the record only.

The app asks nothing about lifting history today (its experience question covers run and ride
only). Lifting numbers show how much someone lifts, not how long they have lifted; the book sets
the dose from training age (p129).

**The question.** One setup question: new to lifting or not (wording §0.4). A "not new" answer
changes nothing in §3.

**A "new" answer — the book's route:**
- p129: start small in a new sport. p265: heavy lifts should be well practised before heavy sets.
  p218: sets at the low end of each range. p089: jumps start with ladder drills and hops in place.
- The block **starts on the p278 Deload column's lifting rows** (heavy sets become skill or speed
  sets, the rows the deload column removes stay out), with **§3's normal rides** in the same weeks.
- No printed number of weeks. **The check every 3-4 weeks** (the interval lifts already move on,
  p245 p247 p251): if the athlete's lifts are going up and they are recovering (p218 "progressing
  and seems to have recovery to spare"; p265 "a few weeks without notable fatigue while still
  progressing"), **one** Standard-column heavy row comes back. If not, the deload rows stay.
  p148: less than 10% more a week, so rows return one at a time, never the whole column at once.
- The athlete reaches p278's Standard lifting when every row is back. Nothing climbs past it.
- The signal for "progressing and recovering" comes from logged sessions (targets met, sets
  completed, reported effort where logged). §2 reports what the logs can support before the rule
  is written; no threshold is invented.

**New pieces:** the question; starting a block on deload lifting rows (builder + server + week 1);
a week with deload lifting and normal rides; the 3-4 week check that returns one row.

## 4. Wizard and copy

- ✅ **DECIDED 2026-09-13 (Michael: "yeah thats good put the 65 lb minimum here"):** the plan
  description ends with a minimum-requirements line listing what p278 needs plus the 65 lb minimum.
  Contents: barbell and rack (heavy and speed rows are barbell lifts), bench, dumbbells (secondary
  push options), something to carry (p226), a bike; watts need a power meter or smart trainer.
  ✅ Words APPROVED (Michael): `Requirements: a barbell and rack, a bench, dumbbells, something to
  carry, and a bike. Watts need a power meter or smart trainer. Bench, squat and deadlift each need
  a 1RM of at least 65 lb.`
- ✅ **DECIDED + copy APPROVED 2026-09-13 (Michael): the carry row carries no sets or reps.** The
  3 sets of 3-5 were borrowed from p218's barbell SKILL band; p226 gives carries only load and aim.
  The row reads: `Farmers Carry · medium weight, no fatigue, full rest`. No change to how the 65 lb check behaves.

- Path: Train → Ride → Ride + Strength → rides (4 or 5) → new to lifting → schedule → numbers →
  confirm. Propose
  the exact step list and every screen's words to Michael before ship (all athlete copy through
  him).
- Approved line, on the step where FTP is confirmed:
  `If you're coming back from a riding break, make sure your FTP is current.`
- No em dashes, no emojis, no author's name, no protocol names on cards.

## 5. Guards

- Frame test: no lifting row absent from p278; no run slot; every ride level 1; 4-ride week has
  exactly one sweet spot, one VO2, one sprint, one easy ride.
- `wizard-steps.test.ts`: the Ride + Strength step list is exact.
- New-lifter build: week 1 lifting = p278 Deload rows, rides = §3's normal rides; a check that
  passes returns exactly one Standard row; a check that fails returns none; nothing past p278
  Standard.
- One guard for other plans: All Rounder and Run + Strength builds are unchanged by this frame.

## 6. Not in this order

p279 program · the FTP-signs note on State/Performance · fewer intervals in the first weeks from
ride files (p148) · a club ride counting as a ride day (p120/p123) · the automatic two-weeks-short
deload offer · a program with no fixed end (§2 reports cost only).

## 7. Verify and ship

- Throwaway accounts build real weeks (4-ride and 5-ride, with and without a saved FTP, new and
  not new to lifting); read the
  generated weeks against p278. Michael is not the test.
- `git add` the exact files, never `-a`. Commit, push and deploy each need Michael's yes; at close
  say pushed vs client deployed vs edge functions deployed.
