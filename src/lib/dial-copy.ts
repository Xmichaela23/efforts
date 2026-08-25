/**
 * ============================================================================
 * THE DIAL SCREEN'S ATHLETE-FACING COPY — client-only, and that is why it is here.
 *
 * ⛔ IT MOVED OUT OF `_shared/standing-plan/accessory-picks.ts` (2026-08-24, second copy round).
 * These strings are rendered by the wizard and by nothing else — no edge function has ever read
 * one. Living in a `_shared` file made every copy tweak a change to a file four edge functions
 * bundle, which is a deploy nobody needed and a `_shared`-trap risk for no gain. The TABLE stays
 * shared (the composer needs it); the PROSE is the client's.
 *
 * ⚠️ SO THE DAYS AND THE BANDS ARE STILL READ, NOT TRANSCRIBED. `daysForPick` and
 * `WEEKLY_SETS_SOLID` are imported from the shared modules that own them. A second hand-written
 * day list is exactly how the picker and the week came apart the first time.
 *
 * ⚠️ RELATIVE IMPORTS, NOT THE `@shared` ALIAS, and that is deliberate — the `src/lib` convention
 * (`hard-slot-choices.ts`, `assistance-catalog.ts`). Vite resolves both; **Deno resolves only the
 * relative form**, and this file has a test that must run under `deno test`.
 *
 * ============================================================================
 * ⛔ THE COPY PATTERN FOR THIS SCREEN, RULED BY MICHAEL 2026-08-24 (D-450). It governs every line
 * added here from now on:
 *
 *   (a) INLINE COPY IS ONE LINE PER ELEMENT — what it does, never how it works. Progressive
 *       overload, why volume moves, the recovery arithmetic: all of it belongs behind an (i) or an
 *       expandable row, NEVER inline. ⚠️ The (i) is NOT built. It gets built if and when a screen
 *       actually needs one — do not add one speculatively to have somewhere to put a paragraph.
 *       If a line will not fit in one, the line is wrong, not the rule.
 *
 *   (b) WHEN A DRAWER IS BUILT, ITS CONTENT IS AUTHORED AND STATIC — written copy, traceable to a
 *       page (Viada p086, p218, p223), the same as every other line in the app. Never
 *       LLM-generated, never generic training-blog filler. **If a fact cannot be cited, it does
 *       not go in the drawer.**
 *
 * ⛔ AND NO ENGINE VOCABULARY REACHES THE ATHLETE HERE. "Slot", "cell", "the muscle floor", "the
 * pull-back", "column", "frame" are how this app talks to itself. The screenshots that triggered
 * this round had the word "slot" in four places and a sentence beginning "The week has no glute
 * slot" — which is a true statement about a data structure and gibberish about training.
 * ============================================================================
 */
import {
  DIAL_LABEL,
  DIAL_OWNERSHIP,
  VIADA_PICKS,
  VIADA_PICK_KEYS,
  daysForPick,
  dialRowOptions,
  movementLabel,
  type DialChip,
} from '../../supabase/functions/_shared/standing-plan/accessory-picks.ts';
import { WEEKLY_SETS_SOLID } from '../../supabase/functions/_shared/accessory-dosing/index.ts';
import { WEEKDAYS } from '../../supabase/functions/_shared/standing-plan/day-map.ts';

/**
 * ⛔ THE SCREEN'S SUBTITLE — Michael's wording, verbatim (2026-08-24).
 *
 * ⚠️ IT REPLACED "The programme owns the slots. You pick what fills them." The old line was true and
 * it taught the athlete a word from the engine's vocabulary in the first sentence of the screen.
 * The word "slot" is not to appear anywhere athlete-facing on this screen.
 */
export const ACCESSORY_SUBTITLE =
  'Every day focuses on a compound lift. The additional accessory fine-tunes the muscle work.';

/** The Dial's sub-line. Michael's wording, verbatim; trips the voice lint on `focus` by design. */
export const DIAL_SUBLINE = 'Dial in the areas you want to focus on.';

/**
 * ⛔ THE CAP NOTE, WITHOUT ITS ARITHMETIC (Michael, 2026-08-24). It used to read *"The upper lifting
 * days already carry seven to nine work sets, and past fourteen in a session the next day's run is
 * measurably down for up to three days."* — every number of which is real (p086) and none of which
 * an athlete asked for while tapping a second chip. **The numbers live in code comments and D-450.**
 */
export const DIAL_CAP_NOTE =
  'Two at a time — past that the lifting days get big enough to cost the next day’s run.';

/**
 * ⛔ THE CORE PICK'S NOTE (Michael, 2026-08-24). Replaced a three-clause explanation that named the
 * source, the absence of a core slot, and "the four movement patterns" — sourcing talk, engine
 * vocabulary, and a taxonomy, under a dropdown. What the athlete needs is what the control does.
 */
