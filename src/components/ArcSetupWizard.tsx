/**
 * ArcSetupWizard — nine-step season setup.
 *
 * Code owns all state and flow. LLM is not involved in navigation or save
 * decisions. Five bounded LLM jobs (intensity classification, coaching note,
 * conflict resolution, unusual schedule adjustment) are called once on specific
 * triggers with specific outputs — none of them control flow.
 *
 * Step 1  — Races (name, distance, date, A/B)
 * Step 2  — Training intent (performance / completion / first_race)
 * Step 3  — Swim (focus 3× / race-ready 2×)        [tri only]
 * Step 4  — Bike anchors (group ride + solo quality) [tri only]
 * Step 5  — Run anchors (run club + quality run day)
 * Step 6  — Long days (ride + run)                  [tri only]
 * Step 7  — Training budget (days/week)
 * Step 8  — Strength (included + intent)            [tri only]
 * Step 9  — Start date + notes + confirm
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2, ChevronLeft } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { useArcSetupComplete } from '@/hooks/useArcSetupComplete';
import { supabase, getStoredUserId } from '@/lib/supabase';
import type { ArcSetupPayload } from '@/lib/parse-arc-setup';

// ─── Arc context (client-side slice) ─────────────────────────────────────────

/**
 * Slim client-side Arc snapshot — only what the wizard steps need.
 * Loaded once at mount, passed down as a prop. Steps never call getArcContext directly.
 */
export type WizardArcContext = {
  learnedFitness: Record<string, unknown> | null;
  equipment: Record<string, unknown> | null;
  performanceNumbers: Record<string, unknown> | null;
  swimSessions28: number;
  swimSessions90: number;
  /** Completed runs in last 28 days (for placement-step hints). */
  runSessions28: number;
  /** Completed rides in last 28 days. */
  bikeSessions28: number;
};

