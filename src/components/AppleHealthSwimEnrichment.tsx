// Layer 3 Tier A — platform-split swim enrichment surface. Renders in the swim Performance area and
// the Connections/Apple-Health spot. Native iOS → the "Connect Apple Health" toggle (off by default,
// gates the HealthKit swim sync). Everyone else (PWA / browser / Android) → a contextual note that
// the richer swim data is in the iOS app, with a config-driven download link. Contextual, not a nag.

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { requestHealthKitAuthorization, syncSwimsFromHealthKit } from '@/services/healthkit';
import { IOS_APP_DOWNLOAD_URL, IOS_APP_IS_PUBLIC } from '@/config/app-links';

const SYNC_FLAG = 'healthkit_swim_sync_enabled';
const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export default function AppleHealthSwimEnrichment(
  { source, hasRichData }: { source?: string | null; hasRichData?: boolean } = {},
) {
  // D-160: don't nudge "pull richer swim data" for a swim that ALREADY came through HealthKit — either
  // ingested directly (source = 'healthkit') or merged from a FORM→Strava + HealthKit pair, in which
  // case the kept row stays source = 'strava' but carries the HealthKit-supplied pool_length (the merge
  // only fills rich fields — ingest-activity mergeSameSwimIfExists). hasRichData covers that case. Gate
  // both branches (native toggle AND the get-the-app note) — there's nothing richer to offer.
  if (source === 'healthkit' || hasRichData) return null;

  // ── PWA / browser / Android: get-the-app note (where the richer data would be) ──
  if (!isNativeIOS()) {
    return (
      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/70">
        <span className="text-white/90">Richer swim data</span> — real pool length, SWOLF, stroke
        metrics — is available in the iOS app.{' '}
        <a href={IOS_APP_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
          {IOS_APP_IS_PUBLIC ? 'Download on the App Store' : 'Join the iOS beta'}
        </a>
      </div>
    );
  }
  // ── Native iOS: the actual Connect Apple Health toggle (off by default) ──
  return <ConnectAppleHealthToggle />;
}

function ConnectAppleHealthToggle() {
  const [enabled, setEnabled] = useState<boolean>(() => localStorage.getItem(SYNC_FLAG) === '1');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onToggle = async () => {
    if (enabled) {
      localStorage.removeItem(SYNC_FLAG);
      setEnabled(false);
      setStatus(null);
      return;
    }
    setBusy(true);
    setStatus('Requesting Apple Health access…');
    try {
      const authorized = await requestHealthKitAuthorization();
      if (!authorized) { setStatus('Apple Health access not granted.'); setBusy(false); return; }
      const userId = getStoredUserId();
      if (!userId) { setStatus('Not signed in.'); setBusy(false); return; }
      const { synced } = await syncSwimsFromHealthKit(
        (body) => supabase.functions.invoke('ingest-activity', { body }),
        userId,
      );
      localStorage.setItem(SYNC_FLAG, '1');
      setEnabled(true);
      setStatus(synced > 0 ? `Synced ${synced} swim${synced === 1 ? '' : 's'} from Apple Health.` : 'Connected — new swims will pull richer data.');
    } catch (e: any) {
      setStatus(`Couldn’t connect: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] text-white/80">
          <div className="text-white/90 font-medium">Connect Apple Health</div>
          <div className="text-white/55 text-[11px]">Pull richer swim data (real pool length, strokes, HR) when available.</div>
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium ${enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/80'} disabled:opacity-50`}
        >
          {busy ? '…' : enabled ? 'Connected' : 'Connect'}
        </button>
      </div>
      {status && <div className="mt-1.5 text-[11px] text-white/50">{status}</div>}
    </div>
  );
}
