# Work order — the arms superset is built on one implement, and every row says what it is held with (2026-09-24)

Michael, 2026-09-24, logging the All Rounder's Upper Pull day: the superset came out as `Skull Crusher` +
`Drag Curl`. He has a straight bar and dumbbells, no EZ bar. Neither row drew a bar chip or plate math
(the logger cannot tell what the row is held with), the skull crusher on a straight bar is not the
standard, and the two movements cannot share one bar between lying and standing. "We need to be very
clear about what we're prescribing to people."

## What is true today (traced)

- `src/lib/strength-gear.ts` `ASSISTANCE_GEAR`: `skull crusher` → `[['barbell','bench'],['dumbbells','bench']]`;
  `drag curl` → `[['barbell'],['dumbbells']]`. Both reachable two ways on a kit with barbell + dumbbells.
- `src/lib/strength-gear.ts` `barIsTheLoad` (~1037): a `total`-format movement with a barbell route AND a
  non-barbell route on the athlete's kit, and no `primaryRef`, returns **false** → the logger draws no bar
  chip, no plate math, and the row's LB column is a bare total. The row does not say what it is held with.
- `src/lib/exercise-config.ts` `SAME_MOVEMENT` (~2702): `tricep extension` folds into `skull crusher`, and
  the comment says the dumbbell skull crusher logs per dumbbell on a dumbbell kit — so the per-hand name
  exists on a dumbbell-only kit and disappears on a kit that also has a bar.
- `supabase/functions/_shared/standing-plan/compose.ts` ~1624–1650: p274's "(arms) superset" cell picks
  one focused push and one focused pull (`FOCUSED_ARMS_PICKS`, `focusedArmFit`). Nothing checks that the
  two picks share an implement or that the implement is named.
- Strong and Hevy name the implement in the exercise (`Skullcrusher (Barbell)`, `Skullcrusher (Dumbbell)`)
  and the weight box follows. The book (p222) prints `skull crushers` with no implement.

## The rule

1. **An arms superset is built on ONE implement, and both rows carry it in their name.** Dumbbells when the
   kit has them (the published pairing is dumbbell or EZ bar skull crushers with a curl; a straight bar on
   the face is not the standard and a lying + standing pair cannot share one bar). Barbell only when the kit
   has no dumbbells. OURS — field practice cite in the code (Strong / Hevy naming; the pairing).
2. **A row whose implement the kit leaves ambiguous is named with the implement the composer chose**, so the
   logger's `barIsTheLoad` / per-hand display resolves from the name alone: `Dumbbell Skull Crusher`,
   `Dumbbell Drag Curl` (per hand, `LB EACH`), or `Barbell Skull Crusher` (bar chip + plate math). The bare
   `Skull Crusher` / `Drag Curl` names stay in the catalogue as what a typed or historical row resolves to.
3. Scope of the naming rule for THIS work order: the two arms-superset slots on every frame that prints
   "(arms) superset" (p274 All Rounder days 1 and 4; p244 Hypertrophy + 5K days 1 and 4; any other frame
   the grep finds). Every other accessory with the same ambiguity is LISTED in the report, not changed
   — that list is the input to the strength audit Michael asked for.
4. History: a row already logged under the bare name keeps its history. `Dumbbell Drag Curl` must read
   `Drag Curl`'s previous sets on a dumbbell kit (the "previous" column) — check how `historyKey` folds.
5. No copy beyond the movement names. Names follow the catalogue's existing form (`Dumbbell Skull Crusher`,
   `DB Romanian Deadlift` exists — pick the one form the catalogue already uses most and say which).

## Verify
- Compose the All Rounder and Hypertrophy + 5K for kits: barbell + dumbbells + bench; dumbbells + bench only;
  barbell + bench only; commercial gym. On every kit both superset rows carry one implement, the same one;
  dumbbells whenever present. Print the two names per kit per frame.
- Logger render (existing logger tests / a fixture through `barIsTheLoad` and the per-hand branch): the
  dumbbell names get `LB EACH` and no bar chip; the barbell name gets the bar chip and plate math.
- History: a `Dumbbell Drag Curl` row on a kit with prior `Drag Curl` sets shows them as previous.
- builder-answers-sweep, standing-plan, strength-grid, accessory-dosing, logger suites green, three runs.
- Bump `PLAN_WRITER_VERSION` (`_shared/plan-refresh.ts`, now 29 → 30) with a one-line note, so built plans'
  unstarted weeks rebuild with the names.

## Report
Files changed; the two names per kit per frame; the list of every other accessory `barIsTheLoad` returns
false for on a barbell + dumbbells kit (the audit input); test counts ×3; anything that did not survive.
Do not commit.
