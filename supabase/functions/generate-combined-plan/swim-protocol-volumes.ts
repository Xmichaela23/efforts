/**
 * Swim protocol v2.1 volume bands + hybrid yard resolution (floors, ceilings, swim budget).
 * Tables from SWIM-IMPLEMENTATION-FINAL (v3) / SWIM-PROTOCOL-FINAL (v3).
 */

import type { Phase } from './types.ts';
import type { SwimDistanceKey, SwimSessionType, SwimSlotTemplate } from '../_shared/swim-program-templates.ts';
import {
  enduranceOverdistanceWindowActive,
  type SwimTrainingFitness,
} from './swim-protocol-v21.ts';

export type SwimProtocolPhaseBandKey = 'base' | 'build' | 'race_specific' | 'taper';

/** Persisted on plan_contract_v1 for coach / compliance surfacing. */
export const SWIM_PROTOCOL_CONTRACT_META = {
  version: 'v2.1',
  max_sessions_per_week: { sprint: 3, olympic: 3, '70.3': 3, full: 3 },
  note:
    'Full IM protocol allows 4 weekly swims for advanced athletes; Efforts caps at 3 pending product demand.',
} as const;

/** (race_distance, athlete_level, phase) → session yard band — protocol § Volume Range Lookup. */
export const SWIM_VOLUME_RANGES: Record<
  SwimDistanceKey,
  Record<SwimTrainingFitness, Record<SwimProtocolPhaseBandKey, { min: number; max: number }>>
> = {
  sprint: {
    beginner: {
      base: { min: 1000, max: 1500 },
      build: { min: 1200, max: 1800 },
      race_specific: { min: 1300, max: 2000 },
      taper: { min: 800, max: 1200 },
    },
    intermediate: {
      base: { min: 1400, max: 1800 },
      build: { min: 1500, max: 2000 },
      race_specific: { min: 1700, max: 2300 },
      taper: { min: 1000, max: 1400 },
    },
    advanced: {
      base: { min: 1600, max: 2000 },
      build: { min: 1800, max: 2400 },
      race_specific: { min: 2000, max: 2600 },
      taper: { min: 1200, max: 1600 },
    },
  },
  olympic: {
    beginner: {
      base: { min: 1500, max: 2200 },
      build: { min: 1800, max: 2600 },
      race_specific: { min: 2000, max: 2800 },
      taper: { min: 1200, max: 1800 },
    },
    intermediate: {
      base: { min: 1800, max: 2600 },
      build: { min: 2000, max: 3000 },
      race_specific: { min: 2300, max: 3200 },
      taper: { min: 1400, max: 2000 },
    },
    advanced: {
      base: { min: 2200, max: 3200 },
      build: { min: 2600, max: 3800 },
      race_specific: { min: 2800, max: 4000 },
      taper: { min: 1600, max: 2200 },
    },
  },
  '70.3': {
    beginner: {
      base: { min: 2000, max: 2600 },
      build: { min: 2000, max: 2800 },
      race_specific: { min: 2200, max: 3000 },
      taper: { min: 1400, max: 2000 },
    },
    intermediate: {
      base: { min: 2000, max: 2800 },
      build: { min: 2200, max: 3200 },
      race_specific: { min: 2400, max: 3400 },
      taper: { min: 1600, max: 2200 },
    },
    advanced: {
      base: { min: 2400, max: 3400 },
      build: { min: 2800, max: 4000 },
      race_specific: { min: 3000, max: 4400 },
      taper: { min: 2000, max: 2800 },
    },
  },
  full: {
    beginner: {
      base: { min: 2400, max: 3200 },
      build: { min: 2800, max: 3800 },
      race_specific: { min: 3000, max: 4000 },
      taper: { min: 2000, max: 2800 },
    },
    intermediate: {
      base: { min: 2800, max: 3800 },
      build: { min: 3200, max: 4400 },
      race_specific: { min: 3400, max: 4800 },
      taper: { min: 2400, max: 3200 },
    },
    advanced: {
      base: { min: 3200, max: 4400 },
      build: { min: 3600, max: 5200 },
      race_specific: { min: 4000, max: 5600 },
      taper: { min: 2800, max: 3800 },
    },
  },
};

export function normalizePhaseToSwimProtocolBand(phase: Phase): SwimProtocolPhaseBandKey {
  if (phase === 'recovery') return 'taper';
  return phase;
}

/** Canonical race swim distance (yd) for easy-session caps / coaching context. */
export function raceCourseSwimYards(distance: SwimDistanceKey): number {
  switch (distance) {
    case 'sprint':
      return 800;
    case 'olympic':
      return 1650;
    case '70.3':
      return 2100;
    case 'full':
      return 4000;
  }
}

export function getProtocolVolumeBand(
  distance: SwimDistanceKey,
  fitness: SwimTrainingFitness,
  phase: Phase,
): { min: number; max: number } | null {
  const pk = normalizePhaseToSwimProtocolBand(phase);
  const row = SWIM_VOLUME_RANGES[distance]?.[fitness]?.[pk];
  return row ?? null;
}

