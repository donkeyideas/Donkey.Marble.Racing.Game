import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import { MP_TIERS } from '../lib/multiplayer';

const TOURNAMENTS_LIST = [
  {
    id: 'daily-blitz',
    name: 'DAILY BLITZ',
    subtitle: '8 marbles · Last place eliminated each round',
    prizePool: '5,000',
    entryFee: 100,
    format: '8 marbles · 7 rounds',
    payoutPreview: 'R4: 50 · R5: 100 · R6: 250 · R7: 4,600',
    colors: ['#00b4d8', '#0077b6'] as [string, string],
    minLevel: 0,
  },
  {
    id: 'weekly-cup',
    name: 'WEEKLY CUP',
    subtitle: 'Higher stakes · King of the Hill elimination',
    prizePool: '25,000',
    entryFee: 500,
    format: '8 marbles · 7 rounds',
    payoutPreview: 'R4: 250 · R5: 500 · R6: 1,250 · R7: 23K',
    colors: ['#ffc220', '#e6a800'] as [string, string],
    minLevel: 0,
  },
  {
    id: 'champion-invitational',
    name: 'CHAMPION INVITATIONAL',
    subtitle: 'Top stakes · Winner takes all',
    prizePool: '50,000',
    entryFee: 1000,
    format: '8 marbles · 7 rounds',
    payoutPreview: 'R4: 500 · R5: 1K · R6: 2,500 · R7: 46K',
    colors: ['#e74c3c', '#c0392b'] as [string, string],
    minLevel: 10,
  },
];

