# STAGE 0 — "Can't train this day" trace (2026-09-21)

Workorder: `docs/WORKORDER-lost-day-2026-09-21.md`. Read-only: no edits to code, no DB reads or writes.
Evidence labels: **read** = I opened the line; **inferred** = reasoning from what I read, not run.

## Headline

**The standing plan (All Rounder, Strength + 5K, Cycling: Base) does not use the resolver.** It is
placed by the book's printed 7-day week (the frame), turned as a whole to a start day, and then only
endurance sessions step off blocked days. `_shared/week-model/resolve.ts` is reached in production
only through `strength-primary-plan.ts`, and nothing live imports that file. The workorder's
premise for Stage 1 ("places the lost day's sessions through the SAME resolver the builder uses")
therefore has no live resolver to reuse — the builder uses the frame + rotation.

**Second finding: a moved date does not stick today.** The calendar re-adds the session on its old
day on every read, and a plan re-activation puts it back. Stage 2 cannot just write dates (Q4, Q5).

Searches behind the absence claim (read): `grep -rn "from '.*week-model[/']"` over
`supabase/functions` + `src` (non-test) returns only `strength-primary-plan.ts:149` and
`standing-plan/week-conflicts.ts:20-21`; `grep -rn "from '.*strength-primary-plan"` over the same
returns nothing. `src/lib/suggest-hard-days.ts` and `src/lib/pairing-timing.ts` (named in
`CLAUDE.md` as client users of the solver) do not exist.

---

## 1. How the builder's week preview is produced

Chain (all read):

1. `src/components/NonRaceBuilder.tsx:3820` `runPreview` → `preview(payload)` (`:3827`) → reads
   `plan.sessions_by_week['1']` (`:3828`) into `previewWeek` (`:3834`) and
   `plan.placement_compromises` into the notes (`:3838-3849`). The grid places nothing
   (comment `:3870`, "IT PLACES NOTHING CLIENT-SIDE").
2. `preview` is `useArcSetupComplete().preview` (`NonRaceBuilder.tsx:1912`), defined at
   `src/hooks/useArcSetupComplete.ts:124`. It invokes **`create-goal-and-materialize-plan`** with
   `{ user_id, mode: 'create', goal, preview: true, plan_start_date? }` (`:129-137`) and returns
   `data.plan` (`:177`), with `readout` attached as `_readout` (`:182`).
3. `create-goal-and-materialize-plan/index.ts:2532` — the gate `strength === 'develop'` and no
   endurance `develop` sends the goal to **`generate-strength-plan`** (`:3184`). On preview it
   returns `{ plan: gsGen.plan, readout }` without writing (`:3185-3208`). `unavailable_days` is
   forwarded from `training_prefs` (`:3007-3019`).
4. `generate-strength-plan/index.ts:393` `resolveFrame({ enduranceSport, focus })`; `focus:
   'standard'` → `all_rounder` (`_shared/standing-plan/frame-resolver.ts:93-95`). Inside
   `if (frameResolution.frame)` (`:398`):
   - `chooseDayMap(frameId, { longRunDay, longRideDay, hardDays, unavailableDays, startDateIso })`
     (`:676-690`) picks the rotation.
   - `buildStandingPlanRow(...)` (`:881`) composes all weeks via `_shared/standing-plan/compose.ts`.
   - `if (preview === true)` returns `plan: row` with no write (`:1022-1067`).
   - There is no non-frame fallback: the old strength builder is archived and a null frame is a 422
     refusal (`:1085-1100`).

## 2. The resolver — inputs, pins, and "fixed days + a closed day"

**What it is (read):**
- Units: `buildUnits(sessions, pins)` (`_shared/week-model/model.ts:256`). A `Session` is
  `{ id, label, load, sport?, minutes }` (`model.ts:49`); load is one of `heavy_lower | upper |
  hard_cardio | long_run | long_ride | easy` (`model.ts:39`). Back Squat + a hard run and Deadlift
  + a hard ride are glued into one unit by LABEL match (`model.ts:219-222`, `:266-268`).
