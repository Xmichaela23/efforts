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
import type { RidePowerRule } from '../plan-tokens/quality-work.ts';

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

// not-instruction: never prints — pushed only into the library session's notes (generate.ts), which nothing outside generate.ts reads (traced: translateEnduranceSession, enduranceLedgerFor, session-swap library-session/workout-choice)
export const INFERRED_CYCLING_BASIS_NOTE =
  'Percentages here are read as percent of threshold power. The cycling pages give no basis for '
  + 'them — the running pages do, and this carries that convention across. That carry-over is ours.';

// ── THE FLOORS AND CAPS (Ch.4, pp.69-125) ───────────────────────────────────────────────────────

/**
 * ⛔ A BOUT UNDER 10-15 MINUTES DOES NOT TRIGGER AN ADAPTATION (Ch.4, B3 of the corpus):
 * *"VT1 bouts: minimum ~10-15 min each."* The floor takes the LOW end of his own range, so it
 * forbids only what he forbids.
 */
// Viada p107: "single bouts of much less than 10 to 15 minutes are … unlikely to be worthwhile".
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
// Viada p107: 10 percent, or 5 percent for hybrid athletes training several times a week (see above).
export const CARDIAC_DRIFT_TERMINATION_PCT = 5;
// not-instruction: never prints — pushed only into the library session's notes (generate.ts), which nothing outside generate.ts reads (traced: translateEnduranceSession, enduranceLedgerFor, session-swap library-session/workout-choice)
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

/**
 * ⛔⛔ EVERY LABEL IS THE BOX'S OWN LINE (2026-09-18, book-language pass 4), read off the page photographs. The labels
 * were short names of ours ("Easy jog", "Steady effort") and the whole box reached the row as ONE timed warm-up step —
 * the lunges and Cossack squats never reached the athlete, and every ride warm-up became one block at an OURS 55–70%
 * of FTP. Each line now travels as its own step (`session-vocabulary.ts` `wrapperTokens`, `wrapperStepForToken`
 * below), with these words on the screen and the watch.
 */

/** p229 — the running sprint/power box. */
const RUN_SPRINT_WRAPPER: WrapperSpec = {
  warmup: [
    { label: '5-minute easy jog', seconds: 5 * 60, intensity: easy },  // p229 — the box, as printed
    { label: '3 sets of 20 meter walking lunges', seconds: null, intensity: drill },  // p229 — the box, as printed
    { label: '2 x 30-second rounds of butt kicks', seconds: 2 * 30, intensity: drill },
    { label: 'Perform 3 rounds of the following: 10 seconds seated arm pump drill, 10 seconds standing arm pump drill, 10 seconds "high elbows"',  // p229 — the box, as printed
      seconds: 3 * 30, intensity: drill },
  ],
  cooldown: [{ label: '5-minute easy jog or cross-training/bike', seconds: 5 * 60, intensity: easy }],  // p229 — the box, as printed
  cite: 'Viada p229',
};

/** p231 (MLSS). */
const RUN_MLSS_WRAPPER: WrapperSpec = {
  warmup: [
    { label: '10-minute easy jog', seconds: 10 * 60, intensity: easy },  // p231 — the box, as printed
    { label: '3 sets of 20m walking lunges', seconds: null, intensity: drill },  // p231 — the box, as printed
    { label: '2 sets of 10 per side Cossack squats', seconds: null, intensity: drill },  // p231 — the box, as printed
  ],
  cooldown: [{ label: '8-minute easy jog', seconds: 8 * 60, intensity: easy }],  // p231 — the box, as printed
  cite: 'Viada p231',
};

/** p233 (near-threshold) prints the same box, with "(per side)" in brackets. */
const RUN_NT_WRAPPER: WrapperSpec = {
  warmup: [
    { label: '10-minute easy jog', seconds: 10 * 60, intensity: easy },  // p233 — the box, as printed
    { label: '3 sets of 20m walking lunges', seconds: null, intensity: drill },  // p233 — the box, as printed
    { label: '2 sets of 10 (per side) Cossack squats', seconds: null, intensity: drill },  // p233 — the box, as printed
  ],
  cooldown: [{ label: '8-minute easy jog', seconds: 8 * 60, intensity: easy }],  // p233 — the box, as printed
  cite: 'Viada p233',
};

/**
 * ⚠️ VT1 AND LSD HAVE NO PRINTED WRAPPER, AND NONE IS INVENTED HERE. p235 gives durations and
 * nothing else: the session is the bout. An easy run does not start cold in the way a maximal
 * sprint does, which is presumably why he prints a box for one and not the other.
 */
const NO_WRAPPER: WrapperSpec = { warmup: [], cooldown: [], cite: 'Viada p235 — no wrapper printed' };

/**
 * p236 — cycling sprints. ⚠️ No cooldown box is printed for ANY cycling family. The cadence sprints are one step of
 * the four sprints and the three 3-minute rests between them (600 s), carrying the page's whole line.
 */
const RIDE_SPRINT_WRAPPER: WrapperSpec = {
  warmup: [
    { label: '10-minute easy spin', seconds: 10 * 60, intensity: easy },  // p236 — the box, as printed
    { label: '4 cadence only 15-second sprints to build up the leg speed and focus on timing and technique with 3-minute rest between',  // p236 — the box, as printed
      seconds: 4 * 15 + 3 * 3 * 60, intensity: drill },
  ],
  cooldown: [],
  cite: 'Viada p236',
};

/**
 * p237 (anaerobic) and p238 (sweet spot) print the same box: "10- to 15-minute easy spin". The watch needs one length;
 * 12:30 is the middle of the page's range — OURS, the pick inside it (the label prints the page's range).
 */
const RIDE_EASY_SPIN_WRAPPER: WrapperSpec = {
  warmup: [{ label: '10- to 15-minute easy spin', seconds: 12 * 60 + 30, intensity: easy }],  // p237, p238 — the box, as printed
  cooldown: [],
  cite: 'Viada p237, p238 — "10- to 15-minute easy spin"; the midpoint of his own range',
};

