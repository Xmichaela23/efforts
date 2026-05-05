import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { arcContextForFreshSetup, getArcContext } from '../_shared/arc-context.ts';
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
import {
  deriveOptimalWeekWithCoEqualRecovery,
  normalizeDayName,
  type WeekOptimizerInputs,
  type DayName,
} from '../_shared/week-optimizer.ts';

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
      /** Latest parsed `<arc_setup>` JSON from the client — reinjected into system prompt to limit drift */
      draft_arc_setup?: unknown;
      /** When true, use Opus (e.g. final structured pass). If omitted, Opus is used whenever `draft_arc_setup` is present. */
      is_closing_turn?: boolean;
      /** QA: omit saved schedule / snapshots from context; no draft lock-in */
      fresh_setup?: boolean;
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
    const freshSetup = body.fresh_setup === true;
    let arc = await getArcContext(supabase, userId, focusDateISO);
    if (freshSetup) arc = arcContextForFreshSetup(arc);

    const cacheRows = freshSetup ? [] : await loadWebSearchRaceCache(supabase, userId);
    const cacheSection = formatRaceCacheForSystemPrompt(cacheRows);

    const draftArcSetup =
      !freshSetup &&
      body.draft_arc_setup != null &&
      typeof body.draft_arc_setup === 'object' &&
      !Array.isArray(body.draft_arc_setup)
        ? body.draft_arc_setup
        : undefined;
    // ── Optimizer: fire as soon as draft has enough anchors to produce a useful
    // week. Accepts drafts WITHOUT preferred_days (intent + days_per_week alone is
    // enough — long days fall back to Sat/Sun) so AL can lean on optimizer output
    // even before it commits a fully-populated <arc_setup>.
    let optimizerOutput: string | undefined;
    try {
      const draft = draftArcSetup as Record<string, unknown> | undefined;
      const goals = Array.isArray(draft?.goals) ? draft!.goals as unknown[] : [];
      const tp = (goals[0] as Record<string, unknown> | undefined)?.training_prefs as Record<string, unknown> | undefined;
      const pd = (tp?.preferred_days as Record<string, unknown> | undefined) ?? {};
      const toDay = (v: unknown): DayName | undefined => {
        const s = typeof v === 'string' ? normalizeDayName(v) : undefined;
        return s as DayName | undefined;
      };
      const swimArr = Array.isArray(pd.swim) ? pd.swim as string[] : [];
      const strengthArr = Array.isArray(pd.strength) ? pd.strength as string[] : [];
      const daysPerWeek = typeof tp?.days_per_week === 'number' ? tp.days_per_week : 5;
      const trainingIntent = tp?.training_intent as WeekOptimizerInputs['athlete']['training_intent'] | undefined;
      const strengthIntent = tp?.strength_intent as WeekOptimizerInputs['athlete']['strength_intent'] | undefined;
      const swimIntentRaw = tp?.swim_intent ?? tp?.swimIntent;
      const swimIntent =
        swimIntentRaw === 'focus' || swimIntentRaw === 'race'
          ? (swimIntentRaw as WeekOptimizerInputs['athlete']['swim_intent'])
          : undefined;
      const strengthFreqRaw =
        (typeof tp?.strength_frequency === 'number' ? tp!.strength_frequency : undefined) ??
        (typeof (draft as Record<string, unknown> | undefined)?.strength_frequency === 'number'
          ? ((draft as Record<string, unknown>)!.strength_frequency as number)
          : undefined);
      const strengthFrequency = (typeof strengthFreqRaw === 'number'
        ? Math.max(0, Math.min(3, Math.round(strengthFreqRaw)))
        : strengthArr.length > 0
          ? Math.min(3, strengthArr.length)
          : (strengthIntent === 'performance' ? 2 : strengthIntent === 'support' ? 2 : 0)) as 0 | 1 | 2 | 3;
      const rawHardBikeAvoid = tp?.hard_bike_avoid_days ?? tp?.hardBikeAvoidDays;
      const hardBikeAvoidDays: DayName[] = Array.isArray(rawHardBikeAvoid)
        ? rawHardBikeAvoid
            .map((x) => normalizeDayName(x))
            .filter((d): d is DayName => d != null)
        : [];
      const qualityRunPref = toDay(pd.quality_run);
      const inputs: WeekOptimizerInputs = {
        anchors: {
          ...(toDay(pd.long_ride) ? { long_ride: toDay(pd.long_ride)! } : {}),
          ...(toDay(pd.long_run) ? { long_run: toDay(pd.long_run)! } : {}),
          ...(toDay(pd.quality_bike) ? { quality_bike: toDay(pd.quality_bike)! } : {}),
        },
        preferences: {
          swims_per_week: Math.min(3, swimArr.length) as 0 | 1 | 2 | 3,
          strength_frequency: strengthFrequency,
          training_days: Math.min(7, Math.max(4, daysPerWeek)) as 4 | 5 | 6 | 7,
          ...(hardBikeAvoidDays.length ? { hard_bike_avoid_days: hardBikeAvoidDays } : {}),
          ...(qualityRunPref ? { quality_run: qualityRunPref } : {}),
        },
        athlete: {
          ...(trainingIntent ? { training_intent: trainingIntent } : {}),
          ...(strengthIntent ? { strength_intent: strengthIntent } : {}),
          ...(swimIntent ? { swim_intent: swimIntent } : {}),
        },
      };
      // Fire when we have at least one anchor OR enough preference signal
      // (intent + days_per_week) to derive a defensible default week.
      const hasAnchors = Object.values(inputs.anchors ?? {}).some(v => v != null);
      const hasIntentSignal = !!trainingIntent || !!strengthIntent || strengthFrequency > 0 || swimArr.length > 0;
      if (hasAnchors || hasIntentSignal) {
        const { week: result } = deriveOptimalWeekWithCoEqualRecovery(inputs);
        const lines: string[] = [];
        const ALL_DAYS: DayName[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
        for (const day of ALL_DAYS) {
          const slots = result.days[day];
          if (slots && slots.length > 0) {
            const parts = slots.map(s => `${s.kind} [${s.fatigue}]${s.note ? ` — ${s.note}` : ''}`);
            lines.push(`  ${day}: ${parts.join(' + ')}`);
          } else if (!result.rest_days.includes(day)) {
            lines.push(`  ${day}: rest`);
          }
        }
        if (result.rest_days.length) lines.push(`  rest days: ${result.rest_days.join(', ')}`);
        if (result.trade_offs.length) lines.push(`  trade-offs: ${result.trade_offs.join('; ')}`);
        if (result.conflicts.length) lines.push(`  CONFLICTS: ${result.conflicts.join('; ')}`);
        if (result.can_offer_third_strength) {
          lines.push(
            '  THIRD_STRENGTH_AVAILABLE: yes (performance + co-equal 2× week is clean; a third lift fits without displacing quality sessions — see STRENGTH FREQUENCY UPSELL).',
          );
        }
        optimizerOutput = lines.join('\n');
      }
    } catch (e) {
      console.warn('[arc-setup-chat] optimizer skipped:', e instanceof Error ? e.message : String(e));
    }

    const system = buildArcSetupSystemPrompt(arc, {
      raceCacheSection: cacheSection,
      ...(draftArcSetup ? { draftArcSetup } : {}),
      ...(freshSetup ? { freshSetup: true } : {}),
      ...(optimizerOutput ? { optimizerOutput } : {}),
    });

    const isClosingTurn =
      body.is_closing_turn === false
        ? false
        : body.is_closing_turn === true || Boolean(draftArcSetup);

    const { text, lastContent, lastUsage, lastStopReason, lastErrorBody } = await callClaudeArcSetupConversation({
      system,
      messages: messages as ConversationMessage[],
      maxTokens: 4096,
      temperature: 0.4,
      isClosingTurn,
    });

    if (text == null) {
      const stopReason = lastStopReason ?? 'unknown';
      const errorBody = lastErrorBody ?? '';
      console.error(`[arc-setup-chat] model returned null text. stop_reason=${stopReason} body=${errorBody}`);
      return new Response(
        JSON.stringify({
          error: `Model unavailable (stop_reason: ${stopReason}). ${errorBody ? errorBody.slice(0, 200) : 'Check logs.'}`,
        }),
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
