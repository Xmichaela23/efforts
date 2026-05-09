import { clearArcWizardDraft } from '@/lib/arc-wizard-draft-storage';

/**
 * Single client-side cleanup for Arc wizard draft + list invalidations after delete / rollback.
 */
export function resetWizardClientState(userId: string | null): void {
  if (userId) {
    clearArcWizardDraft(userId);
  }
  try {
    window.dispatchEvent(new CustomEvent('arc-wizard:reset'));
    window.dispatchEvent(new CustomEvent('plans:invalidate'));
    window.dispatchEvent(new CustomEvent('goals:invalidate'));
  } catch {
    /* CustomEvent should not throw */
  }
}
