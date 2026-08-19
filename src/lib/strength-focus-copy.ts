/**
 * STRENGTH FOCUS — the block's own words, in ONE place.
 *
 * ⛔ The build flow shows this BEFORE the athlete commits, and the composer writes it onto the plan
 * AFTER. Same sentences, one source. Two copies of a paragraph is how this repo's docs rotted, and
 * copy is worse than code for it — nobody greps prose, so the two drift silently and the plan ends
 * up describing something other than what the athlete was sold.
 *
 * Home is `src/lib/` by the precedent `exercise-config.ts` set: the client and the edge functions
 * both import from here.
 *
 * ── Provenance, because a later session will want to edit these lines ────────────────────────────
 *
 * Written by Michael, 2026-07-25, and kept in his words.
 *
 * ✅ "adaptation happens during recovery" is BIOLOGY. Resistance training supplies the mechanical
 * stimulus — protein breakdown, mTOR signalling — while net protein synthesis and the structural
 * remodelling occur post-session, MPS elevated ~24-48h. An earlier draft of this note wrongly filed
 * it as a gym aphorism. It belongs.
 *
 * ⚠️ "the most sustainable approach" is a comparison nothing has measured. Product voice, kept
 * knowingly. **Not for a science panel and not for the citation register.**
 *
 * ⛔ "unlock speed and distance blocks" IS A DEBT. Neither block exists and there is no week-12
 * hand-off. It was cut once and reinstated deliberately, so it is a commitment the hand-off must
 * honour. If those blocks are still absent when an athlete finishes twelve weeks, this sentence is
 * the app lying to them.
 */

/** ⛔ TWELVE WEEKS, NOT A RANGE. Wendler's ratios are 2:1, 3:2, 2:2 and a cycle is four weeks, so 12
 *  is the only length that runs leader-leader-anchor as designed. The flow used to offer an 8-52
 *  slider; the composer rounds down to whole cycles, so 10 silently became 8 and 14 became 12 — the
 *  athlete picked a number the engine never built. 8 ships later as the short, off-ratio option,
 *  labelled as such. See docs/SPEC-get-stronger.md §1. */
export const STRENGTH_FOCUS_WEEKS = 12;

export type StrengthFocusSection = { heading: string; body: string };

/**
 * The four sections, with the block's own numbers filled in so it describes the plan the athlete
 * actually gets rather than a template.
 */
export function strengthFocusSections(opts: {
  weeks?: number;
  leaderCycles?: number;
  anchorStartWeek?: number;
  /** How many cycles carry the open set. Derived from the block, not assumed to be one. */
  anchorCycles?: number;
  /**
   * ⛔ THE STANDALONE TEST WEEKS, 1-based (2026-08-15, §1c). A 12-week block opens and closes on one;
   * an 8-week block only closes on one, because the opening test does not fit and the entry gate's
   * 1RM stands in for it. Empty → the sentence is omitted rather than guessed at.
   */
  testWeeks?: readonly number[];
  enduranceNote?: string;
}): StrengthFocusSection[] {
  const weeks = opts.weeks ?? STRENGTH_FOCUS_WEEKS;
  // ⚠️ THE FALLBACKS ARE FOR THE PRE-COMMIT CARD ONLY. The composer always passes real numbers off
  // its own week map; these are what the build flow shows before a block exists. A cycle costs three
  // weeks now and the light weeks are the odd ones, so `weeks / 4` is no longer the divisor.
  const leaders = opts.leaderCycles ?? Math.max(1, Math.floor((weeks - 2) / 3) - 1);
  const anchorStart = opts.anchorStartWeek ?? weeks - 3;
  const anchors = opts.anchorCycles ?? 1;
  const testWeeks = [...(opts.testWeeks ?? [])].sort((a, b) => a - b);
  return [
    {
      heading: 'The trade-off',
      body: `For the next ${weeks} weeks, strength leads.`,
    },
    {
      heading: 'The architecture',
      // ⛔ NO DAY NAMES. This used to read "bench Monday, squat Tuesday, overhead press Thursday,
      // deadlift Friday" — the hardcoded grid the rebuild replaced. The three lifting days are now
      // placed around the athlete's endurance absolutes (`place-week.ts`), so the days differ per
      // athlete and naming them here would promise a week the engine may not build.
      // ⛔ THE SHAPE IS DERIVED, NOT ASSUMED (2026-07-28). This sentence hardcoded "N building
      // cycles, then ONE measuring cycle from week X" — written when every block ended in exactly one
      // anchor. The continuity-derived ratio made the shape variable, and the first anchor-weighted
      // block printed *"0 building cycles, then one measuring cycle from week 9"* over a plan whose
      // every cycle was a measuring cycle. Both halves false, and "0" as a word in prose.
      //
      // ⚠️ §0f: the block knew its own shape and the narration did not follow it.
      // ⛔ THE STRUCTURE SENTENCE FOLLOWS THE BLOCK, and it was rewritten 2026-08-15 (§1c) because
      // the block's shape changed underneath it. Cycles are three weeks; the light weeks stand alone
      // between them; and a test week is a different thing from a deload, so the copy names both.
      body:
        // ⛔ THREE LIFTING DAYS, AND THE PAIRING IS NAMED (§1f-0 / §1f-1, 2026-08-16). This said
        // a FOUR-day count to EVERY athlete, three-day athletes included, and it is the plan's
        // own description — the sentence an athlete reads to find out what they signed up for. The
        // pair is deadlift + press, not bench + press; the wizard said the wrong one too.
        `Sub-maximal loading (Wendler's 5/3/1) keeps fatigue manageable. Three lifting days — squat, ` +
        `bench, and deadlift with the overhead press — placed around your endurance. ` +
        // ⚠️ THE ZERO-LEADER BRANCH IS UNREACHABLE FROM THE ENGINE as of §1b (Forever p.17 has no
        // all-anchor model) and it stays anyway: a count of zero rendered as a word in prose is the
        // 2026-07-28 defect this whole function was rewritten for, and the guard costs one clause.
        (leaders === 0
          ? `Every cycle measures, from week ${anchorStart}. `
          : `${leaders} building cycle${leaders === 1 ? '' : 's'}, then ` +
            (anchors === 1
              ? `one measuring cycle from week ${anchorStart}. `
              : `${anchors} measuring cycles from week ${anchorStart}. `)) +
        `Each cycle runs three weeks, with a light week between them. ` +
        (testWeeks.length === 0
          ? ''
          : testWeeks.length === 1
            ? `Week ${testWeeks[0]} tests the working number, which is what sets the next block's weights.`
            : `Weeks ${testWeeks.slice(0, -1).join(', ')} and ${testWeeks[testWeeks.length - 1]} test the ` +
              `working number — the first sets where this block starts, the last sets where the next one does.`),
    },
    {
      heading: 'The reality check',
      body:
        `Training provides the stimulus. Adaptation happens during recovery. Prioritize how you feel — ` +
        `the math only works if you honor your rest.`,
    },
    {
      heading: "What's next",
      body: `Speed and distance blocks unlock when this cycle closes.`,
    },
  ];
}

