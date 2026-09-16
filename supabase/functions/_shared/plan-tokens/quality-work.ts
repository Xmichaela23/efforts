/**
 * ═══ A QUALITY SESSION'S WORK, PARSED ONCE AND PRICED ONCE (2026-09-11) ══════════════════════════
 *
 * ⛔ WHY IT EXISTS. The Instead sheet has to say what a workout IS before the athlete taps it, and
 * the only honest source for that is the expansion that writes the session's own steps. That
 * expansion lived inside `materialize-plan/index.ts`, which cannot be imported (it calls
 * `Deno.serve` at the top level), so the sheet would have needed a second parser and a second
 * pricing rule — and a second copy of "130% of threshold" is how the sheet comes to promise a
 * session the plan does not build.
 *
 * ⛔ SO THE FOUR QUALITY SHAPES ARE PARSED AND PRICED HERE, AND `materialize-plan` CALLS THIS. Its
 * four branches now hand the token over and stamp ids on what comes back; the sheet asks the same
 * parser for the same session and renders the line. One grammar, one arithmetic, two readers.
 *
 * | shape | emitted by | example |
 * |---|---|---|
 * | `round_{n}x_{segs}[_R{s}s]` | `run_mlss`, `ride_anaerobic` (compound rounds) | `round_3x_15s130-45s105-r60svt1_R120s` |
 * | `interval_{n}x{s}s_{pct}pct[_R{s}s]` | `run_near_threshold` | `interval_8x240s_90pct_R75s` |
 * | `bike_ss_{n}x{m}min_R{m}min` | `ride_sweet_spot` | `bike_ss_4x8min_R4min` |
 * | `bike_thr_{n}x{m}min_R{m}min` | `ride_sweet_spot` (medium) | `bike_thr_8x3min_R2min` |
 *
 * ⚠️ PERCENT OF THRESHOLD **SPEED** ON FOOT, SO THE PACE DIVIDES — 130% is the threshold pace over
 * 1.30. **PERCENT OF FTP ON THE BIKE, SO THE POWER MULTIPLIES.** Opposite arithmetic, same word, and
 * both were already commented that way at the branches this replaces.
 * ⚠️ NOTHING HERE READS A BASELINE ROW. The caller resolves threshold, easy pace and FTP and hands
 * the numbers in, because `materialize-plan` and the sheet reach them by different routes.
 */

/** One step of the work, before it is priced: the shape's own numbers. */
export type QualitySegment = {
  role: 'work' | 'recovery';
  seconds: number;
  /** Percent of threshold speed / of FTP, as the page prints it. Null on an untargeted step. */
  pct: number | null;
  /**
   * ⛔ THE TOP OF A PRINTED RANGE, where the page prints one (p238 VO2: *"3 minutes @ 110 to 120%"*) —
   * token `180s110to120`. Absent on every single-number segment, which keeps its meaning exactly.
   */
  pctHi?: number | null;
  /**
   * An untargeted step's own word — the page's `VT1`, its easy spin, its unresolved race pace, or an
   * ALL-OUT effort (p236 sprints: *"max effort"*), which is prescribed work with no power target.
   */
  at: 'vt1' | 'easy' | 'racepace' | 'allout' | null;
};

export type QualityWork =
  /** `round_{n}x_{segs}` — n SETS of the segment sequence, which is itself rounds of a repeating unit. */
  | { kind: 'round'; sets: number; segments: QualitySegment[]; restBetweenS: number }
  /** `interval_{n}x{s}s_{pct}pct` — n repeats at one percentage, with an easy float between. */
  | { kind: 'interval'; reps: number; workS: number; pct: number; restS: number }
  /** `bike_ss_` / `bike_thr_` — n repeats inside a BAND the token names by its prefix, not by a number. */
  | {
    kind: 'band'; reps: number; workS: number; restS: number; lo: number; hi: number;
    /**
     * ⚠️ THE TWO BRANCHES DIFFERED AND THE DIFFERENCE IS KEPT: a sweet-spot rest carries the
     * recovery band, a threshold rest carries no power at all. Preserved rather than tidied — a
     * step that gains a target here would change what every existing plan's watch file asks for.
     */
    restPowered: boolean;
  };

/**
 * ⛔ THE TWO BANDS ARE THE ONES THE EXPANDER ALREADY USED — sweet spot 85-95% of FTP, the medium
 * repeat 95-105%. They are the token's meaning rather than a number inside it.
 */
