/**
 * Procedural theme backgrounds — drawn into the static track picture.
 *
 * Each theme has a recipe function that paints scenery (mountains, trees,
 * stars, etc.) into the canvas using Skia primitives. Drawn ONCE during
 * picture recording, then replayed every frame at near-zero cost.
 *
 * Coordinates are in screen pixels (the same space as the static track picture).
 * Scenery is drawn BEFORE track elements so ramps/bumpers/pegs overlay it.
 */
import { Skia, SkPaint } from '@shopify/react-native-skia';

// ---- helpers -------------------------------------------------------------

function paint(color: string, style: 'fill' | 'stroke' = 'fill', strokeWidth = 0): SkPaint {
  const p = Skia.Paint();
  p.setColor(Skia.Color(color));
  if (style === 'stroke') {
    p.setStyle(1);
    if (strokeWidth) p.setStrokeWidth(strokeWidth);
  }
  p.setAntiAlias(true);
  return p;
}

/** Seeded RNG so scenery layout is deterministic per theme. */
function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 13), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}

function seedFromTheme(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface DrawCtx {
  canvas: any;
  W: number;        // screen width in pixels
  H: number;        // total track height in pixels
  rng: () => number;
}

// ---- shared element helpers ---------------------------------------------

/** Triangle (used for mountains, trees, pyramids). */
function tri(c: any, x: number, y: number, w: number, h: number, p: SkPaint) {
  const path = Skia.Path.Make();
  path.moveTo(x, y);
  path.lineTo(x - w / 2, y + h);
  path.lineTo(x + w / 2, y + h);
  path.close();
  c.drawPath(path, p);
}

/** Conifer/pine tree (stacked triangles + trunk). */
function pineTree(c: any, x: number, y: number, h: number, leafCol: string, trunkCol: string) {
  const lp = paint(leafCol);
  const tp = paint(trunkCol);
  const w = h * 0.55;
  // 3 stacked triangles
  tri(c, x, y - h, w * 0.7, h * 0.4, lp);
  tri(c, x, y - h * 0.7, w * 0.85, h * 0.45, lp);
  tri(c, x, y - h * 0.4, w, h * 0.5, lp);
  // trunk
  c.drawRect(Skia.XYWHRect(x - w * 0.08, y - h * 0.05, w * 0.16, h * 0.12), tp);
}

/** Round-top deciduous tree (cloudy circle on a trunk). */
function bushTree(c: any, x: number, y: number, h: number, leafCol: string, trunkCol: string) {
  const r = h * 0.45;
  c.drawCircle(x - r * 0.5, y - h * 0.55, r * 0.7, paint(leafCol));
  c.drawCircle(x + r * 0.5, y - h * 0.55, r * 0.7, paint(leafCol));
  c.drawCircle(x, y - h * 0.85, r * 0.85, paint(leafCol));
  c.drawRect(Skia.XYWHRect(x - h * 0.06, y - h * 0.3, h * 0.12, h * 0.3), paint(trunkCol));
}

/** Cloud (cluster of overlapping circles). */
function cloud(c: any, x: number, y: number, scale: number, color: string) {
  const p = paint(color);
  c.drawCircle(x - scale * 0.8, y, scale * 0.7, p);
  c.drawCircle(x + scale * 0.8, y, scale * 0.7, p);
  c.drawCircle(x, y - scale * 0.4, scale, p);
  c.drawCircle(x - scale * 0.3, y + scale * 0.1, scale * 0.6, p);
  c.drawCircle(x + scale * 0.4, y + scale * 0.1, scale * 0.6, p);
}

/** Star — small 4-point asterisk. */
function star(c: any, x: number, y: number, size: number, color: string) {
  const p = paint(color);
  c.drawCircle(x, y, size * 0.35, p);
  c.drawRect(Skia.XYWHRect(x - size, y - size * 0.12, size * 2, size * 0.24), p);
  c.drawRect(Skia.XYWHRect(x - size * 0.12, y - size, size * 0.24, size * 2), p);
}

/** Mountain silhouette across a band. */
function mountainBand(c: any, yBase: number, bandH: number, color: string, count: number, W: number, rng: () => number, jagged = false) {
  const p = paint(color);
  const path = Skia.Path.Make();
  path.moveTo(-10, yBase + bandH);
  const stepW = (W + 20) / count;
  for (let i = 0; i <= count; i++) {
    const x = -10 + i * stepW + (rng() - 0.5) * stepW * 0.2;
    const h = bandH * (0.45 + rng() * 0.55);
    if (jagged) {
      // pointed peaks
      path.lineTo(x - stepW * 0.3, yBase + bandH - h * 0.6);
      path.lineTo(x, yBase + bandH - h);
      path.lineTo(x + stepW * 0.3, yBase + bandH - h * 0.6);
    } else {
      // rounded
      path.lineTo(x - stepW * 0.5, yBase + bandH - h);
      path.lineTo(x + stepW * 0.5, yBase + bandH - h);
    }
  }
  path.lineTo(W + 10, yBase + bandH);
  path.close();
  c.drawPath(path, p);
}

// ---- 14 theme recipes ----------------------------------------------------

function drawGrass({ canvas, W, H, rng }: DrawCtx) {
  // Soft clouds drifting throughout
  for (let i = 0; i < Math.ceil(H / 380); i++) {
    cloud(canvas, rng() * W, rng() * H, 18 + rng() * 12, 'rgba(255,255,255,0.65)');
  }
  // Hill bands at vertical intervals
  for (let i = 0; i < Math.ceil(H / 900); i++) {
    const y = i * 900 + 200 + rng() * 200;
    mountainBand(canvas, y, 90, 'rgba(56,142,60,0.35)', 3, W, rng);
    mountainBand(canvas, y + 30, 60, 'rgba(76,175,80,0.45)', 4, W, rng);
  }
  // Trees at random track edges
  for (let i = 0; i < Math.ceil(H / 280); i++) {
    const x = rng() < 0.5 ? rng() * 30 : W - rng() * 30;
    const y = rng() * H;
    if (rng() < 0.5) pineTree(canvas, x, y, 50 + rng() * 25, '#388e3c', '#5d4037');
    else bushTree(canvas, x, y, 45 + rng() * 20, '#66bb6a', '#5d4037');
  }
}

function drawLava({ canvas, W, H, rng }: DrawCtx) {
  // Dark mountain silhouettes
  for (let i = 0; i < Math.ceil(H / 700); i++) {
    const y = i * 700 + 100;
    mountainBand(canvas, y, 110, 'rgba(20,5,5,0.7)', 3, W, rng, true);
  }
  // Glowing lava cracks (jagged orange lines)
  for (let i = 0; i < Math.ceil(H / 220); i++) {
    const y = rng() * H;
    const x = rng() < 0.5 ? rng() * 35 : W - rng() * 35;
    const p = paint('rgba(255,140,30,0.7)', 'stroke', 2.5);
    const path = Skia.Path.Make();
    path.moveTo(x, y);
    path.lineTo(x + (rng() - 0.5) * 20, y + 15 + rng() * 10);
    path.lineTo(x + (rng() - 0.5) * 30, y + 35 + rng() * 12);
    canvas.drawPath(path, p);
  }
  // Glowing embers
  for (let i = 0; i < Math.ceil(H / 90); i++) {
    canvas.drawCircle(rng() * W, rng() * H, 1.5 + rng() * 1.5, paint('rgba(255,180,50,0.8)'));
  }
}

function drawIce({ canvas, W, H, rng }: DrawCtx) {
  // Aurora ribbons (translucent curves)
  for (let i = 0; i < Math.ceil(H / 800); i++) {
    const y = i * 800 + 100;
    const p = paint('rgba(120,220,200,0.25)', 'stroke', 28);
    const path = Skia.Path.Make();
    path.moveTo(-20, y);
    path.cubicTo(W * 0.3, y - 60, W * 0.7, y + 60, W + 20, y - 30);
    canvas.drawPath(path, p);
  }
  // Snow peaks
  for (let i = 0; i < Math.ceil(H / 700); i++) {
    const y = i * 700 + 250;
    mountainBand(canvas, y, 100, 'rgba(180,220,240,0.55)', 3, W, rng, true);
    // Snow caps
    mountainBand(canvas, y + 5, 35, 'rgba(255,255,255,0.85)', 3, W, rng, true);
  }
  // Snowflakes
  for (let i = 0; i < Math.ceil(H / 70); i++) {
    star(canvas, rng() * W, rng() * H, 2 + rng() * 2, 'rgba(255,255,255,0.8)');
  }
}

function drawCyber({ canvas, W, H, rng }: DrawCtx) {
  // Vertical neon bars at edges
  for (let i = 0; i < Math.ceil(H / 320); i++) {
    const y = i * 320;
    canvas.drawRect(Skia.XYWHRect(4, y, 3, 160), paint('rgba(0,255,255,0.6)'));
    canvas.drawRect(Skia.XYWHRect(W - 7, y + 80, 3, 160), paint('rgba(255,0,255,0.6)'));
  }
  // Faded horizontal grid lines
  for (let i = 0; i < Math.ceil(H / 90); i++) {
    canvas.drawRect(Skia.XYWHRect(0, i * 90, W, 1), paint('rgba(100,200,255,0.18)'));
  }
  // Circuit dots
  for (let i = 0; i < Math.ceil(H / 80); i++) {
    canvas.drawCircle(rng() * W, rng() * H, 1.8, paint('rgba(255,255,255,0.6)'));
  }
}

function drawBeach({ canvas, W, H, rng }: DrawCtx) {
  // Sun discs at intervals
  for (let i = 0; i < Math.ceil(H / 1200); i++) {
    const y = i * 1200 + 120;
    canvas.drawCircle(W * 0.8, y, 40, paint('rgba(255,220,120,0.45)'));
    canvas.drawCircle(W * 0.8, y, 28, paint('rgba(255,235,160,0.7)'));
  }
  // Palm tree silhouettes
  for (let i = 0; i < Math.ceil(H / 360); i++) {
    const x = rng() < 0.5 ? 18 + rng() * 8 : W - 18 - rng() * 8;
    const y = rng() * H;
    const trunkH = 45 + rng() * 15;
    canvas.drawRect(Skia.XYWHRect(x - 2, y - trunkH, 4, trunkH), paint('rgba(70,40,20,0.85)'));
    // Palm fronds
    for (let f = 0; f < 5; f++) {
      const ang = (f / 5) * Math.PI - Math.PI / 2;
      const fx = x + Math.cos(ang) * 22;
      const fy = y - trunkH + Math.sin(ang) * 15;
      const p = paint('rgba(45,120,40,0.85)', 'stroke', 3);
      const path = Skia.Path.Make();
      path.moveTo(x, y - trunkH);
      path.quadTo((x + fx) / 2, (y - trunkH + fy) / 2 - 4, fx, fy);
      canvas.drawPath(path, p);
    }
  }
}

function drawForest({ canvas, W, H, rng }: DrawCtx) {
  // Layered tree silhouettes — back layer
  for (let i = 0; i < Math.ceil(H / 200); i++) {
    const x = rng() * W;
    const y = rng() * H;
    pineTree(canvas, x, y, 60 + rng() * 30, 'rgba(30,80,30,0.45)', 'rgba(50,30,15,0.5)');
  }
  // Front layer at edges
  for (let i = 0; i < Math.ceil(H / 260); i++) {
    const x = rng() < 0.5 ? rng() * 28 : W - rng() * 28;
    const y = rng() * H;
    pineTree(canvas, x, y, 70 + rng() * 30, '#1b5e20', '#3e2723');
  }
  // Fireflies
  for (let i = 0; i < Math.ceil(H / 110); i++) {
    canvas.drawCircle(rng() * W, rng() * H, 2 + rng() * 1.5, paint('rgba(255,235,120,0.85)'));
  }
}

function drawDesert({ canvas, W, H, rng }: DrawCtx) {
  // Distant pyramids
  for (let i = 0; i < Math.ceil(H / 900); i++) {
    const y = i * 900 + 300;
    tri(canvas, W * 0.25, y, 100, 80, paint('rgba(180,140,80,0.45)'));
    tri(canvas, W * 0.7, y + 20, 80, 65, paint('rgba(180,140,80,0.55)'));
  }
  // Sand dunes
  for (let i = 0; i < Math.ceil(H / 700); i++) {
    const y = i * 700 + 100;
    mountainBand(canvas, y, 75, 'rgba(220,180,110,0.35)', 3, W, rng);
    mountainBand(canvas, y + 40, 55, 'rgba(230,195,130,0.5)', 4, W, rng);
  }
  // Cacti
  for (let i = 0; i < Math.ceil(H / 320); i++) {
    const x = rng() < 0.5 ? 14 + rng() * 12 : W - 14 - rng() * 12;
    const y = rng() * H;
    const h = 30 + rng() * 15;
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x - 4, y - h, 8, h), 3, 3), paint('rgba(60,130,55,0.85)'));
    if (rng() < 0.5) {
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + 3, y - h * 0.7, 8, h * 0.4), 3, 3), paint('rgba(60,130,55,0.85)'));
    }
  }
}

