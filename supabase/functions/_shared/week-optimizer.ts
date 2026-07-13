// =============================================================================
// _shared/week-optimizer.ts — pure week-derivation engine
// =============================================================================
// IMPORTANT: This file implements scheduling logic that is also implemented in
// generate-combined-plan/week-builder.ts. The same-day matrix is shared via
// schedule-session-constraints.ts but sequential rules and placement logic are
// duplicated. Any rule change MUST be applied to both files.
// See: supabase/functions/_shared/schedule-session-constraints.ts
// =============================================================================
// Given anchors (group-ride day, masters-swim day, long-day preferences) and
// athlete preferences (swims/strength/training-days), produces a complete
// `preferred_days` payload that:
//
//   - passes the same-day matrix from schedule-session-constraints.ts
//   - honors sequential rules (after long days, after quality,
//     lower-body 48h BOTH directions: not within 2 days after lower_body, AND
//     not the day before long_ride / long_run)
//   - encodes swim role ordering [easy_day, quality_day] (parser convention
//     in combined-schedule-prefs.ts)
//   - respects the training-day budget by emitting `rest_days`
//   - records human-readable trade-offs and any unresolvable conflicts
//
// This is the **executable matrix-as-code** layer that AL leans on for
// consistency. AL still proposes a labeled week to the athlete in chat; the
// optimizer runs server-side at materialize time as defense in depth.
// =============================================================================

import {
  areScheduleSlotsCompatible,
  type ScheduleSlotKind,
} from './schedule-session-constraints.ts';

// ── Day primitives ──────────────────────────────────────────────────────────

export type DayName =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday'
  | 'thursday' | 'friday' | 'saturday';

