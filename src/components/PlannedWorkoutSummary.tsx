import React from 'react';
import { normalizePlannedSession, Baselines as NormalizerBaselines, ExportHints } from '@/services/plans/normalizer';
import { normalizeStructuredSession } from '@/services/plans/normalizer';
import { resolvePlannedDurationMinutes } from '@/utils/resolvePlannedDuration';
import { formatStrengthExercise } from '@/utils/strengthFormatter';

type Baselines = NormalizerBaselines | Record<string, any> | null | undefined;

interface PlannedWorkoutSummaryProps {
  workout: any;
  baselines?: Baselines;
  exportHints?: ExportHints;
  hideLines?: boolean;
  suppressNotes?: boolean;
}

const formatDuration = (minutes: number) => {
  if (!minutes && minutes !== 0) return '';
  const mins = minutes % 60;
  const totalMins = minutes;
  // Return MM:00 format (e.g., "52:00")
  return `${totalMins}:00`;
};

function getTitle(workout: any): string {
  const st = String((workout as any)?.workout_structure?.title || (workout as any)?.workout_title || '').trim();
  if (st) return st;
  const nm = (workout.name || '');
  const t = String(workout.type || '').toLowerCase();
  const desc = String(workout.rendered_description || workout.description || '');
  const tags = Array.isArray(workout.tags) ? (workout.tags as any[]).map((x: any) => String(x).toLowerCase()) : [];
  const lower = desc.toLowerCase();
  if (t === 'ride') {
    if (tags.includes('long_ride')) return 'Ride — Long Ride';
    if (/vo2/.test(lower)) return 'Ride — VO2';
    if (/threshold|thr_/.test(lower)) return 'Ride — Threshold';
    if (/sweet\s*spot|\bss\b/.test(lower)) return 'Ride — Sweet Spot';
    if (/recovery/.test(lower)) return 'Ride — Recovery';
    if (/endurance|z2/.test(lower)) return 'Ride — Endurance';
    return nm || 'Ride';
  }
  if (t === 'run') {
    if (tags.includes('long_run')) return 'Run — Long Run';
    if (/tempo/.test(lower)) return 'Run — Tempo';
    if (/(intervals?)/.test(lower) || /(\d+)\s*[x×]\s*(\d+)/.test(lower)) return 'Run — Intervals';
    return nm || 'Run';
  }
  if (t === 'swim') {
    if (tags.includes('opt_kind:technique') || /drills|technique/.test(lower)) return 'Swim — Technique';
    return nm || 'Swim — Endurance';
  }
  if (t === 'strength') return nm || 'Strength';
  if (t === 'mobility') return nm || 'Mobility';
  if (t === 'pilates_yoga') {
    // Just return "Pilates" or "Yoga" - specific type goes in description
    const nameLower = String(nm || '').toLowerCase();
    const descLower = String(desc || '').toLowerCase();
    const combined = (nameLower + ' ' + descLower).toLowerCase();
    
    // Determine if it's yoga or pilates
    if (/yoga/i.test(combined)) return 'Yoga';
    if (/pilates/i.test(combined)) return 'Pilates';
    
    return nm || 'Pilates/Yoga';
  }
  return nm || 'Session';
}

function parseComputed(workout: any): any | null {
  try {
    const c = (workout as any)?.computed;
    if (!c) return null;
    if (typeof c === 'string') return JSON.parse(c);
    return c;
  } catch { return (workout as any)?.computed || null; }
}

