import type { FactPacketV1, FlagV1 } from './types.ts';
import { coerceNumber, secondsToPaceString } from './utils.ts';

type OpenAIChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
};

function normalizeParagraph(text: string): string {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function extractNumericTokens(text: string): string[] {
  const s = String(text || '');
  const out = new Set<string>();
  // Pace tokens like 10:16/mi
  for (const m of s.matchAll(/\b\d{1,2}:\d{2}\/mi\b/g)) out.add(m[0]);
  // Percent tokens
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?%\b/g)) out.add(m[0]);
  // Plain numbers (integers/decimals). We keep them as they appear.
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?\b/g)) out.add(m[0]);
  return Array.from(out);
}

function validateNoNewNumbers(summary: string, displayPacket: any): { ok: boolean; bad: string[] } {
  const displayStr = JSON.stringify(displayPacket, null, 2);
  const tokens = extractNumericTokens(summary);
  const bad: string[] = [];
  for (const t of tokens) {
    // Ignore tokens that are trivially common and non-meaningful.
    if (t === '1') continue; // version numbers etc
    if (!displayStr.includes(t)) bad.push(t);
  }
  return { ok: bad.length === 0, bad };
}

function validateNoGenericFiller(summary: string): { ok: boolean; why?: string } {
  const s = String(summary || '').toLowerCase();
  if (!s) return { ok: true };
  const banned = [
    'indicating',
    'should be monitored',
    'monitor closely',
    'manage fatigue effectively',
    'facilitate recovery',
    'overall,',
    'overall ',
    'consistent pacing strategy',
    'likely accumulation of fatigue',
    'consider adjusting upcoming sessions',
    'attention should be paid',
  ];
  const hit = banned.find((p) => s.includes(p));
  return hit ? { ok: false, why: `Generic filler phrase: "${hit}"` } : { ok: true };
}

function validateNoZoneTimeClaims(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const s = String(summary || '').toLowerCase();
  // We do not currently provide time-in-zone / % in zone in the display packet.
  // Reject any language that implies it.
  const mentionsZoneTime =
    /time spent/.test(s) ||
    /percent of the time/.test(s) ||
    /% of the time/.test(s) ||
    /target (aerobic )?heart rate range/.test(s) ||
    /target hr zone/.test(s) ||
    /time in (the )?target/.test(s);
  if (!mentionsZoneTime) return { ok: true, why: null };
  const displayStr = JSON.stringify(displayPacket, null, 2).toLowerCase();
  const hasAnyZoneTimeMetric = displayStr.includes('time_in_zone') || displayStr.includes('time in zone');
  return { ok: hasAnyZoneTimeMetric, why: hasAnyZoneTimeMetric ? null : 'time-in-zone claim not supported by display packet' };
}

function countSentences(text: string): number {
  const s = normalizeParagraph(text);
  if (!s) return 0;
  // naive sentence split; good enough for enforcing caps
  const parts = s.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean);
  return parts.length;
}

