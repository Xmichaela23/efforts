import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Bike, Check, Dumbbell, Footprints, Heart, Waves, Watch } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { StepLayout } from '@/components/wizard/StepLayout';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { HOME_GYM_EQUIPMENT_OPTIONS, SWIM_EQUIPMENT_OPTIONS } from '@/components/TrainingBaselines';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';
import { normalizeDiscipline, type Discipline } from '@/lib/discipline';
import { getDisciplineColor } from '@/lib/context-utils';

/**
 * The sign-up intake (2026-09-07). Two screens after the account, Next at the bottom of each, then
 * Home. Nobody is dropped into a plan: the plan is picked from the Focus screen when they want it.
 *
 *   1  About you              name · miles or kilometres · bring in your workouts (Strava, Garmin,
 *                             Apple Health on iOS). Next skips the connections.
 *   2  Your sports and gear   the sports they do · where they lift and what they own · swim gear
 *
 * Progress lives in localStorage (`efforts:intake_step`) so the Strava and Garmin round trips through
 * their callback routes come back to the right screen; both open in THIS tab, no pop-up. Finishing
 * clears it and stamps `user_baselines.ui_prefs.intake_done`. Every field written here is the same
 * field Profile edits, through the same save, so nothing is asked twice and nothing lives in two places.
 *
 * Cards are drawn the way the Train screen draws its focus cards (NonRaceBuilder `optBtn`): a
 * bordered plate is a thing you can tap, the chosen one takes the accent, sport cards take their sport.
 */

const STEP_KEY = 'efforts:intake_step';
type Step = 1 | 2;
const TOTAL = 2;

// ⛔ The four canonical discipline ids (src/lib/discipline.ts `normalizeDiscipline`), the form every
// reader gates on. Profile still writes the long forms; readers normalise either, this writes canon.
const SPORTS: Array<{ id: Discipline; label: string; blurb: string; Icon: React.ComponentType<any>; colourKey: string }> = [
  { id: 'run', label: 'Run', blurb: 'Easy days, long days, the hard ones.', Icon: Footprints, colourKey: 'run' },
  { id: 'ride', label: 'Ride', blurb: 'Road, gravel, trainer.', Icon: Bike, colourKey: 'bike' },
  { id: 'strength', label: 'Lift', blurb: 'Barbell compounds, built around the rest.', Icon: Dumbbell, colourKey: 'strength' },
  { id: 'swim', label: 'Swim', blurb: 'Pool or open water.', Icon: Waves, colourKey: 'swim' },
];

const readStep = (): Step => {
  try { return Number(localStorage.getItem(STEP_KEY)) === 2 ? 2 : 1; } catch { return 1; }
};
const writeStep = (s: Step) => { try { localStorage.setItem(STEP_KEY, String(s)); } catch { /* device copy only */ } };

/** The Train screen's card. */
const card = (active: boolean) =>
  `w-full text-left p-4 rounded-xl border text-white transition-colors ${
    active ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)]' : 'border-white/12 bg-white/[0.03]'
  }`;
