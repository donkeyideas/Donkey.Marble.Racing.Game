/**
 * Account-reset helper — wipes ALL local persistence and resets the
 * in-memory Zustand store to a fresh-install shape. Called from two
 * places:
 *
 *   1. app/settings.tsx — user-initiated "Delete Account" flow after
 *      successful server + Firebase delete.
 *
 *   2. lib/sync.ts — when server returns 401 to a request that DID
 *      send a token, meaning the player was deleted server-side (admin
 *      action or self-delete on a sibling device). Without resetting
 *      in-memory state the user keeps seeing their name + coins until
 *      they kill the app manually.
 *
 * The reset shape mirrors the v7 migrate() block in state/gameStore.ts
 * so a deleted account looks identical to a fresh install on next
 * navigation cycle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../state/gameStore';
import { clearToken } from './api';

export async function resetAccountLocally(): Promise<void> {
  // 1. Clear all known persisted state in AsyncStorage.
  try {
    const persistApi = (useGameStore as any).persist;
    if (persistApi?.clearStorage) {
      await persistApi.clearStorage();
    }
  } catch {
    // Fall through to the manual removes below.
  }
  try { await AsyncStorage.removeItem('dmr-game-state'); } catch {}
  try { await AsyncStorage.removeItem('dmr-remote-config'); } catch {}
  try { await clearToken(); } catch {}

  // 2. Replace the in-memory Zustand state with fresh-install defaults.
  //    Merge-set (no replace: true) so the store's action functions
  //    are preserved.
  useGameStore.setState({
    firebaseUid: null,
    firebaseDisplayName: null,
    firebasePhotoURL: null,
    firebaseEmail: null,
    playerName: '',
    hasSeenIntroRace: false,
    coins: 1000,
    currentBetId: null,
    betsToday: 0,
    lastBetDate: '',
    screen: 'splash',
    totalRaces: 0,
    totalWins: 0,
    currentStreak: 0,
    bestStreak: 0,
    dailyStreak: 0,
    marbleStats: {},
    seasonStandings: {},
    seasonWeek: 1,
    lastPlayedDate: null,
    raceHistory: [],
    passLevel: 1,
    passXp: 0,
    passTrack: 'free',
    coinHistory: [],
    season: null,
    nationalRaces: {},
    tournaments: null,
    storePurchasesToday: 0,
    storeCoinsPurchasedToday: 0,
    storeLastPurchaseDate: '',
    achievements: {},
    equippedSkins: {},
    customTracks: [],
    challenges: { daily: [], weekly: [], lastDailyReset: '', lastWeeklyReset: '' },
  } as any);
}
