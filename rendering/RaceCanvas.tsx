/**
 * Skia-based race canvas — replaces all View-based rendering with a single GPU canvas.
 * Static elements pre-recorded as SkPicture, dynamic elements as declarative Skia components.
 */
import React, { useMemo } from 'react';
import { Dimensions } from 'react-native';
import {
  Canvas, Circle, Rect, Line, Group, Image as SkiaImage,
  Picture, matchFont, Text as SkiaText, vec, Oval,
} from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { useSkiaThemeSprites, useSkiaBgImage, areSpritesReady } from './skiaSprites';
import { createStaticTrackPicture, TrackVisuals } from './staticTrackPicture';
import { PendulumState, BallPitBallState, SpeedBurstState } from '../engine/race';
import { MarbleData } from '../theme';

const { width: SW, height: SH } = Dimensions.get('window');
const ENGINE_W = 400;
const SCALE = SW / ENGINE_W;
function ex(v: number) { return v * SCALE; }

const MARBLE_R = ex(11);
const RAMP_H = Math.max(16, 14 * SCALE);
const WM_H = ex(8);

// Font for finish text and position numbers
let displayFont: any;
let bodyFont: any;
try {
  displayFont = matchFont({ fontFamily: 'LilitaOne_400Regular', fontSize: 18 });
  bodyFont = matchFont({ fontFamily: 'Fredoka_700Bold', fontSize: 15 });
} catch {
  // Fonts may not be available in all environments; drawing will skip text
  displayFont = null;
  bodyFont = null;
}

// Theme overlay colors
const THEME_OVERLAYS: Record<string, string | null> = {
  grass: null,
  lava:  'rgba(180, 40, 20, 0.15)',
  ice:   'rgba(100, 180, 255, 0.12)',
  cyber: 'rgba(120, 50, 180, 0.18)',
};

export interface RaceCanvasProps {
  trackVisuals: TrackVisuals;
  bgImage: string;
  totalHeight: number;
  engineW: number;
  useSprites: boolean;
  // Dynamic state
  cameraY: number;
  /** Optional SharedValue for camera — updates at full RAF rate without React re-renders */
  cameraShared?: SharedValue<number>;
  shakeX: number;
  shakeY: number;
  marbles: { data: MarbleData; x: number; y: number; finished: boolean }[];
  windmills: { x: number; y: number; angle: number; width: number }[];
  pendulums: PendulumState[];
  ballPitBalls: BallPitBallState[];
  cradles: PendulumState[];
  speedBursts: SpeedBurstState[];
  doomsdayBar: { y: number; active: boolean } | null;
  countdown: number;
}

