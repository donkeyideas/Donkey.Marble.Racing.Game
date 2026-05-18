import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, MarbleData, MARBLES } from '../theme';
import { getSkinnedMarble } from '../data/skins';
import { useGameStore } from '../state/gameStore';
import { createRaceEngine, RaceState, PendulumState, BallPitBallState, TrampolineState, SpeedBurstState } from '../engine/race';
import { triggerRaceHaptic, raceHaptics, HapticType } from '../utils/haptics';
import { buildTrack, TrackConfig } from '../engine/tracks';
import { ALL_COURSES as COURSES } from '../data/courses';
import { getBgSprite, getThemeSprites, ThemeSprites, THEME_OVERLAYS } from '../assets/kenney/spriteMap';
import RaceCanvas from '../rendering/RaceCanvas';
import { useRaceSharedState } from '../rendering/raceSharedState';
import { preloadRaceSounds, unloadRaceSounds, playSound } from '../utils/audioManager';
import { getConfig, fetchRemoteConfig } from '../lib/remoteConfig';

/** Toggle to fall back to solid-color View rendering (pre-sprite) */
const USE_SPRITE_RENDERING = true;

/** Toggle Skia Canvas rendering (GPU-accelerated, single canvas) */
const USE_SKIA_CANVAS = true;

const { width: SW, height: SH } = Dimensions.get('window');
const ENGINE_W = 400;
const SCALE = SW / ENGINE_W;
function ex(v: number) { return v * SCALE; }

const MARBLE_R = ex(11);
const RAMP_H = Math.max(16, 14 * SCALE);
const WM_H = ex(8);

// Compute all visual data from a TrackConfig
interface SegVis { left: number; top: number; width: number; deg: number; ey: number }

function computeTrackVisuals(track: TrackConfig) {
  const segs: SegVis[] = [];
  // Smooth path representation of each ramp in SCREEN space. The renderer
  // strokes these as continuous Skia paths so tight S-curves (Grand Prix
  // tracks have 120+ segments) don't show as a string of jagged rotated
  // rectangles. The per-segment `segs` array is still kept for hand-crafted
  // tracks with short discrete ramps where rectangles look fine.
  const rampPaths: { x: number; y: number }[][] = [];
  track.ramps.forEach(ramp => {
    const screenPts = ramp.points.map(p => ({ x: ex(p.x), y: ex(p.y) }));
    rampPaths.push(screenPts);
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j], b = ramp.points[j + 1];
      const sx1 = ex(a.x), sy1 = ex(a.y), sx2 = ex(b.x), sy2 = ex(b.y);
      const dx = sx2 - sx1, dy = sy2 - sy1;
      const len = Math.sqrt(dx * dx + dy * dy);
      segs.push({
        left: (sx1 + sx2) / 2 - (len + 2) / 2,
        top: (sy1 + sy2) / 2 - RAMP_H / 2,
        width: len + 2,
        deg: Math.atan2(dy, dx) * 180 / Math.PI,
        ey: (a.y + b.y) / 2,
      });
    }
  });

  const obsVis = track.obstacles.map(o => ({
    cx: ex(o.x), cy: ex(o.y), size: ex(o.r) * 2, type: o.type as string, ey: o.y,
  }));

  const pegFunnels = track.funnels.map(f => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1;
    const rdx = f.rightX2 - f.rightX1;
    return {
      left: {
        x: ex((f.leftX1 + f.leftX2) / 2), y: ex((f.y1 + f.y2) / 2),
        w: ex(Math.sqrt(ldx ** 2 + dy ** 2)),
        deg: Math.atan2(dy, ldx) * 180 / Math.PI,
      },
      right: {
        x: ex((f.rightX1 + f.rightX2) / 2), y: ex((f.y1 + f.y2) / 2),
        w: ex(Math.sqrt(rdx ** 2 + dy ** 2)),
        deg: Math.atan2(dy, rdx) * 180 / Math.PI,
      },
      ey: (f.y1 + f.y2) / 2,
    };
  });

  const springVis = track.springs.map(sp => ({
    left: ex(sp.x) - ex(sp.w) / 2,
    top: ex(sp.y) - ex(sp.h) / 2,
    width: ex(sp.w),
    height: ex(sp.h),
    ey: sp.y,
  }));

  const finishSY = ex(track.finishY);
  const ff = track.finishFunnel;
  const ffDY = ff.y2 - ff.y1;
  const ffLeft = {
    x: ex((ff.leftX1 + ff.leftX2) / 2), y: ex((ff.y1 + ff.y2) / 2),
    w: ex(Math.sqrt((ff.leftX2 - ff.leftX1) ** 2 + ffDY ** 2)),
    deg: Math.atan2(ffDY, ff.leftX2 - ff.leftX1) * 180 / Math.PI,
  };
  const ffRight = {
    x: ex((ff.rightX1 + ff.rightX2) / 2), y: ex((ff.y1 + ff.y2) / 2),
    w: ex(Math.sqrt((ff.rightX2 - ff.rightX1) ** 2 + ffDY ** 2)),
    deg: Math.atan2(ffDY, ff.rightX2 - ff.rightX1) * 180 / Math.PI,
  };
  const chanSX = ex(track.channelLeft);
  const chanEX = ex(track.channelRight);
  const miniH = track.miniFunnelH;
  const funnelExitLeft = ff.leftX2;
  const funnelExitRight = ff.rightX2;
  // Left mini-funnel bar: from funnel exit left → channel left
  const mfLeftDx = track.channelLeft - funnelExitLeft;
  const mfLeft = {
    x: ex((funnelExitLeft + track.channelLeft) / 2),
    y: ex(track.finishY + miniH / 2),
    w: ex(Math.sqrt(mfLeftDx ** 2 + miniH ** 2)),
    deg: Math.atan2(miniH, mfLeftDx) * 180 / Math.PI,
  };
  // Right mini-funnel bar: from funnel exit right → channel right
  const mfRightDx = track.channelRight - funnelExitRight;
  const mfRight = {
    x: ex((funnelExitRight + track.channelRight) / 2),
    y: ex(track.finishY + miniH / 2),
    w: ex(Math.sqrt(mfRightDx ** 2 + miniH ** 2)),
    deg: Math.atan2(miniH, mfRightDx) * 180 / Math.PI,
  };
  const miniFunnelSH = ex(miniH);

  // Trampoline static positions
  const trampolineVis = (track.trampolines || []).map(t => ({
    left: ex(t.x) - ex(t.width) / 2,
    top: ex(t.y) - ex(5),
    width: ex(t.width),
    height: ex(10),
    ey: t.y,
  }));

  const speedBurstVis = (track.speedBursts || []).map(sb => ({
    left: ex(sb.x) - ex(sb.width) / 2,
    top: ex(sb.y) - ex(10),
    width: ex(sb.width),
    height: ex(20),
    ey: sb.y,
    direction: sb.direction,
  }));

  return {
    segs, rampPaths, obsVis, pegFunnels, springVis,
    finishSY, ffLeft, ffRight,
    mfLeft, mfRight, miniFunnelSH,
    chanSX, chanEX,
    chanW: chanEX - chanSX,
    chanDepth: ex(track.channelDepth),
    slotH: ex(26),
    trampolineVis,
    speedBurstVis,
    wallColor: track.wallColor,
  };
}

