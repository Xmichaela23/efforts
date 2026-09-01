# STATE SCREEN — CLEAN-UP FIX LIST
**Written 2026-09-01. Source: Michael's five screenshots of the live State screen (week 1 of 12,
Standard Focus) plus the open items in `DEBT-state-screen-structure-2026-08-29.md` and the
"deployed but undrawn" list in `WORKORDER-the-progress-standard-2026-08-28.md`.**

⛔ **EVERY ITEM BELOW IS AN OPTICS OBSERVATION OFF A SCREENSHOT.** None has been code-traced.
Trace before treating any of them as a defect — several may be an unrendered field rather than a
wrong one, which is the failure mode this screen has produced four times.

⛔ **A separate terminal ("state fix") is doing this work.** This file is the shared record. Update
the status column in the same commit as the change.

---

## ROUND 0 — EXTRACT BEFORE REORDERING. No behaviour change.

The 2026-08-29 debt note is explicit: eight blocks of logic live inside the layout, and the last
attempt to move one block required a script to find its brace boundaries. **Nothing in rounds 1-4
that MOVES anything should be attempted before the blocks it moves are named components.**
⚠️ Carry the comments across. They hold rulings that were re-litigated repeatedly.

- [x] 0a. **DONE 2026-09-01 (state fix terminal).** Every inline block in `StateTab.tsx` is now a
      named component in its own file. Comments carried across verbatim. `StateTab.tsx` 2078 → 912
      lines. Build green, `state-perlift-cap` + `strength-read` fixtures green (14 passed), no new
      type errors (the 4 that remain are pre-existing on `main`). NOT committed, NOT pushed.
      · `state-primitives.tsx` — Row / Chip / Dot / trendColor / fmtDate / fmtGoalClock / the three
        signed-delta formatters / daysSinceYmd / fmtBodyAsOf / goalMetaFromGoalLite / WeekMixBar /
        WeekAccentLine / the nudge-snooze pair. Shared by the blocks below, verbatim.
      · `StateHeaderBlock` · `StateLastRaceCard` · `StateRaceDayBar` · `StateBodyBlock` ·
        `StateReadinessRow` · `StateWeekExecution` · `StateTrendsBlock` · `StateSwimNudge` ·
        `StateSignalBlock` · `StateRaceBlock` (which also absorbed the 420-line `RaceSection`) ·
        `StateNextBlock`.
      · ⚠️ **VISIBILITY TESTS DELIBERATELY STAYED IN THE CALLER** on every block that sits inside a
        `divide-y` plate, and on `strengthDetail` (see 0b). Moving a gate inside a component that
        then returns null is NOT equivalent where the parent tests truthiness.
      · ⚠️ **ONE TYPE-CHECK LOOSENING, STATED PLAINLY:** `StateBodyBlock` takes `visibleSignals` as
        `Array<any>`, so the two pre-existing `as_of_date` type errors stopped being reported. The
        rendered code is unchanged; the errors were suppressed, not fixed.
- [x] 0b. **DONE 2026-09-01.** "From your logged sets" and "your best sets" are now
      `StrengthLoggedSets.tsx` (119 lines), with the fold state moved in with them.
      ⛔ **AND THE TRACE FOUND A CONSTRAINT ON 1a THE LIST DID NOT KNOW ABOUT.**
      `StatePerformanceSection` tests `strengthDetail` for **TRUTHINESS** in two places
      (`StatePerformanceSection.tsx:1624` and `:1659`) — at `:1659` a truthy value draws a
      STANDALONE detail block when no strength card exists. A component that renders null is still
      truthy, so the "is it empty" test cannot move inside the component, and **whatever 1a does to
      the strength surfaces must keep that null/non-null distinction intact** or an empty wrapper
      appears on the screen. The gate is left in `StateTab` with a comment saying so.

---

## ROUND 1 — THE DUPLICATES. Delete, do not redesign.

