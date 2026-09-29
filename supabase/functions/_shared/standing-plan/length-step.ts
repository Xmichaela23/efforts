// ============================================================================
// THE LONGER-SESSION OFFER — pure logic. `endurance-checkpoint` does the I/O (Michael, 2026-09-27).
//
// ⛔ THE RULE, EVERY PART OF IT THE BOOK'S OR THE OWNER'S:
//   · WHEN — the frame's own timing on the slot (`EnduranceSlot.growth`): p281, Base's long ride "every 1 to 2 weeks",
//     its midweek endurance rides once a "1-month cycle"; p279's long ride "every fourth week" — weeks 4, 8 and 12 of
//     the plan (`blockWeeks`, Michael 2026-09-27).
//   · HOW MUCH — at most 5% of the week's easy minutes. p148: "aiming to change each of these by less than 10 percent
//     per week, though ideally 5 percent is as high as I will usually go." Easy minutes are p146's sub-VT1 bucket, the
//     plan's stored week ledger (`week_ledgers[week].minutes.easy`). Whole minutes, rounded down, so the step never
//     passes 5%.
//   · HOW FAR — inside the level's printed range (p239), the rung the session's length sits in. A session at the top of
//     its level is offered nothing.
//   · WHEN TWO ARE DUE IN ONE WEEK, THE EASY RIDES GO FIRST AND THE LONG RIDE WAITS (Michael, 2026-09-27) — the book's
//     reasoning, quoted as printed:
//       p107: "Does this mean a session is no longer beneficial? Not necessarily, but it does mean that every additional
//             minute is causing your body more stress per unit of time than it was earlier in the session."
//       p108: "most skeletal adaptations, for example, hit their limit after 60 to 90 minutes of exposure to a stimulus
//             (numbers vary widely in the research)." · "Practically speaking, this means that, even for elite athletes,
//             I rarely prescribe more than two hours of VT1 work in a single session. High-level endurance athletes who
//             need a high total volume often do back-to-back sessions separated by at least six to eight hours if
//             they're looking to maximize their total training volume."
//       p149: "I recommend that you reduce a program by equal amounts in all these buckets if you're feeling taxed, and
//             then you can progress incrementally in one or two buckets at a time (where indicated) if you're feeling
//             ready to push again."
//     A minute added to a short session costs less than one added to the end of the long one (p107), and more volume
//     comes from more sessions rather than longer ones (p108); the week's one step goes where it costs least (p149).
//   · SESSIONS HELD TO ONE LENGTH STEP TOGETHER — p281's Tuesday and Friday rides (`sameLengthAs`): the same step on each,
//     so the two together stay inside the 5%.
//   · WHO DECIDES — the rider. The step is offered; accept writes it, keep records the answer. Never applied on its own
//     (the proposed-then-accepted door FTP uses).
// ⛔ NOTHING HERE IS OURS: no step size, no threshold. If the book gives no timing for a slot, the slot has no `growth`
// and is never offered.
// ============================================================================
import { FRAMES, planLongCeilingFor, type FrameId } from './frames.ts';
import { ladderOf } from './volume-bounds.ts';
import { resolveEnduranceAnchors } from '../endurance-library/index.ts';

/** One answer, recorded on the plan (`config.standing_plan.length_steps`). */
export type LengthStep = { slot: string; at: string; from: number; to: number | null; decision: 'accept' | 'keep' };
/** `role` picks the offer's words; `with` lists the slots that take the same length (`EnduranceSlot.sameLengthAs`). */
export type LengthOffer = { slot: string; role: 'easy' | 'long' | 'hard'; with: string[]; from: number; to: number; cite: string };

/** p148: "ideally 5 percent is as high as I will usually go." */
export const WEEKLY_CHANGE_FRACTION = 0.05;

const addTo = (iso: string, every: { weeks: number } | { months: number }): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if ('weeks' in every) d.setUTCDate(d.getUTCDate() + 7 * every.weeks);
  else d.setUTCMonth(d.getUTCMonth() + every.months);
  return d.toISOString().slice(0, 10);
};
const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** The plan week `today` falls in, 1-based, counted in 7-day weeks from the block's first day. */
const weekOfBlock = (blockStart: string, today: string): number => {
  const ms = Date.parse(`${today.slice(0, 10)}T12:00:00Z`) - Date.parse(`${blockStart.slice(0, 10)}T12:00:00Z`);
  return Math.floor(ms / (7 * 86400000)) + 1;
};

