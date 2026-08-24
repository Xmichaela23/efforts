/**
 * THE HARD SLOT'S OPTION LIST AND ITS DEFAULT — the logic half of `HardSlotChoices.tsx`.
 *
 * ⚠️ ITS OWN FILE because a component file that also exports helpers breaks fast refresh, and
 * because these two are testable without React.
 */
import { RUN_GROUND_OPTIONS, singleSlotOptions } from './hard-day-menus';

export type HardSlotValue = {
  role?: 'intensity' | 'threshold';
  goal?: 'speed' | 'vo2';
  ownership?: 'prescribed' | 'club';
};

/**
 * ⛔ MICHAEL'S OWN LISTS (2026-08-24). A ride offers top-end and sustained threshold; a run offers
 * VO2 and speed. Both then offer the club session as a third answer.
 *
 * ⚠️ THE COPY IS THE EXISTING TABLES', VERBATIM — those strings are pinned to the sessions the
 * composer actually builds (`SESSION_PRESCRIPTION`'s own warning: *"if those tables move, these move
 * with them or the card starts lying about the block it just sold"*).
 */
export function hardSlotOptions(sport: 'run' | 'ride') {
  return sport === 'ride'
    ? singleSlotOptions('bike').map((o) => ({
        id: o.id, title: o.title, body: o.body, role: o.role, goal: o.goal,
      }))
    : RUN_GROUND_OPTIONS.map((o) => ({
        id: o.id,
        title: o.title,
        body: o.body,
        role: 'intensity' as const,
        goal: o.id as 'speed' | 'vo2',
      }));
}

/**
 * ⛔ THE DEFAULT SESSION PER SPORT (Michael, 2026-08-24): a ride defaults to **sustained threshold**,
 * a run to **VO2**. ⚠️ Both are the option their own table already marks "Recommended", so the
 * pre-selection is not a new opinion.
 */
export function hardSlotDefault(sport: 'run' | 'ride'): HardSlotValue {
  return sport === 'ride'
    ? { role: 'threshold', ownership: 'prescribed' }
    : { role: 'intensity', goal: 'vo2', ownership: 'prescribed' };
}

