import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch, RefreshCw, Calendar, Info, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppContext } from '@/contexts/AppContext';
import StravaPreview from '@/components/StravaPreview';
import GarminPreview from '@/components/GarminPreview';
import { Button } from './ui/button';
import { SPORT_COLORS } from '@/lib/context-utils';
import { deriveSwimPaceBands, parsePaceToSeconds } from '@/lib/swimPaceZones';
import { supabase, getStoredUserId } from '@/lib/supabase';
import { refreshGroupRideRouteSnapshotsForUser } from '@/lib/refresh-group-ride-route-snapshots';
import { usePlannedWorkouts } from '@/hooks/usePlannedWorkouts';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import { fiveKNudgeDismissKey, type ArcFiveKLearnedDivergence } from '@/lib/arc-types';
import { resolveCurrentFtp, pendingFtpProposal, acceptEstimatedFtp } from '@/lib/resolve-current-ftp';
import { frielRunZones } from '@/lib/friel-zones';
import { resolveCurrentRunEasyPace, resolveCurrentRunThresholdPace, describeThresholdBasis } from '@/lib/resolve-current-run-pace';
import { resolveCurrentLthr } from '@/lib/resolve-current-lthr';
import { ageEstimateMaxHr, resolveCurrentMaxHr } from '@/lib/resolve-current-max-hr';
import { resolveStrengthCapacity } from '@shared/state-trend/capacity-resolver';

interface TrainingBaselinesProps {
onClose: () => void;
onOpenBaselineTest?: (testName: string) => void;
}

interface BaselineData {
  // Personal details
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
    await addPlannedWorkout({
      name: 'Threshold Time Trial (Viada p210)',
      type: 'run',
      date: runTestDate,
      description: 'Threshold time trial (Viada p210). PREPARATION: no hard training 48 hours prior; flat route or track; heart rate strap on. WARM-UP: 6–8 min easy jog; 2 x 100 m strides, slow to near full tilt; 3 x 30 s at your fast (mile-PR) pace with 1 min easy walk/jog between; then 1 min rest. TRIAL: press lap and run 12 minutes (under 2 years of training), 10 minutes (2–4 years) or 8 minutes (4+ years) — start at 9.5 out of 10, finish at 10 out of 10, even the whole way; press lap at the end. COOL-DOWN: 8–10 min easy. RESULT: the app reads the trial lap, takes 88% of that speed as your threshold pace (the book\'s rule) and sets it.',
      duration: 45,
      // p210, step for step: easy jog · 2 × 100 m strides · 3 × 30 s fast with 1 min easy · 1 min rest ·
      // the trial (12 min default; 10 / 8 by training age, see description) · cool-down. Sendable to Garmin.
      steps_preset: ['warmup_run_7min_easy', 'strides_2x100m', 'interval_3x30s_115pct_R60s', 'run_rest_1min', 'run_tt_12min', 'cooldown_run_9min_easy'],
      workout_status: 'planned',
      tags: ['assessment', 'run_test', 'time_trial', 'baseline_establishment', 'key_workout'],
    });
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
    await addPlannedWorkout({
      name: 'FTP Test — 20-Minute Protocol (Viada p212)',
      type: 'ride',
      date: ftpTestDate,
      description: 'FTP test — the 20-minute protocol (Viada p212). PREPARATION: no hard training 48 hours prior; indoor trainer recommended; a power meter or smart trainer. WARM-UP: 5–10 min easy; 3 x 1 min at low resistance and high turnover with 1 min rest between; 3 min easy; 3 min at 9 out of 10; 6–8 min easy. TEST: press lap and ride 20 minutes at your best even effort; press lap at the end. COOL-DOWN: 5–10 min easy. RESULT: your FTP is the 20-minute average power x 0.95 (the book\'s rule); the app reads the lap and sets it.',
      duration: 60,
      // p212, step for step (2026-09-02): easy · 3 × 1 min high turnover / 1 min rest · 3 min easy ·
      // 3 min at 9/10 · 6–8 min easy · 20 min best effort · easy. The learner reads the 20-min lap × 0.95.
      steps_preset: [
        'warmup_bike_quality_8min_fastpedal',
        'bike_race_prep_3x60s',
        'bike_recovery_3min_Z1',
        'bike_vo2_1x3min_R0min',
        'bike_recovery_7min_Z1',
        'bike_ftp_test_20min',
        'cooldown_bike_easy_8min'
      ],
      workout_status: 'planned',
      tags: ['ftp_test', 'baseline_establishment', 'key_workout']
    });
    
    setShowFtpDatePicker(false);
    await checkScheduledFtpTest(); // Refresh the state
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

  // Auto-open leftmost sport with data, or Run as default
useEffect(() => {
    if (!loading && activeSport === null) {
      const sportOrder = ['running', 'cycling', 'swimming', 'strength'];
      const firstWithData = sportOrder.find(s => data.disciplines.includes(s));
      setActiveSport(firstWithData || 'running');
    }
  }, [loading, data.disciplines]);

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

const handleSave = async () => {
  try {
    setSaving(true);
    setSaveMessage('');
    // D-200: stamp when the swim threshold CHANGES so the State re-test nudge can measure "weeks since update".
    let dataToSave: any = data;
    try {
      const prevSwim = JSON.parse(originalData || '{}')?.performanceNumbers?.swimPace100;
      const curSwim = (data as any)?.performanceNumbers?.swimPace100;
      if (curSwim && curSwim !== prevSwim) {
        dataToSave = { ...data, performanceNumbers: { ...(data as any).performanceNumbers, swimPace100_updated_at: new Date().toISOString() } };
        setData(dataToSave);
      }
    } catch { void 0; }
    await saveUserBaselines(dataToSave as any);

    // Persist manual HR zone overrides to configured_hr_zones
    const hasManualOverrides = manualRunMaxHR || manualRunLTHR || manualRideMaxHR || manualRideLTHR;
    if (hasManualOverrides) {
      const userId = getStoredUserId();
      if (userId) {
        const restingHR = customRestingHR || garminRestingHR || 60;

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
          performance_numbers: data.performanceNumbers,
          configured_hr_zones: { manual_run_lthr: manualRunLTHR, manual_ride_lthr: manualRideLTHR },
        } as never;
        const effectiveRunLTHR = manualRunLTHR || resolveCurrentLthr(baselinesForHr, { sport: 'run' }).bpm || null;
        const effectiveRunMax = manualRunMaxHR || resolveCurrentMaxHr(
          { learned_fitness: learnedFitness } as never, { sport: 'run', allowAgeEstimate: false },
        ).bpm || null;
        const effectiveRideLTHR = manualRideLTHR || resolveCurrentLthr(baselinesForHr, { sport: 'ride' }).bpm || null;
        const effectiveRideMax = manualRideMaxHR || resolveCurrentMaxHr(
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
          source: 'manual',
          custom_zones: true,
          updated_at: new Date().toISOString(),
          manual_run_max_hr: manualRunMaxHR,
          manual_run_lthr: manualRunLTHR,
          manual_ride_max_hr: manualRideMaxHR,
          manual_ride_lthr: manualRideLTHR,
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
    setInitialManualHR(JSON.stringify({ manualRunMaxHR, manualRunLTHR, manualRideMaxHR, manualRideLTHR }));
    // ⛔ A SAVED NUMBER RE-PRICES THE PLAN (Michael 2026-09-02). If a pace anchor, FTP, the 5K or a manual
    // threshold HR changed, every unstarted run/ride row is re-priced through the checkpoint function's
    // re-price mode — the same per-row rebuild the six-week checkpoint uses. Strength rows are untouched:
    // a block's weights come from its week-1 test. No plan → the call returns no_plan and nothing happens.
    let repriceNote = '';
    try {
      const prevPn = (JSON.parse(originalData || '{}')?.performanceNumbers ?? {}) as Record<string, unknown>;
      const nextPn = ((dataToSave as any)?.performanceNumbers ?? {}) as Record<string, unknown>;
      const WATCH = ['threshold_pace_min_per_mi', 'threshold_pace_source', 'ftp', 'ftp_source', 'fiveK', 'fiveK_source', 'threshold_heart_rate', 'lthr_source'];
      const changed = WATCH.some((k) => String(prevPn[k] ?? '') !== String(nextPn[k] ?? '')) || !!(manualRunLTHR || manualRideLTHR);
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
    setSaveMessage(`Saved!${repriceNote}`);
    setLastUpdated(new Date().toISOString());
    setTimeout(() => setSaveMessage(''), 2000);
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
const disciplineOptions = [
    { id: 'running', name: 'Run', icon: Activity, color: SPORT_COLORS.run },
    { id: 'cycling', name: 'Cycle', icon: Bike, color: SPORT_COLORS.cycling },
    { id: 'swimming', name: 'Swim', icon: Waves, color: SPORT_COLORS.swim },
    { id: 'strength', name: 'Strength', icon: Dumbbell, color: SPORT_COLORS.strength }
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
    <h2 className="text-2xl font-bold text-white pb-2">Training Baselines</h2>
    
    {/* Description */}
    <div className="text-center mb-6">
      <p className="text-white/50 text-sm">Your performance data for personalized training plans</p>
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
                <div className="space-y-5">
                  {/* Basic Information */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                    <h2 className="text-sm font-semibold text-white/90 mb-3 tracking-wide">Basic Information</h2>
                    
                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60 whitespace-nowrap">Birthday</label>
                        <input
                          type="date"
                          value={data.birthday || ''}
                          onChange={(e) => setData(prev => ({ ...prev, birthday: e.target.value }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Gender</label>
                        <select
                          value={data.gender || ''}
                          onChange={(e) => setData(prev => ({ ...prev, gender: e.target.value as any }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="" className="bg-[#1a1a1a]">-</option>
                          <option value="male" className="bg-[#1a1a1a]">M</option>
                          <option value="female" className="bg-[#1a1a1a]">F</option>
                          <option value="prefer_not_to_say" className="bg-[#1a1a1a]">-</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Units</label>
                        <select
                          value={data.units || 'imperial'}
                          onChange={(e) => setData(prev => ({ ...prev, units: e.target.value as any }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="imperial" className="bg-[#1a1a1a]">lbs</option>
                          <option value="metric" className="bg-[#1a1a1a]">kg</option>
                        </select>
                        </div>
                      {/*
                        Lifting experience — stage 5 §8a. Sits in Basic Information, not the Strength
                        sport panel, because that panel only renders once the athlete taps the sport
                        tile and this has to be settable before a first block. Lifting is in every
                        plan, so it is never sport-gated.
                      */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60 whitespace-nowrap">Lifting experience</label>
                        <select
                          value={data.performanceNumbers?.liftingExperience || ''}
                          onChange={(e) => setData(prev => ({
                            ...prev,
                            performanceNumbers: {
                              ...prev.performanceNumbers,
                              liftingExperience: (e.target.value || undefined) as any
                            }
                          }))}
                          className="h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          <option value="" className="bg-[#1a1a1a]">-</option>
                          <option value="new" className="bg-[#1a1a1a]">new to lifting (under a year)</option>
                          <option value="couple_years" className="bg-[#1a1a1a]">a couple of years</option>
                          <option value="many_years" className="bg-[#1a1a1a]">many years</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Ht</label>
                        <input
                          type="number"
                          value={data.height || ''}
                          onChange={(e) => setData(prev => ({ ...prev, height: parseInt(e.target.value) || undefined }))}
                          placeholder="70"
                          className="w-12 h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <span className="text-xs text-white/60">{data.units === 'metric' ? 'cm' : 'in'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-white/60">Wt</label>
                        <input
                          type="number"
                          value={data.weight || ''}
                          onChange={(e) => setData(prev => ({ ...prev, weight: parseInt(e.target.value) || undefined }))}
                          placeholder="160"
                          className="w-14 h-8 px-2 text-xs bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <span className="text-xs text-white/60">{data.units === 'metric' ? 'kg' : 'lb'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Disciplines */}
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]">
                    <div className="mb-3">
                      <h2 className="text-sm font-semibold text-white/90 tracking-wide">Your Sports</h2>
                      <p className="text-xs text-white/50 mt-0.5">Tap to add performance baselines</p>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {disciplineOptions.map((discipline) => {
                        const Icon = discipline.icon;
                        const isActive = activeSport === discipline.id;
                        const hasBaseline = hasBaselineEntered(discipline.id);
                        return (
                          <button
                            key={discipline.id}
                            onClick={() => toggleDiscipline(discipline.id)}
                            className={`relative flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-center transition-all duration-300 backdrop-blur-lg ${
                              isActive
                                ? 'border-transparent'
                                : hasBaseline
                                  ? 'border-white/20 bg-white/[0.06] hover:bg-white/[0.10]'
                                  : 'border-white/15 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.08]'
                            }`}
                            style={{ 
                              fontFamily: 'Inter, sans-serif',
                              ...(isActive ? {
                                backgroundColor: `${discipline.color}20`,
                                borderColor: discipline.color,
                                borderWidth: '1.5px',
                                boxShadow: `0 0 20px ${discipline.color}30, inset 0 0 20px ${discipline.color}10`
                              } : {})
                            }}
                          >
                            {/* Q-070: sport-chip ✓ removed entirely (feature dropped — more trouble than worth). */}
                            <Icon 
                              className="h-4 w-4 transition-colors duration-300" 
                              style={{ color: isActive || hasBaseline ? discipline.color : 'rgba(255,255,255,0.5)' }}
                            />
                            <span 
                              className="text-xs font-medium transition-colors duration-300"
                              style={{ color: isActive ? discipline.color : hasBaseline ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}
                            >
                              {discipline.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-discipline performance numbers */}
                  {activeSport && (
                    <div 
                      className="p-4 rounded-2xl backdrop-blur-xl border transition-all duration-300"
                      style={{
                        backgroundColor: `${getActiveSportColor()}08`,
                        borderColor: `${getActiveSportColor()}30`,
                        boxShadow: `0 4px 30px ${getActiveSportColor()}10`
                      }}
                    >
                      <h2 
                        className="text-sm font-semibold mb-4 tracking-wide"
                        style={{ color: getActiveSportColor() }}
                      >
                        Performance Numbers
                      </h2>

                      {/* Running */}
                      {activeSport === 'running' && (() => {
                        const easyLearned = learnedFitness?.run_easy_pace_sec_per_km;
                        /**
                         * ⛔ THE THRESHOLD CARD READS THE RESOLVER NOW, NOT THE RAW LEARNED METRIC
                         * (2026-08-19). It used to render `learned_fitness.run_threshold_pace_sec_per_km`
                         * directly and only when that value existed, which broke in three ways at once:
                         *
                         *   · it showed a number the ENGINE might not be using (the same lie the easy-pace
                         *     card above was fixed for — a number on screen that is not the number in use);
                         *   · when the learner abstained the whole card VANISHED, so an athlete with a
                         *     threshold pace derived from their easy runs saw nothing at all and never
                         *     learned a derivation was standing in;
                         *   · and "not enough data" was expressed as SILENCE, which is not the same as
                         *     saying it. Michael only found the original bug because he went looking.
                         */
                        const resolvedThr = resolveCurrentRunThresholdPace({
                          learned_fitness: learnedFitness,
                          performance_numbers: data.performanceNumbers,
                          effort_paces: data.effort_paces,
                        } as any);
                        const thrBasis = describeThresholdBasis(resolvedThr);
                        const thrLearned = learnedFitness?.run_threshold_pace_sec_per_km;
                        const hasEasyLearned = easyLearned?.value != null && Number.isFinite(Number(easyLearned.value)) && Number(easyLearned.value) > 0;
                        const hasThrLearned = thrLearned?.value != null && Number.isFinite(Number(thrLearned.value)) && Number(thrLearned.value) > 0;
                        const nudge = arcFiveKNudge;
                        const nudgeKey = nudge ? fiveKNudgeDismissKey(nudge) : '';
                        const showFiveKNudge = !!nudge?.should_prompt && nudgeKey && !dismissedFiveKMap[nudgeKey];
                        return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4" style={{ color: SPORT_COLORS.run }} />
                            <h3 className="text-sm font-medium text-white/90">Running</h3>
                          </div>
                          {/* ⛔ A GRID, NOT `flex-wrap` (2026-08-20). Four blocks of different widths in
                              a wrapping flex row left ragged columns and dead space — "a little jammed".
                              Each fact gets one cell and they line up. */}
                          {/* ⛔ STACKED, EQUAL WEIGHT (Michael 2026-09-02): three numbers, three identical rows. */}
                          <div className="flex flex-col gap-4 mt-2">
                            {/**
                              * ⛔ ONE EASY-PACE BLOCK (2026-08-20). There were TWO — a display card showing
                              * the resolved value, and a separate "Easy pace (manual)" input with the
                              * picker under it. Same fact, twice, in one card, with a conditional so the
                              * display half vanished when nothing was learned and the manual half retitled
                              * itself "— in use" to compensate. It read as jammed because it was.
                              *
                              * Now: the resolved value and its receipt on top, the number you can type
                              * under it, and the picker only when there are genuinely two to choose
                              * between. Both values stay visible and the one IN USE is named (Law 3) —
                              * which is what the two-block version was protecting and is preserved here.
                              */}
                            {/**
                              * ⛔ EASY IS NOT A NUMBER YOU SET (Michael 2026-09-02, D-462). Easy days are a heart-rate
                              * zone off threshold HR (the Heart Rate Zones card below); the pace shown here is a
                              * REFERENCE band derived from threshold pace (resolveCurrentRunEasyPace is now threshold
                              * × 1.19, nothing else). The typed easy pace field and the auto / my number switch that
                              * sat here are gone — `easyPace` / `easy_pace_source` are no longer read by anything.
                              */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm text-white/75 font-medium">Easy days</label>
                              {(() => {
                                const resolvedEasy = resolveCurrentRunEasyPace({
                                  learned_fitness: learnedFitness,
                                  performance_numbers: data.performanceNumbers,
                                } as never);
                                return (
                                  <div className="rounded-xl border px-3 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)' }}>
                                    <div className="text-[13px] text-white/85">Run by heart rate — zone 2, conversational.</div>
                                    <div className="text-[11px] text-white/55 leading-snug mt-0.5">
                                      {resolvedEasy.sec_per_mi != null
                                        ? `Reference pace about ${formatPaceSecPerMi(resolvedEasy.sec_per_mi)}, from your threshold pace. Hot days read high — go by conversation.`
                                        : 'A reference pace appears once a threshold pace is on file.'}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm text-white/75 font-medium">
                                Threshold pace{' '}
                                <button type="button" onClick={() => setThresholdInfoOpen((o) => !o)} aria-label="What is threshold pace?" className="text-white/45 text-[11px] bg-transparent border-none p-0 cursor-pointer">{thresholdInfoOpen ? '▾' : 'ⓘ'}</button>
                              </label>
                              {thresholdInfoOpen && (
                                <p className="text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">The fastest pace you could hold for about an hour. Hard sessions are set from it.</p>
                              )}
                              {/**
                                * ⛔ SAME ROW AS EASY PACE AND STRENGTH (Michael 2026-09-02: "add my number to
                                * threshold"). The resolver already honoured a typed `threshold_pace_min_per_mi`
                                * and a `threshold_pace_source` choice; only the input and the switch were missing.
                                * The threshold-test offer keeps its place under the row.
                                */}
                              {(() => {
                                const mine = (data.performanceNumbers as any)?.threshold_pace_source === 'manual';
                                const typed = (data.performanceNumbers as any)?.threshold_pace_min_per_mi || '';
                                const measuredLines = thrBasis.state === 'measured'
                                  ? [learnedBasisLine(thrLearned, 'run'), learnedAsOfLine(thrLearned)].filter(Boolean).join(' ')
                                  : '';
                                const status = mine
                                  ? 'your number. Your runs don\'t change it.'
                                  : thrBasis.state === 'stated'
                                    ? 'auto. Your typed number, until your runs measure one.'
                                    : `auto. ${thrBasis.label}${thrBasis.note ? ` ${thrBasis.note}` : ''}${measuredLines ? ` ${measuredLines}` : ''}`;
                                const setMine = () => setData(prev => {
                                  const pn: any = { ...prev.performanceNumbers, threshold_pace_source: 'manual' };
                                  if (!pn.threshold_pace_min_per_mi && resolvedThr.sec_per_mi) pn.threshold_pace_min_per_mi = formatPaceSecPerMi(resolvedThr.sec_per_mi).replace('/mi', '');
                                  return { ...prev, performanceNumbers: pn };
                                });
                                const setAuto = () => setData(prev => ({
                                  ...prev,
                                  performanceNumbers: { ...prev.performanceNumbers, threshold_pace_source: 'learned' },
                                }));
                                return (
                                  <div
                                    className="rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: mine ? `${SPORT_COLORS.run}55` : 'rgba(255,255,255,0.15)' }}
                                  >
                                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                      <span className="text-lg font-semibold tabular-nums text-white">
                                        {thrBasis.showNumber ? formatPaceSecPerMi(resolvedThr.sec_per_mi) : '—'}
                                      </span>
                                    </div>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      aria-label="Threshold pace, my number, minutes per mile"
                                      value={typed}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, threshold_pace_min_per_mi: e.target.value },
                                      }))}
                                      placeholder={hasThrLearned ? formatPace(thrLearned.value) : '9:30'}
                                      className="w-[4.5rem] h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-center shrink-0"
                                      style={{ fontFamily: 'Inter, sans-serif' }}
                                    />
                                    <AutoMinePill mine={mine} onAuto={setAuto} onMine={setMine} color={SPORT_COLORS.run} label="Threshold pace" />
                                    <div className="basis-full text-[11px] text-white/55 leading-snug">{status}</div>
                                    <div className="basis-full">
                                      {thrBasis.state !== 'measured' && thrBasis.state !== 'stated' && (
                                        <div className="mt-2 pt-2 border-t border-white/[0.06]">
                                          {scheduledRunTest ? (
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[11px] text-white/55">
                                                Threshold test on {new Date(scheduledRunTest.date + 'T12:00:00').toLocaleDateString()}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => void deleteRunTest()}
                                                className="text-[12px] text-white/60 hover:text-white/70 underline underline-offset-2"
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          ) : showRunTestDatePicker ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <input
                                                type="date"
                                                value={runTestDate}
                                                min={new Date().toISOString().split('T')[0]}
                                                onChange={(e) => setRunTestDate(e.target.value)}
                                                className="h-8 px-2 text-[11px] bg-white/[0.06] border border-white/15 rounded-lg text-white"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => void scheduleRunTest()}
                                                className="h-8 px-3 text-[11px] font-medium rounded-lg text-white"
                                                style={{ backgroundColor: `${SPORT_COLORS.run}26`, border: `1px solid ${SPORT_COLORS.run}80` }}
                                              >
                                                Schedule
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setShowRunTestDatePicker(false)}
                                                className="h-8 px-2 text-[11px] text-white/45 hover:text-white/70"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => setShowRunTestDatePicker(true)}
                                              className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-white/80 hover:text-white bg-white/[0.05] border border-white/15 text-left"
                                            >
                                              Schedule a threshold test
                                              <span className="block text-[11px] text-white/55 mt-0.5">12 min — measures it properly</span>
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            {/* ⛔ THE 5K SITS LAST, AND THAT IS THE INFORMATION ORDER (2026-08-20).
                                Three cells in a two-column grid left an orphan row and a tall empty
                                space beneath a small input. Pairing the two TALL cards puts them side
                                by side and drops the 5K underneath — which is also the right reading
                                order: the paces you train by first, the seed they came from last. */}
                            {/**
                              * ⛔ THRESHOLD HEART RATE, THE SECOND OF THE TWO NUMBERS A RUNNER NEEDS (Michael 2026-09-02,
                              * from his own screen: the LTHR box was buried in the Heart Rate Zones card as "est. from max",
                              * a formula shown as if it were his, with zones built on it). Same row as threshold pace:
                              * the number in use, one input, auto / my number, the zones printed underneath from it.
                              * Storage unchanged: `configured_hr_zones.manual_run_lthr` (typed) + `performance_numbers.lthr_source`
                              * (choice) — what `resolveCurrentLthr` already reads. An estimate never shows as the number in use.
                              */}
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm text-white/75 font-medium">
                                Threshold heart rate{' '}
                                <button type="button" onClick={() => setLthrInfoOpen((o) => !o)} aria-label="What is threshold heart rate?" className="text-white/45 text-[11px] bg-transparent border-none p-0 cursor-pointer">{lthrInfoOpen ? '▾' : 'ⓘ'}</button>
                              </label>
                              {lthrInfoOpen && (
                                <p className="text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">The heart rate you can hold for about an hour. Easy days are a zone below it; hard days sit near it.</p>
                              )}
                              {(() => {
                                const resolved = resolveCurrentLthr({
                                  learned_fitness: learnedFitness,
                                  performance_numbers: data.performanceNumbers,
                                  configured_hr_zones: { manual_run_lthr: manualRunLTHR },
                                } as never, { sport: 'run' });
                                const mine = (data.performanceNumbers as any)?.lthr_source === 'manual';
                                const learnedRaw = learnedFitness?.run_threshold_hr;
                                const learnedMeasured = learnedRaw && learnedRaw.is_estimate !== true && Number(learnedRaw.value) > 0 ? Number(learnedRaw.value) : null;
                                const status = mine
                                  ? 'your number. Your runs don\'t change it.'
                                  : learnedMeasured != null && resolved.bpm != null
                                    ? `auto. Measured from your hard runs${learnedRaw?.sample_count ? ` (${learnedRaw.sample_count} runs)` : ''}.`
                                    : manualRunLTHR != null
                                      ? 'auto. Your typed number, until your runs measure one.'
                                      : 'auto. Nothing measured yet — easy running can\'t measure it. Enter it, or run hard once.';
                                const setMine = () => {
                                  if (manualRunLTHR == null && resolved.bpm != null) setManualRunLTHR(Math.round(resolved.bpm));
                                  setData((prev) => ({ ...prev, performanceNumbers: { ...prev.performanceNumbers, lthr_source: 'manual' } }));
                                };
                                const setAuto = () => setData((prev) => ({ ...prev, performanceNumbers: { ...prev.performanceNumbers, lthr_source: 'learned' } }));
                                const zones = resolved.bpm != null ? frielRunZones(Math.round(resolved.bpm)) : [];
                                return (
                                  <>
                                    <div
                                      className="rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: mine ? `${SPORT_COLORS.run}55` : 'rgba(255,255,255,0.15)' }}
                                    >
                                      <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                        <span className="text-lg font-semibold tabular-nums text-white">{resolved.bpm != null ? Math.round(resolved.bpm) : '—'}</span>
                                        <span className="text-[11px] text-white/50">bpm</span>
                                      </div>
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        aria-label="Threshold heart rate, my number, bpm"
                                        value={manualRunLTHR ?? ''}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value);
                                          setManualRunLTHR(Number.isFinite(v) && v > 0 ? v : null);
                                          setData((prev) => ({ ...prev, performanceNumbers: { ...prev.performanceNumbers, lthr_source: Number.isFinite(v) && v > 0 ? 'manual' : (prev.performanceNumbers as any)?.lthr_source } }));
                                        }}
                                        placeholder={learnedMeasured != null ? String(Math.round(learnedMeasured)) : '165'}
                                        className="w-[4.5rem] h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-center shrink-0"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                                      <AutoMinePill mine={mine} onAuto={setAuto} onMine={setMine} color={SPORT_COLORS.run} label="Threshold heart rate" />
                                      <div className="basis-full text-[11px] text-white/55 leading-snug">{status}</div>
                                    </div>
                                    {zones.length > 0 && (
                                      <div className="mt-1 space-y-0.5">
                                        {zones.map((z) => (
                                          <div key={z.name} className="flex items-baseline justify-between text-[12px] px-1">
                                            <span className="text-white/60">{z.name} {z.label}</span>
                                            <span className="tabular-nums text-white/75">{z.min}–{z.max} bpm</span>
                                          </div>
                                        ))}
                                        <div className="text-[11px] text-white/40 px-1">zones from your threshold heart rate (Friel)</div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm text-white/75 font-medium">5K Time</label>
                              {/**
                                * ⛔ SAME ROW (Michael 2026-09-02: "add my number to 5K time"). There is no learned
                                * 5K in the resolver; the training-side number is the Arc's implied 5K (the nudge
                                * that used to sit here as Yes / No). `auto` = take what your runs suggest and keep
                                * taking it; `my number` = the race clock you typed. `fiveK_source` records the
                                * choice; `fiveK` stays the value every downstream pace derives from.
                                */}
                              {(() => {
                                const implied = nudge?.implied_5k_label ?? null;
                                const mine = (data.performanceNumbers as any)?.fiveK_source !== 'learned';
                                const typed = data.performanceNumbers?.fiveK || '';
                                const shown = !mine && implied ? implied : (typed || null);
                                const status = mine
                                  ? `your number. Your runs don\'t change it.${implied && nudge?.should_prompt ? ` Your runs suggest ~${implied}.` : ''}`
                                  : implied
                                    ? `auto. From your runs (~${implied}).`
                                    : 'auto. Your runs haven\'t suggested one yet.';
                                const setMine = () => setData(prev => ({
                                  ...prev,
                                  performanceNumbers: { ...prev.performanceNumbers, fiveK_source: 'manual' },
                                }));
                                const setAuto = () => setData(prev => {
                                  const pn: any = { ...prev.performanceNumbers, fiveK_source: 'learned' };
                                  if (implied) pn.fiveK = implied; // the number every derived pace reads follows the choice
                                  return { ...prev, performanceNumbers: pn };
                                });
                                return (
                                  <div
                                    className="rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: mine ? `${SPORT_COLORS.run}55` : 'rgba(255,255,255,0.15)' }}
                                  >
                                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                      <span className="text-lg font-semibold tabular-nums text-white">{shown ?? '—'}</span>
                                    </div>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      aria-label="5K time, my number"
                                      value={typed}
                                      onChange={(e) => setData(prev => ({
                                        ...prev,
                                        performanceNumbers: { ...prev.performanceNumbers, fiveK: e.target.value, fiveK_source: 'manual' },
                                      }))}
                                      placeholder={implied ?? '25:00'}
                                      className="w-[4.5rem] h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-center shrink-0"
                                      style={{ fontFamily: 'Inter, sans-serif' }}
                                    />
                                    <AutoMinePill mine={mine} onAuto={setAuto} onMine={setMine} color={SPORT_COLORS.run} label="5K time" />
                                    <div className="basis-full text-[11px] text-white/55 leading-snug">{status}</div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                        );
                      })()}

                      {/* Cycling */}
                      {activeSport === 'cycling' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Bike className="h-4 w-4" style={{ color: SPORT_COLORS.cycling }} />
                            <h3 className="text-sm font-medium text-white/90">Cycling</h3>
                          </div>
                          <div className="space-y-3">
                            <label className="text-sm text-white/75 font-medium">
                              FTP{' '}
                              <button type="button" onClick={() => setFtpInfoOpen((o) => !o)} aria-label="What is FTP?" className="text-white/45 text-[11px] bg-transparent border-none p-0 cursor-pointer">{ftpInfoOpen ? '▾' : 'ⓘ'}</button>
                            </label>
                            {ftpInfoOpen && (
                              <p className="text-[12px] text-white/55 leading-snug max-w-[min(100%,340px)]">The most power you could hold for about an hour. Hard rides and your power zones are set from it.</p>
                            )}
                            {/**
                              * ⛔ THE SAME ROW AS RUN AND STRENGTH (Michael 2026-09-02, "go"). FTP had this switch
                              * first (Q-240: typing is choosing; `ftp_source: 'manual'` = my number, absent/'learned'
                              * = auto) — only the clothes change. The resolver (`resolveCurrentFtp`) is untouched and
                              * still what the zones below and the plan targets read.
                              */}
                            {(() => {
                              const manualFtp = data.performanceNumbers?.ftp;
                              const learnedFtp = learnedFitness?.ride_ftp_estimated?.value;
                              const resolved = resolveCurrentFtp({ learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as any);
                              const proposal = pendingFtpProposal({ learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as any);
                              const mine = (data.performanceNumbers as any)?.ftp_source === 'manual';
                              const status = mine
                                ? 'your number. Your rides don\'t change it.'
                                : learnedFtp
                                  ? 'auto. From your rides — your power curve and your heart rate at threshold. Sets your power zones and the targets in your plan.'
                                  : manualFtp
                                    ? 'auto. Your typed number, until your rides measure one.'
                                    : 'auto. Nothing on file yet.';
                              const setMine = () => setData(prev => {
                                const pn: any = { ...prev.performanceNumbers, ftp_source: 'manual' };
                                if (!(pn.ftp > 0) && resolved.value) pn.ftp = Math.round(Number(resolved.value));
                                return { ...prev, performanceNumbers: pn };
                              });
                              const setAuto = () => setData(prev => {
                                const pn: any = { ...prev.performanceNumbers };
                                delete pn.ftp_source;
                                return { ...prev, performanceNumbers: pn };
                              });
                              return (
                                <div
                                  className="rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: mine ? `${SPORT_COLORS.cycling}55` : 'rgba(255,255,255,0.15)' }}
                                >
                                  <div className="flex-1 min-w-0 flex items-baseline gap-1.5 flex-wrap">
                                    <span className="text-lg font-semibold tabular-nums text-white">{resolved.value != null ? Math.round(Number(resolved.value)) : '—'}</span>
                                    <span className="text-[11px] text-white/50">watts</span>
                                    {proposal && !mine && (
                                      <>
                                        <span className="text-[11px] text-white/50">· measured {Math.round(proposal.measured)}</span>
                                        <button
                                          type="button"
                                          onClick={acceptMeasuredFtp}
                                          disabled={ftpAccepting}
                                          aria-label={`Use the measured FTP, ${Math.round(proposal.measured)} watts`}
                                          // eslint-disable-next-line efforts/consistent-button-shape -- same pill as AutoMinePill beside it
                                          className="text-[11px] px-2.5 h-7 leading-7 rounded-full border bg-transparent cursor-pointer disabled:opacity-50 shrink-0"
                                          style={{ borderColor: `${SPORT_COLORS.cycling}88`, color: SPORT_COLORS.cycling }}
                                        >
                                          {ftpAccepting ? 'working…' : 'use it'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  <input
                                    id="ftp-input"
                                    ref={ftpInputRef}
                                    type="number"
                                    inputMode="numeric"
                                    aria-label="FTP, my number, watts"
                                    value={manualFtp ?? ''}
                                    onChange={(e) => setData(prev => {
                                      const typed = parseInt(e.target.value);
                                      const next: any = { ...prev.performanceNumbers };
                                      if (Number.isFinite(typed) && typed > 0) {
                                        next.ftp = typed;
                                        next.ftp_source = 'manual'; // typing is choosing (Q-240)
                                      } else {
                                        delete next.ftp;
                                        if (next.ftp_source === 'manual') delete next.ftp_source;
                                      }
                                      return { ...prev, performanceNumbers: next };
                                    })}
                                    placeholder={resolved.value ? String(Math.round(Number(resolved.value))) : '250'}
                                    className="w-[4.5rem] h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 text-center shrink-0"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                  />
                                  <AutoMinePill mine={mine} onAuto={setAuto} onMine={setMine} color={SPORT_COLORS.cycling} label="FTP" />
                                  <div className="basis-full text-[11px] text-white/55 leading-snug">{status} Sets your power zones and the targets in your plan.{ftpAcceptNote ? ` ${ftpAcceptNote}` : ''}</div>
                                </div>
                              );
                            })()}

                            {/* Power Zones from the RESOLVED FTP (learned-first) — the same source the app uses, so the
                                zones on Baselines match the analyzer/coach instead of being manual-first (FTP fracture #2). */}
                            {resolveCurrentFtp({ learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as any).value && (
                              <div className="space-y-1.5">
                                <div className="text-xs text-white/50 font-medium">Power Zones</div>
                                <div className="space-y-1">
                                  {getPowerZones(resolveCurrentFtp({ learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as any).value).map((zone) => (
                                    <div 
                                      key={zone.name}
                                      className="flex items-center justify-between px-2 py-1 rounded text-xs"
                                      style={{ backgroundColor: `${zone.color}15` }}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-2 h-2 rounded-full"
                                          style={{ backgroundColor: zone.color }}
                                        />
                                        <span className="text-white/70">{zone.name}</span>
                                      </div>
                                      <span className="text-white/50 font-mono">{zone.range}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* FTP Test Scheduling */}
                            <div className="pt-2 border-t border-white/10">
                              {scheduledFtpTest && !showFtpDatePicker ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-emerald-400">
                                    FTP Test: {new Date(scheduledFtpTest.date + 'T12:00:00').toLocaleDateString()}
                                  </span>
                                  <button
                                    onClick={rescheduleFtpTest}
                                    className="text-xs px-2 py-1 rounded bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    onClick={deleteFtpTest}
                                    className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ) : !showFtpDatePicker ? (
                                <button 
                                  onClick={() => setShowFtpDatePicker(true)}
                                  className="text-xs px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 bg-white/10 text-white/80 border border-white/20 hover:bg-white/20 transition-colors"
                                >
                                  <Calendar className="h-3.5 w-3.5" />
                                  Schedule FTP Test
                                </button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="date"
                                    value={ftpTestDate}
                                    onChange={(e) => setFtpTestDate(e.target.value)}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="text-xs px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white"
                                  />
                                  <button
                                    onClick={async () => {
                                      if (scheduledFtpTest) {
                                        await deleteFtpTest();
                                      }
                                      await scheduleFtpTest();
                                    }}
                                    className="text-xs px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                                  >
                                    {scheduledFtpTest ? 'Update' : 'Add'}
                                  </button>
                                  <button
                                    onClick={() => setShowFtpDatePicker(false)}
                                    className="text-xs px-2 py-1.5 text-white/50 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Swimming */}
                      {activeSport === 'swimming' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Waves className="h-4 w-4" style={{ color: SPORT_COLORS.swim }} />
                            <h3 className="text-sm font-medium text-white/90">Swimming</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-white/60">Threshold 100 Pace</label>
                            <button
                              type="button"
                              onClick={() => setShowSwimTest((v) => !v)}
                              aria-label="How to find your threshold pace"
                              className="text-white/40 hover:text-white/70 transition-colors"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                                      <input
                                        type="text"
                                        value={data.performanceNumbers?.swimPace100 || ''}
                                        onChange={(e) => setData(prev => ({
                                          ...prev,
                                          performanceNumbers: {
                                            ...prev.performanceNumbers,
                                            swimPace100: e.target.value
                                          }
                                        }))}
                              placeholder="1:45"
                              className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                                      />
                            <span className="text-xs text-white/60">mm:ss</span>
                                    </div>
                          {/* D-199 C1: seed microcopy — plain, science-accurate threshold framing (~20-30 min
                              sustainable; longer than the old "hard 400" cue which biased fast). No "CSS"/Z-names. */}
                          <p className="text-[12px] text-white/60 -mt-1 leading-snug">Your hard, steady 100 pace — the effort you could hold for a strong continuous swim of about 20–30 minutes, not a sprint and not your easy cruise. Your easy / moderate / hard zones are all built from this one number.</p>
                          {/* D-199: (i) test protocol — how to FIND the threshold (the benchmark). Tappable (iOS:
                              no hover). The 400/200 CSS test, the formula, a worked example, plus a no-test fallback. */}
                          {showSwimTest && (
                            <div className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 -mt-0.5 space-y-1.5">
                              <p className="text-[11px] text-white/70 font-medium">How to find your threshold pace</p>
                              <p className="text-[12px] text-white/70 leading-snug">Best way is a quick test. Warm up, then swim an all-out <span className="text-white/70">400</span>, rest fully, then an all-out <span className="text-white/70">200</span> — each as fast as you can hold the whole way.</p>
                              <p className="text-[12px] text-white/70 leading-snug">Threshold 100 pace = (400 time − 200 time) ÷ 2.<br />Example: 400 in 6:40 and 200 in 3:00 → (400s − 180s) ÷ 2 = <span className="text-white/70">1:50 / 100</span>.</p>
                              <p className="text-[12px] text-white/60 leading-snug">No test handy? Enter your best steady pace for a continuous 20–30 minute swim, and update it after you test.</p>
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-xs text-white/60">Equipment</label>
                            <div className="grid grid-cols-2 gap-2">
                              {swimmingEquipmentOptions.map((option) => {
                                const isSelected = (data.equipment.swimming || []).includes(option);
                                const hint = swimmingEquipmentHints[option];
                                return (
                                  <button
                                    key={option}
                                    onClick={() => toggleEquipment('swimming', option)}
                                    title={hint}
                                    className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-all duration-300 ${
                                      isSelected
                                        ? 'text-white'
                                        : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                    }`}
                                    style={{
                                      fontFamily: 'Inter, sans-serif',
                                      ...(isSelected ? { borderColor: `${SPORT_COLORS.swim}80`, backgroundColor: `${SPORT_COLORS.swim}15` } : {}),
                                    }}
                                  >
                                    <span
                                      className="w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0"
                                      style={{
                                        borderColor: isSelected ? SPORT_COLORS.swim : 'rgba(255,255,255,0.25)',
                                        backgroundColor: isSelected ? SPORT_COLORS.swim : 'transparent',
                                      }}
                                    >
                                      {isSelected && <span className="text-[8px] text-black font-bold">✓</span>}
                                    </span>
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                                    </div>
                          {/* D-199 Layer C1: swim Pace Zones derived from the entered 100 pace (the internal
                              CSS anchor). PLAIN labels only — no "CSS"/Z-names (Decision A; the 2026-05-22
                              anti-regression rule holds). All 5 bands show their pace targets (a reference,
                              like the run HR-zone card); empty until a 100 pace is entered. The swim PROGRAM
                              only prescribing easy/moderate (no hard/threshold/speed) is a separate item, Q-071. */}
                          {(() => {
                            const bands = deriveSwimPaceBands(parsePaceToSeconds(data.performanceNumbers?.swimPace100) ?? 0);
                            return (
                              <div className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] mt-1">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-white/60">Pace Zones</div>
                                  {bands.length > 0 && (
                                    <div className="text-[11px] text-white/55">Threshold pace · {data.performanceNumbers?.swimPace100}/100yd</div>
                                  )}
                                </div>
                                {bands.length === 0 ? (
                                  <div className="text-xs text-white/40 mt-1">Enter your 100 pace above to see your swim pace zones.</div>
                                ) : (
                                  <div className="mt-2 rounded-lg overflow-hidden border border-white/10">
                                    {bands.map((b) => (
                                      <div
                                        key={b.label}
                                        className={`flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05] last:border-b-0 ${b.anchor ? 'bg-white/[0.06]' : ''}`}
                                      >
                                        <span className={`text-xs ${b.anchor ? 'font-semibold text-white/90' : 'font-medium text-white/80'}`}>
                                          {b.label}
                                        </span>
                                        <span className="text-xs font-mono text-white/60">{b.range} /100yd</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                                  </div>
                                )}

                      {/* Strength */}
                      {activeSport === 'strength' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Dumbbell className="h-4 w-4" style={{ color: SPORT_COLORS.strength }} />
                            <h3 className="text-sm font-medium text-white/90">Strength</h3>
                            <span className="text-xs text-white/50">1RM ({data.units === 'metric' ? 'kg' : 'lbs'})</span>
                          </div>
                          
                          
                          {/**
                            * ⛔ AUTO / LOCKED — the Garmin switch (Michael's ruling 2026-09-02, PLAN-strength-numbers).
                            *
                            * Each lift is either AUTO (default: the trusted number from your logged sets, the typed
                            * number only until logs exist) or LOCKED (you set it; learning never moves it until you
                            * switch back). The number shown big is the one the app USES — the same resolver the
                            * coach, the State card and a new plan's weights read (`capacity-resolver.ts`, locked >
                            * trusted-learned > typed). What the input edits FOLLOWS the switch: in auto it edits the
                            * typed seed, in locked it edits the locked value. Tapping "locked" seeds the lock with the
                            * number in use; tapping "auto" removes the lock and keeps the typed seed.
                            * ⚠️ `locked_baselines` is saved with the rest of the row on Save (AppContext.saveUserBaselines).
                            */}
                          <div className="space-y-2">
                            {STRENGTH_LIFT_FIELDS.map((lift) => {
                              const typedRaw = (data.performanceNumbers as any)?.[lift.key];
                              const lockedMap = (data.locked_baselines ?? {}) as Record<string, number>;
                              const lockedRaw = lockedMap[lift.key];
                              const isLocked = lockedRaw != null || !!lockDrafts[lift.key];
                              const resolved = resolveStrengthCapacity({
                                key: lift.key,
                                typed: data.performanceNumbers as any,
                                learnedStrength1rms: learnedFitness?.strength_1rms ?? null,
                                locked: data.locked_baselines ?? null,
                                asOf: new Date().toISOString().slice(0, 10),
                              });
                              const learnedEntry = lift.learnedKey ? learnedFitness?.strength_1rms?.[lift.learnedKey] : null;
                              const learnedVal = Number(learnedEntry?.value);
                              const learnedSets = Number(learnedEntry?.sample_count);
                              const unit = lift.reps ? 'reps' : (data.units === 'metric' ? 'kg' : 'lb');
                              const status = isLocked
                                ? 'your number. Your lifts don\'t change it.'
                                : resolved.source === 'learned'
                                  ? `auto. From your lifts${Number.isFinite(learnedSets) && learnedSets > 0 ? ` (${learnedSets} sets)` : ''}.`
                                  : resolved.source === 'typed'
                                    ? (lift.reps
                                      ? 'auto. Your typed number.'
                                      : 'auto. Your typed number, until three logged sets pass the trust gate.')
                                    : 'auto. Nothing on file yet.';
                              const sug = resolved.suggestion;
                              const suggestion = sug && sug.divergencePct > 0
                                ? `Your lifts suggest ${Math.round(sug.computed)}.`
                                : null;
                              const inputValue = isLocked
                                ? (lockedRaw ?? '')
                                : (lift.reps ? (typedRaw ?? '') : (typedRaw || ''));
                              const placeholder = isLocked
                                ? (resolved.value != null ? String(resolved.value) : lift.placeholder)
                                : (Number.isFinite(learnedVal) && learnedVal > 0 ? String(Math.round(learnedVal)) : lift.placeholder);
                              const setLocked = () => {
                                const seed = resolved.value;
                                setLockDrafts((d) => ({ ...d, [lift.key]: true }));
                                if (seed != null) {
                                  setData((prev) => ({ ...prev, locked_baselines: { ...(prev.locked_baselines ?? {}), [lift.key]: seed } }));
                                }
                              };
                              const setAuto = () => {
                                setLockDrafts((d) => { const n = { ...d }; delete n[lift.key]; return n; });
                                setData((prev) => {
                                  const next = { ...(prev.locked_baselines ?? {}) } as Record<string, number>;
                                  delete next[lift.key];
                                  return { ...prev, locked_baselines: Object.keys(next).length ? next : null };
                                });
                              };
                              const onInput = (raw: string) => {
                                const n = raw === '' ? NaN : Math.max(0, parseInt(raw) || 0);
                                const valid = lift.reps ? Number.isFinite(n) : Number.isFinite(n) && n > 0;
                                if (isLocked) {
                                  setData((prev) => {
                                    const next = { ...(prev.locked_baselines ?? {}) } as Record<string, number>;
                                    if (valid) next[lift.key] = n; else delete next[lift.key];
                                    return { ...prev, locked_baselines: Object.keys(next).length ? next : null };
                                  });
                                } else {
                                  setData((prev) => ({
                                    ...prev,
                                    performanceNumbers: { ...prev.performanceNumbers, [lift.key]: valid ? n : undefined },
                                  }));
                                }
                              };
                              return (
                                <div
                                  key={lift.key}
                                  className="rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: isLocked ? `${SPORT_COLORS.strength}55` : 'rgba(255,255,255,0.15)' }}
                                >
                                  <div className="w-14 shrink-0 text-xs text-white/70">{lift.label}</div>
                                  <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                    <span className="text-lg font-semibold tabular-nums text-white">{resolved.value != null ? resolved.value : '—'}</span>
                                    <span className="text-[11px] text-white/50">{unit}</span>
                                  </div>
                                  <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    aria-label={`${lift.label} ${isLocked ? 'my number' : 'typed number'}`}
                                    value={inputValue}
                                    onChange={(e) => onInput(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-16 h-8 px-2 text-sm bg-white/[0.08] backdrop-blur-lg border border-white/25 rounded text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/40 shrink-0"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                  />
                                  <AutoMinePill mine={isLocked} onAuto={setAuto} onMine={setLocked} color={SPORT_COLORS.strength} label={lift.label} />
                                  {/* the receipt gets the whole width — squeezed beside the input it wrapped one word per line */}
                                  <div className="basis-full text-[11px] text-white/55 leading-snug pl-[4.25rem]">{status}{suggestion ? ` ${suggestion}` : ''}</div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Baseline Test Note — below the numbers (Michael, 2026-09-02) */}
                          <div 
                            className="p-3 rounded-xl backdrop-blur-lg border"
                            style={{ 
                              backgroundColor: `${SPORT_COLORS.strength}10`,
                              borderColor: `${SPORT_COLORS.strength}30`
                            }}
                          >
                            <p className="text-xs text-white/90 mb-2">
                              Don't know your numbers? Or want to retest?
                            </p>
                            <p className="text-xs text-white/70 mb-2">
                              Log a{' '}
                              <button
                                onClick={() => onOpenBaselineTest?.('Baseline Test: Lower Body')}
                                className="underline font-medium hover:opacity-80"
                                style={{ color: SPORT_COLORS.strength }}
                              >
                                Lower
                              </button>
                              ,{' '}
                              <button
                                onClick={() => onOpenBaselineTest?.('Baseline Test: Upper Body')}
                                className="underline font-medium hover:opacity-80"
                                style={{ color: SPORT_COLORS.strength }}
                              >
                                Upper
                              </button>
                              {' '}or{' '}
                              <button
                                onClick={() => onOpenBaselineTest?.('Baseline Test: Full Body')}
                                className="underline font-medium hover:opacity-80"
                                style={{ color: SPORT_COLORS.strength }}
                              >
                                Full Body
                              </button>
                              {' '}baseline test. One all-out AMRAP set per lift after guided warmups — we'll help you find your working weight and estimate your 1RM from it; the number firms up over the first few weeks. Same test the Get Strong block ends with, so entry and retest match.
                            </p>
                            <p className="text-xs text-white/60 italic">
                              Tip: Retest every 8-12 weeks to track progress.
                            </p>
                          </div>
                          <div className="space-y-4 mt-4 pt-4 border-t border-white/10">
                            <h4 className="text-sm font-medium text-white/80">Equipment Access</h4>
                            
                            {/* Commercial vs Home gym toggle */}
                            <div className="flex gap-3">
                              <button
                                onClick={() => {
                                  // Set to commercial gym, clear individual equipment
                                  setData(prev => ({
                                    ...prev,
                                    equipment: { ...prev.equipment, strength: ['Commercial gym'] }
                                  }));
                                }}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-xl border-2 transition-all duration-300 ${
                                  hasCommercialGym
                                    ? 'text-white'
                                    : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                }`}
                                style={{ 
                                  fontFamily: 'Inter, sans-serif',
                                  ...(hasCommercialGym ? {
                                    borderColor: SPORT_COLORS.strength,
                                    backgroundColor: `${SPORT_COLORS.strength}15`
                                  } : {})
                                }}
                              >
                                <span 
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                  style={{ 
                                    borderColor: hasCommercialGym ? SPORT_COLORS.strength : 'rgba(255,255,255,0.3)',
                                    backgroundColor: hasCommercialGym ? SPORT_COLORS.strength : 'transparent'
                                  }}
                                >
                                  {hasCommercialGym && <span className="text-[10px] text-black font-bold">✓</span>}
                                </span>
                                Commercial gym
                              </button>
                              <button
                                onClick={() => {
                                  // Switch to home gym - only clear if coming FROM commercial gym
                                  if (hasCommercialGym) {
                                    setData(prev => ({
                                      ...prev,
                                      equipment: { ...prev.equipment, strength: [] }
                                    }));
                                  }
                                  // If already home gym, do nothing - keep existing equipment
                                }}
                                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-xl border-2 transition-all duration-300 ${
                                  !hasCommercialGym
                                    ? 'text-white'
                                    : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                }`}
                                style={{ 
                                  fontFamily: 'Inter, sans-serif',
                                  ...(!hasCommercialGym ? {
                                    borderColor: SPORT_COLORS.strength,
                                    backgroundColor: `${SPORT_COLORS.strength}15`
                                  } : {})
                                }}
                              >
                                <span 
                                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                                  style={{ 
                                    borderColor: !hasCommercialGym ? SPORT_COLORS.strength : 'rgba(255,255,255,0.3)',
                                    backgroundColor: !hasCommercialGym ? SPORT_COLORS.strength : 'transparent'
                                  }}
                                >
                                  {!hasCommercialGym && <span className="text-[10px] text-black font-bold">✓</span>}
                                </span>
                                Home gym
                              </button>
                            </div>

                            {/* Home gym equipment details - only show if not commercial */}
                            {!hasCommercialGym && (
                              <div className="space-y-3">
                                <p className="text-xs text-white/50 font-medium">Select your equipment:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {homeGymEquipmentOptions.map((option) => {
                                    const isSelected = (data.equipment.strength || []).includes(option);
                                    return (
                                      <button
                                        key={option}
                                        onClick={() => toggleEquipment('strength', option)}
                                        className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-all duration-300 ${
                                          isSelected
                                            ? 'text-white'
                                            : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.08]'
                                        }`}
                                        style={{ 
                                          fontFamily: 'Inter, sans-serif',
                                          ...(isSelected ? {
                                            borderColor: `${SPORT_COLORS.strength}80`,
                                            backgroundColor: `${SPORT_COLORS.strength}15`
                                          } : {})
                                        }}
                                      >
                                        <span 
                                          className="w-3.5 h-3.5 rounded flex items-center justify-center border"
                                          style={{ 
                                            borderColor: isSelected ? SPORT_COLORS.strength : 'rgba(255,255,255,0.25)',
                                            backgroundColor: isSelected ? SPORT_COLORS.strength : 'transparent'
                                          }}
                                        >
                                          {isSelected && <span className="text-[8px] text-black font-bold">✓</span>}
                                        </span>
                                        {option}
                        </button>
                                    );
                                  })}
                    </div>
                  </div>
                            )}
                </div>
                                    </div>
                                  )}
                                    </div>
                                  )}

                  {/* Heart Rate Zones — D-199 Layer A: per-active-sport. This card was GLOBAL (run + cycle
                      rows on EVERY tab), bleeding run/cycle HR zones + a per-mile run threshold pace onto
                      swim and strength (which don't use HR zones) and showing cycle on the run tab. Now it
                      renders ONLY on the run/cycle tabs and ONLY for the active sport (active-sport gate on
                      each push below). Swim has no valid HR anchor (run HR ≠ swim HR by ~10–15 bpm); swim
                      zones derive from CSS (Layer C). Strength uses e1RM/RIR, not HR zones. */}
                  {/* Run's threshold heart rate + zones live on the run tab now (2026-09-02); this card is the bike's. */}
                  {activeSport === 'cycling' && (
                  <div className="p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] mt-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-sm font-semibold text-white/90 tracking-wide">Heart Rate Zones</h2>
                        <p className="text-xs text-white/50 mt-0.5">Two inputs, five zones</p>
                      </div>
                      <button
                        onClick={refreshLearnedProfile}
                        disabled={learningProfile}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-white/[0.08] border border-white/20 text-white/70 hover:bg-white/[0.12] hover:text-white transition-all disabled:opacity-50"
                        type="button"
                      >
                        {learningProfile ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw className="h-3 w-3" aria-hidden />
                        )}
                        {learningProfile ? 'Analyzing...' : 'Refresh'}
                      </button>
                    </div>

                    {(() => {
                      const ageEstimates = getAgeBasedHREstimates(data.birthday, data.gender);
                      const restingInfo = getRestingHR(customRestingHR, garminRestingHR);

                      const sportSections: { key: string; label: string; icon: React.ReactNode; color: string;
                        learnedMaxHR: number | null; learnedLTHR: number | null; learnedThresholdPace: any;
                        manualMaxHR: number | null; setManualMaxHR: (v: number | null) => void;
                        manualLTHR: number | null; setManualLTHR: (v: number | null) => void;
                      }[] = [];

                      if ((activeSport as string) === 'running') { // unreachable while the card is bike-only; kept for the bike branch's shape
                        sportSections.push({
                          key: 'run', label: 'Running',
                          icon: <Activity className="h-4 w-4" style={{ color: SPORT_COLORS.run }} />,
                          color: SPORT_COLORS.run,
                          learnedMaxHR: learnedFitness?.run_max_hr_observed?.value || null,
                          // ⛔ RESOLVED, NOT RAW (2026-08-20) — see `effectiveRunLTHR` above. A raw read
                          // shows the learner's `88%/90% of observed max (estimated)` fallback and calls
                          // it "learned"; the resolver refuses it, and so must the card.
                          learnedLTHR: resolveCurrentLthr(
                            { learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as never,
                            { sport: 'run' },
                          ).bpm,
                          learnedThresholdPace: learnedFitness?.run_threshold_pace_sec_per_km || null,
                          manualMaxHR: manualRunMaxHR, setManualMaxHR: setManualRunMaxHR,
                          manualLTHR: manualRunLTHR, setManualLTHR: setManualRunLTHR,
                        });
                      }
                      if (activeSport === 'cycling') {
                        sportSections.push({
                          key: 'ride', label: 'Cycling',
                          icon: <Bike className="h-4 w-4" style={{ color: SPORT_COLORS.cycling }} />,
                          color: SPORT_COLORS.cycling,
                          learnedMaxHR: learnedFitness?.ride_max_hr_observed?.value || null,
                          learnedLTHR: resolveCurrentLthr(
                            { learned_fitness: learnedFitness, performance_numbers: data.performanceNumbers } as never,
                            { sport: 'ride' },
                          ).bpm,
                          learnedThresholdPace: null,
                          manualMaxHR: manualRideMaxHR, setManualMaxHR: setManualRideMaxHR,
                          manualLTHR: manualRideLTHR, setManualLTHR: setManualRideLTHR,
                        });
                      }

                      if (sportSections.length === 0 && !ageEstimates) {
                        return (
                          <div className="text-center py-6">
                            <p className="text-sm text-white/60 mb-2">Add your birthday or select a sport above to see HR zones</p>
                            <p className="text-xs text-white/40">Or import workouts and we'll detect your values automatically.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-5">
                          {/* Per-sport: anchor inputs + zone table */}
                          {sportSections.map((sport) => {
                            const effectiveMaxHR = sport.manualMaxHR || sport.learnedMaxHR || (ageEstimates ? ageEstimates.maxHR : null);
                            /**
                             * ⛔ THE ESTIMATE TIER ANCHORS ON THE ATHLETE'S OWN MAX, NOT ON THEIR AGE
                             * (2026-08-20). It fell straight to `ageEstimates.thresholdHR`, which is
                             * `Tanaka(age) x 0.88` — a formula on top of a formula. `effectiveMaxHR`
                             * above is a MEASURED peak when one exists (20 rides, high confidence, on
                             * the account this was found on), so estimating from it is one inference
                             * instead of two. Age stays underneath for an athlete with no history.
                             *
                             * ⚠️ THE POINT WAS NEVER "NO ESTIMATES." The defect was an estimate stored
                             * as a LEARNED value at `sample_count: 0` and consumed by plans, workload
                             * and zone bins as a measurement. The engine refuses it now. This card is
                             * an EDITOR — it has to seed the two inputs with something, and it labels
                             * what it used ("age est." / "observed"), so a number here is a prompt to
                             * enter one, not a claim to have measured it.
                             */
                            const estimatedLTHR = effectiveMaxHR
                              ? Math.round(effectiveMaxHR * 0.88)
                              : (ageEstimates ? ageEstimates.thresholdHR : null);
                            const effectiveLTHR = sport.manualLTHR || sport.learnedLTHR || estimatedLTHR;
                            const zones = getHRZones(effectiveLTHR, effectiveMaxHR, restingInfo.value);
                            const model = getZoneModel(effectiveLTHR, effectiveMaxHR, restingInfo.value);

                            const maxSource = sport.manualMaxHR ? 'manual' : sport.learnedMaxHR ? 'observed' : ageEstimates ? 'age est.' : '';
                            // ⚠️ "learned" HERE MEANS MEASURED, and it now only says so when that is true.
                            // The value is resolved (gated), so a formula-derived anchor no longer reaches
                            // this line at all — it falls to the age estimate, which is labelled as one.
                            // "learned" means MEASURED and now only says so when it is true — the
                            // value is resolved, so a formula-derived anchor never reaches that branch.
                            const lthrSource = sport.manualLTHR
                              ? 'manual'
                              : sport.learnedLTHR
                                ? 'learned'
                                : effectiveMaxHR
                                  ? 'est. from max'
                                  : (ageEstimates ? 'age est.' : '');

                            return (
                              <div key={sport.key} className="space-y-3">
                                <div className="flex items-center gap-2">
                                  {sport.icon}
                                  <span className="text-xs font-medium text-white/80">{sport.label}</span>
                                  {model && <span className="text-[10px] text-white/30 ml-auto">{model}</span>}
                                </div>

                                {/* Two anchor inputs */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                    <div className="text-xs text-white/50 mb-1">Max HR</div>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        // ⛔ THE INPUT SHOWS WHAT THE ZONES ARE BUILT FROM. It carried its
                                        // own copy of the tier chain; `effectiveMaxHR` is the same
                                        // expression today, but two copies of one number in one component
                                        // is how the LTHR box below ended up disagreeing with its zones.
                                        value={effectiveMaxHR ?? ''}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value);
                                          if (val >= 120 && val <= 230) {
                                            sport.setManualMaxHR(val);
                                            setData(prev => ({ ...prev }));
                                          } else if (e.target.value === '') {
                                            sport.setManualMaxHR(null);
                                            setData(prev => ({ ...prev }));
                                          }
                                        }}
                                        className="w-14 text-sm font-medium text-white bg-transparent border-b border-white/20 focus:border-white/50 outline-none text-center"
                                        min={120} max={230}
                                      />
                                      <span className="text-xs text-white/50">bpm</span>
                                    </div>
                                    <div className="text-[10px] text-white/30 mt-1">{maxSource}</div>
                                  </div>
                                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                    <div className="text-xs text-white/50 mb-1">LTHR</div>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        /**
                                         * ⛔ THIS BOX DISAGREED WITH ITS OWN ZONES (found on screen,
                                         * 2026-08-20). It kept the OLD chain — ending in the age
                                         * estimate — while `effectiveLTHR` above moved to estimating
                                         * from the athlete's MEASURED max. Live result: the box read
                                         * 148 (Tanaka(57) x 0.88) under a label that said "est. from
                                         * max", which would have been 154. One number, two chains, one
                                         * component. Reads the single computed value now.
                                         */
                                        value={effectiveLTHR ?? ''}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value);
                                          if (val >= 100 && val <= 210) {
                                            sport.setManualLTHR(val);
                                            setData(prev => ({ ...prev }));
                                          } else if (e.target.value === '') {
                                            sport.setManualLTHR(null);
                                            setData(prev => ({ ...prev }));
                                          }
                                        }}
                                        className="w-14 text-sm font-medium text-white bg-transparent border-b border-white/20 focus:border-white/50 outline-none text-center"
                                        min={100} max={210}
                                      />
                                      <span className="text-xs text-white/50">bpm</span>
                                    </div>
                                    <div className="text-[10px] text-white/30 mt-1">{lthrSource}</div>
                                  </div>
                                </div>

                                {/* Threshold Pace (running only, if available) */}
                                {sport.learnedThresholdPace && (
                                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10">
                                    <div>
                                      <div className="text-xs text-white/50">Threshold Pace</div>
                                      <div className="text-sm font-medium text-white">{formatPace(sport.learnedThresholdPace.value)}</div>
                                    </div>
                                    <div className="text-xs text-white/40">
                                      {getConfidenceDots(sport.learnedThresholdPace.confidence)}
                                    </div>
                                  </div>
                                )}

                                {/* Derived 5-zone table */}
                                {zones ? (
                                  <div className="rounded-lg overflow-hidden border border-white/10">
                                    {zones.map((zone) => (
                                      <div
                                        key={zone.name}
                                        className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05] last:border-b-0"
                                        style={{ backgroundColor: `${zone.color}08` }}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                                          <span className="text-xs font-medium text-white/80">{zone.name}</span>
                                          <span className="text-xs text-white/40">{zone.label}</span>
                                        </div>
                                        <span className="text-xs font-mono text-white/60">
                                          {zone.min}–{zone.max ?? '∞'} bpm
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-white/40 text-center py-2">
                                    Enter Max HR or LTHR to see zones
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Resting HR — optional, de-emphasized */}
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-white/40">Resting HR</span>
                              <input
                                type="number"
                                value={restingInfo.value ?? ''}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  if (val >= 35 && val <= 100) {
                                    setCustomRestingHR(val);
                                    setData(prev => ({ ...prev, performanceNumbers: { ...prev.performanceNumbers, restingHeartRate: val } }));
                                  } else if (e.target.value === '') {
                                    setCustomRestingHR(null);
                                    const { restingHeartRate, ...rest } = data.performanceNumbers as any;
                                    setData(prev => ({ ...prev, performanceNumbers: rest }));
                                  }
                                }}
                                placeholder="optional"
                                className="w-16 text-xs text-white/60 bg-transparent border-b border-white/10 focus:border-white/30 outline-none text-center"
                                min={35} max={100}
                              />
                              <span className="text-xs text-white/30">bpm</span>
                            </div>
                            {restingInfo.value && (
                              <span className="text-[10px] text-white/30">
                                {restingInfo.source === 'manual' ? 'manual' : restingInfo.source === 'garmin' ? 'garmin' : ''}
                              </span>
                            )}
                          </div>

                          {/* Status footer */}
                          {learnedFitness && learnedFitness.learning_status !== 'insufficient_data' && (
                            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                              <div className="text-xs text-white/40">
                                {learnedFitness.learning_status === 'confident' ? 'Profile confident' : 'Still learning'}
                                {' \u2022 '}{learnedFitness.workouts_analyzed} workouts analyzed
                              </div>
                              {learnedFitness.last_updated && (
                                <div className="text-xs text-white/30">
                                  {new Date(learnedFitness.last_updated).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}

                          {(!learnedFitness || learnedFitness.learning_status === 'insufficient_data') && (
                            <div className="pt-3 border-t border-white/10 text-center">
                              <button
                                onClick={refreshLearnedProfile}
                                disabled={learningProfile}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl bg-teal-500/20 border border-teal-500/50 text-teal-400 hover:bg-teal-500/30 transition-all disabled:opacity-50"
                                type="button"
                              >
                                {learningProfile ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                                {learningProfile ? 'Analyzing...' : 'Analyze My Workouts'}
                              </button>
                              <p className="text-xs text-white/50 mt-3">
                                Auto-detect Max HR and LTHR from your training data
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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

              {/* Save Button */}
              <div className="pt-8 pb-8">
                {saveMessage && (
                  <div className={`text-center mb-4 text-sm ${
                    saveMessage.includes('Error') ? 'text-red-400' : 'text-cyan-400'
                  }`}>
                    {saveMessage}
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                    className="w-full py-3 px-4 rounded-xl bg-white/[0.12] border border-white/50 text-white hover:bg-white/[0.15] hover:border-white/60 transition-all duration-300 font-medium disabled:bg-white/[0.05] disabled:border-white/20 disabled:text-white/40 disabled:hover:bg-white/[0.05] disabled:hover:border-white/20 disabled:cursor-default"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                >
                    {saving ? 'Saving...' : 'Save Baselines'}
                </button>
            </div>
          </>
        )}
  </div>
);
}
