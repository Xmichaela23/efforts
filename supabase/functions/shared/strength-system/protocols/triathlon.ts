// ============================================================================
// TRIATHLON STRENGTH PROTOCOL
//
// Variable Mechanical Specificity: exercise selection shifts based on phase,
// limiter sport, and week discipline emphasis.
//
// Science grounding:
//   - Mujika & Padilla 2003: taper = maintain intensity, cut volume
//   - Yamamoto et al. 2010: posterior chain power transfers directly to cycling economy
//   - Pontzer et al. 2018 / Cholewa et al. 2017: swim shoulder health requires
//     consistent scapular stabiliser volume throughout the season
//   - Rønnestad & Mujika 2014: concurrent training order matters —
//     strength AFTER endurance → AMPK/mTOR conflict; strength BEFORE or 6h+ after → fine
//
// Phase → exercise family matrix:
//   Base         3×8–12   hypertrophy/force  foundation that supports all three sports
//   Build        4×4–6    neural drive        explosive / single-leg / sport-specific power
//   Race-Specific 2×12–15 durability          maintain adaptations, zero new fatigue debt
//   Taper        1–2×3–5  neural priming      keep the snap, sub-15 min total
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';

// ─── Limiter-sport type pulled from ProtocolContext.triathlonContext ──────────
type LimiterSport = 'swim' | 'bike' | 'run';
type EquipmentTier = 'commercial_gym' | 'home_gym';

// ============================================================================
// PROTOCOL DEFINITION
// ============================================================================

export const triathlonProtocol: StrengthProtocol = {
  id: 'triathlon',
  name: 'Triathlon Multi-Sport',
  description:
    'Phase-aware strength that shifts emphasis based on your limiter sport and race calendar. ' +
    'Swim-heavy weeks prioritise scapular stability and lat power. Bike-heavy weeks load the ' +
    'posterior chain and open the thoracic spine. Run durability (single-leg stability) is always ' +
    'the floor. Volume drops to near-zero on taper while intensity is preserved for neural priming.',
  tradeoffs: [
    'More nuanced than a pure-run plan — requires knowing your limiter sport',
    'Build phase is genuinely hard: explosive step-ups and power cleans need focus',
    'No upper-body hypertrophy work — shoulder volume targets function, not aesthetics',
  ],
  createWeekSessions,
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, strengthFrequency } = context;
  const tier: EquipmentTier =
    context.userBaselines.equipment === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
  const limiter: LimiterSport = (context.triathlonContext?.limiterSport ?? 'run') as LimiterSport;
  const freq = strengthFrequency ?? 2;
  const strengthIntent = context.triathlonContext?.strengthIntent;

  const phaseName = String(phase?.name ?? '').toLowerCase();

  // Recovery weeks: one light full-body, no intensity
  if (isRecovery) {
    return [createRecoverySession(tier, weekInPhase)];
  }

  // Taper: neural priming only, ≤ 1 session regardless of freq setting
  if (phaseName === 'taper') {
    return [createTaperPrimingSession(tier)];
  }

  // Race / post-race: skip entirely (handled upstream by strFreq=0)
  if (phaseName === 'recovery') {
    return [];
  }

  if (phaseName === 'base') {
    return freq >= 2
      ? [
        createBasePosteriorChain(tier, limiter, weekInPhase, strengthIntent),
        createBaseUpperSwim(tier, limiter, weekInPhase, strengthIntent),
      ]
      : [createBasePosteriorChain(tier, limiter, weekInPhase, strengthIntent)];
  }

  if (phaseName === 'build') {
    return freq >= 2
      ? [
        createBuildExplosiveLower(tier, limiter, weekInPhase, strengthIntent),
        createBuildSwimPower(tier, limiter, weekInPhase),
      ]
      : [createBuildExplosiveLower(tier, limiter, weekInPhase, strengthIntent)];
  }

  // race_specific — maintenance only, single session
  return [createRaceSpecificMaintenance(tier, limiter)];
}

