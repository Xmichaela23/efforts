import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch, RefreshCw, Calendar, Info, Loader2, User, Hash, Gauge, Wrench, Settings2 } from 'lucide-react';
import { NumberRow } from '@/components/ui/number-row';
import { numberWord } from '@/lib/number-word';
import SportStrip, { type StripSport } from '@/components/ui/sport-strip';
import { GalaxyButton } from '@/components/ui/galaxy-button';
import { readoutPlateStyle } from '@/lib/readout-plate';
import { setPendingStateLens } from '@/lib/state-lens';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/contexts/AppContext';
import StravaPreview from '@/components/StravaPreview';
import GarminPreview from '@/components/GarminPreview';
import { Button } from './ui/button';
import { SPORT_COLORS, getDisciplineColor } from '@/lib/context-utils';
import { deriveSwimPaceBands, parsePaceToSeconds } from '@/lib/swimPaceZones';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { refreshGroupRideRouteSnapshotsForUser } from '@/lib/refresh-group-ride-route-snapshots';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { runThresholdTestRow, ftpTestRow } from '@/lib/baseline-tests';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import { fiveKNudgeDismissKey, type ArcFiveKLearnedDivergence } from '@/lib/arc-types';
import { resolveCurrentFtp, pendingFtpProposal, acceptEstimatedFtp } from '@/lib/resolve-current-ftp';
import { frielRunZones } from '@/lib/friel-zones';
import { resolveCurrentRunEasyPace, resolveCurrentRunThresholdPace, describeThresholdBasis, pendingRunThresholdProposal, acceptLearnedRunThreshold } from '@/lib/resolve-current-run-pace';
import { resolveCurrentLthr } from '@/lib/resolve-current-lthr';
import { ageEstimateMaxHr, resolveCurrentMaxHr } from '@/lib/resolve-current-max-hr';
import { resolveStrengthCapacity } from '@shared/state-trend/capacity-resolver';

interface TrainingBaselinesProps {
onClose: () => void;
onOpenBaselineTest?: (testName: string) => void;
}

interface BaselineData {
  // Personal details
/** Profile screen identity fields (2026-09-06): name, location, photo_url. Email is the auth user's. */
profile?: { name?: string; location?: string; photo_url?: string } | null;
birthday?: string;
height?: number;
weight?: number;
gender?: 'male' | 'female' | 'prefer_not_to_say';
units?: 'metric' | 'imperial';

  // Disciplines
age: number;
disciplines: string[];

  // Performance numbers (simplified - only what's needed)
performanceNumbers: {
    // Running
    fiveK?: string;
    easyPace?: string;
  // Cycling
  ftp?: number;
  // Swimming
  swimPace100?: string;
      // Strength
    squat?: number;
    deadlift?: number;
    bench?: number;
    overheadPress1RM?: number;
    pullupMaxReps?: number; // rep-based bodyweight lift — max clean reps (integer), NOT %1RM; 0 is valid (Q-102)
    /**
     * Self-reported lifting history. Stage 5 §8a of WORKORDER-the-standing-plan-2026-08-22: it lives
     * in baselines, not the wizard — asked once, edited here after. It seeds the wizard's baseline
     * strength-gain display; once months of logged lifting exist, history grades the tier and
     * overrides this answer (typed answers seed, logs decide). Rides in `performance_numbers` jsonb
     * so it needs no column and round-trips through the existing save/load spread.
     */
    liftingExperience?: 'new' | 'couple_years' | 'many_years';
};

  // Equipment (only for swimming and strength)
equipment: {
  swimming?: string[];
  strength?: string[];
};

  // Keep these for backwards compatibility but don't collect them
  disciplineFitness: Record<string, string>;
  benchmarks: Record<string, string>;
  injuryHistory: string;
  injuryRegions: string[];
  trainingBackground: string;
  /**
   * Wizard/VDOT training paces (`{ base, race, steady, power, speed }`, sec/MILE). Declared here so
   * the threshold card can hand the resolver all three of its inputs — without it the wizard tier is
   * invisible on this screen and a 5K-derived pace reads as "not enough data".
   */
  effort_paces?: Record<string, unknown> | null;
  /** AUTO/LOCKED switch (2026-09-02): per-lift values the athlete locked. Key present = locked to that
   *  value (learning never touches it); absent = auto (trusted logged value, else the typed seed). */
  locked_baselines?: Record<string, number> | null;
}

/** The five lifts the Baselines screen owns. `learnedKey` = `learned_fitness.strength_1rms` entry;
 *  pull-ups are rep-based with no learned aggregate (Q-102). Order matches the old input row. */
const STRENGTH_LIFT_FIELDS = [
  { key: 'squat', label: 'Squat', placeholder: '225', learnedKey: 'squat', reps: false },
  { key: 'deadlift', label: 'DL', placeholder: '315', learnedKey: 'deadlift', reps: false },
  { key: 'bench', label: 'Bench', placeholder: '185', learnedKey: 'bench_press', reps: false },
  { key: 'overheadPress1RM', label: 'OHP', placeholder: '135', learnedKey: 'overhead_press', reps: false },
  { key: 'pullupMaxReps', label: 'Pull-ups', placeholder: '8', learnedKey: null, reps: true },
] as const;

/** ⛔ ONE SWITCH FOR EVERY NUMBER (2026-09-02, Michael: "run should match how strength locks now").
 *  `auto` = the app's measured value, kept updating. `my number` = yours holds until you switch back.
 *  "locked" was the first label and read as confusing; the app already said "Use my number". */
function AutoMinePill({ mine, onAuto, onMine, color, label }: { mine: boolean; onAuto: () => void; onMine: () => void; color: string; label: string }) {
  const seg = 'px-2.5 h-7 text-[11px] leading-7 transition-colors whitespace-nowrap';
  const on = 'text-white', off = 'text-white/45 hover:text-white/70';
  return (
    <div className="flex rounded-full border border-white/20 overflow-hidden shrink-0" role="group" aria-label={`${label}: auto or my number`}>
      <button type="button" onClick={onAuto} aria-pressed={!mine} className={`${seg} ${!mine ? on : off}`} style={{ backgroundColor: !mine ? `${color}40` : 'transparent' }}>auto</button>
      <button type="button" onClick={onMine} aria-pressed={mine} className={`${seg} ${mine ? on : off}`} style={{ backgroundColor: mine ? `${color}40` : 'transparent' }}>my number</button>
    </div>
  );
}

export default function TrainingBaselines({ onClose, onOpenBaselineTest }: TrainingBaselinesProps) {
const { saveUserBaselines, loadUserBaselines } = useAppContext();
/** Profile identity (2026-09-06): the sign-in email is shown, never stored; the photo is uploaded to the
 *  `avatars` bucket at `<user_id>/photo.jpg` (resized to 512px on the phone), its public URL saved to
 *  `profile.photo_url` at once so leaving without Save does not orphan the file. */
const [authEmail, setAuthEmail] = useState<string>('');
const [photoBusy, setPhotoBusy] = useState(false);
const [photoNote, setPhotoNote] = useState<string | null>(null);
useEffect(() => {
  let cancelled = false;
  void supabase.auth.getUser().then(({ data: u }) => { if (!cancelled) setAuthEmail(u?.user?.email ?? ''); }).catch(() => {});
  return () => { cancelled = true; };
}, []);
const uploadPhoto = async (file: File) => {
  const uid = getStoredUserId(); if (!uid) return;
  setPhotoBusy(true); setPhotoNote(null);
  try {
    const blob = await resizeImageToJpeg(file, 512);
    const path = `${uid}/photo.jpg`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const photo_url = `${pub.publicUrl}?v=${Date.now()}`;
    const nextProfile = { ...(data.profile ?? {}), photo_url };
    const { error: dbErr } = await supabase.from('user_baselines').update({ profile: nextProfile, updated_at: new Date().toISOString() }).eq('user_id', uid);
    if (dbErr) throw dbErr;
    setData(prev => ({ ...prev, profile: { ...(prev.profile ?? {}), photo_url } }));
  } catch (e) {
    console.warn('[Profile] photo upload failed:', e);
    setPhotoNote('Could not save the photo. Try again.');
  } finally { setPhotoBusy(false); }
};
// A lift switched to "locked" before a number exists — the input is in lock mode, nothing saved yet.
const [lockDrafts, setLockDrafts] = useState<Record<string, boolean>>({});
const [thresholdInfoOpen, setThresholdInfoOpen] = useState(false);
const [ftpInfoOpen, setFtpInfoOpen] = useState(false);
// ⛔ THE LEARNER PROPOSES, THE ATHLETE ACCEPTS (2026-09-04, docs/SPEC-ftp-accept-2026-09-04.md). When the
// live estimate differs from the accepted number, the bike row shows `measured 171 · use it` beside the
// applied value. Tapping writes `learned_fitness.ride_ftp_accepted` (re-read first so a learner run is
// not clobbered) and re-prices the unstarted endurance rows the same way a saved number does. Not a
// modal, not a banner; nothing moves until the tap.
const [ftpAccepting, setFtpAccepting] = useState(false);
const [ftpAcceptNote, setFtpAcceptNote] = useState<string>('');
const acceptMeasuredFtp = async () => {
  const userId = getStoredUserId();
  if (!userId || ftpAccepting) return;
  setFtpAccepting(true);
  try {
    const { data: row } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', userId).maybeSingle();
    let lf: Record<string, unknown> | null = null;
    const raw = row?.learned_fitness;
    if (typeof raw === 'string') { try { lf = JSON.parse(raw); } catch { lf = null; } }
    else if (raw && typeof raw === 'object') lf = raw as Record<string, unknown>;
    const next = acceptEstimatedFtp(lf, 'baselines');
    if (!next) return;
    const { error } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) { console.error('[TrainingBaselines] FTP accept failed:', error); return; }
    setLearnedFitness(next);
    const acceptedW = Math.round(Number((next.ride_ftp_accepted as { value: number }).value));
    let note = `${acceptedW} watts in use.`;
    try {
      const { data: rp } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } });
      const n = rp?.success && rp?.repriced ? Number(rp.rows_repriced) || 0 : 0;
      if (n > 0) note += ` ${n} upcoming ${n === 1 ? 'session' : 'sessions'} updated.`;
    } catch (e) { console.warn('[TrainingBaselines] re-price after FTP accept failed:', e); }
    setFtpAcceptNote(note);
  } finally {
    setFtpAccepting(false);
  }
};
const [lthrInfoOpen, setLthrInfoOpen] = useState(false);
const { addPlannedWorkout } = usePlannedWorkouts() as any;

// FTP Test workout template - let user pick date
// D-077: ref for the cycling FTP input so the "Edit to override" hint can
// focus the field on tap. Previously the hint was a non-interactive <span> —
// athletes read it as an instruction, tapped it, and got nothing.
const ftpInputRef = useRef<HTMLInputElement | null>(null);
const focusFtpInput = () => {
  const el = ftpInputRef.current;
  if (!el) return;
  el.focus();
  // Select-on-focus so the existing learned value is highlighted and the next
  // keypress replaces it — matches the user mental model of "tap to override".
  try { el.select(); } catch { /* non-fatal */ }
};

