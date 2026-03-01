/**
 * Exercise name canonicalization.
 *
 * Maps free-form exercise names (from ExerciseLibrary, plan generators,
 * manual logging) to stable canonical keys used in exercise_log and
 * workout_facts. The canonical key is what trend queries group on.
 *
 * All entries are lowercase. The lookup handles casing/trimming automatically.
 * Unknown names get a best-effort slug (lowercase, underscored).
 */

const CANONICAL: Record<string, string> = {
  // --- Powerlifting / Compound ---
  'squat':                   'squat',
  'back squat':              'squat',
  'front squat':             'front_squat',
  'goblet squat':            'goblet_squat',
  'bodyweight squat':        'bodyweight_squat',
  'bike squat':              'bike_squat',
  'bulgarian split squat':   'bulgarian_split_squat',
  'split squat':             'split_squat',

  'deadlift':                'deadlift',
  'trap bar deadlift':       'trap_bar_deadlift',
  'romanian deadlift':       'romanian_deadlift',
  'rdl':                     'romanian_deadlift',
  'single leg rdl':          'single_leg_rdl',
  'sumo deadlift':           'sumo_deadlift',

  'bench press':             'bench_press',
  'dumbbell bench press':    'db_bench_press',
  'db bench press':          'db_bench_press',
  'incline bench press':     'incline_bench_press',
  'close grip bench press':  'close_grip_bench_press',

  'overhead press':          'overhead_press',
  'ohp':                     'overhead_press',
  'military press':          'overhead_press',
  'shoulder press':          'overhead_press',
  'db shoulder press':       'db_shoulder_press',

  // --- Rows ---
  'barbell row':             'barbell_row',
  'barbell rows':            'barbell_row',
  'bent over row':           'barbell_row',
  'dumbbell row':            'db_row',
  'db row':                  'db_row',
  'cable row':               'cable_row',
  'seated row':              'seated_row',

  // --- Pull / Upper ---
  'pull-up':                 'pullup',
  'pull up':                 'pullup',
  'pullup':                  'pullup',
  'pullups':                 'pullup',
  'chin-up':                 'chinup',
  'chin up':                 'chinup',
  'chinup':                  'chinup',
  'chinups':                 'chinup',
  'lat pulldown':            'lat_pulldown',

  // --- Push ---
  'push-up':                 'pushup',
  'push up':                 'pushup',
  'pushup':                  'pushup',
  'dip':                     'dip',
  'dips':                    'dip',

  // --- Hinge / Glutes ---
  'hip thrust':              'hip_thrust',
  'hip thrusts':             'hip_thrust',
  'glute bridge':            'glute_bridge',
  'good morning':            'good_morning',
  'good morning (bodyweight)': 'good_morning',

  // --- Legs ---
  'running lunge':           'running_lunge',
  'lunge':                   'lunge',
  'walking lunge':           'walking_lunge',
  'step up':                 'step_up',
  'step-up':                 'step_up',
  'leg press':               'leg_press',
  'leg curl':                'leg_curl',
  'leg extension':           'leg_extension',
  'calf raise':              'calf_raise',

  // --- Power ---
  'box jump':                'box_jump',
  'broad jump':              'broad_jump',
  'medicine ball throw':     'med_ball_throw',
  'clean pull':              'clean_pull',
  'snatch pull':             'snatch_pull',
  'power clean':             'power_clean',
  'transition burpee':       'transition_burpee',

  // --- Core ---
  'plank':                   'plank',
  'side plank':              'side_plank',
  'dead bug':                'dead_bug',
  'bird dog':                'bird_dog',
  'ab rollout':              'ab_rollout',
  'ab wheel rollout':        'ab_rollout',
  'russian twist':           'russian_twist',
  'pallof press':            'pallof_press',
  'farmer carry':            'farmer_carry',
  'suitcase carry':          'suitcase_carry',
  'turkish get-up':          'turkish_getup',
  'l-sit':                   'l_sit',

  // --- Sport-Specific ---
  "swimmer's pull":          'swimmers_pull',
  'swimmers pull':           'swimmers_pull',
};

