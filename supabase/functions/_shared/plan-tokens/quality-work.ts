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

/**
 * ⛔ A RIDE RECOVERY CARRIES A TARGET ONLY WHERE THE PAGE PRINTS ONE (Michael, 2026-09-18). p237's "1 min @ 50%"
 * goes as its range (50% ±`SINGLE_PERCENT_BAND`, 45–55%); a plain "easy spin" goes with no target, to Garmin and to
 * Intervals.icu/Zwift alike. Replaces the OURS 45–55% every unprinted recovery carried (2026-09-02).
 */

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
 * ⛔ ±10%, TRAININGPEAKS (2026-09-18, Michael). TrainingPeaks help, "Workout Builder" (help.trainingpeaks.com,
 * article 115001844087): "the range on your device will show +/- 10% from the interval target … to avoid
 * triggering device alerts/beeps". Replaces the OURS ±5% of 2026-09-15. The plan's pricing (`wattsAt`), the Garmin
 * send and the ride score (`_shared/ride-power.ts judgedPowerRange`) all read this one constant.
 * Ledger: `docs/STATE-SOURCES.md`, row "Single-percent power band".
 */
export const SINGLE_PERCENT_BAND = 0.10;

/**
 * ⛔⛔ THE ONE OWNER OF A STEP'S RANGE — WATTS AND RUN PACE (round 4, 2026-09-18; the page tops, round 5, 2026-09-18,
 * Michael's ruling). Every ride and run step has a top, except an all-out step (p236, p229–231), which carries no
 * target anywhere. The top is:
 *   · a single printed number: that number ±`SINGLE_PERCENT_BAND`. FIELD — TrainingPeaks help, "Workout Builder"
 *     (help.trainingpeaks.com, article 115001844087): "the range on your device will show +/- 10% from the interval
 *     target … to avoid triggering device alerts/beeps".
 *   · a printed range (p238 VO2 "110 to 120%"): the range's own top.
 *   · a page's own top, where the step's ride type prints one (`top`): it wins over the ±10% band where the two
 *     disagree — sweet spot's 95% runs 85.5–100% of FTP, not 85.5–104.5%. The ride tops are below
 *     (`EASY_RIDE_CEILING_PCT_OF_FTP`, `SWEET_SPOT_TOP_PCT_OF_FTP`, `ANAEROBIC_TOP_PCT_OF_FTP`) and `wattsAt` applies
 *     them by the ride type's rule; an easy run's top is the easy pace range's own (p235, `materialize-plan
 *     stampRunPrescription`).
 * Read by: the plan's watts (`wattsAt`), the plan's run pace (`materialize-plan toV3Step`), the ride score
 * (`ride-power.ts judgedPowerRange`), the Garmin send (`garmin/convert-workout.ts`), the analyzers' token fallback
 * (`token-parser.ts`) and the run analyzer's single-pace widening (`analyze-running-workout`). A run pace is banded in
 * seconds per mile, the unit the plan writes it in.
 *
 * `top`: the page's top, in the same unit as `value`; the upper end never passes it.
 * `round: false` keeps the raw ends, for a caller that converts them further (a pace to a speed in m/s).
 */
export function singleTargetBand(
  value: number,
  opts: { top?: number | null; round?: boolean } = {},
): { lower: number; upper: number } {
  const r = opts.round === false ? (x: number) => x : Math.round;
  const band = value * (1 + SINGLE_PERCENT_BAND);
  return {
    lower: r(value * (1 - SINGLE_PERCENT_BAND)),
    upper: r(opts.top != null && Number.isFinite(opts.top) ? Math.min(band, opts.top) : band),
  };
}

// ⛔ `FLOOR_ONLY_SENT_CEILING_PCT_OF_FTP` WAS DELETED IN ROUND 3 (the sends held no ceiling on p237's floor). Round 5
// (2026-09-18, Michael's ruling) puts p237's own top back as `ANAEROBIC_TOP_PCT_OF_FTP`, on the screen and the watch
// only; the score still counts everything at or above the floor.

