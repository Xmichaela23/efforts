// ============================================================================
// TRIATHLON PERFORMANCE STRENGTH PROTOCOL
//
// Periodized strength for triathletes who want real gains (strength_intent /
// training_intent performance) — hypertrophy → strength → power → taper.
// Distinct from `triathlon` (support / concurrent-training friendly baseline).
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';

type LimiterSport = 'swim' | 'bike' | 'run';
type EquipmentTier = 'commercial_gym' | 'home_gym';

export const triathlonPerformanceProtocol: StrengthProtocol = {
  id: 'triathlon_performance',
  name: 'Triathlon Performance Strength',
  description:
    'Periodized strength for endurance athletes: hypertrophy base, heavy build, race-specific power, taper priming. ' +
    'Serves injury prevention, power transfer, durability, and measurable strength — not bodybuilding.',
  tradeoffs: [
    'Higher neuromuscular demand than the support protocol — schedule around hard endurance',
    'Commercial / barbell tier unlocks full prescription; home tier scales to DBs and pull-ups',
  ],
  createWeekSessions,
};

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, strengthFrequency } = context;
  const planWeekLabel = Math.max(1, Number.isFinite(context.weekIndex) ? context.weekIndex : weekInPhase);
  const tier: EquipmentTier =
    context.userBaselines.equipment === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
  // hasCable / hasGHD are explicit when threaded from Arc equipment list; fall back to safe defaults.
  const hasCable: boolean = context.userBaselines.hasCable ?? (tier === 'commercial_gym');
  const hasGHD: boolean = context.userBaselines.hasGHD ?? false;
  const limiter: LimiterSport = (context.triathlonContext?.limiterSport ?? 'run') as LimiterSport;
  const freq = strengthFrequency ?? 2;
  const phaseName = String(phase?.name ?? '').toLowerCase();

  if (isRecovery) {
    return [createPerfRecoverySession(tier, hasCable)];
  }

  if (phaseName === 'taper') {
    return [perfTaperSession(tier, hasCable)];
  }

  if (phaseName === 'recovery') {
    return [];
  }

  if (phaseName === 'base') {
    return freq >= 2
      ? [perfBaseLower(tier, limiter, weekInPhase, planWeekLabel, hasGHD), perfBaseUpper(tier, hasCable, limiter, weekInPhase, planWeekLabel)]
      : [perfBaseLower(tier, limiter, weekInPhase, planWeekLabel, hasGHD)];
  }

  if (phaseName === 'build') {
    return freq >= 2
      ? [perfBuildLower(tier, limiter, weekInPhase, planWeekLabel), perfBuildUpper(tier, hasCable, limiter, weekInPhase, planWeekLabel)]
      : [perfBuildLower(tier, limiter, weekInPhase, planWeekLabel)];
  }

  if (phaseName === 'race prep' || phaseName === 'race-specific' || phaseName === 'speed') {
    return freq >= 2
      ? [perfRaceLower(tier, limiter, weekInPhase, planWeekLabel), perfRaceUpper(tier, hasCable, limiter)]
      : [perfRaceLower(tier, limiter, weekInPhase, planWeekLabel)];
  }

  return [perfBaseLower(tier, limiter, weekInPhase, planWeekLabel)];
}

// ── Recovery (deload week): −volume, keep patterns ────────────────────────