export const CORE_PICK_NOTE = 'This pick is the movement your weekly core work uses.';

/**
 * ⛔ THE DOSE LINE, RECONCILED (Michael, 2026-08-24). It said *"sets of 6-12"* while the rows on the
 * same screen said *"3 x 8-10"* — two dose claims one scroll apart, and the rows were the right one.
 * p086's accessory prescription is 3 x 8-10 at 1-2 RIR.
 *
 * ⚠️ IT IS KEPT RATHER THAN DELETED, and that is a judgement call worth stating: the rows print
 * "3 x 8-10" only for the Glutes and Core extra rows, so this is the ONLY place the seven picks'
 * own dose is stated. Deleting it would have removed the RIR instruction from the screen entirely,
 * and "how close to failure" is the part of an accessory prescription an athlete actually gets
 * wrong. Reversible if Michael reads it as still half-repeating the rows.
 */
export const ACCESSORY_DOSE_LINE =
  'Accessory sets are 8 to 10 reps with a rep or two left in the tank. Going to failure costs the '
  + 'next main lift.';

/**
 * ⛔ ONE LINE PER ACTIVE CHIP. ONE. (Michael, 2026-08-24.)
 *
 * What this replaced, per chip, was a paragraph assembled from three clauses — which days carry the
 * slots, how the extra rows are dosed, and the pull-back — and with two chips tapped the screen
 * showed two paragraphs. The shape is now fixed and identical for every chip:
 *
 *     `{Muscle} — {what changes}, toward {8-12} a week. Light weeks carry less.`
 *
 * ⚠️ "Light weeks carry less" IS THE PULL-BACK, AND IT IS NOT DECORATION. A deload week, or an
 * athlete whose logged running has already earned an extra easy session, gets visibly fewer added
 * sets than the chip implied. Unsaid, that reads as the control being broken — which is the whole
 * reason the long version existed. It just did not need three clauses to say it.
 *
 * ⛔ WHAT IS GONE AND STAYS GONE: "the week has no X slot", "arrives as extra sets rather than a
 * bigger one", and "if your logged running already earns the extra easy session". The first two are
 * the engine describing its own data structure; the third states a branch the WIZARD CANNOT KNOW IT
 * IS ON — the advanced tier gates on demonstrated running the server reads out of logged history,
 * and a number typed into an intake box is not that fact.
 */
export function dialChipLine(
  chip: DialChip,
  opts: { equipment?: string[] | null; movement?: string | null } = {},
): string {
  const label = DIAL_LABEL[chip];
  const band = `${WEEKLY_SETS_SOLID.lo}-${WEEKLY_SETS_SOLID.hi}`;

  // Which real days this chip reaches — read off the frame through the picks it re-points, never
  // transcribed. A chip that reaches no day is a chip whose muscle has no place in the week's
  // layout, and it arrives as its own added rows instead.
  const days = [...new Set(
    VIADA_PICK_KEYS
      .filter((k) => VIADA_PICKS[k].servesChips.includes(chip))
      .flatMap((k) => daysForPick(k)),
  )]
    // ⚠️ IN WEEK ORDER, NOT IN PICK-TABLE ORDER. Chest is served by a Thursday pick before a Monday
    // one, so the raw order reads "Thursday and Monday", which looks like a mistake. This sort was
    // in the sentence this replaced and was dropped in the rewrite; the copy gate caught it.
    .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));

  if (days.length > 0) {
    // ⚠️ SINGULAR — `DIAL_OWNERSHIP`, not the chip's plural label. "more shoulders work" and "more
    // arms work" read as typos, and this is the same singular the plan rows use, so the screen and
    // the built block name the thing identically.
    return `${label} — more ${DIAL_OWNERSHIP[chip]} work on ${joinDays(days)}, toward ${band} a `
      + 'week. Light weeks carry less.';
  }

  // ⚠️ THE MOVEMENT IS NAMED BECAUSE THE ATHLETE CHOSE IT one control below. "Extra sets" is vague
  // where "extra Hip Thrust sets" is the same length and answers the question.
  const chosen = opts.movement?.trim()
    || dialRowOptions(chip, opts.equipment ?? null)[0]?.name
    || '';
  const named = chosen ? `${movementLabel(chosen)} ` : '';
  return `${label} — extra ${named}sets on your lifting days, toward ${band} a week. `
    + 'Light weeks carry less.';
}

/** `['Monday','Thursday']` → `Monday and Thursday`. Three or more take an Oxford-free list. */
function joinDays(days: string[]): string {
  if (days.length <= 1) return days[0] ?? '';
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}
