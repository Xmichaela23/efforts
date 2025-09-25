import React from 'react';
import { normalizePlannedSession, Baselines as NormalizerBaselines, ExportHints } from '@/services/plans/normalizer';
import { normalizeStructuredSession } from '@/services/plans/normalizer';
import { resolvePlannedDurationMinutes } from '@/utils/resolvePlannedDuration';

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
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}`;
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
  return nm || 'Session';
}

function computeMinutes(workout: any, baselines?: Baselines, exportHints?: ExportHints): number | null {
  // Prefer recompute from computed.steps (client authoritative), then fall back
  try {
    const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
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
          const spm = secPerMeterFromPace(typeof st?.paceTarget === 'string' ? st.paceTarget : undefined);
          if (spm != null) return acc + meters * spm;
        }
        return acc;
      }, 0);
      if (sumSec > 0) return Math.max(1, Math.round(sumSec / 60));
    }
  } catch {}
  try {
    const ts = Number((workout as any)?.computed?.total_duration_seconds) || Number((workout as any)?.total_duration_seconds);
    if (Number.isFinite(ts) && ts > 0) return Math.max(1, Math.round(ts / 60));
  } catch {}
  try {
    // Final fallback: derive from tokens/structure when present
    const minutes = resolvePlannedDurationMinutes(workout as any, baselines as any, exportHints);
    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  } catch {}
  return null;
}

function computeSwimYards(workout: any): number | null {
  const type = String((workout as any)?.type || '').toLowerCase();
  if (type !== 'swim') return null;
  try {
    const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
    if (steps.length) {
      const meters = steps.reduce((a: number, st: any) => a + (Number(st?.distanceMeters) || 0), 0);
      const yd = Math.round(meters / 0.9144);
      if (yd > 0) return yd;
    }
  } catch {}
  try {
    const toks: string[] = Array.isArray((workout as any)?.steps_preset) ? (workout as any).steps_preset : [];
    if (!toks.length) return null;
    const toYd = (n: number, unit: string) => unit.toLowerCase() === 'm' ? Math.round(n / 0.9144) : n;
    let sum = 0;
    toks.forEach((t) => {
      const s = String(t).toLowerCase();
      let m = s.match(/swim_(?:warmup|cooldown)_(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10), m[2]); return; }
      m = s.match(/swim_drill_[a-z0-9_]+_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
      m = s.match(/swim_drills_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
      m = s.match(/swim_(pull|kick)_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[2], 10) * parseInt(m[3], 10), m[4]); return; }
      m = s.match(/swim_aerobic_(\d+)x(\d+)(yd|m)/i); if (m) { sum += toYd(parseInt(m[1], 10) * parseInt(m[2], 10), m[3]); return; }
    });
    return sum > 0 ? sum : null;
  } catch { return null; }
}

function buildWeeklySubtitle(workout: any, baselines?: Baselines): string | undefined {
  try {
    const pn = (baselines as any)?.performanceNumbers || {};
    try {
      const disc = String((workout as any)?.type || (workout as any)?.discipline || '').toLowerCase();
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
  const strengthItems: string[] = (() => {
    if (!isStrength) return [];
    try {
      const ex: any[] = Array.isArray((workout as any)?.strength_exercises) ? (workout as any).strength_exercises : [];
      if (!ex.length) return [];
      return ex.map((e:any) => {
        const sets = Math.max(1, Number(e?.sets)||1);
        const repsVal:any = (():any=>{ const r=e?.reps||e?.rep; if (typeof r==='string') return r.toUpperCase(); if (typeof r==='number') return Math.max(1, Math.round(r)); return undefined; })();
        const repTxt = (typeof repsVal==='string') ? repsVal : `${Number(repsVal||0)}`;
        const wt = (typeof e?.weight==='number' && isFinite(e.weight)) ? `${Math.round(e.weight)} lb` : undefined;
        const name = String(e?.name||'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
        return `${name} ${sets}×${repTxt}${wt?` — ${wt}`:''}`;
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
      const paceStrWithRange = (paceTarget?: string, kind?: string) => {
        try {
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
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'warmup');
          out.push(`WU ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
          i += 1; continue;
        }
        if (kind==='cooldown' && typeof st?.seconds==='number') {
          const pace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined,'cooldown');
          out.push(`CD ${fmtTime(st.seconds)}${pace?` (${pace})`:''}`);
          i += 1; continue;
        }
        if (isWork(st)) {
          const workLabel = (()=>{
            if (typeof st?.distanceMeters==='number' && st.distanceMeters>0) return `${Math.round(st.distanceMeters)} m`;
            if (typeof st?.seconds==='number' && st.seconds>0) return fmtTime(st.seconds);
            return 'interval';
          })();
          const workPace = paceStrWithRange(typeof st?.paceTarget==='string'?st.paceTarget:undefined, st?.kind);
          const workPower = powerStr(st);
          const next = steps[i+1];
          const hasRec = next && isRec(next);
          const restLabel = hasRec ? (()=>{
            if (typeof next?.seconds==='number' && next.seconds>0) return fmtTime(next.seconds);
            if (typeof next?.distanceMeters==='number' && next.distanceMeters>0) return `${Math.round(next.distanceMeters)} m`;
            return 'rest';
          })() : undefined;
          const restPace = hasRec ? paceStrWithRange(typeof next?.paceTarget==='string'?next.paceTarget:undefined, 'recovery') : undefined;
          const restPower = hasRec ? powerStr(next) : undefined;
          let count = 0; let j = i;
          while (j < steps.length) {
            const a = steps[j]; const b = steps[j+1];
            if (!isWork(a)) break;
            const aLabel = (typeof a?.distanceMeters==='number' && a.distanceMeters>0) ? `${Math.round(a.distanceMeters)} m` : (typeof a?.seconds==='number' ? fmtTime(a.seconds) : 'interval');
            const aPace = paceStrWithRange(typeof a?.paceTarget==='string'?a.paceTarget:undefined, a?.kind);
            const aPow = powerStr(a);
            const bLabel = (b && isRec(b)) ? ((typeof b?.seconds==='number' && b.seconds>0) ? fmtTime(b.seconds) : (typeof b?.distanceMeters==='number' && b.distanceMeters>0 ? `${Math.round(b.distanceMeters)} m` : 'rest')) : undefined;
            const bPace = (b && isRec(b)) ? paceStrWithRange(typeof b?.paceTarget==='string'?b.paceTarget:undefined, 'recovery') : undefined;
            const bPow = (b && isRec(b)) ? powerStr(b) : undefined;
            const sameWork = (aLabel===workLabel) && (aPace===workPace) && (aPow===workPower);
            const sameRest = (!hasRec && !b) || (!!hasRec && !!b && isRec(b) && bLabel===restLabel && bPace===restPace && bPow===restPower);
            if (!sameWork || !sameRest) break;
            count += 1; j += hasRec ? 2 : 1;
          }
          const workAnno = workPace ? ` (${workPace})` : (workPower?` (${workPower})`:'' );
          const restAnno = hasRec ? (restPace ? ` ${restLabel} (${restPace})` : (restPower?` ${restLabel} (${restPower})` : ` ${restLabel}`)) : '';
          out.push(`${count} × ${workLabel}${workAnno}${restAnno}`);
          if (j <= i) { i += 1; continue; }
          i = j; continue;
        }
        if (typeof st?.seconds==='number') { out.push(`1 × ${fmtTime(st.seconds)}`); i+=1; continue; }
        if (typeof st?.distanceMeters==='number') { out.push(`1 × ${Math.round(st.distanceMeters)} m`); i+=1; continue; }
        i += 1;
      }
      return out;
    } catch { return []; }
  })();
  const stacked = String(lines).split(/\s•\s/g).filter(Boolean);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-medium text-base text-gray-900 flex items-center gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-1">
            {(typeof minutes === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded bg-gray-100 border border-gray-200 text-gray-800">{formatDuration(minutes)}</span>
            ) : null}
            {(typeof yards === 'number') ? (
              <span className="px-2 py-0.5 text-xs rounded bg-blue-50 border border-blue-200 text-blue-800">{yards} yd</span>
            ) : null}
          </span>
        </div>
        {!hideLines && !isStrength && (
          <div className="text-sm text-gray-600 mt-1">
            {stacked.length > 1 ? (
              <span className="whitespace-pre-line">{stacked.join('\n')}</span>
            ) : (
              <span>{lines}</span>
            )}
          </div>
        )}
        {!hideLines && isStrength && (
          <div className="text-sm text-gray-600 mt-1">
            <span>{lines}</span>
          </div>
        )}
        {!hideLines && isStrength && strengthItems.length>0 && (
          <ul className="list-disc pl-5 mt-1 text-sm text-gray-700">
            {strengthItems.map((ln, idx)=> (<li key={idx}>{ln}</li>))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlannedWorkoutSummary;