/**
 * THE PRE-COMMIT VERSION — three lines, for the card the athlete reads BEFORE answering anything.
 *
 * ⛔ NOT A SECOND COPY OF THE PLAN'S SENTENCES. `strengthFocusSections` is the document: four
 * headed sections, the cycle structure, the recovery note. On the intake card that ran to a full
 * screen and pushed the discipline picker below the fold — the athlete had to scroll past the
 * explanation to reach the question it was explaining.
 *
 * ⚠️ SO THIS SAYS ONLY WHAT DECIDES THE PURCHASE: how long, what leads, what happens to the rest,
 * and what comes after. The cycle shape and the recovery note stay in the plan, where there is room
 * for them and where the athlete is reading rather than choosing.
 *
 * ⛔ It is derived from the same numbers, so the card and the plan cannot promise different blocks.
 */
export function strengthFocusBrief(opts: { weeks?: number } = {}): string {
  const weeks = opts.weeks ?? STRENGTH_FOCUS_WEEKS;
  return (
    `Strength leads for ${weeks} weeks. Three lifting days, placed around the endurance you keep — ` +
    `held easy, enough to hold your base. Speed and distance blocks unlock when this one closes.`
  );
}

/**
 * The "say once" line (SPEC §4). Flat, once, never repeated and never apologised for.
 *
 * ⛔ CORRECTED 2026-07-27 — this said "the last set of EVERY THIRD WEEK is worth measuring" and that
 * is not what the block prescribes. `wendler-531.ts:61` is explicit:
 *     amrap: kind === 'anchor' && !isDeload && i === 2
 * The open set exists ONLY in the anchor cycle — weeks 9, 10 and 11 of twelve. Weeks 1-8 carry
 * plain fives with no open set, so there is nothing to measure in two thirds of the block.
 *
 * The athlete could check this: their own week 3 and week 7 top sets read `×5`, and the first `+`
 * appears in week 9. So the narrative promised a measurement the plan does not contain, and the
 * plan is the thing that is right.
 *
 * ⚠️ This is D-326's blind-gauge finding surfacing in the COPY. That entry records the same fact —
 * the strength gauge is near-blind for eight of twelve weeks — and closing it needs the three
 * layers named there. This line stops the app claiming otherwise in the meantime; it does not fix
 * the blindness.
 */
export function strengthFocusBufferLine(enduranceNote = '', anchorCycles = 1): string {
  // ⛔ "THE FINAL CYCLE" IS ONLY TRUE WHEN THERE IS ONE ANCHOR (2026-07-28). In an anchor-weighted
  // block every cycle carries the open set, so naming the last one tells the athlete the other two
  // measurements do not count — and they are what the working number advances on.
  //
  // ⚠️ AND "weights come off 85% of your max" READ AS A CONTRADICTION against the ramp printed below
  // it, which shows three different percentages. It was never describing the SETS: 85% is where the
  // WORKING NUMBER starts. Said plainly now, because the athlete can see both numbers at once.
  const measured = anchorCycles > 1 ? `each cycle` : `the final cycle`;
  return (
    // ⛔ "Week one sits well inside you by design" WAS GARBLED (2026-07-29). Read in a real block it
    // is not a sentence — "inside you" is missing its object. It means the loads in week one are
    // below what the athlete can already lift, which is the whole point of the 85% buffer, so it now
    // says that.
    `Your working number starts at 85% of your max and every set comes off that, which is the buffer ` +
    `that makes the last set of ${measured} worth measuring. Week one sits below what you can already ` +
    `lift, by design.${enduranceNote}`
  );
}

/**
 * ⛔ THE CEILING IS EVIDENCE THE MAX ON FILE IS STALE — it is not the athlete's limit.
 *
 * When the working number reaches its ceiling the lift stops climbing, and a block that says nothing
 * has told the athlete *"what you get here is what sets the next cycle's weights"* on a lift where
 * that is false. Twelve reps on the open set and the next cycle is identical.
 *
 * ⚠️ THE FRAMING IS THE WHOLE POINT. Michael, 2026-07-28: *"Not 'you've maxed out' — 'the max on file
 * has stopped being true.'"* The ceiling is 90% of a number typed at signup that nothing updates, so
 * hitting it is far more likely to mean the record is out of date than that the athlete has stopped
 * progressing. Read the other way it tells someone mid-progress that they have plateaued.
 *
 * ⚠️ NO IMPERATIVE (COPY-VOICE). States the fact and the conditional consequence; it does not
 * instruct. Returns '' when nothing hit the ceiling, so the sentence never appears without cause.
 */
