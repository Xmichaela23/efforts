import type { SessionTemplate } from '../Seventy3Template';
import type { SkeletonWeek } from './types';

export interface UniversalPlanData {
  name: string;
  description: string;
  duration_weeks: number;
  // Optional alternate format used by hybrid plans
  sessions_by_week?: {
    [week: string]: Array<{
      day: string;
      type: 'run'|'bike'|'swim'|'strength'|'walk';
      focus?: string;
      description?: string;
      intensity?: any;
      optional?: boolean;
      sets?: any[]; // for swim drills
    }>;
  };
  sports: {
    [sport: string]: {
      quality?: {
        [phase: string]: Array<{
          week: number;
          type: string;
          session: string;
          duration?: number;
          intensity?: string;
        }>;
      };
      long?: {
        [phase: string]: {
          start?: number;
          progression?: string;
          deload?: string;
          [week: string]: number | string;
        };
      };
      easy?: {
        [phase: string]: {
          duration: number;
          description: string;
        };
      };
    };
  };
  strength?: {
    [track: string]: {
      [phase: string]: string[];
    };
    cowboy_upper?: string[];
  };
  phases: {
    [phase: string]: {
      weeks: number[];
      description: string;
    };
  };
}

// Cache for loaded plan data
const planDataCache = new Map<string, UniversalPlanData>();
const poolsDataCache = new Map<string, any>();

/**
 * Load a plan's progression data from JSON
 */
export async function loadPlanData(planPath: string): Promise<UniversalPlanData> {
  if (planDataCache.has(planPath)) {
    return planDataCache.get(planPath)!;
  }

  try {
    const response = await fetch(planPath);
    if (!response.ok) {
      throw new Error(`Failed to load plan data: ${response.statusText}`);
    }
    
    const planData: UniversalPlanData = await response.json();
    planDataCache.set(planPath, planData);
    return planData;
  } catch (error) {
    console.error('Failed to load plan data:', error);
    throw new Error(`Failed to load training plan: ${planPath}`);
  }
}

async function loadPoolsData(): Promise<any> {
  const key = 'pools';
  if (poolsDataCache.has(key)) return poolsDataCache.get(key);
  const url = `${import.meta.env.BASE_URL || '/'}plans.v1.0.0/pools.clean.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load pools.json: ${res.status} ${res.statusText}`);
  const data = await res.json();
  poolsDataCache.set(key, data);
  return data;
}

function parseGarminVariantId(text?: string | null): string | null {
  if (!text) return null;
  const m = text.match(/(?:GARMIN:|garmin:|variantId=|garmin_variant=)([A-Za-z0-9_\-]+)/);
  if (m) return m[1];
  // also accept exact id tokens in brackets e.g. [200m_3k_eq_jog]
  const b = text.match(/\[([A-Za-z0-9_\-]+)\]/);
  if (b) return b[1];
  // or if description equals a known id-like token
  if (/^[A-Za-z0-9_\-]+$/.test(text)) return text;
  return null;
}

function mapGarminVariantFromText(text?: string | null): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\[\s*[a-z0-9_\-]+\s*\]/i.test(text)) return parseGarminVariantId(text); // already tagged
  if (/\b200m\b.*3k/.test(t)) return '200m_3k_eq_jog';
  if (/\b400m\b.*5k/.test(t)) return '400m_5k_eq_jog';
  if (/\b800m\b.*10k/.test(t)) return '800m_10k_eq_or_2min';
  if (/(^|\s)1\s*mile\b.*threshold|\b1mi\b.*thr/.test(t)) return '1mi_thr_3to4min';
  if (/(^|\s)1\s*mile\b.*5k|\b1600m\b.*5k/.test(t)) return '1600m_5k_eq_or_2min';
  if (/\b2x2mi|3x2mi|4x2mi|\b3200m\b/.test(t)) return '3200m_cruise_or_3min';
  if (/\b3x2\.5mi|2500m|4000m/.test(t)) return '4000m_cruise_or_3min';
  if (/\b2x3mi|4800m/.test(t)) return '4800m_cruise_or_3min';
  return null;
}

