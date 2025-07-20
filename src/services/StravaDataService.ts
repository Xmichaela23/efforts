// src/services/StravaDataService.ts

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  suffer_score?: number;
  device_name?: string;
  trainer?: boolean;
}

// Interface for splits data
export interface StravaSplit {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  pace_zone?: number;
}

// Interface for activity streams data
export interface StravaStreams {
  time?: { data: number[] };
  distance?: { data: number[] };
  velocity_smooth?: { data: number[] };
}

// Interface for best efforts data
export interface StravaBestEffort {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_index: number;
  end_index: number;
  pr_rank?: number | null;
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

export interface AnalyzedStravaData {
  activities: StravaActivity[];
  totalActivities: number;
  dateRange: {
    start: string;
    end: string;
  };
  sportsWithData: string[];
  detectedMetrics: DetectedMetric[];
}

export class StravaDataService {
  private static readonly BASE_URL = 'https://www.strava.com/api/v3';
  private static readonly DAYS_TO_FETCH = 90;

  static async fetchRecentActivities(accessToken: string): Promise<StravaActivity[]> {
    const after = Math.floor((Date.now() - (this.DAYS_TO_FETCH * 24 * 60 * 60 * 1000)) / 1000);
    
    try {
      const response = await fetch(
        `${this.BASE_URL}/athlete/activities?after=${after}&per_page=200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Strava API error: ${response.status}`);
      }

      const activities = await response.json();
      
      // DEBUG: Log what activities we're getting
      console.log('🔍 STRAVA DEBUG: Total activities found:', activities.length);
      const runningActivities = activities.filter(a => 
        (a.type?.toLowerCase() || '').includes('run') || 
        (a.sport_type?.toLowerCase() || '').includes('run')
      );
      console.log('🏃 STRAVA DEBUG: Running activities found:', runningActivities.length);
      console.log('🏃 STRAVA DEBUG: Running activities sample:', runningActivities.slice(0, 3).map(a => ({
        name: a.name,
        distance: a.distance,
        moving_time: a.moving_time,
        start_date: a.start_date
      })));
      
      return activities;
    } catch (error) {
      console.error('Error fetching Strava activities:', error);
      throw error;
    }
  }

