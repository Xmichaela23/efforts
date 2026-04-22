/**
 * Heuristic "who is this athlete" block stored in user_baselines.athlete_identity.
 * Called from learn-fitness-profile after the 90d workout window is loaded.
 */

export interface AthleteIdentityV1 {
  discipline_identity: string;
  discipline_mix: Record<string, number>;
  /** Disciplines with meaningful recent share or volume (e.g. run, ride, strength) */
  active_disciplines: string[];
  /** Disciplines with prior history but not recent (e.g. long gap since last swim) */
  dormant_disciplines: string[];
  training_personality: 'structured' | 'varied' | 'race_focused' | 'exploratory';
  current_phase: 'recovery' | 'build' | 'maintenance' | 'taper' | 'unknown';
  phase_signal: string;
  inferred_at: string;
  confirmed_by_user: boolean;
  learning_status_snapshot?: string;
}

/** Last completed activity date (ISO) per logical discipline — from a longer lookback for dormancy. */
export type DisciplineRecency = Partial<Record<'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'other', string>>;

type W = {
  type: string;
  date: string;
  moving_time: number | null;
  duration: number | null;
  strava_data?: unknown;
  name?: string | null;
};

export function normType(t: string): string {
  const x = (t || '').toLowerCase();
  if (x.includes('run') || x === 'walk') return 'run';
  if (x.includes('ride') || x.includes('bike') || x.includes('cycling') || x.includes('virtualride')) return 'ride';
  if (x.includes('swim')) return 'swim';
  if (x.includes('strength') || x.includes('weight')) return 'strength';
  return 'other';
}

function minutes(w: W): number {
  const m = w.moving_time ?? w.duration ?? 0;
  return Number.isFinite(m) && m > 0 ? m : 0;
}

function stravaWorkoutType(w: W): number | null {
  let raw: any = w.strava_data;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const wt = raw?.original_activity?.workout_type;
  return typeof wt === 'number' ? wt : null;
}

function monthsBetween(isoA: string, isoB: string): number {
  const a = new Date(String(isoA) + 'T12:00:00');
  const b = new Date(String(isoB) + 'T12:00:00');
  return Math.max(0, (b.getTime() - a.getTime()) / (30.44 * 24 * 60 * 60 * 1000));
}

