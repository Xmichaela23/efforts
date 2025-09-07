import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, Zap, Heart, TrendingUp, MapPin, Droplets } from 'lucide-react';

interface WorkoutMetricsProps {
  workout: {
    type?: string;
    distance?: number;
    duration?: number;
    elapsed_time?: number;
    moving_time?: number;
    avg_speed?: number;
    max_speed?: number;
    avg_pace?: number;
    avg_heart_rate?: number;
    max_heart_rate?: number;
    hrv?: number;
    avg_power?: number;
    max_power?: number;
    normalized_power?: number;
    avg_cadence?: number;
    max_cadence?: number;
    elevation_gain?: number;
    elevation_loss?: number;
    calories?: number;
    tss?: number;
    intensity_factor?: number;
    // Swim specific
    strokes?: number;
    pool_length?: number;
    // Run specific
    avg_running_cadence?: number;
    max_running_cadence?: number;
    // Bike specific
    avg_bike_cadence?: number;
    max_bike_cadence?: number;
  };
}

const WorkoutMetrics: React.FC<WorkoutMetricsProps> = ({ workout }) => {
  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (pace?: number) => {
    if (!pace) return 'N/A';
    const minutes = Math.floor(pace);
    const seconds = Math.floor((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatSpeed = (speed?: number) => {
    if (!speed) return 'N/A';
    return `${speed.toFixed(1)} km/h`;
  };

  const formatPower = (power?: number) => {
    if (!power) return 'N/A';
    return `${Math.round(power)}W`;
  };

  const formatCadence = (cadence?: number) => {
    if (!cadence) return 'N/A';
    return `${Math.round(cadence)} rpm`;
  };

  const formatElevation = (elevation?: number) => {
    if (!elevation) return 'N/A';
    return `${Math.round(elevation)}m`;
  };

  const getWorkoutType = () => {
    return workout.type || 'ride';
  };

  const isBike = getWorkoutType() === 'ride' || getWorkoutType() === 'bike';
  const isRun = getWorkoutType() === 'run';
  const isSwim = getWorkoutType() === 'swim';

  return (
    <div className="space-y-6">
      {/* Basic Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distance</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workout.distance?.toFixed(2) || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">km</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(workout.duration || workout.elapsed_time)}</div>
            <p className="text-xs text-muted-foreground">Moving: {formatTime(workout.moving_time)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Heart Rate</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workout.avg_heart_rate || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">Max: {workout.max_heart_rate || 'N/A'} bpm</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calories</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workout.calories || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">kcal</p>
          </CardContent>
        </Card>
      </div>

      {/* Sport-Specific Metrics */}
      {isBike && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Power</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPower(workout.avg_power)}</div>
              <p className="text-xs text-muted-foreground">Max: {formatPower(workout.max_power)}</p>
              {workout.normalized_power && (
                <p className="text-xs text-muted-foreground">NP: {formatPower(workout.normalized_power)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatSpeed(workout.avg_speed)}</div>
              <p className="text-xs text-muted-foreground">Max: {formatSpeed(workout.max_speed)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cadence</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCadence(
                workout.avg_cadence ||
                // fallback to nested metrics
                (workout as any).metrics?.avg_cadence ||
                workout.avg_bike_cadence
              )}</div>
              <p className="text-xs text-muted-foreground">Max: {formatCadence(
                workout.max_cadence ||
                (workout as any).metrics?.max_cadence ||
                workout.max_bike_cadence
              )}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Elevation</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatElevation(workout.elevation_gain)}</div>
              <p className="text-xs text-muted-foreground">Loss: {formatElevation(workout.elevation_loss)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isRun && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pace</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPace(workout.avg_pace)}</div>
              <p className="text-xs text-muted-foreground">per km</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatSpeed(workout.avg_speed)}</div>
              <p className="text-xs text-muted-foreground">Max: {formatSpeed(workout.max_speed)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cadence</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCadence(
                workout.avg_running_cadence ||
                workout.avg_cadence ||
                (workout as any).metrics?.avg_cadence
              )}</div>
              <p className="text-xs text-muted-foreground">Max: {formatCadence(
                workout.max_running_cadence ||
                workout.max_cadence ||
                (workout as any).metrics?.max_cadence
              )}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Elevation</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatElevation(workout.elevation_gain)}</div>
              <p className="text-xs text-muted-foreground">Loss: {formatElevation(workout.elevation_loss)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isSwim && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pace</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPace(workout.avg_pace)}</div>
              <p className="text-xs text-muted-foreground">per 100m</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Strokes</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{workout.strokes || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">total strokes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pool Length</CardTitle>
              <Droplets className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{workout.pool_length || 'N/A'}</div>
              <p className="text-xs text-muted-foreground">meters</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Speed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatSpeed(workout.avg_speed)}</div>
              <p className="text-xs text-muted-foreground">Max: {formatSpeed(workout.max_speed)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Training Load Metrics */}
      {workout.intensity_factor && (
        <div className="grid grid-cols-1 gap-6">
          <div>
            <div className="text-2xl font-bold">{workout.intensity_factor}</div>
            <p className="text-xs text-muted-foreground">IF</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutMetrics;