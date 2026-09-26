/**
 * save-baselines — the numbers the server derives from what the athlete typed.
 *
 * ⛔ THE PHONE SENDS WHAT WAS TYPED; THIS FILE DERIVES; `index.ts` SAVES (2026-09-10,
 * docs/AUDIT-client-decisions-2026-09-10.md H-B01 / H-B02). Until today the phone computed the 5K
 * training paces and the heart-rate zone tables itself and wrote them to `user_baselines`, and the
 * server then read those phone-written numbers first (`compute-workout-analysis` bins every workout's
 * heart rate on `configured_hr_zones.zones_*` before any resolver of its own).
 *
 * Pure: no database, no clock except where passed in, so `derive.test.ts` can pin every output.
 */
import { calculateEffortScore, getPacesFromScore, type TrainingPaces } from '../generate-run-plan/effort-score.ts';
import { deriveFiveKPaceFromRaceTime, resolveFiveKRaceTimeSec } from '../../../src/lib/resolve-current-5k-pace.ts';
import { canonicalizeLiftKey } from '../_shared/state-trend/capacity-resolver.ts';
import { KG_PER_LB } from '../_shared/strength/session-volume.ts';
import { acceptEstimatedFtp } from '../../../src/lib/resolve-current-ftp.ts';
import { acceptLearnedRunThreshold } from '../../../src/lib/resolve-current-run-pace.ts';

// ── "use this number" → the accepted learned value ───────────────────────────────────────────────

export type AcceptKind = 'ftp' | 'run_threshold';

/**
 * ⛔ THE ACCEPT IS SAVED HERE (2026-09-10). Profile, Adjust and the post-workout popup each re-read
 * `learned_fitness`, ran `acceptEstimatedFtp` / `acceptLearnedRunThreshold` on the phone and wrote the
 * result, then cleared the manual flag with a second write. The phone now sends which number and the value
 * it showed; this runs the same two accept functions `endurance-checkpoint` runs.
 *
 * ⚠️ THE VALUE MUST MATCH WHAT WOULD BE ACCEPTED. If the learner moved the estimate between the screen
 * drawing the button and the tap, the athlete would be accepting a number they never saw — refused with
 * `value_changed` instead. FTP in watts, threshold in seconds per km, compared rounded.
 *
 * The manual flag is cleared by the rules `endurance-checkpoint` already applies: FTP drops
 * `ftp_source: 'manual'`; threshold sets `threshold_pace_source: 'learned'`.
 */
export function acceptMeasuredForSave(input: {
  kind: AcceptKind;
  value: number;
  learnedFitness: Record<string, unknown> | null | undefined;
  performanceNumbers: Record<string, unknown> | null | undefined;
  now: Date;
  /** Which door the athlete said yes at; stored as `accepted_via`. The six-week checkpoint sends 'checkpoint'; the
   *  learner's one-time seed (an athlete already running on a confident estimate, no accepted value) sends 'seed'. */
  via?: 'baselines' | 'checkpoint' | 'seed';
}):
  | { ok: true; learned_fitness: Record<string, unknown>; performance_numbers: Record<string, unknown>; accepted_value: number }
  | { ok: false; reason: 'nothing_to_accept' | 'value_changed' } {
  const pn: Record<string, unknown> = { ...(input.performanceNumbers ?? {}) };
  const via = input.via === 'checkpoint' || input.via === 'seed' ? input.via : 'baselines';
  // A seed changes nothing the athlete sees, so it leaves a typed number's source alone.
  const seed = via === 'seed';
  if (input.kind === 'ftp') {
    const next = acceptEstimatedFtp(input.learnedFitness ?? null, via, input.now);
    if (!next) return { ok: false, reason: 'nothing_to_accept' };
    const accepted = Number((next.ride_ftp_accepted as { value: number }).value);
    if (Math.round(accepted) !== Math.round(Number(input.value))) return { ok: false, reason: 'value_changed' };
    if (!seed && pn.ftp_source === 'manual') delete pn.ftp_source;
    return { ok: true, learned_fitness: next, performance_numbers: pn, accepted_value: accepted };
  }
  const next = acceptLearnedRunThreshold(input.learnedFitness ?? null, via, input.now);
  if (!next) return { ok: false, reason: 'nothing_to_accept' };
  const accepted = Number((next.run_threshold_pace_accepted as { value: number }).value);
  if (Math.round(accepted) !== Math.round(Number(input.value))) return { ok: false, reason: 'value_changed' };
  if (!seed && pn.threshold_pace_source === 'manual') pn.threshold_pace_source = 'learned';
  return { ok: true, learned_fitness: next, performance_numbers: pn, accepted_value: accepted };
}

