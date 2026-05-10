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
import {
  dbPrescription,
  DB_MAX_LOAD_CAP_TAG,
  DB_MAX_LOAD_CAP_TRADEOFF,
} from './db-prescription.ts';

type LimiterSport = 'swim' | 'bike' | 'run';
type EquipmentTier = 'commercial_gym' | 'home_gym';
type EquipmentTier3 = 'commercial_gym' | 'dumbbell_based' | 'bodyweight_bands';

/** Bundled DB-tier inputs threaded into phase functions (spec §8.2). */
type DbCtx = {
  squat1RM?: number;
  deadlift1RM?: number;
  bench1RM?: number;
  overhead1RM?: number;
  /** Per-hand DB max in pounds. Default 50 when caller omits. */
  dbMaxLb: number;
  /** True when athlete has a pull-up / chin-up bar — gates Pull-ups vs band pull-down. */
  hasPullUpBar: boolean;
};

/**
 * After phase-function exercises are built, surface the spec §8.2 trade-off if any DB-tier
 * prescription was capped by the athlete's DB max. Mutates description + tags so the athlete
 * sees one note per session, not per exercise.
 */
function applyDbCapTradeoff(session: IntentSession, capped: boolean): IntentSession {
  if (!capped) return session;
  return {
    ...session,
    description: `${DB_MAX_LOAD_CAP_TRADEOFF} ${session.description}`,
    tags: [...session.tags, DB_MAX_LOAD_CAP_TAG],
  };
}

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
  // Three-tier classification (spec §8). Performance protocol is gated out for bodyweight_bands
  // upstream — when it lands here unexpectedly, fall through to dumbbell_based path.
  const tier3: EquipmentTier3 =
    context.userBaselines.equipmentTier ??
    (context.userBaselines.equipment === 'commercial_gym' ? 'commercial_gym' : 'dumbbell_based');
  const tier: EquipmentTier = tier3 === 'commercial_gym' ? 'commercial_gym' : 'home_gym';
  // hasCable / hasGHD / hasKettlebell / hasPullUpBar are explicit when threaded from Arc equipment
  // list; fall back to safe defaults.
  const hasCable: boolean = context.userBaselines.hasCable ?? (tier === 'commercial_gym');
  const hasGHD: boolean = context.userBaselines.hasGHD ?? false;
  const hasKettlebell: boolean = context.userBaselines.hasKettlebell ?? false;
  const hasPullUpBar: boolean = context.userBaselines.hasPullUpBar ?? (tier === 'commercial_gym');
  const limiter: LimiterSport = (context.triathlonContext?.limiterSport ?? 'run') as LimiterSport;
  const freq = strengthFrequency ?? 2;
  const phaseName = String(phase?.name ?? '').toLowerCase();

  // Spec §8.2 DB context — used only when tier3 === 'dumbbell_based'. Default dbMaxLb=50 when
  // wizard didn't supply.
  const dbCtx: DbCtx = {
    squat1RM: context.userBaselines.squat1RM,
    deadlift1RM: context.userBaselines.deadlift1RM,
    bench1RM: context.userBaselines.bench1RM,
    overhead1RM: context.userBaselines.overhead1RM,
    dbMaxLb: context.userBaselines.dbMaxLb ?? 50,
    hasPullUpBar,
  };

  if (isRecovery) {
    return [createPerfRecoverySession(tier, hasCable)];
  }

  if (phaseName === 'taper') {
    return [perfTaperSession(tier, hasCable, tier3, dbCtx)];
  }

  if (phaseName === 'recovery') {
    return [];
  }

  if (phaseName === 'base') {
    return freq >= 2
      ? [
        perfBaseLower(tier, limiter, weekInPhase, planWeekLabel, hasGHD, tier3, dbCtx),
        perfBaseUpper(tier, hasCable, limiter, weekInPhase, planWeekLabel, tier3, dbCtx),
      ]
      : [perfBaseLower(tier, limiter, weekInPhase, planWeekLabel, hasGHD, tier3, dbCtx)];
  }

  if (phaseName === 'build') {
    return freq >= 2
      ? [
        perfBuildLower(tier, limiter, weekInPhase, planWeekLabel, tier3, dbCtx),
        perfBuildUpper(tier, hasCable, limiter, weekInPhase, planWeekLabel, tier3, dbCtx),
      ]
      : [perfBuildLower(tier, limiter, weekInPhase, planWeekLabel, tier3, dbCtx)];
  }

  if (phaseName === 'race prep' || phaseName === 'race-specific' || phaseName === 'speed') {
    return freq >= 2
      ? [
        perfRaceLower(tier, limiter, weekInPhase, planWeekLabel, hasKettlebell, tier3, dbCtx),
        perfRaceUpper(tier, hasCable, limiter, tier3, dbCtx),
      ]
      : [perfRaceLower(tier, limiter, weekInPhase, planWeekLabel, hasKettlebell, tier3, dbCtx)];
  }

  return [perfBaseLower(tier, limiter, weekInPhase, planWeekLabel, false, tier3, dbCtx)];
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

