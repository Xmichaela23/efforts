# Book-language fix, round 4 (2026-09-18)

Branch `blf/round4` (off `stage/one-truth-drift` 51ec32bb0), worktree `/Users/michaelambp/efforts-blf-r4`.
Seven items Michael approved on 2026-09-18, one commit each, then the plan-writer version bump.

State: **committed on `blf/round4` only. Not pushed, not deployed, not checked on a phone.**

| item | commit |
|---|---|
| 1. "On Zwift or a smart trainer, turn ERG off." and the guard's `device-instruction:` marker | `9156785ae` |
| 2. Easy ride "under N W" traced to 75% of the accepted FTP (p239) | `2651b5dcf` |
| 3. One ±10% band (TrainingPeaks) for watts and run pace | `627cddc87` |
| 4. Ride + Strength's six-of-seven rides marked ours, ledger rows brought current | `d3ccfbb65` |
| 5. p247's sentence on each ME lower session its reduction touches, in every program | `e193c10d9` |
| 6. Warm-up sets from StrongLifts on plan barbell lifts | `4a8a07678` |
| 7. The rest timer on plan lifts, counting up from 0:00 | `8afbf6657` |
| Plan-writer version 10 → 11 | `0c1e0c60f` |

---

## 1. The ERG line

| place | before (round 3) | after |
|---|---|---|
| Planned tab session note, anaerobic ride | `…Each set should start at 110% and progress up to 125–130% by the end.` | `…Each set should start at 110% and progress up to 125–130% by the end. On Zwift or a smart trainer, turn ERG off.` |
| Garmin workout description | same as the Planned tab | same as the Planned tab |
| Intervals.icu / Zwift description | same as the Planned tab | same as the Planned tab |

- It is back where round 3 removed it (`2e608a18f`): the one session note that the Planned tab and both sends read.
- Guard rule 7 now accepts `// device-instruction: <reason>` in place of a page, the same way it accepts
  `not-instruction:`. A marked line is found and pinned word for word even though it has none of the
  instruction words, so a reworded device line still fails the build. This is written in the rule's header.
- Tested: rewording the line to "…turn ERG off now." fails with both "not pinned" and "pinned line gone".

## 2. "@ VT1" and easy steps keep their numbers

No athlete-facing line changed.

- Easy ride: "under N W", where N = round(0.75 × FTP). The 0.75 is `EASY_RIDE_CEILING_PCT_OF_FTP`, cited to p239
  ("easy ride below 75%").
- Easy run steps keep the easy pace range (Friel zone 2 off threshold), unchanged.

Where the FTP comes from (traced in the code):
- The plan's FTP is set by the one FTP resolver, or by the plan's snapshot, which saved the same resolver's
  answer when the plan was made.
- The resolver returns the athlete's accepted FTP first.
- A new test pins three things: the 75%, the accepted FTP winning over a newer higher estimate, and the printed
  "under 173 W" at FTP 231.

Two cases where N does not come from an accepted FTP. Neither was changed, because the fix is in the one FTP
resolver that every screen uses:
- **No accepted FTP on file.** The resolver uses the learner's estimate when its confidence is medium or high.
  This is its written design ("an athlete who has never accepted gets byte-identical numbers").
- **A plan snapshot taken while the only FTP was a low-confidence estimate.** The snapshot saves that number,
  while the plan's live path refuses low-confidence numbers. The snapshot wins, so that estimate prices the
  plan's rides.

## 3. One band for a single number (TrainingPeaks ±10%)

One function, `singleTargetBand`, now turns every single target number into a range. It is cited to
TrainingPeaks' "+/- 10% from the interval target" beside the code. The plan's watts, the plan's run pace, the
ride score, the Garmin send and the analyzers' fallback all read it. The cap stays: a single percentage at or
below 100% never goes over FTP. It is marked `// OURS` in the code and has its ledger row.

