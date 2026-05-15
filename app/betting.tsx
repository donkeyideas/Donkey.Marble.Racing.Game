import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore, SeasonStandingEntry } from '../state/gameStore';
import { ALL_COURSES as COURSES } from '../data/courses';
import { SEASON_POINTS } from '../data/seasonSchedule';
import MarbleDot from '../components/MarbleDot';
import CoinPill from '../components/CoinPill';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BET_AMOUNTS = [25, 100, 250, 500];
const DISPLAY_MARBLES = MARBLES;

// ── Flip Card Component ──

interface FlipCardProps {
  marble: MarbleData;
  isSelected: boolean;
  badge: 'favorite' | 'longshot' | 'picked' | undefined;
  odds: number;
  winRate: number | null;
  form: ('gold' | 'silver' | 'miss')[];
  seasonStats: { rank: number; entry: SeasonStandingEntry; weekResults: number[] } | null;
  onSelect: () => void;
}

function FlipCard({ marble, isSelected, badge, odds, winRate, form, seasonStats, onSelect }: FlipCardProps) {
  const flip = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const toggleFlip = useCallback(() => {
    const next = !isFlipped;
    setIsFlipped(next);
    flip.value = withTiming(next ? 1 : 0, { duration: 400 });
  }, [isFlipped, flip]);

  const frontAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 90])}deg` },
    ],
    opacity: flip.value > 0.5 ? 0 : 1,
  }));

  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [-90, 0])}deg` },
    ],
    opacity: flip.value > 0.5 ? 1 : 0,
  }));

  return (
    <View style={[styles.cardWrapper]}>
      {/* Front Face */}
      <Animated.View style={[styles.card, isSelected && styles.cardSelected, frontAnimStyle]}>
        <Pressable
          onPress={onSelect}
          style={({ pressed }) => [styles.cardInner, pressed && styles.cardPressed]}
        >
          <View style={styles.badgeSlot}>
            {badge && (
              <View
                style={[
                  styles.badge,
                  badge === 'favorite' && styles.badgeFavorite,
                  badge === 'longshot' && styles.badgeLongshot,
                  badge === 'picked' && styles.badgePicked,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    badge === 'favorite' && styles.badgeTextFavorite,
                    badge === 'longshot' && styles.badgeTextLongshot,
                    badge === 'picked' && styles.badgeTextPicked,
                  ]}
                >
                  {badge === 'favorite' ? 'FAVORITE' : badge === 'longshot' ? 'LONGSHOT' : 'PICKED'}
                </Text>
              </View>
            )}
          </View>

          <MarbleDot marble={marble} size={52} />
          <Text style={styles.cardName}>{marble.name}</Text>
          <Text style={styles.cardOdds}>{odds.toFixed(1)}x</Text>

          <View style={styles.statsRow}>
            {winRate !== null ? (
              <Text style={styles.winRate}>{winRate}% W</Text>
            ) : (
              <Text style={styles.winRate}>NEW</Text>
            )}
            <View style={styles.formDots}>
              {form.length > 0
                ? form.map((result, di) => (
                    <View key={di} style={[
                      styles.formDot,
                      result === 'gold' && styles.formDotGold,
                      result === 'silver' && styles.formDotSilver,
                      result === 'miss' && styles.formDotMiss,
                    ]} />
                  ))
                : Array.from({ length: 3 }).map((_, di) => (
                    <View key={di} style={[styles.formDot, styles.formDotEmpty]} />
                  ))
              }
            </View>
          </View>

          {/* Flip trigger */}
          <Pressable onPress={toggleFlip} hitSlop={6} style={styles.flipBtn}>
            <Text style={styles.flipBtnText}>STATS</Text>
          </Pressable>
        </Pressable>
      </Animated.View>

      {/* Back Face — Season Stats */}
      <Animated.View style={[styles.card, styles.cardBack, isSelected && styles.cardSelected, backAnimStyle]}>
        <Pressable
          onPress={toggleFlip}
          style={({ pressed }) => [styles.cardBackInner, pressed && styles.cardPressed]}
        >
          <View style={styles.backHeader}>
            <MarbleDot marble={marble} size={22} />
            <Text style={styles.backName}>{marble.name}</Text>
          </View>

          {seasonStats ? (
            <>
              <View style={styles.backStatsGrid}>
                <View style={styles.backStatCell}>
                  <Text style={styles.backStatValue}>#{seasonStats.rank}</Text>
                  <Text style={styles.backStatLabel}>RANK</Text>
                </View>
                <View style={styles.backStatCell}>
                  <Text style={[styles.backStatValue, { color: Colors.yellow }]}>{seasonStats.entry.points}</Text>
                  <Text style={styles.backStatLabel}>PTS</Text>
                </View>
                <View style={styles.backStatCell}>
                  <Text style={styles.backStatValue}>{seasonStats.entry.wins}-{seasonStats.entry.losses}</Text>
                  <Text style={styles.backStatLabel}>W-L</Text>
                </View>
                <View style={styles.backStatCell}>
                  <Text style={styles.backStatValue}>{seasonStats.entry.podiums}</Text>
                  <Text style={styles.backStatLabel}>POD</Text>
                </View>
              </View>

              {/* Weekly placements */}
              {seasonStats.weekResults.length > 0 && (
                <View style={styles.weekResultsRow}>
                  {seasonStats.weekResults.map((place, wi) => (
                    <View key={wi} style={[
                      styles.weekDot,
                      place === 1 && styles.weekDotGold,
                      place >= 2 && place <= 3 && styles.weekDotSilver,
                      place > 3 && styles.weekDotMiss,
                    ]}>
                      <Text style={styles.weekDotText}>{place}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.backNoData}>No season data</Text>
          )}

          <Pressable onPress={onSelect} style={styles.selectFromBack}>
            <Text style={styles.selectFromBackText}>SELECT</Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function BettingScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const selectedMarble = useGameStore((s) => s.selectedMarble);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const betAmount = useGameStore((s) => s.betAmount);
  const setBetAmount = useGameStore((s) => s.setBetAmount);
  const betsToday = useGameStore((s) => s.betsToday);
  const placeBet = useGameStore((s) => s.placeBet);
  const odds = useGameStore((s) => s.getOdds());
  const standings = useGameStore((s) => s.seasonStandings);
  const raceHistory = useGameStore((s) => s.raceHistory);
  const seasonWeek = useGameStore((s) => s.seasonWeek);

  const activeMode = useGameStore((s) => s.activeMode);
  const selectedCourseId = useGameStore((s) => s.selectedCourseId);
  const season = useGameStore((s) => s.season);
  const selectedOdds = selectedMarble ? odds[selectedMarble.id] : 0;
  const potential = Math.round(betAmount * selectedOdds);

  // Franchise mode: auto-select the season marble and lock others
  const isFranchiseLocked = season?.seasonMode === 'franchise'
    && season.seasonMarbleId
    && (activeMode.type === 'season' || activeMode.type === 'playoff');
  const franchiseMarble = isFranchiseLocked
    ? MARBLES.find((m) => m.id === season!.seasonMarbleId) ?? null
    : null;

  useEffect(() => {
    if (franchiseMarble && (!selectedMarble || selectedMarble.id !== franchiseMarble.id)) {
      selectMarble(franchiseMarble);
    }
  }, [franchiseMarble]);

  // Season stats per marble (for card back)
  const getSeasonStats = useCallback((marbleId: string) => {
    if (!season) return null;
    const entry = season.standings[marbleId];
    if (!entry) return null;

    // Rank
    const sorted = Object.entries(season.standings)
      .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins);
    const rank = sorted.findIndex(([id]) => id === marbleId) + 1;

    // Weekly placement results
    const weekResults: number[] = [];
    for (const week of season.schedule) {
      const race = week.races[0];
      if (race.status === 'completed' && race.positions) {
        const pos = race.positions.indexOf(marbleId);
        if (pos >= 0) weekResults.push(pos + 1);
      }
    }

    return { rank, entry, weekResults };
  }, [season]);

  // Current course — pre-set for season/national/tournament, otherwise from schedule
  const currentCourse = COURSES.find(c => c.id === selectedCourseId) || COURSES[(seasonWeek - 1) % COURSES.length];

  // Form dots: last 5 race finishes for a marble (green=1st, yellow=2nd-3rd, red=4th+)
  const getForm = (marbleId: string) => {
    return raceHistory.slice(-5).map(race => {
      const pos = race.positions.indexOf(marbleId);
      if (pos === 0) return 'gold';
      if (pos === 1 || pos === 2) return 'silver';
      return 'miss';
    });
  };

  // Win rate from standings
  const getWinRate = (marbleId: string) => {
    const record = standings[marbleId];
    if (!record || (record.wins + record.losses === 0)) return null;
    return Math.round((record.wins / (record.wins + record.losses)) * 100);
  };

  // Recent winners for the results strip
  const recentWinners = raceHistory.slice(-10).reverse().map(race => {
    return MARBLES.find(m => m.id === race.positions[0]);
  }).filter(Boolean) as MarbleData[];

  const handleLockIn = () => {
    if (!selectedMarble) return;
    // Tag this as a standard bet mode (unless already set by season/national/tournament)
    const currentMode = useGameStore.getState().activeMode;
    if (currentMode.type !== 'season' && currentMode.type !== 'national_race' && currentMode.type !== 'tournament' && currentMode.type !== 'playoff') {
      useGameStore.getState().setActiveMode({ type: 'bet' });
    }
    const success = placeBet();
    if (success) {
      router.push('/race');
    }
  };

  // Find favorite (lowest odds) and longshot (highest odds) from displayed marbles
  const favoriteId = DISPLAY_MARBLES.reduce((best, m) => odds[m.id] < odds[best.id] ? m : best).id;
  const longshotId = DISPLAY_MARBLES.reduce((worst, m) => odds[m.id] > odds[worst.id] ? m : worst).id;

  const getBadge = (_index: number, marble: MarbleData): 'favorite' | 'longshot' | 'picked' | undefined => {
    if (selectedMarble?.id === marble.id) return 'picked';
    if (marble.id === favoriteId) return 'favorite';
    if (marble.id === longshotId) return 'longshot';
    return undefined;
  };

  return (
    <LinearGradient colors={['#0d3a8f', '#0a1a3a']} style={styles.fill}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <View style={styles.backRow}>
            <Text style={styles.backArrow}>{'\u2039'}</Text>
            <Text style={styles.backLabel}>BACK</Text>
          </View>
        </Pressable>

        <Text style={styles.timer}>{'\u23F1'}</Text>

        <CoinPill amount={coins} />
      </View>

      {/* Course + Title */}
      <Text style={styles.courseLabel}>
        {currentCourse.name.toUpperCase()}
        {activeMode.type === 'season' ? ` — WEEK ${activeMode.weekNumber}` : ''}
        {activeMode.type === 'national_race' ? ` — ${activeMode.eventId.toUpperCase().replace('-', ' ')}` : ''}
      </Text>
      <Text style={styles.title}>
        {isFranchiseLocked ? `RACING AS ${franchiseMarble!.name.toUpperCase()}` : 'PICK YOUR MARBLE'}
      </Text>

      {/* Franchise banner */}
      {isFranchiseLocked && (
        <View style={styles.franchiseBanner}>
          <MarbleDot marble={franchiseMarble!} size={18} />
          <Text style={styles.franchiseBannerText}>
            FRANCHISE MODE — {activeMode.type === 'playoff' ? 'PLAYOFFS' : `WEEK ${(activeMode as any).weekNumber ?? ''}`}
          </Text>
        </View>
      )}

      {/* Marble grid */}
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {DISPLAY_MARBLES.map((marble, index) => {
            const isLocked = isFranchiseLocked && marble.id !== franchiseMarble!.id;
            return (
              <View key={marble.id} style={[isLocked && styles.lockedCard]}>
                <FlipCard
                  marble={marble}
                  isSelected={selectedMarble?.id === marble.id}
                  badge={isLocked ? undefined : getBadge(index, marble)}
                  odds={odds[marble.id]}
                  winRate={getWinRate(marble.id)}
                  form={getForm(marble.id)}
                  seasonStats={getSeasonStats(marble.id)}
                  onSelect={() => { if (!isLocked) selectMarble(marble); }}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Recent Results strip */}
      {recentWinners.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>RECENT WINNERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentScroll}>
            {recentWinners.map((winner, i) => (
              <View key={i} style={styles.recentItem}>
                <View style={[styles.recentDot, { backgroundColor: winner.colorLight }]} />
                <Text style={styles.recentName}>{winner.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {/* Your pick line with payout tiers */}
        <Text style={styles.pickLine}>
          YOUR PICK:{' '}
          <Text style={styles.pickName}>
            {selectedMarble ? selectedMarble.name.toUpperCase() : '---'}
          </Text>
          {selectedMarble ? (
            <Text style={styles.pickOdds}> — {selectedOdds.toFixed(1)}x</Text>
          ) : null}
        </Text>
        {selectedMarble && (
          <Text style={styles.payoutTiers}>
            1st: +{potential} · 2nd: +{Math.round(betAmount * 0.5)} · 3rd: +{Math.round(betAmount * 0.25)}
          </Text>
        )}

        {/* Bet amount buttons */}
        <View style={styles.betRow}>
          {BET_AMOUNTS.map((amount) => {
            const active = betAmount === amount;
            return (
              <Pressable
                key={amount}
                onPress={() => setBetAmount(amount)}
                style={[styles.betBtn, active && styles.betBtnActive]}
              >
                <Text style={[styles.betBtnText, active && styles.betBtnTextActive]}>
                  {amount}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Lock in CTA */}
        <Pressable
          onPress={handleLockIn}
          disabled={!selectedMarble}
          style={({ pressed }) => [
            styles.lockInBtn,
            !selectedMarble && styles.lockInBtnDisabled,
            pressed && selectedMarble && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={[Colors.yellowBright, Colors.yellow]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.lockInGradient}
          >
            <Text style={styles.lockInText}>
              LOCK IN {betAmount} {'\u2192'} WIN UP TO {potential}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Footer */}
        <Text style={styles.footerText}>
          {betsToday} of 10 bets today
        </Text>
      </View>
    </LinearGradient>
  );
}

const CARD_GAP = 10;
const CARD_WIDTH = (SCREEN_WIDTH - 40 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backArrow: {
    color: Colors.white,
    fontSize: 24,
    fontFamily: Fonts.bodySemiBold,
    marginRight: 4,
    marginTop: -2,
  },
  backLabel: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: Fonts.bodyBold,
  },
  timer: {
    color: Colors.yellow,
    fontSize: 18,
    fontFamily: Fonts.bodyBold,
  },

  // Course label
  courseLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.yellowDeep,
    textAlign: 'center',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginBottom: 2,
  },

  // Title
  title: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },

  // Grid
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },

  // Card
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardInner: {
    padding: 14,
    alignItems: 'center',
  },
  cardSelected: {
    backgroundColor: Colors.yellowAlpha15,
    borderColor: Colors.yellow,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    marginTop: 8,
    textAlign: 'center',
  },
  cardOdds: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    marginTop: 2,
    textAlign: 'center',
  },

  // Stats row (win rate + form dots)
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  winRate: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
  },
  formDots: {
    flexDirection: 'row',
    gap: 3,
  },
  formDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  formDotGold: {
    backgroundColor: Colors.yellow,
  },
  formDotSilver: {
    backgroundColor: Colors.whiteAlpha50,
  },
  formDotMiss: {
    backgroundColor: Colors.red,
  },
  formDotEmpty: {
    backgroundColor: Colors.whiteAlpha15,
  },

  // Badges
  badgeSlot: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  badgeFavorite: {
    backgroundColor: Colors.greenAlpha20,
  },
  badgeLongshot: {
    backgroundColor: Colors.redAlpha20,
  },
  badgePicked: {
    backgroundColor: Colors.yellowAlpha20,
  },
  badgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  badgeTextFavorite: {
    color: Colors.green,
  },
  badgeTextLongshot: {
    color: Colors.red,
  },
  badgeTextPicked: {
    color: Colors.ink,
  },

  // Flip trigger
  flipBtn: {
    marginTop: 8,
    backgroundColor: Colors.whiteAlpha07,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  flipBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: Colors.whiteAlpha35,
    letterSpacing: 0.5,
  },

  // Back face
  cardBackInner: {
    padding: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  backHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  backName: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.white },
  backStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: '100%', marginBottom: 4 },
  backStatCell: { width: '46%', backgroundColor: Colors.whiteAlpha07, borderRadius: 6, paddingVertical: 4, alignItems: 'center' },
  backStatLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: Colors.whiteAlpha35, letterSpacing: 0.5 },
  backStatValue: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  backNoData: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha25, marginTop: 10 },

  weekResultsRow: { flexDirection: 'row', gap: 3, marginBottom: 4, flexWrap: 'wrap', justifyContent: 'center' },
  weekDot: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  weekDotGold: { backgroundColor: Colors.yellowAlpha20 },
  weekDotSilver: { backgroundColor: 'rgba(192,192,192,0.15)' },
  weekDotMiss: { backgroundColor: Colors.redAlpha20 },
  weekDotText: { fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.white },

  selectFromBack: { backgroundColor: Colors.yellowAlpha20, paddingVertical: 5, paddingHorizontal: 16, borderRadius: 8 },
  selectFromBackText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.yellow, letterSpacing: 0.5 },

  // Recent results
  recentSection: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  recentTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha35,
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  recentScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  recentItem: {
    alignItems: 'center',
    gap: 3,
  },
  recentDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  recentName: {
    fontFamily: Fonts.body,
    fontSize: 9,
    color: Colors.whiteAlpha50,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: '#0a1a3a',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  pickLine: {
    color: Colors.whiteAlpha50,
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    textAlign: 'center',
    marginBottom: 4,
  },
  payoutTiers: {
    color: Colors.whiteAlpha35,
    fontSize: 11,
    fontFamily: Fonts.body,
    textAlign: 'center',
    marginBottom: 10,
  },
  pickName: {
    color: Colors.yellow,
    fontFamily: Fonts.bodyBold,
  },
  pickOdds: {
    color: Colors.whiteAlpha50,
  },

  // Bet buttons
  betRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  betBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  betBtnActive: {
    backgroundColor: Colors.yellowAlpha20,
    borderColor: Colors.yellow,
  },
  betBtnText: {
    color: Colors.white,
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
  },
  betBtnTextActive: {
    color: Colors.yellow,
  },

  // Lock in CTA
  lockInBtn: {
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 10,
  },
  lockInBtnDisabled: {
    opacity: 0.4,
  },
  lockInGradient: {
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockInText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.ink,
  },

  // Footer
  footerText: {
    color: Colors.whiteAlpha25,
    fontSize: 11,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },

  // Franchise mode
  franchiseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,194,32,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.2)',
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  franchiseBannerText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.yellow,
    letterSpacing: 0.5,
  },
  lockedCard: {
    opacity: 0.35,
  },
});
