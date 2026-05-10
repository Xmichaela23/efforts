// scripts/audit-plans.ts
//
// In-process plan-generation audit harness. Generates plans for several tri configurations
// and audits each generated plan against rules from docs/SCHEDULING-RULES.md. Writes a
// markdown report to docs/PLAN-AUDIT-RESULTS.md.
//
// Run from repo root:
//   deno run --no-lock --allow-read --allow-write --allow-env scripts/audit-plans.ts
//
// Imports the optimizer / reconciler / week-builder directly rather than going over HTTP —
// matches existing contract-test patterns and stays deterministic.

import {
  buildPhaseTimeline,
  applyLoadingPattern,
  blockForWeek,
} from '../supabase/functions/generate-combined-plan/phase-structure.ts';
import { buildWeek } from '../supabase/functions/generate-combined-plan/week-builder.ts';
import { reconcileAthleteStateWithWeekOptimizer } from '../supabase/functions/generate-combined-plan/reconcile-athlete-state-week-optimizer.ts';
import { promote703SwimIntentForCutoffRisk } from '../supabase/functions/generate-combined-plan/swim-tri-safety.ts';
import {
  BRICKS_PER_WEEK,
  DAYS_OF_WEEK,
  DAY_INDEX,
} from '../supabase/functions/generate-combined-plan/science.ts';
import {
  arePlannedSessionsCompatible,
  type SameDayCompatContext,
} from '../supabase/functions/_shared/schedule-session-constraints.ts';
import type {
  AthleteState,
  GoalInput,
  GeneratedWeek,
  PlannedSession,
} from '../supabase/functions/generate-combined-plan/types.ts';

// ── Helpers ────────────────────────────────────────────────────────────────────

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

interface Config {
  id: string;
  name: string;
  goals: GoalInput[];
  athleteState: AthleteState;
  startDate: Date;
}

interface Finding {
  weekNum: number;
  detail: string;
}

interface ConfigResult {
  config: Config;
  weeks: GeneratedWeek[];
  /** AthleteState after `reconcileAthleteStateWithWeekOptimizer` — what `buildWeek` actually saw. */
  scheduleState?: AthleteState;
  /** Keyed by rule label (e.g. '§3.4'); empty array = pass. */
  findings: Record<string, Finding[]>;
  /** Captured trade-off / conflict strings, for context in the report. */
  tradeOffsAll: string[];
  /** Set when generation itself threw. */
  generationError?: string;
}

const RULE_KEYS = [
  '§3.4',
  '§8',
  '§4.4',
  '§4.10',
  '§4.12',
  '§4.15',
  '§9',
] as const;
type RuleKey = (typeof RULE_KEYS)[number];

function emptyFindings(): Record<RuleKey, Finding[]> {
  return RULE_KEYS.reduce((acc, k) => {
    acc[k] = [];
    return acc;
  }, {} as Record<RuleKey, Finding[]>);
}

// ── Plan generation (mirrors generate-combined-plan/index.ts entry path) ──────

function generatePlan(config: Config): {
  weeks: GeneratedWeek[];
  tradeOffs: string[];
  scheduleState: AthleteState;
} {
  const cutoffState = promote703SwimIntentForCutoffRisk(config.goals, config.athleteState);
  const scheduleState = reconcileAthleteStateWithWeekOptimizer(cutoffState);

  const { blocks: builtBlocks, totalWeeks, raceAnchors } = buildPhaseTimeline(
    config.goals,
    config.startDate,
    scheduleState,
  );
  const blocks = applyLoadingPattern(builtBlocks, scheduleState.loading_pattern ?? '3:1');

  if (totalWeeks < 2) {
    throw new Error(`totalWeeks=${totalWeeks} too short to audit`);
  }

  const weeks: GeneratedWeek[] = [];
  let prevWeightedTSS = scheduleState.current_ctl * 7;
  for (let w = 1; w <= totalWeeks; w++) {
    const block = blockForWeek(blocks, w);
    const week = buildWeek(w, block, prevWeightedTSS, config.goals, scheduleState, undefined, {
      totalWeeks,
      raceAnchors,
      phaseBlocks: blocks,
    });
    weeks.push(week);
    prevWeightedTSS = week.total_weighted_tss;
  }

  const tradeOffs: string[] = [];
  for (const w of weeks) {
    if (w.week_trade_offs?.length) {
      for (const t of w.week_trade_offs) tradeOffs.push(`week ${w.weekNum}: ${t}`);
    }
    if (w.conflict_events?.length) {
      for (const e of w.conflict_events) {
        const note = e.applied_resolution?.note ?? `${e.conflict_type}`;
        tradeOffs.push(`week ${w.weekNum} (conflict): ${note}`);
      }
    }
  }

  return { weeks, tradeOffs, scheduleState };
}

