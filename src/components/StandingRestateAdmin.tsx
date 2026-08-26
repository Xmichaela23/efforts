import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

/**
 * Admin-only manual trigger for the post-test weight restate. The production path is the logger:
 * every strength save fires both rematerializers (StrengthLogger.tsx:4370). This card exists for
 * the case where the save-time fire was missed (stale bundle, attach failure) and there is no
 * strength session to save for days — the restate itself is already consent-safe to re-run: it
 * rewrites only weeks that have not started, and a no-change run writes nothing.
 *
 * Both rematerializers are asked, same as the logger: each refuses the other's block type, so at
 * most one answers.
 */
type RestateAnswer = {
  success?: boolean;
  applied?: boolean;
  reason?: string;
  current_week?: number;
  written?: number;
  missing?: string[];
  unmatched?: number | unknown[];
  changes?: unknown[];
  working_numbers?: Record<string, { value?: number; movement?: string }>;
};

const FNS = ['rematerialize-standing-block', 'rematerialize-strength-block'] as const;
const REFUSALS = new Set(['not_a_standing_plan_block', 'not_a_strength_block']);

export default function StandingRestateAdmin() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const run = async (apply: boolean) => {
    setBusy(true);
    const lines: string[] = [];
    try {
      const results = await Promise.allSettled(
        FNS.map((fn) => supabase.functions.invoke(fn, { body: apply ? { apply: true } : {} })),
      );
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') {
          lines.push(`${FNS[i]}: request failed`);
          return;
        }
        const d = (r.value as { data?: RestateAnswer })?.data;
        if (!d) {
          lines.push(`${FNS[i]}: no answer`);
          return;
        }
        if (d.reason && REFUSALS.has(d.reason)) return; // the other block's function; silence is correct
        const nums = d.working_numbers
          ? Object.values(d.working_numbers).map((w) => `${w.movement ?? '?'} ${w.value ?? '?'}`).join(', ')
          : null;
        lines.push(
          `${FNS[i]}: ${d.success ? 'ok' : 'failed'}`
          + (d.reason ? ` — ${d.reason}` : '')
          + (typeof d.current_week === 'number' ? ` — week ${d.current_week}` : '')
          + (nums ? ` — read: ${nums}` : '')
          + (Array.isArray(d.changes) ? ` — ${d.changes.length} rows would change` : '')
          + (typeof d.written === 'number' ? ` — ${d.written} rows written` : '')
          + (Array.isArray(d.missing) && d.missing.length ? ` — missing: ${d.missing.join(', ')}` : ''),
        );
      });
      if (lines.length === 0) lines.push('Both rematerializers refused — no matching block on this account.');
    } catch (e) {
      lines.push(`error: ${(e as Error)?.message ?? String(e)}`);
    }
    setLog(lines);
    setBusy(false);
  };

  return (
    <div className="rounded-lg border border-white/10 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium text-white">Restate weights from logged tests</h2>
        <p className="text-xs text-white/60 mt-1">
          Manual trigger for the restate the logger fires on every strength save. Check is a dry run.
          Apply rewrites only weeks that have not started.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => run(false)} disabled={busy} variant="outline" className="text-sm">
          {busy ? 'Working…' : 'Check'}
        </Button>
        <Button onClick={() => run(true)} disabled={busy} className="text-sm">
          Apply
        </Button>
      </div>
      {log.length > 0 && (
        <div className="text-xs text-white/70 space-y-1 break-words">
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
    </div>
  );
}
