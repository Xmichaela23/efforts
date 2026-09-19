// ============================================================================
// THE FOUR INTENTS — Viada's numbers, and nothing else.
//
// Source: *The Hybrid Athlete* p218 ("Repetition/Set Guidelines"), p219 ("Abbreviations"), p226
// (the carry vocabulary). Read off the page images, not only the transcription — the tempo clauses
// on SKILL and HYP are on p218 and were missing from `SOURCE-viada-hybrid-athlete.md`.
//
// ⛔ THIS IS A SET-LOADING SCHEME FOR ONE MOVEMENT. It is NOT the same axis as `StrengthIntent` in
// `shared/strength-system/protocols/intent-taxonomy.ts`, which names a whole SESSION (`LOWER_NEURAL`,
// `UPPER_STRENGTH`, `FULLBODY_MAINTENANCE`). A `LOWER_NEURAL` day CONTAINS an ME slot and several HYP
// slots. The two compose; they do not compete, and merging them would make `isLowerIntent()` return
// nonsense for half its union. See the module header in `taxonomy.ts`.
//
// ⛔ TWO VOCABULARIES SHARE THESE FOUR NAMES AND MEAN DIFFERENT THINGS BY THEM. The barbell table
// (p218) and the carry table (p226) both say ME/DE/SKILL/HYP. A carry's ME is "near maximal weight,
// the pick is a challenge, several steps, RPE 9/10" — no rep count, no percentage. Resolving an
// intent without knowing which family the movement is in is the mistake this file is shaped to
// prevent, which is why `prescribe()` takes the category and refuses to answer without it.
//
// ⛔ AND A THIRD VOCABULARY EXISTS AND IS OUT OF SCOPE. Olympic lifting uses HEAVY/REP/SKILL/GROOVE
// (pp224-225). Michael ruled it out on 2026-08-21. It is not built here and must not be.
// ============================================================================

/** ⛔ Viada's per-EXERCISE intent. Not `StrengthIntent` — see the header. */
export type ViadaIntent = 'ME' | 'DE' | 'SKILL' | 'HYP';

export const VIADA_INTENTS: ViadaIntent[] = ['ME', 'DE', 'SKILL', 'HYP'];

export type Range = { lo: number; hi: number };

export type BarbellPrescription = {
  kind: 'barbell';
  intent: ViadaIntent;
  reps: Range;
  /** Percent of 1RM, as a fraction. `null` where he states none — HYP carries no percentage. */
  pctOf1RM: Range | null;
  /** Reps in reserve. `null` for ME, where he states "no RIR target" outright. */
  rir: Range | null;
  /** How many sets this slot gets. See {@link setsFor} — his instruction is to start at the low end. */
  sets: number;
  setsBand: Range;
  /** His tempo clause where he gives one. Read off p218. */
  tempo: string | null;
  /** What the intent is FOR, in his terms (p219). */
  objective: string;
  cite: string;
};

export type CarryPrescription = {
  kind: 'carry';
  intent: ViadaIntent;
  /** ⛔ NO REPS AND NO PERCENTAGE. p226 prescribes carries in words; inventing either is forbidden. */
  load: string;
  emphasis: string;
  /** Whether accumulating fatigue is the point, tolerated, or a fault. His words, his distinction. */
  fatigue: 'target' | 'expected' | 'avoid';
  rpe: number | null;
  cite: string;
};

export type Prescription = BarbellPrescription | CarryPrescription;

// ── THE BARBELL TABLE (p218, read off the image) ────────────────────────────────────────────────
//
//   ME:    1 to 5 reps, 90 to 100% (no RIR target), 1 to 3 sets
//   DE:    2 to 4 reps, 70 to 80%, maximum velocity (3 to 4 RIR), 4 to 6 sets
//   SKILL: 3 to 5 reps, 75 to 85%, controlled eccentric, fast concentric (3 to 4 RIR), 3 to 5 sets
//   HYP:   6 to 12 reps, controlled eccentric, controlled concentric (0 to 2 RIR), 3 to 4 sets

