/**
 * LLM race debrief — additive path for goal race sessions.
 * Sits alongside marathon-race-narrative.ts deterministic digest.
 * Callers merge result into workouts.workout_analysis.race_debrief_text.
 */

import { callLLM } from './llm.ts';

const RACE_DEBRIEF_SYSTEM_PROMPT = `You are a running coach debriefing an athlete after a race.

The athlete already has pace, HR, and splits on screen. Do not recite the split table or dwell on numbers they can read themselves. Your job is interpretation: what the pattern means, and what drove the result.

NARRATIVE STRUCTURE — follow this order exactly:
1) First sentence: name the race and state actual finish time versus the COURSE MODEL PROJECTION only. That gap is the only performance delta that matters for this debrief. Do not mention any other time target from the system. Do not use the word "goal" except when referring to the course model projection (e.g. "the model had you at …").
2) Second sentence: the single most important pacing or execution fact the data supports, stated plainly (not a list of mile splits).
3) Remaining sentences (about three): explain what drove the gap using terrain, heart rate, and weather. Name specific miles only when they explain a mechanism—not because a mile was slow or an outlier.

OUTLIER MILES:
- If a mile is roughly two or more minutes slower than neighboring miles and grade does not explain it, you may flag a likely non-running stop in ONE short clause (bathroom, shoe, crowded aid, etc.), then move on. Do not make that mile the thesis of the paragraph. Do not assign a minute-by-minute forensic or accuse the athlete; they know what happened.

TARGET FRAMING:
- The only benchmark for "how you did vs the plan" is the course model projected finish. Ignore any other stored target times even if they appeared elsewhere in tooling.

TERRAIN:
- Grade is per mile: positive = uphill, negative = downhill. Pace loss on real climb with appropriate HR is terrain. Pace loss on easy grade with rising HR in heat points to thermoregulation competing with locomotion—say that plainly, once.

WEATHER:
- Use the supplied temps and humidity. Rough guide: about +1 bpm cardiac load per ~1.8°F rise in ambient temperature during a long effort; high humidity tightens that. Sunny late race adds demand on top of pace.

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
- One paragraph, 5–6 sentences, no headers, no bullets.

CLOSE:
- End with one concrete line about what to adjust next time on this course (section of the race, pacing habit, or conditions strategy)—not a lecture.

COURSE ZONES (from pre-race strategy):
- Segments may be listed with effort zones: Conservative, Cruise, Caution, Push (from course strategy generation). When actual HR and pace align with what that zone implied, that is execution matching the plan—not drift or toughness.
- When HR or stress exceeds what the zone and HR band suggested for a segment, that is where to explain why (heat, terrain, pace, or stop time). Use the zone labels and mile ranges together with per-mile grade; do not ignore zones and only use raw grade.`;

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

export interface RaceDebriefInputs {
  workoutName: string;
  elapsedSeconds: number;
  movingSeconds: number;
  goalSeconds: number | null;
  projectedSeconds: number | null;
  avgHR: number;
  maxHR: number;
  intensityFactor: number | null;
  weather: {
    startTempF: number | null;
    finishTempF: number | null;
    humidityPct: number | null;
    conditions: string | null;
  };
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
COURSE MODEL PROJECTION (only benchmark for "vs plan"): ${i.projectedSeconds != null ? fmtClock(i.projectedSeconds) : 'not available'}
GAP VS PROJECTION: ${vsProjected !== null ? signedDiffSeconds(vsProjected) : 'N/A'}
MOVING TIME: ${fmtClock(i.movingSeconds)} (use for drift: natural HR rise is expected after ~3h sustained effort)
TIME OFF COURSE (elapsed minus moving — aid, stops): ${aidLoss > 30 ? fmtClock(aidLoss) : 'negligible'}
SESSION AVG HR / MAX HR: ${i.avgHR} / ${i.maxHR} bpm
INTENSITY FACTOR (if available): ${i.intensityFactor ?? 'N/A'}

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
      maxTokens: 700,
      temperature: 0.2,
      model: 'sonnet',
    });
    return narrative ? narrative.trim() : null;
  } catch (err) {
    console.error('[race-debrief] LLM call failed:', err);
    return null;
  }
}
