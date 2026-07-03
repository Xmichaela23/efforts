import type { FactPacketV1, FlagV1 } from './types.ts';
import { coerceNumber, secondsToPaceString } from './utils.ts';
import { callLLM } from '../llm.ts';
// Shared narrative-reasoning core (continuity leg #3 — D-187). The 7-rule scaffold + the shared
// validator suite, single-sourced; run plugs in via the run adapter. See docs/WORK-ORDER-narrative-core.md.
import { buildReasoningScaffold, validateNarrative, runAdapter, type DisciplineVerdict } from '../narrative-core/index.ts';
import type { ArcNarrativeContextV1, ArcNarrativeMode } from '../arc-narrative-state.ts';
import { arcModeSystemAddon, arcNarrativeFactBlock, arcPostRaceComparisonAddon, arcUnplannedBackwardAnchorAddon } from '../arc-narrative-ai-appendix.ts';

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

MIXED-EFFORT MODE — when the user message includes an INTERVAL EXECUTION block, this was a structured interval session, fartlek, or detected mixed-effort run:
- DO NOT compare whole-workout PACE averages to easy-run history. The athlete didn't run at a single steady effort, so a single pace delta vs steady history is meaningless. The packet nulls vs_similar.assessment, vs_similar.pace_delta, and vs_similar.pace_basis in this mode; do not invent them.
- HR COMPARISON IS VALID. vs_similar.hr_delta, vs_similar.drift_delta, and the trend block remain populated when the historical pool exists, because HR at intensity is comparable across sessions even when pace varies. "HR ran +N bpm vs similar efforts" is a legitimate read of cardiovascular load. The trend's direction/magnitude give aerobic context across the recent block.
- INTERPRET the interval execution: which work intervals hit the prescribed range, where the athlete drifted, how recoveries went. Lead with the structure ("5 × 3 min at threshold"), the completion ratio, and one specific interval that tells the story (a fade on #4, a strong final).
- USE GAP when "grade-adjusted" is noted on the pace adherence line. The interval paces in INTERVAL EXECUTION are already GAP-corrected when that flag is set — anchor the effort read on those values, not raw pace.
- DO NOT say "you ran faster/slower than recent similar efforts" or any whole-workout pace comparison sentence. There is no honest steady pace comparison to make.

AEROBIC EFFICIENCY TREND — fires when signals.aerobic_direction is present (non-null):
- 'improving': pace at easy HR is trending faster vs the athlete's recent baseline — aerobic base is building. Say this in plain terms when it's contextually relevant (e.g. on an easy / long run); skip on hard / interval sessions where it would feel grafted on.
- 'stable': aerobic efficiency holding steady vs baseline. Mention only if directly relevant to the narrative; this is the default state, not news.
- 'declining': pace at easy HR is slowing vs baseline — worth noting if it persists, but one session doesn't confirm a trend. Frame as "worth watching", not as alarm. Do NOT say the athlete is "losing fitness" from a single week's signal.
- NEVER print the raw signals.aerobic_efficiency_trend_pct percentage — translate to plain language only. Same discipline as cardiac_decoupling.
- This is a WEEKLY LONGITUDINAL signal aggregated from compute-snapshot, not a per-session measurement. Frame it as background context, not a verdict on today's workout. Do NOT conflate this trend with the current session's HR drift, vs_similar HR delta, or the TREND sparkline (those are session/pool-level).
- Composes with all other prompt rules — if POST-RACE COMPARISON or POOL INTENSITY CONTEXT also apply, all apply.

TREND POOL RACE BOUNDARY — when signals.comparisons.vs_similar is present AND vs_similar.trend_pool_crosses_race_boundary === true:
- The TREND sparkline includes points from BEFORE a recent completed goal race AND from after it. Pre-race points reflect peak-taper fitness; post-race points reflect re-entry. Treating direction across that boundary as a fitness signal is misleading — they're different training phases.
- DO NOT cite the trend's direction (improving / declining / stable) as a fitness claim. Do NOT say "you're trending faster" or "pace has slowed over the last N workouts" based on the trend block when this flag is true.
- You MAY describe the trend as a limited-sample observation if relevant ("Your recent runs since the race are settling into the X:XX/mi range") — but anchor on the workouts since the race, not the pre-race comparison.
- This rule composes with POOL INTENSITY CONTEXT and POST-RACE COMPARISON; if any apply, all apply.

POOL INTENSITY CONTEXT — when signals.comparisons.vs_similar is present AND vs_similar.pool_pace_context is populated, anchor any HR-delta interpretation against pool_pace_context.intensity_match:
- "current_much_faster": the comparison pool was significantly easier than this session. HR running higher than the pool is structurally expected and reflects intensity, not fitness change. Say so plainly (e.g. "your recent similar runs were easier paces, so the higher HR today tracks with the harder effort"). Do NOT frame the HR delta as fatigue, post-race recovery, aerobic decline, cardiovascular elevation, or any longitudinal signal. Do NOT print or quote pool_pace_context.delta_pct or delta_sec — use the words.
- "current_much_slower": pool was significantly harder than this session. HR running lower than the pool is structurally expected — easier effort. Do NOT frame this as a fitness improvement signal in isolation.
- "matched": pool intensity comparable to current session. HR delta is a legitimate cross-session comparison; interpret normally (use drift signals, arc context, etc.).
- This rule takes PRIORITY over generic vs_similar HR interpretation. It composes with POST-RACE COMPARISON and MIXED-EFFORT MODE — if any of them apply, all apply.

AEROBIC DECOUPLING (RUN) — when signals.cardiac_decoupling is present AND signals.decoupling_basis === 'gap':
- This is grade-adjusted: the pace input feeding the decoupling ratio used GAP, not raw pace. Terrain confound is removed. The number reflects real cardiovascular efficiency drift across the workout, not how the route happened to slope.
- Translate the value to plain language; NEVER print the percentage:
  • signals.decoupling_assessment === 'excellent' (<3%) → "heart rate stayed controlled as effort held — strong aerobic efficiency."
  • 'good' (3–5%) → "modest efficiency drift over the second half — typical for the duration."
  • 'moderate' (5–8%) → "noticeable efficiency drop — your body worked harder to maintain effort late."
  • 'high' (≥8%) → "significant decoupling — this effort pushed your aerobic limits, or fatigue accumulated."
- Decoupling and HR drift are distinct. Drift answers "did HR climb?" (can be terrain-driven; use the existing drift_explanation field). Decoupling at gap basis answers "did efficiency drop?" — fitness, not geography.
- Treat the decoupling read as one observation among others; do not lead with it unless it's the most striking signal in the data.

AEROBIC DECOUPLING (RUN) — when signals.decoupling_basis === 'raw' AND signals.is_mixed_effort === true (fartlek / detected interval session with no usable steady block):
- Treat the decoupling number as inconclusive. The first-half / second-half ratio is dominated by where in the session the hard intervals fell, not by efficiency drift. Do NOT use the number to claim fitness or fatigue. Describe what HR did in plain terms across the variable efforts (drift_explanation, drift bpm vs typical) instead.

AEROBIC DECOUPLING (RUN) — when signals.decoupling_basis === 'raw' AND signals.is_mixed_effort !== true (steady-state session, no usable GPS elevation but the effort was genuinely steady):
- The decoupling number is meaningful here even at raw basis. The session was steady-effort (low CV passed the variance gate), so the pace:HR ratio split first/second half reflects real cardiovascular efficiency. The only caveat vs gap basis: terrain influence on raw pace isn't removed, but on a flat or treadmill session (the typical raw-basis case) terrain wasn't a factor anyway.
- DO surface the assessment as you would for gap basis — translate, never print the percentage:
  • signals.decoupling_assessment === 'excellent' (<3%) → "HR stayed controlled as effort held — strong aerobic efficiency for this duration."
  • 'good' (3–5%) → "modest HR drift over the second half — typical for the duration."
  • 'moderate' (5–8%) → "noticeable HR drift — your body worked harder to maintain pace late."
  • 'high' (≥8%) → "significant drift — this effort pushed your aerobic limits, or fatigue accumulated."
- Where possible, pair the assessment with the bpm drift number from drift_explanation / hr_drift for concreteness ("HR drifted +X bpm over the run — excellent for this duration").

UNPLANNED MODE — when the user message opens with "UNPLANNED SESSION" and there is NO "EXECUTION vs PLAN" block:
- This workout has no linked plan. There was no prescribed target. Do NOT scold the athlete for "missing a target" or "running outside the prescribed range" — there was no range. Do NOT invent what the workout "should have been" from duration alone (a 40-min run is not necessarily a tempo).
- INTERPRET the run on its own terms. Lead with the most interesting observation visible in the actual data, not with a verdict on plan compliance. Options in priority order:
  • HR-to-pace efficiency. Did HR stay controlled for the pace held? Use the pace-normalized drift values; they already account for pace changes.
  • Terrain-aware variance reading. When elevation data is present, read pace variance through the elevation profile. If raw pace swings track the climbs and descents — slow miles on climbs, fast miles on descents — that is TERRAIN, not effort variation. The GAP value is the truth: anchor the effort read there. Do NOT call out raw-pace fluctuation as if it were effort change on a rolling course. If GAP is roughly steady but raw pace swings, say so explicitly — "the climbs added work; flat-equivalent effort was steady."
  • Conditions. Heat, humidity, wind contributions are still load signals.
  • Route / segment history. When ROUTE or FAMILIAR SEGMENTS context is present, compare today against past efforts on the same ground.
- The "vs similar" comparison, if present, IS legitimate signal here (same-category history is honest even without a plan). You may lead with it when sample size is sufficient.
- The workout_type label (easy_run / tempo_run / long_run / interval_run) is a DESCRIPTIVE LABEL ONLY. It was inferred from duration; it is not a target the athlete chose. Do not treat it as a prescription or score against it.
- D-040 Fix B: DO NOT assert a plan phase label (taper / base / build / peak / recovery / deload / race-prep / sharpening) in the narrative for an unplanned session. The session has no linked plan workout, so attaching it to a phase claim is fabrication — even if the ARC FACT BLOCK shows a PLAN_PHASE_BUCKET, that's the broader training plan's state, NOT a prescription for this session. Describe the workout on its own terms; let phase context stay in the ARC block.
- D-043 Q-026: DO NOT frame the session relative to a past completed race when is_unplanned. The ARC FACT BLOCK may show days_since_last_goal_race and LAST_GOAL_RACE for unplanned sessions, but the LLM must NOT use those as the temporal anchor. Forbidden patterns (non-exhaustive): "X days post-[race]", "X days out from your [race]", "X days since [race]", "in your [race] recovery / comeback window", "[race] is behind you", or any temporal anchor (days/weeks ago) tied to a completed race. Reasoning: unplanned sessions on their own give no signal that the athlete is still anchored in a post-race window; the forward-bias rules for build_read / unstructured_read cover linked sessions but unplanned ones fall through. Lead with current-session signals only. The LAST_GOAL_RACE line in the ARC FACT BLOCK is engine bookkeeping; treat as if not in the prompt for the narrative. (Override: if NARRATIVE_MODE is recovery_read or race_debrief, those modes' addons take priority and the comeback framing is required.)

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

export function buildUserMessage(dp: any): string {
  const w = dp.workout || {};
  const sig = dp.signals || {};
  const sections: string[] = [];

  sections.push('Here is the workout data. Answer the athlete\'s unasked questions — don\'t summarize what they can already see.');

  // D-035: unplanned-mode top-line. When signals.execution is null (the gate
  // dropped it because there's no linked plan), tell the LLM up front and the
  // UNPLANNED MODE prompt rule in the system prompt fires.
  const isUnplanned = !sig.execution && !sig.interval_execution;
  if (isUnplanned) {
    sections.push('\nUNPLANNED SESSION — no linked plan. There was no prescribed pace target. Do NOT score against a target; interpret on the workout\'s own terms (see UNPLANNED MODE rule).');
  }

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

  // Similar workouts comparison. For mixed-effort sessions, the pace line is
  // suppressed (assessment + pace_delta nulled in toDisplayFormatV1) but the
  // HR / drift / trend lines still render — HR at intensity remains
  // comparable across effort types. The interval_summary block below carries
  // the per-interval pace read.
  const comp = sig.comparisons;
  if (comp?.vs_similar?.sample_size > 0 && comp.vs_similar.assessment !== 'insufficient_data') {
    const basisNote = comp.vs_similar.pace_basis === 'gap'
      ? ' (grade-adjusted pace; terrain neutralized)'
      : '';
    // Pace line only when assessment is present — null in mixed-effort mode.
    const paceLine = comp.vs_similar.assessment
      ? `- Pace vs similar: ${comp.vs_similar.assessment}${comp.vs_similar.pace_delta ? ` (${comp.vs_similar.pace_delta}${basisNote})` : ''}`
      : null;
    const hrLine = comp.vs_similar.hr_delta ? `- HR vs similar: ${comp.vs_similar.hr_delta}` : null;
    const driftLine = comp.vs_similar.drift_delta ? `- Drift vs similar: ${comp.vs_similar.drift_delta}` : null;
    const trendLine = comp.trend?.direction && comp.trend.direction !== 'insufficient_data'
      ? `- Trend: ${comp.trend.direction}${comp.trend.magnitude ? ` — ${comp.trend.magnitude}` : ''} (${comp.trend.data_points} data points)`
      : null;
    // D-038 Piece 3: pool intensity context. Render only when intensity_match
    // is non-matched — a balanced pool doesn't need extra LLM steering. The
    // POOL INTENSITY CONTEXT prompt rule above keys off the enum, not the
    // numbers; don't print delta_pct/delta_sec in the prompt input either.
    const poolCtx = (comp.vs_similar as any).pool_pace_context;
    const poolCtxLine = poolCtx && poolCtx.intensity_match && poolCtx.intensity_match !== 'matched'
      ? `- Pool intensity vs this session: ${poolCtx.intensity_match}`
      : null;
    const bodyLines = [paceLine, hrLine, driftLine, trendLine, poolCtxLine].filter(Boolean);
    if (bodyLines.length > 0) {
      sections.push([`\nCOMPARED TO SIMILAR WORKOUTS (n=${comp.vs_similar.sample_size}):`, ...bodyLines].join('\n'));
    }
  }

  // D-NNN: interval summary for mixed-effort sessions. Interpret per-interval
  // execution; do not compare whole-workout averages to easy-run history.
  const ivSum = sig.interval_summary;
  if (ivSum && (Array.isArray(ivSum.work_intervals) && ivSum.work_intervals.length > 0)) {
    const lines: string[] = [`\nINTERVAL EXECUTION (interpret per-interval; this was a ${ivSum.structure === 'planned' ? 'structured' : 'detected mixed-effort'} session — do NOT compare whole-workout averages to easy-run history):`];
    if (ivSum.completed_steps != null && ivSum.total_steps != null) {
      lines.push(`- Completed: ${ivSum.completed_steps}/${ivSum.total_steps} work steps`);
    }
    if (ivSum.execution_score) lines.push(`- Execution score: ${ivSum.execution_score}`);
    if (ivSum.grade_adjusted) lines.push(`- Pace adherence is grade-adjusted (GAP) — use the GAP pace as the effort read`);
    lines.push('- Work intervals:');
    for (const iv of ivSum.work_intervals) {
      const head = iv.n != null ? `  • Interval ${iv.n}` : '  •';
      const parts: string[] = [];
      if (iv.planned_label) parts.push(`planned ${iv.planned_label}`);
      if (iv.actual_dur) parts.push(`actual ${iv.actual_dur}`);
      if (iv.actual_pace) parts.push(`@ ${iv.actual_pace}${ivSum.grade_adjusted ? ' (GAP)' : ''}`);
      if (iv.pace_adherence_pct != null) parts.push(`adherence ${iv.pace_adherence_pct}%`);
      if (iv.hr_avg != null) parts.push(`HR ${iv.hr_avg}${iv.hr_max != null ? ` (max ${iv.hr_max})` : ''}`);
      lines.push(`${head}: ${parts.join(', ')}`);
    }
    if (Array.isArray(ivSum.recovery_intervals) && ivSum.recovery_intervals.length > 0) {
      lines.push('- Recoveries:');
      for (const iv of ivSum.recovery_intervals) {
        const head = iv.n != null ? `  • Recovery ${iv.n}` : '  •';
        const parts: string[] = [];
        if (iv.actual_dur) parts.push(`${iv.actual_dur}`);
        if (iv.actual_pace) parts.push(`@ ${iv.actual_pace}${ivSum.grade_adjusted ? ' (GAP)' : ''}`);
        if (iv.hr_avg != null) parts.push(`HR ${iv.hr_avg}`);
        lines.push(`${head}: ${parts.join(', ')}`);
      }
    }
    sections.push(lines.join('\n'));
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

  // Terrain segments. D-039 Fix 2: no route name — was auto-generated
  // server-side, not athlete-named. Generic phrasing only.
  if (sig.terrain?.route) {
    sections.push(`\nROUTE HISTORY: a route the athlete has run ${sig.terrain.route.times_run} times before. Refer to it generically ("this route", "the same route") — do NOT invent a name.`);
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

export function toDisplayFormatV1(
  packet: FactPacketV1,
  flags: FlagV1[],
  varianceGate?: VarianceGateOptions | null,
  unplannedGate?: UnplannedGateOptions | null,
  arcNarrative?: ArcNarrativeContextV1 | null,
  aerobicTrend?: AerobicTrendOptions | null,
) {
  const facts = packet?.facts as any;
  const derived = packet?.derived as any;
  const segments = Array.isArray(facts?.segments) ? facts.segments : [];

  // D-NNN: when the variance gate is active, the new is_mixed_effort flag is
  // the canonical signal. Fall back to the legacy in-display heuristic only when
  // the gate isn't wired (older callers that didn't pass varianceGate).
  const isMixedEffort = varianceGate?.isMixedEffort === true;
  // D-035: when isUnplanned, drop the entire execution-vs-plan block from the
  // LLM input. There was no plan, so a "pace vs prescribed range" signal would
  // be a lie.
  const isUnplanned = unplannedGate?.isUnplanned === true;
  const suppressHrDriftForIntervals = isMixedEffort || (() => {
    if (varianceGate) return false; // gate is authoritative when wired
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
      // First-run-back gate from arc narrative. When true AND vs_similar.hr_delta
      // is present, the POST-RACE COMPARISON prompt rule fires and suppresses
      // "elevated HR vs similar efforts" narration — the pool spans pre-race
      // peak-fitness runs, so the delta is structurally expected, not diagnostic.
      is_first_post_race_run: arcNarrative?.is_first_post_race_run === true,
      // D-039 Fix 4: surface is_mixed_effort so the AEROBIC DECOUPLING (RUN)
      // raw-branch can split: (a) mixed-effort + raw → inconclusive (D-037
      // forces basis='raw' on fartleks; the first-half/second-half ratio is
      // dominated by interval distribution); (b) steady-state + raw → drift
      // is meaningful (no GPS elevation, but session is genuinely steady so
      // the pace:HR ratio reflects real efficiency).
      is_mixed_effort: isMixedEffort,
      // D-042: weekly aerobic efficiency trend from athlete_snapshot.
      // run_easy_hr_trend is pctChange(this week's pace-at-easy-HR vs chronic).
      // Drives AEROBIC EFFICIENCY TREND prompt rule. Bands ±2% match
      // compute-snapshot:409 derivation. Field name is a misnomer (pace
      // delta, not HR delta) — kept for source-of-truth alignment; rename
      // is filed as a separate cleanup.
      aerobic_efficiency_trend_pct: aerobicTrend?.runEasyPaceAtHrTrendPct != null && Number.isFinite(aerobicTrend.runEasyPaceAtHrTrendPct)
        ? aerobicTrend.runEasyPaceAtHrTrendPct
        : null,
      aerobic_direction: (() => {
        const v = aerobicTrend?.runEasyPaceAtHrTrendPct;
        if (v == null || !Number.isFinite(v)) return null;
        if (v < -2) return 'improving' as const;
        if (v > 2) return 'declining' as const;
        return 'stable' as const;
      })(),
      // D-035: drop the entire execution-vs-plan signal block when there's no
      // linked plan. distance_deviation / pace_vs_range / "assessed against"
      // notes all imply a prescription existed. Keeping them would invite the
      // LLM to score adherence to a fiction.
      execution: (isUnplanned ? null : derived?.execution)
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
      // D-036: basis tells the LLM whether decoupling is a real fitness signal
      // (terrain-neutral via GAP) or terrain-contaminated and inconclusive.
      // Surfaced only when decoupling itself is present.
      decoupling_basis: (coerceNumber(derived?.cardiac_decoupling_pct) != null)
        ? ((derived?.decoupling_basis as 'gap' | 'raw' | null) ?? null) : null,
      decoupling_assessment: (coerceNumber(derived?.cardiac_decoupling_pct) != null)
        ? ((derived?.decoupling_assessment as 'excellent' | 'good' | 'moderate' | 'high' | null) ?? null) : null,
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
            // Mixed-effort scope: pace comparisons across heterogeneous
            // efforts are invalid (a fartlek's whole-workout avg pace vs
            // easy-run history is meaningless), so pace fields + the combined
            // assessment null when isMixedEffort. HR at intensity remains
            // comparable across sessions regardless of effort type — preserve
            // hr_delta, drift_delta, and the trend block so the LLM keeps
            // historical cardiovascular context. The interval_summary block
            // below still carries the per-interval pace read.
            vs_similar: {
              assessment: isMixedEffort ? null : (derived.comparisons?.vs_similar?.assessment ?? null),
              sample_size: derived.comparisons?.vs_similar?.sample_size ?? 0,
              pace_delta: isMixedEffort ? null : fmtDeltaSecPerMi(coerceNumber(derived.comparisons?.vs_similar?.pace_delta_sec)),
              pace_basis: isMixedEffort ? null : (derived.comparisons?.vs_similar?.pace_basis ?? 'raw'),
              hr_delta: (coerceNumber(derived.comparisons?.vs_similar?.hr_delta_bpm) != null) ? `${Math.round(Number(derived.comparisons.vs_similar.hr_delta_bpm))} bpm` : null,
              drift_delta: (coerceNumber(derived.comparisons?.vs_similar?.drift_delta_bpm) != null) ? `${Math.round(Number(derived.comparisons.vs_similar.drift_delta_bpm))} bpm` : null,
              // D-038 Piece 3: pool_pace_context always-on (no isMixedEffort
              // gating). The POOL INTENSITY CONTEXT prompt rule keys off
              // intensity_match to suppress fatigue/recovery framing when the
              // HR delta is driven by pace mismatch. Numeric fields stay on
              // the packet for diagnostics — the prompt rule must NOT instruct
              // the LLM to quote them (same defense as cardiac_decoupling's
              // "translate, never print").
              pool_pace_context: (derived.comparisons?.vs_similar as any)?.pool_pace_context ?? null,
              // D-041 Fix D: TREND POOL RACE BOUNDARY prompt rule keys off
              // this flag — when true, trend pool spans pre/post a recent
              // completed goal race AND the post-race-only filter would have
              // dropped the pool below 3 points. LLM treats trend direction
              // as limited sample, not fitness signal.
              trend_pool_crosses_race_boundary: (derived.comparisons?.vs_similar as any)?.trend_pool_crosses_race_boundary === true,
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
      // D-NNN: interval_summary replaces the steady comparison when mixed-effort.
      // Per-interval execution (planned label, actual GAP-aware pace, HR,
      // adherence) lets the LLM interpret the structure instead of pretending it
      // was a steady run. Built from analyzer's detailed_analysis.interval_breakdown.
      interval_summary: (isMixedEffort && Array.isArray(varianceGate?.intervalBreakdown?.intervals) && varianceGate!.intervalBreakdown!.intervals!.length >= 2)
        ? (() => {
            const ivs = varianceGate!.intervalBreakdown!.intervals!;
            const ie = derived?.interval_execution || {};
            const fmtPace = (v: any) => {
              const n = coerceNumber(v);
              if (n == null || n <= 0) return null;
              const m = Math.floor(n / 60);
              const s = Math.round(n % 60);
              return `${m}:${String(s).padStart(2, '0')}/mi`;
            };
            const fmtPaceMin = (v: any) => {
              const n = coerceNumber(v);
              if (n == null || n <= 0) return null;
              return fmtPace(n * 60);
            };
            const fmtDur = (v: any) => {
              const n = coerceNumber(v);
              if (n == null || n <= 0) return null;
              const m = Math.floor(n / 60);
              const s = Math.round(n % 60);
              return `${m}:${String(s).padStart(2, '0')}`;
            };
            const work = ivs.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'work');
            const recovery = ivs.filter((iv: any) => String(iv?.interval_type || '').toLowerCase() === 'recovery');
            return {
              structure: (typeof ie?.total_steps === 'number' && ie.total_steps >= 2) ? 'planned' : 'detected_unplanned',
              completed_steps: ie?.completed_steps ?? null,
              total_steps: ie?.total_steps ?? work.length ?? null,
              execution_score: typeof ie?.execution_score === 'number' ? `${Math.round(ie.execution_score)}%` : null,
              grade_adjusted: !!ie?.gap_adjusted,
              work_intervals: work.slice(0, 12).map((iv: any) => ({
                n: iv?.interval_number ?? null,
                planned_label: typeof iv?.planned_label === 'string' && iv.planned_label.trim() ? iv.planned_label : null,
                actual_pace: fmtPaceMin(iv?.actual_pace_min_per_mi),
                actual_dur: fmtDur(iv?.actual_duration_s),
                pace_adherence_pct: typeof iv?.pace_adherence_percent === 'number' ? Math.round(iv.pace_adherence_percent) : null,
                hr_avg: iv?.avg_heart_rate_bpm ?? null,
                hr_max: iv?.max_heart_rate_bpm ?? null,
              })),
              recovery_intervals: recovery.slice(0, 12).map((iv: any) => ({
                n: iv?.recovery_number ?? null,
                planned_label: typeof iv?.planned_label === 'string' && iv.planned_label.trim() ? iv.planned_label : null,
                actual_pace: fmtPaceMin(iv?.actual_pace_min_per_mi),
                actual_dur: fmtDur(iv?.actual_duration_s),
                hr_avg: iv?.avg_heart_rate_bpm ?? null,
              })),
            };
          })()
        : null,
      stimulus: derived?.stimulus
        ? {
            achieved: !!derived.stimulus.achieved,
            confidence: derived.stimulus.confidence ?? null,
            evidence: Array.isArray(derived.stimulus.evidence) ? derived.stimulus.evidence.slice(0, 3) : [],
            partial_credit: derived.stimulus.partial_credit ?? null,
          }
        : null,
      // D-035: drop interval_execution block when unplanned. Its fields
      // (execution_score, pace_adherence, completed_steps) all describe
      // adherence to a plan that doesn't exist.
      interval_execution: (isUnplanned ? null : derived?.interval_execution)
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
            // D-039 Fix 2: `name` dropped from route surface. Auto-named
            // server-side; LLM was upgrading the label into an asserted
            // identity. Generic "a route you've run N times" framing only.
            route: derived.terrain_context.route_runs
              ? {
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

/**
 * D-NNN variance-gate options. When isMixedEffort is true, the LLM input drops
 * the steady-effort vs_similar comparison block and surfaces an interval
 * summary instead. The intervalBreakdown is the analyzer's
 * `detailed_analysis.interval_breakdown` (carries per-interval planned_label,
 * actual pace, HR, pace_adherence_percent — already GAP-aware per
 * granular-pace.ts).
 */
export type VarianceGateOptions = {
  isMixedEffort: boolean;
  intervalBreakdown: { intervals?: any[]; available?: boolean } | null;
};

/**
 * D-035: When isUnplanned is true, the LLM input drops the prescribed-range
 * signal block (there was no prescription) and the buildUserMessage emits an
 * UNPLANNED SESSION top-line so the LLM's UNPLANNED MODE prompt rule fires.
 */
export type UnplannedGateOptions = {
  isUnplanned: boolean;
};

/**
 * D-042 / D-043 — weekly aerobic efficiency trend forwarded from
 * `arc.latest_snapshot`. `runEasyPaceAtHrTrendPct` is the pctChange value
 * (compute-snapshot:374) — pace at easy HR vs chronic. Negative = pace
 * getting faster at same HR = aerobic base building. Surfaced on display
 * packet for the AEROBIC EFFICIENCY TREND prompt rule.
 *
 * D-060 (2026-05-25): DB column renamed `run_easy_hr_trend` →
 * `run_easy_pace_at_hr_trend` to match the variable + type semantic.
 * Migration: `supabase/migrations/20260525_rename_run_easy_hr_trend.sql`.
 * Code-side consumers coordinated in compute-snapshot, coach,
 * analyze-running-workout, longitudinal-signals, useAthleteSnapshot.
 */
export type AerobicTrendOptions = { runEasyPaceAtHrTrendPct?: number | null };

export async function generateAISummaryV1(
  factPacket: FactPacketV1,
  flags: FlagV1[],
  _coachingContext?: string | null,
  _opts?: GenerateAISummaryV1Options | null,
  arcNarrative?: ArcNarrativeContextV1 | null,
  varianceGate?: VarianceGateOptions | null,
  unplannedGate?: UnplannedGateOptions | null,
  aerobicTrend?: AerobicTrendOptions | null,
  spineVerdict?: DisciplineVerdict | null, // Q-112 step 2: the run's state_trends_v1 verdict (rules 6/7)
): Promise<string | null> {
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    console.warn('[ai-summary] ANTHROPIC_API_KEY not set — skipping narrative generation');
    return null;
  }

  const displayPacket = toDisplayFormatV1(factPacket, flags, varianceGate ?? null, unplannedGate ?? null, arcNarrative ?? null, aerobicTrend ?? null);

  const arcFacts = arcNarrative ? arcNarrativeFactBlock(arcNarrative) : '';
  const userMessage =
    `${arcFacts ? `\nTEMPORAL ARC CONTEXT (do not contradict; paraphrase for athlete):\n${arcFacts}\n` : ''}` +
    buildUserMessage(displayPacket);
  // arcPostRaceComparisonAddon emits empty string when is_first_post_race_run
  // is false; safe to always append. arcUnplannedBackwardAnchorAddon (D-046 /
  // Q-026) emits empty when not unplanned or when mode override applies.
  // D-187: inject the shared reasoning-core scaffold (Rule 1 lead-signal=pace+grade+heat+drift fixes the
  // heat-silo; Rule 2 reconcile atypical drift; Rule 4 cause allowlist; + the run addendum). Assembly is
  // NOT unified — the scaffold is APPENDED to the existing sectional run prompt (work-order guardrail #1).
  const ncCtx = runAdapter.buildContext(factPacket);
  // Q-112 step 2: carry the spine's run verdict so rules 6 (no trend-direction claim contradicting the
  // spine) + 7 (no recap of the on-screen receipt %) apply to the per-workout INSIGHTS — the same core
  // the coach week narrative uses. Rule 6 keys on trend vocabulary, so single-session prose is unaffected.
  if (spineVerdict) (ncCtx as any).disciplineVerdicts = [spineVerdict];
  const systemPrompt =
    `${arcTemporalSystemPrefix(arcNarrative)}${COACHING_SYSTEM_PROMPT}${arcModeSystemAddon(arcNarrative)}${arcPostRaceComparisonAddon(arcNarrative)}${arcUnplannedBackwardAnchorAddon(arcNarrative, unplannedGate?.isUnplanned === true)}${buildReasoningScaffold(runAdapter, factPacket)}`;
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
    const nc1 = validateNarrative(s1, ncCtx); // D-187 shared core: rules 1/2/4/5 (heat-silo, contradiction, cause, single-session)
    if (v1.ok && z1.ok && len1.ok && td1.ok && g1.ok && hr1.ok && pd1.ok && ac1.ok && rp1.ok && nc1.ok) return s1;
    console.warn('[ai-summary] attempt 1 rejected:', JSON.stringify({ num: v1.ok, bad: v1.bad, zone: z1.why, len: len1.why, td: td1.why, filler: g1.why, hr: hr1.why, pd: pd1.why, ac: ac1.why, rp: rp1.why, core: nc1.failures.map(f => f.code) }));

    const corrections = [
      v1.bad.length ? 'Bad numeric tokens: ' + v1.bad.join(', ') : null,
      z1.why, len1.why, td1.why, g1.why, hr1.why, pd1.why, ac1.why, rp1.why,
      ...nc1.failures.map(f => f.why),
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
    const nc2 = validateNarrative(s2, ncCtx);
    if (v2.ok && z2.ok && len2.ok && td2.ok && g2.ok && hr2.ok && pd2.ok && ac2.ok && rp2.ok && nc2.ok) return s2;
    console.warn('[ai-summary] attempt 2 also rejected:', JSON.stringify({ num: v2.ok, zone: z2.why, len: len2.why, td: td2.why, filler: g2.why, hr: hr2.why, pd: pd2.why, ac: ac2.why, rp: rp2.why, core: nc2.failures.map(f => f.code) }));
    if (!hr2.ok || !ac2.ok || !rp2.ok) return null;
    return s2;
  } catch (e) {
    console.warn('[fact-packet] ai_summary generation failed:', e);
    return null;
  }
}
