import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../theme';

interface CoinPillProps {
  amount: number;
  dark?: boolean;
  onPress?: () => void;
}

export default function CoinPill({ amount, dark = false, onPress }: CoinPillProps) {
  const content = (
    <View
      style={[
        styles.pill,
        dark && styles.pillDark,
      ]}
    >
      <View style={[styles.coinIcon, dark && styles.coinIconDark]}>
        <Text style={[styles.coinSymbol, dark && styles.coinSymbolDark]}>$</Text>
      </View>
      <Text style={[styles.value, dark && styles.valueDark]}>
        {amount.toLocaleString()}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.yellowAlpha15,
    borderWidth: 2,
    borderColor: Colors.yellow,
    borderRadius: 50,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  pillDark: {
    backgroundColor: Colors.inkAlpha30,
    borderColor: Colors.ink,
  },
  coinIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  coinIconDark: {
    backgroundColor: Colors.ink,
  },
  coinSymbol: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.ink,
    marginTop: -1,
  },
  coinSymbolDark: {
    color: Colors.cream,
  },
  value: {
    fontFamily: Fonts.bodyBold,
    fontSize: 15,
    color: Colors.yellow,
  },
  valueDark: {
    color: Colors.ink,
  },
});
