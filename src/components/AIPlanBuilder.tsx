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
    let prompt = `Create a comprehensive training plan for a triathlete with the following specifications:

**CRITICAL REQUIREMENT: Generate a 4-WEEK PREVIEW of the training plan. This is a preview showing the first month of training. The full plan will be available in the app.**

**RESPONSE LENGTH: Generate exactly 4 weeks with detailed workouts. This is a preview, not the complete plan.**

**MANDATORY: Each week MUST have EXACTLY 7 DAYS of workouts (Monday through Sunday). DO NOT skip any days. Include all 7 days in every week. NO REST DAYS unless specifically requested.**

**INTENSITY REQUIREMENTS:**
- **8+ hours/week training = Elite level intensity**
- **Long sessions should be Zone 3-4, not Zone 1-2**
- **Intervals should be Zone 4-5, not moderate**
- **Use challenging paces, not easy spins**
- **Progressive overload with real intensity**

**SMART DISTRIBUTION FOR ELITE ATHLETES:**
- **Swim:** 1 session/week (maintenance, technique focus)
- **Strength:** 2-3 sessions/week (injury prevention, performance support)
- **Bike/Run:** Priority focus (biggest impact on race time)
- **Pyramid structure:** Zone 2 → Zone 3 → Zone 4 → Zone 3 → Zone 2 within sessions

**STRENGTH TRAINING: If user selected strength training, include 2-3 strength sessions per week with detailed exercises, sets, and reps.**

**Event Type:** ${responses.distance || 'Triathlon'}

**USER ASSESSMENT DATA - USE THIS TO CUSTOMIZE THE PLAN:**

**Baseline Fitness Data:**
${insights ? `
- Age: ${insights.age || 'Not specified'}
- Current Training Volume: ${insights.totalHours || 'Unknown'} hours/week
- Injury History: ${insights.injuryHistory || 'None reported'}
- Performance Numbers: ${insights.performanceNumbers ? Object.entries(insights.performanceNumbers).map(([key, value]) => `${key}: ${value}`).join(', ') : 'None available'}
- Equipment Access: ${insights.equipment && Array.isArray(insights.equipment) ? insights.equipment.join(', ') : 'Basic equipment'}
${insights.age >= 40 ? `
**AGE & BASELINE CONSIDERATIONS:**
${insights.age >= 40 ? `
- **Age 40+ with high fitness baseline:** Maintain current intensity, focus on recovery quality
- **Age 40+ with injury history:** Include more strength training and mobility work
- **Age 40+ with low fitness baseline:** More conservative progression, focus on consistency
- **Recovery focus:** Quality recovery over quantity, active recovery on rest days
- **Strength training:** Important for injury prevention and performance maintenance
` : `
- **Standard progression:** Based on current fitness level and training history
- **Recovery:** Standard 24-48 hour recovery between high-intensity sessions
`}
` : ''}
` : 'No baseline data available'}

**User Responses - CUSTOMIZE BASED ON THESE:**
- Training Philosophy: ${responses.trainingPhilosophy || 'Not selected'}
- Goals: ${responses.goals && responses.goals.length > 0 ? responses.goals.map(g => GOAL_OPTIONS.find(opt => opt.key === g)?.label).join(', ') : 'Not specified'}
- Strength Training: ${responses.strengthTraining ? STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining)?.label : 'Not selected'}
- Training Frequency: ${responses.trainingFrequency ? TRAINING_FREQUENCY_OPTIONS.find(f => f.key === responses.trainingFrequency)?.label : 'Not selected'}
- Weekend Availability: ${responses.weekendAvailability ? WEEKEND_AVAILABILITY_OPTIONS.find(w => w.key === responses.weekendAvailability)?.label : 'Not selected'}
- Long Session Preference: ${responses.longSessionPreference ? LONG_SESSION_PREFERENCES.find(l => l.key === responses.longSessionPreference)?.label : 'Not selected'}
- Event Date: ${responses.eventDate || 'Not specified'}
`;
    
    // Focus and event details
    if (selectedFocus.includes('triathlon')) {
      prompt += `**Event Type:** Triathlon\n`;
      if (responses.hasSpecificEvent === 'yes' && responses.raceName) {
        prompt += `**Specific Event:** ${responses.raceName}\n`;
      }
      if (responses.eventDate) {
        prompt += `**Event Date:** ${responses.eventDate}\n`;
      }
      if (responses.waterConditions) {
        prompt += `**Swimming Conditions:** ${responses.waterConditions}\n`;
      }
      if (responses.cyclingElevationGain) {
        prompt += `**Cycling Course:** ${responses.cyclingElevationGain}, ${responses.cyclingCourseProfile || 'standard profile'}\n`;
      }
      if (responses.runningElevationGain) {
        prompt += `**Running Course:** ${responses.runningElevationGain}, ${responses.runningCourseProfile || 'standard profile'}\n`;
      }
      if (responses.climate) {
        prompt += `**Climate:** ${responses.climate}\n`;
      }
    }
    
    // Event details
    if (responses.hasSpecificEvent === 'yes') {
      prompt += `**Event Details:**\n`;
      prompt += `- Distance: ${responses.distance}\n`;
      prompt += `- Race Name: ${responses.raceName}\n`;
      prompt += `- Course Profile: ${responses.courseProfile}\n`;
      prompt += `- Climate: ${responses.climate}\n`;
      prompt += `- Running Elevation: ${responses.runningElevationGain}\n`;
      prompt += `- Running Course: ${responses.runningCourseProfile}\n`;
      prompt += `- Cycling Elevation: ${responses.cyclingElevationGain}\n`;
      prompt += `- Cycling Course: ${responses.cyclingCourseProfile}\n`;
      prompt += `- Water Conditions: ${responses.waterConditions}\n`;
      if (responses.eventDate) {
        prompt += `- Event Date: ${responses.eventDate}\n`;
      }
    }

    // Goals
    if (responses.goals && responses.goals.length > 0) {
      prompt += `**Primary Goals:**\n`;
      responses.goals.forEach(goalKey => {
        const goal = GOAL_OPTIONS.find(g => g.key === goalKey);
        if (goal) {
          prompt += `- ${goal.label}: ${goal.description}\n`;
        }
      });
    }
    
    // Weekend availability and long session preferences - CRITICAL for scheduling
    if (responses.weekendAvailability) {
      prompt += `**Weekend Availability:** ${WEEKEND_AVAILABILITY_OPTIONS.find(w => w.key === responses.weekendAvailability)?.label}\n`;
    }
    if (responses.longSessionPreference) {
      prompt += `**Long Session Preference:** ${LONG_SESSION_PREFERENCES.find(l => l.key === responses.longSessionPreference)?.label}\n`;
      
      // Add specific instructions based on preference
      switch (responses.longSessionPreference) {
        case 'traditional-weekend':
          prompt += `**SCHEDULING:** Always schedule long rides on Saturdays and long runs on Sundays.\n`;
          break;
        case 'reverse-weekend':
          prompt += `**SCHEDULING:** Always schedule long rides on Sundays and long runs on Saturdays.\n`;
          break;
        case 'weekday-long':
          prompt += `**SCHEDULING:** Schedule long sessions on weekdays (Monday-Friday) since user works weekends.\n`;
          break;
        case 'split-weekend':
          prompt += `**SCHEDULING:** Schedule one long session each weekend day (Saturday and Sunday).\n`;
          break;
        case 'flexible-weekly':
          prompt += `**SCHEDULING:** User will adjust long sessions based on their weekly schedule - provide flexible options.\n`;
          break;
        case 'optimize':
          prompt += `**SCHEDULING:** Optimize long session timing based on user's availability and recovery needs.\n`;
          break;
      }
    }
    
    // Training frequency and duration
    if (responses.trainingFrequency) {
      prompt += `**Training Frequency:** ${TRAINING_FREQUENCY_OPTIONS.find(f => f.key === responses.trainingFrequency)?.label}\n`;
    }
    if (responses.weekdayDuration) {
      prompt += `**Weekday Sessions:** ${WEEKDAY_DURATION_OPTIONS.find(w => w.key === responses.weekdayDuration)?.label}\n`;
    }
    if (responses.weekendDuration) {
      prompt += `**Weekend Sessions:** ${WEEKEND_DURATION_OPTIONS.find(w => w.key === responses.weekendDuration)?.label}\n`;
    }
    
    // Strength training
    if (responses.strengthTraining && responses.strengthTraining !== 'no-strength') {
      const strengthType = STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining)?.label;
      prompt += `**Strength Training:** ${strengthType}\n`;
      
      // Add specific frequency based on strength type
      if (responses.strengthTraining === 'power-development') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 power development sessions per week with plyometrics and explosive movements.\n`;
        prompt += `**POWER DEVELOPMENT REQUIREMENTS:** Use plyometrics, explosive movements, rate of force development. Include box jumps, medicine ball throws, jump squats, explosive push-ups, power cleans, snatches. Focus on speed and power.\n`;
      } else if (responses.strengthTraining === 'power-lifting') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 power lifting sessions per week with compound lifts, heavy weight, low reps.\n`;
        prompt += `**POWER LIFTING REQUIREMENTS:** Use compound movements (squat, bench, deadlift), heavy weight (80-90% 1RM), low reps (3-5), long rest periods (3-5 min). Focus on strength development.\n`;
      } else if (responses.strengthTraining === 'injury-prevention') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 injury prevention strength sessions per week focusing on mobility, stability, and corrective exercises.\n`;
        prompt += `**INJURY PREVENTION REQUIREMENTS:** Use mobility work, stability exercises, corrective movements. Include hip mobility, core stability, shoulder stability, single-leg balance, corrective exercises for common triathlon imbalances.\n`;
      } else if (responses.strengthTraining === 'sport-specific') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 sport-specific strength sessions per week targeting triathlon-specific movements.\n`;
        prompt += `**SPORT-SPECIFIC REQUIREMENTS:** Use triathlon-specific movements. Include swim pull exercises, bike-specific leg strength, run-specific plyometrics, transition practice, sport-specific core work.\n`;
      } else if (responses.strengthTraining === 'build-muscle') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 muscle building sessions per week with hypertrophy focus.\n`;
        prompt += `**BUILD MUSCLE REQUIREMENTS:** Use hypertrophy training (8-12 reps), moderate weight (70-80% 1RM), shorter rest periods (60-90 sec). Include compound and isolation exercises for muscle growth.\n`;
      } else if (responses.strengthTraining === 'general-fitness') {
        prompt += `**STRENGTH SCHEDULE:** Include 2-3 general fitness strength sessions per week.\n`;
        prompt += `**GENERAL FITNESS REQUIREMENTS:** Use basic conditioning exercises, moderate intensity, full-body workouts. Include bodyweight exercises, light weights, circuit training for overall fitness.\n`;
      }
      
      prompt += `**IMPORTANT:** Include detailed strength training workouts with specific exercises, sets, reps, and weights if applicable.\n`;
    }
    
    // Training philosophy
    if (responses.trainingPhilosophy) {
      prompt += `**Training Philosophy:** ${responses.trainingPhilosophy.toUpperCase()}\n`;
    }
    
    // Baseline insights
    if (insights) {
      prompt += `\n**Athlete Profile:**\n`;
      prompt += `- Current training volume: ${insights.totalHours} hours/week\n`;
      prompt += `- Age: ${insights.age || 'Not specified'}\n`;
      if (insights.trainingBackground) {
        prompt += `- Training background: ${insights.trainingBackground}\n`;
      }
      if (insights.injuryHistory) {
        prompt += `- Injury history: ${insights.injuryHistory}\n`;
      }
      
      // Add performance numbers for specific pace/FTP targets
      if (insights.performanceNumbers) {
        prompt += `\n**Performance Numbers (USE THESE FOR SPECIFIC TARGETS):**\n`;
        Object.entries(insights.performanceNumbers).forEach(([discipline, numbers]) => {
          if (numbers && typeof numbers === 'object') {
            prompt += `- ${discipline}: ${JSON.stringify(numbers)}\n`;
          }
        });
      }
      
      // Add discipline fitness levels
      if (insights.disciplineFitness) {
        prompt += `\n**Discipline Fitness Levels:**\n`;
        Object.entries(insights.disciplineFitness).forEach(([discipline, level]) => {
          if (level) {
            prompt += `- ${discipline}: ${level}\n`;
          }
        });
      }
    }
    
    prompt += `**REQUIREMENTS:**

