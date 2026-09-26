import React, { useState, useEffect, useRef } from 'react';
import { markBaselinesStale } from '@/lib/baselines-stale';
import { ArrowLeft, Activity, Bike, Waves, Dumbbell, Watch, RefreshCw, Calendar, Info, Loader2, User, Gauge, Wrench, Settings2, ChevronRight } from 'lucide-react';
import { NumberRow } from '@/components/ui/number-row';
import { pillClass } from '@/lib/number-word';
import { openLiftRetest, rebuildUpcomingSessions, REBUILD_NOTE } from '@/lib/plan-actions';
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
// ⛔ EVERY NUMBER ON THIS SCREEN IS THE SERVER'S (2026-09-10 for the power and swim zone rows, audit
// H-B05/H-B06; the whole readout 2026-09-15, one-truth workorder Stage 4 session 1). See the hook.
import { useBaselineZones } from '@/hooks/useBaselineZones';
import { supabase, getStoredUserId, getStoredAuthUser } from '@/lib/supabase';
import { refreshGroupRideRouteSnapshotsForUser } from '@/lib/refresh-group-ride-route-snapshots';
import { fetchArcContext } from '@/lib/fetch-arc-context';
import { fiveKNudgeDismissKey, type ArcFiveKLearnedDivergence } from '@/lib/arc-types';
import { acceptMeasuredNumber } from '@/lib/accept-measured';

