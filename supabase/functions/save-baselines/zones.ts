/**
 * ═══ EVERY NUMBER ADJUST AND TRAINING BASELINES PRINT, BUILT ON THE SERVER ═══
 *
 * ⛔ THE PHONE PRINTS THESE AND WORKS OUT NONE OF THEM (2026-09-10 for the zone tables, audit
 * H-B04–H-B06; widened to the whole readout 2026-09-15, one-truth workorder Stage 4 session 1).
 * Every row comes back as the finished pill text, ALREADY IN THE ATHLETE'S UNIT with its label and
 * its auto / your-number word, plus the raw number for the edit box. The two screens render it.
 *
 *   · power rows: Coggan's levels (`_shared/endurance/display-zones.ts`) at the FTP the resolver
 *     applies (`resolveCurrentFtp`, the number Profile shows beside them);
 *   · swim pace bands: the same file, from the stored threshold 100 pace;
 *   · the easy heart-rate band: `resolveRunEasyHrBand`, the band the learner and the analysers call easy.
 *     The Welcome screen printed 85–89% of threshold (Friel's Z2 alone); the server's easy band runs from
 *     70% (the floor below which a run is a walk or a stop) to 89%, so the numbers change on screen.
 *   · `readout`: the lifts, FTP, threshold pace, threshold and max and resting heart rate, the easy
 *     range, the 5K, the swim pace, the heart-rate zone tables, age / height / weight, and the date a
 *     retest lands on.
 *
 * ⚠️ THE THRESHOLD THE EASY BAND IS BUILT FROM is the athlete's typed run threshold heart rate when there
 * is one (`configured_hr_zones.manual_run_lthr`, else `performance_numbers.threshold_heart_rate`); the
 * resolver inside `resolveRunEasyHrBand` still prefers a trusted learned threshold over it.
 *
 * ⛔ UNITS ARE PICKED HERE, NEVER ON THE PHONE (guard rule (a), `docs/DESIGN-one-truth-guard.md` §1.3).
 * A lift is stored in pounds everywhere (the 45 lb bar, the 5 lb warm-up step, the nearest-5-lb e1RM),
 * so a metric account gets it converted here by the definition constant. Paces are held as seconds per
 * mile and converted here for a metric account. Height and body weight are already stored in the
 * athlete's own unit (`_shared/workload.ts` reads the value and the flag together), so those carry a
 * label and nothing else.
 *
 * ⛔ A RETEST FROM ADJUST LANDS ON TODAY (2026-09-15). TrainerRoad puts the test at the start of a plan
 * and Garmin offers it on demand; the athlete moves it on the calendar if the day does not suit. The
 * phone reports its own local date (the same `en-CA` read `fetch-arc-context.ts` makes — `toISOString()`
 * is UTC and dated the row a day ahead after 5 pm Pacific) and this file decides where the test lands.
 * ⚠️ WEEK-ONE PLACEMENT IN A NEW BLOCK KEEPS ITS OWN RULE — `_shared/baseline-test-rows.ts`
 * `RETEST_OFFSET_DAYS`, the third and fifth day of the block, so neither test sits on the first lifting
 * day and the two are two days apart. Different act, different rule, both stated.
 */
import { resolveCurrentFtp, pendingFtpProposal } from '../../../src/lib/resolve-current-ftp.ts';
import {
  resolveCurrentRunEasyPace,
  resolveCurrentRunThresholdPace,
  pendingRunThresholdProposal,
} from '../../../src/lib/resolve-current-run-pace.ts';
import { resolveCurrentLthr } from '../../../src/lib/resolve-current-lthr.ts';
import { resolveCurrentMaxHr, ageFromBirthday } from '../../../src/lib/resolve-current-max-hr.ts';
import { resolveRunEasyHrBand } from '../_shared/easy-hr.ts';
import { resolveStrengthCapacity, type CanonicalLiftKey } from '../_shared/state-trend/capacity-resolver.ts';
import { KG_PER_LB } from '../_shared/strength/session-volume.ts';
import {
  parsePaceClock,
  powerZoneRows,
  swimPaceBandRows,
  type PowerZoneRow,
  type SwimPaceBandRow,
} from '../_shared/endurance/display-zones.ts';

