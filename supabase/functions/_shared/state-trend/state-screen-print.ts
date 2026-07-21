// =============================================================================
// STATE SCREEN PRINTER — the whole screen as TEXT, for a synthetic athlete.
// =============================================================================
//
// WHY THIS EXISTS (docs/AUDIT-state-screen-2026-07-20.md, method note): every
// contradiction on the State screen is an ASSEMBLY bug. The 23 unit fixtures all
// pass because each PIECE is right in isolation — the bugs live in the SPACE
// BETWEEN the cards (five voices narrating one week, an empty bar under a full
// one, a green all-clear above a shortfall). Nothing rendered the assembled
// screen for a fake athlete, so nothing could see them. This does.
//
// It calls the REAL composers wherever they are reachable, and MARKS the lines
// that are still inline in coach/index.ts as [INLINE — not yet extractable].
// That mark list IS the extraction backlog: a line the printer can't reach is a
// line no test can reach either.
//
//   RUN:  ~/.deno/bin/deno run --no-check \
//           supabase/functions/_shared/state-trend/state-screen-print.ts
//   (add a persona key to print just one:  ... state-screen-print.ts monday-getstrong)
//
// This is a permanent TOOL, not a one-off debug script — it does not belong in
// scripts/ with the _d*.mjs throwaways. Add a persona whenever a new shape of
// athlete needs covering; read the output like a page and the contradictions
// sit next to each other the way they do on the phone.
// =============================================================================

import {
  composeCoachWeekInsight,
  type CoachWeekInsightInput,
  type CoachWeekDiscipline,
  type Posture,
} from '../insights/coach-week-insights.ts';
import type { StrengthProtocolContext } from '../insights/strength-protocol-read.ts';
import {
  composeWeekAccent,
  upkeepCandidate,
  resolveAerobicCarriers,
  tradeCandidate,
  overReachCandidate,
  type WeekAccent,
} from './week-accent.ts';
// CLIENT composer (src/lib) — plain TS, no React, no @/ imports → deno-importable.
import { buildLoadHeadline, statusVolumeLabel } from '../../../../src/lib/load-headline.ts';

// ── the synthetic athlete ────────────────────────────────────────────────────
interface Persona {
  key: string;
  blurb: string;                 // one line: who this is and what we're checking
  weekLabel: string;             // "WK 3" etc
  planLine: string | null;       // the intent_summary position line (INLINE in coach — supplied here)
  hasPlan: boolean;
  partialWeek: boolean;          // is it early in the week? (the Monday axis)
  dayLabel: string;              // "Monday" / "midweek" / "Sunday" — for the header only
  loadStatus: string | null;     // reconciled load_status.status
  acwr: number | null;
  readinessState: string | null;
  readinessLabel: string | null;
  fitnessDirection: string | null;
  loadPts: number | null;
  loadShares: Array<{ d: string; pct: number }>;   // the LOAD bar
  weekLoadVsNormal: number | null;                 // no-plan yardstick
  posture: Record<string, Posture> | null;
  disciplines: CoachWeekDiscipline[];
  strengthProtocol: StrengthProtocolContext | null;
  // upkeep inputs (a maintain discipline under its stored target)
  upkeep: { discipline: string; actualPerWeek: number; targetPerWeek: number; trailingRows: Array<{ type: string }>; weeksUnder: number; baseSlipping: boolean } | null;
  // the inline-in-coach lines we can only supply, not compute — printed as [INLINE]
  crossTrainingLine: string | null;
  overallTrainingRead: string | null;
  bodyHrResponse: string | null;   // e.g. "holding steady · as of Jul 15"
  bodyHowHard: string | null;      // e.g. "about as hard as usual — 3.8 vs 4.2"
}

