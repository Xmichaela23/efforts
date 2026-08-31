/**
 * THE HARD SLOT'S OPTION LIST AND ITS DEFAULT — the logic half of `HardSlotChoices.tsx`.
 *
 * ⚠️ ITS OWN FILE because a component file that also exports helpers breaks fast refresh, and
 * because these two are testable without React.
 */
import { singleSlotOptions } from './hard-day-menus';

/**
 * ⛔⛔ THE CLUB CONTROL IS OFF THE SCREEN — HIDDEN, NOT DELETED (Michael, 2026-08-26).
 *
 * His words: *"kill run and ride clubs for now, I'll revisit — I need to get a working plan going
 * first, I've been leading with too many features."* **"For now" and "I'll revisit" are his**, which
 * is why this is a switch and not a removal — the same shape `DIAL_CONTROL_VISIBLE` already uses.
 *
 * ⛔ WHAT IT GATES: the "A club session I already attend" toggle on all three club-capable slots —
 * both hard sessions and the long session — and the long session's "Usually runs about ___ min"
 * input that sits with it.
 *
 * ⛔ THE ENGINE IS UNTOUCHED AND MUST STAY THAT WAY. Club ownership is D-452 law: a club session is
 * a PIN because its day is fixed by the world, and a club ride can BE the long ride. `hard_days`
 * still carries `ownership`, `long_session.ownership` still travels, `club-long-pin.test.ts` and
 * `pins-beat-frame.test.ts` still pass. Only the control comes off.
 *
 * ⚠️ NOTHING CAN BE STRANDED BY HIDING IT, and that is measured rather than assumed. The wizard's
 * state is a fresh `useState` per mount with no draft or storage restore; the defaults are
 * `longClub: false` and `ownership: 'prescribed'` (`syncHardDays` carries `prev?.ownership ??
 * 'prescribed'`); and the ONLY two writers of a club value are the two controls this flag hides.
 * So with it false, no athlete can produce club ownership and nothing downstream is entered.
 */
/**
 * ⛔⛔ WHEN IT COMES BACK, IT COMES BACK WITH THESE RULES (Michael, 2026-08-27). Ruled while the
 * control was still hidden, so that flipping the flag is not also a design session.
 *
 * ⛔ 1. ONE HARD CLUB SESSION, NEVER TWO. A hard club run OR a hard club ride, not both. Two
 * sessions the app does not write, both hard, in a strength block is a week with no control in it.
 *
 * ⛔ 2. THE LONG CLUB RIDE IS BRACKETED BY THE TALK TEST, AND THE TEST IS HIS. p235, VT1: practise
 * the talk test at least twice per run — once after five minutes and once after twenty. So the club
 * ride asks two questions and they resolve it:
 *   · *"Can you hold a conversation the whole way?"* — yes, it is easy work and it IS the long ride.
 *     No, it is not an easy day and filing it as one under-counts the week.
 *   · *"How experienced are you in a group?"* — the same bunch ride is a sit-in for one rider and
 *     three hours of hanging on for another. That is the variable, not the ride.
 *
 * ⛔ 3. THE TWO RULES CLOSE ON EACH OTHER. A club ride that comes back as "cannot really chat" IS
 * the athlete's one hard club session — so they do not also get a hard club run.
 *
 * ⚠️ WHY THE SPLIT IS WHERE IT IS. A club RUN is predictable — warm-up, a structured hard block,
 * cool-down, about an hour to an hour and a quarter, close to what the plan would have written
 * anyway. A club RIDE is not: the same two words cover a 90-minute chaingang and a three-hour café
 * ride. And a wrong guess is cheap on the long slot (easy volume, nothing stacked against it) and
 * expensive on a hard slot, which sits next to the heavy days — p247 prices that adjacency at 3-4%
 * off the squat and deadlift.
 *
 * ⚠️ NOT BUILT: the intensity question itself. `hard_days.ownership` and `long_session.ownership`
 * carry WHO owns the session; nothing carries how hard it is. That is the one new input this needs.
 */
export const CLUB_SESSION_CONTROL_VISIBLE = false;