// ── the swim CSS test → the plan's swim pace ─────────────────────────────────────────────────────

/** A swim CSS written by the CSS test (it carries `tested_at`, or the test's source), not the learner's fit. */
export function isTestedSwimCss(m: unknown): boolean {
  const x = m as { value?: unknown; tested_at?: unknown; source?: unknown } | null;
  return !!x && Number(x.value) > 0 && (x.tested_at != null || /CSS test/i.test(String(x.source ?? '')));
}

/**
 * ⛔ A TESTED CSS SETS THE PLAN'S SWIM PACE, SAVED HERE (2026-09-16, Stage 7 session 1). compute-workout-analysis
 * wrote `performance_numbers.swimPace100` itself beside the learned CSS; this is now the one writer, and the
 * learner asks for it right after it stores a CSS test. The conversion moved unchanged: `swimPace100` is the
 * /100 yd `m:ss` STRING every reader parses, and the test measures sec/100 m — so ×0.9144 (definition) and m:ss.
 */
export function swimPaceFromTestedCssForSave(input: {
  learnedFitness: Record<string, unknown> | null | undefined;
  performanceNumbers: Record<string, unknown> | null | undefined;
}):
  | { ok: true; performance_numbers: Record<string, unknown>; accepted_value: string }
  | { ok: false; reason: 'nothing_to_accept' } {
  const css = input.learnedFitness?.swim_css_sec_per_100m as { value?: unknown } | undefined;
  if (!isTestedSwimCss(css)) return { ok: false, reason: 'nothing_to_accept' };
  const cssYd = Number(css!.value) * 0.9144;
  let mm = Math.floor(cssYd / 60), ss = Math.round(cssYd % 60);
  if (ss === 60) { mm += 1; ss = 0; }
  const swimPace100 = `${mm}:${String(ss).padStart(2, '0')}`;
  return { ok: true, performance_numbers: { ...(input.performanceNumbers ?? {}), swimPace100 }, accepted_value: swimPace100 };
}

// ── 5K → effort score and training paces ────────────────────────────────────────────────────────

export type EffortFields = {
  effort_score: number;
  effort_source_distance: number;
  effort_source_time: number;
  effort_paces: TrainingPaces;
  effort_paces_source: 'calculated';
  /** The DB check constraint allows only 'estimated' | 'verified'. A typed 5K is an estimate. */
  effort_score_status: 'estimated';
  effort_updated_at: string;
};

/**
 * The 5K race time → the `effort_*` columns. ⛔ THE PLAN BUILDER'S OWN FORMULA
 * (`generate-run-plan/effort-score.ts`, the one `create-goal-and-materialize-plan` scores with). The
 * phone copy it replaces gave identical scores and paces for every 5K time checked on 2026-09-10.
 */
export function effortFieldsFromFiveKTimeSec(fiveKTimeSec: number, nowIso: string): EffortFields {
  const score = calculateEffortScore(5000, fiveKTimeSec);
  return {
    effort_score: score,
    effort_source_distance: 5000,
    effort_source_time: Math.round(fiveKTimeSec),
    effort_paces: getPacesFromScore(score),
    effort_paces_source: 'calculated',
    effort_score_status: 'estimated',
    effort_updated_at: nowIso,
  };
}

/** `m:ss` → seconds, or null. An unparseable pace is not a zero pace. */
function parseClock(s: unknown): number | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return sec > 0 ? sec : null;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The quick calibration's typed 5K PACE (per mile, or per km for a metric athlete) → the 5K race
 * clock Baselines keeps. Null when the pace is unusable or not faster than the typed easy pace — a 5K
 * slower than easy is a swapped pair, and storing it would score the wrong field.
 */
export function fiveKClockFromCalibration(input: { fiveKPace: unknown; easyPace?: unknown; metric: boolean }):
  { fiveKTimeSec: number; clock: string } | null {
  const fiveK = parseClock(input.fiveKPace);
  if (!fiveK) return null;
  const easy = input.easyPace == null ? null : parseClock(input.easyPace);
  if (input.easyPace != null && (!easy || fiveK >= easy)) return null;
  const perMile = input.metric ? Math.round(fiveK * 1.60934) : fiveK;
  const fiveKTimeSec = Math.round(perMile * 3.10686);
  return { fiveKTimeSec, clock: formatClock(fiveKTimeSec) };
}

