import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Bike, Check, Dumbbell, Footprints, Heart, Link2, User, Waves, Watch, Wrench } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { StepLayout } from '@/components/wizard/StepLayout';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { NumberRow } from '@/components/ui/number-row';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { HOME_GYM_EQUIPMENT_OPTIONS, SWIM_EQUIPMENT_OPTIONS } from '@/components/TrainingBaselines';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';
import { normalizeDiscipline, type Discipline } from '@/lib/discipline';
import { getDisciplineColor } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';

/**
 * The sign-up intake (2026-09-07). Two screens after the account, Next at the bottom of each, then
 * Home. Nobody is dropped into a plan: the plan is picked from the Focus screen when they want it.
 *
 *   1  About you              the Profile plate's own rows (name, birthday, height, weight, units)
 *                             and the connect rows (Strava, Garmin, Apple Health on iOS). Next skips
 *                             the connections.
 *   2  Your sports and gear   sport cards lit like the tab bar · where they lift and what they own ·
 *                             swim gear
 *
 * One plate per screen, the same forge plate Profile and Adjust use, so the first thing a new athlete
 * touches is the thing they will keep touching. Every field written here is the same field Profile
 * edits, through the same save. Progress lives in localStorage (`efforts:intake_step`) so the Strava
 * and Garmin round trips through their callback routes come back here; both open in THIS tab.
 */

const STEP_KEY = 'efforts:intake_step';
type Step = 1 | 2;
const TOTAL = 2;

// ⛔ The four canonical discipline ids (src/lib/discipline.ts `normalizeDiscipline`).
const SPORTS: Array<{ id: Discipline; label: string; Icon: React.ComponentType<any>; colourKey: string }> = [
  { id: 'run', label: 'Run', Icon: Footprints, colourKey: 'run' },
  { id: 'ride', label: 'Ride', Icon: Bike, colourKey: 'bike' },
  { id: 'strength', label: 'Lift', Icon: Dumbbell, colourKey: 'strength' },
  { id: 'swim', label: 'Swim', Icon: Waves, colourKey: 'swim' },
];

const readStep = (): Step => {
  try { return Number(localStorage.getItem(STEP_KEY)) === 2 ? 2 : 1; } catch { return 1; }
};
const writeStep = (s: Step) => { try { localStorage.setItem(STEP_KEY, String(s)); } catch { /* device copy only */ } };

const calculateAge = (birthday: string | undefined): number | null => {
  if (!birthday) return null;
  const b = new Date(birthday);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
};
const fmtBirthday = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Profile's section head, verbatim in shape. */
const SectionHead = ({ Icon, label, colour }: { Icon: React.ComponentType<any>; label: string; colour: string }) => (
  <div className="flex items-center gap-2 mb-2">
    <Icon size={15} strokeWidth={2.25} style={{ color: colour }} className="shrink-0" aria-hidden="true" />
    <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: colour }}>{label}</span>
  </div>
);

