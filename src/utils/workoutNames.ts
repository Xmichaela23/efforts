/**
 * Generate a nice, human-readable workout name
 * Examples: "Los Angeles Run", "Los Angeles Ride", "Lap Swim", "Open Water Swim"
 */

/**
 * Check if a workout is a virtual/indoor activity (Zwift, treadmill, indoor trainer)
 * These activities have GPS data that maps to fictional locations (e.g., Watopia in the Pacific Ocean)
 */
export function isVirtualActivity(workout: any): boolean {
  const providerSport = (workout?.provider_sport || '').toLowerCase();
  const activityType = (workout?.activity_type || '').toLowerCase();
  const name = (workout?.name || '').toLowerCase();
  
  // Check provider sport type for virtual indicators
  const isVirtualSport = (
    providerSport.includes('virtual') ||
    providerSport === 'indoorcycling' ||
    providerSport.includes('treadmill') ||
    activityType.includes('virtual') ||
    activityType === 'indoorcycling' ||
    activityType.includes('treadmill')
  );
  
  // Check workout name for Zwift indicators
  const isZwiftWorkout = (
    name.includes('zwift') ||
    name.includes('watopia') ||
    name.includes('makuri') ||
    name.includes('innsbruck') && name.includes('zwift')
  );
  
  return isVirtualSport || isZwiftWorkout;
}

/**
 * Get a friendly label for virtual workout source
 */
export function getVirtualWorkoutLabel(workout: any): string {
  const providerSport = (workout?.provider_sport || '').toLowerCase();
  const name = (workout?.name || '').toLowerCase();
  
  if (name.includes('zwift') || providerSport.includes('virtual')) {
    return 'Zwift';
  }
  if (providerSport === 'indoorcycling' || providerSport.includes('trainer')) {
    return 'Indoor Trainer';
  }
  if (providerSport.includes('treadmill')) {
    return 'Treadmill';
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

