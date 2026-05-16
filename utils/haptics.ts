let Haptics: typeof import('expo-haptics') | null = null;
try {
  Haptics = require('expo-haptics');
} catch {
  console.warn('[Haptics] expo-haptics not available');
}

const COOLDOWN_MS = 50;
let lastTime = 0;

function throttled(fn: () => Promise<void>) {
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
  finish:           () => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerWin:        () => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerLose:       () => Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  betPlaced:        () => Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
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
