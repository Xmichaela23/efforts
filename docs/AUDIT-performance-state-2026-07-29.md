# AUDIT — how PERFORMANCE and STATE analyse a session and a block (2026-07-29)

**Asked for by Michael:** *"the performance screen is a little messy — any strength is auto attaching
even if it doesn't match (i'm backdating adding plans). state screen has no idea how to read our new
protocol — from strength to hill drills — it's not plan smart. do a total audit of how everything is
being analysed by performance and state."*

**Method.** Code trace only. No prod queries, no fixtures run, no device. Every claim below cites
`file:line`. Where a consequence is ARITHMETIC off the code rather than something observed, it says so.

⛔ **NOTHING WAS CHANGED. This is a map.**

⚠️ **Read `Q-227` first** — it covers the strength READ path (four blind spots) and this audit
subsumes and extends it. Where they overlap, this doc is the wider trace.

---

## 0. THE ONE-PARAGRAPH ANSWER

Both screens are **structurally sound and protocol-blind.** The engine that decides
improving/holding/sliding is one shared classifier over dated series, and it is good. What reaches it
is a stream of numbers with **no idea what the plan asked for on the day each number was produced**.
On the old protocols that was survivable. On Strength Focus (5/3/1) it is not: the block deliberately
moves prescribed intensity between 40% and 95% of the working number across four weeks, so the
*prescription itself* is now the biggest source of variance in the signal — and the reader cannot see
it. Separately, **exercise identity is resolved five different ways** across the two screens, which is
why the same session can be "matched" to the score and "skipped" in the table. And the strength
auto-attach has **no content check at all** — date + type is the whole rule.

---

## 1. THE MAP — what each surface actually reads

### PERFORMANCE tab (one session)

`UnifiedWorkoutView.tsx:997` → `MobileSummary.tsx:138` → `StrengthPerformanceSummary.tsx` →
`StrengthCompareTable.tsx`.

| what's rendered | where it's decided | substrate |
|---|---|---|
| Execution % + "what moved it" | `analyze-strength-workout/index.ts:1187-1276` | `session_detail_v1.execution` |
| planned↔executed match (score) | `_shared/strength/match-exercises.ts:88` | `planned_workouts.strength_exercises` vs `workouts.strength_exercises` |
| planned↔completed rows (table) | `StrengthCompareTable.tsx:190-261` | its OWN local matcher |
| Previous column | `workout-detail/index.ts:760-825` | last 10 strength workouts, its OWN matcher |
| RIR chip / verdict | `analyze-strength-workout:531-583` | logged `set.rir` |
| endurance pace/duration adherence | `analyze-running-workout/lib/adherence/granular-pace.ts:870` | planned steps that carry a pace target |
| plan context (week/phase) | `analyze-running-workout/lib/plan-context.ts:25` | `plans` **where status='active'** |

### STATE tab (the block)

`StateTab.tsx` + `StatePerformanceSection.tsx` ← `useStateTrends` ← `weekly_state_v1.trends.display`
(server-assembled) ← `athlete_snapshot.state_trends_v1` ← `_shared/state-trend/assemble.ts`.

| row | the number | the verdict |
|---|---|---|
| strength e1RM per lift | `exercise_log.estimated_1rm`, Brzycki on the session top set (`compute-facts:1340`) | `state-trend/strength.ts:173` via `classify.ts:50` |
| strength volume | `workout_facts.strength_facts.total_volume_lbs` | `strength.ts:61` |
| strength dot | current e1RM ÷ typed baseline 1RM | `strength.ts:130` |
| per-lift "add weight / slipping" | `response-model/weekly.ts:139-207` | RIR-vs-target, else e1RM direction |
| run | pace-at-HR efficiency on **steady** runs; decoupling secondary | `state-trend/run.ts` |
| bike | 20-min power by terrain bin; HR-at-power second | `state-trend/bike*.ts` |
| swim | described only — count / distance / longest | `assemble.ts:103` |
| week narrative | `_shared/insights/coach-week-insights.ts:120+` | load vs plan, ACWR, e1RM verdict, posture |
| Cross-training row | `_shared/insights/cross-training-read.ts:88` | focus verdict × others' ACWR |
| protocol read | `_shared/insights/strength-protocol-read.ts:49` | `planConfig.strength_protocol` |

