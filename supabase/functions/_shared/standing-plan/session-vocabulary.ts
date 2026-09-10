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
import { familyLineFor, RIDE_ENDURANCE_DRAWER_NOTE } from './family-lines.ts';
// ⛔ THE SOURCE'S OWN CLASSIFICATION — see `ENDURANCE_CLASS`, and see the tag list below.
import { ENDURANCE_CLASS, classToken, FAMILIES } from '../endurance-library/index.ts';

/** The `type` field on a plan row. Unchanged vocabulary. */
export type SessionType = 'run' | 'ride' | 'swim' | 'strength';

export type TranslatedSession = {
  type: SessionType;
  name: string;
  description: string;
  duration: number;
  steps_preset: string[];
  tags: string[];
  /**
   * ⛔⛔ THE PAGE THIS SESSION COMES FROM (Michael, 2026-08-31: *"do we have a page per session?"*).
   *
   * The block carried ONE citation — the programme's own page — and every session under it carried
   * none, while the library has held a page reference per family AND per workout shape all along.
   * They stopped at the composer. **The most specific one wins**: an archetype cites the workout, a
   * family cites the session type, so a reader is pointed at the narrower of the two.
   */
  cite: string;
};

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/**
 * ⛔ THE FOUR SHAPES `materialize-plan` UNDERSTANDS, and which family maps to which.
 *
 * | family | token | why that one |
 * |---|---|---|
 * | `run_vt1` | `run_easy_{n}min` | VT1 is at or below the talk-test ceiling; that is this app's easy pace |
 * | `run_lsd` | `longrun_{n}min_easypace` | the long day, primarily below VT1 |
 * | `run_near_threshold` | `interval_{n}x{s}s_{pct}pct_R{r}s` | the page prescribes SECONDS at a percentage; see the note below |
 * | `run_mlss` | `interval_{n}x{d}m_5kpace_R{r}s` | MLSS is zone 4, VT2 to vVO2 — 5K-pace territory |
 *
 * ⛔⛔ THE "5 TO 8" IS A REP LENGTH, AND THIS LINE USED TO IMPLY IT WAS A REP COUNT — settled off
 * the page 2026-09-08. p247 on the Wednesday session: *"I recommend NT workouts with **5- to
 * 8-minute work intervals**."* That is the length of one work interval. p234's level-3 list holds
 * exactly three sessions that satisfy it, and the frame names all three:
 *
 *     8 rounds of: 5 min @ 90% / 1:30 @ VT1
 *     6 rounds of: 6 min @ 88% / 1 min @ VT1
 *     4 rounds of: 8:30 @ 85% / 1 min @ VT1
 *
 * ⚠️ THE LIBRARY'S `repsBand` OF 5-8 IS A DIFFERENT NUMBER THAT HAPPENS TO READ THE SAME, and
 * conflating the two is what put *"8 × 4 min @ 90%"* on this slot — eight repeats, which is the
 * count, at four minutes, which is p234's LEVEL 2 length. That session is on no line of the page.
 * See `frames.ts` day 3 for the rotation and `source-rules.ts` for the filter's own working.
 *
 * ⚠️ THE MLSS MAPPING IS THE ONE WORTH ARGUING WITH. Zone 4 tops out at vVO2 (Part B4) and a 5K is
 * run at roughly vVO2 for most athletes, so `5kpace` is the closest thing the existing vocabulary
 * has. It is not exact and the note on the session says the intensity is MLSS rather than 5K pace.
 */
const METRES_PER_MILE = 1609.344;

function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

/**
 * ⛔ THE SESSION'S OWN WORK, WITHOUT ITS ADD-ON. A block marked `addOn` is real work and reaches the
 * watch, but it is a SEPARATE token — so an easy run carrying strides still says how long the easy
 * part is. Counting the strides into `run_easy_{n}min` would prescribe the same minutes twice.
 */
function workSeconds(session: EnduranceSession): number {
  let total = 0;
  for (const block of session.blocks) {
    if (block.addOn) continue;
    for (let r = 0; r < block.repeat; r++) {
      for (const step of block.steps) {
        if (step.role === 'work' && step.seconds != null) total += step.seconds;
      }
    }
  }
  return total;
}

/** Clocked seconds the add-on blocks contribute — their own steps and their timed recoveries. */
function addOnSeconds(session: EnduranceSession): number {
  let total = 0;
  for (const block of session.blocks) {
    if (!block.addOn) continue;
    for (let r = 0; r < block.repeat; r++) {
      for (const step of block.steps) total += step.seconds ?? 0;
      if (block.restBetween?.seconds != null && r < block.repeat - 1) total += block.restBetween.seconds;
    }
  }
  return total;
}

/**
 * ⛔⛔ THE ADD-ON'S OWN TOKENS — AND THIS IS THE HALF THAT REACHES THE WATCH.
 *
 * Michael's one hard constraint on the strides: *"make sure however we do the strides they make it
 * onto garmin."* The watch builder reads a planned workout's INTERVALS, which come from these
 * tokens; anything living only in the description or the notes never leaves the phone.
 *
 * ⚠️ `strides_{n}x{s}s` IS THE MATERIALIZER'S OWN EXISTING TOKEN, not a new one — it emits a work
 * step per stride with NO pace target (which is p229's *"all-out"*, honestly carried) and a walk/jog
 * recovery between, skipping the trailing one. Nothing here had to be invented at the edge.
 * ⚠️ THE WATCH PUTS A NUMBER ON THE RECOVERY (90 seconds) WHERE THE LIBRARY STATES NONE. A watch
 * step cannot be untimed; the session's own card still says full recovery.
 */
