import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase, getStoredUserId } from '@/lib/supabase';

/**
 * First-run overlay (2026-09-08). Shown once on Home while the account has no plan, the way Strava
 * and Garmin Connect introduce a screen: the screen dims with a hole cut around one control, one
 * label beside it, and a tap moves to the next. Four stops, then it is gone for good (device +
 * `ui_prefs.seen_first_run.overlay`, the same two places FirstRunCard uses). Words are Michael's.
 */
export type Stop = { target: string; text: string; pad?: number };

/** Home, once, while the account has no plan. */
export const HOME_STOPS: Stop[] = [
  { target: 'button[aria-label="Menu"]', text: 'Menu: Profile, Connections, Account', pad: 8 },
  { target: '[data-first-run="calendar"]', text: 'This calendar will fill with upcoming and completed sessions you can tap for details.', pad: 4 },
  { target: '[data-first-run="state"]', text: 'State: how your training is going', pad: 6 },
  { target: '[data-first-run="focus"]', text: 'Focus: build your plan', pad: 6 },
];

/** State, once, on the first visit. */
export const STATE_STOPS: Stop[] = [
  { target: '[data-first-run="status"]', text: 'Status: how training is going based on this week and previous weeks.', pad: 6 },
  { target: '[data-first-run="adjust"]', text: 'Adjust: change the numbers and the plan for sessions you have not done yet.', pad: 6 },
  { target: '[data-first-run="schedule"]', text: 'Schedule: move sessions around your week.', pad: 6 },
];

type Box = { top: number; left: number; width: number; height: number };

export default function FirstRunOverlay({ id = 'overlay', stops = HOME_STOPS, active }: { id?: string; stops?: Stop[]; active: boolean }) {
  const ID = id;
  const KEY = `efforts:seen:${ID}`;
  const STOPS = stops;
  const [seen, setSeen] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (seen || !active) return;
    const uid = getStoredUserId();
    if (!uid) return;
    let cancelled = false;
    void supabase.from('user_baselines').select('ui_prefs').eq('user_id', uid).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const prefs = (data?.ui_prefs && typeof data.ui_prefs === 'object') ? (data.ui_prefs as Record<string, unknown>) : {};
      const seenMap = (prefs.seen_first_run && typeof prefs.seen_first_run === 'object') ? (prefs.seen_first_run as Record<string, boolean>) : {};
      if (seenMap[ID]) { setSeen(true); try { localStorage.setItem(KEY, '1'); } catch { /* device copy only */ } }
    });
    return () => { cancelled = true; };
  }, [active, seen, ID, KEY]);

  // Measure the current stop's control; re-measure on resize and a moment after mount (layout settles).
  useLayoutEffect(() => {
    if (seen || !active) return;
    const measure = () => {
      const el = document.querySelector(STOPS[step].target) as HTMLElement | null;
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      const pad = STOPS[step].pad ?? 6;
      setBox({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    };
    measure();
    const t = setTimeout(measure, 250);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [step, seen, active, STOPS]);

  const finish = () => {
    setSeen(true);
    try { localStorage.setItem(KEY, '1'); } catch { /* device copy only */ }
    const uid = getStoredUserId();
    if (!uid) return;
    void supabase.from('user_baselines').select('ui_prefs').eq('user_id', uid).maybeSingle().then(({ data }) => {
      const prefs = (data?.ui_prefs && typeof data.ui_prefs === 'object') ? (data.ui_prefs as Record<string, unknown>) : {};
      const seenMap = (prefs.seen_first_run && typeof prefs.seen_first_run === 'object') ? (prefs.seen_first_run as Record<string, boolean>) : {};
      void supabase.from('user_baselines').update({ ui_prefs: { ...prefs, seen_first_run: { ...seenMap, [ID]: true } } }).eq('user_id', uid);
    });
  };
  const next = () => { if (step + 1 >= STOPS.length) finish(); else setStep(step + 1); };

  if (seen || !active || typeof document === 'undefined') return null;

  const stop = STOPS[step];
  const vh = window.innerHeight;
  // Label below the hole when there is room, otherwise above it (the tab bar stops are at the bottom).
  const below = box ? box.top + box.height + 120 < vh : true;
  const labelTop = box ? (below ? box.top + box.height + 12 : undefined) : vh * 0.42;
  const labelBottom = box && !below ? vh - box.top + 12 : undefined;

  return createPortal(
    <div role="dialog" aria-label="Welcome" onClick={next} style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'pointer' }}>
      {/* the hole: everything outside it is the dim */}
      {box ? (
        <div style={{
          position: 'absolute', top: box.top, left: box.left, width: box.width, height: box.height,
          borderRadius: 14, boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)', pointerEvents: 'none',
          transition: 'top 220ms ease, left 220ms ease, width 220ms ease, height 220ms ease',
        }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', pointerEvents: 'none' }} />
      )}

      <div style={{ position: 'absolute', left: 16, right: 16, top: labelTop, bottom: labelBottom, textAlign: 'center', pointerEvents: 'none' }}>
        <span className="inline-block rounded-xl border border-white/35 bg-black/85 px-4 py-2.5 text-[15px] text-white/95 leading-snug" style={{ maxWidth: 360 }}>
          {stop.text}
        </span>
        <div className="mt-2 text-[12px] text-white/60 tracking-wide">
          {step + 1 < STOPS.length ? `Tap to continue · ${step + 1} of ${STOPS.length}` : 'Tap to start'}
        </div>
      </div>
    </div>,
    document.body,
  );
}
