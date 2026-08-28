// ============================================================================
// THE FRAMES — one Viada program whole, per dial position. This slice ships ONE.
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part E1 (pp.246-247, both read directly 2026-08-23).
// Design: `DECISIONS-2026-08-22-standing-plan-pivot.md` §1.
//
// ⛔ THE FRAME TABLE IS THE LAW. The program owns every count — lifting days, endurance slots, which
// day carries what. The athlete owns sport, level, equipment and exercise choice. **Convert, never
// add** (pivot §2): an intensity choice tags a session the frame already has; it never creates one.
//
// ⛔ AND NO WEEK MIXES TWO AUTHORS' STRUCTURES (pivot §1). This is Viada's week end to end.
// ============================================================================

import type { ViadaCategory, ViadaIntent, ViadaPattern } from '../strength-grid/index.ts';
import type { FamilyId, Level } from '../endurance-library/index.ts';

export type FrameId = 'strength_5k';

export type ColumnKind = 'standard' | 'taper';

/**
 * ⛔ "ACCESSORY:" IS A ROLE PREFIX, NOT A CATEGORY — p247, and nothing else in the corpus records it:
 *
 * > *"The 'accessory' notation refers to movements that specifically focus on **noncompetition lifts
 * > with similar gross movement patterns** — for example, paused deadlifts, box squats, Larsen
 * > presses."*
 *
 * His three examples straddle two of his own categories (paused deadlift and box squat are PRIMARY,
 * p219; Larsen press is SECONDARY, p220), which is the proof that the prefix is a ROLE and the words
 * after it name the pattern.
 *
 * ⛔ **A composer that reads `Accessory: primary pull` as "the primary-pull category" puts the
 * competition lift into a slot that exists precisely to avoid it.** So this is a filter applied on
 * top of stage 2's grid, never a change to it: exclude the athlete's named competition movements,
 * then take the grid's answer.
 */
export type SlotRole =
  /** The competition lift itself. Day-opening slots are always this — *"All first lifts of the day
   *  should be a competition movement"* (p247). */
  | 'competition'
  /** A noncompetition variant in the same gross pattern. */
  | 'accessory';

export type StrengthSlot = {
  intent: ViadaIntent;
  role: SlotRole;
  category: ViadaCategory;
  pattern: ViadaPattern;
  /**
   * ⛔ THE WEEKLY ME/DE ROTATION, AND HE STATES THE CADENCE — p247:
   *
   * > *"the ME lift will rotate week to week, with one week consisting of **ME squat and DE
   * > deadlift**, and the next week the reverse."*
   *
   * This is what the table's *"(rotate with primary push)"* means. On an odd week the slot takes its
   * own pattern; on an even week it swaps with its partner. ⚠️ **`pivot §8` listed rotation cadence
   * as a gap to fill from field practice. It is not a gap — he wrote it, and nothing here is ours.**
   */
  rotatesWith?: ViadaPattern;
  /**
   * ⚠️ AMBIGUOUS IN THE SOURCE, RESOLVED CONSERVATIVELY AND LABELLED (Michael, 2026-08-23).
   * `1 x HYP: Accessory: accessory lower` on days 2 and 5 names *"accessory lower"*, which is not a
   * category anywhere in pp.218-223. Read as: a lower-body noncompetition movement, category left to
   * stage 2's substitution ladder. Recorded in Part E1b as ambiguous rather than resolved.
   */
  ambiguousNotation?: string;
  /** What the page prints, kept verbatim so a reader can find the row. */
  sourceText: string;
};

export type EnduranceSlot = {
  family: FamilyId;
  level: Level;
  /** ⚠️ p247's own refinement of the slot, where it gives one. */
  archetype?: string;
  /** Taper only — *"NT (race tempo)"*: race pace with recoveries 25% longer (p247). */
  raceTempo?: boolean;
  sourceText: string;
};

