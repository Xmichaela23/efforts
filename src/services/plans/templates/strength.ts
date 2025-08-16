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

export const strengthTemplates = [strength_full_A_v1];


