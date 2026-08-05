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

const SYSTEM_PROMPT_UPCOMING = `You extract race details from an athlete's text and return ONLY valid JSON.

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

/** Past edition lookup — used by Arc wizard "prior comparable race" step */
const SYSTEM_PROMPT_PRIOR_FINISH = `You resolve ONE race the athlete already finished (historical). Return ONLY valid JSON:
{"races":[{"name":"...","distance":"...","date":"YYYY-MM-DD","priority":"A"}]}

Distance must be exactly one of: sprint, olympic, 70.3, ironman, marathon, half marathon, 5k, 10k

Rules:
- Use web search for authoritative schedules/results/listings for that named event.
- If the user's message specifies a calendar year for that finish, the returned date MUST fall in that year unless sources prove the event did not run that year — then omit date.
- If no year is specified, return the date of the most recent edition strictly BEFORE today's date (never a future or upcoming race date).
- Never substitute "next year's" or upcoming race dates when resolving a past finish.
- Use the full official event name when known.
- Return exactly one object in "races". Omit date only if you cannot verify from sources after search.`;

/**
 * ⛔ THE 2026 VARIANT, AND THE UPGRADE IS THE POINT — NOT HOUSEKEEPING (2026-08-04).
 *
 * `web_search_20250305` is the BASIC variant, documented as the one for models OLDER than
 * Sonnet 4.6 — this function was calling it on 4.6. `_20260209` adds **dynamic filtering**: Claude
 * writes and runs code to filter search results before they reach the context window.
 *
 * That is squarely this function's problem. Finding one official race date means sifting a lot of
 * near-miss listings — aggregator pages, last year's edition, a different race with the same city
 * in its name — and filtering them BEFORE they land in context is both cheaper and more accurate
 * than asking the model to ignore them after the fact.
 *
 * ⚠️ DO NOT ALSO DECLARE `code_execution` IN `tools`. The filtering runs code under the hood; a
 * second execution environment confuses the model. This one tool is the whole feature.
 */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
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

/**
 * ⛔ IT RETURNS A REASON, NOT A BARE `null` (2026-08-04).
 *
 * Two completely different failures — the API rejecting the request, and the model returning text
 * that will not parse — both used to collapse into `null`, and the wizard rendered both as
 * *"Couldn't find those races."* So a 400 from a stale model pin and a genuinely unfindable race
 * looked identical on screen, and the only way to tell them apart was to go read the function logs
 * in the dashboard. That cost real time on 2026-08-04.
 *
 * ⚠️ `reason` IS FOR US, NOT FOR THE ATHLETE. It rides in the response next to the empty array so
 * the failure names itself; the wizard still shows its own plain sentence. §0h: an absence is not a
 * result, and the caller must be able to tell which kind of absence it got.
 */
type SearchOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: string };

async function callWithWebSearch(
  apiKey: string,
  userText: string,
  today: string,
  systemPrompt: string,
): Promise<SearchOutcome> {
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
        // ⛔ THE `prompt-caching-2024-07-31` BETA HEADER IS GONE. Prompt caching went GA, so the
        // header did nothing — and neither did the `cache_control` block it was there to enable:
        // this system prompt is a few hundred tokens, far under the minimum cacheable prefix, so
        // it could never have produced a cache entry. Both removed rather than left as decoration.
      },
      body: JSON.stringify({
        // ⛔ THE MODEL PIN. Was `claude-sonnet-4-6` — still a live model, so this was never
        // 404ing; it was just quietly running a previous generation with no error to force the
        // edit. That is the whole failure mode of a pinned model string.
        model: 'claude-sonnet-5',
        system: [{ type: 'text', text: systemPrompt }],
        messages,
        // ⛔ RAISED 1024 → 4096, AND THIS IS A CONSEQUENCE OF THE MODEL BUMP, NOT A TWEAK.
        // Sonnet 5 runs ADAPTIVE THINKING BY DEFAULT when `thinking` is omitted; Sonnet 4.6 ran
        // without it. `max_tokens` caps thinking AND response text together, so the old 1024
        // would now be shared — and a truncated response means unparseable JSON, which this
        // function reports as "no races found" rather than as an error. Bumping the model without
        // bumping this would have shipped a silent empty-result bug.
        max_tokens: 4096,
        // ⛔ `temperature: 0` REMOVED — REQUIRED, not optional. Sampling parameters are rejected
        // on Sonnet 5 and the request 400s with them present. Determinism was the intent; the
        // strict JSON contract in the system prompt is what actually delivers it, and
        // `temperature: 0` never guaranteed identical output on any model anyway.
        //
        // ⚠️ `effort: 'low'` REPLACES IT AS THE COST LEVER. This is date extraction, not
        // reasoning — low effort keeps thinking shallow and latency down. Deliberately NOT
        // `thinking: {type: 'disabled'}`: with thinking off, Sonnet 5 is measurably less likely to
        // reach for tools, and this function is entirely dependent on it choosing to search.
        output_config: { effort: 'low' },
        tools: [WEB_SEARCH_TOOL],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`[extract-races] ${resp.status}: ${body.slice(0, 400)}`);
      // The status and the first line of the body travel with the failure — an HTTP rejection is
      // almost always a request-shape problem (model pin, tool version, a parameter the model no
      // longer accepts) and the body says which.
      return { ok: false, reason: `api_${resp.status}: ${body.slice(0, 160)}` };
    }

    data = await resp.json() as { content?: unknown; stop_reason?: string };
    console.log(`[extract-races] loop=${loops} stop_reason=${data.stop_reason}`);

    if (data.stop_reason === 'pause_turn' && data.content) {
      messages = [...messages, { role: 'assistant', content: data.content as unknown[] }];
      continue;
    }

    break;
  }

  if (!data?.content) return { ok: false, reason: 'no_content' };
  const text = extractText(data.content);
  console.log(`[extract-races] raw: ${text.slice(0, 300)}`);
  // ⚠️ `max_tokens` IS A NAMED SUSPECT HERE. A response cut off mid-JSON parses as nothing, and
  // that is indistinguishable from a race we could not find unless the stop reason is carried out.
  if (!text) {
    return { ok: false, reason: data.stop_reason === 'max_tokens' ? 'truncated_max_tokens' : 'empty_text' };
  }
  return { ok: true, text };
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
    const body = (await req.json().catch(() => ({}))) as { text?: string; prior_finish?: boolean };
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const priorFinish = body.prior_finish === true;
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
    const systemPrompt = priorFinish ? SYSTEM_PROMPT_PRIOR_FINISH : SYSTEM_PROMPT_UPCOMING;
    const outcome = await callWithWebSearch(apiKey, text, today, systemPrompt);

    if (!outcome.ok) {
      return new Response(JSON.stringify({ races: [], error: outcome.reason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const races = parseRaces(outcome.text);
    // ⛔ THE THIRD EMPTY-LIST PATH, NOW NAMED. Text came back and did not parse — malformed JSON,
    // or the model answered in prose despite the contract. Previously this returned a bare empty
    // array with NO error at all, which is why "the picker returns nothing" had three possible
    // causes and no way to tell them apart from the client.
    if (races.length === 0) {
      return new Response(JSON.stringify({ races: [], error: 'parse_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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