/** Split weekly band minimum across simultaneous swims so floors sum ~one weekly target (not bmin × sessions). */
function swimWeeklyBandShare(slotCount: number, slotIndex: number): number {
  if (slotCount <= 1) return 1;
  if (slotCount === 2) return slotIndex === 0 ? 0.53 : 0.47;
  const tri = [0.36, 0.34, 0.30];
  if (slotIndex >= 0 && slotIndex < tri.length) return tri[slotIndex]!;
  return 1 / slotCount;
}

function snapProtocolYards(y: number, sessionType: SwimSessionType): number {
  const coarse =
    sessionType === 'threshold' ||
    sessionType === 'speed' ||
    sessionType === 'css_aerobic' ||
    sessionType === 'race_specific_aerobic' ||
    sessionType === 'endurance';
  const step = coarse ? 100 : 50;
  return Math.max(step, Math.round(y / step) * step);
}

function fallbackFloor(sessionType: SwimSessionType): number {
  switch (sessionType) {
    case 'threshold':
    case 'speed':
    case 'race_specific_aerobic':
      return 1000;
    case 'css_aerobic':
    case 'endurance':
      return 1200;
    case 'kick_focused':
    case 'pull_focused':
      return 1000;
    case 'technique_aerobic':
      return 900;
    case 'easy':
    default:
      return 800;
  }
}

/** Per-session protocol minimum yards (hybrid v1 — derives from phase band + session role). */
export function getProtocolFloor(
  distance: SwimDistanceKey,
  fitness: SwimTrainingFitness,
  phase: Phase,
  sessionType: SwimSessionType,
  opts?: {
    recoveryFloorScale?: number;
    /** When >1, {@link swimWeeklyBandShare} applies so multi-swim weeks don't double-count weekly minimum. */
    swimSlotCount?: number;
    swimSlotIndex?: number;
  },
): number {
  const scale =
    opts?.recoveryFloorScale != null &&
    opts.recoveryFloorScale > 0 &&
    opts.recoveryFloorScale <= 1
      ? opts.recoveryFloorScale
      : 1;

  const slotCount = opts?.swimSlotCount ?? 1;
  const slotIndex = opts?.swimSlotIndex ?? 0;
  const multiSlot = slotCount > 1;

  const band = getProtocolVolumeBand(distance, fitness, phase);
  let floor: number;
  if (!band) {
    floor = fallbackFloor(sessionType);
  } else {
    const bmin = band.min;
    const share = swimWeeklyBandShare(slotCount, slotIndex);
    const wb = Math.max(300, Math.round(bmin * share));
    switch (sessionType) {
      case 'threshold':
      case 'speed':
      case 'race_specific_aerobic':
        floor = snapProtocolYards(Math.max(multiSlot ? 800 : 1000, wb), sessionType);
        break;
      case 'css_aerobic':
        floor = snapProtocolYards(Math.max(multiSlot ? 800 : 1000, wb), sessionType);
        break;
      case 'endurance':
        floor = snapProtocolYards(Math.max(multiSlot ? 900 : 1200, wb), sessionType);
        break;
      case 'kick_focused':
      case 'pull_focused':
        floor = snapProtocolYards(Math.max(multiSlot ? 850 : 1000, Math.round(wb * 0.92)), sessionType);
        break;
      case 'technique_aerobic':
        floor = snapProtocolYards(Math.max(multiSlot ? 650 : 900, Math.round(wb * 0.88)), sessionType);
        break;
      case 'easy':
      default:
        floor = snapProtocolYards(Math.max(multiSlot ? 600 : 800, Math.round(wb * 0.72)), sessionType);
        break;
    }
  }

  if (scale < 1) {
    const minimumAfterScale: Partial<Record<SwimSessionType, number>> = {
      threshold: 900,
      speed: 900,
      css_aerobic: 900,
      race_specific_aerobic: 900,
      endurance: 900,
      technique_aerobic: 650,
      kick_focused: 700,
      pull_focused: 700,
      easy: 550,
    };
    const amin = minimumAfterScale[sessionType] ?? 700;
    floor = snapProtocolYards(Math.max(amin, Math.round(floor * scale)), sessionType);
  }

  return floor;
}

/** Per-session protocol maximum yards (includes OD endurance ceiling + easy cap vs race distance). */
export function getProtocolCeiling(
  distance: SwimDistanceKey,
  fitness: SwimTrainingFitness,
  phase: Phase,
  sessionType: SwimSessionType,
  opts?: { weekInPhase?: number },
): number {
  const band = getProtocolVolumeBand(distance, fitness, phase);
  const bmax = band?.max ?? 4000;
  const raceYd = raceCourseSwimYards(distance);
  const weekInPhase = opts?.weekInPhase ?? 1;

  switch (sessionType) {
    case 'endurance':
      if (
        enduranceOverdistanceWindowActive({
          raceDistance: distance,
          athleteFitness: fitness,
          phase,
          weekInPhase,
        })
      ) {
        return 4600;
      }
      return snapProtocolYards(bmax, sessionType);
    case 'easy':
      return snapProtocolYards(
        Math.min(Math.round(bmax * 0.88), Math.round(raceYd * 0.5)),
        sessionType,
      );
    case 'technique_aerobic':
      return snapProtocolYards(Math.min(bmax, Math.round(bmax * 0.98)), sessionType);
    case 'kick_focused':
    case 'pull_focused':
    case 'threshold':
    case 'speed':
    case 'css_aerobic':
    case 'race_specific_aerobic':
    default:
      return snapProtocolYards(bmax, sessionType);
  }
}

