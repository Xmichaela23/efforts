/**
 * ⛔ THE PLYO WARM-UP IS PART OF ITS RUN OR RIDE'S CARD (Michael, 2026-09-29: "I don't think it should be a separate
 * log"). The builder writes the warm-up as its own planned row tagged `warms_up:` its session (`compose.ts`
 * `WARMS_UP_TAG`, paired by `move-check` `plyoPair`). The calendar, Today and the outline read these items, so the
 * warm-up is folded into its session here, once: the title "Plyo - {session}" (`PLYO_ROW`, Michael's words), the drills
 * with their how-to and benefit, p275 / p227's line (`plyoTitleNote`), and the warm-up's id on `joined_part_ids` so skip
 * reaches both rows.
 * ⚠️ A warm-up that has its own recorded workout (logged before this change) is not folded; nor is one whose session
 * is not in the week.
 */
import { plyoPair, type MoveRow } from '../_shared/move-check/index.ts';
import { plyoTitleNote } from '../_shared/standing-plan/plyo.ts';
import { fill, PLYO_ROW } from '../_shared/standing-plan/setup-copy.ts';
import { sessionTitle } from '../_shared/session-title.ts';

export function foldPlyoItems(items: any[], plannedRows: any[]): void {
  const rows = (Array.isArray(plannedRows) ? plannedRows : []) as MoveRow[];
  for (const w of rows) {
    const pair = plyoPair(w, rows);
    if (!pair || pair.warmUp.id !== w.id) continue;
    const warmItem = items.find((it) => String(it?.planned?.id ?? '') === String(w.id));
    const sessionItem = items.find((it) => String(it?.planned?.id ?? '') === String(pair.session.id));
    if (!warmItem || !sessionItem || warmItem === sessionItem || warmItem.executed) continue;
    const drills = Array.isArray((w as any).strength_exercises) ? (w as any).strength_exercises : [];
    const s = sessionItem.planned;
    const title = s.session_title ?? sessionTitle(pair.session as any);
    sessionItem.planned = {
      ...s,
      session_title: fill(PLYO_ROW, { session: title }),
      plyo_warm_up: {
        id: String(w.id),
        note: plyoTitleNote(drills.length),
        drills: drills.map((d: any) => ({
          name: String(d?.name ?? ''),
          how_to: d?.how_to ?? null,
          benefit_line: d?.benefit_line ?? null,
        })),
      },
      joined_part_ids: [...(Array.isArray(s.joined_part_ids) ? s.joined_part_ids : []), String(w.id)],
    };
    items.splice(items.indexOf(warmItem), 1);
  }
}