// OURS — `BIKE_BANDS` sweet spot 85–95% and threshold repeat 95–105% of FTP, as the expander already used; no page or field source in the repo, kept as found
export const BIKE_BANDS = {
  ss: { lo: 0.85, hi: 0.95 },
  thr: { lo: 0.95, hi: 1.05 },
} as const;

/** The recovery spin either side of a bike interval — `RIDE_RECOVERY_PCT`, unchanged. */
// OURS — `RIDE_RECOVERY_PCT` recovery spin 45–55% of FTP; no source, kept as found
export const RIDE_RECOVERY_PCT = { lo: 0.45, hi: 0.55 } as const;

// ⚠️ `allout` AND `{lo}to{hi}` ADDED 2026-09-13 for p278's VO2 and sprint rides. Additive: every token
// that parsed before parses to the same thing.
const SEGMENT = /^(r?)(\d+)s(\d+to\d+|\d+|vt1|easy|racepace|allout)$/;
const ROUND = /^round_(\d+)x_((?:r?\d+s(?:\d+to\d+|\d+|vt1|easy|racepace|allout))(?:-r?\d+s(?:\d+to\d+|\d+|vt1|easy|racepace|allout))*)(?:_[rR](\d+)s)?$/;
const INTERVAL = /^interval_(\d+)x(\d+)s_(\d+)pct(?:_[rR](\d+)s)?$/;
const BIKE_BAND = /^bike_(ss|thr)_(\d+)x(\d+)min_[rR](\d+)min$/;

/** The token's own numbers, or null when it is not one of the four quality shapes. */
export function parseQualityWork(token: string | null | undefined): QualityWork | null {
  const lower = String(token ?? '').toLowerCase();

  const round = lower.match(ROUND);
  if (round) {
    const segments: QualitySegment[] = [];
    for (const seg of round[2].split('-')) {
      const m = seg.match(SEGMENT);
      if (!m) continue;
      const at = m[3];
      const named = at === 'vt1' || at === 'easy' || at === 'racepace' || at === 'allout';
      const range = named ? null : at.match(/^(\d+)to(\d+)$/);
      segments.push({
        // ⚠️ THE LEADING `r` IS THE SOURCE'S OWN WORD — see `compoundRoundToken`. A 50% segment
        // without it is prescribed work; with it, it is the recovery the page names.
        role: m[1] === 'r' || (named && at !== 'racepace' && at !== 'allout') ? 'recovery' : 'work',
        seconds: parseInt(m[2], 10),
        pct: named ? null : parseInt(range ? range[1] : at, 10) / 100,
        ...(range ? { pctHi: parseInt(range[2], 10) / 100 } : {}),
        at: named ? (at as 'vt1' | 'easy' | 'racepace' | 'allout') : null,
      });
    }
    if (segments.length === 0) return null;
    return {
      kind: 'round',
      sets: Math.max(1, parseInt(round[1], 10)),
      segments,
      restBetweenS: round[3] ? parseInt(round[3], 10) : 0,
    };
  }

  const interval = lower.match(INTERVAL);
  if (interval) {
    return {
      kind: 'interval',
      reps: parseInt(interval[1], 10),
      workS: parseInt(interval[2], 10),
      pct: parseInt(interval[3], 10) / 100,
      restS: interval[4] ? parseInt(interval[4], 10) : 0,
    };
  }

  const band = lower.match(BIKE_BAND);
  if (band) {
    const b = BIKE_BANDS[band[1] as 'ss' | 'thr'];
    return {
      kind: 'band',
      reps: parseInt(band[2], 10),
      workS: parseInt(band[3], 10) * 60,
      restS: parseInt(band[4], 10) * 60,
      lo: b.lo,
      hi: b.hi,
      restPowered: band[1] === 'ss',
    };
  }

  return null;
}

// ── PRICING ──────────────────────────────────────────────────────────────────────────────────────

/** Percent of threshold SPEED as a pace: the threshold pace over the percentage. */
export function pacedAt(pct: number | null | undefined, thresholdSecPerMi: number | null | undefined): number | undefined {
  const thr = Number(thresholdSecPerMi);
  const p = Number(pct);
  return Number.isFinite(thr) && thr > 0 && Number.isFinite(p) && p > 0 ? Math.round(thr / p) : undefined;
}

