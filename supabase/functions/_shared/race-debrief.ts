/**
 * LLM race debrief — additive path for goal race sessions.
 * Sits alongside marathon-race-narrative.ts deterministic digest.
 * Callers merge result into workouts.workout_analysis.race_debrief_text.
 *
 * Weather: persisted canonical row is `workouts.weather_data` (get-weather / analysis). Client UI uses the
 * same field names via `src/lib/sessionWeather.ts`. Here, `resolveRaceDebriefWeather` adds `race_courses`
 * snapshot + `avg_temperature` device fallback for the LLM fact block only.
 */

import { callLLM } from './llm.ts';

const RACE_DEBRIEF_SYSTEM_PROMPT = `You are a running coach debriefing an athlete after a race.

The athlete already has pace, HR, and splits on screen. Do not recite the split table or dwell on numbers they can read themselves. Your job is interpretation: what the pattern means, and what drove the result.

NARRATIVE STRUCTURE — follow this order exactly:
1) First sentence: name the race and state actual finish time. If a PROJECTED FINISH TIME is provided, also state the gap to that projection — that gap is the only performance delta that matters. If PROJECTED FINISH TIME is "not available", do NOT mention a missing projection or a missing course model; simply state the actual finish and move directly to interpretation. NEVER write phrases like "no course model projection exists" or "no plan gap to close" — the course model and zones may still be present even when the time projection is null.
2) Second sentence: the single most important pacing or execution fact the data supports, stated plainly (not a list of mile splits).
3) Remaining sentences (about three): explain what drove the result using terrain, heart rate, weather, and (when present) the pre-race COURSE STRATEGY ZONES. Name specific miles only when they explain a mechanism—not because a mile was slow or an outlier.

OUTLIER MILES:
- If a mile is roughly two or more minutes slower than neighboring miles and grade does not explain it, you may flag a likely non-running stop in ONE short clause (bathroom, shoe, crowded aid, etc.), then move on. Do not make that mile the thesis of the paragraph. Do not assign a minute-by-minute forensic or accuse the athlete; they know what happened.

TARGET FRAMING:
- The only time benchmark for "how you did vs the plan" is PROJECTED FINISH TIME (a single number derived from the course model). Ignore any other stored target times even if they appeared elsewhere in tooling. If PROJECTED FINISH TIME is unavailable, the debrief is purely about execution quality — say nothing about missing projections; analyze the run on its own terms using zones, terrain, HR, and weather.

VOCABULARY — DO NOT INVENT MISSING DATA:
- "PROJECTED FINISH TIME" is a TIME, not a model. When it is unavailable, the COURSE STRATEGY ZONES (and the rest of the data) are usually still present. Do not claim the course model, course profile, or strategy is missing. Never write "no course model exists for X" or similar.

TERRAIN:
- Grade is per mile: positive = uphill, negative = downhill. Pace loss on real climb with appropriate HR is terrain. Pace loss on easy grade with rising HR in heat points to thermoregulation competing with locomotion—say that plainly, once.

WEATHER:
- Use the supplied temps and humidity. Rough guide: about +1 bpm cardiac load per ~1.8°F rise in ambient temperature during a long effort; high humidity tightens that. Sunny late race adds demand on top of pace.
- The fact block includes WEATHER MERGE (authoritative): follow it. If start/finish temp or humidity appears as a number in WEATHER, you MUST use it—never write that weather is missing, unknown, or unavailable for this session.

HEART RATE — DO NOT ROMANTICIZE DRIFT:
- Late-race HR climbing is normal physiology, not a story about toughness. After roughly three hours of sustained running, HR rises even at constant perceived effort: that is natural cardiovascular drift.
- When you describe HR in the second half, decompose it into the causes the data supports—do not collapse them into one heroic arc:
  (1) Time on feet / natural drift in hour four and beyond.
  (2) Heat load: use the supplied start vs finish temp (and humidity, conditions) to attribute part of the rise; temperature rise adds cardiac cost independent of pace.
  (3) Terrain: rising HR on positive grade or hard climbing segments is terrain cost; align with grade column and any caution/climb sections implied by the splits.
- Do not frame late-race HR as the athlete "pushing," "not folding," "holding what the legs wanted," or "cardiovascular system working hard" unless pace actually increased relative to what the grade would predict (i.e. real acceleration, not drift-plus-heat-plus-hills).
- Forbidden motivational HR clichés include: "didn't fold," "pushing through," "what's interesting is," "working hard to hold," "legs wanted to give."

VOICE:
- Direct, human, like a coach talking to one person. No report tone.
- No idioms, no slogans, no "real talk," no filler praise, no motivational clichés.

OUTPUT FORMAT — follow exactly:
Write four labeled sections. Each section label is on its own line in brackets, followed by 1–3 sentences of plain prose. No bullets, no sub-headers inside sections. A blank line between sections.

[EXECUTION]
{First sentence: race name + actual finish + projection gap if available. Second sentence: the single most important pacing or execution fact.}

[CONDITIONS]
{Weather and terrain impact. Decompose late-race HR into causes: heat load, drift, terrain — as the data supports. 1–3 sentences.}

[FINISH]
{What happened in the final miles: pace trend, HR trend, what it means physiologically. 1–2 sentences.}

[TAKEAWAY]
{One concrete line about what to carry forward, anchored to what the course strategy zones prescribed. Do not invent generic advice if the zones already defined targets for those miles.}

CLOSE — STRATEGY-ANCHORED, NOT GENERIC:
- End with one concrete line about what to adjust next time on THIS course. The line MUST be anchored to what the course strategy actually prescribed. Do not invent generic pacing advice ("start 15–20 seconds slower in miles 1–3") if a prescribed zone for those miles already exists in COURSE STRATEGY ZONES.
- Decision tree for the closing line when COURSE STRATEGY ZONES are provided:
  (a) If actual HR/pace in the relevant miles fell INSIDE the prescribed zone's HR band → the strategy itself is what to revisit ("the Conservative zone you executed at HR 130–138 was the right call; consider extending it through mile 5 next time before opening up").
  (b) If actual HR/pace EXCEEDED the prescribed zone's HR band → name the deviation and the zone by name ("your prescribed Conservative band was 125–135 bpm in miles 1–3; you ran 136–137 — that's the dial-back next time").
  (c) If actual was BELOW the prescribed band → say so plainly ("you ran the Cruise miles under the prescribed band — there's room to push that section harder next time").
- Never recommend a numeric pace or HR adjustment for a segment without first checking it against the prescribed zone for that segment. If the strategy already called for what you're about to recommend, recognize the strategy was right and the execution matched — don't repeat the same instruction back to the athlete as if it's new.

COURSE ZONES (from pre-race strategy) — USE THEM, DON'T IGNORE THEM:
- Segments may be listed with effort zones: Conservative, Cruise, Caution, Push (from course strategy generation). Refer to them by zone name ("the Conservative miles", "the Push section through 19–22") when discussing execution.
- When actual HR and pace align with what that zone implied, that is execution matching the plan — not drift or toughness. Say it that way: "you executed the Caution zone at the prescribed HR band."
- When HR or stress exceeds what the zone and HR band suggested for a segment, that is where to explain why (heat, terrain, pace, or stop time) AND where to anchor the closing advice.
- Do not collapse the strategy into raw grade analysis. Zones, mile ranges, and HR bands are all signal; reference them.`;

