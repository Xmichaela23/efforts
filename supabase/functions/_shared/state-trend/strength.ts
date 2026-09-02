// Strength adapter — feeds per-lift e1RM series into the shared primitive and rolls the
// per-lift verdicts up to one discipline verdict.
//
// Architecture contract #2: "overall follows primary lifts" is the SIMPLE v1 roll-up, but
// the per-lift verdicts are returned as a LIST (not pre-collapsed), so a richer roll-up
// later is a change to `rollUp` alone — the trend layer below never moves.

import type { TrendPoint, TrendResult, TrendVerdict } from './types.ts';
import { classifyTrend } from './classify.ts';
import { resolveThresholds } from './thresholds.ts';
import { isDeloadWeek } from './deload.ts';
import { positionInRange, type RangePosition } from './position-in-range.ts';
import type { EffortReadMode } from '../strength-profiles.ts';
import { capabilitiesForExercise } from '../../../../src/lib/exercise-role.ts';
// ⛔ THE SLOT MAP — ONE FILE, READ BY THIS FUNCTION AND BY THE CLIENT'S DISPLAY FOLD. Same path
// precedent as the line above and as `assemble.ts`'s `tracked-max-lifts` import: a constant the two
// sides must agree on exists exactly once. See `src/lib/lift-slots.ts` for why front squat is absent.
import { slotForCanonical } from '../../../../src/lib/lift-slots.ts';

/** Per-lift dated e1RM series. value = estimated_1rm; meta.name carries the workout name (deload detect). */
export interface LiftSeries {
  canonical: string;
  displayName: string;
  points: TrendPoint[];
}

export interface LiftVerdict {
  canonical: string;
  displayName: string;
  isPrimary: boolean;
  trend: TrendResult;
  /** Slice 2: WHICH measure the direction was read from. Travels to the surface so a screen can say
   *  what it is showing instead of implying every lift is judged the same way. */
  gauge?: StrengthGauge;
  /** One-line receipt for the gauge (Law 3 — confidence/basis travels with the claim). */
  gaugeBasis?: string;
}

export interface StrengthState {
  lifts: LiftVerdict[]; // structured per-lift, for display + a richer roll-up later
  overall: TrendVerdict;
  overallPctChange: number | null;
}

/**
 * Primary lifts that drive the overall verdict. Accessory anchors (hip_thrust,
 * barbell_row) are still tracked + shown per-lift but don't move the discipline verdict.
 * Swap this set — or replace `rollUp` — for a richer roll-up without touching `classifyTrend`.
 *
 * ── [Step 7] THIS IS THE THIRD OF THREE DIFFERENT QUESTIONS, AND THE ONLY ONE STILL UNSETTLED ────
 *   1. "may we coach it?"      → `capabilitiesForExercise().coached`, ~16 names (four lifts + the
 *                                 variants that fill their slots). Wide on purpose.
 *   2. "do we chart a max?"    → `src/lib/tracked-max-lifts.ts`, exactly 4. In the previous program you hold a
 *                                 training max on four lifts — one per slot.
 *   3. "does it move the dot?" → THIS SET, currently 5.
 *
 * ⚠️ Differences 1-vs-2 are INTENTIONAL and are now documented as such: a Front Squat is coached
 * (it IS the squat slot this cycle) and carries no fifth tracked max. Do not force them equal.
 *
 * ⛔ BUT THIS SET'S FIFTH MEMBER IS A PRODUCT CALL THAT HAS NOT BEEN MADE, AND IT IS MEASURABLE.
 * `trap_bar_deadlift` sits here but not in the tracked-max four, and `buildStrengthBaselines` gives
 * it the SAME baseline as `deadlift` (both from `perf.deadlift`). So an athlete who logs both a
 * conventional and a trap-bar deadlift has the DEADLIFT SLOT COUNTED TWICE in `computeE1rmBand`,
 * which averages one ratio per canonical. Measured on a synthetic athlete with identical strength:
 * squat + deadlift → dot **0.750**; squat + deadlift + trap bar → dot **0.833**. The dot moved eight
 * points because a variant was logged, not because anything got stronger.
 *
 * ⛔⛔ FIXED 2026-09-01 — EVERYTHING ABOVE THIS LINE IS HISTORY. Michael ruled (FIXLIST 2b): the four
 * SLOTS aggregate their variants, one ratio per slot, whichever movement filled it. The fix is
 * applied inside `computeE1rmBand` below, NOT by editing this set — read the block there before
 * changing either. The double-count is gone; the measured 0.833 now reads 0.750.
 *
 * ⛔ THIS SET STILL CONTAINS `trap_bar_deadlift` ON PURPOSE. `isPrimary` is also what puts a lift in
 * the client's card list, so removing it here would delete the trap bar's row before the display fold
 * merges it and lose the athlete's record and session count. Membership is the right answer; the
 * AGGREGATION was the bug. Do NOT widen or narrow this set to make the three lists match.
 */