- A pin is `pins: Record<sessionId, dayIndex 0=Mon…6=Sun>` → `Unit.pinnedDay` (`model.ts:237`,
  `:276`, `:289`).
- `resolve(units, { minRestDays, unavailableDays })` (`resolve.ts:769`). Blocked days are removed
  from the candidates (`:792-800`). A pin on an open day is fixed and never moved (`:802-803`); a pin
  on a blocked day is released and re-solved (`:810`). Units with a cost are searched exhaustively,
  the rest are laid in by score (`:825-829`, `:836-887`).
- `resolveAroundPins` (`resolve.ts:730`) wraps it and returns `{ placements, restDays, violations,
  structural, relocations }` with the move list for released pins (`:742-766`). No live caller
  (grep for `resolveAroundPins(` outside `resolve.ts` and tests: none).
- `solveWithWeekModel` (`solver-adapter.ts:96`) is the adapter used by `strength-primary-plan.ts`
  (`:149`, called `:3577`, `:3623`). It never passes `unavailableDays` (`solver-adapter.ts:136`).

**Can it take "these days are fixed, this day is closed, place these units"?** Yes, as written
(read): pin every session that must stay (its day index), leave the lost day's sessions unpinned,
pass the lost day in `unavailableDays`. Pinned units stay; free units go only on open days.
Limits (read):
- It has no idea of "today". Days before today are not closed unless passed as `unavailableDays`,
  so a past day would be a legal destination.
- It works on a 7-day cyclic week (`model.ts:325` `WEEK_HOURS = 168`; streak term is cyclic
  `resolve.ts:189-208`). A lost Saturday could wrap a session's clearance into "next Monday" of the
  same cycle rather than the real next week (inferred).
- Units are glued by label (`Back Squat`, `Deadlift`). The All Rounder's lower days are named
  `Lower body: Hinge` / `Lower body: Push` (`frames.ts:743-745`, `:805-807`), so the p274 day-2
  pairing (Hinge + Cyc AnA) would not be glued unless the session label carries "Deadlift"
  (inferred from the label match; not run).
- It does not print the athlete-facing notes the builder shows; those come from
  `standing-plan/week-conflicts.ts` (below).

**What the standing plan does instead (read):**
- `chooseDayMap` (`standing-plan/day-map.ts:220`) scores the 7 rotations of the whole frame. Lifts
  and the plyo day move only by rotating the whole week (`day-map.ts:128-131`); blocked days are the
  first scoring term (`:296-300` region, comment). If no rotation clears a blocked day, lifting
  stays on it and a note says so (`:354-375`).
- `enduranceRelocator` (`compose.ts:476`, used `:3021`) steps an endurance session off a blocked
  day: nearest day that already carries training first, forward then back (`:503-515`), else the
  nearest open day; never refuses (`:517`).
- **For a lost mid-week day neither mechanism fits** (inferred from the above): the rotation would
  shift already-done days, and the relocator moves endurance only — the day's lift stays on the
  lost day.

## 3. Placement rules applied today, checked against the workorder's Rules list

Which engine the standing plan uses: **frame + rotation + endurance relocator** (Q1/Q2). The
resolver's law (`COST`) reaches it only as **notes**, through `weekConflicts` (`compose.ts:4268` →
`week-conflicts.ts:398`, which calls `unmetNeeds` at `:425`).