async function loadWizardArcContext(userId: string): Promise<WizardArcContext> {
  const today = new Date().toISOString().slice(0, 10);
  const start90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const start28 = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);

  const [baselinesRes, volumeRes] = await Promise.all([
    supabase
      .from('user_baselines')
      .select('learned_fitness, equipment, performance_numbers')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('workouts')
      .select('date, type')
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

  const volRows = (volumeRes.data ?? []) as { date?: string; type?: string }[];
  const in28 = (d: string) => typeof d === 'string' && d.slice(0, 10) >= start28;

  let swimSessions28 = 0;
  let swimSessions90 = 0;
  let runSessions28 = 0;
  let bikeSessions28 = 0;

  for (const r of volRows) {
    const d = typeof r.date === 'string' ? r.date.slice(0, 10) : '';
    const t = String(r.type ?? '').toLowerCase();
    const isSwim = t === 'swim' || t === 'swimming';
    const isRun = t === 'run';
    const isRide = t === 'ride';

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
    swimSessions28,
    swimSessions90,
    runSessions28,
    bikeSessions28,
  };
}

/** Recent run volume → Arc hint on tri run-quality placement (after pinned quality bike). */
function hintRunQualityPlacementFromHistory(arc: WizardArcContext | null): string | null {
  if (!arc) return null;
  const n = arc.runSessions28;
  if (n >= 10) {
    return `${n} completed runs in the last 4 weeks — strong run rhythm; standalone mid-week intervals after your quality bike day often works if you bounce back quickly on the run.`;
  }
  if (n >= 6) {
    return `${n} runs in the last 4 weeks — you're running regularly; choose standalone if hard days back-to-back have felt fine, or fold into the long run for fewer pinned hard weekdays.`;
  }
  if (n >= 3) {
    return `${n} runs in the last 4 weeks — either pattern can work; blending into the long run is the lower weekday-stress option.`;
  }
  if (n >= 1) {
    return `${n} run${n === 1 ? '' : 's'} in the last 4 weeks — folding quality into the long run often fits while run consistency builds.`;
  }
  return `No runs logged in the last 4 weeks — putting threshold blocks on the long run keeps mid-week simpler until running is back in rhythm.`;
}

/** Recent ride volume → Arc hint on tri bike-quality placement (after pinned quality run). */
function hintBikeQualityPlacementFromHistory(arc: WizardArcContext | null): string | null {
  if (!arc) return null;
  const n = arc.bikeSessions28;
  if (n >= 10) {
    return `${n} completed rides in the last 4 weeks — high bike frequency; standalone mid-week bike quality may match what your legs already expect.`;
  }
  if (n >= 6) {
    return `${n} rides in the last 4 weeks — if stacking bike quality beside your hard run day feels like a lot, preferring long-ride emphasis frees mid-week.`;
  }
  if (n >= 3) {
    return `${n} rides in the last 4 weeks — moderate bike volume; either choice is reasonable — long-ride bias helps when the week gets cramped.`;
  }
  if (n >= 1) {
    return `${n} ride${n === 1 ? '' : 's'} in the last 4 weeks — consolidating structured bike into the long ride can spare adjacent hard days.`;
  }
  return `No rides logged in the last 4 weeks — biasing bike quality toward the long ride keeps weekday stress lower while cycling consistency returns.`;
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

// ─── State shape ─────────────────────────────────────────────────────────────

type WizardRace = {
  id: string;
  name: string;
  distance: string;
  targetDate: string;
  priority: 'A' | 'B' | 'C';
};

type WizardState = {
  // Step 1
  races: WizardRace[];
  // Step 2
  trainingIntent: 'performance' | 'completion' | 'first_race' | null;
  // Step 3 (tri)
  swimIntent: 'focus' | 'race' | null;
  // Step 4 (tri) — fixed external bike anchor only; planner places everything else
  hasGroupRide: boolean | null;
  groupRideDay: Day | '';
  groupRideIntensity: 'quality_bike' | 'easy_bike' | null;
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
  // Step 8 (tri)
  strengthIncluded: boolean | null;
  strengthIntent: 'performance' | 'support' | null;
  // Step 9
  planStartDate: string;
  anythingUnusual: string;
  assessmentWeekPreference: 'assessment_first' | 'jump_in' | null;
};

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
    swimIntent: null,
    hasGroupRide: null, groupRideDay: '', groupRideIntensity: null,
    hasGroupRun: null, groupRunDay: '', groupRunIntensity: null,
    runQualityPlacement: null,
    bikeQualityPlacement: null,
    longRideDay: '', longRunDay: '',
    daysPerWeek: null,
    strengthIncluded: null, strengthIntent: null,
    planStartDate: nextMonday,
    anythingUnusual: '',
    assessmentWeekPreference: null,
  };
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

  const swimCount = state.swimIntent === 'focus' ? 3 : 2;
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
    triPlan && state.swimIntent === 'focus' ? 'Three swims a week.' : triPlan ? 'Two swims a week.' : '',
    state.strengthIncluded
      ? state.strengthIntent === 'performance' ? 'Two strength days, co-equal goal.' : 'Strength supports tri.'
      : '',
    state.anythingUnusual ? `Note: ${state.anythingUnusual.slice(0, 80)}` : '',
  ].filter(Boolean).join(' ');

  const trainingPrefs: Record<string, unknown> = {
    training_intent: state.trainingIntent || 'completion',
    days_per_week: state.daysPerWeek || 7,
    preferred_days: preferredDays,
    strength_frequency: strengthFreq,
    ...(triPlan &&
    state.hasGroupRide &&
    state.groupRideIntensity === 'quality_bike' &&
    state.groupRideDay
      ? { bike_quality_label: 'Group Ride' }
      : {}),
    ...(state.strengthIncluded && state.strengthIntent
      ? { strength_intent: state.strengthIntent }
      : {}),
    ...(triPlan && state.swimIntent
      ? { swim_intent: state.swimIntent }
      : {}),
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
  state, setState, onNext,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void }) {
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
    if (state.races.length <= 1) return;
    const remaining = state.races.filter(r => r.id !== id);
    if (!remaining.find(r => r.priority === 'A')) remaining[0]!.priority = 'A';
    setState({ ...state, races: remaining });
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
        step={1} totalSteps={9}
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
      step={1} totalSteps={9}
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
            {state.races.length > 1 && (
              <button type="button" onClick={() => removeRace(race.id)} className="text-white/30 hover:text-white/60">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
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

/** Map LLM distance strings to the canonical display values used by the wizard. */
function normalizeDistance(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === 'ironman' || s === 'full' || s === 'full ironman') return 'Ironman';
  if (s === '70.3' || s === 'half ironman' || s === 'half-ironman') return '70.3';
  if (s === 'olympic') return 'Olympic';
  if (s === 'sprint') return 'Sprint';
  if (s === 'marathon') return 'Marathon';
  if (s === 'half marathon' || s === 'half-marathon') return 'Half Marathon';
  if (s === '10k' || s === '10km') return '10K';
  if (s === '5k' || s === '5km') return '5K';
  return raw; // pass through if unrecognized
}

function Step2Intent({
  state, setState, onNext, onBack,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void }) {
  const primaryRace = state.races.find(r => r.priority === 'A') || state.races[0];
  const raceName = primaryRace?.name || 'your race';

  return (
    <StepLayout
      step={2} totalSteps={9}
      title={`What's the goal for ${raceName}?`}
      onBack={onBack} onContinue={onNext} canContinue={state.trainingIntent !== null}
    >
      <ChoiceBtn active={state.trainingIntent === 'performance'} onClick={() => setState({ ...state, trainingIntent: 'performance' })}>
        <span className="block font-semibold text-white">Race the clock</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Interval and threshold sessions, pace targets on every quality workout, recovery every 3–4 weeks. Built to go faster.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.trainingIntent === 'completion'} onClick={() => setState({ ...state, trainingIntent: 'completion' })}>
        <span className="block font-semibold text-white">Strong, healthy finish</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Tempo-based quality work, no pace targets, recovery every 3 weeks. Built to finish feeling good.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.trainingIntent === 'first_race'} onClick={() => setState({ ...state, trainingIntent: 'first_race' })}>
        <span className="block font-semibold text-white">First time at this distance</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Conservative ramp, recovery every 2 weeks, no intensity pressure. Built to get you to the line.</span>
      </ChoiceBtn>
    </StepLayout>
  );
}