export const PRIMARY_LIFTS = new Set([
  'squat',
  'bench_press',
  'deadlift',
  'trap_bar_deadlift',
  'overhead_press',
]);

// ── Strength row as a DUAL read: VOLUME direction (activity/load fact) LEADS, e1RM direction is the
// secondary fitness read. Session count is the receipt. Industry-standard (Strong/Hevy/JEFIT). ──

/** Per-workout strength volume (total_volume_lbs) → {date,value}[] for the volume trend. */
export interface StrengthVolumeRow { date: string; total_volume_lbs: number | null }
/** D-338: `phaseByDate` carries the plan's own phase per date so the deload exclusion below can
 *  actually fire. The volume series had the SAME dead exclusion as the e1RM one — and a deload hits
 *  volume even harder than it hits the estimate (fewer reps AND lighter), so a planned light week
 *  was reading as "volume down". Absent → no meta → today's behaviour, unchanged. */
export function strengthVolumeToSeries(
  rows: StrengthVolumeRow[] | null | undefined,
  phaseByDate?: Record<string, string> | null,
): TrendPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const phase = phaseByDate?.[r.date] ?? null;
      const base = { date: r.date, value: Number(r.total_volume_lbs) };
      return phase ? { ...base, meta: { phase } } : base;
    })
    .filter((p) => p.date && Number.isFinite(p.value) && p.value > 0);
}

/** Volume trend. HIGHER = more training (a load fact, NOT fitness) → lowerIsBetter false; wider
 *  bands (±8%) than e1RM because session-to-session volume swings (upper vs lower day). */
export function computeStrengthVolumeState(series: TrendPoint[], asOf: string, sessionsPerWeek: number): TrendResult {
  return classifyTrend(
    series,
    { ...resolveThresholds('strength', sessionsPerWeek), improvePct: 8, slidePct: -8, lowerIsBetter: false },
    asOf,
    { exclude: isDeloadWeek },
  );
}

