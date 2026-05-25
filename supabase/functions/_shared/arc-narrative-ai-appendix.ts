/**
 * LLM appendix for workout AI summary — keeps mode vocabulary in one file.
 */
import type { ArcNarrativeContextV1 } from './arc-narrative-state.ts';

export function arcNarrativeFactBlock(nc: ArcNarrativeContextV1): string {
  const lr = nc.last_goal_race;
  const ng = nc.next_primary_goal;
  const lines = [
    `ARC_FOCUS_DATE=${nc.focus_date}`,
    `NARRATIVE_MODE=${nc.mode}`,
    lr
      ? `LAST_GOAL_RACE=${lr.name}|${lr.distance ?? 'event'}|${lr.target_date}|days_since=${nc.days_since_last_goal_race ?? '?'}` +
          `|runs_since_race_estimate=${nc.runs_since_last_race ?? '?'}`
      : `LAST_GOAL_RACE=null`,
    ng
      ? `NEXT_PRIMARY_GOAL=${ng.name}|${ng.distance ?? ''}|${ng.target_date ?? ''}|priority=${ng.priority}|` +
          `days_until=${nc.days_until_next_goal_race ?? '?'}|` +
          `block_start_in_days(heuristic)=${nc.days_until_next_block_start ?? '?'}(lead_weeks=${nc.assumed_block_lead_weeks ?? '?'})`
      : `NEXT_PRIMARY_GOAL=null`,
    `PLAN_PHASE_BUCKET=${nc.plan_phase_normalized}`,
  ];
  return ['─'.repeat(50), ...lines, '─'.repeat(50)].join('\n');
}

/** Appended after base coaching system prompt — overrides session-only ban where noted. */
export function arcModeSystemAddon(nc: ArcNarrativeContextV1 | null | undefined): string {
  if (!nc) return '';
  switch (nc.mode) {
    case 'recovery_read': {
      const lr = nc.last_goal_race;
      const ng = nc.next_primary_goal;
      const dSince = nc.days_since_last_goal_race ?? '?';
      const runN = nc.runs_since_last_race ?? '?';
      const blockIn = nc.days_until_next_block_start ?? '?';
      return `

TEMPORAL ARC MODE: recovery_read — AUTHORITATIVE for "who/when/when-next", overriding the generic "single session only" rule above ONLY for framing.
The athlete-completed-this-workout facts below are still immutable; temporal lines cannot contradict WORKOUT DATE + ARC_FOCUS facts.

JOB: Answer "how is the athlete doing while coming back?", not prescription compliance.

REQUIRED FRAMING OPEN — the narrative's FIRST or SECOND sentence MUST include this comeback frame (paraphrase; do not omit the race identification or ~${dSince} day window unless data is "?"):
- They finished "${lr?.name ?? 'their last goal race'}" (${lr?.distance ?? ''}) about ${dSince} days before this WORKOUT DATE; this logged run sits in that comeback window (~run #${runN} runs since that race finish, heuristic count from Arc).
${ng ? `- Their next stacked target "${ng.name}" is still ahead; heuristic block/start spacing suggests ~${blockIn} days before structured build density — treat this outing as bridging/re-entry pace.` : '- Next primary race target is unspecified in Arc.'}

YOU MUST SURFACE (pick what data supports — skip only if unavailable):
- Pace-normalized / terrain-aware HR drift and whether it hints at aerobic economy vs pace creep. If drift_explanation is pace_driven, describe HR tracking the faster/slower halves without using the literal word \"drift\".
- Temperature / humidity / heat-stress lines when WORKOUT Weather is present — connect briefly to restraint on easy days in that comeback window when relevant (no invented dehydration narrative).
- Steady conversational effort vs HR for easy work (recovery absorption read).
- Consistency vs recent similar runs ONLY when COMPARED TO SIMILAR WORKOUTS appears in facts.

YOU MUST NEVER (hard ban):
- Reference plan prescriptions, prescribed paces, adherence % as "nailing the workout", workout cards, plan compliance.
- Recommend adding intensity or "next tempo", "squeeze more quality", progression prescriptions.
`;
    }
    case 'race_debrief': {
      return `

TEMPORAL ARC MODE: race_debrief (≤7 days after a completed goal race in Arc facts).
Honor ARC last-goal lines. Focus on guarded return-to-moving: sensations, physiology (drift/HRV only if HR exists), restraint — not buildup.
Do not prescribe new race-specific intensity.
`;
    }
    case 'taper_read': {
      return `

TEMPORAL ARC MODE: taper_read — next A-priority dated goal race is within ~14 days per Arc.
Focus on freshness, leg feel, restraint, pacing discipline, sharpness — trust built fitness; do NOT imply this easy session is earning new adaptation.
Do NOT suggest adding training load/volume/intensity anywhere in the prose.
HARD BAN (taper): phrases that frame the run as cumulative fitness gain, aerobic adaptation, or ongoing efficiency improvement (e.g. "continues to improve", "getting fitter", "building fitness", "adaptation", "aerobic gains") — at this proximity to race day, easy pace vs history is more likely freshness/sharpening/noise than a build signal.
Avoid plan-prescription jargon when no plan workout is referenced in facts (use neutral “session” language).
`;
    }
    case 'peak_read':
      return `

TEMPORAL ARC MODE: peak_read — plan phase bucket implies peak sharpening.
Judge session execution quality versus intent in the FACT PACKET only; connect to preparedness without inventing prescriptions.
`;

    case 'build_read':
      return `

TEMPORAL ARC MODE: build_read — base/build bucket.
Discuss adaptation stimulus (threshold/tempo/long) using fact-packet adherence and physiology; progression language only when consistent with FACTS.
Avoid inventing prescriptions not evidenced in data.
`;

    default: {
      // D-039 Fix 3 + 3.1: forward-bias rule. When next_primary_goal is dated
      // and within ~180 days, the narrative should look forward to that
      // target, not back to a months-old completed race. Pre-fix the LLM was
      // anchoring on last_goal_race in unstructured_read because it's the
      // most narratively-rich fact in the block, even when there's an
      // obvious upcoming goal to frame against. Fix 3.1 strengthens the ban
      // — the LLM was sidestepping "DO NOT lead with X days post-LAST_RACE"
      // by switching to "X days out from your marathon" wording. New rule
      // is a HARD BAN on any phrasing that anchors on the completed race.
      const ng = nc.next_primary_goal;
      const dUntilRace = nc.days_until_next_goal_race;
      const lr = nc.last_goal_race;
      const forwardEligible = ng && dUntilRace != null && dUntilRace > 14 && dUntilRace <= 180;
      const forwardFraming = forwardEligible
        ? `
FORWARD FRAMING (HARD CONSTRAINT) — next dated goal is ${ng.name}${ng.distance ? ` (${ng.distance})` : ''} in ~${dUntilRace} days. Frame this session in the context of the build toward that goal.

ABSOLUTE BAN — when forward framing is active, the narrative MUST NOT mention, reference, paraphrase, or allude to ${lr ? `the completed "${lr.name}"` : 'any completed goal race in the ARC block'} in any phrasing. This includes (non-exhaustive):
- "X days post-${lr?.name ?? '[race]'}"
- "X days out from your ${lr?.distance ?? '[race]'}"
- "X days since ${lr?.name ?? '[race]'}"
- "X weeks after ${lr?.name ?? '[race]'}"
- "in your ${lr?.name ?? '[race]'} recovery / comeback window"
- "[race] is behind you" / "[race] taper" / "post-[race]"
- Any temporal anchor (days/weeks ago) tied to the completed race even without using its name.

The LAST_GOAL_RACE line in the ARC FACT BLOCK is for engine bookkeeping only when forward framing is active. Treat it as if it's not in the prompt. Lead with current fitness signals + the upcoming build context only.`
        : '';
      return `

TEMPORAL ARC MODE: unstructured_read — temporal Arc stack is sparse on this WORKOUT DATE.
Neutral observational synthesis; do not invent plan/program language or race proximity not present in FACTS or ARC block below.
Prefer "what fitness signal does today show?" over "matched the workout."${forwardFraming}
`;
    }
  }
}

