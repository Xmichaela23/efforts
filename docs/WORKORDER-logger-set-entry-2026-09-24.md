# Work order — the strength logger's set entry, to Strong / Hevy standard (2026-09-24)

Michael, 2026-09-24, first session on the logger after years on StrongLifts: "do we have the right UI and
UX for logging reps and weights and RIR?" Four things, in this order. Field standard = Strong and Hevy
(memory: strength screens must feel familiar to Strong/Hevy lifters). No new athlete-facing copy except the
one word "Next" on the keypad.

## 1. The keypad flows: Next, not Save + Close

Today: tap reps → keypad → type → Save → Close → tap RIR → keypad → type → Save → Close → tap the check.
Strong: type → Next → type → Next → the set is done. Build:
- The keypad's confirm on a weight box is **Next** and opens the same set's reps; on reps, **Next** opens RIR;
  on RIR, the confirm commits and closes the keypad (the check stays a separate tap — it starts the rest
  timer and is the athlete's "done", as in both apps).
- No separate Close step after a commit. The sheet's drag-down / tap-outside still closes without saving.
- Where a box has no next (a bodyweight row with no weight box; a per-side row), Next skips to the next box
  that exists.
- `NumericKeypadSheet` (`confirmLabel`, `secondaryLabel`, `onConfirm`, `commitKeypad`, `keypadCtxRef` in
  `src/components/StrengthLogger.tsx` ~885 and ~6914) — trace every caller before changing the sheet's
  contract; the baseline-test and retest branches use the same sheet.

## 2. The check fills an empty box from its grey number

Today a set can be checked with an empty weight (Michael's Drag Curl set 1 went in as 10 reps, no weight, and
"previous" now reads "10 reps"). Strong fills an empty field from the placeholder on the check. Build:
- On the check, an empty weight / reps / RIR box takes the value its placeholder shows — the previous set's
  number, or the prescribed number where one is shown. A band placeholder ("6-12", "0 to 2") is not a
  number: an empty box under a band placeholder **blocks the check** and opens that box's keypad instead.
- Nothing is written that the athlete did not see on screen.

## 3. One copy of the target

Under every unlogged set the logger prints "target 6-12 · 0 to 2 in reserve" (`targetHint`, ~5621, ~6008).
The exercise header already prints "6-12 reps · 0 to 2 in reserve", and the boxes carry "6-12" / "0 to 2"
as placeholders. Strong and Hevy print the target once, in the box. Remove the per-set line. Keep the
header line (it also carries the tempo words the page prints) and the placeholders. Check what else the
line carried (`advanceNudge`, the ME "as many clean reps" hint, the test-day hint) and keep those where
they are their own line, not the target.

## 4. Plus and minus on weight and reps

Strong's keypad steps weight by a plate increment and reps by one. Build: on the keypad, a − / + pair; weight
steps by the athlete's smallest plate pair (the plate-math source the logger already uses: `bar-types.ts`,
the plate picker) — 5 lb / 2.5 kg default; reps and RIR step by 1. No new number that is not already the
plate math's. Field cite in the comment (Strong plate calculator help page, already cited in `bar-types.ts`).

## Rules
- Match the logger's ⛔/⚠️ comment idiom; trace the branch you touch and name it (the logger is a beast —
  standing-plan rows, the baseline test, the week-12 retest, accessories, bodyweight, assist, per-side and
  plyo rows all render through the same grid).
- No emojis. No clinical or judgmental copy. Nothing changes what is saved except §2's fill.
- Lint `src/` only. Run the logger tests and every `src` test that imports the logger or the keypad, three
  back-to-back runs. Build (`npm run build`) green.
- Do not commit.

## Report
Files changed; the keypad flow as built (box → Next → box → commit); what the check does on each empty-box
case; what the removed line carried and where each piece went; the step sizes and their source; test and
build results ×3; anything that did not survive contact and what you did instead.
