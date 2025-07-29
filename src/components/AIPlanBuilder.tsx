import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/contexts/AppContext';

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
  { key: 'injury-prevention', label: 'Injury prevention' },
  { key: 'power-development', label: 'Power development' },
  { key: 'sport-specific', label: 'Sport-specific' },
  { key: 'build-muscle', label: 'Build muscle' },
  { key: 'general-fitness', label: 'General fitness' },
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

const TRAINING_PHILOSOPHY_OPTIONS = [
  { 
    key: 'sustainable', 
    label: '🟢 SUSTAINABLE (POLARIZED)',
    description: '80% easy, 20% hard, skip the middle',
    bestFor: 'Long-term gains, limited time, injury prevention'
  },
  { 
    key: 'accelerated', 
    label: '⚡ ACCELERATED (PYRAMIDAL)',
    description: '70% easy, 20% moderate, 10% hard',
    bestFor: 'Getting race-ready faster, building speed, experienced athletes'
  },
  { 
    key: 'balanced', 
    label: '⚖️ BALANCED',
    description: 'Strategic combination of both approaches',
    bestFor: 'Peak performance, competition prep, breaking plateaus'
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
  { key: 'run', label: 'Run' },
  { key: 'ride', label: 'Ride' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'strength', label: 'Strength' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'swim', label: 'Swim' },
  { key: 'hybrid', label: 'Hybrid' },
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
    
    // Question 6: Training Philosophy
    trainingPhilosophy: '',
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

  const isAggressiveTimeline = () => {
    const { distance, timeline } = responses;
    if (distance === '70.3' && timeline === '8-12-weeks') return true;
    if (distance === 'ironman' && timeline === '16-20-weeks') return true;
    return false;
  };

  // Baseline-based validation and recommendations
  const getBaselineInsights = () => {
    if (!baselines) return null;

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

    // Check if they can handle more frequency
    const canIncrease = volumeIncreaseCapacity?.triathlon?.includes('easily') || 
                       volumeIncreaseCapacity?.triathlon?.includes('careful');

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
                  className={`p-3 rounded text-center transition-colors border border-gray-200 ${
                    selectedFocus.includes(option.key)
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex justify-center mb-6">
              <button
                onClick={() => toggleFocus('hybrid')}
                className={`p-3 rounded text-center transition-colors border border-gray-200 w-1/2 ${
                  selectedFocus.includes('hybrid')
                    ? 'bg-gray-200 text-black'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                Hybrid
              </button>
            </div>
            <button
              className="w-full bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
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
                  className={`w-full p-3 text-left rounded transition-colors ${
                    responses.hasSpecificEvent === 'yes'
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  Yes - specific event
                </button>
                <button
                  onClick={() => updateResponse('hasSpecificEvent', 'no')}
                  className={`w-full p-3 text-left rounded transition-colors ${
                    responses.hasSpecificEvent === 'no'
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
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
                      className="w-full p-3 border border-gray-300 rounded"
                      placeholder="e.g., Ironman 70.3 World Championship"
                    />
                  </div>

                  {/* Running Course Details */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-800 mb-3">🏃‍♂️ Running Course</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Elevation gain:</label>
                        <select
                          value={responses.runningElevationGain}
                          onChange={(e) => updateResponse('runningElevationGain', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded"
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
                          className="w-full p-3 border border-gray-300 rounded"
                        >
                          <option value="">Select course profile</option>
                          {RUNNING_COURSE_OPTIONS.courseProfile.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Cycling Course Details */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-800 mb-3">🚴‍♂️ Cycling Course</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Elevation gain:</label>
                        <select
                          value={responses.cyclingElevationGain}
                          onChange={(e) => updateResponse('cyclingElevationGain', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded"
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
                          className="w-full p-3 border border-gray-300 rounded"
                        >
                          <option value="">Select course profile</option>
                          {CYCLING_COURSE_OPTIONS.courseProfile.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Swimming Course Details */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-800 mb-3">🏊‍♂️ Swimming Course</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Water conditions:</label>
                        <select
                          value={responses.waterConditions}
                          onChange={(e) => updateResponse('waterConditions', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded"
                        >
                          <option value="">Select water conditions</option>
                          {SWIMMING_COURSE_OPTIONS.waterConditions.map((option, index) => (
                            <option key={index} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Climate */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-800 mb-3">Climate</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-2">Climate:</label>
                        <select
                          value={responses.climate}
                          onChange={e => updateResponse('climate', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded"
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
                          className={`w-full p-3 text-left rounded transition-colors ${
                            responses.generalFitnessFocus === option.key
                              ? 'bg-gray-200 text-black'
                              : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
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
                      <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                        <strong>Based on your baseline:</strong> 
                        {insights.disciplineFitness.swimming === 'beginner' && ' Swimming appears to be your weakest discipline.'}
                        {insights.disciplineFitness.cycling === 'beginner' && ' Cycling appears to be your weakest discipline.'}
                        {insights.disciplineFitness.running === 'beginner' && ' Running appears to be your weakest discipline.'}
                      </div>
                    )}
                    <div className="space-y-2">
                      {DISCIPLINE_WEAKNESS_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          onClick={() => updateResponse('limitingDiscipline', option.key)}
                          className={`w-full p-3 text-left rounded transition-colors ${
                            responses.limitingDiscipline === option.key
                              ? 'bg-gray-200 text-black'
                              : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
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
                    className="w-full p-3 border border-gray-300 rounded"
                  />
                </div>
              )}
              {performanceNumbers?.squat && (
                <div className="mb-4 text-green-700">Squat 1RM on file: {performanceNumbers.squat} lbs</div>
              )}
              {/* Repeat for deadlift, bench, equipment, etc. */}
              {/* ... */}
              <button
                className="w-full bg-gray-800 text-white py-2 rounded font-medium mt-4"
                onClick={() => setStep(2)}
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
            <div className="mb-4 text-gray-800 font-medium">How many days per week can you train?</div>
            <div className="text-sm text-gray-600 mb-4">Most 70.3 athletes train 5-6 days per week</div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm text-blue-800">
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
                  className={`w-full p-3 text-left rounded transition-colors ${
                    responses.trainingFrequency === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {option.label}
                  {option.key === recommendedFrequency && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!responses.trainingFrequency}
                onClick={() => setStep(3)}
              >
                Next
              </button>
            </div>
          </div>
        );

      case 3:
        // Get baseline values for strength fitness/performance
        const baselineStrengthFitness = baselines?.disciplineFitness?.strength;
        const baselineStrengthPerformance = baselines?.benchmarks?.strength;

        // If baseline values exist, auto-fill and skip questions
        if (
          responses.strengthTraining &&
          responses.strengthTraining !== 'no-strength' &&
          (baselineStrengthFitness || baselineStrengthPerformance)
        ) {
          if (baselineStrengthFitness && !responses.strengthFitnessLevel) {
            updateResponse('strengthFitnessLevel', baselineStrengthFitness);
          }
          if (baselineStrengthPerformance && !responses.strengthPerformanceLevel) {
            updateResponse('strengthPerformanceLevel', baselineStrengthPerformance);
          }
          // Skip to next step
          setTimeout(() => setStep(4), 0);
          return null;
        }

        return (
          <div>
            <div className="mb-4 text-gray-800 font-medium">Do you want to add strength training to your triathlon plan?</div>
            
            {insights && recommendedStrength && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm text-blue-800">
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
                  className={`w-full p-3 text-left rounded transition-colors ${
                    responses.strengthTraining === option.key
                      ? 'bg-gray-200 text-black'
                      : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {option.label}
                  {option.key === recommendedStrength && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                  )}
                </button>
              ))}
            </div>

            {responses.strengthTraining && responses.strengthTraining !== 'no-strength' && (
              <div className="mb-6 space-y-4">
                <div>
                  <div className="text-sm text-gray-600 mb-3">Fitness Level:</div>
                  <div className="space-y-2">
                    {STRENGTH_FITNESS_LEVELS.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => updateResponse('strengthFitnessLevel', option.key)}
                        className={`w-full p-3 text-left rounded transition-colors ${
                          responses.strengthFitnessLevel === option.key
                            ? 'bg-gray-200 text-black'
                            : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-3">Performance Level:</div>
                  <div className="space-y-2">
                    {STRENGTH_PERFORMANCE_LEVELS.map((option) => (
                      <button
                        key={option.key}
                        onClick={() => updateResponse('strengthPerformanceLevel', option.key)}
                        className={`w-full p-3 text-left rounded transition-colors ${
                          responses.strengthPerformanceLevel === option.key
                            ? 'bg-gray-200 text-black'
                            : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {responses.strengthPerformanceLevel === 'know-1rms' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-2">Squat 1RM (lbs):</label>
                      <input
                        type="number"
                        value={responses.squat1RM}
                        onChange={(e) => updateResponse('squat1RM', e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded"
                      />
                    </div>
                    {/* Repeat for deadlift, bench, etc. */}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
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
            <div className="mb-4 text-gray-800 font-medium">How much time do you have for training sessions?</div>
            <div className="text-sm text-gray-600 mb-4">Longer weekend sessions important for endurance</div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm text-blue-800">
                  <strong>Based on your baseline:</strong> You currently train {insights.totalHours} hours/week.
                  {insights.totalHours < 6 && ' Consider longer sessions to build endurance.'}
                  {insights.totalHours >= 8 && ' You have good volume, focus on quality over quantity.'}
                </div>
              </div>
            )}
            
            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Weekday sessions:</div>
              <div className="space-y-2 mb-4">
                {WEEKDAY_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('weekdayDuration', option.key)}
                    className={`w-full p-3 text-left rounded transition-colors ${
                      responses.weekdayDuration === option.key
                        ? 'bg-gray-200 text-black'
                        : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <div className="text-sm text-gray-600 mb-3">Weekend sessions:</div>
              <div className="space-y-2">
                {WEEKEND_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => updateResponse('weekendDuration', option.key)}
                    className={`w-full p-3 text-left rounded transition-colors ${
                      responses.weekendDuration === option.key
                        ? 'bg-gray-200 text-black'
                        : 'bg-white text-black hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!responses.weekdayDuration || !responses.weekendDuration}
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
            <div className="mb-4 text-gray-800 font-medium">Choose your training approach:</div>
            
            {insights && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="text-sm text-blue-800">
                  <strong>Based on your baseline:</strong> 
                  {insights.age >= 40 && ' At your age, sustainable training is recommended for injury prevention.'}
                  {insights.trainingBackground?.includes('new') && ' As a newer athlete, sustainable training will help build consistency.'}
                  {insights.trainingBackground?.includes('consistent') && ' With your consistent training history, you can handle more intensity.'}
                </div>
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              {TRAINING_PHILOSOPHY_OPTIONS.map((option) => (
                <div
                  key={option.key}
                  onClick={() => updateResponse('trainingPhilosophy', option.key)}
                  className={`p-4 rounded border cursor-pointer transition-colors ${
                    responses.trainingPhilosophy === option.key
                      ? 'bg-gray-200 border-gray-300'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium mb-2">{option.label}</div>
                  <div className="text-sm text-gray-600 mb-2">{option.description}</div>
                  <div className="text-sm text-gray-500">Best for: {option.bestFor}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 bg-gray-100 text-gray-800 py-2 rounded font-medium"
                onClick={() => setStep(4)}
              >
                Back
              </button>
              <button
                className="flex-1 bg-gray-800 text-white py-2 rounded font-medium disabled:bg-gray-300"
                disabled={!responses.trainingPhilosophy}
                onClick={() => setStep(6)}
              >
                Generate Plan
              </button>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="text-center">
            <div className="mb-4 text-gray-800 font-medium">Generating your triathlon plan...</div>
            <div className="text-gray-600 mb-6">
              <div>Distance: {TRIATHLON_DISTANCES.find(d => d.key === responses.distance)?.label}</div>
              <div>Timeline: {TIMELINE_OPTIONS.find(t => t.key === responses.timeline)?.label}</div>
              <div>Training Frequency: {TRAINING_FREQUENCY_OPTIONS.find(f => f.key === responses.trainingFrequency)?.label}</div>
              <div>Strength Training: {STRENGTH_OPTIONS.find(s => s.key === responses.strengthTraining)?.label}</div>
              <div>Training Philosophy: {TRAINING_PHILOSOPHY_OPTIONS.find(p => p.key === responses.trainingPhilosophy)?.label}</div>
            </div>
            <div className="text-gray-500">(TODO: Connect to AI plan generation)</div>
          </div>
        );

      default:
        return <div>Something went wrong</div>;
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-8 p-4 bg-white rounded shadow">
      <h2 className="text-xl font-semibold mb-4">Create a Training Plan</h2>
      <div className="space-y-6">
        {getCurrentStepContent()}
      </div>
    </div>
  );
} 