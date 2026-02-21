// src/services/GarminDataService.ts
// Updated to use Supabase Edge Functions instead of local proxy

const SUPABASE_FUNCTION_BASE = 'https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/swift-task';

export interface GarminActivity {
  activityId: number;
  activityName: string;
  activityType: {
    typeId: number;
    typeKey: string;
    parentTypeId?: number;
  };
  eventType: {
    typeId: number;
    typeKey: string;
  };
  startTimeLocal: string;
  startTimeGMT: string;
  distance: number;
  duration: number;
  movingDuration: number;
  elapsedDuration: number;
  elevationGain: number;
  elevationLoss: number;
  averageSpeed: number;
  maxSpeed: number;
  averageHR?: number;
  maxHR?: number;
  averagePower?: number;
  maxPower?: number;
  normalizedPower?: number;
  calories: number;
  averageRunningCadence?: number;
  maxRunningCadence?: number;
  strokes?: number;
  poolLength?: number;
  unitOfPoolLength?: {
    unitId: number;
    unitKey: string;
    factor: number;
  };
  // Additional metrics
  averagePace?: number;
  maxPace?: number;
  averageCadence?: number;
  maxCadence?: number;
  // Training load metrics
  tss?: number;
  intensityFactor?: number;
  // Additional power metrics
  functionalThresholdPower?: number;
  // Additional heart rate metrics
  hrv?: number;
  // Additional speed metrics
  averageSpeedMph?: number;
  maxSpeedMph?: number;
  // Additional distance metrics
  distanceMiles?: number;
  distanceYards?: number;
  // Additional time metrics
  movingTime?: number;
  elapsedTime?: number;
}

export interface DetectedMetric {
key: string;
label: string;
currentValue: string;
detectedValue: string;
confidence: 'high' | 'medium' | 'low';
source: string;
sport: string;
}

export interface AnalyzedGarminData {
activities: GarminActivity[];
totalActivities: number;
dateRange: {
  start: string;
  end: string;
};
sportsWithData: string[];
detectedMetrics: DetectedMetric[];
}

export class GarminDataService {
private static readonly DAYS_TO_FETCH = 90;
private static accessToken: string | null = null;

// NEW: Set access token from OAuth flow
static async setAccessToken(accessToken: string): Promise<boolean> {
  this.accessToken = accessToken;
  return true;
}

// First test with user permissions to verify token works
static async testConnection(): Promise<boolean> {
  if (!this.accessToken) {
    throw new Error('Not authenticated with Garmin. Please connect first.');
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User must be logged in');
    }
    
    const response = await fetch(`${SUPABASE_FUNCTION_BASE}?path=/wellness-api/rest/user/permissions&token=${this.accessToken}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Garmin API permissions error: ${response.status} ${response.statusText}`);
    }

    await response.json();
    return true;
  } catch (error) {
    throw error;
  }
}

