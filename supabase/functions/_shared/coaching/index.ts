/**
 * Coaching Engine - Shared Module
 * 
 * Exports all coaching logic for use by edge functions
 */

export { AnalysisBuilder } from './analysis-builder.ts';
export { getRescheduleEngine } from './reschedule-factory.ts';
export { PerformancePlanRescheduleEngine } from './engines/performance-engine.ts';
export type {
  PlannedWorkout,
  Day,
  RescheduleOption,
  RescheduleContext,
  RescheduleEngine
} from './types.ts';
