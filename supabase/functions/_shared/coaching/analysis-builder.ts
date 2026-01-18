/**
 * AnalysisBuilder - Generates scientific explanations for reschedule scenarios
 * 
 * Maps documented physiological principles to user-facing coaching explanations
 */

import { PlannedWorkout } from './types.ts';

export class AnalysisBuilder {

  /**
   * Principle: Interference Effect & Glycogen Depletion
   * Trigger: Moving a Long Run 24h before a Quality Session
   */
  static interference(nextWorkout: PlannedWorkout) {
    const workoutType = nextWorkout.type || 'workout';
    return {
      physiological: `A long run depletes muscle glycogen by ~60% and causes structural micro-tears. Your body physiogically requires 48 hours to restore fuel for high-intensity efforts like ${workoutType}.`,
      scheduling: `This move places a high-volume session 24 hours before a high-intensity session. This violates the 'Hard/Easy' principle essential for performance.`,
      verdict: `Strongly advised against. You will likely be too fatigued to hit your target paces for the ${workoutType}, turning a key workout into 'junk miles'.`
    };
  }

  /**
   * Principle: Supercompensation & CNS Recovery
   * Trigger: Moving a Long Run earlier (e.g., Saturday)
   */
  static optimization() {
    return {
      physiological: "Completing volume early allows for a longer period of passive recovery (lower cortisol, reduced inflammation) before the next training block begins.",
      scheduling: "You create a 24-hour buffer between weeks. This separation ensures you enter the next week's quality work with 'fresh legs'.",
      verdict: "Highly Recommended. This is the gold standard for rescheduling as it prioritizes recovery."
    };
  }

  /**
   * Principle: Cumulative Fatigue
   * Trigger: Moving to a day with no acute conflict, but losing rest
   */
  static compression(nextWorkout?: PlannedWorkout) {
    const workoutType = nextWorkout?.type || 'easy run';
    return {
      physiological: "While there is no acute conflict, removing your rest day keeps physiological stress (cortisol) elevated, potentially blunting adaptation.",
      scheduling: `You lose your weekly recovery buffer. While ${workoutType} is an easy run, the cumulative load of the week will feel heavier.`,
      verdict: "Acceptable but not ideal. Monitor your fatigue levels closely next week."
    };
  }

  /**
   * Principle: Recovery Weeks & Hormone Normalization
   * Trigger: Skipping a workout in a Recovery Week
   */
  static recoverySkip() {
    return {
      physiological: "You're in a recovery week. The goal is to lower cortisol and restore hormonal balance (testosterone/cortisol ratio). Skipping this workout further supports that goal by reducing physiological stress.",
      scheduling: "You lose volume, but you gain freshness. In recovery weeks, freshness > volume. This trade-off is mathematically positive for long-term adaptation.",
      verdict: "Strategic Choice. Recovery weeks are designed for shedding fatigue. Taking a zero here is physiologically sound, especially if life stress is high."
    };
  }

  /**
   * Principle: Stimulus Preservation
   * Trigger: Skipping a workout in a Build Week
   */
  static emergencySkip() {
    return {
      physiological: "You're in a build week. Missing a long run reduces your aerobic stimulus for the week, but preventing injury/burnout is always physiogically superior to forcing a bad run.",
      scheduling: "This creates a gap in your volume progression, but protects the integrity of your upcoming interval sessions. Build weeks prioritize adaptation stimulus.",
      verdict: "Use as a last resort. It is better to skip than to run injured, but try not to make this a habit. Build weeks need volume for adaptation."
    };
  }
}
