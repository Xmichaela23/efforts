import { Template } from '../types';

export const strength_full_A_v1: Template = {
  id: 'strength_full_A_v1',
  name: 'Full Body A — Squat/Bench (Neural)',
  discipline: 'strength',
  tags: ['compound','neural'],
  hardness: 'hard',
  structure: [
    { role: 'main', repeats: 5, work: { duration_s: 120, target: { type: 'strength_pct1rm', lift: 'back_squat', pct: 0.80, rir: 2 } } },
    { role: 'main', repeats: 4, work: { duration_s: 100, target: { type: 'strength_pct1rm', lift: 'bench_press', pct: 0.80, rir: 1 } } },
    { role: 'accessory', repeats: 3, work: { duration_s: 90, target: { type: 'rpe', value: 7 }, env: { equipment: 'rdl' } } }
  ],
  progressionRule: {
    weeks: {
      1:{}, 2:{ target_shift: { strength_pct1rm_delta: +0.02 } },
      3:{ target_shift: { strength_pct1rm_delta: +0.02 } },
      4:{ target_shift: { strength_pct1rm_delta: -0.05 } }
    }
  },
  constraints: { minRestHoursAfter: 24 }
};

// Power focus — heavy neural emphasis
export const strength_power_A_v1: Template = {
  id: 'strength_power_A_v1',
  name: 'Power A — Heavy Squat/Bench (Neural)',
  discipline: 'strength',
  tags: ['power','neural'],
  hardness: 'hard',
  structure: [
    { role: 'main', repeats: 5, work: { duration_s: 120, target: { type: 'strength_pct1rm', lift: 'back_squat', pct: 0.85, rir: 1 } } },
    { role: 'main', repeats: 4, work: { duration_s: 110, target: { type: 'strength_pct1rm', lift: 'bench_press', pct: 0.85, rir: 1 } } },
    { role: 'accessory', repeats: 3, work: { duration_s: 90, target: { type: 'rpe', value: 7 } } }
  ],
  progressionRule: { weeks: { 2:{ target_shift: { strength_pct1rm_delta: +0.02 } }, 3:{ target_shift: { strength_pct1rm_delta: +0.02 } }, 4:{ target_shift: { strength_pct1rm_delta: -0.05 } } } },
  constraints: { minRestHoursAfter: 24 }
};

// Endurance focus — circuit style, submaximal loads
export const strength_endurance_A_v1: Template = {
  id: 'strength_endurance_A_v1',
  name: 'Strength Endurance A — Circuits',
  discipline: 'strength',
  tags: ['endurance','circuit'],
  hardness: 'moderate',
  structure: [
    { role: 'main', repeats: 3, work: { duration_s: 300, target: { type: 'rpe', value: 6 } } },
    { role: 'accessory', repeats: 3, work: { duration_s: 180, target: { type: 'rpe', value: 6 } } }
  ],
  progressionRule: { weeks: { 2:{ duration_scale: 1.1 }, 3:{ duration_scale: 1.2 }, 4:{ duration_scale: 0.85 } } },
  constraints: { minRestHoursAfter: 12 }
};

// Hybrid focus — mixed neural + endurance
export const strength_hybrid_A_v1: Template = {
  id: 'strength_hybrid_A_v1',
  name: 'Hybrid A — Mixed Neural/Endurance',
  discipline: 'strength',
  tags: ['hybrid'],
  hardness: 'moderate',
  structure: [
    { role: 'main', repeats: 4, work: { duration_s: 100, target: { type: 'strength_pct1rm', lift: 'front_squat', pct: 0.75, rir: 2 } } },
    { role: 'main', repeats: 3, work: { duration_s: 90, target: { type: 'strength_pct1rm', lift: 'overhead_press', pct: 0.70, rir: 2 } } },
    { role: 'accessory', repeats: 3, work: { duration_s: 120, target: { type: 'rpe', value: 6 } } }
  ],
  progressionRule: { weeks: { 2:{ duration_scale: 1.05 }, 3:{ duration_scale: 1.1 }, 4:{ duration_scale: 0.9 } } },
  constraints: { minRestHoursAfter: 18 }
};

export const strengthTemplates = [
  strength_full_A_v1,
  strength_power_A_v1,
  strength_endurance_A_v1,
  strength_hybrid_A_v1,
  // Optional UPPER/CORE (non-hard) cowboy day variants
  {
    id: 'strength_upper_power_A_v1',
    name: 'Upper/Core — Power',
    discipline: 'strength',
    tags: ['upper','core','optional'],
    hardness: 'easy',
    baseDurationMin: 35,
    structure: [
      { role: 'main', repeats: 4, work: { duration_s: 120, target: { type: 'strength_pct1rm', lift: 'bench_press', pct: 0.70, rir: 2 } } },
      { role: 'main', repeats: 4, work: { duration_s: 110, target: { type: 'strength_pct1rm', lift: 'overhead_press', pct: 0.70, rir: 2 } } },
      { role: 'accessory', repeats: 3, work: { duration_s: 90, target: { type: 'rpe', value: 7 } } }
    ]
  } as Template,
  {
    id: 'strength_upper_endurance_A_v1',
    name: 'Upper/Core — Endurance',
    discipline: 'strength',
    tags: ['upper','core','optional'],
    hardness: 'easy',
    baseDurationMin: 30,
    structure: [
      { role: 'main', repeats: 3, work: { duration_s: 240, target: { type: 'rpe', value: 6 } } },
      { role: 'accessory', repeats: 3, work: { duration_s: 180, target: { type: 'rpe', value: 6 } } }
    ]
  } as Template,
  {
    id: 'strength_upper_hybrid_A_v1',
    name: 'Upper/Core — Hybrid',
    discipline: 'strength',
    tags: ['upper','core','optional'],
    hardness: 'easy',
    baseDurationMin: 35,
    structure: [
      { role: 'main', repeats: 3, work: { duration_s: 110, target: { type: 'strength_pct1rm', lift: 'overhead_press', pct: 0.70, rir: 2 } } },
      { role: 'main', repeats: 3, work: { duration_s: 110, target: { type: 'strength_pct1rm', lift: 'bench_press', pct: 0.70, rir: 2 } } },
      { role: 'accessory', repeats: 3, work: { duration_s: 120, target: { type: 'rpe', value: 6 } } }
    ]
  } as Template
];


