import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { resolvePlannedDurationMinutes } from '@/utils/resolvePlannedDuration';

type StructuredPlannedViewProps = {
  workout: any;
  showHeader?: boolean;
  onEdit?: () => void;
  onComplete?: () => void;
};

const StructuredPlannedView: React.FC<StructuredPlannedViewProps> = ({ workout, showHeader = true, onEdit, onComplete }) => {
  const hasStructured = !!((workout as any)?.workout_structure && typeof (workout as any).workout_structure === 'object');
  const hasComputedV3 = Array.isArray((workout as any)?.computed?.steps) && (workout as any).computed.steps.length > 0;

  if (!hasStructured && !hasComputedV3) {
    return (
      <div className="p-3">
        <div className="text-sm text-gray-700">No structured or computed steps available yet.</div>
      </div>
    );
  }

  // Structured-only renderer
  const ws: any = (workout as any).workout_structure || {};
  const { loadUserBaselines } = useAppContext?.() || ({} as any);
  const [ctxPN, setCtxPN] = useState<any | null>(null);
  const [savingPool, setSavingPool] = useState<boolean>(false);
  const [refresh, setRefresh] = useState<number>(0);
  const [autoDefaulted, setAutoDefaulted] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      try {
        if (!((workout as any)?.baselines || (workout as any)?.performanceNumbers)) {
          const b = await loadUserBaselines?.();
          if (b && b.performanceNumbers) setCtxPN(b.performanceNumbers);
        }
      } catch {}
    })();
  }, [loadUserBaselines, workout]);
  const pn: any = (workout as any)?.baselines || (workout as any)?.performanceNumbers || ctxPN || {};
  const poolUnit: 'yd' | 'm' | null = ((workout as any)?.pool_unit ?? null) as any;
  const poolLenM: number | null = (typeof (workout as any)?.pool_length_m === 'number') ? (workout as any).pool_length_m : null;
  const lines: string[] = [];
  let totalSecsFromSteps = 0;
  // Strength: if server provided structured strength_exercises, render aggregated lines (avoid per-set repetition)
  try {
    const parentDiscEarly = String((workout as any)?.discipline || (workout as any)?.type || '').toLowerCase();
    if (parentDiscEarly === 'strength') {
      const exArr: any[] = Array.isArray((workout as any)?.strength_exercises) ? (workout as any).strength_exercises : [];
      if (exArr.length) {
        for (const e of exArr) {
          const name = String(e?.name || '').replace(/_/g, ' ').trim();
          const setsNum = Math.max(1, Number(e?.sets) || (Array.isArray(e?.sets) ? e.sets.length : 0) || 1);
          const repsVal: any = (() => {
            const r = (e as any)?.reps;
            if (typeof r === 'string') return r.toUpperCase();
            if (typeof r === 'number') return Math.max(1, Math.round(r));
            // if sets array provided, try average reps
            if (Array.isArray((e as any)?.sets) && (e as any).sets.length) {
              try { const avg = Math.round(((e as any).sets as any[]).reduce((a: number, s: any) => a + (Number(s?.reps) || 0), 0) / (e as any).sets.length); return Math.max(1, avg); } catch {}
            }
            return undefined;
          })();
          const repTxt = (typeof repsVal === 'string') ? repsVal : (Number.isFinite(repsVal) ? String(repsVal) : '');
          const wtNum = (typeof (e as any)?.weight === 'number' && isFinite((e as any).weight)) ? Math.round((e as any).weight) : undefined;
          const wtTxt = typeof wtNum === 'number' && wtNum > 0 ? ` @ ${wtNum} lb` : '';
          lines.push(`${name} ${setsNum}×${repTxt}${wtTxt}`.trim());
        }
      }
    }
  } catch {}
  // Prefer server-computed v3 steps when present
  try {
    const v3: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
    if (v3.length) {
      const fmtDur = (s:number)=>{ const x=Math.max(1,Math.round(Number(s)||0)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
      const fmtDist = (m:number)=>{
        const x = Math.max(1, Math.round(Number(m)||0));
        // Swim distances respect pool unit; others keep meters for clarity
        if (String((workout as any)?.type||'').toLowerCase()==='swim' && (poolUnit==='yd')) {
          const yd = Math.round(x / 0.9144);
          return `${yd} yd`;
        }
        return `${x} m`;
      };
      const niceKind = (k:string)=>{
        const t = String(k||'').toLowerCase();
        if (t==='warmup') return 'Warmup';
        if (t==='cooldown') return 'Cooldown';
        if (t==='recovery' || t==='rest' || t==='interval_rest') return 'Rest';
        if (t==='drill') return 'Drill';
        return '';
      };
      const isSwim = String((workout as any)?.type||'').toLowerCase()==='swim'
      // Estimate total duration using baselines for distance steps (swim only)
      let estTotal = 0;
      const secPer100FromPN = (() => {
        const num = (pn && typeof (pn as any)?.swim_pace_per_100_sec === 'number') ? (pn as any).swim_pace_per_100_sec : null;
        if (typeof num === 'number' && isFinite(num) && num > 0) return num as number;
        const txt = String((pn as any)?.swimPace100 || '').trim();
        if (/^\d+:\d{2}$/.test(txt)) { const [mm, ss] = txt.split(':').map((t:string)=>parseInt(t,10)); return mm*60 + ss; }
        return null;
      })();
      v3.forEach((st:any)=>{
        const secs = typeof st?.seconds==='number' ? st.seconds : undefined;
        if (typeof secs==='number' && secs>0) totalSecsFromSteps += Math.max(1, Math.round(secs));
        const distM = typeof st?.distanceMeters==='number' ? st.distanceMeters : undefined;
        if (isSwim && typeof distM==='number' && distM>0 && typeof secPer100FromPN==='number') {
          const sec = (poolUnit==='yd') ? ((distM/0.9144)/100)*secPer100FromPN : ((distM/100)*secPer100FromPN);
          estTotal += sec;
        }
        const pTxt = typeof st?.paceTarget==='string' ? st.paceTarget : undefined;
        const powRange = (st?.powerRange && typeof st.powerRange.lower==='number' && typeof st.powerRange.upper==='number') ? `${Math.round(st.powerRange.lower)}–${Math.round(st.powerRange.upper)} W` : undefined;
        const pow = typeof st?.powerTarget==='string' ? st.powerTarget : undefined;
        const kind = niceKind(st?.kind);
        let equip = '';
        if (typeof st?.equipment==='string') {
          const e = String(st.equipment).trim();
          if (e && e.toLowerCase()!=='none') equip = ` with ${e}`;
        }

        // Strength step formatting
        if (st?.strength && typeof st.strength==='object') {
          const nm = String(st.strength.name||'Strength');
          const sets = Number(st.strength.sets||0);
          const reps = Number(st.strength.reps||0);
          const wt = Number(st.strength.weight||0);
          const unit = (String((workout as any)?.units||'').toLowerCase()==='metric') ? ' kg' : ' lb';
          const parts: string[] = [nm];
          if (sets>0 && reps>0) parts.push(`${sets}×${reps}`);
          if (wt>0) parts.push(`@ ${Math.round(wt)}${unit}`);
          lines.push(parts.join(' '));
          return;
        }

        // Swim: prefer explicit count × distance with label/equipment
        if (isSwim) {
          const distTxt = (typeof distM==='number' && distM>0) ? fmtDist(distM) : undefined;
          const baseLabel = (typeof st?.label==='string' && st.label.trim()) ? st.label.trim().replace(/^drill\s*/i,'Drill ') : (kind || '').trim();
          const seg = [distTxt ? `1 × ${distTxt}` : (typeof secs==='number' && secs>0 ? `1 × ${fmtDur(secs)}` : undefined), baseLabel || undefined].filter(Boolean).join(' — ')
          lines.push([seg, equip].filter(Boolean).join(''))
          return;
        }

        const pieces: string[] = [];
        if (kind) pieces.push(kind);
        if (typeof distM==='number' && distM>0) pieces.push(fmtDist(distM));
        else if (typeof secs==='number' && secs>0) pieces.push(fmtDur(secs));
        if (pTxt) pieces.push(`@ ${pTxt}`);
        else if (powRange) pieces.push(`@ ${powRange}`);
        else if (pow) pieces.push(`@ ${pow}`);
        if (!pTxt && !powRange && !pow && typeof st?.label==='string' && st.label.trim()) {
          pieces.push(st.label);
        }
        const ln = pieces.join(' ') + equip;
        lines.push(ln || 'step');
      });
      if (isSwim) {
        // prefer baseline-estimated duration when available, else timed steps sum
        if (estTotal > 0) totalSecsFromSteps = Math.round(estTotal);
      }
      // Mark that we handled with computed to avoid legacy fallbacks
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const handledByComputedFlag = true;
    }
  } catch {}

  // No client-side materialization; rely on server activation
  const toSec = (v?: string): number => { if (!v || typeof v !== 'string') return 0; const m1=v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60; const m2=v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10); return 0; };
  const parseEstimateToSeconds = (val: any): number => {
    try {
      if (val == null) return 0;
      if (typeof val === 'number' && isFinite(val)) {
        // Treat numeric as minutes
        return Math.max(0, Math.round(val)) * 60;
      }
      const txt = String(val).trim();
      if (!txt) return 0;
      // hh:mm:ss or mm:ss
      let m = txt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m) {
        const h = m[3] ? parseInt(m[1],10) : 0;
        const mm = m[3] ? parseInt(m[2],10) : parseInt(m[1],10);
        const ss = m[3] ? parseInt(m[3],10) : parseInt(m[2],10);
        return h*3600 + mm*60 + ss;
      }
      // 0h 37 / 1h 05 / 1h05
      m = txt.match(/^(\d+)\s*h\s*(\d{1,2})$/i);
      if (m) {
        const h = parseInt(m[1],10); const mm = parseInt(m[2],10);
        return h*3600 + mm*60;
      }
      // 37 min, 37m
      m = txt.match(/^(\d+)\s*(min|m)$/i);
      if (m) return parseInt(m[1],10)*60;
      // Fallback to existing min/sec tokens within string
      const minToken = txt.match(/(\d+)\s*min/i); if (minToken) return parseInt(minToken[1],10)*60;
      const secToken = txt.match(/(\d+)\s*s/i); if (secToken) return parseInt(secToken[1],10);
    } catch {}
    return 0;
  };
  const mmss = (s:number)=>{ const x=Math.max(1,Math.round(s)); const m=Math.floor(x/60); const ss=x%60; return `${m}:${String(ss).padStart(2,'0')}`; };
  const easy = String(pn?.easyPace || '').trim() || undefined;
  const hints: any = (workout as any)?.export_hints || {};
  const tolQual: number = typeof hints?.pace_tolerance_quality === 'number' ? hints.pace_tolerance_quality : 0.04;
  const tolEasy: number = typeof hints?.pace_tolerance_easy === 'number' ? hints.pace_tolerance_easy : 0.06;
  const parsePace = (pTxt?: string): { sec: number|null, unit?: 'mi'|'km' } => {
    if (!pTxt) return { sec: null } as any;
    const m = String(pTxt).trim().match(/(\d+):(\d{2})\s*\/(mi|km)/i);
    if (!m) return { sec: null } as any;
    return { sec: parseInt(m[1],10)*60 + parseInt(m[2],10), unit: m[3].toLowerCase() as any };
  };
  const addModToPace = (baseTxt?: string, mod?: string): string | undefined => {
    if (!baseTxt) return undefined;
    if (!mod) return baseTxt;
    const p = parsePace(baseTxt);
    if (!p.sec || !p.unit) return baseTxt;
    const m1 = String(mod).match(/\+(\d+):(\d{2})/);
    const m2 = String(mod).match(/\+(\d+)s/i);
    const add = m1 ? (parseInt(m1[1],10)*60 + parseInt(m1[2],10)) : (m2 ? parseInt(m2[1],10) : 0);
    if (!add) return baseTxt;
    const newSec = p.sec + add;
    return `${Math.floor(newSec/60)}:${String(newSec%60).padStart(2,'0')}/${p.unit}`;
  };
  const resolvePaceRef = (ref: any): string | undefined => {
    if (!ref) return undefined;
    if (typeof ref === 'string') {
      if (/^user\./i.test(ref)) { const key = ref.replace(/^user\./i,''); return pn?.[key]; }
      return ref;
    }
    if (typeof ref === 'object' && typeof ref.baseline === 'string') {
      const key = String(ref.baseline).replace(/^user\./i,'');
      const base = pn?.[key];
      return addModToPace(base, String(ref.modifier||'').trim() || undefined);
    }
    return undefined;
  };
  const buildPaceWithRange = (pTxt?: string, tol: number = tolQual): string => {
    if (!pTxt) return '';
    const m = String(pTxt).match(/(\d+):(\d{2})\s*\/\s*(mi|km)/i);
    if (!m) return ` @ ${pTxt}`;
    const sec = parseInt(m[1],10)*60 + parseInt(m[2],10);
    const unit = m[3].toLowerCase();
    const loS = Math.round(sec * (1 - tol));
    const hiS = Math.round(sec * (1 + tol));
    const lo = `${Math.floor(loS/60)}:${String(loS%60).padStart(2,'0')}/${unit}`;
    const hi = `${Math.floor(hiS/60)}:${String(hiS%60).padStart(2,'0')}/${unit}`;
    return ` @ ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}/${unit} (${lo}–${hi})`;
  };
  const type = String(ws?.type||'').toLowerCase();
  const struct: any[] = Array.isArray(ws?.structure) ? ws.structure : [];
  const parentDisc = String((workout as any)?.discipline || (workout as any)?.type || '').toLowerCase();
  const isStrengthContext = (type === 'strength_session') || (parentDisc === 'strength');

  // Legacy swim fallback removed: rely on computed.v3 exclusively
  let handledByComputed = lines.length > 0;
  let totalYdFromComputed: number | undefined = undefined;
  let totalYdFromStruct: number | undefined = undefined;
  // Brick session: render stacked segments
  if (!handledByComputed && type==='brick_session') {
    let tIdx = 0;
    for (const seg of struct) {
      const k = String(seg?.type||'').toLowerCase();
      if (k==='bike_segment') {
        const s = toSec(String(seg?.duration||''));
        lines.push(`Bike 1 × ${Math.floor(s/60)} min${seg?.target_power?.range?` @ ${seg.target_power.range}`:''}`);
        continue;
      }
      if (k==='run_segment') {
        const s = toSec(String(seg?.duration||''));
        const pTxt = typeof seg?.target_pace==='string' && /^user\./i.test(seg.target_pace)
          ? (pn[seg.target_pace.replace(/^user\./i,'')] || seg.target_pace)
          : seg?.target_pace;
        lines.push(`Run 1 × ${Math.floor(s/60)} min${pTxt?buildPaceWithRange(String(pTxt), tolQual):''}`);
        continue;
      }
      if (k==='transition') {
        tIdx += 1; const s = toSec(String(seg?.duration||'')); lines.push(`T${tIdx} ${Math.floor(s/60)} min`); continue;
      }
      if (k==='swim_segment') { const s = toSec(String(seg?.duration||'')); lines.push(`Swim 1 × ${Math.floor(s/60)} min`); continue; }
      if (k==='strength_segment') { const s = toSec(String(seg?.duration||'')); lines.push(`Strength 1 × ${Math.floor(s/60)} min`); continue; }
    }
  }
  for (const seg of (handledByComputed?[]:struct)) {
    const k = String(seg?.type||'').toLowerCase();
    if (k==='warmup' || k==='cooldown') {
      const dist = String(seg?.distance||'');
      if (dist) {
        const yd = /yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144);
        if (parentDisc==='swim' && Number.isFinite(yd) && yd>0) totalYdFromStruct = (totalYdFromStruct||0) + yd;
        const addPace = (!isStrengthContext && parentDisc==='run' && easy) ? buildPaceWithRange(easy, tolEasy) : '';
        const ftpNum = typeof (pn as any)?.ftp === 'number' ? (pn as any).ftp : undefined;
        const addPower = (parentDisc==='ride' && typeof ftpNum==='number' && isFinite(ftpNum)) ? ` @ ${Math.round(ftpNum*0.60)}–${Math.round(ftpNum*0.65)} W` : '';
        lines.push(`${k==='warmup'?'Warm‑up':'Cool‑down'} 1 × ${yd} yd${addPace || addPower ? (addPace||addPower) : ''}`);
      }
      const s = toSec(String(seg?.duration||''));
      if (s>0) {
        const addPace = (!isStrengthContext && parentDisc==='run' && easy) ? buildPaceWithRange(easy, tolEasy) : '';
        const ftpNum = typeof (pn as any)?.ftp === 'number' ? (pn as any).ftp : undefined;
        const addPower = (parentDisc==='ride' && typeof ftpNum==='number' && isFinite(ftpNum)) ? ` @ ${Math.round(ftpNum*0.60)}–${Math.round(ftpNum*0.65)} W` : '';
        lines.push(`${k==='warmup'?'Warm‑up':'Cool‑down'} ${Math.floor(s/60)} min${addPace || addPower ? (addPace||addPower) : ''}`);
      }
      continue;
    }
    if ((type==='interval_session') || (k==='main_set' && String(seg?.set_type||'').toLowerCase()==='intervals')) {
      const reps = Number(seg?.repetitions)||0; const work = seg?.work_segment||{}; const rec = seg?.recovery_segment||{};
      const distTxt = String(work?.distance||''); const restS = toSec(String(rec?.duration||''));
      let paceTxt = work?.target_pace;
      if (typeof paceTxt==='string' && /^user\./i.test(paceTxt)) { const key = paceTxt.replace(/^user\./i,''); paceTxt = pn[key] || paceTxt; }
      const label = /mi\b/i.test(distTxt) ? `${parseFloat(distTxt)} mi` : /m\b/i.test(distTxt) ? `${distTxt}` : (work?.duration? `${Math.floor(toSec(String(work.duration))/60)} min` : 'interval');
      for (let r=0;r<Math.max(1,reps);r+=1){
        lines.push(`1 × ${label}${paceTxt?buildPaceWithRange(String(paceTxt), tolQual):''}`);
        if (r<reps-1 && restS>0) lines.push(`Rest ${mmss(restS)}${easy?buildPaceWithRange(easy, tolEasy):''}`);
      }
      continue;
    }
    if (type==='tempo_session' && k==='main_set') {
      const durS = toSec(String(seg?.work_segment?.duration||''));
      const pTxt = resolvePaceRef(seg?.work_segment?.target_pace);
      if (durS>0) lines.push(`1 × ${Math.floor(durS/60)} min${pTxt?buildPaceWithRange(String(pTxt), tolQual):''}`);
      continue;
    }
    if (type==='bike_intervals' && k==='main_set') {
      const reps = Number(seg?.repetitions)||0; const wsS = toSec(String(seg?.work_segment?.duration||'')); const rsS = toSec(String(seg?.recovery_segment?.duration||''));
      const rangeTxt = String(seg?.work_segment?.target_power?.range||'');
      const powerLabel = (()=>{
        const m = rangeTxt.match(/(\d{1,3})\s*[-–]\s*(\d{1,3})%/);
        if (m && typeof (pn as any)?.ftp === 'number' && isFinite((pn as any).ftp)) {
          const lo = Math.round((pn as any).ftp * (parseInt(m[1],10)/100));
          const hi = Math.round((pn as any).ftp * (parseInt(m[2],10)/100));
          return ` @ ${lo}–${hi} W`;
        }
        return rangeTxt ? ` @ ${rangeTxt}` : '';
      })();
      for (let r=0;r<Math.max(1,reps);r+=1){
        lines.push(`1 × ${Math.floor(wsS/60)} min${powerLabel}`);
        if (r<reps-1 && rsS>0) {
          const ftpNum = typeof (pn as any)?.ftp === 'number' ? (pn as any).ftp : undefined;
          const restLabel = (typeof ftpNum==='number' && isFinite(ftpNum)) ? ` @ ${Math.round(ftpNum*0.60)}–${Math.round(ftpNum*0.65)} W` : '';
          lines.push(`Rest ${Math.floor(rsS/60)} min${restLabel}`);
        }
      }
      continue;
    }
    if (type==='endurance_session' && (k==='main_effort' || k==='main')) {
      const sDur=toSec(String(seg?.duration||''));
      const pTxt = parentDisc==='run' ? (easy || resolvePaceRef('user.easyPace')) : undefined;
      if (sDur>0) lines.push(`1 × ${Math.floor(sDur/60)} min${pTxt?buildPaceWithRange(String(pTxt), tolEasy):''}`);
      continue;
    }
    if (type==='swim_session') {
      if (k==='drill_set') { const reps=Number(seg?.repetitions)||0; const dist=String(seg?.distance||''); const yd=/yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144); for(let r=0;r<Math.max(1,reps);r+=1){ lines.push(`1 × ${yd} yd — drill ${String(seg?.drill_type||'').replace(/_/g,' ')}`); if (Number.isFinite(yd) && yd>0) totalYdFromStruct = (totalYdFromStruct||0) + yd; if (r<reps-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue; }
      if (k==='main_set' && String(seg?.set_type||'').toLowerCase().includes('aerobic')) { const reps=Number(seg?.repetitions)||0; const dist=String(seg?.distance||''); const yd=/yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144); for(let r=0;r<Math.max(1,reps);r+=1){ lines.push(`1 × ${yd} yd aerobic`); if (Number.isFinite(yd) && yd>0) totalYdFromStruct = (totalYdFromStruct||0) + yd; if (r<reps-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue; }
    }
    if (type==='strength_session' && (k==='main_lift' || k==='accessory')) {
      // Aggregate into a single line per exercise to avoid repeated lines per set
      const name = String(seg?.exercise||'').replace(/_/g,' ').trim();
      const sets = Math.max(1, Number(seg?.sets)||0);
      const repsTxt = String(seg?.reps||'').toUpperCase();
      const pct = Number(seg?.load?.percentage)||0;
      const baseKey = String(seg?.load?.baseline||'').replace(/^user\./i,'');
      const orm = pn[baseKey];
      const load = (typeof orm==='number'&&pct>0)? `${Math.max(5, Math.round((orm*(pct/100))/5)*5)} lb` : (pct?`${pct}%`:undefined);
      lines.push(`${name} ${sets} × ${repsTxt}${load?` @ ${load}`:''}`);
      continue;
    }
  }
  // Removed all token fallback paths: structured JSON is the single source of truth

  // Duration: single-source resolver (canonical computed totals)
  const durationMin: number | null = resolvePlannedDurationMinutes(workout);

  // Pick a per-session summary for display in Planned view
  const sessionSummary: string | undefined = (() => {
    const w: any = workout as any;
    const candidates: Array<any> = [
      w?.summary,
      w?.session_summary,
      ws?.summary,
      w?.description,
      ws?.description
    ];
    const txt = candidates.find((v) => typeof v === 'string' && String(v).trim().length>0);
    return txt ? String(txt).trim() : undefined;
  })();

  const handleGarminExport = async () => {
    try {
      // Call the Garmin export function
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to export to Garmin');
        return;
      }

      const { data: result, error } = await supabase.functions.invoke('send-workout-to-garmin', {
        body: {
          workoutId: workout.id,
          userId: user.id
        }
      });

      if (error) {
        let detailsTxt = '';
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            detailsTxt = `\nDetails: ${txt}`;
          }
        } catch {}
        alert(`Failed to send to Garmin: ${error.message}${detailsTxt}`);
      } else if (result?.success) {
        const dbg = result?.debug?.mapped;
        const dbgTxt = dbg ? `\nPool sent: ${dbg.poolLength ?? 'null'} ${dbg.poolLengthUnit ?? ''}` : '';
        alert(`Workout sent to Garmin successfully!${dbgTxt}`);
      } else {
        alert(`Failed to send to Garmin: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Garmin export error:', error);
      alert('Failed to export to Garmin');
    }
  };

  // Persist default pool setting based on user preference when missing
  useEffect(() => {
    (async () => {
      try {
        const isSwim = String((workout as any)?.type || '').toLowerCase() === 'swim';
        if (!isSwim) return;
        const missing = (poolUnit == null && poolLenM == null);
        if (!missing) return;
        const baselines = await loadUserBaselines?.();
        const units = String(baselines?.units || 'imperial').toLowerCase();
        const def = units === 'metric' ? { pool_unit: 'm', pool_length_m: 25.0 } : { pool_unit: 'yd', pool_length_m: 22.86 };
        setSavingPool(true);
        await supabase
          .from('planned_workouts')
          .update(def as any)
          .eq('id', (workout as any)?.id);
        try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
        setAutoDefaulted(true);
      } catch {}
      finally { setSavingPool(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(workout as any)?.id]);

  const setPool = async (unit: 'yd' | 'm' | null, lengthM: number | null) => {
    try {
      setSavingPool(true);
      await supabase
        .from('planned_workouts')
        .update({ pool_unit: unit, pool_length_m: lengthM } as any)
        .eq('id', (workout as any)?.id);
      try { window.dispatchEvent(new CustomEvent('planned:invalidate')); } catch {}
    } catch (e) {
      console.error('Failed to set pool:', e);
      alert('Failed to update pool setting');
    } finally {
      setSavingPool(false);
    }
  };

  const handleDownloadWorkout = () => {
    // Create a simple workout file for download
    const workoutData = {
      name: ws?.title || 'Workout',
      duration: ws?.total_duration_estimate,
      steps: lines,
      type: (workout as any)?.type || 'run'
    };

    const blob = new Blob([JSON.stringify(workoutData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ws?.title || 'workout').replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{String(ws?.title || (workout as any)?.title || '') || 'Planned'}</div>
          <div className="text-sm text-gray-500 flex items-center gap-3">
            {parentDisc==='swim' && ((typeof totalYdFromComputed==='number' && totalYdFromComputed>0) || (typeof totalYdFromStruct==='number' && totalYdFromStruct>0)) ? <span>{`${(totalYdFromComputed||0)+(totalYdFromStruct||0)} yd`}</span> : null}
            {typeof durationMin==='number'?<span>{`${durationMin} min`}</span>:null}
          </div>
        </div>
      )}
      {String(parentDisc).toLowerCase()==='swim' && (
        <div className="mt-2">
          <div className="text-xs text-gray-500 mb-1">Pool</div>
          <div className="flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              onClick={()=>setPool('yd', 22.86)}
              className={`${poolUnit==='yd' && Math.abs((poolLenM||0)-22.86)<0.02 ? 'underline underline-offset-4 decoration-2 text-black' : 'text-gray-600 hover:text-black'}`}
            >25 yd</button>
            <button
              type="button"
              onClick={()=>setPool('m', 25.0)}
              className={`${poolUnit==='m' && Math.abs((poolLenM||0)-25.0)<0.02 ? 'underline underline-offset-4 decoration-2 text-black' : 'text-gray-600 hover:text-black'}`}
            >25 m</button>
            <button
              type="button"
              onClick={()=>setPool('m', 50.0)}
              className={`${poolUnit==='m' && Math.abs((poolLenM||0)-50.0)<0.02 ? 'underline underline-offset-4 decoration-2 text-black' : 'text-gray-600 hover:text-black'}`}
            >50 m</button>
            {savingPool && <span className="text-gray-400">Saving…</span>}
          </div>
          {!savingPool && autoDefaulted && (
            <div className="text-[11px] text-gray-400 mt-1">Defaulted from your units; change if venue differs.</div>
          )}
        </div>
      )}
      {sessionSummary && (
        <div className="text-sm text-gray-600 leading-snug">
          {sessionSummary}
        </div>
      )}
      <div className="p-1">
        {totalSecsFromSteps>0 && (
          <div className="text-xs text-gray-600 mb-1">Total duration: {(() => { const m=Math.floor(totalSecsFromSteps/60); const s=totalSecsFromSteps%60; return `${m}:${String(s).padStart(2,'0')}`; })()}</div>
        )}
        <ul className="list-none space-y-1">
          {(lines.length?lines:["No structured steps found."]).map((ln, i)=>{
            const parentDisc = String((workout as any)?.discipline || (workout as any)?.type || '').toLowerCase();
            const isStrengthContext = (String((workout as any)?.workout_structure?.type||'').toLowerCase()==='strength_session') || (parentDisc === 'strength');
            const isPlannedRow = String((workout as any)?.workout_status || '').toLowerCase() === 'planned';
            return (
              <li key={i} className="text-sm text-gray-800 flex items-start justify-between">
                <span>{ln}</span>
                {i===0 && isPlannedRow && (
                  <div className="ml-3 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={handleGarminExport}
                      className="text-gray-600 hover:underline"
                    >Send to Garmin</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      
      {/* Export buttons removed per design: use inline text links above */}
    </div>
  );
};

export default StructuredPlannedView;


