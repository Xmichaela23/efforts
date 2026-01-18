/**
 * RescheduleFactory
 * 
 * Routes plan types to their appropriate reschedule engines.
 * Each plan type gets its own coaching logic based on its training philosophy.
 */

import { PerformancePlanRescheduleEngine } from './engines/performance-engine.ts';
import { RescheduleEngine } from './types.ts';

export function getRescheduleEngine(planType: string | null | undefined): RescheduleEngine {
  // Normalize plan type
  const normalizedType = (planType || '').toLowerCase();
  
  // Performance Build plans (Jack Daniels inspired)
  // - Strict recovery windows
  // - Protects quality days
  // - Enforces Hard/Easy principle
  if (normalizedType.includes('performance') || 
      normalizedType.includes('balanced') ||
      normalizedType === 'performance_build') {
    return new PerformancePlanRescheduleEngine();
  }
  
  // Sustainable plans (Hal Higdon inspired)
  // - More flexible scheduling
  // - Volume-focused
  // - Less strict about quality day protection
  // TODO: Implement SustainablePlanRescheduleEngine when needed
  // For now, fall back to performance engine (more strict = safer)
  if (normalizedType.includes('sustainable') || 
      normalizedType === 'sustainable') {
    // return new SustainablePlanRescheduleEngine();
    return new PerformancePlanRescheduleEngine(); // Fallback
  }
  
  // Default: Use performance engine (most strict = safest)
  return new PerformancePlanRescheduleEngine();
}
