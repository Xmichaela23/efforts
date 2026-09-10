/**
 * ═══ ONE LINE OF GOOD NEWS ON A DONE SESSION ════════════════════════════════════════════════════
 *
 * docs/WORKORDER-booms-2026-09-09.md. Michael: *"a little achievement dopamine thingy … a ride or
 * run or even a lift, just a little booms."*
 *
 * ⛔ ONE LINE, THE FIRST TRUE ONE IN THE ORDER THE WORK ORDER WRITES, AND NOTHING WHEN NONE IS TRUE.
 * No badge, no trophy, no colour, no streak counter. A fact, in the app's flat voice.
 *
 * ⛔⛔ EVERY LINE IS VERBATIM FROM THE WORK ORDER. They were approved as written (Michael,
 * 2026-09-09); the only things this file supplies are the numbers and names inside the brackets. ⚠️ A
 * line whose words are not in that document does not go here — it goes back to him first.
 *
 * ⛔ AND NOT ONE MEASUREMENT IS MADE HERE. Every input is a value some other owner already computed
 * and stored:
 *   · the power curve      → `computed.power_curve` (`compute-workout-analysis:calculatePowerCurve`),
 *                            indexed by `POWER_CURVE_DURATIONS`, the labels `bike-ftp-estimator`
 *                            already reads it by.
 *   · heart rate at easy power → `workout_analysis.bike_fitness_v1.hr_at_band`, the ride card's own
 *                            read, with the ride card's own `counts_toward_trend` gate.
 *   · drift                → `session_detail_v1.classification.decoupling.pct`, what the Drift tile
 *                            prints, against p107's 5 per cent.
 *   · the ME set ladder    → the coach payload's `me_history_v1` outcomes, replayed through
 *                            `meSetsFromHistory` — the ladder's own function, not a copy of its rule.
 *   · the lifts themselves → `exercise_log`, one row per lift per session.
 * A second reader for any of these is how two screens start disagreeing about one number.
 *
 * ⚠️ RUN LINES 1 AND 2 ARE NOT HERE. They need grade-adjusted best efforts, which is spec only
 * (`docs/DESIGN-best-efforts.md`) and was explicitly NOT in scope. Run lines 3 and 4 are the same
 * reads as the ride's and are built.
 */
import { POWER_CURVE_DURATIONS } from './bike-ftp-estimator';
/** ⚠️ RELATIVE, NOT `@/` — `deno.json` maps `@shared/` and nothing else, and this file has a
 *  fixture (`session-boom.test.ts`) that must run outside Vite. */
import { resolveMovingSeconds } from '../utils/resolveMovingSeconds';
import { meSetsFromHistory } from '@shared/standing-plan/progression';
import type { MeSessionOutcome } from '@shared/standing-plan/progression';
/** ⚠️ THE BAND LIVES WITH THE COMPOSER, not the ladder — `compose.ts` owns "how many sets is an ME
 *  slot", and the ladder is handed it. Importing it from anywhere else would be a second answer. */
import { ME_SETS_BAND } from '@shared/standing-plan/compose';

/** A completed session, as `get-week` and the workouts table carry it. */
export type BoomWorkout = {
  id?: string | null;
  date?: string | null;
  type?: string | null;
  workout_status?: string | null;
  week_number?: number | null;
  computed?: Record<string, unknown> | null;
  workout_analysis?: unknown;
  strength_exercises?: unknown;
  executed?: { strength_exercises?: unknown } | null;
};

export type MeHistoryEntry = {
  week: number;
  day: string;
  movement: string;
  outcome: string;
  bar?: string;
  barOffsetLb?: number;
};

/** One `exercise_log` row, the columns this file reads and no others. */
export type BoomExerciseLogRow = {
  date?: string | null;
  workout_id?: string | null;
  canonical_name?: string | null;
  exercise_name?: string | null;
  slot_intent?: string | null;
  sets_completed?: number | null;
};

