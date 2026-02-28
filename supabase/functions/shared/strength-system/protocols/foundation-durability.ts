// ============================================================================
// FOUNDATION DURABILITY PROTOCOL
// 
// Philosophy: Progressive injury-proofing with real overload.
// 
// Grounded in Lauersen et al. 2018, Rio et al. 2015, Harøy et al. 2019:
// - Progressive overload within phases (early → mid → late Base)
// - Calf raises: bilateral → single-leg → weighted, all with 3s eccentric
// - Copenhagen plank: short lever → long lever progression
// - Step-ups with controlled tempo (2-1-2)
// - RIR drops from 3 to 2 as Base phase progresses
// - Durability ≠ maintenance — you must get stronger to get more resilient
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
  StrengthPhase,
} from './types.ts';

type LowerVariant = 'A' | 'B';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const foundationDurabilityProtocol: StrengthProtocol = {
  id: 'durability',
  legacy_ids: ['foundation_durability'], // Backwards compatibility
  name: 'Durability',
  description: 'Progressive injury-proofing that actually gets harder over time. Calf and tendon work with controlled eccentrics, Copenhagen plank progression for adductors, and loaded unilateral work. You will measurably get stronger at the movements that keep you running.',
  tradeoffs: [
    'No heavy barbell compounds — uses dumbbells, bodyweight, and bands',
    'Progress shows up in injury resilience, not gym PRs',
    'Requires discipline with tempo (3s eccentrics are harder than they sound)',
  ],
  createWeekSessions,
};

// ============================================================================
// SESSION GENERATION
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, weekIndex, totalWeeks, strengthFrequency } = context;
  const sessions: IntentSession[] = [];
  
  // Determine tier from equipment (commercial_gym = DBs/cables, home_gym = bodyweight/bands)
  const tier: 'commercial_gym' | 'home_gym' = 
    context.userBaselines.equipment === 'commercial_gym' 
      ? 'commercial_gym' 
      : 'home_gym';
  
  const isTaper = phase.name === 'Taper';
  
  if (isTaper) {
    return createTaperSessions(tier, weekIndex, totalWeeks);
  }
  
  // Handle frequency: default to 2 if undefined, treat 1 as 2 (explicit)
  const freqRaw = strengthFrequency ?? 2;
  const freq = Math.max(2, freqRaw);
  
  // 2x: Lower A + Upper Posture
  // 3x: Lower A + Upper Posture + Lower B (Upper in middle to give legs a break)
  if (freq <= 2) {
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'A' }));
    sessions.push(createUpperPostureSession(phase, weekInPhase, isRecovery, tier));
  } else {
    // 3x or higher
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'A' }));
    sessions.push(createUpperPostureSession(phase, weekInPhase, isRecovery, tier));
    sessions.push(createLowerDurabilitySession(phase, weekInPhase, isRecovery, tier, { variant: 'B' }));
  }
  
  return sessions;
}

// ============================================================================
// LOWER DURABILITY SESSION
// Variant A: Knee-dominant + calves + lateral hip
// Variant B: Hinge-dominant + hip + foot/ankle
// ============================================================================