function drawSunset({ canvas, W, H, rng }: DrawCtx) {
  // Big sun discs
  for (let i = 0; i < Math.ceil(H / 1400); i++) {
    const y = i * 1400 + 180;
    canvas.drawCircle(W / 2, y, 60, paint('rgba(255,160,80,0.35)'));
    canvas.drawCircle(W / 2, y, 42, paint('rgba(255,200,120,0.55)'));
  }
  // Layered horizon hills (purple → orange feel)
  for (let i = 0; i < Math.ceil(H / 800); i++) {
    const y = i * 800 + 280;
    mountainBand(canvas, y, 80, 'rgba(80,30,80,0.55)', 3, W, rng);
    mountainBand(canvas, y + 35, 55, 'rgba(180,60,90,0.55)', 4, W, rng);
  }
  // Birds in flight (V-shapes)
  for (let i = 0; i < Math.ceil(H / 350); i++) {
    const x = rng() * W;
    const y = rng() * H;
    const p = paint('rgba(40,20,30,0.7)', 'stroke', 1.6);
    const path = Skia.Path.Make();
    path.moveTo(x - 6, y + 3);
    path.lineTo(x, y);
    path.lineTo(x + 6, y + 3);
    canvas.drawPath(path, p);
  }
}

function drawNight({ canvas, W, H, rng }: DrawCtx) {
  // Many stars throughout
  for (let i = 0; i < Math.ceil(H / 22); i++) {
    const x = rng() * W;
    const y = rng() * H;
    const s = 1 + rng() * 2;
    canvas.drawCircle(x, y, s, paint(rng() < 0.15 ? 'rgba(255,255,180,0.95)' : 'rgba(255,255,255,0.85)'));
  }
  // Crescent moon — once per ~viewport
  for (let i = 0; i < Math.ceil(H / 1800); i++) {
    const cx = W * 0.78, cy = i * 1800 + 220;
    canvas.drawCircle(cx, cy, 26, paint('rgba(245,240,210,0.92)'));
    canvas.drawCircle(cx + 9, cy - 5, 24, paint('rgba(15,15,40,1)'));
  }
  // Dark hill silhouettes
  for (let i = 0; i < Math.ceil(H / 900); i++) {
    mountainBand(canvas, i * 900 + 500, 80, 'rgba(8,10,28,0.85)', 3, W, rng);
  }
}