/**
 * POST-RACE COMPARISON prompt rule. Appended to the system prompt when the
 * arc narrative flags this session as the first run back from a goal race
 * within the 60-day window. Suppresses LLM narration that treats elevated HR
 * vs the historical pool as fatigue or aerobic regression — the pool spans
 * pre-race peak-fitness runs and the delta is structurally expected, not
 * diagnostic. Empty string when the flag is false / context missing.
 */
export function arcPostRaceComparisonAddon(nc: ArcNarrativeContextV1 | null | undefined): string {
  if (!nc?.is_first_post_race_run) return '';
  const runN = nc.runs_since_last_race;
  const firstRunPhrase = runN === 1
    ? `If signals.is_first_post_race_run is true AND runs_since_race_estimate=1 in the ARC FACT BLOCK, say "first run back" explicitly in the narrative.`
    : `If signals.is_first_post_race_run is true, the athlete has only completed ${runN ?? '?'} run(s) since their last goal race.`;
  return `

POST-RACE COMPARISON — fires when signals.is_first_post_race_run is true AND signals.comparisons.vs_similar.hr_delta is present:
- The vs_similar comparison pool spans the last 120 days and is NOT filtered by race phase. It includes pre-race runs at peak fitness when the athlete was deepest into training. Elevated HR relative to that pool on a first-run-back is structurally expected; it does NOT indicate fatigue, regression, incomplete recovery, or aerobic elevation.
- ${firstRunPhrase}
- DO NOT interpret signals.comparisons.vs_similar.hr_delta as fatigue, fitness regression, "your aerobic system is still elevated", "your body hasn't fully recovered", "you're carrying race fatigue", or any equivalent framing.
- DO describe what HR did in this session on its own terms (range, response to terrain/intervals, RPE alignment). You may note the pool limitation plainly — e.g. "your recent similar runs were mostly from before the race" — but leave the delta uninterpreted.
- This rule takes PRIORITY over any general vs_similar HR interpretation guidance. The drift_explanation / pace-normalized drift fields remain valid for in-session HR behavior; only the cross-session hr_delta is gated.
`;
}