export type RawCourseSegmentRow = {
  segment_order: number;
  start_distance_m: number;
  end_distance_m: number;
  display_group_id?: number | null;
  effort_zone?: string | null;
  display_label?: string | null;
  coaching_cue?: string | null;
  avg_grade_pct?: number | null;
  terrain_type?: string | null;
  target_hr_low?: number | null;
  target_hr_high?: number | null;
};

export type CourseStrategyZoneLine = {
  mileStart: number;
  mileEnd: number;
  effortZone: string | null;
  displayLabel: string | null;
  coachingCue: string | null;
  targetHrLow: number | null;
  targetHrHigh: number | null;
};

const MI = 1609.34;

/** Collapse geometry segments into display groups (same display_group_id) for debrief mile ranges. */
export function collapseCourseSegmentsToZones(segments: RawCourseSegmentRow[]): CourseStrategyZoneLine[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  const sorted = [...segments]
    .filter((s) => s != null && typeof s === 'object')
    .sort((a, b) => Number(a.segment_order) - Number(b.segment_order));

  const byGroup = new Map<number, RawCourseSegmentRow[]>();
  for (const s of sorted) {
    const gid = s.display_group_id != null && Number.isFinite(Number(s.display_group_id))
      ? Number(s.display_group_id)
      : Number(s.segment_order);
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(s);
  }

  const zones: CourseStrategyZoneLine[] = [];
  for (const [, segs] of byGroup) {
    if (segs.length === 0) continue;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const startM = Number(first.start_distance_m);
    const endM = Number(last.end_distance_m);
    if (!Number.isFinite(startM) || !Number.isFinite(endM)) continue;
    const mileStart = Math.round((startM / MI) * 10) / 10;
    const mileEnd = Math.round((endM / MI) * 10) / 10;
    zones.push({
      mileStart,
      mileEnd,
      effortZone: first.effort_zone != null ? String(first.effort_zone).trim() : null,
      displayLabel: first.display_label != null ? String(first.display_label).trim() : null,
      coachingCue: first.coaching_cue != null ? String(first.coaching_cue).trim() : null,
      targetHrLow: first.target_hr_low != null ? Number(first.target_hr_low) : null,
      targetHrHigh: first.target_hr_high != null ? Number(first.target_hr_high) : null,
    });
  }
  zones.sort((a, b) => a.mileStart - b.mileStart);
  return zones;
}

