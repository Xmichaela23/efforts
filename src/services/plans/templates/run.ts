import { Template } from '../types';

export const run_easy_strides_v1: Template = {
  id: 'run_easy_strides_v1',
  name: 'Easy Run + Strides',
  discipline: 'run',
  tags: ['easy','strides'],
  hardness: 'easy',
  baseDurationMin: 40,
  structure: [
    { role: 'warmup', sequence: [{ duration_s: 600, target: { type: 'hr', zone: 'Z1' } }] },
    { role: 'main', sequence: [{ duration_s: 1800, target: { type: 'hr', zone: 'Z2' } }] },
    { role: 'accessory', repeats: 6, work: { duration_s: 20, target: { type: 'rpe', value: 8 } }, recover: { duration_s: 40, target: { type: 'hr', zone: 'Z1' } } },
    { role: 'cooldown', sequence: [{ duration_s: 600, target: { type: 'hr', zone: 'Z1' } }] }
  ]
};

export const run_800s_10k_v1: Template = {
  id: 'run_800s_10k_v1',
  name: 'Track 800s @ 10K pace',
  discipline: 'run',
  tags: ['speed','vo2','track'],
  hardness: 'hard',
  baseDurationMin: 55,
  structure: [
    { role: 'warmup', sequence: [{ duration_s: 900, target: { type: 'hr', zone: 'Z1' } }] },
    { role: 'main', repeats: 6,
      work:    { distance_m: 800, target: { type: 'pace', from: '10k' } },
      recover: { distance_m: 400, target: { type: 'hr', zone: 'Z1' } }
    },
    { role: 'cooldown', sequence: [{ duration_s: 600, target: { type: 'hr', zone: 'Z1' } }] }
  ],
  progressionRule: { weeks: { 2:{ add_repeats: +1 }, 3:{ add_repeats: +1 }, 4:{ duration_scale: 0.85 } } },
  constraints: { minRestHoursBefore: 18, avoidIfTagsInLastDays: [{ tags:['max_deadlift','hill_sprints'], days: 2 }] }
};

export const run_tempo_continuous_v1: Template = {
  id: 'run_tempo_continuous_v1',
  name: 'Continuous Tempo',
  discipline: 'run',
  tags: ['threshold','tempo'],
  hardness: 'moderate',
  baseDurationMin: 50,
  structure: [
    { role: 'warmup', sequence: [{ duration_s: 600, target: { type: 'hr', zone: 'Z1' } }] },
    { role: 'main', sequence: [{ duration_s: 1500, target: { type: 'pace', from: 'T' } }] },
    { role: 'cooldown', sequence: [{ duration_s: 600, target: { type: 'hr', zone: 'Z1' } }] }
  ],
  progressionRule: { weeks: { 2:{ duration_scale: 1.1 }, 3:{ duration_scale: 1.2 }, 4:{ duration_scale: 0.85 } } }
};

export const run_long_progressive_v1: Template = {
  id: 'run_long_progressive_v1',
  name: 'Long Run – Progressive',
  discipline: 'run',
  tags: ['long','progressive','marathon'],
  hardness: 'moderate',
  baseDurationMin: 90,
  structure: [
    { role: 'main', sequence: [
      { duration_s: 3600, target: { type: 'hr', zone: 'Z2' } },
      { duration_s: 1200, target: { type: 'pace', from: 'M', delta_s_per_km: +10 } }
    ] }
  ],
  progressionRule: { weeks: { 2:{ duration_scale: 1.1 }, 3:{ duration_scale: 1.2 }, 4:{ duration_scale: 0.9 } } }
};

export const runTemplates = [
  run_easy_strides_v1,
  run_800s_10k_v1,
  run_tempo_continuous_v1,
  run_long_progressive_v1
];


