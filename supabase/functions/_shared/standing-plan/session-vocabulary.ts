// ============================================================================
// THE EDGE — stage 1's family names become the vocabulary the app already speaks. ONE FILE.
//
// ⛔ NO SCREEN LEARNS A NEW WORD (pivot §9). The endurance library thinks in `run_mlss`,
// `run_near_threshold`, `run_vt1`, `run_lsd`. Everything downstream of a plan row — the
// materializer's token expander, the analysis path, the watch builder — speaks `run_easy_40min`,
// `longrun_90min_easypace`, `cruise_4x1mi_threshold`, `interval_6x800m_5kpace_R90s`.
//
// **This is the only place those two vocabularies meet.** A second translation anywhere else is the
// doubled disease: two files deciding what an MLSS session is called, disagreeing by one token, and
// the athlete's watch getting the loser.
//
// ⛔ EVERY TOKEN EMITTED HERE IS ONE `materialize-plan` ALREADY PARSES. Verified against
// `expandRunToken`'s own regexes on 2026-08-23 — nothing is invented, and the gate re-checks the
// shapes so a token that stops being understood fails a test rather than a watch.
// ============================================================================

import type { EnduranceSession, FamilyId } from '../endurance-library/index.ts';

/** The `type` field on a plan row. Unchanged vocabulary. */
export type SessionType = 'run' | 'ride' | 'swim' | 'strength';

export type TranslatedSession = {
  type: SessionType;
  name: string;
  description: string;
  duration: number;
  steps_preset: string[];
  tags: string[];
};

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/**
 * ⛔ THE FOUR SHAPES `materialize-plan` UNDERSTANDS, and which family maps to which.
 *
 * | family | token | why that one |
 * |---|---|---|
 * | `run_vt1` | `run_easy_{n}min` | VT1 is at or below the talk-test ceiling; that is this app's easy pace |
 * | `run_lsd` | `longrun_{n}min_easypace` | the long day, primarily below VT1 |
 * | `run_near_threshold` | `cruise_{n}x{d}mi_threshold` | repeats at threshold — p247 asks for 5-8 minute work intervals |
 * | `run_mlss` | `interval_{n}x{d}m_5kpace_R{r}s` | MLSS is zone 4, VT2 to vVO2 — 5K-pace territory |
 *
 * ⚠️ THE MLSS MAPPING IS THE ONE WORTH ARGUING WITH. Zone 4 tops out at vVO2 (Part B4) and a 5K is
 * run at roughly vVO2 for most athletes, so `5kpace` is the closest thing the existing vocabulary
 * has. It is not exact and the note on the session says the intensity is MLSS rather than 5K pace.
 */
const METRES_PER_MILE = 1609.344;

function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/** Total clocked seconds of the steps at or above the family's work floor. */
function workSeconds(session: EnduranceSession): number {
  let total = 0;
  for (const block of session.blocks) {
    for (let r = 0; r < block.repeat; r++) {
      for (const step of block.steps) {
        if (step.role === 'work' && step.seconds != null) total += step.seconds;
      }
    }
  }
  return total;
}

/** How many work reps the session actually prescribes, and how long each is. */
function repShape(session: EnduranceSession): { reps: number; repSeconds: number; restSeconds: number } {
  let reps = 0;
  let repTotal = 0;
  let restTotal = 0;
  let restCount = 0;
  for (const block of session.blocks) {
    for (let r = 0; r < block.repeat; r++) {
      for (const step of block.steps) {
        if (step.role === 'work' && step.seconds != null) {
          reps += 1;
          repTotal += step.seconds;
        }
      }
      if (block.restBetween?.seconds != null && r < block.repeat - 1) {
        restTotal += block.restBetween.seconds;
        restCount += 1;
      }
    }
  }
  return {
    reps: Math.max(1, reps),
    repSeconds: reps > 0 ? Math.round(repTotal / reps) : 0,
    restSeconds: restCount > 0 ? Math.round(restTotal / restCount) : 90,
  };
}

