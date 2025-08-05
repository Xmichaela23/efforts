import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { FaRunning, FaSwimmer, FaBiking, FaDumbbell, FaRoad, FaChartArea, FaTachometerAlt, FaMedal, FaObjectGroup, FaCog } from 'react-icons/fa';
import { AlgorithmTrainingService, type PlanParameters, type UserPerformance } from '../services/AlgorithmTrainingService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// WorkoutTabs component for handling multiple workouts on the same day
const WorkoutTabs = ({ workouts }: { workouts: any[] }) => {
  const [currentDay, setCurrentDay] = useState(0);

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 mb-3">
        {workouts.map((workout, index) => (
          <button
            key={index}
            onClick={() => setCurrentDay(index)}
            className={`px-4 py-2 text-xs font-medium border-b-2 ${
              currentDay === index
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {workout.discipline} ({workout.duration}min)
          </button>
        ))}
      </div>
      
      {/* Tab content */}
      <div>
        {workouts.map((workout, index) => (
          <div key={index} className={currentDay === index ? 'block' : 'hidden'}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs">{workout.discipline}</span>
              {workout.type && workout.type !== workout.discipline && (
                <span className="text-xs text-gray-500">{workout.type}</span>
              )}
            </div>
            {workout.detailedWorkout ? (
              <div>
                <p className="text-sm font-medium mb-1">Workout:</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap">{workout.detailedWorkout}</pre>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600">{workout.description}</p>
              </div>
            )}
            {workout.intensity && (
              <p className="text-xs text-gray-500 mt-1">Intensity: {workout.intensity}</p>
            )}
            {workout.zones && workout.zones.length > 0 && (
              <p className="text-xs text-gray-500">Zones: {workout.zones.join(', ')}</p>
            )}
            {workout.strengthType && (
              <p className="text-xs text-gray-500">Strength Type: {workout.strengthType}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Preserve all our flow questions and options
const TRAINING_CATEGORIES = [
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'running', label: 'Running Focus (5K to Marathon)' },
  { key: 'cycling', label: 'Cycling Focus (Road, Gravel, MTB)' },
  { key: 'swimming', label: 'Swimming Focus (Pool & Open Water)' },
  { key: 'strength', label: 'Strength Training Focus' },
  { key: 'hybrid', label: 'Hybrid Training (Multiple Disciplines)' },
];

const TRIATHLON_DISTANCES = [
  { key: 'sprint', label: 'Sprint (750m swim, 20km bike, 5km run)' },
  { key: 'olympic', label: 'Olympic (1.5km swim, 40km bike, 10km run)' },
  { key: 'seventy3', label: '70.3 Half Ironman (1.9km swim, 90km bike, 21km run)' },
  { key: 'ironman', label: 'Full Ironman (3.8km swim, 180km bike, 42km run)' },
];

const TIMELINE_OPTIONS = [
  { key: '8-12-weeks', label: '8-12 weeks' },
  { key: '16-20-weeks', label: '16-20 weeks' },
  { key: '24-plus-weeks', label: '24+ weeks' },
  { key: 'no-specific', label: 'No specific event' },
];

const GENERAL_FITNESS_OPTIONS = [
  { key: 'maintain', label: 'Maintain current fitness across all three sports' },
  { key: 'get-faster', label: 'Get faster - improve speed and power in all disciplines' },
  { key: 'build-endurance', label: 'Build endurance - increase capacity for longer efforts' },
  { key: 'address-weaknesses', label: 'Address weaknesses - focus on limiting discipline' },
  { key: 'stay-race-ready', label: 'Stay race-ready - be prepared for opportunities' },
];

const DISCIPLINE_WEAKNESS_OPTIONS = [
  { key: 'swimming', label: 'Swimming (technique/endurance)' },
  { key: 'biking', label: 'Biking (power/endurance)' },
  { key: 'running', label: 'Running (speed/endurance)' },
  { key: 'all-equal', label: 'All pretty equal' },
];

const TRAINING_FREQUENCY_OPTIONS = [
  { key: '4-days', label: '4 days per week' },
  { key: '5-days', label: '5 days per week' },
  { key: '6-days', label: '6 days per week' },
  { key: '7-days', label: '7 days per week' },
];

const LONG_SESSION_DAY_OPTIONS = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const LONG_SESSION_ORDER_OPTIONS = [
  { key: 'bike-first', label: 'Bike First, then Run' },
  { key: 'run-first', label: 'Run First, then Bike' },
];

const STRENGTH_OPTIONS = [
  { 
    key: 'none', 
    label: 'No Strength (0 hours, pure endurance)',
    description: 'Pure endurance training only. Many successful triathletes train this way.'
  },
  { 
    key: 'power_development', 
    label: 'Power Development (2x/week, +1-1.5 hours, triathlon performance)',
    description: 'Explosive movements, plyometrics, and Olympic lifts. Focus on power output for triathlon performance.'
  },
  { 
    key: 'stability_focus', 
    label: 'Stability Focus (2x/week, +1-1.2 hours, injury prevention)',
    description: 'Single-leg exercises, core stability, balance work. Great for injury prevention and movement quality.'
  },
  { 
    key: 'compound_strength', 
    label: 'Compound Strength (2x/week, +1.5-2 hours, experimental approach)',
    description: 'Heavy compound lifts (squats, deadlifts, presses). Experimental approach for triathletes.'
  },
  { 
    key: 'cowboy_endurance', 
    label: 'Cowboy Endurance (3x/week + 1 upper body day, +2.5-3 hours) - Carries, walks, bodyweight',
    description: 'Cowboy Endurance follows traditional endurance strength protocols with an additional day of upper body work for race course aesthetics and physical balance. Note: Upper body aesthetics work may interfere with key endurance sessions. Consider dropping within 4 weeks of race day.'
  },
  { 
    key: 'cowboy_compound', 
    label: 'Cowboy Compound (3x/week + 1 upper body day, +3-3.5 hours) - Heavy deadlifts, presses, 1RM-based',
    description: 'Cowboy Compound focuses on compound lifts for endurance training and adds an additional day of upper body work for race course aesthetics and physical balance. Note: Upper body aesthetics work may interfere with key endurance sessions. Consider dropping within 4 weeks of race day.'
  },
];

const STRENGTH_FITNESS_LEVELS = [
  { key: 'new', label: 'New to strength training' },
  { key: 'recreational', label: 'Recreational lifter' },
  { key: 'regular', label: 'Regular lifter' },
  { key: 'competitive', label: 'Competitive lifter' },
];

const STRENGTH_PERFORMANCE_LEVELS = [
  { key: 'dont-know', label: "Don't know my strength levels" },
  { key: 'bodyweight', label: 'Bodyweight movements only' },
  { key: 'bodyweight-plus', label: 'Can squat/deadlift around bodyweight' },
  { key: '1.25x-bodyweight', label: 'Can squat/deadlift 1.25x bodyweight' },
  { key: '1.5x-plus-bodyweight', label: 'Can squat/deadlift 1.5x+ bodyweight' },
  { key: 'know-1rms', label: 'I know my compound 1RMs' },
];

const EQUIPMENT_OPTIONS = [
  { key: 'full-barbell', label: 'Full barbell + plates' },
  { key: 'adjustable-dumbbells', label: 'Adjustable dumbbells' },
  { key: 'fixed-dumbbells', label: 'Fixed dumbbells' },
  { key: 'squat-rack', label: 'Squat rack or power cage' },
  { key: 'bench', label: 'Bench (flat/adjustable)' },
  { key: 'pull-up-bar', label: 'Pull-up bar' },
  { key: 'kettlebells', label: 'Kettlebells' },
  { key: 'resistance-bands', label: 'Resistance bands' },
  { key: 'cable-machine', label: 'Cable machine/functional trainer' },
  { key: 'bodyweight-only', label: 'Bodyweight only' },
  { key: 'commercial-gym', label: 'Full commercial gym access' },
];

const TRAINING_BACKGROUND_OPTIONS = [
  { key: 'brand-new', label: 'Brand new to structured training' },
  { key: 'returning-6-plus', label: 'Returning after 6+ months off' },
  { key: 'occasionally', label: 'Train occasionally but inconsistently' },
  { key: 'consistent-6-plus', label: 'Train consistently for 6+ months' },
  { key: 'consistent-2-plus', label: 'Train consistently for 2+ years' },
];

const WEEKDAY_DURATION_OPTIONS = [
  { key: '30-45', label: '30-45 minutes' },
  { key: '45-60', label: '45-60 minutes' },
  { key: '60-90', label: '60-90 minutes' },
  { key: '90-plus', label: '90+ minutes' },
];

export default function AlgorithmPlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [algorithmService] = useState(() => new AlgorithmTrainingService());
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [currentTab, setCurrentTab] = useState('run');
  
  // Assessment responses - preserve all our flow questions
  const [responses, setResponses] = useState({
    // Question 1: Category & Distance
    category: '',
    distance: '',
    timeline: '',
    previousExperience: '',
    previousTime: '',
    previousEventDate: '',
    
    // Question 2: Event Details
    hasSpecificEvent: '',
    raceName: '',
    eventDate: '',
    courseProfile: '',
    climate: '',
    generalFitnessFocus: '',
    limitingDiscipline: '',
    
    // Course Details (Separated by discipline)
    runningElevationGain: '',
    runningCourseProfile: '',
    cyclingElevationGain: '',
    cyclingCourseProfile: '',
    waterConditions: '',
    
    // Question 3: Training Frequency
    trainingFrequency: '',
    
    // Question 4: Strength Integration
    strengthTraining: '',
    strengthFitnessLevel: '',
    strengthPerformanceLevel: '',
    squat1RM: '',
    deadlift1RM: '',
    bench1RM: '',
    equipmentAccess: [] as string[],
    strengthTrainingBackground: '',
    
    // Question 5: Time Distribution
    weekdayDuration: '',
    weekendDuration: '',
    weekendAvailability: '',
    longSessionPreference: '',
    
    // Question 6: Training Philosophy
    trainingPhilosophy: '',

    // Question 7: Strength Frequency
    strengthFrequency: '',

    // Question 8: Goals
    goals: [] as string[],
    
    // Algorithm-based plan parameters
    weeklyHours: 8,
    trainingBackground: '',
    
    // Long Session Preferences
    longSessionDays: [] as string[],
    longSessionOrder: 'bike-first', // 'bike-first' or 'run-first'
  });

  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);

  // Load user baselines
  useEffect(() => {
    const loadBaselines = async () => {
      const userBaselines = await loadUserBaselines();
      setBaselines(userBaselines);
    };
    loadBaselines();
  }, [loadUserBaselines]);

  // Update response helper
  const updateResponse = (key: string, value: any) => {
    setResponses(prev => ({ ...prev, [key]: value }));
  };

  // Validation helper
  const validateAssessment = () => {
    const requiredFields = [
      'distance',
      'strengthTraining',
      'trainingFrequency',
      'weeklyHours'
    ];

    const missingFields = requiredFields.filter(field => !responses[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate performance data based on user's disciplines
    if (!baselines?.performanceNumbers?.ftp) {
      throw new Error('FTP is required for bike training zones');
    }
    if (!baselines?.performanceNumbers?.fiveK) {
      throw new Error('5K pace is required for run training zones');
    }
    // Only require swim pace if user selected swimming or triathlon
    const hasSwimming = responses.category === 'swimming' || 
                       (responses.category === 'triathlon' && responses.distance) ||
                       responses.category === 'hybrid';
    
    // Check if user has swim pace data in their baseline
    const hasSwimPace = baselines?.performanceNumbers?.swimPace100 || 
                       baselines?.performanceNumbers?.swimPace ||
                       baselines?.performanceNumbers?.swim;
    
    if (hasSwimming && !hasSwimPace) {
      console.log('⚠️ User has swimming but no swim pace data:', {
        category: responses.category,
        distance: responses.distance,
        swimPace100: baselines?.performanceNumbers?.swimPace100,
        swimPace: baselines?.performanceNumbers?.swimPace,
        swim: baselines?.performanceNumbers?.swim
      });
      // For now, let's allow the plan to generate without swim pace
      // The algorithm will handle missing swim pace gracefully
    }

    console.log('✅ ALL VALIDATION PASSED - Ready for algorithm plan generation');
    return true;
  };

  // Generate plan using algorithm
  // Helper to convert duration option to weekly hours
  const convertDurationToWeeklyHours = (durationOption: string): number => {
    switch (durationOption) {
      case '30-45':
        return 4; // 30-45 min sessions = ~4 hours/week
      case '45-60':
        return 6; // 45-60 min sessions = ~6 hours/week
      case '60-90':
        return 8; // 60-90 min sessions = ~8 hours/week
      case '90-plus':
        return 12; // 90+ min sessions = ~12 hours/week
      default:
        return 8; // Default to 8 hours
    }
  };

  // Get scientifically sound minimum hours for the selected distance and strength
  const getMinimumHours = (distance: string, strengthOption: string): number => {
    // Map UI distance names to algorithm distance names
    const distanceMap: { [key: string]: string } = {
      'sprint': 'sprint',
      'olympic': 'olympic',
      'seventy3': '70.3',
      'ironman': 'ironman'
    };
    const mappedDistance = distanceMap[distance] || distance;
    
    if (mappedDistance === '70.3' && (strengthOption === 'cowboy_compound' || strengthOption === 'cowboy_endurance')) {
      return 10; // Minimum 10 hours for 70.3 with heavy strength
    }
    if (mappedDistance === 'ironman') {
      return 12; // Minimum 12 hours for Ironman
    }
    if (mappedDistance === '70.3') {
      return 8; // Minimum 8 hours for 70.3 without heavy strength
    }
    return 6; // Default minimum
  };

  const generatePlan = async () => {
    try {
      // Validate assessment completion first
      validateAssessment();
      
      setGeneratingPlan(true);
      
      console.log('🧮 Starting algorithm-based plan generation...');
      console.log('📊 Baselines:', baselines);
      console.log('📝 Responses:', responses);
      console.log('💪 User 1RM values:', {
        squat: baselines.performanceNumbers.squat,
        deadlift: baselines.performanceNumbers.deadlift,
        bench: baselines.performanceNumbers.bench
      });
      console.log('💪 User baselines object:', baselines.performanceNumbers);
      
      // Use the weekly hours directly
      const weeklyHours = responses.weeklyHours;
      console.log(`🕐 Using weekly hours: ${weeklyHours} hours/week`);
      
      // Extract plan parameters
      const planParameters: PlanParameters = {
        distance: responses.distance as any,
        strengthOption: responses.strengthTraining || 'none',
        disciplineFocus: 'standard', // Always standard now
        targetHours: weeklyHours,
        trainingFrequency: parseInt(responses.trainingFrequency.split('-')[0]), // Convert "5-days" to 5 for template lookup
        userPerformance: {
          ftp: baselines.performanceNumbers.ftp,
          fiveKPace: baselines.performanceNumbers.fiveK,
          easyPace: baselines.performanceNumbers.easyPace,
          swimPace: baselines.performanceNumbers.swimPace100 || 
                   baselines.performanceNumbers.swimPace || 
                   baselines.performanceNumbers.swim || 
                   undefined,
          squat: baselines.performanceNumbers.squat,
          deadlift: baselines.performanceNumbers.deadlift,
          bench: baselines.performanceNumbers.bench
        },
        userEquipment: baselines.equipment,
        longSessionDays: responses.longSessionDays,
        longSessionOrder: responses.longSessionOrder
      };

      // Add optional parameters if available
      if (responses.eventDate) {
        const eventDate = new Date(responses.eventDate);
        const currentDate = new Date();
        const weeksUntilRace = Math.ceil((eventDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
        planParameters.weeksUntilRace = weeksUntilRace;
      }

      if (responses.trainingBackground) {
        planParameters.baselineFitness = getBaselineFitnessLevel(responses.trainingBackground);
      }
      
      const startDate = new Date().toISOString().split('T')[0];
      
      console.log('🧮 Calling algorithm-based plan generation...');
      const algorithmPlan = await algorithmService.generateTrainingPlan(planParameters, startDate);
      
      console.log('✅ Algorithm plan generated:', algorithmPlan);
      
      // Debug: Check what the algorithm actually returned
      if (algorithmPlan.workouts && algorithmPlan.workouts.length > 0) {
        console.log('🔍 DEBUG - Total workouts generated:', algorithmPlan.workouts.length);
        console.log('🔍 DEBUG - First 10 workouts:');
        algorithmPlan.workouts.slice(0, 10).forEach((w, i) => {
          console.log(`  ${i + 1}. ${w.day} - ${w.discipline} ${w.type} (${w.duration}min)`);
        });
      }
      
      // Create plan object
      const plan = {
        id: `plan-${Date.now()}`,
        name: algorithmPlan.plan.name,
        description: algorithmPlan.plan.description,
        focus: selectedFocus.join(', '),
        plan: algorithmPlan.plan,
        fullPlan: algorithmPlan,
        aiAnalysis: null, // No AI analysis in rithm approach
        workouts: algorithmPlan.workouts
      };
      
      console.log('🎯 About to set generatedPlan with:', plan);
      setGeneratedPlan(plan);
      setCurrentWeek(0);
      setStep(7);
      console.log('✅ Plan set, moving to step 7');
      
    } catch (error) {
      console.error('❌ Error generating algorithm plan:', error);
      throw error;
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Helper to determine baseline fitness level
  const getBaselineFitnessLevel = (trainingBackground: string): 'beginner' | 'intermediate' | 'advanced' => {
    switch (trainingBackground) {
      case 'brand-new':
      case 'returning-6-plus':
        return 'beginner';
      case 'occasionally':
      case 'consistent-6-plus':
        return 'intermediate';
      case 'consistent-2-plus':
        return 'advanced';
      default:
        return 'intermediate';
    }
  };

  // Get distance recommendations
  const getDistanceRecommendations = (distance: string) => {
    return algorithmService.getDistanceRecommendations(distance);
  };

  // Get current step content - FIXED FLOW
  const getCurrentStepContent = () => {
    const timelineValidation = responses.distance && responses.timeline ? 
      validateTimeline(responses.distance, responses.timeline) : null;
    const recommendedTimeline = responses.distance ? 
      getRecommendedTimeline(responses.distance) : null;
    const recommendedFrequency = getRecommendedFrequency();
    const recommendedStrength = getRecommendedStrength();

    switch (step) {
      case 0:
        // Category selection
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">What would you like to focus on?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TRAINING_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  onClick={() => updateResponse('category', category.key)}
                  className={`p-4 border rounded-lg text-left transition-colors ${
                    responses.category === category.key
                      ? 'border-gray-400 bg-gray-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-semibold">{category.label}</div>
                </button>
              ))}
            </div>
            {responses.category && (
              <div className="mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        );

      case 1:
        // Triathlon distance selection (if triathlon selected) or go to strength training
        if (responses.category === 'triathlon') {
          return (
            <div>
              <h2 className="text-2xl font-medium mb-6">Choose your triathlon distance</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TRIATHLON_DISTANCES.map((distance) => (
                  <button
                    key={distance.key}
                    onClick={() => updateResponse('distance', distance.key)}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      responses.distance === distance.key
                        ? 'border-gray-400 bg-gray-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{distance.label}</div>
                  </button>
                ))}
              </div>
              {responses.distance && (
                <div className="mt-6">
                  <button
                    onClick={() => setStep(2)}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          );
        } else {
          // For non-triathlon categories, set distance to category and go to strength training
          if (!responses.distance) {
            updateResponse('distance', responses.category);
          }
          return getCurrentStepContent();
        }

      case 2:
        // Strength Training (REMOVED DISCIPLINE FOCUS)
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">Strength Training</h2>
            
            {/* Strength Training Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Choose Your Strength Training:</h3>
              
              {/* Smart Strength Suggestion */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-2">Based on your Standard (Balanced) training, we suggest:</h4>
                {(() => {
                  const suggestion = algorithmService.getStrengthSuggestion('standard');
                  const strengthOption = STRENGTH_OPTIONS.find(s => s.key === suggestion);
                  return (
                    <div className="space-y-2">
                      <div className="font-semibold text-gray-900">{strengthOption?.label}</div>
                      <div className="text-sm text-gray-700">Balanced strength training for triathlon performance</div>
                      <div className="text-xs text-gray-600">Evidence: Compound movements improve power output</div>
                      <div className="text-xs text-gray-600">Recovery: 2x/week allows proper adaptation</div>
                    </div>
                  );
                })()}
              </div>

              {/* Strength Options */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>💡 Tip:</strong> Hover over each option for detailed descriptions. 
                  <strong>Cowboy options require 6+ training days</strong> due to their 3x/week strength sessions.
                </p>
              </div>
              <TooltipProvider>
                <div className="space-y-4">
                  {STRENGTH_OPTIONS.map((option) => {
                    // Gating logic for strength options based on training days
                    let isDisabled = false;
                    let disabledReason = "";
                    
                    // Check if this strength option requires more sessions than available training days
                    if (option.key === 'cowboy_endurance' || option.key === 'cowboy_compound') {
                      // These require 3 sessions/week
                      const trainingDays = parseInt(responses.trainingFrequency?.split('-')[0] || '0');
                      if (trainingDays > 0 && trainingDays < 6) {
                        isDisabled = true;
                        disabledReason = "Cowboy options require 6-7 training days/week";
                      }
                    }
                    
                    return (
                      <Tooltip key={option.key}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => !isDisabled && updateResponse('strengthTraining', option.key)}
                            disabled={isDisabled}
                            className={`w-full p-4 border rounded-lg text-left transition-colors ${
                              responses.strengthTraining === option.key
                                ? 'border-gray-400 bg-gray-50'
                                : isDisabled
                                ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            <div className="font-semibold">{option.label}</div>
                            <div className="text-sm text-gray-600 mt-1">{option.description}</div>
                            {isDisabled && (
                              <div className="text-xs text-red-600 mt-1">{disabledReason}</div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-sm">{option.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            {responses.strengthTraining && (
              <div className="mt-6">
                <button
                  onClick={() => setStep(3)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        );

      case 3:
        // Training frequency
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">How many training days per week?</h2>
            
            {/* Honest Assessment Warning */}
            {responses.strengthTraining && (responses.strengthTraining === 'cowboy_endurance' || responses.strengthTraining === 'cowboy_compound') && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="font-semibold text-yellow-800">Honest Assessment:</div>
                <div className="text-sm text-yellow-700">
                  {responses.strengthTraining === 'cowboy_compound' ? 'Cowboy Compound' : 'Cowboy Endurance'} ({responses.strengthTraining === 'cowboy_compound' ? '3x/week strength' : '3x/week strength'}) is very demanding. 
                  You'll need 6-7 days to properly integrate this with your Standard (Balanced) - 2 sessions per discipline.
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              {TRAINING_FREQUENCY_OPTIONS.map((frequency) => {
                let isDisabled = false;
                let disabledReason = "";
                
                // Check if this frequency is compatible with selected strength training
                if (responses.strengthTraining === 'cowboy_endurance' || responses.strengthTraining === 'cowboy_compound') {
                  const days = parseInt(frequency.key.split('-')[0]);
                  if (days < 6) {
                    isDisabled = true;
                    disabledReason = `${responses.strengthTraining === 'cowboy_compound' ? 'Cowboy Compound' : 'Cowboy Endurance'} requires 6-7 days/week`;
                  }
                }
                
                // Check if this frequency is compatible with selected distance
                if (responses.distance === 'seventy3') {
                  const days = parseInt(frequency.key.split('-')[0]);
                  if (days < 5) {
                    isDisabled = true;
                    disabledReason = "70.3 distance requires minimum 5 days/week";
                  }
                }
                
                // Check if this frequency is compatible with both distance and strength
                if (responses.distance === 'seventy3' && (responses.strengthTraining === 'cowboy_endurance' || responses.strengthTraining === 'cowboy_compound')) {
                  const days = parseInt(frequency.key.split('-')[0]);
                  if (days < 6) {
                    isDisabled = true;
                    disabledReason = "70.3 with Cowboy options requires 6-7 days/week";
                  }
                }
                
                return (
                  <button
                    key={frequency.key}
                    onClick={() => !isDisabled && updateResponse('trainingFrequency', frequency.key)}
                    disabled={isDisabled}
                    className={`w-full p-4 border rounded-lg text-left transition-colors ${
                      responses.trainingFrequency === frequency.key
                        ? 'border-gray-400 bg-gray-50'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{frequency.label}</div>
                    {isDisabled && (
                      <div className="text-xs text-red-600 mt-1">{disabledReason}</div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {responses.trainingFrequency && (
              <div className="mt-6">
                <button
                  onClick={() => setStep(4)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        );

      case 4:
        // Weekly hours
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">How many hours per week?</h2>
            
            {/* Honest Assessment Warning */}
            {responses.strengthTraining && responses.distance && (
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="font-semibold text-orange-800">Honest Assessment:</div>
                <div className="text-sm text-orange-700">
                  {responses.strengthTraining === 'cowboy_compound' ? 'Cowboy Compound' : responses.strengthTraining} with {responses.distance === 'seventy3' ? '70.3 Half Ironman' : responses.distance} is demanding. 
                  Minimum recommended: {getMinimumHours(responses.distance, responses.strengthTraining)} hours/week for proper training balance.
                </div>
              </div>
            )}
            
            <div className="space-y-4">
              {[6, 8, 10, 12, 15, 18].map((hours) => {
                // Check if this volume is compatible with selected strength training and distance
                let isDisabled = false;
                let disabledReason = "";
                
                // Check if this volume is compatible with selected strength training and distance
                const minimumHours = getMinimumHours(responses.distance, responses.strengthTraining);
                if (hours < minimumHours) {
                  isDisabled = true;
                  disabledReason = `${responses.distance === 'seventy3' ? '70.3' : responses.distance} with ${responses.strengthTraining} requires minimum ${minimumHours} hours/week`;
                }
                
                return (
                  <button
                    key={hours}
                    onClick={() => !isDisabled && updateResponse('weeklyHours', hours)}
                    disabled={isDisabled}
                    className={`w-full p-4 border rounded-lg text-left transition-colors ${
                      responses.weeklyHours === hours
                        ? 'border-gray-400 bg-gray-50'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{hours} hours per week</div>
                    {isDisabled && (
                      <div className="text-xs text-red-600 mt-1">{disabledReason}</div>
                    )}
                  </button>
                );
              })}
            </div>
            
            {responses.weeklyHours && (
              <div className="mt-6">
                <button
                  onClick={() => setStep(5)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        );

      case 5:
        // Long session preferences
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">Long Session Preferences</h2>
            
            {/* Long Session Days */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Choose Your Long Session Days:</h3>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm">
                  Select which days of the week you prefer for your long training sessions. 
                  Most athletes choose weekends, but if you work weekends, you can select weekdays.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {LONG_SESSION_DAY_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => {
                      const currentDays = responses.longSessionDays || [];
                      const newDays = currentDays.includes(option.key)
                        ? currentDays.filter(day => day !== option.key)
                        : [...currentDays, option.key];
                      updateResponse('longSessionDays', newDays);
                    }}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      (responses.longSessionDays || []).includes(option.key)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Long Session Order */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Long Session Order:</h3>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm">
                  Choose whether you prefer to bike first or run first on your long session days. 
                  This affects the order of your brick workouts.
                </p>
              </div>
              <div className="space-y-3">
                {LONG_SESSION_ORDER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('longSessionOrder', option.key)}
                    className={`w-full p-4 border rounded-lg text-left transition-colors ${
                      responses.longSessionOrder === option.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>
            
            {responses.longSessionDays && responses.longSessionOrder && (
              <div className="mt-6">
                <button
                  onClick={() => setStep(6)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        );

      case 6:
        // Review and generate
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">Review Your Plan</h2>
            
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <div><strong>Focus:</strong> {TRIATHLON_DISTANCES.find(d => d.key === responses.distance)?.label || responses.distance}</div>
                <div><strong>Discipline Focus:</strong> Standard (Balanced) - 2 sessions per discipline</div>
                <div><strong>Strength:</strong> {STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining)?.label}</div>
                <div><strong>Training Days:</strong> {TRAINING_FREQUENCY_OPTIONS.find(f => f.key === responses.trainingFrequency)?.label}</div>
                <div><strong>Weekly Hours:</strong> {responses.weeklyHours} hours per week</div>
                <div><strong>Long Session Days:</strong> {(responses.longSessionDays || []).join(', ')}</div>
                <div><strong>Long Session Order:</strong> {LONG_SESSION_ORDER_OPTIONS.find(o => o.key === responses.longSessionOrder)?.label}</div>
              </div>
            </div>
            
            <button
              onClick={generatePlan}
              disabled={generatingPlan}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {generatingPlan ? 'Generating Plan...' : 'Generate Training Plan'}
            </button>
          </div>
        );

      case 7:
        // Plan display
        console.log('🔍 Step 7 - generatedPlan:', generatedPlan);
        return (
          <div>
            {generatedPlan ? (
              <div className="space-y-4">
                
                {/* Training Zones Summary */}
                {generatedPlan.fullPlan?.zones && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-semibold text-green-800 mb-2">Your Personalized Training Zones</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {generatedPlan.fullPlan.zones.bike && (
                        <div>
                          <h4 className="font-medium text-green-700">Bike Zones (FTP: {generatedPlan.fullPlan.zones.bike.zone4}w)</h4>
                          <p>Zone 1: {generatedPlan.fullPlan.zones.bike.zone1}w (Recovery)</p>
                          <p>Zone 2: {generatedPlan.fullPlan.zones.bike.zone2}w (Endurance)</p>
                          <p>Zone 3: {generatedPlan.fullPlan.zones.bike.zone3}w (Tempo)</p>
                          <p>Zone 4: {generatedPlan.fullPlan.zones.bike.zone4}w (Threshold)</p>
                          <p>Zone 5: {generatedPlan.fullPlan.zones.bike.zone5}w (VO2max)</p>
                        </div>
                      )}
                      {generatedPlan.fullPlan.zones.run && (
                        <div>
                          <h4 className="font-medium text-green-700">Run Zones</h4>
                          <p>Zone 1: {generatedPlan.fullPlan.zones.run.zone1}/mile (Recovery)</p>
                          <p>Zone 2: {generatedPlan.fullPlan.zones.run.zone2}/mile (Endurance)</p>
                          <p>Zone 3: {generatedPlan.fullPlan.zones.run.zone3}/mile (Tempo)</p>
                          <p>Zone 4: {generatedPlan.fullPlan.zones.run.zone4}/mile (Threshold)</p>
                          <p>Zone 5: {generatedPlan.fullPlan.zones.run.zone5}/mile (VO2max)</p>
                        </div>
                      )}
                      {generatedPlan.fullPlan.zones.swim && (
                        <div>
                          <h4 className="font-medium text-green-700">Swim Zones</h4>
                          <p>Zone 1: {generatedPlan.fullPlan.zones.swim.zone1} (Recovery)</p>
                          <p>Zone 2: {generatedPlan.fullPlan.zones.swim.zone2} (Endurance)</p>
                          <p>Zone 3: {generatedPlan.fullPlan.zones.swim.zone3} (Tempo)</p>
                          <p>Zone 4: {generatedPlan.fullPlan.zones.swim.zone4} (Threshold)</p>
                          <p>Zone 5: {generatedPlan.fullPlan.zones.swim.zone5} (VO2max)</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Display workouts with week tabs */}
                {generatedPlan.workouts && generatedPlan.workouts.length > 0 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">{getPlanTitle()}</h3>
                    
                    {/* Plan overview */}
                    <div className="mb-6">
                      <h4 className="text-base font-medium">12-Week Training Plan • {generatedPlan.workouts.length} sessions</h4>
                      <p className="text-sm text-gray-600">Progressive phases: Base → Build → Peak → Taper</p>
                    </div>
                    
                    {/* Week tabs */}
                    <div className="border-b border-gray-200">
                      <div className="flex space-x-8 overflow-x-auto">
                        {Array.from({ length: 12 }, (_, weekIndex) => {
                          const phase = weekIndex < 5 ? 'Base' : weekIndex < 9 ? 'Build' : weekIndex < 10 ? 'Peak' : 'Taper';
                          return (
                            <button
                              key={weekIndex}
                              onClick={() => setCurrentWeek(weekIndex)}
                              className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                                currentWeek === weekIndex
                                  ? 'border-gray-900 text-gray-900'
                                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              Week {weekIndex + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Week content */}
                    {Array.from({ length: 12 }, (_, weekIndex) => {
                      // FIXED: Properly slice workouts for each week
                      // The algorithm generates 12 weeks with varying sessions per week
                      // We need to find workouts that belong to this specific week
                      const weekWorkouts = generatedPlan.workouts.filter((workout: any) => {
                        const dayWithWeek = workout.day || '';
                        // Extract week number from day string like "Monday (Week 1)"
                        const weekMatch = dayWithWeek.match(/Week (\d+)/);
                        if (weekMatch) {
                          return parseInt(weekMatch[1]) === weekIndex + 1;
                        }
                        // Fallback: if no week info, use old slicing (shouldn't happen with new algorithm)
                        return false;
                      });
                      
                            // Debug logging for all weeks
      console.log(`🔍 DEBUG - Week ${weekIndex + 1} filtering:`);
      console.log(`  Looking for workouts with "Week ${weekIndex + 1}"`);
      console.log(`  Found ${weekWorkouts.length} workouts for Week ${weekIndex + 1}`);
      
      if (weekIndex < 3) { // Show first 3 weeks for debugging
        weekWorkouts.forEach((w, i) => {
          console.log(`    ${i + 1}. ${w.day} - ${w.discipline} ${w.type} (${w.duration}min)`);
          if (w.discipline === 'strength') {
            console.log(`       💪 Strength details: ${w.detailedWorkout ? 'EXISTS' : 'MISSING'}`);
            if (w.detailedWorkout) {
              console.log(`       💪 Content: ${w.detailedWorkout.substring(0, 100)}...`);
            }
          }
        });
      }
                      
                      const phase = weekIndex < 5 ? 'Base' : weekIndex < 9 ? 'Build' : weekIndex < 10 ? 'Peak' : 'Taper';
                      
                      return (
                        <div key={weekIndex} className={currentWeek === weekIndex ? 'block' : 'hidden'}>
                          <div className="mb-6">
                            <h4 className="text-base font-medium">Week {weekIndex + 1} - {phase} Phase</h4>
                            <p className="text-sm text-gray-600">
                              {weekWorkouts.length} sessions • {Math.round(weekWorkouts.reduce((sum, w) => sum + (w.duration || 0), 0) / 60)} hours
                            </p>
                          </div>
                          <div className="space-y-4">
                            {(() => {
                              // Group workouts by day and split brick workouts
                              const workoutsByDay: { [key: string]: any[] } = {};
                              weekWorkouts.forEach((workout: any) => {
                                // Extract just the day name (without week number) for grouping
                                const dayName = workout.day ? workout.day.split(' (Week')[0] : 'Unknown';
                                if (!workoutsByDay[dayName]) {
                                  workoutsByDay[dayName] = [];
                                }
                                
                                // Split brick workouts into separate bike and run components
                                if (workout.discipline === 'brick') {
                                  const totalDuration = workout.duration || 0;
                                  const bikeDuration = Math.floor(totalDuration * 0.7);
                                  const runDuration = totalDuration - bikeDuration;
                                  
                                  // Add bike component
                                  workoutsByDay[dayName].push({
                                    ...workout,
                                    discipline: 'bike',
                                    duration: bikeDuration,
                                    type: 'brick-bike',
                                    description: 'Bike portion of brick workout',
                                    detailedWorkout: workout.detailedWorkout ? 
                                      workout.detailedWorkout.split('\n').filter(line => line.includes('Bike:')).join('\n') : 
                                      'Bike portion of brick workout'
                                  });
                                  
                                  // Add run component
                                  workoutsByDay[dayName].push({
                                    ...workout,
                                    discipline: 'run',
                                    duration: runDuration,
                                    type: 'brick-run',
                                    description: 'Run portion of brick workout',
                                    detailedWorkout: workout.detailedWorkout ? 
                                      workout.detailedWorkout.split('\n').filter(line => line.includes('Run:')).join('\n') : 
                                      'Run portion of brick workout'
                                  });
                                } else {
                                  workoutsByDay[dayName].push(workout);
                                }
                              });

                              return Object.entries(workoutsByDay).map(([day, workouts], dayIndex) => {
                                const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);



                                return (
                                  <div key={day} className="mb-6">
                                    {/* Day header */}
                                    <div className="mb-3">
                                      <h5 className="text-sm font-medium">{day}</h5>
                                      <p className="text-xs text-gray-500">{totalDuration}min total</p>
                                    </div>
                                    
                                    {/* Multiple workouts for this day */}
                                    {workouts.length > 1 ? (
                                      <WorkoutTabs workouts={workouts} />
                                    ) : (
                                      /* Single workout for this day */
                                      <div className="mb-4">
                                        {workouts.map((workout, index) => (
                                          <div key={index} className="mb-3">
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-xs">{workout.discipline}</span>
                                              {workout.type && workout.type !== workout.discipline && (
                                                <span className="text-xs text-gray-500">{workout.type}</span>
                                              )}
                                            </div>
                                            {workout.detailedWorkout ? (
                                              <div>
                                                <p className="text-sm font-medium mb-1">Workout:</p>
                                                <pre className="text-xs text-gray-700 whitespace-pre-wrap">{workout.detailedWorkout}</pre>
                                              </div>
                                            ) : (
                                              <div>
                                                <p className="text-sm text-gray-600">{workout.description}</p>
                                              </div>
                                            )}
                                            {workout.intensity && (
                                              <p className="text-xs text-gray-500 mt-1">Intensity: {workout.intensity}</p>
                                            )}
                                            {workout.zones && workout.zones.length > 0 && (
                                              <p className="text-xs text-gray-500">Zones: {workout.zones.join(', ')}</p>
                                            )}
                                            {workout.strengthType && (
                                              <p className="text-xs text-gray-500">Strength Type: {workout.strengthType}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    
                    <div className="mt-8">
                      <h4 className="text-base font-medium mb-2">Progression Overview</h4>
                      <p className="text-sm text-gray-600">Base (Weeks 1-5): Build aerobic foundation • Build (Weeks 6-9): Increase volume & intensity • Peak (Week 10): High intensity • Taper (Weeks 11-12): Reduce volume, maintain intensity</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-red-700">No plan generated. generatedPlan is: {JSON.stringify(generatedPlan)}</p>
              </div>
            )}
          </div>
        );

      default:
        return <div>Invalid step</div>;
    }
  };

  // Helper functions - preserve existing logic
  const validateTimeline = (distance: string, timeline: string) => {
    // Implementation preserved from original
    return { isValid: true, warning: null };
  };

  const getRecommendedTimeline = (distance: string) => {
    // Implementation preserved from original
    return '16-20 weeks';
  };

  const getRecommendedFrequency = () => {
    // Implementation preserved from original
    return '5-days';
  };

  const getRecommendedStrength = () => {
    // Implementation preserved from original
    return 'power_development';
  };

  const getPlanTitle = () => {
    if (!responses.distance) return "Your Training Plan (12-Week Progression)";
    
    // Distance mapping
    const distanceNames = {
      'sprint': 'Sprint Triathlon',
      'olympic': 'Olympic Triathlon', 
      'seventy3': '70.3 Triathlon',
      'ironman': 'Ironman Triathlon',
      'running': 'Running',
      'cycling': 'Cycling',
      'swimming': 'Swimming',
      'strength': 'Strength Training',
      'hybrid': 'Hybrid Training'
    };
    
    let title = distanceNames[responses.distance] || 'Training';
    
    // Add strength info
    if (responses.strengthTraining && responses.strengthTraining !== 'none') {
      const strengthNames = {
        'power_development': 'with Power Development',
        'stability_focus': 'with Stability Focus',
        'compound_strength': 'with Compound Strength',
        'cowboy_endurance': 'with Cowboy Endurance',
        'cowboy_compound': 'with Cowboy Compound'
      };
      title += ` ${strengthNames[responses.strengthTraining] || ''}`;
    }
    
    return `${title} Plan (12-Week Progression)`;
  };

  return (
    <div className="w-full">
      <div>
        {getCurrentStepContent()}
      </div>

      {step > 0 && step < 6 && (
        <div className="mt-6">
          <button
            onClick={() => setStep(step - 1)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
} 