// ============================================================================
// BASE PHASE — foundational load (3×8–12)
// ============================================================================

function createBasePosteriorChain(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  strengthIntent?: 'support' | 'performance',
): IntentSession {
  const wip   = Math.max(1, weekInPhase);
  const early = wip <= 2;
  const sets  = early ? 3 : 4;
  const rir   = early ? 3 : 2;

  const exercises: StrengthExercise[] = [];

  // ── Primary hinge ────────────────────────────────────────────────────────
  if (tier === 'commercial_gym') {
    exercises.push({
      name: early ? 'Romanian Deadlift' : 'Trap Bar Deadlift',
      sets, reps: early ? 10 : 8,
      weight: early ? 'DBs (moderate, RIR 3)' : '70% 1RM',
      target_rir: rir,
      notes: 'Hinge at hips — keep neutral spine',
    });
  } else {
    exercises.push({
      name: 'Single-Leg RDL',
      sets, reps: '10/leg',
      weight: 'Heaviest available', target_rir: rir,
      notes: '2s lowering, touch-and-go',
    });
  }

  if (strengthIntent === 'performance' && tier === 'commercial_gym') {
    exercises.splice(1, 0, {
      name: 'Barbell Back Squat',
      sets,
      reps: early ? 8 : 6,
      weight: early ? '68% 1RM' : '72% 1RM',
      target_rir: rir,
      notes: 'Own the depth — stay braced',
    });
  }

  // ── Hip drive ─────────────────────────────────────────────────────────────
  exercises.push({
    name: 'Hip Thrusts',
    sets, reps: 12,
    weight: tier === 'commercial_gym' ? 'Barbell (moderate)' : 'Load hips with backpack',
    target_rir: rir,
    notes: 'Full hip extension at top — pause 1s',
  });

  // ── Single-leg stability (run durability floor) ───────────────────────────
  exercises.push({
    name: 'Step-ups',
    sets, reps: '10/leg',
    weight: tier === 'commercial_gym' ? 'DBs (light-moderate)' : 'Bodyweight + backpack',
    target_rir: rir,
    notes: '2-1-2 tempo — drive through heel',
  });

  // ── Bike-limiter addition: extra posterior chain + thoracic opener ─────────
  if (limiter === 'bike') {
    exercises.push({
      name: 'Prone Y/T/W Raises',
      sets: 2, reps: 10,
      weight: 'Very light DBs (3–5 lb)',
      notes: 'Thoracic extension + scapular retraction — key for aero position',
    });
  }

  // ── Calf eccentrics (run durability floor) ────────────────────────────────
  exercises.push({
    name: early ? 'Calf Raises (Bilateral)' : 'Single-Leg Calf Raises',
    sets: 3, reps: 12,
    weight: early ? 'Bodyweight' : tier === 'commercial_gym' ? 'Hold DB for load' : 'Bodyweight',
    notes: '3s eccentric (lower slowly)',
  });

  // ── Core ──────────────────────────────────────────────────────────────────
  exercises.push({ name: 'Dead Bug', sets: 3, reps: '8/side', weight: 'Bodyweight', notes: 'Press lower back into floor' });
  exercises.push({ name: 'Copenhagen Plank', sets: 2, reps: early ? '20s/side' : '30s/side', weight: 'Bodyweight' });

  const description = limiter === 'bike'
    ? `Base Week ${weekInPhase} — Posterior chain priority for cycling power. Trap bar / RDL + hip thrusts dominate. Thoracic mobility work included.`
    : limiter === 'swim'
    ? `Base Week ${weekInPhase} — Foundation lower body. Single-leg stability is the run floor; upper session covers swim shoulder work.`
    : `Base Week ${weekInPhase} — Foundational posterior chain and run durability. Target RIR ${rir}.`;

  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: `Tri Strength — Base Posterior Chain${limiter === 'bike' ? ' (Bike Power)' : ''}`,
    description,
    duration: early ? 45 : 55,
    exercises,
    repProfile: 'hypertrophy',
    tags: ['strength', 'lower_body', 'phase:base', `limiter:${limiter}`, 'triathlon'],
  };
}

