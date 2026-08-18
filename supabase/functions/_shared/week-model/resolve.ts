// ============================================================================
// THE RESOLVER — it does not search for a legal weekday. It pays debts.
//
// ⛔ AND IT NEVER REFUSES TO ANSWER. When a week cannot be built, the failure is
// itself relational: "this unit needs `heavy_legs` clear; the debt from X stands
// until hour H; the earliest it can happen is <day>." That is an answer the athlete
// can act on, which a dead end is not — and it is STRICTER than the old engine, not
// looser, because the old one built a compromised week and named the breach after
// the fact. See D-325 §7 ("state the cost, never refuse") — this satisfies both:
// the biological rule is never bent, and the athlete is never left with nothing.
// ============================================================================

import {
  type SystemId,
  type Unit,
  COST,
  DAY_NAMES,
  emitsOf,
  forwardGap,
  needsOf,
  sessionHours,
} from './model.ts';

export type Placement = { unit: Unit; day: number };

export type Unmet = {
  unit: string;
  system: SystemId;
  /** The unit whose debt is still outstanding. */
  blockedBy: string;
  /** Hours short. */
  shortBy: number;
  /** The day the blocking debt actually clears. */
  clearsAtDay: number;
};

export type Resolution =
  | { ok: true; placements: Placement[]; restDays: number[] }
  | { ok: false; unmet: Unmet[]; best: Placement[] };

/**
 * Every unmet need in a candidate week, stated relationally.
 * ⚠️ ORDER-FREE. A debt is checked against every OTHER unit, not against the ones that
 * happen to come earlier in the array — placing sessions in list order is how the old
 * engine's answers depended on the order it was handed its inputs.
 */
export function unmetNeeds(placements: Placement[]): Unmet[] {
  const out: Unmet[] = [];
  // Every session that emits a debt, with the hour its clock starts.
  const debts: Array<{ from: string; system: SystemId; at: number; hours: number }> = [];
  for (const p of placements) {
    for (const { session, hour } of sessionHours(p.unit, p.day)) {
      for (const [sys, hours] of Object.entries(COST[session.load].emits)) {
        debts.push({ from: session.label, system: sys as SystemId, at: hour, hours: hours as number });
      }
    }
  }

  for (const p of placements) {
    for (const { session, hour } of sessionHours(p.unit, p.day)) {
      for (const system of COST[session.load].needs) {
        for (const d of debts) {
          if (d.system !== system || d.from === session.label) continue;
          const gap = forwardGap(d.at, hour);
          if (gap >= d.hours) continue;
          out.push({
            unit: session.label,
            system,
            blockedBy: d.from,
            shortBy: d.hours - gap,
            clearsAtDay: Math.floor(((d.at + d.hours) % 168) / 24),
          });
        }
      }
    }
  }
  return out;
}

/** Days carrying no session at all. */
export function restDaysOf(placements: Placement[]): number[] {
  const used = new Set(placements.map((p) => p.day));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !used.has(d));
}

/**
 * ⛔ THE ONLY PREFERENCE IN THE FILE, and it is deliberately thin. Feasibility is
 * decided by the law; among LEGAL weeks the resolver prefers more rest and heavy units
 * spread rather than bunched. A long list of tie-breakers here would rebuild the thing
 * this model replaced.
 */
function score(placements: Placement[]): number {
  const rest = restDaysOf(placements).length;

  // ⛔ A REST DAY BOUGHT BY STACKING FIVE SESSIONS ONTO ONE DAY IS NOT A REST DAY.
  // Without this the resolver piled the whole week onto Saturday and called the other
  // five days rest — technically legal under a law that only speaks about heavy work.
  const perDay = new Map<number, number>();
  for (const p of placements) perDay.set(p.day, (perDay.get(p.day) ?? 0) + 1);
  let crowding = 0;
  for (const n of perDay.values()) crowding += Math.max(0, n - 1) * 3;

  const heavyDays = placements
    .filter((p) => emitsOf(p.unit).heavy_legs != null)
    .map((p) => p.day)
    .sort((a, b) => a - b);
  let bunching = 0;
  for (let i = 1; i < heavyDays.length; i++) bunching += Math.max(0, 3 - (heavyDays[i] - heavyDays[i - 1]));

  return rest * 4 - crowding - bunching;
}

/**
 * Place every unit. Pinned units do not move.
 *
 * ⚠️ EXHAUSTIVE, NOT HEURISTIC. Seven days and a handful of units is a few thousand
 * candidates — small enough to enumerate, which means the answer does not depend on
 * the order units were handed in, and "unsolvable" genuinely means unsolvable.
 */
export function resolve(units: Unit[], opts: { minRestDays?: number } = {}): Resolution {
  const minRest = opts.minRestDays ?? 1;
  const free = units.filter((u) => u.pinnedDay == null);
  const fixed = units.filter((u) => u.pinnedDay != null).map((u) => ({ unit: u, day: u.pinnedDay! }));

  let best: { placements: Placement[]; unmet: Unmet[]; score: number } | null = null;

  const walk = (i: number, acc: Placement[]): void => {
    if (i === free.length) {
      const all = [...fixed, ...acc];
      const unmet = unmetNeeds(all);
      const rest = restDaysOf(all).length;
      const s = score(all) - unmet.length * 1000 - Math.max(0, minRest - rest) * 500;
      if (!best || s > best.score) best = { placements: all, unmet, score: s };
      return;
    }
    for (let d = 0; d < 7; d++) walk(i + 1, [...acc, { unit: free[i], day: d }]);
  };
  walk(0, []);

  if (!best) return { ok: false, unmet: [], best: [] };
  const b = best as { placements: Placement[]; unmet: Unmet[]; score: number };
  const rest = restDaysOf(b.placements);
  if (b.unmet.length === 0 && rest.length >= minRest) {
    return { ok: true, placements: b.placements, restDays: rest };
  }
  return { ok: false, unmet: b.unmet, best: b.placements };
}

/** The week as a document — the only way to tell whether this is right. */
export function render(r: Resolution): string {
  const placements = r.ok ? r.placements : r.best;
  const lines: string[] = [];
  for (let d = 0; d < 7; d++) {
    const on = placements.filter((p) => p.day === d);
    if (!on.length) { lines.push(`${DAY_NAMES[d].padEnd(10)} rest`); continue; }
    const text = on.map((p) =>
      p.unit.sessions.map((s) => s.label).join(`  →  ${p.unit.internalGapHours}h later  →  `)
    ).join('   ·   ');
    lines.push(`${DAY_NAMES[d].padEnd(10)} ${text}`);
  }
  if (!r.ok) {
    lines.push('');
    lines.push('CANNOT BE BUILT:');
    const seen = new Set<string>();
    for (const u of r.unmet) {
      const key = `${u.unit}|${u.system}|${u.blockedBy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(
        `  ${u.unit} needs ${u.system} clear. ${u.blockedBy} leaves that outstanding for another `
        + `${u.shortBy}h — it clears on ${DAY_NAMES[u.clearsAtDay]}.`,
      );
    }
    if (restDaysOf(placements).length === 0) lines.push('  No rest day. Every day carries a session.');
  }
  return lines.join('\n');
}
