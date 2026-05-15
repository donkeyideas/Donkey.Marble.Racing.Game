import React from 'react';
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
import { useGameStore } from '../state/gameStore';
import { getSkinsForMarble, SkinDef } from '../data/skins';
import { ACHIEVEMENTS } from '../data/achievements';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';
import StatBar from '../components/StatBar';

// Stat bar color mapping
const STAT_COLORS: Record<string, string> = {
  SPD: Colors.yellow,
  PWR: Colors.green,
  BNC: '#4d80ff',
  LCK: Colors.red,
};

interface RosterCardProps {
  marble: MarbleData;
  isChampion: boolean;
  record: { wins: number; losses: number };
  equippedSkinId: string | undefined;
  unlockedAchievements: Record<string, { unlockedAt: string }>;
  onEquipSkin: (skinId: string) => void;
  onUnequipSkin: () => void;
}

function RosterCard({ marble, isChampion, record, equippedSkinId, unlockedAchievements, onEquipSkin, onUnequipSkin }: RosterCardProps) {
  const skins = getSkinsForMarble(marble.id);

  // Determine which 3 stats to show (pick top 3 stat categories)
  const statEntries: { label: string; value: number; key: string }[] = [
    { label: 'SPD', value: marble.stats.speed, key: 'SPD' },
    { label: 'PWR', value: marble.stats.power, key: 'PWR' },
    { label: 'BNC', value: marble.stats.bounce, key: 'BNC' },
    { label: 'LCK', value: marble.stats.luck, key: 'LCK' },
  ];

  // Show top 3 stats by value
  const topStats = [...statEntries]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <View
      style={[
        styles.card,
        isChampion && styles.cardChampion,
      ]}
    >
      {/* Champion badge */}
      {isChampion && (
        <View style={styles.champBadge}>
          <Text style={styles.champBadgeText}>CHAMP</Text>
        </View>
      )}

      {/* Marble dot — show equipped skin colors */}
      <MarbleDot
        marble={equippedSkinId
          ? { ...marble, ...(skins.find(s => s.id === equippedSkinId) ? { colorLight: skins.find(s => s.id === equippedSkinId)!.colorLight, colorDark: skins.find(s => s.id === equippedSkinId)!.colorDark } : {}) }
          : marble
        }
        size={56}
      />

      {/* Name */}
      <Text style={styles.cardName}>{marble.name}</Text>

      {/* Record */}
      <Text style={styles.cardRecord}>
        W:{record.wins} L:{record.losses}
      </Text>

      {/* Personality */}
      <Text style={styles.cardPersonality}>{marble.personality}</Text>

      {/* Stat bars */}
      <View style={styles.statBars}>
        {topStats.map((stat) => (
          <StatBar
            key={stat.key}
            label={stat.label}
            value={stat.value}
            color={STAT_COLORS[stat.key] || Colors.yellow}
          />
        ))}
      </View>

      {/* Skin selector */}
      {skins.length > 0 && (
        <View style={styles.skinSection}>
          <Text style={styles.skinTitle}>SKINS</Text>
          <View style={styles.skinRow}>
            {/* Default */}
            <Pressable
              style={[styles.skinDot, !equippedSkinId && styles.skinDotActive]}
              onPress={onUnequipSkin}
            >
              <MarbleDot marble={marble} size={22} />
            </Pressable>
            {skins.map(skin => {
              const isUnlocked = !!unlockedAchievements[skin.achievementId];
              const isEquipped = equippedSkinId === skin.id;
              const achDef = ACHIEVEMENTS.find(a => a.id === skin.achievementId);
              return (
                <Pressable
                  key={skin.id}
                  style={[styles.skinDot, isEquipped && styles.skinDotActive, !isUnlocked && styles.skinDotLocked]}
                  onPress={() => isUnlocked && onEquipSkin(skin.id)}
                >
                  {isUnlocked ? (
                    <MarbleDot marble={{ ...marble, colorLight: skin.colorLight, colorDark: skin.colorDark }} size={22} />
                  ) : (
                    <View style={styles.skinLockIcon}><Text style={styles.skinLockText}>?</Text></View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

interface LockedCardProps {
  marble: MarbleData;
  unlockText: string;
}

function LockedCard({ marble, unlockText }: LockedCardProps) {
  return (
    <View style={[styles.card, styles.cardLocked]}>
      {/* Lock overlay */}
      <View style={styles.lockOverlay}>
        <View style={styles.lockCircle}>
          <Text style={styles.lockIcon}>X</Text>
        </View>
      </View>

      {/* Marble dot (dimmed via parent opacity) */}
      <MarbleDot marble={marble} size={56} />

      {/* Name */}
      <Text style={styles.lockedName}>{marble.name}</Text>

      {/* Unlock requirement */}
      <Text style={styles.unlockText}>{unlockText}</Text>
    </View>
  );
}

export default function RosterScreen() {
  const router = useRouter();
  const seasonStandings = useGameStore((s) => s.seasonStandings);
  const totalRaces = useGameStore((s) => s.totalRaces);
  const equippedSkins = useGameStore((s) => s.equippedSkins);
  const achievements = useGameStore((s) => s.achievements);
  const equipSkin = useGameStore((s) => s.equipSkin);
  const unequipSkin = useGameStore((s) => s.unequipSkin);

  // Dynamic champion: marble with most wins this season
  const championId = Object.entries(seasonStandings).reduce(
    (best, [id, rec]) => (rec.wins > best.wins ? { id, wins: rec.wins } : best),
    { id: '', wins: 0 }
  ).id;

  // All marbles are unlocked (no locked gates)
  const allMarbles = MARBLES;

  return (
    <LinearGradient
      colors={['#1d56d4', '#0a3a96']}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== HEADER ROW ===== */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <View style={styles.spacer} />
          </View>

          {/* ===== TITLE ===== */}
          <Text style={styles.title}>MEET THE MARBLES</Text>
          <Text style={styles.subtitle}>
            {MARBLES.length} racers {'\u00B7'} Tap for stats
          </Text>

          {/* ===== 2-COLUMN GRID ===== */}
          <View style={styles.grid}>
            {allMarbles.map((marble) => {
              const record = seasonStandings[marble.id] || { wins: 0, losses: 0 };
              return (
                <View key={marble.id} style={styles.gridItem}>
                  <RosterCard
                    marble={marble}
                    isChampion={marble.id === championId && championId !== ''}
                    record={record}
                    equippedSkinId={equippedSkins[marble.id]}
                    unlockedAchievements={achievements}
                    onEquipSkin={(skinId) => equipSkin(marble.id, skinId)}
                    onUnequipSkin={() => unequipSkin(marble.id)}
                  />
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
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  /* ===== HEADER ===== */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  spacer: {
    width: 60,
  },

  /* ===== TITLE ===== */
  title: {
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginBottom: 20,
  },

  /* ===== GRID ===== */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '46%',
  },

  /* ===== UNLOCKED CARD ===== */
  card: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    position: 'relative',
  },
  cardChampion: {
    borderColor: Colors.yellow,
    backgroundColor: Colors.yellowAlpha08,
  },
  champBadge: {
    position: 'absolute',
    top: -6,
    right: 8,
    backgroundColor: Colors.yellow,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    zIndex: 5,
  },
  champBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.ink,
    letterSpacing: 0.5,
  },
  cardName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    marginTop: 8,
  },
  cardRecord: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    marginTop: 2,
  },
  cardPersonality: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha50,
    fontStyle: 'italic',
    marginTop: 2,
    marginBottom: 8,
  },
  statBars: {
    alignSelf: 'stretch',
    gap: 1,
  },

  /* ===== LOCKED CARD ===== */
  cardLocked: {
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    color: Colors.white,
  },
  lockedName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },
  unlockText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    textAlign: 'center',
  },

  /* ===== SKIN SELECTOR ===== */
  skinSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    width: '100%',
  },
  skinTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 6,
    textAlign: 'center',
  },
  skinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  skinDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  skinDotActive: {
    borderColor: Colors.yellow,
  },
  skinDotLocked: {
    opacity: 0.35,
  },
  skinLockIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skinLockText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
});