---

## 2. FINDINGS — ranked by what they cost

### ⛔ F1. The strength auto-attach has no content check, and activating a plan sweeps a year of history

`auto-attach-planned/index.ts:418-506` — **"STRENGTH/MOBILITY: Match by date + type only (no duration
check)"**. That is the entire rule. There is no comparison of exercises, sets, load, or even session
name. Any completed strength workout on a date lands on whatever single planned strength row shares
that date.

`activate-plan/index.ts:645-676` — on activation the function selects **every** unattached completed
workout from `startDate − 30 days` to `startDate + 365 days` and calls auto-attach on each one.

**So backdating or adding a plan retroactively glues months of unrelated strength sessions onto
planned days.** The only guard is `candidates.length > 1 → ambiguous, don't guess` (`:424`) — which
only helps on days that happen to carry two planned strength rows.

Two aggravating details:
- The candidate query includes `workout_status = 'completed'` (`:397`), and `:439-444` clears the
  PRIOR workout's `planned_id`. A second strength session on the same date **steals the link and
  detaches the first one.**
- Attachment is **sticky by design** (`supabase/migrations/20251001_sticky_attach_triggers.sql`) — the
  triggers deliberately never clear a link when the other side goes null. A wrong attach persists
  until an explicit detach.

**What Michael sees:** old strength sessions showing a Planned tab and an Execution score against a
plan they have nothing to do with; a compare table of half-empty rows.

**Arithmetic, not observed:** a fully mismatched session scores **20%**. Nothing matches →
`exerciseCompletion = 0`, `setCompletion = 0`, `loadAdherence = 0`
(`analyze-strength-workout:1207`), and `rirAdherence` **defaults to 100** when there is no RIR data
(`:1215`) — 0.2 × 100 = 20. "20% · Needs adjustment."

### ⛔ F2. The e1RM series cannot tell a deload from a bad week, and the guard that exists is starved

`state-trend/strength.ts:179` passes `exclude: isDeloadWeek` into the classifier. `deload.ts:15` reads
`p.meta?.name`. `assemble.ts:152` builds the points as `{ date, value }` — **there is no `meta`.**
The same is true of the volume series (`strength.ts:52`). So the deload exclusion is a **no-op on both
strength trends**, and has been since the series was written.

This did not matter much before. It matters now, because 5/3/1 moves prescribed intensity by design
(`loading/wendler-531.ts:27-32`):

| week | % of working number | reps |
|---|---|---|
| 1 | 65 / 75 / **85** | 5 |
| 2 | 70 / 80 / **90** | 3 |
| 3 | 75 / 85 / **95** | 5/3/1, top set open |
| 4 | 40 / 50 / **60** | deload |

**Arithmetic, not observed.** Working number = 85% of 1RM. Brzycki (`36/(37−reps)`) on the top set:

- wk1: 0.85 × 0.85 × 1.125 = **≈81% of true 1RM**
- wk2: 0.90 × 0.85 × 1.059 = **≈81%**
- wk3: 0.95 × 0.85 × 1.125 = **≈91%** (5 reps) or ≈81% (single)
- **wk4 deload: 0.60 × 0.85 × 1.125 = ≈57%**

Every fourth point is ~30% below its neighbours, and it cannot be excluded. Consequences, both live
depending on where the 42-day window falls (`thresholds.ts:14`):

1. **A false "slipping".** The classifier averages the two most-recent in-window points
   (`classify.ts:80-82`). When a deload point is one of them, `pctChange` goes sharply negative. The
   noise guard (1 SD, `strength.ts:171`) does not save it — the deload inflates SD to roughly the size
   of the shift, so the sliding verdict survives about as often as it is suppressed.
2. **A dead row the rest of the time.** The same inflated SD suppresses *real* directional change, so
   the per-lift verdict tends to sit on "flat" for a whole block.