function swimSlotDropTier(st: SwimSessionType): number {
  switch (st) {
    case 'easy':
      return 0;
    case 'technique_aerobic':
      return 1;
    case 'kick_focused':
    case 'pull_focused':
      return 2;
    case 'css_aerobic':
      return 4;
    case 'race_specific_aerobic':
      return 5;
    case 'endurance':
      return 6;
    case 'speed':
      return 9;
    case 'threshold':
      return 10;
    default:
      return 3;
  }
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

/**
 * Clamp → discretionary scale toward swimBudgetYards → drop lowest-priority slot (never slot 0 threshold).
 */
export function resolveSwimSlotYardsWithBudget(opts: {
  templates: SwimSlotTemplate[];
  preliminaryYards: number[];
  swimBudgetYards: number;
  distance: SwimDistanceKey;
  fitness: SwimTrainingFitness;
  phase: Phase;
  weekInPhase: number;
  /** Post–big-race / structural low weeks — scales protocol floors (default 1). */
  recoveryFloorScale?: number;
}): { templates: SwimSlotTemplate[]; yards: number[]; tradeOffs: string[] } {
  const tradeOffs: string[] = [];
  let templates = [...opts.templates];
  let yards = opts.preliminaryYards.map((y) => Math.round(y));

  const floorOpts =
    opts.recoveryFloorScale != null &&
    opts.recoveryFloorScale > 0 &&
    opts.recoveryFloorScale < 1
      ? { recoveryFloorScale: opts.recoveryFloorScale }
      : undefined;

  const slotFloorOpts = (i: number) => ({
    ...floorOpts,
    swimSlotCount: templates.length,
    swimSlotIndex: i,
  });

  const clampAll = (): void => {
    for (let i = 0; i < yards.length; i++) {
      const t = templates[i]!;
      const floor = getProtocolFloor(opts.distance, opts.fitness, opts.phase, t.session_type, slotFloorOpts(i));
      const ceil = getProtocolCeiling(opts.distance, opts.fitness, opts.phase, t.session_type, {
        weekInPhase: opts.weekInPhase,
      });
      yards[i] = Math.min(ceil, Math.max(floor, yards[i]!));
      yards[i] = snapProtocolYards(yards[i]!, t.session_type);
      yards[i] = Math.min(ceil, Math.max(floor, yards[i]!));
    }
  };

  const floorsFor = (): number[] =>
    templates.map((t, i) =>
      getProtocolFloor(opts.distance, opts.fitness, opts.phase, t.session_type, slotFloorOpts(i)),
    );

  const ceilsFor = (): number[] =>
    templates.map((t) =>
      getProtocolCeiling(opts.distance, opts.fitness, opts.phase, t.session_type, {
        weekInPhase: opts.weekInPhase,
      }),
    );

  const shrinkDiscretionary = (): boolean => {
    const floorArr = floorsFor();
    const ceilArr = ceilsFor();
    const sumF = sum(floorArr);
    if (sum(yards) <= opts.swimBudgetYards) return true;
    if (sumF > opts.swimBudgetYards) return false;

    const disc = yards.map((y, i) => Math.max(0, y - floorArr[i]!));
    const sumD = sum(disc);
    if (sumD <= 1e-6) return false;

    let alpha = Math.min(1, (opts.swimBudgetYards - sumF) / sumD);
    for (let attempt = 0; attempt < 22; attempt++) {
      yards = floorArr.map((f, i) => {
        const raw = f + disc[i]! * alpha;
        const st = templates[i]!.session_type;
        let v = snapProtocolYards(raw, st);
        v = Math.min(ceilArr[i]!, Math.max(floorArr[i]!, v));
        return v;
      });
      if (sum(yards) <= opts.swimBudgetYards) return true;
      alpha *= 0.9;
    }
    return sum(yards) <= opts.swimBudgetYards;
  };

  clampAll();

  let guard = 0;
  while (sum(yards) > opts.swimBudgetYards && guard < 8) {
    guard++;
    if (shrinkDiscretionary()) break;

    if (templates.length <= 1) break;

    let dropIdx = -1;
    let bestTier = 999;
    for (let i = templates.length - 1; i >= 1; i--) {
      const tier = swimSlotDropTier(templates[i]!.session_type);
      if (tier < bestTier) {
        bestTier = tier;
        dropIdx = i;
      }
    }
    if (dropIdx < 0) break;

    const droppedType = templates[dropIdx]!.session_type;
    templates.splice(dropIdx, 1);
    yards.splice(dropIdx, 1);
    tradeOffs.push(
      `Swim "${droppedType}" dropped — weekly swim yard budget could not satisfy protocol floors after discretionary scaling (lower-priority slot removed).`,
    );
    clampAll();
  }

  return { templates, yards, tradeOffs };
}
