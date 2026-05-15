import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing } from '../theme';

interface StatBarProps {
  label: string;
  value: number;
  color?: string;
}

const TOTAL_SEGMENTS = 5;

export default function StatBar({ label, value, color = Colors.yellow }: StatBarProps) {
  const clamped = Math.max(0, Math.min(TOTAL_SEGMENTS, Math.round(value)));

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments}>
        {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < clamped ? color : Colors.whiteAlpha10 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  label: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha50,
    width: 32,
    letterSpacing: 0.5,
  },
  segments: {
    flexDirection: 'row',
    gap: 3,
  },
  segment: {
    width: 14,
    height: 6,
    borderRadius: 3,
  },
});
