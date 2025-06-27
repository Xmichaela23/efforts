import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Copy, Trash2, GripVertical, Repeat, Edit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface RunInterval {
  id: string;
  time?: string;
  distance?: string;
  paceTarget?: string;
  effortLabel?: string; // NEW: Effort level dropdown
  bpmTarget?: string;
  rpeTarget?: string;
  repeat?: boolean;
  repeatCount?: number;
  duration?: number;
  selected?: boolean;
  isRepeatBlock?: boolean;
  originalSegments?: RunInterval[]; // Store original segments for unblocking
}

interface RunIntervalBuilderProps {
  intervals: RunInterval[];
  onChange: (intervals: RunInterval[]) => void;
  isMetric: boolean;
}

// MOBILE SAFARI FIX: Aggressive fix for number input issues
const handleNumericInput = (value: string, onChange: (num: number) => void) => {
  // Allow empty string for clearing
  if (value === '') {
    onChange(0);
    return;
  }
  
  // Only allow digits
  const numericValue = value.replace(/\D/g, '');
  
  // Convert to number, default to 1 if empty after cleaning
  const parsed = parseInt(numericValue, 10);
  const finalValue = isNaN(parsed) || parsed < 1 ? 1 : parsed;
  
  onChange(finalValue);
};

export default function RunIntervalBuilder({ intervals, onChange, isMetric }: RunIntervalBuilderProps) {
  const [selectedIntervals, setSelectedIntervals] = useState<string[]>([]);
  const [blockRepeatCount, setBlockRepeatCount] = useState(1);

  const addInterval = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const newInterval: RunInterval = {
      id: Date.now().toString(),
      time: '',
      distance: '',
      duration: 0
    };
    onChange([...intervals, newInterval]);
  };

  const updateInterval = (id: string, updates: Partial<RunInterval>) => {
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

  // FIXED: Better block summary generation
  const createBlock = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedIntervals.length === 0) return;

    const selectedIntervalsData = intervals.filter(i =>
      selectedIntervals.includes(i.id));

    // FIXED: More robust block summary generation
    const blockSummary = selectedIntervalsData.map(i => {
      let segmentDesc = '';
      // Primary descriptor (time is most important)
      if (i.time) {
        segmentDesc += i.time;
      }
      // Add effort label (prioritized)
      if (i.effortLabel) {
        segmentDesc += ` @ ${i.effortLabel}`;
      } else if (i.paceTarget) {
        segmentDesc += ` @ ${i.paceTarget}`;
      } else if (i.bpmTarget) {
        segmentDesc += ` @ ${i.bpmTarget}`;
      } else if (i.rpeTarget) {
        segmentDesc += ` @ RPE ${i.rpeTarget}`;
      }
      return segmentDesc.trim();
    }).filter(desc => desc.length > 0).join(' + '); // Filter out empty descriptions

    const totalDuration = selectedIntervalsData.reduce((sum, i) => sum + (i.duration || 0), 0);

    const blockInterval: RunInterval = {
      id: Date.now().toString(),
      time: `${blockRepeatCount}x(${blockSummary})`,
      isRepeatBlock: true,
      repeatCount: blockRepeatCount,
      duration: totalDuration * blockRepeatCount,
      originalSegments: selectedIntervalsData.map(seg => ({
        ...seg,
        originalSegments: undefined // Prevent circular references
      })) // Store copies for unblocking
    };

    const remainingIntervals = intervals.filter(i =>
      !selectedIntervals.includes(i.id));
    onChange([...remainingIntervals, blockInterval]);
    setSelectedIntervals([]);
  };

  // NEW: Unblock feature to break apart repeat blocks
  const unblockInterval = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const blockInterval = intervals.find(i => i.id === id);
    if (!blockInterval || !blockInterval.isRepeatBlock || !blockInterval.originalSegments) return;

    // Restore original segments with new IDs
    const restoredSegments = blockInterval.originalSegments.map(seg => ({
      ...seg,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }));

    // Replace the block with the restored segments
    const updatedIntervals = intervals.filter(i => i.id !== id);
    onChange([...updatedIntervals, ...restoredSegments]);
  };

  const renderInterval = (interval: RunInterval, index: number) => {
    if (interval.isRepeatBlock) {
      return (
        <Card key={interval.id} className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-4 mb-4">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium flex-1">
              <Repeat className="h-4 w-4 inline mr-2" />
              Repeat Block {intervals.filter(i => i.isRepeatBlock).findIndex(i => i.id === interval.id) + 1}
            </h4>
            <div className="flex gap-2">
              {/* NEW: Unblock button */}
              <Button
                type="button"
                onClick={(e) => unblockInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="border-blue-400 hover:bg-blue-100"
                title="Break apart this repeat block for editing"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={(e) => duplicateInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="border-blue-400 hover:bg-blue-100"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={(e) => deleteInterval(interval.id, e)}
                size="sm"
                variant="outline"
                className="border-blue-400 hover:bg-blue-100"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-white p-4 rounded border">
            <div className="text-sm font-medium text-blue-700 mb-2">
              Repeat Structure:
            </div>
            <div className="text-lg font-mono">
              {interval.time}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              Total Duration: {Math.floor((interval.duration || 0) / 60)}:{((interval.duration || 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card key={interval.id} className="p-4">
        <div className="flex items-center gap-4 mb-4">
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
              <SelectTrigger className="border-none shadow-none p-0 h-auto font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
            <Button type="button" onClick={(e) => duplicateInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" onClick={(e) => deleteInterval(interval.id, e)} size="sm" variant="outline" className="border-gray-400 hover:bg-gray-100">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* MOBILE-FIRST: 5-field responsive grid - CLEANED UP */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <Label>Time (mm:ss)</Label>
            <Input
              placeholder="5:00"
              value={interval.time || ''}
              onChange={(e) => {
                const timeStr = e.target.value;
                // Better time parsing with error handling
                if (timeStr === '') {
                  updateInterval(interval.id, { time: '', duration: 0 });
                  return;
                }
                const parts = timeStr.split(':');
                const min = parseInt(parts[0]) || 0;
                const sec = parseInt(parts[1]) || 0;
                // Validate time input
                if (sec >= 60) return; // Don't allow invalid seconds
                const duration = min * 60 + sec;
                updateInterval(interval.id, { time: timeStr, duration });
              }}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label>Pace Target (per {isMetric ? 'km' : 'mi'})</Label>
            <Input
              placeholder="8:30"
              value={interval.paceTarget || ''}
              onChange={(e) => updateInterval(interval.id, { paceTarget: e.target.value })}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label>BPM Target</Label>
            <Input
              placeholder="150-160"
              value={interval.bpmTarget || ''}
              onChange={(e) => updateInterval(interval.id, { bpmTarget: e.target.value })}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label>Distance ({isMetric ? 'km' : 'mi'})</Label>
            <Input
              placeholder="5.0"
              value={interval.distance || ''}
              onChange={(e) => updateInterval(interval.id, { distance: e.target.value })}
              className="min-h-[44px]"
            />
          </div>
          <div>
            <Label>RPE Target</Label>
            <Input
              placeholder="6-7"
              value={interval.rpeTarget || ''}
              onChange={(e) => updateInterval(interval.id, { rpeTarget: e.target.value })}
              className="min-h-[44px]"
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
            // MOBILE SAFARI FIX: Completely custom numeric input handling
            <Input
              type="text"
              className="w-20 h-10 min-h-[44px]"
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
              onFocus={(e) => {
                // Select all text on focus to make it easy to replace
                e.target.select();
              }}
            />
          )}
        </div>

        <Button type="button" onClick={(e) => addInterval(e)} size="sm" variant="outline" className="w-full mt-4 border-gray-400 hover:bg-gray-100 min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" />
          New Segment
        </Button>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Segments
            <Button type="button" onClick={addInterval} size="sm" className="bg-gray-500 hover:bg-gray-600 min-h-[44px]">
              <Plus className="h-4 w-4 mr-2" />
              Add Segment
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {intervals.map((interval, index) => renderInterval(interval, index))}

          {intervals.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No segments added yet. Click "Add Segment" to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* FIXED: Better positioned floating repeat menu with mobile Safari fixes */}
      {selectedIntervals.length > 0 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 flex flex-col items-center gap-3 z-[60] max-w-sm w-full mx-4">
          <span className="text-sm font-medium text-gray-700">
            {selectedIntervals.length} segment{selectedIntervals.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Repeat</span>
            {/* MOBILE SAFARI FIX: Block repeat count input with aggressive handling */}
            <Input
              type="text"
              className="w-16 h-12 text-center text-lg font-semibold border-2 min-h-[44px]"
              value={blockRepeatCount.toString()}
              onChange={(e) => {
                handleNumericInput(e.target.value, setBlockRepeatCount);
              }}
              onFocus={(e) => {
                // Select all text on focus for easy replacement
                e.target.select();
              }}
              placeholder="1"
            />
            <span className="text-sm text-gray-600">times</span>
          </div>
          <div className="flex gap-2 w-full">
            <Button
              type="button"
              onClick={() => setSelectedIntervals([])}
              size="sm"
              variant="outline"
              className="flex-1 min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createBlock}
              size="sm"
              className="bg-gray-500 hover:bg-gray-600 flex-1 min-h-[44px]"
            >
              <Repeat className="h-4 w-4 mr-2" />
              Create Block
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}