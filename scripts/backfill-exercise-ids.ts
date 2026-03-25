/**
 * Step 3: Backfill exercise_log.exercise_id from exercises registry.
 * Matching: exact slug → alias → normalized (auto). Fuzzy = candidates only (no auto-assign).
 * Unmatched (including fuzzy-only): insert user_created registry rows, then assign.
 *
 * Run: npx tsx scripts/backfill-exercise-ids.ts
 * Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

loadEnv({ path: join(REPO_ROOT, '.env.local') });
loadEnv({ path: join(REPO_ROOT, '.env') });

const SMOKE_SLUG = '_smoke_registry_validate';
const UPDATE_BATCH = 50;
const FUZZY_MIN_LEN = 6;
const PAGE_SIZE = 1000;

type RegistryRow = {
  id: string;
  slug: string;
  aliases: string[];
  display_name: string;
};

type Resolution =
  | { kind: 'matched'; tier: 1 | 2 | 3; exercise: RegistryRow }
  | { kind: 'fuzzy_only'; candidates: { slug: string; id: string }[] }
  | { kind: 'needs_create' };

/** Lowercase, trim, spaces/hyphens → underscores, collapse _, strip trailing numeric suffixes */
function normalize(str: string): string {
  let s = str
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
  s = s.replace(/^_|_$/g, '');
  let prev: string;
  do {
    prev = s;
    s = s.replace(/_?\d+$/u, '');
  } while (s !== prev);
  return s.replace(/^_|_$/g, '');
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function slugifyCanonical(name: string): string {
  let s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s.length) s = 'unknown_exercise';
  if (!/^[a-z]/.test(s)) s = `ex_${s}`;
  if (s === SMOKE_SLUG) s = `${s}_log`;
  return s.slice(0, 120);
}

function isGarbage(name: string): boolean {
  const t = name.trim();
  if (t.length < 2) return true;
  if (!/[a-zA-Z]/u.test(t)) return true;
  if (t.length > 240) return true;
  return false;
}

function displayNameFromCanonical(canon: string, slug: string): string {
  if (isGarbage(canon)) return titleCaseFromSlug(slug);
  const words = canon.trim().split(/[\s_]+/).filter(Boolean);
  if (words.length === 0) return titleCaseFromSlug(slug);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function inferFromCanonical(canon: string): {
  movement_pattern: string;
  body_region: string;
  primary_muscles: string[];
} {
  const s = canon.toLowerCase();
  const fallback = {
    movement_pattern: 'isolation_upper',
    body_region: 'upper',
    primary_muscles: ['chest'],
  };

  if (/(squat|leg_press|split_squat|step_up|goblet|hack_squat)/.test(s)) {
    return { movement_pattern: 'squat', body_region: 'lower', primary_muscles: ['quadriceps', 'glutes'] };
  }
  if (/lunge/.test(s)) {
    return { movement_pattern: 'lunge', body_region: 'lower', primary_muscles: ['quadriceps', 'glutes'] };
  }
  if (/(deadlift|rdl|romanian|good_morning|hip_thrust|glute_bridge)/.test(s)) {
    return { movement_pattern: 'hip_hinge', body_region: 'lower', primary_muscles: ['hamstrings', 'glutes'] };
  }
  if (
    (/(bench|push_up|pushup|chest_fly|db_fly|dip)/.test(s) && !/shoulder/.test(s)) ||
    (/fly/.test(s) && /chest|pec/.test(s))
  ) {
    return { movement_pattern: 'horizontal_push', body_region: 'upper', primary_muscles: ['chest'] };
  }
  if (/(overhead|ohp|shoulder_press|military)/.test(s)) {
    return { movement_pattern: 'vertical_push', body_region: 'upper', primary_muscles: ['anterior_deltoid'] };
  }
  if (/(pull_up|pullup|chin|pulldown|lat_pulldown)/.test(s)) {
    return { movement_pattern: 'vertical_pull', body_region: 'upper', primary_muscles: ['lats'] };
  }
  if (/(row|pullover|face_pull)/.test(s)) {
    return { movement_pattern: 'horizontal_pull', body_region: 'upper', primary_muscles: ['upper_back'] };
  }
  if (/curl/.test(s)) {
    return { movement_pattern: 'isolation_upper', body_region: 'upper', primary_muscles: ['biceps'] };
  }
  if (/(triceps|tricep)/.test(s) || /extension.*(arm|elbow)/.test(s)) {
    return { movement_pattern: 'isolation_upper', body_region: 'upper', primary_muscles: ['triceps'] };
  }
  if (/(leg_curl|hamstring)/.test(s)) {
    return { movement_pattern: 'isolation_lower', body_region: 'lower', primary_muscles: ['hamstrings'] };
  }
  if (/(leg_extension|quad)/.test(s)) {
    return { movement_pattern: 'isolation_lower', body_region: 'lower', primary_muscles: ['quadriceps'] };
  }
  if (/calf/.test(s)) {
    return { movement_pattern: 'isolation_lower', body_region: 'lower', primary_muscles: ['calves'] };
  }
  if (/(plank|dead_bug|crunch|pallof|russian_twist|ab_wheel|core|copenhagen)/.test(s)) {
    return { movement_pattern: 'core', body_region: 'core', primary_muscles: ['core'] };
  }
  if (/(carry|farmer|suitcase)/.test(s)) {
    return { movement_pattern: 'carry', body_region: 'full_body', primary_muscles: ['forearms', 'core'] };
  }
  if (/(clean|snatch|jerk|burpee|throw|swing|kb)/.test(s)) {
    return { movement_pattern: 'rotational', body_region: 'full_body', primary_muscles: ['glutes', 'quadriceps'] };
  }
  return fallback;
}

function placeholderAttribution(muscles: string[]): {
  primary: Record<string, number>;
  secondary: Record<string, number>;
} {
  const list = muscles.length ? muscles : ['chest'];
  const w = 1 / list.length;
  const primary: Record<string, number> = {};
  let acc = 0;
  list.forEach((m, i) => {
    if (i === list.length - 1) primary[m] = Math.round((1 - acc) * 1000) / 1000;
    else {
      const v = Math.round(w * 1000) / 1000;
      primary[m] = v;
      acc += v;
    }
  });
  return { primary, secondary: {} };
}

function fuzzyCandidates(normCanon: string, rows: RegistryRow[]): { slug: string; id: string }[] {
  const out: { slug: string; id: string }[] = [];
  const seen = new Set<string>();

  for (const ex of rows) {
    if (ex.slug === SMOKE_SLUG) continue;
    const ns = normalize(ex.slug);
    if (substringsMatch(normCanon, ns)) {
      if (!seen.has(ex.id)) {
        seen.add(ex.id);
        out.push({ slug: ex.slug, id: ex.id });
      }
    }
    for (const al of ex.aliases) {
      const na = normalize(al);
      if (na.length && substringsMatch(normCanon, na)) {
        if (!seen.has(ex.id)) {
          seen.add(ex.id);
          out.push({ slug: ex.slug, id: ex.id });
        }
        break;
      }
    }
  }
  return out;
}

function substringsMatch(a: string, b: string): boolean {
  if (!a.length || !b.length) return false;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length < FUZZY_MIN_LEN) return false;
  return long.includes(short);
}

