import { SkeletonWeek } from '../types';

export const hybrid_8w: SkeletonWeek[] = Array.from({ length: 8 }, (_, i) => {
  const weekNumber = i + 1;
  const phase: 'base'|'build'|'peak'|'taper' =
    weekNumber <= 2 ? 'base' : weekNumber <= 5 ? 'build' : weekNumber <= 7 ? 'peak' : 'taper';

  return {
    weekNumber,
    phase,
    slots: [
      { day: 'Mon', poolId: 'run_easy_pool', optional: true },
      { day: 'Tue', poolId: 'run_threshold_pool' },
      { day: 'Wed', poolId: 'run_easy_pool', optional: true },
      { day: 'Thu', poolId: 'run_speed_vo2_pool' },
      { day: 'Fri', poolId: 'run_easy_pool' },
      { day: 'Sat', poolId: 'strength_full_pool', optional: true },
      { day: 'Sun', poolId: 'run_long_pool' }
    ],
    policies: {
      maxHardPerWeek: 3,
      minRestGap: 24,
      taperMultiplier: phase === 'taper' ? (weekNumber === 8 ? 0.5 : 0.7) : undefined
    }
  };
});