3. **The dot and the number are wrong the week after a deload.** `latestE1rm` is the most recent point
   (`assemble.ts:346`), and the dot is current e1RM ÷ baseline (`strength.ts:137-146`). After a deload
   the State screen shows the lift at ~57% of its baseline, dot pinned to the "weaker" edge.

⛔ **The fix already exists upstream and is not wired.** `buildBlockPhases`
(`strength-primary-plan.ts:333-348`) writes `config.phase_structure.phases` with an explicit
`Deload` phase per cycle; `plan-phase.ts:93` resolves it; `phaseNameToWeekIntent:135` maps
`deload → recovery`. `deload.ts:6-13` even documents the swap to make. This is a plumbing job.

### ⛔ F3. The new protocol is invisible to the protocol reader — and that turns the generic claim back on

`coach/index.ts:3998`: `protocolId: planConfig?.strength_protocol ?? null`.

`materialize-plan/index.ts:3312-3318` records the fact plainly: **a strength-primary plan never writes
`config.strength_protocol`.** It identifies itself as `config.source = 'strength_primary'`, and
materialize-plan has the fallback. **The coach does not.** So on every Strength Focus block:

- `readStrengthProtocol(null)` → `default: return null` (`strength-protocol-read.ts:106`). The block's
  own reading never speaks.
- `protocolExpectsE1rmToDip(null)` → **false** (`:120` only whitelists `five_by_five`,
  `upper_aesthetics`, `durability`). That flag is the suppressor at
  `coach-week-insights.ts:246`.
- Strength posture on a Strength Focus goal is **`develop`** (`src/lib/non-race-goal-seeds.ts:289-291`,
  `get_stronger` → strength develop, run/bike maintain, swim out), which satisfies the
  develop-only gate at `coach-week-insights.ts:255`.

**Result: a false, un-suppressed sentence on the week read — "Estimated one-rep maxes have been
sliding — the one being built."** (`:259-262`) on a block whose prescription is the reason they dipped.
Same class as Q-166 (the false "pull back" that had to be reverted).

Also on the same null: `coach/index.ts:2215` `resolveProfile(planConfig?.strength_protocol)` →
`DEFAULT_PROFILE = durability` (`strength-profiles.ts:164`). So the coach resolves a **durability RIR
profile for a 5/3/1 block** — the exact Q-192 / D-322 failure, third instance, on a protocol whose own
registry entry (`strength-profiles.ts:132`) says `usesRir: false`. Currently harmless because no RIR is
collected (the targets are inert), but it is a live wrong answer waiting for a reader.

⚠️ **And `strengthProtocol` is fed 3 of its 6 fields** (`coach/index.ts:3997-4001`): no `weekInBlock`,
no `isDeloadWeek`, no `workingPct`. So even for `five_by_five` the ceiling clause
(`strength-protocol-read.ts:65`) can never fire and the deload suppression (`:55`) never fires.

### ⛔ F4. The Cross-training row can tell him to ease off his running because of a deload

`cross-training-read.ts:109-117`. `focus` = the `develop` discipline = strength. Its `verdict` is the
protocol-blind e1RM verdict from F2. `pushed` = any other discipline with ACWR > 1.1.

When the e1RM read dips (F2) and the run side is ramping — which is exactly what a hill week does — the
row emits:

> *"Your strength is slipping while your running climbs. If strength is the priority, easing the
> running is the lever…"*

**A prescriptive line, off a number that moved because the plan said 60% that week.** This is the
highest-consequence output of F2 and F3 combined, because unlike a trend arrow it tells him to change
what he is doing.

### ⛔ F5. Exercise identity is resolved FIVE different ways

| # | implementation | used by | behaviour |
|---|---|---|---|
| 1 | `_shared/canonicalize.ts` | `exercise_log`, `workout_facts`, the whole e1RM series | dictionary → canonical key |
| 2 | `_shared/strength/match-exercises.ts:56` | **the execution score** | normalize + **fuzzy `includes()`** (`:124`) |
| 3 | `compute-facts/index.ts:1300` | `planned_sets/reps/weight` on the fact | **raw `name.toLowerCase()`**, exact only |
| 4 | `StrengthCompareTable.tsx:26` | **the Performance table** | local normalize, exact only |
| 5 | `workout-detail/index.ts:767` | the Previous column | a fifth inline copy of #4 |

