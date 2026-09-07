import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { MobileHeader } from '@/components/MobileHeader';
import { StepLayout } from '@/components/wizard/StepLayout';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { HOME_GYM_EQUIPMENT_OPTIONS } from '@/components/TrainingBaselines';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';

/**
 * The sign-up intake (2026-09-07). Three screens after the account, Next at the bottom of each, then
 * Home. Nobody is dropped into a plan: the plan is picked from the Focus screen when they want it.
 *
 *   1  About you              name · miles or kilometres
 *   2  Bring in your workouts Apple Health (iOS only) · Strava · Garmin · Not now
 *   3  Your sports and gear   the sports they do · commercial gym or what they own
 *
 * Progress lives in localStorage (`efforts:intake_step`) so the Strava round trip through
 * /strava/callback comes back to the right screen. Finishing clears it and stamps
 * `user_baselines.ui_prefs.intake_done`. Every field written here is the same field Profile edits,
 * through the same save, so nothing is asked twice and nothing lives in two places.
 *
 * The Strava and Garmin starts are the same calls Connections makes; they are short and copied
 * rather than lifted out of a 1,300-line screen mid-session. If Connections' redirect, scope or
 * exchange changes, change it here too.
 */

const STEP_KEY = 'efforts:intake_step';
type Step = 1 | 2 | 3;
const TOTAL = 3;

const SPORTS: Array<{ id: string; label: string }> = [
  { id: 'running', label: 'Run' },
  { id: 'cycling', label: 'Ride' },
  { id: 'strength', label: 'Lift' },
  { id: 'swimming', label: 'Swim' },
];

const readStep = (): Step => {
  try {
    const v = Number(localStorage.getItem(STEP_KEY));
    return v === 2 || v === 3 ? v : 1;
  } catch { return 1; }
};
const writeStep = (s: Step) => { try { localStorage.setItem(STEP_KEY, String(s)); } catch { /* device copy only */ } };

const chip = (on: boolean) =>
  `rounded-xl border px-3 py-2 text-sm text-left ${on ? 'border-white/60 bg-white/[0.12] text-white' : 'border-white/20 bg-white/[0.04] text-white/75'}`;
