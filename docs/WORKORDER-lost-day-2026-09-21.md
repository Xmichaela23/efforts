# WORKORDER — "Can't train this day" (2026-09-21)

Owner: Michael (architect). PM: planning chat. Engineer: one terminal session per stage.
Status: APPROVED to build ("lets build it", 2026-09-21). Push / deploy still gated on Michael.

## What the athlete gets

1. On any upcoming day, the athlete taps "can't train this day" (copy TBD — through Michael).
2. The builder's week screen opens (the dot strip + the day list, `WeekGrid` / `WeekStrip`), showing
   the rest of this week with that day's sessions already placed on other days by the server.
3. The athlete can move any session to another day, the same way pins move in the builder. Each move
   goes back to the server, which places the week again. The client places nothing.
4. Nothing is written until the athlete accepts. Accept writes the new dates.
5. Goal: keep all the training. A session is dropped only when no legal day is left, and the screen
   says which one and why.

## Worked example (Michael's real week, Sep 21–27, All Rounder standard)

Tuesday lost (Lower body: Hinge + Progressive Repeats ride). The planning chat's hand answer:

| Day | Sessions |
|---|---|
| Wed | Plyo warm-up, Hinge, Long Sub-Threshold Repeats run |
| Thu | Upper Pull, 75 min easy ride |
| Fri | Lower Push, Progressive Repeats |
| Sat | 135 min long ride (endurance only, as p274 prints) |
| Sun | rest (day off — never a destination) |

This is a TEST CASE, not a spec. If the resolver gives a different week, report the difference and
the rule that caused it. Do not force this answer.

## Rules (every one sourced; anything without a page is marked OURS + ledger row)

- Days off are absolute — never a destination (no-hard-gates rule).
- Completed sessions never move. Sessions are identified by tag, never by name.
- Each lift ideally every 3–4 days; at least once every 8–9 days (p80).
- Two sessions on one day: 6–8 h apart (4–6 h if the morning is a sub-hour VT1 session) (p107 area).
  This is a NOTE on the day, never a block.
- Nothing in the book forbids two session types on adjacent days (pp.139–145).
- Arrange so no session, especially a key one, becomes a heavily fatigued write-off (consolidation
  chapter; see SOURCE-viada-hybrid-athlete.md ~L742).
- p274 week: day 2 pairs Hinge + Cyc AnA; day 6 is endurance only; day 7 rest.
- No three-session days (OURS — the book is silent; smallest choice).
- Weekly floor: one speed, one subthreshold, rest at VT1 or below. Easy sessions are the first to drop.

## Stages

### Move check rebuilt on the book (approved 2026-09-21)
The Jan 2026 "Coach Brain" check (analysis-builder, performance-engine, validate-reschedule messages,
workload caps 120/140 + warnings 80/100, suggestions) comes off. Replaced by book checks only.

APPROVED COPY (Michael, 2026-09-21) — exact words, [x] = filled by the server:
1. p108 — "Two sessions this day: 6 to 8 hours before the lift, or 4 to 6 if the first is an easy
   session under an hour, with a full meal in between."
   Fires only when one of the two sessions is a lift (p108 is the gap before the resistance session);
   a run + ride day gets no note and still counts as fitting (2026-09-21).
2. p80 — "[Lift]: [n] days until the next one. Consistent improvement needs one every 8 to 9 days."
   Shown only when the gap is over 9 days. The 3–4 day ideal gets no note.
3. "[Day] is a day off." — the only refusal.

4. "Days that fit:" — heading over up to three other days this week (not past, not a day off) that
   trigger none of notes 1–3. Order (corrected 2026-09-21 — "empty days first" dropped: not from the
   book, and redundant, since a day with a session already triggers the p108 note):
   - Lifts: the day that keeps the lift's gap closest to 3–4 days (p80).
   - Runs and rides: the day nearest the one it was on first — OURS, row in docs/STATE-SOURCES.md.
   - Ties: nearest day, then the earlier date (OURS, same row set).
   Each is a button showing the date; tapping moves it there.
   Moving is rare — the popup offers choices, it is not a review.

   BUILT 2026-09-21: `supabase/functions/_shared/move-check/index.ts` (`checkMove`, `daysThatFit`) — the one
   piece the lost-day step reuses; `validate-reschedule` rewritten on it; `_shared/coaching/` and
   `validate-reschedule/timeline-builder.ts` deleted. Lift gap is counted per session name (the pattern the
   plan repeats, e.g. "Hinge"), not per movement, because the plan rotates the ME movement week to week.

REMOVED, not shipped: the p274 same-day pair note (only the All Rounder prints Hinge + AnA; p246 and
p278 do not — a layout, not a rule), and the three-sessions note (OURS). No-three-a-day stays an OURS
PLACEMENT rule for the lost-day step only; a manual drag onto a two-session day builds with no note.

