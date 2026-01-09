// ============================================================================
// STRENGTH OVERLAY SYSTEM v2.0
// 
// PHILOSOPHY: Upper Body Gains + Lower Body Support
// 
// Traditional "strength for runners" treats lifting as maintenance. We flip it:
// - Upper Body: Progressive overload, real strength gains, aesthetic improvements
// - Lower Body: Injury prevention, power maintenance, running support
//
// WHY THIS WORKS:
// - Upper body doesn't compete with running adaptations (different muscles)
// - Users see strength gains throughout training (psychologically motivating)
// - "Finish your marathon AND set PRs on bench press"
//
// TIERS:
// - Tier 1 (Bodyweight): Progressive bodyweight exercises with clear level-ups
// - Tier 2 (Barbell): Heavy compound lifts with % of 1RM
//
// FREQUENCY:
// - 3x/week (Performance): Mon Lower + Wed Upper + Fri Lower (Fri optional in peak)
// - 2x/week (Minimal): Mon Lower + Fri Lower (no upper body gains focus)
// ============================================================================

import { TrainingPlan, Session, StrengthExercise, Phase, PhaseStructure } from './types.ts';

type StrengthTier = 'bodyweight' | 'barbell';
type StrengthFrequency = 2 | 3;

// ============================================================================
// MAIN OVERLAY FUNCTION
// ============================================================================

export function overlayStrength(
  plan: TrainingPlan,
  frequency: StrengthFrequency,
  phaseStructure: PhaseStructure,
  tier: StrengthTier = 'bodyweight'
): TrainingPlan {
  const modifiedPlan = { ...plan };
  const modifiedSessions: Record<string, Session[]> = {};
  const totalWeeks = Object.keys(plan.sessions_by_week).length;

  for (const [weekStr, sessions] of Object.entries(plan.sessions_by_week)) {
    const week = parseInt(weekStr, 10);
    const phase = getCurrentPhase(week, phaseStructure);
    const isRecovery = phaseStructure.recovery_weeks.includes(week);
    const isTaper = phase.name === 'Taper';
    const weekInPhase = week - phase.start_week + 1;
    
    let strengthSessions: Session[];
    
    if (isTaper) {
      strengthSessions = createTaperSessions(tier, week, totalWeeks);
    } else {
      strengthSessions = createWeekSessions(
        week,
        weekInPhase,
        phase,
        frequency,
        isRecovery,
        tier,
        totalWeeks
      );
    }

    modifiedSessions[weekStr] = [...sessions, ...strengthSessions];
  }

  modifiedPlan.sessions_by_week = modifiedSessions;
  
  // Baselines depend on tier
  modifiedPlan.baselines_required = {
    ...modifiedPlan.baselines_required,
    strength: tier === 'barbell' 
      ? ['bench1RM', 'row1RM', 'hipThrust1RM', 'rdl1RM']
      : [] // Bodyweight tier doesn't need 1RM baselines
  };

  return modifiedPlan;
}

// ============================================================================
// SESSION CREATION
// ============================================================================

function createWeekSessions(
  week: number,
  weekInPhase: number,
  phase: Phase,
  frequency: StrengthFrequency,
  isRecovery: boolean,
  tier: StrengthTier,
  totalWeeks: number
): Session[] {
  const sessions: Session[] = [];
  const isSpeedOrRacePrep = phase.name === 'Speed' || phase.name === 'Race Prep';
  
  // Monday: Lower Body Power & Posterior Chain (ALWAYS)
  sessions.push(createMondayLowerBody(phase, weekInPhase, isRecovery, tier));
  
  // Wednesday: Upper Body Progression (only for 3x frequency)
  // This is THE gains session - never optional
  if (frequency >= 3) {
    sessions.push(createWednesdayUpperBody(phase, weekInPhase, isRecovery, tier, week, totalWeeks));
  }
  
  // Friday: Lower Body Stability
  // Optional in Speed phase (weeks 6+) and Race Prep
  const fridayOptional = isSpeedOrRacePrep && !isRecovery;
  sessions.push(createFridayLowerBody(phase, weekInPhase, isRecovery, tier, fridayOptional));
  
  return sessions;
}

