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
- [ ] 1c-round3. ⛔ **RE-FILED 2026-09-01 — THE QUESTION AS WRITTEN WAS THE WRONG ONE.** The item asked
      whether the two bike surfaces show the same METRIC. They do not, and that trace stands. **But
      Michael's actual complaint is that his BIKE APPEARS IN TWO PLACES on one screen** — a
      CONSOLIDATION question, not a duplication one. Round 3 item: **one block per sport, and that
      block owns everything about that sport** — efficiency, load, chart, and one line of meaning.
      Not built; it belongs to the Round 3 design pass Michael approves before anything is written.
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

- [x] 2a. **DONE 2026-09-01. Client-only, one file. Same class of fault as 1d, fixed with the same
      existing mechanism — no new map.**
      **CAUSE, TRACED:** `unpriced` is built from the RAW logged exercise name —
      `_shared/accessory-dosing/performed-ledger.ts:169`, `unpriced.add(ex.name)` into a `Set`. A Set
      is case-sensitive on strings, so "Ab Wheel Rollout" and "ab wheel rollout" are two members and
      the sentence named one movement twice. Not a display-name-vs-raw-name collision as the item
      guessed — two raw spellings.
      **FIX:** `ViadaWeekCard` canonicalises, de-duplicates on the canonical key, and renders
      `canonicalDisplayName`. Verified by running the real functions: "Ab Wheel Rollout",
      "ab wheel rollout", "Ab Wheel Rollouts" and "AB WHEEL ROLLOUT" all → `ab_rollout` → "Ab Rollout".
      ⚠️ **THE WORD ON SCREEN CHANGES:** it will read **"Ab Rollout"**, not "Ab Wheel Rollout" — that is
      the canonical label the rest of the screen uses, and using it is the point of the fix.
      ⚠️ The render gate now tests the DEDUPED list, so a list that collapses to nothing cannot draw an
      empty sentence.
      ⚠️ **FIXED AT THE EDGE, NOT THE SOURCE, DELIBERATELY.** `performed-ledger.ts` is server code
      inside the 27-function closure and this round is client-only. The server still emits both
      spellings — filed under the server-side leftovers as S5.
- [ ] 2a-original. ⛔ **The same movement printed twice in one sentence, in two cases:**
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
- [x] 2b-fold-bug. **FOUND LIVE AND FIXED 2026-09-01 (evening). Client-only, one file
      (`src/lib/fold-lift-slots.ts`). NOT committed, NOT pushed.**
      **ON SCREEN:** one Deadlift card, E1RM **135**, BEST **180**, **no chart, no all-out line**; the
      other three cards had both. Aug 25 (180) and Aug 28 (135) are the SAME ISO week, and the
      server's rule is one point per ISO week, the heaviest — so the slot's reading was 180.
      **CAUSE, CODE-TRACED:** the fold picked a REPRESENTATIVE row by most-recent reading and spread
      its fields whole. The trap-bar row is not a tracked-max lift, so on the payload it carries NO
      `series` and NO `lastAllOut` (`assemble.ts`: chart series only for `isTrackedMaxLift`); copying
      it whole gave the wrong headline, an empty chart and no all-out line — one mistake, three
      symptoms. `latestE1rm` was never redefined; it was fed half a week.
      **FIX:** merge the SERIES, not the cards. The slot's readings are unioned and the same
      Monday-based ISO-week-heaviest rule is applied to the union (week key copied from `assemble.ts`
      so the boundary cannot differ). Headline, chart, count, as-of and PR flag all read off the merged
      series; the all-out line is whichever version's is more recent.
      ⚠️ **WHAT THE CLIENT CAN AND CANNOT MERGE, STATED:** a variant row carries ONE reading
      (`latestE1rm` at `newestAgeDays`), dated off the slot's own as-of (last series date +
      `newestAgeDays`). Its older weeks are not on the payload and cannot be drawn. Drawing them is a
      server merge per slot inside `assemble.ts` (27-function closure) — filed as **2b-fold-server**,
      not done. With no series on either row (trap-bar-only athlete, or fewer than two deadlift weeks)
      the fold falls back to the previous most-recent-row behaviour.
      **THE SHORTCUT'S OTHER COSTS, CHECKED:** session count was the two rows' counts SUMMED, so a
      same-week pair counted as two sessions where the server counts one weekly point — now the
      merged weekly points in the window (3 on his screen, not 4). As-of was the representative's age
      — now the slot's freshest reading (unchanged in effect: 4 days). The range caption does not exist
      on this card (`range` is never rendered for strength, D-420). PR flag was the representative's —
      now the flag of the row whose reading became the slot's latest, withdrawn only if the record
      beats it (his 180 stays a PR).
      **FIXTURES:** 13 green, incl. the exact live case (same week, lighter logged later → 180, chart
      draws with 3 points, all-out line kept, count 3, as-of 4d, PR kept), order-of-arrival
      independence, the cross-week drop still correct (135 owns a later week, chart gains the point,
      "best" explains it), a heavier same-week variant winning its week, and the no-series fallback.
      Build green, eslint clean, no new type errors.
