/**
 * THE TWO BASELINE TEST SESSIONS, AS ROWS — one owner (2026-09-04).
 *
 * Training Baselines has scheduled these since 2026-09-02 (its "schedule a test" buttons). The
 * "Know your numbers?" wizard step (SPEC-baseline-entry-2026-09-04) puts the same sessions into week
 * one when the athlete picks Retest.
 *
 * ⛔ MOVED HERE FROM `src/lib/baseline-tests.ts` (2026-09-10, audit H-W03), which now re-exports it:
 * `create-goal-and-materialize-plan/week-one-tests.ts` inserts the week-one tests with the plan, so the
 * bodies have to be on the server. The standalone test buttons still read them through the re-export.
 * ⛔ SHARED = DEPLOY TRAP: grep -rln "baseline-test-rows" supabase/functions
 *
 * ⛔ THE TAGS ARE THE CONTRACT, NOT THE NAME. `assessment` + `run_test` is what `materialize-plan`
 * (`buildAssessmentSteps`) expands into the 12-minute protocol and what `compute-workout-analysis`
 * looks for before it goes hunting for the ~720 s lap; `ftp_test` is what the learner reads the
 * 20-minute lap × 0.95 from. Renaming a session is safe; dropping a tag silently turns the test into
 * an ordinary hard session that measures nothing.
 */

export type BaselineTestRow = {
  name: string;
  type: 'run' | 'ride';
  date: string; // YYYY-MM-DD
  description: string;
  duration: number; // minutes
  steps_preset: string[];
  workout_status: 'planned';
  tags: string[];
};

/**
 * ⛔⛔ THE TWO BOOK TESTS, STEP BY STEP, WRITTEN ONCE (2026-09-18, book-language pass 1, audit items 19 / 20).
 *
 * The protocol lived in three places with three wordings: this file's description, `materialize-plan`'s
 * `buildAssessmentSteps` labels, and the row's `steps_preset` tokens — which the FTP test from Adjust and week one
 * expanded, so its "3 minutes at 9/10" went to the watch as 110–120% of FTP and its cool-down at an OURS 40–55%.
 * Now both rows carry the `assessment` tag, `buildAssessmentSteps` builds the steps from the lists below, and the
 * description is the same page's words. Every label is the page's own words, cut down where it has to be (words
 * dropped, order kept); read off `book-sources/p210.jpg` and `p212.jpg`.
 *
 * ⚠️ WHERE THE PAGE PRINTS A RANGE the watch needs one number; the step sits inside the page's range and the label
 * prints the page's range. Marked at each step.
 */
export type ProtocolStep = { kind: 'warmup' | 'work' | 'recovery' | 'cooldown'; seconds: number; label: string };

/**
 * p210, "Establishing your VO2 max pace and threshold pace". ⛔ THE PAGE PRINTS NO COOL-DOWN, so none is built; the
 * 9-minute one that stood here was ours. ⛔ THE TRIAL IS 12 MINUTES — the page's beginner length. The page gives 10
 * minutes for 2 to 4 years of training and 8 for 4 or more; the app has no training-age answer (grepped
 * `training_age`, `years_training`, `trainingAge`, `training_years`, `yearsTraining`: 0 hits) and the learner
 * reads a ~720 s lap (`learn-fitness-profile`), so the description prints the 12-minute clause only.
 */
export const RUN_TEST_TRIAL_MIN = 12; // Viada p210: "Record distance traveled after 12 minutes (beginner, less than 2 years of training)"
export function runTestSteps(): ProtocolStep[] {
  return [
    // p210 step 1: "An easy 6- to 8-minute jog to warm up." 7:00 sits inside the page's 6 to 8 (OURS pick in the range).
    { kind: 'warmup', seconds: 420, label: 'An easy 6- to 8-minute jog to warm up' },  // p210
    // p210 step 2: "2 × 100-meter strides (begin slow and accelerate to near full tilt)." The page times none; each
    // stride is a lap-button step on the watch, back to back — the page prints no rest between them.
    { kind: 'work', seconds: 0, label: '100-meter stride (begin slow and accelerate to near full tilt)' },  // p210
    { kind: 'work', seconds: 0, label: '100-meter stride (begin slow and accelerate to near full tilt)' },  // p210
    // p210 step 3: "3 rounds of 30 seconds at a "fast run" (mile PR) pace followed by 1 minute easy walk/jog."
    { kind: 'work', seconds: 30, label: '"fast run" (mile PR) pace' },  // p210
    { kind: 'recovery', seconds: 60, label: 'easy walk/jog' },  // p210
    { kind: 'work', seconds: 30, label: '"fast run" (mile PR) pace' },  // p210
    { kind: 'recovery', seconds: 60, label: 'easy walk/jog' },  // p210
    { kind: 'work', seconds: 30, label: '"fast run" (mile PR) pace' },  // p210
    { kind: 'recovery', seconds: 60, label: 'easy walk/jog' },  // p210
    // p210 step 4: "1 minute additional rest."
    { kind: 'recovery', seconds: 60, label: 'additional rest' },  // p210
    // p210 step 5: "Begin time trial: 9.5/10 intensity to begin, ending at 10/10 intensity".
    { kind: 'work', seconds: RUN_TEST_TRIAL_MIN * 60, label: 'time trial: 9.5/10 intensity to begin, ending at 10/10 intensity' },
  ];
}

