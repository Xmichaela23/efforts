import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Loader2, Menu } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { getDisciplineGlowColor, getDisciplineTextClass, getDisciplineTextClassVariant, getDisciplineBorderClass } from '@/lib/context-utils';
import { useToast } from '@/components/ui/use-toast';
import { MobileHeader } from './MobileHeader';
import {
  calculateEffortScoreResult,
  raceDistanceToMeters,
  parseTimeToSeconds,
  formatPace,
  parsePace,
  adjustScoreForRecency,
  getPacesFromScore,
  calculatePacesFromKnownPaces,
  validatePaceConsistency,
  getProjectedFinishTime,
  formatFinishTime,
  type RaceDistance,
  type RaceRecency,
  type TrainingPaces,
} from '@/lib/effort-score';

// ============================================================================
// TYPES
// ============================================================================

type Discipline = 'run' | 'ride' | 'swim' | 'triathlon' | 'hybrid';
type Distance = '5k' | '10k' | 'half' | 'marathon';
type Fitness = 'novice' | 'beginner' | 'intermediate' | 'advanced';
type MpwRange = '12-15' | '16-19' | '20-25' | '25-35' | '35-45' | '45+';
type Goal = 'complete' | 'speed';
type Approach = 'sustainable' | 'performance_build';
type DaysPerWeek = '3-4' | '4-5' | '5-6' | '6-7';
type StrengthTier = 'injury_prevention' | 'strength_power';
type EquipmentType = 'home_gym' | 'commercial_gym';
type StrengthProtocol = 'durability' | 'neural_speed' | 'upper_aesthetics';

type PaceInputMethod = 'race' | 'paces' | 'saved' | 'unknown' | null;

// ============================================================================
// MAJOR MARATHONS DATABASE
// ============================================================================

interface MajorMarathon {
  name: string;
  city: string;
  country: string;
  // Date pattern: month (1-12), weekday (0=Sun, 1=Mon, etc.), weekNum (1=first, -1=last)
  // OR fixed date: month, day
  datePattern: { month: number; weekday: number; weekNum: number } | { month: number; day: number };
}

const MAJOR_MARATHONS: MajorMarathon[] = [
  // World Marathon Majors
  { name: 'Boston Marathon', city: 'Boston', country: 'USA', datePattern: { month: 4, weekday: 1, weekNum: 3 } }, // 3rd Monday of April
  { name: 'London Marathon', city: 'London', country: 'UK', datePattern: { month: 4, weekday: 0, weekNum: 4 } }, // 4th Sunday of April
  { name: 'Berlin Marathon', city: 'Berlin', country: 'Germany', datePattern: { month: 9, weekday: 0, weekNum: -1 } }, // Last Sunday of September
  { name: 'Chicago Marathon', city: 'Chicago', country: 'USA', datePattern: { month: 10, weekday: 0, weekNum: 2 } }, // 2nd Sunday of October
  { name: 'NYC Marathon', city: 'New York', country: 'USA', datePattern: { month: 11, weekday: 0, weekNum: 1 } }, // 1st Sunday of November
  { name: 'Tokyo Marathon', city: 'Tokyo', country: 'Japan', datePattern: { month: 3, weekday: 0, weekNum: 1 } }, // 1st Sunday of March
  
  // Major US Marathons
  { name: 'LA Marathon', city: 'Los Angeles', country: 'USA', datePattern: { month: 3, weekday: 0, weekNum: 2 } }, // 2nd Sunday of March
  { name: 'Marine Corps Marathon', city: 'Washington DC', country: 'USA', datePattern: { month: 10, weekday: 0, weekNum: -1 } }, // Last Sunday of October
  { name: 'Philadelphia Marathon', city: 'Philadelphia', country: 'USA', datePattern: { month: 11, weekday: 0, weekNum: 3 } }, // 3rd Sunday of November
  { name: 'Houston Marathon', city: 'Houston', country: 'USA', datePattern: { month: 1, weekday: 0, weekNum: 2 } }, // 2nd Sunday of January
  { name: 'Austin Marathon', city: 'Austin', country: 'USA', datePattern: { month: 2, weekday: 0, weekNum: 2 } }, // 2nd Sunday of February
  { name: 'Twin Cities Marathon', city: 'Minneapolis', country: 'USA', datePattern: { month: 10, weekday: 0, weekNum: 1 } }, // 1st Sunday of October
  { name: 'Big Sur Marathon', city: 'Carmel', country: 'USA', datePattern: { month: 4, weekday: 0, weekNum: -1 } }, // Last Sunday of April
  { name: 'Grandmas Marathon', city: 'Duluth', country: 'USA', datePattern: { month: 6, weekday: 6, weekNum: 3 } }, // 3rd Saturday of June
  { name: 'San Francisco Marathon', city: 'San Francisco', country: 'USA', datePattern: { month: 7, weekday: 0, weekNum: -1 } }, // Last Sunday of July
  { name: 'Richmond Marathon', city: 'Richmond', country: 'USA', datePattern: { month: 11, weekday: 6, weekNum: 2 } }, // 2nd Saturday of November
  { name: 'CIM Sacramento', city: 'Sacramento', country: 'USA', datePattern: { month: 12, weekday: 0, weekNum: 1 } }, // 1st Sunday of December
  { name: 'St. George Marathon', city: 'St. George', country: 'USA', datePattern: { month: 10, weekday: 6, weekNum: 1 } }, // 1st Saturday of October
];

// Get the Nth weekday of a month (or last if weekNum is -1)
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, weekNum: number): Date {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  if (weekNum === -1) {
    // Last occurrence of weekday in month
    let day = lastDay.getDate();
    while (new Date(year, month - 1, day).getDay() !== weekday) {
      day--;
    }
    return new Date(year, month - 1, day);
  }
  
  // Find first occurrence of weekday
  let firstOccurrence = 1;
  while (new Date(year, month - 1, firstOccurrence).getDay() !== weekday) {
    firstOccurrence++;
  }
  
  // Add weeks to get to Nth occurrence
  const day = firstOccurrence + (weekNum - 1) * 7;
  return new Date(year, month - 1, day);
}

// Get race date for a given year
function getMarathonDate(marathon: MajorMarathon, year: number): Date {
  const pattern = marathon.datePattern;
  if ('day' in pattern) {
    return new Date(year, pattern.month - 1, pattern.day);
  }
  return getNthWeekdayOfMonth(year, pattern.month, pattern.weekday, pattern.weekNum);
}

// Find ALL matching marathons for a given date (within 3 days tolerance), sorted by proximity
function findMatchingMarathons(dateStr: string): { marathon: MajorMarathon; diffDays: number }[] {
  if (!dateStr) return [];
  
  const selectedDate = new Date(dateStr + 'T00:00:00');
  const year = selectedDate.getFullYear();
  
  const matches: { marathon: MajorMarathon; diffDays: number }[] = [];
  
  for (const marathon of MAJOR_MARATHONS) {
    const marathonDate = getMarathonDate(marathon, year);
    const diffDays = Math.abs((selectedDate.getTime() - marathonDate.getTime()) / (24 * 60 * 60 * 1000));
    
    // Only show marathons within 3 days of selected date
    if (diffDays <= 3) {
      matches.push({ marathon, diffDays });
    }
  }
  
  // Sort by proximity (closest first)
  return matches.sort((a, b) => a.diffDays - b.diffDays);
}

// Find single best matching marathon (for backwards compatibility)
function findMatchingMarathon(dateStr: string): MajorMarathon | null {
  const matches = findMatchingMarathons(dateStr);
  return matches.length > 0 ? matches[0].marathon : null;
}

interface WizardState {
  discipline: Discipline | null;
  distance: Distance | null;
  fitness: Fitness | null;
  currentMpw: MpwRange | null; // Actual weekly mileage for precise gating
  goal: Goal | null;
  // Effort Score (for Performance Build / speed goal only)
  paceInputMethod: PaceInputMethod; // How user wants to input their fitness
  hasRecentRace: boolean | null; // null = not answered (legacy, kept for compatibility)
  effortRaceDistance: RaceDistance | null;
  effortRaceTime: string; // "MM:SS" or "HH:MM:SS"
  effortRaceRecency: RaceRecency | null;
  effortScore: number | null;
  effortScoreStatus: 'verified' | 'estimated' | null;
  effortPaces: TrainingPaces | null;
  effortPacesSource: 'calculated' | 'manual'; // Track if user edited paces
  // Known paces input (for "I know my paces" option)
  knownEasyPace: string; // "MM:SS" format
  knownFiveKPace: string; // "MM:SS" format
  paceValidationWarning: string | null;
  // Plan timing
  hasRaceDate: boolean | null; // null = not answered yet
  raceDate: string; // ISO date string for race day
  raceName: string; // Optional name for the race (e.g., "Boston Marathon")
  duration: number;
  startDate: string; // ISO date string
  approach: Approach | null;
  daysPerWeek: DaysPerWeek | null;
  strengthFrequency: 0 | 2 | 3;
  strengthTier: StrengthTier;
  equipmentType: EquipmentType;
  strengthProtocol?: StrengthProtocol;
  noDoubles?: boolean; // If true, cannot stack strength on same day as quality runs
}

// ============================================================================
// DURATION GATING - MPW BASED
// ============================================================================

interface DurationGating {
  minSafe: number;
  recommended: number;
  riskLevel: 'safe' | 'caution' | 'high_risk';
  warningTitle: string;
  warningMessage: string;
}

/**
 * Get duration requirements based on distance, fitness, and current MPW
 */
function getDurationGating(
  distance: Distance | null,
  fitness: Fitness | null,
  currentMpw: MpwRange | null,
  selectedWeeks: number
): DurationGating | null {
  if (!distance || !fitness) return null;
  
  // Only marathon needs granular MPW gating for now
  if (distance !== 'marathon') {
    // Simple gating for shorter distances
    const minWeeks = distance === 'half' ? 10 : distance === '10k' ? 8 : 6;
    if (selectedWeeks < minWeeks) {
      return {
        minSafe: minWeeks,
        recommended: minWeeks + 2,
        riskLevel: 'caution',
        warningTitle: 'Short Timeline',
        warningMessage: `${minWeeks} weeks is the minimum recommended for ${distance}.`
      };
    }
    return null;
  }
  
  // Marathon-specific gating based on fitness + MPW
  if (fitness === 'beginner' && currentMpw) {
    const mpwNum = getMpwMidpoint(currentMpw);
    
    if (mpwNum <= 17) {
      // Low beginner (12-17 mpw)
      if (selectedWeeks < 18) {
        return {
          minSafe: 18,
          recommended: 20,
          riskLevel: selectedWeeks < 16 ? 'high_risk' : 'caution',
          warningTitle: selectedWeeks < 16 ? 'High Injury Risk' : 'Compressed Timeline',
          warningMessage: `Current base: ~${mpwNum} miles/week\nMarathon peak: 40+ miles/week\n\n` +
            `${selectedWeeks} weeks requires ${Math.round((40/mpwNum - 1) * 100 / selectedWeeks)}%+ weekly increases — ` +
            `significantly above safe 10% guideline.\n\n` +
            `This means TRIPLING your mileage in ${selectedWeeks} weeks.`
        };
      }
    } else {
      // High beginner (18-25 mpw)
      if (selectedWeeks < 16) {
        return {
          minSafe: 16,
          recommended: 18,
          riskLevel: selectedWeeks < 14 ? 'high_risk' : 'caution',
          warningTitle: 'Compressed Timeline',
          warningMessage: `Current base: ~${mpwNum} miles/week\nMarathon peak: 45+ miles/week\n\n` +
            `You're close to intermediate fitness, so this is POSSIBLE but compressed.\n` +
            `Requires consistent execution with ${Math.round((45/mpwNum - 1) * 100 / selectedWeeks)}% weekly increases.`
        };
      }
    }
  } else if (fitness === 'intermediate') {
    if (selectedWeeks < 12) {
      return {
        minSafe: 10,
        recommended: 12,
        riskLevel: selectedWeeks < 10 ? 'high_risk' : 'caution',
        warningTitle: 'Compressed Timeline',
        warningMessage: selectedWeeks < 10 
          ? `10+ weeks recommended for proper build and taper.`
          : `Doable with consistency. 12+ weeks gives more room for periodization.`
      };
    }
  } else if (fitness === 'advanced') {
    if (selectedWeeks < 10) {
      return {
        minSafe: 10,
        recommended: 12,
        riskLevel: 'caution',
        warningTitle: 'Aggressive Timeline',
        warningMessage: `Even with your fitness base, 10+ weeks is recommended for proper marathon prep.`
      };
    }
  }
  
  return null;
}

function getMpwMidpoint(mpw: MpwRange): number {
  switch (mpw) {
    case '12-15': return 14;
    case '16-19': return 18;
    case '20-25': return 22;
    case '25-35': return 30;
    case '35-45': return 40;
    case '45+': return 50;
    default: return 20;
  }
}

