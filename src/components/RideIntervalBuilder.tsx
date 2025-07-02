import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Trash2, GripVertical, Repeat, Edit, Bike } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface RideInterval {
  id: string;
  time?: string;
  distance?: string;
  speedTarget?: string;
  powerTarget?: string;
  bpmTarget?: string;
  rpeTarget?: string;
  cadenceTarget?: string;
  effortLabel?: string;
  repeat?: boolean;
  repeatCount?: number;
  duration?: number;
  selected?: boolean;
  isRepeatBlock?: boolean;
  originalSegments?: RideInterval[];
}

interface RideIntervalBuilderProps {
  intervals: RideInterval[];
  onChange: (intervals: RideInterval[]) => void;
  isMetric: boolean;
}

// Fixed time input handler - no auto-conversion during typing
const handleTimeInput = (value: string, onChange: (timeStr: string, duration: number) => void) => {
  if (value === '') {
    onChange('', 0);
    return;
  }
  
  // Allow direct input without auto-conversion
  const timeStr = value;
  
  // Calculate duration for any valid time format
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    const min = parseInt(parts[0]) || 0;
    const sec = parseInt(parts[1]) || 0;
    
    // Validate seconds
    if (sec >= 60) return;
    
    const duration = min * 60 + sec;
    onChange(timeStr, duration);
  } else {
    // For inputs without colon, treat as minutes and calculate duration
    const min = parseInt(timeStr) || 0;
    const duration = min * 60;
    onChange(timeStr, duration);
  }
};

// Smart time formatting on blur
const handleTimeBlur = (value: string, onChange: (timeStr: string, duration: number) => void) => {
  if (!value) return;
  
  let timeStr = value;
  
  // Auto-format only on blur: "4" -> "4:00", "45" -> "45:00"
  if (!timeStr.includes(':') && timeStr.length <= 2) {
    timeStr = `${timeStr}:00`;
    
    const min = parseInt(timeStr.split(':')[0]) || 0;
    const duration = min * 60;
    onChange(timeStr, duration);
    return;
  }
  
  // Handle existing formatted time
  const parts = timeStr.split(':');
  const min = parseInt(parts[0]) || 0;
  const sec = parseInt(parts[1]) || 0;
  
  // Validate and format
  if (sec >= 60) return;
  
  const duration = min * 60 + sec;
  onChange(timeStr, duration);
};

// Mobile Safari numeric input fix
const handleNumericInput = (value: string, onChange: (num: number) => void) => {
  if (value === '') {
    onChange(0);
    return;
  }
  
  const numericValue = value.replace(/\D/g, '');
  const parsed = parseInt(numericValue, 10);
  const finalValue = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  
  onChange(finalValue);
};

