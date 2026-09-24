# SPEC — Rides build for the road by default; the trainer is the exception (2026-09-24)

Michael, 2026-09-24: "not everyone has a trainer … and some people like the joy of riding outside."
Ruling: **outdoor is the default and the trainer is the exception.** Every ride the plan builds must
be one an athlete can follow on a road with a power meter. The short-switch shapes that need a
trainer are offered only on a ride the athlete has put on the trainer.

Rules that bind this build: the plan adds nothing the book does not print (memory
feedback_plan_adds_nothing_the_book_does_not); never use ours in copy; every athlete-facing line
waits for Michael's yes; build what is tapped, warn in a note, never block; sessions identified by
tag, never name.

---

## 0. Why this is the book's side, not ours

- **The book never asks for a trainer.** p275: cycling work may be done on *"any modality with a
  power meter that is relatively non-impact"*, rotating among devices as long as the athlete knows
  their threshold on each. The requirement is the power number, not the machine.
- **The endurance ride is written as road riding.** p239: use these rides for *"form-focused
  training"* — several minutes of every long ride on pedal stroke and position.
- **Three of the five ride types are by feel.** Sprints (p236): max-effort sprints, *"trying to
  beat the last effort"*; flying surges *"to max effort"*; no power target on the page. Anaerobic (p237): *"best done by feel with a power FLOOR rather than a
  specific power target — the numbers are guidelines."* Endurance (p239): *"use judgment."*
- **Two are controlled.** VO2 (p238): *"these should be more carefully controlled"* than the
  anaerobic work. Sweet spot (pp238–239): as close to threshold as possible without exceeding it.
  These need the power meter, on the road or on the trainer.
- **The customer** (memory project_efforts_audience_bandit_pns): riders who already ride outside.