/** p212, "The 20-Minute Test". */
export function ftpTestSteps(): ProtocolStep[] {
  return [
    // p212 step 1: "5- to 10-minute easy warm-up." 8:00 sits inside the page's 5 to 10 (OURS pick in the range).
    { kind: 'warmup', seconds: 480, label: '5- to 10-minute easy warm-up' },  // p212
    // p212 step 2: "3 x 1 minute at low resistance/high turnover (think rapid legs/rowing/etc.) with 1-minute rest
    // between each." Between each: two rests for three efforts.
    { kind: 'work', seconds: 60, label: 'low resistance/high turnover' },
    { kind: 'recovery', seconds: 60, label: 'rest' },
    { kind: 'work', seconds: 60, label: 'low resistance/high turnover' },
    { kind: 'recovery', seconds: 60, label: 'rest' },
    { kind: 'work', seconds: 60, label: 'low resistance/high turnover' },
    // p212 step 3: "3-minute easy recovery."
    { kind: 'recovery', seconds: 180, label: 'easy recovery' },  // p212
    // p212 step 4: "3 minutes at high intensity. Push yourself at a 9/10 effort."
    { kind: 'work', seconds: 180, label: 'high intensity. Push yourself at a 9/10 effort' },  // p212
    // p212 step 5: "6 to 8 minutes at a low pace to recover." 7:00 sits inside the page's 6 to 8 (OURS pick in the range).
    { kind: 'recovery', seconds: 420, label: '6 to 8 minutes at a low pace to recover' },  // p212
    // p212 step 6: "Reset your device/hit the lap button, start a stopwatch, and do 20 minutes at your best effort!"
    { kind: 'work', seconds: 1200, label: 'hit the lap button and do 20 minutes at your best effort!' },  // p212
    // p212 step 7: "5 to 10 minutes of easy recovery." 5:00 is the low end of the page's range (OURS pick in the range).
    { kind: 'cooldown', seconds: 300, label: '5 to 10 minutes of easy recovery' },  // p212
  ];
}

/** Threshold time trial, Viada p210, step for step. Sendable to Garmin. */
export function runThresholdTestRow(date: string): BaselineTestRow {
  return {
    // ⛔ NO "48 HOURS PRIOR" (Michael, 2026-09-11: by the book). p210 prints no rest rule before the
    // trial; the sentence was ours and is gone. No page citation in the name or the text either —
    // citations live in the ledger, not on screen.
    name: 'Threshold Time Trial',
    type: 'run',
    date,
    // ⛔ p210's own words, in its order (2026-09-18). "flat route or track; heart rate strap on", "even the whole
    // way" and the 8–10 min cool-down were on no page and came off. The last sentence operates the app.
    description: 'An easy 6- to 8-minute jog to warm up. 2 × 100-meter strides (begin slow and accelerate to near full tilt). 3 rounds of 30 seconds at a "fast run" (mile PR) pace followed by 1 minute easy walk/jog. 1 minute additional rest. Begin time trial: 9.5/10 intensity to begin, ending at 10/10 intensity. Record distance traveled after 12 minutes (beginner, less than 2 years of training). The app reads the trial lap, takes 88% of that speed as your threshold pace and sets it.',
    // The steps' own total, rounded up: 7 + 1.5 + 3 + 1 + 12 minutes and the two strides.
    // OURS — `runThresholdTestRow` 25-min duration: the page times neither stride; the materializer's step sum wins once built
    duration: 25,
    // ⛔ ONE TOKEN, THE TRIAL. `buildAssessmentSteps` builds the whole protocol from `runTestSteps()`; the token only
    // carries the trial length (Viada p210).
    steps_preset: [`run_tt_${RUN_TEST_TRIAL_MIN}min`],
    workout_status: 'planned',
    tags: ['assessment', 'run_test', 'time_trial', 'baseline_establishment', 'key_workout'],
  };
}

