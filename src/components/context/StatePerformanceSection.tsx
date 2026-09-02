// STATE v2 — PERFORMANCE section. Renders the two-part headline + per-discipline hybrid
// cards (performance trend where data exists, adherence fallback otherwise). Styling mirrors
// StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// NOT YET SHIPPED — under review. Run/swim performance is on PROVISIONAL thresholds and is
// tagged as such; swim is additionally Q-038-clouded.

import { trustedMaxReps } from '@/lib/estimate-1rm';
import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary, RunFitness, DecouplingBand, StrengthFitness, StateDisplayV1, SwimVolume, FitnessMode, FitnessAnchor } from '@shared/state-trend';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';
import { useStateTrends } from '@/hooks/useStateTrends';
import { useAppContext } from '@/contexts/AppContext';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { trendReceipt, trendEvidence, trendHeadline, type Discipline } from '@/lib/trend-receipt';
import { foldVariantSlots } from '@/lib/fold-lift-slots';
import { formatPace } from '@/utils/workoutFormatting';
import { getDisciplineColor, getDisciplineColorRgb } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';
import ReadoutTiles from '@/components/context/ReadoutTiles';
// [Step 7] Shared with the server emitter — see tracked-max-lifts.ts.
import { isTrackedMaxLift } from '@/lib/tracked-max-lifts';
// ⛔ SLICE b — the calibration signal. `useStrengthCalibration` is the ONE reader; State and
// Performance both render `StrengthCalibrationNotice` off it and both route to the same undo.
import { useStrengthCalibration, type StrengthCalibrationRead } from '@/hooks/useStrengthCalibration';
import StrengthCalibrationNotice from '@/components/StrengthCalibrationNotice';
// ⛔ ONE OWNER PER SPORT (Round 3 pass 1, 2026-09-01). The bike efficiency cards and the weekly
// lifting card render HERE now, on the sport's own plate — the ride cards under bike, the lifting
// lines under strength — so nothing about a sport appears in two places on the screen. Both were
// moved from other blocks (the trends plate and the LOAD section); no card was restyled and no
// server field changed. Run keeps its own plate for one more pass (see StateTrendsBlock).
import { EnduranceReadCards } from '@/components/context/StrengthReadCards';
import ViadaWeekCard from '@/components/context/ViadaWeekCard';
// ⛔ COLLAPSE TO ONE LINE PER SPORT (Round 3, 2026-09-01) — each sport shows a change-leading summary
// and expands on tap. The summary wording is a set of pure functions so the confidence rule is pinned.
import { changeMonth, efficiencySummary, strengthGlance } from '@/lib/sport-summary';
import { getStoredUserId } from '@/lib/supabase';
import TrendSparkline from '@/components/context/TrendSparkline';
import { liftStatusLine } from '@/lib/strength-calibration-copy';
import { Activity, Bike, Waves, Dumbbell, type LucideIcon } from 'lucide-react';

const VERDICT: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'up', cls: 'text-emerald-400', arr: '' },
  holding: { word: '', cls: 'text-white/70', arr: '' }, // ⛔ NO WORD, NO ARROW (2026-09-01): "holding" meant both genuinely-flat AND too-noisy-to-call (Q-289). When the verdict can't call a direction, the row shows the number + count and stops.
  sliding: { word: 'down', cls: 'text-amber-300', arr: '' }, // ⛔ "easing off" told the athlete they CHOSE to ease off when the number simply dropped — interpretive and flattering (2026-09-01). State the measurement: down.
  needs_data: { word: 'needs data', cls: 'text-white/60', arr: '' },
  withheld: { word: 'too few to read', cls: 'text-white/60', arr: '' },
};

// ── ARROW + NUMBER, NO WORD (2026-08-01, Michael from his own screen) ────────────────────────────
//
// The fitness rows state DIRECTION and MAGNITUDE and stop. The word is dropped, not softened: it was
// the row's only editorial, and the detail lines underneath (window · count · age, the heat model,
// pace-at-HR) plus the tap-to-expand already carry every bit of meaning the word was adding. So
// "↓ −15.2%" replaces "↓ easing off −15.2%".
//
// ⛔ THE DOWN ARROW IS NEUTRAL-COLOURED, AND THAT IS THE POINT. Amber made a decline read as a
// WARNING on a row that is only reporting a direction — and a decline is routinely correct (a
// deload, a taper, a base block). Same reasoning that turned `holding` grey; this finishes it.
// It matches `holding`'s `text-white/70` so the three states differ by ARROW, never by alarm.
//
// ⚠️ SCOPED TO RUN + BIKE. Swim (`DisciplineRow`) and the rest-fraction tag still use `VERDICT` and
// still print words — they were not part of this call, and swim's read is Q-038-clouded, so leaving
// its hedging language in place is deliberate, not an oversight.
//
// ⚠️ WHAT THIS COSTS, STATED: the "precise verdict words" split (2026-07-22) distinguished
// `easing off` (still falling) from `settled lower` (fell, then levelled) — a distinction nobody
// else draws. Wordless, that split now rests on the ARROW ALONE: `↓` still falling, `→` levelled,
// with the signed number giving the size of the drop either way. So a settled-lower row reads
// "→ −15.2%" — flat arrow, negative number — which is accurate but reads oddly at a glance.
// If that pairing looks wrong on the screen, the fix is to give `settled lower` its own glyph, not
// to bring the words back.
const NUMERIC: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: '', cls: 'text-emerald-400', arr: '' },
  holding: { word: '', cls: 'text-white/70', arr: '' },
  sliding: { word: '', cls: 'text-white/70', arr: '' },
  // Not verdicts — these two say "there is no reading", which no arrow can express. Words stay.
  needs_data: { word: 'needs data', cls: 'text-white/60', arr: '' },
  withheld: { word: 'too few to read', cls: 'text-white/60', arr: '' },
};

// PRECISE VERDICT WORDS (2026-07-22, Michael — "all the words for every scenario has to be precise").
// The trend engine's raw verdict is a NET early→recent direction; on its own it can't tell a metric
// STILL falling from one that DROPPED then STEADIED. classifyTrend now carries `recentlyFlat` (the recent
// half sits inside the holding band). Four shared words, one vocabulary for every discipline:
//   improving   — rising
//   holding     — flat the whole window
//   easing off  — still drifting down (sliding + still moving)   ← softer than Garmin's "Detraining"
//   settled lower — dropped, then levelled off (sliding + recentlyFlat)   ← the split nobody else draws
// Only the sliding verdict splits; "sliding" as a bare word is retired everywhere in favour of "easing
// off" (its non-alarming default). Falls back to VERDICT for improving/holding/needs_data/withheld.
// ── THE RUN EFFICIENCY ROW GETS ITS OWN WORDS BACK (2026-08-01, Michael) ─────────────────────────
//
// ⛔ A SEPARATE MAP, NOT WORDS ADDED TO `NUMERIC`. `NUMERIC` is shared with the bike `Signal`, and the
// bike is deliberately staying wordless until it has a confidence interval of its own. Adding words
// there would have silently changed the bike row too.
//
// The words are PLAIN-LANGUAGE, not trend jargon: efficiency is speed per heartbeat, so "faster at the
// same effort" says what the number means to a runner. The arrow and the signed percent still ride
// alongside — the word replaces nothing, it explains.
const RUN_EFF_WORDS: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'Faster at the same effort', cls: 'text-emerald-400', arr: '' },
  holding: { word: '', cls: 'text-white/70', arr: '' }, // ⛔ no word (2026-09-01) — see VERDICT.holding
  // Neutral, not amber — a decline here is a direction, and heat or a base block routinely cause it.
  sliding: { word: 'Slower at the same effort', cls: 'text-white/70', arr: '' },
  needs_data: { word: 'Need a few more runs', cls: 'text-white/60', arr: '' },
  withheld: { word: 'Too soon to tell', cls: 'text-white/60', arr: '' },
};

// "newest today" / "newest 3d ago" — the ONE fact a count-and-window line cannot carry: whether the
// ride you just finished is in there yet. Distinct from `asOf()`, which prints a calendar date.
// Q-255: verdict words for the bike load floor. Bands are Friel/intervals.icu's (see the server
// module `state-trend/load-floor.ts` for sources); these are just their on-screen words.
// ⛔ LOAD_FRESHNESS_WORDS removed (2026-09-01) — its only consumer was the bike CTL/TSB line, now gone.


function recencyOf(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays < 0) return null;
  return ageDays <= 0 ? 'newest today' : `newest ${Math.round(ageDays)}d ago`;
}

// `wordMap` selects the vocabulary: VERDICT keeps the words (swim, rest), NUMERIC drops them
// (bike), RUN_EFF_WORDS spells them out (run efficiency). The recentlyFlat SPLIT survives all three —
// it is the arrow that carries it, and on the run row it gets its own phrase.
function verdictLabel(
  verdict: TrendVerdict,
  recentlyFlat?: boolean,
  wordMap: Record<TrendVerdict, { word: string; cls: string; arr: string }> = VERDICT,
): { word: string; cls: string; arr: string } {
  if (verdict === 'sliding' && recentlyFlat) {
    if (wordMap === NUMERIC) return { word: '', cls: 'text-white/70', arr: '' };  // bike: the number carries the drop
    // "Dropped, then levelled" is the split nobody else draws — on the run row it gets said out loud.
    if (wordMap === RUN_EFF_WORDS) return { word: 'Slower, then level', cls: 'text-white/70', arr: '' };
    return { word: 'dropped, then level', cls: 'text-white/55', arr: '' };
  }
  return wordMap[verdict];
}

// D-160: pctChange is the RAW metric delta (classify.ts keeps it raw so the UI knows real direction).
// For lower-is-better disciplines (swim/run pace) an improvement is a NEGATIVE delta — printing it
// verbatim gives "↑ improving −34%". The verdict already encodes good/bad; sign the magnitude by the
// verdict so the number and the arrow always agree. improving → +, sliding → −, holding → raw.
// `dp` is DISPLAY ONLY — `eff.pctChange` stays raw on the object. A tenth of a percent on a
// regression slope over three months is false precision; the confidence interval is the honest
// statement of how sure the number is, and it is now rendered beside it.
function verdictSignedPct(verdict: string, pct: number | null | undefined, dp = 1): string | null {
  if (pct == null) return null;
  const mag = (n: number) => Math.abs(n).toFixed(dp).replace(/\.0+$/, '');
  // ⚠️ ONE MINUS GLYPH, ALL THREE BRANCHES. The `holding` fallback used to print JS's own negative
  // ("-0.4%", ASCII hyphen U+002D) while the sliding branch printed a true minus ("−15.2%", U+2212).
  // Adjacent rows on one screen, two different characters at two different widths. 2026-08-01.
  if (verdict === 'improving') return `+${mag(pct)}%`;
  if (verdict === 'sliding') return `−${mag(pct)}%`;
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${mag(pct)}%`;
}

// The 95% CI the verdict was gated on, in whole percent. `assemble.ts:473` carries it from
// `routeTrend`, and `heat-adjust.ts:203` documents it as the CI **of pct** — the same number rendered
// beside the arrow (`assemble.ts:391`: `pctChange: runRoute.pct`). So the range brackets the figure
// shown, not a different estimate.
//
// ⚠️ NULL IS A REAL ANSWER. `ci` is null on the linear_k fallback and on the non-route path. Show
// nothing rather than a fabricated interval — a made-up range is worse than no range.
function ciRange(ci: [number, number] | null | undefined): string | null {
  if (!ci || ci.length !== 2 || ci.some((n) => !Number.isFinite(n))) return null;
  const fmt = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n))}%`;
  return `range ${fmt(ci[0])} to ${fmt(ci[1])}`;
}

// ── THE BLOCK, STATED — read from the card, translated by nobody ──────────────────────────────────
//
// ⛔ THE ROOT WIRE (Q-230 / D-339, audit 2026-08-01). `_shared/block-identity.ts` has answered "what
// block is this, on this date" since 2026-07-30 and the coach's own verdicts read it — which is why
// "your one-rep maxes are sliding" stopped firing on a block whose prescription is the reason they
// dipped. These rows never read it, so they kept judging a number without knowing what the week
// asked for. This is that wire, and nothing more: every value below is rendered as it arrived.
//
// ⚠️ THE WORD COMES FROM THE CARD. `block.phase` is the plan's OWN name and half of those are
// internal — 'Leader' and 'Anchor' are the previous program's words for a the previous program cycle, not an athlete's. The card
// carries `phase_word` (base / build / peak / taper / recovery) resolved through the one vocabulary
// the effort rules already use, so this screen keeps no translation table of its own: a plan that is
// not the previous program renders through the identical path, and a plan that does not place the week says only
// "week 3 of 12". Null anywhere here means the plan did not say — so the line shortens, never guesses.
type BlockCard = NonNullable<CoachWeekContextV1['plan']['block']>;
function blockContextLine(planWeek: number | null | undefined, block: BlockCard | null | undefined): string | null {
  // No week number = no plan running (the server nulls it before a plan starts and after it ends).
  // There is nothing honest to say about position, so the row says nothing rather than "week 1".
  if (planWeek == null) return null;
  const weeks = block?.block_weeks ?? null;
  const where = weeks != null && weeks > 0 ? `week ${planWeek} of ${weeks}` : `week ${planWeek}`;
  /**
   * ⛔ THE PHASE WORD IS STRIPPED (2026-08-29, Michael: *"the previous program is a ghost in the machine"* →
   * *"remove it"*). `phase_word` resolves from `PHASE_NAME` in `strength-primary-plan.ts`, whose
   * vocabulary is the previous program's block shape — Leader, Anchor, TM Test, Deload. None of those words is
   * Viada's, and the screen was printing them as though they described the athlete's programme.
   * ⚠️ THE POSITION SURVIVES: "week 1 of 12" is a fact about where the athlete is and belongs to no
   * author. Only the phase name comes off.
   * ⚠️ THIS IS DISPLAY ONLY. The block still RUNS on that shape — stages 2-5 of
   * `docs/WORKORDER-viada-owns-the-engine-2026-08-29.md`. Removing the word does not remove the
   * programme, and nothing here should be read as though it had.
   */
  return where;
}

