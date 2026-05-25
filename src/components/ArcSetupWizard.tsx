/**
 * ArcSetupWizard — Arc season setup wizard (races → optional prior race → intent → sport prefs → confirm).
 *
 * Code owns all state and flow. LLM is not involved in navigation or save
 * decisions. Five bounded LLM jobs (intensity classification, coaching note,
 * conflict resolution, unusual schedule adjustment) are called once on specific
 * triggers with specific outputs — none of them control flow.
 *
 * Step 1  — Races (name, distance, date, A/B)
 * Step 2  — Optional prior comparable race (time + continuity — informs calibration & projections)
 * Step 3  — Training intent (performance / completion / first_race)
 * Step 4  — Swim (focus 3× / race-ready 2×)        [tri only]
 * Step 5  — Bike anchors (group ride + solo quality) [tri only]
 * Step 6  — Run anchors (run club + quality run day)
 * Step 7  — Long days (ride + run)                  [tri only]
 * Step 8  — Training budget (days/week)
 * Step 9  — Strength (included + intent)            [tri only]
 * Step 10 — Start date + notes + confirm
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2, ChevronLeft } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { supabase, getStoredUserId, invokeFunction } from '@/lib/supabase';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';
import { loadArcWizardDraft, saveArcWizardDraft, clearArcWizardDraft } from '@/lib/arc-wizard-draft-storage';
import type { GroupRideRouteSnapshot } from '@/lib/group-ride-route-snapshot';
import { climbNoticeTier, stravaRouteUrlLooksFetchable, formatGroupRideRouteStatsLine } from '@/lib/group-ride-route-snapshot';
import {
  computeSessionFrequencyDefaults,
  type LimiterSport,
  type SwimFreqIntent,
  type StrengthFreqIntent,
} from '@/lib/session-frequency-defaults';
import { parseTimeToSeconds, type RaceDistance } from '@/lib/effort-score';
import {
  computeSessionFrequencyDefaults,
  type DaysPerWeek,
  type StrengthFreqIntent,
} from '@/lib/session-frequency-defaults';

// ─── Arc context (client-side slice) ─────────────────────────────────────────

/**
 * Slim client-side Arc snapshot — only what the wizard steps need.
 * Loaded once at mount, passed down as a prop. Steps never call getArcContext directly.
 */
export type WizardArcContext = {
  learnedFitness: Record<string, unknown> | null;
  equipment: Record<string, unknown> | null;
  performanceNumbers: Record<string, unknown> | null;
  /** From `user_baselines.units` — drives route stats display in wizard. */
  units: 'metric' | 'imperial';
  swimSessions28: number;
  swimSessions90: number;
  /** Completed runs in last 28 days (for placement-step hints). */
  runSessions28: number;
  /** Completed rides in last 28 days. */
  bikeSessions28: number;
  /** Longest completed run in last 28 days (km); null if unknown / no runs. */
  longestRunKm28: number | null;
  /** Any marathon-length or marathon-labeled completed run in last ~90 days. */
  recentMarathonLikeRun: boolean;
};

async function loadWizardArcContext(userId: string): Promise<WizardArcContext> {
  const today = new Date().toISOString().slice(0, 10);
  const start90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const start28 = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);

  const [baselinesRes, volumeRes] = await Promise.all([
    supabase
      .from('user_baselines')
      .select('learned_fitness, equipment, performance_numbers, units')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('workouts')
      .select('date, type, distance, name')
      .eq('user_id', userId)
      .eq('workout_status', 'completed')
      .in('type', ['swim', 'swimming', 'run', 'ride'])
      .gte('date', start90)
      .lte('date', today),
  ]);

  const baseline = baselinesRes.data as Record<string, unknown> | null;

  const lf = baseline?.learned_fitness;
  const learnedFitness =
    lf && typeof lf === 'object' && !Array.isArray(lf) ? (lf as Record<string, unknown>) : null;

  const eq = baseline?.equipment;
  const equipment =
    eq && typeof eq === 'object' && !Array.isArray(eq) ? (eq as Record<string, unknown>) : null;

  const pn = baseline?.performance_numbers;
  const performanceNumbers =
    pn && typeof pn === 'object' && !Array.isArray(pn) ? (pn as Record<string, unknown>) : null;

  const rawUnits = baseline?.units;
  const units: 'metric' | 'imperial' =
    rawUnits === 'metric' || rawUnits === 'imperial' ? rawUnits : 'imperial';

  const volRows = (volumeRes.data ?? []) as {
    date?: string;
    type?: string;
    distance?: number | null;
    name?: string | null;
  }[];
  const in28 = (d: string) => typeof d === 'string' && d.slice(0, 10) >= start28;

  let swimSessions28 = 0;
  let swimSessions90 = 0;
  let runSessions28 = 0;
  let bikeSessions28 = 0;
  let longestRunKm28 = 0;
  let recentMarathonLikeRun = false;

  for (const r of volRows) {
    const d = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    const t = String(r.type ?? '').toLowerCase();
    const isSwim = t === 'swim' || t === 'swimming';
    const isRun = t === 'run';
    const isRide = t === 'ride';
    const distKm =
      typeof r.distance === 'number' && Number.isFinite(r.distance) && r.distance > 0 ? r.distance : 0;
    const nm = String(r.name ?? '').toLowerCase();

    if (isRun && d >= start90.slice(0, 10) && d <= today.slice(0, 10)) {
      if (distKm >= 38) recentMarathonLikeRun = true;
      if (/marathon|26\.2|42\.195|42k|42\.2|full\s*marathon|fm\b/.test(nm)) {
        recentMarathonLikeRun = true;
      }
      if (in28(d) && distKm > longestRunKm28) longestRunKm28 = distKm;
    }

    if (isSwim) swimSessions90 += 1;
    if (!in28(d)) continue;
    if (isSwim) swimSessions28 += 1;
    if (isRun) runSessions28 += 1;
    if (isRide) bikeSessions28 += 1;
  }

  return {
    learnedFitness,
    equipment,
    performanceNumbers,
    units,
    swimSessions28,
    swimSessions90,
    runSessions28,
    bikeSessions28,
    longestRunKm28: longestRunKm28 > 0 ? Math.round(longestRunKm28 * 10) / 10 : null,
    recentMarathonLikeRun,
  };
}

/** Recent run volume → Arc hint on tri run-quality placement (after pinned quality bike). */
function hintRunQualityPlacementFromHistory(arc: WizardArcContext | null): string | null {
  if (!arc) return null;
  const n = arc.runSessions28;

  const lead: string[] = [];
  if (arc.recentMarathonLikeRun) {
    lead.push(
      'A recent marathon-length run shows in your history — favor folding weekday hard running into the long run unless back-to-back hard days already feel easy.',
    );
  } else if (arc.longestRunKm28 != null && arc.longestRunKm28 >= 25) {
    lead.push(
      `Longest run in the last ~month ~${arc.longestRunKm28} km — strong single-session stimulus; pick the separate mid-week option only if Thu-style intervals still feel fresh.`,
    );
  } else if (arc.longestRunKm28 != null && arc.longestRunKm28 >= 21) {
    lead.push(
      `Longest recent run ~${arc.longestRunKm28} km — half-marathon-ish volume on file; folding into the long run stays the lower-risk weekday pattern.`,
    );
  }

  let tier: string;
  if (n >= 10) {
    tier = `${n} completed runs in the last 4 weeks — strong run rhythm; a separate mid-week hard run after your hard bike day often works if you bounce back quickly on the run.`;
  } else if (n >= 6) {
    tier = `${n} runs in the last 4 weeks — you're running regularly; pick the separate mid-week option if hard days back-to-back have felt fine, or fold into the long run for fewer pinned hard weekdays.`;
  } else if (n >= 3) {
    tier = `${n} runs in the last 4 weeks — either pattern can work; folding into the long run is the lower weekday-stress option.`;
  } else if (n >= 1) {
    tier = `${n} run${n === 1 ? '' : 's'} in the last 4 weeks — folding harder running into the long run often fits while run consistency builds.`;
  } else {
    tier = `No runs logged in the last 4 weeks — putting harder blocks on the long run keeps mid-week simpler until running is back in rhythm.`;
  }

  const prefix = lead.length > 0 ? `${lead.join(' ')} ` : '';
  return `${prefix}${tier}`;
}

/** Recent ride volume → Arc hint on tri bike-quality placement (after pinned quality run). */
function hintBikeQualityPlacementFromHistory(arc: WizardArcContext | null): string | null {
  if (!arc) return null;
  const n = arc.bikeSessions28;
  if (n >= 10) {
    return `${n} completed rides in the last 4 weeks — high bike frequency; a separate mid-week hard bike session may match what your legs already expect.`;
  }
  if (n >= 6) {
    return `${n} rides in the last 4 weeks — if stacking hard bike beside your hard run day feels like a lot, folding the harder work into the long ride frees up mid-week.`;
  }
  if (n >= 3) {
    return `${n} rides in the last 4 weeks — moderate bike volume; either choice is reasonable — long-ride bias helps when the week gets cramped.`;
  }
  if (n >= 1) {
    return `${n} ride${n === 1 ? '' : 's'} in the last 4 weeks — folding structured bike work into the long ride can spare adjacent hard days.`;
  }
  return `No rides logged in the last 4 weeks — folding harder bike work into the long ride keeps weekday stress lower while cycling consistency returns.`;
}

/** Format seconds-per-km as "m:ss/mi" (matches app-wide imperial display) */
function fmtPaceKm(secPerKm: number): string {
  const secPerMile = secPerKm * 1.60934;
  const min = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/mi`;
}

/** Format seconds-per-100yd as "m:ss/100yd" */
function fmtSwimPace(secPer100: number): string {
  const min = Math.floor(secPer100 / 60);
  const sec = Math.round(secPer100 % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/100yd`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];
const DAY_LABEL: Record<Day, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const TRI_DISTANCES = ['Sprint', 'Olympic', '70.3', 'Ironman'] as const;
const RUN_DISTANCES = ['5K', '10K', 'Half Marathon', 'Marathon'] as const;
const ALL_DISTANCES = [...TRI_DISTANCES, ...RUN_DISTANCES] as const;

function isTri(distance: string) {
  return TRI_DISTANCES.some(d => d.toLowerCase() === distance.toLowerCase());
}

function mapWizardDistanceToRaceDistance(d: string): RaceDistance | 'tri_clock' {
  const x = d.toLowerCase().replace(/\s+/g, ' ');
  if (x === '5k') return '5k';
  if (x === '10k') return '10k';
  if (x.includes('half marathon')) return 'half';
  if (x.includes('marathon')) return 'marathon';
  return 'tri_clock';
}

function parseWizardPriorRaceSeconds(distance: string, timeStr: string): number | null {
  const mode = mapWizardDistanceToRaceDistance(distance);
  const raw = timeStr.trim();
  if (!raw) return null;
  if (mode === 'tri_clock') {
    const parts = raw.split(':').map((p) => parseInt(p.trim(), 10));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
    return null;
  }
  return parseTimeToSeconds(raw, mode);
}

/** Empty string allowed; otherwise exactly one calendar year 1990–2100. */
function parseWizardPriorRaceYear(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return null;
  const y = Number(t);
  if (!Number.isFinite(y) || y < 1990 || y > 2100) return null;
  return y;
}

function fmtHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── State shape ─────────────────────────────────────────────────────────────

type WizardRace = {
  id: string;
  name: string;
  distance: string;
  targetDate: string;
  priority: 'A' | 'B' | 'C';
};

/** Persisted as training_prefs.swim_experience — informs coaching + setup chat (engine reads swim_intent). */
type SwimExperienceTier = 'learning' | 'steady' | 'strong';

type WizardState = {
  // Step 1
  races: WizardRace[];
  // Step 2
  trainingIntent: 'performance' | 'completion' | 'first_race' | null;
  // Step 3 (tri)
  swimExperience: SwimExperienceTier | null;
  swimIntent: 'focus' | 'race' | null;
  // Step 4 (tri) — fixed external bike anchor only; planner places everything else
  hasGroupRide: boolean | null;
  groupRideDay: Day | '';
  groupRideIntensity: 'quality_bike' | 'easy_bike' | null;
  /** Optional HTTPS URL for recurring group ride route (e.g. Strava); stored on training_prefs. */
  groupRideRouteUrl: string;
  /** Strava API enrichment when linked + routes URL present (wizard fetch-on-save). */
  groupRideRouteSnapshot: GroupRideRouteSnapshot | null;
  groupRideRouteFetching: boolean;
  groupRideRouteFetchError: string | null;
  // Step 5 — fixed external run anchor only; planner places everything else
  hasGroupRun: boolean | null;
  groupRunDay: Day | '';
  groupRunIntensity: 'quality_run' | 'easy_run' | null;
  /**
   * After anchored Wed (etc.) quality group ride: stack mid-week run quality vs fold into long run.
   * Omitted when no step shown — planner keeps legacy adjacency behavior.
   */
  runQualityPlacement: 'standalone_midweek' | 'long_run_blend' | null;
  /**
   * After anchored quality run club: keep standalone bike quality vs prefer long-ride consolidation (contract; resolver path).
   */
  bikeQualityPlacement: 'standalone_midweek' | 'long_ride_blend' | null;
  // Step 6 (tri)
  longRideDay: Day | '';
  longRunDay: Day | '';
  // Step 7
  daysPerWeek: number | null;
  /**
   * Step 7B — weekly hours available. Tier midpoint values: 6, 9, 11, 13, 15
   * (corresponding to §SESSION-FREQUENCY-DEFAULTS tiers 5-7 / 8-10 / 10-12 / 12-14 / 14+).
   * Replaces the hardcoded {beginner:6, intermediate:10, advanced:14} mapping in
   * create-goal-and-materialize-plan/index.ts.
   */
  weeklyHours: number | null;
  // Step 8 (tri)
  strengthIncluded: boolean | null;
  strengthIntent: 'performance' | 'support' | null;
  /**
   * Same-day strength + quality endurance ordering preference (STRENGTH-PROTOCOL.md §6.5).
   * Only surfaces in the wizard when `strengthIntent === 'performance'` (Hybrid). For
   * `support` / `none` intents the engine defaults to `endurance_first`. Default for hybrid
   * is `endurance_first` (Doma & Deakin — protects running economy and race performance).
   * Athletes who prioritize lifts can flip to `strength_first` (Eddens 2018 — protects
   * lower-body dynamic strength). Drives AM/PM ordering on Lower + Quality Run/Bike pairings.
   */
  strengthOrderingPreference: 'endurance_first' | 'strength_first' | null;
  /**
   * Heaviest dumbbell pair the athlete has access to (per hand, lb). Surfaces in Step 8 when the
   * athlete has DBs but no barbell — drives the spec §8.2 cap-and-scale-reps prescription. Default
   * 50 lb when the input is shown.
   */
  dbMaxLb: number | null;
  // Step 9
  planStartDate: string;
  anythingUnusual: string;
  assessmentWeekPreference: 'assessment_first' | 'jump_in' | null;
  /** Step after races — optional prior comparable race for pacing context */
  priorRaceSkipped: boolean;
  /** User chose "I'll add a finish" */
  priorRaceHasEntry: boolean;
  priorRaceDistance: string;
  /** Optional — helps coach/context recognize the event */
  priorRaceName: string;
  /** Optional calendar year (4 digits), e.g. 2024 — stored alongside full race date */
  priorRaceYear: string;
  /** yyyy-mm-dd */
  priorRaceDate: string;
  /** Clock finish — hh:mm:ss for triathlon/long races; run shorts may use mm:ss */
  priorRaceTimeStr: string;
  priorRaceContinuity: 'steady' | 'spotty' | 'long_break' | null;
};

