/**
 * Resolve exercise_log.canonical_name → exercises.id using slug, alias, then normalized
 * match (same normalization as backfill). Cache rows once per request.
 */

export type ExerciseRegistryRow = {
  id: string;
  slug: string;
  aliases: string[] | null;
  muscle_attribution: {
    primary: Record<string, number>;
    secondary: Record<string, number>;
  } | null;
  load_ratio: number | null;
  recovery_hours_typical: number | null;
  mechanical_stress: string | null;
  cns_demand: string | null;
};

const SMOKE_SLUG = "_smoke_registry_validate";

/** Lowercase, trim, spaces/hyphens → underscores, strip trailing numeric suffixes */
export function normalizeRegistryString(str: string): string {
  let s = str
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
  s = s.replace(/^_|_$/g, "");
  let prev: string;
  do {
    prev = s;
    s = s.replace(/_?\d+$/u, "");
  } while (s !== prev);
  return s.replace(/^_|_$/g, "");
}

export type RegistryLookup = {
  /** exact canonical === exercises.slug */
  bySlug: Map<string, ExerciseRegistryRow>;
  /** normalize(slug) → row */
  byNormSlug: Map<string, ExerciseRegistryRow>;
  /** lower(trim(alias)) → row (first wins) */
  byAliasLower: Map<string, ExerciseRegistryRow>;
  /** normalize(alias) → row (first wins) */
  byNormAlias: Map<string, ExerciseRegistryRow>;
  byId: Map<string, ExerciseRegistryRow>;
};

export function buildRegistryLookup(rows: ExerciseRegistryRow[]): RegistryLookup {
  const bySlug = new Map<string, ExerciseRegistryRow>();
  const byNormSlug = new Map<string, ExerciseRegistryRow>();
  const byAliasLower = new Map<string, ExerciseRegistryRow>();
  const byNormAlias = new Map<string, ExerciseRegistryRow>();
  const byId = new Map<string, ExerciseRegistryRow>();

  for (const ex of rows) {
    if (ex.slug === SMOKE_SLUG) continue;
    byId.set(ex.id, ex);
    bySlug.set(ex.slug, ex);
    const ns = normalizeRegistryString(ex.slug);
    if (ns && !byNormSlug.has(ns)) byNormSlug.set(ns, ex);
    const aliases = Array.isArray(ex.aliases) ? ex.aliases : [];
    for (const al of aliases) {
      const t = al.trim();
      const low = t.toLowerCase();
      if (low && !byAliasLower.has(low)) byAliasLower.set(low, ex);
      const na = normalizeRegistryString(al);
      if (na && !byNormAlias.has(na)) byNormAlias.set(na, ex);
    }
  }

  return { bySlug, byNormSlug, byAliasLower, byNormAlias, byId };
}

/**
 * 1) slug === canonical_name
 * 2) canonical_name matches alias (case-insensitive trim)
 * 3) normalized canonical matches normalized slug or alias
 */
export function resolveExerciseId(canonical: string, lookup: RegistryLookup): ExerciseRegistryRow | null {
  const c = canonical.trim();
  if (!c) return null;

  const direct = lookup.bySlug.get(c);
  if (direct) return direct;

  const cLow = c.toLowerCase();
  const aliasHit = lookup.byAliasLower.get(cLow);
  if (aliasHit) return aliasHit;

  const nc = normalizeRegistryString(c);
  if (nc) {
    const ns = lookup.byNormSlug.get(nc);
    if (ns) return ns;
    const na = lookup.byNormAlias.get(nc);
    if (na) return na;
  }

  return null;
}