const BARBELL: Record<ViadaIntent, Omit<BarbellPrescription, 'kind' | 'sets'>> = {
  ME: {
    intent: 'ME',
    reps: { lo: 1, hi: 5 },
    pctOf1RM: { lo: 0.90, hi: 1.00 },
    // ⛔ NULL, NOT ZERO. p218 says "no RIR target" in as many words. A 0 here would read as "0 RIR",
    // which p219 defines as a real and specific thing — the last rep still completes, very slowly.
    // Those are opposite instructions.
    rir: null,
    setsBand: { lo: 1, hi: 3 },
    tempo: null,
    // p219's own words, cut (2026-09-18 rule 7 triage; the reworded line that stood here never printed — `objective` has no reader outside tests)
    objective: 'ME, or maximum effort, is a movement designed to improve your ability to move maximal or near maximal weight.', // p219
    cite: 'Viada p218, p219',
  },
  DE: {
    intent: 'DE',
    reps: { lo: 2, hi: 4 },
    pctOf1RM: { lo: 0.70, hi: 0.80 },
    rir: { lo: 3, hi: 4 },
    setsBand: { lo: 4, hi: 6 },
    tempo: 'Maximum velocity.',  // p218 — the DE row's words
    objective: 'DE, or dynamic effort sets, should have an emphasis on bar speed and quality of movement.', // p219
    cite: 'Viada p218, p219',
  },
  SKILL: {
    intent: 'SKILL',
    reps: { lo: 3, hi: 5 },
    pctOf1RM: { lo: 0.75, hi: 0.85 },
    rir: { lo: 3, hi: 4 },
    setsBand: { lo: 3, hi: 5 },
    tempo: 'Controlled eccentric, fast concentric.',  // p218 — the SKILL row's words
    objective: 'SKILL work is somewhat unique in that the objective is purely patterning and movement practice.', // p219
    cite: 'Viada p218, p219',
  },
  HYP: {
    intent: 'HYP',
    reps: { lo: 6, hi: 12 },
    // ⛔ HE GIVES NO PERCENTAGE FOR HYP, and none is supplied. The RIR is the load rule here.
    pctOf1RM: null,
    rir: { lo: 0, hi: 2 },
    setsBand: { lo: 3, hi: 4 },
    tempo: 'Controlled eccentric, controlled concentric.',  // p218 — the HYP row's words
    objective: 'Maximum motor unit recruitment is the goal, and repetitions should be a steady tempo—controlled yet powerful.', // p219
    cite: 'Viada p218, p219',
  },
};

// ── THE CARRY TABLE (p226) — same four names, different meanings ────────────────────────────────

const CARRY: Record<ViadaIntent, Omit<CarryPrescription, 'kind'>> = {
  ME: {
    intent: 'ME',
    load: 'Near-maximal weight.',
    emphasis: 'The initial pick is a challenge; several steps of movement.',
    fatigue: 'expected',
    rpe: 9,
    cite: 'Viada p226',
  },
  DE: {
    intent: 'DE',
    load: 'Light weight.',
    emphasis: 'Speed and turnover in movement.',
    fatigue: 'expected',
    rpe: null,
    cite: 'Viada p226',
  },
  SKILL: {
    intent: 'SKILL',
    load: 'Medium weight.',
    emphasis: 'Speed and quality, with ample rest.',
    fatigue: 'avoid',
    rpe: null,
    cite: 'Viada p226',
  },
  HYP: {
    intent: 'HYP',
    load: 'Medium weight.',
    emphasis: 'Steady velocity.',
    fatigue: 'target',
    rpe: null,
    cite: 'Viada p226',
  },
};

