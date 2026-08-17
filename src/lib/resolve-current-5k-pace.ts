/**
 * Shared resolver for the athlete's current 5K PACE. The third of the family, after
 * `resolve-current-ftp.ts` (bike) and `resolve-current-run-pace.ts` (easy + threshold).
 * Same move, same reasons — this one is not a new design.
 *
 * WHY THIS EXISTS. 5K pace had no owner, so every consumer hand-rolled its own chain over its own
 * subset of the spellings, and they disagreed:
 *
 *   materialize-plan/index.ts:647,674   effort_paces.power  THEN  fiveK_pace ?? fiveKPace ?? fiveK
 *   _shared/token-parser.ts:209         fiveK_pace only
 *   AllPlansInterface.tsx:666,797       fiveK_pace || fiveKPace || fiveK   (twice, same file)
 *   coach/index.ts:4917                 effort_paces.five_k || five_k_pace_min_per_mi
 *   course-detail/index.ts:287          … ?? fiveK_pace   (as the last-ditch threshold proxy)
 *
 * ⛔ THE TRAP, AND THE REAL REASON THIS FILE EXISTS: `fiveK` IS A RACE TIME, NOT A PACE.
 * `TrainingBaselines.tsx:1242` writes it from a field labelled "5K Time" — "22:30". Three of the
 * chains above end in `?? b.fiveK` and then parse the result AS A PACE, which reads 22:30 as
 * 22:30/mi. `materialize-plan:682-686` then derives threshold pace as that + 20s/mi and prescribes
 * it. `AppContext.tsx:315-333` backfills `fiveK_pace` from `fiveK` on save, which covers the common
 * case but NOT: a value that misses its `^m:ss$` regex (a trailing space is enough), a row where
 * `fiveK_pace` already exists (the backfill is guarded by `!perf.fiveK_pace`, so a re-typed 5K time
 * leaves the OLD pace standing), a numeric `fiveK`, or any row written before the backfill existed.
 *
 * So: THE TIME KEYS ARE NEVER READ AS A PACE. They are read as a time, sanity-banded, and DIVIDED by
 * the 5K distance in miles — the same arithmetic `AppContext` does on save, in one place, or they are
 * not read at all. `resolveFiveKRaceTimeSec()` is the accessor for the time itself; there is one
 * named entry point per fact and neither can be mistaken for the other.
 *
 * ⚠ THE UNIT FOOTGUN (CLAUDE.md: this repo has been bitten three times). Everything here is
 * normalized to sec/MILE, which is what the name, the return type and this line all say:
 *     performance_numbers.fiveK_pace              "7:15/mi" | "7:15/km" | "7:15" | 435   (mi unless /km)
 *     performance_numbers.fiveKPace               same, camelCase
 *     performance_numbers.fiveK_pace_sec_per_mi   sec/MILE
 *     performance_numbers.five_k_pace_min_per_mi  a "7:15" STRING in min/MILE
 *     performance_numbers.fiveK / .fiveKTime      a RACE CLOCK — see above
 *     effort_paces.five_k / .power                sec/MILE (VDOT/wizard — an INFERENCE)
 *
 * ⚠ NO ATHLETE-CHOICE TIER. FTP has `ftp_source` and the run paces have `easy_pace_source` /
 * `threshold_pace_source` (Q-240 / Q-174). 5K has no such field and nothing writes one, so there is
 * no tier 0 here. Do not invent one — add it to the write path first.
 *
 * No I/O. Pure function. Caller passes already-loaded baselines. Importable from the React client AND
 * Deno edge functions (the `src/lib/session-frequency-defaults.ts` precedent).
 */

const SEC_PER_KM_TO_SEC_PER_MI = 1.609344;

/** 5 km expressed in miles. The one conversion between a 5K race time and a 5K pace. */
export const FIVE_K_MILES = 5 / SEC_PER_KM_TO_SEC_PER_MI;   // 3.106856…

/**
 * Is this plausibly a 5K RACE TIME? Copied deliberately from `_shared/arc-context.ts:472`
 * (`FIVEK_TOTAL_SEC_SANE`) so the app holds ONE opinion about what a 5K time can be.
 */
const RACE_TIME_SANE_SEC = { min: 7 * 60, max: 80 * 60 };

/**
 * Is this plausibly a 5K PACE, in sec/mile? 3:00/mi is below any human; 20:00/mi is a 62-minute 5K.
 *
 * This is the SECOND net, not the first — the first is the key rule above (a time key is never read
 * as a pace). This one catches a race time typed into a PACE field, which is the same mistake one
 * layer up: a mid-pack 5K time (20:00–45:00) landing in `fiveK_pace` reads as 1200–2700 sec/mi and
 * is rejected here rather than prescribed. A tier that fails the band falls through to the next
 * tier; it is never rescued by guessing that the athlete meant a time.
 */