function createPerfRecoverySession(tier: EquipmentTier, hasCable: boolean): IntentSession {
  const ex: StrengthExercise[] = [
    {
      name: tier === 'commercial_gym' ? 'Conventional Deadlift' : 'Single-Leg RDL',
      sets: 2,
      reps: tier === 'commercial_gym' ? 8 : '8/leg',
      weight: tier === 'commercial_gym' ? '~90% of usual working weight' : 'Controlled',
      target_rir: 4,
      notes: 'Recovery week — reduce load ~10%, stop with plenty in reserve',
    },
    { name: 'Hip Thrusts', sets: 2, reps: 10, weight: 'Light–moderate', target_rir: 4 },
    { name: 'Step-ups', sets: 2, reps: '8/leg', weight: 'Light', target_rir: 4 },
    {
      name: 'Face Pulls',
      sets: 2,
      reps: 15,
      weight: hasCable ? 'Light cable' : 'Band',
      target_rir: 4,
    },
    { name: 'Dead Bug', sets: 2, reps: '8/side', weight: 'Bodyweight', target_rir: 4 },
  ];
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: 'Tri Performance — Recovery / Deload',
    description:
      'Deload: fewer sets, lighter loads (~10% down), same movement patterns. Maintain tissue tolerance without soreness.',
    duration: 35,
    exercises: ex,
    repProfile: 'maintenance',
    tags: ['strength', 'recovery', 'triathlon_performance', 'phase:recovery'],
  };
}

// ── Base: hypertrophy (weeks 1–8 in a typical macrocycle) ───────────────────

function perfBaseLower(tier: EquipmentTier, limiter: LimiterSport, weekInPhase: number, planWeekLabel: number, hasGHD?: boolean): IntentSession {
  const wip = Math.max(1, weekInPhase);
  const sets = 3;
  const rir = 3;
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Conventional Deadlift',
      sets,
      reps: '8-10',
      weight: '65% 1RM',
      target_rir: rir,
      notes: 'Hip hinge — bike + run power base',
    });
    ex.push({
      name: 'Barbell Back Squat',
      sets,
      reps: '8-10',
      weight: '65% 1RM',
      target_rir: rir,
      notes: 'Knee drive + run strength',
    });
  } else {
    ex.push({
      name: 'Single-Leg RDL',
      sets,
      reps: '10/leg',
      weight: 'Heaviest DBs you own — controlled',
      target_rir: rir,
    });
    ex.push({
      name: 'Goblet Squat',
      sets,
      reps: '10-12',
      weight: 'One heavy DB/KB',
      target_rir: rir,
    });
  }

  if (hasGHD) {
    ex.push({
      name: 'Nordic Hamstring Curl',
      sets: 2,
      reps: 5,
      weight: 'Controlled — use band for assistance as needed',
      target_rir: rir,
      notes: 'Eccentric hamstring resilience — low volume, high intent',
    });
  } else {
    ex.push({
      name: 'Single-Leg RDL',
      sets: 2,
      reps: '8/leg',
      weight: tier === 'commercial_gym' ? 'Light-moderate DB/barbell' : 'Heaviest available',
      target_rir: rir,
      notes: 'Unilateral hip hinge — better running transfer than bilateral; 2s lowering',
    });
  }

  if (limiter === 'run' || limiter === 'bike') {
    ex.push({
      name: 'Calf Raises (Bilateral)',
      sets: 3,
      reps: 12,
      weight: tier === 'commercial_gym' ? 'Hold DB — heavy eccentric' : 'Bodyweight on step',
      notes: '3s lower — Achilles resilience',
    });
  }

  ex.push({ name: 'Dead Bug', sets: 3, reps: '8/side', weight: 'Bodyweight' });
  ex.push({
    name: 'Copenhagen Plank',
    sets: 2,
    reps: wip <= 2 ? '20s/side' : '30s/side',
    weight: 'Bodyweight',
  });

  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: 'Tri Performance — Base Hypertrophy (Lower)',
    description: `Base Week ${planWeekLabel} — Two primary lower compounds (≈65% 1RM, RIR ${rir}) plus ${hasGHD ? 'Nordic curls 2×5' : 'single-leg RDL 2×8/leg'} for hamstring resilience; accessories stay light.`,
    duration: tier === 'commercial_gym' ? 50 : 48,
    exercises: ex,
    repProfile: 'hypertrophy',
    tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:base', `limiter:${limiter}`],
  };
}

