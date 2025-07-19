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

  static async analyzeActivitiesForBaselines(
    activities: StravaActivity[], 
    currentBaselines: any
  ): Promise<AnalyzedStravaData> {
    const detectedMetrics: DetectedMetric[] = [];
    const sportsWithData: string[] = [];

    // Group activities by sport
    const sportGroups = this.groupActivitiesBySport(activities);

    // Analyze each sport
    Object.entries(sportGroups).forEach(([sport, sportActivities]) => {
      if (sportActivities.length >= 3) { // Minimum threshold
        sportsWithData.push(sport);
        
        switch (sport) {
          case 'running':
            detectedMetrics.push(...this.analyzeRunningData(sportActivities, currentBaselines));
            break;
          case 'cycling':
            detectedMetrics.push(...this.analyzeCyclingData(sportActivities, currentBaselines));
            break;
          case 'swimming':
            detectedMetrics.push(...this.analyzeSwimmingData(sportActivities, currentBaselines));
            break;
        }
      }
    });

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