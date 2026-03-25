/**
 * Exercise Registry Seed Script (Step 2)
 * Merges ExerciseLibrary (STRENGTH_EXERCISES + CORE_EXERCISES), materialize-plan
 * exercise-config, and canonicalize.ts into scripts/exercise-seed-data.json
 *
 * Run: npx tsx scripts/seed-exercises.ts
 * No database.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXERCISE_CONFIG, type ExerciseConfig } from '../supabase/functions/materialize-plan/exercise-config.ts';
import { canonicalize, muscleGroup } from '../supabase/functions/_shared/canonicalize.ts';
import {
  CORE_EXERCISES,
  STRENGTH_EXERCISES,
  type CoreExercise,
  type StrengthExercise,
} from '../src/services/ExerciseLibrary.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Parse CANONICAL map from source (not exported from canonicalize.ts)
// ---------------------------------------------------------------------------

function parseCanonicalFromSource(ts: string): Record<string, string> {
  const map: Record<string, string> = {};
  const start = ts.indexOf('const CANONICAL');
  if (start === -1) return map;
  const brace = ts.indexOf('{', start);
  let depth = 0;
  let i = brace;
  for (; i < ts.length; i++) {
    const c = ts[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const body = ts.slice(brace + 1, i - 1);
  const re =
    /(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const k = m[2].replace(/\\(.)/g, '$1');
    const v = m[4].replace(/\\(.)/g, '$1');
    map[k.toLowerCase().trim()] = v;
  }
  return map;
}

const CANONICAL_SRC = readFileSync(
  join(__dirname, '../supabase/functions/_shared/canonicalize.ts'),
  'utf8',
);
const CANONICAL_MAP = parseCanonicalFromSource(CANONICAL_SRC);

// ---------------------------------------------------------------------------
// Allowed vocabulary (spec rev 3)
// ---------------------------------------------------------------------------

const ALLOWED_MUSCLES = new Set([
  'chest',
  'anterior_deltoid',
  'lateral_deltoid',
  'posterior_deltoid',
  'triceps',
  'biceps',
  'forearms',
  'upper_back',
  'lats',
  'lower_back',
  'erector_spinae',
  'core',
  'obliques',
  'hip_flexors',
  'glutes',
  'quadriceps',
  'hamstrings',
  'calves',
  'adductors',
  'abductors',
]);

const ALLOWED_EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'band',
  'kettlebell',
  'trap_bar',
  'ez_bar',
  'landmine',
  'smith_machine',
]);

// ---------------------------------------------------------------------------
// Attribution presets (spec examples + close variants)
// ---------------------------------------------------------------------------

const ATTRIBUTION_PRESETS: Record<string, { primary: Record<string, number>; secondary: Record<string, number> }> = {
  bench_press: {
    primary: { chest: 0.55, anterior_deltoid: 0.25, triceps: 0.2 },
    secondary: { core: 0.1 },
  },
  db_bench_press: {
    primary: { chest: 0.55, anterior_deltoid: 0.25, triceps: 0.2 },
    secondary: { core: 0.1 },
  },
  incline_bench_press: {
    primary: { chest: 0.5, anterior_deltoid: 0.3, triceps: 0.2 },
    secondary: { core: 0.1 },
  },
  close_grip_bench_press: {
    primary: { chest: 0.45, anterior_deltoid: 0.2, triceps: 0.35 },
    secondary: { core: 0.1 },
  },
  squat: {
    primary: { quadriceps: 0.45, glutes: 0.35, hamstrings: 0.2 },
    secondary: { core: 0.15, erector_spinae: 0.1 },
  },
  front_squat: {
    primary: { quadriceps: 0.5, glutes: 0.3, hamstrings: 0.2 },
    secondary: { core: 0.15, erector_spinae: 0.1 },
  },
  goblet_squat: {
    primary: { quadriceps: 0.5, glutes: 0.35, hamstrings: 0.15 },
    secondary: { core: 0.12 },
  },
  deadlift: {
    primary: { hamstrings: 0.3, glutes: 0.3, lower_back: 0.2, quadriceps: 0.2 },
    secondary: { upper_back: 0.15, forearms: 0.1 },
  },
  trap_bar_deadlift: {
    primary: { hamstrings: 0.28, glutes: 0.32, lower_back: 0.18, quadriceps: 0.22 },
    secondary: { upper_back: 0.14, forearms: 0.1 },
  },
  romanian_deadlift: {
    primary: { hamstrings: 0.45, glutes: 0.35, lower_back: 0.2 },
    secondary: { forearms: 0.08, upper_back: 0.08 },
  },
  sumo_deadlift: {
    primary: { hamstrings: 0.28, glutes: 0.32, adductors: 0.15, quadriceps: 0.15, lower_back: 0.1 },
    secondary: { upper_back: 0.12, forearms: 0.1 },
  },
  pullup: {
    primary: { lats: 0.5, upper_back: 0.25, biceps: 0.25 },
    secondary: { forearms: 0.1, core: 0.08 },
  },
  chinup: {
    primary: { lats: 0.45, upper_back: 0.2, biceps: 0.35 },
    secondary: { forearms: 0.1, core: 0.08 },
  },
  overhead_press: {
    primary: { anterior_deltoid: 0.45, lateral_deltoid: 0.2, triceps: 0.35 },
    secondary: { core: 0.12 },
  },
  db_shoulder_press: {
    primary: { anterior_deltoid: 0.45, lateral_deltoid: 0.22, triceps: 0.33 },
    secondary: { core: 0.12 },
  },
  pushup: {
    primary: { chest: 0.5, anterior_deltoid: 0.2, triceps: 0.3 },
    secondary: { core: 0.12 },
  },

  barbell_row: {
    primary: { upper_back: 0.45, lats: 0.35, biceps: 0.2 },
    secondary: { forearms: 0.1, erector_spinae: 0.08 },
  },
  db_row: {
    primary: { lats: 0.4, upper_back: 0.35, biceps: 0.25 },
    secondary: { forearms: 0.1 },
  },
  cable_row: {
    primary: { upper_back: 0.4, lats: 0.35, biceps: 0.25 },
    secondary: { forearms: 0.08 },
  },
  seated_row: {
    primary: { upper_back: 0.42, lats: 0.33, biceps: 0.25 },
    secondary: { forearms: 0.08 },
  },
  lat_pulldown: {
    primary: { lats: 0.55, upper_back: 0.25, biceps: 0.2 },
    secondary: { forearms: 0.08 },
  },
  inverted_row: {
    primary: { upper_back: 0.4, lats: 0.35, biceps: 0.25 },
    secondary: { core: 0.1 },
  },

  leg_press: {
    primary: { quadriceps: 0.65, glutes: 0.35 },
    secondary: { hamstrings: 0.08 },
  },
  leg_extension: { primary: { quadriceps: 1.0 }, secondary: {} },
  leg_curl: { primary: { hamstrings: 1.0 }, secondary: {} },

  walking_lunge: {
    primary: { quadriceps: 0.45, glutes: 0.38, hamstrings: 0.17 },
    secondary: { core: 0.1 },
  },
  lunge: {
    primary: { quadriceps: 0.45, glutes: 0.38, hamstrings: 0.17 },
    secondary: { core: 0.1 },
  },
  bulgarian_split_squat: {
    primary: { quadriceps: 0.48, glutes: 0.37, hamstrings: 0.15 },
    secondary: { core: 0.12 },
  },
  split_squat: {
    primary: { quadriceps: 0.48, glutes: 0.37, hamstrings: 0.15 },
    secondary: { core: 0.1 },
  },
  step_up: {
    primary: { quadriceps: 0.5, glutes: 0.35, hamstrings: 0.15 },
    secondary: { core: 0.1 },
  },
  lateral_lunge: {
    primary: { quadriceps: 0.4, glutes: 0.3, adductors: 0.3 },
    secondary: { core: 0.1 },
  },

  hip_thrust: {
    primary: { glutes: 0.55, hamstrings: 0.28, quadriceps: 0.17 },
    secondary: { core: 0.08 },
  },
  glute_bridge: {
    primary: { glutes: 0.7, hamstrings: 0.3 },
    secondary: { core: 0.08 },
  },
  single_leg_rdl: {
    primary: { hamstrings: 0.45, glutes: 0.4, lower_back: 0.15 },
    secondary: { core: 0.1 },
  },
  calf_raise: { primary: { calves: 1.0 }, secondary: {} },

  dip: {
    primary: { triceps: 0.45, chest: 0.35, anterior_deltoid: 0.2 },
    secondary: { core: 0.1 },
  },
  chest_fly: {
    primary: { chest: 0.88, anterior_deltoid: 0.12 },
    secondary: {},
  },
  dumbbell_fly: {
    primary: { chest: 0.88, anterior_deltoid: 0.12 },
    secondary: {},
  },
  face_pull: {
    primary: { posterior_deltoid: 0.45, upper_back: 0.4, biceps: 0.15 },
    secondary: { forearms: 0.06 },
  },
  lateral_raise: { primary: { lateral_deltoid: 1.0 }, secondary: { core: 0.08 } },
  front_raise: { primary: { anterior_deltoid: 1.0 }, secondary: { core: 0.06 } },
  reverse_fly: {
    primary: { posterior_deltoid: 0.55, upper_back: 0.45 },
    secondary: {},
  },

  clean_pull: {
    primary: { hamstrings: 0.34, glutes: 0.3, upper_back: 0.26, lats: 0.1 },
    secondary: { forearms: 0.1, core: 0.1 },
  },
  snatch_pull: {
    primary: { hamstrings: 0.32, glutes: 0.3, upper_back: 0.28, lats: 0.1 },
    secondary: { forearms: 0.1, core: 0.1 },
  },
  power_clean: {
    primary: { quadriceps: 0.3, glutes: 0.28, hamstrings: 0.22, upper_back: 0.2 },
    secondary: { forearms: 0.12, core: 0.1 },
  },
  med_ball_throw: {
    primary: { chest: 0.35, anterior_deltoid: 0.35, core: 0.3 },
    secondary: { triceps: 0.1 },
  },

  box_jump: {
    primary: { quadriceps: 0.45, glutes: 0.4, calves: 0.15 },
    secondary: { hamstrings: 0.08 },
  },
  broad_jump: {
    primary: { quadriceps: 0.45, glutes: 0.4, calves: 0.15 },
    secondary: { hamstrings: 0.08 },
  },
  bike_squat: {
    primary: { quadriceps: 0.48, glutes: 0.35, hamstrings: 0.17 },
    secondary: { core: 0.1 },
  },
  running_lunge: {
    primary: { quadriceps: 0.45, glutes: 0.38, hamstrings: 0.17 },
    secondary: { core: 0.1 },
  },
  good_morning: {
    primary: { hamstrings: 0.35, lower_back: 0.35, glutes: 0.3 },
    secondary: { erector_spinae: 0.12 },
  },
  swimmers_pull: {
    primary: { lats: 0.45, upper_back: 0.35, posterior_deltoid: 0.2 },
    secondary: { biceps: 0.08, forearms: 0.06 },
  },
  transition_burpee: {
    primary: { quadriceps: 0.35, chest: 0.25, core: 0.25, anterior_deltoid: 0.15 },
    secondary: { triceps: 0.1 },
  },
};

function sumWeights(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

function normalizePrimarySum(primary: Record<string, number>): Record<string, number> {
  const s = sumWeights(primary);
  if (s <= 0) return { quadriceps: 1.0 };
  const out: Record<string, number> = {};
  const keys = Object.keys(primary);
  let acc = 0;
  keys.forEach((k, idx) => {
    if (idx === keys.length - 1) out[k] = Math.round((1 - acc) * 1000) / 1000;
    else {
      const v = Math.round((primary[k]! / s) * 1000) / 1000;
      out[k] = v;
      acc += v;
    }
  });
  return out;
}

/** Core timer exercises: deterministic attribution (not equal-split). */
function coreAttribution(cx: CoreExercise): { primary: Record<string, number>; secondary: Record<string, number> } {
  switch (cx.category) {
    case 'abs':
      return { primary: { core: 1 }, secondary: {} };
    case 'obliques':
      return { primary: { obliques: 0.85, core: 0.15 }, secondary: {} };
    case 'lower_back':
      return { primary: { lower_back: 0.5, erector_spinae: 0.5 }, secondary: { core: 0.08 } };
    case 'stability':
      return { primary: { core: 1 }, secondary: {} };
    case 'full_core':
      if (/farmer|suitcase/i.test(cx.name)) {
        return { primary: { forearms: 0.35, upper_back: 0.35, core: 0.3 }, secondary: {} };
      }
      if (/turkish|get-?up/i.test(cx.name)) {
        return { primary: { core: 0.35, glutes: 0.25, quadriceps: 0.2, anterior_deltoid: 0.2 }, secondary: {} };
      }
      return { primary: { core: 1 }, secondary: {} };
    default:
      return { primary: { core: 1 }, secondary: {} };
  }
}

