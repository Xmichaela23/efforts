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
type Fitness = 'novice' | 'beginner' | 'intermediate' | 'advanced';
type Goal = 'complete' | 'speed';
type Approach = 'simple_completion' | 'balanced_build';
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
// METHODOLOGY DEFINITIONS
// ============================================================================

const METHODOLOGIES: Record<Approach, {
  name: string;
  shortDescription: string;
  longDescription: string;
  basedOn: string;
  supported_days: DaysPerWeek[];
}> = {
  'simple_completion': {
    name: 'Simple Completion',
    shortDescription: 'Easy-to-follow plan focused on finishing healthy',
    longDescription: 'Effort-based pacing (easy, moderate, hard) with minimal speedwork. Conservative progression designed to get you to the finish line.',
    basedOn: 'Based on Hal Higdon\'s progressive training principles',
    supported_days: ['3-4', '4-5', '5-6']
  },
  'balanced_build': {
    name: 'Balanced Build',
    shortDescription: 'Structured quality with VDOT-based pacing',
    longDescription: 'Two quality workouts per week with structured intervals and tempo runs. All paces calculated from your 5K time.',
    basedOn: 'Based on Jack Daniels\' Running Formula principles',
    supported_days: ['4-5', '5-6', '6-7']
  }
};

// ============================================================================
// GATING LOGIC - GOAL BASED
// ============================================================================

/**
 * Get the available methodology based on goal and fitness
 * - complete goal → Simple Completion only
 * - speed goal + beginner → Balanced Build locked
 * - speed goal + intermediate/advanced → Balanced Build only
 */
function getMethodologyForGoal(goal: Goal | null, fitness: Fitness | null): {
  approach: Approach | null;
  locked: boolean;
  lockedReason: string;
} {
  if (!goal || !fitness || fitness === 'novice') {
    return { approach: null, locked: true, lockedReason: '' };
  }

  if (goal === 'complete') {
    // Complete goal → Simple Completion for all fitness levels
    return { approach: 'simple_completion', locked: false, lockedReason: '' };
  }

  if (goal === 'speed') {
    // Speed goal → Balanced Build, but locked for beginners
    if (fitness === 'beginner') {
      return {
        approach: 'balanced_build',
        locked: true,
        lockedReason: 'Balanced Build requires Intermediate+ fitness (25+ mpw) and experience with structured speedwork. Consider selecting "Complete" goal to access Simple Completion, or build your base to 25+ mpw.'
      };
    }
    return { approach: 'balanced_build', locked: false, lockedReason: '' };
  }

  return { approach: null, locked: true, lockedReason: '' };
}