/**
 * ⛔ THE RIDE TYPE'S OWN RULE FOR A STEP'S RANGE (2026-09-18, Michael approved; the tops, round 5). Decided here, where
 * a percentage becomes watts, and read by every reader off the saved step: the Planned tab, Today, the Performance
 * rows, Execution, the off-prescription line, the Garmin send and the Intervals.icu send.
 *   · `floor` — p237 anaerobic: *"best done by feel with a power FLOOR rather than a specific power target — the
 *     numbers are guidelines"*. EVERY work step is a floor; its top on the screen and the watch is
 *     `ANAEROBIC_TOP_PCT_OF_FTP` (p237 "progress up to 125–130% by the end"), saved as `shown_upper`, and the score
 *     has no top: at or above the floor is in range. Recoveries keep their band.
 *   · `under_threshold` — pp238–239 sweet spot: *"as close to threshold as possible without exceeding it"*. A step at
 *     or below 100% tops out at `SWEET_SPOT_TOP_PCT_OF_FTP`; a printed surge above 100% (the 105% on the minute) is
 *     the page's own number and keeps its ±`SINGLE_PERCENT_BAND`.
 *   · `easy` — p239 endurance: *"easy ride below 75%"*: 0 up to `EASY_RIDE_CEILING_PCT_OF_FTP`.
 *   · none — VO2 (p238, *"more carefully controlled"*) and everything else: a printed range as printed, a single
 *     number ±`SINGLE_PERCENT_BAND`.
 * Sprints (p236) carry no target: the caller writes no range.
 */
export type RidePowerRule = 'floor' | 'under_threshold' | 'easy' | null;

/** Viada p239 — *"easy ride below 75%"*. An easy endurance step is 0 up to this share of FTP, and nothing under it. */
export const EASY_RIDE_CEILING_PCT_OF_FTP = 0.75;

/** Viada pp238–239 — sweet spot *"as close to threshold as possible without exceeding it"*: the top is FTP. */
export const SWEET_SPOT_TOP_PCT_OF_FTP = 1.0;

/**
 * Viada p237 — anaerobic *"Each set should start at 110% and progress up to 125–130% by the end"*: the top of the
 * anaerobic work on the screen and the watch. The score has no top (p237 "by feel with a power floor").
 */
export const ANAEROBIC_TOP_PCT_OF_FTP = 1.3;

/**
 * A step's power range. `upper` absent = the score has no top (p237's floor); `shown_upper` is then the top the
 * screens print and the sends carry. `ride-power.ts shownPowerRange` reads the two for every screen and send.
 */
export type PowerRange = { lower: number; upper?: number; shown_upper?: number };

/**
 * Percent of FTP as watts, by the ride type's rule — the owner above, for rides. Undefined without an FTP — the step
 * then carries no target, as it always did.
 *
 * ⛔ A SINGLE PERCENTAGE (both ends equal — the caller saying "the page printed one number here") GETS
 * `SINGLE_PERCENT_BAND` EITHER SIDE, UNDER THE RIDE TYPE'S TOP.
 * ⛔ THE `floor` RULE SAVES NO `upper` — p237, `FAMILIES.ride_anaerobic.floorOnly`. An ABSENT `upper` is the app's
 * existing way of saying "no ceiling" to the score: `analyze-cycling-workout` reads it as Infinity. The screen and the
 * watch read `shown_upper`.
 * ⛔ THE "NEVER OVER FTP AT OR BELOW 100%" EXTENSION TO EVERY RIDE TYPE IS GONE (round 5, 2026-09-18, Michael): the
 * FTP top is sweet spot's alone. The VO2 warm-up's 95% (p238) is ±10%.
 */