function coreMovementPattern(cx: CoreExercise): string {
  if (cx.category === 'obliques' && /woodchop|rotation|landmine/i.test(cx.name)) return 'rotational';
  if (cx.category === 'obliques') return 'core';
  if (cx.category === 'lower_back') return 'hip_hinge';
  return 'core';
}

/** Fill presets from CORE_EXERCISES where no barbell/compound preset exists. */
function injectCorePresets(
  presets: Record<string, { primary: Record<string, number>; secondary: Record<string, number> }>,
) {
  for (const cx of CORE_EXERCISES) {
    const slug = canonicalize(cx.name);
    if (slug === 'unknown') continue;
    if (presets[slug]) continue;
    const { primary, secondary } = coreAttribution(cx);
    presets[slug] = { primary: normalizePrimarySum(primary), secondary };
  }
}

// ---------------------------------------------------------------------------
// Muscle normalization
// ---------------------------------------------------------------------------

function normalizeMuscleName(
  raw: string,
  ctx: { slug: string; movementPattern: string },
): { muscles: string[]; ambiguous: boolean } {
  const t = raw.toLowerCase().trim().replace(/\s+/g, '_');
  if (ALLOWED_MUSCLES.has(t)) return { muscles: [t], ambiguous: false };

  switch (t) {
    case 'shoulders':
      if (ctx.movementPattern === 'vertical_push')
        return { muscles: ['anterior_deltoid', 'lateral_deltoid'], ambiguous: false };
      if (ctx.slug.includes('lateral') || ctx.slug.includes('raise'))
        return { muscles: ['lateral_deltoid'], ambiguous: false };
      return { muscles: ['anterior_deltoid'], ambiguous: true };
    case 'rhomboids':
    case 'traps':
      return { muscles: ['upper_back'], ambiguous: false };
    case 'back':
      if (ctx.movementPattern === 'vertical_pull') return { muscles: ['lats'], ambiguous: true };
      return { muscles: ['upper_back'], ambiguous: true };
    case 'legs':
      return { muscles: ['quadriceps', 'hamstrings', 'glutes'], ambiguous: true };
    case 'posterior':
    case 'posterior_chain':
      return { muscles: ['hamstrings', 'glutes', 'lower_back'], ambiguous: true };
    case 'arms':
      if (ctx.slug.includes('curl') || ctx.movementPattern === 'isolation_upper')
        return { muscles: ['biceps'], ambiguous: true };
      return { muscles: ['triceps'], ambiguous: true };
    case 'abs':
      return { muscles: ['core'], ambiguous: false };
    case 'cardio':
      return { muscles: [], ambiguous: false };
    case 'full_body':
      return { muscles: ['quadriceps', 'glutes', 'core'], ambiguous: true };
    default:
      return { muscles: [], ambiguous: true };
  }
}