// ── THE AEROBIC READ'S OWN WORDS (2026-08-01) ───────────────────────────────────────────────────
// A SEPARATE MAP, for the same reason `RUN_EFF_WORDS` is separate: `NUMERIC` is the POWER read's
// vocabulary and stays wordless. These words are plain-language — heart rate at a given power is
// "how hard your body is working to hold the same pace on the bike", so that is what they say. They
// are earned by the noise gate (Q-241), which is the same bar run durability and strength clear;
// a confidence interval was never the requirement, beating your own scatter was.
const BIKE_AEROBIC_WORDS: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'Easier at the same power', cls: 'text-emerald-400', arr: '' },
  holding: { word: '', cls: 'text-white/70', arr: '' }, // ⛔ no word (2026-09-01) — see VERDICT.holding
  // Neutral, never amber: heat, a hard block or a poor night all do this, and none of them is a fault.
  sliding: { word: 'Harder at the same power', cls: 'text-white/70', arr: '' },
  needs_data: { word: 'Need a few more rides', cls: 'text-white/60', arr: '' },
  withheld: { word: 'Too few rides to read', cls: 'text-white/60', arr: '' },
};

// THE AEROBIC LEAD — the row for the athlete who never does a hard effort. Leads with the NUMBER in
// its own unit (heart rate at their easy power), because a bare direction is unreadable to someone
// who has no idea what it is a direction OF.
function AerobicSignal({ sig }: { sig: BikeSignal }) {
  const v = BIKE_AEROBIC_WORDS[sig.verdict];
  const asserts = sig.verdict !== 'needs_data' && sig.verdict !== 'withheld';
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap">
      {sig.recentValue != null && <span className="text-white/85">{sig.recentValue} bpm at easy power</span>}
      <span className={`inline-flex items-baseline gap-0.5 ${v.cls}`}>
        {v.arr && <span>{v.arr}</span>}{v.word && <span>{v.word}</span>}
      </span>
      {asserts && sig.pctChange != null && <span className="text-white/60">{verdictSignedPct(sig.verdict, sig.pctChange)}</span>}
    </span>
  );
}

// One labelled signal ("Power: improving +2%") for the bike dual read.
function Signal({ label, sig }: { label: string; sig: BikeSignal }) {
  const v = NUMERIC[sig.verdict];   // bike: arrow + number, no word
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-white/50">{label}</span>
      <span className={`inline-flex items-baseline gap-0.5 ${v.cls}`}>
        {v.arr && <span>{v.arr}</span>}{v.word && <span>{v.word}</span>}
      </span>
      {/* `withheld` prints no number — see FitnessDotBlock: the percent would BE the claim we just declined to make. */}
      {sig.pctChange != null && sig.verdict !== 'needs_data' && sig.verdict !== 'withheld' && <span className="text-white/60">{verdictSignedPct(sig.verdict, sig.pctChange)}</span>}
      {sig.provisional && <span className="text-white/50 text-[12px]">prov</span>}
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
  // ⛔ THE FTP ON RECORD, SERVER-FIRST WITH A CLIENT FALLBACK (2026-08-01).
  //
  // `anchor.value` is the authority — but `fitnessAnchors` is assembled by compute-snapshot and only
  // rewritten on an INGEST, so every athlete carries the previous shape until their next workout
  // syncs. A field that lands "sometime after your next ride" reads as broken.
  //
  // ⚠️ THE FALLBACK IS ONLY HONEST BECAUSE THE SENTENCE CHANGED. It used to claim the number was what
  // the measurement was computed against — which a client-side read cannot promise. It now reports
  // the FTP ON RECORD, and that is exactly what `resolveCurrentFtp` returns. Same resolver the coach
  // and the analyzers use (D-... FTP fracture #2), never a second read of the raw column.
  const { loadUserBaselines } = useAppContext();
  const [fallbackFtp, setFallbackFtp] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (anchor?.value != null) return;            // server already told us; don't ask twice
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      const r = resolveCurrentFtp({ learned_fitness: b.learned_fitness, performance_numbers: b.performanceNumbers });
      if (r?.value != null) setFallbackFtp(Math.round(r.value));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [anchor?.value, loadUserBaselines]);

  const [powerInfoOpen, setPowerInfoOpen] = React.useState(false);
  // ⛔ SAME RULE AS THE RUN ROW (2026-08-01, Michael): the headline and ONE receipt line stay
  // visible; everything else goes behind "more". The CONTENTS differ because the rows have
  // different material — run's detail is a read (plan context, trend, pace), bike's is extra
  // provenance (FTP basis, as-of, anchor label, the power-trend note). Same rule, not same items.
  // ⚠️ Bike keeps NO words and NO range — it still has no confidence interval (D-356).
  const [detailOpen, setDetailOpen] = React.useState(false);
  const src = fitness.efficiency.basis === 'personal' ? 'personal'
    : fitness.efficiency.basis === 'coggan_ftp' ? 'est (FTP)' : null;
  // D-232 glass-box: the shared evidence tail (window · rides · recency) is the LEAD sub-trend's
  // (power leads; efficiency when power has no verdict). Power and efficiency do NOT always rest on
  // the same rides — power counts w20>0, efficiency counts clean HR-at-band (D-237: corrupt-HR rides
  // are excluded from efficiency, not power). So when efficiency's own sample count differs, surface it.
  // ⛔ THE SERVER PICKS THE LEAD (`fitness.lead`) — this used to be re-derived here as
  // `power.verdict !== 'needs_data'`, a second copy of a rule that changed under it the moment the
  // ride floor introduced `withheld`. The fallback keeps old cached payloads rendering.
  const leadIsPower = fitness.lead != null ? fitness.lead !== 'efficiency' : fitness.power.verdict !== 'needs_data';
  const lead = leadIsPower ? fitness.power : fitness.efficiency;
  // ── THE THREE READS, AND WHY THIS ROW HAS THEM (2026-08-01, Michael) ─────────────────────────────
  //
  // "A user focusing on strength may never hit that 20 minutes — so a user may joy ride. FTP is the
  // north star for serious riders; they don't care about heart rate like runners. But those zone 2
  // rides?" Two different athletes read the same row, and only one of them will ever produce a
  // threshold effort. Before this, the second one got "too few to read" forever — the app reporting
  // its own failure at an athlete who was training perfectly well, just not hard.
  //
  // So the row NAMES THE REASON instead of reporting an absence. Three states, everyone lands in one:
  //   · THRESHOLD — hard efforts exist and clear the floor: watts, direction. Unchanged.
  //   · AEROBIC — no hard efforts (or too few): lead with heart rate at the same power, which is what
  //     the endurance world reads on this athlete anyway (Friel's decoupling / efficiency factor:
  //     the ordinary zone 2 ride IS the test, no testing required), and say why there is no FTP read.
  //   · BUILDING — not enough of either yet: say what is there and what it will become.
  //
  // ⛔ "No hard efforts yet" is a FACT ABOUT HOW THEY RIDE. "Too few to read" is the app failing.
  // Same data, and only one of them is true. Do not collapse these back into one string.
  const powerSilent = fitness.powerSilent ?? null;
  // Which of the three the athlete is in — READ, not re-derived. `lead === 'none'` is the server saying
  // neither signal can assert; computing that here from the two verdicts would be a second copy of the
  // rule, which is exactly what went wrong with `leadIsPower` above. The fallback covers cached payloads
  // written before `lead` existed.
  const assertsLead = fitness.lead != null
    ? fitness.lead !== 'none'
    : (lead.verdict !== 'needs_data' && lead.verdict !== 'withheld');
  const aerobicLead = assertsLead && !leadIsPower;
  const building = !assertsLead;
  // The shared evidence tail. ⛔ THE COUNT IS DROPPED ON THE AEROBIC READ — its own line above already
  // says "from N easy rides", and the same number twice on consecutive lines reads as two facts. Window
  // and recency stay: nothing else on the row states them. The threshold read keeps the count, because
  // there it IS the only place the count appears.
  // ⛔ THE BUILDING STATE KEEPS RECENCY AND DROPS THE COUNT. `lead` falls back to POWER when neither
  // signal can assert, so the full tail cited power's pool — for a rider with six easy rides and no hard
  // ones that rendered "over 8wk · 0 rides" directly under "6 rides in 8 weeks": two counts on one row,
  // contradicting each other, with the 0 looking the more official.
  // But dropping the WHOLE tail was an over-correction, and the screen proved it in one question:
  // "does this include today?" — which the row could no longer answer. Recency is the one thing a
  // count-and-window headline cannot say, and on a building row it is the most useful fact there is,
  // because it tells the athlete whether the ride they just did has landed yet.
  const buildingRecency = building ? recencyOf(fitness.efficiency.newestAgeDays ?? fitness.power.newestAgeDays) : null;
  const tail = (!building && lead.sampleCount != null && lead.windowDays != null)
    ? trendEvidence({ windowDays: lead.windowDays, sampleCount: lead.sampleCount, newestAgeDays: lead.newestAgeDays, discipline: 'bike', omitCount: aerobicLead })
    : null;
  // Qualifying rides we can see — the larger of the two pools (they count different things: power
  // counts hard rides in the winning terrain bin, efficiency counts clean easy rides). Stated as
  // "rides we can read from", never as their total ride count, which we do not have here.
  const rideCount = Math.max(fitness.power.sampleCount ?? 0, fitness.efficiency.sampleCount ?? 0);
  const ftpNow = anchor?.value != null && Number.isFinite(anchor.value) ? Math.round(anchor.value) : fallbackFtp;
  const range = (fitness as any).range as { positionPct: number; confident: boolean } | null | undefined;
  const anchored = mode === 'anchored';
  // SLICE 1: a dot only when ANCHORED — bike is anchored only once the athlete ACCEPTS its FTP estimate
  // (basis flips to 'personal'). On est(FTP) it's TREND-ONLY: the arrow + "no baseline set · accept your
  // FTP", never a dot on an estimate the athlete never confirmed.
  // Traced from `learn-fitness-profile` (STEP 4): tier 1 is best 20-min power × 0.95, gated on
  // hard efforts and 20–120 min rides. Coggan's field protocol — the same arithmetic as a 20-minute
  // test, taken from 20 minutes the athlete already rode hard rather than asking them to test.
  const ftpMethod = src === 'est (FTP)' ? ' FTP is estimated from your hard rides — 95% of your best 20 minutes.' : '';
  // The dot and the "accept your FTP" tag belong to a REAL read; a withheld or absent one gets neither.
  const showDot = anchored && range != null && assertsLead && leadIsPower;
  const trendOnly = !anchored && assertsLead && leadIsPower;
  return (
    <Row label="bike">
      {building ? (
        // BUILDING — say what is there and what it becomes. Never a bare "needs data": the athlete
        // cannot tell whether that means "ride more" or "the app is broken".
        // ⛔ THE CTL/TSB READ IS REMOVED (2026-09-01, ruled). "fitness N · form −M" and the
        // "carrying training fatigue" freshness word are the Banister/Coggan model — coach-facing
        // jargon, an inference we can't state plainly, and a duplicate of the ACWR/load plate at the
        // top of the screen. The MODEL stays server-side (fitness.loadFloor is still computed and
        // still gates `building`); it is simply no longer rendered here. What remains is the
        // measurement promise. Floor absent → the original copy, unchanged.
        fitness.loadFloor ? (
          <span className="inline-flex items-baseline gap-1.5 flex-wrap text-white/60">
            {(recencyOf(fitness.loadFloor.newest_ride_age_days) ?? buildingRecency) && (
              <span className="text-white/45">{recencyOf(fitness.loadFloor.newest_ride_age_days) ?? buildingRecency}</span>
            )}
            <span className="basis-full">
              {'A few more hard rides add the power read.'}
            </span>
          </span>
        ) : (
        <span className="inline-flex items-baseline gap-1.5 flex-wrap text-white/60">
          <span className="text-white/85">{rideCount === 0 ? 'No rides yet' : `${rideCount} ${rideCount === 1 ? 'ride' : 'rides'} in 8 weeks`}</span>
          {buildingRecency && <span className="text-white/45">{buildingRecency}</span>}
          <span className="basis-full">{rideCount === 0 ? 'Ride and this reads your aerobic fitness' : 'A few more and this reads your aerobic fitness'}</span>
        </span>
        )
      ) : aerobicLead ? (
        <AerobicSignal sig={fitness.efficiency} />
      ) : showDot ? (
        // The headline names the NUMBER, not the metric's category: "212 W threshold" is what a rider
        // wants off a glance, and it is `anchor.value` — the same FTP the verdict was computed against
        // (D-358), never a second client-side resolve.
        <FitnessDotBlock label={ftpNow != null ? `${ftpNow} W threshold` : 'power'} range={range!} verdict={lead.verdict} pctChange={lead.pctChange} wordMap={NUMERIC} showAxis={showAxis} explain={leadIsPower
          // ⛔ THE ⓘ DEFINES THE METRIC AND STOPS (2026-08-01, Michael: "anything specific to where the
          // user is needs to go to more; ⓘ simply shows what the metric is"). Both strings used to end
          // with "the dot is where it sits versus your baseline; the arrow is the direction" — that is a
          // legend for THIS athlete's position, not a definition of the measure. Moved to "more".
          // ⚠️ THE FTP METHOD LINE IS CONDITIONAL, and it has to be. "Estimated from your hard rides"
          // is false for an athlete who tested and entered their own FTP — appending it
          // unconditionally would tell a confirmed rider their number was guessed. Only when the
          // basis IS the estimate (`src === 'est (FTP)'`, from `efficiency.basis === 'coggan_ftp'`).
          // It passes the ⓘ test (D-357): it describes HOW THE METRIC IS MADE, true for anyone,
          // not where this athlete sits.
          ? `Power = how much power you are producing on rides, measured against your FTP.${ftpMethod}`
          : `Efficiency = how much power you hold per heartbeat on steady rides. Rising means the same work at a lower heart rate — getting fitter.${ftpMethod}`} />
      ) : (
        <Signal label={ftpNow != null ? `${ftpNow} W threshold` : 'Power'} sig={lead} />
      )}
      {/* ⛔ THE REASON LINE — the whole point of the rebuild. An athlete with no threshold read is told
          WHY in a sentence about their riding, not about the app's data. It sits under the read it
          explains, and it is not tap-gated: a rider who never sees it would never learn that hard
          efforts are what unlock the FTP read. */}
      {powerSilent && !building && (powerSilent === 'no_hard_efforts' ? (
        // Tappable ONLY for the joy rider, because only they have something to unlock. A rider who
        // already does hard efforts and just has too few does not need "here is what a hard effort is".
        // ⛔ This replaced a separate "power trend ⓘ" button that sat at the bottom of the row saying the
        // same thing in different words. One question, one place to tap.
        <>
          <button type="button" onClick={() => setPowerInfoOpen((o) => !o)} className="basis-full inline-flex items-baseline gap-1 text-left text-white/45 text-[12px]">
            No hard efforts yet, so there is no threshold read
            <span className="text-white/40 text-[11px]">{powerInfoOpen ? '▾' : 'ⓘ'}</span>
          </button>
          {powerInfoOpen && (
            <p className="basis-full text-[12px] text-white/55 leading-snug mt-1 max-w-[min(100%,340px)]">
              A threshold, sweet-spot, tempo or climbing ride records a 20-minute power max, and that is what an FTP read is built from. Easy rides carry no max to read, so the bike is read on heart rate at the same power until one is logged.
            </p>
          )}
        </>
      ) : (
        <span className="basis-full text-white/45 text-[12px]">Not enough hard rides yet for a threshold read</span>
      ))}
      {aerobicLead && (
        <span className="basis-full text-white/45 text-[12px]">
          Your heart rate at the same power{(fitness.efficiency.sampleCount ?? 0) > 0 ? `, from ${fitness.efficiency.sampleCount} easy ${fitness.efficiency.sampleCount === 1 ? 'ride' : 'rides'}` : ''}
        </span>
      )}
      {/* The one receipt that stays: window · rides · recency. The "more" cue rides with it. */}
      {(tail || src || asOf(lead.newestAgeDays) || (showDot && anchor?.label)) && (
        <span className="basis-full flex items-baseline justify-between gap-2 text-white/55 text-[12px]">
          <span>{tail}</span>
          <button type="button" onClick={() => setDetailOpen((o) => !o)} className="shrink-0 text-white/50">
            {detailOpen ? 'less' : 'more'}
          </button>
        </span>
      )}
      {/* ⚠️ THE EMPTY STATE STAYS VISIBLE. "no baseline set · accept your FTP to anchor" names an
          upgrade path the athlete can act on — hiding an actionable gap behind a tap is how a missing
          dot starts reading as a bug. */}
      {trendOnly && <NoBaselineTag hint={src === 'est (FTP)' ? 'accept your FTP to anchor' : undefined} />}
      {/* WHERE THE NUMBER COMES FROM — basis, freshness, anchor. True and worth having, but three lines
          of provenance stacked under a one-line verdict buried the verdict. */}
      {detailOpen && (
        <span className="basis-full flex flex-col gap-0.5 mt-0.5 text-[12px] text-white/45">
          {/* WHERE YOU SIT — the dot/arrow legend, which is about this athlete rather than about the
              metric, so it lives here rather than in the ⓘ. Only when there IS a dot to explain. */}
          {showDot && <span>The dot is where you sit against your own baseline; the arrow is the direction.</span>}
          {/* ⛔ THE NUMBER THE READ WAS COMPUTED AGAINST, not one resolved here. It rides on the anchor
              (`FitnessAnchor.value`) so the FTP shown and the FTP behind the verdict are the same
              number by construction. Resolving it client-side would give one that is *probably* the
              same — which is what the FTP-fracture work existed to remove. */}
          {/* ⛔ THE SENTENCE CHANGES WITH THE READ — and the FTP is NOT dropped on the aerobic row.
              It was, briefly, on the reasoning that FTP "has nothing to do with" a heart-rate verdict.
              That was wrong: the aerobic band IS 56-75% of FTP (`bikeRideIntensityAerobic`), so the FTP
              is precisely what "easy power" MEANS. Removing it left the rider unable to see what band
              their read was taken in, or that confirming their FTP would move it.
              What was true in the complaint is that it must not read as the verdict's own number —
              hence "Easy power is set from…", which states the basis and claims nothing about the trend. */}
          {src && (() => {
            // ⚠️ NO METRIC-STRING GUARD. The first cut gated on `anchor.metric === 'ftp'` — a string
            // that comes from the `fitness_baselines` row and was never verified to be that exact
            // word. It silently rendered nothing. This branch is already inside `src`, which is
            // derived from `efficiency.basis === 'coggan_ftp'`, so the bike anchor here IS the FTP;
            // the value alone is the honest gate.
            const ftp = ftpNow; // one resolve for the row — the headline and this line cannot disagree
            // ⛔ STATES THE BASELINE, DOES NOT CLAIM WHAT THE MEASUREMENT USED (2026-08-01).
            //
            // The first version read "Measured against an estimated FTP of 212 W" — and that was a
            // claim I could not back. `anchor.value` is the `fitness_baselines` record. The per-ride
            // power BAND is `workout_analysis.bike_fitness_v1.band_source` (read at
            // compute-snapshot:715), computed by analyze-cycling-workout at ANALYSIS time from
            // whatever FTP resolved then. Two separately derived numbers — probably equal, not
            // verified equal, and rides analysed at different times need not even agree with each
            // other.
            //
            // ⚠️ So the sentence states the FTP ON RECORD and says the basis is an estimate. Both are
            // true independently. Naming the number the measurement used would need that number
            // carried through per ride — a real question, not a copy fix.
            // The threshold wording belongs to a REAL power read. `leadIsPower` alone is true in the
            // building state too (lead 'none' falls back to power), which put "Your estimated FTP is
            // 176 W" under a row that had made no measurement at all.
            if (!(leadIsPower && assertsLead)) {
              // AEROBIC or BUILDING: the FTP is the band's definition, not the measurement.
              if (src === 'est (FTP)') {
                return <span>{ftp != null ? `Easy power is set from your estimated FTP of ${ftp} W` : 'Easy power is set from an estimated FTP'} — not one you confirmed.</span>;
              }
              return <span>{ftp != null ? `Easy power is set from your tested FTP of ${ftp} W.` : 'Easy power is set from your own tested FTP.'}</span>;
            }
            if (src === 'est (FTP)') {
              return <span>{ftp != null ? `Your estimated FTP is ${ftp} W` : 'Your FTP is an estimate'} — not one you confirmed.</span>;
            }
            return <span>{ftp != null ? `Your tested FTP is ${ftp} W.` : 'Measured against your own tested FTP.'}</span>;
          })()}
          {asOf(lead.newestAgeDays) && <span>Newest qualifying ride {asOf(lead.newestAgeDays)}.</span>}
          {showDot && anchor?.label && <span>{anchor.label}</span>}
        </span>
      )}
      {/* THE LONG VIEW — 12-week power sparkline (the cyclist's e1RM/efficiency analog, 2026-07-23). Only when
          power LEADS with a REAL w20 verdict — `lead: 'none'` (building) used to slip through here and put a
          sinking per-ride-effort line under "load holding", which read as fitness falling (Michael, 2026-08-13). */}
      {/* ⚠️ THE POWER CHART STAYS — it is watts, not efficiency, and nothing else on the screen shows
          it. Only the efficiency picture was duplicated by the rides card, and the bike row never
          drew one: its charts are power and load. */}
      {!building && leadIsPower && (
        <TrendSparkline
          series={fitness.power.series}
          color={getDisciplineColor('bike')}
          dotNoun="ride"
          fmtVal={(v) => String(Math.round(v))}
          unit=" W"
          minSpanFraction={0.15}
          recentLabel="recent 6 weeks in color"
        />
      )}
      {/* ⛔ THE CTL/"fitness" CHART IS REMOVED (2026-09-01). Its axis read "10–23 fitness" — the same
          Banister/Coggan load model whose words we removed, drawn as a graph an athlete cannot read,
          and duplicating the load plate at the top of the screen. The ride EFFICIENCY series now
          renders under this same bike plate (Round 3 pass 1), so the bike still leads with a chart an
          athlete CAN read. The power chart above stays (watts, real). The model is untouched
          server-side. */}
    </Row>
  );
}

