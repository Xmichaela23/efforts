import { SkeletonWeek, Baselines, Template } from './types';
import { poolsById, selectTemplateId } from './pools';
import { runTemplates } from './templates/run';
import { strengthTemplates } from './templates/strength';
import { mobilityTemplates } from './templates/mobility';
import type { SessionTemplate } from '../Seventy3Template';

const templateIndex: Record<string, { name: string; discipline: 'run'|'ride'|'swim'|'strength'; hardness: 'easy'|'moderate'|'hard'; baseDurationMin?: number }> = {};
const templateFullIndex: Record<string, Template> = {};

function registerTemplates() {
  [...runTemplates, ...strengthTemplates, ...mobilityTemplates].forEach(t => {
    templateIndex[t.id] = {
      name: t.name,
      discipline: t.discipline as any,
      hardness: t.hardness,
      baseDurationMin: t.baseDurationMin
    };
    templateFullIndex[t.id] = t as Template;
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
      // Deterministic rotation per pool: week-based round robin / weighted
      templateId = selectTemplateId(pool, params.weekNum);
    }

    const meta = templateIndex[templateId];
    if (!meta) return;

    const type = hardnessToType(meta.hardness);
    const intensity = hardnessToIntensity(meta.hardness);

    // Progressive overload scaling
    let baseMin = (meta.baseDurationMin ?? 45);
    let scale = 1;
    const full = templateFullIndex[templateId];
    const weekRule = full?.progressionRule?.weeks?.[params.weekNum];
    const phaseRule = full?.progressionRule?.byPhase?.[params.skeletonWeek.phase];
    const applied = { ...(phaseRule || {}), ...(weekRule || {}) } as any;
    if (applied?.duration_scale != null) {
      scale *= applied.duration_scale;
    }
    if (params.skeletonWeek.policies?.taperMultiplier && params.skeletonWeek.phase === 'taper') {
      scale *= params.skeletonWeek.policies.taperMultiplier;
    }
    const duration = Math.max(1, Math.round(baseMin * scale));

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


