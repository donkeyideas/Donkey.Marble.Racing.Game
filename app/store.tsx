import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import { useGameStore } from '../state/gameStore';
import { COIN_PACKS, CoinPack } from '../state/gameStore';
let IAP: typeof import('react-native-iap') | null = null;
try {
  IAP = require('react-native-iap');
} catch {
  console.warn('react-native-iap not available (Expo Go)');
}
type Purchase = any;
type PurchaseError = any;

const PACK_STYLES: Record<string, { iconBg: string; iconColor: string; iconText: string; borderColor?: string }> = {
  starter:  { iconBg: 'rgba(255,194,32,0.1)',  iconColor: Colors.yellow, iconText: '$' },
  popular:  { iconBg: 'rgba(255,194,32,0.15)', iconColor: Colors.yellow, iconText: '$$' },
  big:      { iconBg: 'rgba(46,204,113,0.1)',  iconColor: Colors.green,  iconText: '$$$' },
  whale:    { iconBg: 'rgba(155,89,182,0.15)', iconColor: '#c084fc',     iconText: '$$$$' },
};

const PACK_NAMES: Record<string, string> = {
  starter: 'Starter Pack',
  popular: 'Popular Pack',
  big: 'Big Spender',
  whale: 'Whale Pack',
};

// Platform-specific product ID maps (must match App Store Connect / Google Play Console)
const APPLE_IDS: Record<string, string> = {
  starter: 'com.donkeymarble.racing.coins.starter',
  popular: 'com.donkeymarble.racing.coins.popular',
  big: 'com.donkeymarble.racing.coins.big',
  whale: 'com.donkeymarble.racing.coins.whale',
  season_pass: 'com.donkeymarble.racing.pass.premium.v1',
  season_pass_premium: 'com.donkeymarble.racing.pass.plus.v1',
};

const GOOGLE_IDS: Record<string, string> = {
  starter: 'starter',
  popular: 'popular',
  big: 'big',
  whale: 'whale',
  season_pass: 'season_pass1',
  season_pass_premium: 'season_pass_premium1',
};

const STORE_IDS = Platform.OS === 'ios' ? APPLE_IDS : GOOGLE_IDS;
const STORE_PRODUCT_IDS = Object.values(STORE_IDS);

// Reverse lookup: store product ID → internal pack ID
const STORE_ID_TO_PACK: Record<string, string> = {};
for (const [packId, storeId] of Object.entries(STORE_IDS)) {
  STORE_ID_TO_PACK[storeId] = packId;
}

