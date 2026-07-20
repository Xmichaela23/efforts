# STATE SCREEN AUDIT — 2026-07-20

> **STATUS: IN PROGRESS.** Client render + coach payload traced; load reconciler, race
> block and no-plan state still open (see STILL TO TRACE). Every finding below is
> code-verified with a file:line; two are corroborated by device screenshots (2026-07-20
> 09:21, wk 3 of a Get-stronger plan). Nothing has been fixed — findings only, by
> Michael's instruction.
>
> Companion to `docs/STATE-SOURCE-MAP.md` (2026-07-14) — that doc maps each row to its
> substrate and its silent exclusions and remains authoritative for those. This one covers
> what it never did: the coach payload, duplicate scoring, stranded output, and whether
> the screen serves the athlete's goal.


Extends `docs/STATE-SOURCE-MAP.md` (built 2026-07-14, 35 State-touching commits since).
Scope per Michael: continuity + confidence across the whole screen, each card's purpose,
all disciplines, all goal/plan types. Findings first, no code changes.

## CARD INVENTORY — what actually renders, in order

Source: `src/components/context/StateTab.tsx` (1815 lines) + `StatePerformanceSection.tsx` (589).

| # | Card | Renders when | Source field |
|---|---|---|---|
| 1 | WEEK header — week label | always | `week.index` |
| 2 | intent summary (plan name + wk N of M) | has plan | `wsv.week.intent_summary` |
| 3 | load headline | always | `buildLoadHeadline()` — CLIENT-COMPOSED |
| 4 | "open for more" → readinessWhy, readinessSuggestion, **coach paragraph** | collapsed by default | `wsv.coach.narrative` |
| 5 | Race-week guidance bullets | race week | `wsv.coach.grounded_race_week_guidance_v1` |
| 6 | LOAD bar + sparkline | always | `LoadBar` component |
| 7 | Last race card | post-race | `lastCompletedRace` |
| 8 | Race day prompt | race day | conditional |
| 9 | BODY — endurance signals | always | `rm.visible_signals` filtered to endurance |
| 9b | BODY fallback "This week" | when no signals | `rm.overall_training_read.summary` |
| 9c | Cross-training | when present | `load.cross_training_signal` |
| 10 | READINESS — energy/soreness/sleep | check-in exists | `checkinReadiness` (CLIENT-QUERIED) |
| 11 | this week · planned vs actual — bar + accent | counts exist | `wsv.week_execution_v1` |
| 12 | PERFORMANCE — per-discipline rows + strength per-lift | always | `wsv.trends.display` + `rm.strength.per_lift` |
| 13 | SWIM re-test nudge | gated | `useSwimBaselineNudge` (CLIENT) |
| 14 | SIGNAL — longitudinal nudge | gated | `shouldShowNudge` (CLIENT policy) |
| 15 | RACE — readiness/projection block | has race | `primary_race_readiness` etc |
| 16 | NEXT — key sessions remaining | always | `data.week.key_sessions_remaining` |

**16 blocks on a screen whose stated job is to answer four questions.**

## THE CARD × WINDOW MAP — what each card offers, over what period

Every window below is code-verified. **Ten distinct time frames on one screen.**

| Card | What it offers | Time frame | Labelled on screen? |
|---|---|---|---|
| Plan line (`intent_summary`) | plan name + week N of M | position only | n/a |
| Load headline (`buildLoadHeadline`) | one-word load verdict | rolling 7d (reconciled status) | via the section caption |
| Paragraph (`coach.narrative`) | week narrative | **calendar week-to-date** | no |
| LOAD bar + ACWR | points + share by discipline | rolling 7d; ACWR = 7d ÷ 28d | **yes** — "rolling last 7 days vs your typical week", "288 pts · rolling 7d" |
| BODY — how hard it feels | session RPE vs normal | **7d vs 28d norms** (`coach:938`, `avg_session_rpe_7d` vs `norms28d.session_rpe_avg`) | partial — "as of {date}" |
| BODY — cross-training | interference / stress read | 7d signals vs 28d norms | no |
| READINESS | energy / soreness / sleep | latest check-in; arrow over last 3 | **yes** — "today / yesterday / Nd ago" |
| Planned vs actual bar | session counts | **planned = WHOLE week; actual = week-to-date** | no — and the asymmetry is the F21 bug |
| Upkeep accent | volume vs declared target | **28d trailing** (credit clause wrongly uses week-to-date — F15) | partial — "4 weeks now" |
| STRENGTH | e1RM per lift | last 6 weeks | **yes** — "ESTIMATED 1-REP MAX · LAST 6 WEEKS" |
| RUN | durability dot + arrow | dot = 12wk range; arrow = 6wk, needs 8 steady runs | **yes** — "vs your 12-week range", "6 of 8 steady runs for a trend" |
| SWIM | count / distance / longest | last 8wk | **yes** — "last 8wk" |
| BIKE | power or efficiency | 8wk | **yes** — "over 8wk · 6 rides · 5d ago" |
| RACE | VDOT + projection | plan start → now | no |
| NEXT | upcoming key sessions | forward, this week | **yes** — dated |

