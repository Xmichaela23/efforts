# Stage 1 notes — sessions get a warm-up, and one place owns their length

**2026-08-20. Work order: `WORKORDER-finish-the-swaps-2026-08-20.md` § Stage 1. Evidence:
`REPORT-session-structure-and-clumping-2026-08-20.md`.**

**State: PUSHED — no. DEPLOYED — no. VERIFIED ON A DEVICE — no.** Nothing has left this machine.
Every claim below is fixture-backed or sweep-backed, and none of it has been seen in the app.

---

## 1. WHAT WAS BUILT

`supabase/functions/shared/strength-system/quality-session.ts` — new, 280 lines.

A session builder can no longer state a duration. It declares a **core** — its work, in SECONDS, as
its tokens will actually expand — plus an **allowance**, and receives `{ duration, steps_preset }`
**as one object** to spread onto the session:

```ts
const wrapped = wrapQualitySession(sprintCore(wave), SPRINT_ALLOWANCE_MIN, 'run');
return { day, type: 'run', name: 'Flat Sprints', description: … + wrapperNote(wrapped), ...wrapped.fields, tags };
```

⛔ **That is the part that makes a bare session impossible, and it is structural rather than a
guard.** There is no expression left in the composer that produces tokens without a warm-up: the
duration and the token list leave the constructor together, so a builder cannot set one and forget
the other. The old shape — a hand-typed `duration`, a hand-typed budget constant, and a token that
silently overruled both — cannot be written any more.

### The allowance, spent

The constants did not change value; they changed **meaning**. `SPRINT_SESSION_MIN = 35` used to
claim "this session is about 35 minutes long" and was wrong by 21. It is now
`SPRINT_ALLOWANCE_MIN = 35` — *how much of the week this session may have* — and the constructor
spends it: the core takes what it takes, **everything left over becomes the warm-up and cool-down.**

| session | allowance | core | wrapper | built | was built |
|---|---|---|---|---|---|
| Flat Sprints (leader) | 35 | 822 s | 11 + 10 | **35** | 14 |
| Flat Sprints (anchor) | 35 | 498 s | 14 + 13 | **35** | 14 |
| Threshold Run wk 1 | 45 | 23 m | 11 + 11 | **45** | 23 |
| Threshold Ride wk 1 | 45 | 24 m | 11 + 10 | **45** | 24 |
| Bike Intervals wk 1 | 45 | 32 m | 10 + 3 | **45** | 32 |

### The floor

⚠️ **`WARMUP_FLOOR_MIN = 10`, and it is not a new number.** It is the figure already written down
three times in this app — `materialize-plan` pushes a 600 s warm-up on both hill branches (`:1779`,
`:1831`), and `flatSession` and `generate-combined-plan/session-factory.ts:443` both pass
`warmup_run_10min_easy`. Adopting it rather than authoring a fifth one.

⛔ **The floor outranks the allowance.** When a core is long enough that less than 10 minutes remain,
the session goes OVER its allowance rather than the warm-up going under the floor, and the budget
subtracts what was actually built. That is the block's existing yield order applied to the wrapper
(Hickson — the hard session is paid first, the easy volume flexes around it).

⚠️ **Only the WARM-UP is floored; the cool-down takes what is left and may be zero.** The safety
claim is about starting a maximal effort cold. Flooring both would have pushed the bike's interval
session past its allowance purely to make two numbers look alike.

⚠️ **The floor fires on none of the 61 shapes** — no current session leaves less than 10 minutes. It
is a guard against future inputs, which is exactly why it needed unit tests rather than the sweep.

### `WARMUP_CEILING_MIN = 15`

A product decision with no paper under it, marked as such the way `LONG_RIDE_SHARE` already is. It
fires when the leftover exceeds 30 minutes — reached today only by the anchor threshold ride
(`warmup_bike_15min + bike_thr_1x10min_R3min + cooldown_bike_17min` = 45).

### No expander changes were needed

⚠️ **Both expanders already parse variable-minute wrappers** — `expandRunToken:1364` takes
`warmup_run_{n}min_easy`, `expandBikeToken:1936` takes `warmup_*_{n}min` and prices it at 50–65% FTP.
The bike branches had existed since they were written and **no strength session had ever used one**.
The only production edit outside the composer is one word: `expandBikeToken` is now `export`ed.

---

## 2. THE GATE — `scripts/dump-plans.ts`

⛔ **The sweep now re-expands what it dumped, through the REAL `materialize-plan` expander.** It
imports the production function rather than modelling it — a second implementation of "how long does
this token take" would agree with the composer and disagree with production, which is the disease.

Two assertions, plus one that falls out:

- **LENGTH** — the stated duration equals `Math.round(clockedSeconds / 60)`, which is
  `materialize-plan:3746`'s own expression. This is the 08-18 defect.