### PM pre-trace (2026-09-21) — the resolver already does most of this
- `resolveAroundPins(units, { unavailableDays })` (resolve.ts ~L730): a blocked day releases its
  pinned sessions, re-solves them, keeps every other pin fixed, returns `relocations` (from → to) and
  `violations` (warn, never block). This IS the lost-day behaviour, built for the builder 2026-08-25.
- It works on a weekday template, not on a dated week with some days already done. Stage 1's real job
  is the adapter: this week's remaining rows → units + pins + blocked day → back to dated rows.
- Coupled pair: `PAIRING` (model.ts ~L219, ~L264) keeps a heavy lower lift and its hard cardio as ONE
  unit, so Hinge + Progressive Repeats will move together. The worked example above splits them —
  expect the resolver to disagree there.
- `heavy_lower` emits `heavy_legs` 48 h and needs it clear (model.ts ~L141): lower lifts ≥48 h apart,
  and no heavy legs within 48 h after a long effort. Not a book rule (pp.139–145 forbid nothing on
  adjacent days) — Stage 0 item 3 must source it or mark it OURS.

### Stage 0 — trace (read-only, no edits)
Answer in the stage doc, with file:line:
1. How the builder's week preview is produced (NonRaceBuilder ~L3800 `sessions_by_week['1']`) and
   which server function it calls.
2. The resolver (`_shared/week-model/resolve.ts`, `solver-adapter.ts`, pins-win): its inputs, how a
   pin is expressed, and whether it can take "place these units into a week where these days are
   already fixed and this day is closed".
3. Which placement rules the resolver applies today, each checked against the Rules list above.
   Known suspect: `week-optimizer.ts` keeps lower-body lifts 48 h apart; the book has no such rule.
   Report which engine the standing plan actually uses and whether that rule reaches it.
4. How a standing-plan week is stored (planned_workouts rows, tags, day_seq) and what else reads a
   row's date (restate-from-today, snapshot, calendar) — i.e. what a date change ripples into.
5. Why calendar drag does not work today (validate-reschedule is wired from WorkoutCalendar.tsx
   ~L449/609). Report only; drag is not in this workorder.
Stop and report. No design until Michael has read Stage 0.

### Stages 1–4 BUILT 2026-09-21 (decisions from Michael, same day) — commit on branch, not pushed
- Placement is the MOVE CHECK, not the resolver (Stage 0: the standing plan never used it). Each session of the
  lost day goes to its first "Days that fit" day; lifts first (OURS); no third session on a day while one with
  fewer is open (OURS); no day fits → the closest open day, carrying its notes (OURS); next week only when no day
  this week is open. Nothing dropped. `_shared/move-check/lost-day.ts`, tests `lost-day.test.ts`.
- Server: `place-lost-day` { date, moves? } → the week + notes. Read-only.
- Screen: `src/components/LostDaySheet.tsx` — `WeekStrip` (moved out of NonRaceBuilder) + its own day list with a
  grip on each movable session; every drag re-asks the server. Accept saves through `@/lib/session-move`.
- Entry: tap the day's name in the calendar week (today and later, with a planned not-done session).
- FIXES 2026-09-21 (Michael): (1) the p108 note no longer disqualifies a day — "Days that fit" = not a day off,
  no third session (OURS), lift gap not over 9 days (p80); order unchanged. (2) A plyo warm-up moves with the
  session it warms up (p274 prints it as that day's warm-up), is never placed on its own, and does not count
  toward the three-session limit.
- Worked example result, after the fixes: MATCHES the hand answer — Hinge → Wed (with the warm-up and Long
  Sub-Threshold Repeats; p108 note), Progressive Repeats → Fri (with Lower Push; p108 note).
- Michael's case: lose Wed → the warm-up and Long Sub-Threshold Repeats both → Fri with Lower Push (p108 note);
  Sunday stays empty.

### Stage 1 — server: place the week (read-only endpoint)
Input: lost date (+ optional athlete moves). Reads this week's uncompleted rows from today forward,
closes the lost date for this week only, keeps every other session where it is, places the lost
day's sessions through the SAME resolver the builder uses. Returns the placed week + the resolver's
own compromise/notes strings verbatim. Writes nothing.

### Stage 2 — server: accept
Writes the new dates to exactly the moved rows. Re-validates on the server before writing.

### Stage 3 — client
Entry point on the day / session, opens the builder's week screen fed by Stage 1, moves call Stage 1
again, Accept calls Stage 2. No placement logic on the client.

### Stage 4 — verify
Throwaway accounts, real All Rounder plans (plus the other trusted plans), lose each weekday in turn,
check every result against the Rules list. Include the worked example above. Report pass/fail per case.

## Hard rules for every stage
- All athlete-facing copy printed for Michael's yes before it ships.
- Never `git commit -a` — add exact files. No push / deploy without Michael's go.
- Deploy edge functions from a clean worktree of the pushed commit.
- DB: read-only, and throwaway users only for writes.

### Approved copy, lost-day sheet subtitle (Michael, 2026-09-21)
"[Weekday]'s sessions moved to the best days left this week. Nothing is saved until you tap Save."
Shown under the title and date. [Weekday] is the lost day's full weekday name.
