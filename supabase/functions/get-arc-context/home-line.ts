/**
 * TODAY'S BLOCK LABEL AND THE SEASON LINK, BUILT HERE (2026-09-18, the Stage C follow-up).
 *
 * ⛔ THE PHONE USED TO BUILD THESE (`src/lib/build-arc-line.ts`, removed) — a whole sentence, "Build · {goal} in N
 * weeks", which Today then cut at the "·" and printed only the first part of. The weeks were never on screen, so
 * they are not built here; what the weeks decided is kept: a build block with a dated goal ahead reads "Build", one
 * without reads "Build block". Same words as before, nothing added.
 *
 * ⚠️ `today` IS THE ATHLETE'S OWN DATE (`focus_date`, sent in local time), so a race day still counts as ahead.
 * ⚠️ NO BOOK PAGE NAMES THESE WORDS: they are the plan phase's own name, capitalised. NONE in TRUTH-MAP, unchanged.
 */

export type HomeLine = {
  /** The word right of the date on Today — "Build", "Build block", "Recovery", "Base", "Training". Null with no goal. */
  block_label: string | null;
  /** The tappable line that opens goals, when the athlete has none. Null otherwise. */
  season_cta: string | null;
};

type ArcLike = {
  athlete_identity?: unknown;
  active_goals?: Array<{ name?: unknown; target_date?: string | null }> | null;
};

export function buildHomeLine(arc: ArcLike | null | undefined, today: string): HomeLine {
  const goals = arc && Array.isArray(arc.active_goals) ? arc.active_goals : [];
  if (goals.length === 0) return { block_label: null, season_cta: 'Set up your season →' };

  const id = arc?.athlete_identity;
  const phaseRaw = id && typeof id === 'object' && !Array.isArray(id)
    ? (id as { current_phase?: unknown }).current_phase ?? 'training'
    : 'training';
  const phase = typeof phaseRaw === 'string' ? phaseRaw.toLowerCase() : 'training';

  // Goals arrive ordered by target date (`getArcContext`); the first is the next one.
  const next = goals[0];
  const goalName = typeof next?.name === 'string' ? next.name.trim() : '';
  const date = next?.target_date != null ? String(next.target_date).slice(0, 10) : '';
  const datedGoalAhead = goalName !== '' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today;

  if (phase === 'recovery') return { block_label: 'Recovery', season_cta: null };
  if (phase === 'build') return { block_label: datedGoalAhead ? 'Build' : 'Build block', season_cta: null };
  const label = phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : 'Training';
  return { block_label: label, season_cta: null };
}
