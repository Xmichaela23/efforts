import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Copy, Trash2, GripVertical } from 'lucide-react';

export interface SwimInterval {
  id: string;
  distance: string;
  targetRPE?: number;
  equipment: string;
  recoveryType: 'time' | 'distance';
  recovery: string;
  repeatCount: number;
  duration?: number;
}

interface SwimIntervalBuilderProps {
  intervals: SwimInterval[];
  onChange: (intervals: SwimInterval[]) => void;
  isMetric: boolean;
}

export default function SwimIntervalBuilder({ intervals, onChange, isMetric }: SwimIntervalBuilderProps) {
  const addInterval = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newInterval: SwimInterval = {
      id: Date.now().toString(),
      distance: '',
      equipment: 'None',
      recoveryType: 'time',
      recovery: '',
      repeatCount: 1,
      duration: 0
    };
    onChange([...intervals, newInterval]);
  };

  const updateInterval = (id: string, updates: Partial<SwimInterval>) => {
    onChange(intervals.map(interval =>
      interval.id === id ? { ...interval, ...updates } : interval
    ));
  };

  const duplicateInterval = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const interval = intervals.find(i => i.id === id);
    if (interval) {
      const duplicate = { ...interval, id: Date.now().toString() };
      onChange([...intervals, duplicate]);
    }
  };

  const deleteInterval = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(intervals.filter(interval => interval.id !== id));
  };

  const generatePreview = (interval: SwimInterval) => {
    const rpe = interval.targetRPE ? ` @ RPE ${interval.targetRPE}` : '';
    const equipment = interval.equipment !== 'None' ? ` w/ ${interval.equipment.toLowerCase()}` : '';
    const distanceUnit = isMetric ? 'm' : 'yd';
    const recovery = interval.recoveryType === 'time' ?
      `${interval.recovery} rest` :
      `${interval.recovery}${distanceUnit} recovery`;
    
    return `${interval.repeatCount} x ${interval.distance}${distanceUnit}${rpe}${equipment} + ${recovery}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Segments
          <Button type="button" onClick={addInterval} size="sm" className="bg-gray-500 hover:bg-gray-600">
            <Plus className="h-4 w-4 mr-2" />
            Add Segment
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {intervals.map((interval, index) => (
          <Card key={interval.id} className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Segment {index + 1}</h4>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={(e) => duplicateInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={(e) => deleteInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label>Distance ({isMetric ? 'meters' : 'yards'})</Label>
                <Input
                  name={`swim-distance-${interval.id}`}
                  autoComplete="off"
                  placeholder="200"
                  value={interval.distance}
                  onChange={(e) => updateInterval(interval.id, { distance: e.target.value })}
                />
              </div>
              <div>
                <Label>Target RPE (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  name={`swim-rpe-${interval.id}`}
                  autoComplete="off"
                  placeholder="5"
                  value={interval.targetRPE || ''}
                  onChange={(e) => updateInterval(interval.id, { targetRPE: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div>
                <Label>Equipment</Label>
                <Select value={interval.equipment} onValueChange={(value) =>
                  updateInterval(interval.id, { equipment: value })
                }>
                  <SelectTrigger name={`swim-equipment-${interval.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Fins">Fins</SelectItem>
                    <SelectItem value="Pull Buoy">Pull Buoy</SelectItem>
                    <SelectItem value="Snorkel">Snorkel</SelectItem>
                    <SelectItem value="Kickboard">Kickboard</SelectItem>
                    <SelectItem value="Paddles">Paddles</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Repeat Count</Label>
                <Input
                  type="number"
                  min="1"
                  name={`swim-repeat-${interval.id}`}
                  autoComplete="off"
                  value={interval.repeatCount}
                  onChange={(e) => updateInterval(interval.id, { repeatCount: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label>Recovery Type</Label>
                <Select value={interval.recoveryType} onValueChange={(value: 'time' | 'distance') =>
                  updateInterval(interval.id, { recoveryType: value })
                }>
                  <SelectTrigger name={`swim-recovery-type-${interval.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="distance">Distance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  {interval.recoveryType === 'time'
                    ? 'Recovery Time (mm:ss)'
                    : `Recovery Distance (${isMetric ? 'm' : 'yd'})`
                  }
                </Label>
                <Input
                  name={`swim-recovery-${interval.id}`}
                  autoComplete="off"
                  placeholder={interval.recoveryType === 'time' ? '1:00' : '50'}
                  value={interval.recovery}
                  onChange={(e) => updateInterval(interval.id, { recovery: e.target.value })}
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
            No segments added yet. Click "Add Segment" to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}