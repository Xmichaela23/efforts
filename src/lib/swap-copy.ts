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

/** Basis: Viada p138 — the swap is permitted *"if you're really pushing the limits of your tolerable volume."* */
export const SWAP_HARD_RUN_TO_RIDE = 'Allowed when running is at your limit.';

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

/** The sheet's line for one option, by the key the library stamped on it. */
export const SWAP_LINE: Record<string, string> = {
  'swap.easy.pending': SWAP_EASY,
  'swap.hard_run_to_ride.pending': SWAP_HARD_RUN_TO_RIDE,
  'swap.long_day.pending': SWAP_LONG_DAY,
  'swap.machine.pending': SWAP_MACHINE,
  'swap.machine.ground_impact.pending': SWAP_MACHINE_TREADMILL,
};

/**
 * ⛔ THE TREADMILL CARRIES THE GROUND-IMPACT LINE. The library keys the treadmill as a plain machine
 * (it is the one that is never gated) and the OTHER run machines as the ground-impact case. Michael's
 * words put it the other way round: the treadmill's line is the one that says impact still counts.
 * The map above holds both keys; this reads the venue so the treadmill gets his sentence.
 */
export function swapLineFor(opt: { copyKey?: string; venue?: string }): string | null {
  if (opt.venue === 'treadmill') return SWAP_MACHINE_TREADMILL;
  return opt.copyKey ? SWAP_LINE[opt.copyKey] ?? null : null;
}

/** ⛔ THE SHEET'S HEADER (Michael, 2026-09-09). It replaced "Same day, same time. Pick the sport you
 *  want instead." — which was wrong the moment a machine could be the only option, since a machine
 *  is not a sport. */
export const SWAP_SHEET_HEADER = 'Instead:';

/** `Ride instead` / `Run instead` / `Trainer` / `Hike`. The button's own word. */
export function swapButtonLabel(opt: { kind?: string; venue?: string; to: string }): string {
  if (opt.kind === 'venue') return VENUE_LABEL[opt.venue ?? ''] ?? '';
  if (opt.kind === 'hike') return 'Hike';
  return opt.to === 'ride' ? 'Ride instead' : opt.to === 'swim' ? 'Swim instead' : 'Run instead';
}