function Step3Swim({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  const swimPaceSec: number | null = (() => {
    const pn = arc?.performanceNumbers;
    if (!pn) return null;
    const raw = pn['swimPacePer100'] ?? pn['swimPace100'] ?? pn['swim_pace_100_yd'] ?? pn['swim_pace_per_100_sec'];
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const swimNote = arc
    ? arc.swimSessions28 >= 3
      ? `You averaged ${arc.swimSessions28} swims/week in the last 4 weeks — swim focus pre-selected.`
      : arc.swimSessions28 === 2
      ? `2 swims/week in the last 4 weeks — race-ready pre-selected.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
      : arc.swimSessions28 === 1
      ? `1 swim in the last 4 weeks. Race-ready (2×) is a good step up from here.${swimPaceSec ? ` Pace on file: ${fmtSwimPace(swimPaceSec)}.` : ''}`
      : swimPaceSec
        ? `No swims in the last 4 weeks — but your pace (${fmtSwimPace(swimPaceSec)}) is on file. Race-ready (2×) is enough to rebuild.`
        : `No swims logged in the last 4 weeks. Race-ready (2×) is the minimum to build race fitness — if you're new to swimming, expect the first few weeks to be about finding your rhythm.`
    : null;

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="How much do you want to swim?"
      subtitle="Swim focus builds real fitness. Race-ready keeps it sharp without adding load to bike and run."
      onBack={onBack} onContinue={onNext} canContinue={state.swimIntent !== null}
    >
      {swimNote && <ArcHint>{swimNote}</ArcHint>}
      <ChoiceBtn active={state.swimIntent === 'race'} onClick={() => setState({ ...state, swimIntent: 'race' })}>
        <span className="block font-semibold text-white">Race-ready — 2 sessions/week</span>
        <span className="block text-[13px] text-white/55 mt-0.5">One quality, one aerobic. Swim stays sharp without eating into bike/run budget.</span>
      </ChoiceBtn>
      <ChoiceBtn active={state.swimIntent === 'focus'} onClick={() => setState({ ...state, swimIntent: 'focus' })}>
        <span className="block font-semibold text-white">Swim focus — 3 sessions/week</span>
        <span className="block text-[13px] text-white/55 mt-0.5">Technique, aerobic quality, and threshold. Treat swim as a real limiter this block.</span>
      </ChoiceBtn>
    </StepLayout>
  );
}

function Step4Bike({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
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
    setState({
      ...state,
      hasGroupRide,
      groupRideDay: '',
      groupRideIntensity: null,
      runQualityPlacement: null,
    });

  return (
    <StepLayout
      step={step} totalSteps={totalSteps}
      title="Do you have a regular group ride?"
      subtitle="Just the fixed external one — we'll pin your bike week to it. The planner places everything else."
      onBack={onBack} onContinue={onNext} canContinue={canContinue}
    >
      {bikeNote && <ArcHint>{bikeNote}</ArcHint>}

      <div className="flex gap-2">
        <ChoiceBtn active={state.hasGroupRide === true} onClick={() => set(true)}>Yes</ChoiceBtn>
        <ChoiceBtn active={state.hasGroupRide === false} onClick={() => set(false)}>No</ChoiceBtn>
      </div>

      {state.hasGroupRide === true && (
        <>
          <DayPicker
            value={state.groupRideDay as Day | ''}
            onChange={d => setState({ ...state, groupRideDay: d })}
            label="Which day?"
          />
          <div>
            <p className="text-sm text-white/50 mb-2">How hard is it?</p>
            <div className="space-y-2">
              <ChoiceBtn
                active={state.groupRideIntensity === 'quality_bike'}
                onClick={() => setState({ ...state, groupRideIntensity: 'quality_bike' })}
              >
                <span className="block font-semibold">Hard — competitive pace, real efforts</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Counts as your quality bike session for the week.</span>
              </ChoiceBtn>
              <ChoiceBtn
                active={state.groupRideIntensity === 'easy_bike'}
                onClick={() => setState({ ...state, groupRideIntensity: 'easy_bike' })}
              >
                <span className="block font-semibold">Easy — social, conversational pace</span>
                <span className="block text-[13px] text-white/55 mt-0.5">Counts as aerobic. The planner adds a separate quality session.</span>
              </ChoiceBtn>
            </div>
          </div>
        </>
      )}
    </StepLayout>
  );
}

function Step5Run({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
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
  setState: (s: WizardState) => void;
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
      title="Run intervals after your quality bike day?"
      subtitle={`Mid-week run quality often lands the next calendar day after ${ride} (e.g. Wed ride → Thu run). Some athletes handle that well; others fold threshold work into the long run instead.`}
      onBack={onBack}
      onContinue={onNext}
      canContinue={canContinue}
    >
      {historyHint && <ArcHint>{historyHint}</ArcHint>}
      <div className="space-y-2">
        <ChoiceBtn
          active={state.runQualityPlacement === 'standalone_midweek'}
          onClick={() => setState({ ...state, runQualityPlacement: 'standalone_midweek' })}
        >
          <span className="block font-semibold">Standalone mid-week intervals</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Stack after quality bike when the calendar lands there — for athletes who recover quickly on the run.
          </span>
        </ChoiceBtn>
        <ChoiceBtn
          active={state.runQualityPlacement === 'long_run_blend'}
          onClick={() => setState({ ...state, runQualityPlacement: 'long_run_blend' })}
        >
          <span className="block font-semibold">Fold quality into Sunday long</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Skip a separate mid-week quality session; long run carries threshold / race-pace blocks — recovery-first.
          </span>
        </ChoiceBtn>
      </div>
      <p className="text-[11px] text-white/35 px-0.5 pt-1">
        This saves on your plan contract; you can adjust later if recovery patterns change.
      </p>
    </StepLayout>
  );
}

/** Tri only — shown after anchored quality run (club / track night). Preference is persisted for bike/run geometry + resolver. */
function StepTriBikeQualityPlacement({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: {
  state: WizardState;
  setState: (s: WizardState) => void;
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
      title="Bike quality when run club pins a hard day?"
      subtitle={`Your ${rn} session is fixed. Mid-week bike quality may land on an adjacent calendar day — some athletes keep both; others prefer structured bike stress folded into the long ride when the week gets cramped.`}
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
          <span className="block font-semibold">Keep standalone bike quality</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            Allow adjacent hard bike and hard run when the planner needs it — for athletes who tolerate stacked quality.
          </span>
        </ChoiceBtn>
        <ChoiceBtn
          active={state.bikeQualityPlacement === 'long_ride_blend'}
          onClick={() => setState({ ...state, bikeQualityPlacement: 'long_ride_blend' })}
        >
          <span className="block font-semibold">Prefer long-ride bike emphasis</span>
          <span className="block text-[13px] text-white/55 mt-0.5">
            When mid-week bike quality fights the run anchor, bias toward endurance + tempo on long ride day — saved on your plan contract.
          </span>
        </ChoiceBtn>
      </div>
      <p className="text-[11px] text-white/35 px-0.5 pt-1">
        This saves on your plan contract; you can adjust later if recovery patterns change.
      </p>
    </StepLayout>
  );
}

function Step6LongDays({
  state, setState, onNext, onBack, step, totalSteps,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
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
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number }) {
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

function Step8Strength({
  state, setState, onNext, onBack, step, totalSteps, arc,
}: { state: WizardState; setState: (s: WizardState) => void; onNext: () => void; onBack: () => void; step: number; totalSteps: number; arc: WizardArcContext | null }) {
  const canContinue = state.strengthIncluded !== null &&
    (state.strengthIncluded === false || state.strengthIntent !== null);

  const equipList = Array.isArray(arc?.equipment?.strength)
    ? (arc.equipment.strength as string[]).filter(Boolean)
    : [];

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
          No
        </ChoiceBtn>
      </div>

      {state.strengthIncluded === true && (
        <div className="space-y-2 pt-1">
          <p className="text-sm text-white/55">What role does strength play this season?</p>
          <ChoiceBtn
            active={state.strengthIntent === 'support'}
            onClick={() => setState({ ...state, strengthIntent: 'support' })}
          >
            <span className="block font-semibold">Backs up tri</span>
            <span className="block text-[13px] text-white/55 mt-0.5">1–2 sessions/week. Durability-focused, modest loads. Keeps you injury-free and strong on the run.</span>
          </ChoiceBtn>
          <ChoiceBtn
            active={state.strengthIntent === 'performance'}
            onClick={() => setState({ ...state, strengthIntent: 'performance' })}
          >
            <span className="block font-semibold">Real goal — co-equal</span>
            <span className="block text-[13px] text-white/55 mt-0.5">2 sessions/week, compound work, progressive loading. Getting stronger is a primary objective alongside triathlon.</span>
          </ChoiceBtn>
        </div>
      )}
    </StepLayout>
  );
}

function Step9Confirm({
  state, setState, onBack, onConfirm, step, totalSteps, saving, error, arc,
}: {
  state: WizardState; setState: (s: WizardState) => void;
  onBack: () => void; onConfirm: () => void;
  step: number; totalSteps: number; saving: boolean; error: string | null;
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
    schedule.push({
      label: 'Group ride',
      value: `${cap(state.groupRideDay)} · ${state.groupRideIntensity === 'quality_bike' ? 'hard (quality)' : 'easy (aerobic)'}`,
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
      label: 'Run quality vs bike day',
      value:
        state.runQualityPlacement === 'long_run_blend'
          ? 'Folded into long run (no separate mid-week quality)'
          : 'Standalone mid-week (stack after quality bike when adjacent)',
    });
  }
  if (tri && state.bikeQualityPlacement) {
    schedule.push({
      label: 'Bike quality vs run anchor',
      value:
        state.bikeQualityPlacement === 'long_ride_blend'
          ? 'Prefer long-ride emphasis when mid-week is cramped (contract)'
          : 'Standalone mid-week bike quality when possible',
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
        {tri && state.swimIntent && <p className="text-[15px] text-white/80">· {state.swimIntent === 'focus' ? '3 swims/week' : '2 swims/week'}</p>}
        {state.daysPerWeek && <p className="text-[15px] text-white/80">· {state.daysPerWeek} days/week</p>}
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
                <span className="text-[14px] text-white/80 text-right">{row.value}</span>
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
          min={new Date().toISOString().slice(0, 10)}
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

      {error && (
        <p className="text-sm text-red-300/90 break-words">{error}</p>
      )}
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
  const steps = ['races', 'intent'];
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
  if (tri) steps.push('strength');
  steps.push('confirm');
  return steps;
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

const HEADER_INSET: React.CSSProperties = {
  paddingTop: 'calc(var(--header-h, 64px) + env(safe-area-inset-top, 0px) + 8px)',
};

export default function ArcSetupWizard() {
  const navigate = useNavigate();
  const [state, setState] = useState<WizardState>(blank);
  const [stepIdx, setStepIdx] = useState(0);
  const [arcCtx, setArcCtx] = useState<WizardArcContext | null>(null);
  const { complete, saving, error, saveBanner, conflictOverlay, handleConflictChoice } =
    useArcSetupComplete();

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

      // Swim: pre-select frequency based on recent sessions
      if (prev.swimIntent === null && arcCtx.swimSessions28 >= 2) {
        patch.swimIntent = arcCtx.swimSessions28 >= 3 ? 'focus' : 'race';
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
        </div>

        {/* Conflict overlay (post-save, combined plans) */}
        {conflictOverlay ? (
          <ConflictCard overlay={conflictOverlay} onChoice={handleConflictChoice} />
        ) : (
          <>
            {currentStep === 'races' && (
              <Step1Races {...sharedProps} onNext={next} />
            )}
            {currentStep === 'intent' && (
              <Step2Intent {...sharedProps} onNext={next} onBack={back} />
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
            {currentStep === 'strength' && (
              <Step8Strength {...sharedProps} onNext={next} onBack={back} step={visualStep} totalSteps={totalSteps} arc={arcCtx} />
            )}
            {currentStep === 'confirm' && (
              <Step9Confirm
                {...sharedProps}
                onBack={back}
                onConfirm={() => void handleConfirm()}
                step={visualStep}
                totalSteps={totalSteps}
                saving={saving}
                error={error}
                arc={arcCtx}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
