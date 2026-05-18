/**
 * Pre-records all static track elements into a single SkPicture.
 * One drawPicture() call replays ~200 shapes — zero React reconciliation.
 */
import { Skia, SkPicture, SkImage, SkPaint } from '@shopify/react-native-skia';
import { SkiaThemeSprites } from './skiaSprites';
import { drawThemeBackground } from './themeBackgrounds';

/** Matches computeTrackVisuals() output from race.tsx */
export interface TrackVisuals {
  segs: { left: number; top: number; width: number; deg: number; ey: number }[];
  /** Smooth path representation of each ramp in screen space. The renderer
   *  prefers strokes over per-segment rectangles for tracks with curvy
   *  geometry (Grand Prix), where rectangle seams looked jagged. */
  rampPaths?: { x: number; y: number }[][];
  obsVis: { cx: number; cy: number; size: number; type: string; ey: number }[];
  pegFunnels: {
    left: { x: number; y: number; w: number; deg: number };
    right: { x: number; y: number; w: number; deg: number };
    ey: number;
  }[];
  springVis: { left: number; top: number; width: number; height: number; ey: number }[];
  finishSY: number;
  ffLeft: { x: number; y: number; w: number; deg: number };
  ffRight: { x: number; y: number; w: number; deg: number };
  mfLeft: { x: number; y: number; w: number; deg: number };
  mfRight: { x: number; y: number; w: number; deg: number };
  miniFunnelSH: number;
  chanSX: number;
  chanEX: number;
  chanW: number;
  chanDepth: number;
  slotH: number;
  trampolineVis: { left: number; top: number; width: number; height: number; ey: number }[];
  speedBurstVis: { left: number; top: number; width: number; height: number; ey: number; direction: string }[];
  wallColor?: string;
}

function makePaint(color: string, style: 'fill' | 'stroke' = 'fill'): SkPaint {
  const p = Skia.Paint();
  p.setColor(Skia.Color(color));
  if (style === 'stroke') p.setStyle(1); // Stroke
  return p;
}

/** Scale helper — same as ex() in race.tsx */
type ExFn = (v: number) => number;

function drawRotatedRect(
  canvas: any, cx: number, cy: number, w: number, h: number,
  angleDeg: number, paint: SkPaint,
) {
  canvas.save();
  canvas.translate(cx + w / 2, cy + h / 2);
  canvas.rotate(angleDeg, 0, 0);
  canvas.drawRect(Skia.XYWHRect(-w / 2, -h / 2, w, h), paint);
  canvas.restore();
}

function drawRotatedImage(
  canvas: any, image: SkImage, cx: number, cy: number, w: number, h: number,
  angleDeg: number, paint: SkPaint,
) {
  const src = Skia.XYWHRect(0, 0, image.width(), image.height());
  const dst = Skia.XYWHRect(-w / 2, -h / 2, w, h);
  canvas.save();
  canvas.translate(cx + w / 2, cy + h / 2);
  canvas.rotate(angleDeg, 0, 0);
  canvas.drawImageRect(image, src, dst, paint);
  canvas.restore();
}

export interface ThemeElementColors {
  ramp: string;
  bumper: string;
  peg: string;
  spring: string;
  funnel: string;
}