const ALL_DAYS: DayName[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const DAY_INDEX: Record<DayName, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function nDaysAfter(d: DayName, n: number): DayName {
  return ALL_DAYS[((DAY_INDEX[d] + n) % 7 + 7) % 7];
}
function dayBefore(d: DayName): DayName { return nDaysAfter(d, -1); }
function dayAfter(d: DayName): DayName { return nDaysAfter(d, 1); }

/** Title-case weekday for athlete-visible trade-off lines */
function tfDay(day: DayName | string): string {
  const s = String(day ?? '').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * §4.15: bias a candidate order toward an athlete-preferred day. Returns the base order
 * with `preferred` moved to the front (deduped). When `preferred` is missing or not in
 * `base`, returns `base` unchanged. The placement loop still applies hard / sequential
 * rule checks — preferred is a hint, not an override.
 */
/** Athlete-stated day is always tried first, even when not in the template `base` list. */
function biasOrderForPreferredDay(base: DayName[], preferred: DayName | undefined): DayName[] {
  if (!preferred) return base;
  return [preferred, ...base.filter((d) => d !== preferred)];
}

/**
 * Minimum circular weekday distance from `day` to any anchor swim day. Larger gap =
 * better spread when placing additional swims (prefer Mon+Thu over Mon+Tue).
 */
function swimSpreadGap(day: DayName, occupiedSwimDays: DayName[]): number {
  if (occupiedSwimDays.length === 0) return 99;
  let minGap = 7;
  for (const o of occupiedSwimDays) {
    const g = Math.abs(DAY_INDEX[day] - DAY_INDEX[o]);
    const wrap = Math.min(g, 7 - g);
    minGap = Math.min(minGap, wrap);
  }
  return minGap;
}

/** Circular weekday distance: 0 = same day, 1 = adjacent (incl. Sat↔Sun and Sun↔Mon). */
function circularWeekdayDistance(a: DayName, b: DayName): number {
  const g = Math.abs(DAY_INDEX[a] - DAY_INDEX[b]);
  return Math.min(g, 7 - g);
}

/**
 * Second and third swims cannot land ±1 calendar day from any swim already placed
 * (minimum 2-day separation on the week ring).
 */
function violatesMinimumSwimSpread(candidate: DayName, existingSwimDays: DayName[]): boolean {
  for (const s of existingSwimDays) {
    if (circularWeekdayDistance(candidate, s) <= 1) return true;
  }
  return false;
}

/** Penalize easy_run on calendar days touching quality_run or long_run (hard quality / long stimulus neighbors). */
function easyRunAnchorAdjacencyPenalty(
  d: DayName,
  qualityRunDay: DayName | undefined,
  longRun: DayName,
): number {
  let p = 0;
  if (qualityRunDay) {
    if (dayBefore(qualityRunDay) === d || dayAfter(qualityRunDay) === d) p += 4;
  }
  if (dayBefore(longRun) === d || dayAfter(longRun) === d) p += 4;
  return p;
}

/** Larger = more separation from quality_run and long_run on the calendar (breaks ties after penalty). */
function easyRunHardAnchorMinGap(
  d: DayName,
  qualityRunDay: DayName | undefined,
  longRun: DayName,
): number {
  const anchors: DayName[] = [longRun];
  if (qualityRunDay) anchors.push(qualityRunDay);
  let minGap = 7;
  for (const a of anchors) {
    const g = Math.abs(DAY_INDEX[d] - DAY_INDEX[a]);
    const wrap = Math.min(g, 7 - g);
    minGap = Math.min(minGap, wrap);
  }
  return minGap;
}

// ── Public types ────────────────────────────────────────────────────────────

/** Anchor with an optional intensity hint (group ride / run club / masters). */
export interface AnchorWithIntensity {
  day: DayName;
  /** 'quality' = competitive / threshold; 'easy' = social / aerobic; 'long' = long day. */
  intensity?: 'quality' | 'easy' | 'long';
  /** Human note (e.g. "Boulder Rd Runners track 6am") — propagated to slot.note. */
  note?: string;
}

export interface WeekOptimizerInputs {
  anchors?: {
    long_ride?: DayName;
    long_run?: DayName;
    /** A solo or group quality bike day (intervals, threshold, hammer ride). */
    quality_bike?: DayName | AnchorWithIntensity;
    /** Run club / track session. Mapped per RUN CLUB RULE. */
    group_run?: AnchorWithIntensity;
    /** Coached / masters swim. Quality-by-default. */
    masters_swim?: AnchorWithIntensity;
  };
  preferences: {
    swims_per_week: 0 | 1 | 2 | 3;
    strength_frequency: 0 | 1 | 2 | 3;
    training_days: 4 | 5 | 6 | 7;
    /**
     * Per `docs/SESSION-FREQUENCY-DEFAULTS.md`: total bike sessions per week (long_ride +
     * quality_bike + optional easy_bike). When &lt; 3, easy_bike is skipped entirely.
     * Optional — when undefined, defaults to 3 (existing behavior preserved for callers
     * that don't yet supply this).
     */
    bikes_per_week?: 0 | 1 | 2 | 3; // PROVISIONAL (F-9): 0 for run-only single-sport non-race shapes
    /**
     * Per `docs/SESSION-FREQUENCY-DEFAULTS.md`: total run sessions per week (long_run +
     * quality_run + optional easy_run). When &lt; 3, easy_run is skipped entirely.
     * Optional — when undefined, defaults to 3.
     */
    runs_per_week?: 0 | 1 | 2 | 3 | 4 | 5; // PROVISIONAL (F-9): 0 for bike-only; up to 5 for run-focused
    /** Optional explicit rest days (Sun-first day names). Server fills the rest. */
    rest_days?: DayName[];
    /**
     * Weekdays where the optimizer should not place **quality_bike** (the only mid-week
     * HIGH bike slot in this module). `long_ride` is handled separately via anchors; there
     * is no other SessionKind here for structured hard bike — bricks / race sims live in
     * the week builder, not in `deriveOptimalWeek()`.
     */
    hard_bike_avoid_days?: DayName[];
    /**
     * Athlete's preferred day for **quality_run** (intervals / tempo). When set, tried first;
     * placement requires same-day matrix **and** sequentialOk (§4.5: not calendar day after quality_bike).
     */
    quality_run?: DayName;
    /** Mid-week easy run — when set, tried first for `easy_run` placement. */
    easy_run?: DayName;
    /** Mid-week easy bike — when set, tried first and must appear or conflict. */
    easy_bike?: DayName;
    /**
     * Swim weekday preferences in Arc order: `[easy_swim, quality_swim]` (+ optional third).
     * Each slot tries its preferred day before spread/load ordering.
     */
    swim?: DayName[];
    /**
     * Athlete-stated preferred days for strength sessions (§4.15). Index 0 = upper slot,
     * index 1 = lower slot. The optimizer biases its candidate order toward these days
     * but falls back to the standard priority list when a preferred day violates hard or
     * sequential rules. When fallback fires, the rejected day is appended to `conflicts`.
     */
    strength_preferred_days?: DayName[];
  };
  athlete: {
    training_intent?: 'performance' | 'completion' | 'first_race' | 'comeback';
    strength_intent?: 'performance' | 'support';
    /**
     * §6.5 / W-007 same-day Lower + Quality endurance ordering preference. Gates the §6.1.5
     * optimizer-preference path that allows non-performance-intent hybrid athletes to take the
     * consolidated AM/PM placement: only `strength_first` triggers consolidation outside the
     * full `isPerf && isCoEq` performance-intent path. `endurance_first` (default) preserves
     * stricter separation — that athlete explicitly opted for race-performance prioritization.
     */
    strength_ordering_preference?: 'endurance_first' | 'strength_first';
    /** Theme B: 'separated' | 'consolidated'. Type only in Slice 1 — no §4 gate consumption until Slice 2. */
    integration_mode?: 'separated' | 'consolidated';
    /** Tri swim program (prefs); week-builder / templates use in Step 2+. */
    swim_intent?: 'focus' | 'race';
    /** Affects swim quality timing default: weeks 1–6 → easy-only swims unless masters anchor; 7+ → quality enabled. */
    weeks_into_plan?: number;
  };
}

export type SessionKind = ScheduleSlotKind;

export interface SessionSlot {
  kind: SessionKind;
  fatigue: 'HIGH' | 'MODERATE' | 'LOW';
  timing?: 'AM' | 'PM';
  note?: string;
}

/** Explicit slot kinds — avoids guessing from array index (weekday order ≠ upper/lower order). */
export type StrengthPreferredSlot = {
  day: DayName;
  kind: 'upper_body_strength' | 'lower_body_strength';
};

export interface PreferredDaysOut {
  long_ride?: DayName;
  quality_bike?: DayName;
  easy_bike?: DayName;
  long_run?: DayName;
  quality_run?: DayName;
  easy_run?: DayName;
  /** Ordered `[easy_day, quality_day]`; optional third index for focus swim program maps to `swim_third_day`. */
  swim?: DayName[];
  /**
   * Strength weekdays with explicit `kind` per slot (optimizer export). Legacy `DayName[]` is still
   * accepted in validators/parsers: index 0 = upper, remaining = lower (arc-setup template contract).
   */
  strength?: StrengthPreferredSlot[] | DayName[];
}

export interface OptimalWeek {
  days: Record<DayName, SessionSlot[]>;
  rest_days: DayName[];
  preferred_days: PreferredDaysOut;
  /** Compromises taken (e.g. back-to-back HIGH days for performance). */
  trade_offs: string[];
  /** Unresolvable issues — non-empty means the caller should surface to athlete. */
  conflicts: string[];
  /**
   * True when 2× co-equal strength landed cleanly and a third session fits
   * without displacing quality or breaking spacing — for arc-setup upsell only.
   */
  can_offer_third_strength?: boolean;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function fatigueOf(k: SessionKind): 'HIGH' | 'MODERATE' | 'LOW' {
  if (
    k === 'long_ride' || k === 'long_run' ||
    k === 'quality_bike' || k === 'quality_run' ||
    k === 'lower_body_strength'
  ) return 'HIGH';
  if (k === 'quality_swim' || k === 'upper_body_strength') return 'MODERATE';
  return 'LOW';
}

function asAnchor(v: DayName | AnchorWithIntensity | undefined): AnchorWithIntensity | undefined {
  if (!v) return undefined;
  return typeof v === 'string' ? { day: v } : v;
}

function emptyWeek(): Record<DayName, SessionSlot[]> {
  const o = {} as Record<DayName, SessionSlot[]>;
  for (const d of ALL_DAYS) o[d] = [];
  return o;
}

function cloneDays(d: Record<DayName, SessionSlot[]>): Record<DayName, SessionSlot[]> {
  const o = emptyWeek();
  for (const day of ALL_DAYS) {
    o[day] = d[day].map((s) => ({ ...s }));
  }
  return o;
}

/**
 * `preferred_days.strength` export order: all upper-body days first, then all lower-body days,
 * each group sorted Mon→Sun. Matches `validatePreferredDays` when slots carry explicit `kind`.
 */
function orderStrengthSlotsForPreferredDaysExport(
  days: Record<DayName, SessionSlot[]>,
  chronological: DayName[],
): DayName[] {
  const byWeekday = (a: DayName, b: DayName) => DAY_INDEX[a] - DAY_INDEX[b];
  const upper = chronological
    .filter((d) => days[d].some((s) => s.kind === 'upper_body_strength'))
    .sort(byWeekday);
  const lower = chronological
    .filter((d) => days[d].some((s) => s.kind === 'lower_body_strength'))
    .sort(byWeekday);
  const unk = chronological
    .filter((d) => !upper.includes(d) && !lower.includes(d))
    .sort(byWeekday);
  return [...upper, ...lower, ...unk];
}

function strengthPreferredSlotsFromWeek(
  days: Record<DayName, SessionSlot[]>,
  chronological: DayName[],
): StrengthPreferredSlot[] {
  return orderStrengthSlotsForPreferredDaysExport(days, chronological).map((d) => ({
      day: d,
      kind: days[d].some((s) => s.kind === 'upper_body_strength')
        ? 'upper_body_strength'
        : 'lower_body_strength',
    }));
}

function normalizeStrengthPreferredEntries(
  raw: PreferredDaysOut['strength'] | undefined,
): { day: DayName; kind: SessionKind }[] {
  if (!raw?.length) return [];
  const first = raw[0];
  if (typeof first === 'object' && first !== null && 'day' in first && 'kind' in first) {
    return (raw as StrengthPreferredSlot[]).map((s) => ({ day: s.day, kind: s.kind }));
  }
  const dayNames = raw as DayName[];
  return dayNames.map((d, i) => ({
    day: d,
    kind: i === 0 ? 'upper_body_strength' : 'lower_body_strength',
  }));
}


function place(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
  opts: { timing?: 'AM' | 'PM'; note?: string } = {},
): void {
  days[day].push({ kind, fatigue: fatigueOf(kind), ...opts });
}

/** Matrix check: would adding `kind` on `day` violate same-day pairings already there? */
function canPlace(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
): boolean {
  const existing = days[day];
  if (!existing || existing.length === 0) return true;
  for (const slot of existing) {
    if (!areScheduleSlotsCompatible(slot.kind, kind)) return false;
  }
  return true;
}

/**
 * Matrix check + EXPERIENCE MODIFIER overrides (consolidated hard days for
 * performance + co-equal strength athletes; AM/PM splits for performance).
 * Mirrors `EXPERIENCE_MODIFIER_TEXT` in schedule-session-constraints.ts.
 */
function canPlaceWithModifier(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
  athlete: WeekOptimizerInputs['athlete'],
): boolean {
  if (canPlace(days, day, kind)) return true;
  const existing = days[day];
  if (!existing || existing.length !== 1) return false;
  const there = existing[0].kind;

  // §4.11: QR + QS same-day allowed when training_intent=performance OR strength_intent=co-equal
  // AND the next day is not a long anchor. Stacking quality before a long-day compounds fatigue
  // into the long day. Override 5.3 (always-stack for qualifying profiles) is out of scope.
  const nextKinds = (days[dayAfter(day)] ?? []).map((s) => s.kind);
  const nextDayIsLong = nextKinds.includes('long_ride') || nextKinds.includes('long_run');
  const allowQrQs =
    (athlete.training_intent === 'performance' || athlete.strength_intent === 'performance') &&
    !nextDayIsLong;
  if (areScheduleSlotsCompatible(there, kind, { allowQualityRunQualitySwimSameDay: allowQrQs })) {
    return true;
  }

  const isPerf = athlete.training_intent === 'performance';
  const isCoEq = athlete.strength_intent === 'performance';

  // Performance + co-equal strength: quality_run + lower_body_strength → consolidated hard day
  // (AM run / PM lift).
  //
  // §6.1.5 widening (commit 2 of cycling/running asymmetry pass): hybrid athletes who explicitly
  // chose `strength_first` ordering preference ALSO unlock this consolidation regardless of
  // training_intent. They opted into the consolidation trade-off via the wizard. Endurance_first
  // (default) preserves stricter separation per user directive.
  // Theme B Slice 2 (#1a): additive OR-branch — `integration_mode==='consolidated'`
  // unlocks same-day QR+lower for any athlete. Existing perf+co-equal / strength_first
  // clause unchanged (parens explicit); separated/unset → byte-identical.
  const allowConsolidation =
    (isCoEq && (isPerf || athlete.strength_ordering_preference === 'strength_first'))
    || athlete.integration_mode === 'consolidated';
  if (allowConsolidation) {
    if (kind === 'lower_body_strength' && there === 'quality_run') return true;
    if (kind === 'quality_run' && there === 'lower_body_strength') return true;
  }
  return false;
}

/**
 * Sequential rules between adjacent days (mirrors SEQUENTIAL_RULES_TEXT).
 * Returns false when placing `kind` on `day` would violate.
 *
 * EXPERIENCE MODIFIER for same-day stacks is handled in \`canPlaceWithModifier\`.
 * §4.5: calendar day after quality_bike cannot host quality_run — no exceptions.
 */
export type SequentialRelax = {
  allow_easy_run_after_long_run?: boolean;
  /**
   * §4.7 tiered relaxation for lower_body_strength concurrent-training spacing. The placement
   * loop searches in this order:
   *   1. {} (strict): reject any leg-quality adjacency (Tue QB → Wed lower blocked, Wed lower
   *      → Thu QR blocked, sandwich blocked).
   *   2. { allow_lower_adj_one_sided: true }: accept one-sided adjacency (lower next to one
   *      leg-quality session). Still blocks sandwich + long-day adjacency.
   *   3. { allow_lower_adj_one_sided: true, allow_lower_sandwich: true }: accept sandwich as a
   *      last resort. Still blocks long-day adjacency (48h rule never relaxes).
   *
   * Long_ride/long_run adjacency to lower_body_strength is NEVER relaxed — 48h gap is the
   * floor regardless of week density. If the engine can't satisfy 48h vs long, it should drop
   * a strength session instead of compromising the long-session recovery window.
   */
  allow_lower_adj_one_sided?: boolean;
  allow_lower_sandwich?: boolean;
};

function sequentialOk(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
  athlete: WeekOptimizerInputs['athlete'],
  relax?: SequentialRelax,
): boolean {
  const prevSlots = days[dayBefore(day)] ?? [];
  const prevKinds = prevSlots.map((s) => s.kind);
  const nextSlots = days[dayAfter(day)] ?? [];
  const nextKinds = nextSlots.map((s) => s.kind);

  const isHigh = (k: SessionKind) =>
    k === 'long_ride' || k === 'long_run' ||
    k === 'quality_bike' || k === 'quality_run' ||
    k === 'lower_body_strength';

  // Prev day was a long day → restrict HIGH and lower-body work. Upper-body
  // strength and swim (including quality_swim) are non-leg / recovery-friendly
  // and remain allowed (matches validate-reschedule "upper + long run = OK").
  // Cross-sport exception: long_ride → long_run (and reverse) is the canonical
  // tri Sat/Sun weekend; the combined-plan engine programs this routinely.
  if (prevKinds.includes('long_ride')) {
    if (kind !== 'long_run' && isHigh(kind)) return false;
  }
  if (prevKinds.includes('long_run')) {
    // Day after long_run: prefer swim or rest — not easy_run (same tissue, back-to-back run stress).
    if (kind === 'easy_run' && !relax?.allow_easy_run_after_long_run) return false;
    if (kind !== 'long_ride' && isHigh(kind)) return false;
  }

  // §4.7 concurrent-training spacing (Hickson 1980, Wilson 2012, Robineau 2016, Coffey & Hawley
  // 2017, Petré 2021): leg-dominant strength must be ≥24h from leg-dominant quality endurance
  // (quality_bike, quality_run) and ≥48h from long_ride/long_run, in BOTH directions, ALL intents.
  // No performance-intent relaxation — Petré 2021 meta-analysis shows the AMPK/mTOR interference
  // is *stronger* in trained individuals.

  // §4.7 tier-aware lower-vs-leg-quality adjacency. When relax flags are set, individual
  // adjacency blocks are skipped per the tier ladder above (allow_lower_adj_one_sided →
  // allow_lower_sandwich). The §4.5 quality_run-after-quality_bike block is HARD regardless.
  const allowLowerAdj = !!relax?.allow_lower_adj_one_sided;
  const allowSandwich = !!relax?.allow_lower_sandwich;

  // Prev day was quality_bike → today cannot be HIGH (still blocks long_ride, long_run,
  // quality_bike, quality_run, lower_body_strength). Adjacency = sub-24h gap from same prime movers.
  // §4.5 [consensus]: quality_run cannot fall on the calendar day after quality_bike (hard block).
  if (prevKinds.includes('quality_bike')) {
    if (kind === 'quality_run') return false;
    if (kind === 'quality_bike') return false;
    if (kind === 'long_ride') return false;
    if (kind === 'long_run') return false;
    if (kind === 'lower_body_strength' && !allowLowerAdj) return false; // §4.7 strict 24h
  }
  // Prev day was quality_run → today: no quality_bike, no quality_run, no lower_body_strength.
  // The lower_body_strength block is §4.7 NEW (mirrors the QB rule for QR; prior code had a gap
  // here that allowed Wed lower between Tue QB and Thu QR — the original concurrent-training bug).
  if (prevKinds.includes('quality_run')) {
    if (kind === 'quality_run') return false;
    if (kind === 'quality_bike') return false;
    if (kind === 'lower_body_strength' && !allowLowerAdj) return false; // §4.7 strict 24h
  }
  // Next day already has quality_bike → today cannot be quality_run (easy day before anchored
  // hammer / group ride). Symmetric guard for quality_bike placement after a quality_run day.
  if (nextKinds.includes('quality_bike') && kind === 'quality_run') return false;
  if (nextKinds.includes('quality_run') && kind === 'quality_bike') return false;

  const twoBackKinds = (days[nDaysAfter(day, -2)] ?? []).map((s) => s.kind);

  // Gap after lower_body_strength before hard leg/CNS days. §4.7: 24h all intents for quality
  // (matched by adjacency block above + bidirectional placement-time check); 48h for long
  // (NEVER relaxes — long-day recovery window is non-negotiable).
  if (kind === 'long_run') {
    if (prevKinds.includes('lower_body_strength')) return false;
    if (twoBackKinds.includes('lower_body_strength')) return false;
  }
  if (kind === 'quality_bike') {
    if (prevKinds.includes('lower_body_strength') && !allowLowerAdj) return false;
    // §4.7: 48h+ (twoBackKinds) is fine for all intents — only adjacency (prev day) blocks.
  }
  if (kind === 'quality_run') {
    // §4.7 NEW: mirror the lower→QB rule for QR. Prior code only blocked QR after QB; never
    // checked QR after lower_body_strength. That asymmetry was the second half of the
    // concurrent-training bug.
    if (prevKinds.includes('lower_body_strength') && !allowLowerAdj) return false;
  }
  if (kind === 'lower_body_strength') {
    if (prevKinds.includes('lower_body_strength')) return false;
    if (twoBackKinds.includes('lower_body_strength')) return false;
  }

  // §4.21 asymmetric long-session spacing: lower→long PRE needs only 24h (Robineau 2016 supports
  // full strength adaptation at 24h; Doma's running-economy data shows impairment resolves by
  // 48h pre and is moderate-but-acceptable at 24h; standard coaching templates routinely place
  // Friday strength + Saturday long ride). 48h pre would block this common pattern with no
  // research backing.
  //
  // POST-long lower (long → lower) is the asymmetric stricter side: 48h required. Long sessions
  // (especially long_run) cause significant eccentric muscle damage + glycogen depletion;
  // lifting heavy on damaged legs is a poor adaptation AND an injury risk. The 24h-post block
  // already lives in line 442 (`prevKinds.includes('long_run'/'long_ride')` → isHigh block);
  // here we add the 48h-post block via twoBackKinds. Sun long_run → Mon (24h post) blocked,
  // Sun long_run → Tue (48h post) blocked.
  if (kind === 'lower_body_strength') {
    if (twoBackKinds.includes('long_ride')) return false; // 48h-post long_ride
    if (twoBackKinds.includes('long_run')) return false;  // 48h-post long_run
  }

  // Lower_body §4.7 forward-spacing toward quality (PRE direction for lower → QB / QR).
  //   delta=1 (24h pre): block if hasQuality AND !allowLowerAdj (§4.7 24h adjacency rule)
  //   delta=2 (48h pre): unconditionally allowed for both long and quality (24h+ satisfies §4.21)
  //
  // Sandwich case (lower with leg-quality on BOTH prev AND next day) — block unless allowSandwich.
  // Long-day PRE: no block here — 24h pre is sufficient per Robineau 2016 + coaching consensus.
  if (kind === 'lower_body_strength') {
    const prevIsLegQuality = prevKinds.some((k) => k === 'quality_bike' || k === 'quality_run');
    const nextIsLegQuality = nextKinds.some((k) => k === 'quality_bike' || k === 'quality_run');
    if (prevIsLegQuality && nextIsLegQuality && !allowSandwich) return false;
    for (const delta of [1, 2] as const) {
      const slots = days[nDaysAfter(day, delta)] ?? [];
      const hasQuality = slots.some((s) => s.kind === 'quality_bike' || s.kind === 'quality_run');
      if (delta === 1 && hasQuality && !allowLowerAdj) return false; // §4.7 24h adjacency to QB/QR
      // delta === 1 && hasLong → ALLOWED (24h pre long is research-defensible; Robineau 2016)
      // delta === 2 && hasQuality → allowed (48h satisfies §4.7 strict 24h)
      // delta === 2 && hasLong → allowed (48h pre long is well outside any impairment window)
    }
  }

  // Day before combined quality_bike + quality_run: no lower-body strength (leg/CNS density vs §6.4).
  // §4.7 sandwich case is already prevented by the adjacency rules above (prev/next QB/QR vs lower);
  // this remains as an extra guard for the rare same-day QB+QR stack.
  if (kind === 'lower_body_strength') {
    const nk = (days[dayAfter(day)] ?? []).map((s) => s.kind);
    if (nk.includes('quality_bike') && nk.includes('quality_run')) return false;
  }

  return true;
}

/**
 * §4.7 placement-time tier classifier — what severity of concurrent-training conflict would
 * placing `kind` on `day` create?
 *
 * Returns:
 *   'CLEAN'     — no leg-quality / leg-long on D-1 or D+1. Strict ≥24h / ≥48h satisfied.
 *   'SOFT'      — one-sided adjacency (lower sits next to one leg-quality session). Acceptable
 *                  with a soft trade-off when no CLEAN day exists.
 *   'SANDWICH'  — leg-quality on both D-1 AND D+1 (the original Wed-lower-between-Tue-QB-and-
 *                  Thu-QR bug). Hard trade-off; accept only when no SOFT day exists either.
 *
 * For non-lower kinds, always returns 'CLEAN' — the tier rule applies only to lower-body
 * strength placement (the asymmetry is intentional; quality sessions are anchored, lower moves
 * around them).
 */
export type ConcurrentSpacingTier = 'CLEAN' | 'SOFT' | 'SANDWICH';

export function concurrentSpacingTier(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
): ConcurrentSpacingTier {
  if (kind !== 'lower_body_strength') return 'CLEAN';
  const prevK = (days[dayBefore(day)] ?? []).map((s) => s.kind);
  const nextK = (days[dayAfter(day)] ?? []).map((s) => s.kind);
  const prevIsLegQuality = prevK.some((k) => k === 'quality_bike' || k === 'quality_run');
  const nextIsLegQuality = nextK.some((k) => k === 'quality_bike' || k === 'quality_run');
  if (prevIsLegQuality && nextIsLegQuality) return 'SANDWICH';
  if (prevIsLegQuality || nextIsLegQuality) return 'SOFT';
  return 'CLEAN';
}

/** Human label for a leg-quality session, used in trade-off messages. */
function legQualityLabel(kind: SessionKind): string {
  if (kind === 'quality_bike') return 'quality ride';
  if (kind === 'quality_run') return 'quality run';
  return String(kind);
}

/**
 * §4.7 trade-off emitter — names the constraint when lower placement lands at SOFT or SANDWICH
 * tier. Honest, actionable text:
 *   • SOFT  → "Strength lower on D sits next to leg-quality session on adj-D. Concurrent training
 *              research recommends ≥24h ideal; consider moving long-day anchors to free a clean day."
 *   • SANDWICH → "Strength lower on D sandwiched between QB-on-D-1 and QR-on-D+1. No better day
 *                  exists under your anchors. To improve: free [suggested day] for strength,
 *                  reduce strength frequency, or move a long-day anchor."
 *
 * No-op when tier is undefined (placement failed entirely) or CLEAN.
 */
function emitConcurrentSpacingTradeOff(
  days: Record<DayName, SessionSlot[]>,
  lowerDay: DayName,
  tier: ConcurrentSpacingTier | undefined,
  trade_offs: string[],
): void {
  if (!tier || tier === 'CLEAN') return;
  const prevK = (days[dayBefore(lowerDay)] ?? []).map((s) => s.kind);
  const nextK = (days[dayAfter(lowerDay)] ?? []).map((s) => s.kind);
  const prevLegQ = prevK.find((k) => k === 'quality_bike' || k === 'quality_run');
  const nextLegQ = nextK.find((k) => k === 'quality_bike' || k === 'quality_run');
  if (tier === 'SANDWICH' && prevLegQ && nextLegQ) {
    trade_offs.push(
      `Strength lower on ${tfDay(lowerDay)} sits between ${legQualityLabel(prevLegQ)} on ` +
        `${tfDay(dayBefore(lowerDay))} and ${legQualityLabel(nextLegQ)} on ` +
        `${tfDay(dayAfter(lowerDay))} — for heavy training blocks (Strength Build, Maintenance + ` +
        `Power, Rebuild) concurrent-training research recommends ≥24h separation from leg-dominant ` +
        `quality endurance (Hickson 1980; Wilson et al 2012; Petré et al 2021). Hypertrophy and ` +
        `Deload loads (60-72% 1RM) don't drive significant interference at this adjacency (§6.1 ` +
        `cycling/running asymmetry). Your anchors leave no cleaner placement during heavy weeks. ` +
        `To improve: free a day for strength (move a long-day anchor, trim a quality session, ` +
        `or reduce strength to 1×).`,
    );
    return;
  }
  if (tier === 'SOFT') {
    const adjK = prevLegQ ?? nextLegQ;
    const adjDay = prevLegQ ? dayBefore(lowerDay) : dayAfter(lowerDay);
    if (adjK) {
      // Cycling-adjacent strength is well-tolerated (Wilson 2012 ES≈0.32). Running-adjacent
      // is materially more costly (ES≈0.94). Different wording per adjacency kind.
      const isCyclingAdj = adjK === 'quality_bike';
      if (isCyclingAdj) {
        trade_offs.push(
          `Strength lower on ${tfDay(lowerDay)} sits 24h from quality bike on ${tfDay(adjDay)} — ` +
            `cycling-adjacent strength is well-tolerated (Wilson 2012 cycling ES≈0.32 vs running ` +
            `ES≈0.94). For heavy training blocks consider freeing the day if recovery suffers, ` +
            `but this adjacency is acceptable for most athletes.`,
        );
      } else {
        trade_offs.push(
          `Strength lower on ${tfDay(lowerDay)} sits 24h from ${legQualityLabel(adjK)} on ` +
            `${tfDay(adjDay)} — for heavy training blocks (Strength Build, Maintenance + Power, ` +
            `Rebuild) concurrent-training research recommends ≥24h separation in both directions ` +
            `(Hickson 1980; Coffey & Hawley 2017). Hypertrophy and Deload loads don't drive ` +
            `significant interference at this adjacency. Tight spacing is acceptable in heavy ` +
            `weeks but may slightly compromise both sessions; consider freeing an adjacent day ` +
            `if recovery suffers.`,
        );
      }
    }
  }
}

/**
 * Days that must not host lower_body_strength.
 *
 * Pre-2026-05-11: included `dayBefore(longRide)` and `dayBefore(longRun)` as a hard 48h-pre
 * block. Post-2026-05-11: the 48h-pre block was relaxed to 24h-pre per §4.21 (Robineau 2016 +
 * standard coaching prescription: Friday strength + Saturday long ride is a valid pattern).
 * Only the long-day calendar slots themselves remain blocked here; sequential / 48h-POST rules
 * live in `sequentialOk`.
 */
function lowerBodyBlockedDays(longRide: DayName, longRun: DayName): Set<DayName> {
  return new Set<DayName>([longRide, longRun]);
}

// ── Post-placement load + layout balancer (§6.2 soft-move ordering) ─────────

/** Kinds the balancer may relocate — cheapest / least disruptive first (docs §6.2). */
const BALANCER_RELOCATABLE_KINDS: readonly SessionKind[] = [
  'easy_swim',
  'easy_run',
  'easy_bike',
  'upper_body_strength',
];

const BALANCER_LOAD_THRESHOLD_HIGH = 5;
const BALANCER_LOAD_THRESHOLD_LOW = 1;
const BALANCER_MAX_ITER = 48;

/** Same sport on consecutive calendar days (incl. Sun↔Mon wrap). */
const ADJ_SAME_SPORT_EDGE = 4;
/** Extra cost when easy_bike sits the day before quality_bike (recovery buffer overlap). */
const ADJ_EASY_BIKE_BEFORE_QUALITY_BIKE = 3;

type SportFamily = 'swim' | 'bike' | 'run' | 'strength';

type BalancerContext = {
  athlete: WeekOptimizerInputs['athlete'];
  longRide: DayName;
  longRun: DayName;
  mastersSwim?: { day: DayName; kind: SessionKind };
  groupRunAnchor?: { day: DayName; kind: SessionKind };
  // D-066: rest_days from user preferences. The balancer must refuse moves
  // INTO these days, otherwise it can shift strength / swim / easy_run onto
  // a rest day after the placement loops correctly avoided it — and the
  // week-builder then silently skips emission of the relocated session.
  restDays?: Set<DayName>;
};

function balancerFatigueWeight(f: SessionSlot['fatigue']): number {
  if (f === 'HIGH') return 3;
  if (f === 'MODERATE') return 2;
  return 1;
}

function dayFatigueLoadScore(slots: SessionSlot[]): number {
  return slots.reduce((sum, s) => sum + balancerFatigueWeight(s.fatigue), 0);
}

function balancerMovePriority(kind: SessionKind): number {
  const i = BALANCER_RELOCATABLE_KINDS.indexOf(kind);
  return i === -1 ? 999 : i;
}

function sportFamilyOf(kind: SessionKind): SportFamily | undefined {
  if (kind === 'easy_swim' || kind === 'quality_swim') return 'swim';
  if (kind === 'easy_bike' || kind === 'quality_bike' || kind === 'long_ride') return 'bike';
  if (kind === 'easy_run' || kind === 'quality_run' || kind === 'long_run') return 'run';
  if (kind === 'upper_body_strength' || kind === 'lower_body_strength') return 'strength';
  return undefined;
}

function sportsPresentOnDay(slots: SessionSlot[]): Set<SportFamily> {
  const s = new Set<SportFamily>();
  for (const slot of slots) {
    const f = sportFamilyOf(slot.kind);
    if (f) s.add(f);
  }
  return s;
}

/**
 * Penalize same-sport sessions on consecutive days (all sports). Extra weight when
 * easy_bike is immediately before quality_bike (wasted recovery buffer).
 */
function adjacencyPenalty(
  days: Record<DayName, SessionSlot[]>,
  _longRide: DayName,
  _longRun: DayName,
): number {
  let p = 0;
  for (let i = 0; i < ALL_DAYS.length; i++) {
    const d = ALL_DAYS[i];
    const nd = ALL_DAYS[(i + 1) % ALL_DAYS.length];
    const sd = sportsPresentOnDay(days[d]);
    const snd = sportsPresentOnDay(days[nd]);
    for (const fam of sd) {
      if (snd.has(fam)) p += ADJ_SAME_SPORT_EDGE;
    }
    const easyBeforeQb =
      days[d].some((s) => s.kind === 'easy_bike') &&
      days[nd].some((s) => s.kind === 'quality_bike');
    if (easyBeforeQb) p += ADJ_EASY_BIKE_BEFORE_QUALITY_BIKE;
  }
  return p;
}

/** Pairwise same-day validity including EXPERIENCE_MODIFIER stacks (matches `canPlaceWithModifier`). */
function sameDaySlotsLegitimate(
  slots: SessionSlot[],
  day: DayName,
  days: Record<DayName, SessionSlot[]>,
  athlete: WeekOptimizerInputs['athlete'],
): boolean {
  if (slots.length <= 1) return true;
  const nextKinds = (days[dayAfter(day)] ?? []).map((s) => s.kind);
  const nextDayIsLong = nextKinds.includes('long_ride') || nextKinds.includes('long_run');
  const allowQrQs =
    (athlete.training_intent === 'performance' || athlete.strength_intent === 'performance') &&
    !nextDayIsLong;
  const isPerf = athlete.training_intent === 'performance';
  const isCoEq = athlete.strength_intent === 'performance';

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i].kind;
      const b = slots[j].kind;
      if (areScheduleSlotsCompatible(a, b, { allowQualityRunQualitySwimSameDay: allowQrQs })) continue;
      if (
        isPerf &&
        isCoEq &&
        ((a === 'lower_body_strength' && b === 'quality_run') ||
          (b === 'lower_body_strength' && a === 'quality_run'))
      ) {
        continue;
      }
      return false;
    }
  }
  return true;
}