const [showFtpDatePicker, setShowFtpDatePicker] = useState(false);
const [ftpTestDate, setFtpTestDate] = useState(() => {
  const d = new Date();
  d.setDate(d.getDate() + 2); // Default to 2 days out
  return d.toISOString().split('T')[0];
});
const [scheduledFtpTest, setScheduledFtpTest] = useState<{id: string, date: string} | null>(null);
/**
 * ⛔ THE RUN HAD NO WAY TO ASK FOR THE TEST (2026-08-20). The bike offers "Schedule FTP Test"; the
 * swim explains its 400/200 protocol; the run offered nothing — while the 12-minute time trial was
 * built end to end and had been for months. `materialize-plan:1334` expands the session,
 * `compute-workout-analysis:843` finds the ~720 s lap and writes the threshold pace at high
 * confidence. The app could measure it, had the protocol, and never asked. Same starved-input shape
 * as everything else: built, tested, unreachable.
 */
const [scheduledRunTest, setScheduledRunTest] = useState<{id: string, date: string} | null>(null);
const [showRunTestDatePicker, setShowRunTestDatePicker] = useState(false);
const [runTestDate, setRunTestDate] = useState<string>(() => {
  const d = new Date(); d.setDate(d.getDate() + 3);
  return d.toISOString().split('T')[0];
});
const [checkingFtpTest, setCheckingFtpTest] = useState(false);
const [showSwimTest, setShowSwimTest] = useState(false);

// Check for existing scheduled FTP test
const checkScheduledFtpTest = async () => {
  try {
    setCheckingFtpTest(true);
    const userId = getStoredUserId();
    if (!userId) return;
    
    const { data } = await supabase
      .from('planned_workouts')
      .select('id, date, name')
      .eq('user_id', userId)
      .eq('workout_status', 'planned')
      .ilike('name', '%FTP Test%')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(1);
    
    if (data && data.length > 0) {
      setScheduledFtpTest({ id: data[0].id, date: data[0].date });
    } else {
      setScheduledFtpTest(null);
    }
  } catch (error) {
  } finally {
    setCheckingFtpTest(false);
  }
};

const checkScheduledRunTest = async () => {
  try {
    const userId = getStoredUserId();
    if (!userId) return;
    const { data } = await supabase
      .from('planned_workouts')
      .select('id, date, name')
      .eq('user_id', userId)
      .eq('workout_status', 'planned')
      .ilike('name', '%Threshold Test%')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(1);
    setScheduledRunTest(data && data.length > 0 ? { id: data[0].id, date: data[0].date } : null);
  } catch { /* non-fatal — the button just offers to schedule one */ }
};

// Check on mount
useEffect(() => {
  checkScheduledFtpTest();
  checkScheduledRunTest();
}, []);

/**
 * ⛔ THE TAGS ARE THE CONTRACT, NOT THE NAME. `run_test` is what `materialize-plan:1334` expands into
 * the 12-minute protocol and what `compute-workout-analysis:843` looks for before it goes hunting for
 * the ~720 s lap. Renaming the session is safe; dropping that tag silently turns the test into an
 * ordinary hard run that measures nothing.
 */
const scheduleRunTest = async () => {
  try {
    // the row lives in src/lib/baseline-tests.ts, shared with the wizard's Retest (2026-09-04)
    await addPlannedWorkout(runThresholdTestRow(runTestDate) as any);
    setShowRunTestDatePicker(false);
    await checkScheduledRunTest();
  } catch {
    alert('Error scheduling the threshold test. Please try again.');
  }
};

const deleteRunTest = async () => {
  if (!scheduledRunTest) return;
  try {
    await supabase.from('planned_workouts').delete().eq('id', scheduledRunTest.id);
    setScheduledRunTest(null);
  } catch {
    alert('Error removing the threshold test. Please try again.');
  }
};

const scheduleFtpTest = async () => {
  try {
    await addPlannedWorkout(ftpTestRow(ftpTestDate) as any);
    const displayDate = new Date(ftpTestDate + 'T12:00:00').toLocaleDateString();
    alert(`FTP Test scheduled for ${displayDate}. Rest up - no hard training before then!`);
  } catch (error) {
    alert('Error scheduling FTP test. Please try again.');
  }
};

const deleteFtpTest = async () => {
  if (!scheduledFtpTest) return;
  try {
    await supabase
      .from('planned_workouts')
      .delete()
      .eq('id', scheduledFtpTest.id);
    
    setScheduledFtpTest(null);
  } catch (error) {
    alert('Error deleting FTP test. Please try again.');
  }
};

const rescheduleFtpTest = () => {
  if (scheduledFtpTest) {
    setFtpTestDate(scheduledFtpTest.date);
  }
  setShowFtpDatePicker(true);
};

const [data, setData] = useState<BaselineData>({
  age: 0,
  disciplines: [],
    performanceNumbers: {},
    equipment: {},
    units: 'imperial',
    // Backwards compatibility defaults
  disciplineFitness: {},
  benchmarks: {},
  injuryHistory: '',
  injuryRegions: [],
  trainingBackground: '',
});

const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState('');
const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'baselines' | 'data-import'>('baselines');
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [originalData, setOriginalData] = useState<string>(''); // JSON string for comparison

  // Learned fitness profile state
  const [learnedFitness, setLearnedFitness] = useState<any>(null);
  const [learningProfile, setLearningProfile] = useState(false);

  /** From `get-arc-context` — 5K vs learned threshold nudge */
  const [arcFiveKNudge, setArcFiveKNudge] = useState<ArcFiveKLearnedDivergence | null>(null);
  /** `dismissed_suggestions.five_k_nudge` keys already dismissed for this manual/implied pair */
  const [dismissedFiveKMap, setDismissedFiveKMap] = useState<Record<string, string>>({});
  
  // Resting HR override (optional - user can set their own)
  const [customRestingHR, setCustomRestingHR] = useState<number | null>(null);

  // Manual HR anchor overrides (per sport)
  const [manualRunMaxHR, setManualRunMaxHR] = useState<number | null>(null);
  const [manualRunLTHR, setManualRunLTHR] = useState<number | null>(null);
  const [manualRideMaxHR, setManualRideMaxHR] = useState<number | null>(null);
  const [manualRideLTHR, setManualRideLTHR] = useState<number | null>(null);
  const [configuredZonesSource, setConfiguredZonesSource] = useState<string | null>(null);
  const [garminRestingHR, setGarminRestingHR] = useState<number | null>(null);

  // Track initial manual HR state for change detection
  const [initialManualHR, setInitialManualHR] = useState('');
  const currentManualHR = JSON.stringify({ manualRunMaxHR, manualRunLTHR, manualRideMaxHR, manualRideLTHR });
  const hasChanges = JSON.stringify(data) !== originalData || currentManualHR !== initialManualHR;

  // Strava connection state
const [stravaConnected, setStravaConnected] = useState(false);
const [stravaMessage, setStravaMessage] = useState('');
const [accessToken, setAccessToken] = useState<string | null>(null);
const [routeSnapRefreshBusy, setRouteSnapRefreshBusy] = useState(false);

  // Garmin connection state
const [garminConnected, setGarminConnected] = useState(false);
const [garminMessage, setGarminMessage] = useState('');
const [garminAccessToken, setGarminAccessToken] = useState<string | null>(null);

  // Load existing baselines on mount
  useEffect(() => {
    loadBaselines();
  }, []);

  // Reload baselines when component becomes visible again (e.g., after saving from baseline test)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBaselines();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also listen for custom event to reload after baseline test save
    const handleBaselineSaved = () => {
      loadBaselines();
    };
    window.addEventListener('baseline:saved', handleBaselineSaved);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('baseline:saved', handleBaselineSaved);
    };
  }, []);

  // Open on the sport the athlete last had open (Michael, 2026-09-06: it kept opening on Strength, the
  // only sport ticked on his account). Fallback: the first ticked sport in strip order, then Run.
  const LAST_SPORT_KEY = 'efforts:profile_last_sport';
useEffect(() => {
    if (!loading && activeSport === null) {
      const sportOrder = ['running', 'cycling', 'strength', 'swimming'];
      let last: string | null = null;
      try { last = localStorage.getItem(LAST_SPORT_KEY); } catch { /* device copy only */ }
      const firstWithData = sportOrder.find(s => data.disciplines.includes(s));
      setActiveSport((last && sportOrder.includes(last) ? last : null) || firstWithData || 'running');
    }
  }, [loading, data.disciplines]);
useEffect(() => {
    if (activeSport) { try { localStorage.setItem(LAST_SPORT_KEY, activeSport); } catch { /* device copy only */ } }
  }, [activeSport]);

  // Check for existing Strava token
useEffect(() => {
  const existingToken = localStorage.getItem('strava_access_token');
  if (existingToken) {
    setAccessToken(existingToken);
    setStravaConnected(true);
  }
}, []);

  // Check for existing Garmin token
useEffect(() => {
  const existingToken = localStorage.getItem('garmin_access_token');
  if (existingToken) {
    setGarminAccessToken(existingToken);
    setGarminConnected(true);
  }
}, []);

  // Listen for OAuth callback messages
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'STRAVA_AUTH_SUCCESS') {
      const { access_token } = event.data.data;
      setAccessToken(access_token);
      setStravaConnected(true);
      localStorage.setItem('strava_access_token', access_token);
      setStravaMessage('Successfully connected to Strava!');
      void refreshGroupRideRouteSnapshotsForUser().then((r) => {
        if (r.goals_updated > 0) {
          setStravaMessage(
            `Successfully connected to Strava! Updated climbing stats on ${r.goals_updated} goal(s).`,
          );
        }
      });
    } else if (event.data.type === 'STRAVA_AUTH_ERROR') {
      setStravaMessage(`Error: ${event.data.error}`);
    } else if (event.data.type === 'GARMIN_AUTH_SUCCESS') {
      const { code } = event.data;
      handleGarminOAuthSuccess(code);
    } else if (event.data.type === 'GARMIN_AUTH_ERROR') {
      setGarminMessage(`Error: ${event.data.error}`);
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, []);

const loadArcNudge = async () => {
  try {
    const userId = getStoredUserId();
    if (!userId) {
      setArcFiveKNudge(null);
      setDismissedFiveKMap({});
      return;
    }
    const [{ data: dismissRow }, arc] = await Promise.all([
      supabase.from('user_baselines').select('dismissed_suggestions').eq('user_id', userId).maybeSingle(),
      fetchArcContext(),
    ]);
    const raw = dismissRow?.dismissed_suggestions as Record<string, unknown> | null | undefined;
    const fm = raw?.five_k_nudge;
    const fiveMap =
      fm && typeof fm === 'object' && !Array.isArray(fm) ? (fm as Record<string, string>) : {};
    setDismissedFiveKMap(fiveMap);
    setArcFiveKNudge((arc?.five_k_nudge as ArcFiveKLearnedDivergence | null) ?? null);
  } catch {
    setArcFiveKNudge(null);
  }
};

