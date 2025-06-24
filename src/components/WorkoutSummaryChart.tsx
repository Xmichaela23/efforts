import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Interval {
  duration?: string;
  distance?: string;
  recovery?: string;
  recoveryTime?: string;
  recoveryDistance?: string;
  repeats?: number;
}

interface WorkoutSummaryChartProps {
  intervals: Interval[];
  workoutType: string;
}

function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return parseInt(timeStr) || 0;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function WorkoutSummaryChart({ intervals, workoutType }: WorkoutSummaryChartProps) {
  if (!intervals.length) return null;

  const chartData = intervals.map((interval, index) => {
    const workDuration = parseTimeToSeconds(interval.duration || '0');
    const recoveryDuration = parseTimeToSeconds(interval.recovery || interval.recoveryTime || '0');
    const repeats = interval.repeats || 1;
    
    return {
      index,
      workDuration,
      recoveryDuration,
      repeats,
      totalDuration: (workDuration + recoveryDuration) * repeats
    };
  });

  const totalWorkoutTime = chartData.reduce((sum, item) => sum + item.totalDuration, 0);
  const maxDuration = Math.max(...chartData.map(item => item.totalDuration));

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Workout Timeline</span>
          <Badge variant="outline">
            Total: {formatTime(totalWorkoutTime)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {chartData.map((item, index) => {
            const workWidth = maxDuration > 0 ? (item.workDuration * item.repeats / maxDuration) * 100 : 0;
            const recoveryWidth = maxDuration > 0 ? (item.recoveryDuration * item.repeats / maxDuration) * 100 : 0;
            
            return (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Interval {index + 1}</span>
                  <span className="text-muted-foreground">
                    {formatTime(item.totalDuration)}
                    {item.repeats > 1 && ` (${item.repeats}x)`}
                  </span>
                </div>
                <div className="flex h-6 bg-muted rounded overflow-hidden">
                  {/* Work portion */}
                  <div 
                    className="bg-blue-500 flex items-center justify-center text-xs text-white font-medium"
                    style={{ width: `${workWidth}%` }}
                  >
                    {workWidth > 15 && 'Work'}
                  </div>
                  {/* Recovery portion */}
                  {recoveryWidth > 0 && (
                    <div 
                      className="bg-green-400 flex items-center justify-center text-xs text-white font-medium"
                      style={{ width: `${recoveryWidth}%` }}
                    >
                      {recoveryWidth > 15 && 'Recovery'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span>Work Intervals</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-400 rounded"></div>
            <span>Recovery</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}