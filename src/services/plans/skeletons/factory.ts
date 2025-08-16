import { Day, PlanConfig, SkeletonWeek } from '../types';
import { HardCaps } from '../types';
import { enforceHardCap, enforceSpacing } from '../validators';

export function buildGetFasterStrongerSkeleton(cfg: PlanConfig): { weeks: SkeletonWeek[], notes: string[] } {
  const notes: string[] = [];
  const weeks: SkeletonWeek[] = [];
  const pickPhase = (w:number) =>
    cfg.durationWeeks === 8
      ? (w<=2?'base':w<=6?'build':w===7?'peak':'taper')
      : (w<=4?'base':w<=10?'build':w<=cfg.durationWeeks-1?'peak':'taper');

  const isAvail = (d:Day) => cfg.availableDays.includes(d);
  const strengthDays = deriveStrengthDays(cfg);
  const speedDays = deriveRunQualityDays(cfg);

  for (let w=1; w<=cfg.durationWeeks; w++) {
    const phase = pickPhase(w);
    const slots: { day: Day; poolId: string; optional?: boolean }[] = [];

    if (isAvail(cfg.longRunDay)) slots.push({ day: cfg.longRunDay, poolId: 'run_long_pool' });
    speedDays.forEach((d, i) => { if (isAvail(d)) slots.push({ day: d, poolId: i===0 ? 'run_speed_vo2_pool' : 'run_threshold_pool' }); });
    if (cfg.includeStrength) strengthDays.forEach(d => { if (isAvail(d)) slots.push({ day: d, poolId: 'strength_full_pool', optional: true }); });
    (['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as Day[])
      .filter(d => isAvail(d) && !slots.find(s => s.day===d))
      .forEach(d => slots.push({ day: d, poolId: 'run_easy_pool', optional: true }));

    const week: SkeletonWeek = {
      weekNumber: w,
      phase,
      slots,
      policies: {
        maxHardPerWeek: HardCaps.maxHardSessionsPerWeek,
        minRestGap: HardCaps.spacing.minRestGapHours,
        taperMultiplier: phase === 'taper' ? (w === cfg.durationWeeks ? 0.5 : 0.7) : undefined
      }
    };

    const { notes: n1 } = enforceHardCap(week);
    const { notes: n2 } = enforceSpacing(week);
    notes.push(...n1.map(x=>x.message), ...n2.map(x=>x.message));

    weeks.push(week);
  }
  return { weeks, notes };
}

function deriveStrengthDays(cfg: PlanConfig): Day[] {
  const pref = (cfg.strengthDaysPreferred ?? []).filter(d => cfg.availableDays.includes(d));
  const count = Math.min(cfg.strengthDaysPerWeek, HardCaps.strength.maxDays);
  const defaults: Day[] = ['Mon','Fri','Wed'];
  const pool: Day[] = [...pref, ...defaults].filter((d,i,self)=>self.indexOf(d)===i);
  return pool.filter(d => cfg.availableDays.includes(d)).slice(0, count);
}

function deriveRunQualityDays(cfg: PlanConfig): Day[] {
  const wanted = cfg.runQualityDays;
  const base: Day[] = ['Tue','Thu'];
  const avail = cfg.availableDays;
  const out: Day[] = [];
  for (const d of base) {
    if (out.length >= wanted) break;
    if (avail.includes(d)) { out.push(d); continue; }
    const order: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let idx = (order.indexOf(d)+1)%7;
    for (let k=0;k<7;k++) {
      const cand = order[idx] as Day;
      if (avail.includes(cand)) { out.push(cand); break; }
      idx=(idx+1)%7;
    }
  }
  return out.slice(0, wanted);
}


