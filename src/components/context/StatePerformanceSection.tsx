// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary, RunFitness, DecouplingBand, StrengthFitness, StateDisplayV1, SwimVolume, FitnessMode, FitnessAnchor } from '@shared/state-trend';
import { useStateTrends } from '@/hooks/useStateTrends';
import { useAppContext } from '@/contexts/AppContext';
import { trendReceipt, trendEvidence, trendHeadline, type Discipline } from '@/lib/trend-receipt';

const VERDICT: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'improving', cls: 'text-emerald-400', arr: '↑' },
  holding: { word: 'holding', cls: 'text-amber-300', arr: '→' },
  sliding: { word: 'sliding', cls: 'text-red-400', arr: '↓' },
  needs_data: { word: 'needs data', cls: 'text-white/40', arr: '' },
  withheld: { word: 'too few to read', cls: 'text-white/40', arr: '' },
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
      {sig.provisional && <span className="text-white/30 text-[11px]">prov</span>}
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
function BikeFitnessRow({ fitness, showAxis, mode, anchor }: { fitness: BikeFitness; showAxis?: boolean; mode: FitnessMode; anchor?: FitnessAnchor }) {
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
  const anchored = mode === 'anchored';
  // SLICE 1: a dot only when ANCHORED — bike is anchored only once the athlete ACCEPTS its FTP estimate
  // (basis flips to 'personal'). On est(FTP) it's TREND-ONLY: the arrow + "no baseline set · accept your
  // FTP", never a dot on an estimate the athlete never confirmed.
  const showDot = anchored && range != null && lead.verdict !== 'needs_data';
  const trendOnly = !anchored && lead.verdict !== 'needs_data';
  return (
    <Row label="bike">
      {showDot ? (
        <FitnessDotBlock label={leadIsPower ? 'power' : 'efficiency'} range={range!} verdict={lead.verdict} showAxis={showAxis} explain={leadIsPower
          ? "Power = how your cycling power is trending versus your own baseline (from your ride power against your FTP). The dot is where it sits, the arrow the direction."
          : "Efficiency = how much power you hold per heartbeat on steady rides. Rising means you’re doing the same work at a lower heart rate — your aerobic engine getting fitter. The dot is where it sits versus your baseline; the arrow is the direction."} />
      ) : (
        <Signal label={leadIsPower ? 'Power' : 'Efficiency'} sig={lead} />
      )}
      {tail && <span className="text-white/35 text-[11px]">{tail}</span>}
      {src && <span className="text-white/25 text-[11px]">{src}</span>}
      {asOf(lead.newestAgeDays) && <span className="text-white/25 text-[11px]">· {asOf(lead.newestAgeDays)}</span>}
      {trendOnly && <NoBaselineTag hint={src === 'est (FTP)' ? 'accept your FTP to anchor' : undefined} />}
      {showDot && anchor?.label && <span className="basis-full text-[10px] text-white/30">{anchor.label}</span>}
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
  withheld: { word: 'too few to read', cls: 'text-white/40', arr: '' },
};

// STRENGTH row — PER-LIFT estimated 1RM read (Strong/Hevy + RTS/RP, verified vs field + science 2026-07-19).
// Supersedes the rolled-up "getting stronger" verdict + baseline dot. Commercial strength apps show each MAIN
// LIFT's estimated 1RM, its trend, and a PR flag, referenced to YOUR OWN best — not a typed baseline (which the
// field doesn't use and which pegged the dot dumb once you passed it). Each lift's direction is already
// NOISE-GUARDED on the spine (computeStrengthState) so a single session can't fake up/down; the estimate itself
// is RIR-adjusted + near-failure-weighted (compute-facts brzycki1RM + D-118), which is the science's own caveat.
// Receipts kept PER LIFT (sessions · as of). The grinding/RIR fatigue line (D-302) stays below — a distinct
// fatigue axis, not the number. planWeek/isDevelop/the develop word-map are gone with the rolled-up verdict.
function StrengthFitnessRow({ fitness, fatigue }: { fitness: StrengthFitness; fatigue?: boolean }) {
  // Main lifts with a real e1RM number; primaries lead (squat/bench/deadlift/press — the field's "main lifts").
  const lifts = fitness.perLift.filter((l) => l.isPrimary && l.latestE1rm != null);
  // Direction chip off the GUARDED per-lift verdict. Up = green, flat = neutral, down = amber (a single lift
  // dipping is not an alarm). needs_data/withheld → a number with no trend yet ("new").
  const dir = (l: (typeof lifts)[number]) => {
    if (l.direction === 'improving') return { arr: '↑', text: verdictSignedPct('improving', l.pctChange) ?? 'up', cls: 'text-emerald-400' };
    if (l.direction === 'sliding')   return { arr: '↓', text: verdictSignedPct('sliding', l.pctChange) ?? 'down', cls: 'text-amber-300' };
    if (l.direction === 'holding')   return { arr: '→', text: 'flat', cls: 'text-white/45' };
    return { arr: '', text: 'new', cls: 'text-white/35' };
  };
  // PR = a REAL PR — a genuine new ALL-TIME high estimated 1RM (Michael 2026-07-21: "a PR should be a
  // real PR, basically a new 1RM"). Was best-of-6-weeks, which fired on almost every progressing lift
  // and even stamped a lift reading "new". Now: the latest must top the athlete's all-history best, and
  // there must be real history to have beaten (≥3 all-time points). Null all-time data → NEVER a PR.
  const isPR = (l: (typeof lifts)[number]) =>
    l.latestE1rm != null && (l as any).allTimeBestE1rm != null && ((l as any).allTimeCount ?? 0) >= 3 &&
    l.latestE1rm >= (l as any).allTimeBestE1rm - 0.5;
  return (
    <Row label="strength">
      {lifts.length === 0 ? (
        <span className="text-white/40">needs 2+ logged lifts to trend</span>
      ) : (
        <>
          <span className="basis-full text-white/30 text-[10px] uppercase tracking-wider">estimated 1-rep max · last 6 weeks</span>
          {lifts.map((l) => {
            const d = dir(l);
            return (
              <React.Fragment key={l.canonical}>
                <span className="basis-full flex items-baseline justify-between gap-2">
                  <span className="text-white/80 text-[13px]">{l.displayName}</span>
                  <span className="inline-flex items-baseline gap-2 text-[12px]">
                    {/* "~" marks it as an ESTIMATE, not a tested max — it's a projection off your logged sets
                        (RIR-adjusted), most reliable near failure. Provisional (below) clears as sessions stack. */}
                    <span className="text-white/75">~{Math.round(l.latestE1rm as number)} lb</span>
                    {isPR(l) && <span className="text-emerald-300 text-[9px] uppercase tracking-wide font-semibold">PR</span>}
                    {/* A real PR carries "it went up" — so suppress the bare "new" direction next to it
                        (the "PR · new" contradiction). Real trend arrows still show alongside PR. */}
                    {!(isPR(l) && d.text === 'new') && (
                      <span className={`inline-flex items-baseline gap-0.5 ${d.cls}`}>{d.arr && <span>{d.arr}</span>}<span>{d.text}</span></span>
                    )}
                  </span>
                </span>
                <span className="basis-full text-white/30 text-[10px] -mt-0.5">
                  {l.sampleCount} session{l.sampleCount === 1 ? '' : 's'}{asOf(l.newestAgeDays) ? ` · ${asOf(l.newestAgeDays)}` : ''}{l.provisional ? ' · provisional' : ''}
                </span>
              </React.Fragment>
            );
          })}
        </>
      )}
      {/* AUTOREGULATION read — the FATIGUE axis, distinct from the e1RM numbers above (D-302 slice 2). Grinding
          shows as RIR below prescription BEFORE it shows in e1RM. Sourced from the spine's
          `strength_rir_below_prescription` — rendered here, NOT recomputed, pulled from the nudge list so it
          lives in ONE place. ⚠ WORDING placeholder to tune to voice: fact-first, conditional, no imperative. */}
      {fatigue && (
        <span className="basis-full text-[12px] text-amber-300/80 leading-snug mt-1">
          Reps in reserve have run below target — you're training closer to failure than the plan called for. Sustained, that's the fatigue a deload clears.
        </span>
      )}
    </Row>
  );
}

// Swim performance stays provisional until Q-038 is fixed (run approved 2026-06-13); flag it
// in the UI. This row-level tag is separate from headline gating (HEADLINE_GATED_DISCIPLINES).
const PROVISIONAL_PERF = new Set(['swim']);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-white/[0.055] last:border-0">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-white/70 uppercase w-[72px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-[13px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none">
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
function FitnessDot({ pct, confident, tickPct, overflow }: { pct: number; confident: boolean; tickPct?: number | null; overflow?: 'better' | 'worse' | null }) {
  const left = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`;
  const tickLeft = tickPct != null ? `${Math.round(Math.max(0, Math.min(1, tickPct)) * 100)}%` : null;
  return (
    <div className="basis-full mt-1.5 mb-0.5">
      <div className="relative h-1 rounded-full bg-white/[0.08]">
        {/* The TICK — the anchor/baseline on the same band. A vertical mark; when the anchor is BETTER than
            the recent range (overflow) it pins at the edge with a caret ("you've been better than recently"). */}
        {tickLeft != null && (
          <div className="absolute top-1/2 h-3 w-[2px] rounded" style={{ left: tickLeft, transform: 'translate(-50%, -50%)', backgroundColor: 'rgba(255,255,255,0.4)' }}>
            {overflow === 'better' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-white/40 text-[10px]">›</span>}
          </div>
        )}
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
function FitnessDotBlock({ label, range, verdict, provisional, wordMap = VERDICT, showAxis = true, frame = 'vs your 12-week range', explain }: {
  label: string;
  range: { positionPct: number; confident: boolean };
  verdict: TrendVerdict;
  provisional?: boolean;
  wordMap?: Record<TrendVerdict, { word: string; cls: string; arr: string }>;
  showAxis?: boolean; // the "weaker / frame / stronger" grammar renders on the FIRST band only (item 7)
  frame?: string;
  explain?: string; // when set, the label becomes a tap-ⓘ that reveals this plain-language definition
}) {
  const v = wordMap[verdict];
  const [explainOpen, setExplainOpen] = React.useState(false);
  return (
    <>
      <span className="basis-full flex items-baseline justify-between gap-2">
        {explain ? (
          <button type="button" onClick={() => setExplainOpen((o) => !o)} className="inline-flex items-baseline gap-1 text-white/55 text-[13px]">
            {label} <span className="text-white/30 text-[10px]">{explainOpen ? '▾' : 'ⓘ'}</span>
          </button>
        ) : (
          <span className="text-white/55 text-[13px]">{label}</span>
        )}
        {verdict !== 'needs_data' && (
          <span className={`inline-flex items-baseline gap-0.5 text-[12px] ${v.cls}`}>{v.arr && <span>{v.arr}</span>}<span>{v.word}</span>{provisional && <span className="text-white/30 text-[11px] ml-1">provisional</span>}</span>
        )}
      </span>
      <FitnessDot pct={range.positionPct} confident={range.confident} />
      {showAxis ? (
        <span className="basis-full flex items-center justify-between text-[10px] text-white/25">
          <span>weaker</span><span>{range.confident ? frame : 'thin data'}</span><span>stronger</span>
        </span>
      ) : !range.confident ? (
        <span className="basis-full text-center text-[10px] text-white/25">thin data</span>
      ) : null}
      {explain && explainOpen && (
        <p className="basis-full text-[11px] text-white/40 leading-snug mt-1 max-w-[min(100%,340px)]">{explain}</p>
      )}
    </>
  );
}

// SLICE 1 — the honest empty state for a TREND-ONLY row: it has a direction (the arrow) but no anchor of
// yours to place a dot against. Rather than silently drop the dot (which reads as a bug), it SAYS so.
// `hint` names the upgrade path where one exists (bike → accept your FTP). Run's flag-a-reference-effort
// is Slice 2, so it shows the plain "no baseline set" — honest, not broken.
function NoBaselineTag({ hint }: { hint?: string }) {
  return (
    <span className="basis-full text-[11px] text-white/30">no baseline set{hint ? ` · ${hint}` : ''}</span>
  );
}

// RUN row — State v3: DECOUPLING as a DOT (where you are in your 12wk range) + an ARROW (which way). The
// dot answers the LEVEL, the arrow answers the TREND — so "needs work" and "improving" can no longer read
// as the app arguing with itself. The old clipped verdict ("aerobic base needs work ↑ improving 6%") is
// gone. efficiency_index stays a quiet secondary arrow.
// Mirrors STATE_TREND_WINDOWS.runDirectionMinRuns (assemble.ts): steady runs in the 6wk window needed
// before a DIRECTION arrow is drawn. The LEVEL dot needs no such floor — one steady run reads a level.
const RUN_TREND_MIN_RUNS = 8;
// RUN row — LEADS WITH EFFICIENCY (2026-07-21, Michael): grade-adjusted "faster at the same heart rate"
// (GAP-pace ÷ HR on steady runs, terrain-honest). Replaces the durability DOT-lead, which was confusing
// — a confident dot off a single run that couldn't answer "am I improving". Efficiency answers exactly
// that: a rising trend = fitter. Durability (decoupling) is demoted to a quiet secondary read. No dot;
// a clear verdict + arrow + %, and an honest "N of 8 runs to read it" until there's a trend.
function RunFitnessRow({ fitness }: { fitness: RunFitness; showAxis?: boolean; mode?: FitnessMode; anchor?: FitnessAnchor }) {
  const eff = fitness.efficiency;
  const dur = fitness.decoupling;
  const [explainOpen, setExplainOpen] = React.useState(false);
  const v = VERDICT[eff.verdict];
  const hasTrend = eff.verdict !== 'needs_data' && eff.verdict !== 'withheld';
  const evidence = eff.sampleCount != null
    ? trendEvidence({ windowDays: 42, sampleCount: eff.sampleCount, newestAgeDays: eff.newestAgeDays, discipline: 'run' as Discipline })
    : null;
  // Durability shows as a quiet secondary ONLY when it has a real read (not needs_data/withheld).
  const durWord = (dur.verdict !== 'needs_data' && dur.verdict !== 'withheld') ? DECOUPLING_BAND[dur.band as DecouplingBand]?.word : null;
  return (
    <Row label="run">
      <span className="basis-full flex items-baseline justify-between gap-2">
        <button type="button" onClick={() => setExplainOpen((o) => !o)} className="inline-flex items-baseline gap-1 text-white/55 text-[13px]">
          efficiency <span className="text-white/30 text-[10px]">{explainOpen ? '▾' : 'ⓘ'}</span>
        </button>
        {hasTrend ? (
          <span className={`inline-flex items-baseline gap-1 text-[12px] ${v.cls}`}>
            {v.arr && <span>{v.arr}</span>}<span>{v.word}</span>
            {eff.pctChange != null && <span className="text-white/40">{verdictSignedPct(eff.verdict, eff.pctChange)}</span>}
          </span>
        ) : (
          // Honest: efficiency is a TREND, so one run can't read it. Say how close — not a confident dot.
          <span className="text-white/40 text-[11px]">{eff.sampleCount ?? 0} of {RUN_TREND_MIN_RUNS} steady runs to read it</span>
        )}
      </span>
      {hasTrend && evidence && <span className="basis-full text-white/35 text-[11px]">{evidence}</span>}
      {/* durability — the SECONDARY read now (fatigue resistance within a run), quiet, only when real */}
      {durWord && (
        <span className="basis-full text-[11px] text-white/35">durability · {durWord}{dur.stale ? ` · last steady run ${dur.newestAgeDays}d ago` : ''}</span>
      )}
      {explainOpen && (
        <p className="basis-full text-[11px] text-white/40 leading-snug mt-1 max-w-[min(100%,340px)]">
          Efficiency = how much speed you get per heartbeat on steady runs, adjusted for hills so terrain
          doesn't skew it. Rising means you're running faster at the same heart rate — your aerobic engine
          getting fitter. It's a trend, so it needs a few steady runs to read a direction. Durability, below,
          is the other half: how well that efficiency holds across a single long run.
        </p>
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

// SWIM row — DESCRIBED, not graded. Swim fitness has no honest dot for this app: pace is corrupted by
// fins/paddles/set-type and equipment capture is spotty, and the field (TrainingPeaks/Swim Smooth/Garmin)
// benchmarks swim off a clean CSS test we don't force. So the swim row shows the facts fins CAN'T corrupt
// — swim count, total distance, longest swim — over the 8wk window. Garmin/Strava fallback: volume, not
// a fitness score. No dot, no arrow, no verdict. useImperial → yards (imperial) or meters (metric).
function SwimVolumeRow({ vol }: { vol: SwimVolume }) {
  const { useImperial } = useAppContext();
  const toDisp = (m: number) => (useImperial ? Math.round(m * 1.09361) : m);
  const unit = useImperial ? 'yd' : 'm';
  const weeks = Math.round((vol.windowDays || 56) / 7);
  if (!vol.swims) {
    return (
      <Row label="swim">
        <span className="text-white/40 text-[13px]">no swims logged</span>
        <span className="text-white/25 text-[11px]">· last {weeks}wk</span>
      </Row>
    );
  }
  return (
    <Row label="swim">
      <span className="text-white/80 text-[13px]">{vol.swims} {vol.swims === 1 ? 'swim' : 'swims'}</span>
      <span className="text-white/60 text-[13px]">{toDisp(vol.totalDistanceM).toLocaleString()} {unit}</span>
      <span className="text-white/60 text-[13px]">longest {toDisp(vol.longestM).toLocaleString()} {unit}</span>
      <span className="text-white/25 text-[11px] basis-full">last {weeks}wk</span>
    </Row>
  );
}

function DisciplineRow({ card, restTrend, showAxis }: { card: DisciplineCard; restTrend?: PerfSummary | null; showAxis?: boolean }) {
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
            <FitnessDotBlock label={metricLabel ? metricLabel.toLowerCase() : card.discipline} range={range} verdict={card.headlineVerdict} provisional={PROVISIONAL_PERF.has(card.discipline)} showAxis={showAxis} />
            {evidence && <span className="basis-full text-white/35 text-[11px]">{evidence}</span>}
          </>
        ) : (
          <>
            {metricLabel && <span className="text-white/50 text-[13px]">{metricLabel}</span>}
            {hasEvidence ? (
              <>
                <span className={`text-[13px] ${vCls}`}>{trendHeadline(card.headlineVerdict, perf!.pctChange)}</span>
                <span className="text-white/35 text-[12px]">{evidence}</span>
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
        {thinStale && <span className="text-white/30 text-[11px]">limited data</span>}
        {asOf(perf?.newestAgeDays) && <span className="text-white/25 text-[11px]">· {asOf(perf?.newestAgeDays)}</span>}
        {/* 'provisional' now rides the dot block's arrow line (item 6, uniform) — no trailing chip */}
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
        <span className={`text-[12px] ${nd.cls}`}>{ndReceipt}</span>
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
    <p className={`pl-[62px] pr-1 -mt-0.5 mb-1.5 text-[12px] leading-snug max-w-[min(100%,360px)] ${concern ? 'text-amber-400/80' : 'text-white/45'}`}>
      {sentence}
    </p>
  );
}

export default function StatePerformanceSection({ strengthDetail, stateDisplay, primaryDiscipline, planWeek, strengthFatigue }: { strengthDetail?: React.ReactNode; stateDisplay?: StateDisplayV1 | null; primaryDiscipline?: string | null; planWeek?: number | null; strengthFatigue?: boolean }) {
  // S2: `stateDisplay` is the server-assembled display contract from the coach payload. When present the
  // hook renders it (no in-browser queries/assembly); absent → legacy live path (safe rollout fallback).
  const { cards, bikeFitness, runFitness, strengthFitness, swimRest, swimVolume, fitnessMode, fitnessAnchors, cadenceCounts, posture: declaredPosture, activeDisciplines, loading } = useStateTrends(stateDisplay);
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

  // GOAL-LED order (2026-07-21): the athlete's PRIMARY discipline leads — strength leads a strength
  // block, the race's sport leads a race plan. `primaryDiscipline` was already passed in from the
  // payload (weekly_state_v1.plan.primary_discipline) and IGNORED — the order was a hardcoded list
  // (F18). Now it drives the lead; everything else keeps the block-priority order below (which also
  // keeps the thinnest data — bike on an est-FTP — from leading the scan). Multi-sport primaries
  // (tri / duathlon / hybrid) and an absent primary fall back entirely to block-priority.
  const primaryDisc = (() => {
    const p = String(primaryDiscipline || '').toLowerCase();
    if (p === 'ride' || p === 'cycling') return 'bike';
    return (p === 'strength' || p === 'run' || p === 'swim' || p === 'bike') ? p : null;
  })();
  const BLOCK_PRIORITY: Record<string, number> = { strength: 0, run: 1, swim: 2, bike: 3 };
  const orderIdx = (d: string) => (primaryDisc && d === primaryDisc ? -1 : (BLOCK_PRIORITY[d] ?? 9));
  const sortedCards = [...cards].sort((a, b) => orderIdx(a.discipline) - orderIdx(b.discipline));

  return (
    <div className="px-3 py-3">
      {/* Section clock label: PERFORMANCE is the SLOW clock. Per-row windows (8wk, steady runs,
          over 6wk, as-of dates) are receipts that inherit this and add specifics. */}
      <div className="mb-2.5 flex items-baseline gap-2">
        {/* Named "Fitness" (not "Performance") so it can't be confused with the per-workout Performance
            tab that grades a single session. This card is the multi-week fitness TREND. */}
        <span className="text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">Fitness</span>
        <span className="text-[11px] text-white/30 lowercase">trends over recent weeks</span>
      </div>
      {/* NO aggregate roll-up (Michael 2026-07-04): a cross-discipline headline ("Building — bike up,
          run up") is a lossy, cherry-picking, clock-mismatched summary (run 6wk vs bike 8wk). Fitness
          is handed to the individual sport rows below — each owns its own verdict AND its own window. */}
      {(() => {
        // One card renderer, reused across the posture groups. showAxis labels the first row of a group
        // ("vs your baseline" for strength, "vs your 12-week range" for endurance).
        const renderCard = (card: DisciplineCard, showAxis: boolean) => {
          const inner = (() => {
            if (card.discipline === 'bike' && bikeHasSubstance) return <BikeFitnessRow fitness={bikeFitness!} showAxis={showAxis} mode={fitnessMode.bike ?? 'trend_only'} anchor={fitnessAnchors.bike} />;
            if (card.discipline === 'run' && runHasSubstance) return <RunFitnessRow fitness={runFitness!} showAxis={showAxis} mode={fitnessMode.run ?? 'trend_only'} anchor={fitnessAnchors.run} />;
            // Swim is DESCRIBED, not graded — volume facts, never a dot (see SwimVolumeRow).
            if (card.discipline === 'swim' && swimVolume) return <SwimVolumeRow vol={swimVolume} />;
            if (card.discipline === 'strength' && strengthHasSubstance) return <><StrengthFitnessRow fitness={strengthFitness!} fatigue={strengthFatigue} />{strengthDetail}</>;
            const row = <DisciplineRow card={card} restTrend={card.discipline === 'swim' ? swimRest : null} showAxis={showAxis} />;
            return (card.discipline === 'strength' && strengthDetail) ? <>{row}{strengthDetail}</> : row;
          })();
          return <React.Fragment key={card.discipline}>{inner}</React.Fragment>;
        };

        // No "Building/Holding" labels — the athlete knows their focus, and "HOLDING" collides with the
        // "→ holding" verdict word. We keep the existing focus-first sort as-is; the only change is that a
        // DROPPED discipline (not in the plan AND not being done recently) dims to the bottom — never graded
        // or penalised (Michael's rule). Everything you're actually doing renders normally, in order.
        const postureOf = (c: DisciplineCard) => (declaredPosture?.[c.discipline] ?? String((c as any).posture ?? ''));
        const isActive = (c: DisciplineCard) => (activeDisciplines ?? []).includes(c.discipline); // session in last ~4wk (detraining onset)
        const inPlanOrActive = (c: DisciplineCard) => postureOf(c) === 'develop' || postureOf(c) === 'maintain' || isActive(c);
        const active = sortedCards.filter(inPlanOrActive);
        const resting = sortedCards.filter((c) => !inPlanOrActive(c)); // dropped + inactive → dimmed
        return (
          <>
            {active.map((card, idx) => renderCard(card, idx === 0 || (idx === 1 && active[0]?.discipline === 'strength')))}
            {resting.length > 0 && (
              <div className="opacity-45 mt-1">
                {resting.map((card) => renderCard(card, false))}
              </div>
            )}
          </>
        );
      })()}
      {/* defensive: if there's no strength trend card at all, still surface the per-lift detail */}
      {strengthDetail && !cards.some((c) => c.discipline === 'strength') && strengthDetail}
    </div>
  );
}
