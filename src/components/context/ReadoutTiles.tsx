/**
 * READOUT TILES — the value-over-label grid that makes the workout Details tab read as an
 * instrument. [2026-08-15]
 *
 * Michael, after the colour/typography passes on State: *"I'd still like to see more of the readout
 * graph look in State."* The colour work was landing correctly (measured in the DOM) and still felt
 * thin, because the difference between Details and State was never colour — it is STRUCTURE.
 * Details is thirteen big numbers with small labels under them; State is sentences. Tinting a
 * sentence does not make it a readout.
 *
 * ⛔ WHAT THIS MAY AND MAY NOT BE BUILT FROM. Tiles render numbers the surface ALREADY HOLDS as
 * numbers — e1RM, session counts, distances, load points. It must never parse a number back out of
 * a server-composed sentence to fill a tile: that is the client re-deriving a fact the spine owns
 * (Constitution Law 2), and it would drift the moment the copy changed. State's BODY row is exactly
 * that case — its numbers live inside "you rated 4.2 of 10 avg vs 4.0 typical" — so BODY keeps its
 * sentence and gets no tiles until the spine sends the parts separately.
 *
 * Colour comes from the plate the grid sits on (`--card-accent-rgb`, set by readoutPlateStyle) via
 * the `readout-label` / `readout-num` classes in index.css — so a strength plate's tiles glow
 * orange and a neutral plate's glow the app's off-white, with no prop threading.
 */

import React from 'react';

export type ReadoutTile = {
  /** The number and its unit, pre-formatted — this component never formats or computes. */
  value: React.ReactNode;
  /** What the number is. Rendered small, under the value, in the plate's accent. */
  label: string;
  /** Optional qualifier under the label (e.g. "incl. coasting") — the Details tab does this too. */
  note?: string;
};

export function ReadoutTiles({
  tiles,
  columns = 3,
  size = 'md',
}: {
  tiles: (ReadoutTile | null | undefined)[];
  columns?: 2 | 3;
  /** `sm` for tiles nested inside another card (per-lift), `md` for a section's own grid. */
  size?: 'sm' | 'md';
}) {
  const shown = tiles.filter(Boolean) as ReadoutTile[];
  if (shown.length === 0) return null;
  const valueCls = size === 'sm' ? 'text-[15px]' : 'text-[19px]';
  return (
    <div
      className={`basis-full grid gap-x-3 gap-y-2.5 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
      // Tiles are a scan target, so they hold their own column even when a value is long; the
      // parent rows use flex-wrap, which would otherwise re-flow them into a ragged line.
    >
      {shown.map((t, i) => (
        <div key={i} className="min-w-0">
          <div className={`readout-num ${valueCls} leading-tight truncate`}>{t.value}</div>
          <div className="readout-label text-[10px] uppercase leading-tight mt-0.5 truncate">{t.label}</div>
          {t.note && <div className="text-white/40 text-[10px] leading-tight truncate">{t.note}</div>}
        </div>
      ))}
    </div>
  );
}

export default ReadoutTiles;
