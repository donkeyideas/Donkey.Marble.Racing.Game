import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, BorderRadius, Spacing } from '../theme';
import BackButton from '../components/BackButton';
import { useGameStore } from '../state/gameStore';

const LEGAL_PAGES = [
  {
    label: 'Privacy Policy',
    sub: 'How we collect, use, and protect your data',
    page: 'privacy',
  },
  {
    label: 'Terms of Service',
    sub: 'Rules governing use of the app',
    page: 'terms',
  },
  {
    label: 'Responsible Gaming',
    sub: 'Our commitment to safe gameplay',
    page: 'responsible-gaming',
  },
  {
    label: 'Support & FAQ',
    sub: 'Get help, report bugs, contact us',
    page: 'support',
  },
];

export default function SettingsScreen() {
  const router = useRouter();
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const resetCoins = useGameStore((s) => s.resetCoins);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(playerName || '');

  const handleNameSave = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length >= 2 && trimmed.length <= 16) {
      setPlayerName(trimmed);
      setEditingName(false);
    } else {
      Alert.alert('Invalid Name', 'Name must be 2-16 characters.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data including coins, race history, season progress, and cosmetics.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'All your progress will be permanently lost. You will start fresh if you return.',
              [
                { text: 'Keep Account', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await AsyncStorage.removeItem('dmr-game-state');
                      resetCoins();
                      router.replace('/');
                    } catch {
                      setDeleting(false);
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

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
            <Text style={styles.headerTitle}>SETTINGS</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Account Section */}
          <Text style={styles.sectionTitle}>ACCOUNT</Text>

          <View style={styles.card}>
            {editingName ? (
              <View style={styles.accountRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarLetter}>
                    {nameInput ? nameInput[0].toUpperCase() : 'P'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={nameInput}
                    onChangeText={setNameInput}
                    maxLength={16}
                    autoFocus
                    style={styles.nameInput}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    placeholder="Enter name..."
                    onSubmitEditing={handleNameSave}
                    returnKeyType="done"
                  />
                  <View style={styles.nameActions}>
                    <Pressable onPress={handleNameSave} style={styles.nameSaveBtn}>
                      <Text style={styles.nameSaveBtnText}>SAVE</Text>
                    </Pressable>
                    <Pressable onPress={() => { setEditingName(false); setNameInput(playerName || ''); }} style={styles.nameCancelBtn}>
                      <Text style={styles.nameCancelBtnText}>CANCEL</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => { setNameInput(playerName || ''); setEditingName(true); }}>
                <View style={styles.accountRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetter}>
                      {playerName ? playerName[0].toUpperCase() : 'P'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accountName}>{playerName || 'Player'}</Text>
                    <Text style={styles.accountSub}>Tap to change name</Text>
                  </View>
                  <Text style={styles.linkArrow}>{'\u203A'}</Text>
                </View>
              </Pressable>
            )}
          </View>

          {/* Legal & Compliance — in-app pages */}
          <Text style={styles.sectionTitle}>LEGAL</Text>

          {LEGAL_PAGES.map((item) => (
            <Pressable
              key={item.page}
              onPress={() => {
                if (item.page === 'support') {
                  router.push('/support');
                } else {
                  router.push({ pathname: '/legal', params: { page: item.page } });
                }
              }}
              style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.linkLabel}>{item.label}</Text>
                <Text style={styles.linkSub}>{item.sub}</Text>
              </View>
              <Text style={styles.linkArrow}>{'\u203A'}</Text>
            </Pressable>
          ))}

          {/* Danger Zone */}
          <Text style={styles.sectionTitle}>ACCOUNT ACTIONS</Text>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && { opacity: 0.7 },
              deleting && { opacity: 0.4 },
            ]}
          >
            <Text style={styles.deleteButtonText}>
              {deleting ? 'DELETING...' : 'DELETE ACCOUNT & ALL DATA'}
            </Text>
            <Text style={styles.deleteSub}>
              Permanently removes all local data and resets the app
            </Text>
          </Pressable>

          {/* Contact */}
          <Text style={styles.sectionTitle}>CONTACT</Text>

          <Pressable
            onPress={() => Linking.openURL('mailto:info@donkeyideas.com')}
            style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Email Support</Text>
              <Text style={styles.linkSub}>info@donkeyideas.com</Text>
            </View>
            <Text style={styles.linkArrow}>{'\u203A'}</Text>
          </Pressable>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Donkey Marble Racing v1.0.1</Text>
            <Text style={styles.footerText}>{'\u00A9'} {new Date().getFullYear()} Donkey Ideas LLC</Text>
            <Text style={styles.footerDisclaimer}>
              Virtual coins only {'\u2014'} No real money gambling {'\u2014'} Ages 17+
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
  },

  /* Section title */
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 20,
  },

  /* Account card */
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 4,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.ink,
    marginTop: -1,
  },
  accountName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
  },
  accountSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha35,
  },
  nameInput: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
    borderBottomWidth: 2,
    borderBottomColor: Colors.yellow,
    paddingBottom: 4,
    marginBottom: 8,
  },
  nameActions: {
    flexDirection: 'row',
    gap: 8,
  },
  nameSaveBtn: {
    backgroundColor: Colors.yellow,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  nameSaveBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.ink,
    letterSpacing: 0.5,
  },
  nameCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  nameCancelBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    letterSpacing: 0.5,
  },

  /* Link cards */
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  linkLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  linkSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    marginTop: 2,
  },
  linkArrow: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.whiteAlpha35,
  },

  /* Delete button */
  deleteButton: {
    backgroundColor: 'rgba(231,76,60,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(231,76,60,0.3)',
    borderRadius: BorderRadius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteButtonText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.red,
    letterSpacing: 0.5,
  },
  deleteSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: 'rgba(231,76,60,0.6)',
    marginTop: 4,
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    marginTop: 30,
    gap: 4,
  },
  footerText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
  },
  footerDisclaimer: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha25,
    marginTop: 4,
    textAlign: 'center',
  },
});
