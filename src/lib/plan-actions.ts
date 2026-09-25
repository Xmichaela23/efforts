/**
 * ⛔ THE TWO PLAN ACTIONS THE ADJUST TAB AND BASELINES BOTH OFFER (2026-09-20). One owner each, so the two screens
 * cannot drift: a retest that opens today in the logger, and the rewrite of the sessions not started yet.
 *
 * Michael, 2026-09-20, on the Strength card of Baselines: "retest x 2, rebuild x 1 (if you manually change), then
 * equipment rebuild" — real buttons where the change is made, in place of the "Retest or rebuild on Adjust" link.
 */
import { supabase } from '@/lib/supabase';

export type RebuildResult = 'rebuilt' | 'nothing' | 'failed';

/**
 * Rewrites the sessions not started yet from the plan. `useCurrentEquipment` also takes the equipment now on
 * Baselines and stores it as the block's own (`rematerialize-standing-block`, `use_current_equipment`); without it the
 * block keeps the kit it has, because new equipment can change which movement a session uses.
 */
export async function rebuildUpcomingSessions(opts: { useCurrentEquipment?: boolean; deadliftForm?: 'barbell' | 'trap_bar' } = {}): Promise<RebuildResult> {
  try {
    const { data, error } = await supabase.functions.invoke('rematerialize-standing-block', {
      body: { apply: true, ...(opts.useCurrentEquipment ? { use_current_equipment: true } : {}), ...(opts.deadliftForm ? { deadlift_form: opts.deadliftForm } : {}) },
    });
    if (error) throw error;
    window.dispatchEvent(new CustomEvent('week:invalidate'));
    return (data as { success?: boolean } | null)?.success ? 'rebuilt' : 'nothing';
  } catch (e) {
    console.warn('[plan-actions] rebuild failed:', e);
    return 'failed';
  }
}

/** The words each result prints under the button (server-side copy does not exist for these; Adjust's own words). */
export const REBUILD_NOTE: Record<RebuildResult, string> = {
  rebuilt: 'Upcoming sessions rebuilt from the plan.',
  nothing: 'Nothing to rebuild.',
  failed: 'Could not rebuild. Try again.',
};

/**
 * A retest of the lower or the upper lifts: the server puts the test session on today's calendar and the logger opens
 * on it. With no standing plan to put it on, the Baselines test launcher opens instead.
 */
export async function openLiftRetest(which: 'Lower' | 'Upper'): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('rematerialize-standing-block', { body: { schedule_retest: which.toLowerCase() } });
    const d = data as { success?: boolean; planned?: unknown } | null;
    if (!error && d?.success && d?.planned) {
      window.dispatchEvent(new CustomEvent('open:strengthLogger', { detail: { planned: d.planned } }));
      window.dispatchEvent(new CustomEvent('week:invalidate'));
      return;
    }
  } catch (e) { console.warn('[plan-actions] retest row failed:', e); }
  window.dispatchEvent(new CustomEvent('baselines:openTest', { detail: { testName: `Baseline Test: ${which}` } }));
}
