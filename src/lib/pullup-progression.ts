/**
 * THE PULL-UP / CHIN-UP PROGRESSION — a tracked performance goal, not a body-part chip.
 *
 * ⛔ IT IS A DIFFERENT AXIS FROM THE FOCUS CHIPS, AND THAT IS THE WHOLE REASON IT IS A SEPARATE
 * FEATURE. A focus chip (`FocusChip`) biases WHICH movement fills a category — pick Back and the
 * pull slot leans toward rows. This PROGRESSES A NUMBER: it pins the pull slot to chins, pushes the
 * weekly volume, and the athlete's tested capacity climbs against a target across the block. A chip
 * changes what you do; this changes what you can do, and it can be measured.
 *
 * ── WENDLER'S PROTOCOL, PACKAGED. Nothing here is invented. ───────────────────────────────────────
 *
 *   VOLUME    100+ chins a week, chins between every pressing set        2nd ed p.35
 *   VARIETY   vary the grip every set or session                         Forever p.26
 *   STRENGTH  some low-rep WEIGHTED work, not only high-rep bodyweight    Forever p.26
 *   STANDARD  50 reps in 10 minutes                                       Forever p.33
 *   ON-RAMP   "if you can't do chins, use a Jump Stretch band"            2nd ed p.36
 *
 * ⛔ THE STANDARD AND THE TRACKED NUMBER ARE DIFFERENT UNITS, AND CONFLATING THEM WOULD BE THE
 * INVENTED METRIC THIS FILE EXISTS TO AVOID. `pullupMaxReps` is a MAX CLEAN REPS figure — one set,
 * to failure. Wendler's 50-in-10-minutes is a SESSION standard — many sets, a clock. They are not
 * the same measurement and one does not convert into the other. So this module carries BOTH,
 * separately labelled, and the copy never implies the max-rep number is "progress toward 50":
 *
 *   · `weeklyVolumeTarget` — the dose being prescribed now (p.35).
 *   · `sessionStandard`    — the milestone, stated as what it is: 50 reps inside 10 minutes (p.33).
 *   · `pullupMaxReps`      — the tested capacity that climbs, and the input the dose scales off.
 *
 * ── ⛔ AND A BAND-ASSISTED REP IS NOT A REP ──────────────────────────────────────────────────────
 *
 * The on-ramp is Wendler's own, so a 0-rep athlete has to be able to start. But if an assisted rep
 * counts toward the tested capacity, the number goes up while the athlete does not get stronger —
 * the progression reports success for walking the assistance DOWN more slowly. Assisted and clean
 * reps are counted separately, everywhere, off the field the logger already writes
 * (`resistance_level`) and the movement test that already exists (`isBandAssistedMovement`).
 *
 * ⚠️ NO NEW FIELD. `resistance_level` is already saved on every chin/pull-up/dip set and already
 * survives the normalizer, `get-week`, `workout-detail` and the compare table. A parallel
 * "assisted?" flag would be a second vocabulary for a question already answered.
 */

import { isBandAssistedMovement } from './band-assistance.ts';

/** Wendler 2nd ed p.35 — "100 or more chins a week". The floor of the prescription, not a cap. */
export const WEEKLY_CHIN_VOLUME_TARGET = 100;

/** Forever p.33 — his standard. ⛔ A SESSION measure (reps inside a clock), NOT a max-rep figure. */
export const SESSION_STANDARD_REPS = 50;
export const SESSION_STANDARD_MINUTES = 10;

/**
 * ⛔ THE CAPACITY AT WHICH THE FULL DOSE IS PRESCRIBED. Below this the weekly volume is scaled down —
 * see {@link weeklyVolumeFor}.
 *
 * 8 is not a new number: it is the same capacity anchor `assistanceTotalReps` already uses for the
 * pull slot ("8 reps sits at the floor"). Reusing it keeps one answer to "what counts as an athlete
 * who can pull", rather than minting a second threshold two files apart.
 */
export const FULL_DOSE_CAPACITY = 8;

export type GripVariant = 'chin' | 'pull' | 'neutral' | 'wide';

/**
 * ⛔ THE GRIP ROTATION IS THE PRESCRIPTION, NOT DECORATION (Forever p.26: vary the grip every set or
 * session). Four days, four grips, so a block never runs the same grip twice in a week.
 *
 * ⚠️ THESE ARE DISPLAY QUALIFIERS ON ONE STORED MOVEMENT, NOT FOUR MOVEMENTS. The row still stores
 * `Chin-Up` or `Pull Up` — names that resolve exactly in `exercise-config.ts` (D-322). A "Wide Grip
 * Pull Up" token would fuzzy-match and borrow another entry's prescription, which is the bug class
 * this codebase has shipped three times.
 */
export const GRIP_ROTATION: GripVariant[] = ['chin', 'pull', 'neutral', 'wide'];

