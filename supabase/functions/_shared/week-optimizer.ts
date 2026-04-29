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
    /** Optional explicit rest days (Sun-first day names). Server fills the rest. */
    rest_days?: DayName[];
    /**
     * Weekdays where a standalone mid-week quality/hard bike must not land (e.g. athlete
     * avoids hard efforts that day). Does not remove an explicit quality_bike anchor.
     */
    hard_bike_avoid_days?: DayName[];
  };
  athlete: {
    training_intent?: 'performance' | 'completion' | 'first_race' | 'comeback';
    strength_intent?: 'performance' | 'support';
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

export interface PreferredDaysOut {
  long_ride?: DayName;
  quality_bike?: DayName;
  easy_bike?: DayName;
  long_run?: DayName;
  quality_run?: DayName;
  easy_run?: DayName;
  /** Ordered [easy_day, quality_day]. Single element → that day is both. */
  swim?: DayName[];
  /** Chronological list of strength weekdays (1–3). */
  strength?: DayName[];
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

/** Shoulder / pull load: avoid quality_swim stacked with upper-body lifting. */
function dayHasUpperStrength(slots: SessionSlot[]): boolean {
  return slots.some((s) => s.kind === 'upper_body_strength');
}

function dayHasQualitySwim(slots: SessionSlot[]): boolean {
  return slots.some((s) => s.kind === 'quality_swim');
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
  const isPerf = athlete.training_intent === 'performance';
  const isCoEq = athlete.strength_intent === 'performance';
  const existing = days[day];
  if (!existing || existing.length !== 1) return false;
  const there = existing[0].kind;

  // Performance + co-equal strength: quality_run + lower_body_strength → consolidated hard day (AM run / PM lift).
  if (isPerf && isCoEq) {
    if (kind === 'lower_body_strength' && there === 'quality_run') return true;
    if (kind === 'quality_run' && there === 'lower_body_strength') return true;
  }
  // (quality_swim + quality_run is already matrix-true via easy_swim row; no override needed.)
  return false;
}

/**
 * Sequential rules between adjacent days (mirrors SEQUENTIAL_RULES_TEXT).
 * Returns false when placing `kind` on `day` would violate.
 *
 * EXPERIENCE MODIFIER for same-day stacks is handled in \`canPlaceWithModifier\`,
 * not here — adjacent-day quality_bike ↔ quality_run is always forbidden.
 */
export type SequentialRelax = {
  allow_easy_run_after_long_run?: boolean;
  /**
   * performance + co-equal: quality_run the calendar day after quality_bike is normally
   * forbidden; allowed when lower_body_strength is placed same day (AM run / PM lift).
   */
  quality_run_day_after_qb_with_same_day_lower?: boolean;
};

function sequentialOk(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
  _athlete: WeekOptimizerInputs['athlete'],
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

  // Prev day was quality_bike → today: no quality_bike, no quality_run — except
  // consolidated hard day (performance + co-equal): QR + lower same day (EXPERIENCE_MODIFIER).
  if (prevKinds.includes('quality_bike')) {
    if (kind === 'quality_bike') return false;
    if (kind === 'quality_run') {
      if (relax?.quality_run_day_after_qb_with_same_day_lower) return true;
      return false;
    }
  }
  // Prev day was quality_run → today: no quality_bike, no quality_run.
  if (prevKinds.includes('quality_run')) {
    if (kind === 'quality_run') return false;
    if (kind === 'quality_bike') return false;
  }
  // Next day already has quality_bike → today cannot be quality_run (easy day
  // before anchored hammer / group ride). Symmetric guard for quality_bike
  // placement after a quality_run day.
  if (nextKinds.includes('quality_bike') && kind === 'quality_run') return false;
  if (nextKinds.includes('quality_run') && kind === 'quality_bike') return false;

  // 48h gap before next lower-leg-heavy work after lower_body_strength.
  if (kind === 'lower_body_strength' || kind === 'long_run') {
    const twoBackKinds = (days[nDaysAfter(day, -2)] ?? []).map((s) => s.kind);
    if (prevKinds.includes('lower_body_strength')) return false;
    if (twoBackKinds.includes('lower_body_strength')) return false;
  }

  // 48h gap BEFORE sovereign days: lower_body_strength the day before long_ride
  // or long_run leaves only 24h for leg recovery — block it.
  // (Upper body is unaffected; legs are not the limiter for upper work.)
  if (kind === 'lower_body_strength') {
    const nextKinds = (days[dayAfter(day)] ?? []).map((s) => s.kind);
    if (nextKinds.includes('long_ride') || nextKinds.includes('long_run')) return false;
  }

  return true;
}

/** Days that must not host lower_body_strength (leg sovereignty / recovery). */
function lowerBodyBlockedDays(longRide: DayName, longRun: DayName): Set<DayName> {
  return new Set<DayName>([longRide, longRun, dayBefore(longRide), dayBefore(longRun)]);
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

  const qualityBikeAnchor = asAnchor(inputs.anchors?.quality_bike);
  const groupRun = inputs.anchors?.group_run;
  const mastersSwim = inputs.anchors?.masters_swim;

  if (qualityBikeAnchor) {
    if (qualityBikeAnchor.day === longRide || qualityBikeAnchor.day === longRun) {
      conflicts.push(
        `quality_bike anchor on ${qualityBikeAnchor.day} collides with long-day anchor; pick a different group-ride day.`,
      );
    } else if (canPlace(days, qualityBikeAnchor.day, 'quality_bike')) {
      place(days, qualityBikeAnchor.day, 'quality_bike', { note: qualityBikeAnchor.note });
    }
  }

  if (groupRun) {
    const intensity = groupRun.intensity ?? 'easy';
    const kind: SessionKind =
      intensity === 'quality' ? 'quality_run' :
        intensity === 'long' ? 'long_run' : 'easy_run';
    if (!(intensity === 'long' && groupRun.day === longRun)) {
      if (canPlace(days, groupRun.day, kind)) {
        place(days, groupRun.day, kind, { note: groupRun.note });
      } else {
        conflicts.push(
          `group_run anchor (${kind}) on ${groupRun.day} doesn't pass the same-day matrix.`,
        );
      }
    }
  }

  if (mastersSwim) {
    const kind: SessionKind = mastersSwim.intensity === 'easy' ? 'easy_swim' : 'quality_swim';
    if (canPlace(days, mastersSwim.day, kind)) {
      place(days, mastersSwim.day, kind, { note: mastersSwim.note });
    } else {
      conflicts.push(
        `masters_swim anchor (${kind}) on ${mastersSwim.day} doesn't pass the same-day matrix.`,
      );
    }
  }

  // ── quality_bike (if no anchor) ──────────────────────────────────────────
  let qualityBikeDay: DayName | undefined =
    qualityBikeAnchor && !conflicts.length ? qualityBikeAnchor.day : qualityBikeAnchor?.day;
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
          `quality_bike: hard_bike_avoid_days ruled out all mid-week candidates — placed on ${qualityBikeDay} instead.`,
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
    /** Hard-banned days for quality_run (never day before long_ride; never bracketing anchored quality_bike). */
    const blockedQr = new Set<DayName>([longRide, longRun, dayBefore(longRide)]);
    if (qualityBikeDay) {
      blockedQr.add(qualityBikeDay);
      blockedQr.add(dayBefore(qualityBikeDay));
      blockedQr.add(dayAfter(qualityBikeDay));
    }

    const prio: DayName[] = [];
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

  // Performance + co-equal: before dropping quality_run, try AM run / PM lower on one day
  // (often day-after anchored quality_bike) — EXPERIENCE_MODIFIER / same-day matrix exception.
  const strengthFreqEarly = inputs.preferences.strength_frequency;
  if (
    !qualityRunDay &&
    isPerf &&
    isCoEq &&
    strengthFreqEarly >= 2
  ) {
    const candidates: DayName[] = [];
    if (qualityBikeDay) {
      candidates.push(dayAfter(qualityBikeDay));
      candidates.push(nDaysAfter(qualityBikeDay, 2));
    }
    for (const d of ALL_DAYS) {
      if (!candidates.includes(d)) candidates.push(d);
    }
    for (const d of candidates) {
      if (d === longRide || d === longRun) continue;
      if (d === dayBefore(longRide)) continue;
      if (noLowerBody.has(d)) continue;
      if (qualityBikeDay && d === qualityBikeDay) continue;

      const trial = cloneDays(days);
      if (!sequentialOk(trial, d, 'quality_run', inputs.athlete, {
        quality_run_day_after_qb_with_same_day_lower: true,
      })) continue;
      if (!canPlace(trial, d, 'quality_run')) continue;
      place(trial, d, 'quality_run');
      if (!canPlaceWithModifier(trial, d, 'lower_body_strength', inputs.athlete)) continue;
      if (!sequentialOk(trial, d, 'lower_body_strength', inputs.athlete)) continue;

      place(days, d, 'quality_run');
      place(days, d, 'lower_body_strength', { timing: 'PM' });
      qualityRunDay = d;
      consolidatedQrLowerDay = d;
      trade_offs.push(
        `quality_run + lower_body_strength consolidated on ${d} (AM run / PM lift) — performance + co-equal; no standalone quality_run slot (EXPERIENCE_MODIFIER).`,
      );
      break;
    }
  }

  if (!qualityRunDay) {
    conflicts.push(
      'quality_run: no valid placement — even consolidated AM run / PM lower could not be scheduled; move group ride, long days, or strength frequency.',
    );
    trade_offs.push('Quality run not placed — tighten anchors or confirm a schedule change with the athlete.');
  }

  // ── easy_bike (mid-week) ─────────────────────────────────────────────────
  let easyBikeDay: DayName | undefined;
  for (const c of ['wednesday', 'tuesday', 'thursday', 'monday', 'friday'] as DayName[]) {
    if (c === longRide || c === longRun) continue;
    if (qualityBikeDay && c === qualityBikeDay) continue;
    if (qualityRunDay && c === qualityRunDay) continue;
    if (!canPlace(days, c, 'easy_bike')) continue;
    easyBikeDay = c;
    place(days, c, 'easy_bike');
    break;
  }
  if (!easyBikeDay) {
    conflicts.push(
      'easy_bike: no matrix-clean weekday available — try freeing up a quality day or trimming swim/strength frequency.',
    );
    trade_offs.push('Mid-week easy bike dropped — schedule too dense.');
  }

  const strengthFreq = inputs.preferences.strength_frequency;
  /** Co-equal 2–3×: place gym before easy_run so Mon is not stolen by easy_run before lower can land. */
  const placeStrengthBeforeEasyRun = strengthFreq >= 2 && isCoEq;
  const strengthDays: DayName[] = [];
  if (consolidatedQrLowerDay) {
    strengthDays.push(consolidatedQrLowerDay);
  }
  let easyRunDay: DayName | undefined;

  const placeEasyRun = (): void => {
    const easyRunOrder: DayName[] = ['friday', 'monday', 'tuesday', 'wednesday', 'thursday'];
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
        trade_offs.push(
          `easy_run on ${dAfterLongRun} immediately follows long_run (${longRun}) — last resort; prefer swim or rest that day when possible.`,
        );
      }
    }
    if (picked) {
      easyRunDay = picked;
      place(days, picked, 'easy_run');
    } else {
      conflicts.push(
        'easy_run: no matrix-clean weekday available — try removing a strength session or moving the quality_run.',
      );
      trade_offs.push('Mid-week easy run dropped — schedule too dense.');
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
      const upperOrder: DayName[] = ['monday', 'thursday', 'tuesday', 'wednesday', 'friday'];

      if (consolidatedQrLowerDay) {
        let upperDay: DayName | undefined;
        for (const uc of upperOrder) {
          if (uc === longRide || uc === longRun) continue;
          if (uc === consolidatedQrLowerDay) continue;
          if (dayHasQualitySwim(days[uc])) continue;
          if (!canPlace(days, uc, 'upper_body_strength')) continue;
          if (!sequentialOk(days, uc, 'upper_body_strength', inputs.athlete)) continue;
          const gap = Math.abs(DAY_INDEX[uc] - DAY_INDEX[consolidatedQrLowerDay]);
          const wrap = Math.min(gap, 7 - gap);
          if (wrap < 3) continue;
          upperDay = uc;
          break;
        }
        if (upperDay) {
          place(days, upperDay, 'upper_body_strength');
          strengthDays.push(upperDay);
          placeThirdStrengthIfNeeded();
        } else {
          conflicts.push(
            'CO_EQUAL_STRENGTH: consolidated quality_run+lower is set but no upper day with ≥3d spacing — adjust the week.',
          );
        }
      } else {
        const lowerCandidatesBase: DayName[] = isPerf && qualityRunDay
          ? [qualityRunDay, 'thursday', 'friday', 'tuesday', 'wednesday', 'monday']
          : ['thursday', 'friday', 'tuesday', 'wednesday', 'monday'];

        let upperDay: DayName | undefined;
        let lowerDay: DayName | undefined;

        for (const uc of upperOrder) {
          if (uc === longRide || uc === longRun) continue;
          if (dayHasQualitySwim(days[uc])) continue;
          if (!canPlace(days, uc, 'upper_body_strength')) continue;
          if (!sequentialOk(days, uc, 'upper_body_strength', inputs.athlete)) continue;

          const trial = cloneDays(days);
          place(trial, uc, 'upper_body_strength');

          for (const lc of lowerCandidatesBase) {
            if (lc === uc) continue;
            if (lc === longRide || lc === longRun) continue;
            if (noLowerBody.has(lc)) continue;
            if (!canPlaceWithModifier(trial, lc, 'lower_body_strength', inputs.athlete)) continue;
            if (!sequentialOk(trial, lc, 'lower_body_strength', inputs.athlete)) continue;
            const gap = Math.abs(DAY_INDEX[lc] - DAY_INDEX[uc]);
            const wrap = Math.min(gap, 7 - gap);
            if (wrap < 3) continue;
            upperDay = uc;
            lowerDay = lc;
            break;
          }
          if (lowerDay) break;
        }

        if (upperDay && lowerDay) {
          place(days, upperDay, 'upper_body_strength');
          strengthDays.push(upperDay);
          const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;
          place(days, lowerDay, 'lower_body_strength', stacking ? { timing: 'PM' } : {});
          strengthDays.push(lowerDay);
          if (stacking) {
            trade_offs.push(
              `lower_body_strength stacked with quality_run on ${lowerDay} (AM run / PM lift) — consolidated hard day per EXPERIENCE MODIFIER (performance + co-equal strength).`,
            );
          }
          placeThirdStrengthIfNeeded();
        } else {
          conflicts.push(
            'CO_EQUAL_STRENGTH: 2× lifting was requested with co-equal (performance) intent, but no valid upper+lower pair fits the anchors. Do not treat 1× as sufficient — adjust the week (e.g. move easy_run after strength, trim swim, or shift long days) or get explicit athlete confirmation to downgrade.',
          );
        }
      }
    } else {
      let upperDay: DayName | undefined;
      for (const c of ['monday', 'thursday', 'tuesday', 'wednesday', 'friday'] as DayName[]) {
        if (c === longRide || c === longRun) continue;
        if (dayHasQualitySwim(days[c])) continue;
        if (!canPlace(days, c, 'upper_body_strength')) continue;
        if (!sequentialOk(days, c, 'upper_body_strength', inputs.athlete)) continue;
        upperDay = c;
        break;
      }
      if (upperDay) {
        place(days, upperDay, 'upper_body_strength');
        strengthDays.push(upperDay);
      } else {
        conflicts.push(
          'upper_body_strength: no matrix-clean weekday found — try reducing strength to 0× or removing a quality session.',
        );
        trade_offs.push(
          `Strength frequency reduced from ${strengthFreq}× to 0× — anchors leave no compatible slot.`,
        );
      }

      if (strengthFreq >= 2) {
        const lowerCandidates: DayName[] = isPerf && qualityRunDay
          ? [qualityRunDay, 'thursday', 'friday', 'tuesday']
          : ['thursday', 'friday', 'tuesday', 'wednesday'];

        let lowerDay: DayName | undefined;
        for (const c of lowerCandidates) {
          if (upperDay && c === upperDay) continue;
          if (c === longRide || c === longRun) continue;
          if (noLowerBody.has(c)) continue;
          if (!canPlaceWithModifier(days, c, 'lower_body_strength', inputs.athlete)) continue;
          if (!sequentialOk(days, c, 'lower_body_strength', inputs.athlete)) continue;
          if (upperDay) {
            const gap = Math.abs(DAY_INDEX[c] - DAY_INDEX[upperDay]);
            const wrap = Math.min(gap, 7 - gap);
            if (wrap < 3) continue;
          }
          lowerDay = c;
          break;
        }
        if (lowerDay) {
          const stacking = qualityRunDay === lowerDay && isPerf && isCoEq;
          place(days, lowerDay, 'lower_body_strength', stacking ? { timing: 'PM' } : {});
          strengthDays.push(lowerDay);
          if (stacking) {
            trade_offs.push(
              `lower_body_strength stacked with quality_run on ${lowerDay} (AM run / PM lift) — consolidated hard day per EXPERIENCE MODIFIER (performance + co-equal strength).`,
            );
          }
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
  const swimSlots: { day: DayName; kind: SessionKind }[] = [];

  if (mastersSwim) {
    const kind: SessionKind = mastersSwim.intensity === 'easy' ? 'easy_swim' : 'quality_swim';
    swimSlots.push({ day: mastersSwim.day, kind });
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

    // Base ordering: Tuesday → Thursday → Friday → Wednesday → Monday → weekend.
    // Then bias: less-loaded days first, never stack onto quality+strength days.
    const baseOrder: DayName[] = ['tuesday', 'thursday', 'friday', 'wednesday', 'monday', 'sunday', 'saturday'];
    const dayLoad = (d: DayName): number => {
      const slots = days[d];
      let load = slots.length;
      // Heavy penalty for days already carrying any HIGH session — avoid 3-session stacks.
      if (slots.some((s) => s.fatigue === 'HIGH')) load += 5;
      return load;
    };
    const ordered = baseOrder
      .filter((c) => !swimSlots.some((s) => s.day === c))
      .sort((a, b) => dayLoad(a) - dayLoad(b));

    let picked: DayName | undefined;
    for (const c of ordered) {
      if (!canPlace(days, c, kind)) continue;
      if (kind === 'quality_swim' && dayHasUpperStrength(days[c])) continue;
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
            `${c} cleared for rest budget (${trainingDays}-day week); displaced ${slots.map((s) => s.kind).join(' + ')}.`,
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
  const finalStrength = strengthDays.filter(
    (d) => days[d].some((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength'),
  );
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

  return {
    days,
    rest_days: [...restDays].sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]),
    preferred_days,
    trade_offs,
    conflicts,
    ...(can_offer_third_strength ? { can_offer_third_strength: true } : {}),
  };
}

// ── Validator (reusable) ────────────────────────────────────────────────────

/**
 * Lightweight validator for an existing `preferred_days`-shaped object.
 * Returns a list of conflict strings; empty means the week is matrix-OK.
 *
 * Used by the materializer to decide whether to repair via deriveOptimalWeek().
 */
export function validatePreferredDays(
  pd: PreferredDaysOut,
  athlete: WeekOptimizerInputs['athlete'] = {},
): string[] {
  const days = emptyWeek();
  const out: string[] = [];

  const qrDay = pd.quality_run;
  const stArr = pd.strength;
  const consolidatedQrLower =
    athlete.training_intent === 'performance' &&
    athlete.strength_intent === 'performance' &&
    qrDay != null &&
    Array.isArray(stArr) &&
    stArr.includes(qrDay);

  function tryPlace(
    day: DayName | undefined,
    kind: SessionKind,
    label: string,
    seqRelax?: SequentialRelax,
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
    if (!sequentialOk(days, day, kind, athlete, seqRelax)) {
      out.push(`${label} on ${day} fails sequential rules (yesterday: ${(days[dayBefore(day)] ?? []).map((s) => s.kind).join(' + ') || 'rest'}).`);
      return;
    }
    place(days, day, kind);
  }

  tryPlace(pd.long_ride, 'long_ride', 'long_ride');
  tryPlace(pd.long_run, 'long_run', 'long_run');
  tryPlace(pd.quality_bike, 'quality_bike', 'quality_bike');
  tryPlace(
    pd.quality_run,
    'quality_run',
    'quality_run',
    consolidatedQrLower ? { quality_run_day_after_qb_with_same_day_lower: true } : undefined,
  );
  tryPlace(pd.easy_bike, 'easy_bike', 'easy_bike');
  tryPlace(pd.easy_run, 'easy_run', 'easy_run');

  // Strength: kinds unknown from preferred_days; assume upper for first, lower for second.
  if (Array.isArray(pd.strength)) {
    pd.strength.forEach((d, i) => {
      tryPlace(d, i === 0 ? 'upper_body_strength' : 'lower_body_strength', `strength[${i}]`);
    });
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
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
    return ALL_DAYS[raw];
  }
  const s = String(raw).trim().toLowerCase().replace(/\.$/, '');
  return DAY_ALIASES[s];
}
