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

/**
 * Has the plan actually started as of `asOfIso`? `resolvePlanWeekIndex` clamps pre-start weeks to 1
 * (`Math.max(1, …)`), so a plan starting NEXT week reads as "week 1" — which the narrative then asserts
 * as "one week into the block" and treats this week's off-plan sessions AS the block. This is the
 * ground-truth gate: false when today is before plan-week-1 start, so pre-start is narrated as pre-start.
 * No explicit start date → true (don't force pre-start; preserve legacy active-plan narration).
 */
export function planHasStarted(planConfig: any, asOfIso: string): boolean {
  const start = String(planConfig?.user_selected_start_date || planConfig?.start_date || '');
  if (!start) return true;
  const planWeek1Start = weekStartOf(start, resolveWeekStartDowFromPlanConfig(planConfig));
  return String(asOfIso) >= planWeek1Start; // YYYY-MM-DD lexical compare == chronological
}

/** The plan's week-1 start date (ISO), or null when no start date is set. */
export function planWeek1StartIso(planConfig: any): string | null {
  const start = String(planConfig?.user_selected_start_date || planConfig?.start_date || '');
  if (!start) return null;
  return weekStartOf(start, resolveWeekStartDowFromPlanConfig(planConfig));
}

/**
 * The plan-context line for the coach narrative — grounded in whether the plan has started (D-232
 * claim-grounding). Pre-start → NO "week N" / in-block claim; the LLM is told these sessions are
 * pre-plan and to narrate the lead-in. Started → the normal in-block phase line.
 */
export function buildPlanContextLine(args: {
  planName: string;
  totalWeeks: number | null;
  weekIndex: number | null;
  weekIntent: string | null;
  hasStarted: boolean;
  planStartDisplay: string | null; // e.g. "Monday, Jul 7"
}): string {
  const { planName, totalWeeks, weekIndex, weekIntent, hasStarted, planStartDisplay } = args;
  const wk = totalWeeks ? ` (${totalWeeks} weeks total)` : '';
  if (!hasStarted) {
    const when = planStartDisplay ? ` It begins ${planStartDisplay}.` : '';
    return `The athlete's plan "${planName}"${wk} has NOT started yet.${when} This week's sessions are PRE-PLAN (off-plan / unplanned), NOT part of the block. Do NOT say the athlete is "in week N" or "N weeks into" the plan, and do NOT frame this week's sessions as the block — narrate this as the lead-in to the plan starting.`;
  }
  let line = `The athlete is on "${planName}"${wk}, currently in week ${weekIndex ?? '?'}`;
  if (weekIntent && weekIntent !== 'unknown') line += ` which is a ${weekIntent} week`;
  line += '. Plan phase (taper / peak / build / recovery / baseline) is defined by the plan contract (PlanContractV1); do not rename it or infer it only from training volume or missed sessions.';
  return line;
}
