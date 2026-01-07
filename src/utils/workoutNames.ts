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
  const providerSport = (workout?.provider_sport || '').toLowerCase();
  const activityType = (workout?.activity_type || '').toLowerCase();
  const name = (workout?.name || '').toLowerCase();
  const type = (workout?.type || '').toLowerCase();
  
  // Check provider sport type for explicit virtual/indoor indicators
  const isVirtualSport = (
    providerSport.includes('virtual') ||
    providerSport === 'indoorcycling' ||
    providerSport.includes('treadmill') ||
    activityType.includes('virtual') ||
    activityType === 'indoorcycling' ||
    activityType.includes('treadmill')
  );
  
  // If provider explicitly says it's virtual/indoor, trust it
  if (isVirtualSport) return true;
  
  // Check workout name for Zwift indicators
  const isZwiftWorkout = (
    name.includes('zwift') ||
    name.includes('watopia') ||
    name.includes('makuri') ||
    (name.includes('innsbruck') && name.includes('zwift'))
  );
  
  if (isZwiftWorkout) return true;
  
  // Check for explicit trainer flag from Strava
  const isTrainer = workout?.strava_data?.original_activity?.trainer === true;
  if (isTrainer) return true;
  
  // For runs/walks, we need to determine indoor vs outdoor
  // But we must be STABLE - don't flip based on whether gps_track has loaded yet
  if (type === 'run' || type === 'walk') {
    // Check for GPS data - handle both array and JSON string formats
    let hasGpsTrack = false;
    const gpsTrack = workout?.gps_track;
    if (Array.isArray(gpsTrack) && gpsTrack.length > 0) {
      hasGpsTrack = true;
    } else if (typeof gpsTrack === 'string' && gpsTrack.length > 10) {
      // It's a JSON string that hasn't been parsed - assume it has GPS data
      hasGpsTrack = true;
    }
    
    // Check for start position (lat/lng) - this is often available even in minimal fetches
    const hasStartPosition = (
      (Number.isFinite(workout?.start_position_lat) && workout.start_position_lat !== 0) ||
      (Number.isFinite(workout?.starting_latitude) && workout.starting_latitude !== 0)
    );
    
    // If gps_track is undefined (not yet loaded), check other indicators
    // Don't assume indoor just because gps_track hasn't loaded
    if (gpsTrack === undefined || gpsTrack === null) {
      // If we have start position, it's likely outdoor
      if (hasStartPosition) return false;
      // If gps_track hasn't loaded yet, default to outdoor (false) to avoid UI flicker
      // The function will be called again after hydration with full data
      return false;
    }
    
    // If gps_track explicitly exists but is empty, it's indoor
    if (Array.isArray(gpsTrack) && gpsTrack.length === 0) {
      // Double-check with start position - if we have coords, it might be outdoor
      // with failed GPS recording
      if (hasStartPosition) return false;
      return true;
    }
    
    // If we have GPS track data, it's outdoor
    if (hasGpsTrack) return false;
  }
  
  return false;
}

/**
 * Get a friendly label for virtual workout source
 * Only called when isVirtualActivity() returns true
 */
export function getVirtualWorkoutLabel(workout: any): string {
  const providerSport = (workout?.provider_sport || '').toLowerCase();
  const name = (workout?.name || '').toLowerCase();
  const type = (workout?.type || '').toLowerCase();
  
  // Zwift detection
  if (name.includes('zwift') || providerSport.includes('virtual')) {
    return 'Zwift';
  }
  
  // Indoor cycling
  if (providerSport === 'indoorcycling' || providerSport.includes('trainer')) {
    return 'Indoor Trainer';
  }
  
  // Treadmill (explicit flag or provider sport)
  const isTrainer = workout?.strava_data?.original_activity?.trainer === true;
  if (providerSport.includes('treadmill') || (type === 'run' && isTrainer)) {
    return 'Treadmill';
  }
  
  // For runs/walks that are confirmed indoor (via isVirtualActivity)
  if (type === 'run') {
    return isTrainer ? 'Treadmill' : 'Indoor Run';
  }
  
  if (type === 'walk') {
    return 'Indoor Walk';
  }
  
  return 'Virtual Ride';
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

  // Run type detection
  if (normalizedType === 'run') {
    if (/trail|trailrun/.test(rawType)) {
      return 'Trail Run';
    }
    if (/treadmill|indoor/.test(rawType)) {
      return 'Treadmill Run';
    }
    return 'Run';
  }

  // Ride type detection
  if (normalizedType === 'ride') {
    if (/gravel|gravelride/.test(rawType)) {
      return 'Gravel Ride';
    }
    if (/mountain|mtb|mountainbike/.test(rawType)) {
      return 'Mountain Bike';
    }
    if (/road|roadbike|road_cycling/.test(rawType)) {
      return 'Road Ride';
    }
    if (/indoor|virtual|trainer/.test(rawType)) {
      return 'Indoor Ride';
    }
    return 'Ride';
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

