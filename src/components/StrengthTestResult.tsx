import React from 'react';

// Q-097/Q-102 phase 2 — the Performance-screen frame for a 1RM/baseline TEST.
// A test is measurement, not training: per-lift result (weight × reps → e1RM), the prior-test → this-test
// delta, the baseline outcome (kept / updated / new baseline), a deadlift-conservative note, and a 0-rep
// "retest for a number" line. No execution score, no volume, no adherence — none of the training framing.

type Lift = {
  name: string;
  key: string;
  reps: number | null;
  weight: number | null;
  unit: 'lb' | 'reps';
  e1rm: number | null;
  prior_e1rm: number | null;
  stored: number | null;
  outcome: 'new_baseline' | 'updated' | 'kept' | null;
  zero_rep: boolean;
  note: string | null;
};

function measureLine(l: Lift): string {
  if (l.unit === 'reps') {
    // Pull-ups (rep-max): the clean-rep count IS the result.
    return `${l.zero_rep ? 0 : (l.reps ?? 0)} clean reps`;
  }
  const rw = l.weight != null && l.reps != null ? `${l.weight} × ${l.reps}` : '';
  const e = l.e1rm != null ? `e1RM ${l.e1rm} lb` : '';
  return [rw, e].filter(Boolean).join(' → ') || '—';
}

function OutcomeChip({ l }: { l: Lift }) {
  if (l.zero_rep || !l.outcome) return null;
  const suffix = l.unit === 'reps' ? '' : '';
  let text = '';
  if (l.outcome === 'new_baseline') text = 'new baseline';
  else if (l.outcome === 'updated') text = `updated to ${l.e1rm ?? ''}${suffix}`;
  else if (l.outcome === 'kept') text = `kept ${l.stored ?? ''}`;
  const kept = l.outcome === 'kept';
  const cls = kept
    ? 'text-white/55 border-white/20'
    : 'text-emerald-300/90 border-emerald-400/40';
  return (
    <span className={`text-[10px] rounded-full border px-2 py-0.5 tabular-nums whitespace-nowrap ${cls}`}>
      {text}
    </span>
  );
}

export function StrengthTestResult({
  result,
  onRecompute,
  recomputing,
}: {
  result: { headline?: string; lifts?: Lift[] } | null | undefined;
  onRecompute?: () => void;
  recomputing?: boolean;
}) {
  const lifts = Array.isArray(result?.lifts) ? (result!.lifts as Lift[]) : [];
  return (
    <div className="w-full space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-white/90">{result?.headline || '1RM Test'}</span>
        <span className="text-[11px] text-white/40">measurement — no training score</span>
      </div>

      {lifts.length === 0 ? (
        <div className="text-sm text-white/60">No test lifts recorded.</div>
      ) : (
        <div className="space-y-2.5">
          {lifts.map((l, i) => (
            <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white/90">{l.name}</span>
                <OutcomeChip l={l} />
              </div>
              <div className="mt-1 text-sm text-white/75 tabular-nums">{measureLine(l)}</div>
              {/* Delta: prior TEST → this TEST. Tests only mean something against the prior test. */}
              {!l.zero_rep && l.prior_e1rm != null && l.e1rm != null && (
                <div className="mt-0.5 text-xs text-white/50 tabular-nums">
                  last test {l.prior_e1rm} → {l.e1rm}
                  {l.unit === 'lb' ? ' lb' : ' reps'}
                </div>
              )}
              {l.zero_rep && (
                <div className="mt-0.5 text-xs text-amber-300/80">
                  test set logged 0 reps — retest for a number
                </div>
              )}
              {l.note && <div className="mt-1 text-[11px] italic leading-snug text-white/40">{l.note}</div>}
            </div>
          ))}
        </div>
      )}

      {onRecompute && (
        <button
          onClick={onRecompute}
          disabled={recomputing}
          className="w-full h-9 text-xs rounded-full bg-white/[0.06] border-2 border-white/20 text-white/70 hover:bg-white/[0.1] hover:border-white/30 transition-all disabled:opacity-50"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {recomputing ? 'Recomputing…' : 'Recompute analysis'}
        </button>
      )}
    </div>
  );
}

export default StrengthTestResult;
