/**
 * Swim program templates — pure data for combined-plan swim prescriptions.
 * Consumed by week-builder / session-factory (no I/O, no Supabase).
 *
 * v2.1 (revised protocol): slot ladders still anchored on legacy 70.3 ramps, then scaled by
 * race distance × athlete fitness using midpoint averages from `VOLUME_RANGES` in SWIM-IMPLEMENTATION-FINAL.
 */

import { preferredDaysSwimSlotCount } from './combined-schedule-prefs.ts';

export type SwimDistanceKey = 'sprint' | 'olympic' | '70.3' | 'full';

export type SwimSessionType =
  | 'threshold'
  | 'css_aerobic'
  | 'technique_aerobic'
  | 'race_specific_aerobic'
  /** Short reps / turnover — paired with threshold in 2-swim race-intent rotation. */
  | 'speed'
  | 'kick_focused'
  | 'pull_focused'
  | 'endurance'
  | 'easy';

export interface SwimSlotTemplate {
  session_type: SwimSessionType;
  target_yards: number;
  drill_emphasis: boolean;
  notes?: string;
  /** Compact recovery main set — {@link recoveryEasySwim} in session-factory (easy slot only). */
  recovery_learner_easy_structure?: boolean;
}

/** Canonical phase keys after normalization. */
type NormalizedPhase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery';

type SwimFitnessKey = 'beginner' | 'intermediate' | 'advanced';

/** Midpoints (yd) from revised protocol volume tables — reference = 70.3 intermediate for each phase. */
const MID_BASE_YD: Record<SwimDistanceKey, Record<SwimFitnessKey, number>> = {
  sprint: { beginner: 1250, intermediate: 1600, advanced: 1800 },
  olympic: { beginner: 1850, intermediate: 2200, advanced: 2700 },
  '70.3': { beginner: 1650, intermediate: 2200, advanced: 2700 },
  full: { beginner: 2800, intermediate: 3300, advanced: 3800 },
};

const MID_BUILD_YD: Record<SwimDistanceKey, Record<SwimFitnessKey, number>> = {
  sprint: { beginner: 1500, intermediate: 1750, advanced: 2100 },
  olympic: { beginner: 2200, intermediate: 2500, advanced: 3200 },
  '70.3': { beginner: 2000, intermediate: 2500, advanced: 3200 },
  full: { beginner: 3300, intermediate: 3800, advanced: 4400 },
};

const MID_RACE_SPEC_YD: Record<SwimDistanceKey, Record<SwimFitnessKey, number>> = {
  sprint: { beginner: 1650, intermediate: 2000, advanced: 2300 },
  olympic: { beginner: 2400, intermediate: 2750, advanced: 3400 },
  '70.3': { beginner: 2200, intermediate: 2700, advanced: 3500 },
  full: { beginner: 3500, intermediate: 4100, advanced: 4800 },
};

const REF_MID_703_INTERMEDIATE: Record<'base' | 'build' | 'race_specific', number> = {
  base: MID_BASE_YD['70.3'].intermediate,
  build: MID_BUILD_YD['70.3'].intermediate,
  race_specific: MID_RACE_SPEC_YD['70.3'].intermediate,
};

function protocolMidVolumeMultiplier(
  phase: NormalizedPhase,
  distanceKey: SwimDistanceKey,
  athleteFitness: SwimFitnessKey,
): number {
  if (phase === 'taper' || phase === 'recovery') return 1;
  const fit = athleteFitness;
  if (phase === 'base') return MID_BASE_YD[distanceKey][fit] / REF_MID_703_INTERMEDIATE.base;
  if (phase === 'build') return MID_BUILD_YD[distanceKey][fit] / REF_MID_703_INTERMEDIATE.build;
  return MID_RACE_SPEC_YD[distanceKey][fit] / REF_MID_703_INTERMEDIATE.race_specific;
}

const BASE_VS_BUILD_YARD_SCALE = 0.8;
const TAPER_YARD_SCALE = 0.6;

/** Weeks over which build targets ramp from start → peak (1-indexed weekInPhase). */
export const BUILD_RAMP_WEEKS = 6;
export const RACE_SPECIFIC_RAMP_WEEKS = 4;
// ── 70.3 focus: slot order = [quality day, easy/technique day, third day] ─────
const FOCUS_70_3_SLOT_META: Omit<SwimSlotTemplate, 'target_yards'>[] = [
  {
    session_type: 'threshold',
    drill_emphasis: false,
    notes: 'Primary quality swim — threshold / sustained race-relevant pace.',
  },
  {
    session_type: 'technique_aerobic',
    drill_emphasis: true,
    notes: 'Technique-forward aerobic volume — drills are structural, not filler.',
  },
  {
    session_type: 'css_aerobic',
    drill_emphasis: false,
    notes: 'CSS-paced aerobic density — third touch, sustainable rhythm.',
  },
];

