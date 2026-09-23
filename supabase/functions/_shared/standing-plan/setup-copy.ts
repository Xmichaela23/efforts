/**
 * THE SETUP'S WORDS FOR THE THREE PLANS — ONE SERVER FILE (punch list "Default picks and per-plan wording
 * move to the server", Michael 2026-09-13: GO).
 *
 * Every line here was approved by Michael and moved from the phone unchanged. The phone prints what the
 * server sends and holds no copy, so a wording change is a server deploy, not an app release. Placeholders
 * in braces are filled with the athlete's own values (weeks, minutes, lift names) and nothing else.
 */
import { FRAMES, type FrameId } from './frames.ts';
import { intentLine } from '../strength-grid/intents.ts';

// ── Train screen and program list ─────────────────────────────────────────────────────────────

/** The three sections on Train, and the title of each one's program list. */
export const SECTION_COPY = {
  standard: { label: 'Multisport Focus', blurb: 'Running, riding and lifting in one plan.', list_title: 'Multisport' },
  run: { label: 'Run Focus', blurb: 'Your running, with the lifting cut around it.', list_title: 'Run' },
  ride: { label: 'Ride Focus', blurb: 'Your riding, with the lifting cut around it.', list_title: 'Ride' },
} as const;

/** Each program card: name, description and requirements line. */
export const PROGRAM_COPY = {
  // Viada p275, reworded (Michael approved the words 2026-09-19); the page: "This program can be used as an "all-year" program for an athlete who's interested in multiple
  // different sports, ranging from road running to trail running…".
  // ⛔ OFF 2026-09-18 (round 3): "Strength, running and riding run together, year-round, with a pivot to a race or a
  // single sport when one comes up." — a paraphrase of p275.
  run_ride_strength: {
    label: 'Run + Ride + Strength',
    blurb: 'This program can run all year for an athlete interested in several sports.',
    requirement: 'Needs a barbell and plates, a rack and a bench. A lift you have not tested gets a test session in '
      + 'week one.',
  },
  // Viada p246: four lifting days and four runs (the week table's count). Viada p247, Running Notes, reworded (Michael approved the words 2026-09-19); the page: "Mileage will be
  // dictated by experience level, with more proficient runners looking at runs up to 90 to 100 minutes here…".
  // ⛔ OFF 2026-09-18 (book-language pass 3): "Your speed and mileage hold.", "Twelve weeks", "comfortable running a full
  // hour" and "about three hours of running and seven to nine hours of training in all" — on no page.
  // ⛔ OFF 2026-09-18 (round 3): "You get stronger." (no page) and "The long run stays under 100 minutes." (a rewording
  // of p247's "runs up to 90 to 100 minutes").
  // ⛔ RENAMED 2026-09-22 (Michael approved the words): named by weekly running, not by race. OURS — "4 hours": the built
  // week's running, 3h45–4h15 across 12 weeks (p246's four runs; p247's long run up to 90–100 min). Threshold intervals:
  // p247 NT 5–8 min work intervals; interval runs: p246 MLSS+. Emphasis on strength: p247 (the lifting days lead).
  // Intermediate: p247 "useful for athletes of most skill levels… even advanced intermediate runners".
  run_strength: {
    label: '4HR + Strength',
    blurb: 'Around 4 hours of running a week, with threshold and interval runs, and an emphasis on strength. Intermediate.',
    requirement: 'Needs a barbell and plates, a rack and a bench. A lift you have not tested gets a test session in week one.',
  },
  // Viada p278: three lifting days and seven rides in the Standard column (the week table's count).
  // Viada p280, reworded (Michael approved the words 2026-09-19); the page: "These programs are included as training options for intermediate to
  // advanced cyclists".
  // ⛔ OFF 2026-09-18 (round 3): "Six or seven rides" — p278 prints seven; the six-ride choice is the builder's
  // (`RIDES_COPY.count_chip`), not the page's.
  // ⛔ OFF 2026-09-18: "For newer riders and riders coming back." (p280 says intermediate to advanced) and "Cycling and
  // strength progress together." (no page).
  // OURS — `PROGRAM_COPY` "a 1RM of at least 65 lb" per lift: the entry minimum shared with `barbell-maxes.ts`; no page.
  ride_strength: {
    label: 'Ride + Strength',
    blurb: 'Options for intermediate and advanced cyclists. Seven rides, three lifting days.',
    // OURS — `PROGRAM_COPY` 65 lb entry minimum (see above).
    requirement: 'Requirements: a barbell and rack, a bench, dumbbells, something to carry, and a bike. Watts need a '
      + 'power meter or smart trainer. Bench, squat and deadlift each need a 1RM of at least 65 lb.',
  },
} as const;

