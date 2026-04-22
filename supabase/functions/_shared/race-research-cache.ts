type Supabase = { from: (t: string) => any };

export type RaceResearchRow = {
  id: string;
  name: string;
  race_date: string | null;
  course_data: Record<string, unknown>;
  source: string;
  updated_at: string | null;
};

/**
 * Load prior web_search cache rows for this user so the model can avoid redundant searches.
 */
export async function loadWebSearchRaceCache(supabase: Supabase, userId: string): Promise<RaceResearchRow[]> {
  const { data, error } = await supabase
    .from('race_courses')
    .select('id, name, race_date, course_data, source, updated_at')
    .eq('user_id', userId)
    .eq('source', 'web_search')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(25);
  if (error) {
    console.warn('[race-research-cache] load', error.message);
    return [];
  }
  return (data ?? []) as RaceResearchRow[];
}

export function formatRaceCacheForSystemPrompt(rows: RaceResearchRow[]): string {
  if (!rows.length) return '';
  const brief = rows.map((r) => ({
    name: r.name,
    race_date: r.race_date,
    research: r.course_data,
  }));
  return `## CACHED RACE RESEARCH (already stored for this athlete — web_search)
The following was retrieved in a prior session. If the athlete is discussing one of these events, **use this instead of searching again** unless they ask for updated or fresher info. Do not announce that you are using a cache.
${JSON.stringify(brief, null, 2)}
`.trim();
}

function deriveRaceNameFromQueries(queries: string[]): string {
  const q = queries.find((s) => s.trim().length > 0);
  if (q) return q.trim().slice(0, 200);
  return 'Race research';
}

/**
 * Insert or update a research-only row (no GPX). Uses geometry placeholders.
 */
export async function upsertWebSearchResearchRow(
  supabase: Supabase,
  userId: string,
  params: {
    name: string;
    raceDate: string | null;
    courseData: Record<string, unknown>;
  }
): Promise<void> {
  const name = params.name.trim().slice(0, 200) || 'Race research';
  const { data: existing } = await supabase
    .from('race_courses')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'web_search')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  const row = {
    user_id: userId,
    goal_id: null,
    name,
    source: 'web_search',
    source_id: null,
    distance_m: 0,
    elevation_gain_m: 0,
    elevation_loss_m: 0,
    polyline: null,
    elevation_profile: [] as unknown[],
    race_date: params.raceDate,
    course_data: params.courseData,
    strategy_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from('race_courses').update(row).eq('id', existing.id);
    if (error) console.warn('[race-research-cache] update', error.message);
    return;
  }
  const { error } = await supabase.from('race_courses').insert([row]);
  if (error) console.warn('[race-research-cache] insert', error.message);
}

export function buildCourseDataFromSearch(
  lastUser: string,
  queries: string[],
  results: { url?: string; title?: string; page_age?: string }[],
  assistantText: string
): Record<string, unknown> {
  return {
    source: 'web_search',
    summary_user_message_excerpt: lastUser.slice(0, 2000),
    search_queries: queries,
    result_links: results
      .filter((r) => r.title && r.url)
      .slice(0, 12)
      .map((r) => ({ title: r.title, url: r.url, page_age: r.page_age })),
    notes:
      'Structured fields (bike elevation, swim type, run course, weather) should be reasoned in prose by the coach; raw hits are in result_links.',
    assistant_reply_excerpt: assistantText.slice(0, 3000),
  };
}

export { deriveRaceNameFromQueries };
