/**
 * Canonical workout-title derivation. Reconciles the divergent per-surface
 * heuristics that produced "Run — Tempo" in one surface and "Run Intervals
 * — 6×1000m" in another (ENGINE-STATE Known Broken: "Run — Tempo vs Run
 * Intervals 4×1000m label divergence").
 *
 * **Single source of truth** for display titles across:
 *   - `src/components/PlannedWorkoutSummary.tsx`
 *   - `src/components/AllPlansInterface.tsx`
 *   - `src/components/TodaysEffort.tsx` (chip + drawer-title call sites)
 *
 * Signals consulted, in priority order:
 *   1. Strength / pilates_yoga / mobility — discipline-specific name handling.
 *   2. Brick tag — preserves "Brick — Bike X hr" / "Brick — Run X mi off the bike".
 *   3. `workout_structure.title` / `workout_title` — explicit structured title.
 *   4. Materialized `workout.name` — preferred when it carries structural info
 *      (rep count / distance / pace). This is what the drawer title surface
 *      historically used and what the chip surfaces were missing.
 *   5. Per-discipline regex on tags / `steps_preset` / description as fallback
 *      for legacy or generic workouts where `name` is just "Run" / "Ride".
 *
 * Pure function — no state. Defensive against missing fields (any field may
 * be null / undefined / non-string). Date-suffixes ("Push Day - 12/3/2025")
 * are stripped consistently across all paths.
 */

// Relative import (not `@/`) so the Deno-test runner can resolve the helper —
// Vite's alias is config-resolved at app build, the deno-test runner doesn't
// see it. Other client-side `src/lib/*.ts` files that have deno-test coverage
// follow the same convention (see `pairing-timing.ts`).
import { plannedSwimSessionLabel } from '../utils/swimPlanTokens.ts';

export type WorkoutLike = {
  name?: string | null;
  type?: string | null;
  workout_type?: string | null;
  description?: string | null;
  rendered_description?: string | null;
  tags?: unknown[] | null;
  steps_preset?: string[] | null;
  workout_structure?: { title?: string | null } | unknown | null;
  workout_title?: string | null;
  title?: string | null;
};

function stripTrailingDateSuffix(name: string): string {
  return name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
}

function hasTag(workout: WorkoutLike, tag: string): boolean {
  const t = workout?.tags;
  if (!Array.isArray(t)) return false;
  const lower = tag.toLowerCase();
  return t.some((x) => String(x).toLowerCase() === lower);
}

function stepsText(workout: WorkoutLike): string {
  const s = workout?.steps_preset;
  if (!Array.isArray(s) || s.length === 0) return '';
  return s.join(' ').toLowerCase();
}

function descText(workout: WorkoutLike): string {
  return String(workout?.rendered_description ?? workout?.description ?? '').toLowerCase();
}

function structuredTitle(workout: WorkoutLike): string {
  let t = '';
  try {
    const ws = workout?.workout_structure as { title?: string | null } | null | undefined;
    if (ws && typeof ws === 'object' && typeof ws.title === 'string') t = ws.title.trim();
  } catch {}
  if (!t) t = String(workout?.workout_title ?? '').trim();
  return t;
}

/**
 * Returns true when `name` is a generic discipline label ("Run", "Ride",
 * "Workout") and the regex-derived label is a strict upgrade. False when
 * `name` carries structural info ("Run Intervals — 6×1000m", "Easy Run — 5 mi")
 * which should be preserved as-is.
 */
function isGenericName(name: string): boolean {
  if (!name) return true;
  return /^(run|ride|bike|swim|workout|session|cycling|cycle)$/i.test(name);
}

