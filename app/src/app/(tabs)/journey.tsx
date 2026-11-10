import { useCallback, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import type { ScrollView } from 'react-native';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';
import { MoodFace } from '@/components/MoodFace';
import { PageLoader, useSolRefresh } from '@/components/SolMark';
import { SolOrb } from '@/components/SolOrb';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import { Backdrop, Button, Card, T } from '@/components/ui';
import { api, type HomeData, type Insights } from '@/lib/api';
import { useTabReselect } from '@/lib/tabEvents';
import { MOODS, moodByKey, type MoodLevel } from '@/lib/moods';
import { fonts, makeStyles, radius, useTheme } from '@/lib/theme';

const SCORE_TO_MOOD: MoodLevel[] = ['struggling', 'struggling', 'low', 'okay', 'good', 'radiant'];

function Bar({ score, index, label, isToday }: { score: number | null; index: number; label: string; isToday: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const h = score ? (score / 5) * 120 : 6;
  const mood = score ? SCORE_TO_MOOD[Math.round(score)] : null;
  const style = useAnimatedStyle(() => ({ height: withDelay(index * 60, withTiming(h, { duration: 600, easing: Easing.out(Easing.cubic) })) }));
  return (
    <View style={styles.barCol}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.bar, { backgroundColor: mood ? moodByKey(mood)!.color : colors.line }, style]} />
      </View>
      <T variant="caption" style={isToday && { color: colors.ink, fontFamily: fonts.bold }}>{label}</T>
    </View>
  );
}

const ACHIEVEMENTS = [
  { id: 'first', title: 'First step', desc: 'Your first check-in', icon: 'footsteps-outline', test: (i: Insights, h: HomeData) => i.total >= 1 || h.streak > 0 },
  { id: 'streak3', title: 'Gentle rhythm', desc: '3-day streak', icon: 'flame-outline', test: (_: Insights, h: HomeData) => h.streak >= 3 },
  { id: 'streak7', title: 'A week of you', desc: '7-day streak', icon: 'sunny-outline', test: (_: Insights, h: HomeData) => h.streak >= 7 },
  { id: 'checkins10', title: 'Self-aware', desc: '10 check-ins', icon: 'eye-outline', test: (i: Insights) => i.total >= 10 },
  { id: 'breath', title: 'Breath keeper', desc: 'Breathing this week', icon: 'leaf-outline', test: (_: Insights, h: HomeData) => h.totals.sessions >= 1 },
  { id: 'minutes', title: 'Mindful 15', desc: '15 minutes this week', icon: 'hourglass-outline', test: (_: Insights, h: HomeData) => h.totals.mindfulMinutes >= 15 },
] as const;

