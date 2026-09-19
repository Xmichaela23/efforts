/**
 * ═══ THE LOGGER'S SWAP SHEET — THE SLOT'S OWN LEVEL AND PATTERN, NOTHING ELSE ═════════════════
 *
 * ⛔ Michael, 2026-09-18: "a row's swap options match its exercise and that day's intention exactly: the SAME level
 * the page gives the slot (primary / secondary / braced / focused / core / carry) AND the same movement pattern …
 * A secondary pull offers only secondary pulls. Nothing from another level or pattern."
 *
 * The level and pattern are the slot's as the page files its movement (`FILING`, pp218–223, p226; the day's slot
 * line names the same cell — "1 x HYP: Accessory: secondary push"). The options are that one cell as the builder
 * fills it (`cellOptions`: the filed movements, the builder's kit test, the builder's order), less the movement the
 * row holds now. ONE RULE FOR THE BUILDER AND THIS LIST. The "never above its own level" rule is gone.
 *
 * ⚠️ THE SLOT IS READ OFF THE MOVEMENT THE PLAN PUT THERE (`planned_name`), because `materialize-plan` rebuilds each
 * row field by field and keeps no slot fields. The builder only places a movement in its own cell, so the two agree;
 * a row the builder had to fill from another cell (the kit reached nothing in its own) is offered the cell of the
 * movement it holds.
 */
import { cellOptions, builderReaches, executionName } from '../strength-grid/grid.ts';
import { CATEGORY_DEFINITION, filingOf, type ViadaCategory } from '../strength-grid/taxonomy.ts';
import { canonicalize } from '../canonicalize.ts';
import { movementLabel } from './accessory-picks.ts';

export type SwapOption = { name: string; display: string };
export type SwapGroup = { heading: string; page: string; options: SwapOption[] };

/** The page's heading for each level. */
const HEADING: Record<ViadaCategory, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  braced: 'Braced',
  focused: 'Focused',
  core: 'Core exercises',
  carry: 'Carry/drag/pick options',
};

/**
 * @param slotName the movement the plan put in the slot (`planned_name`) — it names the level and pattern
 * @param rowNow   what the row holds now, when a swap has moved it off `slotName`; it is the one left out
 */
export function swapGroupsFor(
  slotName: string,
  equipment: string[] | null | undefined,
  rowNow?: string | null,
): SwapGroup[] {
  const filed = filingOf(slotName);
  if (!filed) return [];
  const now = canonicalize(rowNow || slotName);
  const seen = new Set<string>();
  const shown = new Set<string>();
  const options: SwapOption[] = [];
  // ⛔ THE NAME THE KIT WILL DO (Michael, 2026-09-18): without the machine, Pullover Machine and Rear Delt Machine
  // read as their home versions, never the machine; a dumbbell kit reads "Dumbbell Stiff-Legged Deadlift".
  const label = (name: string) => {
    const exec = executionName(name, equipment);
    return exec !== name ? exec : movementLabel(name);
  };
  for (const m of cellOptions(filed.category, filed.pattern, equipment)) {
    const k = canonicalize(m.name);
    const display = label(m.name);
    if (k === now || seen.has(k) || shown.has(display.toLowerCase())) continue;
    seen.add(k);
    shown.add(display.toLowerCase());
    options.push({ name: m.name, display });
  }
  // The slot's own movement comes back after a swap, if the kit reaches it.
  if (rowNow && canonicalize(rowNow) !== canonicalize(slotName) && !seen.has(canonicalize(slotName))
    && builderReaches(slotName, equipment)) {
    options.unshift({ name: slotName, display: label(slotName) });
  }
  return options.length > 0
    ? [{ heading: HEADING[filed.category], page: CATEGORY_DEFINITION[filed.category].cite, options }]
    : [];
}