- [x] 1a. **DONE 2026-09-01 (state fix terminal). Client-side deletion only; server untouched.**
      Deleted: the "is the bar going up" heading, `<StrengthReadCards>`, its default export,
      `ReadChart`, `Card`, `LineOnlyCard`, `canonicalKey`, `BLOCK_WEEKS`, the
      `seriesByCanonical` / `expectedByCanonical` maps and the three-way `per_lift` fallback that
      filled them. `StrengthReadCards.tsx` survives and now holds only the ENDURANCE cards; its
      default export is `EnduranceReadCards`. `liftSeriesFromExerciseLog` and every payload field
      are exactly as they were — no edge function touched, nothing redeployed.
      ⚠️ **ONE DELIBERATE BEHAVIOUR CHANGE, AND IT IS THE POINT.** The trends plate's render gate was
      a FOUR-way test (lift history / named session / spine / the week's lifting dose). Two of those
      doors opened a plate that no longer holds anything they feed: `me_history_v1` was the lift
      cards' door, and `viadaWeek` stopped being drawn here on 2026-08-29 when the week's dose moved
      to the LOAD plate (its own comment admitted it was kept "because the section's render gate
      counts it as substance"). Left in, either would draw an EMPTY plate for an athlete who lifts
      and does not run — the week-1 case. The gate is now the endurance cards' own predicate.
      ⚠️ **`src/lib/strength-read.ts` IS NOW UNRENDERED** — its only consumer was the deleted
      component. Kept with a banner on the file, not deleted: its eight fixtures still pass and still
      prove nothing about the live screen. Retiring it, and the `me_history_v1` payload field that
      feeds it, is a SEPARATE call that has not been made.
      Build green, 14 fixtures green, no new type errors. NOT committed, NOT pushed, NOT deployed,
      NOT seen on a device.
- [x] 1a-original. ⛔⛔ **The four main lifts are drawn TWICE, in two different shapes, in one scroll.**
      Once under *"trends · the arc behind this week"* → *"is the bar going up"* (name, estimated
      max, "your heaviest set each week", a line) and again in the **STRENGTH** block (E1RM, BEST,
      SESSIONS, the all-out set, REP PR, a line). Plus a third folded surface,
      *"FROM YOUR LOGGED SETS · 12 lifts"*.
      ⛔⛔ **RULED BY MICHAEL 2026-09-01: THE STRENGTH BLOCK SURVIVES. "Is the bar going up" GOES.**

      **TRACED BEFORE THE RULING, AND THE TRACE IS THE REASON:**
      · **Both surfaces read the SAME number and the SAME series.** `latestE1rm` and the chart points
        both come from `liftSeriesFromExerciseLog` — one point per ISO week, that week's HEAVIEST set,
        with the ten-rep ceiling. Speed work is excluded by arithmetic, not by classification
        (`assemble.ts`, the 2026-08-29 replacement of the heavy gate). Neither surface is "smarter".
      · **The STRENGTH block carries four things the other has none of:** the all-history record
        (`allTimeBestE1rm`, deliberately UNGATED so a trap bar or a curl can hold one), the session
        count and as-of date, the last all-out set with its rep-PR flag, and the training-max
        climbing / holding / reset line.
      · ⚠️ **"Is the bar going up" is the NEWER file** (`StrengthReadCards.tsx`, built 2026-08-28/29),
        not legacy code. The block being kept is the older surface. Delete accordingly.
      · ⛔ **DO NOT TOUCH THE SERVER SERIES.** The weekly-heaviest-set logic feeds BOTH surfaces and
        stays. Only the client card goes. ⚠️ And `StrengthReadCards.tsx` also renders the ENDURANCE
        cards (the same file) — those stay. This is a partial deletion, not a file deletion.
      · ⛔⛔ **A HARD CONSTRAINT THE LIST DID NOT KNOW, code-traced 2026-09-01 during Round 0:**
        `StatePerformanceSection.tsx:1624` and `:1659` test `strengthDetail` for **truthiness, not
        content**, and at `:1659` a truthy value draws a STANDALONE "from your logged sets" block when
        no strength card exists. **A component that renders null is still truthy**, so the emptiness
        test cannot move inside the extracted component. Whatever 1a does must preserve the
        null-vs-non-null distinction or an empty wrapper lands on the screen.
      · ⚠️ The two surfaces list DIFFERENT lifts — the deleted one is the tracked-four only, the
        survivor also shows Trap Bar Deadlift. Which is item 2b.
- [x] 1b. **DONE 2026-09-01 (state fix terminal). THE ITEM'S PREMISE WAS WRONG AND THE TRACE CORRECTED IT.**
      ⛔ **THE ROW WAS ALREADY STANDING DOWN.** The photographed string
      *"Efficiency Holding · over 6wk · 10 runs · 4d ago · as of Aug 28"* is NOT `<RunFitnessRow>` —
      `runSpineCovers` was suppressing that correctly. It is `<DisciplineRow>`, which labels run's
      metric "Efficiency" (`StatePerformanceSection.tsx:1425`, its own Q-110 comment), prints the
      verdict word, then `trendEvidence` (`src/lib/trend-receipt.ts:45-49`) and `asOf`. A THINNER
      duplicate was drawing beneath the one the gate hid. Deleting the gate alone would have
      RESTORED the richer duplicate.
      ⛔ **THE COUNTS NEVER DISAGREED.** 10 runs / 6wk is the fitness verdict's pooled window;
      19 easy + 5 quality is the spine's per-session-type population. Two questions, one word.
      Not a defect — do not re-file it as one.
      **WHAT SHIPPED:** the run card leaves the Fitness section entirely (`sortedCards` filters
      `discipline !== 'run'`), and `runSpineCovers` + `runHasSubstance` + the run render branch are
      deleted. Removing the card removes the cross-block gate by removing its subject — Round 3's
      no-block-reads-another-block rule is satisfied by deletion, not by rewiring.
      ⚠️ **NOTHING CURRENTLY ON SCREEN WAS LOST — checked one by one in the stood-down state:**
      the posture sentence renders only inside `<RunFitnessRow>`'s ⓘ tap-down (the Q-179 note says
      so); the fitness anchor is passed only to `<RunFitnessRow>`; and the dot/range branch cannot
      fire for run at all, because `perfByDisc.run = perfFromTrend(...)`
      (`_shared/state-trend/discipline.ts:86`) returns no `range` field. Pure duplicate removal.
      ⚠️ **`RunFitnessRow` (~330 lines) IS NOW UNREACHABLE and was NOT deleted.** It holds content
      that exists nowhere else: the measured heat cost in seconds per mile per 10°F off the athlete's
      own runs (D-346), the temperature-spread caption, the ⓘ definition, the posture sentence.
      Bannered in place. Retiring it is a product call, not a cleanup — **not made.**
      Build green, 14 fixtures green, no new type errors. NOT committed, NOT pushed, NOT deployed,
      NOT seen on a device.
- [x] 1b-original. **The RUN row duplicates the run efficiency cards AND disagrees with them.** Row:
      *"Efficiency Holding · over 6wk · 10 runs · 4d ago · as of Aug 28"*. Cards above it: 19 easy
      runs and 5 quality runs, through Aug 31. Different count, different date, and a verdict word
      where the cards deliberately carry none. ⚠️ The row was supposed to stand down where the cards
      cover it (2026-08-29); on this screen it has not.
- [x] 1c. **TRACED 2026-09-01 — NOT A DEFECT TODAY. Nothing deleted, and that is the finding.**
      The two surfaces show DIFFERENT METRICS on Michael's screen, so there is nothing duplicated to
      remove. The BIKE row is in its `building` + `loadFloor` branch (Q-255,
      `StatePerformanceSection.tsx:368-382`): it prints CTL/TSB training load — *"fitness 18 · form
      −13 · from every ride"* — precisely BECAUSE his power read is not established yet. The rides
      card prints efficiency (output per heartbeat). No overlap. The item's own sentence — "they
      answer different questions" — was the correct read.
      ⚠️ **THERE IS A LATENT DUPLICATE, WITH AN EXACT TRIGGER.** The same row has an `aerobicLead`
      branch (`:390`, `<AerobicSignal sig={fitness.efficiency} />`, plus *"Your heart rate at the same
      power, from N easy rides"* at `:435`). That IS the rides card's subject. It fires when
      `assertsLead && !leadIsPower` — i.e. once he has enough rides to assert a lead AND efficiency
      leads over power. He is not in that state; when he enters it, this becomes the run situation.
      ⛔ The run row's own note ("THE BIKE ROW IS UNTOUCHED: its charts are POWER and LOAD, and no card
      carries those") is true of the power and load branches and **false of the aerobicLead branch**.
      ⚠️ **THE "ONE SUBJECT SPLIT IN HALF" COMPLAINT IS REAL BUT IS A LAYOUT ITEM, NOT A DELETE** —
      the rides card sits on the trends plate and the bike row in Fitness. That is **3.5a**
      (one block per sport inside TRENDS), not Round 1.
- [ ] 1c-latent. **The bike row's `aerobicLead` branch will duplicate the rides efficiency card**
      once the athlete's power read establishes and efficiency leads. Not built — building for a
      state no athlete is currently in, and the Round 1 instruction is delete-not-redesign. Filed so
      it is caught before it ships rather than after a screenshot.
- [ ] 1c-original. **Two bike surfaces.** The rides efficiency card (0.90, 17 logged, to Aug 26) and the BIKE
      load row (fitness 18 · form −13 · its own chart · "more"). They answer different questions but
      read as one subject split in half.
- [x] 1d. **DONE 2026-09-01. Client-only. NO NEW MECHANISM — the existing one was already there.**
      ⛔ **IT SURVIVED 1a, BUT THE SURFACES MOVED.** "Squat" is gone from the deleted trends cards.
      The live collision is now on ONE plate: the STRENGTH block header reads "Back Squat" while
      "from your logged sets", nested directly beneath it, read "Squat".
      ⛔ **THERE WERE THREE VOCABULARIES, NOT TWO:**
      1. `canonicalDisplayName` (`_shared/canonicalize.ts:319`) — the deliberate one. Its own comment:
         *"a lift logged under many raw names always shows ONE clear label."* `squat` → "Back Squat".
      2. `LIFT_DISPLAY` (`coach/index.ts:2479`) — a SECOND hardcoded map inside the coach.
         `squat` → "Squat". This reached the screen as `per_lift[].display_name`.
      3. `useExerciseLog.ts:109` — `displayName: rows[0].exercise_name`, the raw name the athlete
         typed. This was what "your best sets" rendered.
      **FIX:** the client reads (1) for both lists, via the existing `@shared` alias. No new map, no
      server file touched, no redeploy needed.
      ⚠️ **AND A FOURTH ONE WAS REMOVED BEFORE IT LANDED:** the `SLOT_DISPLAY_NAME` constant written
      an hour earlier in `fold-lift-slots.ts` (2b) is deleted; that file now reads
      `canonicalDisplayName` too. A second map beside the first is how this screen got here.
      ⚠️ **NOT FIXED:** `LIFT_DISPLAY` still exists and still emits "Squat" in the payload — see S2.
- [ ] 1d-original. **One lift, two names** — *"Squat"* in the trends cards, *"Back Squat"* in the STRENGTH
      block.
- [x] 1e. **DONE 2026-09-01. Client-only, one file (`src/components/LoadBar.tsx`).**
      Deleted the text inside the bar. The legend two lines below already carries the swatch, the
      sport name and the share for EVERY segment, each in that sport's own colour.
      ⚠️ **AND THE IN-BAR LABEL WAS INCONSISTENT BY CONSTRUCTION, not by accident:** it was gated on
      `c.pct >= 26`, so on a typical split only the dominant segment cleared the threshold — one
      labelled block beside two anonymous ones, over a legend that labelled all three. That is the
      second half of the item and the same cut fixes it.
      The dominant segment keeps its inset ring (a mark, not a caption) and the per-segment `title`
      tooltip is unchanged. Build green; the one eslint error in the file is pre-existing (verified
      by stashing).
- [ ] 1e-original. **The load split prints its percentages twice** — inside the bar (*strength 55%*) and again
      in the legend below it (*strength 55% · bike 26% · run 19%*). And the bar labels only the
      first segment, so the other two are unlabelled bars over a labelled legend.

---

## ROUND 2 — WRONG OR CONTRADICTORY ON SCREEN.

- [ ] 2a. ⛔ **The same movement printed twice in one sentence, in two cases:**
      *"no known max yet for Ab Wheel Rollout, ab wheel rollout — those sets are in the muscle counts
      above, not in the percentages."* Almost certainly the display name and the raw name reaching
      the same list.
- [x] 2b. **DONE 2026-09-01 (state fix terminal). Display/slot fold; server untouched.**
      One deadlift card, fed by whichever version was pulled, **no version line**.
      `src/lib/fold-lift-slots.ts` + 7 fixtures; wired at `StatePerformanceSection` where the lift
      card list is built. `latestE1rm` UNCHANGED in meaning and in code.
      ⛔ **THE SPLIT WAS A NAMING ARTEFACT — this corrected a wrong number, not a redundant card.**
      `canonical_name` comes from ONE thing, the typed exercise NAME
      (`compute-facts/strength-facts-lib.ts:148` → written at `compute-facts/index.ts:1729`). There is
      NO equipment or implement field anywhere on a logged set. A Standard Focus block prescribes the
      hinge slot as the literal string `'Deadlift'` (`shared/strength-system/barbell-maxes.ts:27`), so
      a trap-bar pull against the prescribed slot is filed as `deadlift` whatever bar was used. The
      only place the app ever emits "Trap Bar Deadlift" is one taper session of a different protocol
      (`shared/strength-system/protocols/performance-neural.ts:597`).
      ⛔ **NO VERSION LINE, AND THAT IS A RULING NOT AN OMISSION.** "Name the version that set the
      number" is not buildable — the app knows the NAME a set was logged under, never the bar. For a
      prescribed-slot session it would print "Deadlift", the wrong word for a trap-bar puller.
      ⚠️ **A MERGED CARD CAN READ LOWER AND THAT IS ACCEPTED.** If the latest trap-bar week is later
      than the latest deadlift week, the slot's number is the trap-bar one. `showBest`
      (`StatePerformanceSection.tsx:699`) renders "best" exactly when latest is below the record, so
      the card explains itself; `isPr` correctly turns off. Field shape (Strong / Hevy): estimated-max
      trend and personal record shown as two separate figures. Pinned by fixture, as CORRECT.
      ⚠️ **THE CARD COUNT WAS NEVER "ONE SESSION".** A lift reaches `perLift` only via
      `computeStrengthState(liftSeries…)`, and `liftSeriesFromExerciseLog` requires **two distinct ISO
      weeks** (`assemble.ts`). The "1" on screen is `sampleCount` — points inside the 6-week VERDICT
      window (`assemble.ts:1253` → `StatePerformanceSection.tsx:709`), not the series length. The trap
      bar had a real multi-week history.
      ⛔⛔ **AND THE SERVER STILL DOUBLE-COUNTS THIS SLOT. NOT FIXED, NOT MINE TO FIX — SEE 2b-server.**
- [x] 2b-server. **DONE 2026-09-01. SERVER CHANGE — NEEDS A DEPLOY (27 functions). See below.**
      ⛔ **FIRST, THE THING THAT CHANGES WHAT YOU TELL MICHAEL: THE FAULT IS COMPUTED AND UNRENDERED.**
      `computeE1rmBand`'s output reaches exactly one field (`strengthFitness.e1rm.range`,
      `assemble.ts:1274`) and the client reads that field ONCE — as a `!= null` truthiness test inside
      `strengthHasSubstance` (`StatePerformanceSection.tsx:1552`). The value itself is never rendered.
      The only two `FitnessDotBlock` call sites are bike (`:396`) and `DisciplineRow` (`:1468`), and
      strength cannot reach the latter (`perfByDisc.strength` is hardcoded `null`, D-420). **No number
      an athlete can currently see was wrong, and none moves.**
      **THE FIX:** `computeE1rmBand` now takes ONE RATIO PER SLOT instead of one per canonical, using
      the shared slot map. Both branches (baseline-preferred and the no-baseline 12wk fallback) route
      through it. The slot's reading is its most recent one — the same representative rule the client
      display fold uses, so the card and the band cannot disagree about which pull is current.
      ⛔ **`PRIMARY_LIFTS` WAS DELIBERATELY NOT NARROWED, AND THAT MATTERS.** `isPrimary` is also what
      puts a lift in the client's card list, so dropping `trap_bar_deadlift` there would delete its row
      BEFORE the display fold merges it — losing the athlete's record and session count, which is the
      opposite of the ruling. Membership stays; the aggregation changed.
      ⚠️ **FRONT SQUAT NEEDS NOTHING AND NO SECOND MECHANISM WAS BUILT.** `front_squat` is not in
      `PRIMARY_LIFTS`, so it never reaches this function and cannot double-count the squat slot; it
      carries no tracked max, so it draws no card to fold. Documented in `src/lib/lift-slots.ts` with
      the condition that would change it.
      **ONE MAP, NOT TWO:** `src/lib/lift-slots.ts` (no imports) holds the variant→slot map; the
      server's `computeE1rmBand` and the client's `fold-lift-slots.ts` both read it — the
      `tracked-max-lifts.ts` precedent, for the reason that file records.
      **FIXTURES, BOTH DIRECTIONS:** 7 new in
      `_shared/state-trend/e1rm-band-slot-aggregation.test.ts` (baseline case unchanged at 0.750; the
      trap-bar case now 0.750; an explicit assertion that it is NOT 0.833; slot takes its most recent
      reading; trap-bar-only athlete unaffected; other slots untouched; the no-baseline fallback
      aggregates too). **AND the existing fixture that PINNED the fault** —
      `tracked-max-lifts.test.ts`, "a logged variant moves the dot on unchanged strength" — was
      re-pointed at the fix and back-annotated, keeping 0.833 in the failure message so a regression
      fails with the history in front of it. 33 fixtures green.
      ⛔ **DEPLOY CLOSURE — 27 FUNCTIONS.** ⚠️ `docs/INVENTORY.md` §1 carries NO ROW for
      `_shared/state-trend/*`; its per-file table covers `_shared/standing-plan/` only. Computed with
      the same transitive walker the generator uses (`scripts/inventory-lib.ts`), against
      `state-trend/strength.ts` AND `src/lib/lift-slots.ts` — both return the identical set, which is
      also the set INVENTORY already documents for `_shared/strength-grid/` and `src/lib/strength-gear.ts`:
      `adapt-plan` · `analyze-cycling-workout` · `analyze-running-workout` · `arc-setup-chat` · `coach` ·
      `complete-race` · `compute-adaptation-metrics` · `compute-snapshot` · `compute-workout-analysis` ·
      `course-detail` · `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` ·
      `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` · `generate-triathlon-plan` ·
      `get-arc-context` · `import-strava-history` · `learn-fitness-profile` · `materialize-plan` ·
      `planning-context` · `refresh-goal-race-projections` · `rematerialize-standing-block` ·
      `strava-webhook` · `workout-detail`
      ⚠️ Regenerate `INVENTORY.md` (`npm run inventory:write`) when this ships — it will not gain a
      state-trend row on its own, since the generator only enumerates `standing-plan/` per file.
- [ ] 2b-server-original. ⛔⛔ **THE STRENGTH DOT IS INFLATED FOR ANY ATHLETE WHO LOGS BOTH DEADLIFT VERSIONS.**
      `PRIMARY_LIFTS` (`_shared/state-trend/strength.ts:71`) contains `trap_bar_deadlift`, and
      `buildStrengthBaselines` gives it the SAME baseline as `deadlift`. `computeE1rmBand` averages
      one ratio per canonical, so the deadlift slot is counted TWICE.
      **The file's own comment carries the measurement:** squat + deadlift → dot **0.750**;
      squat + deadlift + trap bar → dot **0.833**. Eight points, because a variant was logged rather
      than because anything got stronger. It has been a known-unmade product call since Step 7.
      ⚠️ Michael's 2b ruling ("the four slots aggregate their variants") IS the answer this was
      waiting for — but applying it means editing `PRIMARY_LIFTS`, which is a SERVER change, moves a
      number on screen, and needs the importers redeployed. Out of scope for a client-only round.
      **The display fold shipped above does NOT fix this.** Anyone reading the dot is still reading
      the inflated one.
- [ ] 2b-original. **Trap Bar Deadlift is a fifth lift card**, with its own E1RM (135) and BEST (150), sitting
      directly under Deadlift (180). A variant aggregating into its slot has been ruled before.
      ⚠️ **Michael's ruling wanted** — is a trap bar its own lift on this screen or part of the
      deadlift?
- [ ] 2c. **Every movement pattern reads `0 heavy`** — hinge, row, push, squat, overhead press — in a
      week that is the two tests. Verify whether zero is correct for a test week and simply should
      not print, or whether the test sets are failing to count as heavy.
- [ ] 2d. **NEXT lists today.** Today is Tue 9/1; the first row is *"Tue, 9/1 Test: Lower"*.
- [ ] 2e. **"Holding" on the run row** is the known unexplained verdict (Q-289) — it is stated for
      both a genuinely flat number and a suppressed one. If 1b removes the row this dies with it.
- [ ] 2f. **The easy-run card's own line disagrees with its headline.** The number is 1.330 and the
      line's last point drops hard, while the copy says to watch the line over weeks. Check the
      headline number is the same series the line draws.

- [ ] 2g. **THE STRENGTH LINE IS TOO FAST AND IT OVER-PROMISES.** Raised by Michael 2026-09-01.
      ⚠️ **NOT A BUG, AND THE NUMBER IS NOT WRONG.** Do not re-file this as a defect.
      An estimated 1RM moves session to session on sleep, food and recovery, and will not rise every
      session on a correctly-run programme. The field's own guidance is to read it week-to-week and
      longer — it is a trend instrument, not a reading. Our line is ONE POINT PER ISO WEEK
      (`liftSeriesFromExerciseLog`, `_shared/state-trend/assemble.ts`), so every normal fluctuation
      draws as a visible dip and invites *"I went backwards"* on a week when nothing was wrong.
      **The fix is to slow it down** — wider points, or a band rather than a point per week.
      ⛔ **THE SHAPE IS A DESIGN DECISION AND IT IS MICHAEL'S. Do not pick one.**

---

## ⛔⛔ A FINDING ABOUT THE TOOLING ITSELF — `INVENTORY.md` §1 DOES NOT COVER `state-trend/`

**This is not a footnote. The generated deploy closure this project relies on has a hole in it, and
the hole is in front of a directory that fans out to 27 edge functions.**

`docs/INVENTORY.md` §1 is generated (`scripts/inventory-lib.ts`) and its per-file table enumerates
**`_shared/standing-plan/` ONLY** — `spFiles` is read from that one directory. Everything else in
`_shared` is covered by two hand-named folder markers (`strength-grid/`, `strength-gear.ts`).
**`_shared/state-trend/` appears in neither.** So a session that edits `state-trend/strength.ts`,
does the right thing, and consults the generated closure gets **no row and no warning** — the
document simply has nothing to say, which reads exactly like "nothing to deploy".

⚠️ **THIS ARC NEARLY TOOK THAT PATH.** The closure for 2b-server was computed by running the
generator's own transitive walker by hand against `state-trend/strength.ts` and `src/lib/lift-slots.ts`.
Both return the SAME 27 functions the file already documents for `_shared/strength-grid/`. Had the
absent row been read as "no importers", the change would have been pushed and stranded — the exact
17-functions-for-a-month failure `CLAUDE.md` opens with.

**THE FIX IS SMALL AND IS NOT DONE:** `render()` in `scripts/inventory-lib.ts` should enumerate the
files of `_shared/state-trend/` the same way it enumerates `_shared/standing-plan/`, or the closure
table should be driven off every `_shared` subdirectory rather than one hardcoded path. Not built —
it is tooling, not this arc, and it wants its own change so it is reviewed as one.

---

## ⛔ SERVER-SIDE LEFTOVERS FROM ROUND 1 — one list, so the close-out does not scatter them

Every item in Round 1 was CLIENT-ONLY. These are the server halves that were deliberately not
touched. None of them is done; none was quietly tolerated.

- [x] S1. **DONE 2026-09-01 — see 2b-server.** Fixed by aggregating per SLOT inside
      `computeE1rmBand`, NOT by narrowing `PRIMARY_LIFTS` (which would have lost the trap bar's
      record and session count from the card). ⛔ Needs the 27-function deploy listed under 2b-server.
- [ ] S2. **`LIFT_DISPLAY` (`coach/index.ts:2479`) is a second lift-name map** and still emits
      `squat: 'Squat'` in the payload, against `canonicalDisplayName`'s "Back Squat". The client now
      reads `canonicalDisplayName` and ignores it (1d), so nothing renders the wrong name — but the
      duplicate map is still in the payload and still available for the next surface to read.
- [ ] S3. **`src/lib/strength-read.ts` and the `me_history_v1` payload field are unrendered** since
      1a deleted their only consumer. Bannered, not retired. Retiring `me_history_v1` is a payload
      contract change.
- [ ] S4. **`RunFitnessRow` (~330 lines) is unreachable** since 1b. Bannered, not deleted. It holds
      the measured heat cost (D-346), the conditions caption, the ⓘ definition and the Q-179 posture
      sentence — content that exists nowhere else. Retiring it is a product call.

---

## ROUND 3 — THE ATHLETE OWNS THE ORDER. Ruled by Michael 2026-09-01.

⛔ **AFTER rounds 1 and 2, never instead of them.** A moveable block lets one athlete hide a
duplicate; it does not stop the screen drawing the same lift twice for everyone who never opens the
settings.

⛔ **AND IT FORBIDS CROSS-BLOCK GATING.** The RUN row currently stands down when the run efficiency
cards cover it — one block reading another block's presence. If either can be hidden, that rule can
leave the athlete with NEITHER. **Round 1b removes the need for the gate; the gate must be gone
before reordering ships.** No block may read whether another block is rendered.

- [ ] 3a. Whole blocks only — drag to reorder, tap to hide, reset to default. No reordering INSIDE a
      block.
- [ ] 3.5b. The order persists per athlete. Field pattern: Garmin Connect and TrainingPeaks dashboards.
- [ ] 3.5c. **The load block is not hideable.** It is the only thing on the screen that says whether the
      athlete is digging a hole.
- [ ] 3.5d. ⛔ **This REPLACES the old "decide the permanent order" item.** What survives of it is
      choosing a good DEFAULT order — now / trends / next, one block per sport inside trends — which
      is a cheaper argument because it is no longer permanent.

---

## ROUND 3.5 — LAYOUT, WHAT ORDERING DOES NOT FIX.

- [ ] 3.5a. **The default order wants three blocks: NOW, TRENDS, NEXT — one component each, one block per
      sport inside TRENDS.** Today the strength trends are split across two places with the endurance
      cards between them, and the per-sport rows are a third shape again.
- [ ] 3b. **Orphans:** the bare *"STANDARD FOCUS"* label alone at the bottom of the scroll, the
      stray chevron beside BODY, and the empty band under *TODAY* at the top of every screenshot.
- [ ] 3c. **The SWIM block sits between the bike and NEXT** with three counts and no read.
      ⛔ Swim stays minimal — this is placement, not a feature.
- [ ] 3d. **Every chart states a different window in a different phrase:** *"10 weeks"*,
      *"10 weeks of readings"*, *"last 11 weeks · recent 6 in color · tap to expand"*,
      *"last 18 weeks · recent 6 weeks in color"*. One rule, one phrasing.
- [ ] 3.5e. **Two cards say "tap to expand" and two do not.** Same card family.

---

## ROUND 4 — COPY.

- [ ] 4a. ⛔ **"his range is 8-12 sets a muscle a week"** and **"his range is 4-6 reps above 90% and
      15-20 at 70-85%, per pattern"** — *his* with no antecedent anywhere on the screen. Name the
      source or drop the possessive.
- [ ] 4b. **Raw session labels reach the athlete:** *"DE: Upper"*, *"DE: Lower"*, *"Test: Upper"*.
      The logger translates these to plain words before an athlete reads them; this screen does not.
      ⚠️ The translation is deliberate and bro-friendly — do NOT solve it by showing the token
      everywhere.
- [ ] 4c. **The BODY paragraph runs on and drops its full stops:** *"About as hard as usual — you
      rated 5.0 of 10 avg vs 4.7 typical Soreness normal for you: 1.0 of 7. Logged on 7 sessions."*
- [ ] 4d. **"WK 1" and "Standard Focus · Week 1 of 12." say the same thing twice**, and the second
      carries a trailing full stop no other heading has.
- [ ] 4e. **The same 20-word caution is printed under all three efficiency cards** —
      *"one session doesn't tell you much — a hot day or a hilly route moves this more than your
      fitness does. watch the line over a few weeks."* Say it once for the group.
- [ ] 4f. **Mixed case across headings** — `LOAD`, `BODY`, `THIS WEEK'S LIFTING` in caps against
      *"this week · planned vs actual"* and *"trends · the arc behind this week"* in lower case.

---

## CARRIED FROM THE DOCS — not visible in these screenshots, still open

- [ ] 5a. **Long-run and quality-run efficiency trends** are computed per session-type group and only
      partly drawn. (The screenshots now show easy + quality, so this may be partly closed — verify.)
- [ ] 5b. **Accessory volume** is computed and reaches no screen.
- [ ] 5c. **The bike has no session-type split** — every ride is one group.
- [ ] 5d. **Session intent never reaches this screen as a heading**, only as behaviour.
- [ ] 5e. **The lighter / taper week OFFER** belongs on this screen — ruled 2026-09-01, nothing built.

---

## RULINGS

1. ✅ **1a — RULED 2026-09-01.** The STRENGTH block survives; "is the bar going up" goes. See 1a.
2. ✅ **2b — RULED 2026-09-01. FOLD THE TRAP BAR INTO THE DEADLIFT; the card names the version that
   set the number.** Sourced: `SOURCE-viada-hybrid-athlete.md:130` lists deadlift, paused deadlift,
   sumo deadlift and trap bar deadlift as four movements filling ONE primary-hinge slot. The app
   already half-folds it — `CALIBRATION_REF_BY_CANONICAL` maps `trap_bar_deadlift` → `deadlift`, so
   the prescribed working weight already comes off the deadlift training max while the card shows its
   own number. The comparability objection (a trap bar max is not a straight bar max) does not apply
   to an athlete whose entire history is one implement, which is Michael's case.
   ⚠️ **Display/slot level only**, the way front squat → squat already works. Never rewrite stored
   history or canonical names to achieve it.
   ⛔ **AND TRACE FIRST — THIS MAY NOT BE A DUPLICATE.** The screen shows Deadlift 180 over 3 sessions
   AND Trap Bar Deadlift 135 over 1. If those 3 were also pulled on a trap bar and merely logged under
   a plain "Deadlift" name, the split is a NAMING artefact and the fold corrects a WRONG NUMBER rather
   than removing a redundant card. Establish which before building.

---

## ROUND 0 — CLOSED 2026-09-01. Not committed, not pushed, not deployed, not seen on a device.

`StateTab.tsx` 2,078 → **912 lines**. Every inline block is now a named component with its comments
carried across verbatim. Build green; 14 targeted tests pass; the 4 remaining `tsc` errors were
confirmed pre-existing on `main` by stashing and re-running.
⚠️ **One loosening was reported and REVERSED by ruling:** `StateBodyBlock`'s `visibleSignals` was
typed `Array<any>`, which suppressed two `as_of_date` errors rather than fixing them. Ordered typed
properly before Round 1 lands — a suppressed type error on this screen is the silent-absent-branch
failure this codebase keeps paying for.
