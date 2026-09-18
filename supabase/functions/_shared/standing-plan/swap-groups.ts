/**
 * ═══ THE LOGGER'S SWAP SHEET, BUILT ON THE SERVER, SORTED THE WAY THE BUILDER SORTS ═════════════
 *
 * ⛔ 2026-09-18, the Stage C follow-up. The phone used to build this list itself (`src/lib/exercise-alternatives.ts`,
 * removed): every catalogue movement sharing a movement pattern, under "Direct swaps" / "Alternatives", two headings
 * no page prints. Now `swap-list` builds it here and the phone prints it.
 *
 * ⛔ ONE SORTING, THE BUILDER'S (Michael, 2026-09-18: "the page DEFINITIONS reading … same rule the builder uses; no
 * second sorting"). Each heading is a page's own, and what goes under it is what the builder's classifier files
 * there by that page's definition (`strength-grid/taxonomy.ts`), reached by the builder's own kit test and in the
 * builder's own order (`cellOptions`):
 *   Primary (pp218–219) · Secondary (p220: "compound noncontested movements, dumbbell variants") · Braced
 *   (pp221–222) · Focused (pp222–223) · Core exercises (p223) · Carry/drag/pick options (p226).
 *
 * ⛔ A ROW THAT CARRIES ITS SLOT'S OWN LIST (`swap_options`, written by the composer — the ME row's p220 list, an
 * accessory slot's pick list) is offered that list, grouped under the same headings. The builder chose it.
 */
import { cellOptions, builderReaches } from '../strength-grid/grid.ts';
import { CATEGORY_DEFINITION, viadaCategoryOf, viadaPatternOf, type ViadaCategory } from '../strength-grid/taxonomy.ts';
import { canonicalize } from '../canonicalize.ts';
import { movementLabel } from './accessory-picks.ts';

export type SwapOption = { name: string; display: string };
export type SwapGroup = { heading: string; page: string; options: SwapOption[] };

/** The page's heading for each category, in the key's order. */
const HEADING: Array<[ViadaCategory, string]> = [
  ['primary', 'Primary'],
  ['secondary', 'Secondary'],
  ['braced', 'Braced'],
  ['focused', 'Focused'],
  ['core', 'Core exercises'],
  ['carry', 'Carry/drag/pick options'],
];
const LIFTING: ViadaCategory[] = ['primary', 'secondary', 'braced', 'focused'];

const same = (a: string, b: string) => canonicalize(a) === canonicalize(b);

/**
 * @param slotName the movement the slot was written for (`planned_name`), which sets the pattern and heading
 * @param slotList the slot's own list, when the composer wrote one
 * @param rowNow   what the row holds now, when a swap has moved it off `slotName`; it is the one left out
 */
export function swapGroupsFor(
  slotName: string,
  equipment: string[] | null | undefined,
  slotList?: readonly string[] | null,
  rowNow?: string | null,
): SwapGroup[] {
  const now = rowNow || slotName;
  const byCategory = new Map<ViadaCategory, SwapOption[]>();
  const add = (cat: ViadaCategory, name: string) => {
    if (same(name, now)) return;
    const list = byCategory.get(cat) ?? [];
    if (list.some((o) => same(o.name, name))) return;
    list.push({ name, display: movementLabel(name) });
    byCategory.set(cat, list);
  };

  if (Array.isArray(slotList) && slotList.length > 0) {
    for (const name of slotList) {
      const cat = viadaCategoryOf(name);
      if (cat && builderReaches(name, equipment)) add(cat, name);
    }
  } else {
    const own = viadaCategoryOf(slotName);
    if (!own) return [];
    if (own === 'core' || own === 'carry') {
      for (const m of cellOptions(own, null, equipment)) add(own, m.name);
    } else {
      const pattern = viadaPatternOf(slotName);
      if (!pattern) return [];
      /**
       * ⛔ NEVER UP THE KEY: the row's own heading and the ones printed after it; a Primary row gets all four. OURS —
       * carried over from the phone's one-directional rule (an accessory is never offered a main lift; swapping down
       * from a squat to a lunge is the athlete's call), which followed Fitbod's "same muscles at equivalent
       * intensity". The pages file every heading under one pattern and state no direction. Ledger row:
       * docs/STATE-SOURCES.md "Swap sheet".
       */
      for (const cat of LIFTING.slice(LIFTING.indexOf(own))) {
        for (const m of cellOptions(cat, pattern, equipment)) add(cat, m.name);
      }
    }
  }

  const out: SwapGroup[] = [];
  for (const [cat, heading] of HEADING) {
    const options = byCategory.get(cat);
    if (options && options.length > 0) out.push({ heading, page: CATEGORY_DEFINITION[cat].cite, options });
  }
  return out;
}