/** Seconds per MILE ÷ this = seconds per KM. The mile, by definition (1 mi = 1609.344 m exactly). */
const SEC_PER_MI_TO_SEC_PER_KM = 1.609344;

/**
 * One row as the two screens draw it: the pill text, the number behind the edit box, the placeholder,
 * the provenance line under it, and the auto / my-number switch.
 */
export type BaselineReadoutRow = {
  /** The pill text, already in the athlete's unit with its word — e.g. `225 lb · auto`. null = no number. */
  value: string | null;
  /** The number the edit box opens on, in the athlete's unit. null where the row is not typed. */
  raw: number | null;
  /** Placeholder and unit hint — `lb`, `bpm`, `W`, `m:ss/mi`. */
  hint: string;
  /** The line under the row. null where there is none. */
  note: string | null;
  /** True when the athlete's own number is in use (the pill grows its `auto` segment). */
  mine: boolean;
};

/** A measured number waiting to be accepted: the sentence, the button, and what the accept writes. */
export type BaselineProposal = {
  /** e.g. `Your rides measure 258 W`. */
  text: string;
  /** e.g. `use 258 W`. */
  button: string;
  /** What `save-baselines {accept}` is called with: watts, or seconds per KM for the run threshold. */
  accept_value: number;
};

export type ZoneTableRow = { name: string; range: string };

export type ZoneTable = {
  rows: ZoneTableRow[];
  /** `from your threshold heart rate` / `from your max and resting heart rate`; '' when unknown. */
  basis: string;
  /** Printed in place of the table when there are no stored zones. */
  empty: string;
};

export type LiftReadoutRow = { key: CanonicalLiftKey; label: string; row: BaselineReadoutRow };

export type BaselinesReadout = {
  units: 'metric' | 'imperial';
  you: {
    age: BaselineReadoutRow;
    height: BaselineReadoutRow;
    weight: BaselineReadoutRow;
    /** The units toggle's own label, e.g. `lb · mi`. */
    units_label: string;
  };
  strength: { lifts: LiftReadoutRow[] };
  run: {
    threshold: BaselineReadoutRow;
    threshold_proposal: BaselineProposal | null;
    easy: BaselineReadoutRow;
    lthr: BaselineReadoutRow;
    max_hr: BaselineReadoutRow;
    resting_hr: BaselineReadoutRow;
    five_k: BaselineReadoutRow;
    zones: ZoneTable;
  };
  bike: {
    ftp: BaselineReadoutRow;
    ftp_proposal: BaselineProposal | null;
    lthr: BaselineReadoutRow;
    max_hr: BaselineReadoutRow;
    resting_hr: BaselineReadoutRow;
    zones: ZoneTable;
  };
  swim: { threshold_100: BaselineReadoutRow };
  /** The day a retest asked for on Adjust lands on. */
  retest: { date: string };
};

export type BaselineZones = {
  power: { ftp: number; rows: PowerZoneRow[] } | null;
  swim_pace: { threshold_100: string; rows: SwimPaceBandRow[] } | null;
  run_easy_hr: { floor: number; ceiling: number; anchor: string; basis: string } | null;
  readout: BaselinesReadout;
};

const parseJson = (v: unknown): Record<string, unknown> | null => {
  if (v == null) return null;
  if (typeof v !== 'string') return v as Record<string, unknown>;
  try { return JSON.parse(v); } catch { return null; }
};

const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The word beside a number. Same rule the phone's `number-word.ts` held: the athlete's own number
 * says so, an accepted proposal says so, everything else is auto, and no number gets no word.
 */
