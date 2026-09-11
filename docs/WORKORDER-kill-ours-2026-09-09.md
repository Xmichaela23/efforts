> **SHIPPED 2026-09-10** incl. §B2, §C and the kit-gate addenda. Pending: club-night and season-wizard sentences (Michael); DRAFT marker on the concentration curl how-to (approved late 2026-09-10).

# Work order — Kill ours: every athlete-facing strength line traces to a page (2026-09-09)

Michael, 2026-09-09: "never use ours" (the most important rule). Inventory of the strength screens the
same day found twelve athlete-facing lines with no page. Two have their own orders: the DE row priced off
bench (docs/WORKORDER-de-row-by-feel-2026-09-09.md) and the rest-timer minutes (handoff, "Still on the
list" item 0). This order is the other ten, plus three engine numbers.

Rules: every line here gets Michael's yes before it ships. Bare facts with page numbers are listed; he
writes the sentence. Never paraphrase the book in prose. The citation lives in the code, never on screen
("the book says" is banned). docs/COPY-VOICE.md.

## A. Lines that come off with nothing in their place

1. ME row cue, `STANDING_ME_SET_CUE` (src/lib/strength-focus-copy.ts): delete `If you get more than N,
   log it.` and `Assistance if you need it, added weight if you don't.` The row keeps `1-5 reps, stop short
   of failure.` (p219). The rep stepper is uncapped, the Assist/+ column has its own labels.
2. Previous-program residue: `ACCESSORY_SET_CUE` (`Split these into as many sets as you need…`) and the
   title cue `Every rep explosive and controlled.` (`barSpeedCueFor` on `MAIN_BARBELL_LIFTS`). Delete
   both. They only fire on rows the plan no longer builds (rep totals, unlabelled DE). Check `cardCueRaw`'s
   fall-through in StrengthLogger.tsx (~line 6072): a DE row must still render its own intent line, never
   fall to a deleted cue.
3. Week warnings (supabase/functions/_shared/standing-plan/week-conflicts.ts): the claims `Riding hard
   costs the legs less than running hard does`, `a tendon cost rather than a comfort one`, `come in under
   the weights the test priced`, `carries injury risk rather than a hard day` have no page. Delete the
   claims. What stays is in §B.6.

## B. Lines rewritten from a page (facts listed; words are Michael's)

4. Set-word sheet, `SET_TYPE_INFO` (StrengthLogger.tsx ~572). Replace all four texts with the approved
   lines:
   - ME: `1 to 5 reps, stop short of failure.` (p218, p219)
   - DE: `As fast as possible on every rep. Bar slows, set is over.` (p218, p219)
   - SKILL: `Form and consistency over speed. Weight heavy enough to be a challenge. Every rep either
     improves the movement or degrades it. Performed poorly, stop.` (p219, p76, p143)
   - HYP: `8 to 12 reps, 1 to 2 in reserve. Reps slow as the set goes.` (p86, p218)
   The spelled-out names stay (Maximal effort, Dynamic effort, Skill, Hypertrophy — p219 abbreviations).
5. Test row notes (compose.ts `testDaySession`, ~2049 and ~2060). Facts: test your 5-rep max before the
   program (p214); a 5- to 6-rep max is the most reliable (p214); the last set is taken for max reps and
   the number comes from it (p215). APPROVED (Michael, 2026-09-09) for the test row with a max on file:
   `Last set as many reps as possible. It sets your numbers.` Replaces `Test set — the last set is taken
   for max clean reps, and it sets the block's numbers.` The blank-lift test row (no number typed on Profile or the
   first-run "Your lifts" screen) changes shape (Michael, 2026-09-09): set 1 is an instruction from p215, a
   weight you can do 8 with and 10 would be near failure, do 6; the athlete types the weight and taps done;
   the app then fills set 2 (plus 10 percent, 5 reps) and set 3 (plus 5 percent more, as many as possible)
   from the logged set 1, the same steps the row with a number already uses. The set 3 note is the approved
   line above. Set 1 instruction, APPROVED (Michael, 2026-09-09): `A weight for 8 to 10 reps near failure. Enter it here.` Delete `No max on file to aim the
   warm-ups — work up until the last set is genuinely hard.`
6. Week warnings, what stays (week-conflicts.ts). Facts: a keystone session needs to be fresh in the
   systems it uses, not fresh overall (p131); strength work fresh, fatigue impairs recruitment and teaches
   wrong patterns (p77); after a hard leg session cut the easy run by about a third for the same adaptation
   (p144); a long session on legs that have not recovered makes the session a write-off (p130). The
   warning names the two sessions and the day, then one of those facts. Michael writes the line per case:
   hard ride + heavy legs same day; long run within a day of heavy legs; speed lower day after a long
   session. KEPT as one warning (Michael, 2026-09-09: "I will warn them, that's the industry standard"):
   the two sessions, the day, then a p131 fact. Fires only when the athlete's own day picks make the clash.
   APPROVED words (Michael, 2026-09-09), his sentences from the page:
   - Same day, hard ride + heavy legs: `Tuesday: hard ride and heavy legs. Lifts in the first session, 6 to
     8 hours before the ride.` (p145, p77). Day name from the athlete's pick.
   - Same day, easy run + heavy legs: the plan cuts the run by a third and the warning says so:
     `Tuesday: heavy legs and an easy run. The run is cut by a third.` (p144, same session or day only).
   - Long run the DAY AFTER heavy legs: p144 does not cover the next day. No cut. The warning states only
     the fact: `Friday heavy legs, Saturday long run. The run is on legs that have not recovered.` (p130,
     p131). Michael, 2026-09-09: "don't take liberties that aren't ours."
   - The remaining four cases (hard run on the heavy leg day; a hard session the day before or after heavy
     legs; long run the day before heavy legs; heavy legs after a long session), APPROVED (Michael, 2026-09-09):
     · Lifting after a hard or long run: `[Day]: heavy legs after [session]. Tired legs cause you to lift
       slowly and establish improper coordination patterns.` (p77)
     · Hard or long run after lifting: `[Day]: [session] after heavy leg training. Legs will be fatigued,
       session suffers.` (p130, p131)
     [Day] and [session] from the athlete's own picks.
   The four deleted claims (§A.3) do not come back.
7. Plyo row note (compose.ts ~2139). Facts: each drill done separately, multiple times, ample rest, full
   focus on technique, balance, consistent quality (p227); until the movement is optimised for the day and
   the athlete is confident in it, then move on (p227); fatigue, poor form, imprecise movement are absolute
   no-nos (p227); no more than three or four drills a day (p227). `3–4 efforts` is ours and goes; the
   benefit phrases (`running gait and speed` etc.) are his table and stay. APPROVED (Michael, 2026-09-09):
   `Repeat until it feels right and you are confident, then move on. Full rest between. Tired or sloppy,
   stop.` The benefit phrase leads the note as it does today.

## B2. Session description lines on the plan card (APPROVED, Michael, 2026-09-09)

The `description` a composed session carries, shown under the session name on the plan card and drawer
(`PlannedWorkoutSummary.tsx`). Composer `notes` (`standing_plan_notes`) never reach the client; they are
not in scope.

Delete (the row lines now carry the content):
- Test session (`compose.ts` ~1950): `Work up in three steps. The last set is max clean reps and it is what
  the block reads.`
- Plyo session (`compose.ts` ~2026, `PLYO_DOSE.stopRule`): the row note carries the approved line.
- Every lifting day (`ACCESSORY_FATIGUE_CUE`, `sessionCueFor`): `The accessories run the other way…`
- Speed day (`SPEED_SET_END_CUE`, `sessionCueFor`): `This day trains bar speed and a clean bar path…`
- Near-threshold run (`session-vocabulary.ts` `describeSession`): `Effort 5–6 of 10.`
- Any endurance session: `At least this long — some recoveries carry no stated duration.`

Keep:
- Race-tempo run: `Run at race pace, with the recovery periods a quarter longer than usual.` (p247)

Rewrite:
- MLSS run: `Fatigue spread evenly across the rounds. Hills are fine, adjust pace to hold the effort.` (p231)
- Easy and long run: `Go by heart rate. Pace varies with fatigue, hydration and weather.` (p235)

A lifting session with nothing left to say carries an empty description. Goldens regenerated.

## C. Engine numbers with no page

8. Progression thresholds, `THRESHOLDS_ARE_OURS` (standing-plan/progression.ts ~186): the fixed counts
   for advance, hold, reset. Page: the calculated max rises about 1 percent every 3 weeks (p245, p247,
   p251); ME lifts underperform two weeks in a row, one deload week (p245); double progression through the
   circle of reps (p123). Rebuild the rule from those three and delete the fixed counts.
9. Bike-mix haircut extension, `HAIRCUT_CAUSE_IS_OURS` (progression.ts ~60): the source states the
   haircut once for the run frame; extending it to a bike-heavy mix is ours. Drop the extension.
10. ME set ladder 1 → 2 → 3, `ME_SET_LADDER_IS_OURS` (progression.ts ~319): range is his (p218, 1 to 3
    sets), when a set is earned is ours. Page: sets low to start, more only if progressing well with
    recovery to spare (p218). KEPT (Michael, 2026-09-09): the ladder stays, p218 is its rule, the earn/lose
    steps are the app's reading of "progressing well with recovery to spare". No change.

## Out of scope

- The Today screen.
- Endurance-side lines (ride and run cards, State copy). Separate inventory when Today is built.
- `REST_MINUTES_ARE_OURS` and the timer (handoff item 0).

## Verification

- `grep -rn "OURS\b" src supabase/functions --include=*.ts --include=*.tsx` lists only the constants this
  order leaves on purpose (timer, ME ladder if kept), each with a page or a Michael ruling beside it.
- Goldens regenerated and read: no `3–4 efforts`, no deleted warning claim, test notes as approved.
- Logger on a throwaway account with a built plan: ME row shows only the p219 line; the set-word sheet
  shows the four approved lines; a DE row still shows its intent line.
- Michael's own plan: the row notes change on his next rebuild, not before.

## Addendum 2026-09-10 — the kit gate (Michael, home gym: adjustable dumbbells, flat bench, no incline, no preacher bench)

The plan prescribed Preacher Curl and offered Spider Curl and an incline dumbbell row. Cause traced: the
catalogue declares no equipment for several of the book's focused-pull movements, so the gate admits them
on any kit. Fix (in progress, agent 2026-09-10 evening): every movement on the book's lists declares its
need; the gate refuses what the kit lacks; undeclared + declared kit = refused; the swap list offers only what
fits; an empty slot is left out and named ("Not placed this week"). Plus two kit routes so a dumbbell + flat
bench kit fills every slot: a bent-over dumbbell rear delt fly for the rear delt machine, and a flat-bench
dumbbell pullover for the pullover machine (same pattern as the incline dumbbell chest-supported row).
Third home route (Michael, 2026-09-10: "a bench, a rack and dumbbells is a pretty standard home gym"): the
preacher curl's home version is the concentration curl (seated on the bench, upper arm braced against the
inner knee, one arm), same braced-arm biceps intent; field-standard substitute, p275 permits the implement
change. Route: preacher bench → Preacher Curl; home kit with bench + dumbbells → Concentration Curl. Its
how-to line needs Michael's words.
