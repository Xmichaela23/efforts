// ============================================================================
// THE GENERATOR — session type + level + the athlete's own thresholds in, a session out.
//
// ⛔ GENERATE, DO NOT TRANSCRIBE. Nothing in this file reproduces one of Viada's workouts. It reads
// the family's structural shape and its stated bands from `source-rules.ts`, sizes the work to the
// computed dose band, sets the recoveries from his stated recovery rules, and resolves every
// intensity against THIS athlete's threshold through the resolvers that already own those facts.
// Two athletes at the same family, level and size get different sessions, because they have
// different thresholds. That is the point.
//
// ⛔ AND NOTHING IS INVENTED WHEN A NUMBER IS ABSENT. "Full recovery" has no duration on the page and
// gets none here — the step carries a null clock and the session's total says it is a lower bound.
// An unresolvable anchor produces an unresolved target carrying the reason, never a placeholder pace.
// ============================================================================

import {
  CARDIAC_DRIFT_NOTE,
  FAMILIES,
  FORM_FOCUS_NOTE,
  INFERRED_CYCLING_BASIS_NOTE,
  OPEN_WATER_SAFETY_NOTE,
  OPEN_WATER_TIMER_NOTE,
  PERCENT_BASIS,
  POWER_FLOOR_NOTE,
  SESSION_ADD_ONS,
  SPRINT_PACING_NOTE,
  STRIDES_DOSE_IS_OURS,
  STRIDES_NOTE,
  type SessionAddOnId,
  SWIM_DRILLS,
  SWIM_OPENER_SHARE,
  SWIM_SESSION_CEILING_SECONDS,
  TALK_TEST_NOTE,
  TEMPO_CROSSOVER_SECONDS,
  THRESHOLD_REST_MAX_SECONDS,
  THRESHOLD_REST_MIN_SECONDS,
  THRESHOLD_WORK_TO_REST,
  VT1_BOUT_FLOOR_SECONDS,
  VT1_CONTINUOUS_CAP_SECONDS,
  WORK_BANDS,
  WRAPPERS,
  type Archetype,
} from './source-rules.ts';
import { anchorFor, resolveEnduranceAnchors, UNKNOWN_ANCHORS, type EnduranceAnchors, type EnduranceBaselines } from './anchors.ts';
import type {
  AnchorReport,
  Block,
  EnduranceSession,
  FamilyId,
  Intensity,
  Level,
  Range,
  ResolvedTarget,
  SessionNote,
  SessionTotals,
  Sport,
  Step,
} from './types.ts';

const METRES_PER_MILE = 1609.344;

/**
 * ⛔ THE FASTEST PERCENTAGE THE SPRINT FAMILY STATES ANYWHERE (140%, pp230-231), and it is used for
 * ONE purpose: turning a sprint rep's stated DISTANCE into a clock. Sprint paces are explicitly not
 * prescribed (p229 — "performance and RPE, as opposed to specific pacing"), so a sprint rep can only
 * be bounded, never predicted. Running the distance at the fastest percentage he names gives the
 * SHORTEST possible time, so the resulting clock can only be too small. Every step built this way is
 * flagged `secondsIsLowerBound`, and so is the session's total.
 */
const SPRINT_CLOCK_BOUND_PCT = 1.40;

export type SessionRequest = {
  family: FamilyId;
  level: Level;
  /**
   * 0 = the shortest dose the source's option set offers at this level, 1 = the longest.
   * ⛔ THIS IS THE ATHLETE-FACING DIAL, not the level (`DECISIONS-2026-08-21-standing-plan.md` §3d).
   */
  size?: number;
  /** Which structural shape. Defaults to the family's first, which is its plainest. */
  archetype?: string;
  /** Passed straight to the resolvers. Omit and every intensity comes back unresolved, honestly. */
  baselines?: EnduranceBaselines;
  /** Pre-resolved anchors, when the caller already has them (the wizard resolves once per athlete). */
  anchors?: EnduranceAnchors;
  /**
   * ⛔ A SHORT BLOCK HUNG ON THE END OF THIS SESSION — see `SESSION_ADD_ONS`. Today that is strides
   * on an easy or long run (p109), which is how running economy is trained without a fifth slot.
   *
   * ⚠️ IT COMES OUT OF THE SESSION'S OWN DOSE, NOT ON TOP. p109 describes a MULTIPURPOSE session,
   * and a bolted-on block would push the run past the band p235 prints for it.
   * ⚠️ AN ADD-ON THE FAMILY DOES NOT CARRY IS IGNORED, not an error: the composer asks per slot and
   * a slot the athlete moved to the bike simply has no strides on it.
   */
  addOn?: SessionAddOnId;
};

// ── small arithmetic ────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (band: Range, t: number) => band.lo + (band.hi - band.lo) * clamp(t, 0, 1);
/** The level's position inside a band: level 1 at the bottom, level 3 at the top. */
const levelT = (level: Level) => (level - 1) / 2;

// ── resolving an intensity against THIS athlete ─────────────────────────────────────────────────

/**
 * ⛔ ONE DIRECTION OF THE PACE ARITHMETIC, STATED ONCE. A percentage is percent of threshold SPEED
 * (p229), and pace is the reciprocal of speed — so a HIGHER percentage is a SMALLER sec/mi. Getting
 * this backwards produces a plausible number that prescribes the opposite workout, which is exactly
 * the class of defect this repo calls "the score that lies".
 */
function paceFromPct(thresholdSecPerMi: number, pct: number): number {
  return Math.round(thresholdSecPerMi / pct);
}

