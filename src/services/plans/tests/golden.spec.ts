import { placeWeek } from '../scheduler/simpleScheduler';
import { readFileSync } from 'fs';
import path from 'path';

function loadCase(name: string) {
  const p = path.resolve(__dirname, name);
  return JSON.parse(readFileSync(p, 'utf-8'));
}

describe('Deterministic golden tests', () => {
  it('Case A: Mon–Fri availability, Experienced, Strength 3× (Endurance)', () => {
    const g = loadCase('golden.caseA.json');
    const { input, expect } = g;
    const { slots, notes } = placeWeek(input);

    // Invariant: no strength on long day
    if (expect.noStrengthOnLong) {
      const has = slots.some((s: any) => s.poolId.startsWith('strength_') && s.day === input.longRunDay);
      expect(has).toBe(false);
    }

    // Stacked days count
    const stackedDays = new Set(slots.filter((s: any) => s.poolId.startsWith('strength_') && ['Tue','Thu','Wed','Mon','Fri'].includes(s.day)).map((s: any) => s.day)).size;
    expect(stackedDays).toBeLessThanOrEqual(expect.maxStackedDays);

    // If 3 cannot fit, a reduction note is present (planner logic may reduce)
    if (expect.reduceTo2IfNeeded) {
      const hasReduceNote = notes.some((n: string) => n.includes('Reduced strength to 2×'));
      expect(hasReduceNote).toBe(true);
    }

    // Notes include canonical strings
    for (const s of expect.notesIncludes) {
      expect(notes.join('\n')).toEqual(expect.notesIncludes.join('\n'));
      break; // exact match check for simplicity in this minimal harness
    }
  });
});


