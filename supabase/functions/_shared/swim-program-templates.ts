/**
 * Swim program templates — pure data for combined-plan swim prescriptions.
 * Consumed by week-builder / session-factory (no I/O, no Supabase).
 *
 * v1: full tables for `70.3` only; other distances reuse 70.3 until spec'd.
 */

export type SwimDistanceKey = 'sprint' | 'olympic' | '70.3' | 'full';

export type SwimSessionType =
  | 'threshold'
  | 'css_aerobic'
  | 'technique_aerobic'
  | 'race_specific_aerobic'
  | 'easy';

export interface SwimSlotTemplate {
  session_type: SwimSessionType;
  target_yards: number;
  drill_emphasis: boolean;
  notes?: string;
}

/** Canonical phase keys after normalization. */
type NormalizedPhase = 'base' | 'build' | 'race_specific' | 'taper' | 'recovery';

const BASE_VS_BUILD_YARD_SCALE = 0.8;
const TAPER_YARD_SCALE = 0.6;

/** Weeks over which build targets ramp from start → peak (1-indexed weekInPhase). */
const BUILD_RAMP_WEEKS = 6;
const RACE_SPECIFIC_RAMP_WEEKS = 4;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 1-based week index → [0,1] progress within phase ramp. */
function phaseProgress(weekInPhase: number, rampWeeks: number): number {
  const w = Math.max(1, Math.round(weekInPhase));
  if (rampWeeks <= 1) return 1;
  return clamp01((w - 1) / (rampWeeks - 1));
}

function roundYards(n: number): number {
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

function raceTemplatesFromYards(yards: [number, number]): SwimSlotTemplate[] {
  return RACE_70_3_SLOT_META.map((meta, i) => ({
    ...meta,
    target_yards: yards[i]!,
  }));
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

/**
 * Per-week swim slot prescriptions for tri combined plans.
 *
 * @param swimIntent `focus` → 3 slots (when week-builder places third day); `race` → 2 slots.
 * @param phase `base` | `build` | `race_specific` | `taper` | `recovery` (aliases normalized).
 * @param distance goal distance string; normalized — v1 only 70.3 differs; others mirror 70.3.
 * @param weekInPhase 1-based week index within the current phase block (drives ramp).
 *
 * Returns **[]** for `recovery` — use {@link getRecoverySwimTemplate} instead so recovery stays explicit.
 */
export function getSwimSlotTemplates(
  swimIntent: 'focus' | 'race',
  phase: string,
  distance: string,
  weekInPhase: number,
): SwimSlotTemplate[] {
  const ph = normalizePhase(phase);
  if (ph === 'recovery') return [];

  const distanceKey = normalizeSwimProgramDistance(distance);
  // v1: all keys use 70.3 constants; `distanceKey` reserved for per-distance tables later.
  void distanceKey;

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
    return focusTemplatesFromYards(yards);
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
  return raceTemplatesFromYards(yardsR);
}