| Workorder rule | Standing plan (live) | Resolver (`week-model`, not live) |
|---|---|---|
| Days off are absolute | Endurance: yes, relocator skips blocked days (`compose.ts:504-511`). Lifts: only if some rotation clears them, else lift stays on the day + note (`day-map.ts:354-375`). | Yes, blocked days removed from candidates (`resolve.ts:792-800`); falls back to all 7 only if all 7 are blocked (`:800`). |
| Completed sessions never move | Not a placement concept; see Q4. | Not a concept; must be expressed as pins. |
| Lift every 3–4 days, at least every 8–9 (p80) | Frame's printed days hold it (All Rounder: lifts on frame days 1, 2, 4, 5 — `frames.ts:654`, `:743`, `:781`, `:805`). Not checked as a rule. The 8–9-day floor is in the source (`SOURCE-viada-hybrid-athlete.md:509`) and not in code (grep "eight to nine" / "8-9 days" in `supabase/functions` + `src`: no hits). | Not encoded. |
| Two-a-day 6–8 h (p107/p108), a NOTE | Note for hard ride + heavy legs on one day: "Lifts in the first session, 6 to 8 hours before the ride." (`week-conflicts.ts:453-462`, cites p145/p108). | `COUPLED_GAP_HOURS = 6` (`model.ts:225`, cites p108) for glued pairs. |
| Adjacent session types allowed (pp139–145) | Allowed; adjacency is only reported as notes. | `COST` (`model.ts:140-178`, marked OURS): heavy lower emits 48 h on legs and needs legs + long-effort clear; long run needs legs clear; hard cardio leaves 24 h (ride 12 h). Breaking these is scored −1000 each (`resolve.ts:894`), not forbidden. |
| **Suspect: lower lifts 48 h apart** | **Reaches the standing plan as a note input only**: `unmetNeeds` finds heavy-after-heavy, but the note is deliberately silent for that case (`week-conflicts.ts:449-451`). | **Present in the resolver itself**, not only in `week-optimizer.ts`: `heavy_lower` emits `heavy_legs: 48` and needs `heavy_legs` clear (`model.ts:152`, OURS line `:151`). A Stage-1 week built on the resolver would push two lower days ≥48 h apart. |
| `week-optimizer.ts` 48 h lower rule | Does not reach it. `week-optimizer` is imported only by the combined/tri path (`create-goal…/index.ts:88-96`, used at `:1086` inside the tri backfill `:975`; `generate-combined-plan/reconcile-athlete-state-week-optimizer.ts:10`; `generate-triathlon-plan/generators/tri-generator.ts:29`). Rule text `week-optimizer.ts:16`. | n/a |
| Avoid a heavily fatigued write-off (consolidation, `SOURCE…:744`) | No direct term. | Scored proxies: stressor cap 2/day (`resolve.ts:144`, OURS), streak >3 stressor days (`:176-208`, OURS). |
| p274 week: day 2 Hinge + Cyc AnA; day 6 endurance only; day 7 rest | Yes, printed in the frame (`frames.ts:743-769`, `:821-827`, `:829`). | Not known to it. |
| No three-session days (OURS) | **Not enforced by the relocator**: its first choice is any day already carrying training, with no count (`compose.ts:508-512`). | Scored: `crowding` grows with the square of extra sessions (`resolve.ts:262-265`), `lockedDayExtras` (`:163`). Not forbidden. |
| Weekly floor; easy sessions drop first | Nothing drops; relocator always keeps the session (`compose.ts:517`). | Nothing drops; the week is always returned (`solver-adapter.ts:122-133`). No drop order exists in either. |

**Worked example (Tuesday lost), what today's code would do** (inferred from the lines above, not
run): with the rotation held, Tuesday's `Cyc AnA` relocates to Wednesday (nearest day already
training — plyo day, `compose.ts:508-512`); the Hinge lift stays on Tuesday because lifts are not
relocated. The planning chat's answer (Hinge → Wed, ride → Fri) needs lift relocation, which
exists only in the resolver.

## 4. How a standing-plan week is stored, and what reads a row's date

**Short answer (read): the date is the only thing that says which day a session belongs to, and
nothing records that an athlete moved one.** A changed date is undone or duplicated by at least
three readers.

