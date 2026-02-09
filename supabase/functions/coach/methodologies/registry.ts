import type { CoachMethodology } from './types.ts';
import type { MethodologyId } from '../types.ts';
import { RunPerformanceBuildMethodology } from './run-performance-build.ts';
import { RunSustainableMethodology } from './run-sustainable.ts';

const byId: Record<MethodologyId, CoachMethodology> = {
  'run:performance_build': RunPerformanceBuildMethodology,
  'run:sustainable': RunSustainableMethodology,
  unknown: RunPerformanceBuildMethodology, // safest strict default
};

export function getMethodology(id: MethodologyId): CoachMethodology {
  return byId[id] || RunPerformanceBuildMethodology;
}

