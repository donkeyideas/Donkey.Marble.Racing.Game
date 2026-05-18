/**
 * Fireworks burst animation for championship / tournament win screens.
 *
 * Replaces the previous "rectangles dropping from the top" confetti pattern.
 * 4 burst centers spaced across the screen fire staggered over ~1.5s. Each
 * burst emits 18 radial particles that arc outward, curve under gravity,
 * and fade out. All on the UI thread (useNativeDriver: true).
 */
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const COLORS = [
  '#ffc220', // gold
  '#ff5e7e', // pink
  '#52d1ff', // sky blue
  '#7cf982', // bright green
  '#bc7bff', // purple
  '#ff9a3d', // orange
  '#ffffff', // white sparkle
];

const PARTICLES_PER_BURST = 18;

interface BurstCenter {
  x: number;
  y: number;
  delay: number;
  color: string;
  particles: Particle[];
}

interface Particle {
  tx: Animated.Value;
  ty: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  angle: number;
  distance: number;
}

function makeBurst(x: number, y: number, delay: number): BurstCenter {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLES_PER_BURST; i++) {
    const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2 + Math.random() * 0.3;
    const distance = 80 + Math.random() * 60;
    particles.push({
      tx: new Animated.Value(0),
      ty: new Animated.Value(0),
      scale: new Animated.Value(0.4),
      opacity: new Animated.Value(0),
      angle,
      distance,
    });
  }
  return { x, y, delay, color, particles };
}

export default function Fireworks() {
  const bursts = useRef<BurstCenter[]>([
    makeBurst(SCREEN_W * 0.25, SCREEN_H * 0.30, 0),
    makeBurst(SCREEN_W * 0.75, SCREEN_H * 0.35, 250),
    makeBurst(SCREEN_W * 0.50, SCREEN_H * 0.22, 500),
    makeBurst(SCREEN_W * 0.18, SCREEN_H * 0.45, 850),
    makeBurst(SCREEN_W * 0.82, SCREEN_H * 0.55, 1100),
  ]).current;

  useEffect(() => {
    bursts.forEach((burst) => {
      burst.particles.forEach((p) => {
        // Radial drift outward, with gravity arc pulling Y down over time.
        const dx = Math.cos(p.angle) * p.distance;
        const dy = Math.sin(p.angle) * p.distance;
        Animated.parallel([
          // Fast outward burst, then slow down.
          Animated.timing(p.tx, {
            toValue: dx,
            duration: 1200,
            delay: burst.delay,
            useNativeDriver: true,
          }),
          // Y mixes upward burst + downward gravity for a natural arc.
          Animated.sequence([
            Animated.timing(p.ty, {
              toValue: dy - 30, // initial upward kick
              duration: 600,
              delay: burst.delay,
              useNativeDriver: true,
            }),
            Animated.timing(p.ty, {
              toValue: dy + 90, // gravity pulls down past origin
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          // Pop-in scale to a sparkle, then shrink slightly as it falls.
          Animated.sequence([
            Animated.timing(p.scale, {
              toValue: 1.2,
              duration: 150,
              delay: burst.delay,
              useNativeDriver: true,
            }),
            Animated.timing(p.scale, {
              toValue: 0.5,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          // Opacity: fade in fast, hold, fade out at the end of arc.
          Animated.sequence([
            Animated.timing(p.opacity, {
              toValue: 1,
              duration: 80,
              delay: burst.delay,
              useNativeDriver: true,
            }),
            Animated.delay(800),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      });
    });
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((burst, bi) => (
        <View key={bi} style={{ position: 'absolute', left: burst.x, top: burst.y }}>
          {burst.particles.map((p, pi) => (
            <Animated.View
              key={pi}
              style={{
                position: 'absolute',
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: burst.color,
                opacity: p.opacity,
                shadowColor: burst.color,
                shadowOpacity: 0.95,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 0 },
                transform: [
                  { translateX: p.tx },
                  { translateY: p.ty },
                  { scale: p.scale },
                ],
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