function drawCandy({ canvas, W, H, rng }: DrawCtx) {
  // Pink hills
  for (let i = 0; i < Math.ceil(H / 750); i++) {
    const y = i * 750 + 200;
    mountainBand(canvas, y, 70, 'rgba(255,180,220,0.5)', 3, W, rng);
    mountainBand(canvas, y + 30, 50, 'rgba(255,210,230,0.65)', 4, W, rng);
  }
  // Lollipops
  for (let i = 0; i < Math.ceil(H / 320); i++) {
    const x = rng() < 0.5 ? 18 + rng() * 10 : W - 18 - rng() * 10;
    const y = rng() * H;
    canvas.drawRect(Skia.XYWHRect(x - 1, y - 30, 2, 30), paint('rgba(255,255,255,0.85)'));
    const cols = ['#ff4081', '#ffeb3b', '#4caf50', '#ff9800', '#e91e63'];
    canvas.drawCircle(x, y - 36, 10, paint(cols[Math.floor(rng() * cols.length)]));
    canvas.drawCircle(x - 3, y - 38, 3, paint('rgba(255,255,255,0.6)'));
  }
  // Sparkles
  for (let i = 0; i < Math.ceil(H / 110); i++) {
    star(canvas, rng() * W, rng() * H, 2 + rng() * 2, 'rgba(255,255,255,0.85)');
  }
}