function createLowerDurabilitySession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'commercial_gym' | 'home_gym',
  opts?: { variant: LowerVariant }
): IntentSession {
  const variant = opts?.variant ?? 'A';
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  // Normalize weekInPhase for progression tiers
  const wip = Number.isFinite(weekInPhase) ? Math.max(1, weekInPhase) : 1;
  const isEarlyBase = wip <= 2;
  const isMidBase = wip > 2 && wip <= 4;
  
  if (variant === 'A') {
    // Variant A: Knee-dominant + calves + lateral hip
    if (tier === 'commercial_gym') {
      if (isRecovery) {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light)', notes: '2-1-2 tempo' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'DBs (light)' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', notes: '3s eccentric' },
          { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bodyweight', notes: 'Bent knee, 3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 30;
        description = 'Recovery Week - Maintain movement quality and tempo. No progression this week.';
      } else if (phase.name === 'Base') {
        if (isEarlyBase) {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '12/leg', weight: 'DBs (light)', notes: '2-1-2 tempo (2s up, 1s hold, 2s down)' },
            { name: 'Lateral Lunges', sets: 3, reps: '12/leg', weight: 'DBs (light)' },
            { name: 'Calf Raises', sets: 3, reps: 15, weight: 'Bilateral, bodyweight', notes: '3s eccentric (lower slowly for 3 full seconds)' },
            { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bilateral, bodyweight', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
            { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Establishing baseline. Focus on controlled tempo and movement quality. Calf raises: 3s lowering phase.`;
        } else if (isMidBase) {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '10/leg', weight: 'DBs (moderate)', notes: '2-1-2 tempo' },
            { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'DBs (moderate)' },
            { name: 'Single Leg Calf Raises', sets: 3, reps: 12, weight: 'Bodyweight', notes: '3s eccentric. Hold rail for balance only.' },
            { name: 'Soleus Raises', sets: 2, reps: 12, weight: 'Single leg, bodyweight', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' },
            { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Moderate band' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Progressing to single-leg calf work and heavier step-ups. Maintain 3s eccentric on all calf raises.`;
        } else {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '8/leg', weight: 'DBs (challenging for RIR 2)', notes: '2-1-2 tempo' },
            { name: 'Lateral Lunges', sets: 3, reps: '8/leg', weight: 'DBs (moderate-heavy)' },
            { name: 'Single Leg Calf Raises', sets: 3, reps: 10, weight: 'Hold DB for load', notes: '3s eccentric' },
            { name: 'Soleus Raises', sets: 2, reps: 10, weight: 'Single leg, hold DB', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Heavy band' },
            { name: 'Clamshells', sets: 2, reps: '15/side', weight: 'Heavy band' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Peak dosage. Loaded single-leg calf raises, heavier step-ups. Target RIR 2 on compounds.`;
        }
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '8/leg', weight: 'DBs (same load as late Base)', notes: '2-1-2 tempo' },
          { name: 'Lateral Lunges', sets: 2, reps: '8/leg', weight: 'DBs (moderate)' },
          { name: 'Single Leg Calf Raises', sets: 2, reps: 10, weight: 'Hold DB (same as late Base)', notes: '3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' }
        );
        duration = 30;
        description = `Week ${weekInPhase} Speed - Maintain peak loads from Base, reduced volume (2 sets not 3). Running is high — keep intensity, cut volume.`;
      } else {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light)' },
          { name: 'Single Leg Calf Raises', sets: 2, reps: 12, weight: 'Bodyweight', notes: '3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Race Prep - Minimal knee-dominant work. Maintain patterns, no fatigue.`;
      }
    } else {
      // Home gym tier - Variant A
      if (isRecovery) {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '12/leg', weight: 'Bodyweight', notes: '2-1-2 tempo' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', notes: '3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = 'Recovery Week - Maintain movement quality and tempo. No progression this week.';
      } else if (phase.name === 'Base') {
        if (isEarlyBase) {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '15/leg', weight: 'Bodyweight', notes: '2-1-2 tempo' },
            { name: 'Lateral Lunges', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
            { name: 'Calf Raises', sets: 3, reps: 20, weight: 'Bilateral, bodyweight', notes: '3s eccentric' },
            { name: 'Soleus Raises', sets: 2, reps: 15, weight: 'Bilateral, bodyweight', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' },
            { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Light band' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Establishing baseline with bodyweight. Master the 3s eccentric on calves before progressing.`;
        } else if (isMidBase) {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '12/leg', weight: 'Add light DBs if available', notes: '2-1-2 tempo' },
            { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'Bodyweight' },
            { name: 'Single Leg Calf Raises', sets: 3, reps: 15, weight: 'Bodyweight', notes: '3s eccentric. Hold wall for balance.' },
            { name: 'Soleus Raises', sets: 2, reps: 12, weight: 'Single leg', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Moderate band' },
            { name: 'Clamshells', sets: 2, reps: '20/side', weight: 'Moderate band' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Progressing to single-leg calf work. Add DBs to step-ups if bodyweight is easy.`;
        } else {
          exercises.push(
            { name: 'Step-ups', sets: 3, reps: '10/leg', weight: 'DBs or backpack for load', notes: '2-1-2 tempo' },
            { name: 'Lateral Lunges', sets: 3, reps: '10/leg', weight: 'Add load if possible' },
            { name: 'Single Leg Calf Raises', sets: 3, reps: 12, weight: 'Hold weight for load', notes: '3s eccentric' },
            { name: 'Soleus Raises', sets: 2, reps: 10, weight: 'Single leg, add weight', notes: 'Bent knee, 3s eccentric' },
            { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Heavy band' },
            { name: 'Clamshells', sets: 2, reps: '15/side', weight: 'Heavy band' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Peak dosage. Loaded single-leg calf raises, heavier step-ups. Target RIR 2.`;
        }
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '12/leg', weight: 'Same load as late Base', notes: '2-1-2 tempo' },
          { name: 'Lateral Lunges', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Single Leg Calf Raises', sets: 2, reps: 12, weight: 'Same as late Base', notes: '3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Speed - Maintain loads, reduced volume. Controlled movement.`;
      } else {
        exercises.push(
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Single Leg Calf Raises', sets: 2, reps: 12, weight: 'Bodyweight', notes: '3s eccentric' },
          { name: 'Lateral Band Walks', sets: 2, reps: '15/side', weight: 'Light band' }
        );
        duration = 20;
        description = `Week ${weekInPhase} Race Prep - Light knee work only. Stay loose.`;
      }
    }
  } else {
    // Variant B: Hinge-dominant + hip + foot/ankle
    // Copenhagen progression: short lever → long lever across Base
    const copenhagenVariant = isEarlyBase ? 'Short Lever' : 'Long Lever';
    const copenhagenTime = isEarlyBase ? '20s' : (isMidBase ? '25s' : '30s');
    
    if (tier === 'commercial_gym') {
      if (isRecovery) {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 2, reps: '10/leg', weight: 'DB (light)' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Copenhagen Plank (Short Lever)', sets: 2, reps: '20s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 30;
        description = 'Recovery Week - Maintain patterns and tempo. No progression this week.';
      } else if (phase.name === 'Base') {
        if (isEarlyBase) {
          exercises.push(
            { name: 'Single Leg RDL (Supported)', sets: 3, reps: '12/leg', weight: 'DB (light)' },
            { name: 'Glute Bridges', sets: 3, reps: 15, weight: 'Bilateral, bodyweight' },
            { name: `Copenhagen Plank (${copenhagenVariant})`, sets: 2, reps: `${copenhagenTime}/side`, weight: 'Bodyweight' },
            { name: 'Side Plank Abduction', sets: 2, reps: '12/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Bodyweight' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Establishing baseline. Short-lever Copenhagen, bilateral bridges. Focus on control.`;
        } else if (isMidBase) {
          exercises.push(
            { name: 'Single Leg RDL (Supported)', sets: 3, reps: '10/leg', weight: 'DB (moderate)' },
            { name: 'Single Leg Glute Bridge', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
            { name: `Copenhagen Plank (${copenhagenVariant})`, sets: 2, reps: `${copenhagenTime}/side`, weight: 'Bodyweight' },
            { name: 'Side Plank Abduction', sets: 2, reps: '12/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Add band resistance if easy' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Long-lever Copenhagen, single-leg bridges, heavier SLRDL. Progressive overload in action.`;
        } else {
          exercises.push(
            { name: 'Single Leg RDL (Supported)', sets: 3, reps: '8/leg', weight: 'DB (challenging for RIR 2)' },
            { name: 'Single Leg Glute Bridge', sets: 3, reps: '10/leg', weight: 'Add weight on hip if able' },
            { name: `Copenhagen Plank (${copenhagenVariant})`, sets: 3, reps: `${copenhagenTime}/side`, weight: 'Bodyweight', notes: 'Add slow adduction reps if hold is easy' },
            { name: 'Side Plank Abduction', sets: 2, reps: '15/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Banded' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 40;
          description = `Week ${weekInPhase} Base - Peak dosage. Heavy SLRDL, loaded bridges, long-lever Copenhagen with reps. Target RIR 2.`;
        }
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 2, reps: '8/leg', weight: 'DB (same as late Base)' },
          { name: 'Single Leg Glute Bridge', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Copenhagen Plank (Long Lever)', sets: 2, reps: '25s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 30;
        description = `Week ${weekInPhase} Speed - Maintain peak loads, reduced volume. Running volume is high — keep intensity, cut sets.`;
      } else {
        exercises.push(
          { name: 'Single Leg RDL (Supported)', sets: 2, reps: '10/leg', weight: 'DB (light)' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 25;
        description = `Week ${weekInPhase} Race Prep - Minimal hinge work. Maintain patterns, no fatigue.`;
      }
    } else {
      // Home gym tier - Variant B
      if (isRecovery) {
        exercises.push(
          { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 25;
        description = 'Recovery Week - Maintain movement quality. No progression this week.';
      } else if (phase.name === 'Base') {
        if (isEarlyBase) {
          exercises.push(
            { name: 'Single Leg RDL', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
            { name: 'Glute Bridges', sets: 3, reps: 15, weight: 'Bilateral, bodyweight' },
            { name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Bodyweight' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Establishing baseline. Bilateral bridges, bodyweight SLRDL. Master form first.`;
        } else if (isMidBase) {
          exercises.push(
            { name: 'Single Leg RDL', sets: 3, reps: '10/leg', weight: 'Add light weight if available' },
            { name: 'Single Leg Glute Bridge', sets: 3, reps: '12/leg', weight: 'Bodyweight' },
            { name: 'Side Plank Abduction', sets: 2, reps: '12/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Add band if easy' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Progressing to single-leg bridges and loaded SLRDL. Add resistance where possible.`;
        } else {
          exercises.push(
            { name: 'Single Leg RDL', sets: 3, reps: '8/leg', weight: 'Heaviest available load' },
            { name: 'Single Leg Glute Bridge', sets: 3, reps: '10/leg', weight: 'Add weight on hip' },
            { name: 'Side Plank Abduction', sets: 2, reps: '15/side', weight: 'Bodyweight' },
            { name: 'Tibialis Raises', sets: 3, reps: 15, weight: 'Banded' },
            { name: 'Foot Doming', sets: 2, reps: '10/side', weight: 'Bodyweight' }
          );
          duration = 35;
          description = `Week ${weekInPhase} Base - Peak dosage. Heaviest loads available, single-leg everything. Target RIR 2.`;
        }
      } else if (phase.name === 'Speed') {
        exercises.push(
          { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Same as late Base' },
          { name: 'Single Leg Glute Bridge', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 30;
        description = `Week ${weekInPhase} Speed - Maintain loads, reduced volume. Controlled movement.`;
      } else {
        exercises.push(
          { name: 'Single Leg RDL', sets: 2, reps: '10/leg', weight: 'Bodyweight' },
          { name: 'Glute Bridges', sets: 2, reps: 15, weight: 'Bodyweight' },
          { name: 'Tibialis Raises', sets: 2, reps: 15, weight: 'Bodyweight' }
        );
        duration = 20;
        description = `Week ${weekInPhase} Race Prep - Light hinge work only. Stay loose.`;
      }
    }
  }
  
  // Core work for all lower durability sessions
  exercises.push({
    name: 'Core Circuit',
    sets: 1,
    reps: '5 min',
    weight: 'Side planks, dead bugs, bird dogs'
  });
  
  const targetRIR = getTargetRIR(phase, isRecovery, weekInPhase);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: `Lower Body: Durability${variant === 'A' ? ' (Knee Focus)' : ' (Hinge Focus)'}${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'hypertrophy', // Progressive durability work — real overload drives adaptation
    tags: ['strength', 'lower_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:durability', `variant:${variant}`],
  };
}

// ============================================================================
// UPPER POSTURE SESSION
// Simple, consistent, low fatigue, high compliance
// ============================================================================

function createUpperPostureSession(
  phase: StrengthPhase,
  weekInPhase: number,
  isRecovery: boolean,
  tier: 'commercial_gym' | 'home_gym'
): IntentSession {
  const exercises: StrengthExercise[] = [];
  let duration: number;
  let description: string;
  
  if (tier === 'commercial_gym') {
    // Commercial gym: same movements every week, only volume changes slightly
    const sets = isRecovery ? 2 : phase.name === 'Base' ? 4 : 3;
    
    exercises.push(
      { name: 'Cable Face Pulls', sets, reps: 15, weight: 'Moderate cable' },
      { name: 'Band Pull-Aparts', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Cable Rows', sets: phase.name === 'Race Prep' ? 2 : 3, reps: 12, weight: 'Moderate, controlled' },
      { name: 'Prone Y/T/W Raises', sets: 2, reps: 12, weight: 'Light DBs (5-10 lb)' },
      { name: 'Dead Hang', sets: 2, reps: '30-45s', weight: 'Bodyweight (optional)' }
    );
    
    duration = isRecovery ? 25 : 30;
    description = isRecovery 
      ? 'Recovery Week - Light posture work. Maintain upper back strength.'
      : `Week ${weekInPhase} ${phase.name} - Upper back and posture work. Repeatable, low fatigue.`;
  } else {
    // Home gym: same movements every week
    const sets = isRecovery ? 2 : phase.name === 'Base' ? 4 : 3;
    
    exercises.push(
      { name: 'Band Face Pulls', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Band Pull-Aparts', sets, reps: 15, weight: 'Moderate band' },
      { name: 'Inverted Rows', sets: phase.name === 'Race Prep' ? 2 : 3, reps: 12, weight: 'Feet elevated when easy' },
      { name: 'Wall Angels', sets: 2, reps: 12, weight: 'Bodyweight' },
      { name: 'Dead Hang', sets: 2, reps: '30-45s', weight: 'Bodyweight (optional, if bar exists)' }
    );
    
    duration = isRecovery ? 25 : 30;
    description = isRecovery
      ? 'Recovery Week - Light posture work. Maintain upper back strength.'
      : `Week ${weekInPhase} ${phase.name} - Upper back and posture work. Repeatable, low fatigue.`;
  }
  
  const targetRIR = getTargetRIR(phase, isRecovery, weekInPhase);
  const exercisesWithRIR = applyTargetRIR(exercises, targetRIR);
  
  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: `Upper Body: Posture${isRecovery ? ' (Recovery)' : ''}`,
    description,
    duration,
    exercises: exercisesWithRIR,
    repProfile: 'maintenance', // Posture work is maintenance-focused, not growth
    tags: ['strength', 'upper_body', `tier:${tier}`, `phase:${phase.name.toLowerCase()}`, 'focus:posture'],
  };
}

// ============================================================================
// TAPER SESSIONS
// LOWER_MAINTENANCE + UPPER_POSTURE (preferred) for taper week
// Optional light movement for race week
// ============================================================================

function createTaperSessions(
  tier: 'commercial_gym' | 'home_gym',
  week: number,
  totalWeeks: number
): IntentSession[] {
  const sessions: IntentSession[] = [];
  // week is 1-based (Week 1, Week 2, ..., Week N), so race week is when week === totalWeeks
  const isRaceWeek = week === totalWeeks;
  const taperRIR = 4;
  
  if (isRaceWeek) {
    // Race week: optional 10-15 min posture + glute bridge + calves
    sessions.push({
      intent: 'FULLBODY_MAINTENANCE',
      priority: 'optional',
      name: 'Race Week: Light Movement (Optional)',
      description: 'Race week - Skip entirely or just 10-15 min of light movement. Nothing that will make you sore.',
      duration: 15,
      exercises: [
        { name: tier === 'commercial_gym' ? 'Cable Face Pulls' : 'Band Face Pulls', sets: 2, reps: 15, weight: tier === 'commercial_gym' ? 'Light cable' : 'Light band', target_rir: taperRIR },
        { name: 'Glute Bridges', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR },
        { name: 'Calf Raises', sets: 2, reps: 10, weight: 'Bodyweight', target_rir: taperRIR }
      ],
      repProfile: 'maintenance',
      tags: ['strength', 'full_body', 'phase:taper', 'optional', `tier:${tier}`],
    });
  } else {
    // Taper week (not race week): LOWER_MAINTENANCE + UPPER_POSTURE
    const lowerExercises: StrengthExercise[] = tier === 'commercial_gym' 
      ? [
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'DBs (light)', target_rir: taperRIR },
          { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR }
        ]
      : [
          { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Glute Bridges', sets: 2, reps: 12, weight: 'Bodyweight', target_rir: taperRIR },
          { name: 'Calf Raises', sets: 2, reps: 15, weight: 'Bodyweight', target_rir: taperRIR }
        ];
    
    sessions.push({
      intent: 'LOWER_MAINTENANCE',
      priority: 'preferred',
      name: 'Taper: Lower Maintenance',
      description: 'Taper week - Light lower body work to maintain patterns. 50-60% effort max. Save energy for race day.',
      duration: 25,
      exercises: lowerExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'lower_body', 'phase:taper', `tier:${tier}`],
    });
    
    const upperExercises: StrengthExercise[] = tier === 'commercial_gym'
      ? [
          { name: 'Cable Face Pulls', sets: 2, reps: 15, weight: 'Light cable', target_rir: taperRIR },
          { name: 'Band Pull-Aparts', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR }
        ]
      : [
          { name: 'Band Face Pulls', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR },
          { name: 'Band Pull-Aparts', sets: 2, reps: 15, weight: 'Light band', target_rir: taperRIR }
        ];
    
    sessions.push({
      intent: 'UPPER_POSTURE',
      priority: 'preferred',
      name: 'Taper: Upper Posture',
      description: 'Taper week - Light posture work to maintain patterns. 50-60% effort max.',
      duration: 20,
      exercises: upperExercises,
      repProfile: 'maintenance',
      tags: ['strength', 'upper_body', 'phase:taper', `tier:${tier}`],
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
  weekInPhase?: number
): number {
  if (isRecovery) return 3;
  
  switch (phase.name) {
    case 'Base': {
      // Progressive RIR within Base: early weeks conservative, late weeks push harder
      const wip = weekInPhase ?? 1;
      if (wip <= 2) return 3;
      return 2;
    }
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
  return exercises.map(ex => ({
    ...ex,
    target_rir: targetRIR
  }));
}
