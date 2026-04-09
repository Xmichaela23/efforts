import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
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
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [duration, setDuration] = useState<number>(60);
  const [sessionRPE, setSessionRPE] = useState<number>(5);
  const [sessionType, setSessionType] = useState<PilatesYogaSessionType | ''>('');
  
  // Optional fields
  const [sessionFeeling, setSessionFeeling] = useState<SessionFeeling | ''>('');
  const [environment, setEnvironment] = useState<Environment | ''>('');
  const [isHeated, setIsHeated] = useState(false);
  const [instructor, setInstructor] = useState('');
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [studioName, setStudioName] = useState('');
  const [teacherRating, setTeacherRating] = useState<number>(5);
  const [notes, setNotes] = useState('');
  
  // UI state
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const isMountedRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    // Initialize date - use targetDate, scheduledWorkout date, or today
    const initialDate = targetDate || scheduledWorkout?.date || getDateString();
    setSelectedDate(initialDate);
    
    // Check for existing planned workout data
    let workoutToLoad = scheduledWorkout;
    
    if (!workoutToLoad) {
      const dateStr = initialDate;
      const currentPlanned = (workouts || []) as any[];
      const todaysPilatesYogaWorkouts = currentPlanned.filter((w: any) => 
        String(w?.date) === dateStr && 
        String(w?.type || '').toLowerCase() === 'pilates_yoga' && 
        String((w as any)?.workout_status || '').toLowerCase() === 'planned'
      );

      if (todaysPilatesYogaWorkouts.length > 0) {
        workoutToLoad = todaysPilatesYogaWorkouts[0];
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
      if (metadata.studio_name) {
        setStudioName(metadata.studio_name);
      }
      if (metadata.teacher_rating) {
        setTeacherRating(metadata.teacher_rating);
      }
      if (metadata.notes) {
        setNotes(metadata.notes);
      }
      if (workoutToLoad.duration) {
        setDuration(workoutToLoad.duration);
      }
      // Set date from workout if available
      if (workoutToLoad.date) {
        setSelectedDate(workoutToLoad.date);
      }
    }
    
    setIsInitialized(true);

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
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

  // Helper: get teacher rating label
  const getTeacherRatingLabel = (rating: number): string => {
    if (rating <= 2) return 'Poor';
    if (rating <= 4) return 'Fair';
    if (rating <= 6) return 'Good';
    if (rating <= 8) return 'Very Good';
    return 'Excellent';
  };

  // Check if session type is yoga (for showing heated checkbox)
  const isYogaSession = sessionType ? sessionType.startsWith('yoga_') : false;

  const saveWorkout = async () => {
    // Validation
    const workoutDate = selectedDate || getDateString();
    if (!workoutDate) {
      alert('Date is required');
      return;
    }
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

    // Set loading state
    setIsSaving(true);
    setIsSaved(false);

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
      focus_area: focusAreas.length > 0 ? focusAreas : undefined,
      studio_name: studioName.trim() || undefined,
      teacher_rating: teacherRating && teacherRating >= 1 && teacherRating <= 10 ? teacherRating : undefined
    });
    
    // Prepare the workout data
    const completedWorkout = {
      id: isEditingCompleted ? scheduledWorkout.id : Date.now().toString(),
      name: scheduledWorkout?.name || `${SESSION_TYPES.find(t => t.value === sessionType)?.label || 'Pilates/Yoga'} - ${new Date().toLocaleDateString()}`,
      type: 'pilates_yoga' as const,
      date: workoutDate,
      description: `${SESSION_TYPES.find(t => t.value === sessionType)?.label || 'Pilates/Yoga'} session`,
      duration: finalDuration,
      workout_status: 'completed' as const,
      completedManually: true,
      workout_metadata: workoutMetadata,
      planned_id: sourcePlannedId || undefined
    };

    // Save: update in place when editing an existing workout id; otherwise create new
    let saved: any = null;
    try {
      if (isEditingCompleted) {
        saved = await updateWorkout(String(scheduledWorkout.id), completedWorkout as any);
      } else {
        saved = await addWorkout(completedWorkout);
      }

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
      } catch (workloadError) {
      }

      // Auto-attach to planned workout if possible
      try {
        const workoutId = saved?.id || completedWorkout.id;
        
        await supabase.functions.invoke('auto-attach-planned', {
          body: { workout_id: workoutId }
        });
      } catch (attachError) {
      }
    } catch (e: any) {
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setIsSaving(false);
        setIsSaved(false);
      }
      alert(`Failed to save workout: ${e.message}`);
      return;
    }

    // Show success state
    setIsSaving(false);
    setIsSaved(true);
    
    // Auto-close after showing success for 1.5 seconds
    saveTimeoutRef.current = setTimeout(() => {
      // Only proceed if component is still mounted
      if (!isMountedRef.current) return;
      
      // Navigate to completed view
      if (onWorkoutSaved) {
        onWorkoutSaved(saved || completedWorkout);
      } else {
        alert(`Pilates/Yoga workout saved! Duration: ${finalDuration} minutes`);
        onClose();
      }
    }, 1500);
  };

  const panelClass =
    'rounded-2xl border-2 border-white/20 bg-white/[0.05] px-3 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-xl';
  const fieldClass =
    'h-9 border-2 border-white/20 bg-white/[0.08] text-sm text-white/90 placeholder:text-white/35 focus-visible:border-white/35 focus-visible:ring-0 rounded-xl';
  const selectContentClass =
    'z-[200] border-2 border-white/30 bg-[#1a1a2e] text-white shadow-xl backdrop-blur-xl';

  if (!isInitialized) {
    return (
      <div
        className="fixed inset-0 z-[40] flex flex-col"
        style={{ background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)' }}
      >
        <div style={{ height: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px))' }} />
        <div className="px-4 pt-2">
          <div className={panelClass}>
            <h1 className="text-xl font-medium text-white/90" style={{ fontFamily: 'Inter, sans-serif' }}>
              Loading…
            </h1>
            <p className="mt-1 text-xs font-light text-white/50" style={{ fontFamily: 'Inter, sans-serif' }}>
              Preparing your session
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[40] flex flex-col"
      style={{ background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)' }}
    >
      <div className="flex-1 overflow-y-auto overscroll-contain pb-28" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{ height: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px))' }} />

        <div className="mx-auto w-full max-w-lg space-y-3 px-3">
          <div className={panelClass}>
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-medium text-white/90" style={{ fontFamily: 'Inter, sans-serif' }}>
                {scheduledWorkout ? `Log: ${scheduledWorkout.name}` : 'Log Pilates/Yoga'}
              </h1>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-8 shrink-0 rounded-full border-2 border-white/20 bg-white/[0.08] px-2 py-1 text-xs text-white/90 hover:border-white/30 focus-visible:border-white/35 focus-visible:ring-0"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
            </div>
            <p className="mt-1 text-xs font-light text-white/50" style={{ fontFamily: 'Inter, sans-serif' }}>
              Session RPE and type match how workload is calculated
            </p>
          </div>

          <div className={panelClass}>
            <h3 className="mb-3 text-sm font-medium text-white/80" style={{ fontFamily: 'Inter, sans-serif' }}>
              Session details
            </h3>

            <div className="mb-3">
              <Label className="mb-2 block text-xs font-medium text-white/60">Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="240"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={`${fieldClass} max-w-[120px] text-center`}
                  style={{ fontSize: '16px' }}
                  placeholder="60"
                />
                <span className="text-sm text-white/55">minutes</span>
              </div>
            </div>

            <div className="mb-3">
              <Label className="mb-2 block text-xs font-medium text-white/60">
                RPE (1–10)
                <span className="ml-1 font-light text-white/45">Overall effort for this session</span>
              </Label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={sessionRPE}
                  onChange={(e) => setSessionRPE(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-white"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">Easy</span>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-white/95">{sessionRPE}</div>
                    <div className="text-xs text-white/50">{getRPELabel(sessionRPE)}</div>
                  </div>
                  <span className="text-xs text-white/45">Maximal</span>
                </div>
              </div>
            </div>

            <div className="mb-1">
              <Label className="mb-2 block text-xs font-medium text-white/60">Session type</Label>
              <Select value={sessionType} onValueChange={(value: PilatesYogaSessionType) => setSessionType(value)}>
                <SelectTrigger className={`${fieldClass} h-10 w-full`}>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  {SESSION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="focus:bg-white/15">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={panelClass}>
            <button
              type="button"
              onClick={() => setShowOptionalFields(!showOptionalFields)}
              className="flex w-full items-center justify-between text-sm font-medium text-white/80 hover:text-white"
            >
              <span>Additional info (optional)</span>
              {showOptionalFields ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showOptionalFields && (
              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                <div>
                  <Label className="mb-2 block text-xs font-medium text-white/60">Session feeling</Label>
                  <Select
                    value={sessionFeeling || '__none__'}
                    onValueChange={(value: string) =>
                      setSessionFeeling(value === '__none__' ? '' : (value as SessionFeeling))
                    }
                  >
                    <SelectTrigger className={`${fieldClass} h-10 w-full`}>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      <SelectItem value="__none__" className="focus:bg-white/15">
                        None
                      </SelectItem>
                      {SESSION_FEELINGS.map((feeling) => (
                        <SelectItem key={feeling.value} value={feeling.value} className="focus:bg-white/15">
                          {feeling.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block text-xs font-medium text-white/60">Environment</Label>
                  <Select
                    value={environment || '__none__'}
                    onValueChange={(value: string) =>
                      setEnvironment(value === '__none__' ? '' : (value as Environment))
                    }
                  >
                    <SelectTrigger className={`${fieldClass} h-10 w-full`}>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass}>
                      <SelectItem value="__none__" className="focus:bg-white/15">
                        None
                      </SelectItem>
                      {ENVIRONMENTS.map((env) => (
                        <SelectItem key={env.value} value={env.value} className="focus:bg-white/15">
                          {env.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isYogaSession && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is-heated"
                      checked={isHeated}
                      onCheckedChange={(checked) => setIsHeated(checked === true)}
                      className="border-white/40 data-[state=checked]:bg-white/20"
                    />
                    <Label htmlFor="is-heated" className="cursor-pointer text-sm text-white/75">
                      Heated / hot room
                    </Label>
                  </div>
                )}

                <div>
                  <Label className="mb-2 block text-xs font-medium text-white/60">Instructor (optional)</Label>
                  <Input
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="e.g. Sarah Johnson"
                    className={fieldClass}
                  />
                </div>
              </div>
            )}
          </div>

          <div className={panelClass}>
            <Label className="mb-2 block text-xs font-medium text-white/60">Focus areas (optional)</Label>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_AREAS.map((area) => (
                <div key={area.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`focus-${area.value}`}
                    checked={focusAreas.includes(area.value)}
                    onCheckedChange={() => toggleFocusArea(area.value)}
                    className="border-white/40 data-[state=checked]:bg-white/20"
                  />
                  <Label htmlFor={`focus-${area.value}`} className="cursor-pointer text-sm text-white/75">
                    {area.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className={panelClass}>
            <Label className="mb-2 block text-xs font-medium text-white/60">Studio / teacher (optional)</Label>
            <div className="mb-3">
              <Input
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                placeholder="e.g. CorePower Yoga"
                className={fieldClass}
              />
            </div>
            <div>
              <Label className="mb-2 block text-xs font-medium text-white/60">
                Teacher rating (1–10)
                <span className="ml-1 font-light text-white/45">Optional</span>
              </Label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={teacherRating}
                  onChange={(e) => setTeacherRating(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-white"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/45">Poor</span>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-white/95">{teacherRating}</div>
                    <div className="text-xs text-white/50">{getTeacherRatingLabel(teacherRating)}</div>
                  </div>
                  <span className="text-xs text-white/45">Excellent</span>
                </div>
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <Label className="mb-2 block text-xs font-medium text-white/60">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Modifications, highlights, anything you want to remember"
              rows={4}
              className={`${fieldClass} min-h-[100px] resize-y`}
            />
          </div>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-[45] border-t border-white/15 bg-black/50 px-4 py-3 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <button
          type="button"
          onClick={saveWorkout}
          disabled={!sessionType || duration <= 0 || sessionRPE < 1 || sessionRPE > 10 || isSaving || isSaved}
          className="h-12 w-full rounded-full border-2 border-white/25 bg-white/[0.08] text-base font-medium text-white/90 transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Save
        </button>
      </div>

      {(isSaving || isSaved) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl border-2 border-white/25 bg-[#1a1a2e]/95 p-8 shadow-xl backdrop-blur-xl">
            {isSaving ? (
              <div className="flex flex-col items-center justify-center">
                <Loader2 className="mb-4 h-12 w-12 animate-spin text-white/80" />
                <p className="text-lg font-medium text-white/90">Saving workout…</p>
                <p className="mt-2 text-sm text-white/50">You can leave this screen; it will finish in the background</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <CheckCircle className="mb-4 h-12 w-12 text-emerald-400" />
                <p className="text-lg font-medium text-white/90">Saved</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
