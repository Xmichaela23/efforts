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
    objective: 'Move maximal or near-maximal weight. An intentionally heavy set focused on peak force '
      + 'per rep. Bar speed still matters but is secondary to moving the weight well. Each set stops '
      + 'short of failure — technical breakdown here is counterproductive.',
    cite: 'Viada p218, p219',
  },
  DE: {
    intent: 'DE',
    reps: { lo: 2, hi: 4 },
    pctOf1RM: { lo: 0.70, hi: 0.80 },
    rir: { lo: 3, hi: 4 },
    setsBand: { lo: 4, hi: 6 },
    tempo: 'Maximum velocity.',
    objective: 'Bar speed and quality of movement. Velocity and a consistent bar path are the '
      + 'objectives; treat every rep as though the bar were loaded to a maximum. Fatigue is discouraged.',
    cite: 'Viada p218, p219',
  },
  SKILL: {
    intent: 'SKILL',
    reps: { lo: 3, hi: 5 },
    pctOf1RM: { lo: 0.75, hi: 0.85 },
    rir: { lo: 3, hi: 4 },
    setsBand: { lo: 3, hi: 5 },
    tempo: 'Controlled eccentric, fast concentric.',
    objective: 'Purely patterning and movement practice. Heavy enough to be a challenge, but form '
      + 'and consistency take priority over velocity.',
    cite: 'Viada p218, p219',
  },
  HYP: {
    intent: 'HYP',
    reps: { lo: 6, hi: 12 },
    // ⛔ HE GIVES NO PERCENTAGE FOR HYP, and none is supplied. The RIR is the load rule here.
    pctOf1RM: null,
    rir: { lo: 0, hi: 2 },
    setsBand: { lo: 3, hi: 4 },
    tempo: 'Controlled eccentric, controlled concentric.',
    objective: 'Standard bodybuilding-style work. Maximum motor-unit recruitment is the goal; steady '
      + 'tempo, controlled yet powerful. Fatigue is not the enemy — reps inevitably slow as fast-twitch '
      + 'fibres tire and fatigue-resistant fibres engage, and that is desirable.',
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
  // ⛔ 2026-09-18 (no paraphrasing): p78's own words, cut — "Rest periods between sets should be sufficient
  // to allow nearly full recovery (though not so long as to allow you to cool down)" and "…In other words,
  // hit the next set when you know you can complete it without getting crushed."
  cue: 'Rest periods between sets should be sufficient to allow nearly full recovery (though not so long as '
    + 'to allow you to cool down). Hit the next set when you know you can complete it without getting crushed.',
  /** ⛔ WHY ANY CLOCK BESIDE IT IS OURS. */
  provenance: 'A strength session should not accumulate fatigue. The source gives this as a rule '
    + 'and no number of minutes.',
} as const;

/**
 * The same question for HYP, which p84 answers in the opposite direction. Kept separate so no
 * caller can stamp the strength rule on a hypertrophy slot by accident.
 */
export const REST_BETWEEN_SETS_RULE_HYP = {
  // ⛔ 2026-09-18: p84's sentence whole. "Shorter rest on purpose" is on no page, and the old line dropped the
  // page's hedge "may well be".
  cue: 'Strength and power training typically dictate that this point of reduced capacity represents the end '
    + 'of a productive session, but in hypertrophy training, this may well be a crucial part of the training '
    + 'session itself!',
  provenance: 'The source gives this as a rule and no number of minutes.',
} as const;

/** RIR, defined on p219 — carried so a surface can explain the number rather than just print it. */
export const RIR_NOTE =
  'Reps in reserve. A 2 RIR set stops with two reps left in the tank. 0 RIR is not failure: the last '
  + 'rep still completes, though very slowly.';

/**
 * ⛔⛔ THE ATHLETE-FACING LINE FOR EACH INTENT — ONE OWNER (book-language fix, 2026-09-18).
 *
 * Every screen that says what an ME / DE / SKILL / HYP set is prints this and nothing else: the
 * logger's set-type sheet, the logger's line above the accessory cards, the logger's ME card, the
 * Today card, and the plan builder. The phone kept four copies of its own, with three different
 * answers for HYP (`8 to 12` / `6-12` / `8 to 10` reps; `1 to 2` / `1` / `a rep or two` in reserve).
 *
 * ⛔ THE RULE (Michael, 2026-09-18): the book's numbers, and the book's words only where
 * `docs/SOURCE-viada-hybrid-athlete.md` quotes them. Cut, never reworded.
 *   · The reps and the reserve are p218's numbers, read off `BARBELL` above — never retyped.
 *   · ME has no reserve: p218 gives "no RIR target".
 *   · SKILL carries two quoted sentences:
 *       p76  *"…every rep either improves movement quality or degrades it!"* (cut at the front)
 *       p143 *"Perfect practice makes perfect… if you're performing the movement poorly, STOP."*
 *   · p218's tempo clauses and p219's meanings are NOT quoted in the SOURCE doc (only in its tables
 *     and summaries), so no clause from them prints.
 */
const INTENT_QUOTES: Partial<Record<ViadaIntent, string[]>> = {
  SKILL: [
    'Every rep either improves movement quality or degrades it!', // p76
    "Perfect practice makes perfect… if you're performing the movement poorly, STOP.", // p143
  ],
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
 * The line itself — p218's row, in the page's order: reps, percent, reserve, sets (pass 5 of the fix added
 * the percent and the set band, which the page gives and no screen printed). Then SKILL's two quotes.
 *   ME    "1 to 5 reps, 90 to 100%, 1 to 3 sets."
 *   DE    "2 to 4 reps, 70 to 80%, 3 to 4 in reserve, 4 to 6 sets."
 *   SKILL "3 to 5 reps, 75 to 85%, 3 to 4 in reserve, 3 to 5 sets. Every rep… STOP."
 *   HYP   "6 to 12 reps, 0 to 2 in reserve, 3 to 4 sets."   (p218 gives HYP no percent)
 */
export function intentLine(intent: string | null | undefined): string | null {
  const k = String(intent ?? '').toUpperCase() as ViadaIntent;
  const p = BARBELL[k];
  if (!p) return null;
  const band = (r: Range) => (r.lo === r.hi ? String(r.lo) : `${r.lo} to ${r.hi}`);
  const rir = rirBandText(k);
  const parts = [
    `${band(p.reps)} reps`,
    ...(p.pctOf1RM ? [`${band({ lo: Math.round(p.pctOf1RM.lo * 100), hi: Math.round(p.pctOf1RM.hi * 100) })}%`] : []),
    ...(rir ? [`${rir} in reserve`] : []),
    `${band(p.setsBand)} sets`,
  ];
  return [`${parts.join(', ')}.`, ...(INTENT_QUOTES[k] ?? [])].join(' '); // p218
}

/**
 * p218's first sentence, quoted in the SOURCE doc (Part J6). The set band's own rule, printed once — on the
 * logger's set-type sheet, beside the band.
 */
export const SETS_START_LOW_LINE = 'Sets should always remain on the lower end when starting a program, increasing only '
  + 'if an athlete is finding that they are progressing well and seem to have recovery to spare!';

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
