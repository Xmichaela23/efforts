/** Single choke point for post-mutation cache busts (planned + workouts + week). */
export function invalidateWorkoutScreens(): void {
  try {
    window.dispatchEvent(new CustomEvent('planned:invalidate'));
    window.dispatchEvent(new CustomEvent('workouts:invalidate'));
    window.dispatchEvent(new CustomEvent('week:invalidate'));
  } catch (e) {
    console.warn('[invalidateWorkoutScreens] dispatch failed:', e);
  }
}