function word(source: string | null | undefined, mine: boolean): string {
  if (mine) return 'your number';
  const v = String(source ?? '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v === 'accepted') return 'accepted';
  return 'auto';
}

/** `value · word`, or the value alone when there is no word. */
function pill(value: string | null, source: string | null | undefined, mine: boolean): string | null {
  if (value == null) return null;
  const w = word(source, mine);
  return w ? `${value} · ${w}` : value;
}

/**
 * `M:SS` from seconds. ⛔ THE WHOLE PACE IS ROUNDED ONCE, then split — rounding the remainder on its
 * own is what printed "7:60/mi" (§8.0 #2).
 */
function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function emptyRow(hint: string, note: string | null = null): BaselineReadoutRow {
  return { value: null, raw: null, hint, note, mine: false };
}

export function zonesForBaselinesRow(
  row: {
    performance_numbers?: unknown;
    learned_fitness?: unknown;
    configured_hr_zones?: unknown;
    locked_baselines?: unknown;
    units?: unknown;
    birthday?: unknown;
    gender?: unknown;
    updated_at?: unknown;
  } | null | undefined,
  opts?: { today?: string | null },
): BaselineZones {
  const pn = parseJson(row?.performance_numbers) ?? {};
  const learned = parseJson(row?.learned_fitness);
  const cfg = parseJson(row?.configured_hr_zones) ?? {};
  const locked = parseJson(row?.locked_baselines);
  const metric = String(row?.units ?? 'imperial') === 'metric';
  const today = typeof opts?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.today)
    ? opts.today
    : new Date().toISOString().slice(0, 10);

  const ftpResolved = resolveCurrentFtp({ learned_fitness: learned, performance_numbers: pn } as never);
  const ftpW = positive(ftpResolved.value);
  const power = ftpW ? { ftp: Math.round(ftpW), rows: powerZoneRows(ftpW) } : null;

  const swimSec = parsePaceClock(pn.swimPace100);
  const swim_pace = swimSec ? { threshold_100: String(pn.swimPace100).trim(), rows: swimPaceBandRows(swimSec) } : null;

  const typedLthr = positive(cfg.manual_run_lthr) ?? positive(pn.threshold_heart_rate);
  const band = resolveRunEasyHrBand(learned, typedLthr);
  const floor = positive(band?.floor);
  const ceiling = positive(band?.ceiling);
  const run_easy_hr = band && band.anchor !== 'none' && floor != null && ceiling != null
    ? { floor, ceiling, anchor: String(band.anchor), basis: String(band.basis ?? '') }
    : null;

  return {
    power,
    swim_pace,
    run_easy_hr,
    readout: buildReadout({ pn, learned, cfg, locked, metric, today, row, ftpResolved }),
  };
}

// ── the readout ─────────────────────────────────────────────────────────────────────────────────

const LIFTS: Array<{ key: CanonicalLiftKey; label: string; learnedKey: string | null; reps: boolean }> = [
  { key: 'squat', label: 'Squat', learnedKey: 'squat', reps: false },
  { key: 'deadlift', label: 'Deadlift', learnedKey: 'deadlift', reps: false },
  { key: 'bench', label: 'Bench press', learnedKey: 'bench_press', reps: false },
  { key: 'overheadPress1RM', label: 'Overhead press', learnedKey: 'overhead_press', reps: false },
  { key: 'pullupMaxReps', label: 'Pull-ups', learnedKey: null, reps: true },
];

/**
 * ⛔ THE ZONE TABLE IS THE SERVER'S (2026-09-10) and so are its row names and its ranges (2026-09-15).
 * The stored arrays are the ones `compute-workout-analysis` bins every workout on; the open bottom and
 * the open top are written the way the swim bands already write theirs ("1:57 and slower"), because
 * `{min}–{max}` printed the Z5 row as "176– bpm" with nothing after the dash.
 */
