/**
 * Skia sprite loading — mirrors assets/kenney/spriteMap.ts but for Skia's useImage().
 * Each hook returns SkImage | null (null while loading).
 */
import { useImage, SkImage } from '@shopify/react-native-skia';

export interface SkiaThemeSprites {
  bumper: SkImage | null;
  peg: SkImage | null;
  ramp: SkImage | null;
  wall: SkImage | null;
  channel: SkImage | null;
  windmill: SkImage | null;
  spring: SkImage | null;
  trampoline: SkImage | null;
  funnel: SkImage | null;
  speedburst: SkImage | null;
}

// All useImage calls must be at the top level of a hook — no conditionals.
// We load ALL themes and pick the right one. useImage is cheap (cached/deduped).

function useGrassSprites(): SkiaThemeSprites {
  return {
    bumper:     useImage(require('../assets/kenney/elements/bumper_wood.png')),
    peg:        useImage(require('../assets/kenney/elements/bumper_wood.png')),
    ramp:       useImage(require('../assets/kenney/elements/ramp_wood.png')),
    wall:       useImage(require('../assets/kenney/elements/wall_wood.png')),
    channel:    useImage(require('../assets/kenney/elements/channel_wood.png')),
    windmill:   useImage(require('../assets/kenney/elements/ramp_wood.png')),
    spring:     useImage(require('../assets/kenney/elements/spring.png')),
    trampoline: useImage(require('../assets/kenney/elements/ramp_wood.png')),
    funnel:     useImage(require('../assets/kenney/elements/ramp_wood.png')),
    speedburst: useImage(require('../assets/kenney/elements/speedburst.png')),
  };
}

function useLavaSprites(): SkiaThemeSprites {
  return {
    bumper:     useImage(require('../assets/kenney/elements/bumper_stone.png')),
    peg:        useImage(require('../assets/kenney/elements/bumper_stone.png')),
    ramp:       useImage(require('../assets/kenney/elements/ramp_stone.png')),
    wall:       useImage(require('../assets/kenney/elements/wall_stone.png')),
    channel:    useImage(require('../assets/kenney/elements/channel_stone.png')),
    windmill:   useImage(require('../assets/kenney/elements/ramp_stone.png')),
    spring:     useImage(require('../assets/kenney/elements/spring.png')),
    trampoline: useImage(require('../assets/kenney/elements/ramp_stone.png')),
    funnel:     useImage(require('../assets/kenney/elements/ramp_stone.png')),
    speedburst: useImage(require('../assets/kenney/elements/speedburst.png')),
  };
}

function useIceSprites(): SkiaThemeSprites {
  return {
    bumper:     useImage(require('../assets/kenney/elements/bumper_stone.png')),
    peg:        useImage(require('../assets/kenney/elements/bumper_stone.png')),
    ramp:       useImage(require('../assets/kenney/elements/ramp_glass.png')),
    wall:       useImage(require('../assets/kenney/elements/wall_glass.png')),
    channel:    useImage(require('../assets/kenney/elements/channel_glass.png')),
    windmill:   useImage(require('../assets/kenney/elements/ramp_glass.png')),
    spring:     useImage(require('../assets/kenney/elements/spring.png')),
    trampoline: useImage(require('../assets/kenney/elements/ramp_glass.png')),
    funnel:     useImage(require('../assets/kenney/elements/ramp_glass.png')),
    speedburst: useImage(require('../assets/kenney/elements/speedburst.png')),
  };
}

function useCyberSprites(): SkiaThemeSprites {
  return {
    bumper:     useImage(require('../assets/kenney/elements/bumper_metal.png')),
    peg:        useImage(require('../assets/kenney/elements/bumper_metal.png')),
    ramp:       useImage(require('../assets/kenney/elements/ramp_metal.png')),
    wall:       useImage(require('../assets/kenney/elements/wall_metal.png')),
    channel:    useImage(require('../assets/kenney/elements/channel_metal.png')),
    windmill:   useImage(require('../assets/kenney/elements/ramp_metal.png')),
    spring:     useImage(require('../assets/kenney/elements/spring.png')),
    trampoline: useImage(require('../assets/kenney/elements/ramp_metal.png')),
    funnel:     useImage(require('../assets/kenney/elements/ramp_metal.png')),
    speedburst: useImage(require('../assets/kenney/elements/speedburst.png')),
  };
}

/**
 * Load all theme sprites. Returns sprites for the given bgImage theme.
 * All 4 themes are loaded unconditionally (hook rules), but only the active one is returned.
 */
export function useSkiaThemeSprites(bgImage: string): SkiaThemeSprites {
  const grass = useGrassSprites();
  const lava = useLavaSprites();
  const ice = useIceSprites();
  const cyber = useCyberSprites();

  // Map new themes to their sprite material
  const MATERIAL_MAP: Record<string, 'grass' | 'lava' | 'ice' | 'cyber'> = {
    grass: 'grass', lava: 'lava', ice: 'ice', cyber: 'cyber',
    beach: 'grass', forest: 'grass',
    desert: 'lava', sunset: 'lava', volcanic: 'lava',
    candy: 'ice', ocean: 'ice', snow: 'ice',
    night: 'cyber', neon: 'cyber',
  };
  const material = MATERIAL_MAP[bgImage] || 'grass';

  switch (material) {
    case 'lava':  return lava;
    case 'ice':   return ice;
    case 'cyber': return cyber;
    default:      return grass;
  }
}

export function useSkiaBgImage(bgImage: string): SkImage | null {
  const grass = useImage(require('../assets/kenney/backgrounds/bg_grass.png'));
  const lava  = useImage(require('../assets/kenney/backgrounds/bg_lava.png'));
  const ice   = useImage(require('../assets/kenney/backgrounds/bg_ice.png'));
  const cyber = useImage(require('../assets/kenney/backgrounds/bg_cyber.png'));

  switch (bgImage) {
    case 'grass': return grass;
    case 'lava':  return lava;
    case 'ice':   return ice;
    case 'cyber': return cyber;
    default:      return null; // New themes use gradient backgrounds
  }
}

/** Check if all critical sprites are loaded */
export function areSpritesReady(sprites: SkiaThemeSprites): boolean {
  return !!(sprites.ramp && sprites.bumper && sprites.peg && sprites.wall &&
            sprites.channel && sprites.funnel && sprites.spring);
}
