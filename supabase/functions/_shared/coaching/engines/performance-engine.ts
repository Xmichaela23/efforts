/**
 * PerformancePlanRescheduleEngine
 * 
 * Implements the "Neural/Speed" protocol for Performance Build plans.
 * Strictly enforces 48-72h recovery windows and interference detection.
 * 
 * Based on Jack Daniels 2Q System principles:
 * - Protects quality days (intervals, threshold)
 * - Enforces Hard/Easy principle
 * - Detects glycogen depletion conflicts
 */

import { RescheduleEngine, RescheduleContext, RescheduleOption, PlannedWorkout } from './base.ts';
import { AnalysisBuilder } from '../analysis-builder.ts';

export class PerformancePlanRescheduleEngine implements RescheduleEngine {
  
  getOptions(context: RescheduleContext): RescheduleOption[] {
    const { missedWorkout, dayIndex, timeline, currentWeekType } = context;
    const options: RescheduleOption[] = [];
    
    const isRecoveryWeek = currentWeekType === 'recovery';
    const isLongRun = this.isLongRun(missedWorkout);
    const isQualityRun = this.isQualityRun(missedWorkout);

    // --- OPTION 1: The "Early Bird" (Day X-1) ---
    // Principle: Optimization / Buffer Creation
    if (dayIndex > 0) {
      const prevDay = timeline[dayIndex - 1];
      const isPrevDayFree = !prevDay.workout || 
                           prevDay.workout.type === 'rest' || 
                           prevDay.workout.type === 'cross_training';
      
      if (isPrevDayFree) {
        options.push({
          rank: 1,
          label: `Optimal: Move to ${prevDay.name}`,
          action: 'move',
          targetDateOffset: -1,
          riskLevel: 'safe',
          tags: ['Optimal Recovery', 'Rest Protected'],
          analysis: AnalysisBuilder.optimization()
        });
      }
    }

    // --- OPTION 2: The "Procrastinator" (Day X+1) ---
    // Principle: Interference Effect
    if (dayIndex + 1 < timeline.length) {
      const nextDay = timeline[dayIndex + 1];
      const interferenceDay = timeline[dayIndex + 2]; // The day AFTER the move

      if (interferenceDay?.workout) {
        const nextQualityIsHard = this.isQualityRun(interferenceDay.workout);

        if (nextQualityIsHard) {
          // CONFLICT: 24h gap before Quality
          options.push({
            rank: 5,
            label: `High Risk: Move to ${nextDay.name}`,
            action: 'move',
            targetDateOffset: 1,
            riskLevel: 'high',
            tags: ['Glycogen Depletion', 'Injury Risk'],
            analysis: AnalysisBuilder.interference(interferenceDay.workout)
          });
        } else {
          // NO CONFLICT: 24h gap before Easy
          options.push({
            rank: 3,
            label: `Sub-Optimal: Move to ${nextDay.name}`,
            action: 'move',
            targetDateOffset: 1,
            riskLevel: 'moderate',
            tags: ['Buffer Loss'],
            analysis: AnalysisBuilder.compression(interferenceDay.workout)
          });
        }
      } else if (interferenceDay) {
        // No workout on interference day - safe move
        options.push({
          rank: 2,
          label: `Acceptable: Move to ${nextDay.name}`,
          action: 'move',
          targetDateOffset: 1,
          riskLevel: 'safe',
          tags: ['No Conflict'],
          analysis: AnalysisBuilder.compression()
        });
      }
    }

    // --- OPTION 3: SPLIT (Recovery Weeks Only) ---
    if (isRecoveryWeek && isLongRun) {
      options.push({
        rank: 3,
        label: "Split the Volume",
        action: 'split',
        riskLevel: 'safe',
        tags: ['Volume Preserved', 'Reduced Stress'],
        analysis: {
          physiological: "You're in a recovery week. Splitting the distance reduces structural stress on bones/tendons while maintaining total weekly aerobic volume. Lower stress per session supports recovery goals.",
          scheduling: "Uses two days instead of one, but keeps intensity low. This preserves volume while respecting the recovery week's purpose.",
          verdict: "Safe and effective for recovery weeks. This maintains aerobic fitness while reducing structural load."
        }
      });
    }

    // --- OPTION 4: SKIP ---
    if (isRecoveryWeek) {
      options.push({
        rank: 2,
        label: "Strategic Skip",
        action: 'skip',
        riskLevel: 'safe',
        tags: ['Hormone Reset', 'Freshness'],
        analysis: AnalysisBuilder.recoverySkip()
      });
    } else {
      options.push({
        rank: 4,
        label: "Emergency Skip",
        action: 'skip',
        riskLevel: 'moderate',
        tags: ['Stimulus Lost'],
        analysis: AnalysisBuilder.emergencySkip()
      });
    }

    return options.sort((a, b) => a.rank - b.rank);
  }

  /**
   * Check if workout is a long run
   */
  private isLongRun(workout: PlannedWorkout): boolean {
    if (!workout) return false;
    
    const name = (workout.name || '').toLowerCase();
    const desc = (workout.description || '').toLowerCase();
    const tags = Array.isArray(workout.tags) ? workout.tags.map(t => String(t).toLowerCase()) : [];
    const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset.join(' ').toLowerCase() : '';
    
    const allText = [name, desc, steps, ...tags].join(' ');
    
    return allText.includes('long') || 
           tags.includes('long_run') ||
           steps.includes('longrun');
  }

  /**
   * Check if workout is a quality/hard session (intervals, threshold, tempo)
   */
  private isQualityRun(workout: PlannedWorkout): boolean {
    if (!workout) return false;
    
    const name = (workout.name || '').toLowerCase();
    const desc = (workout.description || '').toLowerCase();
    const tags = Array.isArray(workout.tags) ? workout.tags.map(t => String(t).toLowerCase()) : [];
    const steps = Array.isArray(workout.steps_preset) ? workout.steps_preset.join(' ').toLowerCase() : '';
    
    const allText = [name, desc, steps, ...tags].join(' ');
    
    // Quality session indicators
    const qualityTokens = [
      'interval', 'threshold', 'tempo', 'vo2', 'speed',
      'intervals', 'thresholds', 'cruise', '5kpace', '10kpace'
    ];
    
    return qualityTokens.some(token => allText.includes(token)) ||
           tags.some(tag => ['intervals', 'threshold', 'tempo', 'quality'].includes(tag));
  }
}
