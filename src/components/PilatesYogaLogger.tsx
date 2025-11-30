import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { createWorkoutMetadata, PilatesYogaSessionType, FocusArea, SessionFeeling, Environment } from '@/utils/workoutMetadata';

interface PilatesYogaLoggerProps {
  onClose: () => void;
  scheduledWorkout?: any;
  onWorkoutSaved?: (workout: any) => void;
  targetDate?: string;
}

const SESSION_TYPES: { value: PilatesYogaSessionType; label: string }[] = [
  { value: 'pilates_mat', label: 'Pilates Mat' },
  { value: 'pilates_reformer', label: 'Pilates Reformer' },
  { value: 'yoga_flow', label: 'Yoga Flow/Vinyasa' },
  { value: 'yoga_restorative', label: 'Yoga Restorative/Yin' },
  { value: 'yoga_power', label: 'Yoga Power/Ashtanga' },
  { value: 'other', label: 'Other' }
];

const SESSION_FEELINGS: { value: SessionFeeling; label: string }[] = [
  { value: 'energizing', label: 'Energizing' },
  { value: 'challenging', label: 'Challenging' },
  { value: 'restorative', label: 'Restorative' },
  { value: 'frustrating', label: 'Frustrating' },
  { value: 'flow_state', label: 'Flow State' }
];