export function strengthFocusCeilingLine(liftNames: readonly string[]): string {
  const names = Array.from(new Set(liftNames.filter(Boolean)));
  if (names.length === 0) return '';
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const plural = names.length > 1;
  return (
    `One thing before you start. ${list} reach${plural ? '' : 'es'} the top of the range the working ` +
    `number is allowed to occupy, so ${plural ? 'those lifts hold' : 'that lift holds'} rather than ` +
    `climbing for the rest of the block. That is usually the max on file being out of date rather ` +
    `than a limit — a fresh test on ${plural ? 'them' : 'it'} before the block starts would let ` +
    `${plural ? 'those numbers' : 'that number'} keep moving.`
  );
}

/** The plan description the composer stores — the sections, plus the buffer line before what's next. */
export function strengthFocusDescription(opts: {
  weeks: number;
  leaderCycles: number;
  anchorStartWeek: number;
  anchorCycles?: number;
  enduranceNote?: string;
  /** The standalone TM-test weeks, 1-based. Empty → the sentence is omitted. */
  testWeeks?: readonly number[];
  /**
   * ⛔ TRUE WHEN THE LEADER WEEKS CARRY THE FSL SUPPLEMENTAL (§1e). The session gets longer, and the
   * plan says so ONCE, flat, in its own description — not on every card. False/absent → no sentence.
   */
  supplemental?: boolean;
  /** Lifts whose working number hits its ceiling inside this block. Empty → the line is omitted. */
  ceilingLifts?: readonly string[];
  /**
   * Lifts light enough that some prescribed sets sit below the 45 lb bar (they floor at 35 —
   * `barFloorForWorkingNumber`). Named here so the athlete hears it at build time, in the plan's
   * own voice: a women's bar is the equipment for those sets. Empty → the line is omitted.
   */
  lightBarLifts?: readonly string[];
  /**
   * ⛔ THE COMPROMISES THE SOLVER MADE, RENDERED (2026-07-28). `placement_compromises` was written on
   * every plan and read by nothing — the second correctness-relevant message in this block found
   * being composed and discarded. A cost the athlete is paying and cannot see is not a cost that was
   * disclosed.
   */
  compromises?: ReadonlyArray<{ kind: 'breach' | 'cost' | 'ceiling'; text: string }>;
}): string {
  const sections = strengthFocusSections(opts);
  const body = sections.slice(0, 3).map((s) => `${s.heading}. ${s.body}`).join('\n\n');
  const whatsNext = sections[3];
  const ceiling = strengthFocusCeilingLine(opts.ceilingLifts ?? []);
  // ⛔ SAID ONCE, IN THE PLAN, AND NOWHERE ELSE (§1e). A cost the athlete pays and cannot see is not
  // disclosed; a cost repeated on twelve weeks of cards is nagging. ⚠️ COPY-VOICE — states the fact
  // and what it buys, no imperative, no apology for the length.
  const supplementalLine = opts.supplemental
    ? 'On the building cycles the main lift is repeated for five sets of five at its opening weight, '
      + 'which adds about ten minutes to those sessions. It is volume at a weight already lifted that '
      + 'day, so it builds the lift without adding load.'
    : '';
  const lightBar = (opts.lightBarLifts ?? []).length > 0
    ? `Some ${(opts.lightBarLifts ?? []).join(' and ')} sets sit below the 45 lb bar — those are written for a 35 lb bar.`
    : '';
  // ⛔ DROPPED BY `kind`, NEVER BY REGEX ON THE PROSE (fixed 2026-07-29).
  //
  // The ceiling paragraph above already states this fact, so the compromise entry is dropped here to
  // avoid saying it twice in different words. It used to be identified by
  // `/training max|working number reaches/` — and when that sentence was tightened the same day, the
  // words "working number reaches" disappeared, the filter stopped matching, and a real twelve-week
  // block printed the ceiling fact in two consecutive paragraphs.
  //
  // ⚠️ THE LESSON IS THE COUPLING. A dedup keyed on wording means any copy edit, in any file, can
  // silently re-break it with nothing failing. `kind: 'ceiling'` cannot be paraphrased. If a future
  // entry needs suppressing here, give it a kind — do not add a phrase to a regex.
  const rest = (opts.compromises ?? [])
    .filter((c) => c?.text && c.kind !== 'ceiling')
    .map((c) => c.text);
  const parts = [
    body,
    strengthFocusBufferLine(opts.enduranceNote ?? '', opts.anchorCycles ?? 1),
    supplementalLine,
    ceiling,
    lightBar,
    rest.length ? `What this week costs. ${rest.join(' ')}` : '',
    `${whatsNext.heading}. ${whatsNext.body}`,
  ].filter(Boolean);
  return parts.join('\n\n');
}