1. **STRUCTURE:** Create a FULL training plan with MULTIPLE WEEKS (at least 8-12 weeks). Each week MUST have EXACTLY 7 DAYS (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday) with specific workouts. DO NOT skip any days.

2. **WORKOUT DETAILS:** Each workout must include:
   - **Running paces:** Specific pace targets (e.g., "8:30/mi", "7:45/mi") - ALWAYS INCLUDE ACTUAL PACE WHEN AVAILABLE, NOT JUST "Zone 2"
   - **Swimming paces:** Specific pace targets (e.g., "2:05/100m", "1:15/100m") - ALWAYS INCLUDE ACTUAL PACE WHEN AVAILABLE
   - **FTP percentages for cycling:** (e.g., "85% FTP (220 watts)", "Zone 3") - ALWAYS INCLUDE ACTUAL WATTAGE WHEN FTP IS AVAILABLE
   - **Heart rate zones:** Where applicable - CALCULATE BASED ON BASELINE FITNESS
   - **Specific intervals:** With times/distances - USE ACTUAL PACE/SPEED NUMBERS
   - **Sets and reps for strength training:** (e.g., "3x5 squats @ 85% 1RM (191 lbs)") - ALWAYS INCLUDE ACTUAL WEIGHT WHEN 1RM IS AVAILABLE
   - **Warm-up, main sets, and cool-down:** For each workout

