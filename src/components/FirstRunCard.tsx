import React, { useEffect, useState } from 'react';
import { supabase, getStoredUserId } from '@/lib/supabase';

/**
 * First-run card (2026-09-07). One sentence, shown once per screen to a new athlete, dismissed by
 * tapping it, never shown again. Not a tour: no arrows, no sequence, no skip button.
 *
 * "Seen" lives in two places: this device (localStorage, so it never flashes back on a reload) and
 * the account (`user_baselines.ui_prefs.seen_first_run`, so a reinstall does not replay it). The
 * account copy is read once on mount and written spread-merged, the same way the State row order
 * and the Adjust section order are kept.
 */
export default function FirstRunCard({ id, children }: { id: string; children: React.ReactNode }) {
  const key = `efforts:seen:${id}`;
  const [seen, setSeen] = useState<boolean>(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });

  // Account copy: hide if another device already dismissed it.
  useEffect(() => {
    if (seen) return;
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;
    void supabase.from('user_baselines').select('ui_prefs').eq('user_id', uid).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const prefs = (data?.ui_prefs && typeof data.ui_prefs === 'object') ? (data.ui_prefs as Record<string, unknown>) : {};
      const seenMap = (prefs.seen_first_run && typeof prefs.seen_first_run === 'object') ? (prefs.seen_first_run as Record<string, boolean>) : {};
      if (seenMap[id]) {
        setSeen(true);
        try { localStorage.setItem(key, '1'); } catch { /* device copy only */ }
      }
    });
    return () => { cancelled = true; };
  }, [id, key, seen]);

  const dismiss = () => {
    setSeen(true);
    try { localStorage.setItem(key, '1'); } catch { /* device copy only */ }
    const uid = getStoredUserId();
    if (!uid) return;
    // Read-merge-write so a sibling preference written elsewhere is never clobbered.
    void supabase.from('user_baselines').select('ui_prefs').eq('user_id', uid).maybeSingle().then(({ data }) => {
      const prefs = (data?.ui_prefs && typeof data.ui_prefs === 'object') ? (data.ui_prefs as Record<string, unknown>) : {};
      const seenMap = (prefs.seen_first_run && typeof prefs.seen_first_run === 'object') ? (prefs.seen_first_run as Record<string, boolean>) : {};
      const next = { ...prefs, seen_first_run: { ...seenMap, [id]: true } };
      void supabase.from('user_baselines').update({ ui_prefs: next }).eq('user_id', uid).then(({ error }) => {
        if (error) console.warn('[FirstRunCard] kept on this device only:', error.message);
      });
    });
  };

  if (seen) return null;
  return (
    <button
      type="button"
      onClick={dismiss}
      className="w-full text-left rounded-xl border border-white/25 bg-white/[0.06] px-4 py-3 text-white/85 text-sm"
    >
      {children}
    </button>
  );
}
