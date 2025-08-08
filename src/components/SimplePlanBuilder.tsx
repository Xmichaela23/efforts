import React, { useState, useEffect } from 'react';
import { TrainingEngine, type TrainingPlan } from '../services/TrainingEngine';
import { useAppContext } from '@/contexts/AppContext';
import useEmblaCarousel from 'embla-carousel-react';

// Define proper types for user baselines
interface UserBaselines {
  age: number;
  performanceNumbers?: {
    ftp?: number;
    fiveK?: string | number;
    easyPace?: string | number;
    swimPace100?: string | number;
    squat?: number;
    deadlift?: number;
    bench?: number;
    overheadPress1RM?: number;
  };
  equipment?: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  };
}

// Type for the baseline data passed to TrainingEngine
interface BaselineData {
  ftp?: number;
  fiveK?: string;
  easyPace?: string;
  swimPace100?: string;
  squat?: number;
  deadlift?: number;
  bench?: number;
  overheadPress1RM?: number;
  age: number;
}

// Define proper types for answers
interface PlanAnswers {
  distance: 'sprint' | 'seventy3' | '';
  timeLevel: 'minimum' | 'moderate' | 'serious' | 'maximum' | '';
  strengthOption: 'none' | 'traditional' | 'cowboy_endurance' | '';
  longBikeDay: string;
  longRunDay: string;
  longSessionDays: 'weekend' | 'custom';
  recoveryPreference: 'active' | 'rest' | 'mixed';
}

