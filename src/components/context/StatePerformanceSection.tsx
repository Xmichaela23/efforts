// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary, RunFitness, DecouplingBand, StrengthFitness, StateDisplayV1 } from '@shared/state-trend';
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
  const leadIsPower = fitness.power.verdict !== 'needs_data';
  const range = (fitness as any).range as { positionPct: number; confident: boolean } | null | undefined;
  const showDot = range != null && lead.verdict !== 'needs_data';
  return (
    <Row label="bike">
      {showDot ? (
        <FitnessDotBlock label={leadIsPower ? 'power' : 'bike efficiency'} range={range!} verdict={lead.verdict} provisional={(lead as any).provisional} />
      ) : (
        <Signal label="Power" sig={fitness.power} />
      )}
      {/* the OTHER read stays a quiet secondary chip */}
      {leadIsPower && fitness.efficiency.verdict !== 'needs_data' && <Signal label="Efficiency" sig={fitness.efficiency} />}
      {tail && <span className="text-white/35 text-[10px]">{tail}</span>}
      {src && <span className="text-white/25 text-[10px]">{src}</span>}
      {asOf(lead.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(lead.newestAgeDays)}</span>}
    </Row>
  );
}

// STRENGTH row — VOLUME direction LEADS (activity/load fact: up/steady/down), e1RM is the secondary
// fitness read (rendered ONLY when there's a trend to hold — thin → clause dropped, no "holding"
// claim), session count is the receipt, "unplanned" a dim receipt. Volume DOWN is neutral-colored,
// not red (a deload/taper isn't a fitness loss). Industry-standard (Strong/Hevy/JEFIT).
const VOLUME_WORD: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'up', cls: 'text-emerald-400', arr: '↑' },
  holding: { word: 'steady', cls: 'text-amber-300', arr: '→' },
  sliding: { word: 'down', cls: 'text-white/50', arr: '↓' },
  needs_data: { word: 'needs data', cls: 'text-white/40', arr: '' },
};

