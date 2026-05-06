/**
 * extract-races — single-purpose race extraction.
 *
 * Input:  { text: string }   — athlete's natural-language race description
 * Output: { races: ExtractedRace[] }
 *
 * Uses Anthropic web search to confirm race dates when needed.
 * No arc context, no conversation history, no state machine.
 */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

const SYSTEM_PROMPT = `You extract race details from an athlete's text and return ONLY valid JSON.

Return this exact structure with no other text, no markdown fences, no explanation:
{"races":[{"name":"...","distance":"...","date":"YYYY-MM-DD","priority":"A"}]}

Distance must be exactly one of: sprint, olympic, 70.3, ironman, marathon, half marathon, 5k, 10k

Rules:
- Use web search to confirm the exact race date when the athlete names a specific event (search "<event name> <year> date")
- If the year is not stated, assume the next upcoming occurrence of the event
- Priority: if two races, the later date = A, earlier date = B; if one race, always A
- If priority is explicitly stated (e.g. "A race", "tune-up", "B race"), honour it
- If a date cannot be found after searching, omit the date field entirely (do not guess)
- name should be the full official event name if you can find it, otherwise use what the athlete said
- Return the races array sorted by date ascending`;

type AnthropicContent = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown[];
};

type AnthropicResponse = {
  content: AnthropicContent[];
  stop_reason: string | null;
  usage?: unknown;
};

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 4,
};

async function callWithWebSearch(apiKey: string, userText: string, today: string): Promise<string | null> {
  const messages: { role: 'user' | 'assistant'; content: string | unknown[] }[] = [
    { role: 'user', content: `Today is ${today}.\n\n${userText}` },
  ];

  let iterations = 0;
  const MAX_ITER = 6;

  while (iterations < MAX_ITER) {
    iterations++;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system: SYSTEM_PROMPT,
        messages,
        max_tokens: 1024,
        temperature: 0,
        tools: [WEB_SEARCH_TOOL],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[extract-races] Anthropic ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }

    const data: AnthropicResponse = await resp.json();

    // Collect all text blocks from this response
    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string);

    if (data.stop_reason === 'end_turn') {
      return textBlocks.join('').trim() || null;
    }

    if (data.stop_reason === 'pause_turn') {
      // Model used web search — append assistant content and continue
      messages.push({ role: 'assistant', content: data.content });
      // Add a continuation user turn as required by the API
      messages.push({ role: 'user', content: 'Continue.' });
      continue;
    }

    // Any other stop reason (tool_use that isn't web search, max_tokens, etc.)
    // — try to extract text from what we have
    if (textBlocks.length > 0) {
      return textBlocks.join('').trim();
    }

    break;
  }

  return null;
}

function parseRaces(raw: string): { name: string; distance: string; date?: string; priority: 'A' | 'B' }[] {
  // Strip any markdown fences just in case
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LLM not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const raw = await callWithWebSearch(apiKey, text, today);

    if (!raw) {
      return new Response(JSON.stringify({ races: [], error: 'Could not extract races' }), {
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
