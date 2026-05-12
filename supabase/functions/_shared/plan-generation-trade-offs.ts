import type { PostRaceRecoveryResult } from './planning-context.ts';

export type PlanTradeOffKind =
  | 'recovery_context'
  | 'constraint_compromise'
  | 'conflict_warning'
  | 'anchor_adjustment';

export type PlanTradeOffSeverity = 'info' | 'notice' | 'warning';

export type PlanTradeOffSuggestedAction = {
  action_id: string;
  label: string;
  wizard_step?: string;
  params?: Record<string, unknown>;
};

export type PlanGenerationTradeOff = {
  kind: PlanTradeOffKind;
  severity: PlanTradeOffSeverity;
  message_template_id: string;
  variables: Record<string, string | number | boolean>;
  suggested_action?: PlanTradeOffSuggestedAction;
};

/** Optimizer snapshot from tri `backfillTriTrainingPrefsDefenseInDepth` (one row per goal). */
export type PlanOptimizerSnapshotInput = {
  goal_id: string;
  trade_offs: string[];
  conflicts: string[];
  used_co_equal_1x_fallback: boolean;
  pin_restore_skipped: string[];
};

export type BackfillOptimizerSnapshot = {
  trade_offs: string[];
  conflicts: string[];
  used_co_equal_1x_fallback: boolean;
  pin_restore_skipped: string[];
};

/** Flattened optimizer signals for API responses (§1.3 / §8 surfacing). */
export type ScheduleSignals = {
  conflicts: string[];
  trade_offs: string[];
  used_co_equal_1x_fallback: boolean;
  pin_restore_skipped: string[];
};

/**
 * Internal optimizer telemetry that should NOT surface to athletes — the engine reorganized
 * the week's layout (one valid placement chosen over another) and no athlete-visible constraint
 * was violated. These are useful for coach diagnostics + analytics, but adding them to
 * `week_trade_offs` or `schedule_signals.trade_offs` clutters the athlete's "Schedule
 * adjustments" panel with engineering noise like "Weekly layout: moved easy_bike from
 * Monday to Wednesday."
 *
 * **Canonical-value contract:** the API response and DB-persisted `generation_trade_offs`
 * surface only athlete-facing messages. Frontend doesn't re-derive — it trusts the server.
 * The two boundary aggregators below (`aggregateOptimizerScheduleSignals`,
 * `enrichScheduleSignalsWithCombinedPlanTradeOffs`) apply this filter so all downstream
 * consumers see the same clean list.
 *
 * Pattern set is explicit (not a blanket "anything mentioning the word 'moved'") — extend it
 * deliberately when new internal-only messages are added at emission sites.
 */
const INTERNAL_OPTIMIZER_TELEMETRY_PATTERNS: RegExp[] = [
  // Load balancer / layout reorganization — internal placement decisions, no athlete constraint.
  /^Weekly layout: moved\b/i,
  /^Weekly load balance: moved\b/i,
  /\bload balancer move\b/i,
  // Default Monday upper moved purely for spacing — internal scheduler choice (lines 1287, 1419
  // of week-optimizer.ts emit these). Distinguished from "could not stay" / "schedule constraints"
  // variants which describe an athlete-visible constraint and stay surfaced.
  /^Strength: default Monday upper moved\b/i,
  /^Strength: default Monday/i,
  // Legacy swim-budget bookkeeping — previously filtered client-side in GoalsScreen; folded in
  // here so the server is now the single source of truth.
  /^Swim budget raised by \d+ yd total to honor \d+ pinned swim days\.?$/i,
];

/**
 * Patterns that reference athlete-pinned anchors ("adjust pinned long or group-ride days",
 * "move a fixed ride", "your pinned anchors"). When the athlete has NOT pinned any anchors,
 * these messages are false references — they tell the athlete to adjust pins they never set.
 *
 * Filtered out via {@link filterAthleteFacingTradeOffs} when the caller passes
 * `hasAthletePins: false`. When pins ARE set, these messages are useful actionable guidance
 * and stay surfaced.
 */
const ANCHOR_REFERENCE_PATTERNS: RegExp[] = [
  /\bpinned\s+long\s+or\s+group-ride\b/i,
  /\bpinned\s+(rides?|days?|workouts?|anchors?|long\s+runs?|long\s+rides?)\b/i,
  /\byour\s+pinned\s+\w+/i,
  /\byour\s+pins\b/i,
  /\bmove\s+a?\s*fixed\s+(ride|workout|long\s+(run|ride))/i,
  /\badjust\s+a?\s*fixed\s+(ride|workout|long\s+(run|ride))/i,
  /\banchored\s+(group\s+ride|ride|run)\b/i,
];

