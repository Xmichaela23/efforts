# Book-language fix — what changed, for Michael to read before push (2026-09-18)

The plan: `docs/AUDIT-book-language-2026-09-18.md`.

**The rule applied to every line:**
- A training instruction prints the book's own words and numbers, with its page cited beside it in the code.
- Where a line had to be shorter, the book's words were cut down, never reworded.
- Where the book gives no words for something, nothing prints.
- Each prescription is written in one place, and every screen and every send reads that place.

**Not pushed. Not deployed. Not checked on a phone.**

## Where the before → after lists are

Read in this order. Where a line changed twice, the later section is what prints now.

1. `BOOK-LANGUAGE-FIX-strength-2026-09-18.md`
   - (a) every strength line, grouped by screen
   - "Pass 6": lines restored from the page photos
   - "Pass 7": every place that judges reserve reads p218's range
2. `BOOK-LANGUAGE-FIX-endurance-2026-09-18.md`
   - (a) every run, ride and swim line, and every line sent to Garmin, Intervals.icu/Zwift, the calendar and the plan download
   - (c) which p278 column the rides come from
3. `BOOK-LANGUAGE-FIX-round3-2026-09-18.md`
   - plan cards and builder
   - ride sessions on screen and on sends
   - the easy run's strides
   - "By feel" removed
   - test day
   - session titles

## Counts

Method:
- Six plans (Run + Ride + Strength, Run + Strength and Ride + Strength, each built with numbers on file and with a test week) were built from this code on a throwaway account.
- Every function in the chain ran from this code, not from the live server.
- Every line those plans print was compared with the page photos.
- The account was deleted, and all 44 tables that hold user data were checked and are empty for it.

"Notation only" = the page's words and numbers laid out in the app's row format (e.g. "0 to 2 in reserve" for the page's "(0 to 2 RIR)").

| distinct instruction lines | before | after |
|---|---|---|
| match the page | 2 | 107 |
| notation only | 29 | 78 |
| off the page | 93 | 4 |
| on no page | 48 | 9 |
| left for Michael (below), not counted as misses | 55 | 52 |

**The 34 prescriptions that printed in more than one place:**
- 24 print the same everywhere.
- 4 print the same numbers in two layouts: the page's sentence on Today, the builder and the logger header, and the row format on the logger card and the planned sheet.
- 1 still differs. The "@ VT1" rest shows a pace on screen and has no target on the watch. That is the first decision below.
- 5 do not appear in weeks 1–2 of these plans. In the code, each now has one owner.

**What is still off:**
- 4 ride lines print "under 173 W" where p239 says "@ VT1" or "easy spin". That is the same decision as the first one below.
- 9 lines are the live cues on the recording screen, which were not part of this work.

## Decisions for Michael (not changed)

1. **What an "@ VT1" or easy step shows.**
   - Today the app prints a heart rate (the Friel zone 2 formula) and a pace on run steps, and "under N W" on rides. The page prints "@ VT1" or "easy".
   - The words "VT1" stay off screen by an earlier rule.
   - The choice is:
     - keep the numbers
     - print the page's words
     - print nothing
2. **Target bands.**
   - A single page percentage is sent as a band: ±10% on watts (cited to TrainingPeaks), ±2% on run pace for work steps and ±6% for the rest (our numbers).
   - The watch needs a range.
   - A single percentage at or below 100% never goes over FTP, wherever it prints. This extends the sweet-spot limit to every such step (our choice, with a row in the sources list).
3. **Exercise how-to texts** (32 lines). They come from ExRx, NSCA, ACE or our own writing, not from the book.
4. **"sets of … ×"** — p231 writes "2 sets of 3 rounds of …". The grouped step line prints "2 sets of 3 × …". This line was approved earlier.
5. **Easy-run strides** are now p210's "2 × 100-meter strides (begin slow and accelerate to near full tilt)". They replace the six 30-second strides chosen on 2026-08-28, which were marked as ours. The easy run is now 30:00; it was 27:00.
6. **"On Zwift, turn ERG off." came off.** A search of commits and docs found no record of you approving that exact line.
7. **The Ride + Strength rides** now come from p278's Standard column: seven rides, long ride at level 2. The Deload column now applies only to the deload week. The "one ride fewer" choice is ours: 6 of 7.
8. **Warm-up sets and rest timers came off plan lifts.**
   - p139–140 give no loads and p78/p84 give no minutes.
   - The page's warm-up sentence and rest rule print instead.
9. **The weight cut the day after a hard run** (the p247 reduction, 3.5%) still applies on Run + Ride + Strength heavy lower days. Its sentence now prints only on Run + Strength, the program p247 describes.

## Guard

- Rule 7 is added to `scripts/check-estimate-provenance.mjs`. It fails the build when an instruction has no page cited in its own statement, the comment directly above it, its row's opening line or its row's `cite:` field.
- 281 lines are pinned word for word in `scripts/book-lines.pinned.json`. A reworded line, a new line or a line with no page turns the build red.
- The pins are rewritten only with `--write-book-pins`, after the words are approved.
- Tested: a reworded pinned line fails; a new line with no page fails.

## Checks

- Deno suite: 5545 pass, 5 fail. The same 5 fail on the untouched branch:
  - `run-threshold-test`
  - 2 in `anchor-resolver-lint`
  - 2 in `wizard-day-lock.lint`
- TypeScript: 305 errors, the same as the untouched branch.
- `vite build` passes.
- `node scripts/check-estimate-provenance.mjs` exits 0 (rules 0–7).
- No new relative import is missing `.ts`.

## Deploy list (39 functions that import changed code; nothing deployed)

adapt-plan, analyze-cycling-workout, analyze-running-workout, analyze-strength-workout, calendar-sync, coach,
complete-race, compute-facts, compute-session-boom, compute-snapshot, compute-workout-analysis,
compute-workout-summary, course-detail, course-strategy, course-upload, create-goal-and-materialize-plan,
delete-plan, endurance-checkpoint, export-data, generate-combined-plan, generate-strength-plan,
generate-triathlon-plan, get-arc-context, get-week, import-strava-history, ingest-phone-workout,
learn-fitness-profile, materialize-plan, planning-context, post-import-athlete-pipeline,
refresh-goal-race-projections, rematerialize-standing-block, send-workout-to-garmin, strava-webhook,
strength-test-session, swap-list, swap-session, validate-reschedule, workout-detail.

Plus the phone bundle.

After deploy:
- The plan-writer version is 9, so built plans are rewritten on their next refresh.
- The Garmin step text ("N W and up") and the Intervals.icu text line reaching Zwift can only be confirmed on a device.
