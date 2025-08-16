import { Day, PlanConfig, SkeletonWeek, StrengthTrack, HardCaps } from '../types';
import { enforceHardCap, enforceSpacing } from '../validators';

/**
 * 8-week "Get Stronger Faster" skeleton.
 * - Long run: Sat/Sun (per config)
 * - Quality runs: 1–2 (VO2, Threshold)
 * - Strength: 0–3 days, only if includeStrength=true
 * - Easy runs fill remaining available days
 * - Guardrails: ≤3 hard sessions/week, no back-to-back, taper on wk 7–8
 */
export function buildGetStrongerFaster8w(cfg: PlanConfig): { weeks: SkeletonWeek[]; notes: string[] } {
  const notes: string[] = [];
  const weeks: SkeletonWeek[] = [];
  const order: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const isAvail = (d: Day) => cfg.availableDays.includes(d);

  const strengthPoolId = resolveStrengthPoolId(cfg.includeStrength, cfg.strengthTrack);
  const strengthDays = deriveStrengthDays(cfg);
  const runQualityDays = deriveRunQualityDays(cfg);

  for (let w = 1; w <= 8; w++) {
    const phase: SkeletonWeek['phase'] = w <= 2 ? 'base' : w <= 6 ? 'build' : w === 7 ? 'peak' : 'taper';
    const slots: SkeletonWeek['slots'] = [];

    // Long run
    if (isAvail(cfg.longRunDay)) slots.push({ day: cfg.longRunDay, poolId: 'run_long_pool' });

    // Quality runs
    runQualityDays.forEach((day, idx) => {
      if (!isAvail(day)) return;
      const poolId = idx === 0 ? 'run_speed_vo2_pool' : 'run_threshold_pool';
      slots.push({ day, poolId });
    });

    // Strength (only if included)
    if (cfg.includeStrength && cfg.strengthDaysPerWeek > 0 && strengthPoolId) {
      strengthDays.forEach(d => {
        if (isAvail(d)) slots.push({ day: d, poolId: strengthPoolId, optional: true });
      });
    }

    // Easy runs fill rest
    order
      .filter(d => isAvail(d) && !slots.find(s => s.day === d))
      .forEach(d => slots.push({ day: d, poolId: 'run_easy_pool', optional: true }));

    const week: SkeletonWeek = {
      weekNumber: w,
      phase,
      slots,
      policies: {
        maxHardPerWeek: HardCaps.maxHardSessionsPerWeek,
        minRestGap: HardCaps.spacing.minRestGapHours,
        taperMultiplier: phase === 'taper' ? (w === 8 ? 0.5 : 0.7) : undefined
      }
    };

    // Guardrails
    const { notes: n1 } = enforceHardCap(week);
    const { notes: n2 } = enforceSpacing(week);
    notes.push(...n1.map(n => n.message), ...n2.map(n => n.message));
    weeks.push(week);
  }
  return { weeks, notes };
}

// --- helpers ---

function resolveStrengthPoolId(include: boolean, track?: StrengthTrack): string {
  if (!include) return '';
  const t = track ?? 'hybrid';
  return t === 'power'
    ? 'strength_power_pool'
    : t === 'endurance'
    ? 'strength_endurance_pool'
    : 'strength_hybrid_pool';
}

function deriveStrengthDays(cfg: PlanConfig): Day[] {
  const count = Math.max(0, Math.min(cfg.strengthDaysPerWeek, 3));
  if (!cfg.includeStrength || count === 0) return [];
  const defaults: Day[] = ['Mon','Fri','Wed'];
  const prefs = (cfg.strengthDaysPreferred ?? []).filter(d => cfg.availableDays.includes(d));
  const menu = [...prefs, ...defaults].filter((d, i, self) => self.indexOf(d) === i);
  return menu.filter(d => cfg.availableDays.includes(d)).slice(0, count);
}

function deriveRunQualityDays(cfg: PlanConfig): Day[] {
  const want = cfg.runQualityDays;
  const base: Day[] = ['Tue','Thu'];
  const out: Day[] = [];
  const order: Day[] = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  for (const d of base) {
    if (out.length >= want) break;
    if (cfg.availableDays.includes(d)) { out.push(d); continue; }
    // shift forward
    let idx = (order.indexOf(d) + 1) % 7;
    for (let k = 0; k < 7; k++) {
      const cand = order[idx] as Day;
      if (cfg.availableDays.includes(cand)) { out.push(cand); break; }
      idx = (idx + 1) % 7;
    }
  }
  return out.slice(0, want);
}


