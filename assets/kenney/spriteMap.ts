/**
 * Centralized sprite registry for Kenney asset integration.
 *
 * React Native requires static `require()` paths — no dynamic string
 * interpolation allowed.  This module maps theme names to pre-loaded
 * image sources so the renderer can swap visuals per track theme.
 */

import { ImageSourcePropType } from 'react-native';

// ---------------------------------------------------------------------------
// Background sprites
// ---------------------------------------------------------------------------

const BG_SPRITES: Record<string, ImageSourcePropType> = {
  grass: require('./backgrounds/bg_grass.png'),
  lava:  require('./backgrounds/bg_lava.png'),
  ice:   require('./backgrounds/bg_ice.png'),
  cyber: require('./backgrounds/bg_cyber.png'),
};

export function getBgSprite(bgImage: string): ImageSourcePropType {
  return BG_SPRITES[bgImage] || BG_SPRITES.grass;
}

// ---------------------------------------------------------------------------
// Element sprites — per theme
// ---------------------------------------------------------------------------

export interface ThemeSprites {
  bumper: ImageSourcePropType;
  peg: ImageSourcePropType;         // same shape as bumper (circle)
  ramp: ImageSourcePropType;
  wall: ImageSourcePropType;
  channel: ImageSourcePropType;     // re-uses ramp / wide-rect shape
  windmill: ImageSourcePropType;    // re-uses ramp / wide-rect shape
  spring: ImageSourcePropType;
  trampoline: ImageSourcePropType;  // re-uses ramp shape
  funnel: ImageSourcePropType;      // re-uses ramp shape
  speedburst: ImageSourcePropType;
}

const GRASS_SPRITES: ThemeSprites = {
  bumper:     require('./elements/bumper_wood.png'),
  peg:        require('./elements/bumper_wood.png'),
  ramp:       require('./elements/ramp_wood.png'),
  wall:       require('./elements/wall_wood.png'),
  channel:    require('./elements/channel_wood.png'),
  windmill:   require('./elements/ramp_wood.png'),
  spring:     require('./elements/spring.png'),
  trampoline: require('./elements/ramp_wood.png'),
  funnel:     require('./elements/ramp_wood.png'),
  speedburst: require('./elements/speedburst.png'),
};

const LAVA_SPRITES: ThemeSprites = {
  bumper:     require('./elements/bumper_stone.png'),
  peg:        require('./elements/bumper_stone.png'),
  ramp:       require('./elements/ramp_stone.png'),
  wall:       require('./elements/wall_stone.png'),
  channel:    require('./elements/channel_stone.png'),
  windmill:   require('./elements/ramp_stone.png'),
  spring:     require('./elements/spring.png'),
  trampoline: require('./elements/ramp_stone.png'),
  funnel:     require('./elements/ramp_stone.png'),
  speedburst: require('./elements/speedburst.png'),
};

const ICE_SPRITES: ThemeSprites = {
  bumper:     require('./elements/bumper_stone.png'),  // stone visible on light ice bg (glass was invisible)
  peg:        require('./elements/bumper_stone.png'),  // stone visible on light ice bg (glass was invisible)
  ramp:       require('./elements/ramp_glass.png'),
  wall:       require('./elements/wall_glass.png'),
  channel:    require('./elements/channel_glass.png'),
  windmill:   require('./elements/ramp_glass.png'),
  spring:     require('./elements/spring.png'),
  trampoline: require('./elements/ramp_glass.png'),
  funnel:     require('./elements/ramp_glass.png'),
  speedburst: require('./elements/speedburst.png'),
};

const CYBER_SPRITES: ThemeSprites = {
  bumper:     require('./elements/bumper_metal.png'),
  peg:        require('./elements/bumper_metal.png'),
  ramp:       require('./elements/ramp_metal.png'),
  wall:       require('./elements/wall_metal.png'),
  channel:    require('./elements/channel_metal.png'),
  windmill:   require('./elements/ramp_metal.png'),
  spring:     require('./elements/spring.png'),
  trampoline: require('./elements/ramp_metal.png'),
  funnel:     require('./elements/ramp_metal.png'),
  speedburst: require('./elements/speedburst.png'),
};

const THEME_MAP: Record<string, ThemeSprites> = {
  grass: GRASS_SPRITES,
  lava:  LAVA_SPRITES,
  ice:   ICE_SPRITES,
  cyber: CYBER_SPRITES,
  // New themes mapped to existing sprite materials
  beach:    GRASS_SPRITES,   // wood on sand
  forest:   GRASS_SPRITES,   // wood in forest
  desert:   LAVA_SPRITES,    // stone in desert
  sunset:   LAVA_SPRITES,    // stone at sunset
  night:    CYBER_SPRITES,   // metal at night
  candy:    ICE_SPRITES,     // glass in candy
  ocean:    ICE_SPRITES,     // glass in ocean
  volcanic: LAVA_SPRITES,    // stone in volcanic
  neon:     CYBER_SPRITES,   // metal in neon
  snow:     ICE_SPRITES,     // glass in snow
};

export function getThemeSprites(bgImage: string): ThemeSprites {
  return THEME_MAP[bgImage] || THEME_MAP.grass;
}

// ---------------------------------------------------------------------------
// Theme overlay tints (semi-transparent color wash per theme)
// ---------------------------------------------------------------------------

export const THEME_OVERLAYS: Record<string, string | null> = {
  grass: null,
  lava:  'rgba(180, 40, 20, 0.15)',
  ice:   'rgba(100, 180, 255, 0.12)',
  cyber: 'rgba(120, 50, 180, 0.18)',
  // New themes
  beach:    'rgba(255, 200, 100, 0.10)',
  forest:   'rgba(30, 120, 30, 0.12)',
  desert:   'rgba(200, 160, 60, 0.10)',
  sunset:   'rgba(255, 100, 50, 0.12)',
  night:    'rgba(40, 40, 100, 0.15)',
  candy:    'rgba(255, 100, 180, 0.10)',
  ocean:    'rgba(0, 100, 180, 0.12)',
  volcanic: 'rgba(200, 0, 0, 0.15)',
  neon:     'rgba(0, 255, 130, 0.08)',
  snow:     'rgba(200, 220, 255, 0.10)',
};
