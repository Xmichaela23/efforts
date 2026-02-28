// ============================================================================
// UPPER PRIORITY HYBRID PROTOCOL
// 
// Philosophy: True hypertrophy → strength periodization for upper body.
// 
// Grounded in Schoenfeld et al., Helms et al., and concurrent training research:
// - Upper Body: DUP-style periodization — Base 4x12 @ 62% → Speed 4x6 @ 81%
//   with isolation accessories (lateral raises, face pulls) for complete development
// - Lower Body: Functional strength, not maintenance — squats, hip thrusts, RDLs
//   at meaningful loads (65-75% 1RM). Honest about what it is.
// - Upper body doesn't compete with running adaptations (different muscles)
// - Speed phase adds plyometrics for power transfer
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
  StrengthPhase,
} from './types.ts';
import {
  RepProfile,
} from './intent-taxonomy.ts';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const upperPriorityHybridProtocol: StrengthProtocol = {
  id: 'upper_aesthetics',
  legacy_ids: ['upper_priority_hybrid'], // Backwards compatibility
  name: 'Upper Aesthetics',
  description: 'Full hypertrophy-to-strength periodization for the upper body (4x12 → 4x6 across phases) plus isolation accessories. Lower body gets real work — squats, hip thrusts, and RDLs at meaningful loads — just not the primary focus.',
  tradeoffs: [
    'Lower body builds functional strength but won\'t chase 1RM PRs',
    'Upper body sessions are longer (45-50 min) to accommodate accessories',
    'Designed for visible upper-body development without compromising running',
  ],
  createWeekSessions,
};

// ============================================================================
// SESSION GENERATION
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, weekIndex, totalWeeks, strengthFrequency } = context;
  const sessions: IntentSession[] = [];
  
  // Determine tier from equipment (commercial_gym = barbell, home_gym = bodyweight)
  const tier: 'barbell' | 'bodyweight' = 
    context.userBaselines.equipment === 'commercial_gym' 
      ? 'barbell' 
      : 'bodyweight';
  
  const isTaper = phase.name === 'Taper';
  const isSpeedOrRacePrep = phase.name === 'Speed' || phase.name === 'Race Prep';
  
  if (isTaper) {
    return createTaperSessions(tier, weekIndex, totalWeeks);
  }
  
  // Handle frequency: default to 2 if undefined, treat 1 as 2 (explicit)
  // Guard against NaN from bad upstream parsing
  const freqRaw = strengthFrequency ?? 2;
  const freq = Number.isFinite(freqRaw) ? Math.max(2, freqRaw) : 2;
  
  // Monday: Lower Body (Maintenance intent - light, supportive)
  sessions.push(createLowerMaintenanceSession(phase, weekInPhase, isRecovery, tier));
  
  // Wednesday: Upper Body (Strength intent - THE gains session)
  sessions.push(createUpperStrengthSession(phase, weekInPhase, isRecovery, tier));
  
  // Friday: Lower Body Stability (Durability intent - unilateral work)
  // Only if frequency >= 3
  // Optional in Speed phase and Race Prep
  if (freq >= 3) {
    const fridayOptional = isSpeedOrRacePrep && !isRecovery;
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, fridayOptional));
  }
  
  return sessions;
}

// ============================================================================
// LOWER MAINTENANCE SESSION (Monday)
// ============================================================================

function createLowerMaintenanceSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  let repProfile: RepProfile = 'maintenance';
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Back Squat', sets: 2, reps: 8, weight: '65% 1RM' },
        { name: 'Hip Thrusts', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Romanian Deadlift', sets: 2, reps: 8, weight: '65% 1RM' },
        { name: 'Box Jumps', sets: 2, reps: 3, weight: 'Bodyweight' }
      );
      duration = 35;
      description = 'Recovery Week - Same weights, reduced volume. Let your body adapt to recent increases. Target: 2 sets, RIR 4-5.';
    } else if (phase.name === 'Base') {
      const step = Math.min(4, Math.max(0, wip - 1));
      const load = 65 + (step * 2); // 65% → 67% → 69% → 71% → 73%
      exercises.push(
        { name: 'Back Squat', sets: 3, reps: 8, weight: `${load}% 1RM` },
        { name: 'Hip Thrusts', sets: 4, reps: 8, weight: `${load}% 1RM` },
        { name: 'Romanian Deadlift', sets: 3, reps: 8, weight: `${Math.max(60, load - 5)}% 1RM` },
        { name: 'Walking Lunges', sets: 3, reps: '8/leg', weight: 'Moderate load' }
      );
      duration = 45;
      description = `Week ${displayWeek} Base - Functional lower body strength. 3-4x8 @ ${load}% 1RM, RIR 2-3. This is real training — squats and hip thrusts at these loads build strength, not just maintain it.`;
      repProfile = 'strength';
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Box Jumps', sets: 4, reps: 4, weight: 'Explosive — full recovery between sets' },
        { name: 'Hip Thrusts', sets: 3, reps: 6, weight: '75% 1RM' },
        { name: 'KB/DB Swings', sets: 3, reps: 12, weight: '25% deadlift 1RM' }
      );
      duration = 40;
      description = `Week ${displayWeek} Speed - Power development. Box jumps for rate of force, hip thrusts for posterior chain, swings for hip extension power. Quality over quantity.`;
      repProfile = 'strength';
    } else {
      // Race Prep: Minimal maintenance
      exercises.push(
        { name: 'Hip Thrusts', sets: 2, reps: 15, weight: '65% 1RM' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Box Step-ups', sets: 2, reps: '10/leg', weight: 'Moderate load' }
      );
      duration = 30;
      description = `Week ${displayWeek} Race Prep - Minimal maintenance only. No heavy loading, no plyos. Running is the priority.`;
    }
  } else {
    // Bodyweight tier
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
        { name: 'Squat Jumps', sets: 3, reps: wip >= 3 ? 8 : 6, weight: 'Bodyweight' }
      );
      duration = 40;
      description = `Week ${displayWeek} Base - Building hip power with bodyweight progressions. When 3x20 glute bridges is easy, progress to single leg.`;
      repProfile = 'strength';
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Box Jumps or Broad Jumps', sets: 4, reps: 4, weight: 'Explosive - full recovery' },
        { name: 'Single Leg Glute Bridge', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
        { name: 'Skater Hops', sets: 3, reps: '8/side', weight: 'Bodyweight' },
        { name: 'Jump Lunges', sets: 3, reps: '6/leg', weight: 'Bodyweight' }
      );
      duration = 35;
      description = `Week ${displayWeek} Speed - Explosive power focus. Quality over quantity - full recovery between sets.`;
      repProfile = 'strength';
    } else {
      exercises.push(
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Bodyweight' },
        { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${displayWeek} Race Prep - Light maintenance only. No jumping, running is the priority.`;
    }
  }
  
  // Core work
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Planks, dead bugs, bird dogs' });
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery, false);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_MAINTENANCE',
    priority: 'required',
    name: `Lower Body: Power & Posterior${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile,
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:posterior_chain'],
  };
}

// ============================================================================
// UPPER STRENGTH SESSION (Wednesday)
// ============================================================================

function createUpperStrengthSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  let repProfile: RepProfile = 'hypertrophy';
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  // wip is 1-based, so first week of Race Prep is wip === 1
  const isUpperPeakWeek = phase.name === 'Race Prep' && wip === 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 8, weight: '75% 1RM' },
        { name: 'Barbell Rows', sets: 3, reps: 8, weight: '70% 1RM' },
        { name: 'Pull-ups', sets: 3, reps: 8, weight: 'Bodyweight' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: '60% 1RM', notes: 'Light - Focus on crisp technique' },
        { name: 'Cable Face Pulls', sets: 3, reps: 15, weight: 'Light cable' }
      );
      duration = 35;
      description = 'Recovery Week - Same weights as last week, fewer sets. OHP maintained for posture. Your muscles adapt during rest. Resume progression next week.';
      repProfile = 'maintenance';
    } else if (phase.name === 'Base') {
      const step = Math.min(4, Math.max(0, wip - 1));
      const baseLoad = 62 + (step * 2); // 62% → 64% → 66% → 68% → 70% (wider range for 10-12 reps)
      const reps = step <= 1 ? 12 : 10;
      exercises.push(
        { name: 'Bench Press', sets: 4, reps, weight: `${baseLoad}% 1RM` },
        { name: 'Barbell Rows', sets: 4, reps, weight: `${baseLoad}% 1RM` },
        { name: 'Pull-ups', sets: 4, reps: '8-10', weight: 'Bodyweight' },
        { name: 'DB Shoulder Press', sets: 3, reps: 10, weight: `${Math.max(57, baseLoad - 5)}% 1RM` },
        { name: 'Lateral Raises', sets: 3, reps: 12, weight: 'Light-moderate DBs' },
        { name: 'Cable Face Pulls', sets: 3, reps: 15, weight: 'Light cable' }
      );
      duration = 50;
      description = `Week ${displayWeek} Base - Hypertrophy block. 4x${reps} @ ${baseLoad}% 1RM, RIR 2-3. Volume is king — chase the pump. Lateral raises for shoulder width.`;
      repProfile = 'hypertrophy';
    } else if (phase.name === 'Speed') {
      const step = Math.min(3, Math.max(0, wip - 1));
      const speedLoad = 72 + (step * 3); // 72% → 75% → 78% → 81% (wider progression into strength territory)
      const reps = step <= 1 ? 8 : 6;
      exercises.push(
        { name: 'Bench Press', sets: 4, reps, weight: `${speedLoad}% 1RM` },
        { name: 'Barbell Rows', sets: 4, reps, weight: `${speedLoad}% 1RM` },
        { name: 'Pull-ups', sets: 4, reps: '6-8', weight: 'Add weight — track this' },
        { name: 'DB Shoulder Press', sets: 3, reps, weight: `${Math.max(67, speedLoad - 5)}% 1RM` },
        { name: 'Lateral Raises', sets: 3, reps: 12, weight: 'Moderate DBs' },
        { name: 'Cable Face Pulls', sets: 3, reps: 15, weight: 'Moderate cable' }
      );
      duration = 50;
      description = `Week ${displayWeek} Speed - Strength block. 4x${reps} @ ${speedLoad}% 1RM, RIR 1-2. Heavier loads, fewer reps — the hypertrophy base now converts to strength.`;
      repProfile = 'strength';
    } else if (isUpperPeakWeek) {
      exercises.push(
        { name: 'Bench Press', sets: 3, reps: 5, weight: '80-85% 1RM' },
        { name: 'Barbell Rows', sets: 3, reps: 5, weight: '80-85% 1RM' },
        { name: 'Pull-ups', sets: 3, reps: 'Max reps', weight: 'Max weight possible' },
        { name: 'Shoulder Press', sets: 3, reps: 6, weight: 'Heavy DBs' },
        { name: 'Cable Face Pulls', sets: 2, reps: 15, weight: 'Light cable' }
      );
      duration = 45;
      description = `UPPER BODY PEAK WEEK - Test your gains! Running tapers = extra recovery for lifting. Go heavy on bench and rows. Stop 1-2 reps shy of failure. How much stronger are you than Week 1?`;
      repProfile = 'strength';
    } else {
      exercises.push(
        { name: 'Bench Press', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Barbell Rows', sets: 2, reps: 8, weight: '70% 1RM' },
        { name: 'Pull-ups', sets: 2, reps: 8, weight: 'Bodyweight' },
        { name: 'Overhead Press', sets: 2, reps: 5, weight: 'Light', notes: 'Activation - Mobility focus' }
      );
      duration = 30;
      description = `Week ${displayWeek} Race Prep - Maintain gains with minimal volume. OHP for activation. You've already tested your strength - now just stay fresh for race day.`;
      repProfile = 'maintenance';
    }
  } else {
    // Bodyweight tier
    if (isRecovery) {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 12, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 3, reps: 10, weight: 'Standard angle' },
        { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Standard' },
        { name: 'Band Face Pulls', sets: 3, reps: 15, weight: 'Light band' }
      );
      duration = 30;
      description = 'Recovery Week - Maintain current level, reduced volume. Resume progression next week.';
      repProfile = 'maintenance';
    } else if (phase.name === 'Base') {
      const pushProgression = wip <= 2 ? 'Standard push-ups' : wip <= 4 ? 'Diamond push-ups' : 'Decline push-ups';
      exercises.push(
        { name: 'Push-ups', sets: 4, reps: 12, weight: `Progress: ${pushProgression}` },
        { name: 'Inverted Rows', sets: 4, reps: 12, weight: 'Feet elevated when easy' },
        { name: 'Pike Push-ups', sets: 3, reps: 10, weight: 'Elevate feet to progress' },
        { name: 'Pull-ups', sets: 3, reps: '5-8', weight: 'Assisted or negatives OK' },
        { name: 'Band Lateral Raises', sets: 3, reps: 15, weight: 'Light band or light DBs' },
        { name: 'Band Face Pulls', sets: 3, reps: 15, weight: 'Light band' }
      );
      duration = 45;
      description = `Week ${displayWeek} Base - Hypertrophy block. Push-up level: ${pushProgression}. When you hit 4x12 cleanly, progress to next variation. Band lateral raises for shoulder width.`;
      repProfile = 'hypertrophy';
    } else if (phase.name === 'Speed') {
      const pushProgression = 'Decline or archer push-ups';
      exercises.push(
        { name: 'Push-ups', sets: 4, reps: 10, weight: `Advanced: ${pushProgression}` },
        { name: 'Inverted Rows', sets: 4, reps: 10, weight: 'Feet elevated, slow tempo' },
        { name: 'Pike Push-ups', sets: 3, reps: 10, weight: 'Elevated pike (near HSPU)' },
        { name: 'Pull-ups', sets: 4, reps: 'Max reps', weight: 'Aim for +2 reps vs Week 1' },
        { name: 'Band Lateral Raises', sets: 3, reps: 15, weight: 'Moderate band or DBs' },
        { name: 'Band Face Pulls', sets: 3, reps: 15, weight: 'Moderate band' }
      );
      duration = 45;
      description = `Week ${displayWeek} Speed - Strength block. Track your pull-up max — this is your upper body PR metric. How many more can you do than Week 1?`;
      repProfile = 'strength';
    } else if (isUpperPeakWeek) {
      exercises.push(
        { name: 'Push-ups', sets: 3, reps: 'Max reps', weight: 'Your hardest variation' },
        { name: 'Pull-ups', sets: 3, reps: 'Max reps', weight: 'Test your PR!' },
        { name: 'Inverted Rows', sets: 3, reps: 'Max reps', weight: 'Feet elevated' },
        { name: 'Pike Push-ups', sets: 3, reps: 'Max reps', weight: 'Your hardest variation' }
      );
      duration = 35;
      description = `UPPER BODY PEAK WEEK - Test your gains! How many pull-ups can you do? What push-up variation can you master? Celebrate your progress!`;
      repProfile = 'strength';
    } else {
      exercises.push(
        { name: 'Push-ups', sets: 2, reps: 15, weight: 'Standard' },
        { name: 'Inverted Rows', sets: 2, reps: 12, weight: 'Standard' },
        { name: 'Pike Push-ups', sets: 2, reps: 10, weight: 'Standard' }
      );
      duration = 25;
      description = `Week ${displayWeek} Race Prep - Maintain gains, minimal volume. Stay fresh for race day.`;
      repProfile = 'maintenance';
    }
  }
  
  // Core work
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Anti-rotation focus (Pallof press, dead bugs)' });
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery, isUpperPeakWeek);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'UPPER_STRENGTH',
    priority: 'required',
    name: isUpperPeakWeek ? 'Upper Body: Peak Test' : `Upper Body: Progression${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile,
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:gains', 'priority:high'],
  };
}

// ============================================================================
// LOWER DURABILITY SESSION (Friday)
// ============================================================================

function createLowerDurabilitySession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'barbell' | 'bodyweight',
  isOptional: boolean
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  const optionalNote = isOptional 
    ? '\n\nOPTIONAL: If your legs feel heavy from running or you have a long run this weekend, skip this session. Wednesday upper body is the priority.'
    : '';
  // Normalize weekInPhase (1-based) to guard against NaN, 0, or negative
  const wip = Number.isFinite(weekInPhase) ? weekInPhase : 1;
  const displayWeek = wip > 0 ? wip : 1;
  
  if (tier === 'barbell') {
    if (isRecovery) {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Lateral Lunges', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 30;
      description = 'Recovery Week - Light single-leg work. Maintain patterns, no fatigue.';
    } else if (phase.name === 'Base') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 3, reps: '10/leg', weight: 'Moderate load' },
        { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: 'Moderate load' },
        { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'Moderate load' },
        { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' },
        { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight' }
      );
      duration = 40;
      description = `Week ${displayWeek} Base - Single-leg stability development. Choose moderate load to hit target RIR.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Single Leg RDL', sets: 2, reps: '8/leg', weight: 'Moderate load' },
        { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 30;
      description = `Week ${displayWeek} Speed - Reduced volume, maintain single-leg patterns. Choose moderate load to hit target RIR.${optionalNote}`;
    } else {
      exercises.push(
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 20;
      description = `Week ${displayWeek} Race Prep - Minimal movement, stay loose. Skip if tired.${optionalNote}`;
    }
  } else {
    // Bodyweight tier
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
      description = `Week ${displayWeek} Base - Build single-leg stability. Progress Bulgarian split squats by adding light dumbbells when bodyweight is easy.`;
    } else if (phase.name === 'Speed') {
      exercises.push(
        { name: 'Bulgarian Split Squat', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 25;
      description = `Week ${displayWeek} Speed - Maintain patterns, reduced volume.${optionalNote}`;
    } else {
      exercises.push(
        { name: 'Walking Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
        { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' }
      );
      duration = 15;
      description = `Week ${displayWeek} Race Prep - Light movement only. Skip if tired.${optionalNote}`;
    }
  }
  
  // Core work
  exercises.push({ name: 'Core Circuit', sets: 1, reps: '5 min', weight: 'Side planks, Copenhagen planks' });
  
  // Apply target RIR
  const targetRIR = getTargetRIR(phase, isRecovery, false);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_DURABILITY',
    priority: isOptional ? 'optional' : 'preferred',
    name: `Lower Body: Stability${isRecovery ? ' (Recovery)' : ''}${isOptional ? ' (Optional)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'hypertrophy', // Durability work is higher rep
    tags: [
      'strength',
      'lower_body',
      `tier:${tier}`,
      `phase:${phase.name.toLowerCase()}`,
      'focus:stability',
      ...(isOptional ? ['optional'] : [])
    ],
  };
}

// ============================================================================
// TAPER SESSIONS
// ============================================================================

function createTaperSessions(
  tier: 'barbell' | 'bodyweight',
  week: number,
  totalWeeks: number
): IntentSession[] {
  const sessions: IntentSession[] = [];
  // weekIndex is documented as 1-based, so race week is week === totalWeeks
  // Guard against edge cases where week or totalWeeks might be 0, negative, or NaN
  const w = Number.isFinite(week) && week > 0 ? week : 1;
  const tw = Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : 1;
  // Defensive: use >= to catch edge cases where week might be slightly off
  const isRaceWeek = w >= tw;
  const taperRIR = 4;
  
  if (isRaceWeek) {
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'optional',
      name: 'Race Week: Light Movement (Optional)',
      description: 'Race week - Skip entirely or just 10-15 min of light movement to stay loose. Nothing that will make you sore.',
      duration: 15,
      exercises: [
        { name: 'Bodyweight Squats', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Glute Bridges', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Push-ups', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
      ],
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  } else {
    // Taper week (not race week): Light maintenance
    const mondayExercises: StrengthExercise[] = tier === 'barbell' 
      ? [
          { name: 'Hip Thrusts', sets: 2, reps: 10, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Bench Press', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Barbell Rows', sets: 2, reps: 8, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR }
        ]
      : [
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard', target_rir: taperRIR },
          { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard', target_rir: taperRIR },
          { name: 'Walking Lunges', sets: 2, reps: '8/leg', weight: 'Bodyweight', target_rir: taperRIR }
        ];
        
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'preferred',
      name: 'Taper: Light Full Body',
      description: 'Taper week - Light movement to maintain patterns. 50-60% effort max. Save energy for race day.',
      duration: 25,
      exercises: mondayExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', `tier:${tier}`],
    });
    
    // Optional Wednesday for taper week
    const wednesdayExercises: StrengthExercise[] = tier === 'barbell'
      ? [
          { name: 'Bench Press', sets: 2, reps: 10, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Barbell Rows', sets: 2, reps: 10, weight: '50% 1RM', target_rir: taperRIR },
          { name: 'Cable Face Pulls', sets: 2, reps: 15, weight: 'Light cable', target_rir: taperRIR }
        ]
      : [
          { name: 'Push-ups', sets: 2, reps: 12, weight: 'Standard', target_rir: taperRIR },
          { name: 'Inverted Rows', sets: 2, reps: 10, weight: 'Standard', target_rir: taperRIR },
          { name: 'Pike Push-ups', sets: 2, reps: 8, weight: 'Standard', target_rir: taperRIR }
        ];
        
    sessions.push({
      intent: 'UPPER_MAINTENANCE',
      priority: 'optional',
      name: 'Taper: Upper Body Maintenance (Optional)',
      description: 'Optional - Only if you feel good. Light upper body to stay sharp. Skip if any fatigue.',
      duration: 20,
      exercises: wednesdayExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'upper_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  }
  
  return sessions;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTargetRIR(
  phase: StrengthPhase,
  isRecovery: boolean,
  isUpperBodyPeak: boolean = false
): number {
  if (isRecovery) return 4;
  if (isUpperBodyPeak) return 1;
  
  switch (phase.name) {
    case 'Base':
      return 3;
    case 'Speed':
      return 2;
    case 'Race Prep':
      return 3;
    case 'Taper':
      return 4;
    default:
      return 3;
  }
}

function applyTargetRIR(exercises: StrengthExercise[], targetRIR: number): StrengthExercise[] {
  return exercises.map(ex => {
    // Skip RIR for time-based exercises (duration strings)
    const isDuration =
      typeof ex.reps === 'string' &&
      (ex.reps.includes('min') || ex.reps.includes('sec'));
    
    if (isDuration) return ex;
    
    return { ...ex, target_rir: targetRIR };
  });
}