function getAvailableDays(approach: Approach | null): DaysPerWeek[] {
  if (!approach) return ['3-4', '4-5', '5-6', '6-7'];
  return METHODOLOGIES[approach].supported_days;
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

  // Get methodology based on goal and fitness
  const methodologyResult = getMethodologyForGoal(state.goal, state.fitness);

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return state.discipline !== null;
      case 1: return state.distance !== null;
      case 2: return state.fitness !== null && state.fitness !== 'novice'; // Novice cannot proceed
      case 3: return state.goal !== null && !methodologyResult.locked; // Can't proceed if methodology locked
      case 4: return state.duration >= 4;
      case 5: return state.startDate !== '';
      case 6: return state.daysPerWeek !== null; // Skip approach step - auto-selected
      case 7: return true; // Strength is optional
      default: return false;
    }
  };

  const isNovice = state.fitness === 'novice';

  const handleNext = () => {
    if (step === 0 && state.discipline !== 'run') {
      // Non-run disciplines do nothing for now
      return;
    }
    
    // When moving past goal step, auto-select the methodology
    if (step === 3 && !methodologyResult.locked && methodologyResult.approach) {
      updateState('approach', methodologyResult.approach);
    }
    
    if (step < 7) {
      // Skip step 6 (old approach selection) - it's now auto-selected
      const nextStep = step === 5 ? 6 : step + 1;
      setStep(nextStep);
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
      description: "This takes 1-2 minutes. Feel free to use the app or leave - your plan will be ready when you return.",
      duration: 15000,
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
        // Show base-building prompt for novice
        if (state.fitness === 'novice') {
          return (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="font-semibold text-amber-800 mb-2">Build Your Base First</h3>
                <p className="text-sm text-amber-700 mb-4">
                  Your current fitness level (0-12 mpw) needs base building before structured training plans.
                </p>
                <div className="text-sm text-amber-700 space-y-2">
                  <p className="font-medium">All training plans require:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Ability to run 6+ miles comfortably</li>
                    <li>Current base of 12-15 miles/week minimum</li>
                    <li>Consistent running 3-4 days/week</li>
                  </ul>
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">Recommended: 8-12 Week Base Building</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Start with easy running 3x per week, gradually building to 15-20 miles per week with comfortable 8-mile long runs.
                </p>
                <p className="text-xs text-blue-600">
                  Once you're running 12+ miles per week consistently, return here to start a training plan.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => updateState('fitness', null)}
                className="w-full"
              >
                Select Different Fitness Level
              </Button>
            </div>
          );
        }

        return (
          <StepContainer title="Current weekly mileage">
            <RadioGroup
              value={state.fitness || ''}
              onValueChange={(v) => updateState('fitness', v as Fitness)}
              className="space-y-4"
            >
              <RadioOption 
                value="novice" 
                label="Novice" 
                description="0-12 mpw — New to running or returning from break" 
              />
              <RadioOption 
                value="beginner" 
                label="Beginner" 
                description="12-25 mpw — Running 3-4 days/week, comfortable 6-8 mile runs" 
              />
              <RadioOption 
                value="intermediate" 
                label="Intermediate" 
                description="25-40 mpw — Running 5-6 days/week, regular 10-12 mile long runs" 
              />
              <RadioOption 
                value="advanced" 
                label="Advanced" 
                description="40+ mpw — Experienced runner, 6-7 days/week, 14+ mile long runs" 
              />
            </RadioGroup>
          </StepContainer>
        );

      case 3:
        return (
          <StepContainer title="What's your goal?">
            <RadioGroup
              value={state.goal || ''}
              onValueChange={(v) => updateState('goal', v as Goal)}
              className="space-y-4"
            >
              {/* Complete Goal → Simple Completion */}
              <div className="p-3 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="complete" id="complete" className="mt-1" />
                  <Label htmlFor="complete" className="flex-1 cursor-pointer">
                    <span className="block font-medium">Complete</span>
                    <span className="block text-sm text-gray-500 mt-0.5">Finish the distance comfortably</span>
                    <span className="block text-xs text-blue-600 mt-2">
                      → Uses Simple Completion plan (effort-based, flexible)
                    </span>
                  </Label>
                </div>
              </div>
              
              {/* Speed Goal → Balanced Build (may be locked) */}
              <div className={`p-3 border rounded-lg ${state.fitness === 'beginner' ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem 
                    value="speed" 
                    id="speed" 
                    className="mt-1" 
                    disabled={state.fitness === 'beginner'}
                  />
                  <Label htmlFor="speed" className={`flex-1 ${state.fitness === 'beginner' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <span className="block font-medium">
                      {state.fitness === 'beginner' ? '🔒 Speed' : 'Speed'}
                    </span>
                    <span className="block text-sm text-gray-500 mt-0.5">Train for your fastest race</span>
                    {state.fitness === 'beginner' ? (
                      <span className="block text-xs text-amber-600 mt-2">
                        Requires Intermediate+ fitness (25+ mpw). Build your base first!
                      </span>
                    ) : (
                      <span className="block text-xs text-blue-600 mt-2">
                        → Uses Balanced Build plan (VDOT pacing, structured intervals)
                      </span>
                    )}
                  </Label>
                </div>
              </div>
            </RadioGroup>
            
            {/* Disclaimer */}
            {state.goal && (
              <p className="text-xs text-gray-400 mt-4">
                {state.goal === 'complete' 
                  ? 'Plan based on Hal Higdon\'s progressive training principles.'
                  : 'Plan based on Jack Daniels\' Running Formula principles.'}
                {' '}Not officially endorsed.
              </p>
            )}
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
            
            {/* Show selected methodology info */}
            {state.approach && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{METHODOLOGIES[state.approach].name}</p>
                <p className="text-xs text-gray-500 mt-1">{METHODOLOGIES[state.approach].shortDescription}</p>
              </div>
            )}
          </StepContainer>
        );

      case 7:
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

  const getStepCount = () => 8; // 0-7 (removed separate approach step)

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
            ) : step === 7 ? (
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

interface LockedRadioOptionProps {
  value: string;
  label: string;
  description?: string;
  locked: boolean;
  lockedReason: string;
  onValueChange: (value: string) => void;
  currentValue: string;
}

function LockedRadioOption({ value, label, description, locked, lockedReason, onValueChange, currentValue }: LockedRadioOptionProps) {
  if (locked) {
    return (
      <div className="flex items-start space-x-3 opacity-50 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1">
          <span className="block font-medium text-gray-500">{label}</span>
          {description && (
            <span className="block text-sm text-gray-400 mt-0.5">{description}</span>
          )}
          <span className="block text-xs text-amber-600 mt-1">{lockedReason}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-3">
      <RadioGroupItem value={value} id={value} className="mt-1" />
      <Label htmlFor={value} className="flex-1 cursor-pointer">
        <span className="block font-medium">{label}</span>
        {description && (
          <span className="block text-sm text-gray-500 mt-0.5">{description}</span>
        )}
      </Label>
    </div>
  );
}
