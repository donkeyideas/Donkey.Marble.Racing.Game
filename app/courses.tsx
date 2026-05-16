import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import MarbleDot from '../components/MarbleDot';
import BackButton from '../components/BackButton';
import { useGameStore } from '../state/gameStore';
import { ALL_COURSES as COURSES, CourseTheme, THEME_COLORS } from '../data/courses';

const FILTER_TABS: { label: string; value: CourseTheme | 'all' | 'grand-prix' }[] = [
  { label: 'ALL', value: 'all' },
  { label: 'GRAND PRIX', value: 'grand-prix' },
  { label: 'MEADOW', value: 'meadow' },
  { label: 'VOLCANO', value: 'volcano' },
  { label: 'FROZEN', value: 'frozen' },
  { label: 'CYBER', value: 'cyber' },
];

function getMarbleById(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
}

export default function CoursesScreen() {
  const router = useRouter();
  const selectCourse = useGameStore(s => s.selectCourse);
  const [activeFilter, setActiveFilter] = useState<CourseTheme | 'all' | 'grand-prix'>('all');

  const filteredCourses =
    activeFilter === 'all'
      ? COURSES
      : activeFilter === 'grand-prix'
        ? COURSES.filter((c) => c.id.startsWith('grand-prix') || c.id.startsWith('gp-'))
        : COURSES.filter((c) => c.theme === activeFilter);

  const setActiveMode = useGameStore(s => s.setActiveMode);

  const handlePlay = (courseId: string) => {
    selectCourse(courseId);
    setActiveMode({ type: 'quick_race' });
    useGameStore.getState().resetBet();
    router.push('/race');
  };

  const handleRandom = () => {
    const pool = filteredCourses.length > 0 ? filteredCourses : COURSES;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    handlePlay(pick.id);
  };

  return (
    <LinearGradient
      colors={['#1d56d4', '#0a3a96']}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== HEADER ROW ===== */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <Text style={styles.title}>COURSES</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* ===== FILTER TABS ===== */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.value;
              const themeColor =
                tab.value === 'all' ? Colors.white
                : tab.value === 'grand-prix' ? '#e74c3c'
                : THEME_COLORS[tab.value];

              return (
                <Pressable
                  key={tab.value}
                  onPress={() => setActiveFilter(tab.value)}
                  style={[
                    styles.filterTab,
                    isActive
                      ? styles.filterTabActive
                      : {
                          backgroundColor: themeColor + '1F',
                          borderColor: themeColor + '33',
                        },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      isActive
                        ? styles.filterTabTextActive
                        : { color: themeColor },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ===== RANDOM CARD ===== */}
          <Pressable onPress={handleRandom} style={styles.randomCard}>
            <Text style={styles.randomDice}>🎲</Text>
            <View style={styles.randomInfo}>
              <Text style={styles.randomTitle}>RANDOM COURSE</Text>
              <Text style={styles.randomDesc}>
                Pick a random {activeFilter !== 'all' ? activeFilter + ' ' : ''}course and race!
              </Text>
            </View>
            <View style={styles.playPill}>
              <Text style={styles.playPillText}>GO</Text>
            </View>
          </Pressable>

          {/* ===== COURSE CARDS ===== */}
          {filteredCourses.map((course) => {
            const favoredMarble = getMarbleById(course.favoredMarbleId);
            const themeColor = THEME_COLORS[course.theme];

            return (
              <Pressable key={course.id} onPress={() => handlePlay(course.id)} style={styles.card}>
                {/* Gradient thumbnail */}
                <LinearGradient
                  colors={course.gradientColors}
                  style={styles.cardThumbnail}
                >
                  <Text style={styles.cardThumbnailText}>
                    {course.name.toUpperCase()}
                  </Text>
                </LinearGradient>

                {/* Course info */}
                <View style={styles.cardBody}>
                  <View style={styles.cardInfoRow}>
                    <View style={styles.cardInfoLeft}>
                      <Text style={styles.cardName}>{course.name}</Text>
                      <Text style={styles.cardDescription}>
                        {course.description}
                      </Text>
                      <View style={styles.favorsRow}>
                        <Text style={styles.favorsLabel}>Favors: </Text>
                        <MarbleDot marble={favoredMarble} size={16} />
                        <Text style={styles.favorsMarbleName}>
                          {favoredMarble.name}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.playPill}>
                      <Text style={styles.playPillText}>PLAY</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  /* ===== HEADER ===== */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 60,
  },

  /* ===== FILTER TABS ===== */
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterTabActive: {
    backgroundColor: Colors.yellow,
  },
  filterTabText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  filterTabTextActive: {
    color: Colors.ink,
  },

  /* ===== RANDOM CARD ===== */
  randomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,194,32,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.25)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  randomDice: {
    fontSize: 32,
  },
  randomInfo: {
    flex: 1,
  },
  randomTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.yellow,
    marginBottom: 2,
  },
  randomDesc: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
  },

  /* ===== COURSE CARD ===== */
  card: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardThumbnail: {
    height: 80,
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbnailText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.whiteAlpha25,
    letterSpacing: 2,
  },
  cardBody: {
    padding: 12,
  },
  cardInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfoLeft: {
    flex: 1,
    marginRight: 8,
  },
  cardName: {
    fontFamily: Fonts.display,
    fontSize: 15,
    color: Colors.white,
    marginBottom: 2,
  },
  cardDescription: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    marginBottom: 6,
  },
  favorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  favorsLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
  },
  favorsMarbleName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.whiteAlpha60,
  },
  themePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  themePillText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  playPill: {
    backgroundColor: Colors.yellow,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  playPillText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.ink,
    letterSpacing: 1,
  },
});
