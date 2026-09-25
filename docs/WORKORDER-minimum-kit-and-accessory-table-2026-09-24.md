# Work order — the minimum kit, and the accessory picks a lifter would recognise (2026-09-24)

Michael, 2026-09-24, after the accessory audit (`scratchpad/accessory-audit-2026-09-24.md`, copied below
as §5): "a motherfucker who has a rack has a bench and a pull-up bar … we are in the powerlifting zone,
not bodybuilding. That's Juggernaut." Field reference: JuggernautAI states a minimum up front — barbell,
plates, squat rack, adjustable bench — with dumbbells, kettlebells and bands as optional extras and a swap
for anything missing (https://www.garagegymreviews.com/juggernautai-review). Fitbod asks item by item
because it programs bodyweight-to-machines; that is not this plan.

## Part A — the minimum kit

**The rule.** The strength plan is built on a minimum kit and never below it:
**barbell + plates, squat rack / power cage, bench, dumbbells, pull-up bar.** Juggernaut on the first
four; the pull-up bar is OURS (a rack has one) — code comment + ledger row. Everything else is an extra.

**Equipment model.** Kit = minimum ∪ extras. `athleteEquipmentToKeys` always includes the five minimum
keys. The chips (`HOME_GYM_EQUIPMENT_OPTIONS`, `src/components/TrainingBaselines.tsx`) keep only extras:
adjustable / incline bench, cable machine, kettlebells, resistance bands, trap bar (new), back extension
bench, sled, sandbag, suspension trainer, stability ball, agility ladder, and the "Commercial gym" preset.
Remove the five minimum chips from the picker and the sign-up intake. Stored chip lists on existing
athletes: read as minimum ∪ stored (no migration write needed; say so in the report if one is).
The competition lifts' "placed by name with no kit check" (`compose.ts:1714-1717`) is now safe by
construction; leave it.

**Copy.** One line at sign-up and on the Profile equipment card stating the minimum — PENDING MICHAEL'S
WORDS; ship it as a key (`equipment.minimum.pending`) the way `SWAP_COPY_KEYS` does. Chip labels for the
extras keep their current words; "Trap bar" is a new chip and its label is his to approve (use "Trap bar"
as the pending key text).

## Part B — the accessory table (the six that stand after Part A)

Fix each in the picker/catalogue, not in the composer's ranking, and add a test per row. "Normal" =
what a Strong/Hevy/Juggernaut lifter would pick for that slot on that kit; the page's list is the source,
anything off the page marked as variant with a cite, anything ours marked OURS with a ledger row.

1. **No superset ever holds two barbell movements.** Generalise `armsOnTheBar` to every `superset_group`
   (`compose.ts:1649-1651` is arms-only). The braced hinge / braced lower push superset on the minimum kit
   becomes a dumbbell hinge + a barbell squat or the reverse: offer **DB Romanian Deadlift** (variant of
   p220's RDL) or **Barbell Hip Thrust** (variant of p223's machine hip thrust, on the bench) for the
   hinge half, **Front Squat** or **Goblet Squat** for the push half, never both on the bar.
2. **Delete the floor back extension under a loaded bar** (`strength-gear.ts:463-465`, `grid.ts:649,805`).
   p222 prints machine back extension; a back extension needs a back extension bench, GHD or 45° bench —
   it is reachable only with the `back_extension_bench` extra or a commercial gym. Filing cite
   (`taxonomy.ts:283`) already says "on a bench".
3. **Nordic hamstring curl**: the cell's exclusion is misspelled (`accessory-picks.ts:1019` `nordic curl`
   vs canonical `nordic hamstring curl`) — fix the spelling so the exclusion fires as written. The focused
   hamstring slot on the minimum kit then offers **Single-Leg RDL** (dumbbells; variant p223) first.
4. **Trap Bar Deadlift only with the trap bar extra.** New key `trap_bar`, route `[['trap_bar']]`
   (`strength-gear.ts:537`). Without it the primary-hinge accessory falls to p219's other printed options
   (paused deadlift, sumo deadlift) and to Front Squat on the push rotation as today.
5. **Arms superset on any kit with dumbbells = DB Skull Crusher + Dumbbell Curl** (`dumbbell curl` is
   already a p222 variant, `taxonomy.ts:304`). Drag curl leaves the dumbbell form: its route is barbell
   only (`strength-gear.ts:886`); it is offered where the bar is free (a gym's day 1 with pushdown stays
   Triceps Pushdown + Preacher Curl as picked). Revert the 2026-09-24 dumbbell-first route on drag curl.
6. **Split Squat logs per hand** on a dumbbell kit: add to `TWO_DUMBBELLS` (`grid.ts:301`) like bulgarian
   split squat and the lunges; on a gym where the bar is asserted, total with the chip.
7. **The stored name follows the movement the athlete does.** Rear Delt Machine on a home kit is stored
   as `Rear Delt Machine` and shown as Bent-Over Dumbbell Rear Delt Fly (`grid.ts:692-706`); the Swap
   sheet lists the machine. Store the execution movement as the row's `name` when the kit resolves it to
   a different movement (not merely a different implement); keep `execution_name` for implement-only
   renames. Say what this does to history keys.
8. **Chest Supported Row on the machine logs total** (`exercise-config.ts:473` is `perHand`): the format
   follows the implement — per hand on the dumbbell route, total on the station.

## Part C — verify
- Regenerate the audit (`scratchpad/audit.ts`, same script) for the minimum kit and the commercial gym,
  all four frames, 12 weeks, and attach it. The six checks return ZERO hits except the ones this work
  order names as accepted (list them). Every superset row: two different implements or one is bodyweight.
- Every strength row on the minimum kit is performable on the minimum kit (`canPerform` true).
- Goldens regenerated and diffed; explain every changed line. builder-answers-sweep once. Standing-plan,
  strength-grid, accessory-dosing, logger suites once; the new/changed tests three times.
- `PLAN_WRITER_VERSION` 30 → 31 with a note.
- Profile + sign-up: the picker shows only extras; an existing athlete's stored minimum chips do not
  reappear as extras; the intake test (`experience-chips`, `wizard-day-lock` are pre-existing failures —
  do not chase) passes as before.
- Do not commit.

## Report
Files changed; the rows per kit per frame after (same table shape as §5); the zero-hit statement per
check with accepted exceptions; every OURS row; copy keys pending; test counts; what did not survive.

## §5 — the audit this answers
(see `scratchpad/accessory-audit-2026-09-24.md`; copy it into `docs/audit/` under the same name so the
work order's evidence ships with it)
