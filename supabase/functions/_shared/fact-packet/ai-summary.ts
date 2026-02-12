import type { FactPacketV1, FlagV1 } from './types.ts';
import { coerceNumber, secondsToPaceString } from './utils.ts';

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

function fmtMi(mi: number | null | undefined): string | null {
  const v = coerceNumber(mi);
  if (v == null || !(v > 0)) return null;
  const dp = v < 1 ? 2 : 1;
  return `${v.toFixed(dp)} mi`;
}

function fmtMin(min: number | null | undefined): string | null {
  const v = coerceNumber(min);
  if (v == null || !(v > 0)) return null;
  return `${Math.round(v)} min`;
}

function fmtBpm(bpm: number | null | undefined): string | null {
  const v = coerceNumber(bpm);
  if (v == null || !(v > 0)) return null;
  return `${Math.round(v)} bpm`;
}

function fmtDeltaSecPerMi(delta: number | null | undefined): string | null {
  const v = coerceNumber(delta);
  if (v == null || !Number.isFinite(v) || v === 0) return v === 0 ? '0s/mi' : null;
  const abs = Math.round(Math.abs(v));
  const dir = v < 0 ? 'faster' : 'slower';
  return `${abs}s/mi ${dir}`;
}

function toDisplayFormatV1(packet: FactPacketV1, flags: FlagV1[]) {
  const facts = packet?.facts as any;
  const derived = packet?.derived as any;
  const segments = Array.isArray(facts?.segments) ? facts.segments : [];

  const displaySegments = segments.slice(0, 24).map((s: any) => {
    const pace = secondsToPaceString(coerceNumber(s?.pace_sec_per_mi));
    const target = secondsToPaceString(coerceNumber(s?.target_pace_sec_per_mi));
    const dev = fmtDeltaSecPerMi(coerceNumber(s?.pace_deviation_sec));
    return {
      name: String(s?.name || ''),
      distance: fmtMi(coerceNumber(s?.distance_mi)),
      pace,
      target_pace: target,
      pace_deviation: dev,
      avg_hr: fmtBpm(coerceNumber(s?.avg_hr)),
      max_hr: fmtBpm(coerceNumber(s?.max_hr)),
      hr_zone: typeof s?.hr_zone === 'string' ? s.hr_zone : null,
    };
  });

  const topFlags = pickTopFlags(flags).map((f) => ({
    type: f.type,
    message: f.message,
    priority: f.priority,
  }));

  return {
    version: 1,
    generated_at: packet.generated_at,
    top_flags: topFlags,
    workout: {
      type: String(facts?.workout_type || ''),
      distance: fmtMi(coerceNumber(facts?.total_distance_mi)),
      duration: fmtMin(coerceNumber(facts?.total_duration_min)),
      avg_pace: secondsToPaceString(coerceNumber(facts?.avg_pace_sec_per_mi)),
      avg_hr: fmtBpm(coerceNumber(facts?.avg_hr)),
      max_hr: fmtBpm(coerceNumber(facts?.max_hr)),
      elevation_gain: (coerceNumber(facts?.elevation_gain_ft) != null) ? `${Math.round(Number(facts.elevation_gain_ft))} ft` : null,
      terrain: typeof facts?.terrain_type === 'string' ? facts.terrain_type : null,
    },
    plan: facts?.plan
      ? {
          name: String(facts.plan?.name || ''),
          week_number: typeof facts.plan?.week_number === 'number' ? facts.plan.week_number : null,
          phase: typeof facts.plan?.phase === 'string' ? facts.plan.phase : null,
          workout_purpose: typeof facts.plan?.workout_purpose === 'string' ? facts.plan.workout_purpose : null,
          week_intent: typeof facts.plan?.week_intent === 'string' ? facts.plan.week_intent : null,
          is_recovery_week: typeof facts.plan?.is_recovery_week === 'boolean' ? facts.plan.is_recovery_week : null,
        }
      : null,
    conditions: facts?.weather
      ? {
          temperature: `${Math.round(Number(facts.weather.temperature_f))}°F`,
          humidity: `${Math.round(Number(facts.weather.humidity_pct))}%`,
          dew_point: `${Math.round(Number(facts.weather.dew_point_f))}°F`,
          heat_stress_level: facts.weather.heat_stress_level,
          wind: facts.weather.wind_mph != null ? `${Math.round(Number(facts.weather.wind_mph))} mph` : null,
          conditions: facts.weather.conditions ?? null,
          source: facts.weather.source ?? null,
        }
      : null,
    signals: {
      hr_drift: (coerceNumber(derived?.hr_drift_bpm) != null) ? `${Math.round(Number(derived.hr_drift_bpm))} bpm` : null,
      hr_drift_typical: (coerceNumber(derived?.hr_drift_typical) != null) ? `${Math.round(Number(derived.hr_drift_typical))} bpm` : null,
      cardiac_decoupling: (coerceNumber(derived?.cardiac_decoupling_pct) != null) ? `${Math.round(Number(derived.cardiac_decoupling_pct))}%` : null,
      pace_fade: (coerceNumber(derived?.pace_fade_pct) != null) ? `${Math.round(Number(derived.pace_fade_pct))}%` : null,
      training_load: derived?.training_load
        ? {
            previous_day_workload: coerceNumber(derived.training_load.previous_day_workload) ?? 0,
            consecutive_training_days: coerceNumber(derived.training_load.consecutive_training_days) ?? 0,
            cumulative_fatigue: derived.training_load.cumulative_fatigue ?? null,
            fatigue_evidence: Array.isArray(derived.training_load.fatigue_evidence) ? derived.training_load.fatigue_evidence.slice(0, 4) : [],
          }
        : null,
      comparisons: derived?.comparisons
        ? {
            vs_similar: {
              assessment: derived.comparisons?.vs_similar?.assessment ?? null,
              sample_size: derived.comparisons?.vs_similar?.sample_size ?? 0,
              pace_delta: fmtDeltaSecPerMi(coerceNumber(derived.comparisons?.vs_similar?.pace_delta_sec)),
              hr_delta: (coerceNumber(derived.comparisons?.vs_similar?.hr_delta_bpm) != null) ? `${Math.round(Number(derived.comparisons.vs_similar.hr_delta_bpm))} bpm` : null,
              drift_delta: (coerceNumber(derived.comparisons?.vs_similar?.drift_delta_bpm) != null) ? `${Math.round(Number(derived.comparisons.vs_similar.drift_delta_bpm))} bpm` : null,
            },
            trend: {
              direction: derived.comparisons?.trend?.direction ?? null,
              magnitude: derived.comparisons?.trend?.magnitude ?? null,
              data_points: derived.comparisons?.trend?.data_points ?? 0,
            },
            achievements: Array.isArray(derived.comparisons?.achievements)
              ? derived.comparisons.achievements.slice(0, 2).map((a: any) => String(a?.description || '')).filter(Boolean)
              : [],
          }
        : null,
      stimulus: derived?.stimulus
        ? {
            achieved: !!derived.stimulus.achieved,
            confidence: derived.stimulus.confidence ?? null,
            evidence: Array.isArray(derived.stimulus.evidence) ? derived.stimulus.evidence.slice(0, 3) : [],
            partial_credit: derived.stimulus.partial_credit ?? null,
          }
        : null,
      limiter: derived?.primary_limiter
        ? {
            limiter: derived.primary_limiter.limiter ?? null,
            confidence: (coerceNumber(derived.primary_limiter.confidence) != null) ? Math.round(Number(derived.primary_limiter.confidence) * 100) : null,
            evidence: Array.isArray(derived.primary_limiter.evidence) ? derived.primary_limiter.evidence.slice(0, 3) : [],
          }
        : null,
    },
    segments: displaySegments,
  };
}

export async function generateAISummaryV1(
  factPacket: FactPacketV1,
  flags: FlagV1[]
): Promise<string | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;

  const displayPacket = toDisplayFormatV1(factPacket, flags);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.

RULES:
- Output ONE paragraph, 3-5 sentences. No bullets. No headers.
- Lead with the most important insight (see TOP FLAGS).
- Be specific and grounded: reference 2-4 concrete details (pace, HR, drift/decoupling, conditions, fatigue, plan intent) ONLY when they explain the outcome.
- No filler. Avoid generic phrases like "indicating", "effective endurance training", "attention should be paid", "ensure", "focus on", "in future workouts".
- Never say "I".
- Never calculate.
- CRITICAL: NEVER output pace as raw seconds. Use the provided display strings like "10:16/mi". If a pace is missing, omit it.
- Never show raw field names (no snake_case).

TOP FLAGS (lead with these):
${(displayPacket as any).top_flags.map((f: any) => `[${f.type}] ${f.message}`).join('\n')}

DISPLAY PACKET (already formatted; use these strings verbatim):
${JSON.stringify(displayPacket, null, 2)}

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

