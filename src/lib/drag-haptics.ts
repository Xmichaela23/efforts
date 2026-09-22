import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * ⛔ THE DRAG IS FELT ON AN iPHONE (2026-09-21). `navigator.vibrate` does nothing in iOS WebKit, so in the app the
 * Capacitor Haptics plugin carries it: a light impact when a session is picked up, a selection tick each time the
 * finger crosses onto a new day. On the web the old vibrate nudge at pickup is unchanged and there is no tick.
 * ⛔ ONE PLACE FOR BOTH DRAGS: the calendar week and the "Can't train this day" sheet.
 * ⚠️ Every call is guarded — a haptic that fails must never stop the drag.
 */
export const dragHaptics = {
  pickUp() {
    try {
      if (Capacitor.isNativePlatform()) {
        void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        void Haptics.selectionStart().catch(() => {});
      } else {
        (navigator as { vibrate?: (n: number) => void }).vibrate?.(12);
      }
    } catch { /* not offered */ }
  },
  crossDay() {
    try { if (Capacitor.isNativePlatform()) void Haptics.selectionChanged().catch(() => {}); } catch { /* not offered */ }
  },
  end() {
    try { if (Capacitor.isNativePlatform()) void Haptics.selectionEnd().catch(() => {}); } catch { /* not offered */ }
  },
};
