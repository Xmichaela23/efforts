import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';

type StructuredPlannedViewProps = {
  workout: any;
  showHeader?: boolean;
  onEdit?: () => void;
  onComplete?: () => void;
};

const StructuredPlannedView: React.FC<StructuredPlannedViewProps> = ({ workout, showHeader = true, onEdit, onComplete }) => {
  const hasStructured = !!((workout as any)?.workout_structure && typeof (workout as any).workout_structure === 'object');

  if (!hasStructured) {
    return (
      <div className="p-3">
        <div className="text-sm text-gray-700">Workout needs migration to structured format.</div>
      </div>
    );
  }

  // Structured-only renderer
  const ws: any = (workout as any).workout_structure;
  const { loadUserBaselines } = useAppContext?.() || ({} as any);
  const [ctxPN, setCtxPN] = useState<any | null>(null);
  const [savingPool, setSavingPool] = useState<boolean>(false);
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
  const toSec = (v?: string): number => { if (!v || typeof v !== 'string') return 0; const m1=v.match(/(\d+)\s*min/i); if (m1) return parseInt(m1[1],10)*60; const m2=v.match(/(\d+)\s*s/i); if (m2) return parseInt(m2[1],10); return 0; };
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

  // Prefer computed steps for swims so drills/rests render even without structured distance/duration
  let handledByComputed = false;
  let totalYdFromComputed: number | undefined = undefined;
  let totalYdFromStruct: number | undefined = undefined;
  try {
    const compSteps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
    if (parentDisc === 'swim' && compSteps.length) {
      const fmt = (sec:number)=>{ const x=Math.max(1,Math.round(Number(sec)||0)); const m=Math.floor(x/60); const s=x%60; return `${m}:${String(s).padStart(2,'0')}`; };
      let totalYd = 0;
      compSteps.forEach((st:any)=>{
        const label = String(st?.label||'').trim();
        const eff = String(st?.effortLabel||'').toLowerCase();
        const typ = String(st?.type||'').toLowerCase();
        const yd = (():number=>{
          if (typeof st?.distance_yd === 'number') return st.distance_yd;
          if (typeof st?.distanceMeters === 'number') return Math.round(st.distanceMeters/0.9144);
          return 0;
        })();
        if (yd>0) totalYd += yd;
        if (eff === 'rest' || /rest/i.test(label)) { const sec = Number(st?.duration||st?.duration_s||0); lines.push(sec>0?`Rest ${fmt(sec)}`:'Rest'); return; }
        if (typ === 'warmup' || /warm\s*-?\s*up/i.test(label)) { lines.push(`Warm-up 1 × ${yd} yd`); return; }
        if (typ === 'cooldown' || /cool\s*-?\s*down/i.test(label)) { lines.push(`Cool-down 1 × ${yd} yd`); return; }
        if (eff === 'drill' || typ === 'drill' || /drill/i.test(label)) {
          const name = label.replace(/^drill\s*[—-]?\s*/i,'').trim() || 'drill';
          lines.push(`1 × ${yd} yd — drill ${name}`); return;
        }
        if (/aerobic/i.test(label) || /swim_aerobic/i.test(typ)) { lines.push(`1 × ${yd} yd aerobic`); return; }
        if (yd>0) { lines.push(`1 × ${yd} yd`); return; }
      });
      totalYdFromComputed = totalYd;
      handledByComputed = lines.length > 0;
    }
  } catch {}
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
      const name=String(seg?.exercise||'').replace(/_/g,' '); const sets=Number(seg?.sets)||0; const reps=String(seg?.reps||'').toUpperCase(); const pct=Number(seg?.load?.percentage)||0; const baseKey=String(seg?.load?.baseline||'').replace(/^user\./i,''); const orm=pn[baseKey]; const load = (typeof orm==='number'&&pct>0)? `${Math.max(5, Math.round((orm*(pct/100))/5)*5)} lb` : (pct?`${pct}%`:undefined); for(let r=0;r<Math.max(1,sets);r+=1){ lines.push(`${name} 1 × ${reps}${load?` @ ${load}`:''}`); if (r<sets-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue;
    }
  }
  // Removed all token fallback paths: structured JSON is the single source of truth

  // Prefer computed totals; only fall back when no computed totals exist
  let durationMin: number | undefined = undefined;
  // Fallbacks: root total → computed total → sum(computed.steps) → sum(intervals) → structured estimate (last resort)
  try {
    if (durationMin == null) {
      const ts = Number((workout as any)?.total_duration_seconds);
      if (Number.isFinite(ts) && ts>0) durationMin = Math.max(1, Math.round(ts/60));
    }
  } catch {}
  try {
    if (durationMin == null) {
      const comp: any = (workout as any)?.computed || {};
      const ts = Number(comp?.total_duration_seconds);
      if (Number.isFinite(ts) && ts>0) durationMin = Math.max(1, Math.round(ts/60));
    }
  } catch {}
  try {
    if (durationMin == null) {
      const steps: any[] = Array.isArray((workout as any)?.computed?.steps) ? (workout as any).computed.steps : [];
      if (steps.length) {
        const s = steps.reduce((a:number, st:any)=>a + (Number(st?.duration_s)||0), 0);
        if (s>0) durationMin = Math.max(1, Math.round(s/60));
      }
    }
  } catch {}
  try {
    if (durationMin == null) {
      const intervals: any[] = Array.isArray((workout as any)?.intervals) ? (workout as any).intervals : [];
      if (intervals.length) {
        const sumIntervals = (arr: any[]): number => arr.reduce((acc: number, it: any) => {
          if (Array.isArray(it?.segments) && Number(it?.repeatCount)>0) {
            const segSum = it.segments.reduce((s:number, sg:any)=> s + (Number(sg?.duration)||0), 0);
            // Guard: last rest often omitted in UI/Garmin; assume authoring omitted it
            return acc + segSum * Number(it.repeatCount);
          }
          return acc + (Number(it?.duration)||0);
        }, 0);
        const totalSec = sumIntervals(intervals);
        if (Number.isFinite(totalSec) && totalSec>0) durationMin = Math.max(1, Math.round(totalSec/60));
      }
    }
  } catch {}
  // Final last-resort fallback: structured estimate only if no computed-based duration could be derived
  try {
    if (durationMin == null) {
      const est = typeof ws?.total_duration_estimate==='string' ? toSec(ws.total_duration_estimate) : 0;
      if (est>0) durationMin = Math.floor(est/60);
    }
  } catch {}

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
      // Ensure the week is materialized before export (no user steps required)
      try {
        const d = new Date(String((workout as any)?.date || ''));
        if (!isNaN(d.getTime())) {
          const jsDow = d.getDay(); // 0..6 (Sun..Sat)
          const daysFromMonday = (jsDow + 6) % 7; // Mon=0
          const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
          const y = monday.getFullYear();
          const m = String(monday.getMonth()+1).padStart(2,'0');
          const dd = String(monday.getDate()).padStart(2,'0');
          const weekStart = `${y}-${m}-${dd}`;
          await (supabase.functions.invoke as any)('sweep-week', { body: { week_start: weekStart } });
        }
      } catch {}

      // Re-fetch the planned row to get freshly built intervals
      let freshIntervals: any[] | undefined = undefined;
      try {
        const { data } = await supabase
          .from('planned_workouts')
          .select('id, intervals')
          .eq('id', (workout as any)?.id)
          .single();
        freshIntervals = Array.isArray((data as any)?.intervals) ? (data as any).intervals : undefined;
      } catch {}

      const intervals = freshIntervals || (workout as any)?.intervals;
      if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
        alert('Workout needs intervals before export. Open the Weekly view for this week once, then try again.');
        return;
      }

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
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={()=>setPool('yd', 22.86)} className={`rounded px-2 py-1 bg-gray-100 ${poolUnit==='yd' && Math.abs((poolLenM||0)-22.86)<0.02 ? 'bg-black text-white' : ''}`}>25 yd</button>
            <button type="button" onClick={()=>setPool('m', 25.0)} className={`rounded px-2 py-1 bg-gray-100 ${poolUnit==='m' && Math.abs((poolLenM||0)-25.0)<0.02 ? 'bg-black text-white' : ''}`}>25 m</button>
            <button type="button" onClick={()=>setPool('m', 50.0)} className={`rounded px-2 py-1 bg-gray-100 ${poolUnit==='m' && Math.abs((poolLenM||0)-50.0)<0.02 ? 'bg-black text-white' : ''}`}>50 m</button>
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


