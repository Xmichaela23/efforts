import { HardCaps, PlanConfig, SkeletonWeek, ValidationNote, ValidationResult, Day } from './types';

export function clampWeeklyHours(cfg: PlanConfig): { clampedHours?: number, notes: ValidationNote[] } {
  const notes: ValidationNote[] = [];
  if (cfg.weeklyHoursTarget == null) return { clampedHours: undefined, notes };
  const level = cfg.timeLevel;
  const range = HardCaps.weeklyHoursByLevel[level];
  const max = Math.min(range.max, HardCaps.absoluteWeeklyHoursMax);
  const min = range.min;
  let clamped = cfg.weeklyHoursTarget;
  if (clamped > max) { clamped = max; notes.push({ code: 'HOURS_CLAMP', message: `Weekly hours capped at ${max} for ${level}` }); }
  if (clamped < min) { clamped = min; notes.push({ code: 'HOURS_CLAMP', message: `Weekly hours raised to ${min} minimum for ${level}` }); }
  return { clampedHours: clamped, notes };
}

export function countHard(slots: SkeletonWeek['slots']): number {
  return slots.filter(s =>
    s.poolId === 'run_speed_vo2_pool' ||
    s.poolId === 'run_threshold_pool' ||
    s.poolId === 'strength_full_pool'
  ).length;
}

export function enforceHardCap(week: SkeletonWeek): ValidationResult {
  const notes: ValidationNote[] = [];
  while (countHard(week.slots) > HardCaps.maxHardSessionsPerWeek) {
    const idxStrength = week.slots.findIndex(s => s.poolId === 'strength_full_pool' && s.optional);
    if (idxStrength >= 0) {
      week.slots.splice(idxStrength, 1);
      notes.push({ code: 'HARD_CAP', message: 'Dropped optional strength to respect hard cap' });
      continue;
    }
    const idxQoS = week.slots.findIndex(s => s.poolId === 'run_threshold_pool' || s.poolId === 'run_speed_vo2_pool');
    if (idxQoS >= 0) {
      week.slots[idxQoS] = { ...week.slots[idxQoS], poolId: 'run_easy_pool', optional: true };
      notes.push({ code: 'HARD_CAP', message: 'Downgraded a quality run to easy to respect hard cap' });
      continue;
    }
    break;
  }
  return { notes };
}

export function enforceSpacing(week: SkeletonWeek): ValidationResult {
  const notes: ValidationNote[] = [];
  const order: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const isHard = (pId: string) => pId === 'run_speed_vo2_pool' || pId === 'run_threshold_pool' || pId === 'strength_full_pool';
  for (let i=0; i<order.length-1; i++) {
    const d = order[i], n = order[i+1];
    const a = week.slots.find(s=>s.day===d);
    const b = week.slots.find(s=>s.day===n);
    if (a && b && isHard(a.poolId) && isHard(b.poolId)) {
      b.poolId = 'run_easy_pool';
      b.optional = true;
      notes.push({ code: 'SPACING_SHIFT', message: `Downgraded ${n} to easy to avoid back-to-back hard` });
    }
  }
  return { notes };
}