export type BoomInput = {
  /** The session just finished. */
  workout: BoomWorkout;
  /**
   * Earlier COMPLETED sessions of the same discipline, most recent first, inside the window.
   * ⚠️ THE CALLER FETCHES THESE. This file makes no queries: a pure function is the only version of
   * this that can be tested against a seeded week without a database.
   */
  prior: BoomWorkout[];
  /** The block's first day, when there is a block. Absent falls the window back to this year. */
  blockStartISO?: string | null;
  /** `me_history_v1.history` off the coach payload — the ladder's own walk. */
  meHistory?: Partial<Record<string, MeHistoryEntry[]>> | null;
  /** `me_history_v1.at_weight`. Read WITH the history or not at all (it is one reading). */
  meAtWeight?: Partial<Record<string, number>> | null;
  /** `exercise_log` rows for this session. */
  logToday?: BoomExerciseLogRow[] | null;
  /** `exercise_log` rows for earlier sessions in the window, any lift. */
  logPrior?: BoomExerciseLogRow[] | null;
  useImperial?: boolean;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * ⛔ THE WINDOW THE LINES SAY THEY USE: since the block started, else this year (the work order's own
 * words). The month named in the line is the window's first month, so `since July` means exactly the
 * span that was searched — not "at some point before July", which is what a comparison against an
 * unstated window would be claiming.
 */
function windowStart(blockStartISO: string | null | undefined, todayISO: string): { iso: string; month: string } {
  const d = new Date(`${String(todayISO).slice(0, 10)}T12:00:00Z`);
  const yearStart = `${Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear()}-01-01`;
  const iso = blockStartISO && String(blockStartISO).slice(0, 10) > yearStart
    ? String(blockStartISO).slice(0, 10)
    : yearStart;
  const m = Number(iso.slice(5, 7));
  return { iso, month: MONTHS[Math.max(0, Math.min(11, m - 1))] };
}

function parseAnalysis(w: BoomWorkout): Record<string, unknown> | null {
  let wa = w?.workout_analysis;
  if (typeof wa === 'string') { try { wa = JSON.parse(wa); } catch { return null; } }
  return wa && typeof wa === 'object' ? wa as Record<string, unknown> : null;
}

/** The ride card's own read: heart rate at easy power, and its own eligibility gate. */
function hrAtEasyPower(w: BoomWorkout): number | null {
  const bf = parseAnalysis(w)?.bike_fitness_v1 as Record<string, unknown> | undefined;
  if (!bf) return null;
  // ⛔ THE SAME GATE THE CARD APPLIES. A ride the engine excluded from the trend is not a reading of
  // heart rate at easy power, and comparing against one would be comparing against a number the
  // engine itself threw away. `undefined` = analysed before the field existed, and still counts.
  if (bf.counts_toward_trend === false) return null;
  const n = Number(bf.hr_at_band);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** What the Drift tile prints. Null when the session has no drift read at all. */
function driftPct(w: BoomWorkout): number | null {
  const sd = parseAnalysis(w)?.session_detail_v1 as Record<string, unknown> | undefined;
  const dec = (sd?.classification as Record<string, unknown> | undefined)?.decoupling as
    { pct?: unknown } | undefined;
  const n = Number(dec?.pct);
  return Number.isFinite(n) ? n : null;
}

/** p107's line, the one `AdherenceChips` already measures against. */
const DRIFT_LINE_PCT = 5;

/**
 * ⚠️ OURS: a streak has to be at least two to be a streak. p107 gives the 5 per cent; it says nothing
 * about how many sessions in a row is worth remarking on, and "for 1 rides running" is not a
 * sentence. Two is the smallest number that makes the word `running` true.
 */
const MIN_STREAK = 2;

function powerCurveOf(w: BoomWorkout): Record<string, unknown> | null {
  const c = w?.computed as Record<string, unknown> | undefined;
  const pc = c?.power_curve;
  return pc && typeof pc === 'object' ? pc as Record<string, unknown> : null;
}

const inWindow = (w: BoomWorkout, startISO: string) => String(w?.date ?? '').slice(0, 10) >= startISO;

/** `Mon` … `Sun`, the weekday name `me_history_v1` keys its entries by. */
function weekdayOf(iso: string | null | undefined): string | null {
  const d = new Date(`${String(iso ?? '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()];
}

const RIDE_TYPES = new Set(['ride', 'bike', 'cycling']);

/**
 * ═══ THE RIDE, AND THE RUN'S LAST TWO ════════════════════════════════════════════════════════════
 */
function enduranceLine(input: BoomInput, isRide: boolean): string | null {
  const { workout, prior } = input;
  const today = String(workout?.date ?? '').slice(0, 10);
  const win = windowStart(input.blockStartISO, today);
  const earlier = prior.filter((p) => inWindow(p, win.iso) && String(p?.date ?? '').slice(0, 10) < today);
  const noun = isRide ? 'ride' : 'run';

  if (isRide) {
    /**
     * 1. Best power. ⛔ THE LONGEST DURATION THAT IS A BEST WINS — the work order's own tiebreak, and
     * the right one: twenty minutes of best power is a bigger fact than five seconds of it, and an
     * athlete who set both should be told the bigger one.
     */
    const mine = powerCurveOf(workout);
    if (mine) {
      const ordered = [...POWER_CURVE_DURATIONS].sort((a, b) => b.seconds - a.seconds);
      for (const { label, seconds } of ordered) {
        // ⚠️ ONLY THE FOUR THE LINE NAMES. The curve stores twelve durations; the approved line lists
        // 20 min, 5 min, 1 min and 5 s, and printing "best 12-minute power" would be a line he has
        // not written.
        if (![1200, 300, 60, 5].includes(seconds)) continue;
        const w = Number(mine[label]);
        if (!Number.isFinite(w) || w <= 0) continue;
        const best = earlier.reduce((acc, p) => {
          const v = Number(powerCurveOf(p)?.[label]);
          return Number.isFinite(v) && v > acc ? v : acc;
        }, 0);
        // ⚠️ A WINDOW WITH NOTHING IN IT IS NOT A BEST. The first ride of a block beats no ride, and
        // saying it does would make the line meaningless on exactly the day it first appears.
        if (best <= 0 || w <= best) continue;
        const name = seconds === 1200 ? '20-minute' : seconds === 300 ? '5-minute' : seconds === 60 ? '1-minute' : '5-second';
        return `Best ${name} power since ${win.month}: ${Math.round(w)} W`;
      }
    }

    // 2. Longest ride. ⚠️ BY MOVING TIME, the length every other surface on Today and Week prints,
    // through `resolveMovingSeconds` — the app's one reader for how long a session was.
    const mineSecs = resolveMovingSeconds(workout as never) ?? 0;
    if (mineSecs > 0 && earlier.length > 0) {
      const longest = earlier.reduce((acc, p) => Math.max(acc, resolveMovingSeconds(p as never) ?? 0), 0);
      if (longest > 0 && mineSecs > longest) return `Longest ride since ${win.month}`;
    }
  }

  // 3. Heart rate lower at easy power / easy pace than the last eight.
  const mineHr = hrAtEasyPower(workout);
  if (mineHr != null) {
    const priorHr = earlier
      .map((p) => hrAtEasyPower(p))
      .filter((n): n is number => n != null)
      .slice(0, 8);
    if (priorHr.length === 8) {
      const mean = priorHr.reduce((a, b) => a + b, 0) / priorHr.length;
      const lower = Math.round(mean - mineHr);
      if (lower >= 1) {
        return isRide
          ? `Heart rate ${lower} bpm lower at easy power than your last eight rides`
          : `Heart rate ${lower} bpm lower at easy pace than your last eight runs`;
      }
    }
  }

  // 4. Drift under the line for N sessions running.
  const mineDrift = driftPct(workout);
  if (mineDrift != null && mineDrift < DRIFT_LINE_PCT) {
    let streak = 1;
    for (const p of earlier) {
      const d = driftPct(p);
      // ⚠️ A SESSION WITH NO DRIFT READ BREAKS NOTHING AND EXTENDS NOTHING — it is skipped. Reading
      // an absent number as a failure is acting on absence, which is not a fact about the athlete.
      if (d == null) continue;
      if (d < DRIFT_LINE_PCT) streak += 1; else break;
    }
    if (streak >= MIN_STREAK) return `Drift under 5 percent for ${streak} ${noun}s running`;
  }

  return null;
}

/**
 * ═══ THE LIFT ═══════════════════════════════════════════════════════════════════════════════════
 */
function liftLine(input: BoomInput): string | null {
  const { workout } = input;
  const unit = input.useImperial === false ? 'kg' : 'lb';
  const day = weekdayOf(workout?.date);
  const week = Number(workout?.week_number);

  /**
   * 1. A set earned. ⛔ THE LADDER'S OWN EVENT, REPLAYED THROUGH THE LADDER'S OWN FUNCTION.
   * `meSetsFromHistory` walks the outcomes the server already stored; running it with and without
   * this session's entry is the only honest way to ask "did THIS session earn the set" without
   * writing a second copy of `ME_CLEAN_SESSIONS_TO_EARN` and the cap that sits beside it.
   */
  for (const [pattern, entries] of Object.entries(input.meHistory ?? {})) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const last = entries[entries.length - 1];
    // ⚠️ IT MUST BE THIS SESSION'S ENTRY. The history holds the whole block; firing on the newest
    // entry whatever its date would re-announce an old rung every time an old session was opened.
    if (!day || String(last?.day ?? '') !== day) continue;
    if (Number.isFinite(week) && Number(last?.week) !== week) continue;
    const outcomes = entries.map((e) => String(e?.outcome ?? '') as MeSessionOutcome);
    const before = meSetsFromHistory(outcomes.slice(0, -1), ME_SETS_BAND).sets;
    const after = meSetsFromHistory(outcomes, ME_SETS_BAND).sets;
    if (after <= before) continue;
    const movement = String(last?.movement ?? '').trim();
    const weight = Number(input.meAtWeight?.[pattern]);
    if (!movement || !Number.isFinite(weight) || weight <= 0) continue;
    return `A set earned on ${movement}: two clean sessions at ${Math.round(weight)} ${unit}`;
  }

  const exercises = loggedExercises(workout);
  const intentOf = (name: string): string | null => {
    const hit = (input.logToday ?? []).find((r) =>
      String(r?.exercise_name ?? '').trim().toLowerCase() === name.trim().toLowerCase()
      || String(r?.canonical_name ?? '').trim().toLowerCase() === name.trim().toLowerCase());
    const intent = String(hit?.slot_intent ?? '').trim().toLowerCase();
    return intent || null;
  };

  // 2. Every heavy set with reps to spare. ⛔ RIR ≥ 1 ON EVERY LOGGED ME SET. ⚠️ AN ABSENT RIR IS NOT
  // A ZERO (D-324) — the athlete did not say, and a line claiming reps to spare on a set nobody
  // graded would be inventing the grade. A session with any ungraded heavy set does not qualify.
  const meSets = exercises.filter((e) => intentOf(e.name) === 'me').flatMap((e) => e.sets);
  if (meSets.length > 0 && meSets.every((s) => typeof s.rir === 'number' && s.rir >= 1)) {
    return 'Every heavy set with reps to spare';
  }

  // 3. Speed sets all fast. ⛔ EVERY DE SET LOGGED, AND NONE AT RIR 0 — a speed set taken to failure
  // is not a speed set. ⚠️ Absent RIR is allowed here: the claim is that none was ground out, and a
  // set the athlete did not grade is not evidence that one was.
  const deSets = exercises.filter((e) => intentOf(e.name) === 'de').flatMap((e) => e.sets);
  if (deSets.length > 0 && deSets.every((s) => s.completed) && !deSets.some((s) => s.rir === 0)) {
    return 'Speed sets all fast';
  }

  /**
   * 4. Most work sets this block. ⛔ ONLY WHILE STILL UNDER 14 (p86). The page's own upper anchor is
   * 14; a line congratulating an athlete for passing it would be the app cheering the thing the
   * source warns about. ⚠️ `sets_completed` off `exercise_log`, summed — not a recount of the sets.
   */
  const setsToday = (input.logToday ?? []).reduce((a, r) => a + (Number(r?.sets_completed) || 0), 0);
  if (setsToday > 0 && setsToday < 14) {
    const byWorkout = new Map<string, number>();
    for (const r of input.logPrior ?? []) {
      const k = String(r?.workout_id ?? r?.date ?? '');
      if (!k) continue;
      byWorkout.set(k, (byWorkout.get(k) ?? 0) + (Number(r?.sets_completed) || 0));
    }
    const priorMax = [...byWorkout.values()].reduce((a, b) => Math.max(a, b), 0);
    if (priorMax > 0 && setsToday > priorMax) return `Most work sets this block: ${setsToday}`;
  }

  /**
   * 5. Sessions on one lift without a miss. ⛔ A MISS IS A LOGGED SET AT ZERO REPS — the one reading
   * the rep band cannot contain, and the same event the bar ladder undoes a step for.
   */
  for (const ex of exercises) {
    if (ex.sets.length === 0) continue;
    if (ex.sets.some((s) => s.completed && (Number(s.reps) || 0) <= 0)) continue;
    const name = ex.name.trim().toLowerCase();
    const priorDates = new Set<string>();
    for (const r of input.logPrior ?? []) {
      const rn = String(r?.exercise_name ?? '').trim().toLowerCase();
      const rc = String(r?.canonical_name ?? '').trim().toLowerCase();
      if (rn !== name && rc !== name) continue;
      const d = String(r?.date ?? '').slice(0, 10);
      if (d) priorDates.add(d);
    }
    const n = priorDates.size + 1;
    if (n >= MIN_STREAK) return `${n} sessions on ${ex.name} without a miss`;
  }

  return null;
}

type LoggedSet = { reps?: number | null; weight?: number | null; rir?: number | null; completed?: boolean };
type LoggedExercise = { name: string; sets: LoggedSet[] };

/**
 * The session's logged lifts. ⚠️ SAME SHAPE `me-history.ts:setsOf` READS, including its rule that an
 * AUTOFILLED RIR IS ABSENT — a number the app supplied is not the athlete saying anything.
 */
function loggedExercises(w: BoomWorkout): LoggedExercise[] {
  const raw = Array.isArray(w?.executed?.strength_exercises)
    ? w.executed!.strength_exercises
    : Array.isArray(w?.strength_exercises) ? w.strength_exercises : [];
  return (raw as Record<string, unknown>[]).map((ex) => ({
    name: String(ex?.name ?? '').trim(),
    sets: (Array.isArray(ex?.sets) ? ex.sets as Record<string, unknown>[] : []).map((s) => ({
      reps: Number(s?.reps),
      weight: Number(s?.weight),
      rir: s?.rir_autofilled === true ? null : (typeof s?.rir === 'number' ? s.rir : null),
      completed: s?.completed === true,
    })),
  })).filter((e) => e.name);
}

/**
 * The line, or nothing. ⛔ NOTHING IS THE NORMAL ANSWER and it must stay cheap to reach: most
 * sessions are not a best of anything, and a screen that says so is a screen that has stopped
 * meaning anything when it does speak.
 */
export function sessionBoomLine(input: BoomInput): string | null {
  const w = input?.workout;
  if (!w) return null;
  if (String(w.workout_status ?? '').toLowerCase() !== 'completed') return null;
  const type = String(w.type ?? '').toLowerCase();
  if (type === 'strength') return liftLine(input);
  if (RIDE_TYPES.has(type)) return enduranceLine(input, true);
  if (type === 'run') return enduranceLine(input, false);
  return null;
}
