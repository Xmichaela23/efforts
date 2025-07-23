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
    console.log('🔍 GARMIN DEBUG: Testing connection with user permissions endpoint');
    
    const response = await fetch(`${SUPABASE_FUNCTION_BASE}?path=/wellness-api/rest/user/permissions&token=${this.accessToken}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      }
    });

    console.log('🔍 GARMIN DEBUG: Permissions response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔍 GARMIN DEBUG: Permissions error:', errorText);
      throw new Error(`Garmin API permissions error: ${response.status} ${response.statusText}`);
    }

    const permissions = await response.json();
    console.log('🔍 GARMIN DEBUG: User permissions:', permissions);
    return true;
  } catch (error) {
    console.error('Error testing Garmin connection:', error);
    throw error;
  }
}

// UPDATED: Now queries Supabase database for webhook-delivered activities
static async fetchRecentActivities(): Promise<GarminActivity[]> {
  try {
    console.log('🔍 GARMIN DEBUG: Querying database for webhook activities');

    // Import Supabase client (you'll need to add this import at the top of your file)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('🔍 GARMIN DEBUG: No authenticated user');
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
      console.error('🔍 GARMIN DEBUG: Database error:', error);
      throw new Error(`Database query failed: ${error.message}`);
    }

    console.log('🔍 GARMIN DEBUG: Found activities in database:', data?.length || 0);

    if (!data || data.length === 0) {
      console.log('🔍 GARMIN DEBUG: No activities found in database');
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
      maxSpeed: 0,
      averageHR: activity.avg_heart_rate,
      maxHR: activity.max_heart_rate,
      averagePower: activity.avg_power,
      maxPower: activity.max_power,
      normalizedPower: 0,
      calories: activity.calories || 0,
      averageRunningCadence: 0,
      maxRunningCadence: 0,
      strokes: 0,
      poolLength: 0,
      unitOfPoolLength: undefined
    }));

    const runningActivities = formattedActivities.filter(a =>
      this.isRunningActivity(a.activityType?.typeKey || '')
    );
    
    console.log('🏃 GARMIN DEBUG: Running activities found:', runningActivities.length);
    console.log('🏃 GARMIN DEBUG: Activities sample:', formattedActivities.slice(0, 3).map(a => ({
      name: a.activityName,
      distance: a.distance,
      duration: a.duration,
      startTime: a.startTimeLocal
    })));

    return formattedActivities;
  } catch (error) {
    console.error('Error fetching Garmin activities from database:', error);
    throw error;
  }
}

// UPDATED: Now uses Supabase function instead of direct API calls
static async fetchActivityDetails(activityId: number): Promise<any> {
  if (!this.accessToken) {
    throw new Error('Not authenticated with Garmin. Please connect first.');
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTION_BASE}?path=/wellness-api/rest/activityDetails/${activityId}&token=${this.accessToken}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
      }
    });

    if (!response.ok) {
      throw new Error(`Garmin API error: ${response.status}`);
    }

    const details = await response.json();
    return details;
  } catch (error) {
    console.warn(`Error fetching detailed activity ${activityId}:`, error);
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

private static groupActivitiesBySport(activities: GarminActivity[]): Record<string, GarminActivity[]> {
  const groups: Record<string, GarminActivity[]> = {};

  activities.forEach(activity => {
    let sport = '';
    const typeKey = activity.activityType?.typeKey?.toLowerCase() || '';

    if (this.isRunningActivity(typeKey)) {
      sport = 'running';
    } else if (this.isCyclingActivity(typeKey)) {
      sport = 'cycling';
    } else if (this.isSwimmingActivity(typeKey)) {
      sport = 'swimming';
    }

    if (sport) {
      if (!groups[sport]) groups[sport] = [];
      groups[sport].push(activity);
    }
  });

  return groups;
}

private static isRunningActivity(typeKey: string): boolean {
  return typeKey.toLowerCase().includes('run');
}

private static isCyclingActivity(typeKey: string): boolean {
  const cycling = typeKey.toLowerCase();
  return cycling.includes('cycl') || cycling.includes('bik') || cycling.includes('ride');
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
  console.log('🔍 5K EXTRACTION: Looking for 5K+ runs from past 3 months across', activities.length, 'activities');

  // Get running activities 5K+ only
  const runningActivities = activities.filter(activity => {
    return activity.distance >= 5000 && activity.movingDuration > 0;
  });

  console.log(`Found ${runningActivities.length} running activities 5K+ to analyze`);

  // Filter by recency (within 3 months)
  const recent5KPlus = runningActivities.filter(activity => {
    const activityDate = new Date(activity.startTimeLocal);
    const monthsOld = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsOld <= 3;
  });

  if (recent5KPlus.length === 0) {
    console.log('📝 No 5K+ activities found from past 3 months');
    return null;
  }

  console.log(`Found ${recent5KPlus.length} runs 5K+ from past 3 months`);

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

  console.log(`🎯 Best calculated 5K found: ${this.formatPace(fastest5K.time)} from "${fastest5K.activity.activityName}"`);

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
  return 'Average 12-15 hours on flats (recreational)';
}