const field = 'mt-1 w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/40';
const label = 'block text-[13px] uppercase tracking-[0.12em] text-white/45';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { loadUserBaselines, saveUserBaselines } = useAppContext();

  const [step, setStep] = useState<Step>(readStep);
  const [saving, setSaving] = useState(false);

  // Screen 1
  const [name, setName] = useState('');
  const [units, setUnits] = useState<'imperial' | 'metric' | null>(null);
  const [isNativeIOS, setIsNativeIOS] = useState(false);
  const [healthKit, setHealthKit] = useState(false);
  const [stravaOn, setStravaOn] = useState(false);
  const [garminOn, setGarminOn] = useState(false);
  const [healthOn, setHealthOn] = useState(false);
  const [connectNote, setConnectNote] = useState<string | null>(null);

  // Screen 2
  const [sports, setSports] = useState<Set<string>>(new Set());
  const [gym, setGym] = useState<'commercial' | 'home' | null>(null);
  const [gear, setGear] = useState<Set<string>>(new Set());
  const [swimGear, setSwimGear] = useState<Set<string>>(new Set());

  // No session, no intake.
  useEffect(() => {
    if (!getStoredUserId()) navigate('/', { replace: true });
  }, [navigate]);

  // Pre-fill from whatever is already on the account (a round trip through Strava or Garmin, or a
  // returning athlete), so nothing they already answered is asked again.
  useEffect(() => {
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      if (b.profile?.name) setName(String(b.profile.name));
      if (b.units === 'metric' || b.units === 'imperial') setUnits(b.units);
      if (Array.isArray(b.disciplines) && b.disciplines.length) setSports(new Set(b.disciplines.map(normalizeDiscipline).filter(Boolean) as string[]));
      const st: string[] = Array.isArray(b.equipment?.strength) ? b.equipment.strength : [];
      if (st.includes('Commercial gym')) setGym('commercial');
      else if (st.length) { setGym('home'); setGear(new Set(st)); }
      const sw: string[] = Array.isArray(b.equipment?.swimming) ? b.equipment.swimming : [];
      if (sw.length) setSwimGear(new Set(sw));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [loadUserBaselines]);

  useEffect(() => {
    const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    setIsNativeIOS(native);
    if (native) void isHealthKitAvailable().then((ok) => setHealthKit(Boolean(ok))).catch(() => setHealthKit(false));
    try {
      setStravaOn(localStorage.getItem('strava_connected') === 'true');
      setGarminOn(Boolean(localStorage.getItem('garmin_access_token')));
      setHealthOn(localStorage.getItem('healthKitAuthorized') === 'true');
    } catch { /* no device copy */ }
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

  // ── Screen 1: about you + bring in your workouts ──────────────────────────────────────────
  const finishAboutYou = async () => {
    if (!units) return;
    setSaving(true);
    try {
      await persist((b) => ({ ...b, units, profile: { ...(b.profile ?? {}), ...(name.trim() ? { name: name.trim() } : {}) } }));
      go(2);
    } finally { setSaving(false); }
  };

  /** Save what is answered so far before leaving the tab for Strava or Garmin. */
  const saveBeforeLeaving = async () => {
    if (units) {
      try { await persist((b) => ({ ...b, units, profile: { ...(b.profile ?? {}), ...(name.trim() ? { name: name.trim() } : {}) } })); } catch { /* keep going */ }
    }
    writeStep(1);
  };

  const startStrava = async () => {
    await saveBeforeLeaving();
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

  // Same tab, no pop-up. GarminCallback stores the code and comes back here; the effect below trades it.
  const startGarmin = async () => {
    await saveBeforeLeaving();
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
    window.location.href = `https://connect.garmin.com/oauth2Confirm?${params.toString()}`;
  };

  useEffect(() => {
    const code = sessionStorage.getItem('garmin_auth_code');
    if (!code) return;
    sessionStorage.removeItem('garmin_auth_code');
    (async () => {
      try {
        const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
        if (!codeVerifier) throw new Error('the sign-in did not finish; try again');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('not signed in');
        setConnectNote('Connecting to Garmin…');
        const r = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/bright-service', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ code, codeVerifier, redirectUri: 'https://efforts.work/auth/garmin/callback' }),
        });
        if (!r.ok) throw new Error(`Garmin refused the sign-in (${r.status})`);
        const tokenData = await r.json();
        localStorage.setItem('garmin_access_token', tokenData.access_token);
        sessionStorage.removeItem('garmin_code_verifier');
        setGarminOn(true);
        // Ask for the last 90 days; Garmin sends them to the webhook over the next few minutes.
        await supabase.functions.invoke('import-garmin-history', { body: { token: tokenData.access_token, days: 90 } });
        setConnectNote('Garmin connected. Your last 90 days arrive over the next few minutes.');
      } catch (e) {
        setConnectNote(`Garmin: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    })();
  }, []);

  const startAppleHealth = async () => {
    try {
      const ok = await requestHealthKitAuthorization();
      localStorage.setItem('healthKitAuthorized', ok ? 'true' : 'false');
      setHealthOn(ok);
      setConnectNote(ok ? 'Apple Health connected.' : 'Health access was not allowed. Settings › Privacy › Health turns it on.');
    } catch {
      setConnectNote('Could not connect to Apple Health.');
    }
  };

  // ── Screen 2: sports and gear ─────────────────────────────────────────────────────────────
  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) =>
    set((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleSport = toggleIn(setSports);
  const toggleGear = toggleIn(setGear);
  const toggleSwimGear = toggleIn(setSwimGear);

  const liftAnswered = !sports.has('strength') || gym === 'commercial' || (gym === 'home' && gear.size > 0);
  const canFinish = sports.size > 0 && liftAnswered;
  const blocked = sports.size === 0 ? 'Tap the sports you do.' : 'Commercial gym, or what you own.';

  const finish = async () => {
    if (!canFinish) return;
    setSaving(true);
    try {
      const strength = !sports.has('strength') ? [] : gym === 'commercial' ? ['Commercial gym'] : Array.from(gear);
      const swimming = sports.has('swim') ? Array.from(swimGear) : [];
      await persist((b) => ({ ...b, disciplines: Array.from(sports), equipment: { ...(b.equipment ?? {}), strength, swimming } }));
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

  const chips = (options: string[], on: Set<string>, toggle: (v: string) => void, colour: string) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => {
        const active = on.has(o);
        return (
          <GalaxyButton key={o} shape="chip" variant={active ? 'primary' : 'secondary'} aria-pressed={active}
            className={active ? 'text-white' : 'text-white/55'}
            style={active ? { borderColor: `${colour}88`, background: `${colour}22` } : undefined}
            onClick={() => toggle(o)}>{o}</GalaxyButton>
        );
      })}
    </div>
  );

  const connectedMark = (
    <span className="ml-auto flex items-center gap-1 text-sm text-white/70"><Check className="h-4 w-4" /> Connected</span>
  );

  return (
    <div className="mobile-app-container">
      <MobileHeader />
      <main className="mobile-main-content">
        {step === 1 && (
          <StepLayout step={1} totalSteps={TOTAL} title="About you" onContinue={() => void finishAboutYou()} canContinue={Boolean(units)} continueLabel="Next" saving={saving} blockedReason="Miles or kilometres.">
            <label className="block">
              <span className={label}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What we call you" className={field} />
            </label>

            <div>
              <span className={label}>Distances in</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setUnits('imperial')} className={card(units === 'imperial')}>
                  <span className="block text-base">Miles</span>
                  <span className="block text-sm mt-0.5 text-white/55">and feet</span>
                </button>
                <button type="button" onClick={() => setUnits('metric')} className={card(units === 'metric')}>
                  <span className="block text-base">Kilometres</span>
                  <span className="block text-sm mt-0.5 text-white/55">and metres</span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <span className={label}>Bring in your workouts</span>
              <p className="m-0 mt-1 text-sm text-white/55 leading-relaxed">
                Your last 90 days come in, so the plan starts from your own sessions. You can do this later from Connections.
              </p>
              <div className="mt-3 space-y-2">
                {stravaOn ? (
                  <div className={card(true)}>
                    <span className="flex items-center gap-3.5">
                      <img src="/icons/strava-connect.svg" alt="Strava" className="h-8 opacity-80" />
                      {connectedMark}
                    </span>
                  </div>
                ) : (
                  <button type="button" onClick={() => void startStrava()} className="inline-block hover:opacity-90 transition-opacity">
                    <img src="/icons/strava-connect.svg" alt="Connect with Strava" className="h-12" />
                  </button>
                )}

                <button type="button" onClick={() => { if (!garminOn) void startGarmin(); }} className={card(garminOn)}>
                  <span className="flex items-center gap-3.5">
                    <Watch className="h-6 w-6 shrink-0" style={{ color: '#00A0DE' }} />
                    <span className="min-w-0 block">
                      <span className="block text-base">Garmin Connect</span>
                      <span className="block text-sm mt-0.5 text-white/60">Rides and runs arrive as you finish them.</span>
                    </span>
                    {garminOn ? connectedMark : null}
                  </span>
                </button>

                {isNativeIOS && healthKit && (
                  <button type="button" onClick={() => { if (!healthOn) void startAppleHealth(); }} className={card(healthOn)}>
                    <span className="flex items-center gap-3.5">
                      <Heart className="h-6 w-6 shrink-0" style={{ color: '#FF2D55' }} />
                      <span className="min-w-0 block">
                        <span className="block text-base">Apple Health</span>
                        <span className="block text-sm mt-0.5 text-white/60">Workouts from your watch and phone.</span>
                      </span>
                      {healthOn ? connectedMark : null}
                    </span>
                  </button>
                )}
                {connectNote && <p className="m-0 text-sm text-white/60">{connectNote}</p>}
              </div>
            </div>
          </StepLayout>
        )}

        {step === 2 && (
          <StepLayout step={2} totalSteps={TOTAL} title="Your sports and gear" onBack={() => go(1)} onContinue={() => void finish()} canContinue={canFinish} continueLabel="Next" saving={saving} blockedReason={blocked}>
            <div>
              <span className={label}>Sports you do</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {SPORTS.map(({ id, label: l, blurb, Icon, colourKey }) => {
                  const active = sports.has(id);
                  const colour = getDisciplineColor(colourKey);
                  return (
                    <button key={id} type="button" onClick={() => toggleSport(id)}
                      className={`text-left p-4 rounded-xl border text-white transition-colors ${active ? '' : 'border-white/12 bg-white/[0.03]'}`}
                      style={active ? { borderColor: `${colour}cc`, background: `${colour}1f` } : undefined}
                      aria-pressed={active}>
                      <Icon className="h-6 w-6" style={{ color: colour, opacity: active ? 1 : 0.7 }} />
                      <span className="block text-base mt-2">{l}</span>
                      <span className="block text-xs mt-0.5 text-white/55 leading-relaxed">{blurb}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {sports.has('strength') && (
              <div>
                <span className={label}>Where you lift</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setGym('commercial')} className={card(gym === 'commercial')}>
                    <span className="block text-base">Commercial gym</span>
                    <span className="block text-sm mt-0.5 text-white/55">Has everything.</span>
                  </button>
                  <button type="button" onClick={() => setGym('home')} className={card(gym === 'home')}>
                    <span className="block text-base">Home gym</span>
                    <span className="block text-sm mt-0.5 text-white/55">Tap what you own.</span>
                  </button>
                </div>
                {gym === 'home' && chips(HOME_GYM_EQUIPMENT_OPTIONS, gear, toggleGear, getDisciplineColor('strength'))}
              </div>
            )}

            {sports.has('swim') && (
              <div>
                <span className={label}>Swim gear</span>
                {chips(SWIM_EQUIPMENT_OPTIONS, swimGear, toggleSwimGear, getDisciplineColor('swim'))}
              </div>
            )}
          </StepLayout>
        )}
      </main>
    </div>
  );
}
