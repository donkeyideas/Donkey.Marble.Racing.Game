import * as Haptics from 'expo-haptics';

const COOLDOWN_MS = 100;
let lastTime = 0;

function throttled(fn: () => Promise<void>) {
  const now = Date.now();
  if (now - lastTime < COOLDOWN_MS) return;
  lastTime = now;
  fn().catch(() => {});
}

export const raceHaptics = {
  bumperHit:        () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  trampolineBounce: () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  speedBurst:       () => throttled(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  pendulumHit:      () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  cradleHit:        () => throttled(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  finish:           () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerWin:        () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  playerLose:       () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  betPlaced:        () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
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