// Per-lift e1RM DIRECTION, serialized onto the spine (D-270). computeStrengthState already produces
// this list; before, rollUp collapsed it to the aggregate and it was discarded. Persisting it makes the
// spine the SINGLE authority for "is <lift> improving" — the coach per-lift row READS this instead of
// re-deriving a parallel (dead-fielded) direction from a different table. One direction, one substrate.
export interface StrengthPerLift {
  canonical: string;
  displayName: string;
  isPrimary: boolean;
  /** ⛔ RETIRED (D-420) — always `'needs_data'`. The weekly strength direction is not computed; see
   *  the block above `computeStrengthState`. The field stays so existing readers don't break, and
   *  because `'needs_data'` is the value every one of them already treats as "no claim". A reader
   *  must NOT interpret it as "not enough data" — `directionBasis` says what it really means. */
  direction: TrendVerdict;
  /** Which measure this lift's readings come from — 'amrap' (the all-out set, for a waved main lift
   *  on a the previous program block) or 'e1rm' (logged working sets). D-419 infrastructure; it survives D-420 and
   *  now describes the RECEIPTS rather than a direction. */
  directionGauge?: StrengthGauge;
  /** Since D-420, the retirement note itself — renderable, never re-derived. */
  directionBasis?: string;
  /** ⛔ RETIRED (D-420) — always null. Was the direction's magnitude ("sliding −8.2%"). */
  pctChange: number | null;
  latestE1rm: number | null;   // most-recent estimated_1rm point (the number the direction is OF)
  bestE1rm: number | null;     // best estimated_1rm in the TRACKED WINDOW (6wk) — the band frame, NOT the PR frame
  /** A REAL PR frame: best estimated 1RM across ALL logged history (not 6wk), + how many all-history
   *  points back it. PR = latest is a genuine new all-time high (latest >= allTimeBestE1rm). null when
   *  the all-history read wasn't supplied — the client then must NOT flag a PR (no false records). */
  allTimeBestE1rm: number | null;
  allTimeCount: number;
  /**
   * ⛔ IS THE LATEST LIFT A REAL PR? Decided HERE, on the spine, not on the screen (2026-07-30).
   *
   * The three-part rule (all-time best present, at least three all-history points behind it, latest
   * within half a pound of that best) used to live in `StatePerformanceSection.tsx`. A screen deciding
   * what counts as a personal record is a surface minting a verdict — Constitution Law 4 — and the
   * moment a second surface wanted to show a PR it would have had to copy the rule or invent its own.
   *
   * ⚠️ FALSE WHENEVER THE ALL-HISTORY READ IS MISSING. No data is not a record.
   */
  isPr: boolean;
  /**
   * ⛔ THE REP PR (D-420 pillar 2) — the last all-out set for this lift, and whether it beat the most
   * reps ever done at that weight. the previous program: *"If your squat goes from 225x6 to 225x9, you've
   * gotten stronger."* This is the home for the high-rep all-out sets the trusted-rep e1RM gate
   * (D-417) correctly refuses — 105×35 can never mint an e1RM, but it is absolutely a rep record.
   *
   * ⚠️ Decided on the spine, from the SAME walk the Performance screen's card uses
   * (`allOutSeriesByLift`), so the two screens cannot disagree about whether a set was a record.
   * Null = no all-out set in the window, which is honest and common (a leader cycle prescribes none).
   */
  lastAllOut?: { date: string; weight: number; reps: number; isRepRecord: boolean; priorBestRepsAtWeight: number | null } | null;
  sampleCount: number;
  newestAgeDays: number | null;
  provisional: boolean;
  /** 12-week dated e1RM series for the per-lift sparkline (the "long view" behind the verdict).
   *  SAME points the verdict reads, over a wider 84d window; `recent` flags the points inside the
   *  verdict window (rendered in color). Only populated for the big-4 lifts. Mirrors run efficiency.series. */
  /** ⛔ WHICH WEEK OF THE CURRENT BLOCK THE POINT FELL IN (2026-08-28) — resolved on the server off
   *  `resolvePlanWeekIndex` so a card can label its axis "week 6" without re-deriving it from dates
   *  plus a block start (Constitution: surfaces render, they never re-decide).
   *  ⚠️ ABSENT ON A POINT OUTSIDE THE CURRENT BLOCK — a rebuilt block starts its own numbering and
   *  an older session is not week 1 of it. Draw such a point without a week; never fill in a 1. */
  series?: Array<{ date: string; value: number; recent: boolean; week?: number }>;
  /** ⛔ WHERE THE PROGRAMME SAYS THIS LIFT SHOULD BE — dated weekly points from the block's opening
   *  working number at the plan's own rate (1% every 3 weeks, p247).
   *  ⚠️ IT DECIDES NOTHING. The word on the card comes from completed reps, never from distance to
   *  this curve — a rise this slow moves less than one plate for most of a block, so a band around
   *  it could only ever fire on rounding (measured 2026-08-28).
   *  ⚠️ BLOCK-SCOPED WHILE `series` IS NOT: the readings are the athlete's across blocks, but "where
   *  the programme says you should be" is a claim only the current programme can make. */
  expected?: Array<{ date: string; value: number }>;
}

/** Bridge the spine's per-lift e1RM `direction` (TrendVerdict) to the per-workout narrative's
 *  up/flat/down vocabulary, so the workout "trending" claim reads the SAME direction State renders
 *  (D-270 continuity) instead of getE1rmTrend's this-vs-last-session delta. needs_data / absent →
 *  null = no trend claim (honest). The e1RM numbers stay the receipt; only the DIRECTION is spine-owned. */
export function spineDirectionToTrend(v: TrendVerdict | null | undefined): 'up' | 'down' | 'flat' | null {
  return v === 'improving' ? 'up' : v === 'sliding' ? 'down' : v === 'holding' ? 'flat' : null;
}

// The strength row's serializable dual read. e1rm is NULL when there's no e1RM trend to hold — the
// render DROPS the clause rather than assert "holding" (holding is a claim; same honesty gate as
// every other row). "unplanned" is a dim receipt, never the verdict. perLift is the per-lift breakdown
// the aggregate rolls up FROM — persisted so surfaces read one direction (D-270), not re-derive it.
// State v3 DOT for strength = e1RM (what you CAN lift), NOT volume (what you DID — that's a LOAD/Home
// concept). Aggregate the PRIMARY lifts' e1RM position in their own 12wk range (higher = fitter), so a
// max-volume 5×5 block can't peg the dot to "fitness: maximum". Confident only with ≥2 primaries that
// have a real spread. (Anchoring to the baseline 1RM as the right edge is a follow-up — needs baseline
// threaded into the spine; this uses the 12wk range like every other row.)
/** Build the PRIMARY_LIFTS→baseline-1RM map from user_baselines. Typed performance_numbers first,
 *  learned_fitness.strength_1rms fills gaps. Keys match PRIMARY_LIFTS canonical — used by BOTH the
 *  server (compute-snapshot) and the client live path so the strength dot's frame is identical. */