/**
 * ⛔ SETS START AT THE LOW END. p218, first sentence on the page:
 *
 * > *"Sets should always remain on the lower end when starting a program, increasing only if the
 * > athlete is finding that they are progressing well and seem to have recovery to spare!"*
 *
 * ⚠️ ⛔ **GAP #11 OF THE TWELVE, AND IT IS NOT FILLED HERE.** He gives no rule for WHEN "1 to 3 sets"
 * becomes 2 or 3 — only that condition in words, which no engine can evaluate. `position` exists so
 * a caller who has been told to progress can say so; **absent, it is always the low end**, which is
 * his stated default and the only value this library will produce on its own.
 */
export function setsFor(band: Range, position?: number): number {
  if (position == null) return band.lo;
  const t = Math.min(1, Math.max(0, position));
  return Math.round(band.lo + (band.hi - band.lo) * t);
}

/**
 * ⛔ REST BETWEEN SETS **IS** STATED — AS A RULE, NOT A NUMBER. p78, section "Rest Periods".
 *
 * ⚠️ **THIS REPLACES A CONSTANT THAT ASSERTED THE OPPOSITE.** Until 2026-08-27 this file shipped
 * `REST_BETWEEN_SETS_NOT_STATED`, which called this "gap #10 of the twelve" and named the 6-8
 * minute PAP figure as the book's only rest guidance. **That was false.** p78 was in the
 * unread half of the pp.69-131 re-shoot; it was read on 2026-08-27 and it carries a whole
 * section on the question. Part G item 6 and `SOURCE-viada-hybrid-athlete.md` §B4d record it.
 *
 * > *"Therefore, if you're interested in maximizing strength, you should focus on movement quality
 * > and generally avoid excessive fatigue. Rest periods between sets should be sufficient to allow
 * > nearly full recovery (though not so long as to allow you to cool down), and sets should stop
 * > well before failure, with several reps in reserve."*
 * > *"…Overall, true strength sessions should have very little accumulating fatigue. In other
 * > words, hit the next set when you know you can complete it without getting crushed."*
 *
 * ⛔ **HE GIVES NO MINUTES, ANYWHERE.** The rule is a readiness condition, not a duration. Any
 * clock a surface shows is OURS and must be labelled OURS — this constant supplies the rule the
 * clock is serving, and nothing here may be read as sanctioning a number.
 *
 * ⚠️ **AND IT IS A STRENGTH RULE ONLY.** p84 states the opposite for hypertrophy: *"Strength and
 * power training typically dictate that this point of reduced capacity represents the end of a
 * productive session, but in hypertrophy training, this may well be a crucial part of the training
 * session itself!"* A caller stamping this on a HYP slot is quoting him against himself.
 */
export const REST_BETWEEN_SETS_RULE = {
  /**
   * ⛔ THE INSTRUCTION AN ATHLETE ACTS ON, MID-SESSION — and it is split out so the rest timer can
   * print it beside its countdown without also printing the provenance clause, which is a sentence
   * for whoever maintains the number and not for someone standing under a bar.
   * ⚠️ ONE OWNER. The timer imports this; it does not carry its own wording (2026-08-27).
   */
  // ⛔ p78, reworded (Michael approved the words 2026-09-19); the page: "Rest periods between sets should be sufficient
  // to allow nearly full recovery (though not so long as to allow you to cool down)" and "…In other words,
  // hit the next set when you know you can complete it without getting crushed."
  cue: 'Rest between sets should allow almost full recovery, but not be so long that you cool down. '
    + 'Start the next set when you are sure you can finish it.',
  // ⛔ `provenance` ("A strength session should not accumulate fatigue. The source gives this as a rule and no number
  // of minutes.") DELETED 2026-09-18 (rule 7 triage): nothing read it — every caller reads `.cue`.
} as const;

/**
 * The same question for HYP, which p84 answers in the opposite direction. Kept separate so no
 * caller can stamp the strength rule on a hypertrophy slot by accident.
 */