export function createStaticTrackPicture(
  tv: TrackVisuals,
  sprites: SkiaThemeSprites,
  useSprites: boolean,
  RAMP_H: number,
  ex: ExFn,
  totalScreenW: number,
  totalScreenH: number,
  ENGINE_W: number,
  themeColors?: ThemeElementColors,
  themeId?: string,
  /** When true, skip baking the theme background scenery (clouds, mountains,
   *  trees, etc.) into the static picture. Used when a remote-config custom
   *  background image is rendered behind the canvas — without this, the
   *  baked scenery covered the custom image even after the explicit bg
   *  paint in RaceCanvas was already conditionally skipped. */
  hasCustomBg?: boolean,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(0, 0, totalScreenW, totalScreenH)
  );
  const defaultPaint = Skia.Paint();

  // Theme background scenery — drawn first so track elements overlay it.
  // All shapes baked into this picture, so the cost is paid once at race start.
  // Skipped entirely when the operator has set a custom per-track bg via
  // remote config; the RN <Image> behind the canvas shows through instead.
  if (themeId && !hasCustomBg) {
    drawThemeBackground(canvas, themeId, totalScreenW, totalScreenH);
  }

  // Theme-aware element colors (fall back to defaults if not provided)
  const tc = themeColors || { ramp: '#8B5E3C', bumper: '#e74c3c', peg: '#7f8c8d', spring: '#2ecc71', funnel: '#5a3a1a' };

  // === RAMP SEGMENTS ===
  // Two paths:
  //   1) Curvy ramps (>= 30 points, indicates an S-curve / Grand Prix track):
  //      stroke a smooth continuous Skia path through the points. No
  //      rectangle seams, no jagged stair-step look on tight curves.
  //   2) Straight / hand-crafted ramps (few points, sprite assets available):
  //      keep the per-segment rotated rect approach so sprite-tile art still
  //      lines up with each segment.
  const rampPaint = makePaint(tc.ramp);
  const wallColorPaint = tv.wallColor ? makePaint(tv.wallColor) : null;
  const useSmoothPath = !!tv.rampPaths && tv.rampPaths.some(p => p.length >= 30);

  if (useSmoothPath && !useSprites) {
    // Stroke each ramp's polyline. Thickness matches RAMP_H + a couple px
    // so the stroke visually reads the same as the per-segment rectangles
    // it replaces, but without joint artifacts.
    const strokePaint = wallColorPaint
      ? makePaint(tv.wallColor!, 'stroke')
      : makePaint(tc.ramp, 'stroke');
    strokePaint.setStrokeWidth(RAMP_H + 4);
    // Skia uses an integer enum for stroke join: 0=miter, 1=round, 2=bevel.
    if ((strokePaint as any).setStrokeJoin) (strokePaint as any).setStrokeJoin(1);
    if ((strokePaint as any).setStrokeCap)  (strokePaint as any).setStrokeCap(1);

    tv.rampPaths!.forEach(pts => {
      if (pts.length < 2) return;
      const path = Skia.Path.Make();
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
      canvas.drawPath(path, strokePaint);
    });
  } else {
    tv.segs.forEach(s => {
      if (wallColorPaint) {
        drawRotatedRect(canvas, s.left - 6, s.top - 2, s.width + 12, RAMP_H + 6, s.deg, wallColorPaint);
      } else if (useSprites && sprites.ramp) {
        drawRotatedImage(canvas, sprites.ramp, s.left - 6, s.top - 1, s.width + 12, RAMP_H + 2, s.deg, defaultPaint);
      } else {
        drawRotatedRect(canvas, s.left - 6, s.top - 1, s.width + 12, RAMP_H + 2, s.deg, rampPaint);
      }
    });
  }

  // === PEG ZONE FUNNELS ===
  const funnelPaint = makePaint(tc.funnel);
  const funnelH = ex(12);

  tv.pegFunnels.forEach(pf => {
    if (useSprites && sprites.funnel) {
      drawRotatedImage(canvas, sprites.funnel, pf.left.x - pf.left.w / 2, pf.left.y - funnelH / 2, pf.left.w, funnelH, pf.left.deg, defaultPaint);
      drawRotatedImage(canvas, sprites.funnel, pf.right.x - pf.right.w / 2, pf.right.y - funnelH / 2, pf.right.w, funnelH, pf.right.deg, defaultPaint);
    } else {
      drawRotatedRect(canvas, pf.left.x - pf.left.w / 2, pf.left.y - funnelH / 2, pf.left.w, funnelH, pf.left.deg, funnelPaint);
      drawRotatedRect(canvas, pf.right.x - pf.right.w / 2, pf.right.y - funnelH / 2, pf.right.w, funnelH, pf.right.deg, funnelPaint);
    }
  });

  // === BUMPERS & PEGS ===
  const bumperPaint = makePaint(tc.bumper);
  const pegPaint = makePaint(tc.peg);
  const shadowPaint = makePaint('rgba(0,0,0,0.25)');
  const shinePaint = makePaint('rgba(255,255,255,0.3)');

  tv.obsVis.forEach(o => {
    const r = o.size / 2;
    const isBumper = o.type === 'bumper';
    if (useSprites && (isBumper ? sprites.bumper : sprites.peg)) {
      // Shadow behind
      canvas.drawCircle(o.cx, o.cy, r + 1, shadowPaint);
      const img = isBumper ? sprites.bumper! : sprites.peg!;
      const src = Skia.XYWHRect(0, 0, img.width(), img.height());
      const dst = Skia.XYWHRect(o.cx - r, o.cy - r, o.size, o.size);
      canvas.drawImageRect(img, src, dst, defaultPaint);
    } else {
      canvas.drawCircle(o.cx, o.cy, r, isBumper ? bumperPaint : pegPaint);
      if (isBumper) {
        canvas.drawOval(Skia.XYWHRect(o.cx - r * 0.3, o.cy - r * 0.4, r * 0.8, r * 0.5), shinePaint);
      }
    }
  });

  // === SPRINGS ===
  const springPaint = makePaint(tc.spring);

  tv.springVis.forEach(sp => {
    if (useSprites && sprites.spring) {
      const src = Skia.XYWHRect(0, 0, sprites.spring.width(), sprites.spring.height());
      const dst = Skia.XYWHRect(sp.left, sp.top, sp.width, sp.height);
      canvas.drawImageRect(sprites.spring, src, dst, defaultPaint);
    } else {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(sp.left, sp.top, sp.width, sp.height), 3, 3), springPaint);
    }
  });

  // === TRAMPOLINES ===
  const trampPaint = makePaint('#e67e22');
  const trampHighlight = makePaint('rgba(255,255,255,0.4)');

  tv.trampolineVis.forEach(t => {
    if (useSprites && sprites.trampoline) {
      const src = Skia.XYWHRect(0, 0, sprites.trampoline.width(), sprites.trampoline.height());
      const dst = Skia.XYWHRect(t.left, t.top, t.width, t.height);
      canvas.drawImageRect(sprites.trampoline, src, dst, defaultPaint);
    } else {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(t.left, t.top, t.width, t.height), 4, 4), trampPaint);
      // Highlight bar
      canvas.drawRect(Skia.XYWHRect(t.left + 4, t.top + 2, t.width - 8, 2), trampHighlight);
    }
  });

  // === FINISH ZONE ===
  // "FINISH" text — use simple rectangles as a placeholder since font loading in Pictures is complex
  // The actual text will be rendered as a declarative Skia <Text> component on top

  // Checkered pattern
  const whitePaint = makePaint('#ffffff');
  const redPaint = makePaint('#e74c3c');
  const checkerLeft = ex(10);
  const checkerW = ex(ENGINE_W - 20);
  const checkerTop = tv.finishSY - ex(22);
  const checkerH = ex(16);
  const cellW = checkerW / 16;
  for (let ci = 0; ci < 16; ci++) {
    const p = ci % 2 === 0 ? whitePaint : redPaint;
    canvas.drawRect(Skia.XYWHRect(checkerLeft + ci * cellW, checkerTop, cellW, checkerH), p);
  }

  // Finish funnel walls
  if (useSprites && sprites.funnel) {
    drawRotatedImage(canvas, sprites.funnel, tv.ffLeft.x - tv.ffLeft.w / 2, tv.ffLeft.y - funnelH / 2, tv.ffLeft.w, funnelH, tv.ffLeft.deg, defaultPaint);
    drawRotatedImage(canvas, sprites.funnel, tv.ffRight.x - tv.ffRight.w / 2, tv.ffRight.y - funnelH / 2, tv.ffRight.w, funnelH, tv.ffRight.deg, defaultPaint);
  } else {
    drawRotatedRect(canvas, tv.ffLeft.x - tv.ffLeft.w / 2, tv.ffLeft.y - funnelH / 2, tv.ffLeft.w, funnelH, tv.ffLeft.deg, funnelPaint);
    drawRotatedRect(canvas, tv.ffRight.x - tv.ffRight.w / 2, tv.ffRight.y - funnelH / 2, tv.ffRight.w, funnelH, tv.ffRight.deg, funnelPaint);
  }

  // Mini-funnel bars
  const mfH = ex(10);
  if (useSprites && sprites.funnel) {
    drawRotatedImage(canvas, sprites.funnel, tv.mfLeft.x - tv.mfLeft.w / 2, tv.mfLeft.y - mfH / 2, tv.mfLeft.w, mfH, tv.mfLeft.deg, defaultPaint);
    drawRotatedImage(canvas, sprites.funnel, tv.mfRight.x - tv.mfRight.w / 2, tv.mfRight.y - mfH / 2, tv.mfRight.w, mfH, tv.mfRight.deg, defaultPaint);
  } else {
    drawRotatedRect(canvas, tv.mfLeft.x - tv.mfLeft.w / 2, tv.mfLeft.y - mfH / 2, tv.mfLeft.w, mfH, tv.mfLeft.deg, funnelPaint);
    drawRotatedRect(canvas, tv.mfRight.x - tv.mfRight.w / 2, tv.mfRight.y - mfH / 2, tv.mfRight.w, mfH, tv.mfRight.deg, funnelPaint);
  }

  // Channel walls
  const wallH = tv.chanDepth - tv.miniFunnelSH;
  const chanTop = tv.finishSY + tv.miniFunnelSH;
  if (useSprites && sprites.wall) {
    const wsrc = Skia.XYWHRect(0, 0, sprites.wall.width(), sprites.wall.height());
    canvas.drawImageRect(sprites.wall, wsrc, Skia.XYWHRect(tv.chanSX - ex(8), chanTop, ex(8), wallH), defaultPaint);
    canvas.drawImageRect(sprites.wall, wsrc, Skia.XYWHRect(tv.chanEX, chanTop, ex(8), wallH), defaultPaint);
  } else {
    canvas.drawRect(Skia.XYWHRect(tv.chanSX - ex(8), chanTop, ex(8), wallH), funnelPaint);
    canvas.drawRect(Skia.XYWHRect(tv.chanEX, chanTop, ex(8), wallH), funnelPaint);
  }

  // Channel floor
  if (useSprites && sprites.channel) {
    const csrc = Skia.XYWHRect(0, 0, sprites.channel.width(), sprites.channel.height());
    canvas.drawImageRect(sprites.channel, csrc, Skia.XYWHRect(tv.chanSX - ex(8), tv.finishSY + tv.chanDepth, tv.chanW + ex(16), ex(10)), defaultPaint);
  } else {
    canvas.drawRect(Skia.XYWHRect(tv.chanSX - ex(8), tv.finishSY + tv.chanDepth, tv.chanW + ex(16), ex(10)), funnelPaint);
  }

  // Channel depth background
  const depthPaint = makePaint('rgba(0,0,0,0.4)');
  canvas.drawRect(Skia.XYWHRect(tv.chanSX, chanTop, tv.chanW, wallH), depthPaint);

  // Position divider lines inside the channel — visual hint for slot boundaries.
  const dividerPaint = makePaint('rgba(255,255,255,0.15)');
  for (let pi = 1; pi < 8; pi++) {
    const lineY = tv.finishSY + tv.chanDepth - pi * tv.slotH;
    canvas.drawRect(Skia.XYWHRect(tv.chanSX, lineY, tv.chanW, 1), dividerPaint);
  }
  // NOTE: position numbers (1–8) and the "FINISH" label are rendered as plain
  // React Native <Text> overlays in app/race.tsx — see the Animated.View block
  // following the RaceCanvas. That bypasses Skia font issues on iOS and gives
  // crisp, readable digits. The Skia circle markers/text that used to live
  // here have been removed to prevent the doubled glyphs shown in TestFlight #?.

  return recorder.finishRecordingAsPicture();
}
