import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

export interface WorkoutInterval {
  id: string;
  name: string;
  duration: number;
  durationType: 'time' | 'distance';
  intensityType: 'heartRate' | 'power' | 'pace' | 'rpe';
  intensityMin: number;
  intensityMax: number;
  description?: string;
}

interface WorkoutIntervalsProps {
  intervals: WorkoutInterval[];
  onChange: (intervals: WorkoutInterval[]) => void;
}

const WorkoutIntervals: React.FC<WorkoutIntervalsProps> = ({ intervals, onChange }) => {
  const [newInterval, setNewInterval] = useState<Partial<WorkoutInterval>>({
    name: '',
    duration: 0,
    durationType: 'time',
    intensityType: 'heartRate',
    intensityMin: 0,
    intensityMax: 0,
  });

  const addInterval = () => {
    if (newInterval.name && newInterval.duration && newInterval.intensityMin && newInterval.intensityMax) {
      const interval: WorkoutInterval = {
        id: Date.now().toString(),
        name: newInterval.name,
        duration: newInterval.duration,
        durationType: newInterval.durationType || 'time',
        intensityType: newInterval.intensityType || 'heartRate',
        intensityMin: newInterval.intensityMin,
        intensityMax: newInterval.intensityMax,
        description: newInterval.description,
      };
      onChange([...intervals, interval]);
      setNewInterval({
        name: '',
        duration: 0,
        durationType: 'time',
        intensityType: 'heartRate',
        intensityMin: 0,
        intensityMax: 0,
      });
    }
  };

  const removeInterval = (id: string) => {
    onChange(intervals.filter(interval => interval.id !== id));
  };

  const getIntensityUnit = (type: string) => {
    switch (type) {
      case 'heartRate': return 'BPM';
      case 'power': return 'W';
      case 'pace': return 'min/km';
      case 'rpe': return 'RPE';
      default: return '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout Intervals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {intervals.map((interval) => (
          <div key={interval.id} className="p-3 border rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium">{interval.name}</h4>
                <p className="text-sm text-gray-600">
                  {interval.duration} {interval.durationType === 'time' ? 'min' : 'km'} | 
                  {interval.intensityMin}-{interval.intensityMax} {getIntensityUnit(interval.intensityType)}
                </p>
                {interval.description && (
                  <p className="text-sm text-gray-500 mt-1">{interval.description}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeInterval(interval.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">Add Interval</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={newInterval.name || ''}
                onChange={(e) => setNewInterval(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Warm up"
              />
            </div>
            <div>
              <Label>Duration</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={newInterval.duration || ''}
                  onChange={(e) => setNewInterval(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                />
                <Select
                  value={newInterval.durationType}
                  onValueChange={(value: 'time' | 'distance') => setNewInterval(prev => ({ ...prev, durationType: value }))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">min</SelectItem>
                    <SelectItem value="distance">km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Intensity Type</Label>
              <Select
                value={newInterval.intensityType}
                onValueChange={(value: any) => setNewInterval(prev => ({ ...prev, intensityType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="heartRate">Heart Rate</SelectItem>
                  <SelectItem value="power">Power</SelectItem>
                  <SelectItem value="pace">Pace</SelectItem>
                  <SelectItem value="rpe">RPE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Intensity Range</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={newInterval.intensityMin || ''}
                  onChange={(e) => setNewInterval(prev => ({ ...prev, intensityMin: parseInt(e.target.value) || 0 }))}
                  placeholder="Min"
                />
                <Input
                  type="number"
                  value={newInterval.intensityMax || ''}
                  onChange={(e) => setNewInterval(prev => ({ ...prev, intensityMax: parseInt(e.target.value) || 0 }))}
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
          <Button onClick={addInterval} className="mt-3" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Interval
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutIntervals;