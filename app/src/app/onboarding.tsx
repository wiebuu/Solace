import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SolOrb, type OrbState } from '@/components/SolOrb';
import { Backdrop, Button, T, Tap } from '@/components/ui';
import { KEYS, prefs } from '@/lib/storage';
import { fonts, useTheme } from '@/lib/theme';

const SLIDES: { title: string; body: string; state: OrbState }[] = [
  { title: 'Hi, I’m Sol.', body: 'Not a chatbot. A warm voice you can simply talk to, about anything, any time. I listen, remember what matters, and grow with you.', state: 'speaking' },
  { title: 'Just talk. I’ll take care of the rest.', body: 'Check-ins, reminders, even setting up your space. Tell me out loud and I’ll fill everything in. You can always do it by hand too.', state: 'listening' },
  { title: 'Small rituals, real change', body: 'Breathing, grounding and kind affirmations shaped around your day, with gentle reminders that never nag.', state: 'idle' },
];

function Dot({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const style = useAnimatedStyle(() => ({ width: withTiming(active ? 26 : 8, { duration: 260, easing: Easing.out(Easing.cubic) }), backgroundColor: active ? colors.ink : colors.line }));
  return <Animated.View style={[styles.dot, style]} />;
}

export default function Onboarding() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList>(null);
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }, []);

  const finish = async (to: '/sign-up' | '/sign-in') => {
    await prefs.set(KEYS.onboardingSeen, '1');
    router.replace(to);
  };
  const next = () => (index < SLIDES.length - 1 ? list.current?.scrollToIndex({ index: index + 1 }) : finish('/sign-up'));

  return (
    <View style={{ flex: 1 }}>
      <Backdrop />
      <View style={[styles.skip, { top: insets.top + 8 }]}>
        <Tap onPress={() => finish('/sign-in')} hitSlop={12}>
          <T variant="caption" style={{ fontFamily: fonts.bold, color: colors.inkSoft }}>I have an account</T>
        </Tap>
      </View>
      <FlatList
        ref={list}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width, paddingTop: insets.top + 40 }]}>
            <SolOrb size={260} state={i === index ? item.state : 'idle'} />
            {i === index && (
              <Animated.View entering={FadeInDown.duration(600)} style={{ gap: 14, alignItems: 'center' }}>
                <T variant="hero" style={{ textAlign: 'center' }}>{item.title}</T>
                <T style={{ textAlign: 'center', fontSize: 16.5, lineHeight: 25 }}>{item.body}</T>
              </Animated.View>
            )}
          </View>
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.title} active={i === index} />
          ))}
        </View>
        <Button title={index === SLIDES.length - 1 ? 'Begin my journey' : 'Continue'} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skip: { position: 'absolute', right: 24, zIndex: 2 },
  slide: { alignItems: 'center', paddingHorizontal: 32, gap: 20 },
  footer: { paddingHorizontal: 24, gap: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
});
