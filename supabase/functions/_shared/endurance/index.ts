// Shared endurance model (the spine). One sourced model every run shape draws from — zones (HR + pace),
// volume ramps + peaks, and the forgiving↔sharp intensity dial. Composes with _shared/periodization/
// (one-way: endurance reads phase vocabulary; periodization knows nothing of endurance).
//
// Stage E1+E2: all four pieces are faithful lifts, parity-proven against today's outputs (see
// endurance-parity.test.ts). NOTHING is wired to a plan consumer yet — consumers wire from E3.
// See docs/SPEC-shared-endurance-model.md §10.

export * from './hr-zones.ts';
export * from './pace-zones.ts';
export * from './volume.ts';
export * from './distribution.ts';
