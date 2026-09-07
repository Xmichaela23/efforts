import React, { useState } from 'react';
import { ACCOUNT_DELETED_KEY } from '@/components/AccountPlate';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EffortsWordmark } from '@/components/EffortsButton';

/** Where the reset email lands (docs/WORKORDER-account-2026-09-06.md §1); must be in Supabase's Redirect URLs. */
export const RESET_PASSWORD_URL = 'https://efforts.work/reset-password';

/** One-time line left by the Account plate after a delete. */
function takeDeletedLine(): string | null {
  try {
    if (sessionStorage.getItem(ACCOUNT_DELETED_KEY) !== '1') return null;
    sessionStorage.removeItem(ACCOUNT_DELETED_KEY);
    return 'Your account is deleted.';
  } catch {
    return null;
  }
}

/** All discipline keys used by EffortsWordmark layers — full spectrum glow on auth. */
const AUTH_DISCIPLINES = ['run', 'strength', 'ride', 'pilates', 'swim'] as const;

const authInputClass =
  'mt-1 rounded-xl border-white/15 bg-zinc-900/70 text-white placeholder:text-zinc-500 focus:border-amber-400/55 focus:outline-none focus:ring-1 focus:ring-amber-400/25';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** 'signin' | 'forgot' (one email field) | 'sent' (the neutral line, whatever the server said). */
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent'>('signin');
  const [notice] = useState<string | null>(() => takeDeletedLine());

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Never confirm or deny that an address exists: the result is not shown, the same line is.
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_PASSWORD_URL });
    } catch (err) {
      console.error('Reset request error:', err);
    } finally {
      setLoading(false);
      setMode('sent');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setError(error.message);
      }
      // AuthWrapper will handle the redirect via onAuthStateChange
    } catch (error) {
      setError('An unexpected error occurred');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-zinc-950/75 px-8 py-10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl">
      <div className="flex flex-col items-center text-center">
        <div className="flex justify-center [&_svg]:drop-shadow-[0_0_28px_rgba(255,215,0,0.15)]">
          <EffortsWordmark
            size={52}
            className="scale-110"
            activeDisciplines={[...AUTH_DISCIPLINES]}
          />
        </div>
        <p className="mt-5 text-sm text-zinc-400">{mode === 'signin' ? 'Sign in to your account' : 'Reset your password'}</p>
        {notice && <p className="mt-3 text-sm text-zinc-300">{notice}</p>}
      </div>

      {mode === 'sent' ? (
        <div className="space-y-6 text-center">
          <p className="text-sm text-zinc-300">If that address has an account, a reset link is on its way.</p>
          <button type="button" onClick={() => setMode('signin')} className="text-sm font-semibold text-amber-400 hover:text-amber-300 hover:underline">
            Back to sign in
          </button>
        </div>
      ) : mode === 'forgot' ? (
        <form onSubmit={handleForgot} className="space-y-4">
          <div>
            <Label htmlFor="reset-email" className="text-zinc-400">
              Email
            </Label>
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className={authInputClass}
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border-0 bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-black shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)] hover:from-amber-400 hover:to-yellow-300"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </Button>
          <div className="text-center">
            <button type="button" onClick={() => setMode('signin')} className="text-sm font-semibold text-amber-400 hover:text-amber-300 hover:underline">
              Back to sign in
            </button>
          </div>
        </form>
      ) : (
      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div>
          <Label htmlFor="email" className="text-zinc-400">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className={authInputClass}
          />
        </div>

        <div>
          <Label htmlFor="password" className="text-zinc-400">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className={authInputClass}
          />
          <div className="mt-2 text-right">
            <button type="button" onClick={() => { setError(''); setMode('forgot'); }} className="text-sm text-zinc-400 hover:text-zinc-200 hover:underline">
              Forgot password?
            </button>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl border-0 bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-black shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)] hover:from-amber-400 hover:to-yellow-300"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      )}

      {mode === 'signin' && (
      <div className="text-center">
        <p className="text-sm text-zinc-500">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-semibold text-amber-400 hover:text-amber-300 hover:underline"
          >
            Create one
          </button>
        </p>
      </div>
      )}
    </div>
  );
};

export default LoginForm;