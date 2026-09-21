# Decisions Log — Part 4 (D-471 onward)

Append-only record of architecture / design decisions worth preserving across sessions. Each entry
captures **why** the call was made, what was rejected, and what tradeoff is being lived with — so the
next session doesn't re-debate (or worse, undo) settled choices.

---

## 📁 WHERE TO FIND A DECISION

**The number tells you the file. Numbering NEVER restarts — a `D-NNN` exists exactly once, anywhere.**

| range | file | status |
|---|---|---|
| **D-001 → D-239** | [`archive/DECISIONS-LOG-archive-D001-D239.md`](archive/DECISIONS-LOG-archive-D001-D239.md) | frozen, **still authoritative** |
| **D-240 → D-372** | [`DECISIONS-LOG.md`](DECISIONS-LOG.md) | frozen 2026-08-02, **still authoritative** |
| **D-373 → D-427** | [`DECISIONS-LOG-2.md`](DECISIONS-LOG-2.md) | frozen 2026-08-13, **still authoritative** |
| **D-428 → D-470** | [`DECISIONS-LOG-3.md`](DECISIONS-LOG-3.md) | frozen 2026-09-12 at the ~150 KB cap, **still authoritative** |
| **D-471 →** | **this file** | live — new entries go here |

⛔ **FROZEN DOES NOT MEAN DEAD.** Every frozen entry is as binding as the ones here. Grep with a
glob: `docs/DECISIONS-LOG*.md`.

---

## D-471 — Every hard endurance session is the page's own shape at its level, and the ride caps are the book's (2026-09-11)

**The call.** The library stopped generating hard sessions from archetype rules and now prints the
shapes the book prints, per level (`printedIntervalsByLevel`, `repSecondsByLevel` in
`_shared/endurance-library/source-rules.ts`). Easy ride caps at 120 min (p108) and the long ride at
210 min (p239 level 2); run caps stay 90 easy and 100 long.

**Why.** Checked against the p231–p239 photographs, 8 of 28 hard workouts matched what the app built.
The rest were the app's own arithmetic wearing the book's labels. The fix was not to tune the
arithmetic; it was to stop deriving what the source states.

**Rejected.** Keeping the derivation and correcting the outliers — that leaves the next drift
undetectable. Also rejected: a 300-minute ride ceiling, which had no page behind it.

**Tradeoff.** Goldens moved (easy ride 175 → 100) and were regenerated deliberately.

---

## D-472 — ME rows keep the competition lifts; p220's secondaries are a swap in the logger (2026-09-11)

**The call.** The maximum-effort rows on the All Rounder still prescribe the competition lift. p220's
secondary variants are offered as a **swap list on the row in the logger** (`swap_options`,
`SECONDARY_BY_PATTERN`), not as the default and not as a wizard question.

**Why.** Michael, weighing the two: *"we offer both, with a caveat"*, then *"keep the compounds for
now, add the secondaries in swap in the logger… for ME"*. The secondaries are more complex movements
and each one an athlete adopts is another e1RM to carry and retest.

**Rejected.** Opening the ME rows onto the secondaries by default — built, then reverted the same day.
Also rejected: asking in the wizard, which makes a recovery-week choice into an intake decision.

---

## D-473 — A pairing the frame itself prints is not a conflict (2026-09-12)

**The call.** `week-conflicts.ts` no longer reports `hard_with_heavy_legs` when the FRAME COLUMN puts a
hard endurance slot on a heavy lower day. A pairing the athlete's own pins created still speaks.

**Why.** p274 prints the anaerobic ride on the All Rounder's heavy hinge day. The builder was therefore
warning about its own programme on every week of every golden — Michael: *"this warning shouldn't be
there, it's our program note for note."* A plan that warns about the page teaches the athlete to ignore
the warnings that matter.

**Tradeoff.** The rule now needs the frame day, so it turns the weekday back through the block's
rotation. If a frame ever gains a lower day with no printed endurance, nothing changes.

