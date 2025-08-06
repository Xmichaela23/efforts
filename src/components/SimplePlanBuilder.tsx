import React, { useState, useEffect } from 'react';
import { SimpleTrainingService, type SimpleTrainingPlan } from '../services/SimpleTrainingService';
import { useAppContext } from '@/contexts/AppContext';
import useEmblaCarousel from 'embla-carousel-react';

export default function SimplePlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [currentStep, setCurrentStep] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [plan, setPlan] = useState<SimpleTrainingPlan | null>(null);
  const [userBaselines, setUserBaselines] = useState<any>(null);
  const [isLoadingBaselines, setIsLoadingBaselines] = useState(true);
  const [answers, setAnswers] = useState({
    distance: '',
    timeLevel: '',
    strengthOption: '',
    longSessionDays: ''
  });

  // Load user baselines on component mount
  useEffect(() => {
    // Set loading state immediately when component mounts
    setIsLoadingBaselines(true);
    
    const loadBaselines = async () => {
      try {
        console.log('Loading user baselines...');
        console.log('🔍 About to call loadUserBaselines...');
        
        // Test if user is logged in
        const { supabase } = await import('@/lib/supabase');
        const { data: { user } } = await supabase.auth.getUser();
        console.log('🔍 Current user:', user ? `User ID: ${user.id}` : 'No user logged in');
        
        let baselines;
        try {
          baselines = await loadUserBaselines();
          console.log('🔍 loadUserBaselines returned:', baselines);
        } catch (error) {
          console.error('🔍 Error calling loadUserBaselines:', error);
          baselines = null;
        }
        console.log('Baselines loaded:', baselines);
        if (baselines) {
          console.log('✅ Baselines found:', {
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
          // No baselines found - user needs to provide data
          console.error('❌ No user baselines found. User must provide fitness data.');
          setUserBaselines(null);
        }
      } catch (error) {
        console.error('Error loading baselines:', error);
        // NO DEFAULTS - user must have real baseline data
        setUserBaselines(null);
      } finally {
        setIsLoadingBaselines(false);
      }
    };
    loadBaselines();
  }, [loadUserBaselines]);

  const trainingService = new SimpleTrainingService();

  const updateAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  // Touch/swipe handlers for week navigation
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    console.log('Swipe detected:', { distance, isLeftSwipe, isRightSwipe, currentWeek });

    if (isLeftSwipe && currentWeek < plan!.weeks.length - 1) {
      console.log('Swiping left to week', currentWeek + 1);
      setCurrentWeek(currentWeek + 1);
    }
    if (isRightSwipe && currentWeek > 0) {
      console.log('Swiping right to week', currentWeek - 1);
      setCurrentWeek(currentWeek - 1);
    }
  };

    const generatePlan = () => {
    if (isLoadingBaselines) {
      alert('Please wait while your fitness data is loading...');
      return;
    }
    
    if (answers.distance && answers.timeLevel && answers.strengthOption && answers.longSessionDays && userBaselines) {
      // Check if required baselines are present for scientifically sound training
      const missingBaselines = [];
      
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
      
      if (missingBaselines.length > 0) {
        alert(`Missing required baselines for personalized training: ${missingBaselines.join(', ')}.\n\nPlease complete your fitness profile with these performance numbers.`);
        return;
      }
      
      const baselineData = {
        ftp: userBaselines.performanceNumbers.ftp,
        fiveKPace: userBaselines.performanceNumbers.fiveK,
        easyPace: userBaselines.performanceNumbers.easyPace,
        swimPace100: userBaselines.performanceNumbers.swimPace100,
        squat1RM: userBaselines.performanceNumbers.squat,
        deadlift1RM: userBaselines.performanceNumbers.deadlift,
        bench1RM: userBaselines.performanceNumbers.bench,
        overheadPress1RM: userBaselines.performanceNumbers.overheadPress1RM,
        age: userBaselines.age
      };
      
      console.log('🎯 Passing baseline data to training service:', baselineData);
      
      let generatedPlan;
      if (answers.distance === 'sprint') {
        generatedPlan = trainingService.generateSprintPlan(
          answers.timeLevel as any,
          answers.strengthOption as any,
          answers.longSessionDays,
          baselineData
        );
      } else if (answers.distance === 'seventy3') {
        generatedPlan = trainingService.generateSeventy3Plan(
          answers.timeLevel as any,
          answers.strengthOption as any,
          answers.longSessionDays,
          baselineData
        );
      } else {
        throw new Error(`Unsupported distance: ${answers.distance}`);
      }
      setPlan(generatedPlan);
          setCurrentWeek(0);
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
                className={`cursor-pointer hover:bg-gray-50 p-4 rounded ${
                  answers.distance === 'sprint' ? 'bg-blue-50 border-blue-200' : ''
                }`}
                onClick={() => updateAnswer('distance', 'sprint')}
              >
                <h3 className="font-medium">Sprint Triathlon</h3>
                <p className="text-sm text-gray-600">Complete in 1-1.5 hours • 8-12 weeks training</p>
              </div>
              <div 
                className={`cursor-pointer hover:bg-gray-50 p-4 rounded ${
                  answers.distance === 'seventy3' ? 'bg-blue-50 border-blue-200' : ''
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
            <div className="space-y-4">
              {trainingService.getSprintStrengthOptions().map(option => (
                <div 
                  key={option.id}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    answers.strengthOption === option.id ? 'text-blue-600' : ''
                  }`}
                  onClick={() => updateAnswer('strengthOption', option.id)}
                >
                  <h3 className="font-medium">{option.name}</h3>
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
                className="flex-1 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Continue →
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">How much time can you train?</h2>
              <p className="text-sm text-gray-600 mt-1">
                Training for: <span className="font-medium">{answers.distance === 'sprint' ? 'Sprint Triathlon' : '70.3 Triathlon'}</span>
              </p>
            </div>
            <div className="space-y-4">
              {trainingService.getTimeOptions(answers.distance).map(option => (
                <div 
                  key={option.key}
                  className={`cursor-pointer hover:bg-gray-50 ${
                    answers.timeLevel === option.key ? 'text-blue-600' : ''
                  }`}
                  onClick={() => updateAnswer('timeLevel', option.key)}
                >
                  <h3 className="font-medium">{option.label}</h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
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
                className="flex-1 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Continue →
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">When do you prefer your long workout?</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select your preferred day for your long session:</label>
                <div className="grid grid-cols-2 gap-0">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                    <button
                      key={day}
                      onClick={() => updateAnswer('longSessionDays', day)}
                      className={`px-3 py-2 text-sm ${
                        answers.longSessionDays === day 
                          ? 'text-blue-600 bg-blue-50' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              >
                Back
              </button>
              <button 
                onClick={generatePlan}
                disabled={!answers.longSessionDays || isLoadingBaselines}
                className="flex-1 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                {isLoadingBaselines ? 'Loading...' : 'Generate Plan →'}
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading while baselines are being loaded
  if (isLoadingBaselines) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <div className="text-lg text-blue-600 mb-4">Loading Your Fitness Profile...</div>
          <div className="text-gray-700 mb-4">
            Please wait while we load your personalized training data.
          </div>
        </div>
      </div>
    );
  }
  
  // Show error if no baselines found after loading
  if (!userBaselines) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="text-center">
          <div className="text-lg text-red-600 mb-4">Fitness Profile Required</div>
          <div className="text-gray-700 mb-4">
            You need to complete your fitness profile to generate a personalized training plan.
          </div>
          <div className="text-sm text-gray-500">
            Please complete your fitness profile during account registration with FTP, 5K time or easy pace, swim pace (100m), age, and strength data.
          </div>
        </div>
      </div>
    );
  }

  if (plan) {
    // Debug: Log what's in userBaselines

    
    return (
      <div className="w-full">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">
              {plan.distance.charAt(0).toUpperCase() + plan.distance.slice(1)} Triathlon Plan
            </h1>
            <button 
              onClick={() => {
                setPlan(null);
                setCurrentStep(1);
                setAnswers({ 
                  distance: '',
                  timeLevel: '', 
                  strengthOption: '', 
                  longSessionDays: ''
                });
              }}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            >
              ← Dashboard
            </button>
          </div>
          <p className="text-gray-600 mb-6">
            {plan.weeks.length}-Week Training Plan • {Math.round(plan.totalHours * plan.weeks.length)} hours total
          </p>
          
          {/* Plan Choices Summary */}
          <div className="p-4 mb-6">
            <h3 className="font-medium mb-2">Your Plan Choices</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-700"><strong>Long Session Day:</strong> {answers.longSessionDays}</p>
              </div>
              <div>
                <p className="text-gray-700"><strong>Time Level:</strong> {answers.timeLevel.charAt(0).toUpperCase() + answers.timeLevel.slice(1)} ({plan.totalHours.toFixed(1)} hours/week)</p>
              </div>
              <div>
                <p className="text-gray-700">
                  <strong>Strength:</strong> {
                    answers.strengthOption === 'none' ? 'None' :
                    answers.strengthOption === 'traditional' ? 'Traditional (+1.5h)' :
                    answers.strengthOption === 'compound' ? 'Compound (+2.0h)' :
                    answers.strengthOption === 'cowboy_endurance' ? 'Cowboy Endurance (+3.0h)' :
                    answers.strengthOption === 'cowboy_compound' ? 'Cowboy Compound (+3.5h)' :
                    answers.strengthOption
                  }
                </p>
              </div>
            </div>
          </div>
          
          {/* Training Plan Summary */}
          <div className="p-6 mb-6">
            <h2 className="text-xl font-semibold mb-3">Training Methodology</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h3 className="font-medium mb-2">Polarized Training (80/20 Rule)</h3>
                <p className="text-gray-700 mb-2">• 80% of training at low intensity (Zone 1-2)</p>
                <p className="text-gray-700 mb-2">• 20% of training at high intensity (Zone 3-5)</p>
                <p className="text-gray-700">• Optimizes endurance adaptations and recovery</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Progressive Overload</h3>
                <p className="text-gray-700 mb-2">• Base Phase (Weeks 1-5): Build aerobic foundation</p>
                <p className="text-gray-700 mb-2">• Build Phase (Weeks 6-8): Increase intensity</p>
                <p className="text-gray-700 mb-2">• Peak Phase (Weeks 9-11): Race-specific training</p>
                <p className="text-gray-700">• Taper Phase (Week 12): Reduce volume, maintain intensity</p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Your Heart Rate Zones</h3>
                <p className="text-gray-700 mb-2">• Calculated from your age</p>
                <p className="text-gray-700 mb-2">• Max HR: {userBaselines.age ? (220 - userBaselines.age) : 'N/A'} BPM</p>
                <p className="text-gray-700 mb-2">• Zone 1 (Recovery): {userBaselines.age ? `${Math.round((220 - userBaselines.age) * 0.65)}-${Math.round((220 - userBaselines.age) * 0.75)}` : 'N/A'} BPM</p>
                <p className="text-gray-700 mb-2">• Zone 2 (Endurance): {userBaselines.age ? `${Math.round((220 - userBaselines.age) * 0.75)}-${Math.round((220 - userBaselines.age) * 0.85)}` : 'N/A'} BPM</p>
                <p className="text-gray-700 mb-2">• Zone 3 (Tempo): {userBaselines.age ? `${Math.round((220 - userBaselines.age) * 0.85)}-${Math.round((220 - userBaselines.age) * 0.95)}` : 'N/A'} BPM</p>
                <p className="text-gray-700">• Zone 4 (Threshold): {userBaselines.age ? `${Math.round((220 - userBaselines.age) * 0.95)}-${Math.round((220 - userBaselines.age) * 1.05)}` : 'N/A'} BPM</p>
              </div>
            </div>
          </div>
        </div>

        <div>

          {/* Week Navigation - Full Width Swipe */}
          <div className="w-full bg-white p-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Your Training Plan</h3>
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <span>Swipe to navigate weeks</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            
            {/* Week Indicator Dots */}
            <div className="flex justify-center space-x-2 mb-4">
              {plan.weeks.map((_, weekIndex) => (
                <div
                  key={weekIndex}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentWeek === weekIndex
                      ? 'bg-blue-600'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
            
            {/* Full Width Swipeable Area */}
            <div 
              className="w-full h-32 relative overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div 
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${currentWeek * 100}%)` }}
              >
                {plan.weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="w-full flex-shrink-0 px-4">
                    <div className="text-center">
                      <h4 className="text-lg font-semibold">
                        Week {week.weekNumber} - {week.phase.charAt(0).toUpperCase() + week.phase.slice(1)} Phase
                      </h4>
                      <p className="text-sm text-gray-600">
                        {week.sessions.length} sessions • {week.totalHours.toFixed(1)} hours
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Current Week Content */}
          {plan.weeks[currentWeek] && (
            <div>

              <div className="space-y-8">
                {(() => {
                  // Group sessions by day
                  const sessionsByDay = plan.weeks[currentWeek].sessions.reduce((acc, session) => {
                    if (!acc[session.day]) {
                      acc[session.day] = [];
                    }
                    acc[session.day].push(session);
                    return acc;
                  }, {} as Record<string, any[]>);

                  return Object.entries(sessionsByDay).map(([day, sessions], dayIndex) => (
                    <div key={`${day}-${dayIndex}`} className="mb-6">
                      {/* Day Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-base text-gray-900">{day}</span>
                          {sessions.length > 1 && (
                            <span className="text-xs text-gray-500">
                              {sessions.length} sessions
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {sessions.reduce((total, session) => total + session.duration, 0)}min total
                        </div>
                      </div>
                      
                      {/* Sessions */}
                      <div>
                        {sessions.length === 1 ? (
                          // Single session
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-xs font-medium text-gray-700">
                                {sessions[0].discipline.toUpperCase()}
                              </span>
                              {sessions[0].type && (
                                <span className="text-xs font-medium text-gray-500">
                                  {sessions[0].type}
                                </span>
                              )}
                            </div>
                            {sessions[0].detailedWorkout && (
                              <div className="mt-2">
                                <p className="text-sm font-medium mb-2 text-gray-800">Workout Details:</p>
                                <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{sessions[0].detailedWorkout}</pre>
                              </div>
                            )}
                          </div>
                        ) : (
                          // Multiple sessions - stacked vertically
                          <div className="space-y-3">
                            {sessions.map((session, sessionIndex) => (
                              <div key={sessionIndex} className="pb-3 last:pb-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xs font-medium text-gray-700">
                                    {session.discipline.toUpperCase()}
                                  </span>
                                  {session.type && (
                                    <span className="text-xs font-medium text-gray-500">
                                      {session.type}
                                    </span>
                                  )}
                                  <span className="text-sm text-gray-500">
                                    ({session.duration}min)
                                  </span>
                                </div>
                                {session.detailedWorkout && (
                                  <div className="mt-2">
                                    <p className="text-sm font-medium mb-2 text-gray-800">Workout Details:</p>
                                    <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{session.detailedWorkout}</pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
          
          {/* Save Button - At Bottom */}
          <div className="w-full bg-white p-4 border-t border-gray-200 mt-6">
            <button className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Save Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto p-4">
        {renderStep()}
      </div>
    </div>
  );
} 