interface TrainingBaselinesProps {
onClose: () => void;
/** Same action as the menu's Sign Out (AuthWrapper.handleLogout), reached from the Account plate. */
onSignOut?: () => void | Promise<void>;
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

/* ⛔ `AutoMinePill` deleted (2026-09-15): defined here, rendered nowhere. `NumberRow` carries the
   auto / my-number switch on the pill itself. */

/**
 * Home-gym equipment chips. ONE list, shared by Profile and the sign-up intake (2026-09-07).
 * ⛔ These strings are matched EXACTLY by `substituteExerciseForEquipment` (materialize-plan) and by
 * substring in `_shared/strength-equipment-tier.ts`; see the comment above the Profile picker.
 */
/** Swim gear chips. ONE list, shared by Profile and the sign-up intake (2026-09-07). */
export const SWIM_EQUIPMENT_OPTIONS: string[] = [
    "Pool access",
    "Open water access",
    "Paddles",
    "Pull buoy",
    "Ankle band",
    "Kickboard",
    "Fins",
    "Snorkel"
  ];

/**
 * ⛔ THE MINIMUM KIT IS NOT A CHIP (2026-09-24, `docs/WORKORDER-minimum-kit-and-accessory-table-2026-09-24.md` Part A):
 * barbell + plates, squat rack / power cage, bench, dumbbells and a pull-up bar are what every strength plan is built
 * on (`MINIMUM_KIT_KEYS`, `src/lib/strength-gear.ts`), never below it, so the picker names only the EXTRAS. A stored
 * list from before this date that still names a minimum chip reads the same (minimum ∪ stored); it is not shown as a
 * chip and needs no migration. "Home gym" with no extras is stored as the marker `HOME_GYM_MARKER`, so a declared
 * home kit is never an empty list (an empty list means "not asked").
 */
export const HOME_GYM_MARKER = 'Home gym';
/** The line stating the minimum, on sign-up and on the Profile card. Michael's words, approved 2026-09-25. */
export const EQUIPMENT_MINIMUM_LINE = "You'll need a barbell and plates, a rack, a bench and dumbbells.";
export const HOME_GYM_EQUIPMENT_OPTIONS: string[] = [
    "Incline bench",
    "Kettlebells",
    "Cable machine",
    "Resistance bands",
    // ⚠️ NO TRAP BAR CHIP (2026-09-25): the trap bar is a form of the deadlift, chosen on the lift (`DEADLIFT_FORMS`).
    // ⛔ ADDED 2026-09-02 (WORKORDER-plyo-screen §3): gates the ladder drills in the plyo family; matched
    // by exact string in the logger's plyo Swap options.
    "Agility ladder",
    "Ab wheel",
    // ⛔ ADDED 2026-08-26 — see the ruling above. ⚠️ Both strings are matched by SUBSTRING in
    // `athleteEquipmentToKeys` ("trx"/"suspension", "stability ball"); renaming either silently
    // removes the capability from every athlete who ticked it.
    "TRX / suspension trainer",
    "Stability ball",
    // ⛔ ADDED 2026-09-16 (D-479) — the first chip under the one-test rule; see the ruling above. ⚠️ Matched
    // by SUBSTRING ("back extension") in `athleteEquipmentToKeys`, which also keeps the word "bench" in it
    // from granting a flat bench.
    "Back extension bench",
    // ⛔ ADDED 2026-09-16 (D-479) on Michael's ruling from p226 — the stated exception to the ownership bar (no
    // survey number). Matched by SUBSTRING ("sled") in `athleteEquipmentToKeys` and EXACTLY in
    // `substituteExerciseForEquipment`.
    "Sled",
    // ⛔ ADDED 2026-09-18 (Michael): p220's sandbag throw is offered only to a kit with a sandbag. Matched by SUBSTRING
    // ("sandbag") in `athleteEquipmentToKeys`.
    "Sandbag"
  ];

export default function TrainingBaselines({ onClose, onOpenBaselineTest, onSignOut }: TrainingBaselinesProps) {
const { saveUserBaselines, loadUserBaselines } = useAppContext();
const { zones: serverZones, readout, refresh: refreshZones, apply: applyZones } = useBaselineZones();
/** Profile identity (2026-09-06): the sign-in email is shown, never stored; the photo is uploaded to the
 *  `avatars` bucket at `<user_id>/photo.jpg` (resized to 512px on the phone), its public URL saved to
 *  `profile.photo_url` at once so leaving without Save does not orphan the file. */
const [authEmail, setAuthEmail] = useState<string>(() => getStoredAuthUser()?.email ?? '');
/** A new sign-in address waiting on its confirmation link (Supabase keeps it as `user.new_email`). */
const [pendingEmail, setPendingEmail] = useState<string | null>(null);
const [photoBusy, setPhotoBusy] = useState(false);
const [photoNote, setPhotoNote] = useState<string | null>(null);
useEffect(() => {
  let cancelled = false;
  void supabase.auth.getUser().then(({ data: u }) => {
    if (cancelled) return;
    if (u?.user?.email) setAuthEmail(u.user.email);
    const ne = (u?.user as { new_email?: string | null } | undefined)?.new_email ?? null;
    setPendingEmail(ne && ne !== u?.user?.email ? ne : null);
  }).catch(() => {});
  return () => { cancelled = true; };
}, []);
const signOut = async () => {
  if (onSignOut) { await onSignOut(); return; }
  await supabase.auth.signOut();
};
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
    markBaselinesStale();
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
/** After an accept, the screen shows the row the server saved (learned numbers and the cleared manual flag). */
const reloadSavedBaselines = async () => {
  void refreshZones();
  const fresh = await loadUserBaselines();
  if (!fresh) return;
  setData(fresh as BaselineData);
  setOriginalData(JSON.stringify(fresh));
  const raw = (fresh as { learned_fitness?: unknown }).learned_fitness;
  setLearnedFitness(typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : (raw ?? null));
};
// ⛔ THE PHONE SENDS THE NUMBER THE BUTTON SHOWED; save-baselines saves the accept (2026-09-10).
const acceptMeasuredFtp = async (shownWatts: number) => {
  const userId = getStoredUserId();
  if (!userId || ftpAccepting) return;
  setFtpAccepting(true);
  try {
    const res = await acceptMeasuredNumber(supabase, 'ftp', shownWatts);
    if (!res.ok) { console.error('[TrainingBaselines] FTP accept failed:', res.error); return; }
    await reloadSavedBaselines();
    const acceptedW = Math.round(res.acceptedValue);
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

/**
 * ⛔ THE TEST PICKERS ARE DELETED (2026-09-15, one-truth workorder Stage 4 session 1). Every symbol in
 * this block — two date pickers defaulting to `today + 2` and `today + 3`, two `ilike '%FTP Test%'` /
 * `'%Threshold Test%'` lookups (the run row is named "Threshold Time Trial", so that one never matched a
 * single row), `scheduleRunTest`, `scheduleFtpTest`, `rescheduleFtpTest`, `deleteRunTest`,
 * `deleteFtpTest` and the FTP input ref — appeared exactly once in this file: defined, never rendered.
 * Scheduling a test lives on Adjust, detects by tag, and takes its day from the server's readout.
 */
const [showSwimTest, setShowSwimTest] = useState(false);

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
  // The Strength card's own buttons (2026-09-20): two retests, a rebuild under the numbers, a rebuild under the equipment.
  const [retestBusy, setRetestBusy] = useState<'Lower' | 'Upper' | null>(null);
  const [rebuildBusy, setRebuildBusy] = useState<'numbers' | 'equipment' | null>(null);
  const [rebuildNotes, setRebuildNotes] = useState<{ numbers?: string; equipment?: string }>({});
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

/**
 * ⛔ THE LEARNED-BASIS HELPERS ARE DELETED (2026-09-15, one-truth workorder Stage 4 session 1).
 * `learnedBasisLine`, `learnedAsOfLine` and `getConfidenceDots` each appeared exactly once in this file
 * — defined, never rendered. Each row's provenance line is the server's `note` now.
 */
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

/**
 * ⛔ THE AGE, THE RESTING-HEART-RATE PICK AND THE ZONE TABLE ARE THE SERVER'S (2026-09-15, one-truth
 * workorder Stage 4 session 1). `calculateAge` and `getAgeBasedHREstimates` worked out an age on every
 * render and offered an age-estimated max the zone build refuses; `getRestingHR` chose between a typed
 * number and the watch's; `ZONE_ROW_NAMES` named the stored rows by position and `{min}–{max}` printed
 * the open Z5 row as "176– bpm". All of it is in `save-baselines/zones.ts` now — row names, ranges and
 * units included.
 */
// ⛔ NO POWER-ZONE TABLE ON THE PHONE (2026-09-10, audit H-B05). The rows below come from `save-baselines`
// (Coggan's seven levels, `_shared/endurance/display-zones.ts`), the table the ride analysis bins by.

/**
 * Every row saves at once (2026-09-06): `persist` is the old Save button's routine, parameterised on the
 * data to write and on the manual heart-rate overrides, so a row's commit and an auto switch run the
 * same follow-through (endurance re-price on a watched number, restate on a lock change).
 */
const persist = async (
  next: BaselineData,
  hr?: { runMax?: number | null; runLthr?: number | null; rideMax?: number | null; rideLthr?: number | null; resting?: number | null },
  /** Typed values IN THE ATHLETE'S OWN UNIT — the server converts and stores them (2026-09-15). */
  extras?: { paces?: Record<string, string>; lifts?: Record<string, number | null> },
) => {
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
    /**
     * ⛔ THE HEART-RATE NUMBERS AS TYPED, AND NOTHING DERIVED FROM THEM (2026-09-10).
     *
     * This block used to resolve each sport's anchors, build Friel or Karvonen zone tables (filling a
     * missing resting heart rate with 60) and write `configured_hr_zones` itself. `save-baselines` now
     * stores the typed numbers and nothing derived from them (2026-09-26): every zone edge is
     * `heartRateZoneSet`, worked out on the server at read time. Resting heart rate is sent only when the
     * athlete typed or cleared it.
     */
    const heartRate: Record<string, number | null> = {
      manual_run_max_hr: m.runMax,
      manual_run_lthr: m.runLthr,
      manual_ride_max_hr: m.rideMax,
      manual_ride_lthr: m.rideLthr,
      ...(((hr && hr.resting !== undefined) || customRestingHR) ? { resting_heart_rate: restingOverride } : {}),
    };
    const saved = await saveUserBaselines(dataToSave as any, heartRate, extras);
    // Every save returns the readout rebuilt from the row it just wrote; paint that rather than ask again.
    applyZones(saved?.zones);
    void refreshZones();

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
      // A typed pace arrives outside `performance_numbers` now, so it is watched on its own.
      const changed = WATCH.some((k) => String(prevPn[k] ?? '') !== String(nextPn[k] ?? '')) || !!(m.runLthr || m.rideLthr) || !!extras?.paces;
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
      const nextLocked = JSON.stringify(saved?.locked_baselines ?? (dataToSave as any)?.locked_baselines ?? null);
      if (prevLocked !== nextLocked || !!extras?.lifts) {
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
const commitData = async (
  updater: (d: BaselineData) => BaselineData,
  hr?: Parameters<typeof persist>[1],
  extras?: Parameters<typeof persist>[2],
) => {
  const next = updater(data);
  setData(next);
  setLastSavedSport(activeSport ?? 'you');
  await persist(next, hr, extras);
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
/* ⛔ `parsePaceText`, `paceToText` and `baselinesLike` deleted (2026-09-15). The pace formatter picked the
   unit and divided by 1.609344 on the phone; `baselinesLike` fed the resolvers a two-key heart-rate object
   built from screen state, which is why this screen and Adjust could answer differently for one athlete. */
const pnAny = (data.performanceNumbers || {}) as any;
/** The sport's sections — Numbers · Zones · Equipment (swim: Numbers · Settings · Zones · Equipment). */
const sportSections = (): Array<{ id: string; label: string; Icon: React.ComponentType<any>; info?: string; body: React.ReactNode }> => {
  /**
   * ⛔ THE HEART-RATE ROWS AND THE ZONE TABLE ARE THE SERVER'S (2026-09-15). This screen ran its own
   * `manual || learned || age estimate` chain for the max and printed an age estimate the zone build
   * refuses, then said underneath that zones need a max (§8.0 #24); and it fed the threshold resolver a
   * two-key object built from screen state while Adjust fed it the stored row, so an athlete with only a
   * bike threshold typed read two different run numbers (§8.0 #23). One payload, both screens.
   */
  const hrRows = (sport: 'run' | 'ride') => {
    const isRun = sport === 'run';
    const side = isRun ? readout?.run : readout?.bike;
    const rows: React.ReactNode[] = [];
    rows.push(
      <NumberRow key="lthr" id={`${sport}-lthr`} name="Threshold heart rate" hint={side?.lthr.hint ?? 'bpm'} inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={side?.lthr.value ?? null} note={side?.lthr.note ?? null} mine={side?.lthr.mine === true}
        onSave={(t) => { const v = parseInt(t); if (!(v > 0)) return; if (isRun) { setManualRunLTHR(v); void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, lthr_source: 'manual' } }), { runLthr: v }); } else { setManualRideLTHR(v); void commitData((d) => d, { rideLthr: v }); } }}
        onAuto={() => { if (isRun) { setManualRunLTHR(null); void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, lthr_source: 'learned' } }), { runLthr: null }); } else { setManualRideLTHR(null); void commitData((d) => d, { rideLthr: null }); } }} />,
    );
    rows.push(
      <NumberRow key="max" id={`${sport}-max`} name="Max heart rate" hint={side?.max_hr.hint ?? 'bpm'} inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={side?.max_hr.value ?? null} note={side?.max_hr.note ?? null} mine={side?.max_hr.mine === true}
        onSave={(t) => { const v = parseInt(t); if (!(v > 0)) return; if (isRun) { setManualRunMaxHR(v); void commitData((d) => d, { runMax: v }); } else { setManualRideMaxHR(v); void commitData((d) => d, { rideMax: v }); } }}
        onAuto={() => { if (isRun) { setManualRunMaxHR(null); void commitData((d) => d, { runMax: null }); } else { setManualRideMaxHR(null); void commitData((d) => d, { rideMax: null }); } }} />,
    );
    rows.push(
      <NumberRow key="rest" id={`${sport}-rest`} name="Resting heart rate" hint={side?.resting_hr.hint ?? 'bpm'} inputMode="numeric" sport={isRun ? 'run' : 'bike'} value={side?.resting_hr.value ?? null} note={side?.resting_hr.note ?? null} mine={side?.resting_hr.mine === true}
        onSave={(t) => { const v = parseInt(t); if (!(v > 0)) return; setCustomRestingHR(v); void commitData((d) => d, { resting: v }); }}
        onAuto={() => { setCustomRestingHR(null); void commitData((d) => d, { resting: null }); }} />,
    );
    const zt = side?.zones;
    const table = zt && zt.rows.length > 0 ? (
      <div className="mt-1 space-y-0.5">
        {zt.rows.map((z) => (
          <div key={z.name} className="flex items-baseline justify-between text-[12px] px-1">
            <span className="text-white/60">{z.name}</span>
            <span className="tabular-nums text-white/75">{z.range}</span>
          </div>
        ))}
        {zt.basis && <p className="text-[12px] text-white/50 px-1 mt-1">{zt.basis}</p>}
      </div>
    ) : <p className="text-[12px] text-white/50">{zt?.empty ?? 'Heart-rate zones need a threshold heart rate, a max heart rate, or your birthday.'}</p>;
    return { rows, table };
  };
  const equipmentChips = (discipline: 'swimming' | 'strength', options: string[]) => (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = ((data.equipment as any)[discipline] || []).includes(option);
        const colour = getDisciplineColor(discipline === 'strength' ? 'strength' : 'swim');
        return (
          <GalaxyButton key={option} shape="chip" variant={on ? 'primary' : 'secondary'} aria-pressed={on}
            className={on ? 'text-white' : 'text-white/55'}
            style={on ? { borderColor: `${colour}88`, background: `${colour}22` } : undefined}
            onClick={() => { toggleEquipment(discipline, option); void persistEquipmentSoon(); }}>{option}</GalaxyButton>
        );
      })}
    </div>
  );

  if (activeSport === 'running') {
    const rd = readout?.run ?? null;
    const thrProposal = rd?.threshold_proposal ?? null;
    const fiveKMine = pnAny.fiveK_source !== 'learned';
    const hr = hrRows('run');
    return [
      { id: 'run-numbers', label: 'Paces', Icon: Activity, info: 'Threshold pace is the fastest pace you could hold for about an hour; hard sessions are set from it. Easy pace is your zone 2 pace, worked out from threshold pace. Typing a number makes it your number; auto uses what your runs measure.', body: (
        <div className="space-y-1.5">
          {/* ⛔ THE TYPED PACE GOES OVER AS TYPED (2026-09-15) — per km on a metric account. This screen
              multiplied by 1.609344 and re-serialised per mile before the save, so the server never saw
              the number the athlete entered, and Adjust held a second copy of the same conversion. */}
          <NumberRow id="threshold" name="Threshold pace" hint={rd?.threshold.hint ?? (metric ? 'm:ss/km' : 'm:ss/mi')} inputMode="numeric" sport="run" value={rd?.threshold.value ?? null} note={rd?.threshold.note ?? null} mine={rd?.threshold.mine === true}
            onSave={(t) => { if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return; void commitData((d) => d, undefined, { paces: { threshold: t.trim() } }); }}
            onAuto={() => void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, threshold_pace_source: 'learned' } as any }))} />
          {thrProposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">{thrProposal.text}</span>
              <button type="button" disabled={thrAccepting} onClick={() => void acceptThr(thrProposal.accept_value)} style={{ borderColor: `${getDisciplineColor('run')}88`, color: getDisciplineColor('run') }} className="text-[13px] px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{thrAccepting ? 'Applying…' : thrProposal.button}</button>
            </div>
          )}
          <NumberRow id="easy" name="Easy pace" editable={false} sport="run" value={rd?.easy.value ?? null} note={rd?.easy.note ?? null} />
          {/* server-word: every word on this row is the server's (2026-09-17, WORKORDER Stage C) — the readout's
              own `value`/`note`, or `five_k_nudge.baselines_value_when_auto` / `.baselines_note_when_mine` from
              `get-arc-context`. The two strings were assembled here beside a server-authored row. */}
          <NumberRow id="fiveK" name="5K time" hint={rd?.five_k.hint ?? 'mm:ss'} inputMode="numeric" sport="run" value={rd?.five_k.value ?? (!fiveKMine ? (arcFiveKNudge?.baselines_value_when_auto ?? null) : null)} note={rd?.five_k.note != null && arcFiveKNudge?.should_prompt && fiveKMine ? (arcFiveKNudge?.baselines_note_when_mine ?? null) : (rd?.five_k.note ?? null)} mine={rd?.five_k.mine === true} seed={pnAny.fiveK || ''}
            onSave={(t) => { if (!/^\d{1,2}:\d{2}$/.test(t.trim())) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, fiveK: t.trim(), fiveK_source: 'manual' } as any })); }}
            onAuto={() => void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, fiveK_source: 'learned' } as any }))} />
          {hr.rows[0]}
        </div>
      ) },
      { id: 'run-zones', label: 'Zones', Icon: Gauge, info: 'Your heart-rate zones come from your threshold heart rate. With no threshold, they come from your max heart rate. With neither, your age gives an estimated max until your runs record one.', body: (
        <div className="space-y-1.5">
          {hr.rows[1]}
          {hr.rows[2]}
          {hr.table}
        </div>
      ) },
    ];
  }
  if (activeSport === 'cycling') {
    const bd = readout?.bike ?? null;
    const proposal = bd?.ftp_proposal ?? null;
    const hr = hrRows('ride');
    const powerZones = serverZones?.power?.rows ?? [];
    return [
      { id: 'bike-numbers', label: 'FTP', Icon: Bike, info: 'FTP is the most power you could hold for about an hour. It sets your power zones and the targets on rides. Typing a number makes it your number; auto uses what your rides measure.', body: (
        <div className="space-y-1.5">
          <NumberRow id="ftp" name="FTP" hint={bd?.ftp.hint ?? 'W'} inputMode="numeric" sport="bike" value={bd?.ftp.value ?? null} note={bd?.ftp.note ?? null} mine={bd?.ftp.mine === true}
            onSave={(t) => { const v = Math.round(Number(t)); if (!(v > 0)) return; void commitData((d) => ({ ...d, performanceNumbers: { ...d.performanceNumbers, ftp: v, ftp_source: 'manual' } as any })); }}
            onAuto={() => void commitData((d) => { const pn: any = { ...d.performanceNumbers }; delete pn.ftp_source; return { ...d, performanceNumbers: pn }; })} />
          {proposal && (
            <div className="flex items-center justify-between py-1 gap-3">
              <span className="text-[13px] text-white/70">{proposal.text}</span>
              <button type="button" disabled={ftpAccepting} onClick={() => void acceptMeasuredFtp(proposal.accept_value)} style={{ borderColor: `${getDisciplineColor('bike')}88`, color: getDisciplineColor('bike') }} className="text-[13px] px-3 py-1 rounded-xl border bg-white/[0.04] disabled:opacity-50">{ftpAccepting ? 'Applying…' : proposal.button}</button>
            </div>
          )}
          {ftpAcceptNote && <p className="text-[12px] text-white/60">{ftpAcceptNote}</p>}
          {hr.rows[0]}
        </div>
      ) },
      { id: 'bike-zones', label: 'Zones', Icon: Gauge, info: 'Power zones come from your FTP. Heart-rate zones come from your threshold heart rate on the bike. With no threshold, they come from your max heart rate. With neither, your age gives an estimated max until your rides record one.', body: (
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
    const swimRow = readout?.swim.threshold_100 ?? null;
    const swim100 = pnAny.swimPace100 as string | undefined;
    // ⛔ THE SERVER'S BANDS (audit H-B06), from the stored threshold 100 pace.
    const bands = serverZones?.swim_pace?.rows ?? [];
    return [
      { id: 'swim-numbers', label: 'Pace', Icon: Waves, info: 'Your hard, steady 100 pace: the effort you could hold for a strong continuous swim. Sets your swim pace zones.', body: (
        <div className="space-y-1.5">
          <NumberRow id="swim100" name="Threshold 100 pace" hint={swimRow?.hint ?? 'm:ss'} inputMode="numeric" sport="swim" value={swimRow?.value ?? null} note={swimRow?.note ?? null} seed={swim100 || ''}
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
    /**
     * ⛔ A LIFT IS TYPED IN THE ATHLETE'S OWN UNIT AND STORED IN POUNDS (2026-09-15, §8.0 #7). This screen
     * printed "kg" beside the pound number on a metric account while the logger printed "lb" for the same
     * set, and a typed kilogram number went to the database raw. The server converts both ways now; the
     * row below is the server's, unit and all.
     */
    const liftRows = STRENGTH_LIFT_FIELDS.map((lift) => {
      const lr = readout?.strength.lifts.find((l) => l.key === lift.key) ?? null;
      return (
        <NumberRow key={lift.key} id={lift.key} name={lift.label} hint={lr?.row.hint ?? (lift.reps ? 'reps' : 'lb')} inputMode="numeric" sport="strength" value={lr?.row.value ?? null} note={lr?.row.note ?? null} mine={lr?.row.mine === true}
          onSave={(t) => { const n = lift.reps ? Math.max(0, parseInt(t) || 0) : Number(t); if (!Number.isFinite(n) || (lift.reps ? n < 0 : n <= 0)) return; void commitData((d) => d, undefined, { lifts: { [lift.key]: n } }); }}
          onAuto={lift.reps ? undefined : () => void commitData((d) => d, undefined, { lifts: { [lift.key]: null } })} />
      );
    });
    return [
      { id: 'strength-numbers', label: 'Lifts · 1RM', Icon: Dumbbell, info: 'The four lifts the block works from, and pull-ups as reps. Typing a number makes it your number and locks it; auto uses what your lifts measure, three logged sessions and up. A number typed here is also the number on file for a new block.', body: (
        <>
          <div className="space-y-1.5">{liftRows}</div>
          {/* ⛔ THE BUTTONS SIT WHERE THE CHANGE IS MADE (Michael, 2026-09-20: "retest x 2, rebuild x 1 (if you manually
              change), then equipment rebuild"). The same actions and words as the Adjust tab (`@/lib/plan-actions`). */}
          {/* ⛔ ACTIONS ARE BUTTONS, CHOICES ARE CHIPS (`ui/galaxy-button.tsx`). These read as round pills beside the
              equipment chips (Michael, 2026-09-20: "should they pop more to separate from the other pills?"; "retest
              should be larger"), so an action looked like one more option to pick. */}
          <div className="mt-3">
            <span className="text-subhead text-label">Retest</span>
            <div className="flex gap-2 mt-1.5">
              {(['Lower', 'Upper'] as const).map((which) => (
                <GalaxyButton key={which} variant="secondary" size="md" className="flex-1 action-bed" disabled={retestBusy != null}
                  onClick={() => { setRetestBusy(which); void openLiftRetest(which).finally(() => setRetestBusy(null)); }}>
                  {retestBusy === which ? 'Opening…' : `${which} lifts`}<ChevronRight className="h-4 w-4 text-label-secondary" aria-hidden="true" /></GalaxyButton>
              ))}
            </div>
          </div>
          <p className="text-footnote text-label-secondary mt-2 leading-snug">A retest opens today, in the logger.</p>
          <div className="mt-3">
            <GalaxyButton variant="secondary" size="md" fullWidth className="action-bed" disabled={rebuildBusy != null}
              onClick={() => { setRebuildBusy('numbers'); setRebuildNotes((n) => ({ ...n, numbers: undefined })); void rebuildUpcomingSessions().then((r) => setRebuildNotes((n) => ({ ...n, numbers: REBUILD_NOTE[r] }))).finally(() => setRebuildBusy(null)); }}>
              {rebuildBusy === 'numbers' ? 'Rebuilding…' : 'Rebuild upcoming sessions'}</GalaxyButton>
            <p className="text-footnote text-label-secondary mt-2 leading-snug">Rewrites the sessions you have not started from the plan: lifts and weights, runs and rides. Same days. Done sessions are not touched.</p>
            {rebuildNotes.numbers && <p className="text-footnote text-label-secondary mt-1.5">{rebuildNotes.numbers}</p>}
          </div>
        </>
      ) },
      { id: 'strength-equipment', label: 'Equipment', Icon: Wrench, info: 'A commercial gym has everything. A home gym lists what you have; the plan picks movements from it.', body: (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <GalaxyButton shape="chip" variant={hasCommercialGym ? 'primary' : 'secondary'} aria-pressed={hasCommercialGym}
              className={hasCommercialGym ? 'text-white' : 'text-white/55'}
              style={hasCommercialGym ? { borderColor: `${getDisciplineColor('strength')}88`, background: `${getDisciplineColor('strength')}22` } : undefined}
              onClick={() => void commitData((d) => ({ ...d, equipment: { ...d.equipment, strength: ['Commercial gym'] } }))}>Commercial gym</GalaxyButton>
            <GalaxyButton shape="chip" variant={!hasCommercialGym ? 'primary' : 'secondary'} aria-pressed={!hasCommercialGym}
              className={!hasCommercialGym ? 'text-white' : 'text-white/55'}
              style={!hasCommercialGym ? { borderColor: `${getDisciplineColor('strength')}88`, background: `${getDisciplineColor('strength')}22` } : undefined}
              onClick={() => { if (hasCommercialGym) void commitData((d) => ({ ...d, equipment: { ...d.equipment, strength: [HOME_GYM_MARKER] } })); }}>Home gym</GalaxyButton>
          </div>
          {/* The minimum every plan is built on; the chips below are extras (Michael's words, 2026-09-25). */}
          {!hasCommercialGym && <p className="text-footnote text-label-secondary m-0 leading-snug">{EQUIPMENT_MINIMUM_LINE}</p>}
          {!hasCommercialGym && equipmentChips('strength', homeGymEquipmentOptions)}
          <div className="pt-3">
            <GalaxyButton variant="secondary" size="md" fullWidth className="action-bed" disabled={rebuildBusy != null}
              onClick={() => { setRebuildBusy('equipment'); setRebuildNotes((n) => ({ ...n, equipment: undefined })); void rebuildUpcomingSessions({ useCurrentEquipment: true }).then((r) => setRebuildNotes((n) => ({ ...n, equipment: REBUILD_NOTE[r] }))).finally(() => setRebuildBusy(null)); }}>
              {rebuildBusy === 'equipment' ? 'Rebuilding…' : 'Rebuild upcoming sessions'}</GalaxyButton>
            {/* Michael's words, 2026-09-20. */}
            <p className="text-footnote text-label-secondary mt-2 leading-snug">Changes made to equipment will be adjusted here for future sessions.</p>
            {rebuildNotes.equipment && <p className="text-footnote text-label-secondary mt-1.5">{rebuildNotes.equipment}</p>}
          </div>
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
// ⛔ THE PHONE SENDS THE PACE THE BUTTON SHOWED (sec/km); save-baselines saves the accept and the flag.
const acceptThr = async (shownSecPerKm: number) => {
  const uid = getStoredUserId(); if (!uid || thrAccepting) return;
  setThrAccepting(true);
  try {
    const res = await acceptMeasuredNumber(supabase, 'run_threshold', shownSecPerKm);
    if (!res.ok) throw new Error(res.error);
    await reloadSavedBaselines();
    try { await supabase.functions.invoke('endurance-checkpoint', { body: { reprice: true } }); } catch { /* the accept stands */ }
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
  const swimmingEquipmentOptions = SWIM_EQUIPMENT_OPTIONS;

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
   * ⛔⛔ SHARPENED 2026-09-16 (D-479) — THE LIST GROWS BY ONE TEST PER CHIP. A chip is added only when
   * (1) a person can name the gear and (2) it unlocks a movement the book prints that the athlete
   * cannot reach any other way. The rule below stands as the first half; the second half is new. Dip
   * bars fail it (dips already route on a rack or a bench); a back extension bench passes it (p222's
   * GHD back extension was reachable only in a commercial gym; the bench is its 90-degree type). Everything
   * below is history.
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
   * ⚠️ AND THE KIT THAT COULD NOT CLEAR THE SAME BAR DID NOT GET A CHIP. A GHD, a sled (back 2026-09-16 with its own chip, D-479), a captain's
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
  const homeGymEquipmentOptions = HOME_GYM_EQUIPMENT_OPTIONS;

  
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
      <p className="text-white/50 text-sm">Your details and your training numbers.</p>
      {lastUpdated && (
        <p className="text-xs text-white/40 mt-2">
          Last updated: {new Date(lastUpdated).toLocaleDateString()}
        </p>
      )}
    </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-white/60">Loading…</p>
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
                      <p className="mb-2 text-[13px] text-white/60 leading-snug">Tap a value to change it.</p>
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
                          {photoNote && <p className="text-[12px] text-white/60 mt-1">{photoNote}</p>}
                        </div>
                      </div>
                      {/* ⛔ THE AGE IS THE SERVER'S, WORKED OUT FROM THE BIRTHDAY (2026-09-15). This line
                          recomputed it on every render while `user_baselines.age` held a copy written once
                          and never refreshed, so the screen and three server readers disagreed for a year
                          after a birthday. One rule, nothing stored. */}
                      <NumberRow id="birthday" name="Birthday" inputType="date" value={data.birthday ? `${fmtBirthday(data.birthday)}${readout?.you.age.value ? ` · ${readout.you.age.value}` : ''}` : null} seed={data.birthday || ''} onSave={(t) => { if (/^\d{4}-\d{2}-\d{2}$/.test(t)) void commitData((d) => ({ ...d, birthday: t })); }} />
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
                      {/* Height and body weight are stored in the athlete's own unit already (the server
                          reads the value and the units flag together), so the readout carries the label. */}
                      <NumberRow id="height" name="Height" hint={readout?.you.height.hint ?? (metric ? 'cm' : 'in')} value={readout?.you.height.value ?? null} seed={data.height ? String(data.height) : ''} inputMode="numeric"
                        onSave={(t) => { const v = parseInt(t); if (Number.isFinite(v) && v > 0) void commitData((d) => ({ ...d, height: v })); }} />
                      <NumberRow id="weight" name="Weight" hint={readout?.you.weight.hint ?? (metric ? 'kg' : 'lb')} value={readout?.you.weight.value ?? null} seed={data.weight ? String(data.weight) : ''} inputMode="numeric"
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
                      {/* The Strength card has no link here, so the strip shows only when there is a save message to print. */}
                      <div className={activeSport === 'strength' && !(saveMessage && lastSavedSport === activeSport) ? 'hidden' : 'px-3 py-3'}>
                        {saveMessage && lastSavedSport === activeSport && <p className="text-[13px] text-white/75 mb-1.5">{saveMessage}</p>}
                        {/* The Strength card carries its own retest and rebuild buttons (2026-09-20); the run and ride cards keep the link. */}
                        {activeSport !== 'strength' && <button type="button" onClick={goToAdjust} className={`${pillClass} inline-flex items-center gap-1 outline-none focus:outline-none active:brightness-125`}>Retest or rebuild on Adjust<ChevronRight className="h-4 w-4 text-white/40" aria-hidden="true" /></button>}
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