---

## D-474 — A finished build lands on Today, and Today says when the plan starts (2026-09-12)

**The call.** The intake's completion routes to Today rather than to the new plan's weekly planner.
`plan-overview` sends `starts_on` (week one's Monday) and `has_started` on every listed plan, and Today
prints "Your plan starts <weekday, month day>." in the slot a session would occupy until then.

**Why.** Michael: *"when your plan lands it puts you on the weekly planner, maybe it should land on
today with a note that says your plan starts when it starts."* The wizard defaults the start to next
Monday, so the common case is a build whose first session is days away, and the planner is the wrong
first thing to meet.

**Note.** `resolvePlanWeekIndex` clamps a pre-start date to week 1, so it cannot answer "has it
started". `planHasStarted` already existed for that and is what the new field reads.

---

## D-475 — Home is one lit screen: the ground carries the light, the cards are neutral instruments, and nothing is outlined (2026-09-12)

**The call.** Home's panel has its own light source (a wide, shapeless, white-cored glow behind the
session column). Every card on the screen — both session cards, the swipe deck, the completed card, the
load card and the past-day fallback row — wears one shared bed
(`galaxy-card readout-texture readout-texture--home`). No card carries a sport-coloured outline; the
sport lives in the title and in the glow the card throws on the floor.

**⛔ THE FINDING THAT COST THE MOST, RECORDED SO IT IS NOT REPEATED.** An afternoon of lighting changes
moved nothing on the session cards, because the cards are not drawn by `TodaysEffort.tsx` at all. They
come from `TodaySession` in `SessionDeck.tsx`, styled by `deckGlass` in `CardDeck.tsx`, whose background
was `rgba(19,21,27,0.90) → rgba(11,12,16,0.96)` — effectively opaque black painted over every change.
The load card was the only card on the screen that did **not** come through there, which is exactly why
it was the only one that ever looked different. The block in `TodaysEffort.tsx` that looks like the
session card is the **fallback row** for a past-day or skipped session, and its own comment says so.

**Why the cards are neutral.** Tinting each bed with its own sport hue while the ground is a strong warm
wash puts two opposite temperatures on one screen; every card went muddy (olive under the run, brown
under the lift). One channel per job: ground = light, card = neutral surface, colour = title and edge.

**Why no outline.** Michael: *"maybe it's no outline like state."* A drawn line in the sport colour makes
a card read as a tagged badge. Lead-versus-quiet moved off the border onto level, so the first session
still reads first.

**Why the floor was calmed afterwards.** The remaining heaviness was the VALUE GAP between a blazing
floor and a dark bed, not the cards. Lightening the bed had already cost legibility twice, so the peak
of the glow was halved and spread wide instead.

**Tradeoff.** The daylight is more subtle than the brightest version. If it needs to come back, put it in
the margins rather than across the whole field.

---

## D-476 — "Keep it easy" is gated on the VT1 band (2026-09-12)

**The call.** Today's spacing line says "Lift first and keep the <sport> easy" only when the endurance
session's `band:` tag is `vt1_or_easier`. Every other band reads "Lift first." A lift with no skill and
no speed sets, beside a session that is not VT1, draws no chevron at all.

**Why.** p144's rule 5 is about work that benefits from pre-fatigue and names VT1-intensity endurance as
that work. On screen the line was telling Michael to keep easy a run the same screen had just prescribed
hard at 48 minutes.

**> Supersedes** the 2026-09-10 ruling recorded in `today-lines.ts` that *"the band no longer picks a
branch"* — **for the first sentence only**. The ORDER sentence still reads the same on every band,
because p145 rule 6 and p77 are about the lift's own freshness and say nothing about the other session.

---

## D-477 — Average heart rate: the provider's number first, one resolver (2026-09-15)

