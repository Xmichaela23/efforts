import { clearArcWizardDraft } from '@/lib/arc-wizard-draft-storage';

/**
 * Clears persisted Arc wizard draft and notifies listeners (`arc-wizard:reset`).
 * Use **only** after a successful wizard completion or explicit “start over” —
 * not on plan/goal delete (that would wipe in-progress setup while the athlete
 * is still on the wizard).
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
