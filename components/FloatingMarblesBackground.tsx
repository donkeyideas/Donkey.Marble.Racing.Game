import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated } from 'react-native';
import Matter from 'matter-js';
import { MARBLES } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MARBLE_R = 20;
const MARBLE_COUNT = MARBLES.length;

interface FloatingMarble {
  x: Animated.Value;
  y: Animated.Value;
  data: typeof MARBLES[0];
}

interface Props {
  /** Opacity for each marble — 0.35 on welcome screen, lower (e.g. 0.18) behind dense content. */
  opacity?: number;
}

export default function FloatingMarblesBackground({ opacity = 0.35 }: Props) {
  const marblesRef = useRef<FloatingMarble[]>(
    MARBLES.map((m) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      data: m,
    }))
  );
  const engineRef = useRef<Matter.Engine | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1 } });
    engine.timing.timeScale = 0.12;
    engineRef.current = engine;
    const world = engine.world;

    const wallOpts = { isStatic: true, restitution: 1.0, friction: 0 };
    const walls = [
      Matter.Bodies.rectangle(SCREEN_WIDTH / 2, -10, SCREEN_WIDTH, 20, wallOpts),
      Matter.Bodies.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT + 10, SCREEN_WIDTH, 20, wallOpts),
      Matter.Bodies.rectangle(-10, SCREEN_HEIGHT / 2, 20, SCREEN_HEIGHT, wallOpts),
      Matter.Bodies.rectangle(SCREEN_WIDTH + 10, SCREEN_HEIGHT / 2, 20, SCREEN_HEIGHT, wallOpts),
    ];
    Matter.Composite.add(world, walls);

    const bodies: Matter.Body[] = [];
    marblesRef.current.forEach((m, i) => {
      const startX = 30 + (i / (MARBLE_COUNT - 1)) * (SCREEN_WIDTH - 60);
      const startY = SCREEN_HEIGHT * 0.3 + Math.random() * SCREEN_HEIGHT * 0.4;
      const body = Matter.Bodies.circle(startX, startY, MARBLE_R, {
        restitution: 0.9,
        friction: 0.0001,
        frictionAir: 0.0005,
        density: 0.001,
      });
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 20,
        y: -(Math.random() * 15 + 5),
      });
      bodies.push(body);
      Matter.Composite.add(world, body);
    });

    const launchInterval = setInterval(() => {
      const idx = Math.floor(Math.random() * bodies.length);
      const body = bodies[idx];
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 18,
        y: -(Math.random() * 20 + 8),
      });
    }, 2000);

    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(t - last, 32);
      last = t;
      Matter.Engine.update(engine, dt);

      bodies.forEach((body, i) => {
        marblesRef.current[i].x.setValue(body.position.x - MARBLE_R);
        marblesRef.current[i].y.setValue(body.position.y - MARBLE_R);
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      clearInterval(launchInterval);
      cancelAnimationFrame(rafRef.current);
      Matter.Engine.clear(engine);
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {marblesRef.current.map((m) => (
        <Animated.View
          key={m.data.id}
          style={{
            position: 'absolute',
            left: m.x,
            top: m.y,
            width: MARBLE_R * 2,
            height: MARBLE_R * 2,
            borderRadius: MARBLE_R,
            backgroundColor: m.data.colorDark,
            opacity,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              width: MARBLE_R * 2 - 4,
              height: MARBLE_R * 2 - 4,
              borderRadius: MARBLE_R - 2,
              backgroundColor: m.data.colorLight,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 5,
              left: 7,
              width: 10,
              height: 6,
              borderRadius: 5,
              backgroundColor: 'rgba(255,255,255,0.4)',
              transform: [{ rotate: '-20deg' }],
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}
