# Work order — default muscle-building picks aim at a visible, athletic look (2026-09-13)

> **STATUS: BUILT 2026-09-13** (`06a66725`, then moved to the server in `628392fa`). Defaults per Michael's answers,
> checked against the page photos p220-223, p246, p247, p274, p278: Day 1 focused push lateral raise (p246, p278);
> Day 2 accessory lower hip thrust (p246, p278, under p247's accessory gloss); Day 2 DE secondary hinge back on p220's
> list, KB swing or Romanian deadlift, and the Hinge variation pick is honoured; p274 Day 2 focused hamstring hip thrust
> (home: barbell hip thrust stand-in); p274 Day 4 braced pull lat pulldown; p246 Day 4 secondary push Arnold press.
> Chest Fly removed from every plan (`7b6c270b`). Rows, sets and reps unchanged.

## The change

On every plan (Standard Focus / All Rounder p274, Run + Strength p246, Ride + Strength p278), the
DEFAULT movement on each HYP accessory row is chosen for the most visible change: side and rear
shoulders, back, arms, glutes. The model is what a personal trainer gives an actor, inside the book's
own lists only.

Hard limits:
- Only movements on p222-223 (focused) and p220-221 (secondary, braced) lists for that row's category.
  No movement the page's category does not list.
- No added rows, no added sets, no change to reps or reps in reserve. Rows and set counts stay as each
  plan's page prints them.
- The athlete can still swap any row (picking screen and on the day). Only the default changes.
- Plans already built keep their movements until rebuilt.
- No core row is added anywhere (core picks stay filtered off the picking screen).
- Equipment still decides reachability; when the default is not reachable, fall to the next movement
  on the same list that serves the same muscle.

## Proposed defaults (to confirm in §1 against each plan's printed cells and the pick tables)

**Ride + Strength (p278)**
- Day 1 focused pull: rear delt machine (rear shoulders, posture); fallback a curl.
- Day 1 focused push: lateral raise (side shoulders).
- Day 2 accessory lower: hip thrust (glutes). The page does not say push or hinge for "accessory lower";
  §1 reports whether the current pick table allows hinge-side focused movements on this cell.

**Standard Focus (p274)**
- Shoulder rows: lateral raise on the focused push row, rear delt machine on the focused pull row.
- Arm rows (two supersets): one biceps and one triceps movement.
- Day 2 focused hamstring: hip thrust.
- Braced hinge rows (Days 2 and 5): the most glute-directed braced hinge (reverse hyper / back extension).
- Braced push / pull, braced leg, focused quad: §1 proposes, same principle.

**Run + Strength (p246)**: §1 proposes per HYP cell, same principle.

## 1. Trace and report (no code)

- Current default and full option list for every HYP cell on all three plans, from
  `supabase/functions/_shared/standing-plan/accessory-picks.ts` (`leadWith`, `hisList`, per-frame keys)
  and whatever `defaultViadaPicks` / the composer reads.
- For each cell: the proposed default, the muscle it serves, the book list it comes from (page), and
  the fallback by equipment.
- Anything proposed that is NOT on that cell's printed list: flag it and do not use it.
- What changes for an athlete who rebuilds.
- Report in plain language, no function names, one table per plan.

## Rules

Standard ripple guard: nothing outside default picks changes. Every athlete-facing line needs Michael's
yes. Throwaway accounts only for verification. git add exact files, never -a. Commit, push and deploy each
need Michael's yes; report pushed vs client deployed vs edge functions deployed. No .env, no prod queries.
