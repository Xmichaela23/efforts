/**
 * The words after "Week N · " on Today's date line (Michael, 2026-09-10).
 *
 * ⛔ A STANDING PLAN IS NAMED, NOT PHASED. It has no build or peak — its phase structure is Test,
 * then Base with an optional Taper column — so the phase word said "Base" every week and the
 * right-aligned block label said "Build block" off the athlete's identity, neither of which is what
 * the plan is. The line now reads:
 *   · the test week             → "Test"
 *   · a taper-column week       → "Light week"
 *   · every other week          → the plan's own name ("Standard Focus")
 * and `standingPlan` tells Today not to print a block label beside it.
 *
 * ⚠️ RACE PLANS KEEP THEIR PHASE: the label is the phase word `get-week` already resolved
 * (`resolveBlockIdentity`), unchanged.
 *
 * ⚠️ ONE TEST-WEEK RULE: `isTestWeek` from `_shared/standing-plan/working-number.ts`, the definition
 * the composer builds week one from. The taper weeks are the plan's own `standing_plan.taper_weeks`.
 */
import { isTestWeek } from '../_shared/standing-plan/working-number.ts';

export type WeekLabel = { label: string | null; standingPlan: boolean };

export function weekLabelFor(input: {
  config: Record<string, unknown> | null | undefined;
  planName: string | null | undefined;
  week: number;
  phaseFocus: string | null | undefined;
}): WeekLabel {
  const sp = input.config?.standing_plan;
  if (sp && typeof sp === 'object') {
    if (isTestWeek(input.week)) return { label: 'Test', standingPlan: true };
    const taper = Array.isArray((sp as { taper_weeks?: unknown }).taper_weeks)
      ? ((sp as { taper_weeks: unknown[] }).taper_weeks).map(Number)
      : [];
    if (taper.includes(input.week)) return { label: 'Light week', standingPlan: true };
    const name = typeof input.planName === 'string' ? input.planName.trim() : '';
    return { label: name || null, standingPlan: true };
  }
  const focus = typeof input.phaseFocus === 'string' ? input.phaseFocus.trim() : '';
  return { label: focus || null, standingPlan: false };
}
