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

REQUIRED FRAMING OPEN (paraphrase, do not bolt numbers you were not given):
- They finished "${lr?.name ?? 'their last goal race'}" (${lr?.distance ?? ''}) about ${dSince} days before this WORKOUT DATE; this logged run sits in that comeback window (~run #${runN} runs since that race finish, heuristic count from Arc).
${ng ? `- Their next stacked target "${ng.name}" is still ahead; heuristic block/start spacing suggests ~${blockIn} days before structured build density — treat this outing as bridging/re-entry pace.` : '- Next primary race target is unspecified in Arc.'}

YOU MUST SURFACE (pick what data supports — skip only if unavailable):
- Pace-normalized / terrain-aware HR drift and whether it hints at aerobic economy vs pace creep.
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

    default:
      return `

TEMPORAL ARC MODE: unstructured_read — temporal Arc stack is sparse on this WORKOUT DATE.
Neutral observational synthesis; do not invent plan/program language or race proximity not present in FACTS or ARC block below.
Prefer "what fitness signal does today show?" over "matched the workout."  
`;
  }
}
