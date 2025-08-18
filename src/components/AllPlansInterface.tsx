import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Play, Pause, Edit, Trash2, Calendar, Clock, Target, Activity, Bike, Waves, Dumbbell, ChevronDown, Moon, ArrowUpDown, Send } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import PlannedWorkoutView from './PlannedWorkoutView';

interface Plan {
  id: string;
  name: string;
  description: string;
  currentWeek?: number;
  status: 'active' | 'completed';
}

interface AllPlansInterfaceProps {
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
  onBuildWorkout: (type: string, sourceContext?: string) => void;
  onDeletePlan?: (planId: string) => void;
  currentPlans?: Plan[];
  completedPlans?: Plan[];
  detailedPlans?: any;
  onSelectWorkout?: (workout: any) => void;
}

const AllPlansInterface: React.FC<AllPlansInterfaceProps> = ({ 
  onClose, 
  onSelectPlan, 
  onBuildWorkout,
  onDeletePlan,
  currentPlans = [],
  completedPlans = [],
  detailedPlans = {},
  onSelectWorkout
}) => {
  const { plannedWorkouts, loading: plannedLoading } = usePlannedWorkouts();
  const [currentView, setCurrentView] = useState<'list' | 'detail' | 'day'>('list');
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [planStatus, setPlanStatus] = useState<string>('active');
  const [viewMode, setViewMode] = useState<'summary' | 'adjustments'>('summary');
  
  // Add workout edit mode state
  const [workoutViewMode, setWorkoutViewMode] = useState<'summary' | 'edit'>('summary');

  // Plan adjustment state
  const [adjustmentInput, setAdjustmentInput] = useState('');
  const [adjustmentHistory, setAdjustmentHistory] = useState<Array<{type: 'user' | 'system', message: string, timestamp: number}>>([]);
  const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(false);
  const [adjustmentsUsed, setAdjustmentsUsed] = useState(0);
  const [adjustmentLimit] = useState(3);

  const handlePlanClick = (planId: string) => {
    let planDetail = detailedPlans[planId as keyof typeof detailedPlans];

    // Parse weeks if stored as JSON string
    if (planDetail) {
      if (typeof planDetail.weeks === 'string') {
        try {
          planDetail.weeks = JSON.parse(planDetail.weeks);
        } catch (error) {
          console.error('Error parsing weeks JSON:', error);
        }
      }
    }

    // Fallback to basic plan info if detailed record missing
    if (!planDetail) {
      const basicPlan = [...currentPlans, ...completedPlans].find(plan => plan.id === planId);
      if (basicPlan) {
        planDetail = {
          ...basicPlan,
          weeks: (basicPlan as any).weeks || [],
          duration: (basicPlan as any).duration || (basicPlan as any).duration_weeks || 4,
          totalWorkouts: (basicPlan as any).totalWorkouts || 0,
          currentWeek: basicPlan.currentWeek || 1
        } as any;
      }
    }

    // Normalize new universal plan shape → legacy view expectations
    if (planDetail) {
      const pd: any = planDetail;

      // duration_weeks → duration
      if (!pd.duration && pd.duration_weeks) {
        pd.duration = pd.duration_weeks;
      }

      // sessions_by_week → weeks[].workouts[] expected by this view
      if (pd.sessions_by_week) {
        try {
          const weeksOut: any[] = [];
          const sessionsByWeek = pd.sessions_by_week;
          const notesByWeek = pd.notes_by_week || {};

          const weekNumbers = Object.keys(sessionsByWeek)
            .map(n => parseInt(n, 10))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);

          for (const w of weekNumbers) {
            const sessions = sessionsByWeek[w] || [];
            const workouts = (sessions as any[]).map((s, idx) => ({
              id: s.id || `${pd.id}-w${w}-${idx}`,
              name: s.discipline === 'strength' ? 'Strength' : `${s.discipline} ${s.type}`,
              type: s.discipline === 'bike' ? 'ride' : s.discipline, // map to icon set used here
              description: s.description,
              duration: s.duration || 0,
              intensity: typeof s.intensity === 'string' ? s.intensity : undefined,
              day: s.day,
              completed: false,
            }));

            weeksOut.push({
              weekNumber: w,
              title: `Week ${w}`,
              focus: Array.isArray(notesByWeek[w]) ? (notesByWeek[w][0] || '') : '',
              workouts,
            });
          }

          // If DB contains skeleton weeks, carry basic meta (weekNumber) ordering
          if (weeksOut.length === 0 && Array.isArray(pd.weeks)) {
            for (const wk of pd.weeks) {
              weeksOut.push({
                weekNumber: wk.weekNumber,
                title: `Week ${wk.weekNumber}`,
                focus: '',
                workouts: [],
              });
            }
          }

          pd.weeks = weeksOut;

          // compute totals for header
          const totalWorkouts = weeksOut.reduce((sum, wk) => sum + (wk.workouts?.length || 0), 0);
          pd.totalWorkouts = totalWorkouts;
        } catch (err) {
          console.error('Error normalizing plan detail:', err);
        }
      }

      setSelectedPlanDetail(pd);
      setSelectedWeek(pd.currentWeek || 1);
      setPlanStatus(pd.status || 'active');
      setCurrentView('detail');
    } else {
      alert('Plan details are not available. Please try again.');
    }
  };

  const handleWorkoutClick = (workout: any) => {
    setSelectedWorkout(workout);
    setWorkoutViewMode('summary'); // Reset to summary when opening workout
    setCurrentView('day');
  };

  const handleBackToWeek = () => {
    setCurrentView('detail');
    setSelectedWorkout(null);
    setWorkoutViewMode('summary');
  };

  const handleBack = () => {
    setCurrentView('list');
    setSelectedPlanDetail(null);
  };

  const handleDeletePlan = async () => {
    if (!selectedPlanDetail || !onDeletePlan) return;
    try {
      await onDeletePlan(selectedPlanDetail.id);
      handleBack();
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  };

  const handleAdjustmentSubmit = async () => {
    if (!adjustmentInput.trim() || isProcessingAdjustment) return;
    
    if (adjustmentsUsed >= adjustmentLimit) {
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: 'You have reached your adjustment limit. Upgrade to make unlimited plan changes.',
        timestamp: Date.now()
      }]);
      return;
    }

    const userMessage = adjustmentInput.trim();
    setAdjustmentHistory(prev => [...prev, {
      type: 'user',
      message: userMessage,
      timestamp: Date.now()
    }]);

    setAdjustmentInput('');
    setIsProcessingAdjustment(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const response = generateAdjustmentResponse(userMessage);
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: response,
        timestamp: Date.now()
      }]);
      setAdjustmentsUsed(prev => prev + 1);
    } catch (error) {
      setAdjustmentHistory(prev => [...prev, {
        type: 'system',
        message: 'Sorry, there was an issue processing your adjustment. Please try again.',
        timestamp: Date.now()
      }]);
    } finally {
      setIsProcessingAdjustment(false);
    }
  };

  const generateAdjustmentResponse = (request: string) => {
    const requestLower = request.toLowerCase();
    
    if (requestLower.includes('strength') && requestLower.includes('thursday')) {
      return 'I have moved your strength training sessions to Thursdays. This gives you better recovery between your Tuesday runs and weekend long sessions.';
    }
    
    if (requestLower.includes('easier') || requestLower.includes('less intense')) {
      return 'I have reduced the intensity across your plan by about 15%. Your interval sessions now target RPE 6-7 instead of 7-8.';
    }
    
    if (requestLower.includes('more recovery') || requestLower.includes('rest day')) {
      return 'I have added an extra recovery day to each week and reduced the consecutive training days.';
    }
    
    if (requestLower.includes('weekend') || requestLower.includes('sunday')) {
      return 'I have rearranged your schedule to avoid weekend commitments. Your longer sessions are now spread across weekdays.';
    }
    
    if (requestLower.includes('shorter') || requestLower.includes('time')) {
      return 'I have shortened your sessions to better fit your schedule. Most workouts are now 30-45 minutes.';
    }
    
    if (requestLower.includes('week 3') || requestLower.includes('busy week')) {
      return 'I have modified week 3 to be a lighter recovery week. This will work perfectly for your busy period.';
    }
    
    return 'I have analyzed your request and made adjustments to your plan. The changes maintain the overall training progression while addressing your specific needs.';
  };

  const getWorkoutIcon = (type: string) => {
    switch (type) {
      case 'run': return <Activity className="h-6 w-6" />;
      case 'ride': return <Bike className="h-6 w-6" />;
      case 'swim': return <Waves className="h-6 w-6" />;
      case 'strength': return <Dumbbell className="h-6 w-6" />;
      case 'rest': return <Moon className="h-6 w-6" />;
      default: return <ArrowUpDown className="h-6 w-6" />;
    }
  };
  
  const getIntensityColor = (intensity: string) => {
    switch (intensity) {
      case 'Easy': return 'bg-green-100 text-green-800 border-green-200';
      case 'Moderate': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Hard': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCompletionBadge = (workout: any) => {
    if (!workout.completed) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
          Planned
        </span>
      );
    }
    
    const ratingColors = {
      1: 'bg-red-100 text-red-800 border-red-200',
      2: 'bg-orange-100 text-orange-800 border-orange-200', 
      3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      4: 'bg-green-100 text-green-800 border-green-200',
      5: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ratingColors[workout.rating as keyof typeof ratingColors] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        ✓ {workout.rating}/5
      </span>
    );
  };
  
  const formatDuration = (minutes: number) => {
    if (!minutes && minutes !== 0) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getWeeklyVolume = (week: any) => {
    if (!week || !week.workouts) return 0;
    return week.workouts.reduce((total: number, workout: any) => {
      return total + (workout.duration || 0);
    }, 0);
  };

  // Export selected plan to Markdown (all weeks)
  const exportPlanToMarkdown = (plan: any) => {
    if (!plan) return;
    const fmtHM = (m: number) => {
      const h = Math.floor((m || 0) / 60);
      const md = (m || 0) % 60;
      return `${h}h ${md}m`;
    };

    const lines: string[] = [];
    lines.push(`# ${plan.name || 'Training Plan'}`);
    if (plan.description) lines.push(`${plan.description}`);
    const duration = plan.duration || plan.duration_weeks || (plan.weeks ? plan.weeks.length : undefined);
    if (duration) lines.push(`Duration: ${duration} weeks`);
    lines.push('');

    const weeks: any[] = (plan.weeks || []).slice().sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0));
    const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    for (const wk of weeks) {
      lines.push(`## Week ${wk.weekNumber}${wk.title ? `: ${wk.title}` : ''}`);
      if (wk.focus) lines.push(`> ${wk.focus}`);
      const groups: Record<string, any[]> = {};
      (wk.workouts || []).forEach((w: any) => {
        const d = w.day || 'Unscheduled';
        groups[d] = groups[d] ? [...groups[d], w] : [w];
      });
      const orderedDays = dayOrder.filter(d => groups[d]).concat(Object.keys(groups).filter(k => !dayOrder.includes(k)));
      for (const d of orderedDays) {
        lines.push(`### ${d}`);
        for (const w of groups[d]) {
          const meta: string[] = [];
          if (w.intensity) meta.push(`${w.intensity}`);
          if (typeof w.duration === 'number') meta.push(fmtHM(w.duration));
          lines.push(`- ${w.name}${meta.length ? ` (${meta.join(' • ')})` : ''}`);
          if (w.description) lines.push(`  - ${w.description}`);
        }
        lines.push('');
      }
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(plan.name || 'training-plan').replace(/\s+/g,'-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Day View Rendering with Summary/Edit modes
  if (currentView === 'day' && selectedWorkout) {
    const intervals = selectedWorkout.intervals || [];
    const strengthExercises = selectedWorkout.strength_exercises || [];
    const isStrengthWorkout = selectedWorkout.type === 'strength' || strengthExercises.length > 0;
    const totalTime = isStrengthWorkout ? 2400 : intervals.reduce((sum: number, interval: any) => sum + (interval.duration || 0), 0);

    // SUMMARY MODE - Clean workout overview
    if (workoutViewMode === 'summary') {
      return (
        <div key={selectedWorkout?.id} className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex justify-between items-center mb-6">
              <button onClick={handleBackToWeek} className="text-gray-600 hover:text-black transition-colors">
                ← Back to Week
              </button>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-500">
                  {new Date(selectedWorkout.date).toLocaleDateString()}
                </div>
                <button onClick={() => setWorkoutViewMode('edit')} className="text-gray-600 hover:text-black transition-colors">
                  Edit Workout
                </button>
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {selectedWorkout.name || 'Untitled Workout'}
              </h1>
              <div className="flex items-center gap-4 text-gray-600">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{formatTime(totalTime)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {getWorkoutIcon(selectedWorkout.type)}
                  <span className="capitalize">{selectedWorkout.type}</span>
                </div>
              </div>
            </div>

            {isStrengthWorkout && strengthExercises.length > 0 && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Workout Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{strengthExercises.length}</div>
                      <div className="text-sm text-gray-600">Exercises</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {Math.round(strengthExercises.reduce((total: number, ex: any) => total + (ex.sets || 0), 0))}
                      </div>
                      <div className="text-sm text-gray-600">Total Sets</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{formatTime(totalTime)}</div>
                      <div className="text-sm text-gray-600">Estimated Time</div>
                    </div>
                  </div>
                  {selectedWorkout.description && (
                    <p className="text-gray-700 leading-relaxed">{selectedWorkout.description}</p>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4">Exercises</h2>
                  <div className="space-y-3">
                    {strengthExercises.map((exercise: any, index: number) => (
                      <div key={exercise.id || index} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{exercise.name}</div>
                            {exercise.note && (
                              <div className="text-sm text-gray-600">{exercise.note}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900">
                            {exercise.sets} sets × {exercise.reps} reps
                          </div>
                          {exercise.weight && exercise.weight > 0 && (
                            <div className="text-sm text-gray-600">{exercise.weight} lbs</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isStrengthWorkout && intervals.length > 0 && (
              <div className="space-y-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Workout Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{formatTime(totalTime)}</div>
                      <div className="text-sm text-gray-600">Total Time</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{intervals.length}</div>
                      <div className="text-sm text-gray-600">Segments</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">
                        {intervals.filter((i: any) => parseInt(i.rpeTarget || '0') >= 7).length}
                      </div>
                      <div className="text-sm text-gray-600">Hard Efforts</div>
                    </div>
                  </div>
                  {selectedWorkout.description && (
                    <p className="text-gray-700 leading-relaxed">{selectedWorkout.description}</p>
                  )}
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4">Workout Structure</h2>
                  <div className="space-y-3">
                    {intervals.map((interval: any, index: number) => (
                      <div key={interval.id || index} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">{index + 1}</span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {interval.effortLabel || `Segment ${index + 1}`}
                            </div>
                            <div className="text-sm text-gray-600">
                              {interval.time || formatTime(interval.duration || 0)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          {interval.rpeTarget && (
                            <div className="font-medium text-gray-900">RPE {interval.rpeTarget}</div>
                          )}
                          {interval.paceTarget && (
                            <div className="text-sm text-gray-600">{interval.paceTarget} pace</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedWorkout.coachingNotes && (
              <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <h2 className="text-xl font-semibold text-blue-900 mb-4">Coaching Notes</h2>
                <div className="text-blue-800 leading-relaxed whitespace-pre-line">
                  {selectedWorkout.coachingNotes}
                </div>
              </div>
            )}

            <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Plan Context</h2>
              <p className="text-gray-700 leading-relaxed">
                This workout is part of your Week {selectedWeek} training in the {selectedPlanDetail?.name} plan.
                {isStrengthWorkout 
                  ? ' This strength session supports your primary training by building the muscular foundation needed for improved performance and injury prevention.'
                  : ' This endurance session builds your aerobic capacity and prepares you for the demands of your goal event.'
                }
              </p>
            </div>
          </main>
        </div>
      );
    }

    // EDIT MODE - Full workout builder interface
    return (
      <div className="min-h-screen bg-white" style={{ fontFamily: 'Inter, sans-serif' }}>
        <main className="max-w-7xl mx-auto px-3 py-2">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={() => setWorkoutViewMode('summary')}
              className="text-gray-600 hover:text-black transition-colors"
            >
              ← Back to Summary
            </button>
            <div className="text-right text-sm text-gray-500">
              {new Date(selectedWorkout.date).toLocaleDateString()}
            </div>
          </div>

          <div className="mb-4">
            <Input
              value={selectedWorkout.name || 'Untitled Workout'}
              readOnly
              className="border-gray-300 text-lg font-medium min-h-[44px]"
            />
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <Clock className="h-4 w-4" />
              <span>Total Time: {formatTime(totalTime)}</span>
            </div>
          </div>

          {/* STRENGTH WORKOUT DISPLAY */}
          {isStrengthWorkout && strengthExercises.length > 0 && (
            <div className="space-y-4 mb-6">
              {strengthExercises.map((exercise: any, index: number) => (
                <div key={exercise.id || index} className="space-y-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                      <Dumbbell className="w-3 h-3 text-gray-400" />
                    </div>
                    <div className="font-medium">{exercise.name}</div>
                    <button className="ml-auto text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-500 text-sm">
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sets</label>
                      <Input
                        value={exercise.sets || ''}
                        readOnly
                        placeholder="3"
                        className="min-h-[44px]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reps</label>
                      <Input
                        value={exercise.reps || ''}
                        readOnly
                        placeholder="10"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
                      <Input
                        value={exercise.weight || ''}
                        readOnly
                        placeholder="135"
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  {exercise.weightMode && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        Weight Mode: {exercise.weightMode === 'same' ? 'Same weight all sets' : 'Individual weight per set'}
                      </span>
                    </div>
                  )}

                  {exercise.note && (
                    <div className="text-sm text-gray-600 italic">
                      Note: {exercise.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ENDURANCE WORKOUT DISPLAY */}
          {!isStrengthWorkout && intervals.length > 0 && (
            <div className="space-y-4 mb-6">
              {intervals.map((interval: any, index: number) => (
                <div key={interval.id || index} className="space-y-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    </div>
                    <Select defaultValue={interval.effortLabel || `Segment ${index + 1}`}>
                      <SelectTrigger className="w-auto border-none shadow-none p-0 h-auto">
                        <SelectValue />
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Warmup">Warmup</SelectItem>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                        <SelectItem value="Tempo">Tempo</SelectItem>
                        <SelectItem value="Intervals">Intervals</SelectItem>
                        <SelectItem value="Recovery">Recovery</SelectItem>
                        <SelectItem value="Cooldown">Cooldown</SelectItem>
                      </SelectContent>
                    </Select>
                    <button className="ml-auto text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-500 text-sm">
                      Delete
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                      <Input
                        value={interval.time || formatTime(interval.duration || 0)}
                        readOnly
                        className="min-h-[44px]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pace {selectedWorkout.type === 'run' ? '(per mi)' : ''}
                      </label>
                      <Input
                        value={interval.paceTarget || ''}
                        readOnly
                        placeholder="8:30"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Distance {selectedWorkout.type === 'run' ? '(mi)' : '(km)'}
                      </label>
                      <Input
                        value={interval.distance || ''}
                        readOnly
                        placeholder="5.0"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">BPM</label>
                      <Input
                        value={interval.bpmTarget || ''}
                        readOnly
                        placeholder="150-160"
                        className="min-h-[44px]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">RPE</label>
                      <Input
                        value={interval.rpeTarget || ''}
                        readOnly
                        placeholder="6-7"
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4" />
                    <span className="text-sm text-gray-600">Repeat?</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center mb-6">
            <button className="flex items-center gap-2 mx-auto px-4 py-2 text-gray-600 hover:text-black transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              {isStrengthWorkout ? 'Add Exercise' : 'Add Segment'}
            </button>
          </div>

          {selectedWorkout.coachingNotes && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Coaching Notes</h3>
              <div className="text-sm text-blue-800 whitespace-pre-line">
                {selectedWorkout.coachingNotes}
              </div>
            </div>
          )}

          {selectedWorkout.description && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Description</h3>
              <div className="text-sm text-gray-700">
                {selectedWorkout.description}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Plan Detail View
  if (currentView === 'detail' && selectedPlanDetail) {
    const progress = selectedPlanDetail.duration ? Math.round((selectedPlanDetail.currentWeek / selectedPlanDetail.duration) * 100) : 0;
    const currentWeekData = selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 ? selectedPlanDetail.weeks.find((w: any) => w.weekNumber === selectedWeek) : null;
    const totalVolume = selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 ? selectedPlanDetail.weeks.reduce((total: number, week: any) => total + getWeeklyVolume(week), 0) : 0;
    const averageWeeklyVolume = selectedPlanDetail.duration && selectedPlanDetail.duration > 0 ? Math.round(totalVolume / selectedPlanDetail.duration) : 0;

    return (
      <div className="space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-center justify-between">
          <button onClick={handleBack} className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Plans
          </button>
          
          <div className="flex items-center gap-2">
            {planStatus === 'active' ? (
              <button onClick={() => setPlanStatus('paused')} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : (
              <button onClick={() => setPlanStatus('active')} className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
                <Play className="h-4 w-4" />
                Resume
              </button>
            )}

            <button onClick={() => exportPlanToMarkdown(selectedPlanDetail)} className="hidden md:flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
              Export
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black transition-colors">
              <Edit className="h-4 w-4" />
              Modify
            </button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-800 transition-colors">
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Plan</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{selectedPlanDetail.name}"? This will also delete all associated workouts. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeletePlan} className="bg-red-600 hover:bg-red-700">
                    Delete Plan
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold">{selectedPlanDetail.name}</h1>
                <p className="text-gray-600 mt-1">{selectedPlanDetail.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${planStatus === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {planStatus}
              </span>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{selectedPlanDetail.duration || 0}</div>
                <div className="text-sm text-gray-600">Weeks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{selectedPlanDetail.totalWorkouts || 0}</div>
                <div className="text-sm text-gray-600">Workouts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatDuration(totalVolume)}</div>
                <div className="text-sm text-gray-600">Total Time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{formatDuration(averageWeeklyVolume)}</div>
                <div className="text-sm text-gray-600">Avg/Week</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>Week {selectedPlanDetail.currentWeek || 1} of {selectedPlanDetail.duration || 0}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-black rounded-full h-2 transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 && (
          <div className="flex items-center gap-8 border-b border-gray-200">
            <button
              onClick={() => setViewMode('summary')}
              className={`pb-3 transition-colors ${viewMode === 'summary' ? 'text-black border-b-2 border-black' : 'text-gray-600 hover:text-black'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setViewMode('adjustments')}
              className={`pb-3 transition-colors ${viewMode === 'adjustments' ? 'text-black border-b-2 border-black' : 'text-gray-600 hover:text-black'}`}
            >
              Ask for adjustments
            </button>
          </div>
        )}

        {viewMode === 'adjustments' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">
                Plan adjustments: {adjustmentsUsed} of {adjustmentLimit} used
              </div>
              {adjustmentsUsed >= adjustmentLimit && (
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  Upgrade for unlimited adjustments
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={adjustmentInput}
                onChange={(e) => setAdjustmentInput(e.target.value)}
                placeholder="Describe what you'd like to change about your plan..."
                className="flex-1 min-h-[44px] max-h-[120px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAdjustmentSubmit();
                  }
                }}
                disabled={adjustmentsUsed >= adjustmentLimit}
              />
              <button
                onClick={handleAdjustmentSubmit}
                disabled={!adjustmentInput.trim() || isProcessingAdjustment || adjustmentsUsed >= adjustmentLimit}
                className="h-auto px-4 py-2 text-gray-600 hover:text-black transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 min-h-[200px] max-h-[400px] overflow-y-auto">
              {adjustmentHistory.length === 0 ? (
                <div className="text-center py-8">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    What would you like to adjust about your plan?
                  </h3>
                  
                  <div className="space-y-2 max-w-md mx-auto">
                    {[
                      "Move strength training to Thursday",
                      "Make week 2 easier",
                      "I need more recovery days",
                      "Avoid weekend workouts",
                      "Shorter session times"
                    ].map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setAdjustmentInput(suggestion)}
                        className="block w-full p-3 text-left text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                adjustmentHistory.map((message, index) => (
                  <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-2xl p-4 rounded-lg ${message.type === 'user' ? 'bg-black text-white' : 'bg-gray-100 text-gray-900'}`}>
                      <p className="leading-relaxed">{message.message}</p>
                    </div>
                  </div>
                ))
              )}
              
              {isProcessingAdjustment && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      <span className="text-sm text-gray-600 ml-2">Processing your adjustment...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {selectedPlanDetail.weeks && selectedPlanDetail.weeks.length > 0 && (
              <div className="flex items-center gap-6 overflow-x-auto py-4">
                {selectedPlanDetail.weeks.map((week: any) => (
                  <button
                    key={week.weekNumber}
                    onClick={() => setSelectedWeek(week.weekNumber)}
                    className={`whitespace-nowrap pb-2 transition-colors ${selectedWeek === week.weekNumber ? 'text-black border-b-2 border-black font-medium' : 'text-gray-600 hover:text-black'}`}
                  >
                    Week {week.weekNumber}
                    {week.weekNumber === selectedPlanDetail.currentWeek && (
                      <span className="ml-2 text-xs text-blue-600">Current</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {currentWeekData && (
              <div className="border border-gray-200 rounded-lg">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold mb-2">
                    Week {currentWeekData.weekNumber}: {currentWeekData.title}
                  </h2>
                  <p className="text-gray-600 mb-4">{currentWeekData.focus}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatDuration(getWeeklyVolume(currentWeekData))} total
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-4 w-4" />
                      {currentWeekData.workouts ? currentWeekData.workouts.filter((w: any) => w.type !== 'rest').length : 0} workouts
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {(() => {
                      const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
                      const groups: Record<string, any[]> = {};
                      (currentWeekData.workouts || []).forEach((w: any) => {
                        const d = w.day || 'Unscheduled';
                        groups[d] = groups[d] ? [...groups[d], w] : [w];
                      });
                      const keys = dayOrder.filter(d => groups[d]).concat(Object.keys(groups).filter(k => !dayOrder.includes(k)));
                      return keys.map(day => (
                        <div key={day} className="border border-gray-200 rounded">
                          <div className="px-3 py-2 text-sm font-medium">{day}</div>
                          <div className="px-3 pb-3 space-y-3">
                            {groups[day].map((workout: any, index: number) => (
                              <div
                                key={workout.id || `workout-${day}-${index}`}
                                onClick={() => handleWorkoutClick(workout)}
                                className={`p-4 rounded-lg border transition-colors cursor-pointer ${workout.type === 'rest' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium">{workout.name}</div>
                                    <div className="text-sm text-gray-600 mt-1">{workout.description}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {getCompletionBadge(workout)}
                                    {workout.intensity && (
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getIntensityColor(workout.intensity)}`}>
                                        {workout.intensity}
                                      </span>
                                    )}
                                    {!workout.completed && workout.duration && (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                        {formatDuration(workout.duration)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {(!selectedPlanDetail.weeks || selectedPlanDetail.weeks.length === 0) && (
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Plan Details Loading</h3>
                <p className="text-gray-600 mb-4">Detailed workout information is being prepared...</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Plans List View
  return (
    <div className="space-y-6" style={{fontFamily: 'Inter, sans-serif'}}>
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-2 p-0 h-auto text-gray-600 hover:text-black transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          {plannedWorkouts.length > 0 && (
            <>
              <Button
                onClick={() => onBuildWorkout('run', 'plans')}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                + Add Workout
              </Button>
              <Button
                onClick={() => window.location.href = '/demo'}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                View All ({plannedWorkouts.length})
              </Button>
            </>
          )}
        </div>
      </div>

      {currentPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Current Plans</h2>
          {currentPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name} - Wk {plan.currentWeek}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
            </div>
          ))}
        </div>
      )}

      {completedPlans.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Completed Plans</h2>
          {completedPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => handlePlanClick(plan.id)}
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors rounded-lg border border-gray-200"
            >
              <div className="font-medium">{plan.name}</div>
              <div className="text-sm text-gray-600 mt-1">{plan.description}</div>
              <div className="text-xs text-green-600 mt-1">✓ Completed</div>
            </div>
          ))}
        </div>
      )}

      {/* Planned Workouts Section */}
      {plannedWorkouts.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-gray-900">Planned Workouts</h2>
          <div className="space-y-2">
            {plannedWorkouts.slice(0, 5).map((workout) => (
              <div 
                key={workout.id} 
                className="border-l-2 border-blue-200 pl-4 py-2 cursor-pointer hover:bg-gray-50 rounded"
                onClick={() => {
                  if (onSelectWorkout) onSelectWorkout(workout);
                }}
              >
                <PlannedWorkoutView 
                  workout={workout}
                  compact={true}
                  showHeader={false}
                  onDelete={async () => {
                    if (confirm('Delete this planned workout? This action cannot be undone.')) {
                      try {
                        await deletePlannedWorkout(workout.id);
                        // The hook will automatically update the local state
                      } catch (error) {
                        console.error('Error deleting planned workout:', error);
                      }
                    }
                  }}
                />
              </div>
            ))}
            {plannedWorkouts.length > 5 && (
              <div className="text-center py-2">
                <span className="text-sm text-gray-500">
                  +{plannedWorkouts.length - 5} more planned workouts
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {currentPlans.length === 0 && completedPlans.length === 0 && plannedWorkouts.length === 0 && (
        <div className="text-center py-8">
          <h2 className="text-lg font-medium text-gray-900 mb-2">No Plans Yet</h2>
          <p className="text-gray-600 mb-4">Use "Build me a plan" in the Builder tab to create your first training plan, or create individual workouts in the Builder tab</p>
        </div>
      )}
    </div>
  );
};

export default AllPlansInterface;