function isMovableBalancerSlot(day: DayName, slot: SessionSlot, ctx: BalancerContext): boolean {
  if (balancerMovePriority(slot.kind) >= 999) return false;
  if (ctx.mastersSwim && ctx.mastersSwim.day === day && slot.kind === ctx.mastersSwim.kind) {
    return false;
  }
  if (ctx.groupRunAnchor && ctx.groupRunAnchor.day === day && slot.kind === ctx.groupRunAnchor.kind) {
    return false;
  }
  return true;
}

function sequentialRelaxForBalancerMove(
  kind: SessionKind,
  toDay: DayName,
  longRun: DayName,
): SequentialRelax | undefined {
  if (kind === 'easy_run' && toDay === dayAfter(longRun)) {
    return { allow_easy_run_after_long_run: true };
  }
  return undefined;
}

/** Applies move in-place on `trial`. Returns false if illegal. */
function mutatingBalancerMove(
  trial: Record<DayName, SessionSlot[]>,
  fromDay: DayName,
  idx: number,
  toDay: DayName,
  ctx: BalancerContext,
): boolean {
  // D-066: never balance INTO a rest day. The builder defensively skips
  // emission on rest days, so a move here is functionally a session drop.
  if (ctx.restDays?.has(toDay)) return false;
  const src = trial[fromDay];
  if (idx < 0 || idx >= src.length) return false;
  const [removed] = src.splice(idx, 1);
  if (!sameDaySlotsLegitimate(src, fromDay, trial, ctx.athlete)) {
    src.splice(idx, 0, removed);
    return false;
  }
  // Optimizer templates keep at most two sessions per weekday.
  if (trial[toDay].length >= 2) {
    src.splice(idx, 0, removed);
    return false;
  }
  if (!canPlaceWithModifier(trial, toDay, removed.kind, ctx.athlete)) {
    src.splice(idx, 0, removed);
    return false;
  }
  const relax = sequentialRelaxForBalancerMove(removed.kind, toDay, ctx.longRun);
  if (!sequentialOk(trial, toDay, removed.kind, ctx.athlete, relax)) {
    src.splice(idx, 0, removed);
    return false;
  }
  trial[toDay].push(removed);
  if (!sameDaySlotsLegitimate(trial[toDay], toDay, trial, ctx.athlete)) {
    trial[toDay].pop();
    src.splice(idx, 0, removed);
    return false;
  }
  return true;
}