const FOCUS_70_3_BUILD_START_YDS: [number, number, number] = [2200, 2000, 1800];
const FOCUS_70_3_BUILD_PEAK_YDS: [number, number, number] = [2800, 2600, 2600];

// ── 70.3 race: slot order = [quality day, easy day] ───────────────────────────
const RACE_70_3_SLOT_META: Omit<SwimSlotTemplate, 'target_yards'>[] = [
  {
    session_type: 'threshold',
    drill_emphasis: false,
    notes: 'Maintenance quality — touch race-relevant swim intensity without run volume cost.',
  },
  {
    session_type: 'race_specific_aerobic',
    drill_emphasis: false,
    notes: 'Race-specific aerobic maintenance — steady open-water–style rhythm at moderate volume.',
  },
];

const RACE_70_3_BUILD_START_YDS: [number, number] = [2200, 2000];
const RACE_70_3_BUILD_PEAK_YDS: [number, number] = [2600, 2400];

function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 1-based week index → [0,1] progress within phase ramp. */
export function phaseProgress(weekInPhase: number, rampWeeks: number): number {
  const w = Math.max(1, Math.round(weekInPhase));
  if (rampWeeks <= 1) return 1;
  return clamp01((w - 1) / (rampWeeks - 1));
}

export function roundYards(n: number): number {
  return Math.max(200, Math.round(n / 50) * 50);
}

function normalizePhase(phase: string): NormalizedPhase {
  const p = String(phase ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (p === 'race_specific' || p === 'racespecific' || p === 'race_specific_phase') return 'race_specific';
  if (p === 'base' || p === 'general' || p === 'foundational') return 'base';
  if (p === 'build' || p === 'building') return 'build';
  if (p === 'taper' || p === 'race_week' || p === 'raceweek') return 'taper';
  if (p === 'recovery' || p === 'deload') return 'recovery';
  return 'build';
}

/**
 * Normalize goal distance strings to template keys.
 * Unknown labels default to `70.3` (safe v1 fallback).
 */
export function normalizeSwimProgramDistance(raw: string): SwimDistanceKey {
  const d = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (d === 'sprint' || d === 'supersprint' || d === 'super_sprint' || d === 'super-sprint') return 'sprint';
  if (d === 'olympic' || d === 'standard' || d === 'oly' || d === 'international') return 'olympic';
  if (d === '70.3' || d === '703' || d === 'half' || d === 'halfironman' || d === 'half_ironman' || d === 'h_im')
    return '70.3';
  if (d === 'ironman' || d === 'full' || d === 'im' || d === '140.6' || d === 'full_distance') return 'full';
  if (d.includes('70.3') || d.includes('703')) return '70.3';
  return '70.3';
}

function yardsForFocus70_3Build(weekInPhase: number): [number, number, number] {
  const t = phaseProgress(weekInPhase, BUILD_RAMP_WEEKS);
  return [
    roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[0], FOCUS_70_3_BUILD_PEAK_YDS[0], t)),
    roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[1], FOCUS_70_3_BUILD_PEAK_YDS[1], t)),
    roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[2], FOCUS_70_3_BUILD_PEAK_YDS[2], t)),
  ];
}

function yardsForRace70_3Build(weekInPhase: number): [number, number] {
  const t = phaseProgress(weekInPhase, BUILD_RAMP_WEEKS);
  return [
    roundYards(lerp(RACE_70_3_BUILD_START_YDS[0], RACE_70_3_BUILD_PEAK_YDS[0], t)),
    roundYards(lerp(RACE_70_3_BUILD_START_YDS[1], RACE_70_3_BUILD_PEAK_YDS[1], t)),
  ];
}

function focusTemplatesFromYards(yards: [number, number, number]): SwimSlotTemplate[] {
  return FOCUS_70_3_SLOT_META.map((meta, i) => ({
    ...meta,
    target_yards: yards[i]!,
  }));
}

function raceTemplatesFromMeta(
  meta: Omit<SwimSlotTemplate, 'target_yards'>[],
  yards: [number, number],
): SwimSlotTemplate[] {
  return meta.map((m, i) => ({
    ...m,
    target_yards: yards[i]!,
  }));
}

