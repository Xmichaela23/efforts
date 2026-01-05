/**
 * Block Analysis Modules
 * 
 * Smart Server, Dumb Client Architecture
 * 
 * All complex calculations happen here in TypeScript.
 * GPT only writes a brief coaching insight at the end.
 * Frontend just renders the structured data.
 */

// Types
export * from './types.ts';

// Calculation modules
export { 
  calculatePerformanceTrends, 
  formatTrendForDisplay 
} from './calculate-trends.ts';

export { 
  calculatePlanAdherence, 
  formatAdherenceForDisplay 
} from './calculate-adherence.ts';

export { 
  calculateWeekSummary, 
  formatWeekSummaryForDisplay 
} from './calculate-week-summary.ts';

export { 
  generateFocusAreas, 
  formatFocusAreasForDisplay 
} from './generate-focus-areas.ts';

export { 
  assessDataQuality, 
  formatDataQualityForDisplay 
} from './data-quality.ts';

