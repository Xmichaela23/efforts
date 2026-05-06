/**
 * extract-races — single-purpose race extraction.
 *
 * Input:  { text: string }
 * Output: { races: ExtractedRace[] }
 */
import { callLLM } from '../_shared/llm.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

const makePrompt = (today: string) => `You are a triathlon and running race calendar expert. Extract race details and return ONLY valid JSON.

Today is ${today}. The athlete likely means the next upcoming occurrence of each race.

Return this exact structure — no other text, no markdown fences:
{"races":[{"name":"...","distance":"...","date":"YYYY-MM-DD","priority":"A"}]}

Distance must be exactly one of: sprint, olympic, 70.3, ironman, marathon, half marathon, 5k, 10k

Rules:
- Use your knowledge of real race calendars to provide the date for each event
- IRONMAN and 70.3 events have fixed annual dates — use the ${new Date(today).getFullYear()} date if it's in the future, otherwise ${new Date(today).getFullYear() + 1}
- Well-known examples: IRONMAN 70.3 Santa Cruz is typically in September; IRONMAN 70.3 Redding is typically in April/May; IRONMAN Lake Placid is July; IRONMAN World Championship is October
- If you have moderate confidence in a date, include it — the athlete can correct it on the confirmation screen
- Priority: two races → later date = A, earlier = B; one race → always A
- Honour explicit priority ("A race", "tune-up", "B race")
- Use the full official event name (e.g. "IRONMAN 70.3 Santa Cruz" not just "Santa Cruz")
- Return races sorted by date ascending`;


function parseRaces(raw: string): { name: string; distance: string; date?: string; priority: 'A' | 'B' }[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Find first '{' in case model prefixed anything
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    const parsed = JSON.parse(slice);
    const arr = Array.isArray(parsed.races) ? parsed.races : Array.isArray(parsed) ? parsed : [];
    return arr
      .filter((r: unknown) => r && typeof r === 'object')
      .map((r: Record<string, unknown>) => ({
        name: typeof r.name === 'string' ? r.name.trim() : 'Race',
        distance: typeof r.distance === 'string' ? r.distance.trim().toLowerCase() : '70.3',
        date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined,
        priority: r.priority === 'B' ? 'B' : 'A',
      }));
  } catch (e) {
    console.error(`[extract-races] parse failed: ${e}. Raw: ${raw.slice(0, 200)}`);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const raw = await callLLM({
      model: 'sonnet',
      system: makePrompt(today),
      user: text,
      maxTokens: 512,
      temperature: 0,
    });

    if (!raw) {
      return new Response(JSON.stringify({ races: [], error: 'LLM unavailable' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const races = parseRaces(raw);
    console.log(`[extract-races] raw="${raw.slice(0, 200)}" races=${races.length}`);
    return new Response(JSON.stringify({ races }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[extract-races] unhandled: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
