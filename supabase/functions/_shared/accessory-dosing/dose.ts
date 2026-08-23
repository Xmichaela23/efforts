// ============================================================================
// THE DOSE — sets, effective reps, and the two ceilings. Every number here is Viada's.
//
// Source: pp.84, 86 and 147, **read off the page images on 2026-08-22**, not from the transcription.
// ⚠️ `SOURCE-viada-hybrid-athlete.md`'s provenance table marks Part B as *"written from notes taken
// in an earlier session, not from pages in hand… Re-shoot pp.69-125 before these numbers become
// constants."* They are now constants, so the pages were opened. Every B2 figure survived; what the
// pages added is below.
//
// ⛔ THE MODEL USED TO COUNT REPS PER CATEGORY. `src/lib/assistance-menu.ts` stores a rep total per
// category, split however the athlete likes, and **nothing counts sets**. The growth driver is
// effective reps per muscle per week; the recovery cost is work sets per session. Neither is
// expressible in reps-per-category.
//
// ⛔ AND THAT FILE IS NOT CHANGED BY THIS STAGE. It is Wendler's, it serves Strong Focus, its band
// and axis were deliberately chosen and are correct, and **rule 0 says Strong Focus stays live until
// the Standing Plan replaces it.** Changing its unit would change what a live plan builds. This is a
// new layer beside it — row three of the work order's layer table — and the two meet at stage 6.
// ============================================================================

import { setsFor, VIADA_INTENTS, type Range, type ViadaIntent } from '../strength-grid/index.ts';

// ── EFFECTIVE REPS ──────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ ~4 EFFECTIVE REPS PER SET, AND THE CONDITION ATTACHED TO IT. p086, read off the page:
 *
 * > *"...and we can assume 1 rep in reserve per set has 4 or so effective repetitions."*
 *
 * ⚠️ **THE FIGURE IS QUOTED AT 1 RIR.** It is not a constant of nature and it is not "4 per set
 * whatever you do" — it is what a set taken to one rep in reserve buys. A set left further from
 * failure buys fewer, and he gives no second figure, so this module does not scale it and says so.
 */
export const EFFECTIVE_REPS_PER_SET = 4;
export const EFFECTIVE_REPS_CONDITION =
  'Four effective reps is what a set taken to about one rep in reserve buys. The source gives no '
  + 'figure for sets stopped further short, so nothing here scales it.';

/**
 * ⛔ HIS FORMULA, VERBATIM. p147:
 *
 * > *"Effective hypertrophy reps per muscle group: Determined by the number of effective reps per
 * > set multiplied by the number of sets per muscle."*
 */
export function effectiveRepsFor(sets: number): number {
  return Math.max(0, Math.round(sets)) * EFFECTIVE_REPS_PER_SET;
}

/**
 * ⛔ 1-2 REPS IN RESERVE, NEVER TO FAILURE. p086:
 *
 * > *"Training to muscular failure is almost always excessively taxing and should be avoided.
 * > Training to 1 or 2 reps in reserve … provides a nearly as effective stimulus with far lower
 * > recovery cost, all else being equal."*
 *
 * ⚠️ This is the ACCESSORY prescription and it is TIGHTER than the HYP intent's own 0-2 RIR on p218.
 * Both are his. The accessory band is the one used here because p086 is the hypertrophy-dosing page
 * and 0 RIR is a rep from failure.
 */
export const ACCESSORY_RIR: Range = { lo: 1, hi: 2 };

/**
 * ⛔ 8-10 REPS, AND THE REASON IS NOT "MORE IS BETTER". p086:
 *
 * > *"Work with very high repetitions is generally not indicated. Higher-repetition ranges, even
 * > with lower weights, can induce at least as much fatigue as lower repetitions and are no better
 * > for hypertrophy. Ranges of 8 to 10 repetitions represent a good combination of tension/intensity
 * > and full motor unit fatigue."*
 */
export const ACCESSORY_REPS: Range = { lo: 8, hi: 10 };

// ── THE WEEKLY BAND, PER MUSCLE GROUP ───────────────────────────────────────────────────────────

/**
 * ⛔ 8-12 SETS PER MUSCLE PER WEEK IS SOLID; 18-20 BORDERS OVERREACHING. p086, in one sentence:
 *
 * > *"If 8 to 12 sets per week is a solid range for most athletes (per muscle group) and 18 to 20
 * > sets borders overreaching, and we can assume 1 rep in reserve per set has 4 or so effective
 * > repetitions. Therefore, the general guideline is 32 to 48 effective/stimulating reps per muscle
 * > group per week on the lower end (recommended) to around 70 to 80 maximum effective repetitions
 * > per muscle group per week."*
 *
 * Both bands are his, and the second is the first multiplied by four — his arithmetic, not ours.
 */
export const WEEKLY_SETS_SOLID: Range = { lo: 8, hi: 12 };
export const WEEKLY_SETS_OVERREACHING: Range = { lo: 18, hi: 20 };
export const WEEKLY_EFFECTIVE_REPS_RECOMMENDED: Range = { lo: 32, hi: 48 };
export const WEEKLY_EFFECTIVE_REPS_MAX: Range = { lo: 70, hi: 80 };

export type MuscleVerdict = 'below_floor' | 'light' | 'solid' | 'above_solid' | 'overreaching' | 'over_max';

/**
 * Where a week's set count for one muscle sits against his bands.
 *
 * ⚠️ `light` IS ITS OWN VERDICT AND IS NOT A FAULT. Under 8 sets is below his *solid* range and is
 * exactly where a hybrid athlete lives — p147's marathon-runner example runs 10-15 effective reps
 * per lower-body muscle group, which is two to four sets. He criticises that as *"zero hypertrophy
 * emphasis"*, so `light` is not endorsed; it is also not the same failure as zero, which is what
 * `below_floor` names.
 */
