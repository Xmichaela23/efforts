export type WeekStartDow = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

const DOW_INDEX: Record<WeekStartDow, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODateOnly(iso: string): Date {
  const [y, m, d] = String(iso).split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function weekStartOf(focusIso: string, weekStartDow: WeekStartDow): string {
  const d = parseISODateOnly(focusIso);
  const jsDow = d.getDay(); // 0=Sun..6=Sat
  const target = DOW_INDEX[weekStartDow];
  const diff = (jsDow - target + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function resolveWeekStartDowFromPlanConfig(planConfig: any): WeekStartDow {
  const raw = String(planConfig?.plan_contract_v1?.week_start || 'mon').toLowerCase();
  if (raw === 'sun' || raw === 'mon' || raw === 'tue' || raw === 'wed' || raw === 'thu' || raw === 'fri' || raw === 'sat') {
    return raw;
  }
  return 'mon';
}

export function resolvePlanWeekIndex(
  planConfig: any,
  focusIsoDate: string,
  durationWeeks: number | null | undefined,
): number | null {
  const start = String(planConfig?.user_selected_start_date || planConfig?.start_date || '');
  if (!start) return null;
  const weekStartDow = resolveWeekStartDowFromPlanConfig(planConfig);
  const planWeek1Start = weekStartOf(start, weekStartDow);
  const a = parseISODateOnly(planWeek1Start);
  const b = parseISODateOnly(focusIsoDate);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  let weekIndex = Math.max(1, Math.floor(diffDays / 7) + 1);
  if (durationWeeks && durationWeeks > 0) {
    weekIndex = Math.min(weekIndex, durationWeeks);
  }
  return weekIndex;
}

export function isPlanTransitionWindowByWeekIndex(weekIndex: number | null | undefined): boolean {
  const w = Number(weekIndex);
  if (!Number.isFinite(w)) return false;
  return w >= 1 && w <= 2;
}