export const REST_BETWEEN_SETS_RULE_HYP = {
  // ⛔ p84, reworded (Michael approved the words 2026-09-19); the page: "Strength and power training typically dictate
  // that this point of reduced capacity represents the end of a productive session, but in hypertrophy training, this
  // may well be a crucial part of the training session itself!"
  cue: 'In strength and power training this point of reduced capacity usually marks the end of a productive session, '
    + 'but in hypertrophy training it may be a central part of the session.',
  // ⛔ `provenance` DELETED 2026-09-18 (rule 7 triage): nothing read it — every caller reads `.cue`.
} as const;

/** RIR, defined on p219 — carried so a surface can explain the number rather than just print it. */
// ⛔ p219, reworded (Michael approved the words 2026-09-19); the page: "RIR refers to "reps in reserve (before
// failure)." It's important to note, therefore, that 0 RIR is not failure but refers to a set where you'd still
// complete the final repetition (even though it would be very slow)."
export const RIR_NOTE =
  'RIR means reps in reserve before failure. So 0 RIR is not failure: it is a set where the last rep still gets '
  + 'completed, though very slowly.';

/**
 * ⛔⛔ THE ATHLETE-FACING LINE FOR EACH INTENT — ONE OWNER (book-language fix, 2026-09-18).
 *
 * Every screen that says what an ME / DE / SKILL / HYP set is prints this and nothing else: the
 * logger's set-type sheet, the logger's line above the accessory cards, the logger's ME card, the
 * Today card, and the plan builder. The phone kept four copies of its own, with three different
 * answers for HYP (`8 to 12` / `6-12` / `8 to 10` reps; `1 to 2` / `1` / `a rep or two` in reserve).
 *
 * ⛔ SUPERSEDED FOR THE SENTENCES 2026-09-19: each sentence below is a rewording of its page that Michael approved word
 * for word (docs/AUDIT-author-sentences-2026-09-19.md); the numbers in `P218_ROW` stay as printed.
 * ⛔ THE RULE (Michael, 2026-09-18): the book's words and numbers, cut, never reworded. Pass 6: the page
 * photos (`Efforts_Local_Folder/book-sources/viada-hybrid-athlete/`) ARE the book, so the lines below are
 * read off `p218.jpg` and `p219.jpg` directly. Pinned against `BARBELL`'s numbers in `strength-grid.test.ts`.
 */

/** p218 "REPETITION/SET GUIDELINES", each row as printed (p218.jpg). */
export const P218_ROW: Record<ViadaIntent, string> = {
  ME: '1 to 5 reps, 90 to 100% (no RIR target), 1 to 3 sets',  // p218
  DE: '2 to 4 reps, 70 to 80%, maximum velocity (3 to 4 RIR), 4 to 6 sets',  // p218
  SKILL: '3 to 5 reps, 75 to 85%, controlled eccentric, fast concentric (3 to 4 RIR), 3 to 5 sets',  // p218
  HYP: '6 to 12 reps, controlled eccentric, controlled concentric (0 to 2 RIR), 3 to 4 sets',  // p218
};

/** p218's tempo words per intent, as printed in the same rows. The logger's row line carries them. */
export const P218_TEMPO: Partial<Record<ViadaIntent, string>> = {
  DE: 'maximum velocity',  // p218
  SKILL: 'controlled eccentric, fast concentric',  // p218
  HYP: 'controlled eccentric, controlled concentric',  // p218
};

/**
 * p219 "Abbreviations", one sentence per intent — the card's line (p219.jpg). Each is a rewording of p219 (Michael
 * approved the words 2026-09-19); the page: ME "Each set should be stopped short of failure because technical/form
 * breakdown here can be counterproductive."; DE "Velocity and consistent bar path are the major objectives."; SKILL
 * "The weight should be heavy enough to be a challenge, but form and consistency take priority over velocity."; HYP
 * "Fatigue is not the enemy because repetitions will inevitably slow as fast-twitch fibers become exhausted."
 * ⚠️ The ME and SKILL sentences are also the last lines of their paragraphs below, which read them from here.
 */