const ZONE_ROW_NAMES = ['Z1 Recovery', 'Z2 Aerobic', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max'];

const ZONE_MODEL_WORDS: Record<string, string> = {
  friel: 'from your threshold heart rate',
  karvonen: 'from your max and resting heart rate',
  needs_resting: 'needs resting heart rate',
};

const ZONES_EMPTY = 'Heart-rate zones need a threshold heart rate, or a max and a resting heart rate.';

function zoneTable(zones: unknown, model: unknown): ZoneTable {
  const arr = Array.isArray(zones) ? zones as Array<{ min?: unknown; max?: unknown }> : [];
  const basis = ZONE_MODEL_WORDS[String(model)] ?? '';
  const rows: ZoneTableRow[] = arr.map((z, i) => {
    const name = ZONE_ROW_NAMES[i] ?? `Z${i + 1}`;
    const min = Number(z?.min);
    const max = z?.max == null ? null : Number(z.max);
    const hasMin = Number.isFinite(min) && min > 0;
    const hasMax = max != null && Number.isFinite(max);
    if (!hasMin && hasMax) return { name, range: `${Math.round(max!)} bpm and under` };
    if (hasMin && !hasMax) return { name, range: `${Math.round(min)} bpm and up` };
    if (!hasMin && !hasMax) return { name, range: '' };
    return { name, range: `${Math.round(min)}–${Math.round(max!)} bpm` };
  });
  return { rows, basis, empty: ZONES_EMPTY };
}

function buildReadout(args: {
  pn: Record<string, unknown>;
  learned: Record<string, unknown> | null;
  cfg: Record<string, unknown>;
  locked: Record<string, unknown> | null;
  metric: boolean;
  today: string;
  row: { birthday?: unknown; gender?: unknown; updated_at?: unknown; height?: unknown; weight?: unknown } | null | undefined;
  ftpResolved: ReturnType<typeof resolveCurrentFtp>;
}): BaselinesReadout {
  const { pn, learned, cfg, locked, metric, today, ftpResolved } = args;
  const baselinesLike = { learned_fitness: learned, performance_numbers: pn, configured_hr_zones: cfg } as never;

  // ── paces ────────────────────────────────────────────────────────────────────────────────────
  const paceUnit = metric ? '/km' : '/mi';
  const paceHint = metric ? 'm:ss/km' : 'm:ss/mi';
  /** sec/MILE in, the athlete's own unit out, formatted once. */
  const pace = (secPerMi: number | null | undefined): string | null => {
    const v = positive(secPerMi);
    if (v == null) return null;
    return `${clock(metric ? v / SEC_PER_MI_TO_SEC_PER_KM : v)}${paceUnit}`;
  };

  const thr = resolveCurrentRunThresholdPace(baselinesLike);
  const thrMine = pn.threshold_pace_source === 'manual';
  const thrSamples = Number((learned as { run_threshold_pace_sec_per_km?: { sample_count?: unknown } } | null)
    ?.run_threshold_pace_sec_per_km?.sample_count);
  const thrAccepted = positive((learned as { run_threshold_pace_accepted?: { value?: unknown } } | null)
    ?.run_threshold_pace_accepted?.value) != null;
  const thrNote = thrMine
    ? 'your number'
    : thr.source === 'learned'
      ? (thrAccepted
          ? 'accepted from runs'
          : `from runs${Number.isFinite(thrSamples) && thrSamples > 0 ? `, ${thrSamples} best efforts` : ''}`)
      : thr.sec_per_mi != null ? 'typed, until your runs measure' : null;
  const thrPaceText = pace(thr.sec_per_mi);
  const thresholdRow: BaselineReadoutRow = {
    value: pill(thrPaceText, thr.source, thrMine),
    // The edit box opens empty on a pace: the athlete types `m:ss`, and the raw seconds are not it.
    raw: null,
    hint: paceHint,
    note: thrNote,
    mine: !!thrMine,
  };

  const thrProp = pendingRunThresholdProposal(baselinesLike);
  const thrPropText = thrProp ? pace(thrProp.measuredSecPerKm * SEC_PER_MI_TO_SEC_PER_KM) : null;
  const threshold_proposal: BaselineProposal | null = thrProp && thrPropText
    ? { text: `Your runs measure ${thrPropText}`, button: `use ${thrPropText}`, accept_value: thrProp.measuredSecPerKm }
    : null;

  const easy = resolveCurrentRunEasyPace(baselinesLike);
  const easyLo = pace(easy.range_lo_sec_per_mi);
  const easyHi = pace(easy.range_hi_sec_per_mi);
  const easyRow: BaselineReadoutRow = {
    value: easyLo && easyHi ? `${easyLo.replace(/\/(mi|km)$/, '')}–${easyHi} · from threshold` : null,
    raw: null,
    hint: paceHint,
    note: easyLo && easyHi
      ? 'Your zone 2 pace, worked out from your threshold pace. Easy days run by heart rate; this is the pace that usually lands there. Heat and hills slow it at the same heart rate.'
      : 'follows threshold pace',
    mine: false,
  };

  // ── FTP ──────────────────────────────────────────────────────────────────────────────────────
  const ftpMine = pn.ftp_source === 'manual';
  const ftpValue = positive(ftpResolved.value);
  const ftpAccepted = positive((learned as { ride_ftp_accepted?: { value?: unknown } } | null)?.ride_ftp_accepted?.value) != null;
  const ftpNote = ftpMine
    ? 'your number'
    : ftpResolved.source === 'learned'
      ? (ftpAccepted ? 'accepted from your rides' : 'from your rides')
      : ftpValue != null ? 'typed, until your rides measure' : null;
  const ftpRow: BaselineReadoutRow = {
    value: pill(ftpValue != null ? `${Math.round(ftpValue)} W` : null, ftpResolved.source, !!ftpMine),
    raw: ftpValue != null ? Math.round(ftpValue) : null,
    hint: 'W',
    note: ftpNote,
    mine: !!ftpMine,
  };
  const ftpProp = pendingFtpProposal(baselinesLike);
  const ftp_proposal: BaselineProposal | null = ftpProp
    ? {
      text: `Your rides measure ${Math.round(ftpProp.measured)} W`,
      button: `use ${Math.round(ftpProp.measured)} W`,
      accept_value: ftpProp.measured,
    }
    : null;

  // ── heart rate, per sport ────────────────────────────────────────────────────────────────────
  /**
   * ⛔ ONE RESOLVED THRESHOLD PER SPORT, BOTH SCREENS (§8.0 #23). Adjust passed the stored
   * `configured_hr_zones` and Baselines passed a two-key object built from its own screen state, so
   * one screen could reach a tier the other could not. There is one input now, and it is this row.
   * ⛔ NO AGE ESTIMATE ON THE MAX (§8.0 #24) — `allowAgeEstimate: false` is the same call the zone
   * build makes (`derive.ts`), so the screen can no longer show a max the zone build refuses.
   */
  const typedResting = positive(pn.restingHeartRate);
  const watchResting = positive(cfg.resting_heart_rate);
  // A resting heart rate at or under 30 is a dropped strap, not a reading (same floor the zone build uses).
  const restingValue = typedResting ?? (watchResting != null && watchResting > 30 ? watchResting : null);
  const restingMine = typedResting != null;
  const restingRow: BaselineReadoutRow = {
    value: restingValue != null ? `${Math.round(restingValue)} bpm · ${restingMine ? 'your number' : 'auto'}` : null,
    raw: restingValue != null ? Math.round(restingValue) : null,
    hint: 'bpm',
    note: restingMine ? 'your number' : restingValue != null ? 'from your watch' : null,
    mine: restingMine,
  };

  const hrFor = (sport: 'run' | 'ride') => {
    const isRun = sport === 'run';
    const lthr = resolveCurrentLthr(baselinesLike, { sport });
    const manualLthr = positive(isRun ? cfg.manual_run_lthr : cfg.manual_ride_lthr);
    const lthrMine = isRun ? pn.lthr_source === 'manual' : manualLthr != null;
    const lthrRow: BaselineReadoutRow = {
      value: lthr.bpm != null ? `${Math.round(lthr.bpm)} bpm · ${word(lthr.source, !!lthrMine)}` : null,
      raw: lthr.bpm != null ? Math.round(lthr.bpm) : null,
      hint: 'bpm',
      note: lthrMine ? 'your number' : lthr.bpm != null ? `from ${isRun ? 'runs' : 'rides'}` : null,
      mine: !!lthrMine,
    };

    const manualMax = positive(isRun ? cfg.manual_run_max_hr : cfg.manual_ride_max_hr);
    const max = resolveCurrentMaxHr(
      { learned_fitness: learned, configured_hr_zones: cfg, athlete_config: cfg } as never,
      { sport, allowAgeEstimate: false },
    );
    const maxRow: BaselineReadoutRow = max.bpm != null
      ? {
        value: `${Math.round(max.bpm)} bpm · ${manualMax != null ? 'your number' : 'auto'}`,
        raw: Math.round(max.bpm),
        hint: 'bpm',
        note: manualMax != null ? 'your number' : `observed in ${isRun ? 'runs' : 'rides'}`,
        mine: manualMax != null,
      }
      : emptyRow(
        'bpm',
        `Not on file yet. Your hardest logged ${isRun ? 'run' : 'ride'} sets it, once one is recorded with a heart-rate strap.`,
      );

    const zones = isRun ? (cfg.zones_run ?? cfg.zones) : (cfg.zones_ride ?? cfg.zones);
    const model = isRun ? cfg.zones_run_model : cfg.zones_ride_model;
    return { lthr: lthrRow, max_hr: maxRow, zones: zoneTable(zones, model) };
  };
  const runHr = hrFor('run');
  const bikeHr = hrFor('ride');

  // ── 5K ───────────────────────────────────────────────────────────────────────────────────────
  const fiveKText = typeof pn.fiveK === 'string' && pn.fiveK.trim() ? pn.fiveK.trim() : null;
  const fiveKMine = pn.fiveK_source !== 'learned';
  const fiveKRow: BaselineReadoutRow = {
    value: fiveKText ? `${fiveKText} · ${fiveKMine ? 'your number' : 'auto'}` : null,
    raw: null,
    hint: 'mm:ss',
    note: fiveKMine ? (fiveKText ? 'your number' : null) : 'from runs',
    mine: fiveKMine && !!fiveKText,
  };

  // ── swim ─────────────────────────────────────────────────────────────────────────────────────
  const swim100 = typeof pn.swimPace100 === 'string' && pn.swimPace100.trim() ? pn.swimPace100.trim() : null;
  const swimRow: BaselineReadoutRow = {
    value: swim100 ? `${swim100}/100 · your number` : null,
    raw: null,
    hint: 'm:ss',
    note: swim100 ? 'your number' : null,
    mine: !!swim100,
  };

  // ── lifts ────────────────────────────────────────────────────────────────────────────────────
  /**
   * ⛔ A LIFT IS STORED IN POUNDS, ALWAYS (§8.0 #7). Adjust and Baselines printed "kg" beside the
   * pound number on a metric account while the logger printed "lb" for the same set, and a typed
   * kilogram number was stored raw as pounds. The conversion is here, by the definition constant.
   */
  const strength1rms = (learned as { strength_1rms?: Record<string, unknown> } | null)?.strength_1rms ?? null;
  const typedAsOf = typeof args.row?.updated_at === 'string' ? args.row.updated_at : null;
  const lifts: LiftReadoutRow[] = LIFTS.map((lift) => {
    const r = resolveStrengthCapacity({
      key: lift.key,
      typed: pn,
      learnedStrength1rms: strength1rms,
      locked,
      asOf: today,
      typedAsOf,
    });
    // Pull-ups are reps and 0 is a valid lock ("goal: your first pull-up", D-229); weight lifts need > 0.
    const lockedNum = Number(locked?.[lift.key]);
    const isLocked = Number.isFinite(lockedNum) && (lift.reps ? lockedNum >= 0 : lockedNum > 0);
    const unit = lift.reps ? 'reps' : (metric ? 'kg' : 'lb');
    /** Reps are reps; a 1RM is pounds on the row and becomes kilograms for a metric account. */
    const inAthletesUnit = (lb: number): number => Math.round(lift.reps || !metric ? lb : lb * KG_PER_LB);
    const shown = r.value == null ? null : inAthletesUnit(r.value);
    const sessions = Number((strength1rms as Record<string, { sample_count?: unknown }> | null)
      ?.[String(lift.learnedKey)]?.sample_count);
    const note = isLocked
      ? 'your number'
      : r.source === 'learned'
        ? `from your lifts${Number.isFinite(sessions) && sessions > 0 ? `, ${sessions} sessions` : ''}`
        : r.source === 'typed'
          ? (lift.reps ? 'typed' : 'typed, until your lifts measure')
          : null;
    // The suggestion is shown upward only — a strength read that nags downward is the thing the
    // no-PR frame exists to avoid. Converted with the number beside it.
    const sugRaw = r.suggestion && r.suggestion.divergencePct > 0 ? Number(r.suggestion.computed) : null;
    const sug = sugRaw != null && Number.isFinite(sugRaw) ? ` Your lifts suggest ${inAthletesUnit(sugRaw)}.` : '';
    return {
      key: lift.key,
      label: lift.label,
      row: {
        value: shown != null ? pill(`${shown} ${unit}`, r.source, isLocked) : null,
        raw: shown,
        hint: unit,
        note: note ? note + sug : null,
        mine: isLocked,
      },
    };
  });

  // ── you ──────────────────────────────────────────────────────────────────────────────────────
  /**
   * ⛔ AGE COMES OFF THE BIRTHDAY, EVERY READ. The phone worked it out on each render AND wrote
   * `user_baselines.age` once, which then never moved again — so after a birthday the screen and the
   * three server readers of that column disagreed by a year. The birthday is the fact; the age is
   * worked out from it wherever it is needed (`ageFromBirthday`, beside the one age formula).
   */
  const birthday = typeof args.row?.birthday === 'string' ? args.row.birthday : null;
  const age = ageFromBirthday(birthday, today);
  const heightRaw = positive(args.row?.height);
  const weightRaw = positive(args.row?.weight);
  const heightUnit = metric ? 'cm' : 'in';
  const weightUnit = metric ? 'kg' : 'lb';

  return {
    units: metric ? 'metric' : 'imperial',
    you: {
      age: {
        value: age != null ? `${age} yrs` : null,
        raw: age,
        hint: 'yrs',
        note: null,
        mine: false,
      },
      height: {
        value: heightRaw != null ? `${Math.round(heightRaw)} ${heightUnit}` : null,
        raw: heightRaw != null ? Math.round(heightRaw) : null,
        hint: heightUnit,
        note: null,
        mine: heightRaw != null,
      },
      weight: {
        value: weightRaw != null ? `${Math.round(weightRaw)} ${weightUnit}` : null,
        raw: weightRaw != null ? Math.round(weightRaw) : null,
        hint: weightUnit,
        note: null,
        mine: weightRaw != null,
      },
      units_label: metric ? 'kg · km' : 'lb · mi',
    },
    strength: { lifts },
    run: {
      threshold: thresholdRow,
      threshold_proposal,
      easy: easyRow,
      lthr: runHr.lthr,
      max_hr: runHr.max_hr,
      resting_hr: restingRow,
      five_k: fiveKRow,
      zones: runHr.zones,
    },
    bike: {
      ftp: ftpRow,
      ftp_proposal,
      lthr: bikeHr.lthr,
      max_hr: bikeHr.max_hr,
      resting_hr: restingRow,
      zones: bikeHr.zones,
    },
    swim: { threshold_100: swimRow },
    retest: { date: today },
  };
}