export function buildStrengthBaselines(perfRaw: any, learnedRaw: any, lockedRaw?: any): Record<string, number> | null {
  const perf = perfRaw || {};
  const learned = learnedRaw || {};
  // AUTO/LOCKED (2026-09-02): a value the athlete LOCKED on the Baselines screen is their asserted
  // number and outranks the typed seed. ⚠️ Typed-before-learned below is unchanged (D-231 for this
  // band); the resolver's learned-first flip has not been applied here — see the 2026-09-02 handoff.
  const locked = lockedRaw && typeof lockedRaw === 'object' && !Array.isArray(lockedRaw) ? lockedRaw : {};
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const m: Record<string, number> = {};
  const put = (k: string, ...cands: any[]) => { const v = cands.map(num).find((x) => x != null); if (v != null) m[k] = v; };
  put('squat', locked.squat, perf.squat, perf.squat1RM, perf.squat_1rm, learned.squat);
  put('bench_press', locked.bench, perf.bench, perf.bench1RM, perf.bench_1rm, learned.bench);
  put('deadlift', locked.deadlift, perf.deadlift, perf.deadlift1RM, perf.deadlift_1rm, learned.deadlift);
  put('trap_bar_deadlift', locked.deadlift, perf.deadlift, perf.deadlift1RM, learned.deadlift);
  put('overhead_press', locked.overheadPress1RM, perf.overhead, perf.overheadPress1RM, perf.overhead_1rm, learned.overhead);
  return Object.keys(m).length ? m : null;
}

export function computeE1rmBand(series: LiftSeries[], baselineByCanonical?: Record<string, number> | null): RangePosition | null {
  /**
   * ⛔⛔ ONE RATIO PER SLOT, NOT PER CANONICAL (2026-09-01, FIXLIST 2b-server). THIS IS THE FIX FOR
   * THE MEASURED FAULT DESCRIBED ABOVE `PRIMARY_LIFTS`, and it is applied HERE rather than by
   * narrowing that set — read this before "simplifying" it back.
   *
   * ⛔ THE FAULT. This function averages ONE RATIO PER SERIES, and a series is keyed by canonical.
   * `PRIMARY_LIFTS` contains BOTH `deadlift` and `trap_bar_deadlift`, and `buildStrengthBaselines`
   * gives them the SAME baseline (both from `perf.deadlift`). So an athlete who logs a conventional
   * and a trap-bar deadlift had the HINGE SLOT COUNTED TWICE. Measured, on a synthetic athlete of
   * identical strength: squat + deadlift → 0.750; squat + deadlift + trap bar → 0.833. Eight points,
   * because a variant was logged rather than because anything got stronger.
   *
   * ⛔ WHY NOT JUST DROP `trap_bar_deadlift` FROM `PRIMARY_LIFTS` — IT WOULD LOSE DATA.
   * `isPrimary` is also what puts a lift in the client's card list
   * (`fitness.perLift.filter(l => l.isPrimary …)`). Removing it there would delete the trap bar's row
   * BEFORE the display fold merges it, so the athlete would lose the record and the session count
   * that fold exists to keep. Membership stays; the AGGREGATION changes. That is Michael's ruling
   * read literally: *the four slots aggregate their variants — one ratio per slot, whichever
   * movement filled it.*
   *
   * ⚠️ FRONT SQUAT NEEDS NOTHING AND THAT IS NOT AN OVERSIGHT. `front_squat` is not in
   * `PRIMARY_LIFTS`, so it never reaches this function and cannot inflate the squat slot. See the
   * note in `src/lib/lift-slots.ts`.
   *
   * ⚠️ The slot map is the SAME FILE the client's display fold reads, for the reason
   * `tracked-max-lifts.ts` records: a constant two sides must agree on exists exactly once.
   */
  const primaries = (Array.isArray(series) ? series : []).filter((s) => PRIMARY_LIFTS.has(s.canonical));
  if (primaries.length === 0) return null;
  const bySlot = new Map<string, LiftSeries>();
  for (const s of primaries) {
    const slot = slotForCanonical(s.canonical);
    const held = bySlot.get(slot);
    if (!held) { bySlot.set(slot, s); continue; }
    // The slot's reading is its most recent one — the same representative rule the display fold uses,
    // so the card and the band cannot disagree about which pull is current.
    const lastOf = (x: LiftSeries) => (x.points.length ? x.points[x.points.length - 1].date : '');
    if (lastOf(s) > lastOf(held)) bySlot.set(slot, s);
  }
  const slots = [...bySlot.values()];
  // PREFERRED: e1RM vs BASELINE — the baseline 1RM is the right edge, and the dot is current e1RM ÷
  // baseline. This is the honest frame for strength: you have a KNOWN max, so "where am I versus it"
  // beats "where am I in my 12wk range" — which pegs the dot right in ANY build block (e1RM is
  // highest-in-12wk by construction). Working at ~82% of baseline lands the dot at 0.82, not maxed.
  if (baselineByCanonical) {
    const ratios = slots.map((s) => {
      const cur = s.points.length ? s.points[s.points.length - 1].value : null;
      const base = baselineByCanonical[s.canonical];
      return cur != null && base != null && base > 0 ? cur / base : null;
    }).filter((r): r is number => r != null);
    if (ratios.length) {
      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      return { low: 0, high: 1, current: avg, positionPct: Math.max(0, Math.min(1, avg)), confident: ratios.length >= 2 };
    }
  }
  // FALLBACK (no baseline yet): 12wk range, but NEVER fully confident — it pegs right while building,
  // so hedge it grey rather than assert "at your max".
  const positions = slots.map((s) => positionInRange(s.points, { higherIsBetter: true })).filter((r): r is RangePosition => r != null);
  if (positions.length === 0) return null;
  const avgPct = positions.reduce((a, p) => a + p.positionPct, 0) / positions.length;
  return { low: 0, high: 1, current: avgPct, positionPct: avgPct, confident: false };
}

