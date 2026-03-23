import type { FactPacketV1, FlagV1 } from './types.ts';
import { coerceNumber, secondsToPaceString } from './utils.ts';
import { callLLM } from '../llm.ts';

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
  for (const m of s.matchAll(/\b\d{1,2}:\d{2}\/mi\b/g)) out.add(m[0]);
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?%\b/g)) out.add(m[0]);
  for (const m of s.matchAll(/\b\d+(?:\.\d+)?\b/g)) out.add(m[0]);
  return Array.from(out);
}

function validateNoNewNumbers(summary: string, displayPacket: any): { ok: boolean; bad: string[] } {
  const displayStr = JSON.stringify(displayPacket, null, 2);
  const tokens = extractNumericTokens(summary);
  const bad: string[] = [];
  for (const t of tokens) {
    if (t === '1') continue;
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
    'be mindful of',
    'prioritize recovery to support',
    'in future workouts',
  ];
  const hit = banned.find((p) => s.includes(p));
  return hit ? { ok: false, why: `Generic filler phrase: "${hit}"` } : { ok: true };
}

function validateNoZoneTimeClaims(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const s = String(summary || '').toLowerCase();
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
  if (!hasConcern) {
    if (sentences > 4) return { ok: false, why: `too many sentences (${sentences}) for low-signal workout` };
    if (words > 80) return { ok: false, why: `too many words (${words}) for low-signal workout` };
  }
  if (sentences > 6) return { ok: false, why: `too many sentences (${sentences})` };
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

  const negativePhrases = /despite.*drift|drift.*suggests|drift.*increase in effort|elevated drift/.test(s);
  if (negativePhrases) return { ok: false, why: 'drift framed as effort/fatigue signal despite terrain-drift flag' };

  return { ok: true, why: null };
}

