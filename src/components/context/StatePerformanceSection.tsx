// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary } from '@shared/state-trend';
import { useStateTrends } from '@/hooks/useStateTrends';
import { trendReceipt, trendEvidence, type Discipline } from '@/lib/trend-receipt';

const VERDICT: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'improving', cls: 'text-emerald-400', arr: '↑' },
  holding: { word: 'holding', cls: 'text-amber-300', arr: '→' },
  sliding: { word: 'sliding', cls: 'text-red-400', arr: '↓' },
  needs_data: { word: 'needs data', cls: 'text-white/40', arr: '' },
};

// D-160: pctChange is the RAW metric delta (classify.ts keeps it raw so the UI knows real direction).
// For lower-is-better disciplines (swim/run pace) an improvement is a NEGATIVE delta — printing it
// verbatim gives "↑ improving −34%". The verdict already encodes good/bad; sign the magnitude by the
// verdict so the number and the arrow always agree. improving → +, sliding → −, holding → raw.
function verdictSignedPct(verdict: string, pct: number | null | undefined): string | null {
  if (pct == null) return null;
  if (verdict === 'improving') return `+${Math.abs(pct)}%`;
  if (verdict === 'sliding') return `−${Math.abs(pct)}%`;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

// One labelled signal ("Power: improving +2%") for the bike dual read.
function Signal({ label, sig }: { label: string; sig: BikeSignal }) {
  const v = VERDICT[sig.verdict];
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-white/50">{label}</span>
      <span className={`inline-flex items-baseline gap-0.5 ${v.cls}`}>
        {v.arr && <span>{v.arr}</span>}<span>{v.word}</span>
      </span>
      {sig.pctChange != null && sig.verdict !== 'needs_data' && <span className="text-white/40">{verdictSignedPct(sig.verdict, sig.pctChange)}</span>}
      {sig.provisional && <span className="text-white/30 text-[10px]">prov</span>}
    </span>
  );
}

// Bike row — Power leads, Efficiency alongside (disagreement surfaced, never collapsed). The
// efficiency basis carries the zone-band source (coggan_ftp = estimated; personal = from test).
function BikeFitnessRow({ fitness }: { fitness: BikeFitness }) {
  const src = fitness.efficiency.basis === 'personal' ? 'personal'
    : fitness.efficiency.basis === 'coggan_ftp' ? 'est (FTP)' : null;
  // D-232 glass-box: one shared evidence tail (window · rides · recency) from the LEAD sub-trend
  // (power leads; efficiency when power has no verdict). Both sub-trends share the same ride set.
  const lead = fitness.power.verdict !== 'needs_data' ? fitness.power : fitness.efficiency;
  const tail = (lead.sampleCount != null && lead.windowDays != null)
    ? trendEvidence({ windowDays: lead.windowDays, sampleCount: lead.sampleCount, newestAgeDays: lead.newestAgeDays, discipline: 'bike' })
    : null;
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase w-[72px] shrink-0 pt-0.5">bike</span>
      <div className="flex-1 text-[12px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        <Signal label="Power" sig={fitness.power} />
        <Signal label="Efficiency" sig={fitness.efficiency} />
        {tail && <span className="text-white/35 text-[10px]">{tail}</span>}
        {src && <span className="text-white/25 text-[10px]">{src}</span>}
      </div>
    </div>
  );
}

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

// D-194: swim rest-fraction (work:rest) trend — a quiet secondary read on the swim row, shown only
// when it has a verdict. "resting less to cover the same distance" = improving (lowerIsBetter, so the
// signed-pct helper already gives the right arrow/sign). Observe the trend; never diagnose the cause.
function RestTag({ rest }: { rest: PerfSummary | null | undefined }) {
  if (!rest || rest.verdict === 'needs_data') return null;
  const v = VERDICT[rest.verdict];
  return (
    <span className={`inline-flex items-baseline gap-1 ${v.cls}`}>
      <span className="text-white/40">· rest</span>
      {v.arr && <span>{v.arr}</span>}
      <span>{v.word}</span>
      {rest.pctChange != null && <span className="text-white/40">{verdictSignedPct(rest.verdict, rest.pctChange)}</span>}
    </span>
  );
}