function computeMinutes(workout: any, baselines?: Baselines, exportHints?: ExportHints): number | null {
  // Prefer recompute from computed.steps (client authoritative), then fall back
  try {
    const compA = parseComputed(workout);
    const steps: any[] = Array.isArray(compA?.steps) ? compA.steps : [];
    if (steps.length > 0) {
      const secPerMeterFromPace = (pace?: string): number | null => {
        try {
          if (!pace) return null;
          const m = String(pace).match(/(\d+):(\d{2})\/(mi|km)/i);
          if (!m) return null;
          const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          const unit = m[3].toLowerCase();
          const meters = unit === 'mi' ? 1609.34 : 1000;
          return sec / meters;
        } catch { return null; }
      };
      const sumSec = steps.reduce((acc: number, st: any) => {
        // Direct seconds
        const s = Number(st?.seconds);
        if (Number.isFinite(s) && s > 0) return acc + s;
        const d = Number((st as any)?.durationSeconds);
        if (Number.isFinite(d) && d > 0) return acc + d;
        // Distance-based step with pace target → estimate
        const meters = Number(st?.distanceMeters);
        if (Number.isFinite(meters) && meters > 0) {
          // Prefer numeric planned pace when available
          const pr: any = (st as any)?.pace_range;
          let secPerMeter: number | null = null;
          if (Array.isArray(pr) && pr.length === 2) {
            const a = Number(pr[0]); const b = Number(pr[1]);
            if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
              const mid = (a + b) / 2;
              secPerMeter = mid / 1609.34;
            }
          } else if (pr && typeof pr === 'object' && typeof pr.lower === 'number' && typeof pr.upper === 'number') {
            const a = Number(pr.lower); const b = Number(pr.upper);
            if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
              const mid = (a + b) / 2;
              secPerMeter = mid / 1609.34;
            }
          }
          if (secPerMeter == null && typeof (st as any)?.pace_sec_per_mi === 'number') {
            const sec = Number((st as any).pace_sec_per_mi);
            if (Number.isFinite(sec) && sec > 0) secPerMeter = sec / 1609.34;
          }
          if (secPerMeter == null) {
            secPerMeter = secPerMeterFromPace(typeof st?.paceTarget === 'string' ? st.paceTarget : undefined);
          }
          const spm = secPerMeter;
          if (spm != null) return acc + meters * spm;
        }
        return acc;
      }, 0);
      if (sumSec > 0) return Math.max(1, Math.round(sumSec / 60));
    }
  } catch {}
  try {
    const compB = parseComputed(workout);
    const ts = Number(compB?.total_duration_seconds) || Number((workout as any)?.total_duration_seconds);
    if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));
  } catch {}
  try {
    // Final fallback: derive from stored totals only (no guessing)
    const minutes = resolvePlannedDurationMinutes(workout as any);
    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  } catch {}
  return null;
}

function computeSwimYards(workout: any): number | null {
  const type = String((workout as any)?.type || '').toLowerCase();
  if (type !== 'swim') return null;
  // Prefer tokens (authoring unit is yd) to avoid yd→m→yd drift
  try {
    const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset : [];
    if (toks.length) {
      const toYd = (n: number, unit: string) => unit.toLowerCase() === 'm' ? Math.round(n / 0.9144) : n;
      let sum = 0;
      toks.forEach((t) => {
        const s = String(t).toLowerCase();
        let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10), m[2]); return; }
        m = s.match(/swim_drill_[a-z0-9_]+_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
        m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
        m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[2], 10) * parseInt(m[3], 10), m[4]); return; }
        m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
        m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1],10) * parseInt(m[2],10), m[3]); return; }
        m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1],10) * parseInt(m[2],10), m[3]); return; }
      });
      return sum > 0 ? sum : null;
    }
  } catch {}
  // Fallback to computed distances
  try {
    const compC = parseComputed(workout);
    const steps: any[] = Array.isArray(compC?.steps) ? compC.steps : [];
    if (steps.length) {
      const meters = steps.reduce((a: number, st: any) => a + (Number(st?.distanceMeters) || 0), 0);
      const yd = Math.round(meters / 0.9144);
      if (yd > 0) return yd;
    }
  } catch {}
  return null;
}

