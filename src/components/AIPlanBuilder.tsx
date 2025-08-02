import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';
// Import Font Awesome icons at the top
import { FaRunning, FaSwimmer, FaBiking, FaDumbbell, FaRoad, FaChartArea, FaTachometerAlt, FaMedal, FaObjectGroup, FaCog } from 'react-icons/fa';
import { RealTrainingAI } from '../services/RealTrainingAI';


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
  { key: 'power-development', label: 'Power development (explosive movements for endurance)' },
  { key: 'power-lifting', label: 'Endurance power (compound lifts for race performance)' },
  { key: 'injury-prevention', label: 'Injury prevention (mobility, stability for endurance)' },
  { key: 'sport-specific', label: 'Triathlon-specific (swim, bike, run movements)' },
  { key: 'build-muscle', label: 'Functional strength (endurance-focused, not bodybuilding)' },
  { key: 'general-fitness', label: 'Endurance conditioning (basic strength for racing)' },
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
  { key: 'pyramid', label: <><FaChartArea className="inline mr-2" />PYRAMIDAL (weekly intensity progression)</> },
  { key: 'polarized', label: <><FaRoad className="inline mr-2" />POLARIZED (80% easy, 20% hard)</> },
  { key: 'threshold', label: <><FaTachometerAlt className="inline mr-2" />THRESHOLD (40% moderate, 40% easy, 20% hard)</> },
];

