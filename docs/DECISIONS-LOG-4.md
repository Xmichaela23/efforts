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

## D-483 — One client cache: every screen reads the same copy of server data (2026-09-21, Michael)

> One consolidated entry (docs kept light). The map and the work left: `docs/AUDIT-client-cache-2026-09-21.md`.

1. **The field standard, adopted:** show the copy the phone has, refresh in the background, mark data old after any
   change, fetch the next screen early (Strava, TrainingPeaks; react-query's own model). The tool was already in the app
   and used by 8 files; the rest held their own copies in state, refs and module maps.
2. **Moved onto it:** the planned list (one list, user in the key), the week's coaching context (one copy per user and
   day; screens opening within 60 s share one check, OURS, cleared by any change event), State's trends config, the
   strength calibration read, and the baselines row (one read kept 30 s, OURS, each caller gets a clone).
3. **Every baselines write says so** (`markBaselinesStale`). It is a separate event from `baseline:saved` because that
   one also reloads Training Baselines' form. A workout change also marks baselines old: the learner writes the row
   after a sync.
4. **Rejected: deleting the custom window events now.** Screens outside the cache (AppContext's lists, the workout
   screen's own copy, goals) still refresh through them. They go when those copies move.
5. **Left on purpose:** the endurance checkpoint (a kept "due" would reopen an answered sheet); the plans screen keeps
   its per-week store but clears it on every change event.

## D-484 — A finished session shows the name its plan gave it (2026-09-22, Michael)

1. **The plan's name wins on screen.** A completed endurance session attached to a planned row prints the planned
   row's name on every surface (Today card, calendar day list, session header). The provider's name ("location + sport
   word" from ingest-activity) shows only when nothing is attached. Field practice: TrainingPeaks and TrainerRoad show
   the planned workout's name on a completed, matched workout.
2. **The server decides it once** (get-week `session_title` via `_shared/session-title.ts`); the phone reads it.
3. **Display only.** Neither row's stored name is rewritten, so unlinking a session brings the provider name back.
4. **Left on purpose:** the month-grid chip keeps its code, not a name.

## D-485 — Rides build for the road; the trainer is the exception (2026-09-24, Michael)

1. **Every ride shape carries a road/trainer mark** (`endurance-library/source-rules.ts` `Archetype.venue`, OURS,
   ledgered). Trainer = the three that switch inside two minutes on a controlled family: `short_vo2`, `micro`,
   `minute_surge`. The other twelve are road. Every family keeps ≥1 road shape at every level (pinned).
2. **The rotation and the workout pop-up walk road shapes** unless the slot carries `venue:trainer`. A "Trainer" swap
   with "rest of plan" opens that one slot's later weeks to all shapes; "just today" is the tag only.
3. **Why:** p275 asks for a power meter, not a trainer; sprints (p236), anaerobic (p237) and endurance (p239) are by
   feel; the customer rides outside. TrainerRoad's per-ride outdoor switch is the field model; its rewritten intervals
   and added minutes were rejected (no page).
4. **Known consequence:** a road athlete rides Long VO2 Repeats every VO2 week (the only road VO2 shape).
5. **A rider with no power meter: parked.** The book assumes one (pp212–213, every ride in %FTP).

## D-486 — Outdoor ride matching and the open warm-up on Garmin (2026-09-24)

1. `compute-workout-summary`, structured ride, in order: laps snap → the run lap rungs opened to rides → one lap press
   anchors the walk (`aligned-from-lap`) → no usable laps: efforts found in power against the family's own floor
   (`workFloorPct × ftp`, `aligned-on-efforts`) → the time walk. Finder numbers OURS, ledgered. Runs byte-identical.
2. A ride's easy-spin warm-up is a `lap_button` step: Garmin shows "Until Lap Press" (TrainerRoad / TrainingPeaks
   practice); a warm-up lap of any length snaps. Zwift (via Intervals.icu) keeps the timed warm-up.
3. **Open:** the cue words on the Edge step and the pop-up line were proposed, never approved — not shipped.

## D-487 — The minimum kit; accessory picks a lifter would recognise (2026-09-24/25, Michael)

1. **Minimum kit = barbell + plates, rack, bench, dumbbells, pull-up bar** (JuggernautAI's stated minimum; the pull-up
   bar OURS). Always assumed; the chips list extras only. Nothing is designed below it. Sign-up/Profile line
   (approved): "You'll need a barbell and plates, a rack, a bench and dumbbells."
2. **No superset holds two barbell movements.** Arms on a dumbbell kit = DB Skull Crusher + Dumbbell Curl; drag curl
   is a barbell movement. Braced hinge/push superset on the minimum kit = Weighted Reverse Hyper (Back Extension with
   the back-extension-bench chip) + Goblet Squat. Quad row = Banded Leg Extension with bands, else Reverse Lunge. The
   braced asymmetrical rows = Bulgarian Split Squat (gym: Single Leg Leg Press, p221 one leg, p275 rotation).
3. Floor back extension under a loaded bar deleted. Barbell Hip Thrust names its bar. Barbell Row on the DE pull.
   Split squat, skull crusher, Arnold press, gorilla row log per hand; a station row logs total.
4. **Deadlift form** (Barbell / Trap bar) chosen on the lift; the number is NOT adjusted (Michael: "users in the know
   will"); Strong/Hevy/Juggernaut keep variations as their own lifts, none converts. 60 lb bar in the plate math.
5. **Rejected:** a one-lunge-per-day rule (PM overreach, reverted same day).
6. Evidence: `docs/audit/accessory-audit-2026-09-24{,-after}.md`.

## D-488 — The strength logger's set entry (2026-09-24, Michael)

1. The keypad is a keyboard-height panel (Strong's shape): digits, decimal on weight, backspace, a plates key on a
   bar-loaded weight box, Next (weight → reps → RIR). No title, display line, Clear, Save or Close.
2. The check fills an empty weight/reps from the number its placeholder shows; a band placeholder blocks and opens
   the keypad; an empty RIR opens the existing reserve strip.
3. The per-set "target …" line is gone; the header and placeholders carry the target.
4. **Rejected:** plus/minus keys (not a verified field standard); Next on RIR finishing the set (Michael: "not gonna
   break with precedent" — Strong/Hevy keep the check separate).

## D-489 — Sets are earned on every row (2026-09-25, Michael)

> 2026-09-29: the HEAVY-day (ME) set ladder no longer reads a swapped session — a trap bar day adds or removes no deadlift
> set (D-508 §2, `me-history.ts`). Point 3 below still holds for DE, SKILL and HYP rows. Everything below is history.

1. The ME ladder's rule on DE, SKILL and HYP: start at p218's low end; two sessions in a row within one rep of the
   top with reserve inside the band add a set (p245's two-in-a-row bar; "clean" = Michael 2026-08-24); a session under
   the floor takes one off; capped at the band. Keyed by movement + intent. OURS extension, ledgered.
2. Copy (approved, said aloud): card "Up to 4 sets. You hit the top of the range two sessions in a row." / "Back to 3
   sets. Last session came in under the range."; block: "Every exercise starts at the low end of its set range. Two
   sessions at the top of the rep range add a set, up to its cap. One session under the range takes one off. The row
   shows the count." Field precedent: RP Hypertrophy (the row changes, nothing announces it).
3. A swapped exercise earns as the row it replaced. `resolveLiftSwap` and `applyAdjustment` match by canonical name,
   never substring (a swap on DB Bench Press no longer renamed Bench Press).

## D-490 — Run laps by order; the Swap sheet by slot; new gear reaches the plan (2026-09-25)

1. **Run laps** (`layoutLapsByOrder`): walked onto the steps in order; a lap under the floor is a stray press; a
   lap-button step (warm-up drills) takes its lap; the layout with most laps in tolerance wins. `time_work_s` not
   widened. Found on Michael's 25 Sep run (13 laps, 13 steps).
2. **The Swap sheet is built for the SLOT** the row fills (rows carry `slot_category/pattern/key/frame`; restate
   carries them as shape), not the held movement's filing. A stand-in no longer hides its slot's printed options.
3. **Equipment rebuild:** a stored stand-in with no recorded origin gives way when the current kit reaches a printed
   cell movement; `built_equipment` is written once and never overwritten; hand picks (`slot_picks_chosen`) stay.
   Found on Michael's block (the rebuild had overwritten its own evidence).
4. The back-extension-bench chip's row reads "Back Extension"; "GHD Back Extension" only at a commercial gym.

## D-491 — Drift reads the steady middle, intervals.icu's way (2026-09-27, Michael)

1. `_shared/aerobic-decoupling.ts` is the one drift rule for runs and rides (replaced `vt1-window-drift.ts`). The first
   20 minutes and the last 10 are left out (intervals.icu defaults, forum.intervals.icu/t/72); at least 20 minutes must
   remain (TrainingPeaks Help Center 204071724); the halves split at the window's middle second.
2. Ride: normalized power per half (coasting at 0 W) ÷ average heart rate. Run: average grade-adjusted speed per half
   (stops at 0) ÷ average heart rate. Steady sessions only (`session-steadiness.ts`; a planned hard set is not steady);
   a ride with VI over 1.05 gets none; a ride with power gets no heart-rate-only fallback. No spike rule, no bpm cut
   (both were invented by a terminal and removed).
3. The efficiency row no longer needs a drift reading: "Efficiency factor X. Higher means more power for the same heart
   rate." plus the four-week steady average. Commits `2d629f523`, `1ce77e3ba`, `1baff6d4c`.
4. TrainingPeaks' registered names are not printed: "Weighted power" (NP), "% of FTP" (IF), "workload" (TSS)
   (`0231714da`, `3cabe6585` for the Details tile). Lawyer review of the borrowed list before launch.

## D-492 — Ride + Strength (p278): five rides, the joined rides as one, picked lengths (2026-09-27/28, Michael)

1. p278's two-workout days are one ride each (`EnduranceSlot.joinsPrevious`): Day 3 "VO2, then Sweet Spot", Day 5
   "Sprint Ride, then Ride" — one card, one watch workout, linked to one recorded ride.
2. Day 2's easy ride is optional: the switch and "Optional. An easy ride between the hard days." sit on the Day 2 card
   (2026-09-28, `ca087bf52`); switched off, the card stays and the length chips move to Day 5. Program card: "Four or
   five rides, three lifting days."
3. Lengths are picked: long ride 1h · 1h40 · 2h30 · 3h30; midweek rides (p239 plain easy ride) 1h or 1h40, Day 5 held
   to Day 2 (p281). Step-ups are offered, never automatic: at most 5% of the week's easy minutes (p148), at p281's
   timing, midweek first (p107, p108, p149). PLAN_WRITER 35. Merge `bf799af69`; provenance pins `8bb10054c`.
4. Long Ride + Strength (p279, goal "Go longer") is written up and NOT built: `docs/NOTES-p279-frame-2026-09-27.md` and
   SOURCE Part E10, uncommitted in the `/Users/michaelambp/efforts-279` worktree.

## D-493 — The Performance card: TrainingPeaks' order, one time (2026-09-28, Michael)

Ride: Moving Time · Distance · Workload, then Weighted Power · Elevation · Avg Heart Rate. Run: the same with Pace.
Plan results smaller below (Execution · Duration · Drift). Moving Time is the only time on Performance; Details keeps
three. Tiles are server-written (`_shared/session-detail/top-tiles.ts`). Commit `fd70f72b5`.

## D-494 — A run's easy-jog warm-up ends on the lap press (2026-09-28, Michael: "more to extend warm ups")

p229/p231/p233 warm-up jog lines carry `lapButton`, as ride easy-spin lines do (D-486): Garmin gets an OPEN step; the
card, the planned minutes and the after-run table keep the page's minutes; cool-down jogs stay timed. FIELD —
TrainingPeaks open-ended steps; Garmin Connect "Lap Button Press". Commit `3a891c56d`. Michael's upcoming hard runs were
rebuilt by his 9:17/mi pace update after the deploy (read back: every hard run Sep 30 – Oct 21 opens on the lap press).

## D-495 — Notes under Execution; the keypad keeps a typed number (2026-09-28, Michael)

1. `_shared/session-detail/score-notes.ts`: one note per cause that took a half of the score below 100 — "11 of 14 reps
   faster than planned." (slower / both; rides "above/below the planned watts"), "1 rep shorter than planned.", easy
   sessions "13 min above the easy heart-rate ceiling." and "Shorter than planned." Nothing when a half is at 100.
   Total session length moves Execution only on an easy session. Saved screens v13. Commit `cdbe93aa1`.
2. Logger: a tap outside the number pad saves a changed box (Strong/Hevy); before, a reserve typed and then the check
   tapped was lost and the adjust strip opened. Commit `b7aa155a2`.

## D-496 — Run laps: one lap per step is the watch's own layout (2026-09-28, Q-311)

When a run's laps number the plan's steps exactly and at least one lap fits its step, lap i is step i before any
length or walk test (`compute-workout-summary` `oneForOne`, ahead of `layoutLapsByOrder`). A rep run badly reads as run
badly on its own step. Found on Michael's 28 Sep Surge and Float (stood through the first 0:15 surge; "14 of 16" → 16 of
16). Replayed his 25 planned runs since 2026-07-01: only that run changed. Commit `f1c02df42`. VERIFIED on his phone.

## D-497 — LOAD card: the fitness line in words first; form is "today" (2026-09-28/29, Michael)

1. Card order: "Fitness rising · up 8 in 3 weeks" (rising / holding / falling — the bike row's ±1 fitness point a week,
   OURS; 3-week window OURS) → "Today: <form zone>" → fitness · fatigue · form. Coach payload 221 (`fitnessTrendLine`).
2. Form zone names say how rested or loaded today is (FORM_ZONE_TEXT): very rested · fitness fades if it lasts / rested ·
   race ready / in between · not rested, not loaded / loaded · the range that builds fitness / overloaded · injury and
   illness risk rises. Ranges Friel's; words ours, approved. Payload 220. Commits `8c92f81ac` … `7064945a3`. VERIFIED.
3. State refreshes itself: `save-baselines` marks `coach_cache` old after any write; an open State/Today rechecks 4 s
   (OURS) after the app announces a change (`b7a82842f`). NOT yet seen on a phone.
4. FTP: the app's number is a critical-power fit over the 90-day 2–20 min bests × 0.97 (intervals.icu / TrainerRoad
   style); Zwift's is 95% of the single best 20 min. Michael chose ours (2026-09-29).

## D-498 — Supersets never need the bench at two settings (2026-09-28, Michael: "this is a stupid superset")

`benchSetting` / `benchClash` / `benchSafePick` / `supersetPartnersForPick` (accessory-picks.ts): the kit's route decides
flat / incline / none; defaults, the composed week and the equipment rebuild's unrecorded picks all avoid a clash; a hand
pick stays. OURS — ledger row "Superset bench setting". Commit `0c58986e8`. VERIFIED (Tate press + dumbbell curl).

## D-499 — Home's Past tab (2026-09-28, Michael)

Today · Week · Past: every finished session newest first, grouped by day, sport-coloured dot, filter All · Run · Ride ·
Strength · Swim (a sport shows once logged), four weeks at a time ("Show earlier", OURS). Rows are get-week's, through
the Week tab's own fetch and cache key. Commit `696ebe108`. VERIFIED.

## D-500 — Long Ride + Strength (p279, goal "Go longer") is built (2026-09-28/29)

Frame `cycling_long` (SOURCE Part E10, `docs/NOTES-p279-frame-2026-09-27.md`): five rides one a day (days 1, 2, 3, 5, 6),
Day 5 optional ("Optional. An easy ride the day before the long ride."), Day 1 sweet spot Level 2 · Level 3 (rider's
pick, Level 2 default OURS), long ride level 3 at 3h30 · 5h, step-ups offered at weeks 4/8/12 (≤5% of easy minutes,
p148), midweek rides 2h30 · 3h30 (Day 5 = Day 2), deload lifting swaps, sprint on deload Day 3, day 4 superset. Card
"Five rides and three lifting days a week. The long ride runs 3h30 to 5h." Merge `2d0dfd1fd`, words/pins `d7b8c40ae`.
⚠️ The rides-screen top line "Pick how long the long ride is." no longer covers the whole screen — new words owed.

## D-501 — p239's two rides: the easy ride every week, "With efforts" a one-day swap (2026-09-28/29, Michael)

p239 prints a straight easy ride and a structured ride at every endurance level and says to use the intense ones
"sparingly unless an event is coming". Every week builds the easy ride; the structured ride is a one-day choice on the
swap sheet ("With efforts" — "A shorter ride with some harder work in it. Meant for occasional use, or the weeks before
an event.", back to "Easy ride") on Long Ride + Strength (`cd89e19fb`), Ride + Strength (`1e34b69e0`) and Run + Ride +
Strength's Thursday ride (`bc5c64dcf`, which used to alternate). Rides-screen rows with no length pick show their
shortest–longest time across the block ("45 min–1h08"; approved format).

## D-502 — Deload weeks are the page's (2026-09-29, Michael: "It should all be what the book says")

Outside the standard column the weekly volume asks are not read, and a picked length is kept only inside the level the
page prints for that column's session (Ride + Strength's existing rule, p278). Strength Lead's deload Saturday was an
80-minute level-3 run where p246 prints VT1 level 1; now 28 min. Commit `896f300d5`. Applies when a deload is built.

## D-503 — The week arranger holds the book (2026-09-29, plan sweep of 2026-09-28)

1. The chooser reads the second half of a joined session (`week-arrangement.ts` skeletonWeek) — moving a ride no longer
   stacks the long ride on a hard day (Ride + Strength engine warnings 6,293 → 252 in the sweep).
2. p80: upper and lower heavy days 3–4 days apart wherever the printed week spaces them so (grouping by body region is
   OURS); the book's own exceptions stay (p278, p253). `better()` order: answers, three-session days, spacing, warnings,
   days moved. Note when no week can: "Monday and Tuesday are both leg days, back to back. Each lift is spaced three to
   four days apart, and the days you picked leave no week that does that." (approved).
3. A session moved off a day off avoids hard and long days (p131); relocation order OURS.
4. Setup: dragging a lifting day moves the whole day; landing on a day with sessions swaps the two days (Michael's call —
   the book does not cover moving; `f621fb7d6`). The calendar still moves one session.
Merge `78f3136b5`, note words `e758cc570`.

## D-504 — Hard minutes held within 10% week to week (p112 + p148); 105% is near-threshold (p233)

Hard slots rotate on one shared cycle (`hard-rotation.ts` `holdRotation`): every printed shape still appears, each slot
changes shape every week, and the cycle is the one with the fewest >10% week-to-week changes (hard minutes first, then
p146 buckets). The ledger files work up to 105% as near-threshold (p233 prints 105% sessions as near-threshold). Sweep:
hard-minute breaks 253 → 16 over 39 plans; totals 46 → 0. Where the page's own shapes cannot hold 10% (Run Lead's 79-min
Threshold with a Surge; Long Ride's Tempo Blocks; All Rounder with day 3 ridden) the rotation keeps them in and says so
in the tests. Merge `3d3198254`.

## D-505 — State trends at the week seam; the Execution note's two ranges (2026-09-28)

1. `compute-snapshot` leaves `state_trends_v1` out of the upsert when a historical recompute skips the build — a past-week
   recompute no longer blanks the row the coach reads before a new week has one (`fb0865e45`).
2. Q-312: reps asked for more than one range → "…faster than the paces asked for." / "…above the watts asked for."
   (`6f714af43`).

## D-506 — The plan list: names lead with the sport; each card says who it is for (2026-09-29, Michael)

1. Run plans renamed to mirror the ride names: Run + Strength (p246, was Strength Lead), Long Run + Strength (p250, was
   Run Lead), Run + Muscle (p244, was Strength Lead + Muscle), Long Run + Muscle (p252, was Run Lead + Muscle)
   (`92fb9ed27`). Run + Strength's confirm line is "{name} — {weeks} weeks." (`553a40c4c`).
2. Each card opens with who it is for, then the week, then the level (approved lines, `3205d71ff`); a lifting line from
   the page where the page states one — new is fine (p245), some experience (p247, p251), a solid background (p253);
   none on the ride and Standard cards, whose pages are silent (`8c3215699`). "Start here" over Ride + Strength (p280).
3. Why (research, 2026-09-29): the customer arrives with an endurance base and little lifting; the book is often written
   for the reverse reader (memory `project_efforts_reading_viada_inverted`). Muscle plans suit newer lifters and anyone
   who wants muscle (Schoenfeld 2017: lighter loads build as much muscle in the untrained); strength plans suit running
   and riding economy with little size (Rønnestad & Mujika 2014); both cut injuries (Lauersen 2014).
4. NOT BUILT: p251/p253's 3-hour "blended strategy session" for marathoners — p107 caps easy running at 2 h in one
   session and the page prints no structure for the strategy session, so Long Run + Muscle's card says half-marathon
   level. Also open: p253's two advanced-marathoner options (Monday VT1 level 3, Wednesday's extended cooldown).
5. The Run list (`RUN_GROUPS`, `e30abc399` → `2eb6725f2`): one screen, no tap-in, grouped for runners by lifting and
   weekly running — New to lifting · up to 4 hours of running a week (Run + Muscle p245, Run + Strength p247 "most skill
   levels") · New to lifting · 5 hours or more (Long Run + Strength: p251's lifting "similar in structure" to Strength +
   5K, "The running program here is not for novices.") · Solid lifting background (Long Run + Muscle, p253) · Race.
   Trails and Get faster hidden until built. Run + Muscle's card adds p245's extra easy runs and "Not for very advanced
   runners." SEEN on the website 2026-09-29.

## D-507 — Back extension takes a plate (2026-09-29, Michael: "like goblet?")

The back extension row (any bench; `ghd back extension` and the names that resolve to it) draws the goblet squat's
Lb box: the number is the plate held, empty = body weight alone and still checkable. Priced `(body weight + plate) ×
reps`, the weighted chin-up rule (D-351; Hevy / Strong price weighted bodyweight work that way). One test for the logger
and the pricer: `src/lib/added-weight.ts` `takesAddedWeight`; `strengthSetVolume` `addedToBody`. The seated machine is
unchanged. Commit `e0455599a`.

## D-508 — The trap bar is a form of the deadlift, on the swap sheet and in the heavy-day ladders (2026-09-29, Michael)

1. Every Deadlift row's Swap sheet offers Trap Bar Deadlift wherever the kit reaches the deadlift (p219 prints it in the
   primary hinge cell; the route needed a key no chip grants since D-487's form switch) — `swap-groups.ts`.
2. A swapped heavy session holds the pattern's SET count as it already held the bar (`me-history.ts`, `onAnotherBar`):
   Strong and Hevy keep a variation's history apart from the lift's. Supersedes the 2026-09-25 "the set ladder reads it".
3. A "Rest of plan" swap between Deadlift and Trap Bar Deadlift runs Adjust's form switch (`deadlift_form`, D-487) —
   the trap bar becomes the block's hinge lift, priced and progressed as itself (`swap-session`, `958847aa7`).
4. The swap keeps the row's weights set by set, unconverted (`resolve-exercise-weight` → `deadlift_form`). Research:
   the trap bar lifts +8% (Swinton 2011, JSCR, powerlifters, low handles) to +15% (Lockie 2018, PMID 28394830, high
   handles) with no fixed amount; Strong, Hevy and Juggernaut convert nothing. Light is the safe side on an ME day; the
   trap bar's own sets and its test move it (`b90c90826`). Michael: build for any athlete, not for his own numbers.
Commits `3ff9f9331`, `958847aa7`, `b90c90826`. The trap bar swap sheet is VERIFIED on his phone.

## D-509 — State follows the plan's lifts (2026-09-29, Michael: "it should just know what you're doing")

1. Lift cards and "from your logged sets" keep only the lifts on the active plan's strength rows this week and the next
   three (OURS, `coach/plan-lifts.ts` `PLAN_LIFTS_WEEKS`), swaps included — the planned row carries the substitute. No
   plan → every lift, as before. Field: JuggernautAI's home screen and StrongLifts' Progress tab show their programme's
   lifts; none documents following a swap. `swap-session` marks the coach copy old on a lift swap.
2. The trap bar keeps its own card: the display fold into the deadlift (H-S18, 2026-09-10) is gone for the cards; the
   strength dot still reads one ratio per slot (FIXLIST 2b stands for the dot).
3. Best sets: this plan's lifts only, "Upper body" / "Lower body" (`getMovementGroup`; core and carries under lower
   body, OURS), each "first set this plan → best this plan"; a tap opens the lift's last five sessions (Strong / Hevy
   open every exercise's history). DESIGN_GUIDELINES rules 2–3: straight columns, the set one step up. The section is
   always open. "This week's lifting" (the ViadaWeekCard) is deleted: it counted what the plan already sets.
4. Up/down % instead of the chart: declined — every lifting app charts; the card's "over N weeks: a → b" line carries the
   change. Coach payload 222 → 223. Commits `3ff9f9331` … `64fccc206`. Plan filter and columns VERIFIED on his phone.

## D-510 — The plyo warm-up is part of its run or ride (2026-09-29, Michael: "I don't think it should be a separate log")

1. Every frame day that prints a plyo also prints that day's endurance session (checked over all frames); p88 files
   plyos as "a warm-up before sprint work or speed work". The warm-up row is dated on its session's placed day and
   tagged `warms_up:<frame day>:<slot>` (`compose.ts` `WARMS_UP_TAG`); the plyo day is no longer a fixed day for the
   arranger (`day-map.ts`). A warm-up built before the tag pairs with the first run or ride of its plan day.
2. `move-check` `plyoPair` / `movesTogether`: the calendar move, the lost day, mark done, link / unlink and the Garmin
   send reach both rows. A sport swap leaves the warm-up in front of whatever the session becomes.
3. Today: one card, "Plyo - {session}" (`PLYO_ROW`, Michael's words), the drills first with how-to and (i), p275 / p227's
   line, then the session's steps (`get-week/plyo-fold.ts`, `SessionDeck` `SessionCard`).
4. Garmin: ONE lap-button warm-up step in front, "Plyo warm-up: <drills>", no target (`withPlyoHead`) — the athlete
   picks one to three drills (p275) and presses lap once, so the first lap is always the warm-up and the session's laps
   still line up with its steps (D-496; `plannedWhole` gives the analysis the same steps). The drills are the plan's:
   one per p227 family, walking p89's order weekly, ladder drills only with a ladder.
Commit `1533208a6`. DEPLOYED, installed; NOT yet seen on a plyo day or on the watch.

## D-511 — Half marathon and marathon plans are built back from race day on the book's p250 / p252 weeks (2026-09-30 → 10-02, Michael)

Run → Race → Half marathon / Marathon. "Which week?" picks Strength (p250, frame `strength_half`) or Hypertrophy (p252,
`hyp_half`); race day sets the block's length. `generate-strength-plan` builds it (`race` on `config.standing_plan`);
rules in `_shared/standing-plan/race-week.ts`, growth in `compose.ts raceStandardWeeks`.
- **Running grows** 5% of the sub-VT1 bucket a week (p148), easy runs first, each to its level's printed top (p235); the
  long run is p235's race-pace finish, up to 3 hours for a marathon (p251, p253). Taper: half 2 weeks, marathon 3, the
  page's taper column. The hard cycle is solved once on the starting lengths (`holdMinutes`).
- **Threshold work** moves into the race band (p251/p253: half 92–97%, marathon 89–94%) with race-specific repeats
  (pp233–234). **Race pace = threshold ÷ 0.95 (half) / 0.92 (marathon)** (`RACE_PACE_OF_THRESHOLD`), used by the
  race-pace steps and race day's calendar length.
- **Lifting:** hypertrophy sets drop one at a time as running grows (p151), never below one a row.
- **Length:** 2–52 weeks (OURS). Under 12 (marathon) / 8 (half) builds with a note (FIELD: Nike Run Club, Runna). Over
  26 weeks: the plain programme until 26 weeks out (`race.from_week`, FIELD: Runna/Garmin 26-week cap).
- **Words** (all approved): Strength / Hypertrophy cards and subtitle; plan names "Marathon · Strength" etc.
  (`RACE_DATE_COPY.plan_names`); Run focus "These are the lengths for week one…" and "Grows to {length} by week
  {week}." per chip (`raceLongRunPeaks`, pinned to the built block by test).
- Rejected: a goal-time input (the race pace follows the threshold the athlete accepts, as Runna does).

## D-512 — The old marathon builder is deleted; Run → Race is the only way to build a half or marathon (2026-10-01, Michael: "I don't want it haunting us down the road")

`generate-run-plan` deleted (code + deployed function) with everything only it used: create-goal's single run race path
and run non-race path (now `unsupported_sport`), `race-readout.ts`, the marathon-timeline helpers, `_shared/endurance/
{index,pace-zones,volume,distribution}`, `frequency-policy.ts`, `src/lib/run-volume-tables.ts`, the old marathon wizard
screens. delete-goal does not rebuild a lone run race; Goals offers no "Build Plan" on a single run race goal;
"Racing more than once this year?" is hidden (season planner on hold). Moved unchanged: VDOT pace math →
`_shared/effort-score.ts`; the strength overlay (adapt-plan's relayout, tri plans) → `_shared/strength-overlay/`.
Rejected: routing single races to the season builder — `buildCombinedPlan` refuses one event goal (tested live).

## D-513 — The Performance summary is built after every sync, so Today's finished card has all its tiles (2026-10-01, Michael)

Today's ride/run tiles (Elevation, Pace, Execution) read the stored `session_detail_v1`, which only `workout-detail`
saved, on open. `recompute-workout` step 7 now calls `workout-detail` (service door: service key + `user_id`) after the
snapshot; `analyze-running-workout` keeps the stored summary on a re-analysis (it was a full replacement). Older
sessions fill in when opened.

