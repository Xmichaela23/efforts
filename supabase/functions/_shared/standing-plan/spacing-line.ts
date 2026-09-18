/**
 * ═══ TODAY'S TWO SCHEDULING SENTENCES, COMPOSED ON THE SERVER ═══════════════════════════════════
 *
 * ⛔ MOVED FROM THE PHONE 2026-09-18 (the Stage C follow-up). It was `spacingLineFor` in
 * `src/lib/today-lines.ts`, run by Today over whatever rows it held. `get-week` now sends one per date
 * (`spacing_lines`), built from the day's own sessions, and the phone prints it.
 *
 * ⛔ A SENTENCE PRINTS ONLY WHERE A PAGE STATES THE RULE. Every sentence below carries its page, read
 * off the page photograph (book-sources/viada-hybrid-athlete). The old code cited p144 for rule 5 and
 * p145 for rule 6; both rules are on p143 (p144 is rule 7, p145 rules 8 and 9).
 *
 * THE DAY IS READ OFF ITS SESSIONS, NEVER THEIR NAMES:
 *   · the lift — which region (the frame's upper day, a lower day, or a day with no frame tag: test week,
 *     plyometrics) and which intents its rows carry (ME / DE / SKILL / HYP, `slot_intent`);
 *   · the endurance session — run, ride or swim (`sport:`), and how hard (`band:`).
 *
 * THE SENTENCES AND THEIR PAGES:
 *   lead    "Two sessions today. Keep them six to eight hours apart."
 *           p143 rule 6: "allow at least 6 to 8 hours with one full meal before the resistance training session".
 *   ⛔ "If they have to be closer", the heading that stood over the next line, CAME OFF 2026-09-18: it states no
 *   rule and no page prints it (Michael: "any sentence with no page comes off"). The closer opens from a chevron.
 *   easy    "Lift first and keep the {run|ride} easy."
 *           p143 rule 5: work that benefits from pre-fatigue (almost always VT1 work) goes last, "after these
 *           muscles have already been worked". Only when the endurance session is VT1 or easier AND the lift
 *           worked the legs — ⛔ NOT ON THE FRAME'S UPPER DAY: the run's muscles were not worked, so the rule
 *           says nothing about the order (changed 2026-09-18; the phone printed it on upper days).
 *   order   "Lift first."
 *           p143 rule 6: "the skill movements are focused on the first session because you may be 'fresher'";
 *           p77: minimally fatigued prior to and during strength movement practice; p140 rule 2a: "all that
 *           matters is that you need to be fresh for it". Only when the lift has skill or speed sets and is not
 *           the upper day.
 *   cost    "{Running|Riding} first costs the lift its skill and speed sets."
 *           p143 rule 6, p77, p140 rule 2a. Same condition as `order`. On the upper day riding or running costs the
 *           legs, not the bench (p131: the physical systems the session taxes).
 *
 * ⛔ A SILENCE IS AN ANSWER: a swim day gets the lead only (no swim wording approved); a day where neither `easy`
 * nor `cost` holds gets the lead only, and the chevron is not drawn.
 */

export type SpacingRow = {
  type?: string | null;
  tags?: unknown;
  training_plan_id?: string | null;
  strength_exercises?: unknown;
};

export type SpacingLine = { lead: string; closer?: string };

const tagsOf = (row: SpacingRow | null | undefined): string[] =>
  Array.isArray(row?.tags) ? (row!.tags as unknown[]).map((t) => String(t).toLowerCase()) : [];

const tagValue = (row: SpacingRow | null | undefined, prefix: string): string | null => {
  const hit = tagsOf(row).find((t) => t.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
};

const sportOf = (row: SpacingRow | null | undefined): string | null => {
  const tag = tagValue(row, 'sport');
  if (tag) return tag;
  const t = String(row?.type ?? '').toLowerCase();
  if (t === 'run' || t === 'ride' || t === 'swim') return t;
  if (t === 'bike' || t === 'cycling') return 'ride';
  return null;
};

const isStrength = (row: SpacingRow | null | undefined): boolean => String(row?.type ?? '').toLowerCase() === 'strength';
const isEndurance = (row: SpacingRow | null | undefined): boolean => {
  const s = sportOf(row);
  return s === 'run' || s === 'ride' || s === 'swim';
};
/** From the plan, not something the athlete brought in (Garmin / Strava / typed). */
const isFromPlan = (row: SpacingRow | null | undefined): boolean =>
  typeof row?.training_plan_id === 'string' && row.training_plan_id.length > 0;

const intentsOf = (row: SpacingRow): Set<string> => {
  const rows = Array.isArray(row.strength_exercises) ? (row.strength_exercises as Array<{ slot_intent?: unknown }>) : [];
  return new Set(rows.map((r) => String(r?.slot_intent ?? '').toUpperCase()).filter(Boolean));
};

/**
 * The frame's upper day: a `frame:` tag and no `lower:` tag (`compose.ts` gives it `region: 'upper'` by the same
 * rule). Test-week and plyometric rows carry no `frame:` tag and count as working the legs.
 */
const isUpperDay = (lift: SpacingRow): boolean => tagValue(lift, 'frame') != null && tagValue(lift, 'lower') == null;

// Viada p143 rule 6.
const LEAD = 'Two sessions today. Keep them six to eight hours apart.';

export function spacingLineFor(rows: readonly SpacingRow[]): SpacingLine | null {
  const planned = rows.filter(isFromPlan);
  if (planned.length !== 2) return null;
  const lift = planned.find(isStrength);
  const endurance = planned.find((r) => !isStrength(r) && isEndurance(r));
  if (!lift || !endurance) return null;

  const sport = sportOf(endurance);
  if (sport !== 'run' && sport !== 'ride') return { lead: LEAD };

  const upper = isUpperDay(lift);
  const intents = intentsOf(lift);
  // ⚠️ AN UNKNOWN BAND COUNTS AS NOT EASY: the claim needs the page, not the absence of a tag.
  const easy = tagValue(endurance, 'band') === 'vt1_or_easier' && !upper;
  const costs = !upper && (intents.has('SKILL') || intents.has('DE'));
  if (!easy && !costs) return { lead: LEAD };

  // Viada p143 rule 5 (the easy clause), p143 rule 6 and p77 (the order).
  const first = easy ? `Lift first and keep the ${sport} easy.` : 'Lift first.';
  // Viada p143 rule 6, p77, p140 rule 2a.
  const cost = `${sport === 'run' ? 'Running' : 'Riding'} first costs the lift its skill and speed sets.`;
  return { lead: LEAD, closer: costs ? `${first} ${cost}` : first };
}
