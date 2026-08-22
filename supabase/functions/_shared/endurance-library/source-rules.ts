// ============================================================================
// THE SOURCED RULES — every number here is Viada's. Do not add one that is not.
//
// Source: Alex Viada, *The Hybrid Athlete* — Ch.4 (dosing, pp.69-125) and Ch.9 (the movement key,
// pp.229-241). The corpus is `docs/SOURCE-viada-hybrid-athlete.md`; the page photographs are the
// ground truth and live at `~/Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`.
//
// ⛔ THIS FILE HOLDS RULES, NOT HIS SESSION TABLES. His interval tables and movement lists are his
// EXPRESSION. What is here is method — intensity bands, rep-length bands, work:rest, floors, caps —
// plus one computed scalar per family x level (the work-volume band), which is a fact ABOUT his
// program rather than a copy of it. `generate.ts` builds sessions from these against the athlete's
// own thresholds; nothing in this library stores a pace, a wattage or one of his workouts.
//
// ⛔ AND ONE PLACE WHERE THE READING IS OURS: the cycling percentage basis. Labelled at the site,
// carried onto every ride session's face, and never quietly promoted to fact.
// ============================================================================

import type { FamilyId, Intensity, Level, Range, Sport } from './types.ts';

// ── THE PERCENTAGE BASIS ────────────────────────────────────────────────────────────────────────

/**
 * ⛔ RUNNING IS STATED; CYCLING IS OUR INFERENCE. p229, read off the page:
 *
 * > *"The paces expressed in percentages refer to percent of threshold speed/pace/output, with 100
 * > percent representing threshold/VT2."*
 *
 * ⚠️ **The cycling opener (p236) states NO equivalent convention.** That percentages there mean
 * percent of THRESHOLD POWER is our reading — supported by the running convention in the same
 * notation, by the anaerobic page (p237) naming the quantity *power*, and by internal consistency
 * (sweet spot 80-95% is described as "as close to threshold without exceeding it"; VO2 110-120%;
 * endurance "below 75%"). **It is not a captured statement.** Every ride session this library builds
 * carries `INFERRED_CYCLING_BASIS_NOTE` on its face.
 */
export const PERCENT_BASIS: Record<Sport, { meaning: string; stated: boolean; cite: string }> = {
  run: {
    meaning: 'percent of threshold speed/pace, 100% = threshold / VT2',
    stated: true,
    cite: 'Viada p229',
  },
  ride: {
    meaning: 'percent of threshold power (FTP), 100% = threshold',
    stated: false,
    cite: 'Viada p236 states no convention — this reading is ours',
  },
  swim: {
    // The swim pages prescribe distance and words ("easy", "moderate", "hard", "all-out"), never a
    // percentage. Nothing to state and nothing to infer.
    meaning: 'no percentage notation is used for swimming',
    stated: true,
    cite: 'Viada pp240-241',
  },
};

export const INFERRED_CYCLING_BASIS_NOTE =
  'Percentages here are read as percent of threshold power. The cycling pages give no basis for '
  + 'them — the running pages do, and this carries that convention across. That carry-over is ours.';

// ── THE FLOORS AND CAPS (Ch.4, pp.69-125) ───────────────────────────────────────────────────────

/**
 * ⛔ A BOUT UNDER 10-15 MINUTES DOES NOT TRIGGER AN ADAPTATION (Ch.4, B3 of the corpus):
 * *"VT1 bouts: minimum ~10-15 min each."* The floor takes the LOW end of his own range, so it
 * forbids only what he forbids.
 */
export const VT1_BOUT_FLOOR_SECONDS = 10 * 60;

/**
 * ⛔ RARELY MORE THAN ~2h OF VT1 IN ONE SESSION (Ch.4, B3).
 *
 * ⚠️ AND LSD IS HIS OWN STATED EXCEPTION, WHICH IS WHY THE CAP IS NAMED FOR VT1 RATHER THAN FOR
 * "EASY WORK". p235: an LSD session *"can include rest periods or pauses in the hike/jog sessions
 * with little negative impact"*, and his level 3 LSD runs to *"3-plus-hour mixed terrain hike/VT1
 * jog (up to 5 hours for ultrarunners)"*. So the cap binds CONTINUOUS VT1 running, and the hike
 * archetype is exempt on his authority rather than on ours.
 */
export const VT1_CONTINUOUS_CAP_SECONDS = 2 * 60 * 60;

/**
 * ⛔ 4:1 WORK-TO-REST, WITH REST CLAMPED TO 30s-2min (Ch.4, B3): *"Threshold session shape: 4:1
 * work-to-rest; rest between 30s and 2 min even for 8-15-min intervals; intervals over 15 min become
 * tempo/single efforts."*
 *
 * ⚠️ WHERE IT APPLIES: the threshold families — running near-threshold and cycling sweet spot. It is
 * not a rule about sprint work (whose recovery he writes as "full") or about VO2 and anaerobic work
 * (where he states the recovery outright, and states it long).
 *
 * ⚠️ AND IT IS TIGHTER THAN HIS OWN CH.9 TABLES. p233 rests a 1200m rep for "50% of the run" — 2:1,
 * not 4:1. Both numbers are his; this library follows the DOSING chapter, because a generator needs
 * a rule and Ch.4 is where he states rules. **The consequence is real: our near-threshold sessions
 * rest less than the ones printed on p233-234.** Said plainly rather than buried.
 */
export const THRESHOLD_WORK_TO_REST = 4;
export const THRESHOLD_REST_MIN_SECONDS = 30;
export const THRESHOLD_REST_MAX_SECONDS = 120;

/** Intervals over 15 min stop being intervals and become a single tempo effort (Ch.4, B3). */
export const TEMPO_CROSSOVER_SECONDS = 15 * 60;

/**
 * ⛔ CARDIAC DRIFT IS A SESSION-TERMINATION RULE, NOT A MONITORING NUMBER (p107, read directly).
 *
 * > *"a session is terminated when cardiac drift reaches 10 percent … For hybrid athletes engaged in
 * > numerous weekly sessions, OR if a session will be followed by a 'key' session … within 24 hours,
 * > the number is 5 percent."*
 *
 * ⚠️ 5% IS THE NUMBER FOR OUR WHOLE AUDIENCE. "Hybrid athletes engaged in numerous weekly sessions"
 * describes every athlete this plan is for, so the 5% branch applies on its own — it does not wait
 * for a key session tomorrow.
 */