export type HardSlotValue = {
  role?: 'intensity' | 'threshold';
  goal?: 'speed' | 'vo2';
  ownership?: 'prescribed' | 'club';
  /** ⛔ THE WITHIN-FAMILY VARIANT (Michael, 2026-08-24 — "missing are the speed drills we had").
   *  The slot's FAMILY is the frame's fact (A4); WHICH of the family's own workouts fills it is
   *  the athlete's. Values are the library's own archetype ids; absent = the engine's pick. */
  archetype?: string;
};

/**
 * ⛔ MICHAEL'S OWN LISTS (2026-08-24). A ride offers top-end and sustained threshold; a run offers
 * VO2 and speed. Both then offer the club session as a third answer.
 *
 * ⚠️ THE COPY IS THE EXISTING TABLES', VERBATIM — those strings are pinned to the sessions the
 * composer actually builds (`SESSION_PRESCRIPTION`'s own warning: *"if those tables move, these move
 * with them or the card starts lying about the block it just sold"*).
 */
/**
 * ⛔ BOTH SPORTS USE `singleSlotOptions` NOW (2026-08-24). The run arm read `RUN_GROUND_OPTIONS` —
 * VO2 and speed, two options — and that list has **no sustained-threshold entry**. The frame's
 * SECOND hard slot is `run_near_threshold`: the composer builds it as `cruise_..._threshold` and
 * names it "Threshold Run". So the screen offered no label for the session that slot actually is, and
 * whatever the athlete picked, the row described a different week from the one being built.
 * `singleSlotOptions('run')` carries all three, and its copy is pinned to the same sessions.
 */
export function hardSlotOptions(sport: 'run' | 'ride') {
  return singleSlotOptions(sport === 'ride' ? 'bike' : 'run').map((o) => ({
    id: o.id, title: o.title, body: o.body, role: o.role, goal: o.goal,
  }));
}

/**
 * ⛔⛔ THE TWO HARD SLOTS ARE DIFFERENT SESSIONS, AND THE SCREEN SAID THEY WERE THE SAME (Michael's
 * phone screenshot, 2026-08-24 evening). Both rows read *"Hard session · Ride · Sustained
 * threshold"*, which misstates the week the composer builds.
 *
 * ⛔ **CHECKED AGAINST THE ENGINE, NOT GUESSED.** `strength_5k`'s two hard days are distinct
 * families, and the ride substitution keeps them distinct:
 *
 *     frame day 1  run_mlss            → ride_sweet_spot/medium → `bike_thr_7x3min_R2min`   95-105% FTP
 *     frame day 3  run_near_threshold  → ride_sweet_spot/long   → `bike_ss_4x10min_R4min`   85-95% FTP
 *
 * On the run the same pair builds `interval_..._5kpace` ("Hard Run") and `cruise_..._threshold`
 * ("Threshold Run"). ⛔ **So slot ONE is the top-end session and slot TWO is the sustained one** —
 * the opposite of what the screen defaulted slot one to.
 *
 * ⚠️ `slot` IS REQUIRED. A default keyed on sport alone is what produced two identical rows; there is
 * no such thing as "the default hard session" on this frame, only the default for a given slot.
 */
/**
 * ⚠️ THE FRAME OWNS HOW MANY THERE ARE (2026-08-30). p246 prescribes two quality sessions and p274
 * three, so this spans every hard key any frame can carry — `hardSlotKeysFor` is what says which of
 * them a given frame actually has.
 */
export type HardSlotKey = 'hard1' | 'hard2' | 'hard3';