function priorSimilarRaceTrainingPrefs(state: WizardState): Record<string, unknown> {
  if (state.priorRaceSkipped) {
    return {
      prior_similar_race: { skipped: true, captured_at: new Date().toISOString() },
    };
  }
  if (!state.priorRaceHasEntry) return {};
  const sec = parseWizardPriorRaceSeconds(state.priorRaceDistance, state.priorRaceTimeStr);
  const timeTouched = state.priorRaceTimeStr.trim() !== '';
  if (!state.priorRaceDistance.trim() || !state.priorRaceDate.trim() || !state.priorRaceContinuity) return {};
  // Allow omitting finish time; if they typed something, it must parse.
  if (timeTouched && (sec == null || sec <= 0)) return {};
  const yr = parseWizardPriorRaceYear(state.priorRaceYear);
  const name = state.priorRaceName.trim();
  const rec: Record<string, unknown> = {
    skipped: false,
    distance: state.priorRaceDistance.trim(),
    ...(name ? { event_name: name } : {}),
    ...(yr != null ? { event_year: yr } : {}),
    event_date: state.priorRaceDate.trim().slice(0, 10),
    continuity: state.priorRaceContinuity,
    captured_at: new Date().toISOString(),
  };
  if (sec != null && sec > 0) rec.finish_seconds = Math.round(sec);
  return {
    prior_similar_race: rec,
  };
}

function priorSimilarRaceSummaryLine(state: WizardState): string {
  if (state.priorRaceSkipped || !state.priorRaceHasEntry) return '';
  const sec = parseWizardPriorRaceSeconds(state.priorRaceDistance, state.priorRaceTimeStr);
  const timeTouched = state.priorRaceTimeStr.trim() !== '';
  if (!state.priorRaceDate.trim() || !state.priorRaceContinuity) return '';
  if (timeTouched && (sec == null || sec <= 0)) return '';
  const cont =
    state.priorRaceContinuity === 'steady'
      ? 'steady training since'
      : state.priorRaceContinuity === 'spotty'
        ? 'spotty training since'
        : 'long break since';
  const yr = parseWizardPriorRaceYear(state.priorRaceYear);
  const name = state.priorRaceName.trim();
  const label =
    name && yr != null
      ? `${name} (${yr})`
      : name
        ? name
        : yr != null
          ? `(${yr})`
          : '';
  const prefix = label ? `${label}: prior ${state.priorRaceDistance}` : `Prior ${state.priorRaceDistance}`;
  const finishPhrase =
    sec != null && sec > 0 ? `finish ${fmtHMS(sec)}` : 'finish time not entered';
  return `${prefix} ${finishPhrase} on ${state.priorRaceDate.trim().slice(0, 10)} (${cont}).`;
}

type WizardSetState = React.Dispatch<React.SetStateAction<WizardState>>;

function blank(): WizardState {
  const nextMonday = (() => {
    const d = new Date();
    const day = d.getDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMonday);
    return d.toISOString().slice(0, 10);
  })();
  return {
    races: [{ id: crypto.randomUUID(), name: '', distance: '70.3', targetDate: '', priority: 'A' }],
    trainingIntent: null,
    swimExperience: null,
    swimIntent: null,
    hasGroupRide: null, groupRideDay: '', groupRideIntensity: null,
    groupRideRouteUrl: '', groupRideRouteSnapshot: null, groupRideRouteFetching: false,
    groupRideRouteFetchError: null,
    hasGroupRun: null, groupRunDay: '', groupRunIntensity: null,
    runQualityPlacement: null,
    bikeQualityPlacement: null,
    longRideDay: '', longRunDay: '',
    daysPerWeek: null,
    weeklyHours: null,
    strengthIncluded: null, strengthIntent: null, strengthOrderingPreference: null,
    dbMaxLb: null,
    planStartDate: nextMonday,
    anythingUnusual: '',
    assessmentWeekPreference: null,
    priorRaceSkipped: true,
    priorRaceHasEntry: false,
    priorRaceDistance: '70.3',
    priorRaceName: '',
    priorRaceYear: '',
    priorRaceDate: '',
    priorRaceTimeStr: '',
    priorRaceContinuity: null,
  };
}

/** Restore local draft (same device); validates minimal shape. */
function hydrateWizardDraft(raw: Record<string, unknown>): WizardState | null {
  if (!Array.isArray(raw.races) || raw.races.length === 0) return null;
  const base = blank();
  const merged = { ...base, ...raw } as WizardState;
  const draftHadPriorKeys = 'priorRaceSkipped' in raw || 'priorRaceHasEntry' in raw;
  const cr =
    merged.priorRaceContinuity === 'steady' ||
    merged.priorRaceContinuity === 'spotty' ||
    merged.priorRaceContinuity === 'long_break'
      ? merged.priorRaceContinuity
      : null;
  return {
    ...merged,
    races: raw.races as WizardRace[],
    groupRideRouteFetching: false,
    groupRideRouteFetchError: null,
    priorRaceSkipped: draftHadPriorKeys ? Boolean(merged.priorRaceSkipped) : true,
    priorRaceHasEntry: draftHadPriorKeys ? Boolean(merged.priorRaceHasEntry) : false,
    priorRaceDistance:
      typeof merged.priorRaceDistance === 'string' && merged.priorRaceDistance.trim()
        ? merged.priorRaceDistance
        : base.priorRaceDistance,
    priorRaceName: typeof merged.priorRaceName === 'string' ? merged.priorRaceName : '',
    priorRaceYear: typeof merged.priorRaceYear === 'string' ? merged.priorRaceYear : '',
    priorRaceDate: typeof merged.priorRaceDate === 'string' ? merged.priorRaceDate : '',
    priorRaceTimeStr: typeof merged.priorRaceTimeStr === 'string' ? merged.priorRaceTimeStr : '',
    priorRaceContinuity: cr,
  };
}

function readInitialWizard(): { state: WizardState; stepIdx: number } {
  const uid = getStoredUserId();
  if (!uid) return { state: blank(), stepIdx: 0 };
  const d = loadArcWizardDraft(uid);
  if (!d) return { state: blank(), stepIdx: 0 };
  const h = hydrateWizardDraft(d.state);
  if (!h) return { state: blank(), stepIdx: 0 };
  return { state: h, stepIdx: d.stepIdx };
}

// ─── Inference helpers (fill required fields the wizard didn't explicitly ask) ─

function inferDays(state: WizardState) {
  // Only fixed external anchors are explicit. Everything else is left for the
  // planner + week-conflict-resolver to place using bike/run anchors and long-day spacing.
  const taken = new Set<string>([
    state.groupRideDay, state.groupRunDay,
    state.longRideDay || 'saturday', state.longRunDay || 'sunday',
  ].filter(Boolean));

  const pick = (candidates: string[]) => candidates.find(d => !taken.has(d)) || candidates[0] || 'friday';

  const fixedQualityBike = state.hasGroupRide && state.groupRideIntensity === 'quality_bike' && state.groupRideDay
    ? state.groupRideDay : null;
  const fixedEasyBike = state.hasGroupRide && state.groupRideIntensity === 'easy_bike' && state.groupRideDay
    ? state.groupRideDay : null;
  const fixedQualityRun = state.hasGroupRun && state.groupRunIntensity === 'quality_run' && state.groupRunDay
    ? state.groupRunDay : null;
  const fixedEasyRun = state.hasGroupRun && state.groupRunIntensity === 'easy_run' && state.groupRunDay
    ? state.groupRunDay : null;

  // Planner default fallbacks (used only when there's no fixed anchor).
  const qualityBike = fixedQualityBike ?? pick(['tuesday', 'wednesday', 'thursday']);
  const easyBike    = fixedEasyBike    ?? pick(['thursday', 'tuesday', 'monday', 'friday'].filter(d => d !== qualityBike));
  const qualityRun  = fixedQualityRun  ?? pick(['thursday', 'tuesday', 'wednesday'].filter(d => d !== qualityBike && d !== easyBike));
  const easyRun     = fixedEasyRun     ?? pick(['friday', 'monday', 'tuesday', 'wednesday'].filter(d => d !== qualityRun && d !== qualityBike));

  const swimCount = state.swimIntent === 'focus' ? 3 : state.swimIntent === 'race' ? 2 : 0;
  const swimCandidates = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const heavyDays = new Set([state.longRideDay || 'saturday', state.longRunDay || 'sunday']);
  const swimDays: string[] = [];
  for (const d of swimCandidates) {
    if (!heavyDays.has(d) && swimDays.length < swimCount) swimDays.push(d);
  }
  while (swimDays.length < swimCount) swimDays.push(swimCandidates[swimDays.length] || 'monday');

  return { qualityBike, easyBike, qualityRun, easyRun, swimDays };
}

// ─── Payload assembly ─────────────────────────────────────────────────────────

/** Normalize optional group-ride route URL for training_prefs (https only after parse). */
function sanitizeGroupRideRouteUrl(raw: string): string | undefined {
  const t = raw.trim().slice(0, 512);
  if (!t) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.href.slice(0, 512);
  } catch {
    return undefined;
  }
}

