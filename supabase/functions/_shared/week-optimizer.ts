// =============================================================================
// _shared/week-optimizer.ts — pure week-derivation engine
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
 * EXPERIENCE MODIFIER overrides:
 *  - performance + co-equal strength → quality_run *after* quality_bike day
 *    is allowed (consolidated hard block); trade-off recorded by caller.
 */
function sequentialOk(
  days: Record<DayName, SessionSlot[]>,
  day: DayName,
  kind: SessionKind,
  athlete: WeekOptimizerInputs['athlete'],
): boolean {
  const isPerf = athlete.training_intent === 'performance';
  const isCoEq = athlete.strength_intent === 'performance';

  const prevSlots = days[dayBefore(day)] ?? [];
  const prevKinds = prevSlots.map((s) => s.kind);

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
    if (kind !== 'long_ride' && isHigh(kind)) return false;
  }

  // Prev day was quality_bike → today: no quality_bike, no quality_run
  // (override: performance + co-equal strength may stack quality_run + lower_body
  // on day-after-quality_bike per EXPERIENCE MODIFIER).
  if (prevKinds.includes('quality_bike')) {
    if (kind === 'quality_bike') return false;
    if (kind === 'quality_run' && !(isPerf && isCoEq)) return false;
  }
  // Prev day was quality_run → today: no quality_bike, no quality_run.
  if (prevKinds.includes('quality_run')) {
    if (kind === 'quality_run') return false;
    if (kind === 'quality_bike' && !isPerf) return false;
  }

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
    const candidates: DayName[] = ['tuesday', 'wednesday', 'thursday'];
    for (const c of candidates) {
      if (c === longRide || c === longRun) continue;
      if (!canPlace(days, c, 'quality_bike')) continue;
      if (!sequentialOk(days, c, 'quality_bike', inputs.athlete)) continue;
      qualityBikeDay = c;
      place(days, c, 'quality_bike');
      break;
    }
  }

  // ── quality_run ──────────────────────────────────────────────────────────
  // If group_run anchor is quality, that's already placed; record day.
  let qualityRunDay: DayName | undefined =
    groupRun?.intensity === 'quality' ? groupRun.day : undefined;

  if (!qualityRunDay) {
    const prio: DayName[] = [];
    if (qualityBikeDay) {
      // EXPERIENCE MODIFIER: performance + co-equal strength → prefer day-after
      // quality_bike for stacked quality_run + lower_body. Otherwise Wed+2.
      if (isPerf && isCoEq) {
        prio.push(dayAfter(qualityBikeDay));        // e.g. Thu after Wed
        prio.push(nDaysAfter(qualityBikeDay, 2));   // fallback Fri
      } else {
        prio.push(nDaysAfter(qualityBikeDay, 2));   // optimal Wed+2
      }
    }
    prio.push(nDaysAfter(longRide, -2));            // 2 days before long_ride
    for (const d of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as DayName[]) {
      if (!prio.includes(d)) prio.push(d);
    }

    for (const c of prio) {
      if (c === longRide || c === longRun) continue;
      if (qualityBikeDay && c === qualityBikeDay) continue;
      if (!canPlace(days, c, 'quality_run')) continue;
      if (!sequentialOk(days, c, 'quality_run', inputs.athlete)) continue;
      // Day before long_ride / long_run → only allow for performance, with trade-off.
      if (c === dayBefore(longRide) && !isPerf) continue;
      if (c === dayBefore(longRun) && !isPerf) continue;

      qualityRunDay = c;
      place(days, c, 'quality_run');

      if (c === dayBefore(longRide) && isPerf) {
        trade_offs.push(
          `quality_run on ${c} sits the day before long_ride (${longRide}); back-to-back HIGH days — performance modifier.`,
        );
      }
      if (qualityBikeDay && c === dayAfter(qualityBikeDay) && isPerf && isCoEq) {
        trade_offs.push(
          `quality_run on ${c} follows quality_bike (${qualityBikeDay}) — consolidated hard day per EXPERIENCE MODIFIER (performance + co-equal strength).`,
        );
      }
      break;
    }
    if (!qualityRunDay) {
      conflicts.push(
        'quality_run: no valid day found — try moving long_ride/long_run, or removing the quality_bike anchor to free up Tuesday/Thursday.',
      );
      trade_offs.push('Quality run dropped from week — current anchors leave no recovery slot.');
    }
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

  // ── easy_run (prefer Friday for pre-weekend recovery) ────────────────────
  let easyRunDay: DayName | undefined;
  const easyRunOrder: DayName[] = ['friday', 'monday', 'tuesday', 'wednesday', 'thursday'];
  // Pass 1: prefer empty + matrix-compatible.
  for (const c of easyRunOrder) {
    if (c === longRide || c === longRun) continue;
    if (qualityRunDay && c === qualityRunDay) continue;
    if (days[c].length > 0) continue;
    if (!canPlace(days, c, 'easy_run')) continue;
    easyRunDay = c;
    break;
  }
  // Pass 2: any matrix-compatible day (allow stacking with LOW sessions).
  if (!easyRunDay) {
    for (const c of easyRunOrder) {
      if (c === longRide || c === longRun) continue;
      if (qualityRunDay && c === qualityRunDay) continue;
      if (!canPlace(days, c, 'easy_run')) continue;
      easyRunDay = c;
      break;
    }
  }
  if (easyRunDay) {
    place(days, easyRunDay, 'easy_run');
  } else {
    conflicts.push(
      'easy_run: no matrix-clean weekday available — try removing a strength session or moving the quality_run.',
    );
    trade_offs.push('Mid-week easy run dropped — schedule too dense.');
  }

  // ── Strength placement ──────────────────────────────────────────────────
  const strengthDays: DayName[] = [];
  const strengthFreq = inputs.preferences.strength_frequency;

  if (strengthFreq >= 1) {
    // Upper body: Monday preferred (post-long-run, doesn't compete with legs).
    let upperDay: DayName | undefined;
    for (const c of ['monday', 'thursday', 'tuesday', 'wednesday', 'friday'] as DayName[]) {
      if (c === longRide || c === longRun) continue;
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
      // Lower body: stack with quality_run (AM/PM) for performance + co-equal,
      // else 48h-clear day per STRENGTH_FREQUENCY (3 days from upper).
      const lowerCandidates: DayName[] = isPerf && isCoEq && qualityRunDay
        ? [qualityRunDay, 'thursday', 'friday', 'tuesday']
        : ['thursday', 'friday', 'tuesday', 'wednesday'];

      let lowerDay: DayName | undefined;
      for (const c of lowerCandidates) {
        if (upperDay && c === upperDay) continue;
        if (c === longRide || c === longRun) continue;
        if (!canPlaceWithModifier(days, c, 'lower_body_strength', inputs.athlete)) continue;
        if (!sequentialOk(days, c, 'lower_body_strength', inputs.athlete)) continue;
        // 2x/week strength: ≥3 days between sessions.
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

    if (strengthFreq >= 3) {
      // Third session: alternate kind, ≥2 days from existing.
      const existingKinds = strengthDays.map((d) =>
        days[d].find((s) => s.kind === 'upper_body_strength' || s.kind === 'lower_body_strength')?.kind,
      );
      const lowerCount = existingKinds.filter((k) => k === 'lower_body_strength').length;
      const upperCount = existingKinds.filter((k) => k === 'upper_body_strength').length;
      const thirdKind: SessionKind = upperCount > lowerCount ? 'lower_body_strength' : 'upper_body_strength';

      let thirdDay: DayName | undefined;
      for (const c of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as DayName[]) {
        if (strengthDays.includes(c)) continue;
        if (c === longRide || c === longRun) continue;
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
    }
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

  function tryPlace(day: DayName | undefined, kind: SessionKind, label: string) {
    if (!day) return;
    if (!canPlace(days, day, kind)) {
      out.push(`${label} on ${day} fails same-day matrix vs ${days[day].map((s) => s.kind).join(' + ')}.`);
      return;
    }
    if (!sequentialOk(days, day, kind, athlete)) {
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