export function isInternalOptimizerTelemetry(message: string): boolean {
  const s = String(message ?? '').trim();
  if (!s) return false;
  return INTERNAL_OPTIMIZER_TELEMETRY_PATTERNS.some((re) => re.test(s));
}

/** True when the message references athlete-pinned anchors (pins / fixed / anchored / your pins). */
export function referencesAthletePins(message: string): boolean {
  const s = String(message ?? '').trim();
  if (!s) return false;
  return ANCHOR_REFERENCE_PATTERNS.some((re) => re.test(s));
}

/**
 * Derive whether the athlete has pinned at least one schedule anchor from a normalized
 * preferences-like object. Used by callers to compute the `hasAthletePins` boolean threaded into
 * the boundary aggregators. Conservative: a single non-empty pinned field is enough.
 *
 * Accepts a generic shape so the helper lives in `_shared` without a backward dep on
 * `generate-combined-plan/types.ts`.
 */
export function hasAthletePinsFromPrefs(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs || typeof prefs !== 'object') return false;
  const dayFields = [
    'long_run_day',
    'long_ride_day',
    'bike_quality_day',
    'bike_easy_day',
    'run_quality_day',
    'run_easy_day',
    'swim_quality_day',
    'swim_easy_day',
    'swim_third_day',
  ];
  for (const k of dayFields) {
    const v = (prefs as Record<string, unknown>)[k];
    if (v != null && v !== '' && (typeof v === 'number' || typeof v === 'string')) return true;
  }
  // strength_preferred_days is an array of weekday names.
  const sp = (prefs as Record<string, unknown>).strength_preferred_days;
  if (Array.isArray(sp) && sp.length > 0) return true;
  return false;
}

/**
 * Apply the trade-off filters: drop internal optimizer telemetry always; drop anchor-referring
 * messages when the athlete has NOT pinned any anchors (`options.hasAthletePins === false`).
 * When `hasAthletePins` is unset, anchor-referring messages are surfaced (conservative default).
 */
export function filterAthleteFacingTradeOffs(
  messages: string[] | null | undefined,
  options?: { hasAthletePins?: boolean },
): string[] {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => {
    if (typeof m !== 'string') return false;
    if (isInternalOptimizerTelemetry(m)) return false;
    if (options?.hasAthletePins === false && referencesAthletePins(m)) return false;
    return true;
  });
}

/**
 * Athlete-facing copy for optimizer / reconciler trade-off lines (docs/SCHEDULING-RULES.md §7).
 * Internal codes stay in source strings; this runs at the API boundary.
 */
export function humanizeScheduleTradeOffLine(raw: string): string {
  let s = String(raw).trim();
  if (!s) return s;
  s = s.replace(/\s*Do not describe[^.]*\./gi, '').trim();
  s = s.replace(/\bthe athlete must choose:\s*/gi, 'You can ');
  s = s.replace(/\bThe athlete must choose:\s*/g, 'You can ');
  s = s.replace(/\bthe athlete\b/gi, 'you');
  s = s.replace(/\bThe athlete\b/g, 'You');
  s = s.replace(/\bathlete-declared\b/gi, 'your chosen');
  s = s.replace(/\bprovisional\b/gi, 'temporary');

  const recoveryRetry = /\s*1× retry still has CONFLICTS[\s\S]*$/i;
  if (recoveryRetry.test(s)) {
    s = s.replace(recoveryRetry, '').trim();
    if (/CO_EQUAL_STRENGTH/i.test(s)) {
      return `${humanizeScheduleTradeOffLine(s)} If you need two strength days, adjust pinned long or group-ride days first.`;
    }
  }

  const coEq = /^CO_EQUAL_STRENGTH\s*\(recovery\):\s*(.+)$/is.exec(s);
  if (coEq) {
    return (
      'We kept strength to one session this week because two full-body strength days could not fit with your current anchors and recovery rules. ' +
      'To add a second day, move a fixed ride, long run, or swim block — or stay on one strength day until the schedule has room.'
    );
  }

  s = s.replace(/^CO_EQUAL_STRENGTH:\s*/i, '');
  s = s.replace(/\bEXPERIENCE_MODIFIER\b/g, 'intentional same-day pairing');

  const pref = /^(\w+):\s*/.exec(s);
  if (pref && ['quality_bike', 'quality_run', 'easy_bike', 'easy_run'].includes(pref[1])) {
    const key = pref[1].replace(/_/g, ' ');
    const rest = s.slice(pref[0].length).trim();
    const prettyKey = key.charAt(0).toUpperCase() + key.slice(1);
    return `${prettyKey}: ${rest}`;
  }

  return s.trim();
}