**CREDIT WHERE DUE — this is unusually honest.** Most cards state their own window, which the field largely does not do. That discipline is a real asset and should survive any refactor.

**The two real problems are therefore NOT hidden windows:**
1. **Ten windows is more than anyone reconciles at a glance**, labelled or not.
2. **The two that clash most are adjacent.** LOAD (rolling 7d) sits directly above planned-vs-actual (calendar week-to-date). Both labelled, both honest, and on a Monday they still read as "288 points" above "you did nothing" — because the eye compares them and two grey captions do not stop it.

**Two genuine labelling gaps:** the planned/actual asymmetry (F21) and the upkeep credit clause (F15). Both are already filed as bugs.

## FINDINGS SO FAR

### F1 — The coach paragraph is collapsed by default. (VERIFIED)
`StateTab.tsx:728` — `useState(false)`. Rendered at :1423 inside `narrativeOpen &&`.
The entire LLM-teardown effort (D-304, D-306, payload v117→v122, 30 deno tests, two
full sessions) produced a paragraph that is **hidden behind "open for more" unless the
athlete taps.** Nobody has said this is wrong — but it means the deterministic prose is
not what the screen communicates by default. Worth a decision.

### F2 — BODY has a competing "this week" summary. (VERIFIED)
`StateTab.tsx:1533` — when `visible_signals` is empty, BODY renders
`rm.overall_training_read.summary` labelled "This week". That is a THIRD week-level
prose read, alongside the load headline (#3) and the coach paragraph (#4), computed
somewhere else again. Three sources, one question. Needs trace: who writes
`overall_training_read`, and can it contradict the paragraph.

### F3 — Load headline is composed ON THE CLIENT. (VERIFIED)
`StateTab.tsx:1249` calls `buildLoadHeadline()` from `src/lib/load-headline.ts`.
Violates smart-server/dumb-client (CONSTITUTION Law: surfaces render, never re-decide).
Every other week-level verdict is server-composed. Needs check: can the client headline
contradict the server paragraph.

### F4 — Adaptation substrate is run-only. (VERIFIED this session)
`compute-adaptation-metrics/index.ts:359` gates on `sport === run|running|walk|hike`;
:407 on `strength`. **No ride branch. No swim branch.** Rides/swims get an adaptation
record stamped poor/0-confidence with no `workout_type`, so `block-adaptation` drops
them from every lane silently — not even into the excluded counts.
Consequence: `adaptation_score` is a run+strength number wearing a whole-athlete label.
A cyclist gets two empty lanes.

### F5 — An empty lane scores as WORST, not unknown. (VERIFIED this session)
`block-adaptation/index.ts:~178` — when no long runs exist, `longPct` is null and the
code falls to `clamp(longSamples/4,0,1)*2-1` = **-1** at zero samples.
Not doing long runs is scored identically to doing them badly. Q-179 bug class, one
layer down in the substrate. Currently 5% of the blend on `hybrid`; would be 50% under
`marathon_prep`.

### F6 — Three of five focus weightings are dead code. (VERIFIED this session)
`block-adaptation/index.ts:91-98` — `deriveFocusFromCounts` returns only `hybrid` or
`unknown`. `base`, `marathon_prep`, `recovery` are unreachable via the coach path
(coach calls with no focus override at `coach/index.ts:2520`). The `marathon_prep`
guardrail that stops a strength drop from penalising the score has never executed.

### F7 — Two different engines answer "how is it going". (VERIFIED this session)
`adaptation_score` (block-adaptation, 4-week, focus-weighted blend) and the composer's
per-discipline ACWR floor (`coach-week-insights.ts:~231`) both claim the
"is it going well" question, from different substrates, with no awareness of each other.
The coach computes `adaptation_score` every run and **discards it** at `coach/index.ts:2521`,
keeping three raw percentages.
This is the "different scoring methods" disease Michael named, confirmed.

### F8 — The imperative string tree survived the teardown, in BODY. (VERIFIED)
`_shared/response-model/weekly.ts:526` `computeOverallTrainingRead` — a ~25-branch
if/else tree minting prose, rendered in BODY at `StateTab.tsx:1533` whenever
`visible_signals` is empty. Sample output:
- "Recovery week — easy movement only, no quality sessions."
- "Sharpen, don't strain."
- "Light week so far — keep building."
- "Add a goal to direct training."
**These are imperatives.** The copy law is fact-first, conditional consequences, never
imperatives. This is the SAME SHAPE as `intent_summary` — which was cut to "plan name +
week N of M" last night precisely because it was "a ~130-line tree of ~25 mostly-
IMPERATIVE strings". The teardown removed one tree and left its twin standing one card
below. Nobody looked at it because it isn't the LLM.

### F9 — FIVE week-level prose reads, from five different engines. (VERIFIED)
1. `intent_summary` — coach, position only (v122)
2. `buildLoadHeadline` — **client**, `src/lib/load-headline.ts`
3. `coach.narrative` — coach composer (`coach-week-insights.ts`), collapsed by default
4. `overall_training_read.summary` — response-model tree (F8)
5. `week_execution_v1.accent` — week-accent composer
Each answers "how is your week going" from a different substrate. No engine knows what
the others said. Contradiction is unguarded — the only cross-check is inside the
composer (its own clause-suppression rules), which cannot see 1, 2, 4 or 5.
**This is the "franksteined" complaint, made concrete.**

### F10 — `PostureLine` is dead code that documents a bug it doesn't fix. (VERIFIED)
`StatePerformanceSection.tsx:503` — defined, never rendered (no call site anywhere).
Carries a 12-line comment explaining the Q-179 bug it closes. It closes nothing.
Client-orphaned on purpose (Michael rejected the consoling register), but the code +
comment remain and will mislead the next session into thinking posture speaks on screen.

### F11 — The stale raw-ACWR label is confirmed dead payload. (VERIFIED)
`coach/index.ts:5460-5466` mints `label` from the bare ratio: `back off` / `rest now`.
That is a ratio prescribing alone — the D-281 bug Q-166 reverted.
Consumer check: `LoadBar.tsx:37` `loadVolumeColor` only handles the RECONCILED words
(balanced / productive / build more / a bit high / pull back). Neither `back off` nor
`rest now` is handled anywhere in the client. **No consumer. Safe to delete** (still
trace non-client readers before cutting).

### F12 — File header lies about ship status. (VERIFIED)
`StatePerformanceSection.tsx:5` — "NOT YET SHIPPED — under review." It is shipped and
rendering the Fitness section. Same drift at `StateTab.tsx:1653`.

### F13 — `docs/SPEC-state-headline.md` still exists post-ship. (VERIFIED)
Violates the spec lifecycle in CLAUDE.md (a spec dies on ship; substance folds into a
D-NNN). Doc-rot engine, exactly as CLAUDE.md describes it.

### F14 — Four disciplines, four instruments, four clocks. (VERIFIED — mostly BY DESIGN)
| discipline | instrument | window | verdict? |
|---|---|---|---|
| strength | per-lift e1RM (primary lifts only) | 6wk | yes |
| run | decoupling / durability | 6wk, steady runs only | yes |
| bike | power (hard rides) or efficiency (easy rides) | 8wk | yes, dot only once FTP accepted |
| swim | volume facts (count/distance/longest) | 8wk | **NO — by design** |
The no-roll-up decision (`StatePerformanceSection.tsx:546`) is explicit and correct:
clock mismatch makes a cross-discipline headline lossy. **Not a defect.**
BUT: the product's question 1 ("am I getting more efficient?") has **no answer for
swimming at all**, and question 3 ("am I losing fitness somewhere?") cannot see swim.
For a triathlete that is a third of the sport, silent. Deliberate (Q-038 clouding, no
forced CSS test) — but it is a positioning gap, not just a data gap.

## SECOND PASS — server side, driven by the 2026-07-20 device screenshots

### F15 — The upkeep sentence mixes two windows. (VERIFIED — explains the live screen)
`coach/index.ts:5300-5337`. The measurement is a **28-day trailing** window
(`WINDOW_WEEKS = 4`, `perWeek` = 4-week distance / 4). The CARRIERS clause is built from
`counts` — which is **this calendar week's** planned-vs-done (`week_execution_v1`).
On the live Monday screen: 4-week trailing says "6 of 18, 4 weeks now"; `counts.done` is
0 for every discipline because the week just started, so `carriers` is empty and the
credit clause silently drops.
**Result on screen:** "Running's at about 6 of your 18-mile upkeep — 4 weeks now." with
NO "Riding and swimming carried the endurance load" — despite the load bar directly
above showing ride 28% + swim 16%.
The sentence's claim and its credit clause are measured over different spans. The
shortfall gets a 4-week window; the mitigation gets a 0-day window. **It reads harsher
than the data supports, and it will do this every Monday.**

### F16 — The upkeep line is NOT the Q-179 bug. (RESOLVED — banner lead closed)
It fires ONLY for a discipline whose declared posture is `maintain`
(`coach/index.ts:5316`), against that discipline's own stored target
(`target_weekly_miles`). Run on a Get-stronger plan IS declared maintain, and 6 vs 18
for 4 weeks is a real gap against a target the athlete set. **Correct behaviour.**
The banner's suspicion was wrong; F15 is the real defect in that sentence.

### F17 — "Handling combined load well" over-claims its scope. (VERIFIED)
`coach/index.ts:5566-5572`. Fires when five STRESS signals are all absent (RPE rising,
HR drift worsening, strength fading, RIR dropping, body concerned). It never looks at
volume, adherence, or upkeep. So it means "no interference signs detected" — but it
SAYS "Handling combined load well," which reads as an all-clear on training.
Live consequence: it renders in green two inches above "you've been at a third of your
run target for 4 weeks." Neither is wrong; together they are the app arguing with itself.
**Same bug class as the composer's all-clear over-claim, fixed last night** ("every
discipline landed" → "what the plan asked for landed"). Same fix: scope the claim.

### F18 — The Fitness section is HANDED the athlete's goal and throws it away. (VERIFIED)
`StatePerformanceSection.tsx:514` accepts `primaryDiscipline` and `planWeek` as props.
**Neither is referenced anywhere in the component.** Order comes from a hardcoded
`ORDER_IDX = { strength: 0, run: 1, swim: 2, bike: 3 }` (:533).
Michael's strength read happens to lead only because strength is hardcoded first.
A runner on a marathon plan gets the same order.

### F19 — The goal TYPE never reaches State at all. (VERIFIED)
`grep build_muscle|get_stronger` across `state-trend/`, `response-model/` and the State
components returns **nothing**. The screen cannot tell a strength goal from a hypertrophy
goal. The banner's "goal-picks-instrument" job (e1RM leads for get_stronger, volume leads
for build_muscle) is not partially wired — it is **entirely absent** from this surface.
Answers Michael's "does it work for every goal type": no, it has no idea what the goal is.