/** p238 — the VO2 box, the only cycling warm-up with an effort in it. */
const RIDE_VO2_WRAPPER: WrapperSpec = {
  warmup: [
    { label: '15-minute easy spin', seconds: 15 * 60, intensity: easy },  // p238 — the box, as printed
    { label: '5 minutes @ 95%', seconds: 5 * 60, intensity: { kind: 'pct_threshold', lo: 0.95, hi: 0.95 } },  // p238 — the box, as printed
    { label: '5-minute easy spin', seconds: 5 * 60, intensity: easy },  // p238 — the box, as printed
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
  run_mlss: RUN_MLSS_WRAPPER,
  run_near_threshold: RUN_NT_WRAPPER,
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

/**
 * ⛔ ONE BOX LINE AS ITS OWN TOKEN (2026-09-18, book-language pass 4): `wrap_{family}_warm{i}` / `wrap_{family}_cool{i}`
 * names line i of the family's box above. The materializer reads the line back from here — its seconds (null = the
 * lap button; the page times no drill), its intensity and its words — so the page's box reaches the row and the watch
 * line by line, from this one place.
 */
export const WRAPPER_TOKEN = /^wrap_([a-z0-9_]+?)_(warm|cool)(\d+)$/;
export function wrapperToken(family: FamilyId, part: 'warmup' | 'cooldown', index: number): string {
  return `wrap_${family}_${part === 'warmup' ? 'warm' : 'cool'}${index}`;
}
export function wrapperStepForToken(token: string): {
  kind: 'warmup' | 'cooldown'; seconds: number | null; label: string; intensity: Intensity;
} | null {
  const m = String(token ?? '').toLowerCase().match(WRAPPER_TOKEN);
  if (!m) return null;
  const spec = (WRAPPERS as Record<string, WrapperSpec>)[m[1]];
  const kind = m[2] === 'warm' ? 'warmup' : 'cooldown';
  const line = spec?.[kind]?.[Number(m[3])];
  return line ? { kind, seconds: line.seconds, label: line.label, intensity: line.intensity } : null;
}

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
/**
 * p239's endurance ride with work, one level, as printed: an opening easy spin · `sets` of
 * `roundsPerSet` rounds of (2 min @ 80% / 3 min @ 70%), an easy spin between sets · a VT1 bout with a
 * 10-second all-out sprint every `sprintEverySeconds`.
 */
export type PrintedRide = {
  openSeconds: number;
  sets: number;
  roundsPerSet: number;
  round: Array<{ seconds: number; pct: number }>;
  betweenSetsSeconds: number;
  finishSeconds: number;
  sprintSeconds: number;
  sprintEverySeconds: number;
};

/**
 * ⛔⛔ p235's LONG RUN AS PRINTED, PER LEVEL (2026-09-18, book-language pass 5, audit item 21). The shape builder
 * sized the inserted sets off an average share of the session (`insertShare`) and a band, so level 2 built 3–7 reps
 * of 2:15 @ 115% with no recovery where the page prints 2 sets of 2 rounds of 1:30 @ 115% / 30 s @ VT1; the race-pace
 * finish lost its 95% interval in the middle; the fartlek counts and lengths were off at every level.
 *
 * `inserts` are the page's sets, each `rounds` rounds of `round`, placed inside the easy running; `finish` is the
 * race-pace finish. ⚠️ THE EASY RUNNING FILLS THE REST OF THE SESSION the composer sized (the athlete's long-run
 * length, p247 "runs up to 90 to 100 minutes"), so only the page's own pieces are fixed. ⚠️ WHERE THE INSERTS GO is
 * the page's "added at any point" / "during the session" / "in the middle": the easy running is split evenly around
 * them — OURS, the placement is the athlete's on the day.
 */
export type PrintedLongRun = {
  inserts?: { count: number; rounds: number; round: PrintedSegment[] };
  finish?: PrintedSegment;
};

/**
 * One segment of a printed round. `role` is the page's own reading: a percentage the family counts
 * as work is `work`; a prescribed effort under the family's floor (MLSS's VT1 minute inside the
 * round) is `float`; the page's "easy jog" / "easy spin" / "recovery" is `recovery`.
 */
export type PrintedSegment = { seconds: number; role: 'work' | 'float' | 'recovery'; intensity: Intensity; label?: string };

/**
 * An interval session as the page prints it: `sets` of `rounds` rounds of `round`, with the page's
 * recovery between rounds and between sets where it states one. `sets: 1` is the page's plain
 * "N rounds of"; `betweenRoundsSeconds` on a one-set session is its "3-minute rest" after each round.
 */
export type PrintedIntervals = {
  sets: number;
  rounds: number;
  round: PrintedSegment[];
  betweenRoundsSeconds?: number;
  betweenRoundsIntensity?: Intensity;
  betweenSetsSeconds?: number;
  betweenSetsIntensity?: Intensity;
};

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
   * A THIRD prescribed segment after the float, where the page writes one — MLSS level 2's
   * "45s @ 125% / 45s @ 115% / 30s @ 100%" (p232). Emitted after the float, before the recovery,
   * and counted as work when at or above the family's floor. Absent on every other shape.
   */
  hold?: {
    band: Range;
    intensity: Intensity;
    label: string;
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
  /**
   * ⛔⛔ THE COUNT THIS SHAPE USES **AT EACH LEVEL** (2026-08-31). `repsBand` is the family-wide span
   * across all three levels, and the count is derived from the DOSE and then clamped to it — so a
   * level-2 session whose dose ran high took the count the source only reaches at level 3. A real
   * athlete's level-2 session built twelve rounds where his level prints eight.
   * ⚠️ OPTIONAL, AND ABSENT KEEPS THE OLD CLAMP, so a shape whose source gives no per-level count is
   * unchanged. Where the source does give one, the level's own range is the clamp.
   */
  repsByLevel?: Partial<Record<Level, Range>>;
  /**
   * ⛔⛔ THE WORK INTENSITY RISES ACROSS THE REPEATS rather than sitting at one point — p237's
   * anaerobic repeats are described as starting at the bottom of the band and progressing to the top
   * by the end. Modelled here as a real per-rep progression: **the band was being emitted on every
   * rep, and the plan token takes a band's top, so every repeat was prescribed at the ceiling.**
   * ⚠️ ABSENT MEANS A FLAT EFFORT, which is every other shape.
   */
  progressive?: true;
  /**
   * ⛔⛔⛔ A LADDER'S OWN RUNGS, PER LEVEL — `descending` only (2026-08-31, on Michael's ruling).
   *
   * `buildDescending` interpolated evenly between the ends of `repBand` and took however many rungs
   * the DOSE bought, so it produced a smooth decay — 180/159/137/116/94/73/51/30 — where the source
   * prescribes a specific stepped sequence that halves and then narrows. **Neither the step sizes nor
   * the rung count were the page's.**
   *
   * ⚠️ EACH ENTRY IS A LIST OF ROUNDS, and each round a list of WORK reps in seconds. The recovery
   * between rungs is still `recovery` — the ladder's recoveries fall with the work at a constant
   * ratio, which the existing proportional rule already expresses exactly. Only the work sequence
   * was missing.
   * ⚠️ THE LEVELS DIFFER BY ROUNDS, NOT BY RUNGS: the source runs the same ladder more times as the
   * level rises, and its middle level starts its second round partway down rather than at the top.
   */
  ladderByLevel?: Partial<Record<Level, number[][]>>;
  /**
   * ⛔⛔ THE SESSION AS PRINTED, PER LEVEL — and it OVERRIDES the shape builder (Michael, 2026-09-10).
   *
   * An archetype is normally the METHOD, sized off a band, never one of his workouts copied out (see
   * the note above `ARCHETYPES`). p239's endurance ride with work is the exception he ruled on: the
   * generic `continuous_with_inserts` shape built it as a steady bout sized to whatever the inserts
   * left, placed FIRST, then N rounds with a 5-minute rest after each — so the 20-minute opening
   * spin, the sets of four back-to-back rounds, the easy spin between sets and the whole sprint finish
   * were all absent, and level 1 rode 35 minutes steady and five rested rounds. The shape had no slot
   * for any of those, and `insertShare: 0.29` (an average of the three levels) could not recover them.
   * The printed structure is therefore carried here verbatim and built as it reads.
   */
  printedByLevel?: Partial<Record<Level, PrintedRide>>;
  /** p235's long run as printed — see `PrintedLongRun`. Overrides the shape builder at the levels it carries. */
  printedLongRunByLevel?: Partial<Record<Level, PrintedLongRun>>;
  /** Seconds of easy recovery between ladder rounds, where the source states one. */
  ladderRoundRest?: number;
  /**
   * ⛔⛔ THE INTERVAL SESSION AS PRINTED, PER LEVEL — and it OVERRIDES the shape builder (Michael,
   * 2026-09-11: "workouts should be by the book"). `printedByLevel` above did this for the endurance
   * ride; this is the same ruling for every hard shape. The band fields on the archetype stay for the
   * ladder's bracket and for any level the table does not carry, but where a level is printed here
   * the session is that, round for round — no lerp inside a band, no count derived from a dose.
   * ⚠️ `levels` still says which levels the page offers the shape at; a level listed there and absent
   * here falls back to the band builder.
   */
  printedIntervalsByLevel?: Partial<Record<Level, PrintedIntervals>>;
  /**
   * ⛔ THE REP'S SECONDS AT EACH LEVEL where the page prints one number per level rather than a band
   * (p237's progressive repeats: 45 s / 1 min / 1:30). Read before `repBand` by the shape builder.
   */
  repSecondsByLevel?: Partial<Record<Level, number>>;
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

/**
 * ⛔ THE PRINTED-ROUND SHORTHAND (2026-09-11). `W(45, 1.25)` is 45 s of work at 125%; `F(60, vt1)`
 * is a prescribed minute the family does not count as work (MLSS's VT1 minute inside the round);
 * `R(120)` is the page's easy recovery, `RV(90)` its "1:30 @ VT1" recovery. Seconds and percentages
 * only — every number below is one the page prints, at the level it prints it.
 */
const W = (seconds: number, at: number, label?: string): PrintedSegment => ({ seconds, role: 'work', intensity: pct(at), ...(label ? { label } : {}) });
const F = (seconds: number, at: Intensity, label?: string): PrintedSegment => ({ seconds, role: 'float', intensity: at, ...(label ? { label } : {}) });
const R = (seconds: number): PrintedSegment => ({ seconds, role: 'recovery', intensity: easy });
const RV = (seconds: number): PrintedSegment => ({ seconds, role: 'recovery', intensity: vt1 });
/** An all-out effort the page prints with no percentage (p236 "max effort"). */
const AO = (seconds: number, label?: string): PrintedSegment => ({ seconds, role: 'work', intensity: { kind: 'all_out' }, ...(label ? { label } : {}) });

export const FAMILIES: Record<FamilyId, {
  sport: Sport;
  label: string;
  /** Steps at or above this percentage of threshold count as WORK for the band and the ratio. */
  workFloorPct: number;
  /**
   * ⛔ THE PAGE PRESCRIBES A FLOOR AND NO CEILING FOR THIS FAMILY'S WORK (2026-09-15). p237 states it
   * for the whole anaerobic family — *"best done by feel with a power FLOOR rather than a specific
   * power target — the numbers are guidelines"* — and prints the `+` on its own first option
   * ("110-115%+", starting at 110% and progressing to 125-130%). p238 names the same principle from
   * the outside: the anaerobic sessions run on *"more power is generally better"*, which VO2 is then
   * told NOT to do ("more carefully controlled").
   * ⛔ EVERY WORK STEP, INCLUDING p237's 90% SUSTAINED MIDDLE (Michael, 2026-09-18 — "the numbers are
   * guidelines" covers the whole family). Only a RECOVERY the page prints a number for (the 50% half) keeps its band.
   * ⛔ THE SCREEN AND THE WATCH SHOW A TOP, THE SCORE DOES NOT (round 5, 2026-09-18, Michael's ruling): floor to 130% of
   * FTP (p237 "progress up to 125–130% by the end", `quality-work.ts ANAEROBIC_TOP_PCT_OF_FTP`); at or above the floor
   * is in range.
   * ⚠️ ABSENT ON EVERY OTHER FAMILY, including `ride_vo2`, on p238's own instruction.
   */
  floorOnly?: true;
  /**
   * ⛔ NEVER OVER THRESHOLD (2026-09-18) — pp238–239 sweet spot: *"as close to threshold as possible without
   * exceeding it"*. A step at or below 100% tops out at FTP (a 95% step is 85.5–100%); see `wattsAt`'s
   * `under_threshold`. Round 5 (2026-09-18): this is the only ride type with the FTP top.
   */
  underThreshold?: true;
  /** The family's stated intent, in his words where he gives one. */
  intent: string;
  cite: string;
  archetypes: Archetype[];
}> = {

  // ── RUNNING ───────────────────────────────────────────────────────────────────────────────────

  run_sprint_power: {
    sport: 'run',
    label: 'Sprint / power',  // not-instruction: family name, a label for the session, not an instruction; no page names it; Michael's call
    workFloorPct: 1.3,
    intent: 'Pure speed, technical and neuromuscular. Paces come from performance and RPE rather '  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
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
    /**
     * ⛔ THE FAMILY'S DISPLAY NAME IS THE FIELD'S, NOT THE BOOK'S (Michael, 2026-08-25).
     * "Maximal lactate steady state" is the source's own section heading (pp231-232) and it is what
     * the closed row shows an athlete — "Hard session 1 · Run · Maximal lactate steady state".
     * ⚠️ COPY-VOICE rule 9: plain words for every metric. ⚠️ THE KEY `run_mlss` IS UNCHANGED, and
     * so are `intent` and `cite` — the physiology is still the physiology, and the citation still
     * points at the page this came from.
     */
    /**
     * ⛔⛔ "Threshold" → "Above threshold" (2026-08-27). The old word was on TWO families at once and
     * on the wrong one.
     *
     * ⛔ THE COLLISION, ON SCREEN: this label reached the wizard row — *"Hard session 1 · Run ·
     * Threshold"* — while `session-vocabulary.ts` names THIS family's session **"Hard Run"** and
     * names `run_near_threshold` **"Threshold Run"**. So the wizard's word for this session was the
     * plan's word for the OTHER one.
     *
     * ⛔ AND IT WAS WRONG ON THE PAGE'S OWN TERMS, both read off the images. p231: *"Workouts that
     * emphasize time spent in zone 4. The objective is accruing maximum time with equalized
     * fatigue."* Zone 4 is the band ABOVE threshold — which is why this family's own level-1 work is
     * prescribed at 100-130%. p233, the other one: *"Workouts that maximize time near-threshold
     * (NT) — whether shorter above-threshold intervals or longer below-threshold intervals"*, with
     * level-1 work at 88-95%.
     *
     * ⚠️ THIS SUPERSEDES A WORD MICHAEL PICKED HIMSELF (2026-08-25), which is why the note below
     * stays and this one sits on top of it. He chose "Threshold" as the field's plain word for
     * "maximal lactate steady state"; the reason to move it is the collision, not the plainness.
     * The exact replacement is his to change — "Above threshold" is page-true and plain, and it is
     * ours.
     */
    label: 'Maximal Lactate Steady State',  // not-instruction: type name — the book's heading (p231) without the bracketed abbreviation (2026-09-19)
    workFloorPct: 1.0,
    intent: 'Maximum time in zone 4 with equalised fatigue.',  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
    cite: 'Viada pp231-232',
    archetypes: [
      {
        id: 'surge_float',
        shape: 'intervals',
        /**
         * ⛔ p231-232 AS PRINTED (read off the photos 2026-09-11):
         *   L1  6 rounds of: 15 s @ 130% / 45 s @ 105% / 1 min @ VT1
         *   L2  2 sets of 4 rounds of the same, 2-minute recovery walk/jog between sets
         *   L3  3 sets of 4 rounds of the same, 2-minute recovery walk/jog between sets
         */
        // not-instruction: step labels (names for a step, not instructions); planned-step-lines prints a label only when page_label is set; no page names them; Michael's call
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 6, round: [W(15, 1.30, 'Surge'), W(45, 1.05, 'Near-threshold float'), RV(60)] },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          2: { sets: 2, rounds: 4, round: [W(15, 1.30, 'Surge'), W(45, 1.05, 'Near-threshold float'), RV(60)], betweenSetsSeconds: 120 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          3: { sets: 3, rounds: 4, round: [W(15, 1.30, 'Surge'), W(45, 1.05, 'Near-threshold float'), RV(60)], betweenSetsSeconds: 120 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
        },
        /**
         * ⛔ THE DISPLAY NAME IS THE FIELD'S, NOT THE BOOK'S (Michael, 2026-08-25). "Surge and
         * float" is Viada's phrasing, lifted verbatim; "over-unders" is what this session is called
         * everywhere an athlete would have met it — TrainerRoad, Fast Talk, any coach's plan.
         * ⚠️ THE ID IS UNCHANGED AND IS WHAT EVERYTHING MATCHES ON — `VARIANT_BODY`, the athlete's
         * stored `archetype` pick, the composer's `archetypes` map. Renaming the id would strand
         * every draft and every built plan that carries the old one.
         * ⚠️ THE DESCRIPTION LINE IS UNCHANGED TOO (`hard-slot-choices.ts` `VARIANT_BODY`) — it
         * describes the session, and the session did not change.
         */
        /**
         * ⛔⛔ BACK TO THE BOOK'S OWN WORDS (Michael, 2026-08-31): *"variant option labels are the
         * book's own workout names/shapes."* This supersedes the field-standard-name ruling directly
         * above, which is kept because it explains what "over-unders" was doing here and why the id
         * did not move with it. **"Surge and float" is Viada's phrasing, lifted verbatim** — that
         * was already recorded in the note above; it is now what the athlete reads.
         */
        label: 'Surge and Float',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        /**
         * ⛔⛔⛔ THE BANDS ARE BOUND TO ONE SHAPE NOW, AND THIS IS A TRAINING-DOSE FIX FOUND ON A REAL
         * ATHLETE'S BUILT PLAN (2026-08-31).
         *
         * ⛔ WHAT WENT WRONG, AND IT WAS NOT THE SAMPLING. This archetype spanned **two different
         * surge-and-float prescriptions at once** — a short surge with a moderate float, and a
         * longer surge with a near-threshold float — as one work band (125-130%) and one float band
         * (105-115%). The library emitted the float honestly as a RANGE. **The plan token then
         * collapsed every band to its top** (`session-vocabulary.ts`: *"`hi` is the band's top and
         * is what the session prescribes at"*), so the athlete was prescribed the hottest surge and
         * the hottest float together — a pairing that belongs to neither source shape. His float ran
         * at the top of the band where the short-surge shape asks for the bottom.
         *
         * ⛔ SO THE FIX IS TO STOP ONE ARCHETYPE STANDING FOR TWO SHAPES. This one is now the short
         * surge with the moderate float, and `long_surge_float` below is the other. Each band is
         * internally coherent, so taking its top is a dose the source actually prescribes.
         * ⚠️ THE ID IS UNCHANGED — every stored athlete pick and every built plan carries it.
         * ⚠️ AND THE REP COUNT IS BOUND TO THE LEVEL for the same reason: `repsBand` ran 6-12, and a
         * level-2 session was taking twelve rounds, which is the count this shape reaches only at
         * level 3. The band is now the count this shape uses at level 1 through level 3.
         */
        repBand: { lo: 15, hi: 15 },
        repsBand: { lo: 6, hi: 12 },
        work: pct(1.30),
        float: { band: { lo: 45, hi: 45 }, intensity: pct(1.05), label: 'Near-threshold float' },  // not-instruction: step labels (names for a step, not instructions); planned-step-lines prints a label only when page_label is set; no page names them; Michael's call
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: vt1 },
        set: { repeatsPerSet: { lo: 4, hi: 4 }, restBand: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada pp231-232 — 2-minute walk/recovery jog between sets',
      },
      {
        /**
         * ⛔ p231-232's SECOND SHAPE, ADDED 2026-09-11 (Michael: "workouts should be by the book"):
         *   L1  3 sets of 4 rounds of: 40 s @ 130% / 20 s @ 50%, 2-minute walk/recovery jog between sets
         *   L2  5 sets of 4 rounds of the same
         *   L3  "2 larger sets of 4 sets of 4 rounds" with two different recoveries — a nesting this
         *       library cannot state, so the shape is not offered at level 3 rather than approximated.
         * ⚠️ THE NAME IS OURS (the page prints only the numbers); the numbers are the page's.
         */
        id: 'forty_twenty',
        shape: 'intervals',
        label: 'Forty-Twenty Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 40, hi: 40 },
        repsBand: { lo: 12, hi: 20 },
        work: pct(1.30),
        recovery: { kind: 'stated', band: { lo: 20, hi: 20 }, intensity: pct(0.50) },
        set: { repeatsPerSet: { lo: 4, hi: 4 }, restBand: { lo: 120, hi: 120 }, intensity: easy },
        levels: [1, 2],
        printedIntervalsByLevel: {
          1: { sets: 3, rounds: 4, round: [W(40, 1.30, 'Surge'), { seconds: 20, role: 'recovery', intensity: pct(0.50) }], betweenSetsSeconds: 120 },
          2: { sets: 5, rounds: 4, round: [W(40, 1.30, 'Surge'), { seconds: 20, role: 'recovery', intensity: pct(0.50) }], betweenSetsSeconds: 120 },
        },
        cite: 'Viada pp231-232 — 2-minute walk/recovery jog between sets',
      },
      {
        /**
         * ⛔ THE OTHER SURGE-AND-FLOAT SHAPE, SPLIT OUT (2026-08-31) — see `surge_float` above for
         * why one archetype could not carry both. A longer surge just above threshold with a
         * near-threshold float under it, and a third step at threshold before the recovery.
         * ⚠️ NEW ID, so nothing stored resolves to it by accident; it enters the rotation as a fourth
         * shape the engine may choose, which is `rotatedArchetype`'s own job.
         */
        id: 'long_surge_float',
        shape: 'intervals',
        /**
         * ⛔ p231-232 AS PRINTED (read off the photos 2026-09-11):
         *   L1  2 sets of 3 rounds of: 45 s @ 125% / 45 s @ 115% / 30 s @ 100% / 1:30 @ VT1, 2 min between sets
         *   L2  2 sets of 4 rounds of the same
         *   L3  3 sets of 4 rounds of: 45 s @ 125% / 1 min @ 115% / 1 min @ 100% / 1:30 @ VT1, 2 min between sets
         */
        // not-instruction: step labels (names for a step, not instructions); planned-step-lines prints a label only when page_label is set; no page names them; Michael's call
        printedIntervalsByLevel: {
          1: { sets: 2, rounds: 3, round: [W(45, 1.25, 'Surge'), W(45, 1.15, 'Near-threshold float'), W(30, 1.00, 'At threshold'), RV(90)], betweenSetsSeconds: 120 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          2: { sets: 2, rounds: 4, round: [W(45, 1.25, 'Surge'), W(45, 1.15, 'Near-threshold float'), W(30, 1.00, 'At threshold'), RV(90)], betweenSetsSeconds: 120 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          3: { sets: 3, rounds: 4, round: [W(45, 1.25, 'Surge'), W(60, 1.15, 'Near-threshold float'), W(60, 1.00, 'At threshold'), RV(90)], betweenSetsSeconds: 120 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
        },
        label: 'Long Surge and Float',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 45, hi: 45 },
        repsBand: { lo: 6, hi: 12 },
        work: pct(1.25),
        /**
         * ⛔ THE PAGE'S ROUND, STEP FOR STEP (2026-09-05, Michael: "the code has to be 100%"). p232, level 2:
         * "2 sets of 4 rounds of: 45s @ 125% / 45s @ 115% / 30s @ 100% / 1:30 @ VT1". The float is 45 s, not a
         * 45–60 s range the page never gives (a built plan sampled 53 s from it), and the 30 s at threshold is
         * the third step, which was missing.
         */
        float: { band: { lo: 45, hi: 45 }, intensity: pct(1.15), label: 'Near-threshold float' },
        hold: { band: { lo: 30, hi: 30 }, intensity: pct(1.00), label: 'At threshold' },  // not-instruction: step label (a name for the step); no page names it; Michael's call
        recovery: { kind: 'stated', band: { lo: 90, hi: 90 }, intensity: vt1 },
        set: { repeatsPerSet: { lo: 3, hi: 4 }, restBand: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada pp231-232 — 2-minute recovery walk/jog between sets',
      },
      {
        id: 'descending',
        shape: 'descending',
        // ⛔ FIELD-STANDARD NAME, same call as `surge_float` above — "descending ladder" is the
        // book's words; "cut-downs" is the one a runner would recognise. Id and body unchanged.
        // ⛔ THE BOOK'S WORDS, same ruling as `surge_float` above (2026-08-31). "The descending
        // ladder" is how p231-232 prints it; "cut-downs" was the field's name for it. Id unchanged.
        label: 'Descending Ladder',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        /**
         * ⛔ THE RUNGS ARE THE SOURCE'S, PER LEVEL — see `ladderByLevel`. Level one runs the ladder
         * once; level two runs it again from partway down; level three runs it three times.
         */
        ladderByLevel: {
          1: [[180, 120, 60, 45, 30]],
          2: [[180, 120, 60, 45, 30], [120, 60, 45, 30]],
          3: [[180, 120, 60, 45, 30], [180, 120, 60, 45, 30], [180, 120, 60, 45, 30]],
        },
        ladderRoundRest: 120,
        repBand: { lo: 30, hi: 180 },
        work: pct(1.20),
        // ⚠️ TWO THIRDS EXACTLY, not the rounded 0.67 — the ladder's recovery is two-thirds of the
        // work rep, and the rounded constant put 121 seconds where the source's step is two minutes.
        recovery: { kind: 'proportional', factor: 2 / 3, intensity: pct(0.60) },
        cite: 'Viada pp231-232 — reps step down, recovery steps down with them',
      },
    ],
  },

  run_near_threshold: {
    sport: 'run',
    label: 'Near-Threshold',  // not-instruction: type name — the book's heading (p233) without the bracketed abbreviation (2026-09-19)
    workFloorPct: 0.85,
    intent: 'Maximum time near threshold, whether from shorter above-threshold intervals or longer '  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
      + 'below-threshold ones, while controlling fatigue.',
    cite: 'Viada pp233-234',
    archetypes: [
      {
        id: 'short_above',
        shape: 'intervals',
        /**
         * ⛔ p233-234 AS PRINTED (read off the photos 2026-09-11):
         *   L1  2 sets of 4 rounds of: 1 min @ 105% / 1 min @ 90%, 3-minute recovery walk/jog between sets
         *   L2  3 sets of 4 rounds of: 1 min @ 105% / 1:30 @ 90%, 3-minute recovery walk/jog between sets
         *   L3  4 sets of 4 rounds of: 1 min @ 105% / 1:30 @ 90%, 3-minute recovery walk/jog between sets
         */
        printedIntervalsByLevel: {
          1: { sets: 2, rounds: 4, round: [W(60, 1.05), W(60, 0.90, 'Float')], betweenSetsSeconds: 180 },
          2: { sets: 3, rounds: 4, round: [W(60, 1.05), W(90, 0.90, 'Float')], betweenSetsSeconds: 180 },
          3: { sets: 4, rounds: 4, round: [W(60, 1.05), W(90, 0.90, 'Float')], betweenSetsSeconds: 180 },
        },
        label: 'Short Threshold Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 60, hi: 90 },
        repsBand: { lo: 8, hi: 16 },
        work: pct(1.00, 1.05),
        recovery: { kind: 'threshold_ratio', intensity: vt1 },
        cite: 'Viada pp233-234; recovery per Ch.4 (4:1, clamped 30s-2min)',
      },
      {
        /**
         * ⛔⛔ UNBLENDED (2026-08-31). This ran 4-15 minutes at 92-105% as ONE band — **the source's
         * race-specific repeats span four race distances, and it pairs each duration with its own
         * intensity: the shortest repeats at the highest percentage, the longest at the lowest.**
         * Sampled apart, and with the plan token taking a band's top, the athlete could be
         * prescribed a fifteen-minute repeat at the shortest race's intensity — a dose on no line
         * anywhere.
         * ⚠️ SPLIT BY THE PAIRING, NOT BY RACE NAME. This is the short, sharp end; `race_repeats_long`
         * is the sustained end. Two coherent shapes rather than four transcribed prescriptions.
         * ⚠️ THE ID IS UNCHANGED — stored picks and built plans carry it.
         */
        id: 'race_repeats',
        shape: 'intervals',
        /**
         * ⛔ p233-234's RACE-SPECIFIC NT SESSIONS, THE 5K LINE, AS PRINTED (2026-09-11). The page
         * prints one line per race distance; this app's running programme is p246's Strength + 5K,
         * so the 5K line is the one it builds. The 10K, half-marathon and marathon lines belong to
         * no programme here and are not offered (the old `race_repeats_long` blended them).
         *   L1  2 x 5-minute repeats @ 105%   L2  4 x 4-minute repeats @ 105%   L3  4 x 5-minute repeats @ 105%
         *   3- to 5-minute recovery walk/jog between — the shortest the page states, 3 minutes.
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 2, round: [W(300, 1.05)], betweenRoundsSeconds: 180, betweenRoundsIntensity: vt1 },
          2: { sets: 1, rounds: 4, round: [W(240, 1.05)], betweenRoundsSeconds: 180, betweenRoundsIntensity: vt1 },
          3: { sets: 1, rounds: 4, round: [W(300, 1.05)], betweenRoundsSeconds: 180, betweenRoundsIntensity: vt1 },
        },
        label: 'Race-Specific Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        // ⚠️ FIVE TO EIGHT MINUTES. The floor is the shortest repeat this shape reaches, and it sits
        // ABOVE the embedded-surge block's length deliberately: two shapes of equal length with
        // different counts trips the library's own pairing property, and they are not equal on the
        // page either.
        repBand: { lo: 300, hi: 480 },
        repsBand: { lo: 2, hi: 4 },
        repsByLevel: { 1: { lo: 2, hi: 2 }, 2: { lo: 3, hi: 4 }, 3: { lo: 4, hi: 4 } },
        work: pct(1.00, 1.05),
        recovery: { kind: 'stated', band: { lo: 180, hi: 300 }, intensity: vt1 },
        cite: 'Viada pp233-234 — 3- to 5-minute recovery walk/jog between sets',
      },
      // ⛔ `race_repeats_long` ("Sustained race-specific repeats") WAS DELETED HERE 2026-09-11. It
      // blended the page's half-marathon and marathon lines into one band; this programme is the
      // 5K one and builds the 5K line above. A stored row carrying that id keeps its steps; the
      // chooser simply no longer offers it.
      {
        /**
         * ⛔⛔ UNBLENDED (2026-08-31). This ran 3:30-8:30 at 85-92% as one band, and **the source
         * pairs the two: the shorter repeats sit at the higher percentage and the longer ones step
         * down as they lengthen.** Sampled apart — and with the plan token taking a band's top — the
         * athlete could get the longest repeat at the hardest end, which is a harder session than
         * any the page prescribes. This is the shorter, firmer half.
         * ⚠️ THE ID IS UNCHANGED; `below_threshold_long` is the other half.
         */
        id: 'below_threshold',
        shape: 'intervals',
        label: 'Sub-Threshold Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 210, hi: 240 },
        repsBand: { lo: 5, hi: 8 },
        repsByLevel: { 1: { lo: 5, hi: 5 }, 2: { lo: 6, hi: 6 }, 3: { lo: 8, hi: 8 } },
        work: pct(0.90),
        recovery: { kind: 'stated', band: { lo: 60, hi: 90 }, intensity: vt1 },
        /**
         * ⛔ p233-234 AS PRINTED (2026-09-11): L1 5 rounds of 3:30 @ 90% / 1 min @ VT1; L2 6 rounds of
         * 4 min @ 90% / 1 min @ VT1. Level 3's line (8 rounds of 5 min @ 90% / 1:30 @ VT1) is
         * `sustained_5min_90`, so this shape stops at level 2 rather than printing the same session twice.
         */
        levels: [1, 2],
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 5, round: [W(210, 0.90)], betweenRoundsSeconds: 60, betweenRoundsIntensity: vt1 },
          2: { sets: 1, rounds: 6, round: [W(240, 0.90)], betweenRoundsSeconds: 60, betweenRoundsIntensity: vt1 },
        },
        cite: 'Viada pp233-234 — 1 to 1:30 at VT1 between',
      },
      /**
       * ⛔⛔⛔ p234'S OWN THREE LEVEL-3 LINES THAT SATISFY p247 — added verbatim, 2026-09-08.
       *
       * ⛔ WHY THEY EXIST AS THEIR OWN SHAPES. p247 asks for the Wednesday near-threshold session to
       * carry **5- to 8-minute work intervals**, and that filter selects exactly three of p234's
       * level-3 lines. The shapes already in this family model a SPAN and derive their rep count
       * from the dose — right for a library, and wrong for a slot whose page names three specific
       * sessions. These three carry DEGENERATE bands (`lo === hi`) so each builds the line it was
       * transcribed from and nothing else.
       *
       * ⛔ THE FILTER'S OWN WORKING, so nobody re-derives it. p234 level 3 prints ten sessions:
       *   · 10 × 1200m · 3 × 1600m + 6 × 400m · 1000m/800m/400m/200m — DISTANCE, and a distance
       *     needs a threshold pace this athlete may not have (2026-09-02: threshold is learned or
       *     entered, never derived from a 5K). Left out deliberately.
       *   · 4 sets of 4 rounds of 1 min @ 105% — one-minute work. Fails the filter.
       *   · 2 sets of 4 rounds of 20s @ 140% / 4:40 @ 92% — fails.
       *   · 3 sets of 4 rounds of 2 min @ 95% … — fails.
       *   · **8 rounds of 5 min @ 90% / 1:30 @ VT1** — PASSES.
       *   · **6 rounds of 6 min @ 88% / 1 min @ VT1** — PASSES.
       *   · **4 rounds of 8:30 @ 85% / 1 min @ VT1** — PASSES.
       *   · Race-specific NT — p247 reserves race pace for within six weeks of a race, which is the
       *     taper column's `NT (race tempo)`. Not the standard week.
       *
       * ⚠️ `levels: [3]` IS LOAD-BEARING. Standard Focus's day 3 is the same family at LEVEL 2, and
       * its rotation walks whatever this family offers at that level — so these three must not be
       * offered there, or that programme's week would change. Its composed block hash is the guard.
       * ⚠️ THEY DO NOT REPLACE THE SPAN SHAPES. `below_threshold` and `below_threshold_long` still
       * model the same method across all three levels for every other caller; what these add is the
       * page's own three lines, nameable by a frame that has to pick exactly them.
       */
      {
        id: 'sustained_5min_90',
        shape: 'intervals',
        label: '8 × 5 min Threshold',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 300, hi: 300 },
        repsBand: { lo: 8, hi: 8 },
        repsByLevel: { 3: { lo: 8, hi: 8 } },
        levels: [3],
        work: pct(0.90),
        recovery: { kind: 'stated', band: { lo: 90, hi: 90 }, intensity: vt1 },
        cite: 'Viada pp233-234 — "8 rounds of: 5 min @ 90% / 1:30 @ VT1"',
      },
      {
        id: 'sustained_6min_88',
        shape: 'intervals',
        label: '6 × 6 min Threshold',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 360, hi: 360 },
        repsBand: { lo: 6, hi: 6 },
        repsByLevel: { 3: { lo: 6, hi: 6 } },
        levels: [3],
        work: pct(0.88),
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: vt1 },
        cite: 'Viada pp233-234 — "6 rounds of: 6 min @ 88% / 1 min @ VT1"',
      },
      {
        id: 'sustained_8min30_85',
        shape: 'intervals',
        label: '4 × 8:30 Threshold',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 510, hi: 510 },
        repsBand: { lo: 4, hi: 4 },
        repsByLevel: { 3: { lo: 4, hi: 4 } },
        levels: [3],
        work: pct(0.85),
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: vt1 },
        cite: 'Viada pp233-234 — "4 rounds of: 8:30 @ 85% / 1 min @ VT1"',
      },
      {
        /** ⛔ THE LONGER, EASIER HALF of the same method — as the repeat lengthens the percentage
         *  steps down with it. Split so the two can no longer be combined. */
        id: 'below_threshold_long',
        shape: 'intervals',
        label: 'Long Sub-Threshold Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 360, hi: 510 },
        repsBand: { lo: 3, hi: 6 },
        repsByLevel: { 1: { lo: 3, hi: 3 }, 2: { lo: 5, hi: 5 }, 3: { lo: 4, hi: 6 } },
        work: pct(0.85, 0.88),
        recovery: { kind: 'stated', band: { lo: 60, hi: 90 }, intensity: vt1 },
        /**
         * ⛔ p233-234 AS PRINTED (2026-09-11): L1 3 rounds of 6 min @ 88% / 1 min @ VT1; L2 5 rounds of
         * the same. Level 3's lines (6 x 6 @ 88%, 4 x 8:30 @ 85%) are `sustained_6min_88` and
         * `sustained_8min30_85`, so this shape stops at level 2.
         */
        levels: [1, 2],
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 3, round: [W(360, 0.88)], betweenRoundsSeconds: 60, betweenRoundsIntensity: vt1 },
          2: { sets: 1, rounds: 5, round: [W(360, 0.88)], betweenRoundsSeconds: 60, betweenRoundsIntensity: vt1 },
        },
        cite: 'Viada pp233-234 — 1 minute at VT1 between',
      },
      {
        /**
         * ⛔⛔ UNBLENDED (2026-08-31). The surge band ran 115-140%, and **those two surges belong to
         * two different near-threshold shapes** — a short surge inside a block just under threshold,
         * and a much sharper one opening a long steady effort. One band let the sharp surge be
         * prescribed inside the wrong block, and the plan token takes a band's top, so it was.
         * ⚠️ THE ID IS UNCHANGED; `surge_opener` is the other shape.
         */
        id: 'surge_embedded',
        shape: 'intervals',
        /**
         * ⛔ p233-234 AS PRINTED (read off the photos 2026-09-11):
         *   L1  4 rounds of: 2 min @ 95% / 15 s @ 115% / 1:15 @ 95% / 2 min @ 90% / 1:30 to 2 min of VT1 recovery
         *   L2  2 sets of 4 rounds of the same, additional 5-minute VT1 jog between sets
         *   L3  3 sets of 4 rounds of the same, additional 5-minute VT1 jog between sets
         * The VT1 recovery is the shortest the page states, 1:30.
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 4, round: [W(120, 0.95), W(15, 1.15, 'Surge'), W(75, 0.95), W(120, 0.90), RV(90)] },
          2: { sets: 2, rounds: 4, round: [W(120, 0.95), W(15, 1.15, 'Surge'), W(75, 0.95), W(120, 0.90), RV(90)], betweenSetsSeconds: 300, betweenSetsIntensity: vt1 },
          3: { sets: 3, rounds: 4, round: [W(120, 0.95), W(15, 1.15, 'Surge'), W(75, 0.95), W(120, 0.90), RV(90)], betweenSetsSeconds: 300, betweenSetsIntensity: vt1 },
        },
        label: 'Threshold with a Surge',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 240, hi: 300 },
        repsBand: { lo: 4, hi: 12 },
        repsByLevel: { 1: { lo: 4, hi: 4 }, 2: { lo: 8, hi: 8 }, 3: { lo: 12, hi: 12 } },
        work: pct(0.92, 0.95),
        float: { band: { lo: 15, hi: 15 }, intensity: pct(1.15), label: 'Surge', insideRep: true },
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: easy },
        cite: 'Viada pp233-234 — a short supra-threshold surge inside a near-threshold block',
      },
      {
        /** ⛔ THE OTHER SHAPE: a brief, much sharper surge opening a long steady effort. Split from
         *  `surge_embedded` so the sharp surge can no longer land inside the shorter block. */
        id: 'surge_opener',
        shape: 'intervals',
        /**
         * ⛔ p233-234 AS PRINTED (read off the photos 2026-09-11):
         *   L1  5 rounds of: 20 s @ 140% / 4:40 @ 92% / 1-minute easy jog
         *   L2  6 rounds of the same
         *   L3  2 sets of 4 rounds of the same, 5-minute VT1 jog between sets
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 5, round: [W(20, 1.40, 'Opening surge'), W(280, 0.92), R(60)] },
          2: { sets: 1, rounds: 6, round: [W(20, 1.40, 'Opening surge'), W(280, 0.92), R(60)] },
          3: { sets: 2, rounds: 4, round: [W(20, 1.40, 'Opening surge'), W(280, 0.92), R(60)], betweenSetsSeconds: 300, betweenSetsIntensity: vt1 },
        },
        label: 'Surge into Steady',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        // ⚠️ THE BLOCK IS THE SURGE PLUS THE STEADY EFFORT, and it sits BELOW the short race repeat's
        // length deliberately: two shapes of equal length with different counts trip the library's
        // own pairing property, and these two are not equal on the page either.
        repBand: { lo: 280, hi: 280 },
        repsBand: { lo: 5, hi: 8 },
        repsByLevel: { 1: { lo: 5, hi: 5 }, 2: { lo: 6, hi: 6 }, 3: { lo: 8, hi: 8 } },
        work: pct(0.92),
        float: { band: { lo: 20, hi: 20 }, intensity: pct(1.40), label: 'Opening surge', insideRep: true },
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: easy },
        cite: 'Viada pp233-234 — a sharp opening surge before a long steady effort',
      },
    ],
  },

  run_vt1: {
    sport: 'run',
    /**
     * ⛔ VT1 IS LAB VOCABULARY (Michael, 2026-08-25) — the first ventilatory threshold, which is the
     * book's term and a physiologist's, not a word an athlete uses about their own week.
     * ⚠️ COPY-VOICE rule 9 names exactly this class. The key `run_vt1` is unchanged.
     */
    label: 'Easy',
    workFloorPct: 0,
    intent: 'Any run at or below VT1. The level refers almost strictly to the duration.',  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
    cite: 'Viada p235',
    archetypes: [
      {
        id: 'continuous',
        shape: 'continuous',
        /**
         * ⛔ DISPLAY NAME ONLY — the book's word for it, replaced with the field's (Michael,
         * 2026-08-25). ⚠️ THE ID IS UNTOUCHED and is what everything matches on: the athlete's
         * stored `archetype` pick, the composer's `archetypes` map, `VARIANT_BODY`. ⚠️ The `intent`
         * and `cite` lines below are unchanged — the session did not change, only its name.
         */
        label: 'Steady easy run',  // not-instruction: session name, not an instruction; no page names it; Michael's call
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
    intent: 'Maximise training time; may combine zones but is primarily below VT1. Unlike VT1 '  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
      + 'sessions it may include rest periods or pauses with little negative impact.',
    cite: 'Viada p235',
    archetypes: [
      {
        id: 'long_with_inserts',
        shape: 'continuous_with_inserts',
        /**
         * ⛔ DISPLAY NAME ONLY — the book's word for it, replaced with the field's (Michael,
         * 2026-08-25). ⚠️ THE ID IS UNTOUCHED and is what everything matches on: the athlete's
         * stored `archetype` pick, the composer's `archetypes` map, `VARIANT_BODY`. ⚠️ The `intent`
         * and `cite` lines below are unchanged — the session did not change, only its name.
         */
        label: 'Long easy run with inserted sets',  // not-instruction: session name, not an instruction; no page names it; Michael's call
        repBand: { lo: 30, hi: 240 },
        work: pct(0.95, 1.15),
        recovery: { kind: 'stated', band: { lo: 30, hi: 60 }, intensity: vt1 },
        /**
         * ⛔ p235 AS PRINTED (2026-09-18). L1 "45-minute VT1 run with 2 sets added at any point. The sets are 2 rounds
         * of 30 seconds @ 100% 30 seconds @ 90%"; L2 "1-hour VT1 run with 2 sets added at any point. The sets are 2
         * rounds of 1 minute, 30 seconds @ 115% 30 seconds @ VT1"; L3 "1.5-hour VT1 run with 3 sets added at any
         * point. Sets are either 3 rounds of 1 minute @ 115% 30 seconds @ VT1 or 2 rounds of 4 minutes @ 95% 1 minute
         * @ VT1" — the first of the two.
         */
        printedLongRunByLevel: {
          // ⚠️ The 30 s @ 90% is the easier half of the round, a `float` (`StepRole`): the page prints no rest in it.
          1: { inserts: { count: 2, rounds: 2, round: [W(30, 1.00), { seconds: 30, role: 'float', intensity: pct(0.90) }] } },
          2: { inserts: { count: 2, rounds: 2, round: [W(90, 1.15), { seconds: 30, role: 'recovery', intensity: vt1 }] } },
          3: { inserts: { count: 3, rounds: 3, round: [W(60, 1.15), { seconds: 30, role: 'recovery', intensity: vt1 }] } },
        },
        // Computed from his three level examples: the inserted sets take 8%, 12% and 13% of the
        // session. The mean is what sizes them here.
        insertShare: 0.11,
        cite: 'Viada p235 — sets added at any point in the run',
      },
      {
        id: 'race_pace_finish',
        shape: 'continuous_with_finish',
        /**
         * ⛔ DISPLAY NAME ONLY — the book's word for it, replaced with the field's (Michael,
         * 2026-08-25). ⚠️ THE ID IS UNTOUCHED and is what everything matches on: the athlete's
         * stored `archetype` pick, the composer's `archetypes` map, `VARIANT_BODY`. ⚠️ The `intent`
         * and `cite` lines below are unchanged — the session did not change, only its name.
         */
        label: 'Long easy run with a race-pace finish',  // not-instruction: session name, not an instruction; no page names it; Michael's call
        repBand: { lo: 5 * 60, hi: 15 * 60 },
        work: { kind: 'race_pace' },
        recovery: { kind: 'open' },
        /**
         * ⛔ p235 AS PRINTED (2026-09-18). L1 "30 minutes @ VT1 5 minutes @ race pace finish"; L2 "60 minutes @ VT1
         * with single 5 minutes @ 95% interval in the middle 10 minutes @ race pace finish"; L3 "90 to 120 minutes @ VT1
         * with single 10 minutes @ 95% interval in the middle 15 minutes @ race pace finish".
         */
        printedLongRunByLevel: {
          1: { finish: { seconds: 5 * 60, role: 'work', intensity: { kind: 'race_pace' } } },
          2: { inserts: { count: 1, rounds: 1, round: [W(5 * 60, 0.95)] }, finish: { seconds: 10 * 60, role: 'work', intensity: { kind: 'race_pace' } } },
          3: { inserts: { count: 1, rounds: 1, round: [W(10 * 60, 0.95)] }, finish: { seconds: 15 * 60, role: 'work', intensity: { kind: 'race_pace' } } },
        },
        cite: 'Viada p235',
      },
      {
        id: 'fartlek',
        shape: 'continuous_with_inserts',
        /**
         * ⛔ DISPLAY NAME ONLY — the book's word for it, replaced with the field's (Michael,
         * 2026-08-25). ⚠️ THE ID IS UNTOUCHED and is what everything matches on: the athlete's
         * stored `archetype` pick, the composer's `archetypes` map, `VARIANT_BODY`. ⚠️ The `intent`
         * and `cite` lines below are unchanged — the session did not change, only its name.
         */
        label: 'Easy fartlek',  // not-instruction: session name, not an instruction; no page names it; Michael's call
        repBand: { lo: 180, hi: 240 },
        work: pct(0.85),
        recovery: { kind: 'stated', band: { lo: 60, hi: 60 }, intensity: vt1 },
        /**
         * ⛔ p235 AS PRINTED (2026-09-18): no fartlek at level 1; L2 "1.5-hour VT1 fartlek, with target of 6 x 3
         * minutes @ 85% during the session"; L3 "2- to 2.5-hour VT1 fartlek, with target of 6 x 4 minutes @ 85% during
         * the session".
         */
        levels: [2, 3],
        printedLongRunByLevel: {
          2: { inserts: { count: 6, rounds: 1, round: [W(3 * 60, 0.85)] } },
          3: { inserts: { count: 6, rounds: 1, round: [W(4 * 60, 0.85)] } },
        },
        // Computed from his level 2 and level 3 fartleks: the targeted efforts take 20% and 18% of
        // the session.
        insertShare: 0.19,
        cite: 'Viada p235 — a target number of efforts during the session',
      },
      {
        id: 'hike',
        shape: 'continuous',
        /**
         * ⛔ DISPLAY NAME ONLY — the book's word for it, replaced with the field's (Michael,
         * 2026-08-25). ⚠️ THE ID IS UNTOUCHED and is what everything matches on: the athlete's
         * stored `archetype` pick, the composer's `archetypes` map, `VARIANT_BODY`. ⚠️ The `intent`
         * and `cite` lines below are unchanged — the session did not change, only its name.
         */
        label: 'Mixed-terrain hike or easy jog',  // not-instruction: session name, not an instruction; no page names it; Michael's call
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
        // ⛔ p236 PRINTS THE COUNT PER LEVEL — 3 / 5 / 6 (checked off `p236.jpg` 2026-09-13).
        repsByLevel: { 1: { lo: 3, hi: 3 }, 2: { lo: 5, hi: 5 }, 3: { lo: 6, hi: 6 } },
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
        /**
         * ⛔⛔ THE PAGE'S SESSIONS, PER LEVEL (checked off `p236.jpg` 2026-09-13). The band builder
         * made level 1 three sets of four 15-second surges; p236 level 1 is *"8 rounds of flying
         * 30-second surges to max effort, with 2 to 3 minutes recovery between"*. Level 2 is 2 sets of
         * 5, level 3 (this option) 2 sets of 6, all 30 seconds.
         * ⚠️ THE RECOVERY IS OURS WITHIN HIS RANGE: 150 s, the middle of *"2 to 3 minutes"* — the same
         * middle the band builder takes for every stated recovery range. p236 gives no separate
         * between-sets figure, so the same 150 s is used there.
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 8, round: [AO(30, 'Surge')], betweenRoundsSeconds: 150 },
          2: { sets: 2, rounds: 5, round: [AO(30, 'Surge')], betweenRoundsSeconds: 150, betweenSetsSeconds: 150 },
          3: { sets: 2, rounds: 6, round: [AO(30, 'Surge')], betweenRoundsSeconds: 150, betweenSetsSeconds: 150 },
        },
        cite: 'Viada p236',
      },
      {
        /**
         * ⛔⛔ THE ZERO-LENGTH REP WAS AN ARTIFACT (2026-08-31): `repBand { lo: 0, hi: 0 }` gave the
         * work step no clock, so the session's length was recovery-only and **all three levels built
         * an identical 92 minutes** — a level that changes nothing is a level that is not being read.
         * ⛔ THE STEP STILL CARRIES NO INVENTED DURATION. The source states none for a standing start:
         * it is an acceleration from a near-stop up to speed, and how long that takes is the rider's.
         * What is fixed is the COUNT, which the source does give per level, so the levels now differ
         * by what the page differs by rather than by nothing.
         */
        id: 'standing_start',
        shape: 'intervals',
        label: 'Standing starts',
        repBand: { lo: 0, hi: 0 },
        repsBand: { lo: 6, hi: 10 },
        repsByLevel: { 1: { lo: 6, hi: 6 }, 2: { lo: 8, hi: 8 }, 3: { lo: 10, hi: 10 } },
        work: { kind: 'all_out' },
        recovery: { kind: 'stated', band: { lo: 360, hi: 600 }, intensity: easy },
        cite: 'Viada p236 — 6 to 10 minutes of easy spin between reps',
      },
    ],
  },

  ride_anaerobic: {
    sport: 'ride',
    label: 'Anaerobic',  // not-instruction: type name — the book's heading (p237) without the bracketed abbreviation (2026-09-19)
    workFloorPct: 1.0,
    floorOnly: true,
    intent: 'Anaerobic repeatability. Best done by feel against a power FLOOR rather than a specific '
      + 'power target — the numbers are guidelines.',
    cite: 'Viada p237',
    archetypes: [
      {
        /**
         * ⛔⛔ IT IS A PROGRESSION, NOT A SAMPLING RANGE (2026-08-31). The source describes these
         * repeats as **starting at the bottom of the band and progressing to the top by the end of
         * the session** — that is a shape, and it was modelled as one flat band. Every repeat
         * therefore carried 110-130%, and the plan token takes a band's top, so **every repeat was
         * prescribed at the ceiling.** `progressive` makes the intensity climb rep by rep, which is
         * what the page actually asks for and is easier work early and harder work late.
         * ⚠️ THE REP LENGTH IS PER-LEVEL, which it always was — the level moves the repeat's length
         * inside the band. What is new is that the COUNT is now per-level too.
         */
        id: 'progressive_repeats',
        shape: 'intervals',
        label: 'Progressive Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 45, hi: 90 },
        // ⛔ p237 PRINTS ONE LENGTH PER LEVEL — 45 seconds, 1 minute, 1:30 (2026-09-11). The band
        // above stays as the bracket; the level's own number is what builds.
        repSecondsByLevel: { 1: 45, 2: 60, 3: 90 },
        repsBand: { lo: 6, hi: 10 },
        repsByLevel: { 1: { lo: 6, hi: 10 }, 2: { lo: 6, hi: 10 }, 3: { lo: 6, hi: 10 } },
        progressive: true,
        work: pct(1.10, 1.30),
        recovery: { kind: 'stated', band: { lo: 240, hi: 360 }, intensity: easy },
        cite: 'Viada p237 — 4 to 6 minutes of recovery between sets',
      },
      {
        id: 'one_to_one',
        shape: 'intervals',
        /**
         * ⛔ p237 AS PRINTED (read off the photo 2026-09-11):
         *   L1  10 rounds of: 1 min @ 110% / 1 min @ 50%
         *   L2  2 sets of 7 rounds of: 1 min @ 110% / 1 min @ 50%, 5-minute spin between sets
         *   L3  2 sets of 8 rounds of: 1 min @ 120% / 1 min @ 50%, 5-minute spin between sets
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 10, round: [W(60, 1.10), { seconds: 60, role: 'recovery', intensity: pct(0.50) }] },
          2: { sets: 2, rounds: 7, round: [W(60, 1.10), { seconds: 60, role: 'recovery', intensity: pct(0.50) }], betweenSetsSeconds: 300 },
          3: { sets: 2, rounds: 8, round: [W(60, 1.20), { seconds: 60, role: 'recovery', intensity: pct(0.50) }], betweenSetsSeconds: 300 },
        },
        label: 'One-to-One Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
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
        /**
         * ⛔ p237 AS PRINTED (read off the photo 2026-09-11) — the surge is on BOTH sides:
         *   L1  5 rounds of: 30 s @ 120% / 2:30 @ 90% / 30 s @ 120% / 4-minute easy spin
         *   L2  6 rounds of: 30 s @ 120% / 4 min @ 90% / 30 s @ 120% / 4-minute easy spin
         *   L3  2 sets of 4 rounds of: 30 s @ 120% / 5:30 @ 90% / 30 s @ 120% / 4-minute easy spin,
         *       5-minute additional spin/recovery between sets
         */
        // not-instruction: step labels (names for a step, not instructions); planned-step-lines prints a label only when page_label is set; no page names them; Michael's call
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 5, round: [W(30, 1.20, 'Surge'), W(150, 0.90, 'Sustained effort'), W(30, 1.20, 'Surge')], betweenRoundsSeconds: 240 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          2: { sets: 1, rounds: 6, round: [W(30, 1.20, 'Surge'), W(240, 0.90, 'Sustained effort'), W(30, 1.20, 'Surge')], betweenRoundsSeconds: 240 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          // p237 L3: the round's "4-minute easy spin" PLUS the "5-minute additional spin/recovery between sets" — 9 minutes.
          3: { sets: 2, rounds: 4, round: [W(30, 1.20, 'Surge'), W(330, 0.90, 'Sustained effort'), W(30, 1.20, 'Surge')], betweenRoundsSeconds: 240, betweenSetsSeconds: 240 + 300 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
        },
        label: 'Surge, Sustain, Surge',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
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
    label: 'VO2',  // not-instruction: type name — the book's heading (p238) without the bracketed abbreviation (2026-09-19)
    workFloorPct: 1.10,
    intent: 'Push maximum aerobic intake. More metabolically taxing than the anaerobic work, and to '
      + 'be controlled more carefully rather than ridden on the "more power is better" principle.',
    cite: 'Viada p238',
    archetypes: [
      {
        id: 'long_vo2',
        shape: 'intervals',
        label: 'Long VO2 Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 180, hi: 300 },
        repsBand: { lo: 5, hi: 5 },
        work: pct(1.10, 1.20),
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        cite: 'Viada p238 — 5-minute rest',
      },
      {
        id: 'short_vo2',
        shape: 'intervals',
        label: 'Short VO2 Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 90, hi: 90 },
        repsBand: { lo: 12, hi: 20 },
        work: pct(1.15),
        recovery: { kind: 'proportional', factor: 1, intensity: easy },
        set: { repeatsPerSet: { lo: 6, hi: 10 }, restBand: { lo: 300, hi: 300 }, intensity: easy },
        /**
         * ⛔ p238 AS PRINTED (2026-09-19) — fixed per level, not sized by session length:
         *   L1 / L2 / L3  2 sets of 6 / 8 / 10 rounds of 1:30 @ 115% / 1:30 @ easy spin, 5 minutes between sets
         */
        printedIntervalsByLevel: {
          1: { sets: 2, rounds: 6, round: [W(90, 1.15), { seconds: 90, role: 'recovery', intensity: easy }], betweenSetsSeconds: 300 },
          2: { sets: 2, rounds: 8, round: [W(90, 1.15), { seconds: 90, role: 'recovery', intensity: easy }], betweenSetsSeconds: 300 },
          3: { sets: 2, rounds: 10, round: [W(90, 1.15), { seconds: 90, role: 'recovery', intensity: easy }], betweenSetsSeconds: 300 },
        },
        cite: 'Viada p238',
      },
      {
        id: 'micro',
        shape: 'intervals',
        label: 'Micro-Intervals',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 30, hi: 40 },
        repsBand: { lo: 20, hi: 32 },
        work: pct(1.25),
        recovery: { kind: 'stated', band: { lo: 20, hi: 30 }, intensity: pct(0.85) },
        set: { repeatsPerSet: { lo: 5, hi: 8 }, restBand: { lo: 300, hi: 300 }, intensity: easy },
        /**
         * ⛔⛔ THE PAGE'S SESSIONS, PER LEVEL (checked off `p238.jpg` 2026-09-13). The band builder
         * made level 1 six sets with 25-second recoveries; p238 level 1 is *"4 sets of 5 rounds of
         * 30 seconds @ 125% / 30 seconds @ 85%, 5-minute rest between sets"*. Level 2 is 4 sets of 8
         * of the same; level 3 is 4 sets of 8 of 40 s @ 125% / 20 s @ 85%.
         */
        printedIntervalsByLevel: {
          1: { sets: 4, rounds: 5, round: [W(30, 1.25), { seconds: 30, role: 'recovery', intensity: pct(0.85) }], betweenSetsSeconds: 300 },
          2: { sets: 4, rounds: 8, round: [W(30, 1.25), { seconds: 30, role: 'recovery', intensity: pct(0.85) }], betweenSetsSeconds: 300 },
          3: { sets: 4, rounds: 8, round: [W(40, 1.25), { seconds: 20, role: 'recovery', intensity: pct(0.85) }], betweenSetsSeconds: 300 },
        },
        cite: 'Viada p238',
      },
    ],
  },

  ride_sweet_spot: {
    sport: 'ride',
    label: 'Sweet Spot',  // not-instruction: type name — the book's heading (p238) without the bracketed abbreviation (2026-09-19)
    workFloorPct: 0.80,
    underThreshold: true,
    intent: 'As close to threshold as possible without exceeding it — plenty of time in the zone '  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
      + 'with far less fatigue than riding at or above it.',
    cite: 'Viada pp238-239',
    archetypes: [
      {
        id: 'minute_surge',
        shape: 'intervals',
        /**
         * ⛔ p238-239 AS PRINTED (read off the photos 2026-09-11) — "6 minutes @ 90% with 10 seconds
         * @ 105% every minute on the minute" is six minutes of (10 s @ 105% / 50 s @ 90%):
         *   L1  3 sets of 6 minutes, 3-minute easy spin between
         *   L2  4 sets of 6 minutes, 3-minute easy spin between
         *   L3  4 sets of 8 minutes, 3-minute easy spin between
         */
        // not-instruction: step labels (names for a step, not instructions); planned-step-lines prints a label only when page_label is set; no page names them; Michael's call
        printedIntervalsByLevel: {
          1: { sets: 3, rounds: 6, round: [W(10, 1.05, 'Surge, on the minute'), W(50, 0.90)], betweenSetsSeconds: 180 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          2: { sets: 4, rounds: 6, round: [W(10, 1.05, 'Surge, on the minute'), W(50, 0.90)], betweenSetsSeconds: 180 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
          3: { sets: 4, rounds: 8, round: [W(10, 1.05, 'Surge, on the minute'), W(50, 0.90)], betweenSetsSeconds: 180 },  // not-instruction: step label (a name for the step); no page names it; Michael's call
        },
        label: 'Sweet Spot with Surges',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
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
        /**
         * ⛔ p238-239 AS PRINTED (2026-09-11): L1 6 rounds of 4 min @ 95% / 2-minute easy spin;
         * L2 8 rounds of the same; L3 8 rounds of 2 min @ 95% / 2 min @ 100% / 2-minute easy spin.
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 6, round: [W(240, 0.95)], betweenRoundsSeconds: 120 },
          2: { sets: 1, rounds: 8, round: [W(240, 0.95)], betweenRoundsSeconds: 120 },
          3: { sets: 1, rounds: 8, round: [W(120, 0.95), W(120, 1.00)], betweenRoundsSeconds: 120 },
        },
        label: 'Medium Sweet Spot Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 120, hi: 240 },
        repsBand: { lo: 6, hi: 8 },
        work: pct(0.95, 1.00),
        recovery: { kind: 'stated', band: { lo: 120, hi: 120 }, intensity: easy },
        cite: 'Viada pp238-239 — 2-minute easy spin',
      },
      {
        id: 'long',
        shape: 'intervals',
        /**
         * ⛔ p238-239 AS PRINTED (2026-09-11): L1 3 rounds of 8 min @ 90% / 4-minute easy spin;
         * L2 4 rounds of the same; L3 4 rounds of 10 min @ 90% / 4-minute easy spin.
         */
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 3, round: [W(480, 0.90)], betweenRoundsSeconds: 240 },
          2: { sets: 1, rounds: 4, round: [W(480, 0.90)], betweenRoundsSeconds: 240 },
          3: { sets: 1, rounds: 4, round: [W(600, 0.90)], betweenRoundsSeconds: 240 },
        },
        label: 'Long Sweet Spot Repeats',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 480, hi: 600 },
        repsBand: { lo: 3, hi: 4 },
        work: pct(0.90),
        recovery: { kind: 'stated', band: { lo: 240, hi: 240 }, intensity: easy },
        cite: 'Viada pp238-239 — 4-minute easy spin',
      },
      {
        id: 'tempo',
        shape: 'intervals',
        label: 'Tempo Blocks',  // not-instruction: workout name, ours (Michael approved the words 2026-09-19); no page prints a name for it
        repBand: { lo: 900, hi: 1200 },
        repsBand: { lo: 3, hi: 3 },
        work: pct(0.80),
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        /**
         * ⛔ p238-239 AS PRINTED (2026-09-11): L1 3 rounds of 15 min @ 80% / 5-minute easy spin;
         * L2 3 rounds of 20 min @ 80% / 5-minute easy spin. L3 adds "a 10-second all-out sprint every
         * 4 minutes", and all-out is not a number this library can put on a step — so the shape is
         * not offered at level 3 rather than printed without its sprints.
         */
        levels: [1, 2],
        printedIntervalsByLevel: {
          1: { sets: 1, rounds: 3, round: [W(900, 0.80)], betweenRoundsSeconds: 300 },
          2: { sets: 1, rounds: 3, round: [W(1200, 0.80)], betweenRoundsSeconds: 300 },
        },
        cite: 'Viada pp238-239 — 5-minute easy spin',
      },
    ],
  },

  ride_endurance: {
    sport: 'ride',
    label: 'Endurance',
    workFloorPct: 0,
    intent: 'Straight endurance, or endurance carrying some speed/threshold work. Each level is '  // not-instruction: never prints — a family `intent` reaches only the library session's notes (generate.ts:1072) and slotFamilyFact's body; nothing reads those notes (translateEnduranceSession, enduranceLedgerFor, session-swap use none) and NonRaceBuilder reads only slotFamilyFact's title
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
        label: 'Endurance ride with tempo blocks and sprints',  // not-instruction: session name, not an instruction; no page names it; Michael's call
        repBand: { lo: 120, hi: 120 },
        work: pct(0.80),
        float: { band: { lo: 180, hi: 180 }, intensity: pct(0.70), label: 'Steady' },
        recovery: { kind: 'stated', band: { lo: 300, hi: 300 }, intensity: easy },
        // Computed from his three level examples: the tempo blocks take 24%, 31% and 33% of the ride.
        // ⚠️ SUPERSEDED FOR THIS ARCHETYPE by `printedByLevel` below; kept because the shape builder is
        // still the fallback for any level the table does not carry.
        insertShare: 0.29,
        /**
         * ⛔ p239 AS PRINTED (docs/SOURCE-viada-hybrid-athlete.md, Endurance p239):
         *   L1  20-min easy spin · 4 rounds of (2 min @ 80% / 3 min @ 70%) · 45 min @ VT1 with a
         *       10-second all-out sprint every 9 minutes
         *   L2  20-min easy spin · 2 sets of 4 rounds … with 5-min easy spin between sets · 60 min @ VT1
         *       with a 10-second all-out sprint every 8 minutes
         *   L3  20-min easy spin · 3 sets of 4 rounds … with 5-min easy spin between sets · 90 min @ VT1
         *       with a 10-second all-out sprint every 9 minutes
         */
        printedByLevel: {
          1: { openSeconds: 20 * 60, sets: 1, roundsPerSet: 4, round: [{ seconds: 120, pct: 0.80 }, { seconds: 180, pct: 0.70 }], betweenSetsSeconds: 0, finishSeconds: 45 * 60, sprintSeconds: 10, sprintEverySeconds: 9 * 60 },
          2: { openSeconds: 20 * 60, sets: 2, roundsPerSet: 4, round: [{ seconds: 120, pct: 0.80 }, { seconds: 180, pct: 0.70 }], betweenSetsSeconds: 5 * 60, finishSeconds: 60 * 60, sprintSeconds: 10, sprintEverySeconds: 8 * 60 },
          3: { openSeconds: 20 * 60, sets: 3, roundsPerSet: 4, round: [{ seconds: 120, pct: 0.80 }, { seconds: 180, pct: 0.70 }], betweenSetsSeconds: 5 * 60, finishSeconds: 90 * 60, sprintSeconds: 10, sprintEverySeconds: 9 * 60 },
        },
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
        /**
         * ⛔ THE BOOK'S OWN SENTENCE, REPLACED WITH A NAME (Michael, 2026-08-25). "Out and across,
         * sighting on a fixed interval" is p749/754 verbatim, and it reads as an instruction rather
         * than a label. ⚠️ The id `out_and_across` is unchanged.
         */
        label: 'Open-water sighting intervals',
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

/**
 * ⛔⛔ SESSION ADD-ONS — A SHORT BLOCK HUNG ON THE END OF AN OTHERWISE WHOLE SESSION.
 *
 * ⛔ THE GAP THIS FILLS. Every session this library builds is a WHOLE session, so there was no way
 * to say *"this session, plus a short piece of something else on the end"* — and that is exactly
 * what p109 prescribes:
 *
 * > *"Even for speed development, athletes can improve turnover/running economy with as few as a
 * > handful of strides before, during, or after other running sessions, so there's no need for a
 * > speed session to be a lengthy stand-alone!"*
 *
 * Same page: *"All minutes count… many of them can be multipurpose sessions."*
 *
 * ⛔⛔ AND IT IS WHY THE FRAME NEEDS NO FIFTH SLOT. p119 lists running economy FIRST of the three
 * qualities that may not lapse, and none of the frame's four sessions is speed work — MLSS,
 * near-threshold, VT1 and LSD are all threshold-or-below. p246 prints four endurance slots and
 * Michael ruled all four are the frame's, so the economy work goes ON one of them.
 *
 * ⚠️ THE ADD-ON COMES OUT OF THE SESSION'S OWN DOSE, NOT ON TOP OF IT. p109's own framing is a
 * MULTIPURPOSE session, not a longer one, and a bolted-on block would push the easy run past the
 * band p235 prints for it — which p275 forbids at the other end for the same reason.
 */
export type SessionAddOnId = 'strides';

export type SessionAddOn = {
  id: SessionAddOnId;
  label: string;
  /** ⛔ The sport it belongs to. A stride is a running movement; nothing else offers this yet. */
  sport: Sport;
  /** Which families may carry it. */
  families: FamilyId[];
  reps: Range;
  secondsPerRep: Range;
  work: Intensity;
  cite: string;
};

/**
 * ⛔ STRIDES — HIS PLACEMENT, HIS INTENSITY, OUR DOSE, AND EACH PART IS LABELLED.
 *
 * HIS (p109): a handful of strides before, during or after another run is enough to train running
 * economy, and a speed session need not be a stand-alone.
 *
 * HIS (p229, `run_sprint_power`): the intensity is *"all-out"* — the best speed available that day —
 * and it carries NO PACE TARGET, deliberately. *"Paces come from performance and RPE rather than a
 * prescribed pace."* The recovery is his `open`: full recovery, no stated duration.
 *
 * ⚠️ OURS: SIX EFFORTS OF THIRTY SECONDS (Michael's ruling, 2026-08-28), narrowed from the four-to-
 * eight / twenty-to-thirty BAND he set on 2026-08-26. The page gives no dose for a stride — the
 * shortest thing he prints is a 25-50 m maximal acceleration (`short_max`), which is four to eight
 * SECONDS and a different movement. Twenty to thirty seconds is the field standard for a stride
 * (Daniels, Pfitzinger and the Hansons all append them to an easy day), which is why it will not
 * read as strange to a runner or to a lifter; six at thirty is the point inside that band he named.
 *
 * ⛔⛔ AND THE RECOVERY IS UNTIMED, WHICH IS HIS AND WAS BEING OVERRIDDEN. p229's recovery for the
 * all-out effort is `open` — full recovery, no stated duration — and this file has always said so.
 * The materializer was stamping NINETY SECONDS on it anyway, under a comment claiming *"a watch step
 * cannot be untimed."* **That claim is false and the app already disproves it**:
 * `send-workout-to-garmin` carries a `lap_button` step and maps it to Garmin's `OPEN` duration type,
 * whose own note reads *"a lap-button step has no duration to state — Garmin ends it when the athlete
 * presses lap."*
 *
 * ⛔ SO THE STRIDES COST THE SESSION THREE MINUTES, NOT ELEVEN. Michael, 2026-08-28: *"The card says
 * 3 minutes of strides. The watch beeps six times."* Six thirty-second efforts is the whole of what
 * the clock may charge; the rest between them is the athlete's and is not the app's to spend.
 */
export const SESSION_ADD_ONS: Record<SessionAddOnId, SessionAddOn> = {
  strides: {
    id: 'strides',
    label: 'Strides',
    sport: 'run',
    // ⛔ THE EASY RUN AND THE LONG RUN ONLY. p109 says "other running sessions" and means the ones
    // that are not already speed work; hanging strides off a threshold session would be adding
    // quality to a quality day, which is not what the page is describing.
    families: ['run_vt1', 'run_lsd'],
    // ⛔ p210's DOSE, NOT OURS (2026-09-18, round 3): "2 × 100-meter strides (begin slow and accelerate to near full
    // tilt)". The page times none, so no seconds are charged to the session. The six thirty-second efforts that stood
    // here were ours (Michael, 2026-08-28); the rule of 2026-09-18 is the page's words and numbers.
    reps: { lo: 2, hi: 2 },  // Viada p210
    secondsPerRep: { lo: 0, hi: 0 },  // Viada p210 — untimed
    work: { kind: 'all_out' },
    cite: 'Viada p109, p210',
  },
};

// not-instruction: never prints — pushed only into the library session's notes (generate.ts), which nothing outside generate.ts reads (traced: translateEnduranceSession, enduranceLedgerFor, session-swap library-session/workout-choice)
export const STRIDES_DOSE_IS_OURS =
  'The dose is p210\'s: 2 × 100-meter strides (begin slow and accelerate to near full tilt), untimed, no rest '
  + 'printed between them. The placement is p109\'s.';

// not-instruction: never prints — pushed only into the library session's notes (generate.ts), which nothing outside generate.ts reads (traced: translateEnduranceSession, enduranceLedgerFor, session-swap library-session/workout-choice)
export const STRIDES_NOTE =
  'A handful of strides at the end of an easy run trains running economy without a separate speed '
  + 'session. Run them fast and relaxed, at the best speed available that day — there is no pace '
  + 'target — and take full recovery between them.';

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

// Viada pp240-241: mean opener share of his six pool sessions, 14.9% rounded to 15% (see the note above `SWIM_SESSION_CEILING_SECONDS`).
export const SWIM_OPENER_SHARE = 0.15;

export const SWIM_DRILLS = [
  'Kick',
  'Distance-per-stroke or glide',
  'Pull buoy',
] as const;

/** p239 — form work is part of the long ride, in his words. */
export const FORM_FOCUS_NOTE =
  'Several minutes of a long ride spent on pedal stroke and position is time well used.';

/**
 * The ride type's rule for a step's range (2026-09-18) — p237 floor, pp238–239 never over threshold, else none.
 * Read by materialize-plan and the Instead sheet, so the line and the steps the tap builds cannot differ.
 */
export function ridePowerRuleOf(family: string | null | undefined): RidePowerRule {
  const f = family ? FAMILIES[family as FamilyId] : undefined;
  if (!f) return null;
  if (f.floorOnly) return 'floor';
  if (f.underThreshold) return 'under_threshold';
  return null;
}


/**
 * ⛔⛔ THE ENDURANCE SWIM AS p241 PRINTS IT, LEVEL BY LEVEL (2026-09-18, book-language pass 2, audit item 32).
 *
 * The shape builder made level 1 a 300 m opener and ONE 600 m repeat; the page prints 200 m, three 50s and TWO 600s.
 * The Standing Plan's swim is this family at level 1 (`sport-slots.ts`), so the row now carries the page's own
 * session, token for token, with the page's words for each piece (`words`, read off p241.jpg). The token list is the
 * whole session: `session-vocabulary.ts` sends it as it stands, with no wrapper of its own.
 * ⚠️ Where the page offers two options ("3 x 600m or 2 x 1000m") the first is built.
 */
export const SWIM_ENDURANCE_PRINTED: Record<Level, { token: string; words: string }[]> = {
  // p241 L1: "200m as 25m easy, 25m drill choice · 3 x 50m @ 25m easy, 25m sprint with 10-second rest · 2 x 600m @
  // easy-to-moderate intensity (race pace) with 2-minute rest"
  1: [
    { token: 'swim_warmup_200m', words: '200m as 25m easy, 25m drill choice' },
    { token: 'swim_aerobic_3x50m_r10', words: '25m easy, 25m sprint' },
    { token: 'swim_aerobic_2x600m_r120', words: 'easy-to-moderate intensity (race pace)' },
  ],
  // p241 L2: "100m kick · 200m as 25m easy, 25m drill choice · 4 x 50m @ 25m easy, 25m sprint with 10-second rest ·
  // 3 x 600m or 2 x 1000m @ easy-to-moderate intensity (race pace) with 2-minute rest"
  2: [
    { token: 'swim_kick_1x100m', words: 'kick' },
    { token: 'swim_warmup_200m', words: '200m as 25m easy, 25m drill choice' },
    { token: 'swim_aerobic_4x50m_r10', words: '25m easy, 25m sprint' },
    { token: 'swim_aerobic_3x600m_r120', words: 'easy-to-moderate intensity (race pace)' },
  ],
  // p241 L3: "100m kick · 100m DPS or glide drill · 200m as 25m easy, 25m drill choice · 8 x 25m sprint with 5-second
  // rest · 3 x 1200m or 2 x 1600m @ easy-to-moderate intensity (race pace) with 3-minute rest"
  3: [
    { token: 'swim_kick_1x100m', words: 'kick' },
    { token: 'swim_drill_dps_1x100m', words: 'DPS or glide drill' },
    { token: 'swim_warmup_200m', words: '200m as 25m easy, 25m drill choice' },
    { token: 'swim_aerobic_8x25m_r5', words: 'sprint' },
    { token: 'swim_aerobic_3x1200m_r180', words: 'easy-to-moderate intensity (race pace)' },  // p241 L3, as printed
  ],
};
