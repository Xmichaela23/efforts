import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  X, 
  Clock, 
  Activity,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { createWorkoutMetadata, PilatesYogaSessionType, FocusArea } from '@/utils/workoutMetadata';

interface PilatesYogaLoggerProps {
  onClose: () => void;
  scheduledWorkout?: any;
  onWorkoutSaved?: (workout: any) => void;
  targetDate?: string;
}

const SESSION_TYPES: { value: PilatesYogaSessionType; label: string }[] = [
  { value: 'pilates_mat', label: 'Pilates Mat' },
  { value: 'pilates_reformer', label: 'Pilates Reformer' },
  { value: 'yoga_flow', label: 'Yoga Flow' },
  { value: 'yoga_restorative', label: 'Yoga Restorative' },
  { value: 'yoga_power', label: 'Yoga Power' },
  { value: 'yoga_hot', label: 'Yoga Hot' },
  { value: 'other', label: 'Other' }
];

const FOCUS_AREAS: { value: FocusArea; label: string }[] = [
  { value: 'core', label: 'Core' },
  { value: 'upper_body', label: 'Upper Body' },
  { value: 'lower_body', label: 'Lower Body' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'balance', label: 'Balance' },
  { value: 'full_body', label: 'Full Body' }
];

export default function PilatesYogaLogger({ onClose, scheduledWorkout, onWorkoutSaved, targetDate }: PilatesYogaLoggerProps) {
  const { workouts, addWorkout, updateWorkout } = useAppContext();
  const [workoutStartTime] = useState<Date>(new Date());
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Form fields
  const [duration, setDuration] = useState<number>(60);
  const [sessionType, setSessionType] = useState<PilatesYogaSessionType>('pilates_mat');
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [notes, setNotes] = useState('');
  
  // Session RPE prompt state
  const [showSessionRPE, setShowSessionRPE] = useState(false);
  const [sessionRPE, setSessionRPE] = useState<number>(5);

  // Get date string helper
  const getDateString = () => {
    if (targetDate) return targetDate;
    if (scheduledWorkout?.date) return scheduledWorkout.date;
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Initialize component
  useEffect(() => {
    console.log('🔄 PilatesYogaLogger initializing...');
    
    // Check for existing planned workout data
    let workoutToLoad = scheduledWorkout;
    
    if (!workoutToLoad) {
      const dateStr = getDateString();
      const currentPlanned = (workouts || []) as any[];
      const todaysPilatesYogaWorkouts = currentPlanned.filter((w: any) => 
        String(w?.date) === dateStr && 
        String(w?.type || '').toLowerCase() === 'pilates_yoga' && 
        String((w as any)?.workout_status || '').toLowerCase() === 'planned'
      );

      if (todaysPilatesYogaWorkouts.length > 0) {
        workoutToLoad = todaysPilatesYogaWorkouts[0];
        console.log('✅ Using planned pilates_yoga workout:', workoutToLoad.name);
      }
    }

    // Pre-populate from planned workout if available
    if (workoutToLoad) {
      const metadata = workoutToLoad.workout_metadata || {};
      if (metadata.session_type) {
        setSessionType(metadata.session_type);
      }
      if (metadata.focus_area && Array.isArray(metadata.focus_area)) {
        setFocusAreas(metadata.focus_area);
      }
      if (metadata.notes) {
        setNotes(metadata.notes);
      }
      if (workoutToLoad.duration) {
        setDuration(workoutToLoad.duration);
      }
    }
    
    setIsInitialized(true);
  }, [scheduledWorkout, workouts, targetDate]);

  // Toggle focus area
  const toggleFocusArea = (area: FocusArea) => {
    setFocusAreas(prev => 
      prev.includes(area)
        ? prev.filter(a => a !== area)
        : [...prev, area]
    );
  };

  // Helper: get RPE label
  const getRPELabel = (rpe: number): string => {
    if (rpe <= 3) return 'Light';
    if (rpe <= 5) return 'Moderate';
    if (rpe <= 7) return 'Hard';
    if (rpe <= 9) return 'Very Hard';
    return 'Maximal';
  };

  // Session RPE handlers
  const handleSessionRPESubmit = () => {
    setShowSessionRPE(false);
    finalizeSave({ rpe: sessionRPE });
  };

  const handleSessionRPESkip = () => {
    setShowSessionRPE(false);
    finalizeSave();
  };

  const saveWorkout = () => {
    if (!sessionType) {
      alert('Please select a session type.');
      return;
    }
    if (duration <= 0) {
      alert('Please enter a valid duration.');
      return;
    }
    // Show session RPE prompt
    setShowSessionRPE(true);
  };

  const finalizeSave = async (extra?: { rpe?: number }) => {
    const workoutEndTime = new Date();
    const actualDuration = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));
    // Use user-entered duration if provided, otherwise use actual elapsed time
    const finalDuration = duration > 0 ? duration : actualDuration;

    // Determine if editing existing completed workout or creating from planned
    const isEditingCompleted = Boolean(scheduledWorkout?.id) && 
      String((scheduledWorkout as any)?.workout_status || '').toLowerCase() === 'completed';
    const sourcePlannedId = !isEditingCompleted && scheduledWorkout?.id 
      ? String(scheduledWorkout.id) 
      : null;
    
    // Create unified metadata (single source of truth)
    const workoutMetadata = createWorkoutMetadata({
      session_rpe: typeof extra?.rpe === 'number' ? extra.rpe : undefined,
      notes: notes.trim() || undefined,
      session_type: sessionType,
      focus_area: focusAreas.length > 0 ? focusAreas : undefined
    });
    
    // Prepare the workout data
    const completedWorkout = {
      id: isEditingCompleted ? scheduledWorkout.id : Date.now().toString(),
      name: scheduledWorkout?.name || `${SESSION_TYPES.find(t => t.value === sessionType)?.label || 'Pilates/Yoga'} - ${new Date().toLocaleDateString()}`,
      type: 'pilates_yoga' as const,
      date: getDateString(),
      description: `${SESSION_TYPES.find(t => t.value === sessionType)?.label || 'Pilates/Yoga'} session`,
      duration: finalDuration,
      workout_status: 'completed' as const,
      completedManually: true,
      workout_metadata: workoutMetadata,
      planned_id: sourcePlannedId || undefined
    };

    console.log('🔍 Saving completed pilates_yoga workout:', completedWorkout);

    // Save: update in place when editing an existing workout id; otherwise create new
    let saved: any = null;
    try {
      if (isEditingCompleted) {
        console.log('🔧 Updating existing pilates_yoga workout:', scheduledWorkout?.id);
        saved = await updateWorkout(String(scheduledWorkout.id), completedWorkout as any);
      } else {
        console.log('🆕 Creating new completed pilates_yoga workout');
        saved = await addWorkout(completedWorkout);
      }
      console.log('✅ Save successful, returned:', saved);

      // Calculate workload for completed workout
      try {
        await supabase.functions.invoke('calculate-workload', {
          body: {
            workout_id: saved?.id || completedWorkout.id,
            workout_data: {
              type: completedWorkout.type,
              duration: completedWorkout.duration,
              workout_metadata: completedWorkout.workout_metadata,
              workout_status: 'completed'
            }
          }
        });
        console.log('✅ Workload calculated for completed pilates_yoga workout');
      } catch (workloadError) {
        console.error('❌ Failed to calculate workload:', workloadError);
      }

      // Auto-attach to planned workout if possible
      try {
        const workoutId = saved?.id || completedWorkout.id;
        console.log('🔗 Attempting auto-attachment for completed pilates_yoga workout:', workoutId);
        
        const { data, error } = await supabase.functions.invoke('auto-attach-planned', {
          body: { workout_id: workoutId }
        });
        
        console.log('🔗 Auto-attach response:', { data, error });
        
        if (error) {
          console.error('❌ Auto-attach failed for pilates_yoga workout:', workoutId, error);
        } else if (data?.attached) {
          console.log('✅ Auto-attached pilates_yoga workout:', workoutId, data);
        } else {
          console.log('ℹ️ No planned workout found to attach:', workoutId, data?.reason || 'unknown');
        }
      } catch (attachError) {
        console.error('❌ Auto-attach error for pilates_yoga workout:', saved?.id || completedWorkout.id, attachError);
      }
    } catch (e: any) {
      console.error('❌ Save failed with error:', e);
      alert(`Failed to save workout: ${e.message}`);
      return;
    }

    // Navigate to completed view
    if (onWorkoutSaved) {
      onWorkoutSaved(saved || completedWorkout);
    } else {
      alert(`Pilates/Yoga workout saved! Duration: ${finalDuration} minutes`);
      onClose();
    }
  };

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading pilates/yoga logger...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-purple-600" />
              <h2 className="text-xl font-semibold">Pilates/Yoga Session</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Duration */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-32"
                  />
                  <Label>minutes</Label>
                </div>
              </CardContent>
            </Card>

            {/* Session Type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Type</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={sessionType} onValueChange={(value: PilatesYogaSessionType) => setSessionType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Focus Areas (Optional) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Focus Areas (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {FOCUS_AREAS.map(area => (
                    <div key={area.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`focus-${area.value}`}
                        checked={focusAreas.includes(area.value)}
                        onCheckedChange={() => toggleFocusArea(area.value)}
                      />
                      <Label htmlFor={`focus-${area.value}`} className="cursor-pointer">
                        {area.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Notes (Optional) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How did the session feel? Any modifications or observations?"
                  rows={4}
                />
              </CardContent>
            </Card>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50">
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={saveWorkout} disabled={!sessionType || duration <= 0}>
                Save Workout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Session RPE Prompt */}
      {showSessionRPE && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={handleSessionRPESkip} />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-lg shadow-xl p-6 z-10">
            <h2 className="text-2xl font-bold mb-2 text-center">
              Workout Complete!
            </h2>
            
            <p className="text-gray-600 mb-8 text-center">
              How hard was that session?
            </p>
            
            {/* RPE slider */}
            <div className="mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Easy</span>
                <span className="text-sm text-gray-500">Maximal</span>
              </div>
              
              <input
                type="range"
                min="1"
                max="10"
                value={sessionRPE}
                onChange={(e) => setSessionRPE(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              
              <div className="text-center mt-3">
                <div className="text-4xl font-bold text-gray-900">{sessionRPE}</div>
                <div className="text-sm text-gray-500 mt-1">{getRPELabel(sessionRPE)}</div>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={handleSessionRPESkip}
                className="flex-1"
              >
                Skip
              </Button>
              <Button
                onClick={handleSessionRPESubmit}
                className="flex-1"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

