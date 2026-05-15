import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../theme';
import type { MarbleData } from '../theme';
import MarbleDot from './MarbleDot';

interface MarbleCardProps {
  marble: MarbleData;
  odds: number;
  selected?: boolean;
  badge?: 'favorite' | 'longshot' | 'picked';
  onPress: () => void;
}

const badgeConfig = {
  favorite: { label: 'FAVORITE', bg: Colors.greenAlpha20, color: Colors.green },
  longshot: { label: 'LONGSHOT', bg: Colors.redAlpha20, color: Colors.red },
  picked: { label: 'PICKED', bg: Colors.yellowAlpha20, color: Colors.ink },
} as const;

export default function MarbleCard({
  marble,
  odds,
  selected = false,
  badge,
  onPress,
}: MarbleCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {badge && (
        <View style={[styles.badge, { backgroundColor: badgeConfig[badge].bg }]}>
          <Text style={[styles.badgeText, { color: badgeConfig[badge].color }]}>
            {badgeConfig[badge].label}
          </Text>
        </View>
      )}

      <MarbleDot marble={marble} size={52} />

      <Text style={styles.name}>{marble.name}</Text>

      <Text style={styles.odds}>{odds.toFixed(1)}x</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: Spacing.md,
    alignItems: 'center',
  },
  selected: {
    backgroundColor: Colors.yellowAlpha15,
    borderColor: Colors.yellow,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  badge: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: Spacing.sm,
    alignSelf: 'center',
  },
  badgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  odds: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    marginTop: 2,
    textAlign: 'center',
  },
});
