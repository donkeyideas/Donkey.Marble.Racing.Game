/**
 * Firebase Analytics — auto-tracks screen views, sessions, retention.
 * Custom events below give extra insight in the GA4 dashboard.
 * Guarded by isExpoGo check to avoid crash in Expo Go.
 */

import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

let _analytics: any = null;
function getAnalytics() {
  if (isExpoGo) return null;
  if (_analytics) return _analytics;
  try {
    _analytics = require('@react-native-firebase/analytics').default;
    return _analytics;
  } catch {
    return null;
  }
}
function analytics() {
  const mod = getAnalytics();
  return mod ? mod() : null;
}

export async function logRaceComplete(data: {
  courseId: string;
  gameMode: string;
  won: boolean;
  betAmount: number;
  payout: number;
  placement: number;
}) {
  try {
    await analytics()?.logEvent('race_complete', {
      course_id: data.courseId,
      game_mode: data.gameMode,
      won: data.won,
      bet_amount: data.betAmount,
      payout: data.payout,
      placement: data.placement,
    });
  } catch {}
}

export async function logPurchase(data: {
  productId: string;
  priceUsd: number;
  coinsGranted: number;
}) {
  try {
    await analytics()?.logPurchase({
      currency: 'USD',
      value: data.priceUsd,
      items: [{ item_id: data.productId, quantity: 1 }],
    });
  } catch {}
}

export async function logScreenView(screenName: string) {
  try {
    await analytics()?.logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch {}
}

export async function logBetPlaced(data: {
  amount: number;
  marbleId: string;
  courseId: string;
}) {
  try {
    await analytics()?.logEvent('bet_placed', {
      amount: data.amount,
      marble_id: data.marbleId,
      course_id: data.courseId,
    });
  } catch {}
}

export async function logSeasonStart(seasonNumber: number, mode: string) {
  try {
    await analytics()?.logEvent('season_start', {
      season_number: seasonNumber,
      mode,
    });
  } catch {}
}

export async function setUserProperties(data: {
  passLevel?: number;
  totalRaces?: number;
  totalSpent?: number;
}) {
  try {
    if (data.passLevel != null) {
      await analytics()?.setUserProperty('pass_level', String(data.passLevel));
    }
    if (data.totalRaces != null) {
      await analytics()?.setUserProperty('total_races', String(data.totalRaces));
    }
    if (data.totalSpent != null) {
      await analytics()?.setUserProperty('total_spent', String(data.totalSpent));
    }
  } catch {}
}
