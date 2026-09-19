# Book-language fix, round 3 (2026-09-18)

Branch `blf/merge`, worktree `/Users/michaelambp/efforts-blf-merge`. Input: the strict recount of the six rebuilt plans
(`recount-after.md`, at c9cfd0a24). Rule: every instruction is the page's own words and numbers, cut, never reworded;
where the book gives no words, nothing prints. Pages were read off the photos where the wording mattered: p109, p247,
p275 (this session), plus the SOURCE doc's quotes for p210, p215, p235, p237–p239, p246, p278, p280.

State: **committed on `blf/merge` only. Not pushed, not deployed, not verified on a device.**

| group | commit |
|---|---|
| A. cards, builder, descriptions | `6ec9a01d3` |
| B. "On Zwift, turn ERG off." | `2e608a18f` |
| C. strides add-on | `bcdfdb3c7` |
| D. "By feel" on strength rows | `a02b927eb` |
| E. test-day planned line | `4894f08ef` |
| F. audit items 11, 16, 17, 26, 29 | `ce9430a5e` |

Checks after every commit: deno tests for the touched modules (the whole suite after F: 5542 passed, the 5 known base
failures only — run-threshold-test:75, 2 in anchor-resolver-lint, 2 in wizard-day-lock.lint); `tsc -p tsconfig.app.json`
305 (base); `check-estimate-provenance.mjs` exit 0. Rule-7 pins rewritten with the book's words in A and C.

---

## 1. Train screen and builder

### Program cards (Train screen)

| program | before | after | page |
|---|---|---|---|
| Run + Ride + Strength | Strength, running and riding run together, year-round, with a pivot to a race or a single sport when one comes up. | This program can be used as an “all-year” program for an athlete who’s interested in multiple different sports. | p275: "This program can be used as an "all-year" program for an athlete who's interested in multiple different sports, ranging from road running to …" (cut) |
| Run + Strength | You get stronger. Four lifting days, four runs. The long run stays under 100 minutes. | Four lifting days, four runs. Mileage will be dictated by experience level, with more proficient runners looking at runs up to 90 to 100 minutes. | p246 table count; p247 Running Notes: "Mileage will be dictated by experience level, with more proficient runners looking at runs up to 90 to 100 minutes here with an emphasis on LT intervals…" (cut) |
| Ride + Strength | Training options for intermediate to advanced cyclists. Six or seven rides, three lifting days. | Training options for intermediate to advanced cyclists. Seven rides, three lifting days. | p280 "training options for intermediate to advanced cyclists"; p278 Standard column: seven rides |

### Run + Strength runs screen

| before | after | page |
|---|---|---|
| Four lifting days a week. Four runs fit around them. | Four lifting days, four runs. | p246 count (same line as the card) |
| Pick how long the long run is. The easy run is 30 minutes. | Pick how long the long run is. | p235 VT1 level 1 "25 to 30 minutes"; the plan built 27:00, so the sentence said a length the week did not hold |

### Endurance step, hard rows (Standard Focus)

| before | after | page |
|---|---|---|
| Choose the workout on the day. | (nothing) | no page |

### Plan description / builder preview (test week)

| before | after | page |
|---|---|---|
| The other lifting days run by feel this week — the numbers arrive once the test is done. | (nothing) | "by feel" is on no page; p215 gives the test only |
| A 3 to 4 percent reduction in working 1RM should be assumed here. This reduction can be gradually phased out in eight to ten weeks. — printed on Run + Ride + Strength and Run + Strength | printed on Run + Strength only | p247 is the Strength + 5K page (Run + Strength) |

### Adjust › Deload

| program | before | after | page |
|---|---|---|---|
| every program | If performance begins to suffer, particularly if the ME lifts underperform 2 weeks in a row, consider running a single deload week. | — | p245 is the Hypertrophy + 5K page; no program here is built from it |
| Run + Strength | (above) | If a powerlifting meet or 5K approaches, I recommend that, 2 weeks out, you switch the program to the deload version. | p247, whole sentence |
| Run + Ride + Strength | (above) | (nothing) | p274/p275 print no sentence on when to deload |
| Ride + Strength | (above) | (nothing) | p278/p280/p281 print none for Base (p280's taper/deload sentence is the Crit program's) |

The line now comes from the server (`DELOAD_LINE` in `setup-copy.ts`, sent by `rematerialize-standing-block` as `deload_line`).