function StrengthFitnessRow({ fitness }: { fitness: StrengthFitness }) {
  const vol = fitness.volume;
  const e = fitness.e1rm;
  const vv = VOLUME_WORD[vol.verdict];
  const range = (vol as any).range as { positionPct: number; confident: boolean } | null | undefined;
  return (
    <Row label="strength">
      {range && vol.verdict !== 'needs_data' ? (
        <FitnessDotBlock label="volume" range={range} verdict={vol.verdict} provisional={vol.provisional} wordMap={VOLUME_WORD} />
      ) : vol.verdict !== 'needs_data' ? (
        <span className="inline-flex items-baseline gap-1">
          <span className="text-white/50">Volume</span>
          <span className={`inline-flex items-baseline gap-0.5 ${vv.cls}`}>{vv.arr && <span>{vv.arr}</span>}<span>{vv.word}</span></span>
          <span className="text-white/30 text-[10px]">over 6wk</span>
        </span>
      ) : (
        <span className="text-white/40">volume needs 2+ sessions to trend</span>
      )}
      {fitness.sessionsThisWeek > 0 && (
        <span className="text-white/35 text-[11px]">{fitness.sessionsThisWeek} session{fitness.sessionsThisWeek === 1 ? '' : 's'} this week</span>
      )}
      {/* e1RM SECONDARY — only when there IS a trend to hold; thin → drop the clause (no "holding" claim) */}
      {e && (
        <span className="inline-flex items-baseline gap-1">
          <span className="text-white/40">e1RM</span>
          <span className={`inline-flex items-baseline gap-0.5 ${VERDICT[e.verdict].cls}`}>{VERDICT[e.verdict].arr && <span>{VERDICT[e.verdict].arr}</span>}<span>{VERDICT[e.verdict].word}</span></span>
        </span>
      )}
      {fitness.unplanned > 0 && <span className="text-white/25 text-[10px]">· {fitness.unplanned} unplanned</span>}
      {vol.provisional && <span className="text-white/30 text-[10px]">prov</span>}
      {asOf(vol.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(vol.newestAgeDays)}</span>}
    </Row>
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

// Tier 1 — RUN row: DECOUPLING (aerobic durability) LEADS. The band is the plain-language VERDICT
// (band = state), the trend arrow is the direction, the % is the receipt; efficiency_index is the
// quiet SECONDARY. Q-161: banded to the one science-backed line (Friel/TrainingPeaks ~5%) — ≤5% =
// base sound, >5% = build more base. Honesty gates: stale → carry-forward "last steady run Nd ago"
// (never a current verdict); sparse → "needs 20+ min steady effort" (what the metric needs, not what
// the user did wrong); the label SCOPES the claim to steady runs (not intervals/short runs).
const DECOUPLING_BAND: Record<DecouplingBand, { word: string; cls: string }> = {
  sound: { word: 'aerobic base is sound', cls: 'text-emerald-300' },
  needs_work: { word: 'aerobic base needs work', cls: 'text-amber-400/90' },
};

// State v3 fitness DOT — the current value's position in the athlete's OWN 12-week range (left = worst,
// right = best; the server orients positionPct so 1 = best for any metric). Confident → bright dot; thin
// or flat data → grey (a positioned dot on thin data is a lie with a coordinate). No number on the dot —
// the POSITION is the claim; a percent would relocate false precision onto it (SPEC §4).
function FitnessDot({ pct, confident }: { pct: number; confident: boolean }) {
  const left = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
  return (
    <div className="basis-full mt-1.5 mb-0.5">
      <div className="relative h-1 rounded-full bg-white/[0.08]">
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full"
          style={{
            left, transform: 'translate(-50%, -50%)',
            backgroundColor: confident ? '#d1d5db' : '#6b7280',
            boxShadow: confident ? '0 0 6px rgba(255,255,255,0.35)' : 'none',
          }}
        />
      </div>
    </div>
  );
}

// Shared dot+arrow block: metric name + trend ARROW on top, the DOT (level in the 12wk range) below, the
// relative-frame label under it. Used by bike/swim/strength; run has its own (adds an "i" explainer).
function FitnessDotBlock({ label, range, verdict, provisional, wordMap = VERDICT }: {
  label: string;
  range: { positionPct: number; confident: boolean };
  verdict: TrendVerdict;
  provisional?: boolean;
  wordMap?: Record<TrendVerdict, { word: string; cls: string; arr: string }>;
}) {
  const v = wordMap[verdict];
  return (
    <>
      <span className="basis-full flex items-baseline justify-between gap-2">
        <span className="text-white/55 text-[12px]">{label}</span>
        {verdict !== 'needs_data' && (
          <span className={`inline-flex items-baseline gap-0.5 text-[11px] ${v.cls}`}>{v.arr && <span>{v.arr}</span>}<span>{v.word}</span>{provisional && <span className="text-white/30 text-[10px] ml-1">prov</span>}</span>
        )}
      </span>
      <FitnessDot pct={range.positionPct} confident={range.confident} />
      <span className="basis-full flex items-center justify-between text-[9px] text-white/25">
        <span>weaker</span><span>{range.confident ? 'vs your 12-week range' : 'thin data'}</span><span>stronger</span>
      </span>
    </>
  );
}

// RUN row — State v3: DECOUPLING as a DOT (where you are in your 12wk range) + an ARROW (which way). The
// dot answers the LEVEL, the arrow answers the TREND — so "needs work" and "improving" can no longer read
// as the app arguing with itself. The old clipped verdict ("aerobic base needs work ↑ improving 6%") is
// gone. efficiency_index stays a quiet secondary arrow.
function RunFitnessRow({ fitness }: { fitness: RunFitness }) {
  const d = fitness.decoupling;
  const v = VERDICT[d.verdict];
  const range = (d as any).range as { positionPct: number; confident: boolean } | null | undefined;
  const [explainOpen, setExplainOpen] = React.useState(false);
  const showDot = d.verdict !== 'needs_data' && range != null;
  return (
    <Row label="run">
      {showDot ? (
        <>
          <span className="basis-full flex items-baseline justify-between gap-2">
            <button type="button" onClick={() => setExplainOpen((o) => !o)} className="inline-flex items-baseline gap-1 text-white/55 text-[12px]">
              aerobic durability <span className="text-white/30 text-[9px]">{explainOpen ? '▾' : 'ⓘ'}</span>
            </button>
            <span className={`inline-flex items-baseline gap-0.5 text-[11px] ${v.cls}`}>{v.arr && <span>{v.arr}</span>}<span>{v.word}</span>{d.provisional && <span className="text-white/30 text-[10px] ml-1">prov</span>}</span>
          </span>
          <FitnessDot pct={range!.positionPct} confident={range!.confident} />
          <span className="basis-full flex items-center justify-between text-[9px] text-white/25">
            <span>weaker</span>
            <span>{range!.confident ? 'vs your 12-week range' : 'thin data'}</span>
            <span>stronger</span>
          </span>
        </>
      ) : d.stale ? (
        <span className="inline-flex items-baseline gap-1.5 text-white/40">
          <span>aerobic durability</span>
          <span className="text-white/30 text-[11px]">last steady run {d.newestAgeDays}d ago</span>
          <span className="text-white/30 text-[10px]">limited data</span>
        </span>
      ) : (
        <span className="text-white/40">needs 20+ min steady effort</span>
      )}
      {asOf(d.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(d.newestAgeDays)}</span>}
      {explainOpen && (
        <p className="basis-full text-[10px] text-white/40 leading-snug mt-1 max-w-[min(100%,340px)]">
          The dot is where your aerobic durability sits versus your own last 12 weeks — how much your heart rate drifts on a long steady run. Left is the weakest it's been, right the strongest. It's a relative frame, not an absolute score.
        </p>
      )}
      {/* efficiency_index secondary REMOVED — the clipped "Efficiency ↓ sliding" chip re-introduced the
          telegram voice next to a clean dot. The run row is ONE read now: the durability dot + arrow. */}
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
    const range = (perf as any)?.range as { positionPct: number; confident: boolean } | null | undefined;
    return (
      <Row label={card.discipline}>
        {range ? (
          <>
            <FitnessDotBlock label={metricLabel ? metricLabel.toLowerCase() : card.discipline} range={range} verdict={card.headlineVerdict} />
            {evidence && <span className="basis-full text-white/35 text-[10px]">{evidence}</span>}
          </>
        ) : (
          <>
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
          </>
        )}
        {thinStale && <span className="text-white/30 text-[10px]">limited data</span>}
        {asOf(perf?.newestAgeDays) && <span className="text-white/25 text-[10px]">· {asOf(perf?.newestAgeDays)}</span>}
        {PROVISIONAL_PERF.has(card.discipline) && <span className="text-white/30 text-[11px]">provisional</span>}
        {/* swim rest-fraction chip removed — "rest ↓ sliding −38.2%" was the same clipped telegram voice
            next to a clean dot. The swim row is the pace dot + arrow. */}
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

// Q-179 — WHAT THE ATHLETE SAID, next to what the numbers did.
//
// The line is MINTED ON THE SERVER (`_shared/state-trend/posture.ts`). This renders it and decides
// nothing — Constitution Law 4. If the athlete declared no posture, `postureSentence` is null and
// this renders nothing at all, so a user without a declared intent sees exactly what they saw before.
//
// The bug it closes: the athlete declared run='maintain' while building strength, ran 3x/month
// instead of 19x, got slower at the same effort — precisely what maintaining implies — and this
// screen said "aerobic base needs work" in amber. Every number above this line was correct. The app
// simply never asked what he was trying to do.
//
// Deliberately NOT amber, NOT a warning, NOT an icon. A trade is not a failure (SPEC-posture-flag §6).
function PostureLine({ card }: { card: DisciplineCard }) {
  const sentence = (card as any).postureSentence as string | null | undefined;
  if (!sentence) return null;
  const concern = (card as any).postureRead === 'develop_declining' || (card as any).postureRead === 'develop_stalled';
  return (
    <p className={`pl-[62px] pr-1 -mt-0.5 mb-1.5 text-[11px] leading-snug max-w-[min(100%,360px)] ${concern ? 'text-amber-400/80' : 'text-white/45'}`}>
      {sentence}
    </p>
  );
}

export default function StatePerformanceSection({ strengthDetail, stateDisplay }: { strengthDetail?: React.ReactNode; stateDisplay?: StateDisplayV1 | null }) {
  // S2: `stateDisplay` is the server-assembled display contract from the coach payload. When present the
  // hook renders it (no in-browser queries/assembly); absent → legacy live path (safe rollout fallback).
  const { cards, bikeFitness, runFitness, strengthFitness, swimRest, cadenceCounts, loading } = useStateTrends(stateDisplay);
  if (loading || cards.length === 0) return null;

  // The bike row shows the dual Power · Efficiency read when either has substance; otherwise it
  // falls through to the standard card (adherence).
  const bikeHasSubstance = !!bikeFitness && (bikeFitness.power.verdict !== 'needs_data' || bikeFitness.efficiency.verdict !== 'needs_data');
  // The run row shows the dual Decoupling · Efficiency read when there's decoupling substance
  // (a verdict, OR a stale-but-real value to carry forward) or an efficiency verdict; else it
  // falls through to the standard card (adherence). Mirrors bike.
  const runHasSubstance = !!runFitness && (runFitness.decoupling.verdict !== 'needs_data' || runFitness.decoupling.stale || runFitness.efficiency.verdict !== 'needs_data');
  // Strength shows the Volume · e1RM · sessions composite when volume trends or e1RM has a verdict;
  // else the adherence card. Volume gives the row a real verdict so it stops falling to the shrug.
  const strengthHasSubstance = !!strengthFitness && (strengthFitness.volume.verdict !== 'needs_data' || strengthFitness.e1rm != null || strengthFitness.sessionsThisWeek > 0);

  // Dynamic ordering: most-trained discipline first, by STABLE 90d session count (cadenceCounts) so
  // rows don't jump per-load; ties keep the canonical ORDER. Activity facts only — no inferred importance.
  const ORDER_IDX: Record<string, number> = { strength: 0, bike: 1, run: 2, swim: 3 };
  const sortedCards = [...cards].sort((a, b) => {
    const ca = cadenceCounts[a.discipline] ?? 0, cb = cadenceCounts[b.discipline] ?? 0;
    if (cb !== ca) return cb - ca;
    return (ORDER_IDX[a.discipline] ?? 9) - (ORDER_IDX[b.discipline] ?? 9);
  });

  return (
    <div className="px-3 py-3">
      {/* Section clock label: PERFORMANCE is the SLOW clock. Per-row windows (8wk, steady runs,
          over 6wk, as-of dates) are receipts that inherit this and add specifics. */}
      <div className="mb-2.5 flex items-baseline gap-2">
        {/* Named "Fitness" (not "Performance") so it can't be confused with the per-workout Performance
            tab that grades a single session. This card is the multi-week fitness TREND. */}
        <span className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase">Fitness</span>
        <span className="text-[10px] text-white/30 lowercase">trends over recent weeks</span>
      </div>
      {/* NO aggregate roll-up (Michael 2026-07-04): a cross-discipline headline ("Building — bike up,
          run up") is a lossy, cherry-picking, clock-mismatched summary (run 6wk vs bike 8wk). Fitness
          is handed to the individual sport rows below — each owns its own verdict AND its own window. */}
      {sortedCards.map((card) => {
        const inner = (() => {
          if (card.discipline === 'bike' && bikeHasSubstance) return <BikeFitnessRow fitness={bikeFitness!} />;
          if (card.discipline === 'run' && runHasSubstance) return <RunFitnessRow fitness={runFitness!} />;
          if (card.discipline === 'strength' && strengthHasSubstance) return <><StrengthFitnessRow fitness={strengthFitness!} />{strengthDetail}</>;
          const row = <DisciplineRow card={card} restTrend={card.discipline === 'swim' ? swimRest : null} />;
          // Q-107 H3: nest the per-lift detail directly under the STRENGTH trend row — one STRENGTH header,
          // the lifts as provisional "from your logged sets" detail (no competing second top-line).
          return (card.discipline === 'strength' && strengthDetail) ? <>{row}{strengthDetail}</> : row;
        })();
        return (
          <React.Fragment key={card.discipline}>
            {inner}
            <PostureLine card={card} />
          </React.Fragment>
        );
      })}
      {/* defensive: if there's no strength trend card at all, still surface the per-lift detail */}
      {strengthDetail && !cards.some((c) => c.discipline === 'strength') && strengthDetail}
    </div>
  );
}
