# AUDIT — plan materialization (2026-09-02)

Source: "the 2026-09-02 plan materialization audit" session (Standard Focus block, code-traced).
Carried here verbatim by the State-numbers session so it survives the chat. Companion to
`PLAN-strength-numbers-2026-09-02.md` and D-459 / D-461.

## 1. What the materializer reads (Standard Focus)

- Standard Focus writes NO `athlete_snapshot` into `plans.config` (`generate-strength-plan` inserts
  source, strength_protocol, standing_plan, one_rep_maxes_at_build only). Every endurance row takes the
  LIVE `user_baselines` row at materialize time: activation (all 12 weeks at once) or a later single-row
  recompute (row opened with no steps, or swapped). Nothing re-materializes endurance rows mid-block;
  `rematerialize-standing-block` rewrites `strength_exercises` only.
- Easy pace: `resolveCurrentRunEasyPace` (manual-chosen > learned med+ > manual > effort_paces.base).
  Threshold: `resolveCurrentRunThresholdPace` (learned > effort_paces.steady > 5K+20 s/mi bounded by
  measured easy). 5K: `resolveCurrent5kPace`, typed only; no learned source. **The MLSS hard-run token
  is `interval_..._5kpace`, so the hardest run is keyed to a typed number nothing updates.** FTP:
  `resolveCurrentFtp`, learned/manual only (learned-low refused). Rides expand as % FTP; no FTP = no
  watt range.
- Strength: **the block's weights come from the week-1 test set** (`readTestWeek` → 96% of
  Epley/Brzycki avg), NOT from the resolver. Entry gate (`readBarbellMaxes`) and test warm-up seeds
  (`seed1RMs`) read TYPED `performance_numbers` only; learned/locked never reach the block. The legacy
  `baselines.*` block in `materialize-plan` (`resolveStrengthNumbers`) and the snapshot path only
  matter for other plan types / non-tested rows. Test → baselines is manual: `save-baseline-test`
  fires only from the Save button on the test session.
- Learned run paces are written only by `learn-fitness-profile`, which runs on ingest milestones
  (1st/2nd/5th/10th activity, then weekly) and the Baselines refresh button, not per activity.

## 2. Pipeline audit (as given to Michael)

1. Train screen → Standard Focus card → wizard: days per sport, hours per sport, experience tier per
   sport, accessory picks + dial, start date. 1RMs come from the Baselines screen, not the wizard.
2. Entry gate: all four lifts typed and ≥65 lb. Typed only; learned/locked alone is refused.
3. Server re-reads baselines, equipment, easy/threshold/5K pace, FTP, and last 35 days of run/ride
   workouts for the tier.
4. All 12 weeks written up front. Week 1 = test week, mandatory. Heavy rows after week 1 = "By feel".
   Endurance rows carry the book's levels (rides L1, runs/long L2) sized to hours inside book bands.
5. Activation inserts all rows and computes pace/watt targets then.
6. Typed 1RMs buy one thing: the week-1 test warm-up ramp.
7. After the test: (a) every strength save re-reads week-1 scored sets, sets working numbers, rewrites
   unstarted weeks, announce-and-undo sheet; working numbers live on the plan. (b) Baselines update
   only via the Save button on the test session (server e1RM, floor to 5, keep/update on a lower result).
8. Progression: calendar rate zero. Weight up after top-of-range twice in a row (+5 upper/+10 lower,
   or reps if plates too coarse). Back after 3 falling sessions or a failed set, to the last held
   weight. Sets 1→2→3 on two clean sessions. Nothing logged = hold. 4 unmoved weeks = "frozen".
9. Endurance never re-prices mid-block.