// ── Adjust › Deload ───────────────────────────────────────────────────────────────────────────

/**
 * ⛔ THE LINE UNDER THE DELOAD BUTTON, PER PROGRAM — each program's own page, or nothing (2026-09-18, round 3).
 * The screen printed p245's sentence ("If performance begins to suffer, particularly if the ME lifts underperform 2
 * weeks in a row, consider running a single deload week.") on every program; p245 is the Hypertrophy + 5K page, which
 * no program here is built from.
 * - strength_5k — Viada p247 (Strength + 5K), main text, whole sentence.
 * - all_rounder — p274/p275 print no sentence on when to deload: nothing.
 * - cycling_base — p278/p280/p281 print no sentence on when to deload Base (p280's taper/deload sentence is the Crit
 *   program's): nothing.
 */
export const DELOAD_LINE: Record<FrameId, string | null> = {
  // Viada p247, reworded (Michael approved the words 2026-09-19); the page: "If a powerlifting meet or 5K approaches, I recommend that, 2 weeks
  // out, you switch the program to the deload version."
  strength_5k: 'If a powerlifting meet or 5K is coming, the recommendation is to switch to the deload version 2 weeks before.',
  all_rounder: null,
  cycling_base: null,
};

// ── Build this plan? and Know your numbers? ───────────────────────────────────────────────────

/**
 * Per plan: its name, the Build this plan? lines ({name}, {weeks}), and the FTP line where the plan has one.
 * Run + Strength keeps its two older lines.
 */
export const PLAN_COPY: Record<FrameId, { name: string; confirm_title: string; confirm_line: string; ftp_note: string | null }> = {
  all_rounder: {
    name: 'Run + Ride + Strength',
    confirm_title: '{name}, {weeks} weeks.',
    // ⛔ 2026-09-18: "The weights go up as you adapt to the training." was a paraphrase. p275 (All Rounder notes),
    // reworded (Michael approved the words 2026-09-19); the page: "few changes are needed as the months progress beyond adjustment of 1RM and threshold as
    // you improve."
    confirm_line: 'A {weeks}-week plan to get stronger and faster on the run and the bike. Little needs to change month '
      + 'to month beyond updating 1RM and threshold as you improve.',
    ftp_note: null,
  },
  strength_5k: {
    // OURS — "4HR": the built week's running, 3h45–4h15 (see `PROGRAM_COPY.run_strength`).
    name: '4HR + Strength',
    confirm_title: '{name} — {weeks} weeks. Strength leads; your endurance holds.',
    // ⛔ 2026-09-18: "Two cycles build, the third measures… no separate retest week" came off — no page, and it
    // contradicted the block's own description (week one is the test: plan-row.ts, the one owner).
    confirm_line: 'A {weeks}-week block.',
    ftp_note: null,
  },
  cycling_base: {
    name: 'Ride + Strength',
    confirm_title: '{name}, {weeks} weeks.',
    // ⛔ 2026-09-18: "The weights go up as you adapt to the training." came off — a paraphrase, and p278/p280
    // print no sentence on it.
    confirm_line: 'A {weeks}-week plan to get faster and stronger.',
    // ⛔ "If you're coming back from a riding break, make sure your FTP is current." came off 2026-09-18 (book-language
    // pass 3): p278–p281 say nothing of it (grepped the SOURCE doc's Part E2 for "FTP", "break", "current").
    ftp_note: null,
  },
};

