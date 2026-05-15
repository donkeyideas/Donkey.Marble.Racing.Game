import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, MarbleData, MARBLES } from '../theme';
import { getSkinnedMarble } from '../data/skins';
import { useGameStore } from '../state/gameStore';
import { createRaceEngine, RaceState, PendulumState, BallPitBallState, TrampolineState, SpeedBurstState } from '../engine/race';
import { buildTrack, TrackConfig } from '../engine/tracks';
import { ALL_COURSES as COURSES } from '../data/courses';
import { getBgSprite, getThemeSprites, ThemeSprites, THEME_OVERLAYS } from '../assets/kenney/spriteMap';

/** Toggle to fall back to solid-color View rendering (pre-sprite) */
const USE_SPRITE_RENDERING = true;

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
  track.ramps.forEach(ramp => {
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
    top: ex(sb.y) - ex(6),
    width: ex(sb.width),
    height: ex(12),
    ey: sb.y,
    direction: sb.direction,
  }));

  return {
    segs, obsVis, pegFunnels, springVis,
    finishSY, ffLeft, ffRight,
    mfLeft, mfRight, miniFunnelSH,
    chanSX, chanEX,
    chanW: chanEX - chanSX,
    chanDepth: ex(track.channelDepth),
    slotH: ex(26),
    trampolineVis,
    speedBurstVis,
  };
}