/** FTP test, the 20-minute protocol, Viada p212, step for step. The learner reads the 20-min lap × 0.95. */
export function ftpTestRow(date: string): BaselineTestRow {
  return {
    // ⛔ NO "48 HOURS PRIOR" and no page citation — see the run test above.
    name: 'FTP Test — 20-Minute Protocol',  // not-instruction: session name, not an instruction; p212 heads the test "The 20-Minute Test"; Michael's call
    type: 'ride',
    date,
    // ⛔ p212's own words, in its order (2026-09-18). "indoor trainer recommended; a power meter or smart trainer" and
    // "even" were on no page and came off. The last sentence operates the app.
    description: 'Set your screen/device to average wattage. 5- to 10-minute easy warm-up. 3 x 1 minute at low resistance/high turnover (think rapid legs/rowing/etc.) with 1-minute rest between each. 3-minute easy recovery. 3 minutes at high intensity. Push yourself at a 9/10 effort. 6 to 8 minutes at a low pace to recover. Reset your device/hit the lap button, start a stopwatch, and do 20 minutes at your best effort! 5 to 10 minutes of easy recovery. If you\'re using average watts, use the number at the 20-minute mark and multiply it by 0.95. This is your starting functional threshold power (FTP) in watts. The app reads the lap and sets it.',
    // OURS — `ftpTestRow` 45-min duration: the steps' own sum (8 + 5 + 3 + 3 + 7 + 20 + 5 minutes, rounded up); the materializer's step sum wins once built
    duration: 45,
    // ⛔ THE ROW IS AN ASSESSMENT NOW (2026-09-18): `buildAssessmentSteps` builds the protocol from `ftpTestSteps()`,
    // so the token list is not expanded. It keeps the one token the workload and analysis readers key on.
    steps_preset: ['bike_ftp_test_20min'],
    workout_status: 'planned',
    tags: ['assessment', 'ftp_test', 'baseline_establishment', 'key_workout'],
  };
}

/**
 * The 5-minute all-out FTP test (Viada, hybrid-coach course Module 3 "Aerobic Assessments"): "more
 * repeatable because there's no strategy to it — go out as hard as you can and hang on until 5 minutes
 * are up." The module extrapolates FTP as roughly 80% of the 5-minute average; this app does NOT add
 * that as a second FTP formula. The 5-minute effort lands as the 5-minute point on the power-duration
 * curve, and the one FTP rule (the critical-power fit over 2–20 min, TrainerRoad / intervals.icu
 * practice) reads it from there. `ftp_test` keeps the analyser's delegation to the learner;
 * `ftp_test_5min` tells the screens which protocol this is.
 */
export function ftp5MinTestRow(date: string): BaselineTestRow {
  return {
    // ⛔ NO "48 HOURS PRIOR" and no source citation in the name — see the run test above.
    name: 'FTP Test — 5-Minute All-Out', // not-instruction: session name, not an instruction; no page names it; Michael's call
    type: 'ride',
    date,
    // ⛔ NO WORDS (2026-09-18, rule 7 triage). The 5-minute test is coach-course material, not the book: the SOURCE doc
    // has no 5-minute FTP test (grepped "5-minute", "five-minute", "5 minute", "hang on"), so it prints nothing. The
    // sentence that stood here ("indoor trainer recommended… start as hard as you can hold and hang on…") was on no page.
    description: '',
    // OURS — `ftp5MinTestRow` 40-min duration and the warm-up / cool-down presets: no page
    duration: 40,
    steps_preset: [
      'warmup_bike_quality_8min_fastpedal',
      'bike_race_prep_3x60s',
      'bike_recovery_5min_Z1',
      'bike_ftp_test_5min',
      'cooldown_bike_easy_10min',
    ],
    workout_status: 'planned',
    tags: ['ftp_test', 'ftp_test_5min', 'baseline_establishment', 'key_workout'],
  };
}

/**
 * Where a week-one retest lands, counted from the block's first day (the server inserts these with the
 * plan: `create-goal-and-materialize-plan/week-one-tests.ts`). OURS — p210 and p212 say nothing about
 * rest before a test (the "48 hours prior" this comment used to cite was never on the page; removed
 * 2026-09-11); the day inside week one is this app's choice: the run test on the third day of the
 * block, the FTP test on the fifth, so neither sits on the first lifting day and they are two days
 * apart. Recorded in docs/STATE-SOURCES.md.
 */
export const RETEST_OFFSET_DAYS = { run: 2, ftp: 4 } as const;

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