function musclesFromLibrary(
  lib: StrengthExercise,
  slug: string,
  movementPattern: string,
): { primary: string[]; secondary: string[]; ambiguous: boolean } {
  let ambiguous = false;
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const m of lib.primaryMuscles) {
    const { muscles, ambiguous: am } = normalizeMuscleName(m, { slug, movementPattern });
    ambiguous ||= am;
    primary.push(...muscles);
  }
  for (const m of lib.secondaryMuscles) {
    const { muscles, ambiguous: am } = normalizeMuscleName(m, { slug, movementPattern });
    ambiguous ||= am;
    secondary.push(...muscles);
  }
  return { primary: [...new Set(primary)], secondary: [...new Set(secondary)], ambiguous };
}

function musclesFromSlugFallback(slug: string): { primary: string[]; secondary: string[]; ambiguous: boolean } {
  if (/face_pull|reverse_fly|ytw|rear_delt/.test(slug))
    return { primary: ['posterior_deltoid', 'upper_back'], secondary: [], ambiguous: true };
  if (/lateral_raise|front_raise/.test(slug))
    return { primary: ['lateral_deltoid'], secondary: [], ambiguous: false };
  if (/curl/.test(slug)) return { primary: ['biceps'], secondary: ['forearms'], ambiguous: false };
  if (/leg_extension/.test(slug)) return { primary: ['quadriceps'], secondary: [], ambiguous: false };
  if (/leg_curl|hamstring/.test(slug)) return { primary: ['hamstrings'], secondary: [], ambiguous: false };
  if (/fly|flye/.test(slug)) return { primary: ['chest'], secondary: ['anterior_deltoid'], ambiguous: true };
  if (/shrug/.test(slug)) return { primary: ['upper_back'], secondary: ['forearms'], ambiguous: true };
  if (/swing/.test(slug)) return { primary: ['glutes', 'hamstrings'], secondary: ['core'], ambiguous: true };
  if (/bench|dip|pushup|push_up|inverted_row/.test(slug))
    return { primary: ['chest', 'triceps'], secondary: ['anterior_deltoid', 'core'], ambiguous: true };
  if (/raise|press/.test(slug) && /shoulder|db_shoulder|dumbbell_shoulder/.test(slug))
    return { primary: ['anterior_deltoid', 'lateral_deltoid', 'triceps'], secondary: ['core'], ambiguous: true };
  return { primary: ['quadriceps', 'glutes'], secondary: ['core'], ambiguous: true };
}

