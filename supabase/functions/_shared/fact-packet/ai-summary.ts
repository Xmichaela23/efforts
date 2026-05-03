import type { FactPacketV1, FlagV1 } from './types.ts';
import { coerceNumber, secondsToPaceString } from './utils.ts';
import { callLLM } from '../llm.ts';
import type { ArcNarrativeContextV1, ArcNarrativeMode } from '../arc-narrative-state.ts';
import { arcModeSystemAddon, arcNarrativeFactBlock } from '../arc-narrative-ai-appendix.ts';

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

function validateNoNewNumbers(summary: string, displayPacket: any, extraAllowedJson?: string | null): { ok: boolean; bad: string[] } {
  const displayStr = JSON.stringify(displayPacket, null, 2) + (extraAllowedJson ? '\n' + String(extraAllowedJson) : '');
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

function validateAdaptiveLength(
  summary: string,
  displayPacket: any,
  arcMode?: ArcNarrativeMode | null,
): { ok: boolean; why: string | null } {
  const temporalRich =
    arcMode === 'recovery_read' || arcMode === 'race_debrief' || arcMode === 'taper_read';
  const top = getTopFlags(displayPacket);
  const hasConcern = top.some((f) => f.type === 'concern' && f.priority <= 2);
  const sentences = countSentences(summary);
  const clauses = countClauses(summary);
  const words = countWords(summary);
  /** Post-race / taper prose needs room for mandated Arc opening + physiology + conditions. */
  const wBump = temporalRich ? 22 : 0;
  const cBump = temporalRich ? 2 : 0;
  const maxWordsLo = 50 + wBump;
  const maxWordsHi = 65 + wBump;
  const maxClausesLo = 4 + cBump;
  const maxClausesHi = 5 + cBump;

  if (!hasConcern) {
    if (sentences > 3) return { ok: false, why: `too many sentences (${sentences}) for low-signal workout` };
    if (clauses > maxClausesLo) return { ok: false, why: `too many clauses (${clauses}) for low-signal workout` };
    if (words > maxWordsLo) return { ok: false, why: `too many words (${words}) for low-signal workout` };
  }
  if (sentences > 3) return { ok: false, why: `too many sentences (${sentences})` };
  if (clauses > maxClausesHi) return { ok: false, why: `too many clauses (${clauses})` };
  if (words > maxWordsHi) return { ok: false, why: `too many words (${words})` };
  return { ok: true, why: null };
}

/** @deprecated — no cross-session context in prompt; kept as no-op for compile compat. */
function _unused_validatePriorSessionAttribution(summary: string, userMessage: string): { ok: boolean; why: string | null } {
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

/** @deprecated — no muscular data in prompt; kept as no-op for compile compat. */
function _unused_validateMuscleClockClaims(summary: string): { ok: boolean; why: string | null } {
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

function validateNoPaceDeltaFormat(summary: string): { ok: boolean; why: string | null } {
  const s = String(summary || '');
  const rawDelta = /\b\d{1,3}s\/mi\b/i.test(s);
  if (rawDelta) {
    return { ok: false, why: 'Used raw "Xs/mi" pace delta — express pace as actual values (e.g. "12:25/mi") not deltas in seconds' };
  }
  return { ok: true, why: null };
}

function validateNoRpeClaimsWithoutAthleteReport(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const rpeLogged = displayPacket?.workout?.athlete_reported?.rpe;
  const hasRpe =
    rpeLogged != null && typeof rpeLogged !== 'boolean' && Number.isFinite(Number(rpeLogged));
  if (hasRpe) return { ok: true, why: null };
  const s = String(summary || '');
  const sl = s.toLowerCase();
  if (/\brpe\b/i.test(sl)) {
    return { ok: false, why: 'Do not cite RPE unless athlete_reported.rpe is present in the fact packet' };
  }
  if (/\b\d{1,2}(?:\.\d)?\s+out\s+of\s+10\b/i.test(s)) {
    return { ok: false, why: 'Do not invent effort scores (out of 10) unless athlete_reported.rpe is logged' };
  }
  return { ok: true, why: null };
}

function validateNoHrWithoutData(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const hasHr = !!(displayPacket?.workout?.avg_hr || displayPacket?.workout?.max_hr);
  if (hasHr) return { ok: true, why: null };
  const s = String(summary || '').toLowerCase();
  const hrClaim =
    /\bheart\s*rate\b/.test(s) ||
    /\bhr\b/.test(s) ||
    /\bcardiac\b/.test(s) ||
    /\bbpm\b/.test(s) ||
    /\bdrift\b/.test(s) ||
    /\baerobic response\b/.test(s) ||
    /\bphysiological response\b/.test(s) ||
    /\brecovery readiness\b/.test(s);
  return hrClaim
    ? { ok: false, why: 'HR/cardiac/physiological claim but no HR data exists for this workout — remove all HR references' }
    : { ok: true, why: null };
}

function validateNoAthleteContradiction(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const ar = displayPacket?.workout?.athlete_reported;
  if (!ar) return { ok: true, why: null };
  const s = normalizeParagraph(summary).toLowerCase();

  const feelingPositive = ar.feeling === 'great' || ar.feeling === 'good' || (ar.rpe != null && ar.rpe <= 4);
  const feelingNegative = ar.feeling === 'exhausted' || ar.feeling === 'tired' || (ar.rpe != null && ar.rpe >= 8);

  if (feelingPositive) {
    const contradictsPositive =
      /felt harder/i.test(s) ||
      /struggled/i.test(s) ||
      /weren.t (fully )?recovered/i.test(s) ||
      /not fully recovered/i.test(s) ||
      /more fatigued/i.test(s) ||
      /taxing/i.test(s);
    if (contradictsPositive) {
      return { ok: false, why: `Athlete reported ${ar.feeling || `RPE ${ar.rpe}`} — narrative contradicts their experience with negative framing` };
    }
  }

  if (feelingNegative) {
    const contradictsNegative =
      /clean.*run/i.test(s) ||
      /no flags/i.test(s) ||
      /easy.*effort/i.test(s);
    if (contradictsNegative) {
      return { ok: false, why: `Athlete reported ${ar.feeling || `RPE ${ar.rpe}`} — narrative dismisses their fatigue` };
    }
  }

  return { ok: true, why: null };
}

function validateTerrainExplainsDrift(summary: string, displayPacket: any): { ok: boolean; why: string | null } {
  const sig = displayPacket?.signals;
  const driftExp = sig?.drift_explanation;
  const s = normalizeParagraph(summary).toLowerCase();

  // If drift is pace-driven, the narrative MUST NOT frame it as cardiac drift, fatigue, or a concern.
  if (driftExp === 'pace_driven') {
    const driftMentioned = /\bdrift\b|\bcardiac\b|\bdecoupl/i.test(s);
    const fatiguePhrases = /drift.*suggests|drift.*fatigue|drift.*harder|dial.back|working harder.*intended|cardiovascular.*drift|decoupl/.test(s);
    if (fatiguePhrases) {
      return { ok: false, why: 'drift_explanation is pace_driven — HR rose because the athlete ran faster, not from cardiovascular drift. Do NOT mention drift, decoupling, or fatigue from HR changes.' };
    }
    if (driftMentioned) {
      return { ok: false, why: 'drift_explanation is pace_driven — do not mention "drift" or "cardiac" when HR increase is fully explained by pace increase (negative split).' };
    }
    return { ok: true, why: null };
  }

  // Terrain-driven: existing guard
  if (driftExp === 'terrain_driven') {
    const negativePhrases = /despite.*drift|drift.*suggests.*(fatigue|not.*recovered|recovery)|drift.*increase in effort|weren.t.*recovered.*drift|drift.*harder/.test(s);
    if (negativePhrases) return { ok: false, why: 'drift framed as effort/fatigue signal despite terrain contributing to drift' };
    return { ok: true, why: null };
  }

  // Cardiac drift within expected range for the duration should not be framed as a concern.
  if (driftExp === 'cardiac_drift') {
    const driftMatch = sig?.hr_drift?.match?.(/^(-?\d+)/);
    const driftVal = driftMatch ? Math.abs(parseInt(driftMatch[1], 10)) : null;
    const durationMin = coerceNumber(displayPacket?.workout?.duration?.replace?.(/[^\d.]/g, ''));

    if (driftVal != null && durationMin != null) {
      let upperExpected = 12;
      if (durationMin < 60) upperExpected = 8;
      else if (durationMin < 90) upperExpected = 12;
      else if (durationMin < 150) upperExpected = 15;
      else upperExpected = 20;

      if (driftVal <= upperExpected) {
        const alarmPhrases = /dial.back|working harder|not.*(fully|adequately).*recover|fatigue|suggests.*concern|drift.*elevated|higher than|weren.t.*recovered|harder than intended/.test(s);
        if (alarmPhrases) {
          return { ok: false, why: `drift_explanation is cardiac_drift at ${driftVal} bpm over ${Math.round(durationMin)} min — within the normal ${upperExpected} bpm upper bound. Do NOT frame as elevated, concerning, or a recovery issue. This is expected physiology.` };
        }
      }
    }
    return { ok: true, why: null };
  }

  // Fallback for legacy packets without drift_explanation
  const top = getTopFlags(displayPacket);
  const hasTerrainDriftFlag = top.some((f) => /drift/i.test(f.message) && /terrain/i.test(f.message));
  if (!hasTerrainDriftFlag) return { ok: true, why: null };

  const mentionsDrift = /\bdrift\b/.test(s);
  if (!mentionsDrift) return { ok: true, why: null };

  const negativePhrases = /despite.*drift|drift.*suggests.*(fatigue|not.*recovered|recovery)|drift.*increase in effort|weren.t.*recovered.*drift|drift.*harder/.test(s);
  if (negativePhrases) return { ok: false, why: 'drift framed as effort/fatigue signal despite terrain contributing to drift' };

  return { ok: true, why: null };
}

/**
 * Prepended before base prompt so Arc temporal modes win over broad "session-only" bans.
 * Base prompt forbids vague "recovery needs" / guessed weekly fatigue; it must not silence
 * deterministic LAST_GOAL_RACE comeback framing from getArcContext(workout_date).
 */
function arcTemporalSystemPrefix(nc: ArcNarrativeContextV1 | null | undefined): string {
  if (!nc) return '';
  switch (nc.mode) {
    case 'recovery_read': {
      const lr = nc.last_goal_race;
      if (!lr?.name) return '';
      const ds = nc.days_since_last_goal_race ?? '?';
      return (
        `=== TEMPORAL ARC — OVERRIDES CONFLICTING SESSION-ONLY LANGUAGE BELOW ===
NARRATIVE_MODE=recovery_read. The athlete raced **${lr.name}** on **${lr.target_date}**; WORKOUT DATE is about **${ds}** days after that event.
Your **first or second sentence MUST** name that race (short paraphrase OK) and acknowledge this **comeback / re-entry window** using the day count when given.
This is required Arc framing and is NOT optional. It does not violate "session-scoped" truth: these lines are facts in TEMPORAL ARC CONTEXT for this workout date — not invented weekly load or guessed fatigue.
IGNORE any instruction below that forbids "recovery" phrasing when it would block this Arc-mandated comeback frame; that ban targets speculative cumulative recovery needs, not LAST_GOAL_RACE.
===\n\n`
      );
    }
    case 'race_debrief': {
      const lr = nc.last_goal_race;
      if (!lr?.name) return '';
      return (
        `=== TEMPORAL ARC — OVERRIDES CONFLICTING SESSION-ONLY LANGUAGE BELOW ===
NARRATIVE_MODE=race_debrief within days of **${lr.name}** (${lr.target_date}). Anchor to guarded return-to-running, not build-phase fitness gains.
===\n\n`
      );
    }
    case 'taper_read':
      return (
        `=== TEMPORAL ARC — OVERRIDES CONFLICTING SESSION-ONLY LANGUAGE BELOW ===
NARRATIVE_MODE=taper_read: an A-priority race is imminent (see ARC FACT block). Lead with freshness/sharpness; forbid adaptation-gain praise per appendix.
===\n\n`
      );
    default:
      return '';
  }
}

const COACHING_SYSTEM_PROMPT = `You are an experienced endurance coach reviewing a completed workout. Your athlete can already see their pace, HR, distance, and duration — do not restate those numbers unless you're connecting them to an insight.

Write 1-2 sentences (3 maximum if there is a genuine concern). This narrative covers THIS session only.

STRICTLY SESSION-SCOPED for execution facts — you will NOT invent training load, weekly volume, or cumulative-fatigue guesses. Unless TEMPORAL ARC CONTEXT in the USER message declares a narrative mode that explicitly allows comeback/taper framing, do NOT reference prior workouts by date, speculative "recovery needs", or this week's aggregate load. When TEMPORAL ARC CONTEXT includes NARRATIVE_MODE=recovery_read with LAST_GOAL_RACE facts, acknowledging that comeback window is REQUIRED and is not speculative.

RULES:
- THE CORE TEST: Before writing any sentence, ask "Could the athlete figure this out by looking at the pace/HR/distance numbers and adherence chips above?" If yes, cut it. Only say things the athlete cannot see for themselves.
- NEVER start with a restatement of distance/time/pace. The athlete already sees those.
- NEVER restate execution percentages, pace adherence, or duration adherence — these are displayed as chips above the narrative.
- NEVER describe the workout the athlete just did ("You ran 13 miles at 11:04 pace"). They were there.
- NEVER reference unrelated prior workouts by date, strength sessions, yesterday's training, guessed weekly load, muscular fatigue, or invented "recovery needs" (unless REQUIRED by TEMPORAL ARC recovery_read comeback framing — see preamble when present).
- Connect data across domains: if terrain was hilly AND pace was "slow", say the pace was appropriate for the terrain — don't report them as separate facts.
- When grade-adjusted pace (GAP) appears on the Pace line, the parenthetical terrain bias text after it is authoritative: do not contradict it using elevation gain alone. Large "elevation gain" on rolling routes can coexist with net downhill bias in aggregate GAP — gain sums climbs but does not replace time-weighted grade. If bias says net downhill, grade assisted raw pace (GAP slower than raw pace in min/mi terms); if net uphill, grade resisted raw pace (GAP faster than raw). Example rewrite when bias is uphill: "Your 11:04 pace was about a 10:32 flat-equivalent effort — the climbs added demand." Do not invert this relationship.
- When similar workout comparisons exist, lead with the trend: "You're X faster/slower than your last N similar efforts" is more valuable than any single-workout metric.
- When ROUTE data is present, reference it: "on your [route name]" or "on a route you've run N times". When FAMILIAR SEGMENTS data is present and segment_insight_eligible, mention how today's effort on that segment compared to previous runs.

HR DRIFT — USE PACE-NORMALIZED VALUES:
- The "drift" value is pace-normalized: the expected HR increase from pace changes has been removed. A negative-split run where HR rose because the athlete ran faster will show near-zero drift.
- Check "drift_explanation" for context:
  - "pace_driven": HR increase is fully explained by the athlete running faster. This is NOT a concern. Do NOT mention drift or cardiovascular decoupling.
  - "terrain_driven": HR increase is mostly from grade changes on a hillier late portion. Not a fatigue signal.
  - "cardiac_drift": genuine cardiovascular drift after removing pace and terrain effects. Compare to expected ranges below before calling it elevated.
  - "mixed": multiple factors contributed — do not attribute to any single cause.
- EXPECTED DRIFT RANGES (exercise physiology norms for steady-state running):
  - Under 60 min: 3–8 bpm normal
  - 60–90 min: 5–12 bpm normal
  - 90–150 min: 8–15 bpm normal (long runs)
  - 150+ min: 10–20 bpm normal
  If the drift value falls within the expected range for the workout's duration, it is a normal physiological response and NOT a concern. Do not frame normal drift as fatigue, decoupling, or a recovery problem.
- "hr_drift_raw_absolute" shows the total first-half vs second-half HR gap for transparency, but do NOT use it as a signal. It conflates pace changes, terrain, and actual drift.
- STRUCTURED INTERVALS: If the workout has multiple planned work/recovery segments, HR differences between segments are expected (pace targets change). Do not describe that as "cardiac drift" or cite a single bpm drift figure unless the data explicitly says steady-state drift for the main work block.

ATHLETE REPORTED FEELING:
- When ATHLETE REPORTED data is present, it is ground truth for the athlete's subjective experience.
- NEVER contradict the athlete's reported feeling. If they reported RPE 4/10 and feeling "good", do NOT say the workout "felt harder than it should have" or suggest they were struggling.
- If HR data suggests harder effort than the athlete reported, frame it as a physiological observation without overriding their experience: "HR ran higher than expected for this effort level" NOT "this felt harder than it should have."
- If no ATHLETE REPORTED data is present, do not speculate about how the workout felt.

PACE vs PRESCRIBED RANGE:
- When "pace vs prescribed range" says "slower_than_prescribed", the athlete ran SLOWER than target. Do not say they ran "too hard" or at "threshold" — their pace was easy; only HR may have been elevated.
- When "faster_than_prescribed", the athlete ran faster than planned.
- Elevated HR at easy pace is a different claim than "ran too hard." The first is physiology; the second is pacing. Do not conflate them.

- When plan context exists, frame the workout's role: "This was your peak long run" or "Easy day — the goal was recovery, not performance."
- RACE PROXIMITY: When "Days until race" is present and the workout is a long run (≥75 min or type includes "long"), treat this as a race-readiness checkpoint. Assess what HR drift, pacing splits, and conditions tell the athlete about their preparedness — not just "how was this run" but "what does this run say about how ready you are." The closer to race day, the more this matters.
- Use plain language. Not "positive split of 175s/mi" but "you slowed over the back half — expected on a course that back-loads the climbing."
- Do not list metrics. Do not use bullet points. Write in connected prose.
- If nothing interesting happened (easy run, everything on plan, no flags), one sentence is enough: "Clean easy run, no flags."
- CRITICAL: Do not introduce ANY numbers or percentages that are not present in the data provided.
- CRITICAL: Pace must use display format like "10:16/mi", never raw seconds. Never express pace differences as "Xs/mi slower/faster" — convert to actual pace values.
- CRITICAL: If NO HR data is provided (no avg_hr line in the WORKOUT section), you MUST NOT mention heart rate, HR, cardiac drift, physiological response, aerobic response, or recovery readiness. No HR data means NO HR claims of any kind.
- Write in direct, professional prose. No idioms ('is real', 'nailed it', 'crushed it'). No motivational language ('stay patient', 'trust the process', 'you've got this'). State observations and recommendations plainly.
- FORBIDDEN words/phrases: "successfully", "excellent", "resilience", "confidence", "crucial", "reinforcing", "effective management", "aligns well", "recovery-integrity cost", "be mindful of", "attention should be paid", "ensure", "focus on", "in future workouts", "indicating", "should be monitored", "monitor closely", "overall", "nailed", "crushed", "is real", "trust the process", "you've got this", "stay patient", "felt harder than it should have".`;

function buildUserMessage(dp: any): string {
  const w = dp.workout || {};
  const sig = dp.signals || {};
  const sections: string[] = [];

  sections.push('Here is the workout data. Answer the athlete\'s unasked questions — don\'t summarize what they can already see.');

  if (w.date) {
    sections.push(`\nWORKOUT DATE: ${w.date}`);
  }

  // Workout — GAP note must include terrain bias so the model does not invert vs raw pace.
  const gapBias = w.gap_terrain_bias as 'downhill' | 'uphill' | 'flat' | null | undefined;
  let gapNote = '';
  if (w.avg_gap) {
    if (gapBias === 'downhill') {
      gapNote = `(effort-adjusted pace ${w.avg_gap} — net downhill bias, raw pace slightly assisted by grade)`;
    } else if (gapBias === 'uphill') {
      gapNote = `(effort-adjusted pace ${w.avg_gap} — net uphill bias, effort harder than raw pace suggests on flat)`;
    } else if (gapBias === 'flat') {
      gapNote = `(effort-adjusted pace ${w.avg_gap} — terrain roughly neutral vs flat-equivalent pace)`;
    } else {
      gapNote = `(effort-adjusted: ${w.avg_gap})`;
    }
  }
  const terrainNote = [w.terrain, w.elevation_gain ? `${w.elevation_gain} gain` : null].filter(Boolean).join(', ');
  sections.push([
    '\nWORKOUT:',
    `- Type: ${w.type || 'run'}${dp.plan?.workout_purpose ? ` (${dp.plan.workout_purpose})` : ''}`,
    w.distance && w.duration ? `- Distance: ${w.distance} in ${w.duration}` : null,
    w.avg_pace ? `- Pace: ${w.avg_pace}${gapNote ? ` ${gapNote}` : ''}`.trim() : null,
    w.avg_hr ? `- HR: ${w.avg_hr}${sig.hr_drift ? ` (drift: ${sig.hr_drift}${sig.drift_explanation ? `, explanation: ${sig.drift_explanation}` : ''}${sig.hr_drift_raw_absolute ? `, raw first→second half: ${sig.hr_drift_raw_absolute}` : ''}, typical: ${sig.hr_drift_typical || 'unknown'})` : ''}` : null,
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
      ex.pace_vs_range ? `- Pace vs prescribed range: ${ex.pace_vs_range.replace(/_/g, ' ')}` : null,
      ex.assessed_against === 'actual' ? '- Note: assessed against actual execution (no plan targets available)' : null,
      dp.plan?.week_intent ? `- Plan role: ${dp.plan.week_intent}${dp.plan.week_number != null ? `, Week ${dp.plan.week_number}` : ''}${dp.plan.phase ? ` of ${dp.plan.phase} phase` : ''}` : null,
      dp.plan?.days_until_race ? `- Days until race: ${dp.plan.days_until_race}` : null,
    ].filter(Boolean).join('\n'));
  }

  // Athlete reported feeling
  const ar = w.athlete_reported;
  if (ar && (ar.rpe != null || ar.feeling)) {
    const parts: string[] = [];
    if (ar.rpe != null) parts.push(`RPE: ${ar.rpe}/10`);
    if (ar.feeling) parts.push(`Feeling: ${ar.feeling}`);
    sections.push('\nATHLETE REPORTED:\n' + parts.map((p) => `- ${p}`).join('\n'));
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

  // Flags — exclude fatigue/load flags: the narrative is session-scoped and has no
  // proper cross-session context to interpret training load honestly.
  const flags = (dp.top_flags || []).filter((f: any) => {
    const cat = String(f?.category || '').toLowerCase();
    const msg = String(f?.message || '').toLowerCase();
    if (cat === 'fatigue') return false;
    if (msg.includes('planned load') || msg.includes('training stress') || msg.includes('training load')) return false;
    return true;
  });
  if (flags.length > 0) {
    sections.push('\nFLAGS:\n' + flags.map((f: any) => `- [${f.type}] ${f.message}`).join('\n'));
  }

  // Limiter — suppress fatigue limiter (relies on cross-session load signals the
  // narrative can't properly contextualize).
  if (sig.limiter?.limiter && sig.limiter.limiter !== 'fatigue') {
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

/** Higher sec/mi = slower pace. GAP slower than raw ⇒ net downhill bias in this model. */
function computeGapTerrainBias(
  paceSecPerMi: number | null | undefined,
  gapSecPerMi: number | null | undefined,
  gapAdjusted: boolean,
  tolSeconds = 5,
): 'downhill' | 'uphill' | 'flat' | null {
  if (!gapAdjusted) return null;
  const p = coerceNumber(paceSecPerMi);
  const g = coerceNumber(gapSecPerMi);
  if (p == null || g == null || !(p > 0) || !(g > 0)) return null;
  if (g > p + tolSeconds) return 'downhill';
  if (g < p - tolSeconds) return 'uphill';
  return 'flat';
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

  const paceSecForBias = coerceNumber(facts?.avg_pace_sec_per_mi);
  const gapSecForBias = coerceNumber(facts?.avg_gap_sec_per_mi);
  const gapAdjustForBias = !!facts?.gap_adjusted;
  const gap_terrain_bias = computeGapTerrainBias(paceSecForBias, gapSecForBias, gapAdjustForBias);

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
      gap_terrain_bias,
      avg_hr: fmtBpm(coerceNumber(facts?.avg_hr)),
      max_hr: fmtBpm(coerceNumber(facts?.max_hr)),
      elevation_gain: (coerceNumber(facts?.elevation_gain_ft) != null) ? `${Math.round(Number(facts.elevation_gain_ft))} ft` : null,
      terrain: typeof facts?.terrain_type === 'string' ? facts.terrain_type : null,
      athlete_reported: facts?.athlete_reported ?? null,
    },
    plan: facts?.plan
      ? {
          week_number: typeof facts.plan?.week_number === 'number' ? facts.plan.week_number : null,
          phase: typeof facts.plan?.phase === 'string' ? facts.plan.phase : null,
          workout_purpose: typeof facts.plan?.workout_purpose === 'string' ? facts.plan.workout_purpose : null,
          week_intent: typeof facts.plan?.week_intent === 'string' ? facts.plan.week_intent : null,
          is_recovery_week: typeof facts.plan?.is_recovery_week === 'boolean' ? facts.plan.is_recovery_week : null,
          days_until_race: typeof facts.plan?.days_until_race === 'number' && facts.plan.days_until_race > 0 ? facts.plan.days_until_race : null,
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
            pace_vs_range: (() => {
              const segs = Array.isArray(facts?.segments) ? facts.segments : [];
              const work = segs
                .filter((s: any) => s.target_pace_sec_per_mi != null && !/warm|cool/i.test(String(s.name || '')));
              if (!work.length) return null;
              const devs = work
                .map((s: any) => coerceNumber(s.pace_deviation_sec))
                .filter((n): n is number => n != null && Number.isFinite(n));
              if (!devs.length) return null;
              const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
              if (avg > 15) return 'slower_than_prescribed';
              if (avg < -15) return 'faster_than_prescribed';
              return 'within_range';
            })(),
          }
        : null,
      hr_drift: (() => {
        if (suppressHrDriftForIntervals) return null;
        const paceNorm = coerceNumber(derived?.pace_normalized_drift_bpm);
        const raw = coerceNumber(derived?.hr_drift_bpm);
        if (raw == null) return null;
        if (paceNorm != null) return `${Math.round(paceNorm)} bpm (pace-normalized)`;
        return `${Math.round(raw)} bpm`;
      })(),
      hr_drift_raw_absolute: (!suppressHrDriftForIntervals && coerceNumber(derived?.hr_drift_bpm) != null)
        ? `${Math.round(Number(derived.hr_drift_bpm))} bpm`
        : null,
      hr_drift_terrain_contribution: (!suppressHrDriftForIntervals && coerceNumber(derived?.terrain_contribution_bpm) != null)
        ? `${Math.round(Number(derived.terrain_contribution_bpm))} bpm`
        : null,
      drift_explanation: derived?.drift_explanation ?? null,
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
                  history: Array.isArray((derived.terrain_context.route_runs as any).history)
                    ? (derived.terrain_context.route_runs as any).history
                    : [],
                }
              : null,
          }
        : null,
    },
    segments: displaySegments,
  };
}