function createBaseUpperSwim(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  strengthIntent?: 'support' | 'performance',
): IntentSession {
  const wip   = Math.max(1, weekInPhase);
  const sets  = wip <= 2 ? 3 : 4;
  const rir   = wip <= 2 ? 3 : 2;

  const exercises: StrengthExercise[] = [];

  // ── Primary pulling (EVF muscles — Early Vertical Forearm) ───────────────
  if (tier === 'commercial_gym') {
    exercises.push({
      name: 'Lat Pull-Down',
      sets, reps: 10,
      weight: 'Moderate cable — full range', target_rir: rir,
      notes: 'Initiate with scapular depression before elbow drive',
    });
    exercises.push({
      name: 'Seated Cable Row',
      sets, reps: 10,
      weight: 'Moderate — squeeze between shoulder blades', target_rir: rir,
    });
  } else {
    exercises.push({
      name: 'Pull-ups / Assisted Pull-ups',
      sets, reps: limiter === 'swim' ? 6 : 8,
      weight: 'Bodyweight (use band if needed)', target_rir: rir,
      notes: 'Full hang, retract scapulae before pulling',
    });
    exercises.push({
      name: 'Inverted Rows',
      sets, reps: 10,
      weight: 'Feet elevated', target_rir: rir,
    });
  }

  if (strengthIntent === 'performance' && tier === 'commercial_gym') {
    exercises.push({
      name: 'Barbell Bench Press',
      sets: 3,
      reps: 8,
      weight: '65% 1RM',
      target_rir: rir,
      notes: 'Touch and drive — scapulae pinned',
    });
  }

  // ── Scapular stability (critical for all disciplines) ────────────────────
  exercises.push({
    name: 'Face Pulls',
    sets: 3, reps: 15,
    weight: tier === 'commercial_gym' ? 'Light cable (rope attachment)' : 'Band',
    notes: 'Elbows high, external rotation at end range',
  });
  exercises.push({
    name: 'Band Pull-Aparts',
    sets: 3, reps: 20,
    weight: 'Light-moderate band',
    notes: 'Keep arms straight, pull to chest height',
  });

  if (strengthIntent === 'performance' && tier === 'commercial_gym') {
    exercises.push({
      name: 'Standing Barbell Overhead Press',
      sets: 3,
      reps: 8,
      weight: '62% 1RM',
      target_rir: rir,
      notes: 'Glutes tight — press in a slight arc',
    });
  }

  // ── Swim-limiter: extra shoulder health work ───────────────────────────────
  if (limiter === 'swim') {
    exercises.push({
      name: 'External Rotation (Side-Lying or Band)',
      sets: 3, reps: '15/side',
      weight: 'Very light (2–5 lb or light band)',
      notes: 'Rotator cuff health — slow, controlled range of motion',
    });
    exercises.push({
      name: 'Prone Y/T/W Raises',
      sets: 2, reps: 10,
      weight: 'Bodyweight / 3 lb DBs',
      notes: 'Lower trap and mid-back activation for high elbow catch',
    });
  }

  // ── Anti-rotation core ────────────────────────────────────────────────────
  exercises.push({
    name: 'Pallof Press',
    sets: 3, reps: '10/side',
    weight: tier === 'commercial_gym' ? 'Light cable' : 'Band anchor',
    notes: 'Resist rotation — brace and breathe',
  });

  const description = limiter === 'swim'
    ? `Base Week ${weekInPhase} — Swim priority: scapular stability, lat power, and rotator cuff health. High-elbow catch strength built here.`
    : `Base Week ${weekInPhase} — Upper pulling and scapular stability. Supports all three disciplines' postural demands.`;

  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: `Tri Strength — Base Upper${limiter === 'swim' ? ' (Swim Power)' : ''}`,
    description,
    duration: 40,
    exercises,
    repProfile: 'hypertrophy',
    tags: ['strength', 'upper_body', 'phase:base', `limiter:${limiter}`, 'triathlon'],
  };
}