## 2. Ride sessions: drawer, Planned tab, Garmin, Intervals.icu / Zwift

### Anaerobic ride description (drawer, Planned tab, Garmin description, Intervals.icu description)

| before | after | why |
|---|---|---|
| …Each set should start at 110% and progress up to 125–130% by the end. On Zwift, turn ERG off. | …Each set should start at 110% and progress up to 125–130% by the end. | "On Zwift, turn ERG off." is on no page. The endurance fix report and STATE-SOURCES say it was approved 2026-09-18, but neither quotes Michael, and no commit, workorder or decision records him approving that exact line (searched `git log -S "ERG off"` across all branches, and docs/ for "ERG"). So it came off. |

### Anaerobic work steps (p237 floor) — item 16

| place | before | after |
|---|---|---|
| Planned tab, session detail | `45 s @ 253 W and up` | unchanged: `253 W and up` |
| Garmin | power target 253 → 130% of FTP | no power target; step description `253 W and up` |
| Intervals.icu / Zwift | `253-299 W` range (ERG held it) | `253 W and up` text line, step `freeride` (ERG off) |

p237: "best done by feel with a power floor rather than a specific power target". The 130% ceiling was p237's
progressive-option top filled in on every floor. One owner for the words: `ride-power.ts oneSidedPowerText`.
Note: with the ERG sentence gone, Zwift still gets ERG off on these steps, because they go as freeride.

### Easy ride steps (p239 "easy ride below 75%") — item 17

| place | before | after |
|---|---|---|
| Planned tab, session detail | `1:00:00 @ under 173 W` | unchanged |
| Garmin | 0–173 W target | 0–173 W target, and step description `under 173 W` |
| Intervals.icu / Zwift | `freeride`, no words | `under 173 W` text line, `freeride` |

### A single percentage — item 26

| place | before | after |
|---|---|---|
| VO2 warm-up, 5 minutes @ 95% (FTP 250) | `214–261 W`, Intervals `86-104%` | `214–250 W`, Intervals `86-100%` |
| Sweet spot 95% | capped at FTP | unchanged |

One rule: a single printed percentage gets ±10% (TrainingPeaks) and, at or below 100%, never runs over FTP — wherever
it prints. The cap is pp238–239's "as close to threshold as possible without exceeding it"; applying it to every single
number at or below 100% (not only sweet spot) is OURS, ledgered in `docs/STATE-SOURCES.md`.

## 3. Run sessions — the easy run's strides (item C)

| place | before | after | page |
|---|---|---|---|
| step lines | `6 × 30 s stride, Walk/Jog — as long as you need @ HR 143–150 · ref 8:33–9:41/mi between` | `2 × 100-meter stride (begin slow and accelerate to near full tilt)` | p210: "2 × 100-meter strides (begin slow and accelerate to near full tilt)" |
| Garmin / Planned tab step labels | `Stride` ×6, `Walk/Jog — as long as you need` ×5 | `100-meter stride (begin slow and accelerate to near full tilt)` ×2, lap-button, no rest step | p210 prints no rest between the strides and times none |

One owner with the run test (`P210_STRIDE_COUNT`, `P210_STRIDE_LABEL` in `baseline-test-rows.ts`); new token
`strides_p210`. The generic `strides_NxYs` branch the other generators use is unchanged.
Ripple: this replaces the six 30-second strides of 2026-08-28 (a dose marked ours) with p210's two. The strides no
longer take 3 minutes out of the easy run, so the easy run should now build at the length the builder asks for (30:00
where it built 27:00) — inferred from the dose arithmetic in `generate.ts`, not checked on a built plan.

## 4. Strength — "By feel" (item D) and the test day (item E)

### "By feel" stored on strength rows

| before | after |
|---|---|
| `strength_exercises[].weight = "By feel"` on every unpriced row (161 in the dump) | no weight on the row; `load_prescribed: false` still marks it |

Writers removed: `standing-plan/compose.ts` (six rows), `standing-plan/restate.ts` (the return-to-unpriced branch),
`rematerialize-standing-block` (the retest row with no max on file, which also carried "No max on file to aim the
warm-ups — work up until the last set is genuinely hard." — now p215 step 8, as the composer's own test row), and
`shared/strength-system/strength-primary-plan.ts` (assistance rows).
Rows stored before this still carry the string, so the readers print nothing for it: the logger's notes box (three load
paths), the Today drawer, the session deck, and session detail's planned set.