3. **STRENGTH TRAINING:** If requested, include 2-3 detailed strength workouts per week with:
   - Specific exercises (squats, deadlifts, rows, etc.)
   - Sets, reps, and weight recommendations
   - Progression over weeks
   - Full workout details (warm-up, main sets, cool-down)

4. **PROGRESSION:** Show clear progression:
   - Build phases with increasing intensity
   - Recovery weeks
   - Peak and taper phases
   - Specific metrics that improve over time

5. **PERIODIZATION & PROGRESSIVE OVERLOAD:**
   - **Week 1-4:** Base building (aerobic foundation, technique)
   - **Week 5-8:** Build phase (increasing volume and intensity)
   - **Week 9-10:** Recovery week (reduced volume, maintain intensity)
   - **Week 11-14:** Peak phase (high intensity, sport-specific)
   - **Week 15-16:** Taper (reduced volume, maintain intensity)
   - **Progressive overload:** Each week should show measurable increases in volume, intensity, or complexity
   - **Recovery weeks:** Every 3-4 weeks, include a recovery week with 20-30% reduced volume
   - **Deload periods:** Include proper deload periods to prevent overtraining

6. **TRAINING APPROACHES - MAKE THESE DISTINCTLY DIFFERENT:**
   - **PYRAMID TRAINING:** 
     * Structure workouts with intensity progression: easy → moderate → hard → moderate → easy
     * Example: 10min easy → 15min moderate → 10min hard → 15min moderate → 10min easy
     * Build intensity within each session, then taper down
     * Focus on gradual intensity changes and recovery within workouts
   
   - **POLARIZED TRAINING:**
     * 80% of training at easy intensity (Zone 1-2, conversational pace)
     * 20% of training at hard intensity (Zone 4-5, threshold and above)
     * Minimal moderate intensity (Zone 3) - avoid "junk miles"
     * Easy days should be truly easy, hard days should be very challenging
     * Example: Monday easy run (Zone 1), Tuesday hard intervals (Zone 4-5), Wednesday easy swim (Zone 1)
   
   - **BALANCED TRAINING:**
     * Distribute intensity across all zones: 40% easy (Zone 1-2), 40% moderate (Zone 3), 20% hard (Zone 4-5)
     * Include steady-state work, tempo sessions, and intervals
     * Mix of aerobic base, threshold work, and high-intensity intervals
     * Example: Monday easy (Zone 2), Tuesday tempo (Zone 3), Wednesday intervals (Zone 4), Thursday easy (Zone 2)
   
   - **Intensity Distribution:** Base intensity levels on user's fitness level and training philosophy preference

