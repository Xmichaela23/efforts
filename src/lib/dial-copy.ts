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
  DIAL_CAP,
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

/**
 * ⛔ THE DIAL'S SUB-LINE. Michael's wording, verbatim; trips the voice lint on `focus` by design.
 *
 * ⛔ THE NUMBER IS INTERPOLATED FROM `DIAL_CAP`, NOT TYPED (2026-08-25). The line now states the cap
 * — "the 2 areas" — and the chip row prints `n/2` from the same constant one element away. A copy
 * string carrying its own hand-written 2 is the "score that lies" shape this repo keeps finding: the
 * day the cap moves, the sentence goes on confidently naming the old one.
 *
 * ⚠️ IT RESOLVES TO EXACTLY MICHAEL'S SENTENCE TODAY, and a test pins that string as well as the
 * derivation, so this is not a licence to reword it.
 */
export const DIAL_SUBLINE =
  `Swap exercises per your preference or add work for ${DIAL_CAP} areas you want to focus on.`;

/**
 * ⛔ THE CAP NOTE, WITHOUT ITS ARITHMETIC (Michael, 2026-08-24). It used to read *"The upper lifting
 * days already carry seven to nine work sets, and past fourteen in a session the next day's run is
 * measurably down for up to three days."* — every number of which is real (p086) and none of which
 * an athlete asked for while tapping a second chip. **The numbers live in code comments and D-450.**
 */
export const DIAL_CAP_NOTE =
  'Two at a time — past that the lifting days get big enough to cost the next day’s run.';

/**
 * ⛔⛔ THE DIAL'S CONTROL IS OFF THE SCREEN — HIDDEN, NOT DELETED (Michael, 2026-08-26).
 *
 * His words: *"pills go away"*, and before that *"I think we couch the pills FOR NOW, get the plan
 * closest to his working"*. **"For now" is his word**, which is why this is a switch and not a
 * deletion: the chips, their copy, `dialChipLine`, `defaultViadaPicks`'s chip handling and the
 * composer's dial paths all stay wired and tested. Flipping this back is the whole restoration.
 *
 * ⛔ WHY IT WAS NOT EARNING ITS PLACE, recorded so it is not re-derived from the screen. Every chip
 * raises a WEEKLY SET TARGET for a muscle. Chest, Shoulders and Arms already have picker rows on
 * that screen, so their extra sets land on an existing row and nothing visibly happens. Glutes had
 * no row, so filling its target CREATED one. **Same mechanism, two different screens** — which read
 * as "glutes works, core is broken" when both were doing exactly the same thing. Michael's call was
 * to take the CONTROL off rather than fix the display, for now.
 *
 * ⚠️ NOTHING ELSE HAD TO CHANGE, and that is measured rather than assumed: the wizard opens with
 * `dial: []`, so with no control the value stays empty and the composer's dial branches are never
 * entered. There is no dial stored from a previous block to strand.
 */
export const DIAL_CONTROL_VISIBLE = false;

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
 *     `{Muscle} — {what changes}, toward {8-12} a week. {whose movement it is}. Light weeks carry less.`
 *
 * ⛔ THE MIDDLE SENTENCE IS THE 2026-08-25 ADDITION and it is not filler: the line NAMES a movement,
 * and on a device that read as the app's decision rather than as its opening offer. The row that
 * changes it is directly below and nothing said so.
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

  // ⛔ THE OWNERSHIP SENTENCE (Michael, 2026-08-25, from a device screenshot). The line names a
  // movement, and without this it reads as the app's decision rather than as its opening offer —
  // an athlete who wanted a different one had no reason to think the row below would change it.
  // ⚠️ PLURAL FOR THE DAY-REACHING CHIPS: Chest, Shoulders and Arms name no single movement, they
  // re-point the picks. Singular where exactly one movement is named. Declarative in both — "change
  // the movement below" would be an instruction, and this app names trades rather than issuing them.
  const yoursSingular = 'The movement is yours to change below.';
  const yoursPlural = 'The movements are yours to change below.';

  if (days.length > 0) {
    // ⚠️ SINGULAR MUSCLE WORD — `DIAL_OWNERSHIP`, not the chip's plural label. "more shoulders work"
    // and "more arms work" read as typos, and this is the same singular the plan rows use.
    return `${label} — more ${DIAL_OWNERSHIP[chip]} work on ${joinDays(days)}, toward ${band} a `
      + `week. ${yoursPlural} Light weeks carry less.`;
  }

  // ⚠️ THE MOVEMENT IS NAMED BECAUSE THE ATHLETE CHOSE IT one control below. "Extra sets" is vague
  // where "extra Hip Thrust sets" is the same length and answers the question.
  //
  // ⛔ FOR `core` THAT CONTROL IS THE "Core movement" PICK, NOT A ROW PICKER (2026-08-24). The chip
  // extends what they already chose; naming anything else here would advertise the third movement
  // the row picker used to create. The caller passes `picks.core`.
  const chosen = opts.movement?.trim()
    || dialRowOptions(chip, opts.equipment ?? null)[0]?.name
    || '';
  const named = chosen ? `${movementLabel(chosen)} ` : '';
  return `${label} — extra ${named}sets, toward ${band} a week. ${yoursSingular} `
    + 'Light weeks carry less.';
}

/** `['Monday','Thursday']` → `Monday and Thursday`. Three or more take an Oxford-free list. */
function joinDays(days: string[]): string {
  if (days.length <= 1) return days[0] ?? '';
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}
