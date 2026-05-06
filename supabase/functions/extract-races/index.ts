/**
 * extract-races — single-purpose race extraction with web search.
 *
 * Uses the exact same API call shape as callClaudeArcSetupConversation
 * (prompt-caching beta header, system as content array, pause_turn loop).
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

const SYSTEM_PROMPT = `You extract race details from an athlete's text and return ONLY valid JSON.

Return this exact structure — no other text, no markdown fences:
{"races":[{"name":"...","distance":"...","date":"YYYY-MM-DD","priority":"A"}]}

Distance must be exactly one of: sprint, olympic, 70.3, ironman, marathon, half marathon, 5k, 10k

Rules:
- Use web search to find the exact date for each named race
- If year is not stated, assume the next upcoming occurrence
- Priority: two races → later date = A, earlier = B; one race → always A
- Honour explicit priority ("A race", "tune-up", "B race")
- Include the race even if you cannot find the date — just omit the date field
- Use the full official event name (e.g. "IRONMAN 70.3 Santa Cruz" not "Santa Cruz iron man")
- Return races sorted by date ascending`;

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

type ContentBlock = { type: string; text?: string };

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as ContentBlock[])
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('')
    .trim();
}

async function callWithWebSearch(apiKey: string, userText: string, today: string): Promise<string | null> {
  let messages: { role: 'user' | 'assistant'; content: string | unknown[] }[] = [
    { role: 'user', content: `Today is ${today}.\n\n${userText}` },
  ];

  let data: { content?: unknown; stop_reason?: string } | null = null;
  let loops = 0;

  while (loops < 8) {
    loops++;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
        max_tokens: 1024,
        temperature: 0,
        tools: [WEB_SEARCH_TOOL],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[extract-races] ${resp.status}: ${body.slice(0, 400)}`);
      return null;
    }

    data = await resp.json() as { content?: unknown; stop_reason?: string };
    console.log(`[extract-races] loop=${loops} stop_reason=${data.stop_reason}`);

    if (data.stop_reason === 'pause_turn' && data.content) {
      messages = [...messages, { role: 'assistant', content: data.content as unknown[] }];
      continue;
    }

    break;
  }

  if (!data?.content) return null;
  const text = extractText(data.content);
  console.log(`[extract-races] raw: ${text.slice(0, 300)}`);
  return text || null;
}

function parseRaces(raw: string): { name: string; distance: string; date?: string; priority: 'A' | 'B' }[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
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
    console.error(`[extract-races] parse error: ${e}. raw: ${raw.slice(0, 300)}`);
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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LLM not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const raw = await callWithWebSearch(apiKey, text, today);

    if (!raw) {
      return new Response(JSON.stringify({ races: [], error: 'No LLM response' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const races = parseRaces(raw);
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
