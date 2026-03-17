// =============================================================================
// COACHING — The LLM layer. Reads the pre-digested snapshot, writes human copy.
// =============================================================================
// This is the ONLY non-deterministic part of the snapshot.
// The LLM's job: given a clear picture, what matters most and what should
// the athlete do next? No analysis, no math — just judgment and voice.
// =============================================================================

import type { AthleteSnapshot, LedgerDay, PlannedSession, Coaching } from './types.ts';

// ---------------------------------------------------------------------------
// Serialize snapshot sections into a clean prompt for the LLM
// ---------------------------------------------------------------------------

export function snapshotToPrompt(snapshot: Omit<AthleteSnapshot, 'coaching'>): string {
  const lines: string[] = [];
  const { identity: id, plan_position: pp, daily_ledger: ledger, body_response: br, upcoming } = snapshot;

  // --- WHO ---
  lines.push('=== WHO YOU ARE ===');
  if (id.primary_event) {
    lines.push(`Training for: ${id.primary_event.name} (${id.primary_event.distance} ${id.primary_event.sport}) — ${id.primary_event.weeks_out} weeks away.`);
    if (id.primary_event.target_time) lines.push(`Target time: ${id.primary_event.target_time}.`);
  }
  if (id.other_events.length > 0) {
    lines.push(`Also: ${id.other_events.map(e => `${e.name} (${e.weeks_out} wks)`).join(', ')}.`);
  }
  const nums: string[] = [];
  if (id.key_numbers.threshold_pace) nums.push(`threshold pace ${id.key_numbers.threshold_pace}`);
  if (id.key_numbers.ftp) nums.push(`FTP ${id.key_numbers.ftp}W`);
  if (id.key_numbers.lift_maxes.length > 0) {
    nums.push(id.key_numbers.lift_maxes.map(l => `${l.name} ~${l.e1rm}${l.unit}`).join(', '));
  }
  if (nums.length > 0) lines.push(`Key numbers: ${nums.join(', ')}.`);
  lines.push(`Units: ${id.unit_preference}.`);

  // --- PLAN ---
  lines.push('');
  lines.push('=== PLAN POSITION ===');
  if (pp.has_plan) {
    lines.push(`Plan: ${pp.plan_name || 'active plan'}, week ${pp.week_index ?? '?'} of ${pp.total_weeks ?? '?'}.`);
    if (pp.phase) lines.push(`Phase: ${pp.phase}.`);
    if (pp.methodology) lines.push(`Focus: ${pp.methodology}.`);
    if (pp.week_intent) lines.push(`This week's intent: ${pp.week_intent}.`);
    lines.push(`Planned total load: ${pp.week_total_load_planned} pts.`);
  } else {
    lines.push('No active training plan.');
  }

  // --- DAILY LEDGER ---
  lines.push('');
  lines.push('=== WHAT HAPPENED THIS WEEK (day by day) ===');
  for (const day of ledger) {
    const tag = day.is_today ? ' (TODAY)' : day.is_past ? '' : ' (upcoming)';
    lines.push(`${day.day_name} ${day.date}${tag}:`);

    if (day.planned.length === 0 && day.actual.length === 0) {
      lines.push('  Rest day (nothing planned, nothing done).');
      continue;
    }

    for (const m of day.matches) {
      const p = day.planned.find(x => x.planned_id === m.planned_id);
      const a = day.actual.find(x => x.workout_id === m.workout_id);

      if (p && a) {
        const quality = m.endurance_quality || m.strength_quality || 'followed';
        lines.push(`  PLANNED: ${p.prescription}`);
        lines.push(`  ACTUAL: ${a.name} — ${formatActual(a)}`);
        lines.push(`  MATCH: ${quality} — ${m.summary}`);
      } else if (p && !a) {
        if (day.is_past) {
          lines.push(`  PLANNED: ${p.prescription}`);
          lines.push(`  RESULT: skipped`);
        } else {
          lines.push(`  PLANNED: ${p.prescription} — upcoming`);
        }
      } else if (!p && a) {
        lines.push(`  UNPLANNED: ${a.name} — ${formatActual(a)}`);
      }
    }
  }

  // --- BODY RESPONSE ---
  lines.push('');
  lines.push('=== HOW THE BODY IS RESPONDING ===');

  if (br.session_signals.length > 0) {
    lines.push('Per-session observations:');
    for (const sig of br.session_signals) {
      lines.push(`  ${sig.date} ${sig.type}:`);
      for (const obs of sig.observations) {
        lines.push(`    - ${obs}`);
      }
    }
  }

  lines.push(`Weekly trends: run quality ${br.weekly_trends.run_quality.detail}, effort ${br.weekly_trends.effort_perception.detail}, cardiac ${br.weekly_trends.cardiac.detail}, strength ${br.weekly_trends.strength.detail}.`);
  if (br.weekly_trends.cross_training.interference) {
    lines.push(`Cross-training: ${br.weekly_trends.cross_training.detail}`);
  }
  lines.push(`Load: ${br.load_status.interpretation} (status: ${br.load_status.status}).`);

  // --- UPCOMING ---
  if (upcoming.length > 0) {
    lines.push('');
    lines.push('=== UPCOMING SESSIONS ===');
    for (const u of upcoming) {
      for (const s of u.sessions) {
        const key = s.is_key_session ? ' [KEY SESSION]' : '';
        lines.push(`  ${u.day_name} ${u.date}: ${s.prescription}${key}`);
      }
    }
  }

  return lines.join('\n');
}