export function verdictForWeeklySets(sets: number, floor: number): MuscleVerdict {
  if (sets < floor) return 'below_floor';
  if (sets < WEEKLY_SETS_SOLID.lo) return 'light';
  if (sets <= WEEKLY_SETS_SOLID.hi) return 'solid';
  if (sets < WEEKLY_SETS_OVERREACHING.lo) return 'above_solid';
  if (sets <= WEEKLY_SETS_OVERREACHING.hi) return 'overreaching';
  return 'over_max';
}

// ── THE SESSION CEILING ─────────────────────────────────────────────────────────────────────────

/**
 * ⛔ 6-8 WORK SETS RECOVERS; 14+ COSTS UP TO 72 HOURS — and the cost is to the OTHER modality, which
 * is the half that matters here. p086, read off the page:
 *
 * > *"A highly taxing, 14+ work set session may diminish performance in other modalities
 * > significantly for twenty-four hours and still notably for up to seventy-two hours. A less
 * > taxing 6 to 8 work set session may result in only marginal performance deficits for twenty-four
 * > hours, with few issues noted forty-eight hours after the session. This latter scenario allows
 * > for productive work to be done the very next day in another modality and to be at nearly peak
 * > form two days afterward."*
 *
 * ⚠️ **"IN OTHER MODALITIES" IS THE WHOLE POINT FOR THIS APP.** The number is not about whether the
 * lifter can lift again — it is about whether tomorrow's run is still there. A session at 14+ sets
 * does not overreach the muscle so much as delete the next two endurance days.
 */
export const SESSION_SETS_RECOVERS: Range = { lo: 6, hi: 8 };
export const SESSION_SETS_COSTLY = 14;
export const SESSION_CEILING_NOTE =
  'A session of 6 to 8 work sets leaves only marginal deficits a day later and few at two days, so '
  + 'the next day in another discipline is still productive. At 14 or more, performance in other '
  + 'disciplines drops significantly for a day and is still notably down as far out as three.';

export type SessionVerdict = 'recovers' | 'above_recovers' | 'costly';

export function verdictForSessionSets(sets: number): SessionVerdict {
  if (sets <= SESSION_SETS_RECOVERS.hi) return 'recovers';
  if (sets < SESSION_SETS_COSTLY) return 'above_recovers';
  return 'costly';
}

/**
 * ⛔ WHAT COUNTS AS A WORK SET, AND WHY TWO OF THE FOUR INTENTS ARE NOT CLASSIFIED.
 *
 * p147 defines the bucket and it is wider than accessory work:
 *
 * > *"High-intensity work sets from strength work go in the same bucket. I'm referring to the number
 * > of actual work sets (not including warm-ups — even warm-ups at high percent) of a sport movement
 * > or strength movement (for example, a heavy set of squats, a hard sprint interval, a single
 * > over/under of a Tabata round, a heavy double on cleans)."*
 *
 * and the general test:
 *
 * > *"If muscular fatigue/failure causes the set to end, it's a high-intensity work set."*
 *
 * **HYP counts** — 1-2 RIR is a set that ends because the muscle is done. **ME counts** — "a heavy
 * set of squats" is his own example, and 90-100% is heavy by any reading.
 *
 * ⛔ **DE AND SKILL ARE NOT CLASSIFIED, AND ARE NOT GUESSED AT.** Both sit at 3-4 RIR, both are
 * explicitly non-fatiguing on p218-219 (*"fatigue is likewise discouraged"*), and neither is heavy.
 * By the fatigue test they are out; by the "heavy set" examples they are arguable. **He does not
 * say**, so this module reports the count BOTH WAYS and names the two intents in question rather
 * than picking one and hiding it.
 */
export const COUNTED_INTENTS: ViadaIntent[] = ['ME', 'HYP'];
export const UNCLASSIFIED_INTENTS: ViadaIntent[] = VIADA_INTENTS.filter((i) => !COUNTED_INTENTS.includes(i));
export const UNCLASSIFIED_INTENTS_NOTE =
  'Dynamic-effort and skill sets are left out of the work-set count. Both sit at three to four reps '
  + 'in reserve and the source calls fatigue on them discouraged, so they do not meet its test of a '
  + 'set that ends because the muscle is done — but it never classifies them either way, so the '
  + 'count is also reported with them included.';

/** ⛔ WARM-UPS ARE NEVER COUNTED — p147 says so outright, "even warm-ups at high percent". */
export const WARMUPS_NOT_COUNTED = 'Warm-up sets are not work sets, at any percentage.';

// ── SETS PER SLOT ───────────────────────────────────────────────────────────────────────────────

/**
 * How many sets one slot of an intent gets.
 *
 * ⛔ IT IS STAGE 2'S FUNCTION, RE-EXPORTED, NOT A SECOND COPY. `setsFor` in
 * `strength-grid/intents.ts` already owns his set bands and his *"sets should always remain on the
 * lower end when starting a program"* rule. A dosing module that re-derived them would be two owners
 * of one fact, which is the disease the last work order spent six stages removing.
 */
export { setsFor };

/** ⛔ THE ACCESSORY SLOT IS A HYP SLOT — 3 sets at the low end of his 3-4 band (p218). */
export function accessorySetsPerSlot(setPosition?: number): number {
  return setsFor({ lo: 3, hi: 4 }, setPosition);
}
