# AUDIT — the upper test session, week 1, Standard Focus (All Rounder)

**Written 2026-08-31 by the build terminal, on Michael's order.**

⛔⛔ **REVISED 2026-08-31 EVENING, AFTER READING HIS ACTUAL ROWS** (his typed go-ahead, read-only,
scoped to his equipment chips, his plan row and his week-1 sessions). **Two of this document's
conclusions were wrong and are corrected in place — §5a and §2.** Both were dated-artefact theories,
both were wrong, and his own screen was right. The corrections carry the live data that settles them.

**Evidence classes used on every line.** `composed` = I ran the real composer at HEAD and read the
row it produced. `code-traced` = read from source, no execution. `rendered` = from Michael's own
export or screen, relayed. `live` = read from his database rows, read-only, on his typed permission.

## 0. THE LIVE ROWS — the facts everything below is now measured against

*(live, read-only, 2026-08-31 evening)*

| fact | value |
|---|---|
| **his declared strength kit** | Barbell + plates · Dumbbells · Squat rack / Power cage · **Bench (flat/adjustable)** · Pull-up bar · Resistance bands · Ab wheel · **Incline bench** |
| **the block** | `b4ebe840` · frame `all_rounder` · 12 weeks · **created 2026-08-31 22:15:36 UTC** — about ninety minutes after commit `94dc2722`, and roughly four hours before this audit |
| **his slot picks** | `iso_pull_a: rear delt machine` · `braced_pull: chest supported row` · `braced_push: dumbbell bench press` · `iso_push: tate press` · `ham_iso: hip thrust` · `quad_iso` + `braced_leg: bulgarian split squat` · `braced_hinge: back extension` · `iso_pull_b: drag curl` |
| **his seeds** | bench 150 · squat 110 · deadlift 150 · overhead press 100 |
| **the Test: Upper row** | `tags: ["standing_plan","test_week","1rm_test"]` — **the tag IS on his row** |
| **what he logged** | bench `45x10 · 75x5 · 105x3 · 130x7 (amrap)`, press `bar x7 · 50x5 · 70x3 · 85x8 (amrap)`, plus an ab wheel rollout |
| **what it wrote** | baselines updated 23:45 UTC — bench **155**, overhead press **105** |

⛔ **He was right and the earlier draft of this document was wrong on both counts.** The block is
hours old, not a week; the `1rm_test` tag was present on the row he logged against.

**Harness.** `composeWeek` from `_shared/standing-plan/compose.ts`, frame `all_rounder`, column
`standard`, `roundTo: 5`, competition lifts Bench Press / Back Squat / Deadlift, run under Deno.
Seeds and working numbers stated per section. The harness lives in the session scratchpad; it reads
the repo and writes nothing.

---

## 1. What the BOOK prescribes for this session

**p274 (The All Rounder, standard column), day 1 — "Upper body: Push"** — six slots, in this order:

| # | slot as p274 prints it | intent | category | pattern |
|---|---|---|---|---|
| 1 | 1 × ME: secondary push | ME | competition | push_upper |
| 2 | 1 × DE: secondary push | DE | accessory · secondary | push_upper |
| 3 | 1 × HYP: braced push | HYP | accessory · braced | push_upper (muscle: **chest**) |
| 4 | 2 × HYP: focused push/pull (arms) superset | HYP | accessory · focused | push_upper |
| 5 | 2 × HYP: focused push/pull (arms) superset | HYP | accessory · focused | pull_upper |
| 6 | 1 × HYP: focused push | HYP | accessory · focused | push_upper |

*(code-traced: `frames.ts:493` `ALL_ROUNDER_STANDARD` day 1. p274 prints no core slot on any of its
four lifting days — see §5.)*

**But week 1 is not that session.** p215 and p247 say to pretest before a programme, so week one's
day 1 is **the test**, not the frame's day (code-traced, `working-number.ts:254 TEST_WEEK_INDEX`).
p215's protocol: work up in three steps — **1.00A / 1.10A / 1.15A**, where A ≈ 75% of the predicted
max — and take the last step for **max clean reps**. That last set is what every weight in the block
is derived from.

**p218 is the law for every number on the frame's own rows** (transcribed in
`SOURCE-viada-hybrid-athlete.md` §A1, page images open):

