import { supabase } from '@/lib/supabase';

export type WeekUnifiedResult = {
  items: unknown[];
  weekly_stats: Record<string, unknown>;
  training_plan_context: unknown | null;
  empty_day_lines: Record<string, string> | null;
  spacing_lines: Record<string, unknown> | null;
};

/** Single choke point for `get-week` invoke (calendar prefetch + useWeekUnified). */
export async function fetchWeekUnified(fromISO: string, toISO: string): Promise<WeekUnifiedResult> {
  const { data, error } = await supabase.functions.invoke('get-week', { body: { from: fromISO, to: toISO } });
  if (error) throw error;
  return {
    items: Array.isArray((data as any)?.items) ? (data as any).items : [],
    weekly_stats: (data as any)?.weekly_stats || { planned: 0, completed: 0 },
    training_plan_context: (data as any)?.training_plan_context ?? null,
    // ⛔ The server's day lines ride through (2026-09-19): dropping them here left every empty day blank on Today and the calendar.
    empty_day_lines: (data as any)?.empty_day_lines ?? null,
    spacing_lines: (data as any)?.spacing_lines ?? null,
  };
}