7. **BASELINE FITNESS INTEGRATION:**
   - **Use baseline data:** Incorporate user's current fitness level, performance numbers, and training history
   - **Customize intensity:** Adjust pace targets, FTP percentages, and HR zones based on baseline data
   - **Progressive overload:** Start from current fitness level and build appropriately
   - **Injury prevention:** Consider injury history and age for appropriate progression
   - **Equipment access:** Include strength exercises based on available equipment
   - **Time constraints:** Respect current training volume and available time

8. **INTENSITY CUSTOMIZATION BASED ON BASELINE:**
   - **CRITICAL:** Use the actual performance numbers provided in the baseline data
   - **If user has FTP data:** Use actual FTP percentages (e.g., "85% FTP (220 watts)") - ALWAYS INCLUDE THE ACTUAL WATTAGE
   - **RUNNING PACE HIERARCHY - USE APPROPRIATE PACE FOR EACH WORKOUT TYPE:**
     * **Intervals/High Intensity:** Use 5K pace or faster (e.g., "8:00/mi intervals")
     * **Tempo/Threshold:** Use 10K pace (e.g., "8:30/mi tempo")
     * **Long Runs:** Use easy pace if available (e.g., "10:00/mi long run - easy pace, Zone 2")
     * **Easy/Recovery:** Use easy pace if available (e.g., "10:00/mi easy - easy pace, Zone 2")
     * **If no easy pace available:** Use 5K pace + 1-2 min/mi as estimate
     * **NEVER USE GENERIC "Zone 2" WITHOUT SPECIFIC PACE**
     * **PRIORITIZE USER'S EASY PACE:** Always use their actual easy pace when available
   - **If user has swimming pace data:** Use actual pace targets (e.g., "2:05/100m", "1:15/100m") - ALWAYS INCLUDE ACTUAL PACE
   - **If user has HR zones:** Use actual HR zone targets (e.g., Zone 2, Zone 4) - CALCULATE FROM BASELINE
   - **If user has strength numbers:** Use actual weight recommendations (e.g., "80% 1RM (180 lbs)") - ALWAYS INCLUDE THE ACTUAL WEIGHT
   - **If no baseline data:** Use conservative estimates based on fitness level
   - **Age considerations:** Adjust intensity for age-appropriate training (recovery, progression rate)
   - **MANDATORY:** Every workout must have specific, actionable numbers - no generic descriptions
   - **FORMAT:** Always show the calculation: "85% FTP (220 watts)" not just "85% FTP"
   - **RUNNING FORMAT:** Always show specific pace: "8:30/mi" not just "Zone 2"
   - **Injury history:** Modify exercises and intensity based on injury patterns