/**
 * ⛔⛔ THE BAND AROUND A SINGLE PRINTED PERCENTAGE, DEFINED ONCE (2026-09-15, WORKORDER Stage 3
 * session 6). "2:30 @ 90%" is one number, and a step judged at exactly that number is red on every
 * repeat — `151-151 W` is not a range. Four copies of ±5% stood in the app (the materializer's prose
 * parser, two in `get-week`, the Garmin sender's centre fallback); this is the one, and it sits
 * where a percentage becomes watts rather than where a string is re-parsed.
 *
 * // OURS — no field source. Searched TrainerRoad support + forum, Zwift support and Zwift Insider,
 * TrainingPeaks Workout Builder help + FAQ, intervals.icu forum and docs: none of them publishes a
 * tolerance for judging a single-target step. TrainingPeaks offers Target OR Range per step and does
 * not widen a Target; TrainerRoad's own workouts use a fixed 20 W spread, a different rule on a
 * different quantity, and borrowing it would be the same class of error as the ACWR clause.
 * Ledger: `docs/STATE-SOURCES.md`, row "Single-percent power band".
 */
// OURS — `SINGLE_PERCENT_BAND` ±5% (see the block above; STATE-SOURCES single-percent power band row)
export const SINGLE_PERCENT_BAND = 0.05;

/**
 * Percent of FTP as watts. Undefined without an FTP — the step then carries no target, as it always did.
 *
 * ⛔ A SINGLE PERCENTAGE GETS `SINGLE_PERCENT_BAND` EITHER SIDE. Both ends equal is the caller saying
 * "the page printed one number here", which is the whole of the rule's trigger.
 * ⛔ AND `floorOnlyAtOrAbovePct` LEAVES THE CEILING OFF — p237, see `FAMILIES.ride_anaerobic.floorOnly`.
 * An ABSENT `upper` is the app's existing way of saying "no ceiling": `analyze-cycling-workout` already
 * reads a missing upper as Infinity, and the zone rows already print an absent bound as "176 bpm and up".
 */
export function wattsAt(
  lo: number,
  hi: number,
  ftp: number | null | undefined,
  floorOnlyAtOrAbovePct?: number | null,
): { lower: number; upper?: number } | undefined {
  const f = Number(ftp);
  if (!Number.isFinite(f) || f <= 0) return undefined;
  const floorPct = Number(floorOnlyAtOrAbovePct);
  if (Number.isFinite(floorPct) && floorPct > 0 && lo >= floorPct) {
    return { lower: Math.round(lo * f) };
  }
  if (lo === hi) {
    return {
      lower: Math.round(lo * f * (1 - SINGLE_PERCENT_BAND)),
      upper: Math.round(lo * f * (1 + SINGLE_PERCENT_BAND)),
    };
  }
  return { lower: Math.round(lo * f), upper: Math.round(hi * f) };
}

export type RunStep = { kind: 'work' | 'recovery'; duration_s: number; pace_sec_per_mi?: number };
/** ⚠️ `upper` IS OPTIONAL: a floor-only step has no ceiling to carry. See `wattsAt`. */
export type RideStep = { kind: 'work' | 'recovery'; duration_s: number; power_range?: { lower: number; upper?: number } };

/**
 * The work as running steps — what `expandRunToken` pushes for these two shapes, id aside.
 * ⚠️ THE TRAILING FLOAT AND THE TRAILING REST ARE SKIPPED: you do not recover after the last rep.
 */
