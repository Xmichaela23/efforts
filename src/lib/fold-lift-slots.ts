/**
 * ⛔⛔ THE FOUR SLOTS, NOT THE FIVE CANONICALS — a DISPLAY fold, ruled by Michael 2026-09-01 (FIXLIST 2b).
 *
 * A trap bar deadlift and a conventional deadlift fill ONE slot and get ONE card. The screen was
 * drawing them as two lifts stacked on each other, with the trap bar's own e1RM and record sitting
 * directly under the deadlift's.
 *
 * ── WHY, SOURCED, NOT PREFERRED ───────────────────────────────────────────────────────────────
 * · `SOURCE-viada-hybrid-athlete.md:130` — the book's PRIMARY HINGE pattern lists deadlift, paused
 *   deadlift, sumo deadlift and trap bar deadlift as four movements filling ONE slot. The programme
 *   does not distinguish them.
 * · The app already half-folded it: `CALIBRATION_REF_BY_CANONICAL` maps `trap_bar_deadlift` →
 *   `deadlift`, so the PRESCRIBED working weight already came off the deadlift training max while
 *   the card showed a separate number. This closes that gap on the display side.
 * · The comparability objection (a trap-bar max is not a straight-bar max) does not apply to an
 *   athlete whose whole history is one implement.
 *
 * ⛔ THE SPLIT WAS A NAMING ARTEFACT, WHICH IS WHY THIS CORRECTS A NUMBER RATHER THAN TIDYING A LIST.
 * `canonical_name` is derived from ONE thing — the typed exercise NAME
 * (`compute-facts/strength-facts-lib.ts:148`, written at `compute-facts/index.ts:1729`). There is no
 * equipment or implement field anywhere on a logged set. A Standard Focus block prescribes the hinge
 * slot as the literal string `'Deadlift'` (`shared/strength-system/barbell-maxes.ts:27`), so a
 * trap-bar pull done against the prescribed slot is FILED as `deadlift` no matter what bar was used.
 * A `trap_bar_deadlift` row only exists when the exercise name literally said so.
 *
 * ⛔ NO VERSION LINE ON THE CARD, AND THAT IS A RULING, NOT AN OMISSION. "Name the version that set
 * the number" is not buildable: the app knows which NAME a set was logged under, never which bar was
 * used. For a prescribed-slot session it would print "Deadlift", which is precisely the wrong word
 * for a trap-bar puller. Silence beats a confident wrong label.
 *
 * ⚠️ DISPLAY ONLY. Nothing here rewrites stored history, canonical names, or any athlete's data, and
 * no server field changes. `latestE1rm` keeps its meaning exactly: the most recent ISO week's
 * heaviest set.
 *
 * ⚠️ A MERGED CARD CAN READ LOWER THAN THE UNMERGED DEADLIFT DID, AND THAT IS ACCEPTED, NOT A BUG.
 * If the most recent trap-bar-named week is later than the most recent deadlift-named week, the
 * slot's latest reading is the trap-bar one. The card states the record beside it — `showBest`
 * renders "best" exactly when the latest is below it — and `isPr` correctly turns off. That is the
 * Strong/Hevy shape: an estimated-max trend and a personal record shown as two separate figures.
 *
 * ⛔ THE SERVER STILL DOUBLE-COUNTS THIS SLOT AND THIS FILE DOES NOT FIX IT. `PRIMARY_LIFTS`
 * (`_shared/state-trend/strength.ts:71`) contains `trap_bar_deadlift`, and its own comment records
 * the measurement: an athlete logging both a conventional and a trap-bar deadlift has the deadlift
 * slot counted twice in `computeE1rmBand`, moving the strength dot from 0.750 to 0.833 — eight
 * points, because a variant was logged rather than because anything got stronger. That is a SERVER
 * change and a separate ruling. See the FIXLIST.
 */

// ⛔ ONE NAME MAP, NOT A SECOND ONE. `canonicalDisplayName` already exists to answer exactly this
// ("a lift logged under many raw names always shows ONE clear label"), so the slot's label is read
// from it rather than restated here. A second map beside the first is how this screen ended up
// showing "Squat" and "Back Squat" for the same lift — see FIXLIST 1d.
import { canonicalDisplayName } from '../../supabase/functions/_shared/canonicalize.ts';
// ⛔ THE SLOT MAP LIVES IN ONE PLACE and the server reads the same file — see `lift-slots.ts`.
import { VARIANT_SLOT_BY_CANONICAL } from './lift-slots.ts';


type FoldableLift = {
  canonical: string;
  displayName: string;
  latestE1rm: number | null;
  allTimeBestE1rm?: number | null;
  allTimeCount?: number;
  sampleCount: number;
  newestAgeDays: number | null;
  isPr?: boolean;
};

/** Prefer the row with the more recent reading; a null age is treated as oldest. */
function moreRecent<T extends FoldableLift>(a: T, b: T): T {
  const aAge = a.newestAgeDays ?? Number.POSITIVE_INFINITY;
  const bAge = b.newestAgeDays ?? Number.POSITIVE_INFINITY;
  if (aAge !== bAge) return aAge < bAge ? a : b;
  // Tie → the slot's own canonical leads, so a same-day pair is labelled by the slot, not the variant.
  return VARIANT_SLOT_BY_CANONICAL[a.canonical] ? b : a;
}

/**
 * Fold variant lifts into the slot they fill, preserving order of first appearance.
 *
 * ⛔ EVERY VERDICT FIELD COMES FROM ONE REAL ROW — the representative — so nothing here mints a
 * verdict the server did not (Constitution Law 4). Only three things are combined, and each is a
 * COUNT or a MAX over the slot rather than a judgement:
 *   · `allTimeBestE1rm` — the slot's record is the best either version ever produced.
 *   · `allTimeCount` / `sampleCount` — sessions in the slot, summed.
 *   · `isPr` — suppressed (never invented) when the merged record beats the representative's latest,
 *     because the representative decided that flag without knowing about the other version.
 */
export function foldVariantSlots<T extends FoldableLift>(lifts: T[]): T[] {
  const out: T[] = [];
  const indexBySlot = new Map<string, number>();

  for (const l of lifts) {
    const slot = VARIANT_SLOT_BY_CANONICAL[l.canonical] ?? l.canonical;
    const at = indexBySlot.get(slot);
    if (at == null) {
      indexBySlot.set(slot, out.length);
      out.push(asSlot(l, slot));
      continue;
    }
    out[at] = merge(out[at], asSlot(l, slot));
  }
  return out;
}

function asSlot<T extends FoldableLift>(l: T, slot: string): T {
  if (l.canonical === slot) return l;
  return { ...l, canonical: slot, displayName: canonicalDisplayName(slot) };
}

function merge<T extends FoldableLift>(a: T, b: T): T {
  const rep = moreRecent(a, b);
  const other = rep === a ? b : a;
  const bests = [a.allTimeBestE1rm, b.allTimeBestE1rm].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  const best = bests.length > 0 ? Math.max(...bests) : null;
  const latest = rep.latestE1rm;
  return {
    ...rep,
    allTimeBestE1rm: best,
    allTimeCount: (a.allTimeCount ?? 0) + (b.allTimeCount ?? 0),
    sampleCount: (a.sampleCount ?? 0) + (b.sampleCount ?? 0),
    // Never widen a PR claim; only withdraw one the merge invalidated.
    isPr: rep.isPr === true && !(best != null && latest != null && best > latest + 0.5),
    // Keep the freshest reading's age, so "as of" still describes the number shown.
    newestAgeDays: rep.newestAgeDays ?? other.newestAgeDays ?? null,
  };
}
