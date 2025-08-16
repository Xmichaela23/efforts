import { SkeletonWeek, Baselines } from './types';
import { poolsById, selectTemplateId } from './pools';
import { runTemplates } from './templates/run';
import { strengthTemplates } from './templates/strength';
import type { SessionTemplate } from '../Seventy3Template';

const templateIndex: Record<string, { name: string; discipline: 'run'|'ride'|'swim'|'strength'; hardness: 'easy'|'moderate'|'hard'; baseDurationMin?: number }> = {};

function registerTemplates() {
  [...runTemplates, ...strengthTemplates].forEach(t => {
    templateIndex[t.id] = {
      name: t.name,
      discipline: t.discipline as any,
      hardness: t.hardness,
      baseDurationMin: t.baseDurationMin
    };
  });
}
registerTemplates();

const dayMap: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday'
};

function hardnessToType(h: 'easy'|'moderate'|'hard'): SessionTemplate['type'] {
  if (h === 'easy') return 'endurance';
  if (h === 'moderate') return 'tempo';
  return 'vo2max';
}

function hardnessToIntensity(h: 'easy'|'moderate'|'hard'): string {
  if (h === 'easy') return 'Zone 2';
  if (h === 'moderate') return 'Zone 3';
  return 'Zone 4';
}

// Simple composer: select a template id per slot, map to SessionTemplate minimal fields
export function composeWeek(params: {
  weekNum: number;
  skeletonWeek: SkeletonWeek;
  baselines?: Baselines;
}): SessionTemplate[] {
  const sessions: SessionTemplate[] = [];

  params.skeletonWeek.slots.forEach(slot => {
    // Temporary: map missing pools directly to a template id
    let templateId: string | null = null;
    if (slot.poolId === 'run_easy_pool') templateId = 'run_easy_strides_v1';
    if (slot.poolId === 'strength_full_pool') templateId = 'strength_full_A_v1';

    if (!templateId) {
      const pool = poolsById[slot.poolId];
      if (!pool) return; // unknown pool; skip optional
      templateId = selectTemplateId(pool, params.weekNum);
    }

    const meta = templateIndex[templateId];
    if (!meta) return;

    const type = hardnessToType(meta.hardness);
    const intensity = hardnessToIntensity(meta.hardness);
    const duration = Math.max(1, Math.round((meta.baseDurationMin ?? 45))); // minutes

    sessions.push({
      day: dayMap[slot.day] || slot.day,
      discipline: meta.discipline,
      type,
      duration,
      intensity,
      description: meta.name,
      zones: []
    } as SessionTemplate);
  });

  return sessions;
}


