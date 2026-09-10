/**
 * THE INTAKE READOUT — what the plan builder and the season wizard print about the athlete's own
 * numbers before a plan exists, worked out with the functions the build itself uses. get-arc-context
 * returns it as `arc.builder`; the phone prints it and computes none of it (2026-09-10, audit item 20).
 *
 *   has_pace_benchmark        `_shared/pace-benchmark.ts` — the create-goal speed gate's own rule.
 *   hard_days_priceable       run: a threshold pace from `resolveCurrentRunThresholdPace`, the pace
 *                             materialize-plan writes hard runs from (a 5K alone no longer makes one);
 *                             bike: an FTP from `resolveCurrentFtp`.
 *   equipment_tier            `resolveStrengthEquipmentTier3` — chips plus compound 1RMs, as create-goal
 *                             stamps `equipment_tier` on the goal.
 *   performance_downgraded    `gateStrengthIntentByTier('performance', tier).downgraded`.
 *   lifts                     `resolveStrengthCapacity` per lift: locked, then trusted learned, then typed.
 *   barbell_lifts_on_file     how many of squat, bench, deadlift and OHP have a number: all, some, none.
 *   strength_default          'use' when at least one of those four has a number, else 'test' — the
 *                             "Know your numbers?" default (one lift on file offers Use current, 2026-09-04).
 *   session_frequency_by_tier only when the request asks: sessions a week for each hours option, through
 *                             `computeSessionFrequencyDefaults` with the inputs the combined plan's
 *                             reconciler hands it (`resolveSessionFrequencyDefaults`).
 */
import { resolveCurrentFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { resolveCurrentRunThresholdPace } from '../../../src/lib/resolve-current-run-pace.ts';
import {
  computeSessionFrequencyDefaults,
  type SessionFrequencyInputs,
} from '../../../src/lib/session-frequency-defaults.ts';
import { resolveStrengthCapacity, type CanonicalLiftKey } from '../_shared/state-trend/capacity-resolver.ts';
import {
  gateStrengthIntentByTier,
  resolveStrengthEquipmentTier3,
  type StrengthEquipmentTier3,
} from '../_shared/strength-equipment-tier.ts';
import { hasPaceBenchmark } from '../_shared/pace-benchmark.ts';
import { inferLimiterSportFromArc } from '../_shared/limiter-sport.ts';
import type { ArcContext } from '../_shared/arc-context.ts';

export type LiftOnFile = { value: number; source: 'locked' | 'learned' | 'typed' };

/** The athlete's answers the hours cards depend on, as the wizard's goal payload carries them. */
export type SessionFrequencyAsk = {
  /** The hours option values on the cards. */
  hours: number[];
  /** `training_prefs.days_per_week`. */
  days_per_week?: number | null;
  /** `training_prefs.strength_intent` — sent only when strength is in and a role was picked. */
  strength_intent?: string | null;
  /** `training_prefs.swim_intent` — triathlon only. */
  swim_intent?: string | null;
};

export type IntakeReadout = {
  has_pace_benchmark: boolean;
  hard_days_priceable: { run: boolean; bike: boolean };
  equipment_tier: StrengthEquipmentTier3;
  performance_downgraded: boolean;
  lifts: Record<CanonicalLiftKey, LiftOnFile | null>;
  barbell_lifts_on_file: 'all' | 'some' | 'none';
  strength_default: 'use' | 'test';
  session_frequency_by_tier?: Record<string, { swims: number; bikes: number; runs: number }>;
};

type ArcSlice = Pick<
  ArcContext,
  'learned_fitness' | 'performance_numbers' | 'locked_baselines' | 'equipment' | 'effort_paces' | 'swim_training_from_workouts'
>;

const BARBELL_LIFTS: CanonicalLiftKey[] = ['squat', 'bench', 'deadlift', 'overheadPress1RM'];
const ALL_LIFTS: CanonicalLiftKey[] = [...BARBELL_LIFTS, 'pullupMaxReps'];
/** OURS — a guard on the request, not a training number: at most 10 hours options are worked out (the cards show 5). */
const MAX_TIERS = 10;

export function buildIntakeReadout(args: {
  arc: ArcSlice;
  /** `user_baselines` effort columns — not on ArcContext. */
  effort: { effort_score?: unknown; effort_source_distance?: unknown; effort_source_time?: unknown } | null;
  /** YYYY-MM-DD — the freshness date for learned lifts. */
  asOf: string;
  sessionFrequency?: SessionFrequencyAsk | null;
}): IntakeReadout {
  const { arc } = args;
  const baselines = { learned_fitness: arc.learned_fitness, performance_numbers: arc.performance_numbers };

  const has_pace_benchmark = hasPaceBenchmark({
    ...(args.effort ?? {}),
    effort_paces: arc.effort_paces as { race?: unknown } | null,
    learned_fitness: arc.learned_fitness,
  });

  const hard_days_priceable = {
    run: resolveCurrentRunThresholdPace(baselines as never).sec_per_mi != null,
    bike: resolveCurrentFtp(baselines as never).value != null,
  };

  const chips = (arc.equipment as { strength?: unknown } | null)?.strength;
  const equipment_tier = resolveStrengthEquipmentTier3(
    null,
    Array.isArray(chips) ? chips.map((c) => String(c)) : [],
    arc.performance_numbers,
  );
  const performance_downgraded = gateStrengthIntentByTier('performance', equipment_tier).downgraded;

  const strength1rms = (arc.learned_fitness as { strength_1rms?: Record<string, unknown> } | null)?.strength_1rms ?? null;
  const lifts = {} as Record<CanonicalLiftKey, LiftOnFile | null>;
  for (const key of ALL_LIFTS) {
    const r = resolveStrengthCapacity({
      key,
      typed: arc.performance_numbers as Record<string, unknown> | null,
      learnedStrength1rms: strength1rms,
      locked: arc.locked_baselines as Record<string, unknown> | null,
      asOf: args.asOf,
    });
    lifts[key] = r.value != null && r.source !== 'none'
      ? { value: Math.round(r.value), source: r.source as LiftOnFile['source'] }
      : null;
  }
  const onFile = BARBELL_LIFTS.filter((k) => lifts[k] != null).length;
  const barbell_lifts_on_file = onFile === BARBELL_LIFTS.length ? 'all' : onFile > 0 ? 'some' : 'none';

  const out: IntakeReadout = {
    has_pace_benchmark,
    hard_days_priceable,
    equipment_tier,
    performance_downgraded,
    lifts,
    barbell_lifts_on_file,
    strength_default: onFile > 0 ? 'use' : 'test',
  };

  const ask = args.sessionFrequency;
  const hours = Array.isArray(ask?.hours)
    ? ask!.hours.map(Number).filter((h) => Number.isFinite(h) && h > 0).slice(0, MAX_TIERS)
    : [];
  if (hours.length > 0) {
    // Same clamp as `resolveSessionFrequencyDefaults` (reconcile-athlete-state-week-optimizer.ts).
    const dayInput = Math.round(Number(ask!.days_per_week) || 7);
    const days_per_week: 4 | 5 | 6 | 7 = dayInput <= 4 ? 4 : dayInput === 5 ? 5 : dayInput === 6 ? 6 : 7;
    const limiter_sport = inferLimiterSportFromArc(arc);
    const swim = String(ask!.swim_intent ?? '');
    const strength = String(ask!.strength_intent ?? '');
    const by: Record<string, { swims: number; bikes: number; runs: number }> = {};
    for (const h of hours) {
      const inputs: SessionFrequencyInputs = {
        weekly_hours_available: h,
        days_per_week,
        limiter_sport,
        ...(swim === 'focus' || swim === 'race' ? { swim_intent: swim } : {}),
        ...(strength === 'performance' || strength === 'support' ? { strength_intent: strength } : {}),
      };
      const d = computeSessionFrequencyDefaults(inputs);
      by[String(h)] = { swims: d.swims_per_week, bikes: d.bikes_per_week, runs: d.runs_per_week };
    }
    out.session_frequency_by_tier = by;
  }
  return out;
}
