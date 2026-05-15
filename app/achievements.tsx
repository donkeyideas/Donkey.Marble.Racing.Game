import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import { ACHIEVEMENTS } from '../data/achievements';
import { SKINS } from '../data/skins';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

export default function AchievementsScreen() {
  const router = useRouter();
  const achievements = useGameStore(s => s.achievements);

  const unlockedCount = useMemo(() =>
    ACHIEVEMENTS.filter(a => achievements[a.id]).length,
  [achievements]);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>ACHIEVEMENTS</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>{unlockedCount} / {ACHIEVEMENTS.length}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }]} />
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.grid}>
            {ACHIEVEMENTS.map(def => {
              const unlocked = !!achievements[def.id];
              const skin = def.unlocksSkin ? SKINS.find(s => s.id === def.unlocksSkin!.skinId) : null;
              const marble = def.unlocksSkin ? MARBLES.find(m => m.id === def.unlocksSkin!.marbleId) : null;

              return (
                <View
                  key={def.id}
                  style={[styles.card, unlocked && styles.cardUnlocked]}
                >
                  {/* Icon */}
                  <View style={[styles.iconBg, unlocked && styles.iconBgUnlocked]}>
                    <Text style={[styles.iconText, unlocked && styles.iconTextUnlocked]}>
                      {unlocked ? def.icon : '?'}
                    </Text>
                  </View>

                  {/* Name + description */}
                  <Text style={[styles.cardName, !unlocked && styles.locked]}>{def.name}</Text>
                  <Text style={[styles.cardDesc, !unlocked && styles.locked]}>{def.description}</Text>

                  {/* Skin reward preview */}
                  {skin && marble && (
                    <View style={styles.skinRow}>
                      <MarbleDot
                        marble={unlocked
                          ? { ...marble, colorLight: skin.colorLight, colorDark: skin.colorDark }
                          : marble
                        }
                        size={20}
                      />
                      <Text style={[styles.skinLabel, !unlocked && styles.locked]}>
                        {unlocked ? `${skin.name} skin` : 'Skin reward'}
                      </Text>
                    </View>
                  )}

                  {/* Unlock date */}
                  {unlocked && (
                    <Text style={styles.unlockDate}>
                      {new Date(achievements[def.id].unlockedAt).toLocaleDateString()}
                    </Text>
                  )}

                  {/* Lock overlay */}
                  {!unlocked && (
                    <View style={styles.lockOverlay}>
                      <Text style={styles.lockIcon}>LOCKED</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  title: { fontFamily: Fonts.display, fontSize: 22, color: Colors.white, letterSpacing: 2 },

  progressContainer: { paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  progressText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.whiteAlpha60, textAlign: 'center', marginBottom: 6 },
  progressBg: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.yellow },

  scroll: { flex: 1, marginTop: Spacing.md },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  card: {
    width: '48%', padding: 14, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative', overflow: 'hidden',
  },
  cardUnlocked: { borderColor: Colors.yellow, borderWidth: 1.5 },

  iconBg: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 8,
  },
  iconBgUnlocked: { backgroundColor: Colors.yellowAlpha20 },
  iconText: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.whiteAlpha40 },
  iconTextUnlocked: { color: Colors.yellow },

  cardName: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.white, marginBottom: 4 },
  cardDesc: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha50, lineHeight: 15 },

  skinRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  skinLabel: { fontFamily: Fonts.body, fontSize: 11, color: Colors.yellow },

  unlockDate: { fontFamily: Fonts.body, fontSize: 10, color: Colors.whiteAlpha40, marginTop: 6 },

  locked: { opacity: 0.5 },
  lockOverlay: {
    position: 'absolute', top: 8, right: 8,
  },
  lockIcon: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: Colors.whiteAlpha25, letterSpacing: 1 },
});
