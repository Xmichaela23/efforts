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
      body:
        `This block uses sub-maximal loading (Wendler's 5/3/1) to manage fatigue, making it the most ` +
        `sustainable approach to build structural strength while maintaining an aerobic base. Four ` +
        `lifting days: bench Monday, squat Tuesday, overhead press Thursday, deadlift Friday. ` +
        `${leaders} building cycle${leaders === 1 ? '' : 's'}, then one measuring cycle from week ` +
        `${anchorStart}, each ending in a deload week.`,
    },
    {
      heading: 'The reality check',
      body:
        `Training provides the stimulus, but adaptation happens during recovery. Prioritize how you ` +
        `feel; the math only works if you honor your rest.`,
    },
    {
      heading: "What's next",
      body: `The app will unlock speed and distance blocks once this cycle closes.`,
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