function resolveTarget(intensity: Intensity, sport: Sport, anchor: AnchorReport): ResolvedTarget {
  if (intensity.kind === 'drill') {
    return { unresolved: 'Technique work — no intensity target is prescribed.' };
  }

  if (sport === 'run') {
    const threshold = anchor.value;
    const vt1 = anchor.vt1SecPerMi ?? null;
    switch (intensity.kind) {
      case 'pct_threshold':
        if (threshold == null) return { unresolved: 'No run threshold pace on file yet.' };
        // hi percentage -> lo (faster) pace. The range is reported fastest-first.
        return { paceSecPerMi: { lo: paceFromPct(threshold, intensity.hi), hi: paceFromPct(threshold, intensity.lo) } };
      case 'vt1':
      case 'easy':
        if (vt1 == null) return { unresolved: 'No measured easy pace on file yet.' };
        return { paceSecPerMi: { lo: vt1, hi: vt1 } };
      case 'all_out':
        return { unresolved: 'All-out — the best speed available that day. No pace is prescribed.' };
      case 'faster_than_vvo2':
        return { unresolved: 'Faster than vVO2 — a pace region, not a percentage. Run it on feel.' };
      case 'race_pace':
        return { unresolved: 'Race pace — set by the race being trained for, not by this library.' };
      case 'below_pct':
        if (threshold == null) return { unresolved: 'No run threshold pace on file yet.' };
        return { paceSecPerMi: { lo: paceFromPct(threshold, intensity.hi), hi: paceFromPct(threshold, 0.01) } };
    }
  }

  if (sport === 'ride') {
    const ftp = anchor.value;
    switch (intensity.kind) {
      case 'pct_threshold':
        if (ftp == null) return { unresolved: 'No FTP on file yet.' };
        return { watts: { lo: Math.round(ftp * intensity.lo), hi: Math.round(ftp * intensity.hi) } };
      case 'below_pct':
        if (ftp == null) return { unresolved: 'No FTP on file yet.' };
        // "Below 75%" is a ceiling with no floor stated. Reported as a ceiling, not widened into a band.
        return { watts: { lo: 0, hi: Math.round(ftp * intensity.hi) } };
      /**
       * ⛔ VT1 ON THE BIKE HAS NO RESOLVER AND IS NOT GIVEN ONE. p239 does state the ceiling for easy
       * riding — "easy ride below 75%" — so a ride VT1 step resolves to that ceiling on his authority
       * rather than to a fraction someone picked.
       */
      case 'vt1':
        if (ftp == null) return { unresolved: 'No FTP on file yet.' };
        return { watts: { lo: 0, hi: Math.round(ftp * 0.75) } };
      case 'easy':
        // ⚠️ An easy spin has no power target on any cycling page. It stays unresolved rather than
        // borrowing this app's own warm-up convention, which is not the book's.
        return { unresolved: 'Easy spin — the cycling pages prescribe no power for it.' };
      case 'all_out':
        return { unresolved: 'Maximal effort. Each one tries to beat the last; no power is prescribed.' };
      case 'faster_than_vvo2':
      case 'race_pace':
        return { unresolved: 'No power target is prescribed for this step.' };
    }
  }

  // Swim. The pages carry no percentage notation at all, so only race pace resolves — to the
  // athlete's own swim pace, through the resolver that owns it.
  const per100 = anchor.value;
  switch (intensity.kind) {
    case 'race_pace':
      if (per100 == null) return { unresolved: 'No swim pace on file yet.' };
      return { swimSecPer100m: { lo: per100, hi: per100 } };
    case 'all_out':
      return { unresolved: 'All-out — no pace is prescribed for a sprint length.' };
    default:
      return { unresolved: 'Swim intensities here are prescribed in words, not numbers.' };
  }
}

/** Distance -> a clock, using whatever this athlete's own anchor says. Never a stored pace. */
function secondsForDistance(
  meters: number,
  sport: Sport,
  anchor: AnchorReport,
  pct: number | null,
): { seconds: number | null; fromDistance: boolean } {
  if (sport === 'run') {
    if (anchor.value == null || pct == null) return { seconds: null, fromDistance: false };
    return { seconds: Math.round((meters / METRES_PER_MILE) * paceFromPct(anchor.value, pct)), fromDistance: true };
  }
  if (sport === 'swim') {
    if (anchor.value == null) return { seconds: null, fromDistance: false };
    return { seconds: Math.round((meters / 100) * anchor.value), fromDistance: true };
  }
  return { seconds: null, fromDistance: false };
}

// ── step construction ───────────────────────────────────────────────────────────────────────────

function step(
  role: Step['role'],
  label: string,
  seconds: number | null,
  intensity: Intensity,
  sport: Sport,
  anchor: AnchorReport,
  extra?: Partial<Step>,
): Step {
  return {
    role,
    label,
    seconds: seconds == null ? null : Math.round(seconds),
    intensity,
    target: resolveTarget(intensity, sport, anchor),
    ...extra,
  };
}

/** The recovery step for one archetype, given the work rep it follows. */
function recoveryStep(a: Archetype, workSeconds: number, sport: Sport, anchor: AnchorReport): Step | null {
  const r = a.recovery;
  if (r.kind === 'open') {
    // ⛔ "Full recovery." The page states no duration; neither does this.
    return step('rest', 'Full recovery', null, { kind: 'easy' }, sport, anchor);
  }
  if (r.kind === 'stated') {
    // A stated band of zero is the source saying the reps run back to back. No step, not a 0-second one.
    if (r.band.lo === 0 && r.band.hi === 0) return null;
    return step('recovery', 'Recovery', lerp(r.band, 0.5), r.intensity, sport, anchor);
  }
  if (r.kind === 'proportional') {
    return step('recovery', 'Recovery', workSeconds * r.factor, r.intensity, sport, anchor);
  }
  // Ch.4's threshold shape: work/4, clamped to 30s-2min.
  const seconds = clamp(workSeconds / THRESHOLD_WORK_TO_REST, THRESHOLD_REST_MIN_SECONDS, THRESHOLD_REST_MAX_SECONDS);
  return step('recovery', 'Recovery', seconds, r.intensity, sport, anchor);
}

// ── the shapes ──────────────────────────────────────────────────────────────────────────────────

type BuildContext = {
  family: FamilyId;
  sport: Sport;
  level: Level;
  size: number;
  archetype: Archetype;
  anchor: AnchorReport;
  /** The dose target, in the band's own unit. */
  target: number;
  notes: SessionNote[];
};

