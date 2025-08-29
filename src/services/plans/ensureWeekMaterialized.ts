import { supabase } from '@/lib/supabase';
import { normalizePlannedSession } from '@/services/plans/normalizer';
import { expandSession, DEFAULTS_FALLBACK } from '@/services/plans/plan_dsl';

type PlannedRow = {
  user_id: string;
  training_plan_id: string;
  template_id?: string;
  week_number: number;
  day_number: number;
  date: string;
  type: string;
  name: string;
  description: string;
  duration: number;
  workout_status: 'planned';
  source: 'training_plan';
  steps_preset?: string[] | null;
  export_hints?: any;
  rendered_description?: string;
  computed?: any;
  units?: 'imperial' | 'metric';
  intensity?: any;
  intervals?: any[];
  strength_exercises?: any[];
};

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
const dayIndex: Record<string, number> = { Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6, Sunday:7 };

function addDays(iso: string, n: number) {
  const parts = String(iso).split('-').map((x) => parseInt(x, 10));
  const base = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  base.setDate(base.getDate() + n);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeStartDateFromWeek1Anchor(anchorDate: string, anchorDayNumber: number | null): string {
  if (!anchorDate) {
    // fallback: next Monday local
    const d = new Date();
    const day = d.getDay(); // 0..6 Sun..Sat
    const diff = (8 - day) % 7 || 7;
    const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return nm.toISOString().slice(0,10);
  }
  const dn = typeof anchorDayNumber === 'number' && anchorDayNumber >= 1 && anchorDayNumber <= 7 ? anchorDayNumber : 1;
  return addDays(anchorDate, -(dn - 1));
}

export async function ensureWeekMaterialized(planId: string, weekNumber: number): Promise<{ inserted: number }>{
  // 1) If rows already exist for this week, no-op
  const { data: existing, error: existErr } = await supabase
    .from('planned_workouts')
    .select('id')
    .eq('training_plan_id', planId)
    .eq('week_number', weekNumber)
    .limit(1);
  if (!existErr && Array.isArray(existing) && existing.length > 0) return { inserted: 0 };

  // 2) Auth user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 3) Load plan (sessions_by_week + config.catalog_id)
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, name, description, duration_weeks, sessions_by_week, config')
    .eq('id', planId)
    .single();
  if (planErr || !plan) throw planErr || new Error('Plan not found');

  const sessionsByWeek = (plan as any).sessions_by_week || {};
  const planDefaults = (plan as any)?.defaults || DEFAULTS_FALLBACK;
  const weekSessions: any[] = sessionsByWeek[String(weekNumber)] || [];
  if (!Array.isArray(weekSessions) || weekSessions.length === 0) return { inserted: 0 };

  // 4) Determine export_hints from library plan, if available
  let exportHints: any = null;
  try {
    const catalogId = (plan as any)?.config?.catalog_id;
    if (catalogId) {
      const lib = await supabase.from('library_plans').select('template').eq('id', catalogId).single();
      exportHints = (lib.data?.template?.export_hints || null);
    }
  } catch {}

  // 5) Determine start_date from existing Week 1 rows
  let startDate = (() => {
    try { return (plan as any).start_date as string; } catch { return undefined; }
  })() as string | undefined;
  if (!startDate) {
    const { data: w1, error: w1Err } = await supabase
      .from('planned_workouts')
      .select('date, day_number')
      .eq('training_plan_id', planId)
      .eq('week_number', 1)
      .order('day_number', { ascending: true })
      .order('date', { ascending: true })
      .limit(1);
    if (!w1Err && Array.isArray(w1) && w1.length > 0) {
      const anchor = w1[0] as any;
      startDate = computeStartDateFromWeek1Anchor(anchor.date as string, anchor.day_number as number);
    }
  }
  if (!startDate) {
    // fallback next Monday
    const d = new Date();
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7;
    const nm = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    startDate = nm.toISOString().slice(0,10);
  }

  // 6) Load baselines for normalization
  let perfNumbers: any = {};
  let unitsPref: 'imperial' | 'metric' = 'imperial';
  try {
    const { data: ub } = await supabase.from('user_baselines').select('units, performance_numbers').eq('user_id', user.id).single();
    if (ub) {
      unitsPref = (ub.units === 'metric' || ub.units === 'imperial') ? ub.units : 'imperial';
      perfNumbers = ub.performance_numbers || {};
    }
  } catch {}

  // 7) Build rows
  const rows: PlannedRow[] = [];
  for (const s0 of weekSessions) {
    // Expand swim DSL to steps_preset if present
    let s = { ...s0 } as any;
    try {
      if ((!Array.isArray(s.steps_preset) || s.steps_preset.length === 0) && String(s.discipline||'').toLowerCase()==='swim') {
        const steps = expandSession({ discipline: 'swim', main: (s as any).main, extra: (s as any).extra, steps_preset: (s as any).steps_preset }, planDefaults);
        if (Array.isArray(steps) && steps.length) s.steps_preset = steps;
      }
    } catch {}
    const dow = dayIndex[(s.day as string) || 'Monday'] || 1;
    const date = addDays(startDate, (weekNumber - 1) * 7 + (dow - 1));
    const rawType = String(s.discipline || s.type || '').toLowerCase();
    let mappedType: 'run'|'ride'|'swim'|'strength' = 'run';
    if (rawType === 'run') mappedType = 'run';
    else if (rawType === 'bike' || rawType === 'ride') mappedType = 'ride';
    else if (rawType === 'swim') mappedType = 'swim';
    else if (rawType === 'strength') mappedType = 'strength';

    // Friendly rendering + duration heuristics
    let rendered = String(s.description || '');
    let totalSeconds = 0;
    try {
      const norm = normalizePlannedSession(s, { performanceNumbers: perfNumbers }, exportHints || {});
      rendered = (norm.friendlySummary || rendered).trim();
      totalSeconds = Math.max(0, Math.round((norm.durationMinutes || 0) * 60));
    } catch {}

    const durationVal = typeof s.duration === 'number' && Number.isFinite(s.duration) ? s.duration : (totalSeconds ? Math.round(totalSeconds/60) : 0);

    const isOptional = Array.isArray(s?.tags) ? s.tags.some((t: any) => String(t).toLowerCase()==='optional') : /\[optional\]/i.test(String(s?.description||''));
    rows.push({
      user_id: user.id,
      training_plan_id: plan.id,
      template_id: String(plan.id),
      week_number: weekNumber,
      day_number: dow,
      date,
      type: mappedType,
      name: s.name || (mappedType === 'strength' ? 'Strength' : s.type || 'Session'),
      description: s.description || '',
      duration: durationVal,
      workout_status: 'planned' as any,
      source: 'training_plan',
      tags: Array.isArray(s?.tags) ? s.tags : (isOptional ? ['optional'] : []),
      steps_preset: Array.isArray(s?.steps_preset) ? s.steps_preset : null,
      export_hints: exportHints || null,
      rendered_description: rendered,
      computed: { normalization_version: 'v2', total_duration_seconds: totalSeconds },
      units: unitsPref,
      intensity: typeof s.intensity === 'object' ? s.intensity : undefined,
      intervals: Array.isArray(s.intervals) ? s.intervals : undefined,
      strength_exercises: Array.isArray(s.strength_exercises) ? s.strength_exercises : undefined,
    });
  }

  if (rows.length === 0) return { inserted: 0 };
  const { error: insErr } = await supabase.from('planned_workouts').insert(rows as any);
  if (insErr) throw insErr;
  return { inserted: rows.length };
}


