/**
 * Persist Arc / season wizard progress so athletes can leave (e.g. open Strava)
 * and return from mobile Safari, installed PWA, or desktop without losing the step.
 */

import type { GroupRideRouteSnapshot } from '@/lib/group-ride-route-snapshot';

const KEY_PREFIX = 'efforts_arc_wizard_draft_v1:';
/** Drop drafts older than this so stale partials don’t resurrect forever */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function arcWizardDraftStorageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** Drop ephemeral UI + huge polyline (stats stay; map can reload when URL refetches). */
export function stripWizardSnapshotForStorage(
  snap: GroupRideRouteSnapshot | null,
): GroupRideRouteSnapshot | null {
  if (!snap || typeof snap !== 'object') return snap;
  const { map_polyline: _omit, ...rest } = snap;
  return rest as GroupRideRouteSnapshot;
}

export function saveArcWizardDraft(
  userId: string,
  stepIdx: number,
  state: Record<string, unknown>,
): void {
  try {
    const payload = {
      v: 1 as const,
      userId,
      savedAt: Date.now(),
      stepIdx,
      state: {
        ...state,
        groupRideRouteFetching: false,
        groupRideRouteFetchError: null,
        groupRideRouteSnapshot: stripWizardSnapshotForStorage(
          state.groupRideRouteSnapshot as GroupRideRouteSnapshot | null,
        ),
      },
    };
    localStorage.setItem(arcWizardDraftStorageKey(userId), JSON.stringify(payload));
  } catch (e) {
    console.warn('[arc-wizard-draft] save failed', e);
  }
}

export function loadArcWizardDraft(userId: string): {
  stepIdx: number;
  state: Record<string, unknown>;
} | null {
  try {
    const raw = localStorage.getItem(arcWizardDraftStorageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      v?: number;
      userId?: string;
      savedAt?: number;
      stepIdx?: number;
      state?: unknown;
    };
    if (
      p.v !== 1 ||
      p.userId !== userId ||
      typeof p.stepIdx !== 'number' ||
      !p.state ||
      typeof p.state !== 'object' ||
      Array.isArray(p.state)
    ) {
      return null;
    }
    if (typeof p.savedAt === 'number' && Date.now() - p.savedAt > MAX_AGE_MS) {
      clearArcWizardDraft(userId);
      return null;
    }
    const st = p.state as Record<string, unknown>;
    if (!Array.isArray(st.races) || st.races.length === 0) return null;
    return { stepIdx: Math.max(0, Math.floor(p.stepIdx)), state: st };
  } catch {
    return null;
  }
}

export function clearArcWizardDraft(userId: string): void {
  try {
    localStorage.removeItem(arcWizardDraftStorageKey(userId));
  } catch {
    /* ignore */
  }
}