// UPDATED: Now queries Supabase database for webhook-delivered activities
static async fetchRecentActivities(): Promise<GarminActivity[]> {
  try {
    // Import Supabase client (you'll need to add this import at the top of your file)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    // Query Supabase database for activities that came via webhooks
    const { data, error } = await supabase
      .from('garmin_activities')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Convert database records to our interface format
    const formattedActivities: GarminActivity[] = data.map((activity: any) => ({
      activityId: activity.garmin_activity_id || 0,
      activityName: activity.activity_type || 'Unknown Activity',
      activityType: {
        typeId: 0,
        typeKey: activity.activity_type || 'unknown',
        parentTypeId: 0
      },
      eventType: {
        typeId: 0,
        typeKey: 'unknown'
      },
      startTimeLocal: activity.start_time || '',
      startTimeGMT: activity.start_time || '',
      distance: activity.distance_meters || 0,
      duration: activity.duration_seconds || 0,
      movingDuration: activity.duration_seconds || 0,
      elapsedDuration: activity.duration_seconds || 0,
      elevationGain: activity.elevation_gain_meters || 0,
      elevationLoss: activity.elevation_loss_meters || 0,
      averageSpeed: activity.avg_speed_mps || 0,
      maxSpeed: activity.max_speed_mps || 0,
      averageHR: activity.avg_heart_rate,
      maxHR: activity.max_heart_rate,
      averagePower: activity.avg_power,
      maxPower: activity.max_power,
      normalizedPower: activity.normalized_power || 0,
      calories: activity.calories || 0,
      // Enhanced cadence data
      averageRunningCadence: activity.avg_running_cadence || activity.avg_run_cadence || 0,
      maxRunningCadence: activity.max_running_cadence || activity.max_run_cadence || 0,
      // Enhanced swim data
      strokes: activity.strokes || 0,
      poolLength: activity.pool_length || 0,
      unitOfPoolLength: activity.unit_of_pool_length ? {
        unitId: activity.unit_of_pool_length.unit_id || 0,
        unitKey: activity.unit_of_pool_length.unit_key || 'meters',
        factor: activity.unit_of_pool_length.factor || 1
      } : undefined,
      // Additional metrics
      averagePace: activity.avg_pace,
      maxPace: activity.max_pace,
      averageCadence: activity.avg_cadence || activity.avg_bike_cadence,
      maxCadence: activity.max_cadence || activity.max_bike_cadence,
      // Training load metrics
      tss: activity.tss || activity.training_stress_score,
      intensityFactor: activity.intensity_factor || activity.if,
      // Additional power metrics
      functionalThresholdPower: activity.ftp || activity.functional_threshold_power,
      // Additional heart rate metrics
      hrv: activity.hrv || activity.heart_rate_variability,
      // Additional speed metrics
      averageSpeedMph: activity.avg_speed_mph,
      maxSpeedMph: activity.max_speed_mph,
      // Additional distance metrics
      distanceMiles: activity.distance_miles,
      distanceYards: activity.distance_yards,
      // Additional time metrics
      movingTime: activity.moving_time || activity.moving_duration,
      elapsedTime: activity.elapsed_time || activity.elapsed_duration
    }));

    return formattedActivities;
  } catch (error) {
    throw error;
  }
}

// UPDATED: Now uses Supabase function instead of direct API calls
static async fetchActivityDetails(activityId: number): Promise<any> {
  if (!this.accessToken) {
    throw new Error('Not authenticated with Garmin. Please connect first.');
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User must be logged in');
    }

    const response = await fetch(`${SUPABASE_FUNCTION_BASE}?path=/wellness-api/rest/activityDetails/${activityId}&token=${this.accessToken}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Garmin API error: ${response.status}`);
    }

    const details = await response.json();
    return details;
  } catch (error) {
    return null;
  }
}

// UPDATED: No longer needs access token since we're querying database
static async analyzeActivitiesForBaselines(
  currentBaselines: any
): Promise<AnalyzedGarminData> {
  // Fetch activities from database (no token needed)
  const activities = await this.fetchRecentActivities();
  const detectedMetrics: DetectedMetric[] = [];
  const sportsWithData: string[] = [];

  // Group activities by sport
  const sportGroups = this.groupActivitiesBySport(activities);

  // Analyze each sport
  for (const [sport, sportActivities] of Object.entries(sportGroups)) {
    if (sportActivities.length >= 3) { // Minimum threshold
      sportsWithData.push(sport);

      switch (sport) {
        case 'running':
          const runningMetrics = await this.analyzeRunningData(sportActivities, currentBaselines);
          detectedMetrics.push(...runningMetrics);
          break;
        case 'cycling':
          detectedMetrics.push(...this.analyzeCyclingData(sportActivities, currentBaselines));
          break;
        case 'swimming':
          detectedMetrics.push(...this.analyzeSwimmingData(sportActivities, currentBaselines));
          break;
      }
    }
  }

  return {
    activities,
    totalActivities: activities.length,
    dateRange: {
      start: activities.length > 0 ? activities[activities.length - 1].startTimeLocal : '',
      end: activities.length > 0 ? activities[0].startTimeLocal : ''
    },
    sportsWithData,
    detectedMetrics
  };
}