Storage:
- Only writer from `plans.sessions_by_week`: `activate-plan`. It snapshots the old rows
  (`activate-plan/index.ts:388-391`), deletes all the plan's rows (`:399-402`), rebuilds, runs
  `preserveAthleteEdits` (`:647`), inserts (`:652`). Called from `create-goal…/index.ts:3253` and
  `src/contexts/AppContext.tsx:676`.
- Date: `addDaysISO(anchorMonday, (weekNum - 1) * 7 + (dow - 1))` (`activate-plan/index.ts:467`),
  `dow` from the session's `day` name (`:466`); week-one days before the start are skipped
  (`:468`). Row gets `week_number`, `day_number`, `date`, `day_seq` (`:549-553`).
- Unique key: `(training_plan_id, week_number, day_number, date, type, day_seq)` except retest rows
  (`supabase/migrations/20260921000000_planned_unique_key_day_seq.sql:14-16`). `day_seq` = place
  among that day's sessions of one sport (`_shared/day-seq.ts:1-26`).
- Tags: lifts `standing_plan`, `frame:`, `column:`, `lower:` (`standing-plan/compose.ts:3267-3270`);
  endurance `standing_plan`, `family:`, `level:`, `sport:`, `intensity:`, `band:`
  (`standing-plan/session-vocabulary.ts:494-495`). **No tag records the frame day.** The restater
  and swap slots take the weekday from `date` (`restate.ts:272`, `:699`;
  `session-swap/plan-adjustments.ts:78-82`), not from `day_number`.
- Done = `completed_workout_id`, or status `completed`/`skipped` (`restate.ts:177-181`,
  `_shared/plan-refresh.ts:103-107`); set by `auto-attach-planned/index.ts:226`.

What a date change ripples into:
| Reader | What happens to a moved row |
|---|---|
| `get-week` re-add (`get-week/index.ts:335-361`, key `plan\|date\|type`) | Inserts a fresh copy on the old date (same as Q5 break A). Runs for standing blocks too (`:179`, `:221`). **Read.** |
| `activate-plan` re-run (`preserve-athlete-edits.ts:48-49`, key includes date) | Move is lost; row comes back on its original date (`activate-plan/index.ts:467`); any skip/swap on it is lost too (`preserve-athlete-edits.ts:149-156`). **Read.** |
| Restate lifts (`restate.ts:249-278`, key `week\|weekday`) | Moved row is matched to the new weekday's session and rewritten with that day's movements (`:377-379`); old day reported as no row (`:588-592`). **Inferred from key.** |
| Restate endurance (`restate.ts:694-718`, key `week\|weekday\|sport`) | Count mismatch on the new day → nothing written, reported unmatched (`:718`). **Read.** |
| `rematerialize-standing-block` (`index.ts:602-605`) | Builds week\|weekday→date from rows; moved slot's swaps are dropped for that week (`plan-adjustments.ts:254-257`). Does not reset the date (`:625-635`). **Read.** |
| `auto-attach-planned` (`index.ts:416-433`, exact date, same type) | Attaches on the new date. The `get-week` copy on the old date stays open. **Inferred.** |
| `compute-snapshot` planned counts (`index.ts:750-758`), `_shared/adherence-plan.ts:68-77`, `:107-109` | Counted by date — the moved row and the re-added copy would both count. **Inferred.** |
| `plan-refresh` (`plan-refresh.ts:124-127`, `:247-250`) | Reads date ≥ today and not done. |
| `adapt-plan` relayout | Runs only for `strength_frequency` 2 or 3 (`adapt-plan/index.ts:643-644`); standing plans ignore that field (`generate-strength-plan/index.ts:155-157`), so it does not run for them. **Inferred.** |
| `validate-reschedule` | Reads only; derives the plan date from `week_number`/`day_number` (`index.ts:414-418`). |