function buildWeeklySubtitle(workout: any, baselines?: Baselines): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    try {
      const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
      if (disc === 'pilates_yoga') {
        // Extract session type details for pilates/yoga
        const metadata = (workout as any)?.workout_metadata || {};
        const sessionType = metadata.session_type;
        const parts: string[] = [];
        
        if (sessionType) {
          const sessionTypeLabels: { [key: string]: string } = {
            'pilates_mat': 'Mat',
            'pilates_reformer': 'Reformer',
            'yoga_flow': 'Flow',
            'yoga_restorative': 'Restorative',
            'yoga_power': 'Power',
            'other': ''
          };
          const typeLabel = sessionTypeLabels[sessionType];
          if (typeLabel) parts.push(typeLabel);
        } else {
          // Infer from description/name for planned workouts
          const nameLower = String(workout.name || '').toLowerCase();
          const descLower = String(workout.description || workout.rendered_description || '').toLowerCase();
          const combined = (nameLower + ' ' + descLower).toLowerCase();
          
          if (/reformer/i.test(combined)) parts.push('Reformer');
          else if (/mat/i.test(combined)) parts.push('Mat');
          else if (/yoga.*power|ashtanga|power.*yoga/i.test(combined)) parts.push('Power');
          else if (/yoga.*flow|vinyasa|flow.*yoga/i.test(combined)) parts.push('Flow');
          else if (/yoga.*restorative|yin.*yoga|restorative.*yoga/i.test(combined)) parts.push('Restorative');
        }
        
        // Add duration if available (duration is in minutes, total_duration_seconds is in seconds)
        let durationMins: number | null = null;
        if (typeof (workout as any)?.duration === 'number' && (workout as any).duration > 0) {
          durationMins = Math.round((workout as any).duration);
        } else if (typeof (workout as any)?.total_duration_seconds === 'number' && (workout as any).total_duration_seconds > 0) {
          durationMins = Math.round((workout as any).total_duration_seconds / 60);
        }
        if (durationMins && durationMins > 0) {
          parts.push(`${durationMins}min`);
        }
        
        // Add RPE if available
        const rpe = metadata.session_rpe;
        if (typeof rpe === 'number' && rpe > 0) {
          parts.push(`RPE ${rpe}/10`);
        }
        
        // Add focus areas if available
        const focusAreas = metadata.focus_area;
        if (Array.isArray(focusAreas) && focusAreas.length > 0) {
          const focusLabels: { [key: string]: string } = {
            'core': 'Core',
            'upper_body': 'Upper Body',
            'lower_body': 'Lower Body',
            'flexibility': 'Flexibility',
            'balance': 'Balance',
            'full_body': 'Full Body'
          };
          const focusList = focusAreas.map((f: string) => focusLabels[f] || f).join(', ');
          if (focusList) parts.push(focusList);
        }
        
        if (parts.length > 0) return parts.join(' • ');
        
        // Fallback to description if no structured data
        const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
        if (desc) return desc;
      }
      if (disc === 'swim') {
        const parts: string[] = [];
        const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t: any) => String(t)) : [];
        if (stepsTok.length) {
          let wu: string | null = null, cd: string | null = null;
          const drills: string[] = []; const pulls: string[] = []; const kicks: string[] = []; const aerobics: string[] = [];
          stepsTok.forEach((t) => {
            const s = String(t).toLowerCase();
            let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
            if (m) { const txt = `${parseInt(m[1], 10)} ${m[2].toLowerCase()}`; if (/warmup/i.test(s)) wu = `WU ${txt}`; else cd = `CD ${txt}`; return; }
            m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const name = m[1].replace(/_/g, ' '); const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; drills.push(`${name} ${reps}x${dist}${r}`); return; }
            m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const name = m[4].replace(/_/g, ' '); drills.push(`${name} ${reps}x${dist}`); return; }
            m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; (m[1] === 'pull' ? pulls : kicks).push(`${reps}x${dist}${r}`); return; }
            m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : ''; aerobics.push(`${reps}x${dist}${r}`); return; }
            m = s.match(/swim_threshold_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : ''; aerobics.push(`threshold ${reps}x${dist}${r}`); return; }
            m = s.match(/swim_interval_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
            if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : ''; aerobics.push(`interval ${reps}x${dist}${r}`); return; }
          });
          if (wu) parts.push(wu);
          if (drills.length) parts.push(`Drills: ${Array.from(new Set(drills)).join(', ')}`);
          if (pulls.length) parts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
          if (kicks.length) parts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
          if (aerobics.length) parts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
          if (cd) parts.push(cd);
          if (parts.length) return parts.join(' • ');
        }
      }
    } catch {}
    const structured = (workout as any)?.workout_structure;
    if (structured && typeof structured === 'object') {
      try {
        const res = normalizeStructuredSession(workout, { performanceNumbers: pn } as any);
        if (res?.friendlySummary) return res.friendlySummary;
      } catch {}
    }
    const friendly = String((workout as any)?.friendly_summary || '').trim();
    if (friendly) return friendly;
    const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
    return desc || undefined;
  } catch { return undefined; }
}

