import { clearArcWizardDraft } from '@/lib/arc-wizard-draft-storage';

/**
 * Clears persisted Arc wizard draft and notifies listeners (`arc-wizard:reset`).
 * Call after successful completion, explicit “start over”, or **materialize failure**
 * so local draft races do not survive a broken plan build. Do not use on unrelated
 * plan/goal deletes while the athlete may still be mid-wizard.
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
