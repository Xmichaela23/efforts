import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Check, Dumbbell, Heart, Link2, User, Watch, Wrench } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { StepLayout } from '@/components/wizard/StepLayout';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { NumberRow } from '@/components/ui/number-row';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { HOME_GYM_EQUIPMENT_OPTIONS } from '@/components/TrainingBaselines';
import { isHealthKitAvailable, requestHealthKitAuthorization } from '@/services/healthkit';
import { getDisciplineColor } from '@/lib/context-utils';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { numberWord } from '@/lib/number-word';
import { resolveCurrentRunThresholdPace } from '@/lib/resolve-current-run-pace';
import { resolveCurrentFtp } from '@/lib/resolve-current-ftp';

/**
 * The sign-up intake (2026-09-07). Two screens after the account, Next at the bottom of each, then
 * Home. Nobody is dropped into a plan: the plan is picked from the Focus screen when they want it.
 *
 *   1  About you              the Profile plate's own rows (name, birthday, height, weight, units)
 *   2  Your gym               commercial, or what they own. No sport question: the wizard asks which
 *                             sport goes in each row of the week, and the history says what they do.
 *   3  Your numbers           Connect Strava / Garmin once at the top (fills what it can from 90
 *                             days); a tap-to-change row for each number that EXISTS (threshold pace,
 *                             FTP, pace per 100), one line for everything else: measured in week one.
 *                             The only thing they HAVE to do on this screen is nothing.
 *
 * One plate per screen, the same forge plate Profile and Adjust use, so the first thing a new athlete
 * touches is the thing they will keep touching. Every field written here is the same field Profile
 * edits, through the same save. Progress lives in localStorage (`efforts:intake_step`) so the Strava
 * and Garmin round trips through their callback routes come back here; both open in THIS tab.
 */

const STEP_KEY = 'efforts:intake_step';
type Step = 1 | 2 | 3;
const TOTAL = 3;

const readStep = (): Step => {
  try { const v = Number(localStorage.getItem(STEP_KEY)); return v === 2 || v === 3 ? v : 1; } catch { return 1; }
};
const parsePaceText = (t: string): number | null => { const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const sec = Number(m[1]) * 60 + Number(m[2]); return sec > 0 ? sec : null; };
const paceToText = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
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

/** Strava's mark, drawn inline (Simple Icons path) so the row matches the others. */
const StravaMark = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path fill="#FC4C02" d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
);