// ============================================================================
// MONDAY: LOWER BODY POWER & POSTERIOR CHAIN
// Focus: Hip power, hamstring/glute strength, injury prevention
// ============================================================================

function createMondayLowerBody(
  phase: Phase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: StrengthTier
): Session {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      // Recovery: Same weight, reduced volume (3 sets → 2 sets)
      exercises.push(
        { name: 'Hip Thrusts', sets: 2, reps: 8, weight: '75% 1RM' },
        { name: 'Romanian Deadlift', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Goblet Squat', sets: 2, reps: 10, weight: 'Light DB' },
        { name: 'Box Jumps', sets: 2, reps: 3, weight: 'Bodyweight' }
      );
      duration = 35;
      description = 'Recovery Week - Same weights, reduced volume. Let your body adapt to recent increases. Target: 2 sets, RIR 4-5.';
    } else if (phase.name === 'Base') {
      // Base: Build hip power foundation
      const load = 70 + Math.min(5, weekInPhase); // 71%, 72%, 73%, 74%, 75%
      exercises.push(
        { name: 'Hip Thrusts', sets: 4, reps: 8, weight: `${load}% 1RM` },
        { name: 'Romanian Deadlift', sets: 4, reps: 8, weight: `${load - 5}% 1RM` },
        { name: 'Goblet Squat', sets: 3, reps: 10, weight: 'Moderate DB' },
        { name: 'Walking Lunges', sets: 3, reps: '8/leg', weight: 'Bodyweight' }
      );
      duration = 45;
      description = `Week ${weekInPhase} Base - Building hip power foundation. Add 5-10 lbs per week on hip thrusts and RDL. Target: 4x8 @ ${load}% 1RM, RIR 2-3.`;
    } else if (phase.name === 'Speed') {
      // Speed: Explosive power, convert strength to speed
      exercises.push(
        { name: 'Box Jumps', sets: 4, reps: 4, weight: 'Explosive - full recovery' },
        { name: 'Hip Thrusts', sets: 3, reps: 6, weight: '75% 1RM' },
        { name: 'KB/DB Swings', sets: 3, reps: 12, weight: '25% deadlift 1RM' },
        { name: 'Jump Squats', sets: 3, reps: 5, weight: 'Bodyweight' }
      );
      duration = 40;
      description = `Week ${weekInPhase} Speed - Explosive power development. Focus on speed and technique, not max weight. Maintain hip thrust strength from Base phase.`;
    } else {
      // Race Prep: Minimal maintenance
      exercises.push(
        { name: 'Hip Thrusts', sets: 2, reps: 15, weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Light DB' },
        { name: 'Box Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 30;
      description = `Week ${weekInPhase} Race Prep - Minimal maintenance only. No heavy loading, no plyos. Running is the priority.`;
    }
  } else {
    // TIER 1: BODYWEIGHT
    if (isRecovery) {
      exercises.push(
        { name: 'Glute Bridges', sets: 2, reps: 20, weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Squat Jumps', sets: 2, reps: 5, weight: 'Bodyweight' }
      );
      duration = 30;
      description = 'Recovery Week - Reduced volume, maintain movement patterns. Target: 2 sets, easy effort.';
    } else if (phase.name === 'Base') {
      exercises.push(
        { name: 'Glute Bridges', sets: 3, reps: 20, weight: 'Bodyweight - progress to single leg' },
        { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Reverse Lunges', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
        { name: 'Squat Jumps', sets: 3, reps: weekInPhase >= 3 ? 8 : 6, weight: 'Bodyweight' }
      );
      duration = 40;
      description = `Week ${weekInPhase} Base - Building hip power with bodyweight progressions. When 3x20 glute bridges is easy, progress to single leg.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Box Jumps or Broad Jumps', sets: 4, reps: 4, weight: 'Explosive - full recovery' },
        { name: 'Single Leg Glute Bridge', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
        { name: 'Skater Hops', sets: 3, reps: '8/side', weight: 'Bodyweight' },
        { name: 'Jump Lunges', sets: 3, reps: '6/leg', weight: 'Bodyweight' }
      );
      duration = 35;
      description = `Week ${weekInPhase} Speed - Explosive power focus. Quality over quantity - full recovery between sets.`;
    } else {
      exercises.push(
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Race Prep - Light maintenance only. No jumping, running is the priority.`;
    }
  }
  
  // Core work for all sessions
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Planks, dead bugs, bird dogs' });
  
  return {
    day: 'Monday',
    type: 'strength',
    name: `Lower Body: Power & Posterior${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    strength_exercises: exercises,
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:posterior_chain']
  };
}

// ============================================================================
// WEDNESDAY: UPPER BODY PROGRESSION (THE GAINS SESSION)
// Focus: Progressive overload, build strength and size
// This is what differentiates us - upper body CAN progress during marathon training
// ============================================================================

function createWednesdayUpperBody(
  phase: Phase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: StrengthTier,
  absoluteWeek: number,
  totalWeeks: number
): Session {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  // Calculate progression across entire plan (not just phase)
  // Upper body progresses continuously, only pausing slightly in recovery weeks
  const isUpperPeakWeek = phase.name === 'Race Prep' && weekInPhase === 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      // Recovery: MAINTAIN weight, reduce volume (4 sets → 3 sets)
      // Don't drop intensity - just fewer sets
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 8, weight: '75% 1RM' },
        { name: 'Barbell Rows', sets: 3, reps: 8, weight: '70% 1RM' },
        { name: 'Pull-ups or Lat Pulldown', sets: 3, reps: 8, weight: 'Bodyweight or moderate' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light band/cable' }
      );
      duration = 35;
      description = 'Recovery Week - Same weights as last week, fewer sets. Your muscles adapt during rest. Resume progression next week.';
    } else if (phase.name === 'Base') {
      // Base: Hypertrophy focus (4x10 → 4x8 as weights increase)
      const baseLoad = 70 + Math.min(5, weekInPhase); // Progress 70% → 75%
      exercises.push(
        { name: 'Bench Press', sets: 4, reps: 10, weight: `${baseLoad}% 1RM` },
        { name: 'Barbell Rows', sets: 4, reps: 10, weight: `${baseLoad}% 1RM` },
        { name: 'Pull-ups or Lat Pulldown', sets: 4, reps: '8-10', weight: 'Bodyweight or add weight' },
        { name: 'DB Shoulder Press', sets: 3, reps: 10, weight: 'Moderate DBs' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light band/cable' }
      );
      duration = 45;
      description = `Week ${weekInPhase} Base - Hypertrophy phase. When you hit 4x10 cleanly, add 5 lbs next week. Focus on volume accumulation. Target: 4x10 @ ${baseLoad}% 1RM.`;
    } else if (phase.name === 'Speed') {
      // Speed: KEEP BUILDING - upper body doesn't need to back off
      const speedLoad = 75 + Math.min(5, weekInPhase); // Progress 76% → 80%
      exercises.push(
        { name: 'Bench Press', sets: 4, reps: 8, weight: `${speedLoad}% 1RM` },
        { name: 'Barbell Rows', sets: 4, reps: 8, weight: `${speedLoad}% 1RM` },
        { name: 'Weighted Pull-ups or Heavy Pulldown', sets: 4, reps: '6-8', weight: 'Add weight' },
        { name: 'DB Shoulder Press', sets: 3, reps: 8, weight: 'Heavier DBs' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Moderate band/cable' }
      );
      duration = 45;
      description = `Week ${weekInPhase} Speed - KEEP BUILDING upper body. Running is harder, but your chest and back can still progress. You should be 10-20 lbs heavier on all lifts vs Week 1. Target: 4x8 @ ${speedLoad}% 1RM.`;
    } else if (isUpperPeakWeek) {
      // Race Prep Week 1: PEAK TEST - this is when you test your gains!
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 5, weight: '82-85% 1RM (HEAVY)' },
        { name: 'Barbell Rows', sets: 3, reps: 5, weight: '82-85% 1RM (HEAVY)' },
        { name: 'Pull-ups', sets: 3, reps: 'Max reps', weight: 'Max weight possible' },
        { name: 'Shoulder Press', sets: 3, reps: 6, weight: 'Heavy DBs' },
        { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Light' }
      );
      duration = 45;
      description = `🏆 UPPER BODY PEAK WEEK - Test your gains! Running tapers = extra recovery for lifting. Go heavy on bench and rows. How much stronger are you than Week 1?`;
    } else {
      // Race Prep Week 2+: Back off before race
      exercises.push(
        { name: 'Bench Press', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Rows', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Pull-ups', sets: 2, reps: 8, weight: 'Bodyweight' },
        { name: 'Shoulder Press', sets: 2, reps: 10, weight: 'Light DBs' }
      );
      duration = 30;
      description = `Week ${weekInPhase} Race Prep - Maintain gains with minimal volume. You've already tested your strength - now just stay fresh for race day.`;
    }
  } else {
    // TIER 1: BODYWEIGHT PROGRESSIONS
    // Must have clear level-up paths to feel like "gains"
    
    if (isRecovery) {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 12, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 3, reps: 10, weight: 'Standard angle' },
        { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Standard' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light band' }
      );
      duration = 30;
      description = 'Recovery Week - Maintain current level, reduced volume. Resume progression next week.';
    } else if (phase.name === 'Base') {
      // Base: Build volume, master basic progressions
      const pushProgression = weekInPhase <= 2 ? 'Standard push-ups' : weekInPhase <= 4 ? 'Diamond push-ups' : 'Decline push-ups';
      exercises.push(
        { name: 'Push-ups', sets: 4, reps: 12, weight: `Progress: ${pushProgression}` },
        { name: 'Inverted Rows', sets: 4, reps: 12, weight: 'Feet elevated when easy' },
        { name: 'Pike Push-ups', sets: 3, reps: 10, weight: 'Elevate feet to progress' },
        { name: 'Negative Pull-ups or Band Assist', sets: 3, reps: '5-8', weight: 'Slow negatives' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Light band' }
      );
      duration = 40;
      description = `Week ${weekInPhase} Base - Bodyweight progression. Current push-up level: ${pushProgression}. When you hit 4x12 cleanly, progress to next variation.`;
    } else if (phase.name === 'Speed') {
      const pushProgression = 'Decline or archer push-ups';
      exercises.push(
        { name: 'Push-ups', sets: 4, reps: 10, weight: `Advanced: ${pushProgression}` },
        { name: 'Inverted Rows', sets: 4, reps: 10, weight: 'Feet elevated, slow tempo' },
        { name: 'Pike Push-ups', sets: 3, reps: 10, weight: 'Elevated pike (near HSPU)' },
        { name: 'Pull-ups', sets: 4, reps: 'Max reps', weight: 'Aim for +2 reps vs Week 1' },
        { name: 'Face Pulls', sets: 3, reps: 15, weight: 'Moderate band' }
      );
      duration = 40;
      description = `Week ${weekInPhase} Speed - Advanced progressions. Track your pull-up max - this is your upper body PR metric. How many more can you do than Week 1?`;
    } else if (isUpperPeakWeek) {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 'Max reps', weight: 'Your hardest variation' },
        { name: 'Pull-ups', sets: 3, reps: 'Max reps', weight: 'Test your PR!' },
        { name: 'Inverted Rows', sets: 3, reps: 'Max reps', weight: 'Feet elevated' },
        { name: 'Pike Push-ups', sets: 3, reps: 'Max reps', weight: 'Your hardest variation' }
      );
      duration = 35;
      description = `🏆 UPPER BODY PEAK WEEK - Test your gains! How many pull-ups can you do? What push-up variation can you master? Celebrate your progress!`;
    } else {
      exercises.push(
        { name: 'Push-ups', sets: 2, reps: 15, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 12, weight: 'Standard' },
        { name: 'Pike Push-ups', sets: 2, reps: 10, weight: 'Standard' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Race Prep - Maintain gains, minimal volume. Stay fresh for race day.`;
    }
  }
  
  // Core work
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Anti-rotation focus (Pallof press, dead bugs)' });
  
  return {
    day: 'Wednesday',
    type: 'strength',
    name: isUpperPeakWeek ? '🏆 Upper Body: Peak Test' : `Upper Body: Progression${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    strength_exercises: exercises,
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:gains', 'priority:high']
  };
}

// ============================================================================
// FRIDAY: LOWER BODY STABILITY & MAINTENANCE
// Focus: Single-leg stability, movement quality
// OPTIONAL in Speed phase (week 6+) and Race Prep when running volume is high
// ============================================================================

function createFridayLowerBody(
  phase: Phase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: StrengthTier,
  isOptional: boolean
): Session {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  const optionalNote = isOptional 
    ? '\n\n⚠️ OPTIONAL: If your legs feel heavy from running or you have a long run this weekend, skip this session. Wednesday upper body is the priority.'
    : '';
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '8/leg', weight: '55% 1RM' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: '50% 1RM' },
        { name: 'Lateral Lunges', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 30;
      description = 'Recovery Week - Light single-leg work. Maintain patterns, no fatigue.';
    } else if (phase.name === 'Base') {
      const load = 60 + Math.min(5, weekInPhase); // 61% → 65%
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 3, reps: '10/leg', weight: `${load}% 1RM` },
        { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: `${load - 5}% 1RM` },
        { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'Light DBs' },
        { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' },
        { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
      );
      duration = 40;
      description = `Week ${weekInPhase} Base - Single-leg stability development. Add 2.5-5 lbs per hand weekly on Bulgarian split squats. Target: 3x10/leg @ ${load}% 1RM.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '8/leg', weight: '60% 1RM' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Bodyweight or light DB' },
        { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 30;
      description = `Week ${weekInPhase} Speed - Reduced volume, maintain single-leg patterns.${optionalNote}`;
    } else {
      // Race Prep - skip entirely or very light
      exercises.push(
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 20;
      description = `Week ${weekInPhase} Race Prep - Minimal movement, stay loose. Skip if tired.${optionalNote}`;
    }
  } else {
    // TIER 1: BODYWEIGHT
    if (isRecovery) {
      exercises.push(
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Lateral Lunges', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 25;
      description = 'Recovery Week - Light movement, maintain patterns.';
    } else if (phase.name === 'Base') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 3, reps: '12/leg', weight: 'Bodyweight → add DBs' },
        { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band optional' },
        { name: 'Calf Raises', sets: 3, reps: 20, weight: 'Single leg when easy' }
      );
      duration = 35;
      description = `Week ${weekInPhase} Base - Build single-leg stability. Progress Bulgarian split squats by adding light dumbbells when bodyweight is easy.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${weekInPhase} Speed - Maintain patterns, reduced volume.${optionalNote}`;
    } else {
      exercises.push(
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 15;
      description = `Week ${weekInPhase} Race Prep - Light movement only. Skip if tired.${optionalNote}`;
    }
  }
  
  // Core work
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Side planks, Copenhagen planks' });
  
  return {
    day: 'Friday',
    type: 'strength',
    name: `Lower Body: Stability${isRecovery ? ' (Recovery)' : ''}${isOptional ? ' (Optional)' : ''}`,
    description,
    duration,
    strength_exercises: exercises,
    tags: [
      'strength', 
      'lower_body', 
      `tier:${tier}`, 
      `phase:${phase.name.toLowerCase()}`, 
      'focus:stability',
      ...(isOptional ? ['optional'] : [])
    ]
  };
}

// ============================================================================
// TAPER SESSIONS
// ============================================================================

function createTaperSessions(
  tier: StrengthTier,
  week: number,
  totalWeeks: number
): Session[] {
  const sessions: Session[] = [];
  const isRaceWeek = week === totalWeeks;
  
  if (isRaceWeek) {
    // Race week: Skip strength entirely or very minimal
    sessions.push({
      day: 'Monday',
      type: 'strength',
      name: 'Race Week: Light Movement (Optional)',
      description: 'Race week - Skip entirely or just 10-15 min of light movement to stay loose. Nothing that will make you sore.',
      duration: 15,
      strength_exercises: [
        { name: 'Bodyweight Squats', sets: 2, reps: 10, weight: 'Bodyweight' },
        { name: 'Glute Bridges', sets: 2, reps: 10, weight: 'Bodyweight' },
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Bodyweight' }
      ],
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`]
    });
  } else {
    // Taper week (not race week): Light maintenance
    sessions.push({
      day: 'Monday',
      type: 'strength',
      name: 'Taper: Light Full Body',
      description: 'Taper week - Light movement to maintain patterns. 50-60% effort max. Save energy for race day.',
      duration: 25,
      strength_exercises: tier === 'barbell' 
        ? [
            { name: 'Hip Thrusts', sets: 2, reps: 10, weight: 'Bodyweight' },
            { name: 'Bench Press', sets: 2, reps: 8, weight: '50% 1RM' },
            { name: 'Rows', sets: 2, reps: 8, weight: '50% 1RM' },
            { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight' }
          ]
        : [
            { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
            { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard' },
            { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' },
            { name: 'Walking Lunges', sets: 2, reps: '8/leg', weight: 'Bodyweight' }
          ],
      tags: ['strength', 'full_body', 'phase:taper', `tier:${tier}`]
    });
    
    // Optional Wednesday for taper week - very light upper if user wants it
    sessions.push({
      day: 'Wednesday',
      type: 'strength',
      name: 'Taper: Upper Body Maintenance (Optional)',
      description: 'Optional - Only if you feel good. Light upper body to stay sharp. Skip if any fatigue.',
      duration: 20,
      strength_exercises: tier === 'barbell'
        ? [
            { name: 'Bench Press', sets: 2, reps: 10, weight: '50% 1RM' },
            { name: 'Rows', sets: 2, reps: 10, weight: '50% 1RM' },
            { name: 'Face Pulls', sets: 2, reps: 15, weight: 'Light' }
          ]
        : [
            { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard' },
            { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard' },
            { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Standard' }
          ],
      tags: ['strength', 'upper_body', 'phase:taper', 'optional', `tier:${tier}`]
    });
  }
  
  return sessions;
}

// ============================================================================
// HELPERS
// ============================================================================

function getCurrentPhase(weekNumber: number, phaseStructure: PhaseStructure): Phase {
  for (const phase of phaseStructure.phases) {
    if (weekNumber >= phase.start_week && weekNumber <= phase.end_week) {
      return phase;
    }
  }
  return phaseStructure.phases[phaseStructure.phases.length - 1];
}

// ============================================================================
// LEGACY SUPPORT - Map old tier names to new
// ============================================================================

export function overlayStrengthLegacy(
  plan: TrainingPlan,
  frequency: 2 | 3,
  phaseStructure: PhaseStructure,
  tier: 'injury_prevention' | 'strength_power' = 'injury_prevention',
  _equipment: 'home_gym' | 'commercial_gym' = 'home_gym'
): TrainingPlan {
  // Map old tier names to new
  const newTier: StrengthTier = tier === 'injury_prevention' ? 'bodyweight' : 'barbell';
  return overlayStrength(plan, frequency, phaseStructure, newTier);
}
