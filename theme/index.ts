// Design tokens from the HTML mockup
export const Colors = {
  ink: '#0a1a3a',
  blueDark: '#0a3a96',
  blue: '#1d56d4',
  blueLight: '#4d80ff',
  blueSky: '#6ec1ff',
  yellow: '#ffc220',
  yellowBright: '#ffd84d',
  yellowDeep: '#ff9a1a',
  red: '#e74c3c',
  green: '#2ecc71',
  greenDark: '#27ae60',
  cream: '#fff8e6',
  white: '#ffffff',
  bronze: '#cd7f32',

  // Transparent variants
  whiteAlpha07: 'rgba(255,255,255,0.07)',
  whiteAlpha10: 'rgba(255,255,255,0.1)',
  whiteAlpha12: 'rgba(255,255,255,0.12)',
  whiteAlpha15: 'rgba(255,255,255,0.15)',
  whiteAlpha25: 'rgba(255,255,255,0.25)',
  whiteAlpha35: 'rgba(255,255,255,0.35)',
  whiteAlpha40: 'rgba(255,255,255,0.4)',
  whiteAlpha50: 'rgba(255,255,255,0.5)',
  whiteAlpha60: 'rgba(255,255,255,0.6)',
  whiteAlpha70: 'rgba(255,255,255,0.7)',
  inkAlpha30: 'rgba(10,26,58,0.3)',
  inkAlpha50: 'rgba(10,26,58,0.5)',
  inkAlpha60: 'rgba(10,26,58,0.6)',
  yellowAlpha08: 'rgba(255,194,32,0.08)',
  yellowAlpha15: 'rgba(255,194,32,0.15)',
  yellowAlpha20: 'rgba(255,194,32,0.2)',
  greenAlpha10: 'rgba(46,204,113,0.1)',
  greenAlpha20: 'rgba(46,204,113,0.2)',
  redAlpha20: 'rgba(231,76,60,0.2)',
  blueAlpha10: 'rgba(77,128,255,0.1)',
  purpleAlpha12: 'rgba(155,89,182,0.12)',
  purpleAlpha15: 'rgba(155,89,182,0.15)',
  purpleAlpha25: 'rgba(155,89,182,0.25)',

  // Course theme colors
  meadow: '#2ecc71',
  volcano: '#e74c3c',
  frozen: '#3498db',
  cyber: '#9b59b6',
  grayDark: '#475569',
} as const;

export const Fonts = {
  display: 'LilitaOne_400Regular',
  body: 'Fredoka_400Regular',
  bodyMedium: 'Fredoka_500Medium',
  bodySemiBold: 'Fredoka_600SemiBold',
  bodyBold: 'Fredoka_700Bold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 30,
  xxl: 40,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 20,
  pill: 50,
  round: 9999,
} as const;

// Marble definitions matching the mockup exactly
export interface MarbleData {
  id: string;
  name: string;
  colorLight: string;
  colorDark: string;
  personality: string;
  stats: { speed: number; power: number; bounce: number; luck: number };
}

export const MARBLES: MarbleData[] = [
  { id: 'rocky', name: 'Rocky', colorLight: '#ff6b6b', colorDark: '#e74c3c', personality: '"The steady one"', stats: { speed: 3, power: 4, bounce: 2, luck: 3 } },
  { id: 'dash', name: 'Dash', colorLight: '#74c0fc', colorDark: '#228be6', personality: '"Speed demon"', stats: { speed: 5, power: 2, bounce: 3, luck: 2 } },
  { id: 'lucky', name: 'Lucky', colorLight: '#69db7c', colorDark: '#2ecc71', personality: '"Fortune\'s favorite"', stats: { speed: 3, power: 3, bounce: 2, luck: 5 } },
  { id: 'spike', name: 'Spike', colorLight: '#ffd43b', colorDark: '#ffc220', personality: '"Bounces back"', stats: { speed: 2, power: 5, bounce: 4, luck: 2 } },
  { id: 'nova', name: 'Nova', colorLight: '#da77f2', colorDark: '#9b59b6', personality: '"Wild card"', stats: { speed: 4, power: 2, bounce: 3, luck: 4 } },
  { id: 'frosty', name: 'Frosty', colorLight: '#ff922b', colorDark: '#e67e22', personality: '"Cool under pressure"', stats: { speed: 3, power: 3, bounce: 4, luck: 3 } },
  { id: 'aqua', name: 'Aqua', colorLight: '#66d9e8', colorDark: '#17a2b8', personality: '"Smooth roller"', stats: { speed: 4, power: 2, bounce: 2, luck: 4 } },
  { id: 'shadow', name: 'Shadow', colorLight: '#868e96', colorDark: '#495057', personality: '"Dark horse"', stats: { speed: 3, power: 4, bounce: 3, luck: 3 } },
];
