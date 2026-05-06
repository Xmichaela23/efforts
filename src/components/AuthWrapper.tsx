import React, { useState, useEffect, useRef } from 'react';
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
const APPROVAL_MAX_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ApprovalOutcome = 'allowed' | 'denied';

/**
 * Load `users.approved` with retries. Only returns `denied` when the row exists and `approved === false`.
 * Missing row / transport failures → `null` (caller shows retry, not "pending approval").
 */
async function fetchApprovalOutcome(userId: string): Promise<ApprovalOutcome | null> {
  for (let attempt = 0; attempt < APPROVAL_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await withTimeout(
        supabase.from('users').select('approved').eq('id', userId).maybeSingle(),
        USERS_APPROVAL_TIMEOUT_MS
      );
      const err = (res as { error: { message?: string; code?: string } | null }).error;
      if (err) {
        if (attempt < APPROVAL_MAX_ATTEMPTS - 1) {
          await sleep(400 * (attempt + 1));
        }
        continue;
      }
      const data = (res as { data: { approved?: boolean | null } | null }).data;
      if (data == null) {
        if (attempt < APPROVAL_MAX_ATTEMPTS - 1) {
          await sleep(400 * (attempt + 1));
        }
        continue;
      }
      return data.approved === false ? 'denied' : 'allowed';
    } catch {
      if (attempt < APPROVAL_MAX_ATTEMPTS - 1) {
        await sleep(400 * (attempt + 1));
      }
    }
  }
  return null;
}

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [sessionResolving, setSessionResolving] = useState(true);
  /** When logged in: allowed | denied | error (error = could not verify, not "pending admin") */
  const [approval, setApproval] = useState<'allowed' | 'denied' | 'error' | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const checkGeneration = useRef(0);

  useEffect(() => {
    const runApprovalCheck = async (userId: string, gen: number) => {
      setApproval(null);
      const outcome = await fetchApprovalOutcome(userId);
      if (gen !== checkGeneration.current) return;
      if (outcome === null) {
        setApproval('error');
      } else {
        setApproval(outcome);
      }
    };

    const bootstrap = () => {
      const u = getStoredAuthUser();
      if (!u) {
        setUser(null);
        setApproval(null);
        setSessionResolving(false);
        return;
      }
      setUser(u);
      setSessionResolving(true);
      const gen = ++checkGeneration.current;
      void runApprovalCheck(u.id, gen).finally(() => {
        if (gen === checkGeneration.current) setSessionResolving(false);
      });
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      if (!next) {
        checkGeneration.current += 1;
        setApproval(null);
        setSessionResolving(false);
        return;
      }
      setSessionResolving(true);
      const gen = ++checkGeneration.current;
      void runApprovalCheck(next.id, gen).finally(() => {
        if (gen === checkGeneration.current) setSessionResolving(false);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    checkGeneration.current += 1;
    await supabase.auth.signOut();
    setUser(null);
    setApproval(null);
    setSessionResolving(false);
  };

  const retryApprovalCheck = () => {
    const u = user ?? getStoredAuthUser();
    if (!u?.id) return;
    setSessionResolving(true);
    const gen = ++checkGeneration.current;
    void (async () => {
      setApproval(null);
      const outcome = await fetchApprovalOutcome(u.id);
      if (gen !== checkGeneration.current) return;
      if (outcome === null) {
        setApproval('error');
      } else {
        setApproval(outcome);
      }
      setSessionResolving(false);
    })();
  };

  if (sessionResolving) {
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

  if (approval === 'denied') {
    return (
      <AuthScreenLayout>
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-zinc-950/75 px-8 py-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex justify-center [&_svg]:drop-shadow-[0_0_28px_rgba(255,255,255,0.15)]">
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

  if (approval === 'error' || approval === null) {
    return (
      <AuthScreenLayout>
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-zinc-950/75 px-8 py-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex justify-center [&_svg]:drop-shadow-[0_0_28px_rgba(255,255,255,0.15)]">
            <EffortsWordmark size={44} activeDisciplines={[...AUTH_DISCIPLINES]} />
          </div>
          <div className="text-lg font-medium text-white">Can&apos;t verify your account</div>
          <p className="text-sm text-zinc-400">
            We couldn&apos;t reach the server to confirm your access. This is usually a network blip — try again in a moment.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={retryApprovalCheck}
              className="rounded-xl bg-amber-500/90 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-semibold text-zinc-400 hover:text-zinc-300 hover:underline"
            >
              Log out
            </button>
          </div>
        </div>
      </AuthScreenLayout>
    );
  }

  return <AppLayout onLogout={handleLogout} />;
};

export default AuthWrapper;