**The call.** A session's average heart rate is `workouts.avg_heart_rate` — the provider's activity average,
the number Garmin Connect and Strava show. Our plain sample mean (`computed.overall.avg_hr`) is used only when
the provider sent none. One resolver, `_shared/fact-packet/queries.ts getOverallAvgHr`, and every screen reads
it: `workout-detail` writes it into the served overall once, so the Details tile and Performance print the
same bpm; `get-week` does the same for Today; `compute-facts` ride facts and the ride efficiency factor read it.

**Why.** TRUTH-MAP §9 Q3 (accepted 2026-09-15). The book is silent on averaging. Garmin and Strava show the
device average and agree with each other. Our sample mean is unweighted over unevenly spaced samples (Garmin
smart recording), so it is the less defensible of the two, and the app was printing both on one session —
Details the provider's, Performance and Today the sample mean.

**OURS:** the fallback order. Ledger row "Average heart rate" in `STATE-SOURCES.md`.

**> Supersedes** the computed.overall-first order of D-182 / D-185 (archive) **for average heart rate only**;
pace, distance and GAP keep D-185's order. Back-annotated there.

**Rejected:** a time-weighted sample mean everywhere (intervals.icu's method) — disagrees with the watch by a
few bpm on every session and needs every stored workout re-analysed.

---

## D-478 — Easy pace is one range off threshold: × 1.14 to × 1.29 (2026-09-15)

**The call.** Easy pace is ONE RANGE off the accepted threshold pace — threshold × 1.14 (fast edge) to × 1.29
(slow edge), Friel run Zone 2 — on every screen and on the plan's easy steps. The × 1.19 point goes. Until a
threshold exists there is no easy pace (heart-rate range only). The pair lives in `src/lib/friel-zones.ts` beside
Friel's heart-rate seams; `pacesFromThresholdSecPerMi` returns the range and its midpoint;
`resolveCurrentRunEasyPace` returns it with `sec_per_mi` = midpoint and `range_lo/hi_sec_per_mi` = the edges.

**Why.** TRUTH-MAP §9 Q2 (accepted 2026-09-15). The book gives easy by feel (p235: the percentage of threshold moves
with fatigue, hydration and environment) and prints only the talk test; Friel via TrainingPeaks gives Zone 2 as
114–129% of threshold pace, the same author whose heart-rate table already sets the easy heart-rate range; Daniels'
easy is a range with ±20 s/mi daily allowance. A point competed with the heart-rate prescription; a range does not.

**What moved with it.**
- "From runs" is not a source and not a proposal (it would be a second pace anchor). The learner's last-five easy
  median stays the State receipt and the checkpoint evidence, and is the MEASUREMENT for the readers that ask
  about the athlete's own running: the time-trial "slower than easy" check (`compute-workout-analysis`), the
  adaptation easy gate (`compute-adaptation-metrics`), long-run minutes → miles (`planning-context`,
  `end-plan-core`) and the VT1 fraction (`endurance-library` anchors → `vt1FractionFor`) — all via
  `resolveMeasuredEasyPaceSecPerMi`.
- Easy is off the plan pin (`athlete-snapshot`); a pinned plan's easy range comes from its pinned threshold.
- The heart-rate easy step's `pace_range` is the Friel range, not ±6% around one pace (`stampRunPrescription`).
- The run summary's easy-portion line judges against the range (inside / how far outside the nearer edge).
- The endurance library's easy/VT1 target is the range.
- Deleted: `EASY_TO_THRESHOLD_PACE_RATIO`, `src/lib/run-threshold-from-easy.ts` and its bound helpers (no callers).

**OURS:** printing a pace range under the heart-rate prescription rather than heart rate alone. Ledger row "Easy pace".

**> Supersedes** D-462's × 1.19 (back-annotated) and STATE-SOURCES row "Easy pace on Adjust…" (rewritten).
Race path and season wizard readers (parked, §3a) take the midpoint through the same resolver, unedited.

---

## D-479 — The equipment list grows by one test per chip (2026-09-16, Michael)

**The rule.** A chip is added to the home-gym equipment list only when (1) a person can name the gear and
(2) it unlocks a movement the book prints that the athlete cannot reach any other way. D-455's "required AND
commonly declarable" is the first half; the second half is new — a nameable chip that unlocks nothing printed
is not added.

**Applied.**
- **Dip bars: no chip.** Dips route on a rack or a bench (`src/lib/strength-gear.ts` `'dips'`), so the chip
  would unlock nothing. Traced 2026-09-16: dips are not blocked at a home kit; they sit in the Machine press
  row's list and build when picked. The row opens on Dumbbell Bench Press because every stand-in ties on
  equipment fit and the catalogue's key order breaks the tie.
- **Back extension bench: chip added.** p222's braced hinge row prints GHD back extension, routed on `machine`
  only, so a home athlete could not reach it. New key `back_extension_bench`, chip "Back extension bench". Back extension benches are 45- or 90-degree (Wikipedia, "Hyperextension (exercise)");
  the GHD back extension is the 90-degree type, so ONLY `ghd back extension` routes `[['back_extension_bench'],
  ['machine']]` and is shown as "Back Extension" at home with a six-sentence how-to (label, name and how-to approved by Michael
  2026-09-16 night; sources in `STATE-SOURCES.md`). `machine back extension` stays
  machine-only — routing it too put two identical rows in the picker. The commercial-gym chip grants the key. The chip's label contains "bench" and is kept from
  granting a flat bench (`athleteEquipmentToKeys`, `hasBench`). `ghd sit up` and `roman chair sit up` stay in
  `PRESCRIPTION_EXCLUDED` — neither is printed.

**Third part (Michael, 2026-09-16 night): the gear is common in home gyms.** Evidence: Garage Gym Experiment
ownership survey, September 2022 (garagegymexperiment.com/2022/09/06/what-do-you-own-initial-interest-in-homegymcon/),
read off its ownership chart: barbell 97%, dumbbells 93%, squat rack / power rack 92%, adjustable bench 78%, flat bench
58%; the large items are under 20% — functional trainer 19%, belt squat 17%, GHD 16%, reverse hyper 16%, leg press
machine 8%. The chart does not list a Smith machine, a back extension bench or a sled. The page gives no sample size.

**The bar for "common" is the chip that already exists** (Michael, 2026-09-16 night): Cable = the survey's functional
trainer, 19% owned. Applied:
- **Leg press / hack squat — OUT** (leg press machine 8%).
- **Smith machine — OUT** (no number in the survey); punch-list line: add when a survey gives a number.
- **Back extension bench — STAYS.** Not on the chart; the nearest measured items, GHD and reverse hyper, are 16% each.
  INFERENCE, not a finding: a back extension bench is a cheaper, smaller version of those.
- **Sled — ADDED, the stated exception** (Michael, 2026-09-16 night). Not on the ownership bar (the survey has no
  sled number); on his ruling from the page. p226 CARRY/DRAG/PICK prints "Push/pull variants: sled push · sled
  pull"; p278 day 4 prints "1 x SKILL: Carry". ⚠️ INFERENCE, not a finding: that "Carry" covers the whole p226 page.
  Chip "Sled" (label approved), key `sled` (the commercial-gym chip grants it, as `substituteExerciseForEquipment`
  already treated a gym as having one). Sled push and sled pull left `PRESCRIPTION_EXCLUDED` and route on the key.
  They are picks on the p278 Carry row only — a new `carry` pick (Ride + Strength) listing p226's movements the
  catalogue holds: farmer's carry, sled push, sled pull. Farmer's carry leads, so the row's default is unchanged
  for every kit that reached it; the row stays prescribed in words. `substituteExerciseForEquipment` keeps the sled
  rows for a chip owner. ⚠️ Side effect, measured: a barbell-only kit's carry row was building "Drag Curl" (the
  classifier files it as a carry on the word "drag"); with the printed list it builds "Farmers Carry".

