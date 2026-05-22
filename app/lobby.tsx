import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import { showModal } from '../components/GameModal';
import { syncPlayerState } from '../lib/sync';
import { getAnnouncements, getActivePromos, onLiveOpsChange, dismissLiveOpsItem } from '../lib/liveOps';
import { ACHIEVEMENTS } from '../data/achievements';
import { ALL_COURSES, getTrackOfTheDay, type CourseData } from '../data/courses';
import MarbleDot from '../components/MarbleDot';
import CoinPill from '../components/CoinPill';
import { pollSupportReplies, readBannerDismissedCount, writeBannerDismissedCount } from '../lib/supportNotifier';

/* The lobby has no real scheduled-race backend feed, so the "featured"
 * race rotation is derived deterministically from today's date — every
 * player sees the same pool, and it refreshes daily. The hero "LIVE NOW"
 * race + UP NEXT queue rotate client-side: a useState index advances
 * through this pool each time the countdown hits 0 (see HERO section). */
function dayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

/** Size of the rotating featured-course pool the hero cycles through. */
const FEATURED_POOL_SIZE = 8;

/** Picks `count` distinct courses starting at a date-seeded offset. */
function getFeaturedCourses(count: number): CourseData[] {
  const start = dayIndex() % ALL_COURSES.length;
  const out: CourseData[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ALL_COURSES[(start + i) % ALL_COURSES.length]);
  }
  return out;
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ModeCard({
  title,
  subtitle,
  colors,
  onPress,
  badge,
}: {
  title: string;
  subtitle: string;
  colors: [string, string];
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <LinearGradient colors={colors} style={styles.modeCard}>
        {badge && (
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{badge}</Text>
          </View>
        )}
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeSub}>{subtitle}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function LobbyScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const playerName = useGameStore((s) => s.playerName);
  const totalRaces = useGameStore((s) => s.totalRaces);
  const totalWins = useGameStore((s) => s.totalWins);
  const passLevel = useGameStore((s) => s.passLevel);
  const achievements = useGameStore((s) => s.achievements);
  const achievementCount = Object.keys(achievements).length;

  // Daily streak reward
  const [dailyReward, setDailyReward] = useState<{ reward: number; streak: number } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // ===== HERO: featured race rotation + countdown =====
  // The featured pool is a date-seeded slice of ALL_COURSES (refreshes
  // daily). There's no scheduled-race backend, so the rotation is driven
  // client-side: `heroIndex` points at the "LIVE NOW" course; the next
  // two pool entries (wrapping) form the UP NEXT queue. When the countdown
  // hits 0, heroIndex advances — the first UP NEXT race becomes LIVE NOW,
  // the queue shifts up, the next pool course fills the vacated slot, and
  // the countdown resets to its starting value (HERO_COUNTDOWN_START).
  const HERO_COUNTDOWN_START = 60;
  const featuredPool = getFeaturedCourses(FEATURED_POOL_SIZE);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroCourse = featuredPool[heroIndex % featuredPool.length];
  const upNext = [
    featuredPool[(heroIndex + 1) % featuredPool.length],
    featuredPool[(heroIndex + 2) % featuredPool.length],
  ];
  const [heroCountdown, setHeroCountdown] = useState(HERO_COUNTDOWN_START);
  useEffect(() => {
    const id = setInterval(() => {
      setHeroCountdown((n) => {
        if (n <= 1) {
          // Countdown elapsed: rotate the hero / queue forward and reset.
          setHeroIndex((idx) => (idx + 1) % featuredPool.length);
          return HERO_COUNTDOWN_START;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [featuredPool.length]);

  // Routes the player into a quick race on the given course.
  const startCourse = useCallback((courseId: string) => {
    useGameStore.getState().selectCourse(courseId);
    useGameStore.getState().setActiveMode({ type: 'quick_race' });
    useGameStore.getState().resetBet();
    router.push('/race');
  }, [router]);

  // Support replies — polled so the user sees admin responses without
  // manually drilling into Settings → Support. Banner + Settings badge.
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportSubjects, setSupportSubjects] = useState<string[]>([]);
  // Dismiss snapshot persisted in AsyncStorage so a dismissed banner stays
  // dismissed across app restarts. The banner reappears only if a NEW poll
  // brings in MORE unread tickets than the saved snapshot — i.e. a fresh
  // admin reply landed after the last dismiss.
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(null);
  useEffect(() => {
    readBannerDismissedCount().then((v) => setDismissedAtCount(v));
  }, []);
  const dismiss = useCallback(() => {
    setDismissedAtCount(supportUnread);
    writeBannerDismissedCount(supportUnread).catch(() => {});
  }, [supportUnread]);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      pollSupportReplies().then((res) => {
        if (cancelled) return;
        setSupportUnread(res.unreadCount);
        setSupportSubjects(res.unreadSubjects);
      });
    };
    run();
    const id = setInterval(run, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  const showSupportBanner = dismissedAtCount !== null && supportUnread > dismissedAtCount;

  useEffect(() => {
    const optimistic = useGameStore.getState().checkDailyStreak();
    if (!optimistic) return; // Already claimed today (local check)

    // Server returns the authoritative reward + streak. Local state was
    // marked optimistically; the server response overwrites coins/streak.
    useGameStore.getState().claimDailyBonus().then((serverResult) => {
      if (!serverResult) return;
      setDailyReward(serverResult);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(3000),
        Animated.timing(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setDailyReward(null));
    });
  }, []);

  /* Re-render trigger when live-ops change (announcement / promo dismissal,
   * fresh fetch). getAnnouncements / getActivePromos read from a module-
   * level cache; without this hook the lobby wouldn't update when the
   * user taps the banner to dismiss it. */
  const [liveOpsTick, setLiveOpsTick] = useState(0);
  useEffect(() => onLiveOpsChange(() => setLiveOpsTick((n) => n + 1)), []);
  // Touch the tick so React keeps this as a dep even if unused inline.
  void liveOpsTick;

  // Periodic state sync — pushes non-economy hints (streaks, pass XP) and
  // pulls server-authoritative coins / totalRaces / totalWins / dailyStreak.
  // Reconciles any drift on every lobby entry + every 60s while in lobby.
  useEffect(() => {
    const doSync = () => {
      const s = useGameStore.getState();
      if (!s.playerName) return;
      syncPlayerState(
        {
          playerName: s.playerName,
          currentStreak: s.currentStreak,
          bestStreak: s.bestStreak,
          passLevel: s.passLevel,
          passXp: s.passXp,
        },
        (serverState) => {
          // Race / win counters: pull max(local, server), not just server.
          // The server count includes everything that's been synced, but a
          // race played offline (or one whose sync is still queued in
          // raceSyncQueue) hasn't reached the server yet. Snapping straight
          // to server would visually undo that race in the lobby until the
          // queue drains. Daily streak is always server-authoritative.
          const localCounters = useGameStore.getState();
          useGameStore.setState({
            totalRaces: Math.max(localCounters.totalRaces, serverState.totalRaces),
            totalWins: Math.max(localCounters.totalWins, serverState.totalWins),
            dailyStreak: serverState.dailyStreak,
          });

          // Coins: ONE-WAY safe sync. Only pull server→local when the
          // server's value is STRICTLY GREATER than what we have locally
          // (e.g., admin granted a bonus via the dashboard, daily streak
          // claimed in another session, refund). We never snap DOWN here
          // because race / tournament / national payouts are written to
          // the server in the background and a lobby sync hitting during
          // that window would otherwise zero out a payout the player just
          // earned — that's the bug this guard prevents.
          //
          // The applyEconomyAction response path remains the authoritative
          // source for any local-initiated coin change; this is purely to
          // close the loop on changes that originated server-side.
          const local = useGameStore.getState().coins;
          if (serverState.coins > local) {
            useGameStore.setState({ coins: serverState.coins });
          }
        },
      );
    };
    doSync();
    const interval = setInterval(doSync, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== TOP BAR ===== */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>
                  {playerName ? playerName[0].toUpperCase() : 'P'}
                </Text>
              </View>
              <View>
                <Text style={styles.playerName}>{playerName || 'PLAYER'}</Text>
                <Text style={styles.playerSub}>Level {passLevel} · {totalWins}W-{totalRaces - totalWins}L</Text>
              </View>
            </View>
            <CoinPill amount={coins} onPress={() => router.push('/store')} />
          </View>

          {/* ===== ANNOUNCEMENT BANNER =====
              Tap routes to the relevant screen (national-races for live
              event promos, otherwise stays on lobby) AND dismisses the
              banner so it doesn't pop back up next time the same id
              comes through. Dismissed ids are persisted in AsyncStorage
              via dismissLiveOpsItem — see lib/liveOps.ts. */}
          {getAnnouncements().length > 0 && (() => {
            const ann = getAnnouncements()[0];
            const isEventPromo = ann.id.startsWith('auto-live-') || ann.id.startsWith('auto-soon-');
            const handlePress = () => {
              dismissLiveOpsItem(ann.id).catch(() => {});
              if (isEventPromo) router.push('/national-races');
            };
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.announcementBanner,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handlePress}
              >
                <View style={[styles.announcementBadge, {
                  backgroundColor:
                    ann.type === 'warning' ? '#e74c3c'
                    : ann.type === 'maintenance' ? '#f39c12'
                    : ann.type === 'promo' ? '#2ecc71'
                    : '#3498db',
                }]}>
                  <Text style={styles.announcementBadgeText}>
                    {ann.type === 'warning' ? 'WARNING'
                      : ann.type === 'maintenance' ? 'MAINTENANCE'
                      : ann.type === 'promo' ? 'PROMO'
                      : 'INFO'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.announcementTitle}>{ann.title}</Text>
                  <Text style={styles.announcementBody}>{ann.body}</Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={(e) => {
                    e.stopPropagation();
                    dismissLiveOpsItem(ann.id).catch(() => {});
                  }}
                  style={styles.announcementClose}
                >
                  <Text style={styles.announcementCloseText}>×</Text>
                </Pressable>
              </Pressable>
            );
          })()}

          {/* ===== SUPPORT REPLY BANNER ===== */}
          {showSupportBanner && (
            <View style={styles.supportBanner}>
              <Pressable
                style={styles.supportBannerMain}
                onPress={() => {
                  dismiss(); // tapping = same as dismiss (persisted)
                  router.push('/support');
                }}
              >
                <View style={styles.supportBannerBadge}>
                  <Text style={styles.supportBannerBadgeText}>{supportUnread}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportBannerTitle}>
                    {supportUnread === 1 ? 'Support replied to your ticket' : `Support replied to ${supportUnread} tickets`}
                  </Text>
                  <Text style={styles.supportBannerBody} numberOfLines={1}>
                    {supportSubjects[0] ? `Re: ${supportSubjects[0]}` : 'Tap to view'}
                  </Text>
                </View>
              </Pressable>
              <Pressable
                hitSlop={10}
                style={styles.supportBannerClose}
                onPress={dismiss}
              >
                <Text style={styles.supportBannerCloseText}>×</Text>
              </Pressable>
            </View>
          )}

          {/* ===== ACTIVE PROMO BANNER ===== */}
          {getActivePromos().length > 0 && (
            <View style={styles.promoBanner}>
              <Text style={styles.promoText}>{getActivePromos()[0].name} — {Number(getActivePromos()[0].multiplier)}x rewards active</Text>
            </View>
          )}

          {/* ===== MARBLES ROW ===== */}
          <View style={styles.marblesRow}>
            {MARBLES.map((m) => (
              <MarbleDot key={m.id} marble={m} size={32} />
            ))}
          </View>

          {/* ===== HERO: FEATURED RACE ===== */}
          <Pressable
            onPress={() => router.push('/betting')}
            style={({ pressed }) => [pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
          >
            <LinearGradient colors={['#1a4fc2', '#0d3a8f']} style={styles.heroCard}>
              <View style={styles.heroDecor} />
              <View style={styles.heroTopRow}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE NOW</Text>
                </View>
                <Text style={styles.heroTimer}>{formatCountdown(heroCountdown)}</Text>
              </View>
              <Text style={styles.heroTrackName}>{heroCourse.name.toUpperCase()}</Text>
              <Text style={styles.heroTrackDesc} numberOfLines={1}>{heroCourse.description}</Text>
              <View style={styles.heroMarbleRow}>
                {MARBLES.map((m) => (
                  <MarbleDot key={m.id} marble={m} size={28} />
                ))}
              </View>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>PLACE BET</Text>
              </View>
            </LinearGradient>
          </Pressable>

          {/* ===== HERO: UP NEXT QUEUE ===== */}
          <Text style={styles.sectionTitle}>UP NEXT</Text>
          {upNext.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => startCourse(c.id)}
              style={({ pressed }) => [styles.raceCardSmall, pressed && styles.navCardPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.raceCardName}>{c.name.toUpperCase()}</Text>
                <Text style={styles.raceCardDesc} numberOfLines={1}>{c.description}</Text>
              </View>
              <View style={[styles.statusBadge, i === 0 ? styles.statusOpen : styles.statusSoon]}>
                <Text style={[styles.statusBadgeText, i === 0 ? styles.statusOpenText : styles.statusSoonText]}>
                  {i === 0 ? 'OPEN' : 'SOON'}
                </Text>
              </View>
            </Pressable>
          ))}

          {/* ===== GAME MODES ===== */}
          <Text style={styles.sectionTitle}>GAME MODES</Text>

          <ModeCard
            title="SEASON"
            subtitle="Play Season 1 · Schedule, playoffs & championship"
            colors={['#ffc220', '#ff9a1a']}
            onPress={() => router.push('/season')}
            badge="MAIN"
          />

          <ModeCard
            title="NATIONAL RACES"
            subtitle="Special event races · Win 2x-5x multiplied payouts"
            colors={['#9b59b6', '#7d3c98']}
            onPress={() => router.push('/national-races')}
            badge="2X-5X"
          />

          <ModeCard
            title="TOURNAMENTS"
            subtitle="Bracket competitions · 8-marble elimination"
            colors={['#00b4d8', '#0077b6']}
            onPress={() => router.push('/tournaments')}
          />

          <ModeCard
            title="MULTIPLAYER"
            subtitle="Live 8-player tournaments · Real opponents · Real prizes"
            colors={['#e91e63', '#ad1457']}
            badge="LIVE"
            onPress={() => {
              const uid = useGameStore.getState().firebaseUid;
              if (!uid) {
                showModal({
                  title: 'Sign In Required',
                  message: 'Multiplayer needs an account so we can sync your lobby and prizes. Sign in with Google or Apple in Settings.',
                  buttons: [
                    { label: 'Cancel', variant: 'ghost' },
                    { label: 'Settings', variant: 'yellow', onPress: () => router.push('/settings') },
                  ],
                });
                return;
              }
              router.push({ pathname: '/multiplayer-lobby', params: { tier: 'daily' } });
            }}
          />

          <ModeCard
            title="QUICK RACE"
            subtitle="Pick any course · Race for fun, no stakes"
            colors={['#2ecc71', '#1a9c58']}
            onPress={() => router.push('/courses')}
          />

          <ModeCard
            title="TRACK OF THE DAY"
            subtitle={`Today: ${getTrackOfTheDay().name} · Bonus coins!`}
            colors={['#e74c3c', '#c0392b']}
            badge="DAILY"
            onPress={() => {
              const totd = getTrackOfTheDay();
              useGameStore.getState().selectCourse(totd.id);
              useGameStore.getState().setActiveMode({ type: 'quick_race' });
              useGameStore.getState().resetBet();
              router.push('/race');
            }}
          />

          <ModeCard
            title="CUSTOM TRACK"
            subtitle="Generate tracks from any seed · Race your creations"
            colors={['#1abc9c', '#16a085']}
            onPress={() => router.push('/custom-track')}
          />

          <ModeCard
            title="PROFILE"
            subtitle="Your stats, league progress & favorite marble"
            colors={['#34495e', '#2c3e50']}
            onPress={() => router.push('/profile')}
          />

          {/* ===== EXPLORE ===== */}
          <Text style={styles.sectionTitle}>EXPLORE</Text>

          {/* Row 1 */}
          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/roster')}
            >
              <Text style={styles.navLabel}>MARBLES</Text>
              <Text style={styles.navSub}>8 racers</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/analytics')}
            >
              <Text style={styles.navLabel}>ANALYTICS</Text>
              <Text style={styles.navSub}>Stats</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/store')}
            >
              <Text style={styles.navLabel}>STORE</Text>
              <Text style={styles.navSub}>Buy coins</Text>
            </Pressable>
          </View>

          {/* Row 2 */}
          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/pass')}
            >
              <Text style={styles.navLabel}>SEASON PASS</Text>
              <Text style={styles.navSub}>Level {passLevel}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/settings')}
            >
              {supportUnread > 0 && (
                <View style={styles.navCardBadge}>
                  <Text style={styles.navCardBadgeText}>{supportUnread}</Text>
                </View>
              )}
              <Text style={styles.navLabel}>SETTINGS</Text>
              <Text style={styles.navSub}>Legal</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/leaderboards')}
            >
              <Text style={styles.navLabel}>LEADERS</Text>
              <Text style={styles.navSub}>Rankings</Text>
            </Pressable>
          </View>

          {/* Row 3 */}
          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/achievements')}
            >
              <Text style={styles.navLabel}>ACHIEVE</Text>
              <Text style={styles.navSub}>{achievementCount}/{ACHIEVEMENTS.length}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/challenges')}
            >
              <Text style={styles.navLabel}>CHALLENGES</Text>
              <Text style={styles.navSub}>Daily</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/compare')}
            >
              <Text style={styles.navLabel}>COMPARE</Text>
              <Text style={styles.navSub}>Marbles</Text>
            </Pressable>
          </View>




          {/* ===== FOOTER ===== */}
          <Text style={styles.disclaimer}>
            For ages 17+ · Virtual coins only · No real money gambling
          </Text>
        </ScrollView>
      </SafeAreaView>
      {dailyReward && (
        <Animated.View style={[styles.dailyToast, { opacity: toastOpacity }]} pointerEvents="none">
          <View style={styles.dailyToastBadge}>
            <Text style={styles.dailyToastBadgeText}>{dailyReward.streak}</Text>
          </View>
          <View>
            <Text style={styles.dailyToastTitle}>Day {dailyReward.streak} Streak</Text>
            <Text style={styles.dailyToastSub}>+{dailyReward.reward} coins</Text>
          </View>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },

  /* ===== TOP BAR ===== */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.ink,
    marginTop: -1,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
  },
  playerSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
  },

  /* ===== MARBLES ROW ===== */
  marblesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: 20,
  },

  /* ===== HERO CARD ===== */
  heroCard: {
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#4d80ff',
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroDecor: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,194,32,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#e74c3c',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: '#fff',
    letterSpacing: 1,
  },
  heroTimer: {
    fontFamily: Fonts.bodyBold,
    fontSize: 20,
    color: Colors.yellow,
  },
  heroTrackName: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    marginBottom: 4,
  },
  heroTrackDesc: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 14,
  },
  heroMarbleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  heroBtn: {
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: '#cc9a00',
    borderRadius: BorderRadius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  heroBtnText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.ink,
  },

  /* ===== UP NEXT QUEUE ===== */
  raceCardSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha12,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  raceCardName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Colors.white,
  },
  raceCardDesc: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusOpen: {
    backgroundColor: 'rgba(46,204,113,0.2)',
  },
  statusSoon: {
    backgroundColor: 'rgba(255,194,32,0.15)',
  },
  statusBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  statusOpenText: {
    color: '#2ecc71',
  },
  statusSoonText: {
    color: Colors.yellow,
  },

  /* ===== ANNOUNCEMENTS & PROMOS ===== */
  announcementBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.3)',
  },
  announcementIcon: {
    fontSize: 18,
  },
  announcementBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 4,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementClose: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementCloseText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 20,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 22,
  },
  announcementBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.5,
  },
  announcementTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: Colors.yellow,
    marginBottom: 2,
  },
  announcementBody: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  supportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,204,113,0.12)',
    borderRadius: BorderRadius.md,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.35)',
  },
  supportBannerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  supportBannerClose: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  supportBannerCloseText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 22,
    color: 'rgba(46,204,113,0.7)',
    lineHeight: 24,
  },
  supportBannerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportBannerBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  supportBannerTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: '#2ecc71',
  },
  supportBannerBody: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
  promoBanner: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.4)',
  },
  promoText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: '#2ecc71',
    textAlign: 'center',
  },

  /* ===== SECTION TITLE ===== */
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 10,
  },

  /* ===== MODE CARDS ===== */
  modeCard: {
    borderRadius: BorderRadius.lg,
    padding: 18,
    marginBottom: 10,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    marginBottom: 6,
  },
  modeBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.white,
    letterSpacing: 1,
  },
  modeTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modeSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  /* ===== NAV ROW ===== */
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  navCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha12,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  navCardPressed: {
    opacity: 0.7,
  },
  navCardBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2ecc71',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  navCardBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.white,
  },
  navLabel: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.white,
    marginBottom: 2,
  },
  navSub: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha35,
  },

  /* ===== DISCLAIMER ===== */
  disclaimer: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    textAlign: 'center',
    marginTop: 16,
  },
  dailyToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.yellow,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  dailyToastIcon: {
    fontSize: 28,
  },
  dailyToastBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#cc9a00',
  },
  dailyToastBadgeText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.ink,
  },
  dailyToastTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.yellow,
  },
  dailyToastSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: '#fff',
  },
});