// ── Audits ────────────────────────────────────────────────────────────────────

function dayIndex(day: string): number {
  return DAY_INDEX[day] ?? -1;
}

function sessionsOnDay(week: GeneratedWeek, day: string): PlannedSession[] {
  return week.sessions.filter((s) => s.day === day);
}

function dayIsHard(week: GeneratedWeek, day: string): boolean {
  return sessionsOnDay(week, day).some((s) => s.intensity_class === 'HARD');
}

function isStrengthLower(s: PlannedSession): boolean {
  if (s.type !== 'strength') return false;
  const tags = (s.tags ?? []).map((t) => t.toLowerCase());
  return tags.includes('lower_body');
}

function isQualityBike(s: PlannedSession): boolean {
  return s.session_kind === 'quality_bike';
}

function isQualityRun(s: PlannedSession): boolean {
  return s.session_kind === 'quality_run';
}

function isLongRun(s: PlannedSession): boolean {
  return s.session_kind === 'long_run';
}

function isBrick(s: PlannedSession): boolean {
  return (s.tags ?? []).includes('brick');
}

function isStrength(s: PlannedSession): boolean {
  return s.type === 'strength';
}

/** §3.4 — No two consecutive HARD days, including week-boundary Sun→Mon. */
function auditRule_3_4(weeks: GeneratedWeek[]): Finding[] {
  const out: Finding[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    // Within-week adjacency: Mon-Tue, Tue-Wed, ... Sat-Sun.
    for (let d = 0; d < DAYS_OF_WEEK.length - 1; d++) {
      const a = DAYS_OF_WEEK[d];
      const b = DAYS_OF_WEEK[d + 1];
      if (dayIsHard(week, a) && dayIsHard(week, b)) {
        const aSess = sessionsOnDay(week, a)
          .filter((s) => s.intensity_class === 'HARD')
          .map((s) => `${s.type}:${s.session_kind ?? s.name}`)
          .join(', ');
        const bSess = sessionsOnDay(week, b)
          .filter((s) => s.intensity_class === 'HARD')
          .map((s) => `${s.type}:${s.session_kind ?? s.name}`)
          .join(', ');
        out.push({
          weekNum: week.weekNum,
          detail: `consecutive HARD: ${a} (${aSess}) → ${b} (${bSess})`,
        });
      }
    }
    // Week-boundary: Sun-of-N → Mon-of-N+1.
    if (i < weeks.length - 1) {
      const sunHard = dayIsHard(week, 'Sunday');
      const monHard = dayIsHard(weeks[i + 1], 'Monday');
      if (sunHard && monHard) {
        const aSess = sessionsOnDay(week, 'Sunday')
          .filter((s) => s.intensity_class === 'HARD')
          .map((s) => `${s.type}:${s.session_kind ?? s.name}`)
          .join(', ');
        const bSess = sessionsOnDay(weeks[i + 1], 'Monday')
          .filter((s) => s.intensity_class === 'HARD')
          .map((s) => `${s.type}:${s.session_kind ?? s.name}`)
          .join(', ');
        out.push({
          weekNum: week.weekNum,
          detail: `consecutive HARD across week boundary: w${week.weekNum} Sun (${aSess}) → w${weeks[i + 1].weekNum} Mon (${bSess})`,
        });
      }
    }
  }
  return out;
}

/** §8 — Same-day compatibility matrix (pairwise).
 *  Applies the same builder-side allowances:
 *   - QR + QS allowed when intent qualifies (matrix flag)
 *   - QR + LB allowed under §5.2 consolidated-hard-day for performance + co-equal profiles
 *  Findings that are explained by §5.x overrides are tagged in the detail line.
 */
