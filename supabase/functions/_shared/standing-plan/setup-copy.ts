/**
 * THE SETUP'S WORDS FOR THE THREE PLANS — ONE SERVER FILE (punch list "Default picks and per-plan wording
 * move to the server", Michael 2026-09-13: GO).
 *
 * Every line here was approved by Michael and moved from the phone unchanged. The phone prints what the
 * server sends and holds no copy, so a wording change is a server deploy, not an app release. Placeholders
 * in braces are filled with the athlete's own values (weeks, minutes, lift names) and nothing else.
 */
import { FRAMES, type FrameId } from './frames.ts';

// ── Train screen and program list ─────────────────────────────────────────────────────────────

/** The three sections on Train, and the title of each one's program list. */
export const SECTION_COPY = {
  standard: { label: 'Multisport Focus', blurb: 'Running, riding and lifting in one plan.', list_title: 'Multisport' },
  run: { label: 'Run Focus', blurb: 'Your running, with the lifting cut around it.', list_title: 'Run' },
  ride: { label: 'Ride Focus', blurb: 'Your riding, with the lifting cut around it.', list_title: 'Ride' },
} as const;

/** Each program card: name, description and requirements line. */
export const PROGRAM_COPY = {
  run_ride_strength: {
    label: 'Run + Ride + Strength',
    blurb: 'Strength, running and riding run together, year-round, with a pivot to a race or a single sport when one comes up.',
    requirement: 'Needs a barbell and plates, a rack and a bench. A lift you have not tested gets a test session in '
      + 'week one.',
  },
  run_strength: {
    label: 'Run + Strength',
    blurb: 'You get stronger. Your speed and mileage hold. Twelve weeks: four lifting days, four runs. '
      + 'The long run stays under 100 minutes.',
    requirement: 'Needs a barbell and plates, a rack and a bench. You should be comfortable running a full hour; '
      + 'the week holds about three hours of running and seven to nine hours of training in all. '
      + 'A lift you have not tested gets a test session in week one.',
  },
  ride_strength: {
    label: 'Ride + Strength',
    blurb: 'For newer riders and riders coming back. Cycling and strength progress together. '
      + 'Four or five rides, three lifting days.',
    requirement: 'Requirements: a barbell and rack, a bench, dumbbells, something to carry, and a bike. Watts need a '
      + 'power meter or smart trainer. Bench, squat and deadlift each need a 1RM of at least 65 lb.',
  },
} as const;

// ── Build this plan? and Know your numbers? ───────────────────────────────────────────────────

/**
 * Per plan: its name, the Build this plan? lines ({name}, {weeks}), and the FTP line where the plan has one.
 * Run + Strength keeps its two older lines.
 */
export const PLAN_COPY: Record<FrameId, { name: string; confirm_title: string; confirm_line: string; ftp_note: string | null }> = {
  all_rounder: {
    name: 'Run + Ride + Strength',
    confirm_title: '{name}, {weeks} weeks.',
    confirm_line: 'A {weeks}-week plan to get stronger and faster on the run and the bike. The weights go up as you adapt to the training.',
    ftp_note: null,
  },
  strength_5k: {
    name: 'Run + Strength',
    confirm_title: '{name} — {weeks} weeks. Strength leads; your endurance holds.',
    confirm_line: 'A {weeks}-week block. Two cycles build, the third measures — the last set of that cycle is the test, '
      + 'so there is no separate retest week.',
    ftp_note: null,
  },
  cycling_base: {
    name: 'Ride + Strength',
    confirm_title: '{name}, {weeks} weeks.',
    confirm_line: 'A {weeks}-week plan to get faster and stronger. The weights go up as you adapt to the training.',
    ftp_note: "If you're coming back from a riding break, make sure your FTP is current.",
  },
};

/** The Know your numbers? screen, every line. */
export const NUMBERS_COPY = {
  title: 'Know your numbers?',
  intro: 'Optional. Keep what is on file or test in week one. Numbers are typed on Profile, not here.',
  continue: 'Continue',
  use_current: 'Use current',
  retest: 'Retest in week one',
  test: 'Test in week one',
  strength_title: 'Strength',
  lift_labels: { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', overheadPress1RM: 'OHP', pullupMaxReps: 'Pull-ups' },
  reps_suffix: ' reps',
  source_learned_lifts: 'from your logged sets',
  source_typed: 'typed in Baselines',
  strength_use_complete: 'The block uses these; no test week.',
  /** {lifts} is the untested lifts joined with ' and '; {verb} is 'is' for one, 'are' for more. */
  strength_use_partial: 'The block uses these; {lifts} {verb} tested in week one.',
  lift_list_join: ' and ',
  verb_one: 'is',
  verb_many: 'are',
  strength_test: 'Week one is the test week (p215). The number on file stays until the test replaces it.',
  strength_none: 'Nothing on file. Every lift is tested in week one (p215). Numbers can be typed on Profile.',
  ftp_title: 'FTP',
  watts: '{watts} W',
  source_ftp_manual: 'typed in Baselines',
  source_ftp_learned: 'estimated from your rides',
  source_ftp_low: 'estimated, low confidence',
  ftp_test: 'The 20-minute FTP test (p212) is scheduled into week one.',
  ftp_none: 'Nothing on file. The 20-minute FTP test (p212) is scheduled into week one.',
  run_title: 'Run threshold',
  source_run_typed: 'typed in Baselines',
  source_run_learned: 'from your runs',
  run_test: 'The threshold time trial (p210) is scheduled into week one.',
  run_none: 'Nothing on file. The threshold time trial (p210) is scheduled into week one.',
  swim_title: 'Swim pace (per 100)',
  source_swim: 'on file',
  swim_none: 'Nothing on file — there is no swim test to schedule; the number is typed on Profile.',
} as const;

// ── Build focus ───────────────────────────────────────────────────────────────────────────────

export const BUILD_FOCUS_COPY = {
  subtitle: 'These are your hypertrophy lifts and super sets based on the equipment you have. You can swap on the '
    + 'day or adjust now for the plan.',
  dose_line: 'Accessory sets are 8 to 10 reps with a rep or two left in the tank. Going to failure costs the next '
    + 'main lift.',
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
  count_chip: { 4: 'Four rides', 5: 'Five rides' } as Record<number, string>,
  row: 'Day {day} · {name}',
  easy_line: 'If easy rides are kept conversational, use your own judgement to go longer.',
} as const;

// ── Run + Strength runs screen ────────────────────────────────────────────────────────────────

const WORD: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven' };

export const RUNS_COPY = {
  commitment: '{lifting} lifting days a week. {runs} runs fit around them.',
  sub: 'Pick how long the long run is. The easy run is {minutes} minutes. The two hard runs rotate.',
  row: 'Day {day} · {label}',
  length_label: 'Length',
  length_varies: 'length varies week to week',
  row_label: { long: 'Long session', easy: 'Easy session', easy_n: 'Easy session {n}', hard_n: 'Hard session {n}' },
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
    runs: runs.replace(/^./, (c) => c.toUpperCase()),
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