function raceTemplatesFromYards(yards: [number, number]): SwimSlotTemplate[] {
  return raceTemplatesFromMeta(RACE_70_3_SLOT_META, yards);
}

/**
 * 2-swim (race intent) — rotate stimulus across plan weeks (repeats every 4 weeks).
 * Slot 0 → swim_quality_day, slot 1 → swim_easy_day in week-builder.
 *
 * Week 1 % 4 === 1: threshold + race-specific aerobic
 * Week 2 % 4 === 2: threshold + pull
 * Week 3 % 4 === 3: technique + race-specific aerobic
 * Week 4 % 4 === 0: threshold + speed (turnover)
 */
export function raceTwoSwimRotationSlotMeta(planWeek: number): Omit<SwimSlotTemplate, 'target_yards'>[] {
  const c = ((Math.floor(planWeek) % 4) + 4) % 4;
  if (c === 1) {
    return [
      RACE_70_3_SLOT_META[0]!,
      RACE_70_3_SLOT_META[1]!,
    ];
  }
  if (c === 2) {
    return [
      RACE_70_3_SLOT_META[0]!,
      {
        session_type: 'pull_focused',
        drill_emphasis: false,
        notes:
          'Pull-focused — buoy-required moderate aerobic density; integrates full-stroke easy aerobic (rotation week).',
      },
    ];
  }
  if (c === 3) {
    return [
      {
        session_type: 'technique_aerobic',
        drill_emphasis: true,
        notes: 'Technique-forward aerobic — drills + steady volume before race-rhythm day (rotation week).',
      },
      RACE_70_3_SLOT_META[1]!,
    ];
  }
  return [
    RACE_70_3_SLOT_META[0]!,
    {
      session_type: 'speed',
      drill_emphasis: false,
      notes: 'Speed / turnover — short fast reps with full recovery; neuromuscular sharpness without threshold density.',
    },
  ];
}

function applyTaperScale(slots: SwimSlotTemplate[]): SwimSlotTemplate[] {
  return slots.map((s) => ({
    ...s,
    target_yards: roundYards(s.target_yards * TAPER_YARD_SCALE),
  }));
}

/**
 * Single recovery-week swim — week-builder uses when `phase === 'recovery'`.
 */
export function getRecoverySwimTemplate(): SwimSlotTemplate {
  return {
    session_type: 'easy',
    target_yards: 1200,
    drill_emphasis: false,
    notes: 'Recovery: one easy aerobic swim — frequency without structural load.',
  };
}

/** Distinct calendar days from `swim_easy_day` / `swim_quality_day` / `swim_third_day` (0=Sun … 6=Sat). */
export function distinctSwimPinDayCount(pins: {
  swim_easy_day?: number | null;
  swim_quality_day?: number | null;
  swim_third_day?: number | null;
}): number {
  const d = new Set<number>();
  if (pins.swim_easy_day != null) d.add(pins.swim_easy_day);
  if (pins.swim_quality_day != null) d.add(pins.swim_quality_day);
  if (pins.swim_third_day != null) d.add(pins.swim_third_day);
  return d.size;
}

/** Max of preferred_days.swim length and distinct swim_*_day pins — recovery rule needs ≥2 anchors. */
export function countSwimAnchorSlotsForRecovery(
  pins: {
    swim_easy_day?: number | null;
    swim_quality_day?: number | null;
    swim_third_day?: number | null;
  },
  trainingPrefs?: Record<string, unknown> | null,
): number {
  const fromPrefs = preferredDaysSwimSlotCount(trainingPrefs ?? undefined);
  const pinN = distinctSwimPinDayCount(pins);
  return Math.max(fromPrefs, pinN);
}

/**
 * Slots used for **focus vs race swim template** selection.
 *
 * When Arc still lists three weekdays in `preferred_days.swim` but only two `swim_*_day` pins exist,
 * {@link countSwimAnchorSlotsForRecovery} returns 3 (max) — wrongly unlocking focus 3-slot templates.
 * Here we take **min** when both prefs and pins exist so template rows match schedulable anchors.
 */
export function countSwimAnchorSlotsForProgramTemplates(
  pins: {
    swim_easy_day?: number | null;
    swim_quality_day?: number | null;
    swim_third_day?: number | null;
  },
  trainingPrefs?: Record<string, unknown> | null,
): number {
  const prefsLen = preferredDaysSwimSlotCount(trainingPrefs ?? undefined);
  const pinN = distinctSwimPinDayCount(pins);
  if (prefsLen >= 1 && pinN >= 1) return Math.min(prefsLen, pinN);
  if (prefsLen >= 1) return prefsLen;
  return pinN;
}

