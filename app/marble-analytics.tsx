import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore, MarbleAnalytics } from '../state/gameStore';
import { THEME_COLORS, CourseTheme } from '../data/courses';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

/* ============================================================================
 * MARBLE DEEP ANALYTICS — every figure on this screen is derived from tracked
 * data in `marbleAnalytics` (engine telemetry folded in `setLastResult`). No
 * random numbers, no hardcoded fakes. A marble with zero races shows "NEW".
 *
 * METRIC FORMULAS (each one-liner; see inline notes for detail):
 *  - ELO          : standard Elo, K=32, start 1500, pairwise vs the field — stored.
 *  - Consistency  : 1 − (σ of finish positions / maxσ), clamped 0..1.
 *  - xFinish      : expected finish = 4.5 − 7·(normalized base-stat strength),
 *                   i.e. stronger base stats ⇒ lower (better) expected place.
 *  - xFinish Δ    : xFinish − actual average finish (positive = outperforming).
 *  - Clutch       : close-race win rate ÷ overall win rate, scaled to a 0–99 rating.
 *  - DVOA         : percent better than the league-average finish position.
 *  - WAR          : actual wins − replacement wins (replacement = races / 8).
 *  - Percentile   : rank of this marble's metric among all 8, as a 0–99 percentile.
 * ========================================================================== */

const FIELD = MARBLES.length; // 8

/** σ (population standard deviation) of a number list. */
function stdDev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Normalized base-stat strength 0..1 from a marble's 4 base stats. */
function baseStrength(m: MarbleData): number {
  const { speed, power, bounce, luck } = m.stats;
  // Max realistic stat sum ~ 20 (4 stats, ~5 each). Normalize the average.
  return (speed + power + bounce + luck) / 4 / 5;
}

/**
 * xFinish — expected finishing position purely from base stats vs the field.
 * Strongest marble ⇒ ~1, weakest ⇒ ~8. Linear map of normalized strength.
 */
function xFinish(m: MarbleData): number {
  // Relative strength vs field average so the spread is meaningful.
  const fieldAvg = MARBLES.reduce((s, x) => s + baseStrength(x), 0) / FIELD;
  const rel = baseStrength(m) - fieldAvg; // roughly -0.2..+0.2
  // 4.5 = mid of 1..8. Scale rel so a strong marble lands near 1.5–2.
  return Math.max(1, Math.min(8, 4.5 - rel * 14));
}

/** Average finish position from tracked data (NaN-safe). */
function avgFinish(a: MarbleAnalytics): number {
  return a.races > 0 ? a.totalFinishPosition / a.races : 0;
}

/** Consistency 0..1 — 1 minus normalized σ of finish positions. */
function consistency(a: MarbleAnalytics): number {
  if (a.finishPositions.length < 2) return 0;
  const sigma = stdDev(a.finishPositions);
  // Max σ for positions 1..8 is ~3.5 (split evenly between extremes).
  return Math.max(0, Math.min(1, 1 - sigma / 3.5));
}

/** Clutch rating 0..99 — close-race win rate relative to overall win rate. */
function clutch(a: MarbleAnalytics): number {
  if (a.closeRaces === 0) return 0;
  const closeWinRate = a.closeWins / a.closeRaces;
  const overallWinRate = a.races > 0 ? a.finishCounts[0] / a.races : 0;
  if (overallWinRate === 0) return Math.round(closeWinRate * 99);
  // Ratio >1 means the marble over-performs when it matters.
  const ratio = closeWinRate / overallWinRate;
  return Math.max(0, Math.min(99, Math.round((closeWinRate * 0.6 + (ratio / 2) * 0.4) * 99)));
}

/** DVOA — percent better than the league-average finish position. */
function dvoa(a: MarbleAnalytics): number {
  if (a.races === 0) return 0;
  const leagueAvg = 4.5; // mean finish in an 8-marble race
  const mine = avgFinish(a);
  // Lower position = better, so (league − mine)/league × 100.
  return ((leagueAvg - mine) / leagueAvg) * 100;
}

/** WAR — wins above a replacement-level marble (1/8 expected win rate). */
function war(a: MarbleAnalytics): number {
  const wins = a.finishCounts[0];
  const replacementWins = a.races / FIELD;
  return wins - replacementWins;
}

/** Percentile 0..99 of `value` among `all` (higher value = higher percentile). */
function percentile(value: number, all: number[]): number {
  if (all.length <= 1) return 50;
  const below = all.filter(v => v < value).length;
  const equal = all.filter(v => v === value).length;
  // Mid-rank percentile so ties land in the middle of their band.
  return Math.max(0, Math.min(99, Math.round(((below + equal / 2) / all.length) * 99)));
}