export const CARDIAC_DRIFT_TERMINATION_PCT = 5;
export const CARDIAC_DRIFT_NOTE =
  'End the session when heart rate has drifted 5% at the same pace, or pace has fallen 5% at the '
  + 'same heart rate. Training several times a week puts an athlete on the 5% figure rather than 10%.';

/** Zone 2 tops out at VT1, by the talk test (Ch.4, B4). This is why VT1 resolves to easy pace. */
export const VT1_IS_TOP_OF_ZONE_2 = true;

// ── WARM-UPS AND COOLDOWNS ──────────────────────────────────────────────────────────────────────
//
// ⛔ PART OF THE SESSION, NOT DECORATION. Each is the box printed beside its family. Drill items are
// listed by NAME and carry no duration, because the page gives none — they are steps with a null
// clock rather than steps with an invented one.

export type WrapperSpec = {
  warmup: { label: string; seconds: number | null; intensity: Intensity }[];
  cooldown: { label: string; seconds: number | null; intensity: Intensity }[];
  cite: string;
};

const easy: Intensity = { kind: 'easy' };
const drill: Intensity = { kind: 'drill' };

/** p229 — the running sprint/power box. */
const RUN_SPRINT_WRAPPER: WrapperSpec = {
  warmup: [
    { label: 'Easy jog', seconds: 5 * 60, intensity: easy },
    { label: 'Walking lunges, 3 sets of 20 m', seconds: null, intensity: drill },
    { label: 'Butt kicks, 2 rounds of 30 seconds', seconds: 2 * 30, intensity: drill },
    { label: 'Arm-pump drills, 3 rounds of seated / standing / high elbows, 10 seconds each',
      seconds: 3 * 30, intensity: drill },
  ],
  cooldown: [{ label: 'Easy jog or cross-training spin', seconds: 5 * 60, intensity: easy }],
  cite: 'Viada p229',
};

/** p231 (MLSS) and p233 (near-threshold) print the same box. */
const RUN_THRESHOLD_WRAPPER: WrapperSpec = {
  warmup: [
    { label: 'Easy jog', seconds: 10 * 60, intensity: easy },
    { label: 'Walking lunges, 3 sets of 20 m', seconds: null, intensity: drill },
    { label: 'Cossack squats, 2 sets of 10 per side', seconds: null, intensity: drill },
  ],
  cooldown: [{ label: 'Easy jog', seconds: 8 * 60, intensity: easy }],
  cite: 'Viada p231, p233',
};

/**
 * ⚠️ VT1 AND LSD HAVE NO PRINTED WRAPPER, AND NONE IS INVENTED HERE. p235 gives durations and
 * nothing else: the session is the bout. An easy run does not start cold in the way a maximal
 * sprint does, which is presumably why he prints a box for one and not the other.
 */
const NO_WRAPPER: WrapperSpec = { warmup: [], cooldown: [], cite: 'Viada p235 — no wrapper printed' };

/** p236 — cycling sprints. ⚠️ No cooldown box is printed for ANY cycling family. */
const RIDE_SPRINT_WRAPPER: WrapperSpec = {
  warmup: [
    { label: 'Easy spin', seconds: 10 * 60, intensity: easy },
    { label: 'Cadence-only sprints, 4 x 15 seconds, 3-minute rest between', seconds: 4 * 15 + 3 * 3 * 60,
      intensity: drill },
  ],
  cooldown: [],
  cite: 'Viada p236',
};

/** p237 (anaerobic) and p238 (sweet spot) print the same 10-15 minute box. */
const RIDE_EASY_SPIN_WRAPPER: WrapperSpec = {
  warmup: [{ label: 'Easy spin', seconds: 12 * 60 + 30, intensity: easy }],
  cooldown: [],
  cite: 'Viada p237, p238 — "10- to 15-minute easy spin"; the midpoint of his own range',
};

/** p238 — the VO2 box, the only cycling warm-up with an effort in it. */
const RIDE_VO2_WRAPPER: WrapperSpec = {
  warmup: [
    { label: 'Easy spin', seconds: 15 * 60, intensity: easy },
    { label: 'Steady effort', seconds: 5 * 60, intensity: { kind: 'pct_threshold', lo: 0.95, hi: 0.95 } },
    { label: 'Easy spin', seconds: 5 * 60, intensity: easy },
  ],
  cooldown: [],
  cite: 'Viada p238',
};

/** p239 — cycling endurance prints no box; the 20-minute easy spin is inside the workout itself. */
const RIDE_ENDURANCE_WRAPPER: WrapperSpec = { warmup: [], cooldown: [], cite: 'Viada p239 — none printed' };

/**
 * pp240-241 — swimming prints no warm-up box either. The kick, drill and pull-buoy lengths that open
 * every session ARE the warm-up, and they are built as part of the session rather than bolted on.
 */
const SWIM_WRAPPER: WrapperSpec = { warmup: [], cooldown: [], cite: 'Viada pp240-241 — none printed' };

export const WRAPPERS: Record<FamilyId, WrapperSpec> = {
  run_sprint_power: RUN_SPRINT_WRAPPER,
  run_mlss: RUN_THRESHOLD_WRAPPER,
  run_near_threshold: RUN_THRESHOLD_WRAPPER,
  run_vt1: NO_WRAPPER,
  run_lsd: NO_WRAPPER,
  ride_sprints: RIDE_SPRINT_WRAPPER,
  ride_anaerobic: RIDE_EASY_SPIN_WRAPPER,
  ride_vo2: RIDE_VO2_WRAPPER,
  ride_sweet_spot: RIDE_EASY_SPIN_WRAPPER,
  ride_endurance: RIDE_ENDURANCE_WRAPPER,
  swim_endurance: SWIM_WRAPPER,
  swim_speed: SWIM_WRAPPER,
  swim_open_water: SWIM_WRAPPER,
};

// ── THE WORK-VOLUME BAND, PER FAMILY x LEVEL ────────────────────────────────────────────────────