function DisciplineRow({ card, restTrend }: { card: DisciplineCard; restTrend?: PerfSummary | null }) {
  if (card.primaryAxis === 'performance' && card.headlineVerdict) {
    const v = VERDICT[card.headlineVerdict];
    const perf = card.performance;
    // D-232 glass-box: verdict + receipt (window · samples · recency). Falls back to the legacy
    // verdict+pct render for any row whose spine evidence hasn't populated yet.
    const receipt = (perf?.sampleCount != null && perf.windowDays != null)
      ? trendReceipt({ verdict: card.headlineVerdict, pctChange: perf.pctChange, windowDays: perf.windowDays, sampleCount: perf.sampleCount, newestAgeDays: perf.newestAgeDays, discipline: card.discipline as Discipline })
      : null;
    return (
      <Row label={card.discipline}>
        {receipt ? (
          <span className={`text-[12px] ${v.cls}`}>{receipt}</span>
        ) : (
          <>
            <span className={`inline-flex items-baseline gap-1 ${v.cls}`}>
              {v.arr && <span>{v.arr}</span>}
              <span>{v.word}</span>
            </span>
            {perf?.pctChange != null && <span className="text-white/40">{verdictSignedPct(card.headlineVerdict, perf.pctChange)}</span>}
          </>
        )}
        {PROVISIONAL_PERF.has(card.discipline) && <span className="text-white/30 text-[11px]">provisional</span>}
        {card.discipline === 'swim' && <RestTag rest={restTrend} />}
      </Row>
    );
  }
  // No performance trend yet → the spine set headlineVerdict null (primaryAxis 'adherence'). Show the
  // honest "needs data" in the VERDICT slot (the model's first-class no-trend state, same as bike/run
  // would show), and demote adherence to a neutral, clearly-secondary count. Adherence must never sit
  // in the verdict slot wearing a trend's clothing — that was the category error (adherence ≠ trend).
  const nd = VERDICT.needs_data;
  const perf = card.performance;
  // D-232 glass-box: an actionable needs_data receipt ("Not enough data yet — 0 swims in 8wk (need 3)")
  // where the spine carries the series count (run/swim). Strength has no series here → legacy fallback
  // ("needs data · N unplanned"), left for the H3 strength-row reconciliation (Q-111).
  const ndReceipt = (perf?.sampleCount != null && perf.windowDays != null)
    ? trendReceipt({ verdict: 'needs_data', pctChange: null, windowDays: perf.windowDays, sampleCount: perf.sampleCount, newestAgeDays: perf.newestAgeDays, discipline: card.discipline as Discipline })
    : null;
  return (
    <Row label={card.discipline}>
      {ndReceipt ? (
        <span className={`text-[11px] ${nd.cls}`}>{ndReceipt}</span>
      ) : (
        <>
          <span className={nd.cls}>{nd.word}</span>
          {card.adherence && <span className="text-white/35">· {card.adherence.ratioLabel}</span>}
        </>
      )}
      {card.discipline === 'swim' && <RestTag rest={restTrend} />}
    </Row>
  );
}

export default function StatePerformanceSection() {
  const { cards, headline, bikeFitness, swimRest, loading } = useStateTrends();
  if (loading || cards.length === 0) return null;

  // The bike row shows the dual Power · Efficiency read when either has substance; otherwise it
  // falls through to the standard card (adherence).
  const bikeHasSubstance = !!bikeFitness && (bikeFitness.power.verdict !== 'needs_data' || bikeFitness.efficiency.verdict !== 'needs_data');

  return (
    <div className="px-3 py-3">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase mb-1.5">Performance</div>
      {headline && <div className="text-[14px] font-medium text-white/90 leading-snug mb-2.5">{headline.line}</div>}
      {cards.map((card) =>
        card.discipline === 'bike' && bikeHasSubstance
          ? <BikeFitnessRow key="bike" fitness={bikeFitness!} />
          : <DisciplineRow key={card.discipline} card={card} restTrend={card.discipline === 'swim' ? swimRest : null} />,
      )}
    </div>
  );
}