The header of #2 says *"Do not write a second matcher."* There are four others.

**What this produces, deterministically:** planned `Barbell Back Squat`, logged `Back Squat`.
Matcher #2 tier-2 fuzzy matches → the session scores as **matched and graded**. Matcher #4 does not →
the table renders **two rows**, one Planned-only and one Completed-only. The screen shows the lift
twice, once as missed and once as unplanned, while the Execution % above says it landed.

Also: `StrengthCompareTable.tsx:230` computes `status: 'matched' | 'skipped' | 'swapped'` and
**never renders it.** A skipped lift and a lift that was never planned look identical — a row with a
dash on one side. That alone is most of the "messy".

### ⛔ F6. The Performance table shows the 5/3/1 ramp as three sets at the top weight

The composer authors the real per-set prescription in `set_plan`
(`strength-primary-plan.ts:390-405`); `weight`/`reps` deliberately carry the **top set** so old
consumers don't break. `materialize-plan/index.ts:1056` (`carrySetPlan`) carries `set_plan` through,
with a comment explaining exactly why: *"Without this pass-through the logger prefills the top weight
onto all three sets — a number the athlete was not asked to lift."*

**Two readers, and the wrong ones are reading:**

- `StrengthLogger.tsx:1849` reads `set_plan` ✅ (so the athlete logs 170 / 180 / 190)
- `AllPlansInterface.tsx:1826` reads `set_plan` ✅
- `StrengthPerformanceSummary.tsx:14-39` **ignores it** — takes `s.sets`, `s.reps`, `s.weight`
- `StrengthCompareTable.tsx:236-246` then **replicates the top-set weight across all N sets**
- `match-exercises.ts:67-86` (`normalizePlannedExercise`) **also ignores it**, same replication

**What Michael sees:** Planned reads `5 reps @ 190 / 5 reps @ 190 / 5 reps @ 190`, Completed reads
`5 @ 170 / 5 @ 180 / 5 @ 190`, and the per-exercise `Vol:` line shows a **negative volume delta on a
perfectly executed session** (`StrengthCompareTable.tsx:461-471`).

**And it reaches the score.** `analyze-strength-workout:518-528` computes `weightProgression` from
planned set 1 vs completed set 1 — 170 vs 190 = −10.5%; on a 5s week the opener is 65/85 = 76.5% of the
top set, so **≈−23%**, and `weightScore = 100 − |23| = 77` (`:896`). Load is 30% of the execution
score, so **arithmetic: every correctly executed main lift loses ~7 points** (≈93% instead of 100%).

### ⛔ F7. A hill session is graded on its warm-up and cool-down

`granular-pace.ts:903-918`: a run counts as an "interval workout" if **any** step carries a pace
target, and `calculateIntervalPaceAdherence:347-354` then scores **only the steps that carry one** —
the filter tests for a pace target and `executed`, not for `role === 'work'`.

The hill expander (`materialize-plan/index.ts:1578-1620`) is deliberately built the other way:
warm-up, jog-down and cool-down carry `pace_sec_per_mi`; **the four hard climbs deliberately carry
none** (§2.2 — pace is invalid on a gradient, and the comment says "Do not 'fix' this by adding one").

**So the pace score for Hill Repeats is computed over the warm-up, the jog-downs and the cool-down.
The session itself is unscored.** On the walked-descent variant it is warm-up + cool-down only.
`execution_adherence` is then `(pace + duration) / 2` (`analyze-running-workout:1492`).

The plan side of hills is clean — token priced at `run_hills: 0.90` (`workload.ts:43`), expander
correct, grade and descent carried in the token. It is only the *reading* that is wrong.

### ⚠️ F8. The per-lift trend floor is scaled off SESSION cadence, so more lifting days makes each lift harder to read

