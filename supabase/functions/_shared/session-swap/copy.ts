/**
 * ═══ THE SWAP SHEET'S WORDS ══════════════════════════════════════════════════════════════════════
 *
 * ⛔ MOVED TO THE SERVER UNCHANGED (2026-09-10, audit H-T15) — was `src/lib/swap-copy.ts`. `swap-session`
 * sends these words with each option; the phone reads only `VENUE_LABEL`, for a row already indoors.
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
  /**
   * ⛔ A SPORT SWAP AND THE HIKE HAVE NO FIXED LINE ANY MORE (2026-09-10). Their line is the session
   * handed over — `swapSessionLine`, resolved by `SwapPreviewLine` against `resolveSwapWrite`. A
   * fixed sentence here would be the permission rule the sheet no longer prints.
   */
  if ((opt.kind ?? 'discipline') === 'discipline' || opt.kind === 'hike') return null;
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

/**
 * ═══ THE LINE UNDER A SPORT SWAP IS THE SESSION YOU GET (Michael, 2026-09-10) ════════════════════
 *
 * `[Name], [length]. Takes this [ride/run]'s place.` — built from the session the swap actually hands
 * over, which `resolveSwapWrite` resolves: the athlete's own composed row of the target family when
 * the plan has one, the library's session for their level when it does not. The sheet asks that one
 * resolver rather than guessing, so the line and the row the tap writes cannot disagree.
 *
 * ⛔ IT REPLACES THE PERMISSION SENTENCES. "Easy work can be any sport. Hard work cannot." and "The
 * plan's hard ride. For when running is at your limit but you want to push." told the athlete a rule;
 * this tells them what they will be doing, which is the thing they are choosing between.
 *
 * ⚠️ THE LENGTH READS TWO WAYS ON PURPOSE, per the approved examples: minutes for an ordinary session
 * (`Easy Run, 45 min.`, `Anaerobic Ride, 66 min.`), hours and minutes for the long day (`Long Run,
 * 1h 55m.`, `Hike, 2h 45m.`), where a figure in the hundreds of minutes is the one nobody reads.
 */
export function swapSessionLine(args: {
  name: string;
  minutes: number;
  /** The long day prints hours and minutes. */
  long: boolean;
  /** The sport of the session being REPLACED — the one whose place is taken. */
  replacing: 'ride' | 'run' | 'swim';
}): string | null {
  const name = String(args.name ?? '').trim();
  const mins = Math.round(Number(args.minutes));
  if (!name || !Number.isFinite(mins) || mins <= 0) return null;
  const length = args.long
    ? `${Math.floor(mins / 60) > 0 ? `${Math.floor(mins / 60)}h ` : ''}${String(mins % 60).padStart(Math.floor(mins / 60) > 0 ? 2 : 1, '0')}m`
    : `${mins} min`;
  return `${name}, ${length}. Takes this ${args.replacing}'s place.`;
}
