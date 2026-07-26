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
  enduranceNote?: string;
}): StrengthFocusSection[] {
  const weeks = opts.weeks ?? STRENGTH_FOCUS_WEEKS;
  const leaders = opts.leaderCycles ?? Math.max(1, Math.floor(weeks / 4) - 1);
  const anchorStart = opts.anchorStartWeek ?? weeks - 3;
  return [
    {
      heading: 'The trade-off',
      body: `For the next ${weeks} weeks, strength leads.`,
    },
    {
      heading: 'The architecture',
      // ⛔ NO DAY NAMES. This used to read "bench Monday, squat Tuesday, overhead press Thursday,
      // deadlift Friday" — the hardcoded grid the rebuild replaced. The four lifting days are now
      // placed around the athlete's endurance absolutes (`place-week.ts`), so the days differ per
      // athlete and naming them here would promise a week the engine may not build.
      body:
        `Sub-maximal loading (Wendler's 5/3/1) keeps fatigue manageable. Four lifting days, placed ` +
        `around your endurance. ${leaders} building cycle${leaders === 1 ? '' : 's'}, then one ` +
        `measuring cycle from week ${anchorStart}. Each ends in a deload.`,
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

/** The "say once" line (SPEC §4). Flat, once, never repeated and never apologised for. */
export function strengthFocusBufferLine(enduranceNote = ''): string {
  return (
    `Weights come off 85% of your max, and that buffer is what makes the last set of every third ` +
    `week worth measuring. Week one sits well inside you by design.${enduranceNote}`
  );
}

/** The plan description the composer stores — the sections, plus the buffer line before what's next. */
export function strengthFocusDescription(opts: {
  weeks: number;
  leaderCycles: number;
  anchorStartWeek: number;
  enduranceNote?: string;
}): string {
  const sections = strengthFocusSections(opts);
  const body = sections.slice(0, 3).map((s) => `${s.heading}. ${s.body}`).join('\n\n');
  const whatsNext = sections[3];
  return `${body}\n\n${strengthFocusBufferLine(opts.enduranceNote ?? '')}\n\n${whatsNext.heading}. ${whatsNext.body}`;
}

// ─── BAR SPEED — the block's in-session doctrine ────────────────────────────────────────────────
//
// ⛔ SPEED IS THE AMRAP'S STOP RULE, NOT A SEPARATE SIGNAL. Wendler ends the "+" set on form
// breakdown — bar path, depth, brace, lockout, control — and speed is the earliest of those to go.
// Michael, 2026-07-25: *"slow rep = last rep. That's the AMRAP terminator and the whole doctrine in
// four words."*
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
  // ⛔ NO REP-CHASING LINE ANYWHERE NEAR A PRESCRIBED SET.
  work_set: 'Every rep at the same speed as the first.',
  amrap: 'Slow rep = last rep.',
  rest: "Rest until the speed's back.",
  deload: 'Nothing to prove. Move it fast anyway.',
  // The gate announces itself BEFORE the unrack, not after. It is the one set in the cycle whose
  // rep count changes the plan, and an athlete who finds that out afterwards was not given the
  // chance to treat it as the measurement it is.
  validity_set: 'Five at ninety-five. This one decides the number.',
};

/** The AMRAP's closing line — shown after the set, where `amrap` is shown before/during. */
export const BAR_SPEED_AMRAP_AFTER = 'Stop when it slows, not when it fails.';

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
