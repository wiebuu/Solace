import { useEffect, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import RNMaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { T, Tap } from './ui';
import { useSession } from '@/lib/session';
import { useSpokenLine, useSpokenWord } from '@/lib/voice';
import { emitTabReselect } from '@/lib/tabEvents';
import { fonts, makeStyles, shadow, useTheme } from '@/lib/theme';

// The package's class typings predate React 19's JSX types; this is the part we use.
const MaskedView = RNMaskedView as unknown as ComponentType<{ style?: StyleProp<ViewStyle>; maskElement: ReactElement; children?: ReactNode }>;

const ICONS: Record<string, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; label: string }> = {
  index: { on: 'sunny', off: 'sunny-outline', label: 'Today' },
  reminders: { on: 'alarm', off: 'alarm-outline', label: 'Reminders' },
  journey: { on: 'leaf', off: 'leaf-outline', label: 'Journey' },
  profile: { on: 'person-circle', off: 'person-circle-outline', label: 'You' },
};

export const TAB_BAR_SPACE = 104;
/** How far Sol's seat rises above the bar. */
const SEAT_RISE = 30;

function Item({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const s = useStyles();
  const cfg = ICONS[name];
  const pill = useAnimatedStyle(() => ({ opacity: withTiming(focused ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) }), transform: [{ scale: withTiming(focused ? 1 : 0.92, { duration: 260, easing: Easing.out(Easing.cubic) }) }] }));
  return (
    <Tap onPress={onPress} style={s.item} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={cfg.label}>
      <Animated.View style={[s.pill, pill]} />
      <Ionicons name={focused ? cfg.on : cfg.off} size={24} color={focused ? colors.ink : colors.inkMuted} />
    </Tap>
  );
}

/**
 * Minimised Sol's words, in step with its voice: the sentence being spoken, with the current
 * word highlighted and the line gliding so it stays in view, on a soft band whose sides fade out.
 */
function Caption() {
  const s = useStyles();
  const { colors } = useTheme();
  const session = useSession();
  const line = useSpokenLine();
  const { width } = useWindowDimensions();
  const boxW = width - 32;
  const words = line ? line.text.split(/\s+/) : [];
  // Which word Sol is on, from the first frame of each piece (no catching up).
  const current = useSpokenWord(line);
  const offsets = useRef<number[]>([]);
  const x = useSharedValue(boxW * 0.35);
  const lineKey = line?.id;
  useEffect(() => {
    offsets.current = [];
    x.set(boxW * 0.35);
  }, [lineKey, boxW, x]);

  // Keep the spoken word a little left of centre, gliding smoothly between words.
  useEffect(() => {
    const at = offsets.current[current];
    if (at === undefined) return;
    x.set(withTiming(Math.min(boxW * 0.35, boxW * 0.4 - at), { duration: 280, easing: Easing.out(Easing.cubic) }));
  }, [current, boxW, x]);
  const glide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (session.view !== 'mini' || !line) return null;
  const fade = (
    <LinearGradient
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      colors={['transparent', 'black', 'black', 'transparent']}
      locations={[0, 0.18, 0.82, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(320)} pointerEvents="none" style={[s.caption, { width: boxW }]}>
      <MaskedView style={StyleSheet.absoluteFill} maskElement={fade}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        <Animated.View key={line.id} style={[s.tickerRow, glide]}>
          {words.map((w, i) => (
            <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.x)}>
              <T style={[s.captionWord, { color: i === current ? colors.primary : i < current ? colors.ink : colors.inkMuted }]}>{w} </T>
            </View>
          ))}
        </Animated.View>
      </MaskedView>
    </Animated.View>
  );
}

/** Floating tab bar with Sol in the middle: one tap to talk from anywhere. */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { dark } = useTheme();
  const s = useStyles();
  const session = useSession();
  const items = state.routes.map((route, i) => (
    <Item key={route.key} name={route.name} focused={state.index === i} onPress={() => (state.index === i ? emitTabReselect(route.name) : navigateToTab(route.key))} />
  ));
  return (
    // The container reaches up to include Sol's seat: iOS only delivers taps inside a view's
    // bounds, so a seat poking out above the bar couldn't be tapped. Empty space passes through.
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={s.barShadow}>
        <BlurView intensity={40} tint={dark ? 'dark' : 'light'} style={s.bar}>
          {items.slice(0, 2)}
          <View style={{ width: 76 }} />
          {items.slice(2)}
        </BlurView>
      </View>
      <Caption />
      {/* Sol itself is drawn here by SolLayer; this is its seat and touch target. */}
      <Tap
        onPress={session.openTalking}
        onLongPress={session.view === 'closed' ? () => session.talk() : session.close}
        delayLongPress={380}
        style={s.orbBtn}
        scaleTo={0.94}
        feedback="medium"
        accessibilityLabel={session.view === 'mini' ? 'Open Sol' : 'Talk to Sol'}
        accessibilityHint={session.view === 'closed' ? 'Long press to open the full page' : 'Long press to end the chat'}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { position: 'absolute', left: 16, right: 16, paddingTop: SEAT_RISE },
  barShadow: { borderRadius: 30, ...shadow, shadowOpacity: 0.14 },
  bar: { flexDirection: 'row', borderRadius: 30, overflow: 'hidden', backgroundColor: c.overlay, paddingVertical: 8, paddingHorizontal: 6, borderWidth: 1, borderColor: c.line },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 52 },
  pill: { position: 'absolute', top: 2, bottom: 2, left: 4, right: 4, borderRadius: 22, backgroundColor: c.primarySoft },
  caption: { position: 'absolute', bottom: 120, alignSelf: 'center', height: 40 },
  // Wide enough that the line never wraps; it's moved, not squeezed.
  tickerRow: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 20000, flexDirection: 'row', alignItems: 'center' },
  captionWord: { fontFamily: fonts.medium, fontSize: 16 },
  orbBtn: { position: 'absolute', left: '50%', marginLeft: -42, top: SEAT_RISE - 26, width: 84, height: 84, borderRadius: 42, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.line, ...shadow, shadowOpacity: 0.2 },
}));