export default function SimplePlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [currentStep, setCurrentStep] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [isHorizontalSwipe, setIsHorizontalSwipe] = useState(false);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [userBaselines, setUserBaselines] = useState<UserBaselines | null>(null);
  const [isLoadingBaselines, setIsLoadingBaselines] = useState(true);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [answers, setAnswers] = useState<PlanAnswers>({
    distance: '',
    timeLevel: '',
    strengthOption: '',
    longBikeDay: '',
    longRunDay: '',
    longSessionDays: 'weekend',
    recoveryPreference: 'active'
  });

  // Load user baselines on component mount
  useEffect(() => {
    setIsLoadingBaselines(true);
    setError(null);
    
    const loadBaselines = async () => {
      try {
        console.log('Loading user baselines...');
        
        // Test if user is logged in
        const { supabase } = await import('@/lib/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        console.log('Current user:', user ? `User ID: ${user.id}` : 'No user logged in');
        
        let baselines: UserBaselines | null = null;
        try {
          baselines = await loadUserBaselines();
          console.log('loadUserBaselines returned:', baselines);
        } catch (error) {
          console.error('Error calling loadUserBaselines:', error);
          baselines = null;
        }
        
        if (baselines) {
          console.log('Baselines found:', {
            age: baselines.age,
            ftp: baselines.performanceNumbers?.ftp,
            fiveK: baselines.performanceNumbers?.fiveK,
            easyPace: baselines.performanceNumbers?.easyPace,
            swimPace100: baselines.performanceNumbers?.swimPace100,
            squat: baselines.performanceNumbers?.squat,
            deadlift: baselines.performanceNumbers?.deadlift,
            bench: baselines.performanceNumbers?.bench
          });
          setUserBaselines(baselines);
        } else {
          console.error('No user baselines found. User must provide fitness data.');
          setUserBaselines(null);
          setError('Please complete your fitness profile before generating training plans.');
        }
      } catch (error) {
        console.error('Error loading baselines:', error);
        setUserBaselines(null);
        setError('Failed to load your fitness data. Please try again.');
      } finally {
        setIsLoadingBaselines(false);
      }
    };
    loadBaselines();
  }, [loadUserBaselines]);

  const trainingEngine = new TrainingEngine();

  const updateAnswer = (key: keyof PlanAnswers, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value as any }));
  };

  // Touch/swipe handlers for week navigation
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return; // ignore multi-touch
    setTouchEnd(null);
    setIsHorizontalSwipe(false);
    setTouchStart(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return; // ignore multi-touch
    const x = e.targetTouches[0].clientX;
    const y = e.targetTouches[0].clientY;
    setTouchEnd(x);

    if (touchStart !== null && touchStartY !== null) {
      const dx = Math.abs(x - touchStart);
      const dy = Math.abs(y - touchStartY);
      // determine gesture type once
      if (!isHorizontalSwipe && dx > 10 && dx > dy) {
        setIsHorizontalSwipe(true);
      }
      // prevent vertical scroll jank only when clearly swiping horizontally
      if (isHorizontalSwipe) {
        e.preventDefault();
      }
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distanceX = touchStart - touchEnd;
    const isLeftSwipe = distanceX > 50;
    const isRightSwipe = distanceX < -50;

    if (!isHorizontalSwipe) return; // ignore vertical gestures

    if (isLeftSwipe && plan?.weeks && currentWeek < plan.weeks.length - 1) {
      setCurrentWeek(currentWeek + 1);
    }
    if (isRightSwipe && currentWeek > 0) {
      setCurrentWeek(currentWeek - 1);
    }
  };

  const goToWeek = (weekIndex: number) => {
    if (plan?.weeks && weekIndex >= 0 && weekIndex < plan.weeks.length) {
      setCurrentWeek(weekIndex);
    }
  };

  const nextWeek = () => {
    if (plan?.weeks && currentWeek < plan.weeks.length - 1) {
      setCurrentWeek(currentWeek + 1);
    }
  };

  const prevWeek = () => {
    if (currentWeek > 0) {
      setCurrentWeek(currentWeek - 1);
    }
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        prevWeek();
      } else if (e.key === 'ArrowRight') {
        nextWeek();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentWeek, plan]);

  const generatePlan = async () => {
    if (isLoadingBaselines) {
      setError('Please wait while your fitness data is loading...');
      return;
    }
    
    console.log('Generate Plan Debug:', {
      hasDistance: !!answers.distance,
      hasTimeLevel: !!answers.timeLevel,
      hasStrengthOption: !!answers.strengthOption,
      hasLongBikeDay: !!answers.longBikeDay,
      hasLongRunDay: !!answers.longRunDay,
      hasUserBaselines: !!userBaselines,
      userBaselines: userBaselines
    });
    
    setIsGeneratingPlan(true);
    setError(null);
    
    if (answers.distance && answers.timeLevel && answers.strengthOption && answers.longSessionDays && userBaselines) {
      // Check if required baselines are present for scientifically sound training
      const missingBaselines: string[] = [];
      
      console.log('Baseline Validation Debug:', {
        ftp: userBaselines.performanceNumbers?.ftp,
        fiveK: userBaselines.performanceNumbers?.fiveK,
        easyPace: userBaselines.performanceNumbers?.easyPace,
        swimPace100: userBaselines.performanceNumbers?.swimPace100,
        age: userBaselines.age,
        squat: userBaselines.performanceNumbers?.squat,
        deadlift: userBaselines.performanceNumbers?.deadlift,
        bench: userBaselines.performanceNumbers?.bench,
        strengthOption: answers.strengthOption
      });
      
      // For cycling: FTP is ideal, but we can work with estimated power
      if (!userBaselines.performanceNumbers?.ftp) {
        missingBaselines.push('FTP (Functional Threshold Power)');
      }
      
      // For running: Need at least one pace reference
      if (!userBaselines.performanceNumbers?.fiveK && !userBaselines.performanceNumbers?.easyPace) {
        missingBaselines.push('Running pace (5K time or easy pace)');
      }
      
      // For swimming: Need swim pace
      if (!userBaselines.performanceNumbers?.swimPace100) {
        missingBaselines.push('Swim pace (100m time)');
      }
      
      // For age-based HR estimation (220 - age formula is sufficient)
      if (!userBaselines.age) {
        missingBaselines.push('Age (for heart rate zone calculations)');
      }
      
      // For strength training
      if (answers.strengthOption !== 'none') {
        if (!userBaselines.performanceNumbers?.squat) missingBaselines.push('Squat 1RM');
        if (!userBaselines.performanceNumbers?.deadlift) missingBaselines.push('Deadlift 1RM');
        if (!userBaselines.performanceNumbers?.bench) missingBaselines.push('Bench 1RM');
      }
      
      console.log('Missing baselines:', missingBaselines);
      
      if (missingBaselines.length > 0) {
        setError(`Missing required fitness data: ${missingBaselines.join(', ')}.\n\nPlease complete your fitness profile with these performance numbers.`);
        setIsGeneratingPlan(false);
        return;
      }
      
      // Validate custom day selection if needed
      if (answers.longSessionDays === 'custom' && (!answers.longBikeDay || !answers.longRunDay)) {
        setError('Please select both your long bike day and long run day.');
        setIsGeneratingPlan(false);
        return;
      }
      
      // Map baseline data to the expected structure
      const baselineData: BaselineData = {
        ftp: userBaselines.performanceNumbers?.ftp,
        fiveK: userBaselines.performanceNumbers?.fiveK?.toString(),
        easyPace: userBaselines.performanceNumbers?.easyPace?.toString(),
        swimPace100: userBaselines.performanceNumbers?.swimPace100?.toString(),
        squat: userBaselines.performanceNumbers?.squat,
        deadlift: userBaselines.performanceNumbers?.deadlift,
        bench: userBaselines.performanceNumbers?.bench,
        overheadPress1RM: userBaselines.performanceNumbers?.overheadPress1RM,
        age: userBaselines.age
      };
      
      console.log('Passing baseline data to training service:', baselineData);
      
      try {
        let generatedPlan;
        // Determine long session days based on user choice
        let longBikeDay = 'Saturday';
        let longRunDay = 'Sunday';
        
        if (answers.longSessionDays === 'custom') {
          longBikeDay = answers.longBikeDay;
          longRunDay = answers.longRunDay;
        }
        
        console.log('Plan Generation Debug:', {
          distance: answers.distance,
          timeLevel: answers.timeLevel,
          strengthOption: answers.strengthOption,
          longBikeDay,
          longRunDay,
          recoveryPreference: answers.recoveryPreference
        });
      
        // Use the new TrainingEngine for all distances
        generatedPlan = await trainingEngine.generatePlan(
          'triathlon',
          answers.distance,
          answers.timeLevel,
          answers.strengthOption,
          longBikeDay,
          longRunDay,
          answers.recoveryPreference,
          baselineData,
          userBaselines.equipment // Pass equipment data
        );
        
        console.log('Frontend plan check:', {
          hasPlan: !!generatedPlan,
          hasDistance: !!generatedPlan?.distance,
          hasWeeks: !!generatedPlan?.weeks,
          weeksLength: generatedPlan?.weeks?.length,
          firstWeek: generatedPlan?.weeks?.[0]
        });
        console.log('Full generated plan:', generatedPlan);
        setPlan(generatedPlan);
        setCurrentWeek(0);
      } catch (error) {
        console.error('Error generating plan:', error);
        setError(`Failed to generate training plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setIsGeneratingPlan(false);
      }
    } else {
      setIsGeneratingPlan(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">What are you training for?</h2>
            <div className="space-y-4">
              <div 
                className={`cursor-pointer hover:bg-gray-50 p-4 ${
                  answers.distance === 'sprint' ? 'bg-gray-200' : ''
                }`}
                onClick={() => updateAnswer('distance', 'sprint')}
              >
                <h3 className="font-medium">Sprint Triathlon</h3>
                <p className="text-sm text-gray-600">Complete in 1-1.5 hours • 8-12 weeks training</p>
              </div>
              <div 
                className={`cursor-pointer hover:bg-gray-50 p-4 ${
                  answers.distance === 'seventy3' ? 'bg-gray-200' : ''
                }`}
                onClick={() => updateAnswer('distance', 'seventy3')}
              >
                <h3 className="font-medium">70.3 Triathlon</h3>
                <p className="text-sm text-gray-600">Complete in 4-6 hours • 12-16 weeks training</p>
              </div>
            </div>
            <button 
              onClick={() => setCurrentStep(2)}
              disabled={!answers.distance}
              className="w-full px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
            >
              Continue →
            </button>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Would you like to integrate strength?</h2>
            <div className="p-3 bg-gray-50 text-sm text-gray-700 mb-4">
              <strong>Strength Training Options:</strong>
              <ul className="mt-2 space-y-1 text-xs">
                <li>• <strong>Traditional (2x/week):</strong> Standard strength maintenance</li>
                <li>• <strong>Cowboy (3x/week):</strong> Includes 3rd day for balance and aesthetics</li>
              </ul>
            </div>
            <div className="space-y-4">
              {[
                { value: 'none', label: 'No strength training', description: 'Pure endurance focus • 0 additional hours • 6-day training week' },
                                  { value: 'traditional', label: 'Traditional (2x/week)', description: 'Standard strength maintenance • +1.8h/week • 2 sessions • 6-day training week' },
        
                                  { value: 'cowboy_endurance', label: 'Cowboy (3x/week)', description: 'Includes 3rd day for balance and aesthetics • +2.2h/week • 3 sessions • 7-day training week' }
              ].map(option => (
                <div 
                  key={option.value}
                  className={`cursor-pointer hover:bg-gray-50 p-4 ${
                    answers.strengthOption === option.value ? 'bg-gray-200 text-gray-900' : ''
                  }`}
                  onClick={() => updateAnswer('strengthOption', option.value)}
                >
                  <h3 className="font-medium">{option.label}</h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
              <button 
                onClick={() => setCurrentStep(3)}
                disabled={!answers.strengthOption}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Continue →
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">How much time can you commit?</h2>
            {answers.strengthOption && answers.strengthOption !== 'none' && (
              <div className="p-3 bg-gray-50 text-sm text-gray-700">
                <strong>Strength Time Impact:</strong>
                                    {answers.strengthOption === 'traditional' && (
                      <span> +1.8h/week (2 sessions) - Fits in all time levels ✅</span>
                    )}
                
                {answers.strengthOption === 'cowboy_endurance' && (
                  <span> +2.2h/week (3 sessions) - Requires Moderate or higher ⚠️</span>
                )}
                {answers.strengthOption === 'cowboy_endurance' && (
                  <div className="mt-2 text-xs text-gray-600">
                    <strong>Cowboy includes a 3rd session for balance and aesthetics.</strong>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-4">
              {[
                { 
                  key: 'minimum', 
                  label: 'Minimum', 
                  description: '8-10 hours/week • 6-day training week • First-time 70.3 athletes, honors time and scheduling limitations',
                  compatible: !answers.strengthOption || answers.strengthOption === 'none' || answers.strengthOption === 'traditional'
                },
                { 
                  key: 'moderate', 
                  label: 'Moderate', 
                  description: '10-12 hours/week • 6-7 day training week • Good for consistent training, balanced approach',
                  compatible: true
                },
                { 
                  key: 'serious', 
                  label: 'Serious', 
                  description: '12-14 hours/week • 7-day training week • Experienced athletes, performance focus',
                  compatible: true
                },
                { 
                  key: 'maximum', 
                  label: 'Maximum', 
                  description: '14-16 hours/week • 7-day training week • Advanced athletes, multiple 70.3s completed',
                  compatible: true
                }
              ].map(option => (
                <div 
                  key={option.key}
                  className={`cursor-pointer hover:bg-gray-50 p-4 ${
                    answers.timeLevel === option.key ? 'bg-gray-200 text-gray-900' : ''
                  } ${!option.compatible ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => option.compatible && updateAnswer('timeLevel', option.key)}
                >
                  <h3 className="font-medium">{option.label}</h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
                  {!option.compatible && (
                    <p className="text-xs text-red-600 mt-1">⚠️ Requires Moderate or higher for your strength choice</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
              <button 
                onClick={() => setCurrentStep(4)}
                disabled={!answers.timeLevel}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Continue →
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">When are your long sessions?</h2>
            <div className="space-y-4">
              <div 
                className={`cursor-pointer hover:bg-gray-50 p-4 ${
                  answers.longSessionDays === 'weekend' ? 'bg-gray-200 text-gray-900' : ''
                }`}
                onClick={() => updateAnswer('longSessionDays', 'weekend')}
              >
                <h3 className="font-medium">Weekend (Saturday/Sunday)</h3>
                <p className="text-sm text-gray-600">Traditional long bike Saturday, long run Sunday</p>
              </div>
              <div 
                className={`cursor-pointer hover:bg-gray-50 p-4 ${
                  answers.longSessionDays === 'custom' ? 'bg-gray-200 text-gray-900' : ''
                }`}
                onClick={() => updateAnswer('longSessionDays', 'custom')}
              >
                <h3 className="font-medium">Custom days</h3>
                <p className="text-sm text-gray-600">Choose your own long session days</p>
              </div>
            </div>
            
            {answers.longSessionDays === 'custom' && (
              <div className="space-y-4 mt-4 p-4 bg-gray-50">
                <div>
                  <label className="block text-sm font-medium mb-2">Long Bike Day</label>
                  <select 
                    value={answers.longBikeDay}
                    onChange={(e) => updateAnswer('longBikeDay', e.target.value)}
                    className="w-full px-3 py-2 text-sm"
                  >
                    <option value="">Select day</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Long Run Day</label>
                  <select 
                    value={answers.longRunDay}
                    onChange={(e) => updateAnswer('longRunDay', e.target.value)}
                    className="w-full px-3 py-2 text-sm"
                  >
                    <option value="">Select day</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <button 
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
              <button 
                onClick={generatePlan}
                disabled={isGeneratingPlan || (answers.longSessionDays === 'custom' && (!answers.longBikeDay || !answers.longRunDay))}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {isGeneratingPlan ? 'Generating Plan...' : 'Generate Plan'}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isLoadingBaselines) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-lg text-gray-600 mb-4">Loading Your Fitness Profile...</div>
        <div className="text-sm text-gray-500">Please wait while we load your performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-lg text-gray-900 mb-4">Error</div>
        <div className="text-sm text-gray-600 mb-4 whitespace-pre-line">{error}</div>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!userBaselines) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-lg text-gray-900 mb-4">Complete Your Fitness Profile</div>
        <div className="text-sm text-gray-600 mb-4">
          Please complete your fitness assessment before generating training plans. 
          We need your performance data to create safe, personalized training plans.
        </div>
        <button 
          onClick={() => window.location.href = '/baselines'}
          className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
        >
          Go to Fitness Assessment
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        {renderStep()}
      </div>
    );
  }

  const currentWeekData = plan.weeks[currentWeek];
  const totalWeeks = plan.weeks.length;

  return (
    <div
      className="max-w-4xl mx-auto px-0 sm:px-6 py-6"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Week Navigation */}
      <div className="w-full bg-white">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={prevWeek}
            disabled={currentWeek === 0}
            className="p-3 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ←
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Week {currentWeek + 1} of {totalWeeks}</h1>
                         <p className="text-sm text-gray-600">{plan.event} Training Plan</p>
          </div>
          
          <button
            onClick={nextWeek}
            disabled={currentWeek === totalWeeks - 1}
            className="p-3 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
        
        {/* Overview toggle */}
        <div className="flex items-center justify-center mb-3">
          <button
            className="text-sm text-gray-600 underline"
            onClick={() => setShowOverview(!showOverview)}
          >
            {showOverview ? 'Hide Overview' : 'Show Overview'}
          </button>
        </div>

        {/* Week Dots / Overview */}
        <div className="flex justify-center space-x-2 mb-6 overflow-x-auto px-2">
          {plan.weeks.map((_, index) => (
            <button
              key={index}
              onClick={() => goToWeek(index)}
              className={`w-2 h-2 transition-colors ${
                index === currentWeek
                  ? 'bg-gray-900'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
        {showOverview && (
          <div className="mb-6 overflow-x-auto">
            <div className="flex gap-2 min-w-full">
              {plan.weeks.map((w, i) => {
                const hrs = Math.round(w.sessions.reduce((t, s) => t + s.duration, 0) / 60 * 10) / 10;
                return (
                  <button
                    key={i}
                    onClick={() => goToWeek(i)}
                    className={`flex-shrink-0 w-24 p-2 border rounded-md text-left ${i===currentWeek?'border-gray-900':'border-gray-200'}`}
                  >
                    <div className="text-xs text-gray-600">Week {i+1}</div>
                    <div className="text-sm font-medium">{hrs}h</div>
                    <div className="text-[11px] text-gray-500">{w.sessions.length} sessions</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Total Hours Summary */}
      <div className="mb-6 p-4 bg-gray-50">
        <div className="text-sm font-medium text-gray-900 mb-2">Week {currentWeek + 1} Summary:</div>
        <div className="text-sm text-gray-700">
          <strong>Total Hours:</strong> {Math.round(currentWeekData.sessions.reduce((total, session) => total + session.duration, 0) / 60 * 10) / 10} hours
          <br />
          <strong>Total Sessions:</strong> {currentWeekData.sessions.length} sessions
          <br />
          <strong>Strength Sessions:</strong> {currentWeekData.sessions.filter(s => s.discipline === 'strength').length} sessions
        </div>
      </div>

      {/* Week Content */}
      <div className="space-y-6 -mx-4 sm:mx-0">
        {(() => {
          // Group sessions by day
          const sessionsByDay: { [key: string]: any[] } = {};
          currentWeekData.sessions.forEach(session => {
            if (!sessionsByDay[session.day]) {
              sessionsByDay[session.day] = [];
            }
            sessionsByDay[session.day].push(session);
          });

          // Display grouped sessions
          return Object.entries(sessionsByDay).map(([day, sessions]) => (
            <div key={day} className="space-y-4 px-4 sm:px-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{day}</h3>
                <span className="text-sm text-gray-600">{sessions.length} session{sessions.length > 1 ? 's' : ''}</span>
              </div>
              
              {sessions.map((session, index) => (
                <div key={index} className="space-y-2 ml-0 rounded-lg border border-gray-200 p-3 sm:p-4 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{session.discipline}</span>
                    <span className="text-xs text-gray-500">{session.duration} min</span>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-sm text-gray-600">
                      <strong>Type:</strong> {session.type}
                    </div>
                    <div className="text-sm text-gray-600">
                      <strong>Intensity:</strong> {session.intensity}
                    </div>
                    {session.description && (
                      <div className="text-sm text-gray-600">
                        <strong>Description:</strong> {session.description}
                      </div>
                    )}
                    {session.detailedWorkout && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-md">
                        <div className="text-sm font-medium text-gray-900 mb-2">Workout Details:</div>
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{session.detailedWorkout}</pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ));
        })()}
      </div>

      {/* Bottom Navigation */}
      <div className="w-full bg-white mt-6">
        <button 
          onClick={() => setPlan(null)}
          className="w-full py-3 px-6 font-medium hover:bg-gray-50 transition-colors"
        >
          Create New Plan
        </button>
      </div>
    </div>
  );
} 