// ─── BAR SPEED — the block's in-session doctrine ────────────────────────────────────────────────
//
// ⛔ THE AMRAP ENDS SHORT OF FAILURE — NOT AT THE FIRST SLOW REP. **CORRECTED 2026-08-01; the
// paragraph that stood here was stricter than the source it cited.**
//
// It read: *"speed is the earliest sign of form breakdown, so slow rep = last rep"* (Michael,
// 2026-07-25 — "the AMRAP terminator and the whole doctrine in four words"). Neat, and it stops the
// set too early. Wendler's own instruction for the "+" set is to **grind it out, not to failure**
// (5/3/1 2nd ed. p.24). A grinding rep is a rep — it is the slow ones at the end of an AMRAP that
// make the set worth doing, and the count off that set is what moves the training max. A rule that
// ends the set at the first slow rep systematically under-reports the number the block runs on.
//
// ⚠️ THE STOP RULE ITSELF IS UNCHANGED AND IS THE POINT: not to failure. What changed is WHERE it
// sits — at the edge of failure, not at the first sign of effort. "Grind it out" gives the reps
// their permission; "stop before failure" keeps the ceiling.
//
// ⛔ AND IT IS KEYED TO THE SET, WHICH IS THE WHOLE REASON THIS IS A FUNCTION AND NOT A CONSTANT.
// AMRAPs exist ONLY in the anchor cycle and never on its deload (`wendler-531.ts:61` —
// `amrap: kind === 'anchor' && !isDeload && i === 2`), so in a 12-week block that is weeks 9, 10 and
// 11. On every other week the top set is a PRESCRIBED five, three or one, and the athlete is meant
// to stop there. Showing an AMRAP line on a leader week tells them to chase reps the plan did not
// ask for — the exact class of bug that put a 5×5 label, a retest week and a Sat/Sun cage on screens
// describing an engine that had changed underneath them (D-324). **Speed on a prescribed set is a
// QUALITY CHECK. Speed on an AMRAP is a STOP RULE. They are different sentences.**
//
// ⚠️ NOTHING HERE MENTIONS SPEED DECIDING THE WORKING NUMBER. Pairing the two was inventing a signal
// the engine does not read: the advance/reset rule is Wendler's 95% validity check — five reps at
// 95% or the number comes down 10% (`wendler-531.ts:160-200`, `verdictFrom95Set` / `applyVerdict`).
// ⛔ **Those two functions are written, correct, and CALLED BY NOTHING.** The composer advances the
// working number by cycle index, unconditionally (`workingNumberForCycle:112`). Until the verdict is
// wired, `STRENGTH_ADVANCE_COPY` must not be rendered — it would describe an engine that is not
// running. Same starvation as `place-week.ts`.

/** Which line an athlete is standing in front of. Derived from the SET, never from the week number. */
export type BarSpeedMoment =
  | 'warmup'
  | 'work_set'      // prescribed reps — 5×5, triples, doubles. A quality check.
  | 'amrap'         // the "+" set. A stop rule.
  | 'rest'
  | 'deload'
  | 'validity_set'; // week 3 of a cycle: the 95% set that decides the working number

export const BAR_SPEED_COPY: Record<BarSpeedMoment, string> = {
  warmup: 'Light weight, heavy intent. Move it fast.',
  // ⛔ NO REP-CHASING LINE, AND NO "GRIND" WORD, ANYWHERE NEAR A PRESCRIBED SET.
  // Wendler's working-set instruction is EXPLOSIVE AND UNDER CONTROL on the concentric — speed in
  // reserve, no grinding; grinding is reserved for the "+" set (5/3/1 2nd ed. p.24). "Grind" lives
  // ONLY on the amrap line so the two don't contradict on the top set (Michael 2026-08-11).
  work_set: 'Every rep explosive and controlled.',
  // ⚠️ REVERSED 2026-08-01 from "Slow rep = last rep." — see the doctrine note above. Grinding reps
  // are real reps; the ceiling is failure, not slowness.
  amrap: 'Grind it out. Stop before failure.',
  rest: "Rest until the speed's back.",
  // ⚠️ REWRITTEN 2026-08-01 (Michael), from "Nothing to prove. Move it fast anyway." The old line
  // conceded something first ("nothing to prove", "anyway") and the concession is the part an
  // athlete reads — it frames the session as a write-off rather than as a prescribed light day.
  // The replacement states the FACT (the plan chose this weight) and then the instruction, which is
  // the same shape every other line in this table uses.
  deload: 'Light on purpose. Move it fast.',
  // The gate announces itself BEFORE the unrack, not after. It is the one set in the cycle whose
  // rep count changes the plan, and an athlete who finds that out afterwards was not given the
  // chance to treat it as the measurement it is.
  validity_set: 'Five at ninety-five. This one decides the number.',
};

/**
 * The AMRAP's closing line — shown after the set, where `amrap` is shown before/during.
 * ⚠️ REALIGNED 2026-08-01 from "Stop when it slows, not when it fails." That sentence carried the
 * speed-stop the doctrine note above retired, and it contradicted the new opener the moment the
 * opener said to grind. Both lines now name the same ceiling, and this one says why it is there.
 */
export const BAR_SPEED_AMRAP_AFTER = 'Not to failure — you train tomorrow.';

/**
 * ⛔ THE ASSISTANCE CUE — shown ONCE per accessory exercise, not per set.
 *
 * An assistance row prescribes a rep TOTAL ("25 total") and no weight, which is the block saying
 * *"get this many, however you like."* Nothing on the card said so, so the number read as a single
 * set — Michael, on his own plan: *"25 chin ups? lol i can do 5."* The prescription never asked for
 * twenty-five in a row, and the row that carries it never mentioned that.
 *
 * **Basis: Wendler, 5/3/1 2nd ed.** Assistance is done across as many sets as it takes and is
 * explicitly NOT taken to failure (p.24, p.102); doing too much assistance is named as the single
 * most common mistake lifters make with the programme. Both halves of the line are his, in order.
 *
 * ⚠️ IT CONTAINS "as many" AND "failure", AND THAT IS NOT A LINT MISS. `bar-speed-copy.test.ts`
 * bans those words on the BAR_SPEED_COPY lines because there they would mean rep-chasing on a
 * prescribed set. Here "as many" governs SETS (the opposite of chasing reps in one) and "failure"
 * appears as an explicit stop rule. Same words, inverted sense. **Do not widen that lint over this
 * constant** — pin the intent instead, as `strength-accessory-copy.test.ts` does.
 */