export function aggregateOptimizerScheduleSignals(
  snapshots: PlanOptimizerSnapshotInput[],
  options?: { hasAthletePins?: boolean },
): ScheduleSignals {
  const conflicts = new Set<string>();
  const tradeOffs = new Set<string>();
  const pinSkipped = new Set<string>();
  let coEqual = false;
  for (const s of snapshots) {
    for (const c of s.conflicts ?? []) {
      const x = String(c).trim();
      if (x) conflicts.add(x);
    }
    for (const t of s.trade_offs ?? []) {
      const x = String(t).trim();
      if (x) tradeOffs.add(x);
    }
    for (const p of s.pin_restore_skipped ?? []) {
      const x = String(p).trim();
      if (x) pinSkipped.add(x);
    }
    if (s.used_co_equal_1x_fallback) coEqual = true;
  }
  return {
    conflicts: [...conflicts],
    trade_offs: filterAthleteFacingTradeOffs(
      [...tradeOffs].map((t) => humanizeScheduleTradeOffLine(t)),
      options,
    ),
    used_co_equal_1x_fallback: coEqual,
    pin_restore_skipped: [...pinSkipped],
  };
}

/**
 * Plain-English templates (deterministic). Persist only `message_template_id` + `variables`;
 * clients render with the same map — no LLM.
 */
export const PLAN_GENERATION_MESSAGE_TEMPLATES: Record<string, string> = {
  post_race_recovery_full:
    'Your plan starts light because {{event_name}} was {{days_ago}} days ago. Week 1 keeps load low to protect adaptation. Quality work ramps back in Week 2.',
  post_race_recovery_moderate:
    'Your recent race {{event_name}} ({{days_ago}} days ago) still has you in a lighter transition block — volume and structure stay a step easier until you are fully ready.',
  co_equal_provisional_1x:
    'We could not fit two strength sessions every week with your current anchors and this recovery window without breaking hard-and-easy rules. This plan runs one strength day per week for now. To reach two, move a fixed workout (group ride, long run, or long ride), or plan on accepting a compromise some weeks.',
  quality_run_unplaced:
    'Your mid-week quality run could not be placed without colliding with another fixed hard day (often the group ride, long ride, or long run). It is omitted for now. To bring it back, shift one of those anchors or reduce strength frequency for this block.',
  anchor_relocated_strength_default:
    'Strength landed on different days than the usual default so the week still respects spacing around your bike and run quality sessions. {{placement_note}}',
  anchor_pin_not_kept:
    'A day you pinned in setup could not stay exactly where it was while keeping the schedule valid. {{detail}}',
};

export function renderPlanGenerationMessage(
  templateId: string,
  variables: Record<string, string | number | boolean>,
): string {
  const tpl = PLAN_GENERATION_MESSAGE_TEMPLATES[templateId];
  if (!tpl) return templateId;
  let s = tpl;
  for (const [key, val] of Object.entries(variables)) {
    s = s.split(`{{${key}}}`).join(String(val));
  }
  return s;
}

function stableKey(t: PlanGenerationTradeOff): string {
  return `${t.message_template_id}|${JSON.stringify(t.variables)}|${t.suggested_action?.action_id ?? ''}`;
}

function capitalizeDay(d: string): string {
  const x = d.trim();
  if (!x) return x;
  return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
}

/** Derive a short clause for strength relocation lines from the week optimizer. */
function parseStrengthRelocationNote(line: string): string {
  const m2 = line.match(/upper on\s+(\w+),\s*lower on\s+(\w+)/i);
  if (m2) {
    return `Upper body ${capitalizeDay(m2[1])}, lower body ${capitalizeDay(m2[2])}.`;
  }
  const m1 = line.match(/relocated to\s+(\w+)/i);
  if (m1) {
    return `Upper-body emphasis moved to ${capitalizeDay(m1[1])}.`;
  }
  const m1b = line.match(/\bmoved to\s+(\w+)/i);
  if (m1b) {
    return `Upper-body emphasis moved to ${capitalizeDay(m1b[1])}.`;
  }
  return 'See your calendar for the exact strength days.';
}

