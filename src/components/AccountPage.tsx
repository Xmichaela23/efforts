// Account — its own screen (Michael, 2026-09-06: "should account have its own slot in the hamburger
// menu? is profile busy?"). Profile keeps who you are and your training numbers; the rare, careful
// actions (password, sign-in address, sign out, delete) live here, the way Strava and Garmin keep an
// Account page apart from the profile. The plate itself is unchanged (src/components/AccountPlate.tsx).
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { AccountPlate } from '@/components/AccountPlate';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { supabase, getStoredAuthUser } from '@/lib/supabase';

export default function AccountPage({ onSignOut }: { onSignOut?: () => void | Promise<void> }) {
  const navigate = useNavigate();
  const [authEmail, setAuthEmail] = useState<string>(() => getStoredAuthUser()?.email ?? '');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data: u }) => {
      if (cancelled) return;
      if (u?.user?.email) setAuthEmail(u.user.email);
      const ne = (u?.user as { new_email?: string | null } | undefined)?.new_email ?? null;
      setPendingEmail(ne && ne !== u?.user?.email ? ne : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const signOut = async () => {
    if (onSignOut) await onSignOut(); else await supabase.auth.signOut();
    // The sign-in screen should not sit on /account, or the next sign-in lands here.
    try { navigate('/', { replace: true }); } catch { /* fine */ }
  };
  return (
    <div className="max-w-2xl mx-auto px-4 pb-6">
      <h2 className="text-2xl font-bold text-white pb-2">Account</h2>
      <div className="text-center mb-6">
        <p className="text-white/50 text-sm">Your sign-in, your password, and the way out.</p>
      </div>
      <div className="galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
        <AccountPlate
          header={(
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={15} strokeWidth={2.25} style={{ color: 'rgba(255,255,255,0.7)' }} className="shrink-0" aria-hidden="true" />
              <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: 'rgba(255,255,255,0.7)' }}>Account</span>
            </div>
          )}
          email={authEmail}
          pendingEmail={pendingEmail}
          onPendingEmail={setPendingEmail}
          onSignOut={signOut}
        />
      </div>
    </div>
  );
}
