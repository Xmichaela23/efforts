import { isIndoorSession } from '@shared/indoor-session';
import { sessionDisplayName } from '@/lib/session-display-name';

/**
 * Generate a nice, human-readable workout name
 * Examples: "Los Angeles Run", "Los Angeles Ride", "Lap Swim", "Open Water Swim"
 */

/**
 * Check if a workout is a virtual/indoor activity (Zwift, treadmill, indoor trainer, indoor run)
 * These activities either have fictional GPS data (Zwift) or no GPS data (treadmill/indoor)
 * 
 * IMPORTANT: This function must be STABLE - if GPS data hasn't loaded yet, we should
 * NOT assume indoor. We only return true for indoor when we have positive confirmation.
 */
export function isVirtualActivity(workout: any): boolean {
  /**
   * ⛔ ONE OWNER NOW — `src/lib/indoor-session.ts` (2026-09-09). This held its own ladder: provider
   * words, Zwift names, Strava's `trainer`, and a run-or-walk GPS test. It missed Garmin's
   * `indoor_cycling` / `indoor_running` (it matched only the separator-less `indoorcycling`),
   * Strava's `virtual` flag, our own `venue:` tag, a RIDE with no track at all, and a track that
   * never leaves a 100 m circle. Rather than grow a second ladder beside it for the card and the
   * map, the question moved to one file and this delegates.
   *
   * ⚠️ THE NAME STAYS because a dozen call sites use it and its meaning has not changed — only its
   * accuracy. `getVirtualWorkoutLabel` below still reads it, so a treadmill run now gets the indoor
   * label it always should have had.
   */
  return isIndoorSession(workout);
}
/**
 * Get a friendly label for virtual workout source
 * Only called when isVirtualActivity() returns true
 */
export function getVirtualWorkoutLabel(workout: any): string {
  /**
   * ⛔ ONE LADDER NOW (`src/lib/session-display-name.ts`, 2026-09-12). This was the third indoor
   * naming ladder in the app — its own provider-word list, its own Zwift test, its own `trainer`
   * read — and it disagreed with the two on the cards: it could say "Indoor Trainer" where they said
   * "Ride". ⚠️ THE NAME AND THE SIGNATURE STAY: the map placeholder calls it and its meaning has not
   * changed, only which file decides the word.
   */
  return sessionDisplayName(workout);
}

export interface WorkoutNameOptions {
  type: string; // normalized type: 'run', 'ride', 'swim', 'strength', 'walk'
  activityType?: string; // raw provider type: 'ROAD_BIKING', 'RUNNING', 'LAP_SWIMMING', etc.
  providerSport?: string; // Strava sport_type or similar
  location?: string; // city name if available
  lat?: number | null;
  lng?: number | null;
  poolLength?: number | null;
  numberOfLengths?: number | null;
  hasGps?: boolean;
}

/**
 * Get a friendly sport name based on workout type and provider info
 */
function getFriendlySportType(
  type: string,
  activityType?: string,
  providerSport?: string,
  poolLength?: number | null,
  numberOfLengths?: number | null,
  hasGps?: boolean
): string {
  const rawType = (activityType || providerSport || '').toLowerCase();
  const normalizedType = type.toLowerCase();

  // Swim type detection
  if (normalizedType === 'swim') {
    // Check for open water indicators
    if (/open\s*water|ocean|ow\b|open_water/.test(rawType)) {
      return 'Open Water Swim';
    }
    // Check for pool/lap indicators
    if (/lap|pool|indoor/.test(rawType) || (poolLength != null && poolLength > 0) || (numberOfLengths != null && numberOfLengths > 0)) {
      return 'Lap Swim';
    }
    // If has GPS track, likely open water
    if (hasGps) {
      return 'Open Water Swim';
    }
    // Default to Lap Swim if no indicators
    return 'Lap Swim';
  }

  /**
   * ⛔ RUN, RIDE AND WALK COME FROM THE ONE LADDER (2026-09-12). These three branches carried a
   * fifth copy of the indoor words, keyed off a raw provider string — "Treadmill Run" and "Indoor
   * Ride", which no other screen ever said. The ladder decides; the swim branch above stays, because
   * it reads pool length and lengths counted, which the ladder does not see.
   */
  {
    // ⚠️ ONLY THE PROVIDER WORD REACHES THE PREDICATE HERE — this function is handed strings, not a
    // row, so `isIndoorSession`'s Strava flags, `venue:` tag and track test have nothing to read.
    // A provider that names the machine ("treadmill_running", "virtual_ride") still lands correctly;
    // a row that needs the other four ways to know is named by the callers that hold the row.
    const named = sessionDisplayName({ type: normalizedType, provider_sport: rawType });
    if (named && named !== 'Session') return named;
  }

  // Other types
  if (normalizedType === 'walk') {
    if (/hike|hiking/.test(rawType)) {
      return 'Hike';
    }
    return 'Walk';
  }

  if (normalizedType === 'strength') {
    return 'Strength';
  }

  // Fallback: humanize the raw type
  if (rawType) {
    return rawType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  return normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1);
}

/**
 * Generate a nice workout name
 * Priority: location + sport type > sport type > fallback
 */
export function generateWorkoutName(options: WorkoutNameOptions): string {
  const {
    type,
    activityType,
    providerSport,
    location,
    lat,
    lng,
    poolLength,
    numberOfLengths,
    hasGps,
  } = options;

  const friendlySport = getFriendlySportType(
    type,
    activityType,
    providerSport,
    poolLength,
    numberOfLengths,
    hasGps
  );

  // If we have a location name, use it
  if (location && location !== 'Unknown' && location.trim().length > 0) {
    return `${location} ${friendlySport}`;
  }

  // If we have coordinates but no location name, we could use coordinates
  // For now, just return the sport type
  // TODO: Add reverse geocoding to get city names from coordinates
  
  // Fallback to just the sport type
  return friendlySport;
}

/**
 * Generate workout name from a workout object
 * This is a convenience function that extracts the needed fields
 */
export function generateWorkoutNameFromWorkout(workout: any): string {
  // Check if workout already has a nice name (not a raw activity_type)
  const existingName = workout.name;
  if (existingName && 
      !existingName.match(/^(ROAD_BIKING|RUNNING|LAP_SWIMMING|OPEN_WATER_SWIMMING|CYCLING|SWIMMING)$/i) &&
      !existingName.startsWith('Garmin ') &&
      !existingName.startsWith('Strava ')) {
    // Already has a nice name, return it
    return existingName;
  }

  const type = workout.type || '';
  const activityType = workout.activity_type || workout.provider_sport || '';
  const location = workout.location_name || null; // If we add this field later
  const lat = workout.starting_latitude || workout.start_position_lat || null;
  const lng = workout.starting_longitude || workout.start_position_long || null;
  const poolLength = workout.pool_length || workout.poolLengthInMeters || null;
  const numberOfLengths = workout.number_of_active_lengths || null;
  const hasGps = Array.isArray(workout.gps_track) && workout.gps_track.length > 0;

  return generateWorkoutName({
    type,
    activityType,
    providerSport: workout.provider_sport,
    location,
    lat,
    lng,
    poolLength,
    numberOfLengths,
    hasGps,
  });
}