// Static track elements — rendered once, never re-rendered during race
// React.memo prevents React from diffing 100+ unchanged elements every frame
const StaticTrackElements = React.memo(function StaticTrackElements({
  tv, themeSprites, trackConfig,
}: {
  tv: ReturnType<typeof computeTrackVisuals>;
  themeSprites: ThemeSprites;
  trackConfig: TrackConfig;
}) {
  return (
    <>
      {/* Ramp segments */}
      {tv.segs.map((s, i) => USE_SPRITE_RENDERING ? (
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
      ))}

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

      {/* Finish zone */}
      <Text style={{
        position: 'absolute', left: 0, right: 0, top: tv.finishSY - ex(42),
        fontFamily: Fonts.display, fontSize: 18, color: '#000',
        letterSpacing: 4, textAlign: 'center', zIndex: 12,
        textShadowColor: 'rgba(255,255,255,0.7)', textShadowOffset: { width: 0, height: 1 },
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
  pos: { data: MarbleData; x: number; y: number; finished: boolean }[];
  elapsed: number;
  camY: number;
  wm: { x: number; y: number; angle: number; width: number }[];
  pendulums: PendulumState[];
  ballPitBalls: BallPitBallState[];
  cradles: PendulumState[];
  trampolines: TrampolineState[];
  speedBursts: SpeedBurstState[];
  doomsdayBar: { y: number; active: boolean } | null;
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

  const [frame, setFrame] = useState<FrameState>({
    pos: [], elapsed: 0, camY: 0, wm: [],
    pendulums: [], ballPitBalls: [], cradles: [], trampolines: [], speedBursts: [],
    doomsdayBar: null,
  });
  const [countdown, setCountdown] = useState(3);
  const [raceOver, setRaceOver] = useState(false);
  const [firstFinisher, setFirstFinisher] = useState<{ name: string; color: string } | null>(null);
  const firstAnim = useRef(new Animated.Value(0)).current;
  const firstFinishShown = useRef(false);

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
      if (playerPlacement === 1) payout = betAmount + Math.round(betAmount * playerOdds);
      else if (playerPlacement === 2) payout = betAmount + Math.round(betAmount * 0.5);
      else if (playerPlacement === 3) payout = betAmount + Math.round(betAmount * 0.25);
      won = playerPlacement >= 1 && playerPlacement <= 3;
    }

    setLastResult({ positions: p, playerPick: selectedMarble, betAmount, won, payout, playerPlacement });
    // Payout is now atomic inside setLastResult — no separate addCoins call needed
    setRaceOver(true);
    setTimeout(() => router.replace('/results'), 800);
  }, [selectedMarble, betAmount, setLastResult, addCoins, getOdds, router, activeMode]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Release gate when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && engRef.current) {
      engRef.current.releaseGate();
    }
  }, [countdown]);

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
    }

    // Apply equipped skins to marble colors
    const equippedSkins = useGameStore.getState().equippedSkins;
    if (raceMarbles) {
      raceMarbles = raceMarbles.map(m => getSkinnedMarble(m, equippedSkins));
    }

    const eng = createRaceEngine(trackConfig, raceMarbles ? raceMarbles : MARBLES.map(m => getSkinnedMarble(m, equippedSkins)));
    engRef.current = eng;
    let last = performance.now();
    const totalH = trackConfig.totalHeight;
    const loop = (t: number) => {
      const dt = Math.min(t - last, 50); // cap at 50ms — allows physics catch-up on slow frames
      last = t;
      const st: RaceState = eng.step(dt);

      let leaderY = 0;
      for (let i = 0; i < st.marbles.length; i++) {
        if (st.marbles[i].y > leaderY) leaderY = st.marbles[i].y;
      }
      // When doomsday bar is active, camera follows the bar so the user can see it sweeping
      if (st.doomsdayBar && st.doomsdayBar.active) {
        leaderY = st.doomsdayBar.y;
      }
      const maxCam = totalH - SH / SCALE;
      const target = Math.min(maxCam, Math.max(0, leaderY - SH * 0.35 / SCALE));
      // Frame-rate independent smoothing — gentle follow for natural feel
      const smoothing = 1 - Math.pow(0.001, dt / 1000);
      camRef.current += (target - camRef.current) * smoothing;
      // Update camera via Animated — bypasses React reconciliation for silky scrolling
      camAnimY.setValue(-camRef.current * SCALE);

      // Detect first marble to finish — trigger celebration (runs at full RAF rate)
      if (!firstFinishShown.current) {
        const winner = st.marbles.find(m => m.finished);
        if (winner) {
          firstFinishShown.current = true;
          setFirstFinisher({ name: winner.data.name, color: winner.data.colorLight });
          Animated.sequence([
            Animated.spring(firstAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
            Animated.delay(1800),
            Animated.timing(firstAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
          ]).start();
        }
      }

      // Throttle React state updates to ~60fps — physics runs independently
      if (st.isFinished || t - lastRenderRef.current >= 16) {
        lastRenderRef.current = t;
        const marblePos = st.marbles.map(m => ({ data: m.data, x: m.x, y: m.y, finished: m.finished }));
        setFrame({
          pos: marblePos,
          elapsed: st.elapsed,
          camY: camRef.current,
          wm: st.windmills,
          pendulums: st.pendulums,
          ballPitBalls: st.ballPitBalls,
          cradles: st.cradles,
          trampolines: st.trampolines,
          speedBursts: st.speedBursts,
          doomsdayBar: st.doomsdayBar,
        });
      }
      if (st.isFinished && !doneRef.current) { handleEnd(); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); eng.destroy(); };
  }, [handleEnd, trackConfig]);

  const { pos, elapsed, camY, wm, pendulums, ballPitBalls, cradles } = frame;
  const vBuf = SH / SCALE * 0.7;
  const vMin = camY - vBuf, vMax = camY + SH / SCALE + vBuf;
  const vis = (y: number) => y > vMin && y < vMax;
  const sorted = [...pos].sort((a, b) => b.y - a.y).slice(0, 5);
  const courseName = COURSES.find(c => c.id === selectedCourseId)?.name || 'RACE';

  const bgSprite = useMemo(() => getBgSprite(trackConfig.bgImage), [trackConfig]);
  const themeSprites = useMemo(() => getThemeSprites(trackConfig.bgImage), [trackConfig]);
  const themeOverlay = THEME_OVERLAYS[trackConfig.bgImage] || null;

  return (
    <View style={st.container}>
      <Image source={bgSprite} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {themeOverlay && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: themeOverlay }]} />
      )}

      <View style={st.clip}>
        <Animated.View style={{ transform: [{ translateY: camAnimY }] }}>
          <StaticTrackElements tv={tv} themeSprites={themeSprites} trackConfig={trackConfig} />

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
            const isActive = frame.speedBursts[i]?.active || false;
            const arrow = sb.direction === 'left' ? '\u25C0' : sb.direction === 'down' ? '\u25BC' : '\u25B6';
            return USE_SPRITE_RENDERING ? (
              <View key={`sb${i}`} style={{
                position: 'absolute', left: sb.left, top: sb.top,
                width: sb.width, height: sb.height,
                zIndex: 6, opacity: isActive ? 1 : 0.85,
                flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
              }}>
                {[0, 1, 2].map(ci => (
                  <Image key={ci} source={themeSprites.speedburst} resizeMode="contain" style={{
                    width: sb.height - 2, height: sb.height - 2,
                    opacity: isActive ? 1 : 0.7,
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
          {frame.doomsdayBar && frame.doomsdayBar.active && (
            <View style={{
              position: 'absolute',
              left: 0,
              top: ex(frame.doomsdayBar.y) - ex(10),
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
      </View>

      {/* HUD */}
      <View style={st.hud}>
        <View style={st.hudStandings}>
          {sorted.map((m, i) => {
            const isPick = selectedMarble?.id === m.data.id;
            return (
              <View key={m.data.id} style={[st.posRow, isPick && st.posRowPick]}>
                <Text style={[st.posNum, isPick && st.posNumPick]}>{i + 1}</Text>
                <View style={[st.posDot, { backgroundColor: m.data.colorLight }]} />
                <Text style={[st.posName, isPick && st.posNamePick]}>{m.data.name}</Text>
                {isPick && <Text style={st.pickTag}>YOU</Text>}
              </View>
            );
          })}
        </View>
        <View style={st.hudTimer}>
          <Text style={st.seasonTag}>{courseName.toUpperCase()}</Text>
          <Text style={st.timer}>{(elapsed / 1000).toFixed(1)}s</Text>
          {frame.doomsdayBar && (
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
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  hudTimer: {
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10,
    paddingVertical: 6, paddingHorizontal: 10, alignItems: 'flex-end',
  },
  seasonTag: {
    fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.yellow,
    letterSpacing: 1, marginBottom: 2,
  },
  posRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, paddingVertical: 2, paddingHorizontal: 4, borderRadius: 6 },
  posRowPick: { backgroundColor: 'rgba(255,194,32,0.3)' },
  posNum: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.6)', width: 14 },
  posNumPick: { color: Colors.yellow },
  posDot: { width: 12, height: 12, borderRadius: 6 },
  posName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: '#fff' },
  posNamePick: { fontFamily: Fonts.bodyBold, color: Colors.yellow },
  pickTag: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.yellow, marginLeft: 4 },
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
});