/**
 * The performance numbers as they are saved: what was typed, plus the one derived field, `fiveK_pace`.
 *
 * ⚠️ AN INCOMING `fiveK_pace` IS IGNORED — it is derived, and the phone does not write derived numbers.
 * When the typed 5K yields no pace, the pace already on the row stays (the old save did the same).
 * Unitless paces get the athlete's unit, as the old save did.
 */
export function performanceNumbersForSave(
  typed: Record<string, unknown> | null | undefined,
  stored: Record<string, unknown> | null | undefined,
  metric: boolean,
): Record<string, unknown> {
  const perf: Record<string, unknown> = { ...(typed ?? {}) };
  delete perf.fiveK_pace;
  const derived = deriveFiveKPaceFromRaceTime(perf.fiveK, metric);
  if (derived) perf.fiveK_pace = derived;
  else if (stored && typeof stored.fiveK_pace === 'string') perf.fiveK_pace = stored.fiveK_pace;
  const suffix = metric ? '/km' : '/mi';
  for (const k of ['fiveK_pace', 'easyPace']) {
    const v = perf[k];
    if (typeof v === 'string' && !/\/(mi|km)$/i.test(v)) {
      const m = v.match(/^(\d{1,2}):(\d{2})$/);
      if (m) perf[k] = `${m[1]}:${m[2]}${suffix}`;
    }
  }
  return perf;
}

/** The effort columns for a saved row, or null when the row carries no usable 5K. */
export function effortFieldsForPerformanceNumbers(perf: Record<string, unknown>, nowIso: string): EffortFields | null {
  const sec = resolveFiveKRaceTimeSec({ performance_numbers: perf } as never);
  return sec != null ? effortFieldsFromFiveKTimeSec(sec, nowIso) : null;
}

// ── heart rate → zones ──────────────────────────────────────────────────────────────────────────