// ============================================================================
// BUILD PHASE — explosive / neural drive (4×4–6)
// ============================================================================

function createBuildExplosiveLower(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  strengthIntent?: 'support' | 'performance',
): IntentSession {
  const sets = 4;
  const rir  = 1; // working hard in Build

  const exercises: StrengthExercise[] = [];

  // ── Explosive primary ─────────────────────────────────────────────────────
  exercises.push({
    name: tier === 'commercial_gym' ? 'Box Jumps' : 'Jump Squats',
    sets, reps: 5,
    weight: 'Bodyweight — max intent, land softly',
    target_rir: rir,
    notes: 'Reset fully between reps — quality over speed',
  });

  if (strengthIntent === 'performance' && tier === 'commercial_gym') {
    exercises.push({
      name: 'Conventional Deadlift',
      sets: 3,
      reps: 5,
      weight: '75% 1RM',
      target_rir: rir,
      notes: 'Hinge — reset tension each rep',
    });
  }

  // ── Single-leg power ──────────────────────────────────────────────────────
  exercises.push({
    name: 'Explosive Step-ups',
    sets, reps: '5/leg',
    weight: tier === 'commercial_gym' ? 'Light DBs (drive through heel explosively)' : 'Bodyweight',
    target_rir: rir,
    notes: 'Push through heel and fully extend hip at top',
  });

  // ── Hip drive — cycling and run stride power ───────────────────────────────
  exercises.push({
    name: 'Hip Thrusts (Fast Concentric)',
    sets, reps: 6,
    weight: tier === 'commercial_gym' ? 'Heavy barbell' : 'Load with backpack — explode up',
    target_rir: rir,
    notes: 'Lower under control (3s), then drive hips up explosively',
  });

  // ── Bike-limiter: heavier posterior chain compound ────────────────────────
  if (limiter === 'bike') {
    exercises.push({
      name: tier === 'commercial_gym' ? 'Bulgarian Split Squat' : 'Rear-Foot Elevated Split Squat',
      sets, reps: '6/leg',
      weight: tier === 'commercial_gym' ? 'DBs (challenging RIR 1)' : 'Bodyweight + backpack',
      target_rir: rir,
      notes: 'Loaded unilateral — hip flexor stretch + glute drive',
    });
  }

  // ── Run-limiter: eccentric calf load ──────────────────────────────────────
  if (limiter === 'run') {
    exercises.push({
      name: 'Weighted Single-Leg Calf Raises',
      sets: 3, reps: 8,
      weight: tier === 'commercial_gym' ? 'Hold heavy DB' : 'Use step edge + backpack',
      notes: '4s eccentric — Alfredson-inspired load for Achilles resilience',
    });
  }

  // ── Core ──────────────────────────────────────────────────────────────────
  exercises.push({ name: 'Plank with Shoulder Tap', sets: 3, reps: '10/side', weight: 'Bodyweight' });

  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: 'Tri Strength — Build Explosive Lower',
    description: `Build Week ${weekInPhase} — Neural drive and explosive power. Box jumps + explosive step-ups + fast hip thrusts. ` +
      `Strength is now about rate of force development, not volume. RIR ${rir}.`,
    duration: 50,
    exercises,
    repProfile: 'strength',
    tags: ['strength', 'lower_body', 'phase:build', `limiter:${limiter}`, 'triathlon', 'explosive'],
  };
}

