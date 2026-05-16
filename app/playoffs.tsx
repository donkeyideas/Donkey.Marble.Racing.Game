import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, MarbleData, BorderRadius, Spacing } from '../theme';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';
import { useGameStore } from '../state/gameStore';
import { ALL_COURSES as COURSES } from '../data/courses';

function getMarble(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
}

export default function PlayoffsScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const season = useGameStore((s) => s.season);
  const selectCourse = useGameStore((s) => s.selectCourse);
  const setActiveMode = useGameStore((s) => s.setActiveMode);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const setBetAmount = useGameStore((s) => s.setBetAmount);

  const playoffs = season?.playoffs;
  const isFranchise = season?.seasonMode === 'franchise';
  const playerMarbleId = season?.seasonMarbleId;
  const playerInPlayoffs = playoffs ? playoffs.seeds.includes(playerMarbleId ?? '') : false;
  const playerSeed = playerInPlayoffs ? (playoffs!.seeds.indexOf(playerMarbleId!) + 1) : null;

  // Build seed map
  const seedMap: Record<string, number> = {};
  if (playoffs) {
    playoffs.seeds.forEach((id, i) => {
      seedMap[id] = i + 1;
    });
  }

  // Build projected seeds from season standings if no playoffs yet
  const projectedSeeds = season
    ? Object.entries(season.standings)
        .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins)
        .slice(0, 6)
        .map(([id]) => id)
    : [];

  const handleRace = () => {
    if (!playoffs || playoffs.status === 'complete') return;
    const randomCourse = COURSES[Math.floor(Math.random() * COURSES.length)];
    selectCourse(randomCourse.id);
    setActiveMode({ type: 'playoff', round: playoffs.currentRound });
    if (isFranchise && playerMarbleId) {
      selectMarble(getMarble(playerMarbleId));
    }
    setBetAmount(0);
    router.push('/race');
  };

  const remainingIds = playoffs
    ? playoffs.seeds.filter(id => !playoffs.eliminatedIds.includes(id))
    : [];
  const marblesLeft = remainingIds.length;

  // Entrance animations
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const seedAnimations = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0)),
  ).current;
  const buttonSlide = useRef(new Animated.Value(40)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Title entrance
    Animated.parallel([
      Animated.spring(titleScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Stagger seed rows
    const seedAnims = seedAnimations.map((anim, i) =>
      Animated.timing(anim, { toValue: 1, duration: 300, delay: 200 + i * 80, useNativeDriver: true }),
    );
    Animated.stagger(80, seedAnims).start();

    // Button slide up
    Animated.parallel([
      Animated.timing(buttonSlide, { toValue: 0, duration: 500, delay: 600, useNativeDriver: true }),
      Animated.timing(buttonOpacity, { toValue: 1, duration: 400, delay: 600, useNativeDriver: true }),
    ]).start();
  }, []);

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
            <BackButton onPress={() => router.push('/season')} />
            <CoinPill amount={coins} />
          </View>

          {/* Title — animated entrance */}
          <Animated.View style={{ opacity: titleOpacity, transform: [{ scale: titleScale }] }}>
            <Text style={styles.title}>KING OF THE HILL</Text>
            <Text style={styles.subtitle}>
              {!playoffs
                ? 'Complete the regular season to seed the playoffs'
                : playoffs.status === 'complete'
                  ? 'The champion has been crowned!'
                  : `Round ${playoffs.currentRound + 1} \u00B7 ${marblesLeft} marbles racing`}
            </Text>
          </Animated.View>

          {/* Champion banner — animated */}
          {playoffs?.status === 'complete' && playoffs.championId && (
            <Animated.View style={{ opacity: titleOpacity, transform: [{ scale: titleScale }] }}>
              <View style={styles.championBanner}>
                <Text style={styles.championText}>SEASON {season?.seasonNumber} CHAMPION!</Text>
                <MarbleDot marble={getMarble(playoffs.championId)} size={48} />
                <Text style={styles.championName}>{getMarble(playoffs.championId).name}</Text>
              </View>
            </Animated.View>
          )}

          {/* Franchise status */}
          {isFranchise && playerMarbleId && playoffs && (
            <View style={styles.franchiseStatus}>
              <MarbleDot marble={getMarble(playerMarbleId)} size={20} />
              <Text style={styles.franchiseStatusText}>
                {!playerInPlayoffs
                  ? "YOUR MARBLE DIDN'T QUALIFY"
                  : playoffs.eliminatedIds.includes(playerMarbleId)
                    ? 'YOUR MARBLE WAS ELIMINATED'
                    : playoffs.status === 'complete' && playoffs.championId === playerMarbleId
                      ? 'YOUR MARBLE IS THE CHAMPION!'
                      : `SEED #${playerSeed} · ${playoffs.lives[playerMarbleId] ?? 0} LIVES`}
              </Text>
            </View>
          )}

          {!playoffs ? (
            // ── Projected seeds ──
            projectedSeeds.length >= 6 ? (
              <>
                <Text style={styles.sectionLabel}>PROJECTED PLAYOFF SEEDS</Text>
                <View style={styles.seedsCard}>
                  {projectedSeeds.map((id, i) => {
                    const marble = getMarble(id);
                    const lives = [3, 2, 1, 0, 0, 0][i];
                    const isPlayer = isFranchise && id === playerMarbleId;
                    return (
                      <View key={id} style={[styles.seedRow, isPlayer && styles.seedRowPlayer]}>
                        <Text style={styles.seedNum}>#{i + 1}</Text>
                        <MarbleDot marble={marble} size={22} />
                        <Text style={[styles.seedName, isPlayer && styles.seedNamePlayer]}>{marble.name}</Text>
                        <View style={styles.livesRow}>
                          {Array.from({ length: lives }).map((_, j) => (
                            <View key={j} style={styles.lifeDot} />
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.livesNote}>
                  1st seed: 3 extra lives · 2nd: 2 lives · 3rd: 1 life
                </Text>
              </>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No races played yet</Text>
                <Text style={styles.emptyDesc}>
                  Play races to build the standings and see projected playoff seeds.
                </Text>
              </View>
            )
          ) : (
            // ── Live KOTH ──
            <>
              {/* Lives display */}
              <Text style={styles.sectionLabel}>SEEDS & LIVES</Text>
              <View style={styles.seedsCard}>
                {playoffs.seeds.map((id, i) => {
                  const marble = getMarble(id);
                  const isEliminated = playoffs.eliminatedIds.includes(id);
                  const livesLeft = playoffs.lives[id] ?? 0;
                  const isPlayer = isFranchise && id === playerMarbleId;
                  const seedAnim = seedAnimations[i] || seedAnimations[0];
                  return (
                    <Animated.View key={id} style={{
                      opacity: seedAnim,
                      transform: [{ translateX: seedAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
                    }}>
                      <View style={[
                        styles.seedRow,
                        isPlayer && styles.seedRowPlayer,
                        isEliminated && styles.seedRowEliminated,
                      ]}>
                        <Text style={[styles.seedNum, isEliminated && styles.seedNumElim]}>#{i + 1}</Text>
                        <MarbleDot marble={marble} size={22} />
                        <Text style={[
                          styles.seedName,
                          isPlayer && styles.seedNamePlayer,
                          isEliminated && styles.seedNameElim,
                        ]}>{marble.name}</Text>
                        {isEliminated ? (
                          <Text style={styles.eliminatedTag}>OUT</Text>
                        ) : (
                          <View style={styles.livesRow}>
                            {Array.from({ length: livesLeft }).map((_, j) => (
                              <View key={j} style={styles.lifeDot} />
                            ))}
                            {livesLeft === 0 && <Text style={styles.noLives}>0</Text>}
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>

              {/* Remaining marbles */}
              <Text style={styles.sectionLabel}>
                {playoffs.status === 'active' ? `STILL RACING · ${marblesLeft}` : 'FINAL STANDINGS'}
              </Text>
              <View style={styles.marblesRow}>
                {remainingIds.map(id => {
                  const marble = getMarble(id);
                  const isPlayer = isFranchise && id === playerMarbleId;
                  return (
                    <View key={id} style={[styles.marbleChip, isPlayer && styles.marbleChipPlayer]}>
                      <MarbleDot marble={marble} size={22} />
                      <Text style={[styles.marbleChipName, isPlayer && styles.marbleChipNamePlayer]}>
                        {marble.name}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Eliminated marbles */}
              {playoffs.eliminatedIds.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>ELIMINATED · {playoffs.eliminatedIds.length}</Text>
                  <View style={styles.marblesRow}>
                    {playoffs.eliminatedIds.map((id, i) => {
                      const marble = getMarble(id);
                      const roundNum = playoffs.rounds.findIndex(r => r.eliminatedMarbleId === id) + 1;
                      return (
                        <View key={id} style={styles.eliminatedChip}>
                          <MarbleDot marble={marble} size={18} />
                          <Text style={styles.eliminatedChipName}>{marble.name}</Text>
                          <Text style={styles.eliminatedRound}>R{roundNum}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Round history */}
              {playoffs.rounds.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>ROUND HISTORY</Text>
                  {playoffs.rounds.map((round, idx) => {
                    const eliminated = round.eliminatedMarbleId ? getMarble(round.eliminatedMarbleId) : null;
                    const saved = round.lifeUsedByMarbleId ? getMarble(round.lifeUsedByMarbleId) : null;
                    return (
                      <View key={idx} style={styles.roundCard}>
                        <View style={styles.roundHeader}>
                          <Text style={styles.roundTitle}>Round {idx + 1}</Text>
                          {eliminated && (
                            <View style={styles.roundElimBadge}>
                              <MarbleDot marble={eliminated} size={14} />
                              <Text style={styles.roundElimText}>{eliminated.name} eliminated</Text>
                            </View>
                          )}
                          {saved && !eliminated && (
                            <View style={styles.roundSavedBadge}>
                              <MarbleDot marble={saved} size={14} />
                              <Text style={styles.roundSavedText}>{saved.name} saved by life!</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.roundFinish}>
                          {round.finishOrder.slice(0, 6).map((mid, pos) => {
                            const m = getMarble(mid);
                            const isElim = mid === round.eliminatedMarbleId;
                            const isSaved = mid === round.lifeUsedByMarbleId && !isElim;
                            return (
                              <View key={mid} style={[
                                styles.finishEntry,
                                isElim && styles.finishEntryElim,
                                isSaved && styles.finishEntrySaved,
                              ]}>
                                <Text style={[styles.finishPos, isElim && styles.finishPosElim]}>{pos + 1}</Text>
                                <MarbleDot marble={m} size={16} />
                                <Text style={[styles.finishName, isElim && styles.finishNameElim]}>{m.name}</Text>
                                {isSaved && <Text style={styles.savedTag}>LIFE USED</Text>}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* Action buttons */}
          <View style={{ height: 20 }} />
          {playoffs?.status === 'active' && (
            <Animated.View style={{ opacity: buttonOpacity, transform: [{ translateY: buttonSlide }] }}>
              <PrimaryButton
                label={`RACE \u00B7 ROUND ${playoffs.currentRound + 1}`}
                onPress={handleRace}
              />
            </Animated.View>
          )}

          {playoffs?.status === 'complete' && (
            <>
              <PrimaryButton
                label="VIEW CHAMPIONSHIP"
                onPress={() => router.push('/championship')}
              />
              <View style={{ height: 8 }} />
            </>
          )}

          <View style={{ height: 8 }} />
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
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  title: { fontFamily: Fonts.display, fontSize: 24, color: Colors.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', marginBottom: 16 },

  /* Champion banner */
  championBanner: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(46,204,113,0.2)',
    borderRadius: BorderRadius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  championText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.yellow, letterSpacing: 2, marginBottom: 12 },
  championName: { fontFamily: Fonts.display, fontSize: 24, color: Colors.white, marginTop: 8 },

  /* Franchise status */
  franchiseStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.yellowAlpha08,
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  franchiseStatusText: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.yellow, letterSpacing: 0.5 },

  /* Section labels */
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },

  /* Seeds card */
  seedsCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 8,
    marginBottom: 12,
  },
  seedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
    gap: 8,
  },
  seedRowPlayer: {
    backgroundColor: Colors.yellowAlpha08,
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
  },
  seedRowEliminated: { opacity: 0.4 },
  seedNum: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha40, width: 24 },
  seedNumElim: { color: Colors.red },
  seedName: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.white, flex: 1 },
  seedNamePlayer: { color: Colors.yellow },
  seedNameElim: { color: Colors.whiteAlpha40, textDecorationLine: 'line-through' },
  livesRow: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  lifeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.green,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.5)',
  },
  noLives: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha25 },
  eliminatedTag: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.red, letterSpacing: 0.5 },
  livesNote: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha25, textAlign: 'center', marginBottom: 16 },

  /* Empty state */
  emptyCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
  },
  emptyTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.whiteAlpha50, marginBottom: 8 },
  emptyDesc: { fontFamily: Fonts.body, fontSize: 14, color: Colors.whiteAlpha35, textAlign: 'center', lineHeight: 20 },

  /* Marble chips */
  marblesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  marbleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  marbleChipPlayer: { borderColor: Colors.yellowAlpha20, backgroundColor: Colors.yellowAlpha08 },
  marbleChipName: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.white },
  marbleChipNamePlayer: { color: Colors.yellow },

  eliminatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    opacity: 0.5,
  },
  eliminatedChipName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha40 },
  eliminatedRound: { fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.red, letterSpacing: 0.5 },

  /* Round history */
  roundCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roundTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  roundElimBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.redAlpha20,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
  },
  roundElimText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.red },
  roundSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.yellowAlpha15,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
  },
  roundSavedText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.yellow },

  roundFinish: { gap: 4 },
  finishEntry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  finishEntryElim: { opacity: 0.4 },
  finishEntrySaved: { backgroundColor: Colors.yellowAlpha08, borderRadius: 4, paddingHorizontal: 4 },
  finishPos: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha50, width: 18 },
  finishPosElim: { color: Colors.red },
  finishName: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50, flex: 1 },
  finishNameElim: { color: Colors.red, textDecorationLine: 'line-through' },
  savedTag: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.yellow, letterSpacing: 0.5 },
});
