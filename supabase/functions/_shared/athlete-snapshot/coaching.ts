// =============================================================================
// COACHING — The LLM layer. Reads the pre-digested snapshot, writes human copy.
// =============================================================================
// This is the ONLY non-deterministic part of the snapshot.
// The LLM's job: given a clear picture, what matters most and what should
// the athlete do next? No analysis, no math — just judgment and voice.
// =============================================================================

import type { AthleteSnapshot, LedgerDay, PlannedSession, Coaching } from './types.ts';
import { callLLM } from '../llm.ts';

// ---------------------------------------------------------------------------
// Session interpretations: what the athlete already saw (from session_detail_v1)
// ---------------------------------------------------------------------------

export type SessionInterpretationForPrompt = {
  date: string;
  day_name?: string;
  name: string;
  type: string;
  narrative_text: string | null;
  session_interpretation?: {
    plan_adherence?: { overall?: string; deviations?: Array<{ dimension?: string; direction?: string; detail?: string }> };
    training_effect?: { intended_stimulus?: string; actual_stimulus?: string; alignment?: string };
  } | null;
};

// ---------------------------------------------------------------------------
// Serialize snapshot sections into a clean prompt for the LLM
// ---------------------------------------------------------------------------

export function snapshotToPrompt(
  snapshot: Omit<AthleteSnapshot, 'coaching'>,
  opts?: { sessionInterpretations?: SessionInterpretationForPrompt[]; longitudinalBlock?: string | null },
): string {
  const lines: string[] = [];
  const { identity: id, plan_position: pp, daily_ledger: ledger, body_response: br, upcoming } = snapshot;
  const sessionInterpretations = opts?.sessionInterpretations ?? [];

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

  // --- SESSION INTERPRETATIONS (what the athlete already saw) ---
  // Chronological order so the LLM can build a coherent arc. Include narrative + structured.
  if (sessionInterpretations.length > 0) {
    lines.push('');
    lines.push('=== SESSION INTERPRETATIONS (what the athlete already saw — do not contradict) ===');
    for (const s of sessionInterpretations) {
      const label = `${s.day_name || s.date} ${s.date} — ${s.name}`;
      lines.push(label);
      if (s.narrative_text && s.narrative_text.trim()) {
        lines.push(`  Narrative they read: "${s.narrative_text.trim()}"`);
      }
      const si = s.session_interpretation;
      if (si?.plan_adherence) {
        const overall = si.plan_adherence.overall ?? 'unknown';
        const devs = si.plan_adherence.deviations ?? [];
        const devStr = devs.length > 0 ? devs.map((d) => d.detail || `${d.dimension} ${d.direction}`).join('; ') : 'none';
        lines.push(`  Plan adherence: ${overall}${devStr !== 'none' ? ` (${devStr})` : ''}`);
      }
      if (si?.training_effect) {
        const te = si.training_effect;
        lines.push(`  Intended: ${te.intended_stimulus ?? '—'}`);
        lines.push(`  Actual: ${te.actual_stimulus ?? '—'} (${te.alignment ?? '—'})`);
      }
      lines.push('');
    }
    lines.push('TASK: Synthesize these pre-interpreted sessions into a coherent weekly narrative. Do NOT contradict what the athlete saw above.');
    lines.push('');
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

  lines.push('');
  lines.push('## TRAINING LOAD (modality-decomposed)');
  const ls = br.load_status;
  if (ls.running_weighted_week_load_pct != null) {
    lines.push(`Running load: ${ls.running_weighted_week_load_pct > 0 ? '+' : ''}${ls.running_weighted_week_load_pct}% vs plan${ls.running_acwr != null ? ` (running ACWR: ${ls.running_acwr.toFixed(2)})` : ''}`);
  } else if (ls.running_acwr != null) {
    lines.push(`Running ACWR: ${ls.running_acwr.toFixed(2)} (no plan comparison available)`);
  }
  if (ls.unplanned_summary) {
    lines.push(`Unplanned work: ${ls.unplanned_summary}`);
  }
  lines.push(`Overall: ${ls.interpretation}.`);
  lines.push('Running ACWR is the primary fatigue signal for running readiness. Upper body strength has near-zero impact on running fatigue. Easy cycling and swimming have minimal impact. Only flag fatigue concerns when running-specific load is elevated.');

  // --- LONGITUDINAL PATTERNS ---
  const longBlock = opts?.longitudinalBlock?.trim();
  if (longBlock) {
    lines.push('');
    lines.push(longBlock);
  }

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

function formatActual(a: import('./types.ts').ActualSession): string {
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

  const exercises = a.strength_actual;
  if (exercises && exercises.length > 0) {
    const rirs = exercises.map(e => e.avg_rir).filter((r): r is number => r != null);
    const avgRir = rirs.length > 0 ? rirs.reduce((s, v) => s + v, 0) / rirs.length : null;
    const targetRirs = exercises.map(e => e.target_rir).filter((r): r is number => r != null);
    const avgTargetRir = targetRirs.length > 0 ? targetRirs.reduce((s, v) => s + v, 0) / targetRirs.length : null;
    const liftSummaries = exercises
      .filter(e => e.best_weight > 0)
      .map(e => {
        let s = `${e.name} ${e.best_weight}${e.unit}×${e.best_reps}`;
        if (e.avg_rir != null && e.target_rir != null) {
          s += ` (${e.avg_rir.toFixed(1)} RIR, target ${e.target_rir})`;
        } else if (e.avg_rir != null) {
          s += ` (${e.avg_rir.toFixed(1)} RIR)`;
        }
        return s;
      });
    if (liftSummaries.length > 0) parts.push(`lifts: ${liftSummaries.join(', ')}`);
    if (avgRir != null && avgTargetRir != null) {
      parts.push(`avg ${avgRir.toFixed(1)} RIR (target ${Math.round(avgTargetRir)})`);
    } else if (avgRir != null) {
      parts.push(`avg ${avgRir.toFixed(1)} RIR`);
    }
  }

  return parts.join(', ') || 'completed';
}

// ---------------------------------------------------------------------------
// System prompt for the coaching LLM
// ---------------------------------------------------------------------------

export const COACHING_SYSTEM_PROMPT = `You are a calm, matter-of-fact coach writing a weekly check-in. You receive a structured snapshot of your athlete's week.

Provide THREE things:

1. HEADLINE (5-8 words): The single most important INSIGHT. Not a recap. What should the athlete know that they don't already?

2. NARRATIVE (2-3 sentences max): DO NOT RECAP WHAT THE ATHLETE DID. They already know — they were there. Instead:
   - Compare actual vs planned: did they follow the prescription? "Plan called for 3x5 at 80% — you hit it." or "Run was 3 miles of a planned 4.5 — shorter than prescribed."
   - Interpret the body's response: was HR normal? Did effort feel harder than expected for the prescribed intensity? Is that expected for this phase?
   - Connect to the plan context: "This is week 3 of build — the weights are supposed to feel heavier." or "You're in base phase, so the easy runs matter more than speed right now."
   - Flag anything surprising or worth watching. If nothing is surprising, say so briefly and move on.

3. NEXT SESSION GUIDANCE (1-2 sentences): What to focus on in the next upcoming session, specific to the prescription.

WHAT NOT TO DO:
- Do NOT list exercises and weights as a recap — the athlete knows what they lifted. But DO compare against the plan when there's a meaningful difference: "bench was 10 lbs above the plan" or "plan called for 2 RIR but you averaged 4."
- NEVER describe the workout back to them. "Monday's strength session showed..." is useless. Start with the insight.
- NEVER recap that a session happened. "You completed both sessions" — they know.

TONE:
- Write like a coach who's read the data and is telling the athlete something they can't see themselves.
- NO hype language. Never use: crushed, smashed, nailed, killed it, beast mode, solid work, great job, strong session, dialed in.
- NO jargon: TRIMP, z-score, execution score, load points.
- For RPE: say "felt harder than usual" not "RPE 7/10."
- For RIR: you MAY cite RIR when comparing planned vs actual strength intensity. "Plan called for 2 RIR, you averaged 4 — good recovery discipline" is useful. But "1.7 RIR" in isolation is not — always compare against the plan or against the athlete's recent average.
- For load: use plain language like "ahead of plan" rather than raw percentages. You may mention running ACWR when it's actionable (e.g. above 1.3).

RULES:
- The ledger is truth. If ACTUAL exists, it happened. Never contradict it.
- If SESSION INTERPRETATIONS are provided, those are what the athlete already saw. Your job is to SYNTHESIZE them into a weekly arc — connect the dots across sessions, spot the weekly pattern, frame guidance. Do NOT re-interpret or contradict the session-level narrative or plan_adherence. Build on top of it.
- THIS WEEK ONLY. Your scope is the current week's ledger. Do not make multi-week trend claims ("consistency remains problematic", "you keep skipping", "this is becoming a pattern"). If a session was skipped this week, state it plainly as a this-week fact — do not frame it as part of a longer pattern.
- "upcoming" sessions haven't happened — never call them missed.
- If RUNNING load is high (running ACWR > 1.3 or running load > 130% of plan), suggest dialing back remaining run sessions.
- If a race is coming up, anchor advice to that timeline.
- The PLANNED prescription includes target weights and RIR. Compare actual to this. If the athlete followed the plan exactly, say so and move on quickly.
- Don't call progress stalling after 1-2 sessions early in the week.

MODALITY-WEIGHTED FATIGUE — the load section is decomposed by modality. Follow these rules strictly:
- Use RUNNING-WEIGHTED load and running ACWR as the primary fatigue indicator for running readiness.
- Upper body strength (weight: 0.3) does NOT meaningfully contribute to running fatigue. Do not cite upper body sessions as evidence of accumulated fatigue for running.
- Easy cycling (weight: 0.4) has modest impact. Do not treat an easy ride as equivalent to a run when assessing running fatigue.
- Swimming (weight: 0.2) has minimal running fatigue impact.
- When total session count looks high but running-specific load is on target, say so explicitly: "Total volume is up but your running load is on plan."
- Only recommend recovery adjustments when RUNNING-SPECIFIC ACWR > 1.3 or running load exceeds plan by > 30%.
- When unplanned sessions are present, note what they were and whether they matter for running fatigue. "An unplanned easy ride adds minimal running fatigue" is coaching. "1 extra session" without context is not.

CRITICAL — ACCURACY:
- The PLAN POSITION section tells you the exact week number and phase. ONLY use those values. Never invent or guess a week number or phase name. If it says "week 3, phase: build" then it is week 3 build. Not "Week 1 Speed." Not anything else.
- If any data section mentions session counts, do NOT repeat raw "X of Y" numbers. Describe qualitatively.
- For STRENGTH: compare planned RIR vs actual RIR when both are available. Round to whole numbers: "plan called for 2 RIR, you averaged 4" is good. "1.7 reps in reserve" in isolation is not — always compare.
- For RPE: say "felt harder than usual" not "RPE 7/10." The user doesn't think in RPE numbers.
- Never output percentage numbers for weights (like "78% target" or "80% 1RM"). The user thinks in actual weight: "the plan called for heavy triples and you hit them." Only reference percentages if the plan prescription literally uses them AND it helps the user understand.`;

// ---------------------------------------------------------------------------
// Call the LLM and parse the response
// ---------------------------------------------------------------------------

export async function generateCoaching(
  snapshot: Omit<AthleteSnapshot, 'coaching'>,
  _anthropicKey?: string,
  opts?: { sessionInterpretations?: SessionInterpretationForPrompt[]; longitudinalBlock?: string | null },
): Promise<Coaching> {
  const prompt = snapshotToPrompt(snapshot, opts);

  const raw = await callLLM({
    system: COACHING_SYSTEM_PROMPT,
    user: `Here is the athlete snapshot for this week. Write the headline, narrative, and next session guidance.\n\n${prompt}`,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 400,
    temperature: 0.4,
  });

  if (!raw) {
    return fallbackCoaching(snapshot);
  }

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
