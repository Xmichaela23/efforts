import React, { useState, useEffect } from 'react';
import { getStoredAuthUser, supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AppLayout from './AppLayout';
import { AuthScreenLayout } from './AuthScreenLayout';
import { EffortsWordmark } from './EffortsButton';

const AUTH_DISCIPLINES = ['run', 'strength', 'ride', 'pilates', 'swim'] as const;

/** Ensures a promise cannot block forever; a stuck network call would otherwise prevent `try/finally` from ever reaching `finally` and the boot spinner would never clear. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('auth_approval_request_timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

const USERS_APPROVAL_TIMEOUT_MS = 12_000;

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    // Initial approval check on mount
    const fetchUserAndApproval = async () => {
      try {
        // Do not use supabase.auth.getUser() on boot — it can hang on iOS/WKWebView
        // (see lib/supabase.ts). Session is already in localStorage.
        const u = getStoredAuthUser();
        if (!u) {
          setUser(null);
          setLoading(false);
          return;
        }
        setUser(u);
        // Fetch approved flag from users table (bounded: an unsettled request blocks `finally` below)
        let data: { approved?: boolean } | null = null;
        let error: { message?: string } | null = null;
        try {
          const res = await withTimeout(
            supabase.from('users').select('approved').eq('id', u.id).single(),
            USERS_APPROVAL_TIMEOUT_MS
          );
          data = (res as { data: { approved?: boolean } | null }).data;
          error = (res as { error: { message?: string } | null }).error;
        } catch {
          error = { message: 'timeout_or_rejected' };
        }
        if (error) {
          setApproved(false);
        } else {
          setApproved(data?.approved ?? false);
        }
      } catch (err) {
        setApproved(false);
      } finally {
        setLoading(false);
      }
    };

    fetchUserAndApproval();

    // Listen for auth state changes (set user only)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setApproved(null);
  };

  if (loading) {
    return (
      <AuthScreenLayout>
        <p className="text-sm font-medium tracking-wide text-zinc-400">Loading…</p>
      </AuthScreenLayout>
    );
  }

  if (!user) {
    return (
      <AuthScreenLayout>
        {showRegister ? (
          <RegisterForm
            onSuccess={() => setShowRegister(false)}
            onSwitchToLogin={() => setShowRegister(false)}
          />
        ) : (
          <LoginForm onSwitchToRegister={() => setShowRegister(true)} />
        )}
      </AuthScreenLayout>
    );
  }

  if (user && approved === false) {
    return (
      <AuthScreenLayout>
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-zinc-950/75 px-8 py-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex justify-center [&_svg]:drop-shadow-[0_0_28px_rgba(255,215,0,0.15)]">
            <EffortsWordmark size={44} activeDisciplines={[...AUTH_DISCIPLINES]} />
          </div>
          <div className="text-lg font-medium text-white">You&apos;re almost in!</div>
          <p className="text-sm text-zinc-400">
            Your account is pending approval. We&apos;ll notify you as soon as it&apos;s ready.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-semibold text-amber-400 hover:text-amber-300 hover:underline"
          >
            Log out
          </button>
        </div>
      </AuthScreenLayout>
    );
  }

  return <AppLayout onLogout={handleLogout} />;
};

export default AuthWrapper;