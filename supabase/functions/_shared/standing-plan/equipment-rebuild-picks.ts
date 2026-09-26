/**
 * ═══ THE EQUIPMENT REBUILD LETS NEW GEAR REACH THE PLAN (owner, live, 2026-09-25: "it's not budging") ═══════════
 *
 * THE DEFECT. He added the "Back extension bench" chip and tapped Profile → Rebuild upcoming sessions. Today's and next
 * week's braced-hinge rows still read Weighted Reverse Hyper. The rebuild re-composes from the block's STORED picks
 * (`rematerialize-standing-block`, `sp.slot_picks` — D-450: re-composing from fresh picks would unmatch the restate),
 * and those picks were the picking screen's DEFAULTS at build time (`generate-strength-plan` merges
 * `defaultViadaPicks(kit)` under the rows the athlete changed). The default for the braced hinge on the minimum kit is
 * the frame's admitted stand-in (p220's bench reverse hyper, `frames.ts alsoAdmits`), chosen because the kit reached
 * none of p222's braced hinge movements. Stored as if the athlete chose it, still reachable on the new kit, it wins —
 * and the bench the athlete just declared never reaches the plan.
 *
 * THE RULE (OURS — ledger row "Equipment rebuild: a defaulted stand-in gives way", docs/STATE-SOURCES.md). On an
 * EQUIPMENT rebuild only (`use_current_equipment`), a stored pick that was a stand-in — a movement outside the cell's
 * printed list (a variant admitted by the frame, or a same-muscle substitute) chosen because none of the cell's printed
 * movements was reachable on the kit the block was built with — gives way to the cell's default on the current kit
 * when that default is now one of the cell's printed movements. A pick the athlete made by hand stays.
 *
 * WHICH PICKS WERE THE ATHLETE'S. The picking screen sends only the rows the athlete changed
 * (`assistance_picks.viada.picks`, 2026-09-13); since this date the block records those keys (`sp.slot_picks_chosen`).
 * A block built before carries no record, so a stored pick that equals the picking screen's default on the kit the
 * block was built with (`sp.athlete_equipment`) is read as a default. ⚠️ A hand pick that happened to equal the
 * default on such a block is read as a default too — the same movement, so nothing the athlete sees is lost until
 * the kit changes.
 *
 * THE RESTATE SURVIVES THE CHANGE: the composed row for the changed slot carries the same `source_row` as the stored
 * row, and `restateFromTest` pairs rows of one slot by `source_row` and replaces a different movement wholesale — the
 * path a rebuilt cell already takes (2026-09-08 / 2026-09-20). From today on; a done session is never touched.
 */
import {
  defaultViadaPicks,
  frameAdmitsForPick,
  frameMuscleForPick,
  isDialChip,
  pickOptions,
  VIADA_PICKS,
  type DialChip,
  type ViadaPickKey,
} from './accessory-picks.ts';
import type { FrameId } from './frames.ts';
import { filingOf } from '../strength-grid/taxonomy.ts';
import { canonicalize } from '../canonicalize.ts';

export type PickChange = { key: ViadaPickKey; from: string; to: string };

/**
 * Is this movement one of the cell's own printed movements on this kit? The picker marks a same-muscle substitute
 * `substituted`; a movement the frame admits from another cell (the reverse hyper on a braced row) is filed outside
 * the cell; a variant is filed in it with another basis. Only a printed movement filed in the cell, reachable and not
 * a substitute, answers yes.
 */
function printedForCell(key: ViadaPickKey, name: string, kit: string[] | null, frame: FrameId): boolean {
  const slot = VIADA_PICKS[key]?.slot;
  if (!slot) return false;
  const filed = filingOf(name);
  if (!filed || filed.basis !== 'printed') return false;
  if (filed.category !== slot.category) return false;
  if (slot.pattern != null && filed.pattern !== slot.pattern) return false;
  const opt = pickOptions(key, kit, frameMuscleForPick(key, frame), frameAdmitsForPick(key, frame))
    .find((o) => canonicalize(o.name) === canonicalize(name));
  return !!opt && opt.substituted !== true;
}

/**
 * The block's picks after an equipment rebuild. `stored` is `sp.slot_picks`; `chosenKeys` is `sp.slot_picks_chosen`
 * (null on a block built before it was recorded); `builtKit` is `sp.athlete_equipment`; `currentKit` the kit on
 * Baselines. Returns the picks to compose with and the slots that moved. Same kit, or nothing to move: the stored
 * picks back, unchanged, and an empty list.
 */
export function picksOnNewKit(args: {
  stored: Partial<Record<ViadaPickKey, string>>;
  chosenKeys: string[] | null | undefined;
  builtKit: string[] | null | undefined;
  currentKit: string[];
  dial: string[] | null | undefined;
  frame: FrameId;
}): { picks: Partial<Record<ViadaPickKey, string>>; changed: PickChange[] } {
  const dial = (args.dial ?? []).filter(isDialChip) as DialChip[];
  const built = Array.isArray(args.builtKit) ? args.builtKit : null;
  const chosen = Array.isArray(args.chosenKeys) ? new Set(args.chosenKeys.map(String)) : null;
  const builtDefaults = defaultViadaPicks(built, dial, args.frame);
  const nowDefaults = defaultViadaPicks(args.currentKit, dial, args.frame);
  const picks: Partial<Record<ViadaPickKey, string>> = { ...args.stored };
  const changed: PickChange[] = [];
  for (const [k, v] of Object.entries(args.stored)) {
    const key = k as ViadaPickKey;
    const from = String(v ?? '').trim();
    if (!from || !VIADA_PICKS[key]) continue;
    // The athlete's own pick stays.
    const athletes = chosen ? chosen.has(key) : canonicalize(from) !== canonicalize(String(builtDefaults[key] ?? ''));
    if (athletes) continue;
    // A default that was one of the cell's printed movements on the built kit was not a stand-in.
    if (printedForCell(key, from, built, args.frame)) continue;
    const to = String(nowDefaults[key] ?? '').trim();
    if (!to || canonicalize(to) === canonicalize(from)) continue;
    if (!printedForCell(key, to, args.currentKit, args.frame)) continue;
    picks[key] = to;
    changed.push({ key, from, to });
  }
  return { picks, changed };
}

/** The flattened accessory list (`sp.accessory_picks`) with the moved slots' movements renamed, no duplicates. */
export function accessoryPicksAfter(stored: string[] | null | undefined, changed: PickChange[]): string[] | null {
  if (!Array.isArray(stored)) return null;
  if (changed.length === 0) return stored;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of stored) {
    const hit = changed.find((c) => canonicalize(c.from) === canonicalize(n));
    const name = hit ? hit.to : n;
    const k = canonicalize(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}