export function hardSlotDefault(
  sport: 'run' | 'ride',
  slot: HardSlotKey = 'hard1',
  frame: FrameId = 'strength_5k',
): HardSlotValue {
  /**
   * ⛔⛔ THE SESSION IS THE FRAME'S FACT AND IS READ OFF THE SLOT'S FAMILY (2026-08-30). It was
   * `slot === 'hard2'`, which is a POSITION, and the position only stands in for the family in one
   * frame: p246 happens to put the sustained session second. p274 puts a top-end ride second and a
   * near-threshold run third, so a positional test would have handed the third row the top-end
   * default and the athlete a session the composer does not build there.
   *
   * ⚠️ `strength_5k` ANSWERS IDENTICALLY — its `hard2` IS `run_near_threshold`, so it still gets the
   * sustained default, and `hard1` is still `run_mlss` and still gets the top-end one.
   */
  const family = String(frameSlots(frame).find((s) => s.key === slot)?.family ?? '');
  // ⛔ THE SUSTAINED ONE — near-threshold running, or the sweet-spot blocks on the bike.
  if (family === 'run_near_threshold' || family === 'ride_sweet_spot') {
    return { role: 'threshold', ownership: 'prescribed' };
  }
  // ⛔ THE TOP-END ONE — `run_mlss` / the 95-105% FTP intervals. On the run that is the VO2 option
  // (its own table calls it "Recommended"); on the ride it is Helgerud's 4 × 4.
  return sport === 'ride'
    ? { role: 'intensity', ownership: 'prescribed' }
    : { role: 'intensity', goal: 'vo2', ownership: 'prescribed' };
}

export function hardSlotTitle(sport: 'run' | 'ride', value: HardSlotValue): string | null {
  if (value.ownership === 'club') return 'Club session';
  const hit = hardSlotOptions(sport).find((o) => (o.goal
    ? value.goal === o.goal && value.role === o.role
    : value.role === o.role && !value.goal));
  return hit?.title ?? null;
}

/**
 * ⛔⛔ THE SLOT'S SESSION IS THE FRAME'S FACT, NOT A CHOICE (Michael, 2026-08-24 — A4).
 *
 * The card offered top-end / sustained as buttons. **It was never the athlete's to pick.** `p246`
 * fixes the two hard slots as different families — `run_mlss` on frame day 1 and
 * `run_near_threshold` on day 3 — and the composer builds those whatever the card writes. So the
 * buttons were a control over a decision the programme had already made: tap one, and either the
 * screen or the plan was lying.
 *
 * ⛔ WHAT STAYS A REAL CONTROL IS THE CLUB SESSION, and it stays because it genuinely REPLACES the
 * slot rather than re-labelling it (his own Crit rule, work order §club). And the SPORT stays the
 * athlete's, on the slot screen. What is gone is the middle question that was never one.
 *
 * ⚠️ WITHIN-FAMILY VARIANT SELECTION IS THE ENGINE'S AND STAYS THERE (gap #5, deferred by the same
 * ruling). Which VO2 shape a hard run takes, which sweet-spot block a hard ride takes, is not asked
 * anywhere — so `RUN_GROUND_OPTIONS`' speed-versus-hill question does not reappear here.
 *
 * ⛔ THE FACT IS READ OFF THE SAME TABLES THE CARD USED TO OFFER, through `hardSlotDefault`. One
 * owner: the sentence the screen states and the value the wizard sends cannot come apart, which is
 * the failure this card has now been rebuilt three times to fix.
 */
export function hardSlotFact(
  sport: 'run' | 'ride',
  slot: HardSlotKey,
): { title: string; body: string } | null {
  const want = hardSlotDefault(sport, slot);
  const hit = hardSlotOptions(sport).find((o) => (o.goal
    ? want.goal === o.goal && want.role === o.role
    : want.role === o.role && !want.goal));
  return hit ? { title: hit.title, body: hit.body } : null;
}

/**
 * ⛔ WHY THE ATHLETE IS BEING TOLD RATHER THAN ASKED — one line, under the fact.
 *
 * ⚠️ IT NAMES THE PROGRAMME, NOT THE APP. *"The programme owns which session this is"* is the same
 * sentence the block already uses for the mileage it does not take (`generate-strength-plan`'s
 * wiring note), and it is true: the count and the family both come off p246.
 */
export const HARD_SLOT_FACT_NOTE =
  'The programme sets which session this is. Your choice here is the sport, and whether a club '
  + 'session takes the slot instead.';