/**
 * Build the persisted trade-off list for a combined plan from post-race Arc context
 * plus per-goal week-optimizer snapshots (already in logs today).
 */
export function buildCombinedPlanGenerationTradeOffs(opts: {
  postRace: PostRaceRecoveryResult;
  optimizerSnapshots: PlanOptimizerSnapshotInput[];
}): PlanGenerationTradeOff[] {
  const out: PlanGenerationTradeOff[] = [];
  const seen = new Set<string>();

  const add = (row: PlanGenerationTradeOff) => {
    const k = stableKey(row);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(row);
  };

  if (opts.postRace.apply) {
    if (opts.postRace.severity === 'full') {
      add({
        kind: 'recovery_context',
        severity: 'notice',
        message_template_id: 'post_race_recovery_full',
        variables: {
          event_name: opts.postRace.event.name,
          days_ago: opts.postRace.event.days_ago,
        },
      });
    } else {
      add({
        kind: 'recovery_context',
        severity: 'info',
        message_template_id: 'post_race_recovery_moderate',
        variables: {
          event_name: opts.postRace.event.name,
          days_ago: opts.postRace.event.days_ago,
        },
      });
    }
  }

  const tradeOffLines: string[] = [];
  const conflictLines: string[] = [];
  const pinSkipped: string[] = [];
  let anyCoEqual = false;
  for (const s of opts.optimizerSnapshots) {
    tradeOffLines.push(...s.trade_offs);
    conflictLines.push(...(s.conflicts ?? []));
    pinSkipped.push(...s.pin_restore_skipped);
    if (s.used_co_equal_1x_fallback) anyCoEqual = true;
  }
  const uniqueTradeOffs = [...new Set(tradeOffLines)];
  const uniqueConflicts = [...new Set(conflictLines)];
  const uniquePinSkips = [...new Set(pinSkipped)];

  if (anyCoEqual) {
    add({
      kind: 'constraint_compromise',
      severity: 'warning',
      message_template_id: 'co_equal_provisional_1x',
      variables: {},
      suggested_action: {
        action_id: 'wizard:strength_schedule',
        label: 'Adjust schedule or strength frequency',
        wizard_step: 'combined_schedule',
      },
    });
  }

  const qualityUnplaced =
    uniqueTradeOffs.some(
      (line) =>
        line.includes('quality_run: no valid placement') || line.includes('Quality run not placed'),
    ) ||
    uniqueConflicts.some((line) => line.includes('quality_run: no valid placement'));
  if (qualityUnplaced) {
    add({
      kind: 'conflict_warning',
      severity: 'warning',
      message_template_id: 'quality_run_unplaced',
      variables: {},
      suggested_action: {
        action_id: 'wizard:group_ride_and_long_days',
        label: 'Move group ride or long days',
        wizard_step: 'combined_schedule',
      },
    });
  }

  for (const line of uniqueTradeOffs) {
    if (/^strength:/i.test(line.trim())) {
      add({
        kind: 'anchor_adjustment',
        severity: 'info',
        message_template_id: 'anchor_relocated_strength_default',
        variables: { placement_note: parseStrengthRelocationNote(line) },
        suggested_action: {
          action_id: 'wizard:schedule_anchors',
          label: 'Review schedule anchors',
          wizard_step: 'combined_schedule',
        },
      });
    }
  }

  for (const detail of uniquePinSkips) {
    add({
      kind: 'anchor_adjustment',
      severity: 'warning',
      message_template_id: 'anchor_pin_not_kept',
      variables: { detail },
      suggested_action: {
        action_id: 'wizard:schedule_anchors',
        label: 'Review pinned workout days',
        wizard_step: 'combined_schedule',
      },
    });
  }

  return out;
}

const QR_UNPLACED_TRADE_RE = /Quality run not placed/i;
const QR_UNPLACED_CONFLICT_RE = /quality_run:\s*no valid placement/i;

/** Optimizer / upstream lines that claim QR could not be placed (may be stale after week-builder). */
export function lineLooksLikeQualityRunUnplaced(line: string): boolean {
  const s = String(line).trim();
  return QR_UNPLACED_TRADE_RE.test(s) || QR_UNPLACED_CONFLICT_RE.test(s);
}

