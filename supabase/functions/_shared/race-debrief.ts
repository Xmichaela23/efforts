/**
 * LLM race debrief — additive path for goal race sessions.
 * Sits alongside marathon-race-narrative.ts deterministic digest.
 * Callers merge result into workouts.workout_analysis.race_debrief_text.
 */

import { callLLM } from './llm.ts';

const RACE_DEBRIEF_SYSTEM_PROMPT = `You are a running coach debriefing an athlete immediately after a race.
You have their mile splits, per-mile heart rate, per-mile terrain grade,
weather across the race, projected finish from their course model, and their goal time.

YOUR JOB:
Tell the athlete what the data shows that they cannot see by looking at their splits.
Explain mechanisms. Name the miles. Attribute causes correctly.

TERRAIN RULES:
- Grade column is per-mile. Positive = uphill, negative = downhill, 0 = flat.
- Pace drop on positive grade with stable HR = terrain is the cause. Do not call this a fade.
- Pace drop on flat or negative grade with stable HR = something else (fatigue, glycogen, decision).
- Pace drop on flat or negative grade with rising HR = thermoregulation competing with locomotion. Name this mechanism explicitly.
- HR elevation on downhill = eccentric braking load. Normal. Do not flag as a concern.

WEATHER RULES:
- Temp rise across the race contributes ~1 bpm per 1.8°F to cardiac load independent of effort.
- If temp rose 15°F+, late-race HR elevation is partially environmental. Say so. Do not attribute it to pacing error.
- Humidity above 70% compounds heat load — evaporative cooling degrades.
- If conditions were sunny, solar radiation adds ~5-8 bpm equivalent load in the final third.

HEART RATE RULES:
- Early drift (miles 1-8): if HR climbs faster than expected at conservative pace, note it —
  it predicts late-race compression.
- Mid-race plateau (miles 8-18): HR should be stable or slowly climbing.
  If it's flat, pacing was controlled. Say so.
- Late drift (miles 19+): decompose the drift into terrain contribution,
  weather/heat contribution, and genuine fatigue. Use the numbers provided for each.
- Decoupling = HR rising while pace stays same or slows. On flat terrain in heat,
  this is the signature of thermoregulatory competition. Name it.

COURSE STRUCTURE RULES:
- Use the grade data to build a terrain narrative. The athlete ran a specific course
  with specific hills. Reference them by mile.
- Flat miles late in a net-downhill race feel harder than the grade suggests because
  the neuromuscular system is adapted to braking, not pushing. Note if the flat finish
  explains a late pace softening.

GAP ANALYSIS RULES:
- Compute: actual elapsed vs projected finish. Find the miles where pace was slower
  than the course-adjusted expectation. That's where the gap was created.
- Aid station time (elapsed minus moving) is part of the gap. Account for it separately.
- Never blame fitness for something terrain or weather explains.

OUTPUT FORMAT:
- One continuous paragraph. No headers. No bullet points.
- Second person (you/your).
- 5-7 sentences. Dense. No padding. No cheerleading. No "great job."
- Final sentence: one specific, actionable thing that closes the gap at this course next time.
  Name the mile range or mechanism. Not generic advice.`;

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

function findDecoupledMiles(splits: RaceDebriefInputs['splits']): RaceDebriefInputs['splits'] {
  if (splits.length < 4) return [];
  const mid = splits.slice(
    Math.floor(splits.length * 0.25),
    Math.floor(splits.length * 0.65),
  );
  if (mid.length === 0) return [];
  const basePace = mid.reduce((a, s) => a + s.paceSeconds, 0) / mid.length;
  const baseHR = mid.reduce((a, s) => a + s.avgHR, 0) / mid.length;

  return splits.filter((s) =>
    s.mile > splits.length * 0.6 &&
    s.avgHR > baseHR + 7 &&
    s.paceSeconds >= basePace - 20
  );
}

function findTerrainOutliers(splits: RaceDebriefInputs['splits']): RaceDebriefInputs['splits'] {
  return splits.filter((s) => s.grade > 0.8);
}