const P219_SENTENCE: Record<ViadaIntent, string> = {
  ME: 'End each set before failure, because a breakdown in technique or form here can be counterproductive.',  // p219, reworded
  DE: 'The main goals are velocity and a consistent bar path.',  // p219, reworded
  SKILL: 'Use a weight heavy enough to challenge you, but form and consistency come before velocity.',  // p219, reworded
  HYP: 'Fatigue is expected: reps will slow as the fast-twitch fibers tire.',  // p219, reworded
};

/**
 * p219 "Abbreviations", each intent's paragraph (p219.jpg), for the logger's set-type sheet. DE adds p218's own
 * paragraph on dynamic effort; SKILL adds the p76 and p141 lines. Every sentence is a rewording of its page that
 * Michael approved word for word (2026-09-19); the page's words:
 *   ME (p219)  "ME, or maximum effort, is a movement designed to improve your ability to move maximal or near maximal
 *              weight. It's typically an intentionally heavy set focused on peak force over the course of each
 *              repetition. Bar speed is still important for this work but is secondary to simply moving the weight well."
 *   DE (p219)  "DE, or dynamic effort sets, should have an emphasis on bar speed and quality of movement. Velocity and
 *              consistent bar path are the major objectives, and you should treat every repetition as though the bar
 *              were loaded to a maximum weight. Fatigue is likewise discouraged because movement quality is paramount."
 *   DE (p218)  "For dynamic effort, while both the load and the rep range are lower, the emphasis on peak output/velocity
 *              should make the movement more challenging than similar skill work. The chief difference here is that
 *              skill work is focused primarily on "movement perfection," whereas DE work should aim for good form (of
 *              course), but with bar speed being the primary objective."
 *   SKILL      p219 "SKILL work is somewhat unique in that the objective is purely patterning and movement practice.";
 *              p76 "Every rep either improves movement quality or degrades it!"; p141 "Perfect practice makes perfect…
 *              if you're performing the movement poorly, STOP." (cited p143 until 2026-09-19; the photo shows p141)
 *   HYP (p219) "HYP refers to hypertrophy work, and these sets are more of the standard "bodybuilding"-style work.
 *              Maximum motor unit recruitment is the goal, and repetitions should be a steady tempo—controlled yet
 *              powerful. Fatigue is not the enemy because repetitions will inevitably slow as fast-twitch fibers become
 *              exhausted, and the fatigue-resistant fibers start to engage heavily. In fact, this is desirable (as
 *              discussed in Chapter 4) because some fatigue of all motor units is practically necessary to ensure
 *              maximum tension in all these units is reached."
 */
const P219_MEANING: Record<ViadaIntent, string[]> = {
  ME: ['ME (maximum effort) is a movement meant to build your ability to lift maximal or near-maximal weight. '
    + 'It is usually a deliberately heavy set aimed at peak force through each rep. '
    + `Bar speed still matters here but comes second to moving the weight well. ${P219_SENTENCE.ME}`],  // p219, reworded
  DE: ['DE (dynamic effort) sets put the emphasis on bar speed and movement quality. The main goals are velocity and '
    + 'a consistent bar path, and each rep is treated as if the bar held a maximum weight. Fatigue is also avoided '
    + 'because movement quality comes first.',  // p219, reworded
    // p218, reworded
    'In dynamic effort the load and rep range are both lower, but the stress on peak output/velocity should make it '
    + 'harder than similar skill work. The main difference is that skill work aims mainly at perfecting the movement, '
    + 'while DE work aims for good form (of course) but makes bar speed the first goal.'],
  SKILL: [`SKILL work is unusual in that its only aim is patterning and movement practice. ${P219_SENTENCE.SKILL}`,  // p219, reworded
    'Each rep makes movement quality either better or worse.', // p76, reworded
    "Only correct practice improves a movement; if you're doing it poorly, stop."], // p141, reworded
  HYP: ['HYP means hypertrophy work; these sets are closer to standard bodybuilding-style training. The goal is '
    + 'maximum motor unit recruitment, with reps at a steady tempo, controlled but powerful. Fatigue is expected: '
    + 'reps will slow as the fast-twitch fibers tire and the fatigue-resistant fibers take on more of the work. '
    + 'This is wanted, because some fatigue of every motor unit is nearly required for all of them to reach maximum '
    + 'tension.'],  // p219, reworded
};