- **WARM-UP** — every session tagged `quality` opens with a `warmup` step of at least the floor.
- **A token that expands to NOTHING** — a typo has always been silent here.

It exits non-zero on a violation, so it is a gate and not a report. It writes `test-outputs/_audit.json`.

⛔ **It prints what it could NOT check, every run.** A gate that skips quietly is worse than none:

```
budget-equals-built: 0 violation(s)  ·  skipped 54 club (contentless by design),
                                        0 swim (no callable expander), 0 distance-based
```

⚠️ **The club-day exclusion is on its `club` TAG, never its name.** A club session is tagged
`quality` because that is what it costs the week, while the app deliberately writes no session into a
group run it does not control (§1i).

⚠️ **Two mechanical notes.** The script needs `--no-check` (importing `materialize-plan` drags in
three PRE-EXISTING type errors in `state-trend/assemble.ts` and `strength-equipment-tier.ts`; the
file is `@ts-nocheck` in production for the same reason), and it stubs `Deno.serve` for the length of
one dynamic import because `materialize-plan` binds a port at module scope.

⛔ **THE HONEST FIX IS TO EXTRACT THE EXPANDERS INTO `_shared`, AND IT IS DELIBERATELY NOT DONE
HERE** — that moves a file every edge function bundles, and stage 1 does not touch the deploy surface
beyond one `export`. **Whichever later stage is already inside `materialize-plan` should take it.**

---

## 3. THE SWEEP — 40 of 61 shapes changed

`61 shapes · 61 built · 0 failed · 0 violations`.

⛔ **ZERO easy or long sessions moved by a single minute.** The volume budget arithmetic is
untouched: every allowance keeps its old value, so the same number of minutes is subtracted before
the easy volume is distributed. **The stage changed what the hard sessions CONTAIN, not what the week
spends on them** — which is what "do not change which day anything lands on" required.

What moved, and why:

| session | was | now | why |
|---|---|---|---|
| Threshold Run / Ride, every week | 43 · 37 · 36 · 30 | **45** | the leftover allowance is now the wrapper instead of leaking |
| Hill Repeats, leader weeks | 35 | **32** | the stated duration is now what the token builds — see §4 |
| Hill Repeats, anchor weeks | 35 | **26** | same, and the anchor halves the rep count |
| Flat Sprints | 35 | **35** | *unchanged number, changed session* — the tokens now carry the wrapper |

⚠️ **Flat Sprints does not appear as a diff and it is the whole point of the stage.** Its stated
duration was already 35; what was wrong was that the plan built 14. The readable sweep view prints
durations only, so the fix is invisible there and visible in `raw`:

```
Flat Sprints  35m  ['warmup_run_11min_easy', 'run_sprint_6x12s_r150s', 'cooldown_run_10min_easy']
```

---

## 4. ⛔ A CORRECTION TO THE STAGE-0 REPORT — the hill family was NOT clean

The report said the hill sessions "match to the minute", and the work order repeats it. **That was
computed for LEADER weeks only.** On anchor weeks `vo2RepsFor` halves the rep count and the stated
duration did not move: `HILL_SESSION_MIN` said 35 on every week of twelve while the anchor's token
comes to 26. Same defect as the four named ones, three weeks in twelve, in a session everyone
believed was correct. The stage's own gate is what surfaced it.

**So all four terrain options now come through the constructor**, three of them as `selfWrapped`
cores — the `run_hills_*` expander builds its own 600 s bracket, and this file adds nothing to them
rather than doubling it.

### The one place two numbers legitimately differ, and it is a fact about the watch

The 3-minute hill's descents end on the **lap button**: they reach the watch with no duration, and
that absence IS the instruction (`hills-lap-button.test.ts`). So they contribute zero to
`total_duration_seconds`, and `materialize-plan` writes **32** for that session whatever the composer
says.

- **`duration` = 32** — the card must say what the clock will say, or the wizard and the plan
  disagree, which is the defect this stage closed.
- **The budget still reserves 35** — the athlete really spends those three minutes descending.

⚠️ **These answer two different questions** — *what will the card say* and *what will the day cost* —
and the three-minute gap is now **asserted exactly** in `hard-run-terrain.test.ts` rather than
tolerated. It is the only session where they differ, and the assertion is what stops that spreading.

---

## 5. MUTATION TESTING — 18 mutants, 18 caught, and two survivors were fixed

⛔ **Nothing here was believed until it had been broken.**

**The gate** (mutate the code, run the sweep):

| mutation | result |
|---|---|
| drop the warm-up token from the constructor | **810 violations** (405 length, 405 no-warmup) |
| a core mis-states its work by one rest interval | **90 length-mismatch**, naming the session and both tokens |
| one session goes back to a hardcoded `duration: 43` | **180 length-mismatch** |

**The constructor** (`quality-session.test.ts`, 17 tests, 14 mutants):

