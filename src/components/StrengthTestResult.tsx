import React from 'react';

// Q-097/Q-102 phase 2 — the Performance-screen frame for a 1RM/baseline TEST.
// A test is measurement, not training: per-lift result (weight × reps → e1RM), the prior-test → this-test
// delta, the baseline outcome (kept / updated — read off the file by the server; "new baseline" struck 2026-09-15,
// TRUTH-MAP §9 Q5), a deadlift-conservative note, and a 0-rep
// "retest for a number" line. No execution score, no volume, no adherence — none of the training framing.

type Lift = {
  name: string;
  key: string;
  reps: number | null;
  weight: number | null;
  unit: 'lb' | 'kg' | 'reps';
  e1rm: number | null;
  prior_e1rm: number | null;
  stored: number | null;
  outcome: 'updated' | 'kept' | null;
  zero_rep: boolean;
  note: string | null;
};

function measureLine(l: Lift): string {
  if (l.unit === 'reps') {
    // Pull-ups (rep-max): the clean-rep count IS the result.
    return `${l.zero_rep ? 0 : (l.reps ?? 0)} clean reps`;
  }
  const rw = l.weight != null && l.reps != null ? `${l.weight} × ${l.reps}` : '';
  const e = l.e1rm != null ? `e1RM ${l.e1rm} ${l.unit}` : '';
  return [rw, e].filter(Boolean).join(' → ') || '—';
}

function OutcomeChip({ l }: { l: Lift }) {
  if (l.zero_rep || !l.outcome) return null;
  const suffix = l.unit === 'reps' ? '' : '';
  let text = '';
  if (l.outcome === 'updated') text = `updated to ${l.e1rm ?? ''}${suffix}`;
  else if (l.outcome === 'kept') text = `kept ${l.stored ?? ''}`;
  const kept = l.outcome === 'kept';
  const cls = kept ? 'text-label-secondary' : 'text-emerald-300';
  return (
    <span className={`text-caption tabular-nums whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

export function StrengthTestResult({
  result,
  onRecompute,
  recomputing,
  failureText = null,
}: {
  result: { headline?: string; lifts?: Lift[] } | null | undefined;
  onRecompute?: () => void;
  recomputing?: boolean;
  /** The stored analysis's failure line, or the last tap's error. Only then is "Try again" offered. */
  failureText?: string | null;
}) {
  const lifts = Array.isArray(result?.lifts) ? (result!.lifts as Lift[]) : [];
  return (
    <div className="w-full space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-subhead font-semibold text-label">{result?.headline || '1RM Test'}</span>
        <span className="text-caption text-label-secondary">measurement — no training score</span>
      </div>

      {lifts.length === 0 ? (
        <div className="text-subhead text-label-secondary">No test lifts recorded.</div>
      ) : (
        <div className="space-y-2.5">
          {lifts.map((l, i) => (
            <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-subhead font-medium text-label">{l.name}</span>
                <OutcomeChip l={l} />
              </div>
              <div className="mt-1 text-subhead text-label-secondary tabular-nums">{measureLine(l)}</div>
              {/* Delta: prior TEST → this TEST. Tests only mean something against the prior test. */}
              {!l.zero_rep && l.prior_e1rm != null && l.e1rm != null && (
                <div className="mt-0.5 text-caption text-label-secondary tabular-nums">
                  last test {l.prior_e1rm} → {l.e1rm}
                  {` ${l.unit}`}
                </div>
              )}
              {l.zero_rep && (
                <div className="mt-0.5 text-caption text-amber-300">
                  test set logged 0 reps — retest for a number
                </div>
              )}
              {l.note && <div className="mt-1 text-caption italic leading-snug text-label-secondary">{l.note}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ⛔ NO STANDING RECOMPUTE BUTTON (2026-09-12, Michael: "helpful for dev, not sure it's
          necessary for users"). A failed analysis is offered "Try again" by the caller. */}
      {failureText && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption text-rose-300 m-0">{failureText}</p>
          {onRecompute && (
            <button
              onClick={onRecompute}
              disabled={recomputing}
              className="shrink-0 h-8 px-3 text-caption rounded-xl bg-white/[0.06] border border-white/20 text-label-secondary hover:bg-white/[0.1] transition-all disabled:opacity-50"
              style={{ fontFamily: 'Inter, sans-serif' }}
              title="Run the analysis again"
            >
              {recomputing ? 'Trying…' : 'Try again'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default StrengthTestResult;
