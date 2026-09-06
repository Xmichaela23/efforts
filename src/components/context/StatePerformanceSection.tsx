// STATE PERFORMANCE section — the trend rows (RUN / BIKE / STRENGTH / SWIM) and their open cards.
// Styling mirrors StateTab's Row/Chip convention (replicated locally to avoid touching StateTab internals).
//
// ⛔ EVERY NUMBER ON THIS SCREEN HAS A NAMED SOURCE. Before changing any value, window, formula or
// threshold here, read docs/STATE-NUMBERS.md (plain English) and docs/STATE-SOURCES.md (code-level) —
// each number is TrainingPeaks / WKO5 / Garmin / Friel / Viada or explicitly OURS with a ledger row.
// CLAUDE.md rule 5: no number reaches this screen without a source. Change the ledger row first.
//
// LIVE on main + server as of 2026-09-04 (the earlier "not yet shipped / provisional" banner was stale).

import { trustedMaxReps } from '@/lib/estimate-1rm';
import React from 'react';
import type { DisciplineCard, TrendVerdict, BikeFitness, BikeSignal, PerfSummary, DecouplingBand, StrengthFitness, StateDisplayV1, SwimVolume, FitnessMode, FitnessAnchor } from '@shared/state-trend';
import type { CoachWeekContextV1 } from '@/hooks/useCoachWeekContext';
import { useStateTrends } from '@/hooks/useStateTrends';
import { useAppContext } from '@/contexts/AppContext';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';
import { trendReceipt, trendEvidence, trendHeadline, type Discipline } from '@/lib/trend-receipt';
import { foldVariantSlots } from '@/lib/fold-lift-slots';
import { formatPace } from '@/utils/workoutFormatting';
import { getDisciplineColor } from '@/lib/context-utils';
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
import { EnduranceReadCards, fmtEff } from '@/components/context/StrengthReadCards';
import ViadaWeekCard from '@/components/context/ViadaWeekCard';
import EnduranceCheckpointSheet from '@/components/context/EnduranceCheckpointSheet';
import LoadWeeksCard from '@/components/context/LoadWeeksCard';
// ⛔ COLLAPSE TO ONE LINE PER SPORT (Round 3, 2026-09-01) — each sport shows a change-leading summary
// and expands on tap. The summary wording is a set of pure functions so the confidence rule is pinned.
import { fmtDayShort, latestPoint, strengthGlanceRows, type SportRow , fitTrend} from '@/lib/sport-summary';
import { supabase, getStoredUserId } from '@/lib/supabase';
import TrendSparkline from '@/components/context/TrendSparkline';
import { liftStatusLine } from '@/lib/strength-calibration-copy';
import { Activity, Bike, Waves, Dumbbell, type LucideIcon } from 'lucide-react';

