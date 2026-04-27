/**
 * Arc setup: **Sonnet** for most interview turns, **Opus** when the client signals the
 * “structured output / draft iteration” pass (e.g. `draft_arc_setup` echo). Optional Anthropic
 * web search, including pause_turn continuation.
 */
import { MODELS, type ConversationMessage } from './llm.ts';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search' as const,
  max_uses: 5,
};

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (b && typeof b === 'object' && (b as { type?: string }).type === 'text' && typeof (b as { text?: string }).text === 'string') {
      parts.push((b as { text: string }).text);
    }
  }
  return parts.join('').trim();
}

export function extractWebSearchTrace(content: unknown): {
  queries: string[];
  results: { url?: string; title?: string; page_age?: string }[];
} {
  const queries: string[] = [];
  const results: { url?: string; title?: string; page_age?: string }[] = [];
  if (!Array.isArray(content)) return { queries, results };
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    const o = b as {
      type?: string;
      name?: string;
      input?: { query?: string };
      content?: unknown;
    };
    if (o.type === 'server_tool_use' && o.name === 'web_search' && o.input && typeof o.input.query === 'string') {
      queries.push(o.input.query);
    }
    if (o.type === 'web_search_tool_result' && Array.isArray(o.content)) {
      for (const c of o.content) {
        if (c && typeof c === 'object' && (c as { type?: string }).type === 'web_search_result') {
          const r = c as { url?: string; title?: string; page_age?: string };
          results.push({ url: r.url, title: r.title, page_age: r.page_age });
        }
        if (c && typeof c === 'object' && (c as { type?: string }).type === 'web_search_tool_result_error') {
          results.push({ title: 'search_error' });
        }
      }
    }
  }
  return { queries, results };
}

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | unknown[] };

function messagesToApiShape(thread: ConversationMessage[]): AnthropicMessage[] {
  return thread.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Web search + optional pause_turn loop. Returns visible text for the app (all text blocks concatenated).
 */
export async function callClaudeArcSetupConversation(opts: {
  system: string;
  messages: ConversationMessage[];
  maxTokens?: number;
  temperature?: number;
  /**
   * When true, use Opus (final / high-stakes structured output). When false, Sonnet.
   * Caller typically sets this when the UI echoes a parsed `<arc_setup>` draft.
   */
  isClosingTurn?: boolean;
}): Promise<{
  text: string | null;
  hadWebSearchTool: boolean;
  lastContent: unknown;
  lastStopReason: string | null;
  lastUsage: unknown;
}> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.warn('[llm-arc-setup] ANTHROPIC_API_KEY not set');
    return { text: null, hadWebSearchTool: false, lastContent: null, lastStopReason: null, lastUsage: null };
  }
  if (!opts.messages.length || opts.messages[0].role !== 'user') {
    console.warn('[llm-arc-setup] first message must be user');
    return { text: null, hadWebSearchTool: false, lastContent: null, lastStopReason: null, lastUsage: null };
  }

  const model = opts.isClosingTurn ? MODELS.opus : MODELS.sonnet;

  let workingMessages: AnthropicMessage[] = messagesToApiShape(opts.messages);
  let data: {
    content?: unknown;
    stop_reason?: string;
    usage?: { server_tool_use?: { web_search_requests?: number } };
  } | null = null;
  let loops = 0;
  const maxLoops = 8;

  let retries = 0;
  const maxRetries = 2;

  while (loops < maxLoops) {
    loops += 1;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: opts.system,
        messages: workingMessages,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.4,
        tools: [WEB_SEARCH_TOOL],
      }),
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.warn(`[llm-arc-setup] non-ok: ${resp.status} — ${errBody.slice(0, 400)}`);
      // Retry on transient errors (429 rate-limit, 5xx service errors) up to maxRetries times.
      if ((resp.status === 429 || resp.status >= 500) && retries < maxRetries) {
        retries += 1;
        const backoffMs = retries * 1500;
        console.warn(`[llm-arc-setup] retrying in ${backoffMs}ms (attempt ${retries}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, backoffMs));
        loops -= 1; // don't count retry against maxLoops
        continue;
      }
      return { text: null, hadWebSearchTool: false, lastContent: null, lastStopReason: String(resp.status), lastUsage: null };
    }
    retries = 0; // reset on success
    data = (await resp.json()) as {
      content?: unknown;
      stop_reason?: string;
      usage?: { server_tool_use?: { web_search_requests?: number } };
    };
    const reason = data.stop_reason || '';
    if (reason === 'pause_turn' && data.content) {
      workingMessages = [...workingMessages, { role: 'assistant', content: data.content as unknown[] }];
      continue;
    }
    break;
  }

  if (!data?.content) {
    return { text: null, hadWebSearchTool: false, lastContent: null, lastStopReason: data?.stop_reason ?? null, lastUsage: data?.usage };
  }
  const text = extractTextFromContent(data.content);
  const nReq = data.usage?.server_tool_use?.web_search_requests ?? 0;
  const hadTool = nReq > 0 || JSON.stringify(data.content).includes('web_search');
  return {
    text: text || null,
    hadWebSearchTool: hadTool,
    lastContent: data.content,
    lastStopReason: data.stop_reason ?? null,
    lastUsage: data.usage,
  };
}

export function lastUserText(messages: ConversationMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

/** YYYY-MM-DD in a string, or null */
export function tryExtractIsoDate(s: string): string | null {
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}