function createBuildSwimPower(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
): IntentSession {
  const sets = 4;

  const exercises: StrengthExercise[] = [];

  // ── Power pull (swim catch power) ─────────────────────────────────────────
  if (tier === 'commercial_gym') {
    exercises.push({
      name: 'Explosive Lat Pull-Down',
      sets, reps: 6,
      weight: 'Moderate-heavy — fast pull, controlled return',
      target_rir: 1,
      notes: 'Rate of force development for the catch phase',
    });
    exercises.push({
      name: 'Dumbbell Power Row (Single Arm)',
      sets, reps: '6/side',
      weight: 'Heavy DB — explosive pull, 3s lower',
      target_rir: 1,
    });
  } else {
    exercises.push({
      name: 'Pull-ups (Explosive)',
      sets, reps: 4,
      weight: 'Bodyweight — pull fast, lower in 3s',
      target_rir: 1,
      notes: 'Full ROM — scapulae pack before pulling',
    });
    exercises.push({
      name: 'Inverted Rows (Explosive)',
      sets, reps: 8,
      weight: 'Feet elevated — pull fast, lower in 3s',
      target_rir: 1,
    });
  }

  // ── Swim-limiter: rotator cuff under load ─────────────────────────────────
  if (limiter === 'swim') {
    exercises.push({
      name: 'Single-Arm Cable External Rotation',
      sets: 3, reps: '12/side',
      weight: tier === 'commercial_gym' ? 'Light cable (elbow at 90°)' : 'Band',
      notes: 'Protect the shoulder under swimming fatigue',
    });
  }

  // ── Scapular stability (all disciplines) ─────────────────────────────────
  exercises.push({ name: 'Face Pulls', sets: 3, reps: 15, weight: tier === 'commercial_gym' ? 'Cable (rope)' : 'Band', notes: 'Elbows high' });

  // ── Core: anti-rotation + rotational power ────────────────────────────────
  if (tier === 'commercial_gym') {
    exercises.push({
      name: 'Cable Wood Chop (High to Low)',
      sets: 3, reps: '10/side',
      weight: 'Light-moderate cable',
      notes: 'Rotation power for the swim pull-through',
    });
  } else {
    exercises.push({
      name: 'Medicine Ball Rotational Slam (or Band)',
      sets: 3, reps: 8,
      weight: 'Light ball or band',
      notes: 'Rotational power — use full trunk',
    });
  }

  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: 'Tri Strength — Build Swim Power',
    description: `Build Week ${weekInPhase} — Explosive lat and scap power for swim catch. ` +
      `Fast-concentric pulls + rotational core. ${limiter === 'swim' ? 'Rotator cuff under load included (swim limiter).' : ''}`,
    duration: 45,
    exercises,
    repProfile: 'strength',
    tags: ['strength', 'upper_body', 'phase:build', `limiter:${limiter}`, 'triathlon', 'explosive'],
  };
}

// ============================================================================
// RACE-SPECIFIC PHASE — sport-specific maintenance (2×12–15)
// ============================================================================