function perfBaseUpper(tier: EquipmentTier, hasCable: boolean, limiter: LimiterSport, weekInPhase: number, planWeekLabel: number): IntentSession {
  const wip = Math.max(1, weekInPhase);
  const sets = 3;
  const rir = 3;
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Barbell Row',
      sets,
      reps: '8-10',
      weight: '65% 1RM (bench anchor)',
      target_rir: rir,
      notes: 'Swim pull + thoracic extension for aero',
    });
    ex.push({
      name: 'Bench Press',
      sets,
      reps: '8-10',
      weight: '65% 1RM',
      target_rir: rir,
    });
    if (hasCable) {
      ex.push({
        name: 'Lat Pull-Down',
        sets,
        reps: 10,
        weight: 'Moderate — full ROM',
        target_rir: rir,
      });
    } else {
      ex.push({
        name: 'Pull-ups',
        sets,
        reps: limiter === 'swim' ? 6 : 8,
        weight: 'Bodyweight',
        target_rir: rir,
        notes: 'Lat strength for swim pull',
      });
    }
  } else {
    ex.push({
      name: 'Inverted Rows',
      sets,
      reps: '10-12',
      weight: 'Feet elevated',
      target_rir: rir,
    });
    ex.push({
      name: 'Push-ups',
      sets,
      reps: '10-15',
      weight: 'Bodyweight',
      target_rir: rir,
    });
    ex.push({
      name: 'Pull-ups / Assisted Pull-ups',
      sets,
      reps: limiter === 'swim' ? 6 : 8,
      weight: 'Bodyweight',
      target_rir: rir,
    });
  }

  ex.push({
    name: 'Face Pulls',
    sets: 3,
    reps: 15,
    weight: hasCable ? 'Light cable (rope)' : 'Band',
  });
  ex.push({ name: 'Band Pull-Aparts', sets: 3, reps: 20, weight: 'Light-moderate band' });

  if (limiter === 'swim') {
    ex.push({
      name: 'External Rotation (Side-Lying or Band)',
      sets: 3,
      reps: '15/side',
      weight: 'Very light',
    });
  }

  ex.push({
    name: 'Pallof Press',
    sets: 3,
    reps: '10/side',
    weight: hasCable ? 'Light cable' : 'Band anchor',
  });

  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: 'Tri Performance — Base Hypertrophy (Upper)',
    description: `Base Week ${planWeekLabel} — Upper hypertrophy for swim pull, posture, and shoulder health (RIR ${rir}).`,
    duration: 45,
    exercises: ex,
    repProfile: 'hypertrophy',
    tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:base', `limiter:${limiter}`],
  };
}

// ── Build: strength (≈78–82% 1RM) ──────────────────────────────────────────

function perfBuildLower(tier: EquipmentTier, limiter: LimiterSport, weekInPhase: number, planWeekLabel: number): IntentSession {
  const mainSets = 3;
  const rir = 2;
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Conventional Deadlift',
      sets: mainSets,
      reps: '4-6',
      weight: '80% 1RM',
      target_rir: rir,
    });
    ex.push({
      name: 'Barbell Back Squat',
      sets: mainSets,
      reps: '4-6',
      weight: '78% 1RM',
      target_rir: rir,
    });
  } else {
    ex.push({
      name: 'Single-Leg RDL',
      sets: mainSets,
      reps: '8/leg',
      weight: 'Heavy — RIR 2',
      target_rir: rir,
    });
    ex.push({
      name: 'Goblet Squat',
      sets: mainSets,
      reps: 8,
      weight: 'Heavy',
      target_rir: rir,
    });
  }

  if (limiter === 'run' || limiter === 'bike') {
    ex.push({
      name: 'Weighted Single-Leg Calf Raises',
      sets: 3,
      reps: 10,
      weight: tier === 'commercial_gym' ? 'Hold DB' : 'Backpack',
      notes: '3s eccentric',
    });
  }

  ex.push({ name: 'Dead Bug', sets: 3, reps: '8/side', weight: 'Bodyweight' });

  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: 'Tri Performance — Strength Build (Lower)',
    description: `Build Week ${planWeekLabel} — Two heavy compounds only (3 working sets each, ~78–80% 1RM), RIR ${rir}. Hamstring Nordics live in base; build stays squat + hinge volume-capped.`,
    duration: 48,
    exercises: ex,
    repProfile: 'strength',
    tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:build', `limiter:${limiter}`],
  };
}

