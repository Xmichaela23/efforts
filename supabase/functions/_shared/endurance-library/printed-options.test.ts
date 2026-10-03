/**
 * Every printed endurance option, as printed (week builder Stage 2, 2026-10-02).
 *
 *   ~/.deno/bin/deno test -A --no-check supabase/functions/_shared/endurance-library/printed-options.test.ts
 *
 * The checklist is docs/AUDIT-book-pieces-2026-10-02.md §1; the page lines are docs/SOURCE-viada-hybrid-athlete.md Part D.
 * These pin the options that were missing or built from a band, read off the page, and hold that every option at every
 * level reaches a plan row in tokens the materializer reads.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { archetypesFor, buildEnduranceSession, FAMILIES, type FamilyId, type Level } from './index.ts';
import {
  EMITTED_TOKEN_SHAPES,
  MATERIALIZER_RIDE_PATTERNS,
  MATERIALIZER_RUN_PATTERNS,
  MATERIALIZER_SWIM_PATTERNS,
  sportForFamily,
  translateEnduranceSession,
} from '../standing-plan/session-vocabulary.ts';
import { parseQualityWork } from '../plan-tokens/quality-work.ts';

const B = { performance_numbers: { threshold_pace_sec_per_mi: 420, ftp: 250, ftp_source: 'manual', swimPace100: '1:45' } };
const LEVELS: Level[] = [1, 2, 3];
const ids = (f: FamilyId, l: Level) => archetypesFor(f, l).map((a) => a.id).sort();

Deno.test('the page\'s option count per level, for the types this stage completed', () => {
  // p230–231 print 5 / 9 / 12 sprint lines.
  assertEquals(LEVELS.map((l) => archetypesFor('run_sprint_power', l).length), [5, 9, 12]);
  // p231–232 print 4 / 5 / 5 MLSS lines.
  assertEquals(LEVELS.map((l) => archetypesFor('run_mlss', l).length), [4, 5, 5]);
  // p233–234: 8 / 8 / 9 lines plus the race-specific line (the 5K line here; the 10K, half and marathon lines are race-only).
  assertEquals(LEVELS.map((l) => archetypesFor('run_near_threshold', l).length), [9, 9, 10]);
  assertEquals(ids('run_near_threshold', 2).includes('race_repeats_10k'), false, 'the 10K line is offered only to a 10K race block');
  assertEquals(archetypesFor('run_near_threshold', 2, '10k' as never).some((a) => a.id === 'race_repeats_10k'), true);
  // p235 L3: two insert choices, the race-pace finish, the hike, the fartlek.
  assertEquals(ids('run_lsd', 3), ['fartlek', 'hike', 'long_with_inserts', 'long_with_inserts_95', 'race_pace_finish']);
  // p236 L3: 4 lines; p237: 4 / 5 / 5; pp238–239: 4 / 4 / 4.
  assertEquals(archetypesFor('ride_sprints', 3).length, 4);
  assertEquals(LEVELS.map((l) => archetypesFor('ride_anaerobic', l).length), [4, 5, 5]);
  assertEquals(LEVELS.map((l) => archetypesFor('ride_sweet_spot', l).length), [4, 4, 4]);
});

Deno.test('p230 L1: 3 rounds of 4 x 50 m from a dead stop, 1-minute walks, 1-minute rest between rounds', () => {
  const s = buildEnduranceSession({ family: 'run_sprint_power', level: 1, archetype: 'flying_short', baselines: B });
  assertEquals(s.blocks.length, 1);
  const b = s.blocks[0];
  assertEquals(b.repeat, 3);
  assertEquals(b.steps.filter((st) => st.meters === 50).length, 4);
  assertEquals(b.steps.filter((st) => st.role === 'recovery').map((st) => st.seconds), [60, 60, 60]);
  assertEquals(b.restBetween?.seconds, 60);
});

Deno.test('p230 L1: 300 m at 130–140% with full recovery — the range travels to the row', () => {
  const s = buildEnduranceSession({ family: 'run_sprint_power', level: 1, archetype: 'speed_endurance', baselines: B });
  const row = translateEnduranceSession(s);
  const tok = row.steps_preset.find((t) => t.startsWith('round_'))!;
  assertEquals(tok, 'round_2x_300m130to140-rlapeasy-300m130to140-rlapeasy-300m130to140_Rlap');
});

Deno.test('p232 L3: 2 larger sets of 4 sets of 4 rounds of 40/20, 2-min between small sets, 4-min between larger', () => {
  const s = buildEnduranceSession({ family: 'run_mlss', level: 3, archetype: 'forty_twenty', baselines: B });
  const b = s.blocks[0];
  assertEquals(b.repeat, 2);
  assertEquals(b.steps.filter((st) => st.role === 'work' && st.seconds === 40).length, 16);
  assertEquals(b.steps.filter((st) => st.label === 'Between sets').length, 3);
  assertEquals(b.restBetween?.seconds, 240);
});

Deno.test('p232 L2/L3: the 10 s / 10 s all-out / 50 s round', () => {
  const s2 = buildEnduranceSession({ family: 'run_mlss', level: 2, archetype: 'mixed_surge', baselines: B });
  assertEquals(s2.blocks[0].repeat, 2);
  assertEquals(s2.blocks[0].restBetween, null, 'level 2 prints no rest between sets');
  const s3 = buildEnduranceSession({ family: 'run_mlss', level: 3, archetype: 'mixed_surge', baselines: B });
  assertEquals(s3.blocks[0].repeat, 3);
  assertEquals(s3.blocks[0].restBetween?.seconds, 90);
  assert(s3.blocks[0].steps.some((st) => st.intensity.kind === 'all_out' && st.seconds === 10));
});

Deno.test('p233: 1200 m repeats rest half the rep\'s own time; without a threshold the rest is the lap button', () => {
  const s = buildEnduranceSession({ family: 'run_near_threshold', level: 1, archetype: 'repeats_1200', baselines: B });
  const work = s.blocks[0].steps.find((st) => st.meters === 1200)!;
  const rest = s.blocks[0].steps.find((st) => st.role === 'recovery')!;
  assertEquals(rest.seconds, Math.round((work.seconds as number) * 0.5));
  const none = buildEnduranceSession({ family: 'run_near_threshold', level: 1, archetype: 'repeats_1200' });
  assertEquals(none.blocks[0].steps.find((st) => st.role === 'recovery')!.open, 'lap');
});

Deno.test('p237: the fade is one minute or more at 130%; the 30/30 set runs until 120% cannot be held', () => {
  const fade = buildEnduranceSession({ family: 'ride_anaerobic', level: 1, archetype: 'fade_130', baselines: B });
  const f = fade.blocks[0].steps.find((st) => st.open === 'at_least')!;
  assertEquals([f.seconds, f.intensity], [60, { kind: 'pct_threshold', lo: 1.3, hi: 1.3 }]);
  assertEquals(translateEnduranceSession(fade).steps_preset.at(-1), 'round_4x_30s100-30s110-60s+130_R300s');
  const until = buildEnduranceSession({ family: 'ride_anaerobic', level: 3, archetype: 'until_fail_120', baselines: B });
  assertEquals(translateEnduranceSession(until).steps_preset.at(-1), 'round_3x_lap120_R300s');
});

Deno.test('p239 L3: 3 rounds of 20 min @ 80% with a 10-s all-out sprint every 4 minutes', () => {
  const s = buildEnduranceSession({ family: 'ride_sweet_spot', level: 3, archetype: 'tempo', baselines: B });
  const work = s.blocks.reduce((t, b) => t + b.repeat * b.steps.reduce((u, st) => u + (st.seconds ?? 0), 0), 0);
  assertEquals(work, 3 * 20 * 60);
  assertEquals(s.blocks[0].steps.filter((st) => st.intensity.kind === 'all_out').length, 5);
});

Deno.test('every option at every level reaches a row in tokens the materializer reads', () => {
  const patterns = { run: MATERIALIZER_RUN_PATTERNS, ride: MATERIALIZER_RIDE_PATTERNS, swim: MATERIALIZER_SWIM_PATTERNS };
  for (const family of Object.keys(FAMILIES) as FamilyId[]) {
    for (const level of LEVELS) {
      for (const a of archetypesFor(family, level, ('half' as never))) {
        const s = buildEnduranceSession({ family, level, archetype: a.id, baselines: B });
        const row = translateEnduranceSession(s);
        const sport = sportForFamily(family) as 'run' | 'ride' | 'swim';
        for (const tok of row.steps_preset) {
          const known = patterns[sport].some((rx) => rx.test(tok)) || EMITTED_TOKEN_SHAPES.some((e) => e.shape.test(tok));
          assert(known, `${family} L${level} ${a.id}: "${tok}" is a token the materializer does not read`);
          if (tok.startsWith('round_')) assert(parseQualityWork(tok), `${family} L${level} ${a.id}: "${tok}" does not parse`);
        }
      }
    }
  }
});

Deno.test('a printed range is reported with the value the session was built at, inside it', () => {
  for (const family of Object.keys(FAMILIES) as FamilyId[]) {
    for (const level of LEVELS) {
      for (const a of archetypesFor(family, level)) {
        const s = buildEnduranceSession({ family, level, archetype: a.id, baselines: B });
        for (const r of s.ranges) {
          assert(r.lo < r.hi, `${family} L${level} ${a.id} ${r.what}: ${r.lo}–${r.hi} is not a range`);
          if (r.what !== 'session_seconds') {
            assert(r.built >= r.lo && r.built <= r.hi, `${family} L${level} ${a.id} ${r.what}: built ${r.built} outside ${r.lo}–${r.hi}`);
          }
        }
      }
    }
  }
  const vt1 = buildEnduranceSession({ family: 'run_vt1', level: 2, baselines: B });
  assertEquals(vt1.ranges.map((r) => [r.what, r.lo, r.hi]), [['session_seconds', 2700, 3600]]);
});