function musclesFromMuscleGroupSlug(slug: string): { primary: string[]; secondary: string[]; ambiguous: boolean } {
  const g = muscleGroup(slug);
  switch (g) {
    case 'legs':
      return { primary: ['quadriceps', 'hamstrings', 'glutes'], secondary: ['core'], ambiguous: true };
    case 'posterior':
      return { primary: ['hamstrings', 'glutes', 'lower_back'], secondary: ['upper_back'], ambiguous: true };
    case 'chest':
      return { primary: ['chest', 'triceps', 'anterior_deltoid'], secondary: ['core'], ambiguous: true };
    case 'shoulders':
      return { primary: ['anterior_deltoid', 'lateral_deltoid', 'triceps'], secondary: ['core'], ambiguous: true };
    case 'back':
      return { primary: ['lats', 'upper_back', 'biceps'], secondary: ['forearms'], ambiguous: true };
    case 'core':
      return { primary: ['core'], secondary: [], ambiguous: false };
    case 'full_body':
      return { primary: ['quadriceps', 'glutes', 'core'], secondary: [], ambiguous: true };
    default:
      return musclesFromSlugFallback(slug);
  }
}

// ---------------------------------------------------------------------------
// Movement pattern + equipment
// ---------------------------------------------------------------------------

function inferMovementPattern(slug: string): string {
  if (/squat|leg_press|lunge|split_squat|step_up|goblet|bike_squat|box_jump|jump|skater|calf|leg_extension|air_squat|bodyweight_squat/.test(slug))
    return /calf/.test(slug) ? 'isolation_lower' : 'squat';
  if (/deadlift|rdl|hip_thrust|glute_bridge|swing|good_morning|hinge|romanian/.test(slug)) return 'hip_hinge';
  if (/bench|pushup|push_up|dip|fly|press/.test(slug) && !/shoulder|overhead|ohp|inverted/.test(slug))
    return 'horizontal_push';
  if (/incline/.test(slug)) return 'horizontal_push';
  if (/overhead|shoulder_press|ohp|pike_push/.test(slug)) return 'vertical_push';
  if (/pullup|chinup|pulldown|pullover/.test(slug)) return 'vertical_pull';
  if (/row|face_pull|inverted/.test(slug)) return 'horizontal_pull';
  if (/curl|extension|raise|flye|ytw|clamshell|band_walk/.test(slug))
    return /leg_curl|leg_extension|hamstring|quad|adductor|calf/.test(slug) ? 'isolation_lower' : 'isolation_upper';
  if (/plank|dead_bug|bird|pallof|russian|rollout|l_sit|getup|copenhagen|core|circuit/.test(slug)) return 'core';
  if (/carry|suitcase|farmer/.test(slug)) return 'carry';
  if (/throw|clean|snatch|ball|burpee|med_ball|bounding|transition/.test(slug)) return 'rotational';
  return 'isolation_upper';
}

