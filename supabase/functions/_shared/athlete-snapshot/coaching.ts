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
    if (pp.week_total_load_planned) lines.push(`Planned weekly training load: ${pp.week_total_load_planned}.`);
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
  lines.push(`Load: ${br.load_status.interpretation}.`);

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
  if (a.rpe) {
    if (a.rpe >= 8) parts.push('felt hard');
    else if (a.rpe >= 6) parts.push('moderate effort');
    else parts.push('felt easy');
  }
  return parts.join(', ') || 'completed';
}

// ---------------------------------------------------------------------------
// System prompt for the coaching LLM
// ---------------------------------------------------------------------------

export const COACHING_SYSTEM_PROMPT = `You are a calm, matter-of-fact coach writing a weekly check-in. You receive a structured snapshot of your athlete's week.

Provide THREE things:

1. HEADLINE (5-8 words): The single most important thing right now. Plain and direct. Examples: "Good start — run was short", "On track, keep the rhythm", "Two sessions missed, reset tomorrow".

2. NARRATIVE (2-3 sentences max): State what happened and what it means. Be specific — use day names, actual distances and weights. Compare actual to planned using real numbers: "you ran 3 miles of a planned 4.5" not "67% of planned distance." For strength, name the lifts and weights: "bench at 130 for 5, rows at 105 for 5."

3. NEXT SESSION GUIDANCE (1-2 sentences): What to focus on in the next upcoming session, specific to the prescription.

TONE:
- Write like a thoughtful coach reviewing a training log. Calm, direct, observational.
- NO hype language. Never use: crushed, smashed, nailed, killed it, beast mode, solid work, great job, strong session, dialed in. These sound fake.
- NO percentage comparisons for load or volume ("76% above plan", "151% of planned load", "343% of expected stress"). Instead say "you're well ahead of the plan after one day" or "the run was shorter than planned."
- NO jargon: ACWR, TRIMP, RPE scores, z-score, sample size, execution score, training points, load points, RIR numbers, "effort X/10", "X out of 10". A user doesn't know what "1.7 RIR" or "effort 5/10" means. Say "you had a little left in the tank" or "felt tired on the run."
- State facts. Let the athlete draw their own conclusions about whether it was "good" or "bad."

RULES:
- The ledger is truth. If ACTUAL exists, it happened. Never contradict it.
- "upcoming" sessions haven't happened — never call them missed.
- If load is high, suggest dialing back remaining sessions — don't add recovery sessions.
- For strength, describe the actual lifts and weights, not load numbers.
- If a race is coming up, anchor advice to that timeline.
- Upper body lifting (bench, rows, overhead press, curls, etc.) does NOT interfere with running. Only lower body or full body lifting can affect run quality. Never claim upper body work hurt a run.
- Don't call "progress stalling" or similar after 1-2 sessions early in the week. You need at least a full week's pattern to judge progress.`;

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
      headline: stripMarkdown(headlineMatch[1]),
      narrative: stripMarkdown(narrativeMatch[1]),
      next_session_guidance: guidanceMatch ? stripMarkdown(guidanceMatch[1]) : null,
    };
  }

  // Fallback: split by sentences, first is headline, rest is narrative
  const clean = stripMarkdown(raw);
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    headline: sentences[0]?.slice(0, 60) || 'This week',
    narrative: sentences.slice(1).join(' ').slice(0, 500) || clean.slice(0, 500),
    next_session_guidance: null,
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/HEADLINE[:\s]*/gi, '')
    .replace(/NARRATIVE[:\s]*/gi, '')
    .replace(/NEXT SESSION GUIDANCE[:\s]*/gi, '')
    .replace(/NEXT SESSION[:\s]*/gi, '')
    .replace(/GUIDANCE[:\s]*/gi, '')
    .trim();
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
