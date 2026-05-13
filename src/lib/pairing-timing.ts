/**
 * Client-side render-time computation of §6 same-day Lower + endurance pairing AM/PM ordering.
 *
 * Mirrors the server's `decideOrdering` (week-builder.ts:1997-2012) and
 * `attachSameDayPairingMetadata` (week-builder.ts:2023-2082) but computes at render time from:
 *   - the day's workouts (already in hand for both Today's Efforts and the markdown export)
 *   - athlete's `strength_ordering_preference` ('endurance_first' default vs 'strength_first')
 *
 * Why client-side: timing is a derived value, not a workout fact. Persisting it duplicates state
 * that's fully determined by schedule + athlete preference and goes stale the moment the preference
 * changes. The prior attempt to persist this via `planned_workouts.workout_metadata` failed silently
 * for months (column never existed on planned_workouts) — confirming the data doesn't need DB.
 */

export type StrengthOrderingPreference = 'endurance_first' | 'strength_first';

/**
 * Partner-kind priority for picking the Lower's same-day pair. Must match the server-side order
 * in `attachSameDayPairingMetadata` (week-builder.ts:2044) so the AM/PM split is consistent across
 * surfaces. Long Ride first because §6.1 mandates BIKE FIRST + 8h gap when same-day.
 */
const LOWER_PAIRING_PARTNERS = [
  'long_ride',
  'quality_run',
  'quality_bike',
  'easy_run',
  'easy_bike',
] as const;

type PartnerKind = (typeof LOWER_PAIRING_PARTNERS)[number];

/** Classify a planned-workout row into the matrix slot vocabulary used by the pairing rules. */
function classifyKind(w: unknown): PartnerKind | 'lower_body_strength' | 'other' {
  if (!w || typeof w !== 'object') return 'other';
  const r = w as Record<string, unknown>;
  const tyRaw = String(r.type ?? r.discipline ?? '').toLowerCase();
  const tagsRaw = Array.isArray(r.tags) ? r.tags : [];
  const tags = tagsRaw.map((t) => String(t).toLowerCase());
  const nameRaw = String(r.name ?? '').toLowerCase();

  if (tyRaw === 'strength') {
    // Lower-body strength: tag-driven first, then conservative name-pattern fallback (matches
    // server's `plannedSessionToScheduleSlot` which uses `/neural/` to catch Taper Priming).
    if (tags.includes('lower_body')) return 'lower_body_strength';
    if (/\(lower\)|lower body|deadlift|squat|hip thrust|rdl|step-up|split|posterior|neural/.test(nameRaw)) {
      return 'lower_body_strength';
    }
    return 'other'; // upper body — not a pairing target
  }

  if (tyRaw === 'run' || tyRaw === 'walk') {
    if (tags.includes('long_run')) return 'other'; // long_run never pairs with lower (§6.1 hard rule)
    if (
      tags.includes('quality') ||
      tags.includes('intervals') ||
      tags.includes('marathon_pace') ||
      tags.includes('race_specific')
    ) {
      return 'quality_run';
    }
    return 'easy_run';
  }

  if (tyRaw === 'bike' || tyRaw === 'ride' || tyRaw === 'cycling') {
    if (tags.includes('long_ride')) return 'long_ride';
    if (
      tags.includes('quality') ||
      tags.includes('vo2') ||
      tags.includes('sweet') ||
      tags.includes('threshold') ||
      tags.includes('tempo')
    ) {
      return 'quality_bike';
    }
    return 'easy_bike';
  }

  return 'other';
}

/**
 * §6.2 / §6.5 ordering rules (mirror of week-builder.ts:1997-2012):
 *   - Long Ride: Lower PM, ride AM (§6.1 hard rule — BIKE FIRST + 8h gap)
 *   - Easy Run / Easy Bike: Lower AM, partner PM (lower first; easy session as recovery flush)
 *   - Quality Run / Quality Bike: per athlete preference
 *       • strength_first: Lower AM, partner PM
 *       • endurance_first: partner AM, Lower PM
 */
function decideOrdering(
  partnerKind: PartnerKind,
  pref: StrengthOrderingPreference,
): { lowerOrdering: 'AM' | 'PM'; partnerOrdering: 'AM' | 'PM' } {
  if (partnerKind === 'long_ride') return { lowerOrdering: 'PM', partnerOrdering: 'AM' };
  if (partnerKind === 'easy_run' || partnerKind === 'easy_bike') {
    return { lowerOrdering: 'AM', partnerOrdering: 'PM' };
  }
  if (pref === 'strength_first') return { lowerOrdering: 'AM', partnerOrdering: 'PM' };
  return { lowerOrdering: 'PM', partnerOrdering: 'AM' };
}

/**
 * Compute AM/PM timing for the workouts on a single day. Returns a Map keyed by workout-identity
 * (Map identity-key, not by id — caller holds the references it cares about). Only the Lower
 * strength + its first-found high-priority partner get timing; every other workout stays
 * untimed and sorts in its natural rank position.
 *
 * `pref` defaults to 'endurance_first' — matches the server default in `attachSameDayPairingMetadata`
 * when `strength_ordering_preference` is missing from athlete state.
 */
export function computeDayTimings<W>(
  dayWorkouts: ReadonlyArray<W>,
  pref: StrengthOrderingPreference = 'endurance_first',
): Map<W, 'AM' | 'PM'> {
  const timings = new Map<W, 'AM' | 'PM'>();
  const lower = dayWorkouts.find((w) => classifyKind(w) === 'lower_body_strength');
  if (!lower) return timings;
  for (const partnerKind of LOWER_PAIRING_PARTNERS) {
    const partner = dayWorkouts.find((w) => w !== lower && classifyKind(w) === partnerKind);
    if (!partner) continue;
    const { lowerOrdering, partnerOrdering } = decideOrdering(partnerKind, pref);
    timings.set(lower, lowerOrdering);
    timings.set(partner, partnerOrdering);
    return timings;
  }
  return timings;
}

/**
 * Extract athlete's strength_ordering_preference from a goal's training_prefs object.
 * Returns 'endurance_first' default when unset / malformed — matches the server default.
 */
export function readStrengthOrderingPreference(
  source: { training_prefs?: unknown } | { config?: { training_prefs?: unknown } } | null | undefined,
): StrengthOrderingPreference {
  if (!source || typeof source !== 'object') return 'endurance_first';
  const candidates: unknown[] = [];
  if ('training_prefs' in source) candidates.push((source as { training_prefs?: unknown }).training_prefs);
  if ('config' in source) {
    const c = (source as { config?: unknown }).config;
    if (c && typeof c === 'object') candidates.push((c as { training_prefs?: unknown }).training_prefs);
  }
  for (const tp of candidates) {
    if (tp && typeof tp === 'object' && !Array.isArray(tp)) {
      const v = (tp as { strength_ordering_preference?: unknown }).strength_ordering_preference;
      if (v === 'strength_first') return 'strength_first';
      if (v === 'endurance_first') return 'endurance_first';
    }
  }
  return 'endurance_first';
}
