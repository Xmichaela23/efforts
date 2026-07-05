// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary, RunFitness, DecouplingBand } from '@shared/state-trend';
import { useStateTrends } from '@/hooks/useStateTrends';
import { trendReceipt, trendEvidence, trendHeadline, type Discipline } from '@/lib/trend-receipt';

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

// "as of {date}" — the date of the newest data point behind a row's number, from the spine's
// newestAgeDays. Makes freshness LEGIBLE per metric so a current number isn't mistaken for stale
// (the BODY-4.8 lesson). Null when there's no dated data (needs_data rows).
function asOf(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays < 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - Math.round(ageDays));
  return `as of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// Bike row — Power leads, Efficiency alongside (disagreement surfaced, never collapsed). The
// efficiency basis carries the zone-band source (coggan_ftp = estimated; personal = from test).
function BikeFitnessRow({ fitness }: { fitness: BikeFitness }) {
  const src = fitness.efficiency.basis === 'personal' ? 'personal'
    : fitness.efficiency.basis === 'coggan_ftp' ? 'est (FTP)' : null;
  // D-232 glass-box: the shared evidence tail (window · rides · recency) is the LEAD sub-trend's
  // (power leads; efficiency when power has no verdict). Power and efficiency do NOT always rest on
  // the same rides — power counts w20>0, efficiency counts clean HR-at-band (D-237: corrupt-HR rides
  // are excluded from efficiency, not power). So when efficiency's own sample count differs, surface it.
  const lead = fitness.power.verdict !== 'needs_data' ? fitness.power : fitness.efficiency;
  const tail = (lead.sampleCount != null && lead.windowDays != null)
    ? trendEvidence({ windowDays: lead.windowDays, sampleCount: lead.sampleCount, newestAgeDays: lead.newestAgeDays, discipline: 'bike' })
    : null;
  const effN = fitness.efficiency.verdict !== 'needs_data' ? fitness.efficiency.sampleCount ?? null : null;
  const showEffN = effN != null && lead.sampleCount != null && effN !== lead.sampleCount;
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase w-[72px] shrink-0 pt-0.5">bike</span>
      <div className="flex-1 text-[12px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
        <Signal label="Power" sig={fitness.power} />
        <span className="inline-flex items-baseline gap-1">
          <Signal label="Efficiency" sig={fitness.efficiency} />
          {/* item 2: efficiency rests on a SUBSET of the row's rides (D-237 excludes corrupt-HR rides
              from efficiency, not power). Label it "N clean-HR" so it reads as efficiency's own count,
              not a leftover of the tail's window ride-count. */}
          {showEffN && <span className="text-white/30 text-[10px]">· {effN} clean-HR</span>}
        </span>
        {tail && <span className="text-white/35 text-[10px]">{tail}</span>}
        {src && <span className="text-white/25 text-[10px]">{src}</span>}
        {asOf(lead.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(lead.newestAgeDays)}</span>}
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

// Tier 1 — RUN row: DECOUPLING (aerobic durability) LEADS. The Friel band is the plain-language
// VERDICT (band = state), the trend arrow is the direction, the % is the receipt; efficiency_index is
// the quiet SECONDARY. Bands are a Friel/TrainingPeaks COACHING STANDARD, not a lab cutoff.
// Honesty gates: stale → carry-forward "last steady run Nd ago" (never a current verdict); sparse →
// "needs 20+ min steady effort" (what the metric needs, not what the user did wrong); the label
// SCOPES the claim to steady runs (it did not measure intervals/short runs).
const DECOUPLING_BAND: Record<DecouplingBand, { word: string; cls: string }> = {
  excellent: { word: 'excellent aerobic fitness', cls: 'text-emerald-300' },
  strong: { word: 'strong aerobic base', cls: 'text-emerald-400/90' },
  base: { word: 'building aerobic base', cls: 'text-sky-400/85' },
  durability_gap: { word: 'durability gap', cls: 'text-amber-400/90' },
};

function RunFitnessRow({ fitness }: { fitness: RunFitness }) {
  const d = fitness.decoupling;
  const e = fitness.efficiency;
  const v = VERDICT[d.verdict];
  return (
    <Row label="run">
      {d.verdict !== 'needs_data' && d.band ? (
        // confident: band = state, arrow = trend, % = receipt
        <span className="inline-flex items-baseline gap-1.5">
          <span className={DECOUPLING_BAND[d.band].cls}>{DECOUPLING_BAND[d.band].word}</span>
          <span className={`inline-flex items-baseline gap-0.5 ${v.cls}`}>{v.arr && <span>{v.arr}</span>}<span>{v.word}</span></span>
          {d.recentPct != null && <span className="text-white/35 text-[11px]">{d.recentPct}%</span>}
          {d.provisional && <span className="text-white/30 text-[10px]">prov</span>}
        </span>
      ) : d.stale && d.recentPct != null && d.band ? (
        // stale → carry-forward the REAL value + its age, dimmed; never a current verdict off old data
        <span className="inline-flex items-baseline gap-1.5 text-white/40">
          <span>{DECOUPLING_BAND[d.band].word}</span>
          <span className="text-white/30 text-[11px]">last steady run {d.newestAgeDays}d ago · {d.recentPct}%</span>
          <span className="text-white/30 text-[10px]">limited data</span>
        </span>
      ) : (
        // sparse → frame as what the metric needs, not a user failing
        <span className="text-white/40">needs 20+ min steady effort</span>
      )}
      <span className="text-white/25 text-[10px]">aerobic durability · steady runs</span>
      {asOf(d.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(d.newestAgeDays)}</span>}
      {e.verdict !== 'needs_data' && (
        <span className="inline-flex items-baseline gap-1">
          <span className="text-white/40">Efficiency</span>
          <span className={`inline-flex items-baseline gap-0.5 ${VERDICT[e.verdict].cls}`}>{VERDICT[e.verdict].arr && <span>{VERDICT[e.verdict].arr}</span>}<span>{VERDICT[e.verdict].word}</span></span>
        </span>
      )}
    </Row>
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
    // name the metric like bike does. Q-110: RUN now reads pace-at-HR EFFICIENCY (same-HR-faster =
    // fitter), so it's labelled "Efficiency" to match bike. Swim stays "Pace" (pace per 100).
    const metricLabel = card.discipline === 'run' ? 'Efficiency'
      : card.discipline === 'swim' ? 'Pace'
      : card.discipline === 'bike' ? 'Power' : null;
    // item 4: a THIN + STALE trend must not render at full confidence. De-weight (dim + "limited
    // data") when < 5 samples AND newest point > 21d old — the counts are already at the render.
    const thinStale = (perf?.sampleCount ?? 99) < 5 && (perf?.newestAgeDays ?? 0) > 21;
    const vCls = thinStale ? 'text-white/40' : v.cls;
    // D-232 glass-box: verdict-colored delta + a DIMMED evidence tail (window · samples · recency).
    const hasEvidence = perf?.sampleCount != null && perf.windowDays != null;
    const evidence = hasEvidence
      ? trendEvidence({ windowDays: perf!.windowDays!, sampleCount: perf!.sampleCount!, newestAgeDays: perf!.newestAgeDays, discipline: card.discipline as Discipline })
      : null;
    return (
      <Row label={card.discipline}>
        {metricLabel && <span className="text-white/50 text-[12px]">{metricLabel}</span>}
        {hasEvidence ? (
          <>
            <span className={`text-[12px] ${vCls}`}>{trendHeadline(card.headlineVerdict, perf!.pctChange)}</span>
            <span className="text-white/35 text-[11px]">{evidence}</span>
          </>
        ) : (
          <>
            <span className={`inline-flex items-baseline gap-1 ${vCls}`}>
              {v.arr && <span>{v.arr}</span>}
              <span>{v.word}</span>
            </span>
            {perf?.pctChange != null && <span className={thinStale ? 'text-white/30' : 'text-white/40'}>{verdictSignedPct(card.headlineVerdict, perf.pctChange)}</span>}
          </>
        )}
        {thinStale && <span className="text-white/30 text-[10px]">limited data</span>}
        {asOf(perf?.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(perf?.newestAgeDays)}</span>}
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
    ? trendReceipt({ verdict: 'needs_data', pctChange: null, windowDays: perf.windowDays, sampleCount: perf.sampleCount, newestAgeDays: perf.newestAgeDays, stale: perf.stale, floor: perf.minSessions, discipline: card.discipline as Discipline })
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

export default function StatePerformanceSection({ strengthDetail }: { strengthDetail?: React.ReactNode }) {
  const { cards, headline, bikeFitness, runFitness, swimRest, loading } = useStateTrends();
  if (loading || cards.length === 0) return null;

  // The bike row shows the dual Power · Efficiency read when either has substance; otherwise it
  // falls through to the standard card (adherence).
  const bikeHasSubstance = !!bikeFitness && (bikeFitness.power.verdict !== 'needs_data' || bikeFitness.efficiency.verdict !== 'needs_data');
  // The run row shows the dual Decoupling · Efficiency read when there's decoupling substance
  // (a verdict, OR a stale-but-real value to carry forward) or an efficiency verdict; else it
  // falls through to the standard card (adherence). Mirrors bike.
  const runHasSubstance = !!runFitness && (runFitness.decoupling.verdict !== 'needs_data' || runFitness.decoupling.stale || runFitness.efficiency.verdict !== 'needs_data');

  return (
    <div className="px-3 py-3">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase mb-1.5">Performance</div>
      {headline && <div className="text-[14px] font-medium text-white/90 leading-snug mb-2.5">{headline.line}</div>}
      {cards.map((card) => {
        if (card.discipline === 'bike' && bikeHasSubstance) return <BikeFitnessRow key="bike" fitness={bikeFitness!} />;
        if (card.discipline === 'run' && runHasSubstance) return <RunFitnessRow key="run" fitness={runFitness!} />;
        const row = <DisciplineRow key={card.discipline} card={card} restTrend={card.discipline === 'swim' ? swimRest : null} />;
        // Q-107 H3: nest the per-lift detail directly under the STRENGTH trend row — one STRENGTH header,
        // the lifts as provisional "from your logged sets" detail (no competing second top-line).
        return (card.discipline === 'strength' && strengthDetail)
          ? <React.Fragment key="strength">{row}{strengthDetail}</React.Fragment>
          : row;
      })}
      {/* defensive: if there's no strength trend card at all, still surface the per-lift detail */}
      {strengthDetail && !cards.some((c) => c.discipline === 'strength') && strengthDetail}
    </div>
  );
}
