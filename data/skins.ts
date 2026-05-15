import type { MarbleData } from '../theme';

export interface SkinDef {
  id: string;
  marbleId: string;
  name: string;
  colorLight: string;
  colorDark: string;
  achievementId: string;
}

export const SKINS: SkinDef[] = [
  // Rocky
  { id: 'rocky-crimson', marbleId: 'rocky', name: 'Crimson', colorLight: '#ff3333', colorDark: '#b80000', achievementId: '50-races' },
  // Dash
  { id: 'dash-cobalt', marbleId: 'dash', name: 'Cobalt', colorLight: '#3366ff', colorDark: '#0033cc', achievementId: '10-wins' },
  { id: 'dash-aurora', marbleId: 'dash', name: 'Aurora', colorLight: '#ff9966', colorDark: '#cc6633', achievementId: 'all-marbles' },
  // Lucky
  { id: 'lucky-emerald', marbleId: 'lucky', name: 'Emerald', colorLight: '#33ff66', colorDark: '#009933', achievementId: '10-streak' },
  // Spike
  { id: 'spike-inferno', marbleId: 'spike', name: 'Inferno', colorLight: '#ff6600', colorDark: '#cc3300', achievementId: '5-streak' },
  // Nova
  { id: 'nova-supernova', marbleId: 'nova', name: 'Supernova', colorLight: '#ff66ff', colorDark: '#cc00cc', achievementId: '100-wins' },
  // Frosty
  { id: 'frosty-glacier', marbleId: 'frosty', name: 'Glacier', colorLight: '#99ccff', colorDark: '#3366cc', achievementId: 'season-champ' },
  // Aqua
  { id: 'aqua-deepsea', marbleId: 'aqua', name: 'Deep Sea', colorLight: '#0066cc', colorDark: '#003366', achievementId: 'earn-100k' },
  // Shadow
  { id: 'shadow-obsidian', marbleId: 'shadow', name: 'Obsidian', colorLight: '#3d3d3d', colorDark: '#1a1a1a', achievementId: '500-races' },
  { id: 'shadow-phantom', marbleId: 'shadow', name: 'Phantom', colorLight: '#6633cc', colorDark: '#330099', achievementId: 'champion-invite' },
];

/** Get all skins available for a specific marble */
export function getSkinsForMarble(marbleId: string): SkinDef[] {
  return SKINS.filter(s => s.marbleId === marbleId);
}

/** Return marble data with skin colors applied (if equipped) */
export function getSkinnedMarble(
  marble: MarbleData,
  equippedSkins: Record<string, string>,
): MarbleData {
  const skinId = equippedSkins[marble.id];
  if (!skinId) return marble;
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return marble;
  return { ...marble, colorLight: skin.colorLight, colorDark: skin.colorDark };
}