Existing moves in the app, neither recorded anywhere:
- `src/components/UnifiedWorkoutView.tsx:1759-1762`, `:1839-1842` — sets `date`, clears
  `week_number` / `day_number` ("no longer tied to plan structure"). With `week_number` null the
  restater skips the row (`restate.ts:251`, `:268`).
- `WorkoutCalendar.tsx:581-583` (drag) — sets `date` only.

No record of moves exists: `plan_adjustments` holds swaps only (`endurance:<Weekday>:<sport>` +
date range, `session-swap/plan-adjustments.ts:1-21`, `:154-158`); `preserveAthleteEdits` keeps
skips and discipline swaps only (`preserve-athlete-edits.ts:100-116`).

## 5. Why calendar drag does not work today

The drag itself is wired on both mouse and touch; no flag turns it off. The date is written by the
client, not by `validate-reschedule`. **The break (read): `get-week` puts the session back on its
old day.** Report only; drag is not in this workorder.

Path (read unless marked):
- Mouse: `draggable` + `onDragStart` on the row (`src/components/WorkoutCalendar.tsx:1479-1481`),
  planned rows only (`:399-413`); drop → `handleDrop` (`:471-477`) → `beginReschedule`.
- Touch: 450 ms press-and-hold (`:506-524`), cancelled by >10 px movement (`:542-547`), a
  non-passive `touchmove` on the grid finds the day under the finger (`:534-562`), `endLongPress`
  (`:564-572`) → `beginReschedule`.
- `beginReschedule` (`:443-468`) invokes `validate-reschedule` with `{ workout_id, new_date }`
  (`:449-451`). Second call for suggestions at `:609-614`.
- `validate-reschedule/index.ts` only checks the move and returns `{ severity, reasons, before,
  after, suggestions, planContext, coachOptions }` (`:1180-1207`); completed rows get red "Cannot
  reschedule" (`:430-443`). It reads tables only, never writes a date.
- Confirm: `handleConfirmReschedule` (`WorkoutCalendar.tsx:575-595`) → `updatePlannedWorkout(id,
  { date })` → a direct `planned_workouts.update` (`src/hooks/usePlannedWorkouts.ts:190-193`).
  `week_number` / `day_number` keep their old values. The confirm button is hidden on red
  (`RescheduleValidationPopup.tsx:422-424`).

Where it breaks:
- **A (read):** every `get-week` read re-adds plan sessions from `plans.sessions_by_week`. It counts
  existing rows per `plan|date|type` (`get-week/planned-exists-key.ts:91-99`) and inserts a new row
  for any session the plan lists on a date that has fewer rows (`get-week/index.ts:335-361`,
  `source: 'training_plan'`). A moved row only counts on its new date, so the refetch after confirm
  inserts a fresh copy on the old date. The session shows on both days. The unique index
  (`supabase/migrations/20260921000000_planned_unique_key_day_seq.sql:15`) does not stop it because
  the dates differ. The same re-add was fixed for sport swaps only (`swapped_from:` tag, commit
  91fd56b45), not for date moves.
- **B (inferred, iPhone only):** the CSS that turns off iOS long-press text selection
  (`src/App.css:68-76`) is in a file nothing imports (only `index.css`, `App.tsx:1`,
  `main.tsx:4`). iOS text selection starts near 500 ms, just after the 450 ms hold, and would likely
  cancel the touch.
- **C (read):** every error on the path is only logged (`WorkoutCalendar.tsx:452-455`, `:465-467`,
  `:589-591`), so a failure looks the same as nothing happening.

**Bearing on this workorder:** Stage 2's "write the new dates" hits break A the same way. Any
accepted move will be copied back to the old day on the next calendar read unless `get-week`'s
re-add learns about moved rows.

Device test that would settle A vs B: on desktop, drag and confirm — if it then shows on both days,
that is A. On the iPhone, press and hold — if text highlights and the line never dims (opacity 0.45,
`WorkoutCalendar.tsx:1500`), that is B.