export default function StoreScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const purchaseCoinPack = useGameStore((s) => s.purchaseCoinPack);
  const purchaseSeasonPass = useGameStore((s) => s.purchaseSeasonPass);
  const passTrack = useGameStore((s) => s.passTrack);
  const storePurchasesToday = useGameStore((s) => s.storePurchasesToday);
  const storeCoinsPurchasedToday = useGameStore((s) => s.storeCoinsPurchasedToday);
  const storeLastPurchaseDate = useGameStore((s) => s.storeLastPurchaseDate);

  const [successPack, setSuccessPack] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [iapReady, setIapReady] = useState(false);

  // Reset daily counters display if new day
  const today = new Date().toISOString().slice(0, 10);
  const isNewDay = storeLastPurchaseDate !== today;
  const purchasesUsed = isNewDay ? 0 : storePurchasesToday;
  const coinsUsed = isNewDay ? 0 : storeCoinsPurchasedToday;
  const capPercent = Math.round((purchasesUsed / 3) * 100);

  // Initialize IAP connection
  useEffect(() => {
    if (!IAP) return;
    let purchaseUpdateSub: any = null;
    let purchaseErrorSub: any = null;

    const init = async () => {
      try {
        await IAP!.initConnection();
        await IAP!.fetchProducts({ skus: STORE_PRODUCT_IDS });
        setIapReady(true);
      } catch (err) {
        console.warn('IAP init failed:', err);
      }
    };

    purchaseUpdateSub = IAP.purchaseUpdatedListener(async (purchase: Purchase) => {
      const packId = STORE_ID_TO_PACK[purchase.productId] || purchase.productId;
      const isPass = packId === 'season_pass' || packId === 'season_pass_premium';
      try {
        await IAP!.finishTransaction({ purchase, isConsumable: !isPass });
        if (isPass) {
          const track = packId === 'season_pass' ? 'premium' : 'plus';
          purchaseSeasonPass(track);
          setSuccessPack(packId);
          setTimeout(() => setSuccessPack(null), 2000);
        } else {
          const result = purchaseCoinPack(packId);
          if (result.success) {
            setSuccessPack(packId);
            setTimeout(() => setSuccessPack(null), 2000);
          }
        }
      } catch (err) {
        console.warn('Failed to finish transaction:', err);
      }
      setPurchasing(null);
    });

    purchaseErrorSub = IAP.purchaseErrorListener((error: PurchaseError) => {
      if (error.code !== 'user-cancelled') {
        setErrorMsg('Purchase failed. Please try again.');
        setTimeout(() => setErrorMsg(null), 3000);
      }
      setPurchasing(null);
    });

    init();

    return () => {
      purchaseUpdateSub?.remove();
      purchaseErrorSub?.remove();
    };
  }, []);

  const handlePurchase = async (packId: string) => {
    if (!IAP || !iapReady) {
      setErrorMsg('Store not available in this build. Use a dev build for purchases.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }

    setPurchasing(packId);
    setErrorMsg(null);

    const appleId = APPLE_IDS[packId] || packId;
    const googleId = GOOGLE_IDS[packId] || packId;

    try {
      await IAP.requestPurchase({
        request: {
          apple: { sku: appleId },
          google: { skus: [googleId] },
        },
        type: 'in-app',
      });
    } catch (err: any) {
      if (err?.code !== 'user-cancelled') {
        setErrorMsg('Purchase failed. Please try again.');
        setTimeout(() => setErrorMsg(null), 3000);
      }
      setPurchasing(null);
    }
  };

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <Text style={styles.headerTitle}>STORE</Text>
            <CoinPill amount={coins} />
          </View>

          {/* Balance strip */}
          <LinearGradient
            colors={['rgba(255,194,32,0.15)', 'rgba(255,194,32,0.05)']}
            style={styles.balanceStrip}
          >
            <Text style={styles.balanceCoinIcon}>$</Text>
            <Text style={styles.balanceAmount}>{coins.toLocaleString()}</Text>
            <Text style={styles.balanceLabel}>COINS</Text>
          </LinearGradient>

          {/* Error message */}
          {errorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* Coin Packs */}
          <Text style={styles.sectionTitle}>COIN PACKS</Text>

          {COIN_PACKS.map((pack) => {
            const style = PACK_STYLES[pack.id];
            const isSuccess = successPack === pack.id;
            const isPurchasing = purchasing === pack.id;
            const isDisabled = isPurchasing || purchasesUsed >= 3 || coinsUsed + pack.coins > 25000;

            return (
              <Pressable
                key={pack.id}
                onPress={() => !isDisabled && handlePurchase(pack.id)}
                style={({ pressed }) => [
                  styles.packCard,
                  pack.badge === 'MOST POPULAR' && styles.packCardPopular,
                  pack.badge === 'BEST VALUE' && styles.packCardBest,
                  isSuccess && styles.packCardSuccess,
                  isDisabled && styles.packCardDisabled,
                  pressed && !isDisabled && { opacity: 0.85 },
                ]}
              >
                {/* Badge */}
                {pack.badge && (
                  <View style={[
                    styles.packBadge,
                    pack.badge === 'BEST VALUE' && styles.packBadgePurple,
                  ]}>
                    <Text style={[
                      styles.packBadgeText,
                      pack.badge === 'BEST VALUE' && { color: '#c084fc' },
                    ]}>
                      {pack.badge}
                    </Text>
                  </View>
                )}

                {/* Icon */}
                <View style={[styles.packIcon, { backgroundColor: style.iconBg }]}>
                  <Text style={[styles.packIconText, { color: style.iconColor }]}>
                    {style.iconText}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.packInfo}>
                  <Text style={styles.packName}>{PACK_NAMES[pack.id]}</Text>
                  <Text style={styles.packCoins}>
                    {pack.coins.toLocaleString()} coins
                  </Text>
                  {pack.bonus && (
                    <Text style={styles.packBonus}>{pack.bonus} bonus</Text>
                  )}
                </View>

                {/* Price / Success / Purchasing */}
                {isSuccess ? (
                  <View style={styles.successPill}>
                    <Text style={styles.successText}>ADDED!</Text>
                  </View>
                ) : isPurchasing ? (
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>...</Text>
                  </View>
                ) : (
                  <View style={[styles.pricePill, isDisabled && { opacity: 0.4 }]}>
                    <Text style={styles.priceText}>{pack.price}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {/* Daily limits */}
          <View style={styles.dailyCap}>
            <Text style={styles.dailyCapTitle}>Daily Purchase Limit</Text>
            <View style={styles.dailyCapBarBg}>
              <View style={[styles.dailyCapBarFill, { width: `${capPercent}%` }]} />
            </View>
            <Text style={styles.dailyCapText}>
              {purchasesUsed} / 3 transactions today {'\u00B7'} {coinsUsed.toLocaleString()} / 25,000 coins today
            </Text>
          </View>

          {/* Season Pass upsell */}
          <Text style={styles.sectionTitle}>SEASON PASS</Text>

          {/* Premium Pass */}
          {(() => {
            const premOwned = passTrack === 'premium' || passTrack === 'plus';
            const premPurchasing = purchasing === 'season_pass';
            const premSuccess = successPack === 'season_pass';
            return (
              <Pressable
                onPress={() => premOwned ? router.push('/pass') : handlePurchase('season_pass')}
                disabled={premPurchasing}
                style={({ pressed }) => [
                  styles.packCard,
                  { borderColor: 'rgba(255,194,32,0.25)' },
                  premSuccess && styles.packCardSuccess,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.packIcon, { backgroundColor: 'rgba(255,194,32,0.15)' }]}>
                  <Text style={[styles.packIconText, { color: Colors.yellow }]}>*</Text>
                </View>
                <View style={styles.packInfo}>
                  <Text style={[styles.packName, { color: Colors.yellow }]}>Premium Pass</Text>
                  <Text style={styles.packSubDesc}>Unlock premium rewards track</Text>
                </View>
                {premOwned ? (
                  <View style={styles.successPill}>
                    <Text style={styles.successText}>OWNED</Text>
                  </View>
                ) : premSuccess ? (
                  <View style={styles.successPill}>
                    <Text style={styles.successText}>UNLOCKED!</Text>
                  </View>
                ) : premPurchasing ? (
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>...</Text>
                  </View>
                ) : (
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>$9.99</Text>
                  </View>
                )}
              </Pressable>
            );
          })()}

          {/* Plus Pass */}
          {(() => {
            const plusOwned = passTrack === 'plus';
            const plusPurchasing = purchasing === 'season_pass_premium';
            const plusSuccess = successPack === 'season_pass_premium';
            return (
              <Pressable
                onPress={() => plusOwned ? router.push('/pass') : handlePurchase('season_pass_premium')}
                disabled={plusPurchasing}
                style={({ pressed }) => [
                  styles.packCard,
                  { borderColor: 'rgba(155,89,182,0.25)' },
                  plusSuccess && styles.packCardSuccess,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.packIcon, { backgroundColor: 'rgba(155,89,182,0.15)' }]}>
                  <Text style={[styles.packIconText, { color: '#c084fc' }]}>*</Text>
                </View>
                <View style={styles.packInfo}>
                  <Text style={[styles.packName, { color: '#c084fc' }]}>Plus Pass</Text>
                  <Text style={styles.packSubDesc}>Premium + exclusive skins + bonus XP</Text>
                </View>
                {plusOwned ? (
                  <View style={styles.successPill}>
                    <Text style={styles.successText}>OWNED</Text>
                  </View>
                ) : plusSuccess ? (
                  <View style={styles.successPill}>
                    <Text style={styles.successText}>UNLOCKED!</Text>
                  </View>
                ) : plusPurchasing ? (
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>...</Text>
                  </View>
                ) : (
                  <View style={styles.pricePill}>
                    <Text style={styles.priceText}>$24.99</Text>
                  </View>
                )}
              </Pressable>
            );
          })()}

          {/* Footer disclaimer */}
          <Text style={styles.disclaimer}>
            One-time per season {'\u2014'} Not a subscription{'\n'}
            Virtual coins only {'\u2014'} No real money gambling
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
  },

  /* Balance strip */
  balanceStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    marginVertical: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.2)',
  },
  balanceCoinIcon: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
  },
  balanceAmount: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.yellow,
  },
  balanceLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha35,
  },

  /* Section title */
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 6,
  },

  /* Pack cards */
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  packCardPopular: {
    borderColor: 'rgba(255,194,32,0.25)',
    backgroundColor: 'rgba(255,194,32,0.06)',
  },
  packCardBest: {
    borderColor: 'rgba(155,89,182,0.25)',
    backgroundColor: 'rgba(155,89,182,0.06)',
  },
  packCardSuccess: {
    borderColor: 'rgba(46,204,113,0.4)',
    backgroundColor: 'rgba(46,204,113,0.08)',
  },
  packCardDisabled: {
    opacity: 0.4,
  },

  /* Badge */
  packBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: 'rgba(255,194,32,0.15)',
    borderBottomLeftRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  packBadgePurple: {
    backgroundColor: 'rgba(155,89,182,0.15)',
  },
  packBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.yellow,
    letterSpacing: 0.5,
  },

  /* Pack icon */
  packIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packIconText: {
    fontFamily: Fonts.display,
    fontSize: 18,
  },

  /* Pack info */
  packInfo: {
    flex: 1,
  },
  packName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  packCoins: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
  },
  packBonus: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.green,
  },
  packSubDesc: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
  },

  /* Price pill */
  pricePill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  priceText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },

  /* Success pill */
  successPill: {
    backgroundColor: 'rgba(46,204,113,0.2)',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  successText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.green,
  },

  /* Daily cap */
  dailyCap: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  dailyCapTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    marginBottom: 8,
  },
  dailyCapBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  dailyCapBarFill: {
    height: '100%',
    backgroundColor: Colors.yellow,
    borderRadius: 3,
  },
  dailyCapText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha35,
  },

  /* Error */
  errorBanner: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderColor: 'rgba(231,76,60,0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.red,
    textAlign: 'center',
  },

  /* Disclaimer */
  disclaimer: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
});
