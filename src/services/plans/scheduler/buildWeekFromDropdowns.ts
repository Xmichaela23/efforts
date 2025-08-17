import { placeWeek } from './simpleScheduler';
import type { SimpleSchedulerParams } from './types';
import type { SkeletonWeek } from '../types';

export function buildWeekFromDropdowns(weekNumber: number, phase: SkeletonWeek['phase'], params: SimpleSchedulerParams): { week: SkeletonWeek, notes: string[] } {
  const { slots, notes } = placeWeek(params);
  const week: SkeletonWeek = {
    weekNumber,
    phase,
    slots,
    policies: {
      maxHardPerWeek: 3,
      minRestGap: 24,
      taperMultiplier: phase === 'taper' ? 0.7 : undefined
    }
  };
  return { week, notes };
}