export async function expandGarminIntervals(variantId: string, repsOverride?: number, baselines?: any): Promise<string[]> {
  const pools = await loadPoolsData();
  const run = pools?.run;
  const igr = run?.intervals_garmin_ready;
  if (!igr) throw new Error('Intervals library not found: run.intervals_garmin_ready');
  const defs = igr.defaults || {};
  const variants: any[] = igr.variants || [];
  const v = variants.find(x => x.id === variantId);
  if (!v) throw new Error(`Intervals variant not found: ${variantId}`);
  const reps = typeof repsOverride === 'number' ? repsOverride : (v.rep_schema?.reps || 0);
  const steps: string[] = [];
  if (defs.warmup?.label) steps.push(defs.warmup.label);
  for (let i = 0; i < reps; i++) {
    for (const s of (v.rep_schema?.steps || [])) {
      let label: string = s.label;
      // Append pace band for work steps where label references 3K/5K/Threshold
      if (s.type === 'work' && baselines) {
        const pn = baselines?.performanceNumbers || {};
        const parsePace = (p?: string) => {
          if (!p) return null;
          const m = p.match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; return parseInt(m[1],10)*60+parseInt(m[2],10);
        };
        const format = (sec: number) => {
          const m = Math.max(0, Math.floor(sec/60)); const s = Math.max(0, sec%60); return `${m}:${String(s).padStart(2,'0')}`;
        };
        const band = (base: number, pct: number) => [format(Math.round(base*(1-pct))), format(Math.round(base*(1+pct)))];
        const fiveK = parsePace(pn.fiveK_pace);
        const easy = parsePace(pn.easyPace);
        let lo: string|undefined, hi: string|undefined;
        if (/3k/i.test(label) && fiveK) {
          const base3k = Math.round(fiveK*0.94); const [l,h] = band(base3k,0.03); lo=l; hi=h;
        } else if (/5k/i.test(label) && fiveK) {
          const [l,h] = band(fiveK,0.03); lo=l; hi=h;
        } else if (/threshold|thr/i.test(label) && fiveK) {
          const thr = Math.round(fiveK*1.06); const [l,h]=band(thr,0.03); lo=l; hi=h;
        } else if (/easy|jog/i.test(label) && easy) {
          const [l,h]=band(easy,0.10); lo=l; hi=h;
        }
        if (lo && hi) label = `${label} (target ${lo}–${hi}/mi)`;
      }
      steps.push(label);
    }
  }
  if (defs.cooldown?.label) steps.push(defs.cooldown.label);
  return steps;
}

/**
 * Determine which phase a week belongs to
 */
function getPhase(weekNum: number, planData: UniversalPlanData): string {
  for (const [phase, phaseInfo] of Object.entries(planData.phases)) {
    if (phaseInfo.weeks.includes(weekNum)) {
      return phase;
    }
  }
  
  // Fallback logic if phases not defined
  if (weekNum <= 2) return 'base';
  if (weekNum <= 6) return 'build';
  if (weekNum === 7) return 'peak';
  return 'taper';
}

/**
 * Get long session duration for a specific week and phase
 */
function getLongSessionDuration(weekNum: number, phase: string, sport: string, planData: UniversalPlanData): number {
  const sportData = planData.sports[sport];
  if (!sportData?.long) return 60;

  const phaseData = sportData.long[phase];
  if (!phaseData) return 60;

  // Check for specific week duration first
  const weekKey = `week${weekNum}`;
  if (phaseData[weekKey] && typeof phaseData[weekKey] === 'number') {
    return phaseData[weekKey] as number;
  }

  // Calculate from progression rules
  if (phase === 'base' && phaseData.start) {
    const start = phaseData.start;
    if (weekNum === 1) return start;
    if (weekNum === 2) return start + 10;
    if (weekNum === 3) return start + 20;
    if (weekNum === 4 && phaseData.deload) return Math.round((start + 20) * 0.8);
  }

  if (phase === 'build' && phaseData.start) {
    const start = phaseData.start;
    if (weekNum === 3) return start;
    if (weekNum === 4) return start + 10;
    if (weekNum === 5) return start + 20;
    if (weekNum === 6 && phaseData.deload) return Math.round((start + 30) * 0.8);
  }

  if (phase === 'peak') return 100;
  if (phase === 'taper') return 60;

  return 60;
}