function exactAliasMatch(canon: string, ex: RegistryRow): boolean {
  const c = canon.trim();
  return ex.aliases.some((a) => {
    const t = a.trim();
    return t === c || t.toLowerCase() === c.toLowerCase();
  });
}

function resolveCanonical(
  canon: string,
  bySlug: Map<string, RegistryRow>,
  normSlugMap: Map<string, RegistryRow>,
  normAliasMap: Map<string, RegistryRow>,
  allRows: RegistryRow[],
): Resolution {
  if (bySlug.has(canon)) {
    return { kind: 'matched', tier: 1, exercise: bySlug.get(canon)! };
  }

  for (const ex of allRows) {
    if (ex.slug === SMOKE_SLUG) continue;
    if (exactAliasMatch(canon, ex)) {
      return { kind: 'matched', tier: 2, exercise: ex };
    }
  }

  const nc = normalize(canon);
  if (nc.length) {
    const fromSlug = normSlugMap.get(nc);
    if (fromSlug) return { kind: 'matched', tier: 3, exercise: fromSlug };
    const fromAlias = normAliasMap.get(nc);
    if (fromAlias) return { kind: 'matched', tier: 3, exercise: fromAlias };
  }

  const fuzz = fuzzyCandidates(nc || normalize(canon), allRows);
  if (fuzz.length) {
    return { kind: 'fuzzy_only', candidates: fuzz };
  }

  return { kind: 'needs_create' };
}

async function fetchAllExercises(supabase: SupabaseClient): Promise<RegistryRow[]> {
  const all: RegistryRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, slug, aliases, display_name')
      .order('slug')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`exercises fetch: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as RegistryRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function countNullByCanonical(supabase: SupabaseClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('exercise_log')
      .select('canonical_name')
      .is('exercise_id', null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`exercise_log fetch: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { canonical_name: string }[]) {
      const c = row.canonical_name;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return counts;
}

async function fetchAllSlugs(supabase: SupabaseClient): Promise<Set<string>> {
  const slugs = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('exercises').select('slug').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`exercises slug fetch: ${error.message}`);
    if (!data?.length) break;
    for (const r of data as { slug: string }[]) slugs.add(r.slug);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return slugs;
}