/** p218's reserve band for an intent, or null (ME, and anything not a barbell intent). */
export function rirBandFor(intent: string | null | undefined): Range | null {
  const k = String(intent ?? '').toUpperCase() as ViadaIntent;
  return BARBELL[k]?.rir ?? null;
}

/** `"0 to 2"` — p218's reserve band as printed, or null. The one spelling of a band on every screen. */
export function rirBandText(intent: string | null | undefined): string | null {
  const b = rirBandFor(intent);
  return b ? (b.lo === b.hi ? String(b.lo) : `${b.lo} to ${b.hi}`) : null;
}

/**
 * ⛔⛔ THE ONE RULE FOR JUDGING A LOGGED RESERVE AGAINST THE PLAN (book-language fix, passes 6–7, 2026-09-18).
 *
 * A planned row with a p218 intent is judged against p218's band — DE / SKILL 3 to 4, HYP 0 to 2 — read off the
 * row's `slot_intent`, never off the stamped `target_rir` (the composer stamps the band's midpoint, HYP 1, which
 * is ours). ME carries "no RIR target" (p218): no target at all. A row with no intent keeps its own number
 * (`band: false`); every reader keeps its own old rule for those.
 * ⚠️ WHY THE INTENT: materialize-plan copies planned rows through a whitelist that keeps `slot_intent`.
 * Readers: `longitudinal-signals.ts`, `athlete-snapshot/daily-ledger.ts` + `body-response.ts`,
 * `response-model/weekly.ts` (via coach), `analyze-strength-workout`, `session-detail/strength-slots.ts`.
 */
export type RirTarget = { lo: number; hi: number; band: boolean };

export function rirTargetFor(
  row: { slot_intent?: unknown; target_rir?: unknown; rir?: unknown } | null | undefined,
  fallback?: number | null,
): RirTarget | null {
  const intent = String(row?.slot_intent ?? '').toUpperCase();
  if (intent === 'ME') return null; // p218: "no RIR target"
  const b = rirBandFor(intent);
  if (b) return { lo: b.lo, hi: b.hi, band: true };
  const n = typeof row?.target_rir === 'number' ? row.target_rir
    : typeof row?.target_rir === 'string' && row.target_rir.trim() && Number.isFinite(Number(row.target_rir)) ? Number(row.target_rir)
    : typeof row?.rir === 'number' ? row.rir
    : fallback ?? null;
  return n == null || !Number.isFinite(n) ? null : { lo: n, hi: n, band: false };
}

/** How far a logged reserve sits off the target: 0 inside a band, negative under it, positive over it. */
export function rirOffTarget(logged: number, t: RirTarget): number {
  if (logged < t.lo) return logged - t.lo;
  if (logged > t.hi) return logged - t.hi;
  return 0;
}

/** The target as printed: `0 to 2` for a band, the number otherwise. */
export function rirTargetText(t: RirTarget | null | undefined): string | null {
  if (!t) return null;
  return t.lo === t.hi ? String(t.lo) : `${t.lo} to ${t.hi}`;
}

/**
 * The card's line: p218's row as printed, then p219's sentence for the intent.
 *   HYP "6 to 12 reps, controlled eccentric, controlled concentric (0 to 2 RIR), 3 to 4 sets. Fatigue is not
 *        the enemy because repetitions will inevitably slow as fast-twitch fibers become exhausted."
 */
export function intentLine(intent: string | null | undefined): string | null {
  const k = String(intent ?? '').toUpperCase() as ViadaIntent;
  if (!P218_ROW[k]) return null;
  return `${P218_ROW[k]}. ${P219_SENTENCE[k]}`; // p218, p219
}