/** Learning / beginner swimmers keep frequency through recovery when two swim days exist. */
export function shouldMaintainTwoSwimsInRecovery(
  swimExperience: string | undefined,
  trainingFitness: string | undefined,
  swimAnchorSlots: number,
): boolean {
  if (swimAnchorSlots < 2) return false;
  const se = String(swimExperience ?? '').trim().toLowerCase();
  const tf = String(trainingFitness ?? '').trim().toLowerCase();
  if (se === 'learning' || se === 'beginner') return true;
  if (tf === 'beginner') return true;
  return false;
}

/**
 * Two short swims for recovery / rebuild weeks — technique continuity for learners.
 * Full IM uses slightly higher yard targets.
 */
export function getTwoSlotRecoveryLearnerSwimTemplates(distanceKey: SwimDistanceKey): SwimSlotTemplate[] {
  const isFull = distanceKey === 'full';
  const y = isFull ? 1000 : 800;
  return [
    {
      session_type: 'easy',
      target_yards: y,
      drill_emphasis: false,
      recovery_learner_easy_structure: true,
      notes: 'Active recovery — maintain feel for water without fatigue.',
    },
    {
      session_type: 'technique_aerobic',
      target_yards: y,
      drill_emphasis: true,
      notes: 'Light technique — reinforce mechanics from prior training block.',
    },
  ];
}

/**
 * Focus programs include a third template (`css_aerobic`). With only **two** pinned swim days,
 * week-builder places slots 0–1; budget resolution can drop slot 1 (`technique_aerobic`, low drop tier)
 * before slot 2, producing `[threshold, css_aerobic]` — the easy day wrongly becomes “CSS Aerobic.”
 * Use **race** 2-slot rotation until the athlete has three swim anchors **by program-slot count**
 * ({@link countSwimAnchorSlotsForProgramTemplates}), not the generous recovery max.
 */
export function swimProgramIntentForAnchorSlots(
  swimIntent: string | undefined,
  swimAnchorSlots: number,
): 'focus' | 'race' {
  const raw = String(swimIntent ?? 'race').trim().toLowerCase();
  if (raw !== 'focus') return 'race';
  return swimAnchorSlots >= 3 ? 'focus' : 'race';
}

/**
 * Per-week swim slot prescriptions for tri combined plans.
 *
 * @param swimIntent `focus` → 3 slots (when week-builder places third day); `race` → 2 slots.
 * @param phase `base` | `build` | `race_specific` | `taper` | `recovery` (aliases normalized).
 * @param distance goal distance string; normalized — v1 only 70.3 differs; others mirror 70.3.
 * @param weekInPhase 1-based week index within the current phase block (drives ramp).
 * @param opts.planWeekNumber Absolute plan week (1-based). Used for **race** intent 4-week session rotation; falls back to `weekInPhase` when omitted.
 *
 * Returns **[]** for `recovery` — use {@link getRecoverySwimTemplate} instead so recovery stays explicit.
 */