function loadDispersionSumSq(days: Record<DayName, SessionSlot[]>): number {
  let sum = 0;
  for (const d of ALL_DAYS) {
    const s = dayFatigueLoadScore(days[d]);
    sum += s * s;
  }
  return sum;
}

function applyBalancerMoveFromClone(
  days: Record<DayName, SessionSlot[]>,
  trial: Record<DayName, SessionSlot[]>,
): void {
  for (const d of ALL_DAYS) days[d] = trial[d];
}

function findDayWithKind(
  days: Record<DayName, SessionSlot[]>,
  kind: SessionKind,
): DayName | undefined {
  for (const d of ALL_DAYS) {
    if (days[d].some((s) => s.kind === kind)) return d;
  }
  return undefined;
}

function rebuildSwimSlotsFromDays(
  days: Record<DayName, SessionSlot[]>,
): { day: DayName; kind: SessionKind }[] {
  const out: { day: DayName; kind: SessionKind }[] = [];
  for (const d of ALL_DAYS) {
    for (const s of days[d]) {
      if (s.kind === 'easy_swim' || s.kind === 'quality_swim') {
        out.push({ day: d, kind: s.kind });
      }
    }
  }
  out.sort((a, b) => {
    const aQ = a.kind === 'quality_swim' ? 1 : 0;
    const bQ = b.kind === 'quality_swim' ? 1 : 0;
    return aQ - bQ;
  });
  return out;
}