/**
 * ⛔ REPS INTO SETS, WITHOUT LOSING REPS TO ROUNDING.
 *
 * The obvious version (`sets = round(reps / perSet)`) silently discards the remainder, and the
 * discard is not uniform across levels: sixteen reps at six a set became fifteen, while eighteen at
 * eight became sixteen. That made a level 2 VO2 session carry LESS work than level 1, which is his
 * ladder running backwards for no reason anyone would ever find by reading the code.
 *
 * ⛔ AND IT ROUNDS UP AT BOTH STEPS, WHICH IS THE HALF THAT MAKES THE SIZE DIAL MONOTONE. Rounding
 * to nearest at either step lets the rep total fall as the dial rises — nine reps in two sets became
 * ten, then ten reps in three sets became nine — so a session got SHORTER as the athlete asked for
 * more. Rounding up means the total is never below what was asked and never falls as the ask rises.
 */
function splitIntoSets(reps: number, perSetBand: Range, level: Level): { sets: number; perSet: number } {
  const nominal = Math.max(1, Math.round(lerp(perSetBand, levelT(level))));
  const sets = Math.max(1, Math.ceil(reps / nominal));
  return { sets, perSet: Math.max(1, Math.ceil(reps / sets)) };
}

/**
 * ⛔ Ch.4: *"intervals over 15 min become tempo/single efforts."* AND THAT IS A RECLASSIFICATION, NOT
 * A CEILING — which matters, because clipping every long rep to fifteen minutes deleted one of his
 * own sessions.
 *
 * p239 prescribes 20-minute repeats at 80% of threshold. Those are not intervals that got too long;
 * they are the tempo efforts Ch.4 is describing, and 80% is below threshold. So the clamp binds work
 * AT OR ABOVE threshold, where a rep over fifteen minutes really would be a mistake, and a longer
 * sub-threshold block is kept and labelled for what it is.
 *
 * ⚠️ Found by the ladder assertion: with the clamp applied to everything, a level 3 sweet-spot
 * session carried exactly as much work as level 1, because both had been clipped to the same
 * fifteen minutes.
 *
 * ⚠️ EXPORTED FOR THE SAME REASON `applyEasyBoutBounds` IS: no shape in the library currently
 * prescribes an above-threshold rep long enough to reach the clamp, so a test that only reads built
 * sessions cannot tell an enforced rule from a deleted one. Mutation-testing proved that too.
 */
export function applyTempoCrossover(
  seconds: number,
  work: Intensity,
): { seconds: number; isTempoEffort: boolean } {
  if (seconds <= TEMPO_CROSSOVER_SECONDS) return { seconds, isTempoEffort: false };
  const aboveThreshold = work.kind === 'pct_threshold' && work.lo >= 1.0;
  return aboveThreshold
    ? { seconds: TEMPO_CROSSOVER_SECONDS, isTempoEffort: false }
    : { seconds, isTempoEffort: true };
}

/**
 * ⛔ HOW MANY REPS, AND THE ONE RULE HERE THAT IS OURS.
 *
 * Where the shape states its own rep count (`repsBand`), the count comes from that band and the dose
 * band is not consulted — see the note on `repsBand` for why mixing them builds sessions nobody
 * wrote. **The position inside that band is `(level + size) / 2`, and THAT BLEND IS OURS.** His
 * tables scale a shape by rep length at one place and by rep count at another; averaging the two
 * dials reproduces the direction of both without claiming to reproduce either table. The bands
 * themselves are entirely his — a level-1 session at size 0 lands exactly on his lowest stated count,
 * and a level-3 session at size 1 on his highest.
 *
 * Where the shape states no rep count, the family's computed dose band divides by the rep.
 */
/**
 * ⛔⛔ HOW MANY REPEATS — DERIVED FROM THE WORK TARGET, NOT WALKED UP A SECOND AXIS (2026-08-27).
 *
 * ⛔ THE DEFECT. `repSeconds` climbs `repBand` with the LEVEL and this climbed `repsBand` with the
 * level AND the size, so both ends of the session grew together and the top of the dial produced
 * pairings no page prints. Measured on `run_near_threshold` level 3:
 *
 *     race_repeats     built 4 x 15 min      p234 prints 3 x 15 (marathon); four repeats
 *                                            only ever appear at five or eight minutes
 *     below_threshold  built 7 x 8:30        p234 prints "4 rounds of 8:30 @ 85%"
 *
 * ⛔ HIS OPTIONS ARE PAIRS. p234's race-specific level 3 reads 5K 4x5, 10K 4x8, half 3x12, marathon
 * 3x15 — as the repeat gets longer the count comes DOWN. Two independent bands cannot express that
 * and will always invent the both-at-the-top session.
 *
 * ⚠️ SO THE COUNT COMES FROM THE FAMILY'S OWN WORK BAND, which is sourced, and `repsBand` becomes a
 * CLAMP rather than a second dial: how much work this level asks for, divided by how long one
 * repeat is. A longer repeat now yields fewer of them, which is the shape of his table.
 *
 * ⚠️ AND IT IS NOT A PROMISE OF VERBATIM REPRODUCTION. This library models a family as a SHAPE
 * inside his bands — `EnduranceSession.archetype` says so in as many words: *"Not one of his
 * workouts — a shape."* Five rounds of 8:30 is inside his level-3 work band and is not a line on
 * p234. What this removes is the combination that is outside anything he pairs, not every session
 * he does not print.
 */
function repCount(a: Archetype, ctx: BuildContext, workPerRep: number): number {
  const derived = Math.max(1, Math.round(ctx.target / Math.max(1, workPerRep)));
  /**
   * ⛔⛔ THE LEVEL'S OWN COUNT WINS WHERE THE SOURCE GIVES ONE (2026-08-31) — see `repsByLevel`. The
   * count is DOSE-derived and was clamped only to the family-wide span, so a level-2 session with a
   * high dose took the level-3 count. This clamps to the level's range first.
   */
  const perLevel = a.repsByLevel?.[ctx.level];
  if (perLevel) return Math.min(perLevel.hi, Math.max(perLevel.lo, derived));
  if (!a.repsBand) return derived;
  return Math.min(a.repsBand.hi, Math.max(a.repsBand.lo, derived));
}