/**
 * Get quality session for a specific week and phase
 */
function getQualitySession(weekNum: number, phase: string, sport: string, planData: UniversalPlanData): {
  type: string;
  session: string;
  duration?: number;
  intensity?: string;
} | null {
  const sportData = planData.sports[sport];
  if (!sportData?.quality) return null;

  const phaseData = sportData.quality[phase];
  if (!phaseData) return null;

  const weekData = phaseData.find(w => w.week === weekNum);
  return weekData || null;
}

/**
 * Get strength session for a specific phase and track
 */
function getStrengthSession(phase: string, strengthTrack: string, planData: UniversalPlanData): string[] {
  if (!planData.strength) return [];

  const trackData = planData.strength[strengthTrack];
  if (!trackData) return [];

  const phaseData = trackData[phase];
  return phaseData || [];
}

/**
 * Get cowboy upper session
 */
function getCowboyUpperSession(planData: UniversalPlanData): string[] {
  return planData.strength?.cowboy_upper || [];
}

function getTrackUpperSession(planData: UniversalPlanData, track: string): string[] {
  const key = track === 'power' ? 'upper_power' : 'upper_endurance';
  // @ts-ignore
  return planData.strength?.[key] || getCowboyUpperSession(planData);
}

/**
 * Universal plan composition - works with any JSON plan file
 */