// NEW: Enhanced analysis using Activity Details API with 6 months of detailed data
  static async analyzeActivitiesFromDatabase(
    activities: any[],
    currentBaselines: any
  ): Promise<AnalyzedGarminData> {
    // Convert database activities to GarminActivity format
    const garminActivities: GarminActivity[] = activities.map(activity => ({
      activityId: activity.garmin_activity_id,
      activityName: activity.activity_name || 'Unknown Activity',
      activityType: {
        typeId: 0,
        typeKey: activity.activity_type || 'unknown'
      },
      eventType: {
        typeId: 0,
        typeKey: 'manual'
      },
      startTimeLocal: activity.start_time || '',
      startTimeGMT: activity.start_time || '',
      distance: activity.distance_meters || 0,
      duration: activity.duration_seconds || 0,
      movingDuration: activity.duration_seconds || 0,
      elapsedDuration: activity.duration_seconds || 0,
      elevationGain: activity.elevation_gain_meters || 0,
      elevationLoss: activity.elevation_loss_meters || 0,
      averageSpeed: activity.avg_speed_mps || 0,
      maxSpeed: activity.max_speed_mps || 0,
      averageHR: activity.avg_heart_rate || undefined,
      maxHR: activity.max_heart_rate || undefined,
      averagePower: activity.avg_power_watts || undefined,
      maxPower: activity.max_power_watts || undefined,
      normalizedPower: activity.normalized_power_watts || undefined,
      calories: activity.calories || 0,
      averageRunningCadence: activity.avg_running_cadence || undefined,
      maxRunningCadence: activity.max_running_cadence || undefined,
      strokes: activity.strokes || undefined,
      poolLength: activity.pool_length_meters || undefined,
      unitOfPoolLength: activity.pool_length_meters ? {
        unitId: 1,
        unitKey: 'meter',
        factor: 1
      } : undefined
    }));

    // Analyze the activities directly
    const detectedMetrics: DetectedMetric[] = [];
    const sportsWithData: string[] = [];

    // Group activities by sport
    const sportGroups = this.groupActivitiesBySport(garminActivities);

    // Analyze each sport
    for (const [sport, sportActivities] of Object.entries(sportGroups)) {
      if (sportActivities.length >= 3) { // Minimum threshold
        sportsWithData.push(sport);

        switch (sport) {
          case 'running':
            const runningMetrics = await this.analyzeRunningData(sportActivities, currentBaselines);
            detectedMetrics.push(...runningMetrics);
            break;
          case 'cycling':
            detectedMetrics.push(...this.analyzeCyclingData(sportActivities, currentBaselines));
            break;
          case 'swimming':
            detectedMetrics.push(...this.analyzeSwimmingData(sportActivities, currentBaselines));
            break;
        }
      }
    }

    return {
      activities: garminActivities,
      totalActivities: garminActivities.length,
      dateRange: {
        start: garminActivities.length > 0 ? garminActivities[garminActivities.length - 1].startTimeLocal : '',
        end: garminActivities.length > 0 ? garminActivities[0].startTimeLocal : ''
      },
      sportsWithData,
      detectedMetrics
    };
  }

  static async analyzeActivitiesWithDetailedData(
    accessToken: string,
    currentBaselines: any
  ): Promise<AnalyzedGarminData> {
  if (!accessToken) {
    throw new Error('Access token required for detailed analysis');
  }

  try {
    // Set the date range for 6 months back
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (180 * 24 * 60 * 60); // 6 months = 180 days

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User must be logged in');
    }

    // Call Activities API for 6 months of activity data
    const response = await fetch(
      `${SUPABASE_FUNCTION_BASE}?path=/wellness-api/rest/activities&uploadStartTimeInSeconds=${startDate}&uploadEndTimeInSeconds=${endDate}&token=${accessToken}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Activities API error: ${response.status} ${response.statusText}`);
    }

    const activityData = await response.json();

    // Convert API response to our GarminActivity format
    const activities = this.convertDetailedDataToActivities(activityData);
    
    // Analyze the detailed data (same analysis methods but with richer data)
    const detectedMetrics: DetectedMetric[] = [];
    const sportsWithData: string[] = [];

    // Group activities by sport
    const sportGroups = this.groupActivitiesBySport(activities);

    // Analyze each sport with detailed data
    for (const [sport, sportActivities] of Object.entries(sportGroups)) {
      if (sportActivities.length >= 3) {
        sportsWithData.push(sport);

        switch (sport) {
          case 'running':
            const runningMetrics = await this.analyzeRunningData(sportActivities, currentBaselines);
            detectedMetrics.push(...runningMetrics);
            break;
          case 'cycling':
            detectedMetrics.push(...this.analyzeCyclingData(sportActivities, currentBaselines));
            break;
          case 'swimming':
            detectedMetrics.push(...this.analyzeSwimmingData(sportActivities, currentBaselines));
            break;
        }
      }
    }

    return {
      activities,
      totalActivities: activities.length,
      dateRange: {
        start: activities.length > 0 ? activities[activities.length - 1].startTimeLocal : '',
        end: activities.length > 0 ? activities[0].startTimeLocal : ''
      },
      sportsWithData,
      detectedMetrics
    };

  } catch (error) {
    throw error;
  }
}