function auditRule_8(weeks: GeneratedWeek[], state: AthleteState): Finding[] {
  const out: Finding[] = [];
  const intentPerf = String(state.training_intent ?? '').toLowerCase() === 'performance';
  const strengthCoEqual = String(state.strength_intent ?? '').toLowerCase() === 'performance';
  const isPerfCoequal = intentPerf && strengthCoEqual;
  const allowQrQs = intentPerf || strengthCoEqual;
  const ctx: SameDayCompatContext = {
    allowQualityRunQualitySwimSameDay: allowQrQs,
    strictStandaloneQualityRun: state.run_quality_placement === 'standalone_midweek',
    swimExperienceForMatrix: state.swim_experience,
  };
  for (const week of weeks) {
    for (const day of DAYS_OF_WEEK) {
      const sessions = sessionsOnDay(week, day);
      if (sessions.length < 2) continue;
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const a = sessions[i];
          const b = sessions[j];
          const compatible = arePlannedSessionsCompatible(a, b, ctx);
          if (compatible) continue;
          // §5.2 consolidated-hard-day exception: QR + LB on same day for perf + co-equal profiles.
          const aQr = isQualityRun(a);
          const bQr = isQualityRun(b);
          const aLb = isStrengthLower(a);
          const bLb = isStrengthLower(b);
          const isQrLbPair = (aQr && bLb) || (aLb && bQr);
          if (isQrLbPair && isPerfCoequal) continue;
          out.push({
            weekNum: week.weekNum,
            detail: `${day}: incompatible pair — ${a.session_kind ?? a.name} + ${b.session_kind ?? b.name}`,
          });
        }
      }
    }
  }
  return out;
}

/** §4.4 — Lower-body strength must be ≥48h from quality_bike (bidirectional default).
 *  §5.1 [derived] override: training_intent === 'performance' relaxes to ≥24h.
 *  This audit applies the §5.1 relaxation to match what `sequentialOk` actually allows;
 *  findings here are placements that violate the *current code behavior*, not just the
 *  §4.4 default. Note: the in-code §5.1 gate today checks only `training_intent`; the
 *  spec's full profile gates (age, history, RPE, etc.) are not yet wired.
 */
function auditRule_4_4(weeks: GeneratedWeek[], state: AthleteState): Finding[] {
  const out: Finding[] = [];
  const perfIntent = String(state.training_intent ?? '').toLowerCase() === 'performance';
  const minGap = perfIntent ? 1 : 2; // §5.1: 24h vs 48h default; below this gap = violation.
  for (const week of weeks) {
    const lowerDays: number[] = [];
    const qbDays: number[] = [];
    for (const s of week.sessions) {
      const di = dayIndex(s.day);
      if (di < 0) continue;
      if (isStrengthLower(s)) lowerDays.push(di);
      if (isQualityBike(s)) qbDays.push(di);
    }
    for (const ld of lowerDays) {
      for (const qd of qbDays) {
        const gap = Math.abs(ld - qd);
        if (gap > 0 && gap < minGap) {
          const overrideTag = perfIntent ? ' (§5.1 perf relaxation does not save this)' : '';
          out.push({
            weekNum: week.weekNum,
            detail: `lower_body_strength on ${DAYS_OF_WEEK[ld]} within ${gap}-day gap of quality_bike on ${DAYS_OF_WEEK[qd]} (need ≥${minGap === 2 ? '48h' : '24h'})${overrideTag}`,
          });
        }
      }
    }
  }
  // Cross-week boundary (Sun→Mon = 1-day gap).
  for (let i = 0; i < weeks.length - 1; i++) {
    const a = weeks[i];
    const b = weeks[i + 1];
    const aSunLower = sessionsOnDay(a, 'Sunday').some(isStrengthLower);
    const bMonQb = sessionsOnDay(b, 'Monday').some(isQualityBike);
    const aSunQb = sessionsOnDay(a, 'Sunday').some(isQualityBike);
    const bMonLower = sessionsOnDay(b, 'Monday').some(isStrengthLower);
    if (minGap >= 2) {
      if (aSunLower && bMonQb) {
        out.push({ weekNum: a.weekNum, detail: `lower on w${a.weekNum} Sun within 24h of quality_bike on w${b.weekNum} Mon` });
      }
      if (aSunQb && bMonLower) {
        out.push({ weekNum: a.weekNum, detail: `quality_bike on w${a.weekNum} Sun within 24h of lower on w${b.weekNum} Mon` });
      }
    }
  }
  return out;
}

