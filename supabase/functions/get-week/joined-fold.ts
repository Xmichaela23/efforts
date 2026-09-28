/**
 * ⛔ ONE SESSION OF TWO PARTS IS ONE CARD (Michael, 2026-09-27: "one ride must look and behave like one ride
 * everywhere"). The builder writes a joined session as two planned rows (`JOINED_TAG`; p278's Day 3 and Day 5 rides,
 * p245 / p253's runs). The calendar, Today and the program outline all read this function's items, so the second
 * half is folded into the first here, once: both halves' steps in order, both lengths, the "{first}, then {second}"
 * title (`JOINED_ROW`, approved 2026-09-24 / 2026-09-27), and `joined_part_ids` so skip and move reach both rows.
 * ⚠️ PAIRED BY `joinedPartners` — the calendar sync's rule, so a skipped first half pairs nothing and each half then
 * shows alone. A second half that has its own recorded workout is not folded.
 */
import { joinedPartners, mergeJoinedRow } from '../_shared/calendar-sync/plan.ts';
import { plannedDurationFields } from '../_shared/planned-duration-label.ts';
import { sessionTitle } from '../_shared/session-title.ts';
import { fill, JOINED_ROW } from '../_shared/standing-plan/setup-copy.ts';

const concat = (a: unknown, b: unknown) =>
  Array.isArray(a) || Array.isArray(b) ? [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])] : (a ?? b ?? null);

export function foldJoinedItems(items: any[], plannedRows: any[]): void {
  for (const [headId, partRow] of joinedPartners(plannedRows as any[])) {
    const headItem = items.find((it) => String(it?.planned?.id ?? '') === headId);
    const partItem = items.find((it) => String(it?.planned?.id ?? '') === String(partRow.id));
    if (!headItem || !partItem || partItem === headItem || partItem.executed) continue;
    const headRow = (plannedRows as any[]).find((r) => String(r.id) === headId);
    let lengths: Record<string, unknown> = {};
    let title: string | null = null;
    try {
      const whole = mergeJoinedRow(headRow, partRow);
      lengths = plannedDurationFields(whole);
      title = whole.session_title;
    } catch { /* a half with no saved steps: the lengths are summed below */ }
    const h = headItem.planned;
    const p = partItem.planned;
    const sum = (a: unknown, b: unknown) => ((Number(a) || 0) + (Number(b) || 0)) || null;
    headItem.planned = {
      ...h,
      steps: concat(h.steps, p.steps),
      step_lines: concat(h.step_lines, p.step_lines),
      narrative: concat(h.narrative, p.narrative),
      total_duration_seconds: sum(h.total_duration_seconds, p.total_duration_seconds),
      duration: sum(h.duration, p.duration),
      planned_duration_seconds: (lengths.planned_duration_seconds as number | null) ?? sum(h.planned_duration_seconds, p.planned_duration_seconds),
      planned_duration_label: (lengths.planned_duration_label as string | null) ?? h.planned_duration_label ?? null,
      session_title: title ?? fill(JOINED_ROW, { first: sessionTitle(headRow), second: sessionTitle(partRow) }),
      joined_part_ids: [String(partRow.id)],
    };
    headItem.workload_planned = sum(headItem.workload_planned, partItem.workload_planned);
    items.splice(items.indexOf(partItem), 1);
  }
}
