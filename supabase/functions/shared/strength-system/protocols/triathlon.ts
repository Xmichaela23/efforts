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
type EquipmentTier3 = 'commercial_gym' | 'dumbbell_based' | 'bodyweight_bands';

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
  // Three-tier classification per spec §8. Default falls through 2-tier:
  // commercial_gym remains commercial_gym; legacy home_gym defaults to dumbbell_based when
  // the wizard hasn't specified — bodyweight_bands is opt-in via the 3-tier resolver.
  const tier3: EquipmentTier3 =
    context.userBaselines.equipmentTier ??
    (context.userBaselines.equipment === 'commercial_gym' ? 'commercial_gym' : 'dumbbell_based');
  const tier: EquipmentTier = tier3 === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
  const hasCable: boolean = context.userBaselines.hasCable ?? (tier === 'commercial_gym');
  const hasPullUpBar: boolean = context.userBaselines.hasPullUpBar ?? (tier === 'commercial_gym');
  const limiter: LimiterSport = (context.triathlonContext?.limiterSport ?? 'run') as LimiterSport;
  const freq = Math.max(1, strengthFrequency ?? 2);

  const phaseName = String(phase?.name ?? '').toLowerCase();

  if (isRecovery) {
    return [createRecoverySession(tier, hasCable, limiter, tier3, hasPullUpBar)];
  }

  if (phaseName === 'recovery') {
    return [];
  }

  if (phaseName === 'taper') {
    // Spec §7.2: 1 light session early week, then skip. Skip-optional.
    return [createTaperSession(tier, hasCable, limiter, tier3, hasPullUpBar)];
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
          ? createMSSession(tier, hasCable, limiter, planWeekLabel, i, tier3, hasPullUpBar)
          : createAASession(tier, hasCable, limiter, wip, planWeekLabel, i, tier3, hasPullUpBar),
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
      sessions.push(createSMSession(tier, hasCable, limiter, planWeekLabel, i, reducedVolume, tier3, hasPullUpBar));
    }
    return sessions;
  }

  // Default: AA (safe — early-base equivalent prescription).
  return [createAASession(tier, hasCable, limiter, 1, planWeekLabel, 0, tier3, hasPullUpBar)];
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
  tier3: EquipmentTier3 = 'commercial_gym',
  hasPullUpBar: boolean = tier === 'commercial_gym',
): IntentSession {
  // Spec §8.3 BW+bands tier — early branch keeps the existing AA prescription clean.
  if (tier3 === 'bodyweight_bands') {
    return bwAASession(variantIndex, limiter, weekInPhase, planWeekLabel, hasPullUpBar);
  }
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
  tier3: EquipmentTier3 = 'commercial_gym',
  hasPullUpBar: boolean = tier === 'commercial_gym',
): IntentSession {
  // Spec §8.3: BW+bands tier replaces heavy compounds with harder BW progressions
  // (split squat / pistol prep) — no external load.
  if (tier3 === 'bodyweight_bands') {
    return bwMSSession(variantIndex, limiter, planWeekLabel, hasPullUpBar);
  }
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
  tier3: EquipmentTier3 = 'commercial_gym',
  hasPullUpBar: boolean = tier === 'commercial_gym',
): IntentSession {
  // Spec §8.3: BW+bands tier — same SM intent (8-12 reps moderate stimulus) via BW progressions.
  if (tier3 === 'bodyweight_bands') {
    return bwSMSession(variantIndex, limiter, planWeekLabel, reducedVolume, hasPullUpBar);
  }
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
  tier3: EquipmentTier3 = 'commercial_gym',
  hasPullUpBar: boolean = tier === 'commercial_gym',
): IntentSession {
  // Existing taper is already mostly bodyweight — only the squat line picks DB/KB or BW. The
  // BW+bands tier uses pure BW (no KB option) for the squat compound.
  const exercises: StrengthExercise[] = [];
  if (tier3 === 'commercial_gym' || tier3 === 'dumbbell_based') {
    exercises.push({
      name: 'Goblet Squat or Bodyweight Squat',
      sets: 2, reps: '8-10',
      weight: 'Light KB/DB or bodyweight',
      target_rir: 5,
      notes: 'Movement quality only — no fatigue',
    });
  } else {
    // Spec §8.3 BW+bands tier: pure BW with controlled tempo.
    exercises.push({
      name: 'Bodyweight Squat (3-2-X tempo)',
      sets: 2, reps: 10,
      weight: 'Bodyweight — 3-sec descent, 2-sec pause, normal up',
      target_rir: 5,
      notes: 'Movement quality only — no fatigue',
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
  tier3: EquipmentTier3 = 'commercial_gym',
  hasPullUpBar: boolean = tier === 'commercial_gym',
): IntentSession {
  const useDb = tier3 === 'commercial_gym' || tier3 === 'dumbbell_based';
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
        name: useDb ? 'Goblet Squat' : 'Bodyweight Squat',
        sets: 2, reps: 12,
        weight: useDb ? 'Light KB or DB' : 'Bodyweight — slow tempo',
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

// ── Bodyweight + bands tier (spec §8.3) ────────────────────────────────────-
//
// No external load — overload via reps, tempo, single-leg variations, and
// progressively harder bodyweight variants (incline → flat → decline push-ups;
// split squat → pistol prep; band pull-down → band-assisted pull-up). Pull-ups
// are conditional on `hasPullUpBar`; otherwise band pull-down. Progression
// across phases comes from rep count + tempo + variant difficulty, not load.

function bwAASession(
  variantIndex: number,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  hasPullUpBar: boolean,
): IntentSession {
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';
  const ex: StrengthExercise[] = [];

  if (variant === 'A') {
    ex.push({
      name: 'Bodyweight Squat (3-sec descent)',
      sets: 3, reps: '20-25',
      weight: 'Bodyweight — 3-second eccentric, 1-second pause at the bottom',
      target_rir: 4,
      notes: 'Tempo loads connective tissue without external weight',
    });
    ex.push({
      name: 'Push-ups (Incline → Flat progression)',
      sets: 3, reps: '15-20',
      weight: 'Bodyweight — start incline if shoulders feel taxed; progress to flat as control allows',
      target_rir: 3,
    });
    ex.push({
      name: 'Inverted Ring Row or Band Row (Chest-Supported)',
      sets: 3, reps: '15-20',
      weight: 'Bodyweight on rings or heavy band; adjust foot position for difficulty',
      target_rir: 3,
    });
  } else {
    ex.push({
      name: 'Single-Leg RDL (Bodyweight)',
      sets: 2, reps: '12-15/leg',
      weight: 'Bodyweight — 3-second descent, slow rotation',
      target_rir: 4,
      notes: 'Posterior chain + hip stability; touch finger-tips to floor each rep',
    });
    ex.push({
      name: 'Band Overhead Press',
      sets: 3, reps: '15-20',
      weight: 'Medium band — anchor underfoot, press to lockout',
      target_rir: 4,
    });
    ex.push({
      name: hasPullUpBar ? 'Band-Assisted Pull-up' : 'Band Pull-Down',
      sets: 3, reps: hasPullUpBar ? '8-12' : '15-20',
      weight: hasPullUpBar ? 'Heavy band loop for assist' : 'Heavy band — anchor overhead',
      target_rir: 4,
      notes: 'Lat strength for swim pull',
    });
  }

  // Stability + mobility accessories (spec §4.4) — same patterns as the loaded tiers.
  if (variant === 'A') {
    ex.push({ name: 'Plank Hold', sets: 2, reps: '30-45s', weight: 'Bodyweight' });
    ex.push({ name: 'Glute Bridges', sets: 2, reps: '15-20', weight: 'Bodyweight' });
  } else {
    ex.push({ name: 'Side Plank', sets: 2, reps: '30s/side', weight: 'Bodyweight' });
    ex.push({ name: 'Bird Dog', sets: 2, reps: '10/side', weight: 'Bodyweight — slow' });
  }
  if (limiter === 'run') {
    ex.push({
      name: 'Calf Raises (Bilateral)',
      sets: 2, reps: '15-20',
      weight: 'Bodyweight — 3s eccentric',
      notes: 'Achilles + plantar fascia resilience for run volume',
    });
  } else {
    ex.push({
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
    name: `Tri Durability — AA ${variantLabel} (BW)`,
    description:
      `Base Week ${planWeekLabel} (AA phase, BW+bands tier) — Full-body tissue work via ` +
      `bodyweight + bands. High reps (15-25), 3-sec descents on the squat. Progress by adding ` +
      `reps or harder variants (incline→flat push-ups, ring row foot height). RIR 3-4.`,
    duration: 40,
    exercises: ex,
    repProfile: 'hypertrophy',
    tags: ['strength', 'full_body', 'triathlon', 'phase:base', 'phase:aa', 'tier:bodyweight_bands', `limiter:${limiter}`],
  };
}

function bwMSSession(
  variantIndex: number,
  limiter: LimiterSport,
  planWeekLabel: number,
  hasPullUpBar: boolean,
): IntentSession {
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';
  const ex: StrengthExercise[] = [];

  // MS load substitutes for BW+bands: harder variants + slower tempo replace heavy DBs / barbell.
  if (variant === 'A') {
    ex.push({
      name: 'Bulgarian Split Squat (Pistol Prep)',
      sets: 3, reps: '6-8/leg',
      weight: 'Bodyweight — slow descent, drive through front heel',
      target_rir: 2,
      notes: 'Single-leg progression toward pistol — stretches the squat-strength curve',
    });
  } else {
    ex.push({
      name: 'Single-Leg RDL (Bodyweight, Slow)',
      sets: 3, reps: '8-10/leg',
      weight: 'Bodyweight — 3-sec descent, brief touch at bottom',
      target_rir: 2,
      notes: 'Posterior chain MS substitute — overload via tempo + control',
    });
  }

  if (variant === 'A') {
    ex.push({
      name: 'Push-ups (Decline / Hands-Together / Single-arm Eccentric)',
      sets: 3, reps: '6-10',
      weight: 'Bodyweight — pick a variant where 6-10 reps are challenging',
      target_rir: 2,
    });
  } else {
    ex.push({
      name: 'Pike Push-ups',
      sets: 3, reps: '8-10',
      weight: 'Bodyweight — feet elevated when ready',
      target_rir: 2,
    });
  }

  if (hasPullUpBar) {
    ex.push({
      name: 'Pull-ups',
      sets: 3, reps: '4-8',
      weight: 'Bodyweight (band-assist if needed)',
      target_rir: 2,
    });
  } else {
    ex.push({
      name: 'Band Pull-Down (Heavy)',
      sets: 3, reps: '10-12',
      weight: 'Heaviest band — full ROM',
      target_rir: 2,
    });
  }

  ex.push({ name: 'Dead Bug', sets: 2, reps: '8/side', weight: 'Bodyweight' });
  if (limiter === 'run') {
    ex.push({
      name: 'Single-Leg Calf Raises',
      sets: 2, reps: 12,
      weight: 'Bodyweight — 3s eccentric',
    });
  }

  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'required',
    name: `Tri Durability — MS ${variant} (BW)`,
    description:
      `Late Base Week ${planWeekLabel} (MS phase, BW+bands tier) — Same full-body intent as the ` +
      `loaded MS prescription, but overload comes from harder variants (split squat, pike push-up, ` +
      `pull-up or heavy-band pull-down) and slow tempos. RIR 2.`,
    duration: 45,
    exercises: ex,
    repProfile: 'strength',
    tags: ['strength', 'full_body', 'triathlon', 'phase:base', 'phase:ms', 'tier:bodyweight_bands', `limiter:${limiter}`],
  };
}

function bwSMSession(
  variantIndex: number,
  limiter: LimiterSport,
  planWeekLabel: number,
  reducedVolume: boolean,
  hasPullUpBar: boolean,
): IntentSession {
  const variant: 'A' | 'B' = variantIndex % 2 === 0 ? 'A' : 'B';
  const ex: StrengthExercise[] = [];

  ex.push({
    name: variant === 'A' ? 'Bodyweight Squat (Tempo)' : 'Single-Leg RDL (Bodyweight)',
    sets: 2,
    reps: variant === 'A' ? 15 : '10/leg',
    weight: variant === 'A' ? 'Bodyweight — 2-sec descent' : 'Bodyweight — controlled tempo',
    target_rir: 3,
  });

  ex.push({
    name: variant === 'A' ? 'Push-ups' : 'Band Overhead Press',
    sets: 2, reps: variant === 'A' ? '12-15' : 12,
    weight: variant === 'A' ? 'Bodyweight' : 'Medium band',
    target_rir: 3,
  });

  ex.push({
    name: hasPullUpBar ? 'Pull-ups (Band-Assisted)' : 'Band Pull-Down',
    sets: 2, reps: hasPullUpBar ? '6-8' : 12,
    weight: hasPullUpBar ? 'Heavy band assist' : 'Medium band',
    target_rir: 3,
  });

  if (!reducedVolume) {
    ex.push({ name: 'Plank Hold', sets: 2, reps: '30-45s', weight: 'Bodyweight' });
    if (limiter === 'run') {
      ex.push({
        name: 'Calf Raises (Bilateral)',
        sets: 2, reps: 15,
        weight: 'Bodyweight',
      });
    }
  } else {
    ex.push({ name: 'Plank Hold', sets: 1, reps: '30s', weight: 'Bodyweight' });
  }

  const phaseLabel = reducedVolume ? 'Race-Specific' : 'Build';
  return {
    intent: 'FULLBODY_MAINTENANCE',
    priority: 'preferred',
    name: `Tri Durability — SM ${variant}${reducedVolume ? ' (Reduced)' : ''} (BW)`,
    description:
      `${phaseLabel} Week ${planWeekLabel} (SM phase, BW+bands tier) — Maintain BW strength ` +
      `built in MS at moderate volume. Movement quality, not max effort. ` +
      `${reducedVolume ? 'Race-specific volume reduced — minimize fatigue ahead of the race.' : ''}`.trim(),
    duration: reducedVolume ? 25 : 30,
    exercises: ex,
    repProfile: 'maintenance',
    tags: [
      'strength', 'full_body', 'triathlon',
      reducedVolume ? 'phase:race_specific' : 'phase:build',
      'phase:sm', 'tier:bodyweight_bands', `limiter:${limiter}`,
    ],
  };
}