// ============================================================================
// METHODOLOGY DEFINITIONS
// ============================================================================

const METHODOLOGIES: Record<Approach, {
  name: string;
  shortDescription: string;
  longDescription: string;
  basedOn: string;
  supported_days: DaysPerWeek[];
}> = {
  'sustainable': {
    name: 'Simple Completion',
    shortDescription: 'Easy-to-follow plan focused on finishing healthy',
    longDescription: 'Effort-based pacing (easy, moderate, hard) with minimal speedwork. Conservative progression designed to get you to the finish line.',
    basedOn: 'Based on Hal Higdon\'s progressive training principles',
    supported_days: ['3-4', '4-5', '5-6']
  },
  'performance_build': {
    name: 'Performance Build',
    shortDescription: 'Structured quality with personalized pacing',
    longDescription: 'Two quality workouts per week with structured intervals and tempo runs. All paces calculated from your 5K time.',
    basedOn: 'Based on established running science',
    supported_days: ['4-5', '5-6', '6-7']
  }
};

// ============================================================================
// GATING LOGIC - GOAL BASED
// ============================================================================

/**
 * Get the available methodology based on goal, fitness, and distance
 * - complete goal → Simple Completion only
 * - performance goal + beginner + marathon → Performance Build locked
 * - performance goal + beginner + shorter distances → Performance Build unlocked
 * - performance goal + intermediate/advanced → Performance Build only
 */
function getMethodologyForGoal(goal: Goal | null, fitness: Fitness | null, distance: Distance | null): {
  approach: Approach | null;
  locked: boolean;
  lockedReason: string;
} {
  if (!goal || !fitness || fitness === 'novice') {
    return { approach: null, locked: true, lockedReason: '' };
  }

  if (goal === 'complete') {
    // Complete goal → Sustainable for all fitness levels
    return { approach: 'sustainable', locked: false, lockedReason: '' };
  }

  if (goal === 'speed') {
    // Performance goal → Performance Build, but locked for beginners doing marathon only
    if (fitness === 'beginner' && distance === 'marathon') {
      return {
        approach: 'performance_build',
        locked: true,
        lockedReason: 'Performance-focused marathon training requires Intermediate+ fitness (25+ mpw). Consider selecting "Complete" goal, or build your base first.'
      };
    }
    return { approach: 'performance_build', locked: false, lockedReason: '' };
  }

  return { approach: null, locked: true, lockedReason: '' };
}

function getAvailableDays(approach: Approach | null): DaysPerWeek[] {
  if (!approach) return ['3-4', '4-5', '5-6', '6-7'];
  // Defensive guard: if approach is not in METHODOLOGIES, return default
  if (!METHODOLOGIES[approach]) {
    console.warn('[PlanWizard] Invalid approach:', approach, 'using default available days');
    return ['3-4', '4-5', '5-6', '6-7'];
  }
  return METHODOLOGIES[approach].supported_days;
}

// ============================================================================
// COMPONENT
// ============================================================================

interface GeneratedPlan {
  plan_id: string;
  name: string;
  description: string;
  duration_weeks: number;
  first_week_sessions: any[];
  preview: any;
}