/**
 * ⛔ THE ONE COMPUTED SCALAR SET, AND WHAT IT IS.
 *
 * For each family and level: the SHORTEST and LONGEST work volume his own option set at that level
 * offers. Work means time (or distance) at or above the family's intensity floor — recoveries,
 * floats, warm-ups and cooldowns are excluded, because the generator sizes those from his stated
 * recovery rules rather than copying them.
 *
 * ⚠️ COMPUTED, NOT STATED — gap #2 of the twelve. He gives intervals; he never gives a total. The
 * arithmetic is recorded in `docs/NOTES-stage1-endurance-session-library-2026-08-22.md` so it can be
 * re-derived and argued with; what ships is the pair of numbers.
 *
 * ⛔ AND THIS IS WHY IT IS NOT A TRANSCRIPTION. Two numbers per family per level do not reconstruct
 * a single one of his workouts. They set the size dial: `size` 0 builds to the low end, 1 to the
 * high end, and the structure in between comes from the family's rules and the athlete's own
 * threshold. §3c/§3d of the decisions doc need exactly this pair — the floor and the cap of a slot.
 *
 * ⚠️ TWO BANDS ARE NOT MONOTONE IN THE LEVEL, and that is a fact about his sprint work rather than
 * an error here: `run_sprint_power` peaks at level 1 and `ride_sprints` reaches its shortest option
 * at level 3. Sprint work is neurally capped, so a higher level buys more OPTIONS and more complex
 * starts, not more metres.
 */
export type DoseBand = { lo: number; hi: number; unit: 'seconds' | 'meters'; cite: string };

export const WORK_BANDS: Record<FamilyId, Record<Level, DoseBand>> = {
  run_sprint_power: {
    1: { lo: 400, hi: 1800, unit: 'meters', cite: 'computed from Viada pp230-231, level 1 options' },
    2: { lo: 200, hi: 1600, unit: 'meters', cite: 'computed from Viada p230, level 2 options' },
    3: { lo: 200, hi: 1600, unit: 'meters', cite: 'computed from Viada p231, level 3 options' },
  },
  run_mlss: {
    1: { lo: 360, hi: 720, unit: 'seconds', cite: 'computed from Viada p231, level 1 options' },
    2: { lo: 480, hi: 1140, unit: 'seconds', cite: 'computed from Viada p232, level 2 options' },
    3: { lo: 720, hi: 2280, unit: 'seconds', cite: 'computed from Viada p232, level 3 options' },
  },
  /**
   * ⚠️ THE TIME-BASED SUBSET, DELIBERATELY. Near-threshold is the one family whose options mix time
   * and distance (1200m repeats beside 6-minute repeats). Computed across a spread of athletes from
   * a 6:00/mi threshold to 12:00/mi, his distance options land INSIDE this band for anyone at
   * roughly 9:00/mi or faster, and above it for slower athletes — where the tempo crossover and the
   * session cap take over. Banding on the time options keeps the dial pace-independent; banding on
   * the distance ones would make the same level mean a different dose for two athletes.
   */
  run_near_threshold: {
    1: { lo: 600, hi: 1800, unit: 'seconds', cite: 'computed from Viada p233, level 1 options' },
    2: { lo: 960, hi: 2640, unit: 'seconds', cite: 'computed from Viada p234, level 2 options' },
    3: { lo: 1200, hi: 3960, unit: 'seconds', cite: 'computed from Viada p234, level 3 options' },
  },
  /** ⛔ STATED OUTRIGHT, not computed — p235 gives VT1 as a duration ladder and nothing else. */
  run_vt1: {
    1: { lo: 25 * 60, hi: 30 * 60, unit: 'seconds', cite: 'Viada p235, stated' },
    2: { lo: 45 * 60, hi: 60 * 60, unit: 'seconds', cite: 'Viada p235, stated' },
    3: { lo: 80 * 60, hi: 90 * 60, unit: 'seconds', cite: 'Viada p235, stated' },
  },
  /**
   * The whole session, because an LSD session IS its bout. Computed from his own stated durations
   * plus the sets he inserts into them. ⚠️ Level 3's top is the 5-hour ultrarunner hike; the Standing
   * Plan's composer caps its long day well below that (§3d), and that cap belongs to the composer.
   */
  run_lsd: {
    1: { lo: 35 * 60, hi: 90 * 60, unit: 'seconds', cite: 'computed from Viada p235, level 1 examples' },
    2: { lo: 68 * 60, hi: 150 * 60, unit: 'seconds', cite: 'computed from Viada p235, level 2 examples' },
    3: { lo: 104 * 60, hi: 300 * 60, unit: 'seconds', cite: 'computed from Viada p235, level 3 examples' },
  },
  ride_sprints: {
    1: { lo: 240, hi: 540, unit: 'seconds', cite: 'computed from Viada p236, level 1 options' },
    2: { lo: 300, hi: 900, unit: 'seconds', cite: 'computed from Viada p236, level 2 options' },
    3: { lo: 60, hi: 1080, unit: 'seconds', cite: 'computed from Viada p236, level 3 options' },
  },
  ride_anaerobic: {
    1: { lo: 270, hi: 600, unit: 'seconds', cite: 'computed from Viada p237, level 1 options' },
    2: { lo: 360, hi: 840, unit: 'seconds', cite: 'computed from Viada p237, level 2 options' },
    3: { lo: 480, hi: 1260, unit: 'seconds', cite: 'computed from Viada p237, level 3 options' },
  },
  ride_vo2: {
    1: { lo: 600, hi: 1080, unit: 'seconds', cite: 'computed from Viada p238, level 1 options' },
    2: { lo: 960, hi: 1440, unit: 'seconds', cite: 'computed from Viada p238, level 2 options' },
    3: { lo: 1280, hi: 1800, unit: 'seconds', cite: 'computed from Viada p238, level 3 options' },
  },
  ride_sweet_spot: {
    1: { lo: 1080, hi: 2700, unit: 'seconds', cite: 'computed from Viada p238, level 1 options' },
    2: { lo: 1440, hi: 3600, unit: 'seconds', cite: 'computed from Viada p239, level 2 options' },
    3: { lo: 1920, hi: 3600, unit: 'seconds', cite: 'computed from Viada p239, level 3 options' },
  },
  /** Whole-session durations, stated on p239 for the straight ride and computed for the mixed one. */
  ride_endurance: {
    1: { lo: 60 * 60, hi: 100 * 60, unit: 'seconds', cite: 'Viada p239, stated' },
    2: { lo: 130 * 60, hi: 210 * 60, unit: 'seconds', cite: 'Viada p239, stated + computed' },
    3: { lo: 180 * 60, hi: 300 * 60, unit: 'seconds', cite: 'Viada p239, stated + computed' },
  },
  swim_endurance: {
    1: { lo: 1550, hi: 1550, unit: 'meters', cite: 'computed from Viada p241, level 1 endurance session' },
    2: { lo: 2300, hi: 2500, unit: 'meters', cite: 'computed from Viada p241, level 2 endurance session' },
    3: { lo: 3800, hi: 4200, unit: 'meters', cite: 'computed from Viada p241, level 3 endurance session' },
  },
  swim_speed: {
    1: { lo: 1400, hi: 1400, unit: 'meters', cite: 'computed from Viada p241, level 1 speed session' },
    2: { lo: 2300, hi: 2300, unit: 'meters', cite: 'computed from Viada p241, level 2 speed session' },
    3: { lo: 2600, hi: 2600, unit: 'meters', cite: 'computed from Viada p241, level 3 speed session' },
  },
  /** Open water is prescribed in TIME, not distance — sighting intervals and swim-out clocks. */
  swim_open_water: {
    1: { lo: 810, hi: 810, unit: 'seconds', cite: 'computed from Viada p241, level 1 open water' },
    2: { lo: 1200, hi: 1200, unit: 'seconds', cite: 'computed from Viada p241, level 2 open water' },
    3: { lo: 2400, hi: 2400, unit: 'seconds', cite: 'Viada p241, stated — 20 minutes out, 20 back' },
  },
};

