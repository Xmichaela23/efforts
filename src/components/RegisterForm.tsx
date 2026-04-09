import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EffortsWordmark } from '@/components/EffortsButton';

const AUTH_DISCIPLINES = ['run', 'strength', 'ride', 'pilates', 'swim'] as const;

const authInputClass =
  'mt-1 rounded-xl border-white/15 bg-zinc-900/70 text-white placeholder:text-zinc-500 focus:border-amber-400/55 focus:outline-none focus:ring-1 focus:ring-amber-400/25';

interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        onSuccess();
      }
    } catch (error) {
      setError('An unexpected error occurred');
      console.error('Registration error:', error);
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
        <p className="mt-5 text-sm text-zinc-400">Create your account</p>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/25 p-3">
          <p className="text-sm text-amber-100/90">
            efforts is currently in development. By registering, you&apos;ll be notified when the app
            becomes available.
          </p>
        </div>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
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
            placeholder="Create a password (min 6 characters)"
            required
            className={authInputClass}
          />
        </div>

        <div>
          <Label htmlFor="confirmPassword" className="text-zinc-400">
            Confirm Password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
            className={authInputClass}
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl border-0 bg-gradient-to-r from-amber-500 to-yellow-400 font-semibold text-black shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)] hover:from-amber-400 hover:to-yellow-300"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-zinc-500">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-semibold text-amber-400 hover:text-amber-300 hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default RegisterForm;