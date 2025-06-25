import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Copy, Trash2, GripVertical, Repeat } from 'lucide-react';

export interface RideInterval {
  id: string;
  time?: string;
  distance?: string;
  powerTarget?: string;
  bpmTarget?: string;
  cadenceTarget?: string;
  repeat?: boolean;
  repeatCount?: number;
  duration?: number;
  selected?: boolean;
}

interface RideIntervalBuilderProps {
  intervals: RideInterval[];
  onChange: (intervals: RideInterval[]) => void;
  isMetric: boolean;
}

export default function RideIntervalBuilder({ intervals, onChange, isMetric }: RideIntervalBuilderProps) {
  const [selectedIntervals, setSelectedIntervals] = useState<string[]>([]);
  const [blockRepeatCount, setBlockRepeatCount] = useState(2);

  const addInterval = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newInterval: RideInterval = {
      id: Date.now().toString(),
      time: '',
      distance: '',
      duration: 0
    };
    onChange([...intervals, newInterval]);
  };

  const updateInterval = (id: string, updates: Partial<RideInterval>) => {
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

  const toggleIntervalSelection = (id: string) => {
    setSelectedIntervals(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const createBlock = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedIntervals.length === 0) return;
    
    const selectedIntervalsData = intervals.filter(i => selectedIntervals.includes(i.id));
    const blockSummary = selectedIntervalsData.map(i => {
      const timeStr = i.time ? i.time : '';
      const target = i.powerTarget ? `@ ${i.powerTarget}` : '';
      return `${timeStr} ${target}`.trim();
    }).join(' + ');
    
    const blockInterval: RideInterval = {
      id: Date.now().toString(),
      time: `[${blockSummary}]`,
      repeatCount: blockRepeatCount,
      duration: selectedIntervalsData.reduce((sum, i) => sum + (i.duration || 0), 0) * blockRepeatCount
    };
    
    const remainingIntervals = intervals.filter(i => !selectedIntervals.includes(i.id));
    onChange([...remainingIntervals, blockInterval]);
    setSelectedIntervals([]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Ride Intervals
            <Button type="button" onClick={addInterval} size="sm" className="bg-gray-500 hover:bg-gray-600">
              <Plus className="h-4 w-4 mr-2" />
              Add Interval
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {intervals.map((interval, index) => (
            <Card key={interval.id} className="p-4">
              <div className="flex items-center gap-4 mb-4">
                <Checkbox
                  checked={selectedIntervals.includes(interval.id)}
                  onCheckedChange={() => toggleIntervalSelection(interval.id)}
                />
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium flex-1">Segment {index + 1}</h4>
                <div className="flex gap-2">
                  <Button type="button" onClick={(e) => duplicateInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" onClick={(e) => deleteInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Time (mm:ss)</Label>
                  <Input
                    placeholder="5:00"
                    value={interval.time || ''}
                    onChange={(e) => {
                      const timeStr = e.target.value;
                      const [min, sec] = timeStr.split(':').map(Number);
                      const duration = (min || 0) * 60 + (sec || 0);
                      updateInterval(interval.id, { time: timeStr, duration });
                    }}
                  />
                </div>
                <div>
                  <Label>Distance ({isMetric ? 'km' : 'mi'})</Label>
                  <Input
                    placeholder="10.0"
                    value={interval.distance || ''}
                    onChange={(e) => updateInterval(interval.id, { distance: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Power Target (watts or %FTP)</Label>
                  <Input
                    placeholder="250W or 85%"
                    value={interval.powerTarget || ''}
                    onChange={(e) => updateInterval(interval.id, { powerTarget: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label>BPM Target</Label>
                  <Input
                    placeholder="150-160 or zone"
                    value={interval.bpmTarget || ''}
                    onChange={(e) => updateInterval(interval.id, { bpmTarget: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cadence Target (rpm)</Label>
                  <Input
                    placeholder="85-95"
                    value={interval.cadenceTarget || ''}
                    onChange={(e) => updateInterval(interval.id, { cadenceTarget: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2 mb-4">
                <Checkbox
                  id={`repeat-${interval.id}`}
                  checked={interval.repeat || false}
                  onCheckedChange={(checked) => updateInterval(interval.id, { repeat: !!checked })}
                />
                <Label htmlFor={`repeat-${interval.id}`}>Repeat?</Label>
                {interval.repeat && (
                  <Input
                    type="number"
                    min="1"
                    className="w-20"
                    placeholder="2"
                    value={interval.repeatCount || ''}
                    onChange={(e) => updateInterval(interval.id, { repeatCount: parseInt(e.target.value) || 1 })}
                  />
                )}
              </div>
              
              <Button type="button" onClick={addInterval} size="sm" variant="outline" className="w-full border-gray-400 hover:bg-gray-100">
                <Plus className="h-4 w-4 mr-2" />
                New Interval
              </Button>
            </Card>
          ))}
          
          {intervals.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No intervals added yet. Click "Add Interval" to get started.
            </div>
          )}
        </CardContent>
      </Card>
      
      {selectedIntervals.length > 0 && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-4">
          <span className="text-sm">{selectedIntervals.length} intervals selected</span>
          <Input
            type="number"
            min="2"
            className="w-20"
            value={blockRepeatCount}
            onChange={(e) => setBlockRepeatCount(parseInt(e.target.value) || 2)}
          />
          <Button type="button" onClick={createBlock} size="sm" className="bg-gray-500 hover:bg-gray-600">
            <Repeat className="h-4 w-4 mr-2" />
            Repeat this block
          </Button>
        </div>
      )}
    </div>
  );
}