// Structured‑only variant: no coach notes fallback
function buildStructuredSubtitleOnly(workout: any, baselines?: Baselines): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
    if (disc === 'pilates_yoga') {
      // Extract session type details for pilates/yoga
      const metadata = (workout as any)?.workout_metadata || {};
      const sessionType = metadata.session_type;
      const parts: string[] = [];
      
      if (sessionType) {
        const sessionTypeLabels: { [key: string]: string } = {
          'pilates_mat': 'Mat',
          'pilates_reformer': 'Reformer',
          'yoga_flow': 'Flow',
          'yoga_restorative': 'Restorative',
          'yoga_power': 'Power',
          'other': ''
        };
        const typeLabel = sessionTypeLabels[sessionType];
        if (typeLabel) parts.push(typeLabel);
      } else {
        // Infer from description/name for planned workouts
        const nameLower = String(workout.name || '').toLowerCase();
        const descLower = String(workout.description || workout.rendered_description || '').toLowerCase();
        const combined = (nameLower + ' ' + descLower).toLowerCase();
        
        if (/reformer/i.test(combined)) parts.push('Reformer');
        else if (/mat/i.test(combined)) parts.push('Mat');
        else if (/yoga.*power|ashtanga|power.*yoga/i.test(combined)) parts.push('Power');
        else if (/yoga.*flow|vinyasa|flow.*yoga/i.test(combined)) parts.push('Flow');
        else if (/yoga.*restorative|yin.*yoga|restorative.*yoga/i.test(combined)) parts.push('Restorative');
      }
      
      // Add duration if available (duration is in minutes, total_duration_seconds is in seconds)
      let durationMins: number | null = null;
      if (typeof (workout as any)?.duration === 'number' && (workout as any).duration > 0) {
        durationMins = Math.round((workout as any).duration);
      } else if (typeof (workout as any)?.total_duration_seconds === 'number' && (workout as any).total_duration_seconds > 0) {
        durationMins = Math.round((workout as any).total_duration_seconds / 60);
      }
      if (durationMins && durationMins > 0) {
        parts.push(`${durationMins}min`);
      }
      
      // Add RPE if available
      const rpe = metadata.session_rpe;
      if (typeof rpe === 'number' && rpe > 0) {
        parts.push(`RPE ${rpe}/10`);
      }
      
      // Add focus areas if available
      const focusAreas = metadata.focus_area;
      if (Array.isArray(focusAreas) && focusAreas.length > 0) {
        const focusLabels: { [key: string]: string } = {
          'core': 'Core',
          'upper_body': 'Upper Body',
          'lower_body': 'Lower Body',
          'flexibility': 'Flexibility',
          'balance': 'Balance',
          'full_body': 'Full Body'
        };
        const focusList = focusAreas.map((f: string) => focusLabels[f] || f).join(', ');
        if (focusList) parts.push(focusList);
      }
      
      if (parts.length > 0) return parts.join(' • ');
      
      // Fallback to description if no structured data
      const desc = String((workout as any)?.rendered_description || (workout as any)?.description || '').trim();
      if (desc) return desc;
    }
    if (disc === 'swim') {
      const parts: string[] = [];
      const stepsTok: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset.map((t: any) => String(t)) : [];
      if (stepsTok.length) {
        let wu: string | null = null, cd: string | null = null;
        const drills: string[] = []; const pulls: string[] = []; const kicks: string[] = []; const aerobics: string[] = [];
        stepsTok.forEach((t) => {
          const s = String(t).toLowerCase();
          let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i);
          if (m) { const txt = `${parseInt(m[1], 10)} ${m[2].toLowerCase()}`; if (/warmup/i.test(s)) wu = `WU ${txt}`; else cd = `CD ${txt}`; return; }
          m = s.match(/swim_drill_([a-z0-9_]+)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          if (m) { const name = m[1].replace(/_/g, ' '); const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; drills.push(`${name} ${reps}x${dist}${r}`); return; }
          m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)_([a-z0-9_]+)/i);
          if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const name = m[4].replace(/_/g, ' '); drills.push(`${name} ${reps}x${dist}`); return; }
          m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          if (m) { const reps = parseInt(m[2], 10); const dist = parseInt(m[3], 10); const r = m[5] ? ` @ :${parseInt(m[5], 10)}r` : ''; (m[1] === 'pull' ? pulls : kicks).push(`${reps}x${dist}${r}`); return; }
          m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?/i);
          if (m) { const reps = parseInt(m[1], 10); const dist = parseInt(m[2], 10); const r = m[4] ? ` @ :${parseInt(m[4], 10)}r` : ''; aerobics.push(`${reps}x${dist}${r}`); return; }
        });
        if (wu) parts.push(wu);
        if (drills.length) parts.push(`Drills: ${Array.from(new Set(drills)).join(', ')}`);
        if (pulls.length) parts.push(`Pull ${Array.from(new Set(pulls)).join(', ')}`);
        if (kicks.length) parts.push(`Kick ${Array.from(new Set(kicks)).join(', ')}`);
        if (aerobics.length) parts.push(`Aerobic ${Array.from(new Set(aerobics)).join(', ')}`);
        if (cd) parts.push(cd);
        if (parts.length) return parts.join(' • ');
      }
    }
    const structured = (workout as any)?.workout_structure;
    if (structured && typeof structured === 'object') {
      try {
        const res = normalizeStructuredSession(workout, { performanceNumbers: pn } as any);
        if (res?.friendlySummary) return res.friendlySummary;
      } catch {}
    }
    return undefined;
  } catch { return undefined; }
}