/**
 * ⛔ THE PULL-UP PROGRESSION'S ROW. Present ONLY when the athlete turned the goal on — a number
 * nobody asked to be tracked is a number on a screen for no reason.
 *
 * ── TWO MEASUREMENTS, NAMED SEPARATELY, NEVER CONVERTED INTO EACH OTHER ──────────────────────────
 *
 * `cleanMaxReps` is a MAX CLEAN REPS figure: one set, no band, to failure. the previous program's standard
 * (`standardReps` inside `standardMinutes`, the previous program) is a SESSION measure — many sets against a
 * clock. **They are different measurements and neither converts into the other**, so this carries
 * both, labelled, and the surface must render them as two facts rather than a percentage of one
 * toward the other. "12 of 50" would be an invented metric.
 *
 * ── ⛔ AND THERE IS NO LEARNED e1RM HERE, BY CONSTRUCTION ────────────────────────────────────────
 *
 * `capacity-resolver.ts` maps `pullupMaxReps → TYPED_TO_LEARNED: null` (D-229): a pull-up is a rep
 * count, not a load, so there is no `learned_fitness.strength_1rms` entry to cross-check a typed
 * value against and no drift suggestion to make. Every other lift on this row can say "your logs
 * suggest X"; this one cannot, and inventing an equivalent — an e1RM off bodyweight, a "pull-up
 * score" — would be minting a number the athlete could not verify. **What is shown is what was
 * logged.**
 */
export interface PullupProgress {
  /** Best CLEAN single set in the window. ⛔ Band-assisted reps are excluded by construction. */
  cleanMaxReps: number | null;
  /** Clean reps performed in the window — the volume actually earned at bodyweight. */
  cleanReps: number;
  /**
   * ⛔ COUNTED, NEVER MERGED. Assisted reps are real work and the on-ramp is the standard (the previous program
   * p.36) — but folding them into the clean count makes the number climb while the athlete gets no
   * stronger. Walking the band down shows up as this falling while `cleanReps` rises.
   */
  assistedReps: number;
  /** the previous program's standard, stated as itself: `standardReps` reps inside `standardMinutes` minutes. */
  standardReps: number;
  standardMinutes: number;
  /** Sessions in the window that carried any chin/pull-up work. Provenance for the two counts. */
  sessions: number;
}

export interface StrengthFitness {
  volume: { verdict: TrendVerdict; pctChange: number | null; sampleCount: number; newestAgeDays: number | null; provisional: boolean; range?: import('./position-in-range.ts').RangePosition | null };
  e1rm: { verdict: TrendVerdict; pctChange: number | null; range?: RangePosition | null } | null;
  perLift: StrengthPerLift[];
  sessionsThisWeek: number;
  unplanned: number;
  /** Present only when `performance_focus === 'pullups'`. See {@link PullupProgress}. */
  pullups?: PullupProgress | null;
}