// STRENGTH row — VOLUME direction LEADS (activity/load fact: up/steady/down), e1RM is the secondary
// fitness read (rendered ONLY when there's a trend to hold — thin → clause dropped, no "holding"
// claim), session count is the receipt, "unplanned" a dim receipt. Volume DOWN is neutral-colored,
// not red (a deload/taper isn't a fitness loss). Industry-standard (Strong/Hevy/JEFIT).
const VOLUME_WORD: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'up', cls: 'text-emerald-400', arr: '' },
  holding: { word: 'steady', cls: 'text-white/70', arr: '' }, // NEUTRAL — steady volume is not a caution
  sliding: { word: 'down', cls: 'text-white/50', arr: '' },
  needs_data: { word: 'needs data', cls: 'text-white/60', arr: '' },
  withheld: { word: 'too few to read', cls: 'text-white/60', arr: '' },
};

// STRENGTH row — PER-LIFT estimated 1RM read (Strong/Hevy + RTS/RP, verified vs field + science 2026-07-19).
// Supersedes the rolled-up "getting stronger" verdict + baseline dot. Commercial strength apps show each MAIN
// LIFT's estimated 1RM and a PR flag, referenced to YOUR OWN best — not a typed baseline (which the
// field doesn't use and which pegged the dot dumb once you passed it). The estimate is RIR-adjusted +
// near-failure-weighted (compute-facts estimated1RM, the previous program's formula per D-339, + D-118), which is the science's own caveat.
// Receipts kept PER LIFT (sessions · as of). The grinding/RIR fatigue line (D-302) stays below — a distinct
// fatigue axis, not the number.
// ⚠️ 2026-08-01: the per-lift TREND CHIP was removed (D2 — see the note inside the component). The
// noise guard it relied on is still on the spine and still correct; the data underneath it is simply
// one reading per cycle, which is too sparse for any direction claim, guarded or not. `planWeek` is
// back as a real input — it now carries the block position this row renders.
// [Step 7] The big-4 lifts that get a 12-week e1RM sparkline (Michael 2026-07-23). This used to be a
// second copy of the server's list with a comment claiming they matched; it now IS the server's list
// (`src/lib/tracked-max-lifts.ts`), which is also what gates the series being emitted at all. One
// membership test, both ends — so a name can never be drawn without being filled, or filled without
// being drawn. See that module for why this is four while the coaching gate is sixteen.
/**
 * ⛔ THE SPINE'S CANONICAL NAME → THE `training_max` KEY (slice b). Two vocabularies for the same four
 * lifts, and this is the one place they meet — the same shape `ONE_RM_KEY_FOR_REF` uses in the
 * composer, and for the same reason: indexing one with the other silently returns nothing, and
 * "nothing" is a legitimate output here, so the miss would be invisible.
 *
 * ⚠️ `trap_bar_deadlift` MAPS TO `deadlift`. The spine tracks it as its own lift (a real distinction
 * for an e1RM series) and the block prescribes one deadlift training max. A trap-bar puller whose
 * number reset must see it said.
 */
const CALIBRATION_REF_BY_CANONICAL: Record<string, string> = {
  squat: 'squat',
  bench_press: 'bench',
  deadlift: 'deadlift',
  trap_bar_deadlift: 'deadlift',
  overhead_press: 'overheadPress',
};