function assemblePayload(state: WizardState): ArcSetupPayload {
  const primaryRace = state.races.find(r => r.priority === 'A') || state.races[0]!;
  const triPlan = isTri(primaryRace?.distance || '');
  const { swimDays } = inferDays(state);
  const strengthFreq = state.strengthIncluded
    ? (state.strengthIntent === 'performance' ? 2 : 1) : 0;

  // Only emit FIXED anchors (user-immovable external commitments + long days).
  // Quality/easy slots without a fixed anchor are omitted so the planner +
  // week-conflict-resolver can place them around the bike anchor / run anchor /
  // long-day spacing using the existing conflict matrix.
  const preferredDays: Record<string, unknown> = {
    long_run: state.longRunDay || 'sunday',
  };

  // Run anchor (track night / club run / fixed group)
  if (state.hasGroupRun && state.groupRunDay && state.groupRunIntensity) {
    if (state.groupRunIntensity === 'quality_run') preferredDays.quality_run = state.groupRunDay;
    else preferredDays.easy_run = state.groupRunDay;
  }

  if (triPlan) {
    preferredDays.long_ride = state.longRideDay || 'saturday';
    preferredDays.swim = swimDays;

    // Bike anchor (fixed group ride)
    if (state.hasGroupRide && state.groupRideDay && state.groupRideIntensity) {
      if (state.groupRideIntensity === 'quality_bike') preferredDays.quality_bike = state.groupRideDay;
      else preferredDays.easy_bike = state.groupRideDay;
    }

    if (state.strengthIncluded) {
      // CO-EQUAL FIXED CONTRACT: Mon upper / Thu lower
      preferredDays.strength = ['monday', 'thursday'];
    }
  }

  // Build the summary line
  const weeksOut = primaryRace?.targetDate
    ? Math.round((new Date(primaryRace.targetDate + 'T12:00:00').getTime() - Date.now()) / 604_800_000)
    : null;
  const intentLabel = state.trainingIntent === 'performance' ? 'performance build'
    : state.trainingIntent === 'first_race' ? 'first-time finish'
    : 'strong finish';
  const summary = [
    weeksOut != null ? `${weeksOut} weeks to ${primaryRace?.name || 'race day'}.` : '',
    `${intentLabel.charAt(0).toUpperCase() + intentLabel.slice(1)}.`,
    priorSimilarRaceSummaryLine(state),
    triPlan && state.swimIntent === 'focus' ? 'Three swims a week (~yardage targets vary by week).' : triPlan && state.swimIntent === 'race' ? 'Two swims a week (~yardage targets vary by week).' : '',
    state.strengthIncluded
      ? state.strengthIntent === 'performance' ? 'Two strength days, co-equal goal.' : 'Strength supports tri.'
      : '',
    state.anythingUnusual ? `Note: ${state.anythingUnusual.slice(0, 80)}` : '',
  ].filter(Boolean).join(' ');

  const groupRideRouteStored =
    triPlan && state.hasGroupRide ? sanitizeGroupRideRouteUrl(state.groupRideRouteUrl) : undefined;
  const snapshotPersist =
    groupRideRouteStored &&
    state.groupRideRouteSnapshot &&
    state.groupRideRouteSnapshot.route_url_normalized === groupRideRouteStored
      ? state.groupRideRouteSnapshot
      : undefined;

  // §SESSION-FREQUENCY-DEFAULTS — derive per-discipline session counts from athlete-supplied
  // weekly hours (Step 7B). Fallback to tier-2 midpoint (9hr) when the athlete bypasses the
  // step somehow — keeps the engine receiving a sane value rather than NaN.
  const weeklyHoursValue = typeof state.weeklyHours === 'number' && Number.isFinite(state.weeklyHours)
    ? state.weeklyHours
    : 9;
  const swimIntentForFreq: SwimFreqIntent | undefined =
    triPlan && (state.swimIntent === 'focus' || state.swimIntent === 'race') ? state.swimIntent : undefined;
  const strengthIntentForFreq: StrengthFreqIntent =
    !state.strengthIncluded
      ? 'none'
      : state.strengthIntent === 'performance'
        ? 'performance'
        : 'support';
  const daysForMatrix = (() => {
    const d = state.daysPerWeek ?? 7;
    if (d <= 4) return 4 as const;
    if (d === 5) return 5 as const;
    if (d === 6) return 6 as const;
    return 7 as const;
  })();
  const sessionFrequencyDefaults = computeSessionFrequencyDefaults({
    weekly_hours_available: weeklyHoursValue,
    days_per_week: daysForMatrix,
    ...(swimIntentForFreq ? { swim_intent: swimIntentForFreq } : {}),
    strength_intent: strengthIntentForFreq,
    // limiter_sport is inferred server-side from Arc context (see
    // create-goal-and-materialize-plan/inferLimiterSportFromArc); the wizard doesn't ask.
    // The §4 limiter shift will fire there once the goal is persisted with limiter_sport set.
  });

  const trainingPrefs: Record<string, unknown> = {
    training_intent: state.trainingIntent || 'completion',
    days_per_week: state.daysPerWeek || 7,
    weekly_hours_available: weeklyHoursValue,
    session_frequency_defaults: sessionFrequencyDefaults,
    preferred_days: preferredDays,
    strength_frequency: strengthFreq,
    ...(triPlan &&
    state.hasGroupRide &&
    state.groupRideIntensity === 'quality_bike' &&
    state.groupRideDay
      ? { bike_quality_label: 'Group Ride' }
      : {}),
    ...(groupRideRouteStored ? { group_ride_route_url: groupRideRouteStored } : {}),
    ...(snapshotPersist ? { group_ride_route_snapshot: snapshotPersist } : {}),
    ...(state.strengthIncluded && state.strengthIntent
      ? { strength_intent: state.strengthIntent }
      : {}),
    // §6.5 ordering preference. Hybrid athletes pick; durability / none auto-default
    // to endurance_first downstream so it's safe to always emit when intent is set.
    ...(state.strengthIncluded && state.strengthIntent
      ? {
        strength_ordering_preference:
          state.strengthIntent === 'performance'
            ? (state.strengthOrderingPreference ?? 'endurance_first')
            : 'endurance_first',
      }
      : {}),
    ...(state.strengthIncluded && typeof state.dbMaxLb === 'number' && state.dbMaxLb > 0
      ? { db_max_lb: state.dbMaxLb }
      : {}),
    ...(triPlan && state.swimIntent
      ? { swim_intent: state.swimIntent }
      : {}),
    ...(triPlan && state.swimExperience ? { swim_experience: state.swimExperience } : {}),
    ...(state.anythingUnusual ? { notes: state.anythingUnusual } : {}),
    ...(state.assessmentWeekPreference
      ? { assessment_week_preference: state.assessmentWeekPreference }
      : {}),
    ...(triPlan && state.runQualityPlacement != null
      ? { run_quality_placement: state.runQualityPlacement }
      : {}),
    ...(triPlan && state.bikeQualityPlacement != null
      ? { bike_quality_placement: state.bikeQualityPlacement }
      : {}),
    ...priorSimilarRaceTrainingPrefs(state),
  };

  const primaryRaceRow = state.races.find((r) => r.priority === 'A') ?? state.races[0]!;

  const goals: Record<string, unknown>[] = state.races.map((race) => {
    const raceTri = isTri(race.distance);
    const isPrimaryRaceRow = race.id === primaryRaceRow.id;
    return {
      name: race.name || 'Race',
      goal_type: 'event',
      sport: raceTri ? 'triathlon' : 'run',
      distance: race.distance,
      target_date: race.targetDate,
      priority: race.priority,
      training_prefs: isPrimaryRaceRow
        ? trainingPrefs
        : raceTri
          // Combined season uses one weekly skeleton — copy anchors (group ride, long days, swim,
          // strength) onto B/C tri rows so DB merge + create-goal never see a stray default QB day.
          ? { ...trainingPrefs, training_intent: state.trainingIntent || 'completion' }
          : { training_intent: state.trainingIntent || 'completion' },
    };
  });

  const athleteIdentity: Record<string, unknown> = {
    training_intent: state.trainingIntent || 'completion',
  };
  if (state.strengthIncluded && state.strengthIntent) {
    athleteIdentity.season_priorities = { strength: state.strengthIntent };
  }

  const payload: ArcSetupPayload = {
    plan_start_date: state.planStartDate,
    summary,
    goals,
    default_intent: state.trainingIntent || 'completion',
    athlete_identity: athleteIdentity,
    strength_frequency: strengthFreq as 0 | 1 | 2 | 3,
  };

  if (state.assessmentWeekPreference) {
    (payload as Record<string, unknown>).assessment_week_preference = state.assessmentWeekPreference;
  }

  return payload;
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function ChoiceBtn({
  active, onClick, children, className = '',
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[56px] w-full rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition-colors
        ${active
          ? 'border-teal-400/70 bg-teal-500/15 text-teal-100'
          : 'border-white/15 bg-white/[0.05] text-white/80 hover:border-white/30 hover:bg-white/[0.09]'}
        ${className}`}
    >
      {children}
    </button>
  );
}

function ArcHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-teal-300/80 bg-teal-950/40 border border-teal-500/20 rounded-lg px-3 py-2 leading-snug">
      {children}
    </p>
  );
}

function DayPicker({
  value, onChange, label, exclude = [],
}: { value: Day | ''; onChange: (d: Day) => void; label: string; exclude?: string[] }) {
  return (
    <div>
      <p className="text-sm text-white/50 mb-2">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {DAYS.map(d => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            disabled={exclude.includes(d)}
            className={`h-10 min-w-[42px] px-1.5 rounded-lg text-[13px] font-medium border transition-colors disabled:opacity-30
              ${value === d
                ? 'border-teal-400/70 bg-teal-500/15 text-teal-100'
                : 'border-white/15 bg-white/[0.05] text-white/60 hover:border-white/30'}`}
          >
            {DAY_LABEL[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepLayout({
  step, totalSteps, title, subtitle, onBack, children, onContinue, canContinue, continueLabel = 'Continue', saving = false,
}: {
  step: number; totalSteps: number; title: string; subtitle?: string;
  onBack?: () => void; children: React.ReactNode;
  onContinue: () => void; canContinue: boolean; continueLabel?: string; saving?: boolean;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Progress */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-teal-400' : 'bg-white/15'}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-white/35 text-right">{step} of {totalSteps}</p>
      </div>

      {/* Back */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 self-start flex items-center gap-1 text-white/50 hover:text-white/80 text-sm px-4 py-1 mb-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      )}

      {/* Title */}
      <div className="shrink-0 px-4 pb-4">
        <h2 className="text-[1.3rem] font-semibold text-white leading-snug tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[15px] text-white/55 leading-relaxed">{subtitle}</p>}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 space-y-3">
        {children}
      </div>

      {/* Continue */}
      <div className="shrink-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-zinc-950">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || saving}
          className="w-full min-h-[52px] rounded-xl bg-teal-500 text-white font-semibold text-base disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {continueLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

type RaceInputPhase = 'input' | 'extracting' | 'confirm';

function Step1Races({
  state, setState, onNext, wizardStep, wizardTotalSteps,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; wizardStep: number; wizardTotalSteps: number }) {
  const [phase, setPhase] = useState<RaceInputPhase>(
    // If races were already extracted (e.g. back-navigation), start at confirm
    state.races.some(r => r.name.trim() && r.targetDate) ? 'confirm' : 'input',
  );
  const [inputText, setInputText] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);

  const extract = async () => {
    const t = inputText.trim();
    if (!t) return;
    setExtractError(null);
    setPhase('extracting');
    try {
      const { data, error } = await supabase.functions.invoke('extract-races', {
        body: { text: t },
      });
      if (error || !data) throw new Error((error as { message?: string } | null)?.message || 'Extraction failed');
      const races = (data as { races?: unknown[] }).races;
      if (!Array.isArray(races) || races.length === 0) {
        setExtractError("Couldn't find those races — try being more specific, or add them manually below.");
        setPhase('input');
        return;
      }
      const mapped: WizardRace[] = races.map((r) => {
        const ro = r as { name?: string; distance?: string; date?: string; priority?: string };
        return {
          id: crypto.randomUUID(),
          name: ro.name || 'Race',
          distance: normalizeDistance(ro.distance || '70.3'),
          targetDate: ro.date || '',
          priority: ro.priority === 'B' ? 'B' : ro.priority === 'C' ? 'C' : 'A',
        };
      });
      setState({ ...state, races: mapped });
      setPhase('confirm');
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Extraction failed');
      setPhase('input');
    }
  };

  const updateRace = (id: string, patch: Partial<WizardRace>) => {
    setState({ ...state, races: state.races.map(r => r.id === id ? { ...r, ...patch } : r) });
  };

  const removeRace = (id: string) => {
    if (state.races.length <= 1) {
      setState({
        ...state,
        races: [{ id: crypto.randomUUID(), name: '', distance: '70.3', targetDate: '', priority: 'A' }],
      });
      return;
    }
    const remaining = state.races.filter(r => r.id !== id);
    let racesOut = remaining;
    if (!remaining.some(r => r.priority === 'A') && remaining.length > 0) {
      racesOut = remaining.map((r, i) => (i === 0 ? { ...r, priority: 'A' as const } : r));
    }
    setState({ ...state, races: racesOut });
  };

  const addRace = () => {
    const count = state.races.length;
    setState({
      ...state,
      races: [...state.races, {
        id: crypto.randomUUID(), name: '', distance: '70.3', targetDate: '',
        priority: count === 0 ? 'A' : count === 1 ? 'B' : 'C',
      }],
    });
  };

  const canContinue = state.races.some(r => r.name.trim() && r.targetDate);

  // ── Input phase ────────────────────────────────────────────────────────────
  if (phase === 'input' || phase === 'extracting') {
    return (
      <StepLayout
        step={wizardStep} totalSteps={wizardTotalSteps}
        title="What does your season look like?"
        subtitle="Describe your race or races — we'll look up the dates and details."
        onContinue={extract}
        canContinue={inputText.trim().length > 0 && phase === 'input'}
        continueLabel="Find my races"
        saving={phase === 'extracting'}
      >
        <textarea
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void extract(); }}
          placeholder="e.g. Ironman Santa Cruz, Chicago Marathon"
          rows={4}
          disabled={phase === 'extracting'}
          className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[15px] px-3.5 py-3.5 focus:outline-none focus:border-teal-500/50 resize-none leading-relaxed disabled:opacity-50"
        />
        {phase === 'extracting' && (
          <div className="flex items-center gap-2 text-sm text-white/45">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking up your races…
          </div>
        )}
        {extractError && (
          <p className="text-sm text-red-300/80">{extractError}</p>
        )}
        <button
          type="button"
          onClick={() => { setState({ ...state, races: [{ id: crypto.randomUUID(), name: '', distance: '70.3', targetDate: '', priority: 'A' }] }); setPhase('confirm'); }}
          className="text-sm text-white/35 hover:text-white/55 underline underline-offset-2"
        >
          Add manually instead
        </button>
      </StepLayout>
    );
  }

  // ── Confirm phase ──────────────────────────────────────────────────────────
  return (
    <StepLayout
      step={wizardStep} totalSteps={wizardTotalSteps}
      title="Do these look right?"
      subtitle="Adjust anything before continuing."
      onContinue={onNext}
      canContinue={canContinue}
    >
      {state.races.map((race, idx) => (
        <div key={race.id} className="rounded-xl border border-white/15 bg-white/[0.04] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-400/80">
              {race.priority}-Race
            </span>
            <button
              type="button"
              title={state.races.length > 1 ? 'Remove race' : 'Clear race (start over)'}
              aria-label={state.races.length > 1 ? 'Remove race' : 'Clear race and start over'}
              onClick={() => removeRace(race.id)}
              className="text-white/30 hover:text-white/60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <input
            type="text"
            value={race.name}
            onChange={e => updateRace(race.id, { name: e.target.value })}
            placeholder="Race name"
            className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[15px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Distance</p>
              <select
                value={race.distance}
                onChange={e => updateRace(race.id, { distance: e.target.value })}
                className="w-full rounded-lg bg-zinc-800 border border-white/15 text-white text-[14px] px-2.5 py-2 focus:outline-none focus:border-teal-500/50"
              >
                <optgroup label="Triathlon">
                  {TRI_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                </optgroup>
                <optgroup label="Running">
                  {RUN_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Race date</p>
              <input
                type="date"
                value={race.targetDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => updateRace(race.id, { targetDate: e.target.value })}
                className="w-full rounded-lg bg-zinc-800 border border-white/15 text-white text-[14px] px-2.5 py-2 focus:outline-none focus:border-teal-500/50"
              />
            </div>
          </div>

          {idx > 0 && (
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Priority</p>
              <div className="flex gap-2">
                {(['A', 'B', 'C'] as const).map(p => (
                  <button
                    key={p} type="button"
                    onClick={() => updateRace(race.id, { priority: p })}
                    className={`h-9 w-12 rounded-lg text-sm font-semibold border transition-colors
                      ${race.priority === p ? 'border-teal-400/70 bg-teal-500/15 text-teal-100' : 'border-white/15 text-white/50 bg-white/[0.05]'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-white/40 leading-snug">
                <p><span className="text-white/65 font-medium">A</span> — your main goal race (shapes the whole plan).</p>
                <p><span className="text-white/65 font-medium">B</span> — secondary race you want to perform well at.</p>
                <p><span className="text-white/65 font-medium">C</span> — practice race; low taper, train through it.</p>
              </div>
            </div>
          )}
        </div>
      ))}

      {state.races.length < 3 && (
        <button
          type="button" onClick={addRace}
          className="w-full min-h-[48px] rounded-xl border border-dashed border-white/20 text-white/50 text-sm flex items-center justify-center gap-2 hover:border-white/35 hover:text-white/70"
        >
          <Plus className="h-4 w-4" /> Add another race
        </button>
      )}

      <button
        type="button"
        onClick={() => setPhase('input')}
        className="text-sm text-white/35 hover:text-white/55 underline underline-offset-2"
      >
        ← Search again
      </button>
    </StepLayout>
  );
}

