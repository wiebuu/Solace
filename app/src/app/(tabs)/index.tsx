import { useCallback, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { StyleSheet, View, type ScrollView } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { MoodFace } from '@/components/MoodFace';
import { PageLoader, SolMark, useSolRefresh } from '@/components/SolMark';
import { TAB_BAR_SPACE } from '@/components/TabBar';
import { Backdrop, Button, Card, Section, T, Tap } from '@/components/ui';
import { api, type HomeData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { greeting, moodByKey, MOODS } from '@/lib/moods';
import { syncReminders } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { useTabReselect } from '@/lib/tabEvents';
import { fonts, makeStyles, radius, tint, useTheme } from '@/lib/theme';

const QUICK: { label: string; icon: keyof typeof Ionicons.glyphMap; href: Href | null }[] = [
  { label: 'Check in', icon: 'happy-outline', href: '/checkin' },
  { label: 'Reflect', icon: 'moon-outline', href: null },
  { label: 'Breathe', icon: 'leaf-outline', href: '/breathe' },
  { label: 'Ground', icon: 'hand-left-outline', href: '/grounding' },
];
const formatDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export default function Home() {
  const insets = useSafeAreaInsets();
  const { colors, gradients, dark } = useTheme();
  const s = useStyles();
  const { user } = useAuth();
  const session = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const syncedFor = useRef('');

  const load = useCallback(async () => {
    try {
      const home = await api.get<HomeData>('/home');
      setData(home);
      setError('');
      // Once a day, put today's personalised affirmation into the morning reminder.
      if (user && syncedFor.current !== home.today) {
        syncedFor.current = home.today;
        syncReminders(user.reminders, { affirmation: home.daily.affirmation }).catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);
  const refresh = useSolRefresh(load);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useTabReselect('index', () => {
    scroller.current?.scrollTo({ y: 0, animated: true });
    refresh.trigger();
  });

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const completeChallenge = async () => {
    if (!data || data.daily.challengeDone) return;
    haptic.success();
    setData({ ...data, daily: { ...data.daily, challengeDone: true } });
    await api.post('/activities', { kind: 'challenge', meta: { text: data.daily.challenge } }).catch(() => {});
    load();
  };

  const mood = moodByKey(data?.todayMood?.mood);
  const heavy = mood?.key === 'low' || mood?.key === 'struggling';

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <Animated.ScrollView
        ref={scroller}
        {...refresh.scrollProps}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + TAB_BAR_SPACE + 24, paddingHorizontal: 20, gap: 26 }}
        showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <T variant="label">{data ? formatDate(data.today) : ' '}</T>
          <Tap onPress={() => router.push('/journey')} style={s.streak} accessibilityLabel={`${data?.streak ?? 0} day streak`}>
            <Ionicons name="flame" size={14} color={colors.primary} />
            <T style={s.streakText}>{data?.streak ?? 0} day{data?.streak === 1 ? '' : 's'}</T>
          </Tap>
        </View>

        {/* Hero: a calm greeting with the Solace mark, and two clear ways in. */}
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroMark} pointerEvents="none">
            <SolMark size={230} spin={0.12} />
          </View>
          <View style={s.heroText}>
            <T variant="label" style={{ color: colors.primary }}>Sol is here</T>
            <T style={s.heroTitle}>{greeting(user?.name.split(' ')[0] ?? '')}</T>
            <T style={{ color: colors.inkSoft }}>
              {!data?.todayMood ? 'How are you arriving today?' : heavy ? 'Today feels heavy. I’m right here.' : 'Glad today feels lighter. Tell me about it?'}
            </T>
          </View>
          <View style={s.heroActions}>
            <Tap onPress={() => session.talk({ mood: data?.todayMood?.mood })} style={[s.heroBtn, { backgroundColor: colors.ink }]} scaleTo={0.97} feedback="medium" accessibilityLabel="Talk to Sol">
              <Ionicons name="mic" size={19} color={colors.onButton} />
              <T style={[s.heroBtnText, { color: colors.onButton }]}>Talk</T>
            </Tap>
            <Tap onPress={() => session.talk({ mode: 'text' })} style={[s.heroBtn, s.heroBtnAlt]} scaleTo={0.97} accessibilityLabel="Type to Sol">
              <MaterialCommunityIcons name="keyboard-outline" size={21} color={colors.ink} />
              <T style={s.heroBtnText}>Type</T>
            </Tap>
          </View>
        </LinearGradient>

        <View style={s.quick}>
          {QUICK.map((q) => (
            <Tap key={q.label} onPress={() => (q.href ? router.push(q.href) : session.talk({ reflection: true }))} style={s.quickItem} accessibilityLabel={q.label}>
              <View style={s.quickIcon}>
                <Ionicons name={q.icon} size={21} color={colors.ink} />
              </View>
              <T style={s.quickLabel}>{q.label}</T>
            </Tap>
          ))}
        </View>

        {!data && !error ? <PageLoader label="Gathering your day…" /> : null}
        {error ? (
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <T style={{ textAlign: 'center' }}>{error}</T>
            <Button title="Try again" kind="ghost" size="sm" onPress={load} />
          </Card>
        ) : null}

        {data && (
          <Animated.View entering={FadeIn.duration(400)} style={{ gap: 26 }}>
            <Section title="Check-in" action={data.todayMood ? 'Check in again' : 'Say it to Sol'} onAction={() => router.push('/checkin')}>
              <Card style={{ backgroundColor: mood ? tint(mood.color, dark) : colors.surface, gap: 14 }}>
                {data.todayMood && mood ? (
                  <View style={s.rowCenter}>
                    <MoodFace mood={mood.key} size={46} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T variant="heading" style={{ fontFamily: fonts.display, fontSize: 19 }}>Feeling {mood.label.toLowerCase()}</T>
                      {data.daily.insight ? <T variant="caption" style={{ color: colors.inkSoft }}>{data.daily.insight}</T> : null}
                    </View>
                  </View>
                ) : (
                  <View style={s.moodRow}>
                    {MOODS.map((m) => (
                      <Tap key={m.key} onPress={() => router.push(`/checkin?mood=${m.key}`)} style={s.moodItem} accessibilityLabel={m.label} scaleTo={0.92}>
                        <MoodFace mood={m.key} size={42} />
                        <T style={s.moodLabel}>{m.label}</T>
                      </Tap>
                    ))}
                  </View>
                )}
              </Card>
            </Section>

            <Section title="For today">
              <Tap onPress={() => router.push('/affirmation')} scaleTo={0.99}>
                <LinearGradient colors={gradients.deep} style={s.affirm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <View style={s.rowBetween}>
                    <T variant="label" style={{ color: colors.onDeepSoft }}>Affirmation</T>
                    <Ionicons name="volume-medium-outline" size={16} color={colors.onDeepSoft} />
                  </View>
                  <T variant="quote" style={{ color: colors.onDeep }}>“{data.daily.affirmation}”</T>
                </LinearGradient>
              </Tap>
              <Tap onPress={completeChallenge} scaleTo={0.99} feedback="none">
                <Card active={data.daily.challengeDone} style={s.rowCenter}>
                  <View style={[s.check, data.daily.challengeDone && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    {data.daily.challengeDone && <Ionicons name="checkmark" size={16} color={colors.onPrimary} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="label">Tiny challenge</T>
                    <T variant="bodyStrong" style={data.daily.challengeDone && { color: colors.inkSoft }}>{data.daily.challenge}</T>
                  </View>
                </Card>
              </Tap>
            </Section>

            <Section title="This week" action={`${data.totals.mindfulMinutes} mindful min`} onAction={() => router.push('/journey')}>
              <Card style={s.week}>
                {data.week.map((d) => {
                  const isToday = d.day === data.today;
                  return (
                    <View key={d.day} style={{ alignItems: 'center', gap: 8 }}>
                      <View style={[s.weekDot, d.active && { backgroundColor: colors.primary }, isToday && !d.active && { borderWidth: 1.5, borderColor: colors.primary }]}>
                        {d.active && <Ionicons name="checkmark" size={13} color={colors.onPrimary} />}
                      </View>
                      <T variant="caption" style={isToday && { color: colors.ink, fontFamily: fonts.bold }}>
                        {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                      </T>
                    </View>
                  );
                })}
              </Card>
            </Section>
          </Animated.View>
        )}
      </Animated.ScrollView>
      {refresh.indicator}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -10 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.surface, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
  streakText: { fontFamily: fonts.bold, color: c.ink, fontSize: 13 },
  hero: { borderRadius: 28, overflow: 'hidden', padding: 22, gap: 22 },
  heroMark: { position: 'absolute', right: -64, top: -40, opacity: 0.55 },
  heroText: { width: '70%', gap: 8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: c.ink },
  heroActions: { flexDirection: 'row', gap: 10 },
  heroBtn: { flex: 1, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroBtnAlt: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  heroBtnText: { fontFamily: fonts.bold, fontSize: 15.5, color: c.ink },
  quick: { flexDirection: 'row', justifyContent: 'space-between' },
  quickItem: { alignItems: 'center', gap: 8, width: '23%' },
  quickIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  quickLabel: { fontSize: 12.5, fontFamily: fonts.medium, color: c.inkSoft },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodItem: { alignItems: 'center', gap: 6 },
  moodLabel: { fontSize: 11.5, fontFamily: fonts.medium, color: c.inkSoft },
  affirm: { borderRadius: 22, padding: 20, gap: 12 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: c.inkMuted, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
}));
