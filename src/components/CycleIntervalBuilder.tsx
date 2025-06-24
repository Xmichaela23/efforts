import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';

export interface CycleInterval {
  id: string;
  targetWatts?: number;
  targetFTP?: number;
  targetCadence?: number;
  duration: string;
  recoveryWatts?: number;
  recoveryTime: string;
  repeatCount: number;
}

interface CycleIntervalBuilderProps {
  intervals: CycleInterval[];
  onChange: (intervals: CycleInterval[]) => void;
  isMetric: boolean;
}

export default function CycleIntervalBuilder({ intervals, onChange, isMetric }: CycleIntervalBuilderProps) {
  const addInterval = () => {
    const newInterval: CycleInterval = {
      id: Date.now().toString(),
      duration: '',
      recoveryTime: '',
      repeatCount: 1
    };
    onChange([...intervals, newInterval]);
  };

  const updateInterval = (id: string, updates: Partial<CycleInterval>) => {
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

  const formatTime = (timeStr: string): string => {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [min, sec] = timeStr.split(':');
    const totalSec = parseInt(min) * 60 + parseInt(sec);
    return `${Math.floor(totalSec/60)} min`;
  };

  const generatePreview = (interval: CycleInterval) => {
    const target = interval.targetFTP ? `@ ${interval.targetFTP}% FTP` : 
                  interval.targetWatts ? `@ ${interval.targetWatts}W` : '';
    const cadence = interval.targetCadence ? ` @ ${interval.targetCadence} rpm` : '';
    const recovery = interval.recoveryWatts ? `@ ${interval.recoveryWatts}W` : '@ 50% FTP';
    
    const workTime = formatTime(interval.duration) || interval.duration;
    const recTime = formatTime(interval.recoveryTime) || interval.recoveryTime;
    
    return `${interval.repeatCount} x (${workTime} ${target}${cadence} w/ ${recTime} ${recovery} recovery)`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Cycling Intervals
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
                <Label>Target Watts</Label>
                <Input
                  type="number"
                  placeholder="250"
                  value={interval.targetWatts || ''}
                  onChange={(e) => updateInterval(interval.id, { targetWatts: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label>Target % FTP</Label>
                <Input
                  type="number"
                  placeholder="90"
                  value={interval.targetFTP || ''}
                  onChange={(e) => updateInterval(interval.id, { targetFTP: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label>Target Cadence</Label>
                <Input
                  type="number"
                  placeholder="85"
                  value={interval.targetCadence || ''}
                  onChange={(e) => updateInterval(interval.id, { targetCadence: parseInt(e.target.value) || undefined })}
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
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Duration (mm:ss)</Label>
                <Input
                  placeholder="5:00"
                  value={interval.duration}
                  onChange={(e) => updateInterval(interval.id, { duration: e.target.value })}
                />
              </div>
              <div>
                <Label>Recovery Time (mm:ss)</Label>
                <Input
                  placeholder="2:00"
                  value={interval.recoveryTime}
                  onChange={(e) => updateInterval(interval.id, { recoveryTime: e.target.value })}
                />
              </div>
              <div>
                <Label>Recovery Watts</Label>
                <Input
                  type="number"
                  placeholder="125"
                  value={interval.recoveryWatts || ''}
                  onChange={(e) => updateInterval(interval.id, { recoveryWatts: parseInt(e.target.value) || undefined })}
                />
              </div>
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