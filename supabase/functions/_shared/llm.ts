/**
 * Shared LLM helper — Anthropic Claude
 *
 * All edge functions that need LLM completions should import callLLM()
 * from here. Centralises the model choice, auth, and response parsing
 * so a model swap is one-line change.
 *
 * Usage:
 *   import { callLLM } from '../_shared/llm.ts';
 *   const text = await callLLM({ system: '...', user: '...', maxTokens: 300 });
 */

export type LLMOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Override model — defaults to COACH_MODEL (haiku). Pass 'sonnet' for higher quality. */
  model?: 'haiku' | 'sonnet' | string;
};

// Model aliases — update here to roll all functions forward at once
const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
} as const;

const DEFAULT_MODEL: keyof typeof MODELS = 'haiku';

/**
 * Call Anthropic Claude and return the text response, or null on failure.
 * Never throws — logs warnings and returns null so callers can degrade gracefully.
 */
export async function callLLM(opts: LLMOptions): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.warn('[llm] ANTHROPIC_API_KEY not set — skipping LLM call');
    return null;
  }

  const modelId =
    opts.model === 'haiku' || opts.model === 'sonnet'
      ? MODELS[opts.model]
      : (opts.model ?? MODELS[DEFAULT_MODEL]);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
        max_tokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[llm] Anthropic non-ok: ${resp.status} ${resp.statusText} — ${body.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    const text = String(data?.content?.[0]?.text || '').trim();
    return text || null;
  } catch (e: any) {
    console.warn('[llm] Anthropic call failed:', e?.message || e);
    return null;
  }
}

export type ConversationMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Multi-turn chat. `messages` must be non-empty and start with a `user` turn (Claude API rule).
 */
export async function callClaudeConversation(opts: {
  system: string;
  messages: ConversationMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: 'haiku' | 'sonnet' | string;
}): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.warn('[llm] ANTHROPIC_API_KEY not set — skipping conversation call');
    return null;
  }
  if (!Array.isArray(opts.messages) || opts.messages.length < 1) {
    console.warn('[llm] callClaudeConversation: messages must be non-empty');
    return null;
  }
  if (opts.messages[0].role !== 'user') {
    console.warn('[llm] callClaudeConversation: first message must be user');
    return null;
  }

  const modelId =
    opts.model === 'haiku' || opts.model === 'sonnet'
      ? MODELS[opts.model]
      : (opts.model ?? MODELS[DEFAULT_MODEL]);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        system: opts.system,
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.4,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[llm] Anthropic (conversation) non-ok: ${resp.status} — ${body.slice(0, 200)}`);
      return null;
    }
    const data = await resp.json();
    const text = String(data?.content?.[0]?.text || '').trim();
    return text || null;
  } catch (e: any) {
    console.warn('[llm] callClaudeConversation failed:', e?.message || e);
    return null;
  }
}
