/**
 * In-app themed modal. Replaces native `Alert.alert` so confirmation prompts
 * match the rest of the UI (gold/blue palette, Lilita display font, rounded
 * card on a dimmed backdrop) instead of the iOS/Android system dialog.
 *
 * Two ways to use:
 *
 *   1. Imperative API (drop-in for Alert.alert callers):
 *
 *        import { showModal } from '../components/GameModal';
 *        showModal({
 *          title: 'Enter Daily Blitz?',
 *          message: 'Entry: 100 coins. Prize pool: 5000.',
 *          buttons: [
 *            { label: 'Cancel', variant: 'ghost' },
 *            { label: 'Enter', variant: 'yellow', onPress: () => doEnter() },
 *          ],
 *        });
 *
 *      Requires mounting <GameModalHost/> once at the app root (in _layout.tsx).
 *
 *   2. Component API (if you want render-tree-controlled visibility):
 *
 *        <GameModal visible={open} title=... buttons=... onDismiss=... />
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, BorderRadius } from '../theme';

const { width: SW } = Dimensions.get('window');

export interface GameModalButton {
  label: string;
  variant?: 'yellow' | 'blue' | 'ghost' | 'danger';
  onPress?: () => void;
}

export interface GameModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons: GameModalButton[];
  onDismiss?: () => void;
}

export default function GameModal({
  visible, title, message, buttons, onDismiss,
}: GameModalProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 80, friction: 7, useNativeDriver: true }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.9);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={styles.backdropTouch} onPress={onDismiss} />
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={['#143d96', '#0a2e7a']}
            style={styles.cardInner}
          >
            <View style={styles.titleBand}>
              <Text style={styles.title}>{title}</Text>
            </View>
            {message ? (
              <Text style={styles.message}>{message}</Text>
            ) : null}
            <View style={styles.buttonRow}>
              {buttons.map((b, i) => (
                <ModalButton key={i} button={b} onClose={onDismiss} />
              ))}
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function ModalButton({ button, onClose }: { button: GameModalButton; onClose?: () => void }) {
  const handle = () => {
    button.onPress?.();
    onClose?.();
  };
  if (button.variant === 'ghost') {
    return (
      <Pressable onPress={handle} style={({ pressed }) => [styles.btnBase, styles.btnGhost, pressed && styles.pressed]}>
        <Text style={styles.btnGhostLabel}>{button.label}</Text>
      </Pressable>
    );
  }
  if (button.variant === 'danger') {
    return (
      <Pressable onPress={handle} style={({ pressed }) => [styles.btnBase, pressed && styles.pressed]}>
        <LinearGradient colors={['#e74c3c', '#c0392b']} style={styles.btnGradient}>
          <Text style={[styles.btnLabel, { color: '#fff' }]}>{button.label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  if (button.variant === 'blue') {
    return (
      <Pressable onPress={handle} style={({ pressed }) => [styles.btnBase, pressed && styles.pressed]}>
        <LinearGradient colors={[Colors.blue, Colors.blueDark]} style={styles.btnGradient}>
          <Text style={[styles.btnLabel, { color: '#fff' }]}>{button.label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  // yellow (default)
  return (
    <Pressable onPress={handle} style={({ pressed }) => [styles.btnBase, pressed && styles.pressed]}>
      <LinearGradient colors={[Colors.yellowBright, Colors.yellow]} style={styles.btnGradient}>
        <Text style={[styles.btnLabel, { color: Colors.ink }]}>{button.label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// ----- Imperative singleton API ---------------------------------------------

type ShowOpts = Omit<GameModalProps, 'visible' | 'onDismiss'>;

let hostRef: { show: (o: ShowOpts) => void; hide: () => void } | null = null;

export function showModal(opts: ShowOpts) {
  if (hostRef) hostRef.show(opts);
}

export function hideModal() {
  if (hostRef) hostRef.hide();
}

/** Mount once at the root of the app. Consumes the showModal()/hideModal() calls. */
export function GameModalHost() {
  const [state, setState] = useState<ShowOpts | null>(null);
  useEffect(() => {
    hostRef = {
      show: (o) => setState(o),
      hide: () => setState(null),
    };
    return () => { hostRef = null; };
  }, []);
  return (
    <GameModal
      visible={!!state}
      title={state?.title ?? ''}
      message={state?.message}
      buttons={state?.buttons ?? []}
      onDismiss={() => setState(null)}
    />
  );
}

// ----- Styles ----------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  backdropTouch: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
  },
  card: {
    width: Math.min(SW - 48, 360),
    borderRadius: BorderRadius?.lg ?? 18,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: Colors.yellow,
    // 3D depth: a stronger drop shadow + subtle inner glow
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 16,
  },
  cardInner: {
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  titleBand: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellowBright,
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  message: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnBase: {
    flex: 1,
    borderRadius: 50,
    overflow: 'hidden',
  },
  btnGradient: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
  },
  btnLabel: {
    fontFamily: Fonts.display,
    fontSize: 15,
  },
  btnGhost: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostLabel: {
    fontFamily: Fonts.display,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 1 }],
  },
});