/** @deprecated — kept for backwards-compat; fields are ignored. */
export type GenerateAISummaryV1Options = {
  readinessLoadContextText?: string | null;
  narrativeCapsAppend?: string | null;
};

export async function generateAISummaryV1(
  factPacket: FactPacketV1,
  flags: FlagV1[],
  _coachingContext?: string | null,
  _opts?: GenerateAISummaryV1Options | null,
  arcNarrative?: ArcNarrativeContextV1 | null,
): Promise<string | null> {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    console.warn('[ai-summary] ANTHROPIC_API_KEY not set — skipping narrative generation');
    return null;
  }

  const displayPacket = toDisplayFormatV1(factPacket, flags);

  const arcFacts = arcNarrative ? arcNarrativeFactBlock(arcNarrative) : '';
  const userMessage =
    `${arcFacts ? `\nTEMPORAL ARC CONTEXT (do not contradict; paraphrase for athlete):\n${arcFacts}\n` : ''}` +
    buildUserMessage(displayPacket);
  const systemPrompt =
    `${arcTemporalSystemPrefix(arcNarrative)}${COACHING_SYSTEM_PROMPT}${arcModeSystemAddon(arcNarrative)}`;
  const numericAllowAnchors =
    arcNarrative ? JSON.stringify(arcNarrative) : '';

  try {
    const s1 = await callLLMParagraph(systemPrompt, userMessage, 0.2);
    if (!s1) { console.warn('[ai-summary] attempt 1 returned empty'); return null; }
    const v1 = validateNoNewNumbers(s1, displayPacket, numericAllowAnchors);
    const z1 = validateNoZoneTimeClaims(s1, displayPacket);
    const len1 = validateAdaptiveLength(s1, displayPacket, arcNarrative?.mode);
    const td1 = validateTerrainExplainsDrift(s1, displayPacket);
    const g1 = validateNoGenericFiller(s1);
    const hr1 = validateNoHrWithoutData(s1, displayPacket);
    const pd1 = validateNoPaceDeltaFormat(s1);
    const ac1 = validateNoAthleteContradiction(s1, displayPacket);
    const rp1 = validateNoRpeClaimsWithoutAthleteReport(s1, displayPacket);
    if (v1.ok && z1.ok && len1.ok && td1.ok && g1.ok && hr1.ok && pd1.ok && ac1.ok && rp1.ok) return s1;
    console.warn('[ai-summary] attempt 1 rejected:', JSON.stringify({ num: v1.ok, bad: v1.bad, zone: z1.why, len: len1.why, td: td1.why, filler: g1.why, hr: hr1.why, pd: pd1.why, ac: ac1.why, rp: rp1.why }));

    const corrections = [
      v1.bad.length ? 'Bad numeric tokens: ' + v1.bad.join(', ') : null,
      z1.why, len1.why, td1.why, g1.why, hr1.why, pd1.why, ac1.why, rp1.why,
    ].filter(Boolean);
    const corrective = userMessage + '\n\nYou violated constraints:\n' + corrections.map(c => '- ' + c).join('\n') + '\nRewrite and fix.';
    const s2 = await callLLMParagraph(systemPrompt, corrective, 0);
    if (!s2) { console.warn('[ai-summary] attempt 2 returned empty'); return null; }
    const v2 = validateNoNewNumbers(s2, displayPacket, numericAllowAnchors);
    const z2 = validateNoZoneTimeClaims(s2, displayPacket);
    const len2 = validateAdaptiveLength(s2, displayPacket, arcNarrative?.mode);
    const td2 = validateTerrainExplainsDrift(s2, displayPacket);
    const g2 = validateNoGenericFiller(s2);
    const hr2 = validateNoHrWithoutData(s2, displayPacket);
    const pd2 = validateNoPaceDeltaFormat(s2);
    const ac2 = validateNoAthleteContradiction(s2, displayPacket);
    const rp2 = validateNoRpeClaimsWithoutAthleteReport(s2, displayPacket);
    if (v2.ok && z2.ok && len2.ok && td2.ok && g2.ok && hr2.ok && pd2.ok && ac2.ok && rp2.ok) return s2;
    console.warn('[ai-summary] attempt 2 also rejected:', JSON.stringify({ num: v2.ok, zone: z2.why, len: len2.why, td: td2.why, filler: g2.why, hr: hr2.why, pd: pd2.why, ac: ac2.why, rp: rp2.why }));
    if (!hr2.ok || !ac2.ok || !rp2.ok) return null;
    return s2;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}
