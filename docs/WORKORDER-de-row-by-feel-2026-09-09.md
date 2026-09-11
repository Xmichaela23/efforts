> **SHIPPED 2026-09-09/10.** Rebuild fix for rows without the marker: 70b28aea.

# Work order — No lift is priced off another lift; the DE row goes by feel (2026-09-09)

Michael, 2026-09-09: "never use ours" — no athlete-facing line or number that is not on a book page. The
DE Barbell Row's number is a guess off bench (80 percent of bench, then 70 percent of that) and no page
gives a ratio between lifts. It comes off. No new test: "kill the bb row test - go by feel and no pull up
test." The four tested lifts and week one are unchanged.

Rules that apply: the never-use-ours rule (memory feedback_never_use_ours_in_copy); every copy line gets
Michael's yes; every number cites a page in the code; no DB writes to Michael's data, throwaway accounts
only; docs/COPY-VOICE.md.

## The book

- p218: DE is 2 to 4 reps at 70 to 80 percent of the lift's own max, 3 to 4 in reserve, 4 to 6 sets.
- p214: a percentage needs a tested max on that lift ("testing your 5-rep max prior to the program").
- p219: reps in reserve defined. A row with no percentage is prescribed by its reps and reserve.
- No page relates one lift's max to another lift's.

## What exists

- `compose.ts`, the `derived` block (~line 1603): a DE row on a pattern with no tested lift (pull_upper)
  is priced off its catalogue entry's `primaryRef` at that entry's ratio. Gate: athlete has named
  competition lifts, slot is DE, movement is not bodyweight. Output: `percent_1rm`, a weight, a warm-up
  ladder, `load_basis: 'derived_ratio'`, and the note "70% of what this lift's own max works out to —
  about 80% of your bench press — derived, not tested." Added 2026-09-03.
- The same-pattern branch (a DE Close-Grip Bench off bench, a DE Front Squat off squat) prices off the
  tested lift of the row's own pattern with a catalogue ratio. Also a ratio between lifts.
- A DE row with no number already renders `By feel` with `DE · 2-4 reps · 3-4 in reserve · move fast`
  (Seated DB Press, golden commercial-gym day 1). That is the target state.
- Progression for by-feel rows (`progression.ts`, `me-history.ts` `byFeelWeek`): the logged weight is the
  row's weight; nothing is prescribed.

## The change

1. **Delete the cross-pattern `derived` branch.** A DE row on a pattern with no tested lift is `By feel`,
   `load_prescribed: false`, no `percent_1rm`, no warm-up ladder, no note. The DE line on the logger and
   plan card carries the reps, reserve and speed word as it does today.
2. **Delete the same-pattern ratio branch too.** A DE row whose movement is not itself a tested lift is
   `By feel`. A DE row whose movement IS a tested lift (a DE Bench Press in the DE competition slot) keeps
   70 to 80 percent of that lift's own working number (p218).
3. `load_basis: 'derived_ratio'` and `derivedNote` go. The catalogue ratios (`ratio` on exercise config)
   stay for display format and swap logic only; nothing prices off them.
4. `restate.ts` rebuild: a row that was `derived_ratio` in an existing plan is re-stated as `By feel`
   on the next rebuild. Never a delete, never a done session.
   2026-09-10: the marker gate missed the live row. On a tested block every row opens `By feel`; the
   first rebuild after the test priced the DE row through the weight branch, which writes the weight,
   the percent, the ladder and `load_prescribed` and never `load_basis` — so the row carried 85 lb
   with no marker, and the gate never fired. The gate is now the composer's own answer: the calendar
   row carries a number and the composer's row for the same movement is `By feel` for any reason
   but `awaiting_test`. Reproduced on a throwaway account against the deployed function
   (`scripts/_burner-de-row-rebuild-2026-09-10.mjs`): the marked row was restated, the unmarked one kept
   85 lb and its ladder. Test: `standing-plan-restate-by-feel.test.ts`.
5. No change to `TestedLift`, the test week, Profile, or the intake. No pull-up test.

## Copy

- No new line. The derived note is deleted, not rewritten. The `By feel` word and the DE line already
  exist and were approved.

## Out of scope

- The Today screen and the rest of the ours-line inventory (2026-09-09 chat).
- A max estimated from logged sets for a by-feel row (the Strong / Hevy pattern, p215 formula). Field
  standard. Not asked for. Noted for later.
- The 3-week check-in on the calculated max (p245).

## Verification

- Goldens (`standing-plan/golden/*.txt`) regenerated and read: no `derived_ratio` and no "derived, not
  tested" anywhere; every DE row that is not itself a tested lift shows `By feel` with the DE line; DE
  rows on the four tested lifts unchanged.
- `grep -rn "derived_ratio\|derived, not tested"` returns nothing outside tests and this doc.
- Throwaway account on the live server: build a Standard plan with four lifts typed, read day 4 of week
  two, the DE row is `By feel`. Rebuild an older plan that carried a derived row, read the row after.
- Michael's own account is not touched. His current block keeps its rows until a rebuild or a new plan.