function countWords(text: string): number {
  const s = normalizeParagraph(text);
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function getTopFlags(displayPacket: any): Array<{ type: string; message: string; priority: number }> {
  const arr = Array.isArray(displayPacket?.top_flags) ? displayPacket.top_flags : [];
  return arr
    .filter((f: any) => f && typeof f.message === 'string')
    .map((f: any) => ({ type: String(f.type || ''), message: String(f.message || ''), priority: Number(f.priority || 99) }));
}

function validateAdaptiveLength(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const top = getTopFlags(displayPacket);
  const hasConcern = top.some((f) => f.type === 'concern' && f.priority <= 2);
  const sentences = countSentences(summary);
  const words = countWords(summary);
  // If nothing concerning at top priority, keep it short and sharp.
  if (!hasConcern) {
    if (sentences > 3) return { ok: false, why: `too many sentences (${sentences}) for low-signal workout` };
    if (words > 55) return { ok: false, why: `too many words (${words}) for low-signal workout` };
  }
  return { ok: true, why: null };
}

function validateTerrainExplainsDrift(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const top = getTopFlags(displayPacket);
  const hasTerrainDriftFlag = top.some((f) => /drift/i.test(f.message) && /hilly terrain/i.test(f.message));
  if (!hasTerrainDriftFlag) return { ok: true, why: null };

  const s = normalizeParagraph(summary).toLowerCase();
  const mentionsDrift = /\bdrift\b/.test(s);
  if (!mentionsDrift) return { ok: false, why: 'terrain-drift flag present but summary did not mention drift' };

  const connects = /terrain-driven|driven by the (hills|terrain)|consistent with (the )?hills|consistent with (the )?terrain|hill-driven/.test(s);
  if (!connects) return { ok: false, why: 'drift mentioned without explicitly attributing it to terrain' };

  // Disallow framing drift as a negative signal when the terrain-explains flag exists.
  const negativePhrases = /despite.*drift|drift.*suggests|drift.*increase in effort|elevated drift/.test(s);
  if (negativePhrases) return { ok: false, why: 'drift framed as effort/fatigue signal despite terrain-drift flag' };

  return { ok: true, why: null };
}

async function callOpenAIParagraph(openaiKey: string, prompt: string, temperature: number): Promise<string | null> {
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
      temperature,
      max_tokens: 260,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} - ${txt}`);
  }
  const data = (await resp.json()) as OpenAIChatResponse;
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  const normalized = normalizeParagraph(content);
  return normalized || null;
}

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
    // Plan: exclude plan name/race identifiers to prevent the LLM from inventing race-specific context.
    plan: facts?.plan
      ? {
          week_number: typeof facts.plan?.week_number === 'number' ? facts.plan.week_number : null,
          phase: typeof facts.plan?.phase === 'string' ? facts.plan.phase : null,
          workout_purpose: typeof facts.plan?.workout_purpose === 'string' ? facts.plan.workout_purpose : null,
          week_intent: typeof facts.plan?.week_intent === 'string' ? facts.plan.week_intent : null,
          is_recovery_week: typeof facts.plan?.is_recovery_week === 'boolean' ? facts.plan.is_recovery_week : null,
        }
      : null,
    // Conditions: only include when heat stress is a factor (spec: hide weather when "nothing to report").
    conditions: (() => {
      const wx = facts?.weather;
      const level = String(wx?.heat_stress_level || '');
      if (!wx) return null;
      if (level !== 'moderate' && level !== 'severe') return null;
      return {
        dew_point: `${Math.round(Number(wx.dew_point_f))}°F`,
        heat_stress_level: wx.heat_stress_level,
        temperature: `${Math.round(Number(wx.temperature_f))}°F`,
        humidity: `${Math.round(Number(wx.humidity_pct))}%`,
        wind: wx.wind_mph != null ? `${Math.round(Number(wx.wind_mph))} mph` : null,
      };
    })(),
    signals: {
      execution: derived?.execution
        ? {
            distance_deviation: (coerceNumber(derived.execution.distance_deviation_pct) != null)
              ? `${Math.round(Number(derived.execution.distance_deviation_pct))}%`
              : null,
            intentional_deviation: !!derived.execution.intentional_deviation,
            assessed_against: (derived.execution.assessed_against === 'actual') ? 'actual' : 'plan',
            note: typeof derived.execution.note === 'string' ? derived.execution.note : null,
          }
        : null,
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
  flags: FlagV1[],
  coachingContext?: string | null,
): Promise<string | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return null;

  const displayPacket = toDisplayFormatV1(factPacket, flags);

  const prompt = `You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.
${coachingContext ? `\n${coachingContext}\n` : ''}
RULES:
- Output ONE paragraph. Sentence count must match signal:
  - If TOP FLAGS contain no priority≤2 concerns: 2–3 sentences max.
  - If there is a priority≤2 concern: 3–5 sentences max.
- Lead with the most important insight (see TOP FLAGS).
- Be specific and grounded: reference 2-4 concrete details (pace, HR, drift/decoupling, conditions, fatigue, plan intent) ONLY when they explain the outcome.
- No filler. Avoid generic phrases like "indicating", "effective endurance training", "attention should be paid", "ensure", "focus on", "in future workouts".
- FORBIDDEN phrasing: "successfully", "excellent", "resilience", "confidence", "crucial", "reinforcing confidence", "effective management", "overall", "aligns well", "recovery-integrity cost".
- Never say "I".
- Never calculate.
- CRITICAL: NEVER output pace as raw seconds. Use the provided display strings like "10:16/mi". If a pace is missing, omit it.
- CRITICAL: Do not introduce ANY proper nouns (races, cities, events) unless they appear verbatim in DISPLAY PACKET.
- CRITICAL: Do not introduce ANY numbers or percentages that are not present verbatim in DISPLAY PACKET.
- If DISPLAY PACKET signals.execution.assessed_against is "actual", do NOT frame this as adherence failure. Acknowledge the plan modification briefly, then evaluate how the body handled the actual session using pace fade, drift/decoupling, terrain/conditions, and training load. Note downstream impact in one sentence (e.g., recovery priority elevated) without moralizing.
- If plan intent is recovery/easy and TOP FLAGS include a pacing concern, lead with the recovery-integrity cost (don’t call it “achieved recovery”).
- Do not call it an "interval session" unless DISPLAY PACKET workout.type explicitly indicates intervals/tempo/track repeats.
- If TOP FLAGS include a message that HR drift is consistent with hilly terrain, explicitly connect drift→terrain in ONE sentence and do not treat drift as a fatigue/effort signal.
- Never show raw field names (no snake_case).

TOP FLAGS (lead with these):
${(displayPacket as any).top_flags.map((f: any) => `[${f.type}] ${f.message}`).join('\n')}

DISPLAY PACKET (already formatted; use these strings verbatim):
${JSON.stringify(displayPacket, null, 2)}

Write the summary now.`;

  try {
    // Attempt 1: normal generation
    const s1 = await callOpenAIParagraph(openaiKey, prompt, 0.2);
    if (!s1) return null;
    const v1 = validateNoNewNumbers(s1, displayPacket);
    const z1 = validateNoZoneTimeClaims(s1, displayPacket);
    const len1 = validateAdaptiveLength(s1, displayPacket);
    const td1 = validateTerrainExplainsDrift(s1, displayPacket);
    const g1 = validateNoGenericFiller(s1);
    if (v1.ok && z1.ok && len1.ok && td1.ok && g1.ok) return s1;

    // Attempt 2: corrective retry with explicit violations + temp=0
    const corrective = `${prompt}\n\nYou violated constraints.\n- Bad numeric tokens not present in DISPLAY PACKET: ${v1.bad.join(', ') || '(none)'}\n- Zone/time claim violation: ${z1.why || '(none)'}\n- Length violation: ${len1.why || '(none)'}\n- Terrain/drift connection violation: ${td1.why || '(none)'}\n- Coach voice violation: ${g1.why || '(none)'}\nRewrite the paragraph and REMOVE any unsupported claims and any token not present verbatim in DISPLAY PACKET. Do not mention time-in-zone or \"% of time\" unless explicitly provided. Keep it short when there is nothing concerning.`;
    const s2 = await callOpenAIParagraph(openaiKey, corrective, 0);
    if (!s2) return null;
    const v2 = validateNoNewNumbers(s2, displayPacket);
    const z2 = validateNoZoneTimeClaims(s2, displayPacket);
    const len2 = validateAdaptiveLength(s2, displayPacket);
    const td2 = validateTerrainExplainsDrift(s2, displayPacket);
    const g2 = validateNoGenericFiller(s2);
    return (v2.ok && z2.ok && len2.ok && td2.ok && g2.ok) ? s2 : null;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}