export default function RaceCanvas(props: RaceCanvasProps) {
  const {
    trackVisuals: tv, bgImage, totalHeight, engineW, useSprites,
    cameraY, cameraShared, shakeX, shakeY,
    marbles, windmills, pendulums, ballPitBalls, cradles, speedBursts,
    doomsdayBar, countdown,
  } = props;

  const sprites = useSkiaThemeSprites(bgImage);
  const bgImg = useSkiaBgImage(bgImage);
  const themeOverlay = THEME_OVERLAYS[bgImage] || null;
  const totalScreenH = ex(totalHeight);
  const bgTileCount = Math.ceil(totalScreenH / SH) + 1;

  // Pre-record static track elements into a single Picture
  const staticPicture = useMemo(() => {
    if (useSprites && !areSpritesReady(sprites)) return null;
    return createStaticTrackPicture(
      tv, sprites, useSprites, RAMP_H, ex,
      SW, totalScreenH, engineW,
    );
  }, [tv, sprites, useSprites, totalScreenH, engineW]);

  // Viewport culling (uses prop cameraY for culling decisions)
  const vBuf = SH / SCALE * 0.7;
  const vMin = cameraY - vBuf;
  const vMax = cameraY + SH / SCALE + vBuf;
  const vis = (y: number) => y > vMin && y < vMax;

  // Camera transform — use SharedValue when available for smooth 60fps scrolling
  const camTransform = useDerivedValue(() => {
    const camVal = cameraShared ? cameraShared.value : cameraY;
    return [{ translateY: -camVal * SCALE }];
  }, [cameraShared, cameraY]);

  return (
    <Canvas style={{ width: SW, height: SH }}>
      <Group transform={[{ translateX: shakeX }, { translateY: shakeY }]}>
        <Group transform={camTransform}>

          {/* ===== BACKGROUND TILES ===== */}
          {bgImg && Array.from({ length: bgTileCount }).map((_, i) => (
            <SkiaImage
              key={`bg${i}`}
              image={bgImg}
              x={0} y={i * SH}
              width={SW} height={SH + 1}
              fit="cover"
            />
          ))}

          {/* ===== THEME OVERLAY ===== */}
          {themeOverlay && (
            <Rect x={0} y={0} width={SW} height={totalScreenH} color={themeOverlay} />
          )}

          {/* ===== STATIC TRACK ELEMENTS (single Picture draw) ===== */}
          {staticPicture && <Picture picture={staticPicture} />}

          {/* ===== FINISH TEXT ===== */}
          {displayFont && (
            <SkiaText
              x={SW / 2 - 40}
              y={tv.finishSY - ex(30)}
              text="FINISH"
              font={displayFont}
              color="#000"
            />
          )}

          {/* ===== POSITION NUMBERS ===== */}
          {bodyFont && Array.from({ length: 8 }).map((_, pi) => {
            const posColor = pi === 0 ? '#FFD700' : pi === 1 ? '#C0C0C0' : pi === 2 ? '#CD7F32' : '#FFFFFF';
            const py = tv.finishSY + tv.chanDepth - (pi + 1) * tv.slotH + tv.slotH * 0.5;
            return (
              <SkiaText
                key={`pos${pi}`}
                x={tv.chanEX + ex(12)}
                y={py}
                text={`${pi + 1}`}
                font={bodyFont}
                color={posColor}
              />
            );
          })}

          {/* ===== WINDMILLS ===== */}
          {windmills.map((w, i) => {
            if (!vis(w.y)) return null;
            const sw = ex(w.width);
            const wx = ex(w.x);
            const wy = ex(w.y);
            const angleDeg = w.angle * 180 / Math.PI;
            return (
              <React.Fragment key={`w${i}`}>
                {/* Blade */}
                {useSprites && sprites.windmill ? (
                  <Group transform={[{ translateX: wx }, { translateY: wy }, { rotate: w.angle }]}>
                    <SkiaImage
                      image={sprites.windmill}
                      x={-sw / 2} y={-WM_H / 2}
                      width={sw} height={WM_H}
                      fit="fill"
                    />
                  </Group>
                ) : (
                  <Group transform={[{ translateX: wx }, { translateY: wy }, { rotate: w.angle }]}>
                    <Rect
                      x={-sw / 2} y={-WM_H / 2}
                      width={sw} height={WM_H}
                      color="#c0392b"
                    />
                  </Group>
                )}
                {/* Center hub */}
                <Circle cx={wx} cy={wy} r={ex(6)} color="#555" />
              </React.Fragment>
            );
          })}

          {/* ===== BALL PIT BALLS ===== */}
          {ballPitBalls.map((b, i) => {
            if (!vis(b.y)) return null;
            return (
              <Circle
                key={`pb${i}`}
                cx={ex(b.x)} cy={ex(b.y)} r={ex(b.r)}
                color="#9b59b6"
              />
            );
          })}

          {/* ===== PENDULUM ROPES + BOBS ===== */}
          {pendulums.map((p, i) => {
            if (!vis(p.anchorY) && !vis(p.bobY)) return null;
            const ax = ex(p.anchorX), ay = ex(p.anchorY);
            const bx = ex(p.bobX), by = ex(p.bobY);
            const sr = ex(p.bobRadius);
            return (
              <React.Fragment key={`pen${i}`}>
                {/* Rope */}
                <Line p1={vec(ax, ay)} p2={vec(bx, by)} color="#7f8c8d" strokeWidth={2} />
                {/* Anchor */}
                <Circle cx={ax} cy={ay} r={ex(4)} color="#555" />
                {/* Bob */}
                <Circle cx={bx} cy={by} r={sr} color="#e74c3c" />
                {/* Bob shine */}
                <Oval
                  x={bx - sr * 0.3} y={by - sr * 0.4}
                  width={sr * 0.6} height={sr * 0.4}
                  color="rgba(255,255,255,0.35)"
                />
              </React.Fragment>
            );
          })}

          {/* ===== CRADLE ROPES + BOBS ===== */}
          {cradles.map((c, i) => {
            if (!vis(c.anchorY) && !vis(c.bobY)) return null;
            const ax = ex(c.anchorX), ay = ex(c.anchorY);
            const bx = ex(c.bobX), by = ex(c.bobY);
            const sr = ex(c.bobRadius);
            return (
              <React.Fragment key={`cr${i}`}>
                <Line p1={vec(ax, ay)} p2={vec(bx, by)} color="#95a5a6" strokeWidth={1.5} />
                <Circle cx={ax} cy={ay} r={ex(2)} color="#7f8c8d" />
                <Circle cx={bx} cy={by} r={sr} color="#bdc3c7" />
                <Oval
                  x={bx - sr * 0.25} y={by - sr * 0.35}
                  width={sr * 0.5} height={sr * 0.35}
                  color="rgba(255,255,255,0.5)"
                />
              </React.Fragment>
            );
          })}

          {/* ===== SPEED BURST PADS ===== */}
          {tv.speedBurstVis.map((sb, i) => {
            if (!vis(sb.ey)) return null;
            const isActive = speedBursts[i]?.active || false;
            const color = isActive ? '#ffaa00' : '#ffc220';
            return (
              <React.Fragment key={`sb${i}`}>
                <Rect
                  x={sb.left} y={sb.top}
                  width={sb.width} height={sb.height}
                  color={color}
                />
                {/* Arrow indicators */}
                {useSprites && sprites.speedburst ? (
                  [0, 1, 2].map(ci => (
                    <SkiaImage
                      key={ci}
                      image={sprites.speedburst!}
                      x={sb.left + 4 + ci * (sb.width - 8) / 3}
                      y={sb.top + 2}
                      width={sb.height - 4}
                      height={sb.height - 4}
                      fit="contain"
                      opacity={isActive ? 1 : 0.8}
                    />
                  ))
                ) : null}
              </React.Fragment>
            );
          })}

          {/* ===== GATE ===== */}
          {countdown > 0 && (
            <Rect
              x={ex(10)} y={ex(230) - 4}
              width={ex(engineW - 20)} height={8}
              color="#e74c3c"
            />
          )}

          {/* ===== MARBLES ===== */}
          {marbles.map(m => {
            const cx = ex(m.x);
            const cy = ex(m.y);
            return (
              <React.Fragment key={m.data.id}>
                {/* Shadow */}
                <Circle cx={cx} cy={cy + 2} r={MARBLE_R} color="rgba(0,0,0,0.3)" />
                {/* Dark outer ring */}
                <Circle cx={cx} cy={cy} r={MARBLE_R} color={m.data.colorDark} />
                {/* Light inner */}
                <Circle cx={cx} cy={cy} r={MARBLE_R - 1} color={m.data.colorLight} />
                {/* Shine highlight */}
                <Oval
                  x={cx - MARBLE_R * 0.3}
                  y={cy - MARBLE_R * 0.35}
                  width={8} height={5}
                  color="rgba(255,255,255,0.5)"
                />
              </React.Fragment>
            );
          })}

          {/* ===== DOOMSDAY BAR ===== */}
          {doomsdayBar && doomsdayBar.active && (
            <React.Fragment>
              <Rect
                x={0} y={ex(doomsdayBar.y) - ex(10)}
                width={SW} height={ex(20)}
                color="rgba(204,0,0,0.9)"
              />
              {/* Striped overlay */}
              {Array.from({ length: 20 }).map((_, i) => i % 2 === 0 ? (
                <Rect
                  key={`ds${i}`}
                  x={i * ex(20)} y={ex(doomsdayBar.y) - ex(10)}
                  width={ex(20)} height={ex(20)}
                  color="rgba(255,200,0,0.4)"
                />
              ) : null)}
            </React.Fragment>
          )}
        </Group>
      </Group>
    </Canvas>
  );
}