Run pace, sample threshold 7:00/mi:

| step | before | after |
|---|---|---|
| a work step at 100% (4:00 @ 7:00/mi) | `6:52–7:08/mi` (our ±2%) | `6:18–7:42/mi` |
| a recovery the page gives a percentage (1:00 @ 60% → 11:40/mi) | `10:58–12:22/mi` (our ±6%) | `10:30–12:50/mi` |
| easy steps, warm-up, cool-down, "@ VT1" recoveries | the easy range (Friel zone 2) | unchanged |
| race-day pace | one pace, no range | unchanged |

- **Planned tab, session detail:** the new ranges above.
- **Garmin:** the watch's speed target is built from the same saved range.
  - A step with only a single pace used to go as our own widening (±4 / 7 / 12 s per mile, by length) or as
    ×0.97 / ×1.03. It now goes as ±10%.
  - A single text wattage lost its "at least ±1 W" floor.
- **Intervals.icu / Zwift:** rides only, and ride watts were already ±10%, so nothing there changed.
- **Analyzers:** when a run has no saved steps, the analyzers fall back to reading the plan's codes. Their pace
  bands were ours: ±10% on easy and long runs, ±5% on intervals and tempo. They are now ±10% everywhere.
- **Ripple:**
  - A run's work reps are colour-judged against the saved range. A range five times wider means far fewer reps
    read red.
  - The Execution score's time-in-range rises for the same run.
  - Plans already on file keep the old bands until they are rewritten (the version bump below does this).
  - `analyze-running-workout` now imports the band file, so it joins the deploy list.

Ledger: the OURS rows for ±2% / ±6%, the Garmin widening, the ×0.97 / ×1.03 and the analyzer fallback's
±5% / ±10% were replaced by TrainingPeaks rows.

## 4. Ride + Strength, six of seven rides

- No athlete-facing change.
- The rides come from p278's Standard column (seven).
- The six-ride choice drops day 2's easy ride. It was already marked `// OURS` in the code (`frames.ts`,
  `RIDES_COPY`).
- Its two ledger rows still described the old four-of-five week. Both now say six of seven.

## 5. p247's lower-body reduction

**What triggers it (in the code, unchanged; now written down):**
- A challenging run is placed on the day directly before an ME lower day. That day's lower-body rows take the
  cut in weeks 1–9.
- This holds in every program. The weight cut was already applied in every program; round 3 had limited only
  its sentence to Run + Strength.
- "Challenging" is the app's existing hard-run test:
  - a run the program marks as hard, or otherwise
  - an MLSS run or a near-threshold run.
- The long run, easy (VT1) runs and every ride do not count.
- Ride + Strength has no runs, so its weights are never cut.

**What prints now:**

| place | before (round 3) | after |
|---|---|---|
| Plan description and builder preview, Run + Strength | `A 3 to 4 percent reduction in working 1RM should be assumed here. This reduction can be gradually phased out in eight to ten weeks.` | unchanged |
| Plan description and builder preview, Run + Ride + Strength (weights were being cut) | (nothing) | the same sentence |
| Planned tab / Today, each ME lower session whose weights are cut (weeks 1–9) | (nothing) | the same sentence, as the session's description |
| Any other lifting session, and every session from week 10 | (nothing) | (nothing) |

The words are unchanged. They are the page's own, cut: "…a 3 to 4 percent reduction in working 1RM should be
assumed here. As long as progression is maintained week to week and month to month, this reduction can be
gradually phased out in eight to ten weeks…".

On the built weeks (throwaway compose, weeks 2 / 5 / 8), the sentence sits on Tuesday's ME lower session:
- **Run + Strength:** Monday's MLSS run comes the day before.
- **Run + Ride + Strength:** Monday's MLSS run comes before Tuesday's "Lower body: Hinge".
- **Week 10:** no session carries it.

