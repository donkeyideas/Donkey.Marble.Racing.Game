/**
 * Firebase Analytics — Web SDK.
 *
 * All functions are async + guarded — Analytics may be null in environments
 * where the Web SDK's isSupported() returns false. Logged events flow into the
 * same GA4 project as the native SDK did; no dashboard changes needed.
 */
import { logEvent as fbLogEvent, setUserProperties as fbSetUserProperties } from 'firebase/analytics';
import { getFbAnalytics } from './firebase';

// firebase/analytics's logEvent has overloads with reserved event-name unions
// that don't typecheck well with dynamic strings. Cast once and reuse.
const logEvent = fbLogEvent as unknown as (
  analytics: any, eventName: string, params?: Record<string, any>,
) => void;

export async function logRaceComplete(data: {
  courseId: string;
  gameMode: string;
  won: boolean;
  betAmount: number;
  payout: number;
  placement: number;
}) {
  try {
    const a = await getFbAnalytics();
    if (!a) return;
    logEvent(a, 'race_complete', {
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
    const a = await getFbAnalytics();
    if (!a) return;
    logEvent(a, 'purchase', {
      currency: 'USD',
      value: data.priceUsd,
      items: [{ item_id: data.productId, quantity: 1 }],
    });
  } catch {}
}

export async function logScreenView(screenName: string) {
  try {
    const a = await getFbAnalytics();
    if (!a) return;
    logEvent(a, 'screen_view', {
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
    const a = await getFbAnalytics();
    if (!a) return;
    logEvent(a, 'bet_placed', {
      amount: data.amount,
      marble_id: data.marbleId,
      course_id: data.courseId,
    });
  } catch {}
}

export async function logSeasonStart(seasonNumber: number, mode: string) {
  try {
    const a = await getFbAnalytics();
    if (!a) return;
    logEvent(a, 'season_start', {
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
    const a = await getFbAnalytics();
    if (!a) return;
    const props: Record<string, string> = {};
    if (data.passLevel != null) props.pass_level = String(data.passLevel);
    if (data.totalRaces != null) props.total_races = String(data.totalRaces);
    if (data.totalSpent != null) props.total_spent = String(data.totalSpent);
    if (Object.keys(props).length > 0) fbSetUserProperties(a, props);
  } catch {}
}