export default function TournamentsScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const passLevel = useGameStore((s) => s.passLevel);
  const tournaments = useGameStore((s) => s.tournaments);
  const enterTournament = useGameStore((s) => s.enterTournament);

  const handleEnter = (tourneyId: string) => {
    // If already in a tournament, go to bracket
    if (tournaments && tournaments.tournamentId === tourneyId) {
      router.push('/tournament-bracket');
      return;
    }

    const success = enterTournament(tourneyId);
    if (success) {
      router.push('/tournament-bracket');
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
            <BackButton onPress={() => router.push('/lobby')} />
            <CoinPill amount={coins} />
          </View>

          {/* Title */}
          <Text style={styles.title}>TOURNAMENTS</Text>
          <Text style={styles.subtitle}>
            King of the Hill · Last place eliminated each round
          </Text>

          {/* Active tournament banner */}
          {tournaments && tournaments.status === 'active' && (
            <Pressable
              onPress={() => router.push('/tournament-bracket')}
              style={styles.activeBanner}
            >
              <Text style={styles.activeBannerText}>
                Active tournament in progress — Tap to continue
              </Text>
              <Text style={styles.activeBannerRound}>
                Round {tournaments.currentRound + 1} of 7 · {8 - tournaments.currentRound} marbles left
              </Text>
            </Pressable>
          )}

          {tournaments?.status === 'champion' && (
            <View style={styles.championBanner}>
              <Text style={styles.championBannerText}>TOURNAMENT CHAMPION!</Text>
              <Text style={styles.championBannerPrize}>+{tournaments.prizePool} coins</Text>
            </View>
          )}

          {tournaments?.status === 'eliminated' && (
            <View style={styles.eliminatedBanner}>
              <Text style={styles.eliminatedBannerText}>Eliminated in Round {tournaments.currentRound}</Text>
            </View>
          )}

          {/* Tournaments */}
          <Text style={styles.sectionTitle}>AVAILABLE TOURNAMENTS</Text>

          {TOURNAMENTS_LIST.map((tourney) => {
            const isLocked = tourney.minLevel > 0 && passLevel < tourney.minLevel;
            const canAfford = coins >= tourney.entryFee;
            const isActive = tournaments?.tournamentId === tourney.id && tournaments.status === 'active';

            return (
              <Pressable
                key={tourney.id}
                onPress={() => {
                  if (!isLocked && (canAfford || isActive)) {
                    handleEnter(tourney.id);
                  }
                }}
                style={({ pressed }) => [
                  pressed && !isLocked && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <LinearGradient
                  colors={isLocked ? ['#444', '#333'] : tourney.colors}
                  style={[styles.tourneyCard, isLocked && { opacity: 0.6 }]}
                >
                  <View style={styles.tourneyHeader}>
                    <Text style={styles.tourneyName}>{tourney.name}</Text>
                    {isLocked && (
                      <View style={styles.lockedBadge}>
                        <Text style={styles.lockedText}>LEVEL {tourney.minLevel}</Text>
                      </View>
                    )}
                    {isActive && (
                      <View style={styles.activeBadge}>
                        <Text style={styles.activeText}>IN PROGRESS</Text>
                      </View>
                    )}
                    {!isLocked && !isActive && (
                      <View style={styles.openBadge}>
                        <Text style={styles.openText}>OPEN</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.tourneySub}>{tourney.subtitle}</Text>

                  <View style={styles.tourneyStats}>
                    <View style={styles.tourneyStat}>
                      <Text style={styles.tourneyStatLabel}>PRIZE POOL</Text>
                      <Text style={styles.tourneyStatValue}>{tourney.prizePool}</Text>
                    </View>
                    <View style={styles.tourneyStat}>
                      <Text style={styles.tourneyStatLabel}>ENTRY</Text>
                      <Text style={styles.tourneyStatValue}>{tourney.entryFee}</Text>
                    </View>
                    <View style={styles.tourneyStat}>
                      <Text style={styles.tourneyStatLabel}>FORMAT</Text>
                      <Text style={styles.tourneyStatValue}>{tourney.format}</Text>
                    </View>
                  </View>
                  <View style={styles.payoutPreviewRow}>
                    <Text style={styles.payoutPreviewLabel}>PAYOUTS</Text>
                    <Text style={styles.payoutPreviewText}>{tourney.payoutPreview}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}

          {/* Multiplayer Section */}
          <Text style={styles.sectionTitle}>MULTIPLAYER TOURNAMENTS</Text>

          <Pressable
            onPress={() => {
              const uid = useGameStore.getState().firebaseUid;
              if (!uid) {
                Alert.alert(
                  'Sign In Required',
                  'You need to sign in to play multiplayer tournaments. Go to Settings to sign in with Google or Apple.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Settings', onPress: () => router.push('/settings') },
                  ],
                );
                return;
              }
              router.push({ pathname: '/multiplayer-lobby', params: { tier: 'daily' } });
            }}
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient
              colors={['#8e44ad', '#6c3483']}
              style={styles.tourneyCard}
            >
              <View style={styles.tourneyHeader}>
                <Text style={styles.tourneyName}>MULTIPLAYER BLITZ</Text>
                <View style={[styles.openBadge, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                  <Text style={styles.openText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.tourneySub}>
                8 real players · Draft marbles · Last place eliminated
              </Text>
              <View style={styles.tourneyStats}>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>PRIZE POOL</Text>
                  <Text style={styles.tourneyStatValue}>5,000</Text>
                </View>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>ENTRY</Text>
                  <Text style={styles.tourneyStatValue}>100</Text>
                </View>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>PLAYERS</Text>
                  <Text style={styles.tourneyStatValue}>8</Text>
                </View>
              </View>
              <View style={styles.payoutPreviewRow}>
                <Text style={styles.payoutPreviewLabel}>PAYOUTS</Text>
                <Text style={styles.payoutPreviewText}>1st: 3K · 2nd: 1K · 3rd: 500</Text>
              </View>
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => {
              const uid = useGameStore.getState().firebaseUid;
              if (!uid) {
                Alert.alert(
                  'Sign In Required',
                  'You need to sign in to play multiplayer tournaments. Go to Settings to sign in with Google or Apple.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Settings', onPress: () => router.push('/settings') },
                  ],
                );
                return;
              }
              if (passLevel < 10) {
                Alert.alert('Level Required', 'You need Level 10+ to enter the Champion Multiplayer.');
                return;
              }
              router.push({ pathname: '/multiplayer-lobby', params: { tier: 'champion' } });
            }}
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient
              colors={passLevel >= 10 ? ['#c0392b', '#922b21'] : ['#444', '#333']}
              style={[styles.tourneyCard, passLevel < 10 && { opacity: 0.6 }]}
            >
              <View style={styles.tourneyHeader}>
                <Text style={styles.tourneyName}>CHAMPION MP</Text>
                {passLevel < 10 ? (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedText}>LEVEL 10</Text>
                  </View>
                ) : (
                  <View style={[styles.openBadge, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                    <Text style={styles.openText}>LIVE</Text>
                  </View>
                )}
              </View>
              <Text style={styles.tourneySub}>
                Top stakes · 8 players · Winner takes all
              </Text>
              <View style={styles.tourneyStats}>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>PRIZE POOL</Text>
                  <Text style={styles.tourneyStatValue}>50,000</Text>
                </View>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>ENTRY</Text>
                  <Text style={styles.tourneyStatValue}>1,000</Text>
                </View>
                <View style={styles.tourneyStat}>
                  <Text style={styles.tourneyStatLabel}>PLAYERS</Text>
                  <Text style={styles.tourneyStatValue}>8</Text>
                </View>
              </View>
              <View style={styles.payoutPreviewRow}>
                <Text style={styles.payoutPreviewLabel}>PAYOUTS</Text>
                <Text style={styles.payoutPreviewText}>1st: 30K · 2nd: 10K · 3rd: 5K</Text>
              </View>
            </LinearGradient>
          </Pressable>

          {/* How it works */}
          <Text style={styles.sectionTitle}>HOW TOURNAMENTS WORK</Text>
          <View style={styles.howCard}>
            <View style={styles.howStep}>
              <View style={styles.howNum}><Text style={styles.howNumText}>1</Text></View>
              <Text style={styles.howText}>Pay the entry fee and pick ONE marble</Text>
            </View>
            <View style={styles.howStep}>
              <View style={styles.howNum}><Text style={styles.howNumText}>2</Text></View>
              <Text style={styles.howText}>All marbles race together each round</Text>
            </View>
            <View style={styles.howStep}>
              <View style={styles.howNum}><Text style={styles.howNumText}>3</Text></View>
              <Text style={styles.howText}>Last place gets eliminated every round</Text>
            </View>
            <View style={styles.howStep}>
              <View style={styles.howNum}><Text style={styles.howNumText}>4</Text></View>
              <Text style={styles.howText}>Earn coins each round you survive (payouts start at Round 4)</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}


const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', marginBottom: 16 },

  sectionTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.whiteAlpha50, letterSpacing: 2, marginBottom: 10, marginTop: 10 },

  /* Active/champion/eliminated banners */
  activeBanner: {
    backgroundColor: Colors.yellowAlpha15,
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  activeBannerText: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.yellow },
  activeBannerRound: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40, marginTop: 4 },
  championBanner: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(46,204,113,0.2)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  championBannerText: { fontFamily: Fonts.display, fontSize: 16, color: Colors.green },
  championBannerPrize: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow, marginTop: 4 },
  eliminatedBanner: {
    backgroundColor: Colors.redAlpha20,
    borderWidth: 2,
    borderColor: 'rgba(231,76,60,0.3)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  eliminatedBannerText: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.red },

  /* Tournament cards */
  tourneyCard: { borderRadius: BorderRadius.lg, padding: 18, marginBottom: 10 },
  tourneyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tourneyName: { fontFamily: Fonts.display, fontSize: 18, color: Colors.white, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  tourneySub: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 12 },
  openBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  openText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.white, letterSpacing: 0.5 },
  activeBadge: { backgroundColor: Colors.yellowAlpha20, paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  activeText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.yellow, letterSpacing: 0.5 },
  lockedBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  lockedText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.whiteAlpha50, letterSpacing: 0.5 },

  payoutPreviewRow: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payoutPreviewLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  payoutPreviewText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.yellow,
    flex: 1,
  },

  tourneyStats: { flexDirection: 'row', gap: 12 },
  tourneyStat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 8, alignItems: 'center' },
  tourneyStatLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 2 },
  tourneyStatValue: { fontFamily: Fonts.display, fontSize: 14, color: Colors.white },

  /* How it works */
  howCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 14,
  },
  howStep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  howNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.whiteAlpha10, alignItems: 'center', justifyContent: 'center' },
  howNumText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha50 },
  howText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha50, flex: 1 },
});