function StrengthFitnessRow({ fitness, fatigue, planWeek, block, calibration }: { fitness: StrengthFitness; fatigue?: boolean; planWeek?: number | null; block?: BlockCard | null; calibration?: StrengthCalibrationRead }) {
  // Main lifts with a real e1RM number; primaries lead (squat/bench/deadlift/press — the field's "main lifts").
  /**
   * ⛔ ONE SLOT, ONE CARD (FIXLIST 2b, ruled by Michael 2026-09-01). The trap bar deadlift is not a
   * fifth lift on this screen — it fills the deadlift slot, per the book's PRIMARY HINGE pattern, and
   * the app already prescribed its working weight off the deadlift training max
   * (`CALIBRATION_REF_BY_CANONICAL` directly above maps it). The fold is DISPLAY-side: no stored
   * history, canonical name or athlete data changes, and no server field moves.
   * ⚠️ See `src/lib/fold-lift-slots.ts` for why there is no "which version" line on the card, and why
   * a merged number reading lower than the unmerged deadlift did is the correct outcome rather than a
   * regression — `showBest` below renders the record precisely when that happens.
   */
  const lifts = foldVariantSlots(fitness.perLift.filter((l) => l.isPrimary && l.latestE1rm != null));
  const blockLine = blockContextLine(planWeek, block);
  // ⛔ SLICE b — the ambient per-lift state, by `training_max` key. Absent for any lift the current
  // block does not prescribe (an accessory, or a lift on a plan that is not a strength block), and
  // absent renders nothing rather than guessing at a status.
  const calByRef = new Map((calibration?.byLift ?? []).map((c) => [c.ref, c]));
  // ⛔ THE PER-LIFT DIRECTION IS GONE, AND ITS ABSENCE IS THE FIX (D2, 2026-08-01).
  //
  // This row used to print a direction chip per lift — "↓ −4%", "→ flat", "new" — off the 6-week
  // e1RM trend. The number it judged is produced ONCE PER CYCLE: an e1RM comes off the top set, and
  // a the previous program cycle deliberately runs that set from 65% to 95% across its weeks. So the series it
  // read was mostly the PRESCRIPTION moving, sampled about four times, and it called a week the
  // athlete executed perfectly a decline. Michael, on his own screen: bench reading "flat" with a
  // dropping line, on week 1 of a block that is light on purpose.
  //
  // ⚠️ DELETED, NOT SILENCED, AND NOT REPLACED BY A PROTOCOL-AWARE VERSION. Making the chip smarter
  // was the trap — it keeps a directional claim alive on data too sparse to carry one, and every
  // future protocol then owes it another exception. The number is a fact and stays; the 12-week
  // chart still shows the shape; what the week was FOR is now stated instead of inferred.
  //
  // ⚠️ The spine still computes `direction` and still excludes deload weeks from it (D-338) — this
  // row simply no longer renders it. Nothing upstream changed, so nothing else that reads that
  // verdict moved.
  // ⛔ READ, NOT DECIDED (2026-07-30). This screen used to hold the PR rule itself — three conditions
  // over all-time best, all-time count and the latest estimate. Deciding what counts as a personal
  // record is a verdict, and verdicts are the spine's (Constitution Law 4). It now lives in
  // `_shared/state-trend/assemble.ts`; the rule is unchanged, only its address.
  // ⚠️ Absent → false. An older snapshot that predates the field shows no PR rather than a wrong one.
  const isPR = (l: (typeof lifts)[number]) => (l as any).isPr === true;
  return (
    <Row label="strength">
      {/* WHAT THE WEEK IS FOR, above the numbers it explains. Rendered even with no lifts logged yet —
          the block is running whether or not this row has anything to show. */}
      {blockLine && (
        <span className="basis-full text-white/45 text-[11px] -mt-0.5">{blockLine}</span>
      )}
      {lifts.length === 0 ? (
        <span className="text-white/60">needs 2+ logged lifts to trend</span>
      ) : (
        <>
          {/* ⚠️ "· last 6 weeks" is gone with the direction it described. It named the trend window,
              and a window label sitting over numbers that no longer carry a trend is the stale-label
              fault this screen has already been caught on three times. */}
          {/* readout-label / readout-num (index.css): the Details tab's instrument typography,
              tinted by the plate's own accent. Discipline HEADER labels stay white on purpose —
              that's the 2026-07-22 colored-icon-not-colored-text call, unreversed. */}
          <span className="readout-label basis-full text-[11px] uppercase tracking-wider">estimated 1-rep max</span>
          {lifts.map((l, liftIdx) => {
            return (
              /* Each LIFT is its own lit card (2026-08-15, Michael: "give each strength exercise its
                 own lighting… like nebula") — the logger's `.galaxy-card` (index.css), strength
                 orange as the light, dimmer than a logger exercise card because four of them stack
                 inside one plate. `basis-full` keeps the card full-width inside Row's flex-wrap; the
                 inner flex re-creates Row's wrap context so the spans inside stack as before.
                 Star field shifts per lift so the stack doesn't tile. */
              <div
                key={l.canonical}
                className="galaxy-card readout-texture basis-full rounded-xl border border-strength/20 px-2.5 pt-2 pb-1.5 flex flex-wrap gap-x-3 gap-y-1"
                style={{
                  ['--card-accent-rgb' as any]: '255,140,66',
                  ['--card-accent-a' as any]: '0.16',
                  ['--card-star-x' as any]: `${(liftIdx % 4) * 4}%`,
                }}
              >
                {/* 2-column grid: name (fills) | e1RM value (right-aligned number column) — the third
                    column held the direction chip and went with it, so the lb column now carries the
                    right edge on its own (tabular-nums keeps the digits equal-width).
                    ⚠️ PR STAYS. It is not a direction: it is an exact fact about one measured set
                    against every previous one, decided on the spine (assemble.ts), not a trend. */}
                <span className="basis-full inline-flex items-baseline gap-1.5">
                  <span className="text-white/85 text-[14px] truncate">{l.displayName}</span>
                  {/* PR tags wear the sport colour, not green — green means bike (Michael 2026-08-15). */}
                  {isPR(l) && <span className="text-strength text-[10px] uppercase tracking-wide font-semibold">PR</span>}
                  {l.provisional && <span className="text-white/40 text-[10px]">provisional</span>}
                </span>
                {/* ⛔ THE AMBIENT STATUS — SLICE b, AND IT IS ALWAYS ON. climbing · holding · reset,
                    with the training max it refers to.

                    ⛔ THIS IS THE THING THE DELETED CEILING NEVER GAVE ANYBODY, and slice b names it
                    as the original bug: *"a number that silently stopped moving with nothing on
                    screen."* An event that confirms what the row already showed is information; an
                    event that arrives from nowhere is an alarm.

                    ⚠️ `holding` IS NOT `reset`. p33 — a missed session holds the weight and costs
                    nothing, the free re-try. A row calling that "reset" would report a penalty the
                    engine did not apply. The two words are kept apart in `CALIBRATION_STATUS_LABEL`.

                    ⚠️ THE NUMBER IS THE TRAINING MAX, and the label says so — it and the day's top
                    set differ by the week's percentage, and an athlete comparing the two would
                    otherwise find two numbers for one lift with nothing telling them which is which. */}
                {(() => {
                  const cal = calByRef.get(CALIBRATION_REF_BY_CANONICAL[l.canonical] ?? '');
                  if (!cal) return null;
                  return (
                    <span className="basis-full text-white/45 text-[11px] -mt-0.5">
                      {liftStatusLine(l.displayName, cal.status, cal.trainingMax)}
                    </span>
                  );
                })()}
                {/* READOUT TILES (2026-08-15) — the lift's three numbers as value-over-label, the
                    Details-tab shape. They were three label/value LINES; the facts are identical.
                    ⛔ THE RECORD (D-420 pillar 1) keeps its rule: "best" is the best estimated max
                    you HOLD, and it is omitted when the latest reading IS the record — the PR tag
                    above already says so, and repeating the number reads as two different facts.
                    "e1RM" labels the number an ESTIMATE, not a tested max (2026-08-11). */}
                {(() => {
                  const best = (l as any).allTimeBestE1rm as number | null;
                  const latest = l.latestE1rm as number;
                  const showBest = best != null && best > latest + 0.5;
                  return (
                    <ReadoutTiles
                      size="sm"
                      columns={3}
                      tiles={[
                        { value: `${Math.round(latest)} lb`, label: 'e1RM' },
                        showBest ? { value: `${Math.round(best as number)} lb`, label: 'best' } : null,
                        {
                          value: String(l.sampleCount),
                          label: l.sampleCount === 1 ? 'session' : 'sessions',
                          note: asOf(l.newestAgeDays) || undefined,
                        },
                      ]}
                    />
                  );
                })()}
                {/* ⛔ THE REP PR (D-420 pillar 2). the previous program: 225x6 → 225x9 IS the progress. This is
                    also the ONLY home for a long all-out set — 105 lb × 35 can never mint an e1RM
                    (D-417's trusted-rep ceiling refuses it, correctly), and it is still a record.
                    ⚠️ Read from the spine, never re-derived: `is_rep_record` was decided in
                    `allOutSeriesByLift` against the sessions BEFORE it — the same walk the Performance
                    screen's all-out card uses, so the two screens cannot disagree. */}
                {(() => {
                  const ao = (l as any).lastAllOut as
                    | { date: string; weight: number; reps: number; isRepRecord: boolean }
                    | null | undefined;
                  if (!ao || !(ao.weight > 0) || !(ao.reps > 0)) return null;
                  /**
                   * ⛔⛔ THE SET AND THE ESTIMATE ARE OFTEN DIFFERENT SESSIONS, AND THE CARD SAID SO
                   * NOWHERE (2026-08-29, Michael: *"deadlift math is wrong"*).
                   *
                   * His deadlift read "120 lb E1RM" beside "all-out 135 lb × 10" — a heavier set,
                   * next to a smaller number, with nothing to connect or separate them. Both are
                   * correct and they are five days apart: the estimate is 105 × 5 on 21 Aug, and the
                   * all-out set is 135 × 10 on 25 Aug, which D-417's rep ceiling REFUSES to estimate
                   * from because the formula only holds to ~5 reps on a deadlift (it would have
                   * claimed 180). The arithmetic was never wrong; the card was.
                   *
                   * So the line carries its OWN DATE, and when the set is past the ceiling it says
                   * why it is not the estimate. ⚠️ It is still shown — a long all-out set is a real
                   * record and this is its only home (D-420).
                   */
                  const aoDate = ao.date ? new Date(ao.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
                  const tooManyReps = ao.reps > trustedMaxReps(l.canonical);
                  return (
                    <span className="basis-full text-white/50 text-[11px] -mt-0.5 inline-flex items-baseline gap-1.5 flex-wrap">
                      <span className="tabular-nums">all-out {Math.round(ao.weight)} lb × {ao.reps}</span>
                      {aoDate && <span className="text-white/40">{aoDate}</span>}
                      {ao.isRepRecord && (
                        <span className="text-strength text-[10px] uppercase tracking-wide font-semibold">rep PR</span>
                      )}
                      {tooManyReps && (
                        <span className="text-white/40">· too many reps to estimate a max from</span>
                      )}
                    </span>
                  );
                })()}
                {/* THE LONG VIEW per lift — 12-week e1RM sparkline (big-4 only, Michael 2026-07-23). Same
                    component as the run row; server sends the recent-6wk slice in the strength color. */}
                {isTrackedMaxLift(l.canonical) && (
                  <TrendSparkline
                    series={l.series}
                    color={getDisciplineColor('strength')}
                    dotNoun="session"
                    fmtVal={(v) => String(Math.round(v))}
                    unit=" lb"
                    minSpanFraction={0.25}
                    // This lift's own reading history — NOT a position in the block. The block is
                    // stated once, at the top of the row, from the card.
                    buildingLabel={(w) => `${w} ${w === 1 ? 'week' : 'weeks'} of readings`}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
      {/* ── THE PULL-UP PROGRESSION (Slice 6) ─────────────────────────────────────────────────────
          ⛔ RENDERED ONLY WHEN THE ATHLETE TURNED THE GOAL ON. The spine sends `pullups` only for
          `performance_focus === 'pullups'`, so the absence here IS the gate — this screen decides
          nothing (Constitution Law 2: surfaces render, never re-decide).

          ⛔ TWO MEASUREMENTS, SHOWN AS TWO FACTS. The clean max is one set to failure; the previous program's
          standard is 50 reps inside 10 minutes, which is a SESSION measure. Neither converts into
          the other, so the copy never says "12 of 50" or draws a progress bar between them — that
          would be an invented metric, and this row has been caught minting verdicts before.

          ⛔ NO LEARNED NUMBER, AND THE ROW IS HONEST ABOUT IT. Every other lift here can offer "your
          logs suggest X" off `learned_fitness.strength_1rms`; a pull-up cannot — `capacity-resolver`
          maps it to `TYPED_TO_LEARNED: null` (D-229) because a rep count is not a load. What is
          shown is what was logged, and nothing is estimated. */}
      {fitness.pullups && (
        <>
          <span className="readout-label basis-full text-[11px] uppercase tracking-wider mt-2">pull-ups</span>
          {/* Two tiles, side by side, NOT a progress pair — they are different measurements (one
              set to failure vs a session standard) and the layout must never imply "X of 50". */}
          <ReadoutTiles
            columns={2}
            tiles={[
              {
                // ⚠️ null is NOT zero. No clean set logged means unmeasured — printing 0 would read
                // as "we tested you and you cannot do one", a different and untrue claim.
                value: fitness.pullups.cleanMaxReps == null ? '—' : `${fitness.pullups.cleanMaxReps} reps`,
                label: 'best clean set',
              },
              {
                value: `${fitness.pullups.standardReps} in ${fitness.pullups.standardMinutes} min`,
                label: 'session standard',
              },
            ]}
          />
          {/* ⛔ ASSISTED REPS GET THEIR OWN LINE, ALWAYS SEPARATE. They are real work and the band
              on-ramp is the standard — but folded into the clean count the number
              climbs while the athlete gets no stronger. Walking the band down shows up here as this
              falling while the clean count rises, which is the actual thing happening. */}
          <span className="basis-full text-white/50 text-[11px] -mt-0.5">
            {fitness.pullups.cleanReps} clean rep{fitness.pullups.cleanReps === 1 ? '' : 's'}
            {fitness.pullups.assistedReps > 0
              ? ` · ${fitness.pullups.assistedReps} band-assisted, counted separately`
              : ''}
            {fitness.pullups.sessions > 0
              ? ` · ${fitness.pullups.sessions} session${fitness.pullups.sessions === 1 ? '' : 's'}`
              : ''}
          </span>
        </>
      )}

      {/* AUTOREGULATION read — the FATIGUE axis, distinct from the e1RM numbers above (D-302 slice 2). Grinding
          shows as RIR below prescription BEFORE it shows in e1RM. Sourced from the spine's
          `strength_rir_below_prescription` — rendered here, NOT recomputed, pulled from the nudge list so it
          lives in ONE place. Voice: fact-first, conditional, no imperative (docs/COPY-VOICE.md). */}
      {fatigue && (
        <span className="basis-full text-[13px] text-amber-300/80 leading-snug mt-1">
          Recent sets are landing below the planned reps in reserve — closer to failure than the plan called for. Held for weeks, that's the fatigue a deload clears.
        </span>
      )}
    </Row>
  );
}

// Swim performance stays provisional until Q-038 is fixed (run approved 2026-06-13); flag it
// in the UI. This row-level tag is separate from headline gating (HEADLINE_GATED_DISCIPLINES).
const PROVISIONAL_PERF = new Set(['swim']);

// Discipline rows are tagged by a small COLORED ICON, not colored text (Michael 2026-07-22, UX-nerd call).
// Categorical color (which discipline) lives on a contained icon; the LABEL stays white for legibility;
// semantic color (green=improving / amber=holding, the traffic light) is left free for the verdicts. This
// resolves the collision where green/amber meant both a discipline AND a status. Icons match the app-wide
// set in WorkoutCalendar (one run icon everywhere), tinted with the ONE shared getDisciplineColor.
const DISCIPLINE_ICON: Record<string, LucideIcon> = { run: Activity, strength: Dumbbell, swim: Waves, bike: Bike, ride: Bike };
// Discipline name is a HEADER above the content (2026-07-23) — the content (and its 12-week charts) then
// spans the FULL row width instead of being indented past a ~94px label gutter, so the sparklines get the
// horizontal room to breathe. The colored discipline icon still tags the header.
// ⛔ THE INNER SPORT HEADING IS GONE (2026-09-01, Round 3). Every sport row now renders inside the
// collapse wrapper, whose header already shows the sport icon + name; the Row's own "BIKE" title made
// an expanded block read "BIKE" twice. Row keeps its padding/border and its content layout — ONLY the
// duplicate title line is dropped. `label` stays on the signature (callers pass it) but is unused now.
function Row({ label: _label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5 border-b border-white/[0.055] last:border-0">
      <div className="text-[13px] text-white/80 flex flex-wrap gap-x-3 gap-y-1 leading-none tabular-nums">
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
  sound: { word: 'pace holds on long efforts', cls: 'text-emerald-300' },
  needs_work: { word: 'pace fading on long efforts', cls: 'text-amber-400/90' },
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
            {overflow === 'better' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-white/60 text-[11px]">›</span>}
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
function FitnessDotBlock({ label, range, verdict, pctChange, provisional, wordMap = VERDICT, showAxis = true, frame = 'vs your 12-week range', explain }: {
  label: string;
  range: { positionPct: number; confident: boolean };
  verdict: TrendVerdict;
  // ⚠️ REQUIRED WHENEVER `wordMap` IS WORDLESS. Without a word this block would render a bare arrow
  // and say nothing about size. Callers on the VERDICT map may omit it — the word carries them.
  pctChange?: number | null;
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
            {label} <span className="text-white/50 text-[11px]">{explainOpen ? '▾' : 'ⓘ'}</span>
          </button>
        ) : (
          <span className="text-white/55 text-[13px]">{label}</span>
        )}
        {verdict !== 'needs_data' && (
          // ⛔ `withheld` PRINTS NO NUMBER. "Too few to read −0.4%" reads as a result with a caveat
          // attached, and the number is the part people take away — so the row would say the opposite
          // of what the engine decided. Withheld means we are not making a claim; the percent IS the
          // claim. (Only the bike lead passes `pctChange` here today — the card caller at :1035 omits
          // it — so this changes the bike row and nothing else.)
          <span className={`inline-flex items-baseline gap-0.5 text-[13px] ${v.cls}`}>{v.arr && <span>{v.arr}</span>}{v.word && <span>{v.word}</span>}{pctChange != null && verdict !== 'withheld' && <span className="text-white/60 ml-0.5">{verdictSignedPct(verdict, pctChange)}</span>}{provisional && <span className="text-white/50 text-[12px] ml-1">provisional</span>}</span>
        )}
      </span>
      <FitnessDot pct={range.positionPct} confident={range.confident} />
      {showAxis ? (
        <span className="basis-full flex items-center justify-between text-[11px] text-white/45">
          <span>weaker</span><span>{range.confident ? frame : 'thin data'}</span><span>stronger</span>
        </span>
      ) : !range.confident ? (
        <span className="basis-full text-center text-[11px] text-white/45">thin data</span>
      ) : null}
      {explain && explainOpen && (
        <p className="basis-full text-[12px] text-white/60 leading-snug mt-1 max-w-[min(100%,340px)]">{explain}</p>
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
    <span className="basis-full text-[12px] text-white/50">no baseline set{hint ? ` · ${hint}` : ''}</span>
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
// THE LONG VIEW (Michael 2026-07-22) — a 12-week efficiency sparkline that answers "am I trending up over
// the block?" while the verdict above answers "is my current training working?". Plots the SAME series the
// verdict reads (recent-6wk in the run color = the slice the verdict judges; older weeks dim for context),
// so chart and word are one truth. FILLS AS YOU BUILD: a new user sees a few points on the 12-week canvas
// with an honest coverage label ("building · N of 12 weeks"), never a fabricated smooth line. <2 points →
// no line (can't imply a trend through one dot). Tap to expand. TP charts LOAD; this charts OUTPUT.
// Generalized 2026-07-23 so the same visual serves run efficiency AND per-lift strength e1RM (Michael's
// big-4 chart). Props default to the run row's exact look/copy; strength passes color + nouns + a lb formatter.
// ⛔ TrendSparkline MOVED to ./TrendSparkline.tsx (Round 3 pass 2) — the one chart language,
// shared by run, ride, bike and strength. Imported at the top of this file.

/**
 * ⛔⛔ UNREACHABLE SINCE 2026-09-01 — NOTHING RENDERS THIS. FIXLIST item 1b removed the run card from
 * the Fitness section entirely, so there is no longer a call site.
 *
 * ⚠️ IT WAS ALREADY DARK FOR ALMOST EVERY ATHLETE BEFORE THAT. `runSpineCovers` had suppressed it
 * since 2026-08-29 for anyone whose payload carried an endurance spine — which is anyone with a
 * single logged run (`compute-snapshot/index.ts` emits a spine group at one point; `SpineCard`
 * renders at one point). Only a coach payload cached before v174 ever reached this component.
 *
 * ⛔ NOT DELETED, DELIBERATELY, AND NOT MY CALL TO DELETE. It carries content that exists nowhere
 * else on the screen: the measured heat cost in seconds per mile per 10°F off the athlete's own
 * runs (D-346), the temperature-spread caption, the ⓘ definition tap-down, and the Q-179 posture
 * sentence. Retiring ~330 lines of that is a product decision, not a cleanup. Left standing with
 * this banner so the next session cannot mistake it for live code.
 */
function RunFitnessRow({ fitness, postureSentence }: { fitness: RunFitness; postureSentence?: string | null; showAxis?: boolean; mode?: FitnessMode; anchor?: FitnessAnchor }) {
  const { useImperial } = useAppContext();
  const eff = fitness.efficiency;
  const dur = fitness.decoupling;
  // ⛔ TWO CUES, TWO ANSWERS (2026-08-01, Michael). ⓘ = *what is this metric*. "more" = *what is it
  // saying about me right now*. They were one blob behind the metric word, so an athlete who
  // wanted the definition got the whole read, and an athlete who wanted the read had to tap a
  // glyph that promised a definition. Different questions, different cues, opened separately.
  const [explainOpen, setExplainOpen] = React.useState(false);   // ⓘ — definition only
  const [detailOpen, setDetailOpen] = React.useState(false);     // more — the read
  // ⛔ THE GAP TOGGLE IS GONE (D-346, 2026-07-31). It offered raw-vs-grade-adjusted pace, which made
  // sense when the row's pace was the raw number the watch showed. The pace now comes from the
  // verdict's own pool and is ALREADY grade-adjusted, so `recentGapPaceSecPerKm` is deliberately null
  // and the toggle could never render. Left in place it was dead code advertising a distinction that
  // no longer exists.
  const shownPace = eff.recentPaceSecPerKm;
  const v = verdictLabel(eff.verdict, eff.recentlyFlat, RUN_EFF_WORDS);   // word + arrow + whole percent
  // ⚠️ The conditions line: the temperature SPREAD across the plotted runs. Shown, never corrected —
  // it is what lets the athlete discount a hot month without the app claiming to have done it for them.
  // ⛔ WHAT HEAT COSTS YOU, IN SECONDS PER MILE (D-346, 2026-07-31).
  //
  // The regression already LEARNED this athlete's heat coefficient to remove it from the verdict —
  // and then threw the most interesting number in the feature away. Michael: *"help them understand
  // the costs of heat and other factors."* Garmin corrects silently and never tells you the size of
  // it; TrainingPeaks says "consider temperature". Nobody hands the athlete their own number.
  //
  // ⚠️ ROUNDED TO 5s AND HEDGED, BECAUSE THE FIT MOVES. Measured across his windows the coefficient
  // ran −0.22 / −0.26 / −0.34 %/°F (90d / 6mo / 12mo) — real, and inside the published band of
  // 1–3% per 5°C (≈0.11–0.33 %/°F), but ±25% depending on the window. "About 20 seconds" is honest;
  // "20.4 seconds" would be a precision we do not have.
  //
  // ⛔ PLAUSIBILITY GUARD. Only a NEGATIVE coefficient inside the literature band renders. An unstable
  // fit can come back POSITIVE — hotter reading as faster — which happened on a thin route pool during
  // development, and shipping that would tell an athlete heat makes them quicker.
  const heatCost = React.useMemo(() => {
    const coef = eff.route?.heatCoefPctPerF;
    const paceKm = eff.recentPaceSecPerKm;
    if (coef == null || paceKm == null || !(paceKm > 0)) return null;
    if (!(coef < 0)) return null;                       // wrong sign → unstable fit, say nothing
    const mag = Math.abs(coef);
    if (mag < 0.08 || mag > 0.45) return null;          // outside the published band → do not assert
    const secPerMi = (mag / 100) * (paceKm * 1.60934) * 10;   // per 10°F
    const rounded = Math.round(secPerMi / 5) * 5;
    if (rounded < 5) return null;                        // below the rounding floor — nothing to say
    return `Heat costs you about ${rounded}s a mile per 10°F warmer, measured on your own runs.`;
  }, [eff.route, eff.recentPaceSecPerKm]);
  // ⛔ "grade-adjusted" IS GONE FROM HERE (2026-08-01, Michael — jargon). The caption's job is the
  // CONDITIONS the plotted runs were done in; the METHOD is now stated in a plain sentence beside the
  // heat line, where the athlete is already being told what the number does and does not include.
  // ⚠️ Sub-8°F spread returns null rather than a bare method word — with the jargon removed there was
  // nothing left to say, and a caption that says nothing is worse than no caption.
  const routeCaption = React.useMemo(() => {
    const temps = (eff.route?.series ?? []).map((p) => p.tempF).filter((t): t is number => t != null);
    if (temps.length < 2) return null;
    const lo = Math.round(Math.min(...temps)), hi = Math.round(Math.max(...temps));
    return hi - lo >= 8 ? `${lo}–${hi}°F across these runs` : null;
  }, [eff.route]);
  // ⛔ THE READ, HOISTED (2026-08-01). Lives here rather than inline so the "more" cue can be shown
  // only when there IS something behind it — a cue that opens an empty panel is worse than no cue.
  // Same numbers, same `ciRange`, same rounding as everywhere else on this row.
  const trendDetail = React.useMemo(() => {
    const wks = eff.route?.spanDays != null ? Math.max(1, Math.round(eff.route.spanDays / 7)) : null;
    const over = wks != null ? ` over ${wks} weeks` : '';
    const rng = ciRange(eff.route?.ci);
    const mag = eff.pctChange != null ? Math.abs(Math.round(eff.pctChange)) : null;
    if (eff.verdict === 'holding') return `No real change in speed-for-effort${over}.`;
    if (eff.verdict === 'sliding' && eff.recentlyFlat) {
      return mag == null
        ? 'Dropped earlier, steady for the last few weeks.'
        : `About ${mag}% less speed per heartbeat${over}${rng ? ` (${rng})` : ''} — most of that drop was earlier; the last few weeks have held steady.`;
    }
    if (eff.verdict === 'improving' && mag != null) return `About ${mag}% more speed per heartbeat${over}${rng ? ` (${rng})` : ''}.`;
    // ⚠️ The SLIDING branch names the ordinary causes because a decline here is routinely correct, and
    // a bare "slower" invites the athlete to read a problem the number cannot support. Possibilities,
    // never a finding.
    if (eff.verdict === 'sliding' && mag != null) return `About ${mag}% less speed per heartbeat${over}${rng ? ` (${rng})` : ''}. Heat, fatigue, or a base block can all cause this.`;
    return null;
  }, [eff.verdict, eff.recentlyFlat, eff.pctChange, eff.route]);
  const hasDetail = !!(postureSentence || trendDetail || shownPace != null);
  const hasTrend = eff.verdict !== 'needs_data' && eff.verdict !== 'withheld';
  // ⛔ THE WINDOW LABEL DESCRIBES THE POOL THAT WAS ACTUALLY READ (D-346, 2026-07-31).
  //
  // It was hardcoded to 42 days. When the verdict moved to the grade-adjusted all-runs pool the data
  // became ~90 days and the label kept saying "over 6wk" — so the row reported 26 runs over six weeks
  // when it meant thirteen. Michael caught it on the shipped screen. **A stale label on fresh data is
  // the same fault as a stale doc: it is believed precisely because everything around it is right.**
  const evidence = eff.sampleCount != null
    ? trendEvidence({
        windowDays: eff.route?.spanDays ?? 42,
        sampleCount: eff.sampleCount,
        newestAgeDays: eff.newestAgeDays,
        discipline: 'run' as Discipline,
      })
    : null;
  // Durability shows as a quiet secondary ONLY when it has a real read (not needs_data/withheld).
  // ⛔ SILENCED WHILE ITS INPUT IS KNOWN BAD (D-346, 2026-07-31).
  //
  // "pace fading on long efforts" is the DECOUPLING band, and decoupling still runs through
  // `isSteadyAerobic(workout_type)` — the gate that reads `steady_state` on every run ever logged. His
  // 24.9% hill session is in that pool, which is what pushes the band to `needs_work`. So the sentence
  // is a claim about long steady efforts computed partly from a hill session.
  //
  // ⚠️ It sat directly beneath a verdict that had just been cleaned of exactly that — **the clean
  // number lending its credibility to the dirty one.** Saying nothing is the honest state until the
  // decoupling gate is fixed; D-346 carries that as the remaining work.
  const durWord = null;
  return (
    <Row label="run">
      <span className="basis-full flex items-baseline justify-between gap-2">
        <button type="button" onClick={() => setExplainOpen((o) => !o)} className="inline-flex items-baseline gap-1 text-white/55 text-[13px]">
          efficiency <span className="text-white/50 text-[11px]">{explainOpen ? '▾' : 'ⓘ'}</span>
        </button>
        {hasTrend ? (
          <span className={`inline-flex items-baseline gap-1 text-[13px] ${v.cls}`}>
            {v.arr && <span>{v.arr}</span>}{v.word && <span>{v.word}</span>}
            {eff.pctChange != null && <span className="text-white/60">{verdictSignedPct(eff.verdict, eff.pctChange, 0)}</span>}
          </span>
        ) : (
          // Honest: efficiency is a TREND, so one run can't read it. Say how close — not a confident dot.
          //
          // ⛔ TWO DIFFERENT REASONS FOR SILENCE, AND THEY MUST NOT SHARE COPY (D-346, 2026-07-31).
          // The verdict now comes from the route engine (same route, heat de-confounded, gated on a
          // confidence interval). When THAT withholds, the athlete has plenty of runs — the interval
          // simply still straddles zero. Quoting the old "N of 8 steady runs" floor would name a
          // threshold that no longer decides anything, which is how a screen starts lying quietly.
          eff.route
            ? <span className="text-white/60 text-[12px]">
                {/* ⛔ THE FIRST THREE WORDS CARRIED THE OPPOSITE MEANING TO THE REST OF THE SENTENCE
                    (2026-08-28, Michael reading his own screen: *"I'm just still seeing that not
                    enough runs thing"*). It opened "Too soon to tell" — which is the wait-for-more-
                    data complaint — and then said the runs are there and the movement is inside the
                    scatter. He read the opening. This branch means the athlete has PLENTY of runs, so
                    the sentence now leads with the count.
                    ⚠️ AND IT IS NOT A FAULT TO REPORT. On easy training this is the EXPECTED state:
                    zone-2 running produces small true movement against normal day-to-day variation,
                    so the guard withholding a direction is the correct outcome. The line describes
                    the training, never the data. ⛔ Do not reintroduce "too soon", "not yet" or "need
                    more" here — the other branch below is the one that means those things.
                    ⚠️ SEE Q-289 for the larger version of this, still open: when the noise guard
                    fires elsewhere the screen says "holding", which is a CLAIM, and nothing on the
                    payload records that it was suppressed.
                    ⛔ AND THE COUNT IS NOW THE EASY GROUP'S, NOT EVERY RUN (2026-08-28, item 2). The
                    verdict is fitted within one session-type group — easy against easy — so naming a
                    total that includes quality sessions and long runs would quote a population the
                    number never read. That was already the fault in the old line: it said "23 runs"
                    when 23 runs were never what fed it. ⚠️ The other groups are not lost; they carry
                    their own trend on `efficiency.groups` and are not yet rendered. */}
                Reading {eff.route.points} easy runs — the change is smaller than the normal spread between them
              </span>
            : <span className="text-white/60 text-[12px]">Need a few more runs — {eff.sampleCount ?? 0} of {RUN_TREND_MIN_RUNS} steady runs to read a trend</span>
        )}
      </span>
      {/* ⛔ THE RANGE IS ALWAYS-VISIBLE, NOT TAP-ONLY (2026-08-01, Michael — extends [D-356]).
          "A shown number always shows its uncertainty" cannot be satisfied by a range the athlete has
          to go looking for. The headline percent is on screen without a tap, so its interval is too.
          It stays in the ⓘ expand as well — this ADDS a copy, it does not move it.
          ⚠️ BOTH READ THE SAME `ciRange(eff.route.ci)`. One helper, one rounding, so the visible line
          and the expand can never print different numbers for the same interval — which is the only
          way this could go wrong, and would be worse than not showing it at all.
          ⚠️ A `holding` range may straddle zero ("−3% to +2%"). That is shown deliberately: it is the
          honest picture of a verdict that means "no real change", and hiding it would make a flat read
          look more certain than it is. */}
      {hasTrend && (() => {
        const rng = ciRange(eff.route?.ci);
        const line = [rng, evidence].filter(Boolean).join(' · ');
        if (!line && !hasDetail) return null;
        return (
          <span className="basis-full flex items-baseline justify-between gap-2 text-white/55 text-[12px]">
            <span>{line}</span>
            {/* ⛔ THE SECOND CUE, AND IT IS DELIBERATELY A WORD NOT A GLYPH. ⓘ promises a definition;
                "more" promises the read. Two glyphs would have been two mysteries. Gated on
                `hasDetail` so it never opens an empty panel. */}
            {hasDetail && (
              <button type="button" onClick={() => setDetailOpen((o) => !o)} className="shrink-0 text-white/50">
                {detailOpen ? 'less' : 'more'}
              </button>
            )}
          </span>
        );
      })()}
      {/* THE READ — plan context first, then what the trend is saying. Opened by "more", never by ⓘ. */}
      {detailOpen && (
        <>
          {postureSentence && (
            <p className="basis-full text-[12px] text-white/80 leading-snug mt-1 max-w-[min(100%,340px)]">
              {postureSentence}
            </p>
          )}
          {trendDetail && (
            <p className="basis-full text-[12px] text-white/55 leading-snug mt-1 max-w-[min(100%,340px)]">
              {trendDetail}
            </p>
          )}
          {/* ⛔ PACE MOVED UNDER "more" (2026-08-01, Michael: "just let it be what it is — speed per
              heartbeat"). It was added as the "what" under the index's "why", back when the row led
              with an efficiency INDEX that meant nothing to a human. The row no longer shows an index —
              it shows a direction and a percent — so a pace-at-HR sitting on the always-visible line
              was a second, more concrete-looking number competing with the one the row is actually
              about. It is a translation of the metric, so it belongs with the explanation.
              ⚠️ Still the verdict's OWN pool and already grade-adjusted — it cannot disagree with the
              number above it. */}
          {shownPace != null && (
            <p className="basis-full text-[12px] text-white/55 leading-snug mt-1 max-w-[min(100%,340px)]">
              Recently about {formatPace(shownPace, useImperial)}{eff.recentHrAvg != null ? ` at ${eff.recentHrAvg} bpm` : ''}.
            </p>
          )}
        </>
      )}
      {/* ⛔ WHAT THE NUMBER ALREADY ACCOUNTS FOR, IN PLAIN WORDS (2026-08-01, Michael). This replaces
          "grade-adjusted" in the chart caption — correct, and jargon. It sits beside the heat line
          because the two answer the same question: what has already been taken out of this number, so
          the athlete knows what NOT to explain away. Heat is stated as a COST (measured on their own
          runs); hills are stated as REMOVED, because they are.
          ⚠️ Gated on `eff.route` — the grade adjustment is the ROUTE engine's. On the non-route
          fallback the claim would not be true, and it stays silent rather than overclaiming. */}
      {hasTrend && eff.route && (
        <span className="basis-full text-white/55 text-[12px]">Evened out for hills, so a hilly week doesn't read as slower.</span>
      )}
      {heatCost && <span className="basis-full text-white/55 text-[12px]">{heatCost}</span>}
      {/* THE LONG VIEW — the arc behind the verdict.
          ⛔ WHEN A ROUTE VERDICT EXISTS THE CHART PLOTS **THE ROUTE'S OWN RUNS** (D-346, 2026-07-31).
          Chart and verdict then read the identical rows and cannot contradict each other — the old
          sparkline drew every run the broken gate let through, hill sessions included, while the
          verdict came from elsewhere. Same route also makes the dots comparable without modelling
          anything away: it is literally the same ground.
          ⚠️ CONDITIONS ARE CAPTIONED, NOT CORRECTED — Intervals.icu's pattern (weather shown so a
          reader can interpret a poor point). Nobody in the field heat-adjusts an efficiency chart. */}
      {/* ⛔ THE CHART MOVED UP THE SCREEN (2026-08-29, Michael: *"I never trusted those old rows"*).
          The efficiency cards at the top of State now draw this same read per session type — easy,
          quality, ride — each with its own line, its own date range and the field's own name for the
          number. Two charts of one metric on one screen is how a reader stops believing either.
          ⚠️ THE VERDICT SENTENCE STAYS. It carries the direction across the whole population of runs
          ("reading 20 easy runs — the change is smaller than the normal spread between them"), which
          the card does not compute. The words are not the duplicate; the picture was. */}
      {/* durability — the SECONDARY read now (fatigue resistance within a run), quiet, only when real */}
      {durWord && (
        <span className="basis-full text-[12px] text-white/55">{durWord}{dur.stale ? ` · last steady run ${dur.newestAgeDays}d ago` : ''}</span>
      )}
      {/* PROJECTED RACE TIMES (Michael 2026-07-22) — goal-free VDOT off current fitness, for the varied
          runner the efficiency row can't serve. Longer distances unlock as the long run grows (a marathon
          estimate off short runs is a fantasy). Locked rows shown dim so the progression is visible. */}
      {Array.isArray(fitness.projections) && fitness.projections.length > 0 && (
        <span className="basis-full flex flex-col gap-1 mt-1.5">
          <span className="text-white/45 text-[11px] uppercase tracking-wider">projected race times</span>
          {/* ⛔ THE BASIS, BESIDE THE NUMBER (D-346, 2026-07-31). These print to the SECOND off a
              threshold pace that can rest on three runs — internally consistent, but a precision the
              input does not support, and the last thing on this row without a receipt. Naming the
              source and the sample count lets the reader weight it; it is the same move the verdict
              and the chart already make. */}
          {(fitness as any).projectionBasis?.samples && (
            <span className="text-white/40 text-[11px]">
              from your measured threshold pace · {(fitness as any).projectionBasis.samples} runs
            </span>
          )}
          {/* 3-column grid: distance | finish time (right-aligned number column) | pace — so the times
              stack into one clean edge. Locked rows span the two value columns with a left-aligned note. */}
          {fitness.projections.map((p) => (
            <span key={p.distance} className="grid grid-cols-[4.5rem_auto_1fr] items-baseline gap-x-2 text-[12px]">
              <span className={p.unlocked ? 'text-white/65' : 'text-white/45'}>{p.label}</span>
              {p.unlocked ? (
                <>
                  <span className="text-white/80 text-right">{p.display}</span>
                  <span className="text-white/50 text-right">{p.paceDisplay}</span>
                </>
              ) : (
                <span className="col-span-2 text-white/45 text-right">unlocks at ~{p.unlockLongRunMiles} mi long run</span>
              )}
            </span>
          ))}
        </span>
      )}
      {/* ⓘ — THE DEFINITION, AND NOTHING ELSE (2026-08-01, Michael). It used to open the posture
          sentence and the trend read as well, so the one cue that promises "what is this metric"
          answered three questions at once. The read moved to "more" above.
          ⛔ THE DEFINITION DESCRIBES THE POOL ACTUALLY READ (D-346): every run, terrain handled by the
          grade adjustment rather than by excluding sessions — not "on steady runs", and not a
          comparison against six weeks ago. The ⓘ is where an athlete checks whether to believe the
          number; a stale explanation there is worse than none. */}
      {explainOpen && (
        <p className="basis-full text-[12px] text-white/55 leading-snug mt-1 max-w-[min(100%,340px)]">
          Efficiency is your speed per heartbeat, adjusted for hills and for heat — rising means faster at the same effort.
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
      <span className="text-white/60">· rest</span>
      {v.arr && <span>{v.arr}</span>}
      <span>{v.word}</span>
      {rest.pctChange != null && <span className="text-white/60">{verdictSignedPct(rest.verdict, rest.pctChange)}</span>}
    </span>
  );
}

// SWIM row — DESCRIBED, not graded. Swim fitness has no honest dot for this app: pace is corrupted by
// fins/paddles/set-type and equipment capture is spotty, and the field (TrainingPeaks/Swim Smooth/Garmin)
// benchmarks swim off a clean CSS test we don't force. So the swim row shows the facts fins CAN'T corrupt
// — swim count, total distance, longest swim — over the 8wk window. Garmin/Strava fallback: volume, not
// a fitness score. No dot, no arrow, no verdict. useImperial → yards (imperial) or meters (metric).
function SwimVolumeRow({ vol }: { vol: SwimVolume }) {
  const weeks = Math.round((vol.windowDays || 56) / 7);
  // ⛔ THE CUMULATIVE TOTAL IS GONE (2026-09-01, Michael twice: it "reads as an achievement while
  // actually recording that he stopped"). Total and longest yardage were a running sum that only
  // grows — meaningless as a state read. Swim is a MINIMAL placement block (never a feature), so it
  // states recency and stops.
  // ⚠️ TRUE "last swim, N ago" NEEDS A SERVER FIELD — `SwimVolume` carries no last-swim date, only a
  // fixed window and a count. Until that field exists (filed as S7), this states swims-in-window,
  // which is the honest client-only read. See the FIXLIST.
  if (!vol.swims) {
    return (
      <Row label="swim">
        <span className="text-white/60 text-[13px]">no swims in the last {weeks}wk</span>
      </Row>
    );
  }
  return (
    <Row label="swim">
      <span className="text-white/70 text-[13px]">
        <span className="text-white/85">{vol.swims}</span> {vol.swims === 1 ? 'swim' : 'swims'} in the last {weeks}wk
      </span>
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
    const vCls = thinStale ? 'text-white/60' : v.cls;
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
            {evidence && <span className="basis-full text-white/55 text-[12px]">{evidence}</span>}
          </>
        ) : (
          <>
            {metricLabel && <span className="text-white/50 text-[13px]">{metricLabel}</span>}
            {hasEvidence ? (
              <>
                <span className={`text-[13px] ${vCls}`}>{trendHeadline(card.headlineVerdict, perf!.pctChange)}</span>
                <span className="text-white/55 text-[13px]">{evidence}</span>
              </>
            ) : (
              <>
                <span className={`inline-flex items-baseline gap-1 ${vCls}`}>
                  {v.arr && <span>{v.arr}</span>}
                  <span>{v.word}</span>
                </span>
                {perf?.pctChange != null && <span className={thinStale ? 'text-white/50' : 'text-white/60'}>{verdictSignedPct(card.headlineVerdict, perf.pctChange)}</span>}
              </>
            )}
          </>
        )}
        {thinStale && <span className="text-white/50 text-[12px]">limited data</span>}
        {asOf(perf?.newestAgeDays) && <span className="text-white/45 text-[12px]">· {asOf(perf?.newestAgeDays)}</span>}
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
        <span className={`text-[13px] ${nd.cls}`}>{ndReceipt}</span>
      ) : (
        <>
          <span className={nd.cls}>{nd.word}</span>
          {card.adherence && <span className="text-white/55">· {card.adherence.ratioLabel}</span>}
        </>
      )}
      {card.discipline === 'swim' && <RestTag rest={restTrend} />}
    </Row>
  );
}

// Q-179 — WHAT THE ATHLETE SAID, next to what the numbers did. The server mints the sentence
// (`_shared/state-trend/posture.ts`, on `card.postureSentence`); it now renders inside the RUN row's
// efficiency ⓘ tap-down (see RunFitnessRow) as opt-in "extra understanding", so it can't duplicate the
// always-visible week-execution trade sentence. (The old always-visible `PostureLine` — orphaned since
// it was written, F10 — is removed 2026-07-24 now that the ⓘ carries this.)

export default function StatePerformanceSection({ strengthDetail, stateDisplay, primaryDiscipline, planWeek, block, strengthFatigue, hasActivePlan, asOf }: { strengthDetail?: React.ReactNode; stateDisplay?: StateDisplayV1 | null; primaryDiscipline?: string | null; planWeek?: number | null; block?: BlockCard | null; strengthFatigue?: boolean; hasActivePlan?: boolean; asOf?: string | null }) {
  // S2: `stateDisplay` is the server-assembled display contract from the coach payload. When present the
  // hook renders it (no in-browser queries/assembly); absent → legacy live path (safe rollout fallback).
  const { cards, bikeFitness, runFitness, strengthFitness, swimRest, swimVolume, fitnessMode, fitnessAnchors, cadenceCounts, posture: declaredPosture, activeDisciplines, loading } = useStateTrends(stateDisplay);
  const { useImperial } = useAppContext(); // for the collapsed run pace-at-HR glance
  // ⛔ SLICE b — ONE READ, and it must sit ABOVE the early return or the hook order changes between
  // renders. It self-silences on any plan that is not a strength block (`not_a_strength_block`), so
  // calling it unconditionally costs one function invoke and buys a stable hook list.
  const calibration = useStrengthCalibration(true);

  // ⛔ COLLAPSE TO ONE LINE PER SPORT (Round 3, 2026-09-01). Default collapsed — the four sports fit
  // one screen; tap a sport to expand into its detail. Which are open is remembered per athlete in
  // localStorage (a per-viewer convenience; wrapped in try/catch for private mode). ⚠️ NOT tabs — the
  // point of the screen is seeing all four at once.
  const expandKey = `state.sportsExpanded.${getStoredUserId() ?? 'anon'}`;
  const [expandedSports, setExpandedSports] = React.useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(expandKey); return new Set<string>(raw ? JSON.parse(raw) : []); } catch { return new Set<string>(); }
  });
  const toggleSport = (d: string) => setExpandedSports((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    try { localStorage.setItem(expandKey, JSON.stringify([...next])); } catch { /* private window / blocked storage */ }
    return next;
  });

  // The change-leading summary for a sport's collapsed line — wording via the pure `sport-summary`
  // helpers (confidence rule pinned there). Leads with what MOVED; the level lives in the detail.
  const summaryLifts = strengthFitness ? foldVariantSlots(strengthFitness.perLift.filter((l) => l.isPrimary && l.latestE1rm != null)) : [];
  // Returns the collapsed plate's lines — one string per line so the plate can stack them (all lifts;
  // easy + hard runs) instead of truncating one line (Michael 2026-09-01: "we should see all the numbers").
  const summaryLines = (disc: string): string[] => {
    if (disc === 'strength') {
      // ⛔ NOT PR-BASED (Michael 2026-09-01: the program is form / bar speed / slow gain under
      // cross-training stress). One line per lift; opening lists the working numbers, mid-block adds
      // the creep since the block opened. Flat is fine, no PR flag. See `strengthGlance`.
      const lines = strengthGlance(
        summaryLifts as Array<{ displayName: string; latestE1rm: number | null; series?: Array<{ value: number; week?: number }> }>,
        planWeek,
      );
      if (lines.length) return lines;
      return [(strengthFitness?.sessionsThisWeek ?? 0) > 0 ? `${strengthFitness!.sessionsThisWeek} sessions this week` : 'no lifts logged'];
    }
    if (disc === 'run') {
      // ⛔ EASY AND HARD ON THEIR OWN POOLS (Michael 2026-09-01: "show both easy and hard runs"). Each
      // group carries its OWN recent pace + HR (real recorded pace, never the index reconstruction);
      // no real pace for a group → its run count, never a fabricated number. Term is "hard", not
      // "quality" — plainer for this audience, and it pairs with "easy".
      const groups = runFitness?.efficiency?.groups;
      const lineFor = (g: string, label: string): string | null => {
        const grp = Array.isArray(groups) ? groups.find((x) => x.group === g) : undefined;
        if (!grp || (grp.runs ?? 0) === 0) return null;
        if (grp.recentPaceSecPerKm != null) {
          return `${label} ${formatPace(grp.recentPaceSecPerKm, useImperial)}${grp.recentHrAvg != null ? ` at ${grp.recentHrAvg} bpm` : ''}`;
        }
        return `${label} · ${grp.runs} run${grp.runs === 1 ? '' : 's'}`;
      };
      const lines = [lineFor('easy', 'easy'), lineFor('quality', 'hard')].filter((x): x is string => !!x);
      if (lines.length) return lines;
      // No grouped data yet — fall back to the top-level read.
      const ef = runFitness?.efficiency;
      if (!ef) return ['no runs logged'];
      const runVal = ef.recentPaceSecPerKm != null
        ? `${formatPace(ef.recentPaceSecPerKm, useImperial)}${ef.recentHrAvg != null ? ` at ${ef.recentHrAvg} bpm` : ''}`
        : null;
      return [efficiencySummary({ label: 'pace per heartbeat', value: runVal, verdict: ef.verdict, pctChange: ef.pctChange, sampleCount: ef.sampleCount, sinceMonth: '', noun: 'run' })];
    }
    if (disc === 'bike') {
      // THE REAL NUMBER LEADS (Michael 2026-09-01: "bike tells the user nothing"). Follow the server's
      // own lead: power leading → recent watts (single-source, from the power series, NOT a client FTP
      // resolve); otherwise the aerobic read is HR-at-easy-power, so show that bpm.
      const bf = bikeFitness;
      if (bf?.lead === 'power' && bf.power) {
        const p = bf.power;
        const recentW = p.recentValue ?? (Array.isArray(p.series) ? [...p.series].reverse().find((pt) => pt.recent)?.value ?? null : null);
        const powerVal = recentW != null ? `${Math.round(recentW)} W` : null;
        return [efficiencySummary({ label: 'power', value: powerVal, verdict: p.verdict, pctChange: p.pctChange, sampleCount: p.sampleCount, sinceMonth: changeMonth(asOf, p.windowDays), noun: 'ride' })];
      }
      const e = bf?.efficiency;
      if (!e) return ['no rides logged'];
      const effVal = e.recentValue != null ? `${e.recentValue} bpm at easy power` : null;
      return [efficiencySummary({ label: 'watts per heartbeat', value: effVal, verdict: e.verdict, pctChange: e.pctChange, sampleCount: e.sampleCount, sinceMonth: changeMonth(asOf, e.windowDays), noun: 'ride' })];
    }
    if (disc === 'swim') {
      const w = Math.round((swimVolume?.windowDays ?? 56) / 7);
      return [(swimVolume?.swims ?? 0) > 0 ? `${swimVolume!.swims} ${swimVolume!.swims === 1 ? 'swim' : 'swims'} in the last ${w}wk` : `no swims in the last ${w}wk`];
    }
    return [];
  };
  if (loading || cards.length === 0) return null;

  // The bike row shows the dual Power · Efficiency read when either has substance; otherwise it
  // falls through to the standard card (adherence).
  const bikeHasSubstance = !!bikeFitness && (bikeFitness.power.verdict !== 'needs_data' || bikeFitness.efficiency.verdict !== 'needs_data');

  // Strength shows the Volume · e1RM · sessions composite when volume trends or e1RM has a verdict;
  // else the adherence card. Volume gives the row a real verdict so it stops falling to the shrug.
  // ⚠️ THE PULL-UP PROGRESSION IS SUBSTANCE ON ITS OWN (Slice 6). An athlete who opted into it and
  // has logged chins — but no barbell lift with an e1RM yet, which is exactly the beginner the band
  // on-ramp exists for — would otherwise have the whole strength row hidden, and with it the only
  // number their goal produces. The spine sends `pullups` only when the goal is on, so this cannot
  // widen the row for anyone else.
  const strengthHasSubstance = !!strengthFitness && (strengthFitness.volume.verdict !== 'needs_data' || strengthFitness.e1rm != null || strengthFitness.sessionsThisWeek > 0 || !!strengthFitness.pullups);

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
  // ⛔ CARD ORDER — RANKED BY WHAT THE ATHLETE ACTUALLY DOES (2026-08-15, Michael: "can they auto
  // adjust to the most active activities?").
  //
  // It used to be a hardcoded list — strength, run, swim, bike — the same order for every athlete
  // forever, so a runner who barely lifts still opened State to strength. `cadenceCounts` (the
  // per-discipline 90-day session count) was ALREADY being fetched and destructured above and used
  // NOWHERE; its own definition in useStateTrends.ts calls it "the stable sort key". The engine was
  // built and starved. This feeds it.
  //
  // Three rules, in order:
  //   1. The PLAN'S primary discipline pins first. What you are training for outranks what you did
  //      most of — a marathon block's run row leads even in a week you only lifted.
  //   2. Everything else ranks by 90-day session count, descending. 90 days (not 7) so one big week
  //      or one missed week cannot reshuffle the screen; the order should describe a habit.
  //   3. SWIM IS ALWAYS LAST among the ranked rows, whatever its count — not a demotion by volume
  //      but by KIND: swim is described, never graded (see SwimVolumeRow — volume facts, no verdict,
  //      no dot). A row that carries no verdict does not belong above rows that do. It still pins
  //      first if it is the plan's own primary discipline, by rule 1.
  //
  // Below this, the existing active/resting split still drops anything dropped-and-inactive to a
  // dimmed group at the bottom — that is a different question (are you doing it at all) and it
  // still wins over this ranking.
  const TIEBREAK: Record<string, number> = { strength: 0, run: 1, bike: 2, swim: 9 };
  // Band first (0 = pinned primary, 1 = ranked, 2 = swim), then within-band. Bands are compared as
  // integers rather than ±Infinity sentinels — `Infinity - Infinity` is NaN, and a NaN comparator
  // makes Array.sort's result implementation-defined.
  const bandOf = (d: string) => (primaryDisc && d === primaryDisc ? 0 : d === 'swim' ? 2 : 1);
  /**
   * ⛔⛔ THE RUN CARD LEAVES THIS SECTION (FIXLIST 1b, 2026-09-01). Run's efficiency read belongs to
   * the endurance cards on the trends plate, and to nothing else.
   *
   * WHAT WAS ACTUALLY ON SCREEN, TRACED BEFORE CUTTING: the row Michael photographed
   * ("Efficiency Holding · over 6wk · 10 runs · 4d ago · as of Aug 28") was NOT <RunFitnessRow>.
   * `runSpineCovers` was already suppressing that, correctly. It was <DisciplineRow>, which labels
   * run's metric "Efficiency" (see its own comment, Q-110), prints the verdict word, and appends
   * `trendEvidence` + `asOf`. So the stand-down worked and a THINNER duplicate was drawing beneath it.
   *
   * ⛔ AND THE STAND-DOWN ITSELF HAD TO GO, not be rewired. `runSpineCovers` read
   * `stateDisplay.enduranceSpine` — one block deciding what to draw from another block's data. Round 3
   * (athlete-reorderable blocks) forbids exactly that: if the athlete can hide the trends plate, a run
   * row that stands down for it leaves them with NEITHER read. Removing the run card removes the gate
   * by removing its subject.
   *
   * ⚠️ NOTHING CURRENTLY ON SCREEN IS LOST, CHECKED ONE BY ONE IN THE STOOD-DOWN STATE:
   *  · the posture sentence renders inside <RunFitnessRow>'s efficiency ⓘ tap-down only (see the
   *    Q-179 note above that component) — <DisciplineRow> never reads `card.postureSentence`.
   *  · the fitness anchor is passed only to <RunFitnessRow>; <DisciplineRow> takes no anchor.
   *  · the dot/range branch in <DisciplineRow> cannot fire for run: `card.performance` comes from
   *    `perfByDisc.run` = `perfFromTrend(...)` (`_shared/state-trend/discipline.ts:86`), which carries
   *    verdict / pctChange / sampleCount / newestAgeDays / windowDays / stale / minSessions and NO
   *    `range` field at all.
   * So this is a pure duplicate removal, not content leaving the screen.
   *
   * ⚠️ THE COUNTS NEVER DISAGREED. "10 runs over 6wk" is the fitness verdict's pooled window;
   * "19 easy / 5 quality" is the spine's per-session-type population. Two questions, one word.
   */
  // ⛔ ONE OWNER PER SPORT (Round 3 pass 1). The moved content, read off the same display contract the
  // trends block and the LOAD section read — no new payload field. Each renders on its sport's plate
  // below, guarded by its OWN gate (EnduranceReadCards returns null with no rides; ViadaWeekCard with
  // no lifting), so the exact same cards appear as before, only relocated.
  const enduranceSessions = (stateDisplay as { namedSessions?: React.ComponentProps<typeof EnduranceReadCards>['sessions'] } | null | undefined)?.namedSessions ?? null;
  const enduranceSpine = (stateDisplay as { enduranceSpine?: React.ComponentProps<typeof EnduranceReadCards>['spine'] } | null | undefined)?.enduranceSpine ?? null;
  const viadaWeek = (stateDisplay as { viadaWeek?: React.ComponentProps<typeof ViadaWeekCard>['week'] } | null | undefined)?.viadaWeek ?? null;

  // ⛔ RUN RE-ENTERS THE COMPOSITION (Round 3 pass 2, 2026-09-01) — one owner per sport, run included.
  // It is kept OUT only when there is no run content, so a run-less athlete gets no empty run plate.
  // ⚠️ The run BRANCH below renders the run efficiency cards, NOT a DisciplineRow — the run
  // DisciplineRow ("Efficiency Holding · over 6wk…") was deleted as a duplicate in 1b and must not
  // come back; re-including run in `cards` is only so it earns a plate.
  const hasRunContent =
    (Array.isArray(enduranceSessions) && enduranceSessions.some((s: { sport?: string }) => s?.sport === 'run'))
    || (Array.isArray(enduranceSpine) && enduranceSpine.some((s: { sport?: string }) => s?.sport === 'run'));
  const sortedCards = [...cards].filter((c) => c.discipline !== 'run' || hasRunContent).sort((a, b) => {
    const band = bandOf(a.discipline) - bandOf(b.discipline);
    if (band !== 0) return band;
    const byCadence = (cadenceCounts?.[b.discipline] ?? 0) - (cadenceCounts?.[a.discipline] ?? 0);
    if (byCadence !== 0) return byCadence;
    return (TIEBREAK[a.discipline] ?? 5) - (TIEBREAK[b.discipline] ?? 5);
  });

  return (
    <div className="py-3">
      {/* Section clock label: PERFORMANCE is the SLOW clock. Per-row windows (8wk, steady runs,
          over 6wk, as-of dates) are receipts that inherit this and add specifics. */}
      {/* ⛔ THE "Fitness / trends over recent weeks" HEADING IS REMOVED (2026-09-01, cosmetic) — it
          stacked directly under StateTab's "trends · the arc behind this week", two headings for one
          section. StateTab's heading is the single one now. */}
      {/* NO aggregate roll-up (Michael 2026-07-04): a cross-discipline headline ("Building — bike up,
          run up") is a lossy, cherry-picking, clock-mismatched summary (run 6wk vs bike 8wk). Fitness
          is handed to the individual sport rows below — each owns its own verdict AND its own window. */}
      {(() => {
        // One card renderer, reused across the posture groups. showAxis labels the first row of a group
        // ("vs your baseline" for strength, "vs your 12-week range" for endurance).
        const renderCard = (card: DisciplineCard, showAxis: boolean) => {
          const inner = (() => {
            // ⛔ ONE OWNER PER SPORT (Round 3 pass 1). The BIKE plate now also holds the ride
            // efficiency cards (moved from the trends plate), so the bike lives in one place. The
            // cards carry their own render gate — no rides → EnduranceReadCards returns null — so the
            // bike plate looks exactly as before for an athlete with no rides.
            if (card.discipline === 'bike' && bikeHasSubstance) return (
              <>
                <BikeFitnessRow fitness={bikeFitness!} showAxis={showAxis} mode={fitnessMode.bike ?? 'trend_only'} anchor={fitnessAnchors.bike} />
                <EnduranceReadCards sessions={enduranceSessions} spine={enduranceSpine} sport="ride" />
              </>
            );
            // ⛔ RUN OWNS ITS PLATE (Round 3 pass 2) — the run efficiency cards, and ONLY those. No
            // DisciplineRow: the "Efficiency Holding" run row was a duplicate deleted in 1b. The cards'
            // own gate means a run-less plate never reaches here (hasRunContent filters it out above).
            if (card.discipline === 'run') return <EnduranceReadCards sessions={enduranceSessions} spine={enduranceSpine} sport="run" />;
            // Swim is DESCRIBED, not graded — volume facts, never a dot (see SwimVolumeRow).
            if (card.discipline === 'swim' && swimVolume) return <SwimVolumeRow vol={swimVolume} />;
            if (card.discipline === 'strength' && strengthHasSubstance) return (
              <>
                <StrengthFitnessRow fitness={strengthFitness!} fatigue={strengthFatigue} planWeek={planWeek} block={block} calibration={calibration} />
                {/* ⛔ STATE IS THE ACTOR (slice b): the reversible line lives here, under the row whose
                    ambient status already showed the state it is confirming. Performance echoes the
                    same component and routes to the same undo — one signal, two placements. */}
                <StrengthCalibrationNotice lifts={calibration.byLift} undo={calibration.undo} />
                {strengthDetail}
                {/* ⛔ ONE OWNER PER SPORT (Round 3 pass 1). The weekly lifting card (moved from the LOAD
                    section) lives under strength now — same subject, one place. Its own null gate means
                    no lifting → nothing drawn. `hasPlan` gates the coverage line inside it (a gap only
                    means something against a prescription). */}
                <ViadaWeekCard week={viadaWeek} hasPlan={hasActivePlan === true} />
              </>
            );
            // ⛔ THE RIDE CARDS AND THE LIFTING CARD ALSO RIDE ALONG WHEN THE FITNESS ROW HAS NO
            // SUBSTANCE — the fallback branch. A bike with rides but no established power/efficiency
            // verdict still owns its rides; strength with lifting but no e1RM trend still owns its
            // week. Each is gated by its own content, so nothing new appears.
            const row = <DisciplineRow card={card} restTrend={card.discipline === 'swim' ? swimRest : null} showAxis={showAxis} />;
            if (card.discipline === 'bike') return <>{row}<EnduranceReadCards sessions={enduranceSessions} spine={enduranceSpine} sport="ride" /></>;
            if (card.discipline === 'strength') return <>{row}{strengthDetail}<ViadaWeekCard week={viadaWeek} hasPlan={hasActivePlan === true} /></>;
            return row;
          })();
          // Each discipline's card wears its own READOUT PLATE keyed to its sport (2026-08-15,
          // shared recipe in src/lib/readout-plate.ts) — this is the one place on State where a
          // card belongs to exactly one discipline, so it is the one place the plate takes a
          // colour. Everything multi-sport above and below sits on the neutral plate in StateTab.
          // ⛔ COLLAPSED BY DEFAULT — the sport's change-leading one-liner; tap the header to expand
          // into `inner` (the full detail). All four sports fit one screen this way.
          const Icon = DISCIPLINE_ICON[card.discipline];
          const open = expandedSports.has(card.discipline);
          return (
            <div key={card.discipline} className="galaxy-card readout-texture rounded-2xl px-3 mb-2" style={readoutPlateStyle(getDisciplineColorRgb(card.discipline), { galaxy: true })}>
              <button type="button" onClick={() => toggleSport(card.discipline)} className="w-full flex items-center gap-3 py-2.5 text-left" aria-expanded={open} aria-label={`${card.discipline} details`}>
                <span className="flex items-center gap-2 shrink-0 text-[13.5px] font-semibold tracking-[0.12em] uppercase text-white/85">
                  {Icon && <Icon size={16} strokeWidth={2.25} style={{ color: getDisciplineColor(card.discipline) }} className="shrink-0" />}
                  {card.discipline}
                </span>
                <span className="flex-1 min-w-0 flex flex-col items-end gap-0.5 text-[12px] text-white/60">
                  {summaryLines(card.discipline).map((line, i) => (
                    <span key={i} className="text-right leading-tight">{line}</span>
                  ))}
                </span>
                <span className="text-white/45 text-[11px] shrink-0 self-center">{open ? '▾' : '▸'}</span>
              </button>
              {open && <div className="pb-1">{inner}</div>}
            </div>
          );
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
        // ⛔ THE AXIS GRAMMAR GOES ON THE FIRST CARD THAT CONSUMES IT (Round 3 pass 2). Only the dot
        // rows — bike (FitnessDotBlock) and swim (DisciplineRow) — render the "weaker / range /
        // stronger" axis; strength and run ignore `showAxis`. The old rule was positional
        // (idx 0, or idx 1 after strength), which broke when run re-entered at position 1 and pushed
        // bike to index 2 — bike would silently lose its axis label. Targeting the first axis-CONSUMER
        // instead keeps bike's axis wherever run sorts, and reproduces the old result exactly for the
        // pre-run cases (bike was that first consumer; swim only when there is no bike).
        // ⚠️ FROM `active` ONLY, and resting cards keep `false` exactly as before — a dimmed card
        // never carried the axis, and that does not change here.
        const firstAxisDisc = active.find((c) => c.discipline === 'bike' || c.discipline === 'swim')?.discipline;
        return (
          <>
            {active.map((card) => renderCard(card, card.discipline === firstAxisDisc))}
            {resting.length > 0 && (
              <div className="opacity-45 mt-1">
                {resting.map((card) => renderCard(card, false))}
              </div>
            )}
          </>
        );
      })()}
      {/* defensive: if there's no strength trend card at all, still surface the per-lift detail —
          on the strength plate, since the detail is single-discipline content */}
      {strengthDetail && !cards.some((c) => c.discipline === 'strength') && (
        <div className="galaxy-card readout-texture rounded-2xl px-3 mb-2" style={readoutPlateStyle(getDisciplineColorRgb('strength'), { galaxy: true })}>
          {strengthDetail}
        </div>
      )}
    </div>
  );
}