export const ACCESSORY_SET_CUE = 'Split these into as many sets as you need. Leave a rep or two — never to failure.';

/**
 * ⛔ GATED ON `verdictFrom95Set` BEING WIRED. Do not render until the composer reads the verdict
 * instead of advancing by calendar. Both lines state the mechanism that exists — reps at 95% — and
 * neither claims speed decides anything.
 */
export const STRENGTH_ADVANCE_COPY = {
  advance: 'Five at ninety-five. Number goes up.',
  reset: "Couldn't hit five at ninety-five. Number comes down ten percent.",
} as const;

/**
 * The line for a set, given what the set IS.
 *
 * ⛔ THE GATE OUTRANKS THE DELOAD, and the ordering is deliberate. Today the two cannot collide —
 * `PCT_BY_WEEK` puts the 95% set on week 3 and the deload on week 4 (max 60%), so no deload set is
 * ever a validity set. **But "cannot collide today" is the wrong thing for this line to depend on.**
 * If the cycle shape ever changes, a deload-first ordering would SUPPRESS the gate line and the
 * athlete would unrack the set that decides their working number without being told it decides
 * anything. Suppressing the gate is the expensive failure; showing a gate line on a deload is
 * cosmetic. So the gate wins, and `bar-speed-copy.test.ts` pins both the precedence AND the
 * structural fact that they do not currently meet.
 */
export function barSpeedLineFor(set: {
  isWarmup?: boolean;
  isAmrap?: boolean;
  isDeload?: boolean;
  /** True only on the 95% set — week 3 of a cycle. `wendler-531.ts` VALIDITY_CHECK_PCT. */
  isValiditySet?: boolean;
}): string {
  if (set.isValiditySet) return BAR_SPEED_COPY.validity_set;
  if (set.isDeload) return BAR_SPEED_COPY.deload;
  if (set.isWarmup) return BAR_SPEED_COPY.warmup;
  if (set.isAmrap) return BAR_SPEED_COPY.amrap;
  return BAR_SPEED_COPY.work_set;
}

// ─── PER-SET DIFFICULTY (D-326) ────────────────────────────────────────────────────────────────
//
// ⛔ THE REPLACEMENT SIGNAL FOR THE ONE D-324 REMOVED — and it must never become that one again.
// RIR was killed because it was AUTO-FILLED and then entered `brzycki1RM` (`effectiveReps = reps +
// rir`), so a guessed reserve on a deliberately sub-maximal opener read back as a much heavier lift.
// **The bug was never "asking how it felt." It was a guess entering the arithmetic.**
//
// So: this is volunteered, it feeds the BODY read (`BodyTrends.strength`, idle since D-318 excluded
// the RIR trend for strength-primary), and it NEVER reaches the 1RM estimate. Blank stays legal.
//
// ⚠️ AND IT DOES NOT CLOSE THE GAUGE PROBLEM ON ITS OWN — see D-326's three-failure table. This is a
// higher-resolution mirror. `verdictFrom95Set` wired is what stops the number issuing itself, and
// rendered provenance is what stops it hiding its age. Do not tick the blindness closed on this.
//
// WORDS, NOT A NUMBER, and that is field practice rather than preference: RPE 6-10 and RIR 0-4 are
// standard where the answer DRIVES LOAD (Juggernaut, Hevy, Strong) — it does not here, 5/3/1 already
// dictates the weight. The apps optimised for people actually answering use plain language (RP's
// none/low/moderate/high), because a lifter mid-set does not separate an 8 from an 8.5. Ten points of
// scale to detect "this is trending wrong" is precision we cannot use and cannot defend. And "RIR" is
// jargon by COPY-VOICE rule 9.

export type SetDifficulty = 'moved_well' | 'worked_for_it' | 'grind';

/** Ordinal ONLY — for trend maths. ⛔ Never rendered back to the athlete as a number. */
export const SET_DIFFICULTY_ORDINAL: Record<SetDifficulty, number> = {
  moved_well: 0,
  worked_for_it: 1,
  grind: 2,
};

/** The three words, in order. `grind` is the bar-speed language the block already speaks. */
export const SET_DIFFICULTY_OPTIONS: ReadonlyArray<{ value: SetDifficulty; label: string }> = [
  { value: 'moved_well', label: 'Moved well' },
  { value: 'worked_for_it', label: 'Worked for it' },
  { value: 'grind', label: 'Grind' },
];

/** The prompt above the three. Michael, 2026-07-25 — it states what the tap DOES, in four words. */
export const SET_DIFFICULTY_PROMPT = 'Select difficulty to mark done';

/**
 * Which set is the TOP set — the only one the difficulty tap appears on.
 *
 * ⛔ HEAVIEST, NOT LAST. Robust to warm-up sets sitting in the same array and to any future
 * reordering. Ties resolve to the LAST occurrence, which is where 5/3/1 puts it: three ascending
 * sets, the third is the top. Returns -1 when nothing is loaded (bodyweight, duration work), which
 * suppresses the tap rather than guessing.
 *
 * Extracted from the logger so the rule is testable and has ONE reader — the same habit that keeps
 * `plannedSetsFor` honest.
 */
