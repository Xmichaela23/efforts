import type { CyclingFactPacketV1, CyclingFlagV1 } from './types.ts';

function normalizeParagraph(s: string): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Strip wrapping quotes/brackets if model returns them.
  return t.replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
}

function extractNumericTokens(text: string): string[] {
  // Capture numbers, percentages, watts, bpm, IF-like decimals, and durations.
  const s = String(text || '');
  const tokens = s.match(/(\d+(?:\.\d+)?)(?:\s*(?:w|watts|bpm|min|mi|%))?/gi) || [];
  return tokens.map((t) => t.toLowerCase().replace(/\s+/g, ' ').trim());
}

function validateNoNewNumbers(summary: string, displayPacket: string): { ok: boolean; reason?: string } {
  const allow = new Set(extractNumericTokens(displayPacket));
  const seen = extractNumericTokens(summary);
  for (const tok of seen) {
    if (!allow.has(tok)) {
      return { ok: false, reason: `Summary introduced numeric token not in packet: "${tok}"` };
    }
  }
  return { ok: true };
}

function toDisplayPacket(fp: CyclingFactPacketV1, flags: CyclingFlagV1[]): any {
  const f = fp.facts;
  const d = fp.derived;
  const tl = (d as any)?.training_load || null;
  const plan = (d as any)?.plan_context || null;
  const trainingLoad = (() => {
    if (!tl || typeof tl !== 'object') return null;
    const weekPct = (tl as any).week_load_pct;
    const acwr = (tl as any).acwr_ratio;
    const streak = (tl as any).consecutive_training_days;
    return {
      week_load_pct: (typeof weekPct === 'number' && Number.isFinite(weekPct)) ? `${Math.round(weekPct)}%` : null,
      acwr_ratio: (typeof acwr === 'number' && Number.isFinite(acwr)) ? `${Math.round(acwr * 100) / 100}` : null,
      acwr_status: (typeof (tl as any).acwr_status === 'string') ? String((tl as any).acwr_status) : null,
      consecutive_training_days: (typeof streak === 'number' && Number.isFinite(streak)) ? `${Math.round(streak)} days` : null,
      cumulative_fatigue: (typeof (tl as any).cumulative_fatigue === 'string') ? String((tl as any).cumulative_fatigue) : null,
      fatigue_evidence: Array.isArray((tl as any).fatigue_evidence) ? (tl as any).fatigue_evidence.slice(0, 3) : null,
    };
  })();
  return {
    discipline: 'ride',
    classified_type: f.classified_type,
    plan_intent: f.plan_intent,
    duration: f.total_duration_min != null ? `${Math.round(f.total_duration_min)} min` : null,
    distance: f.total_distance_mi != null ? `${f.total_distance_mi.toFixed(1)} mi` : null,
    power: {
      avg: f.avg_power_w != null ? `${Math.round(f.avg_power_w)} W` : null,
      np: f.normalized_power_w != null ? `${Math.round(f.normalized_power_w)} W` : null,
      if: f.intensity_factor != null ? `${f.intensity_factor.toFixed(2)}` : null,
      vi: f.variability_index != null ? `${f.variability_index.toFixed(2)}` : null,
      ftp: f.ftp_w != null ? `${Math.round(f.ftp_w)} W` : null,
      bins_min: d.ftp_bins,
    },
    hr: {
      avg: f.avg_hr != null ? `${Math.round(f.avg_hr)} bpm` : null,
      max: f.max_hr != null ? `${Math.round(f.max_hr)} bpm` : null,
    },
    executed_intensity: d.executed_intensity,
    confidence: d.confidence,
    ftp_quality: d.ftp_quality,
    plan,
    training_load: trainingLoad,
    top_flags: (Array.isArray(flags) ? flags : [])
      .slice()
      .sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99))
      .slice(0, 3)
      .map((x) => ({ type: x.type, category: x.category, message: x.message, priority: x.priority })),
  };
}

export async function generateCyclingAISummaryV1(
  factPacket: CyclingFactPacketV1,
  flags: CyclingFlagV1[]
): Promise<string | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;

  const display = toDisplayPacket(factPacket, flags);
  const packetStr = JSON.stringify(display, null, 2);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.

RULES:
- Output ONE paragraph.
- Be specific and grounded: reference 2-4 concrete details from the packet ONLY when they explain the outcome.
- No filler. Avoid generic phrases like "effective", "overall", "moving forward", "ensure".
- CRITICAL: Do not introduce any numbers, percentages, or time-in-zone claims that are not present verbatim in the packet.
- If there is no planned intent, do not pretend there was a prescription; describe what the ride was physiologically.
- Prefer the TOP FLAGS as the framing.
- If plan.week_number is present, explicitly anchor where the athlete is in the plan (week number, phase/week_intent) before giving advice.
- If plan_intent is null but plan.week_number is present, treat this as an unplanned session during a plan: include one sentence on impact using training_load, and suggest a concrete adjustment for upcoming training without adding new numbers.

PACKET (authoritative; do not compute outside it):
${packetStr}
`;

  const attempt = async (extraSystem: string | null): Promise<string | null> => {
    const messages = [
      { role: 'system', content: extraSystem ? extraSystem : 'You are a precise endurance coach. Follow the rules exactly.' },
      { role: 'user', content: prompt },
    ];
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        max_tokens: 220,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' ? normalizeParagraph(text) : null;
  };

  // 2 attempts with numeric-token validation.
  const s1 = await attempt(null);
  if (s1) {
    const v = validateNoNewNumbers(s1, packetStr);
    if (v.ok) return s1;
    const s2 = await attempt(`Your previous output violated this rule: ${v.reason}. Rewrite with ONLY numbers appearing in the packet.`);
    if (s2) {
      const v2 = validateNoNewNumbers(s2, packetStr);
      if (v2.ok) return s2;
    }
  }

  return null;
}

