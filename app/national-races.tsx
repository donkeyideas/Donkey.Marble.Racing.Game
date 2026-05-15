import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';
import {
  NATIONAL_EVENTS,
  NationalEvent,
  isEventLive,
  isEventCompletedToday,
  getEventTimeText,
  getScheduleText,
} from '../data/nationalRaces';
import { scheduleEventNotifications, hasNotificationPermission } from '../utils/eventNotifications';

export default function NationalRacesScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const nationalRaces = useGameStore((s) => s.nationalRaces);
  const refreshNationalEvents = useGameStore((s) => s.refreshNationalEvents);
  const enterNationalRace = useGameStore((s) => s.enterNationalRace);
  const selectCourse = useGameStore((s) => s.selectCourse);
  const setActiveMode = useGameStore((s) => s.setActiveMode);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const setBetAmount = useGameStore((s) => s.setBetAmount);

  const [modalEvent, setModalEvent] = useState<NationalEvent | null>(null);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Refresh events on mount if empty + set up notifications
  useEffect(() => {
    if (!nationalRaces || Object.keys(nationalRaces).length === 0) {
      refreshNationalEvents();
    }
    // First time on national races screen: ask for notification permission
    // iOS will show the system prompt. If already granted, silently re-schedules.
    hasNotificationPermission().then(granted => {
      if (!granted) {
        // Small delay so user sees the screen first before iOS prompt
        setTimeout(() => scheduleEventNotifications().catch(() => {}), 1500);
      }
    });
  }, []);

  // Pulse animation for LIVE badges
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Force re-render every minute to update live status
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleCardPress = useCallback((event: NationalEvent) => {
    const state = nationalRaces?.[event.id];
    const live = isEventLive(event);
    const completedToday = isEventCompletedToday(event, state);
    const isEntered = state?.entered ?? false;

    if (!live || completedToday) return; // locked

    if (isEntered) {
      proceedToRace(event);
    } else {
      setModalEvent(event);
    }
  }, [nationalRaces, coins]);

  const proceedToRace = useCallback((event: NationalEvent) => {
    const state = nationalRaces?.[event.id];
    if (!state) return;

    if (!state.entered) {
      const success = enterNationalRace(event.id);
      if (!success) return;
    }

    const raceState = useGameStore.getState().nationalRaces?.[event.id];
    if (!raceState) return;
    const courseId = raceState.courseIds[raceState.seriesProgress?.racesCompleted ?? 0] || raceState.courseIds[0];
    selectCourse(courseId);
    setActiveMode({
      type: 'national_race',
      eventId: event.id,
      multiplier: event.multiplier,
      entryFee: event.entryFee,
      seriesRaceIndex: raceState.seriesProgress?.racesCompleted ?? 0,
    });
    selectMarble(null as any);
    setBetAmount(0);
    router.push('/betting');
  }, [nationalRaces]);

  const handleModalConfirm = useCallback(() => {
    if (!modalEvent) return;
    setModalEvent(null);
    proceedToRace(modalEvent);
  }, [modalEvent, proceedToRace]);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <CoinPill amount={coins} />
          </View>

          {/* Title */}
          <Text style={styles.title}>NATIONAL RACES</Text>
          <Text style={styles.subtitle}>
            Daily events with multiplied payouts
          </Text>

          {/* How it works */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>HOW IT WORKS</Text>
            <Text style={styles.infoText}>
              Each event goes live at a set time every day (Eastern Time). You get one shot per event per day. Pay the entry fee, pick your marble, and race for multiplied payouts!
            </Text>
          </View>

          {/* Marbles row */}
          <View style={styles.marblesRow}>
            {MARBLES.map((m) => (
              <MarbleDot key={m.id} marble={m} size={28} />
            ))}
          </View>

          {/* Events */}
          <Text style={styles.sectionTitle}>TODAY'S EVENTS</Text>

          {NATIONAL_EVENTS.map((event) => {
            const state = nationalRaces?.[event.id];
            const isEntered = state?.entered ?? false;
            const canAfford = coins >= event.entryFee;
            const seriesProgress = state?.seriesProgress;
            const live = isEventLive(event);
            const completedToday = isEventCompletedToday(event, state);
            const isLocked = !live || completedToday;

            return (
              <Pressable
                key={event.id}
                onPress={() => handleCardPress(event)}
                disabled={isLocked && !isEntered}
                style={({ pressed }) => [pressed && !isLocked && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              >
                <LinearGradient
                  colors={isLocked && !isEntered ? ['#333', '#2a2a2a'] : event.colors}
                  style={[styles.eventCard, isLocked && !isEntered && { opacity: 0.5 }]}
                >
                  <View style={styles.eventHeader}>
                    <View style={styles.multiplierBadge}>
                      <Text style={styles.multiplierText}>{event.multiplier}X</Text>
                    </View>
                    {completedToday ? (
                      <View style={styles.completedBadge}>
                        <Text style={styles.completedText}>DONE</Text>
                      </View>
                    ) : isEntered ? (
                      <View style={styles.enteredBadge}>
                        <Text style={styles.enteredText}>ENTERED</Text>
                      </View>
                    ) : live ? (
                      <Animated.View style={[styles.liveBadge, { opacity: pulseAnim }]}>
                        <Text style={styles.liveText}>LIVE</Text>
                      </Animated.View>
                    ) : (
                      <View style={styles.upcomingBadge}>
                        <Text style={styles.upcomingText}>UPCOMING</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.eventName}>{event.name}</Text>
                  <Text style={styles.eventSub}>{event.subtitle}</Text>

                  {/* Time status */}
                  <Text style={styles.scheduleText}>
                    {getEventTimeText(event, state)}
                  </Text>

                  {/* Series progress */}
                  {seriesProgress && event.format === 'series' && !completedToday && (
                    <View style={styles.seriesBar}>
                      <Text style={styles.seriesText}>
                        Race {seriesProgress.racesCompleted + 1} of {event.seriesLength}
                      </Text>
                    </View>
                  )}

                  <View style={styles.eventFooter}>
                    <Text style={styles.entryFee}>
                      {completedToday
                        ? 'Resets tomorrow'
                        : isEntered
                          ? 'CONTINUE'
                          : live
                            ? `Entry: ${event.entryFee} coins`
                            : getScheduleText(event)}
                    </Text>
                    <Text style={styles.enterText}>
                      {completedToday
                        ? 'COMPLETED'
                        : isEntered
                          ? 'RACE NOW'
                          : live
                            ? canAfford ? 'ENTER' : 'NOT ENOUGH'
                            : 'LOCKED'}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
            );
          })}

          {/* Rewards info */}
          <Text style={styles.sectionTitle}>REWARDS</Text>
          <View style={styles.rewardsCard}>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardPlace}>1st Place</Text>
              <Text style={styles.rewardValue}>Entry x Multiplier</Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={styles.rewardPlace}>2nd Place</Text>
              <Text style={styles.rewardValue}>Entry x 0.5</Text>
            </View>
            <View style={styles.rewardRow}>
              <Text style={[styles.rewardPlace, { borderBottomWidth: 0 }]}>3rd Place</Text>
              <Text style={[styles.rewardValue, { borderBottomWidth: 0 }]}>Entry x 0.25</Text>
            </View>
          </View>
        </ScrollView>

        {/* ===== ENTRY CONFIRMATION MODAL ===== */}
        <Modal
          visible={!!modalEvent}
          transparent
          animationType="fade"
          onRequestClose={() => setModalEvent(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              {modalEvent && (
                <>
                  <LinearGradient
                    colors={modalEvent.colors}
                    style={styles.modalHeader}
                  >
                    <Text style={styles.modalMultiplier}>{modalEvent.multiplier}X</Text>
                    <Text style={styles.modalEventName}>{modalEvent.name}</Text>
                  </LinearGradient>

                  <View style={styles.modalBody}>
                    <Text style={styles.modalTitle}>ENTER THIS EVENT?</Text>
                    <Text style={styles.modalDesc}>
                      {modalEvent.subtitle}{'\n'}You get one shot today — make it count!
                    </Text>

                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalInfoItem}>
                        <Text style={styles.modalInfoLabel}>ENTRY FEE</Text>
                        <Text style={styles.modalInfoValue}>{modalEvent.entryFee}</Text>
                      </View>
                      <View style={styles.modalInfoItem}>
                        <Text style={styles.modalInfoLabel}>1ST PRIZE</Text>
                        <Text style={[styles.modalInfoValue, { color: Colors.yellow }]}>
                          {modalEvent.entryFee * modalEvent.multiplier}
                        </Text>
                      </View>
                    </View>

                    {coins < modalEvent.entryFee ? (
                      <Text style={styles.modalWarning}>
                        Not enough coins! You need {modalEvent.entryFee - coins} more.
                      </Text>
                    ) : (
                      <Text style={styles.modalBalance}>
                        Balance after entry: {coins - modalEvent.entryFee} coins
                      </Text>
                    )}

                    <View style={styles.modalActions}>
                      <PrimaryButton
                        label={`ENTER FOR ${modalEvent.entryFee} COINS`}
                        onPress={handleModalConfirm}
                        disabled={coins < modalEvent.entryFee}
                      />
                      <PrimaryButton
                        label="CANCEL"
                        variant="ghost"
                        onPress={() => setModalEvent(null)}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', marginBottom: 16 },

  infoCard: {
    backgroundColor: 'rgba(155,89,182,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(155,89,182,0.3)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 16,
  },
  infoTitle: { fontFamily: Fonts.bodyBold, fontSize: 11, color: '#c39bd3', letterSpacing: 1, marginBottom: 6 },
  infoText: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50, lineHeight: 18 },

  marblesRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },

  sectionTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.whiteAlpha50, letterSpacing: 2, marginBottom: 10, marginTop: 6 },

  eventCard: { borderRadius: BorderRadius.lg, padding: 18, marginBottom: 10 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  multiplierBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
  },
  multiplierText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.white },

  liveBadge: {
    backgroundColor: '#e74c3c',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
  },
  liveText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.white, letterSpacing: 1 },

  upcomingBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
  },
  upcomingText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.white, letterSpacing: 0.5 },

  completedBadge: {
    backgroundColor: 'rgba(46,204,113,0.3)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
  },
  completedText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.green, letterSpacing: 0.5 },

  enteredBadge: { backgroundColor: 'rgba(255,194,32,0.3)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  enteredText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.yellow, letterSpacing: 0.5 },

  eventName: { fontFamily: Fonts.display, fontSize: 20, color: Colors.white, textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  eventSub: { fontFamily: Fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  scheduleText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },

  seriesBar: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    padding: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  seriesText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.white },

  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  entryFee: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  enterText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.white },

  rewardsCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 14,
  },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rewardPlace: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.white },
  rewardValue: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.yellow },

  /* ===== MODAL ===== */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0d1a3a',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 24,
    alignItems: 'center',
  },
  modalMultiplier: {
    fontFamily: Fonts.display,
    fontSize: 36,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  modalEventName: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalBody: {
    padding: 20,
  },
  modalTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInfoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modalInfoItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalInfoLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
    marginBottom: 4,
  },
  modalInfoValue: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.white,
  },
  modalWarning: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalBalance: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: {
    gap: 8,
  },
});