const PACE_SANE_SEC_PER_MI = { min: 180, max: 1200 };

/** Where the number came from. Travels to the surface with it (Law 3). */
export type FiveKPaceSource =
  | 'manual'        // the athlete typed a PACE
  | 'race-time'     // derived from the athlete's typed 5K race TIME. An assertion, arithmetically converted.
  | 'effort_paces'; // wizard/VDOT interval pace. An INFERENCE — is_estimate: true.

export type ResolvedFiveKPace = {
  /** sec per MILE. null = we do not know. Consumers MUST disclose, never invent. */
  sec_per_mi: number | null;
  source: FiveKPaceSource | null;
  /** Law 2 — an inference must declare itself. */
  is_estimate: boolean;
  /** The race clock behind a 'race-time' resolution, in seconds. null on every other tier. */
  race_time_sec: number | null;
};

type PerformanceNumbersLike = {
  /** sec/MILE, or "7:15" / "7:15/mi" / "7:15/km" */
  fiveK_pace?: number | string | null;
  /** camelCase variant of the same */
  fiveKPace?: number | string | null;
  /** sec/MILE */
  fiveK_pace_sec_per_mi?: number | string | null;
  /** a "7:15" STRING in min/MILE */
  five_k_pace_min_per_mi?: number | string | null;
  /** ⛔ A RACE CLOCK ("22:30"), or total seconds. NOT A PACE. */
  fiveK?: number | string | null;
  /** ⛔ Also a race clock. `_shared/arc-context.ts:494` reads this spelling. NOT A PACE. */
  fiveKTime?: number | string | null;
} | null | undefined;

type EffortPacesLike = {
  /** sec/MILE — the key `coach/index.ts:4917` reads. Nothing writes it today; kept so it cannot rot. */
  five_k?: number | string | null;
  /** sec/MILE — Daniels interval pace, what `getPacesFromScore` actually writes (`effort-score.ts:19`). */
  power?: number | string | null;
} | null | undefined;

export type FiveKBaselinesLike = {
  performance_numbers?: PerformanceNumbersLike;
  effort_paces?: EffortPacesLike;
} | null | undefined;

const NULL_RESULT: ResolvedFiveKPace = {
  sec_per_mi: null, source: null, is_estimate: false, race_time_sec: null,
};

/** Guard BEFORE Number() — `Number(null) === 0` is a documented repeat bug in this codebase. */
function asPositiveFinite(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * A stored PACE → sec/MILE. Handles the three shapes that coexist: a number (already sec/mi),
 * "m:ss" or "m:ss/mi", and "m:ss/km" (converted here, once). Anything else is "we don't know",
 * never a silent 0.
 */
export function parseFiveKPaceToSecPerMi(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return asPositiveFinite(v);
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,3}):([0-5]\d)\s*(?:\/\s*(mi|km))?/i);
  if (m) {
    const secs = Number(m[1]) * 60 + Number(m[2]);
    if (!(secs > 0)) return null;
    return (m[3] || '').toLowerCase() === 'km' ? Math.round(secs * SEC_PER_KM_TO_SEC_PER_MI) : secs;
  }
  return asPositiveFinite(s);
}

/** A stored race CLOCK → total seconds. "22:30", "1:02:30", or a bare number of seconds. */
function parseRaceClockToSec(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return asPositiveFinite(v);
  const s = String(v).trim().replace(/\/(mi|km)$/i, '').trim();
  if (!s) return null;
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return asPositiveFinite(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return asPositiveFinite(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 1) return asPositiveFinite(parts[0]);
  return null;
}

function inPaceBand(secPerMi: number | null): number | null {
  if (secPerMi == null) return null;
  return secPerMi >= PACE_SANE_SEC_PER_MI.min && secPerMi <= PACE_SANE_SEC_PER_MI.max ? secPerMi : null;
}

/**
 * First candidate that parses AND is a plausible pace. Banded per candidate, not once at the end:
 * a `fiveK_pace` holding a race time must not shadow a good `fiveKPace` sitting next to it.
 */
function firstUsablePace(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const v = inPaceBand(parseFiveKPaceToSecPerMi(c));
    if (v != null) return Math.round(v);
  }
  return null;
}

/**
 * The athlete's stated 5K RACE TIME, in seconds — the OTHER fact these keys carry, given its own
 * named accessor so nothing has to reach for `performance_numbers.fiveK` and decide for itself what
 * it is holding. Sanity-banded; returns null when absent or implausible.
 */
export function resolveFiveKRaceTimeSec(baselines: FiveKBaselinesLike): number | null {
  const pn = baselines?.performance_numbers;
  const sec = parseRaceClockToSec(pn?.fiveK ?? pn?.fiveKTime);
  if (sec == null) return null;
  return sec >= RACE_TIME_SANE_SEC.min && sec <= RACE_TIME_SANE_SEC.max ? Math.round(sec) : null;
}

