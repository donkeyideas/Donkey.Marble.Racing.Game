/**
 * Skia-based race canvas — replaces all View-based rendering with a single GPU canvas.
 * Static elements pre-recorded as SkPicture, dynamic elements as declarative Skia components.
 */
import React, { useMemo } from 'react';
import { Dimensions } from 'react-native';
import {
  Canvas, Circle, Rect, Line, Group, Image as SkiaImage,
  Picture, useFont, Text as SkiaText, vec, Oval,
} from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { useSkiaThemeSprites, useSkiaBgImage, areSpritesReady } from './skiaSprites';
import { createStaticTrackPicture, TrackVisuals, ThemeElementColors } from './staticTrackPicture';
import { getBgTheme, hasLegacyBg } from '../data/bgThemes';
import { THEME_OVERLAYS } from '../assets/kenney/spriteMap';
import { PendulumState, BallPitBallState, SpeedBurstState } from '../engine/race';
import { MarbleData } from '../theme';
import SkiaMarbles from './SkiaMarbles';
import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka';

const { width: SW, height: SH } = Dimensions.get('window');
const ENGINE_W = 400;
const SCALE = SW / ENGINE_W;
function ex(v: number) { return v * SCALE; }

const MARBLE_R = ex(11);
const RAMP_H = Math.max(16, 14 * SCALE);
const WM_H = ex(8);

// Font sources — loaded via useFont() inside the component below.
// matchFont() doesn't work for custom fonts on Android (only system fonts), which is why
// the slot numbers and FINISH text were invisible despite the code being present.
const DISPLAY_FONT_SRC = LilitaOne_400Regular;
const BODY_FONT_SRC = Fredoka_700Bold;

/** Static positions for animated elements — captured once at race start so
 *  RaceCanvas can mount these components and rely on SharedValues for animation. */
export interface RaceStaticConfig {
  windmills: { x: number; y: number; width: number }[];
  pendulums: { anchorX: number; anchorY: number; bobRadius: number }[];
  cradles: { anchorX: number; anchorY: number; bobRadius: number }[];
  ballPitRadii: number[];
  trampolines: { x: number; y: number; width: number }[];
  speedBursts: { x: number; y: number; width: number; direction: 'left' | 'right' | 'down' }[];
}

/** Shared-value bundle for every per-frame animated value. */
export interface RaceCanvasShared {
  cameraY: SharedValue<number>;
  marblePositions: SharedValue<number[]>;
  windmillAngles: SharedValue<number[]>;
  pendulumBobs: SharedValue<number[]>;
  cradleBobs: SharedValue<number[]>;
  ballPitPositions: SharedValue<number[]>;
  speedBurstActive: SharedValue<number[]>;
  doomsdayBarY: SharedValue<number>;
  doomsdayBarActive: SharedValue<number>;
}

export interface RaceCanvasProps {
  trackVisuals: TrackVisuals;
  bgImage: string;
  totalHeight: number;
  engineW: number;
  /** New unified static config — when provided, RaceCanvas renders animated
   *  elements from SharedValues instead of from the React-prop arrays. */
  staticConfig?: RaceStaticConfig;
  raceShared?: RaceCanvasShared;
  useSprites: boolean;
  // Dynamic state
  cameraY: number;
  /** Optional SharedValue for camera — updates at full RAF rate without React re-renders */
  cameraShared?: SharedValue<number>;
  shakeX: number;
  shakeY: number;
  marbles: { data: MarbleData; x: number; y: number; finished: boolean }[];
  /** Static marble metadata (colors, ids) — set once at engine creation */
  marbleData?: MarbleData[];
  /** SharedValue flat array [x0, y0, ...] for 60fps marble rendering */
  marblePositions?: SharedValue<number[]>;
  windmills: { x: number; y: number; angle: number; width: number }[];
  pendulums: PendulumState[];
  ballPitBalls: BallPitBallState[];
  cradles: PendulumState[];
  speedBursts: SpeedBurstState[];
  doomsdayBar: { y: number; active: boolean } | null;
  countdown: number;
}