export function inferAthleteIdentityV1(
  workouts: W[],
  learningStatus: string,
  recency: DisciplineRecency = {},
): AthleteIdentityV1 {
  const now = new Date();
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 90);
  const iso90 = d90.toLocaleDateString('en-CA');
  const isoToday = now.toLocaleDateString('en-CA');

  const recent = workouts.filter((w) => w.date && w.date >= iso90);
  const typeCounts: Record<string, number> = {};
  for (const w of recent) {
    const k = normType(w.type);
    typeCounts[k] = (typeCounts[k] || 0) + 1;
  }
  const total = Object.values(typeCounts).reduce((a, b) => a + b, 0) || 1;
  const discipline_mix: Record<string, number> = {};
  for (const [k, v] of Object.entries(typeCounts)) {
    discipline_mix[k] = Math.round((v / total) * 100) / 100;
  }

  // Active: disciplines with enough share in 90d (strength "integrated" at a slightly lower bar).
  const active_disciplines = (Object.keys(discipline_mix) as string[])
    .filter((k) => {
      if (k === 'other' || k === 'walk') return false;
      const p = discipline_mix[k] ?? 0;
      if (k === 'strength') return p >= 0.05;
      return p >= 0.08;
    })
    .sort((a, b) => (discipline_mix[b] ?? 0) - (discipline_mix[a] ?? 0));

  // Dormant: had a last-ever session in recency map but not in 90d window (or last was long ago)
  const dormant_disciplines: string[] = [];
  const seenIn90 = new Set(
    (Object.keys(typeCounts) as string[]).filter((k) => (typeCounts[k] ?? 0) > 0)
  );
  for (const disc of ['swim', 'strength', 'ride'] as const) {
    const last = recency[disc];
    if (!last) continue;
    if (seenIn90.has(disc)) continue;
    const m = monthsBetween(last, isoToday);
    if (m >= 2.5) {
      dormant_disciplines.push(disc);
    }
  }
  dormant_disciplines.sort();

  const runP = discipline_mix.run ?? 0;
  const rideP = discipline_mix.ride ?? 0;
  const swimP = discipline_mix.swim ?? 0;
  const strP = discipline_mix.strength ?? 0;

  let discipline_identity = 'multi_sport';
  if (runP >= 0.55 && rideP < 0.12 && strP < 0.12) {
    discipline_identity = 'runner';
  } else if (rideP >= 0.55 && runP < 0.12) {
    discipline_identity = 'cyclist';
  } else if (swimP >= 0.2 && (runP > 0.15 || rideP > 0.15)) {
    discipline_identity = 'triathlete';
  } else if (Object.values(discipline_mix).filter((v) => v >= 0.12).length >= 2) {
    discipline_identity = 'multi_sport';
  } else if (strP >= 0.35) {
    discipline_identity = 'strength_athlete';
  } else if (runP >= 0.35 && (rideP >= 0.1 || strP >= 0.08)) {
    // Run-dominant but meaningful bike or strength in the same block → multi_sport, not "runner"
    discipline_identity = 'multi_sport';
  }

  // Strava workout_type: 1 = race, 2 = long run, 3 = workout, 0 = default
  const wtN = recent.length;
  let raceN = 0;
  let workoutN = 0;
  for (const w of recent) {
    const wt = stravaWorkoutType(w);
    if (wt === 1) raceN++;
    if (wt === 2 || wt === 3) workoutN++;
  }
  const nname = (w: W) => ((w.name || '') + '').toLowerCase();
  const raceNameHints = recent.filter((w) => /\brace\b|\b5k|\b10k|half|marathon|triathlon|ironman|event\b/i.test(nname(w))).length;

  let training_personality: AthleteIdentityV1['training_personality'] = 'varied';
  if (wtN > 0 && (workoutN / wtN > 0.25 || (raceN + raceNameHints) / wtN > 0.2)) {
    training_personality = (raceN + raceNameHints) / wtN > 0.2 ? 'race_focused' : 'structured';
  } else if (Object.keys(discipline_mix).filter((k) => (discipline_mix[k] ?? 0) >= 0.1).length >= 3) {
    training_personality = 'exploratory';
  }
  // Consistent multi-discipline + structured sessions → structured (if not already race_focused)
  if (
    training_personality === 'varied' &&
    active_disciplines.length >= 2 &&
    (strP > 0.08 || workoutN / Math.max(1, wtN) > 0.12)
  ) {
    training_personality = 'structured';
  }

  // Volume phase: last 7d vs prior 7d (calendar minutes)
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const iso7 = d7.toLocaleDateString('en-CA');
  const iso14 = d14.toLocaleDateString('en-CA');

  let m7 = 0;
  let m8_14 = 0;
  for (const w of recent) {
    if (!w.date) continue;
    const mins = minutes(w);
    if (w.date >= iso7) m7 += mins;
    else if (w.date < iso7 && w.date >= iso14) m8_14 += mins;
  }
  let current_phase: AthleteIdentityV1['current_phase'] = 'unknown';
  let phase_signal = 'insufficient_history';
  if (m7 > 0 && m8_14 > 0) {
    const ratio = m7 / m8_14;
    if (ratio < 0.72) {
      current_phase = 'recovery';
      phase_signal = 'volume_down_vs_prior7d';
    } else if (ratio > 1.18) {
      current_phase = 'build';
      phase_signal = 'volume_up_vs_prior7d';
    } else {
      current_phase = 'maintenance';
      phase_signal = 'stable_volume_7d';
    }
  } else if (m7 > 0 && m8_14 === 0) {
    current_phase = 'build';
    phase_signal = 'recent_activity_only';
  }

  // Post–key event (e.g. marathon): recovery, not "taper"
  const d2 = new Date(now);
  d2.setDate(d2.getDate() - 2);
  const iso2 = d2.toLocaleDateString('en-CA');
  const longRunMins = (w: W) => {
    const m = minutes(w);
    return m;
  };
  const postKeyRace = recent.some((w) => {
    if (!w.date || w.date < iso2) return false;
    if (normType(w.type) !== 'run') return false;
    const nm = nname(w);
    const keyword = /\b(marathon|road race|20\s*miler|20mi|ultra|half marathon|\b20k\b)/i.test(nm) || /\brace\b|event|triathlon|ironman/i.test(nm);
    const longEnough = longRunMins(w) >= 90 || /marathon|20\s*mi|32\s*k|ultra|half marathon/i.test(nm);
    return keyword && (longEnough || stravaWorkoutType(w) === 1);
  });
  if (postKeyRace) {
    current_phase = 'recovery';
    phase_signal = 'post_race_or_marathon_window';
  } else {
    // Taper hint: long effort in last 3d with "race" name
    const d3 = new Date(now);
    d3.setDate(d3.getDate() - 3);
    const iso3 = d3.toLocaleDateString('en-CA');
    const recentRace = recent.some((w) =>
      w.date >= iso3 && (stravaWorkoutType(w) === 1 || /\brace\b|event|marathon|half|triathlon|ironman/i.test(nname(w)))
    );
    if (recentRace && current_phase !== 'build') {
      current_phase = 'taper';
      phase_signal = 'race_or_event_last_3d';
    }
  }

  return {
    discipline_identity,
    discipline_mix,
    active_disciplines,
    dormant_disciplines,
    training_personality,
    current_phase,
    phase_signal,
    inferred_at: new Date().toISOString(),
    confirmed_by_user: false,
    learning_status_snapshot: learningStatus,
  };
}

export function inferDisciplinesTextArray(mix: Record<string, number>): string[] {
  const keys = (Object.keys(mix) as string[])
    .filter((k) => k !== 'other' && (mix[k] ?? 0) >= 0.12)
    .sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0));
  return keys.length ? keys : ['run'];
}

export function inferTrainingBackgroundSentence(
  identity: AthleteIdentityV1,
): string {
  const top = Object.entries(identity.discipline_mix)
    .filter(([, v]) => v >= 0.12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const focus = top.join(' + ') || 'mixed training';
  return `Inferred from recent data: ${identity.discipline_identity.replace(/_/g, ' ')}-leaning with primary focus on ${focus}. Training pattern: ${identity.training_personality}.`;
}
