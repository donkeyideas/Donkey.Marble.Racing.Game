import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { MarbleData } from '../theme';

interface MarbleDotProps {
  marble: MarbleData;
  size?: number;
}

export default function MarbleDot({ marble, size = 38 }: MarbleDotProps) {
  const highlightSize = size * 0.4;

  return (
    <View
      style={[
        styles.outer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: marble.colorDark,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25,
          shadowRadius: 0,
          elevation: 3,
        },
      ]}
    >
      {/* Lighter ring to simulate radial gradient */}
      <View
        style={[
          styles.lightLayer,
          {
            width: size - 4,
            height: size - 4,
            borderRadius: (size - 4) / 2,
            backgroundColor: marble.colorLight,
          },
        ]}
      />
      {/* Darker core to reinforce the gradient look */}
      <View
        style={[
          styles.darkCore,
          {
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: (size * 0.6) / 2,
            backgroundColor: marble.colorDark,
            opacity: 0.45,
          },
        ]}
      />
      {/* Gloss highlight - white semi-transparent ellipse at top-left */}
      <View
        style={[
          styles.gloss,
          {
            width: highlightSize,
            height: highlightSize * 0.65,
            borderRadius: highlightSize / 2,
            top: size * 0.12,
            left: size * 0.15,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lightLayer: {
    position: 'absolute',
  },
  darkCore: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  gloss: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
});
