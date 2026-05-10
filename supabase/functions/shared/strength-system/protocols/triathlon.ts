// ============================================================================
// TRIATHLON STRENGTH PROTOCOL — Durability (Norwegian / Friel AA-MS-SM)
//
// Per docs/STRENGTH-PROTOCOL.md §4. Strength SUPPORTS endurance: injury
// prevention, tissue tolerance, posture. Selected when `strength_intent` is
// `support` (or default for non-performance tri).
//
// Phase model:
//   Anatomical Adaptation (AA)  — 20-30 reps @ 40-60% 1RM or BW, 2-3 sets, 2-3/wk
//   Maximum Strength (MS)       — 6-10 reps @ 75-85% 1RM,  2-3 sets, 1-2/wk
//   Strength Maintenance (SM)   — 8-12 reps @ 65-75% 1RM,  2 sets,    1/wk
//   Taper                       — 1 light session early week, 30 min, BW or 40%
//
// Mapping combined-plan endurance → strength phase (spec §4.2):
//   base, weekInPhase ≤ 6  → AA
//   base, weekInPhase > 6  → MS
//   build                  → SM
//   race_specific (speed)  → SM (volume reduced)
//   taper                  → 1 light session
//   recovery               → []  (handled upstream)
//
// All sessions are FULL-BODY. No upper/lower split — frequency is too low to
// justify it (spec §4.6). NO explosive / power work (spec §4.5) — power
// belongs to the performance protocol.
//
// Sport-agnostic by design. Limiter sport is recorded in tags for telemetry
// but does not branch exercise selection — durability is the same prescription
// regardless of swim/bike/run weakness.
// ============================================================================

import {
  StrengthProtocol,
  ProtocolContext,
  IntentSession,
  StrengthExercise,
} from './types.ts';

type LimiterSport = 'swim' | 'bike' | 'run';
type EquipmentTier = 'commercial_gym' | 'home_gym';

export const triathlonProtocol: StrengthProtocol = {
  id: 'triathlon',
  name: 'Triathlon Multi-Sport (Durability)',
  description:
    'Norwegian / Friel AA-MS-SM model: high-rep tissue work in early base, heavy ' +
    'maximum strength in late base, light maintenance through build and race-specific. ' +
    'Full-body sessions only — frequency is too low to justify upper/lower split. No power ' +
    'phase: durability is for injury prevention and tissue tolerance, not performance gains.',
  tradeoffs: [
    'No heavy compounds in early base — high-rep tissue work feels easy but builds resilience',
    'No explosive / power work — switch to Performance protocol if you want power development',
    'Race-specific volume is intentionally low — preserves adaptations without adding fatigue',
  ],
  createWeekSessions,
};

function createWeekSessions(context: ProtocolContext): IntentSession[] {
  const { phase, weekInPhase, isRecovery, strengthFrequency } = context;
  const planWeekLabel = Math.max(1, Number.isFinite(context.weekIndex) ? context.weekIndex : weekInPhase);
  const tier: EquipmentTier =
    context.userBaselines.equipment === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
  const hasCable: boolean = context.userBaselines.hasCable ?? (tier === 'commercial_gym');
  const limiter: LimiterSport = (context.triathlonContext?.limiterSport ?? 'run') as LimiterSport;
  const freq = Math.max(1, strengthFrequency ?? 2);

  const phaseName = String(phase?.name ?? '').toLowerCase();

  if (isRecovery) {
    return [createRecoverySession(tier, hasCable, limiter)];
  }

  if (phaseName === 'recovery') {
    return [];
  }

  if (phaseName === 'taper') {
    // Spec §7.2: 1 light session early week, then skip. Skip-optional.
    return [createTaperSession(tier, hasCable, limiter)];
  }

  if (phaseName === 'base') {
    // Spec §4.2: AA covers early base; MS covers late base. AA = 6 weeks per
    // spec §4.1, so weekInPhase > 6 transitions to MS.
    const wip = Math.max(1, weekInPhase);
    const useMS = wip > 6;
    const sessions: IntentSession[] = [];
    const sessionCount = Math.min(freq, useMS ? 2 : 3);
    for (let i = 0; i < sessionCount; i++) {
      sessions.push(
        useMS
          ? createMSSession(tier, hasCable, limiter, planWeekLabel, i)
          : createAASession(tier, hasCable, limiter, wip, planWeekLabel, i),
      );
    }
    return sessions;
  }

  if (phaseName === 'build' || phaseName === 'speed') {
    // Spec §4.2: build → SM; race-specific → SM with reduced volume.
    const reducedVolume = phaseName === 'speed';
    const sessions: IntentSession[] = [];
    const sessionCount = Math.min(freq, 2);
    for (let i = 0; i < sessionCount; i++) {
      sessions.push(createSMSession(tier, hasCable, limiter, planWeekLabel, i, reducedVolume));
    }
    return sessions;
  }

  // Default: AA (safe — early-base equivalent prescription).
  return [createAASession(tier, hasCable, limiter, 1, planWeekLabel, 0)];
}

