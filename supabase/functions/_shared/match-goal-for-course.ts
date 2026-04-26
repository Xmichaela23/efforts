/**
 * Resolve a goals.id for a race_courses row from course name + optional event date.
 * Used by course-upload (when goal_id omitted) and course-strategy (repair null goal_id).
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type FindGoalForCourseInput = {
  courseName: string;
  courseDate?: string | null; // YYYY-MM-DD; optional; matches goals.target_date
};

function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/70\.3/g, ' 70.3 ')
    .replace(/140\.6|140\.1/g, ' $& ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(phrase: string): Set<string> {
  return new Set(
    normKey(phrase)
      .split(' ')
      .map((t) => t.replace(/^\.+|\.+$/g, ''))
      .filter((t) => t.length > 0),
  );
}

function nameScore(courseName: string, goalName: string): number {
  const a = tokenSet(courseName);
  const b = tokenSet(goalName);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter++;
  }
  if (inter === 0) {
    const c = normKey(courseName);
    const g = normKey(goalName);
    if (c.length >= 4 && g.length >= 4) {
      if (g.includes(c) || c.includes(g)) return 0.45;
    }
    return 0;
  }
  const u = a.size + b.size - inter;
  return u > 0 ? inter / u : 0;
}

function pickBestNameMatch(
  courseName: string,
  goals: { id: string; name: string; target_date: string | null }[],
): { id: string; name: string; target_date: string | null } | null {
  if (goals.length === 0) return null;
  let best: { id: string; name: string; target_date: string | null } | null = null;
  let bestS = 0;
  for (const g of goals) {
    const s = nameScore(courseName, g.name);
    if (s > bestS) {
      bestS = s;
      best = g;
    }
  }
  // At least a weak name signal (shared tokens or substring), else ambiguous
  if (bestS >= 0.12) return best;
  return null;
}

export async function findGoalForCourse(
  supabase: SupabaseClient,
  userId: string,
  input: FindGoalForCourseInput,
): Promise<{ id: string; name: string; target_date: string | null } | null> {
  const { data: goals, error } = await supabase
    .from('goals')
    .select('id, name, target_date, goal_type, status')
    .eq('user_id', userId)
    .eq('goal_type', 'event');

  if (error || !goals?.length) {
    if (error) console.warn('[findGoalForCourse] goals query', error);
    return null;
  }

  // Include completed so historical courses (e.g. past-year race file) can link to the right goal.
  const eligible = goals.filter((g) =>
    ['active', 'paused', 'completed'].includes(String(g.status))
  ) as { id: string; name: string; target_date: string | null; status: string }[];

  const d = input.courseDate?.trim().slice(0, 10) || '';
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const onDate = eligible.filter(
      (g) => g.target_date && String(g.target_date).slice(0, 10) === d,
    );
    if (onDate.length === 1) return onDate[0];
    if (onDate.length > 1) {
      const m = pickBestNameMatch(input.courseName, onDate);
      if (m) return m;
    }
  }

  return pickBestNameMatch(input.courseName, eligible);
}
