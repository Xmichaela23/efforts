# SPEC — Pick Planned with Teeth (for schedule jugglers)

**Status:** Open spec · not yet built · pick up when the atmosphere's right
**Priority:** 2
**Relates to:** auto-attach-planned · Start Fresh · calendar/adherence display · Q-050
**Filed:** 2026-06-12 (from the pick-planned wiring audit)

---

## The goal

When the week gets juggled, the app should reconcile what the athlete *intended* with what
they actually did — instead of silently swapping sessions and leaving holes. For someone
whose schedule shifts often, "pick planned" needs to flag consequences and help re-fill
gaps, not quietly absorb them.

## Where it stands today (from the audit)

The core mechanic is **correctly wired** — picking a planned session loads its
exercises/targets, claims the right slot via explicit `planned_id`, and doesn't duplicate
(completed slots are filtered out of the menu). The problems are all the same root cause:
**the plan is date-fixed, and nothing reconciles intent vs. what was done.**

Three real edges (none corrupt the DB, but each makes the calendar read differently than
intended):

1. **Coverage gap / silent swap.** Pick Thursday, do it Tuesday → Thursday's slot is
   consumed, but Tuesday's own planned session is left unclaimed. You've swapped without
   being told — Tuesday is still owed and now easy to skip.
2. **Slot-date ≠ performed-date mismatch.** Thursday's row gets marked completed, but
   `completed_workout_id` points at a Tuesday-dated workout. Calendar shows Thursday
   "done" while the workout body lives on Tuesday. (adapt-plan still reads it correctly by
   date — so this is attribution/display, not corruption.)
3. **Start Fresh re-attaches by date — the sneaky one.** Start Fresh unlinks in the UI
   (`planned_id = null`), but on save `auto-attach-planned` falls into its date-matching
   branch and can silently re-claim that day's planned slot. So a "blank, unlinked"
   session can still consume a slot server-side, contradicting its own label.

## What "done correctly" looks like

1. **Out-of-order pick surfaces the consequence.** Picking a session that isn't today's
   shows a clear confirm: *"You're doing Thursday's session — Tuesday's will stay open."*
   With a way to handle the gap (move Tuesday, skip it, mark it covered).
2. **Start Fresh's unlink is honored.** No silent server-side date re-attach. If the UI
   says "blank and unlinked," the saved session must not claim a slot by date — or, at
   minimum, warn that it will.
3. **Calendar / adherence reflect intent.** Juggling the week shouldn't quietly distort
   the athlete's sense of plan coverage. What shows as done should match what they meant.

## Priority within this spec

Fix order by likelihood of actually biting:

- **First — Start Fresh date re-attach (edge 3).** It contradicts its own label, so it's
  a correctness/trust bug, not just a display oddity. Make the unlink authoritative, or
  warn explicitly.
- **Second — out-of-order confirm (edge 1).** Small UX add, high value, directly serves
  the schedule-juggler use case. The "Tuesday stays open" confirm with a gap-handling
  choice.
- **Lower — slot-vs-performed attribution (edge 2).** Mostly cosmetic; engine still reads
  correctly. Tidy later.

## The ambitious end (later)

The deeper version: the plan understands **sequence over fixed dates**. A juggled week
re-fills holes and resequences rather than leaving them. That's a bigger rework of the
date-fixed model — worth noting as the direction, not the next step.

## Open questions to resolve when building

- On out-of-order pick, what are the gap-handling options exactly (move / skip / mark
  covered), and what does each do to the plan?
- Should Start Fresh ever attach by date, or never? (If never, what about the legit case
  of a blank session *on* a planned day that the athlete *does* want to count?)
- Does "reflect intent" mean re-dating the slot to the performed day, or annotating the
  mismatch? (Changes how calendar/adherence are computed.)

---

## Code entry points (from the audit — for whoever builds this)

- **Pick action:** `src/components/StrengthLogger.tsx:~3096` — `prefillFromPlanned(w)` + `setSourcePlannedId(w.id)` / `setSourcePlannedDate(w.date)`. Menu filters out completed slots at `~:3091`.
- **Start Fresh:** `~:3066` — clears exercises + linkage (`setSourcePlannedId(null)` …); does NOT touch server state.
- **Save → attach:** save inserts the workout with `planned_id: sourcePlannedId`, `date: performedDate` (`~:2783–2793`), then invokes `auto-attach-planned` (`~:2830`).
- **Edge-3 root (the date re-match):** `supabase/functions/auto-attach-planned/index.ts` — explicit `planned_id` path honors the pick (`~:120`, `~:297–321` mark the slot completed); the **date-matching branch** (`~:120–289`, when `planned_id` is null) is what re-attaches a Start-Fresh session by date. Make the null case respect an explicit "unlinked" intent.
- **Calendar/adherence read:** `get-week` is the sole calendar path (joins `workouts` ↔ `planned_workouts` via `planned_id`); any "reflect intent" change (re-date slot vs annotate mismatch) must go through it, not client re-derivation.