- [ ] 2b-fold-server. **Merge variant readings per slot on the SERVER** (`assemble.ts`, before
      `liftLatest` / `strengthChartByCanonical` / `lastAllOut`), so the chart carries the variant's
      full history rather than its latest reading only. 27-function deploy. Not started.
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
      ⛔ **SUPERSEDED — FIXED 2026-09-01.** The generator no longer hand-names folders: §1 is driven
      off the bundles themselves, `_shared/state-trend/` now prints with its 27, and 38 folders are
      listed where there was 1. §1 also now states the rule outright — a touched file with no row is
      a GENERATOR BUG, not a no-deploy.
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
- [x] 2c-SERVER. ⛔⛔ **BUILT 2026-09-01. SERVER + CLIENT. NEEDS A DEPLOY (27) — see the closure below.**
      Michael: *"cant we just flag tests? feels like we are over complicating this."* Yes — the flag
      existed on the plan row and simply never reached the screen. It does now.
      **THE FLAG:** `ViadaWeekPerformed.patternBandApplies` — false when a day inside the card's own
      seven-day window is a test day. The card is TOLD the band does not apply; it works nothing out.
      Asked of the WINDOW, not of "the current week", so the flag and the numbers beside it always
      describe the same seven days — and it survives a plan whose test is not week 1, or one with more
      than one test week, because it is a date-set intersection.
      **ONE DEFINITION:** resolved in `compute-snapshot` from `isTestWeek()`
      (`standing-plan/working-number.ts`) — the composer's own function, the same constant it tags the
      test session with. ⛔ No week number is compared to a literal anywhere, client or server.
      ⛔ **RESOLVED IN THE CALLER, NOT IMPORTED INTO THE SPINE, AND THAT WAS THE CALL.** Importing
      `working-number.ts` into `state-trend/assemble.ts` would have widened ITS closure from 3
      functions to 27 — taxing every future edit to the pretest arithmetic forever to save one
      parameter today. `compute-snapshot` already holds `weekByDate` and already imports
      `standing-plan/`, so resolving there widens that closure by ONE (3 → 4: coach ·
      **compute-snapshot** · generate-strength-plan · rematerialize-standing-block).
      ⛔ **A FLAG, NOT `perPattern: []`** (Michael's ruling, over the simpler option I put to him).
      Emptiness cannot distinguish "no band applies" from "no data", and a card inferring meaning from
      an absent field taking the wrong branch with no error is this screen's recurring failure. The
      flag states what is true; the numbers are byte-identical either way (pinned by fixture).
      **THE WHOLE ROW GOES, NOT THE ZERO HALF** — `ViadaWeekCard` gates on
      `perPattern.length > 0 && patternBandApplies !== false`. Undefined means the band applies, so an
      old payload keeps today's behaviour rather than silently hiding the row.
      **PAYLOAD VERSION BUMPED 175 → 176**, with a note in the file's own convention recording that a
      cached row would otherwise serve a `display` object with no flag and pass the
      `cachedVer >= COACH_PAYLOAD_VERSION` gate — the same trap v175 hit on `perLift` in this same
      object. ⛔ Without the bump the fix lands nowhere.
      **FIXTURES, BOTH DIRECTIONS (5, all green):** no test dates → band applies; a test date inside
      the window → band does not apply; a test date OUTSIDE the window → still applies; an empty list
      is not a suppression; and `perPattern` / `perMuscle` byte-identical either way.
- [x] 2c-BLOCKED-SERVER-original. ⛔⛔ **RULED BY MICHAEL 2026-09-01 — the trace that established there
      was no honest client-side route.**
      The ruling is right and the reason is settled: the zero does NOT resolve once the sessions are
      logged — the pretest tops out at 0.8625 and the heavy band opens at 0.90, so the row reads
      `0 heavy` for the whole test week no matter what the athlete does. A number that can never be
      non-zero in a phase should not print in that phase. **Suppress the WHOLE heavy/speed band row for
      that week**, not the zero half — "16 speed" alone with the heavy count silently missing is worse.
      ⛔ **WHY IT CANNOT BE DONE ON THE CLIENT — every route checked:**
      · `ViadaWeekPerformed` (`assemble.ts:750-766`) carries `since`, `perMuscle`, `belowFloor`,
        `perSession`, `perPattern`, `unpriced`. **No phase, no week index, no test flag.**
      · `config.test_week = TEST_WEEK_INDEX` IS persisted on the plan row (`plan-row.ts:329`) but is
        **not forwarded to the client** in any payload.
      · The composer TAGS the test session `test_week`, and that tag does reach the client — but only
        on a scheduled workout (`StrengthLogger.tsx:1903`). State does not fetch planned workouts.
      · `block.is_measurement_week` / `block.top_set_pct` are only populated `if (cycle)`
        (`block-identity.ts:398-412`) — the leader/anchor cycle machinery — and describe a 95% amrap,
        not the 86.25% pretest. Null for a standing block.
      · `week.intent` has no value meaning "test" for a standing block (`plan-phase.ts:134-153`).
      **The only client-side route left is `week.index === 1`, i.e. the client hardcoding
      `TEST_WEEK_INDEX`. That is a second source of truth about the block's shape and is refused** —
      it duplicates a server constant and would be wrong for any plan whose test is not week 1.
      **THE SERVER FIX IS SMALL AND WANTS A RULING ON SHAPE:** either forward the already-persisted
      `test_week` on the block payload, or (better, because it is the card's own contract) add a
      resolved flag to `ViadaWeekPerformed` — e.g. the phase suppresses the band. ⛔ Not chosen, not
      built. Inside the 27-function deploy closure.
- [x] 2c. **TRACED 2026-09-01 — THE ZERO IS ARITHMETICALLY CORRECT. NOTHING BUILT; THE DISPLAY CALL
      IS MICHAEL'S.** ⛔ Do not re-file this as a counting bug.
      **THE NUMBERS, ALL TRACED:** the heavy band is `pct >= 0.90` and the velocity band is
      `0.70 <= pct <= 0.85` (`performed-ledger.ts:112-113`). The p215 pretest ramps in three steps at
      **0.75 / 0.825 / 0.8625** of the predicted max (`working-number.ts:118-120`), the last taken for
      max clean reps. So in a test week:
      · steps 1 and 2 (0.75, 0.825) land INSIDE the velocity band — which is why every pattern appears
        on the card at all;
      · the measured top set (0.8625) lands in the **deliberately unnamed 85–90% gap**. The ledger's own
        comment: *"A SET BETWEEN 85% AND 90% COUNTS TO NEITHER, AND THAT IS HIS PAGE, NOT AN OVERSIGHT.
        p084 names two bands and leaves the gap between them unnamed; filling it would be ours."*
      **So the test sets are not "failing to count as heavy" — they legitimately fall outside both
      bands, by the source's own definition.** Every pattern reading `0 heavy` in week 1 is the
      arithmetic working.
      ⚠️ **IT IS STILL MISLEADING, AND THAT IS THE REAL ITEM.** The card prints `0 heavy` in the one
      week whose entire purpose was the athlete's most maximal sets of the block. Suppressing the heavy
      count for a test week is a DISPLAY decision (and needs the phase reaching this card, which it does
      not today). Not built — Michael's call.
- [ ] 2c-original. **Every movement pattern reads `0 heavy`** — hinge, row, push, squat, overhead press — in a
      week that is the two tests. Verify whether zero is correct for a test week and simply should
      not print, or whether the test sets are failing to count as heavy.
- [x] 2d. **RULED AND BUILT 2026-09-01. Client-only.** Michael: *"I dont think we need today
      reflected on state screen or next — its a broader picture."* Today's session belongs to the day
      screen; State is the arc around it. NEXT now excludes today outright.
      ⛔ **THE SERVER'S FIELD WAS NOT CHANGED, AND THAT WAS THE CALL.** `key_sessions_remaining` is
      correct as documented — today is listed BECAUSE it is not done — and the coach reads the SAME
      field for more than this row: `hasUpcomingLong` (`coach/index.ts:739`) uses it to write race-week
      guidance. Moving the exclusion into that filter would have silently changed race-week copy to
      satisfy a State-screen ruling. `StateTab` is the only client reader of the field (checked), so
      the narrowing lives on the one surface it was ruled for. This is a display scope, not a second
      definition of "remaining".
      ⚠️ **LOCAL DATE, NOT UTC.** `toISOString().slice(0,10)` is tomorrow's date for anyone west of UTC
      in the evening and would have dropped tomorrow's session too. Uses `formatLocalDate`, the repo's
      own helper.
      ⚠️ **THE ROW KEEPS ITS NAME.** "NEXT" was only inaccurate because today was in it. This closes
      the Round 4 rename item rather than copy closing it.
      ⚠️ The earlier trace below stands as the reason the SERVER was left alone — it was overruled on
      the display question, not on the mechanism.
- [x] 2d-trace. **TRACED 2026-09-01 — the server behaviour is INTENTIONAL AND DOCUMENTED.**
      `coach/index.ts:1200` filters `date > asOfDate || (date === asOfDate && !isPlannedCompleted(r))`,
      and `coach/types.ts:221` states the contract in words: *"from as_of_date (inclusive), excluding
      completed planned rows."* Today's session is listed BECAUSE it is not done yet; it drops off the
      moment it is logged.
      ⛔ **DO NOT "FIX" THIS BY EXCLUDING TODAY** — that would hide an unfinished session from the one
      row that says what is left, which is a real regression in exchange for a cosmetic one.
      ⚠️ What is actually wrong is the WORD: "NEXT" reads as "after today". That is a copy call
      (Round 4), not a data change.
- [ ] 2d-original. **NEXT lists today.** Today is Tue 9/1; the first row is *"Tue, 9/1 Test: Lower"*.
- [x] 2e. **CLOSED BY 1b, 2026-09-01.** The row that carried the unexplained "Holding" verdict is
      deleted — the run card no longer exists in the Fitness section. Nothing to build.
- [ ] 2e-original. **"Holding" on the run row** is the known unexplained verdict (Q-289) — it is stated for
      both a genuinely flat number and a suppressed one. If 1b removes the row this dies with it.
- [x] 2f. **TRACED 2026-09-01 — SAME SERIES, NO DISAGREEMENT POSSIBLE. NOTHING BUILT.**
      In `SpineCard` (`StrengthReadCards.tsx:112-155`) the headline is `latest.efficiency` where
      `latest = pts[pts.length - 1]`, and the line is
      `pts.map(p => ({ date: p.date, value: p.efficiency }))` fed to `DatedChart`. **Both read
      `p.efficiency` off the same `pts` array — the headline IS the line's last point.**
      ⚠️ And they cannot diverge even at the edge: the headline block is gated on
      `latest.efficiency != null`, so when the newest point has no efficiency the number is not drawn
      at all rather than falling back to an older one.
      The card reads as a contradiction because a line ending low sits beside a headline number, but it
      is the same value stated twice — which is what the card's own "watch the line over a few weeks"
      copy is there to frame.
- [ ] 2f-original. **The easy-run card's own line disagrees with its headline.** The number is 1.330 and the
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
- [ ] S5. **`performed-ledger.ts` still emits duplicate raw spellings in `unpriced`** — it adds
      `ex.name` verbatim to a case-sensitive `Set` (`:169`). The client now canonicalises and
      de-duplicates at the edge (2a), so nothing renders twice, but the payload still carries both.
      Canonicalising at the source is a server change inside the 27-function closure.
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
- [x] 3-lift-1235. **DONE 2026-09-01. Client-only, one file (`ViadaWeekCard.tsx`). No server change,
      no deploy.** Items 1, 2, 3 and 5 of the SPEC addendum (approved by Michael). The block's order was
      inverted; it now reads: session cost (leads) → coverage → dose per muscle against the target →
      pattern rows and the unpriced note as detail.
      ⛔ **THE FAULT WAS COMPUTED AND UNRENDERED, TWICE OVER.** The server already sent a verdict per
      session (`recovers` / `above_recovers` / `costly`, `accessory-dosing/dose.ts:136`) and per muscle
      (`below_floor` / `light` / `solid` / `above_solid` / `overreaching` / `over_max`, `dose.ts:101`),
      and the card read neither — it printed bare numbers. Both are now rendered as display words
      mapped at the edge; **no threshold on the client**, and a verdict value the map does not know
      prints nothing rather than a guess.
      ⛔ **ONE VERDICT COVERS SETS AND EFFECTIVE REPS — pinned in the file header.** Effective reps are
      sets × 4 by his formula (`effectiveRepsFor`), so 32–48 is 8–12 restated; a second comparison
      would be a second copy of the same band. Both targets print beside the one word.
      **The figures on screen** (8–12, 18–20, 32–48, 6–8, 14) are read from `dose.ts` constants through
      the `@shared` alias — the same file the server's verdicts are cut on, already in the client bundle
      via `NonRaceBuilder` → `accessory-dosing/index.ts`. Nothing retyped.
      ⚠️ **COPY NOTE:** the lead line says "next day about normal" / "costs up to three days" for the
      two brackets he prices, and only "over 8" for the 9–13 gap, because the book gives no recovery
      figure for it. "his range is…" phrasing is unchanged pending Round 4.
      ⛔ **`week_ledger_v1` IS THE PLANNED OBJECT — SETTLED, do not re-open.** Its header: "it computes
      nothing — every number is lifted verbatim off a week the composer already built"; stored per week
      index on the plan's config, twelve identical weeks. The performed object is
      `display.viadaWeek`, counted off logged sets. Nothing in this addendum reads `week_ledger_v1`.
      Build green, eslint clean on the file, no type errors in the file (project baseline unchanged).
      NOT committed, NOT pushed, NOT seen on a device.
- [x] 3-lift-4. **DONE 2026-09-01. SERVER + CLIENT. NEEDS A DEPLOY (27 functions) — closure below.**
      ITEM 4 — §B5's change rule. `display.viadaWeek` gains `weekChange`: this rolling seven-day
      window's lifting buckets against the seven days immediately before it, listing ONLY the buckets
      that moved by MORE than 10% (`WEEK_CHANGE_FLAG_PCT`, new in `accessory-dosing/dose.ts`, the
      book's number with its citation). Resolved in `buildViadaWeekPerformed`
      (`state-trend/assemble.ts`) off the same 40 logged sessions the builder already receives — **no
      new query, no new column.** The card prints one line: *"against the seven days before that:
      chest sets +18%, hinge speed reps −12%"* (wording approved). Nothing prints when nothing moved.
      ⛔ **ONE TIER.** "Ideally ≤5%" is not a second flag — stated in the constant's comment. Strictly
      over the line: 10 → 11 sets (+10%) is not listed; 10 → 12 is. Pinned.
      ⛔ **A STATED FLAG AGAIN.** `comparable: false` when the prior seven days hold no logged work
      (first week, week off) — distinct from `moved: []` (a base existed, nothing crossed the line).
      Both render silence; the server keeps them apart.
      **THE BUCKETS:** total work sets (§B5 bucket 4) · sets per muscle (bucket 5 — effective reps are
      sets × 4, same percentage, ONE bucket) · p084's heavy and speed reps per pattern. A bucket with
      no prior work is never listed (no base, no percentage); one dropped to nothing lists at −100.
      ⛔ Pattern buckets are OMITTED when EITHER window contains a test day — the heavy count is
      structurally zero there and would flag every pattern (same reasoning as `patternBandApplies`).
      ⛔ **"THE SEVEN DAYS BEFORE THAT", NEVER "LAST WEEK"** — both windows are rolling; the prior
      window's bounds ride on the payload so any surface can say exactly what it compared.
      ⚠️ Forty sessions cover fourteen days for any athlete this app is for; more than twenty lifting
      sessions a week would produce a falsely empty prior window. Stated in the code, not guarded.
      **PAYLOAD VERSION 176 → 177**, note in the file's convention naming the cached-row trap.
      **FIXTURES, BOTH DIRECTIONS (12, all green):** server — over the line lists with its percentage
      (2 → 4 sets = +100 on work sets, on every muscle, and on hinge speed reps 10 → 20); nothing
      moved → comparable + empty; no prior work → not comparable; +10% not listed, +20% listed;
      dropped-to-nothing = −100; a test day in either window drops the pattern buckets only; and the
      CURRENT window's numbers are byte-identical with and without a prior window. Client — the line's
      wording is a pure function (`src/lib/week-change-line.ts`, no React) so the silence is pinned:
      nothing moved → null, not comparable → null, old payload → null. State-trend + accessory-dosing
      suites: 315 passed.
      **CLIENT HALF:** `ViadaWeekCard.tsx` renders the line between the dose caption and the pattern
      rows. **The possessive is gone from every line written today** ("in range" / "over range" /
      "past the maximum"; the caption reads "8–12 sets a muscle a week — 32–48 effective reps, about 4
      a set. 18–20 borders overreaching."). The pre-existing "his range is 4–6 reps…" pattern caption
      is untouched — Round 4.
      ⛔ **DEPLOY CLOSURE — 27 FUNCTIONS, read from the generated `INVENTORY.md`** (rows for
      `assemble.ts`, `dose.ts`, `performed-ledger.ts` all → the same 27; `coach` is among them and is
      also the payload-version file): `adapt-plan` · `analyze-cycling-workout` ·
      `analyze-running-workout` · `arc-setup-chat` · `coach` · `complete-race` ·
      `compute-adaptation-metrics` · `compute-snapshot` · `compute-workout-analysis` · `course-detail` ·
      `course-strategy` · `create-goal-and-materialize-plan` · `delete-plan` · `end-plan` ·
      `generate-combined-plan` · `generate-run-plan` · `generate-strength-plan` ·
      `generate-triathlon-plan` · `get-arc-context` · `import-strava-history` · `learn-fitness-profile` ·
      `materialize-plan` · `planning-context` · `refresh-goal-race-projections` ·
      `rematerialize-standing-block` · `strava-webhook` · `workout-detail`
      Build green, eslint clean, no type errors in the changed files. NOT committed, NOT pushed, NOT
      deployed, NOT seen on a device.

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
