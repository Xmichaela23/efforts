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

// NEW: Interface for splits data
export interface StravaSplit {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  pace_zone?: number;
}

// NEW: Interface for activity streams data
export interface StravaStreams {
  time?: { data: number[] };
  distance?: { data: number[] };
  velocity_smooth?: { data: number[] };
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

      return await response.json();
    } catch (error) {
      console.error('Error fetching Strava activities:', error);
      throw error;
    }
  }

  static async fetchActivityLaps(activityId: number, accessToken: string): Promise<StravaLap[]> {
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

  // NEW: Method to fetch splits data for an activity
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

  // NEW: Method to fetch activity streams data
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

  // NEW: Enhanced method that includes split analysis with access token
  static async analyzeActivitiesForBaselinesWithSplits(
    activities: StravaActivity[], 
    currentBaselines: any,
    accessToken: string
  ): Promise<AnalyzedStravaData> {
    // This method is now redundant - the main method includes split analysis
    return this.analyzeActivitiesForBaselines(activities, currentBaselines, accessToken);
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

  private static analyzeRunningData(activities: StravaActivity[], currentBaselines: any): DetectedMetric[] {
    const metrics: DetectedMetric[] = [];

    // Weekly volume calculation
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

    // Training status based on consistency
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

    // Best recent performances (race efforts)
    const raceEfforts = this.findRaceEfforts(activities);
    
    // 5K estimate
    const best5K = raceEfforts.find(effort => effort.distance >= 4800 && effort.distance <= 5200);
    if (best5K) {
      const pace = this.formatPace(best5K.time);
      metrics.push({
        key: 'performanceNumbers.fiveK',
        label: '5K Time',
        currentValue: currentBaselines.performanceNumbers?.fiveK || 'Not set',
        detectedValue: pace,
        confidence: 'high',
        source: `${new Date(best5K.date).toLocaleDateString()}`,
        sport: 'running'
      });
    }

    // 10K estimate
    const best10K = raceEfforts.find(effort => effort.distance >= 9800 && effort.distance <= 10500);
    if (best10K) {
      const pace = this.formatPace(best10K.time);
      metrics.push({
        key: 'performanceNumbers.tenK',
        label: '10K Time',
        currentValue: currentBaselines.performanceNumbers?.tenK || 'Not set',
        detectedValue: pace,
        confidence: 'high',
        source: `${new Date(best10K.date).toLocaleDateString()}`,
        sport: 'running'
      });
    }

    // Performance level based on pace
    if (best5K) {
      const performanceLevel = this.classifyRunningPerformance(best5K.time / best5K.distance * 1000);
      metrics.push({
        key: 'benchmarks.running',
        label: 'Performance Level',
        currentValue: currentBaselines.benchmarks?.running || 'Not set',
        detectedValue: performanceLevel,
        confidence: 'medium',
        source: 'Based on 5K pace',
        sport: 'running'
      });
    }

    return metrics;
  }

  // NEW: Enhanced running analysis that includes splits
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

    // NEW: Enhanced performance analysis with splits
    const allEfforts = await this.findAllRunningEffortsWithSplits(activities, accessToken);
    
    // 5K analysis - take fastest efforts and average them
    const fiveKEfforts = allEfforts.filter(effort => 
      effort.distance >= 4800 && effort.distance <= 5200
    );

    if (fiveKEfforts.length > 0) {
      const fastestEfforts = this.getFastestEfforts(fiveKEfforts, 3); // Top 3 fastest
      
      if (fastestEfforts.length > 0) {
        const averageTime = fastestEfforts.reduce((sum, effort) => sum + effort.time, 0) / fastestEfforts.length;
        const pace = this.formatPace(averageTime);
        
        metrics.push({
          key: 'performanceNumbers.fiveK',
          label: '5K Time',
          currentValue: currentBaselines.performanceNumbers?.fiveK || 'Not set',
          detectedValue: `${pace} (average of ${fastestEfforts.length} fastest efforts)`,
          confidence: 'high',
          source: `Top ${fastestEfforts.length} efforts in last 90 days`,
          sport: 'running'
        });

        // Performance level based on fastest 5K efforts
        const performanceLevel = this.classifyRunningPerformance(averageTime / 5000 * 1000);
        metrics.push({
          key: 'benchmarks.running',
          label: 'Performance Level',
          currentValue: currentBaselines.benchmarks?.running || 'Not set',
          detectedValue: performanceLevel,
          confidence: 'medium',
          source: 'Based on fastest 5K efforts',
          sport: 'running'
        });
      }
    }

    // 10K analysis - take fastest efforts and average them
    const tenKEfforts = allEfforts.filter(effort => 
      effort.distance >= 9800 && effort.distance <= 10500
    );

    if (tenKEfforts.length > 0) {
      const fastestEfforts = this.getFastestEfforts(tenKEfforts, 3); // Top 3 fastest
      
      if (fastestEfforts.length > 0) {
        const averageTime = fastestEfforts.reduce((sum, effort) => sum + effort.time, 0) / fastestEfforts.length;
        const pace = this.formatPace(averageTime);
        
        metrics.push({
          key: 'performanceNumbers.tenK',
          label: '10K Time',
          currentValue: currentBaselines.performanceNumbers?.tenK || 'Not set',
          detectedValue: `${pace} (average of ${fastestEfforts.length} fastest efforts)`,
          confidence: 'high',
          source: `Top ${fastestEfforts.length} efforts in last 90 days`,
          sport: 'running'
        });
      }
    }

    return metrics;
  }

  // MODIFIED: Comprehensive 5K detection using intelligent analysis of basic activity data
  private static async findAllRunningEffortsWithSplits(
    activities: StravaActivity[], 
    accessToken: string
  ): Promise<Array<{distance: number, time: number, date: string, source: string}>> {
    const allEfforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    // 1. Add original race efforts (includes 10K detection) 
    const originalEfforts = this.findRaceEfforts(activities);
    originalEfforts.forEach(effort => {
      allEfforts.push({
        distance: effort.distance,
        time: effort.time,
        date: effort.date,
        source: 'original-method'
      });
    });

    // 2. Direct 5K activities (improved detection)
    const direct5KEfforts = this.findDirect5KEfforts(activities);
    allEfforts.push(...direct5KEfforts);

    // 3. Estimated 5K efforts from longer activities
    const estimated5KEfforts = this.estimate5KFromLongerActivities(activities);
    allEfforts.push(...estimated5KEfforts);

    // 4. Name-based detection (parkrun, 5K race, tempo, etc.)
    const nameBased5KEfforts = this.find5KByActivityName(activities);
    allEfforts.push(...nameBased5KEfforts);

    // 5. Race-pattern detection (weekend activities likely to be races)
    const racePattern5KEfforts = this.find5KByRacePatterns(activities);
    allEfforts.push(...racePattern5KEfforts);

    // 6. Threshold pace detection (fast sustained efforts)
    const thresholdEfforts = this.find5KByThresholdPace(activities);
    allEfforts.push(...thresholdEfforts);

    console.log(`Comprehensive detection found ${allEfforts.length} total efforts across all methods`);
    return allEfforts;
  }

  // NEW: Method 1 - Find direct 5K activities (improved)
  private static findDirect5KEfforts(
    activities: StravaActivity[]
  ): Array<{distance: number, time: number, date: string, source: string}> {
    return activities
      .filter(activity => 
        activity.distance >= 4800 && 
        activity.distance <= 5500 && // Slightly more lenient
        activity.moving_time > 0 &&
        activity.moving_time < 2400 // Under 40 minutes (reasonable 5K time)
      )
      .map(activity => ({
        distance: activity.distance,
        time: activity.moving_time,
        date: activity.start_date,
        source: 'direct-5K'
      }));
  }

  // NEW: Method 2 - Estimate 5K pace from longer activities
  private static estimate5KFromLongerActivities(
    activities: StravaActivity[]
  ): Array<{distance: number, time: number, date: string, source: string}> {
    const efforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    activities.forEach(activity => {
      if (activity.distance > 5500 && activity.moving_time > 0) {
        const averagePacePerKm = activity.moving_time / (activity.distance / 1000);
        
        // If this looks like a sustained effort (not easy training pace)
        if (this.isPotentialRaceEffort(activity, averagePacePerKm)) {
          // Estimate 5K time based on distance and pace
          let estimated5KTime;
          
          if (activity.distance >= 9500 && activity.distance <= 10500) {
            // 10K - estimate 5K as first half with slight negative split
            estimated5KTime = (activity.moving_time / 2) * 0.98; // Assume slight positive split
          } else if (activity.distance >= 6000 && activity.distance <= 8000) {
            // 6-8K tempo runs - estimate 5K pace
            const kmPace = averagePacePerKm;
            estimated5KTime = kmPace * 5 * 0.97; // Slightly faster than tempo pace
          } else if (activity.distance >= 15000) {
            // Half marathon or longer - estimate 5K pace (much faster)
            const estimatedKmPace = averagePacePerKm * 0.88; // ~12% faster for 5K
            estimated5KTime = estimatedKmPace * 5;
          }

          if (estimated5KTime && estimated5KTime > 900 && estimated5KTime < 2400) { // 15-40 minutes
            efforts.push({
              distance: 5000,
              time: estimated5KTime,
              date: activity.start_date,
              source: `estimated-from-${Math.round(activity.distance)}m`
            });
          }
        }
      }
    });

    return efforts;
  }

  // NEW: Method 3 - Activity name analysis
  private static find5KByActivityName(
    activities: StravaActivity[]
  ): Array<{distance: number, time: number, date: string, source: string}> {
    const efforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    const fiveKKeywords = [
      '5k', '5K', 'parkrun', 'park run', '5 k', '5-k',
      'tempo 5', '5km', '5KM', 'five k', 'fivek'
    ];

    activities.forEach(activity => {
      const name = activity.name?.toLowerCase() || '';
      const hasFiveKKeyword = fiveKKeywords.some(keyword => 
        name.includes(keyword.toLowerCase())
      );

      if (hasFiveKKeyword && activity.moving_time > 0) {
        // If it's explicitly named as 5K-related, trust it more
        if (activity.distance >= 4000 && activity.distance <= 6000) {
          efforts.push({
            distance: activity.distance,
            time: activity.moving_time,
            date: activity.start_date,
            source: 'name-based-5K'
          });
        }
      }
    });

    return efforts;
  }

  // NEW: Method 4 - Race pattern detection (weekends, fast efforts)
  private static find5KByRacePatterns(
    activities: StravaActivity[]
  ): Array<{distance: number, time: number, date: string, source: string}> {
    const efforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    activities.forEach(activity => {
      const activityDate = new Date(activity.start_date);
      const dayOfWeek = activityDate.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Look for weekend activities that look like races
      if (isWeekend && 
          activity.distance >= 4500 && 
          activity.distance <= 8000 && 
          activity.moving_time > 0) {
        
        const averagePacePerKm = activity.moving_time / (activity.distance / 1000);
        
        // If it's a fast sustained effort on weekend
        if (this.isPotentialRaceEffort(activity, averagePacePerKm)) {
          // If it's close to 5K distance, use it directly
          if (activity.distance >= 4500 && activity.distance <= 5500) {
            efforts.push({
              distance: activity.distance,
              time: activity.moving_time,
              date: activity.start_date,
              source: 'weekend-race-5K'
            });
          }
          // If it's longer, estimate the 5K portion
          else if (activity.distance > 5500) {
            const estimated5KTime = (activity.moving_time / activity.distance) * 5000 * 0.97;
            if (estimated5KTime > 900 && estimated5KTime < 2400) {
              efforts.push({
                distance: 5000,
                time: estimated5KTime,
                date: activity.start_date,
                source: 'weekend-race-estimated'
              });
            }
          }
        }
      }
    });

    return efforts;
  }

  // NEW: Method 5 - Threshold pace detection
  private static find5KByThresholdPace(
    activities: StravaActivity[]
  ): Array<{distance: number, time: number, date: string, source: string}> {
    const efforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    // First, calculate this runner's typical easy pace
    const easyPaceBaseline = this.calculateEasyPaceBaseline(activities);
    
    if (!easyPaceBaseline) return efforts;

    activities.forEach(activity => {
      if (activity.distance >= 4000 && 
          activity.distance <= 8000 && 
          activity.moving_time > 0) {
        
        const averagePacePerKm = activity.moving_time / (activity.distance / 1000);
        const paceRatio = averagePacePerKm / easyPaceBaseline;
        
        // If this pace is significantly faster than easy pace (threshold effort)
        if (paceRatio >= 0.75 && paceRatio <= 0.95) { // 25-5% faster than easy
          
          // Extract/estimate 5K effort
          if (activity.distance >= 4800 && activity.distance <= 5200) {
            efforts.push({
              distance: activity.distance,
              time: activity.moving_time,
              date: activity.start_date,
              source: 'threshold-pace-5K'
            });
          } else if (activity.distance > 5200) {
            // Estimate 5K from threshold effort
            const estimated5KTime = averagePacePerKm * 5;
            if (estimated5KTime > 900 && estimated5KTime < 2400) {
              efforts.push({
                distance: 5000,
                time: estimated5KTime,
                date: activity.start_date,
                source: 'threshold-estimated'
              });
            }
          }
        }
      }
    });

    return efforts;
  }

  // NEW: Helper - Very lenient filtering to catch all potential efforts
  private static isPotentialRaceEffort(activity: StravaActivity, averagePacePerKm: number): boolean {
    // Cast a very wide net - let the "fastest efforts" sorting do the filtering
    
    // Only exclude obviously impossible paces
    const notTooSlow = averagePacePerKm <= 900; // Faster than 15-minute/km (walking pace)
    const notTooFast = averagePacePerKm >= 150; // Slower than 2:30/km (elite marathon pace)
    
    // Reasonable duration for any running effort
    const reasonableDuration = activity.moving_time >= 300 && activity.moving_time <= 7200; // 5 minutes to 2 hours
    
    // Must be a meaningful distance
    const reasonableDistance = activity.distance >= 1000; // At least 1K
    
    return notTooSlow && notTooFast && reasonableDuration && reasonableDistance;
  }

  // NEW: Helper - Calculate easy pace baseline
  private static calculateEasyPaceBaseline(activities: StravaActivity[]): number | null {
    const easyRuns = activities
      .filter(activity => 
        activity.distance >= 3000 && // At least 3K
        activity.distance <= 15000 && // Not ultra long
        activity.moving_time > 0
      )
      .map(activity => activity.moving_time / (activity.distance / 1000))
      .sort((a, b) => b - a); // Sort slowest to fastest
    
    if (easyRuns.length < 5) return null;
    
    // Take the slower 60% of runs as "easy pace" baseline
    const easyPaceRuns = easyRuns.slice(0, Math.floor(easyRuns.length * 0.6));
    return easyPaceRuns.reduce((sum, pace) => sum + pace, 0) / easyPaceRuns.length;
  }

  // NEW: Extract 5K and 10K efforts from kilometer splits data
  private static findSplitEffortsFromKmSplits(
    splits: StravaSplit[], 
    activity: StravaActivity
  ): Array<{distance: number, time: number, date: string, source: string}> {
    const efforts: Array<{distance: number, time: number, date: string, source: string}> = [];

    if (splits.length === 0) return efforts;

    // Strava metric splits are typically 1km each
    // So split 5 would be the 5km time, split 10 would be the 10km time
    
    // Look for 5K split (5th kilometer split)
    if (splits.length >= 5) {
      const fiveKmSplit = splits[4]; // 5th split (0-indexed)
      if (fiveKmSplit && fiveKmSplit.moving_time > 0) {
        // Calculate cumulative time for first 5 splits
        const cumulativeTime = splits.slice(0, 5).reduce((sum, split) => sum + split.moving_time, 0);
        efforts.push({
          distance: 5000, // exactly 5km
          time: cumulativeTime,
          date: activity.start_date,
          source: 'split'
        });
      }
    }

    // Look for 10K split (10th kilometer split)
    if (splits.length >= 10) {
      const tenKmSplit = splits[9]; // 10th split (0-indexed)
      if (tenKmSplit && tenKmSplit.moving_time > 0) {
        // Calculate cumulative time for first 10 splits
        const cumulativeTime = splits.slice(0, 10).reduce((sum, split) => sum + split.moving_time, 0);
        efforts.push({
          distance: 10000, // exactly 10km
          time: cumulativeTime,
          date: activity.start_date,
          source: 'split'
        });
      }
    }

    return efforts;
  }

  // NEW: Get fastest efforts by pace (simple approach)
  private static getFastestEfforts(
    efforts: Array<{distance: number, time: number, date: string, source: string}>,
    count: number
  ): Array<{distance: number, time: number, date: string, source: string}> {
    if (efforts.length === 0) return [];

    // Sort by pace (fastest first)
    const sortedByPace = efforts.sort((a, b) => (a.time / a.distance) - (b.time / b.distance));
    
    // Take the fastest efforts up to the requested count
    return sortedByPace.slice(0, Math.min(count, efforts.length));
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

  private static findRaceEfforts(activities: StravaActivity[]): Array<{distance: number, time: number, date: string}> {
    return activities
      .filter(activity => activity.distance > 1000 && activity.moving_time > 0) // At least 1km
      .map(activity => ({
        distance: activity.distance,
        time: activity.moving_time,
        date: activity.start_date
      }))
      .sort((a, b) => (a.time / a.distance) - (b.time / b.distance)) // Sort by pace
      .slice(0, 10); // Top 10 efforts
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