const loadBaselines = async () => {
  try {
    setLoading(true);
    const baselines = await loadUserBaselines();
    if (baselines) {
      setData(baselines as BaselineData);
      setOriginalData(JSON.stringify(baselines)); // Store original for comparison
      const rawLf = (baselines as any).learned_fitness;
      let parsedLf: any = null;
      if (rawLf) {
        parsedLf = typeof rawLf === 'string' ? (() => { try { return JSON.parse(rawLf); } catch { return null; } })() : rawLf;
        setLearnedFitness(parsedLf);
      } else {
        setLearnedFitness(null);
      }
      const learnedAt = parsedLf?.last_updated as string | undefined;
      setLastUpdated(learnedAt || baselines.lastUpdated || null);
      // Load custom resting HR if set
      if ((baselines as any).performanceNumbers?.restingHeartRate) {
        setCustomRestingHR(Number((baselines as any).performanceNumbers.restingHeartRate));
      }
    } else {
      // No saved data yet - set original to current defaults
      setOriginalData(JSON.stringify(data));
    }
    // Load configured_hr_zones (manual overrides / Strava / FIT)
    try {
      const userId = getStoredUserId();
      if (userId) {
        const { data: row } = await supabase
          .from('user_baselines')
          .select('configured_hr_zones')
          .eq('user_id', userId)
          .maybeSingle();
        if (row?.configured_hr_zones) {
          const cfg = typeof row.configured_hr_zones === 'string'
            ? JSON.parse(row.configured_hr_zones)
            : row.configured_hr_zones;
          setConfiguredZonesSource(cfg.source || null);
          if (cfg.resting_heart_rate && Number(cfg.resting_heart_rate) > 30) {
            setGarminRestingHR(Number(cfg.resting_heart_rate));
          }
          const rmx = cfg.manual_run_max_hr || null;
          const rlt = cfg.manual_run_lthr || null;
          const cmx = cfg.manual_ride_max_hr || null;
          const clt = cfg.manual_ride_lthr || null;
          if (rmx) setManualRunMaxHR(rmx);
          if (rlt) setManualRunLTHR(rlt);
          if (cmx) setManualRideMaxHR(cmx);
          if (clt) setManualRideLTHR(clt);
          setInitialManualHR(JSON.stringify({ manualRunMaxHR: rmx, manualRunLTHR: rlt, manualRideMaxHR: cmx, manualRideLTHR: clt }));
        }
      }
    } catch (_e) { /* non-critical */ }
    if (!initialManualHR) {
      setInitialManualHR(JSON.stringify({ manualRunMaxHR: null, manualRunLTHR: null, manualRideMaxHR: null, manualRideLTHR: null }));
    }
    await loadArcNudge();
    setLoading(false);
  } catch (error) {
    setLoading(false);
  }
};