function formatCourseStrategyZonesBlock(zones: CourseStrategyZoneLine[] | null | undefined): string {
  if (!zones || zones.length === 0) return 'not available';
  return zones
    .map((z) => {
      const zone = z.effortZone
        ? z.effortZone.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : '—';
      const label = z.displayLabel || 'segment';
      const cue = z.coachingCue ? ` — ${z.coachingCue}` : '';
      const hr =
        z.targetHrLow != null && z.targetHrHigh != null
          ? ` | pre-race HR band ${z.targetHrLow}–${z.targetHrHigh} bpm`
          : '';
      return `Mi ${z.mileStart}–${z.mileEnd}: ${zone} (${label})${cue}${hr}`;
    })
    .join('\n');
}

/** Resolved weather for debrief: prefer race-day activity (workout.weather_data), fall back to race_courses snapshot. */
export type RaceDebriefWeatherResolved = {
  startTempF: number | null;
  finishTempF: number | null;
  humidityPct: number | null;
  conditions: string | null;
  /** Provenance for the LLM fact block—single merge rule. */
  provenance: string;
};

function asNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function meaningfulCondition(c: unknown): string | null {
  if (c == null || typeof c !== 'string') return null;
  const t = c.trim();
  if (!t || t === '—' || t === '-' || t.toLowerCase() === 'unknown') return null;
  return t;
}

