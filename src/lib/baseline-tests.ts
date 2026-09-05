/**
 * THE TWO BASELINE TEST SESSIONS, AS ROWS — one owner (2026-09-04).
 *
 * Training Baselines has scheduled these since 2026-09-02 (its "schedule a test" buttons). The
 * "Know your numbers?" wizard step (SPEC-baseline-entry-2026-09-04) schedules the same sessions
 * into week one when the athlete picks Retest, so the bodies moved here and both screens read them.
 *
 * ⛔ THE TAGS ARE THE CONTRACT, NOT THE NAME. `run_test` is what `materialize-plan:1363`
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

/** Threshold time trial, Viada p210, step for step. Sendable to Garmin. */
export function runThresholdTestRow(date: string): BaselineTestRow {
  return {
    name: 'Threshold Time Trial (Viada p210)',
    type: 'run',
    date,
    description: 'Threshold time trial (Viada p210). PREPARATION: no hard training 48 hours prior; flat route or track; heart rate strap on. WARM-UP: 6–8 min easy jog; 2 x 100 m strides, slow to near full tilt; 3 x 30 s at your fast (mile-PR) pace with 1 min easy walk/jog between; then 1 min rest. TRIAL: press lap and run 12 minutes (under 2 years of training), 10 minutes (2–4 years) or 8 minutes (4+ years) — start at 9.5 out of 10, finish at 10 out of 10, even the whole way; press lap at the end. COOL-DOWN: 8–10 min easy. RESULT: the app reads the trial lap, takes 88% of that speed as your threshold pace (the book\'s rule) and sets it.',
    duration: 45,
    // p210, step for step: easy jog · 2 × 100 m strides · 3 × 30 s fast with 1 min easy · 1 min rest ·
    // the trial (12 min default; 10 / 8 by training age, see description) · cool-down.
    steps_preset: ['warmup_run_7min_easy', 'strides_2x100m', 'interval_3x30s_115pct_R60s', 'run_rest_1min', 'run_tt_12min', 'cooldown_run_9min_easy'],
    workout_status: 'planned',
    tags: ['assessment', 'run_test', 'time_trial', 'baseline_establishment', 'key_workout'],
  };
}

/** FTP test, the 20-minute protocol, Viada p212, step for step. The learner reads the 20-min lap × 0.95. */
export function ftpTestRow(date: string): BaselineTestRow {
  return {
    name: 'FTP Test — 20-Minute Protocol (Viada p212)',
    type: 'ride',
    date,
    description: 'FTP test — the 20-minute protocol (Viada p212). PREPARATION: no hard training 48 hours prior; indoor trainer recommended; a power meter or smart trainer. WARM-UP: 5–10 min easy; 3 x 1 min at low resistance and high turnover with 1 min rest between; 3 min easy; 3 min at 9 out of 10; 6–8 min easy. TEST: press lap and ride 20 minutes at your best even effort; press lap at the end. COOL-DOWN: 5–10 min easy. RESULT: your FTP is the 20-minute average power x 0.95 (the book\'s rule); the app reads the lap and sets it.',
    duration: 60,
    // p212, step for step (2026-09-02): easy · 3 × 1 min high turnover / 1 min rest · 3 min easy ·
    // 3 min at 9/10 · 6–8 min easy · 20 min best effort · easy.
    steps_preset: [
      'warmup_bike_quality_8min_fastpedal',
      'bike_race_prep_3x60s',
      'bike_recovery_3min_Z1',
      'bike_vo2_1x3min_R0min',
      'bike_recovery_7min_Z1',
      'bike_ftp_test_20min',
      'cooldown_bike_easy_8min',
    ],
    workout_status: 'planned',
    tags: ['ftp_test', 'baseline_establishment', 'key_workout'],
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
    name: 'FTP Test — 5-Minute All-Out (Viada, Module 3)',
    type: 'ride',
    date,
    description: 'FTP test — the 5-minute all-out protocol. PREPARATION: no hard training 48 hours prior; indoor trainer recommended; a power meter or smart trainer is required. The test: start as hard as you can hold and hang on until five minutes are up. There is no pacing strategy, which is what makes it repeatable. Your 5-minute power feeds the power curve the FTP estimate is fitted from.',
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
 * Where a week-one retest lands. OURS — the book says only "no hard training 48 hours prior"
 * (p210, p212); the day inside week one is this app's choice: the run test on the third day of the
 * block, the FTP test on the fifth, so neither sits on the first lifting day and they are two days
 * apart. Recorded in docs/STATE-SOURCES.md.
 */
export const RETEST_OFFSET_DAYS = { run: 2, ftp: 4 } as const;

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
