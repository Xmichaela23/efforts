// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import React from 'react';
import type { DisciplineCard, TrendVerdict } from '@shared/state-trend';
import { useStateTrends } from '@/hooks/useStateTrends';

const VERDICT: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'improving', cls: 'text-emerald-400', arr: '↑' },
  holding: { word: 'holding', cls: 'text-amber-300', arr: '→' },
  sliding: { word: 'sliding', cls: 'text-red-400', arr: '↓' },
  needs_data: { word: 'needs data', cls: 'text-white/40', arr: '' },
};

// Swim performance stays provisional until Q-038 is fixed (run approved 2026-06-13); flag it
// in the UI. This row-level tag is separate from headline gating (HEADLINE_GATED_DISCIPLINES).
const PROVISIONAL_PERF = new Set(['swim']);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase w-[72px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[12px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        {children}
      </div>
    </div>
  );
}

function DisciplineRow({ card }: { card: DisciplineCard }) {
  if (card.primaryAxis === 'performance' && card.headlineVerdict) {
    const v = VERDICT[card.headlineVerdict];
    const pct = card.performance?.pctChange;
    return (
      <Row label={card.discipline}>
        <span className={`inline-flex items-baseline gap-1 ${v.cls}`}>
          {v.arr && <span>{v.arr}</span>}
          <span>{v.word}</span>
        </span>
        {pct != null && <span className="text-white/40">{pct > 0 ? '+' : ''}{pct}%</span>}
        {PROVISIONAL_PERF.has(card.discipline) && <span className="text-white/30 text-[11px]">provisional</span>}
      </Row>
    );
  }
  // adherence fallback
  return (
    <Row label={card.discipline}>
      <span className="text-white/55">{card.adherence?.ratioLabel ?? '—'}</span>
    </Row>
  );
}

export default function StatePerformanceSection() {
  const { cards, headline, loading } = useStateTrends();
  if (loading || cards.length === 0) return null;

  return (
    <div className="px-3 py-3">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase mb-1.5">Performance</div>
      {headline && <div className="text-[14px] font-medium text-white/90 leading-snug mb-2.5">{headline.line}</div>}
      {cards.map((card) => (
        <DisciplineRow key={card.discipline} card={card} />
      ))}
    </div>
  );
}