// NEW: Convert Activity Details API response to our GarminActivity format
private static convertDetailedDataToActivities(detailedData: any[]): GarminActivity[] {
  return detailedData.map((item: any) => {
    const summary = item.summary || item;
    
    return {
      activityId: summary.activityId || 0,
      activityName: summary.activityName || 'Unknown Activity',
      activityType: {
        typeId: summary.activityType?.typeId || 0,
        typeKey: summary.activityType?.typeKey || 'unknown',
        parentTypeId: summary.activityType?.parentTypeId
      },
      eventType: {
        typeId: summary.eventType?.typeId || 0,
        typeKey: summary.eventType?.typeKey || 'unknown'
      },
      startTimeLocal: summary.startTimeLocal || summary.startTimeInSeconds ? new Date(summary.startTimeInSeconds * 1000).toISOString() : '',
      startTimeGMT: summary.startTimeGMT || summary.startTimeInSeconds ? new Date(summary.startTimeInSeconds * 1000).toISOString() : '',
      distance: summary.distance || summary.distanceInMeters || 0,
      duration: summary.duration || summary.durationInSeconds || 0,
      movingDuration: summary.movingDuration || summary.movingDurationInSeconds || summary.durationInSeconds || 0,
      elapsedDuration: summary.elapsedDuration || summary.elapsedDurationInSeconds || summary.durationInSeconds || 0,
      elevationGain: summary.elevationGain || summary.elevationGainInMeters || 0,
      elevationLoss: summary.elevationLoss || summary.elevationLossInMeters || 0,
      averageSpeed: summary.averageSpeed || summary.averageSpeedInMetersPerSecond || 0,
      maxSpeed: summary.maxSpeed || summary.maxSpeedInMetersPerSecond || 0,
      averageHR: summary.averageHR || summary.averageHeartRateInBeatsPerMinute,
      maxHR: summary.maxHR || summary.maxHeartRateInBeatsPerMinute,
      averagePower: summary.averagePower || summary.averagePowerInWatts,
      maxPower: summary.maxPower || summary.maxPowerInWatts,
      normalizedPower: summary.normalizedPower || 0,
      calories: summary.calories || summary.activeKilocalories || 0,
      averageRunningCadence: summary.averageRunningCadence || summary.averageRunCadenceInStepsPerMinute,
      maxRunningCadence: summary.maxRunningCadence || summary.maxRunCadenceInStepsPerMinute,
      strokes: summary.strokes || 0,
      poolLength: summary.poolLength || 0,
      unitOfPoolLength: summary.unitOfPoolLength
    };
  });
}

private static groupActivitiesBySport(activities: GarminActivity[]): Record<string, GarminActivity[]> {
  const groups: Record<string, GarminActivity[]> = {};

  activities.forEach(activity => {
    const sport = this.detectSport(activity);
    if (sport) {
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(activity);
    }
  });

  return groups;
}

