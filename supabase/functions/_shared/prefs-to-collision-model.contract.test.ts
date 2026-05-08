/**
 * Run: npx deno test supabase/functions/_shared/prefs-to-collision-model.contract.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  preferredDaysObjectToCollisionSessions,
  trainingPrefsToCollisionSessions,
  validateTrainingPrefsScheduleCollision,
} from './prefs-to-collision-model.ts';

Deno.test('preferredDaysObjectToCollisionSessions: builds pillars from Arc-style object', () => {
  const sessions = preferredDaysObjectToCollisionSessions({
    long_ride: 'saturday',
    long_run: 'sunday',
    quality_bike: 'wednesday',
    quality_run: 'thursday',
    easy_bike: 'tuesday',
    easy_run: 'friday',
    swim: ['monday', 'tuesday'],
    strength: ['tuesday', 'friday'],
  });
  const kinds = sessions.map((s) => s.type).sort().join(',');
  assertEquals(kinds.includes('quality_bike'), true);
  assertEquals(kinds.includes('quality_run'), true);
  assertEquals(sessions.filter((s) => s.type === 'swim').length, 2);
});

Deno.test('validateTrainingPrefsScheduleCollision: typical tri anchors pass', () => {
  const r = validateTrainingPrefsScheduleCollision({
    preferred_days: {
      long_ride: 'saturday',
      long_run: 'sunday',
      quality_bike: 'wednesday',
      quality_run: 'thursday',
      easy_bike: 'tuesday',
      easy_run: 'friday',
      swim: ['monday'],
      strength: ['tuesday'],
    },
  });
  assertEquals(r.ok, true);
});

Deno.test('trainingPrefsToCollisionSessions: merges nested with flat optimizer fields', () => {
  const sessions = trainingPrefsToCollisionSessions({
    preferred_days: {
      quality_bike: 'wednesday',
      quality_run: 'thursday',
      long_ride: 'saturday',
      long_run: 'sunday',
    },
    bike_easy_day: 2,
    run_easy_day: 5,
  });
  const qb = sessions.find((s) => s.type === 'quality_bike');
  assertEquals(qb?.day, 'wednesday');
});