### F20 — "PR" is scoped to 6 weeks but named like it's forever. (VERIFIED)
`StatePerformanceSection.tsx:129` — `isPR` = `sampleCount >= 2 && latestE1rm >= bestE1rm - 0.5`.
`bestE1rm` is "best estimated_1rm **in the tracked window**" (`strength.ts:81`), and the
window is 6 weeks (the row's own header says "LAST 6 WEEKS").
So PR means "the highest of the handful of estimates in the last 6 weeks."
An athlete returning after a layoff gets a PR badge on a lift well below their real best.
**Compounding it:** the same row prints "provisional" (3–4 samples,
`bike-fitness.ts:80`). The screen says *don't trust this yet* and *personal record* on
one line. Live: Bench PR +5.4% and OHP PR +8.6%, both marked provisional, 3–4 sessions.

### F21 — The planned-vs-actual bar compares a 7-day plan to a 0-day result. (VERIFIED)
`coach/index.ts:5223` — `planned` counts the WHOLE week's planned sessions
(`plannedArr` = `plannedWeek`, unbounded). `done` is explicitly bounded to
`[weekStartDate, asOfDate]` (:5219).
`StateTab.tsx:174` `WeekMixBar` draws both on ONE shared scale
(`scale = max(totalPlanned, totalDone, 1)`) with **no partial-week guard and no numeric
labels** — just two colored bars.
So every Monday the athlete sees a full planned bar above an empty actual bar, with no
text explaining why. On the live screen this sits directly under a LOAD bar reporting
288 points across four sports.
**The prose layer HAS a partial-week guard** (`partialWeek` in the composer, the Q-177
trap). The visual layer does not. The guard was applied to the sentence and not to the
picture.

### F22 — TWO stacked mix bars, same visual language, different everything. (VERIFIED)
1. "WHERE YOUR LOAD IS GOING" — `LoadBar` — **load points**, **rolling 7 days**, % shares.
2. "this week · planned vs actual" — `WeekMixBar` — **session counts**, **calendar week
   to date**, raw counts.
Both are horizontal stacked bars, same discipline colors (`getDisciplineColor` in both),
stacked within a few inches. Different unit, different window, different denominator.
Nothing on screen distinguishes them except two small lowercase captions.
This is the doubling disease rendered literally — the same picture drawn twice from two
different truths.

### F23 — The readiness label machine is fully built and effectively never renders. (VERIFIED)
Server: `coach/index.ts:5586` maps readiness to OVERREACHED / LEGS LOADED / LEGS SORE /
EFFORT UP / FATIGUED / LOW FATIGUE / ABSORBING / TAPER / RECOVERY / LOW vs BASELINE.
Behind it: D-232's "surgical" fatigue refinement, loaded-legs detection on full-body days,
novel-movement naming — and **five payload version bumps** (v49, v52, v53, v56, v58)
spent refining it.
Client: `StateTab.tsx:1232` reads it, and passes it to exactly ONE place —
`buildLoadHeadline` (:1252). Inside `stateSlot` (`load-headline.ts:41`), the readiness
phrase is computed and then discarded: `if (l) return l;` — **the load word always wins**.
Readiness only surfaces when there is NO load verdict at all.
The header chip that used to show it was deliberately removed (`StateTab.tsx:1382`,
"Chip Option A"), and nothing replaced it.
**A well-built system whose output goes nowhere — the exact disease CLAUDE.md names.**
Not starved (its inputs are fine). **Stranded on the output side.**

### F24 — `readinessColor` is dead. (VERIFIED)
`StateTab.tsx:1237` computes a five-branch color map. Zero references. Left behind when
the readiness chip was removed.

### F25 — A dormant load gate went LIVE via an unrelated fix, and its own doc still says it's inert. (VERIFIED)
`_shared/load-status-reconcile.ts` header: *"Gate 2 ... fails SAFE — see Q-136: plan_phase
is null on all snapshot rows, so 'unknown' is the live path and **Gate 2 is inert until
phase labeling is populated upstream**."*
That is no longer true. `compute-snapshot/index.ts:581` now populates `plan_phase` from
the single resolver (D-261 / Q-138 — "was a dead null stub"), and the coach resolves its
own `weekIntent` off the same resolver (`coach/index.ts:1045`).
`plan-phase.ts:141-143` confirms `build` and `baseline` are both reachable.
**So Gate 2 now fires**: in a build or base week, an uncorroborated load 'high'/'elevated'
is softened to the band ACWR earns. That directly changes whether the athlete is told to
pull back.
Nobody re-verified it when it woke up. A fix in the phase resolver silently activated a
dormant gate in the load reconciler, and no doc in either subsystem records the crossing.
**This is Michael's "every fix opens a hole" complaint, caught in the act.**

### F26 — A no-plan athlete gets an empty bar labelled "planned", forever. (VERIFIED)
`coach/index.ts:5227` keeps a discipline in `counts` when `planned > 0 || done > 0`, so a
plan-less athlete who ran 3 times yields `{run, planned: 0, done: 3}`.
`StateTab.tsx:1636` gates the section only on `counts.length === 0 && !accent` — **no
`hasPlan` check**. `WeekMixBar` then draws a "planned" row with nothing in it above a
full "actual" row.
The positioning is explicit that plan-absence is never a deficit state, and the PROSE
layer honours it (the composer has a whole no-plan branch reading the athlete's own
trailing normal). **The bar does not.** Every plan-less athlete sees an empty "planned"
bar on every visit.
Same class as F21 — the guard was written for the sentence and never applied to the
picture. That is now twice.

### F27 — 153 files in `scripts/`, nearly all one-off debug scripts. (VERIFIED)
`_d183-verify.mjs`, `_d194-card.mjs`, `_coach-dbg2.ts`, `_dbg-apr19.ts` … Each was a
throwaway for one investigation and none were removed. Not a State defect, but it is the
same accretion pattern as the dead code on the screen, and it makes finding the real
harnesses (`fanout-audit.mjs`) hard.

### F28 — The RACE block is built on a running metric. (VERIFIED, with one gap named)
`_shared/race-readiness/index.ts:1` imports `estimateVdotFromPace` / `getPacesFromScore`
from `generate-run-plan/effort-score.ts`. The whole readiness read is VDOT + run
threshold pace (`:25-28`, `:125`). **VDOT is a running metric; a cyclist does not have one.**
The goal display is separately run-gated: `goalMetaFromGoalLite` returns null unless
`isRunPrimary` (`StateTab.tsx:228`), and that gate is applied in four places
(`:785, :912, :1045, :1116`). Note `isRunPrimary` returns TRUE for a goal with **no sport
set** (`:221`) — an unset sport is silently treated as running.
Triathlon IS handled in projections (`race-projections.ts:310` `isSeventyThreeGoal`,
`:572` `isTriEventGoal`), so tri is not blind.
**What I have NOT proven:** whether a standalone cycling race (gran fondo / century /
crit / TT — all four are claimed in `PRODUCT-POSITIONING.md`) produces any race content.
`cycling-goal-race-completion.ts` exists, so something handles cycling races somewhere.
The likely behaviour is the RACE card simply not rendering (`hasRaceContent` at
`StateTab.tsx:1731` requires a projection, an official result, or a race date plus
readiness/goalMeta — and the goalMeta path is run-gated). **That is silent absence, not
a wrong claim** — the better failure mode, but still: the product claims four cycling
race types and State appears to say nothing for any of them. **Needs one cycling-race
fixture to settle.**

### F29 — Three rendering paths for the same projection. (VERIFIED)
`StateTab.tsx:526` renders `projection_display.sections` (grouped, current).
`:544` renders `projection_facts` (flat list) — explicitly "legacy flat list still
supported", gated on the first being absent.
`:555` renders `projection.mismatch_blurb` as a third fallback.
Three generations of the same feature alive at once, each with its own gate. Nothing
records which is current or when the legacy paths can go.

## AUDIT STATUS — what is covered and what is not

**Covered (code-verified):** the client render tree end to end; the coach payload's
week-level fields; the fitness/per-discipline reads; the accent + upkeep composition;
the load reconciler's gates; the readiness label path; week execution; the race block's
sport coverage.

**NOT covered — name these before trusting the audit as complete:**
- **A cycling-race fixture** (F28) — the one open sport question.
- **`compute-snapshot` internals.** `STATE-SOURCE-MAP.md` (2026-07-14) covers the
  substrate and its silent exclusions; I did not re-verify those four findings against
  today's code, and 35 State-touching commits have landed since it was written.
- **The NEXT row** (`key_sessions_remaining`) — read but not traced to its writer.
- **Nothing here has been run.** Every finding is a code trace plus two device
  screenshots. No fixture was executed against any of it.
- `StatePerformanceSection` — per-discipline rows, all 4 disciplines
- `LoadBar` + `load_status` reconciler
- `week_execution_v1` + week-accent
- `visible_signals` / `overall_training_read` writer
- readiness state machine
- RACE block — projection vs readiness vs divergence
- NEXT row
- Goal/plan-type coverage: what happens on build_muscle, no-plan, tri, duathlon
- Dead: stale ACWR label `coach/index.ts:5464`; dead BODY aerobic row (per source map)