export function topSetIndex(sets: ReadonlyArray<{ weight?: number | null }>): number {
  if (!Array.isArray(sets) || sets.length === 0) return -1;
  const weights = sets.map((s) => Number(s?.weight) || 0);
  const max = Math.max(...weights);
  if (!(max > 0)) return -1;
  return weights.lastIndexOf(max);
}

// ── The hard day, and what it is honestly for ────────────────────────────────────────────────────

/**
 * ⛔ THE CARD STATES THE CLAIM; THIS STATES THE RECEIPT. Michael, 2026-07-29, on the one-line
 * version: *"it needs to be honest about what it achieves so check our citations and how we arrived
 * there"* — then *"maybe thats an (i) with that and the citations?"*
 *
 * ⛔ EVERY SENTENCE HERE IS TRACED TO `docs/DOCTRINE-aerobic-maintenance.md`, AND ONE CLAIM WAS
 * DROPPED FOR FAILING THAT TRACE:
 *
 * - ✅ §3 — Hickson's maintenance trilogy. Same 10-week base build, then 15 weeks with ONE variable
 *   cut. Frequency 6 d/wk → 4 or 2: VO2max held in both arms. Duration 40 min → 26 or 13: held in
 *   both arms. Intensity −⅓ or −⅔: NOT held, and worse at −⅔. Hickson & Rosenkoetter 1981
 *   (frequency), Hickson et al. 1982 (duration), Hickson et al. 1985 (intensity).
 *
 * - ⛔ AND THE NAME IS AMBIGUOUS IN THIS REPO, WHICH IS WHY THE YEARS ARE PRINTED. `Hickson 1980` is
 *   the INTERFERENCE paper and it is what the engine cites (`schedule-session-constraints.ts:27`,
 *   `week-optimizer.ts:483/657/684`). A bare "Hickson" here would point an athlete at the opposite
 *   question. §3's box calls this out as the first thing a bibliography has to fix.
 *
 * - ✅ §5.0, sourced 2026-07-26 — one interval session a week is BELOW the improvement threshold for
 *   trained athletes; 2–3/wk is the effective range for gains; roughly one every 1–2 weeks
 *   preserves. The doctrine's own instruction: *"the block does not build the engine. It holds it.
 *   Any copy promising aerobic improvement during a strength-led block is unsupported."*
 *
 * - ⛔ CUT: the deposit claim. §5.0's *"where the gains actually are"* — endurance performance
 *   improving through efficiency with VO2max flat, **17 studies, 262 participants** — is the
 *   best-evidenced statement in the domain and the doctrine says to lead with it. It is NOT here for
 *   two reasons. (1) **That number has no paper under it anywhere in the doctrine** — §7's unsourced
 *   sweep never named it, and printing a participant count with no author beside it is a citation
 *   with the receipt torn off. (2) It is a claim about the BLOCK, not about this session, and
 *   attaching a block-level citation to a session-level sentence is the exact fault that produced
 *   D-328 and D-329. It belongs near the goal card, once it has an author.
 *
 * - ⛔ ALSO NOT SAID: that a hard ride costs less than a hard run. §5's modality split is Wilson
 *   2012, and Schumann 2022 (43 studies) found no modality moderation at all. The doctrine carries a
 *   standing instruction not to build a new claim on it, so the Run/Ride choice stays neutral.
 *
 * ⚠️ VOICE — COPY-VOICE rules 1, 7, 9: the subject is the training, never "you"; no imperatives; and
 * "top-end aerobic fitness" rather than the metric name, which rule 9 bans the same way it bans
 * "aerobic base" and "Z2". The paper names are citations, not jargon, and they stay.
 */
/**
 * ⛔ WHAT THE CHOICE COSTS THE LIFTING — Michael's copy, 2026-08-18, CORRECTED AGAINST THE CODE
 * BEFORE IT SHIPPED. Read the correction; it is the whole reason this is worth trusting.
 *
 * His first draft attributed the assistance band to the hard-day COUNT alone. `resolveEnduranceTier`
 * reads hard days AND hours, and hours can override — so "0 hard days → 40-50 reps" would have been
 * promised to an athlete riding ten easy hours, who actually receives 25-30. The tiers, verbatim
 * from `assistance-menu.ts`:
 *
 *   | survival | 25-30 | >= 2 hard days **OR** > 8 total hours |
 *   | base     | 30-40 | == 1 hard day  **AND** 4-8 total hours |
 *   | strength | 40-50 | 0 hard days    **AND** < 4 total hours |
 *
 * ⛔ AND WHAT WAS CUT FROM THE DRAFT ENTIRELY, because it is not built: a second chooser copy
 * described training-max HOLD gates, AMRAP capping and a maintenance mode at 8/14/18 weekly hours.
 * None of that exists. `totalEnduranceHours` has exactly ONE consumer in the whole engine —
 * `resolveEnduranceTier` — and the training max advances off cycle index and the earned-advance
 * verdicts, never off endurance volume. Michael: *"ship what's true today; B is a real engine
 * decision that deserves its own pass, not a copy deadline."*
 *
 * ⚠️ SO THE CLAIMS HERE ARE LOAD-BEARING AND CHECKABLE. 85% is `WORKING_NUMBER_PCT_OF_1RM`; +5/+10
 * is `cycleIncrementLb(isLowerBody)`; the three bands are `ASSISTANCE_BAND_BY_HARD_DAYS`. ⛔ If any
 * of those move, this copy moves with them or the chooser starts selling a block the plan does not
 * build.
 */