// Fetch learned fitness profile from edge function, then reload from DB
const refreshLearnedProfile = async () => {
  try {
    setLearningProfile(true);
    const userId = getStoredUserId();
    if (!userId) {
      return;
    }

    const { error } = await supabase.functions.invoke('learn-fitness-profile', {
      body: { user_id: userId }
    });

    if (error) {
      console.error('learn-fitness-profile', error);
      return;
    }

    const { data: row } = await supabase
      .from('user_baselines')
      .select('learned_fitness, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    let lf = row?.learned_fitness as any;
    if (typeof lf === 'string') {
      try {
        lf = JSON.parse(lf);
      } catch {
        lf = null;
      }
    }
    if (lf) {
      setLearnedFitness(lf);
      const t = typeof lf.last_updated === 'string' ? lf.last_updated : null;
      setLastUpdated(t || row?.updated_at || null);
    } else {
      setLastUpdated(row?.updated_at || null);
    }
    await loadArcNudge();
  } catch (error) {
    console.error('refreshLearnedProfile', error);
  } finally {
    setLearningProfile(false);
  }
};

const handleFiveKNudgeYes = async () => {
  if (!arcFiveKNudge) return;
  const next: BaselineData = {
    ...data,
    performanceNumbers: { ...data.performanceNumbers, fiveK: arcFiveKNudge.implied_5k_label },
  };
  setData(next);
  setSaving(true);
  setSaveMessage('');
  try {
    await saveUserBaselines(next);
    setOriginalData(JSON.stringify(next));
    await loadArcNudge();
    setSaveMessage('5K updated from training data.');
  } catch (e) {
    console.error(e);
    setSaveMessage('Could not save.');
  } finally {
    setSaving(false);
  }
};

const handleFiveKNudgeNo = async () => {
  if (!arcFiveKNudge) return;
  const userId = getStoredUserId();
  if (!userId) return;
  const key = fiveKNudgeDismissKey(arcFiveKNudge);
  try {
    const { data: ub } = await supabase.from('user_baselines').select('dismissed_suggestions').eq('user_id', userId).maybeSingle();
    const dismissed = (ub?.dismissed_suggestions as Record<string, unknown>) || {};
    const prevFive =
      dismissed.five_k_nudge && typeof dismissed.five_k_nudge === 'object' && !Array.isArray(dismissed.five_k_nudge)
        ? (dismissed.five_k_nudge as Record<string, string>)
        : {};
    const { error } = await supabase
      .from('user_baselines')
      .update({
        dismissed_suggestions: { ...dismissed, five_k_nudge: { ...prevFive, [key]: new Date().toISOString() } },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
    setDismissedFiveKMap((m) => ({ ...m, [key]: new Date().toISOString() }));
  } catch (e) {
    console.error('dismiss five_k nudge', e);
  }
};

// Format pace from seconds per km to mm:ss/mi
/** The resolver returns sec/MILE (it owns the sec/km conversion). `formatPace` takes sec/KM — do not
 *  cross them; that is the unit footgun that has bitten this repo three times. */
const formatPaceSecPerMi = (secPerMi: number | null | undefined): string => {
  if (secPerMi == null || !Number.isFinite(secPerMi) || secPerMi <= 0) return '—';
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
};

const formatPace = (secPerKm: number | undefined): string => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const secPerMile = secPerKm * 1.60934;
  const mins = Math.floor(secPerMile / 60);
  const secs = Math.round(secPerMile % 60);
  return `${mins}:${String(secs).padStart(2, '0')}/mi`;
};

// GLASS BOX (Law 2 + Law 3). Every learned number shows its work: what it was measured from, the RULE that
// qualified those sessions, and HOW OLD the newest one is.
//
// This used to print the sample count and DROP the `source` string — while the engine was already writing a
// full plain-English basis ("pace at easy HR (5 runs; Friel Z2 — at or below 89% of your threshold HR
// (151 bpm))"). A magnitude reaching the surface stripped of its basis is the Law 3 failure tell verbatim
// ("a number shown without its confidence"). The copy was never missing — the surface was throwing it away.
//
// `as_of` (Q-173) is the newest SESSION behind the number, NOT the last time the profile was rebuilt. It
// matters most in summer: heat lifts run HR ~4-7 bpm, so hot runs sit above the easy ceiling and (correctly)
// do not qualify — so the learner can go quiet for a whole season while the surface keeps showing a
// months-old pace that LOOKS current. Now it says how old it is instead of lying by omission.
const learnedBasisLine = (
  metric: { sample_count?: number; source?: string } | null | undefined,
  sport: 'run' | 'ride',
): string | null => {
  if (!metric?.sample_count || metric.sample_count < 1) return null;
  // Prefer the engine's own basis — it names the qualifying RULE, which is what answers "why didn't my run
  // count?". Fall back to the bare count only when the engine did not supply one.
  if (metric.source && String(metric.source).trim().length > 0) return String(metric.source).trim();
  const u = sport === 'ride' ? 'rides' : 'runs';
  return `Learned from ${metric.sample_count} ${u}`;
};

/** "as of May 27" — the newest session behind the number. null when the engine didn't stamp one (never faked). */
const learnedAsOfLine = (metric: { as_of?: string | null } | null | undefined): string | null => {
  const d = metric?.as_of;
  if (!d || typeof d !== 'string' || d.length < 10) return null;
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000);
  const pretty = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  // Only shout about age once it's genuinely stale. Under 6 weeks, the date alone is enough.
  return days >= 42 ? `as of ${pretty} — ${days} days ago` : `as of ${pretty}`;
};

// Get confidence dots
const getConfidenceDots = (confidence: string | undefined): string => {
  switch (confidence) {
    case 'high': return '●●●';
    case 'medium': return '●●○';
    case 'low': return '●○○';
    default: return '○○○';
  }
};

// Calculate age from birthday
/** Square-crop and resize an image on the phone before upload; JPEG at 0.85. */
async function resizeImageToJpeg(file: File, size: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('image decode failed')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = Math.round((img.naturalWidth - side) / 2), sy = Math.round((img.naturalHeight - side) / 2);
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

const calculateAge = (birthday: string | undefined): number | null => {
  if (!birthday) return null;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age > 0 && age < 120 ? age : null;
};

// Calculate age-based HR estimates
const getAgeBasedHREstimates = (birthday: string | undefined, gender?: string) => {
  const age = calculateAge(birthday);
  if (!age) return null;

  // ONE age formula (Tanaka / Gulati for female) so this matches the HRZoneChart "auto" default —
  // was 220 − age, which no other surface used (audit 2026-07-17 #5).
  const maxHR = ageEstimateMaxHr(age, gender);
  const thresholdHR = Math.round(maxHR * 0.88);
  
  return {
    maxHR,
    thresholdHR,
    age
  };
};

interface HRZone {
  name: string;
  label: string;
  min: number;
  max: number | null;
  color: string;
}

const ZONE_COLORS = ['#10b981', '#84cc16', '#f59e0b', '#ef4444', '#991b1b'];

// Friel 5-zone model from LTHR (used by Garmin, TrainingPeaks)
// D-286 — the zone table the athlete READS now derives from the SAME Friel model the learner applies.
// It used to top Z2 at `round(0.90 x LTHR)` = 136 while `easy-hr.ts` cut easy at `round(0.89 x LTHR)` = 134,
// so a 135 bpm run was "Zone 2 Aerobic" ON THIS SCREEN and "too hard to be easy" to the engine that sets
// the athlete's plan pace. D-284 fixed the analyzer's copy and missed THIS one — the one they look at.
// Now: easy === Z1 or Z2, by construction, at every LTHR. See src/lib/friel-zones.ts.
const getFrielZones = (lthr: number): HRZone[] =>
  frielRunZones(lthr).map((z, i) => ({ name: z.name, label: z.label, min: z.min, max: z.max, color: ZONE_COLORS[i] }));

// Karvonen %HRR model (uses Max HR + Resting HR)
const getKarvonenZones = (maxHR: number, restingHR: number): HRZone[] => {
  const hrr = maxHR - restingHR;
  const z = (pct: number) => Math.round(restingHR + hrr * pct);
  return [
    { name: 'Z1', label: 'Recovery',  min: 0,       max: z(0.60), color: ZONE_COLORS[0] },
    { name: 'Z2', label: 'Aerobic',   min: z(0.60), max: z(0.70), color: ZONE_COLORS[1] },
    { name: 'Z3', label: 'Tempo',     min: z(0.70), max: z(0.80), color: ZONE_COLORS[2] },
    { name: 'Z4', label: 'Threshold', min: z(0.80), max: z(0.90), color: ZONE_COLORS[3] },
    { name: 'Z5', label: 'VO2max',    min: z(0.90), max: maxHR,   color: ZONE_COLORS[4] },
  ];
};

// Hybrid: prefer Friel (LTHR) when available, fall back to Karvonen (HRR) if resting HR known
const getHRZones = (lthr: number | null, maxHR: number | null, restingHR: number | null): HRZone[] | null => {
  if (lthr && lthr > 100) return getFrielZones(lthr);
  if (maxHR && maxHR > 100 && restingHR && restingHR > 30) return getKarvonenZones(maxHR, restingHR);
  return null;
};

const getZoneModel = (lthr: number | null, maxHR: number | null, restingHR: number | null): string => {
  if (lthr && lthr > 100) return 'Friel %LTHR';
  if (maxHR && maxHR > 100 && restingHR && restingHR > 30) return 'Karvonen %HRR';
  if (maxHR && maxHR > 100) return 'needs Resting HR';
  return '';
};

// Resting HR: only use real values (manual entry or Garmin device), never guess
const getRestingHR = (customOverride: number | null, garminValue: number | null): { value: number | null; source: string } => {
  if (customOverride && customOverride > 0) {
    return { value: customOverride, source: 'manual' };
  }
  if (garminValue && garminValue > 0) {
    return { value: garminValue, source: 'garmin' };
  }
  return { value: null, source: 'none' };
};

// Calculate power zones from FTP (Coggan zones)
const getPowerZones = (ftp: number): { name: string; range: string; color: string }[] => {
  return [
    { name: 'Z1 Recovery', range: `< ${Math.round(ftp * 0.55)}W`, color: '#10b981' },
    { name: 'Z2 Endurance', range: `${Math.round(ftp * 0.55)}-${Math.round(ftp * 0.75)}W`, color: '#84cc16' },
    { name: 'Z3 Tempo', range: `${Math.round(ftp * 0.76)}-${Math.round(ftp * 0.90)}W`, color: '#f59e0b' },
    { name: 'Z4 Threshold', range: `${Math.round(ftp * 0.91)}-${Math.round(ftp * 1.05)}W`, color: '#ef4444' },
    { name: 'Z5 VO2max', range: `${Math.round(ftp * 1.06)}-${Math.round(ftp * 1.20)}W`, color: '#991b1b' },
    { name: 'Z6 Anaerobic', range: `${Math.round(ftp * 1.21)}-${Math.round(ftp * 1.50)}W`, color: '#7c2d12' },
    { name: 'Z7 Neuromuscular', range: `> ${Math.round(ftp * 1.50)}W`, color: '#581c87' },
  ];
};

/**
 * Every row saves at once (2026-09-06): `persist` is the old Save button's routine, parameterised on the
 * data to write and on the manual heart-rate overrides, so a row's commit and an auto switch run the
 * same follow-through (endurance re-price on a watched number, restate on a lock change).
 */
const persist = async (next: BaselineData, hr?: { runMax?: number | null; runLthr?: number | null; rideMax?: number | null; rideLthr?: number | null; resting?: number | null }) => {
  const m = {
    runMax: hr && hr.runMax !== undefined ? hr.runMax : manualRunMaxHR,
    runLthr: hr && hr.runLthr !== undefined ? hr.runLthr : manualRunLTHR,
    rideMax: hr && hr.rideMax !== undefined ? hr.rideMax : manualRideMaxHR,
    rideLthr: hr && hr.rideLthr !== undefined ? hr.rideLthr : manualRideLTHR,
  };
  const restingOverride = hr && hr.resting !== undefined ? hr.resting : customRestingHR;
  try {
    setSaving(true);
    setSaveMessage('');
    // D-200: stamp when the swim threshold CHANGES so the State re-test nudge can measure "weeks since update".
    let dataToSave: any = next;
    try {
      const prevSwim = JSON.parse(originalData || '{}')?.performanceNumbers?.swimPace100;
      const curSwim = (next as any)?.performanceNumbers?.swimPace100;
      if (curSwim && curSwim !== prevSwim) {
        dataToSave = { ...next, performanceNumbers: { ...(next as any).performanceNumbers, swimPace100_updated_at: new Date().toISOString() } };
        setData(dataToSave);
      }
    } catch { void 0; }
    await saveUserBaselines(dataToSave as any);

    // Persist manual HR zone overrides to configured_hr_zones
    const hasManualOverrides = !!(m.runMax || m.runLthr || m.rideMax || m.rideLthr);
    const hrChanged = JSON.stringify({ manualRunMaxHR: m.runMax, manualRunLTHR: m.runLthr, manualRideMaxHR: m.rideMax, manualRideLTHR: m.rideLthr }) !== initialManualHR || (hr && hr.resting !== undefined);
    if (hasManualOverrides || hrChanged) {
      const userId = getStoredUserId();
      if (userId) {
        const restingHR = restingOverride || garminRestingHR || 60;

        /**
         * ⛔ THROUGH THE RESOLVERS, OR THE SCREEN AND THE ENGINE PART COMPANY (2026-08-20).
         *
         * These read the learned columns RAW, which means no D-284 sample-count gate. The learner
         * writes a FALLBACK when it finds no hard rides — `90% of observed max (estimated)`, with
         * `sample_count: 0` — and a raw read takes it. Every server surface now refuses that value,
         * so the zones saved from here would be built on a number the engine will not use: the screen
         * showing one set of bins while workload and the analyser bin against another.
         *
         * ⚠️ IT IS VISIBLE ON A REAL SCREEN, WHICH IS HOW IT WAS FOUND: max HR 175, LTHR 158, and
         * 175 × 0.90 = 157.5 → 158. The card labelled that "learned".
         *
         * The resolvers apply the gate, honour the athlete's typed override and their Q-174 choice,
         * and are the same functions the server asks — so what is stored here is what the engine reads.
         */
        const baselinesForHr = {
          learned_fitness: learnedFitness,
          performance_numbers: next.performanceNumbers,
          configured_hr_zones: { manual_run_lthr: m.runLthr, manual_ride_lthr: m.rideLthr },
        } as never;
        const effectiveRunLTHR = m.runLthr || resolveCurrentLthr(baselinesForHr, { sport: 'run' }).bpm || null;
        const effectiveRunMax = m.runMax || resolveCurrentMaxHr(
          { learned_fitness: learnedFitness } as never, { sport: 'run', allowAgeEstimate: false },
        ).bpm || null;
        const effectiveRideLTHR = m.rideLthr || resolveCurrentLthr(baselinesForHr, { sport: 'ride' }).bpm || null;
        const effectiveRideMax = m.rideMax || resolveCurrentMaxHr(
          { learned_fitness: learnedFitness } as never, { sport: 'ride', allowAgeEstimate: false },
        ).bpm || null;

        // Compute primary zone boundaries from the best available anchor
        const primaryLTHR = effectiveRunLTHR || effectiveRideLTHR;
        const primaryMax = effectiveRunMax || effectiveRideMax;

        /**
         * ⛔ ZONES ARE PER SPORT NOW (2026-08-20), AND THIS WAS THE REAL COLLAPSE.
         *
         * One `zones` array was built from `primaryLTHR` — which is `runLTHR || rideLTHR`, run
         * PREFERRED — and `compute-workout-analysis:1580` reads it as **priority 1** for EVERY sport,
         * above every resolver. So a ride's heart-rate zone bins were the athlete's RUNNING zones.
         * Cycling heart rate sits 5-10 bpm below running at the same effort, so every ride binned one
         * zone easy: real threshold work counted as tempo, and the time-in-zone the whole 80/20 read
         * rests on was wrong for the bike.
         *
         * ⚠️ `zones` IS STILL WRITTEN, unchanged, and that is not laziness — Strava writes the same
         * key with genuinely sport-agnostic zones (`strava-token-exchange:131`; Strava's own model has
         * one HR zone set per athlete), and older rows carry it. It stays as the fallback. What is new
         * is that when the app has a per-sport anchor it now says so instead of averaging two sports
         * into one array.
         */
        const zonesFor = (lthr: number | null, maxHr: number | null) => {
          if (lthr && lthr > 100) return getFrielZones(lthr).map(z => ({ min: z.min, max: z.max }));
          if (maxHr && maxHr > 100) return getKarvonenZones(maxHr, restingHR).map(z => ({ min: z.min, max: z.max }));
          return undefined;
        };
        const zonesRun = zonesFor(effectiveRunLTHR, effectiveRunMax);
        const zonesRide = zonesFor(effectiveRideLTHR, effectiveRideMax);
        const zones = zonesFor(primaryLTHR, primaryMax);

        const configuredZones: Record<string, any> = {
          source: hasManualOverrides ? 'manual' : 'learned',
          custom_zones: hasManualOverrides,
          updated_at: new Date().toISOString(),
          manual_run_max_hr: m.runMax,
          manual_run_lthr: m.runLthr,
          manual_ride_max_hr: m.rideMax,
          manual_ride_lthr: m.rideLthr,
          /**
           * ⛔ ONLY WRITTEN WHEN IT IS UNAMBIGUOUS (2026-08-20). These two were
           * `runLTHR || rideLTHR` and `runMax || rideMax` — one number claiming to speak for two
           * sports, and every reader that trusted it got the RUN's number for a bike. That is the
           * collapse the per-sport arrays above exist to end, and continuing to write the collapsed
           * value would leave the next reader a loaded gun.
           *
           * Written only when a single sport has an anchor, so the value cannot be the wrong sport's.
           * With both on file it is `null` and readers use the per-sport fields, which every reader in
           * this app now does. With neither it was null anyway.
           *
           * ⚠️ NOT DELETED. The KEY stays because Strava writes it (`strava-token-exchange:138`) and
           * rows written before today carry it — a reader hitting `undefined` versus a missing key is
           * the same answer, but removing the key from the write would strand nothing and confuse the
           * next person reading the shape.
           */
          threshold_heart_rate: (effectiveRunLTHR && effectiveRideLTHR) ? null : primaryLTHR,
          max_heart_rate: (effectiveRunMax && effectiveRideMax) ? null : primaryMax,
          resting_heart_rate: restingHR,
        };
        if (zones) configuredZones.zones = zones;
        // The per-sport arrays. Absent when that sport has no anchor — which is honest, and lets a
        // reader fall back rather than bin a ride against running zones.
        if (zonesRun) configuredZones.zones_run = zonesRun;
        if (zonesRide) configuredZones.zones_ride = zonesRide;

        await supabase
          .from('user_baselines')
          .update({ configured_hr_zones: configuredZones })
          .eq('user_id', userId);
      }
    }

    setOriginalData(JSON.stringify(dataToSave)); // match the SAVED copy (incl. swimPace100_updated_at) so the button greys out post-save
    setInitialManualHR(JSON.stringify({ manualRunMaxHR: m.runMax, manualRunLTHR: m.runLthr, manualRideMaxHR: m.rideMax, manualRideLTHR: m.rideLthr }));
    // ⛔ A SAVED NUMBER RE-PRICES THE PLAN (Michael 2026-09-02). If a pace anchor, FTP, the 5K or a manual
    // threshold HR changed, every unstarted run/ride row is re-priced through the checkpoint function's
    // re-price mode — the same per-row rebuild the six-week checkpoint uses. Strength rows are untouched:
    // a block's weights come from its week-1 test. No plan → the call returns no_plan and nothing happens.
    let repriceNote = '';
    try {
      const prevPn = (JSON.parse(originalData || '{}')?.performanceNumbers ?? {}) as Record<string, unknown>;
      const nextPn = ((dataToSave as any)?.performanceNumbers ?? {}) as Record<string, unknown>;
      const WATCH = ['threshold_pace_min_per_mi', 'threshold_pace_source', 'ftp', 'ftp_source', 'fiveK', 'fiveK_source', 'threshold_heart_rate', 'lthr_source'];
      const changed = WATCH.some((k) => String(prevPn[k] ?? '') !== String(nextPn[k] ?? '')) || !!(m.runLthr || m.rideLthr);
      if (changed) {
        const { data: rp } = await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } });
        if (rp?.success && rp?.repriced) {
          const n = Number(rp.rows_repriced) || 0;
          repriceNote = n > 0 ? ` · ${n} upcoming ${n === 1 ? 'session' : 'sessions'} updated` : '';
        }
      }
    } catch (e) { console.warn('[TrainingBaselines] re-price after save failed:', e); }
    // ⛔ A LOCKED 1RM RESTATES THE BLOCK'S WEIGHTS (Michael 2026-09-02: "user should be able to override").
    // The restate the logger fires on every strength save now honours `locked_baselines` above the
    // week-1 test; changing a lock here runs it once so the unstarted weeks move now.
    try {
      const prevLocked = JSON.stringify(JSON.parse(originalData || '{}')?.locked_baselines ?? null);
      const nextLocked = JSON.stringify((dataToSave as any)?.locked_baselines ?? null);
      if (prevLocked !== nextLocked) {
        const { data: rs } = await supabase.functions.invoke('rematerialize-standing-block', { body: { apply: true } });
        if (rs?.success) repriceNote += ' · weights updated';
      }
    } catch (e) { console.warn('[TrainingBaselines] restate after lock change failed:', e); }
    setSaveMessage(`Saved.${repriceNote}`);
    setLastUpdated(new Date().toISOString());
    setTimeout(() => setSaveMessage(''), 4000);
  } catch (error) {
    setSaveMessage('Error saving. Please try again.');
  } finally {
    setSaving(false);
  }
};

  // Strava connection
