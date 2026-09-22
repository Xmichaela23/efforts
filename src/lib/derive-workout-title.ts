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
 *   0. `session_title` — the server's title for a FINISHED session that carries a
 *      plan. Already the output of this same ladder, run on the planned row.
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
// follow the same convention.
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
  /** The day's title in the book's terms, sent by the server (2026-09-18). */
  intent_title?: string | null;
  /**
   * ⛔ THE FINISHED SESSION'S TITLE, DECIDED BY THE SERVER (2026-09-22). A completed endurance row's
   * `name` is the PROVIDER's ("Santa Cruz Running", from `ingest-activity`'s `generateWorkoutName`),
   * so a planned "Descending Ladder" lost its name the moment Garmin sent the run back. `get-week`
   * now runs `_shared/session-title.ts` over the LINKED PLANNED ROW and sends the answer here.
   *
   * ⚠️ IT IS THIS FUNCTION'S OWN OUTPUT, not a second vocabulary — `sessionTitle` calls
   * `deriveWorkoutTitle` on the planned row, so the brick, swap and swim branches below have already
   * run against the row that knows about them. Reading it first is the same answer, not a shortcut
   * past one.
   *
   * ⚠️ ABSENT ON AN UNATTACHED SESSION, and that is correct: an extra easy spin nobody planned has
   * no plan name to keep, so the provider's own title stands.
   */
  session_title?: string | null;
};

function stripTrailingDateSuffix(name: string): string {
  return name.replace(/ - \d{1,2}\/\d{1,2}\/\d{4}$/, '').trim();
}

/**
 * A workout Intervals.icu pushes to Zwift comes back (via Strava) named "Zwift - Intervals icu: Anaerobic Ride":
 * the delivering apps' names in front of the workout's own. The title is the part after the colon.
 */
function stripDeliveryPrefix(name: string): string {
  const rest = name.replace(/^zwift\s*[-–—]\s*[^:]{1,40}:\s*/i, '').trim();
  return rest || name;
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

  // ── The server's title for a finished planned session ────────────────────
  // See `session_title` above. Nothing else in this file can answer for a completed row, because
  // every signal below it reads the PROVIDER's name.
  const sent = typeof workout?.session_title === 'string' ? workout.session_title.trim() : '';
  if (sent) return sent;

  const type = String(workout?.type ?? workout?.workout_type ?? '').toLowerCase();
  const nm = stripDeliveryPrefix(stripTrailingDateSuffix(String(workout?.name ?? workout?.title ?? '').trim()));
  const desc = descText(workout);
  const steps = stepsText(workout);

  // ── Strength ─────────────────────────────────────────────────────────────
  // Preserves user-meaningful names ("Push Day"); strips legacy date suffix.
  // Falls through to desc regex when name is just "Strength".
  if (type === 'strength') {
    const stTit = structuredTitle(workout);
    const candidate = stTit || nm;
    if (candidate && candidate.toLowerCase() !== 'strength') {
      /**
       * ⛔ THE BOOK'S TERMS, SENT BY THE SERVER (2026-09-18). A lifting day titled `ME: Upper` reaches the athlete as
       * "Maximum Effort: Upper" — `intent_title`, which get-week, workout-detail, the composed plan and the calendar
       * feed send beside the name (`_shared/intent-title.ts`). This used to swap in "Heavy" / "Speed" here.
       * A row that carries no title prints its own name.
       */
      const sent = typeof workout?.intent_title === 'string' ? workout.intent_title.trim() : '';
      if (sent && (!stTit || stTit === String(workout?.name ?? '').trim())) {
        return stripDeliveryPrefix(stripTrailingDateSuffix(sent)) || 'Strength';
      }
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

  /**
   * ── A SWAPPED SESSION ANSWERS WITH ITS OWN NAME ──────────────────────────
   *
   * ⛔ THE THIRD LEAK IN THE SAME BUG (2026-08-09). The swap patch sets `name` ("Bike Intervals",
   * "Easy Ride") but leaves `workout_structure` alone — and the next block lets
   * `workout_structure.title` OVERRIDE `name`. So a run swapped to a ride kept announcing itself
   * with the run's structured title ("Hill Repeats"), and the derived-label regexes below read the
   * same stale `steps`/`desc` for good measure.
   *
   * ⚠️ THIS IS WHY THE TITLE HAD TO BE FIXED HERE AND NOT PER SURFACE — all three call
   * `deriveWorkoutTitle`, so all three inherited the wrong name from one line.
   */
  if (hasTag(workout, 'discipline_swapped') && nm) return nm;

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