/**
 * ⛔⛔ A COMPOUND ROUND, AS A TOKEN (2026-08-30). Several intensities inside ONE round is a shape the
 * grammar could not hold, so it flattened to N equal reps at one pace and the rest of the round
 * vanished. p231-232's MLSS surge/float and p237's anaerobic sandwich are both this.
 *
 * ⛔ ONLY WHEN THE BLOCK ACTUALLY IS ONE. Two or more steps whose (seconds, intensity) pairs are not
 * all identical. A block of one repeated step is a plain interval and keeps its existing token —
 * this must not quietly take over sessions that already round-trip correctly.
 * ⚠️ THE SEQUENCE IS THE BLOCK'S OWN, in order, including its untargeted steps: they are part of the
 * round's shape, not gaps between reps.
 */
function compoundRoundToken(block: {
  repeat: number;
  steps: Array<{ role: string; seconds?: number | null; intensity?: { kind: string; hi?: number } | null }>;
  restBetween?: { seconds?: number | null } | null;
}): string | null {
  const steps = block.steps.filter((st) => st.seconds != null && st.seconds > 0);
  if (steps.length < 2) return null;
  const shape = steps.map((st) => {
    const i = st.intensity;
    // ⚠️ `hi` is the band's top and is what the session prescribes at; `vt1`/`easy` carry no number.
    const at = i && i.kind === 'pct_threshold' && typeof i.hi === 'number'
      ? String(Math.round(i.hi * 100))
      : (i?.kind === 'race_pace' ? 'racepace' : i?.kind === 'vt1' ? 'vt1' : 'easy');
    /**
     * ⛔ THE ROLE TRAVELS, and it is not inferable from the number. p237's one-to-one is *"1 min @
     * 110% / 1 min @ 50%"* — the 50% half is a RECOVERY the source names, and emitting it as work
     * because it carries a percentage would put a work step at half of threshold on the row.
     * ⚠️ A FLOAT IS NOT A RECOVERY. p231's 105% float is prescribed work between surges; only
     * `role: 'recovery'` takes the marker.
     */
    const r = st.role === 'recovery' ? 'r' : '';
    return `${r}${Math.round(st.seconds as number)}s${at}`;
  });
  if (new Set(shape).size < 2) return null; // one repeated step is a plain interval, not a round
  const rest = block.restBetween?.seconds;
  return `round_${Math.max(1, block.repeat)}x_${shape.join('-')}`
    + (rest != null && rest > 0 ? `_R${Math.round(rest)}s` : '');
}


/**
 * ⛔⛔ AN EMBEDDED BLOCK — a faster block inside an otherwise steady session (2026-08-30).
 *
 * ⛔ SOURCED: p235 LSD level 2, *"60 min @ VT1 with a single 5-min @ 95% interval in the middle,
 * 10-min race-pace finish"*; p239 cycling endurance level 2, *"…2 sets of 4 rounds of (2 min @ 80% /
 * 3 min @ 70%)…"*. Both are steady work carrying something faster; both arrived as the steady part
 * alone, because the vocabulary only ever translated the session's FIRST block.
 *
 * ⚠️ IT REUSES THE ROUND GRAMMAR rather than adding a fourth shape — a block of one step is
 * `round_1x_600sracepace`, and a block of several is the round token it already builds. The three
 * shapes turned out to be one shape asked three ways.
 * ⚠️ THE STEADY BLOCK IS SKIPPED, always: it is the session's own body and already has its token.
 */
function embeddedBlockTokens(session: EnduranceSession, steadyIndex = 0): string[] {
  const out: string[] = [];
  session.blocks.forEach((block, i) => {
    if (i === steadyIndex) return;
    if (block.addOn) return; // strides carry their own token
    const compound = compoundRoundToken(block as never);
    if (compound) { out.push(compound); return; }
    const steps = block.steps.filter((st) => st.seconds != null && (st.seconds as number) > 0);
    if (steps.length !== 1) return;
    const st = steps[0];
    const i2 = st.intensity as { kind: string; hi?: number } | null | undefined;
    const at = i2 && i2.kind === 'pct_threshold' && typeof i2.hi === 'number'
      ? String(Math.round(i2.hi * 100))
      : (i2?.kind === 'race_pace' ? 'racepace' : i2?.kind === 'vt1' ? 'vt1' : null);
    // ⚠️ SILENT ON AN INTENSITY THE GRAMMAR CANNOT NAME, rather than emitting a wrong one.
    if (at == null) return;
    out.push(`round_${Math.max(1, block.repeat)}x_${Math.round(st.seconds as number)}s${at}`);
  });
  return out;
}

/**
 * p239's ride with work, as tokens in the order it is ridden:
 *   `bike_endurance_20min` · `round_4x_120s80-180s70` (× sets) with `bike_recovery_5min` between them ·
 *   `bike_vt1sprint_45min_10s_every9min`.
 * ⚠️ THE VT1 BOUT TRAVELS AS ONE TOKEN, not as its pieces: the materializer cuts it again, so the
 * watch sees the same (interval − sprint) + sprint pieces the library built.
 */
