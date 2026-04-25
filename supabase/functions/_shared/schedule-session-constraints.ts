/**
 * Authoritative session taxonomy + fatigue for arc-setup and future schedulers.
 * Same-day matrix matches product rulebook (screenshot / constraint spec 2026-04).
 */

export const SESSION_FATIGUE = {
  long_ride: 'HIGH' as const,
  long_run: 'HIGH' as const,
  quality_bike: 'HIGH' as const,
  quality_run: 'HIGH' as const,
  brick: 'HIGH' as const,
  lower_body_strength: 'HIGH' as const,
  quality_swim: 'MODERATE' as const,
  upper_body_strength: 'MODERATE' as const,
  easy_bike: 'LOW' as const,
  easy_run: 'LOW' as const,
  easy_swim: 'LOW' as const,
} as const;

/** Includes brick + quality_swim (not rows in the 9×9 same-day matrix). */
export type SessionFatigueId = keyof typeof SESSION_FATIGUE;

/** All keys used in the same-day matrix (9 session roles). */
/** Nine roles in the same-day matrix (quality_swim is gated by text rules + experience). */
export const SESSION_KINDS = [
  'easy_bike',
  'easy_run',
  'easy_swim',
  'quality_bike',
  'quality_run',
  'long_ride',
  'long_run',
  'lower_body_strength',
  'upper_body_strength',
] as const;

export type MatrixSessionKind = (typeof SESSION_KINDS)[number];

/**
 * true = may share the same calendar day (strict / completion default).
 * Symmetric. Source: product 9×9 matrix (Apr 2026); `easy_run` does not pair with
 * `lower_body_strength` or `upper_body_strength` (screenshot).
 * ✓/✗ encoded as 1/0 rows [easy_bike, easy_run, easy_swim, quality_bike, quality_run, long_ride, long_run, lower_body, upper_body]
 */
const ROWS: Record<MatrixSessionKind, number[]> = {
  easy_bike:            [1, 1, 1, 0, 1, 0, 0, 1, 1],
  easy_run:             [1, 1, 1, 1, 0, 0, 0, 0, 0],
  easy_swim:            [1, 1, 1, 1, 1, 0, 0, 1, 1],
  quality_bike:         [0, 1, 1, 0, 0, 0, 0, 0, 1],
  quality_run:          [1, 0, 1, 0, 0, 0, 0, 0, 1],
  long_ride:            [0, 0, 0, 0, 0, 1, 0, 0, 0],
  long_run:             [0, 0, 0, 0, 0, 0, 1, 0, 0],
  lower_body_strength:  [1, 0, 1, 0, 0, 0, 0, 0, 1],
  upper_body_strength:  [1, 0, 1, 1, 1, 0, 0, 1, 1],
};

function buildSameDayMatrix(): Record<MatrixSessionKind, Record<MatrixSessionKind, boolean>> {
  const m = {} as Record<MatrixSessionKind, Record<MatrixSessionKind, boolean>>;
  for (const row of SESSION_KINDS) {
    m[row] = {} as Record<MatrixSessionKind, boolean>;
    const bits = ROWS[row];
    SESSION_KINDS.forEach((col, j) => {
      m[row][col] = bits[j] === 1;
    });
  }
  return m;
}

export const SAME_DAY_COMPATIBLE: Record<
  MatrixSessionKind,
  Record<MatrixSessionKind, boolean>
> = buildSameDayMatrix();

export function areSameDayCompatible(a: MatrixSessionKind, b: MatrixSessionKind): boolean {
  return !!SAME_DAY_COMPATIBLE[a]?.[b];
}

/** Markdown table for system prompts (9×9). */
export function formatSameDayMatrixMarkdown(): string {
  const header =
    '|  | ' +
    SESSION_KINDS.join(' | ') +
    ' |\n|' +
    '---|'.repeat(SESSION_KINDS.length + 1) +
    '\n';
  const lines = SESSION_KINDS.map(
    (row) =>
      '| **' +
      row +
      '** | ' +
      SESSION_KINDS.map((c) => (SAME_DAY_COMPATIBLE[row][c] ? '✓' : '✗')).join(' | ') +
      ' |',
  );
  return header + lines.join('\n');
}

export const SEQUENTIAL_RULES_TEXT = [
  'After long_ride → the next day must be LOW fatigue only (easy_bike, easy_run, easy_swim) or complete rest — no quality, no long, no brick, no lower_body_strength.',
  'After long_run → same: next day LOW only or rest.',
  'After lower_body_strength → 48 hours before the next lower_body_strength, quality_run, or long_run; keep spacing from long_ride and quality_bike per recovery.',
  'After quality_bike → next calendar day: no quality_bike and no quality_run.',
  'After quality_run → next day: no quality_run and no quality_bike.',
].join('\n');

export const STRENGTH_FREQUENCY_RULES_TEXT = [
  '2×/week: minimum 3 days between sessions. Valid: Mon+Thu, Mon+Fri, Tue+Fri, Tue+Sat. Invalid: Mon+Tue, Mon+Wed, Tue+Wed.',
  '3×/week: minimum 2 days apart; alternate upper/lower. Valid: Mon+Wed+Fri, Tue+Thu+Sat. Invalid: Mon+Tue+Wed (consecutive).',
  '3× split examples: (A) Mon lower, Wed upper, Fri lower; (B) Mon upper, Wed lower, Fri upper. If Wednesday is quality_bike, Wednesday must be upper-only strength.',
].join('\n');

export const PLACEMENT_ALGORITHM_TEXT = [
  '1) Place anchors first: long_ride (default Saturday), long_run (default Sunday), race days (fixed dates).',
  '2) Place quality: quality_bike (e.g. Tuesday or group-ride day), quality_run (e.g. Thursday), quality_swim (separate from conflicting quality_run unless EXPERIENCE MODIFIER allows).',
  '3) Place easy: easy_bike, easy_run, easy_swim around hard days.',
  '4) Place strength: for each candidate day, require SAME_DAY_COMPATIBLE with everything already on that day; enforce SEQUENTIAL_RULES; enforce STRENGTH_FREQUENCY rules; pick the first valid day(s). Propose a resolution — do not ask the athlete to arbitrate schedule conflicts.',
  '5) Validate the full week: if anything conflicts, adjust silently until the week passes all gates; only then present. One confirmation question at most.',
].join('\n');

export const EXPERIENCE_MODIFIER_TEXT = [
  'Performance (training_intent performance, or experienced prior 70.3+): may allow quality_swim + quality_run same day with AM/PM split; may allow upper_body_strength + quality_bike same day when the matrix would otherwise be strict on doubles.',
  'Completion / first_race: apply the matrix strictly; separate quality modalities onto different days; no same-day exceptions unless explicitly confirmed for doubles.',
].join('\n');

export const AL_BEHAVIOR_TEXT = [
  'Before proposing any week: (1) run every day through the same-day matrix; (2) check sequential rules; (3) check strength spacing; (4) if conflicts exist, re-place using the placement algorithm; (5) present one conflict-free week in plain prose; (6) at most one confirmation question.',
  'Never show a week that still violates the matrix. Never ask the athlete to fix a scheduling conflict. Do not recite the rulebook — apply it.',
].join('\n');