function perfBaseLower(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  hasGHD?: boolean,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const wip = Math.max(1, weekInPhase);
  // Spec §3.1: Hypertrophy = 3-4 sets/lift. Mid/late weeks step up to 4 to drive volume progression.
  const sets = wip <= 2 ? 3 : 4;
  const rir = 3;
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
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
    // Spec §8.2 DB tier: DB Romanian Deadlift + Goblet Squat at hypertrophy load (65% × 0.7).
    const dl = dbPrescription({ pctOfBarbell1RM: 0.65, oneRMLb: dbCtx.deadlift1RM, baseReps: '8-10', dbMaxLb: dbCtx.dbMaxLb });
    if (dl.capped) cappedAny = true;
    ex.push({
      name: 'DB Romanian Deadlift',
      sets,
      reps: dl.reps,
      weight: dl.weight,
      target_rir: rir,
      notes: 'Hip hinge — bike + run power base',
    });
    const sq = dbPrescription({ pctOfBarbell1RM: 0.65, oneRMLb: dbCtx.squat1RM, baseReps: '8-10', dbMaxLb: dbCtx.dbMaxLb });
    if (sq.capped) cappedAny = true;
    ex.push({
      name: 'Goblet Squat',
      sets,
      reps: sq.reps,
      weight: sq.weight,
      target_rir: rir,
      notes: 'Knee drive — single DB held at chest',
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

  return applyDbCapTradeoff(
    {
      intent: 'LOWER_DURABILITY',
      priority: 'required',
      name: 'Tri Performance — Base Hypertrophy (Lower)',
      description: `Base Week ${planWeekLabel} — Two primary lower compounds (≈65% 1RM, RIR ${rir}) plus ${hasGHD ? 'Nordic curls 2×5' : 'single-leg RDL 2×8/leg'} for hamstring resilience; accessories stay light.`,
      duration: tier === 'commercial_gym' ? 50 : 48,
      exercises: ex,
      repProfile: 'hypertrophy',
      tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:base', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

function perfBaseUpper(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const wip = Math.max(1, weekInPhase);
  // Spec §3.1: Hypertrophy = 3-4 sets/lift. Mid/late weeks step to 4.
  const sets = wip <= 2 ? 3 : 4;
  const rir = 3;
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
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
    // Spec §8.2 DB tier: DB Row (chest-supported) + DB Bench Press at 65% × 0.7 hypertrophy load.
    const row = dbPrescription({ pctOfBarbell1RM: 0.65, oneRMLb: dbCtx.bench1RM, baseReps: '8-10', dbMaxLb: dbCtx.dbMaxLb });
    if (row.capped) cappedAny = true;
    ex.push({
      name: 'DB Row (Chest-Supported)',
      sets,
      reps: row.reps,
      weight: row.weight,
      target_rir: rir,
      notes: 'Swim pull + thoracic extension for aero',
    });
    const bench = dbPrescription({ pctOfBarbell1RM: 0.65, oneRMLb: dbCtx.bench1RM, baseReps: '8-10', dbMaxLb: dbCtx.dbMaxLb });
    if (bench.capped) cappedAny = true;
    ex.push({
      name: 'DB Bench Press',
      sets,
      reps: bench.reps,
      weight: bench.weight,
      target_rir: rir,
    });
    // Pull-ups conditional on bar; otherwise band pull-down (spec §8.2).
    if (dbCtx.hasPullUpBar) {
      ex.push({
        name: 'Pull-ups',
        sets,
        reps: limiter === 'swim' ? 6 : 8,
        weight: 'Bodyweight (add a band for assist if needed)',
        target_rir: rir,
        notes: 'Lat strength for swim pull',
      });
    } else {
      ex.push({
        name: 'Band Pull-Down',
        sets,
        reps: 12,
        weight: 'Heavy band — anchor overhead',
        target_rir: rir,
        notes: 'Pull-up substitute when no bar — drive elbows to ribs',
      });
    }
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

  return applyDbCapTradeoff(
    {
      intent: 'UPPER_POSTURE',
      priority: 'required',
      name: 'Tri Performance — Base Hypertrophy (Upper)',
      description: `Base Week ${planWeekLabel} — Upper hypertrophy for swim pull, posture, and shoulder health (RIR ${rir}).`,
      duration: 45,
      exercises: ex,
      repProfile: 'hypertrophy',
      tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:base', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

// ── Build: strength (≈78–82% 1RM) ──────────────────────────────────────────

function perfBuildLower(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const wip = Math.max(1, weekInPhase);
  // Spec §3.1: Strength Build = 3-4 sets/lift. Step to 4 mid/late phase.
  const mainSets = wip <= 2 ? 3 : 4;
  const rir = 2;
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
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
    // Spec §8.2 DB tier: DB Romanian Deadlift + Goblet Squat at strength-build load (~80% × 0.7).
    const dl = dbPrescription({ pctOfBarbell1RM: 0.80, oneRMLb: dbCtx.deadlift1RM, baseReps: '4-6', dbMaxLb: dbCtx.dbMaxLb });
    if (dl.capped) cappedAny = true;
    ex.push({
      name: 'DB Romanian Deadlift',
      sets: mainSets,
      reps: dl.reps,
      weight: dl.weight,
      target_rir: rir,
    });
    const sq = dbPrescription({ pctOfBarbell1RM: 0.78, oneRMLb: dbCtx.squat1RM, baseReps: 6, dbMaxLb: dbCtx.dbMaxLb });
    if (sq.capped) cappedAny = true;
    ex.push({
      name: 'Goblet Squat',
      sets: mainSets,
      reps: sq.reps,
      weight: sq.weight,
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

  return applyDbCapTradeoff(
    {
      intent: 'LOWER_DURABILITY',
      priority: 'required',
      name: 'Tri Performance — Strength Build (Lower)',
      description: `Build Week ${planWeekLabel} — Two heavy compounds only (3 working sets each, ~78–80% 1RM), RIR ${rir}. Hamstring Nordics live in base; build stays squat + hinge volume-capped.`,
      duration: 48,
      exercises: ex,
      repProfile: 'strength',
      tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:build', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

function perfBuildUpper(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const wip = Math.max(1, weekInPhase);
  const sets = 4;
  const rir = 2;
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
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
    // Spec §8.2 DB tier: DB Row + DB Bench Press + DB Shoulder Press at strength-build load.
    const row = dbPrescription({ pctOfBarbell1RM: 0.80, oneRMLb: dbCtx.bench1RM, baseReps: '4-6', dbMaxLb: dbCtx.dbMaxLb });
    if (row.capped) cappedAny = true;
    ex.push({
      name: 'DB Row (Chest-Supported)',
      sets,
      reps: row.reps,
      weight: row.weight,
      target_rir: rir,
      notes: 'Heavy DBs — squeeze scaps fully at the top',
    });
    if (dbCtx.hasPullUpBar) {
      ex.push({
        name: 'Pull-ups',
        sets: 3,
        reps: '4-6',
        weight: 'Bodyweight + small load when ready — or band-assisted',
        target_rir: rir,
        notes: 'Lat strength for swim',
      });
    } else {
      ex.push({
        name: 'Band Pull-Down',
        sets: 3,
        reps: 10,
        weight: 'Heavy band',
        target_rir: rir,
        notes: 'Pull-up substitute when no bar',
      });
    }
    const ohp = dbPrescription({ pctOfBarbell1RM: 0.72, oneRMLb: dbCtx.overhead1RM, baseReps: '5-6', dbMaxLb: dbCtx.dbMaxLb });
    if (ohp.capped) cappedAny = true;
    ex.push({
      name: 'DB Shoulder Press',
      sets: 3,
      reps: ohp.reps,
      weight: ohp.weight,
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

  return applyDbCapTradeoff(
    {
      intent: 'UPPER_POSTURE',
      priority: 'required',
      name: 'Tri Performance — Strength Build (Upper)',
      description: `Build Week ${planWeekLabel} — Heavy pull + press (RIR ${rir}).`,
      duration: 45,
      exercises: ex,
      repProfile: 'strength',
      tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:build', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

// ── Race-specific: power / neural ───────────────────────────────────────────

function perfRaceLower(
  tier: EquipmentTier,
  limiter: LimiterSport,
  weekInPhase: number,
  planWeekLabel: number,
  hasKettlebell?: boolean,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const wip = Math.max(1, weekInPhase);
  // Spec §3.1: Maintenance + Power = RIR 2 (not RIR 1). Express strength as power, not max load.
  const rir = 2;
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  // Spec §3.5 power-exercise rotation. Always paired with main compounds, always done first when
  // fresh. Spec §8.2: DB tier swaps Push Press → DB Push Press; KB Swings still gated on chip.
  // Olympic lifts are explicitly excluded by spec (technical debt outweighs benefits for triathletes).
  const powerExercise: StrengthExercise = (() => {
    const rotation: Array<'push_press' | 'box_jumps' | 'broad_jumps' | 'kb_swings'> =
      tier3 === 'commercial_gym'
        ? hasKettlebell
          ? ['push_press', 'box_jumps', 'broad_jumps', 'kb_swings']
          : ['push_press', 'box_jumps', 'broad_jumps']
        : hasKettlebell
          ? ['push_press', 'box_jumps', 'broad_jumps', 'kb_swings']
          : ['push_press', 'box_jumps', 'broad_jumps'];
    const pick = rotation[(wip - 1) % rotation.length];
    switch (pick) {
      case 'push_press':
        if (tier3 === 'commercial_gym') {
          return {
            name: 'Push Press',
            sets: 3,
            reps: '3-5',
            weight: '70% 1RM (OHP) — explosive concentric, controlled descent',
            target_rir: rir,
            notes: 'First exercise when fresh — drive from legs, not shoulders',
          };
        } else {
          // Spec §8.2: DB Push Press substitution.
          const pp = dbPrescription({
            pctOfBarbell1RM: 0.70,
            oneRMLb: dbCtx.overhead1RM,
            baseReps: '3-5',
            dbMaxLb: dbCtx.dbMaxLb,
          });
          if (pp.capped) cappedAny = true;
          return {
            name: 'DB Push Press',
            sets: 3,
            reps: pp.reps,
            weight: pp.weight,
            target_rir: rir,
            notes: 'First exercise when fresh — drive from legs, both DBs at shoulder',
          };
        }
      case 'broad_jumps':
        return {
          name: 'Broad Jumps',
          sets: 3,
          reps: 4,
          weight: 'Bodyweight — max horizontal distance, stick the landing',
          target_rir: 2,
          notes: 'Full reset between reps — quality over volume',
        };
      case 'kb_swings':
        return {
          name: 'KB Swings (Russian)',
          sets: 3,
          reps: 10,
          weight: 'Heavy KB — explosive hip drive',
          target_rir: rir,
          notes: 'Russian (chest height); not American — hip extension is the lift',
        };
      case 'box_jumps':
      default:
        return {
          name: 'Box Jumps',
          sets: 3,
          reps: 4,
          weight: 'Bodyweight — max intent, soft land',
          target_rir: 2,
        };
    }
  })();
  ex.push(powerExercise);

  // Primary compound — Trap Bar Deadlift (commercial_gym) or DB RDL / Jump Squats (DB tier).
  if (tier3 === 'commercial_gym') {
    ex.push({
      name: 'Trap Bar Deadlift',
      sets: 3,
      reps: '4-5',
      weight: '72% 1RM — fast intent, controlled descent',
      target_rir: rir,
      notes: 'Reset each rep — express strength as power, not max load',
    });
  } else {
    // Spec §8.2 DB tier: DB RDL replaces deadlift; Jump Squats keep BW plyo character.
    const dl = dbPrescription({
      pctOfBarbell1RM: 0.72,
      oneRMLb: dbCtx.deadlift1RM,
      baseReps: '4-5',
      dbMaxLb: dbCtx.dbMaxLb,
    });
    if (dl.capped) cappedAny = true;
    ex.push({
      name: 'DB Romanian Deadlift',
      sets: 3,
      reps: dl.reps,
      weight: dl.weight,
      target_rir: rir,
      notes: 'Reset each rep — fast intent on the lift, controlled descent',
    });
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
    weight: tier3 === 'commercial_gym' ? 'Moderate barbell — explosive intent' : 'Two heavy DBs across hips',
    target_rir: rir,
    notes: 'Explosive hip extension',
  });

  ex.push({
    name: 'Explosive Step-ups',
    sets: 3,
    reps: '4/leg',
    weight: tier3 === 'commercial_gym' ? 'Light DBs' : 'Bodyweight or light DBs',
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

  return applyDbCapTradeoff(
    {
      intent: 'LOWER_DURABILITY',
      priority: 'required',
      name: 'Tri Performance — Maintenance + Power (Lower)',
      description: `Race-prep Week ${planWeekLabel} — Power-focused: 3-5 reps lift @ 70-75% 1RM, RIR 2, paired with plyo. Express strength as power; minimal fatigue.`,
      duration: 50,
      exercises: ex,
      repProfile: 'strength',
      tags: ['strength', 'lower_body', 'triathlon_performance', 'phase:race', 'explosive', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

function perfRaceUpper(
  tier: EquipmentTier,
  hasCable: boolean,
  limiter: LimiterSport,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
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
    // Spec §8.2 DB tier: DB Row + Pull-ups (or Band Pull-Down if no bar) at maintenance load.
    const row = dbPrescription({ pctOfBarbell1RM: 0.75, oneRMLb: dbCtx.bench1RM, baseReps: 5, dbMaxLb: dbCtx.dbMaxLb });
    if (row.capped) cappedAny = true;
    ex.push({
      name: 'DB Row (Chest-Supported)',
      sets: 3,
      reps: row.reps,
      weight: row.weight,
      target_rir: 2,
      notes: 'Crisp rows — fast concentric, controlled return',
    });
    if (dbCtx.hasPullUpBar) {
      ex.push({
        name: 'Pull-ups (Explosive)',
        sets: 3,
        reps: 4,
        weight: 'Bodyweight',
        target_rir: 2,
      });
    } else {
      ex.push({
        name: 'Band Pull-Down (Explosive)',
        sets: 3,
        reps: 8,
        weight: 'Heavy band — fast pull, controlled return',
        target_rir: 2,
      });
    }
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

  return applyDbCapTradeoff(
    {
      intent: 'UPPER_POSTURE',
      priority: 'required',
      name: 'Tri Performance — Maintenance + Power (Upper)',
      description:
        'Race-prep upper — maintain pulling strength and shoulder health; lower overall volume than build phase.',
      duration: 35,
      exercises: ex,
      repProfile: 'maintenance',
      tags: ['strength', 'upper_body', 'triathlon_performance', 'phase:race', `limiter:${limiter}`],
    },
    cappedAny,
  );
}

// ── Taper: neural priming — light, fast, minimal soreness ───────────────────

function perfTaperSession(
  tier: EquipmentTier,
  hasCable: boolean,
  tier3: EquipmentTier3 = 'commercial_gym',
  dbCtx: DbCtx = { dbMaxLb: 50, hasPullUpBar: false },
): IntentSession {
  // Spec §3.1 Taper Priming: 3-4 reps fast bar speed @ 50-60% 1RM, RIR 3+, 2 sets, 1× (skip-optional).
  const ex: StrengthExercise[] = [];
  let cappedAny = false;

  if (tier3 === 'commercial_gym') {
    ex.push({
      name: 'Conventional Deadlift',
      sets: 2,
      reps: '3-4',
      weight: '55% 1RM — fast bar speed, full reset between reps',
      target_rir: 4,
      notes: 'Velocity intent — not fatigue',
    });
    ex.push({
      name: 'Hip Thrusts',
      sets: 2,
      reps: '3-4',
      weight: '55% 1RM — explosive concentric',
      target_rir: 4,
    });
  } else {
    // Spec §8.2 DB tier: DB RDL at 55% × 0.7 with rep scaling on cap.
    const dl = dbPrescription({ pctOfBarbell1RM: 0.55, oneRMLb: dbCtx.deadlift1RM, baseReps: '3-4', dbMaxLb: dbCtx.dbMaxLb });
    if (dl.capped) cappedAny = true;
    ex.push({
      name: 'DB Romanian Deadlift',
      sets: 2,
      reps: dl.reps,
      weight: dl.weight,
      target_rir: 4,
      notes: 'Velocity intent — not fatigue',
    });
    ex.push({
      name: 'Hip Thrusts',
      sets: 2,
      reps: '3-4',
      weight: 'Two heavy DBs across hips — explosive concentric',
      target_rir: 4,
    });
  }

  ex.push({
    name: 'Band Pull-Aparts',
    sets: 2,
    reps: 15,
    weight: 'Light band — activation only',
  });
  ex.push({
    name: 'Face Pulls',
    sets: 2,
    reps: 15,
    weight: hasCable ? 'Very light cable' : 'Band',
  });

  return applyDbCapTradeoff(
    {
      intent: 'LOWER_MAINTENANCE',
      priority: 'optional',
      name: 'Tri Performance — Taper Priming',
      description:
        'Race week — Wednesday only, ~25 min. 1 lower compound + 1 upper compound at 50-60% 1RM ' +
        'for 2×3-4 fast reps, plus 2 light-band activation accessories. No plyometrics. Skip-optional ' +
        'if you feel sharp. Goal is neural drive, not fatigue.',
      duration: 25,
      exercises: ex,
      repProfile: 'strength',
      tags: ['strength', 'triathlon_performance', 'phase:taper', 'neural_priming'],
    },
    cappedAny,
  );
}