const THEME_LABEL: Partial<Record<CourseTheme, string>> = {
  meadow: 'Meadow', volcano: 'Volcano', frozen: 'Frozen', cyber: 'Cyber',
  beach: 'Beach', forest: 'Forest', desert: 'Desert', sunset: 'Sunset',
  night: 'Night', candy: 'Candy', ocean: 'Ocean', volcanic: 'Volcanic',
  neon: 'Neon', snow: 'Snow',
};

function tierFor(elo: number, races: number): string {
  if (races === 0) return 'Unrated';
  if (elo >= 1750) return 'S';
  if (elo >= 1650) return 'A';
  if (elo >= 1550) return 'B';
  if (elo >= 1450) return 'C';
  return 'D';
}

/* ── small presentational pieces ── */

function Metric({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricVal, color ? { color } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function PercentileBar({ label, pctl, color }: { label: string; pctl: number; color: string }) {
  return (
    <View style={styles.pctlRow}>
      <Text style={styles.pctlLabel}>{label}</Text>
      <View style={styles.pctlTrack}>
        <View style={[styles.pctlFill, { width: `${pctl}%`, backgroundColor: color }]} />
        <View style={styles.pctlMarker} />
      </View>
      <Text style={[styles.pctlVal, { color }]}>{pctl}th</Text>
    </View>
  );
}

const ORD = ['th', 'st', 'nd', 'rd'];
function ordinal(n: number): string {
  return ORD[n] ?? 'th';
}

export default function MarbleAnalyticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const marbleAnalytics = useGameStore(s => s.marbleAnalytics);
  const raceHistory = useGameStore(s => s.raceHistory);

  const marble = useMemo(
    () => MARBLES.find(m => m.id === params.id) ?? MARBLES[0],
    [params.id],
  );
  const a = marbleAnalytics[marble.id];
  const hasData = !!a && a.races > 0;

  // Field-wide metric arrays for percentile ranking (all 8 marbles).
  const fieldMetrics = useMemo(() => {
    const speedPctl: number[] = [];
    const consPctl: number[] = [];
    const clutchPctl: number[] = [];
    const dvoaPctl: number[] = [];
    const eloPctl: number[] = [];
    MARBLES.forEach(m => {
      const ma = marbleAnalytics[m.id];
      speedPctl.push(ma ? ma.peakVelocity : 0);
      consPctl.push(ma ? consistency(ma) : 0);
      clutchPctl.push(ma ? clutch(ma) : 0);
      dvoaPctl.push(ma ? dvoa(ma) : 0);
      eloPctl.push(ma ? ma.elo : 1500);
    });
    return { speedPctl, consPctl, clutchPctl, dvoaPctl, eloPctl };
  }, [marbleAnalytics]);

  // Last-20 finish-position trend (from raceHistory, all marbles).
  const last20 = useMemo(() => {
    return raceHistory
      .slice(-20)
      .map(r => r.positions.indexOf(marble.id) + 1) // 1-indexed, 0 if not in race
      .filter(p => p > 0);
  }, [raceHistory, marble.id]);

  // Current / best win streak from last20.
  const streaks = useMemo(() => {
    let cur = 0, best = 0;
    for (let i = last20.length - 1; i >= 0; i--) {
      if (last20[i] === 1) cur++;
      else break;
    }
    let run = 0;
    for (const p of last20) {
      if (p === 1) { run++; best = Math.max(best, run); }
      else run = 0;
    }
    return { cur, best };
  }, [last20]);

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
            <Text style={styles.headerTag}>ANALYTICS</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <MarbleDot marble={marble} size={56} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.heroName}>{marble.name}</Text>
              <Text style={styles.heroSub}>
                {hasData
                  ? `${a.races} races • Tier ${tierFor(a.elo, a.races)}`
                  : 'No races yet'}
              </Text>
            </View>
            <View style={styles.eloBadge}>
              <Text style={styles.eloLabel}>ELO</Text>
              <Text style={styles.eloValue}>{hasData ? a.elo : 'NEW'}</Text>
            </View>
          </View>

          {!hasData && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {marble.name} hasn't raced yet. Run a few races to unlock deep
                analytics — ELO, advanced metrics, physics profile and more.
              </Text>
            </View>
          )}

          {hasData && (
            <>
              {/* Advanced Metrics */}
              <Section title="ADVANCED METRICS">
                <View style={styles.metricRow}>
                  <Metric value={war(a).toFixed(1)} label="WAR" color={Colors.yellow} />
                  <Metric value={xFinish(marble).toFixed(1)} label="xFINISH" color={Colors.green} />
                  <Metric value={consistency(a).toFixed(2)} label="CONSISTENCY" color={Colors.blueSky} />
                </View>
                <View style={styles.metricRow}>
                  <Metric value={String(clutch(a))} label="CLUTCH RTG" />
                  <Metric
                    value={(() => {
                      const d = xFinish(marble) - avgFinish(a);
                      return (d >= 0 ? '+' : '') + d.toFixed(1);
                    })()}
                    label="xFINISH Δ"
                    color={xFinish(marble) - avgFinish(a) >= 0 ? Colors.green : Colors.red}
                  />
                  <Metric value={`${dvoa(a) >= 0 ? '+' : ''}${dvoa(a).toFixed(1)}%`} label="DVOA"
                    color={dvoa(a) >= 0 ? Colors.green : Colors.red} />
                </View>
              </Section>

              {/* Percentile Rankings */}
              <Section title="PERCENTILE RANKINGS VS ALL MARBLES">
                <PercentileBar label="ELO"
                  pctl={percentile(a.elo, fieldMetrics.eloPctl)} color={Colors.yellow} />
                <PercentileBar label="Top Speed"
                  pctl={percentile(a.peakVelocity, fieldMetrics.speedPctl)} color={Colors.green} />
                <PercentileBar label="Consistency"
                  pctl={percentile(consistency(a), fieldMetrics.consPctl)} color={Colors.blueSky} />
                <PercentileBar label="Clutch"
                  pctl={percentile(clutch(a), fieldMetrics.clutchPctl)} color={Colors.yellow} />
                <PercentileBar label="DVOA"
                  pctl={percentile(dvoa(a), fieldMetrics.dvoaPctl)} color={Colors.cyber} />
              </Section>

              {/* Physics Profile */}
              <Section title="PHYSICS PROFILE">
                <View style={styles.metricRow}>
                  <Metric value={(a.totalAvgVelocity / a.races).toFixed(1)} label="AVG SPEED" />
                  <Metric value={a.peakVelocity.toFixed(1)} label="PEAK VEL." color={Colors.green} />
                  <Metric value={Math.round(a.totalBounces / a.races).toString()} label="BOUNCES/RACE" />
                </View>
                <View style={styles.metricRow}>
                  <Metric value={a.totalBounces.toLocaleString()} label="TOTAL BOUNCES" />
                  <Metric value={a.totalBumperHits.toLocaleString()} label="BUMPER HITS" />
                  <Metric value={a.totalPegContacts.toLocaleString()} label="PEG CONTACTS" />
                </View>
                <View style={styles.metricRow}>
                  <Metric value={a.totalWallScrapes.toLocaleString()} label="WALL SCRAPES" />
                  <Metric value={a.totalSpeedBurstHits.toLocaleString()} label="BURST HITS" color={Colors.blueSky} />
                  <Metric value={a.podiums.toString()} label="PODIUMS" color={Colors.yellow} />
                </View>
              </Section>

              {/* Race Intelligence */}
              <Section title="RACE INTELLIGENCE">
                <View style={styles.metricRow}>
                  <Metric
                    value={`${Math.round((a.totalLeadTimeFraction / a.races) * 100)}%`}
                    label="LEAD TIME" color={Colors.yellow} />
                  <Metric value={a.totalOvertakes.toLocaleString()} label="OVERTAKES" />
                  <Metric value={a.totalTimesPassed.toLocaleString()} label="BEEN PASSED" />
                </View>
                <View style={styles.metricRow}>
                  <Metric value={a.wireToWireWins.toString()} label="WIRE-TO-WIRE" color={Colors.green} />
                  <Metric value={a.finishCounts[0].toString()} label="TOTAL WINS" />
                  <Metric
                    value={a.closeRaces > 0 ? `${a.closeWins}/${a.closeRaces}` : '—'}
                    label="CLOSE W/RACES" color={Colors.blueSky} />
                </View>
              </Section>

              {/* Position by Race Stage */}
              <Section title="AVG POSITION BY RACE STAGE">
                {(() => {
                  const stages = [
                    { label: '25%', v: a.totalPosAt25 / a.races },
                    { label: '50%', v: a.totalPosAt50 / a.races },
                    { label: '75%', v: a.totalPosAt75 / a.races },
                    { label: 'Finish', v: avgFinish(a) },
                  ];
                  return (
                    <View style={styles.stageRow}>
                      {stages.map(s => {
                        // Position 1 (best) = tall bar; position 8 = short bar.
                        const pct = ((9 - s.v) / 8) * 100;
                        const good = s.v <= 3;
                        return (
                          <View key={s.label} style={styles.stageCol}>
                            <View style={styles.stageBarTrack}>
                              <View style={[styles.stageBarFill, {
                                height: `${Math.max(6, pct)}%`,
                                backgroundColor: good ? Colors.green : Colors.yellow,
                              }]} />
                            </View>
                            <Text style={styles.stageVal}>{s.v.toFixed(1)}</Text>
                            <Text style={styles.stageLabel}>{s.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </Section>

              {/* Finish Distribution */}
              <Section title="FINISH POSITION DISTRIBUTION">
                {(() => {
                  const max = Math.max(1, ...a.finishCounts);
                  const podiumColors = [Colors.yellow, '#c0c0c0', Colors.bronze];
                  return (
                    <>
                      <View style={styles.distRow}>
                        {a.finishCounts.map((c, i) => (
                          <View key={i} style={styles.distCol}>
                            <View style={styles.distBarTrack}>
                              <View style={[styles.distBarFill, {
                                height: `${Math.max(3, (c / max) * 100)}%`,
                                backgroundColor: podiumColors[i] ?? Colors.whiteAlpha15,
                              }]} />
                            </View>
                            <Text style={styles.distLabel}>{i + 1}{ordinal(i + 1)}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.distFooter}>
                        <Text style={styles.distFooterText}>
                          {a.finishCounts[0]} wins ({Math.round((a.finishCounts[0] / a.races) * 100)}%)
                        </Text>
                        <Text style={styles.distFooterText}>
                          {a.podiums} podiums ({Math.round((a.podiums / a.races) * 100)}%)
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </Section>

              {/* Form & Streaks */}
              <Section title="FORM & STREAKS">
                <View style={styles.metricRow}>
                  <Metric value={streaks.cur.toString()} label="CURRENT WIN STREAK" color={Colors.yellow} />
                  <Metric value={streaks.best.toString()} label="BEST WIN STREAK" />
                </View>
                {last20.length > 0 ? (
                  <>
                    <Text style={styles.miniLabel}>LAST {last20.length} RACES</Text>
                    <View style={styles.trendRow}>
                      {last20.map((p, i) => (
                        <View key={i} style={[styles.trendDot, {
                          backgroundColor:
                            p === 1 ? Colors.green
                            : p <= 3 ? Colors.greenDark
                            : p <= 5 ? Colors.yellowDeep
                            : Colors.red,
                        }]}>
                          <Text style={styles.trendDotText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.miniLabel}>No recent race history</Text>
                )}
              </Section>

              {/* Performance by Theme */}
              {Object.keys(a.themeStats).length > 0 && (
                <Section title="PERFORMANCE BY THEME">
                  <View style={styles.tableHead}>
                    <Text style={[styles.thCell, { flex: 2 }]}>Theme</Text>
                    <Text style={styles.thCell}>W-L</Text>
                    <Text style={styles.thCell}>Win%</Text>
                    <Text style={styles.thCell}>Avg Pos</Text>
                  </View>
                  {Object.entries(a.themeStats)
                    .sort((x, y) => y[1].races - x[1].races)
                    .map(([theme, ts]) => {
                      const winPct = Math.round((ts.wins / ts.races) * 100);
                      const avgPos = (ts.totalPos / ts.races).toFixed(1);
                      const color = THEME_COLORS[theme as CourseTheme] ?? Colors.whiteAlpha50;
                      return (
                        <View key={theme} style={styles.tableRow}>
                          <View style={[styles.tdCell, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}>
                            <View style={[styles.themeDot, { backgroundColor: color }]} />
                            <Text style={styles.tdText}>
                              {THEME_LABEL[theme as CourseTheme] ?? theme}
                            </Text>
                          </View>
                          <Text style={[styles.tdText, styles.tdCell]}>
                            {ts.wins}-{ts.races - ts.wins}
                          </Text>
                          <Text style={[styles.tdText, styles.tdCell]}>{winPct}%</Text>
                          <Text style={[styles.tdText, styles.tdCell]}>{avgPos}</Text>
                        </View>
                      );
                    })}
                </Section>
              )}

              {/* ELO History */}
              {a.eloHistory.length >= 2 && (
                <Section title="ELO RATING HISTORY">
                  {(() => {
                    const hist = a.eloHistory;
                    const min = Math.min(...hist);
                    const max = Math.max(...hist);
                    const range = Math.max(1, max - min);
                    return (
                      <>
                        <View style={styles.eloChart}>
                          {hist.map((e, i) => {
                            const h = ((e - min) / range) * 100;
                            return (
                              <View key={i} style={styles.eloBarCol}>
                                <View style={[styles.eloBar, {
                                  height: `${Math.max(4, h)}%`,
                                }]} />
                              </View>
                            );
                          })}
                        </View>
                        <View style={styles.distFooter}>
                          <Text style={styles.distFooterText}>Race 1 ({hist[0]})</Text>
                          <Text style={styles.distFooterText}>
                            Race {hist.length} ({hist[hist.length - 1]})
                          </Text>
                        </View>
                      </>
                    );
                  })()}
                </Section>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const CARD = {
  backgroundColor: Colors.whiteAlpha07,
  borderWidth: 2,
  borderColor: Colors.whiteAlpha10,
  borderRadius: BorderRadius.md,
} as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTag: { fontFamily: Fonts.display, fontSize: 11, color: Colors.whiteAlpha25, letterSpacing: 2 },

  /* Hero */
  hero: {
    ...CARD,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 14,
  },
  heroName: { fontFamily: Fonts.display, fontSize: 24, color: Colors.white },
  heroSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha40, marginTop: 2 },
  eloBadge: {
    backgroundColor: Colors.yellowAlpha15,
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  eloLabel: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.whiteAlpha40, letterSpacing: 1 },
  eloValue: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow },

  emptyCard: { ...CARD, padding: 18 },
  emptyText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha50, lineHeight: 19, textAlign: 'center' },

  /* Section */
  section: { ...CARD, padding: 14, marginBottom: 12 },
  sectionTitle: {
    fontFamily: Fonts.display, fontSize: 12, color: Colors.whiteAlpha50,
    letterSpacing: 1.5, marginBottom: 10,
  },

  /* Metric grid */
  metricRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metric: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: BorderRadius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricVal: { fontFamily: Fonts.display, fontSize: 18, color: Colors.white },
  metricLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: Colors.whiteAlpha35, letterSpacing: 0.4, marginTop: 3, textAlign: 'center' },

  /* Percentile bars */
  pctlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pctlLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.whiteAlpha50, width: 72 },
  pctlTrack: { flex: 1, height: 8, backgroundColor: Colors.whiteAlpha07, borderRadius: 4, overflow: 'hidden', justifyContent: 'center' },
  pctlFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  pctlMarker: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: Colors.whiteAlpha25 },
  pctlVal: { fontFamily: Fonts.bodyBold, fontSize: 10, width: 34, textAlign: 'right' },

  /* Position-by-stage */
  stageRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  stageCol: { alignItems: 'center', flex: 1 },
  stageBarTrack: { width: 18, height: 64, backgroundColor: Colors.whiteAlpha07, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  stageBarFill: { width: '100%', borderRadius: 4 },
  stageVal: { fontFamily: Fonts.bodyBold, fontSize: 11, color: Colors.white, marginTop: 4 },
  stageLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: Colors.whiteAlpha25, marginTop: 1 },

  /* Finish distribution */
  distRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 },
  distCol: { alignItems: 'center', flex: 1 },
  distBarTrack: { width: 16, height: 70, backgroundColor: Colors.whiteAlpha07, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  distBarFill: { width: '100%', borderRadius: 3 },
  distLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 8, color: Colors.whiteAlpha35, marginTop: 3 },
  distFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  distFooterText: { fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.whiteAlpha40 },

  /* Form trend */
  miniLabel: { fontFamily: Fonts.bodyBold, fontSize: 8, color: Colors.whiteAlpha25, letterSpacing: 0.5, marginTop: 4, marginBottom: 6 },
  trendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  trendDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  trendDotText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.white },

  /* Theme table */
  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.whiteAlpha10 },
  thCell: { flex: 1, fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.whiteAlpha35, letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tdCell: { flex: 1 },
  tdText: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha70 },
  themeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },

  /* ELO history chart */
  eloChart: { flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 2, marginBottom: 6 },
  eloBarCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  eloBar: { width: '100%', backgroundColor: Colors.yellow, borderRadius: 2, minWidth: 2 },
});