export const HARD_DAY_WHY: ReadonlyArray<{ heading: string; body: string }> = [
  {
    heading: 'What it changes',
    body:
      'Assistance reps only. Main lifts always run at 85% training max, advancing +5 lb upper / '
      + '+10 lb lower per cycle. Cardio never touches the bar.',
  },
  {
    heading: '0 hard days',
    // ⚠️ THE HOURS CLAUSE IS THE CORRECTION, NOT A CAVEAT. Without it this line is false for any
    // athlete over 4 hours a week, which is most of them.
    body:
      'Full assistance volume: 40-50 reps per exercise — if you are also under 4 total hours. '
      + '4 to 8 hours puts you at 30-40; ride 10 easy hours and volume alone drops you to 25-30.',
  },
  {
    heading: '1 hard day',
    // ⛔ "AT 8 HOURS OR UNDER", NOT "AT 4-8" (2026-08-18). The 4-8 window was the OLD AND-gate, and
    // it was the inversion: one hard day on three hours failed it and fell through to 25-30, so a
    // lighter week bought FEWER accessories than a heavier one. `base` is the fall-through now, so
    // one hard day is 30-40 at any hours up to eight — see `resolveEnduranceTier`'s header.
    body:
      '30-40 assistance reps, at 8 total hours or under. Slower accessory growth. Main lift '
      + 'progress unchanged.',
  },
  {
    heading: '2 or more hard days',
    body:
      '25-30 assistance reps, whatever the hours. Accessories run at the minimum effective dose. '
      + 'Main lift progress unchanged.',
  },
  {
    heading: 'Why the accessories are what move',
    body:
      'Each hard cardio day is a nervous-system hit. Assistance reps are the only expendable '
      + 'volume — they get cut, bar weight never does.',
  },
  {
    heading: 'How the two combine',
    body:
      'Hours and hard days combine, and the engine takes the heavier of the two costs. Whichever '
      + 'tier you land in, only assistance reps change: your 85% working numbers and +5/+10 '
      + 'progression run untouched.',
  },
  {
    heading: 'What it holds',
    body:
      'Cutting how often the training happens, or how long each session runs, leaves top-end aerobic '
      + 'fitness intact — six days a week down to two, and forty-minute sessions down to thirteen, both '
      + 'held it for fifteen weeks. Cutting how hard is the one that lost it. '
      + '(Hickson 1981, 1982, 1985 — the maintenance experiments, not the 1980 interference paper.)',
  },
  {
    heading: 'What it does not do',
    body:
      'One hard session a week sits below the level where trained athletes improve. Two to three a week '
      + 'is where gains happen; roughly one every one to two weeks is enough to preserve. So this block '
      + 'holds the engine where it already is, and nothing here promises a bigger one at the end of it.',
  },
  {
    heading: 'Why the day is asked for',
    body:
      'A fixed group session — a run club, a ride club — lands in this same slot. Naming the day it '
      + 'falls on is what lets the lifting be placed around it rather than on top of it.',
  },
];

/**
 * ⛔ THE HARD RIDE SAYS WHAT IT IS (2026-08-10).
 *
 * The hard-day row asks Run or Ride, and only Run got an answer — "What you can run it on", four
 * options with their consequences. Ride got NOTHING: the athlete picked it and the row simply
 * stopped, which reads as an unfinished screen rather than a settled question. Michael, on the
 * device: *"ride has no description."*
 *
 * ⚠️ AND THE ASYMMETRY IS REAL, WHICH IS WHY THIS IS A STATEMENT AND NOT A MENU. The run's terrain
 * question exists because terrain CHANGES THE SESSION — a 3-minute hill, a treadmill incline, a
 * short hill and flat ground are four different stimuli with four different costs to the next lift,
 * and §2.0 only permits the flat version because the athlete owns a stated trade. A bike has no such
 * fork: the interval is the same work on a climb, a flat road or a trainer, because the resistance
 * is the athlete's own power rather than the ground. So the ride does not get a menu it has no
 * choices for — it gets the one thing the run branch also gives, which is knowing what was agreed to.
 *
 * **Helgerud J, Høydal K, Wang E, et al. (2007), "Aerobic High-Intensity Intervals Improve VO2max
 * More Than Moderate Training", Med Sci Sports Exerc 39(4):665-671.** Four 4-minute efforts at
 * 90-95% of maximal heart rate, three minutes of active recovery between. This is the shape the
 * generator already builds for a hard ride; the copy is catching up to it, not deciding it.
 *
 * ⚠️ NOT SAID: that a hard ride costs less than a hard run. Schumann 2022 (43 studies) found no
 * modality moderation, and the standing instruction is not to build a new claim on Wilson 2012's
 * split. The two branches describe themselves; neither is priced against the other.
 */
export const HARD_RIDE_SHAPE =
  'Four 4-minute efforts hard, three minutes easy between them. A climb, a flat road or a trainer '
  + 'all deliver it — on a bike the resistance is your own power, so the ground does not change the '
  + 'session the way it does on foot.';

