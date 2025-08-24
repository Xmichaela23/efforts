import { supabase } from '@/lib/supabase';

export type LibraryPlan = {
  id: string;
  name: string;
  description: string;
  discipline: 'run'|'ride'|'swim'|'strength'|'hybrid';
  duration_weeks: number;
  tags?: string[];
  status: 'published'|'draft';
  template: any; // original JSON plan
  created_by?: string | null;
  created_at?: string;
};

export async function listLibraryPlans(discipline?: LibraryPlan['discipline']): Promise<LibraryPlan[]> {
  let q = supabase.from('library_plans').select('*').eq('status','published').order('created_at',{ ascending: false });
  if (discipline) q = q.eq('discipline', discipline);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LibraryPlan[];
}

export async function getLibraryPlan(id: string): Promise<LibraryPlan | null> {
  const { data, error } = await supabase.from('library_plans').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return (data as any) || null;
}

export async function publishLibraryPlan(input: Omit<LibraryPlan,'id'|'status'|'created_by'|'created_at'> & { status?: 'published'|'draft' }): Promise<LibraryPlan> {
  const payload: any = { ...input };
  if (!payload.status) payload.status = 'published';
  const { data, error } = await supabase.from('library_plans').insert([payload]).select().single();
  if (error) throw error;
  return data as LibraryPlan;
}

export async function deleteLibraryPlan(id: string): Promise<void> {
  const { error } = await supabase.from('library_plans').delete().eq('id', id);
  if (error) throw error;
}


