/**
 * ⛔ STATE FOLLOWS WHAT THE PLAN HAS YOU LIFTING (Michael, 2026-09-29: "it should just know what you're doing and focus
 * on that"). The lift cards and "your best sets" list only the movements the active plan puts on the calendar now —
 * a swap included, because `materialize-plan` writes the substitute onto the planned row (`resolveLiftSwap`). A lift
 * the plan no longer has leaves State; its history stays in `exercise_log` and comes back when a plan has it again.
 *
 * FIELD: JuggernautAI's home screen shows its programme's squat, bench and deadlift; StrongLifts' Progress tab lists
 * its programme's lifts. Neither documents following a swap; this does, because the planned row already carries it.
 *
 * No active plan, or no lifting on it → null, and every reader keeps its old list (nothing is filtered).
 */
import { canonicalize } from '../_shared/canonicalize.ts';

/** OURS — the plan window read for "the lifts you are doing now": this week and the three after it. A rotation that
 *  puts a lift on alternate weeks (DE / ME) still lands in four weeks. */
export const PLAN_LIFTS_WEEKS = 4;

export interface PlanLifts {
  /** Canonical keys (`canonicalize`) of every movement on the plan's strength rows in the window. */
  canonicals: Set<string>;
  /** The plan's first planned day — where a lift's "start" line begins. Null when unknown. */
  startDate: string | null;
}

function plusDays(ymd: string, days: number): string {
  return new Date(new Date(ymd + 'T12:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function loadPlanLifts(
  supabase: any,
  userId: string,
  planIds: string[],
  fromDate: string,
): Promise<PlanLifts | null> {
  if (!planIds.length) return null;
  try {
    const [{ data: rows }, { data: first }] = await Promise.all([
      supabase.from('planned_workouts').select('strength_exercises')
        .eq('user_id', userId).in('training_plan_id', planIds).eq('type', 'strength')
        .gte('date', fromDate).lt('date', plusDays(fromDate, PLAN_LIFTS_WEEKS * 7)),
      supabase.from('planned_workouts').select('date')
        .eq('user_id', userId).in('training_plan_id', planIds).eq('type', 'strength')
        .order('date', { ascending: true }).limit(1),
    ]);
    const canonicals = new Set<string>();
    for (const r of Array.isArray(rows) ? rows : []) {
      for (const ex of Array.isArray(r?.strength_exercises) ? r.strength_exercises : []) {
        const k = canonicalize(String(ex?.name ?? ''));
        if (k && k !== 'unknown') canonicals.add(k);
      }
    }
    if (canonicals.size === 0) return null;
    const startDate = Array.isArray(first) && first[0]?.date ? String(first[0].date).slice(0, 10) : null;
    return { canonicals, startDate };
  } catch (e) {
    console.warn('[coach] plan lifts read failed — State lists every lift:', e);
    return null;
  }
}

/** The lift cards: a main-lift card only when the plan has that lift. Other rows pass through untouched. */
export function displayFollowingPlan<T>(display: T, plan: PlanLifts | null): T {
  const d = display as any;
  const perLift = d?.strengthFitness?.perLift;
  if (!plan || !Array.isArray(perLift)) return display;
  return {
    ...d,
    strengthFitness: {
      ...d.strengthFitness,
      perLift: perLift.filter((l: any) => !l?.isPrimary || plan.canonicals.has(String(l?.canonical ?? ''))),
    },
  } as T;
}