export type FrameDay = {
  day: number;
  label: string | null;
  strength: StrengthSlot[];
  endurance: EnduranceSlot[];
  /** Day 3 only. p227 governs the dose; see `PLYO_DOSE`. */
  plyo?: boolean;
  rest?: boolean;
};

export type Frame = {
  id: FrameId;
  /** ⛔ NEVER SHOWN TO AN ATHLETE (pivot §1). Internal only. */
  sourceName: string;
  cite: string;
  /** ⛔ THE PROGRAM OWNS THIS (pivot §6). Not an athlete dial. */
  liftingDays: number;
  columns: Record<ColumnKind, FrameDay[]>;
  /** His rate anchor for THIS frame — see `RATE_ANCHOR`. */
  workingNumberRatePerWeek: number;
};

// ── the slot vocabulary, spelled once ───────────────────────────────────────────────────────────

const S = (
  intent: ViadaIntent,
  role: SlotRole,
  category: ViadaCategory,
  pattern: ViadaPattern,
  sourceText: string,
  extra?: Partial<StrengthSlot>,
): StrengthSlot => ({ intent, role, category, pattern, sourceText, ...extra });

const E = (family: FamilyId, level: Level, sourceText: string, extra?: Partial<EnduranceSlot>): EnduranceSlot =>
  ({ family, level, sourceText, ...extra });

/**
 * ⛔ STRENGTH + 5K (p246), TRANSCRIBED FROM THE PAGE.
 *
 * Four lifting days — two ME, two DE — a plyo-only day 3, an endurance-only day 6, one rest day.
 * Four endurance sessions in standard, three in taper.
 *
 * ⚠️ p247 says the lifting days *"focus on the big three if powerlifting is the goal: training bench
 * twice a week and the squat and deadlift each once a week."* That falls out of the table: bench is
 * the primary push on days 1 and 4, and days 2 and 5 carry squat and deadlift with the ME/DE roles
 * swapping weekly.
 */
