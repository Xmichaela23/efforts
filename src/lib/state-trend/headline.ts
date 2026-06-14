// Two-part status headline (confirmed format, e.g. "Building — strength up, run sliding").
// Left = a synthesized status word; right = "what's moving" per discipline. Pure over the
// resolved DisciplineCards.
//
// DELIBERATELY does NOT synthesize off-plan / load status. That verdict is authoritative on
// the server (D-147 `intent_summary`) and already shown in the STATE header — re-deriving it
// here would risk divergence. A consumer that wants an off-plan lead should read that signal.

import type { DisciplineCard } from './discipline';

export interface Headline {
  status: string; // left part: Building / Holding / Sliding / Mixed / Getting started
  detail: string; // right part: "strength up, run sliding" ('' when nothing is moving)
  line: string; // "status — detail", or just status when nothing's moving
  basis: { improving: string[]; sliding: string[]; holding: string[]; performanceCards: number };
}

// Stable display order so the detail reads naturally (strength first, etc.).
const ORDER = ['strength', 'bike', 'run', 'swim'];
const orderIdx = (d: string) => { const i = ORDER.indexOf(d); return i < 0 ? ORDER.length : i; };

// Neutral empty-state lead — used when no TRUSTED discipline has a performance verdict. Never
// a fabricated direction (Michael 2026-06-13): "No trend yet" asserts nothing about fitness.
export const NEUTRAL_HEADLINE = 'No trend yet';

// Disciplines whose performance verdict is NOT trusted to drive the headline yet — gated out
// of the synthesized lead (their own row still shows the verdict, tagged provisional). TODAY:
// swim, because its thresholds are provisional AND its data is Q-038-clouded. Remove a
// discipline here once its thresholds are signed off AND its data is trustworthy — one-spot
// change. (Run was provisional earlier; thresholds approved 2026-06-13, so it is NOT gated.)
export const HEADLINE_GATED_DISCIPLINES = new Set(['swim']);

export function synthesizeHeadline(cards: DisciplineCard[]): Headline {
  const perfCards = cards
    .filter((c) => c.primaryAxis === 'performance' && c.headlineVerdict)
    .filter((c) => !HEADLINE_GATED_DISCIPLINES.has(c.discipline)) // untrusted disciplines never lead
    .sort((a, b) => orderIdx(a.discipline) - orderIdx(b.discipline));

  const improving = perfCards.filter((c) => c.headlineVerdict === 'improving').map((c) => c.discipline);
  const sliding = perfCards.filter((c) => c.headlineVerdict === 'sliding').map((c) => c.discipline);
  const holding = perfCards.filter((c) => c.headlineVerdict === 'holding').map((c) => c.discipline);

  // Empty (no trusted performance signal) → neutral lead, not a fabricated direction.
  if (perfCards.length === 0) {
    return { status: NEUTRAL_HEADLINE, detail: '', line: NEUTRAL_HEADLINE, basis: { improving, sliding, holding, performanceCards: 0 } };
  }

  let status: string;
  if (improving.length && sliding.length) status = 'Mixed';
  else if (improving.length) status = 'Building';
  else if (sliding.length) status = 'Sliding';
  else status = 'Holding';

  // "what's moving" — only non-holding disciplines, in stable order.
  const movers: string[] = [];
  for (const c of perfCards) {
    if (c.headlineVerdict === 'improving') movers.push(`${c.discipline} up`);
    else if (c.headlineVerdict === 'sliding') movers.push(`${c.discipline} sliding`);
  }
  const detail = movers.join(', ');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // Line: a single mover reads as just the mover ("Run sliding") — echoing it after a status
  // word ("Sliding — run sliding") is redundant. Two+ movers keep the "status — m1, m2" form;
  // zero movers (all holding) read as just the status.
  let line: string;
  if (movers.length === 1) line = cap(movers[0]);
  else if (movers.length > 1) line = `${status} — ${detail}`;
  else line = status;

  return {
    status,
    detail,
    line,
    basis: { improving, sliding, holding, performanceCards: perfCards.length },
  };
}