export default function Journey() {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [home, setHome] = useState<HomeData | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.get<Insights>('/moods/insights'), api.get<HomeData>('/home')])
        .then(([i, h]) => {
          setInsights(i);
          setHome(h);
        })
        .catch(() => {}),
    [],
  );
  const refresh = useSolRefresh(load);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useTabReselect('journey', () => {
    scroller.current?.scrollTo({ y: 0, animated: true });
    refresh.trigger();
  });
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const bestTag = insights?.tags.filter((t) => t.count >= 2).sort((a, b) => b.avg - a.avg)[0];
  const hardTag = insights?.tags.filter((t) => t.count >= 2).sort((a, b) => a.avg - b.avg)[0];
  const avgMood = insights?.average ? moodByKey(SCORE_TO_MOOD[Math.round(insights.average)]) : null;

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <Animated.ScrollView
        ref={scroller}
        {...refresh.scrollProps}
        contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_SPACE + 12, gap: 18 }}
        showsVerticalScrollIndicator={false}>
        <T variant="title">Your journey</T>
        {!insights ? <PageLoader label="Reading your patterns…" /> : null}

        <Animated.View entering={FadeInDown.duration(500)} style={styles.stats}>
          {[
            { label: 'Day streak', value: home?.streak ?? 0, icon: 'flame' as const, color: colors.primary },
            { label: 'Mindful min', value: home?.totals.mindfulMinutes ?? 0, icon: 'leaf' as const, color: colors.sage },
            { label: 'Check-ins', value: insights?.total ?? 0, icon: 'happy' as const, color: colors.primary },
          ].map((s) => (
            <Card key={s.label} style={styles.stat}>
              <Ionicons name={s.icon} size={18} color={s.color} />
              <T style={styles.statValue}>{s.value}</T>
              <T variant="caption">{s.label}</T>
            </Card>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Card style={{ gap: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T variant="heading">Mood this week</T>
              {avgMood && <T variant="caption">Mostly {avgMood.label.toLowerCase()}</T>}
            </View>
            <View style={styles.chart}>
              {(insights?.week ?? Array.from({ length: 7 }, (_, i) => ({ day: String(i), score: null }))).map((d, i, arr) => (
                <Bar
                  key={d.day}
                  index={i}
                  score={d.score}
                  isToday={i === arr.length - 1}
                  label={d.day.length === 10 ? new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' }) : ''}
                />
              ))}
            </View>
          </Card>
        </Animated.View>

        {insights && insights.total === 0 ? (
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <SolOrb size={110} state="listening" />
            <T style={{ textAlign: 'center' }}>Check in a few times and Sol will start noticing what lifts you up and what weighs you down.</T>
            <Button title="Check in now" onPress={() => router.push('/checkin')} style={{ alignSelf: 'stretch' }} />
          </Card>
        ) : (
          <>
            {(bestTag || hardTag) && (
              <Animated.View entering={FadeInDown.delay(140).duration(500)}>
                <Card tint={gradients.calm} style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <SolOrb size={56} state="thinking" />
                    <T variant="heading">Sol noticed</T>
                  </View>
                  {bestTag && (
                    <T style={{ color: colors.ink }}>
                      You tend to feel your best on days involving <T style={styles.em}>{bestTag.tag.toLowerCase()}</T>.
                    </T>
                  )}
                  {hardTag && hardTag.tag !== bestTag?.tag && (
                    <T style={{ color: colors.ink }}>
                      <T style={styles.em}>{hardTag.tag}</T> shows up on heavier days. Be extra gentle with yourself there.
                    </T>
                  )}
                </Card>
              </Animated.View>
            )}

            <Card style={{ gap: 14 }}>
              <T variant="heading">Last 30 days</T>
              {MOODS.map((m) => {
                const count = insights?.distribution[m.key] ?? 0;
                const pct = insights?.total ? count / insights.total : 0;
                return (
                  <View key={m.key} style={styles.distRow}>
                    <MoodFace mood={m.key} size={28} />
                    <View style={styles.distTrack}>
                      <View style={[styles.distFill, { width: `${Math.max(pct * 100, 2)}%`, backgroundColor: m.color }]} />
                    </View>
                    <T variant="caption" style={{ width: 24, textAlign: 'right' }}>{count}</T>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        <View style={{ gap: 12 }}>
          <T variant="heading">Milestones</T>
          <View style={styles.badges}>
            {ACHIEVEMENTS.map((a) => {
              const unlocked = insights && home ? a.test(insights, home) : false;
              return (
                <Card key={a.id} style={[styles.badge, !unlocked && { opacity: 0.5 }]}>
                  <View style={[styles.badgeIcon, { backgroundColor: unlocked ? colors.sunSoft : colors.surfaceSoft }]}>
                    <Ionicons name={unlocked ? a.icon : 'lock-closed-outline'} size={20} color={unlocked ? colors.ink : colors.inkMuted} />
                  </View>
                  <T variant="bodyStrong" style={{ fontSize: 14, textAlign: 'center' }}>{a.title}</T>
                  <T variant="caption" style={{ textAlign: 'center', fontSize: 12 }}>{a.desc}</T>
                </Card>
              );
            })}
          </View>
        </View>
      </Animated.ScrollView>
      {refresh.indicator}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 2, padding: 14 },
  statValue: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, lineHeight: 32 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 150 },
  barCol: { alignItems: 'center', gap: 8, flex: 1 },
  barTrack: { height: 120, justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 11 },
  em: { fontFamily: fonts.bold, color: colors.ink },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surfaceSoft, overflow: 'hidden' },
  distFill: { height: 10, borderRadius: 5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, padding: 14, borderRadius: radius.md },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
}));