/** The Train screen's card (NonRaceBuilder `optBtn`). */
const card = (active: boolean) =>
  `w-full text-left p-4 rounded-xl border text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
    active ? 'border-[rgb(var(--wiz-accent-rgb,236,233,227))] bg-[rgba(var(--wiz-accent-rgb,236,233,227),0.10)]' : 'border-white/12 bg-white/[0.03]'
  }`;

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

  // Screen 3: what the account holds (learned from history) plus what they type here.
  const [learned, setLearned] = useState<any>(null);
  const [pn, setPn] = useState<Record<string, any>>({});

  // Screen 2
  const [gym, setGym] = useState<'commercial' | 'home' | null>(null);
  const [gear, setGear] = useState<Set<string>>(new Set());

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
      const st: string[] = Array.isArray(b.equipment?.strength) ? b.equipment.strength : [];
      if (st.includes('Commercial gym')) setGym('commercial');
      else if (st.length) { setGym('home'); setGear(new Set(st)); }
      setLearned(b.learned_fitness ?? null);
      setPn({ ...(b.performanceNumbers ?? {}) });
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

  /** Save what is answered before leaving the tab for Strava or Garmin; come back to Your numbers. */
  const saveBeforeLeaving = async () => {
    try { await persist(sportsPatch); } catch { /* keep going */ }
    writeStep(3);
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
  const toggleGear = toggleIn(setGear);

  const canLeaveSports = gym === 'commercial' || (gym === 'home' && gear.size > 0);
  const blocked = 'Commercial gym, or what you own.';

  const sportsPatch = (b: any) => ({
    ...b,
    equipment: { ...(b.equipment ?? {}), strength: gym === 'commercial' ? ['Commercial gym'] : Array.from(gear) },
  });

  const finishSports = async () => {
    if (!canLeaveSports) return;
    setSaving(true);
    try { await persist(sportsPatch); go(3); } finally { setSaving(false); }
  };

  // ── Screen 3 ─────────────────────────────────────────────────────────────────────────────
  const baselinesLike = { learned_fitness: learned, performance_numbers: pn };
  const thr = resolveCurrentRunThresholdPace(baselinesLike as any);
  const thrMine = pn.threshold_pace_source === 'manual';
  const ftp = resolveCurrentFtp(baselinesLike as any);
  const ftpMine = pn.ftp_source === 'manual';
  const swim100 = typeof pn.swimPace100 === 'string' ? pn.swimPace100 : null;

  const finish = async () => {
    setSaving(true);
    try {
      await persist((b) => ({ ...b, performanceNumbers: { ...(b.performanceNumbers ?? {}), ...pn } }));
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
            className={`px-3 py-1 text-[13px] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${i > 0 ? 'border-l border-white/15' : ''} ${on ? 'text-white bg-white/[0.12]' : 'text-white/50 bg-white/[0.03]'}`}>
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

  return (
    <div className="mobile-app-container">
      <MobileHeader />
      <main className="mobile-main-content">
        {step === 1 && (
          <StepLayout step={1} totalSteps={TOTAL} title="About you" onContinue={() => void finishAboutYou()} canContinue continueLabel="Next" saving={saving} hideProgress={false}>
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

            </div>
          </StepLayout>
        )}

        {step === 2 && (
          <StepLayout step={2} totalSteps={TOTAL} title="Your gym" subtitle="The plan will cater lifts to the equipment you have." onBack={() => go(1)} onContinue={() => void finishSports()} canContinue={canLeaveSports} continueLabel="Next" saving={saving} blockedReason={blocked}>
            <div className={plateClass} style={readoutPlateStyle(undefined, { galaxy: true })}>
              <div className="px-3 py-3">
                <SectionHead Icon={Wrench} label="Where you lift" colour={getDisciplineColor('strength')} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setGym('commercial')} aria-pressed={gym === 'commercial'} className={card(gym === 'commercial')}>
                    <span className="block text-base">Commercial gym</span>
                    <span className="block text-sm mt-0.5 text-white/55">Has everything.</span>
                  </button>
                  <button type="button" onClick={() => setGym('home')} aria-pressed={gym === 'home'} className={card(gym === 'home')}>
                    <span className="block text-base">Home gym</span>
                    <span className="block text-sm mt-0.5 text-white/55">Tap what you own.</span>
                  </button>
                </div>
                {gym === 'home' && chips(HOME_GYM_EQUIPMENT_OPTIONS, gear, toggleGear, getDisciplineColor('strength'))}
                {gym === 'commercial' && <p className="m-0 mt-2 text-[12px] text-white/55">A commercial gym has everything the plan asks for.</p>}
                {gym == null && <p className="m-0 mt-2 text-[12px] text-white/55">Anything else, swim gear included, lives on Profile.</p>}
              </div>
            </div>
          </StepLayout>
        )}

        {step === 3 && (
          <StepLayout step={3} totalSteps={TOTAL} title="Your numbers" subtitle="From your watch, typed, or measured in week one. Nothing is guessed." onBack={() => go(2)} onContinue={() => void finish()} canContinue continueLabel="Next" saving={saving}>
            <div className={plateClass} style={readoutPlateStyle(undefined, { galaxy: true })}>
              <div className="px-3 py-3">
                <SectionHead Icon={Link2} label="From your watch" colour="rgba(255,255,255,0.7)" />
                <p className="m-0 mb-2 text-[12px] text-white/55 leading-snug">
                  One tap brings in your last 90 days and fills what it can: easy pace, threshold pace, FTP if you ride with power, and your training load. Garmin's arrive over the next few minutes.
                </p>
                <div className="space-y-2">
                  {connectRow('strava', <StravaMark />, 'Strava', 'Activities arrive as you finish them.', stravaOn, () => void startStrava())}
                  {connectRow('garmin', <Watch className="h-5 w-5" style={{ color: '#00A0DE' }} />, 'Garmin Connect', 'Rides and runs arrive as you finish them.', garminOn, () => void startGarmin())}
                  {isNativeIOS && healthKit && connectRow('health', <Heart className="h-5 w-5" style={{ color: '#FF2D55' }} />, 'Apple Health', 'Workouts from your watch and phone.', healthOn, () => void startAppleHealth())}
                </div>
                {connectNote && <p className="m-0 mt-2 text-[12px] text-white/60">{connectNote}</p>}
              </div>

              <div className="px-3 py-3">
                <SectionHead Icon={Dumbbell} label="Your numbers" colour="rgba(255,255,255,0.7)" />
                {thr.sec_per_mi != null && (
                  <NumberRow id="threshold" name="Threshold pace" hint={metric ? 'm:ss/km' : 'm:ss/mi'} inputMode="numeric" sport="run"
                    value={`${paceToText(metric ? thr.sec_per_mi / 1.609344 : thr.sec_per_mi)}/${metric ? 'km' : 'mi'} · ${numberWord(thr.source, thrMine)}`}
                    onSave={(t) => { const sec = parsePaceText(t); if (sec == null) return; const secPerMi = metric ? sec * 1.609344 : sec; setPn((p) => ({ ...p, threshold_pace_min_per_mi: paceToText(secPerMi), threshold_pace_source: 'manual' })); }} />
                )}
                {ftp.value != null && (
                  <NumberRow id="ftp" name="FTP" hint="W" inputMode="numeric" sport="bike"
                    value={`${Math.round(Number(ftp.value))} W · ${numberWord(ftp.source, ftpMine)}`}
                    onSave={(t) => { const v = Math.round(Number(t)); if (!(v > 0)) return; setPn((p) => ({ ...p, ftp: v, ftp_source: 'manual' })); }} />
                )}
                {swim100 && (
                  <NumberRow id="swim100" name="Pace per 100" hint="m:ss" inputMode="numeric" sport="swim"
                    value={`${swim100}/100 · your number`} seed={swim100}
                    onSave={(t) => { if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return; setPn((p) => ({ ...p, swimPace100: t.trim() })); }} />
                )}
                <p className="m-0 mt-2 text-[13px] text-white/70">
                  {thr.sec_per_mi == null && ftp.value == null && !swim100
                    ? 'Nothing on file yet. Your paces, your FTP and your lifts are measured in week one.'
                    : 'Anything your watch did not give, your lifts included, is measured in week one.'}
                </p>
                <p className="mt-2 text-[12px] text-white/45">Tap a value to change it.</p>
              </div>

            </div>
          </StepLayout>
        )}

      </main>
    </div>
  );
}
