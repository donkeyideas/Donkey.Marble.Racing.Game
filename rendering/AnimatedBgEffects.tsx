/**
 * Animated background effects for race themes.
 * Uses Reanimated SharedValues + Skia primitives for GPU-driven particles.
 * ~15-20 circles per theme — negligible CPU/GPU cost.
 */
import React, { useEffect, useMemo } from 'react';
import { Circle, Rect, Group } from '@shopify/react-native-skia';
import { SharedValue, useSharedValue, useDerivedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

interface AnimatedBgEffectsProps {
  bgImage: string;
  screenW: number;
  totalH: number;
}

// Seeded random for deterministic particle positions
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 13), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}

interface Particle {
  baseX: number;
  baseY: number;
  r: number;
  color: string;
  speed: number;   // animation speed multiplier
  phase: number;    // 0-1 phase offset
  drift: number;    // horizontal drift amount
}

function generateParticles(
  bgImage: string, screenW: number, totalH: number,
): Particle[] {
  const rng = seededRandom(bgImage.length * 7 + 42);
  const particles: Particle[] = [];
  const count = 28; // bumped from 16 — visibly populated background without perf cost

  const config = THEME_PARTICLES[bgImage];
  if (!config) return [];

  for (let i = 0; i < count; i++) {
    particles.push({
      baseX: rng() * screenW,
      baseY: rng() * totalH,
      r: config.minR + rng() * (config.maxR - config.minR),
      color: config.colors[Math.floor(rng() * config.colors.length)],
      speed: 0.6 + rng() * 0.8,
      phase: rng(),
      drift: (rng() - 0.5) * config.driftRange,
    });
  }
  return particles;
}

// Per-theme particle configurations
const THEME_PARTICLES: Record<string, {
  colors: string[];
  minR: number;
  maxR: number;
  driftRange: number;
  direction: 'up' | 'down' | 'float';
  opacity: number;
}> = {
  volcanic: {
    colors: ['rgba(255,140,40,0.95)', 'rgba(255,100,20,0.85)', 'rgba(255,220,80,0.9)'],
    minR: 3, maxR: 7, driftRange: 40, direction: 'up', opacity: 1.0,
  },
  lava: {
    colors: ['rgba(255,120,40,0.9)', 'rgba(255,80,10,0.8)', 'rgba(255,200,60,0.85)'],
    minR: 3, maxR: 7, driftRange: 30, direction: 'up', opacity: 1.0,
  },
  ocean: {
    colors: ['rgba(130,220,255,0.85)', 'rgba(180,240,255,0.8)', 'rgba(100,200,250,0.8)'],
    minR: 3, maxR: 8, driftRange: 20, direction: 'up', opacity: 1.0,
  },
  neon: {
    colors: ['rgba(50,255,155,0.95)', 'rgba(255,80,255,0.9)', 'rgba(50,220,255,0.9)'],
    minR: 3, maxR: 6, driftRange: 15, direction: 'float', opacity: 1.0,
  },
  night: {
    colors: ['rgba(255,255,255,0.95)', 'rgba(220,235,255,0.9)', 'rgba(255,255,210,0.9)'],
    minR: 2, maxR: 4, driftRange: 5, direction: 'float', opacity: 1.0,
  },
  snow: {
    colors: ['rgba(255,255,255,0.95)', 'rgba(235,245,255,0.9)', 'rgba(220,235,250,0.85)'],
    minR: 3, maxR: 7, driftRange: 40, direction: 'down', opacity: 1.0,
  },
  candy: {
    colors: ['rgba(255,125,200,0.9)', 'rgba(255,225,40,0.85)', 'rgba(180,255,180,0.8)'],
    minR: 3, maxR: 6, driftRange: 30, direction: 'down', opacity: 1.0,
  },
  desert: {
    colors: ['rgba(230,200,120,0.85)', 'rgba(210,180,100,0.8)'],
    minR: 2, maxR: 5, driftRange: 50, direction: 'float', opacity: 1.0,
  },
  cyber: {
    colors: ['rgba(180,80,255,0.9)', 'rgba(120,220,255,0.85)', 'rgba(220,130,255,0.85)'],
    minR: 2, maxR: 5, driftRange: 10, direction: 'float', opacity: 1.0,
  },
  sunset: {
    colors: ['rgba(255,170,70,0.9)', 'rgba(255,120,100,0.85)', 'rgba(220,100,170,0.85)'],
    minR: 4, maxR: 9, driftRange: 60, direction: 'float', opacity: 1.0,
  },
  forest: {
    colors: ['rgba(120,220,70,0.85)', 'rgba(200,240,120,0.8)', 'rgba(255,255,170,0.85)'],
    minR: 2, maxR: 5, driftRange: 15, direction: 'down', opacity: 1.0,
  },
  beach: {
    colors: ['rgba(255,255,220,0.85)', 'rgba(220,235,255,0.8)'],
    minR: 2, maxR: 4, driftRange: 20, direction: 'float', opacity: 1.0,
  },
  ice: {
    colors: ['rgba(200,235,255,0.9)', 'rgba(235,250,255,0.85)', 'rgba(170,220,255,0.85)'],
    minR: 2, maxR: 5, driftRange: 25, direction: 'down', opacity: 1.0,
  },
  grass: {
    colors: ['rgba(140,220,80,0.85)', 'rgba(220,240,140,0.8)'],
    minR: 2, maxR: 4, driftRange: 10, direction: 'down', opacity: 1.0,
  },
};

/** Single animated particle — position derived from SharedValue clock */
function AnimParticle({ p, clock, totalH, direction }: {
  p: Particle;
  clock: SharedValue<number>;
  totalH: number;
  direction: 'up' | 'down' | 'float';
}) {
  const cx = useDerivedValue(() => {
    const t = (clock.value * p.speed + p.phase) % 1;
    return p.baseX + Math.sin(t * Math.PI * 2) * p.drift;
  });

  const cy = useDerivedValue(() => {
    const t = (clock.value * p.speed + p.phase) % 1;
    if (direction === 'up') {
      // Rise from bottom — wrap around
      return p.baseY - t * totalH * 0.3;
    } else if (direction === 'down') {
      // Fall from top — wrap around
      return (p.baseY + t * totalH * 0.3) % totalH;
    }
    // Float: gentle bob
    return p.baseY + Math.sin(t * Math.PI * 2) * 15;
  });

  const opacity = useDerivedValue(() => {
    // Gentle pulse — biased high so particles stay visible (range ~0.6–1.0).
    const t = (clock.value * p.speed * 1.5 + p.phase) % 1;
    return 0.8 + Math.sin(t * Math.PI * 2) * 0.2;
  });

  return (
    <Circle cx={cx} cy={cy} r={p.r} color={p.color} opacity={opacity} />
  );
}

export default function AnimatedBgEffects({ bgImage, screenW, totalH }: AnimatedBgEffectsProps) {
  const config = THEME_PARTICLES[bgImage];
  const particles = useMemo(
    () => generateParticles(bgImage, screenW, totalH),
    [bgImage, screenW, totalH],
  );

  // Continuous clock 0→1 over 8 seconds, repeating forever
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.linear }),
      -1, // infinite
      false,
    );
  }, [bgImage]);

  if (!config || particles.length === 0) return null;

  return (
    <Group>
      {particles.map((p, i) => (
        <AnimParticle
          key={i}
          p={p}
          clock={clock}
          totalH={totalH}
          direction={config.direction}
        />
      ))}
    </Group>
  );
}