| intent | reps | load | RIR | sets |
|---|---|---|---|---|
| ME | 1–5 | 90–100% | **no RIR target** | 1–3 |
| DE | 2–4 | 70–80% | 3–4 | 4–6 |
| SKILL | 3–5 | 75–85% | 3–4 | 3–5 |
| HYP | 6–12 | — (no load stated) | **0–2** | 3–4 |

---

## 2. What the app MATERIALIZES for that session

**composed at HEAD**, seeds bench 155 / OHP 100, `roundTo: 5`:

```
[Monday] STRENGTH: Test: Upper   tags=["standing_plan","test_week","1rm_test"]   cite=Viada p215
  Bench Press      sets 3  reps "6, 5, max"  weight 130  load_prescribed true  slot_intent ME
                   set_plan [115x6, 125x5, 130xmax(amrap)]
  Overhead Press   sets 2  reps "6, max"     weight  85  load_prescribed true  slot_intent ME
                   set_plan [75x6, 85xmax(amrap)]
```

**That is the whole session at HEAD — two rows.** No accessories, no floor rows. Two things produce
that:

- `testDaySession` (`compose.ts:1702`) **replaces** the frame's day 1 entirely on the test week; the
  six slots above are not built at all (code-traced, `compose.ts:2562`).
- the muscle floor is now **excluded by a hard rule** from a test day — `isTest: true` on the dosing
  session (`compose.ts:2585`), shipped in the current HEAD commit.

⛔⛔ **CORRECTED. His block was built at 22:15:36 UTC today** *(live)*, and its Test: Upper row
carries `Hanging Leg Raise` and an ab wheel rollout alongside the two tested lifts. The floor
exclusion (`isTest`) is commit `93ceb7d3`, timestamped **22:48 UTC — thirty-three minutes after his
block was written**, and it is not deployed. So the accessories on his test day are exactly what the
deployed composer produced, and the fix that removes them has not reached anything yet.

⚠️ **The general hand-off still holds and is worth stating once:** the composer authors twelve weeks
up front, so a fix reaches an existing block only when `rematerialize-standing-block` rewrites the
weeks that have not happened — and it deliberately skips weeks that are done or past (`testDayCutoff`,
code-traced `restate.ts:96`). ⛔ **That is a hand-off, not an explanation for a defect.** It was used
as one twice in this document's first draft and it was wrong both times.

### 2b. The DE incline row, reproduced exactly

Composing week 2 with a kit that has **an incline bench and no dumbbells**, working number
0.96 × 155 = 148.8:

```
  Incline Bench Press  sets 4  reps "2-4"  weight 90  percent_1rm 0.7  load_basis derived_ratio
                       target_rir 3.5  slot_intent DE
                       notes "About 85% of your bench press — derived, not tested."
                       set_plan [45x5 warmup, 70x3 warmup, 80x2 warmup, 90x4, 90x4, 90x4, 90x4]
```

**`45x5, 70x3, 80x2, 90x4 ×4` — byte for byte what his export printed** (composed, matching a
rendered artefact). The row is reproducible at HEAD; nothing about it is historical.

---

## 3. The delta, line by line

| # | what the book asks for | what the app produced | delta |
|---|---|---|---|
| 1 | p215: three steps 1.00A / 1.10A / 1.15A, last for max reps | bench `115x6, 125x5, 130xmax` | **none.** A = round(155 × 0.75) = 115; 1.10A = 126.5 → 125; 1.15A = 132.25 → 130 |
| 1b | same, for the press | OHP `75x6, 85xmax` — **two rungs, not three** | **ours, and correct.** At A = 75 the 1.10 and 1.15 rungs both round to 85, which would have prescribed five reps at the test weight immediately before the test. The colliding warm-up is dropped; the measured step never moves (`working-number.ts:214`) |
| 2 | p218 DE: 2–4 reps, 70–80%, 3–4 RIR, 4–6 sets | 4 × 2–4 @ 90, `target_rir 3.5`, `percent_1rm 0.7` | **the weight is defensible, the sentence beside it is false** — see §3a |
| 3 | p218 HYP: 6–12 reps, 0–2 RIR, no load | 3 × 6–12, `target_rir 1`, `weight: "By feel"` | **none.** RIR 1 is the midpoint of his own 0–2 band. See §3b |
| 4 | p218 ME: 1–5 reps, 90–100%, **no RIR** | `1 × 1-5 @ 135`, `percent_1rm 0.9`, no `target_rir` | **none.** Bottom of the band, as `INTENSITY_STARTS_LOW_IS_OURS` rules |
| 5 | p215: warm up to roughly 75% of the predicted max | the ME row carries `45x5, 75x5, 100x3, 120x2` before its top set | ours, labelled, and only on ME/DE/SKILL rows |