// ── THE FAMILY RULES ────────────────────────────────────────────────────────────────────────────

/**
 * A structural ARCHETYPE — the shape of a session, parameterised by his stated bands.
 *
 * ⛔ AN ARCHETYPE IS NOT ONE OF HIS WORKOUTS. "Alternate a supra-threshold surge with a
 * near-threshold float" is method and is cited freely; "6 rounds of 15 seconds at 130 percent,
 * 45 seconds at 105 percent, 1 minute at VT1" is his expression and is not in this codebase.
 *
 * `repBand` is the shortest and longest WORK rep the family states anywhere for this shape. The
 * level picks a point inside it — which is the pattern his own tables move on (anaerobic 45s / 60s /
 * 90s; VO2 3 / 4 / 5 minutes; sweet spot 6 / 6 / 8 minutes).
 */
/**
 * The six structural shapes every session in the library is one of.
 *
 * ⛔ A SHAPE IS THE METHOD, NOT THE WORKOUT. "A bout at VT1 with efforts inserted into it" is how
 * p235 describes an LSD run; the specific insert is generated from the family's bands and the
 * athlete's own threshold.
 */
export type ArchetypeShape =
  /** Timed work reps, optionally with a second prescribed segment and optionally grouped into sets. */
  | 'intervals'
  /** Reps prescribed in metres — the running sprint family and both pool swim families. */
  | 'distance_intervals'
  /** One bout, sized to the whole band. VT1 runs, steady rides, hikes, the straight open-water swim. */
  | 'continuous'
  /** A bout with efforts inserted into it, the inserts taking `insertShare` of the session. */
  | 'continuous_with_inserts'
  /** A bout that finishes at a harder effort, the finish sized by `repBand` at the level. */
  | 'continuous_with_finish'
  /** Reps stepping down from the top of `repBand` to the bottom, recovery falling with them. */
  | 'descending';

export type Archetype = {
  id: string;
  label: string;
  shape: ArchetypeShape;
  /** Work rep length, seconds — or metres where the family prescribes distance. */
  repBand: Range;
  /** The work interval's intensity. */
  work: Intensity;
  /** How the recovery between work reps is set. */
  recovery:
    | { kind: 'stated'; band: Range; intensity: Intensity }
    /** Ch.4's threshold shape: work/4, clamped to 30s-2min. */
    | { kind: 'threshold_ratio'; intensity: Intensity }
    /** "Full recovery" — the source gives no duration and none is invented. */
    | { kind: 'open' }
    /** Proportional to the rep, as the descending ladder and the 1:1 repeats are written. */
    | { kind: 'proportional'; factor: number; intensity: Intensity };
  /**
   * A second prescribed segment inside each repeat — MLSS's near-threshold float, near-threshold's
   * embedded surge. Null for the plain shapes.
   */
  float?: {
    band: Range;
    intensity: Intensity;
    label: string;
    /**
     * True when the segment sits INSIDE the work rep rather than after it — sweet spot's surge on
     * the minute, near-threshold's embedded surge. An inside segment is already inside `repBand`,
     * so it must not be added to the rep's length a second time.
     */
    insideRep?: boolean;
  };
  /**
   * ⛔ HOW MANY REPS THE SHAPE USES — the shortest and longest count across his own options for it.
   *
   * ⚠️ PRESENT MEANS REP-DRIVEN; ABSENT MEANS DOSE-DRIVEN, and the split is not cosmetic. Where a
   * family's shapes differ wildly in rep size — the sprint family runs 25 m repeats beside 400 m
   * ones — a single family-wide work band divided by the shortest rep produces forty-four maximal
   * sprints. Those shapes state their own rep counts and take them. Where the shapes are uniform
   * (swimming, open water) the family band divides cleanly and drives the count directly.
   */
  repsBand?: Range;
  /** Which levels the source offers this shape at. Absent = all three. */
  levels?: Level[];
  /** Repeats are grouped into sets with their own stated between-set recovery. */
  set?: { repeatsPerSet: Range; restBand: Range; intensity: Intensity };
  /**
   * `continuous_with_inserts` only — what share of the session the inserted efforts take.
   *
   * ⚠️ COMPUTED FROM HIS OWN EXAMPLES at the three levels, not chosen. The derivation is in the
   * stage notes; the share is the mean across his levels for that archetype.
   */
  insertShare?: number;
  cite: string;
};

