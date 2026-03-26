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
    'nailed',
    'crushed',
    'is real',
    'trust the process',
    "you've got this",
    'stay patient',
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

function countClauses(text: string): number {
  const s = normalizeParagraph(text);
  if (!s) return 0;
  return s.split(/[.!?;]|—/).map((p) => p.trim()).filter((p) => p.length > 15).length;
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
  const clauses = countClauses(summary);
  const words = countWords(summary);
  if (!hasConcern) {
    if (sentences > 3) return { ok: false, why: `too many sentences (${sentences}) for low-signal workout` };
    if (clauses > 4) return { ok: false, why: `too many clauses (${clauses}) for low-signal workout` };
    if (words > 50) return { ok: false, why: `too many words (${words}) for low-signal workout` };
  }
  if (sentences > 3) return { ok: false, why: `too many sentences (${sentences})` };
  if (clauses > 5) return { ok: false, why: `too many clauses (${clauses})` };
  if (words > 65) return { ok: false, why: `too many words (${words})` };
  return { ok: true, why: null };
}

/** Block invented or implausible prior-session stories (strength / leg causality). */
function validatePriorSessionAttribution(summary: string, userMessage: string): { ok: boolean; why: string | null } {
  const s = String(summary || '');
  const u = String(userMessage || '');
  const marker = 'RECENT SESSIONS BEFORE THIS WORKOUT:';
  const idx = u.indexOf(marker);
  const recentBlock = idx >= 0 ? u.slice(idx, idx + 8000) : '';
  const hasStrengthSession = /—\s*strength\b/i.test(recentBlock);
  const noneLine = /RECENT SESSIONS BEFORE THIS WORKOUT:\s*\(none/i.test(recentBlock);

  const impliesPriorStrength =
    /\b(strength\s+(work|session|training|day)|leg\s+day|lower\s+body\s+strength)\b/i.test(s) ||
    /\byesterday[^\n.]{0,80}\b(strength|lift)/i.test(s) ||
    /\b(strength|lifting)[^\n.]{0,40}\byesterday\b/i.test(s) ||
    /\bfrom\s+yesterday[^\n.]{0,60}strength/i.test(s);

  if ((impliesPriorStrength && !hasStrengthSession) || (impliesPriorStrength && noneLine)) {
    return {
      ok: false,
      why:
        'attributed load/fatigue to a prior strength session but RECENT SESSIONS does not list strength — describe only neutral load-model residual or omit',
    };
  }

  const legLocal =
    /\b(quad|calf|calves|hamstring|hamstrings|glute|glutes)\b/i.test(s);

  // LLM workaround: local leg/hip muscles + upper-body cause is never valid here.
  if (legLocal && /\bupper[- ]body\b/i.test(s)) {
    return {
      ok: false,
      why:
        'never tie quad/calf/hamstring/glutes to upper-body training — omit named muscles or speak only about terrain/GAP/strides/easy effort',
    };
  }

  // Local leg/hip muscles + strength: only if logged leg/posterior strength volume exists.
  const strengthCausal = /\b(strength|lifting|leg\s+day)\b/i.test(s);
  if (legLocal && strengthCausal) {
    const lines = recentBlock.split('\n');
    const legStrengthLines = lines.filter((line) => /\[leg_relevant_strength:\s*yes\]/i.test(line));
    if (legStrengthLines.length === 0) {
      return {
        ok: false,
        why:
          'linked leg muscle residual to strength but no RECENT SESSIONS strength line has [leg_relevant_strength: yes] (logged session was upper-body dominant)',
      };
    }
    if (/\byesterday\b/i.test(s)) {
      const hit = legStrengthLines.some((line) => /yesterday/i.test(line));
      if (!hit) {
        return {
          ok: false,
          why:
            'mentioned yesterday and tied leg muscles to strength but yesterday’s logged strength is not leg/posterior-dominant per [leg_relevant_strength: yes]',
        };
      }
    }
  }

  return { ok: true, why: null };
}

/** LLM workaround: "glutes … from 36 hours ago" — clock times are not athlete-visible muscle timelines. */
function validateMuscleClockClaims(summary: string): { ok: boolean; why: string | null } {
  const s = String(summary || '');
  const legNamed =
    /\b(glute|glutes|quad|calf|calves|hamstring|hamstrings|hip\s+flexors?)\b/i.test(s);
  const clockCausal =
    /\b\d{1,3}\s*hours?\s+ago\b/i.test(s) ||
    /\b\d{1,3}\s*h\s+ago\b/i.test(s) ||
    /\b\d{1,2}\s*days?\s+ago\b/i.test(s) ||
    /\b(a|one|two|three)\s+days?\s+ago\b/i.test(s);
  if (legNamed && clockCausal) {
    return {
      ok: false,
      why:
        'do not tie named leg/hip muscles to hours/days-ago timelines — not in the data; use terrain, GAP, easy intent, strides only',
    };
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

  const negativePhrases = /despite.*drift|drift.*suggests|drift.*increase in effort|elevated drift/.test(s);
  if (negativePhrases) return { ok: false, why: 'drift framed as effort/fatigue signal despite terrain-drift flag' };

  return { ok: true, why: null };
}

const COACHING_SYSTEM_PROMPT = `You are an experienced endurance coach reviewing a completed workout. Your athlete can already see their pace, HR, distance, and duration — do not restate those numbers unless you're connecting them to an insight.

Write 2-3 sentences (4 maximum if there is a genuine concern). Prioritize ruthlessly — pick the 2-3 most useful insights and cut the rest. This is a mobile screen; the athlete glances, not reads. Draw from the data provided but speak like a coach, not a dashboard.

RULES:
- THE CORE TEST: Before writing any sentence, ask "Could the athlete figure this out by looking at the pace/HR/distance numbers and adherence chips above?" If yes, cut it. Only say things the athlete cannot see for themselves.
- NEVER start with a restatement of distance/time/pace. The athlete already sees those.
- NEVER restate execution percentages, pace adherence, or duration adherence — these are displayed as chips above the narrative.
- NEVER describe the workout the athlete just did ("You ran 13 miles at 11:04 pace"). They were there.
- Connect data across domains: if terrain was hilly AND pace was "slow", say the pace was appropriate for the terrain — don't report them as separate facts.
- When grade-adjusted pace (GAP) is available, translate it: "Your 11:04 pace was a 10:32 effort on this terrain — the hills cost about 30s/mi."
- When similar workout comparisons exist, lead with the trend: "You're X faster/slower than your last N similar efforts" is more valuable than any single-workout metric.
- When HR drift data exists, interpret it in context: drift on a hilly course means something different than drift on a flat course.
- STRUCTURED INTERVALS: If the workout has multiple planned work/recovery segments, HR differences between segments are expected (pace targets change). Do not describe that as "cardiac drift" or cite a single bpm drift figure unless the data explicitly says steady-state drift for the main work block.
- TRAINING STREAK: Use the provided streak day count, combined load, session mix (e.g. 3× run, 1× strength), and yesterday's athletic focus **only when those fields appear in the user message**. All modalities count as training; interpret fatigue with context — upper-body strength is mostly systemic/neural load for a run, not leg glycogen depletion. Do not invent a different day count than the structured fields.
- LOAD CONTEXT MUSCULAR RESIDUALS: Quad/calf/hamstring/**glute** numbers are **aggregated internal load estimates** (runs and posterior-chain work in the model both contribute). They are **not** a log of what the athlete did on a given day. **Never** tie them to bench/rows/OHP/pull-ups or **upper-body** work — that combination is **banned**. **Never** tie them to a prior **strength** workout unless that RECENT SESSIONS line shows **[leg_relevant_strength: yes]**. Do **not** use weasel phrases like "glute residual from upper-body session (systemic)" — that still reads as leg-specific blame. Prefer **omitting** named muscles; cite **terrain, GAP, easy intent, strides** or one vague "training load context is a bit elevated" **without** naming body parts or guessing causes.
- PRIOR SESSION ATTRIBUTION: Only mention a **specific prior day, weekday, or modality** (e.g. "Monday", "yesterday's strength session") if **RECENT SESSIONS BEFORE THIS WORKOUT** explicitly lists that session with date/discipline. If that section is missing, empty, or has no strength line, **do not** mention strength as something they did before this workout. Missing data means you cannot see that day — do not fill in.
- When load/fatigue data exists, connect it to what comes next: "Recovery matters before Tuesday's intervals" is actionable. "ACWR is 1.35" is not.
- When plan context exists, frame the workout's role: "This was your peak long run" or "Easy day — the goal was recovery, not performance."
- Use plain language. Not "positive split of 175s/mi" but "you slowed over the back half — expected on a course that back-loads the climbing."
- Do not list metrics. Do not use bullet points. Write in connected prose.
- If nothing interesting happened (easy run, everything on plan, no flags), one sentence is enough: "Clean easy run, no flags."
- CRITICAL: Do not introduce ANY numbers or percentages that are not present in the data provided.
- CRITICAL: Pace must use display format like "10:16/mi", never raw seconds.
- Write in direct, professional prose. No idioms ('is real', 'nailed it', 'crushed it'). No motivational language ('stay patient', 'trust the process', 'you've got this'). State observations and recommendations plainly. Instead of 'The week's accumulated fatigue is real' write 'Accumulated fatigue from 129% weekly load is a factor.' Instead of 'You nailed the pacing' write 'Pacing was well-controlled for the terrain.'
- TEMPORAL PRECISION: The RECENT SESSIONS section already labels each session with its exact timing (e.g. "yesterday", "2 days before"). Use those labels verbatim. NEVER invent your own temporal claims — do not say "yesterday" unless the data literally says "yesterday". If timing is not labeled, omit any time reference. NEVER pair **quad/calf/hamstring/glutes** with **"N hours ago"** or **"N days ago"** — that reads as fake physiology; those clock phrases are banned with named muscles.
- CROSS-DISCIPLINE CLAIMS: Only reference prior workouts affecting this one when the mechanism is physiologically plausible. Think about what muscle groups were used and whether they overlap with the current workout. Systemic fatigue (CNS load, sleep debt) is real but distinct from local muscular fatigue — be specific about which mechanism you mean.
- FORBIDDEN words/phrases: "successfully", "excellent", "resilience", "confidence", "crucial", "reinforcing", "effective management", "aligns well", "recovery-integrity cost", "be mindful of", "attention should be paid", "ensure", "focus on", "in future workouts", "indicating", "should be monitored", "monitor closely", "overall", "nailed", "crushed", "is real", "trust the process", "you've got this", "stay patient".`;

function buildUserMessage(
  dp: any,
  coachingContext: string | null,
  readinessLoadOverride: string | null = null,
): string {
  const w = dp.workout || {};
  const sig = dp.signals || {};
  const sections: string[] = [];

  sections.push('Here is the workout data. Answer the athlete\'s unasked questions — don\'t summarize what they can already see.');

  if (w.date) {
    sections.push(`\nWORKOUT DATE: ${w.date}`);
  }

  // Workout
  const gapNote = w.avg_gap ? `(effort-adjusted: ${w.avg_gap})` : '';
  const terrainNote = [w.terrain, w.elevation_gain ? `${w.elevation_gain} gain` : null].filter(Boolean).join(', ');
  sections.push([
    '\nWORKOUT:',
    `- Type: ${w.type || 'run'}${dp.plan?.workout_purpose ? ` (${dp.plan.workout_purpose})` : ''}`,
    w.distance && w.duration ? `- Distance: ${w.distance} in ${w.duration}` : null,
    w.avg_pace ? `- Pace: ${w.avg_pace} ${gapNote}`.trim() : null,
    w.avg_hr ? `- HR: ${w.avg_hr}${sig.hr_drift ? ` (drift: ${sig.hr_drift}, typical: ${sig.hr_drift_typical || 'unknown'})` : ''}` : null,
    terrainNote ? `- Terrain: ${terrainNote}` : null,
    dp.conditions ? `- Weather: ${dp.conditions.temperature}, ${dp.conditions.humidity} humidity${dp.conditions.heat_stress_level !== 'none' ? ` (${dp.conditions.heat_stress_level} heat stress)` : ''}` : null,
  ].filter(Boolean).join('\n'));

  // Execution vs plan
  if (sig.interval_execution || sig.execution) {
    const ie = sig.interval_execution || {};
    const ex = sig.execution || {};
    sections.push([
      '\nEXECUTION vs PLAN:',
      ie.execution_score ? `- Execution score: ${ie.execution_score}` : null,
      ie.pace_adherence ? `- Pace adherence: ${ie.pace_adherence}${ie.pace_adherence_note ? ` (${ie.pace_adherence_note})` : ''}` : null,
      ie.completed_steps ? `- Completed steps: ${ie.completed_steps}` : null,
      sig.pace_fade ? `- Pace fade: ${sig.pace_fade}` : null,
      ex.assessed_against === 'actual' ? '- Note: assessed against actual execution (no plan targets available)' : null,
      dp.plan?.week_intent ? `- Plan role: ${dp.plan.week_intent}${dp.plan.week_number != null ? `, Week ${dp.plan.week_number}` : ''}${dp.plan.phase ? ` of ${dp.plan.phase} phase` : ''}` : null,
    ].filter(Boolean).join('\n'));
  }

  // Similar workouts
  const comp = sig.comparisons;
  if (comp?.vs_similar?.sample_size > 0 && comp.vs_similar.assessment !== 'insufficient_data') {
    sections.push([
      `\nCOMPARED TO SIMILAR WORKOUTS (n=${comp.vs_similar.sample_size}):`,
      `- Pace vs similar: ${comp.vs_similar.assessment}${comp.vs_similar.pace_delta ? ` (${comp.vs_similar.pace_delta})` : ''}`,
      comp.vs_similar.hr_delta ? `- HR vs similar: ${comp.vs_similar.hr_delta}` : null,
      comp.trend?.direction && comp.trend.direction !== 'insufficient_data'
        ? `- Trend: ${comp.trend.direction}${comp.trend.magnitude ? ` — ${comp.trend.magnitude}` : ''} (${comp.trend.data_points} data points)`
        : null,
    ].filter(Boolean).join('\n'));
  }

  // Load context — readiness override replaces generic streak / fatigue lines
  if (readinessLoadOverride && readinessLoadOverride.trim()) {
    sections.push('\n' + readinessLoadOverride.trim());
  } else {
    const tl = sig.training_load;
    if (tl) {
      const anyTl = tl as any;
      const streakLine = (typeof anyTl.consecutive_training_days === 'number' && anyTl.consecutive_training_days > 0)
        ? (() => {
            const n = anyTl.consecutive_training_days;
            const swl = coerceNumber(anyTl.streak_combined_workload);
            const mix = typeof anyTl.streak_modality_summary === 'string' && anyTl.streak_modality_summary.trim()
              ? anyTl.streak_modality_summary.trim()
              : null;
            const focus = typeof anyTl.previous_day_athletic_focus === 'string' ? anyTl.previous_day_athletic_focus : null;
            const loadPart = swl != null && swl > 0 ? `, ~${Math.round(swl)} combined load` : '';
            const mixPart = mix ? `, sessions: ${mix}` : '';
            const focusPart = focus ? ` Yesterday (before this workout) was ${focus}-focused.` : '';
            return `- Training streak: ${n} day(s) without rest${loadPart}${mixPart}.${focusPart}`;
          })()
        : null;
      sections.push([
        '\nLOAD CONTEXT:',
        Array.isArray(tl.fatigue_evidence) && tl.fatigue_evidence.length > 0
          ? tl.fatigue_evidence.map((e: string) => `- ${e}`).join('\n')
          : null,
        tl.cumulative_fatigue ? `- Cumulative fatigue: ${tl.cumulative_fatigue}` : null,
        streakLine,
      ].filter(Boolean).join('\n'));
    }
  }

  // Flags
  const flags = dp.top_flags || [];
  if (flags.length > 0) {
    sections.push('\nFLAGS:\n' + flags.map((f: any) => `- [${f.type}] ${f.message}`).join('\n'));
  }

  // Limiter
  if (sig.limiter?.limiter) {
    sections.push(`\nPRIMARY LIMITER: ${sig.limiter.limiter}${sig.limiter.confidence != null ? ` (${sig.limiter.confidence}% confidence)` : ''}`);
  }

  // Terrain segments
  if (sig.terrain?.route) {
    sections.push(`\nROUTE: "${sig.terrain.route.name}" — run ${sig.terrain.route.times_run} times`);
  }
  if (sig.terrain?.segment_comparisons?.length > 0 && sig.terrain.segment_insight_eligible) {
    sections.push('\nFAMILIAR SEGMENTS:\n' + sig.terrain.segment_comparisons.map((c: any) =>
      `- ${c.type} (${c.times_seen}x): today ${c.today_pace}${c.today_hr ? ` @ ${c.today_hr}` : ''}, avg ${c.avg_pace}${c.avg_hr ? ` @ ${c.avg_hr}` : ''}`
    ).join('\n'));
  }

  // Coaching context
  if (coachingContext) {
    sections.push('\n' + coachingContext);
  }

  return sections.join('\n');
}

async function callLLMParagraph(systemPrompt: string, userMessage: string, temperature: number): Promise<string | null> {
  const text = await callLLM({
    system: systemPrompt,
    user: userMessage,
    temperature,
    maxTokens: 350,
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

  const suppressHrDriftForIntervals = (() => {
    const ie = derived?.interval_execution;
    if (typeof ie?.total_steps === 'number' && ie.total_steps > 2) return true;
    const paces = segments
      .map((s: any) => coerceNumber(s?.pace_sec_per_mi))
      .filter((n): n is number => n != null && n > 120 && n < 2400);
    if (paces.length >= 5) {
      const spread = Math.max(...paces) - Math.min(...paces);
      if (spread >= 75) return true;
    }
    return false;
  })();

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
      date: (facts as any)?.workout_date ?? (packet.generated_at ? packet.generated_at.slice(0, 10) : null),
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
      if (!wx || coerceNumber(wx.temperature_f) == null) return null;
      return {
        dew_point: coerceNumber(wx.dew_point_f) != null ? `${Math.round(Number(wx.dew_point_f))}°F` : null,
        heat_stress_level: wx.heat_stress_level || 'none',
        temperature: `${Math.round(Number(wx.temperature_f))}°F`,
        humidity: coerceNumber(wx.humidity_pct) != null ? `${Math.round(Number(wx.humidity_pct))}%` : null,
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
      hr_drift: (!suppressHrDriftForIntervals && coerceNumber(derived?.hr_drift_bpm) != null)
        ? `${Math.round(Number(derived.hr_drift_bpm))} bpm`
        : null,
      hr_drift_typical: (!suppressHrDriftForIntervals && coerceNumber(derived?.hr_drift_typical) != null)
        ? `${Math.round(Number(derived.hr_drift_typical))} bpm`
        : null,
      cardiac_decoupling: (coerceNumber(derived?.cardiac_decoupling_pct) != null) ? `${Math.round(Number(derived.cardiac_decoupling_pct))}%` : null,
      pace_fade: (coerceNumber(derived?.pace_fade_pct) != null) ? `${Math.round(Number(derived.pace_fade_pct))}%` : null,
      training_load: derived?.training_load
        ? (() => {
            const anyTl = derived.training_load as any;
            return {
              previous_day_workload: coerceNumber(anyTl.previous_day_workload) ?? 0,
              consecutive_training_days: coerceNumber(anyTl.consecutive_training_days) ?? 0,
              streak_combined_workload: coerceNumber(anyTl.streak_combined_workload) ?? 0,
              streak_modality_summary: typeof anyTl.streak_modality_summary === 'string' ? anyTl.streak_modality_summary : null,
              previous_day_athletic_focus: typeof anyTl.previous_day_athletic_focus === 'string' ? anyTl.previous_day_athletic_focus : null,
              cumulative_fatigue: anyTl.cumulative_fatigue ?? null,
              fatigue_evidence: Array.isArray(anyTl.fatigue_evidence) ? anyTl.fatigue_evidence.slice(0, 4) : [],
            };
          })()
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

export type GenerateAISummaryV1Options = {
  /** Full LOAD CONTEXT block from buildReadiness (replaces fact-packet training_load section). */
  readinessLoadContextText?: string | null;
  /** Appended to system prompt from readiness.narrative_caps */
  narrativeCapsAppend?: string | null;
};

export async function generateAISummaryV1(
  factPacket: FactPacketV1,
  flags: FlagV1[],
  coachingContext?: string | null,
  opts?: GenerateAISummaryV1Options | null,
): Promise<string | null> {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    console.warn('[ai-summary] ANTHROPIC_API_KEY not set — skipping narrative generation');
    return null;
  }

  const displayPacket = toDisplayFormatV1(factPacket, flags);
  const loadCtx = opts?.readinessLoadContextText?.trim() || null;
  if (loadCtx) {
    (displayPacket as any).readiness_load_context = loadCtx;
  }

  const userMessage = buildUserMessage(displayPacket, coachingContext ?? null, loadCtx);
  const systemPrompt = COACHING_SYSTEM_PROMPT + (opts?.narrativeCapsAppend?.trim() || '');

  try {
    const s1 = await callLLMParagraph(systemPrompt, userMessage, 0.2);
    if (!s1) { console.warn('[ai-summary] attempt 1 returned empty'); return null; }
    const v1 = validateNoNewNumbers(s1, displayPacket);
    const z1 = validateNoZoneTimeClaims(s1, displayPacket);
    const len1 = validateAdaptiveLength(s1, displayPacket);
    const td1 = validateTerrainExplainsDrift(s1, displayPacket);
    const g1 = validateNoGenericFiller(s1);
    const ps1 = validatePriorSessionAttribution(s1, userMessage);
    const mc1 = validateMuscleClockClaims(s1);
    if (v1.ok && z1.ok && len1.ok && td1.ok && g1.ok && ps1.ok && mc1.ok) return s1;
    console.warn('[ai-summary] attempt 1 rejected:', JSON.stringify({ num: v1.ok, bad: v1.bad, zone: z1.why, len: len1.why, td: td1.why, filler: g1.why, prior: ps1.why, muscleClock: mc1.why }));

    const corrections = [
      v1.bad.length ? 'Bad numeric tokens: ' + v1.bad.join(', ') : null,
      z1.why, len1.why, td1.why, g1.why, ps1.why, mc1.why,
    ].filter(Boolean);
    const corrective = userMessage + '\n\nYou violated constraints:\n' + corrections.map(c => '- ' + c).join('\n') + '\nRewrite and fix.';
    const s2 = await callLLMParagraph(systemPrompt, corrective, 0);
    if (!s2) { console.warn('[ai-summary] attempt 2 returned empty'); return null; }
    const v2 = validateNoNewNumbers(s2, displayPacket);
    const z2 = validateNoZoneTimeClaims(s2, displayPacket);
    const len2 = validateAdaptiveLength(s2, displayPacket);
    const td2 = validateTerrainExplainsDrift(s2, displayPacket);
    const g2 = validateNoGenericFiller(s2);
    const ps2 = validatePriorSessionAttribution(s2, userMessage);
    const mc2 = validateMuscleClockClaims(s2);
    if (v2.ok && z2.ok && len2.ok && td2.ok && g2.ok && ps2.ok && mc2.ok) return s2;
    console.warn('[ai-summary] attempt 2 also rejected, returning anyway');
    return s2;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}