export function deriveWorkoutTitle(workout: WorkoutLike | null | undefined): string {
  if (!workout) return 'Session';

  const type = String(workout?.type ?? workout?.workout_type ?? '').toLowerCase();
  const nm = stripTrailingDateSuffix(String(workout?.name ?? workout?.title ?? '').trim());
  const desc = descText(workout);
  const steps = stepsText(workout);

  // ── Strength ─────────────────────────────────────────────────────────────
  // Preserves user-meaningful names ("Push Day"); strips legacy date suffix.
  // Falls through to desc regex when name is just "Strength".
  if (type === 'strength') {
    const stTit = structuredTitle(workout);
    const candidate = stTit || nm;
    if (candidate && candidate.toLowerCase() !== 'strength') {
      return stripTrailingDateSuffix(candidate) || 'Strength';
    }
    if (/squat|deadlift|bench|ohp/.test(desc)) return 'Strength — Compounds';
    if (/chin|row|pull|lunge|accessor/i.test(desc)) return 'Strength — Accessory';
    if (/core/.test(desc)) return 'Strength — Core';
    return 'Strength';
  }

  // ── Pilates / Yoga ───────────────────────────────────────────────────────
  if (type === 'pilates_yoga') {
    const combined = (nm + ' ' + desc).toLowerCase();
    if (/yoga/.test(combined)) return 'Yoga';
    if (/pilates/.test(combined)) return 'Pilates';
    return nm || 'Pilates/Yoga';
  }

  // ── Mobility ─────────────────────────────────────────────────────────────
  if (type === 'mobility') return nm || 'Mobility';

  // ── Brick carve-out ──────────────────────────────────────────────────────
  // Preserves the source name ("Brick — Bike 2.5 hr") emitted by session-factory.
  // Without this, brick legs would generic-mismap to "Ride"/"Run".
  if (hasTag(workout, 'brick')) {
    if (/^Brick\b/i.test(nm)) return nm;
    if (type === 'ride' || type === 'bike') return 'Brick — Bike';
    if (type === 'run') return 'Brick — Run off the bike';
  }

  // ── Structured title precedence ──────────────────────────────────────────
  // PlannedWorkoutSummary's pattern: workout_structure.title overrides name.
  const stTit = structuredTitle(workout);
  if (stTit && type !== 'swim') {
    return stTit;
  }

  // ── Swim ─────────────────────────────────────────────────────────────────
  // Uses the dedicated swim-label helper (handles workout_structure.title +
  // strips trailing distance chip). Drill-like detection runs across desc +
  // steps_preset and overrides only if the resolved label doesn't already
  // mention drill/technique (otherwise it's already correct).
  if (type === 'swim') {
    const label = plannedSwimSessionLabel(workout);
    const isTechniqueLike =
      hasTag(workout, 'opt_kind:technique') ||
      /drill|technique/.test(desc) ||
      /swim_drills?_|swim_technique_/.test(steps);
    if (isTechniqueLike && !/drill|technique/i.test(label)) return 'Swim — Drills';
    return label || nm || 'Swim';
  }

  // ── Materialized name (preferred when informative) ───────────────────────
  // session-factory emits names like "Run Intervals — 6×1000m", "Easy Run —
  // 5 mi", "Long Ride — 2.5 hr" — these carry rep count / distance / duration
  // that's strictly more informative than the regex-derived labels. Only fall
  // back to derived labels when name is generic or missing.
  if (!isGenericName(nm)) return nm;

  // ── Ride / Bike (derived fallback) ───────────────────────────────────────
  if (type === 'ride' || type === 'bike') {
    if (hasTag(workout, 'group_ride') || /group\s*ride/.test(desc)) return 'Group Ride';
    if (hasTag(workout, 'long_ride')) return 'Ride — Long Ride';
    if (/bike_vo2_/.test(steps) || /vo2/.test(desc)) return 'Ride — VO2';
    if (/bike_thr_/.test(steps) || /threshold|thr_/.test(desc)) return 'Ride — Threshold';
    if (/bike_ss_/.test(steps) || /sweet\s*spot|\bss\b|\bssp\b|ss_/.test(desc))
      return 'Ride — Sweet Spot';
    if (/recovery/.test(desc)) return 'Ride — Recovery';
    if (/bike_endurance_/.test(steps) || /endurance|z2/.test(desc)) return 'Ride — Endurance';
    return 'Ride';
  }

  // ── Run (derived fallback) ───────────────────────────────────────────────
  if (type === 'run') {
    if (hasTag(workout, 'long_run') || /longrun_/.test(steps)) return 'Run — Long Run';
    if (/tempo_/.test(steps) || /tempo/.test(desc)) return 'Run — Tempo';
    if (
      /interval_/.test(steps) ||
      /intervals?/.test(desc) ||
      /\b\d+\s*[x×]\s*\d+/.test(desc)
    )
      return 'Run — Intervals';
    return 'Run';
  }

  return nm || 'Session';
}