9. **AGE & BASELINE MODIFICATIONS:**
   - **For athletes 40+ with high fitness baseline:** 
     * Maintain current intensity levels based on baseline data
     * Focus on recovery quality over quantity
     * Include active recovery sessions
     * Strength training for performance maintenance
     * Standard 24-48 hour recovery between high-intensity sessions
   - **For athletes 40+ with injury history:** 
     * Include more strength training and mobility work
     * Conservative progression based on injury patterns
     * Focus on technique and form
   - **For athletes 40+ with low fitness baseline:** 
     * More conservative progression, focus on consistency
     * Build aerobic base before adding intensity
     * Include strength training for injury prevention
   - **For athletes under 40:** Standard progression based on baseline fitness level

10. **SCHEDULING:** Respect the user's long session preferences:
   - Schedule long runs/rides according to their preference
   - Consider their weekend availability
   - Balance training load throughout the week

11. **OUTPUT FORMAT:** Return ONLY valid JSON in this exact structure with 4 WEEKS:
{
  "plan": {
    "name": "Your Training Plan",
    "description": "Personalized training plan based on your assessment",
    "phase": "[USER'S ACTUAL GOAL] Training Plan",
    "phaseDescription": "First month of training - full plan available in app",
    "trainingPhilosophy": "pyramid", // or "polarized" or "balanced"
    "weeks": [
      {
        "weekNumber": 1,
        "focus": "Base Building - Aerobic Foundation",
        "phase": "Base",
        "workouts": [
          {
            "day": "Monday",
            "type": "Swim",
            "duration": "45 minutes",
            "warmup": "400m easy @ 2:00/100m",
            "main": "8x50m @ 1:15/100m, 30s rest",
            "cooldown": "200m easy @ 2:30/100m",
            "notes": "Focus on technique, build aerobic base"
          },
          {
            "day": "Tuesday",
            "type": "Bike",
            "duration": "60 minutes",
            "warmup": "15min easy @ Zone 1",
            "main": "3x10min @ 85% FTP (220 watts), 5min rest",
            "cooldown": "10min easy @ Zone 1",
            "notes": "Build cycling strength, progressive overload"
          },
          {
            "day": "Wednesday",
            "type": "Run",
            "duration": "45 minutes",
            "warmup": "10min easy @ 9:30/mi",
            "main": "20min @ 8:30/mi, 10min @ 7:45/mi",
            "cooldown": "5min easy @ 9:30/mi",
            "notes": "Build running endurance"
          },
          {
            "day": "Thursday",
            "type": "Strength",
            "duration": "60 minutes",
            "warmup": "10min dynamic stretching, 3x5 @ 50% 1RM",
            "main": "3x5 squats @ 85% 1RM (191 lbs), 3x3 deadlifts @ 90% 1RM (225 lbs), 3x5 bench @ 80% 1RM (180 lbs)",
            "cooldown": "5min static stretching",
            "notes": "Power lifting - compound movements, heavy weight, low reps"
          },
          {
            "day": "Friday",
            "type": "Swim",
            "duration": "30 minutes",
            "warmup": "200m easy @ 2:00/100m",
            "main": "6x50m @ 1:20/100m, 30s rest",
            "cooldown": "200m easy @ 2:30/100m",
            "notes": "Recovery swim, focus on technique"
          },
          {
            "day": "Saturday",
            "type": "Bike",
            "duration": "90 minutes",
            "warmup": "15min easy @ Zone 1",
            "main": "60min @ Zone 2-3, long steady ride",
            "cooldown": "15min easy @ Zone 1",
            "notes": "Long ride to build endurance"
          },
          {
            "day": "Sunday",
            "type": "Run",
            "duration": "60 minutes",
            "warmup": "10min easy @ 9:30/mi",
            "main": "45min @ 8:30/mi, long steady run",
            "cooldown": "5min easy @ 9:30/mi",
            "notes": "Long run to build endurance"
          }
        ]
      },
      {
        "weekNumber": 4,
        "focus": "Base Building - Recovery Week",
        "phase": "Recovery",
        "workouts": [
          {
            "day": "Monday",
            "type": "Swim",
            "duration": "30 minutes",
            "warmup": "200m easy @ 2:00/100m",
            "main": "4x50m @ 1:15/100m, 30s rest",
            "cooldown": "200m easy @ 2:30/100m",
            "notes": "Recovery week - reduced volume, maintain technique"
          }
        ]
      },
      {
        "weekNumber": 8,
        "focus": "Build Phase - Increasing Intensity",
        "phase": "Build",
        "workouts": [
          {
            "day": "Monday",
            "type": "Swim",
            "duration": "60 minutes",
            "warmup": "400m easy @ 2:00/100m",
            "main": "12x50m @ 1:10/100m, 30s rest",
            "cooldown": "200m easy @ 2:30/100m",
            "notes": "Increased volume and intensity - progressive overload"
          }
        ]
      }
    ]
  }
}