// ── Anatomical Adaptation (AA) — high-rep tissue work, 40-60% 1RM or BW ─────
//
// Spec §4.1: 20-30 reps, 2-3 sets, 2-3 sessions/week. Goal is tissue
// tolerance, posture, joint mobility. Loads stay light deliberately.

function createAASession(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  variantIndex: number,
): IntentSession {
  const exercises: StrengthExercise[] = [];

  // Variant A: knee-dominant + horizontal push + horizontal pull
  // Variant B: hinge-dominant + vertical push + vertical pull
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';

  // ── Compound 1: squat or hinge ──────────────────────────────────────────
  if (variant === 'A') {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Goblet Squat',
        sets: 3, reps: '20-25',
        weight: 'Light DB/KB — 40-50% of usual goblet weight',
        target_rir: 4,
        notes: 'Tissue work — 3-second descent, full ROM',
      });
    } else {
      exercises.push({
        name: 'Bodyweight Squat',
        sets: 3, reps: '20-25',
        weight: 'Bodyweight — 3-second descent',
        target_rir: 4,
        notes: 'Slow eccentric builds tendon resilience',
      });
    }
  } else {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'DB Romanian Deadlift',
        sets: 3, reps: '20-25',
        weight: 'Light-moderate DBs',
        target_rir: 4,
        notes: 'Hinge mechanics — slow lower, soft knees',
      });
    } else {
      exercises.push({
        name: 'Single-Leg RDL (Bodyweight)',
        sets: 2, reps: '15/leg',
        weight: 'Bodyweight — controlled tempo',
        target_rir: 4,
      });
    }
  }

  // ── Compound 2: push pattern ────────────────────────────────────────────
  if (variant === 'A') {
    // Horizontal push
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'DB Bench Press (Light)',
        sets: 3, reps: '20-25',
        weight: 'Light DBs — full ROM, controlled',
        target_rir: 4,
      });
    } else {
      exercises.push({
        name: 'Push-ups',
        sets: 3, reps: '15-20',
        weight: 'Bodyweight (incline if needed for form)',
        target_rir: 3,
      });
    }
  } else {
    // Vertical push
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'DB Shoulder Press (Light)',
        sets: 3, reps: '20',
        weight: 'Light DBs',
        target_rir: 4,
      });
    } else {
      exercises.push({
        name: 'Band Overhead Press',
        sets: 3, reps: '20',
        weight: 'Light-medium band',
        target_rir: 4,
      });
    }
  }

  // ── Compound 3: pull pattern ────────────────────────────────────────────
  if (variant === 'A') {
    // Horizontal pull
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'DB Row (Chest-Supported)',
        sets: 3, reps: '20-25',
        weight: 'Light-moderate DBs',
        target_rir: 4,
        notes: 'Squeeze scaps; full ROM beats heavier load',
      });
    } else {
      exercises.push({
        name: 'Inverted Ring Row or Band Row',
        sets: 3, reps: '15-20',
        weight: 'Bodyweight (feet adjusted for difficulty)',
        target_rir: 3,
      });
    }
  } else {
    // Vertical pull
    if (tier === 'commercial_gym' && hasCable) {
      exercises.push({
        name: 'Lat Pull-Down (Light)',
        sets: 3, reps: '20',
        weight: 'Light cable — full ROM',
        target_rir: 4,
      });
    } else if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Band-Assisted Pull-up',
        sets: 3, reps: '8-12',
        weight: 'Heavy assistance band',
        target_rir: 3,
      });
    } else {
      exercises.push({
        name: 'Band Pull-Down',
        sets: 3, reps: '20',
        weight: 'Medium band',
        target_rir: 4,
      });
    }
  }

  // ── Stability + mobility accessories (spec §4.4) ───────────────────────
  if (variant === 'A') {
    exercises.push({ name: 'Plank Hold', sets: 2, reps: '30-45s', weight: 'Bodyweight' });
    exercises.push({ name: 'Glute Bridges', sets: 2, reps: '15-20', weight: 'Bodyweight' });
  } else {
    exercises.push({ name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' });
    exercises.push({ name: 'Bird Dog', sets: 2, reps: '10/side', weight: 'Bodyweight — slow' });
  }

  if (limiter === 'run') {
    exercises.push({
      name: 'Calf Raises (Bilateral)',
      sets: 2, reps: '15-20',
      weight: 'Bodyweight — 3s eccentric',
      notes: 'Achilles + plantar fascia resilience for run volume',
    });
  } else {
    exercises.push({
      name: 'Band Lateral Walks',
      sets: 2, reps: '12/side',
      weight: 'Light-medium band',
      notes: 'Glute medius — hip stability for bike + run',
    });
  }

  const variantLabel = variant === 'A' ? 'A (Knee/Push/Pull)' : 'B (Hinge/Vertical Press/Pull)';
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: `Tri Durability — Anatomical Adaptation ${variantLabel}`,
    description:
      `Base Week ${planWeekLabel} (AA phase) — Full-body tissue work. Light loads, high reps (20-25), ` +
      `slow tempos. Loads should feel easy; the goal is connective-tissue resilience, not muscle fatigue. ` +
      `RIR 3-4 throughout.`,
    duration: tier === 'commercial_gym' ? 45 : 40,
    exercises,
    repProfile: 'hypertrophy',
    tags: ['strength', 'full_body', 'triathlon', 'phase:base', 'phase:aa', `limiter:${limiter}`],
  };
}