function StepPriorRace({
  state,
  setState,
  onNext,
  onBack,
  step,
  totalSteps,
}: {
  state: WizardState;
  setState: WizardSetState;
  onNext: () => void;
  onBack: () => void;
  step: number;
  totalSteps: number;
}) {
  const primary = state.races.find((r) => r.priority === 'A') ?? state.races[0];
  const primaryDist = primary?.distance?.trim() || '70.3';

  const priorDateLookupRunRef = useRef(0);
  const [priorDateLookupUi, setPriorDateLookupUi] = useState<'idle' | 'loading' | 'error'>('idle');
  const [priorDateLookupHint, setPriorDateLookupHint] = useState<string | null>(null);

  useEffect(() => {
    if (!state.priorRaceHasEntry) {
      setPriorDateLookupUi('idle');
      setPriorDateLookupHint(null);
      return;
    }

    const name = state.priorRaceName.trim();
    const yr = parseWizardPriorRaceYear(state.priorRaceYear);
    const dist = state.priorRaceDistance.trim();
    const dateStr = state.priorRaceDate.trim();

    if (dateStr) {
      setPriorDateLookupUi('idle');
      setPriorDateLookupHint(null);
      return;
    }

    if (name.length < 3 || yr == null || !dist) {
      setPriorDateLookupUi('idle');
      setPriorDateLookupHint(null);
      return;
    }

    const runId = ++priorDateLookupRunRef.current;
    const timer = window.setTimeout(() => {
      if (runId !== priorDateLookupRunRef.current) return;
      void (async () => {
        if (runId !== priorDateLookupRunRef.current) return;
        setPriorDateLookupUi('loading');
        setPriorDateLookupHint(null);
        try {
          const text = `${name} — ${dist} — The athlete already finished this event in calendar year ${yr}. Find that year's official race date only (YYYY-MM-DD), not a future edition.`;
          const { data, error } = await supabase.functions.invoke('extract-races', {
            body: { text, prior_finish: true },
          });
          if (runId !== priorDateLookupRunRef.current) return;
          if (error) throw new Error((error as { message?: string }).message || 'Lookup failed');
          const races = (data as { races?: unknown[] })?.races;
          if (!Array.isArray(races) || races.length === 0) {
            setPriorDateLookupUi('error');
            setPriorDateLookupHint("Couldn't find that race date — choose it on the calendar.");
            return;
          }
          const firstWithDate = races.find((r) => {
            const ro = r as { date?: string };
            return typeof ro.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ro.date);
          }) as { date?: string; name?: string } | undefined;
          const found = firstWithDate?.date;
          if (!found) {
            setPriorDateLookupUi('error');
            setPriorDateLookupHint("Couldn't find that race date — choose it on the calendar.");
            return;
          }
          if (Number(found.slice(0, 4)) !== yr) {
            setPriorDateLookupUi('error');
            setPriorDateLookupHint("Lookup didn't match that year — set the date manually.");
            return;
          }
          const official = typeof firstWithDate.name === 'string' ? firstWithDate.name.trim() : '';
          setState((prev) => ({
            ...prev,
            priorRaceDate: found,
            ...(official.length > name.length ? { priorRaceName: official } : {}),
          }));
          setPriorDateLookupUi('idle');
          setPriorDateLookupHint(null);
        } catch {
          if (runId !== priorDateLookupRunRef.current) return;
          setPriorDateLookupUi('error');
          setPriorDateLookupHint("Couldn't look up the date — enter it manually.");
        }
      })();
    }, 650);

    return () => {
      priorDateLookupRunRef.current += 1;
      window.clearTimeout(timer);
    };
  }, [
    state.priorRaceHasEntry,
    state.priorRaceName,
    state.priorRaceYear,
    state.priorRaceDistance,
    state.priorRaceDate,
    setState,
  ]);

  const chooseSkip = () => {
    setState({
      ...state,
      priorRaceSkipped: true,
      priorRaceHasEntry: false,
      priorRaceName: '',
      priorRaceYear: '',
      priorRaceDate: '',
      priorRaceTimeStr: '',
      priorRaceContinuity: null,
    });
  };

  const chooseAdd = () => {
    setState({
      ...state,
      priorRaceSkipped: false,
      priorRaceHasEntry: true,
      priorRaceDistance: state.priorRaceDistance.trim() || primaryDist,
    });
  };

  const secOk = parseWizardPriorRaceSeconds(state.priorRaceDistance, state.priorRaceTimeStr);
  const timeTouched = state.priorRaceTimeStr.trim() !== '';
  /** Empty finish field is OK (optional). Non-empty must parse. */
  const finishFieldOk = !timeTouched || (secOk != null && secOk > 0);
  const dateYmd = state.priorRaceDate.trim().slice(0, 10);
  const yrParsed = parseWizardPriorRaceYear(state.priorRaceYear);
  const yearFieldOk =
    state.priorRaceYear.trim() === '' ||
    (yrParsed != null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || yrParsed === Number(dateYmd.slice(0, 4))));
  const canContinue =
    state.priorRaceSkipped ||
    (state.priorRaceHasEntry &&
      Boolean(state.priorRaceDistance.trim()) &&
      Boolean(state.priorRaceDate.trim()) &&
      finishFieldOk &&
      state.priorRaceContinuity != null &&
      yearFieldOk);

  const triHint =
    mapWizardDistanceToRaceDistance(state.priorRaceDistance) === 'tri_clock'
      ? 'Use hh:mm:ss (e.g. 5:42:15) or h:mm for hours + minutes only.'
      : 'Half / marathon: h:mm or hh:mm:ss. Shorter races: mm:ss.';

  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title="Recent comparable race?"
      subtitle="Optional — a finish at this distance (or close) plus how training has gone since helps calibrate expectations. Skip anytime."
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      <ArcHint>
        Strongest signal within ~6 months; still useful up to ~12 months if training stayed steady.
      </ArcHint>

      <ChoiceBtn active={state.priorRaceSkipped} onClick={chooseSkip}>
        <span className="block font-semibold text-white">Skip — first time or nothing recent</span>
        <span className="block text-[13px] text-white/55 mt-0.5">No comparable finish to share — we’ll lean on your logs and baselines.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.priorRaceHasEntry} onClick={chooseAdd}>
        <span className="block font-semibold text-white">Add a recent finish</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Same distance or similar event — rough time is fine.</span>
      </ChoiceBtn>

      {state.priorRaceHasEntry && (
        <div className="space-y-3 pt-1">
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">Event distance</p>
            <select
              value={state.priorRaceDistance}
              onChange={(e) => setState({ ...state, priorRaceDistance: e.target.value })}
              className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white text-[14px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            >
              {ALL_DISTANCES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">Race name <span className="text-white/25">(optional)</span></p>
            <input
              type="text"
              placeholder="e.g. Ironman 70.3 Santa Cruz"
              value={state.priorRaceName}
              onChange={(e) => setState({ ...state, priorRaceName: e.target.value })}
              className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[14px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            />
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">Year <span className="text-white/25">(optional)</span></p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 2024"
              autoComplete="off"
              maxLength={4}
              value={state.priorRaceYear}
              onChange={(e) => setState({ ...state, priorRaceYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[14px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            />
            <p className="text-[11px] text-white/35 mt-1">
              If you enter a year, it must match the calendar year of the race date. With name and year filled in,
              we look up the date for you (same service as &quot;Find my races&quot; on the season step).
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">Race date</p>
            {priorDateLookupUi === 'loading' && (
              <div className="flex items-center gap-2 text-[11px] text-white/45 mb-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Looking up race date…
              </div>
            )}
            {priorDateLookupUi === 'error' && priorDateLookupHint && (
              <p className="text-[11px] text-amber-200/85 mb-1.5">{priorDateLookupHint}</p>
            )}
            <input
              type="date"
              value={state.priorRaceDate}
              onChange={(e) => setState({ ...state, priorRaceDate: e.target.value })}
              className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white text-[14px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            />
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">
              Finish time <span className="text-white/25">(optional)</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 5:42:15 or 3:45:30"
              value={state.priorRaceTimeStr}
              onChange={(e) => setState({ ...state, priorRaceTimeStr: e.target.value })}
              className="w-full rounded-lg bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[14px] px-3 py-2.5 focus:outline-none focus:border-teal-500/50"
            />
            <p className="text-[11px] text-white/35 mt-1">{triHint}</p>
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1.5">Training since that race</p>
            <div className="flex flex-col gap-2">
              <ChoiceBtn
                active={state.priorRaceContinuity === 'steady'}
                onClick={() => setState({ ...state, priorRaceContinuity: 'steady' })}
              >
                <span className="block font-semibold text-white">Pretty steady</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Kept training consistently.</span>
              </ChoiceBtn>
              <ChoiceBtn
                active={state.priorRaceContinuity === 'spotty'}
                onClick={() => setState({ ...state, priorRaceContinuity: 'spotty' })}
              >
                <span className="block font-semibold text-white">On and off</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Some breaks or inconsistent weeks.</span>
              </ChoiceBtn>
              <ChoiceBtn
                active={state.priorRaceContinuity === 'long_break'}
                onClick={() => setState({ ...state, priorRaceContinuity: 'long_break' })}
              >
                <span className="block font-semibold text-white">Long break</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Months away or mostly inactive.</span>
              </ChoiceBtn>
            </div>
          </div>
        </div>
      )}
    </StepLayout>
  );
}

/** Map LLM distance strings to the canonical display values used by the wizard. */
function normalizeDistance(raw: unknown): string {
  const r = typeof raw === 'string' ? raw : String(raw ?? '');
  const s = r.toLowerCase().trim();
  if (s === 'ironman' || s === 'full' || s === 'full ironman') return 'Ironman';
  if (s === '70.3' || s === 'half ironman' || s === 'half-ironman') return '70.3';
  if (s === 'olympic') return 'Olympic';
  if (s === 'sprint') return 'Sprint';
  if (s === 'marathon') return 'Marathon';
  if (s === 'half marathon' || s === 'half-marathon') return 'Half Marathon';
  if (s === '10k' || s === '10km') return '10K';
  if (s === '5k' || s === '5km') return '5K';
  return r; // pass through if unrecognized
}

function Step2Intent({
  state, setState, onNext, onBack, step, totalSteps,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
  const primaryRace = state.races.find(r => r.priority === 'A') || state.races[0];
  const raceName = primaryRace?.name || 'your race';

  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title={`What's the goal for ${raceName}?`}
      onBack={onBack} onContinue={onNext} canContinue={state.trainingIntent !== null}
    >
      <ChoiceBtn active={state.trainingIntent === 'performance'} onClick={() => setState({ ...state, trainingIntent: 'performance' })}>
        <span className="block font-semibold text-white">Race the clock</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Interval and threshold sessions, pace targets on every quality workout, recovery every 3–4 weeks. Built to go faster.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.trainingIntent === 'completion'} onClick={() => setState({ ...state, trainingIntent: 'completion' })}>
        <span className="block font-semibold text-white">Strong, healthy finish</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Aerobic-focused build with quality work as the supporting layer. Same week structure as Race the Clock — you control the effort on quality days.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.trainingIntent === 'first_race'} onClick={() => setState({ ...state, trainingIntent: 'first_race' })}>
        <span className="block font-semibold text-white">First time at this distance</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Same plan shape as Strong, healthy finish — pick this if you want a conservative mental frame. Pace pressure stays with you, not the plan.</span>
      </ChoiceBtn>
    </StepLayout>
  );
}

function Step3Swim({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  const primary = state.races.find(r => r.priority === 'A') ?? state.races[0];
  const is703 = String(primary?.distance ?? '').toLowerCase().includes('70.3');

  const swimPaceSec: number | null = (() => {
    const pn = arc?.performanceNumbers;
    if (!pn) return null;
    const raw = pn['swimPacePer100'] ?? pn['swimPace100'] ?? pn['swim_pace_100_yd'] ?? pn['swim_pace_per_100_sec'];
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const swimNote = arc
    ? arc.swimSessions28 >= 3
      ? `Last 4 weeks: about ${arc.swimSessions28} swims/week on your log — good rhythm if you want swim focus.`
      : arc.swimSessions28 === 2
      ? `Last 4 weeks: 2 swims/week on your log.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
      : arc.swimSessions28 === 1
      ? `Last 4 weeks: 1 swim on your log.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
      : swimPaceSec
        ? `No swims in the last 4 weeks on your log — pace on file is ${fmtSwimPace(swimPaceSec)}; weekly yardage still matters for race durability.`
        : `No swims in the last 4 weeks on your log — early weeks are often about rhythm and feel before chasing pace.`
    : null;

  const title = 'Swimming — experience & weekly yardage';
  const subtitle = is703
    ? 'Many beginner-friendly 70.3 builds aim near 5,000–6,000 yards/week in the pool for shoulder durability and open-water margin — split across either two longer sessions or three shorter ones.'
    : 'Pick how much swimming fits your week. Plans scale yardage with your goal — pool totals matter more than session labels alone.';

  const race703Lines =
    'Two pool days. Typical band when schedule allows: ~2,500–3,000 yd per session (toward ~5k–6k yd/week). Fewer weekdays, longer visits — good when pool time is limited to a couple of blocks.';
  const focus703Lines =
    'Three pool days. Typical band when schedule allows: ~1,800–2,000 yd per session (similar weekly total with more feel for the water). Better technique frequency; pulls a bit more from bike/run load.';

  const canContinue = state.swimExperience !== null && state.swimIntent !== null;

  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      {swimNote && <ArcHint>{swimNote}</ArcHint>}

      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40 px-1 mb-2 mt-1">Experience</p>
      <ChoiceBtn active={state.swimExperience === 'learning'} onClick={() => setState({ ...state, swimExperience: 'learning' })}>
        <span className="block font-semibold text-white">Learning or rebuilding</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Newer to structured laps, stroke still coming together, or long time out of the pool.</span>
      </ChoiceBtn>
      {state.swimExperience === 'learning' && (
        <ArcHint>
          <strong>No swim pace baseline?</strong> Swim a 200yd time trial at sustainable hard effort in your first week or two, divide the time by 2, add 5 seconds. That&rsquo;s your starting 100yd pace. Add it to your profile and your plan will recalibrate on the next regenerate.
        </ArcHint>
      )}
      <ChoiceBtn active={state.swimExperience === 'steady'} onClick={() => setState({ ...state, swimExperience: 'steady' })}>
        <span className="block font-semibold text-white">Steady</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Comfortable swimming continuous laps; mostly building fitness and pacing.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.swimExperience === 'strong'} onClick={() => setState({ ...state, swimExperience: 'strong' })}>
        <span className="block font-semibold text-white">Strong swimmer</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Swim is not my weak leg — maintenance and sharpness are enough.</span>
      </ChoiceBtn>

      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/40 px-1 mb-2 mt-5">Weekly structure</p>
      <ChoiceBtn active={state.swimIntent === 'race'} onClick={() => setState({ ...state, swimIntent: 'race' })}>
        <span className="block font-semibold text-white">Race-ready — 2 sessions/week</span>
        <span className="block text-[13px] text-white/55 mt-0.5">
          {is703 ? race703Lines : 'One harder swim and one easier swim — keeps the leg sharp while protecting bike and run.'}
        </span>
      </ChoiceBtn>
      <ChoiceBtn active={state.swimIntent === 'focus'} onClick={() => setState({ ...state, swimIntent: 'focus' })}>
        <span className="block font-semibold text-white">Swim focus — 3 sessions/week</span>
        <span className="block text-[13px] text-white/55 mt-0.5">
          {is703 ? focus703Lines : 'Technique, moderate aerobic, and harder work — swim as a development priority for this build.'}
        </span>
      </ChoiceBtn>
    </StepLayout>
  );
}

function Step4Bike({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  const canContinue = state.hasGroupRide !== null &&
    (state.hasGroupRide === false || (!!state.groupRideDay && state.groupRideIntensity !== null));

  const ftp = (() => {
    const manual = arc?.performanceNumbers?.ftp ?? arc?.performanceNumbers?.FTP;
    if (typeof manual === 'number' && manual > 0) return Math.round(manual);
    const learned = arc?.learnedFitness?.ride_ftp_estimated;
    if (typeof learned === 'number' && learned > 0) return Math.round(learned);
    return null;
  })();

  const bikeNote = arc
    ? ftp
      ? `FTP on file: ~${ftp}w. Bike intervals will be calibrated to that baseline.`
      : `No FTP on file. Bike intervals will use RPE until we calibrate.`
    : null;

  const set = (hasGroupRide: boolean) =>
    setState(prev => ({
      ...prev,
      hasGroupRide,
      groupRideDay: '',
      groupRideIntensity: null,
      runQualityPlacement: null,
      groupRideRouteUrl: hasGroupRide ? prev.groupRideRouteUrl : '',
      groupRideRouteSnapshot: hasGroupRide ? prev.groupRideRouteSnapshot : null,
      groupRideRouteFetching: hasGroupRide ? prev.groupRideRouteFetching : false,
      groupRideRouteFetchError: hasGroupRide ? prev.groupRideRouteFetchError : null,
    }));

  const routeStored = sanitizeGroupRideRouteUrl(state.groupRideRouteUrl);
  const routeInvalidHint =
    state.groupRideRouteUrl.trim().length > 0 && !routeStored;

  useEffect(() => {
    const norm = sanitizeGroupRideRouteUrl(state.groupRideRouteUrl);
    if (!norm || !stravaRouteUrlLooksFetchable(norm)) {
      setState(prev => {
        if (
          prev.groupRideRouteSnapshot === null &&
          !prev.groupRideRouteFetching &&
          prev.groupRideRouteFetchError === null
        ) {
          return prev;
        }
        return {
          ...prev,
          groupRideRouteSnapshot: null,
          groupRideRouteFetching: false,
          groupRideRouteFetchError: null,
        };
      });
      return;
    }

    const handle = window.setTimeout(() => {
      void (async () => {
        if (!getStoredUserId()) return;
        setState(prev => ({ ...prev, groupRideRouteFetching: true, groupRideRouteFetchError: null }));
        const { data, error } = await invokeFunction<{
          success?: boolean;
          snapshot?: GroupRideRouteSnapshot;
          error?: string;
          needs_strava_connect?: boolean;
        }>('fetch-strava-route', { route_url: norm });

        setState(prev => {
          const still = sanitizeGroupRideRouteUrl(prev.groupRideRouteUrl) === norm;
          if (!still) {
            return { ...prev, groupRideRouteFetching: false };
          }
          const base = { ...prev, groupRideRouteFetching: false };
          if (error) {
            return {
              ...base,
              groupRideRouteSnapshot: null,
              groupRideRouteFetchError:
                typeof error.message === 'string' ? error.message : 'Could not reach route service.',
            };
          }
          const body = data as Record<string, unknown> | null;
          if (!body || body.success !== true || body.snapshot == null) {
            const needs = body?.needs_strava_connect === true;
            const msg =
              typeof body?.error === 'string'
                ? body.error
                : needs
                  ? 'Connect Strava (Integrations) to auto-fill route climbing from this link.'
                  : 'Could not load route stats.';
            return {
              ...base,
              groupRideRouteSnapshot: null,
              groupRideRouteFetchError: msg,
            };
          }
          return {
            ...base,
            groupRideRouteSnapshot: body.snapshot as GroupRideRouteSnapshot,
            groupRideRouteFetchError: null,
          };
        });
      })();
    }, 550);

    return () => window.clearTimeout(handle);
  }, [state.groupRideRouteUrl]);

  const routeTopoTier =
    state.groupRideRouteSnapshot &&
    routeStored &&
    state.groupRideRouteSnapshot.route_url_normalized === routeStored
      ? climbNoticeTier(state.groupRideRouteSnapshot)
      : 'none';

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Do you have a regular group ride?"
      subtitle="Just the fixed external one — we'll pin your bike week to it. The planner places everything else."
      onBack={onBack} onContinue={onNext} canContinue={canContinue}
    >
      <div className="flex gap-2">
        <ChoiceBtn active={state.hasGroupRide === true} onClick={() => set(true)}>Yes</ChoiceBtn>
        <ChoiceBtn active={state.hasGroupRide === false} onClick={() => set(false)}>No</ChoiceBtn>
      </div>

      {bikeNote && <ArcHint>{bikeNote}</ArcHint>}

      {state.hasGroupRide === true && (
        <>
          <DayPicker
            value={state.groupRideDay as Day | ''}
            onChange={d => setState(prev => ({ ...prev, groupRideDay: d }))}
            label="Which day?"
          />
          <div>
            <p className="text-sm text-white/50 mb-2">How hard is it?</p>
            <div className="space-y-2">
              <ChoiceBtn
                active={state.groupRideIntensity === 'quality_bike'}
                onClick={() => setState(prev => ({ ...prev, groupRideIntensity: 'quality_bike' }))}
              >
                <span className="block font-semibold">Hard — competitive pace, real efforts</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Counts as your quality bike session for the week.</span>
              </ChoiceBtn>
              <ChoiceBtn
                active={state.groupRideIntensity === 'easy_bike'}
                onClick={() => setState(prev => ({ ...prev, groupRideIntensity: 'easy_bike' }))}
              >
                <span className="block font-semibold">Easy — social, conversational pace</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Counts as aerobic. The planner adds a separate quality session.</span>
              </ChoiceBtn>
            </div>
          </div>
          <div>
            <p className="text-sm text-white/50 mb-2">Route link <span className="text-white/35">(optional)</span></p>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.strava.com/routes/…"
              value={state.groupRideRouteUrl}
              onChange={e => setState(prev => ({ ...prev, groupRideRouteUrl: e.target.value }))}
              className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
            />
            <p className="mt-1.5 text-[11px] text-white/35">
              Saves on your plan — useful when mid-week run quality stacks with this ride (same day or adjacent). Paste any https route link.
            </p>
            {routeInvalidHint && (
              <p className="mt-1 text-[11px] text-amber-400/85">
                That doesn&apos;t look like a valid https URL — fix it or clear the field to continue saving it.
              </p>
            )}
            {state.groupRideRouteFetching && (
              <p className="mt-2 text-[12px] text-teal-200/75 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                Loading route profile from Strava…
              </p>
            )}
            {state.groupRideRouteFetchError &&
              !state.groupRideRouteFetching &&
              routeStored &&
              stravaRouteUrlLooksFetchable(routeStored) && (
              <p className="mt-2 text-[12px] text-amber-400/85">{state.groupRideRouteFetchError}</p>
            )}
            {routeTopoTier === 'aggressive' && (
              <ArcHint>
                Serious climbing on this route — expect higher bike stress than the hours alone suggest.
                If your plan puts quality running on the very next day (for example Thursday after a Wednesday ride),
                we may ease that session slightly for recovery. That reflects how we stack sessions in the week,
                not an assumption that you “run intervals.”
              </ArcHint>
            )}
            {routeTopoTier === 'notice' && (
              <ArcHint>
                Rolling profile — expect more metabolic cost than a flat ride for the same time on the clock. We apply a modest bike load floor on this fixed ride when building volume.
              </ArcHint>
            )}
          </div>
        </>
      )}
    </StepLayout>
  );
}

function Step5Run({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  const canContinue = state.hasGroupRun !== null &&
    (state.hasGroupRun === false || (!!state.groupRunDay && state.groupRunIntensity !== null));

  // learned_fitness paces are stored as { value: number, confidence, sample_count }
  const readLearnedPace = (key: string): number | null => {
    const raw = arc?.learnedFitness?.[key];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === 'number' && v > 0) return v;
    }
    return null;
  };
  const threshSec = readLearnedPace('run_threshold_pace_sec_per_km');
  const easySec   = readLearnedPace('run_easy_pace_sec_per_km');
  const runPaceNote = arc
    ? threshSec
      ? easySec
        ? `Run paces on file — threshold: ${fmtPaceKm(threshSec)}, easy: ${fmtPaceKm(easySec)}. Intervals will land around these.`
        : `Threshold pace on file: ${fmtPaceKm(threshSec)}. Run intervals will be calibrated to that.`
      : `No threshold pace on file. Run targets will use effort zones until we have data.`
    : null;

  const set = (hasGroupRun: boolean) =>
    setState({
      ...state,
      hasGroupRun,
      groupRunDay: '',
      groupRunIntensity: null,
      bikeQualityPlacement: null,
    });

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Do you have a fixed run night or run group?"
      subtitle="Just the fixed external one — track night, club run, group tempo. The planner places everything else."
      onBack={onBack} onContinue={onNext} canContinue={canContinue}
    >
      <div className="flex gap-2">
        <ChoiceBtn active={state.hasGroupRun === true} onClick={() => set(true)}>Yes</ChoiceBtn>
        <ChoiceBtn active={state.hasGroupRun === false} onClick={() => set(false)}>No</ChoiceBtn>
      </div>

      {runPaceNote && <ArcHint>{runPaceNote}</ArcHint>}

      {state.hasGroupRun === true && (
        <>
          <DayPicker
            value={state.groupRunDay as Day | ''}
            onChange={d => setState({ ...state, groupRunDay: d })}
            label="Which day?"
          />
          <div>
            <p className="text-sm text-white/50 mb-2">What kind of session?</p>
            <div className="space-y-2">
              <ChoiceBtn
                active={state.groupRunIntensity === 'quality_run'}
                onClick={() => setState({ ...state, groupRunIntensity: 'quality_run' })}
              >
                <span className="block font-semibold">Track / tempo / intervals</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Hard effort. Counts as your quality run for the week.</span>
              </ChoiceBtn>
              <ChoiceBtn
                active={state.groupRunIntensity === 'easy_run'}
                onClick={() => setState({ ...state, groupRunIntensity: 'easy_run' })}
              >
                <span className="block font-semibold">Easy / social long run</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Conversational pace. Counts as aerobic. The planner adds a separate quality session.</span>
              </ChoiceBtn>
            </div>
          </div>
        </>
      )}
    </StepLayout>
  );
}

/** Tri only — shown after anchored hard group ride (quality bike day pinned). */
function StepTriRunQualityPlacement({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: {
  state: WizardState;
  setState: WizardSetState;
  onNext: () => void;
  onBack: () => void;
  step: number;
  totalSteps: number;
  arc: WizardArcContext | null;
}) {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const ride = state.groupRideDay ? cap(state.groupRideDay) : 'group ride';
  const canContinue = state.runQualityPlacement !== null;
  const historyHint = hintRunQualityPlacementFromHistory(arc);

  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title="Run intervals after your hard bike day?"
      subtitle={`Hard mid-week run sessions often land the next day after ${ride} (e.g. Wed ride → Thu run). Some athletes handle hard back-to-back days well; others fold the hard running into Sunday's long run instead.`}
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      {historyHint && <ArcHint>{historyHint}</ArcHint>}
      <div className="space-y-2">
        <ChoiceBtn
          active={state.runQualityPlacement === 'standalone_midweek'}
          onClick={() => setState(prev => ({ ...prev, runQualityPlacement: 'standalone_midweek' }))}
        >
          <span className="block font-semibold">Separate mid-week intervals</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Hard intervals get their own mid-week day, often the day after your hard bike day — for athletes who recover quickly on the run.
          </span>
        </ChoiceBtn>
        <ChoiceBtn
          active={state.runQualityPlacement === 'long_run_blend'}
          onClick={() => setState(prev => ({ ...prev, runQualityPlacement: 'long_run_blend' }))}
        >
          <span className="block font-semibold">Fold hard running into Sunday long</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Skip the separate mid-week hard session; Sunday's long run carries the harder pace blocks — recovery-first.
          </span>
        </ChoiceBtn>
      </div>
      <p className="text-[11px] text-white/35 px-0.5 pt-1">
        This saves to your plan; you can adjust later if your recovery patterns change.
      </p>
    </StepLayout>
  );
}

/** Tri only — shown after anchored quality run (club / track night). Preference is persisted for bike/run geometry + resolver. */
function StepTriBikeQualityPlacement({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: {
  state: WizardState;
  setState: WizardSetState;
  onNext: () => void;
  onBack: () => void;
  step: number;
  totalSteps: number;
  arc: WizardArcContext | null;
}) {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rn = state.groupRunDay ? cap(state.groupRunDay) : 'run anchor';
  const canContinue = state.bikeQualityPlacement !== null;
  const historyHint = hintBikeQualityPlacementFromHistory(arc);

  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title="Hard bike day when run club pins a hard day?"
      subtitle={`Your ${rn} session is fixed. Hard mid-week bike work may land on an adjacent day — some athletes keep both hard days; others prefer harder work folded into Saturday's long ride when the week gets cramped.`}
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      {historyHint && <ArcHint>{historyHint}</ArcHint>}
      <div className="space-y-2">
        <ChoiceBtn
          active={state.bikeQualityPlacement === 'standalone_midweek'}
          onClick={() => setState({ ...state, bikeQualityPlacement: 'standalone_midweek' })}
        >
          <span className="block font-semibold">Keep separate mid-week hard bike</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Allow adjacent hard bike and hard run when the planner needs it — for athletes who tolerate hard days back-to-back.
          </span>
        </ChoiceBtn>
        <ChoiceBtn
          active={state.bikeQualityPlacement === 'long_ride_blend'}
          onClick={() => setState({ ...state, bikeQualityPlacement: 'long_ride_blend' })}
        >
          <span className="block font-semibold">Fold harder bike work into Saturday long ride</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            When mid-week hard bike fights with your hard run day, push the harder bike work into Saturday's long ride instead.
          </span>
        </ChoiceBtn>
      </div>
      <p className="text-[11px] text-white/35 px-0.5 pt-1">
        This saves to your plan; you can adjust later if your recovery patterns change.
      </p>
    </StepLayout>
  );
}

function Step6LongDays({
  state, setState, onNext, onBack, step, totalSteps,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
  const [custom, setCustom] = useState(false);
  const canContinue = !!(state.longRideDay && state.longRunDay);

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Long ride and long run — when do those fall?"
      onBack={onBack} onContinue={onNext} canContinue={canContinue}
    >
      {!custom && (
        <ChoiceBtn
          active={state.longRideDay === 'saturday' && state.longRunDay === 'sunday'}
          onClick={() => {
            setState({ ...state, longRideDay: 'saturday', longRunDay: 'sunday' });
          }}
        >
          <span className="font-semibold">Weekend days</span>
          <span className="block text-[13px] text-white/55 mt-0.5">Saturday long ride, Sunday long run — standard build week.</span>
        </ChoiceBtn>
      )}

      <button
        type="button"
        onClick={() => {
          setCustom(true);
          setState({ ...state, longRideDay: '', longRunDay: '' });
        }}
        className={`w-full min-h-[52px] rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition-colors
          ${custom ? 'border-teal-400/70 bg-teal-500/15 text-teal-100' : 'border-white/15 bg-white/[0.05] text-white/80 hover:border-white/30'}`}
      >
        Different schedule
        <span className="block text-[13px] text-white/55 mt-0.5">I work weekends or prefer a different arrangement.</span>
      </button>

      {(custom || (state.longRideDay && state.longRideDay !== 'saturday')) && (
        <>
          <DayPicker
            value={state.longRideDay as Day | ''}
            onChange={d => setState({ ...state, longRideDay: d })}
            label="Long ride day"
          />
          <DayPicker
            value={state.longRunDay as Day | ''}
            onChange={d => setState({ ...state, longRunDay: d })}
            label="Long run day"
            exclude={[state.longRideDay].filter(Boolean)}
          />
        </>
      )}
    </StepLayout>
  );
}

function Step7Budget({
  state, setState, onNext, onBack, step, totalSteps,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="How many days a week do you train?"
      subtitle="This sets the total weekly load. The plan fits within what you said."
      onBack={onBack} onContinue={onNext} canContinue={state.daysPerWeek !== null}
    >
      <div className="grid grid-cols-4 gap-2">
        {[4, 5, 6, 7].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => setState({ ...state, daysPerWeek: n })}
            className={`h-16 rounded-xl border text-xl font-semibold transition-colors
              ${state.daysPerWeek === n
                ? 'border-teal-400/70 bg-teal-500/15 text-teal-100'
                : 'border-white/15 bg-white/[0.05] text-white/70 hover:border-white/30'}`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-xs text-white/35 px-1">Days per week (4–7). Rest days are scheduled automatically around long and quality sessions.</p>
    </StepLayout>
  );
}

/**
 * Step 7B — weekly hours available.
 * Five tier cards mapping to midpoints (6 / 9 / 11 / 13 / 15) per
 * §SESSION-FREQUENCY-DEFAULTS §2 tier table. Each card shows what the athlete
 * gets at that hours band so the choice is informed, not numeric. Replaces the
 * hardcoded {beginner:6, intermediate:10, advanced:14} mapping that drove
 * `weekly_hours_available` for everyone in the same fitness bucket.
 */
/**
 * Hours-tier cards. The `sessions` line used to be a hard-coded string and drifted from the
 * engine matrix (10–12 hrs · 2 swims promised but engine returned 3 at 6–7 days; §2.1 strength
 * deduction added another conditional that the static text didn't capture). Now `benefit` stays
 * static while `sessions` is computed at render time from the athlete's known strength_intent
 * and days_per_week via `computeSessionFrequencyDefaults`. Same source of truth as the engine.
 */
const HOURS_TIERS: Array<{
  label: string;
  value: number;
  benefit: string;
}> = [
  { label: '5–7 hrs', value: 6, benefit: 'Enough to finish strong. Ideal if training fits around a full life.' },
  { label: '8–10 hrs', value: 9, benefit: 'The most common 70.3 window. Builds real fitness without consuming your week.' },
  { label: '10–12 hrs', value: 11, benefit: "Performance territory. You'll see meaningful speed gains on the bike." },
  { label: '12–14 hrs', value: 13, benefit: 'Competitive age-group volume. Requires disciplined recovery.' },
  { label: '14+ hrs', value: 15, benefit: 'Full commitment. Only sustainable with flexible schedule and strong recovery habits.' },
];

/**
 * Map wizard state to the StrengthFreqIntent the engine sees. `strengthIncluded === false`
 * → 'none'; otherwise pass through (`'performance'` for Hybrid, `'support'` for Durability).
 * Null/unset returns undefined so `computeSessionFrequencyDefaults` falls back to tier baseline.
 */
function wizardStrengthIntent(state: WizardState): StrengthFreqIntent | undefined {
  if (state.strengthIncluded === false) return 'none';
  if (state.strengthIntent === 'performance') return 'performance';
  if (state.strengthIntent === 'support') return 'support';
  return undefined;
}

/**
 * Clamp wizard days_per_week input to the matrix-supported {5, 6, 7} range. The engine's matrix
 * doesn't have a 4-day cell and clamps internally; mirror that here so the card preview matches
 * what the engine will actually return.
 */
function wizardDaysPerWeek(state: WizardState): DaysPerWeek {
  const d = state.daysPerWeek;
  if (d === 5 || d === 6 || d === 7) return d;
  if (typeof d === 'number' && d >= 7) return 7;
  if (typeof d === 'number' && d <= 5) return 5;
  return 6;
}

/** Render the swim/bike/run prescription line for a given hours-tier value, using the athlete's
 *  current strength_intent + days_per_week. Returns "X swims · Y bikes · Z runs". */
function formatHoursTierSessions(hoursValue: number, state: WizardState): string {
  const defaults = computeSessionFrequencyDefaults({
    weekly_hours_available: hoursValue,
    days_per_week: wizardDaysPerWeek(state),
    strength_intent: wizardStrengthIntent(state),
  });
  const s = defaults.swims_per_week;
  const b = defaults.bikes_per_week;
  const r = defaults.runs_per_week;
  return `${s} ${s === 1 ? 'swim' : 'swims'} · ${b} ${b === 1 ? 'bike' : 'bikes'} · ${r} ${r === 1 ? 'run' : 'runs'}`;
}

function Step7BHours({
  state, setState, onNext, onBack, step, totalSteps,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="How many hours a week can you train?"
      subtitle="Pick what you can hit consistently — not your best week."
      onBack={onBack} onContinue={onNext} canContinue={state.weeklyHours !== null}
    >
      <div className="grid grid-cols-1 gap-2.5">
        {HOURS_TIERS.map(({ label, value, benefit }) => {
          const selected = state.weeklyHours === value;
          // Reactive session line: reflects the actual matrix cell the engine will return given
          // the athlete's already-chosen strength_intent + days_per_week. §2.1 deduction applies
          // for Hybrid athletes (one tier lower at borderline hours/days). No drift between card
          // preview and emitted plan.
          const sessions = formatHoursTierSessions(value, state);
          return (
            <button
              key={value}
              type="button"
              onClick={() => setState({ ...state, weeklyHours: value })}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors space-y-1
                ${selected
                  ? 'border-teal-400/70 bg-teal-500/15'
                  : 'border-white/15 bg-white/[0.05] hover:border-white/30'}`}
            >
              <div className={`text-[17px] font-semibold ${selected ? 'text-teal-100' : 'text-white/85'}`}>
                {label}
              </div>
              <div className={`text-[13px] ${selected ? 'text-teal-100/85' : 'text-white/65'}`}>
                {sessions}
              </div>
              <div className={`text-[13px] leading-snug ${selected ? 'text-teal-100/65' : 'text-white/50'}`}>
                {benefit}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/35 px-1 pt-1">
        Be honest — undershooting locks you into a smaller plan; overshooting bakes in skipped workouts.
      </p>
    </StepLayout>
  );
}

function Step8Strength({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: WizardSetState; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  // Gate acknowledgment for the spec §2 trade-off (performance intent without barbell or DBs).
  // Reset whenever the athlete leaves performance intent so the warning always re-prompts.
  const [gateAcknowledged, setGateAcknowledged] = useState(false);
  useEffect(() => {
    if (state.strengthIntent !== 'performance') setGateAcknowledged(false);
  }, [state.strengthIntent]);

  const equipList = Array.isArray(arc?.equipment?.strength)
    ? (arc.equipment.strength as string[]).filter(Boolean)
    : [];

  // Equipment detection mirrors `_shared/strength-equipment-tier.ts` (kept inline because edge
  // helpers can't be imported by the Vite bundle). Conservative checks; barbell-or-DB unlocks
  // performance protocol per docs/STRENGTH-PROTOCOL.md §2.
  const equipLower = equipList.map((s) => String(s).toLowerCase());
  const hasBarbellChip = equipLower.some(
    (s) => s.includes('barbell') || s.includes('rack') || s.includes('cage') || s.includes('commercial gym'),
  );
  const hasDumbbellChip = equipLower.some((s) => s.includes('dumbbell') || /\bdb\b/.test(s));
  const tier3IsBwBands = !hasBarbellChip && !hasDumbbellChip;
  // Spec §8.2: when athlete has DBs but no barbell, ask DB max for the cap-and-scale-reps logic.
  const tier3IsDumbbellBased = hasDumbbellChip && !hasBarbellChip;

  // §5 1RM presence — any compound entry unlocks accurate loading.
  const pn = arc?.performanceNumbers ?? null;
  const has1RM = (() => {
    if (!pn) return false;
    const num = (v: unknown): boolean => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0;
    };
    return (
      num((pn as Record<string, unknown>).squat) ||
      num((pn as Record<string, unknown>).squat1RM) ||
      num((pn as Record<string, unknown>).squat_1rm) ||
      num((pn as Record<string, unknown>).deadlift) ||
      num((pn as Record<string, unknown>).dead_lift) ||
      num((pn as Record<string, unknown>).bench) ||
      num((pn as Record<string, unknown>).bench_press) ||
      num((pn as Record<string, unknown>).benchPress) ||
      num((pn as Record<string, unknown>).ohp) ||
      num((pn as Record<string, unknown>).overhead_press) ||
      num((pn as Record<string, unknown>).overhead) ||
      num((pn as Record<string, unknown>).overheadPress1RM)
    );
  })();

  const showGateWarning = state.strengthIncluded === true &&
    state.strengthIntent === 'performance' &&
    tier3IsBwBands;
  const show1RMWarning = state.strengthIncluded === true &&
    state.strengthIntent === 'performance' &&
    !showGateWarning &&
    !has1RM;
  const showDbMaxInput = state.strengthIncluded === true && tier3IsDumbbellBased;

  const canContinue =
    state.strengthIncluded !== null &&
    (state.strengthIncluded === false || state.strengthIntent !== null) &&
    (!showGateWarning || gateAcknowledged);

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Strength in this plan?"
      subtitle="Yes/No is only whether we schedule strength. Equipment below is already saved in your profile — not something you confirm on this step."
      onBack={onBack} onContinue={onNext} canContinue={canContinue}
    >
      {arc && (
        <ArcHint>
          {equipList.length > 0 ? (
            <>
              <span className="block font-medium text-teal-200/90 mb-1">From your profile</span>
              {equipList.join(', ')}. Exercises follow this list when strength is included.
            </>
          ) : (
            <>
              No strength gear in your profile yet. If you choose Yes, we start conservative (bands / bodyweight) until you add equipment under Baselines.
            </>
          )}
        </ArcHint>
      )}
      <p className="text-sm text-white/55 -mt-1 mb-1">Include strength sessions in your season plan?</p>
      <div className="flex gap-2">
        <ChoiceBtn active={state.strengthIncluded === true} onClick={() => setState({ ...state, strengthIncluded: true })}>
          Yes
        </ChoiceBtn>
        <ChoiceBtn active={state.strengthIncluded === false} onClick={() => setState({ ...state, strengthIncluded: false, strengthIntent: null })}>
          <span className="block font-semibold">Endurance Only</span>
          <span className="block text-[13px] text-white/55 mt-0.5">No strength sessions. Pure swim/bike/run.</span>
        </ChoiceBtn>
      </div>

      {state.strengthIncluded === true && (
        <div className="space-y-2 pt-1">
          <p className="text-sm text-white/55">What role does strength play this season?</p>
          <ChoiceBtn
            active={state.strengthIntent === 'performance'}
            onClick={() => setState({ ...state, strengthIntent: 'performance' })}
          >
            <span className="block font-semibold">Strength as a training priority (2× weekly compound lifting)</span>
            <span className="block text-[13px] text-white/55 mt-0.5">Strength is a goal alongside endurance. Two weekly sessions of compound lifting (squat / deadlift / press / row) maintain or build your lifts through race training.</span>
          </ChoiceBtn>
          {state.strengthIntent === 'performance' && (
            // STRENGTH-PROTOCOL.md §0.3 race-day trade-off disclosure. Inline `<details>` keeps it
            // collapsed-by-default with no JS state needed — accessible, low-friction.
            <details className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/60 leading-snug ml-1">
              <summary className="cursor-pointer text-white/70 hover:text-white/90 font-medium select-none">
                What's the trade-off?
              </summary>
              <div className="mt-2 space-y-2">
                <p>
                  On a flat, fast, cool-weather 70.3 or shorter race, a pure endurance triathlete at
                  equivalent endurance volume will probably finish 1–3% faster than the same athlete
                  on the hybrid protocol. That's a few minutes on a 5-hour race.
                </p>
                <p>The trade-off shrinks or reverses under any of:</p>
                <ul className="list-disc pl-5 space-y-1 text-white/55">
                  <li><span className="text-white/70">Hilly or technical courses</span> — power-to-weight and bike strength close or reverse the gap</li>
                  <li><span className="text-white/70">Long course (full Ironman)</span> — durability matters more; late-race form breakdown is partly a strength deficit</li>
                  <li><span className="text-white/70">Hot conditions</span> — better muscle mass tolerates thermal load</li>
                  <li><span className="text-white/70">Masters athletes (35+)</span> — muscle preservation becomes a meaningful performance variable</li>
                </ul>
                <p>
                  Hybrid also gains injury durability, body composition maintenance, year-round strength
                  PRs, and quality-of-life outside of triathlon — none of which a pure endurance athlete
                  gets for free.
                </p>
              </div>
            </details>
          )}
          <ChoiceBtn
            active={state.strengthIntent === 'support'}
            onClick={() => setState({ ...state, strengthIntent: 'support' })}
          >
            <span className="block font-semibold">Durability-Focused</span>
            <span className="block text-[13px] text-white/55 mt-0.5">Strength supports endurance. Injury prevention and tissue tolerance — race time is the only metric.</span>
          </ChoiceBtn>
        </div>
      )}

      {showDbMaxInput && (
        <div className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-[13px] leading-snug">
          <p className="font-semibold text-white/85 mb-1">Heaviest DB pair (lbs)</p>
          <p className="text-white/55 mb-2 text-[12px]">
            We use this to cap working weights when the prescribed load exceeds your DB max — reps
            scale up to maintain stimulus.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={200}
              step={5}
              value={state.dbMaxLb ?? 50}
              onChange={(e) => {
                const n = Number(e.target.value);
                setState({
                  ...state,
                  dbMaxLb: Number.isFinite(n) && n > 0 ? Math.round(n) : 50,
                });
              }}
              className="w-20 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-white/90 text-[14px] focus:outline-none focus:ring-1 focus:ring-teal-400/40"
            />
            <span className="text-white/55 text-[12px]">lb per hand · default 50</span>
          </div>
        </div>
      )}

      {showGateWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 text-[13px] leading-snug text-amber-100/90">
          <p className="font-semibold text-amber-200/95 mb-1">Equipment doesn't support performance protocol</p>
          <p className="mb-2">
            Performance strength requires barbell or dumbbell access for progressive loading. With your
            current equipment, we'll deliver durability protocol instead (high-rep tissue work,
            lighter loads). Add equipment in your profile to unlock performance.
          </p>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gateAcknowledged}
              onChange={(e) => setGateAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-500/40 bg-amber-950/40 accent-amber-400"
            />
            <span className="text-amber-100/85">
              I understand — generate the durability protocol with my current equipment.
            </span>
          </label>
        </div>
      )}

      {show1RMWarning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 text-[13px] leading-snug text-amber-100/90">
          <p className="font-semibold text-amber-200/95 mb-1">No 1RM data on file</p>
          <p>
            Performance loads use your 1RM. Without it, we'll start with conservative bodyweight-based
            defaults (squat 1.0×BW, deadlift 1.25×BW, bench 0.75×BW, OHP 0.5×BW) that may be light.
            Tap a Baseline Test (Lower Body / Upper Body) or enter your 1RM under Baselines to unlock
            accurate loading.
          </p>
        </div>
      )}
    </StepLayout>
  );
}

/**
 * §6.5 ordering-preference question. Only surfaces for Hybrid Strength Athletes
 * (`strengthIntent === 'performance'`). The §6 rule itself is explained upfront — the athlete
 * needs to understand what they're choosing, not have it hidden behind a disclosure.
 */
function Step8bStrengthOrdering({
  state, setState, onNext, onBack, step, totalSteps,
}: {
  state: WizardState; setState: WizardSetState;
  onNext: () => void; onBack: () => void;
  step: number; totalSteps: number;
}) {
  const pref = state.strengthOrderingPreference;
  const canContinue = pref !== null;
  return (
    <StepLayout
      step={step}
      totalSteps={totalSteps}
      title="Same-day session priority"
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      <div className="space-y-3 text-[14px] leading-relaxed text-white/70">
        <p>
          Your training plan will sometimes put strength and a hard run or bike on the same day.
          Research shows the order matters — what you do first gets the better stimulus.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-white/65">
          <li>
            <span className="text-white/85 font-medium">Endurance first</span> protects your race
            performance. Heavy strength after a quality run or bike fatigues your legs less than
            the reverse.
          </li>
          <li>
            <span className="text-white/85 font-medium">Strength first</span> protects your lifts.
            Quality endurance before heavy strength reduces force production and blunts strength
            adaptation.
          </li>
        </ul>
        <p className="text-white/60">
          Either way, leave <span className="text-white/85 font-medium">6+ hours between the two
          sessions</span>. Eat between them.
        </p>
        <p className="text-white/80 font-medium pt-1">Which is your priority?</p>
      </div>

      <div className="space-y-2 pt-2">
        <ChoiceBtn
          active={pref === 'endurance_first'}
          onClick={() => setState({ ...state, strengthOrderingPreference: 'endurance_first' })}
        >
          <span className="block font-semibold">Endurance first</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Recommended for triathletes focused on race results.
          </span>
        </ChoiceBtn>
        <ChoiceBtn
          active={pref === 'strength_first'}
          onClick={() => setState({ ...state, strengthOrderingPreference: 'strength_first' })}
        >
          <span className="block font-semibold">Strength first</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            For athletes whose strength PRs matter as much as race times.
          </span>
        </ChoiceBtn>
      </div>

      <details className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/55 leading-snug">
        <summary className="cursor-pointer text-white/65 hover:text-white/85 font-medium select-none">
          Research backing
        </summary>
        <div className="mt-2 space-y-1.5">
          <p>
            <span className="text-white/75">Eddens, van Someren, Howatson (2018)</span>,{' '}
            <em>Sports Medicine</em> 48(1):177-188 — meta-analysis: strength-first ordering
            produced superior lower-body dynamic strength gains over prolonged concurrent training.
          </p>
          <p>
            <span className="text-white/75">Doma & Deakin (2013)</span>,{' '}
            <em>Appl Physiol Nutr Metab</em> 38(6):651-656 — endurance-first protects running
            economy.
          </p>
          <p>
            <span className="text-white/75">Makhlouf et al. (2016)</span>,{' '}
            <em>J Strength Cond Res</em> 30(3):841-850 — strength prior to endurance for greater
            dynamic strength gains.
          </p>
          <p className="text-white/45 pt-1">
            Effect sizes are moderate — both choices are defensible.
          </p>
        </div>
      </details>

      <details className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/55 leading-snug">
        <summary className="cursor-pointer text-white/65 hover:text-white/85 font-medium select-none">
          How we schedule your strength
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            Running and cycling don't interfere with strength training the same way. Running
            involves eccentric impact damage; cycling is concentric-dominant with much less
            recovery cost. We use this when placing your sessions:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-white/55">
            <li>
              <span className="text-white/70">Long runs get a 48-hour buffer</span> before and
              after heavy lower-body strength — running fatigue lingers, and stacking compromises
              both.
            </li>
            <li>
              <span className="text-white/70">Quality runs share a day with strength</span> when
              possible with 6+ hour separation — concentrated load day, full recovery the next.
            </li>
            <li>
              <span className="text-white/70">Cycling sessions are more flexible</span> — heavy
              strength can land near a bike workout without the same interference cost.
            </li>
          </ul>
          <div className="pt-1 space-y-1">
            <p className="text-white/45">
              <span className="text-white/70">Wilson et al. (2012)</span>,{' '}
              <em>J Strength Cond Res</em> 26(8):2293-2307 — running interferes with lower-body
              strength substantially more than cycling.
            </p>
            <p className="text-white/45">
              <span className="text-white/70">Doma et al. (2017)</span>,{' '}
              <em>Sports Medicine</em> 47(11):2187-2200 — concurrent training mode effects on
              endurance performance.
            </p>
            <p className="text-white/45">
              <span className="text-white/70">Coffey & Hawley (2017)</span>,{' '}
              <em>J Physiol</em> 595(9):2883-2896 — molecular mechanisms of concurrent training
              interference.
            </p>
          </div>
        </div>
      </details>
    </StepLayout>
  );
}

function Step9Confirm({
  state, setState, onBack, onConfirm, step, totalSteps, saving, arc,
}: {
  state: WizardState; setState: WizardSetState;
  onBack: () => void; onConfirm: () => void;
  step: number; totalSteps: number; saving: boolean;
  arc: WizardArcContext | null;
}) {
  const primaryRace = state.races.find(r => r.priority === 'A') || state.races[0];
  const tri = isTri(primaryRace?.distance || '');
  const weeksOut = primaryRace?.targetDate
    ? Math.round((new Date(primaryRace.targetDate + 'T12:00:00').getTime() - Date.now()) / 604_800_000)
    : null;

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // ── Schedule picture ────────────────────────────────────────────────────────
  type ScheduleRow = { label: string; value: string; conflict?: string };
  const schedule: ScheduleRow[] = [];

  if (tri && state.hasGroupRide && state.groupRideDay) {
    const rideRoute = sanitizeGroupRideRouteUrl(state.groupRideRouteUrl);
    const routeSnap =
      rideRoute &&
      state.groupRideRouteSnapshot &&
      state.groupRideRouteSnapshot.route_url_normalized === rideRoute
        ? state.groupRideRouteSnapshot
        : null;
    schedule.push({
      label: 'Group ride',
      value: [
        `${cap(state.groupRideDay)} · ${state.groupRideIntensity === 'quality_bike' ? 'hard (quality)' : 'easy (aerobic)'}`,
        rideRoute ? `Route: ${rideRoute}` : '',
        routeSnap
          ? formatGroupRideRouteStatsLine(routeSnap, arc?.units ?? 'imperial')
          : '',
      ].filter(Boolean).join('\n'),
    });
  }
  if (state.hasGroupRun && state.groupRunDay) {
    const conflict = tri && state.hasGroupRide && state.groupRideDay === state.groupRunDay
      ? 'Same day as group ride — planner will flag this'
      : undefined;
    schedule.push({
      label: 'Group run / track night',
      value: `${cap(state.groupRunDay)} · ${state.groupRunIntensity === 'quality_run' ? 'hard (quality)' : 'easy (aerobic)'}`,
      conflict,
    });
  }
  if (tri && state.runQualityPlacement) {
    schedule.push({
      label: 'Hard run vs hard bike day',
      value:
        state.runQualityPlacement === 'long_run_blend'
          ? 'Hard running folded into Sunday long run (no separate mid-week hard run)'
          : 'Separate mid-week hard run (often the day after your hard bike day)',
    });
  }
  if (tri && state.bikeQualityPlacement) {
    schedule.push({
      label: 'Hard bike vs hard run day',
      value:
        state.bikeQualityPlacement === 'long_ride_blend'
          ? 'Harder bike work folded into Saturday long ride when mid-week is cramped'
          : 'Separate mid-week hard bike session when possible',
    });
  }
  if (tri) {
    const longRide = state.longRideDay || 'saturday';
    const longRun = state.longRunDay || 'sunday';
    const rideRunConflict = longRide === longRun ? 'Long ride and long run on the same day — planner will flag this' : undefined;
    const rideGroupConflict = !rideRunConflict && state.hasGroupRide && state.groupRideDay === longRide
      ? 'Same day as group ride — planner will flag this' : undefined;
    schedule.push({ label: 'Long ride', value: cap(longRide), conflict: rideRunConflict ?? rideGroupConflict });
    schedule.push({ label: 'Long run', value: cap(longRun) });
  } else {
    schedule.push({ label: 'Long run', value: cap(state.longRunDay || 'sunday') });
  }
  if (!state.hasGroupRide && !state.hasGroupRun) {
    schedule.push({ label: 'Quality sessions', value: 'Planner places around long days' });
  } else if (tri && !state.hasGroupRide) {
    schedule.push({ label: 'Quality bike', value: 'Planner places around anchors' });
  } else if (!state.hasGroupRun) {
    schedule.push({ label: 'Quality run', value: 'Planner places around anchors' });
  }

  // Arc baselines for the fitness card
  const readPace = (key: string): number | null => {
    if (!arc) return null;
    const raw = arc.learnedFitness?.[key];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === 'number' && v > 0) return v;
    }
    return null;
  };
  const ftpManual = arc?.performanceNumbers?.ftp ?? arc?.performanceNumbers?.FTP;
  const ftp = (typeof ftpManual === 'number' && ftpManual > 0)
    ? Math.round(ftpManual)
    : typeof arc?.learnedFitness?.ride_ftp_estimated === 'number'
      ? Math.round(arc.learnedFitness.ride_ftp_estimated as number) : null;
  const threshSec = readPace('run_threshold_pace_sec_per_km');
  const fitnessLines: string[] = [];
  if (arc && arc.swimSessions28 > 0) fitnessLines.push(`Swim: ${arc.swimSessions28} sessions in last 4 weeks`);
  if (arc && arc.runSessions28 > 0) fitnessLines.push(`Run: ${arc.runSessions28} sessions in last 4 weeks`);
  if (arc && arc.bikeSessions28 > 0) fitnessLines.push(`Bike: ${arc.bikeSessions28} sessions in last 4 weeks`);
  if (ftp) fitnessLines.push(`Bike FTP: ~${ftp}w`);
  if (threshSec) fitnessLines.push(`Run threshold: ${fmtPaceKm(threshSec)}`);

  const conflicts = schedule.filter(r => r.conflict);

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Ready to build your plan"
      onBack={onBack}
      onContinue={onConfirm}
      canContinue={!!state.planStartDate}
      continueLabel={saving ? 'Building…' : 'Looks right — build my plan'}
      saving={saving}
    >
      {/* Season summary card */}
      <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-b from-teal-950/55 via-zinc-950/50 to-zinc-950/90 px-4 py-5 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-teal-400/90 mb-2">Your season</p>
        <p className="text-[15px] text-white/80">· {state.races.length > 1 ? state.races.length + ' races' : primaryRace?.name || 'Race'} · {primaryRace?.distance}</p>
        <p className="text-[15px] text-white/80">· {state.trainingIntent === 'performance' ? 'Performance build' : state.trainingIntent === 'first_race' ? 'First-time finish' : 'Strong finish'}</p>
        {tri && state.swimExperience && (
          <p className="text-[15px] text-white/80">
            · Swim experience:{' '}
            {state.swimExperience === 'learning'
              ? 'Learning / rebuilding'
              : state.swimExperience === 'steady'
                ? 'Steady'
                : 'Strong swimmer'}
          </p>
        )}
        {tri && state.swimIntent && <p className="text-[15px] text-white/80">· {state.swimIntent === 'focus' ? '3 swims/week' : '2 swims/week'}</p>}
        {state.daysPerWeek && <p className="text-[15px] text-white/80">· {state.daysPerWeek} days/week</p>}
        {state.weeklyHours != null && (
          <p className="text-[15px] text-white/80">
            · {HOURS_TIERS.find((t) => t.value === state.weeklyHours)?.label ?? `${state.weeklyHours} hrs`}
          </p>
        )}
        <p className="text-[15px] text-white/80">· {state.strengthIncluded ? state.strengthIntent === 'performance' ? 'Strength co-equal (2×)' : 'Strength support (1–2×)' : 'No strength sessions'}</p>
        {weeksOut != null && <p className="text-[15px] text-white/80">· {weeksOut} weeks to race</p>}
      </div>

      {/* Schedule picture */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 mb-3">Week structure</p>
        <div className="space-y-2">
          {schedule.map((row, i) => (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-white/45 shrink-0">{row.label}</span>
                <span className="text-[14px] text-white/80 text-right whitespace-pre-line">{row.value}</span>
              </div>
              {row.conflict && (
                <p className="text-[12px] text-amber-400/80 mt-0.5 text-right">{row.conflict}</p>
              )}
            </div>
          ))}
        </div>
        {conflicts.length === 0 && (
          <p className="text-[11px] text-white/25 mt-3">No conflicts detected. Planner will optimize spacing.</p>
        )}
      </div>

      {/* Fitness baselines */}
      {fitnessLines.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 mb-2">Baselines in use</p>
          {fitnessLines.map((l, i) => <p key={i} className="text-[14px] text-white/60">· {l}</p>)}
        </div>
      )}

      {/* Plan start date */}
      <div>
        <p className="text-sm text-white/50 mb-2">Week 1 starts</p>
        <input
          type="date"
          value={state.planStartDate}
          min={new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
          onChange={e => setState({ ...state, planStartDate: e.target.value })}
          className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50"
        />
      </div>

      {/* Anything unusual */}
      <div>
        <p className="text-sm text-white/50 mb-2">Anything unusual about your schedule? <span className="text-white/30">(optional)</span></p>
        <textarea
          value={state.anythingUnusual}
          onChange={e => setState({ ...state, anythingUnusual: e.target.value })}
          placeholder="e.g. I work rotating shifts, travel every other week, can't train Tuesday mornings…"
          rows={3}
          className="w-full rounded-xl bg-white/[0.07] border border-white/15 text-white placeholder:text-white/30 text-[15px] px-3.5 py-3 focus:outline-none focus:border-teal-500/50 resize-none"
        />
        <p className="mt-1 text-[11px] text-white/30">The plan engine reads this and adjusts where needed.</p>
      </div>
    </StepLayout>
  );
}

// ─── Conflict overlay ─────────────────────────────────────────────────────────

function ConflictCard({
  overlay, onChoice,
}: {
  overlay: { conflict: import('@/hooks/useArcSetupComplete').ActiveConflict; description: string };
  onChoice: (id: string, action: string, label: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const choose = async (action: string, label: string) => {
    setPicking(true);
    await onChoice(overlay.conflict.conflictId, action, label);
    setPicking(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 px-4 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400/80 mb-3">Scheduling check</p>
      <p className="text-[1.1rem] font-semibold text-white leading-snug mb-3">One decision needed</p>
      <p className="text-[15px] text-white/65 leading-relaxed mb-6">{overlay.description}</p>
      <div className="space-y-2">
        <button
          type="button"
          disabled={picking}
          onClick={() => void choose(overlay.conflict.primaryAction, overlay.conflict.primaryLabel)}
          className="w-full min-h-[52px] rounded-xl border border-teal-400/50 bg-teal-500/15 text-teal-100 font-semibold text-[15px] px-4 py-3 text-left disabled:opacity-50"
        >
          A. {overlay.conflict.primaryLabel}
        </button>
        <button
          type="button"
          disabled={picking}
          onClick={() => void choose(overlay.conflict.secondaryAction, overlay.conflict.secondaryLabel)}
          className="w-full min-h-[52px] rounded-xl border border-white/20 bg-white/[0.06] text-white/80 font-semibold text-[15px] px-4 py-3 text-left disabled:opacity-50"
        >
          B. {overlay.conflict.secondaryLabel}
        </button>
      </div>
      {picking && (
        <div className="flex items-center gap-2 mt-4 text-sm text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Updating your plan…
        </div>
      )}
    </div>
  );
}

// ─── Step sequencer ───────────────────────────────────────────────────────────

/** Compute the ordered list of step keys given the primary race. */
function getSteps(state: WizardState) {
  const primaryRace = state.races.find(r => r.priority === 'A') || state.races[0];
  const tri = isTri(primaryRace?.distance || '70.3');
  const steps = ['races', 'prior_race', 'intent'];
  if (tri) steps.push('swim', 'bike');
  const showRunPlacement =
    tri &&
    state.hasGroupRide === true &&
    state.groupRideIntensity === 'quality_bike' &&
    !!state.groupRideDay;
  if (showRunPlacement) steps.push('rq_placement');
  steps.push('run');
  const showBikePlacement =
    tri &&
    state.hasGroupRun === true &&
    state.groupRunIntensity === 'quality_run' &&
    !!state.groupRunDay;
  if (showBikePlacement) steps.push('bq_placement');
  if (tri) steps.push('longdays');
  steps.push('budget');
  // §2.1 wizard reorder: strength (and §6.5 ordering screen) ASK before hours so the hours card
  // can render the athlete's actual prescription (post-deduction tier + days-aware swim count).
  // Pre-reorder the card showed a static hours-tier promise that didn't account for strength
  // wall-clock — athlete saw "2 swims at 10–12 hrs" but received 3 (or 2 post-§2.1 for hybrid).
  // After reorder the card knows strength_intent + days_per_week and renders the exact cell the
  // engine will return.
  if (tri) steps.push('strength');
  // §6.5: ordering-preference screen only for Hybrid athletes (strength_intent='performance').
  // Durability/none auto-default to endurance_first at save time; no screen surfaced.
  if (tri && state.strengthIncluded && state.strengthIntent === 'performance') {
    steps.push('strength_ordering');
  }
  steps.push('hours');
  steps.push('confirm');
  return steps;
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

const HEADER_INSET: React.CSSProperties = {
  paddingTop: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px) + 8px)',
};

export default function ArcSetupWizard() {
  const navigate = useNavigate();
  const wizardBootstrap = useMemo(() => readInitialWizard(), []);
  const [state, setState] = useState<WizardState>(() => wizardBootstrap.state);
  const [stepIdx, setStepIdx] = useState(() => wizardBootstrap.stepIdx);
  const [arcCtx, setArcCtx] = useState<WizardArcContext | null>(null);
  const { complete, saving, error, saveBanner, conflictOverlay, handleConflictChoice } =
    useArcSetupComplete();

  // Persist draft so leaving for Strava / switching apps resumes same step (browser + PWA).
  useEffect(() => {
    const uid = getStoredUserId();
    if (!uid) return;
    const t = window.setTimeout(() => {
      saveArcWizardDraft(uid, stepIdx, state as unknown as Record<string, unknown>);
    }, 320);
    return () => window.clearTimeout(t);
  }, [state, stepIdx]);

  useEffect(() => {
    const uid = getStoredUserId();
    if (!uid) return;
    const flush = () => {
      saveArcWizardDraft(uid, stepIdx, state as unknown as Record<string, unknown>);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
    };
  }, [state, stepIdx]);

  useEffect(() => {
    const onReset = () => {
      const uid = getStoredUserId();
      if (uid) clearArcWizardDraft(uid);
      setState(blank());
      setStepIdx(0);
    };
    window.addEventListener('arc-wizard:reset', onReset);
    return () => window.removeEventListener('arc-wizard:reset', onReset);
  }, []);

  // Load Arc context once at mount
  useEffect(() => {
    const userId = getStoredUserId();
    if (!userId) return;
    loadWizardArcContext(userId)
      .then(setArcCtx)
      .catch(e => console.warn('[ArcSetupWizard] arc context load failed', e));
  }, []);

  // Pre-select answers when Arc data arrives (only if athlete hasn't answered yet)
  useEffect(() => {
    if (!arcCtx) return;
    setState(prev => {
      const patch: Partial<WizardState> = {};

      // Swim: pre-select frequency + experience tier from recent sessions (athlete can override)
      if (prev.swimIntent === null && arcCtx.swimSessions28 >= 2) {
        patch.swimIntent = arcCtx.swimSessions28 >= 3 ? 'focus' : 'race';
      }
      if (prev.swimExperience === null) {
        if (arcCtx.swimSessions28 >= 3) patch.swimExperience = 'steady';
        else if (arcCtx.swimSessions28 === 0) patch.swimExperience = 'learning';
      }

      // Strength: pre-select yes if strength equipment is on file
      if (prev.strengthIncluded === null) {
        const equip = arcCtx.equipment?.strength;
        if (Array.isArray(equip) && equip.length > 0) patch.strengthIncluded = true;
      }

      return Object.keys(patch).length ? { ...prev, ...patch } : prev;
    });
  }, [arcCtx]);

  const steps = getSteps(state);
  const totalSteps = steps.length;
  const currentStep = steps[stepIdx] || 'confirm';
  const visualStep = stepIdx + 1;

  const next = useCallback(() => {
    setStepIdx(i => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const back = useCallback(() => {
    if (stepIdx === 0) navigate(-1);
    else setStepIdx(i => i - 1);
  }, [stepIdx, navigate]);

  const handleConfirm = useCallback(async () => {
    const payload = assemblePayload(state);
    await complete(payload);
  }, [state, complete]);

  // When the race changes and step sequence changes, clamp stepIdx
  const clampedSteps = getSteps(state);
  const safeStepIdx = Math.min(stepIdx, clampedSteps.length - 1);
  if (safeStepIdx !== stepIdx) setStepIdx(safeStepIdx);

  const sharedProps = { state, setState };

  return (
    <div className="h-[100dvh] w-full min-w-0 flex flex-col bg-zinc-950 text-white overflow-hidden">
      <MobileHeader showBackButton onBack={back} wordmarkSize={28} />
      <div
        className="flex-1 flex flex-col min-h-0 w-full max-w-lg mx-auto"
        style={HEADER_INSET}
      >
        {/* Title strip */}
        <div className="shrink-0 border-b border-white/10 bg-zinc-950">
          <p className="text-center text-lg font-semibold text-white/95 px-4 py-2.5 tracking-tight">
            {saveBanner || 'Plan my season'}
          </p>
          {error && (
            <p className="text-center text-sm text-red-300/90 px-4 pb-2.5 break-words">{error}</p>
          )}
        </div>

        {/* Conflict overlay (post-save, combined plans) */}
        {conflictOverlay ? (
          <ConflictCard overlay={conflictOverlay} onChoice={handleConflictChoice} />
        ) : (
          <>
            {currentStep === 'races' && (
              <Step1Races {...sharedProps} onNext={next} wizardStep={visualStep} wizardTotalSteps={totalSteps} />
            )}
            {currentStep === 'prior_race' && (
              <StepPriorRace {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'intent' && (
              <Step2Intent {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'swim' && (
              <Step3Swim {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'bike' && (
              <Step4Bike {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'rq_placement' && (
              <StepTriRunQualityPlacement {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'run' && (
              <Step5Run {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'bq_placement' && (
              <StepTriBikeQualityPlacement {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'longdays' && (
              <Step6LongDays {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'budget' && (
              <Step7Budget {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'hours' && (
              <Step7BHours {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'strength' && (
              <Step8Strength {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'strength_ordering' && (
              <Step8bStrengthOrdering {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} />
            )}
            {currentStep === 'confirm' && (
              <Step9Confirm
                {...sharedProps}
                onBack={back}
                onConfirm={() => void handleConfirm()}
                step={visualStep}
                totalSteps={totalSteps}
                saving={saving}
                arc={arcCtx}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
