/**
 * Step 2b: Upsert exercise registry rows from scripts/exercise-seed-data.json
 * into public.exercises (service role). Does not modify schema or exercise_log.
 *
 * Run: npx tsx scripts/insert-seed-exercises.ts
 * Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Optional: loads .env.local then .env from repo root (via dotenv).
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

loadEnv({ path: join(REPO_ROOT, '.env.local') });
loadEnv({ path: join(REPO_ROOT, '.env') });

const SLUG_RE = /^[a-z][a-z0-9_]*$/;
const SMOKE_SLUG = '_smoke_registry_validate';
const BATCH_SIZE = 50;
const PRIMARY_SUM_TOL = 0.001;
const SECONDARY_MIN = 0.01;
const SECONDARY_MAX = 0.5;

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

const ALLOWED_MOVEMENT_PATTERNS = new Set([
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'squat',
  'hip_hinge',
  'lunge',
  'carry',
  'isolation_upper',
  'isolation_lower',
  'core',
  'rotational',
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

const ALLOWED_BODY_REGIONS = new Set(['upper', 'lower', 'full_body', 'core']);
const ALLOWED_STRESS = new Set(['low', 'moderate', 'high']);

type MuscleAttribution = { primary: Record<string, number>; secondary: Record<string, number> };

type SeedJsonRow = {
  slug: string;
  display_name: string;
  aliases: string[];
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  muscle_attribution: MuscleAttribution;
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
  source: string;
  is_active: boolean;
  needs_review: boolean;
  heuristic_equal_multi_primary?: boolean;
};

type ExerciseUpsert = {
  slug: string;
  display_name: string;
  aliases: string[];
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  muscle_attribution: MuscleAttribution;
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
  updated_at: string;
};

function sumWeights(w: Record<string, number>): number {
  return Object.values(w).reduce((a, b) => a + b, 0);
}

function validateRows(rows: SeedJsonRow[]): string[] {
  const errors: string[] = [];
  const seenSlugs = new Set<string>();

  rows.forEach((r, i) => {
    const p = i + 1;
    const label = `[row ${p} slug=${typeof r.slug === 'string' ? r.slug : '?'}]`;

    if (!r || typeof r !== 'object') {
      errors.push(`[row ${p}] not an object`);
      return;
    }

    if (typeof r.slug !== 'string' || r.slug.trim() === '') {
      errors.push(`${label} slug must be non-empty`);
    } else {
      if (r.slug !== r.slug.toLowerCase()) {
        errors.push(`${label} slug must be lowercase`);
      }
      if (!SLUG_RE.test(r.slug)) {
        errors.push(`${label} slug must match ${SLUG_RE} (lowercase, underscores, no spaces/hyphens)`);
      }
      if (seenSlugs.has(r.slug)) {
        errors.push(`${label} duplicate slug "${r.slug}" in file`);
      }
      seenSlugs.add(r.slug);
    }

    if (typeof r.display_name !== 'string' || r.display_name.trim() === '') {
      errors.push(`${label} display_name must be non-empty`);
    }

    if (!ALLOWED_MOVEMENT_PATTERNS.has(r.movement_pattern)) {
      errors.push(`${label} invalid movement_pattern: ${r.movement_pattern}`);
    }

    if (!ALLOWED_EQUIPMENT.has(r.equipment)) {
      errors.push(`${label} invalid equipment: ${r.equipment}`);
    }

    if (!ALLOWED_BODY_REGIONS.has(r.body_region)) {
      errors.push(`${label} invalid body_region: ${r.body_region}`);
    }

    if (!ALLOWED_STRESS.has(r.mechanical_stress)) {
      errors.push(`${label} invalid mechanical_stress: ${r.mechanical_stress}`);
    }

    if (!ALLOWED_STRESS.has(r.cns_demand)) {
      errors.push(`${label} invalid cns_demand: ${r.cns_demand}`);
    }

    if (!Array.isArray(r.primary_muscles)) {
      errors.push(`${label} primary_muscles must be an array`);
    } else {
      for (const m of r.primary_muscles) {
        if (typeof m !== 'string' || !ALLOWED_MUSCLES.has(m)) {
          errors.push(`${label} invalid primary_muscle: ${String(m)}`);
        }
      }
    }

    if (!Array.isArray(r.secondary_muscles)) {
      errors.push(`${label} secondary_muscles must be an array`);
    } else {
      for (const m of r.secondary_muscles) {
        if (typeof m !== 'string' || !ALLOWED_MUSCLES.has(m)) {
          errors.push(`${label} invalid secondary_muscle: ${String(m)}`);
        }
      }
    }

    if (!r.muscle_attribution || typeof r.muscle_attribution !== 'object') {
      errors.push(`${label} muscle_attribution missing`);
    } else {
      const { primary, secondary } = r.muscle_attribution;
      if (!primary || typeof primary !== 'object') {
        errors.push(`${label} muscle_attribution.primary missing`);
      } else {
        const pSum = sumWeights(primary);
        if (Math.abs(pSum - 1) > PRIMARY_SUM_TOL) {
          errors.push(`${label} muscle_attribution.primary must sum to 1.0 (±${PRIMARY_SUM_TOL}), got ${pSum}`);
        }
        for (const k of Object.keys(primary)) {
          if (!ALLOWED_MUSCLES.has(k)) {
            errors.push(`${label} invalid primary attribution muscle: ${k}`);
          }
          const v = primary[k];
          if (typeof v !== 'number' || Number.isNaN(v)) {
            errors.push(`${label} primary weight for ${k} must be a number`);
          }
        }
      }
      if (!secondary || typeof secondary !== 'object') {
        errors.push(`${label} muscle_attribution.secondary missing`);
      } else {
        for (const k of Object.keys(secondary)) {
          if (!ALLOWED_MUSCLES.has(k)) {
            errors.push(`${label} invalid secondary attribution muscle: ${k}`);
          }
          const v = secondary[k];
          if (typeof v !== 'number' || Number.isNaN(v)) {
            errors.push(`${label} secondary weight for ${k} must be a number`);
          } else if (v < SECONDARY_MIN || v > SECONDARY_MAX) {
            errors.push(
              `${label} secondary weight for ${k} must be between ${SECONDARY_MIN} and ${SECONDARY_MAX}, got ${v}`,
            );
          }
        }
      }
    }

    if (typeof r.load_ratio !== 'number' || Number.isNaN(r.load_ratio)) {
      errors.push(`${label} load_ratio must be a number`);
    }

    if (typeof r.recovery_hours_typical !== 'number' || !Number.isInteger(r.recovery_hours_typical)) {
      errors.push(`${label} recovery_hours_typical must be an integer`);
    }

    if (typeof r.display_format !== 'string' || r.display_format.trim() === '') {
      errors.push(`${label} display_format must be non-empty`);
    }
  });

  return errors;
}

function toUpsertRow(r: SeedJsonRow): ExerciseUpsert {
  const now = new Date().toISOString();
  return {
    slug: r.slug,
    display_name: r.display_name,
    aliases: [...r.aliases],
    movement_pattern: r.movement_pattern,
    primary_muscles: [...r.primary_muscles],
    secondary_muscles: [...r.secondary_muscles],
    muscle_attribution: {
      primary: { ...r.muscle_attribution.primary },
      secondary: { ...r.muscle_attribution.secondary },
    },
    equipment: r.equipment,
    is_unilateral: r.is_unilateral,
    is_compound: r.is_compound,
    load_ratio: Math.round(r.load_ratio * 1000) / 1000,
    mechanical_stress: r.mechanical_stress,
    cns_demand: r.cns_demand,
    recovery_hours_typical: r.recovery_hours_typical,
    body_region: r.body_region,
    display_format: r.display_format,
    notes: r.notes ?? null,
    source: 'seed',
    is_active: true,
    needs_review: r.needs_review,
    updated_at: now,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('Exercise Registry Insert');
  console.log('=========================');

  const jsonPath = join(__dirname, 'exercise-seed-data.json');
  console.log(`Source: scripts/exercise-seed-data.json`);

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error('Failed to read or parse exercise-seed-data.json:', e);
    process.exit(1);
  }

  if (!Array.isArray(raw)) {
    console.error('exercise-seed-data.json must be a JSON array');
    process.exit(1);
  }

  const rows = raw as SeedJsonRow[];
  const toInsert = rows.filter((r) => r && r.slug !== SMOKE_SLUG);

  console.log(`Exercises to insert: ${toInsert.length}\n`);

  if (toInsert.length === 0) {
    console.error('No exercises to insert after excluding the smoke row. Check exercise-seed-data.json.');
    process.exit(1);
  }

  const validationErrors = validateRows(toInsert);
  if (validationErrors.length > 0) {
    console.log('Validation failed:\n');
    for (const err of validationErrors) console.log(`  - ${err}`);
    console.log(`\n${validationErrors.length} error(s). Exiting without inserting.`);
    process.exit(1);
  }

  console.log('Validation:');
  console.log('  ✓ All slugs unique');
  console.log('  ✓ All attribution weights valid (primary sums to 1.0)');
  console.log('  ✓ All enum values valid');
  console.log('  ✓ All muscle names valid\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Set them in the environment or in .env.local / .env at the repo root.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const slugs = toInsert.map((r) => r.slug);
  const { data: existingRows, error: existingErr } = await supabase.from('exercises').select('slug').in('slug', slugs);

  if (existingErr) {
    console.error('Failed to query existing exercises:', existingErr.message);
    process.exit(1);
  }

  const existingSlugs = new Set((existingRows ?? []).map((x) => x.slug));
  const willUpdate = existingSlugs.size;
  const willInsert = toInsert.length - willUpdate;

  const payloads = toInsert.map(toUpsertRow);
  const batches = chunk(payloads, BATCH_SIZE);

  console.log('Inserting...');
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const { error } = await supabase.from('exercises').upsert(batch, { onConflict: 'slug' });
    if (error) {
      console.error(`Batch ${i + 1}/${batches.length} failed:`, error.message);
      process.exit(1);
    }
    console.log(`  Batch ${i + 1}/${batches.length}: ${batch.length} rows ✓`);
  }

  const { count: totalCount, error: countErr } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('Failed to count exercises:', countErr.message);
    process.exit(1);
  }

  console.log('\nResult:');
  console.log(`  Inserted: ${willInsert} new`);
  console.log(`  Updated: ${willUpdate} existing (slug conflict)`);
  console.log(`  Total in table: ${totalCount ?? '—'} (including smoke row)\n`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
