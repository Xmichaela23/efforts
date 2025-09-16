import React, { useEffect, useState } from 'react';
import { useAppContext } from '@/contexts/AppContext';
import React from 'react';

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

  // Minimal in-place renderer using structured JSON only
  const ws: any = (workout as any).workout_structure;
  const { loadUserBaselines } = useAppContext?.() || ({} as any);
  const [ctxPN, setCtxPN] = useState<any | null>(null);
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
  // Brick session: render stacked segments
  if (type==='brick_session') {
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
  for (const seg of struct) {
    const k = String(seg?.type||'').toLowerCase();
    if (k==='warmup' || k==='cooldown') {
      const dist = String(seg?.distance||'');
      if (dist) {
        const yd = /yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144);
        lines.push(`${k==='warmup'?'Warm‑up':'Cool‑down'} 1 × ${yd} yd${easy?buildPaceWithRange(easy, tolEasy):''}`);
      }
      const s = toSec(String(seg?.duration||''));
      if (s>0) lines.push(`${k==='warmup'?'Warm‑up':'Cool‑down'} ${Math.floor(s/60)} min${easy?buildPaceWithRange(easy, tolEasy):''}`);
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
      for (let r=0;r<Math.max(1,reps);r+=1){ lines.push(`1 × ${Math.floor(wsS/60)} min${seg?.work_segment?.target_power?.range?` @ ${seg.work_segment.target_power.range}`:''}`); if (r<reps-1 && rsS>0) lines.push(`Rest ${Math.floor(rsS/60)} min`); }
      continue;
    }
    if (type==='endurance_session' && (k==='main_effort' || k==='main')) {
      const sDur=toSec(String(seg?.duration||''));
      const pTxt = parentDisc==='run' ? (easy || resolvePaceRef('user.easyPace')) : undefined;
      if (sDur>0) lines.push(`1 × ${Math.floor(sDur/60)} min${pTxt?buildPaceWithRange(String(pTxt), tolEasy):''}`);
      continue;
    }
    if (type==='swim_session') {
      if (k==='drill_set') { const reps=Number(seg?.repetitions)||0; const dist=String(seg?.distance||''); const yd=/yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144); for(let r=0;r<Math.max(1,reps);r+=1){ lines.push(`1 × ${yd} yd — drill ${String(seg?.drill_type||'').replace(/_/g,' ')}`); if (r<reps-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue; }
      if (k==='main_set' && String(seg?.set_type||'').toLowerCase().includes('aerobic')) { const reps=Number(seg?.repetitions)||0; const dist=String(seg?.distance||''); const yd=/yd/i.test(dist)?parseInt(dist,10):Math.round(parseInt(dist,10)/0.9144); for(let r=0;r<Math.max(1,reps);r+=1){ lines.push(`1 × ${yd} yd aerobic`); if (r<reps-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue; }
    }
    if (type==='strength_session' && (k==='main_lift' || k==='accessory')) {
      const name=String(seg?.exercise||'').replace(/_/g,' '); const sets=Number(seg?.sets)||0; const reps=String(seg?.reps||'').toUpperCase(); const pct=Number(seg?.load?.percentage)||0; const baseKey=String(seg?.load?.baseline||'').replace(/^user\./i,''); const orm=pn[baseKey]; const load = (typeof orm==='number'&&pct>0)? `${Math.max(5, Math.round((orm*(pct/100))/5)*5)} lb` : (pct?`${pct}%`:undefined); for(let r=0;r<Math.max(1,sets);r+=1){ lines.push(`${name} 1 × ${reps}${load?` @ ${load}`:''}`); if (r<sets-1 && seg?.rest) lines.push(`Rest ${mmss(toSec(String(seg.rest)))}`);} continue;
    }
  }
  const est = typeof ws?.total_duration_estimate==='string' ? toSec(ws.total_duration_estimate) : 0;
  const durationMin = est>0 ? Math.floor(est/60) : undefined;

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{String(ws?.title || (workout as any)?.title || '') || 'Planned'}</div>
          <div className="text-sm text-gray-500">{typeof durationMin==='number'?`${durationMin} min`:''}</div>
        </div>
      )}
      <div className="p-1">
        <ul className="list-none space-y-1">
          {(lines.length?lines:["No structured steps found."]).map((ln, i)=>(<li key={i} className="text-sm text-gray-800">{ln}</li>))}
        </ul>
      </div>
    </div>
  );
};

export default StructuredPlannedView;


