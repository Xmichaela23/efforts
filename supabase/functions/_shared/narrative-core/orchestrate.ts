// The ONE retry-then-drop policy for every narrative surface (the Q-112 convergence): generate →
// validate against the shared core → regenerate once with the violation named → drop the prose on a
// second failure. A missing narrative is honest; a lying one isn't. Rejections are logged (surface,
// rule, claim) from day one so future keep/retire calls run on counts, not comments.

import { validateNarrative } from './validate.ts';
import type { NarrativeContext, ValidationFailure, DisciplineVerdict } from './types.ts';

/**
 * Apply the grounding context UNIFORMLY across every discipline surface (run/bike/swim/strength INSIGHTS
 * + the coach/State narrative), so rules 6/7 (spine), 8 (no-plan→no-target), 9 (name movements), and 10
 * (no invented phase) fire everywhere — not re-wired per analyzer. Each caller computes the inputs from
 * its own plan-linkage / arc phase / spine verdict and calls this once. Undefined inputs leave the
 * corresponding rule inert (so a surface opts into exactly what it can ground).
 */
/**
 * Extract a discipline's spine verdict from a `state_trends_v1` payload → a DisciplineVerdict for rules
 * 6/7. Access is uniform: every discipline exposes a top-level `.verdict` + `.pctChange` (bike's is the
 * power-or-efficiency LEAD; swim/strength/run are flat). null when the discipline has no real verdict
 * (needs_data / missing) — so rule 6 has no ground truth to defend and stays inert. The single mapping
 * point from the deterministic spine to the guardrails, so all four disciplines bind to one data layer.
 */
export function spineVerdictFor(stateTrendsV1: any, discipline: DisciplineVerdict['discipline']): DisciplineVerdict | null {
  const c = stateTrendsV1?.[discipline];
  if (!c || !c.verdict || c.verdict === 'needs_data') return null; // no real trend → rules 6/7 inert
  return { discipline, verdict: String(c.verdict), pctChange: c.pctChange ?? null };
}

export function applyGroundingContext(ctx: NarrativeContext, g: {
  isUnplanned?: boolean;                // → hasLinkedPlan (rule 8): unplanned ⇒ no target/adherence claim
  planPhaseNormalized?: string | null;  // → hasGroundedPhase (rule 10): 'unspecified'/null ⇒ no phase label
  spineVerdict?: DisciplineVerdict | null; // → disciplineVerdicts (rules 6/7): no contradiction / no recap
  mustNameMovements?: string[];         // → rule 9 (strength novel movements)
}): NarrativeContext {
  if (g.isUnplanned !== undefined) ctx.hasLinkedPlan = !g.isUnplanned;
  if (g.planPhaseNormalized !== undefined) ctx.hasGroundedPhase = !!(g.planPhaseNormalized && g.planPhaseNormalized !== 'unspecified');
  if (g.spineVerdict) ctx.disciplineVerdicts = [g.spineVerdict];
  if (g.mustNameMovements?.length) ctx.mustNameMovements = g.mustNameMovements;
  return ctx;
}

export interface RejectionLogEntry { surface: string; rule: number; code: string; claim: string; }

function logFailures(surface: string, failures: ValidationFailure[], log?: (e: RejectionLogEntry) => void): void {
  for (const f of failures) {
    const entry: RejectionLogEntry = { surface, rule: f.rule, code: f.code, claim: f.why.slice(0, 160) };
    if (log) log(entry);
    else console.warn(`[narrative-guard] ${surface} rule${entry.rule}:${entry.code} — ${entry.claim}`);
  }
}

/** Pure decision (fixturable): clean draft → else clean retry → else drop the prose. */
export function resolveGuardedNarrative(
  draft: string | null,
  retry: string | null,
  ctx: NarrativeContext,
): { narrative: string | null; dropped: boolean } {
  if (!draft) return { narrative: null, dropped: false };
  if (validateNarrative(draft, ctx).ok) return { narrative: draft, dropped: false };
  if (retry && validateNarrative(retry, ctx).ok) return { narrative: retry, dropped: false };
  return { narrative: null, dropped: true };
}

/**
 * Full guarded generation: generate → validate → regenerate ONCE (with the retryNote appended by the
 * caller's `generate`) → drop on second failure. Surface-agnostic; every LLM surface calls this.
 */
export async function runGuardedNarrative(args: {
  surface: string;
  ctx: NarrativeContext;
  generate: (retryNote: string | null) => Promise<string | null>;
  log?: (e: RejectionLogEntry) => void;
}): Promise<{ narrative: string | null; dropped: boolean }> {
  const draft = await args.generate(null);
  if (!draft) return { narrative: null, dropped: false };
  const v1 = validateNarrative(draft, args.ctx);
  if (v1.ok) return { narrative: draft, dropped: false };
  logFailures(args.surface, v1.failures, args.log);

  const retry = await args.generate(v1.retryNote);
  if (retry) {
    const v2 = validateNarrative(retry, args.ctx);
    if (v2.ok) return { narrative: retry, dropped: false };
    logFailures(args.surface, v2.failures, args.log);
  }
  return { narrative: null, dropped: true };
}
