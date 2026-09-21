/**
 * ⛔ ANY WRITE TO THE ATHLETE'S BASELINES SAYS SO (2026-09-21, cache job 1 — docs/AUDIT-client-cache-2026-09-21.md).
 * Screens share one copy of the baselines row, kept 30 s (`loadUserBaselines`, AppContext). Every place that changes
 * the row, directly or through a server function, calls this after the write, so the next screen to open reads the
 * new row instead of the shared copy. It is a separate event from `baseline:saved` on purpose: that one also makes
 * Training Baselines reload its form, and a write from inside that form must not do that.
 */
export function markBaselinesStale(): void {
  try { window.dispatchEvent(new CustomEvent('baselines:stale')); } catch { /* CustomEvent should not throw */ }
}