// ── Maximum Strength (MS) — heavy compounds, 75-85% 1RM ─────────────────────
//
// Spec §4.1: 6-10 reps, 2-3 sets, 1-2 sessions/week. Late base only. Same
// movement patterns as AA but at meaningful loads. Still full-body.

function createMSSession(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  planWeekLabel: number,
  variantIndex: number,
): IntentSession {
  const exercises: StrengthExercise[] = [];
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';

  // ── Compound 1: squat (var A) or deadlift (var B) ──────────────────────
  if (variant === 'A') {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Barbell Back Squat',
        sets: 3, reps: '6-8',
        weight: '78% 1RM',
        target_rir: 2,
        notes: 'Full ROM — control the descent',
      });
    } else {
      exercises.push({
        name: 'Goblet Squat (Heavy)',
        sets: 3, reps: 8,
        weight: 'Heaviest single DB/KB you can hold',
        target_rir: 2,
      });
    }
  } else {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Conventional Deadlift',
        sets: 3, reps: '6-8',
        weight: '80% 1RM',
        target_rir: 2,
        notes: 'Reset between reps — quality over volume',
      });
    } else {
      exercises.push({
        name: 'Single-Leg RDL (Heavy DB)',
        sets: 3, reps: '8/leg',
        weight: 'Heaviest single DB',
        target_rir: 2,
      });
    }
  }

  // ── Compound 2: push ────────────────────────────────────────────────────
  if (tier === 'commercial_gym') {
    if (variant === 'A') {
      exercises.push({
        name: 'Bench Press',
        sets: 3, reps: '6-8',
        weight: '78% 1RM',
        target_rir: 2,
      });
    } else {
      exercises.push({
        name: 'Standing Barbell Overhead Press',
        sets: 3, reps: '6-8',
        weight: '75% 1RM',
        target_rir: 2,
      });
    }
  } else {
    if (variant === 'A') {
      exercises.push({
        name: 'DB Bench Press',
        sets: 3, reps: '8-10',
        weight: 'Heaviest DBs available',
        target_rir: 2,
      });
    } else {
      exercises.push({
        name: 'DB Shoulder Press',
        sets: 3, reps: '8-10',
        weight: 'Heaviest DBs available',
        target_rir: 2,
      });
    }
  }

  // ── Compound 3: pull ────────────────────────────────────────────────────
  if (tier === 'commercial_gym') {
    if (variant === 'A') {
      exercises.push({
        name: 'Barbell Row',
        sets: 3, reps: '6-8',
        weight: '75% 1RM',
        target_rir: 2,
      });
    } else {
      exercises.push({
        name: 'Pull-ups',
        sets: 3, reps: '6-8',
        weight: 'Bodyweight (add load when ready)',
        target_rir: 2,
      });
    }
  } else {
    exercises.push({
      name: variant === 'A' ? 'DB Row (Chest-Supported)' : 'Band-Assisted Pull-up or Band Pull-Down',
      sets: 3, reps: variant === 'A' ? '8-10' : '8-12',
      weight: variant === 'A' ? 'Heaviest DBs' : 'Heavy band',
      target_rir: 2,
    });
  }

  // ── Light accessories (no power work in durability per spec §4.5) ──────
  exercises.push({
    name: 'Dead Bug',
    sets: 2, reps: '8/side',
    weight: 'Bodyweight',
  });
  if (limiter === 'run') {
    exercises.push({
      name: 'Calf Raises (Bilateral)',
      sets: 2, reps: 15,
      weight: 'Bodyweight or light DB — 3s eccentric',
    });
  }

  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'required',
    name: `Tri Durability — Maximum Strength ${variant}`,
    description:
      `Late Base Week ${planWeekLabel} (MS phase) — Heavy compounds at 6-8 reps, RIR 2. ` +
      `Same movement patterns you've been training in AA, now at race-meaningful loads. ` +
      `Squat / hinge / push / pull — 3 sets each, full-body.`,
    duration: tier === 'commercial_gym' ? 50 : 45,
    exercises,
    repProfile: 'strength',
    tags: ['strength', 'full_body', 'triathlon', 'phase:base', 'phase:ms', `limiter:${limiter}`],
  };
}