const SUN_FIRST_DAY_LABEL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function sunFirstIndexToDayLabel(idx: number): string {
  const i = ((idx % 7) + 7) % 7;
  return SUN_FIRST_DAY_LABEL[i] ?? 'that day';
}

export type QualityRunAnchorPins = {
  bike_quality_day?: number | null;
  long_ride_day?: number | null;
  long_run_day?: number | null;
  swim_quality_day?: number | null;
};

/** Short clause listing pinned weekdays (Arc sun-first indices) for QR fallback messaging. */
export function formatQualityRunAnchorPinsSummary(pins: QualityRunAnchorPins): string {
  const bits: string[] = [];
  if (pins.bike_quality_day != null) {
    bits.push(`group ride ${sunFirstIndexToDayLabel(pins.bike_quality_day)}`);
  }
  if (pins.long_ride_day != null) {
    bits.push(`long ride ${sunFirstIndexToDayLabel(pins.long_ride_day)}`);
  }
  if (pins.long_run_day != null) {
    bits.push(`long run ${sunFirstIndexToDayLabel(pins.long_run_day)}`);
  }
  if (pins.swim_quality_day != null) {
    bits.push(`quality swim ${sunFirstIndexToDayLabel(pins.swim_quality_day)}`);
  }
  return bits.length ? bits.join(', ') : 'your pinned anchors';
}

/**
 * First calendar weekday (session `day` string) where a structured quality run appears.
 */
export function inferFirstStructuredQualityRunWeekdayFromSessionsByWeek(
  sessions_by_week: Record<string, unknown> | null | undefined,
): string | null {
  if (!sessions_by_week || typeof sessions_by_week !== 'object') return null;
  const keys = Object.keys(sessions_by_week).sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    const weekSessions = sessions_by_week[k];
    if (!Array.isArray(weekSessions)) continue;
    for (const raw of weekSessions) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      if (!plannedSessionLooksLikeStructuredQualityRun(s)) continue;
      const day = String(s.day ?? '').trim();
      if (day) return day;
    }
  }
  return null;
}

/**
 * Week-builder placed structured quality while the week optimizer had no `preferred_days.quality_run`.
 */
export function buildQualityRunWeekBuilderFallbackTradeOff(
  placedDayPretty: string,
  pins: QualityRunAnchorPins,
): string {
  const anchors = formatQualityRunAnchorPinsSummary(pins);
  return (
    `Quality run placed on ${placedDayPretty} — week-builder resolved it after the week optimizer could not slot quality_run on its micro-grid (${anchors}).`
  );
}

/** Same predicate as weeks-scan below; exported for tests / reuse in Schedule adjustments UX. */
export function plannedSessionLooksLikeStructuredQualityRun(s: Record<string, unknown>): boolean {
  if (String(s.type ?? s.discipline ?? '').toLowerCase() !== 'run') return false;

  if (String(s.session_kind ?? '') === 'quality_run') return true;

  const name = String(s.name ?? '').toLowerCase();
  const tags = Array.isArray(s.tags)
    ? s.tags.map((t) => String(t).toLowerCase()).join(' ')
    : '';

  if (/^easy\s+run\b|^recovery\s+run\b|^zone\s*1\b|^z1\b/i.test(String(s.name ?? ''))) return false;
  if (
    tags.includes('easy_run') &&
    !/(interval|tempo|threshold|vo2|quality|hard|race)/.test(tags)
  ) {
    return false;
  }

  if (
    /interval|tempo|threshold|vo2|vo₂|track|strides|hill\s*repeat|race\s*pace|marathon\s*pace|\bmp\b|\blt\b|\bat\b/i.test(
      name,
    )
  ) {
    return true;
  }
  if (/interval|tempo|threshold|vo2|quality|race_specific|race-pace|hard_session/.test(tags)) {
    return true;
  }

  const ic = String(s.intensity_class ?? '');
  if ((ic === 'HARD' || ic === 'MODERATE') && !/^easy\b/.test(name)) return true;
  return false;
}

function sessionIsAnchoredGroupRide(s: Record<string, unknown>): boolean {
  const tags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).toLowerCase()) : [];
  if (tags.includes('group_ride')) return true;
  if (/group\s*ride/i.test(String(s.name ?? ''))) return true;
  return false;
}

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function sortWeekdays(days: Iterable<string>): string[] {
  return [...new Set([...days].map((d) => d.trim()).filter(Boolean))].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
  );
}