export function qualityRunSteps(
  work: QualityWork,
  paces: { thresholdSecPerMi?: number | null; easySecPerMi?: number | null },
): RunStep[] {
  const thr = paces.thresholdSecPerMi ?? null;
  const easy = paces.easySecPerMi ?? null;
  const easyPace = Number(easy) > 0 ? Math.round(Number(easy)) : undefined;
  const out: RunStep[] = [];
  if (work.kind === 'round') {
    for (let r = 0; r < work.sets; r += 1) {
      for (const seg of work.segments) {
        if (seg.at === 'racepace' || seg.at === 'allout') {
          // ⛔ PRESCRIBED WORK WITH NO PACE, and the library says so itself: race pace is set by the
          // race, not by this library. The step reaches the watch; the number does not, because
          // there is no number.
          out.push({ kind: 'work', duration_s: seg.seconds });
        } else if (seg.role === 'recovery') {
          const paced = pacedAt(seg.pct, thr) ?? easyPace;
          out.push({ kind: 'recovery', duration_s: seg.seconds, ...(paced ? { pace_sec_per_mi: paced } : {}) });
        } else {
          const paced = pacedAt(seg.pct, thr);
          out.push({ kind: 'work', duration_s: seg.seconds, ...(paced ? { pace_sec_per_mi: paced } : {}) });
        }
      }
      if (work.restBetweenS > 0 && r < work.sets - 1) {
        out.push({ kind: 'recovery', duration_s: work.restBetweenS, ...(easyPace ? { pace_sec_per_mi: easyPace } : {}) });
      }
    }
    return out;
  }
  if (work.kind === 'interval') {
    const paced = pacedAt(work.pct, thr);
    for (let i = 0; i < work.reps; i += 1) {
      out.push({ kind: 'work', duration_s: work.workS, ...(paced ? { pace_sec_per_mi: paced } : {}) });
      if (work.restS > 0 && i < work.reps - 1) {
        out.push({ kind: 'recovery', duration_s: work.restS, ...(easyPace ? { pace_sec_per_mi: easyPace } : {}) });
      }
    }
  }
  return out;
}

/**
 * The work as riding steps — what `expandBikeToken` pushes for these three shapes, id aside.
 * ⚠️ `floorOnlyAtOrAbovePct` IS THE FAMILY'S WORK FLOOR, and only `ride_anaerobic` passes one
 * (`FAMILIES.ride_anaerobic.floorOnly`, p237). Every other family passes nothing and builds as before.
 */
export function qualityRideSteps(
  work: QualityWork,
  ftp: number | null | undefined,
  floorOnlyAtOrAbovePct?: number | null,
): RideStep[] {
  const recovery = wattsAt(RIDE_RECOVERY_PCT.lo, RIDE_RECOVERY_PCT.hi, ftp);
  const out: RideStep[] = [];
  if (work.kind === 'round') {
    for (let r = 0; r < work.sets; r += 1) {
      for (const seg of work.segments) {
        // ⛔ AN ALL-OUT STEP IS WORK WITH NO POWER TARGET — p236's "max effort", unresolved on purpose (p229).
        if (seg.at === 'racepace' || seg.at === 'allout') out.push({ kind: 'work', duration_s: seg.seconds });
        else if (seg.at) out.push({ kind: 'recovery', duration_s: seg.seconds, ...(recovery ? { power_range: recovery } : {}) });
        else {
          // ⚠️ THE FLOOR IS OFFERED TO WORK ONLY. A recovery the page prints a percentage for (p237's
          // 50% half) is a stated number, not an effort with a floor, and keeps its band.
          const w = wattsAt(
            seg.pct ?? 0,
            seg.pctHi ?? seg.pct ?? 0,
            ftp,
            seg.role === 'work' ? floorOnlyAtOrAbovePct : null,
          );
          out.push({ kind: seg.role, duration_s: seg.seconds, ...(w ? { power_range: w } : {}) });
        }
      }
      if (work.restBetweenS > 0 && r < work.sets - 1) {
        out.push({ kind: 'recovery', duration_s: work.restBetweenS, ...(recovery ? { power_range: recovery } : {}) });
      }
    }
    return out;
  }
  if (work.kind === 'band') {
    const w = wattsAt(work.lo, work.hi, ftp);
    for (let i = 0; i < work.reps; i += 1) {
      out.push({ kind: 'work', duration_s: work.workS, ...(w ? { power_range: w } : {}) });
      // ⚠️ `bike_thr_` RESTS CARRY NO POWER and `bike_ss_` RESTS DO — see `restPowered`.
      if (work.restS > 0 && i < work.reps - 1) {
        out.push({ kind: 'recovery', duration_s: work.restS, ...(work.restPowered && recovery ? { power_range: recovery } : {}) });
      }
    }
  }
  return out;
}

// ── THE LINE ─────────────────────────────────────────────────────────────────────────────────────

