import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { unattachedPlannedIds, withUnattached, withoutUnattached } from './unattached-planned.ts';

Deno.test('unattach is remembered and keeps the rest of the metadata', () => {
  const m = withUnattached({ rpe: 6, talk_test: 'yes' }, 'p1');
  assertEquals(m.rpe, 6);
  assertEquals(m.talk_test, 'yes');
  assertEquals(unattachedPlannedIds(m), ['p1']);
  assertEquals(unattachedPlannedIds(withUnattached(m, 'p1')), ['p1']);
});

Deno.test('metadata as a JSON string or null', () => {
  assertEquals(unattachedPlannedIds(JSON.stringify({ unattached_planned_ids: ['a'] })), ['a']);
  assertEquals(unattachedPlannedIds(null), []);
  assertEquals(unattachedPlannedIds('not json'), []);
});

Deno.test('an explicit attach removes the id; nothing to remove returns null', () => {
  const m = withUnattached(withUnattached({}, 'p1'), 'p2');
  assertEquals(unattachedPlannedIds(withoutUnattached(m, 'p1')), ['p2']);
  assertEquals(withoutUnattached({ rpe: 5 }, 'p1'), null);
  assertEquals(withoutUnattached(withUnattached({ rpe: 5 }, 'p1'), 'p1'), { rpe: 5 });
});
