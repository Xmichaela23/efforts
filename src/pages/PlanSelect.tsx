import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getLibraryPlan } from '@/services/LibraryPlans';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

function computeNextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (8 - day) % 7 || 7;
  const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  // format local YYYY-MM-DD
  const y = nm.getFullYear();
  const m = String(nm.getMonth() + 1).padStart(2,'0');
  const dd = String(nm.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function inferDisciplineFromDescription(desc?: string): string | null {
  if (!desc) return null;
  const t = desc.toLowerCase();
  if (/\brun\b/.test(t)) return 'run';
  if (/\b(bike|ride|cycling)\b/.test(t)) return 'ride';
  if (/\bswim\b/.test(t)) return 'swim';
  if (/\bstrength\b|squat|deadlift|bench|ohp/.test(t)) return 'strength';
  return null;
}
function isRun(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='run' || inferDisciplineFromDescription(s.description)==='run';
}
function isRide(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='ride'||d==='bike'||d==='cycling' || inferDisciplineFromDescription(s.description)==='ride';
}
function isStrength(s: any) {
  const d = (s.discipline||s.type||'')?.toLowerCase();
  return d==='strength' || inferDisciplineFromDescription(s.description)==='strength';
}
function hasTag(s: any, t: string) { return Array.isArray(s.tags) && s.tags.includes(t); }

function remapForPreferences(plan: any, prefs: { longRunDay: string; longRideDay: string; includeStrength: boolean }) {
  const out: any = { ...plan, sessions_by_week: {} };
  for (const [wk, sessions] of Object.entries<any>(plan.sessions_by_week || {})) {
    const copy = (sessions as any[]).map(s => ({ ...s }));
    const runTagged = copy.findIndex(s => hasTag(s,'long_run'));
    if (runTagged >= 0) copy[runTagged].day = prefs.longRunDay; else {
      let i=-1,b=-1; copy.forEach((s,idx)=>{ const dur=s.duration||0; if(isRun(s)&&dur>b){b=dur;i=idx;} });
      if (i>=0) copy[i].day = prefs.longRunDay;
    }
    const rideTagged = copy.findIndex(s => hasTag(s,'long_ride'));
    if (rideTagged >= 0) copy[rideTagged].day = prefs.longRideDay; else {
      let i=-1,b=-1; copy.forEach((s,idx)=>{ const dur=s.duration||0; if(isRide(s)&&dur>b){b=dur;i=idx;} });
      if (i>=0) copy[i].day = prefs.longRideDay;
    }
    const filtered = prefs.includeStrength ? copy : copy.filter(s => !isStrength(s) || hasTag(s,'mandatory_strength'));
    out.sessions_by_week[wk] = filtered;
  }
  return out;
}

export default function PlanSelect() {
  const [sp] = useSearchParams();
  const id = sp.get('id');
  const navigate = useNavigate();
  const { addPlan, loadUserBaselines } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [libPlan, setLibPlan] = useState<any|null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [longRunDay, setLongRunDay] = useState<string>('Sunday');
  const [longRideDay, setLongRideDay] = useState<string>('Saturday');
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const byDay = (a: any, b: any) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
  const cleanDesc = (text: string) => String(text || '').replace(/\[(?:cat|plan):[^\]]+\]\s*/gi, '');

  useEffect(() => {
    (async () => {
      try {
        if (!id) { setError('Missing plan id'); setLoading(false); return; }
        const p = await getLibraryPlan(id);
        if (!p) { setError('Plan not found'); setLoading(false); return; }
        setLibPlan(p);
        setStartDate(computeNextMonday());
        setLoading(false);
      } catch (e: any) {
        setError(e.message || 'Failed to load plan');
        setLoading(false);
      }
    })();
  }, [id]);

  const hasRun = useMemo(() => {
    if (!libPlan?.template?.sessions_by_week) return false;
    return Object.values(libPlan.template.sessions_by_week).some((arr: any) => (arr as any[]).some(isRun));
  }, [libPlan]);
  const hasRide = useMemo(() => {
    if (!libPlan?.template?.sessions_by_week) return false;
    return Object.values(libPlan.template.sessions_by_week).some((arr: any) => (arr as any[]).some(isRide));
  }, [libPlan]);
  // Strength is not optional in scheduling; presence in plan is respected as-authored

  async function save() {
    if (!libPlan) return;
    try {
      const remapped = remapForPreferences(libPlan.template, { longRunDay, longRideDay, includeStrength: true });
      // Load baselines and map tokens/targets into descriptions
      let baselines: any = null;
      try { baselines = await loadUserBaselines?.(); } catch {}
      const mapped = { ...remapped, sessions_by_week: {} as any };
      const fiveK = baselines?.performanceNumbers?.fiveK?.toString() || null;
      const easyPace = baselines?.performanceNumbers?.easyPace?.toString() || null;
      const ftp = baselines?.performanceNumbers?.ftp || null;
      const oneRMs = {
        squat: baselines?.performanceNumbers?.squat,
        bench: baselines?.performanceNumbers?.bench,
        deadlift: baselines?.performanceNumbers?.deadlift,
        overhead: baselines?.performanceNumbers?.overheadPress1RM,
      } as any;

      const parsePace = (p?: string|null) => {
        if (!p) return null; const m = p.match(/^(\d+):(\d{2})\/(mi|km)$/i); if (!m) return null; return { s: parseInt(m[1],10)*60+parseInt(m[2],10), u: m[3].toLowerCase() };
      };
      const fmtPace = (sec: number, u: string) => { const s = Math.max(1, Math.round(sec)); const mm = Math.floor(s/60); const ss = s%60; return `${mm}:${String(ss).padStart(2,'0')}/${u}`; };
      const addOffset = (base: string, off: string) => {
        const b = base.trim(); const o = off.trim();
        const bm = b.match(/^(\d+):(\d{2})\/(mi|km)$/i); const om = o.match(/^([+\-−])(\d+):(\d{2})\/(mi|km)$/i);
        if (!bm || !om) return base+off; const bs = parseInt(bm[1],10)*60+parseInt(bm[2],10); const bu = bm[3].toLowerCase(); const sign = om[1]=== '-' || om[1]==='−' ? -1 : 1; const os = parseInt(om[2],10)*60+parseInt(om[3],10); const ou = om[4].toLowerCase(); if (bu!==ou) return base+off; return fmtPace(bs + sign*os, bu);
      };
      const resolvePaces = (text: string) => {
        let out = text;
        if (fiveK) out = out.replaceAll('{5k_pace}', fiveK);
        if (easyPace) out = out.replaceAll('{easy_pace}', easyPace);
        // handle patterns like "M:SS/unit +/- M:SS/unit"
        out = out.replace(/(\d+:\d{2}\/(?:mi|km))\s*([+\-−])\s*(\d+:\d{2}\/(?:mi|km))/g, (_m, a, s, b) => addOffset(a, `${s}${b}`));
        return out;
      };
      const round = (w: number) => Math.round(w / 5) * 5;
      const resolveStrength = (text: string) => {
        // Append computed weight after patterns like "Squat ... @70%" using 1RMs
        return text.replace(/(Squat|Back Squat|Bench|Bench Press|Deadlift|Overhead Press|OHP)[^@]*@\s*(\d+)%/gi, (m, lift, pct) => {
          const key = String(lift).toLowerCase(); let orm:
            number|undefined = key.includes('squat')?oneRMs.squat : key.includes('bench')?oneRMs.bench : key.includes('deadlift')?oneRMs.deadlift : (key.includes('ohp')||key.includes('overhead'))?oneRMs.overhead : undefined;
          if (!orm) return m; const w = round(orm * (parseInt(pct,10)/100)); return `${m} — ${w} lb`;
        });
      };
      const mapBike = (text: string) => {
        if (!ftp) return text; const t = text.toLowerCase();
        const add = (lo: number, hi: number) => `${text} — target ${Math.round(lo*ftp)}–${Math.round(hi*ftp)} W`;
        if (t.includes('vo2')) return add(1.06,1.20);
        if (t.includes('threshold')) return add(0.95,1.00);
        if (t.includes('sweet spot')) return add(0.88,0.94);
        if (t.includes('zone 2')) return add(0.60,0.75);
        return text;
      };

      for (const [wk, sessions] of Object.entries<any>(remapped.sessions_by_week||{})) {
        const outWeek: any[] = [];
        for (const s of sessions as any[]) {
          let desc = String(s.description||'');
          if (desc) desc = resolvePaces(desc);
          if (desc) desc = resolveStrength(desc);
          if (desc) desc = mapBike(desc);
          const copy = { ...s, description: desc };
          outWeek.push(copy);
        }
        (mapped.sessions_by_week as any)[wk] = outWeek;
      }

      const payload = {
        name: libPlan.name,
        description: libPlan.description || '',
        duration_weeks: mapped.duration_weeks,
        current_week: 1,
        status: 'active',
        plan_type: 'catalog',
        start_date: startDate,
        config: { source: 'catalog', preferences: { longRunDay, longRideDay }, catalog_id: libPlan.id },
        weeks: [],
        sessions_by_week: mapped.sessions_by_week,
        notes_by_week: mapped.notes_by_week || {},
      } as any;
      await addPlan(payload);
      navigate('/');
    } catch (e: any) {
      // Fallback: attempt direct insert and surface full error text
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('You must be signed in to save a plan.');
        const insertPayload: any = { ...payload, user_id: user.id };
        delete insertPayload.start_date; // not a column on plans
        const { data, error } = await supabase.from('plans').insert([insertPayload]).select().single();
        if (error) throw error;
        // Materialize planned_workouts like context normally does
        try {
          const start = startDate;
          const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };
          const addDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
          const rows: any[] = [];
          Object.keys((payload as any).sessions_by_week || {}).forEach((wkKey) => {
            const weekNum = parseInt(wkKey, 10);
            const sessions = (payload as any).sessions_by_week[wkKey] || [];
            sessions.forEach((s: any) => {
              const dow = dayIndex[s.day] || 1;
              const date = addDays(start, (weekNum - 1) * 7 + (dow - 1));
              if (weekNum === 1 && date < start) return;
              const rawType = (s.discipline || s.type || '').toLowerCase();
              let mappedType: string = 'run';
              if (rawType === 'run') mappedType = 'run';
              else if (rawType === 'bike' || rawType === 'ride') mappedType = 'ride';
              else if (rawType === 'swim') mappedType = 'swim';
              else if (rawType === 'strength') mappedType = 'strength';
              const durationVal = (typeof s.duration === 'number' && Number.isFinite(s.duration)) ? s.duration : 0;
              const row: any = {
                user_id: user.id, training_plan_id: data.id, week_number: weekNum, day_number: dow, date,
                type: mappedType, name: s.name || (mappedType==='strength'?'Strength': s.type || 'Session'),
                description: s.description || '', duration: durationVal, workout_status: 'planned', source: 'training_plan'
              };
              if (s.intensity && typeof s.intensity === 'object') row.intensity = s.intensity;
              if (Array.isArray(s.intervals)) row.intervals = s.intervals;
              if (Array.isArray(s.strength_exercises)) row.strength_exercises = s.strength_exercises;
              rows.push(row);
            });
          });
          if (rows.length) await supabase.from('planned_workouts').insert(rows);
        } catch {}
        navigate('/');
      } catch (inner: any) {
        setError(inner?.message ? String(inner.message) : JSON.stringify(inner));
      }
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto p-4">Loading…</div>;
  if (error) return <div className="max-w-3xl mx-auto p-4 text-red-600">{error}</div>;
  if (!libPlan) return <div className="max-w-3xl mx-auto p-4">Plan not found</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{libPlan.name}</h2>
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)} className="text-sm text-blue-600">Back to Catalog</button>
          <button onClick={() => navigate('/')} className="text-sm text-blue-600">Dashboard</button>
        </div>
      </div>
      <div className="text-sm text-gray-700">{cleanDesc(libPlan.description)}</div>

      {/* Read-only preview for users before accepting */}
      {showPreview && (
        <div className="p-3 border rounded space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Plan Preview</div>
            <button className="text-xs text-blue-600" onClick={()=>setShowPreview(false)}>Hide</button>
          </div>
          <div className="space-y-3 max-h-96 overflow-auto">
            {Object.keys(libPlan.template.sessions_by_week||{})
              .sort((a: any,b: any)=>parseInt(a,10)-parseInt(b,10))
              .map((wk: string) => {
                const sess = (libPlan.template.sessions_by_week[wk]||[]).slice().sort(byDay);
                const mins = sess.reduce((t: number, s: any)=>t+(typeof s.duration==='number'?s.duration:0),0);
                return (
                  <div key={wk} className="border rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Week {wk}</div>
                      <div className="text-xs text-gray-600">{sess.length} sessions{mins>0?` • ${mins} min`:''}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      {sess.map((s: any, i: number) => {
                        const fallback = [s.discipline || s.type || '']
                          .concat((s.type && s.type!==s.discipline) ? [`• ${s.type}`] : [])
                          .concat(typeof s.duration === 'number' ? [`• ${s.duration} min`] : [])
                          .filter(Boolean)
                          .join(' ')
                          .trim();
                        const label = s.description ? cleanDesc(s.description) : fallback;
                        return (
                          <div key={i} className="text-xs text-gray-700">
                            <span className="font-medium">{s.day}</span>{label ? ` — ${label}` : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="p-3 border rounded space-y-3">
        <div className="text-sm font-medium">Scheduling Preferences</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-700 mb-1">Start date</div>
            <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
          </div>
          {hasRun && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long run day</div>
              <select value={longRunDay} onChange={e=>setLongRunDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {hasRide && (
            <div>
              <div className="text-xs text-gray-700 mb-1">Long ride day</div>
              <select value={longRideDay} onChange={e=>setLongRideDay(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {/* Strength is included as authored; no toggle */}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div>
          <button onClick={save} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Save Plan</button>
        </div>
      </div>
    </div>
  );
}