/**
 * When the anchored group ride and structured quality run land same weekday — surfaced on Goals
 * "Schedule adjustments" (optimizer prose alone omitted this).
 */
export function deriveGroupRideQualityRunSameDayTradeOff(
  sessions_by_week: Record<string, unknown> | null | undefined,
): string | null {
  if (!sessions_by_week || typeof sessions_by_week !== 'object') return null;
  const daysHit = new Set<string>();
  for (const weekSessions of Object.values(sessions_by_week)) {
    if (!Array.isArray(weekSessions)) continue;
    const byDay = new Map<string, Record<string, unknown>[]>();
    for (const raw of weekSessions) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      const day = String(s.day ?? '').trim();
      if (!day) continue;
      const arr = byDay.get(day) ?? [];
      arr.push(s);
      byDay.set(day, arr);
    }
    for (const [day, arr] of byDay) {
      const gr = arr.some(sessionIsAnchoredGroupRide);
      const qr = arr.some((x) => plannedSessionLooksLikeStructuredQualityRun(x));
      if (gr && qr) daysHit.add(day);
    }
  }
  if (!daysHit.size) return null;
  const pretty = sortWeekdays(daysHit).join(', ');
  return `${pretty}: anchored group ride and run intervals (quality run) share the same day — heavy legs; deliberate pairing around your pins.`;
}

/**
 * Bug 1 (2026-05-12): Optimizer emits strength-placement trade-off strings with the days the
 * OPTIMIZER chose. After week-builder collision passes / matrix conflict resolution, the actual
 * placement in `sessions_by_week` can differ. The athlete then sees a banner naming days that
 * don't match their calendar. This pass realigns the days in any "Strength: … upper on X, lower
 * on Y" line to the realized placement.
 *
 * Approach: rewrite the days in the line; preserve the surrounding prose ("moved to stay clear
 * of your pinned rides/runs", etc.) since the rationale is still accurate even if the days drift.
 */
function deriveRealizedStrengthPlacementFromSessionsByWeek(
  sessions_by_week: Record<string, unknown> | null | undefined,
): { upper: string; lower: string } | null {
  if (!sessions_by_week || typeof sessions_by_week !== 'object') return null;
  const sortedKeys = Object.keys(sessions_by_week).sort((a, b) => Number(a) - Number(b));
  for (const k of sortedKeys) {
    const sess = sessions_by_week[k];
    if (!Array.isArray(sess)) continue;
    let upper: string | null = null;
    let lower: string | null = null;
    for (const raw of sess) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      if (String(s.type ?? '').toLowerCase() !== 'strength') continue;
      const tags = Array.isArray(s.tags) ? s.tags.map((t) => String(t).toLowerCase()) : [];
      const day = String(s.day ?? '').trim();
      if (!day) continue;
      if (!upper && tags.includes('upper_body')) upper = day;
      else if (!lower && tags.includes('lower_body')) lower = day;
      if (upper && lower) break;
    }
    if (upper && lower) return { upper, lower };
  }
  return null;
}

function rewriteStrengthLineToRealized(
  line: string,
  realized: { upper: string; lower: string },
): string {
  return line
    .replace(/(\bupper on )\w+/i, `$1${realized.upper}`)
    .replace(/(\blower on )\w+/i, `$1${realized.lower}`);
}

/**
 * Rewrite the optimizer's hardcoded "AM run / PM lift" consolidated-day phrasing for
 * strength_first-preference athletes (STRENGTH-PROTOCOL.md §6.5). The optimizer doesn't read
 * `strength_ordering_preference`; it always emits the endurance_first phrasing. This post-
 * processor flips the ordering language to match the athlete's stated preference.
 *
 * Matches three optimizer message variants:
 *   "consolidated on <day> (AM run / PM lift) — performance + co-equal; ..."
 *   "stacked with quality_run on <day> (AM run / PM lift) — consolidated hard day per ..."
 *   any other prose containing "AM run / PM lift"
 *
 * For strength_first: rewrites to "AM lift / PM run".
 * For endurance_first (default): no change.
 */
function rewriteConsolidatedOrderingForPreference(
  line: string,
  pref: 'endurance_first' | 'strength_first',
): string {
  if (pref !== 'strength_first') return line;
  return line.replace(/AM run \/ PM lift/gi, 'AM lift / PM run');
}

