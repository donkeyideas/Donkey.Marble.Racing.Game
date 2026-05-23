import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

/* ------------------------------------------------------------------ */
/*  Rewarded Ads — thin wrapper around Google Mobile Ads SDK.          */
/*                                                                     */
/*  Exposes three operations the UI layer needs:                       */
/*    - initRewardedAds()  : initialise the SDK once at app boot       */
/*    - loadRewardedAd()   : start loading the next ad in background   */
/*    - showRewardedAd()   : present the currently-loaded ad           */
/*                                                                     */
/*  Designed so the Store UI can call `showRewardedAd()` and treat the */
/*  returned promise as the gate for crediting coins — `watched: true` */
/*  ONLY when the user earned the reward. Any error / no-fill / early  */
/*  dismissal collapses to `watched: false` so the caller never has to */
/*  reason about ad-network specifics.                                 */
/* ------------------------------------------------------------------ */

/* Production ad-unit IDs (set up in AdMob console). */
const PROD_REWARDED_AD_UNIT_ID = Platform.select({
  ios: 'ca-app-pub-6024881476822443/1567084334',
  android: 'ca-app-pub-6024881476822443/2744434638',
  default: 'ca-app-pub-6024881476822443/2744434638',
});

/* Google's official test IDs — safe to spam in dev without burning real
 * fill or risking AdMob policy strikes. Always serve a test ad. */
const TEST_REWARDED_AD_UNIT_ID = Platform.select({
  ios: 'ca-app-pub-3940256099942544/1712485313',
  android: 'ca-app-pub-3940256099942544/5224354917',
  default: 'ca-app-pub-3940256099942544/5224354917',
});

const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const AD_UNIT_ID = IS_DEV ? TEST_REWARDED_AD_UNIT_ID : PROD_REWARDED_AD_UNIT_ID;

/* Single in-flight ad instance. Holding one preloaded ad at a time keeps
 * the integration simple — every show() consumes it and we kick off the
 * next load immediately. */
let currentAd: RewardedAd | null = null;
let isLoaded = false;
let isLoading = false;
let unsubLoaded: (() => void) | null = null;
let unsubError: (() => void) | null = null;

let initPromise: Promise<void> | null = null;

/** Initialise the Mobile Ads SDK. Idempotent — repeat calls return the
 *  same in-flight / resolved promise. Never throws; callers may safely
 *  fire-and-forget at app boot. */
export function initRewardedAds(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await mobileAds().initialize();
    } catch {
      // Swallow — ad init failure must not crash the app. The
      // subsequent loadRewardedAd() call will also fail gracefully.
    }
  })();
  return initPromise;
}

/* Tear down any listeners attached to the previous ad instance. Always
 * called before swapping `currentAd`. */
function detachListeners() {
  if (unsubLoaded) {
    try { unsubLoaded(); } catch { /* noop */ }
    unsubLoaded = null;
  }
  if (unsubError) {
    try { unsubError(); } catch { /* noop */ }
    unsubError = null;
  }
}

/** Kick off loading the next rewarded ad in the background. Idempotent
 *  — if an ad is already loaded or loading, this is a no-op. */
export function loadRewardedAd(): void {
  if (isLoaded || isLoading) return;
  try {
    detachListeners();
    isLoading = true;
    isLoaded = false;
    const ad = RewardedAd.createForAdRequest(AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });
    currentAd = ad;

    unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      // Only flip flags if this listener still owns the active ad — a
      // stale callback firing after a teardown would otherwise resurrect
      // a discarded instance.
      if (currentAd === ad) {
        isLoaded = true;
        isLoading = false;
      }
    });

    unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      if (currentAd === ad) {
        isLoaded = false;
        isLoading = false;
        currentAd = null;
        detachListeners();
      }
    });

    ad.load();
  } catch {
    // SDK not ready / native module missing → reset and let the next
    // call retry. Never propagates.
    isLoading = false;
    isLoaded = false;
    currentAd = null;
  }
}

/** Show the currently-loaded rewarded ad. Resolves `{ watched: true }`
 *  only when the user earned the reward. Any failure path resolves
 *  `{ watched: false }`. After resolution the next ad is auto-loaded. */
export function showRewardedAd(): Promise<{ watched: boolean }> {
  return new Promise((resolve) => {
    const ad = currentAd;
    if (!ad || !isLoaded) {
      // No ad ready — kick off a load so the next attempt has one.
      loadRewardedAd();
      resolve({ watched: false });
      return;
    }

    let earned = false;
    let settled = false;
    const settle = (watched: boolean) => {
      if (settled) return;
      settled = true;
      // Cleanup listeners for this show cycle.
      try { unsubEarned(); } catch { /* noop */ }
      try { unsubClosed(); } catch { /* noop */ }
      try { unsubShowError(); } catch { /* noop */ }
      // Consume the ad regardless of outcome; preload the next one.
      detachListeners();
      currentAd = null;
      isLoaded = false;
      isLoading = false;
      loadRewardedAd();
      resolve({ watched });
    };

    const unsubEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => { earned = true; },
    );
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      settle(earned);
    });
    const unsubShowError = ad.addAdEventListener(AdEventType.ERROR, () => {
      settle(false);
    });

    try {
      ad.show();
    } catch {
      settle(false);
    }
  });
}