**What TrainerRoad does that we take:** the indoor/outdoor choice is per ride, made on the day, and
reversible ([TrainerRoad Outside Workouts](https://support.trainerroad.com/hc/en-us/articles/360024352332-Outside-Workouts)).
**What TrainerRoad does that we do not take:** rewriting intervals into new outdoor shapes; adding
15–60 minutes for terrain and stoplights; effort targets on controlled work. None of those is on a
page. We pick from the book's own list instead.

---

## 1. The sort — every cycling workout the library holds, road or trainer

**The rule (OURS, ledger row, never on screen):** a shape is **road** when every work interval is
two minutes or longer, or its family is prescribed by feel (sprints p236, anaerobic p237). A shape
is **trainer** when the work switches inside two minutes on a controlled family. Recovery length
never decides it. Terrain never decides it: with a power meter the target is the same on a climb
or the flat (Michael, 2026-09-24).

Shape ids and labels are `supabase/functions/_shared/endurance-library/source-rules.ts` (labels
approved 2026-09-19). Levels as the page prints them.

| Family | Shape (id) | L1 · L2 · L3 as printed | Road / trainer | Why |
|---|---|---|---|---|
| Sprints p236 | Maximal sprints (`max_effort`) | 3 · 5 · 6 × 2–3 min all-out, 5–6 min easy | **Road** | by feel; 2–3 min efforts |
| Sprints p236 | Standing starts (`standing_start`) | 6 · 8 · 10 starts, 6–10 min easy spin | **Road** | by feel; needs a quiet road, nothing to say about it |
| Sprints p236 | Flying surges (`flying_surge`) | 8 × 30 s · 2×5 × 30 s · 2×6 × 30 s, 2–3 min easy | **Road** | by feel (p236 all-out) |
| Anaerobic p237 | Progressive Repeats (`progressive_repeats`) | 6–10 × 45 s · 1 min · 1:30 @ 110→130%, 4–6 min easy | **Road** | by feel against a floor (p237) |
| Anaerobic p237 | One-to-One Repeats (`one_to_one`) | 10 × 1/1 · 2×7 × 1/1 · 2×8 × 1/1 | **Road** | by feel against a floor (p237) |
| Anaerobic p237 | Surge, Sustain, Surge (`sandwich`) | 5 · 6 · 2×4 rounds of 30 s / 2:30–5:30 @ 90% / 30 s | **Road** | by feel against a floor (p237) |
| VO2 p238 | Long VO2 Repeats (`long_vo2`) | 5 × 3 · 4 · 5 min @ 110–120%, 5 min rest | **Road** | 3–5 min blocks |
| VO2 p238 | Short VO2 Repeats (`short_vo2`) | 2×6 · 2×8 · 2×10 × 1:30 @ 115% / 1:30 easy | **Trainer** | 90 s switches, controlled |
| VO2 p238 | Micro-Intervals (`micro`) | 4×5 · 4×8 × 30/30 · 4×8 × 40/20 @ 125%/85% | **Trainer** | 20–40 s switches, controlled |
| Sweet spot pp238–9 | Sweet Spot with Surges (`minute_surge`) | 3×6 · 4×6 · 4×8 min @ 90% with 10 s @ 105% every minute | **Trainer** | 10 s surge every minute, controlled |
| Sweet spot pp238–9 | Medium Sweet Spot Repeats (`medium`) | 6 · 8 × 4 min @ 95% · 8 × (2 @ 95% + 2 @ 100%) | **Road** | 4 min blocks |
| Sweet spot pp238–9 | Long Sweet Spot Repeats (`long`) | 3 · 4 × 8 min · 4 × 10 min @ 90% | **Road** | 8–10 min blocks |
| Sweet spot pp238–9 | Tempo Blocks (`tempo`) | 3 × 15 · 3 × 20 min @ 80% (L3 not offered) | **Road** | 15–20 min blocks |
| Endurance p239 | Steady endurance ride (`steady`) | 60–100 min · 2.5–3.5 h · 3.5–5 h below 75% | **Road** | the page's own ride |
| Endurance p239 | Endurance ride with tempo blocks and sprints (`mixed`) | 20 min spin · 1/2/3 × 4 × (2 min @ 80% / 3 min @ 70%) · 45/60/90 min VT1 with a 10 s all-out every 8–9 min | **Road** | 2–3 min blocks; the sprints are all-out by feel |

**Result:** 15 shapes, 12 road, 3 trainer. **Every family at every level keeps at least one road
shape**, so no ride ever needs a rewritten outdoor version:

| Family | Road shapes per level |
|---|---|
| Sprints | 3 / 3 / 3 |
| Anaerobic | 3 / 3 / 3 |
| VO2 | 1 / 1 / 1 (`long_vo2`) |
| Sweet spot | 3 / 3 / 2 (`tempo` is L1–2 only) |
| Endurance | 2 / 2 / 2 |

Not in the library and not in scope: p237 L2/L3 "30 s @ 120% / 30 s rest until unable to hold it";
p238–9 sweet spot L3 tempo with 10 s sprints (already excluded — all-out is not a number).

---

## 2. What exists (trace before build)

- **The trainer tag.** `_shared/session-swap/swap.ts` `RIDE_VENUES = ['trainer']`, p275. The swap
  sheet on the drawer offers "Trainer" on any planned ride without a venue; it stamps `venue:trainer`
  and changes nothing else (same family, same targets, same minutes — the p275 reading). Copy key
  `swap.machine.pending` is still waiting for Michael's words. `sheet.ts` carries `scope: 'today' |
  'rest_of_plan'` and a `revert` for a venue.
- **The rotation.** `_shared/standing-plan/compose.ts` `rotatedArchetype(family, level, week)` walks
  the family's offered shapes by week number (ours, from p112's "vary them week to week").
  `archetypeForSlot` puts a frame's named list first (`EnduranceSlot.archetypes`), then a picked
  length's first shape, then the rotation. Called at two sites; must give one answer.
- **Choose the workout on the day.** `_shared/session-swap/workout-choice.ts` `hardSlotOf` /
  `workoutsForSlot`: on a planned hard row, the book's other shapes for the family at the level. Not
  offered on easy or long rows (`intensityOf !== 'hard'`).
- **Which frames build which ride** (`_shared/standing-plan/frames.ts`): All Rounder — anaerobic L1
  (day 2), endurance L1 (day 4), endurance L1 or LSD (day 6). Ride + Strength (`cycling_base`) —
  sweet spot L1 (day 1), endurance L1 (day 2), VO2 L1 + sweet spot L1 (day 3), endurance L1 +
  sprints L1 pinned to `max_effort` / `flying_surge` (day 5), endurance L2 long (day 6). Both
  sprint pins are road.
- **Completed rides** carry Strava's `trainer` flag (`ingest-activity/index.ts` ~568). Not used
  here; a planned row says nothing about where it will be ridden except the venue tag.
- **`user_baselines.ui_prefs`** holds athlete-set preferences (State row order). Not needed here —
  the venue tag on the row, with `rest_of_plan` scope, is the standing preference.

---

## 3. The change

Three pieces. Nothing new on screen except what §4 lists.

**A. The rotation walks road shapes unless the row is on the trainer.**
`rotatedArchetype` (and `archetypeForSlot`'s length-picked first-shape branch) take the row's venue.
No venue → the family's road shapes only. `venue:trainer` → all shapes, exactly today's rotation.
The road/trainer mark lives on each archetype in `source-rules.ts` as one field, cited to this spec
and the ledger row, so `archetypesFor` can filter and nothing else holds a second copy of the list.
Where a family has one road shape at a level (VO2), the rotation returns that shape every week —
verify the `offered.length < 2 → undefined` branch resolves to it and not to the family's first
shape by accident.

**A known consequence, stated bare.** p229 asks the athlete to *"try each type of workout in each
segment"* and, when in doubt, alternate the one they like most and hate most. That is what the
rotation is for. On the road, VO2 has one shape (Long VO2 Repeats), so a road-only athlete rides
the same VO2 session every week and never meets that line for VO2. Sprints, anaerobic and sweet spot
still rotate on the road (3 / 3 / 2–3 shapes). The only way to give a road athlete VO2 variety
would be a rewritten interval, which no page prints — so the consequence stands rather than the
rewrite.

**B. The trainer switch is the existing venue swap.**
"Trainer" on the sheet stays what p275 makes it: the same session, tagged. With `rest_of_plan` it
is the standing "I ride indoors" answer, and from the next unstarted week the rotation on that slot
walks all shapes. Reverting the venue puts the slot back on road shapes from the next unstarted week.
**Ruled (Michael, 2026-09-24): "today only or rest of plan — for that day's session type."** A
`today` swap changes nothing but the tag. A `rest_of_plan` swap applies to **that slot only** — the
same weekday's same ride in every unstarted week — and rebuilds those weeks' shapes from the full
list. This stays inside what is already ours: the page lists the shapes, and which one a given week
builds was ours before this spec (`rotatedArchetype`). p275's "same session" reading holds for the
week the tag lands on. Every other ride in the plan stays on road shapes. Putting the Tuesday VO2 ride on the trainer
says nothing about the Saturday long ride.

**C. The workout pop-up lists what the row's venue allows.**
`workoutsForSlot` filters by the same mark: road shapes on an untagged row, every shape on a trainer
row. Frame-named lists (`EnduranceSlot.archetypes`) are filtered the same way; if the filter empties
one, fall through to the family's road list rather than throwing (the `frameRotatedArchetype`
level-mismatch lesson).

**Not built, on purpose:**
- Extra minutes for terrain and stoplights. No page.
- Rewritten outdoor intervals. No page; §1 shows none is needed.
- Effort targets for a rider with no power meter. p275 asks for a power meter; sprints and endurance
  already work by feel and talk test. **Open question for Michael** — this would be ours end to end.
- Endurance rides on the workout pop-up (steady vs mixed). Both are road; the length pick already
  holds the steady ride. Unchanged.
- Reading Strava's trainer flag to guess a preference. The athlete says it once on the sheet.

---

## 4. Copy

- No new athlete-facing line is required. The shape names are approved (2026-09-19). "Trainer" on
  the swap sheet is still the pending key `swap.machine.pending` — those words are the only copy
  this build waits on, and it waited on them before this spec.
- A row's note never says "road" or "trainer" and never explains why a shape was picked.

---

## 5. Ledger

One row in `docs/STATE-SOURCES.md`: the road/trainer mark and its rule (§1), marked OURS, with the
three page citations that make the by-feel families road (p236, p237, p239) and the p275 power-meter
line. The shape list is the book's; the sort is ours.

---

## 6. Verify (engineer terminal, throwaway accounts, three back-to-back rebuilds each)

1. Every ride family at every level has ≥ 1 road shape (`archetypesFor` filtered) — a test, so a
   future shape cannot leave a level empty.
2. Build the All Rounder and Ride + Strength across the sweep's athletes with no venue tag: no
   built ride carries `archetype:short_vo2`, `archetype:micro` or `archetype:minute_surge`, across
   all weeks. Easy and long rides: minutes and the length pick unchanged from today (the steady
   ride and the sprint pins were already road). Hard rides: minutes may change in the weeks where
   the rotation used to land on a trainer shape — record the before/after per slot, and check each
   new session's minutes are the page's own for that shape and level.
3. Tag one ride `venue:trainer` with `rest_of_plan`: the current week keeps its shape; later weeks
   rotate through all shapes on that slot and nowhere else. Revert: later weeks return to road.
4. The workout pop-up on an untagged VO2 row shows one option (Long VO2 Repeats); on a trainer row,
   three.
5. `builder-answers-sweep.test.ts` still green — "got what they tapped" must hold with the filter.

---

## 7. Open questions

1. ~~§3B — does a `rest_of_plan` trainer swap rebuild shapes?~~ Ruled yes, per slot (§3B).
2. ~~No power meter: effort targets or nothing?~~ Parked (Michael, 2026-09-24). The plan needs a
   power meter, as p275 does. Nothing is built for a rider without one.
3. Does the sheet's `rest_of_plan` scope reach a `venue` option today, or only `discipline`? Check
   `sheet.ts` `rewrite` before counting on it.