async function main() {
  console.log('Exercise Log Backfill');
  console.log('======================');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const allRows = await fetchAllExercises(supabase);
  const bySlug = new Map<string, RegistryRow>();
  const normSlugMap = new Map<string, RegistryRow>();
  const normAliasMap = new Map<string, RegistryRow>();

  for (const ex of allRows) {
    bySlug.set(ex.slug, ex);
    const ns = normalize(ex.slug);
    if (ns && !normSlugMap.has(ns)) normSlugMap.set(ns, ex);
    for (const al of ex.aliases) {
      const na = normalize(al);
      if (na && !normAliasMap.has(na)) normAliasMap.set(na, ex);
    }
  }

  const nullByCanon = await countNullByCanonical(supabase);
  const distinctNames = [...nullByCanon.keys()].sort((a, b) => a.localeCompare(b));

  console.log(`Registry: ${allRows.length} exercises loaded`);
  console.log(`Exercise log: ${distinctNames.length} distinct canonical_names with exercise_id IS NULL\n`);

  const tier1: string[] = [];
  const tier2: string[] = [];
  const tier3: string[] = [];
  const fuzzyList: { canon: string; candidates: { slug: string; id: string }[] }[] = [];
  const toCreate: string[] = [];
  const resolutionByCanon = new Map<string, Resolution>();

  for (const canon of distinctNames) {
    const res = resolveCanonical(canon, bySlug, normSlugMap, normAliasMap, allRows);
    resolutionByCanon.set(canon, res);
    if (res.kind === 'matched') {
      if (res.tier === 1) tier1.push(canon);
      else if (res.tier === 2) tier2.push(canon);
      else tier3.push(canon);
    } else if (res.kind === 'fuzzy_only') {
      fuzzyList.push({ canon, candidates: res.candidates });
      toCreate.push(canon);
    } else {
      toCreate.push(canon);
    }
  }

  const sumRows = (names: string[]) => names.reduce((s, n) => s + (nullByCanon.get(n) ?? 0), 0);

  console.log('Matching:');
  console.log(`  Priority 1 (exact slug):     ${tier1.length} matched (${sumRows(tier1)} rows)`);
  console.log(`  Priority 2 (alias):          ${tier2.length} matched (${sumRows(tier2)} rows)`);
  console.log(`  Priority 3 (normalized):     ${tier3.length} matched (${sumRows(tier3)} rows)`);
  console.log(
    `  Priority 4 (fuzzy candidates): ${fuzzyList.length} found — MANUAL REVIEW NEEDED (not auto-linked)\n`,
  );

  const assignment = new Map<string, string>();
  for (const canon of [...tier1, ...tier2, ...tier3]) {
    const res = resolutionByCanon.get(canon);
    if (res?.kind === 'matched') assignment.set(canon, res.exercise.id);
  }

  let created = 0;
  let trulyUnresolvable = 0;
  const createdLog: string[] = [];

  const existingSlugs = await fetchAllSlugs(supabase);

  for (const canon of toCreate) {
    let baseSlug = slugifyCanonical(canon);
    if (isGarbage(canon)) {
      baseSlug = `garbage_${baseSlug}`.replace(/_+/g, '_').slice(0, 120);
    }
    let slug = baseSlug;
    let n = 0;
    while (existingSlugs.has(slug) || bySlug.has(slug)) {
      n += 1;
      slug = `${baseSlug}_uc${n}`.slice(0, 120);
    }
    existingSlugs.add(slug);

    const inferred = inferFromCanonical(canon);
    const attr = placeholderAttribution(inferred.primary_muscles);
    const displayName = displayNameFromCanonical(canon, slug);

    const row = {
      slug,
      display_name: displayName || titleCaseFromSlug(slug),
      aliases: [] as string[],
      movement_pattern: inferred.movement_pattern,
      primary_muscles: Object.keys(attr.primary),
      secondary_muscles: [] as string[],
      muscle_attribution: attr,
      equipment: 'bodyweight',
      is_unilateral: false,
      is_compound: false,
      load_ratio: 0.5,
      mechanical_stress: 'moderate',
      cns_demand: 'moderate',
      recovery_hours_typical: 48,
      body_region: inferred.body_region,
      display_format: 'weight_reps',
      notes: isGarbage(canon)
        ? 'Auto-created from exercise_log (suspect canonical_name); verify or merge.'
        : 'Auto-created from exercise_log backfill; fix attribution and aliases.',
      source: 'user_created',
      is_active: true,
      needs_review: true,
      updated_at: new Date().toISOString(),
    };

    const { data: ins, error: insErr } = await supabase.from('exercises').insert(row).select('id').single();
    if (insErr || !ins) {
      console.error(`Failed to insert user_created exercise for "${canon}":`, insErr?.message);
      trulyUnresolvable += 1;
      continue;
    }

    const newRow: RegistryRow = {
      id: (ins as { id: string }).id,
      slug,
      aliases: [],
      display_name: row.display_name,
    };
    allRows.push(newRow);
    bySlug.set(slug, newRow);
    const ns = normalize(slug);
    if (ns && !normSlugMap.has(ns)) normSlugMap.set(ns, newRow);
    created += 1;
    createdLog.push(`  '${canon}' → registry slug '${slug}' (placeholder attribution)`);
    assignment.set(canon, (ins as { id: string }).id);
  }

  console.log('Unmatched:');
  console.log(`  Auto-created registry rows:  ${created} (needs_review = true)`);
  console.log(`  Truly unresolvable:          ${trulyUnresolvable}\n`);

  if (fuzzyList.length) {
    console.log('Fuzzy candidates (review these):');
    for (const { canon, candidates } of fuzzyList.slice(0, 50)) {
      const top = candidates.slice(0, 3);
      const parts = top.map((c) => `'${c.slug}' (id: ${c.id})`).join(', ');
      console.log(`  '${canon}' → possible: ${parts}${candidates.length > 3 ? ', …' : ''}`);
    }
    if (fuzzyList.length > 50) console.log(`  … ${fuzzyList.length - 50} more`);
    console.log('');
  }

  if (createdLog.length) {
    console.log('Auto-created exercises (review attribution):');
    for (const line of createdLog.slice(0, 40)) console.log(line);
    if (createdLog.length > 40) console.log(`  … ${createdLog.length - 40} more`);
    console.log('');
  }

  const updates = [...assignment.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  console.log('Updating exercise_log...');
  let batchIdx = 0;
  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    batchIdx += 1;
    const slice = updates.slice(i, i + UPDATE_BATCH);
    let batchRows = 0;
    for (const [canon, exerciseId] of slice) {
      const n = nullByCanon.get(canon) ?? 0;
      const { error } = await supabase
        .from('exercise_log')
        .update({ exercise_id: exerciseId })
        .eq('canonical_name', canon)
        .is('exercise_id', null);
      if (error) {
        console.error(`Update failed for canonical_name="${canon}":`, error.message);
        process.exit(1);
      }
      batchRows += n;
    }
    console.log(
      `  Batch ${batchIdx}/${Math.max(1, Math.ceil(updates.length / UPDATE_BATCH))}: ${batchRows} rows updated ✓`,
    );
  }

  if (updates.length === 0) {
    console.log('  (no updates — nothing to backfill)\n');
  }

  const { count: totalRows, error: tErr } = await supabase
    .from('exercise_log')
    .select('*', { count: 'exact', head: true });
  if (tErr) throw new Error(tErr.message);

  const { count: matchedRows, error: mErr } = await supabase
    .from('exercise_log')
    .select('*', { count: 'exact', head: true })
    .not('exercise_id', 'is', null);
  if (mErr) throw new Error(mErr.message);

  const total = totalRows ?? 0;
  const matched = matchedRows ?? 0;
  const unmatched = total - matched;
  const coverage = total > 0 ? (matched / total) * 100 : 100;

  console.log('\nResult:');
  console.log(`  Total exercise_log rows: ${total}`);
  console.log(`  With exercise_id: ${matched} (${coverage.toFixed(1)}%)`);
  console.log(`  Still NULL: ${unmatched} (${total > 0 ? ((unmatched / total) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`\nCoverage: ${coverage.toFixed(1)}%`);

  if (coverage < 90) {
    console.log('\n⚠ Coverage below 90% — investigate canonical_name ↔ registry mapping before proceeding.');
  } else if (coverage < 95) {
    console.log('\n⚠ Coverage below 95% target — review unmatched names and registry aliases.');
  }

  console.log('\n--- Verification: coverage check (same as spec) ---');
  console.log(`total_rows=${total}, matched_rows=${matched}, unmatched_rows=${unmatched}, coverage_pct=${coverage.toFixed(1)}`);

  const { data: topNull, error: topErr } = await supabase
    .from('exercise_log')
    .select('canonical_name')
    .is('exercise_id', null)
    .limit(5000);
  if (topErr) console.error('Top unmatched query error:', topErr.message);
  else {
    const agg = new Map<string, number>();
    for (const r of topNull ?? []) {
      const c = (r as { canonical_name: string }).canonical_name;
      agg.set(c, (agg.get(c) ?? 0) + 1);
    }
    const top20 = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log('\nTop unmatched canonical_name (up to 20):');
    if (top20.length === 0) console.log('  (none)');
    else for (const [name, n] of top20) console.log(`  ${name}  →  ${n} occurrences`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