// ── the within-family variants (gap #5, opened to the athlete 2026-08-24) ───────────────────────
//
// ⛔ THE OPTIONS ARE THE LIBRARY'S OWN ARCHETYPES — page-cited workouts, one list, no copy of it
// here. The slot's family is p246's (frames.ts); a ride reads the family through RIDE_EQUIVALENT,
// the same table the composer uses, so the card can never offer a workout the week cannot build.
import { FAMILIES, type FamilyId } from '../../supabase/functions/_shared/endurance-library/index.ts';
import { RIDE_EQUIVALENT } from '../../supabase/functions/_shared/standing-plan/index.ts';
import type { FrameId } from '../../supabase/functions/_shared/standing-plan/frames.ts';
import { frameSlots } from './standing-plan-week-copy';

/**
 * ⛔ THE FAMILY EACH HARD SLOT IS PRESCRIBED AS, READ OFF THE FRAME (2026-08-30). It was a literal
 * pair — p246 puts MLSS+ on frame day 1 and near-threshold on day 3 — and that is still exactly what
 * comes back for `strength_5k`.
 *
 * ⚠️ THE NAME IS NOW HALF WRONG AND IS KEPT ANYWAY. p274 prescribes its second quality session as a
 * RIDE (`Cyc AnA`), so this is "the family the frame states", not "the run family". Renaming it
 * would touch every reader for no behaviour; the comment is the correction.
 */
export const HARD_SLOT_RUN_FAMILY: Record<HardSlotKey, FamilyId> = (() => {
  const out = {} as Record<HardSlotKey, FamilyId>;
  for (const s of frameSlots()) {
    if (s.role === 'hard') out[s.key as HardSlotKey] = s.family as FamilyId;
  }
  return out;
})();

export type SlotVariantOption = { id: string; label: string };

/**
 * ⛔ WHICH FAMILY A SLOT ACTUALLY BUILDS, ONCE ITS SPORT IS KNOWN. The frame fixes the RUN family
 * per slot; a ride resolves through `RIDE_EQUIVALENT`, the same table the composer uses.
 *
 * ⚠️ ON THE BIKE BOTH HARD SLOTS RESOLVE TO **ONE** FAMILY — `run_mlss` and `run_near_threshold`
 * both map to `ride_sweet_spot`. That is why the two cards can offer the same shape and why
 * `variantsTakenBy` below exists at all. On the run they are different families and nothing
 * overlaps, so the same code is a no-op there rather than a special case.
 */
export function slotFamilyFor(
  key: HardSlotKey,
  sport: 'run' | 'ride',
  frame: FrameId = 'strength_5k',
): FamilyId {
  const stated = (frameSlots(frame).find((s) => s.key === key)?.family
    ?? HARD_SLOT_RUN_FAMILY[key]) as FamilyId;
  /**
   * ⚠️ A SLOT THE FRAME ALREADY PRESCRIBES AS A RIDE IS ALREADY THE ANSWER — there is no conversion
   * to do and `RIDE_EQUIVALENT` has no entry for it (it maps run families to ride ones, one way).
   * The screen does not offer Run on such a slot, for the reason `optionsFor` records.
   */
  if (String(stated).startsWith('ride_')) return stated;
  return sport === 'ride' ? (RIDE_EQUIVALENT[stated]?.family ?? stated) : stated;
}

export function slotVariantOptions(
  key: HardSlotKey,
  sport: 'run' | 'ride',
  frame: FrameId = 'strength_5k',
): SlotVariantOption[] {
  const rules = FAMILIES[slotFamilyFor(key, sport, frame)];
  if (!rules) return [];
  return rules.archetypes.map((a) => ({ id: a.id, label: a.label }));
}

/**
 * ⛔⛔ THE SHAPES THE OTHER HARD CARD HAS ALREADY TAKEN (Michael, 2026-08-26): *"the two
 * hard-session cards must not build the same shape twice — a shape picked on one card greys out on
 * the other."*
 *
 * ⚠️ ONLY WHEN BOTH CARDS BUILD THE SAME FAMILY. On the run they never do, so this returns nothing
 * and the run cards are untouched. On the bike they always do, which is the whole case.
 * ⚠️ GREYED, NOT REMOVED — a row that vanishes is a row the athlete cannot compare against the one
 * they kept, and this card has already lost two layouts to things disappearing on tap.
 * ⛔ IT REPORTS, IT DOES NOT DECIDE. The engine's own de-collision lives in `sport-slots.ts`
 * `assignSports`, because a payload can arrive from an older client that never greyed anything.
 */