export function wattsAt(
  lo: number,
  hi: number,
  ftp: number | null | undefined,
  rule?: RidePowerRule,
): PowerRange | undefined {
  const f = Number(ftp);
  if (!Number.isFinite(f) || f <= 0) return undefined;
  // p239 — "easy ride below 75%": 0 up to 75% of FTP.
  if (rule === 'easy') return { lower: 0, upper: Math.round(EASY_RIDE_CEILING_PCT_OF_FTP * f) };
  // p237 — a floor; the score has no top, the screen and the watch show p237's 130%. The caller offers the rule to
  // work steps only.
  if (rule === 'floor') {
    return { lower: Math.round(lo * f), shown_upper: Math.round(Math.max(lo, ANAEROBIC_TOP_PCT_OF_FTP) * f) };
  }
  // pp238–239 — sweet spot never over FTP, for a step the page prints at or below 100%.
  const top = rule === 'under_threshold' && lo <= SWEET_SPOT_TOP_PCT_OF_FTP ? SWEET_SPOT_TOP_PCT_OF_FTP * f : null;
  if (lo === hi) return singleTargetBand(lo * f, { top });
  return { lower: Math.round(lo * f), upper: Math.round(top != null ? Math.min(hi * f, top) : hi * f) };
}

/**
 * ⛔ WHICH PLACE IN THE SHAPE A STEP HOLDS (2026-09-18, book-language pass 2). The token carries no word, so the
 * materializer looks the page's word up by this place (`endurance-library/step-words.ts`): the rest between sets, an
 * untargeted recovery inside the round, an all-out effort, a race-pace finish.
 */