// ── the render — top to bottom, the order the athlete reads ───────────────────
function printScreen(p: Persona): string {
  const L: string[] = [];
  const line = (s: string) => L.push(s);
  const gap = (what: string) => L.push(`      [INLINE in coach — printer can't reach it: ${what}]`);

  line('═'.repeat(72));
  line(`  ${p.key.toUpperCase()}  —  ${p.blurb}`);
  line(`  (${p.dayLabel}${p.partialWeek ? ', partial week' : ''}${p.hasPlan ? '' : ', NO PLAN'})`);
  line('═'.repeat(72));

  // 1. WEEK HEADER
  line(`\n  ${p.weekLabel}`);
  if (p.planLine) { line(`  ${p.planLine}`); } else { gap('intent_summary position line'); }

  // 2. LOAD HEADLINE (client-composed — the one week verdict not owned by the server)
  const headline = buildLoadHeadline({
    loadLabel: statusVolumeLabel(p.loadStatus),
    readinessState: p.readinessState,
    readinessLabel: p.readinessLabel,
    fitnessDirection: p.fitnessDirection,
    acwr: p.acwr,
  });
  if (headline) line(`  ${headline}`);

  // 3. THE PARAGRAPH (deterministic composer — the real thing)
  const narrative = composeCoachWeekInsight({
    hasPlan: p.hasPlan,
    disciplines: p.disciplines,
    weekLoadVsNormal: p.weekLoadVsNormal,
    partialWeek: p.partialWeek,
    posture: p.posture,
    strengthProtocol: p.strengthProtocol,
  } as CoachWeekInsightInput);
  line(`\n  PARAGRAPH (open-for-more):`);
  line(narrative ? `    "${narrative}"` : `    (silent)`);

  // 4. LOAD bar
  line(`\n  ┌─ LOAD ${p.loadStatus ? `· ${statusVolumeLabel(p.loadStatus)}` : ''}${p.acwr != null ? ` · ACWR ${p.acwr.toFixed(1)}` : ''}`);
  if (p.loadPts != null) line(`  │  ${p.loadPts} pts · rolling 7d`);
  if (p.loadShares.length) line(`  │  ${p.loadShares.map((s) => `${s.d} ${s.pct}%`).join('  ')}`);

  // 5. BODY
  line(`  ├─ BODY`);
  if (p.bodyHrResponse) line(`  │  Heart-rate response: ${p.bodyHrResponse}`); else gap('BODY heart-rate response');
  if (p.bodyHowHard) line(`  │  How hard it feels: ${p.bodyHowHard}`); else gap('BODY how-hard-it-feels');
  if (p.crossTrainingLine) line(`  │  Cross-training: ${p.crossTrainingLine}`); else gap('cross_training_signal');

  // 6. THIS WEEK · PLANNED vs ACTUAL (the bar — count planned WHOLE week, actual to-date)
  const planned = p.disciplines.filter((d) => (d.plannedLoad ?? 0) > 0);
  const doneCount = p.disciplines.filter((d) => d.sessionCount > 0).length;
  if (planned.length || doneCount) {
    line(`  ├─ this week · planned vs actual`);
    const plannedBar = planned.map((d) => d.discipline).join(' ');
    const actualBar = p.partialWeek ? '(empty — week just started)' : p.disciplines.filter((d) => d.sessionCount > 0).map((d) => d.discipline).join(' ');
    line(`  │  planned: ${plannedBar || '—'}`);
    line(`  │  actual:  ${actualBar || '—'}`);
    if (p.partialWeek && planned.length && !p.hasPlan) line(`  │  ⚠ NO-PLAN athlete should not see a 'planned' bar at all (F26)`);
    if (p.partialWeek && planned.length) line(`  │  ⚠ partial week: full plan over an empty actual — no guard (F21)`);
  }

  // 7. THE ACCENT (the upkeep / trade line — the real composer)
  const accentCandidates: (WeekAccent | null)[] = [
    overReachCandidate({ loadStatus: p.loadStatus ?? undefined, readiness: p.readinessState ?? undefined, runningAcwr: p.acwr ?? undefined }),
  ];
  if (p.upkeep) {
    const carriers = resolveAerobicCarriers(p.upkeep.discipline, p.upkeep.trailingRows);
    accentCandidates.push(upkeepCandidate({
      discipline: p.upkeep.discipline as any,
      actualPerWeek: p.upkeep.actualPerWeek,
      targetPerWeek: p.upkeep.targetPerWeek,
      unit: 'mile',
      weeksUnder: p.upkeep.weeksUnder,
      aerobicCarriers: carriers,
      baseSlipping: p.upkeep.baseSlipping,
    }));
  }
  const accent = composeWeekAccent(accentCandidates);
  if (accent) line(`  │  accent: "${accent.sentence}"`);

  // 8. inline overall_training_read (the imperative tree, F8 — supplied, marked)
  if (p.overallTrainingRead) { line(`  └─ BODY 'This week' (overall_training_read): "${p.overallTrainingRead}"`); }
  else L.push('  └─');

  // ── CONTRADICTION SCAN — the point of the whole thing ──────────────────────
  const voices: Array<{ src: string; txt: string }> = [];
  if (p.planLine) voices.push({ src: 'plan line', txt: p.planLine });
  if (headline) voices.push({ src: 'load headline', txt: headline });
  if (narrative) voices.push({ src: 'paragraph', txt: narrative });
  if (p.crossTrainingLine) voices.push({ src: 'cross-training', txt: p.crossTrainingLine });
  if (accent) voices.push({ src: 'accent', txt: accent.sentence });
  if (p.overallTrainingRead) voices.push({ src: 'overall_training_read', txt: p.overallTrainingRead });
  line(`\n  VOICES NARRATING THIS WEEK: ${voices.length}`);
  for (const v of voices) line(`    · [${v.src}] ${v.txt}`);
  if (voices.length >= 4) line(`    ⚠ ${voices.length} week-level voices, no engine reconciling them (F9)`);

  return L.join('\n');
}

