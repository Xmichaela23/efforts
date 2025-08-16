import { Day, HardCaps, SkeletonWeek } from '../types';

type Level = 'new' | 'experienced' | 'veryExperienced';

export interface SimpleParams {
  availableDays: Day[];
  longRunDay: 'Sat' | 'Sun';
  level: Level;
  qualityDays?: 1 | 2;
  strengthDays?: 2 | 3;
  includeMobility?: boolean;
  mobilityDaysPreferred?: Day[];
  weekNumber?: number;
}

const ORDER: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function nextAvailable(target: Day, avail: Set<Day>): Day | null {
  if (avail.has(target)) return target;
  const start = ORDER.indexOf(target);
  for (let i = 1; i < 7; i++) {
    const cand = ORDER[(start + i) % 7];
    if (avail.has(cand)) return cand as Day;
  }
  return null;
}

function removeFromAvail(day: Day, avail: Set<Day>) {
  avail.delete(day);
}

function defaultsByLevel(level: Level, availCount: number): { q: 1 | 2; s: 2 | 3 } {
  if (level === 'new') return { q: 1, s: 2 };
  if (level === 'veryExperienced') return { q: 2, s: (availCount >= 6 ? 3 : 2) };
  return { q: 2, s: 2 };
}

export function place(params: SimpleParams): SkeletonWeek {
  const weekNumber = params.weekNumber ?? 1;
  const availSet = new Set<Day>(params.availableDays);

  // derive defaults and clamp
  const dfl = defaultsByLevel(params.level, availSet.size);
  let qDays: 1 | 2 = (params.qualityDays ?? dfl.q) as 1 | 2;
  let sDays: 2 | 3 = (params.strengthDays ?? dfl.s) as 2 | 3;
  if (sDays === 3 && !(params.level === 'veryExperienced' && availSet.size >= 6)) sDays = 2;

  // Long run
  const slots: { day: Day; poolId: string; optional?: boolean }[] = [];
  const longDay = params.longRunDay;
  if (!availSet.has(longDay)) {
    // if requested long day is not available, fall back to closest available weekend day
    const fallback = nextAvailable(longDay, availSet) || nextAvailable('Sun', availSet) || nextAvailable('Sat', availSet);
    if (!fallback) throw new Error('No available day for long run');
    slots.push({ day: fallback, poolId: 'run_long_pool' });
    removeFromAvail(fallback, availSet);
  } else {
    slots.push({ day: longDay, poolId: 'run_long_pool' });
    removeFromAvail(longDay, availSet);
  }

  // Quality run days (prefer Tue/Thu)
  const desiredQualityOrder: Day[] = ['Tue', 'Thu', 'Wed', 'Fri', 'Mon'];
  const chosenQuality: Day[] = [];
  for (const pref of desiredQualityOrder) {
    if (chosenQuality.length >= qDays) break;
    const day = nextAvailable(pref, availSet);
    if (day && day !== longDay) {
      chosenQuality.push(day);
      removeFromAvail(day, availSet);
    }
  }
  // Ensure at least one quality
  if (chosenQuality.length === 0) {
    const any = Array.from(availSet)[0];
    if (any) { chosenQuality.push(any); removeFromAvail(any, availSet); }
  }
  chosenQuality.forEach(d => slots.push({ day: d, poolId: 'run_speed_vo2_pool' }));
  if (chosenQuality.length === 2) {
    // second is threshold
    const last = slots.findIndex(s => s.day === chosenQuality[1]);
    if (last >= 0) slots[last] = { ...slots[last], poolId: 'run_threshold_pool' };
  }

  // Strength days
  const desiredStrengthOrder: Day[] = ['Mon', 'Fri', 'Wed'];
  const distinctHardDays = new Set<Day>([longDay, ...chosenQuality]);

  // If too many hard days, we will stack strength onto quality days first
  const targetDistinctHard = Math.min(HardCaps.maxHardSessionsPerWeek, 3);

  const strengthChosen: Day[] = [];
  for (const pref of desiredStrengthOrder) {
    if (strengthChosen.length >= sDays) break;
    let candidate: Day | null = nextAvailable(pref, availSet);
    if (!candidate) continue;
    // Avoid back-to-back: if previous day or next day is already hard, prefer stacking onto a quality day
    const prev = ORDER[(ORDER.indexOf(candidate) + 6) % 7];
    const next = ORDER[(ORDER.indexOf(candidate) + 1) % 7];
    const wouldBackToBack = distinctHardDays.has(prev as Day) || distinctHardDays.has(next as Day);

    if ((distinctHardDays.size + 1) > targetDistinctHard || wouldBackToBack) {
      // try to stack on a quality day not yet stacked
      const stackDay = chosenQuality.find(q => !strengthChosen.includes(q));
      if (stackDay) {
        strengthChosen.push(stackDay);
        // do not consume availability since stacking same day
        continue;
      }
    }
    // place standalone
    strengthChosen.push(candidate);
    distinctHardDays.add(candidate);
    removeFromAvail(candidate, availSet);
  }

  // Materialize strength slots (map to template-agnostic pool id; composer maps to template)
  strengthChosen.forEach(d => slots.push({ day: d, poolId: 'strength_full_pool' }));

  // Fill remaining available days with easy runs
  Array.from(availSet).forEach(d => slots.push({ day: d, poolId: 'run_easy_pool', optional: true }));

  // Optional mobility standalone (insert on preferred days first)
  if (params.includeMobility) {
    const used = new Set(slots.map(s => s.day));
    const prefs = (params.mobilityDaysPreferred ?? []).filter(d => !used.has(d));
    prefs.forEach(d => slots.push({ day: d, poolId: 'mobility_pool', optional: true }));
  }

  // Final policies
  const week: SkeletonWeek = {
    weekNumber,
    phase: 'build',
    slots,
    policies: {
      maxHardPerWeek: HardCaps.maxHardSessionsPerWeek,
      minRestGap: HardCaps.spacing.minRestGapHours
    }
  };

  return week;
}

export default { place };


