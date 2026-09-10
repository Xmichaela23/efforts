/**
 * ═══ THE SWAP SHEET'S WORDS ══════════════════════════════════════════════════════════════════════
 *
 * docs/WORKORDER-endurance-swaps-2026-09-09.md. ⛔ EVERY LINE HERE IS MICHAEL'S, GIVEN 2026-09-09,
 * and each carries the page it came from IN THE CODE. Nothing else may be added: a swap whose line
 * he has not written is not offered.
 *
 * ⛔⛔ THE PAGE NUMBERS ARE NOT ON THE SCREEN. He wrote them beside the lines — "(p137)", "(p138)",
 * "(p275)" — and his own standing rule is that a citation lives in the ledger and never in the copy:
 * state the rule in the athlete's terms, not the book's. The parentheticals are therefore read as
 * the source note they are, and kept here rather than printed. ⚠️ IF HE MEANT THEM ON SCREEN, that
 * is a one-word change per line and this comment is where to look first.
 */

/** Basis: Viada p137 — *"when in doubt, use cross-training for easy work, not threshold or sprint work."* */
export const SWAP_EASY = 'Easy work can be any sport. Hard work cannot.';

/**
 * Basis: Viada p138 — the swap is permitted *"if you're really pushing the limits of your tolerable
 * volume."*
 *
 * ⛔ REWRITTEN ON THE DEVICE (§8, APPROVED 2026-09-09). It read *"Allowed when running is at your
 * limit."* — a permission slip, which told the athlete the rule and not the session. The line now
 * names WHAT the option is before it names when to take it, which is the order every other line on
 * this sheet already uses.
 */
export const SWAP_HARD_RUN_TO_RIDE =
  "The plan's hard ride. For when running is at your limit but you want to push.";

/** Basis: Viada p275 — *"a hike, a long ride, a team sport day, or whatever else is of interest."* */
export const SWAP_LONG_DAY = 'A long ride or a hike counts as the long day.';

/** Basis: Viada p275 — the same session on a machine, *"as long as you know your threshold on it."* */
export const SWAP_MACHINE = 'Same session, indoors.';

/**
 * Basis: Viada p275 — *"impact with the ground on at least one day"* a week.
 * ⚠️ THE TREADMILL IS THE ONE RUN MACHINE THAT KEEPS IT, which is why its line says so rather than
 * warning the athlete off.
 */
export const SWAP_MACHINE_TREADMILL = 'Same session, indoors. Ground impact still counts.';

/**
 * The machine's name, beside the session's. ⛔ TWO MACHINES, AND THE OTHER FIVE ARE CUT (Michael,
 * 2026-09-09) — p275's rower, ski erg, air bike, elliptical and arc trainer are not in the app.
 */
export const VENUE_LABEL: Record<string, string> = {
  trainer: 'Trainer',
  treadmill: 'Treadmill',
};

/**
 * ⛔ THE WAY BACK (§8, APPROVED 2026-09-09). One line under both revert options — the sport swap's
 * and the machine's — because it is one promise: the row the plan authored, as it authored it.
 */
export const SWAP_BACK_TO_PLAN = 'Back to the plan.';

/**
 * ⛔ THE MACHINE'S WAY BACK IS A PLACE, NOT A SPORT (§8, APPROVED). A trainer ride reverting is not
 * "Ride instead" — the sport never changed — so the option is named for the only thing that did.
 */
export const VENUE_OUTDOORS = 'Outdoors';

/** The sheet's line for one option, by the key the library stamped on it. */
export const SWAP_LINE: Record<string, string> = {
  'swap.easy.pending': SWAP_EASY,
  'swap.hard_run_to_ride.pending': SWAP_HARD_RUN_TO_RIDE,
  'swap.long_day.pending': SWAP_LONG_DAY,
  'swap.machine.pending': SWAP_MACHINE,
  'swap.machine.ground_impact.pending': SWAP_MACHINE_TREADMILL,
  'swap.back_to_plan': SWAP_BACK_TO_PLAN,
};

/**
 * ⛔ THE TREADMILL CARRIES THE GROUND-IMPACT LINE. The library keys the treadmill as a plain machine
 * (it is the one that is never gated) and the OTHER run machines as the ground-impact case. Michael's
 * words put it the other way round: the treadmill's line is the one that says impact still counts.
 * The map above holds both keys; this reads the venue so the treadmill gets his sentence.
 */
export function swapLineFor(opt: { kind?: string; copyKey?: string; venue?: string }): string | null {
  // ⚠️ THE REVERT IS CHECKED FIRST, and it has to be: a trainer's revert carries `venue: 'trainer'`
  // and would otherwise fall through to the machine's own line — the sentence for going indoors,
  // printed under the button for coming back out.
  if (opt.kind === 'revert') return SWAP_BACK_TO_PLAN;
  if (opt.venue === 'treadmill') return SWAP_MACHINE_TREADMILL;
  return opt.copyKey ? SWAP_LINE[opt.copyKey] ?? null : null;
}

/** ⛔ THE SHEET'S HEADER (Michael, 2026-09-09). It replaced "Same day, same time. Pick the sport you
 *  want instead." — which was wrong the moment a machine could be the only option, since a machine
 *  is not a sport. */
export const SWAP_SHEET_HEADER = 'Instead:';

/** `Ride instead` / `Run instead` / `Trainer` / `Hike`. The button's own word. */
export function swapButtonLabel(opt: { kind?: string; venue?: string; to: string; label?: string }): string {
  /**
   * ⛔ THE REVERT WEARS THE ORIGINAL SESSION'S OWN NAME (§8), which is data and not copy — the
   * library reads it off the row and hands it over as `label`. A machine's revert has no session
   * name to wear, because a machine never changed the session: it is `Outdoors`.
   */
  if (opt.kind === 'revert') return opt.venue ? VENUE_OUTDOORS : (opt.label ?? '');
  if (opt.kind === 'venue') return VENUE_LABEL[opt.venue ?? ''] ?? '';
  if (opt.kind === 'hike') return 'Hike';
  return opt.to === 'ride' ? 'Ride instead' : opt.to === 'swim' ? 'Swim instead' : 'Run instead';
}
