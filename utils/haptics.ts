import { useGameStore } from '../state/gameStore';

let Haptics: typeof import('expo-haptics') | null = null;
try {
  Haptics = require('expo-haptics');
} catch {
  console.warn('[Haptics] expo-haptics not available');
}

const COOLDOWN_MS = 50;
let lastTime = 0;

/* Respect the user's Vibration preference. Read non-reactively from the
 * Zustand store — these helpers are called from imperative game-loop code,
 * not React render. When the flag is off, all haptics early-return. */
function vibrationEnabled(): boolean {
  try {
    return useGameStore.getState().settings.vibration;
  } catch {
    return true;
  }
}

function throttled(fn: () => Promise<void>) {
  if (!vibrationEnabled()) return;
  const now = Date.now();
  if (now - lastTime < COOLDOWN_MS) return;
  lastTime = now;
  fn().catch(() => {});
}

export const raceHaptics = {
  bumperHit:        () => Haptics && throttled(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Heavy)),
  trampolineBounce: () => Haptics && throttled(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Heavy)),
  speedBurst:       () => Haptics && throttled(() => Haptics!.notificationAsync(Haptics!.NotificationFeedbackType.Warning)),
  pendulumHit:      () => Haptics && throttled(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Heavy)),
  cradleHit:        () => Haptics && throttled(() => Haptics!.impactAsync(Haptics!.ImpactFeedbackStyle.Heavy)),
  finish:           () => vibrationEnabled() && Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerWin:        () => vibrationEnabled() && Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerLose:       () => vibrationEnabled() && Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  betPlaced:        () => vibrationEnabled() && Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
};

export type HapticType = 'bumper' | 'trampoline' | 'speedBurst' | 'pendulum' | 'cradle';

export function triggerRaceHaptic(type: HapticType) {
  switch (type) {
    case 'bumper':      raceHaptics.bumperHit(); break;
    case 'trampoline':  raceHaptics.trampolineBounce(); break;
    case 'speedBurst':  raceHaptics.speedBurst(); break;
    case 'pendulum':    raceHaptics.pendulumHit(); break;
    case 'cradle':      raceHaptics.cradleHit(); break;
  }
}