### 3a. The DE incline at 90 — the NUMBER is right, the NOTE is wrong

Michael's report: *p218's 70–80% of his 155 bench is ~110–125, and it prescribed 90.*

The arithmetic the engine actually did (code-traced, `compose.ts:1645` and the `derived` block at
`:1425`):

```
working number      = 0.96 × 155  = 148.8
DE at the band floor= 0.70 × 148.8 = 104.2  → 105
incline ratio       = 0.85 (exercise-config primaryRef bench)
prescribed          = 0.85 × 105  = 89.25  → 90
```

**Read as "70% of his estimated incline max", 90 is right.** An incline max of about 0.85 × 155 =
132 puts 90 at 68% — inside p218's 70–80% band at its floor, which is where every slot in this
engine is supposed to open. Michael's 110–125 reads the percentage against the **flat bench**, which
would put the incline row at ~85–95% of the incline's own max on a slot whose purpose is bar speed at
3–4 RIR. **The engine is closer to the book than the complaint. I am not calling this a bug.**

⛔ **But the row's own sentence is false as the athlete reads it.** It prints:

> About 85% of your bench press — derived, not tested.

90 lb is **58%** of his bench. The 85% is the *movement ratio* — the estimate of what an incline max
is relative to a bench max — and the copy states it as a fraction of the bench weight. Next to a row
also labelled `percent_1rm 0.7`, an athlete has two numbers on one card, neither of which describes
the 90 in front of them. **This is the defect, and it is a one-sentence copy defect, not a maths
one** (code-traced, `compose.ts:1645`).

### 3b. RIR 1 on the accessories — source-faithful

p218's HYP band is **0–2 RIR** (source doc §A1, transcribed with the page image open). The composer
stamps the midpoint, 1 (`targetRirForIntent`, `compose.ts:720`). Michael's "the book says 1–2" is
**p86**, which is the reserve for accessory work *added on top* — and the engine already uses 1.5 for
exactly those rows (`ACCESSORY_TARGET_RIR`, `compose.ts:733`). **Two pages, two doses, both
implemented, on the right rows.**

⚠️ What is genuinely open is a display question, not a number: the card shows a bare `1` where the
page prints a band. Nothing tells the athlete that 0–2 is the range and 1 is our midpoint.

### 3c. The reps pre-filling 1 — ⛔ NOT A DEFECT. CLOSED, AND RECORDED SO NOBODY REOPENS IT