function createRaceSpecificMaintenance(
  tier: EquipmentTier,
  limiter: LimiterSport,
): IntentSession {
  const exercises: StrengthExercise[] = [];

  // ── Lower: preserve hip drive + run durability ───────────────────────────
  exercises.push({ name: 'Hip Thrusts', sets: 2, reps: 12, weight: tier === 'commercial_gym' ? 'Moderate barbell' : 'Loaded backpack', target_rir: 3 });
  exercises.push({ name: 'Step-ups', sets: 2, reps: '10/leg', weight: tier === 'commercial_gym' ? 'Light DBs' : 'Bodyweight', target_rir: 3 });
  exercises.push({ name: 'Single-Leg Calf Raises', sets: 2, reps: 12, weight: 'Bodyweight', notes: '3s eccentric', target_rir: 3 });

  // ── Upper: sport-specific shoulder maintenance ────────────────────────────
  if (limiter === 'swim') {
    exercises.push({ name: 'Face Pulls', sets: 2, reps: 15, weight: tier === 'commercial_gym' ? 'Light cable' : 'Band', notes: 'Shoulder health priority' });
    exercises.push({ name: 'Band Pull-Aparts', sets: 2, reps: 20, weight: 'Light band' });
    exercises.push({ name: 'External Rotation (Side-Lying)', sets: 2, reps: '15/side', weight: 'Very light', notes: 'Rotator cuff maintenance' });
  } else {
    exercises.push({ name: 'Face Pulls', sets: 3, reps: 15, weight: tier === 'commercial_gym' ? 'Light cable' : 'Band' });
    exercises.push({ name: 'Band Pull-Aparts', sets: 3, reps: 20, weight: 'Light band' });
  }

  // ── Core: stabilisation patterns ──────────────────────────────────────────
  exercises.push({ name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' });
  exercises.push({ name: 'Dead Bug', sets: 2, reps: '8/side', weight: 'Bodyweight' });

  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: 'Tri Strength — Race-Specific Maintenance',
    description:
      'Race-specific phase — preserve all adaptations built in Base/Build with minimal fatigue. ' +
      '2 sets, submaximal load, movement quality focus. Shoulder health session included.',
    duration: 35,
    exercises,
    repProfile: 'maintenance',
    tags: ['strength', 'full_body', 'phase:race_specific', `limiter:${limiter}`, 'triathlon'],
  };
}

// ============================================================================
// TAPER PHASE — neural priming (1–2 sets × 3–5 reps)
// ============================================================================

function createTaperPrimingSession(tier: EquipmentTier): IntentSession {
  const exercises: StrengthExercise[] = [
    {
      name: tier === 'commercial_gym' ? 'Box Jumps' : 'Jump Squats',
      sets: 2, reps: 3,
      weight: 'Bodyweight — maximum intent',
      target_rir: 5,
      notes: 'Full rest between sets. You should feel fast, not tired.',
    },
    {
      name: 'Hip Thrusts (Explosive)',
      sets: 2, reps: 5,
      weight: tier === 'commercial_gym' ? 'Moderate barbell (50–60%)' : 'Bodyweight',
      target_rir: 5,
      notes: 'Drive up explosively — keep the neuromuscular pattern alive',
    },
    {
      name: 'Band Pull-Aparts',
      sets: 2, reps: 15,
      weight: 'Light band — not fatiguing',
      notes: 'Shoulder activation before race week',
    },
  ];

  return {
    intent: 'LOWER_MAINTENANCE',
    priority: 'optional',
    name: 'Tri Strength — Taper Neural Priming',
    description:
      'Taper: sub-15 min session. Goal is to fire the neuromuscular system, not generate fatigue. ' +
      'Box jumps + explosive hip thrusts + shoulder activation. Skip entirely race week.',
    duration: 15,
    exercises,
    repProfile: 'strength',
    tags: ['strength', 'full_body', 'phase:taper', 'triathlon', 'neural_priming'],
  };
}

// ============================================================================
// RECOVERY WEEK — one easy full-body session
// ============================================================================

function createRecoverySession(tier: EquipmentTier, weekInPhase: number): IntentSession {
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: 'Tri Strength — Recovery Week',
    description:
      `Recovery week — maintain movement patterns, no new fatigue. ` +
      `2 sets, stop well short of failure. Focus on quality and body awareness.`,
    duration: 30,
    exercises: [
      { name: 'Bodyweight Squat or Goblet Squat', sets: 2, reps: 12, weight: 'Bodyweight / light KB', target_rir: 5 },
      { name: 'Hip Thrusts', sets: 2, reps: 12, weight: 'Light load', target_rir: 5 },
      { name: 'Step-ups', sets: 2, reps: '10/leg', weight: 'Bodyweight', target_rir: 5 },
      { name: 'Face Pulls', sets: 2, reps: 15, weight: tier === 'commercial_gym' ? 'Light cable' : 'Band', target_rir: 5 },
      { name: 'Side Plank', sets: 2, reps: '20s/side', weight: 'Bodyweight' },
    ],
    repProfile: 'maintenance',
    tags: ['strength', 'full_body', 'recovery', 'triathlon'],
  };
}