`assemble.ts:220` computes `spw.strength` = 90-day **strength workout** count ÷ weeks. That value is
passed to `resolveThresholds('strength', spw)` (`strength.ts:174`) which uses it as a **per-lift**
cadence — its own comment says the reference is "a TYPICAL per-lift cadence (1.2/wk)"
(`thresholds.ts:23-29`).

**Arithmetic, not observed.** A 4-day Strength Focus block → spw ≈ 3.5:
- `minSessions = clamp(3 + 1 + 1) = 5` (`thresholds.ts:54`) — each lift needs **5 sessions in 42 days**
- `freshnessDays = clamp(round(14 × 1.2 / 3.5)) = 7` — a lift goes `needs_data` **8 days** after its
  last session

At one session per lift per week that is borderline by construction, and one skipped week or one
schedule slip drops the lift off the screen. **The more he lifts, the stricter the gate gets.**
Compounding: `liftSeriesFromExerciseLog` (`assemble.ts:144`) drops any lift with fewer than 2 points
before the classifier ever sees it.

### ⚠️ F9. Nothing in the payload tells State what block it is in

`coach/types.ts:162-170` — the plan slice is `has_active_plan`, `plan_id`, `plan_name`, `week_index`,
`week_intent`, `week_focus_label`, `week_start_dow`. Plus `primary_discipline` at `:399`.

**Absent: the protocol, the week-in-cycle, leader-vs-anchor, and "this week is the measurement."**
The engine knows all four (`buildBlockPhases:333`, `setsForWeek:52`, `cycleForWeek`), and
`GoalsScreen.tsx:143` proves the client can already detect a strength block from
`config.source === 'strength_primary'`. State just is not told.

This is the root of Michael's sentence. Every plan-blind read above is downstream of it.

One consequence worth naming: **week 3 is not marked anywhere on the session.**
`strength-primary-plan.ts:1255-1257` is explicit — *"Nothing here marks it: the sets themselves carry
it."* The only machine-readable trace of a measurement is `set_plan[].amrap`, which lives on the
**planned** row, while the e1RM is computed from `exercise_log` — a table with no link to the plan.
That is Q-227 item (3), located precisely.

### ⚠️ F10. Q-208, in one concrete place

`analyze-running-workout/lib/plan-context.ts:29-35` fetches the plan `where status = 'active'`. A
session on a finished or replaced plan returns null context — no week index, no phase, no intent — so
its Performance read silently loses the plan framing. A Performance surface showing history across
blocks is exactly where this bites.

Same file, `:41-51`, re-derives the week index inline off **Monday**, while `_shared/plan-week.ts:41`
honours `plan_contract_v1.week_start`. **A second week-index lineage** — the same shape of bug D-261
fixed for phase.

### ⚠️ F11. Smaller things, listed so they are not rediscovered

- **RIR is 20 free points.** `analyze-strength-workout:1215` — `rirAdherence` defaults to **100** when
  there is no RIR. On a protocol that never collects it, every session gets 20 of 100 for free and the
  real signal is capped at 80. `component_attribution` will also never name RIR as the mover.
- **The RIR confidence gate is a no-op** (Q-227 item 1). `compute-facts:929-951` buckets by `avg_rir`;
  null falls to `preferred`. Fails safe, reads as live.
- **`advance_untrusted` has no reader** (Q-227 item 4, D-335). A shaky e1RM renders identically to a
  clean one.
- **The difficulty tap writes and nothing reads** (Q-227 item 2, D-326 layer 1).
- **Swim is postured `out` while the block books swims.** `non-race-goal-seeds.ts:289` sets swim
  `out` for `get_stronger`; the composer books two courtesy swims
  (`strength-primary-plan.ts:687+`). `StatePerformanceSection.tsx:753-755` dims a non-develop,
  non-maintain discipline to the bottom — so the plan schedules a discipline State treats as dropped.
- **`unplanned` is a subtraction, not an attach read.** `assemble.ts:391` —
  `max(0, done − planned)` per discipline. It never consults `planned_id`, so a wrongly-attached
  session and a correctly-attached one are indistinguishable to it. (Robust to F1 — noting it so
  nobody "fixes" it.)