### Test-day planned line (planned sheet, Today drawer, plan export)

| before | after |
|---|---|
| `ME · Back Squat 3×6, 5, max @ 245 lb (Perform the maximum number of repetitions possible with this weight.)` | `Back Squat` / `45 lb · Perform a regular warm-up in your chosen lift, slowly working your way up to a starting weight of 75 percent or so of your predicted max.` / `215 lb × 6 · A weight where you can comfortably perform 8 repetitions but are approaching failure if you had to push to 10. Use this set of 6 to confirm that this feels about right.` / `235 lb × 5 · Perform 5 repetitions with this weight.` / `245 lb · Perform the maximum number of repetitions possible with this weight.` |

p215 steps 1, 2 and 8. The lines are built from the row the logger opens (`plannedTestSession` → `testRowLines`,
`strength/test-session.ts`, one owner). No ME label; each set at its own weight.

## 5. Audit items 11 and 29

- **11, Today drawer strength list:** it built its own `name · sets × reps · weight` line (and printed a stored "By
  feel"). It now prints the server's `computed.strength_lines`, the same lines as the planned sheet. The phone's builder
  (`plainLiftList`) is deleted. A row materialize-plan has not reached prints no lines.
- **29, session title:** `intentTitle` needed a colon, so p278's "ME Upper" went to calendar, Garmin, plans.csv and
  State as "ME Upper" while p246's "ME: Upper" went as "Maximum Effort: Upper". Both now go as "Maximum Effort: Upper"
  (and "DE Full" as "Dynamic Effort: Full"). The stored names are unchanged.

## 6. Left for Michael (not changed)

These are decisions, not wording fixes:

1. **Pace and heart rate on "@ VT1" and easy steps.** p235 gives VT1 by duration and the talk test, no heart rate or pace.
   The steps print Friel zone 2 heart rate and a pace band (`27:00 @ HR 143–150 · ref 8:33–9:41/mi`, recoveries
   `1:00 @ 8:33–9:41/mi`). Recount rows 1–8, 18.
2. **The ±10% watt band** around a single printed percentage (TrainingPeaks) and the **±2% work / ±6% rest pace bands**
   on runs (OURS). The page prints one number. Recount rows 3–16.
3. **The exercise how-to texts** (32 distinct; ExRx / NSCA / ACE / OURS, no book page).

## 7. Found while doing this, not changed

- The p247 lower-body **weight reduction itself** (3.5%, not only its sentence) still applies on Run + Ride + Strength ME
  lower days that follow a hard run (`progression.ts prescribedLoad` does not read the program). Only the sentence was
  limited to Run + Strength.
- The Run + Strength runs screen still shows the easy row's length as "30 min" (`frames.ts easyRunMinutes: 30`); with the
  strides untimed the plan should now build that easy run at 30:00 (inferred, not checked on a built plan).
- The Today card (`SessionDeck`) still shows one weight (the top set's) beside a tested lift on the test day.
- The Adjust deload line for Run + Strength contains "5K" because it is p247's own sentence.
- `scripts/check-standard-focus-hard-rows.mjs` (a manual browser check) still expects the old hard-row line.

## 8. Deploy list (when approved)

Client: the phone bundle (Adjust deload line, Today drawer lines, logger notes, session deck).

Edge functions (direct importers of the touched shared files; run the CLAUDE.md grep over the full chain before
deploying): activate-plan, analyze-cycling-workout, analyze-running-workout, analyze-swim-workout, auto-attach-planned,
calendar-sync, coach, compute-core-verdict, compute-facts, compute-workout-analysis, compute-workout-summary,
create-goal-and-materialize-plan, delete-plan, endurance-checkpoint, export-data, generate-strength-plan,
get-arc-context, get-week, intervals-connect-key, intervals-oauth, materialize-plan, rematerialize-standing-block,
run-jobs, send-workout-to-garmin, strength-test-session, validate-reschedule, workout-detail.

`PLAN_WRITER_VERSION` is 4, so built Standing Plan blocks are rewritten once on the next get-week.

Unverified until seen on a device: the Garmin step description showing "253 W and up" on the watch, and the Intervals.icu
text line reaching Zwift.