// Heuristic sport detection to correct common Garmin misclassifications
private static detectSport(activity: GarminActivity): 'running' | 'cycling' | 'swimming' | '' {
  const typeKey = activity.activityType?.typeKey?.toLowerCase() || '';

  // Direct type hints first
  if (this.isSwimmingActivity(typeKey)) return 'swimming';
  if (this.isCyclingActivity(typeKey)) return 'cycling';
  if (this.isRunningActivity(typeKey)) {
    // If Garmin labeled it as run but cycling signals are strong, flip to cycling
    const looksLikeCycling = (
      (typeof activity.averagePower === 'number' && activity.averagePower > 50) ||
      (typeof activity.maxPower === 'number' && activity.maxPower > 100) ||
      (typeof activity.averageCadence === 'number' && activity.averageCadence > 60 && activity.averageCadence < 130) ||
      (typeof activity.averageRunningCadence === 'number' && activity.averageRunningCadence < 90 && !!activity.averagePower && activity.averagePower > 50) ||
      (typeof activity.averageSpeed === 'number' && activity.averageSpeed >= 4.5)
    );
    if (looksLikeCycling) return 'cycling';
    return 'running';
  }

  // Fallbacks based on metrics only when type is unknown
  if (
    (typeof activity.averagePower === 'number' && activity.averagePower > 50) ||
    (typeof activity.maxPower === 'number' && activity.maxPower > 100) ||
    (typeof activity.averageSpeed === 'number' && activity.averageSpeed >= 4.5)
  ) {
    return 'cycling';
  }

  if (
    typeof activity.averageRunningCadence === 'number' && activity.averageRunningCadence >= 130
  ) {
    return 'running';
  }

  return '';
}

private static isRunningActivity(typeKey: string): boolean {
  return typeKey.toLowerCase().includes('run');
}

private static isCyclingActivity(typeKey: string): boolean {
  const cycling = typeKey.toLowerCase();
  return (
    cycling.includes('cycl') ||
    cycling.includes('bik') ||
    cycling.includes('ride') ||
    cycling.includes('road_bik') ||
    cycling.includes('gravel') ||
    cycling.includes('mtb') ||
    cycling.includes('mountain_bik') ||
    cycling.includes('ebike')
  );
}

private static isSwimmingActivity(typeKey: string): boolean {
  return typeKey.toLowerCase().includes('swim');
}

private static async analyzeRunningData(
  activities: GarminActivity[],
  currentBaselines: any
): Promise<DetectedMetric[]> {
  const metrics: DetectedMetric[] = [];

  // Weekly volume
  const weeklyHours = this.calculateWeeklyVolume(activities);
  const volumeRange = this.getVolumeRange(weeklyHours);

  metrics.push({
    key: 'current_volume.running',
    label: 'Weekly Running Volume',
    currentValue: currentBaselines.current_volume?.running || 'Not set',
    detectedValue: volumeRange,
    confidence: 'high',
    source: `${activities.length} runs in last 90 days`,
    sport: 'running'
  });

  // Training status
  const trainingStatus = this.analyzeTrainingConsistency(activities);
  metrics.push({
    key: 'training_status.running',
    label: 'Training Status',
    currentValue: currentBaselines.training_status?.running || 'Not set',
    detectedValue: trainingStatus,
    confidence: 'high',
    source: 'Activity frequency analysis',
    sport: 'running'
  });

  // 5K performance analysis
  const fastest5K = await this.findFastest5K(activities);
  if (fastest5K) {
    const pace = this.formatPace(fastest5K.time);
    metrics.push({
      key: 'benchmarks.running',
      label: 'Performance Level',
      currentValue: currentBaselines.benchmarks?.running || 'Not set',
      detectedValue: pace,
      confidence: 'medium',
      source: 'Estimated 5K time based on your recent runs',
      sport: 'running'
    });
  } else {
    metrics.push({
      key: 'benchmarks.running',
      label: 'Performance Level',
      currentValue: currentBaselines.benchmarks?.running || 'Not set',
      detectedValue: 'Insufficient current data',
      confidence: 'low',
      source: 'Need more recent running data for accurate analysis',
      sport: 'running'
    });
  }

  return metrics;
}

