import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getLibraryPlan } from '@/services/LibraryPlans';
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

function isRun(s: any) { const d = (s.discipline||s.type||'').toLowerCase(); return d==='run'; }
function isRide(s: any) { const d = (s.discipline||s.type||'').toLowerCase(); return d==='ride'||d==='bike'||d==='cycling'; }
function isStrength(s: any) { const d = (s.discipline||s.type||'').toLowerCase(); return d==='strength'; }
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
  const [includeStrength, setIncludeStrength] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(true);

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
  const hasStrength = useMemo(() => {
    if (!libPlan?.template?.sessions_by_week) return false;
    return Object.values(libPlan.template.sessions_by_week).some((arr: any) => (arr as any[]).some(isStrength));
  }, [libPlan]);

  async function save() {
    if (!libPlan) return;
    try {
      const remapped = remapForPreferences(libPlan.template, { longRunDay, longRideDay, includeStrength });
      const payload = {
        name: libPlan.name,
        description: libPlan.description || '',
        duration_weeks: remapped.duration_weeks,
        current_week: 1,
        status: 'active',
        plan_type: 'catalog',
        start_date: startDate,
        config: { source: 'catalog', preferences: { longRunDay, longRideDay, includeStrength }, catalog_id: libPlan.id },
        weeks: [],
        sessions_by_week: remapped.sessions_by_week,
        notes_by_week: remapped.notes_by_week || {},
      } as any;
      await addPlan(payload);
      navigate('/');
    } catch (e: any) {
      setError(e.message || 'Failed to save plan');
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto p-4">Loading…</div>;
  if (error) return <div className="max-w-3xl mx-auto p-4 text-red-600">{error}</div>;
  if (!libPlan) return <div className="max-w-3xl mx-auto p-4">Plan not found</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{libPlan.name}</h2>
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600">Back</button>
      </div>
      <div className="text-sm text-gray-700">{libPlan.description}</div>

      {/* Read-only preview for users before accepting */}
      {showPreview && (
        <div className="p-3 border rounded space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Plan Preview</div>
            <button className="text-xs text-blue-600" onClick={()=>setShowPreview(false)}>Hide</button>
          </div>
          <div className="space-y-3 max-h-72 overflow-auto">
            {Object.keys(libPlan.template.sessions_by_week||{}).sort((a: any,b: any)=>parseInt(a,10)-parseInt(b,10)).map((wk: string) => {
              const sess = (libPlan.template.sessions_by_week[wk]||[]).slice();
              const mins = sess.reduce((t: number, s: any)=>t+(s.duration||0),0);
              return (
                <div key={wk} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Week {wk}</div>
                    <div className="text-xs text-gray-600">{sess.length} sessions • {mins} min</div>
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
          {hasStrength && (
            <div className="flex items-center gap-2 mt-5">
              <input id="incl-str" type="checkbox" checked={includeStrength} onChange={e=>setIncludeStrength(e.target.checked)} className="h-4 w-4" />
              <label htmlFor="incl-str" className="text-sm">Include strength</label>
            </div>
          )}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <div>
          <button onClick={save} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Save Plan</button>
        </div>
      </div>
    </div>
  );
}


