import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore, SeasonStandingEntry, SeasonMarbleStats, TrainingSession } from '../state/gameStore';
import MarbleDot from '../components/MarbleDot';
import CoinPill from '../components/CoinPill';
import BackButton from '../components/BackButton';
import PrimaryButton from '../components/PrimaryButton';
import { WEEKS_PER_SEASON, SeasonRace, SeasonWeek, isSeasonComplete, getNextAvailableRace, getCurrentWeek } from '../data/seasonSchedule';

function getMarble(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
}

export default function SeasonScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const season = useGameStore((s) => s.season);
  const initSeason = useGameStore((s) => s.initSeason);
  const selectCourse = useGameStore((s) => s.selectCourse);
  const setActiveMode = useGameStore((s) => s.setActiveMode);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const setBetAmount = useGameStore((s) => s.setBetAmount);
  const seedPlayoffs = useGameStore((s) => s.seedPlayoffs);
  const checkDailyStreak = useGameStore((s) => s.checkDailyStreak);
  const dailyStreak = useGameStore((s) => s.dailyStreak);

  const [dailyBonus, setDailyBonus] = useState<{ reward: number; streak: number } | null>(null);
  const [selectedMode, setSelectedMode] = useState<'franchise' | 'bettor' | null>(null);
  const [selectedSeasonMarble, setSelectedSeasonMarble] = useState<MarbleData | null>(null);

  useEffect(() => {
    const result = checkDailyStreak();
    if (result) setDailyBonus(result);
  }, []);

  // Force-clear stale season data from previous format
  useEffect(() => {
    if (season && (
      season.schedule[0]?.races.length > 1 ||
      !season.playerBets ||
      !('seasonMode' in season) ||
      !('seasonStats' in season)
    )) {
      useGameStore.setState({ season: null });
      return;
    }
    // Clear old playoff format (pre-KOTH: had rounds as object with wildcard/semifinal/championship)
    if (season?.playoffs && !Array.isArray(season.playoffs.rounds)) {
      useGameStore.setState({
        season: { ...season, playoffs: null, seasonStats: season.seasonStats ?? {} },
      });
    }
  }, [season]);

  const nextSeasonNum = (season?.seasonNumber ?? 0) + 1;

  const handleStartSeason = () => {
    if (!selectedMode) return;
    if (selectedMode === 'franchise' && !selectedSeasonMarble) return;
    initSeason(
      nextSeasonNum,
      selectedMode,
      selectedMode === 'franchise' ? selectedSeasonMarble!.id : null,
    );
  };

  // No season or empty schedule (after championship reset)? Show start screen
  const needsSetup = !season || season.schedule.length === 0;
  if (needsSetup) {
    const canStart = selectedMode === 'bettor' || (selectedMode === 'franchise' && selectedSeasonMarble);
    return (
      <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <ScrollView style={styles.fill} contentContainerStyle={[styles.scrollContent, styles.centerContent]} showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <BackButton onPress={() => router.push('/lobby')} />
              <View style={{ flex: 1 }} />
            </View>
            <LinearGradient colors={[Colors.yellow, Colors.yellowDeep]} style={styles.seasonBadge}>
              <Text style={styles.seasonBadgeText}>NEW SEASON</Text>
            </LinearGradient>
            <Text style={styles.startTitle}>CHOOSE YOUR MODE</Text>
            <Text style={styles.startDesc}>
              Race through a {WEEKS_PER_SEASON}-week season. Top 6 marbles advance to the playoffs!
            </Text>

            {/* Mode picker cards */}
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeCard, selectedMode === 'franchise' && styles.modeCardSelected]}
                onPress={() => { setSelectedMode('franchise'); setSelectedSeasonMarble(null); }}
              >
                <View style={styles.modeIconWrap}>
                  <MarbleDot marble={MARBLES[0]} size={32} />
                </View>
                <Text style={[styles.modeCardTitle, selectedMode === 'franchise' && styles.modeCardTitleSelected]}>FRANCHISE</Text>
                <Text style={styles.modeCardDesc}>Pick one marble for the whole season. Ride or die.</Text>
              </Pressable>
              <Pressable
                style={[styles.modeCard, selectedMode === 'bettor' && styles.modeCardSelected]}
                onPress={() => { setSelectedMode('bettor'); setSelectedSeasonMarble(null); }}
              >
                <View style={styles.modeIconWrap}>
                  <View style={styles.modeMultiDots}>
                    {MARBLES.slice(0, 4).map((m) => (
                      <MarbleDot key={m.id} marble={m} size={14} />
                    ))}
                  </View>
                </View>
                <Text style={[styles.modeCardTitle, selectedMode === 'bettor' && styles.modeCardTitleSelected]}>BETTOR</Text>
                <Text style={styles.modeCardDesc}>Bet on any marble each race. Pure strategy.</Text>
              </Pressable>
            </View>

            {/* Marble picker — franchise only */}
            {selectedMode === 'franchise' && (
              <View style={styles.marblePickerSection}>
                <Text style={styles.sectionTitle}>PICK YOUR MARBLE</Text>
                <View style={styles.marblePickerGrid}>
                  {MARBLES.map((m) => (
                    <Pressable
                      key={m.id}
                      style={[styles.marblePickerCard, selectedSeasonMarble?.id === m.id && styles.marblePickerCardSelected]}
                      onPress={() => setSelectedSeasonMarble(m)}
                    >
                      <MarbleDot marble={m} size={36} />
                      <Text style={[styles.marblePickerName, selectedSeasonMarble?.id === m.id && { color: Colors.yellow }]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* Start button */}
            <View style={{ marginTop: 16, width: '100%' }}>
              <PrimaryButton
                label={canStart ? `START SEASON ${nextSeasonNum}` : selectedMode ? 'SELECT A MARBLE' : 'CHOOSE A MODE'}
                onPress={handleStartSeason}
                disabled={!canStart}
              />
            </View>

            <Pressable style={styles.backLink} onPress={() => router.push('/lobby')}>
              <Text style={styles.backLinkText}>BACK TO LOBBY</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const currentWeek = getCurrentWeek(season.schedule);
  const nextRace = getNextAvailableRace(season.schedule);
  const seasonComplete = isSeasonComplete(season.schedule);
  const completedCount = season.completedRaceIds.length;
  const totalRaces = WEEKS_PER_SEASON;
  const progressPct = (completedCount / totalRaces) * 100;

  // Current week's data
  const currentWeekData = season.schedule.find((w) => w.status === 'current') || season.schedule[season.schedule.length - 1];

  // Standings sorted by points
  const standings = Object.entries(season.standings)
    .map(([marbleId, entry]) => ({ marbleId, ...entry }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins);

  const isFranchise = season.seasonMode === 'franchise';

  const handlePlayRace = (race: SeasonRace) => {
    selectCourse(race.courseId);
    setActiveMode({ type: 'season', weekNumber: race.weekNumber, raceIndex: race.raceIndex });
    if (isFranchise && season.seasonMarbleId) {
      selectMarble(getMarble(season.seasonMarbleId));
    } else {
      selectMarble(null as any);
    }
    setBetAmount(100);
    router.push('/betting');
  };

  const handleSeedPlayoffs = () => {
    seedPlayoffs();
    router.push('/playoffs');
  };

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* ===== TOP BAR ===== */}
          <View style={styles.topBar}>
            <BackButton onPress={() => router.push('/lobby')} />
            <CoinPill amount={coins} />
          </View>

          {/* ===== SEASON HEADER ===== */}
          <View style={styles.seasonHeader}>
            <LinearGradient colors={[Colors.yellow, Colors.yellowDeep]} style={styles.seasonBadge}>
              <Text style={styles.seasonBadgeText}>SEASON {season.seasonNumber}</Text>
            </LinearGradient>
            <Text style={styles.seasonTitle}>WEEK {currentWeek}</Text>
            <Text style={styles.seasonSub}>
              {completedCount} of {totalRaces} races completed
            </Text>
            {isFranchise && season.seasonMarbleId && (
              <>
                <View style={styles.franchiseBadge}>
                  <MarbleDot marble={getMarble(season.seasonMarbleId)} size={16} />
                  <Text style={styles.franchiseBadgeText}>YOUR MARBLE: {getMarble(season.seasonMarbleId).name.toUpperCase()}</Text>
                </View>
                {season.seasonStats?.[season.seasonMarbleId] && (() => {
                  const g = season.seasonStats[season.seasonMarbleId]!;
                  const base = getMarble(season.seasonMarbleId!).stats;
                  const statKeys: { key: keyof SeasonMarbleStats; label: string; color: string }[] = [
                    { key: 'speed', label: 'SPD', color: '#4dabf7' },
                    { key: 'power', label: 'PWR', color: '#ff6b6b' },
                    { key: 'bounce', label: 'BNC', color: '#69db7c' },
                    { key: 'luck', label: 'LCK', color: '#da77f2' },
                  ];
                  const hasGrowth = g.speed > 0 || g.power > 0 || g.bounce > 0 || g.luck > 0;
                  if (!hasGrowth) return null;
                  return (
                    <View style={styles.statPillsRow}>
                      {statKeys.map(({ key, label, color }) => (
                        <View key={key} style={[styles.statPill, { borderColor: color + '40' }]}>
                          <Text style={[styles.statPillLabel, { color }]}>{label}</Text>
                          <Text style={styles.statPillValue}>{(base[key] + g[key]).toFixed(1)}</Text>
                          {g[key] > 0 && (
                            <Text style={[styles.statPillGrowth, { color }]}>+{g[key].toFixed(1)}</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </>
            )}
          </View>

          {/* ===== PROGRESS BAR ===== */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabelText}>Week 1</Text>
              <Text style={styles.progressLabelText}>Week {WEEKS_PER_SEASON}</Text>
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[Colors.yellow, Colors.yellowDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.max(2, progressPct)}%` }]}
              >
                <View style={styles.progressDot} />
              </LinearGradient>
              <View style={[styles.progressMarker, { left: '80%' }]}>
                <Text style={styles.progressMarkerLabel}>Playoffs</Text>
              </View>
            </View>
          </View>

          {/* ===== DAILY BONUS ===== */}
          {dailyBonus ? (
            <View style={styles.bonusStrip}>
              <View style={styles.bonusIcon}>
                <Text style={styles.bonusIconText}>+</Text>
              </View>
              <View style={styles.bonusInfo}>
                <Text style={styles.bonusTitle}>Daily Bonus Collected!</Text>
                <Text style={styles.bonusDesc}>Day {dailyBonus.streak} streak</Text>
              </View>
              <Text style={styles.bonusAmount}>+{dailyBonus.reward}</Text>
            </View>
          ) : (
            <View style={[styles.bonusStrip, { borderColor: Colors.whiteAlpha10, backgroundColor: Colors.whiteAlpha07 }]}>
              <View style={[styles.bonusIcon, { backgroundColor: Colors.whiteAlpha07 }]}>
                <Text style={[styles.bonusIconText, { color: Colors.whiteAlpha35 }]}>✓</Text>
              </View>
              <View style={styles.bonusInfo}>
                <Text style={[styles.bonusTitle, { color: Colors.whiteAlpha35 }]}>Bonus Already Collected</Text>
                <Text style={styles.bonusDesc}>Day {dailyStreak} streak</Text>
              </View>
            </View>
          )}

          {/* ===== MARBLE TRAINING (franchise only) ===== */}
          {isFranchise && season.seasonMarbleId && !seasonComplete && (() => {
            const marble = getMarble(season.seasonMarbleId!);
            const condition = season.condition?.[season.seasonMarbleId!] ?? 100;
            const stats = season.seasonStats?.[season.seasonMarbleId!] ?? { speed: 0, power: 0, bounce: 0, luck: 0 };
            const trainCost = 200 + (season.trainingHistory?.length ?? 0) * 100;
            const canTrain = !season.trainedThisWeek && coins >= trainCost && !!nextRace;
            const rival = season.rivalMarbleId ? getMarble(season.rivalMarbleId) : null;

            const statKeys: (keyof SeasonMarbleStats)[] = ['speed', 'power', 'bounce', 'luck'];
            const STAT_LABELS: Record<string, string> = { speed: 'SPD', power: 'PWR', bounce: 'BNC', luck: 'LCK' };
            const STAT_COLORS: Record<string, string> = { speed: '#4dabf7', power: '#ff6b6b', bounce: '#69db7c', luck: '#da77f2' };

            return (
              <>
                <Text style={styles.sectionTitle}>MARBLE STATUS</Text>
                <View style={styles.card}>
                  {/* Marble + Condition */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <MarbleDot marble={marble} size={36} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontFamily: Fonts.display, fontSize: 16, color: Colors.white }}>{marble.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha50, width: 65 }}>
                          CONDITION
                        </Text>
                        <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{
                            height: 6, borderRadius: 3, width: `${condition}%`,
                            backgroundColor: condition > 60 ? '#2ecc71' : condition > 30 ? '#f39c12' : '#e74c3c',
                          }} />
                        </View>
                        <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha50, marginLeft: 8 }}>
                          {condition}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Stats */}
                  {statKeys.map(key => {
                    const val = stats[key];
                    const pct = Math.min((val / 3.0) * 100, 100);
                    return (
                      <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.whiteAlpha50, width: 28 }}>
                          {STAT_LABELS[key]}
                        </Text>
                        <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginHorizontal: 6, overflow: 'hidden' }}>
                          <View style={{ height: 4, borderRadius: 2, width: `${Math.max(2, pct)}%`, backgroundColor: STAT_COLORS[key] }} />
                        </View>
                        <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.whiteAlpha50, width: 28, textAlign: 'right' }}>
                          {val.toFixed(1)}
                        </Text>
                      </View>
                    );
                  })}

                  {/* Training buttons */}
                  {nextRace && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.whiteAlpha35, letterSpacing: 0.5, marginBottom: 6 }}>
                        {season.trainedThisWeek ? 'TRAINED THIS WEEK' : `TRAIN (${trainCost} COINS)`}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {statKeys.map(key => (
                          <Pressable
                            key={key}
                            disabled={!canTrain}
                            onPress={() => {
                              const result = useGameStore.getState().trainMarble(key);
                              if (result.success) {
                                // Force re-render
                                setDailyBonus(prev => prev);
                              }
                            }}
                            style={{
                              flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                              backgroundColor: canTrain ? STAT_COLORS[key] + '30' : 'rgba(255,255,255,0.05)',
                              borderWidth: 1,
                              borderColor: canTrain ? STAT_COLORS[key] + '50' : 'rgba(255,255,255,0.08)',
                            }}
                          >
                            <Text style={{
                              fontFamily: Fonts.bodyBold, fontSize: 10,
                              color: canTrain ? STAT_COLORS[key] : Colors.whiteAlpha25,
                            }}>
                              {STAT_LABELS[key]}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Rest button */}
                  {condition < 70 && (
                    <Pressable
                      onPress={() => useGameStore.getState().restMarble(season.seasonMarbleId!)}
                      style={{ marginTop: 8, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(46,204,113,0.15)', borderWidth: 1, borderColor: 'rgba(46,204,113,0.3)' }}
                    >
                      <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 11, color: '#2ecc71' }}>
                        REST (+30% CONDITION)
                      </Text>
                    </Pressable>
                  )}

                  {/* Rival info */}
                  {rival && (
                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                      <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.whiteAlpha35, letterSpacing: 0.5, marginRight: 8 }}>RIVAL</Text>
                      <MarbleDot marble={rival} size={16} />
                      <Text style={{ fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha70, marginLeft: 6, flex: 1 }}>{rival.name}</Text>
                      <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 10, color: '#2ecc71' }}>{season.rivalWins ?? 0}W</Text>
                      <Text style={{ fontFamily: Fonts.body, fontSize: 10, color: Colors.whiteAlpha35, marginHorizontal: 4 }}>-</Text>
                      <Text style={{ fontFamily: Fonts.bodyBold, fontSize: 10, color: '#e74c3c' }}>{season.rivalLosses ?? 0}L</Text>
                    </View>
                  )}
                </View>
              </>
            );
          })()}

          {/* ===== SEASON SCHEDULE ===== */}
          <Text style={styles.sectionTitle}>
            {seasonComplete ? 'SEASON COMPLETE' : 'SEASON SCHEDULE'}
          </Text>

          {!seasonComplete && (
            <View style={styles.card}>
              {season.schedule.map((week, i) => {
                const race = week.races[0];
                const isAvailable = race.status === 'available';
                const isCompleted = race.status === 'completed';
                const isCurrent = week.status === 'current';

                return (
                  <Pressable
                    key={race.id}
                    onPress={() => isAvailable && handlePlayRace(race)}
                    style={[
                      styles.raceRow,
                      i === season.schedule.length - 1 && styles.raceRowLast,
                      isCurrent && !isCompleted && styles.raceRowCurrent,
                    ]}
                  >
                    <View style={styles.raceIndexCol}>
                      <Text style={[styles.raceIndex, isCurrent && !isCompleted && { color: Colors.yellow }]}>
                        {week.weekNumber}
                      </Text>
                    </View>

                    <View style={styles.raceInfo}>
                      <Text style={[styles.raceName, isCompleted && { color: Colors.whiteAlpha35 }]}>
                        Week {week.weekNumber}
                      </Text>
                      <Text style={styles.raceCourse}>
                        {race.courseName}
                      </Text>
                      {race.featuredMatchup && (
                        <View style={styles.matchupRow}>
                          <MarbleDot marble={getMarble(race.featuredMatchup.marble1Id)} size={14} />
                          <Text style={styles.matchupText}>
                            {race.featuredMatchup.headline}
                          </Text>
                          <MarbleDot marble={getMarble(race.featuredMatchup.marble2Id)} size={14} />
                        </View>
                      )}
                    </View>

                    <View style={styles.raceStatusCol}>
                      {isCompleted && (() => {
                        const bet = season.playerBets[race.id];
                        const place = bet?.placement;
                        const placeLabel = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : place ? `${place}th` : '';
                        const isTop3 = place && place <= 3;
                        return (
                          <View style={styles.completedCol}>
                            <View style={styles.completedBadge}>
                              <MarbleDot marble={getMarble(race.winnerId!)} size={16} />
                              <Text style={styles.completedText}>
                                {getMarble(race.winnerId!).name}
                              </Text>
                            </View>
                            {place && (
                              <View style={[styles.placementBadge, isTop3 ? styles.placementBadgeWin : styles.placementBadgeLoss]}>
                                <Text style={[styles.placementText, isTop3 ? styles.placementWin : styles.placementLoss]}>
                                  You: {placeLabel}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                      {isAvailable && (
                        <View style={styles.playBadge}>
                          <Text style={styles.playBadgeText}>{isFranchise ? 'RACE' : 'BET NOW'}</Text>
                        </View>
                      )}
                      {race.status === 'locked' && (
                        <View style={styles.lockedBadge}>
                          <Text style={styles.lockedText}>LOCKED</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ===== SEASON COMPLETE → PLAYOFFS ===== */}
          {seasonComplete && !season.playoffs && (
            <View style={{ marginBottom: Spacing.lg }}>
              <View style={styles.playoffsReadyCard}>
                <Text style={styles.playoffsReadyTitle}>REGULAR SEASON COMPLETE!</Text>
                <Text style={styles.playoffsReadyDesc}>
                  Top 6 marbles advance to King of the Hill playoffs. #1 seed gets 3 lives, #2 gets 2, #3 gets 1!
                </Text>
                <View style={styles.playoffsSeeds}>
                  {standings.slice(0, 6).map((s, i) => (
                    <View key={s.marbleId} style={styles.seedRow}>
                      <Text style={[styles.seedNum, i < 2 && { color: Colors.yellow }]}>#{i + 1}</Text>
                      <MarbleDot marble={getMarble(s.marbleId)} size={20} />
                      <Text style={styles.seedName}>{getMarble(s.marbleId).name}</Text>
                      <Text style={styles.seedPts}>{s.points} pts</Text>
                    </View>
                  ))}
                </View>
              </View>
              <PrimaryButton label="SEED PLAYOFFS" onPress={handleSeedPlayoffs} />
            </View>
          )}

          {season.playoffs && (
            <View style={{ marginBottom: Spacing.lg }}>
              <Pressable style={styles.playoffsLink} onPress={() => season.playoffs?.status === 'complete' ? router.push('/championship') : router.push('/playoffs')}>
                <Text style={styles.playoffsLinkText}>
                  {season.playoffs.status === 'complete'
                    ? 'VIEW CHAMPIONSHIP RESULTS →'
                    : 'CONTINUE PLAYOFFS →'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* ===== FEATURED MATCHUP ===== */}
          {nextRace && (
            <>
              <Text style={styles.sectionTitle}>FEATURED MATCHUP</Text>
              <View style={styles.matchupCard}>
                <View style={styles.matchupVsRow}>
                  <View style={styles.matchupMarbleCol}>
                    <MarbleDot marble={getMarble(nextRace.featuredMatchup.marble1Id)} size={40} />
                    <Text style={styles.matchupMarbleName}>
                      {getMarble(nextRace.featuredMatchup.marble1Id).name}
                    </Text>
                  </View>
                  <View style={styles.matchupVsBadge}>
                    <Text style={styles.matchupVsText}>VS</Text>
                  </View>
                  <View style={styles.matchupMarbleCol}>
                    <MarbleDot marble={getMarble(nextRace.featuredMatchup.marble2Id)} size={40} />
                    <Text style={styles.matchupMarbleName}>
                      {getMarble(nextRace.featuredMatchup.marble2Id).name}
                    </Text>
                  </View>
                </View>
                <Text style={styles.matchupHeadline}>
                  "{nextRace.featuredMatchup.headline}"
                </Text>
              </View>
            </>
          )}

          {/* ===== SEASON STANDINGS ===== */}
          <Text style={styles.sectionTitle}>SEASON STANDINGS</Text>
          <View style={styles.card}>
            {/* Header */}
            <View style={[styles.standingRow, styles.standingHeaderRow]}>
              <View style={styles.rankBadge} />
              <Text style={[styles.standingName, styles.standingHeaderText]}> </Text>
              <Text style={[styles.standingPts, styles.standingHeaderText]}>PTS</Text>
              <Text style={[styles.standingRecord, styles.standingHeaderText]}>W-L</Text>
              <Text style={[styles.standingPod, styles.standingHeaderText]}>POD</Text>
            </View>

            {standings.map((entry, i) => {
              const marble = getMarble(entry.marbleId);
              const isPlayoff = i < 6;
              const isPlayerMarble = isFranchise && entry.marbleId === season.seasonMarbleId;
              return (
                <View
                  key={entry.marbleId}
                  style={[
                    styles.standingRow,
                    i === standings.length - 1 && styles.standingRowLast,
                    !isPlayoff && styles.standingEliminated,
                    i === 5 && styles.standingCutoff,
                    isPlayerMarble && styles.playerMarbleRow,
                  ]}
                >
                  <View style={[
                    styles.rankBadge,
                    i === 0 && styles.rankGold,
                    i === 1 && styles.rankSilver,
                    i === 2 && styles.rankBronze,
                    i > 2 && styles.rankNormal,
                  ]}>
                    <Text style={[
                      styles.rankText,
                      i === 0 && { color: Colors.yellow },
                      i === 1 && { color: '#c0c0c0' },
                      i === 2 && { color: Colors.bronze },
                      i > 2 && { color: Colors.whiteAlpha35 },
                    ]}>
                      {i + 1}
                    </Text>
                  </View>
                  <MarbleDot marble={marble} size={22} />
                  <Text style={styles.standingName}>{marble.name}</Text>
                  {i < 4 && completedCount > 0 && (
                    <View style={styles.tagPlayoff}>
                      <Text style={styles.tagPlayoffText}>PLY</Text>
                    </View>
                  )}
                  {(i === 4 || i === 5) && completedCount > 0 && (
                    <View style={styles.tagBubble}>
                      <Text style={styles.tagBubbleText}>WC</Text>
                    </View>
                  )}
                  <Text style={styles.standingPts}>{entry.points}</Text>
                  <Text style={styles.standingRecord}>{entry.wins}-{entry.losses}</Text>
                  <Text style={styles.standingPod}>{entry.podiums}</Text>
                </View>
              );
            })}
          </View>


          {/* ===== NAV LINKS ===== */}
          <View style={styles.navRow}>
            <Pressable style={styles.navCard} onPress={() => router.push('/analytics')}>
              <Text style={styles.navLabel}>ANALYTICS</Text>
            </Pressable>
            <Pressable style={styles.navCard} onPress={() => router.push('/playoffs')}>
              <Text style={styles.navLabel}>PLAYOFFS</Text>
            </Pressable>
          </View>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },
  centerContent: { justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },

  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  // Start screen
  startCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.lg,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  startTitle: { fontFamily: Fonts.display, fontSize: 24, color: Colors.white, marginBottom: 8, marginTop: 12 },
  startDesc: { fontFamily: Fonts.body, fontSize: 14, color: Colors.whiteAlpha50, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  startDetails: { alignSelf: 'stretch', marginBottom: 20 },
  startDetail: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, marginBottom: 4 },
  backLink: { paddingVertical: 10, marginTop: 8 },
  backLinkText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.whiteAlpha35 },

  // Mode picker
  modeRow: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 4 },
  modeCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.lg,
    padding: 16,
    alignItems: 'center',
  },
  modeCardSelected: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(255,194,32,0.08)',
  },
  modeIconWrap: { marginBottom: 10 },
  modeMultiDots: { flexDirection: 'row', gap: 3 },
  modeCardTitle: { fontFamily: Fonts.display, fontSize: 14, color: Colors.white, marginBottom: 4 },
  modeCardTitleSelected: { color: Colors.yellow },
  modeCardDesc: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40, textAlign: 'center', lineHeight: 16 },

  // Marble picker
  marblePickerSection: { width: '100%', marginTop: 12 },
  marblePickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marblePickerCard: {
    width: '22%',
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
  },
  marblePickerCardSelected: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(255,194,32,0.1)',
  },
  marblePickerName: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.white, marginTop: 4, textAlign: 'center' },

  // Franchise badge in season hub
  franchiseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,194,32,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.2)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  franchiseBadgeText: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.yellow },
  playerMarbleRow: {
    backgroundColor: 'rgba(255,194,32,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.yellow,
  },

  // Stat pills
  statPillsRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap', justifyContent: 'center' },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  statPillLabel: { fontFamily: Fonts.bodyBold, fontSize: 9, letterSpacing: 0.5 },
  statPillValue: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.white },
  statPillGrowth: { fontFamily: Fonts.bodyBold, fontSize: 9 },

  // Season header
  seasonHeader: { alignItems: 'center', marginBottom: 16 },
  seasonBadge: { paddingVertical: 4, paddingHorizontal: 16, borderRadius: BorderRadius.pill, marginBottom: 6 },
  seasonBadgeText: { fontFamily: Fonts.display, fontSize: 12, color: Colors.ink, letterSpacing: 1 },
  seasonTitle: { fontFamily: Fonts.display, fontSize: 28, color: Colors.white, textAlign: 'center' },
  seasonSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, marginTop: 4, textAlign: 'center' },

  // Progress bar
  progressSection: { marginBottom: 18 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabelText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha35 },
  progressTrack: { height: 8, backgroundColor: Colors.whiteAlpha07, borderRadius: 4, position: 'relative' },
  progressFill: { height: 8, borderRadius: 4, position: 'relative', justifyContent: 'center' },
  progressDot: { position: 'absolute', right: -5, top: -4, width: 16, height: 16, backgroundColor: Colors.yellow, borderWidth: 3, borderColor: '#0a3a96', borderRadius: 8 },
  progressMarker: { position: 'absolute', top: -5, width: 2, height: 18, backgroundColor: Colors.whiteAlpha25 },
  progressMarkerLabel: { position: 'absolute', top: 20, fontSize: 9, color: Colors.whiteAlpha25, alignSelf: 'center', left: -16 },

  // Daily bonus
  bonusStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.greenAlpha10, borderWidth: 2, borderColor: 'rgba(46,204,113,0.2)', borderRadius: BorderRadius.md, padding: 12, marginBottom: 14 },
  bonusIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(46,204,113,0.15)', alignItems: 'center', justifyContent: 'center' },
  bonusIconText: { fontFamily: Fonts.display, fontSize: 18, color: Colors.green },
  bonusInfo: { flex: 1 },
  bonusTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.green },
  bonusDesc: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40 },
  bonusAmount: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow },

  // Section title
  sectionTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.whiteAlpha50, letterSpacing: 2, marginBottom: 10, marginTop: 10 },

  // Card
  card: { backgroundColor: Colors.whiteAlpha07, borderWidth: 2, borderColor: Colors.whiteAlpha10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14 },

  // Race rows (this week)
  raceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  raceRowLast: { borderBottomWidth: 0 },
  raceRowCurrent: { backgroundColor: 'rgba(255,194,32,0.05)' },
  raceIndexCol: { width: 24, alignItems: 'center' },
  raceIndex: { fontFamily: Fonts.display, fontSize: 16, color: Colors.whiteAlpha35 },
  raceInfo: { flex: 1 },
  raceName: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.white },
  raceCourse: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha35 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  matchupText: { fontFamily: Fonts.body, fontSize: 10, color: Colors.whiteAlpha25 },
  raceStatusCol: { alignItems: 'flex-end' },
  completedCol: { alignItems: 'flex-end', gap: 2 },
  completedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha35 },
  placementBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  placementBadgeWin: { backgroundColor: Colors.greenAlpha20 },
  placementBadgeLoss: { backgroundColor: Colors.redAlpha20 },
  placementText: { fontFamily: Fonts.bodyBold, fontSize: 12 },
  placementWin: { color: Colors.green },
  placementLoss: { color: Colors.red },
  playBadge: { backgroundColor: Colors.yellow, paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.pill },
  playBadgeText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.ink, letterSpacing: 0.5 },
  lockedBadge: { backgroundColor: Colors.whiteAlpha07, paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.pill },
  lockedText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.whiteAlpha25, letterSpacing: 0.5 },

  // Featured matchup
  matchupCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.lg,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
  },
  matchupVsRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  matchupMarbleCol: { alignItems: 'center', gap: 6 },
  matchupMarbleName: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  matchupVsBadge: { backgroundColor: Colors.redAlpha20, paddingVertical: 4, paddingHorizontal: 10, borderRadius: BorderRadius.pill },
  matchupVsText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.red },
  matchupHeadline: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha40, marginTop: 10 },

  // Playoffs ready
  playoffsReadyCard: {
    backgroundColor: 'rgba(255,194,32,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.2)',
    borderRadius: BorderRadius.lg,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
  },
  playoffsReadyTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.yellow, marginBottom: 6 },
  playoffsReadyDesc: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50, textAlign: 'center', marginBottom: 12 },
  playoffsSeeds: { alignSelf: 'stretch', marginBottom: 4 },
  seedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  seedNum: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha35, width: 22 },
  seedName: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.white, flex: 1 },
  seedPts: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha40 },

  // Playoffs link
  playoffsLink: { alignItems: 'center', paddingVertical: 12, backgroundColor: Colors.whiteAlpha07, borderWidth: 2, borderColor: Colors.whiteAlpha10, borderRadius: BorderRadius.md },
  playoffsLinkText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.yellow, letterSpacing: 0.5 },

  // Standings
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  standingRowLast: { borderBottomWidth: 0 },
  standingHeaderRow: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  standingHeaderText: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: Colors.whiteAlpha25, letterSpacing: 0.5 },
  standingEliminated: { opacity: 0.45 },
  standingCutoff: { borderBottomWidth: 2, borderBottomColor: 'rgba(255,194,32,0.15)' },
  rankBadge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rankGold: { backgroundColor: Colors.yellowAlpha20 },
  rankSilver: { backgroundColor: 'rgba(192,192,192,0.15)' },
  rankBronze: { backgroundColor: 'rgba(205,127,50,0.15)' },
  rankNormal: { backgroundColor: Colors.whiteAlpha07 },
  rankText: { fontFamily: Fonts.bodyBold, fontSize: 12 },
  standingName: { flex: 1, fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.white },
  standingPts: { fontFamily: Fonts.display, fontSize: 14, color: Colors.yellow, width: 30, textAlign: 'right' },
  standingRecord: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha35, width: 34, textAlign: 'right' },
  standingPod: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha25, width: 24, textAlign: 'right' },
  tagPlayoff: { backgroundColor: Colors.greenAlpha20, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6 },
  tagPlayoffText: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.green, letterSpacing: 0.5 },
  tagBubble: { backgroundColor: Colors.yellowAlpha15, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6 },
  tagBubbleText: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.yellow, letterSpacing: 0.5 },

  // Nav row
  navRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  navCard: { flex: 1, backgroundColor: Colors.whiteAlpha07, borderWidth: 2, borderColor: Colors.whiteAlpha12, borderRadius: BorderRadius.md, paddingVertical: 14, alignItems: 'center' },
  navLabel: { fontFamily: Fonts.display, fontSize: 12, color: Colors.white },
});