// ── Strength Maintenance (SM) — moderate load preserves adaptations ─────────
//
// Spec §4.1: 8-12 reps @ 65-75% 1RM, 2 sets, 1/week (in-season). Build phase
// and race-specific phase. Reduced volume in race-specific.

function createSMSession(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  planWeekLabel: number,
  variantIndex: number,
  reducedVolume: boolean,
): IntentSession {
  const exercises: StrengthExercise[] = [];
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';
  const sets = reducedVolume ? 2 : 2; // Spec: 2 sets in SM. Reduced just trims duration + accessories.

  if (variant === 'A') {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Barbell Back Squat',
        sets, reps: '8-10',
        weight: '70% 1RM',
        target_rir: 3,
      });
    } else {
      exercises.push({
        name: 'Goblet Squat',
        sets, reps: 10,
        weight: 'Moderate DB/KB',
        target_rir: 3,
      });
    }
  } else {
    if (tier === 'commercial_gym') {
      exercises.push({
        name: 'Conventional Deadlift',
        sets, reps: '8-10',
        weight: '70% 1RM',
        target_rir: 3,
      });
    } else {
      exercises.push({
        name: 'DB Romanian Deadlift',
        sets, reps: 10,
        weight: 'Moderate DBs',
        target_rir: 3,
      });
    }
  }

  if (tier === 'commercial_gym') {
    exercises.push({
      name: variant === 'A' ? 'Bench Press' : 'Standing Barbell Overhead Press',
      sets, reps: '8-10',
      weight: variant === 'A' ? '70% 1RM' : '65% 1RM',
      target_rir: 3,
    });
    exercises.push({
      name: variant === 'A' ? 'Barbell Row' : 'Pull-ups',
      sets, reps: variant === 'A' ? '8-10' : '6-8',
      weight: variant === 'A' ? '65% 1RM' : 'Bodyweight',
      target_rir: 3,
    });
  } else {
    exercises.push({
      name: variant === 'A' ? 'DB Bench Press' : 'DB Shoulder Press',
      sets, reps: 10,
      weight: 'Moderate DBs',
      target_rir: 3,
    });
    exercises.push({
      name: variant === 'A' ? 'DB Row (Chest-Supported)' : 'Band-Assisted Pull-up',
      sets, reps: variant === 'A' ? 10 : '8-12',
      weight: variant === 'A' ? 'Moderate DBs' : 'Medium band',
      target_rir: 3,
    });
  }

  if (!reducedVolume) {
    exercises.push({
      name: 'Plank Hold',
      sets: 2, reps: '30-45s',
      weight: 'Bodyweight',
    });
    if (limiter === 'run') {
      exercises.push({
        name: 'Calf Raises (Bilateral)',
        sets: 2, reps: 15,
        weight: 'Bodyweight or light',
      });
    }
  } else {
    exercises.push({
      name: 'Plank Hold',
      sets: 1, reps: '30s',
      weight: 'Bodyweight',
    });
  }

  const phaseLabel = reducedVolume ? 'Race-Specific' : 'Build';
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: `Tri Durability — Strength Maintenance ${variant}${reducedVolume ? ' (Reduced)' : ''}`,
    description:
      `${phaseLabel} Week ${planWeekLabel} (SM phase) — Maintain strength built in MS with 2 sets ` +
      `at 8-10 reps and moderate load (~70% 1RM). Movement quality, not maximal effort. ` +
      `${reducedVolume ? 'Race-specific volume reduced — minimize fatigue ahead of the race.' : ''}`.trim(),
    duration: reducedVolume ? 30 : (tier === 'commercial_gym' ? 40 : 35),
    exercises,
    repProfile: 'maintenance',
    tags: [
      'strength', 'full_body', 'triathlon',
      reducedVolume ? 'phase:race_specific' : 'phase:build',
      'phase:sm', `limiter:${limiter}`,
    ],
  };
}

