import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SolMark } from './SolMark';
import { Tap } from './ui';
import { haptic } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

const SIZE = 40;

/**
 * Sol's switch inside an exercise: a little Sol mark. Off, it rests faded; on, it glows and turns
 * slowly. Exercises never turn Sol on by themselves: Sol only guides here once this is tapped.
 */
export function SolToggle({ onDeep = false }: { onDeep?: boolean }) {
  const session = useSession();
  const theme = useTheme();
  const on = session.view !== 'closed';
  // A solid disc so the mark reads on any background: soft when off, the theme colour when on.
  const glow = useAnimatedStyle(() => ({ opacity: withTiming(on ? 0.45 : 0, { duration: 350 }), transform: [{ scale: withTiming(on ? 1.35 : 0.9, { duration: 350 }) }] }));
  const mark = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0.85, { duration: 350 }) }));
  const disc = on ? theme.colors.primary : onDeep ? 'rgba(255,255,255,0.92)' : theme.colors.surface;
  return (
    <Tap
      onPress={() => {
        haptic.soft();
        if (on) session.close();
        else session.ensureOn();
      }}
      hitSlop={10}
      scaleTo={0.9}
      feedback="none"
      style={styles.wrap}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={on ? 'Turn Sol off' : 'Turn Sol on'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.glow, { backgroundColor: theme.orb.glow }, glow]} />
      <View style={[StyleSheet.absoluteFill, styles.disc, { backgroundColor: disc, borderColor: on ? theme.colors.primary : theme.colors.line }]} />
      <Animated.View style={mark}>
        <View pointerEvents="none">
          <SolMark size={SIZE - 12} spin={on ? 1 : 0} tint={on ? theme.colors.white : undefined} />
        </View>
      </Animated.View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  glow: { borderRadius: SIZE / 2 },
  disc: { borderRadius: SIZE / 2, borderWidth: 1 },
});
