// ============================================================================
// PLYOMETRICS — his three families, his drills, his stop rule. Named rows, never a placeholder.
//
// Source: `SOURCE-viada-hybrid-athlete.md` Part A4 (p227). Design: the device findings of
// 2026-08-24, item A3.
//
// ⛔ WHAT THIS REPLACES. The composer emitted ONE row reading `Plyometric drills 3×4`, which is not
// a prescription — it is the name of a category with a set count attached. p227 names three drill
// FAMILIES and lists the drills in each, and his first instruction is that **all drills are done
// SEPARATELY**. A single row cannot express that, and an athlete opening it has been told to do
// three unnamed things.
//
// ⛔ EVERY DRILL NAME BELOW IS HIS, and every one of them resolves in `src/lib/exercise-config.ts`.
// A prescribed name the catalogue does not hold is D-322's disease: `getExerciseType` falls through
// to `barbell` and the logger offers a weight field for an A-skip. The names were added to the
// config in the same change that started emitting them.
// ============================================================================

/** ⛔ HIS THREE BUCKETS, p227, in his own order. */
export type PlyoFamilyId = 'bounding' | 'ground_contact' | 'footspeed';

export type PlyoFamily = {
  id: PlyoFamilyId;
  /** What the family is FOR, in his words. */
  benefit: string;
  /** ⛔ HIS DRILLS, IN THE PAGE'S OWN ORDER. The transcription; nothing walks it. */
  drills: string[];
  /**
   * ⛔ THE ORDER THE ROTATION WALKS — p89's ramp, which is NOT the page-table order.
   *
   * ⚠️ A PERMUTATION OF `drills` AND NOTHING ELSE. The names are his and the family membership is
   * his; only the sequence is stated here, and it is his too (p89). Two fields because the table's
   * order is a transcription of p227 and must stay readable against the photograph.
   */
  rotation: string[];
};

/**
 * ⛔ TRANSCRIBED FROM p227's TABLE, WITH ONE SPELLING DECISION SAID OUT LOUD.
 *
 * | Bounding and skipping / dynamic movement | running gait and speed | A/B skips · distance
 *   bounding · prime times (stiff-legged run) |
 * | Control and ground-contact-time reduction | general speed and explosiveness | single-leg hops ·
 *   rebound jumps · skater hops · lunge hops · pogo hops |
 * | Footspeed and movement drills | general foot/leg control (**not** true agility) | ladder drills
 *   (footspeed and mobility, not true plyometrics) · Ickey Shuffle · hopscotch |
 *
 * ⚠️ *"A/B skips"* IS TWO DRILLS AND IS WRITTEN AS TWO. He names them with a slash because they are
 * a pair a runner learns together; they are separate movements and his own rule is that drills are
 * performed separately, so collapsing them into one row would be the placeholder again in miniature.
 *
 * ⚠️ *"prime times"* KEEPS HIS PARENTHETICAL AS THE NAME. The phrase is his coinage and means
 * nothing on a logger; *"Stiff-Legged Run"* is the description he supplies for it in the same cell.
 */
export const PLYO_FAMILIES: Record<PlyoFamilyId, PlyoFamily> = {
  bounding: {
    id: 'bounding',
    benefit: 'running gait and speed',
    drills: ['A-Skip', 'B-Skip', 'Bounding', 'Stiff-Legged Run'],
    /**
     * ⛔ THE STIFF-LEGGED RUN LEADS, AND THE BOUND IS LAST. p89 names *"skipping, bounding, and
     * hops/jumps"* as the AFTER-MASTERY group; the stiff-legged run is a gait drill and none of the
     * three, so it is the one movement in this family an untrained athlete can be handed in week 1.
     * The two skips follow, in his own A-then-B pairing, and distance bounding — the movement he
     * calls out by name as challenging — arrives last.
     */
    rotation: ['Stiff-Legged Run', 'A-Skip', 'B-Skip', 'Bounding'],
  },
  ground_contact: {
    id: 'ground_contact',
    benefit: 'general speed and explosiveness',
    drills: ['Single-Leg Hops', 'Rebound Jumps', 'Skater Hops', 'Lunge Hops', 'Pogo Hops'],
    /**
     * ⛔ IN-PLACE FIRST, ON TWO FEET — p89's *"static plyometrics"*. Pogo hops and rebound jumps are
     * both two-footed and both stay on the spot; the lunge hop adds a split stance, the single-leg
     * hop takes a foot away, and the skater hop is unilateral AND lateral — and *"lateral hopping"*
     * is the second movement p89 names outright as challenging.
     */
    rotation: ['Pogo Hops', 'Rebound Jumps', 'Lunge Hops', 'Single-Leg Hops', 'Skater Hops'],
  },
  footspeed: {
    id: 'footspeed',
    benefit: 'general foot and leg control',
    drills: ['Ladder Drills', 'Ickey Shuffle', 'Hopscotch'],
    /**
     * ⚠️ ALREADY EASIEST-FIRST, so this repeats the table: the plain ladder before a named ladder
     * pattern, and hopscotch — the only one that leaves the ground — last. This whole family is
     * p89's entry point, which is why it is untouched.
     */
    rotation: ['Ladder Drills', 'Ickey Shuffle', 'Hopscotch'],
  },
};