// SIGNAL-VS-NOISE guard for e1RM (2026-07-19). e1RM off working sets scatters ~4-8% session to
// session — RIR-estimate wobble (the e1RM offset is only as steady as the logged RIR; D-339 moved the
// formula itself to the standard, `src/lib/estimate-1rm.ts`), best-set
// selection, and thin per-lift cadence (often n=3-4 in the 6wk window). Without a guard a lift whose
// e1RM moved LESS than its own scatter still earns "improving"/"sliding" off the dead-band alone. This
// is the same gate run decoupling already uses (run.ts, noiseGuardStdev 1.0): a directional verdict must
// clear ~1 within-window SD or it reads holding. Data-only, no new inputs (Michael's rule). Measured
// live on real data: a squat reading "sliding" −2.5% on σ=4.1% scatter — noise wearing a verdict.
const E1RM_NOISE_GUARD_STDEV = 1.0;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROTOCOL'S OWN GAUGE (Slice 2, 2026-08-12) — the previous program progress is the ALL-OUT SET, not the
// waved working-set e1RM.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE FRACTURE. The direction above reads the e1RM series, which D-417 correctly gates to trusted
// low-rep sets. On a the previous program block that leaves ONLY the fixed working sets — whose weight the PROGRAM
// waves by design (65/75/85 → 70/80/90 → 75/85/95, then a new cycle re-bases). So a lighter
// prescribed week read as "1 lift trending down" on a week the athlete executed perfectly. The one
// set the previous program actually measures by — the all-out set, which runs long — is excluded from e1RM by
// construction, so the gauge was throwing away the measurement and trending the prescription.
//
// ⛔ WHAT THE BOOK SAYS (the previous program., verified verbatim — do NOT paraphrase these into a new rule):
//   p9   — "This program allows you to break a wide variety of rep records throughout the entire year."
//   p10  — "If your squat goes from 225x6 to 225x9, you've gotten stronger. If you keep setting and
//          breaking rep records, you'll get stronger. Don't get stuck just trying to increase your one
//          rep max… There's also a simple way of comparing rep maxes that I'll explain later."
//   p26  — "This program requires that you push yourself on the last set. This often entails
//          performing 10 or more reps." (Why the trusted-rep e1RM gate can never see it.)
//   p28  — the training max goes up 5 lb upper / 10 lb lower PER CYCLE, so the all-out set's WEIGHT
//          moves between cycles. This is why a rep count alone cannot be the whole comparison.
//   p32  — "Weight x Reps x .0333 + Weight = Estimated 1RM"… "This formula is not necessarily an
//          accurate predictor of your 1RM, but it affords you a good general way to gauge your
//          progress." ⚠️ HIS OWN CAVEAT — it is the CROSS-WEIGHT COMPARATOR, nothing more.
//   p66  — "95%x1+ (all out set)" — the prescription that makes it the measurement.
//   p100 — "Do I go for max reps on each set or just the last set? Just the last set of the day for
//          the big exercise." AND "Do I go for max reps during my deload week? No."
//   p24  — "in the 4th week (your deload week), you should NOT be going for max reps."
//   pp.123-129 — his own logbook carries a **Rep Records** box per lift per cycle.
//
// ⛔ SO THE GAUGE IS: the all-out set's the previous program estimate, trended. At a FIXED weight that
// estimate is a strictly increasing function of reps — so it IS the rep record (p10), exactly. When
// the weight steps up between cycles (p28) it is his own comparator doing the bridging (p32). One
// value, both cases, and no threshold invented here.
//
// ⚠️ THE TRUSTED-REP CAP DOES NOT APPLY. D-417 caps what may mint an *e1RM*; this is a rep count on
// a known weight compared against itself. Capping it would report a 20-rep set as an 8-rep one.

/** Which measure a lift's progress direction was read from. Travels to the surface (Law 2/3). */
export type StrengthGauge = 'amrap' | 'e1rm';

/** One dated all-out set, as the spine consumes it. Mirrors `_shared/strength/all-out-set.ts`. */
export interface AllOutTrendInput {
  date: string;
  weight: number;
  reps: number;
  /** the previous program's p32 estimate for this set, computed once at capture. */
  estimated_1rm: number;
}

/**
 * ⛔ 12 WEEKS, NOT 6 — AND THE REASON IS CADENCE, NOT PREFERENCE. The e1RM window (42d) is tuned to
 * a per-SESSION signal. An all-out set is a per-CYCLE measurement: this app prescribes it on the
 * anchor cycle's third working set only (`wendler-531.ts:64` — `kind === 'anchor' && !isDeload`), so
 * a 6-week window can hold as few as three, and a leader cycle holds none at all. 84 days spans a
 * leader + anchor pair, which is the span a rep record actually lives across — the same reasoning
 * (and roughly the same span) as `REP_RECORD_WINDOW_SESSIONS = 40` in `_shared/strength/all-out-set.ts`,
 * and the same 84d window the per-lift sparkline already uses.
 */
export const ALL_OUT_WINDOW_DAYS = 84;

/**
 * ⛔ THREE READINGS, EXPLICITLY — not `resolveThresholds`' cadence-scaled floor, which climbs to 5
 * for a 4x/week lifter. That scaling is right for a per-session series and wrong here: no amount of
 * training frequency produces more than about one all-out set per lift per week, so a floor of 5
 * would silence the gauge for exactly the athletes training hardest. Three is the shared primitive's
 * own lower clamp (`thresholds.ts:54`), i.e. the floor the trend layer already considers minimal.
 */
