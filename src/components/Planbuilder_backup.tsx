import React, { useState } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';

// Import the existing RealTrainingAI service
import { RealTrainingAI } from '../services/RealTrainingAI';

// Updated assessment interface for the correct question order
interface Assessment {
  focus: string;
  age: number;
  currentFitness: string;
  benchmarks: {
    running?: string | string[];
    cycling?: string | string[];
    swimming?: string | string[];
    strength?: string | string[];
  };
  triathlonDistance?: string; 
  injuryHistory: string;
  injuryDetails?: {
    hasInjuries: boolean;
    bodyRegions: string[];
    specificInjuries: {
      [region: string]: {
        type: string;
        timeline: string;
        severity: string;
        cause: string;
        painLevel: {
          rest: number;
          light: number;
          moderate: number;
        };
        medicalStatus: string;
        limitations: string;
        helpful: string;
      };
    };
  };
  triathlonStrength?: string;
  singleDisciplineStrength?: string;
  hybridStrength?: string;
  goal: string;
  timeline: string;
  eventDetails?: string;
  eventCategory?: string;
  eventType?: string;
  eventDate?: string;
  courseDetails?: {
    elevationGain: string;
    courseProfile: string;
    surfaceType: string;
    climate: string;
    technicalDifficulty: string;
    courseDescription?: string;
    hasSpecificCourse: boolean;
  };
  daysPerWeek: string;
  weekdayTime: string;
  weekendTime: string;
  trainingBackground: string;
  equipment: {
    running?: string[];
    cycling?: string[];
    swimming?: string[];
    strength?: string[];
  };
  // Specific performance numbers
  performanceNumbers: {
    ftp?: number;
    swimPace?: string; // "1:25" format
    squat?: number;
    deadlift?: number;
    bench?: number;
    runningPaces?: {
      fiveK?: string;
      tenK?: string;
      halfMarathon?: string;
      marathon?: string;
    };
  };
}

// Quick plan suggestions for manual tab
const quickPlans = [
  "Build me a 30-minute easy run for recovery",
  "Create a 5K training plan over 6 weeks", 
  "I want a 45-minute bike ride with intervals",
  "Design a full-body strength workout",
  "Give me a 2000m swim workout",
  "Build me a 4-week marathon training plan",
  "Create a 12-week triathlon program",
  "I need a strength plan for runners",
  "Design a 2-week taper for my race",
  "Create interval training for speed"
];

