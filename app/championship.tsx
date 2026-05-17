import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Animated as RNAnimated, Easing, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, MarbleData, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';
import { useGameStore } from '../state/gameStore';

function getMarble(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
}

// ── Confetti for champion screen ───────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CONFETTI_COLORS = ['#ffc220', '#2ecc71', '#e74c3c', '#3498db', '#9b59b6', '#ff9a1a', '#1abc9c'];
const CONFETTI_COUNT = 32;

function ConfettiBurst() {
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      tx: new RNAnimated.Value(0),
      ty: new RNAnimated.Value(-20),
      rot: new RNAnimated.Value(0),
      opacity: new RNAnimated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      startX: Math.random() * SCREEN_W,
      driftX: (Math.random() - 0.5) * 140,
      fallY: 500 + Math.random() * 400,
      delay: Math.random() * 500,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
      size: 6 + Math.random() * 7,
    })),
  ).current;
  useEffect(() => {
    pieces.forEach((p) => {
      RNAnimated.parallel([
        RNAnimated.timing(p.opacity, { toValue: 1, duration: 200, delay: p.delay, useNativeDriver: true }),
        RNAnimated.timing(p.tx, { toValue: p.driftX, duration: 2400, delay: p.delay, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        RNAnimated.timing(p.ty, { toValue: p.fallY, duration: 2400, delay: p.delay, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        RNAnimated.timing(p.rot, { toValue: p.spin, duration: 2400, delay: p.delay, useNativeDriver: true }),
        RNAnimated.sequence([
          RNAnimated.delay(p.delay + 1800),
          RNAnimated.timing(p.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <RNAnimated.View
          key={i}
          style={{
            position: 'absolute', left: p.startX, top: 0,
            width: p.size, height: p.size * 0.6, backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.tx },
              { translateY: p.ty },
              { rotate: p.rot.interpolate({ inputRange: [-3, 3], outputRange: ['-540deg', '540deg'] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// Champion banner: spring-in scale + pulsing label + glow + coin count-up
function ChampionFanfare({ children, payout }: { children: React.ReactNode; payout: number }) {
  const scale = useRef(new RNAnimated.Value(0)).current;
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const glow = useRef(new RNAnimated.Value(0)).current;
  const [displayCoins, setDisplayCoins] = useState(0);
  useEffect(() => {
    RNAnimated.spring(scale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }).start();
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(pulse, { toValue: 1.05, duration: 800, useNativeDriver: true }),
      RNAnimated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(glow, { toValue: 1, duration: 1100, useNativeDriver: true }),
      RNAnimated.timing(glow, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ])).start();
    if (payout > 0) {
      const start = Date.now();
      const duration = 1400;
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / duration);
        setDisplayCoins(Math.floor(t * payout));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, [payout]);
  return (
    <RNAnimated.View style={{ transform: [{ scale: RNAnimated.multiply(scale, pulse) }] }}>
      <RNAnimated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 20,
          backgroundColor: '#ffc220',
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
        }}
      />
      {children}
      {payout > 0 && (
        <Text style={{
          fontFamily: Fonts.display, fontSize: 22, color: '#2ecc71',
          textAlign: 'center', marginTop: 8,
        }}>
          +{displayCoins.toLocaleString()} coins
        </Text>
      )}
    </RNAnimated.View>
  );
}

// Loss banner: red flash + fade-in, no shake (this is a recap screen, not
// a "you just lost" surprise — softer than the tournament-elim animation).
function LossFanfare({ children }: { children: React.ReactNode }) {
  const flash = useRef(new RNAnimated.Value(0)).current;
  const fade = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.sequence([
      RNAnimated.timing(flash, { toValue: 0.5, duration: 150, useNativeDriver: true }),
      RNAnimated.timing(flash, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();
    RNAnimated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);
  return (
    <>
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#e74c3c', opacity: flash, zIndex: 100 }]}
      />
      <RNAnimated.View style={{ opacity: fade }}>
        {children}
      </RNAnimated.View>
    </>
  );
}

export default function ChampionshipScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const season = useGameStore((s) => s.season);
  const initSeason = useGameStore((s) => s.initSeason);

  const playoffs = season?.playoffs;
  const isComplete = playoffs?.status === 'complete';
  const championId = playoffs?.championId ?? null;
  const seasonHistory = season?.seasonHistory ?? [];
  const isFranchise = season?.seasonMode === 'franchise';
  const playerMarbleId = season?.seasonMarbleId;
  const playerIsChampion = isFranchise && championId === playerMarbleId;

  // Player marble season rank (for franchise summary)
  const playerRank = isFranchise && playerMarbleId && season
    ? Object.entries(season.standings)
        .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins)
        .findIndex(([id]) => id === playerMarbleId) + 1
    : null;

  const handleNewSeason = () => {
    // Keep only seasonHistory, clear everything else so mode picker shows
    const history = season?.seasonHistory ?? [];
    useGameStore.setState({
      season: {
        seasonNumber: (season?.seasonNumber ?? 0),
        seasonMode: 'bettor',
        seasonMarbleId: null,
        schedule: [],
        standings: {},
        completedRaceIds: [],
        playerBets: {},
        playoffs: null,
        seasonHistory: history,
        seasonStats: {},
      } as any,
    });
    router.push('/season');
  };

  return (
    <LinearGradient colors={['#0d1a3a', '#0a1230']} style={styles.fill}>
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

          {/* Title */}
          <Text style={styles.headlineText}>
            SEASON {season?.seasonNumber ?? 1} CHAMPIONSHIP
          </Text>
          <Text style={styles.bigTitle}>King of the Hill</Text>
          <Text style={styles.dateText}>Last place eliminated each round</Text>

          {!playoffs ? (
            // ── No playoffs yet ──
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonTitle}>Championship Awaits</Text>
              <Text style={styles.comingSoonDesc}>
                Play through the regular season and playoffs to crown a champion.
              </Text>
            </View>
          ) : isComplete && championId ? (
            // ── Champion crowned ──
            <>
              {playerIsChampion && <ConfettiBurst />}
              {(() => {
                // Compute placement + payout for the fanfare count-up.
                // Bettor mode always pays a completion bonus = win fanfare.
                // Franchise mode: top-3 wins, otherwise loss fanfare.
                const allEliminated = [...(playoffs?.eliminatedIds ?? [])];
                const placement = playerIsChampion
                  ? 1
                  : (isFranchise && playerMarbleId && allEliminated.includes(playerMarbleId))
                    ? allEliminated.length - allEliminated.indexOf(playerMarbleId) + 1
                    : 0;
                const isWin = !isFranchise || (placement >= 1 && placement <= 3);
                const payout = !isFranchise
                  ? 1500
                  : placement === 1 ? 5000 : placement === 2 ? 2500 : placement === 3 ? 1000 : 0;
                const Banner = (
                  <View style={styles.championBanner}>
                    <Text style={styles.championLabel}>
                      {playerIsChampion ? 'YOUR MARBLE IS THE CHAMPION!' : 'CHAMPION'}
                    </Text>
                    <MarbleDot marble={getMarble(championId)} size={72} />
                    <Text style={styles.championName}>{getMarble(championId).name}</Text>
                    <Text style={styles.championRecord}>
                      Survived {playoffs.rounds.length} rounds
                    </Text>
                  </View>
                );
                return isWin
                  ? <ChampionFanfare payout={payout}>{Banner}</ChampionFanfare>
                  : <LossFanfare>{Banner}</LossFanfare>;
              })()}
              <View style={styles.detailsCard}>
                {isFranchise && playerMarbleId && !playerIsChampion && (
                  <Text style={styles.franchiseSummary}>
                    Your marble {getMarble(playerMarbleId).name} finished Season {season?.seasonNumber} as #{playerRank}
                  </Text>
                )}
                {playerIsChampion && season && playerMarbleId && (
                  <Text style={styles.franchiseSummary}>
                    {getMarble(playerMarbleId).name} went {season.standings[playerMarbleId]?.wins ?? 0}-{season.standings[playerMarbleId]?.losses ?? 0} in the regular season
                  </Text>
                )}

                {/* Playoff reward display. Placement formula matches
                    state/gameStore.ts → seedPlayoffs() so the label and the
                    actual payout agree. */}
                {isFranchise && playerMarbleId && (() => {
                  const allEliminated = [...(playoffs?.eliminatedIds ?? [])];
                  const placement = playerIsChampion
                    ? 1
                    : allEliminated.length > 0 && allEliminated.includes(playerMarbleId)
                      ? allEliminated.length - allEliminated.indexOf(playerMarbleId) + 1
                      : 0;
                  const reward = placement === 1 ? 5000 : placement === 2 ? 2500 : placement === 3 ? 1000 : 0;
                  if (reward <= 0) {
                    return (
                      <View style={styles.rewardBadgeMuted}>
                        <Text style={styles.rewardTextMuted}>
                          Finished #{placement || '—'} · No coin reward this season
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.rewardBadge}>
                      <Text style={styles.rewardText}>
                        +{reward.toLocaleString()} coins ({placement === 1 ? 'Champion' : placement === 2 ? 'Runner-Up' : 'Top 3'})
                      </Text>
                    </View>
                  );
                })()}
                {!isFranchise && (
                  <View style={styles.rewardBadge}>
                    <Text style={styles.rewardText}>+1,500 coins (Season Complete)</Text>
                  </View>
                )}
              </View>

              {/* Lives summary */}
              <Text style={styles.sectionTitle}>LIVES USED</Text>
              <View style={styles.gamesCard}>
                {playoffs.seeds.map((id) => {
                  const seedIdx = playoffs.seeds.indexOf(id);
                  const initialLives = seedIdx === 0 ? 3 : seedIdx === 1 ? 2 : seedIdx === 2 ? 1 : 0;
                  const remaining = playoffs.lives[id] ?? 0;
                  const used = initialLives - remaining;
                  if (initialLives === 0) return null;
                  return (
                    <View key={id} style={styles.gameRow}>
                      <MarbleDot marble={getMarble(id)} size={18} />
                      <Text style={[styles.gameWinner, { flex: 1 }]}>
                        {getMarble(id).name}
                      </Text>
                      <Text style={styles.livesUsedText}>
                        {used}/{initialLives}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Elimination recap */}
              <Text style={styles.sectionTitle}>ELIMINATION ORDER</Text>
              <View style={styles.gamesCard}>
                {playoffs.rounds.map((round, i) => (
                  <View key={i} style={styles.gameRow}>
                    <Text style={styles.gameNum}>R{i + 1}</Text>
                    {round.eliminatedMarbleId ? (
                      <>
                        <MarbleDot marble={getMarble(round.eliminatedMarbleId)} size={18} />
                        <Text style={[styles.gameWinner, { color: Colors.red }]}>
                          {getMarble(round.eliminatedMarbleId).name} eliminated
                        </Text>
                      </>
                    ) : round.lifeUsedByMarbleId ? (
                      <>
                        <MarbleDot marble={getMarble(round.lifeUsedByMarbleId)} size={18} />
                        <Text style={[styles.gameWinner, { color: Colors.yellow }]}>
                          {getMarble(round.lifeUsedByMarbleId).name} saved by life
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.gameWinner}>No elimination</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* New season button */}
              <View style={{ height: 16 }} />
              <PrimaryButton
                label={`START SEASON ${(season?.seasonNumber ?? 1) + 1}`}
                onPress={handleNewSeason}
              />
              <Text style={styles.newSeasonBonus}>
                +{Math.min(2500, 500 + ((season?.seasonNumber ?? 1) - 1) * 250).toLocaleString()} coin starter bonus
              </Text>
            </>
          ) : (
            // ── Playoffs in progress ──
            <>
              <View style={styles.comingSoon}>
                <Text style={styles.comingSoonTitle}>Playoffs In Progress</Text>
                <Text style={styles.comingSoonDesc}>
                  Round {playoffs.currentRound + 1} — {playoffs.seeds.length - playoffs.eliminatedIds.length} marbles remaining
                </Text>
              </View>

              <PrimaryButton
                label="VIEW PLAYOFFS"
                onPress={() => router.push('/playoffs')}
              />
            </>
          )}

          {/* Hall of Fame */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>HALL OF FAME</Text>
          <View style={styles.hofCard}>
            {seasonHistory.length === 0 ? (
              <Text style={styles.hofFooter}>
                The first champion will be etched here forever.
              </Text>
            ) : (
              seasonHistory.map((entry) => (
                <View key={entry.seasonNumber} style={styles.hofRow}>
                  <Text style={styles.hofSeason}>S{entry.seasonNumber}</Text>
                  <MarbleDot marble={getMarble(entry.championId)} size={24} />
                  <Text style={styles.hofName}>{entry.championName}</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ height: 16 }} />
          <PrimaryButton
            label="BACK TO SEASON"
            variant="ghost"
            onPress={() => router.push('/season')}
          />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },

  /* Headline */
  headlineText: {
    textAlign: 'center',
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.yellow,
    letterSpacing: 3,
  },
  bigTitle: {
    textAlign: 'center',
    fontFamily: Fonts.display,
    fontSize: 30,
    color: Colors.white,
    marginBottom: 4,
  },
  dateText: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    marginBottom: 20,
  },

  /* Coming soon */
  comingSoon: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    marginBottom: 20,
  },
  comingSoonTitle: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.yellow,
    marginBottom: 8,
  },
  comingSoonDesc: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Champion banner */
  championBanner: {
    backgroundColor: 'rgba(255,194,32,0.08)',
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  championLabel: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.yellow,
    letterSpacing: 3,
    marginBottom: 12,
  },
  championName: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.white,
    marginTop: 10,
  },
  franchiseSummary: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  championRecord: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.whiteAlpha40,
    marginTop: 4,
  },
  rewardBadge: {
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.25)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 12,
    alignSelf: 'center',
  },
  rewardText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.green,
  },
  rewardBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 12,
    alignSelf: 'center',
  },
  rewardTextMuted: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
  },
  detailsCard: {
    marginTop: 12,
    marginBottom: 16,
    alignItems: 'center',
  },

  /* Games card */
  gamesCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 8,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  gameNum: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    width: 24,
  },
  gameWinner: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  livesUsedText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
  },

  /* Section title */
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    marginBottom: 8,
  },

  /* Hall of Fame */
  hofCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  hofSeason: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    width: 22,
  },
  hofName: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  hofFooter: {
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha25,
    paddingVertical: 8,
  },
  newSeasonBonus: {
    textAlign: 'center',
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.yellow,
    marginTop: 8,
  },
});
