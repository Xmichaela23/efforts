/**
 * D-045 (2026-05-25) — extract the drill-token harvest from
 * `generate-combined-plan/index.ts` so the Q-015 regression cannot recur
 * unnoticed. Pure function: scans a built week's swim sessions for
 * `swim_drills?_*` tokens in `steps_preset` and returns them as a Set.
 *
 * Background: the D-044 item 6 / Q-015 rolling 1-week drill memory had
 * correct threading through every swim creator + the picker filter, but the
 * orchestrator harvested from `week.days[].sessions[]` while `buildWeek`
 * actually returns a flat `week.sessions[]` shape (see `computeWeekMetrics`
 * at `week-builder.ts:593`). The wrong-shape walk silently emptied the Set
 * every week, so the picker filter never fired.
 *
 * This helper exists to make the harvest contract explicit and unit-testable
 * (`drill-token-harvest.test.ts`).
 */

const SWIM_DRILL_TOKEN_RE = /^swim_drills?_/i;

/** Minimum shape we depend on — keeps the helper decoupled from `GeneratedWeek`. */
interface HarvestableSession {
  type?: string;
  steps_preset?: unknown[];
}
interface HarvestableWeek {
  sessions?: HarvestableSession[];
}

/**
 * Returns the set of `swim_drills?_*` tokens emitted by this week's swim
 * sessions. Caller passes the result back as the `prevWeekDrillTokens` opt
 * on the next week's `buildWeek` call.
 */
export function harvestSwimDrillTokensFromWeek(
  week: HarvestableWeek | null | undefined,
): Set<string> {
  const out = new Set<string>();
  const sessions = Array.isArray(week?.sessions) ? week!.sessions! : [];
  for (const s of sessions) {
    if (String(s?.type || '').toLowerCase() !== 'swim') continue;
    const steps = Array.isArray(s?.steps_preset) ? s.steps_preset : [];
    for (const tok of steps) {
      if (typeof tok === 'string' && SWIM_DRILL_TOKEN_RE.test(tok)) out.add(tok);
    }
  }
  return out;
}