*(rendered — Michael's own screenshot, 2026-08-31 night)*

His Back Extension row on an ordinary session has four columns: **SET · PREVIOUS · REPS · RIR**. The
**reps box is empty**, which is the ruling working exactly as written, and the `1` he reported sits
under **RIR**, with *"target 6-12 · 1 in reserve"* printed beneath it. **He was reading the RIR
column.** RIR 1 is p218's own midpoint for a HYP slot (§3b).

⛔ **There is no rep-prefill defect and there never was.** Two earlier passes of this document
theorised a mechanism for it — a band-floor prefill on the `strength_exercises` path — and while that
code branch does differ from `parseFromComputed`, **it is not what he saw and it is not evidence of
anything.** It is not on the open list.

⚠️ What the screenshot DOES show is the display question from §3b, still open and still cosmetic: the
card prints a bare `1` where the page prints a band of 0-2.

### 3d. The warm-up ramp on the incline row — ours, and a ruling not a bug

`slotTakesRamp` returns true for ME, DE and SKILL (`warmup.ts:163`). The source's sentence is about
*"your sport movement for the day"*, singular; ramping every priced row is **ours** and is labelled
as such in the file. On day 1 that means the athlete ramps to a heavy bench, then ramps again — three
more warm-up sets — into an incline press with the same joints. **That is a judgement call for
Michael, not a defect**: the alternative reading (the day's opening lift only) is equally supported
by the page.

---

## 4. Equipment conflicts, and the gate itself

**The gate is two functions** (code-traced, `src/lib/strength-gear.ts`): `canPerform` decides IF, and
`equipmentFitRank` decides WHICH FIRST. Rank `0…99` = a loadable route (barbell, dumbbells, cable,
machine, rack/bench); `100+` = **only a band route is satisfiable**; `null` = cannot perform. The
chip→key mapping is a substring match (`:185`), and it is where the surprises live.

**Probed at HEAD against a barbell/dumbbell home gym with a FLAT bench only:**

| movement | rank | verdict |
|---|---|---|
| rear delt machine | `null` | correctly gated OUT |
| incline bench press | `null` | correctly gated OUT |
| **lat pulldown** | **101** | reachable **on the band route only** — and still offered |
| **tricep pushdown**, **face pull** | **101** | same |
| leg curl | 0 | legitimate — its route is `[dumbbells, bench]`, a DB leg curl |
| seated calf raise | 0 | legitimate — `[dumbbells, bench]`, corrected 2026-08-29 |
| pec deck, leg press, chest supported row | `null` | correctly gated OUT |

**Add one chip — "Incline bench" — and both of his reported picks appear** (composed at HEAD):

```
iso_pull_a  (Pull isolation)      db_press  (Press variation)
   - rear delt machine               - larsen press
   - preacher curl                   - incline bench press
   - spider curl                     - close grip bench press
   - drag curl                       …
```

and the built week places **`Rear Delt Machine`** on day 1. **His report is reproduced at HEAD.**

**⛔ THE FINDING: the gate is doing what it was told; the NAME is the defect.** `rear delt machine`
is tagged `[['dumbbells','incline_bench'], ['machine']]` (`strength-gear.ts:766`) — a deliberate,
documented decision that a seated DB rear-delt raise on an incline bench is the same movement. The
athlete satisfies the **dumbbell** route and is then shown the **machine** name. The app has a
mechanism for exactly this — `bandRouteName` renames a movement reached on its band route — and
there is no equivalent for a movement reached on its dumbbell route. Same class as the lat pulldown,
which Michael already named.

**Three conflicts, ranked:**

1. ⛔ **Name-vs-route.** `rear delt machine` printed at a kit with no machine (composed). Fix is a
   rename at the route, not a gate change — gating it out would remove a movement he can do.
2. ⛔ **The band tier is still winning cells.** `lat pulldown`, `tricep pushdown` and `face pull` sit
   at rank 101 and are the ONLY option in `braced_pull` for this kit (composed) — the 2026-08-24
   device finding's exact shape, narrowed but not closed.
3. ⚠️ **`braced_push`, `braced_hinge` and `braced_leg` return an EMPTY pick list** for a home gym
   (composed). Correct — nothing is offered that cannot be done — but the athlete gets a control with
   no options and no sentence saying why.

---

## 5. What the athlete can change, per row

| row type | Swap | other |
|---|---|---|
| frame ME / DE / SKILL | **yes** on an ordinary session — `planned_name` is set by `parseFromComputed` (:2348) and the button is gated on it alone (:5335) | rename; add to plan; swap the rest of the block (`persistPlanSwap`, :5527) |
| frame HYP accessory | same | the picker also owns these cells **before** the block is built (`ALL_ROUNDER_PICK_KEYS`) |
| muscle-floor row | same on an ordinary session — it is a step like any other | ⛔ **not offered in the picker at all.** A floor row is chosen by the engine and the athlete never saw a menu for it |
| **any row on a session tagged `1rm_test`** | **NO ROW CAN SHOW IT.** Both branches of the test path hand-build rows and neither sets `planned_name` (`createBaselineTestExercise` :1116; the accessory builder :2929) | — |
| the DE secondary slot | ⛔ **no pick exists.** `db_press` is not in `ALL_ROUNDER_PICK_KEYS` — p274's DE cell takes no athlete choice, by ruling | the athlete can only Swap it after the fact, in the logger |

### 5a. The control on his tested lifts — CORRECTED, and it is live at HEAD

**Two explanations were offered for this and both were wrong.** The first blamed his client build.
The second blamed the block's age. His rows kill both: the block was created at **22:15:36 UTC
today**, ninety minutes after the tag shipped, and **the tag is on the row**.

**What his saved session proves about which branch ran** *(live)*. He logged bench as
`45x10 · 75x5 · 105x3 · 130x7`. That empty-bar → ~50% → ~70% → test-set shape is
`createBaselineTestExercise` and nothing else builds it — `parseFromComputed` would have handed him
the three composed steps with no ramp. **So the test branch ran, the tag was honoured, and every row
on that session was built with `planned_name` unset.** The saved rows confirm it: `planned_name` is
`undefined` on all three.

⛔ **AND THAT IS THE DEFECT, BECAUSE THE LOGGER KEYS TWO OPPOSITE CONTROLS OFF THAT ONE ABSENT
FIELD** (code-traced, `StrengthLogger.tsx`):

```
:5335   exercise.planned_name                                   →  [ Swap ]
:5347  !exercise.planned_name && name.trim().length > 1         →  [ Add ]   "Add this exercise to the plan"
```

`planned_name` is assigned in exactly one place — `parseFromComputed:2348` — and the test branch
never reaches it. So on **every row of a test session**, the second gate opens: his Bench Press and
Overhead Press, the two most heavily prescribed rows in the whole block, are rendered as though the
athlete had typed them in themselves, and offered the control for adding an unplanned lift **to the
plan**. The prescribed rows lose the action that belongs to them and gain the one that does not.

⚠️ **THE SHAPE OF THE REPORT IS THEREFORE RIGHT AND THE LABEL IS THE ONLY THING IN QUESTION.** There
is exactly one control in this file labelled "Swap" and it cannot render on his rows; there is one
labelled "Add" and it renders on all of them. Either way the finding is the same and it is live at
HEAD on a block built today: **a test session's rows are indistinguishable, to the logger, from
exercises the athlete added by hand.** It is one missing field, and the fix is to stamp the
prescribed name on the rows the test branch builds — not to hide a button.

⚠️ Three more things fall out of the same absence, all code-traced: those rows carry no
`target_reps`, so the rep-band label never renders and `exOpenRepBand` (:5782) is false; the ab wheel
row lost its `target_rir: 1.5` between the plan row and the saved session; and a floor row on a test
day cannot be swapped at all.

### 5b. A second live path, independent of any of the above

`StrengthLogger` reads `usePlannedWorkouts()` at `:630`, and **that hook's select does not include
`tags`** (`usePlannedWorkouts.ts:113` and `:189`, code-traced). When the logger opens with no
`scheduledWorkout` and finds the session itself (`:2794`), the object it works from cannot carry the
tag — so `isBaselineTestWorkout` falls back to the name test, `"Test: Upper"` does not contain
*"baseline test"*, and **a correctly tagged test week is not recognised as a test at all**: no ramp,
no "Save as baseline" button (`:6553`), and `parseFromComputed` stamps `planned_name` on every row.

⚠️ **That is not what happened to him today** — his ramp proves the tagged path ran — but it is a
live hole at HEAD, it produces the mirror-image defect, and eleven of the thirteen
`isBaselineTestWorkout` call sites read the `scheduledWorkout` PROP rather than the session the
logger found for itself, so on that path none of them fire.

## 6. What the live rows closed, and the one thing still open

**Closed by the read:**

- **The kit.** He has both a flat/adjustable bench *and* an incline bench, so `incline_bench` is
  granted and the rear-delt and incline routes are reachable exactly as §4 reproduced them.
- **`rear delt machine` is his own pick**, stored in `slot_picks.iso_pull_a` — the engine did not
  choose it. The gate let the picker offer it, and the picker showed him the execution name while the
  built row printed the machine name. The naming split in §4 is the whole of it.
- **`chest supported row` is also his pick** (`braced_pull`) and is in the same class — its route is
  `[dumbbells, incline_bench]`, and `executionName` already knows to call it
  *"Chest-Supported Row (incline bench, dumbbells)"*.
- **The date question** — see §5a.

**Still open, and honestly unresolved:** the `1` against a `6-12` target. His week-1 test session
carries no 6-12 row at all — its accessories are `Hanging Leg Raise 3 x 8-10` and an ab wheel
rollout at 10. The 6-12 rows are the frame's HYP cells, which first appear in **week 2**, a session
he has not logged. So either he was reading week 2 on the plan screen, or the pairing came from
somewhere this audit has not looked. **I am not going to name a mechanism for it without the row that
shows it.**

## 7. Findings, ranked

| # | finding | class | evidence |
|---|---|---|---|
| 1 | **The derived-weight note is false as written.** "About 85% of your bench press" beside a weight that is 58% of it | defect · copy | code-traced + composed |
| 2 | **A movement reached on its dumbbell route is printed under its machine name** (`rear delt machine`). There is a `bandRouteName` for the band route and no equivalent for this one | defect · naming | composed at HEAD |
| 3 | ~~rep-band prefill~~ — **WITHDRAWN. Not a defect** (§3c). His screenshot shows the reps cell empty; the `1` was the RIR column | not-a-defect | rendered |
| 4 | **A test session's rows are indistinguishable from hand-added ones.** The test branch sets no `planned_name`, so the prescribed lifts lose Swap and gain **Add to plan**. Live at HEAD on a block built today | defect · logger | live + code-traced |
| 4b | **`usePlannedWorkouts` never selects `tags`**, so a logger that finds its own session cannot see `1rm_test` — no ramp, no baseline save, and every row stamped as prescribed | defect · data fetch | code-traced |
| 5 | **The band tier still wins cells** — `braced_pull` offers only `lat pulldown` (rank 101) to this kit | defect · gate | composed |
| 6 | An empty pick list is shown with no explanation for `braced_push` / `braced_hinge` / `braced_leg` | gap · copy | composed |
| 7 | The DE row ramps after the ME row already ramped the same joints — ours, labelled, and a ruling for Michael | ruling | code-traced |
| 8 | RIR 1 on HYP rows is p218's own midpoint. **Not a defect.** The band is not shown | not-a-defect | source + composed |
| 9 | The DE incline at 90 is p218's floor applied to the estimated incline max. **Not a defect.** | not-a-defect | source + composed |

---

## 8. WHAT WAS CHANGED (2026-08-31 evening) — in the tree, NOT committed, NOT deployed

Two fixes, both on Michael's order. `tsc` 0 errors · `_shared` 2472/2472 · `_shared` + `materialize-plan`
2541/2541. Lint on the touched client file is unchanged from before (6 pre-existing `any` errors).

**1 — the rear delt name, display only.** `executionName` already held the answer
(*"Chest-Supported Rear Delt Raise"*) and **only the picker called it**, so the dropdown and the built
week called one movement two different things.

- `compose.ts` — new `execution_name` field on `StrengthExercise`, set by a new `rowExecutionName`
  helper that makes the same two calls the picker makes, in the same order. **A competition lift is
  never relabelled.**
- `materialize-plan` — carries the field at both strength seams, and **drops it if an equipment
  substitution or an athlete swap has rewritten `name`**, because the label describes the original
  movement.
- `strengthFormatter.ts` — the planned row renders `execution_name || name`.

⛔ **`name` is untouched everywhere.** This is not `bandRouteName`, which may move `name` because the
string it moves to is itself a catalogue movement; an execution label is not, so it travels beside
the name and never in it. Logged-vs-planned matching is unaffected.

⚠️ **NOT DONE, AND IT NEEDS A RULING.** The logger's exercise name is an **editable input bound to
`exercise.name`** — typing in it IS how a swap is recorded. Putting a display string in that field
would either break the rename-is-a-swap contract or record a phantom swap, so the logger still shows
the canonical name and I have not invented a second line under it. The plan and session screens now
read correctly; the logger's field is Michael's call.

**2 — the incline copy line.** Now: *"70% of what this lift's own max works out to — about 85% of
your bench press — derived, not tested."* The old line stated the movement ratio as a fraction of the
bench weight. ⚠️ The closing clause stays lowercase and last because
`standing-plan-derived-load.test.ts:86` pins that literal string.

---

## 9. THREE MORE FIXES (2026-08-31, later) — in the tree, NOT committed, NOT deployed

`tsc` 0 errors · `_shared` + `materialize-plan` **2541/2541** · lint on `StrengthLogger.tsx` is
**214 problems against a 215 baseline** — one fewer than before these edits.

### 9.1 The wrong button on a test lift — CONFIRMED ON HIS SCREEN, then fixed

*(rendered: two screenshots, same night, same build. "Log: Lower body: Push" shows **⇄ Swap** on
every row and he says that screen is right. "Log: Test: Lower" shows **+ Add** on the Back Squat row.)*

`planned_name` is the only field either control reads — `:5335` → Swap, `:5347` → Add — and the test
branch built every row without it. Now stamped in both builders:

- **the accessories** — `planned_name`, and with it `target_reps` and `target_rir`, which is why his
  ab wheel arrived carrying a 1.5 reserve and saved with none, and why an auto-regulated row on a
  test day showed no target band at all.
- **the tested lifts** — ⛔ **CORRECTED, see §9.1a.**

⚠️ A floor row on a test day is swappable as a consequence of the same stamp. Nothing else changed.

### 9.1a ⛔ NO SWAP EITHER — Michael's ruling, 2026-08-31: *"no swap"*

The first fix stamped the prescribed name on the tested lifts too, which turned the wrong button into
a **different** wrong button. Swap substitutes one movement for another, and the movement on that row
is the one every working number in the block is derived from — substituting it does not change a
session, it changes what the next eleven weeks are priced off.

**A tested lift now offers neither control.** The stamp is gone from that branch, and the Add button
is suppressed on any row carrying a scored set, so the absence of the stamp cannot fall through to
"add your own bench press to your plan" again. ⚠️ The marker is the same scored-set flag that `Add
Set` and the baseline write already read, so all three agree about what a test row is by
construction.

⚠️ **The accessory rows on a test day are unchanged** — they keep the prescription stamp and their
Swap control. They are ordinary work; swapping one costs the test nothing.

### 9.2 The abs on his test day — two doors, and only one of them was being closed

**The facts, dated** *(git + live)*:

| | |
|---|---|
| his block written | **2026-08-31 22:15:36 UTC** |
| commit `93ceb7d3`, the test-day floor exclusion | authored **22:48:13 UTC** — **thirty-three minutes later**, and still not deployed |

⛔ **So the exclusion did not exist when his block was built**, let alone ship. But that is only half
the answer, and the other half is the one that mattered:

- **`Hanging Leg Raise 3×8-10`** is in his `strength_exercises` — the composer's **muscle floor**.
  This is what `93ceb7d3` excludes, and it will stop for blocks built after it deploys.
- **`Ab Wheel Rollout 1×10`** is **not** in `strength_exercises` at all — only in `computed.steps`.
  It is **his own add**: `plan_adjustments`, `Ab Wheel Rollout`, status active, written
  **22:35:50 UTC** (with a reverted one three seconds earlier — a tap, an undo, a re-tap). It is
  injected at MATERIALIZE time by `planAddInjections`, which filtered on type, date window, movement
  group and a weekly cap — **and had no test-day rule of any kind.**

⛔ **THE FLOOR FIX ALONE WOULD NOT HAVE KEPT HIS TEST DAY CLEAN.** Two independent doors open onto a
test session and only one was being closed. `planAddInjections` now skips any row tagged `1rm_test`.

⚠️ **The floor rule is untouched**, and so is its measured cost — week one losing glutes, calves and
triceps, which he ruled on directly (ENGINE-STATE §B).

**What it takes to keep a test day clean, stated once:** the composer must not place floor volume
there (`93ceb7d3`, needs deploying), and materialize must not inject adds there (this change). Field
practice agrees with both: volume comes DOWN into a max test — peaking guidance is a 40-50% cut, run
in a light week — and no source prescribes accessory work after a max.

### 9.3 A second all-out set on a test row — it was a DATA path, not only a training one

*(rendered: his working set reads "AMRAP · 5 minimum" at 100 lb with **Add Set** under it.)*

⛔ On a `1rm_test` session `isTagRetest` is true, so `amrapReady` (`:3935`) accepted **any** completed
working set — and `setBaselineTestResults` is keyed by exercise, **last write wins**. A set logged
after the test therefore **replaced the tested result on its way to `user_baselines`**. One all-out
set is the test; the second one was quietly overwriting the number the whole block is priced from.

Both ends are closed:

- **the offer** — Add Set is not rendered on a row that carries a scored set (`amrap` or
  `repMaxTest`). ⚠️ Every other row on the session keeps it, including a lift the athlete added.
- **the write** — where a row has a scored set, only that set may write the baseline. A named
  baseline's sub-max path and a hand-added lift are byte-identical to before.

---

## 10. CORE IN THE PICKER (2026-08-31) — Michael's ruling, built. In the tree, NOT committed, NOT deployed

*"keep tests as tests, no add amrap, make abs an option in the picker."* §9 covered the first two.
This is the third. `tsc` 0 errors · `_shared` + `materialize-plan` **2541/2541**.

### What it does

- **Standard Focus's picker now draws a Core cell** — ten controls instead of nine. At his kit it
  offers p223's own five, catalogue spellings: Hanging Leg Raise · Crunch · V Up · Plank With
  Shoulder Tap · Ab Wheel Rollout · Side Plank With Hip Dip.
- **Opt-in and it adds nothing unless asked.** No pick, no core row — verified by composing the same
  week both ways.
- **One slot a week**, on the lightest non-test lifting day, at 3 sets, `8-10 at 1-2 RIR` — the same
  one-slot dose every other accessory on this plan takes. A hold gets seconds and no reserve.
- **Positioned by p142 rule 4** — main → core → isolation. ⛔ **CORRECTED, see §10a.**
- ⛔ **Never on a test day**, same hard exclusion as the floor.

### The three traps this had to get past, and it hit all three

1. ⛔ **The 2026-08-29 backout.** An "Add core" control was built and reverted, and the reason is
   recorded on the `core` spec: the pick reached the week through `fillMuscleFloor`, which fills a
   muscle only when it is BELOW its floor — and a week carrying a weighted knee raise (p223's
   focused-quad movement, prime mover core) already satisfies core, so an explicitly chosen V-up was
   dropped in silence. Raising the target instead **double-placed** the row. That file's own
   conclusion names this fix: *an added row should not go through the floor at all.* It now runs
   after the floor and places the row directly.
2. ⛔ **`picks.placed` is not "on the plan".** It is SEEDED with every slot answer before the day
   loop runs, deliberately, to steer the ENGINE off a movement the athlete already owns. Guarding on
   it made the core row vanish — the same disappearance as the 2026-08-29 attempt, through a
   different door. The guard now asks the built sessions whether the movement is on the week.
3. ⛔ **`pickReachesFrame` returns false for any pick with no frame cell**, which is what core is in
   both frames, so the control still would not have drawn. Core is now exempt, and the exemption
   says why: every other key must name a printed cell or the screen is inventing a slot; core names
   an **addition**.

### What is ours, and it is on the plan

The source gives core its own movement list (p223) and its position inside a session (p142 rule 4).
**It states no frequency and no weekday**, and p274 prints no core row at all — so once a week, on
the lightest non-test day, is ours. It is written into the week's notes as
`CORE_PICK_FREQUENCY_IS_OURS` rather than left implicit, and it introduces no new scalar: one slot is
`MUSCLE_FLOOR_IS_ONE_SLOT`, already the convention for every accessory here.

### One pinned test updated, deliberately

`pick-wire-frame.test.ts` asserted `core` was NOT an All Rounder key — true when written, and the
ruling changes the fact. It now checks the other four p246-only keys and says why core left the list.


### 10a. ⛔ THE POSITION WAS WRONG, AND THE RULE HAD NO PIN

Michael, reading the composed week: *"they need to be placed correctly, read the book."* He was
right, and this is the second time a rule of his was implemented, described in a comment, and
**asserted by nothing** — 2541 tests were green while the core row sat second from last.

**The sentence, both halves of it** (p142 rule 4):

> *"Many athletes are tempted to perform any core/bracing work last in a routine, typically hitting
> **isolation/externally braced work** (for example, machine work) after their main lift and throwing
> in core work at the end. This tends to do the core a disservice — isolation work is rarely degraded
> by a tired core, and core work tends to have a higher skill component than most isolation work."*

⛔ **"isolation/externally braced work" is BOTH accessory categories.** The anchor was the first row
whose GRID category is `focused` — which on the All Rounder's leg day is the **calf raise**. So core
landed behind the back extension, the zercher squat and the goblet squat and ahead of exactly one
row: *"throwing in core work at the end"*, the routine the rule names. The grid calls a goblet squat
`secondary` while p274 uses it as that day's `focused quadriceps`, and reading the category off the
movement instead of off the slot is what let the two disagree.

**The anchor is now the frame's own `slot_intent`** — data the composer stamped, not a category
re-derived from a name. HYP is the accessory block; ME, DE and SKILL are the main and skill work the
rule says core comes after. ⚠️ No frame row is reordered: a SKILL row p274 prints last stays last.

| | before | after |
|---|---|---|
| composed leg day | squat · back extension · zercher · goblet · split squat · **v up** · calf raise | squat · **v up** · back extension · zercher · goblet · split squat · calf raise |

⛔ **The floor's own core rows took the same wrong anchor and are fixed by the same change** — one
owner, `coreInsertIndex`, used by both paths.

**And the rule now has a pin.** `core-placement.test.ts` — four tests: the position, the dose, opt-in
(with an assertion that choosing a core movement changes *nothing else* in the week), and no core on
a test day. ⚠️ **Mutation-tested**: restoring the old anchor fails the position test, and the whole
suite passes again with it back. That is what was missing the first time.