const door = 'w-full text-left rounded-xl border border-white/25 bg-white/[0.08] px-4 py-3 text-white/90 text-sm';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { loadUserBaselines, saveUserBaselines } = useAppContext();

  const [step, setStep] = useState<Step>(readStep);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [units, setUnits] = useState<'imperial' | 'metric' | null>(null);

  // Step 2
  const [isNativeIOS, setIsNativeIOS] = useState(false);
  const [healthKit, setHealthKit] = useState(false);
  const [connectNote, setConnectNote] = useState<string | null>(null);

  // Step 3
  const [sports, setSports] = useState<Set<string>>(new Set());
  const [gym, setGym] = useState<'commercial' | 'home' | null>(null);
  const [gear, setGear] = useState<Set<string>>(new Set());

  // No session, no intake.
  useEffect(() => {
    if (!getStoredUserId()) navigate('/', { replace: true });
  }, [navigate]);

  // Pre-fill from whatever is already on the account (a returning athlete, or a Strava round trip).
  useEffect(() => {
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      if (b.profile?.name) setName(String(b.profile.name));
      if (b.units === 'metric' || b.units === 'imperial') setUnits(b.units);
      if (Array.isArray(b.disciplines) && b.disciplines.length) setSports(new Set(b.disciplines));
      const st: string[] = Array.isArray(b.equipment?.strength) ? b.equipment.strength : [];
      if (st.includes('Commercial gym')) setGym('commercial');
      else if (st.length) { setGym('home'); setGear(new Set(st)); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadUserBaselines]);

  useEffect(() => {
    const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    setIsNativeIOS(native);
    if (native) void isHealthKitAvailable().then((ok) => setHealthKit(Boolean(ok))).catch(() => setHealthKit(false));
  }, []);

  const go = (s: Step) => { writeStep(s); setStep(s); };

  /** The same save Profile uses, over whatever is already on the row. */
  const persist = useCallback(async (patch: (b: any) => any) => {
    const current = (await loadUserBaselines?.()) ?? {
      disciplines: [], performanceNumbers: {}, equipment: {}, units: 'imperial',
      disciplineFitness: {}, benchmarks: {}, injuryHistory: '', injuryRegions: [], trainingBackground: '',
    };
    await saveUserBaselines?.(patch(current));
  }, [loadUserBaselines, saveUserBaselines]);

  // ── Step 1 ────────────────────────────────────────────────────────────────────────────────
  const finishAboutYou = async () => {
    if (!units) return;
    setSaving(true);
    try {
      await persist((b) => ({ ...b, units, profile: { ...(b.profile ?? {}), ...(name.trim() ? { name: name.trim() } : {}) } }));
      go(2);
    } finally { setSaving(false); }
  };

  // ── Step 2 ────────────────────────────────────────────────────────────────────────────────
  const startStrava = () => {
    writeStep(3); // the callback reads this and comes back to /welcome on screen 3
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = 'https://efforts.work/strava/callback';
    const scope = 'read,activity:read_all,activity:write,profile:read_all';
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  };

  const generatePKCE = async () => {
    const codeVerifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return { codeVerifier, codeChallenge };
  };

  const startGarmin = async () => {
    setConnectNote('Opening Garmin…');
    try {
      const { codeVerifier, codeChallenge } = await generatePKCE();
      sessionStorage.setItem('garmin_code_verifier', codeVerifier);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        redirect_uri: 'https://efforts.work/auth/garmin/callback',
        state: Math.random().toString(36).substring(2, 15),
      });
      const popup = window.open(`https://connect.garmin.com/oauth2Confirm?${params.toString()}`, 'garmin-auth', 'width=600,height=600');
      if (!popup) {
        setConnectNote('The Garmin window was blocked. Allow pop-ups for this site and try again.');
        sessionStorage.removeItem('garmin_code_verifier');
      }
    } catch (e) {
      setConnectNote(`Could not open Garmin: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  // The Garmin popup posts its code back to this window (GarminCallback), same as Connections.
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'garmin-oauth-error') { setConnectNote(`Garmin: ${event.data.error}`); return; }
      if (event.data?.type !== 'garmin-oauth-success' || !event.data.code) return;
      try {
        const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
        if (!codeVerifier) throw new Error('code verifier missing');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('not signed in');
        setConnectNote('Connecting to Garmin…');
        const r = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/bright-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ code: event.data.code, codeVerifier, redirectUri: 'https://efforts.work/auth/garmin/callback' }),
        });
        if (!r.ok) throw new Error(`token exchange failed (${r.status})`);
        const tokenData = await r.json();
        localStorage.setItem('garmin_access_token', tokenData.access_token);
        sessionStorage.removeItem('garmin_code_verifier');
        // Ask for the last 90 days; Garmin sends them to the webhook over the next few minutes.
        await supabase.functions.invoke('import-garmin-history', { body: { token: tokenData.access_token, days: 90 } });
        setConnectNote('Connected to Garmin. Your last 90 days arrive over the next few minutes.');
        go(3);
      } catch (e) {
        setConnectNote(`Garmin: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const startAppleHealth = async () => {
    try {
      const ok = await requestHealthKitAuthorization();
      localStorage.setItem('healthKitAuthorized', ok ? 'true' : 'false');
      if (ok) { setConnectNote('Apple Health connected.'); go(3); }
      else setConnectNote('Health access was not allowed. Settings › Privacy › Health turns it on.');
    } catch {
      setConnectNote('Could not connect to Apple Health.');
    }
  };

  // ── Step 3 ────────────────────────────────────────────────────────────────────────────────
  const toggleSport = (id: string) => setSports((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGear = (g: string) => setGear((prev) => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const gearAnswered = gym === 'commercial' || (gym === 'home' && gear.size > 0) || !sports.has('strength');
  const canFinish = sports.size > 0 && gearAnswered;

  const finish = async () => {
    if (!canFinish) return;
    setSaving(true);
    try {
      const strength = !sports.has('strength') ? [] : gym === 'commercial' ? ['Commercial gym'] : Array.from(gear);
      await persist((b) => ({ ...b, disciplines: Array.from(sports), equipment: { ...(b.equipment ?? {}), strength } }));
      const uid = getStoredUserId();
      if (uid) {
        const { data } = await supabase.from('user_baselines').select('ui_prefs').eq('user_id', uid).maybeSingle();
        const prefs = (data?.ui_prefs && typeof data.ui_prefs === 'object') ? (data.ui_prefs as Record<string, unknown>) : {};
        await supabase.from('user_baselines').update({ ui_prefs: { ...prefs, intake_done: true } }).eq('user_id', uid);
      }
      try { localStorage.removeItem(STEP_KEY); } catch { /* device copy only */ }
      navigate('/', { replace: true });
    } finally { setSaving(false); }
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader />
      <main className="mobile-main-content">
        {step === 1 && (
          <StepLayout step={1} totalSteps={TOTAL} title="About you" onContinue={() => void finishAboutYou()} canContinue={Boolean(units)} continueLabel="Next" saving={saving} blockedReason="Miles or kilometres.">
            <label className="block">
              <span className="text-white/55 text-sm">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What we call you"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/[0.04] px-3 py-2 text-white placeholder:text-white/30"
              />
            </label>
            <div>
              <span className="text-white/55 text-sm">Distances in</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setUnits('imperial')} className={chip(units === 'imperial')}>Miles</button>
                <button type="button" onClick={() => setUnits('metric')} className={chip(units === 'metric')}>Kilometres</button>
              </div>
            </div>
          </StepLayout>
        )}

        {step === 2 && (
          <StepLayout step={2} totalSteps={TOTAL} title="Bring in your workouts" subtitle="Your last 90 days come in, so the numbers come from your own sessions." onBack={() => go(1)} onContinue={() => go(3)} canContinue hideContinue>
            <div className="flex flex-col gap-2">
              {isNativeIOS && healthKit && (
                <button type="button" onClick={() => void startAppleHealth()} className={door}>Apple Health ›</button>
              )}
              <button type="button" onClick={startStrava} className="inline-block self-start">
                <img src="/icons/strava-connect.svg" alt="Connect with Strava" className="h-12" />
              </button>
              <button type="button" onClick={() => void startGarmin()} className={door}>Garmin Connect ›</button>
              {connectNote && <p className="m-0 mt-1 text-white/60 text-sm">{connectNote}</p>}
              <button type="button" onClick={() => go(3)} className="mt-4 text-left text-white/45 text-sm">Not now</button>
            </div>
          </StepLayout>
        )}

        {step === 3 && (
          <StepLayout step={3} totalSteps={TOTAL} title="Your sports and gear" onBack={() => go(2)} onContinue={() => void finish()} canContinue={canFinish} continueLabel="Next" saving={saving} blockedReason={sports.size === 0 ? 'Tap the sports you do.' : 'Commercial gym, or what you own.'}>
            <div>
              <span className="text-white/55 text-sm">Sports you do</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {SPORTS.map((sp) => (
                  <button key={sp.id} type="button" onClick={() => toggleSport(sp.id)} className={chip(sports.has(sp.id))}>{sp.label}</button>
                ))}
              </div>
            </div>
            {sports.has('strength') && (
              <div>
                <span className="text-white/55 text-sm">Where you lift</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setGym('commercial')} className={chip(gym === 'commercial')}>Commercial gym</button>
                  <button type="button" onClick={() => setGym('home')} className={chip(gym === 'home')}>Home gym</button>
                </div>
                {gym === 'home' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HOME_GYM_EQUIPMENT_OPTIONS.map((g) => (
                      <button key={g} type="button" onClick={() => toggleGear(g)} className={chip(gear.has(g))}>{g}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </StepLayout>
        )}
      </main>
    </div>
  );
}