function buildIntervals(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  const workFloor = FAMILIES[ctx.family].workFloorPct;

  // ⛔ THE LEVEL SETS THE REP LENGTH INSIDE THE FAMILY'S OWN BAND. That is the pattern his tables
  // move on — anaerobic 45s / 60s / 90s, VO2 3 / 4 / 5 minutes, sweet spot 6 / 6 / 8 minutes — so
  // the rule reproduces the shape of the progression without carrying the tables.
  let repSeconds = Math.round(lerp(a.repBand, levelT(ctx.level)));

  const crossover = applyTempoCrossover(repSeconds, a.work);
  repSeconds = crossover.seconds;
  if (crossover.isTempoEffort) {
    ctx.notes.push({
      kind: 'source',
      text: 'Each effort here runs past fifteen minutes, so it is a tempo effort rather than an '
        + 'interval — ridden as one sustained block, not as a repeat.',
      cite: 'Viada p107 and p239',
    });
  }

  const floatSeconds = a.float ? Math.round(lerp(a.float.band, levelT(ctx.level))) : 0;
  const floatCountsAsWork = a.float
    ? a.float.intensity.kind === 'pct_threshold' && a.float.intensity.lo >= workFloor
    : false;
  const floatInside = a.float?.insideRep === true;

  // How much work one repeat contributes. An `insideRep` segment is already inside `repSeconds`.
  const workPerRep = repSeconds + (a.float && !floatInside && floatCountsAsWork ? floatSeconds : 0);
  const reps = repCount(a, ctx, workPerRep);

  const workLabel = a.float && !floatInside ? 'Surge' : 'Work';
  /**
   * ⛔⛔ A PROGRESSIVE SHAPE RISES ACROSS ITS REPEATS — see `Archetype.progressive`. Rep `i` of `n`
   * sits at its own point in the band instead of every rep carrying the whole band, which the plan
   * token then collapsed to the top. ⚠️ The first rep is the band's floor and the last is its top,
   * which is what "start here and progress to there by the end" means.
   */
  const workAt = (i: number, n: number): Intensity => {
    if (!a.progressive || a.work.kind !== 'pct_threshold' || n < 2) return a.work;
    const at = a.work.lo + (a.work.hi - a.work.lo) * (i / (n - 1));
    return { kind: 'pct_threshold', lo: Math.round(at * 100) / 100, hi: Math.round(at * 100) / 100 };
  };
  const mkRepeat = (i = 0, n = 1): Step[] => {
    const steps: Step[] = [];
    // A standing start has no stated duration; its step carries a null clock rather than a guess.
    steps.push(step('work', workLabel, repSeconds > 0 ? repSeconds : null, workAt(i, n), sport, anchor));
    if (a.float && !floatInside) {
      steps.push(step(floatCountsAsWork ? 'work' : 'float', a.float.label, floatSeconds, a.float.intensity, sport, anchor));
    }
    return steps;
  };

  const rest = recoveryStep(a, repSeconds, sport, anchor);

  if (a.set) {
    const { sets, perSet } = splitIntoSets(reps, a.set.repeatsPerSet, ctx.level);
    const inner: Step[] = [];
    for (let i = 0; i < perSet; i++) {
      inner.push(...mkRepeat(i, perSet));
      if (rest && i < perSet - 1) inner.push({ ...rest });
    }
    return [{
      repeat: sets,
      label: `${sets} x ${perSet} ${a.label.toLowerCase()}`,
      steps: inner,
      restBetween: step('recovery', 'Between sets', lerp(a.set.restBand, 0.5), a.set.intensity, sport, anchor),
    }];
  }

  /**
   * ⛔ A PROGRESSIVE SHAPE CANNOT RIDE ON `repeat`, because `repeat` replays ONE set of steps — every
   * repeat would carry the same intensity, which is the thing being fixed. It is written out
   * instead, rep by rep, with its own recovery between. ⚠️ Only when `progressive` is set; every
   * other shape keeps the compact `repeat` form the rest of the pipeline expects.
   */
  if (a.progressive && reps > 1) {
    const laid: Step[] = [];
    for (let i = 0; i < reps; i++) {
      laid.push(...mkRepeat(i, reps));
      if (rest && i < reps - 1) laid.push({ ...rest });
    }
    return [{ repeat: 1, label: `${reps} x ${a.label.toLowerCase()}`, steps: laid, restBetween: null }];
  }

  const inner = mkRepeat();
  return [{
    repeat: reps,
    label: `${reps} x ${a.label.toLowerCase()}`,
    steps: inner,
    restBetween: rest,
  }];
}

function buildDistanceIntervals(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  const repMeters = Math.max(25, Math.round(lerp(a.repBand, levelT(ctx.level)) / 25) * 25);
  const reps = repCount(a, ctx, repMeters);

  const pctForClock = a.work.kind === 'pct_threshold'
    ? a.work.hi
    : sport === 'run' ? SPRINT_CLOCK_BOUND_PCT : null;
  const isBound = sport === 'run' && a.work.kind !== 'pct_threshold';
  const { seconds, fromDistance } = secondsForDistance(repMeters, sport, anchor, pctForClock);

  const work = step('work', `${repMeters} m`, seconds, a.work, sport, anchor, {
    meters: repMeters,
    secondsFromDistance: fromDistance || undefined,
    secondsIsLowerBound: (fromDistance && isBound) || undefined,
  });

  const rest = recoveryStep(a, seconds ?? 0, sport, anchor);

  if (a.set) {
    const { sets, perSet } = splitIntoSets(reps, a.set.repeatsPerSet, ctx.level);
    const inner: Step[] = [];
    for (let i = 0; i < perSet; i++) {
      inner.push({ ...work });
      if (rest && i < perSet - 1) inner.push({ ...rest });
    }
    return [{
      repeat: sets,
      label: `${sets} x ${perSet} x ${repMeters} m`,
      steps: inner,
      restBetween: step('recovery', 'Between sets', lerp(a.set.restBand, 0.5), a.set.intensity, sport, anchor),
    }];
  }

  return [{ repeat: reps, label: `${reps} x ${repMeters} m`, steps: [work], restBetween: rest }];
}

