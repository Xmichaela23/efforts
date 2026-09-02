/**
 * ⛔ THE SIX-WEEK CHECKPOINT SHEET (Michael 2026-09-02; book p112/p123/p275 — adjust the threshold
 * figure after six weeks, capped step, never add work). Facts only: one row per number (what the
 * unstarted rows were priced off → what the app measures now), p123's three signals as early-vs-late
 * facts, then Accept (re-price the unstarted endurance rows) or Keep (record, move nothing). No verdict
 * words — the sheet states, the athlete decides. Unanswered = the old numbers stand.
 * Rows built before the provenance stamp carry no "on plan" number: the live number shows alone.
 */
import React, { useState } from 'react';
import { useEnduranceCheckpoint, type CheckpointEvidence, type CheckpointNumber } from '@/hooks/useEnduranceCheckpoint';

const LABEL: Record<CheckpointNumber['key'], string> = { threshold_pace: 'Threshold pace', ftp: 'FTP', lthr: 'Threshold heart rate' };

function fmt(n: number | null, unit: CheckpointNumber['unit']): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (unit === 'sec/mi') { const s = Math.round(n); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/mi`; }
  return `${Math.round(n)} ${unit}`;
}

function evidenceLine(e: CheckpointEvidence | null): string | null {
  if (!e || e.sessions < 2 || e.early.sessions === 0 || e.late.sessions === 0) return null;
  const noun = e.sport === 'run' ? 'Hard runs' : 'Hard rides';
  const parts: string[] = [];
  if (e.early.avg_hr != null && e.late.avg_hr != null) parts.push(`heart rate ${Math.round(e.early.avg_hr)} → ${Math.round(e.late.avg_hr)}`);
  if (e.early.avg_work != null && e.late.avg_work != null) {
    parts.push(e.sport === 'run'
      ? `pace ${fmt(e.early.avg_work, 'sec/mi')} → ${fmt(e.late.avg_work, 'sec/mi')}`
      : `power ${Math.round(e.early.avg_work)} → ${Math.round(e.late.avg_work)} W`);
  }
  if (e.early.avg_rpe != null && e.late.avg_rpe != null) parts.push(`effort ${e.early.avg_rpe} → ${e.late.avg_rpe}`);
  if (e.early.avg_drift_pct != null && e.late.avg_drift_pct != null) parts.push(`decoupling ${e.early.avg_drift_pct}% → ${e.late.avg_drift_pct}%`);
  if (parts.length === 0) return `${noun}: ${e.sessions} sessions, nothing measured on them yet.`;
  return `${noun}: ${parts.join(', ')} over ${e.sessions} sessions, first half to second half.`;
}

export function EnduranceCheckpointSheet({ enabled }: { enabled: boolean }) {
  const cp = useEnduranceCheckpoint(enabled);
  const [busy, setBusy] = useState<'accept' | 'keep' | null>(null);

  if (cp.answered) {
    return (
      <div className="galaxy-card readout-texture rounded-2xl px-3 py-2.5 mb-2 text-[12px] text-white/60">
        {cp.answered.decision === 'accept'
          ? `Checkpoint answered: ${cp.answered.rowsRepriced} upcoming endurance ${cp.answered.rowsRepriced === 1 ? 'session' : 'sessions'} re-priced to the numbers the app measures now.`
          : 'Checkpoint answered: the block keeps the numbers it was built on.'}
      </div>
    );
  }
  if (cp.loading || !cp.due) return null;

  const rows = cp.numbers.filter((n) => n.live != null || n.on_plan != null);
  const lines = [evidenceLine(cp.evidence.run), evidenceLine(cp.evidence.ride)].filter((x): x is string => !!x);
  const stamped = cp.rowsStamped > 0;

  return (
    <div className="galaxy-card readout-texture rounded-2xl px-3 py-3 mb-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold tracking-[0.12em] uppercase text-white/85">week {cp.week} checkpoint</span>
        <span className="text-[11px] text-white/55">{cp.rowsPending} upcoming endurance {cp.rowsPending === 1 ? 'session' : 'sessions'}</span>
      </div>
      <p className="text-[12px] text-white/55 mt-1 leading-snug">
        {stamped
          ? 'What the upcoming sessions were priced off, and what the app measures now.'
          : 'What the app measures now. These sessions were built before the app kept a record of their numbers.'}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.map((n) => (
          <div key={n.key} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-white/70">{LABEL[n.key]}</span>
            <span className="tabular-nums text-white/90">
              {stamped && n.on_plan != null ? <>{fmt(n.on_plan, n.unit)} <span className="text-white/45">→</span> </> : null}
              {fmt(n.live, n.unit)}
              {n.large && <span className="ml-2 text-[11px] text-white/50">big move</span>}
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-[12px] text-white/50">No threshold pace, FTP or threshold heart rate on file yet.</div>}
      </div>
      {lines.length > 0 && (
        <div className="mt-2 space-y-1">
          {lines.map((l, i) => <p key={i} className="text-[12px] text-white/60 leading-snug">{l}</p>)}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy != null || rows.length === 0}
          onClick={async () => { setBusy('accept'); await cp.answer('accept'); setBusy(null); }}
          className="text-[12px] font-medium px-3 py-1.5 rounded-xl text-white bg-white/[0.12] border border-white/25 disabled:opacity-50"
        >
          {busy === 'accept' ? 'Working…' : 'Use the measured numbers'}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={async () => { setBusy('keep'); await cp.answer('keep'); setBusy(null); }}
          className="text-[12px] font-medium px-3 py-1.5 rounded-xl text-white/70 bg-white/[0.05] border border-white/15 disabled:opacity-50"
        >
          {busy === 'keep' ? 'Working…' : 'Keep the block as built'}
        </button>
      </div>
      <p className="text-[11px] text-white/40 mt-2 leading-snug">Unanswered, the block keeps its numbers. Completed sessions never change.</p>
    </div>
  );
}

export default EnduranceCheckpointSheet;