const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: 'studio', label: 'Studio Class' },
  { value: 'home', label: 'Home Practice' },
  { value: 'virtual', label: 'Virtual/Online Class' },
  { value: 'outdoor', label: 'Outdoor' }
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
  
  // Required fields
  const [duration, setDuration] = useState<number>(60);
  const [sessionRPE, setSessionRPE] = useState<number>(5);
  const [sessionType, setSessionType] = useState<PilatesYogaSessionType | ''>('');
  
  // Optional fields
  const [sessionFeeling, setSessionFeeling] = useState<SessionFeeling | ''>('');
  const [environment, setEnvironment] = useState<Environment | ''>('');
  const [isHeated, setIsHeated] = useState(false);
  const [instructor, setInstructor] = useState('');
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [notes, setNotes] = useState('');
  
  // UI state
  const [showOptionalFields, setShowOptionalFields] = useState(false);

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
      if (metadata.session_rpe) {
        setSessionRPE(metadata.session_rpe);
      }
      if (metadata.session_feeling) {
        setSessionFeeling(metadata.session_feeling);
      }
      if (metadata.environment) {
        setEnvironment(metadata.environment);
      }
      if (metadata.is_heated) {
        setIsHeated(metadata.is_heated);
      }
      if (metadata.instructor) {
        setInstructor(metadata.instructor);
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

  // Check if session type is yoga (for showing heated checkbox)
  const isYogaSession = sessionType.startsWith('yoga_');

  const saveWorkout = async () => {
    // Validation
    if (!duration || duration <= 0) {
      alert('Duration must be greater than 0');
      return;
    }
    if (!sessionRPE || sessionRPE < 1 || sessionRPE > 10) {
      alert('RPE must be between 1 and 10');
      return;
    }
    if (!sessionType) {
      alert('Session type is required');
      return;
    }

    const workoutEndTime = new Date();
    const actualDuration = Math.round((workoutEndTime.getTime() - workoutStartTime.getTime()) / (1000 * 60));
    const finalDuration = duration > 0 ? duration : actualDuration;

    // Determine if editing existing completed workout or creating from planned
    const isEditingCompleted = Boolean(scheduledWorkout?.id) && 
      String((scheduledWorkout as any)?.workout_status || '').toLowerCase() === 'completed';
    const sourcePlannedId = !isEditingCompleted && scheduledWorkout?.id 
      ? String(scheduledWorkout.id) 
      : null;
    
    // Build metadata object
    const workoutMetadata = createWorkoutMetadata({
      session_rpe: sessionRPE,
      session_type: sessionType as PilatesYogaSessionType,
      notes: notes.trim() || undefined,
      session_feeling: sessionFeeling || undefined,
      environment: environment || undefined,
      is_heated: isHeated || undefined,
      instructor: instructor.trim() || undefined,
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
      <div className="min-h-screen pb-24">
        <div className="bg-white pb-2 mb-2">
          <div className="flex items-center w-full">
            <h1 className="text-xl font-medium text-gray-700">Loading...</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white pb-2 mb-2">
        <div className="flex items-center justify-between w-full px-3">
          <h1 className="text-xl font-medium text-gray-700">
            {scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Pilates/Yoga'}
          </h1>
        </div>
      </div>

      {/* Main content container */}
      <div className="space-y-2 w-full pb-3 px-3">
        {/* REQUIRED SECTION */}
        <div className="bg-white">
          <div className="p-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Session Details</h3>
            
            {/* Duration */}
            <div className="mb-3">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="240"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-9 text-center text-sm border-gray-300 flex-1"
                  style={{ fontSize: '16px' }}
                  placeholder="60"
                />
                <span className="text-sm text-gray-600">minutes</span>
              </div>
            </div>

            {/* RPE - CRITICAL FIELD */}
            <div className="mb-3">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                RPE (1-10)
                <span className="text-xs text-gray-500 ml-1">How hard did this session feel overall?</span>
              </Label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={sessionRPE}
                  onChange={(e) => setSessionRPE(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Easy</span>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{sessionRPE}</div>
                    <div className="text-xs text-gray-500">{getRPELabel(sessionRPE)}</div>
                  </div>
                  <span className="text-xs text-gray-500">Maximal</span>
                </div>
              </div>
            </div>

            {/* Session Type */}
            <div className="mb-3">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Session Type</Label>
              <Select value={sessionType} onValueChange={(value: PilatesYogaSessionType) => setSessionType(value)}>
                <SelectTrigger className="h-9 text-sm border-gray-300">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-white border border-gray-200 shadow-xl z-50">
                  {SESSION_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* OPTIONAL SECTION - Collapsible */}
        <div className="bg-white">
          <div className="p-2">
            <button
              onClick={() => setShowOptionalFields(!showOptionalFields)}
              className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900 mb-2"
            >
              <span>Additional Info (Optional)</span>
              {showOptionalFields ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            {showOptionalFields && (
              <div className="space-y-3 pt-2">
                {/* Session Feeling */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Session Feeling</Label>
                  <Select value={sessionFeeling} onValueChange={(value: SessionFeeling) => setSessionFeeling(value)}>
                    <SelectTrigger className="h-9 text-sm border-gray-300">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-200 shadow-xl z-50">
                      <SelectItem value="">None</SelectItem>
                      {SESSION_FEELINGS.map(feeling => (
                        <SelectItem key={feeling.value} value={feeling.value}>
                          {feeling.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Environment */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Environment</Label>
                  <Select value={environment} onValueChange={(value: Environment) => setEnvironment(value)}>
                    <SelectTrigger className="h-9 text-sm border-gray-300">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-gray-200 shadow-xl z-50">
                      <SelectItem value="">None</SelectItem>
                      {ENVIRONMENTS.map(env => (
                        <SelectItem key={env.value} value={env.value}>
                          {env.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Heated - Only show if yoga session */}
                {isYogaSession && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is-heated"
                      checked={isHeated}
                      onCheckedChange={(checked) => setIsHeated(checked === true)}
                    />
                    <Label htmlFor="is-heated" className="cursor-pointer text-sm text-gray-700">
                      Heated/Hot Room
                    </Label>
                  </div>
                )}

                {/* Instructor/Studio */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Instructor/Studio</Label>
                  <Input
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="e.g., Sarah Johnson"
                    className="h-9 text-sm border-gray-300"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOCUS AREAS - Optional */}
        <div className="bg-white">
          <div className="p-2">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Focus Areas (Optional)</Label>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_AREAS.map(area => (
                <div key={area.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`focus-${area.value}`}
                    checked={focusAreas.includes(area.value)}
                    onCheckedChange={() => toggleFocusArea(area.value)}
                  />
                  <Label htmlFor={`focus-${area.value}`} className="cursor-pointer text-sm text-gray-700">
                    {area.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* NOTES - Optional */}
        <div className="bg-white">
          <div className="p-2">
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did the session feel? Any modifications or observations?"
              rows={4}
              className="text-sm border-gray-300"
            />
          </div>
        </div>
      </div>

      {/* Fixed bottom save action (text-only per design) */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-200 z-[100]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <button 
          onClick={saveWorkout}
          disabled={!sessionType || duration <= 0 || sessionRPE < 1 || sessionRPE > 10}
          className="w-full h-12 text-base font-medium text-black hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}