/**
 * The athlete's current 5K pace, in sec/MILE, with its provenance attached.
 *
 * Precedence:
 *   1. a typed PACE (`fiveK_pace` / `fiveKPace` / `fiveK_pace_sec_per_mi` /
 *      `five_k_pace_min_per_mi`)                                    -> 'manual',      not an estimate
 *   2. the typed 5K RACE TIME, divided by 3.106856 mi               -> 'race-time',   an estimate
 *   3. `effort_paces.five_k` / `.power` (wizard/VDOT)               -> 'effort_paces', an estimate
 *   4. null — we do not know. SAY SO. (Never a bare literal; see D-285.)
 *
 * Tier 2 sits ABOVE tier 3 because `AppContext.tsx:318-328` already performs exactly this derivation
 * on save and writes the answer into `fiveK_pace`, i.e. into TIER 1. A row that missed that backfill
 * must land in the same place, not below a VDOT table lookup. Tier 3 sits at the bottom for the same
 * reason it does in `resolve-current-run-pace.ts`: `effort_paces` is an inference, and an assertion
 * beats an inference.
 *
 * ⚠ THIS FLIPS `materialize-plan`'s ORDER. That file read `effort_paces.power` BEFORE the typed keys
 * — the same inversion audit 2026-07-17 #6 called a bug in the coach's threshold read. An athlete
 * carrying both now gets their own number. The snapshot pin still outranks all of it, unchanged.
 */
export function resolveCurrent5kPace(baselines: FiveKBaselinesLike): ResolvedFiveKPace {
  if (!baselines) return NULL_RESULT;
  const pn = baselines.performance_numbers;

  // ── 1. A TYPED PACE. `five_k_pace_min_per_mi` only when it is a STRING: a bare number in a field
  // named "min per mi" is ambiguous minutes-vs-seconds, and mis-reading it is worse than skipping it
  // (identical rule to `threshold_pace_min_per_mi` in resolve-current-run-pace.ts).
  const typed = firstUsablePace(
    pn?.fiveK_pace,
    pn?.fiveKPace,
    pn?.fiveK_pace_sec_per_mi,
    typeof pn?.five_k_pace_min_per_mi === 'string' ? pn.five_k_pace_min_per_mi : null,
  );
  if (typed != null) {
    return { sec_per_mi: typed, source: 'manual', is_estimate: false, race_time_sec: null };
  }

  // ── 2. THE RACE TIME, converted. Never passed through as a pace.
  const raceSec = resolveFiveKRaceTimeSec(baselines);
  const fromRace = inPaceBand(raceSec == null ? null : Math.round(raceSec / FIVE_K_MILES));
  if (fromRace != null) {
    return { sec_per_mi: fromRace, source: 'race-time', is_estimate: true, race_time_sec: raceSec };
  }

  // ── 3. THE WIZARD/VDOT INFERENCE.
  const wizard = firstUsablePace(baselines.effort_paces?.five_k, baselines.effort_paces?.power);
  if (wizard != null) {
    return { sec_per_mi: wizard, source: 'effort_paces', is_estimate: true, race_time_sec: null };
  }

  // ── 4. We do not know.
  return NULL_RESULT;
}

/**
 * THE WRITE SIDE of the same fact, kept in this file on purpose: a stored 5K race TIME → the pace
 * STRING to persist beside it, in the athlete's own units.
 *
 * `AppContext.saveUserBaselines` is the only writer of `performance_numbers.fiveK_pace` in the app,
 * and it used to carry its own copy of this arithmetic — with the mile divisor and a `/km` suffix, so
 * a metric athlete's stored pace was seconds per MILE wearing a per-KM label, and any reader honouring
 * the suffix converted it a second time. Deriving it here means the writer emits exactly what
 * `resolveCurrent5kPace` would read back, in both unit systems, and the two cannot drift.
 *
 * Returns null when the time is absent, unparseable, or would derive a pace this file would refuse to
 * read (both sanity bands apply) — we do not persist a number we would not accept.
 */
export function deriveFiveKPaceFromRaceTime(rawFiveK: unknown, metric: boolean): string | null {
  const r = resolveCurrent5kPace({ performance_numbers: { fiveK: rawFiveK as string | number | null } });
  return r.source === 'race-time' ? formatFiveKPace(r.sec_per_mi, metric) : null;
}

/** sec/MILE → "m:ss/mi" (or "m:ss/km" when `metric`). For surfaces that render the pace as a string. */
export function formatFiveKPace(secPerMi: number | null, metric = false): string | null {
  if (secPerMi == null || !Number.isFinite(secPerMi) || secPerMi <= 0) return null;
  const s = Math.round(metric ? secPerMi / SEC_PER_KM_TO_SEC_PER_MI : secPerMi);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}/${metric ? 'km' : 'mi'}`;
}