Open: gate typed-only; test→baselines needs the button; endurance frozen at activation; 5K has no
learned source; learner runs on milestones; taper weeks never set; OHP tested and unused; auto/locked
switch built (deployed 2026-09-02, but see §1 — it does not reach a Standard Focus block's weights).

## 3. Six-week checkpoint design (endurance only; strength keeps its ladder)

1. When: end of week 6, before week 7; triggered by the plan calendar, not a save; learner runs first.
2. Evidence, p123's three signals, read off the block's own hard sessions: lower HR at same pace/power
   vs weeks 1–3; lower logged effort than intended; intervals completed with less rest / none skipped.
3. Verdict per number: most hard sessions better than expected AND learned agrees → propose faster;
   targets missed on most → propose slower; else / nothing logged → hold.
4. Capped step: threshold and easy pace a few s/km per checkpoint; FTP a few percent. Cap is his
   rule, the numbers are ours and labelled so.
5. Sheet: one row per number (now, proposed, evidence in plain words); accept/keep per number; a
   locked number shows the suggestion and does not move.
6. On accept: weeks 7–12 endurance rows rewritten with the new number; hours, levels, sessions
   untouched; completed sessions untouched.
7. Unanswered sheet = old numbers stand. Nothing moves silently.
8. Week 12 = same sheet; accepted numbers + next pretest seed the next block.

Book note: the "threshold adjustment method" p112 points to does not exist in the book (Michael
flipped 180–217); p112/123/275 are the whole method.

## 4. Where the parked cut sits

"Retire the 5K pace table; derive every training pace from threshold in one place" (the D-461
follow-up) belongs WITH the checkpoint, not on its own: the checkpoint needs one pace anchor
(threshold) that every training pace derives from. Marathon race pace has `effort_paces.race` as its
only source and Standard Focus never uses it — safe for the standing plan, risky for the marathon
generator only. Sequence: push D-461 first, then the audit session builds the cut + checkpoint on it.

## 5. Cut plan (audit session, relayed 2026-09-02) — starts after D-461 is pushed

Reader map: 25 server reads of `effort_paces` (materialize-plan 19 lines, generate-run-plan 11,
create-goal-and-materialize-plan 10, arc-context 8, performance-build 5, coach 5, rest 1–3), 8 client
files (resolve-current-run-pace, run-pace-calibration, resolve-current-5k-pace, AppContext,
TrainingBaselines, NonRaceBuilder, GoalsScreen, useCoachWeekContext). Easy/threshold read the resolvers
first, so for Standard Focus the table is fallback only. The one outright dependency is the MARATHON
plan: `effort_paces.race` is its only race-pace source (materialize-plan getPace 'marathon' ×3;
generate-run-plan refuses a performance_build without it).

1. One pure paces-from-threshold module in `src/lib` (client+server importable). Ratios measured off
   the app's own `PACE_TABLE` the way `EASY_TO_THRESHOLD_PACE_RATIO` 1.19 was; labelled ours/Daniels.
2. Threshold is the anchor: chosen > learned > typed > derived-from-easy > seeded-from-5K.
3. materialize-plan's `secPerMiFromBaseline` reads the module; the MLSS token keys off threshold, not
   the typed 5K.
4. `effort_paces` becomes computed-on-read; the readers switch to the module.
   `effortFieldsFromFiveKTimeSec` stays as the 5K→seed entry; nothing else writes paces.
5. Then the six-week checkpoint (calendar trigger, evidence read, sheet, rewrite of unstarted rows).

### OPEN RULINGS FOR MICHAEL (before step 4)
- **A. Marathon race pace.** Derive it from threshold too (changes a TRUSTED plan's number source),
  or the marathon generator keeps the old table.
- **B. The seed when only a 5K exists.** 5K+20 s/mi vs the pace table's steady lookup. One survives;
  the audit session recommends the table ratio (measured).

## 6. Cut steps 1–3 BUILT (audit session, 2026-09-02 evening) — in the working tree, not committed

Files (audit session's): NEW `src/lib/run-paces-from-threshold.ts` + `_shared/run-paces-from-threshold.test.ts`;
EDITED `src/lib/resolve-current-run-pace.ts`, `src/lib/resolve-current-5k-pace.ts`, `_shared/arc-context.ts`,
`materialize-plan/index.ts`, three resolver test files.

Threshold is the anchor. Threshold resolver: chosen > learned > typed > seeded-from-5K (typed 5K, or
`effort_source_time` on pre-D-461 rows, + 20 s/mi, bounded by measured easy) > derived-from-easy >
learned-low. Easy resolver: chosen > learned > typed > derived-from-threshold (×1.19) > learned-low.
`effort_paces` is no longer read by either resolver or by materialize-plan. Materializer: 'fivek' =
threshold − 20; 'marathon' = threshold × 1.093; cruise/tempo tokens read threshold directly (they had a
private 5K+20 copy — a learned-threshold athlete with no typed 5K got NO pace on cruise intervals).
Ratios measured off PACE_TABLE (marathon 1.0934 mean, 0.45% spread; interval 0.915; rep 0.860).
Tests 151/151; tsc 314 = HEAD; deno check importers unchanged.

### TWO FINDINGS THAT CHANGE RULINGS A AND B (code-measured)
1. **Ruling B's premise is false.** The "pace table ratio" is not a ratio: VDOT_TABLE's 5K times and
   PACE_TABLE's paces disagree, so threshold ÷ 5K-race-pace runs 1.20 (16:00 5K) → 0.81 (40:00 5K).
   Below ~31:00 the table prescribes a threshold FASTER than the athlete's 5K race pace; at 22:00 it is
   53 s/mi slower (Daniels: ~25). Kept the app's own documented rule, 5K + 20 s/mi
   (DOCTRINE-threshold-run.md). **Needs Michael's re-ruling.**
2. **Ruling A's before/after cannot match for faster runners.** Today's marathon race pace = VDOT_TABLE
   marathon time ÷ 26.2, and race ÷ threshold runs 1.0965 (vdot 30) → 0.9295 (vdot 80): from vdot 44
   up (5K under ~22 min) the marathon plan prescribes M pace FASTER than T pace. After the cut M = T ×
   1.093, always slower than T. 22:00 5K athlete: before 484, after 486. Learned-threshold-400 athlete:
   before no M pace at all, after 437.

Before/after (work-step paces, sec/mi; '-' = no target): learned thr 400 / easy 510: easy 510→510,
cruise −→400, 5K intervals −→380, marathon −→437. Typed 5K 22:00 only: easy −→530, cruise 445→445,
intervals 425→425, marathon −→486. Pre-D-461 wizard row (effort_source_time 1320): easy 570→530,
cruise 458→445, intervals 438→425, marathon 484→486. Nothing on file: all '-' both sides.

Deploy closure when it ships: materialize-plan + every importer of resolve-current-run-pace /
resolve-current-5k-pace (21 functions). Not started: step 4 (other 24 effort_paces readers;
generate-run-plan performance_build still refuses without effort_paces.race), the checkpoint,
rulings 1/2/6/7 from the package.


## 7. Re-rulings (Michael, 2026-09-02 evening)
- **Easy is NOT a pace source.** Easy days = a heart-rate zone off threshold HR. The easy pace shown is a
  reference band derived from threshold pace only. No learned/typed/chosen easy-pace chain; the easy
  pace field comes off Baselines.
- **Threshold pace = learned or entered. Nothing else.** Ruling B is void: no 5K seeding at all. An
  athlete with neither gets no pace on hard runs, effort target only, until a test / race / entry.
- **5K time's only pace job:** 5K race pace by division. Marathon race pace = threshold × 1.093 (A stands).