const connectStrava = () => {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  const redirectUri = 'https://efforts.work/strava/callback';
  // ⛔ THE SAME SCOPE STRING AS THE CONNECTIONS SCREEN (2026-09-03). Two entry points connect Strava,
  // and the grant an athlete ends up with is whichever one they happened to use — so a narrower list
  // here silently means "sharing a lift fails for anyone who connected from Baselines".
  const scope = 'read,activity:read_all,activity:write,profile:read_all';
  
  if (!clientId || clientId === 'undefined') {
      setStravaMessage('Error: Strava client ID not configured.');
    return;
  }
  
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    const popup = window.open(authUrl, 'strava-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');

  if (!popup) {
    setStravaMessage('Popup was blocked. Please allow popups and try again.');
  }
};

const disconnectStrava = () => {
  setStravaConnected(false);
  setAccessToken(null);
  localStorage.removeItem('strava_access_token');
  setStravaMessage('Disconnected from Strava');
};

const refreshGroupRideSnapshotsFromBaselines = async () => {
  setRouteSnapRefreshBusy(true);
  try {
    const r = await refreshGroupRideRouteSnapshotsForUser();
    if (r.goals_updated > 0) {
      setStravaMessage(`Updated route climbing stats on ${r.goals_updated} goal(s).`);
    } else if (r.urls_attempted === 0) {
      setStravaMessage(
        'No route snapshots to update — add a Strava `/routes/…` link on your season goal, or stats already match.',
      );
    } else if (r.errors.length > 0) {
      setStravaMessage(r.errors[0] ?? 'Could not refresh route stats.');
    } else {
      setStravaMessage('Route stats check finished.');
    }
  } catch (e) {
    setStravaMessage(e instanceof Error ? e.message : 'Could not refresh route stats.');
  } finally {
    setRouteSnapRefreshBusy(false);
  }
};

  // PKCE helper
const generatePKCE = async () => {
  const codeVerifier = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { codeVerifier, codeChallenge };
};

  // Garmin OAuth success handler
const handleGarminOAuthSuccess = async (code: string) => {
  try {
    const codeVerifier = sessionStorage.getItem('garmin_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://yyriamwvtvzlkumqrvpm.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5cmlhbXd2dHZ6bGt1bXFydnBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2OTIxNTgsImV4cCI6MjA2NjI2ODE1OH0.yltCi8CzSejByblpVC9aMzFhi3EOvRacRf6NR0cFJNY'
    );
    const userId = getStoredUserId();
    if (!userId) {
      throw new Error('User must be logged in');
    }

    const tokenResponse = await fetch('https://yyriamwvtvzlkumqrvpm.supabase.co/functions/v1/bright-service', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        code: code,
        codeVerifier: codeVerifier,
        redirectUri: 'https://efforts.work/auth/garmin/callback'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    setGarminAccessToken(tokenData.access_token);
    setGarminConnected(true);
    localStorage.setItem('garmin_access_token', tokenData.access_token);
    setGarminMessage('Successfully connected to Garmin!');
    sessionStorage.removeItem('garmin_code_verifier');
  } catch (error) {
    setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    sessionStorage.removeItem('garmin_code_verifier');
  }
};

  // Garmin connection
const connectGarmin = async () => {
    localStorage.removeItem('garmin_access_token');
  setGarminMessage('Connecting to Garmin...');
  
  try {
    const { codeVerifier, codeChallenge } = await generatePKCE();
    sessionStorage.setItem('garmin_code_verifier', codeVerifier);
    
    const authUrl = 'https://connect.garmin.com/oauth2Confirm';
    const clientId = (import.meta as any).env?.VITE_GARMIN_CLIENT_ID || '';
    const redirectUri = 'https://efforts.work/auth/garmin/callback';
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      state: Math.random().toString(36).substring(2, 15)
    });
    
    const fullAuthUrl = `${authUrl}?${params.toString()}`;
    const popup = window.open(fullAuthUrl, 'garmin-auth', 'width=600,height=600');
    
    if (!popup) {
      setGarminMessage('Popup was blocked. Please allow popups for this site and try again.');
      sessionStorage.removeItem('garmin_code_verifier');
    }
  } catch (error) {
    setGarminMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    sessionStorage.removeItem('garmin_code_verifier');
  }
};

const disconnectGarmin = () => {
  setGarminConnected(false);
  setGarminAccessToken(null);
  localStorage.removeItem('garmin_access_token');
  setGarminMessage('Disconnected from Garmin');
};

  // Discipline options with colors
