import { supabase } from '@/lib/supabase';

export type LibraryPlan = {
  id: string;
  name: string;
  description: string;
  discipline: 'run'|'ride'|'swim'|'strength'|'triathlon'|'hybrid';
  duration_weeks: number;
  tags?: string[];
  status: 'published'|'draft';
  template: any; // original JSON plan
  created_by?: string | null;
  created_at?: string;
};

export async function listLibraryPlans(discipline?: LibraryPlan['discipline']): Promise<LibraryPlan[]> {
  let q = supabase.from('library_plans').select('*').eq('status','published').order('created_at',{ ascending: false });
  if (discipline) {
    if (discipline === 'triathlon') {
      // PoC: triathlon blueprints may be stored as 'hybrid' until DB check allows 'triathlon'
      q = q.or('discipline.eq.triathlon,discipline.eq.hybrid');
    } else {
      q = q.eq('discipline', discipline);
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data || []) as any[];
  // For triathlon tab, only show entries that are actually triathlon or hybrid with a phase_blueprint
  if (discipline === 'triathlon') {
    rows = rows.filter((r:any)=> String(r.discipline||'').toLowerCase()==='triathlon' || (r.template && r.template.phase_blueprint));
  }
  return rows as LibraryPlan[];
}

export async function getLibraryPlan(id: string): Promise<LibraryPlan | null> {
  const { data, error } = await supabase.from('library_plans').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as any) || null;
}

export async function publishLibraryPlan(input: Omit<LibraryPlan,'id'|'status'|'created_by'|'created_at'> & { status?: 'published'|'draft' }): Promise<LibraryPlan> {
  const payload: any = { ...input };
  if (!payload.status) payload.status = 'published';
  let { data, error } = await supabase.from('library_plans').insert([payload]).select().single();
  // Fallback for PoC: if triathlon not allowed by DB check, store as hybrid
  if (error && String(payload.discipline).toLowerCase()==='triathlon' && /discipline/.test(String(error.message||''))) {
    const retry = { ...payload, discipline: 'hybrid' };
    const res = await supabase.from('library_plans').insert([retry]).select().single();
    if (res.error) throw res.error;
    return res.data as LibraryPlan;
  }
  if (error) throw error;
  return data as LibraryPlan;
}

export async function deleteLibraryPlan(id: string): Promise<void> {
  const { error } = await supabase.from('library_plans').delete().eq('id', id);
  if (error) throw error;
}