const pct = (lo: number, hi = lo): Intensity => ({ kind: 'pct_threshold', lo, hi });
const vt1: Intensity = { kind: 'vt1' };

export const FAMILIES: Record<FamilyId, {
  sport: Sport;
  label: string;
  /** Steps at or above this percentage of threshold count as WORK for the band and the ratio. */
  workFloorPct: number;
  /** The family's stated intent, in his words where he gives one. */
  intent: string;
  cite: string;
  archetypes: Archetype[];
}> = {

  // ── RUNNING ───────────────────────────────────────────────────────────────────────────────────

  run_sprint_power: {
    sport: 'run',
    label: 'Sprint / power',
    workFloorPct: 1.3,
    intent: 'Pure speed, technical and neuromuscular. Paces come from performance and RPE rather '
      + 'than a prescribed pace; "all-out" means the best speed available that day.',
    cite: 'Viada pp229-231',
    archetypes: [
      {
        id: 'short_max',
        shape: 'distance_intervals',
        label: 'Short maximal accelerations',
        repBand: { lo: 25, hi: 50 },
        repsBand: { lo: 4, hi: 8 },
        work: { kind: 'all_out' },
        recovery: { kind: 'open' },
        cite: 'Viada pp230-231',
      },
      {
        id: 'speed_endurance',
        shape: 'distance_intervals',
        label: 'Speed-endurance repeats',
        repBand: { lo: 150, hi: 400 },
        repsBand: { lo: 4, hi: 8 },
        work: pct(1.30, 1.40),
        recovery: { kind: 'open' },
        cite: 'Viada pp230-231',
      },
      {
        id: 'flying_short',
        shape: 'distance_intervals',
        label: 'Short flying-start repeats',
        repBand: { lo: 50, hi: 75 },
        repsBand: { lo: 4, hi: 10 },
        work: { kind: 'faster_than_vvo2' },
        recovery: { kind: 'stated', band: { lo: 60, hi: 120 }, intensity: easy },
        set: { repeatsPerSet: { lo: 2, hi: 5 }, restBand: { lo: 60, hi: 180 }, intensity: easy },
        cite: 'Viada pp230-231 — 1- to 3-minute walks between sets and rounds',
      },
      {
        /**
         * ⛔ SPLIT FROM THE SHORT FLYING REPEATS ON PURPOSE. His long flying repeats come in twos and
         * fours; his short ones come in fours and fives. Holding both in one shape and letting the
         * level pick the rep length while the size picks the count multiplies two numbers that are
         * ANTI-correlated on the page, and builds a session he never wrote.
         */
        id: 'flying_long',
        shape: 'distance_intervals',
        label: 'Long flying-start repeats',
        repBand: { lo: 150, hi: 200 },
        repsBand: { lo: 2, hi: 4 },
        work: { kind: 'faster_than_vvo2' },
        recovery: { kind: 'stated', band: { lo: 120, hi: 180 }, intensity: easy },
        set: { repeatsPerSet: { lo: 2, hi: 3 }, restBand: { lo: 120, hi: 180 }, intensity: easy },
        cite: 'Viada pp230-231 — 2- to 3-minute recovery between sets',
      },
    ],
  },

  run_mlss: {
    sport: 'run',
    label: 'Maximal lactate steady state',
    workFloorPct: 1.0,
    intent: 'Maximum time in zone 4 with equalised fatigue.',
    cite: 'Viada pp231-232',
    archetypes: [
      {
        id: 'surge_float',
        shape: 'intervals',
        label: 'Surge and float',
        repBand: { lo: 10, hi: 45 },
        repsBand: { lo: 6, hi: 12 },
        work: pct(1.25, 1.30),
        float: { band: { lo: 45, hi: 60 }, intensity: pct(1.05, 1.15), label: 'Near-threshold float' },
        recovery: { kind: 'stated', band: { lo: 20, hi: 120 }, intensity: vt1 },
        set: { repeatsPerSet: { lo: 3, hi: 4 }, restBand: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada pp231-232 — 2-minute walk/recovery jog between sets',
      },
      {
        id: 'descending',
        shape: 'descending',
        label: 'Descending ladder',
        repBand: { lo: 30, hi: 180 },
        work: pct(1.20),
        recovery: { kind: 'proportional', factor: 0.67, intensity: pct(0.60) },
        cite: 'Viada pp231-232 — reps step down, recovery steps down with them',
      },
    ],
  },

  run_near_threshold: {
    sport: 'run',
    label: 'Near-threshold',
    workFloorPct: 0.85,
    intent: 'Maximum time near threshold, whether from shorter above-threshold intervals or longer '
      + 'below-threshold ones, while controlling fatigue.',
    cite: 'Viada pp233-234',
    archetypes: [
      {
        id: 'short_above',
        shape: 'intervals',
        label: 'Short above-threshold repeats',
        repBand: { lo: 60, hi: 90 },
        repsBand: { lo: 8, hi: 16 },
        work: pct(1.00, 1.05),
        recovery: { kind: 'threshold_ratio', intensity: vt1 },
        cite: 'Viada pp233-234; recovery per Ch.4 (4:1, clamped 30s-2min)',
      },
      {
        /**
         * ⛔ SPLIT FROM THE SHORT REPEATS. His race-specific repeats are two to four efforts of four
         * to twenty minutes; his short above-threshold repeats are eight to sixteen efforts of about
         * a minute. One shape holding both would build thirteen five-minute repeats — sixty-five
         * minutes of above-threshold running, which is not a session anywhere in the book.
         */
        id: 'race_repeats',
        shape: 'intervals',
        label: 'Race-specific repeats',
        repBand: { lo: 240, hi: 900 },
        repsBand: { lo: 2, hi: 4 },
        work: pct(0.92, 1.05),
        recovery: { kind: 'stated', band: { lo: 180, hi: 300 }, intensity: vt1 },
        cite: 'Viada pp233-234 — 3- to 5-minute recovery walk/jog between sets',
      },
      {
        id: 'below_threshold',
        shape: 'intervals',
        label: 'Sustained sub-threshold repeats',
        repBand: { lo: 210, hi: 510 },
        repsBand: { lo: 3, hi: 8 },
        work: pct(0.85, 0.92),
        recovery: { kind: 'stated', band: { lo: 60, hi: 90 }, intensity: vt1 },
        cite: 'Viada pp233-234 — 1 to 1:30 at VT1 between',
      },
      {
        id: 'surge_embedded',
        shape: 'intervals',
        label: 'Threshold block with an embedded surge',
        repBand: { lo: 240, hi: 300 },
        repsBand: { lo: 4, hi: 12 },
        work: pct(0.92, 0.95),
        float: { band: { lo: 15, hi: 20 }, intensity: pct(1.15, 1.40), label: 'Surge', insideRep: true },
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: easy },
        cite: 'Viada pp233-234 — a short supra-threshold surge inside a near-threshold block',
      },
    ],
  },

  run_vt1: {
    sport: 'run',
    label: 'VT1',
    workFloorPct: 0,
    intent: 'Any run at or below VT1. The level refers almost strictly to the duration.',
    cite: 'Viada p235',
    archetypes: [
      {
        id: 'continuous',
        shape: 'continuous',
        label: 'Continuous VT1 run',
        repBand: { lo: 25 * 60, hi: 90 * 60 },
        work: vt1,
        recovery: { kind: 'open' },
        cite: 'Viada p235',
      },
    ],
  },

  run_lsd: {
    sport: 'run',
    label: 'Long slow distance',
    workFloorPct: 0,
    intent: 'Maximise training time; may combine zones but is primarily below VT1. Unlike VT1 '
      + 'sessions it may include rest periods or pauses with little negative impact.',
    cite: 'Viada p235',
    archetypes: [
      {
        id: 'long_with_inserts',
        shape: 'continuous_with_inserts',
        label: 'Long VT1 run with inserted sets',
        repBand: { lo: 30, hi: 240 },
        work: pct(0.95, 1.15),
        recovery: { kind: 'stated', band: { lo: 30, hi: 60 }, intensity: vt1 },
        // Computed from his three level examples: the inserted sets take 8%, 12% and 13% of the
        // session. The mean is what sizes them here.
        insertShare: 0.11,
        cite: 'Viada p235 — sets added at any point in the run',
      },
      {
        id: 'race_pace_finish',
        shape: 'continuous_with_finish',
        label: 'Long VT1 run with a race-pace finish',
        repBand: { lo: 5 * 60, hi: 15 * 60 },
        work: { kind: 'race_pace' },
        recovery: { kind: 'open' },
        cite: 'Viada p235',
      },
      {
        id: 'fartlek',
        shape: 'continuous_with_inserts',
        label: 'VT1 fartlek',
        repBand: { lo: 180, hi: 240 },
        work: pct(0.85),
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: vt1 },
        // Computed from his level 2 and level 3 fartleks: the targeted efforts take 20% and 18% of
        // the session.
        insertShare: 0.19,
        cite: 'Viada p235 — a target number of efforts during the session',
      },
      {
        id: 'hike',
        shape: 'continuous',
        label: 'Mixed-terrain hike or VT1 jog',
        repBand: { lo: 60 * 60, hi: 300 * 60 },
        work: vt1,
        recovery: { kind: 'open' },
        cite: 'Viada p235 — pauses permitted, and the one exception to the VT1 session cap',
      },
    ],
  },

  // ── CYCLING — the percentage basis below is INFERRED. See PERCENT_BASIS. ──────────────────────

  ride_sprints: {
    sport: 'ride',
    label: 'Sprints',
    workFloorPct: 1.3,
    intent: 'Maximal efforts; each one tries to beat the last.',
    cite: 'Viada p236',
    archetypes: [
      {
        id: 'max_effort',
        shape: 'intervals',
        label: 'Maximal sprints',
        repBand: { lo: 120, hi: 180 },
        repsBand: { lo: 3, hi: 6 },
        work: { kind: 'all_out' },
        recovery: { kind: 'stated', band: { lo: 300, hi: 360 }, intensity: easy },
        cite: 'Viada p236 — 5 to 6 minutes of recovery between',
      },
      {
        id: 'flying_surge',
        shape: 'intervals',
        label: 'Flying surges',
        repBand: { lo: 15, hi: 30 },
        repsBand: { lo: 4, hi: 12 },
        work: { kind: 'all_out' },
        recovery: { kind: 'stated', band: { lo: 120, hi: 180 }, intensity: easy },
        set: { repeatsPerSet: { lo: 5, hi: 6 }, restBand: { lo: 120, hi: 180 }, intensity: easy },
        cite: 'Viada p236',
      },
      {
        id: 'standing_start',
        shape: 'intervals',
        label: 'Standing starts',
        /**
         * ⛔ THE EFFORT HAS NO STATED DURATION and none is given one here — it runs from a track
         * stand to speed, which is however long that takes on the day. The rep band is the RECOVERY,
         * which he does state; the work step carries a null clock.
         */
        repBand: { lo: 0, hi: 0 },
        repsBand: { lo: 6, hi: 10 },
        work: { kind: 'all_out' },
        recovery: { kind: 'stated', band: { lo: 360, hi: 600 }, intensity: easy },
        cite: 'Viada p236 — 6 to 10 minutes of easy spin between reps',
      },
    ],
  },

  ride_anaerobic: {
    sport: 'ride',
    label: 'Anaerobic',
    workFloorPct: 1.0,
    intent: 'Anaerobic repeatability. Best done by feel against a power FLOOR rather than a specific '
      + 'power target — the numbers are guidelines.',
    cite: 'Viada p237',
    archetypes: [
      {
        id: 'progressive_repeats',
        shape: 'intervals',
        label: 'Progressive repeats',
        repBand: { lo: 45, hi: 90 },
        repsBand: { lo: 6, hi: 10 },
        /** Each set starts at 110% and progresses to 125-130% by the end — his own instruction. */
        work: pct(1.10, 1.30),
        recovery: { kind: 'stated', band: { lo: 240, hi: 360 }, intensity: easy },
        cite: 'Viada p237 — 4 to 6 minutes of recovery between sets',
      },
      {
        id: 'one_to_one',
        shape: 'intervals',
        label: 'One-to-one repeats',
        repBand: { lo: 60, hi: 60 },
        repsBand: { lo: 10, hi: 16 },
        work: pct(1.10, 1.20),
        recovery: { kind: 'proportional', factor: 1, intensity: pct(0.50) },
        set: { repeatsPerSet: { lo: 7, hi: 8 }, restBand: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada p237',
      },
      {
        id: 'sandwich',
        shape: 'intervals',
        label: 'Surge, sustain, surge',
        repBand: { lo: 30, hi: 30 },
        repsBand: { lo: 5, hi: 8 },
        work: pct(1.20),
        float: { band: { lo: 150, hi: 330 }, intensity: pct(0.90), label: 'Sustained effort' },
        recovery: { kind: 'stated', band: { lo: 240, hi: 240 }, intensity: easy },
        cite: 'Viada p237 — 4-minute easy spin between rounds',
      },
    ],
  },

  ride_vo2: {
    sport: 'ride',
    label: 'VO2',
    workFloorPct: 1.10,
    intent: 'Push maximum aerobic intake. More metabolically taxing than the anaerobic work, and to '
      + 'be controlled more carefully rather than ridden on the "more power is better" principle.',
    cite: 'Viada p238',
    archetypes: [
      {
        id: 'long_vo2',
        shape: 'intervals',
        label: 'Long VO2 repeats',
        repBand: { lo: 180, hi: 300 },
        repsBand: { lo: 5, hi: 5 },
        work: pct(1.10, 1.20),
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada p238 — 5-minute rest',
      },
      {
        id: 'short_vo2',
        shape: 'intervals',
        label: 'Short VO2 repeats',
        repBand: { lo: 90, hi: 90 },
        repsBand: { lo: 12, hi: 20 },
        work: pct(1.15),
        recovery: { kind: 'proportional', factor: 1, intensity: easy },
        set: { repeatsPerSet: { lo: 6, hi: 10 }, restBand: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada p238',
      },
      {
        id: 'micro',
        shape: 'intervals',
        label: 'Micro-intervals',
        repBand: { lo: 30, hi: 40 },
        repsBand: { lo: 20, hi: 32 },
        work: pct(1.25),
        recovery: { kind: 'stated', band: { lo: 20, hi: 30 }, intensity: pct(0.85) },
        set: { repeatsPerSet: { lo: 5, hi: 8 }, restBand: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada p238',
      },
    ],
  },

  ride_sweet_spot: {
    sport: 'ride',
    label: 'Sweet spot',
    workFloorPct: 0.80,
    intent: 'As close to threshold as possible without exceeding it — plenty of time in the zone '
      + 'with far less fatigue than riding at or above it.',
    cite: 'Viada pp238-239',
    archetypes: [
      {
        id: 'minute_surge',
        shape: 'intervals',
        label: 'Sweet-spot blocks with a surge on the minute',
        repBand: { lo: 360, hi: 480 },
        repsBand: { lo: 3, hi: 4 },
        work: pct(0.90),
        float: { band: { lo: 10, hi: 10 }, intensity: pct(1.05), label: 'Surge, on the minute', insideRep: true },
        recovery: { kind: 'stated', band: { lo: 180, hi: 180 }, intensity: easy },
        cite: 'Viada pp238-239 — 3-minute easy spin',
      },
      {
        id: 'medium',
        shape: 'intervals',
        label: 'Medium sweet-spot repeats',
        repBand: { lo: 120, hi: 240 },
        repsBand: { lo: 6, hi: 8 },
        work: pct(0.95, 1.00),
        recovery: { kind: 'stated', band: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada pp238-239 — 2-minute easy spin',
      },
      {
        id: 'long',
        shape: 'intervals',
        label: 'Long sweet-spot repeats',
        repBand: { lo: 480, hi: 600 },
        repsBand: { lo: 3, hi: 4 },
        work: pct(0.90),
        recovery: { kind: 'stated', band: { lo: 240, hi: 240 }, intensity: easy },
        cite: 'Viada pp238-239 — 4-minute easy spin',
      },
      {
        id: 'tempo',
        shape: 'intervals',
        label: 'Tempo blocks',
        repBand: { lo: 900, hi: 1200 },
        repsBand: { lo: 3, hi: 3 },
        work: pct(0.80),
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada pp238-239 — 5-minute easy spin',
      },
    ],
  },

  ride_endurance: {
    sport: 'ride',
    label: 'Endurance',
    workFloorPct: 0,
    intent: 'Straight endurance, or endurance carrying some speed/threshold work. Each level is '
      + 'meant to be roughly comparable in overall fatigue; the more intense versions are for '
      + 'sparing use unless an event is coming.',
    cite: 'Viada p239',
    archetypes: [
      {
        id: 'steady',
        shape: 'continuous',
        label: 'Steady endurance ride',
        repBand: { lo: 60 * 60, hi: 300 * 60 },
        work: { kind: 'below_pct', hi: 0.75 },
        recovery: { kind: 'open' },
        cite: 'Viada p239 — "easy ride below 75%"',
      },
      {
        id: 'mixed',
        shape: 'continuous_with_inserts',
        label: 'Endurance ride with tempo blocks and sprints',
        repBand: { lo: 120, hi: 120 },
        work: pct(0.80),
        float: { band: { lo: 180, hi: 180 }, intensity: pct(0.70), label: 'Steady' },
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        // Computed from his three level examples: the tempo blocks take 24%, 31% and 33% of the ride.
        insertShare: 0.29,
        cite: 'Viada p239',
      },
    ],
  },

  // ── SWIM — distance-prescribed, no percentage notation anywhere. ──────────────────────────────

  swim_endurance: {
    sport: 'swim',
    label: 'Swim endurance',
    workFloorPct: 0,
    intent: 'Duration. Level 1 sessions are simple and non-fatiguing; level 3 sessions run to about '
      + 'an hour and a half and involve significant fatigue.',
    cite: 'Viada pp240-241',
    archetypes: [
      {
        id: 'long_repeats',
        shape: 'distance_intervals',
        label: 'Drill opener into long repeats',
        repBand: { lo: 600, hi: 1600 },
        work: { kind: 'race_pace' },
        recovery: { kind: 'stated', band: { lo: 120, hi: 180 }, intensity: easy },
        cite: 'Viada p241 — 2- to 3-minute rest between the long repeats',
      },
    ],
  },

  swim_speed: {
    sport: 'swim',
    label: 'Swim speed',
    workFloorPct: 0,
    intent: 'Short repeats built from easy, moderate, hard and all-out lengths.',
    cite: 'Viada pp240-241',
    archetypes: [
      {
        id: 'descending_sets',
        shape: 'distance_intervals',
        label: 'Sprint lengths into descending sets',
        repBand: { lo: 50, hi: 200 },
        work: { kind: 'all_out' },
        recovery: { kind: 'stated', band: { lo: 15, hi: 60 }, intensity: easy },
        set: { repeatsPerSet: { lo: 4, hi: 6 }, restBand: { lo: 60, hi: 60 }, intensity: easy },
        cite: 'Viada p241 — 15- to 60-second rests, 1 minute between sets',
      },
    ],
  },

  swim_open_water: {
    sport: 'swim',
    label: 'Open water',
    workFloorPct: 0,
    intent: 'Sighting, orientation, and at level 3 acclimating to extended periods in deep water.',
    cite: 'Viada pp240-241',
    archetypes: [
      {
        id: 'out_and_across',
        shape: 'intervals',
        label: 'Out and across, sighting on a fixed interval',
        // ⚠️ LEVELS 1 AND 2 ONLY. His level 3 open-water session is the straight distance below;
        // there is no level 3 out-and-across on the page, so the library does not offer one.
        levels: [1, 2],
        repBand: { lo: 30, hi: 45 },
        work: { kind: 'race_pace' },
        // ⛔ THE SWIMS RUN BACK TO BACK. The 2-minute rest is after RETURNING TO SHORE — a between-
        // sets rest, not a between-swims one. Putting it between the parallel swims doubled the
        // session.
        recovery: { kind: 'stated', band: { lo: 0, hi: 0 }, intensity: easy },
        set: { repeatsPerSet: { lo: 7, hi: 9 }, restBand: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada p241 — 2-minute rest after returning to shore',
      },
      {
        id: 'straight_distance',
        shape: 'continuous',
        label: 'Straight distance, out and back',
        levels: [3],
        repBand: { lo: 20 * 60, hi: 20 * 60 },
        work: { kind: 'race_pace' },
        recovery: { kind: 'open' },
        cite: 'Viada p241 — 20 minutes out, 20 minutes back',
      },
    ],
  },
};

/**
 * ⛔ MANDATED, NOT ADVISED (p241, his own emphasis). Level 3 open water is the one session in this
 * library that carries a refusal condition rather than a caution: *"Experienced swimmers in
 * locations with visible lifeguards or a dedicated boat/kayak escort only."*
 */
export const OPEN_WATER_SAFETY_NOTE =
  'Belt with rope tether, bright or high-contrast buoy, water supply and emergency whistle are '
  + 'mandatory. Experienced swimmers only, and only where there is a visible lifeguard or a '
  + 'dedicated boat or kayak escort.';

/** p240 — his own recommendation, and the reason the sighting intervals are clocked at all. */
export const OPEN_WATER_TIMER_NOTE =
  'A watch with an audible timer is strongly recommended: the sighting intervals are timed, not counted.';

/** p235 — the talk test, twice per run, at 5 minutes and again at 20. */
export const TALK_TEST_NOTE =
  'The exact percentage of threshold at VT1 moves with fatigue, hydration and conditions. If unsure, '
  + 'run the talk test twice — once after 5 minutes and once after 20.';

/** p229 — why the sprint paces are unresolved rather than missing. */
export const SPRINT_PACING_NOTE =
  'Sprint paces come from performance and RPE, not from a prescribed pace. "All-out" means the best '
  + 'speed available that day. Work intervals may be run on hills with the pace adjusted to hold the '
  + 'target intensity.';

/** p237 — the anaerobic sessions are a floor, not a target. */
export const POWER_FLOOR_NOTE =
  'These are best ridden by feel against a power floor rather than to a specific power target. Each '
  + 'set starts at the bottom of the band and progresses toward the top by the end.';

/**
 * ⛔ COMPUTED, NOT CHOSEN. A pool session opens with kick, drill and pull-buoy lengths before the
 * main set, and the source prescribes those in metres. Across his six pool sessions the opener takes
 * 22.6%, 21.7%, 14.3%, 14.3%, 8.7% and 7.7% of the session's distance; the mean is 14.9%, rounded to
 * 15% here. It is arithmetic on his numbers, and it is the only way a generated swim session gets a
 * warm-up whose size is not made up.
 *
 * ⚠️ THE DRILLS THEMSELVES ARE NAMED, NOT PRESCRIBED. p240 lists what a swimmer should learn — basic
 * catch-up, distance-per-stroke, fist, kick, zipper/fingertip drag — and says a full drill catalogue
 * is outside the book's scope. The generator names them and gives the opener a distance; it does not
 * invent a drill prescription.
 */
/**
 * ⛔ NO SWIM SESSION THIS LIBRARY BUILDS RUNS PAST NINETY MINUTES, AND THAT IS HIS NUMBER.
 *
 * p240, stated: *"level 1 swims typically being more simple, nonfatiguing workouts and level 3 swims
 * being 1.5-hour sessions involving significant fatigue."* Level 3 is the hardest of the three, so
 * nothing below it should run longer — that is a deduction from his sentence rather than a ceiling
 * someone picked, and it is the only stated swim duration on either page.
 *
 * ⚠️ WHAT HAPPENS WHEN AN ATHLETE IS SLOW ENOUGH TO EXCEED IT: the DISTANCE comes down, which p240
 * explicitly permits — *"changes to distances and interval length can be modified tremendously."*
 * Without this, a 10-minute-per-100 m swimmer is handed a seven-hour level 3 session, because a pool
 * session is prescribed in metres and the clock is entirely the athlete's own pace.
 */
export const SWIM_SESSION_CEILING_SECONDS = 90 * 60;

export const SWIM_OPENER_SHARE = 0.15;

export const SWIM_DRILLS = [
  'Kick',
  'Distance-per-stroke or glide',
  'Pull buoy',
] as const;

/** p239 — form work is part of the long ride, in his words. */
export const FORM_FOCUS_NOTE =
  'Several minutes of a long ride spent on pedal stroke and position is time well used.';
