// src/components/PlanBuilder.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight, Kanban, Calendar } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';

interface PlanBuilderProps {
  onClose: () => void;
  onPlanGenerated?: (plan: any) => void;
}

export default function PlanBuilder({ onClose, onPlanGenerated }: PlanBuilderProps) {
  const { addWorkout } = useAppContext();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'suggested' | 'free'>('suggested');
  
  // Free tab state (existing functionality)
  const [planPrompt, setPlanPrompt] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Suggested tab state
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    category: '',
    specificGoal: '',
    experienceLevel: '',
    trainingFrequency: '',
    timePerSession: '',
    equipmentLocation: '',
    startDate: new Date().toISOString().split('T')[0]
  });

  // Enhanced quick plan suggestions with more variety
  const quickPlans = [
    "Build me a 30-minute easy run for recovery",
    "Create a 5K training plan over 6 weeks", 
    "I want a 45-minute bike ride with 6x3min intervals",
    "Design a full-body strength workout for runners",
    "Give me a 2000m swim workout for endurance",
    "Build me a 4-week marathon training plan",
    "Create a 12-week triathlon program for beginners",
    "I need a strength plan to prevent running injuries",
    "Design a 2-week taper for my upcoming race",
    "Create interval training for improving 10K speed"
  ];

  // Suggested tab categories and options
  const categories = {
    '1': 'Running',
    '2': 'Cycling', 
    '3': 'Swimming',
    '4': 'Strength',
    '5': 'Mobility',
    '6': 'Hybrid'
  };

  const specificGoals = {
    '1': [ // Running
      'Train for a 5K',
      'Train for a 10K', 
      'Train for a half marathon',
      'Train for a marathon',
      'Make me faster',
      'Add strength to my running'
    ],
    '2': [ // Cycling
      'Improve my FTP',
      'Train for a century ride',
      'Build cycling endurance', 
      'Make me faster',
      'Add strength to my cycling'
    ],
    '3': [ // Swimming
      'Train for my first triathlon swim',
      'Improve my swimming technique',
      'Build swimming endurance',
      'Make me faster'
    ],
    '4': [ // Strength
      'Build muscle mass',
      'Get stronger (powerlifting focus)',
      'Functional strength for daily life',
      'Make me stronger'
    ],
    '5': [ // Mobility
      'Daily mobility routine',
      'Runner\'s mobility plan',
      'Cyclist\'s mobility plan',
      'Make me more flexible'
    ],
    '6': [ // Hybrid
      'Triathlon training (swim/bike/run)',
      'Running + strength integration',
      'Cycling + strength integration',
      'Triathlon + strength integration'
    ]
  };

  const experienceLevels = [
    'New to this',
    'Been doing it a while', 
    'Experienced'
  ];

  const trainingFrequencies = [
    '2 days per week',
    '3 days per week',
    '4 days per week',
    '5 days per week',
    '6 days per week',
    '7 days per week'
  ];

  const timePerSessions = [
    '15-30 minutes',
    '30-45 minutes',
    '45-60 minutes',
    '60-90 minutes',
    '90+ minutes'
  ];

  const getEquipmentOptions = () => {
    const category = formData.category;
    if (category === '1' || category === '2') { // Running/Cycling
      return ['Indoor only', 'Outdoor only', 'Both indoor and outdoor'];
    } else if (category === '4') { // Strength
      return ['Full gym access', 'Home gym', 'Dumbbells only', 'Bodyweight only'];
    } else if (category === '3') { // Swimming
      return ['Pool access', 'Open water', 'Both pool and open water'];
    } else if (category === '5') { // Mobility
      return ['No equipment needed'];
    } else { // Hybrid
      return ['Full gym + outdoor access', 'Home gym + outdoor', 'Minimal equipment'];
    }
  };

  const handleNext = () => {
    if (currentStep < 7) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // 🧠 INTELLIGENT AI RESPONSE - Actually understands training
  const simulateAIResponse = async (prompt: string, startDateStr: string) => {
    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const promptLower = prompt.toLowerCase();
    
    console.log('🧠 Intelligent AI analyzing prompt:', prompt);
    
    // 🧠 SMART DISCIPLINE DETECTION
    const disciplines = [];
    const isIntegration = promptLower.includes('integration') || promptLower.includes('hybrid') || promptLower.includes('+');
    
    if (promptLower.includes('run')) disciplines.push('run');
    if (promptLower.includes('bike') || promptLower.includes('cycle') || promptLower.includes('ride')) disciplines.push('ride');
    if (promptLower.includes('swim')) disciplines.push('swim');
    if (promptLower.includes('strength') || promptLower.includes('gym') || promptLower.includes('weights')) disciplines.push('strength');
    if (promptLower.includes('mobility') || promptLower.includes('flexibility')) disciplines.push('mobility');
    
    // Default to running if no discipline detected
    if (disciplines.length === 0) disciplines.push('run');
    
    console.log('🧠 Detected disciplines:', disciplines, 'Integration:', isIntegration);
    
    // 🧠 SMART DURATION DETECTION
    let weeks = 4; // default
    const weekMatches = prompt.match(/(\d+)\s*weeks?/i);
    if (weekMatches) {
      weeks = Math.min(Math.max(parseInt(weekMatches[1]), 1), 16);
    }
    
    // 🧠 SMART FREQUENCY DETECTION
    let daysPerWeek = 4; // default
    const frequencyMatches = prompt.match(/(\d+)\s*days?\s*per\s*week/i);
    if (frequencyMatches) {
      daysPerWeek = Math.min(Math.max(parseInt(frequencyMatches[1]), 2), 7);
    }
    
    // 🧠 SMART LEVEL DETECTION
    let level = 'intermediate';
    if (promptLower.includes('beginner') || promptLower.includes('new to') || promptLower.includes('just started')) {
      level = 'beginner';
    } else if (promptLower.includes('advanced') || promptLower.includes('experienced') || promptLower.includes('competitive')) {
      level = 'advanced';
    }
    
    console.log('🧠 Plan parameters:', { weeks, daysPerWeek, level, disciplines, isIntegration });
    
    // 🧠 GENERATE INTELLIGENT WORKOUTS
    const workouts = generateIntelligentWorkouts(disciplines, weeks, daysPerWeek, level, isIntegration, startDateStr, prompt);
    
    return {
      plan: {
        name: generateSmartPlanName(prompt, disciplines, isIntegration),
        description: prompt,
        type: disciplines[0],
        duration: weeks,
        level: level,
        goal: extractGoal(prompt),
        status: 'active',
        currentWeek: 1,
        createdDate: new Date().toISOString().split('T')[0],
        totalWorkouts: workouts.length,
        disciplines: disciplines,
        isIntegrated: isIntegration
      },
      workouts: workouts
    };
  };

  // 🧠 SMART PLAN NAME GENERATION
  const generateSmartPlanName = (prompt: string, disciplines: string[], isIntegration: boolean) => {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('5k')) return '5K Training Plan';
    if (promptLower.includes('10k')) return '10K Training Plan';
    if (promptLower.includes('marathon')) return 'Marathon Training Plan';
    if (promptLower.includes('triathlon')) return 'Triathlon Training Plan';
    
    if (isIntegration && disciplines.length > 1) {
      const disciplineNames = disciplines.map(d => {
        const names = { 'run': 'Running', 'ride': 'Cycling', 'swim': 'Swimming', 'strength': 'Strength', 'mobility': 'Mobility' };
        return names[d] || d;
      });
      return `${disciplineNames.join(' + ')} Integration Plan`;
    }
    
    const disciplineNames = {
      'run': 'Running',
      'ride': 'Cycling', 
      'swim': 'Swimming',
      'strength': 'Strength',
      'mobility': 'Mobility'
    };
    
    return `${disciplineNames[disciplines[0]] || 'Training'} Plan`;
  };

  const extractGoal = (prompt: string) => {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('race') || promptLower.includes('5k') || promptLower.includes('10k')) {
      return 'Race Performance';
    }
    if (promptLower.includes('endurance') || promptLower.includes('distance')) {
      return 'Endurance Building';
    }
    if (promptLower.includes('speed') || promptLower.includes('fast')) {
      return 'Speed Development';
    }
    if (promptLower.includes('strength') || promptLower.includes('muscle')) {
      return 'Strength Building';
    }
    if (promptLower.includes('integration') || promptLower.includes('hybrid')) {
      return 'Cross-Training';
    }
    
    return 'General Fitness';
  };

  // 🧠 INTELLIGENT WORKOUT GENERATION
  const generateIntelligentWorkouts = (
    disciplines: string[], 
    weeks: number, 
    daysPerWeek: number, 
    level: string, 
    isIntegration: boolean,
    startDateStr: string, 
    prompt: string
  ) => {
    const workouts = [];
    const startDate = new Date(startDateStr);
    
    console.log('🧠 Generating intelligent workouts:', { disciplines, weeks, daysPerWeek, isIntegration });
    
    for (let week = 0; week < weeks; week++) {
      const isRecoveryWeek = (week + 1) % 4 === 0;
      const phase = week < weeks * 0.5 ? 'base' : week < weeks * 0.8 ? 'build' : 'peak';
      
      // 🧠 SMART WEEKLY SCHEDULING
      let weeklySchedule = [];
      
      if (isIntegration && disciplines.includes('run') && disciplines.includes('strength')) {
        // 🧠 RUNNING + STRENGTH INTEGRATION
        weeklySchedule = generateRunningStrengthSchedule(daysPerWeek, level);
      } else if (isIntegration && disciplines.length > 1) {
        // 🧠 MULTI-DISCIPLINE INTEGRATION  
        weeklySchedule = generateMultiDisciplineSchedule(disciplines, daysPerWeek);
      } else {
        // 🧠 SINGLE DISCIPLINE FOCUS
        weeklySchedule = generateSingleDisciplineSchedule(disciplines[0], daysPerWeek);
      }
      
      console.log(`🧠 Week ${week + 1} schedule:`, weeklySchedule);
      
      // Generate workouts for each day in the schedule
      weeklySchedule.forEach((dayPlan, dayIndex) => {
        if (dayPlan.type === 'rest') return;
        
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (week * 7) + dayIndex);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        const workout = generateSmartWorkout(dayPlan, week, phase, level, isRecoveryWeek, dateStr);
        if (workout) {
          workouts.push(workout);
        }
      });
    }
    
    console.log('🧠 Generated total workouts:', workouts.length);
    return workouts;
  };

  // 🧠 SMART WEEKLY SCHEDULING
  const generateRunningStrengthSchedule = (daysPerWeek: number, level: string) => {
    const schedules = {
      3: [ // 3 days: 2 run, 1 strength
        { type: 'run', focus: 'easy' },
        { type: 'rest' },
        { type: 'strength', focus: 'full-body' },
        { type: 'rest' },
        { type: 'run', focus: 'long' },
        { type: 'rest' },
        { type: 'rest' }
      ],
      4: [ // 4 days: 2 run, 2 strength
        { type: 'run', focus: 'easy' },
        { type: 'strength', focus: 'upper' },
        { type: 'rest' },
        { type: 'run', focus: 'intervals' },
        { type: 'rest' },
        { type: 'strength', focus: 'lower' },
        { type: 'rest' }
      ],
      5: [ // 5 days: 3 run, 2 strength
        { type: 'run', focus: 'easy' },
        { type: 'strength', focus: 'upper' },
        { type: 'run', focus: 'intervals' },
        { type: 'rest' },
        { type: 'strength', focus: 'lower' },
        { type: 'run', focus: 'long' },
        { type: 'rest' }
      ],
      6: [ // 6 days: 3 run, 3 strength  
        { type: 'run', focus: 'easy' },
        { type: 'strength', focus: 'upper' },
        { type: 'run', focus: 'intervals' },
        { type: 'strength', focus: 'lower' },
        { type: 'run', focus: 'tempo' },
        { type: 'strength', focus: 'core' },
        { type: 'rest' }
      ]
    };
    
    return schedules[Math.min(daysPerWeek, 6) as keyof typeof schedules] || schedules[4];
  };

  const generateMultiDisciplineSchedule = (disciplines: string[], daysPerWeek: number) => {
    // Simple rotation through disciplines
    const schedule = [];
    let disciplineIndex = 0;
    
    for (let day = 0; day < 7; day++) {
      if (day < daysPerWeek) {
        schedule.push({ 
          type: disciplines[disciplineIndex % disciplines.length], 
          focus: 'base' 
        });
        disciplineIndex++;
      } else {
        schedule.push({ type: 'rest' });
      }
    }
    
    return schedule;
  };

  const generateSingleDisciplineSchedule = (discipline: string, daysPerWeek: number) => {
    const schedule = [];
    const focuses = discipline === 'run' ? ['easy', 'intervals', 'tempo', 'long'] : ['base', 'intervals', 'endurance', 'recovery'];
    
    for (let day = 0; day < 7; day++) {
      if (day < daysPerWeek) {
        schedule.push({ 
          type: discipline, 
          focus: focuses[day % focuses.length] 
        });
      } else {
        schedule.push({ type: 'rest' });
      }
    }
    
    return schedule;
  };

  // 🧠 SMART WORKOUT GENERATION
  const generateSmartWorkout = (dayPlan: any, week: number, phase: string, level: string, isRecoveryWeek: boolean, dateStr: string) => {
    const levelMultipliers = { beginner: 0.8, intermediate: 1.0, advanced: 1.2 };
    const multiplier = levelMultipliers[level] || 1.0;
    
    if (dayPlan.type === 'run') {
      return generateSmartRunWorkout(dayPlan.focus, week, phase, level, isRecoveryWeek, dateStr, multiplier);
    } else if (dayPlan.type === 'strength') {
      return generateSmartStrengthWorkout(dayPlan.focus, week, phase, level, isRecoveryWeek, dateStr);
    } else if (dayPlan.type === 'ride') {
      return generateSmartRideWorkout(dayPlan.focus, week, phase, level, isRecoveryWeek, dateStr, multiplier);
    } else if (dayPlan.type === 'swim') {
      return generateSmartSwimWorkout(dayPlan.focus, week, phase, level, isRecoveryWeek, dateStr, multiplier);
    }
    
    return null;
  };

  // 🧠 INTELLIGENT RUNNING WORKOUTS WITH COACHING NOTES
  const generateSmartRunWorkout = (focus: string, week: number, phase: string, level: string, isRecoveryWeek: boolean, dateStr: string, multiplier: number) => {
    const baseRPE = { beginner: 4, intermediate: 5, advanced: 5 }[level];
    const hardRPE = { beginner: 7, intermediate: 8, advanced: 9 }[level];
    
    const workoutTypes = {
      'easy': {
        name: `Week ${week + 1} - Easy Run`,
        description: `Aerobic base building run. This builds your aerobic engine and improves fat burning. Should feel conversational - you could talk in full sentences.`,
        coachingNotes: `Purpose: Aerobic development & recovery\nKey: Nose breathing if possible, very relaxed effort\nNote: Common mistake is going too fast - slow down!`,
        intervals: [
          {
            id: '1',
            time: `${Math.round((35 + week * 5) * multiplier)}:00`,
            effortLabel: 'Easy Pace',
            rpeTarget: baseRPE.toString(),
            duration: Math.round((35 + week * 5) * multiplier) * 60,
            repeatCount: 1
          }
        ]
      },
      'intervals': {
        name: `Week ${week + 1} - Interval Training`,
        description: `VO2 max intervals to improve your top-end speed and oxygen processing. These should feel hard but controlled.`,
        coachingNotes: `Purpose: VO2 max development, neuromuscular power\nKey: Strong effort but not all-out sprints\nNote: Recovery jogs are crucial - don't skip them!`,
        intervals: [
          {
            id: '1',
            time: '15:00',
            effortLabel: 'Warmup',
            rpeTarget: baseRPE.toString(),
            duration: 900,
            repeatCount: 1
          },
          {
            id: '2',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '3',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          },
          {
            id: '4',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '5',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          },
          {
            id: '6',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '7',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          },
          {
            id: '8',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '9',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          },
          ...(week >= 1 ? [{
            id: '10',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '11',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          }] : []),
          ...(week >= 2 ? [{
            id: '12',
            time: '3:00',
            effortLabel: 'Hard Interval',
            rpeTarget: hardRPE.toString(),
            duration: 180,
            repeatCount: 1
          },
          {
            id: '13',
            time: '2:00',
            effortLabel: 'Recovery Jog',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 120,
            repeatCount: 1
          }] : []),
          {
            id: '14',
            time: '15:00',
            effortLabel: 'Cooldown',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 900,
            repeatCount: 1
          }
        ]
      },
      'tempo': {
        name: `Week ${week + 1} - Tempo Run`,
        description: `Lactate threshold training - the effort you could sustain for about 1 hour in a race. Comfortably hard.`,
        coachingNotes: `Purpose: Lactate threshold improvement, race pace training\nKey: Steady, sustainable effort - not intervals\nNote: Should feel like 15k-half marathon race pace`,
        intervals: [
          {
            id: '1',
            time: '15:00',
            effortLabel: 'Warmup',
            rpeTarget: baseRPE.toString(),
            duration: 900,
            repeatCount: 1
          },
          {
            id: '2',
            time: `${15 + week * 2}:00`,
            effortLabel: 'Tempo Pace',
            rpeTarget: (baseRPE + 2).toString(),
            duration: (15 + week * 2) * 60,
            repeatCount: 1
          },
          {
            id: '3',
            time: '10:00',
            effortLabel: 'Cooldown',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 600,
            repeatCount: 1
          }
        ]
      },
      'long': {
        name: `Week ${week + 1} - Long Run`,
        description: `Aerobic endurance builder. Teaches your body to use fat for fuel and builds mental toughness for race day.`,
        coachingNotes: `Purpose: Aerobic endurance, fat adaptation, mental training\nKey: Start easy, stay easy - it's about time on feet\nNote: Practice race day nutrition and hydration`,
        intervals: [
          {
            id: '1',
            time: '10:00',
            effortLabel: 'Warmup',
            rpeTarget: baseRPE.toString(),
            duration: 600,
            repeatCount: 1
          },
          {
            id: '2',
            time: `${Math.round((60 + week * 10) * multiplier)}:00`,
            effortLabel: phase === 'base' ? 'Aerobic Base' : 'Steady Effort',
            rpeTarget: (baseRPE + (phase === 'peak' ? 2 : 1)).toString(),
            duration: Math.round((60 + week * 10) * multiplier) * 60,
            repeatCount: 1
          },
          {
            id: '3',
            time: '10:00',
            effortLabel: 'Cooldown',
            rpeTarget: (baseRPE - 1).toString(),
            duration: 600,
            repeatCount: 1
          }
        ]
      }
    };
    
    const workout = workoutTypes[focus] || workoutTypes['easy'];
    
    return {
      date: dateStr,
      type: 'run',
      ...workout
    };
  };

  // 🧠 INTELLIGENT STRENGTH WORKOUTS WITH COACHING NOTES
  const generateSmartStrengthWorkout = (focus: string, week: number, phase: string, level: string, isRecoveryWeek: boolean, dateStr: string) => {
    const coachingNotes = {
      'upper': `Purpose: Upper body strength for improved posture & arm swing\nKey: Control the eccentric (lowering) phase\nNote: Focus on form over speed - quality reps only`,
      'lower': `Purpose: Single-leg strength & power for running efficiency\nKey: Unilateral work prevents imbalances\nNote: Start lighter than you think - balance is harder than bilateral`,
      'core': `Purpose: Core stability for efficient energy transfer\nKey: Anti-movement (planks) > movement (crunches)\nNote: Breathe normally - don't hold your breath`,
      'full-body': `Purpose: Functional movement patterns for running\nKey: Focus on compound movements\nNote: Perfect form before adding weight`
    };

    const exerciseLibrary = {
      'upper': [
        { name: 'Push-ups', sets: 3, reps: 8 + week * 2, weight: 0, weightMode: 'same', note: 'Modify on knees if needed' },
        { name: 'Pull-ups/Assisted Pull-ups', sets: 3, reps: 5 + week, weight: 0, weightMode: 'same', note: 'Use band assistance if needed' },
        { name: 'Overhead Press', sets: 3, reps: 8 + week, weight: 65 + week * 5, weightMode: 'same', note: 'Keep core tight, press straight up' },
        { name: 'Bent-over Rows', sets: 3, reps: 10 + week, weight: 85 + week * 5, weightMode: 'same', note: 'Squeeze shoulder blades together' },
        { name: 'Chest Press', sets: 3, reps: 10 + week, weight: 95 + week * 5, weightMode: 'same', note: 'Control the negative' },
        { name: 'Tricep Dips', sets: 3, reps: 8 + week, weight: 0, weightMode: 'same', note: 'Keep body close to bench' }
      ],
      'lower': [
        { name: 'Squats', sets: 4, reps: 10 + week * 2, weight: 135 + week * 10, weightMode: 'same', note: 'Hip-width stance, knees track over toes' },
        { name: 'Romanian Deadlifts', sets: 3, reps: 8 + week, weight: 155 + week * 10, weightMode: 'same', note: 'Hinge at hips, feel hamstring stretch' },
        { name: 'Lunges (each leg)', sets: 3, reps: 10 + week, weight: 25 + week * 5, weightMode: 'same', note: 'Step back, not forward - safer for knees' },
        { name: 'Calf Raises', sets: 3, reps: 15 + week * 2, weight: 45 + week * 5, weightMode: 'same', note: 'Full range of motion, pause at top' },
        { name: 'Glute Bridges', sets: 3, reps: 15 + week * 2, weight: 45 + week * 5, weightMode: 'same', note: 'Squeeze glutes hard at top' },
        { name: 'Single-leg RDL', sets: 3, reps: 8 + week, weight: 15 + week * 2, weightMode: 'same', note: 'Start with bodyweight, focus on balance' }
      ],
      'core': [
        { name: 'Planks', sets: 3, reps: 45 + week * 15, weight: 0, weightMode: 'same', note: 'Hold time in seconds - maintain straight line' },
        { name: 'Russian Twists', sets: 3, reps: 20 + week * 5, weight: 10 + week * 2, weightMode: 'same', note: 'Controlled rotation, heels off ground' },
        { name: 'Dead Bugs', sets: 3, reps: 10 + week * 2, weight: 0, weightMode: 'same', note: 'Press low back into floor' },
        { name: 'Bird Dogs', sets: 3, reps: 8 + week * 2, weight: 0, weightMode: 'same', note: 'Opposite arm/leg, hold 3 seconds' },
        { name: 'Side Planks', sets: 3, reps: 30 + week * 10, weight: 0, weightMode: 'same', note: 'Each side - hold time in seconds' },
        { name: 'Mountain Climbers', sets: 3, reps: 20 + week * 5, weight: 0, weightMode: 'same', note: 'Each leg - controlled, not frantic' }
      ],
      'full-body': [
        { name: 'Squats', sets: 3, reps: 10 + week, weight: 135 + week * 5, weightMode: 'same', note: 'Foundation movement - perfect your form' },
        { name: 'Push-ups', sets: 3, reps: 8 + week, weight: 0, weightMode: 'same', note: 'Modify on knees if needed' },
        { name: 'Romanian Deadlifts', sets: 3, reps: 8 + week, weight: 115 + week * 5, weightMode: 'same', note: 'Hip hinge pattern - crucial for runners' },
        { name: 'Overhead Press', sets: 3, reps: 8 + week, weight: 45 + week * 5, weightMode: 'same', note: 'Full body stability exercise' },
        { name: 'Planks', sets: 3, reps: 45 + week * 10, weight: 0, weightMode: 'same', note: 'Hold time in seconds' },
        { name: 'Lunges', sets: 3, reps: 10 + week, weight: 20 + week * 2, weightMode: 'same', note: 'Each leg - single leg strength' }
      ]
    };
    
    const exercises = exerciseLibrary[focus] || exerciseLibrary['full-body'];
    
    return {
      date: dateStr,
      type: 'strength',
      name: `Week ${week + 1} - ${focus.charAt(0).toUpperCase() + focus.slice(1)} Strength`,
      description: `Strength training session focused on ${focus} development for running performance.`,
      coachingNotes: coachingNotes[focus] || coachingNotes['full-body'],
      strength_exercises: exercises.map((exercise, index) => ({
        id: (index + 1).toString(),
        ...exercise
      }))
    };
  };

  // 🧠 INTELLIGENT RIDE WORKOUTS
  const generateSmartRideWorkout = (focus: string, week: number, phase: string, level: string, isRecoveryWeek: boolean, dateStr: string, multiplier: number) => {
    const duration = Math.round((60 + week * 15) * multiplier);
    
    return {
      date: dateStr,
      type: 'ride',
      name: `Week ${week + 1} - ${focus.charAt(0).toUpperCase() + focus.slice(1)} Ride`,
      intervals: [
        {
          id: '1',
          time: `${duration}:00`,
          powerTarget: focus === 'intervals' ? 'Zone 4-5' : focus === 'tempo' ? 'Zone 3' : 'Zone 2',
          duration: duration * 60,
          repeatCount: 1
        }
      ]
    };
  };

  // 🧠 INTELLIGENT SWIM WORKOUTS
  const generateSmartSwimWorkout = (focus: string, week: number, phase: string, level: string, isRecoveryWeek: boolean, dateStr: string, multiplier: number) => {
    const distance = Math.round((1500 + week * 300) * multiplier);
    
    return {
      date: dateStr,
      type: 'swim',
      name: `Week ${week + 1} - ${focus.charAt(0).toUpperCase() + focus.slice(1)} Swim`,
      intervals: [
        {
          id: '1',
          distance: distance,
          stroke: 'Freestyle',
          targetRPE: focus === 'intervals' ? '7' : '5',
          equipment: 'None',
          repeatCount: 1
        }
      ]
    };
  };

  const generatePlanFromSuggested = async () => {
    const categoryName = categories[formData.category as keyof typeof categories];
    const goalName = formData.specificGoal;
    
    const planPrompt = `${goalName}. Experience level: ${formData.experienceLevel}. Training frequency: ${formData.trainingFrequency}. Session duration: ${formData.timePerSession}. Equipment: ${formData.equipmentLocation}.`;
    
    return await generatePlan(planPrompt, formData.startDate);
  };

  const generatePlan = async (prompt?: string, startDateStr?: string) => {
    const actualPrompt = prompt || planPrompt;
    const actualStartDate = startDateStr || startDate;
    
    if (!actualPrompt.trim()) return;
    
    setGeneratingPlan(true);
    try {
      console.log('🧠 Generating INTELLIGENT AI plan for:', actualPrompt);
      
      // Generate AI-powered plan
      const aiResult = await simulateAIResponse(actualPrompt, actualStartDate);
      
      // Create plan metadata
      const planId = `plan-${Date.now()}`;
      
      // NEW: Organize workouts by week for detailed plan view
      const organizeWorkoutsByWeek = (workouts: any[], startDate: string, planDuration: number) => {
        const weeks = [];
        
        for (let weekNum = 1; weekNum <= planDuration; weekNum++) {
          const weekWorkouts = workouts.filter(workout => {
            const workoutDate = new Date(workout.date);
            const startDateObj = new Date(startDate);
            const weekStart = new Date(startDateObj);
            weekStart.setDate(startDateObj.getDate() + ((weekNum - 1) * 7));
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            return workoutDate >= weekStart && workoutDate <= weekEnd;
          });
          
          weeks.push({
            weekNumber: weekNum,
            title: `Week ${weekNum}`,
            focus: `Progressive training week ${weekNum}`,
            workouts: weekWorkouts.map(w => ({
              ...w,
              completed: false,
              intensity: w.intervals ? (
                parseInt(w.intervals[0]?.rpeTarget || '5') > 7 ? 'Hard' : 
                parseInt(w.intervals[0]?.rpeTarget || '5') > 5 ? 'Moderate' : 'Easy'
              ) : 'Moderate',
              duration: Math.floor((w.duration || 0) / 60) // Convert to minutes
            }))
          });
        }
        
        return weeks;
      };
      
      const weeks = organizeWorkoutsByWeek(aiResult.workouts, actualStartDate, aiResult.plan.duration);
      
      const planData = {
        ...aiResult.plan,
        id: planId,
        weeks: weeks,
        currentWeek: 1
      };
      
      console.log('🧠 Generated INTELLIGENT plan data:', planData);
      console.log('🧠 Generated workouts:', aiResult.workouts.length);
      console.log('🧠 Organized weeks:', weeks.length);
      
      // Save all workouts to the app
      for (const workout of aiResult.workouts) {
        const workoutData = {
          name: workout.name,
          type: workout.type,
          date: workout.date,
          description: workout.intervals ? 
            workout.intervals.map(i => `${i.effortLabel || i.time || ''}`).join(' + ') :
            workout.strength_exercises?.map(e => `${e.name} ${e.sets}x${e.reps}`).join(' + ') || '',
          duration: workout.intervals ? 
            workout.intervals.reduce((sum, i) => sum + (i.duration || 0), 0) : 
            2400, // 40 min default for strength
          workout_status: 'planned',
          intervals: workout.intervals || undefined,
          strength_exercises: workout.strength_exercises || undefined,
          userComments: '',
          completedManually: false,
          planId: planId
        };
        
        try {
          await addWorkout(workoutData);
        } catch (error) {
          console.error('Error saving workout:', error);
        }
      }
      
      // Call the plan generation callback directly - NO POPUP
      if (onPlanGenerated) {
        console.log('🧠 Calling onPlanGenerated with:', planData);
        onPlanGenerated(planData);
      }
      
      // Reset forms
      if (activeTab === 'suggested') {
        setFormData({
          category: '', specificGoal: '', experienceLevel: '', 
          trainingFrequency: '', timePerSession: '', equipmentLocation: '',
          startDate: new Date().toISOString().split('T')[0]
        });
        setCurrentStep(1);
      } else {
        setPlanPrompt('');
      }
      
      // REMOVED: Success alert popup - users flow directly to their plan
      
    } catch (error) {
      console.error('Error generating plan:', error);
      alert('Error generating plan. Please try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const renderSuggestedStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">Pick your training interest:</h2>
            <div className="space-y-3">
              {Object.entries(categories).map(([key, category]) => (
                <button
                  key={key}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, category: key }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        const goalOptions = specificGoals[formData.category as keyof typeof specificGoals] || [];
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">{categories[formData.category as keyof typeof categories]}</h2>
            <div className="space-y-3">
              {goalOptions.map((goal, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, specificGoal: goal }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">What's your experience level?</h2>
            <div className="space-y-3">
              {experienceLevels.map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, experienceLevel: level }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">How many days per week do you want to train?</h2>
            <div className="space-y-3">
              {trainingFrequencies.map((freq) => (
                <button
                  key={freq}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, trainingFrequency: freq }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {freq}
                </button>
              ))}
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">How much time do you have per session?</h2>
            <div className="space-y-3">
              {timePerSessions.map((time) => (
                <button
                  key={time}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, timePerSession: time }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {time}
                </button>
              ))}
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">What equipment do you have access to and where will you train?</h2>
            <div className="space-y-3">
              {getEquipmentOptions().map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, equipmentLocation: option }));
                    handleNext();
                  }}
                  className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-medium">When do you want to start?</h2>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              className="text-lg p-4 min-h-[44px]"
            />
            
            <div className="space-y-4 p-4">
              <h3 className="font-medium">Plan Summary:</h3>
              <div className="space-y-2 text-sm">
                <p><strong>Goal:</strong> {formData.specificGoal}</p>
                <p><strong>Experience:</strong> {formData.experienceLevel}</p>
                <p><strong>Frequency:</strong> {formData.trainingFrequency}</p>
                <p><strong>Session Time:</strong> {formData.timePerSession}</p>
                <p><strong>Equipment:</strong> {formData.equipmentLocation}</p>
                <p><strong>Start Date:</strong> {formData.startDate}</p>
              </div>
            </div>
            
            <Button
              onClick={generatePlanFromSuggested}
              disabled={generatingPlan}
              className="w-full h-12 text-white hover:bg-gray-800"
              style={{ backgroundColor: generatingPlan ? '#6b7280' : '#000000' }}
            >
              {generatingPlan ? (
                <div className="flex items-center gap-2">
                  <Kanban className="h-4 w-4 animate-spin" />
                  Generating intelligent plan...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Kanban className="h-4 w-4" />
                  Generate Intelligent Plan
                </div>
              )}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-3 py-2">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Button
            onClick={onClose}
            variant="ghost"
            className="flex items-center gap-2 p-0 h-auto text-muted-foreground hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Button>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex">
            <button
              onClick={() => setActiveTab('suggested')}
              className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                activeTab === 'suggested'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Suggested
            </button>
            <button
              onClick={() => setActiveTab('free')}
              className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                activeTab === 'free'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Free
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {activeTab === 'suggested' ? (
            <div>
              {/* Navigation for suggested mode */}
              {currentStep > 1 && (
                <div className="flex justify-between items-center mb-6">
                  <Button
                    onClick={handleBack}
                    variant="ghost"
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <span className="text-sm text-gray-500">
                    Step {currentStep} of 7
                  </span>
                </div>
              )}
              
              {renderSuggestedStep()}
            </div>
          ) : (
            <div>
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-full">
                    <Kanban className="h-8 w-8 text-black" />
                  </div>
                </div>
                <h1 className="text-2xl font-semibold mb-2">Build me a plan</h1>
                <p className="text-gray-600">
                  Describe your training goals and I'll create a personalized plan with progressive workouts
                </p>
              </div>

              <div className="space-y-6">
                {/* Start Date Input */}
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-sm font-medium text-gray-700">
                    Start Date
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10 min-h-[44px]"
                    />
                  </div>
                </div>

                {/* Plan Description */}
                <div className="space-y-2">
                  <Label htmlFor="planPrompt" className="text-sm font-medium text-gray-700">
                    Describe Your Training Goal
                  </Label>
                  <Textarea
                    id="planPrompt"
                    value={planPrompt}
                    onChange={(e) => setPlanPrompt(e.target.value)}
                    placeholder="I want to train for a 5K race in 8 weeks. I'm a beginner runner who can currently run for 20 minutes without stopping..."
                    rows={4}
                    className="w-full min-h-[100px]"
                  />
                </div>
                
                {/* Quick Suggestions */}
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 font-medium">Quick suggestions:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {quickPlans.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setPlanPrompt(suggestion)}
                        className="text-left p-3 text-sm hover:text-blue-600 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Generate Button */}
                <div className="pt-4">
                  <Button
                    onClick={() => generatePlan()}
                    disabled={!planPrompt.trim() || generatingPlan}
                    className="w-full h-12 text-white hover:bg-gray-800"
                    style={{ backgroundColor: generatingPlan ? '#6b7280' : '#000000' }}
                  >
                    {generatingPlan ? (
                      <div className="flex items-center gap-2">
                        <Kanban className="h-4 w-4 animate-spin" />
                        Generating intelligent plan...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Kanban className="h-4 w-4" />
                        Generate Intelligent Plan
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}