/** Parse `workouts.weather_data` (JSON string or object) for merge with course strategy. */
export function parseWorkoutWeatherDataBlob(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown;
      return typeof j === 'object' && j != null ? (j as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

/**
 * Single merge rule for race debrief weather:
 * - Per field: prefer `activity` (workout.weather_data from get-weather), then a single representative temp from
 *   `workouts.avg_temperature` (device °C → °F) when Open-Meteo rows are missing, then `race_courses` snapshot.
 * - Activity may expose `temperature` when start/end are absent—used as fallback for both start and finish when needed.
 */
export function resolveRaceDebriefWeather(args: {
  courseStrategy?: {
    start_temp_f?: number | null;
    finish_temp_f?: number | null;
    humidity_pct?: number | null;
    conditions?: string | null;
  } | null;
  activity?: Record<string, unknown> | null;
  /** Garmin / device average temp on the workout row (°C); used only when weather_data has no temps. */
  deviceAvgTempC?: number | null;
}): RaceDebriefWeatherResolved {
  const wd = args.activity;
  const cs = args.courseStrategy;

  const aStart = asNum(wd?.temperature_start_f);
  const aEnd = asNum(wd?.temperature_end_f);
  const aSingle = asNum(wd?.temperature);
  const aHum = asNum(wd?.humidity);
  const aCond = meaningfulCondition(wd?.condition);

  const cStart = asNum(cs?.start_temp_f);
  const cEnd = asNum(cs?.finish_temp_f);
  const cHum = asNum(cs?.humidity_pct);
  const cCond = meaningfulCondition(cs?.conditions);

  const deviceFallbackF = (() => {
    if (aStart != null || aEnd != null || aSingle != null) return null;
    const c = args.deviceAvgTempC;
    if (c == null || !Number.isFinite(c) || c === 0) return null;
    return Math.round((c * 9) / 5 + 32);
  })();

  const effectiveSingle = aSingle ?? deviceFallbackF;

  const startTempF = aStart ?? effectiveSingle ?? cStart ?? null;
  const finishTempF = aEnd ?? effectiveSingle ?? cEnd ?? null;
  const humidityPct = (() => {
    if (aHum != null && Number.isFinite(aHum) && aHum >= 0) return Math.round(aHum);
    if (cHum != null && Number.isFinite(cHum) && cHum >= 0) return Math.round(cHum);
    return null;
  })();
  const conditions = aCond ?? cCond ?? null;

  const startSource: 'activity' | 'device_avg' | 'course' | 'none' =
    aStart != null ? 'activity'
    : aSingle != null ? 'activity'
    : deviceFallbackF != null ? 'device_avg'
    : cStart != null ? 'course'
    : 'none';
  const finishSource: 'activity' | 'device_avg' | 'course' | 'none' =
    aEnd != null ? 'activity'
    : aSingle != null ? 'activity'
    : deviceFallbackF != null ? 'device_avg'
    : cEnd != null ? 'course'
    : 'none';
  const humSource: 'activity' | 'course' | 'none' =
    aHum != null && aHum >= 0 ? 'activity' : cHum != null ? 'course' : 'none';
  const condSource: 'activity' | 'course' | 'none' =
    aCond ? 'activity' : cCond ? 'course' : 'none';

  const provenance =
    `WEATHER MERGE (authoritative): Prefer workout.weather_data (Open-Meteo), then workouts.avg_temperature as °F when no API temps, then race_courses snapshot. ` +
    `Field sources — start: ${startSource}, finish: ${finishSource}, humidity: ${humSource}, conditions: ${condSource}. ` +
    `If any numeric temp or humidity appears in WEATHER below, do not claim weather is missing.`;

  return {
    startTempF,
    finishTempF,
    humidityPct,
    conditions,
    provenance,
  };
}

export interface RaceDebriefInputs {
  workoutName: string;
  elapsedSeconds: number;
  movingSeconds: number;
  goalSeconds: number | null;
  projectedSeconds: number | null;
  avgHR: number;
  maxHR: number;
  intensityFactor: number | null;
  weather: RaceDebriefWeatherResolved;
  splits: Array<{
    mile: number;
    paceSeconds: number;
    avgHR: number;
    grade: number;
  }>;
  /** From race_courses.course_segments (collapsed by display group). */
  courseStrategyZones?: CourseStrategyZoneLine[] | null;
}

function fmtClock(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtPace(secPerMi: number): string {
  const m = Math.floor(secPerMi / 60);
  const s = Math.round(secPerMi % 60);
  return `${m}:${String(s).padStart(2, '0')}/mi`;
}

function signedDiffSeconds(diff: number): string {
  const sign = diff >= 0 ? '+' : '-';
  return `${sign}${fmtClock(Math.abs(diff))}`;
}

function estimateHeatHRBpm(startF: number | null, finishF: number | null): string {
  if (startF == null || finishF == null) return 'unknown';
  if (!Number.isFinite(startF) || !Number.isFinite(finishF)) return 'unknown';
  return `~${Math.round((finishF - startF) / 1.8)} bpm`;
}

function buildFactString(i: RaceDebriefInputs): string {
  const aidLoss = i.elapsedSeconds - i.movingSeconds;
  const vsProjected = i.projectedSeconds !== null
    ? i.elapsedSeconds - i.projectedSeconds
    : null;

  const tempRise = (i.weather.startTempF != null && i.weather.finishTempF != null)
    ? i.weather.finishTempF - i.weather.startTempF
    : null;

  // Optional hint only — do not let the model treat this as the main story (prompt limits that).
  const suspectStopHint = formatSuspectStopMiles(i.splits);

  return `
CONTEXT FOR THE COACH (not for quoting verbatim to the athlete):
The athlete sees splits on their device. Interpret patterns; do not reproduce the full table in prose.

RACE: ${i.workoutName}
ACTUAL FINISH (elapsed): ${fmtClock(i.elapsedSeconds)}
PROJECTED FINISH TIME (single number from course model — only "vs plan" benchmark): ${i.projectedSeconds != null ? fmtClock(i.projectedSeconds) : 'not available — analyze execution on its own terms; do NOT say the course model is missing'}
GAP VS PROJECTION: ${vsProjected !== null ? signedDiffSeconds(vsProjected) : 'N/A'}
MOVING TIME: ${fmtClock(i.movingSeconds)} (use for drift: natural HR rise is expected after ~3h sustained effort)
TIME OFF COURSE (elapsed minus moving — aid, stops): ${aidLoss > 30 ? fmtClock(aidLoss) : 'negligible'}
SESSION AVG HR / MAX HR: ${i.avgHR} / ${i.maxHR} bpm
INTENSITY FACTOR (if available): ${i.intensityFactor ?? 'N/A'}

${i.weather.provenance}

WEATHER:
Conditions: ${i.weather.conditions ?? 'unknown'}
Start temp: ${i.weather.startTempF ?? 'unknown'}°F
Finish temp: ${i.weather.finishTempF ?? 'unknown'}°F
Temp rise during race: ${tempRise !== null ? `${tempRise >= 0 ? '+' : ''}${tempRise}°F` : 'unknown'}
Estimated heat-related HR contribution from temp rise: ${estimateHeatHRBpm(i.weather.startTempF, i.weather.finishTempF)}
Humidity: ${i.weather.humidityPct != null ? `${i.weather.humidityPct}%` : 'unknown'}

COURSE STRATEGY ZONES (pre-race — effort band + mile range; compare to actual HR/pace in those miles):
${formatCourseStrategyZonesBlock(i.courseStrategyZones ?? null)}

PER-MILE DATA (reference as needed; do not read aloud row by row):
${i.splits.map((s) =>
  `Mile ${s.mile}: ${fmtPace(s.paceSeconds)} | ${s.avgHR} bpm | ${s.grade > 0 ? '+' : ''}${s.grade}%`,
).join('\n')}
${suspectStopHint ? `\nPOSSIBLE NON-RUNNING SLOW MILES (one clause max if mentioned): ${suspectStopHint}` : ''}
`.trim();
}

/** Miles where pace is far slower than neighbors and grade is mild — optional one-clause flag in narrative. */
function formatSuspectStopMiles(splits: RaceDebriefInputs['splits']): string | null {
  if (splits.length < 4) return null;
  const sorted = [...splits].sort((a, b) => a.mile - b.mile);
  const out: string[] = [];
  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const next = sorted[i + 1];
    const neighAvg = (prev.paceSeconds + next.paceSeconds) / 2;
    if (cur.paceSeconds - neighAvg < 110) continue; // not ~2+ min slower than neighbors
    if (Math.abs(cur.grade) > 1.2) continue; // grade might explain it
    out.push(`mile ${cur.mile}`);
    if (out.length >= 2) break;
  }
  return out.length ? out.join(', ') : null;
}

export async function generateRaceDebrief(
  inputs: RaceDebriefInputs,
): Promise<string | null> {
  try {
    const facts = buildFactString(inputs);
    const narrative = await callLLM({
      system: RACE_DEBRIEF_SYSTEM_PROMPT,
      user: facts,
      maxTokens: 900,
      temperature: 0.2,
      model: 'sonnet',
    });
    return narrative ? narrative.trim() : null;
  } catch (err) {
    console.error('[race-debrief] LLM call failed:', err);
    return null;
  }
}