export default function RideIntervalBuilder({ intervals, onChange, isMetric }: RideIntervalBuilderProps) {
  const [selectedIntervals, setSelectedIntervals] = useState<string[]>([]);
  const [blockRepeatCount, setBlockRepeatCount] = useState(1);

  // Auto-add first interval when component mounts and intervals array is empty
  useEffect(() => {
    if (intervals.length === 0) {
      const starterInterval: RideInterval = {
        id: Date.now().toString(),
        time: '',
        distance: '',
        duration: 0
      };
      onChange([starterInterval]);
    }
  }, [intervals.length, onChange]);

  const addInterval = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

    const selectedIntervalsData = intervals.filter(i =>
      selectedIntervals.includes(i.id));

    const blockSummary = selectedIntervalsData.map(i => {
      let segmentDesc = '';
      if (i.time) {
        segmentDesc += i.time;
      }
      if (i.effortLabel) {
        segmentDesc += ` @ ${i.effortLabel}`;
      } else if (i.powerTarget) {
        segmentDesc += ` @ ${i.powerTarget}`;
      } else if (i.speedTarget) {
        segmentDesc += ` @ ${i.speedTarget}`;
      } else if (i.bpmTarget) {
        segmentDesc += ` @ ${i.bpmTarget}`;
      } else if (i.rpeTarget) {
        segmentDesc += ` @ RPE ${i.rpeTarget}`;
      }
      return segmentDesc.trim();
    }).filter(desc => desc.length > 0).join(' + ');

    const totalDuration = selectedIntervalsData.reduce((sum, i) => sum + (i.duration || 0), 0);

    const blockInterval: RideInterval = {
      id: Date.now().toString(),
      time: `${blockRepeatCount}x(${blockSummary})`,
      isRepeatBlock: true,
      repeatCount: blockRepeatCount,
      duration: totalDuration * blockRepeatCount,
      originalSegments: selectedIntervalsData.map(seg => ({
        ...seg,
        originalSegments: undefined
      }))
    };

    const remainingIntervals = intervals.filter(i =>
      !selectedIntervals.includes(i.id));
    onChange([...remainingIntervals, blockInterval]);
    setSelectedIntervals([]);
  };

  const unblockInterval = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const blockInterval = intervals.find(i => i.id === id);
    if (!blockInterval || !blockInterval.isRepeatBlock || !blockInterval.originalSegments) return;

    const restoredSegments = blockInterval.originalSegments.map(seg => ({
      ...seg,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }));

    const updatedIntervals = intervals.filter(i => i.id !== id);
    onChange([...updatedIntervals, ...restoredSegments]);
  };

  const renderInterval = (interval: RideInterval, index: number) => {
    if (interval.isRepeatBlock) {
      return (
        <div key={interval.id} className="p-3">
          <div className="flex items-center gap-3 mb-3">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium flex-1 text-sm">
              <Repeat className="h-4 w-4 inline mr-2" />
              Repeat Block {intervals.filter(i => i.isRepeatBlock).findIndex(i => i.id === interval.id) + 1}
            </h4>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={(e) => unblockInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-gray-300"
                title="Break apart block"
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                onClick={(e) => duplicateInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-gray-300"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                onClick={(e) => deleteInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 border-gray-300"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="p-3 border border-gray-200">
            <div className="text-xs font-medium mb-1">
              Repeat Structure:
            </div>
            <div className="text-sm font-mono">
              {interval.time}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Total: {Math.floor((interval.duration || 0) / 60)}:{((interval.duration || 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={interval.id} className="p-3">
        <div className="flex items-center gap-3 mb-3">
          <Checkbox
            checked={selectedIntervals.includes(interval.id)}
            onCheckedChange={() => toggleIntervalSelection(interval.id)}
          />
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <Select
              value={interval.effortLabel || `Segment ${index + 1}`}
              onValueChange={(value) => {
                updateInterval(interval.id, { effortLabel: value });
              }}
            >
              <SelectTrigger className="bg-transparent p-0 h-auto font-medium text-sm border-gray-200">
                <div className="flex items-center">
                  <Bike className="h-4 w-4 mr-2" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-200 shadow-xl">
                <SelectItem value={`Segment ${index + 1}`}>Segment {index + 1}</SelectItem>
                <SelectItem value="Warm up">Warm up</SelectItem>
                <SelectItem value="Easy">Easy</SelectItem>
                <SelectItem value="Tempo">Tempo</SelectItem>
                <SelectItem value="Threshold">Threshold</SelectItem>
                <SelectItem value="Hard">Hard</SelectItem>
                <SelectItem value="Recovery">Recovery</SelectItem>
                <SelectItem value="Cool down">Cool down</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button 
              type="button" 
              onClick={(e) => duplicateInterval(interval.id, e)} 
              size="sm" 
              variant="outline" 
              className="h-8 w-8 p-0 border-gray-300 hover:bg-gray-100"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button 
              type="button" 
              onClick={(e) => deleteInterval(interval.id, e)} 
              size="sm" 
              variant="outline" 
              className="h-8 w-8 p-0 border-gray-300 hover:bg-gray-100"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Compact responsive grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <div>
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Input
              placeholder="5:00"
              value={interval.time || ''}
              onChange={(e) => {
                handleTimeInput(e.target.value, (timeStr, duration) => {
                  updateInterval(interval.id, { time: timeStr, duration });
                });
              }}
              onBlur={(e) => {
                const value = e.target.value;
                if (value && !value.includes(':') && value.length <= 2) {
                  const formattedTime = `${value}:00`;
                  const duration = (parseInt(value) || 0) * 60;
                  updateInterval(interval.id, { time: formattedTime, duration });
                }
              }}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Distance ({isMetric ? 'km' : 'mi'})</Label>
            <Input
              placeholder="10.0"
              value={interval.distance || ''}
              onChange={(e) => updateInterval(interval.id, { distance: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Speed ({isMetric ? 'km/h' : 'mph'})</Label>
            <Input
              placeholder={isMetric ? "25-30" : "18-20"}
              value={interval.speedTarget || ''}
              onChange={(e) => updateInterval(interval.id, { speedTarget: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Power (watts or %FTP)</Label>
            <Input
              placeholder="250W or 85%"
              value={interval.powerTarget || ''}
              onChange={(e) => updateInterval(interval.id, { powerTarget: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">BPM</Label>
            <Input
              placeholder="150-160"
              value={interval.bpmTarget || ''}
              onChange={(e) => updateInterval(interval.id, { bpmTarget: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">RPE</Label>
            <Input
              placeholder="6-7"
              value={interval.rpeTarget || ''}
              onChange={(e) => updateInterval(interval.id, { rpeTarget: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cadence (rpm)</Label>
            <Input
              placeholder="85-95"
              value={interval.cadenceTarget || ''}
              onChange={(e) => updateInterval(interval.id, { cadenceTarget: e.target.value })}
              className="h-9 text-sm border-gray-300"
            />
          </div>
        </div>

        {/* Compact repeat section */}
        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`repeat-${interval.id}`}
              checked={interval.repeat || false}
              onCheckedChange={(checked) => updateInterval(interval.id, { repeat: !!checked })}
            />
            <Label htmlFor={`repeat-${interval.id}`} className="text-xs">Repeat?</Label>
          </div>
          {interval.repeat && (
            <Input
              type="text"
              className="w-14 h-8 text-center text-sm border-gray-300"
              placeholder="2"
              value={interval.repeatCount === undefined ? '' : interval.repeatCount.toString()}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  updateInterval(interval.id, { repeatCount: undefined });
                } else {
                  handleNumericInput(value, (num) => {
                    updateInterval(interval.id, { repeatCount: num });
                  });
                }
              }}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Segments */}
      <div className="space-y-3">
        {intervals.map((interval, index) => renderInterval(interval, index))}

        {intervals.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No segments yet</p>
            <p className="text-xs mt-1">Click "Add Segment" to get started</p>
          </div>
        )}

        {/* Bottom Add Segment button when segments exist */}
        {intervals.length > 0 && (
          <div className="text-center pt-4">
            <button 
              type="button" 
              onClick={addInterval} 
              className="px-4 py-2 text-black text-sm"
            >
              <Bike className="h-4 w-4 mr-2 inline" />
              Add Segment
            </button>
          </div>
        )}
      </div>

      {/* Floating repeat menu */}
      {selectedIntervals.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-gray-300 shadow-xl p-3 flex flex-col items-center gap-2 z-[60] max-w-xs w-full mx-4">
          <span className="text-xs font-medium text-gray-700">
            {selectedIntervals.length} segment{selectedIntervals.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Repeat</span>
            <Input
              type="text"
              className="w-12 h-8 text-center text-sm font-semibold border-gray-300"
              value={blockRepeatCount.toString()}
              onChange={(e) => {
                handleNumericInput(e.target.value, setBlockRepeatCount);
              }}
              onFocus={(e) => e.target.select()}
              placeholder="1"
            />
            <span className="text-xs text-gray-600">times</span>
          </div>
          <div className="flex gap-2 w-full">
            <Button
              type="button"
              onClick={() => setSelectedIntervals([])}
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createBlock}
              size="sm"
              className="bg-gray-500 hover:bg-gray-600 flex-1 h-8 text-xs"
            >
              <Repeat className="h-3 w-3 mr-1" />
              Create
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}