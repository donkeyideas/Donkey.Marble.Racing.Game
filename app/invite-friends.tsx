import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import { useGameStore, Referral } from '../state/gameStore';

/** Referral program constants — informational only; rewards are server-granted. */
const MAX_REFERRALS = 10;
const REWARD_PER_FRIEND = 500;
const RACES_REQUIRED = 3;
const SHARE_BASE_URL = 'https://donkeyideas.com/games/marble-racing';

function statusStyle(r: Referral): { bg: string; color: string; label: string } {
  if (r.status === 'earned') {
    return { bg: 'rgba(46,204,113,0.15)', color: Colors.green, label: `+${REWARD_PER_FRIEND} EARNED` };
  }
  if (r.status === 'racing') {
    return {
      bg: 'rgba(255,194,32,0.15)',
      color: Colors.yellow,
      label: `${r.racesCompleted}/${RACES_REQUIRED} RACES`,
    };
  }
  return { bg: 'rgba(255,255,255,0.06)', color: Colors.whiteAlpha35, label: 'PENDING' };
}

export default function InviteFriendsScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const referralCode = useGameStore((s) => s.referralCode);
  const referrals = useGameStore((s) => s.referrals);
  const ensureReferralCode = useGameStore((s) => s.ensureReferralCode);

  // Derive + persist the code once on first open. ensureReferralCode is
  // idempotent, so re-running it on later visits is a no-op.
  useEffect(() => {
    ensureReferralCode();
  }, [ensureReferralCode]);

  const code = referralCode || ensureReferralCode();
  const shareLink = `${SHARE_BASE_URL}?ref=${code}`;

  const invitedCount = Math.min(referrals.length, MAX_REFERRALS);
  const progressPct = useMemo(
    () => `${Math.round((invitedCount / MAX_REFERRALS) * 100)}%` as const,
    [invitedCount],
  );

  const onShare = async () => {
    try {
      // Real React Native Share sheet. Attribution (who used this code,
      // whether they completed 3 races) is verified SERVER-SIDE — the
      // client never self-credits the +500 reward.
      await Share.share({
        message:
          `Race marbles with me in Donkey Marble Racing! ` +
          `Use my code ${code} and we both win. ${shareLink}`,
        url: shareLink,
        title: 'Donkey Marble Racing',
      });
    } catch {
      // User dismissed the share sheet, or sharing is unavailable — no-op.
    }
  };

  return (
    <LinearGradient colors={['#0d1a3a', '#0a1230']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>INVITE FRIENDS</Text>
          <CoinPill amount={coins} />
        </View>

        <ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent}>
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroIcon}>+</Text>
            <Text style={styles.heroTitle}>INVITE FRIENDS</Text>
            <Text style={styles.heroSub}>Share the race — Earn rewards together</Text>
          </View>

          {/* Reward banner */}
          <View style={styles.rewardBox}>
            <Text style={styles.rewardVal}>+{REWARD_PER_FRIEND} COINS</Text>
            <Text style={styles.rewardDesc}>
              For each friend who completes {RACES_REQUIRED} races
            </Text>
          </View>

          {/* Referral code */}
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>
            <Text style={styles.codeText}>{code}</Text>
          </View>

          {/* Share button */}
          <Pressable
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
            onPress={onShare}
          >
            <Text style={styles.shareBtnText}>SHARE INVITE LINK</Text>
          </Pressable>

          {/* Progress + invited list */}
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>
              {invitedCount} / {MAX_REFERRALS} Friends Invited
            </Text>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[Colors.yellow, Colors.yellowDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: progressPct }]}
              />
            </View>

            {referrals.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  No invites yet — share your link to get started. Friends you
                  refer will appear here once they sign up.
                </Text>
              </View>
            ) : (
              referrals.slice(0, MAX_REFERRALS).map((r, i) => {
                const s = statusStyle(r);
                return (
                  <View key={`${r.name}-${r.invitedAt}-${i}`} style={styles.friendRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarLetter}>
                        {r.name[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <Text style={styles.friendName}>{r.name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <Text style={styles.limitNote}>
            Max {MAX_REFERRALS} referral rewards · 3 invites per day · Links expire in 7 days
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: 4,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
    letterSpacing: 1.5,
  },

  hero: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  heroIcon: {
    fontFamily: Fonts.display,
    fontSize: 52,
    color: Colors.yellow,
    lineHeight: 56,
  },
  heroTitle: {
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Colors.white,
    letterSpacing: 1,
  },
  heroSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    marginTop: 4,
  },

  rewardBox: {
    backgroundColor: 'rgba(255,194,32,0.08)',
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.lg,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  rewardVal: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.yellow,
  },
  rewardDesc: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    marginTop: 2,
  },

  codeBox: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha15,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha35,
    letterSpacing: 1,
    marginBottom: 6,
  },
  codeText: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.white,
    letterSpacing: 4,
  },

  shareBtn: {
    backgroundColor: Colors.yellow,
    borderWidth: 3,
    borderColor: '#cc9a00',
    borderRadius: BorderRadius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 18,
  },
  shareBtnText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.ink,
    letterSpacing: 1,
  },

  progressCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: 14,
  },
  progressTitle: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  empty: {
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    lineHeight: 18,
  },

  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
  },
  friendName: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
  },
  statusText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
  },

  limitNote: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    textAlign: 'center',
    marginTop: 8,
  },
});