/**
 * ⛔ THE WRAPPER TRAVELS. Stage 1 builds the warm-up and cooldown as part of the session (that was
 * its whole point), and `materialize-plan` parses `warmup_*_{n}min` and `cooldown*{n}min`. Dropping
 * them here would send a maximal effort to the watch cold — the defect the previous work order's
 * stage 1 existed to kill.
 */
function wrapperTokens(session: EnduranceSession): { pre: string[]; post: string[] } {
  const warm = session.warmup.reduce((a, s) => a + (s.seconds ?? 0), 0);
  const cool = session.cooldown.reduce((a, s) => a + (s.seconds ?? 0), 0);
  return {
    pre: warm > 0 ? [`warmup_run_${minutes(warm)}min_easy`] : [],
    post: cool > 0 ? [`cooldown_run_${minutes(cool)}min_easy`] : [],
  };
}

const FAMILY_LABEL: Partial<Record<FamilyId, string>> = {
  run_mlss: 'Hard Run',
  run_near_threshold: 'Threshold Run',
  run_vt1: 'Easy Run',
  run_lsd: 'Long Run',
};

/**
 * ⛔ TRANSLATE ONE ENDURANCE SESSION. Returns a row in the app's existing shape and nothing new.
 *
 * ⚠️ THE DURATION IS STAGE 1's COMPUTED TOTAL, not a re-derivation. Stage 1 computes it from the
 * steps it built and labels it computed; a second arithmetic here would be a second answer.
 */
export function translateEnduranceSession(
  session: EnduranceSession,
  opts?: { raceTempo?: boolean },
): TranslatedSession {
  const { pre, post } = wrapperTokens(session);
  const totalMin = minutes(session.totals.clockedSeconds);
  const tags = ['standing_plan', `family:${session.family}`, `level:${session.level}`];
  let work: string[];

  switch (session.family) {
    case 'run_vt1':
      work = [`run_easy_${minutes(workSeconds(session) || session.totals.clockedSeconds)}min`];
      break;

    case 'run_lsd':
      work = [`longrun_${totalMin}min_easypace`];
      break;

    case 'run_near_threshold': {
      const { reps, repSeconds } = repShape(session);
      // ⚠️ `cruise_` IS DISTANCE-BASED, so the rep's length is converted at THIS athlete's own
      // threshold pace — the pace stage 1 already resolved. One decimal, because the token's own
      // regex accepts `[\d.]` and a 5-minute rep is not a round mile.
      const paceSecPerMi = session.anchor.value ?? null;
      const miles = paceSecPerMi ? Math.max(0.1, Math.round((repSeconds / paceSecPerMi) * 10) / 10) : 1;
      work = [`cruise_${reps}x${miles}mi_threshold`];
      break;
    }

    case 'run_mlss': {
      /**
       * ⛔ THE TOTAL WORK IS PRESERVED; THE SHAPE IS THE EDGE'S CHOICE, AND IT HAS TO BE.
       *
       * An MLSS session is a surge and a float — stage 1 builds it as alternating steps, both above
       * threshold, both counted as work. Translating each step as its own rep produced
       * `interval_18x155m`: arithmetically faithful, and a session no runner would recognise, because
       * the token vocabulary can only say "n reps of d metres" and cannot say "surge, then float".
       *
       * ⚠️ SO THE EDGE KEEPS THE WORK TOTAL EXACT and re-expresses it at an interval distance a
       * runner can read. The band is stage 1's own — 200 m is the shortest work rep anywhere in the
       * running library and 1600 m the longest — so nothing here invents a distance the source does
       * not use. **The session's note says the intensity is MLSS, not 5K pace.**
       */
      const { restSeconds } = repShape(session);
      const paceSecPerMi = session.anchor.value ?? null;
      const totalWork = workSeconds(session);
      if (!paceSecPerMi || totalWork <= 0) {
        work = [`interval_6x400m_5kpace_R${Math.max(30, restSeconds)}s`];
        break;
      }
      const totalMetres = (totalWork / paceSecPerMi) * METRES_PER_MILE;
      // Aim at a readable rep, then clamp into the library's own distance band.
      const target = Math.min(1600, Math.max(200, round5(totalMetres / 6)));
      const reps = Math.max(1, Math.round(totalMetres / target));
      const metres = round5(totalMetres / reps);
      work = [`interval_${reps}x${metres}m_5kpace_R${Math.max(30, restSeconds)}s`];
      break;
    }

    default:
      // ⛔ THE STANDING PLAN'S RUNNER FRAME USES FOUR FAMILIES. Anything else reaching here is a
      // frame this edge has not been taught, and it must fail loudly rather than emit a token the
      // materializer will silently drop.
      throw new Error(`no session-vocabulary translation for family: ${session.family}`);
  }

  const label = FAMILY_LABEL[session.family] ?? 'Run';
  const raceTempo = opts?.raceTempo === true;
  return {
    type: 'run',
    name: raceTempo ? `${label} (race tempo)` : label,
    description: describeSession(session, raceTempo),
    duration: totalMin,
    steps_preset: [...pre, ...work, ...post],
    tags: raceTempo ? [...tags, 'race_tempo'] : tags,
  };
}

