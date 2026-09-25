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
import { cellOptions, builderReaches, executionHowTo, executionMovement, usesTwoDumbbellsOnKit } from '../strength-grid/grid.ts';
import { shownNameOnKit } from '../strength/shown-name.ts';
import { drillAllowed, PLYO_FAMILIES, PLYO_FAMILY_IDS, type PlyoFamily } from './plyo.ts';
import { CATEGORY_DEFINITION, filingOf, type ViadaCategory } from '../strength-grid/taxonomy.ts';
import { canonicalize } from '../canonicalize.ts';

/**
 * `weight_per: 'each'` when the kit does it with two dumbbells, so a swap carries the logger's "LB EACH" with it.
 * `execution_name` / `how_to` (2026-09-18): what the row shows once the athlete picks this option — the name the kit
 * does it under (absent when that is the option's own name) and its how-to — so the phone looks nothing up.
 */
export type SwapOption = { name: string; display: string; weight_per?: 'each'; execution_name?: string; how_to?: string };
/** `heading` is null on a plyo drill's list, which prints no heading. */
export type SwapGroup = { heading: string | null; page: string; options: SwapOption[] };

/**
 * The row's name and how-to for an option on this kit. The name is the movement's ONE shown name
 * (`shownNameOnKit`, 2026-09-18) — the same one the option prints and the row prints once it is picked.
 */
function kitWords(name: string, equipment: string[] | null | undefined): Pick<SwapOption, 'execution_name' | 'how_to'> {
  const shown = shownNameOnKit(name, equipment);
  const how = executionHowTo(name, equipment);
  return { ...(shown !== name ? { execution_name: shown } : {}), ...(how != null ? { how_to: how } : {}) };
}

// ⛔ THE PLYO ROW'S LIST, MOVED FROM THE LOGGER (2026-09-18) word for word: the other drills in the drill's own family
// (p227), and a drill that needs an agility ladder only with one in the kit — `plyo.ts drillAllowed`, the same rule
// the week's pick asks (2026-09-20; this file kept its own copy, which knew ladder drills and not hopscotch).
export function plyoFamilyFor(name: string): PlyoFamily | null {
  const n = String(name || '').trim().toLowerCase();
  for (const id of PLYO_FAMILY_IDS) {
    const fam = PLYO_FAMILIES[id];
    if (fam.drills.some((d) => d.toLowerCase() === n)) return fam;
  }
  return null;
}
export function plyoSwapGroups(name: string, equipment: string[] | null | undefined): SwapGroup[] {
  const fam = plyoFamilyFor(name);
  if (!fam) return [];
  const n = String(name || '').trim().toLowerCase();
  const options = fam.drills
    .filter((d) => d.toLowerCase() !== n)
    .filter((d) => drillAllowed(d, equipment))
    .map((d) => ({ name: d, display: shownNameOnKit(d, equipment ?? []), ...kitWords(d, equipment ?? []) }));
  return options.length > 0 ? [{ heading: null, page: 'p227', options }] : [];
}

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
  // read as their home versions, never the machine; a dumbbell kit reads "DB Stiff-Legged Deadlift". One shown name
  // per movement (`shownNameOnKit`): the option, the row and State print the same words.
  const label = (name: string) => shownNameOnKit(name, equipment);
  for (const m of cellOptions(filed.category, filed.pattern, equipment)) {
    // ⛔ THE MOVEMENT THE KIT DOES (2026-09-24, minimum-kit work order B7): his rear delt machine on a dumbbell kit is
    // the rear delt fly, and a row stored as the fly is not offered the fly again under the machine's name.
    const name = executionMovement(m.name, equipment);
    const k = canonicalize(name);
    const display = label(name);
    if (k === now || seen.has(k) || shown.has(display.toLowerCase())) continue;
    seen.add(k);
    shown.add(display.toLowerCase());
    options.push({ name, display, ...(usesTwoDumbbellsOnKit(name, equipment) ? { weight_per: 'each' as const } : {}), ...kitWords(name, equipment) });
  }
  // The slot's own movement comes back after a swap, if the kit reaches it.
  if (rowNow && canonicalize(rowNow) !== canonicalize(slotName) && !seen.has(canonicalize(slotName))
    && builderReaches(slotName, equipment)) {
    options.unshift({ name: slotName, display: label(slotName), ...(usesTwoDumbbellsOnKit(slotName, equipment) ? { weight_per: 'each' as const } : {}), ...kitWords(slotName, equipment) });
  }
  return options.length > 0
    ? [{ heading: HEADING[filed.category], page: CATEGORY_DEFINITION[filed.category].cite, options }]
    : [];
}