const STRENGTH_FREQUENCY_OPTIONS = [
  { 
    key: '2x-week', 
    label: '2x/week minimum (standard triathlon integration)',
    explanation: 'One strength session every 3-4 days. Supports endurance without competing for time. Focus on injury prevention, core stability, and basic strength. 45-60 minutes per session.'
  },
  { 
    key: '3x-week', 
    label: '3x/week with double sessions (strength-focused approach)',
    explanation: 'Strength 3x/week, some days will have 2 workouts. More strength development and faster progress. Focus on power development, muscle building, and advanced movements. 45-60 minutes per session + double session days.'
  },
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

// Event-based training recommendations with smart gating
// Calculate weekly volume from user's duration preferences
const calculateVolumeFromResponses = (responses: any) => {
  if (!responses.trainingFrequency || !responses.weekdayDuration || !responses.weekendDuration) {
    throw new Error('Training frequency, weekday duration, and weekend duration are required to calculate volume.');
  }

  // Parse weekday duration
  let weekdayHours = 0;
  switch (responses.weekdayDuration) {
    case '30-45': weekdayHours = 0.625; break; // 37.5 minutes average
    case '45-60': weekdayHours = 0.875; break; // 52.5 minutes average
    case '60-90': weekdayHours = 1.25; break;  // 75 minutes average
    case '90-plus': weekdayHours = 1.5; break; // 90 minutes average
  }

  // Parse weekend duration
  let weekendHours = 0;
  switch (responses.weekendDuration) {
    case '1-2-hours': weekendHours = 1.5; break;  // 1.5 hours average
    case '2-3-hours': weekendHours = 2.5; break;  // 2.5 hours average
    case '3-4-hours': weekendHours = 3.5; break;  // 3.5 hours average
    case '4-plus-hours': weekendHours = 4.5; break; // 4.5 hours average
  }

  // Calculate weekday sessions based on training frequency
  let weekdaySessions = 0;
  switch (responses.trainingFrequency) {
    case '4-days': weekdaySessions = 3; break; // 3 weekdays + 1 weekend
    case '5-days': weekdaySessions = 3; break; // 3 weekdays + 2 weekends
    case '6-days': weekdaySessions = 4; break; // 4 weekdays + 2 weekends
    case '7-days': weekdaySessions = 5; break; // 5 weekdays + 2 weekends
  }

  // Calculate weekend sessions
  let weekendSessions = 0;
  switch (responses.trainingFrequency) {
    case '4-days': weekendSessions = 1; break;
    case '5-days': weekendSessions = 2; break;
    case '6-days': weekendSessions = 2; break;
    case '7-days': weekendSessions = 2; break;
  }

  const totalWeekday = weekdayHours * weekdaySessions;
  const totalWeekend = weekendHours * weekendSessions;
  const totalWeekly = totalWeekday + totalWeekend;

  return {
    weekly: `${totalWeekly.toFixed(1)} hours/week`,
    weekday: totalWeekday,
    weekend: totalWeekend,
    total: totalWeekly
  };
};

const getEventBasedRecommendations = (distance: string) => {
  switch (distance) {
    case 'sprint':
      return {
        frequency: {
          recommended: ['3-days', '4-days'],
          possible: ['3-days', '4-days', '5-days'],
          description: 'Sprint distance (750m swim, 20km bike, 5km run) - shorter, higher intensity',
          explanation: 'Sprint events are high-intensity and short duration (1-1.5 hours). Training focuses on speed, technique, and race-specific fitness rather than pure endurance. 3-4 days per week is optimal for quality over quantity.'
        },
        volume: {
          weekly: '4-6 hours',
          weekday: ['30-45', '45-60'],
          weekend: ['1-2-hours', '2-3-hours'],
          description: 'Focus on speed and technique over endurance',
          explanation: 'Sprint training emphasizes quality over quantity. Weekday sessions (30-60 minutes) focus on speed work and technique. Weekend sessions (1-3 hours) build race-specific endurance without overtraining.'
        },
        gating: {
          minDays: 3,
          maxDays: 5,
          minHours: 4,
          maxHours: 6,
          reason: 'Sprint events require focused, high-intensity training rather than high volume.'
        },
        explanation: 'Sprint triathlons are high-intensity events lasting 1-1.5 hours. Training focuses on speed, technique, and race-specific fitness rather than pure endurance. This approach maximizes performance while preventing overtraining.'
      };
    case 'olympic':
      return {
        frequency: {
          recommended: ['4-days', '5-days'],
          possible: ['4-days', '5-days', '6-days'],
          description: 'Olympic distance (1.5km swim, 40km bike, 10km run) - balanced endurance and speed',
          explanation: 'Olympic distance requires both endurance and speed over 2-3 hours. 4-5 days per week provides enough volume for endurance development while allowing adequate recovery for quality sessions.'
        },
        volume: {
          weekly: '6-10 hours',
          weekday: ['45-60', '60-90'],
          weekend: ['2-3-hours', '3-4-hours'],
          description: 'Balance endurance building with speed work',
          explanation: 'Olympic training balances endurance and speed. Weekday sessions (45-90 minutes) include both endurance and intensity work. Weekend sessions (2-4 hours) build aerobic capacity and race-specific endurance.'
        },
        gating: {
          minDays: 4,
          maxDays: 6,
          minHours: 6,
          maxHours: 10,
          reason: 'Olympic distance requires balanced endurance and speed development.'
        },
        explanation: 'Olympic distance (2-3 hours) requires both endurance and speed. Training balances longer aerobic sessions with high-intensity intervals. This approach develops the aerobic base needed for the duration while maintaining the speed required for performance.'
      };
    case '70.3':
      return {
        frequency: {
          recommended: ['5-days', '6-days'],
          possible: ['5-days', '6-days', '7-days'],
          description: '70.3 distance (1.9km swim, 90km bike, 21.1km run) - endurance focused',
          explanation: '70.3 events are primarily endurance challenges lasting 4-6 hours. 5-6 days per week provides the volume needed for endurance development while maintaining training quality.'
        },
        volume: {
          weekly: '8-12 hours',
          weekday: ['60-90', '90-plus'],
          weekend: ['3-4-hours', '4-plus-hours'],
          description: 'Emphasis on building endurance and bike/run volume',
          explanation: '70.3 training emphasizes endurance development. Weekday sessions (60+ minutes) build aerobic capacity and technique. Weekend sessions (3+ hours) develop the endurance needed for the long bike and run legs.'
        },
        gating: {
          minDays: 5,
          maxDays: 7,
          minHours: 8,
          maxHours: 12,
          reason: '70.3 distance requires significant endurance volume and consistent training.'
        },
        explanation: '70.3 distance (4-6 hours) is primarily an endurance event. Training emphasizes long aerobic sessions with strategic intensity work. This approach builds the aerobic capacity and muscular endurance needed to complete the distance efficiently.'
      };
    case 'ironman':
      return {
        frequency: {
          recommended: ['6-days', '7-days'],
          possible: ['6-days', '7-days'],
          description: 'Ironman distance (3.8km swim, 180km bike, 42.2km run) - maximum endurance',
          explanation: 'Ironman events are the ultimate endurance challenge lasting 8-17 hours. 6-7 days per week is required to build the volume and consistency needed for success.'
        },
        volume: {
          weekly: '12-18 hours',
          weekday: ['90-plus'],
          weekend: ['4-plus-hours'],
          description: 'Maximum endurance focus with long sessions',
          explanation: 'Ironman training requires maximum volume and endurance focus. Weekday sessions (90+ minutes) build aerobic capacity and technique. Weekend sessions (4+ hours) develop the extreme endurance needed for the long bike and marathon run.'
        },
        gating: {
          minDays: 6,
          maxDays: 7,
          minHours: 12,
          maxHours: 18,
          reason: 'Ironman distance requires maximum training volume and daily consistency.'
        },
        explanation: 'Ironman distance (8-17 hours) is the ultimate endurance challenge. Training requires high volume with careful recovery management. This approach builds the extreme aerobic capacity and muscular endurance needed to complete the full distance.'
      };
    default:
      return {
        frequency: {
          recommended: ['4-days', '5-days'],
          possible: ['3-days', '4-days', '5-days', '6-days', '7-days'],
          description: 'General triathlon training',
          explanation: 'Choose based on your experience and available time.'
        },
        volume: {
          weekly: '6-10 hours',
          weekday: ['45-60', '60-90'],
          weekend: ['2-3-hours', '3-4-hours'],
          description: 'Balanced approach',
          explanation: 'General triathlon training balances endurance and speed development.'
        },
        gating: {
          minDays: 3,
          maxDays: 7,
          minHours: 4,
          maxHours: 18,
          reason: 'General training allows flexibility based on experience and goals.'
        },
        explanation: 'Choose based on your experience and available time.'
      };
  }
};

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

    // Question 7: Strength Frequency
    strengthFrequency: '',

    // Question 8: Goals
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
        throw new Error(`Invalid distance: ${distance}. Must be one of: ironman, 70.3, olympic, sprint`);
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
    if (!baselines) {
      throw new Error('Baseline data is required to generate a plan. User must complete baseline assessment first.');
    }

    try {
      const currentVolume = baselines.current_volume;
      if (!currentVolume) {
        throw new Error('Current volume data is required from baselines.');
      }
      
      const totalHours = Object.values(currentVolume).reduce((sum: number, vol: any) => {
        // Parse volume strings like "2-4 hours" to get the average
        const volumeStr = vol as string;
        if (!volumeStr) {
          throw new Error('Volume data is incomplete. All disciplines must have volume information.');
        }
        
        // Handle different volume formats
        if (volumeStr.includes('-')) {
          // "2-4 hours" format - take the average
          const parts = volumeStr.split('-');
          const low = parseInt(parts[0]);
          const high = parseInt(parts[1]);
          if (isNaN(low) || isNaN(high)) {
            throw new Error(`Invalid volume format: ${volumeStr}. Expected format like "2-4 hours".`);
          }
          return sum + ((low + high) / 2);
        } else if (volumeStr.includes('+')) {
          // "8+ hours" format - take the minimum
          const num = parseInt(volumeStr);
          if (isNaN(num)) {
            throw new Error(`Invalid volume format: ${volumeStr}. Expected format like "8+ hours".`);
          }
          return sum + num;
        } else {
          // Single number format
          const num = parseInt(volumeStr);
          if (isNaN(num)) {
            throw new Error(`Invalid volume format: ${volumeStr}. Expected a number.`);
          }
          return sum + num;
        }
      }, 0);

      const trainingFrequency = baselines.training_frequency;
      const volumeIncreaseCapacity = baselines.volume_increase_capacity;
      const disciplineFitness = baselines.disciplineFitness;
      const performanceNumbers = baselines.performanceNumbers;
      
      if (!trainingFrequency || !volumeIncreaseCapacity || !disciplineFitness || !performanceNumbers) {
        throw new Error('Complete baseline data is required: training_frequency, volume_increase_capacity, disciplineFitness, performanceNumbers.');
      }

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
        equipment: baselines.equipment
      };
    } catch (error) {
      console.error('Error in getBaselineInsights:', error);
      throw new Error(`Baseline data error: ${error.message}. User must have complete baseline data to generate a plan.`);
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

    // Recommend injury prevention if they have injury history
    if (injuryHistory?.includes('injury')) return 'injury-prevention';

    // Default to injury prevention for safety
    return 'injury-prevention';
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
  const buildPlanPrompt = (aiAnalysis: any) => {
    const insights = getBaselineInsights();
    
    // Build structured user data instead of massive prompt
    const userData = {
      // Assessment responses
      distance: responses.distance,
      trainingPhilosophy: responses.trainingPhilosophy,
      goals: responses.goals,
      strengthTraining: responses.strengthTraining,
      strengthFrequency: responses.strengthFrequency,
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
        disciplineFitness: insights.disciplineFitness,
        trainingBackground: insights.trainingBackground
      } : (() => { throw new Error('Baseline insights are required to generate a plan. User must complete baseline assessment.'); })()
    };
    
    // Detailed prompt that tells AI to use specific baseline numbers AND AI analysis results
    const prompt = `Create a personalized training plan using the provided user data and AI analysis results.

CRITICAL: You MUST use the AI analysis data provided in userContext.aiAnalysis to create this plan.

AI ANALYSIS RESULTS (MANDATORY TO USE):
- Training Philosophy: userContext.aiAnalysis.trainingPhilosophy (DO NOT CHANGE THIS)
- Weekly Volume: userContext.aiAnalysis.weeklyVolume
- Intensity Distribution: userContext.aiAnalysis.intensityDistribution
- Progression Type: userContext.aiAnalysis.progressionType
- Strength Approach: userContext.aiAnalysis.strengthFocus
- Recovery Emphasis: userContext.aiAnalysis.recoveryNeeds
- Focus Areas: userContext.aiAnalysis.focusAreas

EXPLICIT ANALYSIS VALUES (USE THESE EXACT VALUES):
- Training Philosophy: ${aiAnalysis?.trainingPhilosophy}
- Weekly Volume: ${JSON.stringify(aiAnalysis?.weeklyVolume)}
- Intensity Distribution: ${JSON.stringify(aiAnalysis?.intensityDistribution)}
- Progression Type: ${aiAnalysis?.progressionType}
- Strength Focus: ${aiAnalysis?.strengthFocus}
- Recovery Needs: ${aiAnalysis?.recoveryNeeds}
- Focus Areas: ${JSON.stringify(aiAnalysis?.focusAreas)}

MANDATORY: Use the training philosophy "${aiAnalysis?.trainingPhilosophy}" for this plan. Do not change this value.

User has selected: ${userData.distance} distance, ${userData.trainingPhilosophy} training philosophy.

CRITICAL: Use their specific baseline performance numbers and understand training zones:

${userData.baseline?.performanceNumbers ? `
PERFORMANCE NUMBERS AND TRAINING ZONES:
- FTP: ${userData.baseline.performanceNumbers.ftp}W (Zone 4 threshold)
- 5K Pace: ${userData.baseline.performanceNumbers.fiveK} (Zone 4 threshold - HARD pace)
- Easy Pace: ${userData.baseline.performanceNumbers.easyPace} (Zone 2 - CONVERSATIONAL pace)
- Swim 100m: ${userData.baseline.performanceNumbers.swimPace100} (Zone 4 threshold)
- Squat 1RM: ${userData.baseline.performanceNumbers.squat}lbs
- Bench 1RM: ${userData.baseline.performanceNumbers.bench}lbs
- Deadlift 1RM: ${userData.baseline.performanceNumbers.deadlift}lbs

PERSONALIZED TRAINING CONTEXT:
- Current Training Volume: ${userData.baseline?.totalHours} hours/week
- Training Background: ${userData.baseline?.trainingBackground}
- Age: ${userData.baseline?.age} years old
- Injury History: ${userData.baseline?.injuryHistory}

CRITICAL - USE THESE EXACT PACES FROM USER INPUT:
- Zone 2 (Easy): Use their exact easy pace: ${userData.baseline?.performanceNumbers?.easyPace} - conversational, can talk easily
- Zone 4 (Threshold): Convert their 5K time (${userData.baseline?.performanceNumbers?.fiveK}) to pace per mile - 5K is 3.1 miles, so ${userData.baseline?.performanceNumbers?.fiveK} = ${userData.baseline?.performanceNumbers?.fiveK} ÷ 3.1 = pace per mile - hard but sustainable for 20-30 minutes
- Zone 5 (VO2 Max): Faster than their 5K pace per mile - very hard, 3-8 minute intervals
- FTP (Cycling): Use their exact FTP: ${userData.baseline?.performanceNumbers?.ftp}W for threshold work

PACE CONVERSION EXAMPLE:
- If 5K time is 24:00, then pace per mile = 24:00 ÷ 3.1 = 7:45 per mile
- Use this converted pace per mile in all running workouts

DO NOT MAKE UP PACES - USE ONLY THE NUMBERS THE USER PROVIDED.

CREATE WORKOUTS SPECIFIC TO THIS ATHLETE'S:
- Current fitness level (${userData.baseline?.disciplineFitness?.running} running, ${userData.baseline?.disciplineFitness?.cycling} cycling)
- Available equipment (${userData.baseline?.equipment?.strength?.join(', ')} for strength)
- Injury considerations (${userData.baseline?.injuryHistory})

USE THESE EXACT NUMBERS AND THEIR SPECIFIC CONTEXT in your workout descriptions.` : (() => { throw new Error('Performance numbers are required to generate a plan. User must provide FTP, 5K pace, and other performance metrics.'); })()}

MANDATORY REQUIREMENTS:
1. Use userContext.aiAnalysis.trainingPhilosophy as the training philosophy - DO NOT CHANGE THIS
2. Apply the intensity distribution from userContext.aiAnalysis.intensityDistribution
3. Use the strength approach from userContext.aiAnalysis.strengthFocus
4. Follow the progression type from userContext.aiAnalysis.progressionType
5. Respect the recovery emphasis from userContext.aiAnalysis.recoveryNeeds

Generate a 4-week plan with 7 days per week, using their specific baseline data, preferences, AND the AI analysis results.

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
      'strengthTraining',
      'strengthFrequency'
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
      const { prompt, userData } = buildPlanPrompt(aiAnalysis);
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
                onClick={() => setStep(4)}
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
            <div className="mb-4 text-gray-800 font-medium">Do you want to add strength training to your triathlon plan?</div>
            
            {insights && recommendedStrength && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> 
                  
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
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 font-medium disabled:bg-gray-300"
                disabled={!responses.weekendAvailability || (responses.weekendAvailability !== 'optimize' && !responses.longSessionPreference)}
                onClick={() => setStep(4)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 4:
        const eventRecs = getEventBasedRecommendations(responses.distance);
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">How many days per week can you train?</div>
            <div className="text-sm text-gray-600 mb-4">
              {eventRecs.frequency.description}
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400">
              <div className="text-sm text-blue-800">
                <strong>Event-Specific Guidance:</strong> {eventRecs.explanation}
              </div>
            </div>
            
            {(() => {
              // Only calculate volume if user has selected required fields
              if (responses.trainingFrequency && responses.weekdayDuration && responses.weekendDuration) {
                try {
                  const calculatedVolume = calculateVolumeFromResponses(responses);
                  return (
                    <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                      <div>
                        <strong>Based on your selections:</strong> 
                        {calculatedVolume.total > 0 ? (
                          <>You'll train {calculatedVolume.weekly}.</>
                        ) : (
                          <>Select training frequency and duration to see your volume.</>
                        )}
                        {recommendedFrequency && (
                          <div className="mt-1">Recommended: {TRAINING_FREQUENCY_OPTIONS.find(f => f.key === recommendedFrequency)?.label}</div>
                        )}
                      </div>
                    </div>
                  );
                } catch (error) {
                  return (
                    <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 text-sm">
                      <div>
                        <strong>Complete your selections:</strong> Please select training frequency and duration to see your volume.
                      </div>
                    </div>
                  );
                }
              } else {
                return (
                  <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                    <div>
                      <strong>Based on your selections:</strong> Select training frequency and duration to see your volume.
                      {recommendedFrequency && (
                        <div className="mt-1">Recommended: {TRAINING_FREQUENCY_OPTIONS.find(f => f.key === recommendedFrequency)?.label}</div>
                      )}
                    </div>
                  </div>
                );
              }
            })()}
            
            <div className="space-y-3 mb-6">
              {TRAINING_FREQUENCY_OPTIONS.map((option) => {
                const isRecommended = eventRecs.frequency.recommended.includes(option.key);
                const isPossible = eventRecs.frequency.possible.includes(option.key);
                const isDisabled = !isPossible;
                
                return (
                  <button
                    key={option.key}
                    onClick={() => !isDisabled && updateResponse('trainingFrequency', option.key)}
                    disabled={isDisabled}
                    className={`w-full p-3 text-left transition-colors ${
                      responses.trainingFrequency === option.key
                        ? 'bg-gray-200 text-black'
                        : isDisabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-transparent text-black hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span>{option.label}</span>
                      <div className="flex gap-2">
                        {isRecommended && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                        )}
                        {!isPossible && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Not suitable</span>
                        )}
                      </div>
                    </div>
                    {isDisabled && (
                      <div className="text-xs text-gray-500 mt-1">
                        {option.key === '3-days' && responses.distance === 'olympic' && 'Too few days for Olympic distance'}
                        {option.key === '3-days' && responses.distance === '70.3' && 'Too few days for 70.3 distance'}
                        {option.key === '3-days' && responses.distance === 'ironman' && 'Too few days for Ironman distance'}
                        {option.key === '4-days' && responses.distance === '70.3' && 'Too few days for 70.3 distance'}
                        {option.key === '4-days' && responses.distance === 'ironman' && 'Too few days for Ironman distance'}
                        {option.key === '5-days' && responses.distance === 'ironman' && 'Too few days for Ironman distance'}
                        {option.key === '7-days' && responses.distance === 'sprint' && 'Too many days for sprint distance'}
                      </div>
                    )}
                  </button>
                );
              })}
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
                onClick={() => setStep(5)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 5:
        const durationRecs = getEventBasedRecommendations(responses.distance);
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">How much time do you have for training sessions?</div>
            <div className="text-sm text-gray-600 mb-4">Long sessions (longer rides and runs) important for endurance</div>
            
            <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400">
              <div className="text-sm text-blue-800">
                <strong>Event-Specific Volume:</strong> {durationRecs.volume.description}
                <br />
                <strong>Weekly Target:</strong> {durationRecs.volume.weekly}
              </div>
            </div>
            
            {(() => {
              // Only calculate volume if user has selected required fields
              if (responses.trainingFrequency && responses.weekdayDuration && responses.weekendDuration) {
                try {
                  const calculatedVolume = calculateVolumeFromResponses(responses);
                  return (
                    <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                      <div>
                        <strong>Based on your selections:</strong> You'll train {calculatedVolume.weekly}.
                        {calculatedVolume.total < 6 && ' Consider longer sessions to build endurance.'}
                        {calculatedVolume.total >= 8 && ' Elite level volume - use Zone 3-4 for long sessions, Zone 4-5 for intervals.'}
                      </div>
                    </div>
                  );
                } catch (error) {
                  return (
                    <div className="mb-4 p-3 bg-yellow-100 text-yellow-800 text-sm">
                      <div>
                        <strong>Complete your selections:</strong> Please select all training options to see your volume.
                      </div>
                    </div>
                  );
                }
              } else {
                return (
                  <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                    <div>
                      <strong>Based on your selections:</strong> Select training frequency and duration to see your volume.
                    </div>
                  </div>
                );
              }
            })()}
            
            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Focused training sessions (weekdays):</div>
              <div className="space-y-2 mb-4">
                {WEEKDAY_DURATION_OPTIONS && WEEKDAY_DURATION_OPTIONS.map((option) => {
                  const isRecommended = durationRecs.volume.weekday.includes(option.key);
                  const isPossible = durationRecs.volume.weekday.includes(option.key);
                  const isDisabled = !isPossible;
                  
                  return (
                    <button
                      key={option.key}
                      onClick={() => !isDisabled && updateResponse('weekdayDuration', option.key)}
                      disabled={isDisabled}
                      className={`w-full p-3 text-left transition-colors ${
                        responses.weekdayDuration === option.key
                          ? 'bg-gray-200 text-black'
                          : isDisabled
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-transparent text-black hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{option.label}</span>
                        <div className="flex gap-2">
                          {isRecommended && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                          )}
                          {!isPossible && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Not suitable</span>
                          )}
                        </div>
                      </div>
                      {isDisabled && (
                        <div className="text-xs text-gray-500 mt-1">
                          {option.key === '30-45' && responses.distance === 'olympic' && 'Too short for Olympic distance training'}
                          {option.key === '30-45' && responses.distance === '70.3' && 'Too short for 70.3 distance training'}
                          {option.key === '30-45' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                          {option.key === '45-60' && responses.distance === '70.3' && 'Too short for 70.3 distance training'}
                          {option.key === '45-60' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                          {option.key === '60-90' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Long sessions (longer rides and runs):</div>
              <div className="space-y-2">
                {WEEKEND_DURATION_OPTIONS && WEEKEND_DURATION_OPTIONS.map((option) => {
                  const isRecommended = durationRecs.volume.weekend.includes(option.key);
                  const isPossible = durationRecs.volume.weekend.includes(option.key);
                  const isDisabled = !isPossible;
                  
                  return (
                    <button
                      key={option.key}
                      onClick={() => !isDisabled && updateResponse('weekendDuration', option.key)}
                      disabled={isDisabled}
                      className={`w-full p-3 text-left transition-colors ${
                        responses.weekendDuration === option.key
                          ? 'bg-gray-200 text-black'
                          : isDisabled
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-transparent text-black hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{option.label}</span>
                        <div className="flex gap-2">
                          {isRecommended && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                          )}
                          {!isPossible && (
                            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Not suitable</span>
                          )}
                        </div>
                      </div>
                      {isDisabled && (
                        <div className="text-xs text-gray-500 mt-1">
                          {option.key === '1-2-hours' && responses.distance === 'olympic' && 'Too short for Olympic distance training'}
                          {option.key === '1-2-hours' && responses.distance === '70.3' && 'Too short for 70.3 distance training'}
                          {option.key === '1-2-hours' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                          {option.key === '2-3-hours' && responses.distance === '70.3' && 'Too short for 70.3 distance training'}
                          {option.key === '2-3-hours' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                          {option.key === '3-4-hours' && responses.distance === 'ironman' && 'Too short for Ironman distance training'}
                        </div>
                      )}
                    </button>
                  );
                })}
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
            <div className="mb-4 text-gray-800 font-medium">Choose your training approach:</div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-100 text-blue-800 text-sm">
                <div>
                  <strong>Based on your baseline:</strong> 
  
                  {insights.trainingBackground?.includes('new') && ' As a newer athlete, sustainable training will help build consistency.'}
                  {insights.trainingBackground?.includes('consistent') && ' With your consistent training history, you can handle more intensity.'}
                </div>
              </div>
            )}
            
            <div className="space-y-4 mb-6">
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
                  PYRAMIDAL (Build up intensity through the week)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Start easy, build up to hard workouts mid-week, then ease back down
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Anyone newer to endurance training who should maximize recovery
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> Designed to peak your weekly training mid-week, allowing more time for recovery. You may see a pyramid-style week leading up to a race in other training philosophies
                </div>
              </div>

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
                  POLARIZED (Mostly easy with some very hard)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  80% of your training is easy, 20% is very hard - no middle ground
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Anyone training for endurance events
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> The most common approach used by coaches. Simple - either easy or hard, nothing in between
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
                  <FaTachometerAlt className="inline mr-2" />
                  THRESHOLD (Sustained moderate effort training)
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Mix of easy, moderate, and hard workouts throughout the week
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Best for:</strong> Anyone training for 70.3, half marathon, or longer events
                </div>
                <div className="text-sm text-gray-500">
                  <strong>Why choose this:</strong> Builds your ability to hold steady effort for extended periods
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
                onClick={() => setStep(7)}
              >
                Next
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
                  <div>✅ Strength Frequency: {responses.strengthFrequency || '❌ Missing'}</div>
                  <div>✅ Baseline Data: {baselines ? '✅ Complete' : '❌ Missing'}</div>
                </div>
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">Strength Training Frequency:</div>
            <div className="text-sm text-gray-600 mb-4">How often would you like to include strength training in your plan?</div>
            
            <div className="space-y-3 mb-6">
              {STRENGTH_FREQUENCY_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  onClick={() => updateResponse('strengthFrequency', option.key)}
                  className={`w-full p-4 text-left transition-colors border rounded-lg ${
                    responses.strengthFrequency === option.key
                      ? 'bg-gray-200 border-gray-400'
                      : 'bg-transparent hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="font-medium mb-2">{option.label}</div>
                  <div className="text-sm text-gray-600">{option.explanation}</div>
                </button>
              ))}
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
                disabled={!responses.strengthFrequency}
                onClick={() => setStep(8)}
              >
                Next
              </button>
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
                                
                                {/* Strength Exercises */}
                                {workout.type === 'Strength' && workout.exercises && workout.exercises.length > 0 && (
                                  <div className="mt-3">
                                    <div className="font-medium text-gray-700 mb-2">Exercises:</div>
                                    <div className="space-y-2">
                                      {workout.exercises.map((exercise: any, index: number) => (
                                        <div key={index} className="bg-gray-50 p-2 rounded">
                                          <div className="font-medium text-gray-800">{exercise.name}</div>
                                          <div className="text-sm text-gray-600">
                                            {exercise.sets} sets × {exercise.reps} reps
                                          </div>
                                          <div className="text-sm text-gray-700 font-medium">
                                            {exercise.weight}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
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