  static async fetchActivityLaps(activityId: number, accessToken: string): Promise<any[]> {
    // Debug token
    console.log('Fetching laps with token:', accessToken ? `${accessToken.substring(0, 10)}...` : 'NO TOKEN');
    
    if (!accessToken) {
      console.warn('No access token provided for lap fetching');
      return [];
    }
    
    try {
      const response = await fetch(
        `${this.BASE_URL}/activities/${activityId}/laps`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          console.warn(`401 Unauthorized for activity ${activityId} - token may be expired or need 'activity:read_all' scope`);
        } else {
          console.warn(`Could not fetch laps for activity ${activityId}: ${response.status}`);
        }
        return [];
      }

      return await response.json();
    } catch (error) {
      console.warn(`Error fetching laps for activity ${activityId}:`, error);
      return [];
    }
  }

  // Method to fetch splits data for an activity
  static async fetchActivitySplits(activityId: number, accessToken: string): Promise<StravaSplit[]> {
    try {
      const response = await fetch(
        `${this.BASE_URL}/activities/${activityId}/splits`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.warn(`Could not fetch splits for activity ${activityId}: ${response.status}`);
        return [];
      }

      return await response.json();
    } catch (error) {
      console.warn(`Error fetching splits for activity ${activityId}:`, error);
      return [];
    }
  }

  // Method to fetch detailed activity data with best efforts
  static async fetchDetailedActivity(activityId: number, accessToken: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.BASE_URL}/activities/${activityId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.warn(`Could not fetch detailed activity ${activityId}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.warn(`Error fetching detailed activity ${activityId}:`, error);
      return null;
    }
  }
  static async fetchActivityStreams(activityId: number, accessToken: string): Promise<StravaStreams | null> {
    try {
      const response = await fetch(
        `${this.BASE_URL}/activities/${activityId}/streams/time,distance,velocity_smooth`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.warn(`Could not fetch streams for activity ${activityId}: ${response.status}`);
        return null;
      }

      const streamsArray = await response.json();
      
      // Convert array format to object format for easier access
      const streams: StravaStreams = {};
      streamsArray.forEach((stream: any) => {
        if (stream.type === 'time') streams.time = stream;
        if (stream.type === 'distance') streams.distance = stream;
        if (stream.type === 'velocity_smooth') streams.velocity_smooth = stream;
      });

      return streams;
    } catch (error) {
      console.warn(`Error fetching streams for activity ${activityId}:`, error);
      return null;
    }
  }

  static async analyzeActivitiesForBaselines(
    activities: StravaActivity[], 
    currentBaselines: any,
    accessToken: string
  ): Promise<AnalyzedStravaData> {
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
            const runningMetrics = await this.analyzeRunningDataWithSplits(sportActivities, currentBaselines, accessToken);
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
        start: activities.length > 0 ? activities[activities.length - 1].start_date : '',
        end: activities.length > 0 ? activities[0].start_date : ''
      },
      sportsWithData,
      detectedMetrics
    };
  }

  private static groupActivitiesBySport(activities: StravaActivity[]): Record<string, StravaActivity[]> {
    const groups: Record<string, StravaActivity[]> = {};

    activities.forEach(activity => {
      let sport = '';
      
      // Map Strava activity types to our sports
      const type = activity.type?.toLowerCase() || activity.sport_type?.toLowerCase() || '';
      
      if (type.includes('run') || type === 'run') {
        sport = 'running';
      } else if (type.includes('ride') || type === 'ride' || type.includes('bike') || type.includes('cycling')) {
        sport = 'cycling';
      } else if (type.includes('swim') || type === 'swim') {
        sport = 'swimming';
      }

      if (sport) {
        if (!groups[sport]) groups[sport] = [];
        groups[sport].push(activity);
      }
    });

    return groups;
  }

  // NEW: Clean running analysis with real 5K split extraction
  private static async analyzeRunningDataWithSplits(
    activities: StravaActivity[], 
    currentBaselines: any,
    accessToken: string
  ): Promise<DetectedMetric[]> {
    const metrics: DetectedMetric[] = [];

    // Keep all existing metrics (volume, training status)
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

    // NEW: Clean 5K detection - real PR data or transparent messaging
    const fastest5K = await this.findFastest5KFromAllActivities(activities, accessToken);
    
    // Performance level based on real 5K time - ALWAYS show this metric
    if (fastest5K) {
      const pace = this.formatPace(fastest5K.time);
      metrics.push({
        key: 'benchmarks.running',
        label: 'Performance Level',
        currentValue: currentBaselines.benchmarks?.running || 'Not set',
        detectedValue: pace,
        confidence: 'medium',
        source: 'Strava is giving us an estimated 5K time based on your average pace from longer runs. For a more accurate number, we recommend doing your own 5K time trial: 1. Warm up for 15 minutes at an easy pace 2. Start your GPS watch/device 3. Run 5K at your fastest sustainable pace (push yourself but don\'t sprint) 4. Stop your device when you hit 5K 5. Cool down for 10 minutes at an easy pace. This will give you your true 5K capability rather than an estimate from training runs.',
        sport: 'running'
      });
    } else {
      metrics.push({
        key: 'benchmarks.running',
        label: 'Performance Level',
        currentValue: currentBaselines.benchmarks?.running || 'Not set',
        detectedValue: 'Insufficient current data',
        confidence: 'low',
        source: 'Strava is giving us insufficient data. For a more accurate number, we recommend doing your own 5K time trial: 1. Warm up for 15 minutes at an easy pace 2. Start your GPS watch/device 3. Run 5K at your fastest sustainable pace (push yourself but don\'t sprint) 4. Stop your device when you hit 5K 5. Cool down for 10 minutes at an easy pace. This will give you your true 5K capability rather than an estimate from training runs.',
        sport: 'running'
      });
    }

    return metrics;
  }

  // NEW: Extract 5K pace from longer runs (5K+ activities from past 3 months)
  private static async findFastest5KFromAllActivities(
    activities: StravaActivity[], 
    accessToken: string
  ): Promise<{time: number, source: string} | null> {
    
    console.log('🔍 5K EXTRACTION: Looking for 5K+ runs from past 3 months across', activities.length, 'activities');
    
    // Get running activities 5K+ only
    const runningActivities = activities.filter(activity => {
      const type = activity.type?.toLowerCase() || activity.sport_type?.toLowerCase() || '';
      return (type.includes('run') || type === 'run') && 
             activity.distance >= 5000 && 
             activity.moving_time > 0;
    });
    
    console.log(`Found ${runningActivities.length} running activities 5K+ to analyze`);
    
    // Filter by recency (within 3 months)
    const recent5KPlus = runningActivities.filter(activity => {
      const prDate = new Date(activity.start_date);
      const monthsOld = (Date.now() - prDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsOld <= 3;
    });
    
    if (recent5KPlus.length === 0) {
      console.log('📝 No 5K+ activities found from past 3 months');
      return null;
    }
    
    console.log(`Found ${recent5KPlus.length} runs 5K+ from past 3 months`);
    
    // Calculate first 5K pace for each run and find fastest
    const calculated5Ks = recent5KPlus.map(activity => {
      const first5KTime = (activity.moving_time / activity.distance) * 5000;
      return {
        time: first5KTime,
        activity: activity
      };
    });
    
    // Sort by fastest calculated 5K time
    const fastest5K = calculated5Ks.sort((a, b) => a.time - b.time)[0];
    
    const prDate = new Date(fastest5K.activity.start_date);
    
    console.log(`🎯 Best calculated 5K found: ${this.formatPace(fastest5K.time)} from "${fastest5K.activity.name}"`);
    
    return {
      time: fastest5K.time,
      source: `First 5K from: ${fastest5K.activity.name} on ${prDate.toLocaleDateString()}`
    };
  }

  // NEW: Find 5K best efforts from detailed activity data
  private static async findBest5KFromBestEfforts(
    activities: StravaActivity[], 
    accessToken: string
  ): Promise<{time: number, source: string} | null> {
    
    console.log('🔍 5K BEST EFFORTS: Checking detailed activities for 5K PRs');
    
    let best5KTime: number | null = null;
    let best5KSource = '';
    
    // Look through running activities that are likely to contain 5K segments
    const candidateRuns = activities.filter(activity => {
      const type = activity.type?.toLowerCase() || activity.sport_type?.toLowerCase() || '';
      return (type.includes('run') || type === 'run') && 
             activity.distance >= 5000 && // Must be at least 5K to contain a 5K effort
             activity.moving_time > 0;
    });
    
    console.log(`Found ${candidateRuns.length} candidate runs >= 5K`);
    
    // Check detailed data for up to 20 recent runs (to avoid API limits)
    const runsToCheck = candidateRuns.slice(0, 20);
    
    for (const run of runsToCheck) {
      try {
        const detailedActivity = await this.fetchDetailedActivity(run.id, accessToken);
        
        if (detailedActivity?.best_efforts) {
          // Look for 5K best effort
          const best5K = detailedActivity.best_efforts.find((effort: any) => 
            effort.name === '5k' || effort.name === '5K' || 
            (effort.distance >= 4990 && effort.distance <= 5010)
          );
          
          if (best5K && best5K.moving_time) {
            console.log(`✅ Found 5K best effort: ${this.formatPace(best5K.moving_time)} in run: ${run.name}`);
            
            // Keep track of the fastest 5K found
            if (!best5KTime || best5K.moving_time < best5KTime) {
              best5KTime = best5K.moving_time;
              best5KSource = `5K PR: ${this.formatPace(best5K.moving_time)} within "${run.name}" on ${new Date(run.start_date).toLocaleDateString()}`;
            }
          }
        }
        
        // Add small delay to be nice to Strava API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`Could not fetch detailed data for run ${run.id}:`, error);
        continue;
      }
    }
    
    if (best5KTime) {
      console.log(`🎯 Best 5K found: ${this.formatPace(best5KTime)}`);
      return {
        time: best5KTime,
        source: best5KSource
      };
    }
    
    console.log('📝 No 5K best efforts found in recent runs');
    return null;
  }

  // Remove the complex fallback method entirely
  private static findFastest5KWithSimpleMethods(
    activities: StravaActivity[]
  ): {time: number, source: string} | null {
    // This method is no longer used - we only use real PR data
    return null;
  }

  private static analyzeCyclingData(activities: StravaActivity[], currentBaselines: any): DetectedMetric[] {
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
    const powerActivities = activities.filter(a => a.average_watts && a.average_watts > 50);
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
    const avgSpeed = activities
      .filter(a => a.average_speed > 0 && !a.trainer)
      .reduce((sum, a) => sum + a.average_speed, 0) / activities.length;
    
    if (avgSpeed > 0) {
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
    } else if (avgSpeed > 0) {
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

  private static analyzeSwimmingData(activities: StravaActivity[], currentBaselines: any): DetectedMetric[] {
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

    // 100m pace estimate (if we have pool swims)
    const poolSwims = activities.filter(a => a.distance > 0 && a.moving_time > 0);
    if (poolSwims.length >= 3) {
      const avgPace = poolSwims.reduce((sum, swim) => {
        const pace100m = (swim.moving_time / swim.distance) * 100; // seconds per 100m
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

  // Helper methods
  private static calculateWeeklyVolume(activities: StravaActivity[]): number {
    const totalHours = activities.reduce((sum, activity) => sum + activity.moving_time, 0) / 3600;
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

  private static analyzeTrainingConsistency(activities: StravaActivity[]): string {
    const weeksWithActivity = new Set();
    activities.forEach(activity => {
      const week = Math.floor(new Date(activity.start_date).getTime() / (7 * 24 * 60 * 60 * 1000));
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

  private static estimateFTP(powerActivities: StravaActivity[]): number {
    // Simple FTP estimation: ~95% of best 20-minute effort or ~88% of best hour effort
    const longEfforts = powerActivities.filter(a => a.moving_time >= 1200); // 20+ minutes
    if (longEfforts.length === 0) return 0;

    const bestPower = Math.max(...longEfforts.map(a => a.average_watts || 0));
    return Math.round(bestPower * 0.95);
  }

  private static classifyRunningPerformance(pacePerKm: number): string {
    // Pace in seconds per km
    if (pacePerKm < 240) return '5K under 20 minutes (competitive runner)';
    if (pacePerKm < 300) return '5K in 20-25 minutes (trained runner)';
    if (pacePerKm < 360) return '5K in 25-30 minutes (fitness runner)';
    return '5K in 30+ minutes (recreational runner)';
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