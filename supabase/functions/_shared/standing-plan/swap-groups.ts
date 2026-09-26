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
 * ⛔ THE SHEET IS BUILT FOR THE SLOT THE ROW FILLS, NOT THE MOVEMENT'S OWN FILING (owner, live, 2026-09-25). The
 * composer stamps the slot's cell on the row (`slot_category` / `slot_pattern`, `compose.ts exerciseForSlot`),
 * materialize-plan carries it, the phone sends it with `name` and `now`. Until this date the slot was read off the
 * movement (`filingOf(planned_name)`): a braced hinge row holding the Weighted Reverse Hyper (filed secondary /
 * hinge_lower, p220's bench reverse hyper) built the SECONDARY cell, so on a home kit with the back extension bench
 * the sheet listed the RDL, the good morning and the stiff-legged deadlift and never the row's own printed option,
 * p222's back extension. A stand-in for a braced slot hid the slot's own movements once the kit reached them.
 * ⚠️ TWO GROUPS WHEN THE ROW HOLDS A STAND-IN: the slot's own cell first (its heading), then the cell the held
 * movement is filed in (the substitutes, as before) — the composer widens a braced row with those stand-ins
 * (`accessory-picks.ts subLeadWith`), and the sheet shows what the builder chose from. One cell when they agree.
 * ⚠️ THE FRAME'S ADMITTED MOVEMENTS RIDE ALONG: a slot the frame widens from another cell (`alsoAdmits`) prints them
 * in the row's own `swap_options`; the phone sends those names as `admits` and the ones the kit reaches join the
 * slot's list, so the bench reverse hyper stays on offer once the back extension holds the braced hinge row.
 * ⚠️ A ROW WITH NO STAMPED CELL (typed, legacy, a test-day row) reads the slot off the movement, as before.
 */
import { cellOptions, builderReaches, executionHowTo, executionMovement, usesTwoDumbbellsOnKit } from '../strength-grid/grid.ts';
import { shownNameOnKit } from '../strength/shown-name.ts';
import { drillAllowed, PLYO_FAMILIES, PLYO_FAMILY_IDS, type PlyoFamily } from './plyo.ts';
import { CATEGORY_DEFINITION, filingOf, VIADA_CATEGORIES, VIADA_PATTERNS, type ViadaCategory, type ViadaPattern } from '../strength-grid/taxonomy.ts';
import { frameAdmitsForPick, frameMuscleForPick, pickOptions, VIADA_PICKS, type ViadaPickKey } from './accessory-picks.ts';
import { FRAMES, type FrameId } from './frames.ts';
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
 * The page's cell a row fills, as the composer stamps it (`slot_category` / `slot_pattern`), and — where the slot has a
 * picker — its pick key and frame (`slot_key` / `slot_frame`, 2026-09-25): with those the list is the slot's own
 * `pickOptions` union (muscle, admitted movements, widening), the one the composer and the picking screen build.
 */
export type SlotCell = { category: ViadaCategory; pattern: ViadaPattern | null; key?: ViadaPickKey | null; frame?: FrameId | null };
/** The stamped cell, or null when the row carries none or carries words the taxonomy does not know. */
export function slotCellOf(
  row: { slot_category?: unknown; slot_pattern?: unknown; slot_key?: unknown; slot_frame?: unknown } | null | undefined,
): SlotCell | null {
  const c = String(row?.slot_category ?? '');
  if (!(VIADA_CATEGORIES as string[]).includes(c)) return null;
  const p = row?.slot_pattern == null ? null : String(row.slot_pattern);
  if (p != null && !(VIADA_PATTERNS as string[]).includes(p)) return null;
  const k = String(row?.slot_key ?? '');
  const f = String(row?.slot_frame ?? '');
  const key = k && VIADA_PICKS[k as ViadaPickKey] ? (k as ViadaPickKey) : null;
  const frame = f && FRAMES[f as FrameId] ? (f as FrameId) : null;
  return { category: c as ViadaCategory, pattern: p as ViadaPattern | null, ...(key && frame ? { key, frame } : {}) };
}

/**
 * ⛔ THE SLOT'S OWN LIST, THE WAY THE PLAN PICKS IT (owner, live, 2026-09-25: the focused-quad row on a kit with bands
 * opened a sheet of calf raises and knee raises and no quad movement). p223's focused push lower cell prints the leg
 * extension, the hip adduction machine, the weighted knee raise and the seated calf raise; the composer applies the
 * slot's MUSCLE (quadriceps) and its widening (`accessory-picks.ts pickOptions`) to reach the goblet squat, the Zercher
 * squat and the lunges. The sheet asks the same function for the whole widened union (`widenAll`).
 */
function slotPickNames(cell: SlotCell, equipment: string[] | null | undefined): string[] {
  if (!cell.key || !cell.frame) return [];
  return pickOptions(cell.key, equipment ?? null, frameMuscleForPick(cell.key, cell.frame), frameAdmitsForPick(cell.key, cell.frame), true)
    .map((o) => o.name);
}

/**
 * @param slotName the movement the plan put in the slot (`planned_name`); it names the level and pattern when no
 *                 `cell` is given, and is the one left out of the list
 * @param rowNow   what the row holds now, when a swap has moved it off `slotName`; it is the one left out
 * @param cell     the slot's own cell, as the row carries it (2026-09-25); the list is that cell first
 * @param admits   the movements the frame admits to this slot from other cells, as the row's own `swap_options` name
 *                 them (`frames.ts alsoAdmits` — the bench reverse hyper on a braced hinge row); those the kit reaches
 *                 join the slot's own list, after the cell's printed movements
 */
export function swapGroupsFor(
  slotName: string,
  equipment: string[] | null | undefined,
  rowNow?: string | null,
  cell?: SlotCell | null,
  admits?: string[] | null,
): SwapGroup[] {
  const filed = filingOf(slotName);
  const own: SlotCell | null = cell ?? (filed ? { category: filed.category, pattern: filed.pattern } : null);
  if (!own) return [];
  // The slot's cell, then the held movement's own cell where it is a different one (a stand-in's substitutes).
  const cells: SlotCell[] = [own];
  if (filed && (filed.category !== own.category || filed.pattern !== own.pattern)) {
    cells.push({ category: filed.category, pattern: filed.pattern });
  }
  const now = canonicalize(rowNow || slotName);
  const seen = new Set<string>();
  const shown = new Set<string>();
  // ⛔ THE NAME THE KIT WILL DO (Michael, 2026-09-18): without the machine, Pullover Machine and Rear Delt Machine
  // read as their home versions, never the machine; a dumbbell kit reads "DB Stiff-Legged Deadlift". One shown name
  // per movement (`shownNameOnKit`): the option, the row and State print the same words.
  const label = (name: string) => shownNameOnKit(name, equipment);
  const groups: SwapGroup[] = [];
  for (const c of cells) {
    const options: SwapOption[] = [];
    const add = (raw: string) => {
      // ⛔ THE MOVEMENT THE KIT DOES (2026-09-24, minimum-kit work order B7): his rear delt machine on a dumbbell kit is
      // the rear delt fly, and a row stored as the fly is not offered the fly again under the machine's name.
      const name = executionMovement(raw, equipment);
      const k = canonicalize(name);
      if (!k || k === 'unknown' || k === now || seen.has(k)) return;
      const display = label(name);
      if (shown.has(display.toLowerCase())) return;
      seen.add(k);
      shown.add(display.toLowerCase());
      options.push({ name, display, ...(usesTwoDumbbellsOnKit(name, equipment) ? { weight_per: 'each' as const } : {}), ...kitWords(name, equipment) });
    };
    // The slot's own picker list leads (the plan's own order); the cell's printed movements it does not hold follow.
    if (c === own) for (const n of slotPickNames(c, equipment)) add(n);
    for (const m of cellOptions(c.category, c.pattern, equipment)) add(m.name);
    // The frame's admitted movements for the slot (the row's own `swap_options`), the ones the kit reaches, after the
    // cell's own — only on the slot's cell, and only when the row says which cell that is.
    if (groups.length === 0 && cell && c === own) {
      for (const a of admits ?? []) if (builderReaches(String(a ?? '').trim(), equipment)) add(String(a ?? '').trim());
    }
    // The slot's own movement comes back after a swap, if the kit reaches it — at the head of the first list.
    if (groups.length === 0 && rowNow && canonicalize(rowNow) !== canonicalize(slotName) && !seen.has(canonicalize(slotName))
      && builderReaches(slotName, equipment)) {
      seen.add(canonicalize(slotName));
      options.unshift({ name: slotName, display: label(slotName), ...(usesTwoDumbbellsOnKit(slotName, equipment) ? { weight_per: 'each' as const } : {}), ...kitWords(slotName, equipment) });
    }
    if (options.length > 0) groups.push({ heading: HEADING[c.category], page: CATEGORY_DEFINITION[c.category].cite, options });
  }
  return groups;
}