/**
 * The athlete-facing sentence. ⚠️ Fact-first, no imperative, no encouragement — the house voice.
 * Stage 1's own notes carry the citations and the honest caveats; the ones that change what the
 * athlete DOES are the ones repeated here.
 */
function describeSession(session: EnduranceSession, raceTempo: boolean): string {
  const parts: string[] = [];
  const safety = session.notes.find((n) => n.kind === 'safety');
  if (safety) parts.push(safety.text);
  if (session.totals.isLowerBound) {
    parts.push('At least this long — some recoveries carry no stated duration.');
  }
  if (raceTempo) {
    // ⛔ p247, verbatim in substance: race pace with recoveries a quarter longer.
    parts.push('Run at race pace, with the recovery periods a quarter longer than usual.');
  }
  if (session.family === 'run_mlss') {
    // ⚠️ THE TOKEN SAYS 5K PACE; THE SESSION IS MLSS. Zone 4 tops out at vVO2 and a 5K sits close to
    // it, which is why the existing vocabulary can carry this at all — but the two are not the same
    // thing and the card should not imply they are.
    parts.push('Held at the hardest pace you could hold for about an hour of racing, not 5K pace.');
  }
  return parts.join(' ');
}

/**
 * ⛔ THE TOKEN SHAPES, EXPORTED SO THE GATE CAN CHECK THEM AGAINST THE MATERIALIZER'S OWN REGEXES.
 * If `expandRunToken` stops understanding one of these, a test fails here rather than a watch
 * failing in a car park.
 */
export const EMITTED_TOKEN_SHAPES: { shape: RegExp; example: string }[] = [
  { shape: /^warmup_run_\d+min_easy$/, example: 'warmup_run_10min_easy' },
  { shape: /^cooldown_run_\d+min_easy$/, example: 'cooldown_run_8min_easy' },
  { shape: /^run_easy_\d+min$/, example: 'run_easy_30min' },
  { shape: /^longrun_\d+min_easypace$/, example: 'longrun_90min_easypace' },
  { shape: /^cruise_\d+x[\d.]+mi_threshold$/, example: 'cruise_4x1mi_threshold' },
  { shape: /^interval_\d+x\d+m_5kpace_R\d+s$/, example: 'interval_6x800m_5kpace_R90s' },
];

/**
 * ⛔ THE MATERIALIZER'S OWN PATTERNS, COPIED FROM `expandRunToken` ON 2026-08-23 SO THE GATE CAN
 * ASSERT EVERY EMITTED TOKEN MATCHES ONE. ⚠️ This is a CACHE of that function and the gate says so;
 * if the expander's regexes move, this list is stale and the test that reads it is the tripwire.
 */
export const MATERIALIZER_RUN_PATTERNS: RegExp[] = [
  /warmup_.*_\d+min/,
  /cooldown.*\d+min/,
  /run_easy_\d+min/,
  /long[_-]?run_\d+min(?:_easypace)?/,
  /cruise_\d+x[\d.]+mi_threshold/,
  /interval_\d+x/,
];