/**
 * Merge week-builder `week_trade_offs` plus derived calendar facts into Goals-schedule banner lines.
 * Optimizer-only aggregates omit builder/session truths unless we enrich here.
 */
export function enrichScheduleSignalsWithCombinedPlanTradeOffs(
  signals: ScheduleSignals,
  opts: {
    week_trade_offs?: Record<string, unknown> | null;
    sessions_by_week?: Record<string, unknown> | null;
    hasAthletePins?: boolean;
    /** §6.5 athlete preference for same-day Lower + Quality ordering. Drives "AM run / PM lift"
     *  vs "AM lift / PM run" rewrite in trade-off messages. Default: 'endurance_first'. */
    strengthOrderingPreference?: 'endurance_first' | 'strength_first';
  },
): ScheduleSignals {
  const seen = new Set(signals.trade_offs.map((t) => String(t).trim()).filter(Boolean));
  const out = [...signals.trade_offs];

  const wto = opts.week_trade_offs;
  if (wto && typeof wto === 'object' && !Array.isArray(wto)) {
    for (const arr of Object.values(wto)) {
      if (!Array.isArray(arr)) continue;
      for (const line of arr) {
        const x = String(line).trim();
        if (x && !seen.has(x)) {
          out.push(x);
          seen.add(x);
        }
      }
    }
  }

  const derived = deriveGroupRideQualityRunSameDayTradeOff(opts.sessions_by_week ?? null);
  if (derived && !seen.has(derived)) {
    out.push(derived);
    seen.add(derived);
  }

  const realizedStrength = deriveRealizedStrengthPlacementFromSessionsByWeek(
    opts.sessions_by_week ?? null,
  );

  const realigned = realizedStrength
    ? out.map((line) => {
        const m = line.match(/^Strength:.*\bupper on (\w+)\b.*\blower on (\w+)\b/i);
        if (!m) return line;
        const sameUpper = m[1].toLowerCase() === realizedStrength.upper.toLowerCase();
        const sameLower = m[2].toLowerCase() === realizedStrength.lower.toLowerCase();
        if (sameUpper && sameLower) return line;
        return rewriteStrengthLineToRealized(line, realizedStrength);
      })
    : out;

  // §6.5: flip "AM run / PM lift" → "AM lift / PM run" for strength_first athletes.
  const pref = opts.strengthOrderingPreference === 'strength_first' ? 'strength_first' : 'endurance_first';
  const orderingFixed = realigned.map((line) => rewriteConsolidatedOrderingForPreference(line, pref));

  // Post-rewrite dedup: rewrites may collapse two divergent strings into the same realigned text.
  const dedupedHumanized: string[] = [];
  const seenHumanized = new Set<string>();
  for (const t of orderingFixed) {
    const h = humanizeScheduleTradeOffLine(String(t));
    const key = h.trim();
    if (!key || seenHumanized.has(key)) continue;
    seenHumanized.add(key);
    dedupedHumanized.push(h);
  }

  return {
    ...signals,
    trade_offs: filterAthleteFacingTradeOffs(dedupedHumanized, { hasAthletePins: opts.hasAthletePins }),
  };
}

export function sessionsByWeekHasStructuredQualityRun(
  sessions_by_week: Record<string, unknown> | null | undefined,
): boolean {
  if (!sessions_by_week || typeof sessions_by_week !== 'object') return false;
  for (const weekSessions of Object.values(sessions_by_week)) {
    if (!Array.isArray(weekSessions)) continue;
    for (const raw of weekSessions) {
      if (!raw || typeof raw !== 'object') continue;
      if (plannedSessionLooksLikeStructuredQualityRun(raw as Record<string, unknown>)) return true;
    }
  }
  return false;
}

/** Remove optimizer QR-unplaced noise when the combined engine actually placed run quality. */
export function stripStaleQualityRunUnplacedFromScheduleSignals(
  signals: ScheduleSignals,
  sessions_by_week: Record<string, unknown> | null | undefined,
): ScheduleSignals {
  if (!sessionsByWeekHasStructuredQualityRun(sessions_by_week)) return signals;
  return {
    ...signals,
    trade_offs: signals.trade_offs.filter((t) => !lineLooksLikeQualityRunUnplaced(String(t))),
    conflicts: signals.conflicts.filter((c) => !lineLooksLikeQualityRunUnplaced(String(c))),
  };
}
