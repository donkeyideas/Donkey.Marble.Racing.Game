import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Colors, Fonts, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import { ALL_COURSES } from '../data/courses';
import MarbleDot from './MarbleDot';

/**
 * "Share Race" button + off-screen share card.
 *
 * Performance note: the share card is captured ONLY when the user taps
 * Share — it's never rendered during the race. Capture happens on the
 * results screen after the race is fully over, so there is zero impact
 * on race-loop framerate. The card is a static RN view; react-native-
 * view-shot grabs it once and hands a PNG to the native share sheet.
 *
 * Drop <ShareRaceButton /> into the results Win/Loss screens — it reads
 * everything it needs from the store itself.
 */

function placementLabel(n: number): string {
  if (n === 1) return '1ST PLACE';
  if (n === 2) return '2ND PLACE';
  if (n === 3) return '3RD PLACE';
  if (n > 3) return `${n}TH PLACE`;
  return 'RACE COMPLETE';
}

export default function ShareRaceButton() {
  const lastResult = useGameStore((s) => s.lastResult);
  const selectedCourseId = useGameStore((s) => s.selectedCourseId);
  const playerName = useGameStore((s) => s.playerName);
  // Set by the race screen when the user recorded the race. When present
  // the button shares the actual video clip instead of the image card.
  const raceVideoUri = useGameStore((s) => s.raceVideoUri);

  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  if (!lastResult) return null;

  // Player's marble — fall back to the race winner if there was no pick.
  const marble = lastResult.playerPick ?? lastResult.positions[0]?.marble ?? null;
  if (!marble) return null;

  const placement = lastResult.playerPick ? lastResult.playerPlacement : 1;
  const payout = lastResult.payout ?? 0;
  const course = ALL_COURSES.find((c) => c.id === selectedCourseId);
  const courseName = course
    ? course.name
    : (selectedCourseId || 'Marble Race').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const isWin = placement === 1;

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) return;
      if (raceVideoUri) {
        // User recorded the race — share the actual video clip.
        await Sharing.shareAsync(raceVideoUri, {
          mimeType: 'video/mp4',
          dialogTitle: 'Share your race',
        });
      } else {
        // No recording — share the static results card image instead.
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your race',
        });
      }
    } catch (err) {
      // Best-effort — a failed/cancelled share should never crash the
      // results screen. Swallow; the user can simply tap again.
      console.warn('[ShareRaceButton] share failed', err);
    } finally {
      setSharing(false);
    }
  };

  const buttonLabel = sharing
    ? 'PREPARING…'
    : raceVideoUri ? 'SHARE VIDEO' : 'SHARE RACE';

  return (
    <>
      {/* Visible button */}
      <Pressable
        onPress={handleShare}
        disabled={sharing}
        style={({ pressed }) => [
          styles.button,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          sharing && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </Pressable>

      {/* Off-screen capture target. Positioned far off-screen so it's
       * laid out (view-shot needs real layout) but never visible.
       * collapsable={false} stops Android from optimizing the view away. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={cardRef} collapsable={false}>
          <LinearGradient
            colors={isWin ? ['#1d56d4', '#0a3a96', '#0a1a3a'] : ['#0a3a96', '#0a1a3a']}
            style={styles.card}
          >
            <Text style={styles.brand}>DONKEY MARBLE RACING</Text>

            <View style={styles.marbleWrap}>
              <MarbleDot marble={marble} size={120} />
            </View>
            <Text style={styles.marbleName}>{marble.name.toUpperCase()}</Text>

            <View style={[styles.placePill, isWin ? styles.placePillWin : styles.placePillNorm]}>
              <Text style={[styles.placeText, isWin && { color: Colors.ink }]}>
                {placementLabel(placement)}
              </Text>
            </View>

            <Text style={styles.course}>{courseName}</Text>

            {payout > 0 && (
              <Text style={styles.payout}>+{payout.toLocaleString()} coins</Text>
            )}

            {!!playerName && <Text style={styles.player}>Raced by {playerName}</Text>}

            <Text style={styles.footer}>Race free — Donkey Marble Racing</Text>
          </LinearGradient>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  /* Matches the results-screen ghost buttons (RACE AGAIN / BACK TO
   * LOBBY): full-width, 50-radius pill, 16 vertical padding. Was a
   * narrower 13-pad pill that looked like an afterthought next to them. */
  button: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.white,
    letterSpacing: 1,
  },

  // Off-screen host — laid out, never seen.
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },

  card: {
    width: 320,
    height: 440,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  brand: {
    fontFamily: Fonts.display,
    fontSize: 15,
    color: Colors.yellow,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  marbleWrap: {
    marginTop: 26,
    marginBottom: 12,
  },
  marbleName: {
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Colors.white,
    letterSpacing: 1,
  },
  placePill: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: BorderRadius.pill,
  },
  placePillWin: {
    backgroundColor: Colors.yellow,
  },
  placePillNorm: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  placeText: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    letterSpacing: 1,
  },
  course: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 14,
  },
  payout: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.green,
    marginTop: 6,
  },
  player: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
});