function libraryEquipmentToSpec(eq: string[]): string {
  const flat = eq.join(' ').toLowerCase();
  if (/barbell/.test(flat)) return 'barbell';
  if (/dumbbell|db\b/.test(flat)) return 'dumbbell';
  if (/kettlebell|kb\b/.test(flat)) return 'kettlebell';
  if (/cable/.test(flat)) return 'cable';
  if (/band|resistance/.test(flat)) return 'band';
  if (/machine|leg press|smith/.test(flat)) return 'machine';
  if (/trap|hex/.test(flat)) return 'trap_bar';
  if (/pull.up|bar|bodyweight|plyo|medicine|box/.test(flat) || eq.length === 0) return 'bodyweight';
  return 'bodyweight';
}

function inferEquipment(
  slug: string,
  lib: StrengthExercise | null,
  config: ExerciseConfig | null,
  coreEx: CoreExercise | null,
): string {
  if (lib) {
    const e = libraryEquipmentToSpec(lib.equipment);
    if (e !== 'bodyweight' || lib.equipment.length === 0) return e;
  }
  if (coreEx) {
    const e = libraryEquipmentToSpec(coreEx.equipment);
    if (e !== 'bodyweight' || coreEx.equipment.length === 0) return e;
  }
  if (config?.displayFormat === 'band') return 'band';
  if (config?.displayFormat === 'bodyweight') return 'bodyweight';
  if (/db_|dumbbell/.test(slug)) return 'dumbbell';
  if (/cable|pulldown|face_pull/.test(slug)) return 'cable';
  if (/kettlebell|kb_|swing/.test(slug)) return 'kettlebell';
  if (/trap_bar|trap bar/.test(slug)) return 'trap_bar';
  if (/leg_press|leg_extension|leg_curl|machine/.test(slug)) return 'machine';
  if (/barbell|bench_press|deadlift|squat|row|press/.test(slug) && !/db_|pushup|pullup|chinup/.test(slug))
    return 'barbell';
  if (/pullup|chinup|pushup|plank|lunge|jump|burpee|bodyweight|air_squat|box_jump|broad|skater|copenhagen|single_leg_glute|core_circuit|core_work/.test(slug))
    return 'bodyweight';
  return 'dumbbell';
}

function mapDisplayFormat(df: ExerciseConfig['displayFormat']): string {
  switch (df) {
    case 'bodyweight':
      return 'bodyweight_reps';
    case 'band':
      return 'weight_reps';
    default:
      return 'weight_reps';
  }
}

function inferBodyRegion(primary: string[]): string {
  const lower = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip_flexors']);
  const upper = new Set([
    'chest',
    'anterior_deltoid',
    'lateral_deltoid',
    'posterior_deltoid',
    'triceps',
    'biceps',
    'forearms',
    'upper_back',
    'lats',
  ]);
  let l = 0;
  let u = 0;
  for (const m of primary) {
    if (lower.has(m)) l++;
    if (upper.has(m)) u++;
  }
  if (l && u) return 'full_body';
  if (l) return 'lower';
  if (u) return 'upper';
  if (primary.includes('core') || primary.includes('obliques')) return 'core';
  return 'full_body';
}