**STRENGTH TRAINING EXAMPLES:**
- **Power Development:** Box jumps, medicine ball throws, jump squats, explosive push-ups, power cleans, snatches
- **Power Lifting:** Squats @ 85% 1RM, deadlifts @ 90% 1RM, bench @ 80% 1RM (3-5 reps, 3-5 min rest)
- **Injury Prevention:** Hip mobility, core stability, shoulder stability, single-leg balance, corrective exercises
- **Sport-Specific:** Swim pull exercises, bike-specific leg strength, run-specific plyometrics, transition practice
- **Build Muscle:** Hypertrophy training (8-12 reps, 70-80% 1RM, 60-90 sec rest)
- **General Fitness:** Bodyweight exercises, light weights, circuit training

**CRITICAL:** 
- Return ONLY the JSON object above
- Generate EXACTLY 4 WEEKS of training (preview only)
- Each week MUST have EXACTLY 7 DAYS of workouts (Monday through Sunday)
- Make each workout specific and actionable with actual pace targets, FTP percentages, heart rate zones, and detailed instructions
- This is a preview - full plan will be available in the app
- Generate 4 weeks with proper progression and structure
- Focus on Base building phase for the first month
- **VERCEL TEST:** Force deploy with environment variables
- Include recovery weeks every 3-4 weeks with 20-30% reduced volume
- Show progressive overload: increasing volume, intensity, or complexity each week
- Include proper deload periods to prevent overtraining
- **STRENGTH TRAINING:** If requested, include 2-3 strength sessions per week with detailed exercises
- **CUSTOMIZE BASED ON USER RESPONSES:**
  - Use the selected training philosophy (pyramid/polarized/balanced) to structure workouts
  - Base intensity levels on user's fitness level from baseline data
  - Adjust volume based on current training frequency and available time
  - Include strength training if requested, using available equipment
  - Respect long session preferences and weekend availability
  - Consider injury history and age for appropriate progression
