import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import BackButton from '../components/BackButton';
import { showModal } from '../components/GameModal';
import { getFriends, pinFriend, removeFriend, MpFriend } from '../lib/mpFriends';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function FriendsScreen() {
  const router = useRouter();
  const [friends, setFriends] = useState<MpFriend[]>([]);

  const refresh = useCallback(() => {
    getFriends().then(setFriends);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onPin = async (f: MpFriend) => {
    await pinFriend(f.uid, !f.pinned);
    refresh();
  };

  const onRemove = (f: MpFriend) => {
    showModal({
      title: 'Remove friend?',
      message: `${f.displayName} will be cleared from your list. They'll re-appear if you play together again.`,
      buttons: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'Remove',
          variant: 'danger',
          onPress: async () => {
            await removeFriend(f.uid);
            refresh();
          },
        },
      ],
    });
  };

  const onInvite = () => {
    // Friends in v1 just point you to the multiplayer entry — share the
    // code from there. When a server-side invite system lands this routes
    // to it instead.
    router.push({ pathname: '/multiplayer-lobby', params: { tier: 'daily' } });
  };

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>FRIENDS</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.intro}>
          <Text style={styles.introTitle}>YOUR RECENT OPPONENTS</Text>
          <Text style={styles.introBody}>
            Every human player you've raced in multiplayer appears here. Pin
            the ones you want to keep at the top. Tap INVITE to head to the
            multiplayer screen and share a private-lobby code with them.
          </Text>
        </View>

        <ScrollView style={styles.fill} contentContainerStyle={styles.scrollContent}>
          {friends.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                No friends yet. Play a multiplayer match with another human
                and they'll show up here automatically.
              </Text>
              <Pressable
                style={styles.emptyBtn}
                onPress={() => router.push({ pathname: '/multiplayer-lobby', params: { tier: 'daily' } })}
              >
                <Text style={styles.emptyBtnText}>FIND A MATCH</Text>
              </Pressable>
            </View>
          ) : (
            friends.map((f) => (
              <View key={f.uid} style={styles.row}>
                <View style={[styles.avatar, f.pinned && { borderColor: Colors.yellow }]}>
                  <Text style={styles.avatarLetter}>{f.displayName[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {f.displayName} {f.pinned ? '★' : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {f.matchesPlayed} match{f.matchesPlayed === 1 ? '' : 'es'} · last {timeAgo(f.lastPlayedAt)}
                  </Text>
                </View>
                <Pressable style={styles.actionBtn} onPress={() => onPin(f)}>
                  <Text style={styles.actionText}>{f.pinned ? 'UNPIN' : 'PIN'}</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => onRemove(f)}>
                  <Text style={[styles.actionText, { color: Colors.red }]}>X</Text>
                </Pressable>
              </View>
            ))
          )}

          {friends.length > 0 && (
            <Pressable style={styles.inviteBtn} onPress={onInvite}>
              <Text style={styles.inviteBtnText}>INVITE TO A LOBBY</Text>
              <Text style={styles.inviteBtnSub}>
                Opens multiplayer · create a private lobby and share the code
              </Text>
            </Pressable>
          )}
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
    fontSize: 20,
    color: Colors.white,
    letterSpacing: 2,
  },

  intro: {
    marginHorizontal: Spacing.lg,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: 'rgba(255,194,32,0.08)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.25)',
    padding: 12,
  },
  introTitle: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.yellow,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  introBody: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha60,
    lineHeight: 15,
  },

  empty: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 22,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  emptyBtn: {
    backgroundColor: Colors.yellow,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: BorderRadius.pill,
  },
  emptyBtnText: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.ink,
    letterSpacing: 1.5,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
  },
  name: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.white,
    letterSpacing: 0.5,
  },

  inviteBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(155,89,182,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(155,89,182,0.50)',
    borderRadius: BorderRadius.md,
    padding: 14,
    alignItems: 'center',
  },
  inviteBtnText: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: '#c39bd3',
    letterSpacing: 1.2,
  },
  inviteBtnSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 3,
    textAlign: 'center',
  },
});