/**
 * ⛔ THE FLOOR AND THE CAP ON A CONTINUOUS EASY BOUT — one function, because both continuous shapes
 * build one and a rule enforced in one of two places is a rule that is half enforced.
 *
 * ⚠️ EXPORTED SO THE RULE CAN BE TESTED DIRECTLY, and that is not tidiness. Mutation-testing showed
 * that NO session this library builds comes near the ten-minute floor — his shortest stated easy
 * session is a 25-minute VT1 run — so a test that only inspects built sessions cannot tell whether
 * the floor is enforced or has been deleted. The floor stays because it is a real rule and the next
 * caller may reach it; the direct test is what proves it still works.
 *
 * Floor: a VT1 bout under ~10 minutes does not trigger an adaptation (Ch.4).
 * Cap: rarely more than ~2h of VT1 in one session (Ch.4).
 *
 * ⛔ TWO EXEMPTIONS, BOTH HIS AND NEITHER OURS.
 *
 *   The hike: p235 permits pauses in it and runs it to five hours for ultrarunners.
 *   The endurance ride: p239 prescribes 2.5-3.5 hours at level 2 and 3.5-5 at level 3, outright.
 *
 * Ch.4 and those two pages are both his, and they disagree. Where he prescribes a specific longer
 * session BY NAME, the specific prescription wins and the session carries a note saying the general
 * guidance was exceeded — rather than the library silently clipping a five-hour ride to two hours
 * and telling the athlete nothing.
 */
export function applyEasyBoutBounds(
  seconds: number,
  exempt: boolean,
): { seconds: number; exceedsGuidance: boolean } {
  const floored = Math.max(seconds, VT1_BOUT_FLOOR_SECONDS);
  if (!exempt) return { seconds: Math.min(floored, VT1_CONTINUOUS_CAP_SECONDS), exceedsGuidance: false };
  return { seconds: floored, exceedsGuidance: floored > VT1_CONTINUOUS_CAP_SECONDS };
}

function boundEasyBout(ctx: BuildContext, seconds: number, archetypeId: string): number {
  const exempt = archetypeId === 'hike' || ctx.family === 'ride_endurance';
  const { seconds: out, exceedsGuidance } = applyEasyBoutBounds(seconds, exempt);
  if (exceedsGuidance) {
    ctx.notes.push({
      kind: 'source',
      text: 'Longer than the roughly two hours of easy work Chapter 4 suggests for one session. This '
        + 'session type is prescribed at this length by name, and easy work of this kind tolerates pauses.',
      cite: archetypeId === 'hike' ? 'Viada p107 and p235' : 'Viada p107 and p239',
    });
  }
  return out;
}

function buildContinuous(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  let seconds = ctx.target;
  if (a.work.kind === 'vt1' || a.work.kind === 'below_pct') seconds = boundEasyBout(ctx, seconds, a.id);

  const one = step('work', a.label, seconds, a.work, sport, anchor);
  return [{ repeat: 1, label: a.label, steps: [one], restBetween: null }];
}

function buildContinuousWithInserts(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  const share = a.insertShare ?? 0;
  const insertTotal = Math.round(ctx.target * share);
  const repSeconds = Math.max(1, Math.round(lerp(a.repBand, levelT(ctx.level))));
  const floatSeconds = a.float ? Math.round(lerp(a.float.band, levelT(ctx.level))) : 0;
  const inserts = Math.max(1, Math.round(insertTotal / (repSeconds + floatSeconds)));

  // The steady portion is whatever the inserts do not take.
  const rest = recoveryStep(a, repSeconds, sport, anchor);
  const insertSteps: Step[] = [step('work', a.label, repSeconds, a.work, sport, anchor)];
  if (a.float) insertSteps.push(step('float', a.float.label, floatSeconds, a.float.intensity, sport, anchor));

  /**
   * ⛔ THE INSERTS COME OUT OF THE SESSION, NOT ON TOP OF IT — their recoveries included. p235 is
   * explicit that the sets are added *into* the run ("a 1-hour VT1 run with 2 sets added at any
   * point"), so a session that spent its target on steady running and then appended the inserts and
   * their recoveries would be longer than the length it was asked for. That is the ask-15-get-20
   * defect, and it is the one thing this library exists partly to make impossible.
   */
  const insertBlockSeconds =
    inserts * (repSeconds + floatSeconds) + Math.max(0, inserts - 1) * (rest?.seconds ?? 0);
  const steadyIntensity: Intensity = sport === 'ride' ? { kind: 'below_pct', hi: 0.75 } : { kind: 'vt1' };
  // ⛔ THE SAME FLOOR AND CAP AS A PLAIN BOUT. An LSD run with sets inserted into it is still a
  // continuous VT1 run, and Chapter 4's two-hour figure binds it; only the hike is exempt.
  const steadySeconds = boundEasyBout(ctx, ctx.target - insertBlockSeconds, a.id);

  return [
    {
      repeat: 1,
      // ⛔ THE BLOCK AND STEP NAMES FOLLOW THE ARCHETYPE'S (2026-08-25) — the same double-naming
      // trap `Cut-downs` had: the menu said one word and the built workout said the book's.
      // ⚠️ `{ kind: 'vt1' }` BELOW IS AN INTENSITY ANCHOR, NOT A DISPLAY STRING, and stays.
      label: sport === 'ride' ? 'Steady endurance' : 'Steady easy',
      steps: [step('work', sport === 'ride' ? 'Steady' : 'Easy', steadySeconds, steadyIntensity, sport, anchor)],
      restBetween: null,
    },
    {
      repeat: inserts,
      label: `${inserts} x ${a.label.toLowerCase()}, inserted at any point`,
      steps: insertSteps,
      restBetween: rest,
    },
  ];
}

function buildContinuousWithFinish(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  const finishSeconds = Math.round(lerp(a.repBand, levelT(ctx.level)));
  const steadySeconds = boundEasyBout(ctx, ctx.target - finishSeconds, a.id);
  return [
    {
      repeat: 1,
      label: 'Steady easy',
      steps: [step('work', 'Easy', steadySeconds, { kind: 'vt1' }, sport, anchor)],
      restBetween: null,
    },
    {
      repeat: 1,
      label: a.label,
      steps: [step('work', 'Finish', finishSeconds, a.work, sport, anchor)],
      restBetween: null,
    },
  ];
}