function drawOcean({ canvas, W, H, rng }: DrawCtx) {
  // Wave silhouettes
  for (let i = 0; i < Math.ceil(H / 220); i++) {
    const y = i * 220 + rng() * 40;
    const p = paint('rgba(255,255,255,0.18)', 'stroke', 2);
    const path = Skia.Path.Make();
    path.moveTo(-10, y);
    for (let x = 0; x <= W + 10; x += 32) {
      path.quadTo(x + 16, y - 10, x + 32, y);
    }
    canvas.drawPath(path, p);
  }
  // Bubbles
  for (let i = 0; i < Math.ceil(H / 60); i++) {
    const r = 2 + rng() * 4;
    canvas.drawCircle(rng() * W, rng() * H, r, paint('rgba(220,240,255,0.45)'));
  }
  // Far horizon: distant lighthouse
  for (let i = 0; i < Math.ceil(H / 1800); i++) {
    const x = W * 0.85, y = i * 1800 + 400;
    canvas.drawRect(Skia.XYWHRect(x - 4, y - 50, 8, 50), paint('rgba(255,255,255,0.6)'));
    canvas.drawRect(Skia.XYWHRect(x - 6, y - 60, 12, 10), paint('rgba(244,67,54,0.7)'));
    canvas.drawCircle(x, y - 55, 3, paint('rgba(255,235,120,0.95)'));
  }
}