/** The set-type sheet's paragraphs: p218's row, then p219's paragraph (and the extra quotes above). */
export function intentMeaning(intent: string | null | undefined): string[] {
  const k = String(intent ?? '').toUpperCase() as ViadaIntent;
  if (!P218_ROW[k]) return [];
  return [`${P218_ROW[k]}.`, ...P219_MEANING[k]];
}

/**
 * p218's first sentence, reworded (Michael approved the words 2026-09-19); the page, quoted in the SOURCE doc (Part J6):
 * "Sets should always remain on the lower end when starting a program, increasing only if an athlete is finding that
 * they are progressing well and seem to have recovery to spare!" The set band's own rule, printed once — on the
 * logger's set-type sheet, beside the band.
 */
export const SETS_START_LOW_LINE = 'Sets should stay at the low end when a program starts, rising only '
  + 'if the athlete is progressing well and seems to have recovery left over.';

/**
 * ⛔ THE RANGE BESIDE THE REST TIMER (round 4, 2026-09-18, Michael approved). The timer on a plan row counts UP from
 * 0:00 — it has no starting or target number — and the book's rest sentence (p78 / p84, `restRuleFor`) prints
 * beside it for every intent. Beside it too, a range, for the two intents a field source covers:
 *   FIELD — NSCA Trainer Tips: Hypertrophy (2016),
 *   https://www.nsca.com/contentassets/d27e2ba7e56949229d3eb1aaef7ddcfa/trainertips_hypertrophy_201601.pdf —
 *   hypertrophy: "multiple sets with moderate loads (6-12 reps, 65-85% 1RM) and rest periods (60 seconds)",
 *   compared to "heavy loads (1-5 reps, >85% 1RM) with long rest periods (2-5 minutes)".
 * ME (p218's 1-5 heavy sets) takes the heavy range and HYP (6-12) the hypertrophy one. DE and SKILL get no range:
 * the NSCA page does not cover them, so their timer carries the book's sentence only.
 * Ledger: docs/STATE-SOURCES.md, row "Rest timer on a plan row".
 */
export const REST_RANGE_LABEL: Partial<Record<'ME' | 'HYP', string>> = {
  // device-instruction: the label beside the count-up rest timer; FIELD — NSCA Trainer Tips: Hypertrophy (2016), heavy loads "long rest periods (2-5 minutes)"; no book page gives minutes
  ME: '2–5 min',
  // device-instruction: the label beside the count-up rest timer; FIELD — NSCA Trainer Tips: Hypertrophy (2016), hypertrophy "rest periods (60 seconds)"; no book page gives minutes
  HYP: '60 s',
};

/** The range beside the rest timer for an intent (`REST_RANGE_LABEL`), or null — DE, SKILL and anything else. */
export function restRangeLabelFor(intent: string | null | undefined): string | null {
  const k = String(intent ?? '').toUpperCase();
  return k === 'ME' || k === 'HYP' ? REST_RANGE_LABEL[k] ?? null : null;
}

/** The page's rest rule for an intent: p84 for HYP, p78 for the other three. Null for anything else. */
export function restRuleFor(intent: string | null | undefined): string | null {
  const k = String(intent ?? '').toUpperCase();
  if (k === 'HYP') return REST_BETWEEN_SETS_RULE_HYP.cue;
  return k === 'ME' || k === 'DE' || k === 'SKILL' ? REST_BETWEEN_SETS_RULE.cue : null;
}

/**
 * The prescription for one slot.
 *
 * ⛔ THE CATEGORY IS REQUIRED, and that is the point of the signature. p226's carry intents share
 * their four names with p218's barbell intents and mean different things by them; answering without
 * knowing the family is how the wrong table gets read.
 */
export function prescribe(
  intent: ViadaIntent,
  family: 'barbell' | 'carry',
  setPosition?: number,
): Prescription {
  if (family === 'carry') return { kind: 'carry', ...CARRY[intent] };
  const base = BARBELL[intent];
  return { kind: 'barbell', ...base, sets: setsFor(base.setsBand, setPosition) };
}