**Machine press row (p274 day 1):** Dumbbell Bench Press opens the row where no p221 machine is reachable — a stated
OURS choice off p221's definition ("more externally braced movements"; a bench holds the torso, dip bars hold nothing),
ledger row in `STATE-SOURCES.md`. Dips stay a pick; no dip chip.

**Pinned** in `src/lib/strength-gear-catalogue.test.ts` (the chip unlocks both movements, grants no bench).

**Back-annotated:** D-455; the Slice 7 notes in `strength-gear.ts`, `TrainingBaselines.tsx`, `strength-grid/taxonomy.ts`.

## D-480 — The strength test stays the page's three sets; no ladder, no retest interval (2026-09-20, Michael)

Michael: "keep it by the book." p214: test a 5-rep max before the program; a heavy single is guesswork, 5 to 6 reps
is the most reliable. p215: about 75% of the predicted max for 6 (a guess is allowed: a weight good for 8, near
failure at 10), + 10% for 5, + 5% more for max reps; Epley and Brzycki averaged; × 0.96 is the training max. Both
pages read off the photos in `book-sources/` on 2026-09-20. The app already does this
(`_shared/standing-plan/working-number.ts`; the no-number branch at `compose.ts:2060`, 2026-09-09).

Withdrawn: the 2026-09-01 ruling that the test climbs until the reps break and then always asks (punch list, "THE
LOGGER DOES NOT BEHAVE LIKE A TEST ON A TEST DAY"). Not adopted: a retest every N weeks — a search of
`SOURCE-viada-hybrid-athlete.md` for "retest" finds no interval, and its notes read "progress without retesting";
a retest is the athlete's tap on Adjust. Field check the same day: JuggernautAI and Fitbod also estimate a max from
a heavy set of reps; StrongLifts and Fitbod fill a new lifter's first weights rather than leave them blank, which
the page's own guess line covers here.

## D-481 — Today's narrative, the plyo card, equipment on the rebuild, and three refresh rules (2026-09-20, Michael)

> One consolidated entry for the engineer terminal's day (docs kept light on purpose). ⚠️ D-480 was another terminal's
> entry, still uncommitted when this was written; the number here skips it.

1. **A hard run or ride reads a narrative on Today's card.** pp231–239 print no words for a single workout: one purpose
   paragraph per type, then a column of numbers. The narrative is that column said in order with the athlete's pace or
   watts, and the page's word for a rest (`_shared/planned-narrative.ts` → `computed.narrative`, stamped by
   materialize-plan beside `step_lines`, passed by get-week, printed by `today-lines.ts` above the purpose line). Today
   only: the session sheet, week view and device sends keep the list. No narrative when an effort has no pace or watts.
   Michael threw out two drafts as invented language ("There are 6 rounds. Each round is…"; "The same two paces for
   each pair after that") — the ladder now leads with its count of sets in the list's own "Set 1 / Set 2" shape.
2. **The plyo card.** Each drill prints its sourced how-to (the logger's text); its benefit opens behind an (i); p227's
   drill line prints once under the title, written to "you"; the first sentence counts the drills listed ("Pick one or
   two / one to three of these drills.", p275). The block description bars second person, so it keeps the third-person
   form (`P227_DRILL_LINE_FOR_DESCRIPTION`).
3. **All three foot-speed drills need the Agility ladder chip** (their own how-tos start at a ladder). With no ladder
   the plyo day holds two drills, inside p275's "one to three". Bodyweight dips stay out of the plan: the only slot they
   fit is a speed row at a set percentage, which bodyweight cannot be set to (ACE chest study; McKenzie 2022).
4. **New equipment reaches an existing plan only on the athlete's tap.** "Rebuild upcoming sessions" under the
   equipment chips (and on Adjust) sends `use_current_equipment`; the block then stores that kit. The automatic refresh,
   a logged test and a locked number keep the stored kit, because new equipment can change a session's movement.
5. **The refresh pairs a stored row with its slot** (`source_row`, the book cell that authored it), by name inside the
   slot and then in order. Name-and-cell matching left 36 of 60 lifting sessions unchanged on a home → gym switch. A
   plyo drill's slot is its family: a stored drill the kit no longer reaches comes off, a newly reachable one is added.
   A row tagged `retest` is never matched to the day's lifting session.
6. **The wait before a stale plan is queued again is five minutes** (FIELD: Kubernetes' restart back-off cap, 300 s),
   and only behind a refresh by the CURRENT writer version. It was one hour, ours; two deploys 17 minutes apart left
   a plan on the first deploy's words.
7. **A retest is exempt from the one-strength-row-per-plan-day index** (migration
   `20260920230000_planned_unique_key_exempts_retest.sql`, applied by Michael in the SQL editor). The insert had failed
   on any day holding a lifting or plyo session, five in seven. A second tap hands back today's retest.
8. **Baselines' Strength card has real buttons**: two retests and a rebuild under the numbers, a rebuild under the
   equipment; one owner with Adjust (`src/lib/plan-actions.ts`). The run and ride cards keep the link.
   **They are actions, not pills**: `GalaxyButton` `shape="button"`, `md`, the two retests side by side under a
   "Retest" label, each rebuild full width, on both screens. Their face is `.action-bed` (`src/index.css`): the top
   bar's warm-to-violet wash and the dot grid at low strength, NO sport colour and NO coloured edge, because the orange
   edge is the selected equipment chip's language and these sit beside those chips (Michael: "not competing with the
   selected pills").

## D-482 — The builder builds what is tapped, and a day keeps two sessions of one sport (2026-09-20, Michael)

> One consolidated entry for the PM chat's night and its two engineer terminals (docs kept light on purpose).

1. **"Did the athlete get what they tapped" is a permanent test.** `builder-answers-sweep.test.ts` crosses days off ×
   long day × hard days × run-or-ride in full on all three frames, and sweeps each workout, length and lift pick one at
   a time — those do not move a session's day, so the full cross product (about 80 billion on the All Rounder) buys
   nothing. It reads the screen's own option lists (`slotVariantOptions`, `slotLengthOptions`, `picksForFrame`), so it
   cannot offer an answer the athlete is never offered.
2. **A picked length builds the shape the chips were measured on, every week** (`archetypeForSlot`). p274 day 4 prints
   "Cyc endurance (level 1)" and p239 offers a steady ride or a mixed one, "sparingly unless an event is coming". Which
   of the two a week builds is OURS either way; the weekly rotation no longer overrides a length the athlete gave.
   ⚠️ The easy row always asks a length, so the mixed ride no longer appears as the All Rounder's easy ride.
3. **A session is hard when the frame's own slot says so**, not only when `HARDNESS` ranks its family
   (`week-conflicts.ts`). A declined hard slot builds another family and still reads easy.
4. **A day keeps every session the athlete or the page puts on it.** `day_seq` joins the unique key rather than the
   key being dropped, so a double activation still cannot duplicate a row. Rejected: keeping one row per sport per day
   and merging the sessions — p278 prints two rides on one day as two sessions, and a merge has no place for two swaps.
5. **A drag never deletes.** The calendar used to delete a same-sport session on the target day ("This will replace
   it"). Field practice: a move touches only the session moved (TrainingPeaks, TrainerRoad, intervals.icu, Wahoo).
6. **The long-ride day reaches the builder on the bike-primary path too** (`create-goal-and-materialize-plan`).
7. **Left on purpose:** point 7 untested (rare, low cost) · no wording for three hard rides on one day · the strength
   logger and yoga logger on a two-session day (the engineer's "two small ones").