export async function composeUniversalWeek(params: {
  weekNum: number;
  skeletonWeek: SkeletonWeek;
  planPath: string;
  strengthTrack?: string;
  strengthDays?: 2 | 3;
  baselines?: any; // user baselines for exact targets
}): Promise<SessionTemplate[]> {
  const planData = await loadPlanData(params.planPath);
  const sessions: SessionTemplate[] = [];
  const phase = getPhase(params.weekNum, planData);

  // Alternate format: explicit sessions_by_week
  const explicit = (planData as any)?.sessions_by_week?.[String(params.weekNum)] as any[] | undefined;
  if (Array.isArray(explicit) && explicit.length) {
    for (const sess of explicit) {
      const day = sess.day || 'Monday';
      const discipline = (sess.type || 'run') as any;
      let description: string = sess.description || '';
      let intervals: string[] | undefined;
      if (discipline === 'run') {
        const variantId = parseGarminVariantId(description) || mapGarminVariantFromText(description);
        if (variantId) {
          intervals = await expandGarminIntervals(variantId, undefined, params.baselines);
        }
      }
      // Strength: build structured exercises from description percentages when present
      let strength_exercises: any[] | undefined;
      if (discipline === 'strength') {
        const lines = description.split(',').map((s: string) => s.trim());
        const parsed: any[] = [];
        for (const raw of lines) {
          const m = raw.match(/^(Squat|Back Squat|Bench|Bench Press|Deadlift|Overhead Press|OHP)\s+(\d+)x(\d+)\s*@\s*(\d+)%/i);
          if (m) {
            const name = m[1].replace(/Bench$/, 'Bench Press');
            const sets = parseInt(m[2],10);
            const reps = parseInt(m[3],10);
            const pct = `${m[4]}%`;
            const w = weightFor(name, `@${pct}`);
            parsed.push({ name, sets, reps, weight: w || undefined });
          }
        }
        if (parsed.length) strength_exercises = parsed;
      }
      sessions.push({
        day,
        discipline,
        type: sess.focus || discipline,
        duration: discipline === 'run' && /long/i.test(sess.focus || '') ? 100 : (sess.duration || 45),
        intensity: typeof sess.intensity === 'string' ? sess.intensity : (discipline==='run' ? 'Planned' : 'Moderate'),
        description: intervals && intervals.length ? intervals.join(' • ') : (description || `${discipline} session`),
        intervals,
        strength_exercises,
        zones: []
      } as any);
    }
    return sessions;
  }

  // Map pool IDs to sports
  const poolToSport: Record<string, string> = {
    'run_long_pool': 'run',
    'run_speed_vo2_pool': 'run',
    'run_threshold_pool': 'run',
    'run_easy_pool': 'run',
    'bike_long_pool': 'bike',
    'bike_vo2_pool': 'bike',
    'bike_threshold_pool': 'bike',
    'bike_endurance_pool': 'bike',
    'swim_technique_pool': 'swim',
  };

  // Helpers to apply baselines to descriptions
  const roundTo5 = (w: number) => Math.round(w / 5) * 5;
  function weightFor(lift: string, pctStr: string | undefined): number | null {
    if (!pctStr || !params.baselines) return null;
    const pctMatch = pctStr.match(/(\d+)[\.%]*/);
    const pct = pctMatch ? parseInt(pctMatch[1], 10) / 100 : null;
    if (!pct) return null;
    const oneRMs: Record<string, number | undefined> = {
      squat: params.baselines?.performanceNumbers?.squat,
      bench: params.baselines?.performanceNumbers?.bench,
      deadlift: params.baselines?.performanceNumbers?.deadlift,
      overhead: params.baselines?.performanceNumbers?.overheadPress1RM,
    };
    let oneRm: number | undefined;
    const l = lift.toLowerCase();
    if (l.includes('squat')) oneRm = oneRMs.squat;
    else if (l.includes('bench')) oneRm = oneRMs.bench;
    else if (l.includes('deadlift')) oneRm = oneRMs.deadlift;
    else if (l.includes('ohp') || l.includes('overhead')) oneRm = oneRMs.overhead;
    if (!oneRm) return null;
    return roundTo5(oneRm * pct);
  }

  function applyStrengthBaselines(exercises: string[]): string[] {
    if (!params.baselines) return exercises;
    return exercises.map(e => {
      // e.g., "3x5 Back Squat @70% 1RM"
      const m = e.match(/^(.*?)(Back Squat|Bench Press|Deadlift|Overhead Press|OHP|Barbell Row)(.*?)(@\s*\d+%)/i);
      if (m) {
        const lift = m[2];
        const pctStr = m[4];
        const w = weightFor(lift, pctStr);
        if (w) {
          return e.replace(/@\s*\d+%\s*1RM/i, `— ${w} lb`);
        }
      }
      return e;
    });
  }

  // Build structured strength exercises to prefill Strength Logger
  type StrengthExercise = { name: string; sets: number; reps?: number; weight?: number };
  const parseScheme = (scheme?: string): { sets: number; reps?: number } => {
    if (!scheme) return { sets: 3, reps: 8 };
    // Examples: "3–5 reps", "3x5", "3×6–8", "2–3×8–10"
    const xMatch = scheme.match(/(\d+)\s*[x×]\s*(\d+)(?:[–-]\d+)?/i);
    if (xMatch) return { sets: parseInt(xMatch[1],10), reps: parseInt(xMatch[2],10) };
    const setOnly = scheme.match(/(\d+)[–-]?(\d+)?\s*sets/i);
    if (setOnly) return { sets: parseInt(setOnly[1],10) };
    const repsOnly = scheme.match(/(\d+)[–-]?(\d+)?\s*reps/i);
    if (repsOnly) return { sets: 3, reps: parseInt(repsOnly[1],10) };
    return { sets: 3, reps: 8 };
  };

  function applyRunBaselines(desc: string, type: string | undefined): string {
    if (!params.baselines) return desc;
    const pn = params.baselines?.performanceNumbers || {};
    // helpers
    const parsePace = (s?: string | null): number | null => {
      if (!s) return null;
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };
    const formatPace = (sec: number): string => {
      const m = Math.max(0, Math.floor(sec / 60));
      const s = Math.max(0, sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    };
    const band = (baseSec: number, pct: number): [string, string] => {
      const low = Math.round(baseSec * (1 - pct)); // faster
      const high = Math.round(baseSec * (1 + pct));
      return [formatPace(low), formatPace(high)];
    };

    const fiveKPaceSec = parsePace(pn.fiveK_pace) || null;
    const easyPaceSec = parsePace(pn.easyPace) || null;

    // Endurance / Zone 2 → loose ±10%
    if (type === 'endurance' || /Zone\s*2/i.test(desc)) {
      if (easyPaceSec) {
        const [lo, hi] = band(easyPaceSec, 0.10);
        return `${desc} (target ${lo}–${hi}/mi)`;
      }
      return desc;
    }

    // Tempo/Threshold → base ≈ fiveK pace × 1.06 (slower), tight ±3%
    if (type === 'tempo' || /threshold/i.test(desc)) {
      if (fiveKPaceSec) {
        const base = Math.round(fiveKPaceSec * 1.06);
        const [lo, hi] = band(base, 0.03);
        return `${desc} (target ${lo}–${hi}/mi)`;
      }
      return desc;
    }

    // VO2 / 3K-5K work → base 3K ≈ fiveK pace × 0.94 (faster), tight ±3%
    if (type === 'vo2max' || /3k|5k|vo2/i.test(desc)) {
      if (fiveKPaceSec) {
        const base3k = Math.round(fiveKPaceSec * 0.94);
        const [lo, hi] = band(base3k, 0.03);
        return `${desc} (target ${lo}–${hi}/mi)`;
      }
      return desc;
    }
    return desc;
  }

  for (const slot of params.skeletonWeek.slots) {
    let session: SessionTemplate | null = null;
    const sport = poolToSport[slot.poolId];

    if (slot.poolId.includes('_long_pool') && sport) {
      const duration = getLongSessionDuration(params.weekNum, phase, sport, planData);
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: sport as any,
        type: 'endurance',
        duration,
        intensity: 'Zone 2',
        description: applyRunBaselines(`${sport.charAt(0).toUpperCase() + sport.slice(1)} long session - ${duration} minutes at easy pace.`, 'endurance'),
        zones: []
      };
    }

    else if (slot.poolId.includes('_vo2_pool') && sport) {
      const qualitySession = getQualitySession(params.weekNum, phase, sport, planData);
      if (qualitySession && qualitySession.type === 'VO2') {
        // Attempt to expand Garmin-ready intervals if variant id present in session string
        const variantId = parseGarminVariantId(qualitySession.session);
        let intervals: string[] | undefined = undefined;
        if (variantId) {
          intervals = await expandGarminIntervals(variantId, undefined, params.baselines);
        }
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: sport as any,
          type: 'vo2max',
          duration: qualitySession.duration || 55,
          intensity: qualitySession.intensity || 'Zone 4-5',
          description: (intervals && intervals.length > 0)
            ? intervals.join(' • ')
            : applyRunBaselines(qualitySession.session, 'vo2max'),
          intervals: intervals,
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('_threshold_pool') && sport) {
      const qualitySession = getQualitySession(params.weekNum, phase, sport, planData);
      if (qualitySession && qualitySession.type === 'Tempo') {
        const variantId = parseGarminVariantId(qualitySession.session);
        let intervals: string[] | undefined = undefined;
        if (variantId) {
          intervals = await expandGarminIntervals(variantId, undefined, params.baselines);
        }
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: sport as any,
          type: 'tempo',
          duration: qualitySession.duration || 60,
          intensity: qualitySession.intensity || 'Zone 3-4',
          description: (intervals && intervals.length > 0)
            ? intervals.join(' • ')
            : applyRunBaselines(qualitySession.session, 'tempo'),
          intervals: intervals,
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('_easy_pool') && sport) {
      const easyData = planData.sports[sport]?.easy?.[phase];
      session = {
        day: slot.day === 'Mon' ? 'Monday' : 
              slot.day === 'Tue' ? 'Tuesday' : 
              slot.day === 'Wed' ? 'Wednesday' : 
              slot.day === 'Thu' ? 'Thursday' : 
              slot.day === 'Fri' ? 'Friday' : 
              slot.day === 'Sat' ? 'Saturday' : 'Sunday',
        discipline: sport as any,
        type: 'endurance',
        duration: easyData?.duration || 45,
        intensity: 'Zone 2',
        description: applyRunBaselines(easyData?.description || 'Easy recovery session. Focus on form and breathing.', 'endurance'),
        zones: []
      };
    }

    else if (slot.poolId.includes('strength_upper_')) {
      const pools = await loadPoolsData();
      const isPowerUpper = slot.poolId === 'strength_upper_power';
      let lines: string[] = [];
      if (isPowerUpper) {
        const upper = pools?.strength?.power?.optional_upper_core_supportive_pool?.exercises || [];
        lines = upper.map((e: any) => `${e.name} ${e.scheme}`);
      } else {
        // Endurance upper/core supportive: prefer track-specific from planData if present
        const planUpper = (planData as any)?.strength?.upper_endurance as string[] | undefined;
        if (Array.isArray(planUpper) && planUpper.length) {
          lines = planUpper.slice();
        } else {
          // Fallback: derive from endurance circuits pool (upper-biased subset)
          const blocks = pools?.strength?.endurance?.circuits_pool?.blocks || [];
          const pick = blocks[(params.weekNum - 1) % Math.max(1, blocks.length)] || blocks[0];
          const upperish = (pick?.items || []).filter((it: any) => /press|push|pull|row|core|plank|carry|raise|rotation/i.test(it.name));
          lines = upperish.map((it: any) => `${it.name} ${it.reps || it.time || ''}`.trim());
          if (pick?.name) lines.unshift(`${pick.name} x${pick.rounds || 3}`);
        }
      }
      if (lines.length > 0) {
        const applied = applyStrengthBaselines(lines);
        const structured: StrengthExercise[] = lines.map((raw: string) => {
          const name = raw.replace(/\s*\d.+$/, '').trim();
          const sc = parseScheme(raw);
          return { name, sets: sc.sets, reps: sc.reps };
        });
        session = {
          day: slot.day === 'Mon' ? 'Monday' : 
                slot.day === 'Tue' ? 'Tuesday' : 
                slot.day === 'Wed' ? 'Wednesday' : 
                slot.day === 'Thu' ? 'Thursday' : 
                slot.day === 'Fri' ? 'Friday' : 
                slot.day === 'Sat' ? 'Saturday' : 'Sunday',
          discipline: 'strength',
          type: 'strength',
          duration: 30,
          intensity: 'Moderate',
          description: `Strength – Optional Upper/Core (supportive): ${applied.join(' • ')}`,
          strength_exercises: structured,
          zones: []
        };
      }
    }

    else if (slot.poolId.includes('strength_') && params.strengthTrack) {
      const pools = await loadPoolsData();
      const isPower = params.strengthTrack === 'power';
      const isEndurance = params.strengthTrack === 'endurance';
      const dayName = slot.day === 'Mon' ? 'Monday' : slot.day === 'Tue' ? 'Tuesday' : slot.day === 'Wed' ? 'Wednesday' : slot.day === 'Thu' ? 'Thursday' : slot.day === 'Fri' ? 'Friday' : slot.day === 'Sat' ? 'Saturday' : 'Sunday';
      if (isPower) {
        const anchors: any[] = pools?.strength?.power?.anchors || [];
        const existingStrength = sessions.filter(s => s.discipline === 'strength');
        const anchorIdx = existingStrength.length % 2; // 0 then 1
        const anchor = anchors[anchorIdx] || anchors[0];
        const parts: string[] = [];
        const structured: StrengthExercise[] = [];
        if (anchor?.label) parts.push(anchor.label);
        // Prefer explicit @% 1RM for loads to trigger conversion
        (anchor?.main_lifts || []).forEach((l: any) => {
          const pct = l.intensity_hint?.match(/(\d+\s*–\s*\d+|\d+\-\d+|\d+\s*to\s*\d+|\d+\-?\d*?)%/i);
          const chosenRaw = pct ? (pct[0].includes('–') || pct[0].includes('to') || pct[0].includes('-') ? pct[0].split(/[–to-]/)[0].trim() : pct[0].replace(/%/g,'')) : undefined;
          const at = chosenRaw ? `@${chosenRaw}% 1RM` : '';
          parts.push(`${l.name} ${l.scheme} ${at}`.trim());
          const w = weightFor(l.name, at);
          const sc = parseScheme(l.scheme);
          structured.push({ name: l.name, sets: sc.sets, reps: sc.reps, weight: w || undefined });
        });
        (anchor?.support_light || []).forEach((l: any) => parts.push(`${l.name} ${l.scheme}`));
        const applied = applyStrengthBaselines(parts);
        session = {
          day: dayName,
          discipline: 'strength',
          type: 'strength',
          duration: 45,
          intensity: 'Moderate',
          description: applied.join(' • '),
          strength_exercises: structured,
          zones: []
        };
      } else if (isEndurance) {
        const circuits = pools?.strength?.endurance?.circuits_pool?.blocks || [];
        const pick = circuits[(params.weekNum - 1) % Math.max(1, circuits.length)] || circuits[0];
        const items: string[] = [];
        const structured: StrengthExercise[] = [];
        if (pick?.name) items.push(`${pick.name} x${pick.rounds || 3}`);
        (pick?.items || []).forEach((it: any) => {
          items.push(`${it.name} ${it.reps || it.time || ''}`.trim());
          const firstRep = (it.reps || '').toString().match(/\d+/)?.[0];
          const sc = parseScheme(`${pick.rounds || 3}x${firstRep || 10}`);
          structured.push({ name: it.name, sets: sc.sets, reps: sc.reps });
        });
        session = {
          day: dayName,
          discipline: 'strength',
          type: 'strength',
          duration: 40,
          intensity: 'Moderate',
          description: `Strength – Endurance: Circuit • ${items.join(' • ')}`,
          strength_exercises: structured,
          zones: []
        };
      }
    }

    if (session) {
      sessions.push(session);
    }
  }

  // Enforce Garmin-ready interval expansion for run intervals if plan specifies
  // (Assumes quality sessions description includes a variant id; otherwise leave as-is)

  // Insert optional upper/core supportive day with adjacency rule when 3× strength requested
  if (params.strengthDays === 3 && params.strengthTrack) {
    const upperExercises = getTrackUpperSession(planData, params.strengthTrack);
    if (upperExercises.length > 0) {
      const strengthDays = sessions.filter(s => s.discipline === 'strength').map(s => s.day);
      const orderedDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const isUpperHeavy = (day: string) => false; // anchors defined in scheduler placement; composer enforces separation at insert
      let candidate: string | null = null;
      for (const d of orderedDays) {
        if (!strengthDays.includes(d)) {
          const idx = orderedDays.indexOf(d);
          const prev = orderedDays[(idx + 6) % 7];
          const next = orderedDays[(idx + 1) % 7];
          if (!strengthDays.includes(prev) && !strengthDays.includes(next)) {
            candidate = d; break;
          }
        }
      }
      if (candidate) {
        sessions.push({
          day: candidate,
          discipline: 'strength',
          type: 'strength',
          duration: 30,
          intensity: 'Moderate',
          description: `Strength – Optional Upper/Core (supportive): ${applyStrengthBaselines(upperExercises).join(' • ')}`,
          zones: []
        });
      }
    }
  }

  // Validation enforcement: ensure power anchors appear when track is power
  if (params.strengthTrack === 'power') {
    const text = sessions.filter(s => s.discipline === 'strength').map(s => `${s.description}`.toLowerCase()).join(' \n');
    const required = ['squat', 'deadlift', 'bench', 'overhead'];
    const missing = required.filter(k => !text.includes(k));
    if (missing.length) {
      console.warn('Validation: missing heavy compounds in week', params.weekNum, missing);
    }
  }
  // Endurance circuits: soft assert that no heavy compounds
  if (params.strengthTrack === 'endurance') {
    const hasHeavy = sessions.some(s => s.discipline==='strength' && /squat|deadlift|bench|overhead/i.test(s.description));
    if (hasHeavy) {
      console.warn('Validation: endurance circuits contained heavy compounds in week', params.weekNum);
    }
  }

  return sessions;
}
