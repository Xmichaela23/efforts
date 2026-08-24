/**
 * THE HARD SLOT'S OPTION LIST AND ITS DEFAULT — the logic half of `HardSlotChoices.tsx`.
 *
 * ⚠️ ITS OWN FILE because a component file that also exports helpers breaks fast refresh, and
 * because these two are testable without React.
 */
import { singleSlotOptions } from './hard-day-menus';

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
/**
 * ⛔ BOTH SPORTS USE `singleSlotOptions` NOW (2026-08-24). The run arm read `RUN_GROUND_OPTIONS` —
 * VO2 and speed, two options — and that list has **no sustained-threshold entry**. The frame's
 * SECOND hard slot is `run_near_threshold`: the composer builds it as `cruise_..._threshold` and
 * names it "Threshold Run". So the screen offered no label for the session that slot actually is, and
 * whatever the athlete picked, the row described a different week from the one being built.
 * `singleSlotOptions('run')` carries all three, and its copy is pinned to the same sessions.
 */
export function hardSlotOptions(sport: 'run' | 'ride') {
  return singleSlotOptions(sport === 'ride' ? 'bike' : 'run').map((o) => ({
    id: o.id, title: o.title, body: o.body, role: o.role, goal: o.goal,
  }));
}

/**
 * ⛔⛔ THE TWO HARD SLOTS ARE DIFFERENT SESSIONS, AND THE SCREEN SAID THEY WERE THE SAME (Michael's
 * phone screenshot, 2026-08-24 evening). Both rows read *"Hard session · Ride · Sustained
 * threshold"*, which misstates the week the composer builds.
 *
 * ⛔ **CHECKED AGAINST THE ENGINE, NOT GUESSED.** `strength_5k`'s two hard days are distinct
 * families, and the ride substitution keeps them distinct:
 *
 *     frame day 1  run_mlss            → ride_sweet_spot/medium → `bike_thr_7x3min_R2min`   95-105% FTP
 *     frame day 3  run_near_threshold  → ride_sweet_spot/long   → `bike_ss_4x10min_R4min`   85-95% FTP
 *
 * On the run the same pair builds `interval_..._5kpace` ("Hard Run") and `cruise_..._threshold`
 * ("Threshold Run"). ⛔ **So slot ONE is the top-end session and slot TWO is the sustained one** —
 * the opposite of what the screen defaulted slot one to.
 *
 * ⚠️ `slot` IS REQUIRED. A default keyed on sport alone is what produced two identical rows; there is
 * no such thing as "the default hard session" on this frame, only the default for a given slot.
 */
export type HardSlotKey = 'hard1' | 'hard2';

export function hardSlotDefault(sport: 'run' | 'ride', slot: HardSlotKey = 'hard1'): HardSlotValue {
  // ⛔ SLOT TWO IS THE SUSTAINED ONE, on either sport — `run_near_threshold` / the sweet-spot blocks.
  if (slot === 'hard2') return { role: 'threshold', ownership: 'prescribed' };
  // ⛔ SLOT ONE IS THE TOP-END ONE — `run_mlss` / the 95-105% FTP intervals. On the run that is the
  // VO2 option (its own table calls it "Recommended"); on the ride it is Helgerud's 4 × 4.
  return sport === 'ride'
    ? { role: 'intensity', ownership: 'prescribed' }
    : { role: 'intensity', goal: 'vo2', ownership: 'prescribed' };
}

export function hardSlotTitle(sport: 'run' | 'ride', value: HardSlotValue): string | null {
  if (value.ownership === 'club') return 'Club session';
  const hit = hardSlotOptions(sport).find((o) => (o.goal
    ? value.goal === o.goal && value.role === o.role
    : value.role === o.role && !value.goal));
  return hit?.title ?? null;
}