function buildDescending(ctx: BuildContext): Block[] {
  const { archetype: a, sport, anchor } = ctx;
  /**
   * The ladder steps down from the top of the band to the bottom. The number of rungs is whatever
   * the dose target buys at the band's own mean rep — so a bigger dose gets a longer ladder rather
   * than a different one.
   */
  /**
   * ⛔⛔ THE SOURCE'S OWN RUNGS WHERE IT GIVES THEM — see `Archetype.ladderByLevel`. The fallback
   * below is the old even interpolation, kept for any descending shape that states no sequence.
   */
  const rounds = a.ladderByLevel?.[ctx.level];
  const steps: Step[] = [];
  if (rounds && rounds.length > 0) {
    rounds.forEach((round, r) => {
      round.forEach((work, i) => {
        steps.push(step('work', `Rung ${i + 1}`, work, a.work, sport, anchor));
        const rest = recoveryStep(a, work, sport, anchor);
        // ⚠️ THE LAST RUNG OF THE LAST ROUND ENDS THE BLOCK — no trailing recovery into the cooldown.
        if (rest && !(r === rounds.length - 1 && i === round.length - 1)) steps.push(rest);
      });
      if (r < rounds.length - 1 && a.ladderRoundRest) {
        steps.push(step('recovery', 'Between rounds', a.ladderRoundRest, { kind: 'easy' }, sport, anchor));
      }
    });
    const rungCount = rounds.reduce((t, x) => t + x.length, 0);
    return [{ repeat: 1, label: `Cut-downs, ${rungCount} rungs`, steps, restBetween: null }];
  }
  const meanRep = (a.repBand.lo + a.repBand.hi) / 2;
  const rungs = clamp(Math.round(ctx.target / meanRep), 2, 12);
  for (let i = 0; i < rungs; i++) {
    const t = rungs === 1 ? 0 : i / (rungs - 1);
    const work = Math.round(a.repBand.hi - (a.repBand.hi - a.repBand.lo) * t);
    steps.push(step('work', `Rung ${i + 1}`, work, a.work, sport, anchor));
    const rest = recoveryStep(a, work, sport, anchor);
    if (rest && i < rungs - 1) steps.push(rest);
  }
  // ⚠️ THE BLOCK LABEL FOLLOWS THE ARCHETYPE'S (2026-08-25). It is the same session named twice —
  // the menu said "Cut-downs" and the built workout said "Descending ladder, 5 rungs".
  return [{ repeat: 1, label: `Cut-downs, ${rungs} rungs`, steps, restBetween: null }];
}

// ── totals ──────────────────────────────────────────────────────────────────────────────────────

function totalsFor(warmup: Step[], blocks: Block[], cooldown: Step[], workFloorPct: number): SessionTotals {
  let clocked = 0;
  let work = 0;
  let rest = 0;
  let open = 0;
  let meters = 0;
  let derived = false;

  const isWork = (s: Step) => {
    if (s.role !== 'work') return false;
    const i = s.intensity;
    if (i.kind === 'pct_threshold') return i.lo >= workFloorPct;
    // vt1 / below_pct / all_out / faster_than_vvo2 / race_pace all count where the family's floor is
    // zero (the endurance and swim families), and all_out / faster_than_vvo2 count everywhere —
    // a maximal effort is above any floor by definition.
    if (i.kind === 'all_out' || i.kind === 'faster_than_vvo2') return true;
    return workFloorPct === 0;
  };

  const account = (s: Step) => {
    if (s.meters) meters += s.meters;
    if (s.secondsFromDistance) derived = true;
    if (s.seconds == null) {
      if (s.role === 'rest' || s.role === 'recovery') open += 1;
      return;
    }
    clocked += s.seconds;
    if (isWork(s)) work += s.seconds;
    else if (s.role === 'recovery' || s.role === 'float' || s.role === 'work') rest += s.seconds;
  };

  for (const s of warmup) account(s);
  for (const b of blocks) {
    for (let r = 0; r < b.repeat; r++) {
      for (const s of b.steps) account(s);
      if (b.restBetween && r < b.repeat - 1) account(b.restBetween);
    }
  }
  for (const s of cooldown) account(s);

  return {
    basis: 'computed',
    clockedSeconds: clocked,
    workSeconds: work,
    restSeconds: rest,
    openRecoveryCount: open,
    meters: meters || null,
    isLowerBound: open > 0 || derived,
  };
}

/**
 * ⛔ THE ADD-ON BLOCK — real steps, so it reaches the watch.
 *
 * ⛔⛔ MICHAEL'S ONE HARD CONSTRAINT: *"make sure however we do the strides they make it onto
 * garmin."* The watch builder reads the planned workout's INTERVALS; anything that lives only in a
 * description or a note never leaves the phone. So this is a block of steps like any other, and the
 * edge emits a token for it — it is never a sentence appended to the session text.
 *
 * ⚠️ NO PACE TARGET, AND THAT IS HIS (p229). *"All-out"* resolves to nothing in this library by
 * design, so the step carries `unresolved` rather than an invented number.
 * ⚠️ FULL RECOVERY BETWEEN, ALSO HIS — `run_sprint_power`'s own `open` recovery, which states no
 * duration. That makes the session's total a lower bound, which is true and is said on the card.
 */
function addOnBlock(
  id: SessionAddOnId,
  ctx: { family: FamilyId; sport: Sport; size: number; anchor: AnchorReport; notes: SessionNote[] },
): Block | null {
  const spec = SESSION_ADD_ONS[id];
  if (!spec) return null;
  if (spec.sport !== ctx.sport || !spec.families.includes(ctx.family)) return null;
  // ⚠️ THE DOSE SCALES WITH THE SESSION'S OWN SIZE — a longer easy day carries a few more. Both ends
  // are ours (`STRIDES_DOSE_IS_OURS`); the page gives no dose for a stride at all.
  const reps = Math.round(lerp(spec.reps, ctx.size));
  const seconds = Math.round(lerp(spec.secondsPerRep, ctx.size) / 5) * 5;
  const work = step('work', spec.label.replace(/s$/, ''), seconds, spec.work, ctx.sport, ctx.anchor);
  const rest = step('rest', 'Full recovery', null, { kind: 'easy' }, ctx.sport, ctx.anchor);
  ctx.notes.push({ kind: 'source', text: STRIDES_NOTE, cite: spec.cite });
  ctx.notes.push({ kind: 'ours', text: STRIDES_DOSE_IS_OURS });
  return {
    repeat: reps,
    label: `${reps} x ${seconds}s ${spec.label.toLowerCase()}`,
    steps: [work],
    restBetween: rest,
    addOn: spec.id,
  };
}