function formatActual(a: { duration_seconds: number | null; distance_meters: number | null; pace: string | null; avg_hr: number | null; rpe: number | null; load_actual: number | null }): string {
  const parts: string[] = [];
  if (a.distance_meters && a.distance_meters > 0) parts.push(`${(a.distance_meters / 1609.34).toFixed(1)} mi`);
  if (a.duration_seconds) parts.push(`${Math.round(a.duration_seconds / 60)} min`);
  if (a.pace) parts.push(a.pace);
  if (a.avg_hr) parts.push(`${a.avg_hr} bpm`);
  if (a.rpe) parts.push(`RPE ${a.rpe}/10`);
  return parts.join(', ') || 'completed';
}

// ---------------------------------------------------------------------------
// System prompt for the coaching LLM
// ---------------------------------------------------------------------------

export const COACHING_SYSTEM_PROMPT = `You are a personal coach writing a weekly check-in. You receive a structured snapshot of your athlete's week — who they are, where they are in their plan, what they did each day vs what was planned, and how their body responded.

Your job is to provide THREE things:

1. HEADLINE (5-8 words): The single most important thing right now. Examples: "Strong Monday but load is high", "On track — keep the rhythm", "Two sessions missed — reset tomorrow".

2. NARRATIVE (2-3 sentences max): Connect the dots between what was planned, what happened, and how the body responded. Be specific — use day names, actual numbers from the snapshot. Never quote raw percentages like "151% of planned load" — say "you ran 3 miles of a planned 4.5" instead. No jargon (ACWR, TRIMP, RPE scores, sample sizes). Speak like a coach, not a spreadsheet.

3. NEXT SESSION GUIDANCE (1-2 sentences): What to focus on in the next upcoming session. Be specific to the actual prescription — if tomorrow is intervals, say something about the intervals. If the athlete is fatigued, adjust the advice accordingly.

Rules:
- SESSION entries in the ledger are FACT. If it says ACTUAL, it happened. Never contradict the ledger.
- "upcoming" sessions haven't happened — never describe them as missed or skipped.
- If load is high, tell them to dial back duration/intensity on remaining sessions — don't suggest adding recovery sessions.
- For strength, talk about the actual lifts (bench 130×5, squat 155×3) not about load percentages.
- Never use: ACWR, TRIMP, z-score, confidence score, sample size, "n=", execution score percentage.
- If the athlete has a race coming up, anchor advice to that timeline.`;

// ---------------------------------------------------------------------------
// Call the LLM and parse the response
// ---------------------------------------------------------------------------

export async function generateCoaching(
  snapshot: Omit<AthleteSnapshot, 'coaching'>,
  anthropicKey: string,
): Promise<Coaching> {
  const prompt = snapshotToPrompt(snapshot);

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: COACHING_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Here is the athlete snapshot for this week. Write the headline, narrative, and next session guidance.\n\n${prompt}`,
      }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    console.error('[coaching] Anthropic error:', resp.status, err.slice(0, 300));
    return fallbackCoaching(snapshot);
  }

  const data = await resp.json();
  const raw = String(data?.content?.[0]?.text || '').trim();

  return parseCoachingResponse(raw, snapshot);
}

function parseCoachingResponse(raw: string, snapshot: Omit<AthleteSnapshot, 'coaching'>): Coaching {
  // Try to parse structured sections from the response
  const headlineMatch = raw.match(/(?:HEADLINE|headline)[:\s]*(.+?)(?:\n|$)/i);
  const narrativeMatch = raw.match(/(?:NARRATIVE|narrative)[:\s]*([\s\S]+?)(?=(?:NEXT|next|GUIDANCE|guidance|$))/i);
  const guidanceMatch = raw.match(/(?:NEXT SESSION GUIDANCE|next session|guidance)[:\s]*([\s\S]+?)$/i);

  if (headlineMatch && narrativeMatch) {
    return {
      headline: headlineMatch[1].trim().replace(/^["']|["']$/g, ''),
      narrative: narrativeMatch[1].trim().replace(/^["']|["']$/g, ''),
      next_session_guidance: guidanceMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || null,
    };
  }

  // Fallback: treat the whole thing as narrative, derive headline from load status
  return {
    headline: snapshot.body_response.load_status.status === 'high'
      ? 'High load — protect recovery'
      : snapshot.body_response.load_status.status === 'elevated'
        ? 'Load is building'
        : 'On track',
    narrative: raw.slice(0, 500),
    next_session_guidance: null,
  };
}

function fallbackCoaching(snapshot: Omit<AthleteSnapshot, 'coaching'>): Coaching {
  const pastDays = snapshot.daily_ledger.filter(d => d.is_past || d.is_today);
  const done = pastDays.reduce((n, d) => n + d.actual.length, 0);
  const planned = pastDays.reduce((n, d) => n + d.planned.length, 0);
  const load = snapshot.body_response.load_status;

  return {
    headline: load.status === 'high' ? 'High load — protect recovery'
      : load.status === 'elevated' ? 'Load is elevated'
      : done === 0 ? 'Week just started'
      : 'On track',
    narrative: `${done} of ${planned} planned sessions completed so far. ${load.interpretation}.`,
    next_session_guidance: null,
  };
}
