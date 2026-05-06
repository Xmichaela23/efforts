/**
 * extract-races — single-purpose race extraction.
 *
 * Input:  { text: string }
 * Output: { races: ExtractedRace[] }
 *
 * Uses callLLM (same shared helper as everywhere else) — no web search tools,
 * no continuation loop, no beta headers. Model knows most major race dates
 * from training data; anything it can't date the user fills in on confirm cards.
 */
import { callLLM } from '../_shared/llm.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

const SYSTEM_PROMPT = `You extract race details from an athlete's text. Return ONLY valid JSON — no explanation, no markdown fences.

Return this exact structure:
{"races":[{"name":"...","distance":"...","date":"YYYY-MM-DD","priority":"A"}]}

Distance must be exactly one of: sprint, olympic, 70.3, ironman, marathon, half marathon, 5k, 10k

Rules:
- Use your knowledge of real race calendars to find the next upcoming date for named events
- If the year is not stated, use the next upcoming occurrence (today is ${new Date().toISOString().slice(0, 10)})
- Priority: if two races, the later date = A, earlier date = B; if one race, always A
- If priority is explicitly stated ("A race", "tune-up", "B race"), honour it
- If you genuinely cannot determine a date, omit the date field — do not guess
- name should be the full official event name where known
- Return races sorted by date ascending`;

function parseRaces(raw: string): { name: string; distance: string; date?: string; priority: 'A' | 'B' }[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed.races) ? parsed.races : Array.isArray(parsed) ? parsed : [];
    return arr
      .filter((r: unknown) => r && typeof r === 'object')
      .map((r: Record<string, unknown>) => ({
        name: typeof r.name === 'string' ? r.name.trim() : 'Race',
        distance: typeof r.distance === 'string' ? r.distance.trim().toLowerCase() : '70.3',
        date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : undefined,
        priority: r.priority === 'B' ? 'B' : 'A',
      }));
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const raw = await callLLM({
      model: 'sonnet',
      system: SYSTEM_PROMPT,
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
    return new Response(JSON.stringify({ races }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