function perfBuildUpper(tier: EquipmentTier, hasCable: boolean, limiter: LimiterSport, weekInPhase: number, planWeekLabel: number): IntentSession {
  const wip = Math.max(1, weekInPhase);
  const sets = 4;
  const rir = 2;
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Barbell Row',
      sets,
      reps: '4-6',
      weight: '80% 1RM (bench anchor)',
      target_rir: rir,
    });
    ex.push({
      name: 'Pull-ups',
      sets: 3,
      reps: '4-6',
      weight: 'Bodyweight + small load when ready — or assisted',
      target_rir: rir,
      notes: 'Lat strength for swim',
    });
    ex.push({
      name: 'Standing Barbell Overhead Press',
      sets: 3,
      reps: '5-6',
      weight: '72% 1RM',
      target_rir: rir,
    });
  } else {
    ex.push({
      name: 'Pull-ups (Explosive)',
      sets: 4,
      reps: 5,
      weight: 'Bodyweight',
      target_rir: rir,
    });
    ex.push({
      name: 'Inverted Rows',
      sets: 4,
      reps: 8,
      weight: 'Feet elevated',
      target_rir: rir,
    });
    ex.push({
      name: 'Pike Push-ups',
      sets: 3,
      reps: 8,
      weight: 'Bodyweight',
      target_rir: rir,
    });
  }

  ex.push({
    name: 'Face Pulls',
    sets: 3,
    reps: 15,
    weight: hasCable ? 'Cable' : 'Band',
  });
  ex.push({ name: 'Band Pull-Aparts', sets: 3, reps: 20, weight: 'Band' });

  if (limiter === 'swim') {
    ex.push({
      name: 'Prone Y/T/W Raises',
      sets: 2,
      reps: 10,
      weight: 'Light DBs or bodyweight',
    });
  }

  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: 'Tri Performance — Strength Build (Upper)',
    description: `Build Week ${planWeekLabel} — Heavy pull + press (RIR ${rir}).`,
    duration: 45,
    exercises: ex,
    repProfile: 'strength',
    tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:build', `limiter:${limiter}`],
  };
}

// ── Race-specific: power / neural ───────────────────────────────────────────

function perfRaceLower(tier: EquipmentTier, limiter: LimiterSport, weekInPhase: number, planWeekLabel: number): IntentSession {
  const wip = Math.max(1, weekInPhase);
  const rir = 1;
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Trap Bar Deadlift',
      sets: 3,
      reps: '2-3',
      weight: '87% 1RM — explosive intent',
      target_rir: rir,
      notes: 'Reset each rep — quality speed',
    });
    ex.push({
      name: 'Box Jumps',
      sets: 3,
      reps: 3,
      weight: 'Bodyweight — max intent, soft land',
      target_rir: 2,
    });
  } else {
    ex.push({
      name: 'Jump Squats',
      sets: 3,
      reps: 5,
      weight: 'Bodyweight',
      target_rir: 2,
    });
  }

  ex.push({
    name: 'Hip Thrusts (Fast Concentric)',
    sets: 3,
    reps: 5,
    weight: tier === 'commercial_gym' ? 'Heavy barbell' : 'Backpack',
    target_rir: rir,
    notes: 'Explosive hip extension',
  });

  ex.push({
    name: 'Explosive Step-ups',
    sets: 3,
    reps: '4/leg',
    weight: tier === 'commercial_gym' ? 'Light DBs' : 'Bodyweight',
    target_rir: rir,
  });

  if (limiter === 'run') {
    ex.push({
      name: 'Single-Leg Calf Raises',
      sets: 3,
      reps: 10,
      weight: '3s eccentric',
    });
  }

  ex.push({ name: 'Plank with Shoulder Tap', sets: 3, reps: '10/side', weight: 'Bodyweight' });

  return {
    intent: 'LOWER_DURABILITY',
    priority: 'required',
    name: 'Tri Performance — Neural Power (Lower)',
    description: `Race-prep Week ${planWeekLabel} — Low reps, high intent (~85–87% on bar). Express strength as power; minimal fatigue.`,
    duration: 50,
    exercises: ex,
    repProfile: 'strength',
    tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:race', 'explosive', `limiter:${limiter}`],
  };
}