/** §4.10 — Day before long_run cannot be quality_run (same-discipline quality before long day). */
function auditRule_4_10(weeks: GeneratedWeek[]): Finding[] {
  const out: Finding[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    for (const s of week.sessions) {
      if (!isLongRun(s)) continue;
      const di = dayIndex(s.day);
      if (di < 0) continue;
      // Same-week previous day.
      if (di > 0) {
        const prevDay = DAYS_OF_WEEK[di - 1];
        const prevHasQr = sessionsOnDay(week, prevDay).some(isQualityRun);
        if (prevHasQr) {
          out.push({
            weekNum: week.weekNum,
            detail: `quality_run on ${prevDay} immediately precedes long_run on ${s.day}`,
          });
        }
      } else if (i > 0) {
        // long_run on Monday — check Sunday of previous week.
        const prev = weeks[i - 1];
        const prevSunQr = sessionsOnDay(prev, 'Sunday').some(isQualityRun);
        if (prevSunQr) {
          out.push({
            weekNum: week.weekNum,
            detail: `quality_run on w${prev.weekNum} Sun immediately precedes long_run on w${week.weekNum} Mon`,
          });
        }
      }
    }
  }
  return out;
}

/** §4.12 — Brick frequency per phase.
 *  A brick prescription emits as a bike leg + run leg, both tagged 'brick'. Count distinct
 *  *days* with at least one brick-tagged session, not raw brick-tagged session count.
 *  Expected count: min(BRICKS_PER_WEEK[phase], session_frequency_defaults.bricks_per_week_by_phase[phase])
 *  — mirrors the builder's tier-aware cap (Phase A.5 §SESSION-FREQUENCY-DEFAULTS §9). */
function auditRule_4_12(weeks: GeneratedWeek[], state: AthleteState): Finding[] {
  const out: Finding[] = [];
  const tierCaps = state.session_frequency_defaults?.bricks_per_week_by_phase;
  for (const week of weeks) {
    const brickDays = new Set<string>();
    for (const s of week.sessions) {
      if (isBrick(s)) brickDays.add(s.day);
    }
    const bricks = brickDays.size;
    const phaseDefault = BRICKS_PER_WEEK[week.phase] ?? 0;
    const tierCap = tierCaps?.[week.phase as keyof typeof tierCaps];
    let expected = tierCap != null ? Math.min(phaseDefault, tierCap) : phaseDefault;
    if (week.isRecovery) expected = 0;
    if (bricks !== expected) {
      const dir = bricks > expected ? 'over' : 'under';
      const ambiguous = bricks === 0 && (week.phase === 'race_specific' || week.phase === 'taper');
      const tierNote = tierCap != null ? ` (tier cap ${tierCap}, phase default ${phaseDefault})` : '';
      out.push({
        weekNum: week.weekNum,
        detail: `phase=${week.phase} isRecovery=${week.isRecovery} expected ${expected} brick day(s)${tierNote}, got ${bricks} (${dir})${ambiguous ? ' — possibly race week' : ''}`,
      });
    }
  }
  return out;
}

/** §4.15 — Strength placed at requested frequency, or trade-off surfaced if reduced. */
function auditRule_4_15(weeks: GeneratedWeek[], state: AthleteState): Finding[] {
  const out: Finding[] = [];
  const intent = state.strength_intent ?? 'support';
  const cap = state.strength_sessions_cap;
  // When the reconciler produced explicit slots, the builder caps at that count regardless of
  // phase default — the athlete's stated preference (or the optimizer's reduction) wins.
  const optimizerSlotCount = Array.isArray(state.strength_optimizer_slots)
    ? state.strength_optimizer_slots.length
    : undefined;

  // Mirror builder's per-phase strength frequency expectations.
  function expectedFreq(week: GeneratedWeek): number {
    let f: number;
    if (week.phase === 'base') f = 2;
    else if (week.phase === 'build' || week.phase === 'race_specific') {
      f = intent === 'performance' ? 2 : 1;
    } else {
      f = 1; // taper / recovery
    }
    if (week.isRecovery) f = Math.min(f, 1);
    if (cap != null && Number.isFinite(cap)) f = Math.min(f, Math.max(0, Math.min(3, Math.round(Number(cap)))));
    if (optimizerSlotCount != null) f = Math.min(f, optimizerSlotCount);
    return f;
  }

  for (const week of weeks) {
    const placed = week.sessions.filter(isStrength).length;
    const expected = expectedFreq(week);
    if (placed === expected) continue;
    if (placed > expected) {
      out.push({
        weekNum: week.weekNum,
        detail: `phase=${week.phase} expected ${expected} strength session(s), got ${placed} (over)`,
      });
      continue;
    }
    // Under-placement: tolerate when a trade-off explains it.
    const tradeOffs = [
      ...(week.week_trade_offs ?? []),
      ...(week.conflict_events ?? []).map((e) => e.applied_resolution?.note ?? e.conflict_type),
    ];
    const hasReductionNote = tradeOffs.some(
      (t) => /strength frequency reduced/i.test(t) || /CO_EQUAL_STRENGTH/i.test(t),
    );
    if (!hasReductionNote) {
      out.push({
        weekNum: week.weekNum,
        detail: `phase=${week.phase} expected ${expected} strength session(s), got ${placed} (under) — no reduction trade-off surfaced`,
      });
    }
  }
  return out;
}