function buildAttribution(
  slug: string,
  primaryMuscles: string[],
  secondaryMuscles: string[],
): { primary: Record<string, number>; secondary: Record<string, number>; heuristic: boolean } {
  const preset = ATTRIBUTION_PRESETS[slug];
  if (preset) {
    return { primary: { ...preset.primary }, secondary: { ...preset.secondary }, heuristic: false };
  }
  if (primaryMuscles.length === 0) {
    const eq = normalizePrimarySum({ core: 1.0 });
    return { primary: eq, secondary: {}, heuristic: true };
  }
  if (primaryMuscles.length === 1) {
    const p = normalizePrimarySum({ [primaryMuscles[0]!]: 1.0 });
    const sec: Record<string, number> = {};
    for (const s of secondaryMuscles) {
      if (s !== primaryMuscles[0]) sec[s] = 0.1;
    }
    return { primary: p, secondary: sec, heuristic: false };
  }
  const w = 1 / primaryMuscles.length;
  const prim: Record<string, number> = {};
  for (const m of primaryMuscles) prim[m] = w;
  const sec: Record<string, number> = {};
  for (const s of secondaryMuscles) {
    if (!primaryMuscles.includes(s)) sec[s] = 0.1;
  }
  return { primary: normalizePrimarySum(prim), secondary: sec, heuristic: true };
}

function inferMechanicalStress(equipment: string, movementPattern: string): 'low' | 'moderate' | 'high' {
  if (equipment === 'machine') return 'low';
  if (equipment === 'barbell' && /squat|deadlift|hip_hinge|press|bench|row|clean|snatch/.test(movementPattern))
    return 'high';
  if (equipment === 'barbell') return 'high';
  if (equipment === 'dumbbell' || equipment === 'cable') return 'moderate';
  return 'moderate';
}

function inferCnsDemand(movementPattern: string, slug: string): 'low' | 'moderate' | 'high' {
  if (/clean|snatch|deadlift|squat|power_clean|sumo|trap_bar/.test(slug)) return 'high';
  if (movementPattern === 'hip_hinge' || movementPattern === 'squat') return 'high';
  if (movementPattern === 'isolation_upper' || movementPattern === 'isolation_lower') return 'low';
  return 'moderate';
}