const plateClass = 'galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { loadUserBaselines, saveUserBaselines } = useAppContext();

  const [step, setStep] = useState<Step>(readStep);
  const [saving, setSaving] = useState(false);

  // Screen 1
  const [name, setName] = useState<string | null>(null);
  const [birthday, setBirthday] = useState<string | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [units, setUnits] = useState<'imperial' | 'metric'>('imperial');
  const metric = units === 'metric';
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

  useEffect(() => {
    if (!getStoredUserId()) navigate('/', { replace: true });
  }, [navigate]);

  // Pre-fill from the account, so nothing already answered is asked again.
  useEffect(() => {
    let cancelled = false;
    void loadUserBaselines?.().then((b: any) => {
      if (cancelled || !b) return;
      if (b.profile?.name) setName(String(b.profile.name));
      if (b.birthday) setBirthday(String(b.birthday).slice(0, 10));
      if (b.height) setHeight(Number(b.height));
      if (b.weight) setWeight(Number(b.weight));
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

  const aboutYouPatch = (b: any) => ({
    ...b,
    units,
    ...(birthday ? { birthday } : {}),
    ...(height ? { height } : {}),
    ...(weight ? { weight } : {}),
    profile: { ...(b.profile ?? {}), ...(name ? { name } : {}) },
  });

  // ── Screen 1 ─────────────────────────────────────────────────────────────────────────────
  const finishAboutYou = async () => {
    setSaving(true);
    try { await persist(aboutYouPatch); go(2); } finally { setSaving(false); }
  };

  /** Save what is answered before leaving the tab for Strava or Garmin. */
  const saveBeforeLeaving = async () => {
    try { await persist(aboutYouPatch); } catch { /* keep going */ }
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

  // ── Screen 2 ─────────────────────────────────────────────────────────────────────────────
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

  // ── pieces ───────────────────────────────────────────────────────────────────────────────
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

  /** Two-way segmented strip sharing one border (the Profile units control). */
  const segmented = <T extends string,>(options: Array<{ v: T; label: string }>, value: T | null, onPick: (v: T) => void) => (
    <span className="inline-flex shrink-0 rounded-xl border border-white/15 overflow-hidden" role="group">
      {options.map((o, i) => {
        const on = value === o.v;
        return (
          <button key={o.v} type="button" aria-pressed={on} onClick={() => onPick(o.v)}
            className={`px-3 py-1 text-[13px] ${i > 0 ? 'border-l border-white/15' : ''} ${on ? 'text-white bg-white/[0.12]' : 'text-white/50 bg-white/[0.03]'}`}>
            {o.label}
          </button>
        );
      })}
    </span>
  );

  /** A connect row: mark on the left, name and one line, Connected or a chevron on the right. */
  /** A bordered pill, the height of the Strava button, so the two read as a pair. */
  const connectRow = (key: string, mark: React.ReactNode, title: string, line: string, on: boolean, onTap: () => void) => (
    <button key={key} type="button" onClick={() => { if (!on) onTap(); }} aria-pressed={on}
      className={`w-full text-left flex items-center gap-3 px-4 h-11 rounded-xl border ${on ? 'border-white/40 bg-white/[0.10]' : 'border-white/25 bg-white/[0.08]'}`}>
      <span className="shrink-0 flex items-center">{mark}</span>
      <span className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="text-[15px] text-white">{title}</span>
        <span className="hidden sm:inline text-[12px] text-white/50 truncate">{line}</span>
      </span>
      {on ? (
        <span className="flex items-center gap-1 text-[13px] text-white/75"><Check className="h-4 w-4" /> Connected</span>
      ) : (
        <span className="text-white/60 text-lg leading-none">›</span>
      )}
    </button>
  );

  /** A sport card lit from the top like the tab bar: lamp and border take the sport's colour. */
  const sportCard = ({ id, label, Icon, colourKey }: (typeof SPORTS)[number]) => {
    const active = sports.has(id);
    const colour = getDisciplineColor(colourKey);
    return (
      <button key={id} type="button" onClick={() => toggleSport(id)} aria-pressed={active}
        className="relative flex flex-col items-center justify-center gap-1.5 py-5 rounded-xl border-2 transition-colors"
        style={active
          ? { borderColor: `${colour}cc`, background: `linear-gradient(180deg, ${colour}33 0%, rgba(255,255,255,0.05) 60%)`, color: '#fff' }
          : { borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)' }}>
        <span aria-hidden="true" style={{
          position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 10, height: 2, borderRadius: 999,
          background: colour, opacity: active ? 1 : 0, boxShadow: `0 0 10px ${colour}aa, 0 0 18px ${colour}66`, transition: 'opacity 200ms ease',
        }} />
        <Icon className="h-6 w-6" style={{ color: colour, opacity: active ? 1 : 0.7 }} />
        <span className="text-[14px] tracking-wide">{label}</span>
      </button>
    );
  };

  return (
    <div className="mobile-app-container">
      <MobileHeader />
      <main className="mobile-main-content">
        {step === 1 && (
          <StepLayout step={1} totalSteps={TOTAL} title="About you" onContinue={() => void finishAboutYou()} canContinue continueLabel="Next" saving={saving}>
            <div className={plateClass} style={readoutPlateStyle(undefined, { galaxy: true })}>
              <div className="px-3 py-3">
                <SectionHead Icon={User} label="You" colour="rgba(255,255,255,0.7)" />
                <NumberRow id="name" name="Name" inputType="text" value={name} seed={name ?? ''} onSave={(t) => setName(t.trim() || null)} />
                <NumberRow id="birthday" name="Birthday" inputType="date" value={birthday ? `${fmtBirthday(birthday)}${calculateAge(birthday) != null ? ` · ${calculateAge(birthday)} yrs` : ''}` : null} seed={birthday ?? ''} onSave={(t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) setBirthday(t); }} />
                <NumberRow id="units" name="Units" value={null} right={segmented<'imperial' | 'metric'>([{ v: 'imperial', label: 'lb · mi' }, { v: 'metric', label: 'kg · km' }], units, setUnits)} />
                <NumberRow id="height" name="Height" hint={metric ? 'cm' : 'in'} inputMode="numeric" value={height ? `${height} ${metric ? 'cm' : 'in'}` : null} seed={height ? String(height) : ''} onSave={(t) => { const v = parseInt(t); if (Number.isFinite(v) && v > 0) setHeight(v); }} />
                <NumberRow id="weight" name="Weight" hint={metric ? 'kg' : 'lb'} inputMode="numeric" value={weight ? `${weight} ${metric ? 'kg' : 'lb'}` : null} seed={weight ? String(weight) : ''} onSave={(t) => { const v = parseInt(t); if (Number.isFinite(v) && v > 0) setWeight(v); }} />
                <p className="mt-2 text-[12px] text-white/45">Tap a value to change it.</p>
              </div>

              <div className="px-3 py-3">
                <SectionHead Icon={Link2} label="Bring in your workouts" colour="rgba(255,255,255,0.7)" />
                <p className="m-0 mb-1 text-[12px] text-white/55 leading-snug">Your last 90 days come in, so the plan starts from your own sessions. Also on Connections, any time.</p>
                <div className="mt-2 space-y-2">
                  {stravaOn
                    ? connectRow('strava', <span className="text-[#FC4C02] font-bold text-[11px] tracking-wide">STRAVA</span>, 'Strava', 'Activities arrive as you finish them.', true, () => {})
                    : (
                      <button type="button" onClick={() => void startStrava()} className="block hover:opacity-90 transition-opacity bg-transparent border-none p-0">
                        <img src="/icons/strava-connect.svg" alt="Connect with Strava" className="h-11" />
                      </button>
                    )}
                  {connectRow('garmin', <Watch className="h-5 w-5" style={{ color: '#00A0DE' }} />, 'Garmin Connect', 'Rides and runs arrive as you finish them.', garminOn, () => void startGarmin())}
                  {isNativeIOS && healthKit && connectRow('health', <Heart className="h-5 w-5" style={{ color: '#FF2D55' }} />, 'Apple Health', 'Workouts from your watch and phone.', healthOn, () => void startAppleHealth())}
                </div>
                {connectNote && <p className="m-0 mt-2 text-[12px] text-white/60">{connectNote}</p>}
              </div>
            </div>
          </StepLayout>
        )}

        {step === 2 && (
          <StepLayout step={2} totalSteps={TOTAL} title="Your sports and gear" onBack={() => go(1)} onContinue={() => void finish()} canContinue={canFinish} continueLabel="Next" saving={saving} blockedReason={blocked}>
            <div className={plateClass} style={readoutPlateStyle(undefined, { galaxy: true })}>
              <div className="px-3 py-3">
                <SectionHead Icon={Footprints} label="Sports you do" colour="rgba(255,255,255,0.7)" />
                <div className="grid grid-cols-2 gap-2">{SPORTS.map(sportCard)}</div>
              </div>

              {sports.has('strength') && (
                <div className="px-3 py-3">
                  <SectionHead Icon={Wrench} label="Where you lift" colour={getDisciplineColor('strength')} />
                  {segmented<'commercial' | 'home'>([{ v: 'commercial', label: 'Commercial gym' }, { v: 'home', label: 'Home gym' }], gym, setGym)}
                  {gym === 'home' && (
                    <>
                      <p className="m-0 mt-2 text-[12px] text-white/55">Tap what you own.</p>
                      {chips(HOME_GYM_EQUIPMENT_OPTIONS, gear, toggleGear, getDisciplineColor('strength'))}
                    </>
                  )}
                  {gym === 'commercial' && <p className="m-0 mt-2 text-[12px] text-white/55">A commercial gym has everything the plan asks for.</p>}
                </div>
              )}

              {sports.has('swim') && (
                <div className="px-3 py-3">
                  <SectionHead Icon={Wrench} label="Swim gear" colour={getDisciplineColor('swim')} />
                  {chips(SWIM_EQUIPMENT_OPTIONS, swimGear, toggleSwimGear, getDisciplineColor('swim'))}
                </div>
              )}
            </div>
          </StepLayout>
        )}
      </main>
    </div>
  );
}
