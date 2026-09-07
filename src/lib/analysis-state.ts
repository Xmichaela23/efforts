/**
 * "Failed" on screen (docs/WORKORDER-plumbing-2026-09-07.md §3).
 *
 * The server writes `analysis_status` ('pending' | 'analyzing' | 'complete' | 'failed'), `analysis_error`
 * ('<step>: <reason>', from run-jobs or the analyser) and `analysis_updated_at` (trigger, when the status
 * last changed). This module turns those into the one line the Performance card prints and the one
 * dot the Home rows show. Plain words, no codes.
 *
 * Run: ~/.deno/bin/deno test --no-check src/lib/analysis-state.test.ts
 */

export type AnalysisState = 'failed' | 'stalled' | 'analyzing' | 'pending' | 'complete' | null;

export type AnalysisRow = {
  workout_status?: string | null;
  analysis_status?: string | null;
  analysis_error?: string | null;
  analysis_updated_at?: string | null;
};

/**
 * OURS — an 'analyzing' / 'pending' older than this reads as stalled. Four times the edge runtime's
 * 150 s wall-clock cap (Supabase docs), so a chain still inside its limit is never called stalled.
 */
export const STALLED_AFTER_MS = 10 * 60 * 1000;

const STEP_WORDS: Record<string, string> = {
  summary: 'the summary',
  analysis: 'the analysis',
  workload: 'the load',
  adaptation: 'the adaptation read',
  facts: 'the facts',
  analyze: 'the sport read',
  snapshot: 'the snapshot',
  'auto-attach': 'the plan match',
  recompute: 'the start',
};

export function analysisState(row: AnalysisRow | null | undefined, nowMs: number = Date.now()): AnalysisState {
  if (!row) return null;
  if (String(row.workout_status || 'completed').toLowerCase() !== 'completed') return null;
  const status = String(row.analysis_status || '').toLowerCase();
  if (!status) return null;
  if (status === 'failed') return 'failed';
  if (status === 'complete' || status === 'completed') return 'complete';
  if (status === 'analyzing' || status === 'pending') {
    const t = row.analysis_updated_at ? Date.parse(row.analysis_updated_at) : NaN;
    // No stamp = it was set before the stamp existed, or never stamped: too old to trust.
    if (!Number.isFinite(t) || nowMs - t >= STALLED_AFTER_MS) return 'stalled';
    return status as 'analyzing' | 'pending';
  }
  return null;
}

/** '<step>: <reason>' → { step, reason }. A bare message has no step. */
export function splitStepError(text: string | null | undefined): { step: string | null; reason: string } {
  const s = String(text || '').trim();
  const m = s.match(/^([a-z][a-z-]*):\s*(.*)$/is);
  if (m && m[1].toLowerCase() in STEP_WORDS) return { step: m[1].toLowerCase(), reason: m[2].trim() };
  return { step: null, reason: s };
}

/** Strip the codes an athlete should not read: leading "HTTP 546:", "Edge Function returned…". */
export function plainReason(reason: string): string {
  let r = String(reason || '').trim();
  r = r.replace(/^HTTP\s+\d{3}\s*:?\s*/i, '');
  r = r.replace(/Edge Function returned a non-2xx status code/i, 'the server did not answer');
  r = r.replace(/\s+/g, ' ').trim();
  if (r.length > 140) r = r.slice(0, 137).trimEnd() + '…';
  return r;
}

/** The card's line, or null when there is nothing to say. */
export function analysisFailureLine(row: AnalysisRow | null | undefined, nowMs: number = Date.now()): string | null {
  const state = analysisState(row, nowMs);
  if (state === 'failed') {
    const { step, reason } = splitStepError(row?.analysis_error);
    const where = step ? STEP_WORDS[step] : null;
    const why = plainReason(reason);
    if (where && why) return `Analysis failed at ${where}: ${why}.`;
    if (where) return `Analysis failed at ${where}.`;
    if (why) return `Analysis failed: ${why}.`;
    return 'Analysis failed.';
  }
  if (state === 'stalled') return 'Analysis did not finish.';
  return null;
}

/** The Home dot: failed or stalled. */
export function analysisNeedsAttention(row: AnalysisRow | null | undefined, nowMs: number = Date.now()): boolean {
  const s = analysisState(row, nowMs);
  return s === 'failed' || s === 'stalled';
}

/**
 * The athlete's own tap came back with an error: recompute-workout answers 500 with
 * { error: '<step>: <reason>' }. Same words as the stored line.
 */
export function describeRecomputeError(bodyText: string | null | undefined, fallback: string): string {
  const text = String(bodyText || '').trim();
  if (text) {
    try {
      const j = JSON.parse(text);
      const e = typeof j?.error === 'string' ? j.error : null;
      if (e) {
        const { step, reason } = splitStepError(e);
        const where = step ? STEP_WORDS[step] : null;
        const why = plainReason(reason);
        if (where) return why ? `Analysis failed at ${where}: ${why}.` : `Analysis failed at ${where}.`;
        return why ? `Analysis failed: ${why}.` : 'Analysis failed.';
      }
    } catch { /* not JSON */ }
  }
  const why = plainReason(fallback);
  return why ? `Analysis failed: ${why}.` : 'Analysis failed.';
}