const metric = data.units === 'metric';
const [lastSavedSport, setLastSavedSport] = useState<string | null>(null);
const [infoOpen, setInfoOpen] = useState<Set<string>>(new Set());
const toggleInfo = (id: string) => setInfoOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
const fmtBirthday = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const STRIP_TO_DISCIPLINE: Record<StripSport, string> = { run: 'running', bike: 'cycling', swim: 'swimming', strength: 'strength' };
const DISCIPLINE_TO_STRIP: Record<string, StripSport> = { running: 'run', cycling: 'bike', swimming: 'swim', strength: 'strength' };
const stripSport: StripSport | null = activeSport ? (DISCIPLINE_TO_STRIP[activeSport] ?? null) : null;
const activeColour = activeSport ? getDisciplineColor(stripSport ?? '') : 'rgba(255,255,255,0.7)';
/** A row's commit: update the screen, then run the old Save routine on the result. */
const commitData = async (updater: (d: BaselineData) => BaselineData, hr?: Parameters<typeof persist>[1]) => {
  const next = updater(data);
  setData(next);
  setLastSavedSport(activeSport ?? 'you');
  await persist(next, hr);
};
const goToAdjust = () => { setPendingStateLens('adjust'); window.dispatchEvent(new CustomEvent('open:state')); };
const SectionHead = ({ id, Icon, label, colour, info }: { id: string; Icon: React.ComponentType<any>; label: string; colour: string; info?: string }) => {
  const open = info ? infoOpen.has(id) : false;
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} strokeWidth={2.25} style={{ color: colour }} className="shrink-0" aria-hidden="true" />
        <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase" style={{ color: colour }}>{label}</span>
        {info && <button type="button" onClick={() => toggleInfo(id)} aria-label={`About ${label.toLowerCase()}`} aria-expanded={open} className="bg-transparent border-none p-0 cursor-pointer text-white/45 text-[12px] leading-none">ⓘ</button>}
      </div>
      {open && info && <p className="mb-2 text-[12px] text-white/65 leading-snug">{info}</p>}
    </>
  );
};
const parsePaceText = (t: string): number | null => { const m = t.trim().match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const sec = Number(m[1]) * 60 + Number(m[2]); return sec > 0 ? sec : null; };
const paceToText = (secPerMi: number | null | undefined): string | null => { if (secPerMi == null || !Number.isFinite(secPerMi) || secPerMi <= 0) return null; const v = metric ? secPerMi / 1.609344 : secPerMi; return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}/${metric ? 'km' : 'mi'}`; };
const pnAny = (data.performanceNumbers || {}) as any;
const baselinesLike = { learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers, configured_hr_zones: { manual_run_lthr: manualRunLTHR, manual_ride_lthr: manualRideLTHR } } as any;
/** The sport's sections — Numbers · Zones · Equipment (swim: Numbers · Settings · Zones · Equipment). */
const sportSections = (): Array<{ id: string; label: string; Icon: React.ComponentType<any>; info?: string; body: React.ReactNode }> => {
  const ageEstimates = getAgeBasedHREstimates(data.birthday, data.gender);
  const restingInfo = getRestingHR(customRestingHR, garminRestingHR);
  const hrRows = (sport: 'run' | 'ride') => {
    const isRun = sport === 'run';
    const manualMax = isRun ? manualRunMaxHR : manualRideMaxHR;
    const manualLthr = isRun ? manualRunLTHR : manualRideLTHR;
    const learnedMax = (isRun ? learnedFitness?.run_max_hr_observed?.value : learnedFitness?.ride_max_hr_observed?.value) || null;
    const lthr = resolveCurrentLthr(baselinesLike, { sport });
    const effMax = manualMax || learnedMax || (ageEstimates ? ageEstimates.maxHR : null);
    const effLthr = lthr.bpm ?? (effMax ? Math.round(effMax * 0.88) : (ageEstimates ? ageEstimates.thresholdHR : null));
    const lthrMine = isRun ? pnAny.lthr_source === 'manual' : manualLthr != null;
    const lthrNote = lthrMine ? 'your number' : lthr.bpm != null ? (String(lthr.source ?? '').includes('estimate') || String(lthr.source ?? '').includes('max') ? 'estimated from max heart rate' : `from ${isRun ? 'runs' : 'rides'}`) : effMax ? 'estimated from max heart rate' : ageEstimates ? 'age estimate' : null;
    const maxNote = manualMax ? 'your number' : learnedMax ? `observed in ${isRun ? 'runs' : 'rides'}` : ageEstimates ? 'age estimate' : null;
    const rows: React.ReactNode[] = [];
    rows.push(
      <NumberRow key="lthr" id={`${sport}-lthr`} name="Threshold heart rate" hint="bpm" inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={effLthr != null ? `${Math.round(effLthr)} bpm · ${numberWord(lthr.source, lthrMine)}` : null} note={lthrNote} mine={lthrMine}
        onSave={(t) => { const v = parseInt(t); if (!(v > 0)) return; if (isRun) { setManualRunLTHR(v); void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, lthr_source: 'manual' } }), { runLthr: v }); } else { setManualRideLTHR(v); void commitData((d) => d, { rideLthr: v }); } }}
        onAuto={() => { if (isRun) { setManualRunLTHR(null); void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, lthr_source: 'learned' } }), { runLthr: null }); } else { setManualRideLTHR(null); void commitData((d) => d, { rideLthr: null }); } }} />,
    );
    rows.push(
      <NumberRow key="max" id={`${sport}-max`} name="Max heart rate" hint="bpm" inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={effMax ? `${Math.round(effMax)} bpm · ${manualMax ? 'your number' : 'auto'}` : null} note={maxNote} mine={!!manualMax}
        onSave={(t) => { const v = parseInt(t); if (!(v > 0)) return; if (isRun) { setManualRunMaxHR(v); void commitData((d) => d, { runMax: v }); } else { setManualRideMaxHR(v); void commitData((d) => d, { rideMax: v }); } }}
        onAuto={() => { if (isRun) { setManualRunMaxHR(null); void commitData((d) => d, { runMax: null }); } else { setManualRideMaxHR(null); void commitData((d) => d, { rideMax: null }); } }} />,
    );
    rows.push(
      <NumberRow key="rest" id={`${sport}-rest`} name="Resting heart rate" hint="bpm" inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={restingInfo.value ? `${restingInfo.value} bpm · ${customRestingHR ? 'your number' : 'auto'}` : null} note={customRestingHR ? 'your number' : restingInfo.value ? 'from your watch' : null} mine={!!customRestingHR}
        onSave={(t) => { const v = parseInt(t); if (!(v > 30)) return; setCustomRestingHR(v); void commitData((d) => d, { resting: v }); }}
        onAuto={() => { setCustomRestingHR(null); void commitData((d) => d, { resting: null }); }} />,
    );
    const zones = getHRZones(effLthr, effMax, restingInfo.value);
    const model = getZoneModel(effLthr, effMax, restingInfo.value);
    const table = zones && zones.length > 0 ? (
      <div className="mt-1 space-y-0.5">
        {zones.map((z) => (
          <div key={z.name} className="flex items-baseline justify-between text-[12px] px-1">
            <span className="text-white/60">{z.name} {z.label}</span>
            <span className="tabular-nums text-white/75">{z.min}–{z.max} bpm</span>
          </div>
        ))}
        <p className="text-[12px] text-white/50 px-1 mt-1">{model}</p>
      </div>
    ) : <p className="text-[12px] text-white/50">Heart-rate zones appear once there is a threshold or a max heart rate: type one, or add your birthday for an age estimate.</p>;
    return { rows, table };
  };
  const equipmentChips = (discipline: 'swimming' | 'strength', options: string[]) => (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = ((data.equipment as any)[discipline] || []).includes(option);
        return <GalaxyButton key={option} shape="chip" variant={on ? 'primary' : 'secondary'} onClick={() => { toggleEquipment(discipline, option); void persistEquipmentSoon(); }}>{option}</GalaxyButton>;
      })}
    </div>
  );

  if (activeSport === 'running') {
    const thr = resolveCurrentRunThresholdPace(baselinesLike);
    const easy = resolveCurrentRunEasyPace(baselinesLike);
    const thrMine = pnAny.threshold_pace_source === 'manual';
    const thrSamples = Number(learnedFitness?.run_threshold_pace_sec_per_km?.sample_count);
    const thrAccepted = learnedFitness?.run_threshold_pace_accepted?.value != null;
    const thrNote = thrMine ? 'your number' : thr.source === 'learned' ? (thrAccepted ? 'accepted from runs' : `from runs${Number.isFinite(thrSamples) && thrSamples > 0 ? `, ${thrSamples} runs` : ''}`) : thr.sec_per_mi != null ? 'typed, until your runs measure' : null;
    const thrProposal = pendingRunThresholdProposal(baselinesLike);
    const fiveKMine = pnAny.fiveK_source !== 'learned';
    const implied = arcFiveKNudge?.implied_5k_label ?? null;
    const hr = hrRows('run');
    return [
      { id: 'run-numbers', label: 'Numbers', Icon: Hash, info: 'Threshold pace is the fastest pace you could hold for about an hour; hard sessions are set from it. Easy pace is what your last five easy runs measured, or threshold pace × 1.19 until there are five. Typing a number makes it your number; auto uses what your runs measure.', body: (
        <div className="space-y-1.5">
          <NumberRow id="threshold" name="Threshold pace" hint={metric ? 'm:ss/km' : 'm:ss/mi'} inputMode="numeric" sport="run" value={thr.sec_per_mi != null ? `${paceToText(thr.sec_per_mi)} · ${numberWord(thr.source, thrMine)}` : null} note={thrNote} mine={thrMine}
            onSave={(t) => { const sec = parsePaceText(t); if (sec == null) return; const secPerMi = metric ? sec * 1.609344 : sec; const str = `${Math.floor(secPerMi / 60)}:${String(Math.round(secPerMi % 60)).padStart(2, '0')}`; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, threshold_pace_min_per_mi: str, threshold_pace_source: 'manual' } as any })); }}
            onAuto={() => void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, threshold_pace_source: 'learned' } as any }))} />
          {thrProposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">Your runs measure {paceToText(thrProposal.measuredSecPerKm * 1.609344)}</span>
              <button type="button" disabled={thrAccepting} onClick={() => void acceptThr()} style={{ borderColor: `${getDisciplineColor('run')}88`, color: getDisciplineColor('run') }} className="text-[13px] px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{thrAccepting ? 'Applying…' : `use ${paceToText(thrProposal.measuredSecPerKm * 1.609344)}`}</button>
            </div>
          )}
          <NumberRow id="easy" name="Easy pace" editable={false} sport="run" value={paceToText(easy.sec_per_mi)} note={easy.sec_per_mi != null ? (easy.source === 'learned' ? 'from your last five easy runs' : 'threshold pace × 1.19, until five easy runs are logged') : 'follows threshold pace'} />
          <NumberRow id="fiveK" name="5K time" hint="mm:ss" inputMode="numeric" sport="run" value={pnAny.fiveK ? `${pnAny.fiveK} · ${fiveKMine ? 'your number' : 'auto'}` : (!fiveKMine && implied ? `${implied} · auto` : null)} note={fiveKMine ? (implied && arcFiveKNudge?.should_prompt ? `your number. Your runs suggest about ${implied}.` : (pnAny.fiveK ? 'your number' : null)) : 'from runs'} mine={fiveKMine && !!pnAny.fiveK} seed={pnAny.fiveK || ''}
            onSave={(t) => { if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, fiveK: t.trim(), fiveK_source: 'manual' } as any })); }}
            onAuto={() => void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, fiveK_source: 'learned' } as any }))} />
          {hr.rows[0]}
        </div>
      ) },
      { id: 'run-zones', label: 'Zones', Icon: Gauge, info: 'Five heart-rate zones from your threshold heart rate (Friel). With no threshold, from max and resting heart rate (Karvonen). Max heart rate is what your runs have shown, or an age estimate until then.', body: (
        <div className="space-y-1.5">
          {hr.rows[1]}
          {hr.rows[2]}
          {hr.table}
        </div>
      ) },
    ];
  }
  if (activeSport === 'cycling') {
    const ftp = resolveCurrentFtp(baselinesLike);
    const ftpMine = pnAny.ftp_source === 'manual';
    const proposal = pendingFtpProposal(baselinesLike);
    const ftpAccepted = learnedFitness?.ride_ftp_accepted?.value != null;
    const ftpNote = ftpMine ? 'your number' : ftp.source === 'learned' ? (ftpAccepted ? 'accepted from your rides' : 'from your rides') : ftp.value != null ? 'typed, until your rides measure' : null;
    const hr = hrRows('ride');
    const powerZones = ftp.value ? getPowerZones(Number(ftp.value)) : [];
    return [
      { id: 'bike-numbers', label: 'Numbers', Icon: Hash, info: 'FTP is the most power you could hold for about an hour. It sets your power zones and the targets on rides. Typing a number makes it your number; auto uses what your rides measure.', body: (
        <div className="space-y-1.5">
          <NumberRow id="ftp" name="FTP" hint="W" inputMode="numeric" sport="bike" value={ftp.value != null ? `${Math.round(Number(ftp.value))} W · ${numberWord(ftp.source, ftpMine)}` : null} note={ftpNote} mine={ftpMine}
            onSave={(t) => { const v = Math.round(Number(t)); if (!(v > 0)) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, ftp: v, ftp_source: 'manual' } as any })); }}
            onAuto={() => void commitData((d) => { const pn: any = { ...d.performanceNumbers }; delete pn.ftp_source; return { ...d, performanceNumbers: pn }; })} />
          {proposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">Your rides measure {Math.round(proposal.measured)} W</span>
              <button type="button" disabled={ftpAccepting} onClick={() => void acceptMeasuredFtp()} style={{ borderColor: `${getDisciplineColor('bike')}88`, color: getDisciplineColor('bike') }} className="text-[13px] px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{ftpAccepting ? 'Applying…' : `use ${Math.round(proposal.measured)} W`}</button>
            </div>
          )}
          {ftpAcceptNote && <p className="text-[12px] text-white/60">{ftpAcceptNote}</p>}
          {hr.rows[0]}
        </div>
      ) },
      { id: 'bike-zones', label: 'Zones', Icon: Gauge, info: 'Power zones from FTP (Coggan). Heart-rate zones from your threshold heart rate on the bike (Friel); with no threshold, from max and resting heart rate.', body: (
        <div className="space-y-1.5">
          {powerZones.length > 0 && (
            <div className="space-y-0.5 mb-2">
              {powerZones.map((z) => (
                <div key={z.name} className="flex items-baseline justify-between text-[12px] px-1">
                  <span className="text-white/60">{z.name}</span>
                  <span className="tabular-nums text-white/75">{z.range}</span>
                </div>
              ))}
              <p className="text-[12px] text-white/50 px-1 mt-1">power zones from FTP</p>
            </div>
          )}
          {hr.rows[1]}
          {hr.rows[2]}
          {hr.table}
        </div>
      ) },
    ];
  }
  if (activeSport === 'swimming') {
    const swim100 = pnAny.swimPace100 as string | undefined;
    const bands = deriveSwimPaceBands(parsePaceToSeconds(swim100) ?? 0);
    return [
      { id: 'swim-numbers', label: 'Numbers', Icon: Hash, info: 'Your hard, steady 100 pace: the effort you could hold for a strong continuous swim. Sets your swim pace zones.', body: (
        <div className="space-y-1.5">
          <NumberRow id="swim100" name="Threshold 100 pace" hint="m:ss" inputMode="numeric" sport="swim" value={swim100 ? `${swim100}/100 · your number` : null} note={swim100 ? 'your number' : null} seed={swim100 || ''}
            onSave={(t) => { if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, swimPace100: t.trim() } as any })); }} />
        </div>
      ) },
      { id: 'swim-settings', label: 'Settings', Icon: Settings2, info: 'To find your threshold 100 pace: warm up, swim an all-out 400, rest, then an all-out 200. Threshold 100 pace = (400 time − 200 time) ÷ 2. No test handy: use your best steady pace for a continuous 20–30 minute swim.', body: (
        <p className="text-[13px] text-white/60 leading-snug">Swim sessions are easy or technique work outside the plan's slots. The pace zones below come from the 100 pace above.</p>
      ) },
      { id: 'swim-zones', label: 'Zones', Icon: Gauge, body: bands.length > 0 ? (
        <div className="space-y-0.5">
          {bands.map((b) => (
            <div key={b.label} className="flex items-baseline justify-between text-[12px] px-1">
              <span className="text-white/60">{b.label}</span>
              <span className="tabular-nums text-white/75">{b.range}</span>
            </div>
          ))}
          <p className="text-[12px] text-white/50 px-1 mt-1">per 100, from your threshold 100 pace</p>
        </div>
      ) : <p className="text-[12px] text-white/50">Pace zones appear once a threshold 100 pace is typed.</p> },
      { id: 'swim-equipment', label: 'Equipment', Icon: Wrench, body: equipmentChips('swimming', swimmingEquipmentOptions) },
    ];
  }
  if (activeSport === 'strength') {
    const liftRows = STRENGTH_LIFT_FIELDS.map((lift) => {
      const r = resolveStrengthCapacity({ key: lift.key, typed: data.performanceNumbers as any, learnedStrength1rms: learnedFitness?.strength_1rms ?? null, locked: data.locked_baselines ?? null, asOf: new Date().toISOString().slice(0, 10) });
      const locked = data.locked_baselines?.[lift.key] != null;
      const learnedEntry = lift.learnedKey ? learnedFitness?.strength_1rms?.[lift.learnedKey] : null;
      const sets = Number(learnedEntry?.sample_count);
      const unit = lift.reps ? 'reps' : (metric ? 'kg' : 'lb');
      const note = locked ? 'your number' : r.source === 'learned' ? `from your lifts${Number.isFinite(sets) && sets > 0 ? `, ${sets} sets` : ''}` : r.source === 'typed' ? (lift.reps ? 'typed' : 'typed, until your lifts measure') : null;
      const sug = r.suggestion && r.suggestion.divergencePct > 0 ? ` Your lifts suggest ${Math.round(r.suggestion.computed)}.` : '';
      return (
        <NumberRow key={lift.key} id={lift.key} name={lift.label} hint={unit} inputMode="numeric" sport="strength" value={r.value != null ? `${Math.round(r.value)} ${unit} · ${numberWord(r.source, locked)}` : null} note={note ? note + sug : null} mine={locked}
          onSave={(t) => { const n = lift.reps ? Math.max(0, parseInt(t) || 0) : Math.round(Number(t)); if (!(lift.reps ? Number.isFinite(n) : n > 0)) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, [lift.key]: n } as any, locked_baselines: lift.reps ? (d.locked_baselines ?? null) : { ...(d.locked_baselines ?? {}), [lift.key]: n } })); }}
          onAuto={lift.reps ? undefined : () => void commitData((d) => { const next = { ...(d.locked_baselines ?? {}) } as Record<string, number>; delete next[lift.key]; return { ...d, locked_baselines: Object.keys(next).length ? next : null }; })} />
      );
    });
    return [
      { id: 'strength-numbers', label: 'Numbers', Icon: Hash, info: 'The four lifts the block prices from, and pull-ups as reps. Typing a number makes it your number and locks it; auto uses what your lifts measure, three logged sets and up. A number typed here is also the number on file for a new block.', body: <div className="space-y-1.5">{liftRows}</div> },
      { id: 'strength-equipment', label: 'Equipment', Icon: Wrench, info: 'A commercial gym has everything. A home gym lists what you have; the plan picks movements from it.', body: (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <GalaxyButton shape="chip" variant={hasCommercialGym ? 'primary' : 'secondary'} onClick={() => void commitData((d) => ({ ...d, equipment: { ...d.equipment, strength: ['Commercial gym'] } }))}>Commercial gym</GalaxyButton>
            <GalaxyButton shape="chip" variant={!hasCommercialGym ? 'primary' : 'secondary'} onClick={() => { if (hasCommercialGym) void commitData((d) => ({ ...d, equipment: { ...d.equipment, strength: [] } })); }}>Home gym</GalaxyButton>
          </div>
          {!hasCommercialGym && equipmentChips('strength', homeGymEquipmentOptions)}
        </div>
      ) },
    ];
  }
  return [];
};
/** Equipment chips toggle local state first (`toggleEquipment`); the save runs on the next tick with the result. */
const equipPersistRef = useRef<number | null>(null);
const persistEquipmentSoon = () => { if (equipPersistRef.current) window.clearTimeout(equipPersistRef.current); equipPersistRef.current = window.setTimeout(() => { setDataAndPersist(); }, 0); };
const latestData = useRef(data); latestData.current = data;
const setDataAndPersist = () => { setLastSavedSport(activeSport ?? 'you'); void persist(latestData.current); };
const [thrAccepting, setThrAccepting] = useState(false);
const acceptThr = async () => {
  const uid = getStoredUserId(); if (!uid || thrAccepting) return;
  setThrAccepting(true);
  try {
    const { data: row } = await supabase.from('user_baselines').select('learned_fitness').eq('user_id', uid).maybeSingle();
    const raw = row?.learned_fitness; const cur = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const next = acceptLearnedRunThreshold(cur as any, 'baselines'); if (!next) return;
    const { error } = await supabase.from('user_baselines').update({ learned_fitness: next, updated_at: new Date().toISOString() }).eq('user_id', uid);
    if (error) throw error;
    setLearnedFitness(next);
    if (pnAny.threshold_pace_source === 'manual') await commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, threshold_pace_source: 'learned' } as any }));
    else { try { await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } }); } catch { /* the accept stands */ } }
  } catch (e) { console.warn('[Profile] accept threshold failed:', e); }
  finally { setThrAccepting(false); }
};
const disciplineOptions = [
    { id: 'running', name: 'Run', icon: Activity, color: SPORT_COLORS.run },
    { id: 'cycling', name: 'Cycle', icon: Bike, color: SPORT_COLORS.cycling },
    { id: 'strength', name: 'Strength', icon: Dumbbell, color: SPORT_COLORS.strength },
    { id: 'swimming', name: 'Swim', icon: Waves, color: SPORT_COLORS.swim }
  ];
  
  // Get active sport color
  const getActiveSportColor = () => {
    const active = disciplineOptions.find(d => d.id === activeSport);
    return active?.color || '#ffffff';
  };

  // Q-070 fix: the chip ✓ + highlight reflect a baseline ACTUALLY ENTERED (per-sport performance
  // numbers), NOT membership in data.disciplines. Peeking a chip (which still sets activeSport for
  // the editor) no longer earns a ✓ or sticky selection state — only entering a number does.
  const hasBaselineEntered = (id: string): boolean => {
    const pn = (data.performanceNumbers || {}) as any;
    const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
    if (id === 'running') return has(pn.fiveK) || has(pn.easyPace) || has(pn.tenK) || has(pn.halfMarathon) || has(pn.marathon);
    if (id === 'cycling') return has(pn.ftp);
    if (id === 'swimming') return has(pn.swimPace100) || has(pn.swim200Time) || has(pn.swim400Time);
    if (id === 'strength') return has(pn.squat) || has(pn.deadlift) || has(pn.bench);
    return false;
  };

  const toggleDiscipline = (disciplineId: string) => {
    // If clicking the already active sport, close it
    if (activeSport === disciplineId) {
      setActiveSport(null);
    } else {
      // Switch to the new sport and ensure it's in disciplines
      setActiveSport(disciplineId);
      setData(prev => ({
        ...prev,
        disciplines: prev.disciplines.includes(disciplineId)
          ? prev.disciplines
          : [...prev.disciplines, disciplineId]
      }));
    }
  };

  // Equipment options
  // D-058 / Q-020 — "Ankle band" added as a beginner body-position teaching
  // tool per SWIM-PROTOCOL §6.4 (pull buoy + ankle band pairing). Placed
  // adjacent to Pull buoy in the list so the pairing is visually obvious;
  // server-side: when athlete is beginner AND owns ankle band, pull-focused
  // sessions emit `optional:ankle_band` tag.
  const swimmingEquipmentOptions = [
    "Pool access",
    "Open water access",
    "Paddles",
    "Pull buoy",
    "Ankle band",
    "Kickboard",
    "Fins",
    "Snorkel"
  ];

  // D-070: athlete-facing "what this unlocks" copy for each swim equipment chip.
  // Surfaced via the chip's title attribute (hover tooltip). Keep ≤ one line each —
  // truncates uglily otherwise. When you add a new equipment chip, add a matching
  // entry here OR the chip surfaces tooltip-less.
  const swimmingEquipmentHints: Record<string, string> = {
    "Pool access": "Required for structured swim sessions — CSS, threshold, and aerobic work all need a pool.",
    "Open water access": "Unlocks open-water skills sets (sighting, race-start surges) in race-specific phase.",
    "Paddles": "Unlocks paddle-augmented threshold and CSS sets (non-beginner only — protects shoulders).",
    "Pull buoy": "Unlocks pull-focused swim sessions targeting upper-body stroke density.",
    "Ankle band": "Pairs with pull buoy on beginner pull sets — forces rotation and discourages kick rescue.",
    "Kickboard": "Unlocks dedicated kick sets for kick-deficit swimmers.",
    "Fins": "Unlocks fin-assisted drill sets in technique sessions (fingertip drag, single-arm).",
    "Snorkel": "Unlocks stroke-rhythm sets without breathing interruption — head-position and 6-3-6 work.",
  };

  // Home gym equipment options (only shown when "Home gym" is selected)
  // ⛔ THESE STRINGS ARE MATCHED EXACTLY by `substituteExerciseForEquipment`
  // (materialize-plan/index.ts) and by substring in `_shared/strength-equipment-tier.ts`. Renaming a
  // chip breaks both silently — a chip nobody detects reads as equipment the athlete does not own.
  // The last three were added 2026-08-13 for the previous program Forever assistance catalog.
  // ⚠️ "Incline bench" is a SEPARATE chip from "Bench (flat/adjustable)" on purpose: that label is an
  // OR, so it cannot be read as incline capability. An athlete with an adjustable bench ticks both.
  /**
   * ⛔ THE RECOGNIZABLE ITEMS ONLY (Slice 7, 2026-08-13) — this list was CUT, not grown.
   *
   * Slices 2 and 4 itemized niche gear (Decline bench, Dip bars, Leg curl machine, Glute-ham
   * developer, Gymnastic rings, Plyo box) so the gate could read a precise answer. It read a precise
   * answer to a question the athlete could not follow — Michael, on his own picker: *"I wouldn't know
   * what that is."* And the granularity had a cost beyond confusion: a normal home gym was gated OUT
   * of Dips, a movement it can obviously perform, because the only routes were `dip_bars` and
   * `rings`.
   *
   * ⚠️ THE FIELD IS LESS GRANULAR THAN WE WERE. Fitbod and Jefit use presets + common items +
   * per-exercise substitution, not an itemized checklist. We were more precise than the leaders and
   * worse for it.
   *
   * ⛔ THE RULE THAT REPLACES THE ITEMIZATION: **gate only on gear that is BOTH required AND commonly
   * declarable.** Everything else is the substitution backstop's job
   * (`substituteExerciseForEquipment`). Do not re-add a chip here to make a gate more precise — that
   * trade was made once and reversed.
   *
   * ⛔ TWO CHIPS WERE ADDED 2026-08-26, AND THE RULE ABOVE IS WHY, NOT AN EXCEPTION TO IT. Suspension
   * trainer and stability ball pass BOTH halves of the test. Required: `trx fallout`, `stir the pot`
   * and `stability ball rollout` cannot be done without them, and the engine was prescribing all
   * three to athletes who own neither — Michael, 2026-08-26: *"we need to add to equipment list for
   * home gym, should never be just prescribed."* Commonly declarable: somebody with a rack and a bar
   * in their garage knows whether they own a TRX or a stability ball. What Slice 7 cut was gear
   * people could not NAME — a glute-ham developer, dip bars, a leg curl machine. These are not that.
   *
   * ⚠️ AND THE KIT THAT COULD NOT CLEAR THE SAME BAR DID NOT GET A CHIP. A GHD, a sled, a captain's
   * chair, a landmine, a sandbag, a ruck, gymnastic rings — those movements were DROPPED FROM THE
   * PRESCRIBABLE POOL instead (`PRESCRIPTION_EXCLUDED`, `strength-grid/taxonomy.ts`). They stay in
   * the library and an athlete may still log them by choice. Not commonly declarable means not
   * gateable means never prescribed — which is this rule carried through, not bent.
   *
   * ⛔ THESE STRINGS ARE MATCHED BY SUBSTRING in `src/lib/strength-gear.ts` and exactly by
   * `substituteExerciseForEquipment`. Renaming one silently removes the capability from every athlete
   * who ticked it.
   * ⚠️ "Incline bench" stays a SEPARATE chip from "Bench (flat/adjustable)": that label is an OR, so
   * it cannot be read as incline capability. An athlete with an adjustable bench ticks both.
   */
  const homeGymEquipmentOptions = [
    "Barbell + plates",
    "Dumbbells",
    "Squat rack / Power cage",
    "Bench (flat/adjustable)",
    "Incline bench",
    "Pull-up bar",
    "Kettlebells",
    "Cable machine",
    "Resistance bands",
    // ⛔ ADDED 2026-09-02 (WORKORDER-plyo-screen §3): gates the ladder drills in the plyo family; matched
    // by exact string in the logger's plyo Swap options.
    "Agility ladder",
    "Ab wheel",
    // ⛔ ADDED 2026-08-26 — see the ruling above. ⚠️ Both strings are matched by SUBSTRING in
    // `athleteEquipmentToKeys` ("trx"/"suspension", "stability ball"); renaming either silently
    // removes the capability from every athlete who ticked it.
    "TRX / suspension trainer",
    "Stability ball"
  ];

  
  // Helper to check if user has commercial gym access
  const hasCommercialGym = (data.equipment.strength || []).includes('Commercial gym');

const toggleEquipment = (disciplineId: string, option: string) => {
  const currentItems = data.equipment[disciplineId as keyof typeof data.equipment] || [];
  const updatedItems = currentItems.includes(option)
    ? currentItems.filter(item => item !== option)
    : [...currentItems, option];
  
  setData(prev => ({
    ...prev,
    equipment: {
      ...prev.equipment,
      [disciplineId]: updatedItems
    }
  }));
};

const DisciplineIcon = ({ discipline }: { discipline: string }) => {
  const option = disciplineOptions.find(d => d.id === discipline);
  if (!option) return null;
  const Icon = option.icon;
  return <Icon className="h-5 w-5" />;
};

return (
  <div className="max-w-2xl mx-auto px-4 pb-6">
    {/* Page title */}
    <h2 className="text-2xl font-bold text-white pb-2">Profile</h2>
    
    {/* Description */}
    <div className="text-center mb-6">
      <p className="text-white/50 text-sm">Your details, and the numbers your training is priced from. Every change saves at once.</p>
      {lastUpdated && (
        <p className="text-xs text-white/40 mt-2">
          Last updated: {new Date(lastUpdated).toLocaleDateString()}
        </p>
      )}
    </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-white/60">Loading your baselines...</p>
          </div>
        ) : (
          <>

              {/* Tabs - Data Import hidden for now */}
              {/* <div className="flex mb-6">
                <button
                  onClick={() => setActiveTab('baselines')}
                  className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                    activeTab === 'baselines'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Baselines
                </button>
                <button
                  onClick={() => setActiveTab('data-import')}
                  className={`flex-1 py-3 px-4 text-center font-medium border-b-2 ${
                    activeTab === 'data-import'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Data Import
                </button>
              </div> */}

              {activeTab === 'baselines' ? (
                <div className="space-y-4">
                  {/* ── YOU: one plate, Adjust's construction (2026-09-06) ── */}
                  <div className="galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
                    <div className="px-3 py-3">
                      <SectionHead id="you" Icon={User} label="You" colour="rgba(255,255,255,0.7)" />
                      <div className="flex items-start gap-3 mb-1">
                        <label className="relative shrink-0 cursor-pointer" title="Change photo">
                          {data.profile?.photo_url ? (
                            <img src={data.profile.photo_url} alt="" className="h-16 w-16 rounded-full object-cover border border-white/20" />
                          ) : (
                            <div className="h-16 w-16 rounded-full bg-white/[0.08] border border-white/20 flex items-center justify-center text-[11px] text-white/50">{photoBusy ? '…' : 'photo'}</div>
                          )}
                          <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ''; }} />
                        </label>
                        <div className="flex-1 min-w-0">
                          <NumberRow id="name" name="Name" inputType="text" value={data.profile?.name || null} seed={data.profile?.name || ''} onSave={(t) => commitData((d) => ({ ...d, profile: { ...(d.profile ?? {}), name: t } }))} />
                          <NumberRow id="location" name="Location" inputType="text" value={data.profile?.location || null} seed={data.profile?.location || ''} onSave={(t) => commitData((d) => ({ ...d, profile: { ...(d.profile ?? {}), location: t } }))} />
                          <NumberRow id="email" name="Email" editable={false} value={authEmail || null} />
                          {photoNote && <p className="text-[12px] text-white/60 mt-1">{photoNote}</p>}
                        </div>
                      </div>
                      <NumberRow id="birthday" name="Birthday" inputType="date" value={data.birthday ? `${fmtBirthday(data.birthday)}${calculateAge(data.birthday) != null ? ` · ${calculateAge(data.birthday)} yrs` : ''}` : null} seed={data.birthday || ''} onSave={(t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) void commitData((d) => ({ ...d, birthday: t })); }} />
                      <NumberRow id="units" name="Units" value={null} right={(
                        <span className="inline-flex shrink-0 rounded-xl border border-white/15 overflow-hidden" role="group" aria-label="Units">
                          {(['imperial', 'metric'] as const).map((u, i) => {
                            const on = (data.units || 'imperial') === u;
                            return (
                              <button key={u} type="button" aria-pressed={on} onClick={() => { if (!on) void commitData((d) => ({ ...d, units: u })); }}
                                className={`px-3 py-1 text-[13px] ${i === 1 ? 'border-l border-white/15' : ''} ${on ? 'text-white bg-white/[0.12]' : 'text-white/50 bg-white/[0.03]'}`}>
                                {u === 'imperial' ? 'lb · mi' : 'kg · km'}
                              </button>
                            );
                          })}
                        </span>
                      )} />
                      <NumberRow id="height" name="Height" hint={metric ? 'cm' : 'in'} value={data.height ? `${data.height} ${metric ? 'cm' : 'in'}` : null} seed={data.height ? String(data.height) : ''} inputMode="numeric"
                        onSave={(t) => { const v = parseInt(t); if (Number.isFinite(v) && v > 0) void commitData((d) => ({ ...d, height: v })); }} />
                      <NumberRow id="weight" name="Weight" hint={metric ? 'kg' : 'lb'} value={data.weight ? `${data.weight} ${metric ? 'kg' : 'lb'}` : null} seed={data.weight ? String(data.weight) : ''} inputMode="numeric"
                        onSave={(t) => { const v = parseInt(t); if (Number.isFinite(v) && v > 0) void commitData((d) => ({ ...d, weight: v })); }} />
                      {saveMessage && lastSavedSport === 'you' && <p className="text-[13px] text-white/75 mt-1.5">{saveMessage}</p>}
                    </div>
                  </div>

                  {/* ── The sport strip: the app's segmented control, filtering the plate below to one sport ── */}
                  <SportStrip value={stripSport} onChange={(sp) => setActiveSport(STRIP_TO_DISCIPLINE[sp])} />

                  {/* ── ONE plate for the chosen sport, wearing Adjust's plate ── */}
                  {activeSport && (
                    <div className="galaxy-card readout-texture readout-texture--forge rounded-2xl divide-y divide-white/[0.10]" style={readoutPlateStyle(undefined, { galaxy: true })}>
                      {sportSections().map((sec) => (
                        <div key={sec.id} className="px-3 py-3">
                          <SectionHead id={sec.id} Icon={sec.Icon} label={sec.label} colour={activeColour} info={sec.info} />
                          {sec.body}
                        </div>
                      ))}
                      <div className="px-3 py-3">
                        {saveMessage && lastSavedSport === activeSport && <p className="text-[13px] text-white/75 mb-1.5">{saveMessage}</p>}
                        <button type="button" onClick={goToAdjust} className="bg-transparent border-none p-0 text-[13px] text-white/60 outline-none focus:outline-none active:brightness-125">Retest or rebuild on Adjust</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Data Import Tab */
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2 text-white/90">Import Training Data</h3>
                    <p className="text-sm text-white/70">Connect your fitness accounts to auto-populate baseline data</p>
                  </div>
                  
                  {/* Strava Connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-orange-500" />
                      <h4 className="font-medium text-white/90">Strava Integration</h4>
                    </div>

                    {!stravaConnected ? (
                      <button
                        onClick={connectStrava}
                        className="w-full px-4 py-3 text-white bg-orange-500 hover:bg-orange-600 transition-colors font-medium rounded-xl"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Connect with Strava
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                          <p className="text-sm text-cyan-400">✓ Connected to Strava</p>
                        </div>
                          <button
                            onClick={disconnectStrava}
                            className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/25 hover:bg-white/[0.12]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {stravaMessage && (
                      <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                        <p className="text-sm text-white/90">{stravaMessage}</p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => void refreshGroupRideSnapshotsFromBaselines()}
                        disabled={routeSnapRefreshBusy || !getStoredUserId()}
                        className="w-full px-4 py-2.5 text-sm font-medium text-white/90 bg-white/[0.06] hover:bg-white/[0.1] border border-white/20 rounded-xl transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {routeSnapRefreshBusy ? 'Updating route stats…' : 'Refresh saved Strava route stats'}
                      </button>
                      <p className="text-[11px] text-white/40 px-1 leading-snug">
                        Backfills distance and climbing on goals when you pasted a Strava routes URL before linking Strava (or stats were missing).
                      </p>
                    </div>
                  </div>

                  {/* Strava Preview */}
                  {stravaConnected && accessToken && (
                    <StravaPreview 
                      accessToken={accessToken}
                      currentBaselines={data}
                      onDataSelected={(selectedData) => {
                        setData(prev => ({ ...prev, ...selectedData }));
                      }}
                    />
                  )}

                  {/* Garmin Connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Watch className="h-5 w-5 text-blue-500" />
                      <h4 className="font-medium text-white/90">Garmin Integration</h4>
                    </div>

                    {!garminConnected ? (
                      <button
                        onClick={connectGarmin}
                        className="w-full px-4 py-3 text-white bg-blue-500 hover:bg-blue-600 transition-colors font-medium rounded-xl"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Connect with Garmin
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                          <p className="text-sm text-cyan-400">✓ Connected to Garmin</p>
                        </div>
                          <button
                            onClick={disconnectGarmin}
                            className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/25 hover:bg-white/[0.12]"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            Disconnect
                          </button>
                      </div>
                    )}

                    {garminMessage && (
                      <div className="p-3 bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded-md">
                        <p className="text-sm text-white/90">{garminMessage}</p>
                      </div>
                    )}
                  </div>

                  {/* Garmin Preview */}
                  {garminConnected && garminAccessToken && (
                    <GarminPreview 
                      accessToken={garminAccessToken}
                      currentBaselines={data}
                      onDataSelected={(selectedData) => {
                        setData(prev => ({ ...prev, ...selectedData }));
                      }}
                    />
                  )}
                </div>
              )}

          </>
        )}
  </div>
);
}
