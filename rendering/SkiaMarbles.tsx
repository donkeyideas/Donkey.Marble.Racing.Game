/**
 * GPU-driven marble renderer — reads positions from Reanimated SharedValues.
 * Updates at full 60fps on the UI thread without any React re-renders.
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { Circle, Oval } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { MarbleData } from '../theme';

const SW = Dimensions.get('window').width;
const ENGINE_W = 400;
const SCALE = SW / ENGINE_W;
const MARBLE_R = 11 * SCALE;

interface SkiaMarbleProps {
  index: number;
  positions: SharedValue<number[]>;
  colorLight: string;
  colorDark: string;
}

/** Single marble — all position reads are SharedValue-derived (UI thread). */
function SkiaMarble({ index, positions, colorLight, colorDark }: SkiaMarbleProps) {
  const cx = useDerivedValue(() => (positions.value[index * 2] ?? 0) * SCALE);
  const cy = useDerivedValue(() => (positions.value[index * 2 + 1] ?? 0) * SCALE);
  const cyShadow = useDerivedValue(() => ((positions.value[index * 2 + 1] ?? 0) * SCALE) + 2);
  const shineX = useDerivedValue(() => ((positions.value[index * 2] ?? 0) * SCALE) - MARBLE_R * 0.3);
  const shineY = useDerivedValue(() => ((positions.value[index * 2 + 1] ?? 0) * SCALE) - MARBLE_R * 0.35);

  return (
    <>
      {/* Shadow */}
      <Circle cx={cx} cy={cyShadow} r={MARBLE_R} color="rgba(0,0,0,0.3)" />
      {/* Dark outer ring */}
      <Circle cx={cx} cy={cy} r={MARBLE_R} color={colorDark} />
      {/* Light inner */}
      <Circle cx={cx} cy={cy} r={MARBLE_R - 1} color={colorLight} />
      {/* Shine highlight */}
      <Oval x={shineX} y={shineY} width={8} height={5} color="rgba(255,255,255,0.5)" />
    </>
  );
}

interface SkiaMarblesProps {
  /** Marble metadata (colors, ids) — static, set once at race start */
  marbleData: MarbleData[];
  /** SharedValue flat array [x0, y0, x1, y1, ...] — updated every RAF frame */
  positions: SharedValue<number[]>;
}

/** Renders all 8 marbles using SharedValues — zero React re-renders. */
export default function SkiaMarbles({ marbleData, positions }: SkiaMarblesProps) {
  return (
    <>
      {marbleData.map((m, i) => (
        <SkiaMarble
          key={m.id}
          index={i}
          positions={positions}
          colorLight={m.colorLight}
          colorDark={m.colorDark}
        />
      ))}
    </>
  );
}
