/**
 * THE SETUP BLOCK — what the plan setup prints for the three plans, sent with the setup-open response
 * (get-arc-context `builder.setup`). The phone renders it and works none of it out (punch list "Default picks
 * and per-plan wording move to the server", Michael 2026-09-13).
 *
 *   sections, programs   Train and program-list words (`setup-copy.ts`).
 *   plans                per plan: name, Build this plan? lines, FTP line.
 *   numbers              the Know your numbers? screen's words.
 *   build_focus          per plan, for the athlete's kit: each pick row's label, day heading, options with
 *                        their marks, the default, and the screen's own lines. The build fills any row the
 *                        athlete did not change with the same default (`generate-strength-plan`).
 */
import {
  allSubstituted,
  defaultViadaPicks,
  frameAdmitsForPick,
  frameDaysForPick,
  frameMuscleForPick,
  pickOptionLabelInRow,
  pickOptions,
  picksForFrame,
  ROW_IS_ALL_SUBSTITUTES,
  VIADA_PICKS,
  type ViadaPickKey,
} from './accessory-picks.ts';
import { FRAMES, type FrameId } from './frames.ts';
import { BUILD_FOCUS_COPY, fill, NUMBERS_COPY, PLAN_COPY, PROGRAM_COPY, SECTION_COPY } from './setup-copy.ts';

export type BuildFocusOption = { name: string; label: string; display: string };
export type BuildFocusRow = {
  key: ViadaPickKey;
  label: string;
  /** The superset note beside the label, when both halves of the printed pair are on the screen. */
  superset: string | null;
  /** Right-hand note: the row's other days, or the no-day line. Null when there is nothing to say. */
  also: string | null;
  options: BuildFocusOption[];
  default: string;
  /** The row's own note when every option stands in for a printed movement. */
  row_note: string | null;
};
export type BuildFocusGroup = {
  heading: string;
  /** The day's theme word, printed after the heading. */
  theme: string | null;
  rows: BuildFocusRow[];
  /** Rows this day carries from an earlier day, for the "Plus the …" line. */
  carried: { keys: ViadaPickKey[]; from: number; superset: boolean } | null;
};
export type BuildFocusBlock = {
  subtitle: string;
  dose_line: string;
  groups: BuildFocusGroup[];
  carried_line: string;
  superset_word: string;
  list_join: string;
  list_last_join: string;
};

export type SetupBlock = {
  sections: typeof SECTION_COPY;
  programs: typeof PROGRAM_COPY;
  plans: typeof PLAN_COPY;
  numbers: typeof NUMBERS_COPY;
  build_focus: Record<FrameId, BuildFocusBlock>;
};

export function buildFocusBlock(frame: FrameId, equipment: string[] | null): BuildFocusBlock {
  const drawn = picksForFrame(frame, equipment).filter((k) => !String(k).startsWith('core'));
  const defaults = defaultViadaPicks(equipment, [], frame);
  const firstDay = (k: ViadaPickKey): number | null => {
    const d = frameDaysForPick(k, frame);
    return d.length > 0 ? Math.min(...d) : null;
  };
  const rowFor = (key: ViadaPickKey): BuildFocusRow => {
    const spec = VIADA_PICKS[key];
    const opts = pickOptions(key, equipment, frameMuscleForPick(key, frame), frameAdmitsForPick(key, frame));
    const all = allSubstituted(opts);
    const days = frameDaysForPick(key, frame);
    const also = days.length === 0
      ? BUILD_FOCUS_COPY.no_day
      : (() => {
        const first = Math.min(...days);
        const rest = days.filter((d) => d !== first);
        return rest.length > 0
          ? fill(BUILD_FOCUS_COPY.also_days, { days: rest.map((d) => fill(BUILD_FOCUS_COPY.also_day, { day: d })).join(BUILD_FOCUS_COPY.also_join) })
          : null;
      })();
    return {
      key,
      label: spec.label,
      superset: spec.superset && spec.pairedWith && drawn.includes(spec.pairedWith) ? spec.superset : null,
      also,
      options: opts.map((o) => ({ name: o.name, label: pickOptionLabelInRow(o, all), display: o.display })),
      default: defaults[key] ?? opts[0]?.name ?? '',
      row_note: all ? ROW_IS_ALL_SUBSTITUTES : null,
    };
  };
  const groups = new Map<number | null, ViadaPickKey[]>();
  for (const k of drawn) {
    const d = firstDay(k);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(k);
  }
  const out: BuildFocusGroup[] = [...groups.entries()].map(([d, keys]) => {
    const carriedKeys = d == null ? [] : drawn.filter((k) => {
      const days = frameDaysForPick(k, frame);
      return days.includes(d) && Math.min(...days) !== d;
    });
    return {
      heading: d != null ? fill(BUILD_FOCUS_COPY.day_heading, { day: d }) : BUILD_FOCUS_COPY.no_day_heading,
      theme: d != null ? (FRAMES[frame]?.columns?.standard ?? []).find((x) => x.day === d)?.themeTag ?? null : null,
      rows: keys.map(rowFor),
      carried: carriedKeys.length === 0 ? null : {
        keys: carriedKeys,
        from: Math.min(...frameDaysForPick(carriedKeys[0], frame)),
        superset: carriedKeys.length === 2 && VIADA_PICKS[carriedKeys[0]].pairedWith === carriedKeys[1],
      },
    };
  });
  return {
    subtitle: BUILD_FOCUS_COPY.subtitle,
    dose_line: BUILD_FOCUS_COPY.dose_line,
    groups: out,
    carried_line: BUILD_FOCUS_COPY.carried_line,
    superset_word: BUILD_FOCUS_COPY.superset_word,
    list_join: BUILD_FOCUS_COPY.list_join,
    list_last_join: BUILD_FOCUS_COPY.list_last_join,
  };
}

/** The whole setup block for one athlete's kit. */
export function setupBlock(equipment: string[] | null): SetupBlock {
  return {
    sections: SECTION_COPY,
    programs: PROGRAM_COPY,
    plans: PLAN_COPY,
    numbers: NUMBERS_COPY,
    build_focus: {
      all_rounder: buildFocusBlock('all_rounder', equipment),
      strength_5k: buildFocusBlock('strength_5k', equipment),
      cycling_base: buildFocusBlock('cycling_base', equipment),
    },
  };
}
