import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';

export interface RunInterval {
  id: string;
  targetPace?: string;
  targetHR?: string;
  targetPower?: number;
  durationType: 'time' | 'distance';
  duration: string;
  recoveryType: 'time' | 'distance';
  recovery: string;
  recoveryPace?: string;
  repeatCount: number;
}

interface RunIntervalBuilderProps {
  intervals: RunInterval[];
  onChange: (intervals: RunInterval[]) => void;
  isMetric: boolean;
}

function convertDistance(value: number, toMetric: boolean): number {
  return toMetric ? Math.round(value * 1.609344) : Math.round(value / 1.609344);
}

function convertPace(pace: string, toMetric: boolean): string {
  if (!pace || !pace.includes(':')) return pace;
  const [min, sec] = pace.split(':').map(Number);
  const totalSeconds = min * 60 + sec;
  const converted = toMetric ? totalSeconds / 1.609344 : totalSeconds * 1.609344;
  const newMin = Math.floor(converted / 60);
  const newSec = Math.round(converted % 60);
  return `${newMin}:${newSec.toString().padStart(2, '0')}`;
}

export default function RunIntervalBuilder({ intervals, onChange, isMetric }: RunIntervalBuilderProps) {
  const addInterval = () => {
    const newInterval: RunInterval = {
      id: Date.now().toString(),
      durationType: 'distance',
      duration: '',
      recoveryType: 'distance',
      recovery: '',
      repeatCount: 1
    };
    onChange([...intervals, newInterval]);
  };

  const updateInterval = (id: string, updates: Partial<RunInterval>) => {
    onChange(intervals.map(interval => 
      interval.id === id ? { ...interval, ...updates } : interval
    ));
  };

  const duplicateInterval = (id: string) => {
    const interval = intervals.find(i => i.id === id);
    if (interval) {
      const duplicate = { ...interval, id: Date.now().toString() };
      onChange([...intervals, duplicate]);
    }
  };

  const deleteInterval = (id: string) => {
    onChange(intervals.filter(interval => interval.id !== id));
  };

  const generatePreview = (interval: RunInterval) => {
    const target = interval.targetPace ? `@ ${interval.targetPace}/${isMetric ? 'km' : 'mi'}` : 
                  interval.targetHR ? `@ ${interval.targetHR} bpm` :
                  interval.targetPower ? `@ ${interval.targetPower}W` : '';
    
    const distanceUnit = isMetric ? 'm' : 'yd';
    const work = interval.durationType === 'distance' ? `${interval.duration}${distanceUnit}` : interval.duration;
    const rec = interval.recoveryType === 'distance' ? `${interval.recovery}${distanceUnit}` : interval.recovery;
    const recPace = interval.recoveryPace ? ` @ ${interval.recoveryPace}/${isMetric ? 'km' : 'mi'}` : '';
    
    return `${interval.repeatCount} x (${work} ${target} w/ ${rec}${recPace} recovery)`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Running Intervals
          <Button onClick={addInterval} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Interval
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {intervals.map((interval, index) => (
          <Card key={interval.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Interval {index + 1}</h4>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => duplicateInterval(interval.id)} size="sm" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button onClick={() => deleteInterval(interval.id)} size="sm" variant="outline">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label>Target Pace (mm:ss)</Label>
                <Input
                  placeholder="7:00"
                  value={interval.targetPace || ''}
                  onChange={(e) => updateInterval(interval.id, { targetPace: e.target.value })}
                />
              </div>
              <div>
                <Label>Target HR</Label>
                <Input
                  placeholder="150-160"
                  value={interval.targetHR || ''}
                  onChange={(e) => updateInterval(interval.id, { targetHR: e.target.value })}
                />
              </div>
              <div>
                <Label>Target Power</Label>
                <Input
                  type="number"
                  placeholder="250"
                  value={interval.targetPower || ''}
                  onChange={(e) => updateInterval(interval.id, { targetPower: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label>Repeat Count</Label>
                <Input
                  type="number"
                  min="1"
                  value={interval.repeatCount}
                  onChange={(e) => updateInterval(interval.id, { repeatCount: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label>Work Type</Label>
                <Select value={interval.durationType} onValueChange={(value: 'time' | 'distance') => 
                  updateInterval(interval.id, { durationType: value })
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="distance">Distance</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  {interval.durationType === 'distance' 
                    ? `Distance (${isMetric ? 'm' : 'yd'})` 
                    : 'Time (mm:ss)'
                  }
                </Label>
                <Input
                  placeholder={interval.durationType === 'time' ? '5:00' : '800'}
                  value={interval.duration}
                  onChange={(e) => updateInterval(interval.id, { duration: e.target.value })}
                />
              </div>
              <div>
                <Label>Recovery Type</Label>
                <Select value={interval.recoveryType} onValueChange={(value: 'time' | 'distance') => 
                  updateInterval(interval.id, { recoveryType: value })
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="distance">Distance</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  {interval.recoveryType === 'distance' 
                    ? `Recovery (${isMetric ? 'm' : 'yd'})` 
                    : 'Recovery (mm:ss)'
                  }
                </Label>
                <Input
                  placeholder={interval.recoveryType === 'time' ? '2:00' : '200'}
                  value={interval.recovery}
                  onChange={(e) => updateInterval(interval.id, { recovery: e.target.value })}
                />
              </div>
            </div>
            
            <div className="mb-2">
              <Label>Recovery Pace (mm:ss)</Label>
              <Input
                placeholder="8:30"
                value={interval.recoveryPace || ''}
                onChange={(e) => updateInterval(interval.id, { recoveryPace: e.target.value })}
              />
            </div>
            
            <div className="bg-muted p-3 rounded text-sm">
              <strong>Preview:</strong> {generatePreview(interval)}
            </div>
          </Card>
        ))}
        
        {intervals.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No intervals added yet. Click "Add Interval" to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}