export function lengthStepOffers(args: {
  frame: FrameId;
  /** The picked lengths, `sport_mix.minutes`, keyed `${frameDay}:${index}`. */
  minutes: Record<string, number> | null | undefined;
  /** The current week's easy (sub-VT1) minutes, p146. */
  weekEasyMinutes: number | null | undefined;
  history: LengthStep[] | null | undefined;
  /** The block's first day — the clock for a slot never stepped or answered. */
  blockStart: string;
  today: string;
  baselines?: unknown;
  /**
   * The plan week today falls in, as the caller's plan-week reader counts it (`resolvePlanWeekIndex`). Read only by a
   * `blockWeeks` timing; absent, it is counted in 7-day weeks from `blockStart`.
   */
  currentWeek?: number | null;
}): LengthOffer[] {
  const frame = FRAMES[args.frame];
  const easy = Number(args.weekEasyMinutes);
  if (!frame || !(easy > 0)) return [];
  let room = Math.floor(easy * WEEKLY_CHANGE_FRACTION);
  const anchors = resolveEnduranceAnchors((args.baselines ?? {}) as never);
  const out: LengthOffer[] = [];
  // ⛔ THE EASY RIDES BEFORE THE LONG ONE (p107, p108, p149 — see the header); the week's order within a role.
  const ROLE_ORDER: Record<string, number> = { easy: 0, hard: 1, long: 2 };
  const slots = frame.columns.standard
    .flatMap((d) => d.endurance.map((slot, i) => ({ slot, key: `${d.day}:${i}` })))
    .sort((a, b) => (ROLE_ORDER[a.slot.role ?? 'easy'] ?? 0) - (ROLE_ORDER[b.slot.role ?? 'easy'] ?? 0));
  {
    slots.forEach(({ slot, key }) => {
      const now = Math.round(Number(args.minutes?.[key]));
      if (!slot.growth || !(now > 0) || room < 1) return;
      const every = slot.growth.every;
      if ('blockWeeks' in every) {
        // ⛔ THE PLAN'S OWN WEEKS (p279's "every fourth week" = weeks 4, 8 and 12, Michael 2026-09-27): offered in a week
        // that is a multiple of N, once — an answer given in that week (accept or keep) closes it until the next one.
        const wk = Number(args.currentWeek) > 0 ? Number(args.currentWeek) : weekOfBlock(args.blockStart, args.today);
        if (!(every.blockWeeks > 0) || wk < every.blockWeeks || wk % every.blockWeeks !== 0) return;
        const weekStart = addDays(args.blockStart, (wk - 1) * 7);
        if ((args.history ?? []).some((h) => h.slot === key && h.at.slice(0, 10) >= weekStart)) return;
      } else {
        const last = (args.history ?? []).filter((h) => h.slot === key).map((h) => h.at.slice(0, 10)).sort().pop()
          ?? args.blockStart.slice(0, 10);
        if (args.today.slice(0, 10) < addTo(last, every)) return;
      }
      // ⛔ THE PLAN'S OWN LONG-SESSION CAP where it states one (p279's long ride, p239 level 3) — `planLongCeilingFor`.
      const ceilingMin = planLongCeilingFor(args.frame, slot.family, slot.role);
      const rungs = ladderOf({
        family: slot.family, level: (slot.lengthFromLevel ?? slot.level) as never,
        sport: String(slot.family).startsWith('ride_') ? 'ride' : 'run', role: slot.role,
        ...(ceilingMin ? { ceilingMin } : {}),
      } as never, anchors);
      const rung = rungs.find((r) => now >= Math.round(r.lo) && now <= Math.round(r.hi));
      if (!rung) return;
      const followers = frame.columns.standard.flatMap((dd) =>
        dd.endurance.flatMap((e, j) => (e.sameLengthAs === key ? [`${dd.day}:${j}`] : [])));
      const each = Math.floor(room / (1 + followers.length));
      const to = Math.min(now + each, Math.round(rung.hi));
      if (to <= now) return;
      room -= (to - now) * (1 + followers.length);
      out.push({ slot: key, role: (slot.role ?? 'easy') as LengthOffer['role'], with: followers, from: now, to, cite: slot.growth.cite });
    });
  }
  return out;
}
