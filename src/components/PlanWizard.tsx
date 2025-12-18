import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

// ============================================================================
// TYPES
// ============================================================================

type Discipline = 'run' | 'ride' | 'swim' | 'triathlon' | 'hybrid';
type Distance = '5k' | '10k' | 'half' | 'marathon';
type Fitness = 'beginner' | 'intermediate' | 'advanced';
type Goal = 'complete' | 'speed';
type Approach = 'balanced_build' | 'time_efficient' | 'volume_progression' | 'cumulative_load' | 'hybrid_athlete';
type DaysPerWeek = '3-4' | '4-5' | '5-6' | '6-7';

interface WizardState {
  discipline: Discipline | null;
  distance: Distance | null;
  fitness: Fitness | null;
  goal: Goal | null;
  duration: number;
  startDate: string; // ISO date string
  approach: Approach | null;
  daysPerWeek: DaysPerWeek | null;
  strengthFrequency: 0 | 1 | 2 | 3;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APPROACH_CONSTRAINTS: Record<Approach, { supported_days: DaysPerWeek[]; description: string }> = {
  'balanced_build': {
    supported_days: ['4-5', '5-6', '6-7'],
    description: 'Phase-based progression with structured quality sessions'
  },
  'time_efficient': {
    supported_days: ['3-4'],
    description: '3 focused runs per week, cross-training on other days'
  },
  'volume_progression': {
    supported_days: ['5-6', '6-7'],
    description: 'High mileage approach with medium-long runs midweek'
  },
  'cumulative_load': {
    supported_days: ['5-6', '6-7'],
    description: 'Train on tired legs, long runs capped at 16 miles'
  },
  'hybrid_athlete': {
    supported_days: ['4-5', '5-6'],
    description: 'Integrated strength training with interference management'
  }
};

// ============================================================================
// GATING LOGIC
// ============================================================================

function getAvailableApproaches(fitness: Fitness | null, goal: Goal | null): Approach[] {
  const all: Approach[] = ['balanced_build', 'time_efficient', 'volume_progression', 'cumulative_load', 'hybrid_athlete'];
  
  // Always available
  const available: Approach[] = ['balanced_build', 'time_efficient', 'hybrid_athlete'];
  
  // Volume Progression & Cumulative Load: intermediate/advanced + speed only
  if (fitness !== 'beginner' && goal === 'speed') {
    available.push('volume_progression', 'cumulative_load');
  }
  
  return all.filter(a => available.includes(a));
}

function getAvailableDays(approach: Approach | null): DaysPerWeek[] {
  if (!approach) return ['3-4', '4-5', '5-6', '6-7'];
  return APPROACH_CONSTRAINTS[approach].supported_days;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface GeneratedPlan {
  plan_id: string;
  name: string;
  description: string;
  duration_weeks: number;
  first_week_sessions: any[];
  preview: any;
}

export default function PlanWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  
  // Default to next Monday
  const getNextMonday = () => {
    const today = new Date();
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday.toISOString().split('T')[0];
  };

  const [state, setState] = useState<WizardState>({
    discipline: null,
    distance: null,
    fitness: null,
    goal: null,
    duration: 12,
    startDate: getNextMonday(),
    approach: null,
    daysPerWeek: null,
    strengthFrequency: 0
  });

  const updateState = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
    
    // Reset dependent fields when parent changes
    if (key === 'fitness' || key === 'goal') {
      setState(prev => ({ ...prev, [key]: value, approach: null, daysPerWeek: null }));
    }
    if (key === 'approach') {
      setState(prev => ({ ...prev, [key]: value, daysPerWeek: null }));
    }
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return state.discipline !== null;
      case 1: return state.distance !== null;
      case 2: return state.fitness !== null;
      case 3: return state.goal !== null;
      case 4: return state.duration >= 4;
      case 5: return state.startDate !== '';
      case 6: return state.approach !== null;
      case 7: return state.daysPerWeek !== null;
      case 8: return true; // Strength is optional
      default: return false;
    }
  };

  const handleNext = () => {
    if (step === 0 && state.discipline !== 'run') {
      // Non-run disciplines do nothing for now
      return;
    }
    if (step < 8) {
      setStep(step + 1);
    } else {
      handleGenerate();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateProgress(0);
    setError(null);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setGenerateProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to generate a plan');
        setIsGenerating(false);
        clearInterval(progressInterval);
        return;
      }

      setGenerateProgress(20);

      const response = await supabase.functions.invoke('generate-run-plan', {
        body: {
          user_id: user.id,
          distance: state.distance,
          fitness: state.fitness,
          goal: state.goal,
          duration_weeks: state.duration,
          start_date: state.startDate,
          approach: state.approach,
          days_per_week: state.daysPerWeek,
          strength_frequency: state.strengthFrequency
        }
      });

      clearInterval(progressInterval);
      setGenerateProgress(95);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate plan');
      }

      setGenerateProgress(100);

      // Fetch the plan to get first week sessions
      const { data: planData } = await supabase
        .from('plans')
        .select('name, description, sessions_by_week')
        .eq('id', result.plan_id)
        .single();

      const firstWeekSessions = planData?.sessions_by_week?.['1'] || [];

      // Store generated plan for preview
      setGeneratedPlan({
        plan_id: result.plan_id,
        name: planData?.name || result.preview?.name || 'Training Plan',
        description: planData?.description || result.preview?.description || '',
        duration_weeks: state.duration,
        first_week_sessions: firstWeekSessions,
        preview: result.preview
      });

    } catch (err) {
      clearInterval(progressInterval);
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (!generatedPlan) return;
    
    // Show toast with info about background processing
    toast({
      title: "Building your schedule",
      description: "This takes about 30 seconds. Feel free to leave - your plan will be ready when you return.",
      duration: 10000,
    });

    // Navigate to dashboard
    navigate('/');
    
    // Activate in background
    supabase.functions.invoke('activate-plan', {
      body: { plan_id: generatedPlan.plan_id }
    }).then(() => {
      // Trigger plans refresh
      window.dispatchEvent(new CustomEvent('plans:refresh'));
      
      toast({
        title: "Plan ready!",
        description: "Your training schedule is now in the Plans menu.",
        duration: 5000,
      });
    }).catch(err => {
      console.error('Activation error:', err);
      toast({
        title: "Activation issue", 
        description: "Plan saved. Try refreshing the app.",
        variant: "destructive",
        duration: 8000,
      });
    });
  };

  const handleReject = async () => {
    if (!generatedPlan) return;
    
    // Delete the generated plan
    await supabase
      .from('plans')
      .delete()
      .eq('id', generatedPlan.plan_id);

    // Go back to wizard
    setGeneratedPlan(null);
    setStep(8); // Back to last step
  };

  // ============================================================================
  // RENDER STEPS
  // ============================================================================

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepContainer title="Select discipline">
            <RadioGroup
              value={state.discipline || ''}
              onValueChange={(v) => updateState('discipline', v as Discipline)}
              className="space-y-3"
            >
              <RadioOption value="run" label="Run" />
              <RadioOption value="ride" label="Ride" disabled />
              <RadioOption value="swim" label="Swim" disabled />
              <RadioOption value="triathlon" label="Triathlon" disabled />
              <RadioOption value="hybrid" label="Hybrid" disabled />
            </RadioGroup>
          </StepContainer>
        );

      case 1:
        return (
          <StepContainer title="What distance?">
            <RadioGroup
              value={state.distance || ''}
              onValueChange={(v) => updateState('distance', v as Distance)}
              className="space-y-3"
            >
              <RadioOption value="5k" label="5K" />
              <RadioOption value="10k" label="10K" />
              <RadioOption value="half" label="Half Marathon" />
              <RadioOption value="marathon" label="Marathon" />
            </RadioGroup>
          </StepContainer>
        );

      case 2:
        return (
          <StepContainer title="Current fitness level">
            <RadioGroup
              value={state.fitness || ''}
              onValueChange={(v) => updateState('fitness', v as Fitness)}
              className="space-y-3"
            >
              <RadioOption value="beginner" label="Beginner" description="0-20 miles per week" />
              <RadioOption value="intermediate" label="Intermediate" description="20-40 miles per week" />
              <RadioOption value="advanced" label="Advanced" description="40+ miles per week" />
            </RadioGroup>
          </StepContainer>
        );

      case 3:
        return (
          <StepContainer title="What's your goal?">
            <RadioGroup
              value={state.goal || ''}
              onValueChange={(v) => updateState('goal', v as Goal)}
              className="space-y-3"
            >
              <RadioOption value="complete" label="Complete" description="Finish the distance comfortably" />
              <RadioOption value="speed" label="Speed" description="Train for your fastest race" />
            </RadioGroup>
          </StepContainer>
        );

      case 4:
        return (
          <StepContainer title="How many weeks?">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateState('duration', Math.max(4, state.duration - 1))}
                  disabled={state.duration <= 4}
                >
                  -
                </Button>
                <span className="text-2xl font-semibold w-16 text-center">{state.duration}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateState('duration', Math.min(24, state.duration + 1))}
                  disabled={state.duration >= 24}
                >
                  +
                </Button>
              </div>
              <p className="text-sm text-gray-500">weeks of training</p>
              <div className="flex gap-2 pt-2">
                {[8, 12, 16, 18].map(w => (
                  <Button
                    key={w}
                    variant={state.duration === w ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => updateState('duration', w)}
                  >
                    {w}
                  </Button>
                ))}
              </div>
            </div>
          </StepContainer>
        );

      case 5:
        return (
          <StepContainer title="When do you want to start?">
            <div className="space-y-4">
              <input
                type="date"
                value={state.startDate}
                onChange={(e) => updateState('startDate', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500">
                Plan ends: {state.startDate && new Date(new Date(state.startDate).getTime() + (state.duration * 7 - 1) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </StepContainer>
        );

      case 6:
        const availableApproaches = getAvailableApproaches(state.fitness, state.goal);
        return (
          <StepContainer title="Training approach">
            <RadioGroup
              value={state.approach || ''}
              onValueChange={(v) => updateState('approach', v as Approach)}
              className="space-y-3"
            >
              <RadioOption 
                value="balanced_build" 
                label="Balanced Build" 
                description={APPROACH_CONSTRAINTS.balanced_build.description}
                disabled={!availableApproaches.includes('balanced_build')}
              />
              <RadioOption 
                value="time_efficient" 
                label="Time Efficient" 
                description={APPROACH_CONSTRAINTS.time_efficient.description}
                disabled={!availableApproaches.includes('time_efficient')}
              />
              <RadioOption 
                value="volume_progression" 
                label="Volume Progression" 
                description={APPROACH_CONSTRAINTS.volume_progression.description}
                disabled={!availableApproaches.includes('volume_progression')}
              />
              <RadioOption 
                value="cumulative_load" 
                label="Cumulative Load" 
                description={APPROACH_CONSTRAINTS.cumulative_load.description}
                disabled={!availableApproaches.includes('cumulative_load')}
              />
              <RadioOption 
                value="hybrid_athlete" 
                label="Hybrid Athlete" 
                description={APPROACH_CONSTRAINTS.hybrid_athlete.description}
                disabled={!availableApproaches.includes('hybrid_athlete')}
              />
            </RadioGroup>
          </StepContainer>
        );

      case 7:
        const availableDays = getAvailableDays(state.approach);
        return (
          <StepContainer title="Days per week">
            <RadioGroup
              value={state.daysPerWeek || ''}
              onValueChange={(v) => updateState('daysPerWeek', v as DaysPerWeek)}
              className="space-y-3"
            >
              <RadioOption value="3-4" label="3-4 days" disabled={!availableDays.includes('3-4')} />
              <RadioOption value="4-5" label="4-5 days" disabled={!availableDays.includes('4-5')} />
              <RadioOption value="5-6" label="5-6 days" disabled={!availableDays.includes('5-6')} />
              <RadioOption value="6-7" label="6-7 days" disabled={!availableDays.includes('6-7')} />
            </RadioGroup>
          </StepContainer>
        );

      case 8:
        return (
          <StepContainer title="Add strength training?">
            <RadioGroup
              value={state.strengthFrequency.toString()}
              onValueChange={(v) => updateState('strengthFrequency', parseInt(v) as 0 | 1 | 2 | 3)}
              className="space-y-3"
            >
              <RadioOption value="0" label="No strength" />
              <RadioOption value="1" label="1 day per week" />
              <RadioOption value="2" label="2 days per week" />
              <RadioOption value="3" label="3 days per week" description="Base phase only" />
            </RadioGroup>
          </StepContainer>
        );

      default:
        return null;
    }
  };

  const getStepCount = () => 9; // 0-8

  // Show generating overlay
  if (isGenerating) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Building your plan</h2>
            <p className="text-sm text-gray-500">
              Creating {state.duration} weeks of personalized training...
            </p>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(generateProgress, 100)}%` }}
            />
          </div>
          
          <p className="text-center text-sm text-gray-400">
            {generateProgress < 30 ? 'Analyzing parameters...' :
             generateProgress < 60 ? 'Generating sessions...' :
             generateProgress < 90 ? 'Optimizing schedule...' :
             'Finalizing plan...'}
          </p>
        </div>
      </div>
    );
  }

  // Show plan preview
  if (generatedPlan) {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const sortedSessions = [...generatedPlan.first_week_sessions].sort((a, b) => 
      dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
    );

    return (
      <div className="min-h-screen bg-white">
        {/* Header */}
        <div className="border-b px-4 py-3">
          <h1 className="text-lg font-semibold text-center">Your Plan</h1>
        </div>

        {/* Content */}
        <div className="p-4 pb-32 max-w-lg mx-auto">
          {/* Plan summary */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">{generatedPlan.name}</h2>
            <p className="text-sm text-gray-600 mb-3">{generatedPlan.description}</p>
            <div className="flex gap-4 text-sm text-gray-500">
              <span>{generatedPlan.duration_weeks} weeks</span>
              <span>Starts {new Date(state.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>

          {/* Week 1 preview */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-500 mb-3">WEEK 1 PREVIEW</h3>
            <div className="space-y-2">
              {sortedSessions.length > 0 ? (
                sortedSessions.map((session: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400 w-12">
                          {session.day?.slice(0, 3)}
                        </span>
                        <span className="font-medium text-sm">{session.name}</span>
                      </div>
                      {session.description && (
                        <p className="text-xs text-gray-500 mt-1 ml-14">{session.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{session.duration}m</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No sessions in week 1</p>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
          <div className="max-w-lg mx-auto flex gap-3">
            <Button
              variant="outline"
              onClick={handleReject}
              className="flex-1"
            >
              Start Over
            </Button>
            <Button
              onClick={handleAccept}
              className="flex-1"
            >
              Accept Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <button 
          onClick={() => navigate(-1)} 
          className="text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <span className="text-sm text-gray-500">
          {step + 1} of {getStepCount()}
        </span>
        <div className="w-12" /> {/* Spacer */}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div 
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${((step + 1) / getStepCount()) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="p-6 max-w-md mx-auto">
        {renderStep()}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white p-4">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={handleBack}
              className="flex-1"
              disabled={isGenerating}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed() || isGenerating || (step === 0 && state.discipline !== 'run')}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : step === 8 ? (
              'Generate Plan'
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StepContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">{title}</h2>
      {children}
    </div>
  );
}

interface RadioOptionProps {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function RadioOption({ value, label, description, disabled }: RadioOptionProps) {
  return (
    <div className={`flex items-start space-x-3 ${disabled ? 'opacity-40' : ''}`}>
      <RadioGroupItem value={value} id={value} disabled={disabled} className="mt-1" />
      <Label htmlFor={value} className={`flex-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="block font-medium">{label}</span>
        {description && (
          <span className="block text-sm text-gray-500 mt-0.5">{description}</span>
        )}
      </Label>
    </div>
  );
}