function drawVolcanic({ canvas, W, H, rng }: DrawCtx) {
  // Black jagged mountains
  for (let i = 0; i < Math.ceil(H / 750); i++) {
    mountainBand(canvas, i * 750 + 200, 120, 'rgba(15,5,5,0.85)', 3, W, rng, true);
  }
  // Smoke columns rising
  for (let i = 0; i < Math.ceil(H / 600); i++) {
    const x = rng() < 0.5 ? 30 + rng() * 20 : W - 30 - rng() * 20;
    const y = i * 600 + 250;
    for (let s = 0; s < 4; s++) {
      canvas.drawCircle(x + (rng() - 0.5) * 12, y - s * 18, 14 + s * 4, paint(`rgba(80,70,70,${0.5 - s * 0.1})`));
    }
  }
  // Glowing embers
  for (let i = 0; i < Math.ceil(H / 50); i++) {
    canvas.drawCircle(rng() * W, rng() * H, 1.5 + rng() * 1.5, paint('rgba(255,120,40,0.85)'));
  }
  // Lava cracks on edges
  for (let i = 0; i < Math.ceil(H / 260); i++) {
    const x = rng() < 0.5 ? rng() * 24 : W - rng() * 24;
    const y = rng() * H;
    const p = paint('rgba(255,80,20,0.7)', 'stroke', 2);
    const path = Skia.Path.Make();
    path.moveTo(x, y);
    path.lineTo(x + (rng() - 0.5) * 15, y + 15);
    path.lineTo(x + (rng() - 0.5) * 20, y + 28);
    canvas.drawPath(path, p);
  }
}