/** §9 — Session frequency matches the hours-derived defaults table.
 *  Counts S/B/R sessions per non-recovery, non-taper week and compares to
 *  `state.session_frequency_defaults` (populated by reconciler). Strength is on top
 *  of these totals per Phase A spec decision (acceptance criteria exclude strength).
 */
function auditRule_9(
  weeks: GeneratedWeek[],
  state: AthleteState,
): Finding[] {
  const out: Finding[] = [];
  const expected = state.session_frequency_defaults;
  if (!expected) {
    return [{
      weekNum: 0,
      detail: 'session_frequency_defaults missing from state — reconciler did not populate (long_run_day absent? or upstream regression)',
    }];
  }
  const expectedTotal =
    expected.swims_per_week + expected.bikes_per_week + expected.runs_per_week;
  for (const week of weeks) {
    // Skip recovery weeks (volume reduced by design) and taper weeks (includes race week, which
    // zeroes most sessions). Build / base / race_specific non-recovery weeks must match.
    if (week.isRecovery) continue;
    if (week.phase === 'taper') continue;
    // Per SESSION-FREQUENCY-DEFAULTS §2 / §9: "A brick replaces a standalone long ride +
    // standalone run with one combined session — it doesn't add a new session." Asymmetric
    // counting: the brick BIKE leg substitutes for long_ride (counts as 1 bike), but the
    // brick RUN leg is a short run-off-bike that's not a separate session in the spec's
    // discipline totals (counts as 0 runs).
    const isBrickTag = (s: PlannedSession) => (s.tags ?? []).includes('brick');
    const sw = week.sessions.filter((s) => s.type === 'swim').length;
    const bk = week.sessions.filter((s) => s.type === 'bike').length; // include brick bike legs
    const rn = week.sessions.filter((s) => s.type === 'run' && !isBrickTag(s)).length;
    const total = sw + bk + rn;
    if (total !== expectedTotal) {
      out.push({
        weekNum: week.weekNum,
        detail: `phase=${week.phase} expected ${expectedTotal} S/B/R sessions (${expected.swims_per_week}S+${expected.bikes_per_week}B+${expected.runs_per_week}R per ${expected.tier_label} tier), got ${total} (${sw}S+${bk}B+${rn}R)`,
      });
    }
  }
  return out;
}

function auditPlan(
  weeks: GeneratedWeek[],
  inputState: AthleteState,
  scheduleState: AthleteState,
): Record<RuleKey, Finding[]> {
  const findings = emptyFindings();
  findings['§3.4'] = auditRule_3_4(weeks);
  findings['§8'] = auditRule_8(weeks, scheduleState);
  findings['§4.4'] = auditRule_4_4(weeks, scheduleState);
  findings['§4.10'] = auditRule_4_10(weeks);
  findings['§4.12'] = auditRule_4_12(weeks, scheduleState);
  findings['§9'] = auditRule_9(weeks, scheduleState);
  // §4.15 expectations: use the post-reconciler state's `strength_sessions_cap` (the reconciler
  // sets cap=1 when 2× co-equal didn't fit and the recovery wrapper retried successfully at 1×).
  // The optimizer's recovery-line trade-off currently lives in `optimal.trade_offs` and the
  // reconciler's telemetry log only — it is NOT propagated into `week_trade_offs`. That is a
  // documented §6.3 gap (tradeoff communication layer). The audit treats reconciler-driven
  // reductions as expected behavior here and notes the §6.3 gap separately.
  findings['§4.15'] = auditRule_4_15(weeks, scheduleState);
  return findings;
}

// ── Configurations ────────────────────────────────────────────────────────────

const START = new Date('2026-05-11T12:00:00Z');
// 70.3 race ~18 weeks out — enough span to see base / build / race_specific / taper.
const RACE_70_3 = '2026-09-13';
// Olympic ~15 weeks out.
const RACE_OLY = '2026-08-23';

function tri703Goal(): GoalInput {
  return {
    id: 'g-703',
    event_name: 'Audit 70.3',
    event_date: RACE_70_3,
    distance: '70.3',
    sport: 'triathlon',
    priority: 'A',
  };
}
function triOlyGoal(): GoalInput {
  return {
    id: 'g-oly',
    event_name: 'Audit Olympic',
    event_date: RACE_OLY,
    distance: 'olympic',
    sport: 'triathlon',
    priority: 'A',
  };
}

