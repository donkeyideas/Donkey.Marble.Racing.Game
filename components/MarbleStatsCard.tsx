import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, BorderRadius } from '../theme';
import type { MarbleData } from '../theme';
import MarbleDot from './MarbleDot';

interface Props {
  marble: MarbleData;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

const STAT_KEYS = ['speed', 'power', 'bounce', 'luck'] as const;
const STAT_LABELS: Record<typeof STAT_KEYS[number], string> = {
  speed: 'SPD',
  power: 'PWR',
  bounce: 'BNC',
  luck: 'LCK',
};

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${(value / 5) * 100}%` }]} />
      </View>
    </View>
  );
}

export default function MarbleStatsCard({ marble, selected, disabled, onPress }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        disabled && styles.cardDisabled,
        pressed && !disabled && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.header}>
        <MarbleDot marble={marble} size={44} />
        <View style={styles.headerText}>
          <Text style={[styles.name, selected && { color: Colors.yellow }]}>
            {marble.name}
          </Text>
          <Text style={styles.personality} numberOfLines={1}>
            {marble.personality}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        {STAT_KEYS.map((k) => (
          <StatBar key={k} label={STAT_LABELS[k]} value={marble.stats[k]} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 8,
    width: '48%',
  },
  cardSelected: {
    backgroundColor: Colors.yellowAlpha15,
    borderColor: Colors.yellow,
  },
  cardDisabled: {
    opacity: 0.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  personality: {
    fontFamily: Fonts.body,
    fontSize: 9,
    color: Colors.whiteAlpha50,
    fontStyle: 'italic',
  },
  stats: {
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.whiteAlpha50,
    width: 24,
    letterSpacing: 0.5,
  },
  statBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.whiteAlpha10,
    borderRadius: 3,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    backgroundColor: Colors.yellow,
    borderRadius: 3,
  },
});