function buildFactString(i: RaceDebriefInputs): string {
  const aidLoss = i.elapsedSeconds - i.movingSeconds;
  const vsProjected = i.projectedSeconds !== null
    ? i.elapsedSeconds - i.projectedSeconds
    : null;
  const vsGoal = i.goalSeconds !== null
    ? i.elapsedSeconds - i.goalSeconds
    : null;

  const tempRise = (i.weather.startTempF != null && i.weather.finishTempF != null)
    ? i.weather.finishTempF - i.weather.startTempF
    : null;

  const decoupled = findDecoupledMiles(i.splits);
  const terrainHits = findTerrainOutliers(i.splits);

  const backHalf = i.splits.slice(Math.floor(i.splits.length / 2));
  const worstMile = backHalf.length > 0
    ? backHalf.reduce((a, s) => (s.paceSeconds > a.paceSeconds ? s : a), backHalf[0])
    : null;

  return `
RACE: ${i.workoutName}
FINISH (elapsed): ${fmtClock(i.elapsedSeconds)}
MOVING TIME: ${fmtClock(i.movingSeconds)}
AID STATION LOSS: ${aidLoss > 30 ? fmtClock(aidLoss) : 'negligible'}
GOAL TIME: ${i.goalSeconds != null ? fmtClock(i.goalSeconds) : 'not recorded'}
COURSE MODEL PROJECTION: ${i.projectedSeconds != null ? fmtClock(i.projectedSeconds) : 'not available'}
VS PROJECTION: ${vsProjected !== null ? signedDiffSeconds(vsProjected) : 'N/A'}
VS GOAL: ${vsGoal !== null ? signedDiffSeconds(vsGoal) : 'N/A'}
AVG HR: ${i.avgHR} bpm | MAX HR: ${i.maxHR} bpm
INTENSITY FACTOR: ${i.intensityFactor ?? 'N/A'}

WEATHER:
Conditions: ${i.weather.conditions ?? 'unknown'}
Start temp: ${i.weather.startTempF ?? 'unknown'}°F
Finish temp: ${i.weather.finishTempF ?? 'unknown'}°F
Temp rise during race: ${tempRise !== null ? `${tempRise >= 0 ? '+' : ''}${tempRise}°F` : 'unknown'}
Estimated heat HR contribution: ${estimateHeatHRBpm(i.weather.startTempF, i.weather.finishTempF)}
Humidity: ${i.weather.humidityPct != null ? `${i.weather.humidityPct}%` : 'unknown'}

SPLITS (mile | pace | avg HR | grade):
${i.splits.map((s) =>
  `Mile ${s.mile}: ${fmtPace(s.paceSeconds)} | ${s.avgHR} bpm | ${s.grade > 0 ? '+' : ''}${s.grade}%`,
).join('\n')}

TERRAIN HITS (uphill miles >0.8% grade):
${terrainHits.length > 0
  ? terrainHits.map((s) => `Mile ${s.mile}: +${s.grade}% | ${fmtPace(s.paceSeconds)} | ${s.avgHR} bpm`).join('\n')
  : 'None significant'}

LATE-RACE DECOUPLING (HR elevated, pace not faster, back 40% of race):
${decoupled.length > 0
  ? decoupled.map((s) => `Mile ${s.mile}: ${fmtPace(s.paceSeconds)} | ${s.avgHR} bpm | grade ${s.grade}%`).join('\n')
  : 'None detected'}

WORST BACK-HALF MILE:
${worstMile != null
  ? `Mile ${worstMile.mile}: ${fmtPace(worstMile.paceSeconds)} | ${worstMile.avgHR} bpm | grade ${worstMile.grade}%`
  : 'N/A'}
`.trim();
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
      temperature: 0.25,
      model: 'sonnet',
    });
    return narrative ? narrative.trim() : null;
  } catch (err) {
    console.error('[race-debrief] LLM call failed:', err);
    return null;
  }
}