function RaceCanvasInner(props: RaceCanvasProps) {
  const {
    trackVisuals: tv, bgImage, totalHeight, engineW, useSprites,
    cameraY, cameraShared, shakeX, shakeY,
    marbles, marbleData, marblePositions,
    windmills, pendulums, ballPitBalls, cradles, speedBursts,
    doomsdayBar, countdown,
    staticConfig, raceShared,
  } = props;
  // When the new static config + SharedValue path is supplied, the legacy
  // React-prop rendering is skipped entirely. This is the FPS-critical path.
  const useSharedValuePath = !!(staticConfig && raceShared);

  const sprites = useSkiaThemeSprites(bgImage);
  const bgImg = useSkiaBgImage(bgImage);
  const themeOverlay = THEME_OVERLAYS[bgImage] || null;
  const totalScreenH = ex(totalHeight);
  const bgTileCount = Math.ceil(totalScreenH / SH) + 1;

  // Load custom Skia fonts for finish-line text and position numbers.
  // useFont returns null while loading on first render; the gated renders below
  // skip text until the font is ready.
  const displayFont = useFont(DISPLAY_FONT_SRC, 18);
  const bodyFont = useFont(BODY_FONT_SRC, 16);

  // Theme-aware element colors for track contrast
  const themeElementColors = useMemo(() => getBgTheme(bgImage).elements, [bgImage]);

  // Pre-record static track elements into a single Picture
  const staticPicture = useMemo(() => {
    if (useSprites && !areSpritesReady(sprites)) return null;
    return createStaticTrackPicture(
      tv, sprites, useSprites, RAMP_H, ex,
      SW, totalScreenH, engineW, themeElementColors,
    );
  }, [tv, sprites, useSprites, totalScreenH, engineW, themeElementColors]);

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

          {/* ===== BACKGROUND ===== */}
          {hasLegacyBg(bgImage) && bgImg ? (
            // Legacy themes: tile PNG background images
            Array.from({ length: bgTileCount }).map((_, i) => (
              <SkiaImage
                key={`bg${i}`}
                image={bgImg}
                x={0} y={i * SH}
                width={SW} height={SH + 1}
                fit="cover"
              />
            ))
          ) : (
            // New themes: gradient background
            <>
              <Rect x={0} y={0} width={SW} height={totalScreenH} color={getBgTheme(bgImage).gradient[0]} />
              {/* Gradient effect via layered semi-transparent rects */}
              {Array.from({ length: 10 }).map((_, i) => {
                const t = i / 9;
                const segH = totalScreenH / 10;
                const { gradient } = getBgTheme(bgImage);
                // Interpolate between gradient[0] and gradient[1]
                const r0 = parseInt(gradient[0].slice(1, 3), 16);
                const g0 = parseInt(gradient[0].slice(3, 5), 16);
                const b0 = parseInt(gradient[0].slice(5, 7), 16);
                const r1 = parseInt(gradient[1].slice(1, 3), 16);
                const g1 = parseInt(gradient[1].slice(3, 5), 16);
                const b1 = parseInt(gradient[1].slice(5, 7), 16);
                const r = Math.round(r0 + (r1 - r0) * t);
                const g = Math.round(g0 + (g1 - g0) * t);
                const b = Math.round(b0 + (b1 - b0) * t);
                return (
                  <Rect
                    key={`gbg${i}`}
                    x={0} y={i * segH}
                    width={SW} height={segH + 1}
                    color={`rgb(${r},${g},${b})`}
                  />
                );
              })}
            </>
          )}

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

          {/* ===== WINDMILLS — SharedValue path ===== */}
          {useSharedValuePath && staticConfig!.windmills.map((w, i) => (
            <SkiaWindmill
              key={`wsv${i}`}
              index={i}
              x={ex(w.x)} y={ex(w.y)} widthPx={ex(w.width)}
              angles={raceShared!.windmillAngles}
              sprite={useSprites ? sprites.windmill : null}
            />
          ))}
          {/* ===== WINDMILLS — legacy React-prop fallback ===== */}
          {!useSharedValuePath && windmills.map((w, i) => {
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

          {/* ===== BALL PIT — SharedValue path ===== */}
          {useSharedValuePath && staticConfig!.ballPitRadii.map((r, i) => (
            <SkiaBallPitBall
              key={`bpsv${i}`}
              index={i}
              radiusPx={ex(r)}
              positions={raceShared!.ballPitPositions}
            />
          ))}
          {/* ===== BALL PIT — legacy ===== */}
          {!useSharedValuePath && ballPitBalls.map((b, i) => {
            if (!vis(b.y)) return null;
            return (
              <Circle
                key={`pb${i}`}
                cx={ex(b.x)} cy={ex(b.y)} r={ex(b.r)}
                color="#9b59b6"
              />
            );
          })}

          {/* ===== PENDULUMS — SharedValue path ===== */}
          {useSharedValuePath && staticConfig!.pendulums.map((p, i) => (
            <SkiaPendulum
              key={`pensv${i}`}
              index={i}
              anchorX={ex(p.anchorX)} anchorY={ex(p.anchorY)}
              bobRadiusPx={ex(p.bobRadius)}
              bobs={raceShared!.pendulumBobs}
              ropeColor="#7f8c8d"
              bobColor="#e74c3c"
            />
          ))}
          {/* ===== PENDULUMS — legacy ===== */}
          {!useSharedValuePath && pendulums.map((p, i) => {
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

          {/* ===== CRADLES — SharedValue path ===== */}
          {useSharedValuePath && staticConfig!.cradles.map((c, i) => (
            <SkiaPendulum
              key={`crsv${i}`}
              index={i}
              anchorX={ex(c.anchorX)} anchorY={ex(c.anchorY)}
              bobRadiusPx={ex(c.bobRadius)}
              bobs={raceShared!.cradleBobs}
              ropeColor="#95a5a6"
              bobColor="#bdc3c7"
              anchorRadiusPx={ex(2)}
              ropeStrokeWidth={1.5}
            />
          ))}
          {/* ===== CRADLES — legacy ===== */}
          {!useSharedValuePath && cradles.map((c, i) => {
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

          {/* ===== SPEED BURSTS — SharedValue path ===== */}
          {useSharedValuePath && tv.speedBurstVis.map((sb, i) => (
            <SkiaSpeedBurst
              key={`sbsv${i}`}
              index={i}
              left={sb.left} top={sb.top} width={sb.width} height={sb.height}
              activeFlags={raceShared!.speedBurstActive}
              arrowSprite={useSprites ? sprites.speedburst : null}
            />
          ))}
          {/* ===== SPEED BURSTS — legacy ===== */}
          {!useSharedValuePath && tv.speedBurstVis.map((sb, i) => {
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

          {/* ===== MARBLES (SharedValue-driven, 60fps on UI thread) ===== */}
          {marbleData && marbleData.length > 0 && marblePositions ? (
            <SkiaMarbles marbleData={marbleData} positions={marblePositions} />
          ) : (
            // Fallback: React-prop marbles (used if SharedValues not provided)
            marbles.map(m => {
              const cx = ex(m.x);
              const cy = ex(m.y);
              return (
                <React.Fragment key={m.data.id}>
                  <Circle cx={cx} cy={cy + 2} r={MARBLE_R} color="rgba(0,0,0,0.3)" />
                  <Circle cx={cx} cy={cy} r={MARBLE_R} color={m.data.colorDark} />
                  <Circle cx={cx} cy={cy} r={MARBLE_R - 1} color={m.data.colorLight} />
                  <Oval
                    x={cx - MARBLE_R * 0.3}
                    y={cy - MARBLE_R * 0.35}
                    width={8} height={5}
                    color="rgba(255,255,255,0.5)"
                  />
                </React.Fragment>
              );
            })
          )}

          {/* ===== DOOMSDAY BAR — SharedValue path ===== */}
          {useSharedValuePath && (
            <SkiaDoomsdayBar
              barY={raceShared!.doomsdayBarY}
              active={raceShared!.doomsdayBarActive}
              screenW={SW}
            />
          )}
          {/* ===== DOOMSDAY BAR — legacy ===== */}
          {!useSharedValuePath && doomsdayBar && doomsdayBar.active && (
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

// ─────────────────────────────────────────────────────────────────────────────
// SharedValue-driven Skia subcomponents.
//
// Each one is mounted ONCE with stable static-position props. The animated
// values (angles, bob positions, etc.) come from SharedValues so updates run on
// the UI thread without triggering any React re-render. This is what frees up
// the JS thread for HUD logic and lets the canvas hit a consistent 60fps.
// ─────────────────────────────────────────────────────────────────────────────

const SkiaWindmill = React.memo(function SkiaWindmill({
  index, x, y, widthPx, angles, sprite,
}: {
  index: number; x: number; y: number; widthPx: number;
  angles: SharedValue<number[]>;
  sprite: any | null;
}) {
  const transform = useDerivedValue(() => [
    { translateX: x }, { translateY: y }, { rotate: angles.value[index] ?? 0 },
  ]);
  return (
    <>
      <Group transform={transform}>
        {sprite ? (
          <SkiaImage image={sprite} x={-widthPx / 2} y={-WM_H / 2} width={widthPx} height={WM_H} fit="fill" />
        ) : (
          <Rect x={-widthPx / 2} y={-WM_H / 2} width={widthPx} height={WM_H} color="#c0392b" />
        )}
      </Group>
      <Circle cx={x} cy={y} r={ex(6)} color="#555" />
    </>
  );
});

const SkiaBallPitBall = React.memo(function SkiaBallPitBall({
  index, radiusPx, positions,
}: {
  index: number; radiusPx: number; positions: SharedValue<number[]>;
}) {
  const cx = useDerivedValue(() => (positions.value[index * 2] ?? 0) * SCALE);
  const cy = useDerivedValue(() => (positions.value[index * 2 + 1] ?? 0) * SCALE);
  return <Circle cx={cx} cy={cy} r={radiusPx} color="#9b59b6" />;
});

const SkiaPendulum = React.memo(function SkiaPendulum({
  index, anchorX, anchorY, bobRadiusPx, bobs, ropeColor, bobColor,
  anchorRadiusPx, ropeStrokeWidth,
}: {
  index: number;
  anchorX: number; anchorY: number; bobRadiusPx: number;
  bobs: SharedValue<number[]>;
  ropeColor: string; bobColor: string;
  anchorRadiusPx?: number; ropeStrokeWidth?: number;
}) {
  const bobX = useDerivedValue(() => (bobs.value[index * 2] ?? 0) * SCALE);
  const bobY = useDerivedValue(() => (bobs.value[index * 2 + 1] ?? 0) * SCALE);
  // Reanimated treats vec(x,y) as a derived value when its args are derived.
  const p2 = useDerivedValue(() => vec(bobX.value, bobY.value));
  const shineX = useDerivedValue(() => bobX.value - bobRadiusPx * 0.3);
  const shineY = useDerivedValue(() => bobY.value - bobRadiusPx * 0.4);
  return (
    <>
      <Line p1={vec(anchorX, anchorY)} p2={p2} color={ropeColor} strokeWidth={ropeStrokeWidth ?? 2} />
      <Circle cx={anchorX} cy={anchorY} r={anchorRadiusPx ?? ex(4)} color="#555" />
      <Circle cx={bobX} cy={bobY} r={bobRadiusPx} color={bobColor} />
      <Oval x={shineX} y={shineY} width={bobRadiusPx * 0.6} height={bobRadiusPx * 0.4} color="rgba(255,255,255,0.35)" />
    </>
  );
});

const SkiaSpeedBurst = React.memo(function SkiaSpeedBurst({
  index, left, top, width, height, activeFlags, arrowSprite,
}: {
  index: number; left: number; top: number; width: number; height: number;
  activeFlags: SharedValue<number[]>;
  arrowSprite: any | null;
}) {
  const color = useDerivedValue(() => (activeFlags.value[index] ? '#ffaa00' : '#ffc220'));
  const arrowOpacity = useDerivedValue(() => (activeFlags.value[index] ? 1 : 0.8));
  return (
    <>
      <Rect x={left} y={top} width={width} height={height} color={color} />
      {arrowSprite && [0, 1, 2].map(ci => (
        <SkiaImage
          key={ci}
          image={arrowSprite}
          x={left + 4 + ci * (width - 8) / 3}
          y={top + 2}
          width={height - 4}
          height={height - 4}
          fit="contain"
          opacity={arrowOpacity}
        />
      ))}
    </>
  );
});

const SkiaDoomsdayBar = React.memo(function SkiaDoomsdayBar({
  barY, active, screenW,
}: {
  barY: SharedValue<number>; active: SharedValue<number>; screenW: number;
}) {
  const y = useDerivedValue(() => barY.value * SCALE - ex(10));
  const opacity = useDerivedValue(() => (active.value ? 1 : 0));
  return (
    <Group opacity={opacity}>
      <Rect x={0} y={y} width={screenW} height={ex(20)} color="rgba(204,0,0,0.9)" />
      {Array.from({ length: 20 }).map((_, i) => i % 2 === 0 ? (
        <Rect key={`ds${i}`} x={i * ex(20)} y={y} width={ex(20)} height={ex(20)} color="rgba(255,200,0,0.4)" />
      ) : null)}
    </Group>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Custom React.memo comparator.
//
// When using the SharedValue path (raceShared + staticConfig provided),
// per-frame array props (`marbles`, `windmills`, etc.) are *unused* by the
// rendering — the canvas reads everything from SharedValues. So changes to
// those props should NOT trigger re-renders. Only stable structural props
// matter: bgImage, useSprites, countdown, trackVisuals, staticConfig ref,
// raceShared ref, marbleData ref. This is what unlocks 60fps GPU rendering.
// ─────────────────────────────────────────────────────────────────────────────
function raceCanvasPropsEqual(prev: RaceCanvasProps, next: RaceCanvasProps): boolean {
  // If either side isn't using the SharedValue path, fall back to shallow compare
  // (default React.memo behavior) — every prop change still re-renders.
  if (!prev.raceShared || !next.raceShared) {
    // Shallow compare all props
    const keys = Object.keys(next) as (keyof RaceCanvasProps)[];
    for (const k of keys) if (prev[k] !== next[k]) return false;
    return true;
  }
  // SharedValue path: only re-render when *structural* props change.
  return (
    prev.bgImage === next.bgImage
    && prev.useSprites === next.useSprites
    && prev.countdown === next.countdown
    && prev.trackVisuals === next.trackVisuals
    && prev.staticConfig === next.staticConfig
    && prev.raceShared === next.raceShared
    && prev.marbleData === next.marbleData
    && prev.totalHeight === next.totalHeight
    && prev.engineW === next.engineW
  );
}

const RaceCanvas = React.memo(RaceCanvasInner, raceCanvasPropsEqual);
export default RaceCanvas;