/**
 * Derive a stable canonical name for trend tracking.
 * Known names resolve to curated keys; unknown names get slugified.
 */
export function canonicalize(raw: string): string {
  if (!raw) return 'unknown';
  const key = raw.toLowerCase().trim();
  return CANONICAL[key] ?? key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * The four major compound lifts tracked for 1RM progression.
 * Returns the canonical name if it's a big-4 lift, null otherwise.
 * @deprecated Use bigAnchorLift which covers all seven protocol anchors.
 */
export function bigFourLift(canonical: string): 'squat' | 'bench_press' | 'deadlift' | 'overhead_press' | null {
  switch (canonical) {
    case 'squat': return 'squat';
    case 'bench_press': return 'bench_press';
    case 'deadlift': return 'deadlift';
    case 'overhead_press': return 'overhead_press';
    default: return null;
  }
}

export type StrengthAnchor =
  | 'squat'
  | 'bench_press'
  | 'deadlift'
  | 'trap_bar_deadlift'
  | 'overhead_press'
  | 'hip_thrust'
  | 'barbell_row';

export const STRENGTH_ANCHOR_KEYS: ReadonlyArray<StrengthAnchor> = [
  'squat',
  'bench_press',
  'deadlift',
  'trap_bar_deadlift',
  'overhead_press',
  'hip_thrust',
  'barbell_row',
];

/**
 * Seven anchor lifts tracked for 1RM progression across all three
 * strength protocols (durability, neural_speed, upper_aesthetics).
 * Returns the canonical anchor key, or null for non-anchor exercises.
 */
export function bigAnchorLift(canonical: string): StrengthAnchor | null {
  switch (canonical) {
    case 'squat':            return 'squat';
    case 'bench_press':      return 'bench_press';
    case 'deadlift':         return 'deadlift';
    case 'trap_bar_deadlift': return 'trap_bar_deadlift';
    case 'overhead_press':   return 'overhead_press';
    case 'hip_thrust':       return 'hip_thrust';
    case 'barbell_row':      return 'barbell_row';
    default:                 return null;
  }
}

/**
 * Muscle group classification for volume tracking.
 * Returns primary muscle group tag for a canonical exercise.
 */
const MUSCLE_GROUP: Record<string, string> = {
  squat: 'legs', front_squat: 'legs', goblet_squat: 'legs', bodyweight_squat: 'legs',
  bike_squat: 'legs', bulgarian_split_squat: 'legs', split_squat: 'legs',
  running_lunge: 'legs', lunge: 'legs', walking_lunge: 'legs', step_up: 'legs',
  leg_press: 'legs', leg_curl: 'legs', leg_extension: 'legs', calf_raise: 'legs',
  box_jump: 'legs', broad_jump: 'legs',

  deadlift: 'posterior', trap_bar_deadlift: 'posterior', romanian_deadlift: 'posterior',
  single_leg_rdl: 'posterior', sumo_deadlift: 'posterior',
  hip_thrust: 'posterior', glute_bridge: 'posterior', good_morning: 'posterior',

  bench_press: 'chest', db_bench_press: 'chest', incline_bench_press: 'chest',
  close_grip_bench_press: 'chest', pushup: 'chest', dip: 'chest',

  overhead_press: 'shoulders', db_shoulder_press: 'shoulders',
  med_ball_throw: 'shoulders',

  barbell_row: 'back', db_row: 'back', cable_row: 'back', seated_row: 'back',
  pullup: 'back', chinup: 'back', lat_pulldown: 'back',
  clean_pull: 'back', snatch_pull: 'back', power_clean: 'back',
  swimmers_pull: 'back',

  plank: 'core', side_plank: 'core', dead_bug: 'core', bird_dog: 'core',
  ab_rollout: 'core', russian_twist: 'core', pallof_press: 'core',
  farmer_carry: 'core', suitcase_carry: 'core', turkish_getup: 'core', l_sit: 'core',

  transition_burpee: 'full_body',
};

export function muscleGroup(canonical: string): string {
  return MUSCLE_GROUP[canonical] ?? 'other';
}
