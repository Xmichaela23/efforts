import React, { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WorkoutDetail from './WorkoutDetail';
import StrengthCompareTable from './StrengthCompareTable';
import CompletedTab from './CompletedTab';

interface WorkoutSummaryProps {
  workout: any;
  onClose: () => void;
  onDelete?: (workoutId: string) => void;
}

export default function WorkoutSummary({ workout, onClose, onDelete }: WorkoutSummaryProps) {
  console.log('🚨 NEW CLEAN WORKOUT SUMMARY LOADED');
  console.log('🔍 Workout intervals:', workout.intervals);
  console.log('🔍 Full workout object:', JSON.stringify(workout, null, 2));
  const { useImperial, workouts } = useAppContext();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [workoutStatus, setWorkoutStatus] = useState(workout?.status || workout?.workout_status || 'planned');
  const [activeTab, setActiveTab] = useState('summary');
  const completedStrengthForDay = React.useMemo(()=>{
    if (!workout?.date || workout?.type !== 'strength') return null;
    // Match on same date, prefer completed saved workout with strength_exercises
    const match = workouts.find(w => (w as any).date === workout.date && (w as any).type === 'strength' && ((w as any).workout_status === 'completed' || (w as any).status === 'completed')) || null;
    return match;
  }, [workouts, workout]);

  if (!workout) {
    return (
      <div className="p-3 space-y-4">
        <div className="text-center py-8 text-gray-500">
          No workout selected
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleMarkComplete = () => {
    setWorkoutStatus('completed');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Delete this workout?')) return;
    
    if (onDelete && workout.id) {
      onDelete(workout.id);
    }
  };

  const getWorkoutTypeColor = (type: string) => {
    switch (type) {
      case 'run': return 'text-green-600';
      case 'ride': return 'text-blue-600';
      case 'strength': return 'text-orange-600';
      case 'swim': return 'text-cyan-600';
      default: return 'text-gray-600';
    }
  };

  const getWorkoutType = () => {
    if (workout.type === 'run') return 'run';
    if (workout.type === 'ride') return 'ride';
    if (workout.type === 'swim') return 'swim';
    if (workout.type === 'strength') return 'strength';
    
    // Fallback logic for legacy names
    if (workout.name.toLowerCase().includes('run')) return 'run';
    if (workout.name.toLowerCase().includes('cycle') || workout.name.toLowerCase().includes('ride')) return 'ride';
    if (workout.name.toLowerCase().includes('swim')) return 'swim';
    
    return 'ride'; // default to ride for cycling files
  };

  const handleUpdateWorkout = (workoutId: string, updates: any) => {
    console.log('Updating workout:', workoutId, updates);
  };

  const isCompleted = workoutStatus === 'completed';
  const hasNotes = workout.notes || workout.description;

  return (
    <div className="p-3 space-y-4" style={{listStyle: 'none', listStyleType: 'none'}}>
      <style jsx>{`
        * {
          list-style: none !important;
          list-style-type: none !important;
        }
        *::before, *::after {
          content: none !important;
        }
      `}</style>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="data-[state=active]:bg-gray-300 data-[state=active]:text-gray-800">Planned</TabsTrigger>
          <TabsTrigger value="detail" className="data-[state=active]:bg-gray-300 data-[state=active]:text-gray-800">Compare</TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-gray-300 data-[state=active]:text-gray-800">Detail</TabsTrigger>
        </TabsList>

        {/* Summary Tab - Original WorkoutSummary Content */}
        <TabsContent value="summary" className="space-y-4 mt-4">
          {/* Strength side-by-side comparison */}
          {workout.type === 'strength' && (
            <div className="space-y-4">
              {workout.strength_exercises && (
                <StrengthCompareTable
                  planned={(workout.strength_exercises || []).map((ex: any)=>({ name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight }))}
                  completed={completedStrengthForDay ? ((completedStrengthForDay as any).strength_exercises || []).map((ex: any)=>({ name: ex.name, setsArray: Array.isArray(ex.sets)?ex.sets:[] })) : []}
                />
              )}
              {!completedStrengthForDay && (
                <div className="text-sm text-gray-500">No completed strength data yet for this day.</div>
              )}
            </div>
          )}
          {/* Description */}
          {workout.description && (
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Description</h3>
              <p className="text-gray-600">{workout.description}</p>
            </div>
          )}

          {/* Intervals */}
          {workout.intervals && workout.intervals.length > 0 && (
            <div className="space-y-3">
              {workout.intervals.map((interval: any, index: number) => (
                <div key={interval.id || index} className="space-y-1">
                  <h4 className="font-medium text-lg">
                    {interval.effortLabel || interval.name || `SEGMENT ${index + 1}`}
                  </h4>
                  <div className="space-y-1 text-gray-600">
                    {isCompleted ? (
                      /* Completed view - unpack repeats */
                      <div>
                        {interval.isRepeatBlock ? (
                          <div className="space-y-1">
                            <p>{interval.time} planned:</p>
                            <div className="ml-4 space-y-1">
                              {Array.from({ length: interval.repeatCount || 1 }, (_, i) => (
                                <div key={i} className="space-y-1">
                                  <p className="font-medium text-sm">Repeat {i + 1}:</p>
                                  <p className="ml-4">4:00 @ Hard planned → 4:02 actual (6:15 pace, HR: 165 avg)</p>
                                  <p className="ml-4">1:00 @ Easy planned → 58s actual (8:30 pace, HR: 145 avg)</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p>{interval.time} planned → {interval.time} actual (N/A pace, HR: N/A avg)</p>
                        )}
                      </div>
                    ) : (
                      /* Planned view - clean and simple */
                      <div>
                        <p>{interval.time} @ {interval.effortLabel || 'Easy'} pace</p>
                        {interval.bpmTarget && <p>HR: {interval.bpmTarget} bpm</p>}
                        {interval.paceTarget && <p>Pace: {interval.paceTarget}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Strength Exercises (planned-only listing when not using comparison) */}
          {workout.type !== 'strength' && workout.strength_exercises && workout.strength_exercises.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">EXERCISES</h3>
              {workout.strength_exercises.map((exercise: any, index: number) => (
                <div key={exercise.id || index} className="space-y-1">
                  <h4 className="font-medium text-lg">{exercise.name}</h4>
                  <div className="text-gray-600">
                    <p>{exercise.sets} sets × {exercise.reps} reps @ {exercise.weight} {useImperial ? 'lbs' : 'kg'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expandable Notes */}
          {hasNotes && (
            <div className="space-y-2">
              <button
                onClick={() => setNotesExpanded(!notesExpanded)}
                className="flex items-center gap-2 font-semibold text-lg hover:text-blue-600"
              >
                {notesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                NOTES
              </button>
              {notesExpanded && (
                <div className="text-gray-600 whitespace-pre-wrap">
                  {workout.notes || workout.description}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Detail Tab - Planned vs Executed Comparison */}
        <TabsContent value="detail" className="mt-4">
          <WorkoutDetail
            workout={workout}
            onUpdateWorkout={handleUpdateWorkout}
            activeTab="summary"
            onTabChange={() => {}}
            onClose={onClose}
          />
        </TabsContent>

        {/* Completed Tab - Full Analytics */}
        <TabsContent value="completed" className="mt-4">
          <CompletedTab
            workoutType={getWorkoutType() as 'ride' | 'run' | 'swim' | 'strength'}
            workoutData={workout}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}