/**
 * ⛔ WHICH DAY GETS WHICH GRIP. A fixed order so the rotation is deterministic — the composer builds
 * each lifting day independently and has no memory of the others, so "the next grip" has to be
 * derivable from the day alone.
 *
 * ⚠️ MIRRORS `LIFT_DAYS` in `assistance-catalog.ts` and must keep mirroring it. It is not imported
 * because this module is the pull-up programme and the catalog is the picker; a one-way import here
 * would make the picker depend on the programme rather than the other way round.
 */
export const LIFT_DAY_ORDER_FOR_GRIP = ['press', 'bench', 'squat', 'deadlift'] as const;

export const GRIP_LABEL: Record<GripVariant, string> = {
  chin: 'underhand',
  pull: 'overhand',
  neutral: 'neutral grip',
  wide: 'wide grip',
};

/** The stored movement each grip runs on. Both resolve `exact`/`folded` — verified by test. */
export function movementForGrip(grip: GripVariant): string {
  return grip === 'chin' ? 'Chin-Up' : 'Pull Up';
}

/**
 * ⛔ WENDLER PRESCRIBES *SOME* LOW-REP WEIGHTED WORK, NOT A PERCENTAGE (Forever p.26). One day of the
 * four carries it, and it is still `weight: 'By feel'` — D-406 is not suspended for this feature.
 * The athlete adds what they can hold for the stated low reps; the app names no load.
 *
 * ⚠️ GATED ON CAPACITY. Adding weight to an athlete who cannot yet do a clean rep is not a harder
 * version of the same session, it is an impossible one.
 */
export const WEIGHTED_DAY_INDEX = 2;
export const WEIGHTED_DAY_REPS = 5;

export type PullupDose = {
  /** Total chin/pull reps prescribed across the block week. */
  weeklyVolume: number;
  /** Per lifting day, from `weeklyVolume`. Rounded to fives so it reads like a lifter's number. */
  perDay: number;
  /** True when the athlete has no clean rep yet and the band on-ramp is the prescription (p.36). */
  assistedOnRamp: boolean;
  /** Why this dose — named, never a bare number. */
  basis: 'full_dose' | 'scaled_to_capacity' | 'on_ramp';
};

/**
 * The weekly chin volume for an athlete with this tested capacity.
 *
 * ⛔ 100 IS THE PRESCRIPTION FOR SOMEONE WHO CAN ALREADY PULL. Handing 100 weekly chins to an
 * athlete whose max is two is not Wendler's protocol, it is the same protocol addressed to someone
 * else — they cannot perform it, and the shortfall reads to them as failure in week one. Below
 * {@link FULL_DOSE_CAPACITY} the dose scales with capacity and the basis SAYS SO.
 *
 * ⚠️ THE ON-RAMP IS NOT ZERO. A 0-rep athlete gets the band-assisted dose (p.36) — real volume, and
 * counted separately from clean reps so the progression cannot inflate. Prescribing nothing to the
 * athlete the on-ramp exists for would be the feature declining to serve its own entry case.
 */
export function weeklyVolumeFor(pullupMaxReps: number | null | undefined, liftingDays = 4): PullupDose {
  // ⛔ `Number(null)` IS 0, AND ON THIS FIELD 0 IS A REAL ANSWER — so the null check has to come
  // FIRST or every untested athlete is read as a 0-rep athlete and put on the band on-ramp. This is
  // Q-102's trap ("0 is valid") biting from the other side, and the test that caught it stays.
  const cap = pullupMaxReps == null || !Number.isFinite(Number(pullupMaxReps))
    ? null
    : Math.max(0, Math.round(Number(pullupMaxReps)));
  const days = Math.max(1, liftingDays);
  const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

  // No clean rep on file → the band on-ramp. Half the full dose: it is assisted work, and assisted
  // reps are cheaper per rep than clean ones.
  if (cap === 0) {
    const weekly = round5(WEEKLY_CHIN_VOLUME_TARGET / 2);
    return { weeklyVolume: weekly, perDay: round5(weekly / days), assistedOnRamp: true, basis: 'on_ramp' };
  }

  // Unknown capacity → the full dose. ⚠️ §0h: unknown degrades to UNCHANGED (the book's own number),
  // never to a guess at a smaller one. The athlete opted into a pull-up progression; the honest
  // default is the protocol as written.
  if (cap == null || cap >= FULL_DOSE_CAPACITY) {
    return {
      weeklyVolume: WEEKLY_CHIN_VOLUME_TARGET,
      perDay: round5(WEEKLY_CHIN_VOLUME_TARGET / days),
      assistedOnRamp: false,
      basis: 'full_dose',
    };
  }

  // 1..7 clean reps — scale linearly off capacity against the full-dose anchor.
  const weekly = round5((WEEKLY_CHIN_VOLUME_TARGET * cap) / FULL_DOSE_CAPACITY);
  return { weeklyVolume: weekly, perDay: round5(weekly / days), assistedOnRamp: false, basis: 'scaled_to_capacity' };
}

