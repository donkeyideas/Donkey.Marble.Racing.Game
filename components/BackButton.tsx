import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../theme';

interface BackButtonProps {
  onPress: () => void;
}

export default function BackButton({ onPress }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <Text style={styles.arrow}>{'\u2039'}</Text>
      <Text style={styles.label}>BACK</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  arrow: {
    color: Colors.white,
    fontSize: 24,
    fontFamily: Fonts.bodySemiBold,
    marginRight: 4,
    marginTop: -2,
  },
  label: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
