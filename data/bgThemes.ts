/**
 * Background theme definitions for all visual themes.
 * New themes use Skia gradients; legacy themes (grass/lava/ice/cyber) also have PNG fallbacks.
 * Each theme maps to an existing sprite material (wood/stone/glass/metal).
 */

export interface BgThemeDef {
  /** Gradient colors [top, bottom] for Skia LinearGradient */
  gradient: [string, string];
  /** Semi-transparent overlay tint (null = none) */
  overlay: string | null;
  /** Container background color (behind canvas) */
  containerBg: string;
  /** Which sprite material to use: maps to existing Kenney sprite sets */
  spriteMaterial: 'wood' | 'stone' | 'glass' | 'metal';
  /** Course gradient colors for UI cards [dark, light] */
  courseGradient: [string, string];
  /** Display color for theme pills/badges */
  themeColor: string;
  /** Maps to stat growth system */
  statKey: 'speed' | 'power' | 'bounce' | 'luck';
  /** Track element colors — must contrast against the background gradient */
  elements: {
    ramp: string;     // Ramp/wall surfaces
    bumper: string;   // Bumper circles
    peg: string;      // Peg circles
    spring: string;   // Spring pads
    funnel: string;   // Funnel/channel walls
  };
}

// All 14 background themes
export const BG_THEMES: Record<string, BgThemeDef> = {
  // ── Legacy themes (have PNG backgrounds + sprites) ──
  grass: {
    gradient: ['#2a5a1a', '#1a4a1a'],
    overlay: null,
    containerBg: '#2a5a1a',
    spriteMaterial: 'wood',
    courseGradient: ['#1a4a1a', '#3a8a3a'],
    themeColor: '#2ecc71',
    statKey: 'speed',
    elements: { ramp: '#8B5E3C', bumper: '#e74c3c', peg: '#aaaaaa', spring: '#f1c40f', funnel: '#654321' },
  },
  lava: {
    gradient: ['#4a1008', '#3a0a0a'],
    overlay: 'rgba(180, 40, 20, 0.15)',
    containerBg: '#3a1008',
    spriteMaterial: 'stone',
    courseGradient: ['#5a1a0a', '#c44000'],
    themeColor: '#e74c3c',
    statKey: 'power',
    elements: { ramp: '#c0c0c0', bumper: '#f1c40f', peg: '#aaaaaa', spring: '#2ecc71', funnel: '#888888' },
  },
  ice: {
    gradient: ['#0a2a4a', '#0a1a3a'],
    overlay: 'rgba(100, 180, 255, 0.12)',
    containerBg: '#0a1a3a',
    spriteMaterial: 'glass',
    courseGradient: ['#0a2a4a', '#4a9aca'],
    themeColor: '#3498db',
    statKey: 'bounce',
    elements: { ramp: '#d0d0d0', bumper: '#e74c3c', peg: '#bbbbbb', spring: '#2ecc71', funnel: '#8899aa' },
  },
  cyber: {
    gradient: ['#1a0a2e', '#0a0a1a'],
    overlay: 'rgba(120, 50, 180, 0.18)',
    containerBg: '#1a0a2e',
    spriteMaterial: 'metal',
    courseGradient: ['#2a0a4a', '#9b59b6'],
    themeColor: '#9b59b6',
    statKey: 'luck',
    elements: { ramp: '#00d4ff', bumper: '#e74c3c', peg: '#999999', spring: '#2ecc71', funnel: '#6a4a8a' },
  },

  // ── New gradient-only themes ──
  beach: {
    gradient: ['#87CEEB', '#c2b280'],
    overlay: 'rgba(255, 200, 100, 0.10)',
    containerBg: '#6a9ab0',
    spriteMaterial: 'wood',
    courseGradient: ['#4a90d9', '#c2b280'],
    themeColor: '#f0c040',
    statKey: 'speed',
    elements: { ramp: '#5a3520', bumper: '#c0392b', peg: '#555555', spring: '#27ae60', funnel: '#3a2510' },
  },
  forest: {
    gradient: ['#0a2a0a', '#1a4a1a'],
    overlay: 'rgba(30, 120, 30, 0.12)',
    containerBg: '#0a2a0a',
    spriteMaterial: 'wood',
    courseGradient: ['#0a3a0a', '#2d5a2d'],
    themeColor: '#1a8a1a',
    statKey: 'speed',
    elements: { ramp: '#8B5E3C', bumper: '#e74c3c', peg: '#aaaaaa', spring: '#f1c40f', funnel: '#654321' },
  },
  desert: {
    gradient: ['#c2a050', '#8b6914'],
    overlay: 'rgba(200, 160, 60, 0.10)',
    containerBg: '#8b6914',
    spriteMaterial: 'stone',
    courseGradient: ['#a08030', '#d4a840'],
    themeColor: '#d4a840',
    statKey: 'power',
    elements: { ramp: '#3a2510', bumper: '#c0392b', peg: '#555555', spring: '#2ecc71', funnel: '#2a1a08' },
  },
  sunset: {
    gradient: ['#ff6b35', '#4a0060'],
    overlay: 'rgba(255, 100, 50, 0.12)',
    containerBg: '#6a2040',
    spriteMaterial: 'stone',
    courseGradient: ['#cc4420', '#8a2060'],
    themeColor: '#ff6b35',
    statKey: 'power',
    elements: { ramp: '#e0e0e0', bumper: '#f1c40f', peg: '#cccccc', spring: '#2ecc71', funnel: '#aaaaaa' },
  },
  night: {
    gradient: ['#0a0a2a', '#050510'],
    overlay: 'rgba(40, 40, 100, 0.15)',
    containerBg: '#050510',
    spriteMaterial: 'metal',
    courseGradient: ['#0a0a2a', '#1a1a4a'],
    themeColor: '#4a4a8a',
    statKey: 'luck',
    elements: { ramp: '#c0c0c0', bumper: '#00d4ff', peg: '#888888', spring: '#2ecc71', funnel: '#666688' },
  },
  candy: {
    gradient: ['#5a0a3a', '#2a0520'],
    overlay: 'rgba(180, 50, 120, 0.12)',
    containerBg: '#3a0828',
    spriteMaterial: 'glass',
    courseGradient: ['#5a0a3a', '#cc1080'],
    themeColor: '#ff69b4',
    statKey: 'bounce',
    elements: { ramp: '#ff69b4', bumper: '#f1c40f', peg: '#cccccc', spring: '#2ecc71', funnel: '#cc4488' },
  },
  ocean: {
    gradient: ['#001a4a', '#0077b6'],
    overlay: 'rgba(0, 100, 180, 0.12)',
    containerBg: '#001a4a',
    spriteMaterial: 'glass',
    courseGradient: ['#001a4a', '#0077b6'],
    themeColor: '#0077b6',
    statKey: 'bounce',
    elements: { ramp: '#e0c060', bumper: '#e67e22', peg: '#bbbbbb', spring: '#2ecc71', funnel: '#a09040' },
  },
  volcanic: {
    gradient: ['#1a0000', '#8b0000'],
    overlay: 'rgba(200, 0, 0, 0.15)',
    containerBg: '#1a0000',
    spriteMaterial: 'stone',
    courseGradient: ['#3a0000', '#8b0000'],
    themeColor: '#cc0000',
    statKey: 'power',
    elements: { ramp: '#c0c0c0', bumper: '#f1c40f', peg: '#aaaaaa', spring: '#2ecc71', funnel: '#888888' },
  },
  neon: {
    gradient: ['#0a0a0a', '#1a0a2a'],
    overlay: 'rgba(0, 255, 130, 0.08)',
    containerBg: '#0a0a0a',
    spriteMaterial: 'metal',
    courseGradient: ['#0a2a1a', '#00cc66'],
    themeColor: '#00ff87',
    statKey: 'luck',
    elements: { ramp: '#00ff87', bumper: '#ff00ff', peg: '#888888', spring: '#f1c40f', funnel: '#009955' },
  },
  snow: {
    gradient: ['#e0e8f0', '#a0c0e0'],
    overlay: 'rgba(200, 220, 255, 0.10)',
    containerBg: '#b0c8e0',
    spriteMaterial: 'glass',
    courseGradient: ['#a0b8d0', '#d0e0f0'],
    themeColor: '#b0d0f0',
    statKey: 'bounce',
    elements: { ramp: '#5a3520', bumper: '#c0392b', peg: '#555555', spring: '#27ae60', funnel: '#3a2510' },
  },
};

/** All bgImage keys including new themes */
export const ALL_BG_IMAGES = Object.keys(BG_THEMES);

/** Legacy themes that have PNG backgrounds */
export const LEGACY_BG_IMAGES = ['grass', 'lava', 'ice', 'cyber'];

/** Check if a bgImage has a PNG background or needs gradient rendering */
export function hasLegacyBg(bgImage: string): boolean {
  return LEGACY_BG_IMAGES.includes(bgImage);
}

/** Get theme definition, falling back to grass */
export function getBgTheme(bgImage: string): BgThemeDef {
  return BG_THEMES[bgImage] || BG_THEMES.grass;
}