function inferRecoveryHours(movementPattern: string, slug: string): number {
  if (/deadlift|rdl|romanian|sumo|trap_bar/.test(slug)) return 72;
  if (movementPattern === 'isolation_upper' || movementPattern === 'isolation_lower') return 24;
  return 48;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

type SeedRow = {
  slug: string;
  display_name: string;
  aliases: string[];
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  muscle_attribution: { primary: Record<string, number>; secondary: Record<string, number> };
  equipment: string;
  is_unilateral: boolean;
  is_compound: boolean;
  load_ratio: number;
  mechanical_stress: string;
  cns_demand: string;
  recovery_hours_typical: number;
  body_region: string;
  display_format: string;
  notes: string | null;
  source: 'seed';
  is_active: boolean;
  needs_review: boolean;
  /** Equal-split heuristic across 3+ primary muscles — priority review list */
  heuristic_equal_multi_primary: boolean;
};

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function main() {
  console.log('Exercise Registry Seed Script');
  console.log('==============================');

  injectCorePresets(ATTRIBUTION_PRESETS);

  const slugToAliases = new Map<string, Set<string>>();
  for (const [alias, slug] of Object.entries(CANONICAL_MAP)) {
    if (!slugToAliases.has(slug)) slugToAliases.set(slug, new Set());
    slugToAliases.get(slug)!.add(alias.toLowerCase());
  }

  const configBySlug = new Map<string, { key: string; cfg: ExerciseConfig }[]>();
  for (const key of Object.keys(EXERCISE_CONFIG)) {
    const slug = canonicalize(key);
    if (slug === 'unknown') continue;
    if (!configBySlug.has(slug)) configBySlug.set(slug, []);
    configBySlug.get(slug)!.push({ key, cfg: EXERCISE_CONFIG[key]! });
  }

  const libraryBySlug = new Map<string, StrengthExercise[]>();
  for (const ex of STRENGTH_EXERCISES) {
    const slug = canonicalize(ex.name);
    if (slug === 'unknown') continue;
    if (!libraryBySlug.has(slug)) libraryBySlug.set(slug, []);
    libraryBySlug.get(slug)!.push(ex);
  }

  const coreBySlug = new Map<string, CoreExercise[]>();
  for (const cx of CORE_EXERCISES) {
    const slug = canonicalize(cx.name);
    if (slug === 'unknown') continue;
    if (!coreBySlug.has(slug)) coreBySlug.set(slug, []);
    coreBySlug.get(slug)!.push(cx);
  }

  const allSlugs = new Set<string>();
  slugToAliases.forEach((_, s) => allSlugs.add(s));
  configBySlug.forEach((_, s) => allSlugs.add(s));
  libraryBySlug.forEach((_, s) => allSlugs.add(s));
  coreBySlug.forEach((_, s) => allSlugs.add(s));

  allSlugs.delete('unknown');
  allSlugs.delete('_smoke_registry_validate');

  let mergeConflicts = 0;
  let needsReviewCount = 0;
  let heuristicMultiPrimaryCount = 0;
  let cleanMerges = 0;
  const validationFailures: string[] = [];
  const rows: SeedRow[] = [];

  for (const slug of [...allSlugs].sort()) {
    const aliasSet = slugToAliases.get(slug) ?? new Set<string>();
    const configs = configBySlug.get(slug) ?? [];
    configs.sort((a, b) => a.key.localeCompare(b.key));
    let mergedConfig: ExerciseConfig | null = null;
    for (const { cfg } of configs) mergedConfig = { ...mergedConfig, ...cfg } as ExerciseConfig;

    const libs = libraryBySlug.get(slug) ?? [];
    const lib = libs[0] ?? null;
    const coreLibs = coreBySlug.get(slug) ?? [];
    const coreEx = coreLibs[0] ?? null;

    if (lib) {
      aliasSet.add(lib.name.toLowerCase());
    }
    if (coreEx) {
      aliasSet.add(coreEx.name.toLowerCase());
    }
    for (const { key } of configs) aliasSet.add(key.toLowerCase());

    const inCanonical = Object.values(CANONICAL_MAP).includes(slug);

    const movementPattern =
      coreEx && !lib ? coreMovementPattern(coreEx) : inferMovementPattern(slug);

    let primaryMuscles: string[] = [];
    let secondaryMuscles: string[] = [];
    let muscleAmbiguous = false;

    if (lib) {
      const m = musclesFromLibrary(lib, slug, movementPattern);
      primaryMuscles = m.primary.filter((x) => ALLOWED_MUSCLES.has(x));
      secondaryMuscles = m.secondary.filter((x) => ALLOWED_MUSCLES.has(x));
      muscleAmbiguous = m.ambiguous;
    }
    if (primaryMuscles.length === 0) {
      const fb = musclesFromMuscleGroupSlug(slug);
      primaryMuscles = fb.primary.filter((x) => ALLOWED_MUSCLES.has(x));
      secondaryMuscles = fb.secondary.filter((x) => ALLOWED_MUSCLES.has(x));
      muscleAmbiguous ||= fb.ambiguous;
    }

    const equipment = inferEquipment(slug, lib, mergedConfig, coreEx);
    if (!ALLOWED_EQUIPMENT.has(equipment)) muscleAmbiguous = true;

    let loadRatio = mergedConfig?.ratio ?? (primaryMuscles.length <= 1 ? 0.5 : 1.0);
    if (mergedConfig?.ratio === 0 && mergedConfig?.primaryRef === null) loadRatio = 0.5;
    if (!mergedConfig && coreEx) loadRatio = 0.5;

    const isUnilateral =
      mergedConfig?.isUnilateral !== undefined
        ? mergedConfig.isUnilateral
        : coreEx
          ? /each (side|leg)|each$/i.test(coreEx.defaultAmount)
          : false;

    let conflict = false;
    if (lib && mergedConfig) {
      const libUni = /each (leg|arm|side)/i.test(lib.reps) || /unilateral/i.test(lib.notes ?? '');
      if (libUni !== isUnilateral && configs.length > 0) {
        conflict = true;
        mergeConflicts++;
      }
    }

    const displayName = lib?.name ?? coreEx?.name ?? titleCaseFromSlug(slug);
    const displayFormat = mergedConfig ? mapDisplayFormat(mergedConfig.displayFormat) : 'weight_reps';

    const { primary: primAttr, secondary: secAttr, heuristic: attrHeuristic } = buildAttribution(
      slug,
      primaryMuscles,
      secondaryMuscles,
    );

    // Keep arrays aligned with attribution (presets may add prime movers not listed as "primary" in ExerciseLibrary)
    primaryMuscles = Object.keys(primAttr).sort();
    secondaryMuscles = [...new Set([...Object.keys(secAttr), ...secondaryMuscles])]
      .filter((m) => !primaryMuscles.includes(m))
      .sort();

    const primarySum = sumWeights(primAttr);
    if (Math.abs(primarySum - 1) > 0.02) {
      validationFailures.push(`${slug}: primary attribution sum ${primarySum}`);
    }

    const canonicalOnly = inCanonical && configs.length === 0 && !lib && !coreEx;
    /** In CANONICAL but no source row — still OK if we have a barbell/compound preset */
    const canonicalOrphanNoPreset = canonicalOnly && !ATTRIBUTION_PRESETS[slug];
    const primaryKeyCount = Object.keys(primAttr).length;
    const heuristic_equal_multi_primary = attrHeuristic && primaryKeyCount >= 3;

    // muscleAmbiguous is metadata only — library "shoulders" on bench, etc. must not
    // override a valid preset/heuristic row (otherwise ~everything needs_review).
    let needs_review =
      conflict ||
      primaryKeyCount === 0 ||
      canonicalOrphanNoPreset ||
      heuristic_equal_multi_primary ||
      !ALLOWED_EQUIPMENT.has(equipment);

    const notesParts: string[] = [];
    if (lib?.notes) notesParts.push(lib.notes);
    if (mergedConfig?.notes) notesParts.push(mergedConfig.notes);
    if (conflict) notesParts.push('merge: exercise-config isUnilateral took precedence over library rep pattern');

    const row: SeedRow = {
      slug,
      display_name: displayName,
      aliases: [...aliasSet].sort(),
      movement_pattern: movementPattern,
      primary_muscles: [...new Set(primaryMuscles)],
      secondary_muscles: [...new Set(secondaryMuscles)],
      muscle_attribution: { primary: primAttr, secondary: secAttr },
      equipment,
      is_unilateral: isUnilateral,
      is_compound: primaryMuscles.length >= 2,
      load_ratio: Math.round(loadRatio * 1000) / 1000,
      mechanical_stress: inferMechanicalStress(equipment, movementPattern),
      cns_demand: inferCnsDemand(movementPattern, slug),
      recovery_hours_typical: inferRecoveryHours(movementPattern, slug),
      body_region: inferBodyRegion(primaryMuscles),
      display_format: displayFormat,
      notes: notesParts.length ? notesParts.join(' | ') : null,
      source: 'seed',
      is_active: true,
      needs_review,
      heuristic_equal_multi_primary,
    };

    rows.push(row);
    if (row.needs_review) needsReviewCount++;
    else cleanMerges++;
    if (heuristic_equal_multi_primary) heuristicMultiPrimaryCount++;
  }

  const outPath = join(__dirname, 'exercise-seed-data.json');
  writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf8');

  const byRegion: Record<string, number> = { upper: 0, lower: 0, full_body: 0, core: 0 };
  const byEq: Record<string, number> = {};
  for (const r of rows) {
    byRegion[r.body_region] = (byRegion[r.body_region] ?? 0) + 1;
    byEq[r.equipment] = (byEq[r.equipment] ?? 0) + 1;
  }

  const withAliases = rows.filter((r) => r.aliases.length > 0).length;
  const avgAliases = withAliases ? rows.reduce((s, r) => s + r.aliases.length, 0) / withAliases : 0;

  console.log('\nSources loaded:');
  console.log(
    `  ExerciseLibrary.ts: ${STRENGTH_EXERCISES.length} strength + ${CORE_EXERCISES.length} core timer exercises`,
  );
  console.log(`  exercise-config.ts: ${Object.keys(EXERCISE_CONFIG).length} keys`);
  console.log(`  canonicalize.ts: ${new Set(Object.values(CANONICAL_MAP)).size} slugs (${Object.keys(CANONICAL_MAP).length} alias entries)`);

  console.log('\nMerge results:');
  console.log(`  Total unique exercises: ${rows.length}`);
  console.log(`  Clean merges (all sources agree): ${cleanMerges}`);
  console.log(
    `  Needs review (invalid equipment, conflicts, orphans, empty primary, or 3+ equal-split heuristic): ${needsReviewCount}`,
  );
  console.log(`  Equal-split heuristic with 3+ primaries (priority review): ${heuristicMultiPrimaryCount}`);
  if (mergeConflicts > 0) {
    console.log(`  Config vs library conflicts (isUnilateral): ${mergeConflicts}`);
  }

  console.log('\n  Triage SQL (top canonical_name by usage in exercise_log):');
  console.log(
    '    SELECT canonical_name, COUNT(*) AS n FROM exercise_log GROUP BY 1 ORDER BY n DESC LIMIT 25;',
  );

  console.log(
    `\n  By body region: upper ${byRegion.upper ?? 0} | lower ${byRegion.lower ?? 0} | full_body ${byRegion.full_body ?? 0} | core ${byRegion.core ?? 0}`,
  );
  const eqLine = Object.entries(byEq)
    .sort()
    .map(([k, v]) => `${k} ${v}`)
    .join(' | ');
  console.log(`  By equipment: ${eqLine}`);

  console.log('\nValidation:');
  if (validationFailures.length === 0) console.log('  ✓ All primary attribution weights sum to ~1.0');
  else {
    console.log('  ✗ Attribution sum issues:');
    for (const f of validationFailures) console.log(`    - ${f}`);
  }

  console.log(`\n  Exercises with aliases: ${withAliases} (avg ${avgAliases.toFixed(1)} aliases per exercise with aliases)`);
  console.log(`  Exercises without aliases: ${rows.length - withAliases}`);

  console.log(`\nOutput: ${outPath} (${rows.length} exercises)`);
}

main();