function baseTriState(): AthleteState {
  return {
    current_ctl: 70,
    weekly_hours_available: 12,
    loading_pattern: '3:1',
    run_threshold_pace: '7:30',
    bike_ftp: 240,
    swim_threshold_pace: '1:35',
    swim_experience: 'steady',
    training_fitness: 'intermediate',
    equipment_type: 'commercial_gym',
    has_cable_machine: true,
    has_ghd: false,
    plan_units: 'imperial',
    swim_intent: 'race',
    rest_days: [],
    long_ride_day: SAT,
    long_run_day: SUN,
    swim_easy_day: MON,
    swim_quality_day: THU,
  };
}

const CONFIGS: Config[] = [
  // 1. Tri 70.3, 7 days, performance, co-equal, Wed group ride (quality), Sat/Sun longs
  {
    id: 'C1',
    name: 'Tri 70.3 — 7d, performance, co-equal, Wed group ride (quality), Sat/Sun longs',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      bike_quality_day: WED,
      bike_quality_label: 'Group Ride',
      bike_quality_route_estimated_hours: 2,
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Monday', 'Thursday'],
    },
  },

  // 2. Tri 70.3, 6 days, fitness intent, supplementary strength, no group ride
  {
    id: 'C2',
    name: 'Tri 70.3 — 6d, fitness intent (completion), supplementary strength, no group ride',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'completion',
      strength_intent: 'support',
      days_per_week: 6,
      rest_days: [FRI],
      strength_protocol: 'triathlon',
      strength_preferred_days: ['Monday'],
    },
  },

  // 3. Tri olympic, 5 days, performance, no strength
  {
    id: 'C3',
    name: 'Tri olympic — 5d, performance, no strength',
    goals: [triOlyGoal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'support',
      strength_sessions_cap: 0,
      days_per_week: 5,
      rest_days: [MON, FRI],
      // Olympic — slightly less volume.
      weekly_hours_available: 9,
    },
  },

  // 4. Tri 70.3, 7 days, performance, co-equal, Mon group ride (quality)
  {
    id: 'C4',
    name: 'Tri 70.3 — 7d, performance, co-equal, Mon group ride (quality)',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      bike_quality_day: MON,
      bike_quality_label: 'Group Ride',
      bike_quality_route_estimated_hours: 2,
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Tuesday', 'Friday'],
    },
  },

  // 5. Tri 70.3, 7 days, performance, co-equal, Wed group ride (hammer)
  {
    id: 'C5',
    name: 'Tri 70.3 — 7d, performance, co-equal, Wed group ride (hammer)',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      bike_quality_day: WED,
      bike_quality_label: 'Hammer Ride',
      bike_quality_route_estimated_hours: 2.25,
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Monday', 'Thursday'],
    },
  },

  // 6. Tri 70.3, 7 days, performance, co-equal, Wed group run (quality) — no group ride
  {
    id: 'C6',
    name: 'Tri 70.3 — 7d, performance, co-equal, Wed group run (quality)',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      run_quality_day: WED,
      run_quality_placement: 'standalone_midweek',
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Monday', 'Thursday'],
    },
  },

  // 7. Tri 70.3, 7 days, performance, co-equal, Wed group ride + Thu group run
  {
    id: 'C7',
    name: 'Tri 70.3 — 7d, performance, co-equal, Wed group ride + Thu group run',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      bike_quality_day: WED,
      bike_quality_label: 'Group Ride',
      bike_quality_route_estimated_hours: 2,
      run_quality_day: THU,
      run_quality_placement: 'standalone_midweek',
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Monday', 'Friday'],
    },
  },

  // 8. SESSION-FREQUENCY-DEFAULTS acceptance: 7hr/week 70.3 athlete
  // §9 5-7hr default shape: 6 S/B/R sessions (2S + 2B + 2R), 0-1 strength, 1-2 rest days.
  {
    id: 'C8',
    name: 'Tri 70.3 — 7hr/week, 5-7 tier, 6 S/B/R expected (acceptance)',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      weekly_hours_available: 7,
      training_intent: 'performance',
      strength_intent: 'support',
      days_per_week: 6,
      rest_days: [WED],
    },
  },

  // 9. SESSION-FREQUENCY-DEFAULTS acceptance: 12hr/week 70.3 athlete
  // §9 12-14hr default shape: 9 S/B/R sessions (3S + 3B + 3R), 1-2 strength, 0-1 rest days.
  {
    id: 'C9',
    name: 'Tri 70.3 — 12hr/week, 12-14 tier, 9 S/B/R expected (acceptance)',
    goals: [tri703Goal()],
    startDate: START,
    athleteState: {
      ...baseTriState(),
      weekly_hours_available: 12,
      training_intent: 'performance',
      strength_intent: 'performance',
      days_per_week: 7,
      strength_protocol: 'triathlon_performance',
      strength_preferred_days: ['Monday', 'Thursday'],
    },
  },
];