function printedRideTokens(session: EnduranceSession): string[] {
  const out: string[] = [];
  let vt1Seconds = 0;
  let sprintSeconds = 0;
  let everySeconds = 0;
  for (const block of session.blocks) {
    const steps = block.steps.filter((st) => st.seconds != null && (st.seconds as number) > 0);
    const kinds = steps.map((st) => (st.intensity as { kind?: string } | null)?.kind);
    if (kinds.includes('all_out')) {
      const sprint = steps.find((st) => (st.intensity as { kind?: string }).kind === 'all_out')!;
      const easy = steps.find((st) => (st.intensity as { kind?: string }).kind === 'vt1');
      sprintSeconds = sprint.seconds as number;
      everySeconds = (easy?.seconds as number ?? 0) + sprintSeconds;
      vt1Seconds += block.repeat * everySeconds;
      continue;
    }
    if (steps.length === 1 && kinds[0] === 'vt1') { vt1Seconds += block.repeat * (steps[0].seconds as number); continue; }
    const compound = compoundRoundToken(block as never);
    if (compound) { out.push(compound); continue; }
    if (steps.length === 1 && kinds[0] === 'easy') { out.push(`bike_recovery_${minutes(steps[0].seconds as number)}min`); continue; }
    if (steps.length === 1) { out.push(`bike_endurance_${minutes(steps[0].seconds as number)}min`); continue; }
  }
  if (vt1Seconds > 0 && sprintSeconds > 0 && everySeconds > 0) {
    out.push(`bike_vt1sprint_${minutes(vt1Seconds)}min_${Math.round(sprintSeconds)}s_every${minutes(everySeconds)}min`);
  }
  return out;
}