/** The sentence that names the evidence. Fact-first, no imperative, never a target to beat. */
export function pullupDoseNote(dose: PullupDose, pullupMaxReps: number | null | undefined): string {
  if (dose.basis === 'on_ramp') {
    return `No clean rep on file, so this runs band-assisted — ${dose.weeklyVolume} reps a week, ` +
      `walking the band down as they get easier.`;
  }
  if (dose.basis === 'scaled_to_capacity') {
    return `Scaled to your tested ${pullupMaxReps} clean reps — ${dose.weeklyVolume} a week, ` +
      `climbing toward ${WEEKLY_CHIN_VOLUME_TARGET}.`;
  }
  return `${WEEKLY_CHIN_VOLUME_TARGET} chins a week, split across the lifting days.`;
}

/**
 * ⛔ THE SEPARATION. A logged set counts toward the CLEAN total only when no band helped.
 *
 * Reads the two things that already exist and nothing new: `isBandAssistedMovement` (does a band mean
 * help on this movement) and `resistance_level` (how much help). On a chin-up a positive
 * `resistance_level` is pounds of assistance; on a band pull-apart the same field is the LOAD, which
 * is why the movement test has to run first — that overload is documented in `band-assistance.ts`
 * and it has already caused one 3.5× pricing error.
 */
export function isAssistedSet(
  exerciseName: string,
  set: { resistance_level?: string | number | null } | null | undefined,
): boolean {
  if (!isBandAssistedMovement(exerciseName)) return false;
  const raw = set?.resistance_level;
  if (raw == null || String(raw).trim() === '') return false;
  const n = Number(raw);
  // A non-numeric tension word ("heavy") is still assistance — it just is not measured.
  return Number.isFinite(n) ? n > 0 : true;
}

export type PullupCounts = {
  /** Reps performed with NO band. The only ones that may move a tested capacity. */
  clean: number;
  /** Reps performed with band or machine help. Real work, counted, never conflated. */
  assisted: number;
  /** Best single CLEAN set — the figure `pullupMaxReps` is allowed to learn from. */
  bestCleanSet: number;
};

/**
 * Count a session's (or a week's) chin/pull work, keeping the two totals apart.
 *
 * ⛔ `bestCleanSet` IS THE ONLY OUTPUT A CAPACITY MAY BE WRITTEN FROM. That is the inflation guard:
 * an athlete pulling 12 reps with 40 lb of band help has `assisted: 12` and `bestCleanSet: 0`, and
 * their tested max stays where it was. Walking the band down is the progress, and it shows up in
 * `assisted` falling while `clean` rises — which is the actual thing happening.
 */
export function countPullupWork(
  exercises: Array<{
    name?: string | null;
    sets?: Array<{ reps?: number | string | null; completed?: boolean; resistance_level?: string | number | null }> | null;
  }> | null | undefined,
): PullupCounts {
  let clean = 0;
  let assisted = 0;
  let bestCleanSet = 0;
  for (const ex of Array.isArray(exercises) ? exercises : []) {
    const name = String(ex?.name ?? '');
    // ⚠️ DIPS ARE ASSIST-CAPABLE TOO but they are not chins — this counter is the pull progression's,
    // so it reads only the vertical pull. `isBandAssistedMovement` covers all three by design.
    if (!/chin|pull\s*up|pullup/i.test(name)) continue;
    for (const s of Array.isArray(ex?.sets) ? ex!.sets! : []) {
      if (s?.completed === false) continue;
      const reps = Number(s?.reps);
      if (!Number.isFinite(reps) || reps <= 0) continue;
      if (isAssistedSet(name, s)) {
        assisted += reps;
      } else {
        clean += reps;
        if (reps > bestCleanSet) bestCleanSet = reps;
      }
    }
  }
  return { clean, assisted, bestCleanSet };
}

/**
 * ⛔ MAY THIS SET WRITE A TESTED PULL-UP CAPACITY? The guard for every `pullupMaxReps` write site.
 *
 * ⚠️ THIS IS A BUG FIX AS MUCH AS A NEW FEATURE, AND THE BUG IS OLDER THAN THIS FILE. Three sites
 * write or read a pull-up capacity from a rep count — `StrengthLogger`'s `repMaxTest` handler,
 * `analyze-strength-workout`'s `buildStrengthTestResult`, and `save-baseline-test` — and **not one of
 * them looked at `resistance_level`.** A rep-max test taken on a band therefore wrote the assisted
 * count straight into `performance_numbers.pullupMaxReps`, where it becomes the athlete's tested
 * capacity, feeds `assistanceTotalReps` (more assistance volume for a capacity they do not have),
 * feeds materialize-plan's bodyweight RIR resolution, and shows on the State strength row as a
 * number they cannot actually do.
 *
 * The load path has known about band assist since D-351/D-415. The CAPACITY path never did.
 */
export function canWritePullupCapacity(
  exerciseName: string,
  set: { resistance_level?: string | number | null } | null | undefined,
): boolean {
  return !isAssistedSet(exerciseName, set);
}