function drawNeon({ canvas, W, H, rng }: DrawCtx) {
  // Big neon vertical strips on both sides
  for (let i = 0; i < Math.ceil(H / 200); i++) {
    const y = i * 200 + rng() * 50;
    canvas.drawRect(Skia.XYWHRect(3, y, 2, 110), paint('rgba(255,30,200,0.85)'));
    canvas.drawRect(Skia.XYWHRect(W - 5, y + 40, 2, 110), paint('rgba(30,255,200,0.85)'));
  }
  // Perspective grid lines (horizontal, fading)
  for (let i = 0; i < Math.ceil(H / 70); i++) {
    const a = 0.15 + (i % 4) * 0.05;
    canvas.drawRect(Skia.XYWHRect(0, i * 70, W, 1), paint(`rgba(200,50,255,${a})`));
  }
  // Pulse glow circles
  for (let i = 0; i < Math.ceil(H / 380); i++) {
    const x = rng() * W, y = rng() * H;
    canvas.drawCircle(x, y, 22, paint('rgba(255,50,255,0.2)'));
    canvas.drawCircle(x, y, 10, paint('rgba(255,50,255,0.4)'));
  }
}

function drawSnow({ canvas, W, H, rng }: DrawCtx) {
  // Snow drifts (white curves along bottom of viewport bands)
  for (let i = 0; i < Math.ceil(H / 800); i++) {
    const y = i * 800 + 350;
    mountainBand(canvas, y, 60, 'rgba(255,255,255,0.85)', 3, W, rng);
  }
  // Pine trees with snow caps
  for (let i = 0; i < Math.ceil(H / 260); i++) {
    const x = rng() < 0.5 ? rng() * 30 : W - rng() * 30;
    const y = rng() * H;
    const h = 55 + rng() * 25;
    pineTree(canvas, x, y, h, '#2e5a2e', '#3e2723');
    // White cap on top
    tri(canvas, x, y - h - 2, h * 0.4, h * 0.15, paint('rgba(255,255,255,0.95)'));
  }
  // Falling snowflakes
  for (let i = 0; i < Math.ceil(H / 35); i++) {
    canvas.drawCircle(rng() * W, rng() * H, 1.5 + rng() * 1.5, paint('rgba(255,255,255,0.9)'));
  }
}

// ---- registry + entry point ---------------------------------------------

type Recipe = (ctx: DrawCtx) => void;

const RECIPES: Record<string, Recipe> = {
  grass: drawGrass,
  lava: drawLava,
  ice: drawIce,
  cyber: drawCyber,
  beach: drawBeach,
  forest: drawForest,
  desert: drawDesert,
  sunset: drawSunset,
  night: drawNight,
  candy: drawCandy,
  ocean: drawOcean,
  volcanic: drawVolcanic,
  neon: drawNeon,
  snow: drawSnow,
};

/**
 * Paint the theme-specific scenery onto the canvas. Call this BEFORE drawing
 * track elements so ramps/bumpers/pegs naturally overlay the scenery.
 *
 * Layout is deterministic per theme (seeded RNG), so the same race looks the
 * same every time, but each theme has a distinct visual identity.
 */
export function drawThemeBackground(
  canvas: any,
  themeId: string,
  screenW: number,
  totalH: number,
): void {
  const recipe = RECIPES[themeId];
  if (!recipe) return; // unknown theme — leave background untouched
  const rng = seededRng(seedFromTheme(themeId));
  recipe({ canvas, W: screenW, H: totalH, rng });
}