/**
 * ⚠️ IT TAKES A LIST NOW (2026-08-31), AND THE SINGLE-`other` FORM STILL WORKS. It was written when
 * a frame had exactly two hard rows, so "the other card" was a well-defined thing. p274 has THREE,
 * and on a week where two of them are rides a third row could collide with either — asked about one
 * neighbour, the card would have greyed one shape and offered the other while the engine's own
 * de-collision moved it anyway. **The same §7 shape as every other two-row assumption in this
 * area:** correct for the frame it was written against, silently wrong for the frame beside it.
 */
export function variantsTakenBy(
  thisKey: HardSlotKey,
  thisSport: 'run' | 'ride',
  others:
    | { key: HardSlotKey; sport: 'run' | 'ride' | null; archetype?: string }
    | { key: HardSlotKey; sport: 'run' | 'ride' | null; archetype?: string }[]
    | null,
  frame: FrameId = 'strength_5k',
): string[] {
  if (!others) return [];
  const list = Array.isArray(others) ? others : [others];
  const mine = slotFamilyFor(thisKey, thisSport, frame);
  const out: string[] = [];
  for (const other of list) {
    if (!other || !other.sport || !other.archetype) continue;
    if (other.key === thisKey) continue;
    // ⛔ ONLY A ROW BUILDING THE SAME FAMILY CAN TAKE A SHAPE. On the run the hard rows are different
    // families and this returns nothing; on the bike they collapse onto one and it is the whole case.
    if (mine !== slotFamilyFor(other.key, other.sport, frame)) continue;
    if (!out.includes(other.archetype)) out.push(other.archetype);
  }
  return out;
}


/**
 * ⛔⛔ WHAT THE CLOSED ROW SAYS WHEN NO WORKOUT HAS BEEN PICKED (Michael, 2026-08-31).
 *
 * ⛔ THE GAP IT CLOSES. The row named the session TYPE — *"Hard session 2 · Ride · Anaerobic"* — and
 * an athlete reading that has no way to know two things: that they may choose the workout, and that
 * leaving it alone means the engine rotates the shapes across the block. Michael: *"we have some kind
 * of cue that they can choose hard session types or rotate?"* There was none.
 *
 * ⛔ IT IS THE SAME WORDS THE OPEN ROW ALREADY USES — the default option reads *"Engine's pick —
 * rotates week to week"*. Naming the closed state with the head of that phrase makes the row and the
 * control agree, and the state obviously **not the athlete's own**, which is what makes the chevron
 * read as the way to change it. ⚠️ No new element and no explaining sentence.
 * ⚠️ SHORT FORM ON THE ROW, because the row already truncates on a phone; the full phrase with its
 * reason is one tap away and unchanged.
 */
export const ENGINE_PICK_ROW_LABEL = "Engine's pick";

/**
 * ⛔ WHAT EACH VARIANT IS, IN PLAIN WORDS — OURS (2026-08-24), one line each, describing the
 * library's own page-cited workouts. Keys are archetype ids; a variant with no line here still
 * renders, label-only, so a new archetype can never be hidden by missing copy.
 *
 * ⛔⛔ EVERY LINE DESCRIBES THE SHAPE AND NOTHING ELSE — MICHAEL'S CONSTRAINT, CLEARED AGAINST THE
 * SOURCE, 2026-08-31: *"variants carry no per-variant benefit claims. The book states goals at the
 * SESSION level only."* p231 gives one objective for the whole MLSS family, p237 one for the whole
 * anaerobic family; **it never says what one of its four printed workouts is better for.** A line
 * that did would be ours wearing his authority.
 *
 * ⛔ TWO LINES WERE TRIMMED TO MEET IT — `below_threshold` claimed *"steady quality, less sting"*
 * and `long` called itself *"the classic sweet spot"*. Both are comparative claims about one option
 * against its siblings, and neither is on the page. What is left is what the workout IS.
 * ⚠️ THE SESSION-LEVEL GOAL IS NOT LOST: it sits once, on the family, in `FAMILY_FACT_BODY` and
 * `FAMILIES[...].intent` — which is exactly where he says it belongs.
 * ⚠️ AND A VARIANT WITH NO LINE STAYS LEGAL — the three p237 ride shapes have none and render
 * label-only, which is the honest state rather than an invented sentence each.
 */
