import React, { useState } from 'react';
import { validateUniversalPlan } from '@/services/plans/UniversalPlanValidator';
import { publishLibraryPlan } from '@/services/LibraryPlans';
import { expandSession, DEFAULTS_FALLBACK } from '@/services/plans/plan_dsl';

export default function PlanJSONImport({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<'paste'|'upload'|'url'>('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [planPreview, setPlanPreview] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discipline, setDiscipline] = useState<'run'|'ride'|'swim'|'strength'|'triathlon'|'hybrid'>('run');
  // Acceptance preferences
  const [startDate, setStartDate] = useState<string>('');
  const [longRunDay, setLongRunDay] = useState<string>('Sunday');
  const [longRideDay, setLongRideDay] = useState<string>('Saturday');
  const [includeStrength, setIncludeStrength] = useState<boolean>(true);

  function preprocessForSchema(input: any) {
    // Deep copy to avoid mutating caller input
    const plan = JSON.parse(JSON.stringify(input || {}));
    const defaults = (plan?.defaults as any) || DEFAULTS_FALLBACK;
    const sbw = plan?.sessions_by_week || {};
    const out: any = { ...plan, sessions_by_week: {} };

    // Simple macro alias expander
    const expandMacro = (macro: string): string[] | null => {
      const m = String(macro || '').trim();
      switch (m) {
        case '@RUN_INT_6x400_5k_R2':
          return ['warmup_run_quality_12min','interval_6x400m_5kpace_R2min','cooldown_easy_10min'];
        case '@BK_VO2_6x3_R3':
          return ['warmup_bike_quality_15min_fastpedal','bike_vo2_6x3min_R3min','cooldown_bike_easy_10min'];
        case '@BK_THR_4x8_R5':
          return ['warmup_bike_quality_15min_fastpedal','bike_thr_4x8min_R5min','cooldown_bike_easy_10min'];
        case '@SWIM_TECH_1200_DEFAULT':
          return ['swim_warmup_200yd_easy','swim_drills_4x50yd_catchup','swim_drills_4x50yd_singlearm','swim_pull_2x100yd','swim_kick_2x100yd','swim_cooldown_200yd_easy'];
        default:
          return null;
      }
    };
    for (const [wk, sessions] of Object.entries<any>(sbw)) {
      const outWeek: any[] = [];
      for (const s0 of (sessions as any[])) {
        const s = { ...s0 } as any;
        const disc = String(s.discipline || s.type || '').toLowerCase();
        // Macro expansion (author convenience)
        const explicitMacro = typeof s.macro === 'string' ? s.macro : undefined;
        const descMacro = (!explicitMacro && typeof s.description === 'string' && /^@/.test(s.description.trim())) ? s.description.trim() : undefined;
        const macroSrc = explicitMacro || descMacro;
        if ((!Array.isArray(s.steps_preset) || s.steps_preset.length === 0) && macroSrc) {
          const steps = expandMacro(macroSrc);
          if (steps && steps.length) {
            s.steps_preset = steps;
          }
        }
        // Only apply DSL expansion for swim; other disciplines may be added later
        if (disc === 'swim') {
          try {
            if ((!Array.isArray(s.steps_preset) || s.steps_preset.length === 0) && (s.main || s.extra)) {
              const steps = expandSession({ discipline: 'swim', main: s.main, extra: s.extra, steps_preset: s.steps_preset }, defaults);
              if (Array.isArray(steps) && steps.length) s.steps_preset = steps;
            }
          } catch {}
          // Strip DSL fields so schema doesn't flag additional properties
          delete s.main;
          delete s.extra;
          delete s.override_wu;
          delete s.override_cd;
        }
        // Remove macro field/marker from sessions
        delete s.macro;
        outWeek.push(s);
      }
      out.sessions_by_week[wk] = outWeek;
    }
    // Sanitize export_hints: keep only whitelisted keys
    if (out.export_hints && typeof out.export_hints === 'object') {
      const eh = out.export_hints as any;
      const keep: any = {};
      const allow = new Set([
        'pace_tolerance_quality',
        'pace_tolerance_easy',
        'power_tolerance_SS_thr',
        'power_tolerance_VO2'
      ]);
      for (const k of Object.keys(eh)) {
        if (allow.has(k)) keep[k] = eh[k];
      }
      out.export_hints = Object.keys(keep).length ? keep : undefined;
      if (!out.export_hints) delete out.export_hints;
    }

    // Inject weekly optional header (from ui_text.optional_header) into notes_by_week while keeping schema clean
    try {
      const header: string | undefined = (plan?.ui_text && typeof plan.ui_text.optional_header === 'string') ? String(plan.ui_text.optional_header) : undefined;
      if (header && header.trim().length > 0) {
        const weekKeys = Object.keys(out.sessions_by_week || {});
        if (!out.notes_by_week || typeof out.notes_by_week !== 'object') out.notes_by_week = {};
        for (const wk of weekKeys) {
          const arr: string[] = Array.isArray(out.notes_by_week[wk]) ? [...out.notes_by_week[wk]] : [];
          if (arr[0] !== header) arr.unshift(header);
          out.notes_by_week[wk] = arr;
        }
      }
    } catch {}

    // Remove authoring-only fields not present in schema
    delete out.defaults;
    // If author provided min/max weeks with sessions_by_week, strip before schema validate
    if (typeof out.min_weeks !== 'undefined') delete out.min_weeks;
    if (typeof out.max_weeks !== 'undefined') delete out.max_weeks;
    // ui_text is not part of schema; strip for validation (we will reattach after validate)
    delete out.ui_text;
    return out;
  }

  async function handleValidate(input: any) {
    setError(null);
    setPlanPreview(null);
    // If this looks like a tri blueprint (no sessions_by_week; has min/max and phase_blueprint), accept without universal schema
    const isTriBlueprint = (
      input && typeof input === 'object' &&
      !input.sessions_by_week &&
      (typeof input.min_weeks === 'number') &&
      (typeof input.max_weeks === 'number') &&
      input.phase_blueprint
    );
    let res: any = null;
    if (isTriBlueprint) {
      try {
        const triPreview = JSON.parse(JSON.stringify(input));
        // Provide duration_weeks for catalog display
        if (typeof triPreview.duration_weeks !== 'number') triPreview.duration_weeks = triPreview.max_weeks;
        res = { ok: true, plan: triPreview };
        setDiscipline('triathlon');
      } catch (e: any) {
        setError(e?.message || 'Invalid tri blueprint');
        return;
      }
    } else {
      // Preprocess DSL (e.g., swim main/extra) → steps_preset and strip unsupported fields
      const preserveMin = (typeof (input as any)?.min_weeks === 'number') ? (input as any).min_weeks : undefined;
      const preserveMax = (typeof (input as any)?.max_weeks === 'number') ? (input as any).max_weeks : undefined;
      const cleaned = preprocessForSchema(input);
      const v = validateUniversalPlan(cleaned);
      if (!v.ok) {
        setError(v.errors);
        return;
      }
      res = v;
      // Reattach min/max for acceptance window
      try {
        if (typeof preserveMin === 'number') (res.plan as any).min_weeks = preserveMin;
        if (typeof preserveMax === 'number') (res.plan as any).max_weeks = preserveMax;
      } catch {}
    }
    // Minimal sanity checks for universal plans only
    if (res.plan && res.plan.sessions_by_week) {
      const keys = Object.keys(res.plan.sessions_by_week).map(k => parseInt(k, 10)).filter(n => Number.isFinite(n));
      const maxWeek = keys.length ? Math.max(...keys) : 0;
      if (res.plan.duration_weeks < maxWeek) {
        setError(`duration_weeks (${res.plan.duration_weeks}) is less than last week key (${maxWeek})`);
        return;
      }
    }
    // Infer discipline from sessions for convenience
    try {
      const weeks = Object.values(res.plan.sessions_by_week || {}) as any[];
      const s = (weeks.flat() as any[]);
      const hasRun = s.some(x => (x.discipline||x.type||'').toLowerCase()==='run');
      const hasRide = s.some(x => ['ride','bike','cycling'].includes(String(x.discipline||x.type||'').toLowerCase()));
      const hasSwim = s.some(x => (x.discipline||x.type||'').toLowerCase()==='swim');
      const hasStrength = s.some(x => (x.discipline||x.type||'').toLowerCase()==='strength');
      if (hasRun && hasRide && hasSwim) setDiscipline('hybrid');
      else if (hasRide && !hasRun && !hasSwim) setDiscipline('ride');
      else if (hasSwim && !hasRun && !hasRide) setDiscipline('swim');
      else if (hasStrength && !hasRun && !hasRide && !hasSwim) setDiscipline('strength');
      else setDiscipline('run');
    } catch {}
    // Reattach authoring UI text (if present) for storage/display; not used for validation
    try {
      if (input && typeof input === 'object' && input.ui_text) {
        (res.plan as any).ui_text = JSON.parse(JSON.stringify(input.ui_text));
      }
    } catch {}
    // Reattach swim DSL fields (main/extra) per-session so we preserve advanced cues (rests/equipment)
    try {
      const rawSBW = (input && typeof input === 'object') ? (input.sessions_by_week || {}) : {};
      const outSBW = (res.plan && typeof res.plan === 'object') ? (res.plan.sessions_by_week || {}) : {};
      for (const wk of Object.keys(outSBW)) {
        const rawWeek: any[] = Array.isArray(rawSBW[wk]) ? rawSBW[wk] : [];
        const outWeek: any[] = Array.isArray(outSBW[wk]) ? outSBW[wk] : [];
        for (let i=0; i<outWeek.length; i+=1) {
          const rawSess = rawWeek[i];
          const outSess = outWeek[i];
          if (!rawSess || !outSess) continue;
          const disc = String(rawSess.discipline || rawSess.type || '').toLowerCase();
          if (disc === 'swim') {
            if (typeof rawSess.main === 'string' && rawSess.main.trim().length>0) outSess.main = String(rawSess.main);
            if (typeof rawSess.extra === 'string' && rawSess.extra.trim().length>0) outSess.extra = String(rawSess.extra);
          }
        }
        outSBW[wk] = outWeek;
      }
      (res.plan as any).sessions_by_week = outSBW;
    } catch {}
    setPlanPreview(res.plan);
  }

  async function parseAndValidateText() {
    try {
      const json = JSON.parse(text);
      await handleValidate(json);
    } catch (e: any) {
      setError(e.message || 'Invalid JSON');
    }
  }

  async function fetchAndValidateUrl() {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      await handleValidate(json);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    try {
      const txt = await f.text();
      const json = JSON.parse(txt);
      await handleValidate(json);
    } catch (e: any) {
      setError(e.message || 'Invalid JSON file');
    }
  }

  async function savePlan() {
    if (!planPreview) return;
    setSaving(true);
    try {
      // Publish template JSON to catalog
      await publishLibraryPlan({
        name: planPreview.name,
        description: planPreview.description || '',
        discipline,
        duration_weeks: planPreview.duration_weeks,
        tags: [],
        template: planPreview,
        status: 'published'
      } as any);
      if (onClose) onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function computeNextMonday(): string {
    const d = new Date();
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = (8 - day) % 7 || 7;
    const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return nm.toISOString().slice(0, 10);
  }

  function isRunSession(s: any): boolean {
    const d = (s.discipline || s.type || '').toLowerCase();
    return d === 'run';
  }
  function isRideSession(s: any): boolean {
    const d = (s.discipline || s.type || '').toLowerCase();
    return d === 'bike' || d === 'ride' || d === 'cycling';
  }
  function isStrengthSession(s: any): boolean {
    const d = (s.discipline || s.type || '').toLowerCase();
    return d === 'strength';
  }
  function hasTag(s: any, tag: string): boolean {
    return Array.isArray(s.tags) && s.tags.includes(tag);
  }
  function remapForPreferences(plan: any, prefs: { longRunDay: string; longRideDay: string; includeStrength: boolean }) {
    const out: any = { ...plan, sessions_by_week: {} };
    for (const [week, sessions] of Object.entries<any>(plan.sessions_by_week || {})) {
      const copy = (sessions as any[]).map(s => ({ ...s }));
      // Move long run
      const runIdxTagged = copy.findIndex(s => hasTag(s, 'long_run'));
      const runIdxLongest = runIdxTagged >= 0 ? runIdxTagged : (() => {
        let best = -1, bestDur = -1;
        copy.forEach((s, i) => { if (isRunSession(s) && (s.duration || 0) > bestDur) { best = i; bestDur = s.duration || 0; } });
        return best;
      })();
      if (runIdxLongest >= 0) copy[runIdxLongest].day = prefs.longRunDay;
      // Move long ride
      const rideIdxTagged = copy.findIndex(s => hasTag(s, 'long_ride'));
      const rideIdxLongest = rideIdxTagged >= 0 ? rideIdxTagged : (() => {
        let best = -1, bestDur = -1;
        copy.forEach((s, i) => { if (isRideSession(s) && (s.duration || 0) > bestDur) { best = i; bestDur = s.duration || 0; } });
        return best;
      })();
      if (rideIdxLongest >= 0) copy[rideIdxLongest].day = prefs.longRideDay;
      // Strength include toggle
      const filtered = prefs.includeStrength ? copy : copy.filter(s => !isStrengthSession(s) || hasTag(s, 'mandatory_strength'));
      out.sessions_by_week[week] = filtered;
    }
    return out;
  }

  const totalSessions = (() => {
    try {
      if (!planPreview || !planPreview.sessions_by_week) return 0;
      const vals = Object.values(planPreview.sessions_by_week as any);
      return vals.reduce((t: number, arr: any) => t + (Array.isArray(arr) ? arr.length : 0), 0);
    } catch { return 0; }
  })();

  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  function byDay(a: any, b: any) {
    return DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
  }

  function exportMarkdown() {
    if (!planPreview) return;
    const lines: string[] = [];
    lines.push(`# ${planPreview.name}`);
    if (planPreview.description) lines.push('', planPreview.description);
    lines.push('', `Weeks: ${planPreview.duration_weeks}`, '');
    const weekKeys = Object.keys(planPreview.sessions_by_week || {}).sort((a,b)=>parseInt(a,10)-parseInt(b,10));
    for (const wk of weekKeys) {
      lines.push(`## Week ${wk}`);
      const sessions = (planPreview.sessions_by_week[wk] || []).slice().sort(byDay);
      for (const s of sessions) {
        const parts: string[] = [];
        parts.push(`- ${s.day}: ${s.discipline || s.type || ''}`.trim());
        const meta: string[] = [];
        if (s.type && s.type !== s.discipline) meta.push(s.type);
        if (typeof s.duration === 'number') meta.push(`${s.duration} min`);
        if (meta.length) lines.push(`  - ${meta.join(' • ')}`);
        if (s.description) lines.push(`  - ${s.description}`);
      }
      lines.push('');
    }
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = String(planPreview.name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Import JSON Plan</h2>
        {onClose && (
          <button onClick={onClose} className="text-sm text-blue-600">Close</button>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('paste')} className={`px-3 py-1 border rounded text-sm ${tab==='paste'?'bg-gray-100 border-gray-300':'border-gray-200'}`}>Paste JSON</button>
        <button onClick={() => setTab('upload')} className={`px-3 py-1 border rounded text-sm ${tab==='upload'?'bg-gray-100 border-gray-300':'border-gray-200'}`}>Upload File</button>
        <button onClick={() => setTab('url')} className={`px-3 py-1 border rounded text-sm ${tab==='url'?'bg-gray-100 border-gray-300':'border-gray-200'}`}>From URL</button>
      </div>

      {tab === 'paste' && (
        <div className="space-y-2">
          <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full h-56 border border-gray-300 rounded p-2 text-sm" placeholder="Paste plan JSON here" />
          <div className="flex gap-2">
            <button onClick={parseAndValidateText} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Validate</button>
          </div>
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-2">
          <input type="file" accept="application/json" onChange={onFileChange} />
          {fileName && <div className="text-xs text-gray-600">Selected: {fileName}</div>}
        </div>
      )}

      {tab === 'url' && (
        <div className="space-y-2">
          <input value={url} onChange={e=>setUrl(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="https://.../plan.json" />
          <div>
            <button onClick={fetchAndValidateUrl} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Fetch & Validate</button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm whitespace-pre-wrap">{error}</div>
      )}

      {planPreview && (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 border border-green-200 rounded">
            <div className="text-sm text-green-800">Valid JSON plan detected.</div>
          </div>
          <div className="text-sm text-gray-700">{planPreview.name} • {planPreview.duration_weeks} weeks • {totalSessions} sessions</div>
          <div className="p-3 border border-gray-200 rounded space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-700 mb-1">Discipline</div>
                <select value={discipline} onChange={e=>setDiscipline(e.target.value as any)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                  {['run','ride','swim','strength','triathlon','hybrid'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
          {/* Read-only plan preview for admins before publishing */}
          <div className="p-3 border border-gray-200 rounded space-y-2">
            <div className="text-sm font-medium">Plan Preview (read-only)</div>
            {planPreview.sessions_by_week ? (
              <div className="space-y-3 max-h-96 overflow-auto">
                {Object.keys(planPreview.sessions_by_week).sort((a,b)=>parseInt(a,10)-parseInt(b,10)).map(week => {
                  const sessions = (planPreview.sessions_by_week[week] || []).slice().sort(byDay);
                  const mins = sessions.reduce((t: number, s: any) => t + (typeof s.duration === 'number' ? s.duration : 0), 0);
                  return (
                    <div key={week} className="border rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Week {week}</div>
                        <div className="text-xs text-gray-600">{sessions.length} sessions{mins>0?` • ${mins} min`:''}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1">
                        {sessions.map((s: any, i: number) => {
                          const fallback = [s.discipline || s.type || '']
                            .concat((s.type && s.type!==s.discipline) ? [`• ${s.type}`] : [])
                            .concat(typeof s.duration === 'number' ? [`• ${s.duration} min`] : [])
                            .filter(Boolean)
                            .join(' ')
                            .trim();
                          const label = s.description ? s.description : fallback;
                          const hasSwimSteps = (s.discipline||s.type||'').toLowerCase()==='swim' && Array.isArray(s.steps) && s.steps.length>0;
                          return (
                            <div key={i} className="text-xs text-gray-700">
                              <span className="font-medium">{s.day}</span>{label ? ` — ${label}` : ''}
                              {hasSwimSteps && (
                                <div className="text-[11px] text-gray-500 mt-1">
                                  Swim steps: {s.steps.reduce((count: number, st: any) => count + Math.max(1, Number(st.repeat||1)), 0)} segments
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-gray-700">
                <div>Triathlon blueprint detected.</div>
                <div>Window: {planPreview.min_weeks}–{planPreview.max_weeks} weeks</div>
                {planPreview?.phase_blueprint?.order && (
                  <div>Phases: {planPreview.phase_blueprint.order.join(' → ')}</div>
                )}
              </div>
            )}
          </div>
          <div>
            <button disabled={saving} onClick={savePlan} className="px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">{saving? 'Publishing...' : 'Publish to catalog'}</button>
            <button onClick={exportMarkdown} className="ml-2 px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">Export Markdown</button>
          </div>
        </div>
      )}
    </div>
  );
}