export default function PlanWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  
  // Default to next Monday
  const getNextMonday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    // Use local date, not UTC
    const year = nextMonday.getFullYear();
    const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
    const day = String(nextMonday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [state, setState] = useState<WizardState>({
    discipline: null,
    distance: null,
    fitness: null,
    currentMpw: null,
    goal: null,
    // Effort Score fields
    paceInputMethod: null,
    hasRecentRace: null,
    effortRaceDistance: null,
    effortRaceTime: '',
    effortRaceRecency: null,
    effortScore: null,
    effortScoreStatus: null,
    effortPaces: null,
    effortPacesSource: 'calculated',
    // Known paces input
    knownEasyPace: '',
    knownFiveKPace: '',
    paceValidationWarning: null,
    // Plan timing
    hasRaceDate: null,
    raceDate: '',
    raceName: '',
    duration: 12,
    startDate: getNextMonday(),
    approach: null,
    daysPerWeek: null,
    strengthFrequency: 0,
    strengthTier: 'injury_prevention',
    equipmentType: 'commercial_gym',
    strengthProtocol: undefined, // Will be set when user selects protocol
    noDoubles: false // Default to allowing doubles (stacking strength on quality days)
  });

  // Saved baselines (loaded from DB)
  const [savedBaselines, setSavedBaselines] = useState<{
    easyPace?: number; // seconds per mile
    fiveKTime?: number; // seconds
    effortScore?: number;
    effortPaces?: TrainingPaces;
    equipment?: string[]; // strength equipment from baselines
  } | null>(null);

  // Load user's saved baselines on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        const { data } = await supabase
          .from('user_baselines')
          .select('performance_numbers, effort_paces, effort_score, equipment')
          .eq('user_id', user.id)
          .maybeSingle();
        
        console.log('[PlanWizard] Loaded baselines:', data);
        
        if (data) {
          const pn = data.performance_numbers || {};
          const ep = data.effort_paces || {};
          
          // Extract raw data - don't pre-calculate, let the selection handler do it
          // This ensures we use the most current performance_numbers when "saved" is selected
          const fiveKTimeRaw = pn.fiveK || pn.fiveKTime;
          const easyPaceRaw = pn.easyPace || pn.easy_pace;
          
          // Convert 5K time to seconds for storage (handle string "MM:SS" format)
          let fiveKTime: number | undefined;
          if (typeof fiveKTimeRaw === 'number') {
            fiveKTime = fiveKTimeRaw;
          } else if (typeof fiveKTimeRaw === 'string') {
            // Parse "MM:SS" format (e.g., "27:00" -> 1620 seconds)
            const parsed = parsePace(fiveKTimeRaw);
            if (parsed) fiveKTime = parsed;
          }
          
          // Convert easy pace to seconds for storage (handle string "MM:SS/mi" format)
          let easyPace: number | undefined;
          if (typeof easyPaceRaw === 'number') {
            easyPace = easyPaceRaw;
          } else if (typeof easyPaceRaw === 'string') {
            const parsed = parsePace(easyPaceRaw);
            if (parsed) easyPace = parsed;
          }
          
          // Store raw values - calculation happens when "saved" is selected
          // But also store stored effort_paces/effort_score as fallback
          const effortScore = data.effort_score || pn.effortScore || pn.effort_score;
          const effortPaces = (ep.base && ep.race && ep.steady && ep.power && ep.speed) ? {
            base: ep.base,
            race: ep.race,
            steady: ep.steady,
            power: ep.power,
            speed: ep.speed
          } : undefined;
          
          // Get equipment data
          const equipment = data.equipment?.strength as string[] | undefined;
          
          // Set if we have ANY meaningful data
          const hasData = effortPaces || effortScore || easyPace || fiveKTime || equipment?.length;
          if (hasData) {
            console.log('[PlanWizard] Setting saved baselines (raw data):', { 
              easyPace, 
              fiveKTime, 
              effortScore, 
              effortPaces, 
              equipment 
            });
            setSavedBaselines({
              easyPace: easyPace || (typeof ep.base === 'number' ? ep.base : undefined),
              fiveKTime: fiveKTime,
              effortScore: typeof effortScore === 'number' ? effortScore : undefined,
              effortPaces,
              equipment
            });
            
            // Auto-set equipment type based on saved preferences
            if (equipment?.length) {
              const hasCommercialGym = equipment.includes('Commercial gym');
              const hasHomeGymEquipment = equipment.some(e => 
                ['Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)'].includes(e)
              );
              if (hasCommercialGym) {
                setState(prev => ({ ...prev, equipmentType: 'commercial_gym' }));
              } else if (hasHomeGymEquipment) {
                setState(prev => ({ ...prev, equipmentType: 'home_gym' }));
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to load baselines:', e);
      }
    })();
  }, []);

  // Get default duration based on distance, fitness, and MPW
  const getDefaultDuration = (distance: Distance | null, fitness: Fitness | null, mpw: MpwRange | null): number => {
    if (distance !== 'marathon') {
      // Shorter distances: 12 weeks default
      return 12;
    }
    
    // Marathon defaults based on fitness
    if (fitness === 'beginner') {
      const mpwNum = mpw ? getMpwMidpoint(mpw) : 18;
      return mpwNum <= 17 ? 20 : 18; // Low beginner: 20, High beginner: 18
    }
    if (fitness === 'intermediate') return 16;
    if (fitness === 'advanced') return 12;
    return 16;
  };

  const updateState = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => {
      const newState = { ...prev, [key]: value };
      
      // Reset dependent fields when parent changes
      if (key === 'fitness') {
        newState.currentMpw = null;
        newState.approach = null;
        newState.daysPerWeek = null;
        // Set default duration for non-marathon or non-beginner
        if (prev.distance !== 'marathon' || value !== 'beginner') {
          newState.duration = getDefaultDuration(prev.distance, value as Fitness, null);
        }
      }
      
      if (key === 'currentMpw') {
        // Set default duration based on MPW
        newState.duration = getDefaultDuration(prev.distance, prev.fitness, value as MpwRange);
      }
      
      if (key === 'goal') {
        // Don't reset approach here - it's set immediately in the goal step's onValueChange
        newState.daysPerWeek = null;
      }
      
      if (key === 'approach') {
        newState.daysPerWeek = null;
      }
      
      return newState;
    });
  };

  // Get methodology based on goal, fitness, and distance
  const methodologyResult = getMethodologyForGoal(state.goal, state.fitness, state.distance);

  // Check if we need MPW for this fitness/distance combo
  const needsMpwQuestion = state.fitness === 'beginner' && state.distance === 'marathon';

  // Map logical step to actual step based on whether we need Effort Score
  const getLogicalStep = (physicalStep: number): string => {
    if (!needsEffortScore) {
      // Complete goal: no effort score step
      const steps = ['discipline', 'distance', 'fitness', 'goal', 'duration', 'startDate', 'strength', 'runningDays'];
      // Bounds check: if out of bounds, clamp to last valid step
      if (physicalStep < 0) return steps[0];
      if (physicalStep >= steps.length) return steps[steps.length - 1];
      return steps[physicalStep] || steps[steps.length - 1];
    } else {
      // Performance goal: includes effort score step
      const steps = ['discipline', 'distance', 'fitness', 'goal', 'effortScore', 'duration', 'startDate', 'strength', 'runningDays'];
      // Bounds check: if out of bounds, clamp to last valid step
      if (physicalStep < 0) return steps[0];
      if (physicalStep >= steps.length) return steps[steps.length - 1];
      return steps[physicalStep] || steps[steps.length - 1];
    }
  };

  const canProceed = (): boolean => {
    const logicalStep = getLogicalStep(step);
    
    switch (logicalStep) {
      case 'discipline': return state.discipline !== null;
      case 'distance': return state.distance !== null;
      case 'fitness': 
        // Novice cannot proceed
        if (state.fitness === 'novice') return false;
        // Beginner marathon needs MPW answer
        if (needsMpwQuestion && !state.currentMpw) return false;
        return state.fitness !== null;
      case 'goal': return state.goal !== null && !methodologyResult.locked;
      case 'effortScore':
        // Must have selected an input method
        if (state.paceInputMethod === null) return false;
        // Saved baselines - already has score
        if (state.paceInputMethod === 'saved') {
          return state.effortScore !== null;
        }
        // If they have a race time, must have entered time and recency
        if (state.paceInputMethod === 'race') {
          if (!state.effortRaceDistance || !state.effortRaceTime || !state.effortRaceRecency) return false;
          // Validate time format (pass distance for correct parsing)
          const seconds = parseTimeToSeconds(state.effortRaceTime, state.effortRaceDistance);
          if (!seconds || seconds < 600) return false; // At least 10 minutes
        }
        // If they know their paces, must have entered both paces
        if (state.paceInputMethod === 'paces') {
          const easySeconds = parsePace(state.knownEasyPace);
          const fiveKSeconds = parsePace(state.knownFiveKPace);
          if (!easySeconds || !fiveKSeconds) return false;
        }
        // Must have a score (calculated, estimated, or from paces)
        return state.effortScore !== null;
      case 'duration': 
        // Must answer race date question
        if (state.hasRaceDate === null) return false;
        // If has race date, must have selected one
        if (state.hasRaceDate && !state.raceDate) return false;
        // Must have valid duration
        return state.duration >= 4;
      case 'startDate': return state.startDate !== '';
      case 'strength': 
        // Strength is optional, but if frequency > 0, protocol is required
        if (state.strengthFrequency > 0) {
          return state.strengthProtocol !== undefined;
        }
        return true; // Strength is optional
      case 'runningDays': return state.daysPerWeek !== null;
      default: return false;
    }
  };

  const isNovice = state.fitness === 'novice';

  const handleNext = () => {
    if (step === 0 && state.discipline !== 'run') {
      // Non-run disciplines do nothing for now
      return;
    }
    
    // Note: approach is now set immediately when goal is selected, not here
    // This prevents layout shifts and timing issues
    
    // Check if we're on the last step (runningDays) - if so, generate
    const logicalStep = getLogicalStep(step);
    if (logicalStep === 'runningDays') {
      handleGenerate();
    } else {
      // Safeguard: don't increment beyond valid step range
      const maxStep = getStepCount() - 1;
      if (step < maxStep) {
      setStep(step + 1);
      } else {
        // Already at max step, try to generate
        handleGenerate();
      }
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setError(null);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateProgress(0);
    setError(null);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setGenerateProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 500);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Please sign in to generate a plan');
        setIsGenerating(false);
        clearInterval(progressInterval);
        return;
      }

      setGenerateProgress(20);

      // Save equipment selection to baselines if not already saved
      if (state.strengthFrequency > 0 && state.strengthProtocol && !savedBaselines?.equipment?.length) {
        const equipmentToSave = state.equipmentType === 'commercial_gym' 
          ? ['Commercial gym'] 
          : ['Home gym', 'Barbell + plates', 'Dumbbells', 'Squat rack / Power cage', 'Bench (flat/adjustable)'];
        
        // First check if user has existing baselines
        const { data: existing } = await supabase
          .from('user_baselines')
          .select('equipment')
          .eq('user_id', user.id)
          .maybeSingle();
        
        // Merge with existing equipment data
        const mergedEquipment = {
          ...(existing?.equipment || {}),
          strength: equipmentToSave
        };
        
        // Upsert equipment to user_baselines (only updates equipment field)
        await supabase
          .from('user_baselines')
          .upsert({
            user_id: user.id,
            equipment: mergedEquipment,
            updated_at: new Date().toISOString()
          }, { 
            onConflict: 'user_id',
            ignoreDuplicates: false 
          });
        console.log('[PlanWizard] Saved equipment preference:', equipmentToSave);
      }

      // Build request body
      const requestBody: Record<string, unknown> = {
        user_id: user.id,
        distance: state.distance,
        fitness: state.fitness,
        goal: state.goal,
        duration_weeks: state.duration,
        start_date: state.startDate,
        race_date: state.hasRaceDate ? state.raceDate : undefined,
        race_name: state.hasRaceDate && state.raceName ? state.raceName : undefined,
        approach: state.approach,
        days_per_week: state.daysPerWeek,
        strength_frequency: state.strengthFrequency,
        strength_tier: state.strengthTier,
        equipment_type: state.equipmentType,
      };

      // Only include strength_protocol if frequency > 0 (protocol is required when strength is selected)
      if (state.strengthFrequency > 0) {
        requestBody.strength_protocol = state.strengthProtocol; // guaranteed by canProceed
        // Auto-set tier to strength_power when protocol is selected
        requestBody.strength_tier = 'strength_power';
        // Include noDoubles if set (only relevant for Performance Build)
        if (state.approach === 'performance_build' && state.noDoubles) {
          requestBody.no_doubles = true;
        }
      } else {
        requestBody.strength_tier = state.strengthTier;
      }

      // Add Effort Score data for Performance Build plans
      // SMART SERVER: Send raw data (5K time) instead of pre-calculated values
      // Server will recalculate as source of truth
      if (state.approach === 'performance_build') {
        // If using saved baselines with 5K time, send raw data for server to calculate
        if (state.paceInputMethod === 'saved' && savedBaselines?.fiveKTime) {
          // Send raw 5K time - server will recalculate effort score
          requestBody.effort_source_distance = 5000; // 5K in meters
          requestBody.effort_source_time = savedBaselines.fiveKTime; // seconds
          requestBody.effort_score_status = 'verified';
          console.log('[PlanWizard] Sending raw 5K time for server calculation:', savedBaselines.fiveKTime);
        }
        // If user entered a race time, send that raw data
        else if (state.effortScoreStatus === 'verified' && state.effortRaceDistance && state.effortRaceTime) {
          const timeSeconds = parseTimeToSeconds(state.effortRaceTime, state.effortRaceDistance);
          if (timeSeconds) {
            requestBody.effort_source_distance = raceDistanceToMeters(state.effortRaceDistance);
            requestBody.effort_source_time = timeSeconds;
            requestBody.effort_score_status = 'verified';
            console.log('[PlanWizard] Sending raw race data for server calculation');
          }
        }
        // Fallback: send calculated values (for "unknown" or manual pace entry)
        // Server will still recalculate if effort_source_* is provided
        else if (state.effortScore && state.effortPaces) {
          requestBody.effort_score = state.effortScore;
          requestBody.effort_score_status = state.effortScoreStatus || 'estimated';
          requestBody.effort_paces = state.effortPaces;
          requestBody.effort_paces_source = state.effortPacesSource;
          console.log('[PlanWizard] Sending pre-calculated effort score (fallback)');
        }
      }

      const response = await supabase.functions.invoke('generate-run-plan', {
        body: requestBody
      });

      clearInterval(progressInterval);
      setGenerateProgress(95);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate plan');
      }

      setGenerateProgress(100);

      // Fetch the plan to get first week sessions
      const { data: planData } = await supabase
        .from('plans')
        .select('name, description, sessions_by_week')
        .eq('id', result.plan_id)
        .single();

      const firstWeekSessions = planData?.sessions_by_week?.['1'] || [];

      // Store generated plan for preview
      setGeneratedPlan({
        plan_id: result.plan_id,
        name: planData?.name || result.preview?.name || 'Training Plan',
        description: planData?.description || result.preview?.description || '',
        duration_weeks: state.duration,
        first_week_sessions: firstWeekSessions,
        preview: result.preview
      });

    } catch (err) {
      clearInterval(progressInterval);
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (!generatedPlan) return;
    
    // Show toast with info about background processing
    toast({
      title: "Building your schedule",
      description: "This takes 1-2 minutes. Feel free to use the app or leave - your plan will be ready when you return.",
      duration: 15000,
    });

    // Navigate to dashboard
    navigate('/');
    
    // Activate in background
    supabase.functions.invoke('activate-plan', {
      body: { plan_id: generatedPlan.plan_id }
    }).then(() => {
      // Trigger plans refresh
      window.dispatchEvent(new CustomEvent('plans:refresh'));
      
      toast({
        title: "Plan ready!",
        description: "Opening your training schedule...",
        duration: 3000,
      });
      
      // Navigate to weekly view of the new plan
      setTimeout(() => {
        navigate('/', { state: { openPlans: true, focusPlanId: generatedPlan.plan_id } });
      }, 500);
    }).catch(err => {
      console.error('Activation error:', err);
      toast({
        title: "Activation issue", 
        description: "Plan saved. Try refreshing the app.",
        variant: "destructive",
        duration: 8000,
      });
    });
  };

  const handleReject = async () => {
    if (!generatedPlan) return;
    
    // Delete the generated plan
    await supabase
      .from('plans')
      .delete()
      .eq('id', generatedPlan.plan_id);

    // Go back to wizard
    setGeneratedPlan(null);
    setStep(8); // Back to last step
  };

  // ============================================================================
  // RENDER STEPS
  // ============================================================================

  const renderStep = () => {
    const logicalStep = getLogicalStep(step);
    
    // Safety check: if step calculation fails, show error instead of black screen
    if (logicalStep === 'unknown') {
      return (
        <StepContainer title="Navigation Error">
          <div className="space-y-4">
            <p className="text-red-400">Step calculation error.</p>
            <div className="text-xs text-gray-400 space-y-1">
              <p>Step: {step}</p>
              <p>Goal: {state.goal || 'null'}</p>
            </div>
            <Button onClick={handleBack} variant="outline" className="w-full">Go Back</Button>
          </div>
        </StepContainer>
      );
    }
    
    switch (logicalStep) {
      case 'discipline':
        return (
          <StepContainer title="Select discipline">
            <RadioGroup
              value={state.discipline || ''}
              onValueChange={(v) => updateState('discipline', v as Discipline)}
              className="space-y-3"
            >
              <RadioOption value="run" label="Run" />
              <RadioOption value="ride" label="Ride" disabled />
              <RadioOption value="swim" label="Swim" disabled />
              <RadioOption value="triathlon" label="Triathlon" disabled />
              <RadioOption value="hybrid" label="Hybrid" disabled />
            </RadioGroup>
          </StepContainer>
        );

      case 'distance':
        return (
          <StepContainer title="What distance?">
            <RadioGroup
              value={state.distance || ''}
              onValueChange={(v) => updateState('distance', v as Distance)}
              className="space-y-3"
            >
              <RadioOption value="5k" label="5K" />
              <RadioOption value="10k" label="10K" />
              <RadioOption value="half" label="Half Marathon" />
              <RadioOption value="marathon" label="Marathon" />
            </RadioGroup>
          </StepContainer>
        );

      case 'fitness':
        // Show base-building prompt for novice
        if (state.fitness === 'novice') {
          return (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="font-semibold text-amber-800 mb-2">Build Your Base First</h3>
                <p className="text-sm text-amber-700 mb-4">
                  Your current fitness level (0-12 mpw) needs base building before structured training plans.
                </p>
                <div className="text-sm text-amber-700 space-y-2">
                  <p className="font-medium">All training plans require:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Ability to run 6+ miles comfortably</li>
                    <li>Current base of 12-15 miles/week minimum</li>
                    <li>Consistent running 3-4 days/week</li>
                  </ul>
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">Recommended: 8-12 Week Base Building</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Start with easy running 3x per week, gradually building to 15-20 miles per week with comfortable 8-mile long runs.
                </p>
                <p className="text-xs text-blue-600">
                  Once you're running 12+ miles per week consistently, return here to start a training plan.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => updateState('fitness', null)}
                className="w-full"
              >
                Select Different Fitness Level
              </Button>
            </div>
          );
        }
        
        // Show MPW follow-up for beginner marathon
        if (state.fitness === 'beginner' && state.distance === 'marathon') {
          return (
            <StepContainer title="What's your current weekly mileage?">
              <p className="text-sm text-gray-500 mb-4">
                This helps us recommend the right plan duration for your base.
              </p>
              <RadioGroup
                value={state.currentMpw || ''}
                onValueChange={(v) => updateState('currentMpw', v as MpwRange)}
                className="space-y-3"
              >
                <RadioOption 
                  value="12-15" 
                  label="12-15 miles/week" 
                  description="Lower range — will need more time to build safely" 
                />
                <RadioOption 
                  value="16-19" 
                  label="16-19 miles/week" 
                  description="Mid range — standard beginner timeline" 
                />
                <RadioOption 
                  value="20-25" 
                  label="20-25 miles/week" 
                  description="Upper range — closer to intermediate, more flexibility" 
                />
              </RadioGroup>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateState('fitness', null)}
                className="mt-4 text-gray-500"
              >
                ← Change fitness level
              </Button>
            </StepContainer>
          );
        }

        return (
          <StepContainer title="Current fitness level">
            <RadioGroup
              value={state.fitness || ''}
              onValueChange={(v) => updateState('fitness', v as Fitness)}
              className="space-y-4"
            >
              <RadioOption 
                value="novice" 
                label="Novice" 
                description="0-12 mpw — New to running or returning from break" 
              />
              <RadioOption 
                value="beginner" 
                label="Beginner" 
                description="12-25 mpw — Running 3-4 days/week, comfortable 6-8 mile runs" 
              />
              <RadioOption 
                value="intermediate" 
                label="Intermediate" 
                description="25-40 mpw — Running 5-6 days/week, regular 10-12 mile long runs" 
              />
              <RadioOption 
                value="advanced" 
                label="Advanced" 
                description="40+ mpw — Experienced runner, 6-7 days/week, 14+ mile long runs" 
              />
            </RadioGroup>
          </StepContainer>
        );

      case 'goal':
        return (
          <StepContainer title="What's your goal?">
            <RadioGroup
              value={state.goal || ''}
              onValueChange={(v) => {
                const newGoal = v as Goal;
                updateState('goal', newGoal);
                // Set approach immediately when goal is selected (not in handleNext)
                // This prevents layout shifts when the strength step renders
                const methodology = getMethodologyForGoal(newGoal, state.fitness, state.distance);
                if (methodology.approach && !methodology.locked) {
                  updateState('approach', methodology.approach);
                } else {
                  updateState('approach', null);
                }
              }}
              className="space-y-4"
            >
              {/* Complete Goal → Simple Completion */}
              <div className={`p-4 rounded-xl transition-all ${state.goal === 'complete' ? 'bg-white/[0.12] border-2 border-white/30' : 'bg-white/[0.05] border border-white/15 hover:bg-white/[0.08]'}`}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="complete" id="complete" className="mt-1" />
                  <Label htmlFor="complete" className="flex-1 cursor-pointer">
                    <span className="block font-medium text-white">Complete</span>
                    <span className="block text-xs text-white/50 mt-0.5 italic">For first-timers, returning runners, or anyone focused on finishing strong</span>
                    <span className="block text-sm text-white/60 mt-2">
                      Build the endurance to finish confidently. Training is effort-based (easy, moderate, hard) so you can run by feel and stay healthy throughout the build.
                    </span>
                  </Label>
                </div>
              </div>
              
              {/* Performance Goal → Performance Build (locked only for beginners doing marathon) */}
              {(() => {
                const isSpeedLocked = state.fitness === 'beginner' && state.distance === 'marathon';
                return (
              <div className={`p-4 rounded-xl transition-all ${isSpeedLocked ? 'bg-white/[0.03] border border-white/10 opacity-60' : state.goal === 'speed' ? 'bg-white/[0.12] border-2 border-white/30' : 'bg-white/[0.05] border border-white/15 hover:bg-white/[0.08]'}`}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem 
                    value="speed" 
                    id="speed" 
                    className="mt-1" 
                    disabled={isSpeedLocked}
                  />
                  <Label htmlFor="speed" className={`flex-1 ${isSpeedLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <span className="block font-medium text-white">
                      {isSpeedLocked ? 'Performance (Locked)' : 'Performance'}
                    </span>
                    <span className="block text-xs text-white/50 mt-0.5 italic">For runners focused on improving overall running performance</span>
                    {isSpeedLocked ? (
                      <span className="block text-xs text-orange-400 mt-2">
                        Performance-focused marathon training requires Intermediate+ fitness (25+ mpw). Consider selecting "Complete" goal, or build your base first.
                      </span>
                    ) : (
                      <span className="block text-sm text-white/60 mt-2">
                        Train with structured workouts and personalized pace zones. Includes intervals, tempo, and race-pace work designed to improve efficiency, endurance, and speed development across distances.
                      </span>
                    )}
                  </Label>
                </div>
              </div>
                );
              })()}
            </RadioGroup>
            
            {/* Disclaimer */}
            {state.goal && (
              <p className="text-xs text-white/40 mt-4">
                {state.goal === 'complete' 
                  ? 'Plan based on progressive training principles.'
                  : 'Plan based on established running science.'}
                {' '}Personalized to your fitness level.
              </p>
            )}
          </StepContainer>
        );

      case 'effortScore':
        // EFFORT SCORE STEP (only for performance/Performance Build goal)
        // Calculate score when user enters race time
        const handleRaceTimeChange = (timeStr: string) => {
          setState(prev => {
            const newState = { ...prev, effortRaceTime: timeStr };
            
            // If we have all the data, calculate the score
            if (prev.effortRaceDistance && timeStr && prev.effortRaceRecency) {
              const seconds = parseTimeToSeconds(timeStr, prev.effortRaceDistance);
              if (seconds && seconds >= 600) {
                const meters = raceDistanceToMeters(prev.effortRaceDistance);
                const result = calculateEffortScoreResult(meters, seconds);
                // Get current MPW for adjustment (use state.currentMpw or infer from fitness)
                const currentMpw = state.currentMpw || (state.fitness === 'advanced' ? '35-45' : state.fitness === 'intermediate' ? '25-35' : '16-19');
                const adjustedScore = adjustScoreForRecency(
                  result.score, 
                  prev.effortRaceRecency,
                  currentMpw
                );
                newState.effortScore = adjustedScore;
                newState.effortPaces = result.paces;
                newState.effortScoreStatus = 'verified';
              }
            }
            return newState;
          });
        };
        
        const handleRaceDistanceChange = (dist: RaceDistance) => {
          setState(prev => {
            const newState = { ...prev, effortRaceDistance: dist };
            
            // Recalculate if we have time
            if (prev.effortRaceTime && prev.effortRaceRecency) {
              const seconds = parseTimeToSeconds(prev.effortRaceTime, dist);
              if (seconds && seconds >= 600) {
                const meters = raceDistanceToMeters(dist);
                const result = calculateEffortScoreResult(meters, seconds);
                const currentMpw = state.currentMpw || (state.fitness === 'advanced' ? '35-45' : state.fitness === 'intermediate' ? '25-35' : '16-19');
                const adjustedScore = adjustScoreForRecency(
                  result.score,
                  prev.effortRaceRecency,
                  currentMpw
                );
                newState.effortScore = adjustedScore;
                newState.effortPaces = result.paces;
                newState.effortScoreStatus = 'verified';
              }
            }
            return newState;
          });
        };
        
        const handleRecencyChange = (recency: RaceRecency) => {
          setState(prev => {
            const newState = { ...prev, effortRaceRecency: recency };
            
            // Recalculate with new recency
            if (prev.effortRaceDistance && prev.effortRaceTime) {
              const seconds = parseTimeToSeconds(prev.effortRaceTime, prev.effortRaceDistance);
              if (seconds && seconds >= 600) {
                const meters = raceDistanceToMeters(prev.effortRaceDistance);
                const result = calculateEffortScoreResult(meters, seconds);
                const currentMpw = state.currentMpw || (state.fitness === 'advanced' ? '35-45' : state.fitness === 'intermediate' ? '25-35' : '16-19');
                const adjustedScore = adjustScoreForRecency(result.score, recency, currentMpw);
                newState.effortScore = adjustedScore;
                newState.effortPaces = result.paces;
                newState.effortScoreStatus = 'verified';
              }
            }
            return newState;
          });
        };
        
        
        // Handler for known paces calculation
        const handleKnownPacesChange = (easyPace: string, fiveKTime: string) => {
          const easySeconds = parsePace(easyPace);
          // Parse 5K time (MM:SS format) and convert to pace
          const fiveKTimeSeconds = parsePace(fiveKTime); // Reuse pace parser for MM:SS
          
          if (!easySeconds || !fiveKTimeSeconds) {
            // Clear results if either value is invalid
            setState(prev => ({
              ...prev,
              knownEasyPace: easyPace,
              knownFiveKPace: fiveKTime,
              effortScore: null,
              effortPaces: null,
              effortScoreStatus: null,
              paceValidationWarning: null
            }));
            return;
          }
          
          // Convert 5K time to pace: time / 3.1 miles
          const fiveKPaceSeconds = Math.round(fiveKTimeSeconds / 3.1);
          
          // Calculate paces and validate
          const result = calculatePacesFromKnownPaces(easySeconds, fiveKPaceSeconds);
          const validation = validatePaceConsistency(easySeconds, fiveKPaceSeconds);
          
          setState(prev => ({
            ...prev,
            knownEasyPace: easyPace,
            knownFiveKPace: fiveKTime,
            effortScore: result.score,
            effortPaces: result.paces,
            effortScoreStatus: 'estimated',
            paceValidationWarning: validation.warning || null
          }));
        };
        
        return (
          <StepContainer title="What's your running fitness?">
            <p className="text-sm text-gray-600 mb-4">
              We use this to calculate your personalized training paces and estimate your race pace for your goal distance.
            </p>
            <div className="space-y-6">
              {/* Input method selection */}
              <RadioGroup
                value={state.paceInputMethod || ''}
                onValueChange={(v) => {
                  const method = v as PaceInputMethod;
                  
                  // If using saved baselines, auto-populate from them
                  // PRIORITY: Use current profile data (5K time) over stored effort_paces/effort_score
                  if (method === 'saved' && savedBaselines) {
                    let paces = savedBaselines.effortPaces;
                    let score = savedBaselines.effortScore;
                    
                    // If we have 5K time in performance_numbers, recalculate from that (most current data)
                    if (savedBaselines.fiveKTime) {
                      const fiveKMeters = 5000;
                      const result = calculateEffortScoreResult(fiveKMeters, savedBaselines.fiveKTime);
                      score = result.score;
                      
                      // If we also have easy pace, use calculatePacesFromKnownPaces for more accuracy
                      if (savedBaselines.easyPace) {
                        const fiveKPaceSeconds = Math.round(savedBaselines.fiveKTime / 3.10686); // 5K = 3.10686 miles
                        const paceResult = calculatePacesFromKnownPaces(savedBaselines.easyPace, fiveKPaceSeconds);
                        score = paceResult.score;
                        paces = paceResult.paces;
                        console.log('[PlanWizard] Recalculated from performance_numbers (5K + easy pace)');
                      } else {
                        paces = result.paces;
                        console.log('[PlanWizard] Recalculated from performance_numbers (5K time only)');
                      }
                    }
                    // If we have score but no paces, calculate paces
                    else if (!paces && score) {
                      paces = getPacesFromScore(score);
                    }
                    // Otherwise use stored effort_paces/effort_score (fallback)
                    else if (paces || score) {
                      console.log('[PlanWizard] Using stored effort_paces/effort_score (no 5K time in profile)');
                    }
                    
                  setState(prev => ({
                    ...prev,
                    paceInputMethod: method,
                      hasRecentRace: false,
                      effortScore: score || null,
                      effortPaces: paces || null,
                      effortScoreStatus: score ? 'verified' : null,
                      effortRaceDistance: null,
                      effortRaceTime: '',
                      effortRaceRecency: null,
                      knownEasyPace: '',
                      knownFiveKPace: '',
                      paceValidationWarning: null
                    }));
                    return;
                  }
                  
                  setState(prev => ({
                    ...prev,
                    paceInputMethod: method,
                    hasRecentRace: method === 'race' ? true : method === 'unknown' ? false : null,
                    // Clear previous data when switching methods
                    effortRaceDistance: method === 'race' ? prev.effortRaceDistance : null,
                    effortRaceTime: method === 'race' ? prev.effortRaceTime : '',
                    effortRaceRecency: method === 'race' ? prev.effortRaceRecency : null,
                    knownEasyPace: method === 'paces' ? prev.knownEasyPace : '',
                    knownFiveKPace: method === 'paces' ? prev.knownFiveKPace : '',
                    effortScore: null,
                    effortPaces: null,
                    effortScoreStatus: null,
                    paceValidationWarning: null
                  }));
                }}
                className="space-y-2"
              >
                {/* Always show saved option if ANY baseline data exists */}
                {savedBaselines && (
                  <RadioOption 
                    value="saved" 
                    label="Use my saved baselines" 
                    description={
                      savedBaselines.effortScore 
                        ? `Effort Score: ${savedBaselines.effortScore}${savedBaselines.easyPace ? ` • Easy: ${formatPace(savedBaselines.easyPace)}/mi` : ''}`
                        : savedBaselines.effortPaces 
                          ? `Easy: ${formatPace(savedBaselines.effortPaces.base)}/mi • Race: ${formatPace(savedBaselines.effortPaces.race)}/mi`
                          : savedBaselines.easyPace
                            ? `Easy pace: ${formatPace(savedBaselines.easyPace)}/mi`
                            : savedBaselines.fiveKTime
                              ? `5K time: ${Math.floor(savedBaselines.fiveKTime / 60)}:${String(savedBaselines.fiveKTime % 60).padStart(2, '0')}`
                              : 'Your saved performance data'
                    }
                  />
                )}
                <RadioOption value="race" label={savedBaselines ? "Enter new race time" : "I have a recent race time"} description="Recommended for accurate pacing" />
                <RadioOption value="paces" label={savedBaselines ? "Enter new paces" : "I know my easy pace and 5K time"} description="We'll calculate your training zones" />
                <RadioOption value="unknown" label="I don't know my paces" description="We'll help you figure them out" />
              </RadioGroup>
              
              {/* Race time entry */}
              {state.paceInputMethod === 'race' && (
                <div className="space-y-5 pt-4 border-t border-white/10">
                  <p className="text-sm text-gray-400">Which race distance?</p>
                  <div className="flex flex-wrap gap-2">
                    {(['5k', '10k', 'half', 'marathon'] as RaceDistance[]).map(dist => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => handleRaceDistanceChange(dist)}
                        className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                          state.effortRaceDistance === dist 
                            ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-medium' 
                            : 'border-teal-500/40 text-gray-300 hover:border-teal-400 hover:text-teal-300'
                        }`}
                      >
                        {dist === 'half' ? 'Half' : dist === 'marathon' ? 'Marathon' : dist.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  
                  {state.effortRaceDistance && (
                    <div className="pt-2">
                      <p className="text-sm text-teal-400 mb-2">Your time?</p>
                      <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder={state.effortRaceDistance === 'marathon' || state.effortRaceDistance === 'half' ? 'H:MM:SS' : 'MM:SS'}
                        value={state.effortRaceTime}
                        onChange={(e) => handleRaceTimeChange(e.target.value)}
                          className="w-32 p-3 bg-white/5 border border-teal-500/30 rounded-xl text-lg font-mono text-teal-200 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                        />
                        <span className="text-gray-500 text-sm">
                          {state.effortRaceDistance === 'marathon' || state.effortRaceDistance === 'half' ? 'H:MM:SS' : 'MM:SS'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {state.effortRaceDistance && state.effortRaceTime && (
                    <div className="pt-3">
                      <p className="text-sm text-gray-400 mb-3">When did you run this?</p>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { value: 'recent', label: 'Last 3 months' },
                          { value: '3-6months', label: '3-6 months' },
                          { value: '6-12months', label: '6-12 months' },
                          { value: 'over1year', label: '1+ year' }
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleRecencyChange(opt.value)}
                            className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                              state.effortRaceRecency === opt.value
                                ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-medium'
                                : 'border-teal-500/40 text-gray-300 hover:border-teal-400 hover:text-teal-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Show calculated score with editable paces - glass morphism */}
                  {state.effortScore && state.effortPaces && (
                    <div className="relative mt-4">
                      {/* Teal glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 via-cyan-500/10 to-transparent rounded-2xl blur-xl" />
                      <div className="relative p-5 bg-black/40 backdrop-blur-sm rounded-xl border border-teal-500/30">
                        <p className="text-lg font-semibold text-white">
                        Effort Score: {state.effortScore}
                      </p>
                        <div className="mt-4 text-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Base pace:</span>
                            <div className="flex items-center">
                          <input
                            type="text"
                            key={`base-${state.effortPaces.base}`}
                            defaultValue={formatPace(state.effortPaces.base)}
                            onBlur={(e) => {
                              const seconds = parsePace(e.target.value);
                              if (seconds && state.effortPaces) {
                                setState(prev => ({
                                  ...prev,
                                  effortPaces: { ...prev.effortPaces!, base: seconds },
                                  effortPacesSource: 'manual'
                                }));
                              } else {
                                e.target.value = formatPace(state.effortPaces!.base);
                              }
                            }}
                                className="w-20 px-2 py-1.5 text-right font-mono text-teal-200 bg-white/10 border border-teal-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                              /><span className="ml-2 text-gray-500">/mi</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Race pace:</span>
                            <div className="flex items-center">
                          <input
                            type="text"
                            key={`race-${state.effortPaces.race}`}
                            defaultValue={formatPace(state.effortPaces.race)}
                            onBlur={(e) => {
                              const seconds = parsePace(e.target.value);
                              if (seconds && state.effortPaces) {
                                setState(prev => ({
                                  ...prev,
                                  effortPaces: { ...prev.effortPaces!, race: seconds },
                                  effortPacesSource: 'manual'
                                }));
                              } else {
                                e.target.value = formatPace(state.effortPaces!.race);
                              }
                            }}
                                className="w-20 px-2 py-1.5 text-right font-mono text-teal-200 bg-white/10 border border-teal-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                              /><span className="ml-2 text-gray-500">/mi</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Steady pace:</span>
                            <div className="flex items-center">
                          <input
                            type="text"
                            key={`steady-${state.effortPaces.steady}`}
                            defaultValue={formatPace(state.effortPaces.steady)}
                            onBlur={(e) => {
                              const seconds = parsePace(e.target.value);
                              if (seconds && state.effortPaces) {
                                setState(prev => ({
                                  ...prev,
                                  effortPaces: { ...prev.effortPaces!, steady: seconds },
                                  effortPacesSource: 'manual'
                                }));
                              } else {
                                e.target.value = formatPace(state.effortPaces!.steady);
                              }
                            }}
                                className="w-20 px-2 py-1.5 text-right font-mono text-teal-200 bg-white/10 border border-teal-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-400"
                              /><span className="ml-2 text-gray-500">/mi</span>
                        </div>
                      </div>
                        </div>
                        {/* Estimated Marathon Time */}
                        {state.effortPaces?.race && (
                          <div className="mt-4 pt-4 border-t border-teal-500/20">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400">Est. marathon time:</span>
                              <span className="font-mono font-semibold text-lg text-teal-300">
                                {(() => {
                                  const marathonSeconds = state.effortPaces.race * 26.2;
                                  const hours = Math.floor(marathonSeconds / 3600);
                                  const mins = Math.floor((marathonSeconds % 3600) / 60);
                                  const secs = Math.round(marathonSeconds % 60);
                                  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                                })()}
                              </span>
                            </div>
                          </div>
                        )}
                        <p className="mt-4 text-xs text-teal-400/80">
                        {state.effortPacesSource === 'manual' 
                          ? 'Using your custom paces.' 
                          : state.effortRaceRecency && state.effortRaceRecency !== 'recent'
                            ? 'Adjusted for race recency. Tap to customize.'
                            : 'Tap to customize.'}
                      </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Known paces entry */}
              {state.paceInputMethod === 'paces' && (
                <div className="space-y-6 pt-5 border-t border-white/10">
                  {/* Easy Pace Input */}
                  <div>
                    <p className="text-sm font-medium text-teal-400 mb-1">Easy pace</p>
                    <p className="text-xs text-gray-400 mb-3">
                      Your comfortable, conversational pace. You could talk in full sentences while running at this pace.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="10:30"
                        value={state.knownEasyPace}
                        onChange={(e) => handleKnownPacesChange(e.target.value, state.knownFiveKPace)}
                        className="w-28 p-3 bg-white/5 border border-teal-500/30 rounded-xl text-lg font-mono text-teal-200 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                      />
                      <span className="text-gray-500">/mi</span>
                    </div>
                  </div>
                  
                  {/* 5K Time Input */}
                  <div>
                    <p className="text-sm font-medium text-teal-400 mb-1">5K time</p>
                    <p className="text-xs text-gray-400 mb-3">
                      Your best recent 5K time (3.1 miles). An all-out effort, hard but sustainable for 20-30 minutes.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="25:00"
                        value={state.knownFiveKPace}
                        onChange={(e) => handleKnownPacesChange(state.knownEasyPace, e.target.value)}
                        className="w-28 p-3 bg-white/5 border border-teal-500/30 rounded-xl text-lg font-mono text-teal-200 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                      />
                      <span className="text-gray-500">MM:SS</span>
                    </div>
                  </div>
                  
                  {/* Validation warning */}
                  {state.paceValidationWarning && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl backdrop-blur-sm">
                      <p className="text-sm text-amber-200">{state.paceValidationWarning}</p>
                    </div>
                  )}
                  
                  {/* Show calculated paces - glass morphism with teal glow */}
                  {state.effortScore && state.effortPaces && state.paceInputMethod === 'paces' && (
                    <div className="relative mt-4">
                      {/* Teal glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 via-cyan-500/10 to-transparent rounded-2xl blur-xl" />
                      <div className="relative p-5 bg-black/40 backdrop-blur-sm rounded-xl border border-teal-500/30">
                        <p className="text-lg font-semibold text-white">
                        Effort Score: {state.effortScore}
                      </p>
                        <p className="text-xs text-teal-300 mt-1 mb-4">
                        Calculated from your 5K time. Your easy pace is used as-is.
                      </p>
                        <div className="text-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Base pace:</span>
                            <span className="font-mono text-teal-200">{formatPace(state.effortPaces.base)}/mi</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Race pace <span className="text-xs text-teal-400/60">(marathon)</span>:</span>
                            <span className="font-mono font-semibold text-teal-200">{formatPace(state.effortPaces.race)}/mi</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Steady pace <span className="text-xs text-teal-400/60">(threshold)</span>:</span>
                            <span className="font-mono text-teal-200">{formatPace(state.effortPaces.steady)}/mi</span>
                          </div>
                        </div>
                        {/* Estimated Marathon Time */}
                        <div className="mt-4 pt-4 border-t border-teal-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Est. marathon time:</span>
                            <span className="font-mono font-semibold text-lg text-teal-300">
                              {(() => {
                                const marathonSeconds = state.effortPaces.race * 26.2;
                                const hours = Math.floor(marathonSeconds / 3600);
                                const mins = Math.floor((marathonSeconds % 3600) / 60);
                                const secs = Math.round(marathonSeconds % 60);
                                return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Using saved baselines - glass morphism with teal glow */}
              {state.paceInputMethod === 'saved' && state.effortScore && state.effortPaces && (
                <div className="relative mt-4">
                  {/* Yellow glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-200/20 via-yellow-100/10 to-transparent rounded-2xl blur-xl" />
                  <div className={`relative p-5 bg-black/40 backdrop-blur-sm rounded-xl border ${getDisciplineBorderClass('run', '30')}`}>
                    <p className="text-lg font-semibold text-white">
                      ✓ Using Saved Paces
                    </p>
                    <p className={`text-xs ${getDisciplineTextClassVariant('run', '400')} mt-1 mb-4`}>
                      Effort Score: {state.effortScore}
                    </p>
                    <div className="text-sm text-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                        <span className="text-gray-400">Base pace:</span>
                        <span className={`font-mono ${getDisciplineTextClassVariant('run', '400')}`}>{formatPace(state.effortPaces.base)}/mi</span>
                        </div>
                        <div className="flex items-center justify-between">
                        <span className="text-gray-400">Race pace:</span>
                        <span className={`font-mono ${getDisciplineTextClassVariant('run', '400')}`}>{formatPace(state.effortPaces.race)}/mi</span>
                        </div>
                        <div className="flex items-center justify-between">
                        <span className="text-gray-400">Interval pace:</span>
                        <span className={`font-mono ${getDisciplineTextClassVariant('run', '400')}`}>{formatPace(state.effortPaces.power)}/mi</span>
                        </div>
                      </div>
                    {/* Estimated Marathon Time */}
                    <div className={`mt-4 pt-4 border-t ${getDisciplineBorderClass('run', '30')}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Est. marathon time:</span>
                        <span className={`font-mono font-semibold text-lg ${getDisciplineTextClassVariant('run', '400')}`}>
                          {(() => {
                            const marathonSeconds = state.effortPaces.race * 26.2;
                            const hours = Math.floor(marathonSeconds / 3600);
                            const mins = Math.floor((marathonSeconds % 3600) / 60);
                            const secs = Math.round(marathonSeconds % 60);
                            return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                          })()}
                        </span>
                      </div>
                    </div>
                    <p className={`text-xs ${getDisciplineTextClassVariant('run', '400')}/80 mt-4`}>
                      These paces will be used for your training plan.
                    </p>
                  </div>
                    </div>
                  )}
              
              {/* Don't know paces - simple guidance */}
              {state.paceInputMethod === 'unknown' && (
                <div className="mt-6 space-y-5">
                  <p className="text-sm text-gray-400">
                    Go to Baselines to schedule a 5K time trial or easy pace test. We'll calculate your training paces from the results.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/baselines')}
                      className="px-5 py-2.5 border border-teal-400 text-teal-300 text-sm font-medium rounded-full hover:bg-teal-500/10 transition-colors"
                    >
                      Go to Baselines →
                    </button>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-gray-500 mb-3">
                      Don't want to test? Choose "Complete" goal for effort-based training that doesn't require precise paces.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(step - 1)}
                      className="px-5 py-2.5 border border-teal-500/40 text-gray-300 text-sm rounded-full hover:border-teal-400 hover:text-teal-300 transition-colors"
                    >
                      ← Back to goal selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          </StepContainer>
        );

      case 'duration':
        const durationGating = getDurationGating(state.distance, state.fitness, state.currentMpw, state.duration);
        
        // Get recommended quick-select buttons based on fitness
        const getQuickDurations = () => {
          if (state.distance === 'marathon') {
            if (state.fitness === 'beginner') {
              const mpwNum = state.currentMpw ? getMpwMidpoint(state.currentMpw) : 18;
              return mpwNum <= 17 ? [16, 18, 20, 22] : [14, 16, 18, 20];
            }
            if (state.fitness === 'intermediate') return [12, 14, 16, 18];
            if (state.fitness === 'advanced') return [10, 12, 14, 16];
          }
          return [8, 12, 16, 18];
        };
        
        // Calculate weeks from race date (use ceil to include race week)
        const calculateWeeksFromRaceDate = (raceDate: string): number => {
          if (!raceDate) return 12;
          const race = new Date(raceDate + 'T00:00:00');
          const nextMon = new Date(getNextMonday() + 'T00:00:00');
          const diffMs = race.getTime() - nextMon.getTime();
          const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
          return Math.max(4, Math.min(24, diffWeeks));
        };
        
        // Calculate start date from race date and duration
        const calculateStartFromRace = (raceDate: string, weeks: number): string => {
          if (!raceDate) return getNextMonday();
          const race = new Date(raceDate + 'T00:00:00');
          const start = new Date(race.getTime() - (weeks * 7 * 24 * 60 * 60 * 1000));
          // Adjust to Monday
          const dayOfWeek = start.getDay();
          const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
          start.setDate(start.getDate() + daysToMonday);
          const year = start.getFullYear();
          const month = String(start.getMonth() + 1).padStart(2, '0');
          const day = String(start.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        // Get minimum date for race (at least 8 weeks from now)
        const getMinRaceDate = () => {
          const today = new Date();
          today.setDate(today.getDate() + 8 * 7);
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, '0');
          const day = String(today.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        // Handle race date selection
        const handleRaceDateChange = (raceDate: string) => {
          const weeks = calculateWeeksFromRaceDate(raceDate);
          const startDate = calculateStartFromRace(raceDate, weeks);
          
          // Check if this matches a major marathon (only for marathon distance)
          const matches = state.distance === 'marathon' ? findMatchingMarathons(raceDate) : [];
          const exactMatch = matches.find(m => m.diffDays === 0);
          
          setState(prev => {
            // Determine new race name:
            // 1. If there's an exact match, use it
            // 2. If current name matches a suggestion, keep it
            // 3. Otherwise clear it (user will need to select)
            let newRaceName = '';
            if (exactMatch) {
              newRaceName = exactMatch.marathon.name;
            } else if (prev.raceName && matches.some(m => m.marathon.name === prev.raceName)) {
              newRaceName = prev.raceName;
            }
            
            return {
            ...prev,
            raceDate,
            duration: weeks,
            startDate,
              raceName: newRaceName
            };
          });
        };
        
        return (
          <StepContainer title="Do you have a target race?">
            <div className="space-y-6">
              {/* Race date toggle */}
              <RadioGroup
                value={state.hasRaceDate === null ? '' : state.hasRaceDate ? 'yes' : 'no'}
                onValueChange={(v) => {
                  const hasRace = v === 'yes';
                  setState(prev => ({
                    ...prev,
                    hasRaceDate: hasRace,
                    raceDate: hasRace ? prev.raceDate : '',
                    startDate: hasRace ? prev.startDate : getNextMonday()
                  }));
                }}
                className="space-y-2"
              >
                <RadioOption value="yes" label="Yes, I have a race date" />
                <RadioOption value="no" label="No, just building fitness" />
              </RadioGroup>
              
              {/* Race date picker */}
              {state.hasRaceDate === true && (
                <div className="space-y-4 pt-4 border-t">
                  <p className="text-sm text-gray-400">When is your race?</p>
                  <input
                    type="date"
                    value={state.raceDate}
                    min={getMinRaceDate()}
                    onChange={(e) => handleRaceDateChange(e.target.value)}
                    className="w-full p-3 bg-white/5 border border-teal-500/30 rounded-xl text-base text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                  <div className="space-y-2">
                    {/* Show marathon suggestions if any match */}
                    {state.distance === 'marathon' && state.raceDate && (() => {
                      const matches = findMatchingMarathons(state.raceDate);
                      if (matches.length > 0) {
                        return (
                          <div className="space-y-2">
                            <p className="text-xs text-gray-400">Select your race:</p>
                            <div className="flex flex-wrap gap-2">
                              {matches.map(({ marathon, diffDays }) => (
                                <button
                                  key={marathon.name}
                                  type="button"
                                  onClick={() => setState(prev => ({ ...prev, raceName: marathon.name }))}
                                  className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                                    state.raceName === marathon.name
                                      ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-medium'
                                      : 'border-teal-500/40 text-gray-300 hover:border-teal-400 hover:text-teal-300'
                                  }`}
                                >
                                  {marathon.name}
                                  {diffDays > 0 && <span className="text-xs text-gray-500 ml-1">(±{diffDays}d)</span>}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setState(prev => ({ ...prev, raceName: '' }))}
                                className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                                  state.raceName && !matches.some(m => m.marathon.name === state.raceName)
                                    ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-medium'
                                    : 'border-teal-500/40 text-gray-300 hover:border-teal-400 hover:text-teal-300'
                                }`}
                              >
                                Other
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {/* Custom race name input - show if Other selected or no matches */}
                    {(state.distance !== 'marathon' || !state.raceDate || findMatchingMarathons(state.raceDate).length === 0 || 
                      (state.raceName && !findMatchingMarathons(state.raceDate).some(m => m.marathon.name === state.raceName))) && (
                    <input
                      type="text"
                      value={state.raceName}
                      onChange={(e) => setState(prev => ({ ...prev, raceName: e.target.value }))}
                      placeholder="Race name (optional)"
                        className="w-full p-3 bg-white/5 border border-teal-500/30 rounded-xl text-base text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                    )}
                  </div>
                  {state.raceDate && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400">When do you want to start training?</p>
                      <p className="text-xs text-gray-500">4-24 weeks before race day</p>
                      <input
                        type="date"
                        value={state.startDate}
                        max={(() => {
                          // Max start date is 4 weeks before race
                          const race = new Date(state.raceDate + 'T00:00:00');
                          race.setDate(race.getDate() - 4 * 7);
                          const year = race.getFullYear();
                          const month = String(race.getMonth() + 1).padStart(2, '0');
                          const day = String(race.getDate()).padStart(2, '0');
                          return `${year}-${month}-${day}`;
                        })()}
                        min={(() => {
                          // Min start date is 24 weeks before race (max plan length)
                          const race = new Date(state.raceDate + 'T00:00:00');
                          race.setDate(race.getDate() - 24 * 7);
                          const year = race.getFullYear();
                          const month = String(race.getMonth() + 1).padStart(2, '0');
                          const day = String(race.getDate()).padStart(2, '0');
                          return `${year}-${month}-${day}`;
                        })()}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          if (!newStart) return; // Don't update if empty
                          // Calculate weeks from start to race (use ceil to include race week)
                          const startDate = new Date(newStart + 'T00:00:00');
                          const raceDate = new Date(state.raceDate + 'T00:00:00');
                          if (isNaN(startDate.getTime()) || isNaN(raceDate.getTime())) return;
                          const diffMs = raceDate.getTime() - startDate.getTime();
                          const weeks = Math.max(4, Math.min(24, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000))));
                          setState(prev => ({ ...prev, startDate: newStart, duration: weeks }));
                        }}
                        className="w-full p-3 bg-white/5 border border-teal-500/30 rounded-xl text-base text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                      />
                      {/* Plan duration summary - only show if valid dates */}
                      {state.startDate && state.raceDate && !isNaN(state.duration) && (
                        <div className="p-4 bg-teal-500/10 rounded-xl border border-teal-500/30">
                          <p className="text-sm text-teal-300 font-medium">{state.duration} week plan</p>
                          <p className="text-xs text-teal-400/80 mt-1">
                            {(() => {
                              const startDate = new Date(state.startDate + 'T00:00:00');
                              const raceDate = new Date(state.raceDate + 'T00:00:00');
                              if (isNaN(startDate.getTime()) || isNaN(raceDate.getTime())) return 'Select dates';
                              return `${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} → ${raceDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
                            })()}
                        </p>
                      </div>
                      )}
                    </div>
                  )}
                  
                  {/* Warning if weeks are outside recommended range */}
                  {state.raceDate && durationGating && (
                    <div className={`p-4 rounded-xl border ${
                      durationGating.riskLevel === 'high_risk' 
                        ? 'bg-red-500/10 border-red-500/40' 
                        : 'bg-amber-500/10 border-amber-500/40'
                    }`}>
                      <p className={`text-sm font-medium mb-1 ${
                        durationGating.riskLevel === 'high_risk' ? 'text-red-300' : 'text-amber-300'
                      }`}>
                        {durationGating.warningTitle}
                      </p>
                      <p className={`text-xs ${
                        durationGating.riskLevel === 'high_risk' ? 'text-red-400/80' : 'text-amber-400/80'
                      }`}>
                        {durationGating.warningMessage}
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Manual weeks selector (no race date) */}
              {state.hasRaceDate === false && (
                <div className="space-y-4 pt-4 border-t">
                  <p className="text-sm text-gray-600">How many weeks?</p>
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateState('duration', Math.max(4, state.duration - 1))}
                      disabled={state.duration <= 4}
                    >
                      -
                    </Button>
                    <span className="text-2xl font-semibold w-16 text-center">{state.duration}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateState('duration', Math.min(24, state.duration + 1))}
                      disabled={state.duration >= 24}
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {getQuickDurations().map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => updateState('duration', w)}
                        className={`${state.duration === w ? 'font-semibold text-black' : 'text-gray-500 hover:text-black'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  
                  {/* MPW-based duration warning */}
                  {durationGating && (
                    <div className={`mt-2 p-4 rounded-lg border ${
                      durationGating.riskLevel === 'high_risk' 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <p className={`text-sm font-medium mb-2 ${
                        durationGating.riskLevel === 'high_risk' ? 'text-red-800' : 'text-amber-800'
                      }`}>
                        {durationGating.warningTitle}
                      </p>
                      <p className={`text-xs whitespace-pre-line mb-3 ${
                        durationGating.riskLevel === 'high_risk' ? 'text-red-700' : 'text-amber-700'
                      }`}>
                        {durationGating.warningMessage}
                      </p>
                      <button
                        type="button"
                        onClick={() => updateState('duration', durationGating.recommended)}
                        className={`text-sm underline hover:no-underline ${
                          durationGating.riskLevel === 'high_risk' ? 'text-red-800' : 'text-amber-800'
                        }`}
                      >
                        Use {durationGating.recommended} weeks instead
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </StepContainer>
        );

      case 'startDate':
        // If they have a race date, start date is already set - just confirm
        // If no race date, let them pick start date
        const planEndDate = state.startDate 
          ? new Date(new Date(state.startDate + 'T00:00:00').getTime() + (state.duration * 7 - 1) * 24 * 60 * 60 * 1000)
          : null;
        
        // Calculate projected finish time
        // PRIORITY: Use actual race pace from effortPaces.race (user's VDOT/goal) if available
        // FALLBACK: Use VDOT table lookup from effort score
        const projectedFinishTime = (() => {
          if (!state.distance) return null;
          
          // If we have actual race pace, calculate from pace × distance (matches generator logic)
          if (state.effortPaces?.race) {
            const raceDistanceMiles: Record<RaceDistance, number> = {
              '5k': 3.10686,   // 5km in miles
              '10k': 6.21371,  // 10km in miles
              'half': 13.1,
              'marathon': 26.2
            };
            const distanceMiles = raceDistanceMiles[state.distance as RaceDistance];
            if (distanceMiles) {
              // race pace is in seconds per mile, so: distance × pace = total seconds
              return Math.round(distanceMiles * state.effortPaces.race);
            }
          }
          
          // Fallback to VDOT table lookup if no race pace available
          if (state.effortScore) {
            return getProjectedFinishTime(state.effortScore, state.distance as RaceDistance);
          }
          
          return null;
        })();
        
        return (
          <StepContainer title={state.hasRaceDate ? "Confirm your schedule" : "When do you want to start?"}>
            <div className="space-y-4">
              {state.hasRaceDate ? (
                // Race date mode - show summary
                <div className="space-y-4">
                  <div className="p-4 bg-white/[0.05] backdrop-blur-lg rounded-xl border-2 border-white/15">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Race day:</span>
                        <span className="font-medium text-white">{state.raceDate ? new Date(state.raceDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Plan starts:</span>
                        <span className="font-medium text-white">{state.startDate ? new Date(state.startDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Duration:</span>
                        <span className="font-medium text-white">{state.duration ? `${state.duration} weeks` : '—'}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Show Effort Score and projected finish time for Performance goal */}
                  {state.effortScore && projectedFinishTime && (
                    <div className="p-4 bg-blue-500/10 backdrop-blur-lg rounded-xl border-2 border-blue-400/30">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-blue-300">Effort Score:</span>
                          <span className="font-semibold text-blue-100">{state.effortScore}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-300">Projected finish:</span>
                          <span className="font-semibold text-blue-100">{formatFinishTime(projectedFinishTime)}</span>
                        </div>
                        {state.effortPaces && (
                          <div className="flex justify-between">
                            <span className="text-blue-300">Goal pace:</span>
                            <span className="font-semibold text-blue-100">{formatPace(state.effortPaces.race)}/mi</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-blue-300/80 mt-2">
                        Based on your fitness level. All workouts will use these paces.
                      </p>
                    </div>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => setState(prev => ({ ...prev, hasRaceDate: null, raceDate: '' }))}
                    className="text-sm text-white/50 hover:text-white/80 underline"
                  >
                    Change race date
                  </button>
                </div>
              ) : (
                // No race date - pick start date
                <>
                  <input
                    type="date"
                    value={state.startDate}
                    onChange={(e) => updateState('startDate', e.target.value)}
                    className="w-full p-3 bg-white/[0.08] border border-white/20 rounded-lg text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  {planEndDate && (
                    <p className="text-sm text-white/50">
                      Plan ends: {planEndDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </>
              )}
            </div>
          </StepContainer>
        );

      case 'strength':
        // STRENGTH STEP (moved before running days)
        return (
          <StepContainer title="Add strength training?">
            <div className="space-y-6">
              {/* Frequency */}
              <div>
                <p className="text-sm text-gray-500 mb-3">How often?</p>
                <RadioGroup
                  value={state.strengthFrequency.toString()}
                  onValueChange={(v) => {
                    const freq = parseInt(v) as 0 | 2 | 3;
                    updateState('strengthFrequency', freq);
                    // Clear protocol and reset tier if frequency is 0
                    if (freq === 0) {
                      updateState('strengthProtocol', undefined);
                      updateState('strengthTier', 'injury_prevention');
                    }
                  }}
                  className="space-y-2"
                >
                  <RadioOption value="0" label="No strength" />
                  <RadioOption 
                    value="2" 
                    label="2 days per week" 
                    description="Recommended"
                  />
                  <RadioOption 
                    value="3" 
                    label="3 days per week" 
                    description="Add upper body for balance and aesthetics"
                  />
                </RadioGroup>
              </div>
              
              {/* Protocol selection - show directly when frequency > 0 */}
              {state.strengthFrequency > 0 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-gray-400 mb-3">What do you want strength training to do for your training?</p>
                  <RadioGroup
                    value={state.strengthProtocol || ''}
                    onValueChange={(v) => {
                      // Only set valid protocol IDs, never empty string
                      const validProtocols: StrengthProtocol[] = ['durability', 'neural_speed', 'upper_aesthetics'];
                      if (validProtocols.includes(v as StrengthProtocol)) {
                        // Batch both updates in a single state update to avoid multiple re-renders
                        setState(prev => ({
                          ...prev,
                          strengthProtocol: v as StrengthProtocol,
                          strengthTier: 'strength_power'
                        }));
                      }
                    }}
                    className="space-y-3"
                  >
                    {/* Durability */}
                    <div className={`p-4 rounded-xl border transition-colors ${
                      state.strengthProtocol === 'durability' 
                        ? 'border-teal-500/60 bg-teal-500/15' 
                        : 'border-teal-500/30 bg-black/40 hover:border-teal-500/50'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="durability" id="durability" className="mt-1" />
                        <Label htmlFor="durability" className="flex-1 cursor-pointer">
                          <span className="font-medium text-white">Durability</span>
                          <span className="block text-sm text-gray-400 mt-1">
                            Classic runner-strength exercises to build muscular support so you can handle training volume more reliably.
                          </span>
                          <span className="block text-xs text-gray-500 mt-2">
                            • Step-ups, lunges, calves, unilateral work
                          </span>
                          <span className="block text-xs text-gray-500">
                            • Moderate effort, no heavy compounds
                          </span>
                          <span className="block text-xs text-amber-400/80 mt-2 font-medium">
                            Tradeoff: no heavy compounds or strength PR focus.
                          </span>
                          <span className="block text-xs text-teal-400 mt-2">
                            Best for: Distance runners, volume increases, injury-prone athletes
                          </span>
                        </Label>
                      </div>
                    </div>
                    
                    {/* Neural Speed */}
                    <div className={`p-4 rounded-xl border transition-colors ${
                      state.strengthProtocol === 'neural_speed' 
                        ? 'border-teal-500/60 bg-teal-500/15' 
                        : 'border-teal-500/30 bg-black/40 hover:border-teal-500/50'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="neural_speed" id="neural_speed" className="mt-1" />
                        <Label htmlFor="neural_speed" className="flex-1 cursor-pointer">
                          <span className="font-medium text-white">Neural Speed</span>
                          <span className="block text-sm text-gray-400 mt-1">
                            Heavy, low-rep compound lifts to support power and efficiency without interfering with run training.
                          </span>
                          <span className="block text-xs text-gray-500 mt-2">
                            • Squats, trap bar deadlifts, bench, rows
                          </span>
                          <span className="block text-xs text-gray-500">
                            • Very low reps, very low volume, strict RIR
                          </span>
                          <span className="block text-xs text-amber-400/80 mt-2 font-medium">
                            Important: This is a neural efficiency approach, not a strength-building program. You will not add noticeable muscle mass. Strength numbers may increase slightly, but that is not the goal. The benefit ideally shows up in how easy fast paces feel, not in the gym.
                          </span>
                          <span className="block text-xs text-gray-500 mt-2">
                            Tradeoff: Requires good technique/equipment. Bodyweight tier downgrades to maintenance.
                          </span>
                          <span className="block text-xs text-teal-400 mt-2">
                            Best for: Performance-oriented runners, speed work, want strength without soreness
                          </span>
                        </Label>
                      </div>
                    </div>
                    
                    {/* Upper Aesthetics */}
                    <div className={`p-4 rounded-xl border transition-colors ${
                      state.strengthProtocol === 'upper_aesthetics' 
                        ? 'border-teal-500/60 bg-teal-500/15' 
                        : 'border-teal-500/30 bg-black/40 hover:border-teal-500/50'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="upper_aesthetics" id="upper_aesthetics" className="mt-1" />
                        <Label htmlFor="upper_aesthetics" className="flex-1 cursor-pointer">
                          <span className="font-medium text-white">Upper Aesthetics</span>
                          <span className="block text-sm text-gray-400 mt-1">
                            Prioritizes upper-body strength while keeping lower-body work light so running performance stays the priority.
                          </span>
                          <span className="block text-xs text-gray-500 mt-2">
                            • Higher-rep upper work with progressive overload
                          </span>
                          <span className="block text-xs text-gray-500">
                            • Lower body kept light and supportive
                          </span>
                          <span className="block text-xs text-amber-400/80 mt-2 font-medium">
                            Tradeoff: lower body is maintained, not pushed.
                          </span>
                          <span className="block text-xs text-teal-400 mt-2">
                            Best for: Endurance athletes motivated by physique or upper-body weakness
                          </span>
                          {state.goal === 'speed' && state.strengthProtocol === 'upper_aesthetics' && (
                            <span className="block text-xs text-blue-400/80 mt-2 italic">
                              Note: This combination increases total weekly training load. Recommended for runners already training consistently.
                            </span>
                          )}
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}
              
              {/* Equipment selection - show when protocol is selected */}
              {state.strengthFrequency > 0 && state.strengthProtocol && (
                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-400">Where will you train?</p>
                    {savedBaselines?.equipment?.length ? (
                      <a 
                        href="/baselines" 
                        className="text-xs text-amber-400 hover:text-amber-300"
                      >
                        Edit equipment →
                      </a>
                    ) : null}
                  </div>
                  {savedBaselines?.equipment?.length ? (
                    <p className="text-xs text-amber-400/70 mb-3">
                      Using your saved equipment: {savedBaselines.equipment.slice(0, 3).join(', ')}
                      {savedBaselines.equipment.length > 3 ? ` +${savedBaselines.equipment.length - 3} more` : ''}
                    </p>
                  ) : null}
                  <RadioGroup
                    value={state.equipmentType}
                    onValueChange={(v) => updateState('equipmentType', v as EquipmentType)}
                    className="space-y-3"
                  >
                    <div className={`p-4 rounded-xl border transition-colors ${
                      state.equipmentType === 'commercial_gym' 
                        ? 'border-amber-500/60 bg-amber-500/15' 
                        : 'border-amber-500/30 bg-black/40 hover:border-amber-500/50'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="commercial_gym" id="commercial_gym" className="mt-1" />
                        <Label htmlFor="commercial_gym" className="flex-1 cursor-pointer">
                          <span className="font-medium text-white">Commercial Gym</span>
                          <span className="block text-sm text-gray-400 mt-1">
                            Full gym with rack, cables, machines
                          </span>
                          <span className="block text-xs text-gray-500 mt-1">
                            {state.strengthFrequency === 3 
                              ? 'Squats, hip thrusts, lat pulldowns, box jumps'
                              : 'Squats, hip thrusts, RDL, box jumps'}
                          </span>
                        </Label>
                      </div>
                    </div>
                    <div className={`p-4 rounded-xl border transition-colors ${
                      state.equipmentType === 'home_gym' 
                        ? 'border-amber-500/60 bg-amber-500/15' 
                        : 'border-amber-500/30 bg-black/40 hover:border-amber-500/50'
                    }`}>
                      <div className="flex items-start space-x-3">
                        <RadioGroupItem value="home_gym" id="home_gym" className="mt-1" />
                        <Label htmlFor="home_gym" className="flex-1 cursor-pointer">
                          <span className="font-medium text-white">Home Gym</span>
                          <span className="block text-sm text-gray-400 mt-1">
                            Rack, bench, barbell, dumbbells, bands
                          </span>
                          <span className="block text-xs text-gray-500 mt-1">
                            {state.strengthFrequency === 3 
                              ? 'Rack for: Squats, inverted rows. Barbell for: Hip thrusts, RDL'
                              : 'Rack for: Squats. Barbell for: Hip thrusts, RDL'}
                          </span>
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}
              
              {/* No Doubles option - only for Performance Build (Jack Daniels) */}
              {state.strengthFrequency > 0 && state.strengthProtocol && state.approach === 'performance_build' && (
                <div className="pt-4 border-t border-white/10">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      id="noDoubles"
                      checked={state.noDoubles || false}
                      onChange={(e) => updateState('noDoubles', e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-white/30 bg-black/40 text-teal-500 focus:ring-teal-500 focus:ring-offset-0"
                    />
                    <Label htmlFor="noDoubles" className="flex-1 cursor-pointer">
                      <span className="font-medium text-white">Avoid stacking strength on quality run days</span>
                      <span className="block text-sm text-gray-400 mt-1">
                        If checked, strength sessions won't be scheduled on the same day as your quality runs (intervals, tempo). This may move lower body work to Wednesday or Saturday depending on your protocol.
                      </span>
                    </Label>
                  </div>
                </div>
              )}
              
            </div>
          </StepContainer>
        );

      case 'runningDays':
        // RUNNING DAYS STEP (now after strength, with recommendations)
        try {
        const availableDays = getAvailableDays(state.approach);
        
        // Get recommended running days based on strength selection
        const getRunDaysRecommendation = () => {
          if (state.strengthFrequency === 0) {
            return { recommended: '5-6', warn: null };
          }
          if (state.strengthFrequency === 2) {
            return { recommended: '4-5', warn: '6-7' };
          }
          // 3x strength
          return { recommended: '4-5', warn: '5-6' };
        };
        const runRec = getRunDaysRecommendation();
        
        // Check if current selection is high volume
        const isHighVolume = (days: DaysPerWeek | null) => {
          if (!days) return false;
          if (state.strengthFrequency === 3 && (days === '5-6' || days === '6-7')) return true;
          if (state.strengthFrequency === 2 && days === '6-7') return true;
          return false;
        };
        
        return (
          <StepContainer title="Running days per week">
            <RadioGroup
              value={state.daysPerWeek || ''}
              onValueChange={(v) => updateState('daysPerWeek', v as DaysPerWeek)}
              className="space-y-3"
            >
              <RadioOption 
                value="3-4" 
                label="3-4 days" 
                description="3 on recovery weeks"
                disabled={!availableDays.includes('3-4')} 
              />
              <RadioOption 
                value="4-5" 
                label="4-5 days" 
                description={runRec.recommended === '4-5' ? 'Recommended • 4 on recovery weeks' : '4 on recovery weeks'}
                disabled={!availableDays.includes('4-5')} 
              />
              <RadioOption 
                value="5-6" 
                label="5-6 days" 
                description={state.strengthFrequency === 3 ? 'High volume • 5 on recovery weeks' : (runRec.recommended === '5-6' ? 'Recommended • 5 on recovery weeks' : '5 on recovery weeks')}
                disabled={!availableDays.includes('5-6')} 
              />
              <RadioOption 
                value="6-7" 
                label="6 days" 
                description={state.strengthFrequency > 0 ? 'Very high volume • No reduction on recovery' : 'No reduction on recovery weeks'}
                disabled={!availableDays.includes('6-7')} 
              />
            </RadioGroup>
            
            {/* Show volume warning */}
            {isHighVolume(state.daysPerWeek) && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl">
                <p className="text-sm font-medium text-amber-300">High Training Volume</p>
                <p className="text-xs text-amber-400/80 mt-1">
                  {state.daysPerWeek === '6-7' ? '6' : '5-6'} days running + {state.strengthFrequency}x strength = 10+ hours/week. 
                  This is advanced volume. Consider {runRec.recommended} days running for better recovery.
                </p>
              </div>
            )}
            
            {/* Show detailed weekly structure based on strength + running selection */}
            {state.daysPerWeek && (
              <div className="mt-4 p-4 bg-black/40 backdrop-blur-sm rounded-xl border border-teal-500/30 space-y-2">
                <p className="text-sm font-medium text-teal-300">Your typical week:</p>
                {(() => {
                  const runDays = state.daysPerWeek === '3-4' ? 4 : state.daysPerWeek === '4-5' ? 5 : 6; // 5-6 and 6-7 both cap at 6
                  const strengthDays = state.strengthFrequency;
                  // Count actual doubles: strength on Mon/Fri + upper on Wed
                  // Mon always has a run, Wed has run if 5+ days, Fri has run only if 6 days
                  let doubleDays = 0;
                  if (strengthDays >= 2) {
                    doubleDays += 1; // Monday always has Easy + Strength
                    if (runDays >= 6) doubleDays += 1; // Friday only has run if 6 days
                  }
                  if (strengthDays >= 3 && runDays >= 5) {
                    doubleDays += 1; // Wednesday has Easy + Upper if 5+ days
                  }
                  
                  // Build day-by-day breakdown based on actual selections
                  const days: { day: string; activities: string[] }[] = [
                    { day: 'Mon', activities: [] },
                    { day: 'Tue', activities: [] },
                    { day: 'Wed', activities: [] },
                    { day: 'Thu', activities: [] },
                    { day: 'Fri', activities: [] },
                    { day: 'Sat', activities: [] },
                    { day: 'Sun', activities: [] },
                  ];
                  
                  // Sunday: Always long run
                  days[6].activities.push('Long run');
                  
                  // Tuesday: Q1 (Intervals)
                  days[1].activities.push('Intervals');
                  
                  // Thursday: Q2 (Tempo)
                  days[3].activities.push('Tempo');
                  
                  // Saturday: Always rest
                  days[5].activities.push('Rest');
                  
                  // Strength placement
                  if (strengthDays >= 2) {
                    days[0].activities.push('Strength'); // Monday
                    days[4].activities.push('Strength'); // Friday
                  }
                  if (strengthDays === 3) {
                    days[2].activities.push('Upper (opt)'); // Wednesday
                  }
                  
                  // Easy runs based on running days
                  // Always have runs on Mon, Tue, Thu, Sun (4 days minimum)
                  if (!days[0].activities.includes('Intervals') && !days[0].activities.includes('Tempo')) {
                    days[0].activities.unshift('Easy');
                  }
                  
                  // 5+ days: Add Wednesday easy
                  if (runDays >= 5 && !days[2].activities.some(a => a.includes('Upper'))) {
                    days[2].activities.unshift('Easy');
                  } else if (runDays >= 5 && days[2].activities.some(a => a.includes('Upper'))) {
                    days[2].activities.unshift('Easy');
                  }
                  
                  // 6 days: Add Friday easy
                  if (runDays >= 6) {
                    days[4].activities.unshift('Easy');
                  }
                  
                  // Format output
                  const formatDay = (d: { day: string; activities: string[] }) => {
                    if (d.activities.length === 0) return null;
                    if (d.activities[0] === 'Rest') return `${d.day}: OFF`;
                    return `${d.day}: ${d.activities.join(' + ')}`;
                  };
                  
                  const dayLines = days.map(formatDay).filter(Boolean);
                  
                  return (
                    <div className="text-sm text-gray-300 space-y-1">
                      {dayLines.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                      <p className="text-teal-400/80 mt-2 pt-2 border-t border-teal-500/20">
                        {runDays} running days • {strengthDays > 0 ? `${doubleDays} doubles` : 'No strength'}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </StepContainer>
        );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return (
            <StepContainer title="Error Rendering Step">
              <div className="space-y-4">
                <p className="text-red-400">An error occurred while rendering this step.</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Error: {errorMessage}</p>
                  <p>Step: {step}</p>
                  <p>Approach: {state.approach || 'null'}</p>
                  <p>Goal: {state.goal || 'null'}</p>
                </div>
                <Button onClick={handleBack} variant="outline" className="w-full">Go Back</Button>
              </div>
            </StepContainer>
          );
        }

      default:
        // Fallback: if we get an unknown step, show an error and allow navigation back
        console.error('[PlanWizard] Unknown logical step:', logicalStep, 'at physical step:', step, 'needsEffortScore:', needsEffortScore);
        return (
          <StepContainer title="Navigation Error">
            <div className="space-y-4">
              <p className="text-red-400">
                An error occurred while navigating. Please go back and try again.
              </p>
              <Button
                onClick={() => {
                  // Reset to a safe step (strength step, which is always valid)
                  const safeStep = needsEffortScore ? 7 : 6;
                  setStep(safeStep);
                }}
                variant="outline"
                className="w-full"
              >
                Go Back to Strength Step
              </Button>
            </div>
          </StepContainer>
        );
    }
  };

  // Step count varies: performance goal adds Effort Score step (step 4)
  const needsEffortScore = state.goal === 'speed';
  const getStepCount = () => needsEffortScore ? 9 : 8;

  // Show generating overlay
  if (isGenerating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(to bottom, #27272a, #18181b, #000000)' }}>
        <div className="w-full max-w-xs space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2 text-white">Building your plan</h2>
            <p className="text-sm text-white/60">
              Creating {state.duration} weeks of personalized training...
            </p>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-white/10 rounded-full h-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(generateProgress, 100)}%` }}
            />
          </div>
          
          <p className="text-center text-sm text-white/40">
            {generateProgress < 30 ? 'Analyzing parameters...' :
             generateProgress < 60 ? 'Generating sessions...' :
             generateProgress < 90 ? 'Optimizing schedule...' :
             'Finalizing plan...'}
          </p>
        </div>
      </div>
    );
  }

  // Show plan preview
  if (generatedPlan) {
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const sortedSessions = [...generatedPlan.first_week_sessions].sort((a, b) => 
      dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day)
    );

    // Helper to determine if session is running vs strength
    const isRunningSession = (name: string) => {
      const runKeywords = ['run', 'easy', 'tempo', 'interval', 'pace', 'long', 'recovery', 'jog'];
      return runKeywords.some(kw => name.toLowerCase().includes(kw));
    };

    return (
      <div className="min-h-screen relative" style={{ background: 'linear-gradient(to bottom, #0f172a, #0c0c0c, #000000)' }}>
        {/* Subtle teal glow at top */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, ${getDisciplineGlowColor('run', 0.15)} 0%, transparent 70%)` }}
        />
        
        {/* Header */}
        <div className="relative border-b border-teal-500/20 px-4 py-3">
          <h1 className="text-lg font-semibold text-center text-white">Your Plan</h1>
        </div>

        {/* Content */}
        <div className="relative p-4 pb-32 max-w-lg mx-auto">
          {/* Plan summary card with teal accent */}
          <div className="mb-6 bg-black/40 backdrop-blur-xl border border-teal-500/30 rounded-2xl p-5 relative overflow-hidden">
            {/* Teal glow behind card */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-teal-500/20 rounded-full blur-2xl" />
            <h2 className="text-xl font-semibold mb-2 text-teal-400 relative">{generatedPlan.name}</h2>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed relative">{generatedPlan.description}</p>
            <div className="flex gap-4 text-sm relative">
              <span className="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {generatedPlan.duration_weeks} weeks
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 text-gray-300 border border-white/20">
                Starts {new Date(state.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Training info notes */}
          {state.strengthFrequency > 0 && (
            <div className="mb-6 p-4 bg-amber-500/10 backdrop-blur-sm rounded-xl border border-amber-500/20">
              <p className="text-sm text-amber-200 leading-relaxed">
                <span className="font-semibold text-amber-300">Strength Training:</span> Weights are calculated from your 1RM baselines using research-backed ratios. Each session has a target RIR (Reps In Reserve). Adjust weights up or down based on how your actual RIR compares to the target.
              </p>
            </div>
          )}

          {/* Week 1 preview */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-teal-400/80 mb-3 tracking-wide">WEEK 1 PREVIEW</h3>
            <div className="space-y-2">
              {(() => {
                // Group sessions by day
                const sessionsByDay: Record<string, any[]> = {};
                sortedSessions.forEach((session: any) => {
                  const day = session.day || 'Unscheduled';
                  if (!sessionsByDay[day]) sessionsByDay[day] = [];
                  sessionsByDay[day].push(session);
                });
                
                return dayOrder.map(day => {
                  const daySessions = sessionsByDay[day] || [];
                  const isRest = daySessions.length === 0;
                  
                  return (
                    <div key={day} className={`p-3 rounded-xl transition-all ${
                      isRest 
                        ? 'bg-white/[0.02] border border-white/5' 
                        : 'bg-black/40 backdrop-blur-md border border-white/10'
                    }`}>
                      <div className="flex gap-3">
                        <span className={`text-xs font-semibold w-10 pt-1 ${isRest ? 'text-white/20' : 'text-teal-500'}`}>
                          {day.slice(0, 3)}
                        </span>
                        {isRest ? (
                          <span className="text-sm text-white/20 italic">Rest</span>
                        ) : (
                          <div className="flex-1 space-y-3">
                            {daySessions.map((session: any, idx: number) => {
                              const isRun = isRunningSession(session.name);
                              return (
                                <div key={idx} className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      {/* Color indicator */}
                                      <div className={`w-1 h-4 rounded-full ${isRun ? 'bg-teal-500' : 'bg-amber-500'}`} />
                                      <span className={`font-medium text-sm ${isRun ? 'text-teal-300' : 'text-amber-300'}`}>
                                        {session.name}
                                      </span>
                                    </div>
                                  {session.description && (
                                      <p className="text-xs text-gray-400 mt-1 ml-3 leading-relaxed">{session.description}</p>
                                  )}
                                </div>
                                  <span className={`text-xs ml-2 px-2 py-0.5 rounded ${isRun ? 'bg-teal-500/20 text-teal-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {session.duration}m
                                  </span>
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div 
          className="fixed bottom-0 left-0 right-0 px-4 py-3"
          style={{ 
            background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.8))',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: `1px solid ${getDisciplineGlowColor('run', 0.2)}`,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)'
          }}
        >
          <div className="max-w-lg mx-auto flex justify-between items-center">
            <button
              type="button"
              onClick={handleReject}
              className="px-5 py-2.5 rounded-full bg-white/[0.06] backdrop-blur-md border border-white/15 text-gray-300 hover:bg-white/[0.1] hover:text-white transition-all"
            >
              Start Over
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="px-6 py-2.5 rounded-full bg-teal-600 border border-teal-400/40 text-white font-medium hover:bg-teal-500 transition-all shadow-lg shadow-teal-500/20"
            >
              Accept Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  const safeBack = () => { if (window.history.length > 1) navigate(-1); else navigate('/'); };

  return (
    <div className="mobile-app-container">
      {/* Header */}
      <MobileHeader
        rightContent={
          <span className="text-sm text-white/60">
            {step + 1} of {getStepCount()}
          </span>
        }
        menuItems={
          <>
                  <DropdownMenuItem onClick={() => navigate('/baselines')} className="text-white/80 hover:text-white hover:bg-white/10">Training Baselines</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/connections')} className="text-white/80 hover:text-white hover:bg-white/10">Connections</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/')} className="text-white/80 hover:text-white hover:bg-white/10">Dashboard</DropdownMenuItem>
          </>
        }
      />

      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div 
          className="h-full bg-white transition-all duration-300"
          style={{ width: `${((step + 1) / getStepCount()) * 100}%` }}
        />
      </div>

      <main className="mobile-main-content pb-20">
        {/* Content */}
        <div className="p-6 max-w-md mx-auto">
          {renderStep()}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </main>

      {/* Navigation */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{ 
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)'
        }}
      >
        <div className="max-w-md mx-auto flex justify-between items-center">
          {step > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={isGenerating}
              className="px-4 py-2 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/[0.12] hover:text-white disabled:opacity-50 flex items-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-4 py-2 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/[0.12] hover:text-white flex items-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || isGenerating || (step === 0 && state.discipline !== 'run')}
            className="px-5 py-2 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/25 text-white font-medium hover:bg-white/[0.16] disabled:opacity-50 flex items-center transition-colors"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : getLogicalStep(step) === 'runningDays' ? (
              'Generate Plan'
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StepContainer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">{title}</h2>
      {children}
    </div>
  );
}

interface RadioOptionProps {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

function RadioOption({ value, label, description, disabled }: RadioOptionProps) {
  return (
    <div className={`flex items-start space-x-3 ${disabled ? 'opacity-40' : ''}`}>
      <RadioGroupItem value={value} id={value} disabled={disabled} className="mt-1" />
      <Label htmlFor={value} className={`flex-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <span className="block font-medium">{label}</span>
        {description && (
          <span className="block text-sm text-gray-500 mt-0.5">{description}</span>
        )}
      </Label>
    </div>
  );
}

interface LockedRadioOptionProps {
  value: string;
  label: string;
  description?: string;
  locked: boolean;
  lockedReason: string;
  onValueChange: (value: string) => void;
  currentValue: string;
}

function LockedRadioOption({ value, label, description, locked, lockedReason, onValueChange, currentValue }: LockedRadioOptionProps) {
  if (locked) {
    return (
      <div className="flex items-start space-x-3 opacity-50 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1">
          <span className="block font-medium text-gray-500">{label}</span>
          {description && (
            <span className="block text-sm text-gray-400 mt-0.5">{description}</span>
          )}
          <span className="block text-xs text-amber-600 mt-1">{lockedReason}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start space-x-3">
      <RadioGroupItem value={value} id={value} className="mt-1" />
      <Label htmlFor={value} className="flex-1 cursor-pointer">
        <span className="block font-medium">{label}</span>
        {description && (
          <span className="block text-sm text-gray-500 mt-0.5">{description}</span>
        )}
      </Label>
    </div>
  );
}
