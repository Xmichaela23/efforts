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
  /** ⛔ THE WITHIN-FAMILY VARIANT (Michael, 2026-08-24 — "missing are the speed drills we had").
   *  The slot's FAMILY is the frame's fact (A4); WHICH of the family's own workouts fills it is
   *  the athlete's. Values are the library's own archetype ids; absent = the engine's pick. */
  archetype?: string;
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

/**
 * ⛔⛔ THE SLOT'S SESSION IS THE FRAME'S FACT, NOT A CHOICE (Michael, 2026-08-24 — A4).
 *
 * The card offered top-end / sustained as buttons. **It was never the athlete's to pick.** `p246`
 * fixes the two hard slots as different families — `run_mlss` on frame day 1 and
 * `run_near_threshold` on day 3 — and the composer builds those whatever the card writes. So the
 * buttons were a control over a decision the programme had already made: tap one, and either the
 * screen or the plan was lying.
 *
 * ⛔ WHAT STAYS A REAL CONTROL IS THE CLUB SESSION, and it stays because it genuinely REPLACES the
 * slot rather than re-labelling it (his own Crit rule, work order §club). And the SPORT stays the
 * athlete's, on the slot screen. What is gone is the middle question that was never one.
 *
 * ⚠️ WITHIN-FAMILY VARIANT SELECTION IS THE ENGINE'S AND STAYS THERE (gap #5, deferred by the same
 * ruling). Which VO2 shape a hard run takes, which sweet-spot block a hard ride takes, is not asked
 * anywhere — so `RUN_GROUND_OPTIONS`' speed-versus-hill question does not reappear here.
 *
 * ⛔ THE FACT IS READ OFF THE SAME TABLES THE CARD USED TO OFFER, through `hardSlotDefault`. One
 * owner: the sentence the screen states and the value the wizard sends cannot come apart, which is
 * the failure this card has now been rebuilt three times to fix.
 */
export function hardSlotFact(
  sport: 'run' | 'ride',
  slot: HardSlotKey,
): { title: string; body: string } | null {
  const want = hardSlotDefault(sport, slot);
  const hit = hardSlotOptions(sport).find((o) => (o.goal
    ? want.goal === o.goal && want.role === o.role
    : want.role === o.role && !want.goal));
  return hit ? { title: hit.title, body: hit.body } : null;
}

/**
 * ⛔ WHY THE ATHLETE IS BEING TOLD RATHER THAN ASKED — one line, under the fact.
 *
 * ⚠️ IT NAMES THE PROGRAMME, NOT THE APP. *"The programme owns which session this is"* is the same
 * sentence the block already uses for the mileage it does not take (`generate-strength-plan`'s
 * wiring note), and it is true: the count and the family both come off p246.
 */
export const HARD_SLOT_FACT_NOTE =
  'The programme sets which session this is. Your choice here is the sport, and whether a club '
  + 'session takes the slot instead.';


// ── the within-family variants (gap #5, opened to the athlete 2026-08-24) ───────────────────────
//
// ⛔ THE OPTIONS ARE THE LIBRARY'S OWN ARCHETYPES — page-cited workouts, one list, no copy of it
// here. The slot's family is p246's (frames.ts); a ride reads the family through RIDE_EQUIVALENT,
// the same table the composer uses, so the card can never offer a workout the week cannot build.
import { FAMILIES, type FamilyId } from '../../supabase/functions/_shared/endurance-library/index.ts';
import { RIDE_EQUIVALENT } from '../../supabase/functions/_shared/standing-plan/index.ts';

/** p246: frame day 1's hard slot is MLSS+, day 3's is near-threshold. One place, cite kept. */
export const HARD_SLOT_RUN_FAMILY: Record<HardSlotKey, FamilyId> = {
  hard1: 'run_mlss',
  hard2: 'run_near_threshold',
};

export type SlotVariantOption = { id: string; label: string };

export function slotVariantOptions(key: HardSlotKey, sport: 'run' | 'ride'): SlotVariantOption[] {
  const runFam = HARD_SLOT_RUN_FAMILY[key];
  const fam = sport === 'ride' ? (RIDE_EQUIVALENT[runFam]?.family ?? runFam) : runFam;
  const rules = FAMILIES[fam];
  if (!rules) return [];
  return rules.archetypes.map((a) => ({ id: a.id, label: a.label }));
}