export default function PlanBuilder() {
  const [realAI] = useState(() => new RealTrainingAI());

  // Tab management
  const [activeTab, setActiveTab] = useState<'assessment' | 'manual'>('assessment');
  
  // Assessment tab state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Assessment>({
    focus: '',
    age: 0,
    currentFitness: '',
    benchmarks: {},
    triathlonDistance: '',
    injuryHistory: '',
    injuryDetails: {
      hasInjuries: false,
      bodyRegions: [],
      specificInjuries: {}
    },
    triathlonStrength: '',
    singleDisciplineStrength: '',
    hybridStrength: '',
    goal: '',
    timeline: '',
    eventDetails: '',
    eventCategory: '',
    eventType: '',
    eventDate: '',
    courseDetails: {
      elevationGain: '',
      courseProfile: '',
      surfaceType: '',
      climate: '',
      technicalDifficulty: '',
      courseDescription: '',
      hasSpecificCourse: false
    },
    daysPerWeek: '', 
    weekdayTime: '',
    weekendTime: '',
    trainingBackground: '',
    equipment: {},
    performanceNumbers: {}
  });
  const [selectedEventCategory, setSelectedEventCategory] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [currentCourseStep, setCurrentCourseStep] = useState(0);
  const [textInput, setTextInput] = useState('');
  
  // Manual tab state
  const [planPrompt, setPlanPrompt] = useState('');
  
  // Shared state
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);

  // Time options for ultra-capable training
  const TIME_OPTIONS = [
    '30 minutes',
    '45 minutes', 
    '1 hour',
    '1.5 hours',
    '2 hours',
    '2.5 hours',
    '3 hours',
    '4 hours',
    '5 hours',
    '6 hours',
    '7 hours',
    '8+ hours'
  ];

  // Helper function to check both string and array benchmarks
  const containsValue = (field: string | string[] | undefined, value: string): boolean => {
    if (!field) return false;
    if (Array.isArray(field)) {
      return field.some(item => item.includes(value));
    }
    return field.includes(value);
  };

  // FIXED: Assessment questions in correct order - Discipline → Age → Fitness → Benchmarks → Injuries → Strength → Goals → Timeline → Events → Frequency → Time → Background → Equipment
  const ASSESSMENT_QUESTIONS = [
    {
      id: 'focus',
      text: "What's your primary focus?",
      options: [
        "Running",
        "Cycling", 
        "Swimming",
        "Strength Training",
        "Triathlon",
        "Hybrid"
      ]
    },
    {
      id: 'age',
      text: "What's your age?",
      type: 'number',
      placeholder: "Enter your age"
    },
    {
      id: 'currentFitness', 
      text: "How would you describe your current fitness?",
      options: [
        "Complete beginner - get winded easily",
        "Some fitness - can exercise 20-30 minutes", 
        "Pretty fit - regular exerciser",
        "Very fit - train consistently",
        "Competitive athlete level"
      ]
    },
    // Benchmark question (dynamic based on focus)
    null, // Will be generated dynamically
    {
      id: 'injuryHistory',
      text: "Any current injuries, pain, or physical limitations?",
      options: [
        "No current injuries or limitations",
        "Minor aches/pains but can train normally",
        "Previous injury - need to avoid certain movements",
        "Current injury - working around limitations"
      ]
    },
    {
      id: 'injuryBodyRegions',
      text: "Which areas of your body are affected? (Select all that apply)",
      type: 'multiSelect',
      options: [
        "Head/Neck/Cervical spine",
        "Shoulder (Left)",
        "Shoulder (Right)", 
        "Elbow/Forearm (Left)",
        "Elbow/Forearm (Right)",
        "Wrist/Hand (Left)",
        "Wrist/Hand (Right)",
        "Chest/Ribs",
        "Upper back/Thoracic spine",
        "Lower back/Lumbar spine",
        "Hip/Pelvis (Left)",
        "Hip/Pelvis (Right)",
        "Thigh/Quad/Hamstring (Left)",
        "Thigh/Quad/Hamstring (Right)",
        "Knee (Left)",
        "Knee (Right)",
        "Calf/Shin (Left)",
        "Calf/Shin (Right)",
        "Ankle/Foot (Left)",
        "Ankle/Foot (Right)"
      ],
      condition: (answers: Assessment) => answers.injuryHistory !== "No current injuries or limitations"
    },
    {
      id: 'singleDisciplineStrength',
      text: "Do you want to add strength training to your training plan?",
      options: [
        "No strength training",
        "Injury prevention focus (functional movements, stability)",
        "Power development (heavier loads, lower reps for force)",
        "Sport-specific functional (movements that enhance your discipline)",
        "Build muscle (moderate reps, higher volume)",
        "General fitness"
      ],
      condition: (answers: Assessment) => ['Running', 'Cycling', 'Swimming'].includes(answers.focus)
    },
    {
      id: 'triathlonStrength',
      text: "Do you want to add strength training to your triathlon plan?",
      options: [
        "No strength training",
        "Injury prevention focus (functional movements, stability)",
        "Power development (heavier loads, lower reps for force)",
        "Sport-specific functional (movements that enhance swim/bike/run)",
        "Build muscle (moderate reps, higher volume)",
        "General fitness"
      ],
      condition: (answers: Assessment) => answers.focus === "Triathlon"
    },
    {
      id: 'hybridStrength',
      text: "What's your strength training goal?",
      options: [
        "Build maximum strength (heavier loads, lower reps)",
        "Build muscle size and strength (moderate reps, higher volume)",
        "Functional strength for sports performance",
        "General fitness and injury prevention"
      ],
      condition: (answers: Assessment) => {
        if (answers.focus !== "Hybrid") return false;
        const strengthBenchmarks = answers.benchmarks.strength;
        return Array.isArray(strengthBenchmarks) && strengthBenchmarks.length > 0;
      }
    },
    {
      id: 'goal',
      text: "What's your main goal?",
      options: [
        "Get started with exercise",
        "Lose weight and get in shape", 
        "Get faster/stronger",
        "Train for specific event",
        "Maintain current fitness"
      ]
    },
    {
      id: 'timeline',
      text: "What's your training approach?",
      options: [
        "I have a specific race/event coming up",
        "4-week training blocks (3 weeks build, 1 week recover)",
        "Continuous improvement until I find an event",
        "Maintain current fitness level"
      ]
    },
    {
      id: 'eventDetails',
      text: "What specific event are you training for?",
      type: 'eventSelection',
      condition: (answers: Assessment) => answers.goal === "Train for specific event"
    },
    {
      id: 'eventDate',
      text: "When is your event?",
      type: 'date',
      condition: (answers: Assessment) => answers.goal === "Train for specific event" && answers.eventDetails
    },
    {
      id: 'courseDetails',
      text: "Tell us about the course:",
      type: 'courseAnalysis',
      condition: (answers: Assessment) => answers.goal === "Train for specific event" && answers.eventDetails
    },
    {
      id: 'daysPerWeek',
      text: "How many days per week can you train?",
      options: [
        "2-3 days",
        "4-5 days", 
        "6+ days"
      ]
    },
    {
      id: 'combinedTime',
      text: "How much time do you have for training?",
      type: 'combinedTime'
    },
    {
      id: 'trainingBackground',
      text: "What's your training background?",
      options: [
        "Brand new to structured training",
        "Returning after 6+ months off",
        "Train occasionally but inconsistently",
        "Train consistently for 6+ months",
        "Train consistently for 2+ years"
      ]
    },
    {
      id: 'equipment',
      text: "What equipment do you have access to?",
      type: 'equipment'
    }
  ];

  // Get benchmark question based on focus
  const getBenchmarkQuestion = () => {
    const focus = answers.focus;
    
    if (focus === 'Running') {
      return {
        id: 'benchmarks',
        text: "What's your current running level?",
        options: [
          "Don't know my running pace/times",
          "5K in 30+ minutes (recreational runner)",
          "5K in 25-30 minutes (fitness runner)", 
          "5K in 20-25 minutes (trained runner)",
          "5K under 20 minutes (competitive runner)",
          "I know my exact times/paces"
        ]
      };
    } else if (focus === 'Cycling') {
      return {
        id: 'benchmarks',
        text: "What's your current cycling level?",
        options: [
          "Don't track cycling speed/power",
          "Average 12-15 mph on flats (recreational)",
          "Average 16-18 mph on flats (fitness rider)",
          "Average 19-21 mph on flats (trained cyclist)", 
          "Average 22+ mph on flats (competitive cyclist)",
          "I know my FTP (watts)"
        ]
      };
    } else if (focus === 'Swimming') {
      return {
        id: 'benchmarks',
        text: "What's your current swimming level?",
        options: [
          "Don't know swimming pace/new to swimming",
          "Can swim 25 yards continuously",
          "Can swim 100 yards continuously",
          "Can swim 500+ yards continuously",
          "Competitive swimmer/masters level",
          "I know my 100-yard pace"
        ]
      };
    } else if (focus === 'Strength Training') {
      return {
        id: 'benchmarks',
        text: "What's your current strength level?",
        options: [
          "Don't know my strength levels",
          "Bodyweight movements only",
          "Can squat/deadlift around bodyweight",
          "Can squat/deadlift 1.25x bodyweight",
          "Can squat/deadlift 1.5x+ bodyweight", 
          "I know my compound 1RMs"
        ]
      };
    } else if (focus === 'Triathlon') {
      return {
        id: 'benchmarks',
        text: "What triathlon distance do you focus on?",
        type: 'triathlon',
        distanceOptions: [
          "Sprint distance (750m swim, 20km bike, 5km run)",
          "Olympic distance (1.5km swim, 40km bike, 10km run)",
          "70.3 Half Ironman (1.9km swim, 90km bike, 21km run)",
          "140.6 Full Ironman (3.8km swim, 180km bike, 42km run)",
          "Multi-distance / general triathlon fitness"
        ],
        categories: {
          swimming: [
            "Don't know swimming pace/new to swimming",
            "Can swim 500+ yards continuously",
            "Can swim 1500+ yards continuously",
            "I know my 100-yard pace"
          ],
          cycling: [
            "Don't track cycling speed/power",
            "Average 16-18 mph on flats",
            "Average 19-21 mph on flats",
            "I know my FTP (watts)"
          ],
          running: [
            "Don't know my running pace/times",
            "5K in 30+ minutes",
            "5K in 25-30 minutes",
            "5K in 20-25 minutes", 
            "5K under 20 minutes",
            "I know my exact times/paces"
          ]
        }
      };
    } else { // Hybrid
      return {
        id: 'benchmarks',
        text: "Select all disciplines you want to train and your levels:",
        type: 'hybridSelect',
        categories: {
          running: [
            "Don't know my running pace/times",
            "5K in 30+ minutes (recreational)",
            "5K in 25-30 minutes (fitness level)",
            "5K in 20-25 minutes (trained runner)", 
            "5K under 20 minutes (competitive)",
            "I know my exact times/paces"
          ],
          cycling: [
            "Don't track cycling speed/power",
            "Average 16-18 mph (fitness rider)",
            "Average 19-21 mph (trained cyclist)",
            "I know my FTP (watts)"
          ],
          swimming: [
            "Don't know swimming pace/new to swimming",
            "Can swim 500+ yards continuously",
            "Can swim 1500+ yards continuously",
            "I know my 100-yard pace"
          ],
          strength: [
            "Don't know my strength levels",
            "Can squat/deadlift around bodyweight",
            "Can squat/deadlift 1.25x+ bodyweight",
            "I know my compound 1RMs"
          ]
        }
      };
    }
  };

  // Get equipment question options with added swimming equipment
  const getEquipmentOptions = () => {
    return {
      running: [
        "Treadmill access",
        "Road running", 
        "Trail access",
        "Track access"
      ],
      cycling: [
        "Road bike",
        "Indoor trainer/smart trainer",
        "Gym stationary bikes",
        "Mountain bike"
      ],
      swimming: [
        "Pool access",
        "Open water access",
        "Paddles",
        "Pull buoy",
        "Kickboard",
        "Fins",
        "Snorkel",
        "No regular swimming access"
      ],
      strength: [
        "Full barbell + plates",
        "Adjustable dumbbells",
        "Fixed dumbbells", 
        "Squat rack or power cage",
        "Bench (flat/adjustable)",
        "Pull-up bar",
        "Kettlebells",
        "Resistance bands",
        "Cable machine/functional trainer",
        "Bodyweight only",
        "Full commercial gym access"
      ]
    };
  };

  // Get event options based on primary focus
  const getEventOptions = () => {
    const focus = answers.focus.toLowerCase();
    
    if (focus === 'running') {
      return [
        "5K",
        "10K", 
        "15K",
        "Half Marathon",
        "Marathon",
        "50K Ultra",
        "50 Mile Ultra",
        "100K Ultra",
        "100 Mile Ultra"
      ];
    } else if (focus === 'triathlon') {
      return [
        "Sprint Triathlon",
        "Olympic Triathlon", 
        "70.3 Half Ironman",
        "140.6 Full Ironman",
        "Ultra Distance Triathlon"
      ];
    } else if (focus === 'cycling') {
      return [
        "Time Trial",
        "Road Race",
        "Criterium",
        "Gran Fondo",
        "Century Ride",
        "Gravel Race",
        "Stage Race",
        "Hill Climb"
      ];
    } else if (focus === 'swimming') {
      return [
        "Open Water Swim",
        "Pool Competition",
        "Masters Meet"
      ];
    } else {
      // For Strength Training or Hybrid, show general options
      return [
        "Powerlifting Competition",
        "CrossFit Competition",
        "Obstacle Race (Spartan, Tough Mudder)",
        "General Fitness Goal"
      ];
    }
  };
  const getElevationGainOptions = () => {
    const options = [];
    for (let i = 0; i <= 20000; i += 500) {
      if (i === 0) options.push("0-500 feet");
      else if (i === 20000) options.push("20,000+ feet");
      else options.push(`${i.toLocaleString()}-${(i + 500).toLocaleString()} feet`);
    }
    return options;
  };

  const getCourseDetailOptions = () => {
    return {
      courseProfile: [
        "Flat/Rolling",
        "Hilly",
        "Mountainous",
        "Mixed terrain"
      ],
      surfaceType: [
        "Road/Pavement",
        "Trail/Dirt",
        "Gravel",
        "Mixed surfaces",
        "Track"
      ],
      climate: [
        "Cool (under 60°F)",
        "Moderate (60-75°F)",
        "Warm (75-85°F)",
        "Hot (85-95°F)",
        "Very hot (95°F+)",
        "Humid conditions",
        "High altitude"
      ],
      technicalDifficulty: [
        "Beginner friendly",
        "Moderate technical",
        "Advanced technical",
        "Expert level"
      ]
    };
  };

  const totalQuestions = 17;
  
  const getCurrentQuestion = () => {
    if (currentQuestion === 3) return getBenchmarkQuestion();
    
    // Handle conditional questions - FIXED: Skip questions that don't apply
    const question = ASSESSMENT_QUESTIONS[currentQuestion];
    if (question?.condition && !question.condition(answers)) {
      console.log(`Skipping question ${currentQuestion} due to condition not met:`, question.id);
      return null; // Skip this question
    }
    
    return question;
  };
  
  const currentQ = getCurrentQuestion();
  const isLastQuestion = currentQuestion === totalQuestions - 1;
  const isComplete = currentQuestion >= totalQuestions;

  // Check if single-discipline benchmark question needs manual continue
  const needsManualContinue = (questionId: string, focus: string): boolean => {
    if (questionId !== 'benchmarks') return false;
    
    // Single disciplines that need manual continue after input fields
    if (focus === 'Running') {
      return containsValue(answers.benchmarks.running, 'I know my exact times/paces');
    }
    if (focus === 'Cycling') {
      return containsValue(answers.benchmarks.cycling, 'I know my FTP (watts)');
    }
    if (focus === 'Swimming') {
      return containsValue(answers.benchmarks.swimming, 'I know my 100-yard pace');
    }
    if (focus === 'Strength Training') {
      return containsValue(answers.benchmarks.strength, 'I know my compound 1RMs');
    }
    
    return false;
  };

  const handleOptionSelect = (option: string, category?: string) => {
    console.log(`Option selected: ${option}, category: ${category}, current question: ${currentQuestion}`);
    
    if (currentQ?.type === 'triathlon' && category) {
      // Handle triathlon multi-select for performance levels
      const currentBenchmarks = answers.benchmarks[category as keyof typeof answers.benchmarks] || [];
      const updatedBenchmarks = Array.isArray(currentBenchmarks) 
        ? (currentBenchmarks.includes(option) 
            ? currentBenchmarks.filter(item => item !== option)
            : [...currentBenchmarks, option])
        : [option];
      
      setAnswers(prev => ({
        ...prev,
        benchmarks: {
          ...prev.benchmarks,
          [category]: updatedBenchmarks
        }
      }));
    } else if (currentQ?.type === 'hybridSelect' && category) {
      // Handle hybrid selection
      const currentBenchmarks = answers.benchmarks[category as keyof typeof answers.benchmarks] || [];
      
      if (!Array.isArray(currentBenchmarks) || currentBenchmarks.length === 0) {
        setAnswers(prev => ({
          ...prev,
          benchmarks: {
            ...prev.benchmarks,
            [category]: [option]
          }
        }));
      } else {
        setAnswers(prev => ({
          ...prev,
          benchmarks: {
            ...prev.benchmarks,
            [category]: [option]
          }
        }));
      }
    } else if (currentQ?.type === 'multiSelect') {
      // FIXED: Handle multi-select for injury body regions
      const currentSelections = answers.injuryDetails?.bodyRegions || [];
      const updatedSelections = currentSelections.includes(option)
        ? currentSelections.filter(item => item !== option)
        : [...currentSelections, option];
      
      setAnswers(prev => ({
        ...prev,
        injuryDetails: {
          ...prev.injuryDetails!,
          bodyRegions: updatedSelections
        }
      }));
    } else if (currentQ?.type === 'equipment') {
      // Handle equipment selection
      const updatedEquipment = { ...answers.equipment };
      if (category) {
        const currentItems = updatedEquipment[category as keyof typeof updatedEquipment] || [];
        updatedEquipment[category as keyof typeof updatedEquipment] = Array.isArray(currentItems)
          ? (currentItems.includes(option)
              ? currentItems.filter(item => item !== option)
              : [...currentItems, option])
          : [option];
      }
      
      setAnswers(prev => ({
        ...prev,
        equipment: updatedEquipment
      }));
    } else {
      // Handle single select
      const field = currentQ!.id as keyof Assessment;
      if (field === 'benchmarks') {
        const newAnswers = {
          ...answers,
          benchmarks: {
            ...answers.benchmarks,
            [answers.focus.toLowerCase()]: option
          }
        };
        setAnswers(newAnswers);
        
        // Check if we need manual continue with the updated answers
        if (!needsManualContinue('benchmarks', answers.focus)) {
          console.log('Auto-advancing after benchmark selection');
          setTimeout(() => {
            advanceToNextQuestion();
          }, 100);
        }
      } else {
        setAnswers(prev => ({
          ...prev,
          [field]: option
        }));
        
        // Special handling for injury history - FIXED
        if (field === 'injuryHistory') {
          const hasInjuries = option !== "No current injuries or limitations";
          setAnswers(prev => ({
            ...prev,
            injuryDetails: {
              ...prev.injuryDetails!,
              hasInjuries: hasInjuries
            }
          }));
          
          console.log('Injury history set:', option, 'hasInjuries:', hasInjuries);
          
          // FIXED: For injury history, always auto-advance regardless of selection
          setTimeout(() => {
            advanceToNextQuestion();
          }, 100);
          return;
        }
        
        // For all other single select questions, auto advance
        console.log('Auto-advancing after single select');
        setTimeout(() => {
          advanceToNextQuestion();
        }, 100);
      }
    }
  };

  const handleTriathlonDistanceSelect = (distance: string) => {
    setAnswers(prev => ({
      ...prev,
      triathlonDistance: distance
    }));
  };

  const handleNumberSubmit = () => {
    if (!textInput.trim()) return;
    
    const age = parseInt(textInput);
    if (age < 13 || age > 100) return;
    
    setAnswers(prev => ({
      ...prev,
      age: age
    }));
    setSelectedEventCategory('');
    setSelectedEventType('');
    setCurrentCourseStep(0);
    setTextInput('');
    
    advanceToNextQuestion();
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    
    setAnswers(prev => ({
      ...prev,
      [currentQ!.id]: textInput.trim()
    }));
    setTextInput('');
    
    advanceToNextQuestion();
  };

  const advanceToNextQuestion = () => {
    let nextQ = currentQuestion + 1;
    
    // Skip conditional questions that don't apply
    while (nextQ < totalQuestions) {
      if (nextQ === 3) {
        // Benchmark question - always valid
        break;
      }
      
      const nextQuestion = ASSESSMENT_QUESTIONS[nextQ];
      if (!nextQuestion?.condition) {
        // No condition - always valid
        break;
      }
      
      // FIXED: Check condition with current answers
      if (nextQuestion.condition(answers)) {
        break;
      }
      
      nextQ++; // Skip this question
    }
    
    console.log(`Advancing from question ${currentQuestion} to question ${nextQ}, total questions: ${totalQuestions}`);
    console.log('Current answers for injury check:', {
      injuryHistory: answers.injuryHistory,
      hasInjuries: answers.injuryDetails?.hasInjuries
    });
    
    setCurrentQuestion(Math.min(nextQ, totalQuestions));
  };

  const handleContinue = () => {
    advanceToNextQuestion();
  };

  const goBack = () => {
    if (currentQuestion > 0) {
      // Find previous valid question
      let prevQ = currentQuestion - 1;
      while (prevQ >= 0) {
        if (prevQ === 3) {
          // Benchmark question - always valid
          break;
        }
        
        const prevQuestion = ASSESSMENT_QUESTIONS[prevQ];
        if (!prevQuestion?.condition || prevQuestion.condition(answers)) {
          break;
        }
        prevQ--;
      }
      
      setCurrentQuestion(Math.max(prevQ, 0));
      setTextInput('');
    }
  };

  // Build prompt from assessment
  const buildPrompt = (): string => {
    let benchmarkText = '';
    if (answers.focus === 'Triathlon' || answers.focus === 'Hybrid') {
      Object.entries(answers.benchmarks).forEach(([sport, levels]) => {
        if (Array.isArray(levels) && levels.length > 0) {
          benchmarkText += `${sport}: ${levels.join(', ')}; `;
        }
      });
      if (answers.triathlonDistance) {
        benchmarkText += `Distance Focus: ${answers.triathlonDistance}; `;
      }
    } else {
      const singleBenchmark = answers.benchmarks[answers.focus.toLowerCase() as keyof typeof answers.benchmarks];
      if (singleBenchmark) {
        benchmarkText = `Performance Level: ${singleBenchmark}`;
      }
    }

    let equipmentText = '';
    Object.entries(answers.equipment).forEach(([category, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        equipmentText += `${category}: ${items.join(', ')}; `;
      }
    });

    return `Create a training plan based on this assessment:

Primary Focus: ${answers.focus}
Age: ${answers.age}
Current Fitness: ${answers.currentFitness}
${benchmarkText}
Injury History: ${answers.injuryHistory}
Training Frequency: ${answers.daysPerWeek}
Weekday Duration: ${answers.weekdayTime}
Weekend Duration: ${answers.weekendTime}
Main Goal: ${answers.goal}
Timeline: ${answers.timeline}
${answers.eventDetails ? `Event: ${answers.eventDetails}` : ''}
${answers.eventDate ? `Event Date: ${answers.eventDate}` : ''}
${answers.courseDetails?.courseDescription ? `Course Details: ${answers.courseDetails.courseDescription}` : ''}
${answers.courseDetails?.elevationGain ? `Course Characteristics: ${answers.courseDetails.elevationGain} elevation, ${answers.courseDetails.courseProfile}, ${answers.courseDetails.surfaceType}, ${answers.courseDetails.climate}, ${answers.courseDetails.technicalDifficulty}` : ''}
Training Background: ${answers.trainingBackground}
Equipment: ${equipmentText}
${answers.triathlonStrength ? `Triathlon Strength Approach: ${answers.triathlonStrength}` : ''}
${answers.singleDisciplineStrength ? `Strength Training Approach: ${answers.singleDisciplineStrength}` : ''}

Create a structured weekly training plan that:
- Matches their current fitness level and performance benchmarks
- Uses only the equipment they have available
- Respects their injury history and limitations
- Progresses appropriately based on their training background
- Fits their time constraints and frequency
- Uses sound training science and periodization
- Provides specific, actionable workouts
- Is age-appropriate for their training zones and recovery
${answers.singleDisciplineStrength === 'No strength training' || answers.triathlonStrength === 'No strength training' ? '- IMPORTANT: Do NOT include any strength training, lifting, or resistance work - focus purely on the primary discipline' : ''}
${(answers.singleDisciplineStrength && answers.singleDisciplineStrength !== 'No strength training') || (answers.triathlonStrength && answers.triathlonStrength !== 'No strength training') ? '- Include strength training as specified in their strength training approach' : ''}

Be intelligent about interpreting their fitness and benchmark descriptions to create appropriate training intensities.`;
  };

  // Generate plan from assessment
  const generatePlanFromAssessment = async () => {
    setGeneratingPlan(true);
    
    try {
      console.log('Building plan from assessment...');
      
      const prompt = buildPrompt();
      console.log('Assessment prompt:', prompt);
      
      // Call training service
      const result = await realAI.generateTrainingPlan(
        prompt,
        startDate,
        answers
      );
      
      console.log('Plan generated:', result);
      
      // Convert to display format
      const enhancedPlan = {
        id: result.plan.id || `plan-${Date.now()}`,
        name: result.plan.name || 'Training Plan',
        description: result.plan.description || 'Personalized training plan based on your assessment',
        focus: answers.focus,
        goal: answers.goal,
        daysPerWeek: answers.daysPerWeek,
        weekdayTime: answers.weekdayTime,
        weekendTime: answers.weekendTime,
        weeklySchedule: generateDisplaySchedule(result.workouts),
        currentWeek: 1,
        totalWeeks: result.plan.duration || 8,
        workouts: result.workouts
      };
      
      console.log('Enhanced plan created:', enhancedPlan);
      setGeneratedPlan(enhancedPlan);
      
    } catch (error) {
      console.error('Error generating plan:', error);
      alert('Error generating plan. Please try again.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Generate plan from manual input
  const handleManualGenerate = async () => {
    if (!planPrompt.trim()) return;
    
    setGeneratingPlan(true);
    try {
      console.log('Generating plan from manual prompt...');
      
      const result = await realAI.generateTrainingPlan(
        planPrompt,
        startDate,
        {}
      );
      
      const manualPlan = {
        id: result.plan.id || `manual-plan-${Date.now()}`,
        name: result.plan.name,
        description: result.plan.description,
        focus: result.plan.type,
        goal: result.plan.goal,
        timeline: 'Flexible',
        daysPerWeek: '4-5 days',
        weeklySchedule: generateDisplaySchedule(result.workouts),
        phase: 'Progressive Training',
        currentWeek: 1,
        totalWeeks: result.plan.duration,
        customPrompt: planPrompt,
        workouts: result.workouts
      };
      
      console.log('Manual plan generated:', manualPlan);
      setGeneratedPlan(manualPlan);
      setPlanPrompt('');
      
    } catch (error) {
      console.error('Error generating manual plan:', error);
      alert('Error generating plan. Please try again with a different description.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const generateDisplaySchedule = (workouts: any[]): string[] => {
    console.log('Generating display schedule from workouts:', workouts);
    
    if (!workouts || workouts.length === 0) {
      console.log('No workouts provided, using fallback schedule');
      return [
        'Monday: Structured workout based on your goals',
        'Tuesday: Recovery or cross-training',
        'Wednesday: High intensity training session', 
        'Thursday: Active recovery',
        'Friday: Skill or technique work',
        'Saturday: Long session or competition prep',
        'Sunday: Rest or light activity'
      ];
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const schedule = [];
    
    for (let i = 0; i < 7; i++) {
      if (workouts[i]) {
        const workout = workouts[i];
        
        if (workout.name && workout.description) {
          let description = workout.description;
          if (description.toLowerCase().startsWith(dayNames[i].toLowerCase())) {
            description = description.substring(dayNames[i].length + 1).trim();
            if (description.startsWith(':')) description = description.substring(1).trim();
          }
          
          schedule.push(`${dayNames[i]}: ${workout.name} - ${description}`);
        } else {
          schedule.push(`${dayNames[i]}: ${workout.name || 'Training Session'}`);
        }
      } else {
        schedule.push(`${dayNames[i]}: Rest day`);
      }
    }
    
    return schedule;
  };

  const reset = () => {
    setCurrentQuestion(0);
    setAnswers({
      focus: '',
      age: 0,
      currentFitness: '',
      benchmarks: {},
      triathlonDistance: '',
      injuryHistory: '',
      injuryDetails: {
        hasInjuries: false,
        bodyRegions: [],
        specificInjuries: {}
      },
      triathlonStrength: '',
      singleDisciplineStrength: '',
      hybridStrength: '',
      goal: '',
      timeline: '',
      eventDetails: '',
      eventCategory: '',
      eventType: '',
      eventDate: '',
      courseDetails: {
        elevationGain: '',
        courseProfile: '',
        surfaceType: '',
        climate: '',
        technicalDifficulty: '',
        courseDescription: '',
        hasSpecificCourse: false
      },
      daysPerWeek: '', 
      weekdayTime: '',
      weekendTime: '',
      trainingBackground: '',
      equipment: {},
      performanceNumbers: {}
    });
    setTextInput('');
    setGeneratedPlan(null);
    setPlanPrompt('');
    setActiveTab('assessment');
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-3 py-2">
        {/* Header */}
        <div className="flex justify-end items-center mb-6">
          <button
            onClick={reset}
            className="px-4 py-2 text-gray-600 hover:text-black transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex">
            <button
              onClick={() => setActiveTab('assessment')}
              className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                activeTab === 'assessment'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Assessment
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                activeTab === 'manual'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          {activeTab === 'assessment' ? (
            /* Assessment Tab */
            <div className="space-y-6">
              {!isComplete && !generatedPlan ? (
                /* Assessment Questions */
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                      <div 
                        className="bg-black h-2 rounded-full transition-all duration-300" 
                        style={{width: `${(currentQuestion / totalQuestions) * 100}%`}}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-500">
                      Question {currentQuestion + 1} of {totalQuestions}
                    </p>
                  </div>

                  {/* Back button */}
                  {currentQuestion > 0 && (
                    <div className="flex justify-start">
                      <button
                        onClick={goBack}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black transition-colors"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>
                    </div>
                  )}

                  {/* FIXED: Skip rendering when question should be skipped due to conditions */}
                  {currentQ ? (
                    <>
                      <div className="text-center">
                        <h2 className="text-xl font-medium mb-6">{currentQ?.text}</h2>
                      </div>

                      {currentQ?.type === 'number' ? (
                    /* Number input for age */
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          placeholder={currentQ.placeholder}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black text-center text-lg"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && textInput.trim()) {
                              e.preventDefault();
                              handleNumberSubmit();
                            }
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <button
                          onClick={handleNumberSubmit}
                          disabled={!textInput.trim() || parseInt(textInput) < 13 || parseInt(textInput) > 100}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : currentQ?.type === 'combinedTime' ? (
                    /* FIXED: Combined time selection with ultra-capable options */
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-gray-700">Weekday time limit:</label>
                          <select
                            value={answers.weekdayTime}
                            onChange={(e) => setAnswers(prev => ({
                              ...prev,
                              weekdayTime: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                          >
                            <option value="">Select weekday time</option>
                            {TIME_OPTIONS.map((option, index) => (
                              <option key={index} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-gray-700">Weekend time limit:</label>
                          <select
                            value={answers.weekendTime}
                            onChange={(e) => setAnswers(prev => ({
                              ...prev,
                              weekendTime: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                          >
                            <option value="">Select weekend time</option>
                            {TIME_OPTIONS.map((option, index) => (
                              <option key={index} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="text-center pt-4">
                        <button
                          onClick={handleContinue}
                          disabled={!answers.weekdayTime || !answers.weekendTime}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : currentQ?.type === 'triathlon' ? (
                    /* Triathlon with distance selection first */
                    <div className="space-y-6">
                      {!answers.triathlonDistance ? (
                        <div className="space-y-3">
                          <h3 className="text-lg font-medium">First, what distance do you focus on?</h3>
                          <div className="space-y-2">
                            {currentQ.distanceOptions?.map((option, index) => (
                              <button
                                key={index}
                                onClick={() => handleTriathlonDistanceSelect(option)}
                                className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                              >
                                <span className="font-medium text-gray-500 mr-3">{index + 1}.</span>
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Distance Focus: <strong>{answers.triathlonDistance}</strong></p>
                          </div>
                          
                          <h3 className="text-lg font-medium">Now, what are your performance levels?</h3>
                          {Object.entries(currentQ.categories || {}).map(([category, options]) => (
                            <div key={category} className="space-y-3">
                              <h4 className="font-medium capitalize">{category}:</h4>
                              <div className="space-y-2">
                                {options.map((option, index) => (
                                  <button
                                    key={index}
                                    onClick={() => handleOptionSelect(option, category)}
                                    className={`w-full p-4 text-left transition-colors ${
                                      (answers.benchmarks[category as keyof typeof answers.benchmarks] as string[] || []).includes(option)
                                        ? 'text-blue-600'
                                        : 'hover:text-blue-600'
                                    }`}
                                  >
                                    <span className="font-medium text-gray-500 mr-3">
                                      {(answers.benchmarks[category as keyof typeof answers.benchmarks] as string[] || []).includes(option) ? '✓' : '○'}
                                    </span>
                                    {option}
                                  </button>
                                ))}
                              </div>
                              
                              {/* Input fields for performance data */}
                              {category === 'cycling' && containsValue(answers.benchmarks.cycling, 'I know my FTP (watts)') && (
                                <div className="ml-4 mt-3 p-3 bg-gray-50 rounded-lg">
                                  <label className="text-sm font-medium">Your FTP (watts):</label>
                                  <input
                                    type="number"
                                    placeholder="285"
                                    value={answers.performanceNumbers.ftp || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        ftp: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                                  />
                                </div>
                              )}
                              
                              {category === 'swimming' && containsValue(answers.benchmarks.swimming, 'I know my 100-yard pace') && (
                                <div className="ml-4 mt-3 p-3 bg-gray-50 rounded-lg">
                                  <label className="text-sm font-medium">Your 100-yard pace (mm:ss):</label>
                                  <input
                                    type="text"
                                    placeholder="1:25"
                                    value={answers.performanceNumbers.swimPace || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        swimPace: e.target.value
                                      }
                                    }))}
                                    className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                                  />
                                </div>
                              )}
                              
                              {category === 'running' && containsValue(answers.benchmarks.running, 'I know my exact times/paces') && (
                                <div className="ml-4 mt-3 p-3 bg-gray-50 rounded-lg">
                                  <label className="text-sm font-medium mb-2 block">Your race times (optional):</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-xs text-gray-600">5K time</label>
                                      <input
                                        type="text"
                                        placeholder="18:30"
                                        value={answers.performanceNumbers.runningPaces?.fiveK || ''}
                                        onChange={(e) => setAnswers(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            runningPaces: {
                                              ...prev.performanceNumbers.runningPaces,
                                              fiveK: e.target.value
                                            }
                                          }
                                        }))}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600">10K time</label>
                                      <input
                                        type="text"
                                        placeholder="38:15"
                                        value={answers.performanceNumbers.runningPaces?.tenK || ''}
                                        onChange={(e) => setAnswers(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            runningPaces: {
                                              ...prev.performanceNumbers.runningPaces,
                                              tenK: e.target.value
                                            }
                                          }
                                        }))}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          
                          <div className="text-center pt-4">
                            <button
                              onClick={handleContinue}
                              className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : currentQ?.type === 'hybridSelect' ? (
                    /* Hybrid selection */
                    <div className="space-y-6">
                      <p className="text-sm text-gray-600">First check which disciplines you want to train, then select your level in each:</p>
                      {Object.entries(currentQ.categories || {}).map(([category, options]) => {
                        const isEnabled = (answers.benchmarks[category as keyof typeof answers.benchmarks] as string[] || []).length > 0;
                        return (
                          <div key={category} className="space-y-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => {
                                  if (isEnabled) {
                                    setAnswers(prev => ({
                                      ...prev,
                                      benchmarks: {
                                        ...prev.benchmarks,
                                        [category]: []
                                      }
                                    }));
                                  } else {
                                    setAnswers(prev => ({
                                      ...prev,
                                      benchmarks: {
                                        ...prev.benchmarks,
                                        [category]: [options[0]]
                                      }
                                    }));
                                  }
                                }}
                                className="w-4 h-4"
                              />
                              <h3 className="text-lg font-medium capitalize">{category}</h3>
                            </div>
                            {isEnabled && (
                              <div className="ml-7 space-y-2">
                                {options.map((option, index) => (
                                  <button
                                    key={index}
                                    onClick={() => handleOptionSelect(option, category)}
                                    className={`w-full p-3 text-left text-sm transition-colors ${
                                      (answers.benchmarks[category as keyof typeof answers.benchmarks] as string[] || []).includes(option)
                                        ? 'text-blue-600'
                                        : 'hover:text-blue-600'
                                    }`}
                                  >
                                    <span className="font-medium text-gray-500 mr-3">
                                      {(answers.benchmarks[category as keyof typeof answers.benchmarks] as string[] || []).includes(option) ? '●' : '○'}
                                    </span>
                                    {option}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="text-center pt-4">
                        <button
                          onClick={handleContinue}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : currentQ?.type === 'eventSelection' ? (
                    /* FIXED: Direct event selection based on primary focus */
                    <div className="space-y-3">
                      <div className="text-center p-3 bg-gray-50 rounded-lg mb-4">
                        <p className="text-sm text-gray-600">
                          <strong className="capitalize">{answers.focus}</strong> Events
                        </p>
                      </div>
                      <div className="space-y-2">
                        {getEventOptions().map((eventType, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setAnswers(prev => ({
                                ...prev,
                                eventDetails: eventType
                              }));
                              advanceToNextQuestion();
                            }}
                            className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                          >
                            <span className="font-medium text-gray-500 mr-3">{index + 1}.</span>
                            {eventType}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : currentQ?.type === 'eventCategory' ? (
                    /* Event Category and Type Selection */
                    <div className="space-y-6">
                      {!selectedEventCategory ? (
                        <div className="space-y-3">
                          <h3 className="text-lg font-medium">First, what type of event?</h3>
                          <div className="space-y-2">
                            {Object.keys(currentQ.categories || {}).map((category, index) => (
                              <button
                                key={index}
                                onClick={() => setSelectedEventCategory(category)}
                                className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                              >
                                <span className="font-medium text-gray-500 mr-3">{index + 1}.</span>
                                <span className="capitalize">{category}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : !selectedEventType ? (
                        <div className="space-y-3">
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">Category: <strong className="capitalize">{selectedEventCategory}</strong></p>
                          </div>
                          <h3 className="text-lg font-medium">What specific event?</h3>
                          <div className="space-y-2">
                            {(currentQ.categories?.[selectedEventCategory] || []).map((eventType, index) => (
                              <button
                                key={index}
                                onClick={() => setSelectedEventType(eventType)}
                                className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                              >
                                <span className="font-medium text-gray-500 mr-3">{index + 1}.</span>
                                {eventType}
                              </button>
                            ))}
                          </div>
                          <div className="text-center pt-4">
                            <button
                              onClick={() => setSelectedEventCategory('')}
                              className="px-4 py-2 text-gray-600 hover:text-black transition-colors"
                            >
                              ← Back to categories
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-600">
                              <strong className="capitalize">{selectedEventCategory}</strong>: <strong>{selectedEventType}</strong>
                            </p>
                          </div>
                          <div className="text-center">
                            <button
                              onClick={() => {
                                setAnswers(prev => ({
                                  ...prev,
                                  eventCategory: selectedEventCategory,
                                  eventType: selectedEventType,
                                  eventDetails: `${selectedEventCategory}: ${selectedEventType}`
                                }));
                                setSelectedEventCategory('');
                                setSelectedEventType('');
                                advanceToNextQuestion();
                              }}
                              className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium"
                            >
                              Continue
                            </button>
                          </div>
                          <div className="text-center">
                            <button
                              onClick={() => setSelectedEventType('')}
                              className="px-4 py-2 text-gray-600 hover:text-black transition-colors text-sm"
                            >
                              ← Change event type
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : currentQ?.type === 'date' ? (
                    /* Date input for event date */
                    <div className="space-y-4">
                      <div className="flex justify-center">
                        <input
                          type="date"
                          value={textInput}
                          onChange={(e) => setTextInput(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                        />
                      </div>
                      <div className="text-center">
                        <button
                          onClick={() => {
                            setAnswers(prev => ({
                              ...prev,
                              eventDate: textInput
                            }));
                            setTextInput('');
                            advanceToNextQuestion();
                          }}
                          disabled={!textInput}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : currentQ?.type === 'courseAnalysis' ? (
                    /* Course Analysis - Multi-step */
                    <div className="space-y-6">
                      {currentCourseStep === 0 ? (
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium">Do you have specific course information?</h3>
                          <div className="space-y-2">
                            <button
                              onClick={() => {
                                setAnswers(prev => ({
                                  ...prev,
                                  courseDetails: {
                                    ...prev.courseDetails!,
                                    hasSpecificCourse: true
                                  }
                                }));
                                setCurrentCourseStep(1);
                              }}
                              className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                            >
                              <span className="font-medium text-gray-500 mr-3">1.</span>
                              Yes - I can upload course file or provide detailed description
                            </button>
                            <button
                              onClick={() => {
                                setAnswers(prev => ({
                                  ...prev,
                                  courseDetails: {
                                    ...prev.courseDetails!,
                                    hasSpecificCourse: false
                                  }
                                }));
                                setCurrentCourseStep(2);
                              }}
                              className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                            >
                              <span className="font-medium text-gray-500 mr-3">2.</span>
                              No - I'll provide general course characteristics
                            </button>
                          </div>
                        </div>
                      ) : currentCourseStep === 1 ? (
                        <div className="space-y-4">
                          <h3 className="text-lg font-medium">Course Description</h3>
                          <p className="text-sm text-gray-600">
                            Describe the course in detail. Include elevation profiles, key climbs, technical sections, 
                            weather conditions, or paste Strava/race website links.
                          </p>
                          <textarea
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            placeholder="Example: The course has three major climbs at miles 20, 45, and 80. The first climb is 800ft over 3 miles, the second is 1200ft over 2 miles... Hot and humid conditions expected..."
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                          />
                          <div className="text-center">
                            <button
                              onClick={() => {
                                setAnswers(prev => ({
                                  ...prev,
                                  courseDetails: {
                                    ...prev.courseDetails!,
                                    courseDescription: textInput
                                  }
                                }));
                                setTextInput('');
                                advanceToNextQuestion();
                              }}
                              disabled={!textInput.trim()}
                              className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* General Course Characteristics */
                        <div className="space-y-6">
                          <h3 className="text-lg font-medium">Course Characteristics</h3>
                          
                          {/* Elevation Gain */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Elevation Gain:</h4>
                            <select
                              value={answers.courseDetails?.elevationGain || ''}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                courseDetails: {
                                  ...prev.courseDetails!,
                                  elevationGain: e.target.value
                                }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                            >
                              <option value="">Select elevation gain</option>
                              {getElevationGainOptions().map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          {/* Course Profile */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Course Profile:</h4>
                            <select
                              value={answers.courseDetails?.courseProfile || ''}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                courseDetails: {
                                  ...prev.courseDetails!,
                                  courseProfile: e.target.value
                                }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                            >
                              <option value="">Select course profile</option>
                              {getCourseDetailOptions().courseProfile.map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          {/* Surface Type */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Surface Type:</h4>
                            <select
                              value={answers.courseDetails?.surfaceType || ''}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                courseDetails: {
                                  ...prev.courseDetails!,
                                  surfaceType: e.target.value
                                }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                            >
                              <option value="">Select surface type</option>
                              {getCourseDetailOptions().surfaceType.map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          {/* Climate */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Expected Climate:</h4>
                            <select
                              value={answers.courseDetails?.climate || ''}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                courseDetails: {
                                  ...prev.courseDetails!,
                                  climate: e.target.value
                                }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                            >
                              <option value="">Select climate</option>
                              {getCourseDetailOptions().climate.map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          {/* Technical Difficulty */}
                          <div className="space-y-3">
                            <h4 className="font-medium">Technical Difficulty:</h4>
                            <select
                              value={answers.courseDetails?.technicalDifficulty || ''}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                courseDetails: {
                                  ...prev.courseDetails!,
                                  technicalDifficulty: e.target.value
                                }
                              }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                            >
                              <option value="">Select difficulty</option>
                              {getCourseDetailOptions().technicalDifficulty.map((option, index) => (
                                <option key={index} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <div className="text-center pt-4">
                            <button
                              onClick={() => {
                                setCurrentCourseStep(0);
                                advanceToNextQuestion();
                              }}
                              disabled={!answers.courseDetails?.elevationGain || !answers.courseDetails?.courseProfile}
                              className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                            >
                              Continue
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : currentQ?.type === 'multiSelect' ? (
                    /* FIXED: Multi-select for injury body regions with proper continue logic */
                    <div className="space-y-6">
                      <p className="text-sm text-gray-600">Select all areas that are currently affected:</p>
                      <div className="space-y-2">
                        {currentQ.options?.map((option, index) => (
                          <button
                            key={index}
                            onClick={() => handleOptionSelect(option)}
                            className={`w-full p-4 text-left transition-colors ${
                              (answers.injuryDetails?.bodyRegions || []).includes(option)
                                ? 'text-blue-600'
                                : 'hover:text-blue-600'
                            }`}
                          >
                            <span className="font-medium text-gray-500 mr-3">
                              {(answers.injuryDetails?.bodyRegions || []).includes(option) ? '✓' : '○'}
                            </span>
                            {option}
                          </button>
                        ))}
                      </div>
                      <div className="text-center pt-4">
                        <button
                          onClick={handleContinue}
                          disabled={(answers.injuryDetails?.bodyRegions || []).length === 0}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                        >
                          Continue ({(answers.injuryDetails?.bodyRegions || []).length} selected)
                        </button>
                      </div>
                    </div>
                  ) : currentQ?.type === 'equipment' ? (
                    /* Equipment selection */
                    <div className="space-y-6">
                      {Object.entries(getEquipmentOptions()).map(([category, options]) => (
                        <div key={category} className="space-y-3">
                          <h3 className="text-lg font-medium capitalize">{category}:</h3>
                          <div className="space-y-2">
                            {options.map((option, index) => (
                              <button
                                key={index}
                                onClick={() => handleOptionSelect(option, category)}
                                className={`w-full p-4 text-left transition-colors ${
                                  (answers.equipment[category as keyof typeof answers.equipment] || []).includes(option)
                                    ? 'text-blue-600'
                                    : 'hover:text-blue-600'
                                }`}
                              >
                                <span className="font-medium text-gray-500 mr-3">
                                  {(answers.equipment[category as keyof typeof answers.equipment] || []).includes(option) ? '✓' : '○'}
                                </span>
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="text-center pt-4">
                        <button
                          onClick={handleContinue}
                          className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Multiple choice */
                    <div className="space-y-3">
                      {currentQ?.options?.map((option, index) => (
                        <button
                          key={index}
                          onClick={() => handleOptionSelect(option)}
                          className="w-full p-4 text-left hover:text-blue-600 transition-colors"
                        >
                          <span className="font-medium text-gray-500 mr-3">{index + 1}.</span>
                          {option}
                        </button>
                      ))}
                      
                      {/* Input fields for single discipline benchmarks */}
                      {currentQ?.id === 'benchmarks' && (
                        <div className="mt-4 space-y-3">
                          {/* FTP Input for Cycling */}
                          {answers.focus === 'Cycling' && containsValue(answers.benchmarks.cycling, 'I know my FTP (watts)') && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <label className="text-sm font-medium">Your FTP (watts):</label>
                              <input
                                type="number"
                                placeholder="285"
                                value={answers.performanceNumbers.ftp || ''}
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  performanceNumbers: {
                                    ...prev.performanceNumbers,
                                    ftp: parseInt(e.target.value) || undefined
                                  }
                                }))}
                                className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                              />
                            </div>
                          )}
                          
                          {/* Swim Pace Input for Swimming */}
                          {answers.focus === 'Swimming' && containsValue(answers.benchmarks.swimming, 'I know my 100-yard pace') && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <label className="text-sm font-medium">Your 100-yard pace (mm:ss):</label>
                              <input
                                type="text"
                                placeholder="1:25"
                                value={answers.performanceNumbers.swimPace || ''}
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  performanceNumbers: {
                                    ...prev.performanceNumbers,
                                    swimPace: e.target.value
                                  }
                                }))}
                                className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                              />
                            </div>
                          )}
                          
                          {/* Strength Numbers Input for Strength Training */}
                          {answers.focus === 'Strength Training' && containsValue(answers.benchmarks.strength, 'I know my compound 1RMs') && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <label className="text-sm font-medium mb-2 block">Your 1-Rep Maxes (lbs):</label>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600">Squat</label>
                                  <input
                                    type="number"
                                    placeholder="315"
                                    value={answers.performanceNumbers.squat || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        squat: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Deadlift</label>
                                  <input
                                    type="number"
                                    placeholder="405"
                                    value={answers.performanceNumbers.deadlift || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        deadlift: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">Bench</label>
                                  <input
                                    type="number"
                                    placeholder="225"
                                    value={answers.performanceNumbers.bench || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        bench: parseInt(e.target.value) || undefined
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Running Times Input for Running */}
                          {answers.focus === 'Running' && containsValue(answers.benchmarks.running, 'I know my exact times/paces') && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                              <label className="text-sm font-medium mb-2 block">Your race times (optional):</label>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-600">5K time</label>
                                  <input
                                    type="text"
                                    placeholder="18:30"
                                    value={answers.performanceNumbers.runningPaces?.fiveK || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        runningPaces: {
                                          ...prev.performanceNumbers.runningPaces,
                                          fiveK: e.target.value
                                        }
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-600">10K time</label>
                                  <input
                                    type="text"
                                    placeholder="38:15"
                                    value={answers.performanceNumbers.runningPaces?.tenK || ''}
                                    onChange={(e) => setAnswers(prev => ({
                                      ...prev,
                                      performanceNumbers: {
                                        ...prev.performanceNumbers,
                                        runningPaces: {
                                          ...prev.performanceNumbers.runningPaces,
                                          tenK: e.target.value
                                        }
                                      }
                                    }))}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-black"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Show Continue button when input fields are present */}
                          {needsManualContinue('benchmarks', answers.focus) && (
                            <div className="text-center pt-4">
                              <button
                                onClick={handleContinue}
                                className="px-6 py-2 text-black hover:text-blue-600 transition-colors font-medium"
                              >
                                Continue
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                    </>
                  ) : (
                    /* Question should be skipped - auto advance */
                    <div className="text-center">
                      <p className="text-gray-500">Processing...</p>
                      {setTimeout(() => {
                        console.log('Auto-advancing due to skipped question');
                        advanceToNextQuestion();
                      }, 100)}
                    </div>
                  )}
                </div>
              ) : isComplete && !generatedPlan ? (
                /* Assessment Complete */
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-medium mb-4">Assessment Complete</h2>
                    <p className="text-gray-600 mb-6">Ready to build your plan</p>
                  </div>
                  
                  {/* Start Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Start Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>
                  
                  <button
                    onClick={generatePlanFromAssessment}
                    disabled={generatingPlan}
                    className="w-full h-12 px-4 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                  >
                    {generatingPlan ? (
                      "Building your plan..."
                    ) : (
                      "Build My Plan"
                    )}
                  </button>
                </div>
              ) : generatedPlan ? (
                /* Show Generated Plan */
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-medium mb-2">{generatedPlan.name}</h2>
                    <p className="text-gray-600">
                      Your personalized training plan
                    </p>
                  </div>
                  
                  {/* Plan Overview */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-black">Plan Overview</h3>
                    <p className="text-sm text-gray-700">{generatedPlan.description}</p>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-600">Focus:</span> {generatedPlan.focus}</div>
                      <div><span className="text-gray-600">Goal:</span> {generatedPlan.goal}</div>
                      <div><span className="text-gray-600">Frequency:</span> {generatedPlan.daysPerWeek}</div>
                      <div><span className="text-gray-600">Weekday Time:</span> {generatedPlan.weekdayTime}</div>
                      <div><span className="text-gray-600">Weekend Time:</span> {generatedPlan.weekendTime}</div>
                    </div>
                  </div>

                  {/* Weekly Schedule */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-black">Your Training Week</h3>
                    <div className="space-y-2">
                      {generatedPlan.weeklySchedule.map((day: string, index: number) => (
                        <div key={index} className="text-sm p-3 rounded border-l-4 border-gray-300">
                          {day}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons - Both now follow text-only styling */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        alert('Plan refinement ready! You can chat to adjust the plan.');
                      }}
                      className="flex-1 px-4 py-3 text-black hover:text-blue-600 transition-colors font-medium"
                    >
                      Refine Plan
                    </button>
                    <button
                      onClick={() => {
                        alert('Plan saved to calendar! Individual workouts created and scheduled.');
                      }}
                      className="flex-1 px-4 py-3 text-black hover:text-blue-600 transition-colors font-medium"
                    >
                      Accept Plan
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* Manual Tab - Free Text Input */
            <div>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-medium mb-2">Manual Plan Creation</h1>
                <p className="text-gray-600">
                  Describe your training goals and we'll create a plan
                </p>
              </div>

              <div className="space-y-6">
                {/* Start Date Input */}
                <div className="space-y-2">
                  <label htmlFor="startDate" className="text-sm font-medium text-gray-700">
                    Start Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10 min-h-[44px] w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Plan Description */}
                <div className="space-y-2">
                  <label htmlFor="planPrompt" className="text-sm font-medium text-gray-700">
                    Describe Your Training Goal
                  </label>
                  <textarea
                    id="planPrompt"
                    value={planPrompt}
                    onChange={(e) => setPlanPrompt(e.target.value)}
                    placeholder="I want to train for a 5K race in 8 weeks. I'm a beginner runner who can currently run for 20 minutes..."
                    rows={4}
                    className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-black"
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
                  <button
                    onClick={handleManualGenerate}
                    disabled={!planPrompt.trim() || generatingPlan}
                    className="w-full h-12 px-4 py-2 text-black hover:text-blue-600 transition-colors font-medium disabled:text-gray-400"
                  >
                    {generatingPlan ? (
                      "Building plan..."
                    ) : (
                      "Build Plan"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}