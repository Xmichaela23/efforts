import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
// Import Font Awesome icons at the top
import { FaRunning, FaSwimmer, FaBiking, FaDumbbell, FaRoad, FaChartArea, FaBalanceScale, FaMedal, FaObjectGroup, FaCog } from 'react-icons/fa';
import { RealTrainingAI } from '../services/RealTrainingAI';
import { PlanEngine } from '../services/PlanEngine';

// Triathlon-specific assessment options
const TRIATHLON_DISTANCES = [
  { key: 'sprint', label: 'Sprint (750m swim, 20km bike, 5km run)' },
  { key: 'olympic', label: 'Olympic (1.5km swim, 40km bike, 10km run)' },
  { key: '70.3', label: '70.3 Half Ironman (1.9km swim, 90km bike, 21km run)' },
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

const STRENGTH_OPTIONS = [
  { key: 'no-strength', label: 'No strength training' },
  { key: 'power-development', label: 'Power development (plyometrics, explosive movements)' },
  { key: 'power-lifting', label: 'Power lifting (compound lifts, heavy weight, low reps)' },
  { key: 'injury-prevention', label: 'Injury prevention (mobility, stability, corrective work)' },
  { key: 'sport-specific', label: 'Sport-specific (triathlon movements)' },
  { key: 'build-muscle', label: 'Build muscle (hypertrophy, 8-12 reps)' },
  { key: 'general-fitness', label: 'General fitness (basic conditioning)' },
];

const GOAL_OPTIONS = [
  { key: 'speed-improvement', label: 'Speed Improvement', description: 'Improve pace/speed in one or more disciplines' },
  { key: 'endurance-building', label: 'Endurance Building', description: 'Build stamina for longer distances' },
  { key: 'strength-development', label: 'Strength Development', description: 'Get stronger for better performance' },
  { key: 'technique-refinement', label: 'Technique Refinement', description: 'Improve form and efficiency' },
  { key: 'complete-finish', label: 'Complete & Finish', description: 'Just complete the race successfully' },
  { key: 'personal-best', label: 'Personal Best', description: 'Beat my previous race times' },
  { key: 'qualify', label: 'Qualify', description: 'Qualify for championships or other events' },
  { key: 'podium', label: 'Podium', description: 'Compete for age group placement' },
  { key: 'swim-focus', label: 'Swim Focus', description: 'Improve swimming (my weakest discipline)' },
  { key: 'bike-focus', label: 'Bike Focus', description: 'Improve cycling (my strongest discipline)' },
  { key: 'run-focus', label: 'Run Focus', description: 'Improve running (my strongest discipline)' },
  { key: 'balanced-improvement', label: 'Balanced Improvement', description: 'Improve all disciplines equally' },
  { key: 'first-timer', label: 'First Timer', description: 'Complete my first triathlon' },
  { key: 'building-experience', label: 'Building Experience', description: 'Gain more race experience' },
  { key: 'advanced-training', label: 'Advanced Training', description: 'Take my training to the next level' },
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

const WEEKEND_DURATION_OPTIONS = [
  { key: '1-2-hours', label: '1-2 hours' },
  { key: '2-3-hours', label: '2-3 hours' },
  { key: '3-4-hours', label: '3-4 hours' },
  { key: '4-plus-hours', label: '4+ hours' },
];

const WEEKEND_AVAILABILITY_OPTIONS = [
  { key: 'both-days', label: 'Both Saturday and Sunday' },
  { key: 'saturday-only', label: 'Saturday only' },
  { key: 'sunday-only', label: 'Sunday only' },
  { key: 'weekdays-only', label: 'Weekdays only (work weekends)' },
  { key: 'flexible', label: 'Flexible - can adjust schedule' },
];

const LONG_SESSION_PREFERENCES = [
  { key: 'traditional-weekend', label: 'Traditional: Saturday long ride, Sunday long run' },
  { key: 'reverse-weekend', label: 'Reverse: Sunday long ride, Saturday long run' },
  { key: 'weekday-long', label: 'Weekday long sessions (for weekend workers)' },
  { key: 'split-weekend', label: 'Split: One long session each weekend day' },
  { key: 'flexible-weekly', label: 'Flexible: I\'ll adjust based on my weekly schedule' },
  { key: 'optimize', label: 'Let the system optimize based on my availability' },
];

// Update training philosophy options to use only text
const TRAINING_PHILOSOPHY_OPTIONS = [
  { key: 'polarized', label: <><FaRoad className="inline mr-2" />POLARIZED (80% easy, 20% hard)</> },
  { key: 'pyramid', label: <><FaChartArea className="inline mr-2" />PYRAMIDAL (weekly intensity progression)</> },
  { key: 'threshold', label: <><FaBalanceScale className="inline mr-2" />THRESHOLD (40% moderate, 40% easy, 20% hard)</> },
];

// Separate course detail options for different disciplines
const RUNNING_COURSE_OPTIONS = {
  elevationGain: [
    '0-500 ft (Flat)',
    '500-1500 ft (Rolling)',
    '1500-3000 ft (Hilly)',
    '3000+ ft (Mountainous)'
  ],
  courseProfile: [
    'Flat/Out and back',
    'Rolling hills',
    'Hilly with climbs',
    'Mountainous with steep climbs',
    'Mixed terrain'
  ],
  surfaceType: [
    'Road/Pavement',
    'Trail/Dirt',
    'Gravel',
    'Mixed surfaces',
    'Track',
    'Treadmill'
  ],
  climate: [
    'Cool (under 60°F)',
    'Moderate (60-75°F)',
    'Warm (75-85°F)',
    'Hot (85-95°F)',
    'Very hot (95°F+)',
    'Humid conditions',
    'High altitude',
    'Variable weather'
  ]
};

const CYCLING_COURSE_OPTIONS = {
  elevationGain: [
    '0-1000 ft (Flat)',
    '1000-3000 ft (Rolling)',
    '3000-6000 ft (Hilly)',
    '6000+ ft (Mountainous)'
  ],
  courseProfile: [
    'Flat/Time trial style',
    'Rolling hills',
    'Hilly with climbs',
    'Mountainous with steep climbs',
    'Mixed terrain',
    'Technical descents'
  ],
  surfaceType: [
    'Road/Pavement',
    'Gravel',
    'Mixed surfaces',
    'Indoor trainer',
    'Mountain bike trails'
  ],
  climate: [
    'Cool (under 60°F)',
    'Moderate (60-75°F)',
    'Warm (75-85°F)',
    'Hot (85-95°F)',
    'Very hot (95°F+)',
    'Humid conditions',
    'High altitude',
    'Windy conditions',
    'Variable weather'
  ]
};

const SWIMMING_COURSE_OPTIONS = {
  waterConditions: [
    'Calm water',
    'Light chop',
    'Moderate waves',
    'Strong currents',
    'Cold water',
    'Warm water',
    'Variable conditions'
  ]
};

const FOCUS_OPTIONS = [
  { key: 'run', label: <><FaRunning className="inline mr-2" />Run</> },
  { key: 'ride', label: <><FaBiking className="inline mr-2" />Ride</> },
  { key: 'triathlon', label: <><FaMedal className="inline mr-2" />Triathlon</> },
  { key: 'strength', label: <><FaDumbbell className="inline mr-2" />Strength</> },
  { key: 'mobility', label: <><FaObjectGroup className="inline mr-2" />Mobility</> },
  { key: 'swim', label: <><FaSwimmer className="inline mr-2" />Swim</> },
  { key: 'hybrid', label: <><FaCog className="inline mr-2" />Hybrid</> },
];

const SURFACE_TYPE_OPTIONS = [
  'Road',
  'Gravel',
  'Dirt',
  'Mixed'
];

const CLIMATE_OPTIONS = [
  'Cool (under 60°F)',
  'Moderate (60-75°F)',
  'Warm (75-85°F)',
  'Hot (85-95°F)',
  'Very hot (95°F+)',
  'Humid conditions',
  'High altitude'
];

export default function AIPlanBuilder() {
  const { loadUserBaselines } = useAppContext();
  const [baselines, setBaselines] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [realAI] = useState(() => new RealTrainingAI());
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  
  // Debug effect to track generatedPlan changes
  useEffect(() => {
    console.log('🎯 generatedPlan state changed:', generatedPlan);
  }, [generatedPlan]);
  
  // Auto-trigger plan generation when reaching step 8
  useEffect(() => {
    if (step === 8 && !generatedPlan && !generatingPlan) {
      console.log('🎯 Auto-triggering plan generation...');
      generatePlan();
    }
  }, [step, generatedPlan, generatingPlan]);
  
  const [currentWeek, setCurrentWeek] = useState(0); // Track current week being viewed
  
  // Assessment responses
  const [responses, setResponses] = useState({
    // Question 1: Distance & Timeline
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

    // Question 7: Goals
    goals: [] as string[],
  });

  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);

  const toggleFocus = (focus: string) => {
    setSelectedFocus((prev) =>
      prev.includes(focus) ? prev.filter((f) => f !== focus) : [...prev, focus]
    );
  };

  useEffect(() => {
    const loadBaselines = async () => {
      const userBaselines = await loadUserBaselines();
      setBaselines(userBaselines);
    };
    loadBaselines();
  }, [loadUserBaselines]);

  const updateResponse = (key: string, value: any) => {
    setResponses(prev => ({ ...prev, [key]: value }));
  };

  const calculateTimeline = (eventDate: string): number => {
    if (!eventDate) return 0;
    const event = new Date(eventDate);
    const today = new Date();
    return Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7));
  };

  const getEventType = (distance: string): string => {
    switch (distance) {
      case 'ironman':
        return 'Ironman';
      case '70.3':
        return '70.3';
      case 'olympic':
        return 'Olympic';
      case 'sprint':
        return 'Sprint';
      default:
        return 'Unknown';
    }
  };

  const isAggressiveTimeline = () => {
    const { distance, timeline } = responses;
    if (distance === '70.3' && timeline === '8-12-weeks') return true;
    if (distance === 'ironman' && timeline === '16-20-weeks') return true;
    return false;
  };

  // Baseline-based validation and recommendations
  const getBaselineInsights = () => {
    if (!baselines) return null;

    try {
      const currentVolume = baselines.current_volume || {};
      const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
        // Parse volume strings like "2-4 hours" to get the average
        const volumeStr = vol as string;
        if (!volumeStr) return sum;
        
        // Handle different volume formats
        if (volumeStr.includes('-')) {
          // "2-4 hours" format - take the average
          const parts = volumeStr.split('-');
          const low = parseInt(parts[0]) || 0;
          const high = parseInt(parts[1]) || 0;
          return sum + ((low + high) / 2);
        } else if (volumeStr.includes('+')) {
          // "8+ hours" format - take the minimum
          const num = parseInt(volumeStr) || 0;
          return sum + num;
        } else {
          // Single number format
          return sum + (parseInt(volumeStr) || 0);
        }
      }, 0);

      const trainingFrequency = baselines.training_frequency || {};
      const volumeIncreaseCapacity = baselines.volume_increase_capacity || {};
      const disciplineFitness = baselines.disciplineFitness || {};
      const performanceNumbers = baselines.performanceNumbers || {};

      return {
        totalHours: totalHours as number,
        currentVolume,
        trainingFrequency,
        volumeIncreaseCapacity,
        disciplineFitness,
        performanceNumbers,
        trainingBackground: baselines.trainingBackground,
        age: baselines.age as number,
        injuryHistory: baselines.injuryHistory,
        equipment: baselines.equipment || {}
      };
    } catch (error) {
      console.error('Error in getBaselineInsights:', error);
      return null;
    }
  };

  const validateTimeline = (distance: string, timeline: string) => {
    const insights = getBaselineInsights();
    if (!insights) return { isValid: true, warning: null };

    const { totalHours, trainingBackground, age } = insights;

    // 70.3 validation
    if (distance === '70.3') {
      if (timeline === '8-12-weeks') {
        if (totalHours < 6) {
          return {
            isValid: false,
            warning: `You're currently training ${totalHours} hours/week. For a 70.3 in 8-12 weeks, you need at least 6+ hours/week. Consider a longer timeline or building your base first.`
          };
        }
        if (trainingBackground?.includes('new')) {
          return {
            isValid: false,
            warning: `You're new to structured training. A 70.3 in 8-12 weeks is very aggressive. Consider 16+ weeks for your first 70.3.`
          };
        }
      }
      if (timeline === '16-20-weeks' && totalHours < 4) {
        return {
          isValid: true,
          warning: `You're currently training ${totalHours} hours/week. You'll need to build to 6-8 hours/week for a 70.3. This timeline is achievable but will require significant volume increases.`
        };
      }
    }

    // Ironman validation
    if (distance === 'ironman') {
      if (timeline === '16-20-weeks') {
        if (totalHours < 8) {
          return {
            isValid: false,
            warning: `You're currently training ${totalHours} hours/week. For an Ironman in 16-20 weeks, you need at least 8+ hours/week. Consider a longer timeline.`
          };
        }
      }
      if (timeline === '24-plus-weeks' && totalHours < 6) {
        return {
          isValid: true,
          warning: `You're currently training ${totalHours} hours/week. You'll need to build to 10-15 hours/week for an Ironman. This timeline is achievable but will require significant volume increases.`
        };
      }
    }

    // Age considerations
    if (age && age >= 40 && timeline === '8-12-weeks') {
      return {
        isValid: true,
        warning: `At ${age} years old, consider a longer timeline for better recovery and injury prevention.`
      };
    }

    return { isValid: true, warning: null };
  };

  const getRecommendedTimeline = (distance: string) => {
    const insights = getBaselineInsights();
    if (!insights) return null;

    const { totalHours, trainingBackground, age } = insights;

    if (distance === '70.3') {
      if (totalHours >= 8 && trainingBackground?.includes('consistent')) return '8-12-weeks';
      if (totalHours >= 6) return '16-20-weeks';
      if (totalHours >= 4) return '24-plus-weeks';
      return '24-plus-weeks'; // Need to build base
    }

    if (distance === 'ironman') {
      if (totalHours >= 12 && trainingBackground?.includes('consistent')) return '16-20-weeks';
      if (totalHours >= 8) return '24-plus-weeks';
      return '24-plus-weeks'; // Need to build base
    }

    return null;
  };

  const getRecommendedFrequency = () => {
    const insights = getBaselineInsights();
    if (!insights) return null;

    const { totalHours, trainingFrequency, volumeIncreaseCapacity } = insights;
    const distance = responses.distance;

    // Check if they can handle more frequency
    const canIncrease = volumeIncreaseCapacity?.triathlon?.includes('easily') || 
                       volumeIncreaseCapacity?.triathlon?.includes('careful');

    // Race-distance specific recommendations
    if (distance === 'ironman') {
      if (totalHours >= 12) return '6-days';
      if (totalHours >= 8 && canIncrease) return '6-days';
      if (totalHours >= 6) return '5-days';
      return '4-days';
    }

    if (distance === '70.3') {
      if (totalHours >= 8) return '6-days';
      if (totalHours >= 6 && canIncrease) return '6-days';
      if (totalHours >= 4) return '5-days';
      return '4-days';
    }

    if (distance === 'olympic') {
      if (totalHours >= 6) return '5-days';
      if (totalHours >= 4) return '4-days';
      return '3-days';
    }

    if (distance === 'sprint') {
      if (totalHours >= 4) return '4-days';
      return '3-days';
    }

    // Default fallback
    if (totalHours >= 8) return '6-days';
    if (totalHours >= 6 && canIncrease) return '6-days';
    if (totalHours >= 4) return '5-days';
    return '4-days';
  };

  const getRecommendedStrength = () => {
    const insights = getBaselineInsights();
    if (!insights) return null;

    const { injuryHistory, age, performanceNumbers } = insights;

    // Always recommend injury prevention for 40+
    if (age >= 40) return 'injury-prevention';

    // Recommend injury prevention if they have injury history
    if (injuryHistory?.includes('injury')) return 'injury-prevention';

    // If they have strength numbers, they can do more advanced strength
    if (performanceNumbers.squat && performanceNumbers.deadlift) return 'power-development';

    return 'injury-prevention'; // Default to safest option
  };

  const prePopulateFromBaselines = () => {
    const insights = getBaselineInsights();
    if (!insights) return;

    const { performanceNumbers, equipment, trainingFrequency } = insights;

    // Pre-populate strength numbers if available
    if (performanceNumbers.squat && !responses.squat1RM) {
      updateResponse('squat1RM', performanceNumbers.squat.toString());
    }
    if (performanceNumbers.deadlift && !responses.deadlift1RM) {
      updateResponse('deadlift1RM', performanceNumbers.deadlift.toString());
    }
    if (performanceNumbers.bench && !responses.bench1RM) {
      updateResponse('bench1RM', performanceNumbers.bench.toString());
    }

    // Pre-populate equipment access
    if (equipment.strength && equipment.strength.length > 0) {
      updateResponse('equipmentAccess', equipment.strength);
    }

    // Pre-populate training frequency if available
    if (trainingFrequency.triathlon && !responses.trainingFrequency) {
      const freq = trainingFrequency.triathlon;
      if (freq.includes('5-6')) updateResponse('trainingFrequency', '6-days');
      else if (freq.includes('3-4')) updateResponse('trainingFrequency', '4-days');
      else if (freq.includes('7')) updateResponse('trainingFrequency', '7-days');
    }
  };

  // Run pre-population when baselines load
  useEffect(() => {
    if (baselines) {
      prePopulateFromBaselines();
    }
  }, [baselines]);

  // Build comprehensive prompt from responses
  const buildPlanPrompt = () => {
    const insights = getBaselineInsights();
    
    // Build structured user data instead of massive prompt
    const userData = {
      // Assessment responses
      distance: responses.distance,
      trainingPhilosophy: responses.trainingPhilosophy,
      goals: responses.goals,
      strengthTraining: responses.strengthTraining,
      trainingFrequency: responses.trainingFrequency,
      weekendAvailability: responses.weekendAvailability,
      longSessionPreference: responses.longSessionPreference,
      eventDate: responses.eventDate,
      
      // Event details
      hasSpecificEvent: responses.hasSpecificEvent,
      raceName: responses.raceName,
      courseProfile: responses.courseProfile,
      climate: responses.climate,
      runningElevationGain: responses.runningElevationGain,
      runningCourseProfile: responses.runningCourseProfile,
      cyclingElevationGain: responses.cyclingElevationGain,
      cyclingCourseProfile: responses.cyclingCourseProfile,
      waterConditions: responses.waterConditions,
      
      // Baseline data
      baseline: insights ? {
        age: insights.age,
        totalHours: insights.totalHours,
        injuryHistory: insights.injuryHistory,
        performanceNumbers: insights.performanceNumbers,
        equipment: insights.equipment,
        disciplineFitness: insights.disciplineFitness
      } : null
    };
    
    // Simple, clear prompt that references the structured data
    const prompt = `Create a personalized training plan using the provided user data.

User has selected: ${userData.distance} distance, ${userData.trainingPhilosophy} training philosophy.

Generate a 4-week plan with 7 days per week, using their specific baseline data and preferences.

Return a valid JSON plan structure.`;
    
    return { prompt, userData };
  };

  // Comprehensive validation - NO FALLBACKS
  const validateAssessment = () => {
    console.log('🔍 VALIDATING ASSESSMENT DATA...');
    console.log('📊 Baselines:', baselines);
    console.log('📝 Responses:', responses);
    
    // 1. ASSESSMENT RESPONSES VALIDATION
    const requiredAssessmentFields = [
      'distance',
      'timeline', 
      'trainingPhilosophy',
      'trainingFrequency',
      'strengthTraining'
    ];
    
    const missingAssessmentFields = requiredAssessmentFields.filter(field => !responses[field]);
    
    if (missingAssessmentFields.length > 0) {
      throw new Error(`❌ ASSESSMENT INCOMPLETE: Please complete these questions: ${missingAssessmentFields.join(', ')}`);
    }
    
    // 2. BASELINE DATA VALIDATION
    if (!baselines) {
      throw new Error('❌ NO BASELINE DATA: Please complete your training baselines first.');
    }
    
    if (!baselines.performanceNumbers) {
      throw new Error('❌ NO PERFORMANCE DATA: Please add your performance numbers in training baselines.');
    }
    
    // 3. DISCIPLINE-SPECIFIC VALIDATION
    const missingBaselineFields: string[] = [];
    const disciplines = baselines.disciplines || [];
    const performanceNumbers = baselines.performanceNumbers;
    
    // Cycling validation
    if (disciplines.includes('cycling') && !performanceNumbers.ftp) {
      missingBaselineFields.push('FTP (Functional Threshold Power)');
    }
    
    // Running validation
    if (disciplines.includes('running')) {
      if (!performanceNumbers.fiveK) missingBaselineFields.push('5K pace');
      if (!performanceNumbers.easyPace) missingBaselineFields.push('Easy pace');
    }
    
    // Swimming validation
    if (disciplines.includes('swimming') && !performanceNumbers.swimPace100) {
      missingBaselineFields.push('Swim pace (100m)');
    }
    
    // Strength validation
    if (disciplines.includes('strength') || responses.strengthTraining !== 'no-strength') {
      if (!performanceNumbers.squat) missingBaselineFields.push('Squat 1RM');
      if (!performanceNumbers.bench) missingBaselineFields.push('Bench 1RM');
      if (!performanceNumbers.deadlift) missingBaselineFields.push('Deadlift 1RM');
    }
    
    // Age validation
    if (!baselines.age && !baselines.birthday) {
      missingBaselineFields.push('Age or birthday');
    }
    
    // Equipment validation
    if (disciplines.includes('strength') && (!baselines.equipment?.strength || baselines.equipment.strength.length === 0)) {
      missingBaselineFields.push('Strength equipment');
    }
    
    // Injury history validation
    if (!baselines.injuryHistory) {
      missingBaselineFields.push('Injury history');
    }
    
    if (missingBaselineFields.length > 0) {
      throw new Error(`❌ MISSING BASELINE DATA: Please add these in training baselines: ${missingBaselineFields.join(', ')}`);
    }
    
    console.log('✅ ALL VALIDATION PASSED - Ready for AI plan generation');
    return true;
  };

  // Generate plan using AI analysis + PlanEngine
  const generatePlan = async () => {
    try {
      // Validate assessment completion first
      validateAssessment();
      
      setGeneratingPlan(true);
      
      console.log('🧠 Starting AI analysis of user profile...');
      console.log('📊 Baselines:', baselines);
      console.log('📝 Responses:', responses);
      
      // Step 1: AI Analysis - analyze user profile to get training parameters
      const aiAnalysis = await realAI.analyzeUserProfile(baselines, responses);
      console.log('✅ AI analysis completed:', aiAnalysis);
      
      if (!aiAnalysis) {
        console.error('❌ AI analysis returned null/undefined!');
        throw new Error('AI analysis failed - returned null');
      }
      
      // Step 2: AI Plan Generation - use Edge Function to generate unique plan
      const { prompt, userData } = buildPlanPrompt();
      const startDate = new Date().toISOString().split('T')[0];
      const userContext = {
        ...userData,
        baselines,
        responses,
        aiAnalysis,
        selectedFocus
      };
      
      console.log('🤖 Calling AI Edge Function for plan generation...');
      const aiPlan = await realAI.generateTrainingPlan(prompt, startDate, userContext);
      
      console.log('✅ AI plan generated via Edge Function:', aiPlan);
      
      // Create plan object with AI-generated structure
      const plan = {
        id: `plan-${Date.now()}`,
        name: aiPlan.plan.name,
        description: aiPlan.plan.description,
        focus: selectedFocus.join(', '),
        plan: aiPlan.plan,
        fullPlan: aiPlan,
        aiAnalysis: aiAnalysis,
        workouts: aiPlan.workouts
      };
      
      console.log('🎯 About to set generatedPlan with:', plan);
      setGeneratedPlan(plan);
      console.log('🎯 setGeneratedPlan called - plan should now be set');
      setCurrentWeek(0); // Reset to first week
      
      // Advance to step 8 to show the plan
      console.log('🎯 Advancing to step 8 to show the plan...');
      setStep(8);
      
    } catch (error) {
      console.error('❌ Error generating plan:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      // NO FALLBACKS - Show the actual error to user with detailed information
      const errorDetails = {
        id: 'error',
        name: 'Plan Generation Failed',
        description: `❌ ${error.message}`,
        focus: 'Error',
        plan: null,
        fullPlan: null,
        aiAnalysis: null,
        workouts: [],
        error: error.message,
        debugInfo: {
          baselines: baselines ? 'Present' : 'Missing',
          responses: responses,
          missingFields: error.message.includes('Missing') ? error.message : null
        }
      };
      
      console.log('❌ PLAN GENERATION FAILED:', errorDetails);
      setGeneratedPlan(errorDetails);
    } finally {
      setGeneratingPlan(false);
    }
  };

  // NO AUTO-GENERATION - User must explicitly click "Generate Plan"
  // Removed auto-generation to prevent empty assessment data from reaching AI

  const getCurrentStepContent = () => {
    const insights = getBaselineInsights();
    const timelineValidation = responses.distance && responses.timeline ? 
      validateTimeline(responses.distance, responses.timeline) : null;
    const recommendedTimeline = responses.distance ? 
      getRecommendedTimeline(responses.distance) : null;
    const recommendedFrequency = getRecommendedFrequency();
    const recommendedStrength = getRecommendedStrength();

    switch (step) {
      case 0:
        // Focus selection screen
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What is your focus?</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {FOCUS_OPTIONS.filter(opt => opt.key !== 'hybrid').map((option) => (
                <button
                  key={option.key}
                  onClick={() => toggleFocus(option.key)}
                  className={`w-full p-3 text-center transition-colors ${
                    selectedFocus.includes(option.key)
                      ? 'bg-gray-200 text-black'
                      : 'bg-transparent text-black hover:bg-gray-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex justify-center mb-6">
              <button
                onClick={() => toggleFocus('hybrid')}
                className={`w-full p-3 text-center transition-colors ${
                  selectedFocus.includes('hybrid')
                    ? 'bg-gray-200 text-black'
                    : 'bg-transparent text-black hover:bg-gray-100'
                }`}
              >
                Hybrid
              </button>
            </div>
            <button
                              className="w-full bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
              disabled={selectedFocus.length === 0}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          </div>
        );

      case 1:
        // Discipline-specific questions (example: triathlon)
        if (selectedFocus.includes('triathlon')) {
          return (
            <div>
              <div className="mb-4 text-gray-800 font-medium">Are you training for a specific race?</div>
              
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => updateResponse('hasSpecificEvent', 'yes')}
                  className={`w-full p-3 text-left transition-colors ${
                    responses.hasSpecificEvent === 'yes'
                      ? 'bg-gray-200 text-black'
                      : 'bg-transparent text-black hover:bg-gray-100'
                  }`}
                >
                  Yes - specific event
                </button>
                <button
                  onClick={() => updateResponse('hasSpecificEvent', 'no')}
                  className={`w-full p-3 text-left transition-colors ${
                    responses.hasSpecificEvent === 'no'
                      ? 'bg-gray-200 text-black'
                      : 'bg-transparent text-black hover:bg-gray-100'
                  }`}
                >
                  No - general triathlon fitness
                </button>
              </div>

              {responses.hasSpecificEvent === 'yes' && (
                <div className="mb-6 space-y-6">
                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Race name:</label>
                    <input
                      type="text"
                      value={responses.raceName}
                      onChange={(e) => updateResponse('raceName', e.target.value)}
                      className="w-full p-3"
                      placeholder="e.g., Ironman 70.3 World Championship"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Event date:</label>
                    <input
                      type="date"
                      value={responses.eventDate}
                      onChange={(e) => {
                        const eventDate = e.target.value;
                        updateResponse('eventDate', eventDate);
                        
                        // Auto-calculate and save timeline
                        if (eventDate) {
                          const weeks = calculateTimeline(eventDate);
                          updateResponse('timeline', `${weeks} weeks`);
                        } else {
                          // Clear timeline if event date is removed
                          updateResponse('timeline', '');
                        }
                      }}
                      className="w-full p-3"
                      min={new Date().toISOString().split('T')[0]}
                    />
                    {responses.eventDate && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-800">
                          📅 {calculateTimeline(responses.eventDate)} weeks until your event
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-2">Race distance:</label>
                    <select
                      value={responses.distance}
                      onChange={(e) => updateResponse('distance', e.target.value)}
                      className="w-full p-3"
                    >
                      <option value="">Select race distance</option>
                      {TRIATHLON_DISTANCES.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                      ))}
                    </select>
                    {responses.distance && (
                      <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                        <p className="text-sm text-green-800">
                          🏁 Event Type: {getEventType(responses.distance)}
                        </p>
                      </div>
                    )}
                  </div>



                  {/* Swimming Course Details */}
                  <div className="pt-4">
                    <h4 className="font-medium text-gray-800 mb-3"><FaSwimmer className="inline mr-2" /> Swimming Course</h4>
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Water conditions:</label>
                      <select
                        value={responses.waterConditions}
                        onChange={(e) => updateResponse('waterConditions', e.target.value)}
                        className="w-full p-3"
                      >
                        <option value="">Select water conditions</option>
                        {SWIMMING_COURSE_OPTIONS.waterConditions.map((option, index) => (
                          <option key={index} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Cycling Course Details */}
                  <div className="pt-4">
                    <h4 className="font-medium text-gray-800 mb-3"><FaBiking className="inline mr-2" /> Cycling Course</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Elevation gain:</label>
                        <select
                          value={responses.cyclingElevationGain}
                          onChange={(e) => updateResponse('cyclingElevationGain', e.target.value)}
                          className="w-full p-3"
                        >
                          <option value="">Select elevation gain</option>
                          {CYCLING_COURSE_OPTIONS.elevationGain.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Course profile:</label>
                        <select
                          value={responses.cyclingCourseProfile}
                          onChange={(e) => updateResponse('cyclingCourseProfile', e.target.value)}
                          className="w-full p-3"
                        >
                          <option value="">Select course profile</option>
                          {CYCLING_COURSE_OPTIONS.courseProfile.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Running Course Details */}
                  <div className="pt-4">
                    <h4 className="font-medium text-gray-800 mb-3"><FaRunning className="inline mr-2" /> Running Course</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Elevation gain:</label>
                        <select
                          value={responses.runningElevationGain}
                          onChange={(e) => updateResponse('runningElevationGain', e.target.value)}
                          className="w-full p-3"
                        >
                          <option value="">Select elevation gain</option>
                          {RUNNING_COURSE_OPTIONS.elevationGain.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Course profile:</label>
                        <select
                          value={responses.runningCourseProfile}
                          onChange={(e) => updateResponse('runningCourseProfile', e.target.value)}
                          className="w-full p-3"
                        >
                          <option value="">Select course profile</option>
                          {RUNNING_COURSE_OPTIONS.courseProfile.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>



                  {/* Climate */}
                  <div className="pt-4">
                    <h4 className="font-medium text-gray-800 mb-3">Climate</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Climate:</label>
                        <select
                          value={responses.climate}
                          onChange={e => updateResponse('climate', e.target.value)}
                          className="w-full p-3"
                        >
                          <option value="">Select climate</option>
                          {CLIMATE_OPTIONS.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {responses.hasSpecificEvent === 'no' && (
                <div className="mb-6 space-y-4">
                  <div>
                    <div className="text-sm text-gray-600 mb-3">What's your main focus for general triathlon fitness?</div>
                    <div className="space-y-2">
                      {GENERAL_FITNESS_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => updateResponse('generalFitnessFocus', option.key)}
                          className={`w-full p-3 text-left transition-colors ${
                            responses.generalFitnessFocus === option.key
                              ? 'bg-gray-200 text-black'
                              : 'bg-transparent text-black hover:bg-gray-100'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-gray-600 mb-3">What discipline needs the most work?</div>
                    {insights && (
                      <div className="mb-3 p-2 bg-blue-100 text-blue-800 text-sm">
                        <strong>Based on your baseline:</strong> 
                        {insights.disciplineFitness.swimming === 'beginner' && <><FaSwimmer className="inline mr-2" /> Swimming appears to be your weakest discipline.</>}
                        {insights.disciplineFitness.cycling === 'beginner' && <><FaBiking className="inline mr-2" /> Cycling appears to be your weakest discipline.</>}
                        {insights.disciplineFitness.running === 'beginner' && <><FaRunning className="inline mr-2" /> Running appears to be your weakest discipline.</>}
                      </div>
                    )}
                    <div className="space-y-2">
                      {DISCIPLINE_WEAKNESS_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => updateResponse('limitingDiscipline', option.key)}
                          className={`w-full p-3 text-left transition-colors ${
                            responses.limitingDiscipline === option.key
                              ? 'bg-gray-200 text-black'
                              : 'bg-transparent text-black hover:bg-gray-100'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                  onClick={() => setStep(0)}
                >
                  Back
                </button>
                <button
                  className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                  disabled={!responses.hasSpecificEvent}
                  onClick={() => setStep(2)}
                >
                  Next
                </button>
              </div>
            </div>
          );
        }
        // Add similar blocks for run, ride, strength, etc.
        // For strength, skip/pre-fill questions already in baselines
        if (selectedFocus.includes('strength')) {
          // Example: Only ask for 1RM if not in baselines
          const { performanceNumbers, equipment } = insights || {};
          return (
            <div>
              <div className="mb-4 text-gray-800 font-medium">Strength Assessment</div>
              {!performanceNumbers?.squat && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-600 mb-2">Squat 1RM (lbs):</label>
                  <input
                    type="number"
                    value={responses.squat1RM}
                    onChange={(e) => updateResponse('squat1RM', e.target.value)}
                    className="w-full p-3"
                  />
                </div>
              )}
              {performanceNumbers?.squat && (
                <div className="mb-4 text-green-700">Squat 1RM on file: {performanceNumbers.squat} lbs</div>
              )}
              {/* Repeat for deadlift, bench, equipment, etc. */}
              {/* ... */}
              <button
                className="w-full bg-gray-800 text-white py-2 font-medium mt-4"
                onClick={() => setStep(5)}
              >
                Next
              </button>
            </div>
          );
        }
        // ... handle other disciplines ...
        return null;

      case 2:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What are your primary goals for this training plan?</div>
            <div className="text-sm text-gray-600 mb-4">Select up to 3 goals that matter most to you</div>
            
            <div className="space-y-3 mb-6">
              {GOAL_OPTIONS.map((option) => {
                const isSelected = responses.goals.includes(option.key);
                return (
                  <button
                    key={option.key}
                    onClick={() => {
                      const newGoals = isSelected 
                        ? responses.goals.filter(g => g !== option.key)
                        : responses.goals.length < 3 
                          ? [...responses.goals, option.key]
                          : responses.goals;
                      updateResponse('goals', newGoals);
                    }}
                    className={`w-full p-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-gray-200 text-black'
                        : 'bg-transparent text-black hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-gray-600">{option.description}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={responses.goals.length === 0}
                onClick={() => setStep(3)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">Do you want to add strength training to your triathlon plan?</div>
            
            {insights && recommendedStrength && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> 
                  {insights.age >= 40 && ' At your age, injury prevention is recommended.'}
                  {insights.injuryHistory?.includes('injury') && ' Given your injury history, injury prevention is recommended.'}
                  {insights.performanceNumbers.squat && ' You have strength numbers, so power development is an option.'}
                  <div className="mt-1">Recommended: {STRENGTH_OPTIONS.find(s => s.key === recommendedStrength)?.label}</div>
                </div>
              </div>
            )}
            
            <div className="space-y-3 mb-6">
              {STRENGTH_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => updateResponse('strengthTraining', option.key)}
                  className={`w-full p-3 text-left transition-colors ${
                    responses.strengthTraining === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-transparent text-black hover:bg-gray-100'
                  }`}
                >
                  {option.label}
                  {option.key === recommendedStrength && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1">Recommended</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.strengthTraining}
                onClick={() => setStep(4)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">What's your weekend availability?</div>
              <div className="text-sm text-gray-600 mb-4">This helps us schedule your long training sessions</div>
              
              <div className="space-y-3 mb-6">
                {WEEKEND_AVAILABILITY_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('weekendAvailability', option.key)}
                    className={`w-full p-3 text-left transition-colors ${
                      responses.weekendAvailability === option.key
                        ? 'bg-gray-200 text-black'
                        : 'bg-transparent text-black hover:bg-gray-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

            {responses.weekendAvailability && responses.weekendAvailability !== 'optimize' && (
              <div className="mb-6">
                <div className="mb-4 text-gray-800 font-medium">Long session preferences:</div>
                <div className="text-sm text-gray-600 mb-4">When would you prefer to do your long runs and rides?</div>
                
                <div className="space-y-3 mb-6">
                  {LONG_SESSION_PREFERENCES.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => updateResponse('longSessionPreference', option.key)}
                      className={`w-full p-3 text-left transition-colors ${
                        responses.longSessionPreference === option.key
                          ? 'bg-gray-200 text-black'
                          : 'bg-transparent text-black hover:bg-gray-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.weekendAvailability || (responses.weekendAvailability !== 'optimize' && !responses.longSessionPreference)}
                onClick={() => setStep(5)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 5:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">How many days per week can you train?</div>
            <div className="text-sm text-gray-600 mb-4">
              {responses.distance === 'ironman' && 'Most Ironman athletes train 6 days per week'}
              {responses.distance === '70.3' && 'Most 70.3 athletes train 5-6 days per week'}
              {responses.distance === 'olympic' && 'Most Olympic athletes train 4-5 days per week'}
              {responses.distance === 'sprint' && 'Most Sprint athletes train 3-4 days per week'}
              {!responses.distance && 'Training frequency varies by race distance and current fitness'}
            </div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> You currently train {insights.trainingFrequency.triathlon || 'unknown frequency'}.
                  {recommendedFrequency && (
                    <div className="mt-1">Recommended: {TRAINING_FREQUENCY_OPTIONS.find(f => f.key === recommendedFrequency)?.label}</div>
                  )}
                </div>
              </div>
            )}
            
            <div className="space-y-3 mb-6">
              {TRAINING_FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => updateResponse('trainingFrequency', option.key)}
                  className={`w-full p-3 text-left transition-colors ${
                    responses.trainingFrequency === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-transparent text-black hover:bg-gray-100'
                  }`}
                >
                  {option.label}
                  {option.key === recommendedFrequency && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1">Recommended</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(4)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.trainingFrequency}
                onClick={() => setStep(6)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 6:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">How much time do you have for training sessions?</div>
            <div className="text-sm text-gray-600 mb-4">Long sessions (longer rides and runs) important for endurance</div>
            
            {insights && insights.totalHours !== undefined && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> You currently train {insights.totalHours} hours/week.
                  {insights.totalHours < 6 && ' Consider longer sessions to build endurance.'}
                  {insights.totalHours >= 8 && ' Elite level volume - use Zone 3-4 for long sessions, Zone 4-5 for intervals.'}
                </div>
              </div>
            )}
            
            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Focused training sessions (weekdays):</div>
              <div className="space-y-2 mb-4">
                {WEEKDAY_DURATION_OPTIONS && WEEKDAY_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('weekdayDuration', option.key)}
                    className={`w-full p-3 text-left transition-colors ${
                      responses.weekdayDuration === option.key
                        ? 'bg-gray-200 text-black'
                        : 'bg-transparent text-black hover:bg-gray-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Long sessions (longer rides and runs):</div>
              <div className="space-y-2">
                {WEEKEND_DURATION_OPTIONS && WEEKEND_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('weekendDuration', option.key)}
                    className={`w-full p-3 text-left transition-colors ${
                      responses.weekendDuration === option.key
                        ? 'bg-gray-200 text-black'
                        : 'bg-transparent text-black hover:bg-gray-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(5)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.weekdayDuration || !responses.weekendDuration}
                onClick={() => setStep(7)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 7:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">Choose your training approach:</div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> 
                  {insights.age >= 40 && ' At your age, sustainable training is recommended for injury prevention.'}
                  {insights.trainingBackground?.includes('new') && ' As a newer athlete, sustainable training will help build consistency.'}
                  {insights.trainingBackground?.includes('consistent') && ' With your consistent training history, you can handle more intensity.'}
                </div>
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              <div
                onClick={() => updateResponse('trainingPhilosophy', 'polarized')}
                className={`w-full p-4 cursor-pointer transition-colors border rounded-lg ${
                  responses.trainingPhilosophy === 'polarized'
                    ? 'bg-gray-200 border-gray-400'
                    : 'bg-transparent hover:bg-gray-50 border-gray-200'
                }`}
              >
                <div className="font-medium mb-2 flex items-center">
                  <FaRoad className="inline mr-2" />
                  POLARIZED (80% easy, 20% hard)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Based on Seiler & Tønnessen research. 80% of training at low intensity (Zone 1-2), 20% at high intensity (Zone 4-5), minimal moderate intensity.
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Endurance performance improvement, avoiding "junk miles"
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> Proven effective for endurance athletes, especially those with limited time
                </div>
              </div>

              <div
                onClick={() => updateResponse('trainingPhilosophy', 'pyramid')}
                className={`w-full p-4 cursor-pointer transition-colors border rounded-lg ${
                  responses.trainingPhilosophy === 'pyramid'
                    ? 'bg-gray-200 border-gray-400'
                    : 'bg-transparent hover:bg-gray-50 border-gray-200'
                }`}
              >
                <div className="font-medium mb-2 flex items-center">
                  <FaChartArea className="inline mr-2" />
                  PYRAMIDAL (weekly intensity progression)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Weekly intensity progression: easy → moderate → hard → moderate → easy. Builds intensity tolerance throughout the week.
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Building intensity tolerance, structured progression
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> Prevents overtraining with structured progression, good for beginners
                </div>
              </div>

              <div
                onClick={() => updateResponse('trainingPhilosophy', 'threshold')}
                className={`w-full p-4 cursor-pointer transition-colors border rounded-lg ${
                  responses.trainingPhilosophy === 'threshold'
                    ? 'bg-gray-200 border-gray-400'
                    : 'bg-transparent hover:bg-gray-50 border-gray-200'
                }`}
              >
                <div className="font-medium mb-2 flex items-center">
                  <FaBalanceScale className="inline mr-2" />
                  THRESHOLD (40% moderate, 40% easy, 20% hard)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Based on Coggan & Allen research. 40% moderate intensity (Zone 3), 40% easy (Zone 2), 20% hard (Zone 4-5).
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Time trial performance, sustained power improvement
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> Focuses on lactate threshold improvement, great for cyclists and time trialists
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 text-gray-800 py-2 font-medium"
                onClick={() => setStep(6)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.trainingPhilosophy}
                onClick={generatePlan}
              >
                Generate Plan
              </button>
              
              {/* Validation Status */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-800 mb-2">Data Requirements:</div>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>✅ Training Philosophy: {responses.trainingPhilosophy || '❌ Missing'}</div>
                  <div>✅ Distance: {responses.distance || '❌ Missing'}</div>
                  <div>✅ Timeline: {responses.timeline || '❌ Missing'}</div>
                  <div>✅ Training Frequency: {responses.trainingFrequency || '❌ Missing'}</div>
                  <div>✅ Strength Training: {responses.strengthTraining || '❌ Missing'}</div>
                  <div>✅ Baseline Data: {baselines ? '✅ Complete' : '❌ Missing'}</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 8:
        console.log('🎯 STEP 8 - Current step:', step);
        console.log('🎯 generatedPlan state:', generatedPlan);
        console.log('🎯 generatingPlan state:', generatingPlan);
        
        if (generatingPlan) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mb-4"></div>
              <div className="text-gray-800 font-medium">Generating your training plan...</div>
              <div className="text-sm text-gray-600 mt-2">This may take a moment</div>
            </div>
          );
        }

        if (generatedPlan) {
          console.log('🎯 RENDERING PLAN - Step 8, generatedPlan exists:', generatedPlan);
          console.log('🎯 Plan structure:', JSON.stringify(generatedPlan, null, 2));
          console.log('🎯 About to render the plan UI...');
          return (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Your Training Plan</h2>
                <div className="text-sm text-gray-600">
                  {generatedPlan.plan?.phase || 'Personalized training plan based on your assessment'}
                </div>
              </div>

              {/* Phase Overview */}
              {generatedPlan.plan?.phase && (
                <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-lg">
                  <div className="font-medium mb-2">{generatedPlan.plan.phase}</div>
                  <div className="text-sm">
                    {generatedPlan.plan.phaseDescription || 'Progressive training plan building towards your race'}
                  </div>
                </div>
              )}

              {/* Plan Overview */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="font-medium mb-2">Your Training Plan</div>
                <div className="text-sm text-gray-600">
                  Personalized training plan based on your assessment
                </div>
                {generatedPlan.plan?.duration && (
                  <div className="text-sm text-gray-500 mt-1">
                    Duration: {generatedPlan.plan.duration} weeks
                  </div>
                )}
              </div>

              {/* Beautiful Plan Display */}
              <div className="space-y-6">
                {/* Plan Header */}
                <div className="mb-6">
                  <h1 className="text-2xl font-bold text-gray-800 mb-2">{generatedPlan.name}</h1>
                  <p className="text-gray-600 mb-4">{generatedPlan.description}</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="text-gray-700">
                      <span className="font-medium">Focus:</span> {generatedPlan.focus}
                    </div>
                    <div className="text-gray-700">
                      <span className="font-medium">Philosophy:</span> {generatedPlan.plan?.trainingPhilosophy}
                    </div>
                    <div className="text-gray-700">
                      <span className="font-medium">Duration:</span> {generatedPlan.plan?.duration} weeks
                    </div>
                    <div className="text-gray-700">
                      <span className="font-medium">Level:</span> {generatedPlan.plan?.level}
                    </div>
                  </div>
                </div>

                {/* AI Analysis Summary */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h2 className="text-lg font-semibold mb-4 text-gray-800">Training Analysis</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-800">{generatedPlan.aiAnalysis?.weeklyVolume || 0}</div>
                      <div className="text-sm text-gray-600">Weekly Hours</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-800">{generatedPlan.aiAnalysis?.intensityDistribution?.easy || 0}%</div>
                      <div className="text-sm text-gray-600">Easy</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-800">{generatedPlan.aiAnalysis?.intensityDistribution?.moderate || 0}%</div>
                      <div className="text-sm text-gray-600">Moderate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-800">{generatedPlan.aiAnalysis?.intensityDistribution?.hard || 0}%</div>
                      <div className="text-sm text-gray-600">Hard</div>
                    </div>
                  </div>
                </div>

                {/* Week Navigation */}
                {generatedPlan.fullPlan?.weeks && (
                  <div className="bg-white">
                    <div className="flex overflow-x-auto border-b border-gray-200">
                      {generatedPlan.fullPlan.weeks.map((week: any, weekIndex: number) => (
                        <button
                          key={weekIndex}
                          onClick={() => setCurrentWeek(weekIndex)}
                          className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                            weekIndex === currentWeek 
                              ? 'text-gray-900 border-gray-900' 
                              : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          Week {week.weekNumber}
                        </button>
                      ))}
                    </div>

                    {/* Current Week Workouts */}
                    {generatedPlan.fullPlan.weeks[currentWeek] && (
                      <div className="p-4">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-gray-800 mb-1">
                            Week {generatedPlan.fullPlan.weeks[currentWeek].weekNumber} - {generatedPlan.fullPlan.weeks[currentWeek].focus}
                          </h3>
                          <p className="text-sm text-gray-600">Phase: {generatedPlan.fullPlan.weeks[currentWeek].phase}</p>
                        </div>

                        <div className="space-y-3">
                          {generatedPlan.fullPlan.weeks[currentWeek].workouts?.map((workout: any, dayIndex: number) => (
                            <div key={dayIndex} className="border-b border-gray-100 pb-4">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-medium text-gray-900">
                                    {workout.day}: {workout.type}
                                  </h4>
                                  {workout.duration && (
                                    <div className="text-sm text-gray-600">{workout.duration}</div>
                                  )}
                                </div>
                              </div>

                              {/* Workout Details */}
                              <div className="space-y-2 text-sm">
                                {workout.warmup && (
                                  <div className="text-gray-700">
                                    <span className="font-medium">Warm-up:</span> {workout.warmup}
                                  </div>
                                )}
                                
                                {workout.main && (
                                  <div className="text-gray-700">
                                    <span className="font-medium">Main:</span> {workout.main}
                                  </div>
                                )}
                                
                                {workout.cooldown && (
                                  <div className="text-gray-700">
                                    <span className="font-medium">Cool-down:</span> {workout.cooldown}
                                  </div>
                                )}
                                
                                {workout.notes && (
                                  <div className="text-gray-600 italic">
                                    {workout.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>



              <div className="flex gap-3 mt-8">
                <button
                  className="flex-1 text-gray-800 py-2 font-medium"
                  onClick={() => setStep(7)}
                >
                  Back
                </button>
                <button
                  className="flex-1 bg-gray-800 text-white py-2 font-medium"
                  onClick={() => {
                    // TODO: Implement save plan functionality
                    console.log('Save plan:', generatedPlan);
                  }}
                >
                  Save Plan
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="text-center">
            <div className="mb-4 text-gray-800 font-medium">Plan generation failed</div>
            <div className="text-sm text-gray-600 mb-4">The service is temporarily unavailable. Please try again in a moment.</div>
            <button
              className="bg-gray-800 text-white py-2 px-4 font-medium"
              onClick={generatePlan}
            >
              Try Again
            </button>
          </div>
        );

      default:
        return <div>Something went wrong</div>;
    }
  };

  return (
    <div className="w-full min-h-screen px-2 pt-8">
      <h2 className="text-xl font-semibold mb-2">Create a Training Plan</h2>
      <div className="space-y-4">
        {getCurrentStepContent()}
      </div>
    </div>
  );
} 