// ── the public entry point ──────────────────────────────────────────────────────────────────────

export function buildEnduranceSession(req: SessionRequest): EnduranceSession {
  const familyRules = FAMILIES[req.family];
  if (!familyRules) throw new Error(`unknown endurance family: ${req.family}`);

  // ⚠️ A shape the source does not offer at this level is not offered here either.
  const offered = familyRules.archetypes.filter((a) => !a.levels || a.levels.includes(req.level));
  if (offered.length === 0) throw new Error(`no archetype for ${req.family} at level ${req.level}`);
  const archetype = req.archetype ? offered.find((a) => a.id === req.archetype) : offered[0];
  if (!archetype) {
    throw new Error(`archetype ${req.archetype} is not offered for ${req.family} at level ${req.level}`);
  }

  const size = clamp(req.size ?? 0.5, 0, 1);
  const anchors = req.anchors ?? (req.baselines !== undefined ? resolveEnduranceAnchors(req.baselines) : UNKNOWN_ANCHORS);
  const sport = familyRules.sport;
  const anchor = anchorFor(anchors, sport);

  const band = WORK_BANDS[req.family][req.level];
  const notes: SessionNote[] = [];

  // ⛔ SWIM: the band is the whole session's DISTANCE, and the opener takes its computed share.
  const isPoolSwim = band.unit === 'meters' && sport === 'swim';
  const wrapper = WRAPPERS[req.family];

  /** One pass at the session, at a fraction of the level's dose. Everything but the swim ceiling
   *  below calls this exactly once, at 1. */
  const attempt = (scale: number) => {
    const full = lerp({ lo: band.lo, hi: band.hi }, size) * scale;
    const openerMeters = isPoolSwim ? full * SWIM_OPENER_SHARE : 0;
    const scoped: SessionNote[] = [];
    /**
     * ⛔⛔ THE ADD-ON IS BUILT FIRST, AND ITS CLOCK COMES OUT OF THE SESSION'S DOSE. p109 describes a
     * MULTIPURPOSE session — the strides are part of the easy run, not an extension of it — and a
     * block added on top would push the run past the band p235 prints for its level, which is the
     * thing p275 forbids from the other direction.
     * ⚠️ ONLY THE WORK SECONDS ARE SUBTRACTED, because the recoveries between strides are his "full
     * recovery" and carry no stated duration. The session's total is a lower bound and says so.
     */
    const added = req.addOn
      ? addOnBlock(req.addOn, { family: req.family, sport, size, anchor, notes: scoped })
      : null;
    const addedSeconds = added
      ? added.repeat * added.steps.reduce((t, st) => t + (st.seconds ?? 0), 0)
      : 0;
    const target = Math.max(0, full - openerMeters - addedSeconds);
    const ctx: BuildContext = { family: req.family, sport, level: req.level, size, archetype, anchor, target, notes: scoped };

    let blocks: Block[];
    switch (archetype.shape) {
      case 'intervals': blocks = buildIntervals(ctx); break;
      case 'distance_intervals': blocks = buildDistanceIntervals(ctx); break;
      case 'continuous': blocks = buildContinuous(ctx); break;
      case 'continuous_with_inserts': blocks = buildContinuousWithInserts(ctx); break;
      case 'continuous_with_finish': blocks = buildContinuousWithFinish(ctx); break;
      case 'descending': blocks = buildDescending(ctx); break;
    }

    const warmup: Step[] = wrapper.warmup.map((w) => step('warmup', w.label, w.seconds, w.intensity, sport, anchor));
    const cooldown: Step[] = wrapper.cooldown.map((c) => step('cooldown', c.label, c.seconds, c.intensity, sport, anchor));

    // The swim opener IS the warm-up (pp240-241 print no box), and it is built with a distance.
    if (openerMeters > 0) {
      const per = Math.max(50, Math.round(openerMeters / SWIM_DRILLS.length / 50) * 50);
      for (const name of SWIM_DRILLS) {
        const { seconds, fromDistance } = secondsForDistance(per, sport, anchor, null);
        warmup.push(step('drill', `${per} m ${name.toLowerCase()}`, seconds, { kind: 'drill' }, sport, anchor, {
          meters: per,
          secondsFromDistance: fromDistance || undefined,
        }));
      }
      scoped.push({
        kind: 'computed',
        text: 'The drill opener takes 15% of the session, which is the mean share across the source\'s own pool sessions.',
        cite: 'computed from Viada p241',
      });
    }

    // ⛔ THE ADD-ON GOES LAST, BEFORE THE COOLDOWN. p109: *"before, during, or after"* — the end of
    // the session is where a stride block belongs on an easy day, and it is where every field
    // program puts it.
    const withAddOn = added ? [...blocks, added] : blocks;
    return {
      blocks: withAddOn,
      warmup,
      cooldown,
      scoped,
      totals: totalsFor(warmup, withAddOn, cooldown, familyRules.workFloorPct),
    };
  };

  let built = attempt(1);
  /**
   * ⛔ THE SWIM CEILING, AND WHY IT SHORTENS THE DISTANCE RATHER THAN CLIPPING THE CLOCK. A pool
   * session is prescribed in metres and its duration is entirely the athlete's own pace, so a slow
   * swimmer's level 3 session runs to hours. p240 gives both halves of the answer: level 3 is a
   * 1.5-hour session, and *"changes to distances and interval length can be modified tremendously"*.
   * So the distance comes down until the session fits, and the athlete is told that it did.
   */
  if (isPoolSwim && built.totals.clockedSeconds > SWIM_SESSION_CEILING_SECONDS) {
    let scale = 1;
    for (let i = 0; i < 6 && built.totals.clockedSeconds > SWIM_SESSION_CEILING_SECONDS; i++) {
      scale *= (SWIM_SESSION_CEILING_SECONDS / built.totals.clockedSeconds) * 0.98;
      built = attempt(scale);
    }
    built.scoped.push({
      kind: 'source',
      text: 'The distance is shorter than the level\'s full prescription so the session fits inside the '
        + 'hour and a half a level 3 swim is stated to take. Distances and interval lengths are '
        + 'explicitly open to modification.',
      cite: 'Viada p240',
    });
  }

  const { blocks, warmup, cooldown, totals } = built;
  notes.push(...built.scoped);

  // ── the notes that must travel with every session ─────────────────────────────────────────────
  notes.push({ kind: 'source', text: familyRules.intent, cite: familyRules.cite });
  notes.push({
    kind: 'computed',
    text: 'The session total is computed from the steps here. The source gives intervals, warm-ups and '
      + 'cooldowns and never a total.',
    cite: band.cite,
  });
  if (totals.isLowerBound) {
    notes.push({
      kind: 'computed',
      text: totals.openRecoveryCount > 0
        ? 'At least this long. Some recoveries are "full recovery" and carry no stated duration.'
        : 'At least approximately this long. Some steps are prescribed as distance and clocked from '
          + 'your own threshold.',
    });
  }
  if (sport === 'ride' && !PERCENT_BASIS.ride.stated) {
    notes.push({ kind: 'inferred', text: INFERRED_CYCLING_BASIS_NOTE, cite: PERCENT_BASIS.ride.cite });
  }
  if (req.family === 'run_sprint_power') notes.push({ kind: 'source', text: SPRINT_PACING_NOTE, cite: 'Viada p229' });
  if (req.family === 'ride_anaerobic') notes.push({ kind: 'source', text: POWER_FLOOR_NOTE, cite: 'Viada p237' });
  if (req.family === 'ride_endurance') notes.push({ kind: 'source', text: FORM_FOCUS_NOTE, cite: 'Viada p239' });
  if (req.family === 'run_vt1') notes.push({ kind: 'source', text: TALK_TEST_NOTE, cite: 'Viada p235' });
  if (req.family === 'swim_open_water') {
    notes.push({ kind: 'source', text: OPEN_WATER_TIMER_NOTE, cite: 'Viada p240' });
    if (req.level === 3) notes.push({ kind: 'safety', text: OPEN_WATER_SAFETY_NOTE, cite: 'Viada p241' });
  }
  /**
   * ⛔ THE TERMINATION RULE GOES ON EVERY EASY AND LONG SESSION, because it is the one instruction
   * the athlete has to be able to act on mid-session. It is not a monitoring number.
   */
  if (familyRules.workFloorPct === 0 && sport !== 'swim') {
    notes.push({ kind: 'safety', text: CARDIAC_DRIFT_NOTE, cite: 'Viada p107' });
  }
  if (anchor.value == null) {
    notes.push({
      kind: 'source',
      text: 'No threshold on file for this sport yet, so the targets are unresolved. The structure '
        + 'stands; the numbers arrive when the baseline does.',
    });
  } else if (anchor.isEstimate) {
    notes.push({ kind: 'inferred', text: 'The threshold behind these targets is an estimate, not a measurement.' });
  }

  return {
    family: req.family,
    sport,
    level: req.level,
    archetype: archetype.id,
    size,
    warmup,
    blocks,
    cooldown,
    totals,
    workToRest: {
      workSeconds: totals.workSeconds,
      restSeconds: totals.restSeconds,
      ratio: totals.restSeconds > 0 ? totals.workSeconds / totals.restSeconds : null,
    },
    anchor,
    notes,
  };
}