// Static track elements — rendered once, never re-rendered during race
// React.memo prevents React from diffing 100+ unchanged elements every frame
const StaticTrackElements = React.memo(function StaticTrackElements({
  tv, themeSprites, finishTextColor, finishShadowColor,
}: {
  tv: ReturnType<typeof computeTrackVisuals>;
  themeSprites: ThemeSprites;
  finishTextColor?: string;
  finishShadowColor?: string;
}) {
  return (
    <>
      {/* Ramp segments */}
      {tv.segs.map((s, i) => {
        if (tv.wallColor) {
          // Solid color wall — no border, thicker for seamless overlap
          return (
            <View key={`s${i}`} style={{
              position: 'absolute', left: s.left - 6, top: s.top - 2,
              width: s.width + 12, height: RAMP_H + 6,
              backgroundColor: tv.wallColor, borderRadius: 3, zIndex: 2,
              transform: [{ rotate: `${s.deg}deg` }],
            }} />
          );
        }
        return USE_SPRITE_RENDERING ? (
          <Image key={`s${i}`} source={themeSprites.ramp} resizeMode="stretch" style={{
            position: 'absolute', left: s.left - 6, top: s.top - 1,
            width: s.width + 12, height: RAMP_H + 2, zIndex: 2,
            transform: [{ rotate: `${s.deg}deg` }],
          }} />
        ) : (
          <View key={`s${i}`} style={{
            position: 'absolute', left: s.left - 6, top: s.top - 1,
            width: s.width + 12, height: RAMP_H + 2,
            backgroundColor: '#8B5E3C', borderWidth: 1.5, borderColor: '#6B4226',
            borderRadius: 2, zIndex: 2, transform: [{ rotate: `${s.deg}deg` }],
          }} />
        );
      })}

      {/* Peg zone funnels */}
      {tv.pegFunnels.map((pf, i) => (
        <React.Fragment key={`pf${i}`}>
          {USE_SPRITE_RENDERING ? (
            <>
              <Image source={themeSprites.funnel} resizeMode="stretch" style={{
                position: 'absolute', left: pf.left.x - pf.left.w / 2, top: pf.left.y - ex(6),
                width: pf.left.w, height: ex(12),
                transform: [{ rotate: `${pf.left.deg}deg` }], zIndex: 4,
              }} />
              <Image source={themeSprites.funnel} resizeMode="stretch" style={{
                position: 'absolute', left: pf.right.x - pf.right.w / 2, top: pf.right.y - ex(6),
                width: pf.right.w, height: ex(12),
                transform: [{ rotate: `${pf.right.deg}deg` }], zIndex: 4,
              }} />
            </>
          ) : (
            <>
              <View style={{
                position: 'absolute', left: pf.left.x - pf.left.w / 2, top: pf.left.y - ex(6),
                width: pf.left.w, height: ex(12),
                backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
                transform: [{ rotate: `${pf.left.deg}deg` }], zIndex: 4,
              }} />
              <View style={{
                position: 'absolute', left: pf.right.x - pf.right.w / 2, top: pf.right.y - ex(6),
                width: pf.right.w, height: ex(12),
                backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
                transform: [{ rotate: `${pf.right.deg}deg` }], zIndex: 4,
              }} />
            </>
          )}
        </React.Fragment>
      ))}

      {/* Bumpers & pegs */}
      {tv.obsVis.map((o, i) => {
        const isBumper = o.type === 'bumper';
        return USE_SPRITE_RENDERING ? (
          <View key={`o${i}`} style={{
            position: 'absolute', left: o.cx - o.size / 2 - 1, top: o.cy - o.size / 2 - 1,
            width: o.size + 2, height: o.size + 2, borderRadius: (o.size + 2) / 2,
            backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 5,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Image source={isBumper ? themeSprites.bumper : themeSprites.peg}
              resizeMode="contain" style={{
              width: o.size, height: o.size,
            }} />
          </View>
        ) : (
          <View key={`o${i}`} style={{
            position: 'absolute', left: o.cx - o.size / 2, top: o.cy - o.size / 2,
            width: o.size, height: o.size, borderRadius: o.size / 2,
            backgroundColor: isBumper ? '#e74c3c' : '#7f8c8d',
            borderWidth: isBumper ? 2 : 1.5, borderColor: isBumper ? '#c0392b' : '#5a6a6a',
            zIndex: 5,
          }}>
            {isBumper && (
              <View style={{
                position: 'absolute', top: 2, left: 3,
                width: o.size * 0.4, height: o.size * 0.25, borderRadius: o.size * 0.15,
                backgroundColor: 'rgba(255,255,255,0.3)', transform: [{ rotate: '-20deg' }],
              }} />
            )}
          </View>
        );
      })}

      {/* Springs */}
      {tv.springVis.map((sp, i) => USE_SPRITE_RENDERING ? (
        <Image key={`sp${i}`} source={themeSprites.spring} resizeMode="contain" style={{
          position: 'absolute', left: sp.left, top: sp.top,
          width: sp.width, height: sp.height, zIndex: 6,
        }} />
      ) : (
        <View key={`sp${i}`} style={{
          position: 'absolute', left: sp.left, top: sp.top,
          width: sp.width, height: sp.height,
          backgroundColor: '#2ecc71', borderRadius: 3,
          borderWidth: 1.5, borderColor: '#27ae60', zIndex: 6,
        }} />
      ))}

      {/* Trampolines */}
      {tv.trampolineVis.map((t, i) => USE_SPRITE_RENDERING ? (
        <Image key={`tr${i}`} source={themeSprites.trampoline} resizeMode="stretch" style={{
          position: 'absolute', left: t.left, top: t.top,
          width: t.width, height: t.height, zIndex: 6,
        }} />
      ) : (
        <View key={`tr${i}`} style={{
          position: 'absolute', left: t.left, top: t.top,
          width: t.width, height: t.height,
          backgroundColor: '#e67e22', borderRadius: 4,
          borderWidth: 2, borderColor: '#d35400', zIndex: 6,
        }}>
          <View style={{
            position: 'absolute', top: 2, left: 4, right: 4,
            height: 2, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 1,
          }} />
          <View style={{
            position: 'absolute', bottom: 2, left: 4, right: 4,
            height: 2, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 1,
          }} />
        </View>
      ))}

      {/* Finish zone — sits ABOVE the checker strip (which starts at
          finishSY-22). Color adapts to the track's theme so the label
          stays readable on both dark and light backgrounds. */}
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: tv.finishSY - ex(60),
        fontFamily: Fonts.display, fontSize: 22,
        color: finishTextColor ?? '#ffffff',
        letterSpacing: 4, textAlign: 'center', zIndex: 12,
        textShadowColor: finishShadowColor ?? 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}>FINISH</Text>
      <View style={{
        position: 'absolute', left: ex(10), top: tv.finishSY - ex(22),
        width: ex(ENGINE_W - 20), height: ex(16),
        flexDirection: 'row', overflow: 'hidden', borderRadius: 3, zIndex: 10,
      }}>
        {Array.from({ length: 16 }).map((_, ci) => (
          <View key={`ck${ci}`} style={{
            flex: 1, height: '100%',
            backgroundColor: ci % 2 === 0 ? '#fff' : '#e74c3c',
          }} />
        ))}
      </View>
      {USE_SPRITE_RENDERING ? (
        <>
          <Image source={themeSprites.funnel} resizeMode="stretch" style={{
            position: 'absolute', left: tv.ffLeft.x - tv.ffLeft.w / 2, top: tv.ffLeft.y - ex(6),
            width: tv.ffLeft.w, height: ex(12),
            transform: [{ rotate: `${tv.ffLeft.deg}deg` }], zIndex: 6,
          }} />
          <Image source={themeSprites.funnel} resizeMode="stretch" style={{
            position: 'absolute', left: tv.ffRight.x - tv.ffRight.w / 2, top: tv.ffRight.y - ex(6),
            width: tv.ffRight.w, height: ex(12),
            transform: [{ rotate: `${tv.ffRight.deg}deg` }], zIndex: 6,
          }} />
        </>
      ) : (
        <>
          <View style={{
            position: 'absolute', left: tv.ffLeft.x - tv.ffLeft.w / 2, top: tv.ffLeft.y - ex(6),
            width: tv.ffLeft.w, height: ex(12),
            backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
            transform: [{ rotate: `${tv.ffLeft.deg}deg` }], zIndex: 6,
          }} />
          <View style={{
            position: 'absolute', left: tv.ffRight.x - tv.ffRight.w / 2, top: tv.ffRight.y - ex(6),
            width: tv.ffRight.w, height: ex(12),
            backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
            transform: [{ rotate: `${tv.ffRight.deg}deg` }], zIndex: 6,
          }} />
        </>
      )}
      {/* Mini-funnel bars — connect main funnel to channel */}
      {USE_SPRITE_RENDERING ? (
        <>
          <Image source={themeSprites.funnel} resizeMode="stretch" style={{
            position: 'absolute', left: tv.mfLeft.x - tv.mfLeft.w / 2, top: tv.mfLeft.y - ex(5),
            width: tv.mfLeft.w, height: ex(10),
            transform: [{ rotate: `${tv.mfLeft.deg}deg` }], zIndex: 6,
          }} />
          <Image source={themeSprites.funnel} resizeMode="stretch" style={{
            position: 'absolute', left: tv.mfRight.x - tv.mfRight.w / 2, top: tv.mfRight.y - ex(5),
            width: tv.mfRight.w, height: ex(10),
            transform: [{ rotate: `${tv.mfRight.deg}deg` }], zIndex: 6,
          }} />
        </>
      ) : (
        <>
          <View style={{
            position: 'absolute', left: tv.mfLeft.x - tv.mfLeft.w / 2, top: tv.mfLeft.y - ex(5),
            width: tv.mfLeft.w, height: ex(10),
            backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
            transform: [{ rotate: `${tv.mfLeft.deg}deg` }], zIndex: 6,
          }} />
          <View style={{
            position: 'absolute', left: tv.mfRight.x - tv.mfRight.w / 2, top: tv.mfRight.y - ex(5),
            width: tv.mfRight.w, height: ex(10),
            backgroundColor: '#5a3a1a', borderWidth: 1.5, borderColor: '#3d2610', borderRadius: 2,
            transform: [{ rotate: `${tv.mfRight.deg}deg` }], zIndex: 6,
          }} />
        </>
      )}
      {/* Channel walls (below mini-funnel) */}
      {USE_SPRITE_RENDERING ? (
        <>
          <Image source={themeSprites.wall} resizeMode="stretch" style={{
            position: 'absolute', left: tv.chanSX - ex(8), top: tv.finishSY + tv.miniFunnelSH,
            width: ex(8), height: tv.chanDepth - tv.miniFunnelSH, zIndex: 6,
          }} />
          <Image source={themeSprites.wall} resizeMode="stretch" style={{
            position: 'absolute', left: tv.chanEX, top: tv.finishSY + tv.miniFunnelSH,
            width: ex(8), height: tv.chanDepth - tv.miniFunnelSH, zIndex: 6,
          }} />
          <Image source={themeSprites.channel} resizeMode="stretch" style={{
            position: 'absolute', left: tv.chanSX - ex(8), top: tv.finishSY + tv.chanDepth,
            width: tv.chanW + ex(16), height: ex(10), zIndex: 6,
          }} />
        </>
      ) : (
        <>
          <View style={{
            position: 'absolute', left: tv.chanSX - ex(8), top: tv.finishSY + tv.miniFunnelSH,
            width: ex(8), height: tv.chanDepth - tv.miniFunnelSH,
            backgroundColor: '#5a3a1a', borderWidth: 1, borderColor: '#3d2610', zIndex: 6,
          }} />
          <View style={{
            position: 'absolute', left: tv.chanEX, top: tv.finishSY + tv.miniFunnelSH,
            width: ex(8), height: tv.chanDepth - tv.miniFunnelSH,
            backgroundColor: '#5a3a1a', borderWidth: 1, borderColor: '#3d2610', zIndex: 6,
          }} />
          <View style={{
            position: 'absolute', left: tv.chanSX - ex(8), top: tv.finishSY + tv.chanDepth,
            width: tv.chanW + ex(16), height: ex(10),
            backgroundColor: '#5a3a1a', borderWidth: 1, borderColor: '#3d2610', zIndex: 6,
          }} />
        </>
      )}
      <View style={{
        position: 'absolute', left: tv.chanSX, top: tv.finishSY + tv.miniFunnelSH,
        width: tv.chanW, height: tv.chanDepth - tv.miniFunnelSH,
        backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 4,
      }} />
      {Array.from({ length: 8 }).map((_, pi) => {
        const posColor = pi === 0 ? '#FFD700' : pi === 1 ? '#C0C0C0' : pi === 2 ? '#CD7F32' : '#FFFFFF';
        return (
          <React.Fragment key={`pos${pi}`}>
            <Text style={{
              position: 'absolute', left: tv.chanEX + ex(12),
              top: tv.finishSY + tv.chanDepth - (pi + 1) * tv.slotH + tv.slotH * 0.15,
              fontFamily: Fonts.bodyBold, fontSize: 15, color: posColor, zIndex: 7,
              textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}>{pi + 1}</Text>
            {pi > 0 && (
              <View style={{
                position: 'absolute', left: tv.chanSX, zIndex: 5,
                top: tv.finishSY + tv.chanDepth - pi * tv.slotH,
                width: tv.chanW, height: 1,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
});

interface FrameState {
  // Marble positions used by the LEADERBOARD sort — throttled because the
  // 10Hz update rate is plenty for ranking and avoids per-frame React work
  // on the heaviest part of the render tree.
  pos: { data: MarbleData; x: number; y: number; finished: boolean; finishTime: number }[];
  elapsed: number;
  camY: number;
}

interface CanvasState {
  // Marble positions used by the canvas — 60Hz updates so the marbles
  // animate smoothly. Previously `pos` was on the throttled frame state,
  // which made marbles appear to teleport every 100ms ("warping").
  marbles: { data: MarbleData; x: number; y: number; finished: boolean; finishTime: number }[];
  wm: { x: number; y: number; angle: number; width: number }[];
  pendulums: PendulumState[];
  ballPitBalls: BallPitBallState[];
  cradles: PendulumState[];
  trampolines: TrampolineState[];
  speedBursts: SpeedBurstState[];
  swingingDoors: { hingeX: number; hingeY: number; length: number; angle: number }[];
  doomsdayBar: { y: number; active: boolean } | null;
}

/** Static (one-time) config for the Skia renderer — captured once per race so
 *  the array references stay stable and React.memo can bail out. */
export interface RaceStaticConfig {
  windmills: { x: number; y: number; width: number }[];
  pendulums: { anchorX: number; anchorY: number; bobRadius: number }[];
  cradles: { anchorX: number; anchorY: number; bobRadius: number }[];
  ballPitRadii: number[];
  trampolines: { x: number; y: number; width: number }[];
  speedBursts: { x: number; y: number; width: number; direction: 'left' | 'right' | 'down' }[];
}

export default function RaceScreen() {
  const router = useRouter();
  const selectedMarble = useGameStore(s => s.selectedMarble);
  const betAmount = useGameStore(s => s.betAmount);
  const setLastResult = useGameStore(s => s.setLastResult);
  const addCoins = useGameStore(s => s.addCoins);
  const getOdds = useGameStore(s => s.getOdds);
  const selectedCourseId = useGameStore(s => s.selectedCourseId);

  // Build track from selected course
  const trackConfig = useMemo(() => {
    const course = COURSES.find(c => c.id === selectedCourseId);
    return buildTrack(course?.trackType || 'classic-zigzag');
  }, [selectedCourseId]);

  const tv = useMemo(() => computeTrackVisuals(trackConfig), [trackConfig]);

  const engRef = useRef<ReturnType<typeof createRaceEngine> | null>(null);
  const rafRef = useRef<number>(0);
  const doneRef = useRef(false);
  const camRef = useRef(0);
  const lastRenderRef = useRef(0);
  const camAnimY = useRef(new Animated.Value(0)).current;
  const raceShared = useRaceSharedState();
  /** Marble metadata in engine order — set once at engine creation, never changes */
  const marbleDataRef = useRef<MarbleData[]>([]);
  /** Static (non-animated) config for every dynamic element — captured once on
   *  engine creation. Stable refs let RaceCanvas avoid re-renders during the race. */
  const staticConfigRef = useRef<RaceStaticConfig>({
    windmills: [], pendulums: [], cradles: [], ballPitRadii: [],
    trampolines: [], speedBursts: [],
  });
  // Pooled scratch buffers for per-frame physics→SharedValue writes. Reused
  // across frames instead of allocating a fresh array each tick — reduces
  // GC pressure that was causing mid-race frame drops.
  const scratchPosRef = useRef<number[]>([]);
  const scratchWmRef = useRef<number[]>([]);
  const scratchPenRef = useRef<number[]>([]);
  const scratchCrRef = useRef<number[]>([]);
  const scratchBpRef = useRef<number[]>([]);
  const scratchSbRef = useRef<number[]>([]);

  const [frame, setFrame] = useState<FrameState>({
    pos: [], elapsed: 0, camY: 0,
  });
  // Split the canvas state from the HUD state so windmills / doomsday bar /
  // pendulums / cradles update at full 60Hz while the heavier HUD
  // (leaderboard, timer) re-renders at ~10Hz. Previously everything shared a
  // single throttled state which made moving obstacles look like a clock's
  // second-hand.
  const [canvas, setCanvas] = useState<CanvasState>({
    marbles: [], wm: [], pendulums: [], ballPitBalls: [], cradles: [], trampolines: [],
    speedBursts: [], swingingDoors: [], doomsdayBar: null,
  });
  const [countdown, setCountdown] = useState(3);
  const [raceOver, setRaceOver] = useState(false);
  const [firstFinisher, setFirstFinisher] = useState<{ name: string; color: string } | null>(null);
  const firstAnim = useRef(new Animated.Value(0)).current;
  const firstFinishShown = useRef(false);

  // Camera shake (start of race only)
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;

  // Commentary
  const [commentary, setCommentary] = useState<string | null>(null);
  const commentaryAnim = useRef(new Animated.Value(0)).current;
  const lastCommentaryTime = useRef(0);
  const lastLeaderId = useRef<string | null>(null);
  const playerPickFinished = useRef(false);

  const activeMode = useGameStore(s => s.activeMode);

  const handleEnd = useCallback(() => {
    if (!engRef.current || doneRef.current) return;
    doneRef.current = true;
    const p = engRef.current.getPositions();
    const odds = getOdds();

    const playerPlacement = selectedMarble
      ? p.findIndex(pos => pos.marble.id === selectedMarble.id) + 1
      : 0;
    const playerOdds = selectedMarble ? odds[selectedMarble.id] || 2 : 0;

    let payout = 0;
    let won = false;

    if (activeMode.type === 'tournament') {
      // Tournament: "won" = player's marble is NOT last place
      const tournaments = useGameStore.getState().tournaments;
      if (tournaments) {
        const remainingIds = tournaments.marbleIds.filter(id => !tournaments.eliminatedIds.includes(id));
        let lastPlaceId = '';
        for (let i = p.length - 1; i >= 0; i--) {
          if (remainingIds.includes(p[i].marble.id)) {
            lastPlaceId = p[i].marble.id;
            break;
          }
        }
        won = selectedMarble?.id !== lastPlaceId;
      }
    } else if (activeMode.type === 'playoff') {
      // Playoff KOTH: not last place = survived, last place with lives = saved
      const season = useGameStore.getState().season;
      if (season?.playoffs) {
        const remainingIds = season.playoffs.seeds.filter(id => !season.playoffs!.eliminatedIds.includes(id));
        let lastPlaceId = '';
        for (let i = p.length - 1; i >= 0; i--) {
          if (remainingIds.includes(p[i].marble.id)) {
            lastPlaceId = p[i].marble.id;
            break;
          }
        }
        if (selectedMarble?.id === lastPlaceId) {
          won = (season.playoffs.lives[lastPlaceId] ?? 0) > 0;
        } else {
          won = true;
        }
      }
    } else {
      // Standard payout logic (bet, season, national, quick_race)
      const betType = useGameStore.getState().betType;
      const exactaPicks = useGameStore.getState().exactaPicks;

      if (betType === 'exacta' && exactaPicks.length >= 2) {
        // Exacta: pick 1st and 2nd in exact order
        const match = p[0].marble.id === exactaPicks[0].id && p[1].marble.id === exactaPicks[1].id;
        if (match) {
          const mult = (odds[exactaPicks[0].id] || 2) * (odds[exactaPicks[1].id] || 2) * 0.5;
          payout = betAmount + Math.round(betAmount * mult);
          won = true;
        }
      } else if (betType === 'trifecta' && exactaPicks.length >= 3) {
        // Trifecta: pick top 3 in exact order
        const match = p[0].marble.id === exactaPicks[0].id
                   && p[1].marble.id === exactaPicks[1].id
                   && p[2].marble.id === exactaPicks[2].id;
        if (match) {
          const mult = (odds[exactaPicks[0].id] || 2) * (odds[exactaPicks[1].id] || 2) * (odds[exactaPicks[2].id] || 2) * 0.3;
          payout = betAmount + Math.round(betAmount * mult);
          won = true;
        }
      } else {
        // Standard win bet
        if (playerPlacement === 1) payout = betAmount + Math.round(betAmount * playerOdds);
        else if (playerPlacement === 2) payout = betAmount + Math.round(betAmount * 0.5);
        else if (playerPlacement === 3) payout = betAmount + Math.round(betAmount * 0.25);
        won = playerPlacement >= 1 && playerPlacement <= 3;
      }
    }

    // Strict winner flag — true ONLY if player's pick actually finished 1st in the race.
    // Unlike `won` (which means "successful round" — survived/podium/payout), this is the
    // unambiguous "did your marble cross the finish line first" check.
    const playerWonRace = playerPlacement === 1;
    setLastResult({ positions: p, playerPick: selectedMarble, betAmount, won, payout, playerPlacement, playerWonRace });
    // Payout is now atomic inside setLastResult — no separate addCoins call needed
    setRaceOver(true);
    if (selectedMarble) { won ? raceHaptics.playerWin() : raceHaptics.playerLose(); }
    setTimeout(() => router.replace('/results'), 800);
  }, [selectedMarble, betAmount, setLastResult, addCoins, getOdds, router, activeMode]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Camera shake during scrambler (countdown > 0), stop at GO
  useEffect(() => {
    if (countdown > 0) {
      // Continuous rumble loop during scrambler
      const rumble = () => {
        Animated.parallel([
          Animated.sequence([
            Animated.timing(shakeX, { toValue: 2.5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -2, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 1.5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -1, duration: 50, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(shakeY, { toValue: 1.5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: -1.5, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: 1, duration: 50, useNativeDriver: true }),
            Animated.timing(shakeY, { toValue: -0.5, duration: 50, useNativeDriver: true }),
          ]),
        ]).start();
      };
      rumble();
      const interval = setInterval(rumble, 200);
      return () => clearInterval(interval);
    } else {
      // Stop shake at GO
      shakeX.setValue(0);
      shakeY.setValue(0);
    }
  }, [countdown]);

  // Release gate when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && engRef.current) {
      engRef.current.releaseGate();
      playSound('go');
    } else if (countdown > 0) {
      playSound('countdown');
    }
  }, [countdown]);

  // Audio SFX — preload on mount, unload on unmount
  useEffect(() => {
    preloadRaceSounds();
    return () => { unloadRaceSounds(); };
  }, []);

  // Physics loop
  useEffect(() => {
    // Build marble list for special modes
    let raceMarbles: MarbleData[] | undefined;
    if (activeMode.type === 'tournament') {
      const t = useGameStore.getState().tournaments;
      if (t) {
        raceMarbles = MARBLES.filter(m => !t.eliminatedIds.includes(m.id));
      }
    } else if (activeMode.type === 'playoff') {
      const season = useGameStore.getState().season;
      if (season?.playoffs) {
        const aliveIds = season.playoffs.seeds.filter(id => !season.playoffs!.eliminatedIds.includes(id));
        raceMarbles = aliveIds.map(id => {
          const base = MARBLES.find(m => m.id === id)!;
          const g = season.seasonStats?.[id];
          if (!g) return base;
          return { ...base, stats: {
            speed: Math.min(base.stats.speed + g.speed, 8),
            power: Math.min(base.stats.power + g.power, 8),
            bounce: Math.min(base.stats.bounce + g.bounce, 8),
            luck: Math.min(base.stats.luck + g.luck, 8),
          }};
        });
      }
    } else if (activeMode.type === 'season') {
      const season = useGameStore.getState().season;
      if (season?.seasonStats) {
        raceMarbles = MARBLES.map(m => {
          const g = season.seasonStats[m.id];
          if (!g) return m;
          return { ...m, stats: {
            speed: Math.min(m.stats.speed + g.speed, 8),
            power: Math.min(m.stats.power + g.power, 8),
            bounce: Math.min(m.stats.bounce + g.bounce, 8),
            luck: Math.min(m.stats.luck + g.luck, 8),
          }};
        });
      }
    } else if (activeMode.type === 'multiplayer_tournament') {
      // Race only the marbles whose players are still alive in the bracket.
      // Eliminated marbles do not come back — fixes the user-reported
      // "all 8 balls added back in round 5" bug where MP was previously
      // racing the full roster every round.
      const survivingIds = useGameStore.getState().mpSurvivingMarbleIds;
      if (survivingIds && survivingIds.length > 0) {
        raceMarbles = MARBLES.filter(m => survivingIds.includes(m.id));
      }
    }

    // Apply equipped skins to marble colors
    const equippedSkins = useGameStore.getState().equippedSkins;
    if (raceMarbles) {
      raceMarbles = raceMarbles.map(m => getSkinnedMarble(m, equippedSkins));
    }

    const playerPickId = useGameStore.getState().selectedMarble?.id;
    const eng = createRaceEngine({
      config: trackConfig,
      raceMarbles: raceMarbles ? raceMarbles : MARBLES.map(m => getSkinnedMarble(m, equippedSkins)),
      onHaptic: (type: HapticType, marbleId: string) => {
        if (!playerPickId || marbleId === playerPickId) {
          triggerRaceHaptic(type);
          playSound(type);
        }
      },
    });
    engRef.current = eng;
    // CRITICAL: must read marble order FROM the engine, not from the input.
    // The engine shuffles marbles internally so each race has a different starting
    // arrangement. If we use the input order here, SkiaMarbles draws the wrong
    // marble at each physics index → red ball appears at the leader's position
    // when actually a different marble is leading.
    marbleDataRef.current = eng.marbles;

    // Capture static element configs once. No physics side effects — the engine
    // exposes this directly. Stored in refs so RaceCanvas's React.memo can bail
    // out of re-renders for the duration of the race.
    staticConfigRef.current = eng.getStaticConfig();

    let last = performance.now();
    const totalH = trackConfig.totalHeight;
    const loop = (t: number) => {
      const dt = Math.min(t - last, 50); // cap at 50ms — allows physics catch-up on slow frames
      last = t;
      const st: RaceState = eng.step(dt);

      // === Hybrid camera: follow player's marble, snap to leader after finish ===
      // Single O(n) pass: track both the deepest Y (camera target) and the leader marble.
      // We previously sorted all marbles every RAF (60 Hz × 8-element sort + array copy),
      // but sortedByY is only consumed by commentary which throttles to once per 4s —
      // so the eager sort is deferred to that block (see below).
      let followY = 0;
      let leaderY = 0;
      let leaderMarble: typeof st.marbles[0] | null = null;
      for (let i = 0; i < st.marbles.length; i++) {
        const m = st.marbles[i];
        if (m.y > leaderY) { leaderY = m.y; leaderMarble = m; }
      }

      if (playerPickId) {
        const playerMarble = st.marbles.find(m => m.data.id === playerPickId);
        if (playerMarble && !playerMarble.finished) {
          followY = playerMarble.y; // Follow player's marble
        } else {
          // Player finished or not found — follow leader
          if (playerMarble?.finished && !playerPickFinished.current) {
            playerPickFinished.current = true;
          }
          followY = leaderY;
        }
      } else {
        followY = leaderY; // Quick race: follow leader
      }

      // When doomsday bar is active, camera follows the bar so the user can see it sweeping
      if (st.doomsdayBar && st.doomsdayBar.active) {
        followY = st.doomsdayBar.y;
      }
      // Once ANY marble has crossed the finish line, force the camera to
      // maxCam (the very bottom of the track) so all 8 finish-slot labels
      // and the marbles stacking into them are visible. Without this, the
      // leader-at-35%-from-top heuristic leaves slot 1 / slot 2 below the
      // screen on tracks where totalHeight has a tight buffer past the
      // channel bottom — reported as "podium not showing on some tracks".
      const anyFinished = st.marbles.some((m) => m.finished);
      const maxCam = totalH - SH / SCALE;
      const target = anyFinished
        ? maxCam
        : Math.min(maxCam, Math.max(0, followY - SH * 0.35 / SCALE));
      // Frame-rate independent smoothing — gentle follow for natural feel
      const smoothing = 1 - Math.pow(0.001, dt / 1000);
      camRef.current += (target - camRef.current) * smoothing;
      // Update camera via Animated — bypasses React reconciliation for silky scrolling
      camAnimY.setValue(-camRef.current * SCALE);
      // Also update SharedValue for Skia Canvas camera (UI thread, no React re-render)
      raceShared.cameraY.value = camRef.current;

      // === Race commentary ===
      // IMPORTANT: only consider still-racing marbles. Once a marble crosses
      // the finish line it's out of the conversation — the commentator
      // shouldn't keep talking about who's "in the lead" when the leader is
      // already done. Player-pick comments also skip if the pick has finished.
      const now = t;
      if (now - lastCommentaryTime.current > 4000 && st.elapsed > 1500) {
        const stillRacing = st.marbles.filter(m => !m.finished);
        const sortedByY = stillRacing.sort((a, b) => b.y - a.y);
        const leader = sortedByY[0];
        const second = sortedByY[1];
        if (leader && second) {
          const gap = leader.y - second.y;
          let msg: string | null = null;

          // Lead change
          if (leader.data.id !== lastLeaderId.current && lastLeaderId.current !== null) {
            msg = `${leader.data.name} takes the lead!`;
            playSound('leadChange');
          }
          // Big gap
          else if (gap > 120) {
            msg = `${leader.data.name} is pulling away!`;
          }
          // Close race
          else if (gap < 25 && st.elapsed > 5000) {
            msg = `${leader.data.name} and ${second.data.name} neck and neck!`;
          }
          // Player marble doing well — only if pick is still racing
          else if (playerPickId) {
            const playerStillRacing = st.marbles.find(m => m.data.id === playerPickId && !m.finished);
            if (playerStillRacing) {
              const playerIdx = sortedByY.findIndex(m => m.data.id === playerPickId);
              if (playerIdx === 0 && st.elapsed > 3000) {
                msg = `Your pick is leading!`;
              } else if (playerIdx >= 0 && playerIdx >= sortedByY.length - 2 && st.elapsed > 5000) {
                msg = `Your pick is falling behind...`;
              }
            }
          }

          if (msg) {
            lastCommentaryTime.current = now;
            setCommentary(msg);
            Animated.sequence([
              Animated.timing(commentaryAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
              Animated.delay(2500),
              Animated.timing(commentaryAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
            ]).start(() => setCommentary(null));
          }
        }
        lastLeaderId.current = leader?.data.id ?? null;
      }
      if (lastLeaderId.current === null && leaderMarble) {
        lastLeaderId.current = leaderMarble.data.id;
      }

      // Detect first marble to finish — trigger celebration (runs at full RAF rate)
      if (!firstFinishShown.current) {
        const finishedMarbles = st.marbles.filter(m => m.finished);
        if (finishedMarbles.length > 0) {
          // Pick the marble with the EARLIEST finishTime (not first by array index)
          const winner = finishedMarbles.reduce((best, m) =>
            m.finishTime < best.finishTime ? m : best
          );
          firstFinishShown.current = true;
          playSound('finish');
          setFirstFinisher({ name: winner.data.name, color: winner.data.colorLight });
          Animated.sequence([
            Animated.spring(firstAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
            Animated.delay(1800),
            Animated.timing(firstAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]).start();
        }
      }

      // === PERFORMANCE: write every animated value to SharedValues every frame.
      // Skia consumes these on the UI thread — no React re-render needed.
      //
      // Object-pooled buffers (allocated once in refs below). We mutate in
      // place, then assign a NEW slice to .value so Reanimated detects the
      // change. Pre-Object-pool we were `[].push()`ing ~7 fresh arrays/frame
      // = ~420 allocations/sec, which generated visible GC pauses mid-race.
      const flatPos = scratchPosRef.current;
      flatPos.length = 0;
      for (let i = 0; i < st.marbles.length; i++) flatPos.push(st.marbles[i].x, st.marbles[i].y);
      raceShared.marblePositions.value = flatPos.slice();

      const wmAngles = scratchWmRef.current;
      wmAngles.length = 0;
      for (let i = 0; i < st.windmills.length; i++) wmAngles.push(st.windmills[i].angle);
      raceShared.windmillAngles.value = wmAngles.slice();

      const penBobs = scratchPenRef.current;
      penBobs.length = 0;
      for (let i = 0; i < st.pendulums.length; i++) penBobs.push(st.pendulums[i].bobX, st.pendulums[i].bobY);
      raceShared.pendulumBobs.value = penBobs.slice();

      const crBobs = scratchCrRef.current;
      crBobs.length = 0;
      for (let i = 0; i < st.cradles.length; i++) crBobs.push(st.cradles[i].bobX, st.cradles[i].bobY);
      raceShared.cradleBobs.value = crBobs.slice();

      const bpPos = scratchBpRef.current;
      bpPos.length = 0;
      for (let i = 0; i < st.ballPitBalls.length; i++) bpPos.push(st.ballPitBalls[i].x, st.ballPitBalls[i].y);
      raceShared.ballPitPositions.value = bpPos.slice();

      const sbActive = scratchSbRef.current;
      sbActive.length = 0;
      for (let i = 0; i < st.speedBursts.length; i++) sbActive.push(st.speedBursts[i].active ? 1 : 0);
      raceShared.speedBurstActive.value = sbActive.slice();

      // Doomsday bar
      if (st.doomsdayBar) {
        raceShared.doomsdayBarY.value = st.doomsdayBar.y;
        raceShared.doomsdayBarActive.value = st.doomsdayBar.active ? 1 : 0;
      } else {
        raceShared.doomsdayBarActive.value = 0;
      }

      // Canvas state — written EVERY frame so moving obstacles AND marbles
      // animate smoothly. The setState fires a re-render but the heavy HUD
      // pieces pull from a separate state slice (`frame`) that's throttled
      // below, so the cost stays bounded.
      const marblePos = st.marbles.map(m => ({
        data: m.data, x: m.x, y: m.y, finished: m.finished, finishTime: m.finishTime,
      }));
      setCanvas({
        marbles: marblePos,
        wm: st.windmills,
        pendulums: st.pendulums,
        ballPitBalls: st.ballPitBalls,
        cradles: st.cradles,
        trampolines: st.trampolines,
        speedBursts: st.speedBursts,
        swingingDoors: st.swingingDoors,
        doomsdayBar: st.doomsdayBar,
      });

      // HUD update rate — leaderboard + timer + commentary only need ~10Hz.
      const hudInterval = 100;
      if (st.isFinished || t - lastRenderRef.current >= hudInterval) {
        lastRenderRef.current = t;
        setFrame({
          pos: marblePos,
          elapsed: st.elapsed,
          camY: camRef.current,
        });
      }
      if (st.isFinished && !doneRef.current) { handleEnd(); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); eng.destroy(); };
  }, [handleEnd, trackConfig]);

  const { pos, elapsed, camY } = frame;
  const { wm, pendulums, ballPitBalls, cradles } = canvas;
  const vBuf = SH / SCALE * 0.7;
  const vMin = camY - vBuf, vMax = camY + SH / SCALE + vBuf;
  const vis = (y: number) => y > vMin && y < vMax;
  // In-race leaderboard — all 8 marbles, sorted by progress (deeper Y = better
  // rank, finished marbles always above unfinished, finished ordered by their
  // finish time). Memoized so we only re-sort when `pos` actually changes;
  // unrelated re-renders skip the work.
  const sorted = useMemo(() => [...pos].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    return b.y - a.y;
  }), [pos]);
  const courseName = COURSES.find(c => c.id === selectedCourseId)?.name || 'RACE';

  // Admin-controlled per-track background image. The remote-config server
  // can attach a custom image URL to any specific course (e.g. a sponsored
  // Pepsi backdrop on "Iron Run"). If the current course has an override,
  // we render that URL instead of the bundled theme sprite. Theme sprites
  // (the obstacles, walls etc.) keep using the track's native theme so
  // physics-relevant art doesn't shift.
  //
  // State (not a const) because the config might still be fetching when this
  // screen mounts on a cold-start race-from-deep-link. The useEffect below
  // re-reads getConfig() after fetchRemoteConfig settles so the bg appears
  // mid-race instead of being stuck on the cached (URL-less) snapshot.
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => {
    const map = getConfig().trackBgImages;
    return (map && map[selectedCourseId]) || null;
  });
  useEffect(() => {
    let cancelled = false;
    fetchRemoteConfig().then(() => {
      if (cancelled) return;
      const map = getConfig().trackBgImages;
      const next = (map && map[selectedCourseId]) || null;
      setCustomBgUrl((prev) => (prev === next ? prev : next));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCourseId]);
  const bgSprite = useMemo(() => getBgSprite(trackConfig.bgImage), [trackConfig.bgImage]);
  const themeSprites = useMemo(() => getThemeSprites(trackConfig.bgImage), [trackConfig.bgImage]);
  const themeOverlay = customBgUrl ? null : (THEME_OVERLAYS[trackConfig.bgImage] || null);

  // Tile background images to cover full track height
  const totalScreenH = ex(trackConfig.totalHeight);
  const bgTileCount = Math.ceil(totalScreenH / SH) + 1;

  // Theme-aware container background (fallback behind tiles)
  const containerBgMap: Record<string, string> = {
    grass: '#2a5a1a', lava: '#3a1008', ice: '#0a1a3a', cyber: '#1a0a2e',
    beach: '#6a9ab0', forest: '#0a2a0a', desert: '#8b6914', sunset: '#6a2040',
    night: '#050510', candy: '#cc1080', ocean: '#001a4a', volcanic: '#1a0000',
    neon: '#0a0a0a', snow: '#b0c8e0',
  };
  const containerBg = containerBgMap[trackConfig.bgImage] || '#2a5a1a';

  // Light themes need DARK text for the FINISH banner; dark themes need
  // WHITE text. Picked manually rather than computing luminance because the
  // backgrounds are tiled sprites — the container color is a rough proxy.
  const LIGHT_THEMES = new Set(['beach', 'desert', 'candy', 'snow']);
  const finishTextColor = LIGHT_THEMES.has(trackConfig.bgImage) ? '#0a1a3a' : '#ffffff';
  const finishShadowColor = LIGHT_THEMES.has(trackConfig.bgImage)
    ? 'rgba(255,255,255,0.85)'
    : 'rgba(0,0,0,0.75)';

  return (
    <View style={[st.container, { backgroundColor: containerBg }]}>

      {/* Custom remote background — tiled behind the Skia canvas when the
          admin has set a per-track image URL for the current course. The
          Skia canvas renders with a transparent background so this image
          shows through. Falls back to native theme sprite when no override
          is set (the canvas just paints the normal scene). */}
      {customBgUrl && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: bgTileCount }).map((_, ti) => (
            <Image
              key={`custom-bg-${ti}`}
              source={{ uri: customBgUrl }}
              resizeMode="cover"
              style={{
                position: 'absolute', left: 0, top: ti * SH,
                width: SW, height: SH + 1,
              }}
            />
          ))}
        </View>
      )}

      {USE_SKIA_CANVAS ? (
        <Animated.View style={[st.clip, { transform: [{ translateX: shakeX }, { translateY: shakeY }] }]}>
          <RaceCanvas
            trackVisuals={tv}
            bgImage={trackConfig.bgImage}
            totalHeight={trackConfig.totalHeight}
            engineW={ENGINE_W}
            useSprites={USE_SPRITE_RENDERING}
            cameraY={camY}
            cameraShared={raceShared.cameraY}
            shakeX={0}
            shakeY={0}
            marbles={canvas.marbles}
            marbleData={marbleDataRef.current}
            marblePositions={raceShared.marblePositions}
            windmills={wm}
            pendulums={pendulums}
            ballPitBalls={ballPitBalls}
            cradles={cradles}
            speedBursts={canvas.speedBursts}
            swingingDoors={canvas.swingingDoors}
            doomsdayBar={canvas.doomsdayBar}
            countdown={countdown}
            hasCustomBg={!!customBgUrl}
          />
          {/* Slot numbers — rendered as plain RN Text overlay so they're visible
              regardless of Skia font loading. Scrolls with the camera. */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', left: 0, top: 0, width: SW,
              transform: [{ translateY: camAnimY }],
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((rank) => {
              const slotCenterY = tv.finishSY + tv.chanDepth - (rank - 0.5) * tv.slotH;
              const color = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#FFFFFF';
              return (
                <Text
                  key={`slotnum${rank}`}
                  style={{
                    position: 'absolute',
                    left: tv.chanEX + ex(10),
                    top: slotCenterY - ex(11),
                    width: ex(24),
                    fontFamily: Fonts.bodyBold,
                    fontSize: 18,
                    color,
                    textAlign: 'center',
                    textShadowColor: 'rgba(0,0,0,0.9)',
                    textShadowOffset: { width: 1, height: 1 },
                    textShadowRadius: 2,
                  }}
                >
                  {rank}
                </Text>
              );
            })}
            {/* FINISH banner — rendered as RN text so it's never font-blocked.
                Sits ABOVE the checker strip (which spans finishSY-22 to
                finishSY-6 in engine units). Color picks white on dark
                themes, dark navy on light themes (beach/desert/candy/snow)
                for contrast. */}
            <Text
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0, right: 0,
                top: tv.finishSY - ex(60),
                fontFamily: Fonts.display,
                fontSize: 24,
                color: finishTextColor,
                textAlign: 'center',
                letterSpacing: 3,
                textShadowColor: finishShadowColor,
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              }}
            >
              FINISH
            </Text>
          </Animated.View>
        </Animated.View>
      ) : (
      <Animated.View style={[st.clip, { transform: [{ translateX: shakeX }, { translateY: shakeY }] }]}>
        <Animated.View style={{ transform: [{ translateY: camAnimY }] }}>
          {/* Tiled background — scrolls with track content */}
          {Array.from({ length: bgTileCount }).map((_, ti) => (
            <Image key={`bg${ti}`} source={bgSprite} resizeMode="cover" style={{
              position: 'absolute', left: 0, top: ti * SH, width: SW, height: SH + 1, zIndex: 0,
            }} />
          ))}
          {themeOverlay && (
            <View style={{ position: 'absolute', left: 0, top: 0, width: SW, height: totalScreenH, backgroundColor: themeOverlay, zIndex: 0 }} />
          )}
          <StaticTrackElements
            tv={tv}
            themeSprites={themeSprites}
            finishTextColor={finishTextColor}
            finishShadowColor={finishShadowColor}
          />

          {/* Windmills */}
          {wm.map((w, i) => {
            if (!vis(w.y)) return null;
            const sw = ex(w.width);
            return (
              <React.Fragment key={`w${i}`}>
                {USE_SPRITE_RENDERING ? (
                  <Image source={themeSprites.windmill} resizeMode="stretch" style={{
                    position: 'absolute', left: ex(w.x) - sw / 2, top: ex(w.y) - WM_H / 2,
                    width: sw, height: WM_H,
                    transform: [{ rotate: `${w.angle * 180 / Math.PI}deg` }], zIndex: 8,
                  }} />
                ) : (
                  <View style={{
                    position: 'absolute', left: ex(w.x) - sw / 2, top: ex(w.y) - WM_H / 2,
                    width: sw, height: WM_H,
                    backgroundColor: '#c0392b', borderRadius: WM_H / 2,
                    borderWidth: 1, borderColor: '#922b21',
                    transform: [{ rotate: `${w.angle * 180 / Math.PI}deg` }], zIndex: 8,
                  }} />
                )}
                <View style={{
                  position: 'absolute', left: ex(w.x) - ex(6), top: ex(w.y) - ex(6),
                  width: ex(12), height: ex(12), borderRadius: ex(6),
                  backgroundColor: '#555', borderWidth: 2, borderColor: '#333', zIndex: 9,
                }} />
              </React.Fragment>
            );
          })}

          {/* Swinging doors — hinged blades that rotate around their
              endpoint. We compute the door's CENTER from the hinge +
              length × angle (same math the physics body uses), then place
              the View centered there and rotate around its own center.
              That's equivalent to "rotate around the hinge endpoint". */}
          {canvas.swingingDoors.map((d, i) => {
            const cx = d.hingeX + (d.length / 2) * Math.cos(d.angle);
            const cy = d.hingeY + (d.length / 2) * Math.sin(d.angle);
            const len = ex(d.length);
            const h = ex(6);
            if (!vis(cy)) return null;
            return (
              <React.Fragment key={`sd${i}`}>
                {/* Hinge cap (anchored, doesn't move) */}
                <View style={{
                  position: 'absolute',
                  left: ex(d.hingeX) - ex(5),
                  top: ex(d.hingeY) - ex(5),
                  width: ex(10), height: ex(10), borderRadius: ex(5),
                  backgroundColor: '#777', borderWidth: 2, borderColor: '#444',
                  zIndex: 9,
                }} />
                {/* Door blade */}
                <View
                  style={{
                    position: 'absolute',
                    left: ex(cx) - len / 2,
                    top: ex(cy) - h / 2,
                    width: len,
                    height: h,
                    backgroundColor: '#a0522d',
                    borderRadius: 2,
                    borderWidth: 1,
                    borderColor: '#5a2f17',
                    zIndex: 8,
                    transform: [{ rotate: `${d.angle * 180 / Math.PI}deg` }],
                  }}
                />
              </React.Fragment>
            );
          })}

          {/* Ball Pit dynamic balls */}
          {ballPitBalls.map((b, i) => {
            if (!vis(b.y)) return null;
            const sr = ex(b.r);
            return (
              <View key={`pb${i}`} style={{
                position: 'absolute',
                left: ex(b.x) - sr, top: ex(b.y) - sr,
                width: sr * 2, height: sr * 2, borderRadius: sr,
                backgroundColor: '#9b59b6',
                borderWidth: 1, borderColor: '#8e44ad',
                zIndex: 4,
              }} />
            );
          })}

          {/* Pendulum ropes + bobs */}
          {pendulums.map((p, i) => {
            if (!vis(p.anchorY) && !vis(p.bobY)) return null;
            const ax = ex(p.anchorX), ay = ex(p.anchorY);
            const bx = ex(p.bobX), by = ex(p.bobY);
            const dx = bx - ax, dy = by - ay;
            const len = Math.sqrt(dx * dx + dy * dy);
            const deg = Math.atan2(dy, dx) * 180 / Math.PI;
            const sr = ex(p.bobRadius);
            return (
              <React.Fragment key={`pen${i}`}>
                {/* Rope */}
                <View style={{
                  position: 'absolute',
                  left: ax, top: ay - 1,
                  width: len, height: 2,
                  backgroundColor: '#7f8c8d',
                  transform: [{ rotate: `${deg}deg` }],
                  transformOrigin: '0% 50%',
                  zIndex: 7,
                }} />
                {/* Anchor point */}
                <View style={{
                  position: 'absolute',
                  left: ax - ex(4), top: ay - ex(4),
                  width: ex(8), height: ex(8), borderRadius: ex(4),
                  backgroundColor: '#555', borderWidth: 1.5, borderColor: '#333',
                  zIndex: 9,
                }} />
                {/* Bob */}
                <View style={{
                  position: 'absolute',
                  left: bx - sr, top: by - sr,
                  width: sr * 2, height: sr * 2, borderRadius: sr,
                  backgroundColor: '#e74c3c',
                  borderWidth: 2, borderColor: '#c0392b',
                  zIndex: 8,
                }}>
                  <View style={{
                    position: 'absolute', top: 2, left: 3,
                    width: sr * 0.6, height: sr * 0.4, borderRadius: sr * 0.3,
                    backgroundColor: 'rgba(255,255,255,0.35)',
                    transform: [{ rotate: '-20deg' }],
                  }} />
                </View>
              </React.Fragment>
            );
          })}

          {/* Cradle ropes + bobs */}
          {cradles.map((c, i) => {
            if (!vis(c.anchorY) && !vis(c.bobY)) return null;
            const ax = ex(c.anchorX), ay = ex(c.anchorY);
            const bx = ex(c.bobX), by = ex(c.bobY);
            const dx = bx - ax, dy = by - ay;
            const len = Math.sqrt(dx * dx + dy * dy);
            const deg = Math.atan2(dy, dx) * 180 / Math.PI;
            const sr = ex(c.bobRadius);
            return (
              <React.Fragment key={`cr${i}`}>
                {/* String */}
                <View style={{
                  position: 'absolute',
                  left: ax, top: ay - 1,
                  width: len, height: 1.5,
                  backgroundColor: '#95a5a6',
                  transform: [{ rotate: `${deg}deg` }],
                  transformOrigin: '0% 50%',
                  zIndex: 7,
                }} />
                {/* Anchor dot */}
                <View style={{
                  position: 'absolute',
                  left: ax - ex(2), top: ay - ex(2),
                  width: ex(4), height: ex(4), borderRadius: ex(2),
                  backgroundColor: '#7f8c8d',
                  zIndex: 9,
                }} />
                {/* Bob — metallic silver */}
                <View style={{
                  position: 'absolute',
                  left: bx - sr, top: by - sr,
                  width: sr * 2, height: sr * 2, borderRadius: sr,
                  backgroundColor: '#bdc3c7',
                  borderWidth: 1.5, borderColor: '#95a5a6',
                  zIndex: 8,
                }}>
                  <View style={{
                    position: 'absolute', top: 2, left: 3,
                    width: sr * 0.5, height: sr * 0.35, borderRadius: sr * 0.2,
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    transform: [{ rotate: '-20deg' }],
                  }} />
                </View>
              </React.Fragment>
            );
          })}

          {/* Speed Burst Pads */}
          {tv.speedBurstVis.map((sb, i) => {
            if (!vis(sb.ey)) return null;
            const isActive = canvas.speedBursts[i]?.active || false;
            const arrow = sb.direction === 'left' ? '\u25C0' : sb.direction === 'down' ? '\u25BC' : '\u25B6';
            return USE_SPRITE_RENDERING ? (
              <View key={`sb${i}`} style={{
                position: 'absolute', left: sb.left, top: sb.top,
                width: sb.width, height: sb.height,
                backgroundColor: isActive ? '#ffaa00' : '#ffc220',
                borderRadius: 4,
                borderWidth: 2,
                borderColor: isActive ? '#ff8800' : '#e6a800',
                zIndex: 6, opacity: isActive ? 1 : 0.85,
                flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
              }}>
                {[0, 1, 2].map(ci => (
                  <Image key={ci} source={themeSprites.speedburst} resizeMode="contain" style={{
                    width: sb.height - 4, height: sb.height - 4,
                    opacity: isActive ? 1 : 0.8,
                  }} />
                ))}
              </View>
            ) : (
              <View key={`sb${i}`} style={{
                position: 'absolute', left: sb.left, top: sb.top,
                width: sb.width, height: sb.height,
                backgroundColor: isActive ? '#ffaa00' : '#ffc220',
                borderRadius: 3,
                borderWidth: 2,
                borderColor: isActive ? '#ff8800' : '#e6a800',
                zIndex: 6,
                opacity: isActive ? 1 : 0.85,
              }}>
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 1,
                }}>
                  {[0, 1, 2].map(ci => (
                    <Text key={ci} style={{
                      fontSize: 7, color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    }}>{arrow}</Text>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Gate — holds marbles during countdown */}
          {countdown > 0 && (
            <View style={{
              position: 'absolute', left: ex(10), top: ex(230) - 4,
              width: ex(ENGINE_W - 20), height: 8,
              backgroundColor: '#e74c3c', borderRadius: 3,
              borderWidth: 1, borderColor: '#c0392b', zIndex: 8,
            }} />
          )}

          {/* Marbles */}
          {pos.map(m => (
            <View key={m.data.id} style={{
              position: 'absolute', left: ex(m.x) - MARBLE_R, top: ex(m.y) - MARBLE_R,
              width: MARBLE_R * 2, height: MARBLE_R * 2, borderRadius: MARBLE_R,
              backgroundColor: m.data.colorDark, zIndex: 10, overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3, shadowRadius: 0, elevation: 4,
            }}>
              <View style={{
                position: 'absolute', top: 1, left: 1,
                width: MARBLE_R * 2 - 2, height: MARBLE_R * 2 - 2,
                borderRadius: MARBLE_R - 1, backgroundColor: m.data.colorLight,
              }} />
              <View style={{
                position: 'absolute', top: 3, left: 4, width: 8, height: 5,
                borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)',
                transform: [{ rotate: '-20deg' }],
              }} />
            </View>
          ))}

          {/* Doomsday Bar */}
          {canvas.doomsdayBar && canvas.doomsdayBar.active && (
            <View style={{
              position: 'absolute',
              left: 0,
              top: ex(canvas.doomsdayBar.y) - ex(10),
              width: SW,
              height: ex(20),
              zIndex: 15,
            }}>
              <View style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#cc0000',
                borderTopWidth: 2,
                borderBottomWidth: 2,
                borderColor: '#ff3333',
                opacity: 0.9,
              }} />
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                flexDirection: 'row', overflow: 'hidden',
              }}>
                {Array.from({ length: 20 }).map((_, i) => (
                  <View key={`ds${i}`} style={{
                    width: ex(20),
                    height: '100%',
                    backgroundColor: i % 2 === 0 ? 'rgba(255,200,0,0.4)' : 'transparent',
                    transform: [{ skewX: '-20deg' }],
                  }} />
                ))}
              </View>
              <Text style={{
                position: 'absolute', top: -16,
                width: '100%', textAlign: 'center',
                fontFamily: Fonts.bodyBold, fontSize: 10,
                color: '#ff3333', letterSpacing: 2,
                textShadowColor: 'rgba(0,0,0,0.8)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              }}>DOOMSDAY</Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
      )}

      {/* HUD */}
      <View style={st.hud}>
        <View style={st.hudStandings}>
          {sorted.map((m, i) => {
            const isPick = selectedMarble?.id === m.data.id;
            const finished = m.finished;
            return (
              <View
                key={m.data.id}
                style={[
                  st.posRow,
                  isPick && st.posRowPick,
                  finished && st.posRowFinished,
                ]}
              >
                <Text style={[st.posNum, isPick && st.posNumPick, finished && st.posNumFinished]}>
                  {i + 1}
                </Text>
                <View style={[st.posDot, { backgroundColor: m.data.colorLight }, finished && { opacity: 0.5 }]} />
                <Text style={[st.posName, isPick && st.posNamePick, finished && st.posNameFinished]}>
                  {m.data.name}
                </Text>
                {/* When the marble crosses the finish line, show a small
                    finish-time tag in green so the leaderboard makes it
                    obvious who's done. Still racing marbles get the YOU
                    tag (if applicable) or nothing. */}
                {finished ? (
                  <Text style={st.finishTag}>
                    {m.finishTime ? `${(m.finishTime / 1000).toFixed(1)}s` : 'FIN'}
                  </Text>
                ) : isPick ? (
                  <Text style={st.pickTag}>YOU</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <View style={st.hudTimer}>
          <Text style={st.seasonTag}>{courseName.toUpperCase()}</Text>
          <Text style={st.timer}>{(elapsed / 1000).toFixed(1)}s</Text>
          {canvas.doomsdayBar && (
            <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 10, color: '#ff3333', letterSpacing: 1, marginTop: 2 }}>
              DOOMSDAY ACTIVE
            </Text>
          )}
        </View>
      </View>

      {/* Countdown overlay */}
      {(countdown > 0 || (countdown === 0 && elapsed < 800)) && (
        <View style={st.countdownWrap} pointerEvents="none">
          <Text style={st.countdownText}>
            {countdown > 0 ? countdown : 'GO!'}
          </Text>
        </View>
      )}

      {/* First place celebration */}
      {firstFinisher && (
        <Animated.View
          pointerEvents="none"
          style={[st.countdownWrap, {
            opacity: firstAnim,
            transform: [{ scale: firstAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          }]}
        >
          <View style={st.celebWrap}>
            <Text style={st.celebStar}>&#9733;</Text>
            <View style={[st.celebDot, { backgroundColor: firstFinisher.color }]} />
            <Text style={st.celebName}>{firstFinisher.name.toUpperCase()}</Text>
            <Text style={st.celebLabel}>1ST PLACE!</Text>
          </View>
        </Animated.View>
      )}

      {/* Commentary overlay */}
      {commentary && (
        <Animated.View style={[st.commentaryWrap, { opacity: commentaryAnim }]} pointerEvents="none">
          <Text style={st.commentaryText}>{commentary}</Text>
        </Animated.View>
      )}

      {/* Race over overlay */}
      {raceOver && (
        <View style={st.countdownWrap} pointerEvents="none">
          <Text style={[st.countdownText, { fontSize: 48 }]}>RACE OVER</Text>
        </View>
      )}

      {selectedMarble && (
        <View style={st.bet}>
          <Text style={st.betLbl}>{activeMode.type === 'tournament' || activeMode.type === 'playoff' ? 'YOUR PICK' : 'YOUR BET'}</Text>
          <View style={st.betRow}>
            <View style={[st.betDot, { backgroundColor: selectedMarble.colorLight }]} />
            {activeMode.type === 'tournament' || activeMode.type === 'playoff' ? (
              <Text style={st.betAmt}>{selectedMarble.name}</Text>
            ) : (
              <Text style={st.betAmt}>{betAmount}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4a8f28' },
  clip: { flex: 1, overflow: 'hidden' },
  hud: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 21,
    paddingTop: 50, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  hudStandings: {
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingVertical: 5, paddingHorizontal: 8,
    minWidth: 110,
  },
  hudTimer: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 10, alignItems: 'flex-end',
  },
  seasonTag: {
    fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.yellow,
    letterSpacing: 1, marginBottom: 2,
  },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 1, paddingVertical: 1, paddingHorizontal: 3, borderRadius: 5 },
  posRowPick: { backgroundColor: 'rgba(255,194,32,0.3)' },
  posNum: { fontFamily: Fonts.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.7)', width: 12 },
  posNumPick: { color: Colors.yellow },
  posDot: { width: 11, height: 11, borderRadius: 5.5 },
  posName: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: '#fff' },
  posNamePick: { fontFamily: Fonts.bodyBold, color: Colors.yellow },
  pickTag: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.yellow, marginLeft: 4 },
  // Finished marble: row gets a faint green tint + name dims; "FIN" / finish
  // time tag in green so the leaderboard makes it obvious which marbles are
  // done racing vs which are still on the course.
  posRowFinished: { backgroundColor: 'rgba(46,204,113,0.15)' },
  posNumFinished: { color: 'rgba(46,204,113,0.85)' },
  posNameFinished: { color: 'rgba(255,255,255,0.55)' },
  finishTag: { fontFamily: Fonts.bodyBold, fontSize: 8, color: '#2ecc71', marginLeft: 4, letterSpacing: 0.3 },
  timer: { fontFamily: Fonts.bodyBold, fontSize: 18, color: '#fff', textAlign: 'right' },
  bet: {
    position: 'absolute', bottom: 28, left: 16, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  betLbl: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  betDot: { width: 18, height: 18, borderRadius: 9 },
  betAmt: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.yellow },
  countdownWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 30,
  },
  countdownText: {
    fontFamily: Fonts.display, fontSize: 96, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  celebWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20, paddingVertical: 24, paddingHorizontal: 40,
    borderWidth: 2, borderColor: '#FFD700',
  },
  celebStar: {
    fontSize: 40, color: '#FFD700', marginBottom: 4,
    textShadowColor: '#FFD700', textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  celebDot: {
    width: 48, height: 48, borderRadius: 24, marginBottom: 8,
    borderWidth: 3, borderColor: '#FFD700',
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 10, elevation: 6,
  },
  celebName: {
    fontFamily: Fonts.display, fontSize: 28, color: '#FFD700',
    letterSpacing: 2, marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  celebLabel: {
    fontFamily: Fonts.bodyBold, fontSize: 16, color: '#fff',
    letterSpacing: 3,
  },
  commentaryWrap: {
    position: 'absolute', top: 230, left: 0, right: 0,
    alignItems: 'center', zIndex: 25,
  },
  commentaryText: {
    fontFamily: Fonts.display, fontSize: 16, color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 16,
    overflow: 'hidden',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