export type StepPlace = 'between' | 'in_round' | 'all_out' | 'race_pace';
export type RunStep = { kind: 'work' | 'recovery'; duration_s: number; pace_sec_per_mi?: number; place?: StepPlace };
/** ⚠️ `upper` IS OPTIONAL: a floor-only step has no ceiling to carry. See `wattsAt`. */
export type RideStep = { kind: 'work' | 'recovery'; duration_s: number; power_range?: PowerRange; place?: StepPlace };

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
          out.push({ kind: 'work', duration_s: seg.seconds, place: seg.at === 'racepace' ? 'race_pace' : 'all_out' });
        } else if (seg.role === 'recovery') {
          const paced = pacedAt(seg.pct, thr) ?? easyPace;
          out.push({ kind: 'recovery', duration_s: seg.seconds, ...(paced ? { pace_sec_per_mi: paced } : {}), ...(seg.at === 'easy' ? { place: 'in_round' as const } : {}) });
        } else {
          const paced = pacedAt(seg.pct, thr);
          out.push({ kind: 'work', duration_s: seg.seconds, ...(paced ? { pace_sec_per_mi: paced } : {}) });
        }
      }
      if (work.restBetweenS > 0 && r < work.sets - 1) {
        out.push({ kind: 'recovery', duration_s: work.restBetweenS, ...(easyPace ? { pace_sec_per_mi: easyPace } : {}), place: 'between' });
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
 * ⚠️ `rule` IS THE RIDE TYPE'S (`ridePowerRuleOf`, `endurance-library/source-rules.ts`). A family with no rule
 * passes nothing and builds as before.
 */
export function qualityRideSteps(
  work: QualityWork,
  ftp: number | null | undefined,
  rule?: RidePowerRule,
): RideStep[] {
  const out: RideStep[] = [];
  if (work.kind === 'round') {
    for (let r = 0; r < work.sets; r += 1) {
      for (const seg of work.segments) {
        // ⛔ AN ALL-OUT STEP IS WORK WITH NO POWER TARGET — p236's "max effort", unresolved on purpose (p229).
        if (seg.at === 'racepace' || seg.at === 'allout') out.push({ kind: 'work', duration_s: seg.seconds, place: seg.at === 'racepace' ? 'race_pace' : 'all_out' });
        // A plain easy spin: no target (see the note above `SEGMENT`).
        else if (seg.at) out.push({ kind: 'recovery', duration_s: seg.seconds, place: 'in_round' });
        else {
          // ⚠️ THE RULE IS OFFERED TO WORK ONLY. A recovery the page prints a percentage for (p237's
          // 50% half) is a stated number, not an effort with a floor, and keeps its band.
          const w = wattsAt(
            seg.pct ?? 0,
            seg.pctHi ?? seg.pct ?? 0,
            ftp,
            seg.role === 'work' ? rule : null,
          );
          out.push({ kind: seg.role, duration_s: seg.seconds, ...(w ? { power_range: w } : {}) });
        }
      }
      if (work.restBetweenS > 0 && r < work.sets - 1) {
        out.push({ kind: 'recovery', duration_s: work.restBetweenS, place: 'between' });
      }
    }
    return out;
  }
  if (work.kind === 'band') {
    const w = wattsAt(work.lo, work.hi, ftp, rule);
    for (let i = 0; i < work.reps; i += 1) {
      out.push({ kind: 'work', duration_s: work.workS, ...(w ? { power_range: w } : {}) });
      // The rest between repeats is an easy spin the page gives no number: no target.
      if (work.restS > 0 && i < work.reps - 1) {
        out.push({ kind: 'recovery', duration_s: work.restS, place: 'between' });
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
   * The ride type's rule (`ridePowerRuleOf`). The sheet's line and the steps the tap builds read the same rule, so
   * the line cannot promise a range the session does not carry.
   */
  rule?: RidePowerRule;
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
export function wattWord(range: PowerRange): string {
  // p237's floor prints its shown top (round 5, 2026-09-18); "and up" only where a range carries no top at all.
  const upper = range.upper ?? range.shown_upper;
  if (upper == null) return `${range.lower} W and up`;
  return range.lower === upper ? `${range.lower} W` : `${range.lower}–${upper} W`;
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
  // ⚠️ "easy" stands for the page's "@ VT1" here, and the word VT1 never prints on screen; see step-words.ts.
  if (seg.at === 'vt1' || seg.at === 'easy') return `${dur} easy`;
  if (seg.at === 'racepace' || seg.pct == null) return dur;
  const paced = pacedAt(seg.pct, p.thresholdSecPerMi);
  return `${dur} at ${paced ? paceWord(paced, p.units) : percentWord(seg.pct, seg.pct)}`;
}

function rideSegmentWord(seg: QualitySegment, p: QualityPricing): string {
  const dur = durationWord(seg.seconds);
  // ⛔ p237–p239 print the ride's untargeted recovery as "easy spin" (2026-09-18, book-language pass 2).
  if (seg.at === 'vt1' || seg.at === 'easy') return `${dur} easy spin`;
  // ⚠️ COPY NOT YET APPROVED (2026-09-13): the word for an all-out effort on the line. Held for Michael.
  if (seg.at === 'allout') return `${dur} ${ALL_OUT_WORD}`;
  if (seg.at === 'racepace' || seg.pct == null) return dur;
  const hi = seg.pctHi ?? seg.pct;
  const w = wattsAt(seg.pct, hi, p.ftp, seg.role === 'work' ? p.rule : null);
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
  // ⛔ NO WORD OF OURS ON THE REST (2026-09-18, book-language pass 2): it said "easy between" on every shape, where the
  // pages say "recovery walk/jog", "rest", "spin" or "easy spin" by shape. The line keeps the page's structure word.
  const between = (seconds: number, sep = ', ') => (seconds > 0 ? `${sep}${durationWord(seconds)} between` : '');
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
    const iw = wattsAt(work.pct, work.pct, p.ftp, p.rule);
    const at = sport === 'run'
      ? (paced ? paceWord(paced, p.units) : percentWord(work.pct, work.pct))
      : (iw ? wattWord(iw) : percentWord(work.pct, work.pct));
    return `${work.reps} × ${durationWord(work.workS)} at ${at}${between(work.restS)}`;
  }
  const w = wattsAt(work.lo, work.hi, p.ftp, p.rule);
  return `${work.reps} × ${durationWord(work.workS)} at ${w ? wattWord(w) : percentWord(work.lo, work.hi)}${between(work.restS)}`;
}
