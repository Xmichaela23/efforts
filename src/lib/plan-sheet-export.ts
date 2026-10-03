/**
 * ⛔ THE PLAN SHEET LEAVES THE APP AS A PDF (2026-10-02, docs/WORKORDER-plan-sheet-2026-10-02.md "Platforms").
 *
 * Phone: the app's own `PlanSheetPdf` plugin (`ios/App/App/PlanSheetPdfPlugin.swift`) turns the sheet's page into a PDF
 * with iOS's own page-to-PDF, writes it to the app's cache, then either opens the Files save picker or hands it to the
 * share sheet (Capacitor Share — the "Download your data" pattern, `export-data.ts`).
 * Web: the page is printed from a hidden frame, and the browser's print window saves it as a PDF.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

type PlanSheetPdfPlugin = {
  makePdf(opts: { html: string; filename: string }): Promise<{ uri: string }>;
  saveToFiles(opts: { uri: string }): Promise<{ saved: boolean }>;
};
const PlanSheetPdf = registerPlugin<PlanSheetPdfPlugin>('PlanSheetPdf');

export const isNativeSheet = (): boolean => Capacitor.isNativePlatform();

/** iPhone: the PDF into the Files save picker. */
export async function savePlanSheetToFiles(html: string, filename: string): Promise<void> {
  const { uri } = await PlanSheetPdf.makePdf({ html, filename });
  await PlanSheetPdf.saveToFiles({ uri });
}

/** iPhone: the PDF into the share sheet (Messages, Mail, AirDrop). */
export async function sharePlanSheet(html: string, filename: string): Promise<void> {
  const { uri } = await PlanSheetPdf.makePdf({ html, filename });
  const { Share } = await import('@capacitor/share');
  await Share.share({ title: filename, url: uri });
}

/** Web: print the page from a hidden frame; the print window's "Save as PDF" writes the file. */
export function printPlanSheet(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const done = () => { setTimeout(() => frame.remove(), 1000); resolve(); };
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) { done(); return; }
      // Give the page's fonts a moment so the PDF does not print the fallback face.
      const go = () => { win.focus(); win.print(); done(); };
      const fonts = (win.document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
      if (fonts?.ready) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(go);
      else go();
    };
    frame.srcdoc = html;
  });
}
