import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getArcContext } from '../_shared/arc-context.ts';
import { buildArcSetupSystemPrompt } from '../_shared/arc-setup-prompt.ts';
import type { ConversationMessage } from '../_shared/llm.ts';
import {
  callClaudeArcSetupConversation,
  extractWebSearchTrace,
  lastUserText,
  tryExtractIsoDate,
} from '../_shared/llm-arc-setup.ts';
import {
  buildCourseDataFromSearch,
  deriveRaceNameFromQueries,
  loadWebSearchRaceCache,
  formatRaceCacheForSystemPrompt,
  upsertWebSearchResearchRow,
} from '../_shared/race-research-cache.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
};

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
    const body = (await req.json().catch(() => ({}))) as {
      user_id?: string;
      messages?: ConversationMessage[];
      focus_date?: string;
    };
    const userId = body.user_id;
    if (!userId || typeof userId !== 'string') {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const raw = body.focus_date;
    const focusDateISO =
      typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length < 1) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    for (const m of messages) {
      if (m.role !== 'user' && m.role !== 'assistant') {
        return new Response(JSON.stringify({ error: 'invalid message role' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    if (messages[0].role !== 'user') {
      return new Response(JSON.stringify({ error: 'first message must be user' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const arc = await getArcContext(supabase, userId, focusDateISO);

    const cacheRows = await loadWebSearchRaceCache(supabase, userId);
    const cacheSection = formatRaceCacheForSystemPrompt(cacheRows);

    const system = buildArcSetupSystemPrompt(arc, { raceCacheSection: cacheSection });

    const { text, lastContent, lastUsage } = await callClaudeArcSetupConversation({
      system,
      messages: messages as ConversationMessage[],
      maxTokens: 4096,
      temperature: 0.4,
    });

    if (text == null) {
      return new Response(
        JSON.stringify({ error: 'Model unavailable. Check ANTHROPIC_API_KEY, web search enablement, and logs.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nSearch = (lastUsage as { server_tool_use?: { web_search_requests?: number } } | undefined)?.server_tool_use
      ?.web_search_requests;
    const trace = extractWebSearchTrace(lastContent);
    if ((nSearch != null && nSearch > 0) || trace.queries.length > 0) {
      const lastUser = lastUserText(messages as ConversationMessage[]);
      const { queries, results } = trace;
      const courseData = buildCourseDataFromSearch(lastUser, queries, results, text);
      const raceName = deriveRaceNameFromQueries(queries);
      const fromUser = tryExtractIsoDate(lastUser) || tryExtractIsoDate(messages.map((m) => m.content).join('\n'));
      await upsertWebSearchResearchRow(supabase, userId, {
        name: raceName,
        raceDate: fromUser,
        courseData,
      });
    }

    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[arc-setup-chat]', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
