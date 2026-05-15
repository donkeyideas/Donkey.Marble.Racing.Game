import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import { useGameStore } from '../state/gameStore';
import { PASS_REWARDS, PassTrack, XP_PER_LEVEL } from '../data/seasonPass';

const TRACK_TABS: { label: string; sublabel?: string; value: PassTrack }[] = [
  { label: 'FREE', value: 'free' },
  { label: 'PREMIUM', sublabel: '$9.99', value: 'premium' },
  { label: 'PLUS', sublabel: '$24.99', value: 'plus' },
];

export default function PassScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const passLevel = useGameStore((s) => s.passLevel);
  const passXp = useGameStore((s) => s.passXp);
  const season = useGameStore((s) => s.season);
  const [activeTrack, setActiveTrack] = useState<PassTrack>('free');

  const seasonNum = season?.seasonNumber ?? 1;
  const earnedFreeCount = PASS_REWARDS.filter((r) => r.track === 'free' && passLevel > r.level).length;

  const xpPercent = Math.round((passXp / XP_PER_LEVEL) * 100);

  const filteredRewards = activeTrack === 'free'
    ? PASS_REWARDS
    : PASS_REWARDS.filter((r) => r.track === activeTrack || r.track === 'free');

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
            <View style={{ flex: 1 }} />
            <CoinPill amount={coins} />
          </View>

          {/* Pass header */}
          <View style={styles.passHeader}>
            <Text style={styles.passTitle}>SEASON {seasonNum} PASS</Text>
            <View style={styles.levelRow}>
              <Text style={styles.levelText}>Level </Text>
              <View style={styles.levelCircle}>
                <Text style={styles.levelCircleText}>{passLevel}</Text>
              </View>
              <Text style={styles.levelText}> — {passXp.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP</Text>
            </View>
            <View style={styles.xpBarTrack}>
              <LinearGradient
                colors={['#ffc220', '#ff9a1a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.xpBarFill, { width: `${xpPercent}%` }]}
              />
            </View>
            <Text style={styles.xpHint}>+250 XP per race · +500 XP bonus for wins</Text>
          </View>

          {/* Track tabs */}
          <View style={styles.trackTabs}>
            {TRACK_TABS.map((tab) => {
              const isActive = activeTrack === tab.value;
              const tabStyle =
                tab.value === 'free'
                  ? styles.tabFree
                  : tab.value === 'premium'
                  ? styles.tabPremium
                  : styles.tabPlus;

              return (
                <Pressable
                  key={tab.value}
                  onPress={() => setActiveTrack(tab.value)}
                  style={[styles.trackTab, tabStyle, isActive && styles.trackTabActive]}
                >
                  <Text
                    style={[
                      styles.trackTabLabel,
                      tab.value === 'free' && { color: Colors.white },
                      tab.value === 'premium' && { color: Colors.yellow },
                      tab.value === 'plus' && { color: '#c084fc' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {tab.sublabel && (
                    <Text
                      style={[
                        styles.trackTabSub,
                        tab.value === 'premium' && { color: Colors.yellow },
                        tab.value === 'plus' && { color: '#c084fc' },
                      ]}
                    >
                      {tab.sublabel}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Reward rows */}
          {filteredRewards.map((reward) => {
            const isEarned = passLevel > reward.level;
            const isCurrent = passLevel === reward.level;
            const isLocked = passLevel < reward.level;

            return (
              <View
                key={`${reward.level}-${reward.name}`}
                style={[
                  styles.rewardRow,
                  isEarned && styles.rewardRowEarned,
                  isCurrent && styles.rewardRowCurrent,
                  isLocked && styles.rewardRowLocked,
                ]}
              >
                {/* Level badge */}
                <View
                  style={[
                    styles.rrLevel,
                    isEarned && styles.rrLevelEarned,
                    isCurrent && styles.rrLevelCurrent,
                    isLocked && styles.rrLevelLocked,
                  ]}
                >
                  <Text
                    style={[
                      styles.rrLevelText,
                      isEarned && { color: Colors.green },
                      isCurrent && { color: Colors.yellow },
                      isLocked && { color: Colors.whiteAlpha25 },
                    ]}
                  >
                    {reward.level}
                  </Text>
                </View>

                {/* Icon */}
                <Text style={styles.rrIcon}>{reward.icon}</Text>

                {/* Info */}
                <View style={styles.rrInfo}>
                  <Text style={[styles.rrName, isCurrent && { color: Colors.yellow }]}>
                    {reward.name}
                  </Text>
                  <Text style={[styles.rrDesc, isCurrent && { color: Colors.yellow }]}>
                    {reward.description}
                  </Text>
                </View>

                {/* Status */}
                {isEarned && <Text style={styles.rrCheck}>✓</Text>}
                {isCurrent && <Text style={styles.rrYou}>YOU</Text>}
                {isLocked && <Text style={styles.rrLock}>✕</Text>}
              </View>
            );
          })}

          {/* Upgrade banner */}
          <View style={styles.upgradeBox}>
            <Text style={styles.upgradeTitle}>Unlock Premium</Text>
            <Text style={styles.upgradeDesc}>
              You've earned {earnedFreeCount} free rewards. See what you're missing!
            </Text>
            <View style={styles.upgradeBtns}>
              <Pressable style={styles.upgradeBtnPrem} onPress={() => router.push('/store')}>
                <LinearGradient
                  colors={['#ffd84d', '#ffc220']}
                  style={styles.upgradeBtnPremGrad}
                >
                  <Text style={styles.upgradeBtnPremText}>Premium $9.99</Text>
                </LinearGradient>
              </Pressable>
              <Pressable style={styles.upgradeBtnPlus} onPress={() => router.push('/store')}>
                <Text style={styles.upgradeBtnPlusText}>Plus $24.99</Text>
              </Pressable>
            </View>
            <Text style={styles.upgradeNote}>One-time per season — Not a subscription</Text>
          </View>
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
    marginBottom: 12,
  },

  /* Pass header */
  passHeader: { alignItems: 'center', marginBottom: 18 },
  passTitle: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.yellow,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  levelText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  levelCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelCircleText: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.ink,
  },
  xpBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.whiteAlpha10,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  xpBarFill: { height: '100%', borderRadius: 3 },
  xpHint: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha35,
    marginTop: 4,
    textAlign: 'center',
  },

  /* Track tabs */
  trackTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  trackTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trackTabActive: { borderWidth: 2 },
  tabFree: {
    backgroundColor: Colors.whiteAlpha07,
    borderColor: Colors.whiteAlpha10,
  },
  tabPremium: {
    backgroundColor: Colors.yellowAlpha08,
    borderColor: Colors.yellowAlpha20,
  },
  tabPlus: {
    backgroundColor: Colors.purpleAlpha12,
    borderColor: Colors.purpleAlpha25,
  },
  trackTabLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
  },
  trackTabSub: {
    fontFamily: Fonts.body,
    fontSize: 10,
    opacity: 0.7,
  },

  /* Reward rows */
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  rewardRowEarned: {
    borderColor: Colors.greenAlpha20,
    backgroundColor: 'rgba(46,204,113,0.05)',
  },
  rewardRowCurrent: {
    borderColor: 'rgba(255,194,32,0.3)',
    backgroundColor: Colors.yellowAlpha08,
  },
  rewardRowLocked: { opacity: 0.4 },

  rrLevel: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rrLevelEarned: { backgroundColor: Colors.greenAlpha20 },
  rrLevelCurrent: { backgroundColor: Colors.yellowAlpha20 },
  rrLevelLocked: { backgroundColor: Colors.whiteAlpha07 },
  rrLevelText: { fontFamily: Fonts.bodyBold, fontSize: 13 },

  rrIcon: { fontSize: 22 },
  rrInfo: { flex: 1 },
  rrName: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  rrDesc: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40 },

  rrCheck: { color: Colors.green, fontWeight: '700', fontSize: 16 },
  rrYou: { color: Colors.yellow, fontFamily: Fonts.bodyBold, fontSize: 10 },
  rrLock: { color: Colors.whiteAlpha25, fontSize: 14 },

  /* Upgrade box */
  upgradeBox: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    backgroundColor: 'rgba(255,194,32,0.06)',
  },
  upgradeTitle: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.yellow,
    marginBottom: 4,
  },
  upgradeDesc: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    marginBottom: 12,
    textAlign: 'center',
  },
  upgradeBtns: { flexDirection: 'row', gap: 8, width: '100%' },
  upgradeBtnPrem: { flex: 1, borderRadius: BorderRadius.pill, overflow: 'hidden' },
  upgradeBtnPremGrad: {
    paddingVertical: 12,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
  },
  upgradeBtnPremText: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.ink,
  },
  upgradeBtnPlus: {
    flex: 1,
    backgroundColor: Colors.purpleAlpha12,
    borderWidth: 2,
    borderColor: Colors.purpleAlpha25,
    borderRadius: BorderRadius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  upgradeBtnPlusText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: '#c084fc',
  },
  upgradeNote: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    marginTop: 8,
  },
});