// ── Taper — 1 light session early week, skip-optional ───────────────────────
//
// Spec §7.2 (durability race week): Mon/Tue, 30 min, BW or 40% 1RM, 2×8-10,
// mobility focus. After this session, no strength until post-race recovery.

function createTaperSession(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
): IntentSession {
  const exercises: StrengthExercise[] = [];
  if (tier === 'commercial_gym') {
    exercises.push({
      name: 'Goblet Squat or Bodyweight Squat',
      sets: 2, reps: '8-10',
      weight: 'Light KB/DB or bodyweight',
      target_rir: 5,
      notes: 'Movement quality only — no fatigue',
    });
  } else {
    exercises.push({
      name: 'Bodyweight Squat',
      sets: 2, reps: 10,
      weight: 'Bodyweight',
      target_rir: 5,
    });
  }

  exercises.push({
    name: 'Glute Bridges',
    sets: 2, reps: 10,
    weight: 'Bodyweight',
    target_rir: 5,
  });

  exercises.push({
    name: 'Band Pull-Aparts',
    sets: 2, reps: 15,
    weight: 'Light band',
    notes: 'Shoulder activation — race-week posture',
  });

  exercises.push({
    name: 'Bird Dog',
    sets: 2, reps: '8/side',
    weight: 'Bodyweight — slow',
  });

  if (limiter === 'run') {
    exercises.push({
      name: 'Calf Raises (Bilateral)',
      sets: 2, reps: 12,
      weight: 'Bodyweight',
    });
  }

  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'optional',
    name: 'Tri Durability — Taper Light Session',
    description:
      'Race week — one light session early in the week (Monday or Tuesday). ' +
      '30 minutes, bodyweight or 40% 1RM, mobility focus. Skip-optional if you ' +
      'feel fresh and want the day for recovery. After this session, no strength ' +
      'until the post-race recovery week.',
    duration: 30,
    exercises,
    repProfile: 'maintenance',
    tags: ['strength', 'full_body', 'triathlon', 'phase:taper'],
  };
}

// ── Recovery week — light full-body, no intensity ───────────────────────────

function createRecoverySession(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
): IntentSession {
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: 'Tri Durability — Recovery Week',
    description:
      'Recovery week — maintain movement patterns at sub-maximal load. 2 sets, ' +
      'stop well short of failure. Goal is body awareness and tissue maintenance, ' +
      'not new fatigue.',
    duration: 30,
    exercises: [
      {
        name: tier === 'commercial_gym' ? 'Goblet Squat' : 'Bodyweight Squat',
        sets: 2, reps: 12,
        weight: tier === 'commercial_gym' ? 'Light KB' : 'Bodyweight',
        target_rir: 5,
      },
      {
        name: 'Glute Bridges',
        sets: 2, reps: 12,
        weight: 'Bodyweight',
        target_rir: 5,
      },
      {
        name: 'Band Pull-Aparts',
        sets: 2, reps: 15,
        weight: 'Light band',
      },
      {
        name: 'Side Plank',
        sets: 2, reps: '20s/side',
        weight: 'Bodyweight',
      },
      {
        name: limiter === 'run' ? 'Calf Raises (Bilateral)' : 'Band Lateral Walks',
        sets: 2, reps: limiter === 'run' ? 15 : '10/side',
        weight: 'Bodyweight or light band',
      },
    ],
    repProfile: 'maintenance',
    tags: ['strength', 'full_body', 'recovery', 'triathlon'],
  };
}