// ── PERSONAS — sports × goal × plan/no-plan × day × data richness ─────────────
const P: CoachWeekDiscipline[] = []; void P;

const PERSONAS: Persona[] = [
  {
    key: 'monday-getstrong',
    blurb: "Michael's real screen: Get-stronger wk3, Monday, run on maintain",
    weekLabel: 'WK 3', planLine: 'Get stronger · Week 3 of 12.',
    hasPlan: true, partialWeek: true, dayLabel: 'Monday',
    loadStatus: 'on_target', acwr: 1.1, readinessState: 'fresh', readinessLabel: 'LOW FATIGUE',
    fitnessDirection: 'holding', loadPts: 313,
    loadShares: [{ d: 'Run', pct: 33 }, { d: 'Strength', pct: 27 }, { d: 'Ride', pct: 26 }, { d: 'Swim', pct: 14 }],
    weekLoadVsNormal: null,
    posture: { run: 'maintain', strength: 'develop', ride: 'maintain', swim: 'maintain' },
    disciplines: [
      { discipline: 'strength', actualLoad: 84, plannedLoad: 84, sessionCount: 0, verdict: 'holding' },
      { discipline: 'run', actualLoad: 103, plannedLoad: 40, sessionCount: 0, acwr: 0.6 },
      { discipline: 'ride', actualLoad: 81, plannedLoad: 0, sessionCount: 0, acwr: 1.0 },
      { discipline: 'swim', actualLoad: 45, plannedLoad: 0, sessionCount: 0 },
    ],
    strengthProtocol: { protocolId: 'five_by_five' } as StrengthProtocolContext,
    upkeep: { discipline: 'run', actualPerWeek: 6, targetPerWeek: 18, trailingRows: [{ type: 'run' }, { type: 'ride' }, { type: 'ride' }, { type: 'swim' }], weeksUnder: 4, baseSlipping: false },
    crossTrainingLine: 'Handling combined load well',
    overallTrainingRead: null,
    bodyHrResponse: 'holding steady · as of Jul 15',
    bodyHowHard: 'about as hard as usual — 3.8 vs 4.2',
  },
  {
    key: 'midweek-getstrong',
    blurb: 'same athlete, midweek — the upkeep sentence should now SPEAK with carriers',
    weekLabel: 'WK 3', planLine: 'Get stronger · Week 3 of 12.',
    hasPlan: true, partialWeek: false, dayLabel: 'Thursday',
    loadStatus: 'on_target', acwr: 1.2, readinessState: 'fresh', readinessLabel: 'LOW FATIGUE',
    fitnessDirection: 'holding', loadPts: 288,
    loadShares: [{ d: 'Run', pct: 36 }, { d: 'Strength', pct: 24 }, { d: 'Ride', pct: 22 }, { d: 'Swim', pct: 18 }],
    weekLoadVsNormal: null,
    posture: { run: 'maintain', strength: 'develop', ride: 'maintain', swim: 'maintain' },
    disciplines: [
      { discipline: 'strength', actualLoad: 70, plannedLoad: 84, sessionCount: 2, verdict: 'holding' },
      { discipline: 'run', actualLoad: 104, plannedLoad: 40, sessionCount: 2, acwr: 0.6 },
      { discipline: 'ride', actualLoad: 63, plannedLoad: 0, sessionCount: 1, acwr: 1.0 },
      { discipline: 'swim', actualLoad: 51, plannedLoad: 0, sessionCount: 2 },
    ],
    strengthProtocol: { protocolId: 'five_by_five' } as StrengthProtocolContext,
    upkeep: { discipline: 'run', actualPerWeek: 6, targetPerWeek: 18, trailingRows: [{ type: 'run' }, { type: 'ride' }, { type: 'ride' }, { type: 'swim' }, { type: 'swim' }], weeksUnder: 4, baseSlipping: false },
    crossTrainingLine: 'Handling combined load well',
    overallTrainingRead: null,
    bodyHrResponse: 'holding steady · as of Jul 18',
    bodyHowHard: 'about as hard as usual — 3.9 vs 4.2',
  },
  {
    key: 'freeball-triathlete',
    blurb: 'NO PLAN, just training — does the screen read the trade off their own normal?',
    weekLabel: 'WEEK', planLine: null,
    hasPlan: false, partialWeek: false, dayLabel: 'Saturday',
    loadStatus: 'productive', acwr: 1.3, readinessState: 'adapting', readinessLabel: 'ABSORBING',
    fitnessDirection: 'improving', loadPts: 402,
    loadShares: [{ d: 'Ride', pct: 41 }, { d: 'Run', pct: 30 }, { d: 'Swim', pct: 18 }, { d: 'Strength', pct: 11 }],
    weekLoadVsNormal: 1.25,
    posture: null,
    disciplines: [
      { discipline: 'ride', actualLoad: 165, plannedLoad: null, sessionCount: 4, acwr: 1.3 },
      { discipline: 'run', actualLoad: 120, plannedLoad: null, sessionCount: 3, acwr: 1.1 },
      { discipline: 'swim', actualLoad: 72, plannedLoad: null, sessionCount: 2 },
      { discipline: 'strength', actualLoad: 45, plannedLoad: null, sessionCount: 1, verdict: 'holding' },
    ],
    strengthProtocol: null,
    upkeep: null,
    crossTrainingLine: 'Adapting well — no interference',
    overallTrainingRead: null,
    bodyHrResponse: 'holding steady · as of Jul 19',
    bodyHowHard: 'harder than usual — 5.1 vs 4.3',
  },
  {
    key: 'lifter-only',
    blurb: 'strength only, no endurance — do the endurance clauses stay silent?',
    weekLabel: 'WK 5', planLine: 'Build muscle · Week 5 of 8.',
    hasPlan: true, partialWeek: false, dayLabel: 'Friday',
    loadStatus: 'on_target', acwr: 1.0, readinessState: 'fresh', readinessLabel: 'LOW FATIGUE',
    fitnessDirection: 'holding', loadPts: 140,
    loadShares: [{ d: 'Strength', pct: 100 }],
    weekLoadVsNormal: null,
    posture: { strength: 'develop' },
    disciplines: [
      { discipline: 'strength', actualLoad: 140, plannedLoad: 150, sessionCount: 4, verdict: 'improving' },
    ],
    strengthProtocol: { protocolId: 'upper_aesthetics' } as StrengthProtocolContext,
    upkeep: null,
    crossTrainingLine: null,
    overallTrainingRead: null,
    bodyHrResponse: null,
    bodyHowHard: 'about as hard as usual — 4.0 vs 4.1',
  },
];

// ── run ───────────────────────────────────────────────────────────────────────
const only = Deno.args[0];
const chosen = only ? PERSONAS.filter((p) => p.key === only) : PERSONAS;
if (!chosen.length) {
  console.log(`No persona '${only}'. Known: ${PERSONAS.map((p) => p.key).join(', ')}`);
} else {
  for (const p of chosen) console.log(printScreen(p) + '\n');
}