/**
 * ⛔⛔ THE WORKOUT AS THE PAGE PRINTS IT, WITH THE ATHLETE'S OWN NUMBERS IN IT (Michael, 2026-09-11).
 *
 * ⛔ THE WORDS ARE THE PAGE'S STRUCTURE AND NOTHING ELSE: the numbers, the units, `rounds`, `sets`,
 * `easy` and `between`. No verb, no benefit, no session name — the option's own label is the name.
 * ⛔ AND THE NUMBERS ARE THE SESSION'S, not the page's bands. The line is rendered off the same
 * parsed work the steps are built from, so the sheet cannot promise a session the tap does not
 * write: a shape the composer sized to five rounds says five.
 * ⚠️ NO PACE OR FTP, NO INVENTION — the percentages print as the page prints them, which is the
 * honest state rather than a number derived from a baseline the athlete has not got.
 */
export type QualityPricing = {
  /** Threshold pace, sec per MILE — `pace_sec_per_mi` is the app's unit end to end. */
  thresholdSecPerMi?: number | null;
  ftp?: number | null;
  /** What the athlete reads distance in. Paces print per mile or per kilometre; watts are watts. */
  units?: 'imperial' | 'metric' | null;
  /**
   * The family's work floor, where the family prescribes a floor and no ceiling — `ride_anaerobic`
   * and nothing else (p237). The sheet's line and the steps the tap builds read the same number, so
   * the line cannot promise a ceiling the session does not carry.
   */
  floorOnlyAtOrAbovePct?: number | null;
};

// FIELD — definition (1 mi = 1.609344 km; 1.60934 as written)
const SEC_PER_MI_TO_KM = 1.60934;

/** `4:40`, `3 min`, `45 s` — the page's own way of writing a duration. */
export function durationWord(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s % 60 === 0) return `${s / 60} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `6:20/mi`, or per kilometre for a metric athlete. */
export function paceWord(secPerMi: number, units?: 'imperial' | 'metric' | null): string {
  const per = units === 'metric' ? secPerMi / SEC_PER_MI_TO_KM : secPerMi;
  const s = Math.round(per);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/${units === 'metric' ? 'km' : 'mi'}`;
}

/**
 * `185–220 W`, or `252 W` where the band is a single number.  An en dash, as the page sets ranges.
 * ⛔ AND `202 W and up` WHERE THERE IS NO CEILING (2026-09-15, approved) — the house style the zone
 * rows already print ("176 bpm and up", `save-baselines/zones.ts`).
 */
export function wattWord(range: { lower: number; upper?: number }): string {
  if (range.upper == null) return `${range.lower} W and up`;
  return range.lower === range.upper ? `${range.lower} W` : `${range.lower}–${range.upper} W`;
}

/** `130%`, `85–95%` — what a step says when the athlete has no pace or FTP to price it with. */
export function percentWord(lo: number, hi: number): string {
  const l = Math.round(lo * 100), h = Math.round(hi * 100);
  return l === h ? `${l}%` : `${l}–${h}%`;
}

/**
 * The smallest unit the segment list repeats, and how many times — so a flattened round reads the
 * way the page prints it. ⚠️ THE LAST REPETITION MAY BE SHORT: the composer drops the float after
 * the final round, exactly as the page's own "N rounds of" does.
 */
export function repeatingUnit(segments: QualitySegment[]): { unit: QualitySegment[]; rounds: number } {
  const same = (a: QualitySegment, b: QualitySegment) =>
    a.role === b.role && a.seconds === b.seconds && a.pct === b.pct && (a.pctHi ?? null) === (b.pctHi ?? null) && a.at === b.at;
  const repeats = (k: number): boolean => {
    for (let i = k; i < segments.length; i += 1) if (!same(segments[i], segments[i % k])) return false;
    return true;
  };
  /**
   * ⛔ A WHOLE NUMBER OF REPETITIONS FIRST (2026-09-11). p237's sandwich is `30 s @ 120% / 2:30 @
   * 90% / 30 s @ 120%` — a round that ends the way it starts — and the short-last-repetition rule
   * below read it as two rounds of (30 s, 2:30) with the closing surge as a stub, so the sheet said
   * "5 sets of 2 rounds" for five rounds of three steps. A unit that divides the list exactly is
   * the page's own structure; the stub reading is only for a list nothing divides.
   */
  for (let k = 1; k < segments.length; k += 1) {
    if (segments.length % k === 0 && repeats(k)) return { unit: segments.slice(0, k), rounds: segments.length / k };
  }
  // ⚠️ THE STUB READING, ONLY WHERE THE MISSING TAIL IS RECOVERY — the composer's own habit of
  // dropping the float after the last round. A missing WORK step is not a stub; it is a different
  // round (the sandwich's closing surge), and the list is then one round as written.
  for (let k = 1; k < segments.length; k += 1) {
    if (!repeats(k)) continue;
    const dropped = segments.slice(0, k).slice(segments.length % k);
    if (dropped.every((s) => s.role === 'recovery')) return { unit: segments.slice(0, k), rounds: Math.ceil(segments.length / k) };
  }
  return { unit: segments, rounds: 1 };
}

