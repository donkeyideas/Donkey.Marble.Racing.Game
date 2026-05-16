import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import { generateTrack } from '../engine/trackGenerator';
import type { TrackConfig } from '../engine/tracks';
import BackButton from '../components/BackButton';

const BG_THEME_LABELS: Record<string, string> = {
  grass: 'Meadow', lava: 'Volcano', ice: 'Frozen', cyber: 'Cyber',
  beach: 'Beach', forest: 'Forest', desert: 'Desert', sunset: 'Sunset',
  night: 'Night', candy: 'Candy', ocean: 'Ocean', volcanic: 'Volcanic',
  neon: 'Neon', snow: 'Snow',
};

export default function CustomTrackScreen() {
  const router = useRouter();
  const [seedText, setSeedText] = useState('');
  const [preview, setPreview] = useState<{ seed: number; track: TrackConfig } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [modalMsg, setModalMsg] = useState<{ title: string; body: string } | null>(null);
  const customTracks = useGameStore(s => s.customTracks);
  const saveCustomTrack = useGameStore(s => s.saveCustomTrack);
  const removeCustomTrack = useGameStore(s => s.removeCustomTrack);
  const selectCourse = useGameStore(s => s.selectCourse);
  const setActiveMode = useGameStore(s => s.setActiveMode);

  const handleGenerate = () => {
    const seed = parseInt(seedText, 10);
    if (isNaN(seed) || seed < 1) {
      setModalMsg({ title: 'Invalid Seed', body: 'Enter a positive number' });
      return;
    }
    try {
      const track = generateTrack(seed);
      setPreview({ seed, track });
      setSaveName(`Custom #${seed}`);
    } catch {
      setModalMsg({ title: 'Error', body: 'Could not generate track from this seed' });
    }
  };

  const handleRace = (seed: number) => {
    selectCourse(`gen-${seed}`);
    setActiveMode({ type: 'quick_race' });
    router.push('/race');
  };

  const handleSave = () => {
    if (!preview) return;
    saveCustomTrack(preview.seed, saveName || `Custom #${preview.seed}`);
  };

  const trackInfo = useMemo(() => {
    if (!preview) return null;
    const t = preview.track;
    const features: string[] = [];
    if (t.pendulums?.length) features.push(`${t.pendulums.length} pendulums`);
    if (t.trampolines?.length) features.push(`${t.trampolines.length} trampolines`);
    if (t.cradles?.length) features.push(`${t.cradles.length} cradles`);
    if (t.ballPits?.length) features.push(`${t.ballPits.length} ball pits`);
    if (t.speedBursts?.length) features.push(`${t.speedBursts.length} speed bursts`);
    return {
      theme: BG_THEME_LABELS[t.bgImage] || t.bgImage,
      ramps: t.ramps.length,
      obstacles: t.obstacles.length,
      windmills: t.windmillConfigs.length,
      features,
    };
  }, [preview]);

  const isSaved = preview ? customTracks.some(t => t.seed === preview.seed) : false;

  return (
    <LinearGradient colors={['#e67e22', '#d35400']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>CUSTOM TRACK</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Seed input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter seed number..."
              placeholderTextColor={Colors.whiteAlpha40}
              keyboardType="number-pad"
              value={seedText}
              onChangeText={setSeedText}
            />
            <Pressable style={styles.genBtn} onPress={handleGenerate}>
              <Text style={styles.genBtnText}>GENERATE</Text>
            </Pressable>
          </View>

          {/* Preview */}
          {preview && trackInfo && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>SEED {preview.seed}</Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{trackInfo.theme}</Text>
                  <Text style={styles.statLbl}>THEME</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{trackInfo.ramps}</Text>
                  <Text style={styles.statLbl}>RAMPS</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{trackInfo.obstacles}</Text>
                  <Text style={styles.statLbl}>OBSTACLES</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{trackInfo.windmills}</Text>
                  <Text style={styles.statLbl}>WINDMILLS</Text>
                </View>
              </View>
              {trackInfo.features.length > 0 && (
                <Text style={styles.features}>
                  Features: {trackInfo.features.join(', ')}
                </Text>
              )}

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.raceBtn]}
                  onPress={() => handleRace(preview.seed)}
                >
                  <Text style={styles.actionBtnText}>RACE</Text>
                </Pressable>
                {!isSaved && (
                  <Pressable
                    style={[styles.actionBtn, styles.saveBtn]}
                    onPress={handleSave}
                  >
                    <Text style={styles.actionBtnText}>SAVE</Text>
                  </Pressable>
                )}
                {isSaved && (
                  <Text style={styles.savedLabel}>SAVED</Text>
                )}
              </View>
            </View>
          )}

          {/* Saved tracks */}
          {customTracks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>SAVED TRACKS</Text>
              {customTracks.map(ct => (
                <View key={ct.seed} style={styles.savedCard}>
                  <View style={styles.savedInfo}>
                    <Text style={styles.savedName}>{ct.name}</Text>
                    <Text style={styles.savedSeed}>Seed: {ct.seed}</Text>
                  </View>
                  <Pressable
                    style={[styles.smallBtn, { backgroundColor: Colors.green }]}
                    onPress={() => handleRace(ct.seed)}
                  >
                    <Text style={styles.smallBtnText}>RACE</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, { backgroundColor: Colors.red }]}
                    onPress={() => removeCustomTrack(ct.seed)}
                  >
                    <Text style={styles.smallBtnText}>DEL</Text>
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        {/* Error modal */}
        <Modal visible={!!modalMsg} transparent animationType="fade" onRequestClose={() => setModalMsg(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setModalMsg(null)}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{modalMsg?.title}</Text>
              <Text style={styles.modalBody}>{modalMsg?.body}</Text>
              <Pressable style={styles.modalBtn} onPress={() => setModalMsg(null)}>
                <Text style={styles.modalBtnText}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  title: { fontFamily: Fonts.display, fontSize: 22, color: Colors.white, letterSpacing: 2 },
  scroll: { flex: 1, marginTop: Spacing.md },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  inputRow: { flexDirection: 'row', marginBottom: Spacing.md, gap: 10 },
  input: {
    flex: 1, height: 48, paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: BorderRadius.md,
    borderWidth: 2, borderColor: Colors.yellow,
    fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.white,
  },
  genBtn: {
    height: 48, paddingHorizontal: 18, justifyContent: 'center',
    backgroundColor: Colors.yellow, borderRadius: BorderRadius.md,
  },
  genBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.ink, letterSpacing: 1 },

  previewCard: {
    padding: 18, marginBottom: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  previewTitle: { fontFamily: Fonts.display, fontSize: 18, color: Colors.yellow, marginBottom: 12, letterSpacing: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  stat: { alignItems: 'center' },
  statVal: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.white },
  statLbl: { fontFamily: Fonts.body, fontSize: 10, color: Colors.whiteAlpha50, letterSpacing: 1, marginTop: 2 },
  features: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha60, marginBottom: 12 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'center' },
  actionBtn: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md },
  raceBtn: { backgroundColor: Colors.green },
  saveBtn: { backgroundColor: Colors.blue },
  actionBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.white, letterSpacing: 1 },
  savedLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.whiteAlpha50, letterSpacing: 1 },

  sectionTitle: {
    fontFamily: Fonts.display, fontSize: 16, color: Colors.white,
    letterSpacing: 2, marginBottom: 12, marginTop: 10,
  },

  savedCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  savedInfo: { flex: 1 },
  savedName: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.white },
  savedSeed: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha50 },
  smallBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.sm,
  },
  smallBtnText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.white, letterSpacing: 1 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  modalCard: {
    width: '100%', padding: 24, borderRadius: BorderRadius.lg,
    backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: Colors.yellow,
    alignItems: 'center',
  },
  modalTitle: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow, letterSpacing: 1, marginBottom: 8 },
  modalBody: { fontFamily: Fonts.body, fontSize: 14, color: Colors.whiteAlpha60, textAlign: 'center', marginBottom: 20 },
  modalBtn: {
    paddingVertical: 10, paddingHorizontal: 36,
    backgroundColor: Colors.yellow, borderRadius: BorderRadius.md,
  },
  modalBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.ink, letterSpacing: 1 },
});
