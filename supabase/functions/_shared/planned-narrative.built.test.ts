/**
 * ⛔ TODAY'S NARRATIVE OVER THE REAL STEP BUILDER (2026-09-20). `planned-narrative.test.ts` pins the words on
 * hand-made steps; this file builds each hard workout the way a plan does — the library session, its tokens,
 * materialize-plan's own expander — and reads the narrative off those steps, beside the list the session sheet prints.
 *
 * Run: deno test --no-check -A supabase/functions/_shared/planned-narrative.built.test.ts
 * Athlete-agnostic: synthetic numbers (threshold 8:00/mi, FTP 250 W).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildEnduranceSession } from './endurance-library/index.ts';
import { FAMILIES } from './endurance-library/source-rules.ts';
import { translateEnduranceSession } from './standing-plan/session-vocabulary.ts';
import { expandTokensForRow, toV3Step } from '../materialize-plan/index.ts';
import { plannedNarrative, NARRATED_FAMILIES } from './planned-narrative.ts';

const ANCHORS: any = {
  run: { sport: 'run', value: 480, unit: 'sec_per_mi', source: 't', isEstimate: false, vt1SecPerMi: 600, easyRangeSecPerMi: { lo: 547, hi: 619 } },
  ride: { sport: 'ride', value: 250, unit: 'watts', source: 't', isEstimate: false },
};
const BASE: any = { ftp: 250, _resolvedThresholdSecPerMi: 480, _resolvedEasySecPerMi: 583, _resolvedEasyRange: { lo: 547, hi: 619 }, _anchors: { ftp_w: 250 } };
const NOTHING_ON_FILE: any = {};

function narrativeOf(family: string, level: 1 | 2 | 3, archetype: string, baselines: any = BASE): string | null {
  const t: any = translateEnduranceSession(buildEnduranceSession({ family, level, archetype, size: 0.5, anchors: ANCHORS } as any) as any);
  const row = { ...t, id: 'x', date: '2026-09-21' };
  const v3 = expandTokensForRow(row, baselines).steps.map((s: any, i: number) => toV3Step({ ...s, planned_index: i }, row));
  const tags: string[] = t.tags;
  const tag = (p: string) => tags.find((x) => x.startsWith(p))?.slice(p.length) ?? null;
  return plannedNarrative(v3, { sport: t.type, units: 'imperial', family: tag('family:'), archetype: tag('archetype:'), level: Number(tag('level:')) || null });
}

Deno.test('the runs, as a plan builds them (pp231–234)', () => {
  assertEquals(narrativeOf('run_mlss', 2, 'descending'),
    '2 sets. Set 1: 3:00, 2:00, 1:00, 45 seconds and 30 seconds at 6:00–7:20/mi. After each one: 2:00, 1:20, 40 seconds, 30 seconds and 20 seconds at 12:00–14:40/mi. Then 2:00 at 9:07–10:19/mi. Set 2 repeats set 1 from the 2:00 effort.');
  assertEquals(narrativeOf('run_mlss', 1, 'descending'),
    '3:00, 2:00, 1:00, 45 seconds and 30 seconds at 6:00–7:20/mi. After each one: 2:00, 1:20, 40 seconds, 30 seconds and 20 seconds at 12:00–14:40/mi.');
  assertEquals(narrativeOf('run_mlss', 2, 'surge_float'),
    '2 sets of 4 rounds: 15 seconds at 5:32–6:46/mi, 45 seconds at 6:51–8:23/mi, then 1 minute at 9:07–10:19/mi. 2-minute recovery walk or jog between sets.');
  assertEquals(narrativeOf('run_mlss', 2, 'forty_twenty'),
    '5 sets of 4 rounds: 40 seconds at 5:32–6:46/mi, then 20 seconds at 14:24–17:36/mi. 2-minute walk or recovery jog between sets.');
  assertEquals(narrativeOf('run_near_threshold', 3, 'sustained_5min_90'),
    '8 rounds: 5 minutes at 8:00–9:46/mi, then 1:30 at 9:07–10:19/mi.');
  assertEquals(narrativeOf('run_near_threshold', 1, 'surge_embedded'),
    '4 rounds: 2 minutes at 7:35–9:16/mi, 15 seconds at 6:15–7:39/mi, 1:15 at 7:35–9:16/mi, 2 minutes at 8:00–9:46/mi, then 1:30 at 9:07–10:19/mi.');
  assertEquals(narrativeOf('run_near_threshold', 1, 'surge_opener'),
    '5 rounds: 20 seconds at 5:09–6:17/mi, 4:40 at 7:50–9:34/mi, then a 1-minute easy jog.');
});

Deno.test('the rides, as a plan builds them (pp236–239)', () => {
  assertEquals(narrativeOf('ride_anaerobic', 1, 'progressive_repeats'), '10 repeats of 45 seconds, with 5 minutes of recovery between them.');
  assertEquals(narrativeOf('ride_anaerobic', 1, 'one_to_one'), '10 rounds: 1 minute at 275–325 W, then 1 minute at 113–138 W.');
  // p237's "4-minute easy spin" reaches the step bare; the narrative takes the page's word (`step-words.ts`).
  assertEquals(narrativeOf('ride_anaerobic', 1, 'sandwich'),
    '5 rounds: 30 seconds at 300–325 W, 2:30 at 225–325 W, 30 seconds at 300–325 W, then a 4-minute easy spin.');
  assertEquals(narrativeOf('ride_vo2', 1, 'long_vo2'), '5 rounds of 3 minutes at 275–300 W, with a 5-minute rest between them.');
  assertEquals(narrativeOf('ride_vo2', 1, 'short_vo2'),
    '2 sets of 6 rounds: 1:30 at 259–316 W, then 1:30 of easy spin. 5 minutes of recovery between sets.');
  assertEquals(narrativeOf('ride_vo2', 1, 'micro'),
    '4 sets of 5 rounds: 30 seconds at 281–344 W, then 30 seconds at 191–234 W. 5-minute rest between sets.');
  assertEquals(narrativeOf('ride_sweet_spot', 1, 'minute_surge'),
    '3 sets of 6 minutes at 203–248 W, with 10 seconds at 236–289 W every minute on the minute. 3-minute easy spin after each set.');
  assertEquals(narrativeOf('ride_sweet_spot', 1, 'long'), '3 rounds of 8 minutes at 203–248 W, with a 4-minute easy spin between them.');
  assertEquals(narrativeOf('ride_sprints', 1, 'max_effort'),
    '3 max-effort sprints of 2 minutes, each one aiming to beat the last. 5:30 of recovery between them.');
  assertEquals(narrativeOf('ride_sprints', 1, 'flying_surge'), '8 flying 30-second surges to max effort, with 2:30 of recovery between them.');
});

Deno.test('⛔ every hard workout a plan can build has a narrative at levels 1 and 2, and none names a percentage or VT1', () => {
  // ⚠️ `standing_start` has no round token and builds for no plan (`frames.ts` offers max_effort and flying_surge).
  for (const family of NARRATED_FAMILIES) {
    for (const a of (FAMILIES as any)[family].archetypes) {
      if (a.id === 'standing_start') continue;
      for (const level of (a.levels ?? [1, 2, 3]) as (1 | 2 | 3)[]) {
        const n = narrativeOf(family, level, a.id);
        // Level 3's three full ladders and p237 level 3's nested sets are left unsaid (`MAX_ROUND_STEPS`).
        const unsaid = level === 3 && (a.id === 'descending' || a.id === 'sandwich');
        assertEquals(n == null, unsaid, `${family}/${a.id}/L${level}: ${n}`);
        if (n) assert(!/%|VT1|undefined|null|NaN/.test(n), `${family}/${a.id}/L${level}: ${n}`);
      }
    }
  }
});

Deno.test('⛔ an athlete with no threshold pace and no FTP on file gets no narrative where the efforts carry no number', () => {
  assertEquals(narrativeOf('run_mlss', 2, 'surge_float', NOTHING_ON_FILE), null);
  assertEquals(narrativeOf('ride_vo2', 1, 'long_vo2', NOTHING_ON_FILE), null);
});