function runSegmentWord(seg: QualitySegment, p: QualityPricing): string {
  const dur = durationWord(seg.seconds);
  if (seg.at === 'vt1' || seg.at === 'easy') return `${dur} easy`;
  if (seg.at === 'racepace' || seg.pct == null) return dur;
  const paced = pacedAt(seg.pct, p.thresholdSecPerMi);
  return `${dur} at ${paced ? paceWord(paced, p.units) : percentWord(seg.pct, seg.pct)}`;
}

function rideSegmentWord(seg: QualitySegment, p: QualityPricing): string {
  const dur = durationWord(seg.seconds);
  if (seg.at === 'vt1' || seg.at === 'easy') return `${dur} easy`;
  // ⚠️ COPY NOT YET APPROVED (2026-09-13): the word for an all-out effort on the line. Held for Michael.
  if (seg.at === 'allout') return `${dur} ${ALL_OUT_WORD}`;
  if (seg.at === 'racepace' || seg.pct == null) return dur;
  const hi = seg.pctHi ?? seg.pct;
  const w = wattsAt(seg.pct, hi, p.ftp, seg.role === 'work' ? p.floorOnlyAtOrAbovePct : null);
  return `${dur} at ${w ? wattWord(w) : percentWord(seg.pct, hi)}`;
}

/** ⚠️ PROPOSED, NOT APPROVED — every athlete-facing word goes through Michael before it ships. */
export const ALL_OUT_WORD = 'all out';

/** One line: the work, in the page's structure, priced for this athlete. Empty for an unknown token. */
export function qualityWorkLine(work: QualityWork | null, sport: 'run' | 'ride', p: QualityPricing): string {
  if (!work) return '';
  /**
   * ⚠️ A SEMICOLON WHERE THE BODY ALREADY HAS COMMAS — the page's own punctuation for a round's rest
   * ("…; 2-min recovery walk/jog between sets"), so the rest cannot be read as a fourth segment.
   */
  const between = (seconds: number, sep = ', ') => (seconds > 0 ? `${sep}${durationWord(seconds)} easy between` : '');
  if (work.kind === 'round') {
    const { unit, rounds } = repeatingUnit(work.segments);
    const body = unit.map((seg) => (sport === 'run' ? runSegmentWord(seg, p) : rideSegmentWord(seg, p))).join(', ');
    // ⛔ `Nx` IS THE ROUNDS WHEN THE SEQUENCE IS ONE UNIT, and the SETS when the unit repeats inside
    // it — which is the page's own two-level grammar ("2 sets of 4 rounds of: …").
    const head = rounds > 1
      ? (work.sets > 1 ? `${work.sets} sets of ${rounds} rounds: ` : `${rounds} rounds: `)
      : (work.sets > 1 ? `${work.sets} rounds: ` : '');
    return `${head}${body}${between(work.restBetweenS, unit.length > 1 ? '; ' : ', ')}`;
  }
  if (work.kind === 'interval') {
    const paced = pacedAt(work.pct, p.thresholdSecPerMi);
    const iw = wattsAt(work.pct, work.pct, p.ftp, p.floorOnlyAtOrAbovePct);
    const at = sport === 'run'
      ? (paced ? paceWord(paced, p.units) : percentWord(work.pct, work.pct))
      : (iw ? wattWord(iw) : percentWord(work.pct, work.pct));
    return `${work.reps} × ${durationWord(work.workS)} at ${at}${between(work.restS)}`;
  }
  const w = wattsAt(work.lo, work.hi, p.ftp);
  return `${work.reps} × ${durationWord(work.workS)} at ${w ? wattWord(w) : percentWord(work.lo, work.hi)}${between(work.restS)}`;
}
