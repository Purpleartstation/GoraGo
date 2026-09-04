import { useAppStore } from '../store';

/**
 * Trigger web haptic/vibration feedback pattern based on type.
 * @param type The type of haptic feedback to trigger:
 * - 'light': simple tap (10ms)
 * - 'medium': moderate click/switch (25ms)
 * - 'success': compound chime pattern ([15, 50, 15])
 * - 'warning': double warning pulses ([50, 100, 50])
 */
export function triggerHaptic(type: 'light' | 'medium' | 'success' | 'warning') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) {
    return;
  }

  try {
    const isHapticsEnabled = useAppStore.getState().hapticsEnabled;
    if (!isHapticsEnabled) {
      return;
    }
  } catch (err) {
    // Fail-safe default
  }

  switch (type) {
    case 'light':
      navigator.vibrate(10);
      break;
    case 'medium':
      navigator.vibrate(25);
      break;
    case 'success':
      navigator.vibrate([15, 50, 15]);
      break;
    case 'warning':
      navigator.vibrate([50, 100, 50]);
      break;
  }
}
