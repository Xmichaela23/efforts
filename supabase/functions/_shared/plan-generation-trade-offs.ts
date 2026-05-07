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

export function aggregateOptimizerScheduleSignals(
  snapshots: PlanOptimizerSnapshotInput[],
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
    trade_offs: [...tradeOffs],
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
  const pinSkipped: string[] = [];
  let anyCoEqual = false;
  for (const s of opts.optimizerSnapshots) {
    tradeOffLines.push(...s.trade_offs);
    pinSkipped.push(...s.pin_restore_skipped);
    if (s.used_co_equal_1x_fallback) anyCoEqual = true;
  }
  const uniqueTradeOffs = [...new Set(tradeOffLines)];
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

  const qualityUnplaced = uniqueTradeOffs.some(
    (line) =>
      line.includes('quality_run: no valid placement') || line.includes('Quality run not placed'),
  );
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
    if (line.startsWith('strength: default')) {
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

function lineLooksLikeQualityRunUnplaced(line: string): boolean {
  const s = String(line).trim();
  return QR_UNPLACED_TRADE_RE.test(s) || QR_UNPLACED_CONFLICT_RE.test(s);
}

/**
 * True when the built calendar includes run stimulus we treat as "quality" for UX purposes:
 * intervals/tempo/threshold-style work, explicit quality_run kind, or hard/moderate non-easy runs.
 * Used to drop stale optimizer strings that claim quality_run could not be placed.
 */
export function sessionsByWeekHasStructuredQualityRun(
  sessions_by_week: Record<string, unknown> | null | undefined,
): boolean {
  if (!sessions_by_week || typeof sessions_by_week !== 'object') return false;
  for (const weekSessions of Object.values(sessions_by_week)) {
    if (!Array.isArray(weekSessions)) continue;
    for (const raw of weekSessions) {
      if (!raw || typeof raw !== 'object') continue;
      const s = raw as Record<string, unknown>;
      if (String(s.type ?? s.discipline ?? '') !== 'run') continue;

      if (String(s.session_kind ?? '') === 'quality_run') return true;

      const name = String(s.name ?? '').toLowerCase();
      const tags = Array.isArray(s.tags)
        ? s.tags.map((t) => String(t).toLowerCase()).join(' ')
        : '';

      if (/^easy\s+run\b|^recovery\s+run\b|^zone\s*1\b|^z1\b/i.test(String(s.name ?? ''))) continue;
      if (
        tags.includes('easy_run') &&
        !/(interval|tempo|threshold|vo2|quality|hard|race)/.test(tags)
      ) {
        continue;
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