/**
 * ⛔ THE VOLUME RATIONALE, MOVED OFF THE CARD (2026-08-09).
 *
 * This was six lines of prose sitting BETWEEN the two inputs on "How much" — weekly running miles
 * above it, weekly riding hours below — so on a phone the second field was off screen and an athlete
 * who trains both never saw there was a second question. Michael, on the device: the controls get
 * pushed below the fold.
 *
 * ⚠️ THE CLAIM STAYS ON THE CARD; THE RECEIPT MOVES BEHIND THE (i). One line survives above the
 * inputs — *"Pace is not what competes with strength — total work is."* — because it is
 * counterintuitive, every athlete assumes the hard session is the threat to their lifting, and this
 * is the screen where the volume is chosen. The numbers, the paper and the two things the paper does
 * NOT say are one tap away, in the same shape `HARD_DAY_WHY` already uses on the scheduler.
 *
 * ⛔ BOTH CORRECTIONS FROM 2026-08-06 SURVIVE THE MOVE, AND THEY ARE THE REASON THIS IS THREE
 * SECTIONS RATHER THAN A PARAGRAPH:
 *   1. **It was CYCLING, not running.** The trial's conclusion reads "whether HIT or MICT cycling is
 *      incorporated". Cycling carries less eccentric load, so reading it across to running errs
 *      toward overstating the cost — that hedge is not decoration, it is the condition the claim is
 *      allowed on.
 *   2. **Volume is the authors' SUGGESTION, not their result.** They wrote it "might be" the more
 *      critical mediator. Work was held constant while intensity varied, so what is measured is that
 *      INTENSITY does not mediate. An earlier draft stated the volume half flatly; it does not now,
 *      and the section that says so is titled for it.
 *
 * **Fyfe JJ, Bartlett JD, Hanson ED, Stepto NK, Bishop DJ (2016), "Endurance Training Intensity Does
 * Not Mediate Interference to Maximal Lower-Body Strength Gain during Short-Term Concurrent
 * Training", Frontiers in Physiology 7:487 (PMC5093324).** Eight weeks; RT only +38.5 ± 8.5%,
 * HIT+RT +28.7 ± 5.3%, MICT+RT +27.5 ± 4.6% on leg press. "All MICT sessions were work- and
 * duration-matched to the corresponding HIT session."
 *
 * ⛔ THE SAME PAPER DECIDES THE HARD SESSION'S REP COUNT — `DECISIONS-LOG-2.md` **D-389**, which
 * holds this and Wen 2019 together: the 5th hill rep would reach Wen's VO2max threshold and is
 * bought in exactly the total work Fyfe found interferes with strength.
 *
 * ⚠️ VOICE — every string here is asserted clean against `voiceViolation()` in
 * `strength-focus-copy.voice.test.ts`. Passing that gate is necessary, not sufficient: two earlier
 * drafts of the old paragraph passed a hand-read and broke rule 10 on idiom. Read it as well as
 * running it.
 */
export const VOLUME_WHY: ReadonlyArray<{ heading: string; body: string }> = [
  {
    heading: 'What the trial found',
    // ⛔ THE CLAIM SENTENCE LIVES HERE NOW, NOT ON THE CARD (2026-08-10). It was the one line left
    // above the inputs, and it was still a paragraph of argument on a screen whose only job is to
    // take two numbers. The card leads straight into the inputs on the holding-dose framing the
    // subtitle already carries; anyone who wants to know why the number matters taps the (i) and
    // reads it as the first thing in here, where it belongs with the evidence for it.
    body:
      'Pace is not what competes with strength here — total work is. Eight weeks, three groups: '
      + 'lifting alone gained 38.5% on leg press, hard cycling alongside the lifting gained 28.7%, '
      + 'easy cycling 27.5% — almost the same number. Every endurance session was matched for equal '
      + 'work and equal duration, so pace was not what separated them. '
      + '(Fyfe et al. 2016, Frontiers in Physiology 7:487.)',
  },
  /**
   * ⛔ THE COST TIERS SIT SECOND, AND THAT IS A DELIBERATE YIELD TO AN OLDER RULING. They were
   * drafted at index 0 — what an athlete typing a number wants first is what the number DOES — and
   * `strength-focus-copy.voice.test.ts` refused it: the 2026-08-10 decision requires the Fyfe claim
   * to OPEN this list, because *"if a future trim drops it entirely, the app has quietly stopped
   * saying the one counterintuitive thing it knows about this choice."* That reason still holds, and
   * one short section above these costs a reader nothing.
   *
   * ⚠️ SAME CORRECTION AS `HARD_DAY_WHY` — see its header. This chooser touches the assistance band
   * and NOTHING ELSE: no training-max hold, no AMRAP cap, no maintenance mode. Those were in the
   * draft and are not in the engine.
   */
  {
    heading: 'What it changes',
    body:
      'Assistance reps only. Nothing here touches your training max, your progression, or your '
      + 'AMRAP sets.',
  },
  {
    heading: 'Under 4 hours a week',
    body: 'Full assistance volume: 40-50 reps, with 0 hard days. No strength cost.',
  },
  {
    heading: '4 to 8 hours a week',
    body: '30-40 assistance reps. Slower accessory growth. Main lifts unchanged.',
  },
  {
    heading: 'Over 8 hours a week',
    body:
      '25-30 assistance reps, even with zero hard days. Accessories at the minimum dose. Main '
      + 'lifts unchanged.',
  },
  {
    heading: 'How the two combine',
    body:
      'Hours and hard days combine, and the engine takes the heavier of the two costs. Whichever '
      + 'tier you land in, only assistance reps change: your 85% working numbers and +5/+10 '
      + 'progression run untouched.',
  },
  {
    heading: 'What it does not say',
    body:
      'The authors point at total work instead, and they call that a possibility rather than a result — '
      + 'work was held constant while intensity varied, so what the trial measures is that intensity '
      + 'does not mediate. The endurance was also cycling. Running carries more eccentric load, so '
      + 'reading the number across to running errs toward overstating the cost.',
  },
  {
    heading: 'Why the number here matters',
    body:
      'As weekly volume climbs, the strength gained across a block gets smaller. The number entered on '
      + 'this screen is the one the plan builds around, and the sessions do not shrink to meet it.',
  },
];