- **Bodyweight pattern list is a regex.** `StrengthCompareTable.tsx:203` —
  `/dip|chin-?ups?|pull-?ups?|push-?ups?|plank/`. The protocol's own complement rule emits
  `Inverted Row` and `Box Jump`, neither of which is in it. Cosmetic (weight column), but it is
  another private vocabulary next to `exercise-config.ts`.

---

## 3. WHAT IS FINE — do not rebuild these

- **`classify.ts` is good.** One classifier, pure, `asOf` injected, three noise layers, staleness
  decay, `withheld` as a distinct state from `holding`. The problem is never the classifier.
- **The plan side of the new protocol is correct.** Percentages, working number, rounding direction,
  ramp carried per set, hill token priced and expanded with grade + descent, phases written per cycle.
- **`match-exercises.ts` is the right matcher** — slot-as-unit, declared swaps not docked, undeclared
  misses still skips. It should be the *only* one.
- **The swim row's refusal to grade** is a model for the rest.
- **D-270 convergence held.** `response-model/weekly.ts:225` reads the spine's per-lift direction
  instead of re-deriving one. One direction, one substrate — that part worked.
- **`plan-phase.ts` is the single phase resolver** and it already handles `phase_structure`. It is the
  wire to pull on, not a thing to build.

---

## 4. THE ORDER I WOULD FIX THESE IN

Ranked by consequence per unit of work. Items 1-3 are all plumbing to facts that already exist.

1. **F1 — put a content check on the strength auto-attach**, and narrow `activate-plan`'s sweep. This
   is the one actively corrupting stored history, and history is what every trend reads. Cheapest
   real fix: require the logged session to share at least one canonical main lift with the planned
   row before attaching, and drop `'completed'` from the candidate statuses so a link can't be stolen.
2. **F2 — feed `isDeloadWeek`.** Carry the resolved phase onto each series point. `phase_structure`
   already says which week is a deload; `deload.ts` already documents the swap. Fixes the false
   "slipping", the cratered dot, and the dead-flat row in one change, and it unblocks F4.
3. **F3 — one line: fall back to `config.source === 'strength_primary'`** where the coach reads
   `strength_protocol`, then give `strength_protocol_read.ts` a `strength_primary` case. Until the
   case exists, `protocolExpectsE1rmToDip` should return **true** for it — silence beats a false claim.
   Also feed the three missing context fields.
4. **F6 — read `set_plan` in the two places that don't.** Makes the Performance table tell the truth
   about the ramp and stops docking a correct session ~7 points.
5. **F5 — delete matchers #3, #4 and #5.** Route the Performance table through the server's match
   result, and render the `status` it already computes.
6. **F7 — score a hill session on the work steps, or don't score its pace at all.** Grading a warm-up
   is worse than an honest "no pace target on this session".
7. **F9 — add protocol / week-in-cycle / is-measurement to the payload's plan slice.** The
   generalisation of 2 and 3, and the thing that makes the next protocol cheap instead of another
   round of this.
8. **F8, F10, F11** — real, lower blast radius.

---

## 5. WHAT WOULD SETTLE THE ARITHMETIC

Everything in §2 is traced from code. The *magnitudes* are computed, not measured. What closes them:

- **F2:** a deno fixture — one lift, six weekly points at the real 5/3/1 percentages including a
  deload, through `computeStrengthState`. Assert the verdict and `latestE1rm`. Keep it as a permanent
  regression.
- **F6 / F1:** a fixture through `calculateExecutionSummary` with a `set_plan`-authored planned row
  (expect ≈93, not 100) and with a mismatched planned row (expect 20).
- **F7:** a fixture through `calculatePrescribedRangeAdherenceGranular` with the hill expansion.
- **F3:** grep a real Strength Focus plan's `config` for `strength_protocol` — expect absent. Then
  read the week narrative on State.

⛔ None of the above needs prod data, and none of it needs Michael's numbers.