/** The Know your numbers? screen, every line. */
export const NUMBERS_COPY = {
  // ⛔ REWRITTEN 2026-09-22 (Michael approved the words): not optional; the plan is priced from these.
  title: 'Your numbers',
  // Viada p215 — the pretest in week one; p210 / p212 the endurance tests. Profile saves re-price the block.
  intro: 'The plan sets your weights and paces from these. Anything not on file is tested in week one. You can add '
    + 'or change them in Profile any time.',
  continue: 'Continue',
  use_current: 'Use this',
  retest: 'Retest in week one',
  test: 'Test in week one',
  strength_title: 'Strength',
  lift_labels: { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', overheadPress1RM: 'OHP', pullupMaxReps: 'Pull-ups' },
  reps_suffix: ' reps',
  source_learned_lifts: 'from your logged sets',  // not-instruction: a source label (where the number on file came from), not an instruction
  source_typed: 'typed in Baselines',
  strength_use_complete: 'The block uses these; no test week.',
  /** {lifts} is the untested lifts joined with ' and '; {verb} is 'is' for one, 'are' for more. */
  strength_use_partial: 'The block uses these; {lifts} {verb} tested in week one.',
  lift_list_join: ' and ',
  verb_one: 'is',
  verb_many: 'are',
  strength_test: 'Week one is the test week (p215). The number on file stays until the test replaces it.',
  // Viada p215 — week one is the test week. Profile saves re-price the block (rematerialize-standing-block).
  strength_none: 'Add your 1-rep maxes if you know them. Any lift left blank is tested in week one.',
  ftp_title: 'FTP',
  watts: '{watts} W',
  source_ftp_manual: 'typed in Baselines',
  source_ftp_learned: 'estimated from your rides',
  source_ftp_low: 'estimated, low confidence',
  // ⛔ No page number on screen (2026-09-18): citations live in the ledger. p212 / p210 are the tests' pages.
  // Viada p212 — the 20-minute test.
  ftp_test: 'The 20-minute FTP test is scheduled into week one.',
  // Viada p212 — the 20-minute test.
  ftp_none: 'Nothing on file. Week one has a 20-minute FTP test. If you know your FTP, add it in Profile and the plan '
    + 'updates to it.',
  run_title: 'Run threshold',  // not-instruction: a row heading, not an instruction
  source_run_typed: 'typed in Baselines',
  source_run_learned: 'from your runs',
  run_test: 'The threshold time trial is scheduled into week one.',  // p210 — the test is the page's "time trial"; the sentence says what the app scheduled
  // Viada p210 — the threshold time trial. A Profile save re-prices upcoming sessions (endurance-checkpoint).
  run_none: 'Add your threshold pace if you know it. Left blank, week one has a threshold time trial.',  // p210 — the test is the page's "time trial"; the sentence says what the app scheduled
  // FIELD — "per 100" is the swim pace unit (time per 100 m or 100 yd), a definition, not a prescription.
  swim_title: 'Swim pace (per 100)',  // not-instruction: a row heading, not an instruction
  source_swim: 'on file',
  swim_none: 'Nothing on file — there is no swim test to schedule; the number is typed on Profile.',
} as const;

// ── Build focus ───────────────────────────────────────────────────────────────────────────────

export const BUILD_FOCUS_COPY = {
  // not-instruction: says what this screen lists and how to change it (app operation), not a training instruction; "hypertrophy" is p219's word
  subtitle: 'These are your hypertrophy lifts and super sets based on the equipment you have. You can swap on the '
    + 'day or adjust now for the plan.',
  // ⛔ 2026-09-18: the rows this step lists are HYP slots, so the line is p218's HYP line from its one owner
  // (6 to 12 reps, 0 to 2 in reserve). The p86 "8 to 10 reps" and "costs the next main lift" (no page) came off.
  dose_line: intentLine('HYP') ?? '',
  day_heading: 'Day {day}',
  also_days: 'also {days}',
  also_day: 'day {day}',
  also_join: ' · ',
  no_day: 'fills the week’s core minimum',
  no_day_heading: 'Core',
  /** {movements} is the chosen movements, lower case; {superset} is `superset_word` for a printed pair. */
  carried_line: 'Plus the {movements}{superset} from day {from}.',
  superset_word: ' superset',
  list_join: ', ',
  list_last_join: ' and ',
} as const;

// ── Ride + Strength rides screen ─────────────────────────────────────────────────────────────

export const RIDES_COPY = {
  count_label: 'Rides a week',
  // Viada p278 Standard column prints seven rides; OURS — `RIDES_COPY` the six-ride choice (see `PROGRAM_COPY`).
  count_chip: { 6: 'Six rides', 7: 'Seven rides' } as Record<number, string>,
  row: 'Day {day} · {name}',
  /**
   * Viada p281, the Base program's cycling note, reworded (Michael approved the words 2026-09-19); the page: "Over a 1-month cycle, the Tuesday and Friday endurance rides
   * should be the same duration, but each cycle can increase the overall duration. The Saturday long ride can likewise
   * progress, increasing the volume gradually over the entire base season every 1 to 2 weeks." The weekday names are
   * cut (the athlete's week may not start on Monday). It replaces "If easy rides are kept conversational, use your own
   * judgement to go longer." (2026-09-18, book-language pass 4) — p281 prescribes the progression; it prints no amount,
   * so the rides are built at their printed level and the sentence is the page's.
   */
  easy_line: 'Within a 1-month cycle the endurance rides stay the same length, but each new cycle can add to the overall duration. The long ride can progress the same way, adding volume gradually every 1 to 2 weeks across the whole base season.',
} as const;

// ── Run + Strength runs screen ────────────────────────────────────────────────────────────────

const WORD: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven' };

export const RUNS_COPY = {
  // Viada p246: the week table's count of lifting days and runs — the same line the program card prints.
  // ⛔ OFF 2026-09-18 (round 3): "{lifting} lifting days a week. {runs} runs fit around them." — the words were ours.
  commitment: '{lifting} lifting days, {runs} runs.',
  // ⛔ "The two hard runs rotate." came off 2026-09-18 (book-language pass 3): p246–p247 print no rotation.
  // ⛔ "The easy run is {minutes} minutes." came off 2026-09-18 (round 3): p235 prints "25 to 30 minutes" for VT1
  // level 1 and the plan builds the run at 27:00, so the sentence said a length the week does not hold. What is
  // left operates the screen.
  sub: 'Pick how long the long run is.',
  row: 'Day {day} · {label}',
  length_label: 'Length',
  length_varies: 'length varies week to week',
  row_label: { long: 'Long session', easy: 'Easy session', easy_n: 'Easy session {n}', hard_n: 'Hard session {n}' },  // not-instruction: row labels (names), not instructions
  // ⛔ THE EXTRA EASY RUNS (2026-09-22). Viada p247: "More advanced runners may see a benefit to additional running
  // volume, and I recommend adding one or two VT1 sessions initially to test recovery." Length: p235 VT1 level 1.
  // Viada p246: the week table's runs by role (two hard, one VT1, one LSD); p235: VT1 short, LSD long, both easy.
  runs_line: '{runs} runs a week: {parts}.',
  runs_part: { hard: '{n} hard', easy: '{n} short and easy', long: '{n} long and easy' },  // not-instruction: parts of runs_line
  // Viada p247 "adding one or two VT1 sessions"; the length is p235's VT1 level 1 (25–30 min) as the week builds it.
  extra_label: 'Add up to two {minutes}-minute easy runs to your week.',
  extra_chip: { 0: 'None', 1: '1', 2: '2' } as Record<number, string>,  // not-instruction: chip labels
  extra_line: 'For more advanced runners, to test recovery.',  // Viada p247, reworded
  extra_row: 'Extra easy run {n}',  // not-instruction: a row label (name)
} as const;

/** The runs screen's top line, counted off the frame: lifting days and runs, in words. Null on a week that is not all runs. */
export function runsCommitmentLine(frameId: FrameId): string | null {
  const frame = FRAMES[frameId];
  if (!frame) return null;
  const lifting = frame.columns.standard.filter((d) => (d.strength?.length ?? 0) > 0).length;
  const slots = frame.columns.standard.flatMap((d) => d.endurance ?? []);
  if (lifting <= 0 || slots.length === 0 || !slots.every((s) => String(s.family).startsWith('run_'))) return null;
  const runs = (WORD[slots.length] ?? String(slots.length)).toLowerCase();
  return fill(RUNS_COPY.commitment, {
    lifting: WORD[lifting] ?? String(lifting),
    runs,
  });
}

/** A session length in the setup's own register: `45 min`, `1h`, `1h15`. */
export function lengthWords(minutes: number): string {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, '0')}`;
}

/** Fill `{key}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (values[k] != null ? String(values[k]) : `{${k}}`));
}
