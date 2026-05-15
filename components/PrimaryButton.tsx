import React from 'react';
import { Text, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'yellow' | 'blue' | 'ghost';
  disabled?: boolean;
}

export default function PrimaryButton({
  label,
  onPress,
  variant = 'yellow',
  disabled = false,
}: PrimaryButtonProps) {
  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          styles.ghostContainer,
          pressed && styles.pressed,
          disabled && { opacity: 0.4 },
        ]}
      >
        <Text style={styles.ghostLabel}>{label}</Text>
      </Pressable>
    );
  }

  const isBlue = variant === 'blue';
  const shadowColor = isBlue ? '#082e6e' : '#b8860b';

  return (
    <View style={styles.wrapper}>
      {/* 3D bottom shadow (thick solid bar) */}
      <View style={[styles.shadow3d, { backgroundColor: shadowColor }]} />

      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          pressed && styles.pressed,
          disabled && { opacity: 0.4 },
        ]}
      >
        <LinearGradient
          colors={
            isBlue
              ? [Colors.blue, Colors.blueDark]
              : [Colors.yellowBright, Colors.yellow]
          }
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.gradient, isBlue ? styles.blueBorder : styles.yellowBorder]}
        >
          <Text style={[styles.label, isBlue ? styles.blueLabel : styles.yellowLabel]}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  shadow3d: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -3,
    height: '100%',
    borderRadius: 50,
  },
  base: {
    borderRadius: 50,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 17,
    textAlign: 'center',
  },

  // Yellow variant
  yellowBorder: {
    borderColor: '#cc9a00',
  },
  yellowLabel: {
    color: Colors.ink,
  },

  // Blue variant
  blueBorder: {
    borderColor: Colors.blueDark,
  },
  blueLabel: {
    color: Colors.white,
  },

  // Ghost variant
  ghostContainer: {
    borderWidth: 2,
    borderColor: Colors.whiteAlpha40,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
  },

  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
});
