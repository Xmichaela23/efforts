/**
 * LLM-powered race debrief narrative.
 * Computes facts from per-mile splits, weather arc, and goal/projection delta,
 * then asks the LLM to explain mechanisms — not restate numbers.
 */

import { callLLM } from './llm.ts';

type MileSplit = {
  mile: number;
  pace_s_per_mi: number;
  avg_hr_bpm?: number | null;
  grade_percent?: number | null;
  elevation_gain_m?: number | null;
  start_elevation_m?: number | null;
  end_elevation_m?: number | null;
};

export type RaceNarrativeInput = {
  /** Actual elapsed finish time in seconds */
  actualSeconds: number;
  /** Goal time in seconds from goals/plan */
  goalTimeSeconds: number | null;
  /** Fitness-based projection in seconds from coach_cache */
  fitnessProjectionSeconds: number | null;
  /** e.g. "Ojai Valley Marathon" */
  eventName?: string | null;
  splits: MileSplit[];
  weatherStartF?: number | null;
  weatherEndF?: number | null;
  weatherPeakF?: number | null;
  weatherHumidity?: number | null;
  weatherWindMph?: number | null;
};

const RACE_DEBRIEF_SYSTEM_PROMPT = `You are a performance analysis engine producing a post-race debrief.

Write 4–6 dense sentences. Rules:
- Instrument-panel voice: direct, data-grounded, no names, no cheerleading, no motivational language
- Explain MECHANISMS (what caused what and why) — do not restate numbers the athlete can already read on-screen
- Name the specific miles that drove the gap vs goal and vs projection
- If a fast descent precedes a slow mile, explain the surge-and-recovery pattern explicitly
- Decompose HR drift into its sources: heat load (temp rise), ambient heat stress (baseline above 60°F), and effort accumulation
- Reference the actual temperature arc (start→finish °F) and per-mile grade when explaining pace changes
- End with one concrete, actionable training takeaway grounded in this race's data
- Never reference future goals, events, or upcoming training
- Evaluate only against this session's stated goal and fitness projection`;

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtPace(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}/mi`;
}

function avg(vals: (number | null | undefined)[]): number | null {
  const clean = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function buildFactsMessage(input: RaceNarrativeInput): string {
  const { actualSeconds, goalTimeSeconds, fitnessProjectionSeconds, splits, eventName,
    weatherStartF, weatherEndF, weatherPeakF, weatherHumidity, weatherWindMph } = input;

  const sorted = [...splits]
    .filter(s => s.pace_s_per_mi > 300 && s.pace_s_per_mi < 1800)
    .sort((a, b) => a.mile - b.mile);

  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(`EVENT: ${eventName || 'Marathon'}`);
  lines.push(`ACTUAL FINISH: ${fmtTime(actualSeconds)}`);

  if (goalTimeSeconds) {
    const delta = actualSeconds - goalTimeSeconds;
    const sign = delta >= 0 ? '+' : '-';
    const absDelta = Math.abs(delta);
    const mm = Math.floor(absDelta / 60);
    const ss = Math.round(absDelta % 60);
    lines.push(`GOAL: ${fmtTime(goalTimeSeconds)} | DELTA: ${sign}${mm}:${String(ss).padStart(2, '0')}`);
  }

  if (fitnessProjectionSeconds) {
    const delta = actualSeconds - fitnessProjectionSeconds;
    const sign = delta >= 0 ? '+' : '-';
    const absDelta = Math.abs(delta);
    const mm = Math.floor(absDelta / 60);
    const ss = Math.round(absDelta % 60);
    lines.push(`PROJECTION: ${fmtTime(fitnessProjectionSeconds)} | DELTA: ${sign}${mm}:${String(ss).padStart(2, '0')}`);
  }

  // ── Conditions ──────────────────────────────────────────────────────────────
  if (weatherStartF != null && weatherEndF != null) {
    const rise = Math.round(weatherEndF - weatherStartF);
    const peakNote = weatherPeakF != null && weatherPeakF > weatherEndF + 2
      ? ` (peak ${Math.round(weatherPeakF)}°F)`
      : '';
    const extras: string[] = [];
    if (weatherHumidity != null && weatherHumidity > 65) extras.push(`${Math.round(weatherHumidity)}% humidity`);
    if (weatherWindMph != null && weatherWindMph > 10) extras.push(`${Math.round(weatherWindMph)} mph wind`);
    lines.push(
      `CONDITIONS: ${Math.round(weatherStartF)}→${Math.round(weatherEndF)}°F (+${rise}°F rise)${peakNote}` +
      (extras.length ? ` · ${extras.join(', ')}` : '')
    );
  }

  // ── Elevation profile ────────────────────────────────────────────────────────
  if (sorted.length > 0) {
    const first = sorted[0].start_elevation_m;
    const last = sorted[sorted.length - 1].end_elevation_m;
    if (first != null && last != null) {
      const netFt = Math.round((last - first) * 3.28084);
      const gainM = sorted.reduce((sum, s) => sum + Math.max(0, s.elevation_gain_m ?? 0), 0);
      const gainFt = Math.round(gainM * 3.28084);
      lines.push(`ELEVATION: ${gainFt} ft total gain · net ${netFt > 0 ? '+' : ''}${netFt} ft`);
    }
  }

  // ── Split pattern ────────────────────────────────────────────────────────────
  const n = sorted.length;
  if (n >= 4) {
    const halfIdx = Math.floor(n / 2);
    const p1 = avg(sorted.slice(0, halfIdx).map(s => s.pace_s_per_mi));
    const p2 = avg(sorted.slice(halfIdx).map(s => s.pace_s_per_mi));
    if (p1 && p2) {
      const diff = p2 - p1;
      const splitLabel = diff < -15 ? 'negative' : diff > 15 ? 'positive' : 'even';
      lines.push(`SPLIT: first half ${fmtPace(p1)} · second half ${fmtPace(p2)} (${splitLabel} split, ${diff > 0 ? '+' : ''}${Math.round(diff)}s/mi)`);
    }
  }

  // ── HR drift ────────────────────────────────────────────────────────────────
  const hrMiles = sorted.filter(s => s.avg_hr_bpm != null && (s.avg_hr_bpm as number) > 40);
  if (hrMiles.length >= 6) {
    const earlySlice = hrMiles.slice(0, Math.min(4, Math.floor(hrMiles.length * 0.15) + 1));
    const lateSlice = hrMiles.slice(-Math.min(4, Math.floor(hrMiles.length * 0.15) + 1));
    const earlyHr = avg(earlySlice.map(s => s.avg_hr_bpm!));
    const lateHr = avg(lateSlice.map(s => s.avg_hr_bpm!));

    if (earlyHr != null && lateHr != null) {
      const totalDrift = lateHr - earlyHr;

      let heatBpm = 0;
      let heatDesc = '';
      if (weatherStartF != null && weatherEndF != null) {
        const rise = weatherEndF - weatherStartF;
        const avgTemp = (weatherStartF + weatherEndF) / 2;
        const riseContrib = rise > 2 ? rise * 0.8 : 0;
        const stressContrib = avgTemp > 60 ? (avgTemp - 60) * 0.15 : 0;
        heatBpm = Math.round(riseContrib + stressContrib);
        if (heatBpm > 2) {
          heatDesc = ` (~${heatBpm} bpm from ${Math.round(weatherStartF)}→${Math.round(weatherEndF)}°F heat, ~${Math.max(0, Math.round(totalDrift) - heatBpm)} bpm effort accumulation)`;
        }
      }

      lines.push(`HR DRIFT: ${Math.round(earlyHr)} → ${Math.round(lateHr)} bpm (+${Math.round(totalDrift)} bpm)${heatDesc}`);

      // Find where drift accelerated most (largest single-mile jump after mile 3)
      let maxJump = 2, jumpMile = 0;
      for (let i = 3; i < hrMiles.length; i++) {
        const jump = (hrMiles[i].avg_hr_bpm as number) - (hrMiles[i - 1].avg_hr_bpm as number);
        if (jump > maxJump) { maxJump = jump; jumpMile = hrMiles[i].mile; }
      }
      if (jumpMile > 0) {
        lines.push(`HR ACCELERATION: sharpest single-mile HR spike at mile ${jumpMile} (+${Math.round(maxJump)} bpm)`);
      }
    }
  }

  // ── Gap analysis: miles over goal pace ──────────────────────────────────────
  if (goalTimeSeconds) {
    const goalPaceSec = goalTimeSeconds / 26.2;
    const gapMiles = sorted
      .filter(s => s.pace_s_per_mi > goalPaceSec + 20)
      .map(s => {
        const over = Math.round(s.pace_s_per_mi - goalPaceSec);
        const gradeNote = s.grade_percent != null
          ? ` grade ${s.grade_percent > 0 ? '+' : ''}${s.grade_percent.toFixed(1)}%`
          : '';
        return `mi ${s.mile}: ${fmtPace(s.pace_s_per_mi)} (+${over}s/mi over goal${gradeNote})`;
      });
    if (gapMiles.length > 0) {
      lines.push(`MILES OVER GOAL PACE: ${gapMiles.join(' | ')}`);
    }
  }

  // ── Pace transitions: largest surge-then-fade patterns ──────────────────────
  if (sorted.length >= 4) {
    type Transition = { atMile: number; prevPace: number; thisPace: number; prevGrade: number | null; thisGrade: number | null; delta: number };
    const transitions: Transition[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const delta = sorted[i].pace_s_per_mi - sorted[i - 1].pace_s_per_mi;
      transitions.push({
        atMile: sorted[i].mile,
        prevPace: sorted[i - 1].pace_s_per_mi,
        thisPace: sorted[i].pace_s_per_mi,
        prevGrade: sorted[i - 1].grade_percent ?? null,
        thisGrade: sorted[i].grade_percent ?? null,
        delta,
      });
    }
    // Largest fade (positive delta = got slower)
    const fades = transitions.filter(t => t.delta > 60).sort((a, b) => b.delta - a.delta).slice(0, 3);
    if (fades.length > 0) {
      const fadeStr = fades.map(t => {
        const prevGradeNote = t.prevGrade != null ? ` (mi ${t.atMile - 1} grade ${t.prevGrade > 0 ? '+' : ''}${t.prevGrade.toFixed(1)}%)` : '';
        const thisGradeNote = t.thisGrade != null ? ` (grade ${t.thisGrade > 0 ? '+' : ''}${t.thisGrade.toFixed(1)}%)` : '';
        return `mi ${t.atMile - 1}→${t.atMile}: ${fmtPace(t.prevPace)}${prevGradeNote} → ${fmtPace(t.thisPace)}${thisGradeNote} (+${Math.round(t.delta)}s/mi)`;
      }).join(' | ');
      lines.push(`LARGEST FADES: ${fadeStr}`);
    }
  }

  // ── Full per-mile table ──────────────────────────────────────────────────────
  lines.push('');
  lines.push('PER-MILE DATA (mile | pace | grade | HR):');
  for (const s of sorted) {
    const gradeStr = s.grade_percent != null
      ? `${s.grade_percent > 0 ? '+' : ''}${s.grade_percent.toFixed(1)}%`
      : '   —';
    const hrStr = s.avg_hr_bpm != null ? Math.round(s.avg_hr_bpm).toString() : '—';
    lines.push(`  ${String(s.mile).padStart(2)} | ${fmtPace(s.pace_s_per_mi).padEnd(9)} | ${gradeStr.padStart(6)} | ${hrStr}`);
  }

  return lines.join('\n');
}

/**
 * Generate a 4-6 sentence LLM race debrief narrative.
 * Returns null if LLM call fails or input lacks sufficient data.
 */
export async function generateRaceNarrative(input: RaceNarrativeInput): Promise<string | null> {
  if (!input.actualSeconds || input.actualSeconds < 3600) return null;
  if (input.splits.length < 10) return null;

  const userMessage = buildFactsMessage(input);
  console.log('[race-narrative] calling LLM, splits:', input.splits.length, 'goal:', input.goalTimeSeconds, 'proj:', input.fitnessProjectionSeconds);

  const result = await callLLM({
    system: RACE_DEBRIEF_SYSTEM_PROMPT,
    user: userMessage,
    maxTokens: 480,
    temperature: 0,
    model: 'sonnet',
  });

  if (!result) {
    console.warn('[race-narrative] LLM returned null');
    return null;
  }

  return result.trim();
}