/** What the athlete typed. A key that is present sets the value (null clears it); an absent key keeps the stored one. */
export type TypedHeartRate = {
  manual_run_lthr?: number | null;
  manual_run_max_hr?: number | null;
  manual_ride_lthr?: number | null;
  manual_ride_max_hr?: number | null;
  resting_heart_rate?: number | null;
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The `configured_hr_zones` object, or null when nothing heart-rate related was typed or changed
 * (the row is then left exactly as it is).
 *
 * ⛔ WHAT THE ATHLETE TYPED, AND NOTHING DERIVED FROM IT (2026-09-26, Michael: "go"). This also wrote zone arrays
 * (`zones`, `zones_run`, `zones_ride` — Friel or Karvonen tables), their model names, and one-number
 * `threshold_heart_rate` / `max_heart_rate` scalars. Nothing reads any of them now: every zone edge is
 * `heartRateZoneSet` (`_shared/endurance/display-zones.ts`), worked out from the typed and learned numbers at read
 * time, and the last readers of the stored `zones` — the race band and its stale-strategy hash — read that set too.
 *
 * What stays is what is read: the four typed numbers (the threshold and max-heart-rate owners read them), the resting
 * heart rate (Baselines' resting row), and `source` — the Strava and watch-file writers check it before they write,
 * so an athlete's own numbers are never overwritten.
 */
export function hrZoneConfigForSave(input: {
  typed: TypedHeartRate;
  stored: Record<string, unknown> | null | undefined;
  nowIso: string;
}): Record<string, unknown> | null {
  const stored = input.stored ?? {};
  const pick = (k: keyof TypedHeartRate): number | null =>
    Object.prototype.hasOwnProperty.call(input.typed, k) ? positive(input.typed[k]) : positive(stored[k]);
  const m = {
    runLthr: pick('manual_run_lthr'),
    runMax: pick('manual_run_max_hr'),
    rideLthr: pick('manual_ride_lthr'),
    rideMax: pick('manual_ride_max_hr'),
  };
  const restingTyped = Object.prototype.hasOwnProperty.call(input.typed, 'resting_heart_rate');
  const resting = pick('resting_heart_rate');

  const hasManual = !!(m.runLthr || m.runMax || m.rideLthr || m.rideMax);
  const changed =
    m.runLthr !== positive(stored.manual_run_lthr) ||
    m.runMax !== positive(stored.manual_run_max_hr) ||
    m.rideLthr !== positive(stored.manual_ride_lthr) ||
    m.rideMax !== positive(stored.manual_ride_max_hr) ||
    restingTyped;
  if (!hasManual && !changed) return null;

  return {
    source: hasManual ? 'manual' : 'learned',
    custom_zones: hasManual,
    updated_at: input.nowIso,
    manual_run_max_hr: m.runMax,
    manual_run_lthr: m.runLthr,
    manual_ride_max_hr: m.rideMax,
    manual_ride_lthr: m.rideLthr,
    resting_heart_rate: resting,
  };
}

// ── what the athlete typed, in their own unit ───────────────────────────────────────────────────

/**
 * A TYPED PACE ARRIVES IN THE ATHLETE'S OWN UNIT (2026-09-15, one-truth workorder Stage 4 session 1).
 *
 * ⛔ THE PHONE NO LONGER MULTIPLIES. `StateAdjustLens` and `TrainingBaselines` each held their own
 * `metric ? sec * 1.609344 : sec` before the save, so the server never saw the kilometre value the
 * athlete actually typed and the conversion existed twice. The wire now carries `m:ss` as typed plus the
 * account's unit flag — the same shape the quick calibration's 5K pace has always used — and the per-mile
 * string that `performance_numbers.threshold_pace_min_per_mi` holds is written here.
 *
 * An absent key changes nothing. An explicitly null key is not a clear: a threshold pace is cleared by
 * switching the row back to auto, which sets `threshold_pace_source`, not by blanking the number.
 */
export function pacesForSave(
  paces: { threshold?: unknown } | null | undefined,
  perf: Record<string, unknown>,
  metric: boolean,
): Record<string, unknown> {
  if (!paces || typeof paces !== 'object') return perf;
  const out = { ...perf };
  if (Object.prototype.hasOwnProperty.call(paces, 'threshold')) {
    const sec = parseClock(paces.threshold);
    if (sec) {
      const secPerMi = metric ? sec * 1.609344 : sec;
      out.threshold_pace_min_per_mi = formatClock(secPerMi);
      out.threshold_pace_source = 'manual';
    }
  }
  return out;
}

/**
 * A TYPED 1RM ARRIVES IN THE ATHLETE'S OWN UNIT and is stored in POUNDS (2026-09-15, §8.0 #7).
 *
 * ⛔ EVERY LIFT CONSUMER IS POUND-NATIVE — the 45 lb bar, the 5 lb warm-up step, the nearest-5-lb e1RM,
 * the logger's own "Saved: N lb". Adjust and Baselines printed "kg" beside that pound number on a metric
 * account and stored a typed kilogram number raw, so 100 kg became 100 lb. The conversion is here, by the
 * definition constant, and the screens print what this file sends back.
 *
 * ⛔ ONE WRITE SHAPE FOR ONE TAP. Baselines wrote `performance_numbers[key]` AND `locked_baselines[key]`;
 * Adjust wrote only the lock, so the seed a new block starts from moved on one screen and not the other.
 * Both move now — which is what the Baselines row already tells the athlete it does.
 *
 * `null` for a lift clears its lock (back to auto) and leaves the seed alone. Pull-up reps are reps: 0 is
 * a valid value and nothing is converted.
 */
export function liftsForSave(
  lifts: Record<string, unknown> | null | undefined,
  perf: Record<string, unknown>,
  lockedStored: Record<string, unknown> | null | undefined,
  metric: boolean,
  /**
   * `lock: false` — a 1RM TEST result (save-baseline-test, 2026-09-16): the seed moves, the lock is untouched and a
   * `null` clears nothing. The typed Adjust / Baselines save keeps the default, which locks.
   */
  opts: { lock?: boolean } = {},
): { performance_numbers: Record<string, unknown>; locked_baselines: Record<string, unknown> | null } | null {
  if (!lifts || typeof lifts !== 'object') return null;
  const perfOut = { ...perf };
  const locked: Record<string, unknown> = { ...(lockedStored ?? {}) };
  let touched = false;
  for (const [rawKey, rawValue] of Object.entries(lifts)) {
    const key = canonicalizeLiftKey(rawKey);
    if (!key) continue;
    touched = true;
    const lock = opts.lock !== false;
    if (rawValue == null) { if (lock) delete locked[key]; continue; }
    const n = Number(rawValue);
    if (!Number.isFinite(n)) continue;
    const reps = key === 'pullupMaxReps';
    if (reps ? n < 0 : n <= 0) continue;
    const stored = reps ? Math.round(n) : Math.round(metric ? n / KG_PER_LB : n);
    perfOut[key] = stored;
    // Pull-ups are reps and are never locked — the row has no auto to switch back to (D-229).
    if (!reps && lock) locked[key] = stored;
  }
  if (!touched) return null;
  return {
    performance_numbers: perfOut,
    locked_baselines: Object.keys(locked).length > 0 ? locked : null,
  };
}