- **MAKE TRAINING APPROACHES DISTINCTLY DIFFERENT:**
  - Pyramid: Intensity progression within workouts (easy → moderate → hard → moderate → easy)
  - Polarized: 80% easy (Zone 1-2), 20% hard (Zone 4-5), minimal moderate intensity
  - Balanced: 40% easy, 40% moderate, 20% hard across all zones
- **USE ALL BASELINE DATA:**
  - Incorporate actual performance numbers (FTP, pace, strength)
  - Base training intensity on current fitness level, not just age
  - Consider injury history for appropriate progression
  - Use available equipment for strength training
  - Start from current fitness level and build appropriately
  - **Age 40+ with high fitness:** Maintain intensity, focus on recovery quality
  - **Age 40+ with low fitness:** Conservative progression, build base first`;
    
    return prompt;
  };

  // Generate plan using AI analysis + PlanEngine
  const generatePlan = async () => {
    try {
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
      const prompt = buildPlanPrompt();
      const startDate = new Date().toISOString().split('T')[0];
      const userContext = {
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
      
      setGeneratedPlan(plan);
      setCurrentWeek(0); // Reset to first week
      
    } catch (error) {
      console.error('❌ Error generating plan:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      // Show error to user
      setGeneratedPlan(null);
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Auto-generate plan when reaching step 6
  useEffect(() => {
    if (step === 6 && !generatedPlan && !generatingPlan) {
      generatePlan();
    }
  }, [step]);

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
                      onChange={(e) => updateResponse('eventDate', e.target.value)}
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
                onClick={() => setStep(8)}
              >
                Generate Plan
              </button>
            </div>
          </div>
        );

      case 8:
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

              {/* Parse and display the actual plan */}
              {(() => {
                try {
                  // The system now returns the plan directly in the correct format
                  const planData = generatedPlan.plan;
                  if (!planData) return <div>No plan data available</div>;
                  
                  // Check if weeks exist in the plan structure
                  const weeks = planData.weeks || [];
                  console.log('Plan data:', planData);
                  console.log('Weeks found:', weeks.length);
                  
                  if (weeks.length === 0) return <div>No weeks found in plan</div>;
                  
                  return (
                    <div className="space-y-6">
                      {/* Plan Overview */}
                      <div className="p-4 bg-blue-50 text-blue-800 rounded-lg">
                        <div className="font-medium mb-2">{planData.phase}</div>
                        <div className="text-sm">{planData.phaseDescription}</div>
                        <div className="text-sm mt-1">Training Philosophy: {planData.trainingPhilosophy}</div>
                      </div>
                      
                      {/* Week Navigation */}
                      <div className="mb-6">
                        <div className="flex border-b border-gray-200 overflow-x-auto">
                          {weeks.map((week: any, weekIndex: number) => (
                            <button
                              key={weekIndex}
                              onClick={() => setCurrentWeek(weekIndex)}
                              className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${
                                weekIndex === currentWeek 
                                  ? 'text-gray-900 border-b-2 border-gray-900' 
                                  : 'text-gray-500 hover:text-gray-700 hover:border-b-2 hover:border-gray-300'
                              }`}
                            >
                              Week {week.weekNumber}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Current Week View */}
                      {weeks[currentWeek] && (
                        <div className="space-y-4">
                          <div className="text-lg font-semibold text-gray-800">
                            Week {weeks[currentWeek].weekNumber} - {weeks[currentWeek].focus}
                          </div>
                          <div className="text-sm text-gray-600 mb-4">
                            Phase: {weeks[currentWeek].phase}
                          </div>
                          
                          {/* Daily Workouts */}
                          <div className="space-y-6">
                            {weeks[currentWeek].workouts?.map((workout: any, dayIndex: number) => (
                              <div key={dayIndex} className="border-b border-gray-100 pb-6">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="font-medium text-gray-900 text-lg">
                                    {workout.day}: {workout.type}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {workout.duration}
                                  </div>
                                </div>
                                
                                {/* Workout Details */}
                                <div className="space-y-3 text-sm">
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
                  );
                } catch (error) {
                  console.error('Error parsing plan:', error);
                  return (
                    <div className="mb-6">
                      <div className="text-lg font-semibold text-gray-800 mb-4">Plan Data (Debug)</div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                          {JSON.stringify(generatedPlan, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                }
              })()}



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