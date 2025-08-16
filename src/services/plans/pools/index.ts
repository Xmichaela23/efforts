import { Pool } from '../types';

export const run_speed_vo2_pool: Pool = {
  id: 'run_speed_vo2_pool',
  templateIds: ['run_800s_10k_v1'],
  selection: { mode: 'noRepeat' }
};

export const run_threshold_pool: Pool = {
  id: 'run_threshold_pool',
  templateIds: ['run_tempo_continuous_v1'],
  selection: { mode: 'roundRobin' }
};

export const run_long_pool: Pool = {
  id: 'run_long_pool',
  templateIds: ['run_long_progressive_v1'],
  selection: { mode: 'weighted', weights: { run_long_progressive_v1: 1 } }
};

export function selectTemplateId(pool: Pool, weekNum: number): string {
  const list = pool.templateIds;
  if (list.length === 0) throw new Error(`Pool ${pool.id} has no templates`);
  const mode = pool.selection.mode;

  if (mode === 'roundRobin' || mode === 'noRepeat') {
    return list[(weekNum - 1) % list.length];
  }

  const weights = pool.selection.weights ?? Object.fromEntries(list.map(id => [id, 1]));
  const total = list.reduce((s, id) => s + (weights[id] ?? 1), 0);
  let cursor = ((weekNum * 9973) % total);
  for (const id of list) {
    const w = weights[id] ?? 1;
    if (cursor < w) return id;
    cursor -= w;
  }
  return list[0];
}

export const poolsById: Record<string, Pool> = {
  [run_speed_vo2_pool.id]: run_speed_vo2_pool,
  [run_threshold_pool.id]: run_threshold_pool,
  [run_long_pool.id]: run_long_pool
};