**The phase-out arithmetic (kept at nine weeks):**
- The cut is 3.5%, the middle of the page's 3–4%. That middle is ours.
- Every three weeks, a third of it comes back:

| weeks | lower-body weights at |
|---|---|
| 1–3 | 96.5% |
| 4–6 | about 97.7% |
| 7–9 | about 98.8% |
| 10 onward | 100% |

- That is nine weeks, inside the page's "eight to ten weeks" and its "first nine weeks".
- The page's other number, "about 2 percent every three weeks", cannot be the step:
  - 96.5 + 2 = 98.5 at week 4.
  - The rest comes back at week 7, so the cut would be gone after six weeks, not eight to ten.
  - Three steps of 2% make 6%, more than the 3–4% being removed.

## 6. Warm-up sets (StrongLifts)

Source: StrongLifts' published warm-up, cited beside the code:
- https://stronglifts.com/stronglifts-5x5/workout-program/
- https://support.stronglifts.com/article/87-warmup

One function builds them: `warmupSetsFor` in `standing-plan/warmup.ts`.

Which lifts get them:
- Every barbell lift on a plan lifting day that has a work weight.
- Not on a test day. p215's test has its own warm-up steps.

| logger, under "Warm-up" | before (after round 1) | after |
|---|---|---|
| Back squat, work weight 225 lb | (no warm-up sets) | `45 lb × 5` · `45 lb × 5` · `90 lb × 5` · `135 lb × 5` · `180 lb × 5`, then the work sets at 225 |
| Back squat, work weight 100 kg (metric account) | (no warm-up sets) | `20 kg × 5` · `20 kg × 5` · `40 kg × 5` · `60 kg × 5` · `80 kg × 5`, then the work sets at 100 |
| Deadlift, work weight 315 lb | (no warm-up sets) | `135 lb × 5` · `180 lb × 5` · `225 lb × 5` · `270 lb × 5`, then the work sets at 315 |

The rules:
- **Squat, bench, overhead press and every other barbell lift:** 2 × 5 with the empty bar. That is 45 lb, or
  the 20 kg bar on a metric account.
