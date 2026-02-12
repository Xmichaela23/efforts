import type { FactPacketV1, FlagV1 } from './types.ts';

type OpenAIChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

function pickTopFlags(flags: FlagV1[]): FlagV1[] {
  const arr = Array.isArray(flags) ? flags : [];
  return [...arr]
    .filter((f) => f && typeof f.priority === 'number' && Number.isFinite(f.priority))
    .sort((a, b) => (a.priority - b.priority))
    .filter((f) => f.priority <= 2)
    .slice(0, 6);
}

export async function generateAISummaryV1(
  factPacket: FactPacketV1,
  flags: FlagV1[]
): Promise<string | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;

  const topFlags = pickTopFlags(flags);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts.

RULES:
- Write 3-5 sentences as ONE paragraph (no bullets, no headers).
- Lead with the most important insight (see TOP FLAGS).
- Explain WHY things happened, not just WHAT happened.
- Use specific numbers from the packet (e.g., "12 bpm drift", not "moderate drift").
- If the workout was intended to be easy/recovery but was run too fast, call out the training cost (recovery integrity) directly.
- Tone: direct, confident, knowledgeable coach. Not cheerleading.
- FORBIDDEN: "Great job", "Keep it up", motivational filler.
- Never say "I".
- Never calculate; only use numbers in the packet/flags.
- Never show raw field names (no snake_case).

TOP FLAGS (lead with these):
${topFlags.map((f) => `[${f.type}] ${f.message}`).join('\n')}

FACT PACKET:
${JSON.stringify(factPacket)}

Write the summary now.`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert endurance coach. Output must be a single paragraph (3-5 sentences). No bullets. No headers.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 260,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI API error: ${resp.status} - ${txt}`);
    }

    const data = (await resp.json()) as OpenAIChatResponse;
    const content = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!content) return null;

    // Ensure single paragraph output (remove extra blank lines).
    const normalized = content
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ');

    return normalized || null;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}