Floor → 0 · floor clamp removed · `round` → `floor` · ceiling removed · warm-up takes the smaller
half · cool-down floor removed · zero-minute cool-down emitted · self-wrapped states the allowance ·
self-wrapped gets a second wrapper · budget takes week 1 not the max · budget decoupled from duration
· `wrapperNote` silent · `wrapperNote` speaks for self-wrapped · bike tokens on a run session · an
imperative injected into the copy. **All caught. Baseline clean.**

### ⛔ TWO MUTANTS SURVIVED THE FIRST PASS AND BOTH WERE MY BUG, NOT THE TEST'S

1. **The floor was applied TWICE** — once to the leftover and again in the warm-up clamp. Deleting
   the first changed no output on any input. **The redundant copy is gone**, not left as
   belt-and-braces: two copies of one rule is precisely what this stage is closing.
2. **`round` → `floor` on the leftover passed.** My test used the LEADER sprint, whose leftover is
   21.3 minutes — where `floor` and `round` agree. The ANCHOR sprint (498 s of work, 26.7 left) is
   the case that discriminates: rounding lands it on 35, flooring lands it on 34 and hands a minute
   back. **A test case that cannot fail is not a test**, and this one could not.

---

## 6. THE EXISTING SUITE — 581 passed, 0 failed

Baseline on a clean tree was **564 pre-existing tests, all green**. My change broke **15**, in six
files. Every one is now fixed, and **no existing test was deleted or renamed** (verified by
comparing the test-name list of every file against `HEAD`).

**Twelve were mechanical:** helpers read `steps_preset[0]` expecting the WORK token, and index 0 is
now deliberately the warm-up. They were given a `workTokenOf` helper that filters the bracket rather
than assuming a position — which is more robust than what they had.

**Three were substantive and all three were the hill family's stated duration** (`run-mileage`,
`hard-run-terrain`, `easy-session-spread`). Each now asserts the relationship in §4 explicitly, with
the reason written next to it. ⚠️ **`easy-session-spread`'s bound was made ONE-SIDED**: over-running
the typed miles is still a hard failure (that is what the test is for), and under-running by the
un-clockable descent is bounded and explained.

---

## 7. THE SMALLER QUESTION (a) — SETTLED, AND THE PREVIEW WAS RIGHT

The wizard showed `Flat Sprints 35m`; the built plan said `0h 14m`.

**Traced:** `runPreview` calls `create-goal-and-materialize-plan` with `preview: true`, which returns
`gsGen.plan` — the **composer's** sessions, before `materialize-plan` ever runs
(`create-goal…:2878`). So the card showed the composer's 35, and the plan showed the token sum.
**The preview was estimating a wrapper the composer never built, exactly as the work order
suspected — so the preview was RIGHT and the plan was the one that was wrong.**

It is now one number by construction: the composer states 35, the tokens build 35, and the sweep
asserts it on every shape and every week. ⚠️ **Nothing to fix in the wizard.**

⛔ **Question (b) — the `qualityRunTerrain` seed — was NOT touched.** It is a client-side one-liner in
`NonRaceBuilder:1187` and belongs to a stage that is already in that file. Detail is in the stage-0
report §3b, including the exact reader that makes it load-bearing (`create-goal:2837`).

---

## 8. SIDE FINDINGS — filed, not pursued

- ⚠️ **`_shared/anchor-resolver-lint.test.ts` IS FAILING ON A CLEAN TREE.** One file reads an anchor
  raw and is not on the ledger: `lthr::src/components/TrainingBaselines.tsx`. **Verified pre-existing
  by stashing this stage's work and re-running.** It matters because the 2026-08-20 banner claims
  that ledger "MAY ONLY SHRINK and the test enforces it" — the test is red, so it is currently
  enforcing nothing. Not mine to fix; nobody appears to know.
- The token expanders should move to `_shared` (see §2).

---

## 9. WHAT IS STILL UNVERIFIED, AND WHAT WOULD SETTLE IT

| claim | how to settle |
|---|---|
| A built block's Flat Sprints opens with an 11-minute warm-up on the watch | build a Strong Focus block with a speed hard day, open the session, and check the Garmin export's warm-up array is no longer empty |
| The wizard preview and the built plan now show the same number | build a block and compare the preview card against week 1 |
| Threshold sessions read 45 min and say what their wrapper is | any built block |
| The 3-min hill reads 32, not 35 | a block with a hill hard day — ⚠️ **this is a visible number CHANGE an athlete could notice**, and it is the honest one |

⛔ **None of this is deployed.** `generate-strength-plan` bundles `strength-primary-plan.ts` and now
`quality-session.ts`; `materialize-plan` carries the one-word export. Both need a deploy, and every
other function importing a touched `_shared` file needs one too — **but the composer change only
reaches an athlete when a NEW block is built.** Existing materialized plans are untouched.
