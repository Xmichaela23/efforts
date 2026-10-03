/**
 * ⛔ THE PLAN SHEET (2026-10-02, docs/WORKORDER-plan-sheet-2026-10-02.md) — one week of the plan on one page, opened
 * from the plans screen. Replaces the markdown download.
 *
 * `plan-overview` composes the sheet (`_shared/plan-sheet.ts`); `planSheetHtml` draws it as one page, and that one page
 * is the preview here, the web's print-to-PDF and the iPhone's PDF. A week picker, then Save as PDF on the web, or
 * Save to Files and Share on the phone. Decides nothing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PlanSheetV1 } from '@shared/plan-sheet.ts';
import { planSheetHtml, planSheetFilename } from '@/lib/plan-sheet-html';
import { isNativeSheet, printPlanSheet, savePlanSheetToFiles, sharePlanSheet } from '@/lib/plan-sheet-export';

const pill = 'px-3 py-1.5 rounded-full bg-white/[0.08] backdrop-blur-md border border-white/20 text-white/80 hover:bg-white/[0.12] hover:text-white transition-colors text-sm disabled:opacity-40';

export default function PlanSheetDialog({
  planId,
  open,
  onClose,
  totalWeeks,
  initialWeek,
}: {
  planId: string | null;
  open: boolean;
  onClose: () => void;
  totalWeeks: number | null;
  initialWeek: number | null;
}) {
  const [week, setWeek] = useState<number>(initialWeek && initialWeek > 0 ? initialWeek : 1);
  const [sheet, setSheet] = useState<PlanSheetV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) setWeek(initialWeek && initialWeek > 0 ? initialWeek : 1); }, [open, initialWeek]);

  useEffect(() => {
    if (!open || !planId) return;
    let live = true;
    setLoading(true);
    setError(null);
    supabase.functions
      .invoke('plan-overview', { body: { plan_id: planId, sheet_week: week, as_of: new Date().toLocaleDateString('en-CA') } })
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err || !data?.success || !data?.sheet) { setSheet(null); setError('The sheet did not load.'); return; }
        setSheet(data.sheet as PlanSheetV1);
      })
      .catch(() => { if (live) { setSheet(null); setError('The sheet did not load.'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, planId, week]);

  // A sheet the page cannot draw shows the load error instead of taking the screen down.
  const html = useMemo(() => {
    if (!sheet) return '';
    try { return planSheetHtml(sheet); } catch { return ''; }
  }, [sheet]);
  const weeks = useMemo(() => Array.from({ length: Math.max(1, totalWeeks ?? 1) }, (_, i) => i + 1), [totalWeeks]);
  const native = isNativeSheet();

  const run = async (fn: () => Promise<void>) => {
    if (!sheet || busy) return;
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e: unknown) {
      // Closing the share sheet or the Files picker without choosing is not an error.
      const why = String((e as { message?: string })?.message ?? e);
      // The real reason goes to the console always (the device console reads it), and onto the screen in a dev build.
      console.error('[PlanSheet] PDF failed:', why);
      if (!/cancel/i.test(why)) setError(import.meta.env.DEV ? `The PDF was not made. (${why})` : 'The PDF was not made.');
    } finally { setBusy(false); }
  };

  if (!open) return null;
  // On the body, above the app's own header and tab bar.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Plan sheet">
      <div
        className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-white/10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
      >
        <button type="button" onClick={onClose} className={pill} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <Select value={String(week)} onValueChange={(v) => setWeek(Number(v))}>
          <SelectTrigger className="w-[120px] h-8 rounded-full bg-white/[0.08] border-white/20 text-white/90 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[1001]">
            {weeks.map((n) => <SelectItem key={n} value={String(n)}>Week {n}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          {native ? (
            <>
              <button type="button" className={pill} disabled={!html || busy} onClick={() => run(() => savePlanSheetToFiles(html, planSheetFilename(sheet!)))}>
                Save to Files
              </button>
              <button type="button" className={pill} disabled={!html || busy} onClick={() => run(() => sharePlanSheet(html, planSheetFilename(sheet!)))}>
                Share
              </button>
            </>
          ) : (
            <button type="button" className={pill} disabled={!html || busy} onClick={() => run(() => printPlanSheet(html))}>
              Save as PDF
            </button>
          )}
        </div>
      </div>
      {error ? <p className="px-4 py-2 text-sm text-white/70">{error}</p> : null}
      <div className="min-h-0 flex-1 bg-[#E9E7E1]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {loading && !sheet ? <p className="p-4 text-sm text-black/60">Loading…</p> : null}
        {sheet && !html ? <p className="p-4 text-sm text-black/60">The sheet did not load.</p> : null}
        {sheet && html ? <iframe title="Plan sheet" srcDoc={html} className="w-full h-full border-0 bg-white" /> : null}
      </div>
    </div>,
    document.body,
  );
}
