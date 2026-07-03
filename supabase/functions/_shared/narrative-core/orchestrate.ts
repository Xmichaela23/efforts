// The ONE retry-then-drop policy for every narrative surface (the Q-112 convergence): generate →
// validate against the shared core → regenerate once with the violation named → drop the prose on a
// second failure. A missing narrative is honest; a lying one isn't. Rejections are logged (surface,
// rule, claim) from day one so future keep/retire calls run on counts, not comments.

import { validateNarrative } from './validate.ts';
import type { NarrativeContext, ValidationFailure } from './types.ts';

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
