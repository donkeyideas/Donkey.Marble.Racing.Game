import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, BorderRadius, Spacing } from '../theme';
import BackButton from '../components/BackButton';

const LEGAL_CONTENT: Record<string, { title: string; sections: { heading: string; body: string }[] }> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        heading: 'Overview',
        body: 'Donkey Marble Racing ("we", "us", "our") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights.',
      },
      {
        heading: 'Data We Collect',
        body: 'We collect minimal data. All game progress (coins, race history, season standings, achievements) is stored locally on your device using AsyncStorage. We do not collect personal information such as your name, email address, or location.\n\nIf you make in-app purchases, payment processing is handled entirely by Apple (App Store) or Google (Google Play). We do not receive or store your payment card details.',
      },
      {
        heading: 'How We Use Data',
        body: 'Your locally stored game data is used solely to provide the game experience \u2014 tracking your progress, coins, achievements, and season standings. We do not sell, share, or transmit your data to any third parties.',
      },
      {
        heading: 'Analytics & Tracking',
        body: 'The app does not currently use any third-party analytics SDKs, advertising frameworks, or tracking technologies. No data is sent to external servers.',
      },
      {
        heading: 'Children\u2019s Privacy',
        body: 'Donkey Marble Racing is rated for ages 13+ due to simulated gambling themes (virtual coins only). We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, please contact us at info@donkeyideas.com.',
      },
      {
        heading: 'Data Deletion',
        body: 'You can delete all your data at any time by going to Settings > Delete Account & All Data. This permanently removes all locally stored game data from your device.',
      },
      {
        heading: 'Changes to This Policy',
        body: 'We may update this privacy policy from time to time. Changes will be reflected in the app and on our website. Continued use of the app after changes constitutes acceptance.',
      },
      {
        heading: 'Contact',
        body: 'If you have questions about this privacy policy, contact us at:\n\nEmail: info@donkeyideas.com\nDonkey Ideas LLC',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        heading: 'Acceptance of Terms',
        body: 'By downloading, installing, or using Donkey Marble Racing ("the App"), you agree to these Terms of Service. If you do not agree, do not use the App.',
      },
      {
        heading: 'Virtual Currency',
        body: 'The App uses virtual coins as in-game currency. Virtual coins have no real-world monetary value and cannot be exchanged for real money. All betting within the App uses virtual coins only \u2014 no real money is wagered, won, or lost at any time.',
      },
      {
        heading: 'In-App Purchases',
        body: 'The App offers optional in-app purchases for virtual coin packs and season passes. All purchases are processed through Apple App Store or Google Play Store and are subject to their respective terms and refund policies. Purchases are non-transferable.',
      },
      {
        heading: 'Acceptable Use',
        body: 'You agree to use the App only for its intended entertainment purpose. You may not:\n\n\u2022 Attempt to manipulate or exploit game mechanics\n\u2022 Reverse-engineer, decompile, or disassemble the App\n\u2022 Use the App for any illegal purpose\n\u2022 Attempt to access other users\u2019 data',
      },
      {
        heading: 'Intellectual Property',
        body: 'All content in the App \u2014 including graphics, code, marble designs, track layouts, and branding \u2014 is the property of Donkey Ideas LLC and is protected by copyright and intellectual property laws.',
      },
      {
        heading: 'Disclaimer of Warranties',
        body: 'The App is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the App will be error-free, uninterrupted, or free of harmful components.',
      },
      {
        heading: 'Limitation of Liability',
        body: 'To the maximum extent permitted by law, Donkey Ideas LLC shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App, including loss of virtual currency or game progress.',
      },
      {
        heading: 'Changes to Terms',
        body: 'We reserve the right to modify these terms at any time. Continued use of the App after changes constitutes acceptance of the new terms.',
      },
      {
        heading: 'Contact',
        body: 'For questions about these terms, contact us at:\n\nEmail: info@donkeyideas.com\nDonkey Ideas LLC',
      },
    ],
  },
  'responsible-gaming': {
    title: 'Responsible Gaming',
    sections: [
      {
        heading: 'Our Commitment',
        body: 'Donkey Marble Racing is designed to be a fun, casual entertainment experience. While the App features simulated betting mechanics, no real money is involved at any point.',
      },
      {
        heading: 'Virtual Currency Only',
        body: 'All coins in the App are virtual and have no real-world value. You cannot cash out, withdraw, or convert virtual coins to real money. Winning or losing virtual coins has no financial impact.',
      },
      {
        heading: 'Built-In Safeguards',
        body: 'We have implemented safeguards to promote responsible play:\n\n\u2022 Daily purchase limits (3 transactions per day)\n\u2022 Daily coin cap (25,000 coins per day from purchases)\n\u2022 No credit/debt system \u2014 you can only bet coins you have\n\u2022 No pressure to spend real money \u2014 coins are earned through gameplay',
      },
      {
        heading: 'Healthy Play Habits',
        body: 'We encourage players to:\n\n\u2022 Set personal time limits for gameplay\n\u2022 Take regular breaks\n\u2022 Remember that the App is meant for entertainment\n\u2022 Never spend more than you can comfortably afford on in-app purchases',
      },
      {
        heading: 'Age Restriction',
        body: 'This App is rated for ages 13+ due to simulated gambling themes. Parents and guardians should monitor their children\u2019s use of apps that feature betting mechanics, even when virtual.',
      },
      {
        heading: 'Getting Help',
        body: 'If you or someone you know has concerns about gambling behavior, the following resources are available:\n\n\u2022 National Problem Gambling Helpline: 1-800-522-4700\n\u2022 NCPG website: www.ncpgambling.org\n\u2022 Crisis Text Line: Text HOME to 741741',
      },
      {
        heading: 'Contact Us',
        body: 'If you have concerns about responsible gaming in our App, please contact us at:\n\nEmail: info@donkeyideas.com\nDonkey Ideas LLC',
      },
    ],
  },
  support: {
    title: 'Support & FAQ',
    sections: [
      {
        heading: 'Frequently Asked Questions',
        body: '',
      },
      {
        heading: 'Is this real gambling?',
        body: 'No. Donkey Marble Racing uses virtual coins only. No real money is wagered, won, or lost. Virtual coins cannot be converted to real currency.',
      },
      {
        heading: 'How do I get more coins?',
        body: 'You can earn coins by:\n\n\u2022 Winning bets on marble races\n\u2022 Completing daily challenges\n\u2022 Maintaining daily login streaks\n\u2022 Purchasing coin packs from the Store (optional)',
      },
      {
        heading: 'I lost all my coins. What now?',
        body: 'You can still play Quick Race mode with no stakes. Daily challenges and login streaks will also help you earn coins back. Coins are also awarded for various achievements.',
      },
      {
        heading: 'How do seasons work?',
        body: 'Each season consists of 10 weeks with 5 races per week. Marbles earn points based on their finishing position. The top 6 marbles advance to playoffs, culminating in a championship series.',
      },
      {
        heading: 'What is Franchise mode?',
        body: 'In Franchise mode, you pick one marble for the entire season and ride with it. Your marble earns points in every race and you follow its journey through the standings and playoffs.',
      },
      {
        heading: 'Can I get a refund on in-app purchases?',
        body: 'Refunds for in-app purchases are handled by Apple (App Store) or Google (Google Play). Contact their support teams directly through your purchase history.',
      },
      {
        heading: 'How do I delete my data?',
        body: 'Go to Settings and tap "Delete Account & All Data." This permanently removes all game data from your device. This action cannot be undone.',
      },
      {
        heading: 'Contact Support',
        body: 'For bugs, questions, or feedback:\n\nEmail: info@donkeyideas.com\n\nWe typically respond within 48 hours.',
      },
    ],
  },
};

export default function LegalScreen() {
  const router = useRouter();
  const { page } = useLocalSearchParams<{ page: string }>();
  const content = LEGAL_CONTENT[page || 'privacy'];

  if (!content) {
    return (
      <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <Text style={styles.headerTitle}>NOT FOUND</Text>
            <View style={{ width: 60 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
            <Text style={styles.headerTitle}>{content.title.toUpperCase()}</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Content */}
          {content.sections.map((section, i) => (
            <View key={i} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              {section.body ? (
                <Text style={styles.sectionBody}>{section.body}</Text>
              ) : null}
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Donkey Marble Racing v1.0.1</Text>
            <Text style={styles.footerText}>{'\u00A9'} {new Date().getFullYear()} Donkey Ideas LLC</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
  },

  section: {
    marginBottom: 20,
  },
  sectionHeading: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
    marginBottom: 8,
  },
  sectionBody: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 22,
  },

  footer: {
    alignItems: 'center',
    marginTop: 20,
    gap: 4,
  },
  footerText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
  },
});