const ALL_OUT_MIN_SESSIONS = 3;

/**
 * ⛔ FRESHNESS SCALES TO THE MEASUREMENT'S OWN CADENCE — 56 days, and the number is the BOOK's, not
 * a preference. A the previous program cycle is four weeks (p26/p28 lay out Week I-IV, then the maxes step up and it
 * repeats), and this app prescribes the all-out set on the anchor cycle only, so two consecutive
 * readings can legitimately sit a leader cycle apart. Two cycles = 56 days is therefore the point at
 * which "this is your current direction" stops being true.
 *
 * ⚠️ WITHOUT THIS THE GAUGE IS DEAD ON ARRIVAL, and it fails INVISIBLY: `resolveThresholds` scales
 * freshness to SESSION cadence — 7 days for a 3x/week lifter — so an all-out set performed 8 days ago
 * decayed to `needs_data` and the row went blank. Measured, not theorised: it is what this fixture
 * caught on the first run.
 */
const ALL_OUT_FRESHNESS_DAYS = 56;

/** Is this lift's working weight WAVED off a training max — i.e. is it "the big exercise" (p100)?
 *  `coached` is true on exactly the `barbell_main` row (D-373): the main-lift slots and their
 *  variants (Front Squat, Close Grip Bench, Push Press…). An accessory is not waved and not measured
 *  by an all-out set, so it keeps the e1RM read. */
function isWavedMainLift(canonical: string): boolean {
  try { return capabilitiesForExercise(canonical).coached === true; } catch { return false; }
}

