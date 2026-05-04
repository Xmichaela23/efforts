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

/** Includes brick + `quality_swim` (both have fatigue tiers; `quality_swim` is a full matrix row). */
export type SessionFatigueId = keyof typeof SESSION_FATIGUE;

/** Matrix session roles (10×10): `quality_swim` is its own row — not aliased to `easy_swim`. */
export const SESSION_KINDS = [
  'easy_bike',
  'easy_run',
  'easy_swim',
  'quality_swim',
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
 * Symmetric. Source: product matrix (Apr 2026); extended with dedicated `quality_swim` row
 * so `quality_run` × `quality_swim` is ✗ by default (was wrongly ✓ via `easy_swim` alias).
 * ✓/✗ rows: [easy_bike, easy_run, easy_swim, quality_swim, quality_bike, quality_run, long_ride, long_run, lower_body, upper_body]
 */
const ROWS: Record<MatrixSessionKind, number[]> = {
  easy_bike:            [1, 1, 1, 1, 0, 1, 0, 0, 1, 1],
  easy_run:             [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  easy_swim:            [1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
  quality_swim:         [1, 1, 1, 1, 1, 0, 0, 0, 1, 1],
  quality_bike:         [0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
  quality_run:          [1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  long_ride:            [0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  long_run:             [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  lower_body_strength:  [1, 0, 1, 1, 0, 0, 0, 0, 0, 1],
  upper_body_strength:  [1, 0, 1, 1, 1, 1, 0, 0, 1, 1],
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

/** Same-day roles: full matrix kinds plus synthetic race slot for pairwise checks. */
export type ScheduleSlotKind = MatrixSessionKind | 'race_event';

/**
 * Map non-matrix slots to a matrix row for lookup. `race_event` uses `easy_run` pairings
 * (race day clears the calendar — bracketed as compatible elsewhere).
 */
function matrixRowForSlot(k: ScheduleSlotKind): MatrixSessionKind {
  return k === 'race_event' ? 'easy_run' : k;
}

/**
 * Optional overrides for the strict matrix (server-only; defaults maintain completion-safe rules).
 * `allowQualityRunQualitySwimSameDay`: training_intent or strength_intent performance — AM/PM split per EXPERIENCE_MODIFIER.
 *
 * **Bar for new flags:** (1) Must reflect an explicit product / EXPERIENCE_MODIFIER rule, not ad hoc convenience.
 * (2) Default path stays strict-matrix / completion-safe; opt-in only via persisted athlete intent (or equivalent).
 * (3) Implement as “after matrix says no” — document the pairing and keep symmetric with the rule text.
 * (4) Thread the same ctx through `week-builder` grid validation and `week-optimizer` `canPlaceWithModifier`.
 * (5) Prefer structural fixes (e.g. day bump before placement) when that fully solves the case without eroding the matrix.
 */
export type SameDayCompatContext = {
  allowQualityRunQualitySwimSameDay?: boolean;
};

/** Pairwise same-day check for engine + arc (includes `quality_swim` row + race). */
export function areScheduleSlotsCompatible(
  a: ScheduleSlotKind,
  b: ScheduleSlotKind,
  ctx?: SameDayCompatContext,
): boolean {
  if (a === 'race_event' || b === 'race_event') return true;
  if (a === b) return true;

  const ma = matrixRowForSlot(a);
  const mb = matrixRowForSlot(b);
  if (!!SAME_DAY_COMPATIBLE[ma]?.[mb]) return true;

  if (
    ctx?.allowQualityRunQualitySwimSameDay &&
    ((ma === 'quality_swim' && mb === 'quality_run') || (ma === 'quality_run' && mb === 'quality_swim'))
  ) {
    return true;
  }
  return false;
}

export type PlannedSessionLike = {
  type: string;
  name: string;
  tags?: string[];
  description?: string;
};

/**
 * Map a combined-plan session to a schedule slot for matrix checks.
 * Engine uses coarse `type` + tags + name. Brick legs share the `brick` tag but are
 * still mapped via bike/run rules for cross-session checks; **both** tagged `brick` is
 * whitelisted in `arePlannedSessionsCompatible`.
 */
export function plannedSessionToScheduleSlot(s: PlannedSessionLike): ScheduleSlotKind {
  const tags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).toLowerCase()) : [];
  const n = `${s.name} ${s.description ?? ''}`.toLowerCase();
  const ty = String(s.type || '').toLowerCase();

  if (tags.includes('tri_race') || tags.includes('race_day')) return 'race_event';

  if (ty === 'strength') {
    if (/\(upper\)|upper body|upper —|bench|row|pull|face pull|band pull|lat pull|overhead|push-up|inverted|pallof|curl|press(?!ur)/i.test(n) &&
      !/\(lower\)|deadlift|squat|hip thrust|rdl|step-up|split squat|goblet|calf|lower body/i.test(n)) {
      return 'upper_body_strength';
    }
    if (/\(lower\)|lower body|deadlift|squat|hip thrust|rdl|step-up|split|leg|posterior|neural/i.test(n)) {
      return 'lower_body_strength';
    }
    return 'lower_body_strength';
  }

  if (ty === 'swim') {
    if (tags.includes('quality') || tags.includes('threshold') || tags.includes('css_aerobic')) return 'quality_swim';
    return 'easy_swim';
  }

  if (ty === 'run') {
    if (tags.includes('long_run')) return 'long_run';
    if (tags.includes('quality') || tags.includes('intervals')) return 'quality_run';
    if (tags.includes('marathon_pace') || tags.includes('race_specific')) return 'quality_run';
    return 'easy_run';
  }

  if (ty === 'bike' || ty === 'ride' || ty === 'cycling') {
    if (tags.includes('long_ride')) return 'long_ride';
    if (tags.includes('quality') || tags.includes('vo2') || tags.includes('sweet') || tags.includes('threshold') || tags.includes('tempo')) {
      return 'quality_bike';
    }
    return 'easy_bike';
  }

  if (ty === 'walk' || ty === 'hike') return 'easy_run';

  return 'easy_bike';
}

/**
 * Two planned sessions on the same day: compatible with the product matrix / extensions.
 * Brick legs (both tagged) always pass. Involving a brick and a third session uses normal rules
 * (brick is not a matrix row — brick+brick only whitelisted here).
 */
export function arePlannedSessionsCompatible(
  s1: PlannedSessionLike,
  s2: PlannedSessionLike,
  ctx?: SameDayCompatContext,
): boolean {
  const t1 = Array.isArray(s1.tags) ? s1.tags : [];
  const t2 = Array.isArray(s2.tags) ? s2.tags : [];
  if (t1.includes('brick') && t2.includes('brick')) return true;

  const a = plannedSessionToScheduleSlot(s1);
  const b = plannedSessionToScheduleSlot(s2);
  if ((t1.includes('brick') || t2.includes('brick')) && t1.includes('brick') !== t2.includes('brick')) {
    return true;
  }
  return areScheduleSlotsCompatible(a, b, ctx);
}

/** Markdown table for system prompts (10×10 matrix). */
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
  'After long_run → next day: prefer easy_swim or rest — not easy_run (back-to-back run tissue load). easy_run only as last resort with an explicit trade-off.',
  'After lower_body_strength → 48 hours before the next lower_body_strength, quality_run, or long_run; keep spacing from long_ride and quality_bike per recovery.',
  'Lower_body_strength → not on the calendar day immediately before long_ride or long_run (upper body may be).',
  'After quality_bike → next calendar day: no quality_bike and no quality_run.',
  'After quality_run → next day: no quality_run and no quality_bike.',
  'The calendar day before an anchored quality_bike must not be quality_run (treat as consecutive HIGH quality — use easy bike or easy swim there).',
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
  '4) Place strength: for each candidate day, require SAME_DAY_COMPATIBLE with everything already on that day; enforce SEQUENTIAL_RULES; enforce STRENGTH_FREQUENCY rules; pick the first valid day(s). Propose a resolution — do not ask the athlete to arbitrate schedule conflicts. Strength weekday selection is the optimizer\'s job; never ask the athlete which days to lift on.',
  '5) Validate the full week: if anything conflicts, adjust silently until the week passes all gates; only then present. One confirmation question at most.',
].join('\n');

export const EXPERIENCE_MODIFIER_TEXT = [
  'Performance (training_intent performance, or experienced prior 70.3+): may allow quality_swim + quality_run same day with AM/PM split; may allow upper_body_strength + quality_bike same day when the matrix would otherwise be strict on doubles.',
  'Performance + co-equal strength (strength_intent performance on tri goals): when the week is dense (e.g. 7 days), **quality_run in the morning + lower_body_strength in the evening** can be one **consolidated hard day**; **quality_run + upper_body_strength** is already matrix-friendly. **Sequential rules** (e.g. 48h between hard leg hits) still govern the full week — do not break recovery to stack junk.',
  'Completion / first_race: apply the matrix strictly; separate quality and heavy lower-body work onto different days unless the athlete explicitly confirms doubles.',
].join('\n');

export const AL_BEHAVIOR_TEXT = [
  'Before proposing any week: (1) run every day through the same-day matrix; (2) check sequential rules; (3) check strength spacing; (4) if conflicts exist, re-place using the placement algorithm; (5) present one conflict-free week in plain prose; (6) at most one confirmation question.',
  'Never show a week that still violates the matrix. Never ask the athlete to fix a scheduling conflict. Do not recite the rulebook — apply it.',
  'In chat, state the schedule read first, then a short confirm (e.g. "Tuesday quality bike, Friday easy, Saturday long — good?") — not a list of options for the athlete to arbitrate; see arc-setup QUESTION FORMAT.',
].join('\n');