function addOnTokens(session: EnduranceSession): string[] {
  const out: string[] = [];
  for (const block of session.blocks) {
    if (block.addOn !== 'strides') continue;
    const seconds = block.steps.find((st) => st.role === 'work')?.seconds ?? null;
    if (seconds == null || block.repeat < 1) continue;
    out.push(`strides_${block.repeat}x${Math.round(seconds)}s`);
  }
  return out;
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
function wrapperTokens(session: EnduranceSession, sport: SessionType): { pre: string[]; post: string[] } {
  const warm = session.warmup.reduce((a, s) => a + (s.seconds ?? 0), 0);
  const cool = session.cooldown.reduce((a, s) => a + (s.seconds ?? 0), 0);
  /**
   * ⛔ THE WRAPPER IS PER SPORT (slice 4). It emitted `warmup_run_…` for everything, which was right
   * while the frame was run-only and would have put a run warm-up on a ride. Each of these is a token
   * the materializer already parses — `warmup_bike_quality_…` at `:1936`, `cooldown_bike_…` at
   * `:1950`, `swim_warmup_…` / `swim_cooldown_…` at `:2773`.
   *
   * ⚠️ THE SWIM WRAPPER IS DISTANCE-PRESCRIBED, not clocked, because that is what its expander reads.
   * The distance is the session's own warm-up metres — stage 1 built them; nothing here invents one.
   */
  if (sport === 'ride') {
    return {
      pre: warm > 0 ? [`warmup_bike_quality_${minutes(warm)}min_fastpedal`] : [],
      post: cool > 0 ? [`cooldown_bike_${minutes(cool)}min`] : [],
    };
  }
  if (sport === 'swim') {
    const m = (steps: typeof session.warmup) =>
      Math.round(steps.reduce((a, s) => a + (s.meters ?? 0), 0) / 50) * 50;
    const wm = m(session.warmup);
    const cm = m(session.cooldown);
    return {
      pre: wm > 0 ? [`swim_warmup_${wm}m`] : [],
      post: cm > 0 ? [`swim_cooldown_${cm}m`] : [],
    };
  }
  return {
    pre: warm > 0 ? [`warmup_run_${minutes(warm)}min_easy`] : [],
    post: cool > 0 ? [`cooldown_run_${minutes(cool)}min_easy`] : [],
  };
}

/** ⛔ THE SPORT A FAMILY BELONGS TO, read off its own prefix — the library's own naming, not a table. */
export function sportForFamily(family: FamilyId): SessionType {
  if (String(family).startsWith('ride_')) return 'ride';
  if (String(family).startsWith('swim_')) return 'swim';
  return 'run';
}

/** Work reps and their length in MINUTES, rounded to the minute the bike tokens are written in. */
function repMinutes(session: EnduranceSession): { reps: number; workMin: number; restMin: number } {
  const { reps, repSeconds, restSeconds } = repShape(session);
  return {
    reps: Math.max(1, reps),
    workMin: Math.max(1, Math.round(repSeconds / 60)),
    restMin: Math.max(1, Math.round(restSeconds / 60)),
  };
}

/**
 * ⚠️ EXPORTED 2026-08-27 so a test can hold it against the LIBRARY's family labels. The word
 * "Threshold" was on both — this file's name for `run_near_threshold` and the library's label for
 * `run_mlss` — so the wizard's word for one session was the plan's word for the other. Nothing here
 * changed; the library's label did.
 */
export const FAMILY_LABEL: Partial<Record<FamilyId, string>> = {
  /**
   * ⛔⛔ "Threshold Run" → "Near-threshold Run" (2026-08-27, off Michael's own screens). The wizard
   * row read *"Hard session 2 · Run · Near-threshold"* and the built plan called the same session
   * *"Threshold Run"* on Wednesday — two names for one session, and the plan's was the word that had
   * just been taken off the OTHER family for being wrong.
   *
   * ⛔ THE VOCABULARY FOLLOWS THE WIZARD, NOT THE REVERSE, because the wizard is now using his own
   * heading: p233 titles this family **"Near-Threshold"** — *"Workouts that maximize time
   * near-threshold (NT) — whether shorter above-threshold intervals or longer below-threshold
   * intervals"* — and its level-1 work sits at 88-95%.
   *
   * ⚠️ THE OTHER PAIRS ARE DIFFERENT WORDS FOR THE SAME THING AND THAT IS FINE. "Above threshold" /
   * "Hard Run" and "Sweet spot" / "Hard Ride" describe rather than collide — no library label is
   * another family's session name, which is the rule the cues test now enforces. What could not
   * stand was one WORD naming two different sessions.
   */
  run_mlss: 'Hard Run',
  run_near_threshold: 'Near-threshold Run',
  run_vt1: 'Easy Run',
  run_lsd: 'Long Run',
  // ⛔ SLICE 4 — the ride and swim slots. Plain names in the app's existing register; nothing here
  // says "sweet spot" or "MLSS" at an athlete, and the description carries the intensity.
  ride_sweet_spot: 'Hard Ride',
  /**
   * ⛔ p237'S OWN WORD, and it has to differ from the sweet-spot label or the week shows two rows
   * called "Hard Ride" that are 90% and 110%+ of FTP. ⚠️ "Anaerobic" is the source's term for the
   * session, not a coined one; the register rule bans OUR jargon ("sweet spot", "MLSS"), not his
   * name for a session.
   */
  ride_anaerobic: 'Anaerobic Ride',
  ride_endurance: 'Ride',
  swim_endurance: 'Easy Swim',
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
  const sport = sportForFamily(session.family);
  const { pre, post } = wrapperTokens(session, sport);
  const totalMin = minutes(session.totals.clockedSeconds);
  /**
   * ⛔⛔ THE SOURCE'S OWN CLASSIFICATION RIDES ON EVERY ENDURANCE SESSION (Michael, 2026-08-31) —
   * see `ENDURANCE_CLASS`. Two tokens, answering two different questions:
   *   · `intensity:` — HIS name for this session type, in the short form his programme tables print
   *     (`mlss+`, `nt`, `cyc_ana`, `lsd`). The family id is the app's key and the family's `label` is
   *     the field's plain word; neither is his vocabulary, and a reader wanting to reason about a
   *     week in his terms had nothing to read.
   *   · `band:` — where it sits relative to threshold, **ours**, derived from the page's own numbers.
   * ⚠️ ADDITIVE. Nothing is renamed and nothing is removed — `family:`, `level:` and `sport:` are
   * untouched, so every existing reader is unaffected and a tag list only ever grew.
   * ⚠️ AND THIS FILE TAKES NO PLACEMENT DECISION. It stores the fact; what may sit beside what is
   * p130-131's question, and the corpus records that the session-order pages do NOT answer it.
   */
  const klass = ENDURANCE_CLASS[session.family];
  const tags = [
    'standing_plan', `family:${session.family}`, `level:${session.level}`, `sport:${sport}`,
    `intensity:${classToken(session.family)}`, `band:${klass.band}`,
    /**
     * ⛔ THE ARCHETYPE TRAVELS ON THE ROW (2026-09-10). Today and the drawer pick the endurance ride's
     * line by it — p239 prints a plain ride and a ride with work, and they read differently. It was
     * known here and dropped at the row, so the client could not tell the two apart.
     */
    ...(session.archetype ? [`archetype:${session.archetype}`] : []),
  ];
  let work: string[];

  switch (session.family) {
    case 'run_vt1':
      work = [`run_easy_${minutes(workSeconds(session) || session.totals.clockedSeconds)}min`];
      break;

    case 'run_lsd': {
      // ⚠️ THE ADD-ON'S MINUTES COME OFF THE LONG-RUN TOKEN, because they travel as their own token.
      /**
       * ⛔⛔ AND THE INSERTS TRAVEL TOO (2026-08-30). This case emitted the easy long run ALONE, so
       * p235's own sets — *"1-hour VT1 run with 2 sets added at any point; the sets are 2 rounds of
       * 1:30 @ 115% / 30s @ VT1"* — existed in the composed session and reached the athlete's row
       * as nothing at all. The composer was right and this edge was dropping his prescription.
       * ⚠️ THE INSERT BLOCK IS THE REPEATED ONE. `buildContinuousWithInserts` returns exactly two
       * blocks: a `repeat: 1` steady bout, then the inserts. It carries no `addOn` marker, which is
       * why `addOnSeconds` never saw it and its minutes were never double-counted either.
       * ⚠️ SILENT WHEN THERE IS NO INSERT BLOCK — the hike and the plain VT1 jog are whole sessions.
       */
      /**
       * ⛔ EVERY BLOCK AFTER THE STEADY ONE NOW TRAVELS (2026-08-30) — see `embeddedBlockTokens`.
       * The insert-only path this replaces carried p235's sets and silently dropped the race-pace
       * finish, which is the same session shape asked a different way.
       */
      work = [
        `longrun_${Math.max(1, totalMin - minutes(addOnSeconds(session)))}min_easypace`,
        ...embeddedBlockTokens(session),
      ];
      break;
    }

    case 'run_near_threshold': {
      /**
       * ⛔⛔ THE PRESCRIPTION IS TIME, SO THE TOKEN IS TIME (2026-09-08). This emitted `cruise_` — a
       * DISTANCE token — and it produced the worst row in the programme.
       *
       * ⛔ WHAT IT COST, MEASURED ON A BUILT PLAN. p246's day 3 is the hardest run of the week: 8
       * reps of 4 minutes at 90% of threshold with 75 seconds between (pp233-234), which the
       * composer sizes at **59 minutes**. Every materialized row read **25**.
       *
       * ⛔ AND 25 IS NOT A ROUNDING — IT IS THE WARM-UP, THE RESTS AND THE COOL-DOWN, WITH THE WORK
       * COUNTED AS ZERO. Two failures in one line, both caused by naming a distance the source never
       * gave:
       *   1. `cruise_` needs a pace to turn 240 seconds into miles, and this athlete has none —
       *      Michael ruled on 2026-09-02 that a threshold is *"either learned or entered"*, with no
       *      5K math, so a null threshold is the DESIGNED state for a new athlete. The old line's
       *      `: 1` fallback then invented **one mile per rep**, a number from nowhere.
       *   2. The materializer expands a distance step with no pace into a step with no time, and the
       *      row's duration is the sum of its steps. 10 min warm-up + 7 × 60 s of DEFAULT rest +
       *      8 min cool-down = **25**. The source's own 75-second rest never travelled either,
       *      because `cruise_` has no rest field in the shape this file emitted.
       *
       * ⛔ SO THE FIX IS THE SHAPE, NOT THE ROW. `interval_{n}x{s}s_{pct}pct_R{rest}s` already
       * exists, is already parsed (`expandRunToken`), and is already in both materializer caches —
       * it was built for p235's long-run inserts, which are seconds at a percentage for the same
       * reason. It carries the reps, the rep's own SECONDS, the source's percentage and the source's
       * rest, and it survives a missing pace: the athlete gets the right session with an effort
       * target and no pace number, which is exactly the accepted consequence of the 2026-09-02
       * ruling. **Time survives a missing pace; distance does not.**
       *
       * ⚠️ THE SAME RULE THE MLSS BRANCH BELOW ALREADY FOLLOWS — it emits `round_`, which is
       * time-based, which is why day 1's rows have always carried their full length.
       * ⚠️ THE `cruise_` PARSER STAYS in the materializer. Rows built before this keep it and still
       * read; a rebuild or a restate re-materializes them onto the new shape. Fix-forward.
       */
      const { reps, repSeconds, restSeconds } = repShape(session);
      /**
       * ⛔ THE SOURCE'S OWN PERCENTAGE — the band's top, the same reading `compoundRoundToken` takes
       * for every other percentage token in this file. Every archetype in this family states one
       * (`pct_threshold`), so the fallback below is a guard rather than a path.
       */
      const workStep = session.blocks
        .flatMap((b) => b.steps)
        .find((st) => st.role === 'work' && st.seconds != null);
      const at = workStep?.intensity;
      const pct = at && at.kind === 'pct_threshold' && typeof at.hi === 'number'
        ? Math.round(at.hi * 100)
        : null;
      work = pct != null
        ? [`interval_${reps}x${repSeconds}s_${pct}pct` + (restSeconds > 0 ? `_R${restSeconds}s` : '')]
        // ⚠️ AN INTENSITY THE GRAMMAR CANNOT NAME still travels as TIME, through the round shape,
        // rather than falling back to a distance this file would have to invent.
        : [`round_${reps}x_${repSeconds}s${at?.kind === 'race_pace' ? 'racepace' : 'vt1'}`
          + (restSeconds > 0 ? `_R${restSeconds}s` : '')];
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
      /**
       * ⛔⛔ THE ROUND IS CARRIED VERBATIM NOW, AND THE REASONING ABOVE IS SUPERSEDED (2026-08-30).
       * Everything above the line was true of a grammar that *"can only say n reps of d metres"*.
       * It can say a compound round since today — see `compoundRoundToken` — so re-expressing p231's
       * three intensities as six equal reps at one pace is no longer the honest option, it is just
       * the old one. Measured on a live row before the change: `interval_6x445m_5kpace_R90s`, six
       * work steps every one at 8:00/mi, against *"6 rounds of: 15s @ 130% / 45s @ 105% / 1 min @
       * VT1"*. The runner's hardest session of the week.
       * ⚠️ THE FALLBACK BELOW STANDS UNCHANGED for a session whose block is NOT compound — a single
       * repeated step is a plain interval and keeps the token it has always had.
       */
      {
        const roundBlock = session.blocks.find((b) => compoundRoundToken(b as never) != null);
        const roundTok = roundBlock ? compoundRoundToken(roundBlock as never) : null;
        if (roundTok) { work = [roundTok]; break; }
      }
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

    /**
     * ⛔ SLICE 4 — THE RIDE SLOTS. Same edge, same rule: every token below is one
     * `expandBikeToken` already parses, checked against its own regexes on 2026-08-23.
     *
     * ⚠️ THE BAND IS THE TOKEN'S, AND THE EQUIVALENCE PICKED THE TOKEN. `bike_ss_` is 85-95% of FTP
     * and `bike_thr_` is 95-105%; `sport-slots.ts` maps an MLSS slot to the sweet-spot `medium`
     * archetype, whose own work band is 0.95-1.00, so the threshold token is the honest carrier for
     * it and the sweet-spot token for the softer archetypes. ⛔ `bike_vo2_` (110-120%) is never
     * emitted by this plan — it is HARDER than any run slot it would replace.
     */
    case 'ride_sweet_spot': {
      const { reps, workMin, restMin } = repMinutes(session);
      // The archetype decides which side of threshold this sits on — `medium` is his 95-100% work.
      const atThreshold = session.archetype === 'medium';
      work = [`bike_${atThreshold ? 'thr' : 'ss'}_${reps}x${workMin}min_R${restMin}min`];
      break;
    }

    /**
     * ⛔⛔ THE BIKE'S SECOND QUALITY SESSION (2026-08-30) — see `RIDE_EQUIVALENT` for why it exists.
     * Without this case the family throws, and that throw is the tripwire below doing its job: it
     * fired 8,000+ times across the fuzz sweep the moment the mapping made this family reachable.
     *
     * ⚠️ THE TOKEN IS `bike_vo2_`, AND THAT IS A POWER BAND, NOT A NAME. It is the only token in the
     * materializer's grammar carrying 110-120% of FTP (`pctRange(1.1, 1.2)`), which is p237's stated
     * 110-115%+ floor. The athlete never sees the token — the row is labelled from `FAMILY_LABEL`
     * above, which reads "Anaerobic Ride". ⛔ This does NOT make the session a VO2 session and does
     * not reopen the `ride_vo2` objection in `sport-slots.ts`; it reuses a band rather than adding a
     * second grammar for the same numbers.
     *
     * ⚠️ MINUTES, BECAUSE THE GRAMMAR HAS NO SECONDS FORM for a powered repeat. `clampRideLevel` caps
     * every ride family at level 2, and p237's level-2 option is *"6-10 x 1 min @ 110-115%+ with 4-6
     * min recovery"* — whole minutes, so nothing is rounded away at the level this plan can reach.
     * ⛔ A level-1 45-second repeat WOULD be rounded, and the grammar is where that would have to be
     * fixed, not here.
     */
    case 'ride_anaerobic': {
      /**
       * ⛔⛔ THE SANDWICH IS A COMPOUND ROUND (2026-08-30). p237: *"5 rounds of: 30s @ 120% / 2:30 @
       * 90% / 30s @ 120% / 4-min easy spin."* `bike_vo2_Nx{min}min` carries ONE intensity, so the 90%
       * middle was absent from the row and the work seconds came out at roughly double the source's.
       * ⚠️ `progressive_repeats` IS NOT COMPOUND — one step per round — so it keeps its existing
       * token, which is the point of the guard inside `compoundRoundToken`.
       */
      const roundBlock = session.blocks.find((b) => compoundRoundToken(b as never) != null);
      const roundTok = roundBlock ? compoundRoundToken(roundBlock as never) : null;
      if (roundTok) { work = [roundTok]; break; }
      const { reps, workMin, restMin } = repMinutes(session);
      work = [`bike_vo2_${reps}x${workMin}min_R${restMin}min`];
      break;
    }

    case 'ride_endurance': {
      /**
       * ⛔⛔ THE PRINTED RIDE WITH WORK TRANSLATES IN ITS OWN ORDER (2026-09-10) — the opening spin,
       * the round sets with the spin between them, then the VT1 bout with its sprints. The steady-first
       * branch below put the steady minutes at the front and never saw a sprint at all.
       */
      if (session.blocks.some((b) => b.steps.some((st) => (st.intensity as { kind?: string } | null)?.kind === 'all_out'))) {
        work = printedRideTokens(session);
        break;
      }
      // ⛔ CONTINUOUS. `bike_endurance_{n}min` is 65-75% of FTP, which is his "below 75%" (p239).
      /**
       * ⛔ AND THE TEMPO BLOCKS TRAVEL WITH IT (2026-08-30). p239 level 2's second option is
       * *"…2 sets of 4 rounds of (2 min @ 80% / 3 min @ 70%) with 5-min easy spin between sets…"* —
       * the `mixed` archetype. Only the steady block was ever translated, so every 80% and 70% block
       * was absent from the row. `steady` has one block and is unaffected.
       * ⚠️ THE STEADY MINUTES ARE THE FIRST BLOCK'S, not the whole session's, or the embedded work
       * would be prescribed twice.
       */
      const steadySec = session.blocks[0]?.steps
        .filter((st) => st.seconds != null)
        .reduce((t, st) => t + (st.seconds as number), 0) ?? 0;
      work = [
        `bike_endurance_${Math.max(1, minutes(steadySec || workSeconds(session) || session.totals.clockedSeconds))}min`,
        ...embeddedBlockTokens(session),
      ];
      break;
    }

    /**
     * ⛔ SLICE 4 — THE SWIM, AND IT IS ONE SESSION (Michael, 2026-08-23): easy laps and technique.
     * `swim_endurance` at level 1 is the only swim this plan can reach — `sport-slots.ts` assigns
     * nothing else and a lint holds it — so this case does not branch on level.
     *
     * ⚠️ DISTANCE-PRESCRIBED, because the swim expander (`:2889`) reads distances, not clocks. The
     * metres are stage 1's own; nothing here invents one.
     */
    case 'swim_endurance': {
      const { reps } = repShape(session);
      const metres = session.blocks
        .flatMap((b) => b.steps)
        .filter((st) => st.role === 'work' && st.meters != null)
        .map((st) => st.meters as number);
      const per = metres.length > 0
        ? Math.max(50, Math.round(metres[0] / 50) * 50)
        : 200;
      const { restSeconds } = repShape(session);
      work = [`swim_aerobic_${reps}x${per}m_r${Math.max(10, Math.round(restSeconds))}`];
      break;
    }

    default:
      // ⛔ ANY FAMILY THIS EDGE HAS NOT BEEN TAUGHT FAILS LOUDLY rather than emitting a token the
      // materializer will silently drop. ⚠️ That deliberately includes `ride_vo2`, `ride_sprints`,
      // `swim_speed` and `swim_open_water`: none of them is reachable from this plan's assignment,
      // and a throw here is the tripwire if one ever becomes reachable by accident.
      // ⚠️ `ride_anaerobic` LEFT THAT LIST ON 2026-08-30 — it is now reachable ON PURPOSE and has a
      // case above. The tripwire worked exactly as written: it fired the moment the mapping changed.
      throw new Error(`no session-vocabulary translation for family: ${session.family}`);
  }

  const label = FAMILY_LABEL[session.family] ?? (sport === 'ride' ? 'Ride' : sport === 'swim' ? 'Swim' : 'Run');
  const raceTempo = opts?.raceTempo === true;
  /**
   * ⛔ THE ARCHETYPE'S PAGE WHERE THERE IS ONE, THE FAMILY'S OTHERWISE — see `TranslatedSession.cite`.
   * ⚠️ Read off the same tables the session was BUILT from, never a second list: a citation kept
   * beside the thing it cites cannot drift from it.
   */
  const famRules = FAMILIES[session.family];
  const archCite = famRules?.archetypes?.find((a) => a.id === session.archetype)?.cite;
  return {
    /**
     * ⚠️ THE PAGE, NOT THE WHOLE NOTE. An archetype's `cite` often carries a clause after the page —
     * *"Viada pp231-232 — 2-minute recovery walk/jog between sets"* — which is provenance for a
     * reader of the library and noise on a session row. The clause is already in the session's own
     * notes where it belongs.
     */
    cite: (archCite || famRules?.cite || '').split('—')[0].trim(),
    type: sport,
    name: raceTempo ? `${label} (race tempo)` : label,
    description: describeSession(session, raceTempo),
    duration: totalMin,
    // ⛔ THE ADD-ON SITS BETWEEN THE SESSION AND THE COOLDOWN — p109 puts the strides after the run,
    // and the watch plays these in order.
    steps_preset: [...pre, ...work, ...addOnTokens(session), ...post],
    tags: raceTempo ? [...tags, 'race_tempo'] : tags,
  };
}

/**
 * The athlete-facing sentence. ⚠️ Fact-first, no imperative, no encouragement — the house voice.
 * Stage 1's own notes carry the citations and the honest caveats; the ones that change what the
 * athlete DOES are the ones repeated here.
 */
function describeSession(session: EnduranceSession, raceTempo: boolean): string {
  /**
   * ⛔⛔ THE DESCRIPTION IS THE FAMILY LINE TODAY PRINTS (Michael, 2026-09-10). One source —
   * `family-lines.ts` — read by both surfaces, so a session says the same sentence on Today and in
   * the drawer. The steps list with its power or heart-rate targets follows it in the drawer exactly
   * as before; that comes off `steps_preset` and `computed.steps`, not this string.
   *
   * ⛔ THE p107 DRIFT PARAGRAPH IS GONE FROM THE DESCRIPTION. *"End the session when heart rate has
   * drifted 5%…"* is a mid-session rule the athlete applies with a watch, and it had already come
   * off Today for that reason (§2 revised); the ride/run card reads drift against the same 5% line
   * AFTER the session. ⚠️ THE NOTE ITSELF IS NOT DELETED — `CARDIAC_DRIFT_NOTE` still rides on the
   * library session's `notes` for any reader that wants the rule; it is only no longer the row's
   * sentence.
   *
   * ⛔ THE TWO APPROVED RUN LINES FOLLOW THE FAMILY LINE (Michael, 2026-09-10 — put back after one
   * day out). `run_mlss`: *"Fatigue spread evenly across the rounds. Hills are fine, adjust pace to
   * hold the effort."* (p231). `run_vt1` / `run_lsd`: *"Go by heart rate. Pace varies with fatigue,
   * hydration and weather."* (p235). They say HOW to run the session, which the family line does not,
   * and the drawer is where the athlete reads the session in full. Today keeps the family line alone.
   *
   * ⚠️ THE RACE-TEMPO SENTENCE STAYS, after the family line, and only on a race-tempo row. That row
   * is a different session from its family (p247: race pace, recoveries a quarter longer) and the
   * sentence is the only place the difference is stated.
   */
  const parts: string[] = [];
  const line = familyLineFor(session.family, session.archetype);
  if (line) parts.push(line);
  // ⛔ THE PEDALLING NOTE, UNDER THE LINE, IN THE DRAWER ONLY (2026-09-10, p239).
  if (session.family === 'ride_endurance') parts.push(RIDE_ENDURANCE_DRAWER_NOTE);
  if (session.family === 'run_mlss') {
    parts.push('Fatigue spread evenly across the rounds. Hills are fine, adjust pace to hold the effort.');
  }
  if (session.family === 'run_vt1' || session.family === 'run_lsd') {
    parts.push('Go by heart rate. Pace varies with fatigue, hydration and weather.');
  }
  if (raceTempo) {
    parts.push('Run at race pace, with the recovery periods a quarter longer than usual.');
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
  // ⛔ `cruise_` IS NO LONGER EMITTED (2026-09-08) — `run_near_threshold` prescribes SECONDS and now
  // says so; see that case for the 59-minute session that materialized as 25. The shape stays listed
  // because the materializer still parses it for rows built before the change.

  { shape: /^interval_\d+x\d+m_5kpace_R\d+s$/, example: 'interval_6x800m_5kpace_R90s' },
  // ⛔ THE STRIDES ADD-ON (p109). The materializer has parsed this shape since before the Standing
  // Plan existed; it emits one untargeted work step per stride and a walk/jog between.
  { shape: /^strides_\d+x\d+s$/, example: 'strides_6x20s' },
  // ⛔ SLICE 4 — the ride and swim tokens, all of them already parsed by the materializer.
  { shape: /^warmup_bike_quality_\d+min_fastpedal$/, example: 'warmup_bike_quality_15min_fastpedal' },
  { shape: /^cooldown_bike_\d+min$/, example: 'cooldown_bike_10min' },
  { shape: /^bike_ss_\d+x\d+min_R\d+min$/, example: 'bike_ss_3x12min_R4min' },
  { shape: /^bike_thr_\d+x\d+min_R\d+min$/, example: 'bike_thr_4x8min_R5min' },
  // ⛔ THE ANAEROBIC RIDE (2026-08-30) — the 110-120% band, `expandBikeToken`'s `bike_vo2_` rule.
  { shape: /^bike_vo2_\d+x\d+min_R\d+min$/, example: 'bike_vo2_6x1min_R5min' },
  // ⛔ p235's long-run inserts (2026-08-30) — seconds at a percentage of threshold speed.
  { shape: /^interval_\d+x\d+s_\d+pct(?:_R\d+s)?$/, example: 'interval_2x90s_115pct_R30s' },
  // ⛔ p231's surge/float and p237's sandwich — several intensities inside one round.
  { shape: /^round_\d+x_(?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*(?:_R\d+s)?$/,
    example: 'round_3x_15s130-45s105-60svt1_R120s' },
  { shape: /^bike_endurance_\d+min$/, example: 'bike_endurance_90min' },
  // ⛔ p239's ride with work (2026-09-10): the spin between round sets, and the VT1 bout with sprints.
  { shape: /^bike_recovery_\d+min$/, example: 'bike_recovery_5min' },
  { shape: /^bike_vt1sprint_\d+min_\d+s_every\d+min$/, example: 'bike_vt1sprint_45min_10s_every9min' },
  { shape: /^swim_warmup_\d+m$/, example: 'swim_warmup_300m' },
  { shape: /^swim_cooldown_\d+m$/, example: 'swim_cooldown_200m' },
  { shape: /^swim_aerobic_\d+x\d+m_r\d+$/, example: 'swim_aerobic_6x200m_r20' },
];

/**
 * ⛔ THE MATERIALIZER'S BIKE AND SWIM PATTERNS, COPIED FROM `expandBikeToken` (`:1925`) AND THE SWIM
 * EXPANDERS (`:2773`+) ON 2026-08-23. ⚠️ A CACHE of those functions, exactly like the run list above;
 * if their regexes move, this list is stale and the gate that reads it is the tripwire.
 */
export const MATERIALIZER_RIDE_PATTERNS: RegExp[] = [
  /warmup_bike_quality_\d+min_fastpedal/,
  /cooldown_bike_\d+min/,
  /bike_ss_(\d+)x(\d+)min_r(\d+)min/i,
  /bike_thr_(\d+)x(\d+)min_r(\d+)min/i,
  // ⛔ ADDED 2026-08-30 with the anaerobic ride. It has always existed in `expandBikeToken`
  // (`pctRange(1.1, 1.2)`); it was missing from this CACHE only because nothing emitted it.
  /bike_vo2_(\d+)x(\d+)min_r(\d+)min/i,
  /bike_endurance_(\d+)min/,
  /bike_recovery_\d+min/,
  /bike_vt1sprint_(\d+)min_(\d+)s_every(\d+)min/,
];
export const MATERIALIZER_SWIM_PATTERNS: RegExp[] = [
  /swim_(warmup|cooldown)_(\d+)(yd|m)/,
  /^swim_aerobic_(\d+)x(\d+)(yd|m)(?:_r(\d+))?$/,
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
  // ⛔ THE TIME-BASED PERCENTAGE FORM, added 2026-08-30 with p235's long-run inserts. `/interval_\d+x/`
  // above already matches it, and it is spelled out so the cache names every shape this edge emits.
  /^interval_\d+x\d+s_\d+pct(?:_[rR]\d+s)?$/,
  // ⛔ THE COMPOUND ROUND (2026-08-30) — both expanders parse it; see their branches.
  /^round_\d+x_(?:r?\d+s(?:\d+|vt1|easy|racepace))(?:-r?\d+s(?:\d+|vt1|easy|racepace))*(?:_[rR]\d+s)?$/,
  // ⛔ COPIED FROM `expandRunToken`'s strides branch (`materialize-plan/index.ts:1870`) on
  // 2026-08-26. Same cache rule as the rest of this list: if that regex moves, the gate is the
  // tripwire.
  /strides_\d+x/,
];