private static async findFastest5K(activities: GarminActivity[]): Promise<{time: number, source: string} | null> {
  // Get running activities 5K+ only
  const runningActivities = activities.filter(activity => {
    return activity.distance >= 5000 && activity.movingDuration > 0;
  });

  // Filter by recency (within 3 months)
  const recent5KPlus = runningActivities.filter(activity => {
    const activityDate = new Date(activity.startTimeLocal);
    const monthsOld = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsOld <= 3;
  });

  if (recent5KPlus.length === 0) {
    return null;
  }

  // Calculate first 5K pace for each run and find fastest
  const calculated5Ks = recent5KPlus.map(activity => {
    const first5KTime = (activity.movingDuration / activity.distance) * 5000;
    return {
      time: first5KTime,
      activity: activity
    };
  });

  // Sort by fastest calculated 5K time
  const fastest5K = calculated5Ks.sort((a, b) => a.time - b.time)[0];
  const activityDate = new Date(fastest5K.activity.startTimeLocal);

  return {
    time: fastest5K.time,
    source: `First 5K from: ${fastest5K.activity.activityName} on ${activityDate.toLocaleDateString()}`
  };
}

private static analyzeCyclingData(activities: GarminActivity[], currentBaselines: any): DetectedMetric[] {
  const metrics: DetectedMetric[] = [];

  // Weekly volume
  const weeklyHours = this.calculateWeeklyVolume(activities);
  const volumeRange = this.getVolumeRange(weeklyHours);

  metrics.push({
    key: 'current_volume.cycling',
    label: 'Weekly Cycling Volume',
    currentValue: currentBaselines.current_volume?.cycling || 'Not set',
    detectedValue: volumeRange,
    confidence: 'high',
    source: `${activities.length} rides in last 90 days`,
    sport: 'cycling'
  });

  // FTP estimate from power data
  const powerActivities = activities.filter(a => a.averagePower && a.averagePower > 50);
  if (powerActivities.length >= 3) {
    const estimatedFTP = this.estimateFTP(powerActivities);
    metrics.push({
      key: 'performanceNumbers.ftp',
      label: 'Functional Threshold Power (FTP)',
      currentValue: currentBaselines.performanceNumbers?.ftp ? `${currentBaselines.performanceNumbers.ftp}W` : 'Not set',
      detectedValue: `${estimatedFTP}W (estimated)`,
      confidence: 'medium',
      source: `${powerActivities.length} rides with power data`,
      sport: 'cycling'
    });
  }

  // Average speed
  const outdoorRides = activities.filter(a => a.averageSpeed > 0);
  if (outdoorRides.length > 0) {
    const avgSpeed = outdoorRides.reduce((sum, a) => sum + a.averageSpeed, 0) / outdoorRides.length;
    const speedMph = (avgSpeed * 2.237).toFixed(1); // Convert m/s to mph

    metrics.push({
      key: 'performanceNumbers.avgSpeed',
      label: 'Average Speed',
      currentValue: currentBaselines.performanceNumbers?.avgSpeed ? `${currentBaselines.performanceNumbers.avgSpeed} mph` : 'Not set',
      detectedValue: `${speedMph} mph`,
      confidence: 'high',
      source: 'Outdoor rides average',
      sport: 'cycling'
    });
  }

  // Performance level based on power or speed
  let performanceLevel = '';
  if (powerActivities.length >= 3) {
    const estimatedFTP = this.estimateFTP(powerActivities);
    performanceLevel = this.classifyCyclingPerformance(estimatedFTP);
  } else if (outdoorRides.length > 0) {
    const avgSpeed = outdoorRides.reduce((sum, a) => sum + a.averageSpeed, 0) / outdoorRides.length;
    const speedMph = avgSpeed * 2.237;
    performanceLevel = this.classifyCyclingPerformanceBySpeed(speedMph);
  }

  if (performanceLevel) {
    metrics.push({
      key: 'benchmarks.cycling',
      label: 'Performance Level',
      currentValue: currentBaselines.benchmarks?.cycling || 'Not set',
      detectedValue: performanceLevel,
      confidence: 'medium',
      source: powerActivities.length >= 3 ? 'Power data analysis' : 'Speed analysis',
      sport: 'cycling'
    });
  }

  return metrics;
}