export const PLYO_FAMILY_IDS: PlyoFamilyId[] = ['bounding', 'ground_contact', 'footspeed'];

/**
 * ⛔ WHICH FAMILIES THE FRAME'S PLYO DAY CARRIES — one drill from each, and the DAY is not ours.
 *
 * ⚠️ **THIS WAS A THREE-DAY SPREAD FOR ONE AFTERNOON ON 2026-08-24 AND IT WAS A MISREAD.**
 * `DEVICE-FINDINGS-standing-plan-2026-08-24.md` A3 said the frame places plyometrics on day 1 × 1,
 * day 3 × 2 and day 6 × 1. **That layout belongs to the half-marathon frame (p250), not to this one**
 * — the findings doc conflated the two, and Michael confirmed it was a conflation rather than a
 * ruling (2026-08-24 evening). `SOURCE-viada-hybrid-athlete.md` Part E1a, transcribed off `p246.jpg`
 * and verified 2026-08-23, carries *"Plyo warm-up"* on **day 3 alone**, in both the standard and the
 * taper column, and the All Rounder's p274 table matches.
 *
 * ⛔ **SO THE DAY IS THE FRAME'S AND THIS FILE DOES NOT HOLD ONE.** `FrameDay.plyo` already marks it,
 * in both columns; a day number here as well would be a second owner of a fact the frame states, and
 * the two would part company the first time a frame was added. The composer reads `day.plyo`.
 *
 * ⚠️ ONE DRILL FROM EACH OF HIS THREE FAMILIES IS OURS, and it is a small choice inside his own
 * numbers: p227 caps a day at *"three or four"* and names exactly three families, and p275 puts the
 * midweek warm-up at *"anywhere from one to three plyometric skills"*. Three, one per family, is the
 * top of both of those and the only arrangement that touches every bucket he lists.
 */
export const PLYO_FAMILIES_PER_DAY: PlyoFamilyId[] = ['bounding', 'ground_contact', 'footspeed'];

export const PLYO_FAMILY_MIX_IS_OURS =
  'The plyometric day takes one drill from each of the three families the source names. He caps a '
  + 'day at three or four drills and puts the warm-up at one to three skills; taking one from each '
  + 'bucket is ours, and it is the only arrangement that touches all three.';

/**
 * ⛔ THE ORDER THE ROTATION WALKS IS HIS NOW, WHERE IT USED TO BE THE TABLE'S (p89, 2026-08-26).
 *
 * ⚠️ IT WAS NEVER LABELLED OURS, WHICH IS THE POINT — it was the page-table order, taken as if a
 * transcription order were a teaching order. It is not: p89 introduces plyometrics *"via a
 * combination of foot-speed drills and static plyometrics"* and only *"with these skills mastered"*
 * proceeds to *"skipping, bounding, and hops/jumps."* Week 1 served an A-skip and a single-leg hop —
 * one from each half of the group he puts SECOND.
 *
 * ⚠️ `PLYO_FAMILY_MIX_IS_OURS` IS UNCHANGED AND STILL TRUE. One drill from each of the three
 * families is still ours; which drill each family gives first is now his.
 */
export const PLYO_ROTATION_ORDER_IS_HIS =
  'Which drill a family gives first follows p89: foot-speed drills and static plyometrics before '
  + 'skipping, bounding and hops. The ramp is his; only taking one drill from each family at a time '
  + 'is ours.';

/**
 * ⛔ WHICH DRILL THIS FAMILY GIVES THIS WEEK — rotation, because he asks for it.
 *
 * p275: *"left open-ended because **variety and week-to-week modification are encouraged**."* So the
 * family is fixed and the drill inside it walks the list a week at a time.
 *
 * ⚠️ AN `ordinal` ARGUMENT STOOD HERE AND IS DELETED. It separated two placements of one family
 * inside a week, which only existed under the three-day spread above; with one plyo day each family
 * appears once and the argument could never be anything but zero. A parameter that cannot change an
 * answer is the dead guard this codebase keeps removing.
 */
/**
 * ⛔⛔ IT WALKS `rotation`, NOT `drills` (p89, 2026-08-26). The table's order is a transcription and
 * was being read as a ramp; see `PLYO_ROTATION_ORDER_IS_HIS`. ⚠️ The two lists hold the same names,
 * so nothing downstream sees a new movement — a drill simply arrives in a different week.
 */
/** ⛔ NO DRILL AN ATHLETE CANNOT DO (WORKORDER-plyo-screen §3, 2026-09-02). Ladder drills need an agility
 *  ladder; the Ickey Shuffle is usually taught in one but does not require it; hopscotch is equipment-free.
 *  Matched by substring against the athlete's equipment strings, the way lifting kit already is. */
const DRILL_REQUIRES: Record<string, RegExp> = { 'ladder drills': /agility ladder/i };
export function drillAllowed(drill: string, equipment?: string[] | null): boolean {
  const req = DRILL_REQUIRES[drill.toLowerCase()];
  if (!req) return true;
  return (equipment ?? []).some((e) => req.test(String(e)));
}

export function drillForWeek(family: PlyoFamilyId, week: number, equipment?: string[] | null): string {
  const order = PLYO_FAMILIES[family].rotation.filter((d) => drillAllowed(d, equipment));
  const w = Math.max(1, Math.round(week));
  return order[(w - 1) % order.length];
}