export const VARIANT_BODY: Record<string, string> = {
  /**
   * ⛔⛔ THE DEFAULT'S OWN LINE, AND IT IS HIS (p229, read off the image 2026-08-27):
   * *"I encourage you to try each type of workout in each segment; some may be subjectively 'easier'
   * than others, and each one has a slightly different intent/emphasis. When in doubt, alternate
   * between the one you like the most and hate the most."*
   *
   * ⛔ SO ROTATION IS INSTRUCTED AND HOLDING ONE IS ALLOWED — *"when in doubt"* is what makes a
   * settled preference legitimate. The line says which way he leans without taking the choice away.
   *
   * ⚠️ "try" IS A BANNED WORD in `voiceViolation`, so his verb cannot be quoted directly here.
   * ⚠️ AND WHAT IS OURS IS THE ORDER: he alternates between the one the athlete likes most and hates
   * most; we alternate by week number, because nobody can answer that question before they have
   * done both. Not asked, and not claimed as his.
   */
  // ⚠️ "the source", NEVER HIS NAME (Michael, 2026-08-27). The app is inspired by the book; it does
  // not carry the author's name in front of an athlete. Citations in code and provenance notes keep
  // the page reference — that is for us, not for the screen.
  '': 'Each shape has a different emphasis, and covering them all across a block is what the source encourages.',
  // run_mlss (pp231-232)
  surge_float: 'Surges above threshold with a hard float between, in sets.',
  descending: 'Repeats that shrink as you go — recovery shrinks with them.',
  // run_near_threshold (pp233-234)
  short_above: 'Short repeats just above threshold, controlled recoveries.',
  race_repeats: 'Repeats at your race pace.',
  below_threshold: 'Longer repeats just under threshold.',
  surge_embedded: 'A threshold block with a surge buried inside it.',
  // ride_sweet_spot (pp238-239)
  minute_surge: 'Sweet-spot blocks with a short surge on every minute.',
  medium: 'Medium repeats just under threshold.',
  long: 'Long repeats just under threshold.',
  tempo: 'Steady tempo blocks.',
};

/**
 * ⛔ THE FACT CARD READS THE LIBRARY, NOT THE OLD TABLES (Michael's screenshot, 2026-08-24: the
 * card said "VO2 max focus — 3-minute climbs" over a slot whose session is MLSS work; the old
 * engine's copy had survived over the new engine's truth). Title = the library's own label; the
 * body is OURS, plain; the cite is the library's.
 */
const FAMILY_FACT_BODY: Partial<Record<FamilyId, string>> = {
  run_mlss: 'Maximum time at the hardest pace you can hold, with fatigue controlled.',
  run_near_threshold: 'Maximum quality time near threshold without digging a hole.',
  ride_sweet_spot: 'As close to threshold as possible without going over — lots of time in the zone.',
};

export function slotFamilyFact(key: HardSlotKey, sport: 'run' | 'ride', frame: FrameId = 'strength_5k'):
  { title: string; body: string; cite: string } | null {
  // ⛔ THE FRAME'S OWN FAMILY — `HARD_SLOT_RUN_FAMILY` is the 5K frame's two rows, so a third row
  // resolved to nothing and the card silently showed no session title. Same map, same defect class
  // as the crash on `SLOT_FAMILY` (2026-08-30); this one failed quietly instead of loudly.
  const fam = slotFamilyFor(key, sport, frame);
  const rules = FAMILIES[fam];
  if (!rules) return null;
  return { title: rules.label, body: FAMILY_FACT_BODY[fam] ?? rules.intent, cite: rules.cite };
}
