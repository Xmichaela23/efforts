/**
 * /reset-password — the web page the reset email opens (docs/WORKORDER-account-2026-09-06.md §2).
 *
 * The supabase client is built with detectSessionInUrl=false (src/lib/supabase.ts, an iOS/WKWebView
 * guard), so this page reads the recovery token from the URL itself:
 *   - implicit flow (the project default): `#access_token=…&refresh_token=…&type=recovery` → setSession
 *   - PKCE, if the project is ever switched: `?code=…` → exchangeCodeForSession
 *   - stale / used link: `#error=access_denied&error_code=otp_expired…` → the expired line
 * After the password is set the page signs out locally so the browser holds no session; the athlete
 * opens efforts and signs in.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AuthScreenLayout } from '@/components/AuthScreenLayout';
import { EffortsWordmark } from '@/components/EffortsButton';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { PASSWORD_MIN } from '@/components/AccountPlate';

const AUTH_DISCIPLINES = ['run', 'strength', 'ride', 'pilates', 'swim'] as const;

const fieldClass =
  'mt-1 w-full rounded-xl border border-white/15 bg-zinc-900/70 px-3 py-2 text-[16px] text-white placeholder:text-zinc-500 focus:border-amber-400/55 focus:outline-none';

type Stage = 'checking' | 'form' | 'done' | 'expired';

function parseHash(): Record<string, string> {
  const raw = window.location.hash.replace(/^#/, '');
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

export default function ResetPassword() {
  const [stage, setStage] = useState<Stage>('checking');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = parseHash();
      const query = new URLSearchParams(window.location.search);
      try {
        if (hash.error || query.get('error')) { setStage('expired'); return; }
        if (hash.access_token && hash.refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token: hash.access_token, refresh_token: hash.refresh_token });
          if (cancelled) return;
          if (error) { setStage('expired'); return; }
          // Drop the token from the address bar so a screenshot or history entry does not carry it.
          window.history.replaceState(null, '', window.location.pathname);
          setStage('form');
          return;
        }
        const code = query.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (error) { setStage('expired'); return; }
          window.history.replaceState(null, '', window.location.pathname);
          setStage('form');
          return;
        }
        setStage('expired');
      } catch {
        if (!cancelled) setStage('expired');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < PASSWORD_MIN) { setLine(`At least ${PASSWORD_MIN} characters.`); return; }
    if (pw1 !== pw2) { setLine('The two entries differ.'); return; }
    setBusy(true); setLine(null);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setBusy(false);
      // A session that could not be used to set a password is a spent link.
      if (/session|expired|invalid|jwt/i.test(error.message)) setStage('expired');
      else setLine(error.message);
      return;
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setBusy(false);
    setStage('done');
  };

  return (
    <AuthScreenLayout>
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-zinc-950/75 px-8 py-10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex justify-center [&_svg]:drop-shadow-[0_0_28px_rgba(255,215,0,0.15)]">
            <EffortsWordmark size={52} className="scale-110" activeDisciplines={[...AUTH_DISCIPLINES]} />
          </div>
          {stage === 'form' && <p className="mt-5 text-sm text-zinc-400">Set a new password</p>}
        </div>

        {stage === 'checking' && <p className="text-center text-sm text-zinc-400">Loading…</p>}

        {stage === 'form' && (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm text-zinc-400">New password
              <input type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} className={fieldClass} placeholder={`${PASSWORD_MIN}+ characters`} required />
            </label>
            <label className="block text-sm text-zinc-400">Again
              <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={fieldClass} required />
            </label>
            {line && <p className="text-sm text-zinc-300">{line}</p>}
            <GalaxyButton type="submit" variant="primary" size="lg" fullWidth disabled={busy}>{busy ? 'Setting…' : 'Set password'}</GalaxyButton>
          </form>
        )}

        {stage === 'done' && <p className="text-center text-sm text-zinc-300">Password set. Open efforts and sign in.</p>}

        {stage === 'expired' && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-zinc-300">This link has expired. Request a new one from the sign-in screen.</p>
            <a href="/" className="text-sm font-semibold text-amber-400 hover:text-amber-300 hover:underline">Sign-in screen</a>
          </div>
        )}
      </div>
    </AuthScreenLayout>
  );
}