const STRENGTH_5K_STANDARD: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('ME', 'accessory', 'primary', 'pull_upper', '1 x ME: Accessory: primary pull'),
      S('DE', 'accessory', 'secondary', 'push_upper', '1 x DE: Accessory: secondary push'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
      S('HYP', 'accessory', 'focused', 'push_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [E('run_mlss', 2, '1 x MLSS+ (level 2)')],
  },
  {
    day: 2,
    label: 'ME: Lower',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate with primary push)', { rotatesWith: 'press_lower' }),
      S('ME', 'accessory', 'primary', 'press_lower', '1 x ME: Accessory: primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'secondary', 'hinge_lower', '1 x DE: Accessory: secondary hinge lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 X HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  { day: 3, label: null, strength: [], endurance: [E('run_near_threshold', 3, 'NT (level 3)', { archetype: 'below_threshold' })], plyo: true },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'secondary', 'push_upper', '1 x HYP: Accessory: secondary push'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [E('run_vt1', 1, 'VT1 (level 1)')],
  },
  {
    day: 5,
    label: 'DE: Lower',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate with primary hinge)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower (rotate with primary push lower)', { rotatesWith: 'press_lower' }),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: secondary push lower'),
      S('HYP', 'accessory', 'focused', 'press_lower', '1 x HYP: Accessory: focused push lower'),
    ],
    endurance: [],
  },
  { day: 6, label: null, strength: [], endurance: [E('run_lsd', 2, 'LSD (level 2)', { archetype: 'long_with_inserts' })] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ THE TAPER/DELOAD COLUMN, AND IT IS A SUBSTITUTION AS MUCH AS A CUT. Days 1 and 2 turn their
 * SECOND ME slot into a DE slot; every endurance level drops to 1; day 4 loses its endurance
 * entirely; the LSD is gone and a VT1 takes day 6.
 *
 * ⛔ IT IS ALSO THE FRAME'S HOLD VARIANT (pivot §1: *"Holding — the taper/deload column of the
 * current frame. Not a separate plan."*) and its race handling: p247 says to switch to the deload
 * version **two weeks out from a powerlifting meet or a 5K**.
 */
const STRENGTH_5K_TAPER: FrameDay[] = [
  {
    day: 1,
    label: 'ME: Upper',
    strength: [
      S('ME', 'competition', 'primary', 'push_upper', '1 x ME: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [E('run_mlss', 1, '1 x MLSS+ (level 1)')],
  },
  {
    day: 2,
    label: 'ME: Lower',
    strength: [
      S('ME', 'competition', 'primary', 'hinge_lower', '1 x ME: Primary hinge lower (rotate)', { rotatesWith: 'press_lower' }),
      S('DE', 'accessory', 'primary', 'press_lower', '1 x DE: Accessory: primary push lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  {
    day: 3,
    label: null,
    strength: [],
    endurance: [E('run_near_threshold', 1, 'NT (race tempo) (level 1)', { archetype: 'below_threshold', raceTempo: true })],
    plyo: true,
  },
  {
    day: 4,
    label: 'DE: Upper',
    strength: [
      S('DE', 'competition', 'primary', 'push_upper', '1 x DE: Primary push'),
      S('DE', 'accessory', 'primary', 'pull_upper', '1 x DE: Accessory: primary pull'),
      S('HYP', 'accessory', 'focused', 'pull_upper', '1 x HYP: Accessory: focused pull, focused push'),
    ],
    endurance: [],
  },
  {
    day: 5,
    label: 'DE: Lower',
    strength: [
      S('DE', 'competition', 'primary', 'press_lower', '1 x DE: Primary push lower (rotate)', { rotatesWith: 'hinge_lower' }),
      S('DE', 'accessory', 'primary', 'hinge_lower', '1 x DE: Accessory: primary hinge lower'),
      S('HYP', 'accessory', 'secondary', 'press_lower', '1 x HYP: Accessory: accessory lower', {
        ambiguousNotation: '"accessory lower" is not a category in pp.218-223; read as a lower-body noncompetition movement.',
      }),
    ],
    endurance: [],
  },
  { day: 6, label: null, strength: [], endurance: [E('run_vt1', 1, 'VT1 (level 1)')] },
  { day: 7, label: null, strength: [], endurance: [], rest: true },
];

/**
 * ⛔ HIS RATE ANCHOR, AND IT IS PER-FRAME RATHER THAN PER-ATHLETE (corrected 2026-08-23).
 *
 * p247, for Strength + 5K: *"slow gradual increases in the calculated 1RM taking place every 3 to 4
 * weeks (**assume 1 percent every 3 weeks as a starting point**)."*
 *
 * ⚠️ `DECISIONS-2026-08-22-standing-plan-pivot.md` §4 read this as "~1%/3wk general, ~1%/4wk when
 * running is real" — a global switch on running. **It is not.** Strength + 5K carries four endurance
 * sessions including two hard ones and still runs at 1%/3wk; the 1%/4wk figure is p251's, for
 * Strength + Half-Marathon. More running, slower rate — **per frame**. Michael ruled the page wins,
 * 2026-08-23.
 */
export const RATE_ANCHOR: Record<FrameId, { perWeek: number; cite: string }> = {
  strength_5k: { perWeek: 0.01 / 3, cite: 'Viada p247 — 1% every 3 weeks' },
};

export const FRAMES: Record<FrameId, Frame> = {
  strength_5k: {
    id: 'strength_5k',
    sourceName: 'Strength + 5K',
    cite: 'Viada pp246-247',
    liftingDays: 4,
    columns: { standard: STRENGTH_5K_STANDARD, taper: STRENGTH_5K_TAPER },
    workingNumberRatePerWeek: RATE_ANCHOR.strength_5k.perWeek,
  },
};

/**
 * ⛔ THE ADVANCED-RUNNER TIER — A PROGRAM TIER, NOT AN ATHLETE DIAL (Michael, 2026-08-23).
 *
 * p247: *"More advanced runners may see a benefit to additional running volume, and I recommend
 * adding one or two VT1 sessions initially to test recovery."*
 *
 * ⚠️ THIS SAT AGAINST PIVOT §2's *"convert, never add"* and was raised rather than reconciled. The
 * ruling: §2 stands, and this is not a violation of it, because **the athlete never self-selects
 * into volume they do not already hold.** The frame has a base count; the engine gates the tier on
 * DEMONSTRATED running history and then the count is fixed again. Within either tier, intensity
 * still converts and never adds.
 *
 * ⛔ THE ADDED SESSIONS ARE EASY ONLY. His words are VT1 sessions, and the tier exists *"to test
 * recovery"* — adding a hard session would test something else.
 */
export const ADVANCED_TIER_VT1_SESSIONS = { min: 1, max: 2, cite: 'Viada p247' };

/**
 * ⛔ THE GATE IS DEMONSTRATED HISTORY, AND THE THRESHOLD IS OURS.
 *
 * He says "more advanced runners" and defines nothing. The gate therefore cannot be his, and it is
 * labelled: **an athlete qualifies when their own recent running already carries the volume** — the
 * tier adds sessions they are shown to be doing, never sessions they hope to do.
 *
 * ⚠️ 25 MILES A WEEK IS OURS, from the customer definition rather than from the book: the Standing
 * Plan's stated audience is 10-30 miles a week (`DECISIONS-2026-08-21-standing-plan.md` §1), so the
 * top third of that band is where "more advanced" begins for this product. **Fixed number, labelled,
 * one line — the pivot §8 discipline.**
 */
export const ADVANCED_TIER_MIN_WEEKLY_MILES = 25;
export const ADVANCED_TIER_GATE_IS_OURS =
  'The source says "more advanced runners" and defines nothing. Twenty-five miles a week is ours — '
  + 'the top third of this plan\'s stated 10-to-30-mile audience — and it gates on running the '
  + 'athlete already does, never on running they intend to do.';

export function advancedTierSessions(demonstratedWeeklyMiles: number | null | undefined): number {
  const miles = Number(demonstratedWeeklyMiles);
  if (!Number.isFinite(miles) || miles < ADVANCED_TIER_MIN_WEEKLY_MILES) return 0;
  // ⚠️ One session at the gate, two once the athlete is clear of it by the same margin again.
  return miles >= ADVANCED_TIER_MIN_WEEKLY_MILES * 2
    ? ADVANCED_TIER_VT1_SESSIONS.max
    : ADVANCED_TIER_VT1_SESSIONS.min;
}

/**
 * ⛔⛔ THE LOW-VOLUME TIER — THE SAME SESSIONS AT HIS SMALLER SIZES (2026-08-26 evening).
 *
 * ⛔ THE DEFECT IT ANSWERS, MEASURED. With all four endurance slots on foot, the frame's standard
 * column has a FLOOR of three hours twenty: MLSS level 2 (32 min), NT level 3 (75), VT1 level 1 (25)
 * and LSD level 2 (68) at their shortest. Ask for two hours of running and the week still built
 * 3h20 — about seventy per cent more than the athlete said they run, in week one.
 *
 * ⛔ AND THAT IS THE FAILURE HE NAMES BY NAME. p148: change each bucket by *"less than 10 percent"*
 * a week, *"though ideally 5 percent is as high as I will usually go."* p149 calls too-rapid
 * increases *"the greatest source of program failure that I observe in hybrid programs."* It lands
 * hardest on this plan's own stated customer — ten to thirty miles a week, which at the bottom is
 * about an hour forty.
 *
 * ⛔⛔ THE LEVELS ARE HIS. p246's TAPER column prescribes these same two quality sessions at LEVEL 1
 * — MLSS level 1 on day 1, near-threshold level 1 on day 3 — so the smaller dose is his own number
 * for his own session, already transcribed in `STRENGTH_5K_TAPER` above.
 *
 * ⛔ AND THE LONG SESSION SCALES WITH THEM, ON p247's OWN SENTENCE: *"Mileage will be dictated by
 * experience level, with more proficient runners looking at runs up to 90 to 100 minutes here with
 * an emphasis on LT intervals, and less experienced runners opting for shorter fartlek variations."*
 * The 90-to-100-minute long session — the ceiling this engine adopted — is stated as the PROFICIENT
 * runner's figure. `run_lsd` level 1 is p235's own band for the same session (35-90 min), so the
 * shorter long run is his dose too.
 *
 * ⚠️ THE LEVEL MOVES, THE BAND NEVER DOES. p275 forbids stretching a session past its band and the
 * same logic binds the other end: nothing here shortens a session below what the page prints for it.
 * ⚠️ AND NO SESSION IS DROPPED. All four slots are the frame's (p119, 2026-08-26) — the tier changes
 * how big they are, never how many there are.
 * ⚠️ IT ONLY TOUCHES RUN FAMILIES, so a mixed athlete whose hard slots are rides is unaffected by
 * construction rather than by a special case. The defect only ever bit the run slots.
 * ⚠️ AND IT BARELY MOVES THE TOP. A low-tier athlete asking for five hours still gets four and a
 * half, because the easy and long sessions are base families and climb. What the tier changes is the
 * FLOOR — three hours twenty becomes about two.
 */
export const LOW_VOLUME_TIER_LEVELS: Record<string, Level> = {
  run_mlss: 1,
  run_near_threshold: 1,
  run_lsd: 1,
  /**
   * ⛔ THE RIDE FAMILIES, AND DROPPING **THEIR** LEVEL IS OURS (2026-08-27). `RIDE_EQUIVALENT` maps
   * the frame's four slots onto `ride_sweet_spot` (the two hard ones) and `ride_endurance` (easy and
   * long), and p246's taper column — the source for *"the same session, smaller"* on the run side —
   * has no cycling counterpart. **There is no ride taper column, so there is no page under this.**
   * See `LOW_VOLUME_RIDE_LEVELS_ARE_OURS`.
   *
   * ⚠️ THE LEVELS THEMSELVES ARE STILL HIS: p239 prints cycling endurance at three levels and p238's
   * sweet-spot the same way, so level 1 is a dose he states for the session. What is ours is the
   * decision to use it for a lower-volume rider.
   */
  ride_sweet_spot: 1,
  ride_endurance: 1,
};

/**
 * ⛔⛔ NO RIDE IS EVER BUILT ABOVE HIS LEVEL 2 (Michael, 2026-08-27, off p278).
 *
 * ⛔ THE DEFECT IT CLOSES, MEASURED. A ride inherits the SLOT's difficulty through
 * `RIDE_EQUIVALENT`, and the frame's second hard slot is `run_near_threshold` at LEVEL 3 (p246). So
 * an athlete who put a ride on that slot was handed `ride_sweet_spot` level 3 — a dose the book
 * prescribes to nobody.
 *
 * ⛔ p278, HIS OWN CYCLING BASE STANDARD WEEK, read off the page image: day 1 `Cyc sweet spot
 * (level 1-2)`, day 3 `Cyc VO2 (level 1)` + `Cyc sweet spot (level 1)`, day 5 `Cyc sprint
 * (level 1)`, day 7 `Cyc endurance (level 2)`. **Level 2 is the ceiling anywhere in his cycling
 * programs, and it appears on one session.** Level 3 sweet spot exists in the session library
 * (p239) and he prescribes it in no program — so offering it on a Wednesday ride hands a hybrid
 * athlete a harder dose than the book gives a dedicated cyclist.
 *
 * ⚠️ THE RUN SIDE IS UNTOUCHED. The Wednesday RUN stays at level 3, which is exactly what p246
 * prints for it and what p247 calls *"the hardest session of the week."*
 * ⚠️ IT IS A CLAMP, NOT A TIER. It binds whatever the level came from — the frame, the experience
 * answer, or an explicit caller override — because the argument is about the bike, not about who
 * asked.
 */
export const RIDE_LEVEL_CEILING: Level = 2;

export const RIDE_LEVEL_CEILING_CITE =
  'No ride is built above level 2. p278\'s Cycling Base standard week tops out at level 2 and uses '
  + 'it on one session; level 3 sweet spot is in the p239 library and is prescribed in none of his '
  + 'cycling programs.';

/** The level a slot is actually built at, with the bike's own ceiling applied. */
export function clampRideLevel(family: string, level: Level): Level {
  if (!family.startsWith('ride_')) return level;
  return (level > RIDE_LEVEL_CEILING ? RIDE_LEVEL_CEILING : level) as Level;
}

export const LOW_VOLUME_RIDE_LEVELS_ARE_OURS =
  'Building the ride slots at level 1 for a lower-volume rider is ours. The levels are his — p238 '
  + 'and p239 print each session at three — but the taper column that justifies the smaller dose on '
  + 'the run side has no cycling counterpart, so nothing on the page says to do this for a bike.';

/**
 * ⛔⛔ THE GATE IS DERIVED, NOT PICKED (rewritten 2026-08-27) — see `lowVolumeSports` in
 * `volume-bounds.ts`, which owns the comparison.
 *
 * ⛔ WHAT IT REPLACES, AND WHY THE REPLACEMENT IS THE SAME ANSWER. The first version was twenty
 * miles a week, reasoned as *"the standard column's four run sessions total about three hours twenty
 * at their shortest, which is twenty miles at an easy ten-minute mile."* That reasoning is an
 * arithmetic, and the arithmetic is now the gate: **the tier applies to a sport when the athlete's
 * logged minutes are under what the frame's own slots of that sport would build at their shortest.**
 * The invented number is gone, the pace conversion inside it is gone, and the bike needed no second
 * threshold to be pressed out of thin air.
 *
 * ⚠️ NOTHING IN THE CORPUS TIERS CYCLING BY VOLUME, which is exactly why a derived gate was worth
 * the change. p137's *"two hours of cycling"* is a supplement figure for a RUNNER and is not a tier
 * gate; pressing it into service as one would have been an invented rule wearing a citation.
 */
export const LOW_VOLUME_TIER_GATE_IS_OURS =
  'The smaller sizes are his — the taper column prescribes the run sessions at level 1, and p247 '
  + 'states the 90-to-100-minute long run as the more proficient runner\'s figure. Deciding WHEN to '
  + 'use them is ours: the sessions drop a level for a sport when the athlete\'s logged minutes over '
  + 'the last four weeks are under what this week\'s own slots of that sport would build at their '
  + 'shortest. The source names "less experienced runners" and defines nothing.';

/**
 * The endurance levels this athlete's history earns, per family.
 *
 * @param lowSports the sports the athlete is under the frame's own floor in — `lowVolumeSports`.
 * ⚠️ EMPTY IS THE FRAME AS PRINTED. A sport at or above its floor gets p246 exactly.
 */
export function lowVolumeLevels(lowSports: Array<'run' | 'ride'>): Record<string, Level> {
  const out: Record<string, Level> = {};
  for (const [family, level] of Object.entries(LOW_VOLUME_TIER_LEVELS)) {
    const sport = family.startsWith('ride_') ? 'ride' : 'run';
    if (lowSports.includes(sport)) out[family] = level;
  }
  return out;
}

/**
 * ⛔⛔ THE ATHLETE'S OWN EXPERIENCE ANSWER, PER SPORT — AND IT IS THE SOLE INPUT TO THE LEVEL
 * (Michael, 2026-08-27). Two answers, no third.
 *
 * ⛔ WHAT IT REPLACES, AND WHY. Until today the level was decided from the athlete's LAST 28 DAYS of
 * logged running and riding (`lowVolumeSports`, gated on `demonstratedWeeklyMinutes`). Michael's own
 * case is the whole argument: *"im coming off a marathon a few months ago I was training less, this
 * is the wrong thing."* A 28-day window measures the last month, not training age — post-race,
 * injured, off-season, on holiday, or simply not syncing a watch all read as beginner.
 *
 * ⛔ AND THE SOURCE NAMES THE RIGHT QUANTITY. p247 says *"experience level"* and gives no mileage
 * qualifier anywhere. Every number in the gate this replaces was ours.
 *
 * ⛔ NO FALLBACK AND NO CORRECTION. History does not decide it, does not break a tie, and does not
 * revise it later. The athlete answers and that is the level.
 */
export type ExperienceTier = 'newer' | 'experienced';

/** The answer per sport. ⚠️ A sport with no answer takes the frame's own printed levels — the same
 *  thing "Experienced" applies — because absent is not a claim that they are new to it. */
export type EnduranceExperience = { run?: ExperienceTier | null; ride?: ExperienceTier | null };

export const EXPERIENCE_IS_THE_ATHLETES_ANSWER =
  'The two sizes are his — p246\'s taper column prescribes the quality sessions at level 1, and '
  + 'p247 states the 90-to-100-minute long run as the more proficient runner\'s figure. WHICH of '
  + 'the two an athlete gets is now their own answer, asked once in the wizard. It was inferred '
  + 'from the last four weeks of logged training until 2026-08-27; the source names "experience '
  + 'level" and never recent mileage.';

/**
 * The endurance levels the athlete's own answer sets, per family.
 *
 * ⛔ "Newer" APPLIES `LOW_VOLUME_TIER_LEVELS` FOR THAT SPORT. "Experienced" APPLIES NOTHING — the
 * frame's own printed levels, p246 as transcribed. ⚠️ So this is a swap of the gate's INPUT, not a
 * new level system: the mapping is unchanged and `lowVolumeLevels` still owns it.
 */
export function experienceLevels(
  experience: EnduranceExperience | null | undefined,
): Record<string, Level> {
  const newer = (['run', 'ride'] as const).filter((sp) => experience?.[sp] === 'newer');
  return lowVolumeLevels(newer);
}

/**
 * ⛔ PLYO DOSE — the drill count and the stop rule are HIS; the effort count is OURS (pivot §8).
 *
 * p227: *"Throwing more than three or four plyometric movements together on a given day is likely a
 * waste of time. Each drill should be performed multiple times with ample rest… until the movement
 * is optimized for the day and the athlete develops confidence in it; then they move on. Fatigue,
 * poor form, and imprecise movements are all absolute no-no's."*
 *
 * So: **3 drills** (the low end of his own 3-4, because sets start low everywhere else in his
 * system), and the stop rule is his — quality, not a rep count. ⚠️ **The number of efforts per drill
 * is OURS**: he says "multiple times" and gives no figure. Three to five efforts is the field
 * standard for low-amplitude plyometrics and it is written here as a fixed, labelled number rather
 * than a range the engine picks from.
 */
export const PLYO_DOSE = {
  drillsPerDay: 3,
  effortsPerDrill: 4,
  drillCountIsHis: 'Viada p227 — more than three or four is likely a waste of time',
  effortCountIsOurs:
    'The source says each drill is performed "multiple times with ample rest" and gives no number. '
    + 'Four efforts is ours, from field practice for low-amplitude plyometrics.',
  stopRule:
    'Stop each drill when the movement is optimised for the day and it feels confident — not on a '
    + 'rep count. Fatigue, poor form and imprecise movements are the signal to move on.',
  stopRuleIsHis: 'Viada p227',
};
