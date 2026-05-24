import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useOnlineStatus } from '../lib/networkStatus';
import { Fonts, Colors } from '../theme';

/**
 * Compact offline indicator shown at the top of any screen that mounts it.
 *
 * The game keeps working offline (race physics + Quick Race + Custom Track
 * are 100% local, bets get optimistically debited and queued) but without
 * this banner the player had no idea why "leaderboards" / "live ops" /
 * online tournaments weren't refreshing. The banner is the contract: "yes
 * you can play, here's what's not updating until you reconnect."
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <View style={styles.bar} pointerEvents="none">
      <View style={styles.dot} />
      <Text style={styles.text}>OFFLINE · play continues · coins sync when you reconnect</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3a1d1d',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(231,76,60,0.4)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.red,
  },
  text: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.5,
  },
});