function perfRaceUpper(tier: EquipmentTier, hasCable: boolean, limiter: LimiterSport): IntentSession {
  const ex: StrengthExercise[] = [];

  if (tier === 'commercial_gym') {
    ex.push({
      name: 'Barbell Row',
      sets: 3,
      reps: 5,
      weight: '75% 1RM — crisp rows',
      target_rir: 2,
    });
    if (hasCable) {
      ex.push({
        name: 'Explosive Lat Pull-Down',
        sets: 3,
        reps: 5,
        weight: 'Moderate — fast concentric',
        target_rir: 2,
      });
    } else {
      ex.push({
        name: 'Pull-ups (Explosive)',
        sets: 3,
        reps: 4,
        weight: 'Bodyweight',
        target_rir: 2,
      });
    }
  } else {
    ex.push({
      name: 'Pull-ups (Explosive)',
      sets: 3,
      reps: 4,
      weight: 'Bodyweight',
      target_rir: 2,
    });
  }

  ex.push({
    name: 'Face Pulls',
    sets: 3,
    reps: 15,
    weight: hasCable ? 'Light cable' : 'Band',
  });
  ex.push({ name: 'Band Pull-Aparts', sets: 3, reps: 20, weight: 'Band' });

  if (limiter === 'swim') {
    ex.push({
      name: 'External Rotation (Side-Lying or Band)',
      sets: 2,
      reps: '12/side',
      weight: 'Light',
    });
  }

  return {
    intent: 'UPPER_POSTURE',
    priority: 'required',
    name: 'Tri Performance — Maintenance + Power (Upper)',
    description:
      'Race-prep upper — maintain pulling strength and shoulder health; lower overall volume than build phase.',
    duration: 35,
    exercises: ex,
    repProfile: 'maintenance',
    tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:race', `limiter:${limiter}`],
  };
}

// ── Taper: neural priming — light, fast, minimal soreness ───────────────────

function perfTaperSession(tier: EquipmentTier, hasCable: boolean): IntentSession {
  const ex: StrengthExercise[] = [
    {
      name: tier === 'commercial_gym' ? 'Conventional Deadlift' : 'Single-Leg RDL',
      sets: 2,
      reps: 4,
      weight: tier === 'commercial_gym' ? '75% 1RM — move fast, no grind' : 'Light',
      target_rir: 4,
      notes: 'Velocity intent — not fatigue',
    },
    {
      name: 'Hip Thrusts',
      sets: 2,
      reps: 5,
      weight: tier === 'commercial_gym' ? 'Light–moderate barbell — explosive' : 'Bodyweight',
      target_rir: 4,
    },
    {
      name: 'Calf Raises (Bilateral)',
      sets: 2,
      reps: 12,
      weight: 'Bodyweight or light',
      notes: 'Ankle stiffness — no soreness',
    },
    {
      name: 'Band Pull-Aparts',
      sets: 2,
      reps: 20,
      weight: 'Light band',
    },
    {
      name: 'Face Pulls',
      sets: 2,
      reps: 15,
      weight: hasCable ? 'Very light cable' : 'Band',
    },
  ];

  return {
    intent: 'LOWER_MAINTENANCE',
    priority: 'optional',
    name: 'Tri Performance — Taper Priming',
    description:
      'Taper: one short session — light loads moved fast, shoulders activated. Skip entirely in final race week if preferred.',
    duration: 25,
    exercises: ex,
    repProfile: 'strength',
    tags: ['strength', 'triathlon_performance', 'phase:taper', 'neural_priming'],
  };
}