export function getSwimSlotTemplates(
  swimIntent: 'focus' | 'race',
  phase: string,
  distance: string,
  weekInPhase: number,
  opts?: { athleteFitness?: 'beginner' | 'intermediate' | 'advanced'; planWeekNumber?: number },
): SwimSlotTemplate[] {
  const ph = normalizePhase(phase);
  if (ph === 'recovery') return [];

  const distanceKey = normalizeSwimProgramDistance(distance);
  const athleteFitness: SwimFitnessKey = opts?.athleteFitness ?? 'intermediate';

  if (swimIntent === 'focus') {
    let yards: [number, number, number];
    if (ph === 'taper') {
      yards = yardsForFocus70_3Build(BUILD_RAMP_WEEKS);
      return applyTaperScale(focusTemplatesFromYards(yards));
    }
    if (ph === 'base') {
      const ref = yardsForFocus70_3Build(weekInPhase);
      yards = ref.map((y) => roundYards(y * BASE_VS_BUILD_YARD_SCALE)) as [number, number, number];
    } else if (ph === 'build') {
      yards = yardsForFocus70_3Build(weekInPhase);
    } else if (ph === 'race_specific') {
      const t = phaseProgress(weekInPhase, RACE_SPECIFIC_RAMP_WEEKS);
      yards = [
        roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[0], FOCUS_70_3_BUILD_PEAK_YDS[0], t)),
        roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[1], FOCUS_70_3_BUILD_PEAK_YDS[1], t)),
        roundYards(lerp(FOCUS_70_3_BUILD_START_YDS[2], FOCUS_70_3_BUILD_PEAK_YDS[2], t)),
      ];
    } else {
      yards = yardsForFocus70_3Build(weekInPhase);
    }
    if (ph === 'base' || ph === 'build' || ph === 'race_specific') {
      const mult = protocolMidVolumeMultiplier(ph, distanceKey, athleteFitness);
      yards = yards.map((y) => roundYards(y * mult)) as [number, number, number];
    }
    const slots = focusTemplatesFromYards(yards);
    // Build: pull (even week_in_phase) alternates with kick (odd). Race-specific: ~10% pull — week 2 each RS block plus week_in_phase divisible by 10 for long blocks.
    if ((ph === 'build' || ph === 'race_specific') && slots[1]) {
      const rsPullWeek =
        ph === 'race_specific' && (weekInPhase === 2 || weekInPhase % 10 === 0);
      if (rsPullWeek) {
        slots[1] = {
          ...slots[1]!,
          session_type: 'pull_focused',
          drill_emphasis: false,
          notes:
            'Pull-focused — buoy-required moderate aerobic density; integrates full-stroke easy aerobic.',
        };
      } else if (weekInPhase % 2 === 1) {
        slots[1] = {
          ...slots[1]!,
          session_type: 'kick_focused',
          drill_emphasis: false,
          notes:
            distanceKey === 'sprint' || distanceKey === 'olympic'
              ? 'Kick-focused — propulsive rhythm with kickboard; integrates full-stroke aerobic.'
              : 'Kick-focused — ankle mobility / 2-beat support with fins; low leg fatigue for bike/run.',
        };
      } else if (ph === 'build') {
        slots[1] = {
          ...slots[1]!,
          session_type: 'pull_focused',
          drill_emphasis: false,
          notes:
            'Pull-focused — buoy-required upper-body rhythm at moderate aerobic intensity; integrates full-stroke easy aerobic.',
        };
      }
    }
    // Full Ironman advanced: late build + early race-specific endurance slot (over-distance applied in week-builder).
    if (
      distanceKey === 'full' &&
      athleteFitness === 'advanced' &&
      ((ph === 'build' && weekInPhase >= 4) || (ph === 'race_specific' && weekInPhase <= 2)) &&
      slots[2]
    ) {
      slots[2] = {
        ...slots[2]!,
        session_type: 'endurance',
        drill_emphasis: false,
        notes: 'Endurance swim — continuous aerobic density; advanced Full IM window may use over-distance.',
      };
    }
    return slots;
  }

  // race intent — 2 slots
  let yardsR: [number, number];
  if (ph === 'taper') {
    yardsR = yardsForRace70_3Build(BUILD_RAMP_WEEKS);
    return applyTaperScale(raceTemplatesFromYards(yardsR));
  }
  if (ph === 'base') {
    const ref = yardsForRace70_3Build(weekInPhase);
    yardsR = ref.map((y) => roundYards(y * BASE_VS_BUILD_YARD_SCALE)) as [number, number];
  } else if (ph === 'build') {
    yardsR = yardsForRace70_3Build(weekInPhase);
  } else if (ph === 'race_specific') {
    const t = phaseProgress(weekInPhase, RACE_SPECIFIC_RAMP_WEEKS);
    yardsR = [
      roundYards(lerp(RACE_70_3_BUILD_START_YDS[0], RACE_70_3_BUILD_PEAK_YDS[0], t)),
      roundYards(lerp(RACE_70_3_BUILD_START_YDS[1], RACE_70_3_BUILD_PEAK_YDS[1], t)),
    ];
  } else {
    yardsR = yardsForRace70_3Build(weekInPhase);
  }
  if (ph === 'base' || ph === 'build' || ph === 'race_specific') {
    const mult = protocolMidVolumeMultiplier(ph, distanceKey, athleteFitness);
    yardsR = yardsR.map((y) => roundYards(y * mult)) as [number, number];
  }
  const rotationWeek = opts?.planWeekNumber ?? weekInPhase;
  const meta = raceTwoSwimRotationSlotMeta(rotationWeek);
  return raceTemplatesFromMeta(meta, yardsR);
}
