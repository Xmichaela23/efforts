import { Template } from '../types';

export const mobility_reset_10_v1: Template = {
  id: 'mobility_reset_10_v1',
  name: 'Mobility Reset — 10 min',
  discipline: 'mobility',
  tags: ['reset','full-body'],
  hardness: 'easy',
  baseDurationMin: 10,
  structure: [
    { role: 'main', sequence: [
      { duration_s: 60,  target: { type: 'rpe', value: 2 }, env: { equipment: 'breathing_box' } },
      { duration_s: 120, target: { type: 'rpe', value: 3 }, env: { equipment: 't-spine_openers' } },
      { duration_s: 120, target: { type: 'rpe', value: 3 }, env: { equipment: 'hip_90_90' } },
      { duration_s: 120, target: { type: 'rpe', value: 3 }, env: { equipment: 'ankle_dorsiflexion' } },
      { duration_s: 120, target: { type: 'rpe', value: 2 }, env: { equipment: 'calf_soft_tissue' } }
    ]}
  ]
};

export const mobility_hips_ankles_15_v1: Template = {
  id: 'mobility_hips_ankles_15_v1',
  name: 'Hips & Ankles — 15 min',
  discipline: 'mobility',
  tags: ['lower','run-support'],
  hardness: 'easy',
  baseDurationMin: 15,
  structure: [
    { role: 'main', sequence: [
      { duration_s: 180, target: { type: 'rpe', value: 3 }, env: { equipment: 'couch_stretch' } },
      { duration_s: 180, target: { type: 'rpe', value: 3 }, env: { equipment: 'pigeon' } },
      { duration_s: 180, target: { type: 'rpe', value: 3 }, env: { equipment: 'ankle_knee_to_wall' } },
      { duration_s: 180, target: { type: 'rpe', value: 2 }, env: { equipment: 'calf_raise_iso' } },
      { duration_s: 180, target: { type: 'rpe', value: 2 }, env: { equipment: 'adductor_rockbacks' } }
    ]}
  ]
};

export const mobility_tspine_shoulders_12_v1: Template = {
  id: 'mobility_tspine_shoulders_12_v1',
  name: 'T-Spine & Shoulders — 12 min',
  discipline: 'mobility',
  tags: ['upper','posture'],
  hardness: 'easy',
  baseDurationMin: 12,
  structure: [
    { role: 'main', sequence: [
      { duration_s: 150, target: { type: 'rpe', value: 2 }, env: { equipment: 'thread_the_needle' } },
      { duration_s: 150, target: { type: 'rpe', value: 2 }, env: { equipment: 'wall_slides' } },
      { duration_s: 150, target: { type: 'rpe', value: 2 }, env: { equipment: 'overhead_pass_throughs' } },
      { duration_s: 120, target: { type: 'rpe', value: 2 }, env: { equipment: 'pec_doorway' } }
    ]}
  ]
};

export const mobilityTemplates = [
  mobility_reset_10_v1,
  mobility_hips_ankles_15_v1,
  mobility_tspine_shoulders_12_v1
];