// ── the size band, which is what the wizard reads ───────────────────────────────────────────────

/**
 * ⛔ THE SLOT'S FLOOR AND CAP, AND THE REASON THIS LIBRARY HAS TO RUN ON THE CLIENT.
 *
 * §3c/§3d of the decisions doc: the athlete's size control is bounded at both ends by what the slots
 * can actually deliver, and **the cap moves with the sport mix.** Summing the longest option in every
 * slot has to happen as the athlete taps, so it cannot be a server round-trip.
 *
 * ⚠️ THE NUMBERS ARE COMPUTED FROM THE BUILT SESSIONS, not from the bands — the wrapper, the floors
 * and the caps all move a session's length, and a cap computed from the dose band alone would be the
 * ask-15-get-20 defect in a new place.
 */
export function sessionDurationBandSeconds(
  family: FamilyId,
  level: Level,
  opts?: { baselines?: EnduranceBaselines; anchors?: EnduranceAnchors; archetype?: string },
): { shortest: number; longest: number; isLowerBound: boolean } {
  const anchors = opts?.anchors ?? (opts?.baselines !== undefined ? resolveEnduranceAnchors(opts.baselines) : UNKNOWN_ANCHORS);
  /**
   * ⛔ EVERY SHAPE THE LEVEL OFFERS, NOT JUST THE DEFAULT. §3d: *"the range comes from the three or
   * four alternative workouts each session type offers at a given level"* — so a cap taken from one
   * shape is the ask-15-get-20 defect wearing a different hat. Scanning them all is also why this
   * has to run on the client: the sum moves every time the athlete changes their sport mix.
   */
  const ids = opts?.archetype ? [opts.archetype] : archetypesFor(family, level).map((a) => a.id);
  let shortest = Infinity;
  let longest = 0;
  let isLowerBound = false;
  for (const archetype of ids) {
    for (const size of [0, 1]) {
      const t = buildEnduranceSession({ family, level, size, archetype, anchors }).totals;
      shortest = Math.min(shortest, t.clockedSeconds);
      longest = Math.max(longest, t.clockedSeconds);
      isLowerBound = isLowerBound || t.isLowerBound;
    }
  }
  return { shortest, longest, isLowerBound };
}

/** Every archetype a family offers — at a level, when one is given, because the source varies. */
export function archetypesFor(family: FamilyId, level?: Level): { id: string; label: string; cite: string }[] {
  return FAMILIES[family].archetypes
    .filter((a) => level === undefined || !a.levels || a.levels.includes(level))
    .map((a) => ({ id: a.id, label: a.label, cite: a.cite }));
}

export const ALL_FAMILIES = Object.keys(FAMILIES) as FamilyId[];
export const ALL_LEVELS: Level[] = [1, 2, 3];