// ── Run + report ──────────────────────────────────────────────────────────────

function runAll(): ConfigResult[] {
  const results: ConfigResult[] = [];
  for (const config of CONFIGS) {
    try {
      const { weeks, tradeOffs, scheduleState } = generatePlan(config);
      const findings = auditPlan(weeks, config.athleteState, scheduleState);
      results.push({ config, weeks, scheduleState, findings, tradeOffsAll: tradeOffs });
    } catch (err) {
      results.push({
        config,
        weeks: [],
        findings: emptyFindings(),
        tradeOffsAll: [],
        generationError: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

function totalsFor(result: ConfigResult): { total: number; pass: number; fail: number; uncertain: number } {
  let total = 0, pass = 0, fail = 0, uncertain = 0;
  for (const k of RULE_KEYS) {
    total++;
    if (result.generationError) {
      uncertain++;
      continue;
    }
    if (result.findings[k].length === 0) pass++;
    else fail++;
  }
  return { total, pass, fail, uncertain };
}

function statusIcon(findings: Finding[], generationError: string | undefined): string {
  if (generationError) return '⚠️ uncertain';
  return findings.length === 0 ? '✅ pass' : `❌ ${findings.length} finding${findings.length === 1 ? '' : 's'}`;
}

function ruleTitle(k: RuleKey): string {
  switch (k) {
    case '§3.4': return '§3.4 No two consecutive HARD days';
    case '§8': return '§8 Same-day matrix';
    case '§4.4': return '§4.4 Lower↔quality_bike 48h spacing';
    case '§4.10': return '§4.10 Quality_run not on day before long_run';
    case '§4.12': return '§4.12 Brick frequency by phase';
    case '§4.15': return '§4.15 Strength frequency (or reduction trade-off)';
    case '§9': return '§9 Session frequency matches hours-derived defaults';
  }
}

function buildReport(results: ConfigResult[]): string {
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# Plan Audit Results — ${today}`);
  lines.push('');
  lines.push('Generated by `scripts/audit-plans.ts`. In-process plan generation against `docs/SCHEDULING-RULES.md`.');
  lines.push('');
  lines.push(`Configurations audited: ${results.length}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| ID | Configuration | Weeks | Pass | Fail | Uncertain |');
  lines.push('|---|---|---:|---:|---:|---:|');
  for (const r of results) {
    const t = totalsFor(r);
    const weeks = r.generationError ? '—' : String(r.weeks.length);
    lines.push(`| ${r.config.id} | ${r.config.name} | ${weeks} | ${t.pass} | ${t.fail} | ${t.uncertain} |`);
  }
  lines.push('');

  // Per-rule × per-config matrix
  lines.push('## Rule × Configuration matrix');
  lines.push('');
  lines.push('| Rule | ' + results.map((r) => r.config.id).join(' | ') + ' |');
  lines.push('|---|' + results.map(() => '---').join('|') + '|');
  for (const k of RULE_KEYS) {
    const cells = results.map((r) => {
      if (r.generationError) return '⚠️';
      return r.findings[k].length === 0 ? '✅' : `❌(${r.findings[k].length})`;
    });
    lines.push(`| ${ruleTitle(k)} | ${cells.join(' | ')} |`);
  }
  lines.push('');

  // Per-config detail
  for (const r of results) {
    lines.push(`## ${r.config.id} — ${r.config.name}`);
    lines.push('');
    if (r.generationError) {
      lines.push(`> ⚠️ Generation failed: \`${r.generationError}\``);
      lines.push('');
      continue;
    }
    lines.push(`Weeks generated: ${r.weeks.length} (phases: ${[...new Set(r.weeks.map((w) => w.phase))].join(', ')})`);
    if (r.scheduleState && (
      r.scheduleState.strength_sessions_cap !== r.config.athleteState.strength_sessions_cap ||
      JSON.stringify(r.scheduleState.strength_optimizer_slots) !== JSON.stringify(r.config.athleteState.strength_optimizer_slots)
    )) {
      const cap = r.scheduleState.strength_sessions_cap;
      const slots = r.scheduleState.strength_optimizer_slots;
      const mods: string[] = [];
      if (cap != null && cap !== r.config.athleteState.strength_sessions_cap) mods.push(`strength_sessions_cap=${cap}`);
      if (slots?.length) mods.push(`strength_optimizer_slots=[${slots.map((s) => `${s.weekday}/${s.session_index === 1 ? 'upper' : 'lower'}`).join(', ')}]`);
      if (mods.length) lines.push(`Reconciler modifications: ${mods.join('; ')}`);
    }
    lines.push('');
    for (const k of RULE_KEYS) {
      const findings = r.findings[k];
      lines.push(`**${ruleTitle(k)}** — ${statusIcon(findings, undefined)}`);
      if (findings.length > 0) {
        for (const f of findings) {
          lines.push(`- week ${f.weekNum}: ${f.detail}`);
        }
      }
      lines.push('');
    }

    if (r.tradeOffsAll.length > 0) {
      lines.push('<details><summary>Trade-offs / conflicts surfaced (' + r.tradeOffsAll.length + ')</summary>');
      lines.push('');
      for (const t of r.tradeOffsAll.slice(0, 30)) {
        lines.push(`- ${t}`);
      }
      if (r.tradeOffsAll.length > 30) {
        lines.push(`- … (${r.tradeOffsAll.length - 30} more truncated)`);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('### Notes on audit precision');
  lines.push('');
  lines.push('- §3.4: classifies a day as HARD if any session has `intensity_class === "HARD"`. Group-session intensity tagging (§4.17) is not yet wired in code, so a "hammer" group ride may currently emit as HARD just like a generic quality ride.');
  lines.push('- §4.4: applies the §5.1 [derived] performance-intent relaxation (24h vs 48h default) when scoring violations, matching what `sequentialOk` currently allows. Note: the in-code §5.1 gate today checks only `training_intent === "performance"`; the spec\'s full profile gates (age, history, RPE) are not yet wired.');
  lines.push('- §8: applies the same QR+QS modifier the builder uses (intent-derived) AND the §5.2 consolidated-hard-day exception for QR + LB pairs on performance + co-equal profiles. Without these the matrix lookup over-flags intentional placements.');
  lines.push('- §4.10: only checks the same-discipline rule for run (quality_run before long_run). Long_ride / quality_bike side is out of scope for this rule.');
  lines.push('- §4.12: counts distinct *days* with a brick session (not raw brick-tagged sessions — a brick emits as a bike + run pair, both tagged). The race-week brick override is handled inside the builder; the audit flags 0-brick race_specific/taper weeks but tags them as possibly-race-week.');
  lines.push('- §4.15: expected frequency uses the *post-reconciler* `AthleteState`. When the optimizer\'s co-equal recovery wrapper retries 2× → 1× successfully (e.g. mid-week QB + Sat/Sun longs blocks 2× lower per §4.4), the reconciler sets `strength_sessions_cap: 1`, which becomes the audit\'s expected frequency. The wrapper\'s recovery-line trade-off currently lives in `optimal.trade_offs` and the reconciler telemetry log only — it is **not** propagated into `week_trade_offs` for the athlete-facing plan output. That is a documented §6.3 gap, not a §4.15 violation in this audit.');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const results = runAll();
const md = buildReport(results);
const outPath = new URL('../docs/PLAN-AUDIT-RESULTS.md', import.meta.url);
await Deno.writeTextFile(outPath, md);

const total = results.length * RULE_KEYS.length;
let pass = 0, fail = 0, uncertain = 0;
for (const r of results) {
  const t = totalsFor(r);
  pass += t.pass;
  fail += t.fail;
  uncertain += t.uncertain;
}
console.log(
  `[audit] wrote ${outPath.pathname} — ${results.length} configs × ${RULE_KEYS.length} rules = ${total} checks: ${pass} pass / ${fail} fail / ${uncertain} uncertain`,
);
for (const r of results) {
  if (r.generationError) {
    console.log(`  ${r.config.id}: ⚠️ generation error — ${r.generationError}`);
    continue;
  }
  const tt = totalsFor(r);
  console.log(`  ${r.config.id}: ${tt.pass}/${RULE_KEYS.length} pass${tt.fail > 0 ? ` (${tt.fail} fail)` : ''}`);
}
