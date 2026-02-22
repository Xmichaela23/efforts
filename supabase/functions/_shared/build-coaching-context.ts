/**
 * Assembles holistic coaching context for GPT analyzer prompts.
 *
 * Called by each discipline analyzer (run, strength, cycling, swim) before
 * building the GPT prompt. Returns a structured text block that gets injected
 * into the user prompt so the AI "sees" the whole training picture.
 *
 * Queries:
 *   - athlete_snapshot (current + prior week)
 *   - workout_facts (last 48h)
 *   - training_plans.config (plan phase + discipline priorities)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CoachingContext {
  text: string;
  currentSnapshot: any | null;
  priorSnapshot: any | null;
  recentFacts: any[];
  planPhase: string | null;
  weekIntent: string | null;
  strengthPriority: string | null;
}

function weekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function buildCoachingContext(
  supabase: SupabaseClient,
  userId: string,
  workoutDate: string,
  planId?: string | null,
  weekNumber?: number | null,
): Promise<CoachingContext> {
  const wDate = new Date(workoutDate);
  const currentWeek = weekMonday(wDate);
  const priorWeekDate = new Date(currentWeek);
  priorWeekDate.setDate(priorWeekDate.getDate() - 7);
  const priorWeek = priorWeekDate.toISOString().slice(0, 10);

  const fortyEightHoursAgo = new Date(wDate);
  fortyEightHoursAgo.setDate(fortyEightHoursAgo.getDate() - 2);
  const recentCutoff = fortyEightHoursAgo.toISOString().slice(0, 10);

  // Parallel fetches
  const [snapshotRes, recentRes, planRes] = await Promise.all([
    supabase
      .from("athlete_snapshot")
      .select("*")
      .eq("user_id", userId)
      .in("week_start", [currentWeek, priorWeek])
      .order("week_start", { ascending: true }),

    supabase
      .from("workout_facts")
      .select("date, discipline, workload, duration_minutes, session_rpe, strength_facts, run_facts, ride_facts")
      .eq("user_id", userId)
      .gte("date", recentCutoff)
      .lt("date", workoutDate)
      .order("date", { ascending: false })
      .limit(10),

    planId
      ? supabase
          .from("plans")
          .select("config")
          .eq("id", planId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const snapshots = (snapshotRes.data ?? []) as any[];
  const currentSnapshot = snapshots.find((s: any) => s.week_start === currentWeek) ?? null;
  const priorSnapshot = snapshots.find((s: any) => s.week_start === priorWeek) ?? null;
  const recentFacts = (recentRes.data ?? []) as any[];

  // Extract plan phase
  let planPhase: string | null = null;
  let weekIntent: string | null = null;
  let strengthPriority: string | null = null;
  let goalContext: string | null = null;

  if (planRes.data?.config) {
    const contract = planRes.data.config.plan_contract_v1;
    if (contract && weekNumber) {
      const phases = Array.isArray(contract.phase_by_week) ? contract.phase_by_week : [];
      if (weekNumber >= 1 && weekNumber <= phases.length) {
        planPhase = phases[weekNumber - 1] ?? null;
      }
      const intents = Array.isArray(contract.week_intent_by_week) ? contract.week_intent_by_week : [];
      const intent = intents.find((w: any) => Number(w?.week_index) === weekNumber);
      weekIntent = intent?.focus_label ?? null;

      strengthPriority = contract.strength?.priority ?? null;

      if (contract.goal?.event_type) {
        goalContext = `${contract.goal.event_type}${contract.goal.event_date ? ' on ' + contract.goal.event_date : ''}${contract.goal.target ? ' (target: ' + contract.goal.target + ')' : ''}`;
      }
    }
  }

  // Build text block
  const lines: string[] = [];
  lines.push("=== TRAINING CONTEXT (holistic view) ===");

  // Plan phase
  if (planPhase || weekIntent) {
    lines.push("");
    lines.push("PLAN PHASE:");
    if (planPhase) lines.push(`  Phase: ${planPhase}`);
    if (weekIntent) lines.push(`  Week focus: ${weekIntent}`);
    if (weekNumber) lines.push(`  Week: ${weekNumber}`);
    if (strengthPriority) lines.push(`  Strength role: ${strengthPriority}`);
    if (goalContext) lines.push(`  Goal: ${goalContext}`);
  }

  // Current week state
  if (currentSnapshot) {
    lines.push("");
    lines.push("THIS WEEK SO FAR:");
    lines.push(`  Sessions: ${currentSnapshot.session_count ?? 0}${currentSnapshot.session_count_planned ? ' of ' + currentSnapshot.session_count_planned + ' planned' : ''}`);
    lines.push(`  Workload: ${currentSnapshot.workload_total ?? 0}${currentSnapshot.adherence_pct != null ? ' (' + currentSnapshot.adherence_pct + '% adherence)' : ''}`);
    if (currentSnapshot.acwr != null) lines.push(`  ACWR: ${currentSnapshot.acwr}`);
    if (currentSnapshot.workload_by_discipline) {
      const disc = Object.entries(currentSnapshot.workload_by_discipline)
        .filter(([, v]) => (v as number) > 0)
        .map(([k, v]) => `${k}: ${Math.round(v as number)}`)
        .join(", ");
      if (disc) lines.push(`  By discipline: ${disc}`);
    }
    if (currentSnapshot.avg_session_rpe != null) lines.push(`  Avg RPE: ${currentSnapshot.avg_session_rpe}`);
    if (currentSnapshot.rpe_trend != null) lines.push(`  RPE trend vs baseline: ${currentSnapshot.rpe_trend > 0 ? '+' : ''}${currentSnapshot.rpe_trend}%`);
    if (currentSnapshot.strength_top_lifts) {
      const lifts = Object.entries(currentSnapshot.strength_top_lifts)
        .map(([k, v]: any) => `${k}: e1RM ${v.est_1rm}${v.trend ? ' (' + v.trend + ')' : ''}`)
        .join(", ");
      if (lifts) lines.push(`  Top lifts: ${lifts}`);
    }
  }

  // Prior week for trend context
  if (priorSnapshot) {
    lines.push("");
    lines.push("LAST WEEK:");
    lines.push(`  Workload: ${priorSnapshot.workload_total ?? 0} (${priorSnapshot.session_count ?? 0} sessions)`);
    if (priorSnapshot.acwr != null) lines.push(`  ACWR: ${priorSnapshot.acwr}`);
    if (priorSnapshot.run_long_run_duration) lines.push(`  Longest run: ${Math.round(priorSnapshot.run_long_run_duration)} min`);
  }

  // Recent workouts (last 48h) for interference detection
  if (recentFacts.length > 0) {
    lines.push("");
    lines.push("LAST 48 HOURS:");
    for (const f of recentFacts) {
      let detail = `  ${f.date} ${f.discipline} — workload: ${f.workload ?? 0}, ${Math.round(f.duration_minutes ?? 0)} min`;
      if (f.discipline === "strength" && f.strength_facts) {
        const sf = f.strength_facts;
        detail += ` (vol: ${sf.total_volume_lbs ?? 0} lbs, ${sf.total_sets ?? 0} sets)`;
        if (sf.exercises?.length) {
          const names = sf.exercises.map((e: any) => e.name).slice(0, 4).join(", ");
          detail += ` [${names}]`;
        }
      }
      if (f.discipline === "run" && f.run_facts) {
        const rf = f.run_facts;
        if (rf.distance_m) detail += ` (${(rf.distance_m / 1000).toFixed(1)}km)`;
      }
      lines.push(detail);
    }
  }

  // Interpretation hints for the AI
  lines.push("");
  lines.push("INTERPRETATION GUIDELINES:");
  if (planPhase === "recovery" || planPhase === "taper") {
    lines.push("  This is a recovery/taper period. Lower volume and intensity are EXPECTED and POSITIVE.");
  } else if (planPhase === "peak") {
    lines.push("  This is a peak period. Running quality matters most. Strength drops are acceptable if maintaining.");
  } else if (planPhase === "base") {
    lines.push("  This is a base building period. Aerobic volume and consistency matter most.");
  }
  if (strengthPriority === "support" || strengthPriority === "maintenance") {
    lines.push("  Strength is in a support/maintenance role. Evaluate strength within that context — maintaining is success.");
  }
  const recentStrength = recentFacts.filter((f) => f.discipline === "strength");
  if (recentStrength.length > 0) {
    lines.push("  Recent strength session detected. Consider muscular fatigue when interpreting cardio metrics (HR, pace, power).");
  }
  lines.push("=== END TRAINING CONTEXT ===");

  return {
    text: lines.join("\n"),
    currentSnapshot,
    priorSnapshot,
    recentFacts,
    planPhase,
    weekIntent,
    strengthPriority,
  };
}