private static analyzeSwimmingData(activities: GarminActivity[], currentBaselines: any): DetectedMetric[] {
  const metrics: DetectedMetric[] = [];

  // Weekly volume
  const weeklyHours = this.calculateWeeklyVolume(activities);
  const volumeRange = this.getVolumeRange(weeklyHours);

  metrics.push({
    key: 'current_volume.swimming',
    label: 'Weekly Swimming Volume',
    currentValue: currentBaselines.current_volume?.swimming || 'Not set',
    detectedValue: volumeRange,
    confidence: 'high',
    source: `${activities.length} swims in last 90 days`,
    sport: 'swimming'
  });

  // 100m pace estimate
  const poolSwims = activities.filter(a => a.distance > 0 && a.movingDuration > 0);
  if (poolSwims.length >= 3) {
    const avgPace = poolSwims.reduce((sum, swim) => {
      const pace100m = (swim.movingDuration / swim.distance) * 100; // seconds per 100m
      return sum + pace100m;
    }, 0) / poolSwims.length;

    const paceFormatted = this.formatSwimPace(avgPace);

    metrics.push({
      key: 'performanceNumbers.swimPace100',
      label: '100m Pace',
      currentValue: currentBaselines.performanceNumbers?.swimPace100 || 'Not set',
      detectedValue: paceFormatted,
      confidence: 'medium',
      source: `${poolSwims.length} pool swims`,
      sport: 'swimming'
    });
  }

  return metrics;
}

// Helper methods (unchanged)
private static calculateWeeklyVolume(activities: GarminActivity[]): number {
  const totalHours = activities.reduce((sum, activity) => sum + activity.movingDuration, 0) / 3600;
  const weeks = this.DAYS_TO_FETCH / 7;
  return totalHours / weeks;
}

private static getVolumeRange(weeklyHours: number): string {
  if (weeklyHours < 2) return '0-2 hours';
  if (weeklyHours < 4) return '2-4 hours';
  if (weeklyHours < 6) return '4-6 hours';
  if (weeklyHours < 8) return '6-8 hours';
  return '8+ hours';
}

private static analyzeTrainingConsistency(activities: GarminActivity[]): string {
  const weeksWithActivity = new Set();

  activities.forEach(activity => {
    const week = Math.floor(new Date(activity.startTimeLocal).getTime() / (7 * 24 * 60 * 60 * 1000));
    weeksWithActivity.add(week);
  });

  const consistencyRate = weeksWithActivity.size / (this.DAYS_TO_FETCH / 7);

  if (consistencyRate > 0.8) return 'In regular training routine';
  if (consistencyRate > 0.6) return 'Building base fitness';
  if (consistencyRate > 0.3) return 'Maintaining current fitness';
  return 'Returning after break (1-3 months)';
}

private static formatPace(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

private static formatSwimPace(secondsPer100m: number): string {
  const minutes = Math.floor(secondsPer100m / 60);
  const seconds = Math.floor(secondsPer100m % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/100m`;
}

private static estimateFTP(powerActivities: GarminActivity[]): number {
  const longEfforts = powerActivities.filter(a => a.movingDuration >= 1200); // 20+ minutes
  if (longEfforts.length === 0) return 0;

  const bestPower = Math.max(...longEfforts.map(a => a.averagePower || 0));
  return Math.round(bestPower * 0.95);
}

private static classifyCyclingPerformance(ftp: number): string {
  if (ftp > 300) return 'Average 22+ mph on flats (competitive cyclist)';
  if (ftp > 250) return 'Average 19-21 mph on flats (trained cyclist)';
  if (ftp > 200) return 'Average 16-18 mph on flats (fitness rider)';
  return 'Average 12-15 mph on flats (recreational)';
}

private static classifyCyclingPerformanceBySpeed(speedMph: number): string {
  if (speedMph > 22) return 'Average 22+ mph on flats (competitive cyclist)';
  if (speedMph > 19) return 'Average 19-21 mph on flats (trained cyclist)';
  if (speedMph > 16) return 'Average 16-18 mph on flats (fitness rider)';
  return 'Average 12-15 mph on flats (recreational)';
}
}