const VERDICT: Record<TrendVerdict, { word: string; cls: string; arr: string }> = {
  improving: { word: 'up', cls: 'text-emerald-400', arr: '' },
  holding: { word: '', cls: 'text-white/70', arr: '' }, // ⛔ NO WORD, NO ARROW (2026-09-01): "holding" meant both genuinely-flat AND too-noisy-to-call (Q-289). When the verdict can't call a direction, the row shows the number + count and stops.
  sliding: { word: 'down', cls: 'text-amber-300', arr: '' }, // ⛔ "easing off" told the athlete they CHOSE to ease off when the number simply dropped — interpretive and flattering (2026-09-01). State the measurement: down.
  needs_data: { word: 'needs data', cls: 'text-white/60', arr: '' },
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
// `NUMERIC` (the bike dot's wordless verdict map) was deleted with the bike dot, 2026-09-04.

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

// "newest today" / "newest 3d ago" — the ONE fact a count-and-window line cannot carry: whether the
// ride you just finished is in there yet. Distinct from `asOf()`, which prints a calendar date.
// Q-255: verdict words for the bike load floor. Bands are Friel/intervals.icu's (see the server
// module `state-trend/load-floor.ts` for sources); these are just their on-screen words.
// ⛔ LOAD_FRESHNESS_WORDS removed (2026-09-01) — its only consumer was the bike CTL/TSB line, now gone.


function recencyOf(ageDays: number | null | undefined): string | null {
  if (ageDays == null || ageDays < 0) return null;
  return ageDays <= 0 ? 'newest today' : `newest ${Math.round(ageDays)}d ago`;
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

// ⛔ THE AEROBIC READ'S HEART-RATE WORDS AND ITS SIGNAL ARE DELETED (2026-09-03, Michael: "lose the
// heart rate sentence, keep it strict to the book").
//
// WHAT WAS HERE: `BIKE_AEROBIC_WORDS` ("Easier at the same power" / "Harder at the same power") and
// `AerobicSignal`, which led the bike card with "130 bpm at easy power" for a rider whose riding
// carries no threshold effort to price an FTP from.
//
// WHY IT IS GONE: the book gives the bike no heart-rate read at all. p172 states power is the method
// for controlling cycling intensity and FTP is the number every ride prescription is a percentage of;
// the 5% drift line (p107) is written for steady running. A bpm at easy power is also the weaker half
// of a number the card already prints — 130 bpm at 90 W and at 150 W read the same, where efficiency
// factor (watts per heartbeat, on the rides card below) carries both.
//
// ⚠️ THE THREE-STATE ROW SURVIVES, MINUS ITS HEADLINE NUMBER. The aerobic state still exists on the
// server and still NAMES ITS REASON ("No hard efforts yet, so there is no threshold read") — that was
// always the point of the state, and it is untouched. What it no longer does is assert a heart-rate
// number as the bike's read.
// One labelled signal ("Power: improving +2%") for the bike dual read.
function Signal({ label, sig }: { label: string; sig: BikeSignal }) {
  // 2026-09-04: the label only — the 28/28 verdict arrow and percent are off State (one reference per metric).
  void sig;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-white/50">{label}</span>
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
function BikeFitnessRow({ fitness, mode, anchor, fallbackFtp = null }: { fitness: BikeFitness; mode: FitnessMode; anchor?: FitnessAnchor; fallbackFtp?: number | null }) {
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
  // ⛔ 2026-09-03: THE RESOLVE MOVED UP to the section (`useBikeFallbackFtp`) and arrives as a prop.
  // The collapsed bike row prints FTP too now, and two independent resolves could print two numbers
  // for one fact — the exact fracture the FTP work exists to close. One resolve, both surfaces.

  // ⛔ NO SECOND-LEVEL TAPS ON THIS SCREEN (Michael 2026-09-03: one click). The power ⓘ, the
  // "more" receipt and the label ⓘ are all printed open now; see StrengthReadCards.SpineCard.
  // ⛔ SAME RULE AS THE RUN ROW (2026-08-01, Michael): the headline and ONE receipt line stay
  // visible; everything else goes behind "more". The CONTENTS differ because the rows have
  // different material — run's detail is a read (plan context, trend, pace), bike's is extra
  // provenance (FTP basis, as-of, anchor label, the power-trend note). Same rule, not same items.
  // ⚠️ Bike keeps NO words and NO range — it still has no confidence interval (D-356).
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
    : lead.verdict !== 'needs_data';
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
  // ⛔ FTP OVER TIME, NOT A DOT (2026-09-04, docs/SPEC-ftp-trend-line-2026-09-04.md). The dot placed
  // best-20-min power in its own 12-week min/max under a label that read "167 W threshold" — marker and
  // number disagreed, and "position in your own range" had no field source. TrainingPeaks' FTP view is a
  // threshold-history line (track previous thresholds; WKO5 sFTP history), the same shape as the
  // efficiency and drift charts. `ftpHistory` is every stored FTP reading in the window, from the server.
  const ftpHistory = (Array.isArray(fitness.ftpHistory) ? fitness.ftpHistory : []).filter((p) => p?.date && Number.isFinite(p.value));
  const anchored = mode === 'anchored';
  // SLICE 1: a dot only when ANCHORED — bike is anchored only once the athlete ACCEPTS its FTP estimate
  // (basis flips to 'personal'). On est(FTP) it's TREND-ONLY: the arrow + "no baseline set · accept your
  // FTP", never a dot on an estimate the athlete never confirmed.
  // Traced from `learn-fitness-profile` (STEP 4): tier 1 is best 20-min power × 0.95, gated on
  // hard efforts and 20–120 min rides. Coggan's field protocol — the same arithmetic as a 20-minute
  // test, taken from 20 minutes the athlete already rode hard rather than asking them to test.
  // 2026-09-04: the estimate is the power-duration fit (TrainerRoad / intervals.icu), not 95% of a best 20.
  // The FTP line and the "accept your FTP" tag belong to a REAL read; a withheld or absent one gets neither.
  const anchoredPower = anchored && assertsLead && leadIsPower;
  // ⚠️ NO LINE THROUGH ONE DOT: fewer than two readings prints the number alone.
  const showFtpLine = anchoredPower && ftpHistory.length >= 2;
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
            {/* 2026-09-03 (Michael: "bike is the missing stepchild"): no sentence here — the count and the
                recency above are the facts; the power read appears when it exists. */}
          </span>
        ) : (
        <span className="inline-flex items-baseline gap-1.5 flex-wrap text-white/60">
          <span className="text-white/85">{rideCount === 0 ? 'No rides yet' : `${rideCount} ${rideCount === 1 ? 'ride' : 'rides'} in 8 weeks`}</span>
          {buildingRecency && <span className="text-white/45">{buildingRecency}</span>}
          <span className="basis-full">{rideCount === 0 ? 'Ride and this reads your aerobic fitness' : 'A few more and this reads your aerobic fitness'}</span>
        </span>
        )
      ) : aerobicLead ? (
        // ⛔ NO HEADLINE NUMBER ON THE AEROBIC READ (2026-09-03) — see the deleted AerobicSignal above.
        // The reason line below says why there is no threshold read, the FTP on record prints under it,
        // and the rides card carries efficiency factor. Nothing here asserts a heart rate.
        null
      ) : anchoredPower ? (
        // The headline names the NUMBER, not the metric's category: "212 W threshold" is what a rider
        // wants off a glance, and it is `anchor.value` — the same FTP the verdict was computed against
        // (D-358), never a second client-side resolve.
        <>
          {/* Each chart on this card carries a title and a one-line key (Michael, 2026-09-04: "I don't know
              what each line is"). Solid = the readings, dashed = the fitted trend, right-hand number = low to
              high in the window. The receipts under the chart belong to the FTP estimate. */}
          {!showFtpLine && <span className="basis-full text-white/80 text-[13px] mt-1">{ftpNow != null ? `FTP · ${ftpNow} W` : 'FTP'}</span>}
          {/* FTP over time — one dot per stored reading, the same fitted trendline (WKO5 least squares) and
              "start → end" caption the efficiency and drift charts use. TrainingPeaks threshold history. */}
          {showFtpLine && (
            <TrendSparkline
              series={ftpHistory.map((p) => ({ date: p.date, value: p.value, recent: true }))}
              color={getDisciplineColor('bike')}
              dotNoun="FTP reading"
              fmtVal={(v) => String(Math.round(v))}
              unit=" W"
              minSpanFraction={0.15}
              trendline
              trendWord="FTP"
              buildingLabel={(w) => `${w} of 12 weeks`}
              label="FTP" headline={`${ftpNow ?? '—'} W`} qualifier={(() => { const d = String(anchor?.label ?? '').split(' · ').pop(); return d && /\w/.test(d) && d !== anchor?.label ? `estimated ${d}` : undefined; })()}
              provenance={tail ? tail.replace(/^last \d+ weeks · /, '') : null}
              keyLine={`dots: each FTP estimate · dashed: the trend${src === 'est (FTP)' ? ' · moves only when you accept a number' : ''}`}
            />
          )}
          {/* ⛔ THE ⓘ DEFINES THE METRIC AND STOPS (2026-08-01, Michael: "anything specific to where the
              user is needs to go to more; ⓘ simply shows what the metric is").
              ⚠️ THE FTP METHOD LINE IS CONDITIONAL, and it has to be. "Estimated from your hard rides"
              is false for an athlete who tested and entered their own FTP — appending it
              unconditionally would tell a confirmed rider their number was guessed. Only when the
              basis IS the estimate (`src === 'est (FTP)'`, from `efficiency.basis === 'coggan_ftp'`).
              It passes the ⓘ test (D-357): it describes HOW THE METRIC IS MADE, true for anyone,
              not where this athlete sits. */}
          {src === 'est (FTP)' && !showFtpLine && (
            <span className="basis-full text-[12px] text-white/45 leading-snug">Estimated from your rides. It moves only when you accept a new number.</span>
          )}
        </>
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
          <span className="basis-full text-left text-white/45 text-[12px]">No hard efforts yet, so there is no threshold read</span>
          <p className="basis-full text-[12px] text-white/45 leading-snug mt-1 max-w-[min(100%,340px)]">
            {/* 2026-09-03: the heart-rate clause is cut — the bike is read on power (p172), and the
                book's two FTP tests are the 20-minute effort × 0.95 and the ramp (pp.212–213). */}
            A threshold, sweet-spot, tempo or climbing ride records a 20-minute power max, and that is what an FTP read is built from. Easy rides carry no max to read.
          </p>
        </>
      ) : (
        <span className="basis-full text-white/45 text-[12px]">Not enough hard rides yet for a threshold read</span>
      ))}
      {/* ⛔ "Your heart rate at the same power, from N easy rides" DELETED (2026-09-03, Michael:
          "lose the heart rate sentence, keep it strict to the book"). It described a read the card no
          longer makes. The ride count it carried is not lost — the rides card states its own. */}
      {/* The receipt: window · rides · recency. The provenance lines below it print open (one tap). */}
      {!showFtpLine && (tail || src || asOf(lead.newestAgeDays) || (anchoredPower && anchor?.label)) && (
        <span className="basis-full flex items-baseline justify-between gap-2 text-white/55 text-[12px]">
          <span>{tail}</span>
        </span>
      )}
      {/* ⚠️ THE EMPTY STATE STAYS VISIBLE. "no baseline set · accept your FTP to anchor" names an
          upgrade path the athlete can act on — hiding an actionable gap behind a tap is how a missing
          dot starts reading as a bug. */}
      {trendOnly && <NoBaselineTag hint={src === 'est (FTP)' ? 'accept your FTP to anchor' : undefined} />}
      {/* WHERE THE NUMBER COMES FROM — basis, freshness, anchor. True and worth having, but three lines
          of provenance stacked under a one-line verdict buried the verdict. */}
      {(
        <span className="basis-full flex flex-col gap-0.5 mt-0.5 text-[12px] text-white/45">
          {/* "The dot is where this number sits in your last 12 weeks" is gone with the dot (2026-09-04). */}
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
          {/* ⛔ THE FTP LINE IS GONE FROM THE OPEN CARD (2026-09-03, WORKORDER-bike-state-audit §5.1).
              The collapsed bike row prints `FTP 168 W · estimated` and stays on screen when the card
              opens, so this line put the same fact twice, two lines apart. The row is the ruled place
              for it (FTP leads the rider's numbers, checked against the field 2026-09-03); the row and
              the verdict share one resolve (`ftpNow` / `bikeAnchorValue`), so nothing here is lost.
              ⚠️ The provenance it carried — the per-ride power band is `bike_fitness_v1.band_source`,
              computed at analysis time from whatever FTP resolved then, and is not verified equal to
              the FTP on record — is still true and still an open question, not a copy fix. */}
          {anchoredPower && !showFtpLine && anchor?.label && <span>{anchor.label}</span>}
        </span>
      )}
      {/* THE LONG VIEW — 12-week power sparkline (the cyclist's e1RM/efficiency analog, 2026-07-23). Only when
          power LEADS with a REAL w20 verdict — `lead: 'none'` (building) used to slip through here and put a
          sinking per-ride-effort line under "load holding", which read as fitness falling (Michael, 2026-08-13). */}
      {/* ⚠️ THE POWER CHART STAYS — it is watts, not efficiency, and nothing else on the screen shows
          it. Only the efficiency picture was duplicated by the rides card, and the bike row never
          drew one: its charts are power and load. */}
      {!building && leadIsPower && (
        <>
          {/* Titled (Michael, 2026-09-04): with the FTP line above it, an untitled second power chart read as
              a second FTP. This is TrainingPeaks' Peak Power (20 min) chart — display only; nothing reads it. */}
          <TrendSparkline
            series={fitness.power.series}
            color={getDisciplineColor('bike')}
            dotNoun="ride"
            fmtVal={(v) => String(Math.round(v))}
            unit=" W"
            minSpanFraction={0.15}
            divider
            label="Best 20-minute power"
            buildingLabel={(w) => `${w} of 12 weeks`}
            keyLine="dots: one ride's best 20 minutes · does not set FTP"
          />
        </>
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
  explain?: string; // when set, this plain-language definition prints under the row (no tap — one level only)
}) {
  // ⛔ NO VERDICT WORD, ARROW OR PERCENT (2026-09-04, one reference per metric): the 28/28 verdict was Garmin's
  // rule on TrainingPeaks numbers and is off every State surface. The label and the dot (position in the
  // 12-week range) stay; `verdict` / `pctChange` / `wordMap` are accepted and not rendered.
  void wordMap; void pctChange;
  return (
    <>
      <span className="basis-full flex items-baseline justify-between gap-2">
        <span className="text-white/55 text-[13px]">{label}</span>
        {false && verdict !== 'needs_data' && (
          // ⛔ `withheld` PRINTS NO NUMBER. "Too few to read −0.4%" reads as a result with a caveat
          // attached, and the number is the part people take away — so the row would say the opposite
          // of what the engine decided. Withheld means we are not making a claim; the percent IS the
          // claim. (Only the bike lead passes `pctChange` here today — the card caller at :1035 omits
          // it — so this changes the bike row and nothing else.)
          <span className={`inline-flex items-baseline gap-0.5 text-[13px] ${v.cls}`}>{v.arr && <span>{v.arr}</span>}{v.word && <span>{v.word}</span>}{pctChange != null && <span className="text-white/60 ml-0.5">{verdictSignedPct(verdict, pctChange)}</span>}</span>
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
      {explain && (
        <p className="basis-full text-[12px] text-white/45 leading-snug mt-1 max-w-[min(100%,340px)]">{explain}</p>
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

/**
 * ⛔ <RunFitnessRow> IS DELETED (2026-09-02, Michael: "I don't want to do things different, use
 * different metrics — I want to be the same [as TrainingPeaks]"). It had been unrendered since Round 3
 * pass 2 (the run plate is <EnduranceReadCards>), and it was the only place the run efficiency
 * VERDICT, its percent, the confidence range, the fitted-line receipt and the "heat costs you" line
 * reached a screen. TrainingPeaks draws none of those: Efficiency Factor per run, decoupling per
 * run, a chart, compare like sessions by eye. The server still computes the verdict
 * (`runFitness.efficiency.verdict`); nothing on the client reads it now. Bike row untouched this pass.
 */

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
            <FitnessDotBlock label={metricLabel ? metricLabel.toLowerCase() : card.discipline} range={range} verdict={card.headlineVerdict} showAxis={showAxis} />
            {evidence && <span className="basis-full text-white/55 text-[12px]">{evidence}</span>}
          </>
        ) : (
          <>
            {metricLabel && <span className="text-white/50 text-[13px]">{metricLabel}</span>}
            {/* 2026-09-04: the evidence count only — no verdict word, arrow or percent (the 28/28 rule is off State) */}
            {hasEvidence && <span className={`text-[13px] ${vCls}`}>{evidence}</span>}
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
  const { useImperial, loadUserBaselines } = useAppContext(); // for the collapsed run pace-at-HR glance
  // ⛔ ONE FTP RESOLVE FOR THE WHOLE SECTION (2026-09-03). The collapsed bike row and the open bike
  // card both print the FTP on record; resolving it twice could print two numbers for one fact.
  // Server anchor first (`fitnessAnchors.bike`), this only fills the gap until the next ingest.
  const bikeAnchorValue = fitnessAnchors?.bike?.value ?? null;
  const [fallbackFtp, setFallbackFtp] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (bikeAnchorValue != null) return;            // server already told us; don't ask twice
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      const r = resolveCurrentFtp({ learned_fitness: b.learned_fitness, performance_numbers: b.performanceNumbers });
      if (r?.value != null) setFallbackFtp(Math.round(r.value));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [bikeAnchorValue, loadUserBaselines]);

  // ⛔ ATHLETE-SET ROW ORDER (2026-09-05, Michael: "can we make it so the user can move these by their own
  // priority?"). Precedent: Garmin Connect's reorderable cards, TrainingPeaks' reorderable dashboard charts.
  // Saved to `user_baselines.ui_prefs.state_row_order` (migration 20260905060000, applied by hand like every
  // other) and mirrored on the device so it holds before the column exists. Absent = the goal-led default order.
  const ROW_ORDER_KEY = 'efforts:state_row_order';
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(() => {
    try { const v = JSON.parse(localStorage.getItem(ROW_ORDER_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; }
  });
  const uiPrefsRef = React.useRef<Record<string, unknown>>({});
  const [reordering, setReordering] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      const prefs = (b.ui_prefs && typeof b.ui_prefs === 'object') ? (b.ui_prefs as Record<string, unknown>) : {};
      uiPrefsRef.current = prefs;
      const o = (prefs as any).state_row_order;
      if (Array.isArray(o) && o.length > 0) { setRowOrder(o); try { localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(o)); } catch { /* device copy only */ } }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadUserBaselines]);
  const saveRowOrder = React.useCallback((next: string[]) => {
    setRowOrder(next);
    try { localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(next)); } catch { /* device copy only */ }
    const uid = getStoredUserId();
    if (!uid) return;
    const prefs = { ...uiPrefsRef.current, state_row_order: next };
    uiPrefsRef.current = prefs;
    void supabase.from('user_baselines').update({ ui_prefs: prefs }).eq('user_id', uid).then(({ error }) => {
      if (error) console.warn('[State] row order kept on this device only (ui_prefs not on the account yet):', error.message);
    });
  }, []);
  // ⛔ SLICE b — ONE READ, and it must sit ABOVE the early return or the hook order changes between
  // renders. It self-silences on any plan that is not a strength block (`not_a_strength_block`), so
  // calling it unconditionally costs one function invoke and buys a stable hook list.
  const calibration = useStrengthCalibration(true);

  // ⛔ COLLAPSE TO ONE LINE PER SPORT (Round 3, 2026-09-01). Default collapsed — the four sports fit
  // one screen; tap a sport to expand into its detail. Which are open is remembered per athlete in
  // localStorage (a per-viewer convenience; wrapped in try/catch for private mode). ⚠️ NOT tabs — the
  // point of the screen is seeing all four at once.
  const expandKey = `state.sportsExpanded.${getStoredUserId() ?? 'anon'}`;
  // 2026-09-03 (Michael: "when you leave and come back, what was opened should close"): open state lives for the
  // visit only — nothing is remembered between visits.
  const [expandedSports, setExpandedSports] = React.useState<Set<string>>(() => new Set<string>());
  const toggleSport = (d: string) => setExpandedSports((prev) => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    void expandKey; // no longer persisted
    return next;
  });

  // The change-leading summary for a sport's collapsed line — wording via the pure `sport-summary`
  // helpers (confidence rule pinned there). Leads with what MOVED; the level lives in the detail.
  const summaryLifts = strengthFitness ? foldVariantSlots(strengthFitness.perLift.filter((l) => l.isPrimary && l.latestE1rm != null)) : [];
  // ⛔ THE COLLAPSED SPORT ROW — ONE GRAMMAR FOR ALL FOUR SPORTS (2026-09-03, DESIGN_GUIDELINES
  // "Layout Rules" §1). Every sport returns the same three slots — name · value · note — so the
  // renderer aligns names down one column and numbers down another (rule 2) and sizes the number
  // above its label (rule 3). The WORDING rules are unchanged and still pinned in the pure
  // `sport-summary` helpers; only the packaging moved.
  // ⚠️ STILL ONE ROW PER THING, NOT A TRUNCATED LINE (Michael 2026-09-01: "we should see all the
  // numbers") — every lift, easy AND hard runs. The list gained columns, it did not get shorter.
  const summaryRows = (disc: string): SportRow[] => {
    if (disc === 'strength') {
      // ⛔ NOT PR-BASED (Michael 2026-09-01: the program is form / bar speed / slow gain under
      // cross-training stress). One row per lift; opening lists the working numbers, mid-block puts
      // the creep since the block opened in the note. Flat is fine, no PR flag.
      const rows = strengthGlanceRows(
        summaryLifts as Array<{ displayName: string; latestE1rm: number | null; series?: Array<{ value: number; week?: number }> }>,
        planWeek,
      );
      // 2026-09-04 (Michael: "strength needs e1RM"): the run and bike rows say what their number is
      // ("last 5 runs", "estimated"); the lift rows printed a bare number. It is the estimated one-rep
      // max from the last logged set — not a tested max — so the note says so, with the creep beside it.
      if (rows.length) return rows.map((r) => ({ ...r, note: r.note ? `e1RM · ${r.note}` : 'e1RM' }));
      const n = strengthFitness?.sessionsThisWeek ?? 0;
      return [n > 0 ? { name: 'sessions', value: String(n), note: 'this week' } : { name: 'lifts', value: 'none logged' }];
    }
    if (disc === 'run') {
      // ⛔ EASY AND HARD ON THEIR OWN POOLS (Michael 2026-09-01: "show both easy and hard runs"). Each
      // group carries its OWN recent pace + HR (real recorded pace, never the index reconstruction);
      // no real pace for a group → its run count, never a fabricated number. Term is "hard", not
      // "quality" — plainer for this audience, and it pairs with "easy".
      const groups = runFitness?.efficiency?.groups;
      const rowFor = (g: string, label: string): SportRow | null => {
        const grp = Array.isArray(groups) ? groups.find((x) => x.group === g) : undefined;
        if (!grp || (grp.runs ?? 0) === 0) return null;
        if (grp.recentPaceSecPerKm != null) {
          // 2026-09-04: the warm-up stand-in (easy rows read off the warm-ups of hard runs) was OURS and is gone —
          // an easy row is easy runs, a hard row is hard runs, recorded pace and heart rate, nothing borrowed.
          return { name: label, value: formatPace(grp.recentPaceSecPerKm, useImperial), note: [grp.recentHrAvg != null ? `${grp.recentHrAvg} bpm` : '', grp.paceIsGraded === false ? 'flat pace, no elevation' : ''].filter(Boolean).join(' · ') || undefined };
        }
        return { name: label, value: `${grp.runs} run${grp.runs === 1 ? '' : 's'}` };
      };
      const rows = [rowFor('easy', 'easy'), rowFor('quality', 'hard')].filter((x): x is SportRow => !!x);
      // ⛔ AEROBIC EFFICIENCY IS THE TOP NUMBER, TRAININGPEAKS' WAY AND NOTHING ELSE'S (Michael 2026-09-04:
      // one absolute reference per metric, never "the formula is TrainingPeaks and the window is Garmin's").
      // FIELD — TrainingPeaks: Efficiency Factor is a PER-WORKOUT number, printed in the workout summary
      // (graded pace ÷ average heart rate); the dashboard trends it as one dot per workout over the date
      // range. So the row prints the LAST steady run's EF and says which run. No 28-day average (Garmin's
      // window) and no ↑→↓ arrow (Garmin's three states) — both were the other product's rule on this
      // product's number. The chart on the open card is the trend; TrainingPeaks' instruction is to read
      // the line, not one run against the last.
      const aero = ((stateDisplay as { enduranceSpine?: Array<{ sport?: string; group?: string; points?: Array<{ date?: string; efficiency?: number | null }> }> } | null | undefined)?.enduranceSpine)
        ?.find((s) => s?.sport === 'run' && s?.group === 'aerobic');
      const aeroPts = (aero?.points ?? []).filter((p): p is { date: string; efficiency: number } => p?.efficiency != null && !!p?.date).map((p) => ({ date: p.date, value: p.efficiency }));
      // The row reads the TREND LINE (WKO5's fitted line), start → end, never one run (2026-09-04, Michael).
      const aeroFit = fitTrend(aeroPts);
      const aeroLast = latestPoint(aeroPts);
      if (aeroFit != null) {
        rows.unshift({
          name: 'aerobic efficiency',
          value: fmtEff(aeroFit.end, false),
          note: `${aeroFit.weeks}-week trend · from ${fmtEff(aeroFit.start, false)}`,
        });
      } else if (aeroLast != null) {
        rows.unshift({ name: 'aerobic efficiency', value: fmtEff(aeroLast.value, false), note: `${fmtDayShort(aeroLast.date)} run · too few for a trend` });
      }
      // ⛔ THE WEEK'S RUN POINTS AGAINST THE ATHLETE'S TYPICAL (Michael 2026-09-02: run load scored Strava's
      // way). Read off the display contract — `loadByDiscipline.run = { week, typical }` from compute-snapshot
      // (`workload_by_discipline` / `workload_by_discipline_typical`). Absent on rows from before it shipped.
      // 2026-09-03: the third line ("N run points this week · usual M") is gone — the workload chart directly
      // below says the same thing once, under the one name (Workload) the Performance screen uses.
      if (rows.length) return rows;
      // No grouped data yet — fall back to the top-level read.
      const ef = runFitness?.efficiency;
      if (!ef) return [{ name: 'runs', value: 'none logged' }];
      // No verdict word here either (2026-09-02, same ruling): the number and the count, nothing graded.
      if (ef.recentPaceSecPerKm != null) {
        return [{ name: 'pace', value: formatPace(ef.recentPaceSecPerKm, useImperial), note: ef.recentHrAvg != null ? `${ef.recentHrAvg} bpm` : undefined }];
      }
      const n = Number(ef.sampleCount) || 0;
      return [{ name: 'runs', value: String(n) }];
    }
    if (disc === 'bike') {
      // ⛔ THE BIKE READS ON POWER, NOT HEART RATE (Michael 2026-09-03; the book, p172: power is the
      // method for controlling cycling intensity and FTP is the number every ride prescription is a
      // percentage of — it gives the bike no heart-rate read at all).
      //
      // ⛔ WHAT THIS REPLACED, AND WHY IT WAS THE WEAKER NUMBER. The row led with "heart rate at easy
      // power · 130 bpm": what the heart did, with no mention of how much power produced it. 130 bpm at
      // 90 W and 130 bpm at 150 W printed the same line. Efficiency factor carries BOTH — it IS watts
      // per heartbeat — so the number the row led with was the weaker half of one it already had.
      //
      // ⚠️ SAME GRAMMAR AS THE RUN ROW: the read leads (efficiency factor, mirroring aerobic
      // efficiency), the threshold number sits under it (FTP, mirroring the pace lines). Two rows, and
      // both are facts — no verdict word, per the 2026-09-02 ruling.
      const bf = bikeFitness;
      const rows: SportRow[] = [];
      // ⛔ ONE NUMBER, TWO SURFACES. The headline is the SAME number the open rides card prints — the last
      // steady ride's efficiency factor (TrainingPeaks: EF is per workout) — so the plate and the row
      // cannot disagree. Steady rides only: the same `countsTowardTrend` filter the open card applies.
      const rideSpine = ((stateDisplay as { enduranceSpine?: Array<{ sport?: string; group?: string; points?: Array<{ date?: string; efficiency?: number | null; countsTowardTrend?: boolean }> }> } | null | undefined)?.enduranceSpine)
        ?.find((s) => s?.sport === 'ride');
      const efPts = (rideSpine?.points ?? []).filter((p): p is { date: string; efficiency: number; countsTowardTrend?: boolean } => p?.countsTowardTrend !== false && p?.efficiency != null && !!p?.date).map((p) => ({ date: p.date, value: p.efficiency }));
      const efLast = latestPoint(efPts);
      // ⛔ FTP LEADS, EFFICIENCY FACTOR FOLLOWS (2026-09-03, checked against the field, not recalled).
      // The rider's first number is FTP and their second is watts per kilo; efficiency factor barely
      // appears in mainstream cycling apps — it is a coach's metric (TrainerRoad's W/kg material,
      // Roadman's FTP benchmarks). The first cut of this row put efficiency factor on top to MIRROR
      // THE RUN ROW, which is our internal consistency, not the rider's priority. ⚠️ Watts per kilo is
      // not offered: no athlete body weight is stored anywhere in the app.
      // ⚠️ "estimated" is not decoration — it is the line that says the number is worth testing, and
      // the book gives two tests we can send (20 min × 0.95, or the ramp; pp.212–213).
      const ftp = bikeAnchorValue != null ? Math.round(bikeAnchorValue) : fallbackFtp;
      const ftpBasis = bf?.efficiency?.basis === 'personal' ? 'tested'
        : bf?.efficiency?.basis === 'coggan_ftp' ? 'estimated' : null;
      if (ftp != null) rows.push({ name: 'FTP', value: `${ftp} W`, note: ftpBasis ?? undefined });
      const efFit = fitTrend(efPts);
      if (efFit != null) {
        // The row reads the TREND LINE (WKO5's fitted line), start → end, never one ride (2026-09-04, Michael).
        rows.push({
          name: 'efficiency factor',
          value: fmtEff(efFit.end, true),
          note: `${efFit.weeks}-week trend · from ${fmtEff(efFit.start, true)}`,
        });
      } else if (efLast != null) {
        rows.push({ name: 'efficiency factor', value: fmtEff(efLast.value, true), note: `${fmtDayShort(efLast.date)} ride · too few for a trend` });
      }
      if (rows.length) return rows;
      // Nothing measurable yet — the ride count, never a fabricated number.
      const n = Number(bf?.efficiency?.sampleCount ?? 0) || 0;
      return [{ name: 'rides', value: n > 0 ? String(n) : 'none logged' }];
    }
    if (disc === 'swim') {
      // Swim is DESCRIBED, not graded — volume facts, never a dot (see SwimVolumeRow).
      const w = Math.round((swimVolume?.windowDays ?? 56) / 7);
      const n = swimVolume?.swims ?? 0;
      return [{ name: 'swims', value: n > 0 ? String(n) : 'none', note: `last ${w}wk` }];
    }
    return [];
  };
  // ⛔ THE CHECKPOINT IS PLAN-LEVEL, NOT A TREND CARD (2026-09-04, found on a throwaway at week 8 of a
  // block whose coach payload carried no trends contract yet): the six-week sheet sat below this gate,
  // and `loading` here means "the server has not produced a trends display" — which for a new athlete
  // is indefinite. The sheet asks the server its own question (`endurance-checkpoint`) and gates itself
  // on the answer, so it renders regardless; the sport plates still wait for their contract.
  if (loading || cards.length === 0) return <div className="py-3"><EnduranceCheckpointSheet enabled={hasActivePlan === true} /></div>;

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
    if (rowOrder) {
      const ia = rowOrder.indexOf(a.discipline), ib = rowOrder.indexOf(b.discipline);
      const ra = ia < 0 ? 99 : ia, rb = ib < 0 ? 99 : ib;
      if (ra !== rb) return ra - rb;
    }
    const band = bandOf(a.discipline) - bandOf(b.discipline);
    if (band !== 0) return band;
    const byCadence = (cadenceCounts?.[b.discipline] ?? 0) - (cadenceCounts?.[a.discipline] ?? 0);
    if (byCadence !== 0) return byCadence;
    return (TIEBREAK[a.discipline] ?? 5) - (TIEBREAK[b.discipline] ?? 5);
  });
  const moveRow = (d: string, dir: -1 | 1) => {
    const order = sortedCards.map((c) => c.discipline);
    const i = order.indexOf(d); const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveRowOrder(order);
  };

  return (
    <div className="py-3">
      {/* ⛔ THE SIX-WEEK CHECKPOINT (D-462 follow-up) sits above the sport plates: it is plan-level
          (threshold pace, FTP, threshold HR), not one sport's. Renders only when the server says it is due. */}
      <EnduranceCheckpointSheet enabled={hasActivePlan === true} />
      <div className="px-3 flex justify-end">
        <button type="button" onClick={() => setReordering((v) => !v)} className="text-[11px] tracking-wider uppercase text-white/45 py-1 outline-none focus:outline-none">{reordering ? 'done' : 'reorder'}</button>
      </div>
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
                <BikeFitnessRow fitness={bikeFitness!} mode={fitnessMode.bike ?? 'trend_only'} anchor={fitnessAnchors.bike} fallbackFtp={fallbackFtp} />
                {/* ⛔ NO CONDITIONS FOOTER ON THE BIKE (Michael 2026-09-03: "kill the hills and heat, kill
                    any run crossover"). "Hills and heat can have an impact. Trust your RPE" is written for
                    a runner reading pace; a ride is read on power, which heat and gradient do not inflate. */}
                <EnduranceReadCards asOf={asOf ?? null} sessions={enduranceSessions} spine={enduranceSpine} sport="ride" />
              </>
            );
            // ⛔ RUN OWNS ITS PLATE (Round 3 pass 2) — the run efficiency cards, and ONLY those. No
            // DisciplineRow: the "Efficiency Holding" run row was a duplicate deleted in 1b. The cards'
            // own gate means a run-less plate never reaches here (hasRunContent filters it out above).
            if (card.discipline === 'run') return (
              <>
                {/* 2026-09-03 (Michael): the reads first (efficiency, drift — how you responded), the workload chart
                    (how much, how hard) below them. */}
                <EnduranceReadCards asOf={asOf ?? null} sessions={enduranceSessions} spine={enduranceSpine} sport="run" />
              </>
            );
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
            if (card.discipline === 'bike') return <>{row}<EnduranceReadCards asOf={asOf ?? null} sessions={enduranceSessions} spine={enduranceSpine} sport="ride" /></>;
            if (card.discipline === 'strength') return <>{row}{strengthDetail}<ViadaWeekCard week={viadaWeek} hasPlan={hasActivePlan === true} /></>;
            return row;
          })();
          // ⛔ DEPTH BELONGS TO THE PLATE, NOT THE ROW (2026-09-03, DESIGN_GUIDELINES "Layout Rules").
          // Each sport USED TO wear its own `rounded-2xl` plate with a sport-keyed tint and an `mb-2`
          // gap — four floating cards. That cost height, broke alignment (rows inside ONE container
          // align for free; separate cards do not) and made the eye re-orient four times. The sports
          // are now four ROWS inside the single neutral plate below, split by hairlines, exactly the
          // way the LOAD section is already built.
          // ⚠️ THE PER-SPORT PLATE TINT IS GONE ON PURPOSE. The sport colour still reads — it is on
          // the icon, where it always was — and the tint was saying the same thing twice. Do NOT
          // reintroduce it as a per-row background; that is the rule this change exists to keep.
          // ⛔ COLLAPSED BY DEFAULT — the sport's rows; tap the header to expand into `inner` (the
          // full detail). All four sports fit one screen this way.
          const Icon = DISCIPLINE_ICON[card.discipline];
          const open = expandedSports.has(card.discipline);
          const rows = summaryRows(card.discipline);
          return (
            <div key={card.discipline}>
              <button type="button" onClick={() => { if (!reordering) toggleSport(card.discipline); }} className="w-full flex items-start gap-3 px-3 py-3 text-left outline-none focus:outline-none" aria-expanded={open} aria-label={`${card.discipline} details`}>
                {/* The discipline label is the ROW's name, so it steps DOWN (rule 3): the numbers on
                    the right are the payload and carry the larger size. It was 13.5px against a 12px
                    value — the label was bigger than the thing it labelled. */}
                <span className="flex items-center gap-2 shrink-0 w-[92px] pt-[3px]">
                  {Icon && <Icon size={15} strokeWidth={2.25} style={{ color: getDisciplineColor(card.discipline) }} className="shrink-0" />}
                  <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase text-white/70">{card.discipline}</span>
                </span>
                {/* ⛔ ONE GRID FOR THE WHOLE SPORT, NOT A GRID PER ROW — the columns only line up if
                    every row's cells are children of the SAME grid. Names left, numbers right: two
                    straight edges (rule 2). The old markup right-aligned the whole line, so the
                    numbers lined up and the names zigzagged. */}
                {/* ⛔ TWO COLUMNS, NOT THREE (Michael 2026-09-03, on the phone: "loa…" and "heart rate at
                    easy …"). A third column for the note starved the name column — a long note
                    ("143 bpm · incl. warm-ups") pushed the name to nothing and `truncate` cut it. The
                    note now sits UNDER its value, right-aligned and dim, so the name keeps the whole
                    left column and never truncates. Two straight edges still hold (rule 2). */}
                <span className="flex-1 min-w-0 grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-[6px]">
                  {rows.map((r, i) => (
                    <React.Fragment key={`${r.name}-${i}`}>
                      <span className="text-[14px] text-white/85 leading-tight min-w-0">{r.name}</span>
                      <span className="text-[15px] text-white/90 leading-tight tabular-nums text-right">
                        {r.arrow && <span className={`${r.arrowCls ?? 'text-white/70'} mr-1`}>{r.arrow}</span>}
                        {r.value}
                      </span>
                      {/* ⛔ THE NOTE GETS ITS OWN ROW ACROSS BOTH COLUMNS (2026-09-06). It sat under the value
                          inside the value cell, so a wide note ("12-week trend · from 1.637") squeezed the name
                          column until the name wrapped, and the name's second line ran into the note. On its own
                          row nothing shares its width. */}
                      {r.note && <span className="col-span-2 -mt-[4px] text-right text-[12.5px] text-white/65 leading-tight tabular-nums">{r.note}</span>}
                    </React.Fragment>
                  ))}
                </span>
                {/* ⛔ A CHEVRON THAT OPENS A ROW IS AN AFFORDANCE, NOT DECORATION (rule 5) — it was
                    white/45, near-invisible, and the only signal these rows open at all. */}
                {/* a clear cue that the row opens (Michael 2026-09-03): a proper chevron that turns when open */}
                {/* down = opens in place (iOS/Material accordion); a right chevron would promise another screen */}
                {reordering ? (
                  <span className="flex flex-col shrink-0 self-center gap-1">
                    <span role="button" aria-label={`move ${card.discipline} up`} onClick={(e) => { e.stopPropagation(); moveRow(card.discipline, -1); }} className="px-2 py-0.5 text-white/85 text-[14px] leading-none">▲</span>
                    <span role="button" aria-label={`move ${card.discipline} down`} onClick={(e) => { e.stopPropagation(); moveRow(card.discipline, 1); }} className="px-2 py-0.5 text-white/85 text-[14px] leading-none">▼</span>
                  </span>
                ) : (
                  <span className={`text-white/80 text-[16px] leading-none shrink-0 self-center transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
                )}
              </button>
              {open && <div className="px-3 pb-2">{inner}</div>}
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
        // 2026-09-04: the bike dot is gone (FTP line instead), so swim is the only axis consumer left.
        const firstAxisDisc = active.find((c) => c.discipline === 'swim')?.discipline;
        // ⛔ ONE PLATE, HAIRLINE DIVIDERS — the same `divide-y` construction the LOAD section already
        // uses in StateTab. Glass depth on the OUTSIDE, grid on the inside. Neutral, because this
        // plate is now multi-sport: the sport colour lives on each row's icon.
        return (
          <div className="galaxy-card readout-texture readout-texture--spectral rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
            {active.map((card) => renderCard(card, card.discipline === firstAxisDisc))}
            {/* ⚠️ RESTING ROWS ARE RECESSED, NOT DISABLED (rule 5). They were `opacity-45` — which
                dimmed a row that is still a button, still tappable, still holding real numbers. A
                dropped discipline is never graded or penalised (Michael's rule) and it must not be
                made unreadable either. 0.72 recedes without hiding; the chevron keeps full contrast
                because the row still opens. */}
            {resting.map((card) => (
              <div key={`resting-${card.discipline}`} className="opacity-[0.72]">
                {renderCard(card, false)}
              </div>
            ))}
          </div>
        );
      })()}
      {/* defensive: if there's no strength trend card at all, still surface the per-lift detail —
          on the strength plate, since the detail is single-discipline content */}
      {strengthDetail && !cards.some((c) => c.discipline === 'strength') && (
        // ⚠️ NEUTRAL PLATE, matching the sports plate above (2026-09-03) — it used a strength-keyed
        // tint back when every sport wore its own; one screen, one plate language.
        <div className="galaxy-card readout-texture readout-texture--spectral rounded-2xl px-3 mt-2" style={readoutPlateStyle(undefined, { galaxy: true })}>
          {strengthDetail}
        </div>
      )}
    </div>
  );
}