async function callLLMParagraph(prompt: string, temperature: number): Promise<string | null> {
  const text = await callLLM({
    system: 'You are an expert endurance coach. Output must be a single paragraph (2-5 sentences). No bullets. No headers. No generic advice.',
    user: prompt,
    temperature,
    maxTokens: 300,
  });
  return text ? normalizeParagraph(text) : null;
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
      avg_gap: facts?.gap_adjusted ? secondsToPaceString(coerceNumber(facts?.avg_gap_sec_per_mi)) : null,
      avg_hr: fmtBpm(coerceNumber(facts?.avg_hr)),
      max_hr: fmtBpm(coerceNumber(facts?.max_hr)),
      elevation_gain: (coerceNumber(facts?.elevation_gain_ft) != null) ? `${Math.round(Number(facts.elevation_gain_ft))} ft` : null,
      terrain: typeof facts?.terrain_type === 'string' ? facts.terrain_type : null,
    },
    plan: facts?.plan
      ? {
          week_number: typeof facts.plan?.week_number === 'number' ? facts.plan.week_number : null,
          phase: typeof facts.plan?.phase === 'string' ? facts.plan.phase : null,
          workout_purpose: typeof facts.plan?.workout_purpose === 'string' ? facts.plan.workout_purpose : null,
          week_intent: typeof facts.plan?.week_intent === 'string' ? facts.plan.week_intent : null,
          is_recovery_week: typeof facts.plan?.is_recovery_week === 'boolean' ? facts.plan.is_recovery_week : null,
        }
      : null,
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
      interval_execution: derived?.interval_execution
        ? {
            execution_score: typeof derived.interval_execution.execution_score === 'number' ? `${Math.round(derived.interval_execution.execution_score)}%` : null,
            pace_adherence: typeof derived.interval_execution.pace_adherence === 'number' ? `${Math.round(derived.interval_execution.pace_adherence)}%` : null,
            pace_adherence_note: derived?.interval_execution?.gap_adjusted ? 'grade-adjusted (GAP)' : null,
            completed_steps: (typeof derived.interval_execution.completed_steps === 'number' && typeof derived.interval_execution.total_steps === 'number')
              ? `${derived.interval_execution.completed_steps}/${derived.interval_execution.total_steps}`
              : null,
          }
        : null,
      limiter: derived?.primary_limiter
        ? {
            limiter: derived.primary_limiter.limiter ?? null,
            confidence: (coerceNumber(derived.primary_limiter.confidence) != null) ? Math.round(Number(derived.primary_limiter.confidence) * 100) : null,
            evidence: Array.isArray(derived.primary_limiter.evidence) ? derived.primary_limiter.evidence.slice(0, 3) : [],
          }
        : null,
      terrain: derived?.terrain_context
        ? {
            terrain_class: typeof derived.terrain_context.terrain_class === 'string' ? derived.terrain_context.terrain_class : null,
            segment_matches: coerceNumber(derived.terrain_context.segment_matches) ?? 0,
            segment_insight_eligible: !!derived.terrain_context.segment_insight_eligible,
            segment_trend_eligible: !!derived.terrain_context.segment_trend_eligible,
            segment_comparisons: Array.isArray(derived.terrain_context.segment_comparisons)
              ? derived.terrain_context.segment_comparisons.slice(0, 5).map((c: any) => ({
                  type: c.segment_type,
                  distance_m: c.distance_m,
                  grade_pct: c.avg_grade_pct,
                  times_seen: c.times_seen,
                  today_pace: secondsToPaceString(c.today_pace_s_per_mi),
                  avg_pace: secondsToPaceString(c.avg_pace_s_per_mi),
                  pace_delta: c.pace_delta_s,
                  today_hr: c.today_hr ? `${c.today_hr} bpm` : null,
                  avg_hr: c.avg_hr ? `${c.avg_hr} bpm` : null,
                  hr_delta: c.hr_delta,
                }))
              : [],
            route: derived.terrain_context.route_runs
              ? {
                  name: derived.terrain_context.route_runs.name,
                  times_run: derived.terrain_context.route_runs.times_run,
                }
              : null,
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
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return null;

  const displayPacket = toDisplayFormatV1(factPacket, flags);

  const hasIntervalExecution = !!(displayPacket as any)?.signals?.interval_execution?.execution_score;
  const hasRoute = !!(displayPacket as any)?.signals?.terrain?.route;
  const hasSegmentComparisons = ((displayPacket as any)?.signals?.terrain?.segment_comparisons?.length ?? 0) > 0;

  const priorityRules: string[] = [];
  if (hasIntervalExecution) {
    priorityRules.push('  1. INTERVAL EXECUTION (MANDATORY LEAD): signals.interval_execution exists. Your FIRST sentence MUST reference the execution score, completed steps, and actual per-rep paces from the summary. This is the headline.');
  } else {
    priorityRules.push('  1. Lead with the most important insight from TOP FLAGS.');
  }
  if (hasRoute) {
    priorityRules.push('  2. ROUTE CONTEXT: signals.terrain.route exists. Weave in route familiarity naturally (e.g. "on a familiar route" or reference the run count).');
  }
  if (hasSegmentComparisons) {
    priorityRules.push('  3. SEGMENT COMPARISONS: Use the ACTUAL pace_delta and hr_delta values on familiar terrain segments.');
  }
  priorityRules.push(`  ${hasIntervalExecution ? '4' : '2'}. TOP FLAGS: address concerns (ACWR, drift, fatigue) as secondary context, not the headline. One sentence max for load/fatigue.`);

  const prompt = [
    'You write workout summaries for experienced athletes. You receive pre-calculated facts and must translate them into coaching prose.',
    coachingContext ? '\n' + coachingContext + '\n' : '',
    'RULES:',
    '- Output ONE paragraph, 2-5 sentences.',
    '- PRIORITY ORDER for what to lead with:',
    ...priorityRules,
    '- Be specific: reference concrete numbers from the DISPLAY PACKET (execution score, per-rep paces, HR, drift, terrain class, plan week/phase).',
    '- No filler. No generic advice.',
    '- FORBIDDEN: "successfully", "excellent", "resilience", "confidence", "crucial", "reinforcing", "effective management", "overall", "aligns well", "recovery-integrity cost", "prioritize recovery to support", "be mindful of", "attention should be paid", "ensure", "focus on", "in future workouts".',
    '- Never say "I". Never calculate. Never show raw field names.',
    '- CRITICAL: NEVER output pace as raw seconds. Use display strings like "10:16/mi".',
    '- CRITICAL: Do not introduce ANY numbers/percentages not present verbatim in DISPLAY PACKET.',
    '- CRITICAL: Do not introduce ANY proper nouns unless they appear verbatim in DISPLAY PACKET.',
    '- If execution.assessed_against is "actual", do NOT frame as adherence failure.',
    '- If plan intent is recovery/easy and TOP FLAGS include a pacing concern, lead with the recovery-integrity cost.',
    '- If TOP FLAGS mention HR drift consistent with hilly terrain, connect drift to terrain and do not treat it as fatigue.',
    '- Terrain: MAY include segment insight only when segment_insight_eligible is true. MAY mention trends only when segment_trend_eligible is true.',
    '- GAP: If workout.avg_gap is present, adherence was scored on Grade-Adjusted Pace (effort-adjusted for elevation). Mention both actual pace and GAP when discussing pace (e.g. "averaged 11:04/mi (10:32 GAP)"). Explain hills slowed raw pace but effort was on target when GAP adherence is good.',
    '',
    'TOP FLAGS:',
    (displayPacket as any).top_flags.map((f: any) => '[' + f.type + '] ' + f.message).join('\n'),
    '',
    'DISPLAY PACKET:',
    JSON.stringify(displayPacket, null, 2),
    '',
    'Write the summary now.',
  ].join('\n');

  try {
    const s1 = await callLLMParagraph(prompt, 0.2);
    if (!s1) { console.warn('[ai-summary] attempt 1 returned empty'); return null; }
    const v1 = validateNoNewNumbers(s1, displayPacket);
    const z1 = validateNoZoneTimeClaims(s1, displayPacket);
    const len1 = validateAdaptiveLength(s1, displayPacket);
    const td1 = validateTerrainExplainsDrift(s1, displayPacket);
    const g1 = validateNoGenericFiller(s1);
    if (v1.ok && z1.ok && len1.ok && td1.ok && g1.ok) return s1;
    console.warn('[ai-summary] attempt 1 rejected:', JSON.stringify({ num: v1.ok, bad: v1.bad, zone: z1.why, len: len1.why, td: td1.why, filler: g1.why }));

    const corrections = [
      v1.bad.length ? 'Bad numeric tokens: ' + v1.bad.join(', ') : null,
      z1.why, len1.why, td1.why, g1.why,
    ].filter(Boolean);
    const corrective = prompt + '\n\nYou violated constraints:\n' + corrections.map(c => '- ' + c).join('\n') + '\nRewrite and fix.';
    const s2 = await callLLMParagraph(corrective, 0);
    if (!s2) { console.warn('[ai-summary] attempt 2 returned empty'); return null; }
    const v2 = validateNoNewNumbers(s2, displayPacket);
    const z2 = validateNoZoneTimeClaims(s2, displayPacket);
    const len2 = validateAdaptiveLength(s2, displayPacket);
    const td2 = validateTerrainExplainsDrift(s2, displayPacket);
    const g2 = validateNoGenericFiller(s2);
    if (v2.ok && z2.ok && len2.ok && td2.ok && g2.ok) return s2;
    console.warn('[ai-summary] attempt 2 also rejected, returning anyway');
    return s2;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}
