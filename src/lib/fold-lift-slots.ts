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
 * ── ⛔⛔ MERGE THE SERIES, NOT THE CARDS (bug found live 2026-09-01, same day) ────────────────────
 * The first version of this fold picked a REPRESENTATIVE row by most-recent reading and took that
 * row's fields whole. On Michael's screen: deadlift 180 on Aug 25, trap bar 135 on Aug 28 — the
 * SAME ISO week. The server's rule is one point per ISO week, the heaviest, so the slot's reading
 * for that week is 180. The fold showed 135 (the trap bar's own latest), NO CHART and NO ALL-OUT
 * LINE — because the trap-bar row is not a tracked-max lift and carries neither on the payload, and
 * the representative's fields were copied whole. One mistake, three symptoms.
 *
 * ⛔ THE FIX: union the slot's readings, then apply the SAME one-point-per-ISO-week-heaviest rule
 * to the union. The headline, the chart, the count and the as-of all follow from the merged series.
 * `latestE1rm` does NOT change meaning — the bug was that the merge fed it half a week.
 *
 * ⚠️ WHAT THE CLIENT HAS TO MERGE WITH, STATED. The payload carries a chart `series` only for the
 * four tracked-max lifts (`isTrackedMaxLift`, `assemble.ts`); a variant row carries ONE reading —
 * `latestE1rm` at `newestAgeDays`. So the union is the slot's own series plus the variant's latest
 * reading, dated off the slot's own as-of (last series date + its `newestAgeDays`). Older variant
 * weeks are not on the payload and cannot be drawn here; that is a server change (merge per slot
 * inside `assemble.ts`, 27-function closure) and is filed, not done. When the slot's own canonical
 * has no series to anchor a date (a trap-bar-only athlete, or fewer than two deadlift weeks), the
 * fold falls back to the most-recent row and says nothing it cannot know.
 *
 * ⚠️ A MERGED CARD CAN STILL READ LOWER THAN THE UNMERGED DEADLIFT DID, AND THAT IS ACCEPTED. If
 * the variant's latest is in a LATER ISO week than any deadlift point, that week's heaviest is the
 * variant's, and the card states the record beside it — `showBest` renders "best" exactly when the
 * latest is below it — and `isPr` turns off. The Strong/Hevy shape.
 *
 * ⛔ THE SERVER STILL DOUBLE-COUNTS THIS SLOT IN THE DOT — see FIXLIST 2b-server (fixed there,
 * separately). This file is the card.
 */

// ⛔ ONE NAME MAP, NOT A SECOND ONE. `canonicalDisplayName` already exists to answer exactly this
// ("a lift logged under many raw names always shows ONE clear label"), so the slot's label is read
// from it rather than restated here. A second map beside the first is how this screen ended up
// showing "Squat" and "Back Squat" for the same lift — see FIXLIST 1d.
import { canonicalDisplayName } from '../../supabase/functions/_shared/canonicalize.ts';
// ⛔ THE SLOT MAP LIVES IN ONE PLACE and the server reads the same file — see `lift-slots.ts`.
import { VARIANT_SLOT_BY_CANONICAL } from './lift-slots.ts';

type SeriesPoint = { date: string; value: number; recent: boolean; week?: number };
type AllOut = { date: string; weight: number; reps: number; isRepRecord: boolean } | null;

type FoldableLift = {
  canonical: string;
  displayName: string;
  latestE1rm: number | null;
  allTimeBestE1rm?: number | null;
  allTimeCount?: number;
  sampleCount: number;
  newestAgeDays: number | null;
  isPr?: boolean;
  series?: SeriesPoint[];
  lastAllOut?: AllOut;
};

/**
 * ⛔ THE SAME WEEK BOUNDARY AS THE SERVER — ISO, Monday-based (`isoWeekKey`, `assemble.ts`). A
 * different boundary here would put the two readings in different weeks and the merge would be
 * wrong in exactly the case it exists for.
 */
function isoWeekKey(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function shiftYmd(ymd: string, days: number): string {
  return new Date(new Date(ymd + 'T12:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

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
 * ⛔ NOTHING HERE MINTS A VERDICT THE SERVER DID NOT (Constitution Law 4). What is combined is a
 * union of readings under the server's own weekly-heaviest rule, plus counts and maxima over it:
 *   · `series` / `latestE1rm` / `sampleCount` / `newestAgeDays` — read off the merged series.
 *   · `allTimeBestE1rm` — the slot's record is the best either version ever produced.
 *   · `allTimeCount` — sessions in the slot, summed.
 *   · `lastAllOut` — whichever version's last all-out set is the more recent.
 *   · `isPr` — the flag decided by the row whose reading became the slot's latest, withdrawn (never
 *     invented) when the merged record beats that latest.
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
  // ⚠️ The origin rides along privately so `merge` can tell the slot's own row from a variant after
  // both have been relabelled. Not rendered.
  return { ...l, canonical: slot, displayName: canonicalDisplayName(slot), __variantOf: l.canonical } as T;
}

const isVariantRow = (l: FoldableLift) => (l as { __variantOf?: string }).__variantOf != null;

function merge<T extends FoldableLift>(a: T, b: T): T {
  const bests = [a.allTimeBestE1rm, b.allTimeBestE1rm].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  const best = bests.length > 0 ? Math.max(...bests) : null;
  const allOuts = [a.lastAllOut, b.lastAllOut].filter((x): x is NonNullable<AllOut> => x != null && !!x.date);
  const lastAllOut = allOuts.length ? allOuts.sort((x, y) => y.date.localeCompare(x.date))[0] : (a.lastAllOut ?? b.lastAllOut ?? null);

  const merged = mergeSeries(a, b);
  if (merged) {
    const { base, series, latest, latestFrom, sampleCount, newestAgeDays } = merged;
    return {
      ...base,
      series,
      latestE1rm: latest,
      allTimeBestE1rm: best,
      allTimeCount: (a.allTimeCount ?? 0) + (b.allTimeCount ?? 0),
      sampleCount,
      newestAgeDays,
      lastAllOut,
      // The row whose reading became the slot's latest decided the flag; the merge may only withdraw it.
      isPr: latestFrom.isPr === true && !(best != null && latest != null && best > latest + 0.5),
    };
  }

  // ⚠️ NO SERIES TO ANCHOR A DATE → the representative-row fallback, stated in the header.
  const rep = moreRecent(a, b);
  const other = rep === a ? b : a;
  const latest = rep.latestE1rm;
  return {
    ...rep,
    allTimeBestE1rm: best,
    allTimeCount: (a.allTimeCount ?? 0) + (b.allTimeCount ?? 0),
    sampleCount: (a.sampleCount ?? 0) + (b.sampleCount ?? 0),
    lastAllOut,
    // Never widen a PR claim; only withdraw one the merge invalidated.
    isPr: rep.isPr === true && !(best != null && latest != null && best > latest + 0.5),
    // Keep the freshest reading's age, so "as of" still describes the number shown.
    newestAgeDays: rep.newestAgeDays ?? other.newestAgeDays ?? null,
  };
}

/**
 * The union of the slot's readings under the server's weekly-heaviest rule. Null when neither row
 * carries a dated series to anchor the other's reading to.
 */
function mergeSeries<T extends FoldableLift>(a: T, b: T): {
  base: T; series: SeriesPoint[]; latest: number | null; latestFrom: T; sampleCount: number; newestAgeDays: number | null;
} | null {
  // The slot's own row is the base — it carries the chart, the all-out walk and the calibration key.
  const [own, variant] = isVariantRow(a) && !isVariantRow(b) ? [b, a] : [a, b];
  const anchor = own.series?.length ? own : (variant.series?.length ? variant : null);
  if (!anchor || !anchor.series?.length || anchor.newestAgeDays == null) return null;
  const other = anchor === own ? variant : own;

  // as-of, recovered from the anchor: its last series date is its newest reading, `newestAgeDays` old.
  const anchorLast = [...anchor.series].sort((x, y) => x.date.localeCompare(y.date))[anchor.series.length - 1];
  const asOf = shiftYmd(anchorLast.date, anchor.newestAgeDays);

  // Every reading in the slot: the anchor's points, the other row's points if it has any, else its
  // one latest reading dated off the shared as-of.
  const pool: Array<SeriesPoint & { from: T }> = anchor.series.map((p) => ({ ...p, from: anchor }));
  if (other.series?.length) {
    for (const p of other.series) pool.push({ ...p, from: other });
  } else if (other.latestE1rm != null && other.newestAgeDays != null) {
    const date = shiftYmd(asOf, -other.newestAgeDays);
    const recent = anchor.series.some((p) => p.recent && p.date <= date) || date > anchorLast.date;
    pool.push({ date, value: other.latestE1rm, recent, from: other });
  }

  // ⛔ ONE POINT PER ISO WEEK, THE HEAVIEST — the server's rule, applied to the union.
  const byWeek = new Map<string, SeriesPoint & { from: T }>();
  for (const p of pool) {
    const wk = isoWeekKey(p.date);
    const held = byWeek.get(wk);
    if (!held || p.value > held.value) byWeek.set(wk, p);
  }
  const weekly = [...byWeek.values()].sort((x, y) => x.date.localeCompare(y.date));
  const last = weekly[weekly.length - 1];
  const series = weekly.map(({ from: _from, ...p }) => p);
  const ages = [a.newestAgeDays, b.newestAgeDays].filter((v): v is number => typeof v === 'number');
  return {
    base: own,
    series,
    latest: last.value,
    latestFrom: last.from,
    // The server's `sampleCount` is points inside the verdict window, which is what `recent` marks.
    sampleCount: weekly.filter((p) => p.recent).length || (a.sampleCount ?? 0) + (b.sampleCount ?? 0),
    // The freshest reading in the slot, so "as of" describes the week the headline is the heaviest of.
    newestAgeDays: ages.length ? Math.min(...ages) : null,
  };
}