function rebuildStrengthDaysFromDays(days: Record<DayName, SessionSlot[]>): DayName[] {
  const out: DayName[] = [];
  for (const d of ALL_DAYS) {
    if (days[d].some((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength')) {
      out.push(d);
    }
  }
  out.sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);
  return out;
}

/**
 * After full placement, rebalance daily fatigue load and reduce same-sport adjacency.
 * Does not move anchored or structural sessions (long/quality/lower strength).
 */
function balanceWeeklySessionLoad(
  days: Record<DayName, SessionSlot[]>,
  trade_offs: string[],
  ctx: BalancerContext,
): void {
  const isPerfAthlete = ctx.athlete.training_intent === 'performance';

  const maybeNoteEasyRunAfterLong = (kind: SessionKind, toDay: DayName): void => {
    if (
      kind === 'easy_run' &&
      toDay === dayAfter(ctx.longRun) &&
      !isPerfAthlete
    ) {
      trade_offs.push(
        `easy_run on ${tfDay(toDay)} immediately follows long_run (${tfDay(ctx.longRun)}) — load balancer move; prefer swim or rest that day when possible.`,
      );
    }
  };

  // Phase 1 — daily fatigue score: redistribute away from ≥5 when another day is ≤1.
  let iter = 0;
  while (iter++ < BALANCER_MAX_ITER) {
    const scored = ALL_DAYS.map((d) => ({ d, s: dayFatigueLoadScore(days[d]) }));
    const over = scored.filter((x) => x.s >= BALANCER_LOAD_THRESHOLD_HIGH);
    const under = scored.filter((x) => x.s <= BALANCER_LOAD_THRESHOLD_LOW);
    if (!over.length || !under.length) break;

    over.sort((a, b) => b.s - a.s);
    under.sort((a, b) => a.s - b.s);

    let moved = false;
    outer:
    for (const od of over) {
      for (const ud of under) {
        if (od.d === ud.d) continue;
        const candidates = days[od.d]
          .map((slot, idx) => ({ slot, idx }))
          .filter(({ slot }) => isMovableBalancerSlot(od.d, slot, ctx))
          .sort((a, b) => balancerMovePriority(a.slot.kind) - balancerMovePriority(b.slot.kind));

        for (const { slot, idx } of candidates) {
          const trial = cloneDays(days);
          if (!mutatingBalancerMove(trial, od.d, idx, ud.d, ctx)) continue;
          applyBalancerMoveFromClone(days, trial);
          trade_offs.push(
            `Weekly load balance: moved ${slot.kind} from ${tfDay(od.d)} to ${tfDay(ud.d)} — spread fatigue across the week.`,
          );
          maybeNoteEasyRunAfterLong(slot.kind, ud.d);
          moved = true;
          break outer;
        }
      }
    }
    if (!moved) break;
  }

  // Phase 2 — reduce same-sport adjacency without worsening load dispersion (Σ score²).
  const baseDispersion = loadDispersionSumSq(days);
  let baseAdj = adjacencyPenalty(days, ctx.longRide, ctx.longRun);

  iter = 0;
  while (iter++ < BALANCER_MAX_ITER) {
    let best: {
      fromDay: DayName;
      idx: number;
      toDay: DayName;
      newAdj: number;
      newDisp: number;
      kind: SessionKind;
    } | undefined;

    for (const fromDay of ALL_DAYS) {
      const movable = days[fromDay]
        .map((slot, idx) => ({ slot, idx }))
        .filter(({ slot }) => isMovableBalancerSlot(fromDay, slot, ctx));

      for (const { slot, idx } of movable) {
        for (const toDay of ALL_DAYS) {
          if (toDay === fromDay) continue;
          const trial = cloneDays(days);
          if (!mutatingBalancerMove(trial, fromDay, idx, toDay, ctx)) continue;
          const newAdj = adjacencyPenalty(trial, ctx.longRide, ctx.longRun);
          const newDisp = loadDispersionSumSq(trial);
          if (newAdj >= baseAdj) continue;
          if (newDisp > baseDispersion + 1e-6) continue;

          if (
            !best ||
            newAdj < best.newAdj ||
            (newAdj === best.newAdj && newDisp < best.newDisp)
          ) {
            best = { fromDay, idx, toDay, newAdj, newDisp, kind: slot.kind };
          }
        }
      }
    }

    if (!best) break;

    const trial = cloneDays(days);
    mutatingBalancerMove(trial, best.fromDay, best.idx, best.toDay, ctx);
    applyBalancerMoveFromClone(days, trial);

    trade_offs.push(
      `Weekly layout: moved ${best.kind} from ${tfDay(best.fromDay)} to ${tfDay(best.toDay)} — fewer same-sport days back-to-back.`,
    );
    maybeNoteEasyRunAfterLong(best.kind, best.toDay);

    baseAdj = adjacencyPenalty(days, ctx.longRide, ctx.longRun);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

/**
 * Pure derivation: anchors + preferences → optimal week + preferred_days.
 * Always returns a result (never throws); clients should check `conflicts`.
 */
export function deriveOptimalWeek(inputs: WeekOptimizerInputs): OptimalWeek {
  const days = emptyWeek();
  const trade_offs: string[] = [];
  const conflicts: string[] = [];

  const isPerf = inputs.athlete.training_intent === 'performance';
  const isCoEq = inputs.athlete.strength_intent === 'performance';
  const weeksInto = Math.max(1, inputs.athlete.weeks_into_plan ?? 1);

  // ── Anchors ──────────────────────────────────────────────────────────────
  const longRide: DayName = inputs.anchors?.long_ride ?? 'saturday';
  const longRun: DayName = inputs.anchors?.long_run ?? 'sunday';

  place(days, longRide, 'long_ride');
  place(days, longRun, 'long_run');
  const noLowerBody = lowerBodyBlockedDays(longRide, longRun);

  // D-064 / D-066: hoist rest_days set so swim AND strength placement loops can
  // filter against it before placement. Without this filter, sessions land on
  // rest days, then the week-builder defensively skips emission (`!slot?.isRest`),
  // producing a silent drop in session count. Both swim and strength surfaced
  // this bug; the filter belongs at every preference-driven placement loop.
  const restDaySet = new Set<DayName>(inputs.preferences.rest_days ?? []);

  const qualityBikeAnchor = asAnchor(inputs.anchors?.quality_bike);
  const groupRun = inputs.anchors?.group_run;
  const mastersSwim = inputs.anchors?.masters_swim;

  /** Set only when `quality_bike` was actually placed on the anchored day. */
  let qualityBikeDay: DayName | undefined;

  if (qualityBikeAnchor) {
    if (qualityBikeAnchor.day === longRide || qualityBikeAnchor.day === longRun) {
      conflicts.push(
        `quality_bike anchor on ${qualityBikeAnchor.day} collides with long-day anchor; pick a different group-ride day.`,
      );
    } else if (canPlace(days, qualityBikeAnchor.day, 'quality_bike')) {
      place(days, qualityBikeAnchor.day, 'quality_bike', { note: qualityBikeAnchor.note });
      qualityBikeDay = qualityBikeAnchor.day;
    } else {
      conflicts.push(
        `quality_bike anchor on ${qualityBikeAnchor.day} doesn't pass the same-day matrix — will try algorithmic placement.`,
      );
    }
  }

  let groupRunAnchor: { day: DayName; kind: SessionKind } | undefined;
  if (groupRun) {
    const intensity = groupRun.intensity ?? 'easy';
    const kind: SessionKind =
      intensity === 'quality' ? 'quality_run' :
        intensity === 'long' ? 'long_run' : 'easy_run';
    if (!(intensity === 'long' && groupRun.day === longRun)) {
      if (canPlace(days, groupRun.day, kind)) {
        place(days, groupRun.day, kind, { note: groupRun.note });
        groupRunAnchor = { day: groupRun.day, kind };
      } else {
        conflicts.push(
          `group_run anchor (${kind}) on ${groupRun.day} doesn't pass the same-day matrix.`,
        );
      }
    }
  }

  let mastersSwimAnchor: { day: DayName; kind: SessionKind } | undefined;
  if (mastersSwim) {
    const kind: SessionKind = mastersSwim.intensity === 'easy' ? 'easy_swim' : 'quality_swim';
    const mastersOnRestDay = (inputs.preferences.rest_days ?? []).includes(mastersSwim.day);
    if (mastersOnRestDay) {
      // D-064: masters_swim anchor on a rest day was being force-placed here, then the
      // week-builder would silently skip emission via `!swimSlot?.isRest` — net effect was
      // a missing swim. Refuse the anchor placement so the swim falls through to the
      // preference-based loop below and lands on a clean weekday.
      conflicts.push(
        `masters_swim anchor (${kind}) on ${mastersSwim.day} collides with rest_days — falling through to preference-based placement.`,
      );
    } else if (canPlace(days, mastersSwim.day, kind)) {
      place(days, mastersSwim.day, kind, { note: mastersSwim.note });
      mastersSwimAnchor = { day: mastersSwim.day, kind };
    } else {
      conflicts.push(
        `masters_swim anchor (${kind}) on ${mastersSwim.day} doesn't pass the same-day matrix.`,
      );
    }
  }

  // ── quality_bike (if not yet placed — e.g. failed anchor or long-day collision) ──
  if (!qualityBikeDay) {
    const avoidHardBike = new Set<DayName>(inputs.preferences.hard_bike_avoid_days ?? []);
    const candidates: DayName[] = ['tuesday', 'wednesday', 'thursday'];
    const tryPlaceQb = (respectAvoid: boolean): DayName | undefined => {
      for (const c of candidates) {
        if (c === longRide || c === longRun) continue;
        if (respectAvoid && avoidHardBike.has(c)) continue;
        if (!canPlace(days, c, 'quality_bike')) continue;
        if (!sequentialOk(days, c, 'quality_bike', inputs.athlete)) continue;
        place(days, c, 'quality_bike');
        return c;
      }
      return undefined;
    };
    qualityBikeDay = tryPlaceQb(true);
    if (!qualityBikeDay && avoidHardBike.size > 0) {
      qualityBikeDay = tryPlaceQb(false);
      if (qualityBikeDay) {
        trade_offs.push(
          `quality_bike: hard_bike_avoid_days ruled out all mid-week candidates — placed on ${tfDay(qualityBikeDay)} instead.`,
        );
      }
    }
  }

  // ── quality_run ──────────────────────────────────────────────────────────
  // If group_run anchor is quality, that's already placed; record day.
  let qualityRunDay: DayName | undefined =
    groupRun?.intensity === 'quality' ? groupRun.day : undefined;
  /** Lower already placed same day as quality_run (AM/PM consolidated hard day). */
  let consolidatedQrLowerDay: DayName | undefined;

  if (!qualityRunDay) {
    /**
     * Hard-banned days for quality_run: not on long_ride / long_run days; not the calendar day before
     * **long_run** (§4.10 same-discipline — legs fresh for the long run). Day before **long_ride** is allowed
     * (bike vs run). Bracket anchored quality_bike (cannot share QB day or adjacent calendar days).
     */
    const blockedQr = new Set<DayName>([longRide, longRun, dayBefore(longRun)]);
    if (qualityBikeDay) {
      blockedQr.add(qualityBikeDay);
      blockedQr.add(dayBefore(qualityBikeDay));
      blockedQr.add(dayAfter(qualityBikeDay));
    }

    const preferredQr = inputs.preferences.quality_run;
    const strengthFreqEarly = inputs.preferences.strength_frequency;
    // Theme B Slice 2 (#2): a consolidated athlete gets QR+lower SAME-DAY as the
    // PREFERRED placement — skip the separated preferred-QR block so the
    // consolidation block below runs first. Byte-identical when false (separated/
    // unset, incl. perf+co-equal who never set integration_mode → order unchanged,
    // anchor-contract :196 lock holds). §7 phase carve-out is builder-authoritative
    // (optimizer is phase-blind); only strFreq>=2 gates here.
    const consolidatedPreferred =
      inputs.athlete.integration_mode === 'consolidated' && strengthFreqEarly >= 2;
    if (preferredQr && !qualityRunDay && !consolidatedPreferred) {
      if (
        !blockedQr.has(preferredQr) &&
        canPlace(days, preferredQr, 'quality_run') &&
        sequentialOk(days, preferredQr, 'quality_run', inputs.athlete)
      ) {
        qualityRunDay = preferredQr;
        place(days, preferredQr, 'quality_run');
      } else if (preferredQr) {
        conflicts.push(
          `quality_run: athlete preference (${tfDay(preferredQr)}) not viable under sequential rules or same-day matrix — trying algorithmic placement.`,
        );
      }
    }

    // §6.1.5 optimizer preference 1 — consolidation (AM quality_run / PM lower same calendar
    // day, §5.2 matrix). Gate widened per v2.1-plus-§6.1 refinement:
    //   - `isPerf && isCoEq` — original performance+co-equal path (Race the clock + Hybrid)
    //   - `isCoEq && strength_ordering_preference === 'strength_first'` — conservative widening:
    //     hybrid athlete who explicitly chose strength-first ordering already opted into the
    //     consolidation trade-off. `endurance_first` (default) preserves separation per their
    //     stated race-performance prioritization.
    // §4.5 forbids quality_run on the calendar day after quality_bike — do not use day-after-QB here.
    // Theme B Slice 2 (#1b): additive OR-branch (mirror of #1a).
    const allowConsolidation =
      (isCoEq && (isPerf || inputs.athlete.strength_ordering_preference === 'strength_first'))
      || inputs.athlete.integration_mode === 'consolidated';
    if (
      !qualityRunDay &&
      allowConsolidation &&
      strengthFreqEarly >= 2
    ) {
      const candidates: DayName[] = [];
      if (qualityBikeDay) {
        candidates.push(nDaysAfter(qualityBikeDay, 2));
        candidates.push(dayBefore(qualityBikeDay));
      }
      for (const d of ALL_DAYS) {
        if (!candidates.includes(d)) candidates.push(d);
      }
      for (const d of candidates) {
        if (d === longRide || d === longRun) continue;
        // (Pre-2026-05-11 also blocked dayBefore(longRun) here as a 48h-pre safety; relaxed per
        // §4.21 — sequentialOk now enforces the 24h-pre boundary correctly.)
        if (noLowerBody.has(d)) continue;
        if (qualityBikeDay && d === qualityBikeDay) continue;

        const trial = cloneDays(days);
        if (!sequentialOk(trial, d, 'quality_run', inputs.athlete)) continue;
        if (!canPlace(trial, d, 'quality_run')) continue;
        place(trial, d, 'quality_run');
        if (!canPlaceWithModifier(trial, d, 'lower_body_strength', inputs.athlete)) continue;
        if (!sequentialOk(trial, d, 'lower_body_strength', inputs.athlete)) continue;

        place(days, d, 'quality_run');
        place(days, d, 'lower_body_strength', { timing: 'PM' });
        qualityRunDay = d;
        consolidatedQrLowerDay = d;
        // Bug 1 Piece B / D-017 follow-up: do NOT emit a consolidation trade-off
        // here. This fires at canonical-pattern time; the builder can later split
        // the day (`enforceHardEasy(grid, allowConsolidatedHardException=false)`),
        // so this string named a day that may not realize (stale duplicate vs the
        // builder-side, realized-accurate `collectQualityRunLowerBodyTradeOffs`,
        // which owns this message). Coverage gate verified: the builder emits
        // whenever the realized plan actually has QR+lower consolidated.
        break;
      }
    }

    if (!qualityRunDay) {
      const prio: DayName[] = [];
      // Theme B Slice 2 (R-3): a consolidated athlete whose consolidation was
      // blocked still gets their preferred quality_run day (separated) — try it
      // first. Inert when !consolidatedPreferred (separated/unset → byte-identical).
      if (consolidatedPreferred && preferredQr) prio.push(preferredQr);
      if (qualityBikeDay) {
        prio.push(nDaysAfter(qualityBikeDay, 2));
        prio.push(dayBefore(qualityBikeDay));
      }
      prio.push(nDaysAfter(longRide, -2));
      for (const d of ALL_DAYS) {
        if (!prio.includes(d)) prio.push(d);
      }

      for (const c of prio) {
        if (blockedQr.has(c)) continue;
        if (!canPlace(days, c, 'quality_run')) continue;
        if (!sequentialOk(days, c, 'quality_run', inputs.athlete)) continue;

        qualityRunDay = c;
        place(days, c, 'quality_run');
        break;
      }
    }
  }

  if (!qualityRunDay) {
    conflicts.push(
      'quality_run: no valid placement — even consolidated AM run / PM lower could not be scheduled; move group ride, long days, or strength frequency.',
    );
    trade_offs.push('Quality run not placed — tighten anchors or confirm a schedule change with the athlete.');
  }

  // ── easy_bike (mid-week) ─────────────────────────────────────────────────
  // §SESSION-FREQUENCY-DEFAULTS §2: when bikes_per_week < 3, only long_ride + quality_bike are
  // budgeted for the week; easy_bike is dropped entirely (not flagged as conflict — intentional).
  const bikesPerWeek = inputs.preferences.bikes_per_week ?? 3;
  let easyBikeDay: DayName | undefined;
  if (bikesPerWeek < 3) {
    trade_offs.push(
      `easy_bike skipped — frequency budget is ${bikesPerWeek} bike sessions/week (long_ride + quality_bike only).`,
    );
  } else {
    const ebPref = inputs.preferences.easy_bike;
    const ebBase: DayName[] = ['monday', 'wednesday', 'tuesday', 'thursday', 'friday'];
    const easyBikeCandidates = ebPref ? biasOrderForPreferredDay(ebBase, ebPref) : ebBase;
    // Prefer Monday when open so easy_bike shares a day with later upper/strength (MODERATE)
    // rather than sitting alone as LOW-only mid-week — avoids rest-budget pass wiping an isolated easy_bike day.
    for (const c of easyBikeCandidates) {
      if (c === longRide || c === longRun) continue;
      if (qualityBikeDay && c === qualityBikeDay) continue;
      if (qualityRunDay && c === qualityRunDay) continue;
      if (!canPlace(days, c, 'easy_bike')) continue;
      easyBikeDay = c;
      place(days, c, 'easy_bike');
      break;
    }
    if (!easyBikeDay) {
      if (ebPref) {
        conflicts.push(
          `easy_bike: could not place athlete preference (${tfDay(ebPref)}) — same-day matrix full or incompatible with quality_run / quality_bike.`,
        );
      } else {
        conflicts.push(
          'easy_bike: no matrix-clean weekday available — try freeing up a quality day or trimming swim/strength frequency.',
        );
      }
      trade_offs.push('Mid-week easy bike dropped — schedule too dense.');
    }
  }

  const strengthFreq = inputs.preferences.strength_frequency;
  /** Co-equal 2–3×: place gym before easy_run so Mon is not stolen by easy_run before lower can land. */
  const placeStrengthBeforeEasyRun = strengthFreq >= 2 && isCoEq;
  let strengthDays: DayName[] = [];
  if (consolidatedQrLowerDay) {
    strengthDays.push(consolidatedQrLowerDay);
  }
  let easyRunDay: DayName | undefined;
  // §SESSION-FREQUENCY-DEFAULTS §2: when runs_per_week < 3, only long_run + quality_run are
  // budgeted for the week; easy_run is dropped entirely. The placeEasyRun closure short-circuits.
  const runsPerWeek = inputs.preferences.runs_per_week ?? 3;
  const skipEasyRun = runsPerWeek < 3;

  const placeEasyRun = (): void => {
    if (skipEasyRun) {
      trade_offs.push(
        `easy_run skipped — frequency budget is ${runsPerWeek} run sessions/week (long_run + quality_run only).`,
      );
      return;
    }
    const easyRunTiebreak: DayName[] = ['tuesday', 'thursday', 'monday', 'wednesday', 'friday'];
    const scored = (
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as DayName[]
    ).slice().sort((a, b) => {
      const pa = easyRunAnchorAdjacencyPenalty(a, qualityRunDay, longRun);
      const pb = easyRunAnchorAdjacencyPenalty(b, qualityRunDay, longRun);
      if (pa !== pb) return pa - pb;
      const ga = easyRunHardAnchorMinGap(a, qualityRunDay, longRun);
      const gb = easyRunHardAnchorMinGap(b, qualityRunDay, longRun);
      if (ga !== gb) return gb - ga;
      return easyRunTiebreak.indexOf(a) - easyRunTiebreak.indexOf(b);
    });
    const prefEr = inputs.preferences.easy_run;
    const easyRunOrder = prefEr ? [prefEr, ...scored.filter((d) => d !== prefEr)] : scored;
    const dAfterLongRun = dayAfter(longRun);
    let picked: DayName | undefined;
    for (const c of easyRunOrder) {
      if (c === longRide || c === longRun) continue;
      if (c === dAfterLongRun) continue;
      if (qualityRunDay && c === qualityRunDay) continue;
      if (days[c].length > 0) continue;
      if (!canPlace(days, c, 'easy_run')) continue;
      if (!sequentialOk(days, c, 'easy_run', inputs.athlete)) continue;
      picked = c;
      break;
    }
    if (!picked) {
      for (const c of easyRunOrder) {
        if (c === longRide || c === longRun) continue;
        if (c === dAfterLongRun) continue;
        if (qualityRunDay && c === qualityRunDay) continue;
        if (!canPlace(days, c, 'easy_run')) continue;
        if (!sequentialOk(days, c, 'easy_run', inputs.athlete)) continue;
        picked = c;
        break;
      }
    }
    if (!picked && dAfterLongRun !== longRide && dAfterLongRun !== longRun &&
      (!qualityRunDay || dAfterLongRun !== qualityRunDay)) {
      if (canPlace(days, dAfterLongRun, 'easy_run') &&
        sequentialOk(days, dAfterLongRun, 'easy_run', inputs.athlete, { allow_easy_run_after_long_run: true })) {
        picked = dAfterLongRun;
        // Only flag for completion/first_race athletes — for performance athletes a recovery
        // run the day after long run is standard practice, not a trade-off worth surfacing.
        if (!isPerf) {
          trade_offs.push(
            `easy_run on ${tfDay(dAfterLongRun)} immediately follows long_run (${tfDay(longRun)}) — last resort; prefer swim or rest that day when possible.`,
          );
        }
      }
    }
    if (picked) {
      easyRunDay = picked;
      place(days, picked, 'easy_run');
    } else {
      // §A.4 (`docs/BRICK-PROTOCOL.md` companion): if easy_bike was placed AND its day was in
      // the easy_run candidate set, the new matrix flip (easy_bike × easy_run = ✗) is the
      // proximate cause of the drop. Emit a targeted trade-off explaining the constraint;
      // otherwise fall back to the generic density message.
      const ebDay = easyBikeDay;
      const easyBikeBlockedRun = ebDay != null
        && easyRunOrder.includes(ebDay)
        && ebDay !== longRide
        && ebDay !== longRun
        && ebDay !== dAfterLongRun
        && (!qualityRunDay || ebDay !== qualityRunDay);
      if (easyBikeBlockedRun && ebDay) {
        conflicts.push(
          `easy_run: no matrix-clean weekday — the easy_bike day on ${tfDay(ebDay)} cannot also host easy_run (per docs/BRICK-PROTOCOL.md, same-day bike + run must be a tagged brick, not an accidental stack).`,
        );
        trade_offs.push(
          `Midweek aerobic bike and easy run can't share a day. Dropping easy run for this week. Bike and run stay on separate days per coaching standard.`,
        );
      } else {
        conflicts.push(
          'easy_run: no matrix-clean weekday available — try removing a strength session or moving the quality_run.',
        );
        trade_offs.push('Mid-week easy run dropped — schedule too dense.');
      }
    }
  };

  if (!placeStrengthBeforeEasyRun) {
    placeEasyRun();
  }

  // ── Strength placement ──────────────────────────────────────────────────
  const placeThirdStrengthIfNeeded = (): void => {
    if (strengthFreq < 3 || strengthDays.length < 2) return;
    const existingKinds = strengthDays.map((d) =>
      days[d].find((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength')?.kind,
    );
    const lowerCount = existingKinds.filter((k) => k === 'lower_body_strength').length;
    const upperCount = existingKinds.filter((k) => k === 'upper_body_strength').length;
    const thirdKind: SessionKind = upperCount > lowerCount ? 'lower_body_strength' : 'upper_body_strength';

    let thirdDay: DayName | undefined;
    for (const c of ALL_DAYS) {
      if (strengthDays.includes(c)) continue;
      if (c === longRide || c === longRun) continue;
      if (thirdKind === 'lower_body_strength' && noLowerBody.has(c)) continue;
      if (!canPlace(days, c, thirdKind)) continue;
      if (!sequentialOk(days, c, thirdKind, inputs.athlete)) continue;
      const ok = strengthDays.every((s) => {
        const gap = Math.abs(DAY_INDEX[c] - DAY_INDEX[s]);
        const wrap = Math.min(gap, 7 - gap);
        return wrap >= 2;
      });
      if (!ok) continue;
      thirdDay = c;
      break;
    }
    if (thirdDay) {
      place(days, thirdDay, thirdKind);
      strengthDays.push(thirdDay);
    } else {
      conflicts.push(
        `lower_body_strength (session 3 of 3): no day with required 2-day spacing — 48h pre-sovereign rule also blocks the day before long_ride (${longRide}) and long_run (${longRun}); consider reducing to 2× strength or dropping a swim/easy session.`,
      );
      trade_offs.push('Strength frequency reduced from 3× to 2× — week too dense for 3× without conflict.');
    }
  };

  if (strengthFreq >= 1) {
    if (strengthFreq >= 2 && isCoEq) {
      // §4.15: bias toward athlete-preferred days when given. Index 0 = upper, 1 = lower.
      const preferredUpperDay = inputs.preferences.strength_preferred_days?.[0];
      const preferredLowerDay = inputs.preferences.strength_preferred_days?.[1];
      const upperOrder: DayName[] = biasOrderForPreferredDay(
        ['monday', 'thursday', 'tuesday', 'wednesday', 'friday'].filter((d) => !restDaySet.has(d as DayName)) as DayName[],
        preferredUpperDay && !restDaySet.has(preferredUpperDay) ? preferredUpperDay : undefined,
      );

      if (consolidatedQrLowerDay) {
        // §4.6: ≥3 days upper↔lower preferred, ≥2 days hard floor. Try the preferred spacing
        // first, then relax to the hard floor before declaring the week unschedulable.
        const findUpperWithSpacing = (minSpacing: number): DayName | undefined => {
          for (const uc of upperOrder) {
            if (uc === longRide || uc === longRun) continue;
            if (uc === consolidatedQrLowerDay) continue;
            if (!canPlace(days, uc, 'upper_body_strength')) continue;
            if (!sequentialOk(days, uc, 'upper_body_strength', inputs.athlete)) continue;
            const gap = Math.abs(DAY_INDEX[uc] - DAY_INDEX[consolidatedQrLowerDay]);
            const wrap = Math.min(gap, 7 - gap);
            if (wrap < minSpacing) continue;
            return uc;
          }
          return undefined;
        };
        let upperDay = findUpperWithSpacing(3);
        let strengthSpacingRelaxed = false;
        if (!upperDay) {
          upperDay = findUpperWithSpacing(2);
          strengthSpacingRelaxed = !!upperDay;
        }
        if (upperDay) {
          place(days, upperDay, 'upper_body_strength');
          strengthDays.push(upperDay);
          if (preferredUpperDay && upperDay !== preferredUpperDay) {
            conflicts.push(
              `strength_preferred_days: ${tfDay(preferredUpperDay)} (upper) rejected — placement rules excluded it; placed ${tfDay(upperDay)} instead.`,
            );
          }
          // Day-agnostic trade-off framing: reference the athlete's pinned default if they pinned
          // one; otherwise drop the "moved from default" prose entirely. The prior hardcoded
          // "Monday default" claim was wrong for athletes who never trained on Mondays. The
          // realized placement is in the calendar; the trade-off only adds value when it explains
          // a divergence from the ATHLETE's pinned intent.
          if (preferredUpperDay && upperDay !== preferredUpperDay) {
            trade_offs.push(
              `Strength: upper moved from your preferred ${tfDay(preferredUpperDay)} to ${tfDay(upperDay)} — spacing vs lower on ${tfDay(consolidatedQrLowerDay)}.`,
            );
          }
          if (strengthSpacingRelaxed) {
            trade_offs.push(
              `Strength: upper on ${tfDay(upperDay)} sits 2 days from lower on ${tfDay(consolidatedQrLowerDay)} (preferred 3) — densest gap that fits the long-day anchors and recovery rules.`,
            );
          }
          placeThirdStrengthIfNeeded();
        } else {
          conflicts.push(
            'CO_EQUAL_STRENGTH: consolidated quality_run+lower is set but no upper day with the ≥2-day hard-floor spacing — adjust the week.',
          );
        }
      } else {
        const lowerCandidatesBaseRaw: DayName[] = isPerf && qualityRunDay
          ? [qualityRunDay, 'thursday', 'friday', 'tuesday', 'wednesday', 'monday']
          : ['thursday', 'friday', 'tuesday', 'wednesday', 'monday'];
        const lowerCandidatesBase: DayName[] = biasOrderForPreferredDay(
          lowerCandidatesBaseRaw.filter((d) => !restDaySet.has(d)) as DayName[],
          preferredLowerDay && !restDaySet.has(preferredLowerDay) ? preferredLowerDay : undefined,
        );

        // §4.6: ≥3 days upper↔lower preferred, ≥2 days hard floor. The same loop is reused for
        // both passes — only the spacing threshold changes — so a relaxed pass can still honor
        // every other rule (sequential, matrix, no-lower-body sovereignty days).
        const findStrengthPair = (
          minSpacing: number,
          lowerRelax: SequentialRelax = {},
        ): { upper?: DayName; lower?: DayName; lowerTier?: ConcurrentSpacingTier } => {
          for (const uc of upperOrder) {
            if (uc === longRide || uc === longRun) continue;
            if (days[uc].length >= 2) continue;
            if (!canPlace(days, uc, 'upper_body_strength')) continue;
            if (!sequentialOk(days, uc, 'upper_body_strength', inputs.athlete)) continue;

            const trial = cloneDays(days);
            place(trial, uc, 'upper_body_strength');

            for (const lc of lowerCandidatesBase) {
              if (lc === uc) continue;
              if (lc === longRide || lc === longRun) continue;
              if (noLowerBody.has(lc)) continue;
              if (days[lc].length >= 2) continue;
              if (!canPlaceWithModifier(trial, lc, 'lower_body_strength', inputs.athlete)) continue;
              if (!sequentialOk(trial, lc, 'lower_body_strength', inputs.athlete, lowerRelax)) continue;
              const gap = Math.abs(DAY_INDEX[lc] - DAY_INDEX[uc]);
              const wrap = Math.min(gap, 7 - gap);
              if (wrap < minSpacing) continue;
              const lowerTier = concurrentSpacingTier(trial, lc, 'lower_body_strength');
              return { upper: uc, lower: lc, lowerTier };
            }
          }
          return {};
        };

        // §4.7 tier ladder: prefer CLEAN (no leg-quality adjacency) even at relaxed spacing
        // (≥2d upper↔lower) over SOFT (one-sided leg-quality adjacency) at preferred spacing
        // (≥3d). Concurrent-training research outweighs the upper↔lower spacing convention.
        //   1. CLEAN @ 3d → 2. CLEAN @ 2d → 3. SOFT @ 3d → 4. SOFT @ 2d → 5. SANDWICH @ 3d → 6. SANDWICH @ 2d
        let pair = findStrengthPair(3, {});
        let strengthSpacingRelaxed = false;
        if (!pair.upper || !pair.lower) {
          pair = findStrengthPair(2, {});
          strengthSpacingRelaxed = !!(pair.upper && pair.lower);
        }
        if (!pair.upper || !pair.lower) {
          pair = findStrengthPair(3, { allow_lower_adj_one_sided: true });
        }
        if (!pair.upper || !pair.lower) {
          pair = findStrengthPair(2, { allow_lower_adj_one_sided: true });
          if (pair.upper && pair.lower) strengthSpacingRelaxed = true;
        }
        if (!pair.upper || !pair.lower) {
          pair = findStrengthPair(3, { allow_lower_adj_one_sided: true, allow_lower_sandwich: true });
        }
        if (!pair.upper || !pair.lower) {
          pair = findStrengthPair(2, { allow_lower_adj_one_sided: true, allow_lower_sandwich: true });
          if (pair.upper && pair.lower) strengthSpacingRelaxed = true;
        }
        const { upper: upperDay, lower: lowerDay, lowerTier } = pair;

        if (upperDay && lowerDay) {
          place(days, upperDay, 'upper_body_strength');
          strengthDays.push(upperDay);
          const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;
          place(days, lowerDay, 'lower_body_strength', stacking ? { timing: 'PM' } : {});
          strengthDays.push(lowerDay);
          if (preferredUpperDay && upperDay !== preferredUpperDay) {
            conflicts.push(
              `strength_preferred_days: ${tfDay(preferredUpperDay)} (upper) rejected — placement rules excluded it; placed ${tfDay(upperDay)} instead.`,
            );
          }
          if (preferredLowerDay && lowerDay !== preferredLowerDay) {
            conflicts.push(
              `strength_preferred_days: ${tfDay(preferredLowerDay)} (lower) rejected — placement rules excluded it; placed ${tfDay(lowerDay)} instead.`,
            );
          }
          if (stacking) {
            // Bug 1 Piece B Slice 2: do NOT emit the QR+lower consolidation line
            // here (sibling of the Slice 1 deletion at :1237). Canonical-pattern
            // time; the builder may later split the day. Realized-accurate owner
            // is `collectQualityRunLowerBodyTradeOffs` (week-builder.ts). Coverage
            // gate verified: the builder emits whenever the realized plan actually
            // has QR+lower consolidated. (`stacking` stays load-bearing for the
            // PM-timing `place(... 'lower_body_strength' ...)` call above.)
            // Day-agnostic divergence message: only emit when the athlete pinned days that the
            // engine couldn't honor. Otherwise the realized placement IS the plan — no "moved from"
            // baseline to reference.
            const upperDiverges = preferredUpperDay && upperDay !== preferredUpperDay;
            const lowerDiverges = preferredLowerDay && lowerDay !== preferredLowerDay;
            if (upperDiverges || lowerDiverges) {
              trade_offs.push(
                `Strength: preferred ${preferredUpperDay ? tfDay(preferredUpperDay) : 'upper'} / ${preferredLowerDay ? tfDay(preferredLowerDay) : 'lower'} pattern could not stay — upper on ${tfDay(upperDay)}, lower on ${tfDay(lowerDay)} (heavy lower day stacks with your quality run).`,
              );
            }
          } else {
            const upperDiverges = preferredUpperDay && upperDay !== preferredUpperDay;
            const lowerDiverges = preferredLowerDay && lowerDay !== preferredLowerDay;
            if (upperDiverges || lowerDiverges) {
              trade_offs.push(
                `Strength: preferred ${preferredUpperDay ? tfDay(preferredUpperDay) : 'upper'} / ${preferredLowerDay ? tfDay(preferredLowerDay) : 'lower'} pattern shifted — upper on ${tfDay(upperDay)}, lower on ${tfDay(lowerDay)} — moved to stay clear of your pinned rides/runs and recovery spacing.`,
              );
            }
          }
          if (strengthSpacingRelaxed) {
            // §4.6: ≥3 days preferred, ≥2 days hard floor. The spacing relaxed here is a real
            // tradeoff (slightly less recovery between upper and lower), but it's the spec's
            // hard floor — better than dropping a strength session entirely.
            trade_offs.push(
              `Strength: upper on ${tfDay(upperDay)} sits 2 days from lower on ${tfDay(lowerDay)} (preferred 3) — densest gap that fits the long-day anchors and recovery rules.`,
            );
          }
          // §4.7 concurrent-training spacing trade-off — surface the compromise honestly when
          // the tier ladder fell through to SOFT or SANDWICH.
          emitConcurrentSpacingTradeOff(days, lowerDay, lowerTier, trade_offs);
          placeThirdStrengthIfNeeded();
        } else {
          conflicts.push(
            'CO_EQUAL_STRENGTH: 2× lifting was requested with co-equal (performance) intent, but no upper+lower pair fits the anchors even at the SANDWICH tier (§4.7 last-resort). Long-day 48h spacing is non-negotiable. Adjust the week (e.g. move easy_run after strength, trim swim, or shift long days) or get explicit athlete confirmation to downgrade to 1× strength.',
          );
        }
      }
    } else {
      // §4.15: bias toward athlete-preferred days when given. Index 0 = upper, 1 = lower.
      const preferredUpperDayNc = inputs.preferences.strength_preferred_days?.[0];
      const preferredLowerDayNc = inputs.preferences.strength_preferred_days?.[1];
      const nonCoeqUpperOrder: DayName[] = biasOrderForPreferredDay(
        ['monday', 'thursday', 'tuesday', 'wednesday', 'friday'].filter((d) => !restDaySet.has(d as DayName)) as DayName[],
        preferredUpperDayNc && !restDaySet.has(preferredUpperDayNc) ? preferredUpperDayNc : undefined,
      );
      let upperDay: DayName | undefined;
      for (const c of nonCoeqUpperOrder) {
        if (c === longRide || c === longRun) continue;
        if (days[c].length >= 2) continue;
        if (!canPlace(days, c, 'upper_body_strength')) continue;
        if (!sequentialOk(days, c, 'upper_body_strength', inputs.athlete)) continue;
        upperDay = c;
        break;
      }
      if (upperDay) {
        place(days, upperDay, 'upper_body_strength');
        strengthDays.push(upperDay);
        if (preferredUpperDayNc && upperDay !== preferredUpperDayNc) {
          conflicts.push(
            `strength_preferred_days: ${tfDay(preferredUpperDayNc)} (upper) rejected — placement rules excluded it; placed ${tfDay(upperDay)} instead.`,
          );
        }
        // Day-agnostic: only surface the relocation if the athlete pinned a specific day that
        // the engine couldn't honor. Without a pinned preference, the placement IS the plan;
        // there's no baseline to compare against (the prior code assumed Monday was a universal
        // default which is wrong for athletes who never train Mondays).
        if (preferredUpperDayNc && upperDay !== preferredUpperDayNc) {
          trade_offs.push(
            `Strength: upper moved from your preferred ${tfDay(preferredUpperDayNc)} to ${tfDay(upperDay)} (support / 1×–2× template).`,
          );
        }
      } else {
        conflicts.push(
          'upper_body_strength: no matrix-clean weekday found — try reducing strength to 0× or removing a quality session.',
        );
        trade_offs.push(
          `Strength frequency reduced from ${strengthFreq}× to 0× — anchors leave no compatible slot.`,
        );
      }

      if (strengthFreq >= 2) {
        const lowerCandidatesRaw: DayName[] = isPerf && qualityRunDay
          ? [qualityRunDay, 'thursday', 'friday', 'tuesday']
          : ['thursday', 'friday', 'tuesday', 'wednesday'];
        const lowerCandidates: DayName[] = biasOrderForPreferredDay(
          lowerCandidatesRaw.filter((d) => !restDaySet.has(d)) as DayName[],
          preferredLowerDayNc && !restDaySet.has(preferredLowerDayNc) ? preferredLowerDayNc : undefined,
        );

        // §4.7 tier ladder for the non-coeq path: try CLEAN with full ≥3d upper↔lower spacing,
        // then CLEAN with ≥2d, then SOFT with ≥3d, …, SANDWICH with ≥2d as last resort.
        const tryFindLower = (lowerRelax: SequentialRelax, minUpperSpacing: number, restrictTo?: DayName) => {
          for (const c of lowerCandidates) {
            if (restrictTo && c !== restrictTo) continue;
            if (upperDay && c === upperDay) continue;
            if (c === longRide || c === longRun) continue;
            if (noLowerBody.has(c)) continue;
            if (days[c].length >= 2) continue;
            if (!canPlaceWithModifier(days, c, 'lower_body_strength', inputs.athlete)) continue;
            if (!sequentialOk(days, c, 'lower_body_strength', inputs.athlete, lowerRelax)) continue;
            if (upperDay) {
              const gap = Math.abs(DAY_INDEX[c] - DAY_INDEX[upperDay]);
              const wrap = Math.min(gap, 7 - gap);
              if (wrap < minUpperSpacing) continue;
            }
            return { day: c, tier: concurrentSpacingTier(days, c, 'lower_body_strength') };
          }
          return undefined;
        };

        // §4.21 pin-respect: when the athlete pinned a specific lower day, try the pin FIRST
        // through every tier (CLEAN → SOFT → SANDWICH) before falling back to the algorithmic
        // tier ladder. This honors the athlete's preference even when a cleaner non-pin day
        // would be available — surfacing the cost via §4.21 trade-off message rather than
        // silently relocating. The fallback ladder still runs if the pin can't fit at any tier.
        let lowerHit: { day: DayName; tier: ConcurrentSpacingTier } | undefined;
        if (preferredLowerDayNc) {
          lowerHit = tryFindLower({}, 3, preferredLowerDayNc);
          if (!lowerHit) lowerHit = tryFindLower({}, 2, preferredLowerDayNc);
          if (!lowerHit) lowerHit = tryFindLower({ allow_lower_adj_one_sided: true }, 3, preferredLowerDayNc);
          if (!lowerHit) lowerHit = tryFindLower({ allow_lower_adj_one_sided: true }, 2, preferredLowerDayNc);
          if (!lowerHit) {
            lowerHit = tryFindLower({ allow_lower_adj_one_sided: true, allow_lower_sandwich: true }, 3, preferredLowerDayNc);
          }
          if (!lowerHit) {
            lowerHit = tryFindLower({ allow_lower_adj_one_sided: true, allow_lower_sandwich: true }, 2, preferredLowerDayNc);
          }
        }
        if (!lowerHit) lowerHit = tryFindLower({}, 3);
        if (!lowerHit) lowerHit = tryFindLower({}, 2);
        if (!lowerHit) lowerHit = tryFindLower({ allow_lower_adj_one_sided: true }, 3);
        if (!lowerHit) lowerHit = tryFindLower({ allow_lower_adj_one_sided: true }, 2);
        if (!lowerHit) {
          lowerHit = tryFindLower({ allow_lower_adj_one_sided: true, allow_lower_sandwich: true }, 3);
        }
        if (!lowerHit) {
          lowerHit = tryFindLower({ allow_lower_adj_one_sided: true, allow_lower_sandwich: true }, 2);
        }
        const lowerDay = lowerHit?.day;
        const lowerTier = lowerHit?.tier;
        if (lowerDay) {
          const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;
          place(days, lowerDay, 'lower_body_strength', stacking ? { timing: 'PM' } : {});
          strengthDays.push(lowerDay);
          if (preferredLowerDayNc && lowerDay !== preferredLowerDayNc) {
            conflicts.push(
              `strength_preferred_days: ${tfDay(preferredLowerDayNc)} (lower) rejected — placement rules excluded it; placed ${tfDay(lowerDay)} instead.`,
            );
          }
          if (stacking) {
            // Bug 1 Piece B Slice 2: dead twin of the co-equal-branch deletion
            // above — `stacking` requires isCoEq while this `else` branch requires
            // !isCoEq, so this never fires; removed only so the literal exists
            // nowhere in production. Realized-accurate owner is
            // `collectQualityRunLowerBodyTradeOffs` (week-builder.ts).
            // Day-agnostic divergence message (same pattern as the co-equal branch upstream).
            const upperDiverges = upperDay && preferredUpperDayNc && upperDay !== preferredUpperDayNc;
            const lowerDiverges = preferredLowerDayNc && lowerDay !== preferredLowerDayNc;
            if (upperDay && (upperDiverges || lowerDiverges)) {
              trade_offs.push(
                `Strength: preferred ${preferredUpperDayNc ? tfDay(preferredUpperDayNc) : 'upper'} / ${preferredLowerDayNc ? tfDay(preferredLowerDayNc) : 'lower'} pattern adjusted — upper on ${tfDay(upperDay)}, lower on ${tfDay(lowerDay)}.`,
              );
            }
          } else if (upperDay) {
            const upperDiverges = preferredUpperDayNc && upperDay !== preferredUpperDayNc;
            const lowerDiverges = preferredLowerDayNc && lowerDay !== preferredLowerDayNc;
            if (upperDiverges || lowerDiverges) {
              trade_offs.push(
                `Strength: preferred ${preferredUpperDayNc ? tfDay(preferredUpperDayNc) : 'upper'} / ${preferredLowerDayNc ? tfDay(preferredLowerDayNc) : 'lower'} pattern adjusted — upper on ${tfDay(upperDay)}, lower on ${tfDay(lowerDay)} (schedule constraints).`,
              );
            }
          }
          // §4.7 concurrent-training spacing trade-off — surface SOFT/SANDWICH compromises.
          emitConcurrentSpacingTradeOff(days, lowerDay, lowerTier, trade_offs);
        } else {
          conflicts.push(
            `lower_body_strength (session 2 of 2): no valid day found — 48h pre-sovereign rule blocks the day before long_ride (${longRide}) and long_run (${longRun}); consider reducing to 1× strength, dropping a quality session, or moving long_ride/long_run.`,
          );
          trade_offs.push(
            `Strength frequency reduced from ${strengthFreq}× to 1× — week too dense for ${strengthFreq}× without conflict.`,
          );
        }
      }

      placeThirdStrengthIfNeeded();
    }
  }

  if (placeStrengthBeforeEasyRun) {
    placeEasyRun();
  }

  strengthDays.sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);

  // ── Swims ───────────────────────────────────────────────────────────────
  // Order: easy first, quality second (matches combined-schedule-prefs.ts parser).
  const swimsPerWeek = inputs.preferences.swims_per_week;
  let swimSlots: { day: DayName; kind: SessionKind }[] = [];

  // D-064: only seed the swim placement loop from the masters_swim anchor when it
  // ACTUALLY placed (mastersSwimAnchor !== undefined). The earlier `mastersSwim` input
  // can be rejected (rest-day collision, matrix collision) — in that case the placement
  // loop must still emit `swimsPerWeek` swims, not `swimsPerWeek - 1`.
  if (mastersSwimAnchor) {
    swimSlots.push({ day: mastersSwimAnchor.day, kind: mastersSwimAnchor.kind });
  }

  // Quality-swim policy for the static template: always promote the *last* swim
  // slot to quality when no masters anchor exists. The combined-plan engine
  // layers actual swim intensity by phase (base → easy-only; build / race_specific
  // → quality at swim_quality_day); the template just earmarks the slot. This
  // matches the prompt rule "every swim slot must carry an explicit role".
  const haveQualityFromAnchor = swimSlots.some((s) => s.kind === 'quality_swim');
  const promoteQuality = !haveQualityFromAnchor && swimsPerWeek >= 1;
  void weeksInto; // reserved for future per-week derivation

  const remainingSwims = Math.max(0, swimsPerWeek - swimSlots.length);
  for (let i = 0; i < remainingSwims; i++) {
    const isLast = i === remainingSwims - 1;
    const kind: SessionKind = (isLast && promoteQuality) ? 'quality_swim' : 'easy_swim';

    // Base ordering: Mon/Thu-first weekday spread, then remaining weekdays → weekend.
    // Hard rule: each new swim must be ≥2 calendar steps from every swim already placed
    // (no ±1 adjacency, wrap-aware); then sort by (1) minimum gap vs swims already placed,
    // (2) day load, (3) base tiebreak.
    const baseOrder: DayName[] = [
      'monday', 'thursday', 'tuesday', 'friday', 'wednesday', 'sunday', 'saturday',
    ];
    const occupiedSwimDays = swimSlots.map((s) => s.day);
    const swimSpreadOk = (d: DayName) => !violatesMinimumSwimSpread(d, occupiedSwimDays);
    const dayLoad = (d: DayName): number => {
      const slots = days[d];
      let load = slots.length;
      // Heavy penalty for days already carrying any HIGH session — avoid 3-session stacks.
      if (slots.some((s) => s.fatigue === 'HIGH')) load += 5;
      return load;
    };
    const orderedRaw = baseOrder
      .filter((c) => !swimSlots.some((s) => s.day === c))
      .filter((c) => !restDaySet.has(c))
      .filter(swimSpreadOk)
      .sort((a, b) => {
        const gapA = swimSpreadGap(a, occupiedSwimDays);
        const gapB = swimSpreadGap(b, occupiedSwimDays);
        if (gapA !== gapB) return gapB - gapA;
        const loadDiff = dayLoad(a) - dayLoad(b);
        if (loadDiff !== 0) return loadDiff;
        return baseOrder.indexOf(a) - baseOrder.indexOf(b);
      });
    const preferredSwimDay = inputs.preferences.swim?.[swimSlots.length];
    const ordered =
      preferredSwimDay && !restDaySet.has(preferredSwimDay) && !swimSlots.some((s) => s.day === preferredSwimDay)
        ? [preferredSwimDay, ...orderedRaw.filter((d) => d !== preferredSwimDay)]
        : orderedRaw;

    // If the athlete stated a quality_run preference, protect that day from swim
    // placement — quality_run must be placed there later and cannot share with any swim kind.
    const reservedQrDay = inputs.preferences.quality_run;
    let picked: DayName | undefined;
    for (const c of ordered) {
      if (reservedQrDay && c === reservedQrDay && !qualityRunDay) continue;
      // Never create a 3-session day: swim should not land on a day that already
      // has 2 sessions even if each pairwise matrix check passes.
      if (days[c].length >= 2) continue;
      if (!swimSpreadOk(c)) continue;
      if (!canPlace(days, c, kind)) continue;
      picked = c;
      break;
    }
    if (picked) {
      place(days, picked, kind);
      swimSlots.push({ day: picked, kind });
    } else {
      const placedSoFar = swimSlots.length;
      conflicts.push(
        `swim #${placedSoFar + 1} (${kind}): no matrix-clean day found — consider reducing swims_per_week to ${placedSoFar} or removing an easy bike/run.`,
      );
      trade_offs.push(
        `Swim frequency reduced from ${swimsPerWeek}× to ${placedSoFar}× — week too dense for ${swimsPerWeek}× without conflict.`,
      );
      break; // stop trying further swims; the cascade message is the same.
    }
  }

  // Sort swims so swim[0] = easy_day, swim[1] = quality_day (parser convention).
  swimSlots.sort((a, b) => {
    const aQ = a.kind === 'quality_swim' ? 1 : 0;
    const bQ = b.kind === 'quality_swim' ? 1 : 0;
    return aQ - bQ;
  });

  balanceWeeklySessionLoad(days, trade_offs, {
    athlete: inputs.athlete,
    longRide,
    longRun,
    restDays: restDaySet,
    ...(mastersSwimAnchor ? { mastersSwim: mastersSwimAnchor } : {}),
    ...(groupRunAnchor ? { groupRunAnchor } : {}),
  });

  swimSlots = rebuildSwimSlotsFromDays(days);
  strengthDays = rebuildStrengthDaysFromDays(days);
  easyBikeDay = findDayWithKind(days, 'easy_bike');
  easyRunDay = findDayWithKind(days, 'easy_run');

  // ── Rest days from training-day budget ──────────────────────────────────
  const trainingDays = inputs.preferences.training_days;
  const restDays = new Set<DayName>(inputs.preferences.rest_days ?? []);
  const restNeeded = Math.max(0, 7 - trainingDays);

  if (restDays.size < restNeeded) {
    // Pass 1: claim already-empty days.
    const restOrder: DayName[] = ['monday', 'thursday', 'tuesday', 'friday', 'wednesday', 'sunday', 'saturday'];
    for (const c of restOrder) {
      if (restDays.size >= restNeeded) break;
      if (days[c].length === 0) restDays.add(c);
    }
    // Pass 2: displace LOW-only days (never anchors / quality / long).
    if (restDays.size < restNeeded) {
      for (const c of restOrder) {
        if (restDays.size >= restNeeded) break;
        if (restDays.has(c)) continue;
        if (c === longRide || c === longRun) continue;
        if (qualityBikeDay === c || qualityRunDay === c) continue;
        const slots = days[c];
        if (!slots.length) continue;
        const allLow = slots.every((s) => s.fatigue === 'LOW');
        if (allLow) {
          trade_offs.push(
            `${tfDay(c)} cleared for rest budget (${trainingDays}-day week); displaced ${slots.map((s) => s.kind).join(' + ')}.`,
          );
          days[c] = [];
          restDays.add(c);
        }
      }
    }
    if (restDays.size < restNeeded) {
      conflicts.push(
        `Couldn't fit ${restNeeded} rest day${restNeeded === 1 ? '' : 's'} into a ${trainingDays}-day week without dropping anchors or quality sessions.`,
      );
    }
  }

  // ── Third-strength upsell (arc-setup only): 2× co-equal landed clean + room for 3× ──
  let can_offer_third_strength = false;
  if (
    isPerf && isCoEq &&
    strengthFreq === 2 &&
    strengthDays.length === 2 &&
    !conflicts.some((c) => c.startsWith('CO_EQUAL_STRENGTH'))
  ) {
    const trial = cloneDays(days);
    const sd = [...strengthDays];
    const existingKinds = sd.map((d) =>
      trial[d].find((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength')?.kind,
    );
    const lowerCount = existingKinds.filter((k) => k === 'lower_body_strength').length;
    const upperCount = existingKinds.filter((k) => k === 'upper_body_strength').length;
    const thirdKind: SessionKind = upperCount > lowerCount ? 'lower_body_strength' : 'upper_body_strength';
    for (const c of ALL_DAYS) {
      if (sd.includes(c)) continue;
      if (c === longRide || c === longRun) continue;
      if (thirdKind === 'lower_body_strength' && noLowerBody.has(c)) continue;
      if (trial[c].some((s) => s.kind === 'quality_bike' || s.kind === 'quality_run')) continue;
      if (!canPlace(trial, c, thirdKind)) continue;
      if (!sequentialOk(trial, c, thirdKind, inputs.athlete)) continue;
      const ok = sd.every((s) => {
        const gap = Math.abs(DAY_INDEX[c] - DAY_INDEX[s]);
        return Math.min(gap, 7 - gap) >= 2;
      });
      if (!ok) continue;
      can_offer_third_strength = true;
      break;
    }
  }

  // ── Build preferred_days ────────────────────────────────────────────────
  // Scrub stale assignments: rest-day displacement may have cleared a day that
  // a `*Day` variable still references. Only emit a key when the day actually
  // carries the matching session.
  const dayHasKind = (d: DayName | undefined, k: SessionKind): boolean =>
    !!d && days[d].some((s) => s.kind === k);

  const finalSwims = swimSlots.filter(
    (s) => days[s.day].some((slot) => slot.kind === s.kind),
  );
  const strengthDaysPresent = strengthDays.filter(
    (d) => days[d].some((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength'),
  );
  const finalStrength = strengthPreferredSlotsFromWeek(days, strengthDaysPresent);
  const swimArray = finalSwims.map((s) => s.day);

  const preferred_days: PreferredDaysOut = {
    long_ride: longRide,
    long_run: longRun,
    ...(dayHasKind(qualityBikeDay, 'quality_bike') ? { quality_bike: qualityBikeDay! } : {}),
    ...(dayHasKind(easyBikeDay, 'easy_bike') ? { easy_bike: easyBikeDay! } : {}),
    ...(dayHasKind(qualityRunDay, 'quality_run') ? { quality_run: qualityRunDay! } : {}),
    ...(dayHasKind(easyRunDay, 'easy_run') ? { easy_run: easyRunDay! } : {}),
    ...(swimArray.length ? { swim: swimArray } : {}),
    ...(finalStrength.length ? { strength: finalStrength } : {}),
  };

  const placedSlotsSummary = ALL_DAYS.map((d) => {
    const kinds = days[d].map((s) => s.kind);
    return kinds.length ? `${d}=${kinds.join('+')}` : null;
  }).filter(Boolean).join('; ') || '(none)';
  console.log(
    `[optimal-week] placed slots: ${placedSlotsSummary}; preferred_days_keys=${Object.keys(preferred_days).join(',')}`,
  );

  return {
    days,
    rest_days: [...restDays].sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]),
    preferred_days,
    trade_offs,
    conflicts,
    ...(can_offer_third_strength ? { can_offer_third_strength: true } : {}),
  };
}

/** Conflicts that mean 2× co-equal strength could not be placed — see `deriveOptimalWeekWithCoEqualRecovery`. */
export const CO_EQUAL_STRENGTH_CONFLICT_PREFIX = 'CO_EQUAL_STRENGTH';

/**
 * Arc-setup + materialize entry: if 2× **performance** strength cannot be placed, retry at **1×**
 * so the athlete sees a workable week and a **non-vague** recovery line instead of a silent
 * partial schedule or a dead-end conflict card alone.
 */
export function deriveOptimalWeekWithCoEqualRecovery(
  inputs: WeekOptimizerInputs,
): { week: OptimalWeek; used_co_equal_1x_fallback: boolean } {
  const first = deriveOptimalWeek(inputs);
  const wantsCoEq2x =
    inputs.athlete.strength_intent === 'performance' &&
    inputs.preferences.strength_frequency >= 2;
  const coEqualFailed = first.conflicts.some((c) =>
    c.startsWith(CO_EQUAL_STRENGTH_CONFLICT_PREFIX),
  );
  if (!wantsCoEq2x || !coEqualFailed) {
    return { week: first, used_co_equal_1x_fallback: false };
  }

  const retry = deriveOptimalWeek({
    ...inputs,
    preferences: {
      ...inputs.preferences,
      strength_frequency: 1 as 0 | 1 | 2 | 3,
    },
  });

  const recoveryLine =
    'CO_EQUAL_STRENGTH (recovery): 2× co-equal strength could not fit these anchors — this output is a provisional 1× strength week. The athlete must choose: move a fixed day (long ride, group bike, run club, or swim block), or explicitly accept 1× strength until the schedule fits. Do not describe this as a vague “small adjustment”; name the constraint.';

  // §4.15 transparency lines (`strength_preferred_days: <day> rejected ...`) are informational —
  // they tell the caller that the athlete's preferred day couldn't be honored, but the optimizer
  // still produced a valid placement. They must NOT cause the recovery wrapper to discard retry's
  // grid, otherwise the 1× retry's correctly-placed sessions (e.g. 3rd swim) get lost.
  const blockingRetryConflicts = retry.conflicts.filter(
    (c) => !c.startsWith('strength_preferred_days:'),
  );

  if (blockingRetryConflicts.length > 0) {
    return {
      week: {
        ...first,
        trade_offs: [
          ...first.trade_offs,
          ...retry.trade_offs,
          `${recoveryLine} 1× retry still has CONFLICTS — needs coach-led anchor edits before save.`,
        ],
        conflicts: [...first.conflicts, ...retry.conflicts],
      },
      used_co_equal_1x_fallback: false,
    };
  }

  return {
    week: {
      ...retry,
      trade_offs: [...retry.trade_offs, recoveryLine],
      conflicts: retry.conflicts,
    },
    used_co_equal_1x_fallback: true,
  };
}

// ── Validator (reusable) ────────────────────────────────────────────────────

/**
 * Lightweight validator for an existing `preferred_days`-shaped object.
 * Returns a list of conflict strings; empty means the week is matrix-OK.
 *
 * Used by the materializer to decide whether to repair via deriveOptimalWeek().
 *
 * @param preferences Used for strength_preferred_days conflict hints only; sequential rules
 *   always apply to every pinned day (including quality_run — §4.5 vs quality_bike).
 */
export function validatePreferredDays(
  pd: PreferredDaysOut,
  athlete: WeekOptimizerInputs['athlete'] = {},
  preferences?: WeekOptimizerInputs['preferences'],
): string[] {
  const days = emptyWeek();
  const out: string[] = [];

  const qrDay = pd.quality_run;
  const strengthDaysOnly = normalizeStrengthPreferredEntries(pd.strength).map((s) => s.day);
  const stArr = strengthDaysOnly.length ? strengthDaysOnly : undefined;

  /** Same last-resort as `placeEasyRun` when the only slot is the day after long_run. */
  function sequentialRelaxForSlot(
    day: DayName,
    kind: SessionKind,
    base?: SequentialRelax,
  ): SequentialRelax | undefined {
    if (
      kind === 'easy_run' &&
      pd.long_run != null &&
      day === dayAfter(pd.long_run)
    ) {
      return { ...base, allow_easy_run_after_long_run: true };
    }
    return base;
  }

  function tryPlace(
    day: DayName | undefined,
    kind: SessionKind,
    label: string,
    seqRelax?: SequentialRelax,
    skipSequential = false,
  ) {
    if (!day) return;
    const stackLowerWithQr =
      kind === 'lower_body_strength' &&
      athlete.training_intent === 'performance' &&
      athlete.strength_intent === 'performance' &&
      days[day].some((s) => s.kind === 'quality_run');
    if (stackLowerWithQr) {
      if (!canPlaceWithModifier(days, day, kind, athlete)) {
        out.push(
          `${label} on ${day} fails quality_run + lower_body pairing vs ${days[day].map((s) => s.kind).join(' + ')}.`,
        );
        return;
      }
    } else {
      if (!canPlace(days, day, kind)) {
        out.push(`${label} on ${day} fails same-day matrix vs ${days[day].map((s) => s.kind).join(' + ')}.`);
        return;
      }
    }
    if (!skipSequential && !sequentialOk(days, day, kind, athlete, sequentialRelaxForSlot(day, kind, seqRelax))) {
      out.push(`${label} on ${day} fails sequential rules (yesterday: ${(days[dayBefore(day)] ?? []).map((s) => s.kind).join(' + ') || 'rest'}).`);
      return;
    }
    place(days, day, kind);
  }

  tryPlace(pd.long_ride, 'long_ride', 'long_ride');
  tryPlace(pd.long_run, 'long_run', 'long_run');
  tryPlace(pd.quality_bike, 'quality_bike', 'quality_bike');
  tryPlace(pd.quality_run, 'quality_run', 'quality_run');
  tryPlace(pd.easy_bike, 'easy_bike', 'easy_bike');
  tryPlace(pd.easy_run, 'easy_run', 'easy_run');

  for (const { day, kind } of normalizeStrengthPreferredEntries(pd.strength)) {
    // §4.7: validate against the most permissive tier (SANDWICH allowed). The optimizer's tier
    // ladder may have produced a SOFT or SANDWICH placement when the athlete's anchors leave no
    // CLEAN day; validatePreferredDays should NOT re-reject those — it's an integrity check, not
    // a re-optimization. The athlete-visible compromise is surfaced via the §4.7 trade-off
    // message at placement time.
    const relax: SequentialRelax | undefined =
      kind === 'lower_body_strength'
        ? { allow_lower_adj_one_sided: true, allow_lower_sandwich: true }
        : undefined;
    tryPlace(day, kind, `strength(${kind})`, relax);
  }
  // Swim ordering: [easy, quality].
  if (Array.isArray(pd.swim)) {
    pd.swim.forEach((d, i) => {
      tryPlace(d, i === 1 ? 'quality_swim' : 'easy_swim', `swim[${i}]`);
    });
  }

  return out;
}

// ── Day-name normalization (Sun-first index ↔ name) ────────────────────────

const DAY_ALIASES: Record<string, DayName> = {
  sun: 'sunday', sunday: 'sunday',
  mon: 'monday', monday: 'monday',
  tue: 'tuesday', tues: 'tuesday', tuesday: 'tuesday',
  wed: 'wednesday', weds: 'wednesday', wednesday: 'wednesday',
  thu: 'thursday', thur: 'thursday', thurs: 'thursday', thursday: 'thursday',
  fri: 'friday', friday: 'friday',
  sat: 'saturday', saturday: 'saturday',
};

export function normalizeDayName(raw: unknown): DayName | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'day' in raw) {
    return normalizeDayName((raw as { day: unknown }).day);
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
    return ALL_DAYS[raw];
  }
  const s = String(raw).trim().toLowerCase().replace(/\.$/, '');
  return DAY_ALIASES[s];
}