> ⛔ Superseded later on 2026-09-18 (Michael): deadlift and row start at 65 lb / 30 kg (the lowest of StrongLifts' "65-135lb" the plates allow), every step is 45 lb / 20 kg, and a set is kept only 25 lb / 10 kg or more under the work weight. `warmup.ts` and STATE-SOURCES carry the new rule; the lines below are history.

- **Deadlift and row:** 1 × 5 at 135 lb / 60 kg.
- **Then:** sets of 5, adding at most 45 lb / 20 kg per set, evenly stepped.
- **Never:** a warm-up set at or above the work weight.
- **Nothing:** when the work weight is at or under the starting weight. A 45 lb bench and a 135 lb deadlift get
  no warm-up sets.

Our choices inside the published ranges (marked OURS, with ledger rows):
- **135 lb / 60 kg for deadlift and row.** StrongLifts says "65-135lb so the weight can rest on the floor". The
  app knows no bumper plates. With full-size plates, the bar is on the floor only at 135 lb / 60 kg.
- **One set at that start, not two.** StrongLifts' "two sets" is said of the empty bar.
- **Which lifts start on the floor:** any deadlift except Romanian and stiff-legged, and any row except the
  upright row.
- **The step size:** the fewest sets that keep every jump within 45 lb / 20 kg, on 5 lb / 2.5 kg steps. When a gap
  cannot be split inside 25–45 lb, the 45 lb limit wins.

How they are built and shown:
- The plan writer builds them in the athlete's unit.
- They are rebuilt from the final work weight and never scaled, so the empty bar stays the bar.
- They are marked as warm-ups and count as nothing: set counts, progression and volume skip them.
- The logger shows them under the existing "Warm-up / Working sets" headings.
- The p139–140 sentence still prints above the first ME / DE / SKILL row, as before.
- The planned sheet and Today still list work sets only.

## 7. The rest timer on plan lifts (count-up)

| place | before (after round 1) | after |
|---|---|---|
| Logger, after a work set on an ME row | no timer | `REST 0:00` counting up · `2–5 min` · Skip, with p78's sentence under it |
| after a work set on a HYP row | no timer | `REST 0:00` counting up · `60 s` · Skip, with p84's sentence under it |
| after a work set on a DE or SKILL row | no timer | `REST 0:00` counting up · Skip, with p78's sentence under it (no range) |
| after a warm-up set | no timer | no timer |
| rows with no plan intent (lifts added by hand, other plans) | countdown, unchanged | countdown, unchanged |

The pieces:
- **The ranges:** FIELD, NSCA Trainer Tips: Hypertrophy (2016), cited beside the two labels:
  - hypertrophy "rest periods (60 seconds)"
  - heavy loads "long rest periods (2-5 minutes)"
- **DE and SKILL** get no range. The NSCA page does not cover them.
- **The two labels** carry `device-instruction:` markers with the NSCA reason and are pinned. The rule's header
  says so.
- **When it starts and stops:**
  - It starts when a work set is marked done.
  - The next set marked done, or Skip, ends it.
  - It counts from the phone's clock, so time spent away from the app still counts.
- **After a warm-up set:** no timer. StrongLifts: "There's no rest between warmup sets".
- **The server's part:** it stamps `rest_count_up` and `rest_range` on each plan row. The phone only prints them.

---

## Checks

- **Deno suite** (`deno test -A --no-check supabase/functions src`): 5560 passed, 5 failed. The same 5 fail on the
  untouched base (checked this session: 5545 passed, 5 failed):
  - run-threshold-test.test.ts:75
  - anchor-resolver-lint ×2
  - wizard-day-lock.lint ×2
- **Goldens** regenerated once, in item 5. The only change: the p247 block line in weeks 2–9 of the two tested
  blocks.
- **`docs/INVENTORY.md`** regenerated in item 3: `token-parser` now imports the band file.
- **TypeScript** (`tsc -p tsconfig.app.json`): 305 errors, the same as base.
- **`node scripts/check-estimate-provenance.mjs`:** exit 0, rules 0–7. Rule-7 pins rewritten twice, only for the
  approved words: the ERG line, "2–5 min", "60 s".
- **`npx vite build`:** passes.

## Deploy list (36 functions that import changed code; nothing deployed)

Found with `deno info` over every `supabase/functions/*/index.ts`, intersected with the changed files:

adapt-plan, analyze-cycling-workout, analyze-running-workout, analyze-strength-workout, calendar-sync, coach,
complete-race, compute-session-boom, compute-snapshot, compute-workout-analysis, compute-workout-summary,
course-detail, course-strategy, course-upload, create-goal-and-materialize-plan, delete-plan,
endurance-checkpoint, generate-combined-plan, generate-strength-plan, generate-triathlon-plan, get-arc-context,
get-week, import-strava-history, ingest-phone-workout, learn-fitness-profile, materialize-plan, planning-context,
post-import-athlete-pipeline, refresh-goal-race-projections, rematerialize-standing-block,
send-workout-to-garmin, strava-webhook, strength-test-session, swap-list, swap-session, workout-detail.

Plus the phone bundle (the logger's count-up timer and warm-up rows).

After deploy:
- `PLAN_WRITER_VERSION` is 11, so plans already on file are rewritten on their next refresh.
- Until then, they keep the old bands, no warm-up sets and no count-up fields.

## Not checked

- Nothing has been seen on a phone:
  - the count-up pill
  - the warm-up rows on a metric account
  - the ERG line reaching Zwift
  - the wider pace ranges on the watch
- The Performance tab's planned-set list reads the plan's set list. That list now includes the warm-up sets, and
  the warm-up mark is not carried. It was the same before round 1 removed the ramp. Not checked on a logged
  session.