export const PlannedWorkoutSummary: React.FC<PlannedWorkoutSummaryProps> = ({ workout, baselines, exportHints, hideLines, suppressNotes }) => {
  const minutes = (()=>{
    const t = String((workout as any)?.type||'').toLowerCase();
    if (t==='strength') return null; // avoid misleading 45min placeholders
    return computeMinutes(workout, baselines, exportHints);
  })();
  const yards = computeSwimYards(workout);
  const title = getTitle(workout);
  const lines = suppressNotes ? (buildStructuredSubtitleOnly(workout, baselines) || '') : (buildWeeklySubtitle(workout, baselines) || '');
  const isStrength = String((workout as any)?.type||'').toLowerCase()==='strength';
  const isMobility = String((workout as any)?.type||'').toLowerCase()==='mobility';
  const strengthItems: string[] = (() => {
    if (!isStrength) return [];
    try {
      // Prefer computed strength steps (server-prescribed)
      const compD = parseComputed(workout);
      const cSteps: any[] = Array.isArray(compD?.steps) ? compD.steps : [];
      const comp = cSteps.filter(st => String((st as any)?.kind||'').toLowerCase()==='strength').map((st:any)=> st?.strength).filter(Boolean) as any[];
      const asLines = (arr:any[]) => arr.map((s:any)=>{
        // Use shared formatter for consistent display
        return formatStrengthExercise(s, 'imperial');
      });
      if (comp.length) return asLines(comp);
      // Fallback: authored exercises
      const ex: any[] = Array.isArray((workout as any)?.strength_exercises) ? (workout as any).strength_exercises : [];
      if (!ex.length) return [];
      return ex.map((e:any)=>{
        // Fallback for non-materialized exercises - use shared formatter
        // Special handling for string weights (e.g., "70% 1RM" from raw JSON)
        if (typeof e?.weight === 'string' && e.weight.trim()) {
          // Keep string weights as-is for raw exercises
          const formatted = formatStrengthExercise(e, 'imperial');
          const name = String(e?.name||'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
          const sets = Math.max(1, Number(e?.sets)||1);
          const repsVal:any = (():any=>{ const r=e?.reps||e?.rep; if (typeof r==='string') return r.toUpperCase(); if (typeof r==='number') return Math.max(1, Math.round(r)); return undefined; })();
          const repTxt = (typeof repsVal==='string') ? repsVal : `${Number(repsVal||0)}`;
          const notes = e?.notes ? ` (${String(e.notes).trim()})` : '';
          return `${name} ${sets}×${repTxt} — ${e.weight.trim()}${notes}`;
        }
        return formatStrengthExercise(e, 'imperial');
      });
    } catch { return []; }
  })();

  // Endurance detail lines from computed steps (no coach notes)
  const enduranceLines: string[] = (() => {
    try {
      const t = String((workout as any)?.type||'').toLowerCase();
      if (!(t==='run' || t==='ride' || t==='walk')) return [];
      const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
      if (!steps.length) return [];
      const hints = (workout as any)?.export_hints || {};
      const tolQual: number = (typeof hints?.pace_tolerance_quality==='number' ? hints.pace_tolerance_quality : 0.04);
      const tolEasy: number = (typeof hints?.pace_tolerance_easy==='number' ? hints.pace_tolerance_easy : 0.06);
      const fmtTime = (s:number)=>{ const x=Math.max(1,Math.round(Number(s)||0)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
      const fmtDist = (meters:number)=>{
        const m = Math.max(1, Math.round(Number(meters)||0));
        const planUnits = String((workout as any)?.units||'').toLowerCase();
        if (planUnits === 'metric') {
          // Metric: show km for longer distances, m for shorter
          if (m >= 1000) {
            const km = (m / 1000).toFixed(1);
            return `${km} km`;
          }
          return `${m} m`;
        } else {
          // Imperial: convert meters to miles
          const miles = m / 1609.34;
          if (miles < 0.1) {
            // Very short distances: show in yards
            const yards = Math.round(m / 0.9144);
            return `${yards} yd`;
          } else if (miles < 1) {
            // Less than a mile: show with 2 decimals
            return `${miles.toFixed(2)} mi`;
          } else {
            // One mile or more: show with 1 decimal
            return `${miles.toFixed(1)} mi`;
          }
        }
      };
      const paceStrWithRange = (paceTarget?: string, kind?: string, paceRange?: any) => {
        try {
          // Priority 1: Use server-processed pace_range object
          if (paceRange && typeof paceRange === 'object' && paceRange.lower && paceRange.upper) {
            const formatPace = (sec: number) => {
              const mins = Math.floor(sec / 60);
              const secs = Math.round(sec % 60);
              return `${mins}:${secs.toString().padStart(2, '0')}`;
            };
            return `${formatPace(paceRange.lower)}–${formatPace(paceRange.upper)}/mi`;
          }
          
          // Priority 2: Use server-processed pace_range array
          if (Array.isArray(paceRange) && paceRange.length === 2 && paceRange[0] && paceRange[1]) {
            return `${paceRange[0]}–${paceRange[1]}`;
          }
          
          // Priority 3: Fall back to client-side calculation from paceTarget
          if (!paceTarget) return undefined;
          const m = String(paceTarget).match(/(\d+):(\d{2})\/(mi|km)/i);
          if (!m) return undefined;
          const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
          const unit = m[3].toLowerCase();
          const ease = String(kind||'').toLowerCase();
          const tol = (ease==='recovery' || ease==='warmup' || ease==='cooldown') ? tolEasy : tolQual;
          const lo = Math.round(sec*(1 - tol));
          const hi = Math.round(sec*(1 + tol));
          const mmss = (n:number)=>{ const mm=Math.floor(n/60); const ss=n%60; return `${mm}:${String(ss).padStart(2,'0')}`; };
          return `${mmss(lo)}–${mmss(hi)}/${unit}`;
        } catch { return undefined; }
      };
      const powerStr = (st:any) => (st?.powerRange && typeof st.powerRange.lower==='number' && typeof st.powerRange.upper==='number') ? `${Math.round(st.powerRange.lower)}–${Math.round(st.powerRange.upper)} W` : undefined;
      const out: string[] = [];
      let i = 0;
      const isWork = (x:any)=> String((x?.kind||'')).toLowerCase()==='work' || String((x?.kind||''))==='interval_work' || String((x?.kind||'')).toLowerCase()==='steady';
      const isRec = (x:any)=> String((x?.kind||'')).toLowerCase()==='recovery' || /rest/i.test(String(x?.label||''));
      while (i < steps.length) {
        const st:any = steps[i];
        const kind = String(st?.kind||'').toLowerCase();
        if (kind==='warmup' && typeof st?.seconds==='number') {
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'warmup', st?.pace_range);
          out.push(`WU ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
          i += 1; continue;
        }
        if (kind==='cooldown' && typeof st?.seconds==='number') {
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'cooldown', st?.pace_range);
          out.push(`CD ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
          i += 1; continue;
        }
        if (isWork(st)) {
          const workLabel = (()=>{
            if (typeof st?.distanceMeters==='number' && st.distanceMeters>0) return fmtDist(st.distanceMeters);
            if (typeof st?.seconds==='number' && st.seconds>0) return fmtTime(st.seconds);
            return 'interval';
          })();
          const workPace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined, st?.kind, st?.pace_range);
          const workPower = powerStr(st);
          const next = steps[i+1];
          const hasRec = next && isRec(next);
          const restLabel = hasRec ? (()=>{
            if (typeof next?.seconds==='number' && next.seconds>0) return fmtTime(next.seconds);
            if (typeof next?.distanceMeters==='number' && next.distanceMeters>0) return fmtDist(next.distanceMeters);
            return 'rest';
          })() : undefined;
          const restPace = hasRec ? paceStrWithRange(typeof next?.paceTarget==='string'?next.paceTarget:undefined, 'recovery', next?.pace_range) : undefined;
          const restPower = hasRec ? powerStr(next) : undefined;
          let count = 0; let j = i;
          while (j < steps.length) {
            const a = steps[j]; const b = steps[j+1];
            if (!isWork(a)) break;
            const aLabel = (typeof a?.distanceMeters==='number' && a.distanceMeters>0) ? fmtDist(a.distanceMeters) : (typeof a?.seconds==='number' ? fmtTime(a.seconds) : 'interval');
            const aPace = paceStrWithRange(typeof a?.paceTarget==='string'?a.paceTarget:undefined, a?.kind, a?.pace_range);
            const aPow = powerStr(a);
            const bLabel = (b && isRec(b)) ? ((typeof b?.seconds==='number' && b.seconds>0) ? fmtTime(b.seconds) : (typeof b?.distanceMeters==='number' && b.distanceMeters>0 ? fmtDist(b.distanceMeters) : 'rest')) : undefined;
            const bPace = (b && isRec(b)) ? paceStrWithRange(typeof b?.paceTarget==='string'?b.paceTarget:undefined, 'recovery', b?.pace_range) : undefined;
            const bPow = (b && isRec(b)) ? powerStr(b) : undefined;
            const sameWork = (aLabel===workLabel) && (aPace===workPace) && (aPow===workPower);
            const sameRest = (!hasRec && !b) || (!!hasRec && !!b && isRec(b) && bLabel===restLabel && bPace===restPace && bPow===restPower);
            if (!sameWork || !sameRest) break;
            count += 1; j += hasRec ? 2 : 1;
          }
          const workAnno = workPace ? ` (${workPace})` : (workPower?` (${workPower})`:'' );
          const restAnno = hasRec ? (restPace ? ` ${restLabel} (${restPace})` : (restPower?` ${restLabel} (${restPower})` : ` ${restLabel}`)) : '';
          const countDisplay = Math.max(1, Number(count)||0);
          out.push(`${countDisplay} × ${workLabel}${workAnno}${restAnno}`);
          if (j <= i) { i += 1; continue; }
          i = j; continue;
        }
        if (typeof st?.seconds==='number') { out.push(`1 × ${fmtTime(st.seconds)}`); i+=1; continue; }
        if (typeof st?.distanceMeters==='number') { out.push(`1 × ${fmtDist(st.distanceMeters)}`); i+=1; continue; }
        i += 1;
      }
      return out;
    } catch { return []; }
  })();
  const mobilityLines: string[] = (() => {
    if (!isMobility) return [];
    try {
      const raw = (workout as any)?.mobility_exercises;
      const arr: any[] = Array.isArray(raw) ? raw : (typeof raw==='string'? (JSON.parse(raw)||[]): []);
      if (!Array.isArray(arr) || arr.length===0) return [];
      return arr.map((m:any)=>{
        const name = String(m?.name||'').trim();
        const dur = String(m?.duration||'').trim();
        const desc = String(m?.description||'').trim();
        return [name, dur, desc].filter(Boolean).join(' — ');
      });
    } catch { return []; }
  })();
  const stacked = String(lines).split(/\s•\s/g).filter(Boolean);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-light tracking-normal text-base text-white flex items-center gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-1">
            {(typeof minutes === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded-lg bg-white/[0.05] backdrop-blur-sm border border-white/15 text-gray-300">{formatDuration(minutes)}</span>
            ) : null}
            {(typeof yards === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded-lg bg-blue-500/20 backdrop-blur-sm border border-blue-400/30 text-blue-300">{yards} yd</span>
            ) : null}
            {(workout as any)?.workload_planned ? (
              <span className="px-2 py-0.5 text-xs rounded-lg bg-white/[0.05] backdrop-blur-sm border border-white/15 text-gray-300">{(workout as any).workload_planned}</span>
            ) : null}
          </span>
        </div>
        {!hideLines && !isStrength && (
          <div className="text-sm text-gray-200 font-light tracking-normal mt-1">
            {stacked.length > 1 ? (
              <span className="whitespace-pre-line">{stacked.join('\n')}</span>
            ) : (
              <span>{lines}</span>
            )}
          </div>
        )}
        {!hideLines && !isStrength && enduranceLines.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {enduranceLines.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
        {!hideLines && isStrength && (
          <div className="text-sm text-gray-200 font-light tracking-normal mt-1">
            <span>{lines}</span>
          </div>
        )}
        {!hideLines && isStrength && strengthItems.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {strengthItems.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
        {!hideLines && isMobility && mobilityLines.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-200 font-light tracking-normal">
            {mobilityLines.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlannedWorkoutSummary;