/** All-out sets → trend points. value = the p32 estimate; `meta.phase` carries the deload exclusion. */
export function allOutToPoints(
  points: readonly AllOutTrendInput[] | null | undefined,
  phaseByDate?: Record<string, string> | null,
): TrendPoint[] {
  if (!Array.isArray(points)) return [];
  return points
    .filter((p) => p?.date && Number.isFinite(p.estimated_1rm) && p.estimated_1rm > 0)
    .map((p) => {
      const phase = phaseByDate?.[p.date] ?? null;
      const base = { date: p.date, value: p.estimated_1rm };
      return phase ? { ...base, meta: { phase } } : base;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StrengthStateOpts {
  /** Every all-out set per canonical lift, oldest first (`allOutSeriesByLift`). */
  allOutByLift?: Record<string, AllOutTrendInput[]> | null;
  /** What the athlete's block declares it reads (`protocolEffortRead`). Absent/'rir'/'none' ⇒ the
   *  e1RM gauge, byte-identical to pre-slice behaviour for every existing protocol. */
  effortRead?: EffortReadMode | null;
  /** Plan phase per date, so a deload all-out set is excluded (p24 / p100). */
  phaseByDate?: Record<string, string> | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE WEEKLY STRENGTH DIRECTION VERDICT IS RETIRED (D-420, 2026-08-12). DO NOT BRING IT BACK.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// The WHY is written down and is not re-derived here: `docs/SCIENCE-strength-e1rm-trust.md` §6 and
// D-420. In one line: **no commercial app computes a weekly per-lift strength direction**, and on a
// the previous program wave a first-to-last direction reads the WITHIN-CYCLE weight-wave as a trend. It printed
// "1 lift trending down" and an overall "sliding −8.2%" on a deadlift that was simply running the
// program — 105×35 → 110×25 → 115×20, one cycle's three weeks.
//
// ⚠️ AND THE PREVIOUS FIX DID NOT SAVE IT. D-419 pointed the direction at the all-out set instead of
// the working sets. That was the right substrate and still the wrong OBJECT: all-out sets run 20-35
// reps, above the reliable estimate range (SCIENCE §2), so their estimate slides across the wave too.
// The verdict itself was the mistake. **This retires the direction half of D-419; the protocol-declared
// gauge infrastructure (`readsEffortAs`, `allOutByLift`) SURVIVES** and still selects which measure the
// receipts describe.
//
// WHAT REPLACES IT — the universal method (Strong / Hevy / Boostcamp) and the standard:
//   1. the e1RM RECORD (best trusted e1RM to date, per lift — monotonic, a max not an average),
//   2. REP PRs (most reps at a weight, the previous program — honest at any rep count), and
//   3. the e1RM CHART over the block; the human reads the slope.
// All three already existed. This slice removes the fourth thing, which was lying.
//
// ⛔ IF A DIRECTION IS EVER STATED AGAIN it may only be computed over a window spanning WHOLE CYCLES
// (≥2 waves), so the wave sits inside the window instead of splitting it. Default: don't state one.
//
// ⚠️ THE CLASSIFIER STILL RUNS, DELIBERATELY. Its RECEIPTS are facts and are still published —
// `sampleCount`, `newestAgeDays`, provisional-ness, and the deload exclusion that shapes them
// (D-338). Only the VERDICT is suppressed, in this one place, so no arm can render it (Law 1).
const DIRECTION_RETIRED_BASIS =
  'direction not tracked — strength progress reads the record, rep PRs and the chart (D-420)';

/** Strip the direction CLAIM off a computed trend, keeping every receipt on it. */
function retireDirection(t: TrendResult): TrendResult {
  return { ...t, verdict: 'needs_data', pctChange: null, earlyAvg: null, recentAvg: null };
}

export function computeStrengthState(
  series: LiftSeries[],
  asOf: string,
  sessionsPerWeek: number,
  opts: StrengthStateOpts = {},
): StrengthState {
  const thresholds = resolveThresholds('strength', sessionsPerWeek); // per-lift cadence (Q-052)
  const readsAmrap = opts.effortRead === 'amrap';

  const lifts: LiftVerdict[] = series.map((s) => {
    const e1rmTrend = classifyTrend(s.points, thresholds, asOf, { exclude: isDeloadWeek, noiseGuardStdev: E1RM_NOISE_GUARD_STDEV });

    // Only a WAVED main lift on an 'amrap' protocol changes gauge. Accessories and every 'rir' /
    // 'none' protocol keep the e1RM read exactly as before.
    if (!readsAmrap || !isWavedMainLift(s.canonical)) {
      return {
        canonical: s.canonical, displayName: s.displayName, isPrimary: PRIMARY_LIFTS.has(s.canonical),
        // D-420: the receipts survive, the verdict does not.
        trend: retireDirection(e1rmTrend), gauge: 'e1rm' as StrengthGauge,
        gaugeBasis: DIRECTION_RETIRED_BASIS,
      };
    }

    const allOutPoints = allOutToPoints(opts.allOutByLift?.[s.canonical], opts.phaseByDate);
    const trend = classifyTrend(
      allOutPoints,
      { ...thresholds, windowDays: ALL_OUT_WINDOW_DAYS, minSessions: ALL_OUT_MIN_SESSIONS, freshnessDays: ALL_OUT_FRESHNESS_DAYS },
      asOf,
      { exclude: isDeloadWeek, noiseGuardStdev: E1RM_NOISE_GUARD_STDEV },
    );

    // D-420: the all-out set is still the RIGHT substrate for a the previous program lift — it is what the record and
    // the rep PRs are read from — but no DIRECTION is claimed off it. D-419's gauge selection survives
    // and now describes which measure the receipts came from; the verdict it fed is retired.
    return {
      canonical: s.canonical, displayName: s.displayName, isPrimary: PRIMARY_LIFTS.has(s.canonical),
      trend: retireDirection(trend), gauge: 'amrap' as StrengthGauge,
      gaugeBasis: DIRECTION_RETIRED_BASIS,
    };
  });

  // ⛔ NO ROLL-UP VERDICT (D-420). `rollUp` collapsed the per-lift directions into one
  // improving/holding/sliding word — the "sliding −8.2%" on the strength row. With no per-lift
  // direction there is nothing to roll up, and the aggregate is a no-claim. `rollUp` itself is kept
  // (unused for strength) only because it is the documented extension point for a richer roll-up; if
  // it is ever called again it must obey the whole-cycle window rule above.
  return { lifts, overall: 'needs_data', overallPctChange: null };
}

/** Simple v1: the overall verdict follows the PRIMARY lifts that have data. */
function rollUp(lifts: LiftVerdict[]): { overall: TrendVerdict; overallPctChange: number | null } {
  const primaries = lifts.filter((l) => l.isPrimary && l.trend.verdict !== 'needs_data');
  if (primaries.length === 0) return { overall: 'needs_data', overallPctChange: null };

  const anyImproving = primaries.some((l) => l.trend.verdict === 'improving');
  const anySliding = primaries.some((l) => l.trend.verdict === 'sliding');

  let overall: TrendVerdict;
  if (anySliding && !anyImproving) overall = 'sliding';
  else if (anyImproving && !anySliding) overall = 'improving';
  else overall = 'holding'; // all-holding, or a conflicting mix → conservative

  const pcts = primaries
    .map((l) => l.trend.pctChange)
    .filter((n): n is number => n != null);
  const overallPctChange = pcts.length
    ? Math.round((pcts.reduce((s, n) => s + n, 0) / pcts.length) * 10) / 10
    : null;

  return { overall, overallPctChange };
}
