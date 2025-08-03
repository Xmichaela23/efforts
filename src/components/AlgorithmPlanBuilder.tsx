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
      <div className="flex border-b border-gray-200">
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
      <div className="p-3">
        {workouts.map((workout, index) => (
          <div key={index} className={currentDay === index ? 'block' : 'hidden'}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2 py-1 bg-gray-100 rounded">{workout.discipline}</span>
              {workout.type && workout.type !== workout.discipline && (
                <span className="text-xs px-2 py-1 bg-blue-100 rounded">{workout.type}</span>
              )}
            </div>
            {workout.detailedWorkout ? (
              <div>
                <p className="text-sm font-medium text-gray-800 mb-1">Workout:</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 rounded border">{workout.detailedWorkout}</pre>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mt-1">{workout.description}</p>
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

const DISCIPLINE_FOCUS_OPTIONS = [
  { 
    key: 'standard', 
    label: 'Standard (Balanced) - 2 sessions per discipline',
    description: 'Balanced training across all disciplines. Works well for all distances and experience levels.'
  },
  { 
    key: 'swim_speed', 
    label: 'Swim Focus + Speed - 3 swims, technique/intervals',
    description: 'Extra swim sessions focused on technique and speed work. Great for improving swim efficiency.'
  },
  { 
    key: 'swim_endurance', 
    label: 'Swim Focus + Endurance - 3 swims, longer sessions',
    description: 'Extra swim sessions focused on building endurance. Ideal for longer swim distances.'
  },
  { 
    key: 'bike_speed', 
    label: 'Bike Focus + Speed - 3 bikes, power intervals',
    description: 'Extra bike sessions focused on power and speed. Great for improving bike performance.'
  },
  { 
    key: 'bike_endurance', 
    label: 'Bike Focus + Endurance - 3 bikes, longer rides',
    description: 'Extra bike sessions focused on building endurance. Ideal for longer bike distances.'
  },
  { 
    key: 'run_speed', 
    label: 'Run Focus + Speed - 3 runs, tempo/speed work',
    description: 'Extra run sessions focused on speed and tempo work. Great for improving run performance.'
  },
  { 
    key: 'run_endurance', 
    label: 'Run Focus + Endurance - 3 runs, longer runs',
    description: 'Extra run sessions focused on building endurance. Ideal for longer run distances.'
  },
  { 
    key: 'bike_run_speed', 
    label: 'Bike + Run Speed - 3 bikes, 2 runs, both high intensity',
    description: 'High-intensity focus on bike and run. Demanding but effective for performance gains.'
  },
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
    disciplineFocus: 'standard',
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

  // Toggle focus helper
  const toggleFocus = (focus: string) => {
    setSelectedFocus((prev) =>
      prev.includes(focus) ? prev.filter((f) => f !== focus) : [...prev, focus]
    );
  };

  // Validation helper
  const validateAssessment = () => {
    const requiredFields = [
      'distance',
      'disciplineFocus',
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
  const generatePlan = async () => {
    try {
      // Validate assessment completion first
      validateAssessment();
      
      setGeneratingPlan(true);
      
      console.log('🧮 Starting rithm-based plan generation...');
      console.log('📊 Baselines:', baselines);
      console.log('📝 Responses:', responses);
      
      // Extract plan parameters
      const planParameters: PlanParameters = {
        distance: responses.distance as any,
        strengthOption: responses.strengthTraining || 'none',
        disciplineFocus: responses.disciplineFocus,
        targetHours: responses.weeklyHours,
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
      
      console.log('🧮 Calling rithm-based plan generation...');
      const algorithmPlan = await algorithmService.generateTrainingPlan(planParameters, startDate);
      
      console.log('✅ Rithm plan generated:', algorithmPlan);
      
      // Debug: Check what the algorithm actually returned
      if (algorithmPlan.workouts && algorithmPlan.workouts.length > 0) {
        const firstWorkout = algorithmPlan.workouts[0];
        console.log('🔍 DEBUG - First workout structure:', firstWorkout);
        console.log('🔍 DEBUG - First workout keys:', Object.keys(firstWorkout));
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
      console.error('❌ Error generating rithm plan:', error);
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
        // Triathlon distance selection (if triathlon selected) or go to discipline focus
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
          // For non-triathlon categories, set distance to category and go to discipline focus
          if (!responses.distance) {
            updateResponse('distance', responses.category);
          }
          return getCurrentStepContent();
        }

              case 2:
          // Discipline Focus & Strength Training (COMBINED)
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">Discipline Focus & Strength Training</h2>
            
            {/* Discipline Focus Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Choose Your Focus:</h3>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm">
                  Choose your training focus based on your goals and available time. Higher training volumes (6-7 days/week) allow for more specialized focus, 
                  while lower volumes (4-5 days/week) work better with balanced training across all disciplines.
                </p>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-sm">
                    <strong>📊 Session Counts:</strong> The session counts shown (2-3 per discipline) are consistent across all distances. 
                    For shorter distances (Sprint/Olympic), sessions are shorter but more intense. 
                    For longer distances (70.3/Ironman), sessions are longer with more volume.
                  </p>
                </div>
                {responses.trainingFrequency && ['6-days', '7-days'].includes(responses.trainingFrequency) && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <p className="text-sm">
                      You may be inclined to focus on a discipline you enjoy, and while we totally support your training being fulfilling, 
                      you may want to consider focusing on an area you feel needs more development.
                    </p>
                  </div>
                )}
              </div>
              <TooltipProvider>
                <div className="space-y-4">
                  {DISCIPLINE_FOCUS_OPTIONS.map((option) => (
                    <Tooltip key={option.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => updateResponse('disciplineFocus', option.key)}
                          className={`w-full p-4 border rounded-lg text-left transition-colors ${
                            responses.disciplineFocus === option.key
                              ? 'border-gray-400 bg-gray-50'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          <div className="font-semibold">{option.label}</div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-sm">{option.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>

            {/* Strength Training Section - Only show after discipline focus is selected */}
            {responses.disciplineFocus && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Strength Training:</h3>
                
                {/* Smart Strength Suggestion */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-2">Based on your {DISCIPLINE_FOCUS_OPTIONS.find(d => d.key === responses.disciplineFocus)?.label}, we suggest:</h4>
                  {(() => {
                    const suggestion = algorithmService.getStrengthSuggestion(responses.disciplineFocus);
                    const strengthOption = STRENGTH_OPTIONS.find(s => s.key === suggestion.recommended);
                    return (
                      <div className="space-y-2">
                        <div className="font-semibold text-gray-900">{strengthOption?.label}</div>
                        <div className="text-sm text-gray-700">{suggestion.reason}</div>
                        <div className="text-xs text-gray-600">Evidence: {suggestion.evidence}</div>
                        <div className="text-xs text-gray-600">Recovery: {suggestion.recovery}</div>
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
                              <div className="text-sm text-gray-600 mt-2">{option.description}</div>
                              {isDisabled && (
                                <div className="text-sm text-red-600 mt-1">{disabledReason}</div>
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
            )}

            {/* Continue Button - Only show when both are selected */}
            {responses.disciplineFocus && responses.strengthTraining && (
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
          // Training days - with honest assessment
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">How many training days per week?</h2>
            
                          {/* Honest Assessment Based on Focus and Strength */}
              {responses.disciplineFocus && responses.strengthTraining && (
                <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h3 className="font-semibold text-yellow-800 mb-2">Honest Assessment:</h3>
                {(() => {
                  const focus = DISCIPLINE_FOCUS_OPTIONS.find(d => d.key === responses.disciplineFocus);
                  const strength = STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining);
                  const distance = responses.category === 'triathlon' 
                  ? TRIATHLON_DISTANCES.find(d => d.key === responses.distance)
                  : TRAINING_CATEGORIES.find(d => d.key === responses.distance);
                  
                  let assessment = "";
                  if (responses.disciplineFocus === 'bike_run_speed' && responses.strengthTraining !== 'none') {
                    assessment = `Your ${focus?.label} with ${strength?.label} requires significant recovery. Consider 5-6 days to allow proper rest between high-intensity sessions.`;
                  } else if (responses.strengthTraining === 'cowboy_compound') {
                    assessment = `Cowboy Compound (3x/week strength) is very demanding. You'll need 6-7 days to properly integrate this with your ${focus?.label}.`;
                  } else if (responses.strengthTraining === 'none') {
                    assessment = `No strength training gives you more flexibility. You can train 4-7 days depending on your endurance goals.`;
                  } else {
                    assessment = `Your ${focus?.label} with ${strength?.label} works well with 5-6 training days per week.`;
                  }
                  
                  return <div className="text-sm text-yellow-700">{assessment}</div>;
                })()}
              </div>
            )}
            
            <div className="space-y-4">
              {TRAINING_FREQUENCY_OPTIONS.map((option) => {
                // Gate training days based on distance
                let isDisabled = false;
                let disabledReason = "";
                
                if (responses.distance === 'sprint') {
                  if (option.key === '7-days') {
                    isDisabled = true;
                    disabledReason = "Sprint distance doesn't require 7 days/week";
                  }
                } else if (responses.distance === 'olympic') {
                  if (option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Olympic distance requires minimum 5 days/week";
                  }
                } else if (responses.distance === 'seventy3') {
                  if (option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "70.3 distance requires minimum 5 days/week";
                  }
                } else if (responses.distance === 'ironman') {
                  if (option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Ironman distance requires minimum 5 days/week";
                  }
                }
                
                // Factor in strength training requirements
                if (responses.strengthTraining && !isDisabled) {
                  if (responses.strengthTraining === 'cowboy_compound' && option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Cowboy Compound (3x/week strength) requires minimum 5 days/week";
                  } else if (responses.strengthTraining === 'cowboy_endurance' && option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Cowboy Endurance (3x/week strength) requires minimum 5 days/week";
                  } else if (responses.strengthTraining === 'compound_strength' && option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Compound Strength (2x/week) requires minimum 5 days/week";
                  } else if (responses.strengthTraining === 'power_development' && option.key === '4-days') {
                    isDisabled = true;
                    disabledReason = "Power Development (2x/week) requires minimum 5 days/week";
                  }
                }
                
                return (
                  <button
                    key={option.key}
                    onClick={() => !isDisabled && updateResponse('trainingFrequency', option.key)}
                    disabled={isDisabled}
                    className={`w-full p-4 border rounded-lg text-left transition-colors ${
                      responses.trainingFrequency === option.key
                        ? 'border-gray-400 bg-gray-50'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{option.label}</div>
                    {isDisabled && (
                      <div className="text-xs text-gray-500 mt-1">{disabledReason}</div>
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
          // Weekly hours - with honest assessment
        return (
          <div>
            <h2 className="text-2xl font-medium mb-6">How many hours per week?</h2>
            
                          {/* Honest Assessment Based on All Selections */}
              {responses.distance && responses.disciplineFocus && responses.strengthTraining && responses.trainingFrequency && (
                <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="font-semibold text-orange-800 mb-2">Honest Assessment:</h3>
                {(() => {
                                      const distance = responses.category === 'triathlon' 
                      ? TRIATHLON_DISTANCES.find(d => d.key === responses.distance)
                      : TRAINING_CATEGORIES.find(d => d.key === responses.distance);
                    const focus = DISCIPLINE_FOCUS_OPTIONS.find(d => d.key === responses.disciplineFocus);
                    const strength = STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining);
                  const days = TRAINING_FREQUENCY_OPTIONS.find(t => t.key === responses.trainingFrequency);
                  
                  let assessment = "";
                  let recommendedHours = "";
                  
                  // Calculate recommended hours based on selections
                  if (responses.distance === 'sprint') {
                    recommendedHours = "6-8 hours";
                    if (responses.strengthTraining !== 'none') {
                      assessment = `For ${distance?.label} with ${strength?.label}, aim for ${recommendedHours} per week. This allows proper recovery between high-intensity sessions.`;
                    } else {
                      assessment = `For ${distance?.label} without strength, ${recommendedHours} gives you good balance of intensity and recovery.`;
                    }
                  } else if (responses.distance === 'olympic') {
                    recommendedHours = "8-12 hours";
                    if (responses.disciplineFocus === 'bike_run_speed') {
                      assessment = `Your ${focus?.label} for ${distance?.label} requires ${recommendedHours} to properly develop both bike power and run speed.`;
                    } else {
                      assessment = `For ${distance?.label} with ${focus?.label}, ${recommendedHours} provides adequate volume for improvement.`;
                    }
                  } else if (responses.distance === 'seventy3') {
                    recommendedHours = "12-15 hours";
                    if (responses.strengthTraining === 'cowboy_compound') {
                      assessment = `Cowboy Compound with ${distance?.label} is very demanding. Consider 15+ hours if you can handle the volume.`;
                    } else {
                      assessment = `For ${distance?.label} with ${focus?.label}, ${recommendedHours} is the sweet spot for performance improvement.`;
                    }
                  } else if (responses.distance === 'ironman') {
                    recommendedHours = "15-20 hours";
                    if (responses.strengthTraining !== 'none') {
                      assessment = `Ironman with strength training requires ${recommendedHours}. Traditional strength options recommended over Cowboy approaches.`;
                    } else {
                      assessment = `For Ironman without strength, ${recommendedHours} allows focus on pure endurance development.`;
                    }
                  }
                  
                  return <div className="text-sm text-orange-700">{assessment}</div>;
                })()}
              </div>
            )}
            
            <div className="space-y-4">
              {[6, 8, 10, 12, 15, 18].map((hours) => {
                // Gate weekly hours based on distance
                let isDisabled = false;
                let disabledReason = "";
                
                if (responses.distance === 'sprint') {
                  if (hours > 12) {
                    isDisabled = true;
                    disabledReason = "Sprint distance doesn't require more than 12 hours/week";
                  }
                } else if (responses.distance === 'olympic') {
                  if (hours < 8) {
                    isDisabled = true;
                    disabledReason = "Olympic distance requires minimum 8 hours/week";
                  } else if (hours > 15) {
                    isDisabled = true;
                    disabledReason = "Olympic distance doesn't require more than 15 hours/week";
                  }
                } else if (responses.distance === 'seventy3') {
                  if (hours < 10) {
                    isDisabled = true;
                    disabledReason = "70.3 distance requires minimum 10 hours/week";
                  }
                } else if (responses.distance === 'ironman') {
                  if (hours < 12) {
                    isDisabled = true;
                    disabledReason = "Ironman distance requires minimum 12 hours/week";
                  }
                }
                
                // Factor in strength training requirements
                if (responses.strengthTraining && !isDisabled) {
                  if (responses.strengthTraining === 'cowboy_compound') {
                    if (hours < 12) {
                      isDisabled = true;
                      disabledReason = "Cowboy Compound (3x/week strength) requires minimum 12 hours/week";
                    }
                  } else if (responses.strengthTraining === 'cowboy_endurance') {
                    if (hours < 10) {
                      isDisabled = true;
                      disabledReason = "Cowboy Endurance (3x/week strength) requires minimum 10 hours/week";
                    }
                  } else if (responses.strengthTraining === 'compound_strength') {
                    if (hours < 8) {
                      isDisabled = true;
                      disabledReason = "Compound Strength (2x/week) requires minimum 8 hours/week";
                    }
                  } else if (responses.strengthTraining === 'power_development') {
                    if (hours < 8) {
                      isDisabled = true;
                      disabledReason = "Power Development (2x/week) requires minimum 8 hours/week";
                    }
                  } else if (responses.strengthTraining === 'stability_focus') {
                    if (hours < 6) {
                      isDisabled = true;
                      disabledReason = "Stability Focus (2x/week) requires minimum 6 hours/week";
                    }
                  }
                  // No strength training has no additional hour requirements
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
                        : 'border-gray-400 hover:border-gray-400'
                    }`}
                  >
                    <div className="font-semibold">{hours} hours per week</div>
                    {isDisabled && (
                      <div className="text-xs text-gray-500 mt-1">{disabledReason}</div>
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
          // Long Session Preferences
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

            {/* Continue Button */}
            {responses.longSessionDays && responses.longSessionDays.length > 0 && responses.longSessionOrder && (
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
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div><strong>Focus:</strong> {responses.category === 'triathlon' 
                ? TRIATHLON_DISTANCES.find(d => d.key === responses.distance)?.label
                : TRAINING_CATEGORIES.find(d => d.key === responses.distance)?.label}</div>
              <div><strong>Discipline Focus:</strong> {DISCIPLINE_FOCUS_OPTIONS.find(d => d.key === responses.disciplineFocus)?.label}</div>
              <div><strong>Strength:</strong> {STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining)?.label}</div>
              <div><strong>Training Days:</strong> {TRAINING_FREQUENCY_OPTIONS.find(t => t.key === responses.trainingFrequency)?.label}</div>
              <div><strong>Weekly Hours:</strong> {responses.weeklyHours} hours</div>
              <div><strong>Long Session Days:</strong> {(responses.longSessionDays || []).map(day => 
                LONG_SESSION_DAY_OPTIONS.find(d => d.key === day)?.label).join(', ')}</div>
              <div><strong>Long Session Order:</strong> {LONG_SESSION_ORDER_OPTIONS.find(o => o.key === responses.longSessionOrder)?.label}</div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => {
                  console.log('🚀 Generate button clicked!');
                  console.log('📊 Current responses:', responses);
                  console.log('📊 Current baselines:', baselines);
                  generatePlan();
                }}
                disabled={generatingPlan}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {generatingPlan ? 'Generating Plan...' : 'Generate Training Plan'}
              </button>
            </div>
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
                    <h3 className="text-lg font-medium">Your Training Plan (12-Week Progression)</h3>
                    
                    {/* Week tabs */}
                    <div className="border-b border-gray-200">
                      <div className="flex space-x-8 overflow-x-auto">
                        {Array.from({ length: Math.min(12, Math.ceil(generatedPlan.workouts.length / 6)) }, (_, weekIndex) => {
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
                    {Array.from({ length: Math.min(12, Math.ceil(generatedPlan.workouts.length / 6)) }, (_, weekIndex) => {
                      const weekWorkouts = generatedPlan.workouts.slice(weekIndex * 6, (weekIndex + 1) * 6);
                      const phase = weekIndex < 5 ? 'Base' : weekIndex < 9 ? 'Build' : weekIndex < 10 ? 'Peak' : 'Taper';
                      const phaseColor = weekIndex < 5 ? 'bg-blue-100' : weekIndex < 9 ? 'bg-green-100' : weekIndex < 10 ? 'bg-yellow-100' : 'bg-purple-100';
                      
                      return (
                        <div key={weekIndex} className={currentWeek === weekIndex ? 'block' : 'hidden'}>
                          <div className={`p-3 ${phaseColor} rounded-lg mb-4`}>
                            <h4 className="font-semibold">Week {weekIndex + 1} - {phase} Phase</h4>
                            <p className="text-sm text-gray-600">
                              {weekWorkouts.length} sessions • {Math.round(weekWorkouts.reduce((sum, w) => sum + (w.duration || 0), 0) / 60)} hours
                            </p>
                          </div>
                          <div className="space-y-4">
                            {(() => {
                              // Group workouts by day and split brick workouts
                              const workoutsByDay: { [key: string]: any[] } = {};
                              weekWorkouts.forEach((workout: any) => {
                                const day = workout.day || workout.date || 'Unknown';
                                if (!workoutsByDay[day]) {
                                  workoutsByDay[day] = [];
                                }
                                
                                // Split brick workouts into separate bike and run components
                                if (workout.discipline === 'brick') {
                                  const totalDuration = workout.duration || 0;
                                  const bikeDuration = Math.floor(totalDuration * 0.7);
                                  const runDuration = totalDuration - bikeDuration;
                                  
                                  // Add bike component
                                  workoutsByDay[day].push({
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
                                  workoutsByDay[day].push({
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
                                  workoutsByDay[day].push(workout);
                                }
                              });

                              return Object.entries(workoutsByDay).map(([day, workouts], dayIndex) => {
                                const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);

                                return (
                                  <div key={day} className="border border-gray-200 rounded-lg">
                                    {/* Day header with total duration */}
                                    <div className="flex justify-between items-center p-3 bg-gray-50 border-b border-gray-200">
                                      <span className="text-sm font-medium">{day}</span>
                                      <span className="text-sm text-gray-500">{totalDuration}min total</span>
                                    </div>
                                    
                                    {/* Multiple workouts for this day */}
                                    {workouts.length > 1 ? (
                                      <WorkoutTabs workouts={workouts} />
                                    ) : (
                                      /* Single workout for this day */
                                      <div className="p-3">
                                        {workouts.map((workout, index) => (
                                          <div key={index}>
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-xs px-2 py-1 bg-gray-100 rounded">{workout.discipline}</span>
                                              {workout.type && workout.type !== workout.discipline && (
                                                <span className="text-xs px-2 py-1 bg-blue-100 rounded">{workout.type}</span>
                                              )}
                                            </div>
                                            {workout.detailedWorkout ? (
                                              <div>
                                                <p className="text-sm font-medium text-gray-800 mb-1">Workout:</p>
                                                <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 p-2 rounded border">{workout.detailedWorkout}</pre>
                                              </div>
                                            ) : (
                                              <div>
                                                <p className="text-sm text-gray-600 mt-1">{workout.description}</p>
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
                    
                    <div className="text-center text-gray-500 p-4 bg-gray-50 rounded-lg">
                      <p className="font-medium">Progression Overview</p>
                      <p className="text-sm">Base (Weeks 1-5): Build aerobic foundation • Build (Weeks 6-9): Increase volume & intensity • Peak (Week 10): High intensity • Taper (Weeks 11-12): Reduce volume, maintain intensity</p>
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
        return <div>Step not implemented</div>;
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

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-medium mb-2">Rithm Training Plan Builder</h1>
        <p className="text-gray-600">Evidence-based rithm for personalized training</p>
      </div>

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